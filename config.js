import 'dotenv/config';

function required(name, fallback) {
  const value = process.env[name] ?? fallback;
  if (value === undefined) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export const config = {
  chartUrlTemplate: required('CHART_URL_TEMPLATE', 'https://www.binance.com/en/futures/{symbol}'),
  futuresApiBase: required('FUTURES_API_BASE', 'https://fapi.binance.com'),
  minQuoteVolume: Number(required('MIN_QUOTE_VOLUME', '20000000')),
  noRepeatSignals: Number(required('NO_REPEAT_SIGNALS', '5')),
  // Mount a Railway Volume at /data so the rotation survives restarts.
  signalStatePath: required('SIGNAL_STATE_PATH', '/data/recent-signals.json'),
  storageStateB64: required('STORAGE_STATE_B64'),
  openRouterApiKey: required('OPENROUTER_API_KEY'),
  openRouterModel: required('OPENROUTER_MODEL', 'openai/gpt-4o'),
  cronSchedule: required('CRON_SCHEDULE', '*/20 * * * *'),
  dryRun: required('DRY_RUN', 'true') === 'true',
  disclaimer: '\n\nAI-generated educational market analysis only - not financial advice. Futures are high risk; no outcome is guaranteed.',
};
