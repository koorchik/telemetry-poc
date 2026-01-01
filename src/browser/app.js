/**
 * Browser app main entry point.
 * Handles file upload and coordinates processing/visualization.
 * @module browser/app
 */

import { processCSV } from "./process.js";
import { initVisualization } from "./visualization.js";

// =====================================================
// UI Elements
// =====================================================
const uploadSection = document.getElementById("upload-section");
const vizSection = document.getElementById("visualization");
const dropZone = document.getElementById("drop-zone");
const fileInput = document.getElementById("file-input");
const loadExampleBtn = document.getElementById("load-example");
const progressEl = document.getElementById("progress");
const progressText = document.getElementById("progress-text");
const backBtn = document.getElementById("back-btn");

// =====================================================
// State
// =====================================================
let currentViz = null;

// =====================================================
// File Handling
// =====================================================
function handleFile(file) {
  if (!file.name.endsWith(".csv")) {
    alert("Please select a CSV file");
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    processAndVisualize(e.target.result);
  };
  reader.onerror = () => {
    alert("Error reading file");
    hideProgress();
  };
  reader.readAsText(file);
}

function processAndVisualize(csvText) {
  showProgress("Starting... (can take up to a minute)");

  // Use setTimeout to allow UI to update
  setTimeout(() => {
    try {
      const data = processCSV(csvText, {}, (stage, message) => {
        updateProgress(message);
      });

      showVisualization(data);
    } catch (err) {
      console.error("Processing error:", err);
      alert("Error processing CSV: " + err.message);
      hideProgress();
    }
  }, 50);
}

function showVisualization(data) {
  uploadSection.style.display = "none";
  vizSection.style.display = "block";
  backBtn.style.display = "block";

  currentViz = initVisualization(vizSection, data);
  hideProgress();
}

function showUpload() {
  uploadSection.style.display = "flex";
  vizSection.style.display = "none";
  backBtn.style.display = "none";
  vizSection.innerHTML = "";
  currentViz = null;
}

// =====================================================
// Progress UI
// =====================================================
function showProgress(message) {
  progressEl.style.display = "flex";
  progressText.textContent = message;
}

function updateProgress(message) {
  progressText.textContent = message;
}

function hideProgress() {
  progressEl.style.display = "none";
}

// =====================================================
// Event Listeners
// =====================================================

// Drag and drop
dropZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropZone.classList.add("dragover");
});

dropZone.addEventListener("dragleave", () => {
  dropZone.classList.remove("dragover");
});

dropZone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropZone.classList.remove("dragover");
  const file = e.dataTransfer.files[0];
  if (file) handleFile(file);
});

// Click to upload
dropZone.addEventListener("click", () => {
  fileInput.click();
});

fileInput.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (file) handleFile(file);
});

// Load example
loadExampleBtn.addEventListener("click", async () => {
  showProgress("Loading example data...");
  try {
    const response = await fetch("src/data/sample-data.csv");
    if (!response.ok) {
      throw new Error(`Failed to load example data: ${response.status}`);
    }
    const csvText = await response.text();
    processAndVisualize(csvText);
  } catch (err) {
    console.error("Error loading example data:", err);
    alert("Error loading example data: " + err.message);
    hideProgress();
  }
});

// Back button
backBtn.addEventListener("click", showUpload);

// =====================================================
// Initialization
// =====================================================
console.log("GPS Telemetry Analysis - Browser App Loaded");
