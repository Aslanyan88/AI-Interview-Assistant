const express = require('express');
const cors = require('cors');
const aiService = require('./aiService');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json({ limit: '25mb' }));

// --- Mistral Voxtral transcription endpoint ---
app.post('/api/transcribe', async (req, res) => {
  const { audio, apiKey } = req.body;
  if (!audio || !apiKey) {
    return res.status(400).json({ error: 'audio and apiKey are required' });
  }

  try {
    const mistralRes = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'voxtral-mini-latest',
        messages: [{
          role: 'user',
          content: [
            { type: 'input_audio', input_audio: audio },
            { type: 'text', text: 'Transcribe this audio exactly. Return only the spoken words, nothing else.' },
          ],
        }],
      }),
    });

    const data = await mistralRes.json();
    if (data.error) return res.status(400).json({ error: data.error.message || data.error });
    const text = data.choices?.[0]?.message?.content || '';
    res.json({ text: text.trim() });
  } catch (err) {
    console.error('Transcription error:', err);
    res.status(500).json({ error: 'Transcription failed: ' + err.message });
  }
});

// --- AI suggestion endpoint ---
app.post('/api/generate-response', async (req, res) => {
  const { transcript, apiKey } = req.body;
  if (!transcript) return res.status(400).json({ error: 'transcript is required' });

  try {
    const response = await aiService.generateResponse(transcript, apiKey);
    res.json({ response });
  } catch (err) {
    console.error('AI response error:', err);
    res.status(500).json({ error: 'Failed to generate response' });
  }
});

const server = app.listen(PORT, () => console.log(`Backend running on http://localhost:${PORT}`));
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.log(`Port ${PORT} in use, killing it and retrying...`);
    require('child_process').execSync(`npx kill-port ${PORT}`, { stdio: 'ignore' });
    setTimeout(() => app.listen(PORT, () => console.log(`Backend running on http://localhost:${PORT}`)), 1000);
  }
});

module.exports = app;