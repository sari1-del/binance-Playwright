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
  const composer = page.locator('.short-editor-editor-wrapper').first();
  await composer.waitFor({ state: 'visible', timeout: 30_000 });
  await page.getByRole('paragraph').nth(1).click();

  // The editable node's generated class/attributes differ between headed
  // Codegen and Railway. Once the composer is open, it is the last textbox.
  const editor = page.getByRole('textbox').last();
  await editor.waitFor({ state: 'visible', timeout: 30_000 });
  await editor.click();
  await editor.fill(text);

  const fileInput = page.locator('input[type="file"]').last();
  await fileInput.setInputFiles({
    name: `${symbol}-chart.png`,
    mimeType: 'image/png',
    buffer: imageBuffer,
  });

  await page.waitForTimeout(5000); // let the image preview upload

  // The Futures coin card is required for every published post.
  const tradeWidgetButton = page.locator('.trade-widget-icon').first();
  if (await tradeWidgetButton.count() === 0) {
    throw new Error('Futures coin-card control was not found; refusing to publish without it');
  }
  await tradeWidgetButton.click({ timeout: 5_000 });

  const coinSearch = page.getByRole('textbox', { name: 'Search coin or stock' });
  await coinSearch.fill(symbol.replace(/USDT$/, ''), { timeout: 5_000 });

  const perpOptions = page.getByText('Perp', { exact: true });
  let selectedPerp = false;
  for (let index = 0; index < await perpOptions.count(); index += 1) {
    const option = perpOptions.nth(index);
    if (await option.isVisible()) {
      await option.click({ timeout: 5_000 });
      selectedPerp = true;
      break;
    }
  }
  if (!selectedPerp) {
    throw new Error(`No visible Perp option appeared for ${symbol}; refusing to publish without the Futures coin card`);
  }
  await page.waitForTimeout(2000);

  if (config.dryRun) {
    console.log(`[DRY RUN] Composer and widget validated for ${symbol}:\n${text}\n`);
    await browser.close();
    return;
  }

  await composer.getByRole('button', { name: 'Post', exact: true }).click();
  await composer.waitFor({ state: 'hidden', timeout: 15_000 });
  console.log(`[postToSquare] Submission accepted for ${symbol}; composer closed (url=${page.url()})`);
  // --- end placeholder section ---

  await browser.close();
}
