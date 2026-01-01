/**
 * Speed extrema detection (min/max speed points).
 * @module analysis/speed-extrema
 */

/**
 * @typedef {Object} SpeedPoint
 * @property {number} lat - Latitude
 * @property {number} lon - Longitude
 * @property {number} speed - Speed in m/s
 * @property {string} speedKmh - Speed in km/h (formatted)
 */

/**
 * @typedef {Object} SpeedExtrema
 * @property {SpeedPoint[]} minPoints - Local minimum speed points
 * @property {SpeedPoint[]} maxPoints - Local maximum speed points
 */

/**
 * Finds local minima and maxima of speed in telemetry data.
 * Uses moving average smoothing and delta filtering.
 * @param {Array} data - Array of points with speed field (m/s)
 * @param {number} [windowSize=25] - Smoothing window (25 = 1 sec at 25Hz)
 * @param {number} [minSpeedThreshold=5] - Minimum speed threshold (m/s)
 * @param {number} [minDeltaKmh=20] - Minimum speed change between extrema (km/h)
 * @returns {SpeedExtrema} Object with minPoints and maxPoints arrays
 */
export function findSpeedExtrema(data, windowSize = 25, minSpeedThreshold = 5, minDeltaKmh = 20) {
  const extrema = { minPoints: [], maxPoints: [] };

  if (data.length < windowSize * 2) return extrema;

  // Speed smoothing (moving average)
  const smoothed = data.map((p, i) => {
    const start = Math.max(0, i - windowSize);
    const end = Math.min(data.length, i + windowSize);
    const windowData = data.slice(start, end);
    return windowData.reduce((sum, pt) => sum + pt.speed, 0) / windowData.length;
  });

  // Step 1: Find all local extrema
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

  // Step 2: Merge consecutive extrema of same type (keep best)
  const merged = [];
  for (const ext of allExtrema) {
    if (merged.length === 0) {
      merged.push(ext);
      continue;
    }

    const last = merged[merged.length - 1];
    if (ext.type === last.type) {
      // Same type - keep the better one
      if ((ext.type === 'min' && ext.speed < last.speed) ||
          (ext.type === 'max' && ext.speed > last.speed)) {
        merged[merged.length - 1] = ext;
      }
    } else {
      merged.push(ext);
    }
  }

  // Step 3: Iteratively filter pairs with small delta
  const minDeltaMs = minDeltaKmh / 3.6;
  let changed = true;

  while (changed) {
    changed = false;

    // Find pair with small delta
    for (let i = 0; i < merged.length - 1; i++) {
      const curr = merged[i];
      const next = merged[i + 1];

      if (curr.type !== next.type) {
        const delta = Math.abs(next.speed - curr.speed);
        if (delta < minDeltaMs) {
          merged.splice(i, 2); // remove both
          changed = true;
          break;
        }
      }
    }

    // Merge consecutive same types (if created after removal)
    for (let i = 0; i < merged.length - 1; i++) {
      if (merged[i].type === merged[i + 1].type) {
        const curr = merged[i];
        const next = merged[i + 1];
        // Keep the better one
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

  // Step 4: Format result
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
