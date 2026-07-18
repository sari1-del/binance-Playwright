import { config } from './config.js';

const prompt = (plan) => `Write exactly three short plain-text bullet points for an educational Futures chart review of ${plan.symbol}.
The data is: 24h change +${plan.changePercent24h.toFixed(2)}%, direction ${plan.direction}, timeframe 15m.
Mention momentum, volatility, and that the levels are references rather than instructions. Do not include a heading, price, leverage, call to action, or disclaimer.`;

const planTemplate = (plan) => `$${plan.symbol} - ${plan.direction} 15m SETUP WATCH

24h change: +${plan.changePercent24h.toFixed(2)}% | Current price: ${plan.currentPrice}
Observation zone: ${plan.entryLow} - ${plan.entryHigh}
Reference levels: ${plan.targets.map((target, index) => `T${index + 1} ${target}`).join(' | ')}
Invalidation level: ${plan.stop}`;

const fallbackLogic = (plan) => `* The +${plan.changePercent24h.toFixed(2)}% 24-hour move signals elevated volatility.
* The 15-minute ${plan.direction.toLowerCase()} structure is context only; reference levels are not instructions.
* Futures can liquidate quickly, so use a predefined risk limit and avoid over-leverage.`;

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
  const logic = text.trim().split('\n').filter(Boolean).length >= 2 ? text.trim() : fallbackLogic(plan);
  return `${planTemplate(plan)}\n\nSetup logic:\n${logic}${config.disclaimer}`;
}
