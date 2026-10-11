/**
 * Algorithm orchestration.
 * @module runner
 */

import { applyLinearInterpolation } from './interpolation/linear.js';
import { applySplineInterpolation } from './interpolation/spline.js';
import { applyHermiteInterpolation } from './interpolation/hermite.js';
import { runSensorFusion } from './filters/ekf-ins-gps.js';
import { calculateAccuracyMetrics } from './analysis/metrics.js';
import { configuredDelays } from './gps/delay-estimation.js';

/**
 * Runs all interpolation algorithms on given GPS data.
 * @param {Array} fullData - Ground truth data (25Hz)
 * @param {Array} gpsData - GPS data to interpolate (1Hz)
 * @param {Object} [delays] - Channel delays (see gps/delay-estimation.js)
 * @returns {Object} { linear, spline, hermite, ekfRaw, ekfSmooth, metrics }
 */
export function runAllAlgorithms(fullData, gpsData, delays = configuredDelays()) {
  // Linear interpolation
  const linear = applyLinearInterpolation(fullData, gpsData);

  // Spline interpolation
  const spline = applySplineInterpolation(fullData, gpsData);

  // Hermite interpolation (uses GPS speed and bearing)
  const hermite = applyHermiteInterpolation(fullData, gpsData, delays.gpsVelocity);

  // EKF: forward filter and RTS-smoothed trajectory
  const { filtered: ekfRaw, smoothed: ekfSmooth } = runSensorFusion(fullData, gpsData, delays);

  // Calculate metrics
  const metrics = {
    // The input itself: error of the GPS fixes the algorithms were given
    gpsFixes: calculateAccuracyMetrics(fullData, gpsData),
    linear: calculateAccuracyMetrics(fullData, linear),
    spline: calculateAccuracyMetrics(fullData, spline),
    hermite: calculateAccuracyMetrics(fullData, hermite),
    ekfRaw: calculateAccuracyMetrics(fullData, ekfRaw),
    ekfSmooth: calculateAccuracyMetrics(fullData, ekfSmooth),
  };

  return { linear, spline, hermite, ekfRaw, ekfSmooth, metrics };
}

/**
 * Prints metrics table to console.
 * @param {Object} metrics - Metrics object with algorithm results
 * @param {string} label - Table header label
 */
export function printMetricsTable(metrics, label) {
  console.log(`\n   ${label}`);
  console.log('   +-----------------------+----------+----------+----------+');
  console.log('   | Algorithm             | RMSE (m) | MAE (m)  | Max (m)  |');
  console.log('   +-----------------------+----------+----------+----------+');
  console.log(`   | GPS fixes (input)     | ${metrics.gpsFixes.rmse.toFixed(3).padStart(8)} | ${metrics.gpsFixes.mae.toFixed(3).padStart(8)} | ${metrics.gpsFixes.maxError.toFixed(3).padStart(8)} |`);
  console.log(`   | Linear                | ${metrics.linear.rmse.toFixed(3).padStart(8)} | ${metrics.linear.mae.toFixed(3).padStart(8)} | ${metrics.linear.maxError.toFixed(3).padStart(8)} |`);
  console.log(`   | Spline (Catmull-Rom)  | ${metrics.spline.rmse.toFixed(3).padStart(8)} | ${metrics.spline.mae.toFixed(3).padStart(8)} | ${metrics.spline.maxError.toFixed(3).padStart(8)} |`);
  console.log(`   | Hermite (GPS velocity)| ${metrics.hermite.rmse.toFixed(3).padStart(8)} | ${metrics.hermite.mae.toFixed(3).padStart(8)} | ${metrics.hermite.maxError.toFixed(3).padStart(8)} |`);
  console.log(`   | EKF Raw               | ${metrics.ekfRaw.rmse.toFixed(3).padStart(8)} | ${metrics.ekfRaw.mae.toFixed(3).padStart(8)} | ${metrics.ekfRaw.maxError.toFixed(3).padStart(8)} |`);
  console.log(`   | EKF + RTS smoother    | ${metrics.ekfSmooth.rmse.toFixed(3).padStart(8)} | ${metrics.ekfSmooth.mae.toFixed(3).padStart(8)} | ${metrics.ekfSmooth.maxError.toFixed(3).padStart(8)} |`);
  console.log('   +-----------------------+----------+----------+----------+');
}
