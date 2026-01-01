# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

GPS track smoothing proof-of-concept that demonstrates trajectory reconstruction using sensor fusion. Compares different approaches:
- Catmull-Rom spline interpolation (smooth GPS interpolation)
- GPS-only Kalman Filter (baseline)
- INS/GPS Sensor Fusion with 7-state Extended Kalman Filter (IMU + GPS)

Input: RaceChrono CSV exports with 25Hz GPS + accelerometer + gyroscope data.

## Usage

```bash
# Start local server
python3 -m http.server 8080

# Open http://localhost:8080
```

Features:
- Drag & drop CSV upload or click to browse
- "Load Example Data" button with embedded sample
- All processing runs in browser (no server needed for computation)
- Full metrics report (RMSE, MAE, Max Error) for all algorithms
- Outlier detection statistics

## Architecture

Browser-only ES6 modular structure in `src/`:

```
src/
├── browser/           # Browser-specific code
│   ├── app.js         # Main browser app, file upload
│   ├── process.js     # Processing pipeline
│   └── visualization.js # Map/chart/metrics rendering
├── data/
│   └── sample-data.js # Embedded example CSV (~6.8MB)
├── io/
│   └── csv-parser.js  # CSV parsing (browser-only)
├── gps/
│   ├── simulation.js  # Downsampling, noise injection
│   └── outlier-detection.js # Physics-based filtering
├── filters/
│   ├── ekf-ins-gps.js # 7-state EKF sensor fusion
│   └── kalman-1d.js   # 1D Kalman + RTS smoother
├── interpolation/
│   ├── linear.js      # Linear interpolation
│   └── spline.js      # Catmull-Rom spline
├── analysis/
│   ├── distance.js    # Distance, lap position, lap time
│   ├── metrics.js     # RMSE, MAE, max error
│   └── speed-extrema.js # Min/max speed detection
├── math/
│   ├── matrix.js      # Matrix operations (pure JS)
│   ├── geometry.js    # Coordinate transforms, haversine
│   └── interpolation.js # Shared interpolation utilities
├── config.js          # All tunable parameters
└── runner.js          # Algorithm orchestration
```

Entry point: `index.html`

## Key Data Flow

```
RaceChrono CSV (25Hz)
    → parseCSVString()
    → enhanceTelemetryPoints() (distance, lapPosition)
    → downsampleGPS() (25Hz → 1Hz)
    → filterGPSOutliers() (physics-based)
    → addGPSNoise() (for comparison)
    → runAllAlgorithms()
        ├── Linear interpolation
        ├── Spline interpolation
        ├── EKF sensor fusion
        └── EKF + Spline smoothing
    → calculateMetrics() (RMSE, MAE, Max Error)
    → Visualization (Leaflet + Chart.js)
```

## Configuration

Key settings in `src/config.js`:

- `CONFIG.noise.enabled`: Toggle GPS noise simulation
- `CONFIG.noise.minMeters/maxMeters`: Noise range (3-8m default)
- `CONFIG.ekf.sigma_accel/sigma_gyro`: IMU noise parameters
- `CONFIG.input.skipLines`: RaceChrono CSV header rows (default 12)
- `CONFIG.outlierDetection`: Physics-based outlier filtering thresholds

## CSV Format

RaceChrono exports with these column indices:
- 0: timestamp, 2: lap_number, 5: accuracy, 7: bearing
- 11: latitude, 12: longitude, 14: speed (m/s)
- 17: lateral_acc (G), 19: longitudinal_acc (G), 28: yaw_rate (deg/s)
