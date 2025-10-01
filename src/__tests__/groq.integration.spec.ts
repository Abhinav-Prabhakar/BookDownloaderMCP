import fetch from 'node-fetch';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = 'moonshotai/kimi-k2-instruct-0905';

describe('Groq Chat Completions (optional integration)', () => {
  const apiKey = process.env.GROQ_API_KEY;

  const shouldRun = !!apiKey && process.env.RUN_GROQ_TESTS === '1';
  const maybe = shouldRun ? test : test.skip;

  maybe('calls chat completions successfully', async () => {
    const resp = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: 'You are a test assistant. Reply with "pong" only.' },
          { role: 'user', content: 'ping' },
        ],
        temperature: 0,
      }),
    });
    expect(resp.status).toBe(200);
    const json = await resp.json();
    expect(json).toHaveProperty('id');
    const content = json.choices?.[0]?.message?.content?.toLowerCase?.() || '';
    expect(content).toContain('pong');
  });
});
