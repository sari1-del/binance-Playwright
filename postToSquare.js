import { chromium } from 'playwright';
import { config } from './config.js';

function loadStorageState() {
  return JSON.parse(Buffer.from(config.storageStateB64, 'base64').toString('utf-8'));
}

/**
 * Publishes a post with `text` and an attached image (`imageBuffer`) to
 * Binance Square.
 *
 * IMPORTANT: the selectors below are placeholders — you must capture the
 * real ones yourself. Easiest way:
 *   1. `npm run codegen` (opens a real browser + Playwright inspector)
 *   2. Log in, go to Square, click "New Post", type text, attach an image,
 *      and watch the generated code for the actual selectors Playwright used.
 *   3. Paste those selectors in below.
 * The DOM here is a single-page app and changes without notice, so this
 * step is not optional — running this file unmodified will very likely fail.
 */
export async function postToSquare(symbol, text, imageBuffer) {
  const browser = await chromium.launch({ headless: true });
  // Match the desktop layout used when the Square selectors were captured.
  const context = await browser.newContext({
    storageState: loadStorageState(),
    viewport: { width: 1600, height: 1000 },
  });
  const page = await context.newPage();

  // Binance maintains live connections, so waiting for network idle can time out.
  await page.goto('https://www.binance.com/en/square', { waitUntil: 'domcontentloaded', timeout: 60_000 });

  // Selectors captured with Playwright Codegen on Binance Square, July 2026.
  // Authentication comes from STORAGE_STATE_B64; do not add login automation here.
  // The "Square Stay informed" link was an incidental Codegen interaction;
  // it is not present in the headless layout used on Railway.
  await page.getByRole('button', { name: 'Post' }).first().click();
  await page.getByRole('paragraph').nth(1).click();

  const editor = page
    .locator('.short-editor-editor-wrapper.css-12werr8 > .css-18sm1i8 > .short-editor-content > .short-editor-editor > .css-gdk4go > .json-article-editor')
    .locator('[contenteditable="true"]');
  await editor.waitFor({ state: 'visible', timeout: 30_000 });
  await editor.click();
  await editor.fill(text);

  const fileInput = page.locator('input[type="file"]').nth(1);
  await fileInput.setInputFiles({
    name: `${symbol}-chart.png`,
    mimeType: 'image/png',
    buffer: imageBuffer,
  });

  await page.waitForTimeout(5000); // let the image preview upload

  // Add the Binance Square Futures coin card (price/chart/watchlist widget).
  await page.locator('.css-13a1332 > .editor-toolbar-container > .css-fwp0gd > .css-14x7wge > .icon-wrapper > .trade-widget-icon > .bn-svg').click();
  const coinSearch = page.getByRole('textbox', { name: 'Search coin or stock' });
  await coinSearch.fill(symbol.replace(/USDT$/, ''));
  await page.getByText('Perp').nth(4).click();
  await page.waitForTimeout(2000);

  if (config.dryRun) {
    console.log(`[DRY RUN] Composer and widget validated for ${symbol}:\n${text}\n`);
    await browser.close();
    return;
  }

  await page.getByRole('button', { name: 'Post', exact: true }).last().click();
  await page.waitForTimeout(2000);
  console.log(`[postToSquare] Published post for ${symbol}`);
  // --- end placeholder section ---

  await browser.close();
}
