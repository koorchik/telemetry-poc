/**
 * Linear interpolation for GPS trajectories.
 * @module interpolation/linear
 */

import { projectByVelocity } from '../math/geometry.js';

/**
 * Applies linear interpolation between GPS points.
 * @param {Array} fullData - Full data with timestamps
 * @param {Array} noisyGPS - GPS points (1Hz)
 * @returns {Array} Interpolated trajectory at fullData timestamps
 */
export function applyLinearInterpolation(fullData, noisyGPS) {
  if (noisyGPS.length < 2) return noisyGPS;

  const result = [];
  const startIdx = noisyGPS[0].originalIndex || 0;

  for (let i = startIdx; i < fullData.length; i++) {
    const t = fullData[i].timestamp;

    // Find segment [gpsIdx, gpsIdx+1]
    let gpsIdx = 0;
    while (gpsIdx < noisyGPS.length - 1 && noisyGPS[gpsIdx + 1].timestamp <= t) {
      gpsIdx++;
    }

    if (gpsIdx >= noisyGPS.length - 1) {
      // Beyond GPS data: continue along the last fix's velocity
      const last = noisyGPS[noisyGPS.length - 1];
      const { lat, lon } = projectByVelocity(last, t - last.timestamp);
      result.push({ timestamp: t, lat, lon });
      continue;
    }

    // Linear interpolation
    const p1 = noisyGPS[gpsIdx];
    const p2 = noisyGPS[gpsIdx + 1];
    const u = (t - p1.timestamp) / (p2.timestamp - p1.timestamp);

    result.push({
      timestamp: t,
      lat: p1.lat + u * (p2.lat - p1.lat),
      lon: p1.lon + u * (p2.lon - p1.lon)
    });
  }

  return result;
}
