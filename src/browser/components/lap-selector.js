/**
 * Lap selector component with lap and comparison dropdowns.
 * @module browser/components/lap-selector
 */

import { LitElement, html } from 'lit';
import { eventBus } from './event-bus.js';
import CONFIG from '../../config.js';

export class LapSelector extends LitElement {
  // Use light DOM for global styles
  createRenderRoot() {
    return this;
  }

  static properties = {
    laps: { type: Array },
    currentLap: { type: Number },
    comparisonLap: { type: Number },
    currentMode: { type: String },
    noise: { type: Object },
    lapInfo: { type: Object },
  };

  constructor() {
    super();
    this.laps = [];
    this.currentLap = 1;
    this.comparisonLap = null;
    this.currentMode = 'clean';
    this.noise = null;
    this.lapInfo = {};
  }

  // Preset ranges, plus the current one when it is not a preset
  get _noiseLevels() {
    const levels = [...CONFIG.noise.levels];
    const isPreset = !this.noise || levels.some(l => this._isCurrentNoise(l));
    if (!isPreset) {
      levels.unshift({ label: 'Custom', minMeters: this.noise.minMeters, maxMeters: this.noise.maxMeters });
    }
    return levels;
  }

  _isCurrentNoise(level) {
    return level.minMeters === this.noise?.minMeters && level.maxMeters === this.noise?.maxMeters;
  }

  _onNoiseChange(e) {
    const level = this._noiseLevels[parseInt(e.target.value)];
    eventBus.emit('noise-change', {
      noise: { minMeters: level.minMeters, maxMeters: level.maxMeters },
    });
  }

  _onModeClick(mode) {
    if (mode !== this.currentMode) {
      eventBus.emit('mode-change', { mode });
    }
  }

  _formatTime(seconds) {
    if (!seconds) return '--';
    const mins = Math.floor(seconds / 60);
    const secs = (seconds % 60).toFixed(1);
    return mins + ':' + secs.padStart(4, '0');
  }

  _onLapChange(e) {
    eventBus.emit('lap-change', { lap: parseInt(e.target.value) });
  }

  _onComparisonChange(e) {
    const value = e.target.value;
    eventBus.emit('comparison-change', {
      comparisonLap: value ? parseInt(value) : null
    });
  }

  render() {
    return html`
      <div class="footer-controls">
        <div class="lap-selectors">
          <div class="lap-selector-group">
            <label>Lap:</label>
            <select class="lap-select" @change="${this._onLapChange}">
              ${this.laps.map(l => html`
                <option value="${l}" ?selected="${l === this.currentLap}">Lap ${l}</option>
              `)}
            </select>
          </div>
          <div class="lap-selector-group">
            <label>Compare:</label>
            <select class="lap-select" @change="${this._onComparisonChange}">
              <option value="">None</option>
              ${this.laps.map(l => html`
                <option value="${l}" ?selected="${l === this.comparisonLap}">Lap ${l}</option>
              `)}
            </select>
          </div>
          <div class="mode-toggle">
            <button
              class="mode-btn ${this.currentMode === 'clean' ? 'active' : ''}"
              @click="${() => this._onModeClick('clean')}"
            >Clean GPS</button>
            <button
              class="mode-btn ${this.currentMode === 'noisy' ? 'active' : ''}"
              @click="${() => this._onModeClick('noisy')}"
            >Noisy GPS</button>
          </div>
          <div class="lap-selector-group">
            <label title="Position error of the simulated Noisy GPS fixes (1 sigma per axis)">Noise:</label>
            <select class="lap-select" @change="${this._onNoiseChange}">
              ${this._noiseLevels.map((level, i) => html`
                <option value="${i}" ?selected="${this._isCurrentNoise(level)}">
                  ${level.label} (${level.minMeters}-${level.maxMeters} m)
                </option>
              `)}
            </select>
          </div>
        </div>

        <div class="lap-info">
          <div>Duration: <span>${this._formatTime(this.lapInfo?.duration)}</span></div>
          <div>Distance: <span>${((this.lapInfo?.distance || 0) / 1000).toFixed(2)} km</span></div>
          <div>Points: <span>${this.lapInfo?.points || '--'}</span></div>
        </div>
      </div>
    `;
  }
}

customElements.define('lap-selector', LapSelector);
