/**
 * Configuration for GPS track smoothing algorithms.
 * @module config
 */

const CONFIG = {
  // Input file settings
  input: {
    file: 'race-chrono-session-v3.csv',
    skipLines: 12,  // RaceChrono metadata rows
  },

  // Sampling rates
  sampling: {
    imuHz: 25,      // IMU at 25Hz
    gpsHz: 1,       // GPS downsampled to 1Hz
  },

  // GPS noise simulation
  noise: {
    enabled: true,  // Enable for testing
    minMeters: 1,
    maxMeters: 3,
  },

  // GPS-only Kalman Filter (for comparison)
  kalman: {
    R: 0.01,        // Measurement noise variance (m²) - 0.01 for clean data, 25 for noisy
    Q: 1.0,         // Process noise variance
    initialP: 100,
  },

  // INS/GPS Sensor Fusion EKF
  ekf: {
    sigma_accel: 0.5,       // Accelerometer noise (m/s²)
    sigma_gyro: 0.02,       // Gyroscope noise (rad/s)
    sigma_bias: 0.001,      // Random walk bias
    gps_pos_noise: 5.0,     // GPS position noise (m)
    min_speed_for_heading: 2.0,  // Min speed for heading initialization (m/s)
  },

  // Outlier detection - Physics-based multi-criteria validation
  outlierDetection: {
    enabled: true,
    method: 'physics',   // 'simple' | 'physics'
    // Simple method thresholds (fallback)
    maxSpeedKmh: 250,
    maxJumpMeters: 50,
    // Physics method thresholds (tuned for 1-3m GPS noise)
    maxAccelG: 2.0,           // Max expected acceleration (G)
    maxYawRateDiff: 45,       // deg/s tolerance between GPS and IMU
    maxSpeedDiff: 15,         // m/s tolerance for speed consistency
    maxLatAccDiff: 0.8,       // G tolerance for lateral acceleration
    anomalyThreshold: 4.0,    // Total weighted score to reject
    // Temporal consistency (3-point window)
    useTemporalCheck: true,
    minPerpDistance: 15,      // meters - perpendicular distance threshold
    triangleRatio: 2.5,       // ratio threshold for path deviation
  },

  // Constants
  G: 9.81,
  METERS_PER_DEG_LAT: 111320,
};

export default CONFIG;
