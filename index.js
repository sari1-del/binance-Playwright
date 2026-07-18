import cron from 'node-cron';
import { config } from './config.js';
import { screenshotChart } from './screenshotChart.js';
import { generateSignal } from './generateSignal.js';
import { postToSquare } from './postToSquare.js';
import { getFifteenMinutePlan, rememberSymbol, selectTopGainer } from './marketData.js';

async function runCycle() {
  console.log(`[cycle] starting at ${new Date().toISOString()}, scanning USD-M Futures 24-hour gainers`);
  try {
    const gainer = await selectTopGainer();
    const plan = await getFifteenMinutePlan(gainer.symbol, gainer);
    console.log(`[cycle] selected ${plan.symbol}: +${plan.changePercent24h.toFixed(2)}% in 24h`);
    console.log(`[cycle] ${plan.symbol}: capturing chart`);
    const image = await screenshotChart(plan.symbol);
    console.log(`[cycle] ${plan.symbol}: generating post`);
    const text = await generateSignal(plan, image);
    console.log(`[cycle] ${plan.symbol}: posting`);
    await postToSquare(plan.symbol, text, image);
    await rememberSymbol(plan.symbol);
    console.log(`[cycle] ${plan.symbol}: done`);
  } catch (error) {
    console.error(`[cycle] FAILED -`, error.message);
  }
  console.log(`[cycle] finished at ${new Date().toISOString()}`);
}

console.log(`[worker] starting. schedule="${config.cronSchedule}" dryRun=${config.dryRun}`);
runCycle();
cron.schedule(config.cronSchedule, runCycle);
process.stdin.resume();
