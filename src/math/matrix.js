/**
 * Matrix operations for Kalman filter and EKF computations.
 * Pure JavaScript implementations without external dependencies.
 * @module math/matrix
 */

/**
 * Creates a matrix of given dimensions filled with a value.
 * @param {number} rows - Number of rows
 * @param {number} cols - Number of columns
 * @param {number} [fill=0] - Fill value
 * @returns {number[][]} The created matrix
 */
export function createMatrix(rows, cols, fill = 0) {
  return Array(rows).fill(null).map(() => Array(cols).fill(fill));
}

/**
 * Creates an identity matrix of size n.
 * @param {number} n - Matrix dimension
 * @returns {number[][]} Identity matrix
 */
export function eye(n) {
  const I = createMatrix(n, n, 0);
  for (let i = 0; i < n; i++) I[i][i] = 1;
  return I;
}

/**
 * Transposes a matrix.
 * @param {number[][]} A - Input matrix
 * @returns {number[][]} Transposed matrix
 */
export function transpose(A) {
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
 * Multiplies two matrices A * B.
 * @param {number[][]} A - Left matrix
 * @param {number[][]} B - Right matrix
 * @returns {number[][]} Result matrix
 */
export function matmul(A, B) {
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
 * Adds two matrices element-wise.
 * @param {number[][]} A - First matrix
 * @param {number[][]} B - Second matrix
 * @returns {number[][]} Sum matrix
 */
export function matadd(A, B) {
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
 * Subtracts matrix B from matrix A element-wise.
 * @param {number[][]} A - First matrix
 * @param {number[][]} B - Second matrix
 * @returns {number[][]} Difference matrix
 */
export function matsub(A, B) {
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
 * Multiplies a matrix by a vector.
 * @param {number[][]} M - Matrix
 * @param {number[]} v - Vector
 * @returns {number[]} Result vector
 */
export function matvec(M, v) {
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
 * Computes the inverse of a matrix using Gauss-Jordan elimination.
 * @param {number[][]} M - Input matrix
 * @returns {number[][]} Inverse matrix (or identity if singular)
 */
export function inverse(M) {
  const n = M.length;
  const A = M.map(row => [...row]);
  const I = eye(n);

  for (let i = 0; i < n; i++) {
    // Find pivot (maximum element in column)
    let maxRow = i;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(A[k][i]) > Math.abs(A[maxRow][i])) maxRow = k;
    }
    [A[i], A[maxRow]] = [A[maxRow], A[i]];
    [I[i], I[maxRow]] = [I[maxRow], I[i]];

    const pivot = A[i][i];
    if (Math.abs(pivot) < 1e-12) {
      console.warn('Warning: Near-singular matrix in inverse');
      return eye(n);
    }

    // Normalize row
    for (let j = 0; j < n; j++) {
      A[i][j] /= pivot;
      I[i][j] /= pivot;
    }

    // Eliminate column
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
