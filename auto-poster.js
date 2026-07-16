const https = require("https");

const CONFIG = {
  OPENROUTER_API_KEY: "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",
  BINANCE_SQUARE_API_KEY: "ca225ac8251847d0a2991c7c30f82a20",
  POST_INTERVAL_MINUTES: 20,
};

let totalPosted = 0;
let topGainers = [];
let currentCoinIndex = 0;

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

async function fetchTop5Gainers() {
  log("Fetching TOP 5 gainers from Binance FUTURES (24h)...");

  let tickers = null;

  // FUTURES endpoints only
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

  // Fallback to SPOT if FUTURES fails
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

  // Get USDT pairs with volume > 500k
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

  // Get TOP 5 GAINERS ONLY (FUTURES)
  const top5 = usdtPairs
    .filter(c => c.change24h > 0)
    .sort((a, b) => b.change24h - a.change24h)
    .slice(0, 5);

  if (top5.length === 0) {
    log(`⚠️ No gainers found! Using all coins.`, "warn");
    return usdtPairs.slice(0, 5);
  }

  log(`🚀 Top 5 FUTURES Gainers: ${top5.map(c => `$${c.symbol}(+${fmt(c.change24h)}%)`).join(", ")}`);
  log(`Cycling through these 5 coins every ${CONFIG.POST_INTERVAL_MINUTES} minutes`);

  return top5;
}

async function generateBinoTemplate(coin) {
  log(`Generating Bino Creator format for $${coin.symbol}...`);

  const direction = "LONG";
  
  const entry = coin.price.toFixed(6);
  const entryRange = (coin.price * 1.005).toFixed(6);
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

  const prompt = `Write a BULLISH trading update like Bino Creator with this EXACT format:

$${coin.symbol} UPDATE:

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
$${coin.symbol}

MATCH BINO CREATOR EXACTLY. Return ONLY the post text.`;

  const models = ["openrouter/auto", "openai/gpt-oss-120b:free"];

  for (const model of models) {
    try {
      const body = JSON.stringify({
        model,
        messages: [
          { role: "system", content: "Write bullish crypto updates like Bino Creator. Optimistic tone, specific entry/SL/TP levels, emoji usage. Keep it professional but engaging." },
          { role: "user", content: prompt }
        ],
        max_tokens: 500,
      });

      const options = {
        hostname: "openrouter.ai",
        path: "/api/v1/chat/completions",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${CONFIG.OPENROUTER_API_KEY}`,
          "HTTP-Referer": "https://binance.com",
          "X-Title": "Binance Square Bot",
          "Content-Length": Buffer.byteLength(body),
        },
      };

      const response = await httpsPost(options, body);
      if (response.error) throw new Error(response.error.message);
      let text = response.choices?.[0]?.message?.content || "";
      text = text.replace(/\*\*/g, "").replace(/\*/g, "").trim();

      if (text && text.length > 100) {
        log(`Model worked!`, "success");
        return text;
      }
    } catch (e) {
      log(`Model failed`, "warn");
    }
  }

  // Fallback Bino Creator format - EXACT match from templates
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
    if (postId) log(`✅ Posted: https://www.binance.com/square/post/${postId}`, "success");
    return true;
  } else {
    throw new Error(`Binance Error: ${response.message}`);
  }
}

async function runPost() {
  console.log("\n" + "═".repeat(60));
  log(`Starting post #${totalPosted + 1}...`);

  try {
    // Fetch top 5 gainers if empty or every 3 posts to refresh
    if (topGainers.length === 0 || totalPosted % 3 === 0) {
      topGainers = await fetchTop5Gainers();
      currentCoinIndex = 0;
      log(`Loaded TOP 5 FUTURES gainers. Cycling through them.`);
    }

    if (topGainers.length === 0) {
      log("No gainers available", "error");
      return;
    }

    // Get current coin and cycle
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

console.log("╔════════════════════════════════════════════╗");
console.log("║  Binance Square Auto-Poster Bot            ║");
console.log("║  TOP 5 FUTURES Gainers - Bino Creator      ║");
console.log("║  Posts Every " + CONFIG.POST_INTERVAL_MINUTES + " Minutes 24/7              ║");
console.log("╚════════════════════════════════════════════╝\n");

log("Bot started!", "success");

runPost();
setInterval(runPost, CONFIG.POST_INTERVAL_MINUTES * 60 * 1000);

process.on("SIGINT", () => {
  log("Shutting down...", "info");
  process.exit(0);
});

process.on("SIGTERM", () => {
  log("Shutting down...", "info");
  process.exit(0);
});
