/**
 * GPS Track Smoothing PoC - Main Entry Point
 *
 * Demonstrates trajectory reconstruction using sensor fusion:
 * 1. GPS-only Kalman Filter (baseline)
 * 2. INS/GPS Sensor Fusion with 7-state Extended Kalman Filter
 *
 * Input: RaceChrono CSV with GPS + accelerometer + gyroscope (25Hz)
 *
 * @module index
 */

import CONFIG from './config.js';
import { readRaceChronoCSV } from './io/csv-parser.js';
import { generateHTML } from './io/html-generator.js';
import { downsampleGPS, addGPSNoise, filterGPSOutliers } from './gps/index.js';
import { applyLinearInterpolation } from './interpolation/linear.js';
import { applySplineInterpolation } from './interpolation/spline.js';
import { calculateAccuracyMetrics } from './analysis/metrics.js';
import { enhanceTelemetryPoints, createChartData } from './analysis/distance.js';
import { runAllAlgorithms, printMetricsTable } from './runner.js';

/**
 * Processes a single lap and returns results.
 * @param {Array} fullDataRaw - Raw telemetry data
 * @param {number} lapNumber - Lap number to process
 * @returns {Object|null} Lap results or null if no data
 */
function processLap(fullDataRaw, lapNumber) {
  // Filter data for this lap
  const lapDataRaw = fullDataRaw.filter(p => p.lap === lapNumber);
  if (lapDataRaw.length === 0) return null;

  // Normalize timestamps
  const t0 = lapDataRaw[0].timestamp;
  lapDataRaw.forEach(p => p.timestamp -= t0);

  // Enhance telemetry with distance, position, and lap time
  const { points: lapData, totalDistance, duration } = enhanceTelemetryPoints(lapDataRaw);

  // Create chart data (downsampled to 2Hz for performance)
  const chartData = createChartData(lapData, 2);

  // Downsample GPS
  const gpsDownsampled = downsampleGPS(lapData);

  // Clean GPS
  const cleanOutlierResult = filterGPSOutliers(gpsDownsampled);
  const cleanGPS = cleanOutlierResult.filtered;

  // Noisy GPS
  const noisyGPSRaw = addGPSNoise(gpsDownsampled);
  const noisyOutlierResult = filterGPSOutliers(noisyGPSRaw);
  const noisyGPS = noisyOutlierResult.filtered;

  // Run algorithms (simplified - only Linear and Spline for speed)
  const cleanLinear = applyLinearInterpolation(lapData, cleanGPS);
  const cleanSpline = applySplineInterpolation(lapData, cleanGPS);
  const noisyLinear = applyLinearInterpolation(lapData, noisyGPS);
  const noisySpline = applySplineInterpolation(lapData, noisyGPS);

  return {
    lap: lapNumber,
    groundTruth: lapData,
    totalDistance,
    chartData,
    cleanGPS,
    noisyGPS,
    cleanLinear,
    cleanSpline,
    noisyLinear,
    noisySpline,
    cleanMetrics: {
      linear: calculateAccuracyMetrics(lapData, cleanLinear),
      spline: calculateAccuracyMetrics(lapData, cleanSpline),
    },
    noisyMetrics: {
      linear: calculateAccuracyMetrics(lapData, noisyLinear),
      spline: calculateAccuracyMetrics(lapData, noisySpline),
    },
    duration,
  };
}

/**
 * Main entry point.
 */
async function main() {
  console.log('+===================================================================+');
  console.log('|       GPS Track Smoothing - INS/GPS Sensor Fusion PoC            |');
  console.log('+===================================================================+\n');

  // 1. Read RaceChrono data
  console.log('1. Reading RaceChrono data');
  const fullDataRaw = await readRaceChronoCSV(CONFIG.input.file);

  // Find unique laps
  const laps = [...new Set(fullDataRaw.map(p => p.lap))].filter(n => n > 0).sort((a, b) => a - b);
  console.log(`   Laps available: ${laps.join(', ') || 'none'}`);

  // 2. Process all laps
  console.log('\n2. Processing all laps for map...');
  const allLapsData = {};
  for (const lap of laps) {
    process.stdout.write(`   Lap ${lap}...`);
    allLapsData[lap] = processLap(fullDataRaw, lap);
    console.log(` ${allLapsData[lap].groundTruth.length} points`);
  }

  // 3. Detailed analysis for selected lap (or lap 1)
  const selectedLap = parseInt(process.argv[2]) || laps[0];
  console.log(`\n-------------------------------------------------------------------`);
  console.log(`3. DETAILED ANALYSIS - Lap ${selectedLap}`);
  console.log('-------------------------------------------------------------------');

  // Get full data for selected lap with enhanced telemetry
  const fullDataRaw2 = fullDataRaw.filter(p => p.lap === selectedLap);
  const t0 = fullDataRaw2[0].timestamp;
  fullDataRaw2.forEach(p => p.timestamp -= t0);

  const { points: fullData, totalDistance: selectedTotalDistance } = enhanceTelemetryPoints(fullDataRaw2);

  const gpsDownsampled = downsampleGPS(fullData);
  const cleanOutliers = filterGPSOutliers(gpsDownsampled);
  const cleanGPS = cleanOutliers.filtered;
  const noisyGPSRaw = addGPSNoise(gpsDownsampled);
  const noisyOutliers = filterGPSOutliers(noisyGPSRaw);
  const noisyGPS = noisyOutliers.filtered;

  console.log(`   Duration: ${(fullData[fullData.length - 1].lapTime / 60).toFixed(1)} min`);
  console.log(`   Distance: ${(selectedTotalDistance / 1000).toFixed(2)} km`);
  console.log(`   GPS points: ${gpsDownsampled.length}`);
  console.log(`   Outliers detected (clean): ${cleanOutliers.outliers.length} (${(cleanOutliers.outliers.length / gpsDownsampled.length * 100).toFixed(1)}%)`);
  console.log(`   Outliers detected (noisy): ${noisyOutliers.outliers.length} (${(noisyOutliers.outliers.length / gpsDownsampled.length * 100).toFixed(1)}%)`);

  // Run full algorithms with EKF
  console.log('\n   Running full analysis with EKF...');
  const cleanResults = runAllAlgorithms(fullData, cleanGPS);
  const noisyResults = runAllAlgorithms(fullData, noisyGPS);

  printMetricsTable(cleanResults.metrics, 'Clean GPS Results');
  printMetricsTable(noisyResults.metrics, `Noisy GPS Results (${CONFIG.noise.minMeters}-${CONFIG.noise.maxMeters}m)`);

  // Comparison summary
  console.log('\n-------------------------------------------------------------------');
  console.log('4. COMPARISON SUMMARY');
  console.log('-------------------------------------------------------------------');

  console.log('\n   +-----------------------+----------------+----------------+------------+');
  console.log('   | Algorithm             | Clean RMSE (m) | Noisy RMSE (m) | Delta (m)  |');
  console.log('   +-----------------------+----------------+----------------+------------+');

  const algorithms = ['linear', 'spline', 'ekfRaw', 'ekfSmooth', 'ekfBest'];
  const labels = ['Linear', 'Spline (Catmull-Rom)', 'EKF Raw', 'EKF + Spline', 'EKF Best Config'];

  for (let i = 0; i < algorithms.length; i++) {
    const alg = algorithms[i];
    const cleanRmse = cleanResults.metrics[alg].rmse;
    const noisyRmse = noisyResults.metrics[alg].rmse;
    const delta = noisyRmse - cleanRmse;
    const deltaStr = delta >= 0 ? `+${delta.toFixed(3)}` : delta.toFixed(3);
    console.log(`   | ${labels[i].padEnd(21)} | ${cleanRmse.toFixed(3).padStart(14)} | ${noisyRmse.toFixed(3).padStart(14)} | ${deltaStr.padStart(10)} |`);
  }

  console.log('   +-----------------------+----------------+----------------+------------+');

  const bestClean = Object.entries(cleanResults.metrics).sort((a, b) => a[1].rmse - b[1].rmse)[0];
  const bestNoisy = Object.entries(noisyResults.metrics).sort((a, b) => a[1].rmse - b[1].rmse)[0];
  console.log(`\n   Best for Clean GPS: ${bestClean[0]} (RMSE=${bestClean[1].rmse.toFixed(3)}m)`);
  console.log(`   Best for Noisy GPS: ${bestNoisy[0]} (RMSE=${bestNoisy[1].rmse.toFixed(3)}m)`);

  // 5. Generate HTML map with ALL laps
  console.log('\n5. Generating HTML map with lap selector');
  generateHTML({
    allLapsData: allLapsData,
    selectedLapData: {
      groundTruth: fullData,
      cleanGPS,
      noisyGPS,
      cleanResults,
      noisyResults,
    },
    laps: laps,
    selectedLap: selectedLap,
    config: CONFIG,
  }, 'map.html');

  console.log('\n+===================================================================+');
  console.log('|                           Done!                                   |');
  console.log('+===================================================================+');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
