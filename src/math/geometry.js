/**
 * Coordinate transforms and geometric utilities.
 * Uses geodesy library for distance calculations.
 * @module math/geometry
 */

import CONFIG from '../config.js';
import LatLon from 'geodesy/latlon-spherical.js';

let random = Math.random;

/**
 * Switches the random source used by gaussianRandom.
 * @param {number|null} [seed] - Integer seed for a repeatable sequence, or null for Math.random
 */
export function seedRandom(seed = null) {
  if (seed === null || seed === undefined) {
    random = Math.random;
    return;
  }

  // mulberry32
  let state = seed >>> 0;
  random = () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let z = state;
    z = Math.imul(z ^ (z >>> 15), z | 1);
    z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Generates a random number uniformly distributed between min and max.
 * @param {number} min - Lower bound
 * @param {number} max - Upper bound
 * @returns {number} Random value
 */
export function uniformRandom(min, max) {
  return min + random() * (max - min);
}

/**
 * Generates a random number from a Gaussian distribution using Box-Muller transform.
 * @param {number} [mean=0] - Mean of the distribution
 * @param {number} [stddev=1] - Standard deviation
 * @returns {number} Random value from Gaussian distribution
 */
export function gaussianRandom(mean = 0, stddev = 1) {
  const u1 = 1 - random();  // (0, 1] keeps log() finite
  const u2 = random();
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
 * Moves a GPS point along its own speed and bearing for dt seconds.
 * @param {Object} point - GPS point with lat, lon, speed (m/s), bearing (deg)
 * @param {number} dt - Time in seconds
 * @returns {{lat: number, lon: number}} Projected GPS coordinates
 */
export function projectByVelocity(point, dt) {
  const bearing = (point.bearing || 0) * Math.PI / 180;
  const dist = (point.speed || 0) * dt;
  return localToGps(dist * Math.sin(bearing), dist * Math.cos(bearing), point.lat, point.lon);
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
 * Uses geodesy library for accurate distance calculation.
 * @param {number} lat1 - First point latitude
 * @param {number} lon1 - First point longitude
 * @param {number} lat2 - Second point latitude
 * @param {number} lon2 - Second point longitude
 * @returns {number} Distance in meters
 */
export function haversineDistance(lat1, lon1, lat2, lon2) {
  const p1 = new LatLon(lat1, lon1);
  const p2 = new LatLon(lat2, lon2);
  return p1.distanceTo(p2);
}
