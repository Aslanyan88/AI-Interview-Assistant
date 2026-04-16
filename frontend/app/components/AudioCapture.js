"use client";
import { useState, useEffect, useRef, useCallback } from "react";

const API_BASE =
  typeof window !== "undefined" && window.electronAPI ? "" : "http://localhost:5000";

export default function AudioCapture({ onTranscriptUpdate }) {
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState("");
  const [volume, setVolume] = useState(0);
  const [status, setStatus] = useState("Ready");
  const [transcribing, setTranscribing] = useState(false);
  const [apiKey, setApiKey] = useState(() =>
    typeof window !== "undefined" ? localStorage.getItem("mistral_api_key") || "" : ""
  );
  const [showKey, setShowKey] = useState(false);

  const streamRef = useRef(null);
  const recorderRef = useRef(null);
  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const rafRef = useRef(null);
  const listeningRef = useRef(false);
  const timerRef = useRef(null);

  const isElectron = typeof window !== "undefined" && Boolean(window.electronAPI);

  useEffect(() => {
    if (apiKey) localStorage.setItem("mistral_api_key", apiKey);
  }, [apiKey]);

  const transcribe = useCallback(
    async (blob) => {
      if (!apiKey || blob.size < 1000) return;
      try {
        setTranscribing(true);
        const buf = await blob.arrayBuffer();
        const b64 = btoa(
          new Uint8Array(buf).reduce((s, b) => s + String.fromCharCode(b), "")
        );
        const res = await fetch(`${API_BASE}/api/transcribe`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ audio: b64, apiKey }),
        });
        const data = await res.json();
        if (data.error) {
          if (/api key|incorrect|unauthorized|401/i.test(data.error)) setError("Invalid Mistral API key.");
          return;
        }
        if (data.text?.trim()) onTranscriptUpdate("Recruiter: " + data.text.trim());
      } catch (e) {
        console.error("Transcription failed:", e);
      } finally {
        setTranscribing(false);
      }
    },
    [apiKey, onTranscriptUpdate]
  );

  const startRecorder = useCallback(
    (stream) => {
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";
      const recorder = new MediaRecorder(stream, { mimeType: mime, audioBitsPerSecond: 64000 });
      let chunks = [];

      recorder.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
      recorder.onstop = () => {
        if (chunks.length) transcribe(new Blob(chunks, { type: mime }));
        chunks = [];
      };

      recorderRef.current = recorder;

      const cycle = () => {
        if (!listeningRef.current) return;
        chunks = [];
        try { recorder.start(); } catch { return; }
        timerRef.current = setTimeout(() => {
          if (recorder.state === "recording") {
            recorder.stop();
            setTimeout(cycle, 200);
          }
        }, 5000);
      };
      cycle();
    },
    [transcribe]
  );

  const startMeter = (stream) => {
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
  };

  const start = async () => {
    if (!apiKey) return setError("Enter your Mistral API key first.");
    setError("");
    setStatus("Requesting system audio...");

    try {
      const raw = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });

      if (!raw.getAudioTracks().length) {
        raw.getTracks().forEach((t) => t.stop());
        throw new Error("No audio captured. Check Share system audio in the picker.");
      }

      raw.getVideoTracks().forEach((t) => t.stop());
      const stream = new MediaStream(raw.getAudioTracks());
      streamRef.current = stream;
      listeningRef.current = true;

      startMeter(stream);
      startRecorder(stream);

      setIsListening(true);
      setStatus("Listening - capturing interviewer voice");
      onTranscriptUpdate("Listening to computer audio...");
    } catch (e) {
      setError(e.name === "NotAllowedError" ? "Screen share denied." : e.message);
      setStatus("Failed");
    }
  };

  const stop = () => {
    listeningRef.current = false;
    setIsListening(false);
    clearTimeout(timerRef.current);
    if (recorderRef.current?.state === "recording") try { recorderRef.current.stop(); } catch {}
    streamRef.current?.getTracks().forEach((t) => t.stop());
    if (audioCtxRef.current?.state !== "closed") audioCtxRef.current?.close().catch(() => {});
    cancelAnimationFrame(rafRef.current);
    setVolume(0);
    setStatus("Ready");
    onTranscriptUpdate("Stopped listening");
  };

  useEffect(() => () => {
    listeningRef.current = false;
    clearTimeout(timerRef.current);
    if (recorderRef.current?.state === "recording") try { recorderRef.current.stop(); } catch {}
    streamRef.current?.getTracks().forEach((t) => t.stop());
    if (audioCtxRef.current?.state !== "closed") audioCtxRef.current?.close().catch(() => {});
    cancelAnimationFrame(rafRef.current);
  }, []);

  const addManually = () => {
    const q = prompt("Enter what the recruiter said:");
    if (q?.trim()) onTranscriptUpdate("Recruiter: " + q.trim());
  };

  return (
    <div className="bg-gray-800 p-6 rounded-lg shadow-lg mb-6 border border-gray-700">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl text-teal-400 font-bold">System Audio Capture</h2>
        <div className="flex items-center gap-2">
          {transcribing && <span className="text-xs text-yellow-400 animate-pulse">Transcribing...</span>}
          <span className={`w-3 h-3 rounded-full ${isListening ? "bg-green-500 animate-pulse" : "bg-red-500"}`} />
          <span className="text-sm text-gray-300">{isListening ? "ACTIVE" : "INACTIVE"}</span>
        </div>
      </div>

      <div className="mb-4 p-3 rounded-lg border border-gray-700">
        <label className="text-sm font-medium mb-2 block">Mistral API Key</label>
        <div className="flex gap-2">
          <input
            type={showKey ? "text" : "password"}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="Your Mistral API key"
            className="flex-1 py-2 px-3 bg-gray-900 border border-gray-700 text-gray-300 rounded-md text-sm focus:ring-teal-500 focus:border-teal-500"
          />
          <button onClick={() => setShowKey(!showKey)} className="px-3 py-2 bg-gray-700 text-gray-300 rounded-md text-xs hover:bg-gray-600">
            {showKey ? "Hide" : "Show"}
          </button>
        </div>
        <p className="text-xs text-gray-500 mt-1">Stored locally. Sent only to Mistral AI for transcription.</p>
      </div>

      <div className="mb-4 p-3 bg-teal-900/30 rounded-lg border border-teal-700/50 text-sm">
        <span className="font-medium text-teal-300">Captures computer audio only</span>
        <span className="text-teal-200/70"> - interviewer voice from Meet/Zoom. Your mic is NOT used.</span>
      </div>

      {error && (
        <div className="bg-red-900/80 text-white p-3 rounded-lg mb-4 border-l-4 border-red-500 text-sm">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 mb-4">
        {!isListening ? (
          <button
            onClick={start}
            disabled={!apiKey}
            className={`font-bold py-3 px-4 rounded-lg flex items-center justify-center gap-2 ${
              apiKey ? "bg-teal-600 hover:bg-teal-500 text-white" : "bg-gray-600 text-gray-400 cursor-not-allowed"
            }`}
          >
            Capture System Audio
          </button>
        ) : (
          <button onClick={stop} className="bg-red-600 hover:bg-red-500 text-white font-bold py-3 px-4 rounded-lg flex items-center justify-center gap-2">
            Stop
          </button>
        )}
        <button onClick={addManually} className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 px-4 rounded-lg flex items-center justify-center gap-2">
          Add Manually
        </button>
      </div>

      {isListening && (
        <div className="mb-4">
          <div className="flex justify-between text-sm mb-1">
            <span className="text-gray-300">Audio Level</span>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded ${
              volume > 0.5 ? "bg-green-800 text-green-200" : volume > 0.2 ? "bg-yellow-800 text-yellow-200" : "bg-gray-800 text-gray-400"
            }`}>
              {volume > 0.5 ? "HIGH" : volume > 0.2 ? "MED" : "LOW"}
            </span>
          </div>
          <div className="h-4 bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full transition-all duration-100"
              style={{
                width: `${Math.min(volume * 100, 100)}%`,
                backgroundColor: volume > 0.6 ? "#4CAF50" : volume > 0.2 ? "#FFC107" : "#F44336",
              }}
            />
          </div>
        </div>
      )}

      <div className="text-sm text-gray-400 p-3 bg-gray-900 rounded-lg border border-gray-700">
        <p className="font-medium mb-2">Status: {status}</p>
        <ul className="ml-4 list-disc space-y-1">
          {isElectron ? (
            <>
              <li>System audio captured directly (no screen-share picker)</li>
              <li>Works with Google Meet, Zoom, or any app playing audio</li>
            </>
          ) : (
            <>
              <li>Click Capture System Audio, select any screen, check Share system audio</li>
              <li>Audio from Meet/Zoom will be captured</li>
            </>
          )}
          <li>Audio transcribed every 5 seconds via Mistral Voxtral</li>
          <li>Only computer audio is captured - your mic is not used</li>
        </ul>
      </div>
    </div>
  );
}
