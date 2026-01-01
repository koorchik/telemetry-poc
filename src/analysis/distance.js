/**
 * Distance and lap position calculations for telemetry data.
 * @module analysis/distance
 */

import { haversineDistance } from '../math/geometry.js';

/**
 * Adds cumulative distance to each point in the trajectory.
 * @param {Array} points - Array of telemetry points with lat/lon
 * @returns {Array} Points with added 'distance' field (meters from start)
 */
export function addDistanceToPoints(points) {
  if (!points || points.length === 0) return points;

  let cumulative = 0;

  return points.map((p, i) => {
    if (i > 0) {
      cumulative += haversineDistance(
        points[i - 1].lat, points[i - 1].lon,
        p.lat, p.lon
      );
    }
    return { ...p, distance: cumulative };
  });
}

/**
 * Adds normalized lap position (0-1) to each point.
 * Requires points to already have 'distance' field.
 * @param {Array} points - Array of points with distance field
 * @returns {Array} Points with added 'lapPosition' field (0.0 - 1.0)
 */
export function addLapPosition(points) {
  if (!points || points.length === 0) return points;

  const totalDist = points[points.length - 1].distance;
  if (totalDist === 0) return points.map(p => ({ ...p, lapPosition: 0 }));

  return points.map(p => ({
    ...p,
    lapPosition: p.distance / totalDist
  }));
}

/**
 * Adds lap time (seconds from lap start) to each point.
 * @param {Array} points - Array of points with timestamp field
 * @returns {Array} Points with added 'lapTime' field
 */
export function addLapTime(points) {
  if (!points || points.length === 0) return points;

  const t0 = points[0].timestamp;

  return points.map(p => ({
    ...p,
    lapTime: p.timestamp - t0
  }));
}

/**
 * Enhances telemetry points with all distance/position/time fields.
 * @param {Array} points - Raw telemetry points
 * @returns {{points: Array, totalDistance: number, duration: number}}
 */
export function enhanceTelemetryPoints(points) {
  if (!points || points.length === 0) {
    return { points: [], totalDistance: 0, duration: 0 };
  }

  let enhanced = addDistanceToPoints(points);
  enhanced = addLapPosition(enhanced);
  enhanced = addLapTime(enhanced);

  const totalDistance = enhanced[enhanced.length - 1].distance;
  const duration = enhanced[enhanced.length - 1].lapTime;

  return { points: enhanced, totalDistance, duration };
}

/**
 * Creates downsampled chart data from enhanced telemetry points.
 * @param {Array} points - Enhanced telemetry points
 * @param {number} targetHz - Target sampling rate (default 2Hz)
 * @returns {Object} Chart-ready data arrays
 */
export function createChartData(points, targetHz = 2) {
  if (!points || points.length === 0) {
    return {
      timestamps: [],
      distances: [],
      speeds: [],
      lateralAcc: [],
      longitudinalAcc: [],
      lapPositions: [],
      bearings: [],
    };
  }

  // Calculate downsample interval based on original 25Hz rate
  const originalHz = 25;
  const interval = Math.max(1, Math.round(originalHz / targetHz));

  const sampled = points.filter((_, i) => i % interval === 0);

  return {
    timestamps: sampled.map(p => p.lapTime),
    distances: sampled.map(p => p.distance),
    speeds: sampled.map(p => (p.speed || 0) * 3.6), // m/s to km/h
    lateralAcc: sampled.map(p => p.lateral_acc || 0),
    longitudinalAcc: sampled.map(p => p.longitudinal_acc || 0),
    lapPositions: sampled.map(p => p.lapPosition),
    bearings: sampled.map(p => p.bearing || 0),
    lats: sampled.map(p => p.lat),
    lons: sampled.map(p => p.lon),
  };
}

/**
 * Creates a position-to-time lookup map for lap comparison.
 * Uses position intervals of 0.001 (0.1% of lap).
 * @param {Array} points - Enhanced telemetry points with lapPosition and lapTime
 * @returns {Map<number, number>} Map from position (0-1000) to time
 */
export function createPositionTimeMap(points) {
  const map = new Map();

  if (!points || points.length === 0) return map;

  // Create entries at each 0.1% interval
  for (let posInt = 0; posInt <= 1000; posInt++) {
    const targetPos = posInt / 1000;
    const time = interpolateTimeAtPosition(points, targetPos);
    map.set(posInt, time);
  }

  return map;
}

/**
 * Interpolates the time at a given normalized position.
 * @param {Array} points - Enhanced telemetry points
 * @param {number} targetPosition - Target position (0-1)
 * @returns {number} Interpolated time in seconds
 */
export function interpolateTimeAtPosition(points, targetPosition) {
  if (!points || points.length === 0) return 0;
  if (targetPosition <= 0) return points[0].lapTime;
  if (targetPosition >= 1) return points[points.length - 1].lapTime;

  // Binary search for surrounding points
  let low = 0;
  let high = points.length - 1;

  while (low < high - 1) {
    const mid = Math.floor((low + high) / 2);
    if (points[mid].lapPosition <= targetPosition) {
      low = mid;
    } else {
      high = mid;
    }
  }

  const p1 = points[low];
  const p2 = points[high];

  // Handle edge case where positions are equal
  if (p2.lapPosition === p1.lapPosition) return p1.lapTime;

  // Linear interpolation
  const t = (targetPosition - p1.lapPosition) / (p2.lapPosition - p1.lapPosition);
  return p1.lapTime + t * (p2.lapTime - p1.lapTime);
}

/**
 * Interpolates all telemetry values at a given normalized position.
 * Used for animation and synchronized display.
 * @param {Array} points - Enhanced telemetry points
 * @param {number} targetPosition - Target position (0-1)
 * @returns {Object} Interpolated telemetry values
 */
export function interpolateAtPosition(points, targetPosition) {
  if (!points || points.length === 0) {
    return { lat: 0, lon: 0, speed: 0, bearing: 0, lapTime: 0, distance: 0 };
  }

  if (targetPosition <= 0) {
    const p = points[0];
    return {
      lat: p.lat,
      lon: p.lon,
      speed: (p.speed || 0) * 3.6,
      bearing: p.bearing || 0,
      lapTime: p.lapTime,
      distance: p.distance,
      lateralAcc: p.lateral_acc || 0,
      longitudinalAcc: p.longitudinal_acc || 0,
    };
  }

  if (targetPosition >= 1) {
    const p = points[points.length - 1];
    return {
      lat: p.lat,
      lon: p.lon,
      speed: (p.speed || 0) * 3.6,
      bearing: p.bearing || 0,
      lapTime: p.lapTime,
      distance: p.distance,
      lateralAcc: p.lateral_acc || 0,
      longitudinalAcc: p.longitudinal_acc || 0,
    };
  }

  // Binary search for surrounding points
  let low = 0;
  let high = points.length - 1;

  while (low < high - 1) {
    const mid = Math.floor((low + high) / 2);
    if (points[mid].lapPosition <= targetPosition) {
      low = mid;
    } else {
      high = mid;
    }
  }

  const p1 = points[low];
  const p2 = points[high];

  // Handle edge case
  if (p2.lapPosition === p1.lapPosition) {
    return {
      lat: p1.lat,
      lon: p1.lon,
      speed: (p1.speed || 0) * 3.6,
      bearing: p1.bearing || 0,
      lapTime: p1.lapTime,
      distance: p1.distance,
      lateralAcc: p1.lateral_acc || 0,
      longitudinalAcc: p1.longitudinal_acc || 0,
    };
  }

  // Linear interpolation factor
  const t = (targetPosition - p1.lapPosition) / (p2.lapPosition - p1.lapPosition);

  return {
    lat: p1.lat + t * (p2.lat - p1.lat),
    lon: p1.lon + t * (p2.lon - p1.lon),
    speed: ((p1.speed || 0) + t * ((p2.speed || 0) - (p1.speed || 0))) * 3.6,
    bearing: interpolateBearing(p1.bearing || 0, p2.bearing || 0, t),
    lapTime: p1.lapTime + t * (p2.lapTime - p1.lapTime),
    distance: p1.distance + t * (p2.distance - p1.distance),
    lateralAcc: (p1.lateral_acc || 0) + t * ((p2.lateral_acc || 0) - (p1.lateral_acc || 0)),
    longitudinalAcc: (p1.longitudinal_acc || 0) + t * ((p2.longitudinal_acc || 0) - (p1.longitudinal_acc || 0)),
  };
}

/**
 * Interpolates bearing angle handling wrap-around at 360 degrees.
 * @param {number} b1 - First bearing (degrees)
 * @param {number} b2 - Second bearing (degrees)
 * @param {number} t - Interpolation factor (0-1)
 * @returns {number} Interpolated bearing
 */
function interpolateBearing(b1, b2, t) {
  let diff = b2 - b1;

  // Handle wrap-around
  if (diff > 180) diff -= 360;
  if (diff < -180) diff += 360;

  let result = b1 + t * diff;
  if (result < 0) result += 360;
  if (result >= 360) result -= 360;

  return result;
}
