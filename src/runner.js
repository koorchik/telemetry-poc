/**
 * Algorithm orchestration and experiment runner.
 * @module runner
 */

import CONFIG from './config.js';
import { applyLinearInterpolation } from './interpolation/linear.js';
import { applySplineInterpolation, smoothTrajectoryWithSpline } from './interpolation/spline.js';
import { runSensorFusion } from './filters/ekf-ins-gps.js';
import { calculateAccuracyMetrics } from './analysis/metrics.js';

/**
 * Runs EKF with given parameters and returns metrics.
 * @param {Array} fullData - Full telemetry data
 * @param {Array} noisyGPS - GPS points
 * @param {Object} ekfConfig - EKF configuration to test
 * @returns {Object} Accuracy metrics
 */
export function runEkfExperiment(fullData, noisyGPS, ekfConfig) {
  // Save original parameters
  const originalConfig = { ...CONFIG.ekf };

  // Apply experimental parameters
  Object.assign(CONFIG.ekf, ekfConfig);

  // Run EKF
  const ekfResult = runSensorFusion(fullData, noisyGPS);

  // Calculate metrics
  const metrics = calculateAccuracyMetrics(fullData, ekfResult);

  // Restore original parameters
  Object.assign(CONFIG.ekf, originalConfig);

  return metrics;
}

/**
 * Runs a series of EKF experiments with different configurations.
 * @param {Array} fullData - Full telemetry data
 * @param {Array} noisyGPS - GPS points
 * @returns {Array} Results sorted by RMSE (best first)
 */
export function runEkfExperiments(fullData, noisyGPS) {
  const experiments = [
    { label: 'Default', sigma_accel: 0.5, sigma_gyro: 0.02, sigma_bias: 0.001, gps_pos_noise: 5.0 },
    { label: 'Trust GPS more', sigma_accel: 2.0, sigma_gyro: 0.1, sigma_bias: 0.001, gps_pos_noise: 2.0 },
    { label: 'Trust IMU more', sigma_accel: 0.1, sigma_gyro: 0.01, sigma_bias: 0.01, gps_pos_noise: 15.0 },
    { label: 'High bias adapt', sigma_accel: 0.5, sigma_gyro: 0.02, sigma_bias: 0.1, gps_pos_noise: 5.0 },
    { label: 'Very high GPS trust', sigma_accel: 5.0, sigma_gyro: 0.2, sigma_bias: 0.001, gps_pos_noise: 1.0 },
    { label: 'Balanced v2', sigma_accel: 1.0, sigma_gyro: 0.05, sigma_bias: 0.01, gps_pos_noise: 3.0 },
    { label: 'Low accel noise', sigma_accel: 0.2, sigma_gyro: 0.02, sigma_bias: 0.01, gps_pos_noise: 5.0 },
    { label: 'High accel noise', sigma_accel: 3.0, sigma_gyro: 0.05, sigma_bias: 0.001, gps_pos_noise: 3.0 },
  ];

  const results = [];

  for (const exp of experiments) {
    const config = {
      sigma_accel: exp.sigma_accel,
      sigma_gyro: exp.sigma_gyro,
      sigma_bias: exp.sigma_bias,
      gps_pos_noise: exp.gps_pos_noise,
    };

    const metrics = runEkfExperiment(fullData, noisyGPS, config);
    results.push({ ...exp, ...metrics });
  }

  // Sort by RMSE
  results.sort((a, b) => a.rmse - b.rmse);

  return results;
}

/**
 * Runs all interpolation algorithms on given GPS data.
 * @param {Array} fullData - Ground truth data (25Hz)
 * @param {Array} gpsData - GPS data to interpolate (1Hz)
 * @returns {Object} { linear, spline, ekfRaw, ekfSmooth, ekfBest, metrics }
 */
export function runAllAlgorithms(fullData, gpsData) {
  // Linear interpolation
  const linear = applyLinearInterpolation(fullData, gpsData);

  // Spline interpolation
  const spline = applySplineInterpolation(fullData, gpsData);

  // EKF raw
  const ekfRaw = runSensorFusion(fullData, gpsData);

  // EKF + Spline smoothing
  const ekfSmooth = smoothTrajectoryWithSpline(ekfRaw, CONFIG.sampling.imuHz);

  // EKF experiments to find best config
  const ekfExperiments = runEkfExperiments(fullData, gpsData);
  const bestConfig = ekfExperiments[0];

  // Run EKF with best config
  const originalEkfConfig = { ...CONFIG.ekf };
  Object.assign(CONFIG.ekf, {
    sigma_accel: bestConfig.sigma_accel,
    sigma_gyro: bestConfig.sigma_gyro,
    sigma_bias: bestConfig.sigma_bias,
    gps_pos_noise: bestConfig.gps_pos_noise,
  });
  const ekfBest = runSensorFusion(fullData, gpsData);
  Object.assign(CONFIG.ekf, originalEkfConfig);

  // Calculate metrics
  const metrics = {
    linear: calculateAccuracyMetrics(fullData, linear),
    spline: calculateAccuracyMetrics(fullData, spline),
    ekfRaw: calculateAccuracyMetrics(fullData, ekfRaw),
    ekfSmooth: calculateAccuracyMetrics(fullData, ekfSmooth),
    ekfBest: { ...calculateAccuracyMetrics(fullData, ekfBest), config: bestConfig },
  };

  return { linear, spline, ekfRaw, ekfSmooth, ekfBest, metrics };
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
  console.log(`   | Linear                | ${metrics.linear.rmse.toFixed(3).padStart(8)} | ${metrics.linear.mae.toFixed(3).padStart(8)} | ${metrics.linear.maxError.toFixed(3).padStart(8)} |`);
  console.log(`   | Spline (Catmull-Rom)  | ${metrics.spline.rmse.toFixed(3).padStart(8)} | ${metrics.spline.mae.toFixed(3).padStart(8)} | ${metrics.spline.maxError.toFixed(3).padStart(8)} |`);
  console.log(`   | EKF Raw               | ${metrics.ekfRaw.rmse.toFixed(3).padStart(8)} | ${metrics.ekfRaw.mae.toFixed(3).padStart(8)} | ${metrics.ekfRaw.maxError.toFixed(3).padStart(8)} |`);
  console.log(`   | EKF + Spline          | ${metrics.ekfSmooth.rmse.toFixed(3).padStart(8)} | ${metrics.ekfSmooth.mae.toFixed(3).padStart(8)} | ${metrics.ekfSmooth.maxError.toFixed(3).padStart(8)} |`);
  console.log(`   | EKF Best Config       | ${metrics.ekfBest.rmse.toFixed(3).padStart(8)} | ${metrics.ekfBest.mae.toFixed(3).padStart(8)} | ${metrics.ekfBest.maxError.toFixed(3).padStart(8)} |`);
  console.log('   +-----------------------+----------+----------+----------+');
}
