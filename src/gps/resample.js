/**
 * Resampling of merged RaceChrono rows onto a uniform time grid.
 * @module gps/resample
 */

import { lerp, interpolateBearing } from '../math/interpolation.js';

const FIELDS = ['lat', 'lon', 'speed', 'bearing', 'accuracy', 'lateral_acc', 'longitudinal_acc', 'yaw_rate'];

/**
 * Resamples telemetry onto a uniform time grid.
 *
 * RaceChrono exports one row per sample of any device (GPS, accelerometer,
 * gyroscope, calculated channels), so rows are irregularly spaced and more
 * frequent than any single sensor. Everything downstream assumes a fixed rate.
 *
 * @param {Array} points - Telemetry points sorted by timestamp
 * @param {number} hz - Target rate in Hz
 * @returns {Array} Points at timestamps t0 + k / hz
 */
export function resampleUniform(points, hz) {
  if (!points || points.length < 2) return points || [];

  const t0 = points[0].timestamp;
  const duration = points[points.length - 1].timestamp - t0;
  const count = Math.floor(duration * hz + 1e-9) + 1;

  const result = [];
  let j = 0;

  for (let k = 0; k < count; k++) {
    const t = t0 + k / hz;

    // Find rows [j, j+1] bracketing t
    while (j < points.length - 2 && points[j + 1].timestamp <= t) {
      j++;
    }

    const a = points[j];
    const b = points[j + 1];
    const span = b.timestamp - a.timestamp;
    const u = span > 0 ? Math.min(1, Math.max(0, (t - a.timestamp) / span)) : 0;

    const point = { ...a, timestamp: t };
    for (const field of FIELDS) {
      point[field] = field === 'bearing'
        ? interpolateBearing(a.bearing, b.bearing, u)
        : lerp(a[field], b[field], u);
    }

    result.push(point);
  }

  return result;
}

/**
 * Reads one channel of every point as it will be `delay` seconds later.
 * Undoes the lag of a channel that reports late.
 * @param {Array} points - Telemetry points sorted by timestamp
 * @param {string} field - Channel name, e.g. 'yaw_rate'
 * @param {number} delay - Seconds the channel lags behind the timestamps
 * @returns {number[]} Channel values aligned with the timestamps
 */
export function alignChannel(points, field, delay) {
  if (!delay) return points.map(p => p[field]);

  const last = points.length - 1;
  let j = 0;

  return points.map(p => {
    const t = p.timestamp + delay;
    while (j < last - 1 && points[j + 1].timestamp <= t) j++;
    while (j > 0 && points[j].timestamp > t) j--;

    const a = points[j];
    const b = points[Math.min(last, j + 1)];
    const span = b.timestamp - a.timestamp;
    const u = span > 0 ? Math.min(1, Math.max(0, (t - a.timestamp) / span)) : 0;
    return lerp(a[field], b[field], u);
  });
}
