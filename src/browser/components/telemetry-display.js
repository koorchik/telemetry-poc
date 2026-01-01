/**
 * Live telemetry display component showing speed, G-forces, and distance.
 * @module browser/components/telemetry-display
 */

import { LitElement, html } from 'lit';

export class TelemetryDisplay extends LitElement {
  // Use light DOM for global styles
  createRenderRoot() {
    return this;
  }

  static properties = {
    telemetry: { type: Object },
  };

  constructor() {
    super();
    this.telemetry = null;
  }

  render() {
    const speed = this.telemetry?.speed || 0;
    const lateralAcc = this.telemetry?.lateralAcc || 0;
    const longitudinalAcc = this.telemetry?.longitudinalAcc || 0;
    const distance = this.telemetry?.distance || 0;

    return html`
      <div class="telemetry-display">
        <div class="telemetry-item speed">
          <div class="value">${Math.round(speed)}</div>
          <div class="label">km/h</div>
        </div>
        <div class="telemetry-item lateral">
          <div class="value">${lateralAcc.toFixed(2)}</div>
          <div class="label">Lat G</div>
        </div>
        <div class="telemetry-item longitudinal">
          <div class="value">${longitudinalAcc.toFixed(2)}</div>
          <div class="label">Long G</div>
        </div>
        <div class="telemetry-item time">
          <div class="value">${(distance / 1000).toFixed(2)}</div>
          <div class="label">km</div>
        </div>
      </div>
    `;
  }
}

customElements.define('telemetry-display', TelemetryDisplay);
