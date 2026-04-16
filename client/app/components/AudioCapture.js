"use client";
import { useState, useEffect, useRef, useCallback } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

export default function AudioCapture({ onTranscriptUpdate, provider, apiKey, baseUrl }) {
  const [isListening, setIsListening] = useState(false);
  const [mode, setMode] = useState("system"); // "system" | "mic"
  const [volume, setVolume] = useState(0);
  const [status, setStatus] = useState("Ready");
  const [error, setError] = useState("");
  const [transcribing, setTranscribing] = useState(false);

  const streamRef = useRef(null);
  const recorderRef = useRef(null);
  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const rafRef = useRef(null);
  const listeningRef = useRef(false);
  const timerRef = useRef(null);
  const recognitionRef = useRef(null);

  // ── Volume meter ──────────────────────────────────────────────────────────
  const startMeter = useCallback((stream) => {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    ctx.createMediaStreamSource(stream).connect(analyser);
    audioCtxRef.current = ctx;
    analyserRef.current = analyser;

    const tick = () => {
      const arr = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(arr);
      setVolume(arr.reduce((a, b) => a + b, 0) / arr.length / 255);
      rafRef.current = requestAnimationFrame(tick);
    };
    tick();
  }, []);

  // ── API-based transcription (for system audio) ────────────────────────────
  const transcribeViaAPI = useCallback(
    async (blob) => {
      if (!apiKey || blob.size < 1000) return;
      try {
        setTranscribing(true);
        const buf = await blob.arrayBuffer();
        const b64 = btoa(new Uint8Array(buf).reduce((s, b) => s + String.fromCharCode(b), ""));
        const res = await fetch(`${API_BASE}/api/transcribe`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ provider, apiKey, baseUrl, audio: b64 }),
        });
        const data = await res.json();
        if (data.error) {
          if (/api.?key|incorrect|unauthorized|401/i.test(data.error)) setError("Invalid API key for transcription.");
          return;
        }
        if (data.text?.trim()) onTranscriptUpdate("Interviewer: " + data.text.trim());
      } catch (e) {
        console.error("Transcription failed:", e);
      } finally {
        setTranscribing(false);
      }
    },
    [apiKey, baseUrl, provider, onTranscriptUpdate]
  );

  // ── MediaRecorder cycle (for system audio mode) ───────────────────────────
  const startRecorder = useCallback(
    (stream) => {
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm";
      const recorder = new MediaRecorder(stream, { mimeType: mime, audioBitsPerSecond: 64000 });
      let chunks = [];

      recorder.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
      recorder.onstop = () => {
        if (chunks.length) transcribeViaAPI(new Blob(chunks, { type: mime }));
        chunks = [];
      };

      recorderRef.current = recorder;

      const cycle = () => {
        if (!listeningRef.current) return;
        chunks = [];
        try {
          recorder.start();
        } catch {
          return;
        }
        timerRef.current = setTimeout(() => {
          if (recorder.state === "recording") {
            recorder.stop();
            setTimeout(cycle, 200);
          }
        }, 5000);
      };
      cycle();
    },
    [transcribeViaAPI]
  );

  // ── Start system audio capture ────────────────────────────────────────────
  const startSystemAudio = async () => {
    setError("");
    setStatus("Requesting system audio...");

    if (!navigator.mediaDevices?.getDisplayMedia) {
      setError("System audio capture requires HTTPS or localhost in a supported browser (Chrome/Edge).");
      setStatus("Ready");
      return;
    }

    try {
      const raw = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });

      if (!raw.getAudioTracks().length) {
        raw.getTracks().forEach((t) => t.stop());
        throw new Error('No audio captured. Make sure to check "Share system audio" in the picker.');
      }

      raw.getVideoTracks().forEach((t) => t.stop());
      const stream = new MediaStream(raw.getAudioTracks());
      streamRef.current = stream;
      listeningRef.current = true;

      startMeter(stream);
      startRecorder(stream);

      setIsListening(true);
      setStatus("Capturing system audio");
      onTranscriptUpdate("[System audio capture started]");
    } catch (e) {
      setError(e.name === "NotAllowedError" ? "Screen share was denied." : e.message);
      setStatus("Ready");
    }
  };

  // ── Start microphone with Web Speech API ──────────────────────────────────
  const startMicSpeech = async () => {
    setError("");

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError("Web Speech API not supported. Use Chrome or Edge.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices?.getUserMedia({ audio: true });
      streamRef.current = stream;
      startMeter(stream);
    } catch {
      // Meter is optional, continue without it
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = "en-US";

    recognition.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          const text = event.results[i][0].transcript.trim();
          if (text) onTranscriptUpdate("Interviewer: " + text);
        }
      }
    };

    recognition.onerror = (event) => {
      if (event.error !== "no-speech" && event.error !== "aborted") {
        setError(`Speech recognition error: ${event.error}`);
      }
    };

    recognition.onend = () => {
      if (listeningRef.current) {
        try { recognition.start(); } catch {}
      }
    };

    recognitionRef.current = recognition;
    listeningRef.current = true;
    recognition.start();

    setIsListening(true);
    setStatus("Listening via microphone");
    onTranscriptUpdate("[Microphone listening started]");
  };

  // ── Start ─────────────────────────────────────────────────────────────────
  const start = () => {
    if (mode === "system") {
      if (!apiKey && provider !== "ollama") {
        setError("System audio mode requires an API key for transcription. Use microphone mode for free transcription.");
        return;
      }
      startSystemAudio();
    } else {
      startMicSpeech();
    }
  };

  // ── Stop ──────────────────────────────────────────────────────────────────
  const stop = () => {
    listeningRef.current = false;
    setIsListening(false);
    clearTimeout(timerRef.current);

    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch {}
      recognitionRef.current = null;
    }
    if (recorderRef.current?.state === "recording") {
      try { recorderRef.current.stop(); } catch {}
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    if (audioCtxRef.current?.state !== "closed") {
      audioCtxRef.current?.close().catch(() => {});
    }
    cancelAnimationFrame(rafRef.current);
    setVolume(0);
    setStatus("Ready");
    onTranscriptUpdate("[Listening stopped]");
  };

  // ── Cleanup on unmount ────────────────────────────────────────────────────
  useEffect(
    () => () => {
      listeningRef.current = false;
      clearTimeout(timerRef.current);
      if (recognitionRef.current) try { recognitionRef.current.stop(); } catch {}
      if (recorderRef.current?.state === "recording") try { recorderRef.current.stop(); } catch {}
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (audioCtxRef.current?.state !== "closed") audioCtxRef.current?.close().catch(() => {});
      cancelAnimationFrame(rafRef.current);
    },
    []
  );

  // ── Manual question entry ─────────────────────────────────────────────────
  const [manualInput, setManualInput] = useState("");
  const [showManualInput, setShowManualInput] = useState(false);
  const manualInputRef = useRef(null);

  const submitManualInput = () => {
    if (manualInput.trim()) {
      onTranscriptUpdate("Interviewer: " + manualInput.trim());
      setManualInput("");
      setShowManualInput(false);
    }
  };

  useEffect(() => {
    if (showManualInput) manualInputRef.current?.focus();
  }, [showManualInput]);

  return (
    <div className="bg-gray-900 rounded-lg border border-gray-800 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <div className="flex items-center gap-3">
          <h2 className="font-semibold text-gray-200">Audio Capture</h2>
          {transcribing && <span className="text-xs text-amber-400 animate-pulse">Transcribing...</span>}
        </div>
        <div className="flex items-center gap-2">
          <span className={`w-2.5 h-2.5 rounded-full ${isListening ? "bg-green-500 animate-pulse" : "bg-gray-600"}`} />
          <span className="text-xs text-gray-400">{status}</span>
        </div>
      </div>

      <div className="p-4 space-y-3">
        {/* ── Mode toggle ──────────────────────────────────────────────── */}
        <div className="flex gap-2">
          <button
            onClick={() => !isListening && setMode("mic")}
            className={`flex-1 py-2 px-3 rounded-lg text-sm border transition-all ${
              mode === "mic"
                ? "border-emerald-500 bg-emerald-900/20 text-emerald-300"
                : "border-gray-700 bg-gray-800/50 text-gray-400 hover:border-gray-600"
            }`}
          >
            🎤 Microphone
            <span className="block text-xs opacity-60 mt-0.5">Free — uses Web Speech API</span>
          </button>
          <button
            onClick={() => !isListening && setMode("system")}
            className={`flex-1 py-2 px-3 rounded-lg text-sm border transition-all ${
              mode === "system"
                ? "border-emerald-500 bg-emerald-900/20 text-emerald-300"
                : "border-gray-700 bg-gray-800/50 text-gray-400 hover:border-gray-600"
            }`}
          >
            🖥️ System Audio
            <span className="block text-xs opacity-60 mt-0.5">Capture from Meet/Zoom (needs API key)</span>
          </button>
        </div>

        {error && (
          <div className="p-2.5 bg-red-900/30 border border-red-800 rounded-lg text-sm text-red-300">{error}</div>
        )}

        {/* ── Controls ─────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-2">
          {!isListening ? (
            <button
              onClick={start}
              className="py-2.5 rounded-lg font-medium text-sm bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
            >
              Start Listening
            </button>
          ) : (
            <button
              onClick={stop}
              className="py-2.5 rounded-lg font-medium text-sm bg-red-600 hover:bg-red-500 text-white transition-colors"
            >
              Stop
            </button>
          )}
          <button
            onClick={() => setShowManualInput(!showManualInput)}
            className="py-2.5 rounded-lg font-medium text-sm bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 transition-colors"
          >
            Type Question Manually
          </button>
        </div>

        {/* ── Manual input ─────────────────────────────────────────────── */}
        {showManualInput && (
          <div className="flex gap-2">
            <input
              ref={manualInputRef}
              type="text"
              value={manualInput}
              onChange={(e) => setManualInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitManualInput()}
              placeholder="Type the interviewer's question..."
              className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-emerald-500"
            />
            <button
              onClick={submitManualInput}
              disabled={!manualInput.trim()}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-700 disabled:text-gray-500 text-white transition-colors"
            >
              Add
            </button>
          </div>
        )}

        {/* ── Volume meter ─────────────────────────────────────────────── */}
        {isListening && (
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-gray-500">Audio level</span>
              <span className={`font-medium ${volume > 0.3 ? "text-green-400" : volume > 0.1 ? "text-amber-400" : "text-gray-600"}`}>
                {volume > 0.3 ? "Good" : volume > 0.1 ? "Low" : "Silent"}
              </span>
            </div>
            <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
              <div
                className="h-full transition-all duration-100 rounded-full"
                style={{
                  width: `${Math.min(volume * 100, 100)}%`,
                  backgroundColor: volume > 0.3 ? "#10b981" : volume > 0.1 ? "#f59e0b" : "#4b5563",
                }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
