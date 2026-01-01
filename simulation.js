/**
 * GPS Track Smoothing PoC - INS/GPS Sensor Fusion
 *
 * Цей скрипт демонструє відновлення GPS траєкторії за допомогою:
 * 1. GPS-only Kalman Filter (базовий підхід)
 * 2. INS/GPS Sensor Fusion з Extended Kalman Filter (7-state EKF)
 *
 * Вхідні дані: RaceChrono CSV з GPS + акселерометр + гіроскоп (25Hz)
 *
 * Запуск:
 *   npm install
 *   node simulation.js
 */

const fs = require('fs');

// ============================================================================
// КОНФІГУРАЦІЯ
// ============================================================================

const CONFIG = {
  // Вхідний файл
  input: {
    file: 'race-chrono-session-v3.csv',
    skipLines: 12,  // Метадані RaceChrono
  },

  // Частоти дискретизації
  sampling: {
    imuHz: 25,      // IMU залишається на 25Hz
    gpsHz: 1,       // GPS downsampled до 1Hz
  },

  // Симуляція шуму GPS
  noise: {
    enabled: true,  // Увімкнено для тестування
    minMeters: 3,
    maxMeters: 8,
  },

  // GPS-only Kalman Filter (для порівняння)
  kalman: {
    R: 0.01,        // Дисперсія шуму вимірювань (м²) - 0.01 для чистих даних, 25 для шуму
    Q: 1.0,         // Дисперсія процесу
    initialP: 100,
  },

  // INS/GPS Sensor Fusion EKF
  ekf: {
    sigma_accel: 0.5,       // Шум акселерометра (м/с²)
    sigma_gyro: 0.02,       // Шум гіроскопа (рад/с)
    sigma_bias: 0.001,      // Random walk bias
    gps_pos_noise: 5.0,     // GPS position noise (м)
    min_speed_for_heading: 2.0,  // Мін. швидкість для ініціалізації heading (м/с)
  },

  // Outlier detection - Physics-based multi-criteria validation
  outlierDetection: {
    enabled: true,
    method: 'physics',   // 'simple' | 'physics'
    // Simple method thresholds (fallback)
    maxSpeedKmh: 250,
    maxJumpMeters: 50,
    // Physics method thresholds (tuned for 3-8m GPS noise)
    maxAccelG: 2.0,           // Max expected acceleration (G) - higher tolerance for noise
    maxYawRateDiff: 45,       // deg/s tolerance between GPS and IMU
    maxSpeedDiff: 15,         // m/s tolerance for speed consistency
    maxLatAccDiff: 0.8,       // G tolerance for lateral acceleration
    anomalyThreshold: 4.0,    // Total weighted score to reject (higher = less aggressive)
    // Temporal consistency (3-point window)
    useTemporalCheck: true,
    minPerpDistance: 15,      // meters - perpendicular distance threshold
    triangleRatio: 2.5,       // ratio threshold for path deviation
  },

  // Константи
  G: 9.81,
  METERS_PER_DEG_LAT: 111320,
};

// ============================================================================
// МАТРИЧНІ ОПЕРАЦІЇ (Pure JavaScript)
// ============================================================================

/**
 * Створює матрицю заданого розміру
 */
function createMatrix(rows, cols, fill = 0) {
  return Array(rows).fill(null).map(() => Array(cols).fill(fill));
}

/**
 * Одинична матриця
 */
function eye(n) {
  const I = createMatrix(n, n, 0);
  for (let i = 0; i < n; i++) I[i][i] = 1;
  return I;
}

/**
 * Транспонування матриці
 */
function transpose(A) {
  const rows = A.length, cols = A[0].length;
  const T = createMatrix(cols, rows);
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      T[j][i] = A[i][j];
    }
  }
  return T;
}

/**
 * Множення матриць A * B
 */
function matmul(A, B) {
  const rowsA = A.length, colsA = A[0].length;
  const colsB = B[0].length;
  const C = createMatrix(rowsA, colsB);
  for (let i = 0; i < rowsA; i++) {
    for (let j = 0; j < colsB; j++) {
      let sum = 0;
      for (let k = 0; k < colsA; k++) {
        sum += A[i][k] * B[k][j];
      }
      C[i][j] = sum;
    }
  }
  return C;
}

/**
 * Додавання матриць
 */
function matadd(A, B) {
  const rows = A.length, cols = A[0].length;
  const C = createMatrix(rows, cols);
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      C[i][j] = A[i][j] + B[i][j];
    }
  }
  return C;
}

/**
 * Віднімання матриць
 */
function matsub(A, B) {
  const rows = A.length, cols = A[0].length;
  const C = createMatrix(rows, cols);
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      C[i][j] = A[i][j] - B[i][j];
    }
  }
  return C;
}

/**
 * Множення матриці на вектор
 */
function matvec(M, v) {
  const rows = M.length;
  const result = Array(rows).fill(0);
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < v.length; j++) {
      result[i] += M[i][j] * v[j];
    }
  }
  return result;
}

/**
 * Інверсія матриці (Gauss-Jordan)
 */
function inverse(M) {
  const n = M.length;
  const A = M.map(row => [...row]);
  const I = eye(n);

  for (let i = 0; i < n; i++) {
    // Пошук максимального елемента в колонці
    let maxRow = i;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(A[k][i]) > Math.abs(A[maxRow][i])) maxRow = k;
    }
    [A[i], A[maxRow]] = [A[maxRow], A[i]];
    [I[i], I[maxRow]] = [I[maxRow], I[i]];

    const pivot = A[i][i];
    if (Math.abs(pivot) < 1e-12) {
      // Сингулярна матриця - повертаємо діагональну
      console.warn('Warning: Near-singular matrix in inverse');
      return eye(n);
    }

    // Нормалізація рядка
    for (let j = 0; j < n; j++) {
      A[i][j] /= pivot;
      I[i][j] /= pivot;
    }

    // Елімінація
    for (let k = 0; k < n; k++) {
      if (k !== i) {
        const factor = A[k][i];
        for (let j = 0; j < n; j++) {
          A[k][j] -= factor * A[i][j];
          I[k][j] -= factor * I[i][j];
        }
      }
    }
  }

  return I;
}

// ============================================================================
// УТИЛІТИ
// ============================================================================

/**
 * Box-Muller transform для Gaussian noise
 */
function gaussianRandom(mean = 0, stddev = 1) {
  const u1 = Math.random();
  const u2 = Math.random();
  const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  return z0 * stddev + mean;
}

/**
 * GPS координати → локальні метри (ENU)
 */
function gpsToLocal(lat, lon, lat0, lon0) {
  const cosLat0 = Math.cos(lat0 * Math.PI / 180);
  const px = (lon - lon0) * CONFIG.METERS_PER_DEG_LAT * cosLat0;  // East
  const py = (lat - lat0) * CONFIG.METERS_PER_DEG_LAT;            // North
  return { px, py };
}

/**
 * Локальні метри → GPS координати
 */
function localToGps(px, py, lat0, lon0) {
  const cosLat0 = Math.cos(lat0 * Math.PI / 180);
  const lat = lat0 + py / CONFIG.METERS_PER_DEG_LAT;
  const lon = lon0 + px / (CONFIG.METERS_PER_DEG_LAT * cosLat0);
  return { lat, lon };
}

/**
 * Нормалізація кута до [-π, π]
 */
function normalizeAngle(angle) {
  while (angle > Math.PI) angle -= 2 * Math.PI;
  while (angle < -Math.PI) angle += 2 * Math.PI;
  return angle;
}

/**
 * Обчислює відстань між двома GPS точками в метрах (Haversine)
 */
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Earth radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Обчислює метрики точності траєкторії відносно Ground Truth
 * @param {Array} groundTruth - еталонна траєкторія [{timestamp, lat, lon}]
 * @param {Array} estimated - оцінена траєкторія [{timestamp, lat, lon}]
 * @returns {Object} {mse, rmse, mae, maxError} в метрах
 */
function calculateAccuracyMetrics(groundTruth, estimated) {
  if (estimated.length === 0) {
    return { mse: Infinity, rmse: Infinity, mae: Infinity, maxError: Infinity, count: 0 };
  }

  // Створюємо індекс для швидкого пошуку по timestamp
  const estMap = new Map();
  for (const p of estimated) {
    estMap.set(p.timestamp.toFixed(3), p);
  }

  let sumSquaredError = 0;
  let sumAbsError = 0;
  let maxError = 0;
  let count = 0;

  for (const gt of groundTruth) {
    const key = gt.timestamp.toFixed(3);
    const est = estMap.get(key);
    if (!est) continue;

    const error = haversineDistance(gt.lat, gt.lon, est.lat, est.lon);
    sumSquaredError += error * error;
    sumAbsError += error;
    maxError = Math.max(maxError, error);
    count++;
  }

  if (count === 0) {
    return { mse: Infinity, rmse: Infinity, mae: Infinity, maxError: Infinity, count: 0 };
  }

  const mse = sumSquaredError / count;
  return {
    mse: mse,
    rmse: Math.sqrt(mse),
    mae: sumAbsError / count,
    maxError: maxError,
    count: count
  };
}

// ============================================================================
// ЧИТАННЯ CSV RACECHRONO
// ============================================================================

/**
 * Парсить RaceChrono CSV формат
 * Пропускає перші 12 рядків метаданих
 */
function readRaceChronoCSV(filename) {
  return new Promise((resolve, reject) => {
    const content = fs.readFileSync(filename, 'utf-8');
    const lines = content.split('\n');

    // Пропускаємо метадані (12 рядків)
    const dataLines = lines.slice(CONFIG.input.skipLines);
    const results = [];

    for (const line of dataLines) {
      if (!line.trim()) continue;

      const cols = line.split(',');

      // Перевіряємо чи це валідний рядок даних
      const timestamp = parseFloat(cols[0]);
      if (isNaN(timestamp)) continue;

      const lat = parseFloat(cols[11]);
      const lon = parseFloat(cols[12]);
      if (isNaN(lat) || isNaN(lon)) continue;

      results.push({
        timestamp,
        lat,
        lon,
        speed: parseFloat(cols[14]) || 0,        // m/s
        bearing: parseFloat(cols[7]) || 0,       // deg
        accuracy: parseFloat(cols[5]) || 5,      // m
        lap: parseInt(cols[2]) || 0,             // lap_number
        // IMU дані (використовуємо розраховані RaceChrono значення)
        lateral_acc: parseFloat(cols[17]) || 0,      // G - бічне прискорення (вже в координатах авто)
        longitudinal_acc: parseFloat(cols[19]) || 0, // G - поздовжнє прискорення
        yaw_rate: parseFloat(cols[28]) || 0,         // deg/s - z_rate_of_rotation (yaw)
      });
    }

    console.log(`   Завантажено ${results.length} точок з ${filename}`);
    resolve(results);
  });
}

// ============================================================================
// СИМУЛЯЦІЯ ТЕЛЕФОННОГО GPS
// ============================================================================

/**
 * Downsampling GPS до 1Hz (тільки GPS дані, IMU залишається)
 */
function downsampleGPS(data) {
  const ratio = CONFIG.sampling.imuHz / CONFIG.sampling.gpsHz;
  const result = [];

  for (let i = 0; i < data.length; i += ratio) {
    const idx = Math.floor(i);
    result.push({
      ...data[idx],
      originalIndex: idx,
    });
  }

  console.log(`   GPS downsampling: ${data.length} → ${result.length} точок`);
  return result;
}

/**
 * Додавання шуму до GPS координат
 */
function addGPSNoise(points) {
  if (!CONFIG.noise.enabled) return points;

  const { minMeters, maxMeters } = CONFIG.noise;
  const avgNoise = (minMeters + maxMeters) / 2;

  return points.map(p => {
    const noiseLat = gaussianRandom(0, avgNoise);
    const noiseLon = gaussianRandom(0, avgNoise);
    const cosLat = Math.cos(p.lat * Math.PI / 180);

    return {
      ...p,
      lat: p.lat + noiseLat / CONFIG.METERS_PER_DEG_LAT,
      lon: p.lon + noiseLon / (CONFIG.METERS_PER_DEG_LAT * cosLat),
    };
  });
}

// ============================================================================
// PHYSICS-BASED OUTLIER DETECTION
// ============================================================================

/**
 * Calculate signed angle difference (-180 to +180 degrees)
 */
function angleDiff(a, b) {
  let diff = a - b;
  while (diff > 180) diff -= 360;
  while (diff < -180) diff += 360;
  return diff;
}

/**
 * Calculate perpendicular distance from point to line segment (in meters)
 * @param {Object} p1 - Line start {lat, lon}
 * @param {Object} p2 - Line end {lat, lon}
 * @param {Object} point - Point to check {lat, lon}
 */
function pointToLineDistance(p1, p2, point) {
  // Convert to local meters
  const cosLat = Math.cos(p1.lat * Math.PI / 180);
  const x1 = 0, y1 = 0;
  const x2 = (p2.lon - p1.lon) * CONFIG.METERS_PER_DEG_LAT * cosLat;
  const y2 = (p2.lat - p1.lat) * CONFIG.METERS_PER_DEG_LAT;
  const px = (point.lon - p1.lon) * CONFIG.METERS_PER_DEG_LAT * cosLat;
  const py = (point.lat - p1.lat) * CONFIG.METERS_PER_DEG_LAT;

  // Line length squared
  const lineLenSq = x2 * x2 + y2 * y2;
  if (lineLenSq === 0) return Math.sqrt(px * px + py * py);

  // Project point onto line
  const t = Math.max(0, Math.min(1, (px * x2 + py * y2) / lineLenSq));
  const projX = t * x2;
  const projY = t * y2;

  // Distance from point to projection
  return Math.sqrt((px - projX) ** 2 + (py - projY) ** 2);
}

/**
 * Calculate physics-based anomaly scores for a GPS point
 * @param {Object} prev - Previous GPS point
 * @param {Object} curr - Current GPS point
 * @param {number} dt - Time delta in seconds
 * @param {number} prevImpliedSpeed - Speed implied by previous segment
 */
function calculateAnomalyScore(prev, curr, dt, prevImpliedSpeed = null) {
  const cfg = CONFIG.outlierDetection;
  const scores = { accel: 0, yaw: 0, speed: 0, latAcc: 0 };

  // Distance between points
  const dist = haversineDistance(prev.lat, prev.lon, curr.lat, curr.lon);
  const gpsSpeed = dist / dt;

  // Check 1: Acceleration magnitude consistency
  // Compare implied acceleration with physical limits
  const prevSpeed = prevImpliedSpeed !== null ? prevImpliedSpeed : prev.speed;
  const impliedAccel = Math.abs(gpsSpeed - prevSpeed) / dt;
  const maxAccelMs2 = cfg.maxAccelG * CONFIG.G;
  if (impliedAccel > maxAccelMs2) {
    scores.accel = (impliedAccel - maxAccelMs2) / maxAccelMs2;
  }

  // Check 2: Heading rate consistency (GPS bearing change vs IMU yaw_rate)
  if (prev.bearing !== undefined && curr.bearing !== undefined &&
      prev.yaw_rate !== undefined && curr.yaw_rate !== undefined) {
    const bearingChange = angleDiff(curr.bearing, prev.bearing);
    const gpsYawRate = bearingChange / dt; // deg/s
    const imuYawRate = (prev.yaw_rate + curr.yaw_rate) / 2;
    const yawRateDiff = Math.abs(gpsYawRate - imuYawRate);
    if (yawRateDiff > cfg.maxYawRateDiff) {
      scores.yaw = (yawRateDiff - cfg.maxYawRateDiff) / cfg.maxYawRateDiff;
    }
  }

  // Check 3: Speed consistency (GPS speed vs position-derived speed)
  if (curr.speed !== undefined) {
    const speedDiff = Math.abs(curr.speed - gpsSpeed);
    if (speedDiff > cfg.maxSpeedDiff) {
      scores.speed = (speedDiff - cfg.maxSpeedDiff) / cfg.maxSpeedDiff;
    }
  }

  // Check 4: Lateral acceleration vs turn rate
  // Physics: a_lateral = v * ω
  if (curr.yaw_rate !== undefined && curr.lateral_acc !== undefined && curr.speed > 2) {
    const omega = Math.abs(curr.yaw_rate) * Math.PI / 180; // rad/s
    const expectedLatAcc = (curr.speed * omega) / CONFIG.G; // in G
    const measuredLatAcc = Math.abs(curr.lateral_acc);
    const latAccDiff = Math.abs(expectedLatAcc - measuredLatAcc);
    if (latAccDiff > cfg.maxLatAccDiff) {
      scores.latAcc = (latAccDiff - cfg.maxLatAccDiff) / 1.0;
    }
  }

  // Weighted sum (acceleration violations are most important)
  const weights = { accel: 2.0, yaw: 1.5, speed: 1.0, latAcc: 1.0 };
  const totalScore = Object.keys(scores).reduce(
    (sum, key) => sum + scores[key] * weights[key], 0
  );

  return { scores, totalScore, impliedSpeed: gpsSpeed };
}

/**
 * Check if a point is a temporal outlier using 3-point window
 * @param {Array} points - Array of GPS points
 * @param {number} index - Index of point to check
 */
function isTemporalOutlier(points, index) {
  const cfg = CONFIG.outlierDetection;
  if (!cfg.useTemporalCheck) return false;
  if (index < 1 || index >= points.length - 1) return false;

  const prev = points[index - 1];
  const curr = points[index];
  const next = points[index + 1];

  // Check: Does skipping curr make the trajectory smoother?
  const distPrevCurr = haversineDistance(prev.lat, prev.lon, curr.lat, curr.lon);
  const distCurrNext = haversineDistance(curr.lat, curr.lon, next.lat, next.lon);
  const distPrevNext = haversineDistance(prev.lat, prev.lon, next.lat, next.lon);

  // Triangle ratio: if path through curr is much longer than direct path
  const triangleRatio = (distPrevCurr + distCurrNext) / Math.max(distPrevNext, 0.1);

  // Perpendicular distance from curr to line prev->next
  const perpDistance = pointToLineDistance(prev, next, curr);

  // Is outlier if: big detour AND far from the line
  return triangleRatio > cfg.triangleRatio && perpDistance > cfg.minPerpDistance;
}

/**
 * Physics-based GPS outlier detection
 * Uses multi-criteria scoring and temporal consistency checks
 * @param {Array} gpsPoints - Array of GPS points
 * @returns {Object} { filtered: [], outliers: [] }
 */
function filterGPSOutliers(gpsPoints) {
  if (!CONFIG.outlierDetection.enabled) {
    return { filtered: gpsPoints, outliers: [] };
  }

  if (gpsPoints.length < 2) {
    return { filtered: gpsPoints, outliers: [] };
  }

  const cfg = CONFIG.outlierDetection;

  // Simple method (fallback)
  if (cfg.method === 'simple') {
    return filterGPSOutliersSimple(gpsPoints);
  }

  // Physics-based method
  const outliers = [];
  const anomalyScores = new Array(gpsPoints.length).fill(null);

  // First pass: calculate anomaly scores for all points
  let prevImpliedSpeed = gpsPoints[0].speed || 0;
  anomalyScores[0] = { scores: {}, totalScore: 0, impliedSpeed: prevImpliedSpeed };

  for (let i = 1; i < gpsPoints.length; i++) {
    const prev = gpsPoints[i - 1];
    const curr = gpsPoints[i];
    const dt = curr.timestamp - prev.timestamp;

    if (dt <= 0) {
      anomalyScores[i] = { scores: {}, totalScore: 0, impliedSpeed: prevImpliedSpeed };
      continue;
    }

    const result = calculateAnomalyScore(prev, curr, dt, prevImpliedSpeed);
    anomalyScores[i] = result;
    prevImpliedSpeed = result.impliedSpeed;
  }

  // Second pass: filter based on scores + temporal consistency
  const filtered = [gpsPoints[0]];

  for (let i = 1; i < gpsPoints.length; i++) {
    const score = anomalyScores[i];
    const isTemporal = isTemporalOutlier(gpsPoints, i);

    // Reject if: high anomaly score OR temporal outlier with moderate score
    const isOutlier = score.totalScore > cfg.anomalyThreshold ||
                      (isTemporal && score.totalScore > cfg.anomalyThreshold / 2);

    if (isOutlier) {
      outliers.push({
        ...gpsPoints[i],
        reason: isTemporal ? 'temporal+physics' : 'physics',
        scores: score.scores,
        totalScore: score.totalScore
      });
    } else {
      filtered.push(gpsPoints[i]);
    }
  }

  return { filtered, outliers };
}

/**
 * Simple threshold-based outlier detection (fallback)
 */
function filterGPSOutliersSimple(gpsPoints) {
  const cfg = CONFIG.outlierDetection;
  const maxSpeedMs = cfg.maxSpeedKmh / 3.6;

  const filtered = [gpsPoints[0]];
  const outliers = [];

  for (let i = 1; i < gpsPoints.length; i++) {
    const prev = filtered[filtered.length - 1];
    const curr = gpsPoints[i];
    const dt = curr.timestamp - prev.timestamp;

    if (dt <= 0) {
      filtered.push(curr);
      continue;
    }

    const dist = haversineDistance(prev.lat, prev.lon, curr.lat, curr.lon);
    const speed = dist / dt;

    if (speed > maxSpeedMs) {
      outliers.push({ ...curr, reason: 'speed', value: speed * 3.6 });
    } else if (dist > cfg.maxJumpMeters) {
      outliers.push({ ...curr, reason: 'jump', value: dist });
    } else {
      filtered.push(curr);
    }
  }

  return { filtered, outliers };
}

// ============================================================================
// CATMULL-ROM SPLINE INTERPOLATION
// ============================================================================

/**
 * Catmull-Rom spline interpolation
 * @param {number} p0 - попередня точка
 * @param {number} p1 - початок сегмента
 * @param {number} p2 - кінець сегмента
 * @param {number} p3 - наступна точка
 * @param {number} t - параметр [0, 1]
 */
function catmullRom(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;

  return 0.5 * (
    (2 * p1) +
    (-p0 + p2) * t +
    (2*p0 - 5*p1 + 4*p2 - p3) * t2 +
    (-p0 + 3*p1 - 3*p2 + p3) * t3
  );
}

/**
 * Spline інтерполяція GPS точок
 */
function applySplineInterpolation(fullData, noisyGPS) {
  if (noisyGPS.length < 2) return noisyGPS;

  const result = [];
  const startIdx = noisyGPS[0].originalIndex || 0;

  // Для кожної точки fullData знаходимо відповідний сегмент GPS
  for (let i = startIdx; i < fullData.length; i++) {
    const t = fullData[i].timestamp;

    // Знаходимо сегмент [gpsIdx, gpsIdx+1] де t потрапляє
    let gpsIdx = 0;
    while (gpsIdx < noisyGPS.length - 1 && noisyGPS[gpsIdx + 1].timestamp <= t) {
      gpsIdx++;
    }

    if (gpsIdx >= noisyGPS.length - 1) {
      // За межами GPS даних
      result.push({
        timestamp: t,
        lat: noisyGPS[noisyGPS.length - 1].lat,
        lon: noisyGPS[noisyGPS.length - 1].lon
      });
      continue;
    }

    // 4 точки для Catmull-Rom: p0, p1, p2, p3
    const i0 = Math.max(0, gpsIdx - 1);
    const i1 = gpsIdx;
    const i2 = Math.min(noisyGPS.length - 1, gpsIdx + 1);
    const i3 = Math.min(noisyGPS.length - 1, gpsIdx + 2);

    // Параметр u ∈ [0, 1] в межах сегмента [i1, i2]
    const t0 = noisyGPS[i1].timestamp;
    const t1 = noisyGPS[i2].timestamp;
    const u = (t - t0) / (t1 - t0);

    // Інтерполяція
    const lat = catmullRom(
      noisyGPS[i0].lat, noisyGPS[i1].lat,
      noisyGPS[i2].lat, noisyGPS[i3].lat, u
    );
    const lon = catmullRom(
      noisyGPS[i0].lon, noisyGPS[i1].lon,
      noisyGPS[i2].lon, noisyGPS[i3].lon, u
    );

    result.push({ timestamp: t, lat, lon });
  }

  return result;
}

/**
 * Проста лінійна інтерполяція між GPS точками
 * @param {Array} fullData - повні дані з timestamps
 * @param {Array} noisyGPS - GPS точки (1Hz)
 */
function applyLinearInterpolation(fullData, noisyGPS) {
  if (noisyGPS.length < 2) return noisyGPS;

  const result = [];
  const startIdx = noisyGPS[0].originalIndex || 0;

  for (let i = startIdx; i < fullData.length; i++) {
    const t = fullData[i].timestamp;

    // Знаходимо сегмент [gpsIdx, gpsIdx+1]
    let gpsIdx = 0;
    while (gpsIdx < noisyGPS.length - 1 && noisyGPS[gpsIdx + 1].timestamp <= t) {
      gpsIdx++;
    }

    if (gpsIdx >= noisyGPS.length - 1) {
      result.push({
        timestamp: t,
        lat: noisyGPS[noisyGPS.length - 1].lat,
        lon: noisyGPS[noisyGPS.length - 1].lon
      });
      continue;
    }

    // Лінійна інтерполяція
    const p1 = noisyGPS[gpsIdx];
    const p2 = noisyGPS[gpsIdx + 1];
    const u = (t - p1.timestamp) / (p2.timestamp - p1.timestamp);

    result.push({
      timestamp: t,
      lat: p1.lat + u * (p2.lat - p1.lat),
      lon: p1.lon + u * (p2.lon - p1.lon)
    });
  }

  return result;
}

/**
 * Згладжує траєкторію за допомогою Catmull-Rom spline
 * Downsamples до 1Hz, потім інтерполює назад
 * @param {Array} trajectory - масив точок [{timestamp, lat, lon}]
 * @param {number} downsampleRatio - кожна N-та точка стає контрольною (default: 25 для 25Hz→1Hz)
 */
function smoothTrajectoryWithSpline(trajectory, downsampleRatio = 25) {
  if (trajectory.length < downsampleRatio * 2) return trajectory;

  // Downsample: беремо кожну N-ту точку як контрольну
  const controlPoints = [];
  for (let i = 0; i < trajectory.length; i += downsampleRatio) {
    controlPoints.push(trajectory[i]);
  }
  // Додаємо останню точку якщо її немає
  if (controlPoints[controlPoints.length - 1] !== trajectory[trajectory.length - 1]) {
    controlPoints.push(trajectory[trajectory.length - 1]);
  }

  if (controlPoints.length < 4) return trajectory;

  // Інтерполюємо кожну точку оригінальної траєкторії
  const result = [];

  for (const point of trajectory) {
    const t = point.timestamp;

    // Знаходимо сегмент контрольних точок
    let idx = 0;
    while (idx < controlPoints.length - 1 && controlPoints[idx + 1].timestamp <= t) {
      idx++;
    }

    if (idx >= controlPoints.length - 1) {
      result.push({ ...point });
      continue;
    }

    // 4 точки для Catmull-Rom
    const i0 = Math.max(0, idx - 1);
    const i1 = idx;
    const i2 = Math.min(controlPoints.length - 1, idx + 1);
    const i3 = Math.min(controlPoints.length - 1, idx + 2);

    const t0 = controlPoints[i1].timestamp;
    const t1 = controlPoints[i2].timestamp;
    const u = t1 > t0 ? (t - t0) / (t1 - t0) : 0;

    const lat = catmullRom(
      controlPoints[i0].lat, controlPoints[i1].lat,
      controlPoints[i2].lat, controlPoints[i3].lat, u
    );
    const lon = catmullRom(
      controlPoints[i0].lon, controlPoints[i1].lon,
      controlPoints[i2].lon, controlPoints[i3].lon, u
    );

    result.push({ timestamp: t, lat, lon });
  }

  return result;
}

// ============================================================================
// GPS-ONLY KALMAN FILTER (для порівняння)
// ============================================================================

class KalmanFilter1D {
  constructor(R, Q, initialValue = 0) {
    this.x = [initialValue, 0];
    this.P = [
      [CONFIG.kalman.initialP, 0],
      [0, CONFIG.kalman.initialP]
    ];
    this.R = R;
    this.Q = Q;
  }

  predict(dt) {
    const newPos = this.x[0] + this.x[1] * dt;
    const newVel = this.x[1];
    this.x = [newPos, newVel];

    const dt2 = dt * dt;
    const dt3 = dt2 * dt;
    const dt4 = dt3 * dt;
    const q = this.Q;

    const P = this.P;
    this.P = [
      [P[0][0] + dt * P[1][0] + dt * P[0][1] + dt2 * P[1][1] + dt4 / 4 * q,
       P[0][1] + dt * P[1][1] + dt3 / 2 * q],
      [P[1][0] + dt * P[1][1] + dt3 / 2 * q,
       P[1][1] + dt2 * q]
    ];
  }

  update(measurement) {
    const y = measurement - this.x[0];
    const S = this.P[0][0] + this.R;
    const K = [this.P[0][0] / S, this.P[1][0] / S];

    this.x[0] += K[0] * y;
    this.x[1] += K[1] * y;

    const P = this.P;
    this.P = [
      [(1 - K[0]) * P[0][0], (1 - K[0]) * P[0][1]],
      [-K[1] * P[0][0] + P[1][0], -K[1] * P[0][1] + P[1][1]]
    ];

    return this.x[0];
  }

  filter(measurement, dt) {
    this.predict(dt);
    return this.update(measurement);
  }
}

/**
 * RTS Smoother для 1D Kalman (state = [position, velocity])
 * Forward pass + Backward pass для оптимального згладжування
 */
function rtsSmooth1D(measurements, timestamps, R, Q, initialValue) {
  const n = timestamps.length;
  if (n === 0) return [];

  // Масиви для зберігання історії
  const x_fwd = [];      // Forward states
  const P_fwd = [];      // Forward covariances
  const x_pred = [];     // Predicted states
  const P_pred = [];     // Predicted covariances

  // Ініціалізація
  let x = [initialValue, 0];
  let P = [[CONFIG.kalman.initialP, 0], [0, CONFIG.kalman.initialP]];

  // Forward pass
  for (let i = 0; i < n; i++) {
    const dt = i === 0 ? 0 : timestamps[i] - timestamps[i - 1];

    // Predict
    if (dt > 0) {
      const dt2 = dt * dt;
      const dt3 = dt2 * dt;
      const dt4 = dt3 * dt;

      const x_p = [x[0] + x[1] * dt, x[1]];
      const P_p = [
        [P[0][0] + dt * P[1][0] + dt * P[0][1] + dt2 * P[1][1] + dt4 / 4 * Q,
         P[0][1] + dt * P[1][1] + dt3 / 2 * Q],
        [P[1][0] + dt * P[1][1] + dt3 / 2 * Q,
         P[1][1] + dt2 * Q]
      ];

      x_pred.push([...x_p]);
      P_pred.push(P_p.map(row => [...row]));

      x = x_p;
      P = P_p;
    } else {
      x_pred.push([...x]);
      P_pred.push(P.map(row => [...row]));
    }

    // Update (якщо є вимірювання)
    if (measurements[i] !== null) {
      const y = measurements[i] - x[0];
      const S = P[0][0] + R;
      const K = [P[0][0] / S, P[1][0] / S];

      x = [x[0] + K[0] * y, x[1] + K[1] * y];
      P = [
        [(1 - K[0]) * P[0][0], (1 - K[0]) * P[0][1]],
        [-K[1] * P[0][0] + P[1][0], -K[1] * P[0][1] + P[1][1]]
      ];
    }

    x_fwd.push([...x]);
    P_fwd.push(P.map(row => [...row]));
  }

  // Backward pass (RTS smoothing)
  const x_smooth = new Array(n);
  x_smooth[n - 1] = [...x_fwd[n - 1]];

  for (let i = n - 2; i >= 0; i--) {
    const dt = timestamps[i + 1] - timestamps[i];
    if (dt <= 0) {
      x_smooth[i] = [...x_fwd[i]];
      continue;
    }

    // F matrix: [[1, dt], [0, 1]]
    // C = P_fwd[i] * F' * inv(P_pred[i+1])
    // Для 2x2: F' = [[1, 0], [dt, 1]]

    const P_pred_inv_det = P_pred[i + 1][0][0] * P_pred[i + 1][1][1] - P_pred[i + 1][0][1] * P_pred[i + 1][1][0];
    if (Math.abs(P_pred_inv_det) < 1e-12) {
      x_smooth[i] = [...x_fwd[i]];
      continue;
    }

    const P_pred_inv = [
      [P_pred[i + 1][1][1] / P_pred_inv_det, -P_pred[i + 1][0][1] / P_pred_inv_det],
      [-P_pred[i + 1][1][0] / P_pred_inv_det, P_pred[i + 1][0][0] / P_pred_inv_det]
    ];

    // P_fwd * F' = [[P00 + P01*dt, P01], [P10 + P11*dt, P11]]
    const PF = [
      [P_fwd[i][0][0] + P_fwd[i][0][1] * dt, P_fwd[i][0][1]],
      [P_fwd[i][1][0] + P_fwd[i][1][1] * dt, P_fwd[i][1][1]]
    ];

    // C = PF * P_pred_inv
    const C = [
      [PF[0][0] * P_pred_inv[0][0] + PF[0][1] * P_pred_inv[1][0],
       PF[0][0] * P_pred_inv[0][1] + PF[0][1] * P_pred_inv[1][1]],
      [PF[1][0] * P_pred_inv[0][0] + PF[1][1] * P_pred_inv[1][0],
       PF[1][0] * P_pred_inv[0][1] + PF[1][1] * P_pred_inv[1][1]]
    ];

    // x_smooth[i] = x_fwd[i] + C * (x_smooth[i+1] - x_pred[i+1])
    const dx = [x_smooth[i + 1][0] - x_pred[i + 1][0], x_smooth[i + 1][1] - x_pred[i + 1][1]];
    x_smooth[i] = [
      x_fwd[i][0] + C[0][0] * dx[0] + C[0][1] * dx[1],
      x_fwd[i][1] + C[1][0] * dx[0] + C[1][1] * dx[1]
    ];
  }

  return x_smooth.map(s => s[0]); // Повертаємо тільки позиції
}

/**
 * GPS-only Kalman фільтр з RTS Smoother
 * Forward pass + Backward pass для плавної інтерполяції
 */
function applyGPSOnlyKalman(fullData, noisyGPS, lat0) {
  if (noisyGPS.length === 0) return [];

  const R = CONFIG.kalman.R;
  const Q = CONFIG.kalman.Q;

  // Конвертуємо R і Q в градуси
  const cosLat = Math.cos(lat0 * Math.PI / 180);
  const R_lat = R / Math.pow(CONFIG.METERS_PER_DEG_LAT, 2);
  const R_lon = R / Math.pow(CONFIG.METERS_PER_DEG_LAT * cosLat, 2);
  const Q_lat = Q / Math.pow(CONFIG.METERS_PER_DEG_LAT, 2);
  const Q_lon = Q / Math.pow(CONFIG.METERS_PER_DEG_LAT * cosLat, 2);

  // Знаходимо стартовий індекс в fullData
  const startIdx = noisyGPS[0].originalIndex || 0;
  const dataSlice = fullData.slice(startIdx);

  // Готуємо масиви timestamps і measurements
  const timestamps = dataSlice.map(p => p.timestamp);

  // GPS measurements - null якщо немає GPS в цей момент
  let gpsIdx = 0;
  let nextGpsTime = noisyGPS[0].timestamp;

  const latMeasurements = [];
  const lonMeasurements = [];

  for (const point of dataSlice) {
    if (point.timestamp >= nextGpsTime && gpsIdx < noisyGPS.length) {
      latMeasurements.push(noisyGPS[gpsIdx].lat);
      lonMeasurements.push(noisyGPS[gpsIdx].lon);
      gpsIdx++;
      nextGpsTime = noisyGPS[gpsIdx]?.timestamp ?? Infinity;
    } else {
      latMeasurements.push(null);
      lonMeasurements.push(null);
    }
  }

  // RTS Smoothing
  const smoothedLat = rtsSmooth1D(latMeasurements, timestamps, R_lat, Q_lat, noisyGPS[0].lat);
  const smoothedLon = rtsSmooth1D(lonMeasurements, timestamps, R_lon, Q_lon, noisyGPS[0].lon);

  // Формуємо результат
  const filtered = [];
  for (let i = 0; i < dataSlice.length; i++) {
    filtered.push({
      timestamp: dataSlice[i].timestamp,
      lat: smoothedLat[i],
      lon: smoothedLon[i],
    });
  }

  return filtered;
}

// ============================================================================
// INS/GPS SENSOR FUSION (7-State Extended Kalman Filter)
// ============================================================================

/**
 * State vector: [px, py, vx, vy, psi, b_ax, b_ay]
 * - px, py: позиція в локальних координатах (м)
 * - vx, vy: швидкість (м/с)
 * - psi: heading (рад, від North, за годинниковою)
 * - b_ax, b_ay: bias акселерометра (м/с²)
 */
class INSGPSFusion {
  constructor() {
    this.x = null;  // State vector [7]
    this.P = null;  // Covariance matrix [7x7]
    this.lat0 = null;
    this.lon0 = null;
    this.initialized = false;
  }

  /**
   * Ініціалізація з першого GPS вимірювання
   */
  initialize(gpsPoint) {
    this.lat0 = gpsPoint.lat;
    this.lon0 = gpsPoint.lon;

    // Heading з GPS bearing (конвертуємо deg → rad)
    const psi0 = gpsPoint.bearing * Math.PI / 180;

    // Швидкість з GPS
    const speed = gpsPoint.speed;
    const vx0 = speed * Math.sin(psi0);  // East
    const vy0 = speed * Math.cos(psi0);  // North

    // State: [px, py, vx, vy, psi, b_ax, b_ay]
    this.x = [0, 0, vx0, vy0, psi0, 0, 0];

    // Initial covariance
    this.P = [
      [10,  0,   0,   0,   0,    0,    0],     // px
      [0,   10,  0,   0,   0,    0,    0],     // py
      [0,   0,   1,   0,   0,    0,    0],     // vx
      [0,   0,   0,   1,   0,    0,    0],     // vy
      [0,   0,   0,   0,   0.1,  0,    0],     // psi
      [0,   0,   0,   0,   0,    0.1,  0],     // b_ax
      [0,   0,   0,   0,   0,    0,    0.1],   // b_ay
    ];

    this.initialized = true;
  }

  /**
   * Prediction step (викликається кожен IMU sample, 25Hz)
   */
  predict(imu, dt) {
    if (!this.initialized) return;

    const [px, py, vx, vy, psi, b_ax, b_ay] = this.x;

    // IMU preprocessing (lateral_acc та longitudinal_acc вже в координатах авто)
    // ВИПРАВЛЕННЯ: RaceChrono має інвертовані знаки!
    // RaceChrono: lateral_acc +left/-right, yaw_rate +CCW/-CW
    // EKF очікує: lateral_acc +right, omega_z +CW
    const a_lateral = -imu.lateral_acc * CONFIG.G - b_ax;     // Інвертовано!
    const a_longitudinal = imu.longitudinal_acc * CONFIG.G - b_ay;
    const omega_z = -imu.yaw_rate * Math.PI / 180;            // Інвертовано!

    // Body → World transformation (ENU: East-North-Up)
    // psi = heading від North, за годинниковою стрілкою
    // При psi=0 (North): forward→North(+Y), right→East(+X)
    const cos_psi = Math.cos(psi);
    const sin_psi = Math.sin(psi);

    // Rotation matrix: body → world
    // ax_world (East)  = a_lateral * cos(psi) + a_longitudinal * sin(psi)
    // ay_world (North) = -a_lateral * sin(psi) + a_longitudinal * cos(psi)
    const ax_world = a_lateral * cos_psi + a_longitudinal * sin_psi;
    const ay_world = -a_lateral * sin_psi + a_longitudinal * cos_psi;

    // State prediction
    const px_new = px + vx * dt + 0.5 * ax_world * dt * dt;
    const py_new = py + vy * dt + 0.5 * ay_world * dt * dt;
    const vx_new = vx + ax_world * dt;
    const vy_new = vy + ay_world * dt;
    const psi_new = normalizeAngle(psi + omega_z * dt);
    const b_ax_new = b_ax;  // Bias random walk
    const b_ay_new = b_ay;

    // Jacobian F (7x7)
    const dt2 = dt * dt;

    // Partial derivatives of world acceleration w.r.t. psi
    // ax_world = a_lateral * cos(psi) + a_longitudinal * sin(psi)
    // ay_world = -a_lateral * sin(psi) + a_longitudinal * cos(psi)
    const dax_dpsi = -a_lateral * sin_psi + a_longitudinal * cos_psi;
    const day_dpsi = -a_lateral * cos_psi - a_longitudinal * sin_psi;

    const F = [
      [1, 0, dt, 0, dax_dpsi * dt2 * 0.5, -cos_psi * dt2 * 0.5, -sin_psi * dt2 * 0.5],
      [0, 1, 0, dt, day_dpsi * dt2 * 0.5, sin_psi * dt2 * 0.5, -cos_psi * dt2 * 0.5],
      [0, 0, 1, 0, dax_dpsi * dt, -cos_psi * dt, -sin_psi * dt],
      [0, 0, 0, 1, day_dpsi * dt, sin_psi * dt, -cos_psi * dt],
      [0, 0, 0, 0, 1, 0, 0],
      [0, 0, 0, 0, 0, 1, 0],
      [0, 0, 0, 0, 0, 0, 1],
    ];

    // Process noise Q
    const sa = CONFIG.ekf.sigma_accel;
    const sg = CONFIG.ekf.sigma_gyro;
    const sb = CONFIG.ekf.sigma_bias;

    const q_pos = sa * sa * dt2 * dt2 / 4;
    const q_vel = sa * sa * dt2;
    const q_psi = sg * sg * dt2;
    const q_bias = sb * sb * dt;

    const Q = [
      [q_pos, 0, 0, 0, 0, 0, 0],
      [0, q_pos, 0, 0, 0, 0, 0],
      [0, 0, q_vel, 0, 0, 0, 0],
      [0, 0, 0, q_vel, 0, 0, 0],
      [0, 0, 0, 0, q_psi, 0, 0],
      [0, 0, 0, 0, 0, q_bias, 0],
      [0, 0, 0, 0, 0, 0, q_bias],
    ];

    // Covariance prediction: P = F * P * F' + Q
    this.P = matadd(matmul(F, matmul(this.P, transpose(F))), Q);

    // Update state
    this.x = [px_new, py_new, vx_new, vy_new, psi_new, b_ax_new, b_ay_new];
  }

  /**
   * Update step (викликається коли є GPS, 1Hz)
   */
  update(gpsPoint) {
    if (!this.initialized) return;

    // GPS → local coordinates
    const { px: z_px, py: z_py } = gpsToLocal(gpsPoint.lat, gpsPoint.lon, this.lat0, this.lon0);

    // Measurement vector
    const z = [z_px, z_py];

    // Measurement matrix H (2x7)
    const H = [
      [1, 0, 0, 0, 0, 0, 0],
      [0, 1, 0, 0, 0, 0, 0],
    ];

    // Measurement noise R
    const r = gpsPoint.accuracy || CONFIG.ekf.gps_pos_noise;
    const R = [
      [r * r, 0],
      [0, r * r],
    ];

    // Innovation
    const h_x = [this.x[0], this.x[1]];
    const y = [z[0] - h_x[0], z[1] - h_x[1]];

    // Innovation covariance: S = H * P * H' + R
    const S = matadd(matmul(H, matmul(this.P, transpose(H))), R);

    // Kalman gain: K = P * H' * S^-1
    const K = matmul(matmul(this.P, transpose(H)), inverse(S));

    // State update: x = x + K * y
    const Ky = matvec(K, y);
    for (let i = 0; i < 7; i++) {
      this.x[i] += Ky[i];
    }
    this.x[4] = normalizeAngle(this.x[4]);

    // Covariance update: P = (I - K*H) * P
    const IKH = matsub(eye(7), matmul(K, H));
    this.P = matmul(IKH, this.P);
  }

  /**
   * Отримати поточну позицію в GPS координатах
   */
  getPosition() {
    if (!this.initialized) return null;
    const { lat, lon } = localToGps(this.x[0], this.x[1], this.lat0, this.lon0);
    return { lat, lon };
  }

  /**
   * Отримати швидкість (м/с)
   */
  getSpeed() {
    if (!this.initialized) return 0;
    return Math.sqrt(this.x[2] * this.x[2] + this.x[3] * this.x[3]);
  }
}

/**
 * Запуск Sensor Fusion
 */
function runSensorFusion(fullData, noisyGPS) {
  const ekf = new INSGPSFusion();
  const trajectory = [];

  // Знаходимо точку для ініціалізації (швидкість > threshold)
  let initIdx = 0;
  for (let i = 0; i < noisyGPS.length; i++) {
    if (noisyGPS[i].speed > CONFIG.ekf.min_speed_for_heading) {
      initIdx = i;
      break;
    }
  }

  ekf.initialize(noisyGPS[initIdx]);

  // Індекс поточного GPS вимірювання
  let gpsIdx = initIdx;
  let nextGpsTime = noisyGPS[gpsIdx + 1]?.timestamp ?? Infinity;

  // Починаємо з відповідного індексу в повних даних
  const startIdx = noisyGPS[initIdx].originalIndex || 0;

  for (let i = startIdx; i < fullData.length; i++) {
    const imu = fullData[i];
    const dt = 1 / CONFIG.sampling.imuHz;  // 0.04s

    // Prediction step (кожен IMU sample)
    ekf.predict(imu, dt);

    // Check if new GPS available
    if (imu.timestamp >= nextGpsTime && gpsIdx + 1 < noisyGPS.length) {
      gpsIdx++;
      ekf.update(noisyGPS[gpsIdx]);
      nextGpsTime = noisyGPS[gpsIdx + 1]?.timestamp ?? Infinity;
    }

    // Save trajectory point
    const pos = ekf.getPosition();
    if (pos) {
      trajectory.push({
        timestamp: imu.timestamp,
        lat: pos.lat,
        lon: pos.lon,
      });
    }
  }

  return trajectory;
}

// ============================================================================
// АНАЛІЗ ШВИДКОСТІ - ПОШУК ЕКСТРЕМУМІВ
// ============================================================================

/**
 * Знаходить локальні мінімуми та максимуми швидкості
 * @param {Array} data - масив точок з полем speed (м/с)
 * @param {number} windowSize - вікно згладжування (за замовчуванням 25 = 1 сек при 25Hz)
 * @param {number} minSpeedThreshold - мінімальний поріг швидкості (м/с)
 * @param {number} minDeltaKmh - мінімальна зміна швидкості між екстремумами (км/год)
 */
function findSpeedExtrema(data, windowSize = 25, minSpeedThreshold = 5, minDeltaKmh = 20) {
  const extrema = { minPoints: [], maxPoints: [] };

  if (data.length < windowSize * 2) return extrema;

  // Згладжування швидкості (moving average)
  const smoothed = data.map((p, i) => {
    const start = Math.max(0, i - windowSize);
    const end = Math.min(data.length, i + windowSize);
    const windowData = data.slice(start, end);
    return windowData.reduce((sum, pt) => sum + pt.speed, 0) / windowData.length;
  });

  // Крок 1: Знаходимо всі локальні екстремуми
  const allExtrema = [];
  for (let i = windowSize; i < data.length - windowSize; i++) {
    const prev = smoothed[i - 1];
    const curr = smoothed[i];
    const next = smoothed[i + 1];

    if (prev > curr && curr < next && curr > minSpeedThreshold) {
      allExtrema.push({ type: 'min', index: i, speed: smoothed[i], data: data[i] });
    }
    if (prev < curr && curr > next && curr > minSpeedThreshold) {
      allExtrema.push({ type: 'max', index: i, speed: smoothed[i], data: data[i] });
    }
  }

  // Крок 2: Об'єднуємо послідовні екстремуми одного типу (беремо найкращий)
  const merged = [];
  for (const ext of allExtrema) {
    if (merged.length === 0) {
      merged.push(ext);
      continue;
    }

    const last = merged[merged.length - 1];
    if (ext.type === last.type) {
      // Той самий тип — залишаємо кращий
      if ((ext.type === 'min' && ext.speed < last.speed) ||
          (ext.type === 'max' && ext.speed > last.speed)) {
        merged[merged.length - 1] = ext;
      }
    } else {
      merged.push(ext);
    }
  }

  // Крок 3: Ітеративно фільтруємо пари з малою дельтою
  const minDeltaMs = minDeltaKmh / 3.6;
  let changed = true;

  while (changed) {
    changed = false;

    // Шукаємо пару з малою дельтою
    for (let i = 0; i < merged.length - 1; i++) {
      const curr = merged[i];
      const next = merged[i + 1];

      if (curr.type !== next.type) {
        const delta = Math.abs(next.speed - curr.speed);
        if (delta < minDeltaMs) {
          merged.splice(i, 2); // видаляємо обидва
          changed = true;
          break;
        }
      }
    }

    // Об'єднуємо послідовні однакові типи (якщо з'явились після видалення)
    for (let i = 0; i < merged.length - 1; i++) {
      if (merged[i].type === merged[i + 1].type) {
        const curr = merged[i];
        const next = merged[i + 1];
        // Залишаємо кращий
        if ((curr.type === 'min' && next.speed < curr.speed) ||
            (curr.type === 'max' && next.speed > curr.speed)) {
          merged.splice(i, 1);
        } else {
          merged.splice(i + 1, 1);
        }
        changed = true;
        break;
      }
    }
  }

  // Крок 4: Формуємо результат
  for (const ext of merged) {
    const point = {
      lat: ext.data.lat,
      lon: ext.data.lon,
      speed: ext.data.speed,
      speedKmh: (ext.data.speed * 3.6).toFixed(1)
    };

    if (ext.type === 'min') {
      extrema.minPoints.push(point);
    } else {
      extrema.maxPoints.push(point);
    }
  }

  return extrema;
}

// ============================================================================
// ГЕНЕРАЦІЯ HTML КАРТИ
// ============================================================================

function generateHTML(data, filename) {
  const { allLapsData, selectedLapData, laps, selectedLap, config } = data;

  // Helper functions
  const downsample = (arr, ratio = 5) => (arr || []).filter((_, i) => i % ratio === 0);
  const toCoords = arr => (arr || []).map(p => [p.lat, p.lon]);

  // Prepare per-lap data for embedding
  const lapsMapData = {};
  for (const lap of laps) {
    const ld = allLapsData[lap];
    if (!ld) continue;
    lapsMapData[lap] = {
      groundTruth: toCoords(downsample(ld.groundTruth)),
      cleanGPS: toCoords(ld.cleanGPS),
      noisyGPS: toCoords(ld.noisyGPS),
      cleanLinear: toCoords(downsample(ld.cleanLinear)),
      cleanSpline: toCoords(downsample(ld.cleanSpline)),
      noisyLinear: toCoords(downsample(ld.noisyLinear)),
      noisySpline: toCoords(downsample(ld.noisySpline)),
      cleanMetrics: ld.cleanMetrics,
      noisyMetrics: ld.noisyMetrics,
      duration: ld.duration,
    };
  }

  // Bounds from all laps
  const allPoints = [];
  for (const lap of laps) {
    if (allLapsData[lap]) {
      allPoints.push(...allLapsData[lap].groundTruth);
    }
  }
  const lats = allPoints.map(p => p.lat);
  const lons = allPoints.map(p => p.lon);
  const bounds = [
    [Math.min(...lats), Math.min(...lons)],
    [Math.max(...lats), Math.max(...lons)]
  ];

  // Speed extrema for selected lap
  const speedExtrema = findSpeedExtrema(selectedLapData.groundTruth);
  console.log(`   Speed extrema: ${speedExtrema.minPoints.length} min, ${speedExtrema.maxPoints.length} max`);

  // Map data structure
  const mapData = {
    laps: laps,
    selectedLap: selectedLap,
    lapsData: lapsMapData,
    speedExtrema: speedExtrema,
  };

  const html = `<!DOCTYPE html>
<html>
<head>
  <title>GPS Track Smoothing - Comparison</title>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, sans-serif; }
    #map { height: 100vh; width: 100%; }

    .control-panel {
      position: absolute;
      top: 10px;
      right: 10px;
      z-index: 1000;
      background: white;
      padding: 16px;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
      max-width: 320px;
      max-height: 90vh;
      overflow-y: auto;
    }

    .control-panel h3 { margin: 0 0 12px 0; font-size: 16px; color: #1f2937; }
    .control-panel h4 { margin: 16px 0 8px 0; font-size: 13px; color: #6b7280; text-transform: uppercase; }

    .lap-selector {
      width: 100%;
      padding: 10px 12px;
      border: 2px solid #e5e7eb;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 500;
      background: white;
      cursor: pointer;
      margin-bottom: 12px;
    }
    .lap-selector:focus { outline: none; border-color: #3b82f6; }

    .mode-toggle {
      display: flex;
      gap: 8px;
      margin-bottom: 16px;
    }
    .mode-btn {
      flex: 1;
      padding: 10px;
      border: 2px solid #e5e7eb;
      border-radius: 6px;
      background: white;
      cursor: pointer;
      font-size: 13px;
      font-weight: 500;
      transition: all 0.2s;
    }
    .mode-btn:hover { border-color: #3b82f6; }
    .mode-btn.active { border-color: #3b82f6; background: #eff6ff; color: #1d4ed8; }

    .layer-checkbox {
      display: flex;
      align-items: center;
      padding: 6px 0;
      cursor: pointer;
    }
    .layer-checkbox input { margin-right: 10px; }
    .layer-checkbox .color-dot {
      width: 12px;
      height: 12px;
      border-radius: 50%;
      margin-right: 8px;
    }

    .metrics-table {
      width: 100%;
      font-size: 11px;
      border-collapse: collapse;
      margin-top: 8px;
    }
    .metrics-table th, .metrics-table td {
      padding: 6px 8px;
      text-align: left;
      border-bottom: 1px solid #e5e7eb;
    }
    .metrics-table th { font-weight: 600; color: #6b7280; }
    .metrics-table .best { background: #dcfce7; }

    .speed-marker {
      font-size: 11px;
      font-weight: bold;
      text-align: center;
      border-radius: 4px;
      padding: 2px 4px;
      white-space: nowrap;
    }
    .speed-min { background: #fee2e2; color: #dc2626; border: 1px solid #dc2626; }
    .speed-max { background: #dcfce7; color: #16a34a; border: 1px solid #16a34a; }

    .info-footer {
      margin-top: 16px;
      padding-top: 12px;
      border-top: 1px solid #e5e7eb;
      font-size: 11px;
      color: #6b7280;
    }
    .info-footer p { margin: 4px 0; }
  </style>
</head>
<body>
  <div id="map"></div>

  <div class="control-panel">
    <h3>GPS Track Smoothing</h3>

    <h4>Lap Selection</h4>
    <select class="lap-selector" id="lap-selector" onchange="changeLap(this.value)">
      ${laps.map(l => `<option value="${l}" ${l === selectedLap ? 'selected' : ''}>Lap ${l}</option>`).join('')}
    </select>

    <h4>GPS Mode</h4>
    <div class="mode-toggle">
      <button class="mode-btn active" onclick="setMode('clean')">Clean GPS</button>
      <button class="mode-btn" onclick="setMode('noisy')">Noisy GPS</button>
    </div>

    <h4>Layers</h4>
    <div id="layer-controls"></div>

    <h4>Metrics (RMSE)</h4>
    <div id="metrics-container"></div>

    <div class="info-footer">
      <p><strong>Lap:</strong> <span id="info-lap">${selectedLap}</span></p>
      <p><strong>Duration:</strong> <span id="info-duration">-</span></p>
      <p><strong>GPS Points:</strong> <span id="info-gps">-</span></p>
      <p><strong>Noise:</strong> ${config.noise.minMeters}-${config.noise.maxMeters}m</p>
    </div>
  </div>

  <script>
    // Map data
    const DATA = ${JSON.stringify(mapData)};

    // Initialize map
    const map = L.map('map');
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap',
      maxZoom: 21,
      maxNativeZoom: 19
    }).addTo(map);
    map.fitBounds(${JSON.stringify(bounds)}, { padding: [30, 30] });

    // State
    let currentLap = DATA.selectedLap;
    let currentMode = 'clean';
    let leafletLayers = {};

    // Layer definitions
    const LAYERS = {
      groundTruth: { label: 'Ground Truth', color: '#22c55e', visible: true },
      gpsPoints: { label: 'GPS Points', color: '#ef4444', visible: true },
      linear: { label: 'Linear Interp.', color: '#f97316', visible: false },
      spline: { label: 'Spline', color: '#2563eb', visible: true },
    };

    // Get current lap data
    function getLapData() {
      return DATA.lapsData[currentLap] || DATA.lapsData[DATA.laps[0]];
    }

    // Create layers for current lap
    function createLayers() {
      Object.values(leafletLayers).forEach(l => map.removeLayer(l));
      leafletLayers = {};

      const ld = getLapData();
      if (!ld) return;

      const prefix = currentMode === 'clean' ? 'clean' : 'noisy';

      // Ground Truth
      leafletLayers.groundTruth = L.polyline(ld.groundTruth, {
        color: '#22c55e', weight: 2, opacity: 0.7
      });

      // GPS Points
      const gpsData = currentMode === 'clean' ? ld.cleanGPS : ld.noisyGPS;
      leafletLayers.gpsPoints = L.layerGroup();
      gpsData.forEach((c, i) => {
        L.circleMarker(c, {
          radius: 5, color: '#dc2626', fillColor: '#ef4444', fillOpacity: 0.8, weight: 2
        }).bindPopup('GPS #' + (i+1)).addTo(leafletLayers.gpsPoints);
      });

      // Algorithms
      leafletLayers.linear = L.polyline(ld[prefix + 'Linear'], {
        color: '#f97316', weight: 2, opacity: 0.8, dashArray: '5, 5'
      });
      leafletLayers.spline = L.polyline(ld[prefix + 'Spline'], {
        color: '#2563eb', weight: 3, opacity: 0.9
      });

      // Add visible layers
      Object.keys(LAYERS).forEach(key => {
        if (LAYERS[key].visible && leafletLayers[key]) {
          leafletLayers[key].addTo(map);
        }
      });

      // Fit bounds to this lap
      if (ld.groundTruth.length > 0) {
        map.fitBounds(ld.groundTruth, { padding: [30, 30] });
      }
    }

    // Toggle layer visibility
    function toggleLayer(key, visible) {
      LAYERS[key].visible = visible;
      if (visible && leafletLayers[key]) {
        leafletLayers[key].addTo(map);
      } else if (leafletLayers[key]) {
        map.removeLayer(leafletLayers[key]);
      }
    }

    // Change lap
    function changeLap(lap) {
      currentLap = parseInt(lap);
      createLayers();
      updateMetrics();
      updateInfo();
    }

    // Set mode (clean/noisy)
    function setMode(mode) {
      currentMode = mode;
      document.querySelectorAll('.mode-btn').forEach(btn => {
        btn.classList.toggle('active', btn.textContent.toLowerCase().includes(mode));
      });
      createLayers();
      updateMetrics();
    }

    // Update metrics table
    function updateMetrics() {
      const ld = getLapData();
      if (!ld) return;

      const metrics = currentMode === 'clean' ? ld.cleanMetrics : ld.noisyMetrics;
      const entries = Object.entries(metrics);
      if (entries.length === 0) return;

      const sorted = entries.sort((a, b) => a[1].rmse - b[1].rmse);
      const bestKey = sorted[0][0];

      const html = '<table class="metrics-table"><tr><th>Algorithm</th><th>RMSE</th><th>MAE</th></tr>' +
        entries.map(([key, m]) =>
          '<tr class="' + (key === bestKey ? 'best' : '') + '">' +
          '<td>' + key.charAt(0).toUpperCase() + key.slice(1) + '</td>' +
          '<td>' + m.rmse.toFixed(2) + 'm</td>' +
          '<td>' + m.mae.toFixed(2) + 'm</td></tr>'
        ).join('') + '</table>';

      document.getElementById('metrics-container').innerHTML = html;
    }

    // Update info panel
    function updateInfo() {
      const ld = getLapData();
      if (!ld) return;

      document.getElementById('info-lap').textContent = currentLap;
      document.getElementById('info-duration').textContent = (ld.duration / 60).toFixed(1) + ' min';
      document.getElementById('info-gps').textContent = ld.cleanGPS.length + ' pts';
    }

    // Build layer controls
    function buildControls() {
      const container = document.getElementById('layer-controls');
      container.innerHTML = Object.entries(LAYERS).map(([key, cfg]) =>
        '<label class="layer-checkbox">' +
        '<input type="checkbox" ' + (cfg.visible ? 'checked' : '') +
        ' onchange="toggleLayer(\\'' + key + '\\', this.checked)">' +
        '<span class="color-dot" style="background: ' + cfg.color + ';"></span>' +
        '<span>' + cfg.label + '</span></label>'
      ).join('');
    }

    // Initialize
    buildControls();
    createLayers();
    updateMetrics();
    updateInfo();
  </script>
</body>
</html>`;

  fs.writeFileSync(filename, html);
  console.log(`   Карта: ${filename}`);
}

// ============================================================================
// EKF EXPERIMENTS
// ============================================================================

/**
 * Запускає EKF з заданими параметрами та повертає метрики
 */
function runEkfExperiment(fullData, noisyGPS, ekfConfig) {
  // Зберігаємо оригінальні параметри
  const originalConfig = { ...CONFIG.ekf };

  // Застосовуємо експериментальні параметри
  Object.assign(CONFIG.ekf, ekfConfig);

  // Запускаємо EKF
  const ekfResult = runSensorFusion(fullData, noisyGPS);

  // Обчислюємо метрики
  const metrics = calculateAccuracyMetrics(fullData, ekfResult);

  // Відновлюємо оригінальні параметри
  Object.assign(CONFIG.ekf, originalConfig);

  return metrics;
}

/**
 * Запускає серію експериментів з різними конфігураціями EKF
 */
function runEkfExperiments(fullData, noisyGPS) {
  const experiments = [
    { label: 'Default', sigma_accel: 0.5, sigma_gyro: 0.02, sigma_bias: 0.001, gps_pos_noise: 5.0 },
    { label: 'Trust GPS more', sigma_accel: 2.0, sigma_gyro: 0.1, sigma_bias: 0.001, gps_pos_noise: 2.0 },
    { label: 'Trust IMU more', sigma_accel: 0.1, sigma_gyro: 0.01, sigma_bias: 0.01, gps_pos_noise: 15.0 },
    { label: 'High bias adapt', sigma_accel: 0.5, sigma_gyro: 0.02, sigma_bias: 0.1, gps_pos_noise: 5.0 },
    { label: 'Very high GPS trust', sigma_accel: 5.0, sigma_gyro: 0.2, sigma_bias: 0.001, gps_pos_noise: 1.0 },
    { label: 'Balanced v2', sigma_accel: 1.0, sigma_gyro: 0.05, sigma_bias: 0.01, gps_pos_noise: 3.0 },
    { label: 'Low accel noise', sigma_accel: 0.2, sigma_gyro: 0.02, sigma_bias: 0.01, gps_pos_noise: 5.0 },
    { label: 'High accel noise', sigma_accel: 3.0, sigma_gyro: 0.05, sigma_bias: 0.001, gps_pos_noise: 3.0 },
  ];

  const results = [];

  for (const exp of experiments) {
    const config = {
      sigma_accel: exp.sigma_accel,
      sigma_gyro: exp.sigma_gyro,
      sigma_bias: exp.sigma_bias,
      gps_pos_noise: exp.gps_pos_noise,
    };

    const metrics = runEkfExperiment(fullData, noisyGPS, config);
    results.push({ ...exp, ...metrics });
  }

  // Сортуємо за RMSE
  results.sort((a, b) => a.rmse - b.rmse);

  return results;
}

// ============================================================================
// HELPER: RUN ALL ALGORITHMS
// ============================================================================

/**
 * Runs all interpolation algorithms on given GPS data
 * @param {Array} fullData - Ground truth data (25Hz)
 * @param {Array} gpsData - GPS data to interpolate (1Hz)
 * @returns {Object} { linear, spline, ekfRaw, ekfSmooth, ekfBest, metrics }
 */
function runAllAlgorithms(fullData, gpsData) {
  // Linear interpolation
  const linear = applyLinearInterpolation(fullData, gpsData);

  // Spline interpolation
  const spline = applySplineInterpolation(fullData, gpsData);

  // EKF raw
  const ekfRaw = runSensorFusion(fullData, gpsData);

  // EKF + Spline smoothing
  const ekfSmooth = smoothTrajectoryWithSpline(ekfRaw, CONFIG.sampling.imuHz);

  // EKF experiments to find best config
  const ekfExperiments = runEkfExperiments(fullData, gpsData);
  const bestConfig = ekfExperiments[0];

  // Run EKF with best config
  const originalEkfConfig = { ...CONFIG.ekf };
  Object.assign(CONFIG.ekf, {
    sigma_accel: bestConfig.sigma_accel,
    sigma_gyro: bestConfig.sigma_gyro,
    sigma_bias: bestConfig.sigma_bias,
    gps_pos_noise: bestConfig.gps_pos_noise,
  });
  const ekfBest = runSensorFusion(fullData, gpsData);
  Object.assign(CONFIG.ekf, originalEkfConfig);

  // Calculate metrics
  const metrics = {
    linear: calculateAccuracyMetrics(fullData, linear),
    spline: calculateAccuracyMetrics(fullData, spline),
    ekfRaw: calculateAccuracyMetrics(fullData, ekfRaw),
    ekfSmooth: calculateAccuracyMetrics(fullData, ekfSmooth),
    ekfBest: { ...calculateAccuracyMetrics(fullData, ekfBest), config: bestConfig },
  };

  return { linear, spline, ekfRaw, ekfSmooth, ekfBest, metrics };
}

/**
 * Prints metrics table to console
 */
function printMetricsTable(metrics, label) {
  console.log(`\n   📊 ${label}`);
  console.log('   ┌─────────────────────┬──────────┬──────────┬──────────┐');
  console.log('   │ Algorithm           │ RMSE (m) │ MAE (m)  │ Max (m)  │');
  console.log('   ├─────────────────────┼──────────┼──────────┼──────────┤');
  console.log(`   │ Linear              │ ${metrics.linear.rmse.toFixed(3).padStart(8)} │ ${metrics.linear.mae.toFixed(3).padStart(8)} │ ${metrics.linear.maxError.toFixed(3).padStart(8)} │`);
  console.log(`   │ Spline (Catmull-Rom)│ ${metrics.spline.rmse.toFixed(3).padStart(8)} │ ${metrics.spline.mae.toFixed(3).padStart(8)} │ ${metrics.spline.maxError.toFixed(3).padStart(8)} │`);
  console.log(`   │ EKF Raw             │ ${metrics.ekfRaw.rmse.toFixed(3).padStart(8)} │ ${metrics.ekfRaw.mae.toFixed(3).padStart(8)} │ ${metrics.ekfRaw.maxError.toFixed(3).padStart(8)} │`);
  console.log(`   │ EKF + Spline        │ ${metrics.ekfSmooth.rmse.toFixed(3).padStart(8)} │ ${metrics.ekfSmooth.mae.toFixed(3).padStart(8)} │ ${metrics.ekfSmooth.maxError.toFixed(3).padStart(8)} │`);
  console.log(`   │ EKF Best Config     │ ${metrics.ekfBest.rmse.toFixed(3).padStart(8)} │ ${metrics.ekfBest.mae.toFixed(3).padStart(8)} │ ${metrics.ekfBest.maxError.toFixed(3).padStart(8)} │`);
  console.log('   └─────────────────────┴──────────┴──────────┴──────────┘');
}

// ============================================================================
// ГОЛОВНА ФУНКЦІЯ
// ============================================================================

/**
 * Process a single lap and return results
 */
function processLap(fullDataRaw, lapNumber) {
  // Filter data for this lap
  const lapData = fullDataRaw.filter(p => p.lap === lapNumber);
  if (lapData.length === 0) return null;

  // Normalize timestamps
  const t0 = lapData[0].timestamp;
  lapData.forEach(p => p.timestamp -= t0);

  // Downsample GPS
  const gpsDownsampled = downsampleGPS(lapData);

  // Clean GPS
  const cleanOutlierResult = filterGPSOutliers(gpsDownsampled);
  const cleanGPS = cleanOutlierResult.filtered;

  // Noisy GPS
  const noisyGPSRaw = addGPSNoise(gpsDownsampled);
  const noisyOutlierResult = filterGPSOutliers(noisyGPSRaw);
  const noisyGPS = noisyOutlierResult.filtered;

  // Run algorithms (simplified - only Linear and Spline for speed)
  const cleanLinear = applyLinearInterpolation(lapData, cleanGPS);
  const cleanSpline = applySplineInterpolation(lapData, cleanGPS);
  const noisyLinear = applyLinearInterpolation(lapData, noisyGPS);
  const noisySpline = applySplineInterpolation(lapData, noisyGPS);

  return {
    lap: lapNumber,
    groundTruth: lapData,
    cleanGPS,
    noisyGPS,
    cleanLinear,
    cleanSpline,
    noisyLinear,
    noisySpline,
    cleanMetrics: {
      linear: calculateAccuracyMetrics(lapData, cleanLinear),
      spline: calculateAccuracyMetrics(lapData, cleanSpline),
    },
    noisyMetrics: {
      linear: calculateAccuracyMetrics(lapData, noisyLinear),
      spline: calculateAccuracyMetrics(lapData, noisySpline),
    },
    duration: lapData[lapData.length - 1].timestamp,
  };
}

async function main() {
  console.log('╔═══════════════════════════════════════════════════════════════════╗');
  console.log('║       GPS Track Smoothing - INS/GPS Sensor Fusion PoC            ║');
  console.log('╚═══════════════════════════════════════════════════════════════════╝\n');

  // 1. Read RaceChrono data
  console.log('📂 1. Reading RaceChrono data');
  const fullDataRaw = await readRaceChronoCSV(CONFIG.input.file);

  // Find unique laps
  const laps = [...new Set(fullDataRaw.map(p => p.lap))].filter(n => n > 0).sort((a, b) => a - b);
  console.log(`   Laps available: ${laps.join(', ') || 'none'}`);

  // 2. Process all laps
  console.log('\n📱 2. Processing all laps for map...');
  const allLapsData = {};
  for (const lap of laps) {
    process.stdout.write(`   Lap ${lap}...`);
    allLapsData[lap] = processLap(fullDataRaw, lap);
    console.log(` ${allLapsData[lap].groundTruth.length} points`);
  }

  // 3. Detailed analysis for selected lap (or lap 1)
  const selectedLap = parseInt(process.argv[2]) || laps[0];
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`📊 3. DETAILED ANALYSIS - Lap ${selectedLap}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // Get full data for selected lap
  const fullData = fullDataRaw.filter(p => p.lap === selectedLap);
  const t0 = fullData[0].timestamp;
  fullData.forEach(p => p.timestamp -= t0);

  const gpsDownsampled = downsampleGPS(fullData);
  const cleanOutliers = filterGPSOutliers(gpsDownsampled);
  const cleanGPS = cleanOutliers.filtered;
  const noisyGPSRaw = addGPSNoise(gpsDownsampled);
  const noisyOutliers = filterGPSOutliers(noisyGPSRaw);
  const noisyGPS = noisyOutliers.filtered;

  console.log(`   Duration: ${(fullData[fullData.length - 1].timestamp / 60).toFixed(1)} min`);
  console.log(`   GPS points: ${gpsDownsampled.length}`);
  console.log(`   Outliers detected (clean): ${cleanOutliers.outliers.length} (${(cleanOutliers.outliers.length / gpsDownsampled.length * 100).toFixed(1)}%)`);
  console.log(`   Outliers detected (noisy): ${noisyOutliers.outliers.length} (${(noisyOutliers.outliers.length / gpsDownsampled.length * 100).toFixed(1)}%)`);

  // Run full algorithms with EKF
  console.log('\n   Running full analysis with EKF...');
  const cleanResults = runAllAlgorithms(fullData, cleanGPS);
  const noisyResults = runAllAlgorithms(fullData, noisyGPS);

  printMetricsTable(cleanResults.metrics, 'Clean GPS Results');
  printMetricsTable(noisyResults.metrics, `Noisy GPS Results (${CONFIG.noise.minMeters}-${CONFIG.noise.maxMeters}m)`);

  // Comparison summary
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📈 4. COMPARISON SUMMARY');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  console.log('\n   ┌─────────────────────┬────────────────┬────────────────┬────────────┐');
  console.log('   │ Algorithm           │ Clean RMSE (m) │ Noisy RMSE (m) │ Δ (m)      │');
  console.log('   ├─────────────────────┼────────────────┼────────────────┼────────────┤');

  const algorithms = ['linear', 'spline', 'ekfRaw', 'ekfSmooth', 'ekfBest'];
  const labels = ['Linear', 'Spline (Catmull-Rom)', 'EKF Raw', 'EKF + Spline', 'EKF Best Config'];

  for (let i = 0; i < algorithms.length; i++) {
    const alg = algorithms[i];
    const cleanRmse = cleanResults.metrics[alg].rmse;
    const noisyRmse = noisyResults.metrics[alg].rmse;
    const delta = noisyRmse - cleanRmse;
    const deltaStr = delta >= 0 ? `+${delta.toFixed(3)}` : delta.toFixed(3);
    console.log(`   │ ${labels[i].padEnd(19)} │ ${cleanRmse.toFixed(3).padStart(14)} │ ${noisyRmse.toFixed(3).padStart(14)} │ ${deltaStr.padStart(10)} │`);
  }

  console.log('   └─────────────────────┴────────────────┴────────────────┴────────────┘');

  const bestClean = Object.entries(cleanResults.metrics).sort((a, b) => a[1].rmse - b[1].rmse)[0];
  const bestNoisy = Object.entries(noisyResults.metrics).sort((a, b) => a[1].rmse - b[1].rmse)[0];
  console.log(`\n   🏆 Best for Clean GPS: ${bestClean[0]} (RMSE=${bestClean[1].rmse.toFixed(3)}m)`);
  console.log(`   🏆 Best for Noisy GPS: ${bestNoisy[0]} (RMSE=${bestNoisy[1].rmse.toFixed(3)}m)`);

  // 5. Generate HTML map with ALL laps
  console.log('\n🗺️  5. Generating HTML map with lap selector');
  generateHTML({
    allLapsData: allLapsData,
    selectedLapData: {
      groundTruth: fullData,
      cleanGPS,
      noisyGPS,
      cleanResults,
      noisyResults,
    },
    laps: laps,
    selectedLap: selectedLap,
    config: CONFIG,
  }, 'map.html');

  console.log('\n╔═══════════════════════════════════════════════════════════════════╗');
  console.log('║                           ✅ Done!                                ║');
  console.log('╚═══════════════════════════════════════════════════════════════════╝');
}

main().catch(err => {
  console.error('❌ Помилка:', err);
  process.exit(1);
});
