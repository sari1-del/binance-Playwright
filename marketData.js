import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { config } from './config.js';

const apiUrl = (path) => `${config.futuresApiBase}${path}`;

async function getJson(path) {
  const response = await fetch(apiUrl(path), { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`Binance Futures API ${response.status} for ${path}`);
  return response.json();
}

async function recentSymbols() {
  try {
    const state = JSON.parse(await readFile(config.signalStatePath, 'utf8'));
    return Array.isArray(state.symbols) ? state.symbols.slice(0, config.noRepeatSignals) : [];
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

export async function selectTopGainer() {
  const [exchangeInfo, tickers, recent] = await Promise.all([
    getJson('/fapi/v1/exchangeInfo'), getJson('/fapi/v1/ticker/24hr'), recentSymbols(),
  ]);
  const tradable = new Set(exchangeInfo.symbols
    .filter((s) => s.status === 'TRADING' && s.contractType === 'PERPETUAL' && s.quoteAsset === 'USDT')
    .map((s) => s.symbol));
  const candidates = tickers
    .filter((t) => tradable.has(t.symbol) && Number(t.priceChangePercent) > 0)
    .filter((t) => Number(t.quoteVolume) >= config.minQuoteVolume)
    .sort((a, b) => Number(b.priceChangePercent) - Number(a.priceChangePercent));
  const chosen = candidates.find((t) => !recent.includes(t.symbol));
  if (!chosen) throw new Error('No eligible 24-hour Futures gainer outside the five-signal rotation');
  return { symbol: chosen.symbol, changePercent24h: Number(chosen.priceChangePercent) };
}

const average = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
const formatPrice = (value) => value >= 1000 ? value.toFixed(2) : value >= 1 ? value.toFixed(4) : value >= 0.01 ? value.toFixed(5) : value.toPrecision(5);

export async function getFifteenMinutePlan(symbol, gainer) {
  const candles = await getJson(`/fapi/v1/klines?symbol=${symbol}&interval=15m&limit=100`);
  const parsed = candles.map((c) => ({ high: Number(c[2]), low: Number(c[3]), close: Number(c[4]) }));
  const closes = parsed.map((c) => c.close);
  const last = closes.at(-1);
  const fast = average(closes.slice(-9));
  const slow = average(closes.slice(-21));
  const atr = average(parsed.slice(-15).map((c, i, values) => {
    const priorClose = i === 0 ? closes.at(-16) : values[i - 1].close;
    return Math.max(c.high - c.low, Math.abs(c.high - priorClose), Math.abs(c.low - priorClose));
  }));
  const direction = fast >= slow ? 'BULLISH' : 'BEARISH';
  const entryLow = direction === 'BULLISH' ? last - atr * 0.35 : last + atr * 0.1;
  const entryHigh = direction === 'BULLISH' ? last + atr * 0.1 : last + atr * 0.35;
  const stop = direction === 'BULLISH' ? entryLow - atr * 1.1 : entryHigh + atr * 1.1;
  const risk = Math.abs((entryLow + entryHigh) / 2 - stop);
  const midpoint = (entryLow + entryHigh) / 2;
  const sign = direction === 'BULLISH' ? 1 : -1;
  return {
    ...gainer, interval: '15m', direction, currentPrice: formatPrice(last),
    entryLow: formatPrice(entryLow), entryHigh: formatPrice(entryHigh), stop: formatPrice(stop),
    targets: [1, 1.5, 2, 3].map((r) => formatPrice(midpoint + sign * risk * r)),
  };
}

export async function rememberSymbol(symbol) {
  const recent = await recentSymbols();
  const symbols = [symbol, ...recent.filter((item) => item !== symbol)].slice(0, config.noRepeatSignals);
  await mkdir(dirname(config.signalStatePath), { recursive: true });
  await writeFile(config.signalStatePath, JSON.stringify({ symbols, updatedAt: new Date().toISOString() }), 'utf8');
}
