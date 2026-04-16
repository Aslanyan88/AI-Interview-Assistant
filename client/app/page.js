"use client";
import { useState, useCallback, useEffect, useRef } from "react";
import ProviderConfig from "./components/ProviderConfig";
import InterviewSetup from "./components/InterviewSetup";
import AudioCapture from "./components/AudioCapture";
import AIResponse from "./components/AIResponse";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

export default function Home() {
  // ── Provider config ──────────────────────────────────────────────────────
  const [provider, setProvider] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");

  // ── Interview config ─────────────────────────────────────────────────────
  const [interviewType, setInterviewType] = useState("general");
  const [customContext, setCustomContext] = useState("");

  // ── App state ────────────────────────────────────────────────────────────
  const [transcript, setTranscript] = useState("");
  const [aiResponse, setAiResponse] = useState("");
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(true);
  const [hydrated, setHydrated] = useState(false);

  // ── Send mode ────────────────────────────────────────────────────────────
  const [sendMode, setSendMode] = useState("auto");
  const [silenceDelay, setSilenceDelay] = useState(3);

  // ── UI state ─────────────────────────────────────────────────────────────
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [autoSendPending, setAutoSendPending] = useState(false);

  // ── Hydrate from localStorage after mount ────────────────────────────────
  useEffect(() => {
    const p = localStorage.getItem("ia_provider") || "";
    setProvider(p);
    setApiKey(localStorage.getItem("ia_api_key") || "");
    setBaseUrl(localStorage.getItem("ia_base_url") || "");
    setModel(localStorage.getItem("ia_model") || "");
    setInterviewType(localStorage.getItem("ia_interview_type") || "general");
    setCustomContext(localStorage.getItem("ia_custom_context") || "");
    setSendMode(localStorage.getItem("ia_send_mode") || "auto");
    const sd = localStorage.getItem("ia_silence_delay");
    if (sd) setSilenceDelay(Number(sd));
    setSettingsOpen(!p);
    setHydrated(true);
  }, []);

  // ── Persist all settings to localStorage (guarded by hydrated) ──────────
  useEffect(() => { if (hydrated) localStorage.setItem("ia_provider", provider); }, [provider, hydrated]);
  useEffect(() => {
    if (!hydrated) return;
    if (apiKey) localStorage.setItem("ia_api_key", apiKey);
    else localStorage.removeItem("ia_api_key");
  }, [apiKey, hydrated]);
  useEffect(() => {
    if (!hydrated) return;
    if (baseUrl) localStorage.setItem("ia_base_url", baseUrl);
    else localStorage.removeItem("ia_base_url");
  }, [baseUrl, hydrated]);
  useEffect(() => { if (hydrated) localStorage.setItem("ia_model", model); }, [model, hydrated]);
  useEffect(() => { if (hydrated) localStorage.setItem("ia_interview_type", interviewType); }, [interviewType, hydrated]);
  useEffect(() => {
    if (!hydrated) return;
    if (customContext) localStorage.setItem("ia_custom_context", customContext);
    else localStorage.removeItem("ia_custom_context");
  }, [customContext, hydrated]);
  useEffect(() => { if (hydrated) localStorage.setItem("ia_send_mode", sendMode); }, [sendMode, hydrated]);
  useEffect(() => { if (hydrated) localStorage.setItem("ia_silence_delay", String(silenceDelay)); }, [silenceDelay, hydrated]);

  const isConfigured = provider && model && (apiKey || provider === "ollama" || provider === "custom");

  // ── Refs ─────────────────────────────────────────────────────────────────
  const silenceTimerRef = useRef(null);
  const transcriptRef = useRef(transcript);
  const processingRef = useRef(processing);
  const isConfiguredRef = useRef(isConfigured);
  const aiResponseRef = useRef(null);
  const transcriptEndRef = useRef(null);
  const lastSentTranscriptRef = useRef("");

  useEffect(() => { transcriptRef.current = transcript; }, [transcript]);
  useEffect(() => { processingRef.current = processing; }, [processing]);
  useEffect(() => { isConfiguredRef.current = isConfigured; }, [isConfigured]);

  const handleTranscript = useCallback((text) => {
    setTranscript((prev) => (prev ? prev + "\n" : "") + text);
  }, []);

  const getAISuggestion = useCallback(async () => {
    if (!transcriptRef.current.trim() || processingRef.current || !isConfiguredRef.current) return;
    setProcessing(true);
    setError("");

    try {
      const res = await fetch(`${API_BASE}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          apiKey,
          baseUrl: baseUrl || undefined,
          model,
          transcript: transcriptRef.current,
          interviewType,
          customContext,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to generate response");
      setAiResponse(data.response);
      lastSentTranscriptRef.current = transcriptRef.current;
    } catch (err) {
      setError(err.message);
      setAiResponse("");
    } finally {
      setProcessing(false);
    }
  }, [provider, apiKey, baseUrl, model, interviewType, customContext]);

  // ── Auto-send on silence ─────────────────────────────────────────────────
  // Only trigger when *new* speech lines exist since the last AI call.
  // System messages (lines starting with "[") are ignored entirely.
  useEffect(() => {
    if (sendMode !== "auto" || processing) {
      clearTimeout(silenceTimerRef.current);
      setAutoSendPending(false);
      return;
    }

    // Extract speech-only lines (ignore system messages like [Listening started])
    const speechLines = (text) =>
      text.split("\n").filter((l) => l.trim() && !l.trim().startsWith("[")).join("\n");

    const currentSpeech = speechLines(transcript);
    const lastSentSpeech = speechLines(lastSentTranscriptRef.current);

    // No new speech since last AI call — nothing to send
    if (!currentSpeech || currentSpeech === lastSentSpeech) {
      clearTimeout(silenceTimerRef.current);
      setAutoSendPending(false);
      return;
    }

    setAutoSendPending(true);
    clearTimeout(silenceTimerRef.current);
    silenceTimerRef.current = setTimeout(() => {
      setAutoSendPending(false);
      getAISuggestion();
    }, silenceDelay * 1000);

    return () => { clearTimeout(silenceTimerRef.current); setAutoSendPending(false); };
  }, [transcript, sendMode, silenceDelay, processing, getAISuggestion]);

  // ── Auto-scroll AI response into view ────────────────────────────────────
  useEffect(() => {
    if (aiResponse) aiResponseRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [aiResponse]);

  // ── Auto-scroll transcript to bottom ─────────────────────────────────────
  useEffect(() => {
    if (transcriptOpen) transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcript, transcriptOpen]);

  // ── Keyboard shortcut: Ctrl+Enter to get answer ──────────────────────────
  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        getAISuggestion();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [getAISuggestion]);

  const transcriptLines = transcript ? transcript.split("\n").filter((l) => l.trim()).length : 0;

  return (
    <main className="min-h-screen p-4 md:p-6 max-w-5xl mx-auto">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-emerald-400">Interview Assistant</h1>
          <p className="text-xs text-gray-500 mt-0.5">AI-powered real-time coaching</p>
        </div>
        <button
          onClick={() => setSettingsOpen(!settingsOpen)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-700 text-sm transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          Settings
        </button>
      </div>

      {/* ── Settings panel ──────────────────────────────────────────────── */}
      {settingsOpen && (
        <div className="mb-6 space-y-4">
          <ProviderConfig
            provider={provider} setProvider={setProvider}
            apiKey={apiKey} setApiKey={setApiKey}
            baseUrl={baseUrl} setBaseUrl={setBaseUrl}
            model={model} setModel={setModel}
          />
          <InterviewSetup
            interviewType={interviewType} setInterviewType={setInterviewType}
            customContext={customContext} setCustomContext={setCustomContext}
          />
          {isConfigured && (
            <button
              onClick={() => setSettingsOpen(false)}
              className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg font-medium transition-colors"
            >
              Start Interview Session
            </button>
          )}
        </div>
      )}

      {/* ── Interview Session ───────────────────────────────────────────── */}
      {!settingsOpen && (
        <>
          {isConfigured ? (
            <>
              {/* Status bar */}
              <div className="mb-3 flex items-center gap-3 px-3 py-1.5 bg-gray-800/50 rounded-lg border border-gray-800 text-xs text-gray-400">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <span className="font-medium text-gray-300">{provider}</span>
                <span className="text-gray-600">&middot;</span>
                <span>{model}</span>
                <span className="text-gray-600">&middot;</span>
                <span>{interviewType.replace("-", " ")}</span>
                <span className="ml-auto text-gray-600">Ctrl+Enter to get answer</span>
              </div>

              {/* ═══ AI Response — hero section, always visible ═══ */}
              <div ref={aiResponseRef} className="mb-4">
                <AIResponse response={aiResponse} processing={processing} />
              </div>

              {/* ═══ Action bar ═══ */}
              <div className="mb-4 bg-gray-900/80 rounded-xl border border-gray-800 p-3 space-y-3">
                <button
                  onClick={getAISuggestion}
                  disabled={!transcript.trim() || processing}
                  className={`w-full py-3.5 rounded-lg font-semibold text-base transition-all ${
                    !transcript.trim() || processing
                      ? "bg-gray-800 text-gray-500 cursor-not-allowed"
                      : "bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-900/40 active:scale-[0.98]"
                  }`}
                >
                  {processing ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Generating your answer...
                    </span>
                  ) : (
                    "\uD83C\uDFAF They\u2019re Done \u2014 Get My Answer"
                  )}
                </button>

                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setSendMode(sendMode === "auto" ? "manual" : "auto")}
                    className={`relative w-10 h-5 rounded-full transition-colors ${
                      sendMode === "auto" ? "bg-emerald-600" : "bg-gray-700"
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                        sendMode === "auto" ? "translate-x-5" : ""
                      }`}
                    />
                  </button>
                  <span className="text-sm text-gray-300">Auto-detect</span>

                  {sendMode === "auto" && (
                    <div className="flex items-center gap-2 ml-auto">
                      <span className="text-xs text-gray-500">Silence:</span>
                      <input
                        type="range" min={2} max={10} step={1}
                        value={silenceDelay}
                        onChange={(e) => setSilenceDelay(Number(e.target.value))}
                        className="w-20 accent-emerald-500"
                      />
                      <span className="text-xs font-mono text-emerald-400 w-6">{silenceDelay}s</span>
                    </div>
                  )}
                </div>

                {autoSendPending && (
                  <div className="flex items-center gap-2 text-xs text-emerald-400 bg-emerald-950/30 rounded-lg px-3 py-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    Waiting for silence — will auto-send after {silenceDelay}s pause...
                  </div>
                )}

                {sendMode === "manual" && (
                  <p className="text-xs text-gray-600">
                    Auto-detect is off. Click the button or press Ctrl+Enter when the interviewer finishes.
                  </p>
                )}
              </div>

              {/* ═══ Audio Capture ═══ */}
              <AudioCapture
                onTranscriptUpdate={handleTranscript}
                provider={provider} apiKey={apiKey} baseUrl={baseUrl}
              />

              {/* ═══ Transcript (collapsible) ═══ */}
              <div className="mt-4 bg-gray-900 rounded-lg border border-gray-800 overflow-hidden">
                <button
                  onClick={() => setTranscriptOpen(!transcriptOpen)}
                  className="w-full flex items-center justify-between px-4 py-2.5 text-sm hover:bg-gray-800/50 transition-colors"
                >
                  <div className="flex items-center gap-2 text-gray-300">
                    <svg
                      className={`w-3 h-3 transition-transform ${transcriptOpen ? "rotate-90" : ""}`}
                      fill="currentColor" viewBox="0 0 20 20"
                    >
                      <path d="M6 4l8 6-8 6V4z" />
                    </svg>
                    <span className="font-medium">Transcript</span>
                    {transcriptLines > 0 && (
                      <span className="px-1.5 py-0.5 rounded bg-gray-800 text-xs text-gray-500">
                        {transcriptLines}
                      </span>
                    )}
                  </div>
                  {transcript && (
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        setTranscript("");
                        setAiResponse("");
                        setError("");
                      }}
                      className="text-xs px-2 py-0.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-500 hover:text-gray-300 transition-colors"
                    >
                      Clear
                    </span>
                  )}
                </button>
                {transcriptOpen && (
                  <div className="border-t border-gray-800">
                    <pre className="p-4 text-sm font-mono whitespace-pre-wrap max-h-[200px] overflow-y-auto text-gray-400 leading-relaxed">
                      {transcript || "No transcript yet \u2014 start listening or type a question."}
                      <span ref={transcriptEndRef} />
                    </pre>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="text-center py-12">
              <p className="text-gray-400 mb-3">No AI provider configured yet.</p>
              <button
                onClick={() => setSettingsOpen(true)}
                className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg font-medium transition-colors"
              >
                Open Settings
              </button>
            </div>
          )}
        </>
      )}

      {/* ── Error ───────────────────────────────────────────────────────── */}
      {error && (
        <div className="mt-4 p-3 bg-red-900/30 border border-red-800 rounded-lg text-sm text-red-300">
          {error}
        </div>
      )}
    </main>
  );
}
