# Binance Square chart-commentary bot

Screenshots a coin chart → sends it to an AI vision model via OpenRouter for
commentary → posts the image + text to Binance Square. Runs on a schedule,
deployed as a background worker on Railway.

## Before you start — read this

- **Terms of Service**: automating a Binance account (login sessions,
  posting) may violate Binance's user agreement. This is on you to check
  and accept the risk (account flags/suspension) before deploying.
- **Content risk**: this posts AI-generated market commentary publicly
  under your account. Every post includes a "not financial advice"
  disclaimer by default — don't remove it. Consider your local
  regulations around publishing investment-adjacent content.
- **Selectors will break**: `postToSquare.js` and `screenshotChart.js`
  contain *placeholder* CSS selectors. Binance's site is a frequently-
  updated single-page app; you must capture real selectors yourself
  (see step 2) before this will actually work, and you should expect to
  re-capture them occasionally when Binance ships UI changes.

## Setup

1. `npm install`

2. Capture real selectors:
   ```
   npm run codegen
   ```
   This opens a Playwright inspector. Log in, go to Square, create a post
   (attach an image, type text, hit publish) and copy the selectors it
   records into `src/postToSquare.js`. Do the same for the chart page to
   fix `CHART_SELECTOR`.

3. Capture an authenticated session (do this locally, not on Railway):
   ```
   npm run login
   ```
   Log in manually in the window that opens (handle any captcha/2FA
   yourself), press Enter in the terminal, and copy the printed base64
   string.

4. Copy `.env.example` to `.env` and fill in:
   - `STORAGE_STATE_B64` — from step 3
   - `OPENROUTER_API_KEY` — from openrouter.ai
   - `OPENROUTER_MODEL` — any vision-capable model listed on
     openrouter.ai/models (check current availability/pricing there)
   - Leave `DRY_RUN=true` until you've confirmed a full cycle produces
     the post you expect (check the logs).

5. Test locally: `npm start`, watch the console output.

## Deploying to Railway

1. Push this project to a GitHub repo.
2. In Railway: New Project → Deploy from GitHub repo. Railway will detect
   the `Dockerfile` automatically.
3. Set it up as a **worker** (no exposed HTTP port needed) — Railway
   handles this fine as long as you don't add a PORT/health-check
   requirement.
4. Add all variables from `.env` as Railway environment variables
   (Settings → Variables). Use Railway's secret storage for
   `STORAGE_STATE_B64` and `OPENROUTER_API_KEY`.
5. Set restart policy to "Always" so it comes back up if it crashes —
   this gives you the 24/7 behavior.
6. Deploy, watch logs, keep `DRY_RUN=true` for the first day. Flip to
   `false` once you're confident in the output.

## Session expiry

Binance sessions expire periodically. When posts stop going through,
re-run `npm run login` locally and update `STORAGE_STATE_B64` in Railway.
There's no way around doing this manually — automating the login itself
is what triggers captcha/device-verification in the first place.

## Adjusting frequency / coins

Edit `SYMBOLS` and `CRON_SCHEDULE` in Railway's environment variables
(standard 5-field cron syntax) — no redeploy needed, just a restart.
