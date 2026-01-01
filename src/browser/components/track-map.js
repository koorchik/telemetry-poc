/**
 * Track map component wrapping Leaflet.js.
 * Renders the GPS track with speed gradient and various algorithm overlays.
 * @module browser/components/track-map
 */

import { LitElement, html } from 'lit';
import chroma from 'chroma-js';
import { eventBus } from './event-bus.js';

export class TrackMap extends LitElement {
  // Use light DOM for Leaflet compatibility
  createRenderRoot() {
    return this;
  }

  static properties = {
    lapData: { type: Object },
    comparisonData: { type: Object },
    position: { type: Number },
    currentTime: { type: Number },
    mode: { type: String },
    layerVisibility: { type: Object },
    bounds: { type: Array },
  };

  constructor() {
    super();
    this.lapData = null;
    this.comparisonData = null;
    this.position = 0;
    this.currentTime = 0;
    this.mode = 'clean';
    this.layerVisibility = {};
    this.bounds = null;

    this._map = null;
    this._layers = {};
    this._comparisonTrackLayer = null;
    this._carMarker = null;
    this._comparisonMarker = null;

    this._layerConfig = {
      groundTruth: { label: 'Ground Truth (25Hz)', color: '#22c55e' },
      gpsPoints: { label: 'GPS Points (1Hz)', color: '#ef4444' },
      linear: { label: 'Linear Interp.', color: '#f97316' },
      spline: { label: 'Spline', color: '#2563eb' },
      ekfRaw: { label: 'EKF Raw', color: '#ec4899' },
      ekfSmooth: { label: 'EKF + Spline', color: '#8b5cf6' },
      speedLabels: { label: 'Speed Labels', color: '#a855f7' },
    };
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this._map) {
      this._map.remove();
      this._map = null;
    }
  }

  firstUpdated() {
    this._initMap();
  }

  updated(changedProperties) {
    if (changedProperties.has('lapData') || changedProperties.has('mode')) {
      this._createLayers();
    }
    if (changedProperties.has('comparisonData')) {
      this._updateComparisonLayer();
    }
    if (changedProperties.has('position') || changedProperties.has('currentTime')) {
      this._updateMarkers();
    }
    if (changedProperties.has('layerVisibility')) {
      this._updateLayerVisibility();
    }
  }

  _initMap() {
    const mapEl = this.querySelector('#map');
    if (!mapEl || typeof L === 'undefined') return;

    this._map = L.map(mapEl);

    // Base tile layers
    const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap',
      maxZoom: 21,
      maxNativeZoom: 19
    });

    const esriSatelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      attribution: '© Esri',
      maxZoom: 21,
      maxNativeZoom: 18
    });

    const googleSatelliteLayer = L.tileLayer('https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
      attribution: '© Google',
      maxZoom: 21,
      maxNativeZoom: 20
    });

    // Add default layer and layer control
    googleSatelliteLayer.addTo(this._map);
    L.control.layers({
      'Google Satellite': googleSatelliteLayer,
      'Esri Satellite': esriSatelliteLayer,
      'Street': osmLayer
    }, null, { position: 'bottomleft' }).addTo(this._map);

    if (this.bounds) {
      this._map.fitBounds(this.bounds, { padding: [30, 30] });
    }

    // Car markers
    const carIcon = L.divIcon({
      className: '',
      html: '<div class="car-marker"></div>',
      iconSize: [24, 24],
      iconAnchor: [12, 12]
    });
    this._carMarker = L.marker([0, 0], { icon: carIcon, zIndexOffset: 1000 });

    const compIcon = L.divIcon({
      className: '',
      html: '<div class="car-marker comparison"></div>',
      iconSize: [24, 24],
      iconAnchor: [12, 12]
    });
    this._comparisonMarker = L.marker([0, 0], { icon: compIcon, zIndexOffset: 999 });

    this._createLayers();
  }

  _createLayers() {
    if (!this._map || !this.lapData) return;

    // Remove existing layers
    Object.values(this._layers).forEach(l => {
      if (this._map.hasLayer(l)) this._map.removeLayer(l);
    });
    this._layers = {};

    const prefix = this.mode === 'clean' ? 'clean' : 'noisy';
    const ld = this.lapData;

    // Ground Truth with speed gradient
    this._layers.groundTruth = this._createSpeedGradientTrack(ld.fullGroundTruth);

    // GPS Points
    const gpsData = this.mode === 'clean' ? ld.cleanGPS : ld.noisyGPS;
    this._layers.gpsPoints = L.layerGroup();
    (gpsData || []).forEach((c, i) => {
      L.circleMarker(c, { radius: 4, color: '#dc2626', fillColor: '#ef4444', fillOpacity: 0.8, weight: 2 })
        .bindPopup('GPS #' + (i + 1))
        .addTo(this._layers.gpsPoints);
    });

    // Algorithms
    this._layers.linear = L.polyline(ld[prefix + 'Linear'] || [], { color: '#f97316', weight: 2, opacity: 0.8, dashArray: '5, 5' });
    this._layers.spline = L.polyline(ld[prefix + 'Spline'] || [], { color: '#2563eb', weight: 3, opacity: 0.9 });
    this._layers.ekfRaw = L.polyline(ld[prefix + 'EkfRaw'] || [], { color: '#ec4899', weight: 2, opacity: 0.8, dashArray: '3, 3' });
    this._layers.ekfSmooth = L.polyline(ld[prefix + 'EkfSmooth'] || [], { color: '#8b5cf6', weight: 3, opacity: 0.9 });

    // Speed Labels
    this._layers.speedLabels = L.layerGroup();
    if (ld.speedExtrema) {
      ld.speedExtrema.minPoints.forEach((p, i) => {
        const icon = L.divIcon({
          className: 'speed-label',
          html: '<div class="speed-marker speed-min">' + p.speedKmh + '</div>',
          iconSize: [50, 20],
          iconAnchor: [25, 10]
        });
        L.marker([p.lat, p.lon], { icon })
          .bindPopup('<b>Braking #' + (i + 1) + '</b><br>' + p.speedKmh + ' km/h')
          .addTo(this._layers.speedLabels);
      });
      ld.speedExtrema.maxPoints.forEach((p, i) => {
        const icon = L.divIcon({
          className: 'speed-label',
          html: '<div class="speed-marker speed-max">' + p.speedKmh + '</div>',
          iconSize: [50, 20],
          iconAnchor: [25, 10]
        });
        L.marker([p.lat, p.lon], { icon })
          .bindPopup('<b>Top Speed #' + (i + 1) + '</b><br>' + p.speedKmh + ' km/h')
          .addTo(this._layers.speedLabels);
      });
    }

    // Add visible layers
    this._updateLayerVisibility();

    // Fit bounds
    if (ld.groundTruth?.length > 0) {
      this._map.fitBounds(ld.groundTruth, { padding: [30, 30] });
    }

    // Trajectory click handlers
    const onTrajectoryClick = (e) => this._onTrajectoryClick(e);
    this._layers.groundTruth.on('click', onTrajectoryClick);
    this._layers.spline.on('click', onTrajectoryClick);
    this._layers.ekfRaw.on('click', onTrajectoryClick);
    this._layers.ekfSmooth.on('click', onTrajectoryClick);
  }

  _createSpeedGradientTrack(data, opacity = 0.9) {
    if (!data || data.length < 2) return L.layerGroup();

    const speeds = data.map(p => p.speed || 0);
    const minSpeed = Math.min(...speeds);
    const maxSpeed = Math.max(...speeds);

    const colorScale = chroma
      .scale(['#ff0000', '#ffff00', '#00c800'])
      .mode('lab')
      .domain([minSpeed, maxSpeed]);

    const layerGroup = L.layerGroup();

    for (let i = 0; i < data.length - 1; i++) {
      const p1 = data[i];
      const p2 = data[i + 1];
      const avgSpeed = ((p1.speed || 0) + (p2.speed || 0)) / 2;
      const color = colorScale(avgSpeed).hex();

      const segment = L.polyline([[p1.lat, p1.lon], [p2.lat, p2.lon]], {
        color, weight: 6, opacity, lineCap: 'round', lineJoin: 'round'
      });
      layerGroup.addLayer(segment);
    }

    return layerGroup;
  }

  _updateComparisonLayer() {
    // Remove existing comparison track
    if (this._comparisonTrackLayer && this._map?.hasLayer(this._comparisonTrackLayer)) {
      this._map.removeLayer(this._comparisonTrackLayer);
      this._comparisonTrackLayer = null;
    }

    if (this._comparisonMarker && this._map?.hasLayer(this._comparisonMarker)) {
      this._map.removeLayer(this._comparisonMarker);
    }

    if (this.comparisonData?.fullGroundTruth) {
      this._comparisonTrackLayer = this._createSpeedGradientTrack(this.comparisonData.fullGroundTruth, 0.4);
      this._comparisonTrackLayer.addTo(this._map);
    }
  }

  _updateMarkers() {
    if (!this._map || !this.lapData) return;

    // Main car marker
    const gt = this.lapData.fullGroundTruth;
    if (gt && gt.length > 0) {
      const idx = Math.min(Math.floor(this.position * gt.length), gt.length - 1);
      const point = gt[idx];
      if (point && this._carMarker) {
        this._carMarker.setLatLng([point.lat, point.lon]);
        if (!this._map.hasLayer(this._carMarker)) {
          this._carMarker.addTo(this._map);
        }
      }
    }

    // Comparison car marker
    if (this.comparisonData?.fullGroundTruth) {
      const compGt = this.comparisonData.fullGroundTruth;
      // Find point at same time
      let compPoint = null;
      for (let i = 0; i < compGt.length; i++) {
        if (compGt[i].lapTime >= this.currentTime) {
          compPoint = compGt[i];
          break;
        }
      }
      if (!compPoint && compGt.length > 0) {
        compPoint = compGt[compGt.length - 1];
      }

      if (compPoint && this._comparisonMarker) {
        this._comparisonMarker.setLatLng([compPoint.lat, compPoint.lon]);
        if (!this._map.hasLayer(this._comparisonMarker)) {
          this._comparisonMarker.addTo(this._map);
        }
      }
    }
  }

  _updateLayerVisibility() {
    if (!this._map) return;

    Object.keys(this._layerConfig).forEach(key => {
      const layer = this._layers[key];
      if (!layer) return;

      const visible = this.layerVisibility[key];
      if (visible && !this._map.hasLayer(layer)) {
        layer.addTo(this._map);
      } else if (!visible && this._map.hasLayer(layer)) {
        this._map.removeLayer(layer);
      }
    });
  }

  _onTrajectoryClick(e) {
    if (!this.lapData?.fullGroundTruth) return;

    let minDist = Infinity;
    let nearestPos = 0;

    this.lapData.fullGroundTruth.forEach(p => {
      const dist = Math.pow(e.latlng.lat - p.lat, 2) + Math.pow(e.latlng.lng - p.lon, 2);
      if (dist < minDist) {
        minDist = dist;
        nearestPos = p.lapPosition;
      }
    });

    eventBus.emit('seek-position', { position: nearestPos });
  }

  render() {
    return html`<div id="map" style="height: 100%; width: 100%;"></div>`;
  }
}

customElements.define('track-map', TrackMap);
