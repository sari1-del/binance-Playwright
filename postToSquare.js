import { chromium } from 'playwright';
import { config } from './config.js';

function loadStorageState() {
  return JSON.parse(Buffer.from(config.storageStateB64, 'base64').toString('utf-8'));
}

/**
 * Finds and clicks the composer's real "Post" submit button.
 *
 * Binance renders this button in a portal outside the composer DOM
 * subtree, and briefly shows other elements matching role=button
 * name="Post" while the composer is opening/animating (e.g. the trigger
 * button that opened the composer in the first place). A single
 * snapshot-and-click is therefore flaky:
 *   - the candidate set can still be changing when we look at it
 *   - a button can be "visible" per Playwright but not yet actionable
 *     while an overlay/animation is settling
 *
 * This retries the whole scan a few times, waits for the candidate
 * count to stabilize, excludes the button that opened the composer,
 * skips disabled buttons, and logs full diagnostics if it still can't
 * find a good target.
 */
async function clickComposerPostButton(page, triggerButtonHandle) {
  const maxAttempts = 4;
  const settleChecks = 3;
  const settleIntervalMs = 300;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const buttons = page.getByRole('button', { name: 'Post', exact: true });

    // Wait for the candidate count to stop changing before trusting it.
    let lastCount = -1;
    let stableStreak = 0;
    while (stableStreak < settleChecks) {
      const count = await buttons.count();
      if (count === lastCount) {
        stableStreak += 1;
      } else {
        stableStreak = 0;
        lastCount = count;
      }
      await page.waitForTimeout(settleIntervalMs);
    }

    const count = await buttons.count();
    let rightmostButton;
    let rightmostX = -1;
    const debugInfo = [];

    for (let index = 0; index < count; index += 1) {
      const button = buttons.nth(index);

      if (triggerButtonHandle) {
        const isTrigger = await button.evaluate(
          (el, triggerEl) => el === triggerEl,
          triggerButtonHandle,
        ).catch(() => false);
        if (isTrigger) {
          debugInfo.push({ index, skipped: 'is trigger button' });
          continue;
        }
      }

      const visible = await button.isVisible().catch(() => false);
      const disabled = await button.isDisabled().catch(() => true);
      const box = visible ? await button.boundingBox().catch(() => null) : null;
      debugInfo.push({ index, visible, disabled, box });

      if (!visible || disabled || !box) continue;
      if (box.x > rightmostX) {
        rightmostButton = button;
        rightmostX = box.x;
      }
    }

    if (rightmostButton) {
      try {
        await rightmostButton.scrollIntoViewIfNeeded();
        await rightmostButton.click({ timeout: 15_000 });
        return;
      } catch (err) {
        console.log(`[clickComposerPostButton] attempt ${attempt}/${maxAttempts}: click failed - ${err.message}`);
      }
    } else {
      console.log(`[clickComposerPostButton] attempt ${attempt}/${maxAttempts}: no usable candidate. count=${count}`);
      console.log(`[clickComposerPostButton] candidates: ${JSON.stringify(debugInfo)}`);
    }

    if (attempt < maxAttempts) {
      await page.waitForTimeout(1_000);
    }
  }

  throw new Error('Composer Post button was not found or not clickable after retries');
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

  // Capture any API responses that look like the create-post call, so if the
  // click on "Post" doesn't visibly do anything, we can see what Binance's
  // server actually said (status code + body) instead of guessing from the DOM.
  const capturedResponses = [];
  page.on('response', async (response) => {
    const url = response.url();
    const isCandidate = /\/(square|content|post|feed)[^?]*\/(create|publish|add|post)/i.test(url)
      || /square/i.test(url) && response.request().method() === 'POST';
    if (!isCandidate) return;
    let body;
    try {
      body = await response.text();
      if (body.length > 2000) body = `${body.slice(0, 2000)}…(truncated)`;
    } catch {
      body = '<unreadable body>';
    }
    capturedResponses.push({
      url,
      method: response.request().method(),
      status: response.status(),
      body,
    });
  });

  // Binance maintains live connections, so waiting for network idle can time out.
  await page.goto('https://www.binance.com/en/square', { waitUntil: 'domcontentloaded', timeout: 60_000 });

  // Selectors captured with Playwright Codegen on Binance Square, July 2026.
  // Authentication comes from STORAGE_STATE_B64; do not add login automation here.
  // The "Square Stay informed" link was an incidental Codegen interaction;
  // it is not present in the headless layout used on Railway.
  const triggerButton = page.getByRole('button', { name: 'Post' }).first();
  await triggerButton.click();
  // Keep a handle to the trigger button so the final submit-button scan can
  // exclude it (it also matches role=button name="Post" and can otherwise
  // be picked by mistake if it lingers on screen during the composer animation).
  const triggerButtonHandle = await triggerButton.elementHandle().catch(() => null);

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
  console.log(`[postToSquare] ${symbol}: image attached, proceeding to market widget`);

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
  await clickComposerPostButton(page, triggerButtonHandle);

  try {
    await composer.waitFor({ state: 'hidden', timeout: 30_000 });
    console.log(`[postToSquare] Submission accepted for ${symbol}; composer closed (url=${page.url()})`);
    console.log(`[postToSquare] captured post-related network responses: ${JSON.stringify(capturedResponses)}`);
  } catch (err) {
    // The click succeeded but the composer never closed. Capture enough
    // context here to tell apart: (a) a silent rejection with a toast/
    // validation message still on screen, (b) it was just slower than our
    // timeout and would have closed eventually, or (c) we're watching a
    // stale duplicate node while the real composer already closed.
    const composerCount = await page.locator('.short-editor-editor-wrapper').count().catch(() => -1);
    const visibleCount = await page.locator('.short-editor-editor-wrapper').evaluateAll(
      (nodes) => nodes.filter((n) => n.offsetParent !== null).length,
    ).catch(() => -1);

    // Railway sets RAILWAY_VOLUME_MOUNT_PATH to the mounted volume's path
    // when a volume is attached; that storage survives past container exit,
    // unlike /tmp which is gone as soon as the deploy stops.
    const screenshotDir = process.env.RAILWAY_VOLUME_MOUNT_PATH || '/tmp';
    let screenshotPath;
    try {
      screenshotPath = `${screenshotDir}/${symbol}-composer-timeout-${Date.now()}.png`;
      await page.screenshot({ path: screenshotPath, fullPage: true });
    } catch (screenshotErr) {
      console.log(`[postToSquare] failed to capture timeout screenshot: ${screenshotErr.message}`);
    }

    // Grab visible text of any element that looks like an alert/toast, best-effort.
    const possibleErrorText = await page
      .locator('[role="alert"], [class*="toast" i], [class*="error" i], [class*="message" i]')
      .allInnerTexts()
      .catch(() => []);

    console.log(`[postToSquare] ${symbol}: composer did not close within 30s after clicking Post.`);
    console.log(`[postToSquare] composer nodes: total=${composerCount} visible=${visibleCount}`);
    console.log(`[postToSquare] possible error/toast text: ${JSON.stringify(possibleErrorText)}`);
    if (screenshotPath) console.log(`[postToSquare] timeout screenshot saved to ${screenshotPath}`);
    console.log(`[postToSquare] page url at timeout: ${page.url()}`);
    console.log(`[postToSquare] captured post-related network responses: ${JSON.stringify(capturedResponses)}`);

    await browser.close();
    throw err;
  }
  // --- end placeholder section ---

  await browser.close();
}
