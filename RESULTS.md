# GPS Track Smoothing - Benchmark Results

Generated: 2026-01-01

## Configuration

- **GPS Frequency:** 1 Hz (downsampled from 25 Hz)
- **Ground Truth:** RaceChrono data at 25 Hz
- **Algorithms:** Linear Interpolation, Catmull-Rom Spline
- **Laps:** 1, 2, 3, 4, 5

## Summary (Average RMSE across all laps)

| Noise Level | Linear RMSE (m) | Spline RMSE (m) | Best |
|-------------|-----------------|-----------------|------|
| Clean GPS | 0.443 | 0.392 | Spline |
| Light Noise (1-3m) | 2.360 | 2.579 | Linear |
| Medium Noise (3-8m) | 6.526 | 7.174 | Linear |
| Heavy Noise (5-15m) | 11.362 | 12.544 | Linear |

## Detailed Results by Lap

### Lap 1

| Noise Level | Linear RMSE | Linear MAE | Spline RMSE | Spline MAE |
|-------------|-------------|------------|-------------|------------|
| Clean GPS | 0.837m | 0.204m | 0.822m | 0.080m |
| Light Noise (1-3m) | 2.431m | 2.025m | 2.654m | 2.243m |
| Medium Noise (3-8m) | 6.477m | 5.762m | 7.152m | 6.377m |
| Heavy Noise (5-15m) | 11.801m | 10.370m | 12.975m | 11.445m |

### Lap 2

| Noise Level | Linear RMSE | Linear MAE | Spline RMSE | Spline MAE |
|-------------|-------------|------------|-------------|------------|
| Clean GPS | 0.791m | 0.249m | 0.765m | 0.085m |
| Light Noise (1-3m) | 2.378m | 2.062m | 2.596m | 2.258m |
| Medium Noise (3-8m) | 6.500m | 5.621m | 7.113m | 6.182m |
| Heavy Noise (5-15m) | 12.041m | 10.703m | 13.211m | 11.795m |

### Lap 3

| Noise Level | Linear RMSE | Linear MAE | Spline RMSE | Spline MAE |
|-------------|-------------|------------|-------------|------------|
| Clean GPS | 0.242m | 0.202m | 0.142m | 0.039m |
| Light Noise (1-3m) | 2.372m | 2.105m | 2.563m | 2.276m |
| Medium Noise (3-8m) | 7.073m | 6.202m | 7.715m | 6.793m |
| Heavy Noise (5-15m) | 11.097m | 9.736m | 12.268m | 10.787m |

### Lap 4

| Noise Level | Linear RMSE | Linear MAE | Spline RMSE | Spline MAE |
|-------------|-------------|------------|-------------|------------|
| Clean GPS | 0.270m | 0.211m | 0.177m | 0.040m |
| Light Noise (1-3m) | 2.266m | 1.984m | 2.481m | 2.178m |
| Medium Noise (3-8m) | 6.135m | 5.432m | 6.824m | 6.084m |
| Heavy Noise (5-15m) | 10.589m | 9.325m | 11.751m | 10.364m |

### Lap 5

| Noise Level | Linear RMSE | Linear MAE | Spline RMSE | Spline MAE |
|-------------|-------------|------------|-------------|------------|
| Clean GPS | 0.073m | 0.045m | 0.053m | 0.013m |
| Light Noise (1-3m) | 2.354m | 2.099m | 2.600m | 2.322m |
| Medium Noise (3-8m) | 6.445m | 5.645m | 7.064m | 6.208m |
| Heavy Noise (5-15m) | 11.280m | 9.934m | 12.516m | 11.067m |

## Conclusions

1. **Clean GPS:** Spline interpolation provides the best accuracy (sub-meter RMSE)
2. **Noisy GPS:** Linear interpolation performs slightly better as it doesn't amplify noise
3. **Noise Impact:** RMSE roughly matches the noise level (3-8m noise → ~6-7m RMSE)

## Notes

- EKF (Extended Kalman Filter) was not included in this benchmark as it requires IMU data
- Outlier detection was disabled for consistent comparison
