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
    mode: { type: String },
  };

  constructor() {
    super();
    this.cleanMetrics = {};
    this.noisyMetrics = {};
    this.outliers = null;
    this.mode = 'clean';
  }

  // Algorithm display names
  _algorithmLabels = {
    linear: 'Linear',
    spline: 'Spline (Catmull-Rom)',
    ekfRaw: 'EKF Raw',
    ekfSmooth: 'EKF + Spline',
  };

  _findBest(entries) {
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
            <tr class="${key === bestKey ? 'best' : ''}">
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

        <h4 class="metrics-header">Clean GPS Results</h4>
        ${this._renderTable(cleanEntries, cleanBest)}

        <h4 class="metrics-header">Noisy GPS Results (1-3m noise)</h4>
        ${this._renderTable(noisyEntries, noisyBest)}
      </div>
    `;
  }
}

customElements.define('metrics-table', MetricsTable);
