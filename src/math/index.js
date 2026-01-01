/**
 * Math utilities barrel export.
 * @module math
 */

export {
  createMatrix,
  eye,
  transpose,
  matmul,
  matadd,
  matsub,
  matvec,
  inverse,
} from './matrix.js';

export {
  gaussianRandom,
  gpsToLocal,
  localToGps,
  normalizeAngle,
  haversineDistance,
} from './geometry.js';
