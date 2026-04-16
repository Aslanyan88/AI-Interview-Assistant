"use client";
import { useState } from "react";
import AudioCapture from "./components/AudioCapture";
import AIResponse from "./components/AIResponse";

const API_BASE =
  typeof window !== "undefined" && window.electronAPI ? "" : "http://localhost:5000";

export default function Home() {
  const [transcript, setTranscript] = useState("");
  const [aiResponse, setAiResponse] = useState("");
  const [processing, setProcessing] = useState(false);

  const handleTranscript = (text) => {
    if (text.startsWith("Recruiter:") || text.startsWith("Listening") || text.startsWith("Stopped")) {
      setTranscript((prev) => prev + "\n" + text);
    }
  };

  const getAISuggestion = async () => {
    if (!transcript.trim() || processing) return;
    setProcessing(true);
    try {
      const apiKey = typeof window !== "undefined" ? localStorage.getItem("mistral_api_key") || "" : "";
      const res = await fetch(`${API_BASE}/api/generate-response`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript, apiKey }),
      });
      const data = await res.json();
      setAiResponse(data.response);
    } catch (err) {
      console.error("AI response error:", err);
      setAiResponse("Failed to get AI response. Make sure the backend is running.");
    } finally {
      setProcessing(false);
    }
  };

  return (
    <main className="min-h-screen bg-gray-900 text-gray-100 p-4 md:p-8">
      <h1 className="text-3xl font-bold text-teal-400 mb-4 text-center">Interview Assistant</h1>

      <div className="max-w-4xl mx-auto">
        <AudioCapture onTranscriptUpdate={handleTranscript} />

        <div className="mt-6 bg-gray-800 p-4 rounded-lg border border-gray-700">
          <div className="flex justify-between items-center mb-2">
            <h2 className="text-xl text-teal-400 font-bold">Recruiter Questions</h2>
            <button
              onClick={() => { setTranscript(""); setAiResponse(""); }}
              className="text-sm bg-red-900 hover:bg-red-800 px-3 py-1 rounded"
            >
              Reset
            </button>
          </div>
          <pre className="text-purple-300 p-3 rounded-lg font-mono whitespace-pre-wrap min-h-[120px] max-h-[300px] overflow-y-auto bg-gray-900">
            {transcript || "No questions captured yet..."}
          </pre>
        </div>

        <div className="mt-4 flex justify-center">
          <button
            onClick={getAISuggestion}
            disabled={!transcript.trim() || processing}
            className={`bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-6 rounded-lg ${
              !transcript.trim() || processing ? "opacity-50 cursor-not-allowed" : ""
            }`}
          >
            {processing ? "Processing..." : "Get AI Suggestions"}
          </button>
        </div>

        {aiResponse && <AIResponse response={aiResponse} />}
      </div>
    </main>
  );
}
