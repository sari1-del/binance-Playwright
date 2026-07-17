import { chromium } from 'playwright';
import { config } from './config.js';

function loadStorageState() {
  return JSON.parse(Buffer.from(config.storageStateB64, 'base64').toString('utf-8'));
}

/**
 * Opens the chart page for `symbol` and screenshots just the chart area.
 * Returns a PNG Buffer.
 *
 * NOTE: the selector below is a placeholder. Binance's DOM changes over
 * time and differs between spot/futures/mobile layouts, so verify it
 * yourself with `npm run codegen` (or DevTools) and update CHART_SELECTOR
 * before relying on this in production. Falling back to a full-page
 * screenshot if the selector isn't found, so the pipeline doesn't break.
 */
const CHART_SELECTOR = process.env.CHART_SELECTOR || '#tv_chart_container';

export async function screenshotChart(symbol) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ storageState: loadStorageState() });
  const page = await context.newPage();

  const url = config.chartUrlTemplate.replace('{symbol}', symbol);
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60_000 });

  // Give the charting library time to render candles.
  await page.waitForTimeout(5000);

  let buffer;
  const chartEl = page.locator(CHART_SELECTOR).first();
  if (await chartEl.count() > 0) {
    buffer = await chartEl.screenshot();
  } else {
    console.warn(`[screenshotChart] selector "${CHART_SELECTOR}" not found, falling back to full-page screenshot`);
    buffer = await page.screenshot({ fullPage: false });
  }

  await browser.close();
  return buffer;
}
