// Run this LOCALLY (not on Railway): `npm run login`
// Opens a real, visible browser window so you can log into Binance manually
// (solve captcha / 2FA / device verification yourself), then saves the
// resulting session so the Railway worker never has to touch the login form.
//
// Copy the printed base64 string into Railway as STORAGE_STATE_B64.
// Sessions expire periodically — re-run this whenever the worker starts
// failing to post (likely cause: expired/invalidated session).

import { chromium } from 'playwright';

const run = async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto('https://www.binance.com/en/login');
  console.log('\nA browser window has opened.');
  console.log('Log in manually (including any 2FA/captcha), navigate to');
  console.log('https://www.binance.com/en/square and confirm you can see your feed.');
  console.log('Then come back here and press ENTER.\n');

  await new Promise(resolve => process.stdin.once('data', resolve));

  const state = await context.storageState();
  const b64 = Buffer.from(JSON.stringify(state)).toString('base64');

  console.log('\n--- STORAGE_STATE_B64 (copy everything below into Railway) ---\n');
  console.log(b64);
  console.log('\n--- end ---\n');

  await browser.close();
  process.exit(0);
};

run();
