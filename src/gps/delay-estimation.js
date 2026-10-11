/**
 * Estimation of how far each sensor channel lags behind GPS position.
 * Uses only the 1Hz GPS fixes and the IMU stream, never the ground truth.
 * @module gps/delay-estimation
 */

import CONFIG from '../config.js';
import { gpsToLocal } from '../math/geometry.js';

const DEG = Math.PI / 180;

// Candidate delays tried, in seconds
const SEARCH_MIN = -0.4;
const SEARCH_MAX = 0.6;
const SEARCH_STEP = 0.01;
const MIN_PAIRS = 20;
// GPS bearing is unusable at walking pace, and it would dominate the fit
const MIN_SPEED = 5;
// An estimate less certain than this (1 sigma, seconds) is rejected
const MAX_SIGMA = 0.05;

/**
 * Signed difference between two bearings (-180 to +180 degrees).
 */
function bearingDiff(a, b) {
  return ((a - b + 540) % 360) - 180;
}

/**
 * A signal sampled on the IMU time grid that can be read at any time.
 */
class Series {
  /**
   * @param {number} t0 - Time of the first sample
   * @param {number} dt - Sample spacing in seconds
   * @param {Float64Array} values - Samples
   */
  constructor(t0, dt, values) {
    this.t0 = t0;
    this.dt = dt;
    this.values = values;
  }

  get tEnd() {
    return this.t0 + (this.values.length - 1) * this.dt;
  }

  at(t) {
    const x = (t - this.t0) / this.dt;
    const last = this.values.length - 1;
    if (x <= 0) return this.values[0];
    if (x >= last) return this.values[last];
    const i = Math.floor(x);
    return this.values[i] + (x - i) * (this.values[i + 1] - this.values[i]);
  }

  /**
   * Running integral of this series (trapezoid rule).
   */
  integral() {
    const out = new Float64Array(this.values.length);
    for (let i = 1; i < out.length; i++) {
      out[i] = out[i - 1] + 0.5 * (this.values[i - 1] + this.values[i]) * this.dt;
    }
    return new Series(this.t0, this.dt, out);
  }
}

/**
 * Finds the delay with the lowest cost on a grid, refined by a parabola.
 * @param {Function} cost - cost(delay) → sum of squared residuals
 * @param {number} count - Number of residuals in that sum
 * @returns {number|null} Delay in seconds, or null when no clear minimum exists
 */
function minimize(cost, count) {
  const delays = [];
  const costs = [];
  for (let d = SEARCH_MIN; d <= SEARCH_MAX + 1e-9; d += SEARCH_STEP) {
    delays.push(d);
    costs.push(cost(d));
  }

  let best = 0;
  for (let i = 1; i < costs.length; i++) {
    if (costs[i] < costs[best]) best = i;
  }

  // A minimum on the edge of the search range is not a real minimum
  if (best === 0 || best === costs.length - 1) return null;

  const a = costs[best - 1];
  const b = costs[best];
  const c = costs[best + 1];
  const curvature = a - 2 * b + c;
  if (curvature <= 0) return null;

  // Least-squares uncertainty of the minimum: flat valley or large residuals → unsure
  const sigma = SEARCH_STEP * Math.sqrt(2 * (b / (count - 1)) / curvature);
  if (sigma > MAX_SIGMA) return null;

  return delays[best] + 0.5 * (a - c) / curvature * SEARCH_STEP;
}

/**
 * Pairs of consecutive fixes far enough from the ends of the IMU data
 * that every candidate delay can be evaluated on the same set.
 */
function fixPairs(segment, needsCourse) {
  const { fixes, tStart, tEnd } = segment;
  const maxGap = 2.5 / CONFIG.sampling.gpsHz;
  const pairs = [];

  for (let k = 0; k < fixes.length - 1; k++) {
    const a = fixes[k];
    const b = fixes[k + 1];
    const gap = b.timestamp - a.timestamp;
    if (gap <= 0 || gap > maxGap) continue;
    if (a.timestamp + SEARCH_MIN < tStart || b.timestamp + SEARCH_MAX > tEnd) continue;
    if (needsCourse && (a.speed < MIN_SPEED || b.speed < MIN_SPEED)) continue;
    pairs.push([a, b]);
  }

  return pairs;
}

/**
 * Delay of an IMU rate channel behind a GPS velocity channel.
 *
 * Between two fixes the GPS value (speed or bearing) must change by the
 * integral of the IMU rate over that second. A wrong delay integrates the
 * wrong second, so the mismatch is smallest at the true delay. A constant
 * sensor bias is fitted and removed at the same time.
 *
 * @param {Array} segments - Prepared segments
 * @param {string} integralKey - Segment field holding the integrated IMU rate
 * @param {Function} change - (fixA, fixB) → change of the GPS value between them
 * @param {boolean} needsCourse - Skip fixes too slow for a valid bearing
 * @returns {number|null} Delay in seconds
 */
function estimateRateDelay(segments, integralKey, change, needsCourse) {
  const all = segments.map(s => ({ series: s[integralKey], pairs: fixPairs(s, needsCourse) }));
  const total = all.reduce((sum, s) => sum + s.pairs.length, 0);
  if (total < MIN_PAIRS) return null;

  return minimize(delay => {
    const predicted = [];
    const observed = [];
    const gaps = [];

    for (const { series, pairs } of all) {
      for (const [a, b] of pairs) {
        predicted.push(series.at(b.timestamp + delay) - series.at(a.timestamp + delay));
        observed.push(change(a, b));
        gaps.push(b.timestamp - a.timestamp);
      }
    }

    // Least-squares sensor bias: observed = predicted - bias * gap
    let num = 0;
    let den = 0;
    for (let i = 0; i < gaps.length; i++) {
      num += (predicted[i] - observed[i]) * gaps[i];
      den += gaps[i] * gaps[i];
    }
    const bias = num / den;

    let sum = 0;
    for (let i = 0; i < gaps.length; i++) {
      const residual = observed[i] - (predicted[i] - bias * gaps[i]);
      sum += residual * residual;
    }
    return sum;
  }, total);
}

/**
 * Builds the travelled distance (East, North) implied by the GPS velocity
 * channel, filled in between fixes with the IMU: each second starts at the
 * fix's speed and bearing, follows the integrated IMU, and is adjusted
 * linearly so that it arrives at the next fix's speed and bearing.
 *
 * @param {Object} segment - Prepared segment
 * @param {number} gyroLag - Gyro delay behind GPS velocity (s)
 * @param {number} accelLag - Accelerometer delay behind GPS velocity (s)
 * @returns {{east: Series, north: Series}} Running integrals of velocity
 */
function integrateVelocity(segment, gyroLag, accelLag) {
  const { fixes, t0, dt, count, turned, gained } = segment;
  const vEast = new Float64Array(count);
  const vNorth = new Float64Array(count);

  let k = 0;
  for (let i = 0; i < count; i++) {
    const t = t0 + i * dt;
    while (k < fixes.length - 2 && fixes[k + 1].timestamp <= t) k++;

    const a = fixes[k];
    const b = fixes[k + 1];
    const u = Math.min(1, Math.max(0, (t - a.timestamp) / (b.timestamp - a.timestamp)));
    const tc = a.timestamp + u * (b.timestamp - a.timestamp);

    const turnedAt = s => turned.at(s + gyroLag) - turned.at(a.timestamp + gyroLag);
    const gainedAt = s => gained.at(s + accelLag) - gained.at(a.timestamp + accelLag);

    const courseMiss = bearingDiff(b.bearing, a.bearing) - turnedAt(b.timestamp);
    const speedMiss = (b.speed - a.speed) - gainedAt(b.timestamp);

    const course = (a.bearing + turnedAt(tc) + u * courseMiss) * DEG;
    const speed = a.speed + gainedAt(tc) + u * speedMiss;

    vEast[i] = speed * Math.sin(course);
    vNorth[i] = speed * Math.cos(course);
  }

  return {
    east: new Series(t0, dt, vEast).integral(),
    north: new Series(t0, dt, vNorth).integral(),
  };
}

/**
 * Delay of the GPS velocity channel (speed + bearing) behind GPS position.
 *
 * The distance between two fixes must equal the integral of velocity over
 * that second. The velocity curve is known on the velocity channel's own
 * clock, so shifting it until the distances match gives the delay.
 *
 * @param {Array} segments - Prepared segments
 * @param {number} gyroLag - Gyro delay behind GPS velocity (s)
 * @param {number} accelLag - Accelerometer delay behind GPS velocity (s)
 * @returns {number|null} Delay in seconds
 */
function estimateVelocityDelay(segments, gyroLag, accelLag) {
  const all = segments
    .filter(s => s.fixes.length >= 2)
    .map(s => {
      const lat0 = s.fixes[0].lat;
      const lon0 = s.fixes[0].lon;
      const pairs = fixPairs(s, true).map(([a, b]) => {
        const pa = gpsToLocal(a.lat, a.lon, lat0, lon0);
        const pb = gpsToLocal(b.lat, b.lon, lat0, lon0);
        return { ta: a.timestamp, tb: b.timestamp, east: pb.px - pa.px, north: pb.py - pa.py };
      });
      return { travelled: integrateVelocity(s, gyroLag, accelLag), pairs };
    });

  const total = all.reduce((sum, s) => sum + s.pairs.length, 0);
  if (total < MIN_PAIRS) return null;

  return minimize(delay => {
    let sum = 0;
    for (const { travelled, pairs } of all) {
      for (const p of pairs) {
        const east = travelled.east.at(p.tb + delay) - travelled.east.at(p.ta + delay);
        const north = travelled.north.at(p.tb + delay) - travelled.north.at(p.ta + delay);
        sum += (p.east - east) ** 2 + (p.north - north) ** 2;
      }
    }
    return sum;
  }, 2 * total);
}

/**
 * Delays taken from CONFIG.sampling, used when estimation is off or fails.
 * @returns {{gpsVelocity: number, yaw_rate: number, longitudinal_acc: number, estimated: Object}}
 */
export function configuredDelays() {
  return {
    gpsVelocity: CONFIG.sampling.gpsVelocityDelay,
    yaw_rate: CONFIG.sampling.imuDelay.yaw_rate,
    longitudinal_acc: CONFIG.sampling.imuDelay.longitudinal_acc,
    estimated: { gpsVelocity: false, yaw_rate: false, longitudinal_acc: false },
  };
}

/**
 * Estimates channel delays for one recording.
 *
 * @param {Array<{imu: Array, fixes: Array}>} laps - Per lap: the IMU-rate
 *   points (timestamp, yaw_rate in deg/s, longitudinal_acc in G) and the GPS
 *   fixes (timestamp, lat, lon, speed, bearing). Timestamps restart per lap.
 * @returns {{gpsVelocity: number, yaw_rate: number, longitudinal_acc: number, estimated: Object}}
 *   Seconds each channel lags behind GPS position, and per channel whether
 *   it was estimated or fell back to CONFIG.sampling.
 */
export function estimateChannelDelays(laps) {
  const result = configuredDelays();

  const segments = laps
    .filter(lap => lap.imu.length >= 2 && lap.fixes.length >= 2)
    .map(({ imu, fixes }) => {
      const t0 = imu[0].timestamp;
      const dt = (imu[imu.length - 1].timestamp - t0) / (imu.length - 1);
      // Course turns clockwise, RaceChrono yaw rate is counter-clockwise positive
      const turnRate = new Series(t0, dt, Float64Array.from(imu, p => -p.yaw_rate));
      const accel = new Series(t0, dt, Float64Array.from(imu, p => p.longitudinal_acc * CONFIG.G));
      return {
        fixes,
        t0,
        dt,
        count: imu.length,
        tStart: t0,
        tEnd: turnRate.tEnd,
        turned: turnRate.integral(),  // degrees
        gained: accel.integral(),     // m/s
      };
    });

  if (segments.length === 0) return result;

  // 1. IMU channels against the GPS velocity channel
  const gyroLag = estimateRateDelay(segments, 'turned', (a, b) => bearingDiff(b.bearing, a.bearing), true);
  const accelLag = estimateRateDelay(segments, 'gained', (a, b) => b.speed - a.speed, false);

  // 2. GPS velocity channel against GPS position
  const gpsVelocity = estimateVelocityDelay(segments, gyroLag ?? 0, accelLag ?? 0);
  if (gpsVelocity !== null) {
    result.gpsVelocity = gpsVelocity;
    result.estimated.gpsVelocity = true;
  }

  // An IMU channel aligned with GPS velocity lags position by both delays
  if (gyroLag !== null) {
    result.yaw_rate = gyroLag + result.gpsVelocity;
    result.estimated.yaw_rate = true;
  }
  if (accelLag !== null) {
    result.longitudinal_acc = accelLag + result.gpsVelocity;
    result.estimated.longitudinal_acc = true;
  }

  return result;
}
