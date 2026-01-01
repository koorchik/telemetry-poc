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
| Light Noise (1-3m) | 2.447 | 2.664 | Linear |
| Medium Noise (3-8m) | 6.553 | 7.209 | Linear |
| Heavy Noise (5-15m) | 11.395 | 12.604 | Linear |

## Detailed Results by Lap

### Lap 1

| Noise Level | Linear RMSE | Linear MAE | Spline RMSE | Spline MAE |
|-------------|-------------|------------|-------------|------------|
| Clean GPS | 0.837m | 0.204m | 0.822m | 0.080m |
| Light Noise (1-3m) | 2.482m | 2.092m | 2.664m | 2.265m |
| Medium Noise (3-8m) | 6.642m | 5.811m | 7.279m | 6.389m |
| Heavy Noise (5-15m) | 10.594m | 9.368m | 11.779m | 10.452m |

### Lap 2

| Noise Level | Linear RMSE | Linear MAE | Spline RMSE | Spline MAE |
|-------------|-------------|------------|-------------|------------|
| Clean GPS | 0.791m | 0.249m | 0.765m | 0.085m |
| Light Noise (1-3m) | 2.585m | 2.215m | 2.830m | 2.426m |
| Medium Noise (3-8m) | 6.895m | 6.083m | 7.534m | 6.662m |
| Heavy Noise (5-15m) | 11.813m | 10.492m | 13.056m | 11.655m |

### Lap 3

| Noise Level | Linear RMSE | Linear MAE | Spline RMSE | Spline MAE |
|-------------|-------------|------------|-------------|------------|
| Clean GPS | 0.242m | 0.202m | 0.142m | 0.039m |
| Light Noise (1-3m) | 2.585m | 2.287m | 2.813m | 2.493m |
| Medium Noise (3-8m) | 6.461m | 5.661m | 7.147m | 6.265m |
| Heavy Noise (5-15m) | 11.761m | 10.425m | 12.985m | 11.550m |

### Lap 4

| Noise Level | Linear RMSE | Linear MAE | Spline RMSE | Spline MAE |
|-------------|-------------|------------|-------------|------------|
| Clean GPS | 0.270m | 0.211m | 0.177m | 0.040m |
| Light Noise (1-3m) | 2.212m | 1.960m | 2.404m | 2.135m |
| Medium Noise (3-8m) | 6.487m | 5.699m | 7.172m | 6.333m |
| Heavy Noise (5-15m) | 11.091m | 9.870m | 12.276m | 10.966m |

### Lap 5

| Noise Level | Linear RMSE | Linear MAE | Spline RMSE | Spline MAE |
|-------------|-------------|------------|-------------|------------|
| Clean GPS | 0.073m | 0.045m | 0.053m | 0.013m |
| Light Noise (1-3m) | 2.371m | 2.079m | 2.609m | 2.294m |
| Medium Noise (3-8m) | 6.280m | 5.567m | 6.914m | 6.151m |
| Heavy Noise (5-15m) | 11.716m | 10.354m | 12.926m | 11.457m |

## Conclusions

1. **Clean GPS:** Spline interpolation provides the best accuracy (sub-meter RMSE)
2. **Noisy GPS:** Linear interpolation performs slightly better as it doesn't amplify noise
3. **Noise Impact:** RMSE roughly matches the noise level (3-8m noise → ~6-7m RMSE)

## Notes

- EKF (Extended Kalman Filter) was not included in this benchmark as it requires IMU data
- Outlier detection was disabled for consistent comparison
