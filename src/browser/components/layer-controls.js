/**
 * Layer controls component for toggling map layer visibility.
 * @module browser/components/layer-controls
 */

import { LitElement, html } from 'lit';
import { eventBus } from './event-bus.js';
import { getLayerInfo } from './layer-info.js';

export class LayerControls extends LitElement {
  // Use light DOM for global styles
  createRenderRoot() {
    return this;
  }

  static properties = {
    visibility: { type: Object },
    layers: { type: Object },
    delays: { type: Object },
    noise: { type: Object },
    _openInfo: { state: true },
    _expanded: { state: true },
  };

  constructor() {
    super();
    this.visibility = {};
    this.delays = null;
    this.noise = null;
    this._openInfo = null;
    // Only the phone layout collapses the list; the stylesheet ignores this on wide screens
    this._expanded = false;
    this._onKeyDown = (e) => {
      if (e.code === 'Escape') this._openInfo = null;
    };
    this.layers = {
      groundTruth: { label: 'Ground Truth (25Hz)', color: '#22c55e' },
      gpsPoints: { label: 'GPS Points (1Hz)', color: '#ef4444' },
      linear: { label: 'Linear Interp.', color: '#f97316' },
      spline: { label: 'Spline', color: '#2563eb' },
      hermite: { label: 'Hermite (GPS velocity)', color: '#14b8a6' },
      ekfRaw: { label: 'EKF Raw', color: '#ec4899' },
      ekfSmooth: { label: 'EKF + RTS', color: '#8b5cf6' },
      speedLabels: { label: 'Speed Labels', color: '#a855f7' },
    };
  }

  connectedCallback() {
    super.connectedCallback();
    document.addEventListener('keydown', this._onKeyDown);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener('keydown', this._onKeyDown);
  }

  _handleChange(layer, checked) {
    eventBus.emit('layer-toggle', { layer, visible: checked });
  }

  _toggleInfo(layer) {
    this._openInfo = this._openInfo === layer ? null : layer;
  }

  _renderInfo() {
    const info = this._openInfo && this.delays && this.noise
      && getLayerInfo(this._openInfo, { delays: this.delays, noise: this.noise });
    if (!info) return '';

    return html`
      <div class="layer-info-panel" role="dialog" aria-label="${info.title} methodology">
        <div class="layer-info-header">
          <span class="color-dot" style="background: ${this.layers[this._openInfo].color};"></span>
          <h4>${info.title}</h4>
          <button class="layer-info-close" aria-label="Close" @click="${() => this._openInfo = null}">×</button>
        </div>
        <div class="layer-info-body">${info.body}</div>
      </div>
    `;
  }

  render() {
    return html`
      <div class="map-overlay ${this._expanded ? '' : 'collapsed'}">
        <h4 class="layers-title">Layers</h4>
        <button
          class="layers-toggle"
          aria-expanded="${this._expanded}"
          @click="${() => this._expanded = !this._expanded}"
          @keydown="${(e) => { if (e.code === 'Space') e.stopPropagation(); }}"
        ><span>Layers</span><span aria-hidden="true">${this._expanded ? '▴' : '▾'}</span></button>
        <div class="layer-list">
          ${Object.entries(this.layers).map(([key, cfg]) => html`
            <div class="layer-row">
              <label class="layer-checkbox">
                <input
                  type="checkbox"
                  ?checked="${this.visibility[key]}"
                  @change="${(e) => this._handleChange(key, e.target.checked)}"
                >
                <span class="color-dot" style="background: ${cfg.color};"></span>
                <span>${cfg.label}</span>
              </label>
              <button
                class="layer-info-btn ${this._openInfo === key ? 'active' : ''}"
                title="How is this calculated?"
                aria-label="How is ${cfg.label} calculated?"
                aria-expanded="${this._openInfo === key}"
                @click="${() => this._toggleInfo(key)}"
                @keydown="${(e) => { if (e.code === 'Space') e.stopPropagation(); }}"
              >i</button>
            </div>
          `)}
        </div>
        ${this._renderInfo()}
      </div>
    `;
  }
}

customElements.define('layer-controls', LayerControls);
