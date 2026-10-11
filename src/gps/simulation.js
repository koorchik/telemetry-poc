/**
 * GPS simulation utilities (downsampling, noise injection).
 * @module gps/simulation
 */

import CONFIG from '../config.js';
import { gaussianRandom, uniformRandom } from '../math/geometry.js';

/**
 * Downsamples GPS data to 1Hz (keeping every Nth sample).
 * @param {Array} data - Input telemetry data at IMU rate
 * @returns {Array} Downsampled GPS points with originalIndex
 */
export function downsampleGPS(data) {
  const ratio = CONFIG.sampling.imuHz / CONFIG.sampling.gpsHz;
  const result = [];

  for (let i = 0; i < data.length; i += ratio) {
    const idx = Math.floor(i);
    result.push({
      ...data[idx],
      originalIndex: idx,
    });
  }

  console.log(`   GPS downsampling: ${data.length} → ${result.length} points`);
  return result;
}

/**
 * Adds Gaussian noise to GPS position, speed and bearing.
 * Every fix gets its own position error level, drawn from the configured
 * range, and reports it as its accuracy, as a real receiver would.
 * @param {Array} points - GPS points
 * @param {Object} [noise] - Noise settings, defaults to CONFIG.noise
 * @returns {Array} Points with added noise
 */
export function addGPSNoise(points, noise = CONFIG.noise) {
  if (!noise.enabled) return points;

  const { minMeters, maxMeters, speedSigma, bearingSigmaDeg } = noise;

  return points.map(p => {
    const sigma = uniformRandom(minMeters, maxMeters);
    const noiseLat = gaussianRandom(0, sigma);
    const noiseLon = gaussianRandom(0, sigma);
    const cosLat = Math.cos(p.lat * Math.PI / 180);
    const accuracy = p.accuracy || 0;

    return {
      ...p,
      lat: p.lat + noiseLat / CONFIG.METERS_PER_DEG_LAT,
      lon: p.lon + noiseLon / (CONFIG.METERS_PER_DEG_LAT * cosLat),
      speed: Math.max(0, p.speed + gaussianRandom(0, speedSigma)),
      bearing: (p.bearing + gaussianRandom(0, bearingSigmaDeg) + 360) % 360,
      accuracy: Math.sqrt(accuracy * accuracy + sigma * sigma),
    };
  });
}
