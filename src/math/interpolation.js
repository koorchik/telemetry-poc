/**
 * Shared interpolation utilities for telemetry data
 */

/**
 * Linear interpolation between two values
 * @param {number} v1 - Start value
 * @param {number} v2 - End value
 * @param {number} t - Interpolation factor (0-1)
 * @returns {number} Interpolated value
 */
export function lerp(v1, v2, t) {
  return v1 + t * (v2 - v1);
}

/**
 * Interpolate bearing with angle wrap-around handling
 * @param {number} b1 - Start bearing (degrees)
 * @param {number} b2 - End bearing (degrees)
 * @param {number} t - Interpolation factor (0-1)
 * @returns {number} Interpolated bearing (0-360)
 */
export function interpolateBearing(b1, b2, t) {
  let diff = b2 - b1;
  if (diff > 180) diff -= 360;
  if (diff < -180) diff += 360;
  let result = b1 + t * diff;
  if (result < 0) result += 360;
  if (result >= 360) result -= 360;
  return result;
}

/**
 * Binary search to find bracketing indices for a target value
 * @param {Array} data - Sorted array of data points
 * @param {number} targetValue - Value to search for
 * @param {Function} getValue - Function to extract the search value from data point
 * @returns {{low: number, high: number}} Bracketing indices
 */
export function findBracketIndices(data, targetValue, getValue) {
  let low = 0;
  let high = data.length - 1;

  while (low < high - 1) {
    const mid = Math.floor((low + high) / 2);
    if (getValue(data[mid]) <= targetValue) {
      low = mid;
    } else {
      high = mid;
    }
  }

  return { low, high };
}

/**
 * Interpolate telemetry data at a given lap position
 * @param {Array} data - Array of telemetry points with lapPosition property
 * @param {number} targetPos - Target position (0-1)
 * @param {Object} options - Optional settings
 * @param {boolean} options.convertSpeedToKmh - Convert speed from m/s to km/h (default: true)
 * @returns {Object|null} Interpolated telemetry point
 */
export function interpolateAtPosition(data, targetPos, options = {}) {
  const { convertSpeedToKmh = true } = options;

  if (!data || data.length === 0) return null;
  if (targetPos <= 0) return formatTelemetryPoint(data[0], convertSpeedToKmh);
  if (targetPos >= 1) return formatTelemetryPoint(data[data.length - 1], convertSpeedToKmh);

  const { low, high } = findBracketIndices(data, targetPos, p => p.lapPosition);

  const p1 = data[low];
  const p2 = data[high];
  if (p2.lapPosition === p1.lapPosition) return formatTelemetryPoint(p1, convertSpeedToKmh);

  const t = (targetPos - p1.lapPosition) / (p2.lapPosition - p1.lapPosition);

  return {
    lat: lerp(p1.lat, p2.lat, t),
    lon: lerp(p1.lon, p2.lon, t),
    speed: lerp(p1.speed, p2.speed, t) * (convertSpeedToKmh ? 3.6 : 1),
    bearing: interpolateBearing(p1.bearing || 0, p2.bearing || 0, t),
    lapTime: lerp(p1.lapTime, p2.lapTime, t),
    distance: lerp(p1.distance, p2.distance, t),
    lateralAcc: lerp(p1.lateralAcc || 0, p2.lateralAcc || 0, t),
    longitudinalAcc: lerp(p1.longitudinalAcc || 0, p2.longitudinalAcc || 0, t),
  };
}

/**
 * Interpolate telemetry data at a given time
 * @param {Array} data - Array of telemetry points with lapTime property
 * @param {number} targetTime - Target time in seconds
 * @param {Object} options - Optional settings
 * @param {boolean} options.convertSpeedToKmh - Convert speed from m/s to km/h (default: true)
 * @returns {Object|null} Interpolated telemetry point
 */
export function interpolateAtTime(data, targetTime, options = {}) {
  const { convertSpeedToKmh = true } = options;

  if (!data || data.length === 0) return null;
  if (targetTime <= 0) return formatTelemetryPoint(data[0], convertSpeedToKmh);
  if (targetTime >= data[data.length - 1].lapTime) {
    return formatTelemetryPoint(data[data.length - 1], convertSpeedToKmh);
  }

  const { low, high } = findBracketIndices(data, targetTime, p => p.lapTime);

  const p1 = data[low];
  const p2 = data[high];
  if (p2.lapTime === p1.lapTime) return formatTelemetryPoint(p1, convertSpeedToKmh);

  const t = (targetTime - p1.lapTime) / (p2.lapTime - p1.lapTime);

  return {
    lat: lerp(p1.lat, p2.lat, t),
    lon: lerp(p1.lon, p2.lon, t),
    speed: lerp(p1.speed, p2.speed, t) * (convertSpeedToKmh ? 3.6 : 1),
    bearing: interpolateBearing(p1.bearing || 0, p2.bearing || 0, t),
    lapTime: targetTime,
    lapPosition: lerp(p1.lapPosition, p2.lapPosition, t),
    distance: lerp(p1.distance, p2.distance, t),
    lateralAcc: lerp(p1.lateralAcc || 0, p2.lateralAcc || 0, t),
    longitudinalAcc: lerp(p1.longitudinalAcc || 0, p2.longitudinalAcc || 0, t),
  };
}

/**
 * Convert lap position to time
 * @param {Array} data - Array of telemetry points
 * @param {number} targetPos - Target position (0-1)
 * @returns {number} Time in seconds
 */
export function positionToTime(data, targetPos) {
  if (!data || data.length === 0) return 0;
  if (targetPos <= 0) return 0;
  if (targetPos >= 1) return data[data.length - 1].lapTime;

  const { low, high } = findBracketIndices(data, targetPos, p => p.lapPosition);

  const p1 = data[low];
  const p2 = data[high];
  if (p2.lapPosition === p1.lapPosition) return p1.lapTime;

  const t = (targetPos - p1.lapPosition) / (p2.lapPosition - p1.lapPosition);
  return lerp(p1.lapTime, p2.lapTime, t);
}

/**
 * Convert time to lap position
 * @param {Array} data - Array of telemetry points
 * @param {number} targetTime - Target time in seconds
 * @returns {number} Position (0-1)
 */
export function timeToPosition(data, targetTime) {
  if (!data || data.length === 0) return 0;
  if (targetTime <= 0) return 0;
  if (targetTime >= data[data.length - 1].lapTime) return 1;

  const { low, high } = findBracketIndices(data, targetTime, p => p.lapTime);

  const p1 = data[low];
  const p2 = data[high];
  if (p2.lapTime === p1.lapTime) return p1.lapPosition;

  const t = (targetTime - p1.lapTime) / (p2.lapTime - p1.lapTime);
  return lerp(p1.lapPosition, p2.lapPosition, t);
}

/**
 * Format a telemetry point, optionally converting speed to km/h
 * @private
 */
function formatTelemetryPoint(point, convertSpeedToKmh) {
  return {
    lat: point.lat,
    lon: point.lon,
    speed: point.speed * (convertSpeedToKmh ? 3.6 : 1),
    bearing: point.bearing || 0,
    lapTime: point.lapTime,
    lapPosition: point.lapPosition,
    distance: point.distance,
    lateralAcc: point.lateralAcc || 0,
    longitudinalAcc: point.longitudinalAcc || 0,
  };
}
