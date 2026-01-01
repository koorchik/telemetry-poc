/**
 * Browser visualization module.
 * Renders the telemetry visualization directly in the DOM.
 * @module browser/visualization
 */

import chroma from 'chroma-js';
import { findSpeedExtrema } from '../analysis/speed-extrema.js';
import {
  interpolateAtPosition,
  interpolateAtTime,
  positionToTime,
  timeToPosition,
  interpolateBearing,
} from '../math/interpolation.js';

// =====================================================
// STYLES
// =====================================================
const STYLES = `
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #1a1a2e; color: #eee; }

.app-container {
  display: grid;
  grid-template-rows: auto 1fr auto auto;
  grid-template-columns: 1fr 1fr;
  height: 100vh;
  gap: 0;
}

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

.map-panel {
  grid-row: 2;
  grid-column: 1;
  position: relative;
  min-height: 400px;
}
#map { height: 100%; width: 100%; }

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
.telemetry-item { text-align: center; }
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

.replay-controls {
  grid-column: 1 / -1;
  background: #16213e;
  padding: 16px 20px;
  display: flex;
  align-items: center;
  gap: 16px;
  border-top: 1px solid #2d3748;
}

.replay-buttons { display: flex; gap: 8px; }
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

.speed-selector { display: flex; gap: 4px; }
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

.mode-toggle { display: flex; gap: 4px; }
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

.car-marker {
  width: 24px;
  height: 24px;
  background: #3b82f6;
  border: 3px solid #fff;
  border-radius: 50%;
  box-shadow: 0 2px 8px rgba(0,0,0,0.4);
  transition: transform 0.05s linear;
}
.car-marker.comparison { background: #f59e0b; }

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
.metrics-table th:not(:first-child), .metrics-table td:not(:first-child) { text-align: right; }
.metrics-table th { font-weight: 600; color: #718096; }
.metrics-table td { color: #e2e8f0; }
.metrics-table .best { background: rgba(16, 185, 129, 0.2); }

.outlier-stats {
  font-size: 11px;
  color: #a0aec0;
  margin-bottom: 12px;
  padding: 8px;
  background: rgba(45, 55, 72, 0.5);
  border-radius: 4px;
}
.metrics-header {
  font-size: 11px;
  color: #718096;
  margin: 12px 0 6px;
  text-transform: uppercase;
  font-weight: 600;
}
.metrics-header:first-of-type { margin-top: 0; }
`;

// =====================================================
// HTML TEMPLATE
// =====================================================
function createHTML(laps, selectedLap) {
  return `
  <div class="app-container">
    <div class="header">
      <h1>GPS Telemetry Analysis</h1>
      <div class="header-controls">
        <div class="delta-display neutral" id="delta-display">--</div>
      </div>
    </div>

    <div class="map-panel">
      <div id="map"></div>
      <div class="map-overlay">
        <h4>Layers</h4>
        <div id="layer-controls"></div>
      </div>
    </div>

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
        <h3>Algorithm Accuracy Metrics</h3>
        <div id="metrics-container"></div>
      </div>
    </div>

    <div class="replay-controls">
      <div class="replay-buttons">
        <button class="replay-btn" id="btn-start" title="Start">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>
        </button>
        <button class="replay-btn" id="btn-back" title="Step Back">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M11 18V6l-8.5 6 8.5 6zm.5-6l8.5 6V6l-8.5 6z"/></svg>
        </button>
        <button class="replay-btn play-pause" id="btn-play" title="Play/Pause">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" id="play-icon"><path d="M8 5v14l11-7z"/></svg>
        </button>
        <button class="replay-btn" id="btn-forward" title="Step Forward">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z"/></svg>
        </button>
        <button class="replay-btn" id="btn-end" title="End">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>
        </button>
      </div>

      <div class="speed-selector">
        <button class="speed-btn active" data-speed="1">1x</button>
        <button class="speed-btn" data-speed="2">2x</button>
        <button class="speed-btn" data-speed="4">4x</button>
        <button class="speed-btn" data-speed="8">8x</button>
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

    <div class="footer-controls">
      <div class="lap-selectors">
        <div class="lap-selector-group">
          <label>Lap:</label>
          <select class="lap-select" id="lap-selector">
            ${laps.map(l => `<option value="${l}" ${l === selectedLap ? 'selected' : ''}>Lap ${l}</option>`).join('')}
          </select>
        </div>
        <div class="lap-selector-group">
          <label>Compare:</label>
          <select class="lap-select" id="comparison-selector">
            <option value="">None</option>
            ${laps.map(l => `<option value="${l}">Lap ${l}</option>`).join('')}
          </select>
        </div>
        <div class="mode-toggle">
          <button class="mode-btn active" data-mode="clean">Clean GPS</button>
          <button class="mode-btn" data-mode="noisy">Noisy GPS</button>
        </div>
      </div>

      <div class="lap-info">
        <div>Duration: <span id="info-duration">--</span></div>
        <div>Distance: <span id="info-distance">--</span></div>
        <div>Points: <span id="info-points">--</span></div>
      </div>
    </div>
  </div>
  `;
}

// =====================================================
// VISUALIZATION CLASS
// =====================================================
export class TelemetryVisualization {
  constructor(container, processedData) {
    this.container = container;
    this.data = this.prepareData(processedData);
    this.state = {
      currentLap: this.data.selectedLap,
      comparisonLap: null,
      currentMode: 'clean',
      currentTime: 0,
      currentPosition: 0,
      isPlaying: false,
      playbackSpeed: 1,
      lastFrameTime: null,
    };
    this.leafletLayers = {};
    this.comparisonTrackLayer = null;
    this.carMarker = null;
    this.comparisonMarker = null;
    this.charts = {};
    this.map = null;
    this.isDragging = false;

    this.LAYERS = {
      groundTruth: { label: 'Ground Truth (25Hz)', color: '#22c55e', visible: true },
      gpsPoints: { label: 'GPS Points (1Hz)', color: '#ef4444', visible: false },
      linear: { label: 'Linear Interp.', color: '#f97316', visible: false },
      spline: { label: 'Spline', color: '#2563eb', visible: false },
      ekfRaw: { label: 'EKF Raw', color: '#ec4899', visible: false },
      ekfSmooth: { label: 'EKF + Spline', color: '#8b5cf6', visible: false },
      speedLabels: { label: 'Speed Labels', color: '#a855f7', visible: true },
    };
  }

  prepareData(processedData) {
    const { laps, allLapsData, selectedLap } = processedData;

    const downsample = (arr, ratio = 5) => (arr || []).filter((_, i) => i % ratio === 0);
    const toCoords = arr => (arr || []).map(p => [p.lat, p.lon]);

    const lapsMapData = {};
    for (const lap of laps) {
      const ld = allLapsData[lap];
      if (!ld) continue;

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
        cleanEkfRaw: toCoords(downsample(ld.cleanEkfRaw || [])),
        cleanEkfSmooth: toCoords(downsample(ld.cleanEkfSmooth || [])),
        noisyLinear: toCoords(downsample(ld.noisyLinear)),
        noisySpline: toCoords(downsample(ld.noisySpline)),
        noisyEkfRaw: toCoords(downsample(ld.noisyEkfRaw || [])),
        noisyEkfSmooth: toCoords(downsample(ld.noisyEkfSmooth || [])),
        cleanMetrics: ld.cleanMetrics,
        noisyMetrics: ld.noisyMetrics,
        outliers: ld.outliers,
        duration: ld.duration,
        totalDistance: ld.totalDistance,
        chartData: ld.chartData,
        speedExtrema: lapSpeedExtrema,
      };
    }

    // Calculate bounds
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

    return {
      laps,
      selectedLap,
      lapsData: lapsMapData,
      bounds,
    };
  }

  init() {
    // Add styles
    if (!document.getElementById('telemetry-viz-styles')) {
      const styleEl = document.createElement('style');
      styleEl.id = 'telemetry-viz-styles';
      styleEl.textContent = STYLES;
      document.head.appendChild(styleEl);
    }

    // Render HTML
    this.container.innerHTML = createHTML(this.data.laps, this.data.selectedLap);

    // Initialize components
    this.initMap();
    this.initCharts();
    this.buildLayerControls();
    this.createLayers();
    this.updateInfo();
    this.updateTelemetryDisplay(0);
    this.updateMetrics();

    // Event listeners
    this.setupEventListeners();
  }

  setupEventListeners() {
    // Replay buttons
    document.getElementById('btn-start').onclick = () => this.seekStart();
    document.getElementById('btn-back').onclick = () => this.stepBackward();
    document.getElementById('btn-play').onclick = () => this.togglePlay();
    document.getElementById('btn-forward').onclick = () => this.stepForward();
    document.getElementById('btn-end').onclick = () => this.seekEnd();

    // Speed buttons
    document.querySelectorAll('.speed-btn').forEach(btn => {
      btn.onclick = () => this.setSpeed(parseInt(btn.dataset.speed));
    });

    // Mode buttons
    document.querySelectorAll('.mode-btn').forEach(btn => {
      btn.onclick = () => this.setMode(btn.dataset.mode);
    });

    // Lap selector
    document.getElementById('lap-selector').onchange = (e) => this.changeLap(e.target.value);
    document.getElementById('comparison-selector').onchange = (e) => this.setComparison(e.target.value);

    // Timeline drag
    const timeline = document.getElementById('timeline');
    timeline.addEventListener('mousedown', (e) => this.startTimelineDrag(e));
    document.addEventListener('mousemove', (e) => this.dragTimeline(e));
    document.addEventListener('mouseup', () => this.stopTimelineDrag());
    timeline.addEventListener('touchstart', (e) => this.startTimelineDrag(e), { passive: false });
    document.addEventListener('touchmove', (e) => this.dragTimeline(e), { passive: false });
    document.addEventListener('touchend', () => this.stopTimelineDrag());

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.code === 'Space') { e.preventDefault(); this.togglePlay(); }
      if (e.code === 'ArrowLeft') this.stepBackward();
      if (e.code === 'ArrowRight') this.stepForward();
    });
  }

  initMap() {
    this.map = L.map('map');

    // Base tile layers
    const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap',
      maxZoom: 21,
      maxNativeZoom: 19
    });

    const esriSatelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      attribution: '© Esri',
      maxZoom: 21,
      maxNativeZoom: 18
    });

    const googleSatelliteLayer = L.tileLayer('https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
      attribution: '© Google',
      maxZoom: 21,
      maxNativeZoom: 20
    });

    // Add default layer and layer control
    googleSatelliteLayer.addTo(this.map);
    L.control.layers({
      'Google Satellite': googleSatelliteLayer,
      'Esri Satellite': esriSatelliteLayer,
      'Street': osmLayer
    }, null, { position: 'bottomleft' }).addTo(this.map);

    this.map.fitBounds(this.data.bounds, { padding: [30, 30] });

    // Car markers
    const carIcon = L.divIcon({
      className: '',
      html: '<div class="car-marker"></div>',
      iconSize: [24, 24],
      iconAnchor: [12, 12]
    });
    this.carMarker = L.marker([0, 0], { icon: carIcon, zIndexOffset: 1000 });

    const compIcon = L.divIcon({
      className: '',
      html: '<div class="car-marker comparison"></div>',
      iconSize: [24, 24],
      iconAnchor: [12, 12]
    });
    this.comparisonMarker = L.marker([0, 0], { icon: compIcon, zIndexOffset: 999 });
  }

  initCharts() {
    const ld = this.getLapData();
    if (!ld || !ld.chartData) return;

    const commonOptions = {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: {
        legend: { display: false },
        annotation: {
          annotations: {
            cursor: { type: 'line', xMin: 0, xMax: 0, borderColor: '#ef4444', borderWidth: 2 }
          }
        }
      },
      scales: {
        x: { display: true, grid: { color: 'rgba(255,255,255,0.1)' }, ticks: { color: '#718096', maxTicksLimit: 8 } },
        y: { display: true, grid: { color: 'rgba(255,255,255,0.1)' }, ticks: { color: '#718096' } }
      }
    };

    const distances = ld.chartData.distances.map(d => (d / 1000).toFixed(2));

    this.charts.speed = new Chart(document.getElementById('speed-chart'), {
      type: 'line',
      data: {
        labels: distances,
        datasets: [{ data: ld.chartData.speeds, borderColor: '#3b82f6', borderWidth: 1.5, fill: false, pointRadius: 0, tension: 0.1 }]
      },
      options: { ...commonOptions }
    });

    this.charts.lateral = new Chart(document.getElementById('lateral-chart'), {
      type: 'line',
      data: {
        labels: distances,
        datasets: [{ data: ld.chartData.lateralAcc, borderColor: '#f59e0b', borderWidth: 1.5, fill: false, pointRadius: 0, tension: 0.1 }]
      },
      options: { ...commonOptions }
    });

    this.charts.longitudinal = new Chart(document.getElementById('longitudinal-chart'), {
      type: 'line',
      data: {
        labels: distances,
        datasets: [{ data: ld.chartData.longitudinalAcc, borderColor: '#10b981', borderWidth: 1.5, fill: false, pointRadius: 0, tension: 0.1 }]
      },
      options: { ...commonOptions }
    });
  }

  getLapData() {
    return this.data.lapsData[this.state.currentLap] || this.data.lapsData[this.data.laps[0]];
  }

  getComparisonData() {
    if (!this.state.comparisonLap) return null;
    return this.data.lapsData[this.state.comparisonLap];
  }

  setPosition(pos, updateCharts = true) {
    this.state.currentPosition = Math.max(0, Math.min(1, pos));

    const ld = this.getLapData();
    if (!ld) return;

    this.state.currentTime = positionToTime(ld.fullGroundTruth, this.state.currentPosition);

    const telem = interpolateAtPosition(ld.fullGroundTruth, this.state.currentPosition);
    if (telem && this.carMarker) {
      this.carMarker.setLatLng([telem.lat, telem.lon]);
      if (!this.map.hasLayer(this.carMarker)) this.carMarker.addTo(this.map);
    }

    if (this.state.comparisonLap) {
      const compData = this.getComparisonData();
      if (compData) {
        const compTelem = interpolateAtTime(compData.fullGroundTruth, this.state.currentTime);
        if (compTelem && this.comparisonMarker) {
          this.comparisonMarker.setLatLng([compTelem.lat, compTelem.lon]);
          if (!this.map.hasLayer(this.comparisonMarker)) this.comparisonMarker.addTo(this.map);
        }

        const compTimeAtSamePos = positionToTime(compData.fullGroundTruth, this.state.currentPosition);
        const timeDelta = compTimeAtSamePos - this.state.currentTime;
        this.updateDeltaDisplay(timeDelta);
      }
    }

    this.updateTelemetryDisplay(telem);
    this.updateTimeline(this.state.currentTime, ld.duration);

    if (updateCharts) {
      this.updateChartCursors();
    }
  }

  setPositionFromTime(pos, time) {
    this.state.currentPosition = Math.max(0, Math.min(1, pos));
    this.state.currentTime = time;

    const ld = this.getLapData();
    if (!ld) return;

    const telem = interpolateAtPosition(ld.fullGroundTruth, this.state.currentPosition);
    if (telem && this.carMarker) {
      this.carMarker.setLatLng([telem.lat, telem.lon]);
      if (!this.map.hasLayer(this.carMarker)) this.carMarker.addTo(this.map);
    }

    if (this.state.comparisonLap) {
      const compData = this.getComparisonData();
      if (compData) {
        const compTelem = interpolateAtTime(compData.fullGroundTruth, this.state.currentTime);
        if (compTelem && this.comparisonMarker) {
          this.comparisonMarker.setLatLng([compTelem.lat, compTelem.lon]);
          if (!this.map.hasLayer(this.comparisonMarker)) this.comparisonMarker.addTo(this.map);
        }

        const compTimeAtSamePos = positionToTime(compData.fullGroundTruth, this.state.currentPosition);
        const timeDelta = compTimeAtSamePos - telem.lapTime;
        this.updateDeltaDisplay(timeDelta);
      }
    }

    this.updateTelemetryDisplay(telem);
    this.updateTimeline(this.state.currentTime, ld.duration);
    this.updateChartCursors();
  }

  updateTelemetryDisplay(telem) {
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

  updateDeltaDisplay(delta) {
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

  updateTimeline(currentTime, totalTime) {
    const pct = totalTime > 0 ? (currentTime / totalTime) * 100 : 0;
    document.getElementById('timeline-progress').style.width = pct + '%';
    document.getElementById('timeline-thumb').style.left = pct + '%';
    document.getElementById('current-time').textContent = this.formatTime(currentTime);
    document.getElementById('total-time').textContent = this.formatTime(totalTime);
  }

  formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = (seconds % 60).toFixed(1);
    return mins + ':' + secs.padStart(4, '0');
  }

  updateChartCursors() {
    const ld = this.getLapData();
    if (!ld || !ld.chartData) return;

    const positions = ld.chartData.lapPositions;
    let telemIdx = 0;
    for (let i = 0; i < positions.length; i++) {
      if (positions[i] >= this.state.currentPosition) {
        telemIdx = i;
        break;
      }
      telemIdx = i;
    }

    const deltaIdx = Math.round(this.state.currentPosition * 100);

    ['speed', 'lateral', 'longitudinal'].forEach(key => {
      const chart = this.charts[key];
      if (chart && chart.options.plugins.annotation) {
        chart.options.plugins.annotation.annotations.cursor.xMin = telemIdx;
        chart.options.plugins.annotation.annotations.cursor.xMax = telemIdx;
        chart.update('none');
      }
    });

    if (this.charts.delta && this.charts.delta.options.plugins.annotation) {
      this.charts.delta.options.plugins.annotation.annotations.cursor.xMin = deltaIdx;
      this.charts.delta.options.plugins.annotation.annotations.cursor.xMax = deltaIdx;
      this.charts.delta.update('none');
    }
  }

  togglePlay() {
    this.state.isPlaying = !this.state.isPlaying;

    const icon = document.getElementById('play-icon');
    if (this.state.isPlaying) {
      icon.innerHTML = '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>';
      this.state.lastFrameTime = performance.now();
      this.animate();
    } else {
      icon.innerHTML = '<path d="M8 5v14l11-7z"/>';
    }
  }

  animate() {
    if (!this.state.isPlaying) return;

    const now = performance.now();
    const dt = (now - this.state.lastFrameTime) / 1000;
    this.state.lastFrameTime = now;

    const ld = this.getLapData();
    if (!ld) return;

    this.state.currentTime += dt * this.state.playbackSpeed;

    if (this.state.currentTime >= ld.duration) {
      this.state.currentTime = 0;
    }

    const pos = timeToPosition(ld.fullGroundTruth, this.state.currentTime);
    this.setPositionFromTime(pos, this.state.currentTime);

    requestAnimationFrame(() => this.animate());
  }

  setSpeed(speed) {
    this.state.playbackSpeed = speed;
    document.querySelectorAll('.speed-btn').forEach(btn => {
      btn.classList.toggle('active', parseInt(btn.dataset.speed) === speed);
    });
  }

  seekStart() { this.seekToTime(0); }
  seekEnd() {
    const ld = this.getLapData();
    if (ld) this.seekToTime(ld.duration);
  }
  stepForward() { this.seekToTime(this.state.currentTime + 1); }
  stepBackward() { this.seekToTime(this.state.currentTime - 1); }

  seekToTime(time) {
    const ld = this.getLapData();
    if (!ld) return;

    time = Math.max(0, Math.min(time, ld.duration));
    const pos = timeToPosition(ld.fullGroundTruth, time);
    this.setPositionFromTime(pos, time);
  }

  startTimelineDrag(e) {
    e.preventDefault();
    this.isDragging = true;
    this.seekFromEvent(e);
  }

  dragTimeline(e) {
    if (!this.isDragging) return;
    e.preventDefault();
    this.seekFromEvent(e);
  }

  stopTimelineDrag() {
    this.isDragging = false;
  }

  seekFromEvent(e) {
    const timeline = document.getElementById('timeline');
    const rect = timeline.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));

    const ld = this.getLapData();
    if (ld) {
      const time = pct * ld.duration;
      this.seekToTime(time);
    }
  }

  createLayers() {
    Object.values(this.leafletLayers).forEach(l => this.map.removeLayer(l));
    this.leafletLayers = {};

    const ld = this.getLapData();
    if (!ld) return;

    const prefix = this.state.currentMode === 'clean' ? 'clean' : 'noisy';

    // Ground Truth with speed gradient
    this.leafletLayers.groundTruth = this.createSpeedGradientTrack(ld.fullGroundTruth);

    // GPS Points
    const gpsData = this.state.currentMode === 'clean' ? ld.cleanGPS : ld.noisyGPS;
    this.leafletLayers.gpsPoints = L.layerGroup();
    gpsData.forEach((c, i) => {
      L.circleMarker(c, { radius: 4, color: '#dc2626', fillColor: '#ef4444', fillOpacity: 0.8, weight: 2 })
        .bindPopup('GPS #' + (i + 1))
        .addTo(this.leafletLayers.gpsPoints);
    });

    // Algorithms
    this.leafletLayers.linear = L.polyline(ld[prefix + 'Linear'], { color: '#f97316', weight: 2, opacity: 0.8, dashArray: '5, 5' });
    this.leafletLayers.spline = L.polyline(ld[prefix + 'Spline'], { color: '#2563eb', weight: 3, opacity: 0.9 });

    // EKF algorithms
    const ekfRawData = ld[prefix + 'EkfRaw'] || [];
    const ekfSmoothData = ld[prefix + 'EkfSmooth'] || [];
    this.leafletLayers.ekfRaw = L.polyline(ekfRawData, { color: '#ec4899', weight: 2, opacity: 0.8, dashArray: '3, 3' });
    this.leafletLayers.ekfSmooth = L.polyline(ekfSmoothData, { color: '#8b5cf6', weight: 3, opacity: 0.9 });

    // Speed Labels
    this.leafletLayers.speedLabels = L.layerGroup();
    if (ld.speedExtrema) {
      ld.speedExtrema.minPoints.forEach((p, i) => {
        const icon = L.divIcon({
          className: 'speed-label',
          html: '<div class="speed-marker speed-min">' + p.speedKmh + '</div>',
          iconSize: [50, 20],
          iconAnchor: [25, 10]
        });
        L.marker([p.lat, p.lon], { icon })
          .bindPopup('<b>Braking #' + (i + 1) + '</b><br>' + p.speedKmh + ' km/h')
          .addTo(this.leafletLayers.speedLabels);
      });
      ld.speedExtrema.maxPoints.forEach((p, i) => {
        const icon = L.divIcon({
          className: 'speed-label',
          html: '<div class="speed-marker speed-max">' + p.speedKmh + '</div>',
          iconSize: [50, 20],
          iconAnchor: [25, 10]
        });
        L.marker([p.lat, p.lon], { icon })
          .bindPopup('<b>Top Speed #' + (i + 1) + '</b><br>' + p.speedKmh + ' km/h')
          .addTo(this.leafletLayers.speedLabels);
      });
    }

    // Add visible layers
    Object.keys(this.LAYERS).forEach(key => {
      if (this.LAYERS[key].visible && this.leafletLayers[key]) {
        this.leafletLayers[key].addTo(this.map);
      }
    });

    // Fit bounds
    if (ld.groundTruth.length > 0) {
      this.map.fitBounds(ld.groundTruth, { padding: [30, 30] });
    }

    // Trajectory click
    this.leafletLayers.groundTruth.on('click', (e) => this.onTrajectoryClick(e));
    this.leafletLayers.spline.on('click', (e) => this.onTrajectoryClick(e));
    this.leafletLayers.ekfRaw.on('click', (e) => this.onTrajectoryClick(e));
    this.leafletLayers.ekfSmooth.on('click', (e) => this.onTrajectoryClick(e));
  }

  createSpeedGradientTrack(data, opacity = 0.9) {
    if (!data || data.length < 2) return L.layerGroup();

    const speeds = data.map(p => p.speed || 0);
    const minSpeed = Math.min(...speeds);
    const maxSpeed = Math.max(...speeds);

    // Use chroma.js for perceptually uniform color interpolation
    const colorScale = chroma
      .scale(['#ff0000', '#ffff00', '#00c800'])
      .mode('lab')
      .domain([minSpeed, maxSpeed]);

    const layerGroup = L.layerGroup();

    for (let i = 0; i < data.length - 1; i++) {
      const p1 = data[i];
      const p2 = data[i + 1];
      const avgSpeed = ((p1.speed || 0) + (p2.speed || 0)) / 2;
      const color = colorScale(avgSpeed).hex();

      const segment = L.polyline([[p1.lat, p1.lon], [p2.lat, p2.lon]], {
        color, weight: 6, opacity, lineCap: 'round', lineJoin: 'round'
      });
      layerGroup.addLayer(segment);
    }

    return layerGroup;
  }

  onTrajectoryClick(e) {
    const ld = this.getLapData();
    if (!ld) return;

    let minDist = Infinity;
    let nearestPos = 0;

    ld.fullGroundTruth.forEach(p => {
      const dist = Math.pow(e.latlng.lat - p.lat, 2) + Math.pow(e.latlng.lng - p.lon, 2);
      if (dist < minDist) {
        minDist = dist;
        nearestPos = p.lapPosition;
      }
    });

    this.setPosition(nearestPos);
  }

  toggleLayer(key, visible) {
    this.LAYERS[key].visible = visible;
    if (visible && this.leafletLayers[key]) {
      this.leafletLayers[key].addTo(this.map);
    } else if (this.leafletLayers[key]) {
      this.map.removeLayer(this.leafletLayers[key]);
    }
  }

  buildLayerControls() {
    const container = document.getElementById('layer-controls');
    container.innerHTML = Object.entries(this.LAYERS).map(([key, cfg]) =>
      `<label class="layer-checkbox">
        <input type="checkbox" ${cfg.visible ? 'checked' : ''} data-layer="${key}">
        <span class="color-dot" style="background: ${cfg.color};"></span>
        <span>${cfg.label}</span>
      </label>`
    ).join('');

    container.querySelectorAll('input').forEach(input => {
      input.onchange = () => this.toggleLayer(input.dataset.layer, input.checked);
    });
  }

  changeLap(lap) {
    this.state.currentLap = parseInt(lap);
    this.state.currentPosition = 0;
    this.state.currentTime = 0;

    if (this.comparisonMarker && this.map.hasLayer(this.comparisonMarker)) {
      this.map.removeLayer(this.comparisonMarker);
    }

    this.createLayers();
    this.updateCharts();
    this.updateMetrics();
    this.updateInfo();
    this.setPosition(0);
  }

  setComparison(lap) {
    this.state.comparisonLap = lap ? parseInt(lap) : null;

    const container = document.getElementById('delta-chart-container');
    const deltaDisplay = document.getElementById('delta-display');

    // Remove existing comparison track layer
    if (this.comparisonTrackLayer && this.map.hasLayer(this.comparisonTrackLayer)) {
      this.map.removeLayer(this.comparisonTrackLayer);
      this.comparisonTrackLayer = null;
    }

    if (this.state.comparisonLap) {
      container.style.display = 'block';
      this.createDeltaChart();

      // Create comparison track layer (semi-transparent speed gradient)
      const compData = this.getComparisonData();
      if (compData && compData.fullGroundTruth) {
        this.comparisonTrackLayer = this.createSpeedGradientTrack(compData.fullGroundTruth, 0.4);
        this.comparisonTrackLayer.addTo(this.map);
      }
    } else {
      container.style.display = 'none';
      deltaDisplay.textContent = '--';
      deltaDisplay.className = 'delta-display neutral';
      if (this.comparisonMarker && this.map.hasLayer(this.comparisonMarker)) {
        this.map.removeLayer(this.comparisonMarker);
      }
    }

    this.setPosition(this.state.currentPosition);
  }

  createDeltaChart() {
    const ld = this.getLapData();
    const compData = this.getComparisonData();
    if (!ld || !compData) return;

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

    if (this.charts.delta) {
      this.charts.delta.destroy();
    }

    this.charts.delta = new Chart(document.getElementById('delta-chart'), {
      type: 'line',
      data: {
        labels: positions,
        datasets: [{
          data: deltas,
          borderColor: '#8b5cf6',
          borderWidth: 1.5,
          fill: { target: 'origin', above: 'rgba(239, 68, 68, 0.3)', below: 'rgba(16, 185, 129, 0.3)' },
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
              zero: { type: 'line', yMin: 0, yMax: 0, borderColor: 'rgba(255,255,255,0.3)', borderWidth: 1, borderDash: [5, 5] },
              cursor: { type: 'line', xMin: 0, xMax: 0, borderColor: '#ef4444', borderWidth: 2 }
            }
          }
        },
        scales: {
          x: { display: true, grid: { color: 'rgba(255,255,255,0.1)' }, ticks: { color: '#718096', maxTicksLimit: 10 } },
          y: { display: true, grid: { color: 'rgba(255,255,255,0.1)' }, ticks: { color: '#718096' } }
        }
      }
    });
  }

  setMode(mode) {
    this.state.currentMode = mode;
    document.querySelectorAll('.mode-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === mode);
    });
    this.createLayers();
    this.updateMetrics();
  }

  updateCharts() {
    const ld = this.getLapData();
    if (!ld || !ld.chartData) return;

    const distances = ld.chartData.distances.map(d => (d / 1000).toFixed(2));

    if (this.charts.speed) {
      this.charts.speed.data.labels = distances;
      this.charts.speed.data.datasets[0].data = ld.chartData.speeds;
      this.charts.speed.update('none');
    }

    if (this.charts.lateral) {
      this.charts.lateral.data.labels = distances;
      this.charts.lateral.data.datasets[0].data = ld.chartData.lateralAcc;
      this.charts.lateral.update('none');
    }

    if (this.charts.longitudinal) {
      this.charts.longitudinal.data.labels = distances;
      this.charts.longitudinal.data.datasets[0].data = ld.chartData.longitudinalAcc;
      this.charts.longitudinal.update('none');
    }
  }

  updateMetrics() {
    const ld = this.getLapData();
    if (!ld) return;

    const cleanMetrics = ld.cleanMetrics || {};
    const noisyMetrics = ld.noisyMetrics || {};
    const outliers = ld.outliers;

    // Algorithm display names
    const algorithmLabels = {
      linear: 'Linear',
      spline: 'Spline (Catmull-Rom)',
      ekfRaw: 'EKF Raw',
      ekfSmooth: 'EKF + Spline',
    };

    // Find best algorithms
    const cleanEntries = Object.entries(cleanMetrics);
    const noisyEntries = Object.entries(noisyMetrics);
    const cleanBest = cleanEntries.length > 0
      ? cleanEntries.sort((a, b) => a[1].rmse - b[1].rmse)[0][0]
      : null;
    const noisyBest = noisyEntries.length > 0
      ? noisyEntries.sort((a, b) => a[1].rmse - b[1].rmse)[0][0]
      : null;

    let html = '';

    // Outlier statistics
    if (outliers) {
      const cleanPct = ((outliers.clean / outliers.total) * 100).toFixed(1);
      const noisyPct = ((outliers.noisy / outliers.total) * 100).toFixed(1);
      html += `
        <div class="outlier-stats">
          <strong>Outlier Detection:</strong>
          Clean: ${outliers.clean}/${outliers.total} (${cleanPct}%) |
          Noisy: ${outliers.noisy}/${outliers.total} (${noisyPct}%)
        </div>
      `;
    }

    // Helper to build metrics table
    const buildTable = (entries, bestKey) => {
      if (entries.length === 0) return '<p style="color:#718096;font-size:11px;">No metrics available</p>';
      return '<table class="metrics-table"><tr><th>Algorithm</th><th>RMSE</th><th>MAE</th><th>Max</th></tr>' +
        entries.map(([key, m]) => {
          const label = algorithmLabels[key] || key.charAt(0).toUpperCase() + key.slice(1);
          return `<tr class="${key === bestKey ? 'best' : ''}">
            <td>${label}</td>
            <td>${m.rmse.toFixed(3)}m</td>
            <td>${m.mae.toFixed(3)}m</td>
            <td>${m.maxError.toFixed(3)}m</td>
          </tr>`;
        }).join('') + '</table>';
    };

    // Clean GPS Results
    html += '<h4 class="metrics-header">Clean GPS Results</h4>';
    html += buildTable(cleanEntries, cleanBest);

    // Noisy GPS Results
    html += '<h4 class="metrics-header">Noisy GPS Results (1-3m noise)</h4>';
    html += buildTable(noisyEntries, noisyBest);

    document.getElementById('metrics-container').innerHTML = html;
  }

  updateInfo() {
    const ld = this.getLapData();
    if (!ld) return;

    document.getElementById('info-duration').textContent = this.formatTime(ld.duration);
    document.getElementById('info-distance').textContent = ((ld.totalDistance || 0) / 1000).toFixed(2) + ' km';
    document.getElementById('info-points').textContent = ld.cleanGPS.length;
  }
}

/**
 * Initialize visualization with processed data.
 * @param {HTMLElement} container - Container element
 * @param {Object} processedData - Data from processCSV()
 */
export function initVisualization(container, processedData) {
  const viz = new TelemetryVisualization(container, processedData);
  viz.init();
  return viz;
}
