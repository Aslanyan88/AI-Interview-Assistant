"use client";
import { useState } from "react";

export default function AIResponse({ response, processing }) {
  const [speaking, setSpeaking] = useState(false);
  const [copied, setCopied] = useState(false);

  const speak = () => {
    if (!("speechSynthesis" in window)) return;
    if (speaking) {
      speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }
    const utterance = new SpeechSynthesisUtterance(response);
    utterance.onend = () => setSpeaking(false);
    setSpeaking(true);
    speechSynthesis.speak(utterance);
  };

  const copy = () => {
    navigator.clipboard.writeText(response).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="bg-gradient-to-b from-emerald-950/40 to-gray-900 rounded-xl border-2 border-emerald-800/60 overflow-hidden shadow-lg shadow-emerald-900/20">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-emerald-800/40 bg-emerald-900/20">
        <div className="flex items-center gap-2">
          <span className="text-emerald-400">{"\u2728"}</span>
          <h2 className="font-semibold text-emerald-300 text-sm">AI Suggestion</h2>
        </div>
        {response && (
          <div className="flex gap-2">
            <button
              onClick={copy}
              className="px-3 py-1 text-xs rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 transition-colors"
            >
              {copied ? "\u2713 Copied!" : "Copy"}
            </button>
            <button
              onClick={speak}
              className="px-3 py-1 text-xs rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
            >
              {speaking ? "Stop" : "\uD83D\uDD0A Speak"}
            </button>
          </div>
        )}
      </div>
      <div className="p-5 min-h-[140px]">
        {processing ? (
          <div className="flex items-center justify-center gap-3 py-10 text-emerald-400/60">
            <svg className="w-6 h-6 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span className="text-base">Generating your answer...</span>
          </div>
        ) : response ? (
          <p className="text-gray-100 leading-relaxed whitespace-pre-line text-[15px]">{response}</p>
        ) : (
          <div className="flex flex-col items-center justify-center py-10 text-gray-600">
            <svg className="w-10 h-10 mb-3 text-emerald-900/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
            </svg>
            <p className="text-sm font-medium text-gray-500">Waiting for the interviewer&apos;s question...</p>
            <p className="text-xs mt-1 text-gray-600">Start listening and the AI will prepare your answer.</p>
          </div>
        )}
      </div>
    </div>
  );
}
