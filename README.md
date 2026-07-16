# Binance Square Auto-Poster Bot

Posts TOP 5 crypto gainers to Binance Square automatically every 20 minutes.

## Features

- 🚀 **TOP 5 Gainers Only** - Posts about the best performing coins
- 🤖 **Bino Creator Format** - Uses professional, engaging language
- ⚙️ **Automatic Cycling** - Same 5 coins posted repeatedly with variations
- 🔄 **24/7 Operation** - Works non-stop on Railway
- 📱 **Binance API Integration** - Direct posting via Binance Square API

## Versions

### 1. **auto-poster.js** (Recommended for Railway)
- Pure Node.js, no dependencies
- Fast, reliable, works on Railway free tier
- Posts via API only
- **Use this version** ✅

### 2. **auto-poster-playwright.js** (Experimental)
- Includes Playwright browser automation
- Attempts to add coin widgets to posts
- Higher resource usage
- May fail on Railway due to memory/timing constraints
- **Use only if you have Railway paid plan**

## Installation

### Local (Windows)
```bash
cd BinanceBot
npm install
npm start
```

### Railway (Cloud)
```bash
git push  # Deploy to Railway
```

## Configuration

Edit `auto-poster.js`:
```javascript
const CONFIG = {
  OPENROUTER_API_KEY: "your-key-here",
  BINANCE_SQUARE_API_KEY: "your-key-here",
  POST_INTERVAL_MINUTES: 20,
};
```

## What It Posts

Example:
```
$US UPDATE:

😅 Everyone thinks $US is dead after this correction....

But the strongest rallies usually begin when the crowd loses confidence.

If buyers defend this zone, the next move could catch everyone by surprise.

Best move now: LONG

👌 Entry: $0.03560
👌 SL: $0.03490
👌 TP: $0.03700

Don't miss this move 🚀 $US

Price is at $0.03560 with +54.04% 24h gain. Classic reversal setup forming.

#US #Crypto #Trading
$US
```

## API Keys Required

1. **OPENROUTER_API_KEY** - Get from https://openrouter.ai
2. **BINANCE_SQUARE_API_KEY** - Get from Binance Square settings

## Rate Limits

- **Binance Square:** 100 posts per day
- **Bot setting:** Posts every 20 minutes = 72 posts/day ✅

## Troubleshooting

### Posts not showing?
- Check API keys are correct
- Check Binance rate limits
- View Railway logs for errors

### Browser not working on Railway?
- This is expected - Railway has limited resources
- Use `auto-poster.js` instead (API-only)
- Playwright works better on local machine

## Support

Check Railway deployment logs:
```
Railway Dashboard → Deployments → View Logs
```
