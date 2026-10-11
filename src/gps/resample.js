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
 * @param {Object} [delays] - Seconds each field lags behind the timestamps,
 *   e.g. { yaw_rate: 0.02 }. A lagging field is read that much later.
 * @returns {Array} Points at timestamps t0 + k / hz
 */
export function resampleUniform(points, hz, delays = {}) {
  if (!points || points.length < 2) return points || [];

  const t0 = points[0].timestamp;
  const duration = points[points.length - 1].timestamp - t0;
  const count = Math.floor(duration * hz + 1e-9) + 1;

  // Row index reached so far, per distinct delay
  const cursors = {};

  // Finds rows [j, j+1] bracketing t and the position of t between them
  const bracket = (t, delay) => {
    let j = cursors[delay] ?? 0;
    while (j < points.length - 2 && points[j + 1].timestamp <= t) {
      j++;
    }
    cursors[delay] = j;

    const a = points[j];
    const b = points[j + 1];
    const span = b.timestamp - a.timestamp;
    const u = span > 0 ? Math.min(1, Math.max(0, (t - a.timestamp) / span)) : 0;
    return { a, b, u };
  };

  const result = [];

  for (let k = 0; k < count; k++) {
    const t = t0 + k / hz;
    const base = bracket(t, 0);
    const point = { ...base.a, timestamp: t };

    for (const field of FIELDS) {
      const delay = delays[field] || 0;
      const { a, b, u } = delay ? bracket(t + delay, delay) : base;
      point[field] = field === 'bearing'
        ? interpolateBearing(a.bearing, b.bearing, u)
        : lerp(a[field], b[field], u);
    }

    result.push(point);
  }

  return result;
}
