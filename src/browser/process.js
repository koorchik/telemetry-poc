/**
 * Browser-compatible processing pipeline.
 * Processes RaceChrono CSV data entirely in the browser.
 * @module browser/process
 */

import { parseCSVString } from '../io/csv-parser.js';
import { downsampleGPS, addGPSNoise, filterGPSOutliers } from '../gps/index.js';
import { enhanceTelemetryPoints, createChartData } from '../analysis/distance.js';
import { runAllAlgorithms } from '../runner.js';

/**
 * Default configuration for browser processing.
 */
const DEFAULT_CONFIG = {
  input: { skipLines: 12 },
  sampling: { imuHz: 25, gpsHz: 1 },
  noise: { enabled: true, minMeters: 3, maxMeters: 8 },
};

/**
 * Processes a single lap.
 * @param {Array} fullDataRaw - Raw telemetry data
 * @param {number} lapNumber - Lap number to process
 * @returns {Object|null} Lap results or null if no data
 */
function processLap(fullDataRaw, lapNumber) {
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

  // Run all algorithms including EKF
  const cleanResults = runAllAlgorithms(lapData, cleanGPS);
  const noisyResults = runAllAlgorithms(lapData, noisyGPS);

  return {
    lap: lapNumber,
    groundTruth: lapData,
    totalDistance,
    chartData,
    cleanGPS,
    noisyGPS,
    cleanLinear: cleanResults.linear,
    cleanSpline: cleanResults.spline,
    cleanEkfRaw: cleanResults.ekfRaw,
    cleanEkfSmooth: cleanResults.ekfSmooth,
    noisyLinear: noisyResults.linear,
    noisySpline: noisyResults.spline,
    noisyEkfRaw: noisyResults.ekfRaw,
    noisyEkfSmooth: noisyResults.ekfSmooth,
    cleanMetrics: cleanResults.metrics,
    noisyMetrics: noisyResults.metrics,
    outliers: {
      clean: cleanOutlierResult.outliers.length,
      noisy: noisyOutlierResult.outliers.length,
      total: gpsDownsampled.length,
    },
    duration,
  };
}

/**
 * Processes CSV text and returns visualization data.
 * @param {string} csvText - Raw CSV text
 * @param {Object} [config] - Optional configuration override
 * @param {Function} [onProgress] - Progress callback (stage, message)
 * @returns {Object} Processed data ready for visualization
 */
export function processCSV(csvText, config = {}, onProgress = () => {}) {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  // 1. Parse CSV
  onProgress('parsing', 'Parsing CSV data...');
  const fullDataRaw = parseCSVString(csvText, cfg.input.skipLines);

  if (fullDataRaw.length === 0) {
    throw new Error('No valid telemetry data found in CSV');
  }

  // 2. Find unique laps
  const laps = [...new Set(fullDataRaw.map(p => p.lap))]
    .filter(n => n > 0)
    .sort((a, b) => a - b);

  if (laps.length === 0) {
    throw new Error('No laps found in telemetry data');
  }

  onProgress('laps', `Found ${laps.length} laps with ${fullDataRaw.length} points`);

  // 3. Process all laps
  const allLapsData = {};
  for (let i = 0; i < laps.length; i++) {
    const lap = laps[i];
    onProgress('processing', `Processing lap ${lap} (${i + 1}/${laps.length})...`);
    allLapsData[lap] = processLap(fullDataRaw, lap);
  }

  // 4. Run detailed analysis on first lap
  const selectedLap = laps[0];
  onProgress('analysis', `Running detailed EKF analysis on lap ${selectedLap}...`);

  const fullDataRaw2 = fullDataRaw.filter(p => p.lap === selectedLap);
  const t0 = fullDataRaw2[0].timestamp;
  fullDataRaw2.forEach(p => p.timestamp -= t0);

  const { points: fullData, totalDistance } = enhanceTelemetryPoints(fullDataRaw2);

  const gpsDownsampled = downsampleGPS(fullData);
  const cleanOutliers = filterGPSOutliers(gpsDownsampled);
  const cleanGPS = cleanOutliers.filtered;
  const noisyGPSRaw = addGPSNoise(gpsDownsampled);
  const noisyOutliers = filterGPSOutliers(noisyGPSRaw);
  const noisyGPS = noisyOutliers.filtered;

  // Run full algorithms with EKF
  onProgress('ekf', 'Running EKF sensor fusion algorithms...');
  const cleanResults = runAllAlgorithms(fullData, cleanGPS);
  const noisyResults = runAllAlgorithms(fullData, noisyGPS);

  onProgress('complete', 'Processing complete!');

  return {
    laps,
    selectedLap,
    allLapsData,
    selectedLapData: {
      groundTruth: fullData,
      cleanGPS,
      noisyGPS,
      cleanResults,
      noisyResults,
      totalDistance,
      outliers: {
        clean: cleanOutliers.outliers.length,
        noisy: noisyOutliers.outliers.length,
        total: gpsDownsampled.length,
      },
    },
    config: cfg,
  };
}
