/**
 * GPS simulation utilities (downsampling, noise injection).
 * @module gps/simulation
 */

import CONFIG from '../config.js';
import { gaussianRandom } from '../math/geometry.js';

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
 * The reported accuracy is widened to match, as a real receiver would report it.
 * @param {Array} points - GPS points
 * @returns {Array} Points with added noise
 */
export function addGPSNoise(points) {
  if (!CONFIG.noise.enabled) return points;

  const { minMeters, maxMeters, speedSigma, bearingSigmaDeg } = CONFIG.noise;
  const avgNoise = (minMeters + maxMeters) / 2;

  return points.map(p => {
    const noiseLat = gaussianRandom(0, avgNoise);
    const noiseLon = gaussianRandom(0, avgNoise);
    const cosLat = Math.cos(p.lat * Math.PI / 180);
    const accuracy = p.accuracy || 0;

    return {
      ...p,
      lat: p.lat + noiseLat / CONFIG.METERS_PER_DEG_LAT,
      lon: p.lon + noiseLon / (CONFIG.METERS_PER_DEG_LAT * cosLat),
      speed: Math.max(0, p.speed + gaussianRandom(0, speedSigma)),
      bearing: (p.bearing + gaussianRandom(0, bearingSigmaDeg) + 360) % 360,
      accuracy: Math.sqrt(accuracy * accuracy + avgNoise * avgNoise),
    };
  });
}
