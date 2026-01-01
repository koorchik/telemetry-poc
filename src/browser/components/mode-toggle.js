/**
 * Mode toggle component for switching between Clean and Noisy GPS.
 * @module browser/components/mode-toggle
 */

import { LitElement, html } from 'lit';
import { eventBus } from './event-bus.js';

export class ModeToggle extends LitElement {
  // Use light DOM for global styles
  createRenderRoot() {
    return this;
  }

  static properties = {
    currentMode: { type: String },
  };

  constructor() {
    super();
    this.currentMode = 'clean';
  }

  _handleClick(mode) {
    if (mode !== this.currentMode) {
      eventBus.emit('mode-change', { mode });
    }
  }

  render() {
    return html`
      <div class="mode-toggle">
        <button
          class="mode-btn ${this.currentMode === 'clean' ? 'active' : ''}"
          @click="${() => this._handleClick('clean')}"
        >Clean GPS</button>
        <button
          class="mode-btn ${this.currentMode === 'noisy' ? 'active' : ''}"
          @click="${() => this._handleClick('noisy')}"
        >Noisy GPS</button>
      </div>
    `;
  }
}

customElements.define('mode-toggle', ModeToggle);
