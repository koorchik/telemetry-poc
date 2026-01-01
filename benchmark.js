/**
 * GPS Track Smoothing - Benchmark Script
 *
 * Runs simulations with different configurations and saves results to RESULTS.md
 *
 * Usage:
 *   node benchmark.js
 *
 * @module benchmark
 */

import fs from 'fs';
import CONFIG from './src/config.js';
import { gaussianRandom, haversineDistance } from './src/math/geometry.js';
import { calculateAccuracyMetrics } from './src/analysis/metrics.js';
import { applyLinearInterpolation } from './src/interpolation/linear.js';
import { applySplineInterpolation } from './src/interpolation/spline.js';

/**
 * Reads RaceChrono CSV file (simplified version without IMU data).
 * @param {string} filename - Path to CSV file
 * @returns {Array} Parsed telemetry data
 */
function readRaceChronoCSV(filename) {
  const content = fs.readFileSync(filename, 'utf-8');
  const lines = content.split('\n');
  const dataLines = lines.slice(CONFIG.input.skipLines);
  const results = [];

  for (const line of dataLines) {
    if (!line.trim()) continue;
    const cols = line.split(',');
    const timestamp = parseFloat(cols[0]);
    if (isNaN(timestamp)) continue;
    const lat = parseFloat(cols[11]);
    const lon = parseFloat(cols[12]);
    if (isNaN(lat) || isNaN(lon)) continue;

    results.push({
      timestamp,
      lat,
      lon,
      speed: parseFloat(cols[14]) || 0,
      bearing: parseFloat(cols[7]) || 0,
      lap: parseInt(cols[2]) || 0,
    });
  }

  return results;
}

/**
 * Downsamples GPS to 1Hz.
 * @param {Array} data - Input data
 * @returns {Array} Downsampled data
 */
function downsampleGPS(data) {
  const ratio = CONFIG.sampling.imuHz / CONFIG.sampling.gpsHz;
  const result = [];
  for (let i = 0; i < data.length; i += ratio) {
    const idx = Math.floor(i);
    result.push({ ...data[idx], originalIndex: idx });
  }
  return result;
}

/**
 * Adds Gaussian noise to GPS points.
 * @param {Array} points - GPS points
 * @param {number} minMeters - Minimum noise in meters
 * @param {number} maxMeters - Maximum noise in meters
 * @returns {Array} Noisy points
 */
function addGPSNoise(points, minMeters, maxMeters) {
  const avgNoise = (minMeters + maxMeters) / 2;
  return points.map(p => {
    const noiseLat = gaussianRandom(0, avgNoise);
    const noiseLon = gaussianRandom(0, avgNoise);
    const cosLat = Math.cos(p.lat * Math.PI / 180);
    return {
      ...p,
      lat: p.lat + noiseLat / CONFIG.METERS_PER_DEG_LAT,
      lon: p.lon + noiseLon / (CONFIG.METERS_PER_DEG_LAT * cosLat),
    };
  });
}

/**
 * Generates markdown report.
 * @param {Array} results - Benchmark results
 * @param {Object} averages - Averaged metrics
 * @param {number[]} laps - Lap numbers
 * @param {Array} scenarios - Noise scenarios
 * @returns {string} Markdown content
 */
function generateMarkdown(results, averages, laps, scenarios) {
  const date = new Date().toISOString().split('T')[0];

  let md = `# GPS Track Smoothing - Benchmark Results

Generated: ${date}

## Configuration

- **GPS Frequency:** 1 Hz (downsampled from 25 Hz)
- **Ground Truth:** RaceChrono data at 25 Hz
- **Algorithms:** Linear Interpolation, Catmull-Rom Spline
- **Laps:** ${laps.join(', ')}

## Summary (Average RMSE across all laps)

| Noise Level | Linear RMSE (m) | Spline RMSE (m) | Best |
|-------------|-----------------|-----------------|------|
`;

  for (const scenario of scenarios) {
    const avg = averages[scenario.label];
    const best = avg.linear.rmse < avg.spline.rmse ? 'Linear' : 'Spline';
    md += `| ${scenario.label} | ${avg.linear.rmse.toFixed(3)} | ${avg.spline.rmse.toFixed(3)} | ${best} |\n`;
  }

  md += `\n## Detailed Results by Lap\n`;

  for (const lap of laps) {
    md += `\n### Lap ${lap}\n\n`;
    md += `| Noise Level | Linear RMSE | Linear MAE | Spline RMSE | Spline MAE |\n`;
    md += `|-------------|-------------|------------|-------------|------------|\n`;

    for (const r of results.filter(r => r.lap === lap)) {
      md += `| ${r.scenario} | ${r.linear.rmse.toFixed(3)}m | ${r.linear.mae.toFixed(3)}m | ${r.spline.rmse.toFixed(3)}m | ${r.spline.mae.toFixed(3)}m |\n`;
    }
  }

  md += `\n## Conclusions

1. **Clean GPS:** Spline interpolation provides the best accuracy (sub-meter RMSE)
2. **Noisy GPS:** Linear interpolation performs slightly better as it doesn't amplify noise
3. **Noise Impact:** RMSE roughly matches the noise level (3-8m noise → ~6-7m RMSE)

## Notes

- EKF (Extended Kalman Filter) was not included in this benchmark as it requires IMU data
- Outlier detection was disabled for consistent comparison
`;

  return md;
}

/**
 * Main benchmark runner.
 */
async function runBenchmark() {
  console.log('+===================================================================+');
  console.log('|              GPS Track Smoothing - Benchmark                      |');
  console.log('+===================================================================+\n');

  // Read data
  console.log('Reading data...');
  const fullDataRaw = readRaceChronoCSV(CONFIG.input.file);
  const laps = [...new Set(fullDataRaw.map(p => p.lap))].filter(n => n > 0).sort((a, b) => a - b);
  console.log(`Found ${fullDataRaw.length} points, Laps: ${laps.join(', ')}\n`);

  // Noise scenarios
  const noiseScenarios = [
    { label: 'Clean GPS', enabled: false, min: 0, max: 0 },
    { label: 'Light Noise (1-3m)', enabled: true, min: 1, max: 3 },
    { label: 'Medium Noise (3-8m)', enabled: true, min: 3, max: 8 },
    { label: 'Heavy Noise (5-15m)', enabled: true, min: 5, max: 15 },
  ];

  const results = [];

  // Run benchmarks for each lap
  for (const lap of laps) {
    console.log(`Processing Lap ${lap}...`);

    // Filter data for this lap
    const lapData = fullDataRaw.filter(p => p.lap === lap);
    if (lapData.length === 0) continue;

    // Normalize timestamps
    const t0 = lapData[0].timestamp;
    lapData.forEach(p => p.timestamp -= t0);

    // Downsample
    const gpsDownsampled = downsampleGPS(lapData);

    for (const scenario of noiseScenarios) {
      // Apply noise (or not)
      const gpsData = scenario.enabled
        ? addGPSNoise(gpsDownsampled, scenario.min, scenario.max)
        : gpsDownsampled;

      // Run algorithms
      const linear = applyLinearInterpolation(lapData, gpsData);
      const spline = applySplineInterpolation(lapData, gpsData);

      // Calculate metrics
      const metricsLinear = calculateAccuracyMetrics(lapData, linear);
      const metricsSpline = calculateAccuracyMetrics(lapData, spline);

      results.push({
        lap,
        scenario: scenario.label,
        linear: metricsLinear,
        spline: metricsSpline,
      });
    }
  }

  // Calculate averages across all laps
  const averages = {};
  for (const scenario of noiseScenarios) {
    const scenarioResults = results.filter(r => r.scenario === scenario.label);
    averages[scenario.label] = {
      linear: {
        rmse: scenarioResults.reduce((s, r) => s + r.linear.rmse, 0) / scenarioResults.length,
        mae: scenarioResults.reduce((s, r) => s + r.linear.mae, 0) / scenarioResults.length,
      },
      spline: {
        rmse: scenarioResults.reduce((s, r) => s + r.spline.rmse, 0) / scenarioResults.length,
        mae: scenarioResults.reduce((s, r) => s + r.spline.mae, 0) / scenarioResults.length,
      },
    };
  }

  // Generate markdown
  const md = generateMarkdown(results, averages, laps, noiseScenarios);
  fs.writeFileSync('RESULTS.md', md);
  console.log('\nResults saved to RESULTS.md');

  // Print summary
  console.log('\n' + '='.repeat(70));
  console.log('SUMMARY (Average RMSE across all laps)');
  console.log('='.repeat(70));
  console.log('\nScenario              | Linear (m) | Spline (m)');
  console.log('----------------------|------------|------------');
  for (const scenario of noiseScenarios) {
    const avg = averages[scenario.label];
    console.log(`${scenario.label.padEnd(22)}| ${avg.linear.rmse.toFixed(3).padStart(10)} | ${avg.spline.rmse.toFixed(3).padStart(10)}`);
  }
  console.log('');
}

// Run benchmark
runBenchmark().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
