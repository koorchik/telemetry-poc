# GPS Track Smoothing PoC

A Proof of Concept for GPS trajectory smoothing and sensor fusion, comparing multiple interpolation algorithms.

**[Live Demo](https://koorchik.github.io/telemetry-poc/)** - Try it in your browser with sample data or upload your own RaceChrono CSV.

## Overview

This project demonstrates how to improve GPS track accuracy by:
1. Interpolating between low-frequency GPS points (1 Hz)
2. Applying sensor fusion with IMU data (accelerometer, gyroscope)
3. Using various smoothing algorithms

The ground truth comes from RaceChrono telemetry data recorded at 25 Hz on a race track.

## Algorithms

### 1. Linear Interpolation
Simple linear interpolation between consecutive GPS points. Fast and effective for noisy data.

**Best for:** Noisy GPS (3-15m error)

### 2. Catmull-Rom Spline
Smooth curve interpolation using four control points. Creates natural-looking trajectories.

**Best for:** Position-only GPS with little noise

### 3. Cubic Hermite Spline
Each segment matches both the positions and the GPS velocities (speed + bearing) at its two ends, so the curve leaves and enters every fix in the direction the car was actually travelling.

**Best for:** Clean GPS that also reports speed and bearing

### 4. INS/GPS Sensor Fusion (EKF + RTS smoother)
6-state Extended Kalman Filter with a vehicle motion model (the car moves along its course):
- State vector: `[px, py, v, ψ, b_g, b_a]`
- Gyroscope steers the course, longitudinal accelerometer changes the speed
- GPS position, speed and course are all used as measurements
- Estimates gyroscope and accelerometer bias

Two outputs are compared:
- **EKF Raw** - forward filter, uses only past GPS fixes (real-time capable)
- **EKF + RTS** - Rauch-Tung-Striebel backward pass, also uses later fixes (post-processing)

**Best for:** Noisy GPS

### 5. Physics-Based Outlier Detection

Multi-criteria outlier detection using vehicle physics constraints. Cars/karts cannot instantly change direction or speed, so we validate GPS points against:

1. **Acceleration Consistency** - Check if implied acceleration is physically possible (~2G max)
2. **Heading Rate Consistency** - Compare GPS bearing change with IMU gyroscope
3. **Speed Consistency** - Compare GPS-reported speed with position-derived speed
4. **Lateral Acceleration** - Validate turn rate matches centripetal force (a = v × ω)

Each check produces a score, and points exceeding the weighted threshold are rejected. Additionally, a 3-point temporal window detects single-point outliers that deviate significantly from the trajectory.

**Best for:** Filtering GPS glitches while preserving valid noisy points

## Results

Sample recording (car, 5 laps), GPS downsampled to 1 Hz, mean RMSE over laps. Reproduce with `node scripts/benchmark.js`.

| GPS noise (1σ per axis) | Fixes themselves | Linear | Catmull-Rom | Hermite | EKF Raw | EKF + RTS |
|---|---|---|---|---|---|---|
| Clean | 0 | 0.62m | 0.26m | 0.06m | 0.20m | 0.08m |
| Light, 1-3 m | 2.95m | 2.45m | 2.67m | 2.54m | 1.43m | 0.83m |
| Medium, 3-8 m | 8.06m | 6.56m | 7.26m | 6.93m | 3.25m | 2.19m |
| Heavy, 5-15 m | 14.49m | 11.96m | 13.26m | 12.64m | 4.21m | 2.97m |

The noise level is selected next to the Clean / Noisy switch (or `--noise=3-8` for the benchmark). Every fix gets its own error level from the range and reports it as its accuracy.

### Key Findings

1. **GPS velocity matters for clean GPS** - Hermite is 4x more accurate than Catmull-Rom from the same fixes
2. **Interpolation cannot remove noise** - Every interpolator passes through the noisy fixes, so its error equals the GPS error
3. **Sensor fusion wins for noisy GPS** - The smoother cuts the error of the fixes by 70-80%; the forward filter by 50-70%
4. **Timing matters more than tuning** - Rows are not 25 Hz (see below) and the channels are not aligned in time; fixing both changed the EKF error far more than any noise parameter

The simulated noise is white (independent per fix), which is the easiest case for a filter. Real GPS error drifts slowly, and no IMU can see a constant position offset, so expect smaller gains on real noisy receivers.

### Data timing

A RaceChrono export has one row per sample of *any* device, about 45 rows/s for this recording, irregularly spaced. Each lap is resampled onto a uniform 25 Hz grid before anything else.

Channels also lag behind GPS position by different amounts (here: GPS speed/bearing ~90 ms, acceleration ~110 ms, gyroscope ~0-20 ms). These delays depend on the logging devices, so they are estimated for every file, using only the 1 Hz fixes and the inertial data: over each second between two fixes, the integrated gyroscope must match the change of GPS bearing, the integrated acceleration the change of GPS speed, and the integrated velocity the distance between the fixes. The estimated values are shown above the metrics table. Without this alignment the smoother's error is about 70% higher on clean GPS and 25% higher on light-noise GPS.

## Usage

### Browser App (Recommended)

No installation needed. Just start a local server and open in browser:

```bash
python3 -m http.server 8080
# Open http://localhost:8080
```

**Features:**
- Drag & drop your RaceChrono CSV file or click to browse
- "Load Example Data" button with embedded sample track
- All processing runs in browser (EKF, Kalman, Spline, etc.)
- Interactive visualization with replay, charts, lap comparison

### Node.js CLI

For batch processing or generating static HTML:

```bash
npm install
npm start              # Process default CSV, generate map.html
node src/index.js 3    # Process specific lap
```

### Run Benchmark

```bash
npm install
node scripts/benchmark.js              # sample data
node scripts/benchmark.js my-session.csv
node scripts/benchmark.js --noise=3-8  # GPS noise range in metres
```

Prints RMSE per lap and a metrics table for clean and noisy GPS, with a fixed noise seed.

### View Results

The visualization shows:
- Ground truth trajectory (speed-colored gradient)
- GPS points (red markers at 1Hz)
- Algorithm outputs (toggle in control panel)
- Clean/Noisy GPS mode comparison
- Replay animation with telemetry charts
- Lap-to-lap delta comparison
- Accuracy metrics table (RMSE, MAE)

## File Structure

```
telemetry-poc/
├── index.html              # Browser app entry point
├── src/
│   ├── browser/            # Browser-specific code
│   │   ├── app.js          # File upload, main app
│   │   ├── process.js      # Processing pipeline
│   │   └── visualization.js # Map/chart rendering
│   ├── data/
│   │   └── sample-data.js  # Embedded example CSV
│   ├── io/                 # Input/output
│   ├── gps/                # GPS processing
│   ├── filters/            # EKF, Kalman filters
│   ├── interpolation/      # Linear, Spline
│   ├── analysis/           # Metrics, speed extrema
│   ├── math/               # Matrix ops, geometry
│   ├── config.js           # Configuration
│   └── index.js            # Node.js CLI entry
├── map.html                # Generated visualization (CLI)
├── scripts/benchmark.js    # Benchmark runner (Node.js)
└── race-chrono-session-v3.csv  # Sample data
```

## Configuration

Edit `src/config.js`:

```javascript
const CONFIG = {
  sampling: {
    imuHz: 25,      // IMU frequency (Hz)
    gpsHz: 1,       // GPS frequency (Hz)
  },
  noise: {
    enabled: true,
    minMeters: 3,   // Minimum noise (m)
    maxMeters: 8,   // Maximum noise (m)
  },
  ekf: {
    sigma_speed: 1.0,        // Accelerometer error (m/s per sqrt(s))
    sigma_course_deg: 3.0,   // Gyro error + slip angle (deg per sqrt(s))
    gps_pos_noise: 5.0,      // GPS position noise without accuracy (m)
    gps_speed_noise: 0.3,    // GPS speed noise (m/s)
    gps_course_noise_deg: 1.5, // GPS course noise (deg)
  },
  outlierDetection: {
    enabled: true,
    method: 'physics',    // 'simple' | 'physics'
    // Physics method uses IMU to validate GPS
    maxAccelG: 2.0,       // Max acceleration (G)
    maxYawRateDiff: 45,   // deg/s tolerance
    maxSpeedDiff: 15,     // m/s tolerance
    anomalyThreshold: 4.0, // Score to reject
  },
};
```

## Data Format

Input: RaceChrono CSV export with columns:
- Timestamp, Lap number, Latitude, Longitude
- Speed, Bearing, GPS accuracy
- Accelerometer (lateral, longitudinal)
- Gyroscope (yaw rate)

## License

MIT
