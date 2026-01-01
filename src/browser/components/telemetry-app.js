/**
 * Root telemetry application component.
 * Manages state and coordinates all child components.
 * @module browser/components/telemetry-app
 */

import { LitElement, html } from 'lit';
import { eventBus } from './event-bus.js';
import { injectStyles } from './styles/shared-styles.js';
import { findSpeedExtrema } from '../../analysis/speed-extrema.js';
import CONFIG from '../../config.js';
import {
  interpolateAtPosition,
  positionToTime,
  timeToPosition,
} from '../../math/interpolation.js';

// Import all child components
import './delta-display.js';
import './telemetry-display.js';
import './layer-controls.js';
import './replay-controls.js';
import './lap-selector.js';
import './metrics-table.js';
import './telemetry-chart.js';
import './track-map.js';

export class TelemetryApp extends LitElement {
  // Use light DOM for global styles and library compatibility
  createRenderRoot() {
    return this;
  }

  static properties = {
    processedData: { type: Object },
  };

  constructor() {
    super();
    this.processedData = null;
    this._state = {
      currentLap: null,
      comparisonLap: null,
      currentMode: 'clean',
      currentTime: 0,
      currentPosition: 0,
      isPlaying: false,
      playbackSpeed: 1,
      layerVisibility: {
        groundTruth: true,
        gpsPoints: false,
        linear: false,
        spline: false,
        ekfRaw: false,
        ekfSmooth: false,
        speedLabels: true,
      },
    };
    this._data = null;
    this._unsubscribers = [];
    this._animationId = null;
    this._lastFrameTime = null;
  }

  connectedCallback() {
    super.connectedCallback();
    injectStyles();
    this._setupEventListeners();
    this._setupKeyboardShortcuts();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._unsubscribers.forEach(unsub => unsub());
    if (this._animationId) {
      cancelAnimationFrame(this._animationId);
    }
    document.removeEventListener('keydown', this._keyHandler);
  }

  _setupEventListeners() {
    this._unsubscribers.push(
      eventBus.on('lap-change', ({ lap }) => this._changeLap(lap)),
      eventBus.on('comparison-change', ({ comparisonLap }) => this._setComparison(comparisonLap)),
      eventBus.on('mode-change', ({ mode }) => this._setMode(mode)),
      eventBus.on('playback-toggle', () => this._togglePlay()),
      eventBus.on('playback-speed-change', ({ speed }) => this._setSpeed(speed)),
      eventBus.on('seek', ({ time }) => this._seekToTime(time)),
      eventBus.on('seek-position', ({ position }) => this._setPosition(position)),
      eventBus.on('layer-toggle', ({ layer, visible }) => this._toggleLayer(layer, visible)),
    );
  }

  _setupKeyboardShortcuts() {
    this._keyHandler = (e) => {
      if (e.code === 'Space') {
        e.preventDefault();
        this._togglePlay();
      }
      if (e.code === 'ArrowLeft') this._seekToTime(this._state.currentTime - 1);
      if (e.code === 'ArrowRight') this._seekToTime(this._state.currentTime + 1);
    };
    document.addEventListener('keydown', this._keyHandler);
  }

  updated(changedProperties) {
    if (changedProperties.has('processedData') && this.processedData) {
      this._prepareData();
      this._state = { ...this._state, currentLap: this._data.selectedLap };
      this.requestUpdate();
    }
  }

  // --- Data Preparation ---
  _prepareData() {
    const { laps, allLapsData, selectedLap } = this.processedData;

    const downsample = (arr, ratio = 5) => (arr || []).filter((_, i) => i % ratio === 0);
    const toCoords = arr => (arr || []).map(p => [p.lat, p.lon]);

    const lapsMapData = {};
    for (const lap of laps) {
      const ld = allLapsData[lap];
      if (!ld) continue;

      const lapSpeedExtrema = findSpeedExtrema(
        ld.groundTruth,
        CONFIG.speedExtrema.windowSize,
        CONFIG.speedExtrema.minSpeedThreshold,
        CONFIG.speedExtrema.minDeltaKmh
      );

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

    this._data = {
      laps,
      selectedLap,
      lapsData: lapsMapData,
      bounds,
    };
  }

  // --- State Getters ---
  get _currentLapData() {
    return this._data?.lapsData?.[this._state.currentLap] || this._data?.lapsData?.[this._data?.laps?.[0]];
  }

  get _comparisonLapData() {
    if (!this._state.comparisonLap) return null;
    return this._data?.lapsData?.[this._state.comparisonLap];
  }

  // --- State Mutations ---
  _updateState(partial) {
    this._state = { ...this._state, ...partial };
    this.requestUpdate();
  }

  _changeLap(lap) {
    this._updateState({
      currentLap: parseInt(lap),
      currentPosition: 0,
      currentTime: 0,
    });
  }

  _setComparison(comparisonLap) {
    this._updateState({ comparisonLap: comparisonLap ? parseInt(comparisonLap) : null });
  }

  _setMode(mode) {
    this._updateState({ currentMode: mode });
  }

  _setSpeed(speed) {
    this._updateState({ playbackSpeed: speed });
  }

  _toggleLayer(layer, visible) {
    this._updateState({
      layerVisibility: { ...this._state.layerVisibility, [layer]: visible },
    });
  }

  _setPosition(position) {
    const ld = this._currentLapData;
    if (!ld) return;

    const pos = Math.max(0, Math.min(1, position));
    const time = positionToTime(ld.fullGroundTruth, pos);
    this._updateState({ currentPosition: pos, currentTime: time });
  }

  _seekToTime(time) {
    const ld = this._currentLapData;
    if (!ld) return;

    time = Math.max(0, Math.min(time, ld.duration));
    const pos = timeToPosition(ld.fullGroundTruth, time);
    this._updateState({ currentPosition: pos, currentTime: time });
  }

  _togglePlay() {
    const isPlaying = !this._state.isPlaying;
    this._updateState({ isPlaying });

    if (isPlaying) {
      this._lastFrameTime = performance.now();
      this._animate();
    } else if (this._animationId) {
      cancelAnimationFrame(this._animationId);
      this._animationId = null;
    }
  }

  _animate() {
    if (!this._state.isPlaying) return;

    const now = performance.now();
    const dt = (now - this._lastFrameTime) / 1000;
    this._lastFrameTime = now;

    const ld = this._currentLapData;
    if (!ld) return;

    let newTime = this._state.currentTime + dt * this._state.playbackSpeed;
    if (newTime >= ld.duration) {
      newTime = 0;
    }

    const pos = timeToPosition(ld.fullGroundTruth, newTime);
    this._updateState({ currentPosition: pos, currentTime: newTime });

    this._animationId = requestAnimationFrame(() => this._animate());
  }

  // --- Computed Values ---
  _getCurrentTelemetry() {
    const ld = this._currentLapData;
    if (!ld) return null;
    return interpolateAtPosition(ld.fullGroundTruth, this._state.currentPosition);
  }

  _getTimeDelta() {
    if (!this._comparisonLapData) return null;
    const compTime = positionToTime(
      this._comparisonLapData.fullGroundTruth,
      this._state.currentPosition
    );
    return compTime - this._state.currentTime;
  }

  render() {
    if (!this._data) {
      return html`<div style="display: flex; justify-content: center; align-items: center; height: 100vh; color: #718096;">Loading...</div>`;
    }

    const telem = this._getCurrentTelemetry();
    const delta = this._getTimeDelta();
    const ld = this._currentLapData;

    return html`
      <div class="app-container">
        <div class="header">
          <h1>GPS Telemetry Analysis</h1>
          <div class="header-controls">
            <delta-display .delta="${delta}"></delta-display>
          </div>
        </div>

        <div class="map-panel">
          <track-map
            .lapData="${ld}"
            .comparisonData="${this._comparisonLapData}"
            .position="${this._state.currentPosition}"
            .currentTime="${this._state.currentTime}"
            .mode="${this._state.currentMode}"
            .layerVisibility="${this._state.layerVisibility}"
            .bounds="${this._data.bounds}"
          ></track-map>
          <layer-controls .visibility="${this._state.layerVisibility}"></layer-controls>
        </div>

        <div class="charts-panel">
          <telemetry-display .telemetry="${telem}"></telemetry-display>

          <telemetry-chart
            type="speed"
            .chartData="${ld?.chartData}"
            .position="${this._state.currentPosition}"
          ></telemetry-chart>

          <telemetry-chart
            type="lateral"
            .chartData="${ld?.chartData}"
            .position="${this._state.currentPosition}"
          ></telemetry-chart>

          <telemetry-chart
            type="longitudinal"
            .chartData="${ld?.chartData}"
            .position="${this._state.currentPosition}"
          ></telemetry-chart>

          ${this._state.comparisonLap ? html`
            <telemetry-chart
              type="delta"
              .mainData="${ld}"
              .comparisonData="${this._comparisonLapData}"
              .position="${this._state.currentPosition}"
            ></telemetry-chart>
          ` : ''}

          <metrics-table
            .cleanMetrics="${ld?.cleanMetrics}"
            .noisyMetrics="${ld?.noisyMetrics}"
            .outliers="${ld?.outliers}"
            .mode="${this._state.currentMode}"
          ></metrics-table>
        </div>

        <replay-controls
          .currentTime="${this._state.currentTime}"
          .duration="${ld?.duration || 0}"
          .isPlaying="${this._state.isPlaying}"
          .playbackSpeed="${this._state.playbackSpeed}"
        ></replay-controls>

        <lap-selector
          .laps="${this._data.laps}"
          .currentLap="${this._state.currentLap}"
          .comparisonLap="${this._state.comparisonLap}"
          .currentMode="${this._state.currentMode}"
          .lapInfo="${{ duration: ld?.duration, distance: ld?.totalDistance, points: ld?.cleanGPS?.length }}"
        ></lap-selector>
      </div>
    `;
  }
}

customElements.define('telemetry-app', TelemetryApp);
