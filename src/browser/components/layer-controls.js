/**
 * Layer controls component for toggling map layer visibility.
 * @module browser/components/layer-controls
 */

import { LitElement, html } from 'lit';
import { eventBus } from './event-bus.js';

export class LayerControls extends LitElement {
  // Use light DOM for global styles
  createRenderRoot() {
    return this;
  }

  static properties = {
    visibility: { type: Object },
    layers: { type: Object },
  };

  constructor() {
    super();
    this.visibility = {};
    this.layers = {
      groundTruth: { label: 'Ground Truth (25Hz)', color: '#22c55e' },
      gpsPoints: { label: 'GPS Points (1Hz)', color: '#ef4444' },
      linear: { label: 'Linear Interp.', color: '#f97316' },
      spline: { label: 'Spline', color: '#2563eb' },
      ekfRaw: { label: 'EKF Raw', color: '#ec4899' },
      ekfSmooth: { label: 'EKF + Spline', color: '#8b5cf6' },
      speedLabels: { label: 'Speed Labels', color: '#a855f7' },
    };
  }

  _handleChange(layer, checked) {
    eventBus.emit('layer-toggle', { layer, visible: checked });
  }

  render() {
    return html`
      <div class="map-overlay">
        <h4>Layers</h4>
        ${Object.entries(this.layers).map(([key, cfg]) => html`
          <label class="layer-checkbox">
            <input
              type="checkbox"
              ?checked="${this.visibility[key]}"
              @change="${(e) => this._handleChange(key, e.target.checked)}"
            >
            <span class="color-dot" style="background: ${cfg.color};"></span>
            <span>${cfg.label}</span>
          </label>
        `)}
      </div>
    `;
  }
}

customElements.define('layer-controls', LayerControls);
