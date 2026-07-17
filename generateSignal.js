import { config } from './config.js';

const PROMPT = (symbol) => `You are a crypto market commentator writing a short Binance Square post
about ${symbol} based on the attached chart screenshot.

Write 3-5 sentences covering: overall trend direction, any visible
support/resistance levels, and current momentum. Be descriptive and
neutral in tone — do NOT phrase this as investment advice, and do NOT
tell the reader to buy or sell. End with one sentence noting key risks
or what would invalidate this view.

Keep it under 700 characters total. Plain text only, no markdown.`;

export async function generateSignal(symbol, imageBuffer) {
  const imageB64 = imageBuffer.toString('base64');

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.openRouterApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.openRouterModel,
      max_tokens: 400,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: PROMPT(symbol) },
            { type: 'image_url', image_url: { url: `data:image/png;base64,${imageB64}` } },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenRouter error ${res.status}: ${errText}`);
  }

  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error('OpenRouter response had no content: ' + JSON.stringify(data));

  return text.trim() + config.disclaimer;
}
