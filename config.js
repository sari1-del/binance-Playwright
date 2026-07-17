import 'dotenv/config';

function required(name, fallback) {
  const v = process.env[name] ?? fallback;
  if (v === undefined) throw new Error(`Missing required env var: ${name}`);
  return v;
}

export const config = {
  // Comma-separated list, e.g. "BTCUSDT,ETHUSDT"
  symbols: required('SYMBOLS', 'BTCUSDT').split(',').map(s => s.trim()),

  // Chart page to screenshot. Point this at the exact URL you want captured
  // (Binance futures/spot chart, or a TradingView embed you control).
  chartUrlTemplate: required(
    'CHART_URL_TEMPLATE',
    'https://www.binance.com/en/trade/{symbol}?type=spot'
  ),

  // Base64-encoded Playwright storageState JSON (cookies + localStorage).
  // Generate this once with `npm run login` and paste the output here as a secret.
  storageStateB64: required('STORAGE_STATE_B64'),

  // OpenRouter
  openRouterApiKey: required('OPENROUTER_API_KEY'),
  openRouterModel: required('OPENROUTER_MODEL', 'openai/gpt-4o'), // must be a vision-capable model on OpenRouter

  // How often to run a full cycle. Cron syntax, default: every 4 hours.
  cronSchedule: required('CRON_SCHEDULE', '0 */4 * * *'),

  // Safety switch — set to "false" to only log the generated post instead of publishing it.
  dryRun: required('DRY_RUN', 'true') === 'true',

  disclaimer: '\n\n🤖 AI-generated market commentary — not financial advice. DYOR.',
};
