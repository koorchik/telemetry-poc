/**
 * Telemetry chart component wrapping Chart.js.
 * Generic component for speed, lateral, longitudinal, and delta charts.
 * @module browser/components/telemetry-chart
 */

import { LitElement, html } from 'lit';
import { interpolateAtPosition } from '../../math/interpolation.js';

export class TelemetryChart extends LitElement {
  // Use light DOM for Chart.js compatibility
  createRenderRoot() {
    return this;
  }

  static properties = {
    type: { type: String },         // 'speed' | 'lateral' | 'longitudinal' | 'delta'
    chartData: { type: Object },    // Chart data from lap
    position: { type: Number },     // Current position (0-1)
    mainData: { type: Object },     // For delta chart: main lap data
    comparisonData: { type: Object }, // For delta chart: comparison lap data
  };

  constructor() {
    super();
    this.type = 'speed';
    this.chartData = null;
    this.position = 0;
    this.mainData = null;
    this.comparisonData = null;
    this._chart = null;
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this._chart) {
      this._chart.destroy();
      this._chart = null;
    }
  }

  firstUpdated() {
    this._initChart();
  }

  updated(changedProperties) {
    if (changedProperties.has('chartData') || changedProperties.has('mainData') || changedProperties.has('comparisonData')) {
      this._updateChartData();
    }
    if (changedProperties.has('position')) {
      this._updateCursor();
    }
  }

  _getChartConfig() {
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

    const colors = {
      speed: '#3b82f6',
      lateral: '#f59e0b',
      longitudinal: '#10b981',
      delta: '#8b5cf6',
    };

    if (this.type === 'delta') {
      return {
        type: 'line',
        data: { labels: [], datasets: [{ data: [], borderColor: colors.delta, borderWidth: 1.5, fill: { target: 'origin', above: 'rgba(239, 68, 68, 0.3)', below: 'rgba(16, 185, 129, 0.3)' }, pointRadius: 0, tension: 0.1 }] },
        options: {
          ...commonOptions,
          plugins: {
            ...commonOptions.plugins,
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
      };
    }

    return {
      type: 'line',
      data: {
        labels: [],
        datasets: [{ data: [], borderColor: colors[this.type], borderWidth: 1.5, fill: false, pointRadius: 0, tension: 0.1 }]
      },
      options: commonOptions
    };
  }

  _initChart() {
    const canvas = this.querySelector('canvas');
    if (!canvas || typeof Chart === 'undefined') return;

    this._chart = new Chart(canvas, this._getChartConfig());
    this._updateChartData();
  }

  _updateChartData() {
    if (!this._chart) return;

    if (this.type === 'delta') {
      this._updateDeltaChartData();
      return;
    }

    if (!this.chartData) return;

    const distances = this.chartData.distances?.map(d => (d / 1000).toFixed(2)) || [];
    let data = [];

    switch (this.type) {
      case 'speed':
        data = this.chartData.speeds || [];
        break;
      case 'lateral':
        data = this.chartData.lateralAcc || [];
        break;
      case 'longitudinal':
        data = this.chartData.longitudinalAcc || [];
        break;
    }

    this._chart.data.labels = distances;
    this._chart.data.datasets[0].data = data;
    this._chart.update('none');
  }

  _updateDeltaChartData() {
    if (!this._chart || !this.mainData || !this.comparisonData) return;

    const deltas = [];
    const positions = [];

    for (let pos = 0; pos <= 1; pos += 0.01) {
      const mainTelem = interpolateAtPosition(this.mainData.fullGroundTruth, pos);
      const compTelem = interpolateAtPosition(this.comparisonData.fullGroundTruth, pos);

      if (mainTelem && compTelem) {
        deltas.push(compTelem.lapTime - mainTelem.lapTime);
        positions.push((pos * 100).toFixed(0) + '%');
      }
    }

    this._chart.data.labels = positions;
    this._chart.data.datasets[0].data = deltas;
    this._chart.update('none');
  }

  _updateCursor() {
    if (!this._chart || !this._chart.options.plugins.annotation) return;

    let idx;
    if (this.type === 'delta') {
      idx = Math.round(this.position * 100);
    } else if (this.chartData?.lapPositions) {
      const positions = this.chartData.lapPositions;
      idx = 0;
      for (let i = 0; i < positions.length; i++) {
        if (positions[i] >= this.position) {
          idx = i;
          break;
        }
        idx = i;
      }
    } else {
      idx = 0;
    }

    this._chart.options.plugins.annotation.annotations.cursor.xMin = idx;
    this._chart.options.plugins.annotation.annotations.cursor.xMax = idx;
    this._chart.update('none');
  }

  _getTitle() {
    switch (this.type) {
      case 'speed': return 'Speed';
      case 'lateral': return 'Lateral Acceleration (G)';
      case 'longitudinal': return 'Longitudinal Acceleration (G)';
      case 'delta': return 'Lap Delta (seconds)';
      default: return '';
    }
  }

  render() {
    return html`
      <div class="chart-container">
        <h3>${this._getTitle()}</h3>
        <div class="chart-wrapper">
          <canvas></canvas>
        </div>
      </div>
    `;
  }
}

customElements.define('telemetry-chart', TelemetryChart);
