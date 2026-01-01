# GPS Track Smoothing PoC - Gemini Context

## Project Overview

This project is a Proof of Concept (PoC) for GPS trajectory smoothing and sensor fusion. It aims to improve the accuracy of low-frequency (1 Hz) GPS data by using interpolation algorithms and fusing it with high-frequency (25 Hz) IMU data (accelerometer, gyroscope).

**Key Goals:**
*   Compare different smoothing algorithms (Linear, Catmull-Rom Spline, Kalman Filter, EKF).
*   Demonstrate sensor fusion (GPS + IMU).
*   Visualize results on an interactive map.

**Main Technologies:**
*   **Runtime:** Node.js
*   **Dependencies:** `csv-parser` (for reading RaceChrono data)
*   **Visualization:** Leaflet.js (embedded in the generated `map.html`)
*   **Architecture:** Monolithic script (`simulation.js`) containing logic for parsing, simulation, filtering, and output generation.

## Building and Running

### Prerequisites

*   Node.js installed.
*   Dependencies installed via npm:
    ```bash
    npm install
    ```

### Key Commands

*   **Run Simulation:**
    Executes the main simulation logic, processes the data, and generates `map.html`.
    ```bash
    node simulation.js
    # Or for a specific lap:
    node simulation.js 3
    ```

*   **Run Benchmark:**
    Runs the algorithms across multiple laps and noise levels, generating a performance report in `RESULTS.md`.
    ```bash
    node benchmark.js
    ```

*   **Visualize Results:**
    Open the generated `map.html` file in a web browser to view the trajectories and compare algorithms.

## Project Structure & Key Files

*   `simulation.js`: **Main Entry Point.** Contains the core logic:
    *   `CONFIG`: Configuration object for sampling rates, noise levels, and filter parameters.
    *   `Matrix` class: Custom implementation for matrix operations.
    *   `EKF` / `KalmanFilter` classes: Algorithm implementations.
    *   `generateMap()`: Function to create the Leaflet.js visualization.
*   `benchmark.js`: wrapper script to run `simulation.js` logic in batch mode for performance analysis.
*   `race-chrono-session-v3.csv`: Input telemetry data (RaceChrono export).
*   `map.html`: Generated output file containing the interactive map.
*   `RESULTS.md`: Generated output file containing benchmark metrics.
*   `CLAUDE.md`: Contains useful context and architectural notes (reference this for deeper implementation details).

## Development Conventions

*   **Configuration:** specific parameters for the simulation (noise, sampling rates, physics constraints) are located in the `CONFIG` object at the top of `simulation.js`. Modify this object to tune the behavior.
*   **No External Math Libs:** Matrix and vector operations are implemented directly in `simulation.js` to keep the project self-contained.
*   **Data Flow:**
    1.  Parse CSV (25Hz raw data).
    2.  Downsample GPS to 1Hz (simulating typical device).
    3.  Inject noise (optional).
    4.  Apply smoothing/fusion algorithms.
    5.  Calculate metrics (RMSE).
    6.  Generate Output (HTML/Markdown).
