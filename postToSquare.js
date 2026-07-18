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
  // A dry run is for reviewing generated content. Do not require working
  // Binance Square selectors until publishing has been explicitly enabled.
  if (config.dryRun) {
    console.log(`[DRY RUN] Would publish post for ${symbol}:\n${text}\n`);
    return;
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ storageState: loadStorageState() });
  const page = await context.newPage();

  await page.goto('https://www.binance.com/en/square', { waitUntil: 'networkidle', timeout: 60_000 });

  // --- placeholder selectors, replace with real ones from codegen ---
  await page.click('text=New Post');
  await page.fill('[data-testid="post-textarea"]', text);

  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles({
    name: `${symbol}-chart.png`,
    mimeType: 'image/png',
    buffer: imageBuffer,
  });

  await page.waitForTimeout(2000); // let the image preview upload

  await page.click('[data-testid="publish-button"]');
  await page.waitForTimeout(2000);
  console.log(`[postToSquare] Published post for ${symbol}`);
  // --- end placeholder section ---

  await browser.close();
}
