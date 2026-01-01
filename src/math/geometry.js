/**
 * Coordinate transforms and geometric utilities.
 * @module math/geometry
 */

import CONFIG from '../config.js';

/**
 * Generates a random number from a Gaussian distribution using Box-Muller transform.
 * @param {number} [mean=0] - Mean of the distribution
 * @param {number} [stddev=1] - Standard deviation
 * @returns {number} Random value from Gaussian distribution
 */
export function gaussianRandom(mean = 0, stddev = 1) {
  const u1 = Math.random();
  const u2 = Math.random();
  const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  return z0 * stddev + mean;
}

/**
 * Converts GPS coordinates to local ENU (East-North-Up) meters.
 * @param {number} lat - Latitude in degrees
 * @param {number} lon - Longitude in degrees
 * @param {number} lat0 - Reference latitude in degrees
 * @param {number} lon0 - Reference longitude in degrees
 * @returns {{px: number, py: number}} Local coordinates in meters
 */
export function gpsToLocal(lat, lon, lat0, lon0) {
  const cosLat0 = Math.cos(lat0 * Math.PI / 180);
  const px = (lon - lon0) * CONFIG.METERS_PER_DEG_LAT * cosLat0;  // East
  const py = (lat - lat0) * CONFIG.METERS_PER_DEG_LAT;            // North
  return { px, py };
}

/**
 * Converts local ENU meters back to GPS coordinates.
 * @param {number} px - East coordinate in meters
 * @param {number} py - North coordinate in meters
 * @param {number} lat0 - Reference latitude in degrees
 * @param {number} lon0 - Reference longitude in degrees
 * @returns {{lat: number, lon: number}} GPS coordinates
 */
export function localToGps(px, py, lat0, lon0) {
  const cosLat0 = Math.cos(lat0 * Math.PI / 180);
  const lat = lat0 + py / CONFIG.METERS_PER_DEG_LAT;
  const lon = lon0 + px / (CONFIG.METERS_PER_DEG_LAT * cosLat0);
  return { lat, lon };
}

/**
 * Normalizes an angle to the range [-PI, PI].
 * @param {number} angle - Angle in radians
 * @returns {number} Normalized angle
 */
export function normalizeAngle(angle) {
  while (angle > Math.PI) angle -= 2 * Math.PI;
  while (angle < -Math.PI) angle += 2 * Math.PI;
  return angle;
}

/**
 * Calculates the great-circle distance between two GPS points using Haversine formula.
 * @param {number} lat1 - First point latitude
 * @param {number} lon1 - First point longitude
 * @param {number} lat2 - Second point latitude
 * @param {number} lon2 - Second point longitude
 * @returns {number} Distance in meters
 */
export function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Earth radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
