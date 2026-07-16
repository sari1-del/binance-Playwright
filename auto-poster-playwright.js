const https = require("https");
const { chromium } = require("playwright");

const CONFIG = {
  OPENROUTER_API_KEY: "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",
  BINANCE_SQUARE_API_KEY: "ca225ac8251847d0a2991c7c30f82a20",
  POST_INTERVAL_MINUTES: 20,
  ENABLE_BROWSER: true, // Set to false to disable browser
};

let totalPosted = 0;
let topGainers = [];
let currentCoinIndex = 0;
let browser = null;

function log(msg, type = "info") {
  const icons = { info: "ℹ️", success: "✅", error: "❌", warn: "⚠️" };
  console.log(`[${new Date().toLocaleTimeString()}] ${icons[type] || "•"} ${msg}`);
}

function fmt(n, d = 2) {
  return Number(n).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
}

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { "User-Agent": "Mozilla/5.0" } }, res => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => { try { resolve(JSON.parse(data)); } catch { resolve(data); } });
    }).on("error", reject);
  });
}

function httpsPost(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, res => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => { try { resolve(JSON.parse(data)); } catch { resolve(data); } });
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

async function initBrowser() {
  if (!CONFIG.ENABLE_BROWSER) {
    log("Browser disabled in config", "warn");
    return null;
  }

  try {
    log("Launching Playwright browser...");
    browser = await chromium.launch({ 
      headless: true,
      args: ['--disable-blink-features=AutomationControlled']
    });
    log("Browser launched successfully!", "success");
    return browser;
  } catch (err) {
    log(`Browser launch failed: ${err.message}`, "error");
    log("Continuing without browser (API-only mode)", "warn");
    return null;
  }
}

async function addCoinWidgetToPost(postId) {
  if (!browser || !postId) return false;

  try {
    log(`Adding coin widget to post ${postId}...`);
    const context = await browser.createBrowserContext();
    const page = await context.newPage();

    // Navigate to post
    await page.goto(`https://www.binance.com/square/post/${postId}`, { waitUntil: 'networkidle', timeout: 30000 });
    log("Post page loaded", "success");

    // Try to click edit button
    await page.click('button[aria-label="Edit"]').catch(() => {
      log("Edit button not found", "warn");
    });

    await context.close();
    return true;
  } catch (err) {
    log(`Widget addition failed: ${err.message}`, "warn");
    return false;
  }
}

async function fetchTop5Gainers() {
  log("Fetching TOP 5 gainers from Binance FUTURES (24h)...");

  let tickers = null;

  const endpoints = [
    "https://fapi.binance.com/fapi/v1/ticker/24hr",
    "https://fapi.binance.com/fapi/v2/ticker/24hr",
  ];

  for (const url of endpoints) {
    try {
      log(`Trying FUTURES: ${url}`);
      const data = await Promise.race([
        httpsGet(url),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 10000))
      ]);
      if (Array.isArray(data) && data.length > 0) {
        tickers = data;
        log(`✅ Got ${data.length} FUTURES tickers`, "success");
        break;
      }
    } catch (e) {
      log(`FUTURES endpoint failed: ${e.message}`, "warn");
    }
  }

  if (!tickers) {
    log(`FUTURES endpoints failed, trying SPOT fallback...`, "warn");
    try {
      const data = await httpsGet("https://api.binance.com/api/v3/ticker/24hr");
      if (Array.isArray(data) && data.length > 0) {
        tickers = data;
        log(`✅ Got ${data.length} SPOT tickers (fallback)`, "success");
      }
    } catch (e) {
      log(`SPOT fallback failed`, "error");
    }
  }

  if (!tickers) throw new Error("All endpoints failed");

  const usdtPairs = tickers
    .filter(t => t.symbol.endsWith("USDT"))
    .map(t => ({
      symbol:    t.symbol.replace("USDT", ""),
      price:     parseFloat(t.lastPrice),
      change24h: parseFloat(t.priceChangePercent),
      high24h:   parseFloat(t.highPrice),
      low24h:    parseFloat(t.lowPrice),
      volume24h: parseFloat(t.quoteVolume),
    }))
    .filter(c => c.price > 0 && c.volume24h > 500000);

  const top5 = usdtPairs
    .filter(c => c.change24h > 0)
    .sort((a, b) => b.change24h - a.change24h)
    .slice(0, 5);

  if (top5.length === 0) {
    log(`⚠️ No gainers found! Using all coins.`, "warn");
    return usdtPairs.slice(0, 5);
  }

  log(`🚀 Top 5 FUTURES Gainers: ${top5.map(c => `$${c.symbol}(+${fmt(c.change24h)}%)`).join(", ")}`);
  return top5;
}

async function generateBinoTemplate(coin) {
  log(`Generating Bino Creator format for $${coin.symbol}...`);

  const direction = "LONG";
  const entry = coin.price.toFixed(6);
  const stopLoss = (coin.price * 0.97).toFixed(6);
  const targetPrice = (coin.price * 1.15).toFixed(6);

  const hooks = [
    `😅 Everyone thinks $${coin.symbol} is dead after this correction....`,
    `😂 Everyone is waiting for a breakout....`,
    `😎 Everyone thinks $${coin.symbol} is finished....`,
    `🤔 Everyone is confused about $${coin.symbol}....`,
    `👀 Everyone is waiting for the next move....`,
  ];
  
  const randomHook = hooks[Math.floor(Math.random() * hooks.length)];

  return `$${coin.symbol} UPDATE:

${randomHook}

But the strongest rallies usually begin when the crowd loses confidence.

If buyers defend this zone, the next move could catch everyone by surprise.

Best move now: ${direction}

👌 Entry: $${entry}
👌 SL: $${stopLoss}
👌 TP: $${targetPrice}

Don't miss this move 🚀 $${coin.symbol}

Price is at $${fmt(coin.price, 6)} with +${fmt(coin.change24h)}% 24h gain. Classic reversal setup forming.

#${coin.symbol} #Crypto #Trading
$${coin.symbol}`;
}

async function postToBinanceSquare(content, symbol) {
  log("Posting to Binance Square...");

  const body = JSON.stringify({ bodyTextOnly: content });

  const options = {
    hostname: "www.binance.com",
    path: "/bapi/composite/v1/public/pgc/openApi/content/add",
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Square-OpenAPI-Key": CONFIG.BINANCE_SQUARE_API_KEY,
      "clienttype": "web",
      "Content-Length": Buffer.byteLength(body),
    },
  };

  const response = await httpsPost(options, body);

  if (response.code === "000000") {
    const postId = response.data?.id;
    if (postId) {
      log(`✅ Posted: https://www.binance.com/square/post/${postId}`, "success");
      
      // Try to add widget with browser
      if (browser) {
        setTimeout(async () => {
          await addCoinWidgetToPost(postId);
        }, 2000);
      }
    }
    return true;
  } else {
    throw new Error(`Binance Error: ${response.message}`);
  }
}

async function runPost() {
  console.log("\n" + "═".repeat(60));
  log(`Starting post #${totalPosted + 1}...`);

  try {
    if (topGainers.length === 0 || totalPosted % 3 === 0) {
      topGainers = await fetchTop5Gainers();
      currentCoinIndex = 0;
    }

    if (topGainers.length === 0) {
      log("No gainers available", "error");
      return;
    }

    const coin = topGainers[currentCoinIndex];
    currentCoinIndex = (currentCoinIndex + 1) % topGainers.length;

    log(`Post #${totalPosted + 1}: $${coin.symbol} | +${fmt(coin.change24h)}% | $${fmt(coin.price, 6)}`);

    const text = await generateBinoTemplate(coin);

    console.log("\n" + "─".repeat(60));
    console.log(text);
    console.log("─".repeat(60));

    await postToBinanceSquare(text, coin.symbol);
    totalPosted++;
    log(`Total posted: ${totalPosted}`, "success");

  } catch (err) {
    log(`Failed: ${err.message}`, "error");
  }

  log(`Next post in ${CONFIG.POST_INTERVAL_MINUTES} minutes...`);
}

async function main() {
  console.log("╔════════════════════════════════════════════╗");
  console.log("║  Binance Square Auto-Poster Bot            ║");
  console.log("║  WITH Playwright Browser Support           ║");
  console.log("║  Posts Every " + CONFIG.POST_INTERVAL_MINUTES + " Minutes 24/7              ║");
  console.log("╚════════════════════════════════════════════╝\n");

  log("Bot started!", "success");

  // Initialize browser if enabled
  if (CONFIG.ENABLE_BROWSER) {
    await initBrowser();
  }

  runPost();
  setInterval(runPost, CONFIG.POST_INTERVAL_MINUTES * 60 * 1000);
}

process.on("SIGINT", async () => {
  log("Shutting down...", "info");
  if (browser) {
    await browser.close();
    log("Browser closed", "success");
  }
  process.exit(0);
});

process.on("SIGTERM", async () => {
  log("Shutting down...", "info");
  if (browser) {
    await browser.close();
    log("Browser closed", "success");
  }
  process.exit(0);
});

main().catch(err => {
  log(`Fatal error: ${err.message}`, "error");
  process.exit(1);
});
