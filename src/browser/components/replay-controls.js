/**
 * Replay controls component with play/pause, speed, and timeline.
 * @module browser/components/replay-controls
 */

import { LitElement, html } from 'lit';
import { eventBus } from './event-bus.js';

export class ReplayControls extends LitElement {
  // Use light DOM for global styles
  createRenderRoot() {
    return this;
  }

  static properties = {
    currentTime: { type: Number },
    duration: { type: Number },
    isPlaying: { type: Boolean },
    playbackSpeed: { type: Number },
  };

  constructor() {
    super();
    this.currentTime = 0;
    this.duration = 0;
    this.isPlaying = false;
    this.playbackSpeed = 1;
    this._isDragging = false;
    this._onMouseMove = this._onMouseMove.bind(this);
    this._onMouseUp = this._onMouseUp.bind(this);
  }

  connectedCallback() {
    super.connectedCallback();
    document.addEventListener('mousemove', this._onMouseMove);
    document.addEventListener('mouseup', this._onMouseUp);
    document.addEventListener('touchmove', this._onMouseMove, { passive: false });
    document.addEventListener('touchend', this._onMouseUp);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener('mousemove', this._onMouseMove);
    document.removeEventListener('mouseup', this._onMouseUp);
    document.removeEventListener('touchmove', this._onMouseMove);
    document.removeEventListener('touchend', this._onMouseUp);
  }

  _formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = (seconds % 60).toFixed(1);
    return mins + ':' + secs.padStart(4, '0');
  }

  _onPlayClick() {
    eventBus.emit('playback-toggle');
  }

  _onSpeedClick(speed) {
    eventBus.emit('playback-speed-change', { speed });
  }

  _onSeekStart() {
    eventBus.emit('seek', { time: 0 });
  }

  _onSeekEnd() {
    eventBus.emit('seek', { time: this.duration });
  }

  _onStepBack() {
    eventBus.emit('seek', { time: this.currentTime - 1 });
  }

  _onStepForward() {
    eventBus.emit('seek', { time: this.currentTime + 1 });
  }

  _onTimelineMouseDown(e) {
    e.preventDefault();
    this._isDragging = true;
    this._seekFromEvent(e);
  }

  _onMouseMove(e) {
    if (!this._isDragging) return;
    e.preventDefault();
    this._seekFromEvent(e);
  }

  _onMouseUp() {
    this._isDragging = false;
  }

  _seekFromEvent(e) {
    const timeline = this.querySelector('.timeline');
    if (!timeline) return;

    const rect = timeline.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    eventBus.emit('seek', { time: pct * this.duration });
  }

  get _progressPercent() {
    return this.duration > 0 ? (this.currentTime / this.duration) * 100 : 0;
  }

  render() {
    const pct = this._progressPercent;

    return html`
      <div class="replay-controls">
        <div class="replay-buttons">
          <button class="replay-btn" @click="${this._onSeekStart}" title="Start">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/>
            </svg>
          </button>
          <button class="replay-btn" @click="${this._onStepBack}" title="Step Back">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M11 18V6l-8.5 6 8.5 6zm.5-6l8.5 6V6l-8.5 6z"/>
            </svg>
          </button>
          <button class="replay-btn play-pause" @click="${this._onPlayClick}" title="Play/Pause">
            ${this.isPlaying
              ? html`<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="4" width="4" height="16"/>
                  <rect x="14" y="4" width="4" height="16"/>
                </svg>`
              : html`<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8 5v14l11-7z"/>
                </svg>`
            }
          </button>
          <button class="replay-btn" @click="${this._onStepForward}" title="Step Forward">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z"/>
            </svg>
          </button>
          <button class="replay-btn" @click="${this._onSeekEnd}" title="End">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/>
            </svg>
          </button>
        </div>

        <div class="speed-selector">
          ${[1, 2, 4, 8].map(speed => html`
            <button
              class="speed-btn ${this.playbackSpeed === speed ? 'active' : ''}"
              @click="${() => this._onSpeedClick(speed)}"
            >${speed}x</button>
          `)}
        </div>

        <div class="timeline-container">
          <div
            class="timeline"
            @mousedown="${this._onTimelineMouseDown}"
            @touchstart="${this._onTimelineMouseDown}"
          >
            <div class="timeline-progress" style="width: ${pct}%"></div>
            <div class="timeline-thumb" style="left: ${pct}%"></div>
          </div>
          <div class="time-display">
            <span>${this._formatTime(this.currentTime)}</span> /
            <span>${this._formatTime(this.duration)}</span>
          </div>
        </div>
      </div>
    `;
  }
}

customElements.define('replay-controls', ReplayControls);
