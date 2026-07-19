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

  // Add the market widget using the flow recorded in Playwright Codegen.
  const baseSymbol = symbol.replace(/USDT$/, '');
  const marketWidgetButton = page.locator('.icon-box.css-vurnku > .center > .bn-svg > path:nth-child(2)').first();
  if (await marketWidgetButton.count() === 0) {
    throw new Error('Market-widget control was not found; refusing to publish without it');
  }
  await marketWidgetButton.click({ timeout: 5_000 });

  const assetSearch = page.getByRole('textbox').filter({ hasText: '$' }).last();
  await assetSearch.fill(`$${baseSymbol}`, { timeout: 5_000 });
  await page.waitForTimeout(1_000); // Binance debounces the asset search.

  const assetOptions = page.getByText(new RegExp(`^\\$${baseSymbol}`, 'i'));
  let selectedAsset = false;
  for (let index = 0; index < await assetOptions.count(); index += 1) {
    const option = assetOptions.nth(index);
    if (await option.isVisible()) {
      await option.click({ timeout: 5_000 });
      selectedAsset = true;
      break;
    }
  }
  if (!selectedAsset) {
    throw new Error(`No visible market-widget asset appeared for ${symbol}; refusing to publish without it`);
  }

  let selectedQuote = false;
  const preferredQuotes = symbol.endsWith('USDT') ? ['USDT', 'BUSD'] : ['BUSD'];
  for (const quote of preferredQuotes) {
    const quoteOptions = page.getByText(quote, { exact: true });
    for (let index = 0; index < await quoteOptions.count(); index += 1) {
      const option = quoteOptions.nth(index);
      if (await option.isVisible()) {
        await option.click({ timeout: 5_000 });
        selectedQuote = true;
        break;
      }
    }
    if (selectedQuote) break;
  }
  if (!selectedQuote) {
    throw new Error(`No supported quote is available for the ${baseSymbol} market widget; refusing to publish without it`);
  }
  const okButton = page.getByRole('button', { name: 'OK', exact: true });
  if (await okButton.count() > 0 && await okButton.first().isVisible()) {
    await okButton.first().click({ timeout: 5_000 });
  } else {
    console.log('[postToSquare] Market-widget pair was confirmed automatically');
  }
  await page.waitForTimeout(2000);

  if (config.dryRun) {
    console.log(`[DRY RUN] Composer and widget validated for ${symbol}:\n${text}\n`);
    await browser.close();
    return;
  }

  // Binance renders the final publish button in a portal outside the composer.
  // Codegen records it as the third Post button on the page.
  await page.getByRole('button', { name: 'Post', exact: true }).nth(2).click();
  await composer.waitFor({ state: 'hidden', timeout: 15_000 });
  console.log(`[postToSquare] Submission accepted for ${symbol}; composer closed (url=${page.url()})`);
  // --- end placeholder section ---

  await browser.close();
}
