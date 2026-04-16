// ── Provider registry & API dispatch ─────────────────────────────────────────
//
// Supports: OpenAI, Mistral, Anthropic, Google Gemini, Ollama, any
// OpenAI-compatible endpoint. Each format maps to a thin adapter function.

const PROVIDERS = {
  openai: {
    name: 'OpenAI',
    format: 'openai',
    baseUrl: 'https://api.openai.com/v1/chat/completions',
    transcribeUrl: 'https://api.openai.com/v1/audio/transcriptions',
    models: [
      { id: 'gpt-4o', name: 'GPT-4o', description: 'Most capable' },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini', description: 'Fast & affordable' },
      { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', description: 'Previous gen flagship' },
      { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', description: 'Legacy fast model' },
    ],
    transcriptionModels: [{ id: 'whisper-1', name: 'Whisper' }],
    requiresApiKey: true,
  },
  mistral: {
    name: 'Mistral AI',
    format: 'openai',
    baseUrl: 'https://api.mistral.ai/v1/chat/completions',
    models: [
      { id: 'mistral-large-latest', name: 'Mistral Large', description: 'Most capable' },
      { id: 'mistral-small-latest', name: 'Mistral Small', description: 'Fast & efficient' },
      { id: 'open-mistral-nemo', name: 'Mistral Nemo', description: 'Open-weight model' },
    ],
    transcriptionModels: [{ id: 'mistral-large-latest', name: 'Mistral (via chat)' }],
    requiresApiKey: true,
  },
  anthropic: {
    name: 'Anthropic',
    format: 'anthropic',
    baseUrl: 'https://api.anthropic.com/v1/messages',
    models: [
      { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', description: 'Best balance of speed & quality' },
      { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku', description: 'Fastest' },
    ],
    requiresApiKey: true,
  },
  gemini: {
    name: 'Google Gemini',
    format: 'gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    models: [
      { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', description: 'Latest fast model' },
      { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', description: 'Most capable' },
      { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', description: 'Fast & efficient' },
    ],
    requiresApiKey: true,
  },
  ollama: {
    name: 'Ollama (Local)',
    format: 'openai',
    baseUrl: 'http://localhost:11434/v1/chat/completions',
    models: [
      { id: 'llama3.2', name: 'Llama 3.2', description: '3B — fast, good quality' },
      { id: 'phi3', name: 'Phi-3 Mini', description: '3.8B — Microsoft' },
      { id: 'gemma:2b', name: 'Gemma 2B', description: '2B — Google, very small' },
      { id: 'mistral', name: 'Mistral 7B', description: '7B — great all-rounder' },
      { id: 'qwen2.5:3b', name: 'Qwen 2.5 3B', description: '3B — multilingual' },
    ],
    requiresApiKey: false,
    allowCustomModel: true,
  },
  custom: {
    name: 'Custom (OpenAI-Compatible)',
    format: 'openai',
    baseUrl: '',
    models: [],
    requiresApiKey: false,
    requiresBaseUrl: true,
    allowCustomModel: true,
  },
};

// ── API format handlers ─────────────────────────────────────────────────────

async function callOpenAI(url, apiKey, model, systemPrompt, userMessage) {
  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
    }),
  });

  const data = await res.json();
  if (!res.ok) throw Object.assign(new Error(data.error?.message || JSON.stringify(data)), { status: res.status });
  return data.choices?.[0]?.message?.content?.trim() || 'No response generated.';
}

async function callAnthropic(url, apiKey, model, systemPrompt, userMessage) {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    }),
  });

  const data = await res.json();
  if (!res.ok) throw Object.assign(new Error(data.error?.message || JSON.stringify(data)), { status: res.status });
  return data.content?.[0]?.text?.trim() || 'No response generated.';
}

async function callGemini(baseUrl, apiKey, model, systemPrompt, userMessage) {
  const url = `${baseUrl}/models/${model}:generateContent?key=${apiKey}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: 'user', parts: [{ text: userMessage }] }],
    }),
  });

  const data = await res.json();
  if (!res.ok) throw Object.assign(new Error(data.error?.message || JSON.stringify(data)), { status: res.status });
  return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || 'No response generated.';
}

// ── Transcription (OpenAI Whisper) ──────────────────────────────────────────

async function transcribeWhisper(apiUrl, apiKey, audio) {
  const audioBuffer = Buffer.from(audio, 'base64');
  const blob = new Blob([audioBuffer], { type: 'audio/webm' });

  const form = new FormData();
  form.append('file', blob, 'audio.webm');
  form.append('model', 'whisper-1');

  const res = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}` },
    body: form,
  });

  const data = await res.json();
  if (!res.ok) throw Object.assign(new Error(data.error?.message || 'Transcription failed'), { status: res.status });
  return data.text || '';
}

// ── Public API ──────────────────────────────────────────────────────────────

function getProviders() {
  return Object.entries(PROVIDERS).map(([id, p]) => ({
    id,
    name: p.name,
    models: p.models,
    transcriptionModels: p.transcriptionModels || [],
    requiresApiKey: p.requiresApiKey || false,
    requiresBaseUrl: p.requiresBaseUrl || false,
    allowCustomModel: p.allowCustomModel || false,
  }));
}

async function generate({ provider, apiKey, baseUrl, model, systemPrompt, userMessage }) {
  const config = PROVIDERS[provider];
  if (!config) throw Object.assign(new Error(`Unknown provider: ${provider}`), { status: 400 });

  const url = baseUrl || config.baseUrl;
  if (!url) throw Object.assign(new Error('Base URL is required for this provider'), { status: 400 });

  switch (config.format) {
    case 'openai':
      return callOpenAI(url, apiKey, model, systemPrompt, userMessage);
    case 'anthropic':
      return callAnthropic(url, apiKey, model, systemPrompt, userMessage);
    case 'gemini':
      return callGemini(url, apiKey, model, systemPrompt, userMessage);
    default:
      throw Object.assign(new Error(`Unsupported format: ${config.format}`), { status: 400 });
  }
}

async function transcribe({ provider, apiKey, baseUrl, model, audio }) {
  const config = PROVIDERS[provider];
  if (!config) throw Object.assign(new Error(`Unknown provider: ${provider}`), { status: 400 });

  if (provider === 'openai') {
    const url = baseUrl || config.transcribeUrl;
    return transcribeWhisper(url, apiKey, audio);
  }

  // For other providers: use chat completion with a transcription prompt
  if (['mistral', 'ollama', 'custom'].includes(provider)) {
    const url = baseUrl || config.baseUrl;
    return callOpenAI(url, apiKey, model || config.models[0]?.id, 'You are a transcription assistant. Transcribe the audio accurately.', `[Audio content provided as base64 - length: ${audio.length} chars]`);
  }

  throw Object.assign(new Error('Transcription not supported for this provider'), { status: 400 });
}

module.exports = { generate, transcribe, getProviders, PROVIDERS };
