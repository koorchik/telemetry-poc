/**
 * Catmull-Rom spline interpolation for GPS trajectories.
 * @module interpolation/spline
 */

/**
 * Catmull-Rom spline basis function evaluation.
 * @param {number} p0 - Control point before segment start
 * @param {number} p1 - Segment start
 * @param {number} p2 - Segment end
 * @param {number} p3 - Control point after segment end
 * @param {number} t - Parameter [0, 1]
 * @returns {number} Interpolated value
 */
export function catmullRom(p0, p1, p2, p3, t) {
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
 * Applies Catmull-Rom spline interpolation to GPS points.
 * @param {Array} fullData - Full data with timestamps
 * @param {Array} noisyGPS - GPS points (1Hz)
 * @returns {Array} Interpolated trajectory at fullData timestamps
 */
export function applySplineInterpolation(fullData, noisyGPS) {
  if (noisyGPS.length < 2) return noisyGPS;

  const result = [];
  const startIdx = noisyGPS[0].originalIndex || 0;

  // For each fullData point, find corresponding GPS segment
  for (let i = startIdx; i < fullData.length; i++) {
    const t = fullData[i].timestamp;

    // Find segment [gpsIdx, gpsIdx+1] where t falls
    let gpsIdx = 0;
    while (gpsIdx < noisyGPS.length - 1 && noisyGPS[gpsIdx + 1].timestamp <= t) {
      gpsIdx++;
    }

    if (gpsIdx >= noisyGPS.length - 1) {
      // Beyond GPS data
      result.push({
        timestamp: t,
        lat: noisyGPS[noisyGPS.length - 1].lat,
        lon: noisyGPS[noisyGPS.length - 1].lon
      });
      continue;
    }

    // 4 points for Catmull-Rom: p0, p1, p2, p3
    const i0 = Math.max(0, gpsIdx - 1);
    const i1 = gpsIdx;
    const i2 = Math.min(noisyGPS.length - 1, gpsIdx + 1);
    const i3 = Math.min(noisyGPS.length - 1, gpsIdx + 2);

    // Parameter u ∈ [0, 1] within segment [i1, i2]
    const t0 = noisyGPS[i1].timestamp;
    const t1 = noisyGPS[i2].timestamp;
    const u = (t - t0) / (t1 - t0);

    // Interpolation
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
 * Smooths a trajectory using Catmull-Rom spline.
 * Downsamples to control points, then interpolates back.
 * @param {Array} trajectory - Array of points [{timestamp, lat, lon}]
 * @param {number} [downsampleRatio=25] - Every Nth point becomes control point (25 for 25Hz→1Hz)
 * @returns {Array} Smoothed trajectory
 */
export function smoothTrajectoryWithSpline(trajectory, downsampleRatio = 25) {
  if (trajectory.length < downsampleRatio * 2) return trajectory;

  // Downsample: take every Nth point as control point
  const controlPoints = [];
  for (let i = 0; i < trajectory.length; i += downsampleRatio) {
    controlPoints.push(trajectory[i]);
  }
  // Add last point if not included
  if (controlPoints[controlPoints.length - 1] !== trajectory[trajectory.length - 1]) {
    controlPoints.push(trajectory[trajectory.length - 1]);
  }

  if (controlPoints.length < 4) return trajectory;

  // Interpolate each point of original trajectory
  const result = [];

  for (const point of trajectory) {
    const t = point.timestamp;

    // Find control point segment
    let idx = 0;
    while (idx < controlPoints.length - 1 && controlPoints[idx + 1].timestamp <= t) {
      idx++;
    }

    if (idx >= controlPoints.length - 1) {
      result.push({ ...point });
      continue;
    }

    // 4 points for Catmull-Rom
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
