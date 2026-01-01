# GPS Track Smoothing PoC

A Proof of Concept for GPS trajectory smoothing and sensor fusion, comparing multiple interpolation algorithms.

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

**Best for:** Clean GPS (< 1m error)

### 3. GPS-only Kalman Filter
Classic Kalman filter with RTS (Rauch-Tung-Striebel) smoothing for optimal trajectory estimation.

### 4. INS/GPS Sensor Fusion (EKF)
7-state Extended Kalman Filter that fuses GPS position with IMU data:
- State vector: `[px, py, vx, vy, ψ, b_ax, b_ay]`
- Uses accelerometer for dead reckoning between GPS updates
- Uses gyroscope for heading estimation
- Estimates accelerometer bias

**Note:** EKF performs best when IMU calibration is accurate. With smartphone-grade sensors, simple interpolation often outperforms EKF.

### 5. Physics-Based Outlier Detection

Multi-criteria outlier detection using vehicle physics constraints. Cars/karts cannot instantly change direction or speed, so we validate GPS points against:

1. **Acceleration Consistency** - Check if implied acceleration is physically possible (~2G max)
2. **Heading Rate Consistency** - Compare GPS bearing change with IMU gyroscope
3. **Speed Consistency** - Compare GPS-reported speed with position-derived speed
4. **Lateral Acceleration** - Validate turn rate matches centripetal force (a = v × ω)

Each check produces a score, and points exceeding the weighted threshold are rejected. Additionally, a 3-point temporal window detects single-point outliers that deviate significantly from the trajectory.

**Best for:** Filtering GPS glitches while preserving valid noisy points

## Results

See [RESULTS.md](RESULTS.md) for detailed benchmark results.

### Summary (Average RMSE)

| Noise Level | Linear | Spline | Best |
|-------------|--------|--------|------|
| Clean GPS | 0.44m | 0.39m | Spline |
| Light (1-3m) | 2.33m | 2.57m | Linear |
| Medium (3-8m) | 6.41m | 7.07m | Linear |
| Heavy (5-15m) | 11.19m | 12.40m | Linear |

### Key Findings

1. **Spline wins for clean GPS** - Sub-meter accuracy with high-quality GPS
2. **Linear wins for noisy GPS** - Spline amplifies noise, linear smooths it
3. **RMSE ≈ Noise Level** - With 5m noise, expect ~5-6m RMSE after interpolation
4. **EKF needs calibration** - IMU drift often exceeds interpolation error

## Usage

### Prerequisites

```bash
npm install
```

### Run Simulation

```bash
# All laps
node simulation.js

# Specific lap (1-5)
node simulation.js 3
```

This will:
1. Load RaceChrono data
2. Run all algorithms with clean and noisy GPS
3. Display metrics comparison
4. Generate `map.html` with interactive visualization

### Run Benchmark

```bash
node benchmark.js
```

Generates `RESULTS.md` with metrics for all laps and noise levels.

### View Results

Open `map.html` in a browser to see:
- Ground truth trajectory (green)
- GPS points (red markers)
- Algorithm outputs (toggle in control panel)
- Switch between Clean/Noisy GPS modes
- Metrics comparison table

## File Structure

```
telemetry-poc/
├── simulation.js     # Main simulation script
├── benchmark.js      # Benchmark runner
├── map.html          # Generated visualization
├── RESULTS.md        # Benchmark results
├── README.md         # This file
├── package.json
└── race-chrono-session-v3.csv  # Input data
```

## Configuration

Edit `CONFIG` in `simulation.js`:

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
    sigma_accel: 0.5,    // Accelerometer noise (m/s²)
    sigma_gyro: 0.02,    // Gyroscope noise (rad/s)
    sigma_bias: 0.001,   // Bias random walk
    gps_pos_noise: 5.0,  // GPS position noise (m)
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
