import { chromium } from 'playwright';
import { config } from './config.js';

function loadStorageState() {
  return JSON.parse(Buffer.from(config.storageStateB64, 'base64').toString('utf-8'));
}

/**
 * Publishes a post with `text` and an attached image (`imageBuffer`) to
 * Binance Square, plus a live coin-price widget for `symbol`.
 *
 * Selectors below were captured with Playwright Codegen against the
 * current (2026-07-18) Binance Square layout. As always, expect these to
 * need re-capturing if Binance ships a UI change — re-run `npm run codegen`
 * and update this file the same way if posting starts failing again.
 */
export async function postToSquare(symbol, text, imageBuffer) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    storageState: loadStorageState(),
    viewport: { width: 1600, height: 1000 },
  });
  const page = await context.newPage();

  await page.goto('https://www.binance.com/en/square', { waitUntil: 'domcontentloaded', timeout: 60_000 });

  // Dismiss any popups/banners that may appear on a fresh session (cookie
  // consent, "don't show again" prompts, etc). These are optional — if one
  // doesn't appear within a few seconds, move on without failing the run.
  const dismissIfPresent = async (locator) => {
    try {
      await locator.click({ timeout: 5000 });
    } catch {
      // not present — that's fine, continue
    }
  };
  await dismissIfPresent(page.getByRole('button', { name: 'Accept Cookies & Continue' }));
  await dismissIfPresent(page.getByRole('checkbox', { name: "Don't show this message again" }));
  await dismissIfPresent(page.getByRole('button', { name: 'Yes' }));
  await dismissIfPresent(page.getByText('Skip'));

  console.log(`[postToSquare] loaded page: ${page.url()} title="${await page.title()}"`);

  // If the saved session has expired, Square shows a "Login" button instead
  // of the post composer — fail fast with a clear message instead of hanging
  // on a composer that will never appear.
  const loginButton = page.locator('#square-header').getByRole('button', { name: 'Login' });
  if (await loginButton.isVisible({ timeout: 5000 }).catch(() => false)) {
    await browser.close();
    throw new Error(
      'Not logged in — STORAGE_STATE_B64 looks expired or invalid. ' +
      'Re-run `npm run login` locally and update the Railway env var.'
    );
  }

  // Click the composer placeholder to open/activate it, then type the post text.
  try {
    await page.getByRole('paragraph').click({ timeout: 15000 });
  } catch (error) {
    console.log(`[postToSquare] composer click failed on ${page.url()} title="${await page.title()}"`);
    await browser.close();
    throw error;
  }
  await page.locator('#feed-home-tabs').getByRole('textbox').fill(text);

  // Attach the chart screenshot.
  await page.getByText('Upload File').click();
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles({
    name: `${symbol}-chart.png`,
    mimeType: 'image/png',
    buffer: imageBuffer,
  });
  await page.waitForTimeout(5000); // let the image preview upload

  // Open the "more" menu, then the coin-widget option.
  await page.locator('#post-editor-more-icon > .center > .bn-svg').click();
  await page.locator('.bn-svg.h-full').click();

  // Search for the coin and select it from the dropdown.
  const coinSearch = page.getByRole('textbox', { name: 'Search coin or stock' });
  await coinSearch.click();
  await coinSearch.fill(symbol.replace(/USDT$/, ''));
  await page.waitForTimeout(1500); // let the results list populate

  // The results list renders several nested <div>s per row; nth(3) was the
  // clickable row when this was captured. If coin selection ever silently
  // fails, re-capture this line first — it's the most fragile part of the flow.
  await page.locator('div').filter({ hasText: `${symbol}Perp` }).nth(3).click();
  await page.waitForTimeout(2000);

  if (config.dryRun) {
    console.log(`[DRY RUN] Composer and widget validated for ${symbol}:\n${text}\n`);
    await browser.close();
    return;
  }

  await page.getByRole('button', { name: 'Post' }).first().click();
  await page.waitForTimeout(2000);
  console.log(`[postToSquare] Published post for ${symbol}`);

  await browser.close();
}
