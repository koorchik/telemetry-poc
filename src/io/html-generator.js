/**
 * HTML telemetry visualization generator with charts and replay.
 * @module io/html-generator
 */

import fs from 'fs';
import { findSpeedExtrema } from '../analysis/speed-extrema.js';

/**
 * Generates an interactive HTML telemetry analysis visualization.
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

    // Calculate speed extrema for each lap
    const lapSpeedExtrema = findSpeedExtrema(ld.groundTruth);

    lapsMapData[lap] = {
      groundTruth: toCoords(downsample(ld.groundTruth)),
      fullGroundTruth: ld.groundTruth.map(p => ({
        lat: p.lat,
        lon: p.lon,
        speed: p.speed,
        bearing: p.bearing,
        lapPosition: p.lapPosition,
        lapTime: p.lapTime,
        distance: p.distance,
        lateralAcc: p.lateral_acc,
        longitudinalAcc: p.longitudinal_acc,
      })),
      cleanGPS: toCoords(ld.cleanGPS),
      noisyGPS: toCoords(ld.noisyGPS),
      cleanLinear: toCoords(downsample(ld.cleanLinear)),
      cleanSpline: toCoords(downsample(ld.cleanSpline)),
      noisyLinear: toCoords(downsample(ld.noisyLinear)),
      noisySpline: toCoords(downsample(ld.noisySpline)),
      cleanMetrics: ld.cleanMetrics,
      noisyMetrics: ld.noisyMetrics,
      duration: ld.duration,
      totalDistance: ld.totalDistance,
      chartData: ld.chartData,
      speedExtrema: lapSpeedExtrema,
    };
  }

  // Bounds from all laps
  const allPoints = [];
  for (const lap of laps) {
    if (allLapsData[lap]) {
      allPoints.push(...allLapsData[lap].groundTruth);
    }
  }
  const latValues = allPoints.map(p => p.lat);
  const lonValues = allPoints.map(p => p.lon);
  const bounds = [
    [Math.min(...latValues), Math.min(...lonValues)],
    [Math.max(...latValues), Math.max(...lonValues)]
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
  <title>GPS Telemetry Analysis</title>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/chartjs-plugin-annotation"></script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #1a1a2e; color: #eee; }

    .app-container {
      display: grid;
      grid-template-rows: auto 1fr auto auto;
      grid-template-columns: 1fr 1fr;
      height: 100vh;
      gap: 0;
    }

    /* Header */
    .header {
      grid-column: 1 / -1;
      background: linear-gradient(135deg, #16213e 0%, #1a1a2e 100%);
      padding: 12px 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid #2d3748;
    }
    .header h1 { font-size: 18px; font-weight: 600; color: #fff; }
    .header-controls { display: flex; gap: 16px; align-items: center; }

    /* Map Panel */
    .map-panel {
      grid-row: 2;
      grid-column: 1;
      position: relative;
      min-height: 400px;
    }
    #map { height: 100%; width: 100%; }

    /* Map overlay controls */
    .map-overlay {
      position: absolute;
      top: 10px;
      left: 10px;
      z-index: 1000;
      background: rgba(26, 26, 46, 0.95);
      padding: 12px;
      border-radius: 8px;
      border: 1px solid #2d3748;
      max-width: 200px;
    }
    .map-overlay h4 { font-size: 11px; color: #718096; text-transform: uppercase; margin-bottom: 8px; }

    .layer-checkbox {
      display: flex;
      align-items: center;
      padding: 4px 0;
      cursor: pointer;
      font-size: 12px;
    }
    .layer-checkbox input { margin-right: 8px; accent-color: #3b82f6; }
    .layer-checkbox .color-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      margin-right: 6px;
    }

    /* Charts Panel */
    .charts-panel {
      grid-row: 2;
      grid-column: 2;
      background: #16213e;
      overflow-y: auto;
      padding: 16px;
      border-left: 1px solid #2d3748;
    }

    .chart-container {
      background: rgba(26, 26, 46, 0.8);
      border-radius: 8px;
      padding: 12px;
      margin-bottom: 12px;
      border: 1px solid #2d3748;
    }
    .chart-container h3 {
      font-size: 12px;
      color: #a0aec0;
      margin-bottom: 8px;
      text-transform: uppercase;
    }
    .chart-wrapper {
      height: 120px;
      position: relative;
    }

    /* Telemetry Display */
    .telemetry-display {
      background: rgba(26, 26, 46, 0.95);
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 12px;
      border: 1px solid #2d3748;
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 12px;
    }
    .telemetry-item {
      text-align: center;
    }
    .telemetry-item .value {
      font-size: 24px;
      font-weight: 700;
      color: #fff;
    }
    .telemetry-item .label {
      font-size: 10px;
      color: #718096;
      text-transform: uppercase;
    }
    .telemetry-item.speed .value { color: #3b82f6; }
    .telemetry-item.lateral .value { color: #f59e0b; }
    .telemetry-item.longitudinal .value { color: #10b981; }
    .telemetry-item.time .value { color: #8b5cf6; }

    /* Replay Controls */
    .replay-controls {
      grid-column: 1 / -1;
      background: #16213e;
      padding: 16px 20px;
      display: flex;
      align-items: center;
      gap: 16px;
      border-top: 1px solid #2d3748;
    }

    .replay-buttons {
      display: flex;
      gap: 8px;
    }
    .replay-btn {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      border: none;
      background: #2d3748;
      color: #fff;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s;
    }
    .replay-btn:hover { background: #3b82f6; }
    .replay-btn.play-pause { width: 44px; height: 44px; background: #3b82f6; }
    .replay-btn.play-pause:hover { background: #2563eb; }

    .speed-selector {
      display: flex;
      gap: 4px;
    }
    .speed-btn {
      padding: 6px 12px;
      border: 1px solid #2d3748;
      background: transparent;
      color: #a0aec0;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      transition: all 0.2s;
    }
    .speed-btn:hover { border-color: #3b82f6; color: #fff; }
    .speed-btn.active { background: #3b82f6; border-color: #3b82f6; color: #fff; }

    .timeline-container {
      flex: 1;
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .timeline {
      flex: 1;
      height: 6px;
      background: #2d3748;
      border-radius: 3px;
      cursor: pointer;
      position: relative;
    }
    .timeline-progress {
      height: 100%;
      background: #3b82f6;
      border-radius: 3px;
      width: 0%;
      transition: width 0.1s;
    }
    .timeline-thumb {
      position: absolute;
      top: 50%;
      transform: translate(-50%, -50%);
      width: 14px;
      height: 14px;
      background: #fff;
      border-radius: 50%;
      box-shadow: 0 2px 4px rgba(0,0,0,0.3);
      left: 0%;
    }
    .time-display {
      font-size: 13px;
      color: #a0aec0;
      font-family: monospace;
      min-width: 100px;
    }

    /* Footer Controls */
    .footer-controls {
      grid-column: 1 / -1;
      background: #1a1a2e;
      padding: 12px 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-top: 1px solid #2d3748;
    }

    .lap-selectors {
      display: flex;
      gap: 16px;
      align-items: center;
    }
    .lap-selector-group {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .lap-selector-group label {
      font-size: 12px;
      color: #718096;
    }
    .lap-select {
      padding: 8px 12px;
      background: #2d3748;
      border: 1px solid #4a5568;
      border-radius: 6px;
      color: #fff;
      font-size: 13px;
      cursor: pointer;
    }
    .lap-select:focus { outline: none; border-color: #3b82f6; }

    .mode-toggle {
      display: flex;
      gap: 4px;
    }
    .mode-btn {
      padding: 8px 16px;
      border: 1px solid #2d3748;
      background: transparent;
      color: #a0aec0;
      border-radius: 6px;
      cursor: pointer;
      font-size: 12px;
      transition: all 0.2s;
    }
    .mode-btn:hover { border-color: #3b82f6; color: #fff; }
    .mode-btn.active { background: #3b82f6; border-color: #3b82f6; color: #fff; }

    .lap-info {
      display: flex;
      gap: 24px;
      font-size: 12px;
      color: #718096;
    }
    .lap-info span { color: #fff; }

    /* Speed Labels on Map */
    .speed-label { background: transparent !important; border: none !important; }
    .speed-marker {
      font-size: 11px;
      font-weight: bold;
      text-align: center;
      border-radius: 4px;
      padding: 2px 6px;
      white-space: nowrap;
      box-shadow: 0 2px 4px rgba(0,0,0,0.4);
    }
    .speed-min { background: #fee2e2; color: #dc2626; border: 2px solid #dc2626; }
    .speed-max { background: #dcfce7; color: #16a34a; border: 2px solid #16a34a; }

    /* Car marker */
    .car-marker {
      width: 24px;
      height: 24px;
      background: #3b82f6;
      border: 3px solid #fff;
      border-radius: 50%;
      box-shadow: 0 2px 8px rgba(0,0,0,0.4);
      transition: transform 0.05s linear;
    }
    .car-marker.comparison {
      background: #f59e0b;
    }

    /* Position indicator on map */
    .position-marker {
      width: 12px;
      height: 12px;
      background: #ef4444;
      border: 2px solid #fff;
      border-radius: 50%;
      box-shadow: 0 2px 4px rgba(0,0,0,0.3);
    }

    /* Delta display */
    .delta-display {
      font-size: 16px;
      font-weight: 700;
      padding: 8px 16px;
      border-radius: 6px;
      min-width: 100px;
      text-align: center;
    }
    .delta-display.faster { background: rgba(16, 185, 129, 0.2); color: #10b981; }
    .delta-display.slower { background: rgba(239, 68, 68, 0.2); color: #ef4444; }
    .delta-display.neutral { background: rgba(107, 114, 128, 0.2); color: #9ca3af; }

    /* Metrics table */
    .metrics-section {
      background: rgba(26, 26, 46, 0.8);
      border-radius: 8px;
      padding: 12px;
      border: 1px solid #2d3748;
    }
    .metrics-section h3 {
      font-size: 12px;
      color: #a0aec0;
      margin-bottom: 8px;
      text-transform: uppercase;
    }
    .metrics-table {
      width: 100%;
      font-size: 11px;
      border-collapse: collapse;
    }
    .metrics-table th, .metrics-table td {
      padding: 6px 8px;
      text-align: left;
      border-bottom: 1px solid #2d3748;
    }
    .metrics-table th { font-weight: 600; color: #718096; }
    .metrics-table td { color: #e2e8f0; }
    .metrics-table .best { background: rgba(16, 185, 129, 0.2); }
  </style>
</head>
<body>
  <div class="app-container">
    <!-- Header -->
    <div class="header">
      <h1>GPS Telemetry Analysis</h1>
      <div class="header-controls">
        <div class="delta-display neutral" id="delta-display">--</div>
      </div>
    </div>

    <!-- Map Panel -->
    <div class="map-panel">
      <div id="map"></div>
      <div class="map-overlay">
        <h4>Layers</h4>
        <div id="layer-controls"></div>
      </div>
    </div>

    <!-- Charts Panel -->
    <div class="charts-panel">
      <div class="telemetry-display" id="telemetry-display">
        <div class="telemetry-item speed">
          <div class="value" id="telem-speed">0</div>
          <div class="label">km/h</div>
        </div>
        <div class="telemetry-item lateral">
          <div class="value" id="telem-lateral">0.00</div>
          <div class="label">Lat G</div>
        </div>
        <div class="telemetry-item longitudinal">
          <div class="value" id="telem-long">0.00</div>
          <div class="label">Long G</div>
        </div>
        <div class="telemetry-item time">
          <div class="value" id="telem-distance">0.00</div>
          <div class="label">km</div>
        </div>
      </div>

      <div class="chart-container">
        <h3>Speed</h3>
        <div class="chart-wrapper"><canvas id="speed-chart"></canvas></div>
      </div>

      <div class="chart-container">
        <h3>Lateral Acceleration (G)</h3>
        <div class="chart-wrapper"><canvas id="lateral-chart"></canvas></div>
      </div>

      <div class="chart-container">
        <h3>Longitudinal Acceleration (G)</h3>
        <div class="chart-wrapper"><canvas id="longitudinal-chart"></canvas></div>
      </div>

      <div class="chart-container" id="delta-chart-container" style="display: none;">
        <h3>Lap Delta (seconds)</h3>
        <div class="chart-wrapper"><canvas id="delta-chart"></canvas></div>
      </div>

      <div class="metrics-section">
        <h3>Accuracy Metrics (RMSE)</h3>
        <div id="metrics-container"></div>
      </div>
    </div>

    <!-- Replay Controls -->
    <div class="replay-controls">
      <div class="replay-buttons">
        <button class="replay-btn" onclick="seekStart()" title="Start">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>
        </button>
        <button class="replay-btn" onclick="stepBackward()" title="Step Back">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M11 18V6l-8.5 6 8.5 6zm.5-6l8.5 6V6l-8.5 6z"/></svg>
        </button>
        <button class="replay-btn play-pause" onclick="togglePlay()" id="play-btn" title="Play/Pause">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" id="play-icon"><path d="M8 5v14l11-7z"/></svg>
        </button>
        <button class="replay-btn" onclick="stepForward()" title="Step Forward">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z"/></svg>
        </button>
        <button class="replay-btn" onclick="seekEnd()" title="End">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>
        </button>
      </div>

      <div class="speed-selector">
        <button class="speed-btn active" onclick="setSpeed(1)" data-speed="1">1x</button>
        <button class="speed-btn" onclick="setSpeed(2)" data-speed="2">2x</button>
        <button class="speed-btn" onclick="setSpeed(4)" data-speed="4">4x</button>
        <button class="speed-btn" onclick="setSpeed(8)" data-speed="8">8x</button>
      </div>

      <div class="timeline-container">
        <div class="timeline" id="timeline">
          <div class="timeline-progress" id="timeline-progress"></div>
          <div class="timeline-thumb" id="timeline-thumb"></div>
        </div>
        <div class="time-display">
          <span id="current-time">0:00.0</span> / <span id="total-time">0:00.0</span>
        </div>
      </div>
    </div>

    <!-- Footer Controls -->
    <div class="footer-controls">
      <div class="lap-selectors">
        <div class="lap-selector-group">
          <label>Lap:</label>
          <select class="lap-select" id="lap-selector" onchange="changeLap(this.value)">
            ${laps.map(l => `<option value="${l}" ${l === selectedLap ? 'selected' : ''}>Lap ${l}</option>`).join('')}
          </select>
        </div>
        <div class="lap-selector-group">
          <label>Compare:</label>
          <select class="lap-select" id="comparison-selector" onchange="setComparison(this.value)">
            <option value="">None</option>
            ${laps.map(l => `<option value="${l}">Lap ${l}</option>`).join('')}
          </select>
        </div>
        <div class="mode-toggle">
          <button class="mode-btn active" onclick="setMode('clean')">Clean GPS</button>
          <button class="mode-btn" onclick="setMode('noisy')">Noisy GPS</button>
        </div>
      </div>

      <div class="lap-info">
        <div>Duration: <span id="info-duration">--</span></div>
        <div>Distance: <span id="info-distance">--</span></div>
        <div>Points: <span id="info-points">--</span></div>
      </div>
    </div>
  </div>

  <script>
    // =====================================================
    // DATA
    // =====================================================
    const DATA = ${JSON.stringify(mapData)};

    // =====================================================
    // STATE
    // =====================================================
    const state = {
      currentLap: DATA.selectedLap,
      comparisonLap: null,
      currentMode: 'clean',
      currentTime: 0,        // actual lap time in seconds
      currentPosition: 0,    // 0-1 normalized (derived from time)
      isPlaying: false,
      playbackSpeed: 1,
      lastFrameTime: null,
    };

    let leafletLayers = {};
    let carMarker = null;
    let comparisonMarker = null;
    let positionMarker = null;
    let charts = {};
    let map = null;
    let isDragging = false;  // for timeline drag

    // Layer definitions
    const LAYERS = {
      groundTruth: { label: 'Ground Truth (25Hz)', color: '#22c55e', visible: true },
      gpsPoints: { label: 'GPS Points (1Hz)', color: '#ef4444', visible: false },
      linear: { label: 'Linear Interp.', color: '#f97316', visible: false },
      spline: { label: 'Spline', color: '#2563eb', visible: false },
      speedLabels: { label: 'Speed Labels', color: '#8b5cf6', visible: true },
    };

    // =====================================================
    // INITIALIZATION
    // =====================================================
    function init() {
      initMap();
      initCharts();
      buildLayerControls();
      createLayers();
      updateInfo();
      updateTelemetryDisplay(0);

      // Timeline drag support
      const timeline = document.getElementById('timeline');
      timeline.addEventListener('mousedown', startTimelineDrag);
      document.addEventListener('mousemove', dragTimeline);
      document.addEventListener('mouseup', stopTimelineDrag);
      // Touch support for mobile
      timeline.addEventListener('touchstart', startTimelineDrag, { passive: false });
      document.addEventListener('touchmove', dragTimeline, { passive: false });
      document.addEventListener('touchend', stopTimelineDrag);

      // Keyboard shortcuts
      document.addEventListener('keydown', (e) => {
        if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
        if (e.code === 'ArrowLeft') stepBackward();
        if (e.code === 'ArrowRight') stepForward();
      });
    }

    function initMap() {
      map = L.map('map');
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap',
        maxZoom: 21,
        maxNativeZoom: 19
      }).addTo(map);
      map.fitBounds(${JSON.stringify(bounds)}, { padding: [30, 30] });

      // Create car marker
      const carIcon = L.divIcon({
        className: '',
        html: '<div class="car-marker"></div>',
        iconSize: [24, 24],
        iconAnchor: [12, 12]
      });
      carMarker = L.marker([0, 0], { icon: carIcon, zIndexOffset: 1000 });

      // Create comparison car marker
      const compIcon = L.divIcon({
        className: '',
        html: '<div class="car-marker comparison"></div>',
        iconSize: [24, 24],
        iconAnchor: [12, 12]
      });
      comparisonMarker = L.marker([0, 0], { icon: compIcon, zIndexOffset: 999 });
    }

    function initCharts() {
      const ld = getLapData();
      if (!ld || !ld.chartData) return;

      const commonOptions = {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: {
          legend: { display: false },
          annotation: {
            annotations: {
              cursor: {
                type: 'line',
                xMin: 0,
                xMax: 0,
                borderColor: '#ef4444',
                borderWidth: 2,
              }
            }
          }
        },
        scales: {
          x: {
            display: true,
            grid: { color: 'rgba(255,255,255,0.1)' },
            ticks: { color: '#718096', maxTicksLimit: 8 }
          },
          y: {
            display: true,
            grid: { color: 'rgba(255,255,255,0.1)' },
            ticks: { color: '#718096' }
          }
        },
        onHover: (event, elements) => {
          if (elements.length > 0) {
            const idx = elements[0].index;
            const pos = ld.chartData.lapPositions[idx];
            setPosition(pos, false);
          }
        }
      };

      const distances = ld.chartData.distances.map(d => (d / 1000).toFixed(2));

      // Speed chart
      charts.speed = new Chart(document.getElementById('speed-chart'), {
        type: 'line',
        data: {
          labels: distances,
          datasets: [{
            data: ld.chartData.speeds,
            borderColor: '#3b82f6',
            borderWidth: 1.5,
            fill: false,
            pointRadius: 0,
            tension: 0.1
          }]
        },
        options: { ...commonOptions }
      });

      // Lateral acceleration chart
      charts.lateral = new Chart(document.getElementById('lateral-chart'), {
        type: 'line',
        data: {
          labels: distances,
          datasets: [{
            data: ld.chartData.lateralAcc,
            borderColor: '#f59e0b',
            borderWidth: 1.5,
            fill: false,
            pointRadius: 0,
            tension: 0.1
          }]
        },
        options: { ...commonOptions }
      });

      // Longitudinal acceleration chart
      charts.longitudinal = new Chart(document.getElementById('longitudinal-chart'), {
        type: 'line',
        data: {
          labels: distances,
          datasets: [{
            data: ld.chartData.longitudinalAcc,
            borderColor: '#10b981',
            borderWidth: 1.5,
            fill: false,
            pointRadius: 0,
            tension: 0.1
          }]
        },
        options: { ...commonOptions }
      });
    }

    // =====================================================
    // DATA ACCESS
    // =====================================================
    function getLapData() {
      return DATA.lapsData[state.currentLap] || DATA.lapsData[DATA.laps[0]];
    }

    function getComparisonData() {
      if (!state.comparisonLap) return null;
      return DATA.lapsData[state.comparisonLap];
    }

    // =====================================================
    // POSITION & INTERPOLATION
    // =====================================================
    function interpolateAtPosition(data, targetPos) {
      if (!data || data.length === 0) return null;
      if (targetPos <= 0) return data[0];
      if (targetPos >= 1) return data[data.length - 1];

      let low = 0, high = data.length - 1;
      while (low < high - 1) {
        const mid = Math.floor((low + high) / 2);
        if (data[mid].lapPosition <= targetPos) low = mid;
        else high = mid;
      }

      const p1 = data[low];
      const p2 = data[high];
      if (p2.lapPosition === p1.lapPosition) return p1;

      const t = (targetPos - p1.lapPosition) / (p2.lapPosition - p1.lapPosition);

      return {
        lat: p1.lat + t * (p2.lat - p1.lat),
        lon: p1.lon + t * (p2.lon - p1.lon),
        speed: (p1.speed + t * (p2.speed - p1.speed)) * 3.6,
        bearing: interpolateBearing(p1.bearing || 0, p2.bearing || 0, t),
        lapTime: p1.lapTime + t * (p2.lapTime - p1.lapTime),
        distance: p1.distance + t * (p2.distance - p1.distance),
        lateralAcc: (p1.lateralAcc || 0) + t * ((p2.lateralAcc || 0) - (p1.lateralAcc || 0)),
        longitudinalAcc: (p1.longitudinalAcc || 0) + t * ((p2.longitudinalAcc || 0) - (p1.longitudinalAcc || 0)),
      };
    }

    function interpolateBearing(b1, b2, t) {
      let diff = b2 - b1;
      if (diff > 180) diff -= 360;
      if (diff < -180) diff += 360;
      let result = b1 + t * diff;
      if (result < 0) result += 360;
      if (result >= 360) result -= 360;
      return result;
    }

    function setPosition(pos, updateCharts = true) {
      state.currentPosition = Math.max(0, Math.min(1, pos));

      const ld = getLapData();
      if (!ld) return;

      // Update currentTime from position (for chart/map hover syncing)
      state.currentTime = positionToTime(ld.fullGroundTruth, state.currentPosition);

      // Update car marker
      const telem = interpolateAtPosition(ld.fullGroundTruth, state.currentPosition);
      if (telem && carMarker) {
        carMarker.setLatLng([telem.lat, telem.lon]);
        if (!map.hasLayer(carMarker)) carMarker.addTo(map);
      }

      // Update comparison marker - TIME-SYNCED (show where comparison car is at same elapsed time)
      if (state.comparisonLap) {
        const compData = getComparisonData();
        if (compData) {
          // Find where comparison car is at the SAME TIME (not same position)
          const compTelem = interpolateAtTime(compData.fullGroundTruth, state.currentTime);
          if (compTelem && comparisonMarker) {
            comparisonMarker.setLatLng([compTelem.lat, compTelem.lon]);
            if (!map.hasLayer(comparisonMarker)) comparisonMarker.addTo(map);
          }

          // Show time delta: how much time difference at this track position
          const compTimeAtSamePos = positionToTime(compData.fullGroundTruth, state.currentPosition);
          const timeDelta = compTimeAtSamePos - state.currentTime;
          updateDeltaDisplay(timeDelta);
        }
      }

      // Update telemetry display
      updateTelemetryDisplay(telem);

      // Update timeline
      updateTimeline(state.currentTime, ld.duration);

      // Update chart cursors
      if (updateCharts) {
        updateChartCursors();
      }
    }

    function updateTelemetryDisplay(telem) {
      if (!telem) {
        document.getElementById('telem-speed').textContent = '0';
        document.getElementById('telem-lateral').textContent = '0.00';
        document.getElementById('telem-long').textContent = '0.00';
        document.getElementById('telem-distance').textContent = '0.00';
        return;
      }

      document.getElementById('telem-speed').textContent = Math.round(telem.speed || 0);
      document.getElementById('telem-lateral').textContent = (telem.lateralAcc || 0).toFixed(2);
      document.getElementById('telem-long').textContent = (telem.longitudinalAcc || 0).toFixed(2);
      document.getElementById('telem-distance').textContent = ((telem.distance || 0) / 1000).toFixed(2);
    }

    function updateDeltaDisplay(delta) {
      const el = document.getElementById('delta-display');
      const absD = Math.abs(delta).toFixed(2);

      if (delta < -0.01) {
        el.textContent = '-' + absD + 's';
        el.className = 'delta-display faster';
      } else if (delta > 0.01) {
        el.textContent = '+' + absD + 's';
        el.className = 'delta-display slower';
      } else {
        el.textContent = '0.00s';
        el.className = 'delta-display neutral';
      }
    }

    function updateTimeline(currentTime, totalTime) {
      const pct = totalTime > 0 ? (currentTime / totalTime) * 100 : 0;
      document.getElementById('timeline-progress').style.width = pct + '%';
      document.getElementById('timeline-thumb').style.left = pct + '%';
      document.getElementById('current-time').textContent = formatTime(currentTime);
      document.getElementById('total-time').textContent = formatTime(totalTime);
    }

    function formatTime(seconds) {
      const mins = Math.floor(seconds / 60);
      const secs = (seconds % 60).toFixed(1);
      return mins + ':' + secs.padStart(4, '0');
    }

    function updateChartCursors() {
      const ld = getLapData();
      if (!ld || !ld.chartData) return;

      // Calculate index for telemetry charts (based on chartData positions)
      const positions = ld.chartData.lapPositions;
      let telemIdx = 0;
      for (let i = 0; i < positions.length; i++) {
        if (positions[i] >= state.currentPosition) {
          telemIdx = i;
          break;
        }
        telemIdx = i;
      }

      // Calculate index for delta chart (101 points: 0%, 1%, ..., 100%)
      const deltaIdx = Math.round(state.currentPosition * 100);

      // Update telemetry charts
      ['speed', 'lateral', 'longitudinal'].forEach(key => {
        const chart = charts[key];
        if (chart && chart.options.plugins.annotation) {
          chart.options.plugins.annotation.annotations.cursor.xMin = telemIdx;
          chart.options.plugins.annotation.annotations.cursor.xMax = telemIdx;
          chart.update('none');
        }
      });

      // Update delta chart separately (different number of data points)
      if (charts.delta && charts.delta.options.plugins.annotation) {
        charts.delta.options.plugins.annotation.annotations.cursor.xMin = deltaIdx;
        charts.delta.options.plugins.annotation.annotations.cursor.xMax = deltaIdx;
        charts.delta.update('none');
      }
    }

    // =====================================================
    // REPLAY ENGINE (Time-Based - Industry Standard)
    // =====================================================
    function togglePlay() {
      state.isPlaying = !state.isPlaying;

      const icon = document.getElementById('play-icon');
      if (state.isPlaying) {
        icon.innerHTML = '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>';
        state.lastFrameTime = performance.now();
        animate();
      } else {
        icon.innerHTML = '<path d="M8 5v14l11-7z"/>';
      }
    }

    function animate() {
      if (!state.isPlaying) return;

      const now = performance.now();
      const dt = (now - state.lastFrameTime) / 1000;
      state.lastFrameTime = now;

      const ld = getLapData();
      if (!ld) return;

      // Time-based: advance actual lap time
      state.currentTime += dt * state.playbackSpeed;

      // Loop at lap end
      if (state.currentTime >= ld.duration) {
        state.currentTime = 0;
      }

      // Find position at this time (realistic car speed)
      const pos = timeToPosition(ld.fullGroundTruth, state.currentTime);
      setPositionFromTime(pos, state.currentTime);

      requestAnimationFrame(animate);
    }

    // Convert time to position using telemetry data
    function timeToPosition(data, targetTime) {
      if (!data || data.length === 0) return 0;
      if (targetTime <= 0) return 0;
      if (targetTime >= data[data.length - 1].lapTime) return 1;

      // Binary search for surrounding points
      let low = 0, high = data.length - 1;
      while (low < high - 1) {
        const mid = Math.floor((low + high) / 2);
        if (data[mid].lapTime <= targetTime) low = mid;
        else high = mid;
      }

      const p1 = data[low];
      const p2 = data[high];
      if (p2.lapTime === p1.lapTime) return p1.lapPosition;

      // Linear interpolation
      const t = (targetTime - p1.lapTime) / (p2.lapTime - p1.lapTime);
      return p1.lapPosition + t * (p2.lapPosition - p1.lapPosition);
    }

    // Convert position to time using telemetry data
    function positionToTime(data, targetPos) {
      if (!data || data.length === 0) return 0;
      if (targetPos <= 0) return 0;
      if (targetPos >= 1) return data[data.length - 1].lapTime;

      // Binary search for surrounding points
      let low = 0, high = data.length - 1;
      while (low < high - 1) {
        const mid = Math.floor((low + high) / 2);
        if (data[mid].lapPosition <= targetPos) low = mid;
        else high = mid;
      }

      const p1 = data[low];
      const p2 = data[high];
      if (p2.lapPosition === p1.lapPosition) return p1.lapTime;

      // Linear interpolation
      const t = (targetPos - p1.lapPosition) / (p2.lapPosition - p1.lapPosition);
      return p1.lapTime + t * (p2.lapTime - p1.lapTime);
    }

    // Interpolate telemetry at a given time (not position)
    function interpolateAtTime(data, targetTime) {
      if (!data || data.length === 0) return null;
      if (targetTime <= 0) return data[0];
      if (targetTime >= data[data.length - 1].lapTime) return data[data.length - 1];

      // Binary search for surrounding points by time
      let low = 0, high = data.length - 1;
      while (low < high - 1) {
        const mid = Math.floor((low + high) / 2);
        if (data[mid].lapTime <= targetTime) low = mid;
        else high = mid;
      }

      const p1 = data[low];
      const p2 = data[high];
      if (p2.lapTime === p1.lapTime) return p1;

      const t = (targetTime - p1.lapTime) / (p2.lapTime - p1.lapTime);

      return {
        lat: p1.lat + t * (p2.lat - p1.lat),
        lon: p1.lon + t * (p2.lon - p1.lon),
        speed: (p1.speed + t * (p2.speed - p1.speed)) * 3.6,
        bearing: interpolateBearing(p1.bearing || 0, p2.bearing || 0, t),
        lapTime: targetTime,
        lapPosition: p1.lapPosition + t * (p2.lapPosition - p1.lapPosition),
        distance: p1.distance + t * (p2.distance - p1.distance),
        lateralAcc: (p1.lateralAcc || 0) + t * ((p2.lateralAcc || 0) - (p1.lateralAcc || 0)),
        longitudinalAcc: (p1.longitudinalAcc || 0) + t * ((p2.longitudinalAcc || 0) - (p1.longitudinalAcc || 0)),
      };
    }

    // Internal function: set position when time is already known (during animation)
    function setPositionFromTime(pos, time) {
      state.currentPosition = Math.max(0, Math.min(1, pos));
      state.currentTime = time;

      const ld = getLapData();
      if (!ld) return;

      // Update car marker
      const telem = interpolateAtPosition(ld.fullGroundTruth, state.currentPosition);
      if (telem && carMarker) {
        carMarker.setLatLng([telem.lat, telem.lon]);
        if (!map.hasLayer(carMarker)) carMarker.addTo(map);
      }

      // Update comparison marker - TIME-SYNCED (show where comparison car is at same elapsed time)
      if (state.comparisonLap) {
        const compData = getComparisonData();
        if (compData) {
          // Find where comparison car is at the SAME TIME (not same position)
          const compTelem = interpolateAtTime(compData.fullGroundTruth, state.currentTime);
          if (compTelem && comparisonMarker) {
            comparisonMarker.setLatLng([compTelem.lat, compTelem.lon]);
            if (!map.hasLayer(comparisonMarker)) comparisonMarker.addTo(map);
          }

          // Delta: negative = comparison is ahead (faster), positive = comparison is behind
          // At same time, compare positions to show gap
          const positionDelta = compTelem.lapPosition - state.currentPosition;
          const distanceGap = positionDelta * ld.totalDistance; // gap in meters

          // Show time delta: how much time difference at this track position
          const mainTimeAtPos = telem.lapTime;
          const compTimeAtSamePos = positionToTime(compData.fullGroundTruth, state.currentPosition);
          const timeDelta = compTimeAtSamePos - mainTimeAtPos;
          updateDeltaDisplay(timeDelta);
        }
      }

      // Update telemetry display
      updateTelemetryDisplay(telem);

      // Update timeline
      updateTimeline(state.currentTime, ld.duration);

      // Update chart cursors
      updateChartCursors();
    }

    function setSpeed(speed) {
      state.playbackSpeed = speed;
      document.querySelectorAll('.speed-btn').forEach(btn => {
        btn.classList.toggle('active', parseInt(btn.dataset.speed) === speed);
      });
    }

    function seekStart() {
      seekToTime(0);
    }

    function seekEnd() {
      const ld = getLapData();
      if (ld) seekToTime(ld.duration);
    }

    function stepForward() {
      seekToTime(state.currentTime + 1); // Step 1 second forward
    }

    function stepBackward() {
      seekToTime(state.currentTime - 1); // Step 1 second backward
    }

    function seekToTime(time) {
      const ld = getLapData();
      if (!ld) return;

      time = Math.max(0, Math.min(time, ld.duration));
      const pos = timeToPosition(ld.fullGroundTruth, time);
      setPositionFromTime(pos, time);
    }

    // Timeline drag handlers
    function startTimelineDrag(e) {
      e.preventDefault();
      isDragging = true;
      seekFromEvent(e);
    }

    function dragTimeline(e) {
      if (!isDragging) return;
      e.preventDefault();
      seekFromEvent(e);
    }

    function stopTimelineDrag() {
      isDragging = false;
    }

    function seekFromEvent(e) {
      const timeline = document.getElementById('timeline');
      const rect = timeline.getBoundingClientRect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));

      // Convert percentage to time, then seek
      const ld = getLapData();
      if (ld) {
        const time = pct * ld.duration;
        seekToTime(time);
      }
    }

    // =====================================================
    // MAP LAYERS
    // =====================================================
    function createLayers() {
      Object.values(leafletLayers).forEach(l => map.removeLayer(l));
      leafletLayers = {};

      const ld = getLapData();
      if (!ld) return;

      const prefix = state.currentMode === 'clean' ? 'clean' : 'noisy';

      // Ground Truth with speed-based gradient coloring
      leafletLayers.groundTruth = createSpeedGradientTrack(ld.fullGroundTruth);

      // GPS Points
      const gpsData = state.currentMode === 'clean' ? ld.cleanGPS : ld.noisyGPS;
      leafletLayers.gpsPoints = L.layerGroup();
      gpsData.forEach((c, i) => {
        L.circleMarker(c, {
          radius: 4, color: '#dc2626', fillColor: '#ef4444', fillOpacity: 0.8, weight: 2
        }).bindPopup('GPS #' + (i+1)).addTo(leafletLayers.gpsPoints);
      });

      // Algorithms
      leafletLayers.linear = L.polyline(ld[prefix + 'Linear'], {
        color: '#f97316', weight: 2, opacity: 0.8, dashArray: '5, 5'
      });
      leafletLayers.spline = L.polyline(ld[prefix + 'Spline'], {
        color: '#2563eb', weight: 3, opacity: 0.9
      });

      // Speed Labels
      leafletLayers.speedLabels = L.layerGroup();
      if (ld.speedExtrema) {
        ld.speedExtrema.minPoints.forEach((p, i) => {
          const icon = L.divIcon({
            className: 'speed-label',
            html: '<div class="speed-marker speed-min">' + p.speedKmh + '</div>',
            iconSize: [50, 20],
            iconAnchor: [25, 10]
          });
          L.marker([p.lat, p.lon], { icon: icon })
            .bindPopup('<b>Braking #' + (i+1) + '</b><br>' + p.speedKmh + ' km/h')
            .addTo(leafletLayers.speedLabels);
        });
        ld.speedExtrema.maxPoints.forEach((p, i) => {
          const icon = L.divIcon({
            className: 'speed-label',
            html: '<div class="speed-marker speed-max">' + p.speedKmh + '</div>',
            iconSize: [50, 20],
            iconAnchor: [25, 10]
          });
          L.marker([p.lat, p.lon], { icon: icon })
            .bindPopup('<b>Top Speed #' + (i+1) + '</b><br>' + p.speedKmh + ' km/h')
            .addTo(leafletLayers.speedLabels);
        });
      }

      // Add visible layers
      Object.keys(LAYERS).forEach(key => {
        if (LAYERS[key].visible && leafletLayers[key]) {
          leafletLayers[key].addTo(map);
        }
      });

      // Fit bounds
      if (ld.groundTruth.length > 0) {
        map.fitBounds(ld.groundTruth, { padding: [30, 30] });
      }

      // Make trajectory clickable
      leafletLayers.groundTruth.on('click', onTrajectoryClick);
      leafletLayers.spline.on('click', onTrajectoryClick);
    }

    function onTrajectoryClick(e) {
      const ld = getLapData();
      if (!ld) return;

      // Find nearest point
      let minDist = Infinity;
      let nearestPos = 0;

      ld.fullGroundTruth.forEach(p => {
        const dist = Math.pow(e.latlng.lat - p.lat, 2) + Math.pow(e.latlng.lng - p.lon, 2);
        if (dist < minDist) {
          minDist = dist;
          nearestPos = p.lapPosition;
        }
      });

      setPosition(nearestPos);
    }

    function toggleLayer(key, visible) {
      LAYERS[key].visible = visible;
      if (visible && leafletLayers[key]) {
        leafletLayers[key].addTo(map);
      } else if (leafletLayers[key]) {
        map.removeLayer(leafletLayers[key]);
      }
    }

    // Create a speed-colored gradient track using polyline segments
    function createSpeedGradientTrack(data) {
      if (!data || data.length < 2) return L.layerGroup();

      // Find min/max speed for normalization
      const speeds = data.map(p => p.speed || 0);
      const minSpeed = Math.min(...speeds);
      const maxSpeed = Math.max(...speeds);
      const speedRange = maxSpeed - minSpeed || 1;

      // Color interpolation: red (slow) -> yellow -> green (fast)
      function speedToColor(speed) {
        const normalized = (speed - minSpeed) / speedRange; // 0 to 1

        // RGB interpolation: red (255,0,0) -> yellow (255,255,0) -> green (0,200,0)
        let r, g, b;
        if (normalized < 0.5) {
          // Red to Yellow (0-0.5)
          const t = normalized * 2;
          r = 255;
          g = Math.round(255 * t);
          b = 0;
        } else {
          // Yellow to Green (0.5-1)
          const t = (normalized - 0.5) * 2;
          r = Math.round(255 * (1 - t));
          g = Math.round(255 - 55 * t); // 255 -> 200
          b = 0;
        }
        return 'rgb(' + r + ',' + g + ',' + b + ')';
      }

      const layerGroup = L.layerGroup();

      // Create polyline segments with gradient colors
      for (let i = 0; i < data.length - 1; i++) {
        const p1 = data[i];
        const p2 = data[i + 1];
        const avgSpeed = ((p1.speed || 0) + (p2.speed || 0)) / 2;
        const color = speedToColor(avgSpeed);

        const segment = L.polyline([[p1.lat, p1.lon], [p2.lat, p2.lon]], {
          color: color,
          weight: 6,
          opacity: 0.9,
          lineCap: 'round',
          lineJoin: 'round'
        });

        layerGroup.addLayer(segment);
      }

      return layerGroup;
    }

    function buildLayerControls() {
      const container = document.getElementById('layer-controls');
      container.innerHTML = Object.entries(LAYERS).map(([key, cfg]) =>
        '<label class="layer-checkbox">' +
        '<input type="checkbox" ' + (cfg.visible ? 'checked' : '') +
        ' onchange="toggleLayer(\\'' + key + '\\', this.checked)">' +
        '<span class="color-dot" style="background: ' + cfg.color + ';"></span>' +
        '<span>' + cfg.label + '</span></label>'
      ).join('');
    }

    // =====================================================
    // CONTROLS
    // =====================================================
    function changeLap(lap) {
      state.currentLap = parseInt(lap);
      state.currentPosition = 0;
      state.currentTime = 0;

      // Remove comparison marker when changing lap
      if (comparisonMarker && map.hasLayer(comparisonMarker)) {
        map.removeLayer(comparisonMarker);
      }

      createLayers();
      updateCharts();
      updateMetrics();
      updateInfo();
      setPosition(0);
    }

    function setComparison(lap) {
      state.comparisonLap = lap ? parseInt(lap) : null;

      const container = document.getElementById('delta-chart-container');
      const deltaDisplay = document.getElementById('delta-display');

      if (state.comparisonLap) {
        container.style.display = 'block';
        createDeltaChart();
      } else {
        container.style.display = 'none';
        deltaDisplay.textContent = '--';
        deltaDisplay.className = 'delta-display neutral';
        if (comparisonMarker && map.hasLayer(comparisonMarker)) {
          map.removeLayer(comparisonMarker);
        }
      }

      setPosition(state.currentPosition);
    }

    function createDeltaChart() {
      const ld = getLapData();
      const compData = getComparisonData();
      if (!ld || !compData) return;

      // Calculate deltas at each position
      const deltas = [];
      const positions = [];

      for (let pos = 0; pos <= 1; pos += 0.01) {
        const mainTelem = interpolateAtPosition(ld.fullGroundTruth, pos);
        const compTelem = interpolateAtPosition(compData.fullGroundTruth, pos);

        if (mainTelem && compTelem) {
          deltas.push(compTelem.lapTime - mainTelem.lapTime);
          positions.push((pos * 100).toFixed(0) + '%');
        }
      }

      // Destroy existing chart if any
      if (charts.delta) {
        charts.delta.destroy();
      }

      charts.delta = new Chart(document.getElementById('delta-chart'), {
        type: 'line',
        data: {
          labels: positions,
          datasets: [{
            data: deltas,
            borderColor: '#8b5cf6',
            borderWidth: 1.5,
            fill: {
              target: 'origin',
              above: 'rgba(239, 68, 68, 0.3)',
              below: 'rgba(16, 185, 129, 0.3)'
            },
            pointRadius: 0,
            tension: 0.1
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: false,
          plugins: {
            legend: { display: false },
            annotation: {
              annotations: {
                zero: {
                  type: 'line',
                  yMin: 0,
                  yMax: 0,
                  borderColor: 'rgba(255,255,255,0.3)',
                  borderWidth: 1,
                  borderDash: [5, 5]
                },
                cursor: {
                  type: 'line',
                  xMin: 0,
                  xMax: 0,
                  borderColor: '#ef4444',
                  borderWidth: 2,
                }
              }
            }
          },
          scales: {
            x: {
              display: true,
              grid: { color: 'rgba(255,255,255,0.1)' },
              ticks: { color: '#718096', maxTicksLimit: 10 }
            },
            y: {
              display: true,
              grid: { color: 'rgba(255,255,255,0.1)' },
              ticks: { color: '#718096' }
            }
          }
        }
      });
    }

    function setMode(mode) {
      state.currentMode = mode;
      document.querySelectorAll('.mode-btn').forEach(btn => {
        btn.classList.toggle('active', btn.textContent.toLowerCase().includes(mode));
      });
      createLayers();
      updateMetrics();
    }

    function updateCharts() {
      const ld = getLapData();
      if (!ld || !ld.chartData) return;

      const distances = ld.chartData.distances.map(d => (d / 1000).toFixed(2));

      if (charts.speed) {
        charts.speed.data.labels = distances;
        charts.speed.data.datasets[0].data = ld.chartData.speeds;
        charts.speed.update('none');
      }

      if (charts.lateral) {
        charts.lateral.data.labels = distances;
        charts.lateral.data.datasets[0].data = ld.chartData.lateralAcc;
        charts.lateral.update('none');
      }

      if (charts.longitudinal) {
        charts.longitudinal.data.labels = distances;
        charts.longitudinal.data.datasets[0].data = ld.chartData.longitudinalAcc;
        charts.longitudinal.update('none');
      }
    }

    function updateMetrics() {
      const ld = getLapData();
      if (!ld) return;

      const metrics = state.currentMode === 'clean' ? ld.cleanMetrics : ld.noisyMetrics;
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

    function updateInfo() {
      const ld = getLapData();
      if (!ld) return;

      document.getElementById('info-duration').textContent = formatTime(ld.duration);
      document.getElementById('info-distance').textContent = ((ld.totalDistance || 0) / 1000).toFixed(2) + ' km';
      document.getElementById('info-points').textContent = ld.cleanGPS.length;
    }

    // =====================================================
    // STARTUP
    // =====================================================
    init();
    updateMetrics();
  </script>
</body>
</html>`;

  fs.writeFileSync(filename, html);
  console.log(`   Map: ${filename}`);
}
