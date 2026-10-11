# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Browser-only proof-of-concept for GPS track reconstruction. It takes a 25Hz RaceChrono CSV export (GPS + accelerometer + gyroscope), treats it as ground truth, downsamples the GPS to 1Hz, and compares how well different algorithms rebuild the 25Hz trajectory:

- Linear interpolation
- Catmull-Rom spline interpolation
- Cubic Hermite interpolation using GPS speed + bearing
- INS/GPS sensor fusion with a 6-state Extended Kalman Filter (IMU + GPS), forward-only ("EKF Raw")
- The same filter followed by an RTS smoother ("EKF + RTS")

Each lap is processed twice — once with the clean 1Hz GPS and once with simulated noise added — and scored with RMSE / MAE / max error against ground truth.

## Commands

```bash
python3 -m http.server 8080   # then open http://localhost:8080
npm run deploy                # publish index.html + src/** to GitHub Pages (needs npm install for gh-pages)
node scripts/benchmark.js     # run the pipeline in Node on the sample CSV, print RMSE per lap (needs npm install)
```

There is no build step, bundler, test suite, or linter. `scripts/benchmark.js` is the way to check a change to any algorithm: it uses a fixed noise seed, so numbers are comparable between runs. The app must be served over HTTP (ES modules and the sample-data `fetch` do not work from `file://`).

`npm install` is only needed for `npm run deploy` and the benchmark. At runtime the browser never touches `node_modules`: library versions come from the import map and `<script>` tags in `index.html` (esm.sh, unpkg, jsDelivr), not from `package.json`, and the two are not kept in sync.

## Architecture

Entry point is `index.html` → `src/browser/app.js`. The code splits into two halves that meet at a single data object.

### Computation pipeline (everything in `src/` outside `browser/components/`)

`processCSV()` in `src/browser/process.js` drives the whole thing, per lap:

```
parseCSVString()                  io/csv-parser.js
→ filter by lap, rebase timestamps to 0
→ resampleUniform()               gps/resample.js: uniform 25Hz grid, IMU channels time-aligned
→ enhanceTelemetryPoints()        adds distance, lapPosition (0..1), lapTime
→ downsampleGPS()                 25Hz → 1Hz, keeps originalIndex
   ├─ filterGPSOutliers()                    → cleanGPS
   └─ addGPSNoise() → filterGPSOutliers()    → noisyGPS
→ runAllAlgorithms(lapData, cleanGPS)   runner.js
→ runAllAlgorithms(lapData, noisyGPS)
```

Things that are not obvious from any single file:

- **Rows are not 25Hz.** A RaceChrono export has one row per sample of any device (GPS 25Hz, accelerometer, gyroscope, 20Hz calculated channels): about 45 irregular rows per second. `resampleUniform()` puts each lap on a uniform grid first; everything after it (`downsampleGPS`, chart downsampling, `speedExtrema.windowSize`) relies on "one point = 1/25 s". Never process raw parsed rows by index.
- **Channels are not aligned in time.** Relative to GPS position, GPS speed/bearing lag ~90 ms, the acceleration channels ~100 ms, the gyroscope ~20 ms (measured on the sample recording, set in `CONFIG.sampling`). IMU channels are shifted during resampling. GPS velocity cannot be shifted, because a 1Hz receiver has no later sample, so the EKF rolls its state back by `gpsVelocityDelay` when comparing, and Hermite advances the tangents using neighbouring fixes.
- **Timestamp contract.** `calculateAccuracyMetrics()` matches estimated points to ground truth by `timestamp.toFixed(3)`. An algorithm's output must be `{timestamp, lat, lon}` points carrying the exact ground-truth timestamps, or its points are silently dropped from the metrics.
- **`CONFIG` is a mutable singleton.** `src/config.js` is imported directly by the filters, GPS and geometry modules. The `config` argument and `DEFAULT_CONFIG` in `process.js` only affect `input.skipLines`; its `noise` values are ignored (noise comes from `CONFIG.noise`). The "1-3m noise" heading in `metrics-table.js` is hard-coded.
- **Noise.** `addGPSNoise()` perturbs position, speed and bearing, and widens each fix's `accuracy` to match, because the EKF takes its position noise from `accuracy` (`CONFIG.ekf.gps_pos_noise` is only a fallback). Noise is random per run unless `CONFIG.noise.seed` is set; `processCSV()` reseeds from it.
- **EKF** (`filters/ekf-ins-gps.js`): state is `[px, py, v, ψ, b_g, b_a]` in a local East/North frame in meters, origin at the first GPS fix. ψ is the course over ground in radians from North, clockwise, kept unwrapped (only innovations are normalized). The gyroscope drives ψ (RaceChrono's yaw rate is sign-inverted) and the longitudinal accelerometer drives v; the lateral accelerometer is not used. `runSensorFusion()` returns `{ filtered, smoothed }`: the forward pass stores every step so the RTS backward pass can run over it.
- **`processCSV()` reprocesses the first lap** into `selectedLapData`, which the UI does not read.

### UI (`src/browser/components/`)

Lit web components, with `<telemetry-app>` as the root. `app.js` creates it and assigns the `processCSV()` result to its `processedData` property.

- **One state owner.** All UI state (current lap, comparison lap, clean/noisy mode, playback time/position, layer visibility) lives in `telemetry-app`'s `_state`. Data flows down as properties; children never mutate state — they emit on the shared `eventBus` (`event-bus.js`) and `telemetry-app` handles it. Events: `lap-change`, `comparison-change`, `mode-change`, `playback-toggle`, `playback-speed-change`, `seek`, `seek-position`, `layer-toggle`.
- **Light DOM everywhere.** Every component overrides `createRenderRoot()` to return `this`. Styling is one global stylesheet string in `styles/shared-styles.js`, injected into `<head>` once; Leaflet also depends on this. Do not add shadow-DOM `static styles`.
- **Globals.** Leaflet (`L`) and Chart.js (`Chart`, with the annotation plugin) are loaded by classic `<script>` tags and used as globals. Lit, chroma-js, papaparse, ml-matrix and geodesy are ES imports resolved by the import map.
- **Lap position is the playback cursor.** `currentPosition` (0..1 fraction of lap distance) is kept alongside `currentTime`, converted with `positionToTime` / `timeToPosition` from `math/interpolation.js`. Lap-to-lap comparison and the delta chart work by looking up both laps at the same position.
- **Clean/noisy key convention.** `telemetry-app._prepareData()` reshapes each lap into Leaflet-ready arrays under keys like `cleanLinear` / `noisyEkfSmooth`. `track-map.js` picks the layer data by prefixing the current mode (`'clean'` or `'noisy'`) onto `Linear`, `Spline`, `Hermite`, `EkfRaw`, `EkfSmooth`. Adding an algorithm therefore touches: `runAllAlgorithms()`, the `clean*`/`noisy*` entries in `processLap()` and `_prepareData()`, a layer in `track-map.js`, the layer list in `layer-controls.js`, and the `layerVisibility` state in `telemetry-app.js`.

## Stale and unused code

- `README.md` still documents a Node.js CLI (`npm start`, `src/index.js`, `map.html`) and a `visualization.js` that no longer exist. The app is browser-only; `scripts/benchmark.js` is the only Node entry point.
- `src/io/index.js` re-exports `readRaceChronoCSV` and `./html-generator.js`, neither of which exists, so importing that barrel fails. Import from `io/csv-parser.js` directly.
- `filters/kalman-1d.js` (GPS-only Kalman + RTS smoother) with `CONFIG.kalman`, `smoothTrajectoryWithSpline`, `filterGPSOutliersSimple` (only reachable via `outlierDetection.method: 'simple'`) and the `<mode-toggle>` component are not part of the running pipeline/UI. `printMetricsTable` is used only by the benchmark.
- `race-chrono-session-v3.csv` in the repo root is byte-identical to `src/data/sample-data.csv`. Only the `src/data/` copy is fetched by "Load Example Data" and deployed.

## Configuration

All tunables are in `src/config.js`: `sampling` (25Hz grid / 1Hz GPS, per-channel delays), `noise` (simulated GPS noise: 1–3m position, speed, bearing, optional seed), `ekf` (process and measurement noise sigmas), `outlierDetection` (physics-based thresholds: max acceleration, GPS-vs-IMU yaw rate, speed and lateral-acceleration consistency, plus a 3-point temporal check), and `speedExtrema` (min/max speed labels on the map; `minDeltaKmh` is set low for karting).

## CSV Format

RaceChrono export; the first 12 lines are metadata (`CONFIG.input.skipLines`). Rows need at least 29 columns. Indices used:

- 0: timestamp (s), 2: lap_number, 5: accuracy (m), 7: bearing (deg)
- 11: latitude, 12: longitude, 14: speed (m/s)
- 17: lateral_acc (G), 19: longitudinal_acc (G), 28: yaw_rate (deg/s)

Rows with lap number 0 are ignored.
