/**
 * HTML map visualization generator using Leaflet.js.
 * @module io/html-generator
 */

import fs from 'fs';
import { findSpeedExtrema } from '../analysis/speed-extrema.js';

/**
 * Generates an interactive HTML map visualization.
 * @param {Object} data - Data for visualization
 * @param {Object} data.allLapsData - Per-lap trajectory data
 * @param {Object} data.selectedLapData - Detailed data for selected lap
 * @param {number[]} data.laps - Array of lap numbers
 * @param {number} data.selectedLap - Currently selected lap
 * @param {Object} data.config - Configuration object
 * @param {string} filename - Output filename
 */
export function generateHTML(data, filename) {
  const { allLapsData, selectedLapData, laps, selectedLap, config } = data;

  // Helper functions
  const downsample = (arr, ratio = 5) => (arr || []).filter((_, i) => i % ratio === 0);
  const toCoords = arr => (arr || []).map(p => [p.lat, p.lon]);

  // Prepare per-lap data for embedding
  const lapsMapData = {};
  for (const lap of laps) {
    const ld = allLapsData[lap];
    if (!ld) continue;
    lapsMapData[lap] = {
      groundTruth: toCoords(downsample(ld.groundTruth)),
      cleanGPS: toCoords(ld.cleanGPS),
      noisyGPS: toCoords(ld.noisyGPS),
      cleanLinear: toCoords(downsample(ld.cleanLinear)),
      cleanSpline: toCoords(downsample(ld.cleanSpline)),
      noisyLinear: toCoords(downsample(ld.noisyLinear)),
      noisySpline: toCoords(downsample(ld.noisySpline)),
      cleanMetrics: ld.cleanMetrics,
      noisyMetrics: ld.noisyMetrics,
      duration: ld.duration,
    };
  }

  // Bounds from all laps
  const allPoints = [];
  for (const lap of laps) {
    if (allLapsData[lap]) {
      allPoints.push(...allLapsData[lap].groundTruth);
    }
  }
  const lats = allPoints.map(p => p.lat);
  const lons = allPoints.map(p => p.lon);
  const bounds = [
    [Math.min(...lats), Math.min(...lons)],
    [Math.max(...lats), Math.max(...lons)]
  ];

  // Speed extrema for selected lap
  const speedExtrema = findSpeedExtrema(selectedLapData.groundTruth);
  console.log(`   Speed extrema: ${speedExtrema.minPoints.length} min, ${speedExtrema.maxPoints.length} max`);

  // Map data structure
  const mapData = {
    laps: laps,
    selectedLap: selectedLap,
    lapsData: lapsMapData,
    speedExtrema: speedExtrema,
  };

  const html = `<!DOCTYPE html>
<html>
<head>
  <title>GPS Track Smoothing - Comparison</title>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, sans-serif; }
    #map { height: 100vh; width: 100%; }

    .control-panel {
      position: absolute;
      top: 10px;
      right: 10px;
      z-index: 1000;
      background: white;
      padding: 16px;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
      max-width: 320px;
      max-height: 90vh;
      overflow-y: auto;
    }

    .control-panel h3 { margin: 0 0 12px 0; font-size: 16px; color: #1f2937; }
    .control-panel h4 { margin: 16px 0 8px 0; font-size: 13px; color: #6b7280; text-transform: uppercase; }

    .lap-selector {
      width: 100%;
      padding: 10px 12px;
      border: 2px solid #e5e7eb;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 500;
      background: white;
      cursor: pointer;
      margin-bottom: 12px;
    }
    .lap-selector:focus { outline: none; border-color: #3b82f6; }

    .mode-toggle {
      display: flex;
      gap: 8px;
      margin-bottom: 16px;
    }
    .mode-btn {
      flex: 1;
      padding: 10px;
      border: 2px solid #e5e7eb;
      border-radius: 6px;
      background: white;
      cursor: pointer;
      font-size: 13px;
      font-weight: 500;
      transition: all 0.2s;
    }
    .mode-btn:hover { border-color: #3b82f6; }
    .mode-btn.active { border-color: #3b82f6; background: #eff6ff; color: #1d4ed8; }

    .layer-checkbox {
      display: flex;
      align-items: center;
      padding: 6px 0;
      cursor: pointer;
    }
    .layer-checkbox input { margin-right: 10px; }
    .layer-checkbox .color-dot {
      width: 12px;
      height: 12px;
      border-radius: 50%;
      margin-right: 8px;
    }

    .metrics-table {
      width: 100%;
      font-size: 11px;
      border-collapse: collapse;
      margin-top: 8px;
    }
    .metrics-table th, .metrics-table td {
      padding: 6px 8px;
      text-align: left;
      border-bottom: 1px solid #e5e7eb;
    }
    .metrics-table th { font-weight: 600; color: #6b7280; }
    .metrics-table .best { background: #dcfce7; }

    .speed-marker {
      font-size: 11px;
      font-weight: bold;
      text-align: center;
      border-radius: 4px;
      padding: 2px 4px;
      white-space: nowrap;
    }
    .speed-min { background: #fee2e2; color: #dc2626; border: 1px solid #dc2626; }
    .speed-max { background: #dcfce7; color: #16a34a; border: 1px solid #16a34a; }

    .info-footer {
      margin-top: 16px;
      padding-top: 12px;
      border-top: 1px solid #e5e7eb;
      font-size: 11px;
      color: #6b7280;
    }
    .info-footer p { margin: 4px 0; }
  </style>
</head>
<body>
  <div id="map"></div>

  <div class="control-panel">
    <h3>GPS Track Smoothing</h3>

    <h4>Lap Selection</h4>
    <select class="lap-selector" id="lap-selector" onchange="changeLap(this.value)">
      ${laps.map(l => `<option value="${l}" ${l === selectedLap ? 'selected' : ''}>Lap ${l}</option>`).join('')}
    </select>

    <h4>GPS Mode</h4>
    <div class="mode-toggle">
      <button class="mode-btn active" onclick="setMode('clean')">Clean GPS</button>
      <button class="mode-btn" onclick="setMode('noisy')">Noisy GPS</button>
    </div>

    <h4>Layers</h4>
    <div id="layer-controls"></div>

    <h4>Metrics (RMSE)</h4>
    <div id="metrics-container"></div>

    <div class="info-footer">
      <p><strong>Lap:</strong> <span id="info-lap">${selectedLap}</span></p>
      <p><strong>Duration:</strong> <span id="info-duration">-</span></p>
      <p><strong>GPS Points:</strong> <span id="info-gps">-</span></p>
      <p><strong>Noise:</strong> ${config.noise.minMeters}-${config.noise.maxMeters}m</p>
    </div>
  </div>

  <script>
    // Map data
    const DATA = ${JSON.stringify(mapData)};

    // Initialize map
    const map = L.map('map');
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap',
      maxZoom: 21,
      maxNativeZoom: 19
    }).addTo(map);
    map.fitBounds(${JSON.stringify(bounds)}, { padding: [30, 30] });

    // State
    let currentLap = DATA.selectedLap;
    let currentMode = 'clean';
    let leafletLayers = {};

    // Layer definitions
    const LAYERS = {
      groundTruth: { label: 'Ground Truth', color: '#22c55e', visible: true },
      gpsPoints: { label: 'GPS Points', color: '#ef4444', visible: true },
      linear: { label: 'Linear Interp.', color: '#f97316', visible: false },
      spline: { label: 'Spline', color: '#2563eb', visible: true },
    };

    // Get current lap data
    function getLapData() {
      return DATA.lapsData[currentLap] || DATA.lapsData[DATA.laps[0]];
    }

    // Create layers for current lap
    function createLayers() {
      Object.values(leafletLayers).forEach(l => map.removeLayer(l));
      leafletLayers = {};

      const ld = getLapData();
      if (!ld) return;

      const prefix = currentMode === 'clean' ? 'clean' : 'noisy';

      // Ground Truth
      leafletLayers.groundTruth = L.polyline(ld.groundTruth, {
        color: '#22c55e', weight: 2, opacity: 0.7
      });

      // GPS Points
      const gpsData = currentMode === 'clean' ? ld.cleanGPS : ld.noisyGPS;
      leafletLayers.gpsPoints = L.layerGroup();
      gpsData.forEach((c, i) => {
        L.circleMarker(c, {
          radius: 5, color: '#dc2626', fillColor: '#ef4444', fillOpacity: 0.8, weight: 2
        }).bindPopup('GPS #' + (i+1)).addTo(leafletLayers.gpsPoints);
      });

      // Algorithms
      leafletLayers.linear = L.polyline(ld[prefix + 'Linear'], {
        color: '#f97316', weight: 2, opacity: 0.8, dashArray: '5, 5'
      });
      leafletLayers.spline = L.polyline(ld[prefix + 'Spline'], {
        color: '#2563eb', weight: 3, opacity: 0.9
      });

      // Add visible layers
      Object.keys(LAYERS).forEach(key => {
        if (LAYERS[key].visible && leafletLayers[key]) {
          leafletLayers[key].addTo(map);
        }
      });

      // Fit bounds to this lap
      if (ld.groundTruth.length > 0) {
        map.fitBounds(ld.groundTruth, { padding: [30, 30] });
      }
    }

    // Toggle layer visibility
    function toggleLayer(key, visible) {
      LAYERS[key].visible = visible;
      if (visible && leafletLayers[key]) {
        leafletLayers[key].addTo(map);
      } else if (leafletLayers[key]) {
        map.removeLayer(leafletLayers[key]);
      }
    }

    // Change lap
    function changeLap(lap) {
      currentLap = parseInt(lap);
      createLayers();
      updateMetrics();
      updateInfo();
    }

    // Set mode (clean/noisy)
    function setMode(mode) {
      currentMode = mode;
      document.querySelectorAll('.mode-btn').forEach(btn => {
        btn.classList.toggle('active', btn.textContent.toLowerCase().includes(mode));
      });
      createLayers();
      updateMetrics();
    }

    // Update metrics table
    function updateMetrics() {
      const ld = getLapData();
      if (!ld) return;

      const metrics = currentMode === 'clean' ? ld.cleanMetrics : ld.noisyMetrics;
      const entries = Object.entries(metrics);
      if (entries.length === 0) return;

      const sorted = entries.sort((a, b) => a[1].rmse - b[1].rmse);
      const bestKey = sorted[0][0];

      const html = '<table class="metrics-table"><tr><th>Algorithm</th><th>RMSE</th><th>MAE</th></tr>' +
        entries.map(([key, m]) =>
          '<tr class="' + (key === bestKey ? 'best' : '') + '">' +
          '<td>' + key.charAt(0).toUpperCase() + key.slice(1) + '</td>' +
          '<td>' + m.rmse.toFixed(2) + 'm</td>' +
          '<td>' + m.mae.toFixed(2) + 'm</td></tr>'
        ).join('') + '</table>';

      document.getElementById('metrics-container').innerHTML = html;
    }

    // Update info panel
    function updateInfo() {
      const ld = getLapData();
      if (!ld) return;

      document.getElementById('info-lap').textContent = currentLap;
      document.getElementById('info-duration').textContent = (ld.duration / 60).toFixed(1) + ' min';
      document.getElementById('info-gps').textContent = ld.cleanGPS.length + ' pts';
    }

    // Build layer controls
    function buildControls() {
      const container = document.getElementById('layer-controls');
      container.innerHTML = Object.entries(LAYERS).map(([key, cfg]) =>
        '<label class="layer-checkbox">' +
        '<input type="checkbox" ' + (cfg.visible ? 'checked' : '') +
        ' onchange="toggleLayer(\\'' + key + '\\', this.checked)">' +
        '<span class="color-dot" style="background: ' + cfg.color + ';"></span>' +
        '<span>' + cfg.label + '</span></label>'
      ).join('');
    }

    // Initialize
    buildControls();
    createLayers();
    updateMetrics();
    updateInfo();
  </script>
</body>
</html>`;

  fs.writeFileSync(filename, html);
  console.log(`   Map: ${filename}`);
}
