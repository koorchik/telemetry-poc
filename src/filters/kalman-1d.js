/**
 * 1D Kalman Filter with RTS Smoother for GPS-only filtering.
 * @module filters/kalman-1d
 */

import CONFIG from '../config.js';

/**
 * 1D Kalman Filter with constant velocity model.
 * State: [position, velocity]
 */
export class KalmanFilter1D {
  /**
   * Creates a new 1D Kalman filter.
   * @param {number} R - Measurement noise variance
   * @param {number} Q - Process noise variance
   * @param {number} [initialValue=0] - Initial position estimate
   */
  constructor(R, Q, initialValue = 0) {
    this.x = [initialValue, 0];
    this.P = [
      [CONFIG.kalman.initialP, 0],
      [0, CONFIG.kalman.initialP]
    ];
    this.R = R;
    this.Q = Q;
  }

  /**
   * Prediction step.
   * @param {number} dt - Time delta in seconds
   */
  predict(dt) {
    const newPos = this.x[0] + this.x[1] * dt;
    const newVel = this.x[1];
    this.x = [newPos, newVel];

    const dt2 = dt * dt;
    const dt3 = dt2 * dt;
    const dt4 = dt3 * dt;
    const q = this.Q;

    const P = this.P;
    this.P = [
      [P[0][0] + dt * P[1][0] + dt * P[0][1] + dt2 * P[1][1] + dt4 / 4 * q,
       P[0][1] + dt * P[1][1] + dt3 / 2 * q],
      [P[1][0] + dt * P[1][1] + dt3 / 2 * q,
       P[1][1] + dt2 * q]
    ];
  }

  /**
   * Update step with measurement.
   * @param {number} measurement - Position measurement
   * @returns {number} Updated position estimate
   */
  update(measurement) {
    const y = measurement - this.x[0];
    const S = this.P[0][0] + this.R;
    const K = [this.P[0][0] / S, this.P[1][0] / S];

    this.x[0] += K[0] * y;
    this.x[1] += K[1] * y;

    const P = this.P;
    this.P = [
      [(1 - K[0]) * P[0][0], (1 - K[0]) * P[0][1]],
      [-K[1] * P[0][0] + P[1][0], -K[1] * P[0][1] + P[1][1]]
    ];

    return this.x[0];
  }

  /**
   * Combined predict and update.
   * @param {number} measurement - Position measurement
   * @param {number} dt - Time delta in seconds
   * @returns {number} Updated position estimate
   */
  filter(measurement, dt) {
    this.predict(dt);
    return this.update(measurement);
  }
}

/**
 * Rauch-Tung-Striebel (RTS) Smoother for 1D Kalman.
 * Forward pass (filtering) + Backward pass (smoothing).
 * @param {Array<number|null>} measurements - Position measurements (null for missing)
 * @param {Array<number>} timestamps - Timestamps for each measurement
 * @param {number} R - Measurement noise variance
 * @param {number} Q - Process noise variance
 * @param {number} initialValue - Initial position estimate
 * @returns {Array<number>} Smoothed positions
 */
export function rtsSmooth1D(measurements, timestamps, R, Q, initialValue) {
  const n = timestamps.length;
  if (n === 0) return [];

  // Storage arrays for forward pass
  const x_fwd = [];      // Forward states
  const P_fwd = [];      // Forward covariances
  const x_pred = [];     // Predicted states
  const P_pred = [];     // Predicted covariances

  // Initialize
  let x = [initialValue, 0];
  let P = [[CONFIG.kalman.initialP, 0], [0, CONFIG.kalman.initialP]];

  // Forward pass
  for (let i = 0; i < n; i++) {
    const dt = i === 0 ? 0 : timestamps[i] - timestamps[i - 1];

    // Predict
    if (dt > 0) {
      const dt2 = dt * dt;
      const dt3 = dt2 * dt;
      const dt4 = dt3 * dt;

      const x_p = [x[0] + x[1] * dt, x[1]];
      const P_p = [
        [P[0][0] + dt * P[1][0] + dt * P[0][1] + dt2 * P[1][1] + dt4 / 4 * Q,
         P[0][1] + dt * P[1][1] + dt3 / 2 * Q],
        [P[1][0] + dt * P[1][1] + dt3 / 2 * Q,
         P[1][1] + dt2 * Q]
      ];

      x_pred.push([...x_p]);
      P_pred.push(P_p.map(row => [...row]));

      x = x_p;
      P = P_p;
    } else {
      x_pred.push([...x]);
      P_pred.push(P.map(row => [...row]));
    }

    // Update (if measurement available)
    if (measurements[i] !== null) {
      const y = measurements[i] - x[0];
      const S = P[0][0] + R;
      const K = [P[0][0] / S, P[1][0] / S];

      x = [x[0] + K[0] * y, x[1] + K[1] * y];
      P = [
        [(1 - K[0]) * P[0][0], (1 - K[0]) * P[0][1]],
        [-K[1] * P[0][0] + P[1][0], -K[1] * P[0][1] + P[1][1]]
      ];
    }

    x_fwd.push([...x]);
    P_fwd.push(P.map(row => [...row]));
  }

  // Backward pass (RTS smoothing)
  const x_smooth = new Array(n);
  x_smooth[n - 1] = [...x_fwd[n - 1]];

  for (let i = n - 2; i >= 0; i--) {
    const dt = timestamps[i + 1] - timestamps[i];
    if (dt <= 0) {
      x_smooth[i] = [...x_fwd[i]];
      continue;
    }

    // C = P_fwd[i] * F' * inv(P_pred[i+1])
    const P_pred_inv_det = P_pred[i + 1][0][0] * P_pred[i + 1][1][1] - P_pred[i + 1][0][1] * P_pred[i + 1][1][0];
    if (Math.abs(P_pred_inv_det) < 1e-12) {
      x_smooth[i] = [...x_fwd[i]];
      continue;
    }

    const P_pred_inv = [
      [P_pred[i + 1][1][1] / P_pred_inv_det, -P_pred[i + 1][0][1] / P_pred_inv_det],
      [-P_pred[i + 1][1][0] / P_pred_inv_det, P_pred[i + 1][0][0] / P_pred_inv_det]
    ];

    // P_fwd * F' = [[P00 + P01*dt, P01], [P10 + P11*dt, P11]]
    const PF = [
      [P_fwd[i][0][0] + P_fwd[i][0][1] * dt, P_fwd[i][0][1]],
      [P_fwd[i][1][0] + P_fwd[i][1][1] * dt, P_fwd[i][1][1]]
    ];

    // C = PF * P_pred_inv
    const C = [
      [PF[0][0] * P_pred_inv[0][0] + PF[0][1] * P_pred_inv[1][0],
       PF[0][0] * P_pred_inv[0][1] + PF[0][1] * P_pred_inv[1][1]],
      [PF[1][0] * P_pred_inv[0][0] + PF[1][1] * P_pred_inv[1][0],
       PF[1][0] * P_pred_inv[0][1] + PF[1][1] * P_pred_inv[1][1]]
    ];

    // x_smooth[i] = x_fwd[i] + C * (x_smooth[i+1] - x_pred[i+1])
    const dx = [x_smooth[i + 1][0] - x_pred[i + 1][0], x_smooth[i + 1][1] - x_pred[i + 1][1]];
    x_smooth[i] = [
      x_fwd[i][0] + C[0][0] * dx[0] + C[0][1] * dx[1],
      x_fwd[i][1] + C[1][0] * dx[0] + C[1][1] * dx[1]
    ];
  }

  return x_smooth.map(s => s[0]); // Return positions only
}

/**
 * GPS-only Kalman filter with RTS Smoother.
 * @param {Array} fullData - Full telemetry data
 * @param {Array} noisyGPS - GPS points (1Hz)
 * @param {number} lat0 - Reference latitude for coordinate conversion
 * @returns {Array} Filtered trajectory
 */
export function applyGPSOnlyKalman(fullData, noisyGPS, lat0) {
  if (noisyGPS.length === 0) return [];

  const R = CONFIG.kalman.R;
  const Q = CONFIG.kalman.Q;

  // Convert R and Q to degrees
  const cosLat = Math.cos(lat0 * Math.PI / 180);
  const R_lat = R / Math.pow(CONFIG.METERS_PER_DEG_LAT, 2);
  const R_lon = R / Math.pow(CONFIG.METERS_PER_DEG_LAT * cosLat, 2);
  const Q_lat = Q / Math.pow(CONFIG.METERS_PER_DEG_LAT, 2);
  const Q_lon = Q / Math.pow(CONFIG.METERS_PER_DEG_LAT * cosLat, 2);

  // Find start index in fullData
  const startIdx = noisyGPS[0].originalIndex || 0;
  const dataSlice = fullData.slice(startIdx);

  // Prepare timestamps and measurements
  const timestamps = dataSlice.map(p => p.timestamp);

  // GPS measurements - null if no GPS at this moment
  let gpsIdx = 0;
  let nextGpsTime = noisyGPS[0].timestamp;

  const latMeasurements = [];
  const lonMeasurements = [];

  for (const point of dataSlice) {
    if (point.timestamp >= nextGpsTime && gpsIdx < noisyGPS.length) {
      latMeasurements.push(noisyGPS[gpsIdx].lat);
      lonMeasurements.push(noisyGPS[gpsIdx].lon);
      gpsIdx++;
      nextGpsTime = noisyGPS[gpsIdx]?.timestamp ?? Infinity;
    } else {
      latMeasurements.push(null);
      lonMeasurements.push(null);
    }
  }

  // RTS Smoothing
  const smoothedLat = rtsSmooth1D(latMeasurements, timestamps, R_lat, Q_lat, noisyGPS[0].lat);
  const smoothedLon = rtsSmooth1D(lonMeasurements, timestamps, R_lon, Q_lon, noisyGPS[0].lon);

  // Build result
  const filtered = [];
  for (let i = 0; i < dataSlice.length; i++) {
    filtered.push({
      timestamp: dataSlice[i].timestamp,
      lat: smoothedLat[i],
      lon: smoothedLon[i],
    });
  }

  return filtered;
}
