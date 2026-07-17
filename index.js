import cron from 'node-cron';
import { config } from './config.js';
import { screenshotChart } from './screenshotChart.js';
import { generateSignal } from './generateSignal.js';
import { postToSquare } from './postToSquare.js';

async function runCycle() {
  console.log(`[cycle] starting at ${new Date().toISOString()}, symbols: ${config.symbols.join(', ')}`);

  for (const symbol of config.symbols) {
    try {
      console.log(`[cycle] ${symbol}: capturing chart`);
      const image = await screenshotChart(symbol);

      console.log(`[cycle] ${symbol}: generating commentary`);
      const text = await generateSignal(symbol, image);

      console.log(`[cycle] ${symbol}: posting`);
      await postToSquare(symbol, text, image);

      console.log(`[cycle] ${symbol}: done`);
    } catch (err) {
      // One symbol failing should not kill the whole worker or the schedule.
      console.error(`[cycle] ${symbol}: FAILED —`, err.message);
    }
  }

  console.log(`[cycle] finished at ${new Date().toISOString()}`);
}

console.log(`[worker] starting. schedule="${config.cronSchedule}" dryRun=${config.dryRun}`);

// Run once immediately on boot, then on schedule.
runCycle();
cron.schedule(config.cronSchedule, runCycle);

// Keep the process alive (Railway worker service).
process.stdin.resume();
