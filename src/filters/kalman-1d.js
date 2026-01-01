/**
 * 1D Kalman Filter with RTS Smoother for GPS-only filtering.
 * Uses kalman-filter library for robust implementation.
 * @module filters/kalman-1d
 */

import kalmanFilter from 'kalman-filter';
const { KalmanFilter } = kalmanFilter;
import CONFIG from '../config.js';

/**
 * 1D Kalman Filter with constant velocity model.
 * Wrapper around kalman-filter library for API compatibility.
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
    this.R = R;
    this.Q = Q;
    this.x = [initialValue, 0];
    this.P = [
      [CONFIG.kalman.initialP, 0],
      [0, CONFIG.kalman.initialP]
    ];

    this.filter = new KalmanFilter({
      observation: {
        dimension: 1,
        stateProjection: [[1, 0]], // Only observe position
        covariance: [[R]]
      },
      dynamic: {
        dimension: 2,
        init: {
          mean: [[initialValue], [0]],
          covariance: [
            [CONFIG.kalman.initialP, 0],
            [0, CONFIG.kalman.initialP]
          ]
        },
        transition: [[1, 1], [0, 1]], // Will be updated with actual dt
        covariance: [[Q / 4, Q / 2], [Q / 2, Q]] // Simplified, updated per step
      }
    });

    this.previousState = this.filter.getInitState();
    this.lastDt = 1;
  }

  /**
   * Prediction step.
   * @param {number} dt - Time delta in seconds
   */
  predict(dt) {
    this.lastDt = dt;
    const dt2 = dt * dt;
    const dt3 = dt2 * dt;
    const dt4 = dt3 * dt;
    const q = this.Q;

    // Update state model for this time step
    this.filter.dynamic.transition = [[1, dt], [0, 1]];
    this.filter.dynamic.covariance = [
      [dt4 / 4 * q, dt3 / 2 * q],
      [dt3 / 2 * q, dt2 * q]
    ];

    const predicted = this.filter.predict({
      previousCorrected: this.previousState
    });

    this.previousState = predicted;
    this.x = [predicted.mean[0][0], predicted.mean[1][0]];
    this.P = predicted.covariance;
  }

  /**
   * Update step with measurement.
   * @param {number} measurement - Position measurement
   * @returns {number} Updated position estimate
   */
  update(measurement) {
    const corrected = this.filter.correct({
      predicted: this.previousState,
      observation: [[measurement]]
    });

    this.previousState = corrected;
    this.x = [corrected.mean[0][0], corrected.mean[1][0]];
    this.P = corrected.covariance;

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
 * Uses kalman-filter library with forward-backward pass.
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

  // Build observations array (null for missing measurements)
  const observations = measurements.map(m => m === null ? null : [[m]]);

  // Calculate time steps
  const timeSteps = [];
  for (let i = 0; i < n; i++) {
    timeSteps.push(i === 0 ? 1 : timestamps[i] - timestamps[i - 1]);
  }

  // Create filter with dynamic time steps
  const kf = new KalmanFilter({
    observation: {
      dimension: 1,
      stateProjection: [[1, 0]],
      covariance: [[R]]
    },
    dynamic: {
      dimension: 2,
      init: {
        mean: [[initialValue], [0]],
        covariance: [
          [CONFIG.kalman.initialP, 0],
          [0, CONFIG.kalman.initialP]
        ]
      },
      // These will be overridden per step
      transition: [[1, 1], [0, 1]],
      covariance: [[Q / 4, Q / 2], [Q / 2, Q]]
    }
  });

  // Forward pass
  const forwardStates = [];
  let prevState = kf.getInitState();

  for (let i = 0; i < n; i++) {
    const dt = timeSteps[i];
    const dt2 = dt * dt;
    const dt3 = dt2 * dt;
    const dt4 = dt3 * dt;

    // Update dynamics for this time step
    kf.dynamic.transition = [[1, dt], [0, 1]];
    kf.dynamic.covariance = [
      [dt4 / 4 * Q, dt3 / 2 * Q],
      [dt3 / 2 * Q, dt2 * Q]
    ];

    const predicted = kf.predict({ previousCorrected: prevState });

    if (observations[i] !== null) {
      const corrected = kf.correct({
        predicted,
        observation: observations[i]
      });
      forwardStates.push(corrected);
      prevState = corrected;
    } else {
      forwardStates.push(predicted);
      prevState = predicted;
    }
  }

  // Backward pass (RTS smoothing)
  const smoothedStates = new Array(n);
  smoothedStates[n - 1] = forwardStates[n - 1];

  for (let i = n - 2; i >= 0; i--) {
    const dt = timeSteps[i + 1];
    const dt2 = dt * dt;
    const dt3 = dt2 * dt;
    const dt4 = dt3 * dt;

    // Transition matrix for this step
    const F = [[1, dt], [0, 1]];
    const processQ = [
      [dt4 / 4 * Q, dt3 / 2 * Q],
      [dt3 / 2 * Q, dt2 * Q]
    ];

    // Predicted state at i+1 (re-predict from forward state at i)
    const xPred = [
      [forwardStates[i].mean[0][0] + forwardStates[i].mean[1][0] * dt],
      [forwardStates[i].mean[1][0]]
    ];

    const P_i = forwardStates[i].covariance;
    const P_pred = [
      [P_i[0][0] + dt * P_i[1][0] + dt * P_i[0][1] + dt2 * P_i[1][1] + processQ[0][0],
       P_i[0][1] + dt * P_i[1][1] + processQ[0][1]],
      [P_i[1][0] + dt * P_i[1][1] + processQ[1][0],
       P_i[1][1] + processQ[1][1]]
    ];

    // Smoother gain C = P_i * F' * inv(P_pred)
    const det = P_pred[0][0] * P_pred[1][1] - P_pred[0][1] * P_pred[1][0];
    if (Math.abs(det) < 1e-12) {
      smoothedStates[i] = forwardStates[i];
      continue;
    }

    const P_pred_inv = [
      [P_pred[1][1] / det, -P_pred[0][1] / det],
      [-P_pred[1][0] / det, P_pred[0][0] / det]
    ];

    // P_i * F' = [[P00 + P01*dt, P01], [P10 + P11*dt, P11]]
    const PFt = [
      [P_i[0][0] + P_i[0][1] * dt, P_i[0][1]],
      [P_i[1][0] + P_i[1][1] * dt, P_i[1][1]]
    ];

    const C = [
      [PFt[0][0] * P_pred_inv[0][0] + PFt[0][1] * P_pred_inv[1][0],
       PFt[0][0] * P_pred_inv[0][1] + PFt[0][1] * P_pred_inv[1][1]],
      [PFt[1][0] * P_pred_inv[0][0] + PFt[1][1] * P_pred_inv[1][0],
       PFt[1][0] * P_pred_inv[0][1] + PFt[1][1] * P_pred_inv[1][1]]
    ];

    // dx = x_smooth[i+1] - x_pred[i+1]
    const dx = [
      smoothedStates[i + 1].mean[0][0] - xPred[0][0],
      smoothedStates[i + 1].mean[1][0] - xPred[1][0]
    ];

    // x_smooth[i] = x_fwd[i] + C * dx
    const smoothedMean = [
      [forwardStates[i].mean[0][0] + C[0][0] * dx[0] + C[0][1] * dx[1]],
      [forwardStates[i].mean[1][0] + C[1][0] * dx[0] + C[1][1] * dx[1]]
    ];

    smoothedStates[i] = {
      mean: smoothedMean,
      covariance: forwardStates[i].covariance // Simplified
    };
  }

  return smoothedStates.map(s => s.mean[0][0]);
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
