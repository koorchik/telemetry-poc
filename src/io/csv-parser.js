/**
 * RaceChrono CSV file parser.
 * @module io/csv-parser
 */

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
  const lines = csvText.split('\n');
  const dataLines = lines.slice(skipLines);
  const results = [];

  for (const line of dataLines) {
    if (!line.trim()) continue;

    const cols = line.split(',');

    // Check if this is a valid data row
    const timestamp = parseFloat(cols[0]);
    if (isNaN(timestamp)) continue;

    const lat = parseFloat(cols[11]);
    const lon = parseFloat(cols[12]);
    if (isNaN(lat) || isNaN(lon)) continue;

    results.push({
      timestamp,
      lat,
      lon,
      speed: parseFloat(cols[14]) || 0,        // m/s
      bearing: parseFloat(cols[7]) || 0,       // deg
      accuracy: parseFloat(cols[5]) || 5,      // m
      lap: parseInt(cols[2]) || 0,             // lap_number
      // IMU data (RaceChrono calculated values)
      lateral_acc: parseFloat(cols[17]) || 0,      // G - lateral acceleration
      longitudinal_acc: parseFloat(cols[19]) || 0, // G - longitudinal acceleration
      yaw_rate: parseFloat(cols[28]) || 0,         // deg/s - z_rate_of_rotation (yaw)
    });
  }

  return results;
}

/**
 * Parses a RaceChrono CSV file (Node.js only).
 * Skips the first 12 lines of metadata.
 * @param {string} filename - Path to the CSV file
 * @returns {Promise<TelemetryPoint[]>} Parsed telemetry data
 */
export async function readRaceChronoCSV(filename) {
  // Dynamic import for Node.js - keeps module browser-compatible
  const fs = await import('fs');
  const CONFIG = (await import('../config.js')).default;

  const content = fs.readFileSync(filename, 'utf-8');
  const results = parseCSVString(content, CONFIG.input.skipLines);

  console.log(`   Loaded ${results.length} points from ${filename}`);
  return results;
}
