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
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.openRouterApiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: config.openRouterModel,
      max_tokens: 400,
      messages: [{ role: 'user', content: [
        { type: 'text', text: prompt(plan) },
        { type: 'image_url', image_url: { url: `data:image/png;base64,${imageB64}` } },
      ] }],
    }),
  });
  if (!response.ok) throw new Error(`OpenRouter error ${response.status}: ${await response.text()}`);
  const data = await response.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error(`OpenRouter response had no content: ${JSON.stringify(data)}`);
  return text.trim() + config.disclaimer;
}
