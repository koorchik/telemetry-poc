/**
 * Runs the processing pipeline on the sample data in Node.js and prints
 * accuracy metrics for every algorithm. Development tool, not part of the app.
 *
 * Usage: npm install && node scripts/benchmark.js [path/to/racechrono.csv]
 */

import { readFileSync } from 'node:fs';
import CONFIG from '../src/config.js';
import { processCSV } from '../src/browser/process.js';
import { printMetricsTable } from '../src/runner.js';

const csvPath = process.argv[2] ?? new URL('../src/data/sample-data.csv', import.meta.url);

// Repeatable noise so runs can be compared
CONFIG.noise.seed = 42;

// The pipeline logs progress per lap; keep the report readable
const log = console.log;
console.log = () => {};
const started = Date.now();
const { laps, allLapsData } = processCSV(readFileSync(csvPath, 'utf8'));
console.log = log;

const algorithms = Object.keys(allLapsData[laps[0]].cleanMetrics);

console.log(`Processed ${laps.length} laps in ${((Date.now() - started) / 1000).toFixed(1)} s`);
console.log(`\n   RMSE (m) per lap, clean / noisy GPS`);
console.log(`   lap  dur(s)  fix(s)  outliers  ${algorithms.map(a => a.padStart(13)).join('')}`);

for (const lap of laps) {
  const d = allLapsData[lap];
  const fixes = d.cleanGPS;
  const spacing = (fixes[fixes.length - 1].timestamp - fixes[0].timestamp) / (fixes.length - 1);
  const cells = algorithms.map(a =>
    `${d.cleanMetrics[a].rmse.toFixed(2)} / ${d.noisyMetrics[a].rmse.toFixed(2)}`.padStart(13)
  );
  console.log(
    `   ${String(lap).padStart(3)}  ${d.duration.toFixed(1).padStart(6)}  ${spacing.toFixed(2).padStart(6)}  ` +
    `${`${d.outliers.clean}+${d.outliers.noisy}/${d.outliers.total}`.padStart(8)}  ${cells.join('')}`
  );
}

/**
 * Averages each metric over all laps.
 * @param {string} key - 'cleanMetrics' or 'noisyMetrics'
 * @returns {Object} Metrics object in the shape printMetricsTable expects
 */
function average(key) {
  const result = {};
  for (const a of algorithms) {
    const perLap = laps.map(lap => allLapsData[lap][key][a]);
    result[a] = {
      rmse: perLap.reduce((sum, m) => sum + m.rmse, 0) / perLap.length,
      mae: perLap.reduce((sum, m) => sum + m.mae, 0) / perLap.length,
      maxError: Math.max(...perLap.map(m => m.maxError)),
    };
  }
  return result;
}

const { minMeters, maxMeters } = CONFIG.noise;
printMetricsTable(average('cleanMetrics'), `Clean GPS, mean over ${laps.length} laps (Max = worst lap)`);
printMetricsTable(average('noisyMetrics'), `Noisy GPS (${minMeters}-${maxMeters}m), mean over ${laps.length} laps (Max = worst lap)`);
