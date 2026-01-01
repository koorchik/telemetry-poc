/**
 * Delta display component showing lap time difference.
 * @module browser/components/delta-display
 */

import { LitElement, html } from 'lit';

export class DeltaDisplay extends LitElement {
  // Use light DOM for global styles
  createRenderRoot() {
    return this;
  }

  static properties = {
    delta: { type: Number },
  };

  constructor() {
    super();
    this.delta = null;
  }

  _getDisplayClass() {
    if (this.delta === null) return 'neutral';
    if (this.delta < -0.01) return 'faster';
    if (this.delta > 0.01) return 'slower';
    return 'neutral';
  }

  _getDisplayText() {
    if (this.delta === null) return '--';
    const absD = Math.abs(this.delta).toFixed(2);
    if (this.delta < -0.01) return '-' + absD + 's';
    if (this.delta > 0.01) return '+' + absD + 's';
    return '0.00s';
  }

  render() {
    return html`
      <div class="delta-display ${this._getDisplayClass()}">
        ${this._getDisplayText()}
      </div>
    `;
  }
}

customElements.define('delta-display', DeltaDisplay);
