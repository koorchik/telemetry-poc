/**
 * Trajectory accuracy metrics calculation.
 * @module analysis/metrics
 */

import { haversineDistance } from '../math/geometry.js';

/**
 * @typedef {Object} AccuracyMetrics
 * @property {number} mse - Mean Squared Error
 * @property {number} rmse - Root Mean Squared Error
 * @property {number} mae - Mean Absolute Error
 * @property {number} maxError - Maximum error
 * @property {number} count - Number of matched points
 */

/**
 * Calculates accuracy metrics of estimated trajectory vs ground truth.
 * @param {Array} groundTruth - Reference trajectory [{timestamp, lat, lon}]
 * @param {Array} estimated - Estimated trajectory [{timestamp, lat, lon}]
 * @returns {AccuracyMetrics} Metrics in meters
 */
export function calculateAccuracyMetrics(groundTruth, estimated) {
  if (estimated.length === 0) {
    return { mse: Infinity, rmse: Infinity, mae: Infinity, maxError: Infinity, count: 0 };
  }

  // Create index for fast timestamp lookup
  const estMap = new Map();
  for (const p of estimated) {
    estMap.set(p.timestamp.toFixed(3), p);
  }

  let sumSquaredError = 0;
  let sumAbsError = 0;
  let maxError = 0;
  let count = 0;

  for (const gt of groundTruth) {
    const key = gt.timestamp.toFixed(3);
    const est = estMap.get(key);
    if (!est) continue;

    const error = haversineDistance(gt.lat, gt.lon, est.lat, est.lon);
    sumSquaredError += error * error;
    sumAbsError += error;
    maxError = Math.max(maxError, error);
    count++;
  }

  if (count === 0) {
    return { mse: Infinity, rmse: Infinity, mae: Infinity, maxError: Infinity, count: 0 };
  }

  const mse = sumSquaredError / count;
  return {
    mse: mse,
    rmse: Math.sqrt(mse),
    mae: sumAbsError / count,
    maxError: maxError,
    count: count
  };
}
