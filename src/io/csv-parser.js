/**
 * RaceChrono CSV file parser.
 * Uses PapaParse library for robust CSV parsing.
 * @module io/csv-parser
 */

import Papa from 'papaparse';

/**
 * @typedef {Object} TelemetryPoint
 * @property {number} timestamp - Time in seconds
 * @property {number} lat - Latitude in degrees
 * @property {number} lon - Longitude in degrees
 * @property {number} speed - Speed in m/s
 * @property {number} bearing - Bearing in degrees
 * @property {number} accuracy - GPS accuracy in meters
 * @property {number} lap - Lap number
 * @property {number} lateral_acc - Lateral acceleration in G
 * @property {number} longitudinal_acc - Longitudinal acceleration in G
 * @property {number} yaw_rate - Yaw rate in deg/s
 */

/**
 * Parses a RaceChrono CSV string (browser-compatible).
 * @param {string} csvText - Raw CSV text content
 * @param {number} [skipLines=12] - Number of metadata lines to skip
 * @returns {TelemetryPoint[]} Parsed telemetry data
 */
export function parseCSVString(csvText, skipLines = 12) {
  // Skip metadata lines (RaceChrono format has 12 header lines)
  const lines = csvText.split('\n');
  const dataText = lines.slice(skipLines).join('\n');

  // Parse with PapaParse
  const parseResult = Papa.parse(dataText, {
    dynamicTyping: true,
    skipEmptyLines: true,
  });

  // Map to telemetry points, filtering invalid rows
  return parseResult.data
    .filter(cols => {
      if (!Array.isArray(cols) || cols.length < 29) return false;
      const timestamp = cols[0];
      const lat = cols[11];
      const lon = cols[12];
      return typeof timestamp === 'number' && !isNaN(timestamp) &&
             typeof lat === 'number' && !isNaN(lat) &&
             typeof lon === 'number' && !isNaN(lon);
    })
    .map(cols => ({
      timestamp: cols[0],
      lat: cols[11],
      lon: cols[12],
      speed: cols[14] || 0,        // m/s
      bearing: cols[7] || 0,       // deg
      accuracy: cols[5] || 5,      // m
      lap: parseInt(cols[2]) || 0, // lap_number
      // IMU data (RaceChrono calculated values)
      lateral_acc: cols[17] || 0,      // G - lateral acceleration
      longitudinal_acc: cols[19] || 0, // G - longitudinal acceleration
      yaw_rate: cols[28] || 0,         // deg/s - z_rate_of_rotation (yaw)
    }));
}
