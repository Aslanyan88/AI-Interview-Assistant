const express = require('express');
const cors = require('cors');
const { generate } = require('./providers');
const { buildSystemPrompt } = require('./prompts');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

// Test provider connection
app.post('/api/test-connection', async (req, res) => {
  try {
    const { provider, apiKey, baseUrl, model } = req.body;
    if (!provider || !model) {
      return res.status(400).json({ error: 'Provider and model are required' });
    }
    const systemPrompt = 'Respond with exactly: Connection successful';
    await generate({ provider, apiKey, baseUrl, model, systemPrompt, userMessage: 'Test' });
    res.json({ success: true, message: 'Connected to ' + provider + '/' + model });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, error: err.message || 'Connection failed' });
  }
});

// Generate AI response
app.post('/api/generate', async (req, res) => {
  try {
    const { provider, apiKey, baseUrl, model, transcript, interviewType, customContext } = req.body;
    if (!provider || !model || !transcript?.trim()) {
      return res.status(400).json({ error: 'Missing required fields: provider, model, transcript' });
    }
    const systemPrompt = buildSystemPrompt(interviewType, customContext);
    const response = await generate({ provider, apiKey, baseUrl, model, systemPrompt, userMessage: transcript });
    res.json({ response });
  } catch (err) {
    console.error('Generate error:', err.message);
    res.status(err.status || 500).json({ error: err.message || 'Failed to generate response' });
  }
});

// Transcribe audio via provider API
app.post('/api/transcribe', async (req, res) => {
  try {
    const { provider, apiKey, baseUrl, model, audio } = req.body;
    if (!audio) return res.status(400).json({ error: 'No audio data provided' });
    if (!provider || !apiKey) return res.status(400).json({ error: 'Provider and API key required for transcription' });
    const { transcribe } = require('./providers');
    const text = await transcribe({ provider, apiKey, baseUrl, model, audio });
    res.json({ text });
  } catch (err) {
    console.error('Transcribe error:', err.message);
    res.status(err.status || 500).json({ error: err.message || 'Transcription failed' });
  }
});

// Start server
const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => {
  console.log('Server running on http://localhost:' + PORT);
});
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error('Port ' + PORT + ' is in use. Trying ' + (PORT + 1) + '...');
    app.listen(PORT + 1, () => console.log('Server running on http://localhost:' + (PORT + 1)));
  }
});
