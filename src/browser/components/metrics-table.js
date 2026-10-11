/**
 * Metrics table component displaying algorithm accuracy metrics.
 * @module browser/components/metrics-table
 */

import { LitElement, html } from 'lit';

export class MetricsTable extends LitElement {
  // Use light DOM for global styles
  createRenderRoot() {
    return this;
  }

  static properties = {
    cleanMetrics: { type: Object },
    noisyMetrics: { type: Object },
    outliers: { type: Object },
    delays: { type: Object },
    noise: { type: Object },
    mode: { type: String },
  };

  constructor() {
    super();
    this.cleanMetrics = {};
    this.noisyMetrics = {};
    this.outliers = null;
    this.delays = null;
    this.noise = null;
    this.mode = 'clean';
  }

  _renderDelays(label, d) {
    const cell = (name, key) => html`${name} ${Math.round(d[key] * 1000)} ms${d.estimated[key] ? '' : ' (preset)'}`;
    return html`
      <div>
        ${label}: ${cell('GPS speed/bearing', 'gpsVelocity')} |
        ${cell('Gyro', 'yaw_rate')} | ${cell('Accel', 'longitudinal_acc')}
      </div>
    `;
  }

  // Algorithm display names
  _algorithmLabels = {
    gpsFixes: 'GPS fixes (input)',
    linear: 'Linear',
    spline: 'Spline (Catmull-Rom)',
    hermite: 'Hermite (GPS velocity)',
    ekfRaw: 'EKF Raw',
    ekfSmooth: 'EKF + RTS smoother',
  };

  _findBest(entries) {
    // The input fixes are shown for reference, they are not an algorithm
    entries = entries.filter(([key]) => key !== 'gpsFixes');
    if (entries.length === 0) return null;
    return entries.sort((a, b) => a[1].rmse - b[1].rmse)[0][0];
  }

  _renderTable(entries, bestKey) {
    if (entries.length === 0) {
      return html`<p style="color:#718096;font-size:11px;">No metrics available</p>`;
    }

    return html`
      <table class="metrics-table">
        <tr>
          <th>Algorithm</th>
          <th>RMSE</th>
          <th>MAE</th>
          <th>Max</th>
        </tr>
        ${entries.map(([key, m]) => {
          const label = this._algorithmLabels[key] || key.charAt(0).toUpperCase() + key.slice(1);
          return html`
            <tr class="${key === bestKey ? 'best' : ''} ${key === 'gpsFixes' ? 'input' : ''}">
              <td>${label}</td>
              <td>${m.rmse.toFixed(3)}m</td>
              <td>${m.mae.toFixed(3)}m</td>
              <td>${m.maxError.toFixed(3)}m</td>
            </tr>
          `;
        })}
      </table>
    `;
  }

  render() {
    const cleanEntries = Object.entries(this.cleanMetrics || {});
    const noisyEntries = Object.entries(this.noisyMetrics || {});
    const cleanBest = this._findBest([...cleanEntries]);
    const noisyBest = this._findBest([...noisyEntries]);

    return html`
      <div class="metrics-section">
        <h3>Algorithm Accuracy Metrics</h3>

        ${this.outliers ? html`
          <div class="outlier-stats">
            <strong>Outlier Detection:</strong>
            Clean: ${this.outliers.clean}/${this.outliers.total}
            (${((this.outliers.clean / this.outliers.total) * 100).toFixed(1)}%) |
            Noisy: ${this.outliers.noisy}/${this.outliers.total}
            (${((this.outliers.noisy / this.outliers.total) * 100).toFixed(1)}%)
          </div>
        ` : ''}

        ${this.delays ? html`
          <div class="outlier-stats" title="How far each channel lags behind GPS position. Estimated for this file from the 1 Hz fixes and the inertial data.">
            <strong>Sensor delays vs GPS position:</strong>
            ${this._renderDelays('Clean', this.delays.clean)}
            ${this._renderDelays('Noisy', this.delays.noisy)}
          </div>
        ` : ''}

        <h4 class="metrics-header">Clean GPS Results</h4>
        ${this._renderTable(cleanEntries, cleanBest)}

        <h4 class="metrics-header">Noisy GPS Results${this.noise
          ? html` (${this.noise.minMeters}-${this.noise.maxMeters} m noise)` : ''}</h4>
        ${this._renderTable(noisyEntries, noisyBest)}
      </div>
    `;
  }
}

customElements.define('metrics-table', MetricsTable);
