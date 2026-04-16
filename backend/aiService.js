// aiService.js — Mistral AI powered response generation

const SYSTEM_PROMPT = `You are an expert interview coach. The user will provide a transcript of interview questions from a recruiter. Analyze the latest question and provide a strong, professional answer the candidate can use. Keep answers concise (3-5 sentences), confident, and specific with concrete examples where appropriate. Do not repeat the question. Provide only the suggested answer.`;

async function generateResponse(transcript, apiKey) {
  if (!apiKey) {
    return fallbackResponse(transcript);
  }

  try {
    const res = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'mistral-small-latest',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: transcript },
        ],
      }),
    });

    const data = await res.json();
    if (data.error) {
      console.error('Mistral API error:', data.error);
      return fallbackResponse(transcript);
    }
    return data.choices?.[0]?.message?.content?.trim() || fallbackResponse(transcript);
  } catch (err) {
    console.error('Mistral request failed:', err);
    return fallbackResponse(transcript);
  }
}

function fallbackResponse(transcript) {
  const questions = transcript.split('Recruiter:').filter(q => q.trim());
  const lastQ = questions.length ? questions[questions.length - 1].trim().toLowerCase() : '';

  if (!lastQ) return "I don't see any clear questions from the recruiter yet.";

  if (lastQ.includes('experience'))
    return "I have extensive hands-on experience in this area, having worked on multiple projects where I delivered measurable results. I can elaborate on specific examples if you'd like.";
  if (lastQ.includes('challenge') || lastQ.includes('difficult'))
    return "One significant challenge I faced involved diagnosing a complex issue under time pressure. I took a systematic approach, broke the problem down, and resolved it ahead of schedule.";
  if (lastQ.includes('strength'))
    return "My key strengths include strong analytical skills, clear communication, and the ability to learn new technologies quickly and apply them effectively.";

  return "That's a great question. Based on my background and experience, I'm confident I can bring strong value in this area. I'd be happy to go into more detail.";
}

module.exports = { generateResponse };