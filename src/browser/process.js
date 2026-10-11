/**
 * Browser-compatible processing pipeline.
 * Processes RaceChrono CSV data entirely in the browser.
 * @module browser/process
 */

import { parseCSVString } from '../io/csv-parser.js';
import {
  downsampleGPS,
  addGPSNoise,
  filterGPSOutliers,
  resampleUniform,
  estimateChannelDelays,
  configuredDelays,
} from '../gps/index.js';
import { enhanceTelemetryPoints, createChartData } from '../analysis/distance.js';
import { runAllAlgorithms } from '../runner.js';
import { seedRandom } from '../math/geometry.js';
import CONFIG from '../config.js';

/**
 * Builds the ground truth and the simulated GPS fixes of a single lap.
 * @param {Array} fullDataRaw - Raw telemetry data
 * @param {number} lapNumber - Lap number to prepare
 * @param {Object} noise - Noise settings for the noisy GPS set
 * @returns {Object|null} Lap inputs or null if no data
 */
function prepareLap(fullDataRaw, lapNumber, noise) {
  const lapDataRaw = fullDataRaw.filter(p => p.lap === lapNumber);
  if (lapDataRaw.length === 0) return null;

  // Normalize timestamps
  const t0 = lapDataRaw[0].timestamp;
  lapDataRaw.forEach(p => p.timestamp -= t0);

  // RaceChrono rows are irregular (~45/s); put them on a uniform grid
  const lapDataUniform = resampleUniform(lapDataRaw, CONFIG.sampling.imuHz);

  // Enhance telemetry with distance, position, and lap time
  const { points: lapData, totalDistance, duration } = enhanceTelemetryPoints(lapDataUniform);

  // Downsample GPS
  const gpsDownsampled = downsampleGPS(lapData);

  // Clean GPS
  const cleanOutlierResult = filterGPSOutliers(gpsDownsampled);

  // Noisy GPS
  const noisyOutlierResult = filterGPSOutliers(addGPSNoise(gpsDownsampled, noise));

  return {
    lap: lapNumber,
    lapData,
    totalDistance,
    duration,
    cleanGPS: cleanOutlierResult.filtered,
    noisyGPS: noisyOutlierResult.filtered,
    outliers: {
      clean: cleanOutlierResult.outliers.length,
      noisy: noisyOutlierResult.outliers.length,
      total: gpsDownsampled.length,
    },
  };
}

/**
 * Runs all algorithms on a prepared lap.
 * @param {Object} prepared - Result of prepareLap
 * @param {{clean: Object, noisy: Object}} delays - Channel delays per GPS set
 * @returns {Object} Lap results
 */
function processLap(prepared, delays) {
  const { lap, lapData, totalDistance, duration, cleanGPS, noisyGPS, outliers } = prepared;

  // Run all algorithms including EKF
  const cleanResults = runAllAlgorithms(lapData, cleanGPS, delays.clean);
  const noisyResults = runAllAlgorithms(lapData, noisyGPS, delays.noisy);

  return {
    lap,
    groundTruth: lapData,
    totalDistance,
    // Chart data (downsampled to 2Hz for performance)
    chartData: createChartData(lapData, 2),
    cleanGPS,
    noisyGPS,
    cleanLinear: cleanResults.linear,
    cleanSpline: cleanResults.spline,
    cleanHermite: cleanResults.hermite,
    cleanEkfRaw: cleanResults.ekfRaw,
    cleanEkfSmooth: cleanResults.ekfSmooth,
    noisyLinear: noisyResults.linear,
    noisySpline: noisyResults.spline,
    noisyHermite: noisyResults.hermite,
    noisyEkfRaw: noisyResults.ekfRaw,
    noisyEkfSmooth: noisyResults.ekfSmooth,
    cleanMetrics: cleanResults.metrics,
    noisyMetrics: noisyResults.metrics,
    outliers,
    delays,
    duration,
  };
}

/**
 * Processes CSV text and returns visualization data.
 * @param {string} csvText - Raw CSV text
 * @param {Object} [config] - Overrides of CONFIG.input and CONFIG.noise,
 *   e.g. { noise: { minMeters: 3, maxMeters: 8 } }
 * @param {Function} [onProgress] - Progress callback (stage, message)
 * @returns {Object} Processed data ready for visualization
 */
export function processCSV(csvText, config = {}, onProgress = () => {}) {
  const cfg = {
    input: { ...CONFIG.input, ...config.input },
    noise: { ...CONFIG.noise, ...config.noise },
  };
  seedRandom(CONFIG.noise.seed);

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

  // 3. Prepare ground truth and GPS fixes of every lap
  const prepared = laps.map(lap => prepareLap(fullDataRaw, lap, cfg.noise));

  // 4. Channel delays are a property of the recording, so they are estimated
  //    once over all laps, separately from the clean and from the noisy fixes
  onProgress('delays', 'Estimating sensor delays...');
  const estimate = key => CONFIG.sampling.autoDelay
    ? estimateChannelDelays(prepared.map(p => ({ imu: p.lapData, fixes: p[key] })))
    : configuredDelays();
  const delays = { clean: estimate('cleanGPS'), noisy: estimate('noisyGPS') };

  // 5. Run the algorithms on all laps
  const allLapsData = {};
  for (let i = 0; i < laps.length; i++) {
    onProgress('processing', `Processing lap ${laps[i]} (${i + 1}/${laps.length})...`);
    allLapsData[laps[i]] = processLap(prepared[i], delays);
  }

  onProgress('complete', 'Processing complete!');

  return {
    laps,
    selectedLap: laps[0],
    allLapsData,
    delays,
    noise: cfg.noise,
    config: cfg,
  };
}
