/**
 * Analysis utilities barrel export.
 * @module analysis
 */

export { calculateAccuracyMetrics } from './metrics.js';
export { findSpeedExtrema } from './speed-extrema.js';
export {
  addDistanceToPoints,
  addLapPosition,
  addLapTime,
  enhanceTelemetryPoints,
  createChartData,
  createPositionTimeMap,
  interpolateTimeAtPosition,
  interpolateAtPosition,
} from './distance.js';
