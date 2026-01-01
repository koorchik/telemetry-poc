# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

GPS track smoothing proof-of-concept that demonstrates trajectory reconstruction using sensor fusion. Compares different approaches:
- Catmull-Rom spline interpolation (smooth GPS interpolation)
- GPS-only Kalman Filter (baseline)
- INS/GPS Sensor Fusion with 7-state Extended Kalman Filter (IMU + GPS)

Input: RaceChrono CSV exports with 25Hz GPS + accelerometer + gyroscope data.
Output: HTML map visualization with multiple trajectory layers.

## Commands

```bash
npm install      # Install dependencies (csv-parser)
npm start        # Run simulation (or: node simulation.js)
```

Output is `map.html` - open in browser to visualize trajectories.

## Architecture

Single file implementation (`simulation.js`) with these sections:

1. **CONFIG** - All tunable parameters (sampling rates, filter noise, EKF parameters)
2. **Matrix operations** - Pure JS implementations (no external math libraries)
3. **Utilities** - Coordinate transforms (GPS↔local ENU), angle normalization
4. **RaceChrono CSV parser** - Handles 12-line header, extracts GPS + IMU columns
5. **GPS simulation** - Downsampling 25Hz→1Hz, optional noise injection
6. **Catmull-Rom spline** - Smooth interpolation between 1Hz GPS points
7. **GPS-only Kalman** - 1D Kalman with constant velocity model + RTS smoother
8. **Sensor Fusion EKF** - 7-state: [px, py, vx, vy, ψ, b_ax, b_ay]
9. **Speed extrema detection** - Min/max speed markers with delta filtering
10. **HTML generation** - Leaflet.js map with layer controls

## Key Data Flow

```
RaceChrono CSV (25Hz)
    → downsample GPS to 1Hz
    → apply filters (spline/kalman/EKF)
    → generate HTML map
```

## Configuration Notes

- `CONFIG.noise.enabled`: Toggle GPS noise simulation
- `CONFIG.ekf.sigma_accel/sigma_gyro`: IMU noise parameters
- `CONFIG.input.skipLines`: RaceChrono CSV header rows (default 12)
- CSV columns: lat=11, lon=12, speed=14, lateral_acc=17, longitudinal_acc=19, yaw_rate=28
