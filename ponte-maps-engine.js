/**
 * ponte-maps-engine.js
 * Motor Cartográfico Vetorial Canvas 2D HiDPI (60 FPS) Soberano — Ecossistema Ponte / OZPro
 * 100% Zero Dependências Externas (Sem Google Maps JS, Sem Mapbox GL, Sem Leaflet).
 *
 * Recursos:
 * - Projeção Web Mercator contínua (Zoom 4.0 a 19.5) com Pan, Wheel Zoom no cursor, Touch & Pinch-to-Zoom
 * - Tiles HQ v2 (resolução nativa 4096) desenhados em vetor puro: vias com largura real, nomes curvados, prédios 3D
 * - Renderização multi-camada: Estados IBGE, Rios, Rodovias Nacionais, Parques, Edifícios 3D Extrusados, Ruas com Nomes e POIs
 * - 2 Temas nativos (Uber Night Dark & Google Maps Classic Light) + Camada de Trânsito + Modo 3D
 * - Animação de Viagem/Delivery a 60 FPS com interpolação contínua e rotação de veículo (bearing)
 */

export function resumirCoberturaViewport({ lat, lng, zoom, width, height, tileZoom, index, fallbackZooms = [] }) {
  if (!index) return { status: 'loading', total: 0, native: 0, fallback: 0, missing: 0, percent: 0 };

  const n = 2 ** tileZoom;
  const clampedLat = Math.max(-85.05112878, Math.min(85.05112878, lat));
  const fx = ((lng + 180) / 360) * n;
  const sinLat = Math.sin((clampedLat * Math.PI) / 180);
  const fy = (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * n;
  const halfW = width / (2 * 256 * 2 ** (zoom - tileZoom));
  const halfH = height / (2 * 256 * 2 ** (zoom - tileZoom));
  const radius = Math.hypot(halfW, halfH);
  const minX = Math.floor(fx - radius);
  const maxX = Math.floor(fx + radius);
  const minY = Math.max(0, Math.floor(fy - radius));
  const maxY = Math.min(n - 1, Math.floor(fy + radius));
  const seen = new Set();
  let native = 0;
  let fallback = 0;
  let missing = 0;

  for (let x = minX; x <= maxX; x++) {
    const wrappedX = ((x % n) + n) % n;
    for (let y = minY; y <= maxY; y++) {
      const key = `${wrappedX}/${y}`;
      if (seen.has(key)) continue;
      seen.add(key);

      if (index[tileZoom]?.has(key)) {
        native++;
        continue;
      }

      const hasFallback = fallbackZooms.some((fallbackZoom) => {
        const shift = tileZoom - fallbackZoom;
        if (shift <= 0) return false;
        return index[fallbackZoom]?.has(`${wrappedX >> shift}/${y >> shift}`);
      });
      if (hasFallback) fallback++;
      else missing++;
    }
  }

  const total = native + fallback + missing;
  return {
    status: 'ready',
    total,
    native,
    fallback,
    missing,
    percent: total ? Math.round(((native + fallback) / total) * 100) : 0
  };
}

export class PonteMapEngine {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.apiBase = options.apiBase || '';
    this.lat = options.lat ?? -23.5680;
    this.lng = options.lng ?? -46.6650;
    this.zoom = options.zoom ?? 13.8;
    this.theme = options.theme || 'dark';
    this.show3D = options.show3D !== false;
    this.showTraffic = options.showTraffic !== false;
    this.driverMode = Boolean(options.driverMode);
    this.headingUp = Boolean(options.headingUp);
    this.cameraAngle = 0;
    this.activeAlternativeRouteId = null;
    this.onAlternativeRouteSelect = options.onAlternativeRouteSelect || null;
    this.onBridgeClick = options.onBridgeClick || null;

    this.tileCache = new Map();
    this.bitmapCache = new Map(); // Cache de tiles pré-rasterizados na GPU (drawImage < 0.3ms)
    this.pendingTiles = new Set();
    this.tileQueue = [];
    this.activeFetches = 0;
    this.maxConcurrentFetches = 8; // Concorrência otimizada para carregamento veloz de tiles
    this.moveDebounceTimer = null;
    this.tileFetchPaused = false;
    this.brasilGeo = null;
    this.loadingBrasil = false;

    this.routeData = null;
    this.vehicleProgress = 0; // 0..100
    this.currentVehicleAngle = undefined;
    this.autoFollow = options.autoFollow ?? false;
    this.customPin = null;
    this.stores = [];
    this.showStores = Boolean(options.showStores);

    // Topografia (hillshade + curvas de nível) e Sinalização Viária (semáforos, radares, placas, pedágios)
    this.showTerrain = options.showTerrain !== false;
    this.showSignals = options.showSignals !== false;
    this.showSpeed = Boolean(options.showSpeed);
    this.showTolls = options.showTolls !== false;
    this.terrainIndex = null;
    this.terrainIndexLoading = false;
    this.terrainIndexError = null;
    this.terrainGrids = new Map();
    this.terrainBitmaps = new Map();
    this.terrainPending = new Set();
    this.signalShards = new Map();
    this.signalPending = new Set();
    this.tolls = [];
    this.tollsLoading = false;
    this.onTollClick = options.onTollClick || null;
    this.onRadarClick = options.onRadarClick || null;

    // Tiles vetoriais de alta fidelidade (HQ v2) desenhados em vetor puro a cada frame
    this.hqIndex = null;
    this.hqIndexLoading = false;
    this.hqIndexError = null;
    this.hqCache = new Map();
    this.hqPaths = new Map();
    this.hqPending = new Set();
    this.coverageStatusElement = typeof document !== 'undefined' ? document.getElementById('map-coverage-status') : null;
    this.routeQualityElement = typeof document !== 'undefined' ? document.getElementById('map-route-quality') : null;
    this.lastCoverageUpdateAt = 0;
    this.lastCoverageSignature = '';
    this.onMapClick = options.onMapClick || null;
    this.onStoreClick = options.onStoreClick || null;
    this.onZoomChange = options.onZoomChange || null;
    this.onMoveEnd = options.onMoveEnd || null;

    this.isDragging = false;
    this.dragMoved = false;
    this.lastX = 0;
    this.lastY = 0;
    this.panVelX = 0;
    this.panVelY = 0;
    this.lastDragTime = 0;
    this.targetZoom = this.zoom;
    this.zoomAnchor = null;
    this.pinchDist = 0;
    this.flyAnim = null;
    this.needsRender = true;
    this.trafficOffset = 0;

    this._resize();
    this._bindEvents();
    this._loadBrasilLayers();
    this._loadHqIndex();
    this._loadTerrainIndex();
    this._startLoop();
  }

  // ── PROJEÇÃO WEB MERCATOR ──
  static project(lat, lng, zoom) {
    const scale = 256 * Math.pow(2, zoom);
    const x = ((lng + 180) / 360) * scale;
    const sinLat = Math.sin((lat * Math.PI) / 180);
    const clampedSin = Math.max(-0.9999, Math.min(0.9999, sinLat));
    const y = (0.5 - Math.log((1 + clampedSin) / (1 - clampedSin)) / (4 * Math.PI)) * scale;
    return { x, y };
  }

  static unproject(wx, wy, zoom) {
    const scale = 256 * Math.pow(2, zoom);
    const lng = (wx / scale) * 360 - 180;
    const n = Math.PI - (2 * Math.PI * wy) / scale;
    const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
    return { lat, lng };
  }

  latLngToScreen(lat, lng) {
    const center = PonteMapEngine.project(this.lat, this.lng, this.zoom);
    const pt = PonteMapEngine.project(lat, lng, this.zoom);
    const isHeadUp = this.driverMode && this.headingUp && this.currentVehicleAngle !== undefined;
    const ax = this.width / 2;
    const ay = isHeadUp ? this.height * 0.70 : this.height / 2;
    return {
      x: ax + (pt.x - center.x),
      y: ay + (pt.y - center.y)
    };
  }

  screenToLatLng(sx, sy) {
    const center = PonteMapEngine.project(this.lat, this.lng, this.zoom);
    const isHeadUp = this.driverMode && this.headingUp && this.currentVehicleAngle !== undefined;
    const ax = this.width / 2;
    const ay = isHeadUp ? this.height * 0.70 : this.height / 2;
    let unX = sx;
    let unY = sy;

    if (isHeadUp) {
      const rot = this.currentVehicleAngle + Math.PI / 2;
      const cos = Math.cos(rot);
      const sin = Math.sin(rot);
      const dx = sx - ax;
      const dy = sy - ay;
      unX = ax + dx * cos - dy * sin;
      unY = ay + dx * sin + dy * cos;
    }

    const wx = center.x + (unX - ax);
    const wy = center.y + (unY - ay);
    return PonteMapEngine.unproject(wx, wy, this.zoom);
  }

  _resize() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = Math.max(300, rect.width || 800);
    this.height = Math.max(320, rect.height || 500);
    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
    this.canvas.style.width = this.width + 'px';
    this.canvas.style.height = this.height + 'px';
    this.needsRender = true;
  }

  setTheme(theme) {
    this.theme = theme === 'light' ? 'light' : 'dark';
    this.bitmapCache.clear();
    this.needsRender = true;
  }

  set3D(enabled) {
    this.show3D = Boolean(enabled);
    this.bitmapCache.clear();
    this.needsRender = true;
  }

  setTraffic(enabled) {
    this.showTraffic = Boolean(enabled);
    this.bitmapCache.clear();
    this.needsRender = true;
  }

  setZoom(newZoom) {
    this.zoom = Math.max(4, Math.min(22.0, newZoom));
    this.targetZoom = this.zoom;
    this.zoomAnchor = null;
    if (this.onZoomChange) this.onZoomChange(this.zoom);
    this.needsRender = true;
  }

  setDriverMode(enabled, headingUp = true) {
    this.driverMode = Boolean(enabled);
    if (this.driverMode) {
      this.followVehicle = true;
      this.headingUp = Boolean(headingUp);
      this.setZoom(Math.max(20.0, this.zoom));
    } else {
      this.headingUp = false;
      this.cameraAngle = 0;
    }
    this.needsRender = true;
  }

  setHeadingUp(enabled) {
    this.headingUp = Boolean(enabled);
    this.needsRender = true;
  }

  glanceDestination() {
    if (!this.routeData || !this.routeData.destino) return;
    const dest = this.routeData.destino;
    const prevLat = this.lat;
    const prevLng = this.lng;
    const prevZoom = this.zoom;
    const prevFollow = this.followVehicle;
    this.followVehicle = false;
    this.flyTo(dest.lat, dest.lng, Math.max(16.5, this.zoom), 550);
    setTimeout(() => {
      this.followVehicle = prevFollow;
      this.flyTo(prevLat, prevLng, prevZoom, 550);
    }, 2500);
  }

  flyTo(lat, lng, zoom = this.zoom, duration = 650) {
    const startLat = this.lat;
    const startLng = this.lng;
    const startZoom = this.zoom;
    const startTime = performance.now();

    this.flyAnim = (now) => {
      const t = Math.min(1, (now - startTime) / duration);
      const ease = 1 - Math.pow(1 - t, 3);
      this.lat = startLat + (lat - startLat) * ease;
      this.lng = startLng + (lng - startLng) * ease;
      this.zoom = startZoom + (zoom - startZoom) * ease;
      if (this.onZoomChange) this.onZoomChange(this.zoom);
      this.needsRender = true;
      if (t >= 1) this.flyAnim = null;
    };
    this.needsRender = true;
  }

  setRoute(routeData, fitBounds = true) {
    this.routeData = routeData;
    this.routeTrajectory = null;
    this.currentVehicleAngle = undefined;
    this._updateRouteQualityStatus();
    if (fitBounds && routeData && routeData.origem && routeData.destino) {
      const o = routeData.origem;
      const d = routeData.destino;
      const midLat = (o.lat + d.lat) / 2;
      const midLng = (o.lng + d.lng) / 2;
      const spanLat = Math.abs(o.lat - d.lat);
      const spanLng = Math.abs(o.lng - d.lng);
      const maxSpan = Math.max(spanLat, spanLng, 0.015);
      let targetZoom = 14 - Math.log2(maxSpan / 0.03);
      targetZoom = Math.max(5.2, Math.min(15.2, targetZoom));
      this.flyTo(midLat, midLng, targetZoom, 600);
    }
    this.needsRender = true;
  }

  setVehicleProgress(pct) {
    this.vehicleProgress = Math.max(0, Math.min(100, Number(pct) || 0));
    this.needsRender = true;
  }

  setModal(modal) {
    this.vehicleModal = modal || 'carro';
    this.routeTrajectory = null; // Re-calcula a spline com a guia correta do modal
    this.needsRender = true;
  }

  setFollowVehicle(enabled) {
    this.followVehicle = Boolean(enabled);
    this.needsRender = true;
  }

  setCustomPin(pin) {
    this.customPin = pin;
    this.needsRender = true;
  }

  setStores(stores, show = true) {
    this.stores = Array.isArray(stores) ? stores : [];
    this.showStores = Boolean(show);
    this.needsRender = true;
  }

  setTerrain(enabled) {
    this.showTerrain = Boolean(enabled);
    this.needsRender = true;
  }

  setSignals(enabled) {
    this.showSignals = Boolean(enabled);
    this.needsRender = true;
  }

  setSpeedLimits(enabled) {
    this.showSpeed = Boolean(enabled);
    this.needsRender = true;
  }

  setTolls(enabled) {
    this.showTolls = Boolean(enabled);
    this.needsRender = true;
  }

  static tileOf(lat, lng, z) {
    const n = Math.pow(2, z);
    const fx = ((lng + 180) / 360) * n;
    const latRad = (lat * Math.PI) / 180;
    const fy = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
    return { x: Math.floor(fx), y: Math.floor(fy), fx, fy };
  }

  // Busca genérica com Cache Storage do navegador e descompressão gzip nativa
  async _cachedFetch(url, kind) {
    const parseRes = async (res) => {
      if (kind === 'bin') return await res.arrayBuffer();
      const buf = await res.arrayBuffer();
      const u8 = new Uint8Array(buf);
      if (u8.length >= 2 && u8[0] === 0x1f && u8[1] === 0x8b) {
        if (typeof DecompressionStream !== 'undefined') {
          const ds = new DecompressionStream('gzip');
          const writer = ds.writable.getWriter();
          writer.write(buf);
          writer.close();
          const decRes = new Response(ds.readable);
          return await decRes.json();
        }
      }
      return JSON.parse(new TextDecoder().decode(buf));
    };

    if (typeof caches !== 'undefined') {
      try {
        const cache = await caches.open('ponte-maps-tiles-v1');
        const hit = await cache.match(url);
        if (hit) return await parseRes(hit);
        const res = await fetch(url);
        if (res.status === 200) {
          await cache.put(url, res.clone());
          return await parseRes(res);
        }
        if (res.status === 204 || res.status === 404) return null;
        throw new Error(`HTTP ${res.status}`);
      } catch (err) {
        if (err && /^HTTP (429|5\d\d)/.test(err.message)) throw err;
      }
    }
    const res = await fetch(url);
    if (res.status === 200) return await parseRes(res);
    if (res.status === 204 || res.status === 404) return null;
    throw new Error(`HTTP ${res.status}`);
  }

  async _loadTerrainIndex() {
    if (this.terrainIndex || this.terrainIndexLoading || this.terrainIndexError) return;
    this.terrainIndexLoading = true;
    try {
      const res = await fetch(`${this.apiBase}/api/mapas/terreno/index.json`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = await res.json();
      const idx = {};
      for (const [z, arr] of Object.entries(j.tiles || {})) idx[z] = new Set(arr);
      this.terrainIndex = idx;
      this.needsRender = true;
    } catch (error) {
      this.terrainIndexError = error instanceof Error ? error.message : String(error);
      console.warn('[Mapa] Falha ao carregar índice do relevo:', error);
      this.needsRender = true;
    } finally {
      this.terrainIndexLoading = false;
    }
  }

  _hasTerrain(z, x, y) {
    const s = this.terrainIndex && this.terrainIndex[z];
    return Boolean(s && s.has(`${x}/${y}`));
  }

  _fetchTerrain(z, x, y) {
    const key = `${z}/${x}/${y}`;
    if (this.terrainGrids.has(key) || this.terrainPending.has(key)) return;
    if (this.terrainPending.size >= 12) return;
    this.terrainPending.add(key);
    this._cachedFetch(`${this.apiBase}/api/mapas/terreno/${key}.bin`, 'bin')
      .then((buf) => {
        const grid = buf && buf.byteLength === 128 * 128 * 2 ? new Int16Array(buf) : null;
        if (this.terrainGrids.size >= 260) this.terrainGrids.delete(this.terrainGrids.keys().next().value);
        this.terrainGrids.set(key, grid);
        this.needsRender = true;
      })
      .catch(() => {})
      .finally(() => this.terrainPending.delete(key));
  }

  _fetchSignals(x, y) {
    const key = `${x}/${y}`;
    if (this.signalShards.has(key) || this.signalPending.has(key) || this.tileFetchPaused) return;
    if (this.signalPending.size >= 2) return;
    this.signalPending.add(key);
    this._cachedFetch(`${this.apiBase}/api/mapas/sinalizacao/${key}.json`, 'json')
      .then((d) => {
        if (this.signalShards.size >= 16) this.signalShards.delete(this.signalShards.keys().next().value);
        this.signalShards.set(key, d || { s: [], r: [], l: [], v: [] });
        this.needsRender = true;
      })
      .catch(() => {})
      .finally(() => this.signalPending.delete(key));
  }

  async _loadTolls() {
    if (this.tollsLoading || this.tolls.length) return;
    this.tollsLoading = true;
    try {
      const res = await fetch(`${this.apiBase}/api/mapas/pedagios`);
      if (res.ok) {
        const j = await res.json();
        this.tolls = j.pracas || [];
        this.needsRender = true;
      }
    } catch (_) {}
    this.tollsLoading = false;
  }

  _visibleSignalShards() {
    const tl = this.screenToLatLng(0, 0);
    const br = this.screenToLatLng(this.width, this.height);
    const a = PonteMapEngine.tileOf(tl.lat, tl.lng, 12);
    const b = PonteMapEngine.tileOf(br.lat, br.lng, 12);
    const out = [];
    if ((b.x - a.x + 1) * (b.y - a.y + 1) > 9) return out;
    for (let x = a.x; x <= b.x; x++) {
      for (let y = a.y; y <= b.y; y++) {
        this._fetchSignals(x, y);
        const d = this.signalShards.get(`${x}/${y}`);
        if (d) out.push(d);
      }
    }
    return out;
  }

  _hitTestPoi(sx, sy) {
    if (this.showTolls && this.zoom >= 6.5) {
      for (const t of this.tolls) {
        const p = this.latLngToScreen(t.lat, t.lng);
        if ((p.x - sx) ** 2 + (p.y - sy) ** 2 < 14 * 14) return { tipo: 'pedagio', item: t };
      }
    }
    if (this.showSignals && this.zoom >= 13) {
      for (const sh of this.signalShards.values()) {
        for (const r of sh.r) {
          const p = this.latLngToScreen(r[0], r[1]);
          if ((p.x - sx) ** 2 + (p.y - sy) ** 2 < 12 * 12) return { tipo: 'radar', item: { lat: r[0], lng: r[1], limiteKmh: r[2] || null } };
        }
      }
    }
    return null;
  }

  _hitTestStore(sx, sy) {
    if (!this.showStores || !this.stores.length) return null;
    let best = null;
    let bestD = 22 * 22;
    for (const st of this.stores) {
      const p = this.latLngToScreen(st.lat, st.lng);
      // Aplica o mesmo offset de calçada/fachada para hit-test
      const seed = Math.abs(Math.sin((st.lat || 0) * 888.88 + (st.lng || 0) * 777.77) * 1000);
      const angle = (Math.floor(seed) % 4) * (Math.PI / 2) + Math.PI / 4;
      const offsetDist = this.zoom >= 16 ? 22 : 14;
      const fx = p.x + Math.cos(angle) * offsetDist;
      const fy = p.y + Math.sin(angle) * offsetDist;
      const d = (fx - sx) ** 2 + (fy - sy) ** 2;
      if (d < bestD) { bestD = d; best = st; }
    }
    return best;
  }

  async _loadBrasilLayers() {
    if (this.loadingBrasil || this.brasilGeo) return;
    this.loadingBrasil = true;
    try {
      const res = await fetch(`${this.apiBase}/api/mapas/camadas/brasil.json`);
      if (res.ok) {
        const g = await res.json();
        const calcBbox = (coords, isMulti) => {
          let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
          const scanRing = (ring) => {
            for (let i = 0; i < ring.length; i++) {
              const x = ring[i][0]; const y = ring[i][1];
              if (x < minX) minX = x; if (x > maxX) maxX = x;
              if (y < minY) minY = y; if (y > maxY) maxY = y;
            }
          };
          if (isMulti) {
            for (const poly of coords) {
              if (Array.isArray(poly[0]) && Array.isArray(poly[0][0])) {
                for (const r of poly) scanRing(r);
              } else {
                scanRing(poly);
              }
            }
          } else {
            scanRing(coords);
          }
          return [minX, minY, maxX, maxY];
        };
        for (const arr of [g.ufs, g.urban, g.rivers, g.roads]) {
          if (!Array.isArray(arr)) continue;
          for (const f of arr) {
            const gt = f.geometry?.type;
            const c = f.geometry?.coordinates;
            if (!c) continue;
            if (gt === 'Polygon' || gt === 'MultiLineString') f._bbox = calcBbox(c, true);
            else if (gt === 'MultiPolygon') {
              let b = [Infinity, Infinity, -Infinity, -Infinity];
              for (const p of c) {
                const pb = calcBbox(p, true);
                if (pb[0] < b[0]) b[0] = pb[0]; if (pb[1] < b[1]) b[1] = pb[1];
                if (pb[2] > b[2]) b[2] = pb[2]; if (pb[3] > b[3]) b[3] = pb[3];
              }
              f._bbox = b;
            } else if (gt === 'LineString') {
              f._bbox = calcBbox(c, false);
            }
          }
        }
        // Pré-projeta coordenadas em Web Mercator normalizado (0..1) para renderização 60 FPS sem Math.log por vértice
        const projRing = (ring) => {
          const out = new Float32Array(ring.length * 2);
          for (let i = 0; i < ring.length; i++) {
            const lng = ring[i][0]; const lat = ring[i][1];
            const sinLat = Math.max(-0.9999, Math.min(0.9999, Math.sin((lat * Math.PI) / 180)));
            out[i * 2] = (lng + 180) / 360;
            out[i * 2 + 1] = 0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI);
          }
          return out;
        };
        const projGeom = (geom) => {
          if (!geom || !geom.coordinates) return null;
          const t = geom.type; const c = geom.coordinates;
          if (t === 'LineString') return [projRing(c)];
          if (t === 'MultiLineString' || t === 'Polygon') return c.map(projRing);
          if (t === 'MultiPolygon') {
            const rings = [];
            for (const poly of c) for (const r of poly) rings.push(projRing(r));
            return rings;
          }
          return null;
        };
        for (const arr of [g.ufs, g.urban, g.rivers, g.roads]) {
          if (!Array.isArray(arr)) continue;
          for (const f of arr) f._m = projGeom(f.geometry);
        }
        this.brasilGeo = g;
        this.needsRender = true;
      }
    } catch (_) {}
    this.loadingBrasil = false;
  }

  _scheduleMoveEnd() {
    clearTimeout(this.moveDebounceTimer);
    this.moveDebounceTimer = setTimeout(() => {
      this.needsRender = true;
      if (this.onMoveEnd) this.onMoveEnd({ lat: this.lat, lng: this.lng, zoom: this.zoom });
    }, 160);
  }

  _fetchTile(z, x, y) {
    if (this.tileFetchPaused) return;
    const key = `${z}/${x}/${y}`;
    if (this.tileCache.has(key) || this.pendingTiles.has(key)) return;
    if (this.tileQueue.some((t) => t.key === key)) return;

    this.tileQueue.push({ key, z, x, y });
    this._processTileQueue();
  }

  async _processTileQueue() {
    while (this.activeFetches < this.maxConcurrentFetches && this.tileQueue.length > 0) {
      const item = this.tileQueue.shift();
      if (!item || this.tileCache.has(item.key) || this.pendingTiles.has(item.key)) continue;

      this.pendingTiles.add(item.key);
      this.activeFetches++;
      const url = `${this.apiBase}/api/mapas/tiles/${item.z}/${item.x}/${item.y}.json`;

      (async () => {
        try {
          let data = null;
          // 1. Checa Cache Storage persistente do navegador (0ms, zero rede)
          if (typeof caches !== 'undefined') {
            try {
              const cache = await caches.open('ponte-maps-tiles-v1');
              const hit = await cache.match(url);
              if (hit) data = await hit.json();
              if (!data) {
                const res = await fetch(url);
                if (res.ok) {
                  await cache.put(url, res.clone());
                  data = await res.json();
                }
              }
            } catch (_) {}
          }
          if (!data) {
            const res = await fetch(url);
            if (res.ok) data = await res.json();
          }

          if (data) {
            if (this.tileCache.size > 40) {
              const first = this.tileCache.keys().next().value;
              this.tileCache.delete(first);
            }
            this.tileCache.set(item.key, data);
            this.needsRender = true;
          }
        } catch (_) {
        } finally {
          this.pendingTiles.delete(item.key);
          this.activeFetches--;
          this._processTileQueue();
        }
      })();
    }
  }

  _bindEvents() {
    window.addEventListener('resize', () => this._resize());

    this.canvas.addEventListener('mousedown', (e) => {
      this.isDragging = true;
      this.dragMoved = false;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      this.panVelX = 0;
      this.panVelY = 0;
      this.lastDragTime = performance.now();
      this.flyAnim = null;
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.isDragging) return;
      const dx = e.clientX - this.lastX;
      const dy = e.clientY - this.lastY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) this.dragMoved = true;
      const now = performance.now();
      const dt = Math.max(1, now - (this.lastDragTime || now));
      this.panVelX = (dx / dt) * 16;
      this.panVelY = (dy / dt) * 16;
      this.lastDragTime = now;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      this._panBy(dx, dy);
    });

    window.addEventListener('mouseup', (e) => {
      if (this.isDragging) {
        if (!this.dragMoved && e.target === this.canvas) {
          const rect = this.canvas.getBoundingClientRect();
          const sx = e.clientX - rect.left;
          const sy = e.clientY - rect.top;

          // 1. Checa clique em Rota Alternativa (para troca instantânea de percurso)
          const hitAlt = this._hitTestAlternativeRoute(sx, sy);
          if (hitAlt) {
            this.selectAlternativeRoute(hitAlt.id);
            return;
          }

          const hitStore = this._hitTestStore(sx, sy);
          const hitPoi = hitStore ? null : this._hitTestPoi(sx, sy);
          if (hitStore && this.onStoreClick) {
            this.onStoreClick(hitStore);
          } else if (hitPoi && hitPoi.tipo === 'pedagio' && this.onTollClick) {
            this.onTollClick(hitPoi.item);
          } else if (hitPoi && hitPoi.tipo === 'radar' && this.onRadarClick) {
            this.onRadarClick(hitPoi.item);
          } else {
            const coords = this.screenToLatLng(sx, sy);
            if (this.onMapClick) this.onMapClick(coords);
          }
        } else if (this.dragMoved) {
          // Limita velocidade máxima de inércia para rolagem sedosa
          const speed = Math.hypot(this.panVelX, this.panVelY);
          if (speed > 28) {
            const f = 28 / speed;
            this.panVelX *= f;
            this.panVelY *= f;
          } else if (speed < 0.6) {
            this.panVelX = 0;
            this.panVelY = 0;
          }
          this._scheduleMoveEnd();
        }
      }
      this.isDragging = false;
    });

    // Navegação Acessível e Visão de Cockpit via Teclado (Setas do Teclado)
    window.addEventListener('keydown', (e) => {
      if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA')) return;
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        this.setZoom(Math.min(21.0, this.zoom + 0.5));
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        this.setZoom(Math.max(4.0, this.zoom - 0.5));
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        this._panBy(45, 0);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        this._panBy(-45, 0);
      } else if (e.key.toLowerCase() === 'd') {
        e.preventDefault();
        this.setDriverMode(!this.driverMode);
      } else if (e.key.toLowerCase() === 'g') {
        e.preventDefault();
        this.glanceDestination();
      }
    });

    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.flyAnim = null;
      const rect = this.canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const before = this.screenToLatLng(mx, my);

      // Zoom contínuo interpolado a 60 FPS ancorado no cursor
      const rawDelta = e.deltaY;
      const factor = e.deltaMode === 1 ? 0.06 : (e.deltaMode === 2 ? 0.45 : 0.0024);
      const delta = Math.max(-0.65, Math.min(0.65, -rawDelta * factor));
      this.targetZoom = Math.max(4, Math.min(21.0, (this.targetZoom ?? this.zoom) + delta));
      this.zoomAnchor = { mx, my, lat: before.lat, lng: before.lng };
      this._scheduleMoveEnd();
      this.needsRender = true;
    }, { passive: false });

    // Touch Events (Mobile 1 dedo pan, 2 dedos pinch-to-zoom)
    this.canvas.addEventListener('touchstart', (e) => {
      this.flyAnim = null;
      if (e.touches.length === 1) {
        this.isDragging = true;
        this.dragMoved = false;
        this.lastX = e.touches[0].clientX;
        this.lastY = e.touches[0].clientY;
      } else if (e.touches.length === 2) {
        this.isDragging = false;
        this.pinchDist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
      }
    }, { passive: true });

    this.canvas.addEventListener('touchmove', (e) => {
      if (e.touches.length === 1 && this.isDragging) {
        e.preventDefault();
        const dx = e.touches[0].clientX - this.lastX;
        const dy = e.touches[0].clientY - this.lastY;
        if (Math.abs(dx) > 4 || Math.abs(dy) > 4) this.dragMoved = true;
        this.lastX = e.touches[0].clientX;
        this.lastY = e.touches[0].clientY;
        this._panBy(dx, dy);
      } else if (e.touches.length === 2) {
        e.preventDefault();
        const dist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        if (this.pinchDist > 0) {
          const zoomDelta = (dist - this.pinchDist) * 0.012;
          this.setZoom(this.zoom + zoomDelta);
        }
        this.pinchDist = dist;
      }
    }, { passive: false });

    this.canvas.addEventListener('touchend', (e) => {
      if (this.isDragging && !this.dragMoved && e.changedTouches.length === 1) {
        const rect = this.canvas.getBoundingClientRect();
        const t = e.changedTouches[0];
        const coords = this.screenToLatLng(t.clientX - rect.left, t.clientY - rect.top);
        if (this.onMapClick) this.onMapClick(coords);
      }
      this.isDragging = false;
      this.pinchDist = 0;
    });
  }

  _panBy(dx, dy) {
    const center = PonteMapEngine.project(this.lat, this.lng, this.zoom);
    const next = PonteMapEngine.unproject(center.x - dx, center.y - dy, this.zoom);
    this.lat = Math.max(-80, Math.min(80, next.lat));
    this.lng = next.lng;
    this.needsRender = true;
  }

  _startLoop() {
    const tick = (now) => {
      if (this.flyAnim) {
        this.flyAnim(now);
        this.targetZoom = this.zoom;
      }

      // Interpolação suave de zoom (60 FPS sem saltos)
      if (!this.flyAnim && this.targetZoom !== undefined && Math.abs(this.targetZoom - this.zoom) > 0.002) {
        this.zoom += (this.targetZoom - this.zoom) * 0.28;
        if (Math.abs(this.targetZoom - this.zoom) <= 0.002) this.zoom = this.targetZoom;
        if (this.onZoomChange) this.onZoomChange(this.zoom);

        if (this.zoomAnchor) {
          const afterProj = PonteMapEngine.project(this.zoomAnchor.lat, this.zoomAnchor.lng, this.zoom);
          const isHeadUp = this.driverMode && this.headingUp && this.currentVehicleAngle !== undefined;
          const ax = this.width / 2;
          const ay = isHeadUp ? this.height * 0.70 : this.height / 2;
          let unX = this.zoomAnchor.mx;
          let unY = this.zoomAnchor.my;
          if (isHeadUp) {
            const rot = this.currentVehicleAngle + Math.PI / 2;
            const cos = Math.cos(rot);
            const sin = Math.sin(rot);
            const dx = unX - ax;
            const dy = unY - ay;
            unX = ax + dx * cos - dy * sin;
            unY = ay + dx * sin + dy * cos;
          }
          const newCenter = PonteMapEngine.unproject(afterProj.x - (unX - ax), afterProj.y - (unY - ay), this.zoom);
          this.lat = Math.max(-80, Math.min(80, newCenter.lat));
          this.lng = newCenter.lng;
        }
        this.needsRender = true;
      } else if (!this.flyAnim) {
        this.zoomAnchor = null;
      }

      // Inércia e Rolagem Sedosa Contínua (Kinetic Glide)
      if (!this.isDragging && !this.flyAnim && (Math.abs(this.panVelX) > 0.04 || Math.abs(this.panVelY) > 0.04)) {
        this._panBy(this.panVelX, this.panVelY);
        this.panVelX *= 0.91;
        this.panVelY *= 0.91;
        if (Math.abs(this.panVelX) < 0.04 && Math.abs(this.panVelY) < 0.04) {
          this.panVelX = 0;
          this.panVelY = 0;
          this._scheduleMoveEnd();
        }
      }

      if (this.needsRender) {
        this._render();
        this.needsRender = false;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  // Paleta cartográfica de alta fidelidade (estilo Google Maps / Apple Maps / Uber)
  _getHqPalette() {
    if (this.theme === 'light') {
      return {
        land: '#f8f9fa',
        landuse: {
          residential: '#f1f3f4', commercial: '#edf2f7', industrial: '#ebe8ef', farm: '#eef0e2',
          wood: '#e2efe5', grass: '#e6f2e8', park: '#d8ebd9', cemetery: '#dde8da', sand: '#fef3c7',
          wetland: '#e0eceb', hospital: '#fee2e2', school: '#fef3c7', sport: '#dff0e4', parking: '#f3f4f6'
        },
        water: '#dce7f3', waterLine: '#6488b4', canalWall: '#64748b', aero: '#e8eaed',
        bldg: '#e9ecef', bldgStroke: '#d1d5db', bldgTop: '#f1f3f4', bldgWall: '#d1d5db', bldgShadow: 'rgba(0,0,0,0.08)',
        roads: {
          motorway: ['#c2410c', '#fbbf24'], trunk: ['#d97706', '#fcd34d'], primary: ['#b45309', '#fef08a'],
          secondary: ['#64748b', '#ffffff'], tertiary: ['#64748b', '#ffffff'], minor: ['#cbd5e1', '#ffffff'],
          service: ['#e2e8f0', '#ffffff'], track: ['#cbd5e1', '#fbfaf7'], path: [null, '#cbd5e1'],
          raceway: ['#cbd5e1', '#ffe4e6'], busway: ['#7c3aed', '#ede9fe']
        },
        tunnelAlpha: 0.45, bridgeCasing: '#475569', bridgeShadow: 'rgba(15, 23, 42, 0.26)',
        roundaboutIsland: '#d8ebd9', roundaboutCurb: '#64748b',
        rail: '#94a3b8', railDash: '#ffffff',
        text: '#202124', textHalo: 'rgba(255,255,255,0.98)', textMinor: '#5f6368', hn: '#80868b',
        oneway: 'rgba(95,99,104,0.70)', placeText: '#5f6368'
      };
    }
    return {
      land: '#090e17',
      landuse: {
        residential: '#0f172a', commercial: '#131d35', industrial: '#11192e', farm: '#0f1a26',
        wood: '#0b2922', grass: '#0d332a', park: '#0f3d32', cemetery: '#0f2420', sand: '#1e2424',
        wetland: '#0c2433', hospital: '#3b0718', school: '#2e1c12', sport: '#0d332a', parking: '#1e293b'
      },
      water: '#0c2340', waterLine: '#255485', canalWall: '#475569', aero: '#1e293b',
      bldg: '#1e293b', bldgStroke: '#334155', bldgTop: '#243048', bldgWall: '#111827', bldgShadow: 'rgba(0,0,0,0.40)',
      roads: {
        motorway: ['#7c2d12', '#f59e0b'], trunk: ['#854d0e', '#eab308'], primary: ['#334155', '#94a3b8'],
        secondary: ['#090e17', '#475569'], tertiary: ['#090e17', '#3b4a66'], minor: ['#090e17', '#2b3954'],
        service: ['#090e17', '#222e45'], track: ['#090e17', '#292524'], path: [null, '#3b4a66'],
        raceway: ['#090e17', '#3b0724'], busway: ['#0f172a', '#a855f7']
      },
      tunnelAlpha: 0.4, bridgeCasing: '#64748b', bridgeShadow: 'rgba(0, 0, 0, 0.60)',
      roundaboutIsland: '#0f3d32', roundaboutCurb: '#64748b',
      rail: '#475569', railDash: '#0f172a',
      text: '#f8fafc', textHalo: 'rgba(9,14,23,0.95)', textMinor: '#94a3b8', hn: '#64748b',
      oneway: 'rgba(148,163,184,0.60)', placeText: '#94a3b8'
    };
  }

  _getPalette() {
    if (this.theme === 'light') {
      // Estilo Google Maps Classic
      return {
        bg: '#f8f9fa',
        land: '#f8f9fa',
        stateBorder: '#bdc1c6',
        urban: '#f1f3f4',
        water: '#dce7f3',
        waterLine: '#6488b4',
        park: '#d8ebd9',
        parkText: '#137333',
        bldgFill: '#e9ecef',
        bldgTop: '#f1f3f4',
        bldgSide: '#d1d5db',
        bldgStroke: '#cbd5e1',
        roadCasing: '#94a3b8',
        highwayFill: '#fbbf24',
        highwayCasing: '#c2410c',
        primaryFill: '#fef08a',
        primaryCasing: '#b45309',
        streetFill: '#ffffff',
        roadText: '#202124',
        roadTextHalo: '#ffffff',
        poiBg: '#ffffff',
        poiText: '#202124',
        cityText: '#202124'
      };
    }
    // Estilo Uber / Waze Night Pro (Alto Contraste Cartográfico)
    return {
      bg: '#071322',
      land: '#101829',
      stateBorder: '#3b4f73',
      urban: '#172238',
      water: '#071322',
      waterLine: '#255485',
      park: '#0f3d32',
      parkText: '#34d399',
      bldgFill: '#1e293b',
      bldgTop: '#243048',
      bldgSide: '#111827',
      bldgStroke: '#334155',
      roadCasing: '#090e17',
      highwayFill: '#f59e0b',
      highwayCasing: '#7c2d12',
      primaryFill: '#94a3b8',
      primaryCasing: '#0f172a',
      streetFill: '#334155',
      roadText: '#f8fafc',
      roadTextHalo: '#090e17',
      poiBg: '#1e293b',
      poiText: '#f8fafc',
      cityText: '#cbd5e1'
    };
  }

  _render() {
    const ctx = this.ctx;
    const pal = this._getPalette();

    const ax = this.width / 2;
    const ay = (this.driverMode && this.headingUp) ? this.height * 0.70 : this.height / 2;

    // Atualiza rotação suave da câmera no modo visão do motorista (Heading-Up)
    if (this.driverMode && this.headingUp && this.currentVehicleAngle !== undefined) {
      const targetCam = -this.currentVehicleAngle - Math.PI / 2;
      let diff = targetCam - this.cameraAngle;
      while (diff < -Math.PI) diff += Math.PI * 2;
      while (diff > Math.PI) diff -= Math.PI * 2;
      this.cameraAngle += diff * 0.22;
    } else {
      this.cameraAngle = 0;
    }

    ctx.save();
    ctx.scale(this.dpr, this.dpr);

    if (this.driverMode && this.headingUp && Math.abs(this.cameraAngle) > 0.001) {
      ctx.translate(ax, ay);
      ctx.rotate(this.cameraAngle);
      ctx.translate(-ax, -ay);
    }

    // 1. Fundo (oceano em zoom nacional/regional para destacar o continente brasileiro)
    ctx.fillStyle = this.zoom < 11.5 ? pal.water : pal.land;
    ctx.fillRect(0, 0, this.width, this.height);

    const hqOn = this._hqActive();
    const showBrasilBase = this.zoom < 13.0 || !hqOn;

    // 2. Camada Nacional do Brasil (Fundo geográfico contínuo para todo o território nacional)
    if (showBrasilBase) {
      if (!this.brasilGeo && !this.loadingBrasil) this._loadBrasilLayers();
      if (this.brasilGeo) this._renderBrasilGeo(ctx, pal, 'base');
    }

    let hqTiles = null;
    if (hqOn) {
      const hp = this._getHqPalette();
      hqTiles = this._hqVisibleTiles();
      this._renderHqBase(ctx, hp, hqTiles, { n: 12 });
    }

    // 2.5 Topografia: Hillshade + Tinta Hipsométrica + Curvas de Nível (desenhada abaixo das vias/rios/fronteiras)
    if (this.showTerrain && this.zoom < 15.5) {
      ctx.save();
      if (hqOn) {
        ctx.globalAlpha = Math.max(0, Math.min(1, (15.5 - this.zoom) / 2.5)) * 0.42;
      } else {
        ctx.globalAlpha = this.zoom < 8.5 ? 0.55 : 0.65;
      }
      this._renderTerrain(ctx, pal);
      ctx.restore();
    }

    // 2.8 Fronteiras Estaduais (e Rios/Rodovias Nacionais quando HQ não está ativo) SEMPRE acima do relevo
    if (showBrasilBase && this.brasilGeo) {
      this._renderBrasilGeo(ctx, pal, hqOn ? 'borders' : 'overlay');
    }

    // 3. Vias, ferrovias e edifícios: HQ v2 (nítido) ou tiles legados
    const isZooming = this.targetZoom !== undefined && Math.abs(this.targetZoom - this.zoom) > 0.01;
    if (hqOn) {
      const hp = this._getHqPalette();
      this._renderHqTop(ctx, hp, hqTiles);
      if (!this.isDragging && !this.flyAnim && !isZooming) this._renderHqLabels(ctx, hp, hqTiles);
    } else if (this.zoom >= 11.5) {
      this._renderVectorTiles(ctx, pal);
    }

    // 3.5 Limites de Velocidade (vias coloridas por km/h + placas R-19) e Sinalização (semáforos, radares, lombadas)
    if ((this.showSpeed || this.showSignals) && this.zoom >= 12.5) {
      const shards = this._visibleSignalShards();
      if (this.showSpeed) this._renderSpeedLimits(ctx, pal, shards);
      if (this.showSignals) this._renderSignals(ctx, pal, shards);
    }

    // 3.8 Praças de Pedágio Nacionais (ANTT + OSM) sempre visíveis
    if (this.showTolls && this.zoom >= 6.5) {
      if (!this.tolls.length) this._loadTolls();
      this._renderTolls(ctx, pal);
    }

    // 4. Rótulos das Principais Cidades Brasileiras em Zoom Nacional/Regional (< 11.5) apenas quando HQ não está ativo
    if (!hqOn && this.brasilGeo && this.brasilGeo.cidades && this.zoom < 11.5) {
      this._renderCidadesLabels(ctx, pal);
    }

    // 5. Rota Ativa, Pedágios e Veículo 60 FPS
    if (this.routeData && this.routeData.valido) {
      this._renderRoute(ctx, pal);
    }

    // 5.5 Camada de Lojas & Comércios Ativos (Com Clusterização Inteligente & Ícones por Categoria)
    if (this.showStores && this.stores.length > 0) {
      this._renderStores(ctx, pal);
    }

    // 6. Pin de Clique ("O que há aqui?")
    if (this.customPin) {
      const p = this.latLngToScreen(this.customPin.lat, this.customPin.lng);
      ctx.save();
      ctx.beginPath();
      ctx.arc(p.x, p.y, 14, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(239, 68, 68, 0.25)';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
      ctx.fillStyle = '#ef4444';
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
      ctx.restore();
    }

    // 7. Escala Gráfica Dinâmica (km / m)
    this._renderScaleBar(ctx, pal);

    // 8. Perfil Altimétrico da Rota Ativa
    if (this.routeData && this.routeData.valido && this.routeData.perfilAltimetrico && this.routeData.perfilAltimetrico.disponivel) {
      this._renderElevationProfile(ctx, pal);
    }

    ctx.restore();
    this._updateCoverageStatus();
  }

  _updateRouteQualityStatus() {
    if (!this.routeQualityElement) return;
    const quality = this.routeData?.qualidadeRoteamento;
    this.routeQualityElement.hidden = !quality;
    if (!quality) return;
    const isApproximate = quality.nivel === 'aproximado';
    this.routeQualityElement.style.color = isApproximate ? '#fbbf24' : '#86efac';
    this.routeQualityElement.textContent = isApproximate
      ? `Rota aproximada: ${quality.mensagem}. Confira o trajeto antes de sair.`
      : `Malha viária: ${quality.mensagem}.`;
    this.routeQualityElement.setAttribute('aria-label', this.routeQualityElement.textContent);
  }

  _updateCoverageStatus() {
    const element = this.coverageStatusElement;
    const now = performance.now();
    if (!element || now - this.lastCoverageUpdateAt < 400) return;
    this.lastCoverageUpdateAt = now;

    const describe = (coverage) => {
      if (coverage.status === 'loading') return 'carregando índice';
      return `${coverage.percent}% listado (${coverage.native} nativo, ${coverage.fallback} ancestral, ${coverage.missing} ausente)`;
    };
    const loadState = (index, error) => error
      ? `falha ao carregar índice (${error})`
      : (index ? null : 'carregando índice');
    const details = [];
    if (this.zoom >= 4.0) {
      const state = loadState(this.hqIndex, this.hqIndexError);
      const hqZ = this._hqTileZoom();
      const fbZooms = [13, 12, 10, 8, 6, 5, 4].filter((z) => z < hqZ);
      details.push(`Ruas HQ: ${state || describe(resumirCoberturaViewport({
        lat: this.lat, lng: this.lng, zoom: this.zoom, width: this.width, height: this.height,
        tileZoom: hqZ, index: this.hqIndex,
        fallbackZooms: fbZooms
      }))}`);
    } else {
      details.push('Ruas HQ: aproxime o zoom para verificar');
    }

    if (this.showTerrain && this.zoom < 15.5) {
      const terrainZoom = this._terrainZoomFor(this.zoom);
      const state = loadState(this.terrainIndex, this.terrainIndexError);
      details.push(`Relevo: ${state || describe(resumirCoberturaViewport({
        lat: this.lat, lng: this.lng, zoom: this.zoom, width: this.width, height: this.height,
        tileZoom: terrainZoom, index: this.terrainIndex,
        fallbackZooms: terrainZoom === 12 ? [10, 7] : (terrainZoom === 10 ? [7] : [])
      }))}`);
    } else {
      details.push(`Relevo: ${this.showTerrain ? 'indisponível neste zoom' : 'desativado'}`);
    }

    const signature = details.join(' • ');
    if (signature !== this.lastCoverageSignature) {
      element.textContent = `Cobertura listada no enquadramento atual • ${signature}`;
      this.lastCoverageSignature = signature;
    }
  }

  // ════════ TOPOGRAFIA ════════
  _terrainZoomFor(zoom) {
    if (zoom >= 11.5) return 12;
    if (zoom >= 8.5) return 10;
    return 7;
  }

  _getTerrainBitmap(key, z, grid) {
    const bmpKey = `${key}_${this.theme}_${z >= 12 && this.zoom >= 13.5 ? 'c' : 'n'}`;
    if (this.terrainBitmaps.has(bmpKey)) return this.terrainBitmaps.get(bmpKey);

    const G = 128;
    const S = 128;
    const dark = this.theme === 'dark';
    const [, , ty] = key.split('/').map(Number);
    const n = Math.PI - (2 * Math.PI * (ty + 0.5)) / Math.pow(2, z);
    const latC = Math.atan(Math.sinh(n));
    const cellM = (40075016 * Math.cos(latC)) / Math.pow(2, z) / G;
    const exag = z >= 12 ? 1.6 : z >= 10 ? 2.6 : 5;

    // Azimute 315° (NO), altitude 45° — vetor solar unitário pré-calculado (zero trig por pixel)
    const az = (315 * Math.PI) / 180;
    const alt = (45 * Math.PI) / 180;
    const sinAlt = Math.sin(alt); const cosAlt = Math.cos(alt);
    const lx = cosAlt * Math.sin(az);
    const ly = -cosAlt * Math.cos(az);
    const lz = sinAlt;
    const contours = z >= 12 && this.zoom >= 13.5;
    const interval = 25;

    const off = document.createElement('canvas');
    off.width = S;
    off.height = S;
    const octx = off.getContext('2d');
    const img = octx.createImageData(S, S);
    const px4 = img.data;
    const inv2StepExag = exag / (2 * cellM);

    for (let py = 0; py < S; py++) {
      const row = py * S;
      const rowU = Math.max(0, py - 1) * S;
      const rowD = Math.min(S - 1, py + 1) * S;
      for (let px = 0; px < S; px++) {
        const i = row + px;
        const h = grid[i];
        if (h <= 0) continue;
        const hl = grid[row + Math.max(0, px - 1)];
        const hr = grid[row + Math.min(S - 1, px + 1)];
        const hu = grid[rowU + px];
        const hd = grid[rowD + px];
        const nx = (hl - hr) * inv2StepExag;
        const ny = (hu - hd) * inv2StepExag;
        let shade = (lx * nx + ly * ny + lz) / Math.sqrt(nx * nx + ny * ny + 1);
        if (shade < 0) shade = 0;
        else if (shade > 1) shade = 1;

        let r = 0; let g = 0; let b = 0; let a = 0;
        const dlt = shade - sinAlt;
        if (dlt < 0) {
          a = Math.min(dark ? 115 : 85, -dlt * (dark ? 320 : 230));
        } else {
          r = 255; g = 255; b = 255;
          a = Math.min(dark ? 28 : 52, dlt * (dark ? 95 : 160));
        }
        // Tinta hipsométrica sutil em zoom regional (planícies neutras → planaltos ocre)
        if (this.zoom < 11 && a < 32) {
          const t = Math.min(1, h / 1400);
          if (dark) { r = 36 + 48 * t; g = 48 + 22 * t; b = 44; }
          else { r = 185 + 45 * t; g = 198 - 22 * t; b = 165 - 30 * t; }
          a = Math.max(a, 12);
        }

        if (contours && h > 3) {
          const band = Math.floor(h / interval);
          const bR = Math.floor(hr / interval);
          const bD = Math.floor(hd / interval);
          if (band !== bR || band !== bD) {
            const index = band % 4 === 0 || bR % 4 === 0;
            if (dark) { r = 180; g = 140; b = 90; } else { r = 140; g = 95; b = 50; }
            a = index ? 55 : 24;
          }
        }

        const o = i * 4;
        px4[o] = r; px4[o + 1] = g; px4[o + 2] = b; px4[o + 3] = a;
      }
    }
    octx.putImageData(img, 0, 0);

    if (this.terrainBitmaps.size >= 260) this.terrainBitmaps.delete(this.terrainBitmaps.keys().next().value);
    this.terrainBitmaps.set(bmpKey, off);
    return off;
  }

  _renderTerrain(ctx) {
    if (!this.terrainIndex) {
      this._loadTerrainIndex();
      return;
    }
    let tz = this._terrainZoomFor(this.zoom);
    const center = PonteMapEngine.tileOf(this.lat, this.lng, tz);
    while (tz > 7 && !this._hasTerrain(tz, center.x, center.y)) {
      tz = tz === 12 ? 10 : 7;
      const c2 = PonteMapEngine.tileOf(this.lat, this.lng, tz);
      center.x = c2.x; center.y = c2.y;
    }

    const scaleFactor = 256 * Math.pow(2, this.zoom - tz);
    const cp = PonteMapEngine.project(this.lat, this.lng, this.zoom);
    const tlx = cp.x - this.width / 2;
    const tly = cp.y - this.height / 2;
    const minTx = Math.floor(tlx / scaleFactor);
    const maxTx = Math.floor((tlx + this.width) / scaleFactor);
    const minTy = Math.floor(tly / scaleFactor);
    const maxTy = Math.floor((tly + this.height) / scaleFactor);
    if ((maxTx - minTx + 1) * (maxTy - minTy + 1) > 320) return;

    let builtThisFrame = 0;
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    for (let tx = minTx; tx <= maxTx; tx++) {
      for (let ty = minTy; ty <= maxTy; ty++) {
        let drawZ = tz;
        let drawX = tx;
        let drawY = ty;
        let drawScale = scaleFactor;
        let drawOx = tx * scaleFactor - tlx;
        let drawOy = ty * scaleFactor - tly;

        if (!this._hasTerrain(tz, tx, ty)) {
          // Fallback para tile pai (z10 ou z7) para nunca deixar buracos no relevo
          let foundParent = false;
          const fallbacks = tz === 12 ? [10, 7] : (tz === 10 ? [7] : []);
          for (const pz of fallbacks) {
            const shift = tz - pz;
            const px = tx >> shift;
            const py = ty >> shift;
            if (this._hasTerrain(pz, px, py)) {
              drawZ = pz; drawX = px; drawY = py;
              drawScale = scaleFactor * Math.pow(2, shift);
              drawOx = px * drawScale - tlx;
              drawOy = py * drawScale - tly;
              foundParent = true;
              break;
            }
          }
          if (!foundParent) continue;
        }

        const key = `${drawZ}/${drawX}/${drawY}`;
        const grid = this.terrainGrids.get(key);
        if (grid === undefined) { this._fetchTerrain(drawZ, drawX, drawY); continue; }
        if (!grid) continue;
        const bmpKey = `${key}_${this.theme}_${drawZ >= 12 && this.zoom >= 13.5 ? 'c' : 'n'}`;
        if (!this.terrainBitmaps.has(bmpKey)) {
          if (builtThisFrame >= 4) { setTimeout(() => { this.needsRender = true; }, 16); continue; }
          builtThisFrame++;
        }
        const bmp = this._getTerrainBitmap(key, drawZ, grid);
        if (drawZ === tz) {
          ctx.drawImage(bmp, drawOx, drawOy, drawScale + 0.5, drawScale + 0.5);
        } else {
          ctx.save();
          ctx.beginPath();
          ctx.rect(tx * scaleFactor - tlx, ty * scaleFactor - tly, scaleFactor + 0.6, scaleFactor + 0.6);
          ctx.clip();
          ctx.drawImage(bmp, drawOx, drawOy, drawScale + 0.5, drawScale + 0.5);
          ctx.restore();
        }
      }
    }
    ctx.restore();
  }

  // ════════ LIMITES DE VELOCIDADE ════════
  static speedColor(kmh) {
    if (kmh <= 30) return '#22c55e';
    if (kmh <= 40) return '#84cc16';
    if (kmh <= 50) return '#eab308';
    if (kmh <= 60) return '#f97316';
    if (kmh <= 80) return '#ef4444';
    return '#a855f7';
  }

  _drawSpeedSign(ctx, x, y, kmh, r = 11) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.lineWidth = Math.max(2.4, r * 0.24);
    ctx.strokeStyle = '#dc2626';
    ctx.stroke();
    ctx.fillStyle = '#0f172a';
    ctx.font = `900 ${kmh >= 100 ? r * 0.78 : r * 0.95}px -apple-system, "Segoe UI", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(kmh), x, y + 0.5);
  }

  _renderSpeedLimits(ctx, pal, shards) {
    const groups = new Map();
    const signs = [];
    for (const sh of shards) {
      for (const w of sh.v) {
        const kmh = w[0];
        const f = w[3];
        let arr = groups.get(kmh);
        if (!arr) { arr = []; groups.set(kmh, arr); }
        const pts = [];
        let onScreen = false;
        for (let i = 0; i + 1 < f.length; i += 2) {
          const p = this.latLngToScreen(f[i], f[i + 1]);
          if (p.x > -50 && p.x < this.width + 50 && p.y > -50 && p.y < this.height + 50) onScreen = true;
          pts.push(p);
        }
        if (!onScreen) continue;
        arr.push(pts);
        if (this.zoom >= 14.5) signs.push({ p: pts[Math.floor(pts.length / 2)], kmh, cls: w[1] });
      }
    }

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const lw = Math.max(2, Math.min(5, (this.zoom - 11) * 0.9));
    for (const [kmh, lines] of groups) {
      ctx.beginPath();
      for (const pts of lines) {
        pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      }
      ctx.strokeStyle = PonteMapEngine.speedColor(kmh);
      ctx.globalAlpha = 0.72;
      ctx.lineWidth = lw;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    if (!this.isDragging && !this.flyAnim) {
      signs.sort((a, b) => a.cls - b.cls);
      const placed = [];
      for (const s of signs) {
        if (s.p.x < 14 || s.p.y < 14 || s.p.x > this.width - 14 || s.p.y > this.height - 14) continue;
        if (placed.some((q) => Math.abs(q.x - s.p.x) < 44 && Math.abs(q.y - s.p.y) < 44)) continue;
        placed.push(s.p);
        this._drawSpeedSign(ctx, s.p.x, s.p.y, s.kmh, 10.5);
        if (placed.length > 40) break;
      }
    }

    // Legenda compacta
    const legend = [30, 40, 50, 60, 80, 100];
    const hasProfile = this.routeData && this.routeData.perfilAltimetrico && this.routeData.perfilAltimetrico.disponivel;
    const lx = this.width - 56 - legend.length * 30;
    const ly = this.height - (hasProfile ? 110 : 92);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.82)';
    ctx.beginPath();
    ctx.roundRect(lx - 8, ly - 10, legend.length * 30 + 10, 22, 6);
    ctx.fill();
    ctx.font = '800 9px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    legend.forEach((k, i) => {
      ctx.fillStyle = PonteMapEngine.speedColor(k);
      ctx.fillRect(lx + i * 30, ly - 2, 8, 4);
      ctx.fillStyle = '#e2e8f0';
      ctx.fillText(String(k), lx + i * 30 + 10, ly + 0.5);
    });
    ctx.restore();
  }

  // ════════ SEMÁFOROS, RADARES E LOMBADAS ════════
  _drawTrafficLight(ctx, x, y, s = 1, lat = null, lng = null) {
    let ciclo = null;
    if (lat !== null && lng !== null) {
      // Ciclo semafórico dinâmico e determinístico em tempo real
      const seed = Math.abs(Math.sin(lat * 12.9898 + lng * 78.233) * 43758.5453);
      const ciclosPossiveis = [60, 75, 90, 105];
      const cicloTotal = ciclosPossiveis[Math.floor((seed % 1) * ciclosPossiveis.length)];
      const verdeDuracao = Math.floor(cicloTotal * 0.52);
      const amareloDuracao = 4;
      const offsetFase = Math.floor((seed * 100) % cicloTotal);
      const tempoDecorrido = Math.floor(((Date.now() / 1000) + offsetFase) % cicloTotal);

      if (tempoDecorrido < verdeDuracao) {
        ciclo = { estado: 'VERDE', restante: verdeDuracao - tempoDecorrido, cor: '#22c55e', ativaIdx: 2 };
      } else if (tempoDecorrido < verdeDuracao + amareloDuracao) {
        ciclo = { estado: 'AMARELO', restante: (verdeDuracao + amareloDuracao) - tempoDecorrido, cor: '#facc15', ativaIdx: 1 };
      } else {
        ciclo = { estado: 'VERMELHO', restante: cicloTotal - tempoDecorrido, cor: '#ef4444', ativaIdx: 0 };
      }
    }

    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x - 3.8 * s, y - 8.5 * s, 7.6 * s, 17 * s, 2.5 * s);
    ctx.fillStyle = '#090e17';
    ctx.fill();
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = '#334155';
    ctx.stroke();

    const cols = ['#ef4444', '#facc15', '#22c55e'];
    const offCols = ['rgba(239, 68, 68, 0.22)', 'rgba(250, 204, 21, 0.22)', 'rgba(34, 197, 94, 0.22)'];

    for (let i = 0; i < 3; i++) {
      const isAtiva = ciclo ? ciclo.ativaIdx === i : true;
      const cy = y - 5.2 * s + i * 5.2 * s;
      ctx.beginPath();
      ctx.arc(x, cy, 1.9 * s, 0, Math.PI * 2);
      if (isAtiva && ciclo) {
        ctx.fillStyle = cols[i];
        ctx.shadowColor = cols[i];
        ctx.shadowBlur = 8;
        ctx.fill();
        ctx.shadowBlur = 0;
      } else {
        ctx.fillStyle = ciclo ? offCols[i] : cols[i];
        ctx.fill();
      }
    }

    // Temporizador Digital do Semáforo no modo de zoom elevado (estilo semáforo inteligente com contador regressivo)
    if (ciclo && this.zoom >= 16.2) {
      const timerTxt = `${ciclo.restante}s`;
      ctx.font = '800 8.5px monospace';
      const tw = ctx.measureText(timerTxt).width;
      const bx = x + 7 * s;
      const by = y - 6 * s;
      ctx.fillStyle = 'rgba(9, 14, 23, 0.92)';
      ctx.beginPath();
      ctx.roundRect(bx - 3, by - 6, tw + 6, 12, 3);
      ctx.fill();
      ctx.strokeStyle = ciclo.cor;
      ctx.lineWidth = 1.0;
      ctx.stroke();
      ctx.fillStyle = ciclo.cor;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(timerTxt, bx, by);
    }
    ctx.restore();
  }

  _drawRadar(ctx, x, y, kmh, highlight = false) {
    if (highlight) {
      ctx.beginPath();
      ctx.arc(x, y, 17, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(239, 68, 68, 0.28)';
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(x, y, 10, 0, Math.PI * 2);
    ctx.fillStyle = '#dc2626';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
    // Corpo da câmera + lente
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.roundRect(x - 5.5, y - 3.5, 8.5, 7, 1.5);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x + 3, y - 1.5);
    ctx.lineTo(x + 6, y - 3.2);
    ctx.lineTo(x + 6, y + 3.2);
    ctx.lineTo(x + 3, y + 1.5);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x - 1.2, y, 1.7, 0, Math.PI * 2);
    ctx.fillStyle = '#dc2626';
    ctx.fill();
    if (kmh) this._drawSpeedSign(ctx, x + 13, y - 11, kmh, 8.5);
  }

  _renderSignals(ctx, pal, shards) {
    const inView = (p, m = 14) => p.x > -m && p.x < this.width + m && p.y > -m && p.y < this.height + m;
    ctx.save();

    // Lombadas (apenas em zoom bem aproximado de rua z >= 16)
    if (this.zoom >= 16.0) {
      for (const sh of shards) {
        for (const l of sh.l) {
          const p = this.latLngToScreen(l[0], l[1]);
          if (!inView(p)) continue;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y - 7);
          ctx.lineTo(p.x + 7, p.y + 5);
          ctx.lineTo(p.x - 7, p.y + 5);
          ctx.closePath();
          ctx.fillStyle = '#facc15';
          ctx.fill();
          ctx.lineWidth = 1.4;
          ctx.strokeStyle = '#0f172a';
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(p.x, p.y + 3.2, 3, Math.PI, 0);
          ctx.strokeStyle = '#0f172a';
          ctx.lineWidth = 1.2;
          ctx.stroke();
        }
      }
    }

    // Semáforos com anti-colisão inteligente (evita poluição visual de centenas de ícones amontoados)
    if (this.zoom >= 14.8) {
      const s = this.zoom >= 16.5 ? 1.05 : 0.85;
      const placed = [];
      const minDist = this.zoom >= 16.5 ? 36 : 52;
      for (const sh of shards) {
        for (const t of sh.s) {
          const p = this.latLngToScreen(t[0], t[1]);
          if (!inView(p)) continue;
          if (placed.some((q) => Math.abs(q.x - p.x) < minDist && Math.abs(q.y - p.y) < minDist)) continue;
          placed.push(p);
          this._drawTrafficLight(ctx, p.x, p.y, s, t[0], t[1]);
          if (placed.length >= 24) break;
        }
        if (placed.length >= 24) break;
      }
    }

    // Radares com anti-colisão (destaca apenas os principais para deixar a malha de ruas limpa e nítida)
    if (this.zoom >= 13.5) {
      const placedR = [];
      const minDistR = this.zoom >= 16 ? 48 : 72;
      for (const sh of shards) {
        for (const r of sh.r) {
          const p = this.latLngToScreen(r[0], r[1]);
          if (!inView(p, 20)) continue;
          if (placedR.some((q) => Math.abs(q.x - p.x) < minDistR && Math.abs(q.y - p.y) < minDistR)) continue;
          placedR.push(p);
          this._drawRadar(ctx, p.x, p.y, this.zoom >= 14.5 ? r[2] : 0);
          if (placedR.length >= 16) break;
        }
        if (placedR.length >= 16) break;
      }
    }
    ctx.restore();
  }

  // ════════ PEDÁGIOS NACIONAIS ════════
  _renderTolls(ctx, pal) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const placed = [];
    const big = this.zoom >= 9;
    for (const t of this.tolls) {
      const p = this.latLngToScreen(t.lat, t.lng);
      if (p.x < -20 || p.y < -20 || p.x > this.width + 20 || p.y > this.height + 20) continue;
      if (!big && placed.some((q) => Math.abs(q.x - p.x) < 10 && Math.abs(q.y - p.y) < 10)) continue;
      placed.push(p);
      const r = big ? 9 : 5.5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fillStyle = t.fonte === 'tabela_antt' ? '#f59e0b' : '#fbbf24';
      ctx.fill();
      ctx.lineWidth = big ? 2 : 1.4;
      ctx.strokeStyle = '#0f172a';
      ctx.stroke();
      if (big) {
        ctx.fillStyle = '#0f172a';
        ctx.font = '900 10px sans-serif';
        ctx.fillText('$', p.x, p.y + 0.5);
        if (this.zoom >= 10.5 && t.tarifaCarro) {
          const label = 'R$ ' + t.tarifaCarro.toFixed(2).replace('.', ',');
          ctx.font = '800 10px -apple-system, "Segoe UI", sans-serif';
          ctx.lineWidth = 3;
          ctx.strokeStyle = pal.roadTextHalo;
          ctx.strokeText(label, p.x, p.y - 16);
          ctx.fillStyle = '#f59e0b';
          ctx.fillText(label, p.x, p.y - 16);
        }
      }
    }
    ctx.restore();
  }

  // ════════ PERFIL ALTIMÉTRICO DA ROTA ════════
  _renderElevationProfile(ctx) {
    const perf = this.routeData.perfilAltimetrico;
    const pts = perf.amostras.filter((a) => a.m !== null);
    if (pts.length < 2) return;
    const w = Math.min(260, this.width * 0.42);
    const h = 74;
    const x0 = this.width - w - 56;
    const y0 = this.height - h - 14;
    const minM = perf.altitudeMinM;
    const maxM = Math.max(perf.altitudeMaxM, minM + 10);
    const maxKm = pts[pts.length - 1].km || 1;
    const px = (km) => x0 + 8 + (km / maxKm) * (w - 16);
    const py = (m) => y0 + h - 10 - ((m - minM) / (maxM - minM)) * (h - 30);

    ctx.save();
    ctx.fillStyle = 'rgba(15, 23, 42, 0.86)';
    ctx.beginPath();
    ctx.roundRect(x0, y0, w, h, 8);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.lineWidth = 1;
    ctx.stroke();

    const grad = ctx.createLinearGradient(0, y0 + 16, 0, y0 + h);
    grad.addColorStop(0, 'rgba(163, 230, 53, 0.55)');
    grad.addColorStop(1, 'rgba(163, 230, 53, 0.04)');
    ctx.beginPath();
    ctx.moveTo(px(pts[0].km), y0 + h - 8);
    for (const p of pts) ctx.lineTo(px(p.km), py(p.m));
    ctx.lineTo(px(pts[pts.length - 1].km), y0 + h - 8);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.beginPath();
    pts.forEach((p, i) => (i === 0 ? ctx.moveTo(px(p.km), py(p.m)) : ctx.lineTo(px(p.km), py(p.m))));
    ctx.strokeStyle = '#a3e635';
    ctx.lineWidth = 1.8;
    ctx.stroke();

    // Posição atual do veículo no perfil
    const vKm = (this.vehicleProgress / 100) * maxKm;
    let vM = pts[0].m;
    for (let i = 1; i < pts.length; i++) {
      if (pts[i].km >= vKm) {
        const t = (vKm - pts[i - 1].km) / Math.max(0.0001, pts[i].km - pts[i - 1].km);
        vM = pts[i - 1].m + (pts[i].m - pts[i - 1].m) * t;
        break;
      }
    }
    ctx.beginPath();
    ctx.arc(px(vKm), py(vM), 3.6, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    ctx.fillStyle = '#e2e8f0';
    ctx.font = '800 9.5px -apple-system, "Segoe UI", sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(`ALTIMETRIA  ${minM}–${perf.altitudeMaxM} m`, x0 + 8, y0 + 5);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#a3e635';
    ctx.fillText(`▲${perf.ganhoElevacaoM} m  ▼${perf.perdaElevacaoM} m`, x0 + w - 8, y0 + 5);
    ctx.restore();
  }

  _currentSpeedLimit() {
    const sr = this.routeData && this.routeData.sinalizacaoRota;
    const wps = this.routeData && this.routeData.geometriaRota && this.routeData.geometriaRota.waypoints;
    if (!sr || !wps || !sr.trechosLimiteVelocidade || !sr.trechosLimiteVelocidade.length) return null;
    const idx = Math.floor((this.vehicleProgress / 100) * (wps.length - 1));
    return sr.trechosLimiteVelocidade.find((t) => idx >= t.deIndice && idx <= t.ateIndice) || null;
  }

  // ════════ RENDERIZADOR VETORIAL DE ALTA FIDELIDADE (HQ v2) ════════
  async _loadHqIndex() {
    if (this.hqIndex || this.hqIndexLoading || this.hqIndexError) return;
    this.hqIndexLoading = true;
    try {
      const res = await fetch(`${this.apiBase}/api/mapas/hq/index.json?v=4.6.0`, { cache: 'no-cache' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = await res.json();
      const idx = {};
      for (const [z, arr] of Object.entries(j.tiles || {})) idx[z] = new Set(arr);
      this.hqIndex = idx;
      this.needsRender = true;
    } catch (error) {
      this.hqIndexError = error instanceof Error ? error.message : String(error);
      console.warn('[Mapa] Falha ao carregar índice de ruas HQ:', error);
      this.needsRender = true;
    } finally {
      this.hqIndexLoading = false;
    }
  }

  _hasHq(z, x, y) {
    const s = this.hqIndex && this.hqIndex[z];
    return Boolean(s && s.has(`${x}/${y}`));
  }

  _fetchHq(z, x, y) {
    const key = `${z}/${x}/${y}`;
    if (this.hqCache.has(key) || this.hqPending.has(key) || this.hqPending.size >= 12) return;
    this.hqPending.add(key);
    this._cachedFetch(`${this.apiBase}/api/mapas/hq/${key}.json`, 'json')
      .then((t) => {
        if (this.hqCache.size >= 96) {
          const old = this.hqCache.keys().next().value;
          this.hqCache.delete(old);
          this.hqPaths.delete(old);
        }
        this.hqCache.set(key, t && t.v === 2 ? t : null);
        this.needsRender = true;
      })
      .catch(() => {})
      .finally(() => {
        this.hqPending.delete(key);
        this.needsRender = true;
      });
  }

  // Constrói (uma vez por tile) os Path2D agrupados por estilo em coordenadas do tile (0..4096)
  _buildHqPaths(tile) {
    const flatPath = (p, f) => {
      p.moveTo(f[0], f[1]);
      for (let i = 2; i < f.length; i += 2) p.lineTo(f[i], f[i + 1]);
    };
    const polyPath = (p, rings) => {
      for (const r of rings) { flatPath(p, r); p.closePath(); }
    };
    const P = { land: new Map(), water: new Path2D(), wway: [new Path2D(), new Path2D(), new Path2D()], aero: new Path2D(),
      ground: new Map(), tunnel: new Map(), bridge: new Map(), paths: new Path2D(), rail: new Path2D(),
      traffic: [new Path2D(), new Path2D(), new Path2D()], hasTraffic: [false, false, false],
      yellowCenter: new Path2D(), whiteLanes: new Path2D(), motoFaixaAzul: new Path2D(),
      bands: [], bldgAll: new Path2D(), oneway: [], roundabouts: [] };

    for (const l of tile.land) {
      let p = P.land.get(l.k);
      if (!p) { p = new Path2D(); P.land.set(l.k, p); }
      polyPath(p, l.c);
    }
    for (const w of tile.water) { flatPath(P.water, w); P.water.closePath(); }
    for (const w of tile.wway) flatPath(P.wway[Math.min(2, w.w - 1)], w.c);
    for (const a of tile.aero) { flatPath(P.aero, a); P.aero.closePath(); }

    let idx = 0;
    for (const r of tile.road) {
      idx++;
      if (r.sv || r.k === 'path' || r.k === 'pier') { flatPath(P.paths, r.c); continue; }

      // Detecta rotatórias explícitas (r.rb) ou anéis fechados de mão única
      let isRoundabout = Boolean(r.rb);
      if (!isRoundabout && r.o && r.c.length >= 8) {
        const n = r.c.length;
        const dEnd = Math.hypot(r.c[0] - r.c[n - 2], r.c[1] - r.c[n - 1]);
        if (dEnd < 28) {
          let minX = Infinity; let maxX = -Infinity; let minY = Infinity; let maxY = -Infinity;
          for (let i = 0; i < n; i += 2) {
            if (r.c[i] < minX) minX = r.c[i]; if (r.c[i] > maxX) maxX = r.c[i];
            if (r.c[i + 1] < minY) minY = r.c[i + 1]; if (r.c[i + 1] > maxY) maxY = r.c[i + 1];
          }
          const span = Math.max(maxX - minX, maxY - minY);
          if (span >= 16 && span <= 520) isRoundabout = true;
        }
      }

      if (isRoundabout && r.c.length >= 6) {
        let sx = 0; let sy = 0;
        let minX = Infinity; let maxX = -Infinity; let minY = Infinity; let maxY = -Infinity;
        const ptsCount = r.c.length / 2;
        for (let i = 0; i < r.c.length; i += 2) {
          const px = r.c[i]; const py = r.c[i + 1];
          sx += px; sy += py;
          if (px < minX) minX = px; if (px > maxX) maxX = px;
          if (py < minY) minY = py; if (py > maxY) maxY = py;
        }
        const cx = sx / ptsCount;
        const cy = sy / ptsCount;
        let radSum = 0;
        for (let i = 0; i < r.c.length; i += 2) radSum += Math.hypot(r.c[i] - cx, r.c[i + 1] - cy);
        const rad = radSum / ptsCount;
        if (rad >= 8 && rad <= 260) {
          // Verifica se a rotatória cruza algum canal/rio (wway) mesmo sem tag brunnel=bridge
          let overWater = r.b === 1;
          if (!overWater && tile.wway && tile.wway.length) {
            const pad = rad + 24;
            for (const ww of tile.wway) {
              for (let wi = 0; wi < ww.c.length; wi += 2) {
                const wx = ww.c[wi]; const wy = ww.c[wi + 1];
                if (wx >= minX - pad && wx <= maxX + pad && wy >= minY - pad && wy <= maxY + pad) {
                  if (Math.hypot(wx - cx, wy - cy) <= rad + 28) { overWater = true; break; }
                }
              }
              if (overWater) break;
            }
          }
          const rbPath = new Path2D();
          flatPath(rbPath, r.c);
          P.roundabouts.push({ cx, cy, rad, b: overWater ? 1 : (r.b || 0), k: r.k, path: rbPath });
        }
      }

      const key = r.k + (r.lk ? '_l' : '');
      const target = r.b === 2 ? P.tunnel : r.b === 1 ? P.bridge : P.ground;
      let p = target.get(key);
      if (!p) { p = new Path2D(); target.set(key, p); }
      flatPath(p, r.c);
      if (r.b !== 2 && (r.k === 'motorway' || r.k === 'trunk' || r.k === 'primary' || r.k === 'secondary') && !r.lk) {
        const lvl = idx % 7 === 0 ? 2 : idx % 4 === 0 ? 1 : 0;
        flatPath(P.traffic[lvl], r.c);
        P.hasTraffic[lvl] = true;
      }
      if (r.o && r.c.length >= 4) P.oneway.push(r);

      // Marcações Viárias de Asfalto (CONTRAN / CET-SP)
      if (r.b !== 2 && r.c.length >= 4 && !isRoundabout) {
        // Vias de duplo sentido: Linha amarela central divisória de mãos opostas
        if (!r.o && (r.k === 'motorway' || r.k === 'trunk' || r.k === 'primary' || r.k === 'secondary' || r.k === 'tertiary' || r.k === 'minor')) {
          flatPath(P.yellowCenter, r.c);
        }
        // Avenidas com múltiplas pistas: Faixas brancas seccionadas de rolamento
        if (r.k === 'motorway' || r.k === 'trunk' || r.k === 'primary') {
          flatPath(P.whiteLanes, r.c);
          // Faixa Azul de Motos (Corredor exclusivo/preferencial CET-SP nas grandes avenidas)
          flatPath(P.motoFaixaAzul, r.c);
        }
      }
    }
    for (const r of tile.rail) flatPath(P.rail, r);

    const bands = [[0, 7, 5], [7, 16, 11], [16, 32, 24], [32, 64, 46], [64, 130, 90], [130, 9999, 170]];
    for (const [lo, hi, rep] of bands) P.bands.push({ h: rep, lo, hi, path: new Path2D(), n: 0 });
    for (const b of tile.bldg) {
      polyPath(P.bldgAll, b.c);
      const band = P.bands.find((bd) => b.h >= bd.lo && b.h < bd.hi) || P.bands[0];
      polyPath(band.path, b.c);
      band.n++;
    }
    P.bands = P.bands.filter((b) => b.n > 0);
    return P;
  }

  _hqRoadWidth(cls) {
    // Largura em px no zoom 16 (proporcional à largura real da via no padrão Google Maps)
    const W = {
      motorway: [18, 3.2], trunk: [16, 2.8], primary: [14, 2.4], secondary: [12, 2.0], tertiary: [10, 1.6],
      minor: [8.5, 1.2], service: [5.5, 0.9], track: [4.5, 0.6], raceway: [7, 1.0], busway: [7.5, 1.0]
    };
    const base = cls.endsWith('_l') ? cls.slice(0, -2) : cls;
    const [w16, min] = W[base] || W.minor;
    const effMin = this.zoom < 10 ? min * 0.55 : min;
    const w = Math.max(effMin, w16 * Math.pow(2, this.zoom - 16));
    return cls.endsWith('_l') ? w * 0.75 : w;
  }

  _hqTileZoom() {
    if (this.zoom >= 14.2) return 14;
    if (this.zoom >= 12.8) return 13;
    if (this.zoom >= 11.2) return 12;
    if (this.zoom >= 9.2) return 10;
    if (this.zoom >= 7.2) return 8;
    if (this.zoom >= 5.5) return 6;
    if (this.zoom >= 4.5) return 5;
    return 4;
  }

  // Retorna lista de tiles visíveis com o melhor tile carregado (próprio ou ancestral até z4)
  _hqVisibleTiles() {
    const tz = this._hqTileZoom();
    const scale = 256 * Math.pow(2, this.zoom - tz);
    const cp = PonteMapEngine.project(this.lat, this.lng, this.zoom);
    const tlx = cp.x - this.width / 2;
    const tly = cp.y - this.height / 2;
    const minTx = Math.floor(tlx / scale);
    const maxTx = Math.floor((tlx + this.width) / scale);
    const minTy = Math.floor(tly / scale);
    const maxTy = Math.floor((tly + this.height) / scale);
    const out = [];
    const cx = (minTx + maxTx) / 2;
    const cy = (minTy + maxTy) / 2;
    const wanted = [];
    for (let tx = minTx; tx <= maxTx; tx++) {
      for (let ty = minTy; ty <= maxTy; ty++) wanted.push({ tx, ty, d: (tx - cx) ** 2 + (ty - cy) ** 2 });
    }
    wanted.sort((a, b) => a.d - b.d);
    const ancestors = [13, 12, 10, 8, 6, 5, 4].filter((z) => z < tz);

    for (const { tx, ty } of wanted) {
      const rect = { x: tx * scale - tlx, y: ty * scale - tly, s: scale };
      if (!this._hasHq(tz, tx, ty)) {
        // Sem tile HQ neste zoom: busca o melhor ancestral semeado (z13 -> z12 -> z10 -> z8 -> z6)
        let found = false;
        for (const az of ancestors) {
          const shift = tz - az;
          const ax = tx >> shift; const ay = ty >> shift;
          if (!this._hasHq(az, ax, ay)) continue;
          const t = this.hqCache.get(`${az}/${ax}/${ay}`);
          if (t === undefined) this._fetchHq(az, ax, ay);
          if (t) {
            const as = scale * Math.pow(2, shift);
            out.push({ key: `${az}/${ax}/${ay}`, tile: t, ox: ax * as - tlx, oy: ay * as - tly, s: as, clip: rect });
            found = true;
            break;
          }
        }
        continue;
      }
      const key = `${tz}/${tx}/${ty}`;
      const t = this.hqCache.get(key);
      if (t === undefined) this._fetchHq(tz, tx, ty);
      if (t) {
        out.push({ key, tile: t, ox: rect.x, oy: rect.y, s: scale, clip: rect });
        continue;
      }
      // Enquanto carrega: desenha o ancestral já em cache (sem tela vazia durante o pan)
      for (const az of ancestors) {
        const shift = tz - az;
        const ax = tx >> shift; const ay = ty >> shift;
        const at = this.hqCache.get(`${az}/${ax}/${ay}`);
        if (at) {
          const as = scale * Math.pow(2, shift);
          out.push({ key: `${az}/${ax}/${ay}`, tile: at, ox: ax * as - tlx, oy: ay * as - tly, s: as, clip: rect });
          break;
        }
        if (at === undefined && this._hasHq(az, ax, ay)) this._fetchHq(az, ax, ay);
      }
    }
    return out;
  }

  _hqPathsFor(item, budget) {
    let P = this.hqPaths.get(item.key);
    if (!P) {
      if (budget.n <= 0) { setTimeout(() => { this.needsRender = true; }, 16); return null; }
      budget.n--;
      P = this._buildHqPaths(item.tile);
      this.hqPaths.set(item.key, P);
    }
    return P;
  }

  _hqActive() {
    if (this.zoom < 4.0) return false;
    if (!this.hqIndex) { this._loadHqIndex(); return false; }
    const tz = this._hqTileZoom();
    const c = PonteMapEngine.tileOf(this.lat, this.lng, tz);
    if (this._hasHq(tz, c.x, c.y)) return true;
    for (const az of [13, 12, 10, 8, 6, 5, 4]) {
      if (az >= tz) continue;
      const shift = tz - az;
      if (this._hasHq(az, c.x >> shift, c.y >> shift)) return true;
    }
    return false;
  }

  _renderHqBase(ctx, hp, tiles, budget) {
    for (const it of tiles) {
      const P = this._hqPathsFor(it, budget);
      if (!P) continue;
      it.P = P;
      const u = it.s / 4096;
      ctx.save();
      ctx.beginPath();
      ctx.rect(it.clip.x, it.clip.y, it.clip.s + 0.5, it.clip.s + 0.5);
      ctx.clip();
      ctx.translate(it.ox, it.oy);
      ctx.scale(u, u);
      ctx.fillStyle = hp.land;
      ctx.fillRect(0, 0, 4096, 4096);
      for (const [k, p] of P.land) {
        ctx.fillStyle = hp.landuse[k] || hp.landuse.residential;
        ctx.fill(p);
      }
      ctx.fillStyle = hp.aero;
      ctx.fill(P.aero);
      ctx.fillStyle = hp.water;
      ctx.fill(P.water, 'evenodd');
      // Contorno nítido de orla, cais e divisão terra/mar
      ctx.strokeStyle = hp.waterLine;
      ctx.lineWidth = Math.max(0.9, 1.6 * Math.pow(2, this.zoom - 15)) / u;
      ctx.lineJoin = 'round';
      ctx.stroke(P.water);

      // Canais e rios com mureta/margem divisória clara entre as pistas laterais
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      [1, 2.4, 5].forEach((w, i) => {
        const baseW = Math.max(0.8, w * Math.pow(2, this.zoom - 15));
        if (this.zoom >= 13.5) {
          ctx.strokeStyle = hp.canalWall;
          ctx.lineWidth = (baseW + Math.max(1.4, baseW * 0.45)) / u;
          ctx.stroke(P.wway[i]);
        }
        ctx.strokeStyle = hp.water;
        ctx.lineWidth = baseW / u;
        ctx.stroke(P.wway[i]);
        if (this.zoom >= 15.2 && i >= 1) {
          ctx.strokeStyle = hp.waterLine;
          ctx.lineWidth = Math.max(0.5, baseW * 0.22) / u;
          ctx.stroke(P.wway[i]);
        }
      });
      ctx.restore();
    }
  }

  _renderHqTop(ctx, hp, tiles) {
    const order = ['service', 'track', 'minor', 'raceway', 'busway', 'tertiary_l', 'tertiary', 'secondary_l', 'secondary', 'primary_l', 'primary', 'trunk_l', 'trunk', 'motorway_l', 'motorway'];
    const showMinor = this.zoom >= 13.2;
    const casingAll = this.zoom >= 13.5;
    const casingMajor = this.zoom >= 10.5;

    for (const it of tiles) {
      const P = it.P;
      if (!P) continue;
      const u = it.s / 4096;
      ctx.save();
      ctx.beginPath();
      ctx.rect(it.clip.x, it.clip.y, it.clip.s + 0.5, it.clip.s + 0.5);
      ctx.clip();
      ctx.translate(it.ox, it.oy);
      ctx.scale(u, u);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      const strokeGroup = (map, alpha = 1, casingColor = null) => {
        ctx.globalAlpha = alpha;
        if (casingMajor) {
          for (const k of order) {
            const p = map.get(k);
            if (!p) continue;
            const base = k.replace('_l', '');
            if (!showMinor && (base === 'minor' || base === 'service' || base === 'track')) continue;
            const isMajor = base === 'motorway' || base === 'trunk' || base === 'primary' || base === 'secondary';
            if (!casingAll && !isMajor && !casingColor) continue;
            const col = casingColor || (hp.roads[base] || hp.roads.minor)[0];
            if (!col) continue;
            const w = this._hqRoadWidth(k);
            // Casing mais grosso para vias principais → contraste estilo Google Maps
            ctx.strokeStyle = col;
            ctx.lineWidth = (w + Math.max(1.6, Math.min(4.0, w * 0.25)) * 2) / u;
            ctx.shadowBlur = base === 'motorway' ? Math.max(4, 8 * Math.pow(2, this.zoom - 16)) / u : 0;
            ctx.shadowColor = col;
            ctx.stroke(p);
            ctx.shadowBlur = 0;
          }
        }
        for (const k of order) {
          const p = map.get(k);
          if (!p) continue;
          const base = k.replace('_l', '');
          if (!showMinor && (base === 'minor' || base === 'service' || base === 'track')) continue;
          ctx.strokeStyle = (hp.roads[base] || hp.roads.minor)[1];
          ctx.lineWidth = this._hqRoadWidth(k) / u;
          ctx.stroke(p);
        }
        ctx.globalAlpha = 1;
      };

      // Túneis (tracejados e translúcidos)
      if (P.tunnel.size && this.zoom >= 14) {
        ctx.setLineDash([6 / u, 4 / u]);
        strokeGroup(P.tunnel, hp.tunnelAlpha);
        ctx.setLineDash([]);
      }

      // Calçadas, ciclovias e trilhas
      if (this.zoom >= 15.5) {
        ctx.strokeStyle = hp.roads.path[1];
        ctx.lineWidth = Math.max(0.8, 1.6 * Math.pow(2, this.zoom - 17)) / u;
        ctx.setLineDash([3 / u, 2.5 / u]);
        ctx.stroke(P.paths);
        ctx.setLineDash([]);
      }

      strokeGroup(P.ground);

      // Marcações de Faixas Viárias no Asfalto (Padrão CONTRAN & CET-SP em Alta Definição)
      if (this.zoom >= 14.8) {
        // 1. Linha Amarela Divisória de Mãos Opostas (Eixo central das vias)
        ctx.strokeStyle = this.theme === 'dark' ? '#facc15' : '#eab308';
        ctx.lineWidth = Math.max(0.9, 1.6 * Math.pow(2, this.zoom - 17)) / u;
        if (this.zoom < 16.5) {
          ctx.setLineDash([6 / u, 5 / u]);
        } else {
          ctx.setLineDash([]); // Linha amarela contínua em zoom elevado de rua
        }
        ctx.stroke(P.yellowCenter);
        ctx.setLineDash([]);

        // 2. Linhas Brancas Seccionadas das Faixas de Rolamento (mesmo sentido)
        ctx.strokeStyle = this.theme === 'dark' ? 'rgba(248, 250, 252, 0.85)' : 'rgba(255, 255, 255, 0.95)';
        ctx.lineWidth = Math.max(0.7, 1.2 * Math.pow(2, this.zoom - 17)) / u;
        ctx.setLineDash([5 / u, 6 / u]);
        ctx.stroke(P.whiteLanes);
        ctx.setLineDash([]);

        // 3. Faixa Azul do Motoboy (Corredor exclusivo/preferencial de motos CET-SP)
        // Demarcação viária entre as faixas 1 e 2 das grandes avenidas
        if (this.zoom >= 15.2) {
          ctx.save();
          // Halo azul suave refletivo
          ctx.strokeStyle = this.theme === 'dark' ? 'rgba(2, 132, 199, 0.40)' : 'rgba(14, 165, 233, 0.35)';
          ctx.lineWidth = Math.max(2.4, 4.2 * Math.pow(2, this.zoom - 17)) / u;
          ctx.stroke(P.motoFaixaAzul);

          // Fita central da Faixa Azul de segurança
          ctx.strokeStyle = this.theme === 'dark' ? '#38bdf8' : '#0284c7';
          ctx.lineWidth = Math.max(1.1, 2.0 * Math.pow(2, this.zoom - 17)) / u;
          ctx.setLineDash([10 / u, 5 / u]);
          ctx.stroke(P.motoFaixaAzul);
          ctx.setLineDash([]);
          ctx.restore();
        }
      }

      // Trânsito ao vivo discreto dentro do leito da via (sem cobrir a cor das rodovias)
      if (this.showTraffic && this.zoom >= 13.8) {
        const cols = ['#16a34a', '#f59e0b', '#ef4444'];
        for (let i = 0; i < 3; i++) {
          if (!P.hasTraffic[i]) continue;
          ctx.strokeStyle = cols[i];
          ctx.globalAlpha = i === 0 ? (this.theme === 'dark' ? 0.38 : 0.42) : (this.theme === 'dark' ? 0.72 : 0.80);
          ctx.lineWidth = Math.max(1.1, Math.min(3.2, this._hqRoadWidth('primary') * 0.22)) / u;
          ctx.stroke(P.traffic[i]);
        }
        ctx.globalAlpha = 1;
      }

      // Ferrovias / metrô de superfície
      if (this.zoom >= 12.5) {
        ctx.strokeStyle = hp.rail;
        ctx.lineWidth = Math.max(1, 2.6 * Math.pow(2, this.zoom - 16)) / u;
        ctx.stroke(P.rail);
        if (this.zoom >= 15) {
          ctx.strokeStyle = hp.railDash;
          ctx.lineWidth = Math.max(0.6, 1.4 * Math.pow(2, this.zoom - 16)) / u;
          ctx.setLineDash([5 / u, 5 / u]);
          ctx.stroke(P.rail);
          ctx.setLineDash([]);
        }
      }

      // Pontes e rotatórias elevadas sobre canais/água acima de tudo
      if (P.bridge.size) {
        ctx.save();
        ctx.translate(2.2 / u, 2.6 / u);
        strokeGroup(P.bridge, 0.55, hp.bridgeShadow);
        ctx.restore();
        strokeGroup(P.bridge, 1, this.zoom >= 11.5 ? hp.bridgeCasing : null);
      }

      // Ilhas centrais e demarcação de rotatórias (inclusive rotatórias sobre canais)
      if (this.zoom >= 14.6 && P.roundabouts.length) {
        for (const rb of P.roundabouts) {
          if (rb.b === 1) {
            // Tabuleiro elevado da rotatória sobre canal/água
            ctx.save();
            ctx.strokeStyle = hp.bridgeShadow;
            ctx.lineWidth = (this._hqRoadWidth(rb.k) + 6) / u;
            ctx.stroke(rb.path);
            ctx.strokeStyle = hp.bridgeCasing;
            ctx.lineWidth = (this._hqRoadWidth(rb.k) + 3) / u;
            ctx.stroke(rb.path);
            ctx.strokeStyle = (hp.roads[rb.k] || hp.roads.primary)[1];
            ctx.lineWidth = this._hqRoadWidth(rb.k) / u;
            ctx.stroke(rb.path);
            ctx.restore();
          }
          const islandR = Math.max(3 / u, rb.rad * 0.52);
          ctx.beginPath();
          ctx.arc(rb.cx, rb.cy, islandR, 0, Math.PI * 2);
          ctx.fillStyle = hp.roundaboutIsland;
          ctx.fill();
          ctx.lineWidth = Math.max(1.0, 1.6 * Math.pow(2, this.zoom - 16)) / u;
          ctx.strokeStyle = hp.roundaboutCurb;
          ctx.stroke();
        }
      }

      // Setas de mão única
      if (this.zoom >= 16.5 && P.oneway.length) {
        ctx.fillStyle = hp.oneway;
        const step = 120 / u;
        for (const r of P.oneway) {
          let acc = step * 0.5;
          for (let i = 0; i + 3 < r.c.length; i += 2) {
            const x1 = r.c[i]; const y1 = r.c[i + 1]; const x2 = r.c[i + 2]; const y2 = r.c[i + 3];
            const segL = Math.hypot(x2 - x1, y2 - y1);
            while (acc < segL) {
              const f = acc / segL;
              const ang = Math.atan2(y2 - y1, x2 - x1) + (r.o === -1 ? Math.PI : 0);
              ctx.save();
              ctx.translate(x1 + (x2 - x1) * f, y1 + (y2 - y1) * f);
              ctx.rotate(ang);
              ctx.scale(1 / u, 1 / u);
              ctx.beginPath();
              ctx.moveTo(4.5, 0);
              ctx.lineTo(-3, -3);
              ctx.lineTo(-1.2, 0);
              ctx.lineTo(-3, 3);
              ctx.closePath();
              ctx.fill();
              ctx.restore();
              acc += step;
            }
            acc -= segL;
          }
        }
      }
      ctx.restore();
    }

    // Edifícios: 2D a partir de z14.5, extrusão 3D a partir de z15.6 (norte → sul para oclusão correta)
    if (this.zoom >= 14.5) {
      const mpp = (156543.03392 * Math.cos((this.lat * Math.PI) / 180)) / Math.pow(2, this.zoom);
      const extrude = this.show3D && this.zoom >= 15.6;
      const sorted = tiles.filter((t) => t.P && t.P.bands.length).sort((a, b) => a.clip.y - b.clip.y);
      for (const it of sorted) {
        const P = it.P;
        const u = it.s / 4096;
        const maxOff = extrude ? Math.min(28, (120 / mpp) * 0.22) : 0;
        ctx.save();
        ctx.beginPath();
        ctx.rect(it.clip.x - maxOff * 0.35, it.clip.y - maxOff, it.clip.s + maxOff * 0.35 + 0.5, it.clip.s + maxOff + 0.5);
        ctx.clip();
        ctx.translate(it.ox, it.oy);
        ctx.scale(u, u);
        if (!extrude) {
          ctx.fillStyle = hp.bldg;
          ctx.fill(P.bldgAll);
          if (this.zoom >= 15.5) {
            ctx.strokeStyle = hp.bldgStroke;
            ctx.lineWidth = 0.8 / u;
            ctx.stroke(P.bldgAll);
          }
        } else {
          // Sombra projetada suave
          ctx.fillStyle = hp.bldgShadow;
          ctx.save();
          ctx.translate(2.0 / u, 2.0 / u);
          ctx.fill(P.bldgAll);
          ctx.restore();
          for (const band of P.bands) {
            const off = Math.min(28, (band.h / mpp) * 0.22);
            const steps = Math.max(1, Math.min(3, Math.ceil(off / 7.0)));
            ctx.fillStyle = hp.bldgWall;
            for (let s = 0; s < steps; s++) {
              const o = (off * s) / steps;
              ctx.save();
              ctx.translate((-o * 0.28) / u, -o / u);
              ctx.fill(band.path);
              ctx.restore();
            }
            ctx.save();
            ctx.translate((-off * 0.28) / u, -off / u);
            ctx.fillStyle = hp.bldgTop;
            ctx.fill(band.path);
            ctx.strokeStyle = hp.bldgStroke;
            ctx.lineWidth = 0.7 / u;
            ctx.stroke(band.path);
            ctx.restore();
          }
        }
        ctx.restore();
      }
    }
  }

  // Rótulos em espaço de tela: nomes de ruas curvados ao longo da via, bairros, POIs e números
  _renderHqLabels(ctx, hp, tiles) {
    const cacheKey = `${this.lat.toFixed(5)}_${this.lng.toFixed(5)}_${this.zoom.toFixed(2)}_${this.theme}_${this.width}x${this.height}_${tiles.length}_${this.hqCache.size}`;
    if (this._labelCache && this._labelCache.key === cacheKey) {
      ctx.drawImage(this._labelCache.canvas, 0, 0, this.width, this.height);
      return;
    }
    if (!this._labelCacheCanvas) this._labelCacheCanvas = document.createElement('canvas');
    const lc = this._labelCacheCanvas;
    const lw = Math.round(this.width * this.dpr);
    const lh = Math.round(this.height * this.dpr);
    if (lc.width !== lw || lc.height !== lh) { lc.width = lw; lc.height = lh; }
    const lctx = lc.getContext('2d');
    lctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    lctx.clearRect(0, 0, this.width, this.height);
    const origCtx = ctx;
    ctx = lctx;

    const grid = new Map();
    const cell = 22;
    const occupied = (x, y, w, h) => {
      for (let gx = Math.floor((x - w / 2) / cell); gx <= Math.floor((x + w / 2) / cell); gx++) {
        for (let gy = Math.floor((y - h / 2) / cell); gy <= Math.floor((y + h / 2) / cell); gy++) {
          const arr = grid.get(gx * 100003 + gy);
          if (arr && arr.some((b) => Math.abs(b.x - x) < (b.w + w) / 2 && Math.abs(b.y - y) < (b.h + h) / 2)) return true;
        }
      }
      return false;
    };
    const occupy = (x, y, w, h) => {
      const b = { x, y, w, h };
      for (let gx = Math.floor((x - w / 2) / cell); gx <= Math.floor((x + w / 2) / cell); gx++) {
        for (let gy = Math.floor((y - h / 2) / cell); gy <= Math.floor((y + h / 2) / cell); gy++) {
          const k = gx * 100003 + gy;
          let arr = grid.get(k);
          if (!arr) { arr = []; grid.set(k, arr); }
          arr.push(b);
        }
      }
    };
    const inView = (x, y, m = 4) => x > m && y > m && x < this.width - m && y < this.height - m;
    const toScr = (it, x, y) => [it.ox + (x / 4096) * it.s, it.oy + (y / 4096) * it.s];
    const font = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

    // Reserva o canto da escala e o perfil altimétrico
    occupy(70, this.height - 16, 140, 30);

    // 1. Cidades, vilas e bairros
    if (this.zoom < 15.8) {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const seen = new Set();
      for (const it of tiles) {
        for (const pl of it.tile.place) {
          if (seen.has(pl.n)) continue;
          const isCity = pl.k === 'city';
          const isTown = pl.k === 'town';
          if (this.zoom < 6.5 && (!isCity || (pl.r || 10) > 5)) continue;
          if (this.zoom < 8.5 && !isCity) continue;
          if (this.zoom < 12.8 && !isCity && !isTown) continue;
          const big = isCity || isTown;
          const [x, y] = toScr(it, pl.p[0], pl.p[1]);
          if (!inView(x, y, 30)) continue;
          const txt = big ? pl.n : pl.n.toUpperCase();
          ctx.font = isCity ? `800 14px ${font}` : (isTown ? `700 12px ${font}` : `700 10.5px ${font}`);
          const w = ctx.measureText(txt).width + (big ? 0 : txt.length * 1.2);
          if (occupied(x, y, w + 8, 18)) continue;
          occupy(x, y, w + 8, 18);
          seen.add(pl.n);
          ctx.lineWidth = 3.5;
          ctx.strokeStyle = hp.textHalo;
          if (!big && 'letterSpacing' in ctx) ctx.letterSpacing = '1.2px';
          ctx.strokeText(txt, x, y);
          ctx.fillStyle = big ? hp.text : hp.placeText;
          ctx.fillText(txt, x, y);
          if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
        }
      }
    }

    // 2. Nomes de ruas curvados ao longo da geometria
    const clsMinZoom = { motorway: 12, trunk: 12, primary: 12.8, secondary: 13.6, tertiary: 14.2, minor: 15.2, service: 16.8, track: 16.5, path: 17, raceway: 16, busway: 16 };
    const clsRank = { motorway: 9, trunk: 8, primary: 7, secondary: 6, tertiary: 5, minor: 4, service: 3 };
    const names = [];
    for (const it of tiles) {
      for (const nm of it.tile.name) {
        if (this.zoom < (clsMinZoom[nm.k] ?? 15.5)) continue;
        names.push({ it, nm, r: clsRank[nm.k] || 2 });
      }
    }
    names.sort((a, b) => b.r - a.r);
    const placedNames = new Map();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    let labelCount = 0;
    for (const { it, nm, r } of names) {
      if (labelCount > 140) break;
      const pts = [];
      for (let i = 0; i < nm.c.length; i += 2) pts.push(toScr(it, nm.c[i], nm.c[i + 1]));
      const seg = [0];
      for (let i = 1; i < pts.length; i++) seg.push(seg[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
      const total = seg[seg.length - 1];
      const size = r >= 7 ? 12 : r >= 5 ? 11.5 : 11;
      ctx.font = `${r >= 6 ? 700 : 600} ${size}px ${font}`;
      const txt = nm.n.length > 40 ? nm.n.slice(0, 38) + '…' : nm.n;
      const tw = ctx.measureText(txt).width;
      if (tw + 16 > total) continue;

      // Evita repetir a mesma rua próxima
      const prev = placedNames.get(txt) || [];
      const midIdx = seg.findIndex((s) => s >= total / 2);
      const mp = pts[Math.max(0, midIdx)];
      if (!inView(mp[0], mp[1], 10)) continue;
      if (prev.some((p) => Math.hypot(p[0] - mp[0], p[1] - mp[1]) < 260)) continue;

      // Posições de cada caractere ao longo da polilinha
      const startD = total / 2 - tw / 2;
      const at = (d) => {
        let i = 1;
        while (i < seg.length - 1 && seg[i] < d) i++;
        const f = (d - seg[i - 1]) / Math.max(0.0001, seg[i] - seg[i - 1]);
        return { x: pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * f, y: pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * f, a: Math.atan2(pts[i][1] - pts[i - 1][1], pts[i][0] - pts[i - 1][0]) };
      };
      const a0 = at(startD); const a1 = at(startD + tw);
      const reverse = a1.x < a0.x;
      const chars = [...txt];
      const glyphs = [];
      let d = 0;
      let ok = true;
      let lastA = null;
      for (const ch of chars) {
        const cw = ctx.measureText(ch).width;
        const pos = reverse ? at(startD + tw - d - cw / 2) : at(startD + d + cw / 2);
        let ang = pos.a + (reverse ? Math.PI : 0);
        if (lastA !== null) {
          let da = Math.abs(ang - lastA);
          if (da > Math.PI) da = 2 * Math.PI - da;
          if (da > 0.6) { ok = false; break; }
        }
        lastA = ang;
        if (!inView(pos.x, pos.y, 6) || occupied(pos.x, pos.y, Math.max(cw, 7), size + 2)) { ok = false; break; }
        glyphs.push({ ch, x: pos.x, y: pos.y, a: ang, w: cw });
        d += cw;
      }
      if (!ok) continue;
      for (const g of glyphs) occupy(g.x, g.y, Math.max(g.w, 7), size + 2);
      prev.push(mp);
      placedNames.set(txt, prev);
      labelCount++;
      const major = r >= 8;
      for (const g of glyphs) {
        ctx.save();
        ctx.translate(g.x, g.y);
        ctx.rotate(g.a);
        ctx.lineWidth = 3.4;
        ctx.strokeStyle = major && this.theme === 'light' ? 'rgba(255,255,255,0.95)' : hp.textHalo;
        ctx.strokeText(g.ch, 0, 0);
        ctx.fillStyle = r >= 5 ? hp.text : hp.textMinor;
        ctx.fillText(g.ch, 0, 0);
        ctx.restore();
      }
    }

    // 3. POIs com ícone por categoria
    if (this.zoom >= 14.8) {
      const cat = (k, s) => {
        if (/hospital|clinic|doctors|dentist|pharmacy/.test(k + s)) return ['#e53935', '+'];
        if (/railway|subway|station|bus|tram|aerialway/.test(k + s)) return ['#7b61ff', 'M'];
        if (/restaurant|fast_food|food|cafe|bar|pub|ice_cream|bakery/.test(k + s)) return ['#f57c00', 'R'];
        if (/shop|grocery|supermarket|clothing|mall|market|convenience/.test(k + s)) return ['#1e88e5', 'L'];
        if (/park|garden|playground|pitch|stadium|sports/.test(k + s)) return ['#2e7d32', '♣'];
        if (/school|college|university|kindergarten|library/.test(k + s)) return ['#8d6e63', 'E'];
        if (/lodging|hotel|hostel/.test(k + s)) return ['#d81b60', 'H'];
        if (/bank|atm/.test(k + s)) return ['#00897b', '$'];
        if (/fuel/.test(k + s)) return ['#455a64', 'G'];
        if (/museum|theatre|cinema|attraction|art|monument/.test(k + s)) return ['#00838f', '★'];
        if (/place_of_worship|church/.test(k + s)) return ['#6d4c41', '✝'];
        if (/parking/.test(k + s)) return ['#1565c0', 'P'];
        return ['#607d8b', '•'];
      };
      const minR = this.zoom >= 17.5 ? 0 : this.zoom >= 16.5 ? 40 : this.zoom >= 15.6 ? 55 : 70;
      const pois = [];
      for (const it of tiles) for (const p of it.tile.poi) if (p.r >= minR) pois.push({ it, p });
      pois.sort((a, b) => b.p.r - a.p.r);
      let n = 0;
      ctx.textBaseline = 'middle';
      for (const { it, p } of pois) {
        if (n > 90) break;
        const [x, y] = toScr(it, p.p[0], p.p[1]);
        if (!inView(x, y, 12)) continue;
        ctx.font = `600 11px ${font}`;
        const txt = p.n.length > 28 ? p.n.slice(0, 26) + '…' : p.n;
        const tw = ctx.measureText(txt).width;
        const bx = x + 9 + tw / 2;
        if (occupied(x, y, 18, 18) || occupied(bx, y, tw + 6, 15)) continue;
        occupy(x, y, 18, 18);
        occupy(bx, y, tw + 6, 15);
        n++;
        const [col, glyph] = cat(p.k, p.s || '');
        ctx.beginPath();
        ctx.arc(x, y, 7.5, 0, Math.PI * 2);
        ctx.fillStyle = col;
        ctx.fill();
        ctx.lineWidth = 1.6;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();
        ctx.fillStyle = '#ffffff';
        ctx.font = `900 8.5px ${font}`;
        ctx.textAlign = 'center';
        ctx.fillText(glyph, x, y + 0.5);
        ctx.textAlign = 'left';
        ctx.font = `600 11px ${font}`;
        ctx.lineWidth = 3;
        ctx.strokeStyle = hp.textHalo;
        ctx.strokeText(txt, x + 11, y);
        ctx.fillStyle = col;
        ctx.fillText(txt, x + 11, y);
      }
    }

    // 4. Números das casas
    if (this.zoom >= 17.6) {
      ctx.font = `500 9.5px ${font}`;
      ctx.textAlign = 'center';
      ctx.fillStyle = hp.hn;
      for (const it of tiles) {
        for (const h of it.tile.hn) {
          const [x, y] = toScr(it, h[0], h[1]);
          if (!inView(x, y, 8)) continue;
          const w = h[2].length * 6;
          if (occupied(x, y, w, 11)) continue;
          occupy(x, y, w, 11);
          ctx.fillText(h[2], x, y);
        }
      }
    }

    this._labelCache = { key: cacheKey, canvas: lc };
    origCtx.drawImage(lc, 0, 0, this.width, this.height);
  }

  _renderStores(ctx, pal) {
    const catColors = {
      alimentacao: '#f97316',
      varejo: '#8b5cf6',
      saude: '#ef4444',
      servicos: '#06b6d4'
    };
    const catGlyph = {
      alimentacao: 'R',
      varejo: 'L',
      saude: '+',
      servicos: 'S'
    };

    const clusters = [];
    const clusterRadiusSq = this.zoom >= 15.2 ? 18 * 18 : 28 * 28;

    for (const st of this.stores) {
      const streetPt = this.latLngToScreen(st.lat, st.lng);
      // Offset perpendicular para a calçada/fachada do lote predial (tira os pinos do meio do asfalto)
      const seed = Math.abs(Math.sin((st.lat || 0) * 888.88 + (st.lng || 0) * 777.77) * 1000);
      const angle = (Math.floor(seed) % 4) * (Math.PI / 2) + Math.PI / 4;
      const offsetDist = this.zoom >= 16 ? 22 : 14;
      const p = {
        x: streetPt.x + Math.cos(angle) * offsetDist,
        y: streetPt.y + Math.sin(angle) * offsetDist,
        streetX: streetPt.x,
        streetY: streetPt.y
      };

      if (p.x < -20 || p.x > this.width + 20 || p.y < -20 || p.y > this.height + 20) continue;

      let joined = false;
      for (const cl of clusters) {
        if ((cl.x - p.x) ** 2 + (cl.y - p.y) ** 2 < clusterRadiusSq) {
          cl.count++;
          cl.items.push(st);
          joined = true;
          break;
        }
      }
      if (!joined) {
        clusters.push({ x: p.x, y: p.y, streetX: p.streetX, streetY: p.streetY, count: 1, lead: st, items: [st] });
      }
    }

    const placedLabels = [];
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (const cl of clusters) {
      const st = cl.lead;
      const col = cl.count > 1 ? '#3b82f6' : (catColors[st.categoria] || '#10b981');

      // Haste de acesso da calçada da via até a fachada do lote (evita que a loja fique no meio da rua)
      if (this.zoom >= 15.0 && cl.streetX !== undefined && cl.streetY !== undefined) {
        ctx.beginPath();
        ctx.moveTo(cl.streetX, cl.streetY);
        ctx.lineTo(cl.x, cl.y);
        ctx.strokeStyle = this.theme === 'dark' ? 'rgba(148, 163, 184, 0.40)' : 'rgba(100, 116, 139, 0.40)';
        ctx.lineWidth = 1.2;
        ctx.setLineDash([2, 2]);
        ctx.stroke();
        ctx.setLineDash([]);
        // Marcador sutil de meio-fio / entrada
        ctx.beginPath();
        ctx.arc(cl.streetX, cl.streetY, 2.2, 0, Math.PI * 2);
        ctx.fillStyle = col;
        ctx.fill();
      }

      if (cl.count > 1) {
        // Cluster Numérico Limpo (Estilo Google Maps / Airbnb)
        ctx.beginPath();
        ctx.arc(cl.x, cl.y, 12, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(59, 130, 246, 0.25)';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(cl.x, cl.y, 9, 0, Math.PI * 2);
        ctx.fillStyle = col;
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.font = '800 9.5px sans-serif';
        ctx.fillText(cl.count > 99 ? '99+' : String(cl.count), cl.x, cl.y + 0.5);
      } else {
        // Pino Individual com Glifo de Categoria
        ctx.beginPath();
        ctx.arc(cl.x, cl.y, 8, 0, Math.PI * 2);
        ctx.fillStyle = col;
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.font = '900 9px sans-serif';
        ctx.fillText(catGlyph[st.categoria] || '•', cl.x, cl.y + 0.5);

        if (this.zoom >= 13.6 && !this.isDragging) {
          const clash = placedLabels.some((b) => Math.abs(b.x - cl.x) < 100 && Math.abs(b.y - cl.y) < 22);
          if (!clash) {
            placedLabels.push(cl);
            ctx.font = '700 10px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
            ctx.lineWidth = 3;
            ctx.strokeStyle = pal.roadTextHalo;
            ctx.strokeText(st.nome.slice(0, 22), cl.x, cl.y - 14);
            ctx.fillStyle = pal.poiText;
            ctx.fillText(st.nome.slice(0, 22), cl.x, cl.y - 14);
          }
        }
      }
    }
  }

  _renderScaleBar(ctx, pal) {
    const metersPerPx = (156543.03392 * Math.cos((this.lat * Math.PI) / 180)) / Math.pow(2, this.zoom);
    const targetMeters = metersPerPx * 90;
    const steps = [50, 100, 200, 500, 1000, 2000, 5000, 10000, 25000, 50000, 100000];
    let distM = steps[0];
    for (const s of steps) {
      if (s <= targetMeters * 1.4) distM = s;
    }
    const barPx = Math.round(distM / metersPerPx);
    const label = distM >= 1000 ? `${distM / 1000} km` : `${distM} m`;

    const x = 14;
    const y = this.height - 16;
    ctx.save();
    ctx.fillStyle = 'rgba(15, 23, 42, 0.78)';
    ctx.beginPath();
    ctx.roundRect(x - 6, y - 16, barPx + 12, 22, 6);
    ctx.fill();
    ctx.strokeStyle = '#f8fafc';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y - 4);
    ctx.lineTo(x, y);
    ctx.lineTo(x + barPx, y);
    ctx.lineTo(x + barPx, y - 4);
    ctx.stroke();
    ctx.fillStyle = '#f8fafc';
    ctx.font = '700 10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(label, x + barPx / 2, y - 6);
    ctx.restore();
  }

  _drawGeoPath(ctx, coords, isMulti = false) {
    const drawRing = (ring) => {
      for (let i = 0; i < ring.length; i++) {
        const pt = this.latLngToScreen(ring[i][1], ring[i][0]);
        if (i === 0) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
      }
    };
    if (isMulti) {
      for (const poly of coords) {
        if (Array.isArray(poly[0]) && Array.isArray(poly[0][0])) {
          for (const r of poly) drawRing(r);
        } else {
          drawRing(poly);
        }
      }
    } else {
      drawRing(coords);
    }
  }

  _drawMercatorRings(ctx, rings, ox, oy, scale) {
    if (!rings) return;
    for (let r = 0; r < rings.length; r++) {
      const arr = rings[r];
      if (arr.length < 2) continue;
      ctx.moveTo(ox + arr[0] * scale, oy + arr[1] * scale);
      for (let i = 2; i < arr.length; i += 2) {
        ctx.lineTo(ox + arr[i] * scale, oy + arr[i + 1] * scale);
      }
    }
  }

  _renderBrasilGeo(ctx, pal, pass = 'all') {
    const g = this.brasilGeo;
    const scale = 256 * Math.pow(2, this.zoom);
    const center = PonteMapEngine.project(this.lat, this.lng, this.zoom);
    const isHeadUp = this.driverMode && this.headingUp && this.currentVehicleAngle !== undefined;
    const ax = this.width / 2;
    const ay = isHeadUp ? this.height * 0.70 : this.height / 2;
    const ox = ax - center.x;
    const oy = ay - center.y;

    const tl = this.screenToLatLng(0, 0);
    const br = this.screenToLatLng(this.width, this.height);
    const vMinLng = Math.min(tl.lng, br.lng) - 0.5;
    const vMaxLng = Math.max(tl.lng, br.lng) + 0.5;
    const vMinLat = Math.min(tl.lat, br.lat) - 0.5;
    const vMaxLat = Math.max(tl.lat, br.lat) + 0.5;
    const inBbox = (f) => {
      const b = f._bbox;
      if (!b) return true;
      return !(b[2] < vMinLng || b[0] > vMaxLng || b[3] < vMinLat || b[1] > vMaxLat);
    };

    // Passo 1 (base): preenchimento do território brasileiro e manchas urbanas (abaixo do relevo)
    if (pass === 'all' || pass === 'base') {
      if (g.ufs) {
        ctx.beginPath();
        for (const uf of g.ufs) {
          if (!inBbox(uf)) continue;
          if (uf._m) this._drawMercatorRings(ctx, uf._m, ox, oy, scale);
          else if (uf.geometry.type === 'Polygon') this._drawGeoPath(ctx, uf.geometry.coordinates, true);
          else if (uf.geometry.type === 'MultiPolygon') {
            for (const p of uf.geometry.coordinates) this._drawGeoPath(ctx, p, true);
          }
        }
        ctx.fillStyle = pal.land;
        ctx.fill();
      }

      if (g.urban && this.zoom >= 6) {
        ctx.beginPath();
        for (const u of g.urban) {
          if (!inBbox(u)) continue;
          if (u._m) this._drawMercatorRings(ctx, u._m, ox, oy, scale);
          else if (u.geometry.type === 'Polygon') this._drawGeoPath(ctx, u.geometry.coordinates, true);
          else if (u.geometry.type === 'MultiPolygon') {
            for (const p of u.geometry.coordinates) this._drawGeoPath(ctx, p, true);
          }
        }
        ctx.fillStyle = pal.urban;
        ctx.fill();
      }
    }

    // Passo 2 (overlay): fronteiras estaduais, rios e rodovias nacionais (acima do relevo)
    if (pass === 'all' || pass === 'overlay' || pass === 'borders') {
      if (g.ufs) {
        ctx.beginPath();
        for (const uf of g.ufs) {
          if (!inBbox(uf)) continue;
          if (uf._m) this._drawMercatorRings(ctx, uf._m, ox, oy, scale);
          else if (uf.geometry.type === 'Polygon') this._drawGeoPath(ctx, uf.geometry.coordinates, true);
          else if (uf.geometry.type === 'MultiPolygon') {
            for (const p of uf.geometry.coordinates) this._drawGeoPath(ctx, p, true);
          }
        }
        ctx.strokeStyle = pal.stateBorder;
        ctx.lineWidth = this.zoom >= 7 ? 1.4 : 1.1;
        ctx.stroke();
      }

      if (pass !== 'borders' && g.rivers) {
        ctx.beginPath();
        for (const r of g.rivers) {
          if (!inBbox(r)) continue;
          if (r._m) this._drawMercatorRings(ctx, r._m, ox, oy, scale);
          else if (r.geometry.type === 'LineString') this._drawGeoPath(ctx, r.geometry.coordinates, false);
          else if (r.geometry.type === 'MultiLineString') {
            for (const l of r.geometry.coordinates) this._drawGeoPath(ctx, l, false);
          }
        }
        ctx.strokeStyle = pal.waterLine || pal.water;
        ctx.lineWidth = this.zoom > 8 ? 3.6 : 2.2;
        ctx.stroke();
        ctx.strokeStyle = pal.water;
        ctx.lineWidth = this.zoom > 8 ? 2.2 : 1.3;
        ctx.stroke();
      }

      if (pass !== 'borders' && g.roads) {
        ctx.beginPath();
        for (const rd of g.roads) {
          if (!inBbox(rd)) continue;
          if (rd._m) this._drawMercatorRings(ctx, rd._m, ox, oy, scale);
          else if (rd.geometry.type === 'LineString') this._drawGeoPath(ctx, rd.geometry.coordinates, false);
          else if (rd.geometry.type === 'MultiLineString') {
            for (const l of rd.geometry.coordinates) this._drawGeoPath(ctx, l, false);
          }
        }
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = pal.highwayCasing;
        ctx.lineWidth = this.zoom > 8 ? 3.8 : 2.2;
        ctx.stroke();
        ctx.strokeStyle = pal.highwayFill;
        ctx.lineWidth = this.zoom > 8 ? 2.2 : 1.2;
        ctx.stroke();
      }
    }
  }

  _renderCidadesLabels(ctx, pal) {
    const cidades = this.brasilGeo.cidades;
    ctx.font = '700 11px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    const placed = [];

    for (const c of cidades) {
      if (this.zoom < 6.5 && !c.cap) continue;
      const p = this.latLngToScreen(c.lat, c.lng);
      if (p.x < -50 || p.x > this.width + 50 || p.y < -20 || p.y > this.height + 20) continue;

      const tooClose = placed.some((b) => Math.abs(b.x - p.x) < 75 && Math.abs(b.y - p.y) < 22);
      if (tooClose) continue;
      placed.push(p);

      ctx.beginPath();
      ctx.arc(p.x, p.y, c.cap ? 3.5 : 2.2, 0, Math.PI * 2);
      ctx.fillStyle = c.cap ? '#a3e635' : pal.cityText;
      ctx.fill();

      ctx.lineWidth = 3;
      ctx.strokeStyle = pal.roadTextHalo;
      ctx.strokeText(c.nome, p.x, p.y - 7);
      ctx.fillStyle = c.cap ? (this.theme === 'light' ? '#0f172a' : '#f8fafc') : pal.cityText;
      ctx.fillText(c.nome, p.x, p.y - 7);
    }
  }

  _getTileBitmap(key, tile, pal) {
    const bmpKey = `${key}_${this.theme}_${this.show3D ? 1 : 0}_${this.showTraffic ? 1 : 0}`;
    if (this.bitmapCache.has(bmpKey)) return this.bitmapCache.get(bmpKey);

    // Resolução HiDPI nítida (1024px) para evitar efeito pixelado 144p em qualquer zoom
    const sz = 1024;
    const off = document.createElement('canvas');
    off.width = sz;
    off.height = sz;
    const octx = off.getContext('2d');
    const ptTo = (pt) => [(pt[0] / 1000) * sz, (pt[1] / 1000) * sz];

    // 1. Água com contorno de orla/margem
    if (tile.water && tile.water.length) {
      octx.beginPath();
      for (const w of tile.water) {
        for (const ring of w.c) {
          for (let i = 0; i < ring.length; i++) {
            const [px, py] = ptTo(ring[i]);
            if (i === 0) octx.moveTo(px, py);
            else octx.lineTo(px, py);
          }
        }
      }
      octx.fillStyle = pal.water;
      octx.fill();
      octx.strokeStyle = pal.waterLine || pal.water;
      octx.lineWidth = 2.0;
      octx.stroke();
    }

    // 2. Parques e Áreas Verdes
    if (tile.park && tile.park.length) {
      octx.beginPath();
      for (const pk of tile.park) {
        for (const ring of pk.c) {
          for (let i = 0; i < ring.length; i++) {
            const [px, py] = ptTo(ring[i]);
            if (i === 0) octx.moveTo(px, py);
            else octx.lineTo(px, py);
          }
        }
      }
      octx.fillStyle = pal.park;
      octx.fill();
    }

    // 3. Ruas, Avenidas e Rodovias (Desenhadas antes dos prédios para nunca atravessarem estruturas)
    const roadGroups = [
      { classes: ['minor', 'service', 'street'], w: 4.5, fill: pal.streetFill, casing: pal.roadCasing },
      { classes: ['secondary', 'tertiary', 'transit'], w: 6.8, fill: pal.streetFill, casing: pal.roadCasing },
      { classes: ['primary'], w: 9.5, fill: pal.primaryFill, casing: pal.primaryCasing },
      { classes: ['motorway', 'trunk'], w: 12.0, fill: pal.highwayFill, casing: pal.highwayCasing }
    ];
    octx.lineCap = 'round';
    octx.lineJoin = 'round';

    for (const grp of roadGroups) {
      octx.beginPath();
      let hasAny = false;
      for (const rd of tile.road) {
        if (rd.lbl || !grp.classes.includes(rd.cls)) continue;
        hasAny = true;
        for (const ring of rd.c) {
          for (let i = 0; i < ring.length; i++) {
            const [px, py] = ptTo(ring[i]);
            if (i === 0) octx.moveTo(px, py);
            else octx.lineTo(px, py);
          }
        }
      }
      if (!hasAny) continue;
      octx.strokeStyle = grp.casing;
      octx.lineWidth = grp.w + 4.0;
      octx.stroke();
      octx.strokeStyle = grp.fill;
      octx.lineWidth = grp.w;
      octx.stroke();
    }

    // 4. Trânsito Ao Vivo discreto
    if (this.showTraffic) {
      const trafficColors = ['rgba(22, 163, 74, 0.38)', 'rgba(245, 158, 11, 0.68)', 'rgba(239, 68, 68, 0.75)'];
      for (let tc = 0; tc < 3; tc++) {
        octx.beginPath();
        let hasT = false;
        for (let rIdx = 0; rIdx < tile.road.length; rIdx++) {
          const rd = tile.road[rIdx];
          if (rd.lbl || (rd.cls !== 'primary' && rd.cls !== 'trunk' && rd.cls !== 'motorway')) continue;
          if ((rIdx % 5 === 0 ? 2 : (rIdx % 3 === 0 ? 1 : 0)) !== tc) continue;
          hasT = true;
          for (const ring of rd.c) {
            for (let i = 0; i < ring.length; i++) {
              const [px, py] = ptTo(ring[i]);
              if (i === 0) octx.moveTo(px, py);
              else octx.lineTo(px, py);
            }
          }
        }
        if (hasT) {
          octx.strokeStyle = trafficColors[tc];
          octx.lineWidth = 2.2;
          octx.stroke();
        }
      }
    }

    // 5. Edifícios (Renderizados por cima da malha de asfalto, respeitando os lotes e quarteirões)
    if (tile.building && tile.building.length) {
      octx.beginPath();
      for (const b of tile.building) {
        for (const ring of b.c) {
          if (ring.length < 3) continue;
          for (let i = 0; i < ring.length; i++) {
            const [px, py] = ptTo(ring[i]);
            if (i === 0) octx.moveTo(px, py);
            else octx.lineTo(px, py);
          }
          octx.closePath();
        }
      }
      octx.fillStyle = this.show3D ? pal.bldgSide : pal.bldgFill;
      octx.fill();

      if (this.show3D) {
        octx.beginPath();
        for (const b of tile.building) {
          const hOff = Math.min(18, (b.h || 10) * 0.35);
          for (const ring of b.c) {
            if (ring.length < 3) continue;
            for (let i = 0; i < ring.length; i++) {
              const [px, py] = ptTo(ring[i]);
              if (i === 0) octx.moveTo(px - hOff * 0.35, py - hOff);
              else octx.lineTo(px - hOff * 0.35, py - hOff);
            }
            octx.closePath();
          }
        }
        octx.fillStyle = pal.bldgTop;
        octx.fill();
        octx.strokeStyle = pal.bldgStroke;
        octx.lineWidth = 1.0;
        octx.stroke();
      }
    }

    if (this.bitmapCache.size >= 36) {
      const oldest = this.bitmapCache.keys().next().value;
      this.bitmapCache.delete(oldest);
    }
    this.bitmapCache.set(bmpKey, off);
    return off;
  }

  _renderVectorTiles(ctx, pal) {
    const tz = Math.min(14, Math.max(10, Math.floor(this.zoom)));
    const scaleFactor = 256 * Math.pow(2, this.zoom - tz);

    const centerProj = PonteMapEngine.project(this.lat, this.lng, this.zoom);
    const tlWorldX = centerProj.x - this.width / 2;
    const tlWorldY = centerProj.y - this.height / 2;

    const minTx = Math.floor(tlWorldX / scaleFactor);
    const maxTx = Math.floor((tlWorldX + this.width) / scaleFactor);
    const minTy = Math.floor(tlWorldY / scaleFactor);
    const maxTy = Math.floor((tlWorldY + this.height) / scaleFactor);

    const maxTileIdx = Math.pow(2, tz) - 1;
    const activeTiles = [];
    let rasterizedThisFrame = 0;

    for (let tx = minTx; tx <= maxTx; tx++) {
      for (let ty = minTy; ty <= maxTy; ty++) {
        if (tx < 0 || ty < 0 || tx > maxTileIdx || ty > maxTileIdx) continue;
        const key = `${tz}/${tx}/${ty}`;
        this._fetchTile(tz, tx, ty);
        const tile = this.tileCache.get(key);
        // Tiles sintéticos (fora das áreas semeadas) não são desenhados: o relevo + Natural Earth ficam visíveis
        const synthetic = tile && (tile.sintetico || (!(tile.building || []).length && !(tile.poi || []).length && !(tile.water || []).length
          && (tile.road || []).length === 8 && tile.road.every((r) => r.c[0] && r.c[0].length === 2)));
        if (tile && !synthetic) {
          const sx = tx * scaleFactor - tlWorldX;
          const sy = ty * scaleFactor - tlWorldY;
          const bmpKey = `${key}_${this.theme}_${this.show3D ? 1 : 0}_${this.showTraffic ? 1 : 0}`;
          const alreadyBmp = this.bitmapCache.has(bmpKey);
          if (alreadyBmp || rasterizedThisFrame < 1) {
            if (!alreadyBmp) rasterizedThisFrame++;
            const bmp = this._getTileBitmap(key, tile, pal);
            ctx.drawImage(bmp, sx, sy, scaleFactor + 0.6, scaleFactor + 0.6);
            activeTiles.push({ tile, sx, sy, size: scaleFactor });
          } else {
            // Agenda próximo frame suave sem travar CPU
            setTimeout(() => { this.needsRender = true; }, 16);
          }
        }
      }
    }

    const toPx = (pt, sx, sy, sz) => [sx + (pt[0] / 1000) * sz, sy + (pt[1] / 1000) * sz];

    // Camada 4: Nomes das Ruas & POIs (Anti-Colisão — pula durante arraste/voo rápido para 60 FPS cravados)
    if (this.zoom >= 13.0 && !this.isDragging && !this.flyAnim) {
      const placedLabels = [];
      const canPlace = (x, y, distW = 100, distH = 26) => {
        if (x < 20 || x > this.width - 20 || y < 20 || y > this.height - 20) return false;
        return !placedLabels.some((b) => Math.abs(b.x - x) < distW && Math.abs(b.y - y) < distH);
      };

      ctx.font = '700 10.5px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // Nomes de Ruas rotacionados no ângulo da via
      for (const { tile, sx, sy, size } of activeTiles) {
        for (const rd of tile.road) {
          if (!rd.n || !rd.c[0] || rd.c[0].length < 2) continue;
          const ring = rd.c[0];
          const mid = Math.floor(ring.length / 2);
          const [x1, y1] = toPx(ring[Math.max(0, mid - 1)], sx, sy, size);
          const [x2, y2] = toPx(ring[Math.min(ring.length - 1, mid)], sx, sy, size);
          const mx = (x1 + x2) / 2;
          const my = (y1 + y2) / 2;
          if (!canPlace(mx, my, 110, 28)) continue;

          let angle = Math.atan2(y2 - y1, x2 - x1);
          if (angle > Math.PI / 2 || angle < -Math.PI / 2) angle += Math.PI;

          placedLabels.push({ x: mx, y: my });
          ctx.save();
          ctx.translate(mx, my);
          ctx.rotate(angle);
          ctx.lineWidth = 3.5;
          ctx.strokeStyle = pal.roadTextHalo;
          ctx.strokeText(rd.n.slice(0, 28), 0, 0);
          ctx.fillStyle = pal.roadText;
          ctx.fillText(rd.n.slice(0, 28), 0, 0);
          ctx.restore();
        }
      }

      // POIs (Hospitais, Metrôs, Shoppings, Aeroportos) em zoom >= 14
      if (this.zoom >= 13.8) {
        ctx.font = '600 10px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
        for (const { tile, sx, sy, size } of activeTiles) {
          for (const poi of tile.poi) {
            // Suporta formato sintético (poi.nome / poi.tipo, poi.x/poi.y) e formato HQ (poi.n / poi.cls / poi.p = [x, y])
            const poiName = poi.n != null ? poi.n : poi.nome;
            if (!poiName) continue;
            const pp = poi.p ? poi.p : (poi.x != null && poi.y != null ? [poi.x, poi.y] : null);
            if (!pp || pp.length < 2) continue;
            const [px, py] = toPx(pp, sx, sy, size);
            if (!canPlace(px, py, 105, 24)) continue;
            placedLabels.push({ x: px, y: py });

            let dotColor = '#38bdf8';
            const cls = poi.cls != null ? poi.cls : poi.tipo;
            if (cls === 'hospital') dotColor = '#ef4444';
            else if (cls === 'park') dotColor = '#10b981';
            else if (cls === 'railway' || cls === 'bus') dotColor = '#8b5cf6';

            ctx.beginPath();
            ctx.arc(px, py, 4.5, 0, Math.PI * 2);
            ctx.fillStyle = dotColor;
            ctx.fill();
            ctx.lineWidth = 1.5;
            ctx.strokeStyle = '#ffffff';
            ctx.stroke();

            ctx.lineWidth = 3;
            ctx.strokeStyle = pal.roadTextHalo;
            ctx.strokeText(poiName.slice(0, 22), px, py - 11);
            ctx.fillStyle = pal.poiText;
            ctx.fillText(poiName.slice(0, 22), px, py - 11);
          }
        }
      }
    }
  }

  _buildSmoothTrajectory(waypoints, modal = 'carro') {
    if (!Array.isArray(waypoints) || waypoints.length < 2) return null;
    const cosLat0 = Math.cos((waypoints[0].lat * Math.PI) / 180);
    const mPorGrauLat = 111320;
    const mPorGrauLng = 111320 * cosLat0;

    // Offset lateral na pista por modal viário (mão direita no Brasil):
    // - moto: segue no corredor central / Faixa Azul CET (+0.8m)
    // - carro: segue no centro da faixa da direita (+2.4m)
    // - caminhao: segue na faixa da direita de veículos pesados (+3.2m)
    // - bike / a_pe: ciclofaixa / bordo da pista (+3.6m a +4.2m)
    const offsetM = modal === 'moto' ? 0.8 : (modal === 'bike' ? 3.4 : (modal === 'a_pe' ? 4.2 : 2.4));

    // 1. Filtragem de ruído de discretização da malha viária (< 3.0m)
    const filtered = [waypoints[0]];
    for (let i = 1; i < waypoints.length; i++) {
      const cur = waypoints[i];
      const prev = filtered[filtered.length - 1];
      const d = Math.hypot((cur.lng - prev.lng) * mPorGrauLng, (cur.lat - prev.lat) * mPorGrauLat);
      if (d >= 3.0 || i === waypoints.length - 1) filtered.push(cur);
    }
    if (filtered.length < 2) return null;

    // 2. Remoção de ziguezagues espúrios e S-bends curtos (preservando curvas contínuas de rotatórias)
    const unkinked = [filtered[0]];
    for (let i = 1; i < filtered.length - 1; i++) {
      const p0 = unkinked[unkinked.length - 1];
      const p1 = filtered[i];
      const p2 = filtered[i + 1];

      const v1x = (p1.lng - p0.lng) * mPorGrauLng;
      const v1y = (p1.lat - p0.lat) * mPorGrauLat;
      const v2x = (p2.lng - p1.lng) * mPorGrauLng;
      const v2y = (p2.lat - p1.lat) * mPorGrauLat;
      const len1 = Math.hypot(v1x, v1y);
      const len2 = Math.hypot(v2x, v2y);
      const dot = (v1x * v2x + v1y * v2y) / Math.max(0.01, len1 * len2);

      // Desvia curvas espúrias (> 80° em trecho curto < 32m), exceto pontos explícitos de rotatória
      if (!p1.rotatoria && dot < 0.15 && (len1 < 32 || len2 < 32)) continue;

      // Supressor de zigue-zague alternado (esquerda-direita em trechos curtos < 38m)
      if (!p1.rotatoria && i + 2 < filtered.length && len1 < 38 && len2 < 38) {
        const p3 = filtered[i + 2];
        const v3x = (p3.lng - p2.lng) * mPorGrauLng;
        const v3y = (p3.lat - p2.lat) * mPorGrauLat;
        const cross1 = v1x * v2y - v1y * v2x;
        const cross2 = v2x * v3y - v2y * v3x;
        if (cross1 * cross2 < 0 && Math.hypot(v3x, v3y) < 38) continue;
      }

      unkinked.push(p1);
    }
    unkinked.push(filtered[filtered.length - 1]);

    // 3. Relaxamento Laplaciano para alinhar o eixo central da avenida sem ondulações
    let relaxed = unkinked.map((p) => ({ ...p }));
    for (let pass = 0; pass < 2; pass++) {
      const next = [relaxed[0]];
      for (let i = 1; i < relaxed.length - 1; i++) {
        next.push({
          lat: 0.20 * relaxed[i - 1].lat + 0.60 * relaxed[i].lat + 0.20 * relaxed[i + 1].lat,
          lng: 0.20 * relaxed[i - 1].lng + 0.60 * relaxed[i].lng + 0.20 * relaxed[i + 1].lng
        });
      }
      next.push(relaxed[relaxed.length - 1]);
      relaxed = next;
    }

    // 4. Converte o eixo central para coordenadas métricas locais
    const ox = relaxed[0].lng * mPorGrauLng;
    const oy = relaxed[0].lat * mPorGrauLat;
    const mPts = relaxed.map((p) => ({
      x: p.lng * mPorGrauLng - ox,
      y: p.lat * mPorGrauLat - oy
    }));

    // Extensões de contorno para tangentes suaves nas pontas
    const pStart = { x: 2 * mPts[0].x - mPts[1].x, y: 2 * mPts[0].y - mPts[1].y };
    const pEnd = {
      x: 2 * mPts[mPts.length - 1].x - mPts[mPts.length - 2].x,
      y: 2 * mPts[mPts.length - 1].y - mPts[mPts.length - 2].y
    };
    const ext = [pStart, ...mPts, pEnd];

    // Spline Centripetal de Catmull-Rom (alpha = 0.5) — C1 contínua
    const getT = (tPrev, pA, pB) => {
      const d = Math.hypot(pB.x - pA.x, pB.y - pA.y);
      return tPrev + Math.pow(Math.max(d, 0.001), 0.5);
    };

    const raw = [];
    for (let i = 1; i < ext.length - 2; i++) {
      const p0 = ext[i - 1]; const p1 = ext[i]; const p2 = ext[i + 1]; const p3 = ext[i + 2];
      const t0 = 0; const t1 = getT(t0, p0, p1); const t2 = getT(t1, p1, p2); const t3 = getT(t2, p2, p3);
      const segLen = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      const numSub = Math.max(3, Math.min(80, Math.ceil(segLen / 2.0)));

      for (let s = 0; s < numSub; s++) {
        const t = t1 + (s / numSub) * (t2 - t1);
        const a1x = ((t1 - t) / (t1 - t0)) * p0.x + ((t - t0) / (t1 - t0)) * p1.x;
        const a1y = ((t1 - t) / (t1 - t0)) * p0.y + ((t - t0) / (t1 - t0)) * p1.y;
        const a2x = ((t2 - t) / (t2 - t1)) * p1.x + ((t - t1) / (t2 - t1)) * p2.x;
        const a2y = ((t2 - t) / (t2 - t1)) * p1.y + ((t - t1) / (t2 - t1)) * p2.y;
        const a3x = ((t3 - t) / (t3 - t2)) * p2.x + ((t - t2) / (t3 - t2)) * p3.x;
        const a3y = ((t3 - t) / (t3 - t2)) * p2.y + ((t - t2) / (t3 - t2)) * p3.y;

        const b1x = ((t2 - t) / (t2 - t0)) * a1x + ((t - t0) / (t2 - t0)) * a2x;
        const b1y = ((t2 - t) / (t2 - t0)) * a1y + ((t - t0) / (t2 - t0)) * a2y;
        const b2x = ((t3 - t) / (t3 - t1)) * a2x + ((t - t1) / (t3 - t1)) * a3x;
        const b2y = ((t3 - t) / (t3 - t1)) * a2y + ((t - t1) / (t3 - t1)) * a3y;

        const cx = ((t2 - t) / (t2 - t1)) * b1x + ((t - t1) / (t2 - t1)) * b2x;
        const cy = ((t2 - t) / (t2 - t1)) * b1y + ((t - t1) / (t2 - t1)) * b2y;
        raw.push({ x: cx, y: cy });
      }
    }
    raw.push(mPts[mPts.length - 1]);

    // 5. Reamostragem Uniforme por Comprimento de Arco Constante (2.0m)
    const cum = [0];
    for (let i = 1; i < raw.length; i++) {
      const d = Math.hypot(raw[i].x - raw[i - 1].x, raw[i].y - raw[i - 1].y);
      cum.push(cum[i - 1] + d);
    }
    const totalDistM = cum[cum.length - 1];
    const stepM = 2.0; // Resolução métrica constante: 1 ponto a cada 2.0 metros reais
    const totalSteps = Math.max(16, Math.ceil(totalDistM / stepM));
    const samples = [];

    let curIdx = 0;
    for (let s = 0; s <= totalSteps; s++) {
      const targetDist = (s / totalSteps) * totalDistM;
      while (curIdx < cum.length - 2 && cum[curIdx + 1] < targetDist) {
        curIdx++;
      }
      const d0 = cum[curIdx];
      const d1 = cum[curIdx + 1];
      const frac = d1 > d0 ? (targetDist - d0) / (d1 - d0) : 0;
      const x = raw[curIdx].x + (raw[curIdx + 1].x - raw[curIdx].x) * frac;
      const y = raw[curIdx].y + (raw[curIdx + 1].y - raw[curIdx].y) * frac;
      samples.push({
        distM: Number(targetDist.toFixed(1)),
        x,
        y
      });
    }

    // 6. Aplica o deslocamento lateral contínuo diretamente sobre a spline ultra-suave
    for (let i = 0; i < samples.length; i++) {
      let tx = 0; let ty = 0;
      if (i === 0) {
        tx = samples[1].x - samples[0].x;
        ty = samples[1].y - samples[0].y;
      } else if (i === samples.length - 1) {
        tx = samples[i].x - samples[i - 1].x;
        ty = samples[i].y - samples[i - 1].y;
      } else {
        tx = samples[i + 1].x - samples[i - 1].x;
        ty = samples[i + 1].y - samples[i - 1].y;
      }
      const len = Math.hypot(tx, ty);
      const nx = ty / len;
      const ny = -tx / len;
      const finalX = samples[i].x + nx * offsetM;
      const finalY = samples[i].y + ny * offsetM;
      samples[i].x = finalX;
      samples[i].y = finalY;
      samples[i].lat = Number(((finalY + oy) / mPorGrauLat).toFixed(6));
      samples[i].lng = Number(((finalX + ox) / mPorGrauLng).toFixed(6));
    }

    return { samples, totalDistM };
  }

  _getRouteTrajectory() {
    if (!this.routeData || !this.routeData.valido) return null;
    const modal = this.vehicleModal || this.routeData.modalSelecionado || 'carro';
    if (!this.routeTrajectory || this.routeTrajectoryModal !== modal) {
      const wps = this.routeData.geometriaRota?.waypoints || [];
      if (wps.length < 2) return null;
      this.routeTrajectory = this._buildSmoothTrajectory(wps, modal);
      this.routeTrajectoryModal = modal;
    }
    return this.routeTrajectory;
  }

  _renderRoute(ctx, pal) {
    const r = this.routeData;
    const wps = r.geometriaRota?.waypoints || [];
    if (wps.length < 2) return;

    const modal = this.vehicleModal || r.modalSelecionado || 'carro';

    // 0. Rotas Alternativas mais clarinhas e suavizadas para desvio na pista ou escolha do motorista
    if (Array.isArray(r.rotasAlternativas) && r.rotasAlternativas.length > 0) {
      this.alternativeRouteHitBoxes = [];
      for (const alt of r.rotasAlternativas) {
        if (!alt.waypoints || alt.waypoints.length < 2) continue;
        if (!alt._traj || alt._trajModal !== modal) {
          alt._traj = this._buildSmoothTrajectory(alt.waypoints, modal);
          alt._trajModal = modal;
        }
        const altPts = alt._traj ? alt._traj.samples : alt.waypoints;
        const altScreenPts = altPts.map((p) => this.latLngToScreen(p.lat, p.lng));

        ctx.save();
        ctx.beginPath();
        altScreenPts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        // Casing translúcido discreto
        ctx.strokeStyle = this.theme === 'light' ? 'rgba(15, 23, 42, 0.12)' : 'rgba(2, 6, 23, 0.40)';
        ctx.lineWidth = 7.0;
        ctx.stroke();

        // Fita mais clarinha / translúcida conforme solicitado pelo usuário
        ctx.strokeStyle = this.theme === 'light' ? 'rgba(100, 116, 139, 0.50)' : 'rgba(148, 163, 184, 0.42)';
        ctx.lineWidth = 4.2;
        ctx.setLineDash([7, 9]);
        ctx.stroke();
        ctx.setLineDash([]);

        // Pílula / Selo da Rota Alternativa no ponto médio (clicável para escolher a rota)
        if (this.zoom >= 12.8 && altScreenPts.length >= 4) {
          const midIdx = Math.floor(altScreenPts.length * 0.5);
          const mp = altScreenPts[midIdx];
          const badgeTxt = `+${alt.diferencaTempoMin || 3} min • ${alt.distanciaFormatada}`;

          ctx.font = '700 9.5px -apple-system, "Segoe UI", sans-serif';
          const tw = ctx.measureText(badgeTxt).width;
          const boxW = tw + 16;
          const boxH = 22;

          this.alternativeRouteHitBoxes.push({
            id: alt.id,
            x: mp.x - boxW / 2,
            y: mp.y - boxH / 2,
            w: boxW,
            h: boxH,
            rota: alt
          });

          ctx.fillStyle = this.theme === 'dark' ? 'rgba(15, 23, 42, 0.94)' : 'rgba(255, 255, 255, 0.94)';
          ctx.beginPath();
          ctx.roundRect(mp.x - boxW / 2, mp.y - boxH / 2, boxW, boxH, 6);
          ctx.fill();
          ctx.strokeStyle = alt.aprovadaParaCaminhao === false ? '#ef4444' : '#38bdf8';
          ctx.lineWidth = 1.4;
          ctx.stroke();

          ctx.fillStyle = alt.aprovadaParaCaminhao === false ? '#ef4444' : (this.theme === 'dark' ? '#f8fafc' : '#0f172a');
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(badgeTxt, mp.x, mp.y);
        }
        ctx.restore();
      }
    }

    const traj = this._getRouteTrajectory();
    const samples = traj ? traj.samples : wps;
    const totalDistM = traj ? traj.totalDistM : 1000;

    // Projeta os pontos da trajetória pré-calculada para coordenadas de tela
    const screenPts = samples.map((p) => this.latLngToScreen(p.lat, p.lng));

    // 1. Trilha base completa (Fita de Navegação Uber/iFood com Faixa Azul e Chevrons)
    ctx.save();
    ctx.beginPath();
    screenPts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Casing externo de alto contraste
    ctx.strokeStyle = this.theme === 'light' ? 'rgba(15, 23, 42, 0.20)' : 'rgba(2, 6, 23, 0.75)';
    ctx.lineWidth = modal === 'moto' ? 8.5 : 10;
    ctx.stroke();

    // Fita principal da Rota
    if (modal === 'moto') {
      // Corredor da Faixa Azul CET (Azul Celeste com brilho de segurança)
      ctx.strokeStyle = this.theme === 'light' ? '#0284c7' : '#0ea5e9';
      ctx.lineWidth = 5.2;
      ctx.stroke();

      // Guia central tracejada da Faixa Azul no leito viário
      ctx.setLineDash([7, 10]);
      ctx.lineDashOffset = -this.trafficOffset * 1.8;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.8;
      ctx.stroke();
      ctx.setLineDash([]);
    } else {
      // Carro / Caminhão: Fita de navegação veicular Uber
      ctx.strokeStyle = this.theme === 'light' ? '#2563eb' : '#0284c7';
      ctx.lineWidth = 5.5;
      ctx.stroke();

      // Chevrons direcionais no sentido do fluxo
      ctx.setLineDash([8, 14]);
      ctx.lineDashOffset = -this.trafficOffset * 1.6;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.2;
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // 2. Posição Exata do Veículo por Comprimento de Arco (Arc-Length Interpolation)
    // Elimina completamente o zigue-zague ao avaliar a distância contínua em metros
    const targetDist = Math.min(totalDistM - 0.01, Math.max(0, (this.vehicleProgress / 100) * totalDistM));

    let low = 0;
    let high = samples.length - 1;
    while (low <= high) {
      const mid = (low + high) >> 1;
      if (samples[mid].distM < targetDist) low = mid + 1;
      else high = mid - 1;
    }
    const idxA = Math.max(0, Math.min(samples.length - 2, high));
    const idxB = idxA + 1;

    const pA = samples[idxA];
    const pB = samples[idxB];
    const spanM = Math.max(0.001, (pB.distM ?? idxB) - (pA.distM ?? idxA));
    const frac = Math.max(0, Math.min(1, (targetDist - (pA.distM ?? idxA)) / spanM));

    const curLat = pA.lat + (pB.lat - pA.lat) * frac;
    const curLng = pA.lng + (pB.lng - pA.lng) * frac;
    const vehicleScreenPos = this.latLngToScreen(curLat, curLng);
    const vx = vehicleScreenPos.x;
    const vy = vehicleScreenPos.y;

    // Trecho percorrido em Verde Fluorescente (Concluído)
    if (this.vehicleProgress > 0) {
      ctx.beginPath();
      for (let i = 0; i <= idxA; i++) {
        if (i === 0) ctx.moveTo(screenPts[i].x, screenPts[i].y);
        else ctx.lineTo(screenPts[i].x, screenPts[i].y);
      }
      ctx.lineTo(vx, vy);
      ctx.strokeStyle = '#22c55e';
      ctx.lineWidth = modal === 'moto' ? 5.2 : 5.5;
      ctx.shadowColor = 'rgba(34, 197, 94, 0.55)';
      ctx.shadowBlur = 8;
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // 3. Praças de Pedágio
    for (const pr of r.pedagios?.pracas || []) {
      const pp = this.latLngToScreen(pr.coordenadas.lat, pr.coordenadas.lng);
      ctx.beginPath();
      ctx.arc(pp.x, pp.y, 10, 0, Math.PI * 2);
      ctx.fillStyle = '#f59e0b';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#090e1a';
      ctx.stroke();
      ctx.fillStyle = '#090e1a';
      ctx.font = '900 10px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('$', pp.x, pp.y + 0.5);
    }

    // 3.5 Radares fiscalizando a rota e semáforos no trajeto
    const sr = r.sinalizacaoRota;
    if (sr) {
      if (this.zoom >= 13.5 && Array.isArray(sr.semaforos)) {
        for (const s of sr.semaforos) {
          const sp = this.latLngToScreen(s[0], s[1]);
          if (sp.x < -10 || sp.y < -10 || sp.x > this.width + 10 || sp.y > this.height + 10) continue;
          this._drawTrafficLight(ctx, sp.x, sp.y, 0.95, s[0], s[1]);
        }
      }
      for (const rd of sr.radares || []) {
        const rp = this.latLngToScreen(rd.lat, rd.lng);
        if (rp.x < -20 || rp.y < -20 || rp.x > this.width + 20 || rp.y > this.height + 20) continue;
        this._drawRadar(ctx, rp.x, rp.y, rd.limiteKmh, true);
      }
    }

    // 4. Marcadores Origem (A) e Destino (B)
    const drawPin = (pt, label, bgColor, textColor) => {
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 16, 0, Math.PI * 2);
      ctx.fillStyle = bgColor + '33';
      ctx.fill();

      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 10, 0, Math.PI * 2);
      ctx.fillStyle = bgColor;
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();

      ctx.fillStyle = textColor;
      ctx.font = '900 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, pt.x, pt.y + 0.5);
    };

    drawPin(screenPts[0], 'A', '#a3e635', '#090e1a');
    drawPin(screenPts[screenPts.length - 1], 'B', '#3b82f6', '#ffffff');

    // 5. Veículo Animado com Derivada Tangencial Contínua da Spline (Zero Zigue-Zague)
    // Janela simétrica de 16m no leito viário: elimina totalmente oscilações locais e ruídos angulares
    const windowM = 16.0;
    const dBehind = Math.max(0, targetDist - windowM * 0.5);
    const dAhead = Math.min(totalDistM, targetDist + windowM * 0.5);

    let lowBh = 0;
    let highBh = samples.length - 1;
    while (lowBh <= highBh) {
      const mid = (lowBh + highBh) >> 1;
      if (samples[mid].distM < dBehind) lowBh = mid + 1;
      else highBh = mid - 1;
    }
    const idxBh = Math.max(0, Math.min(samples.length - 1, highBh));

    let lowAh = 0;
    let highAh = samples.length - 1;
    while (lowAh <= highAh) {
      const mid = (lowAh + highAh) >> 1;
      if (samples[mid].distM < dAhead) lowAh = mid + 1;
      else highAh = mid - 1;
    }
    const idxAh = Math.max(0, Math.min(samples.length - 1, lowAh));

    const pBh = samples[idxBh];
    const pAh = samples[idxAh];
    const scrBh = this.latLngToScreen(pBh.lat, pBh.lng);
    const scrAh = this.latLngToScreen(pAh.lat, pAh.lng);

    const dScr = Math.hypot(scrAh.x - scrBh.x, scrAh.y - scrBh.y);
    const targetAngle = dScr > 1.0
      ? Math.atan2(scrAh.y - scrBh.y, scrAh.x - scrBh.x)
      : (this.currentVehicleAngle ?? 0);

    if (this.currentVehicleAngle === undefined) {
      this.currentVehicleAngle = targetAngle;
    } else {
      let diff = targetAngle - this.currentVehicleAngle;
      while (diff < -Math.PI) diff += Math.PI * 2;
      while (diff > Math.PI) diff -= Math.PI * 2;
      this.currentVehicleAngle += diff * 0.25;
    }
    const angle = this.currentVehicleAngle;

    // Câmera Auto-Follow suave estilo GPS de app quando o veículo estiver em deslocamento
    if (this.followVehicle && this.vehicleProgress > 0 && this.vehicleProgress < 100 && !this.isDragging) {
      const curLl = this.screenToLatLng(vx, vy);
      this.lat += (curLl.lat - this.lat) * 0.05;
      this.lng += (curLl.lng - this.lng) * 0.05;
    }

    ctx.save();
    ctx.translate(vx, vy);

    // Aura pulsante de sinal GPS de alta precisão
    const pulseR = 19 + Math.sin(Date.now() / 240) * 3.5;
    ctx.beginPath();
    ctx.arc(0, 0, pulseR, 0, Math.PI * 2);
    ctx.fillStyle = modal === 'moto' ? 'rgba(56, 189, 248, 0.20)' : 'rgba(163, 230, 53, 0.16)';
    ctx.fill();

    // Sombra do veículo no asfalto
    ctx.save();
    ctx.translate(2, 3);
    ctx.rotate(angle + Math.PI / 2);
    ctx.beginPath();
    ctx.ellipse(0, 0, modal === 'moto' ? 6 : 10, modal === 'caminhao' ? 24 : 16, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.fill();
    ctx.restore();

    // Rotação na direção da rua
    ctx.rotate(angle + Math.PI / 2);

    // Feixe de luz dos faróis iluminando a pista à frente (efeito noturno/diurno Google/Uber)
    const hlGrad = ctx.createRadialGradient(0, -12, 2, 0, -36, 28);
    hlGrad.addColorStop(0, 'rgba(255, 255, 215, 0.45)');
    hlGrad.addColorStop(1, 'rgba(255, 255, 215, 0.0)');
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(-5, -12);
    ctx.lineTo(-20, -44);
    ctx.lineTo(20, -44);
    ctx.lineTo(5, -12);
    ctx.closePath();
    ctx.fillStyle = hlGrad;
    ctx.fill();
    ctx.restore();

    if (modal === 'moto') {
      // ── MOTO DELIVERY (ESTILO IFOOD) ──
      // Chassi da moto
      ctx.beginPath();
      ctx.roundRect(-3.5, -14, 7, 28, 3.5);
      ctx.fillStyle = '#1e293b';
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = '#ef4444';
      ctx.stroke();

      // Pneu dianteiro e traseiro
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(-2, -16, 4, 5);
      ctx.fillRect(-2, 11, 4, 5);

      // Guidão com manoplas
      ctx.beginPath();
      ctx.moveTo(-9, -8);
      ctx.lineTo(9, -8);
      ctx.lineWidth = 2.2;
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineCap = 'round';
      ctx.stroke();

      // Piloto (Capacete)
      ctx.beginPath();
      ctx.arc(0, -3, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = '#f8fafc';
      ctx.fill();
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = '#0f172a';
      ctx.stroke();
      // Viseira do capacete
      ctx.beginPath();
      ctx.arc(0, -3, 3.5, -Math.PI * 0.8, -Math.PI * 0.2);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = '#0284c7';
      ctx.stroke();

      // Baú / Bag Térmica de Entrega (Vermelha iFood com faixa reflexiva)
      ctx.beginPath();
      ctx.roundRect(-6.5, 4, 13, 11, 2.5);
      ctx.fillStyle = '#dc2626';
      ctx.fill();
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
      // Faixa reflexiva
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-5, 8.5, 10, 2);

      // Lanterna traseira LED
      ctx.beginPath();
      ctx.arc(0, 15, 1.8, 0, Math.PI * 2);
      ctx.fillStyle = '#ff2222';
      ctx.shadowColor = '#ff2222';
      ctx.shadowBlur = 6;
      ctx.fill();
      ctx.shadowBlur = 0;

    } else if (modal === 'caminhao') {
      // ── CAMINHÃO LOGÍSTICA ANTT ──
      // Baú / Carroceria de carga
      ctx.beginPath();
      ctx.roundRect(-10, -8, 20, 32, 2);
      ctx.fillStyle = '#334155';
      ctx.fill();
      ctx.lineWidth = 1.8;
      ctx.strokeStyle = '#94a3b8';
      ctx.stroke();

      // Faixas refletivas traseiras (norma CONTRAN)
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(-9, 21, 6, 2.5);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-3, 21, 6, 2.5);
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(3, 21, 6, 2.5);

      // Cabine frontal
      ctx.beginPath();
      ctx.roundRect(-9.5, -22, 19, 13, 3);
      ctx.fillStyle = '#0284c7';
      ctx.fill();
      ctx.lineWidth = 1.8;
      ctx.strokeStyle = '#38bdf8';
      ctx.stroke();

      // Para-brisa amplo de caminhão
      ctx.beginPath();
      ctx.roundRect(-7.5, -20, 15, 5, 1.5);
      ctx.fillStyle = '#0f172a';
      ctx.fill();

      // Retrovisores de carreta
      ctx.fillStyle = '#0284c7';
      ctx.fillRect(-12.5, -17, 3, 2);
      ctx.fillRect(9.5, -17, 3, 2);

      // Faróis duplos
      ctx.fillStyle = '#fef08a';
      ctx.fillRect(-8.5, -23, 3.5, 2);
      ctx.fillRect(5, -23, 3.5, 2);

    } else {
      // ── CARRO EXECUTIVO / UBER ──
      // Carroceria aerodinâmica
      ctx.beginPath();
      ctx.roundRect(-9, -15, 18, 30, 6);
      ctx.fillStyle = '#0f172a';
      ctx.fill();
      ctx.lineWidth = 2.2;
      ctx.strokeStyle = '#a3e635';
      ctx.stroke();

      // Capô e teto
      ctx.beginPath();
      ctx.roundRect(-6.5, -7, 13, 14, 3);
      ctx.fillStyle = '#1e293b';
      ctx.fill();

      // Para-brisa dianteiro com reflexo
      ctx.beginPath();
      ctx.roundRect(-6.5, -10, 13, 5.5, 2);
      ctx.fillStyle = '#38bdf8';
      ctx.fill();

      // Vidro traseiro
      ctx.beginPath();
      ctx.roundRect(-6, 7.5, 12, 4, 1.5);
      ctx.fillStyle = '#0284c7';
      ctx.fill();

      // Retrovisores laterais
      ctx.beginPath();
      ctx.ellipse(-10.5, -8, 2, 1.4, -0.2, 0, Math.PI * 2);
      ctx.ellipse(10.5, -8, 2, 1.4, 0.2, 0, Math.PI * 2);
      ctx.fillStyle = '#a3e635';
      ctx.fill();

      // Faróis dianteiros LED
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = '#ffffff';
      ctx.shadowBlur = 8;
      ctx.fillRect(-7.5, -15, 3.5, 2);
      ctx.fillRect(4, -15, 3.5, 2);
      ctx.shadowBlur = 0;

      // Lanternas traseiras em LED vermelho brilhante
      ctx.fillStyle = '#ef4444';
      ctx.shadowColor = '#ef4444';
      ctx.shadowBlur = 8;
      ctx.fillRect(-7.5, 13.5, 3.5, 2);
      ctx.fillRect(4, 13.5, 3.5, 2);
      ctx.shadowBlur = 0;
    }

    ctx.restore();

    // 6. Placa de limite da via atual acompanhando o veículo (apenas em zoom urbano)
    if (this.zoom >= 11.5 && this.vehicleProgress > 0 && this.vehicleProgress < 100) {
      const lim = this._currentSpeedLimit();
      if (lim) this._drawSpeedSign(ctx, vx + 24, vy - 24, lim.kmh, 12);
    }

    // 7. Pontes, Viadutos, Gabarito Vertical e Avaliação Automática por Placa de Caminhão
    this._renderBridgesAndOverpasses(ctx, pal);

    // 8. Rotatórias conhecidas na rota (inclusive sobre canais)
    this._renderRouteRoundabouts(ctx, pal);

    ctx.restore();
  }

  _renderRouteRoundabouts(ctx, pal) {
    const rotInfo = this.routeData && this.routeData.rotatoriasNaRota;
    const lista = (rotInfo && rotInfo.rotatoriasNaRota) || [];
    if (!lista.length || this.zoom < 13.5) return;

    const mpp = (156543.03392 * Math.cos((this.lat * Math.PI) / 180)) / Math.pow(2, this.zoom);
    ctx.save();
    for (const rot of lista) {
      const p = this.latLngToScreen(rot.coordenadas.lat, rot.coordenadas.lng);
      if (p.x < -60 || p.x > this.width + 60 || p.y < -60 || p.y > this.height + 60) continue;

      const rPx = Math.max(10, Math.min(42, (rot.raioM || 35) / mpp));
      if (rot.sobreCanal) {
        // Tabuleiro elevado da rotatória sobre o canal
        ctx.beginPath();
        ctx.arc(p.x, p.y, rPx + 5, 0, Math.PI * 2);
        ctx.strokeStyle = this.theme === 'dark' ? 'rgba(0,0,0,0.55)' : 'rgba(15,23,42,0.25)';
        ctx.lineWidth = 8;
        ctx.stroke();
      }

      // Ilha central da rotatória
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(5, rPx * 0.48), 0, Math.PI * 2);
      ctx.fillStyle = this.theme === 'dark' ? '#064e3b' : '#c8e6c9';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = rot.sobreCanal ? '#38bdf8' : '#94a3b8';
      ctx.stroke();

      if (this.zoom >= 14.8) {
        const tag = rot.sobreCanal ? `↻ Rotatória s/ ${rot.canalNome}` : `↻ ${rot.nome.split('(')[0].trim()}`;
        ctx.font = '700 9.5px -apple-system, "Segoe UI", sans-serif';
        const tw = ctx.measureText(tag).width;
        ctx.fillStyle = this.theme === 'dark' ? 'rgba(15, 23, 42, 0.92)' : 'rgba(255, 255, 255, 0.94)';
        ctx.beginPath();
        ctx.roundRect(p.x - tw / 2 - 7, p.y - rPx - 24, tw + 14, 18, 5);
        ctx.fill();
        ctx.strokeStyle = rot.sobreCanal ? '#38bdf8' : '#64748b';
        ctx.lineWidth = 1.2;
        ctx.stroke();
        ctx.fillStyle = this.theme === 'dark' ? '#f8fafc' : '#0f172a';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(tag, p.x, p.y - rPx - 15);
      }
    }
    ctx.restore();
  }

  _renderBridgesAndOverpasses(ctx, pal) {
    const pontesInfo = this.routeData && this.routeData.pontesEViadutos;
    const lista = (pontesInfo && pontesInfo.pontesNaRota) || [];
    if (!lista.length && this.zoom < 14) return;

    const modal = this.vehicleModal || this.routeData?.modalSelecionado || 'carro';
    const ehCaminhao = modal === 'caminhao' || Boolean(this.routeData?.inteligenciaVeicularPlacasPro?.especificacoesFisicas?.ehVeiculoPesado);
    const alturaVeiculo = Number(pontesInfo?.alturaVeiculoConsideradaM || 1.50);

    ctx.save();
    for (const ponte of lista) {
      const p = this.latLngToScreen(ponte.coordenadas.lat, ponte.coordenadas.lng);
      if (p.x < -60 || p.x > this.width + 60 || p.y < -60 || p.y > this.height + 60) continue;

      // 1. Tabuleiro Estrutural da Ponte / Viaduto com Guarda-Corpos
      ctx.save();
      ctx.translate(p.x, p.y);

      // Sombra projetada do viaduto na pista inferior (sobreposição realista)
      ctx.fillStyle = 'rgba(0, 0, 0, 0.40)';
      ctx.beginPath();
      ctx.roundRect(-24, -8, 48, 16, 4);
      ctx.fill();

      // Tabuleiro da ponte (concreto armado de alta resistência)
      ctx.fillStyle = this.theme === 'dark' ? '#334155' : '#cbd5e1';
      ctx.beginPath();
      ctx.roundRect(-26, -10, 52, 14, 4);
      ctx.fill();
      ctx.strokeStyle = this.theme === 'dark' ? '#64748b' : '#94a3b8';
      ctx.lineWidth = 1.8;
      ctx.stroke();

      // Guarda-corpos laterais brancos
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(-24, -12, 48, 2);
      ctx.fillRect(-24, 2, 48, 2);

      // Pilares de sustentação estrutural
      ctx.fillStyle = '#64748b';
      ctx.fillRect(-18, 4, 5, 8);
      ctx.fillRect(13, 4, 5, 8);
      ctx.restore();

      // 2. Placa de Gabarito de Altura e Dimensões da Ponte (em zoom >= 13.8)
      if (this.zoom >= 13.8) {
        const alturaFmt = `${ponte.alturaLivreM.toFixed(2).replace('.', ',')}m`;
        const compFmt = ponte.comprimentoM >= 1000 ? `${(ponte.comprimentoM / 1000).toFixed(1)}km` : `${ponte.comprimentoM}m`;
        const label = `${ponte.nome} (${compFmt})`;
        const tagGabarito = `⬍ Gabarito: ${alturaFmt}`;

        const colAlerta = !ponte.aprovadoGabarito && ehCaminhao ? '#ef4444' : '#10b981';
        const txtStatus = !ponte.aprovadoGabarito && ehCaminhao
          ? `⚠️ NÃO PASSA! Caminhão ${alturaVeiculo}m > ${alturaFmt}`
          : (ehCaminhao ? `✓ Passa com Folga (+${ponte.folgaGabaritoCm}cm)` : tagGabarito);

        ctx.font = '800 10px -apple-system, "Segoe UI", sans-serif';
        const tw = Math.max(ctx.measureText(label).width, ctx.measureText(txtStatus).width);
        const bx = p.x - tw / 2 - 8;
        const by = p.y - 42;

        ctx.fillStyle = this.theme === 'dark' ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.95)';
        ctx.beginPath();
        ctx.roundRect(bx, by, tw + 16, 30, 6);
        ctx.fill();
        ctx.strokeStyle = colAlerta;
        ctx.lineWidth = 1.6;
        ctx.stroke();

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = this.theme === 'dark' ? '#f8fafc' : '#0f172a';
        ctx.font = '700 9.5px sans-serif';
        ctx.fillText(label, p.x, by + 8.5);

        ctx.fillStyle = colAlerta;
        ctx.font = '800 9.5px sans-serif';
        ctx.fillText(txtStatus, p.x, by + 21);
      }
    }
    ctx.restore();
  }

  _hitTestAlternativeRoute(sx, sy) {
    if (!this.alternativeRouteHitBoxes) return null;
    for (const b of this.alternativeRouteHitBoxes) {
      if (sx >= b.x - 5 && sx <= b.x + b.w + 5 && sy >= b.y - 5 && sy <= b.y + b.h + 5) {
        return b;
      }
    }
    return null;
  }

  selectAlternativeRoute(altId) {
    if (!this.routeData || !Array.isArray(this.routeData.rotasAlternativas)) return;
    const alt = this.routeData.rotasAlternativas.find((a) => a.id === altId);
    if (!alt) return;

    this.activeAlternativeRouteId = altId;

    // Alterna a rota com o trajeto escolhido
    const wpsAnteriores = this.routeData.geometriaRota.waypoints;
    const distAnterior = this.routeData.resumoViagem.distanciaViariaKm;
    const distFmtAnterior = this.routeData.resumoViagem.distanciaFormatada;
    const tempoAnterior = this.routeData.resumoViagem.tempoEstimadoMin;
    const tempoFmtAnterior = this.routeData.resumoViagem.tempoFormatado;

    this.routeData.geometriaRota.waypoints = alt.waypoints;
    this.routeData.resumoViagem.distanciaViariaKm = alt.distanciaViariaKm;
    this.routeData.resumoViagem.distanciaFormatada = alt.distanciaFormatada;
    this.routeData.resumoViagem.tempoEstimadoMin = alt.tempoEstimadoMin;
    this.routeData.resumoViagem.tempoFormatado = alt.tempoFormatado;

    alt.waypoints = wpsAnteriores;
    alt.distanciaViariaKm = distAnterior;
    alt.distanciaFormatada = distFmtAnterior;
    alt.tempoEstimadoMin = tempoAnterior;
    alt.tempoFormatado = tempoFmtAnterior;

    this.routeTrajectory = null;
    this.currentVehicleAngle = undefined;
    this.needsRender = true;
    if (this.onAlternativeRouteSelect) this.onAlternativeRouteSelect(alt);
  }

  // ── SNAP TO ROAD & TELEMETRIA GPS AO VIVO ──
  snapGpsLocation(lat, lng, heading = null, speedKmh = null, modal = 'carro') {
    const waypoints = this.routeData?.geometriaRota?.waypoints;
    const nLat = parseFloat(lat);
    const nLng = parseFloat(lng);
    if (isNaN(nLat) || isNaN(nLng)) return null;

    let targetLat = nLat;
    let targetLng = nLng;
    let distSnap = 0;
    let viaNome = 'Via Local';

    if (Array.isArray(waypoints) && waypoints.length >= 2) {
      const cosLat = Math.cos((nLat * Math.PI) / 180);
      const kx = 111320 * cosLat;
      const ky = 110540;
      let bestD = Infinity;
      let bestP = null;

      for (let i = 0; i < waypoints.length - 1; i++) {
        const a = waypoints[i];
        const b = waypoints[i + 1];
        const ax = (a.lng - nLng) * kx;
        const ay = (a.lat - nLat) * ky;
        const bx = (b.lng - nLng) * kx;
        const by = (b.lat - nLat) * ky;
        const dx = bx - ax;
        const dy = by - ay;
        const len2 = dx * dx + dy * dy;
        let t = len2 > 0 ? -(ax * dx + ay * dy) / len2 : 0;
        t = Math.max(0, Math.min(1, t));
        const cx = ax + t * dx;
        const cy = ay + t * dy;
        const d = Math.hypot(cx, cy);

        if (d < bestD) {
          bestD = d;
          bestP = {
            lat: nLat + cy / ky,
            lng: nLng + cx / kx
          };
          viaNome = a.via || b.via || 'Via da Rota Ativa';
        }
      }

      // Se o GPS do celular estiver a até 80 metros da rota, fixa a posição exatamente no asfalto da via
      if (bestD <= 80.0 && bestP) {
        targetLat = bestP.lat;
        targetLng = bestP.lng;
        distSnap = bestD;
      }
    }

    this.gpsState = {
      lat: Number(targetLat.toFixed(6)),
      lng: Number(targetLng.toFixed(6)),
      rawLat: nLat,
      rawLng: nLng,
      distSnapM: Number(distSnap.toFixed(1)),
      snapped: distSnap > 0 && distSnap <= 80,
      heading: heading !== null ? heading : this.currentVehicleAngle,
      speedKmh: speedKmh !== null ? speedKmh : 0,
      viaNome,
      timestamp: Date.now()
    };

    if (this.followVehicle) {
      this.lat += (targetLat - this.lat) * 0.35;
      this.lng += (targetLng - this.lng) * 0.35;
    }

    this.needsRender = true;
    return this.gpsState;
  }
}
