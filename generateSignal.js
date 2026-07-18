import { config } from './config.js';

const prompt = (plan) => `Write a concise Binance Square educational Futures market-analysis post.
Use the supplied 15-minute data exactly. Do not invent price levels, leverage, certainty, or a call to action.

Format as plain text:
$${plan.symbol} - ${plan.direction} 15m SETUP WATCH

24h change: +${plan.changePercent24h.toFixed(2)}% | Current price: ${plan.currentPrice}
Observation zone: ${plan.entryLow} - ${plan.entryHigh}
Reference levels: ${plan.targets.map((target, index) => `T${index + 1} ${target}`).join(' | ')}
Invalidation level: ${plan.stop}

Setup logic:
* Mention the 24-hour gain and the 15-minute trend.
* Explain that levels are chart references, not instructions.
* Mention volatility, liquidation risk, and a predefined risk limit.

End with: Educational analysis only - not financial advice. No guaranteed outcome.
Keep the entire post under 900 characters. Plain text only.`;

export async function generateSignal(plan, imageBuffer) {
  const imageB64 = imageBuffer.toString('base64');
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${config.geminiModel}:generateContent`,
    {
    method: 'POST',
    headers: { 'x-goog-api-key': config.geminiApiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [
        { text: prompt(plan) },
        { inline_data: { mime_type: 'image/png', data: imageB64 } },
      ] }],
      generationConfig: { maxOutputTokens: 400 },
    }),
  });
  if (!response.ok) throw new Error(`Gemini error ${response.status}: ${await response.text()}`);
  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.find((part) => part.text)?.text;
  if (!text) throw new Error(`Gemini response had no text: ${JSON.stringify(data)}`);
  return text.trim() + config.disclaimer;
}
