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
    // How far each channel lags behind GPS position (s). These depend on the
    // logging devices, so by default they are estimated for every file from
    // its 1Hz fixes and IMU (gps/delay-estimation.js). The values below are
    // used when autoDelay is off or a channel cannot be estimated.
    autoDelay: true,
    gpsVelocityDelay: 0,     // speed + bearing reported with a fix
    imuDelay: {
      yaw_rate: 0,
      longitudinal_acc: 0,
    },
  },

  // GPS noise simulation
  noise: {
    enabled: true,  // Enable for testing
    // Each fix gets its own error level (1 sigma per axis) from this range
    minMeters: 1,
    maxMeters: 3,
    // Ranges offered in the UI
    levels: [
      { label: 'Light', minMeters: 1, maxMeters: 3 },
      { label: 'Medium', minMeters: 3, maxMeters: 8 },
      { label: 'Heavy', minMeters: 5, maxMeters: 15 },
    ],
    speedSigma: 0.3,       // GPS speed noise (m/s)
    bearingSigmaDeg: 1.5,  // GPS bearing noise (deg)
    seed: null,            // Integer for repeatable noise, null for random
  },

  // GPS-only Kalman Filter (for comparison)
  kalman: {
    R: 0.01,        // Measurement noise variance (m²) - 0.01 for clean data, 25 for noisy
    Q: 1.0,         // Process noise variance
    initialP: 100,
  },

  // INS/GPS Sensor Fusion EKF (vehicle model, see filters/ekf-ins-gps.js)
  ekf: {
    // Process noise, per sqrt(second)
    sigma_pos: 0.02,          // Unmodelled sideways motion (m)
    sigma_speed: 1.0,         // Longitudinal accelerometer error (m/s)
    sigma_course_deg: 3.0,    // Gyro error + slip angle changes (deg)
    sigma_gyro_bias: 0.02,    // Gyro bias random walk (deg/s)
    sigma_accel_bias: 0.05,   // Accelerometer bias random walk (m/s²)
    // Measurement noise
    gps_pos_noise: 5.0,       // GPS position noise when a fix has no accuracy (m)
    gps_speed_noise: 0.3,     // GPS speed noise (m/s)
    gps_course_noise_deg: 1.5,  // GPS course noise at speed (deg)
    min_speed_for_heading: 2.0,  // Below this GPS course is not used (m/s)
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

  // Speed extrema detection (min/max speed labels on map)
  speedExtrema: {
    windowSize: 25,        // Smoothing window (25 = 1 sec at 25Hz)
    minSpeedThreshold: 5,  // Ignore speeds below this (m/s)
    minDeltaKmh: 2,        // Min speed change between extrema (km/h) - low for karting
  },

  // Constants
  G: 9.81,
  METERS_PER_DEG_LAT: 111320,
};

export default CONFIG;
