/**
 * Physics-based GPS outlier detection.
 * @module gps/outlier-detection
 */

import CONFIG from '../config.js';
import { haversineDistance } from '../math/geometry.js';

/**
 * Calculates signed angle difference (-180 to +180 degrees).
 * @param {number} a - First angle in degrees
 * @param {number} b - Second angle in degrees
 * @returns {number} Signed difference
 */
function angleDiff(a, b) {
  let diff = a - b;
  while (diff > 180) diff -= 360;
  while (diff < -180) diff += 360;
  return diff;
}

/**
 * Calculates perpendicular distance from point to line segment (in meters).
 * @param {Object} p1 - Line start {lat, lon}
 * @param {Object} p2 - Line end {lat, lon}
 * @param {Object} point - Point to check {lat, lon}
 * @returns {number} Distance in meters
 */
function pointToLineDistance(p1, p2, point) {
  // Convert to local meters
  const cosLat = Math.cos(p1.lat * Math.PI / 180);
  const x1 = 0, y1 = 0;
  const x2 = (p2.lon - p1.lon) * CONFIG.METERS_PER_DEG_LAT * cosLat;
  const y2 = (p2.lat - p1.lat) * CONFIG.METERS_PER_DEG_LAT;
  const px = (point.lon - p1.lon) * CONFIG.METERS_PER_DEG_LAT * cosLat;
  const py = (point.lat - p1.lat) * CONFIG.METERS_PER_DEG_LAT;

  // Line length squared
  const lineLenSq = x2 * x2 + y2 * y2;
  if (lineLenSq === 0) return Math.sqrt(px * px + py * py);

  // Project point onto line
  const t = Math.max(0, Math.min(1, (px * x2 + py * y2) / lineLenSq));
  const projX = t * x2;
  const projY = t * y2;

  // Distance from point to projection
  return Math.sqrt((px - projX) ** 2 + (py - projY) ** 2);
}

/**
 * Calculates physics-based anomaly scores for a GPS point.
 * @param {Object} prev - Previous GPS point
 * @param {Object} curr - Current GPS point
 * @param {number} dt - Time delta in seconds
 * @param {number} prevImpliedSpeed - Speed implied by previous segment
 * @returns {Object} {scores, totalScore, impliedSpeed}
 */
function calculateAnomalyScore(prev, curr, dt, prevImpliedSpeed = null) {
  const cfg = CONFIG.outlierDetection;
  const scores = { accel: 0, yaw: 0, speed: 0, latAcc: 0 };

  // Distance between points
  const dist = haversineDistance(prev.lat, prev.lon, curr.lat, curr.lon);
  const gpsSpeed = dist / dt;

  // Check 1: Acceleration magnitude consistency
  const prevSpeed = prevImpliedSpeed !== null ? prevImpliedSpeed : prev.speed;
  const impliedAccel = Math.abs(gpsSpeed - prevSpeed) / dt;
  const maxAccelMs2 = cfg.maxAccelG * CONFIG.G;
  if (impliedAccel > maxAccelMs2) {
    scores.accel = (impliedAccel - maxAccelMs2) / maxAccelMs2;
  }

  // Check 2: Heading rate consistency (GPS bearing change vs IMU yaw_rate)
  if (prev.bearing !== undefined && curr.bearing !== undefined &&
      prev.yaw_rate !== undefined && curr.yaw_rate !== undefined) {
    const bearingChange = angleDiff(curr.bearing, prev.bearing);
    const gpsYawRate = bearingChange / dt; // deg/s
    const imuYawRate = (prev.yaw_rate + curr.yaw_rate) / 2;
    const yawRateDiff = Math.abs(gpsYawRate - imuYawRate);
    if (yawRateDiff > cfg.maxYawRateDiff) {
      scores.yaw = (yawRateDiff - cfg.maxYawRateDiff) / cfg.maxYawRateDiff;
    }
  }

  // Check 3: Speed consistency (GPS speed vs position-derived speed)
  if (curr.speed !== undefined) {
    const speedDiff = Math.abs(curr.speed - gpsSpeed);
    if (speedDiff > cfg.maxSpeedDiff) {
      scores.speed = (speedDiff - cfg.maxSpeedDiff) / cfg.maxSpeedDiff;
    }
  }

  // Check 4: Lateral acceleration vs turn rate
  // Physics: a_lateral = v * ω
  if (curr.yaw_rate !== undefined && curr.lateral_acc !== undefined && curr.speed > 2) {
    const omega = Math.abs(curr.yaw_rate) * Math.PI / 180; // rad/s
    const expectedLatAcc = (curr.speed * omega) / CONFIG.G; // in G
    const measuredLatAcc = Math.abs(curr.lateral_acc);
    const latAccDiff = Math.abs(expectedLatAcc - measuredLatAcc);
    if (latAccDiff > cfg.maxLatAccDiff) {
      scores.latAcc = (latAccDiff - cfg.maxLatAccDiff) / 1.0;
    }
  }

  // Weighted sum (acceleration violations are most important)
  const weights = { accel: 2.0, yaw: 1.5, speed: 1.0, latAcc: 1.0 };
  const totalScore = Object.keys(scores).reduce(
    (sum, key) => sum + scores[key] * weights[key], 0
  );

  return { scores, totalScore, impliedSpeed: gpsSpeed };
}

/**
 * Checks if a point is a temporal outlier using 3-point window.
 * @param {Array} points - Array of GPS points
 * @param {number} index - Index of point to check
 * @returns {boolean} True if point is a temporal outlier
 */
function isTemporalOutlier(points, index) {
  const cfg = CONFIG.outlierDetection;
  if (!cfg.useTemporalCheck) return false;
  if (index < 1 || index >= points.length - 1) return false;

  const prev = points[index - 1];
  const curr = points[index];
  const next = points[index + 1];

  // Check: Does skipping curr make the trajectory smoother?
  const distPrevCurr = haversineDistance(prev.lat, prev.lon, curr.lat, curr.lon);
  const distCurrNext = haversineDistance(curr.lat, curr.lon, next.lat, next.lon);
  const distPrevNext = haversineDistance(prev.lat, prev.lon, next.lat, next.lon);

  // Triangle ratio: if path through curr is much longer than direct path
  const triangleRatio = (distPrevCurr + distCurrNext) / Math.max(distPrevNext, 0.1);

  // Perpendicular distance from curr to line prev->next
  const perpDistance = pointToLineDistance(prev, next, curr);

  // Is outlier if: big detour AND far from the line
  return triangleRatio > cfg.triangleRatio && perpDistance > cfg.minPerpDistance;
}

/**
 * Physics-based GPS outlier detection.
 * Uses multi-criteria scoring and temporal consistency checks.
 * @param {Array} gpsPoints - Array of GPS points
 * @returns {Object} { filtered: [], outliers: [] }
 */
export function filterGPSOutliers(gpsPoints) {
  if (!CONFIG.outlierDetection.enabled) {
    return { filtered: gpsPoints, outliers: [] };
  }

  if (gpsPoints.length < 2) {
    return { filtered: gpsPoints, outliers: [] };
  }

  const cfg = CONFIG.outlierDetection;

  // Simple method (fallback)
  if (cfg.method === 'simple') {
    return filterGPSOutliersSimple(gpsPoints);
  }

  // Physics-based method
  const outliers = [];
  const anomalyScores = new Array(gpsPoints.length).fill(null);

  // First pass: calculate anomaly scores for all points
  let prevImpliedSpeed = gpsPoints[0].speed || 0;
  anomalyScores[0] = { scores: {}, totalScore: 0, impliedSpeed: prevImpliedSpeed };

  for (let i = 1; i < gpsPoints.length; i++) {
    const prev = gpsPoints[i - 1];
    const curr = gpsPoints[i];
    const dt = curr.timestamp - prev.timestamp;

    if (dt <= 0) {
      anomalyScores[i] = { scores: {}, totalScore: 0, impliedSpeed: prevImpliedSpeed };
      continue;
    }

    const result = calculateAnomalyScore(prev, curr, dt, prevImpliedSpeed);
    anomalyScores[i] = result;
    prevImpliedSpeed = result.impliedSpeed;
  }

  // Second pass: filter based on scores + temporal consistency
  const filtered = [gpsPoints[0]];

  for (let i = 1; i < gpsPoints.length; i++) {
    const score = anomalyScores[i];
    const isTemporal = isTemporalOutlier(gpsPoints, i);

    // Reject if: high anomaly score OR temporal outlier with moderate score
    const isOutlier = score.totalScore > cfg.anomalyThreshold ||
                      (isTemporal && score.totalScore > cfg.anomalyThreshold / 2);

    if (isOutlier) {
      outliers.push({
        ...gpsPoints[i],
        reason: isTemporal ? 'temporal+physics' : 'physics',
        scores: score.scores,
        totalScore: score.totalScore
      });
    } else {
      filtered.push(gpsPoints[i]);
    }
  }

  return { filtered, outliers };
}

/**
 * Simple threshold-based outlier detection (fallback).
 * @param {Array} gpsPoints - Array of GPS points
 * @returns {Object} { filtered: [], outliers: [] }
 */
export function filterGPSOutliersSimple(gpsPoints) {
  const cfg = CONFIG.outlierDetection;
  const maxSpeedMs = cfg.maxSpeedKmh / 3.6;

  const filtered = [gpsPoints[0]];
  const outliers = [];

  for (let i = 1; i < gpsPoints.length; i++) {
    const prev = filtered[filtered.length - 1];
    const curr = gpsPoints[i];
    const dt = curr.timestamp - prev.timestamp;

    if (dt <= 0) {
      filtered.push(curr);
      continue;
    }

    const dist = haversineDistance(prev.lat, prev.lon, curr.lat, curr.lon);
    const speed = dist / dt;

    if (speed > maxSpeedMs) {
      outliers.push({ ...curr, reason: 'speed', value: speed * 3.6 });
    } else if (dist > cfg.maxJumpMeters) {
      outliers.push({ ...curr, reason: 'jump', value: dist });
    } else {
      filtered.push(curr);
    }
  }

  return { filtered, outliers };
}
