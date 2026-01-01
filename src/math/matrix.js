/**
 * Matrix operations for Kalman filter and EKF computations.
 * Uses ml-matrix library for robust numerical operations.
 * @module math/matrix
 */

import { Matrix, inverse as mlInverse } from 'ml-matrix';

/**
 * Creates a matrix of given dimensions filled with a value.
 * @param {number} rows - Number of rows
 * @param {number} cols - Number of columns
 * @param {number} [fill=0] - Fill value
 * @returns {number[][]} The created matrix
 */
export function createMatrix(rows, cols, fill = 0) {
  if (fill === 0) {
    return Matrix.zeros(rows, cols).to2DArray();
  }
  return new Matrix(rows, cols).fill(fill).to2DArray();
}

/**
 * Creates an identity matrix of size n.
 * @param {number} n - Matrix dimension
 * @returns {number[][]} Identity matrix
 */
export function eye(n) {
  return Matrix.eye(n, n).to2DArray();
}

/**
 * Transposes a matrix.
 * @param {number[][]} A - Input matrix
 * @returns {number[][]} Transposed matrix
 */
export function transpose(A) {
  return new Matrix(A).transpose().to2DArray();
}

/**
 * Multiplies two matrices A * B.
 * @param {number[][]} A - Left matrix
 * @param {number[][]} B - Right matrix
 * @returns {number[][]} Result matrix
 */
export function matmul(A, B) {
  return new Matrix(A).mmul(new Matrix(B)).to2DArray();
}

/**
 * Adds two matrices element-wise.
 * @param {number[][]} A - First matrix
 * @param {number[][]} B - Second matrix
 * @returns {number[][]} Sum matrix
 */
export function matadd(A, B) {
  return Matrix.add(new Matrix(A), new Matrix(B)).to2DArray();
}

/**
 * Subtracts matrix B from matrix A element-wise.
 * @param {number[][]} A - First matrix
 * @param {number[][]} B - Second matrix
 * @returns {number[][]} Difference matrix
 */
export function matsub(A, B) {
  return Matrix.sub(new Matrix(A), new Matrix(B)).to2DArray();
}

/**
 * Multiplies a matrix by a vector.
 * @param {number[][]} M - Matrix
 * @param {number[]} v - Vector
 * @returns {number[]} Result vector
 */
export function matvec(M, v) {
  const colVector = Matrix.columnVector(v);
  return new Matrix(M).mmul(colVector).to1DArray();
}

/**
 * Computes the inverse of a matrix.
 * @param {number[][]} M - Input matrix
 * @returns {number[][]} Inverse matrix (or identity if singular)
 */
export function inverse(M) {
  try {
    return mlInverse(new Matrix(M)).to2DArray();
  } catch (e) {
    console.warn('Warning: Near-singular matrix in inverse');
    return eye(M.length);
  }
}
