/**
 * Methodology text for each map layer, shown from the "i" button in the legend.
 * Numbers are read from CONFIG so the text stays true when parameters change.
 * @module browser/components/layer-info
 */

import { html } from 'lit';
import CONFIG from '../../config.js';

const ms = seconds => Math.round(seconds * 1000);
const lag = (seconds, plural = false) =>
  `${seconds < 0 ? 'lead' : 'lag'}${plural ? '' : 's'} by ${Math.abs(ms(seconds))} ms`;

const howDelaysAreFound = delays => html`
  <p class="layer-info-note">
    ${delays.estimated.gpsVelocity || delays.estimated.yaw_rate || delays.estimated.longitudinal_acc
      ? html`These delays are estimated for this recording from the ${CONFIG.sampling.gpsHz} Hz
          fixes and the inertial data alone: over each second between two fixes, the integrated
          gyroscope must match the change of GPS bearing, the integrated acceleration the change
          of GPS speed, and the integrated velocity the distance between the fixes. The time
          shift that fits best is the delay.`
      : html`These delays are preset values, not estimated from this recording.`}
  </p>
`;

const drawnNote = () => html`
  <p class="layer-info-note">
    Computed for every ${CONFIG.sampling.imuHz} Hz ground-truth timestamp. The line on the map
    is drawn from every 5th point. Its accuracy is listed in the metrics table.
  </p>
`;

/**
 * Builds the methodology description of a layer.
 * @param {string} key - Layer key (groundTruth, gpsPoints, linear, ...)
 * @param {Object} used - What this file was processed with
 * @param {Object} used.delays - Channel delays of the displayed GPS mode
 *   (see gps/delay-estimation.js)
 * @param {Object} used.noise - Noise settings of the Noisy GPS set
 * @returns {{title: string, body: import('lit').TemplateResult}|null}
 */
export function getLayerInfo(key, { delays, noise }) {
  const { sampling, ekf, outlierDetection: od, speedExtrema } = CONFIG;
  const hz = sampling.imuHz;
  const gpsEvery = Math.round(hz / sampling.gpsHz);

  switch (key) {
    case 'groundTruth':
      return {
        title: 'Ground Truth',
        body: html`
          <h5>Source</h5>
          <p>
            Latitude and longitude from the RaceChrono CSV, exactly as the GPS receiver logged
            them. No noise, filtering or smoothing is applied.
          </p>
          <h5>Processing</h5>
          <p>
            RaceChrono writes one row for every sample of any device (GPS, accelerometer,
            gyroscope, calculated channels), so the rows are unevenly spaced and more frequent
            than the GPS itself. Each lap is selected by its lap number and resampled onto a
            uniform ${hz} Hz time grid by linear interpolation between the two neighbouring rows.
          </p>
          <h5>Colour</h5>
          <p>
            GPS-reported speed: red is the slowest point of this lap, yellow the middle,
            green the fastest.
          </p>
          <h5>Role</h5>
          <p>
            This is the reference every other layer is scored against. RMSE, MAE and Max in the
            metrics table are distances between an algorithm's point and the ground-truth point
            with the same timestamp.
          </p>
          <p class="layer-info-note">
            It is still a GPS measurement, so it carries the receiver's own error.
          </p>
        `,
      };

    case 'gpsPoints':
      return {
        title: `GPS Points (${sampling.gpsHz} Hz)`,
        body: html`
          <h5>Source</h5>
          <p>
            Every ${gpsEvery}th ground-truth sample, which leaves one fix per
            ${(1 / sampling.gpsHz).toFixed(0)} s. This simulates a slow GPS receiver. Each fix
            keeps the position, speed, bearing and accuracy the receiver reported. These fixes are
            the only position input of all algorithms below.
          </p>
          <h5>Clean mode</h5>
          <p>The fixes are used as recorded.</p>
          <h5>Noisy mode</h5>
          <p>
            Each fix first gets its own error level, picked at random between
            ${noise.minMeters} m and ${noise.maxMeters} m (the range selected next to the
            Clean / Noisy switch). A random Gaussian error of that size (1σ) is then added to its
            North and to its East position, independently of the other fixes. The fix reports
            that error level as its accuracy, as a real receiver would, so the filters know
            which fixes to trust less.
          </p>
          <p>
            The speed gets ${noise.speedSigma} m/s and the bearing ${noise.bearingSigmaDeg}° of
            Gaussian error at every noise level.
          </p>
          <p>
            All other layers are recomputed from these fixes whenever the range changes. The
            "GPS fixes (input)" row of the metrics table shows the error they actually have.
          </p>
          <h5>Outlier filter</h5>
          <p>
            In both modes each fix is checked against vehicle physics and removed when the
            weighted score exceeds ${od.anomalyThreshold}:
          </p>
          <ul>
            <li>acceleration implied by consecutive fixes above ${od.maxAccelG} G</li>
            <li>bearing change differs from the gyroscope by more than ${od.maxYawRateDiff}°/s</li>
            <li>reported speed differs from distance / time by more than ${od.maxSpeedDiff} m/s</li>
            <li>lateral acceleration differs from speed × turn rate by more than ${od.maxLatAccDiff} G</li>
          </ul>
          <p>
            A fix that makes the path through it more than ${od.triangleRatio}× longer than the
            direct line between its neighbours, and lies more than ${od.minPerpDistance} m off
            that line, is removed at half that score. Removed fixes are not drawn; their count
            is shown above the metrics table.
          </p>
        `,
      };

    case 'linear':
      return {
        title: 'Linear Interpolation',
        body: html`
          <h5>Input</h5>
          <p>Positions of the ${sampling.gpsHz} Hz GPS fixes only.</p>
          <h5>Method</h5>
          <p>
            Consecutive fixes are joined by straight lines. The position at time <code>t</code>
            between fixes <code>k</code> and <code>k+1</code> is
          </p>
          <p><code>p(t) = p<sub>k</sub> + u · (p<sub>k+1</sub> − p<sub>k</sub>)</code>,
            <code>u = (t − t<sub>k</sub>) / (t<sub>k+1</sub> − t<sub>k</sub>)</code></p>
          <p>
            Latitude and longitude are interpolated separately. This assumes constant speed and
            direction within each second, so the line cuts the inside of every corner.
          </p>
          <h5>After the last fix</h5>
          <p>The position continues along the last fix's reported speed and bearing.</p>
          ${drawnNote()}
        `,
      };

    case 'spline':
      return {
        title: 'Catmull-Rom Spline',
        body: html`
          <h5>Input</h5>
          <p>Positions of the ${sampling.gpsHz} Hz GPS fixes only.</p>
          <h5>Method</h5>
          <p>
            A smooth cubic curve that passes exactly through every fix. Each segment between
            fixes <code>k</code> and <code>k+1</code> is shaped by four fixes
            (<code>k−1</code> … <code>k+2</code>). The direction and speed of the curve at a fix
            are not measured but guessed from its neighbours:
          </p>
          <p><code>tangent<sub>k</sub> = (p<sub>k+1</sub> − p<sub>k−1</sub>) / 2</code></p>
          <p>
            Latitude and longitude are interpolated separately, with time as the curve
            parameter. Because the curve must pass through each fix, any GPS error is followed
            and can be exaggerated between fixes.
          </p>
          <h5>After the last fix</h5>
          <p>The position continues along the last fix's reported speed and bearing.</p>
          ${drawnNote()}
        `,
      };

    case 'hermite':
      return {
        title: 'Hermite Spline (GPS velocity)',
        body: html`
          <h5>Input</h5>
          <p>Position, speed and bearing of the ${sampling.gpsHz} Hz GPS fixes.</p>
          <h5>Method</h5>
          <p>
            A cubic curve that passes exactly through every fix, like Catmull-Rom, but the
            direction and speed at each fix are the measured GPS velocity instead of a guess
            from neighbouring positions:
          </p>
          <p><code>v<sub>East</sub> = speed · sin(bearing)</code>,
            <code>v<sub>North</sub> = speed · cos(bearing)</code></p>
          <p>
            Each segment matches the positions and velocities at both of its ends
            (cubic Hermite basis). The curve is computed in local metres East / North of the
            first fix and converted back to latitude / longitude.
          </p>
          <h5>Velocity timing</h5>
          <p>
            In this recording the receiver's speed and bearing ${lag(delays.gpsVelocity, true)}
            relative to the position of the same fix. They are moved to the fix time using
            their rate of change between the neighbouring fixes.
          </p>
          ${howDelaysAreFound(delays)}
          <h5>After the last fix</h5>
          <p>The position continues along the last fix's reported speed and bearing.</p>
          ${drawnNote()}
        `,
      };

    case 'ekfRaw':
      return {
        title: 'EKF Raw (forward filter)',
        body: html`
          <h5>Input</h5>
          <p>
            The ${sampling.gpsHz} Hz GPS fixes (position, speed, bearing, accuracy) plus two
            ${hz} Hz inertial channels: gyroscope yaw rate and longitudinal acceleration.
          </p>
          <h5>Sensor timing</h5>
          <p>
            The channels of a logger do not share one clock. In this recording, relative to GPS
            position, the gyroscope ${lag(delays.yaw_rate)}, the acceleration
            ${lag(delays.longitudinal_acc)} and the GPS speed and bearing
            ${lag(delays.gpsVelocity, true)}. The inertial channels are shifted by these amounts before
            the filter runs.
          </p>
          ${howDelaysAreFound(delays)}
          <h5>Model</h5>
          <p>
            An Extended Kalman Filter with six states: position East and North, speed, course,
            gyroscope bias and accelerometer bias. The car is assumed to move along its course,
            so the gyroscope turns the course and the accelerometer changes the speed.
          </p>
          <h5>Between fixes (${hz} times per second)</h5>
          <p><code>course += (yaw rate − gyro bias) · dt</code><br>
            <code>speed += (acceleration − accel bias) · dt</code><br>
            <code>position += speed · direction(course) · dt</code></p>
          <p>The uncertainty of every state grows with each step.</p>
          <h5>At each fix</h5>
          <p>
            The estimate is pulled towards the measured position (trusted according to the fix's
            reported accuracy), speed (±${ekf.gps_speed_noise} m/s) and course
            (±${ekf.gps_course_noise_deg}°, used above ${ekf.min_speed_for_heading} m/s). How far
            it moves depends on the filter's own uncertainty versus the measurement's. GPS speed
            and course are compared with the state shifted by their delay, not with the current
            one.
          </p>
          <h5>What "raw" means</h5>
          <p>
            Each point uses only the fixes received up to that moment, as a live device would.
            The small jumps once per second are these corrections.
          </p>
          ${drawnNote()}
        `,
      };

    case 'ekfSmooth':
      return {
        title: 'EKF + RTS Smoother',
        body: html`
          <h5>Input</h5>
          <p>
            Same as EKF Raw: the ${sampling.gpsHz} Hz GPS fixes plus ${hz} Hz gyroscope yaw rate
            and longitudinal acceleration.
          </p>
          <h5>Method</h5>
          <p>
            The EKF Raw filter runs forward over the whole lap and stores its estimate and
            uncertainty at every step. A Rauch-Tung-Striebel pass then runs backward from the
            end of the lap and corrects each point using what the filter learned later:
          </p>
          <p><code>x<sub>k</sub> ← x<sub>k</sub> + C<sub>k</sub> · (x<sub>k+1</sub><sup>smoothed</sup> − x<sub>k+1</sub><sup>predicted</sup>)</code></p>
          <p>
            <code>C<sub>k</sub></code> is computed from the stored uncertainties: where the
            forward filter was unsure (just before a fix), the correction is large; right
            after a fix it is small.
          </p>
          <h5>Result</h5>
          <p>
            Every point is based on all fixes of the lap, both earlier and later, and on the
            inertial data between them. The once-per-second jumps of EKF Raw disappear. Unlike
            the interpolators, the curve does not have to pass through each fix: a fix is
            weighted by its accuracy, which is why this layer holds up best on noisy GPS.
          </p>
          <p class="layer-info-note">
            Post-processing only: it needs the fixes that come after each moment.
          </p>
          ${drawnNote()}
        `,
      };

    case 'speedLabels':
      return {
        title: 'Speed Labels',
        body: html`
          <h5>Source</h5>
          <p>GPS-reported speed of the ground-truth track.</p>
          <h5>Method</h5>
          <p>
            The speed is smoothed with a moving average over ±${speedExtrema.windowSize} samples
            (±${(speedExtrema.windowSize / hz).toFixed(0)} s). Points where the smoothed speed
            stops falling and starts rising are braking points (red); points where it stops
            rising and starts falling are top speeds (green). Speeds below
            ${(speedExtrema.minSpeedThreshold * 3.6).toFixed(0)} km/h are ignored.
          </p>
          <p>
            A neighbouring braking point and top speed that differ by less than
            ${speedExtrema.minDeltaKmh} km/h are both dropped, so small speed wobbles do not
            produce labels.
          </p>
          <h5>Label value</h5>
          <p>The unsmoothed GPS speed at that point, in km/h.</p>
        `,
      };

    default:
      return null;
  }
}
