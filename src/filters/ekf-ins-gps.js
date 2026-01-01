/**
 * 7-State Extended Kalman Filter for INS/GPS Sensor Fusion.
 * @module filters/ekf-ins-gps
 */

import CONFIG from '../config.js';
import { matmul, matadd, matsub, transpose, eye, inverse, matvec } from '../math/matrix.js';
import { gpsToLocal, localToGps, normalizeAngle } from '../math/geometry.js';

/**
 * INS/GPS Sensor Fusion using 7-state Extended Kalman Filter.
 *
 * State vector: [px, py, vx, vy, psi, b_ax, b_ay]
 * - px, py: position in local coordinates (m)
 * - vx, vy: velocity (m/s)
 * - psi: heading (rad, from North, clockwise)
 * - b_ax, b_ay: accelerometer bias (m/s²)
 */
export class INSGPSFusion {
  constructor() {
    /** @type {number[]|null} State vector [7] */
    this.x = null;
    /** @type {number[][]|null} Covariance matrix [7x7] */
    this.P = null;
    /** @type {number|null} Reference latitude */
    this.lat0 = null;
    /** @type {number|null} Reference longitude */
    this.lon0 = null;
    /** @type {boolean} Whether filter is initialized */
    this.initialized = false;
  }

  /**
   * Initializes the filter from first GPS measurement.
   * @param {Object} gpsPoint - GPS point with lat, lon, bearing, speed
   */
  initialize(gpsPoint) {
    this.lat0 = gpsPoint.lat;
    this.lon0 = gpsPoint.lon;

    // Heading from GPS bearing (deg → rad)
    const psi0 = gpsPoint.bearing * Math.PI / 180;

    // Velocity from GPS
    const speed = gpsPoint.speed;
    const vx0 = speed * Math.sin(psi0);  // East
    const vy0 = speed * Math.cos(psi0);  // North

    // State: [px, py, vx, vy, psi, b_ax, b_ay]
    this.x = [0, 0, vx0, vy0, psi0, 0, 0];

    // Initial covariance
    this.P = [
      [10,  0,   0,   0,   0,    0,    0],     // px
      [0,   10,  0,   0,   0,    0,    0],     // py
      [0,   0,   1,   0,   0,    0,    0],     // vx
      [0,   0,   0,   1,   0,    0,    0],     // vy
      [0,   0,   0,   0,   0.1,  0,    0],     // psi
      [0,   0,   0,   0,   0,    0.1,  0],     // b_ax
      [0,   0,   0,   0,   0,    0,    0.1],   // b_ay
    ];

    this.initialized = true;
  }

  /**
   * Prediction step (called at IMU rate, 25Hz).
   * @param {Object} imu - IMU data with lateral_acc, longitudinal_acc, yaw_rate
   * @param {number} dt - Time delta in seconds
   */
  predict(imu, dt) {
    if (!this.initialized) return;

    const [px, py, vx, vy, psi, b_ax, b_ay] = this.x;

    // IMU preprocessing
    // RaceChrono has inverted signs for some axes
    const a_lateral = -imu.lateral_acc * CONFIG.G - b_ax;
    const a_longitudinal = imu.longitudinal_acc * CONFIG.G - b_ay;
    const omega_z = -imu.yaw_rate * Math.PI / 180;

    // Body → World transformation (ENU: East-North-Up)
    const cos_psi = Math.cos(psi);
    const sin_psi = Math.sin(psi);

    // Rotation matrix: body → world
    const ax_world = a_lateral * cos_psi + a_longitudinal * sin_psi;
    const ay_world = -a_lateral * sin_psi + a_longitudinal * cos_psi;

    // State prediction
    const px_new = px + vx * dt + 0.5 * ax_world * dt * dt;
    const py_new = py + vy * dt + 0.5 * ay_world * dt * dt;
    const vx_new = vx + ax_world * dt;
    const vy_new = vy + ay_world * dt;
    const psi_new = normalizeAngle(psi + omega_z * dt);
    const b_ax_new = b_ax;  // Bias random walk
    const b_ay_new = b_ay;

    // Jacobian F (7x7)
    const dt2 = dt * dt;

    // Partial derivatives of world acceleration w.r.t. psi
    const dax_dpsi = -a_lateral * sin_psi + a_longitudinal * cos_psi;
    const day_dpsi = -a_lateral * cos_psi - a_longitudinal * sin_psi;

    const F = [
      [1, 0, dt, 0, dax_dpsi * dt2 * 0.5, -cos_psi * dt2 * 0.5, -sin_psi * dt2 * 0.5],
      [0, 1, 0, dt, day_dpsi * dt2 * 0.5, sin_psi * dt2 * 0.5, -cos_psi * dt2 * 0.5],
      [0, 0, 1, 0, dax_dpsi * dt, -cos_psi * dt, -sin_psi * dt],
      [0, 0, 0, 1, day_dpsi * dt, sin_psi * dt, -cos_psi * dt],
      [0, 0, 0, 0, 1, 0, 0],
      [0, 0, 0, 0, 0, 1, 0],
      [0, 0, 0, 0, 0, 0, 1],
    ];

    // Process noise Q
    const sa = CONFIG.ekf.sigma_accel;
    const sg = CONFIG.ekf.sigma_gyro;
    const sb = CONFIG.ekf.sigma_bias;

    const q_pos = sa * sa * dt2 * dt2 / 4;
    const q_vel = sa * sa * dt2;
    const q_psi = sg * sg * dt2;
    const q_bias = sb * sb * dt;

    const Q = [
      [q_pos, 0, 0, 0, 0, 0, 0],
      [0, q_pos, 0, 0, 0, 0, 0],
      [0, 0, q_vel, 0, 0, 0, 0],
      [0, 0, 0, q_vel, 0, 0, 0],
      [0, 0, 0, 0, q_psi, 0, 0],
      [0, 0, 0, 0, 0, q_bias, 0],
      [0, 0, 0, 0, 0, 0, q_bias],
    ];

    // Covariance prediction: P = F * P * F' + Q
    this.P = matadd(matmul(F, matmul(this.P, transpose(F))), Q);

    // Update state
    this.x = [px_new, py_new, vx_new, vy_new, psi_new, b_ax_new, b_ay_new];
  }

  /**
   * Update step (called when GPS available, 1Hz).
   * @param {Object} gpsPoint - GPS point with lat, lon, accuracy
   */
  update(gpsPoint) {
    if (!this.initialized) return;

    // GPS → local coordinates
    const { px: z_px, py: z_py } = gpsToLocal(gpsPoint.lat, gpsPoint.lon, this.lat0, this.lon0);

    // Measurement vector
    const z = [z_px, z_py];

    // Measurement matrix H (2x7)
    const H = [
      [1, 0, 0, 0, 0, 0, 0],
      [0, 1, 0, 0, 0, 0, 0],
    ];

    // Measurement noise R
    const r = gpsPoint.accuracy || CONFIG.ekf.gps_pos_noise;
    const R = [
      [r * r, 0],
      [0, r * r],
    ];

    // Innovation
    const h_x = [this.x[0], this.x[1]];
    const y = [z[0] - h_x[0], z[1] - h_x[1]];

    // Innovation covariance: S = H * P * H' + R
    const S = matadd(matmul(H, matmul(this.P, transpose(H))), R);

    // Kalman gain: K = P * H' * S^-1
    const K = matmul(matmul(this.P, transpose(H)), inverse(S));

    // State update: x = x + K * y
    const Ky = matvec(K, y);
    for (let i = 0; i < 7; i++) {
      this.x[i] += Ky[i];
    }
    this.x[4] = normalizeAngle(this.x[4]);

    // Covariance update: P = (I - K*H) * P
    const IKH = matsub(eye(7), matmul(K, H));
    this.P = matmul(IKH, this.P);
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
    return Math.sqrt(this.x[2] * this.x[2] + this.x[3] * this.x[3]);
  }
}

/**
 * Runs sensor fusion on telemetry data.
 * @param {Array} fullData - Full telemetry data at IMU rate
 * @param {Array} noisyGPS - GPS points (1Hz)
 * @returns {Array} Fused trajectory at IMU rate
 */
export function runSensorFusion(fullData, noisyGPS) {
  const ekf = new INSGPSFusion();
  const trajectory = [];

  // Find initialization point (speed > threshold)
  let initIdx = 0;
  for (let i = 0; i < noisyGPS.length; i++) {
    if (noisyGPS[i].speed > CONFIG.ekf.min_speed_for_heading) {
      initIdx = i;
      break;
    }
  }

  ekf.initialize(noisyGPS[initIdx]);

  // Current GPS measurement index
  let gpsIdx = initIdx;
  let nextGpsTime = noisyGPS[gpsIdx + 1]?.timestamp ?? Infinity;

  // Start from corresponding index in full data
  const startIdx = noisyGPS[initIdx].originalIndex || 0;

  for (let i = startIdx; i < fullData.length; i++) {
    const imu = fullData[i];
    const dt = 1 / CONFIG.sampling.imuHz;  // 0.04s

    // Prediction step (every IMU sample)
    ekf.predict(imu, dt);

    // Check if new GPS available
    if (imu.timestamp >= nextGpsTime && gpsIdx + 1 < noisyGPS.length) {
      gpsIdx++;
      ekf.update(noisyGPS[gpsIdx]);
      nextGpsTime = noisyGPS[gpsIdx + 1]?.timestamp ?? Infinity;
    }

    // Save trajectory point
    const pos = ekf.getPosition();
    if (pos) {
      trajectory.push({
        timestamp: imu.timestamp,
        lat: pos.lat,
        lon: pos.lon,
      });
    }
  }

  return trajectory;
}
