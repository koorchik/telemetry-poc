/**
 * Shared CSS styles for telemetry visualization components.
 * Extracted from visualization.js for modularity.
 * @module browser/components/styles/shared-styles
 */

export const STYLES = `
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #1a1a2e; color: #eee; }

.app-container {
  display: grid;
  grid-template-rows: auto 1fr auto auto;
  grid-template-columns: 1fr 1fr;
  height: 100vh;
  gap: 0;
}

.header {
  grid-column: 1 / -1;
  background: linear-gradient(135deg, #16213e 0%, #1a1a2e 100%);
  padding: 12px 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid #2d3748;
}
.header h1 { font-size: 18px; font-weight: 600; color: #fff; }
.header-controls { display: flex; gap: 16px; align-items: center; }

.map-panel {
  grid-row: 2;
  grid-column: 1;
  position: relative;
  min-height: 400px;
}
#map { height: 100%; width: 100%; }

.map-overlay {
  position: absolute;
  top: 10px;
  left: 10px;
  z-index: 1000;
  background: rgba(26, 26, 46, 0.95);
  padding: 12px;
  border-radius: 8px;
  border: 1px solid #2d3748;
  max-width: 200px;
}
.map-overlay h4 { font-size: 11px; color: #718096; text-transform: uppercase; margin-bottom: 8px; }

.layer-checkbox {
  display: flex;
  align-items: center;
  padding: 4px 0;
  cursor: pointer;
  font-size: 12px;
}
.layer-checkbox input { margin-right: 8px; accent-color: #3b82f6; }
.layer-checkbox .color-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  margin-right: 6px;
}

.charts-panel {
  grid-row: 2;
  grid-column: 2;
  background: #16213e;
  overflow-y: auto;
  padding: 16px;
  border-left: 1px solid #2d3748;
}

.chart-container {
  background: rgba(26, 26, 46, 0.8);
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 12px;
  border: 1px solid #2d3748;
}
.chart-container h3 {
  font-size: 12px;
  color: #a0aec0;
  margin-bottom: 8px;
  text-transform: uppercase;
}
.chart-wrapper {
  height: 120px;
  position: relative;
}

.telemetry-display {
  background: rgba(26, 26, 46, 0.95);
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 12px;
  border: 1px solid #2d3748;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
}
.telemetry-item { text-align: center; }
.telemetry-item .value {
  font-size: 24px;
  font-weight: 700;
  color: #fff;
}
.telemetry-item .label {
  font-size: 10px;
  color: #718096;
  text-transform: uppercase;
}
.telemetry-item.speed .value { color: #3b82f6; }
.telemetry-item.lateral .value { color: #f59e0b; }
.telemetry-item.longitudinal .value { color: #10b981; }
.telemetry-item.time .value { color: #8b5cf6; }

.replay-controls {
  grid-column: 1 / -1;
  background: #16213e;
  padding: 16px 20px;
  display: flex;
  align-items: center;
  gap: 16px;
  border-top: 1px solid #2d3748;
}

.replay-buttons { display: flex; gap: 8px; }
.replay-btn {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: none;
  background: #2d3748;
  color: #fff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}
.replay-btn:hover { background: #3b82f6; }
.replay-btn.play-pause { width: 44px; height: 44px; background: #3b82f6; }
.replay-btn.play-pause:hover { background: #2563eb; }

.speed-selector { display: flex; gap: 4px; }
.speed-btn {
  padding: 6px 12px;
  border: 1px solid #2d3748;
  background: transparent;
  color: #a0aec0;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.2s;
}
.speed-btn:hover { border-color: #3b82f6; color: #fff; }
.speed-btn.active { background: #3b82f6; border-color: #3b82f6; color: #fff; }

.timeline-container {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 12px;
}
.timeline {
  flex: 1;
  height: 6px;
  background: #2d3748;
  border-radius: 3px;
  cursor: pointer;
  position: relative;
}
.timeline-progress {
  height: 100%;
  background: #3b82f6;
  border-radius: 3px;
  width: 0%;
  transition: width 0.1s;
}
.timeline-thumb {
  position: absolute;
  top: 50%;
  transform: translate(-50%, -50%);
  width: 14px;
  height: 14px;
  background: #fff;
  border-radius: 50%;
  box-shadow: 0 2px 4px rgba(0,0,0,0.3);
  left: 0%;
}
.time-display {
  font-size: 13px;
  color: #a0aec0;
  font-family: monospace;
  min-width: 100px;
}

.footer-controls {
  grid-column: 1 / -1;
  background: #1a1a2e;
  padding: 12px 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-top: 1px solid #2d3748;
}

.lap-selectors {
  display: flex;
  gap: 16px;
  align-items: center;
}
.lap-selector-group {
  display: flex;
  align-items: center;
  gap: 8px;
}
.lap-selector-group label {
  font-size: 12px;
  color: #718096;
}
.lap-select {
  padding: 8px 12px;
  background: #2d3748;
  border: 1px solid #4a5568;
  border-radius: 6px;
  color: #fff;
  font-size: 13px;
  cursor: pointer;
}
.lap-select:focus { outline: none; border-color: #3b82f6; }

.mode-toggle { display: flex; gap: 4px; }
.mode-btn {
  padding: 8px 16px;
  border: 1px solid #2d3748;
  background: transparent;
  color: #a0aec0;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.2s;
}
.mode-btn:hover { border-color: #3b82f6; color: #fff; }
.mode-btn.active { background: #3b82f6; border-color: #3b82f6; color: #fff; }

.lap-info {
  display: flex;
  gap: 24px;
  font-size: 12px;
  color: #718096;
}
.lap-info span { color: #fff; }

.speed-label { background: transparent !important; border: none !important; }
.speed-marker {
  font-size: 11px;
  font-weight: bold;
  text-align: center;
  border-radius: 4px;
  padding: 2px 6px;
  white-space: nowrap;
  box-shadow: 0 2px 4px rgba(0,0,0,0.4);
}
.speed-min { background: #fee2e2; color: #dc2626; border: 2px solid #dc2626; }
.speed-max { background: #dcfce7; color: #16a34a; border: 2px solid #16a34a; }

.car-marker {
  width: 24px;
  height: 24px;
  background: #3b82f6;
  border: 3px solid #fff;
  border-radius: 50%;
  box-shadow: 0 2px 8px rgba(0,0,0,0.4);
  transition: transform 0.05s linear;
}
.car-marker.comparison { background: #f59e0b; }

.delta-display {
  font-size: 16px;
  font-weight: 700;
  padding: 8px 16px;
  border-radius: 6px;
  min-width: 100px;
  text-align: center;
}
.delta-display.faster { background: rgba(16, 185, 129, 0.2); color: #10b981; }
.delta-display.slower { background: rgba(239, 68, 68, 0.2); color: #ef4444; }
.delta-display.neutral { background: rgba(107, 114, 128, 0.2); color: #9ca3af; }

.metrics-section {
  background: rgba(26, 26, 46, 0.8);
  border-radius: 8px;
  padding: 12px;
  border: 1px solid #2d3748;
}
.metrics-section h3 {
  font-size: 12px;
  color: #a0aec0;
  margin-bottom: 8px;
  text-transform: uppercase;
}
.metrics-table {
  width: 100%;
  font-size: 11px;
  border-collapse: collapse;
}
.metrics-table th, .metrics-table td {
  padding: 6px 8px;
  text-align: left;
  border-bottom: 1px solid #2d3748;
}
.metrics-table th:not(:first-child), .metrics-table td:not(:first-child) { text-align: right; }
.metrics-table th { font-weight: 600; color: #718096; }
.metrics-table td { color: #e2e8f0; }
.metrics-table .best { background: rgba(16, 185, 129, 0.2); }

.outlier-stats {
  font-size: 11px;
  color: #a0aec0;
  margin-bottom: 12px;
  padding: 8px;
  background: rgba(45, 55, 72, 0.5);
  border-radius: 4px;
}
.metrics-header {
  font-size: 11px;
  color: #718096;
  margin: 12px 0 6px;
  text-transform: uppercase;
  font-weight: 600;
}
.metrics-header:first-of-type { margin-top: 0; }
`;

/**
 * Inject styles into the document head if not already present.
 */
export function injectStyles() {
  if (!document.getElementById('telemetry-viz-styles')) {
    const styleEl = document.createElement('style');
    styleEl.id = 'telemetry-viz-styles';
    styleEl.textContent = STYLES;
    document.head.appendChild(styleEl);
  }
}
