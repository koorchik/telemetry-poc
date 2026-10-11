/**
 * Cubic Hermite interpolation for GPS trajectories.
 * @module interpolation/hermite
 */

import CONFIG from '../config.js';
import { gpsToLocal, localToGps, projectByVelocity } from '../math/geometry.js';

/**
 * Signed difference between two bearings (-180 to +180 degrees).
 */
function bearingDiff(a, b) {
  return ((a - b + 540) % 360) - 180;
}

/**
 * Estimates speed and bearing at the moment of each fix.
 * GPS velocity lags the position, so it is advanced by the delay using
 * the rate of change between the neighbouring fixes.
 * @param {Array} gps - GPS points with timestamp, speed, bearing
 * @param {number} delay - Seconds GPS velocity lags behind GPS position
 * @returns {Array} [{speed, bearing}] aligned with the fix positions
 */
function velocityAtFixTime(gps, delay) {

  return gps.map((p, i) => {
    const prev = gps[Math.max(0, i - 1)];
    const next = gps[Math.min(gps.length - 1, i + 1)];
    const span = next.timestamp - prev.timestamp;
    if (!delay || span <= 0) return { speed: p.speed || 0, bearing: p.bearing || 0 };

    return {
      speed: Math.max(0, (p.speed || 0) + delay * (next.speed - prev.speed) / span),
      bearing: (p.bearing || 0) + delay * bearingDiff(next.bearing, prev.bearing) / span,
    };
  });
}

/**
 * Applies cubic Hermite interpolation between GPS points.
 * Each segment matches both the positions and the GPS velocities
 * (speed + bearing) at its two ends.
 * @param {Array} fullData - Full data with timestamps
 * @param {Array} noisyGPS - GPS points (1Hz) with speed (m/s) and bearing (deg)
 * @param {number} [velocityDelay] - Seconds GPS velocity lags behind GPS position
 * @returns {Array} Interpolated trajectory at fullData timestamps
 */
export function applyHermiteInterpolation(fullData, noisyGPS, velocityDelay = CONFIG.sampling.gpsVelocityDelay) {
  if (noisyGPS.length < 2) return noisyGPS;

  const lat0 = noisyGPS[0].lat;
  const lon0 = noisyGPS[0].lon;

  // Position and velocity of each fix in local meters (East, North)
  const velocities = velocityAtFixTime(noisyGPS, velocityDelay);
  const knots = noisyGPS.map((p, i) => {
    const { px, py } = gpsToLocal(p.lat, p.lon, lat0, lon0);
    const bearing = velocities[i].bearing * Math.PI / 180;
    const speed = velocities[i].speed;
    return { px, py, vx: speed * Math.sin(bearing), vy: speed * Math.cos(bearing) };
  });

  const result = [];
  const startIdx = noisyGPS[0].originalIndex || 0;
  const last = noisyGPS.length - 1;

  for (let i = startIdx; i < fullData.length; i++) {
    const t = fullData[i].timestamp;

    // Find segment [gpsIdx, gpsIdx+1]
    let gpsIdx = 0;
    while (gpsIdx < last && noisyGPS[gpsIdx + 1].timestamp <= t) {
      gpsIdx++;
    }

    if (gpsIdx >= last) {
      // Beyond GPS data: continue along the last fix's velocity
      const { lat, lon } = projectByVelocity(noisyGPS[last], t - noisyGPS[last].timestamp);
      result.push({ timestamp: t, lat, lon });
      continue;
    }

    const k0 = knots[gpsIdx];
    const k1 = knots[gpsIdx + 1];
    const dt = noisyGPS[gpsIdx + 1].timestamp - noisyGPS[gpsIdx].timestamp;
    const u = (t - noisyGPS[gpsIdx].timestamp) / dt;
    const u2 = u * u;
    const u3 = u2 * u;

    // Hermite basis functions
    const h00 = 2 * u3 - 3 * u2 + 1;
    const h10 = u3 - 2 * u2 + u;
    const h01 = -2 * u3 + 3 * u2;
    const h11 = u3 - u2;

    const px = h00 * k0.px + h10 * dt * k0.vx + h01 * k1.px + h11 * dt * k1.vx;
    const py = h00 * k0.py + h10 * dt * k0.vy + h01 * k1.py + h11 * dt * k1.vy;

    const { lat, lon } = localToGps(px, py, lat0, lon0);
    result.push({ timestamp: t, lat, lon });
  }

  return result;
}
