"use client";
import { useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

const PROVIDERS = [
  {
    id: "openai",
    name: "OpenAI",
    models: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo"],
    requiresKey: true,
    keyPlaceholder: "sk-...",
    keyLink: "https://platform.openai.com/api-keys",
  },
  {
    id: "mistral",
    name: "Mistral AI",
    models: ["mistral-large-latest", "mistral-small-latest", "open-mistral-nemo"],
    requiresKey: true,
    keyPlaceholder: "Your Mistral API key",
    keyLink: "https://console.mistral.ai/api-keys",
  },
  {
    id: "anthropic",
    name: "Anthropic",
    models: ["claude-sonnet-4-20250514", "claude-3-5-haiku-20241022"],
    requiresKey: true,
    keyPlaceholder: "sk-ant-...",
    keyLink: "https://console.anthropic.com/settings/keys",
  },
  {
    id: "gemini",
    name: "Google Gemini",
    models: ["gemini-2.0-flash", "gemini-1.5-pro", "gemini-1.5-flash"],
    requiresKey: true,
    keyPlaceholder: "Your Gemini API key",
    keyLink: "https://aistudio.google.com/app/apikey",
  },
  {
    id: "ollama",
    name: "Ollama (Local)",
    models: ["llama3.2", "phi3", "gemma:2b", "mistral", "qwen2.5:3b"],
    requiresKey: false,
    allowCustomModel: true,
    defaultBaseUrl: "http://localhost:11434/v1/chat/completions",
    description: "Run open-source models locally. Install from ollama.com",
  },
  {
    id: "custom",
    name: "Custom (OpenAI-Compatible)",
    models: [],
    requiresKey: false,
    requiresBaseUrl: true,
    allowCustomModel: true,
    description: "Any endpoint with OpenAI-compatible API (LM Studio, vLLM, etc.)",
  },
];

export default function ProviderConfig({ provider, setProvider, apiKey, setApiKey, baseUrl, setBaseUrl, model, setModel }) {
  const [showKey, setShowKey] = useState(false);
  const [customModel, setCustomModel] = useState("");
  const [testStatus, setTestStatus] = useState(null); // null | "testing" | "success" | "error"
  const [testMessage, setTestMessage] = useState("");

  const current = PROVIDERS.find((p) => p.id === provider);

  // localStorage persistence is handled by page.js with hydration guard

  const handleProviderChange = (id) => {
    setProvider(id);
    setApiKey("");
    setModel("");
    setBaseUrl("");
    setCustomModel("");
    setTestStatus(null);
    setTestMessage("");
    const p = PROVIDERS.find((x) => x.id === id);
    if (p?.models.length) setModel(p.models[0]);
    if (p?.defaultBaseUrl) setBaseUrl(p.defaultBaseUrl);
  };

  const testConnection = async () => {
    if (!provider || !model) return;
    setTestStatus("testing");
    setTestMessage("");
    try {
      const res = await fetch(`${API_BASE}/api/test-connection`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, apiKey, baseUrl: baseUrl || undefined, model }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setTestStatus("success");
        setTestMessage(data.message);
      } else {
        setTestStatus("error");
        setTestMessage(data.error || "Connection failed");
      }
    } catch {
      setTestStatus("error");
      setTestMessage("Cannot reach server. Is it running?");
    }
  };

  const handleCustomModel = () => {
    if (customModel.trim()) {
      setModel(customModel.trim());
      setCustomModel("");
    }
  };

  return (
    <div className="bg-gray-900 rounded-lg border border-gray-800 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-800">
        <h2 className="font-semibold text-gray-200">AI Provider</h2>
        <p className="text-xs text-gray-500 mt-0.5">Choose your AI provider and model. Keys are stored locally in your browser.</p>
      </div>

      <div className="p-4 space-y-4">
        {/* ── Provider grid ────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {PROVIDERS.map((p) => (
            <button
              key={p.id}
              onClick={() => handleProviderChange(p.id)}
              className={`p-3 rounded-lg border text-left text-sm transition-all ${
                provider === p.id
                  ? "border-emerald-500 bg-emerald-900/20 text-emerald-300"
                  : "border-gray-700 bg-gray-800/50 text-gray-400 hover:border-gray-600 hover:text-gray-300"
              }`}
            >
              <span className="font-medium block">{p.name}</span>
              {p.description && <span className="text-xs opacity-60 block mt-0.5">{p.description}</span>}
            </button>
          ))}
        </div>

        {current && (
          <>
            {/* ── API key ────────────────────────────────────────────── */}
            {current.requiresKey && (
              <div>
                <label className="text-sm font-medium text-gray-300 mb-1.5 block">
                  API Key
                  {current.keyLink && (
                    <a href={current.keyLink} target="_blank" rel="noopener noreferrer" className="ml-2 text-xs text-emerald-400 hover:text-emerald-300">
                      Get one →
                    </a>
                  )}
                </label>
                <div className="flex gap-2">
                  <input
                    type={showKey ? "text" : "password"}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder={current.keyPlaceholder}
                    className="flex-1 py-2 px-3 bg-gray-800 border border-gray-700 text-gray-300 rounded-lg text-sm focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                  />
                  <button
                    onClick={() => setShowKey(!showKey)}
                    className="px-3 py-2 bg-gray-800 border border-gray-700 text-gray-400 rounded-lg text-xs hover:bg-gray-700"
                  >
                    {showKey ? "Hide" : "Show"}
                  </button>
                </div>
              </div>
            )}

            {/* ── Base URL (custom/ollama) ────────────────────────────── */}
            {(current.requiresBaseUrl || current.defaultBaseUrl) && (
              <div>
                <label className="text-sm font-medium text-gray-300 mb-1.5 block">Endpoint URL</label>
                <input
                  type="url"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="http://localhost:11434/v1/chat/completions"
                  className="w-full py-2 px-3 bg-gray-800 border border-gray-700 text-gray-300 rounded-lg text-sm focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                />
              </div>
            )}

            {/* ── Model selection ─────────────────────────────────────── */}
            <div>
              <label className="text-sm font-medium text-gray-300 mb-1.5 block">Model</label>
              {current.models.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-2">
                  {current.models.map((m) => (
                    <button
                      key={m}
                      onClick={() => setModel(m)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-all ${
                        model === m
                          ? "bg-emerald-600 text-white"
                          : "bg-gray-800 text-gray-400 border border-gray-700 hover:border-gray-600"
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              )}
              {current.allowCustomModel && (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={customModel}
                    onChange={(e) => setCustomModel(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleCustomModel()}
                    placeholder="Enter custom model name..."
                    className="flex-1 py-2 px-3 bg-gray-800 border border-gray-700 text-gray-300 rounded-lg text-sm focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                  />
                  <button onClick={handleCustomModel} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm">
                    Use
                  </button>
                </div>
              )}
              {model && (
                <p className="mt-2 text-xs text-gray-500">
                  Selected: <span className="font-mono text-gray-400">{model}</span>
                </p>
              )}
            </div>

            {/* ── Test connection ─────────────────────────────────────── */}
            {model && (
              <div>
                <button
                  onClick={testConnection}
                  disabled={testStatus === "testing"}
                  className={`w-full py-2.5 rounded-lg text-sm font-medium transition-all ${
                    testStatus === "testing"
                      ? "bg-gray-800 text-gray-400 cursor-wait"
                      : testStatus === "success"
                        ? "bg-emerald-900/30 border border-emerald-700 text-emerald-400 hover:bg-emerald-900/50"
                        : testStatus === "error"
                          ? "bg-red-900/30 border border-red-800 text-red-400 hover:bg-red-900/50"
                          : "bg-gray-800 border border-gray-700 text-gray-300 hover:bg-gray-700 hover:border-gray-600"
                  }`}
                >
                  {testStatus === "testing" ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Testing...
                    </span>
                  ) : testStatus === "success" ? (
                    "\u2713 Connection Successful"
                  ) : testStatus === "error" ? (
                    "\u2717 Test Failed \u2014 Retry"
                  ) : (
                    "\uD83D\uDD0C Test Connection"
                  )}
                </button>
                {testMessage && (
                  <p className={`mt-1.5 text-xs ${testStatus === "success" ? "text-emerald-400" : "text-red-400"}`}>
                    {testMessage}
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
