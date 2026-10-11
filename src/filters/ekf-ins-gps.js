/**
 * 6-State Extended Kalman Filter + RTS smoother for INS/GPS Sensor Fusion.
 * @module filters/ekf-ins-gps
 */

import CONFIG from '../config.js';
import { matmul, transpose, eye, inverse, matvec } from '../math/matrix.js';
import { gpsToLocal, localToGps, normalizeAngle } from '../math/geometry.js';

const DEG = Math.PI / 180;

/**
 * INS/GPS Sensor Fusion using a 6-state Extended Kalman Filter with a vehicle
 * motion model: the car moves along its course, so the gyroscope steers the
 * course and the longitudinal accelerometer changes the speed.
 *
 * State vector: [px, py, v, psi, b_g, b_a]
 * - px, py: position in local coordinates (m, East / North)
 * - v: speed along the course (m/s)
 * - psi: course over ground (rad, from North, clockwise, not wrapped)
 * - b_g: gyroscope bias (rad/s)
 * - b_a: longitudinal accelerometer bias (m/s²)
 */
export class INSGPSFusion {
  constructor() {
    /** @type {number[]|null} State vector [6] */
    this.x = null;
    /** @type {number[][]|null} Covariance matrix [6x6] */
    this.P = null;
    /** @type {number|null} Reference latitude */
    this.lat0 = null;
    /** @type {number|null} Reference longitude */
    this.lon0 = null;
    /** @type {boolean} Whether filter is initialized */
    this.initialized = false;
    /** @type {number} Course rate used in the last prediction (rad/s) */
    this.omega = 0;
    /** @type {number} Acceleration used in the last prediction (m/s²) */
    this.accel = 0;
  }

  /**
   * Initializes the filter from first GPS measurement.
   * @param {Object} gpsPoint - GPS point with lat, lon, bearing, speed, accuracy
   */
  initialize(gpsPoint) {
    this.lat0 = gpsPoint.lat;
    this.lon0 = gpsPoint.lon;

    const speed = gpsPoint.speed || 0;
    const psi0 = (gpsPoint.bearing || 0) * DEG;
    const r = gpsPoint.accuracy || CONFIG.ekf.gps_pos_noise;

    // GPS course means nothing while standing still
    const psiVar = speed > CONFIG.ekf.min_speed_for_heading ? 0.05 : Math.PI * Math.PI;

    // State: [px, py, v, psi, b_g, b_a]
    this.x = [0, 0, speed, psi0, 0, 0];

    // Initial covariance
    this.P = [
      [r * r, 0,     0, 0,      0,      0],     // px
      [0,     r * r, 0, 0,      0,      0],     // py
      [0,     0,     1, 0,      0,      0],     // v
      [0,     0,     0, psiVar, 0,      0],     // psi
      [0,     0,     0, 0,      0.0004, 0],     // b_g  (~1 deg/s)
      [0,     0,     0, 0,      0,      0.25],  // b_a
    ];

    this.initialized = true;
  }

  /**
   * Prediction step (called at IMU rate).
   * @param {Object} imu - IMU data with longitudinal_acc (G) and yaw_rate (deg/s)
   * @param {number} dt - Time delta in seconds
   * @returns {number[][]|null} State transition Jacobian F [6x6]
   */
  predict(imu, dt) {
    if (!this.initialized) return null;

    const [px, py, v, psi, b_g, b_a] = this.x;

    // IMU preprocessing
    // RaceChrono yaw rate is counter-clockwise positive, course is clockwise
    const omega = -imu.yaw_rate * DEG - b_g;
    const accel = imu.longitudinal_acc * CONFIG.G - b_a;

    // Midpoint integration
    const psi_mid = psi + 0.5 * omega * dt;
    const v_mid = v + 0.5 * accel * dt;
    const sin_psi = Math.sin(psi_mid);
    const cos_psi = Math.cos(psi_mid);
    const dt2 = dt * dt;

    // Jacobian F (6x6)
    const F = [
      [1, 0, sin_psi * dt, v_mid * cos_psi * dt, -0.5 * v_mid * cos_psi * dt2, -0.5 * sin_psi * dt2],
      [0, 1, cos_psi * dt, -v_mid * sin_psi * dt, 0.5 * v_mid * sin_psi * dt2, -0.5 * cos_psi * dt2],
      [0, 0, 1, 0, 0, -dt],
      [0, 0, 0, 1, -dt, 0],
      [0, 0, 0, 0, 1, 0],
      [0, 0, 0, 0, 0, 1],
    ];

    // Process noise Q (random walks, variance grows with dt)
    const cfg = CONFIG.ekf;
    const q = [
      cfg.sigma_pos * cfg.sigma_pos * dt,
      cfg.sigma_pos * cfg.sigma_pos * dt,
      cfg.sigma_speed * cfg.sigma_speed * dt,
      Math.pow(cfg.sigma_course_deg * DEG, 2) * dt,
      Math.pow(cfg.sigma_gyro_bias * DEG, 2) * dt,
      cfg.sigma_accel_bias * cfg.sigma_accel_bias * dt,
    ];

    // Covariance prediction: P = F * P * F' + Q
    this.P = matmul(F, matmul(this.P, transpose(F)));
    for (let i = 0; i < 6; i++) {
      this.P[i][i] += q[i];
    }

    this.omega = omega;
    this.accel = accel;

    // Update state
    this.x = [
      px + v_mid * sin_psi * dt,
      py + v_mid * cos_psi * dt,
      v + accel * dt,
      psi + omega * dt,
      b_g,
      b_a,
    ];

    return F;
  }

  /**
   * Update step (called when GPS available, 1Hz).
   * Position, speed and course are independent, so each is applied
   * as its own scalar update.
   * @param {Object} gpsPoint - GPS point with lat, lon, speed, bearing, accuracy
   */
  update(gpsPoint) {
    if (!this.initialized) return;

    const cfg = CONFIG.ekf;

    // GPS → local coordinates
    const { px: z_px, py: z_py } = gpsToLocal(gpsPoint.lat, gpsPoint.lon, this.lat0, this.lon0);

    const r = gpsPoint.accuracy || cfg.gps_pos_noise;
    this._updateScalar(0, z_px - this.x[0], r * r);
    this._updateScalar(1, z_py - this.x[1], r * r);

    if (gpsPoint.speed === undefined) return;

    // GPS velocity describes the motion a moment before the fix,
    // so compare it with the state rolled back by that delay
    const delay = CONFIG.sampling.gpsVelocityDelay;
    const speedVar = cfg.gps_speed_noise * cfg.gps_speed_noise;
    this._updateScalar(2, gpsPoint.speed - (this.x[2] - this.accel * delay), speedVar);

    if (gpsPoint.bearing !== undefined && gpsPoint.speed > cfg.min_speed_for_heading) {
      // Course error is velocity error seen from the side, so it grows as speed drops
      const courseSigma = Math.max(cfg.gps_course_noise_deg * DEG, cfg.gps_speed_noise / gpsPoint.speed);
      const innovation = normalizeAngle(gpsPoint.bearing * DEG - (this.x[3] - this.omega * delay));
      this._updateScalar(3, innovation, courseSigma * courseSigma);
    }
  }

  /**
   * Kalman update for a direct measurement of one state.
   * @param {number} idx - Index of the measured state
   * @param {number} innovation - Measurement minus predicted value
   * @param {number} variance - Measurement noise variance
   */
  _updateScalar(idx, innovation, variance) {
    const P = this.P;
    const S = P[idx][idx] + variance;
    const K = P.map(row => row[idx] / S);
    const Prow = P[idx].slice();

    for (let i = 0; i < 6; i++) {
      this.x[i] += K[i] * innovation;
      for (let j = 0; j < 6; j++) {
        P[i][j] -= K[i] * Prow[j];
      }
    }

    // Keep the covariance symmetric
    for (let i = 0; i < 6; i++) {
      for (let j = i + 1; j < 6; j++) {
        P[i][j] = P[j][i] = 0.5 * (P[i][j] + P[j][i]);
      }
    }
  }

  /**
   * Gets current position in GPS coordinates.
   * @returns {{lat: number, lon: number}|null} GPS position or null if not initialized
   */
  getPosition() {
    if (!this.initialized) return null;
    const { lat, lon } = localToGps(this.x[0], this.x[1], this.lat0, this.lon0);
    return { lat, lon };
  }

  /**
   * Gets current speed in m/s.
   * @returns {number} Speed
   */
  getSpeed() {
    if (!this.initialized) return 0;
    return Math.abs(this.x[2]);
  }
}

/**
 * Rauch-Tung-Striebel backward pass over a stored forward EKF run.
 * @param {Array} steps - Per-sample { xPred, PPred, F, x, P } from the forward pass
 * @returns {number[][]} Smoothed state vectors
 */
function rtsSmooth(steps) {
  const n = steps.length;
  const smoothed = new Array(n);
  smoothed[n - 1] = steps[n - 1].x;

  for (let k = n - 2; k >= 0; k--) {
    const next = steps[k + 1];

    // Smoother gain: C = P_k * F' * P_pred^-1
    const C = matmul(matmul(steps[k].P, transpose(next.F)), inverse(next.PPred));

    // x_smooth[k] = x[k] + C * (x_smooth[k+1] - x_pred[k+1])
    const diff = smoothed[k + 1].map((value, i) => value - next.xPred[i]);
    const correction = matvec(C, diff);
    smoothed[k] = steps[k].x.map((value, i) => value + correction[i]);
  }

  return smoothed;
}

/**
 * Runs sensor fusion on telemetry data.
 * @param {Array} fullData - Full telemetry data at IMU rate
 * @param {Array} noisyGPS - GPS points (1Hz)
 * @returns {{filtered: Array, smoothed: Array}} Trajectories at IMU rate:
 *   filtered uses only past GPS fixes (real-time capable),
 *   smoothed also uses later ones (post-processing)
 */
export function runSensorFusion(fullData, noisyGPS) {
  if (noisyGPS.length === 0) return { filtered: [], smoothed: [] };

  const ekf = new INSGPSFusion();
  ekf.initialize(noisyGPS[0]);

  // Current GPS measurement index
  let gpsIdx = 0;
  let nextGpsTime = noisyGPS[1]?.timestamp ?? Infinity;

  // Start from corresponding index in full data
  const startIdx = noisyGPS[0].originalIndex || 0;
  const steps = [];

  for (let i = startIdx; i < fullData.length; i++) {
    const imu = fullData[i];
    let F = eye(6);

    // Prediction step (every IMU sample), using the mean IMU reading over the interval
    if (i > startIdx) {
      const prev = fullData[i - 1];
      F = ekf.predict({
        longitudinal_acc: 0.5 * (prev.longitudinal_acc + imu.longitudinal_acc),
        yaw_rate: 0.5 * (prev.yaw_rate + imu.yaw_rate),
      }, imu.timestamp - prev.timestamp);
    }

    const xPred = ekf.x.slice();
    const PPred = ekf.P.map(row => row.slice());

    // Check if new GPS available
    if (imu.timestamp >= nextGpsTime && gpsIdx + 1 < noisyGPS.length) {
      gpsIdx++;
      ekf.update(noisyGPS[gpsIdx]);
      nextGpsTime = noisyGPS[gpsIdx + 1]?.timestamp ?? Infinity;
    }

    steps.push({
      timestamp: imu.timestamp,
      xPred,
      PPred,
      F,
      x: ekf.x.slice(),
      P: ekf.P.map(row => row.slice()),
    });
  }

  const toTrajectory = states => states.map((x, k) => {
    const { lat, lon } = localToGps(x[0], x[1], ekf.lat0, ekf.lon0);
    return { timestamp: steps[k].timestamp, lat, lon };
  });

  return {
    filtered: toTrajectory(steps.map(s => s.x)),
    smoothed: toTrajectory(rtsSmooth(steps)),
  };
}
