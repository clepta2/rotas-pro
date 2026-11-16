/**
 * ponte-maps-engine.js
 * Motor Cartográfico Vetorial Canvas 2D HiDPI (60 FPS) Soberano — Ecossistema Ponte / OZPro
 * 100% Zero Dependências Externas (Sem Google Maps JS, Sem Mapbox GL, Sem Leaflet).
 *
 * Recursos:
 * - Projeção Web Mercator contínua (Zoom 4.0 a 18.5) com Pan, Wheel Zoom no cursor, Touch & Pinch-to-Zoom
 * - Renderização multi-camada: Estados IBGE, Rios, Rodovias Nacionais, Parques, Edifícios 3D Extrusados, Ruas com Nomes e POIs
 * - 2 Temas nativos (Uber Night Dark & Google Maps Classic Light) + Camada de Trânsito + Modo 3D
 * - Animação de Viagem/Delivery a 60 FPS com interpolação contínua e rotação de veículo (bearing)
 */

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

    this.tileCache = new Map();
    this.bitmapCache = new Map(); // Cache de tiles pré-rasterizados na GPU (drawImage < 0.3ms)
    this.pendingTiles = new Set();
    this.tileQueue = [];
    this.activeFetches = 0;
    this.maxConcurrentFetches = 2; // Máx 2 tiles simultâneos (zero picos de rede/CPU)
    this.moveDebounceTimer = null;
    this.tileFetchPaused = false;
    this.brasilGeo = null;
    this.loadingBrasil = false;

    this.routeData = null;
    this.vehicleProgress = 0; // 0..100
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
    this.terrainGrids = new Map();
    this.terrainBitmaps = new Map();
    this.terrainPending = new Set();
    this.signalShards = new Map();
    this.signalPending = new Set();
    this.tolls = [];
    this.tollsLoading = false;
    this.onTollClick = options.onTollClick || null;
    this.onRadarClick = options.onRadarClick || null;
    this.onMapClick = options.onMapClick || null;
    this.onStoreClick = options.onStoreClick || null;
    this.onZoomChange = options.onZoomChange || null;
    this.onMoveEnd = options.onMoveEnd || null;

    this.isDragging = false;
    this.dragMoved = false;
    this.lastX = 0;
    this.lastY = 0;
    this.pinchDist = 0;
    this.flyAnim = null;
    this.needsRender = true;
    this.trafficOffset = 0;

    this._resize();
    this._bindEvents();
    // Lazy-load: só carrega brasil.json (2.8MB) se iniciar em zoom nacional (<12.5)
    if (this.zoom < 12.5) this._loadBrasilLayers();
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
    return {
      x: this.width / 2 + (pt.x - center.x),
      y: this.height / 2 + (pt.y - center.y)
    };
  }

  screenToLatLng(sx, sy) {
    const center = PonteMapEngine.project(this.lat, this.lng, this.zoom);
    const wx = center.x + (sx - this.width / 2);
    const wy = center.y + (sy - this.height / 2);
    return PonteMapEngine.unproject(wx, wy, this.zoom);
  }

  _resize() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 1.5);
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
    this.zoom = Math.max(4, Math.min(18.5, newZoom));
    if (this.onZoomChange) this.onZoomChange(this.zoom);
    this.needsRender = true;
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

  // Busca genérica com Cache Storage do navegador (tiles imutáveis: zero rede na 2ª visita)
  async _cachedFetch(url, kind) {
    if (typeof caches !== 'undefined') {
      try {
        const cache = await caches.open('ponte-maps-tiles-v1');
        const hit = await cache.match(url);
        if (hit) return kind === 'bin' ? hit.arrayBuffer() : hit.json();
        const res = await fetch(url);
        if (res.status === 200) {
          await cache.put(url, res.clone());
          return kind === 'bin' ? res.arrayBuffer() : res.json();
        }
        return null;
      } catch (_) {}
    }
    const res = await fetch(url);
    if (res.status !== 200) return null;
    return kind === 'bin' ? res.arrayBuffer() : res.json();
  }

  async _loadTerrainIndex() {
    if (this.terrainIndex || this.terrainIndexLoading) return;
    this.terrainIndexLoading = true;
    try {
      const res = await fetch(`${this.apiBase}/api/mapas/terreno/index.json`);
      if (res.ok) {
        const j = await res.json();
        const idx = {};
        for (const [z, arr] of Object.entries(j.tiles || {})) idx[z] = new Set(arr);
        this.terrainIndex = idx;
        this.needsRender = true;
      }
    } catch (_) {}
    this.terrainIndexLoading = false;
  }

  _hasTerrain(z, x, y) {
    const s = this.terrainIndex && this.terrainIndex[z];
    return Boolean(s && s.has(`${x}/${y}`));
  }

  _fetchTerrain(z, x, y) {
    const key = `${z}/${x}/${y}`;
    if (this.terrainGrids.has(key) || this.terrainPending.has(key) || this.tileFetchPaused) return;
    if (this.terrainPending.size >= 3) return;
    this.terrainPending.add(key);
    this._cachedFetch(`${this.apiBase}/api/mapas/terreno/${key}.bin`, 'bin')
      .then((buf) => {
        const grid = buf && buf.byteLength === 128 * 128 * 2 ? new Int16Array(buf) : null;
        if (this.terrainGrids.size >= 36) this.terrainGrids.delete(this.terrainGrids.keys().next().value);
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
    let bestD = 16 * 16;
    for (const st of this.stores) {
      const p = this.latLngToScreen(st.lat, st.lng);
      const d = (p.x - sx) ** 2 + (p.y - sy) ** 2;
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
        this.brasilGeo = await res.json();
        this.needsRender = true;
      }
    } catch (_) {}
    this.loadingBrasil = false;
  }

  _scheduleMoveEnd() {
    this.tileFetchPaused = true;
    clearTimeout(this.moveDebounceTimer);
    this.moveDebounceTimer = setTimeout(() => {
      this.tileFetchPaused = false;
      this.needsRender = true;
      if (this.onMoveEnd) this.onMoveEnd({ lat: this.lat, lng: this.lng, zoom: this.zoom });
    }, 180);
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
      this.flyAnim = null;
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.isDragging) return;
      const dx = e.clientX - this.lastX;
      const dy = e.clientY - this.lastY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) this.dragMoved = true;
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
          this._scheduleMoveEnd();
        }
      }
      this.isDragging = false;
    });

    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.flyAnim = null;
      const rect = this.canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const before = this.screenToLatLng(mx, my);

      const delta = e.deltaY > 0 ? -0.45 : 0.45;
      this.zoom = Math.max(4, Math.min(18.5, this.zoom + delta));
      if (this.onZoomChange) this.onZoomChange(this.zoom);

      const afterProj = PonteMapEngine.project(before.lat, before.lng, this.zoom);
      const newCenterProj = {
        x: afterProj.x - (mx - this.width / 2),
        y: afterProj.y - (my - this.height / 2)
      };
      const newCenter = PonteMapEngine.unproject(newCenterProj.x, newCenterProj.y, this.zoom);
      this.lat = newCenter.lat;
      this.lng = newCenter.lng;
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
    let lastFrame = 0;
    const tick = (now) => {
      if (this.flyAnim) this.flyAnim(now);
      if (this.needsRender && now - lastFrame >= 16) {
        lastFrame = now;
        this._render();
        this.needsRender = false;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  _getPalette() {
    if (this.theme === 'light') {
      // Estilo Google Maps Classic
      return {
        bg: '#e8eaed',
        land: '#f1f3f4',
        stateBorder: '#bdc1c6',
        urban: '#e4e7eb',
        water: '#aadaff',
        park: '#c8e6c9',
        parkText: '#1e8e3e',
        bldgFill: '#dfe3e8',
        bldgTop: '#eef0f3',
        bldgSide: '#cfd4da',
        bldgStroke: '#c4c9d0',
        roadCasing: '#dadce0',
        highwayFill: '#fbbc04',
        highwayCasing: '#e37400',
        primaryFill: '#fde293',
        primaryCasing: '#f9ab00',
        streetFill: '#ffffff',
        roadText: '#3c4043',
        roadTextHalo: '#ffffff',
        poiBg: '#ffffff',
        poiText: '#202124',
        cityText: '#3c4043'
      };
    }
    // Estilo Uber / Waze Night Pro (Alto Contraste Cartográfico)
    return {
      bg: '#060a14',
      land: '#0b1120',
      stateBorder: '#334155',
      urban: '#111827',
      water: '#0c4a6e',
      park: '#065f46',
      parkText: '#34d399',
      bldgFill: '#162138',
      bldgTop: '#253554',
      bldgSide: '#11192c',
      bldgStroke: '#33476b',
      roadCasing: '#060a14',
      highwayFill: '#3b82f6',
      highwayCasing: '#1e3a8a',
      primaryFill: '#475569',
      primaryCasing: '#1e293b',
      streetFill: '#283652',
      roadText: '#e2e8f0',
      roadTextHalo: '#060a14',
      poiBg: '#1e293b',
      poiText: '#f8fafc',
      cityText: '#cbd5e1'
    };
  }

  _render() {
    const ctx = this.ctx;
    const pal = this._getPalette();

    ctx.save();
    ctx.scale(this.dpr, this.dpr);

    // 1. Fundo
    ctx.fillStyle = pal.land;
    ctx.fillRect(0, 0, this.width, this.height);

    // 2. Camada Nacional do Brasil (Lazy-loaded apenas em zoom < 12.5 para economizar 2.8MB no boot!)
    if (this.zoom < 12.5) {
      if (!this.brasilGeo && !this.loadingBrasil) this._loadBrasilLayers();
      if (this.brasilGeo) this._renderBrasilGeo(ctx, pal);
    }

    // 2.5 Topografia: Hillshade + Tinta Hipsométrica + Curvas de Nível (R2 soberano)
    if (this.showTerrain) {
      this._renderTerrain(ctx, pal);
    }

    // 3. Tiles Vetoriais Reais (Zoom >= 10, usando tileZoom entre 10 e 14 escalado suavemente)
    if (this.zoom >= 9.5) {
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

    // 4. Rótulos das Principais Cidades Brasileiras em Zoom Nacional/Regional (< 11.5)
    if (this.brasilGeo && this.brasilGeo.cidades && this.zoom < 11.5) {
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
  }

  // ════════ TOPOGRAFIA ════════
  _terrainZoomFor(zoom) {
    if (zoom >= 11.5) return 12;
    if (zoom >= 8.5) return 10;
    return 7;
  }

  _getTerrainBitmap(key, z, grid) {
    const bmpKey = `${key}_${this.theme}_${z >= 12 && this.zoom >= 12.5 ? 'c' : 'n'}`;
    if (this.terrainBitmaps.has(bmpKey)) return this.terrainBitmaps.get(bmpKey);

    const G = 128;
    const S = 256;
    const dark = this.theme === 'dark';
    const [, , ty] = key.split('/').map(Number);
    const n = Math.PI - (2 * Math.PI * (ty + 0.5)) / Math.pow(2, z);
    const latC = Math.atan(Math.sinh(n));
    const cellM = (40075016 * Math.cos(latC)) / Math.pow(2, z) / G;
    const exag = z >= 12 ? 1.6 : z >= 10 ? 2.6 : 5;

    const at = (gx, gy) => {
      const x = Math.max(0, Math.min(G - 1, gx));
      const y = Math.max(0, Math.min(G - 1, gy));
      return grid[y * G + x];
    };
    const sample = (fx, fy) => {
      const x0 = Math.floor(fx); const y0 = Math.floor(fy);
      const tx = fx - x0; const tyy = fy - y0;
      const a = at(x0, y0); const b = at(x0 + 1, y0); const c = at(x0, y0 + 1); const d = at(x0 + 1, y0 + 1);
      return (a * (1 - tx) + b * tx) * (1 - tyy) + (c * (1 - tx) + d * tx) * tyy;
    };

    // Azimute 315° (NO), altitude 45° — iluminação cartográfica padrão
    const az = (315 * Math.PI) / 180;
    const alt = (45 * Math.PI) / 180;
    const sinAlt = Math.sin(alt); const cosAlt = Math.cos(alt);
    const contours = z >= 12 && this.zoom >= 12.5;
    const interval = 20;

    const H = new Float32Array(S * S);
    for (let py = 0; py < S; py++) {
      for (let px = 0; px < S; px++) H[py * S + px] = sample((px + 0.5) / 2 - 0.5, (py + 0.5) / 2 - 0.5);
    }

    const off = document.createElement('canvas');
    off.width = S;
    off.height = S;
    const octx = off.getContext('2d');
    const img = octx.createImageData(S, S);
    const px4 = img.data;
    const step = cellM / 2;

    for (let py = 0; py < S; py++) {
      for (let px = 0; px < S; px++) {
        const i = py * S + px;
        const h = H[i];
        const hl = H[py * S + Math.max(0, px - 1)];
        const hr = H[py * S + Math.min(S - 1, px + 1)];
        const hu = H[Math.max(0, py - 1) * S + px];
        const hd = H[Math.min(S - 1, py + 1) * S + px];
        const dzdx = ((hr - hl) / (2 * step)) * exag;
        const dzdy = ((hd - hu) / (2 * step)) * exag;
        const slope = Math.atan(Math.hypot(dzdx, dzdy));
        const aspect = Math.atan2(dzdy, -dzdx);
        let shade = sinAlt * Math.cos(slope) + cosAlt * Math.sin(slope) * Math.cos(az - Math.PI / 2 - aspect);
        shade = Math.max(0, Math.min(1, shade));

        let r = 0; let g = 0; let b = 0; let a = 0;
        if (h > 0) {
          const dlt = shade - sinAlt;
          if (dlt < 0) {
            a = Math.min(dark ? 150 : 110, -dlt * (dark ? 420 : 300));
          } else {
            r = 255; g = 255; b = 255;
            a = Math.min(dark ? 38 : 70, dlt * (dark ? 120 : 200));
          }
          // Tinta hipsométrica sutil em zoom regional (planícies verdes → planaltos ocre)
          if (this.zoom < 11 && a < 40) {
            const t = Math.min(1, h / 1400);
            if (dark) { r = 40 + 60 * t; g = 70 + 20 * t; b = 50; }
            else { r = 150 + 80 * t; g = 190 - 30 * t; b = 120 - 30 * t; }
            a = Math.max(a, 26);
          }
        }

        if (contours && h > 0) {
          const band = Math.floor(h / interval);
          const bR = Math.floor(hr / interval);
          const bD = Math.floor(hd / interval);
          if (band !== bR || band !== bD) {
            const index = band % 5 === 0 || bR % 5 === 0;
            if (dark) { r = 180; g = 140; b = 90; } else { r = 150; g = 100; b = 50; }
            a = index ? 120 : 60;
          }
        }

        const o = i * 4;
        px4[o] = r; px4[o + 1] = g; px4[o + 2] = b; px4[o + 3] = a;
      }
    }
    octx.putImageData(img, 0, 0);

    if (this.terrainBitmaps.size >= 40) this.terrainBitmaps.delete(this.terrainBitmaps.keys().next().value);
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
    if ((maxTx - minTx + 1) * (maxTy - minTy + 1) > 30) return;

    let builtThisFrame = 0;
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    for (let tx = minTx; tx <= maxTx; tx++) {
      for (let ty = minTy; ty <= maxTy; ty++) {
        if (!this._hasTerrain(tz, tx, ty)) continue;
        const key = `${tz}/${tx}/${ty}`;
        const grid = this.terrainGrids.get(key);
        if (grid === undefined) { this._fetchTerrain(tz, tx, ty); continue; }
        if (!grid) continue;
        const bmpKey = `${key}_${this.theme}_${tz >= 12 && this.zoom >= 12.5 ? 'c' : 'n'}`;
        if (!this.terrainBitmaps.has(bmpKey)) {
          if (builtThisFrame >= 1 || this.isDragging) { setTimeout(() => { this.needsRender = true; }, 30); continue; }
          builtThisFrame++;
        }
        const bmp = this._getTerrainBitmap(key, tz, grid);
        ctx.drawImage(bmp, tx * scaleFactor - tlx, ty * scaleFactor - tly, scaleFactor + 0.5, scaleFactor + 0.5);
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
  _drawTrafficLight(ctx, x, y, s = 1) {
    ctx.beginPath();
    ctx.roundRect(x - 3.6 * s, y - 8 * s, 7.2 * s, 16 * s, 2.4 * s);
    ctx.fillStyle = '#0f172a';
    ctx.fill();
    ctx.lineWidth = 1.1;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
    const cols = ['#ef4444', '#facc15', '#22c55e'];
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(x, y - 4.8 * s + i * 4.8 * s, 1.75 * s, 0, Math.PI * 2);
      ctx.fillStyle = cols[i];
      ctx.fill();
    }
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
    const inView = (p, m = 12) => p.x > -m && p.x < this.width + m && p.y > -m && p.y < this.height + m;
    ctx.save();

    if (this.zoom >= 15.5) {
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

    if (this.zoom >= 14.2) {
      const s = this.zoom >= 16 ? 1.15 : 0.9;
      const placed = [];
      for (const sh of shards) {
        for (const t of sh.s) {
          const p = this.latLngToScreen(t[0], t[1]);
          if (!inView(p)) continue;
          if (this.zoom < 16 && placed.some((q) => Math.abs(q.x - p.x) < 9 && Math.abs(q.y - p.y) < 14)) continue;
          placed.push(p);
          this._drawTrafficLight(ctx, p.x, p.y, s);
        }
      }
    } else if (this.zoom >= 12.8) {
      ctx.fillStyle = 'rgba(250, 204, 21, 0.85)';
      for (const sh of shards) {
        for (const t of sh.s) {
          const p = this.latLngToScreen(t[0], t[1]);
          if (!inView(p)) continue;
          ctx.fillRect(p.x - 1.3, p.y - 1.3, 2.6, 2.6);
        }
      }
    }

    if (this.zoom >= 12.8) {
      for (const sh of shards) {
        for (const r of sh.r) {
          const p = this.latLngToScreen(r[0], r[1]);
          if (!inView(p, 20)) continue;
          this._drawRadar(ctx, p.x, p.y, this.zoom >= 14 ? r[2] : 0);
        }
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
      const p = this.latLngToScreen(st.lat, st.lng);
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
        clusters.push({ x: p.x, y: p.y, count: 1, lead: st, items: [st] });
      }
    }

    const placedLabels = [];
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (const cl of clusters) {
      const st = cl.lead;
      const col = cl.count > 1 ? '#3b82f6' : (catColors[st.categoria] || '#10b981');

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

  _renderBrasilGeo(ctx, pal) {
    const g = this.brasilGeo;
    // Estados
    if (g.ufs) {
      ctx.beginPath();
      for (const uf of g.ufs) {
        if (uf.geometry.type === 'Polygon') this._drawGeoPath(ctx, uf.geometry.coordinates, true);
        else if (uf.geometry.type === 'MultiPolygon') {
          for (const p of uf.geometry.coordinates) this._drawGeoPath(ctx, p, true);
        }
      }
      ctx.strokeStyle = pal.stateBorder;
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }

    // Manchas Urbanas
    if (g.urban && this.zoom >= 6) {
      ctx.beginPath();
      for (const u of g.urban) {
        if (u.geometry.type === 'Polygon') this._drawGeoPath(ctx, u.geometry.coordinates, true);
        else if (u.geometry.type === 'MultiPolygon') {
          for (const p of u.geometry.coordinates) this._drawGeoPath(ctx, p, true);
        }
      }
      ctx.fillStyle = pal.urban;
      ctx.fill();
    }

    // Rios Reais
    if (g.rivers) {
      ctx.beginPath();
      for (const r of g.rivers) {
        if (r.geometry.type === 'LineString') this._drawGeoPath(ctx, r.geometry.coordinates, false);
        else if (r.geometry.type === 'MultiLineString') {
          for (const l of r.geometry.coordinates) this._drawGeoPath(ctx, l, false);
        }
      }
      ctx.strokeStyle = pal.water;
      ctx.lineWidth = this.zoom > 8 ? 2.8 : 1.6;
      ctx.stroke();
    }

    // Rodovias Nacionais Reais
    if (g.roads) {
      ctx.beginPath();
      for (const rd of g.roads) {
        if (rd.geometry.type === 'LineString') this._drawGeoPath(ctx, rd.geometry.coordinates, false);
        else if (rd.geometry.type === 'MultiLineString') {
          for (const l of rd.geometry.coordinates) this._drawGeoPath(ctx, l, false);
        }
      }
      ctx.strokeStyle = this.theme === 'light' ? '#f9ab00' : '#334155';
      ctx.lineWidth = this.zoom > 8 ? 2.2 : 1.1;
      ctx.stroke();
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

    const sz = 384;
    const off = document.createElement('canvas');
    off.width = sz;
    off.height = sz;
    const octx = off.getContext('2d');
    const ptTo = (pt) => [(pt[0] / 1000) * sz, (pt[1] / 1000) * sz];

    // 1. Água
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
    }

    // 2. Parques
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

    // 3. Edifícios (Batch 2D + 3D Isométrico)
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
          const hOff = Math.min(10, (b.h || 10) * 0.25);
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
        octx.lineWidth = 0.6;
        octx.stroke();
      }
    }

    // 4. Ruas, Avenidas e Rodovias em Batch
    const roadGroups = [
      { classes: ['minor', 'service', 'street'], w: 2.6, fill: pal.streetFill, casing: pal.roadCasing },
      { classes: ['secondary', 'tertiary', 'transit'], w: 4.0, fill: pal.streetFill, casing: pal.roadCasing },
      { classes: ['primary'], w: 5.6, fill: pal.primaryFill, casing: pal.primaryCasing },
      { classes: ['motorway', 'trunk'], w: 7.0, fill: pal.highwayFill, casing: pal.highwayCasing }
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
      octx.lineWidth = grp.w + 2.4;
      octx.stroke();
      octx.strokeStyle = grp.fill;
      octx.lineWidth = grp.w;
      octx.stroke();
    }

    // 5. Trânsito Ao Vivo
    if (this.showTraffic) {
      const trafficColors = ['rgba(16, 185, 129, 0.50)', 'rgba(245, 158, 11, 0.55)', 'rgba(239, 68, 68, 0.55)'];
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

    if (this.bitmapCache.size >= 48) {
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
            if (!poi.p || !poi.n) continue;
            const [px, py] = toPx(poi.p, sx, sy, size);
            if (!canPlace(px, py, 105, 24)) continue;
            placedLabels.push({ x: px, y: py });

            let dotColor = '#38bdf8';
            if (poi.cls === 'hospital') dotColor = '#ef4444';
            else if (poi.cls === 'park') dotColor = '#10b981';
            else if (poi.cls === 'railway' || poi.cls === 'bus') dotColor = '#8b5cf6';

            ctx.beginPath();
            ctx.arc(px, py, 4.5, 0, Math.PI * 2);
            ctx.fillStyle = dotColor;
            ctx.fill();
            ctx.lineWidth = 1.5;
            ctx.strokeStyle = '#ffffff';
            ctx.stroke();

            ctx.lineWidth = 3;
            ctx.strokeStyle = pal.roadTextHalo;
            ctx.strokeText(poi.n.slice(0, 22), px, py - 11);
            ctx.fillStyle = pal.poiText;
            ctx.fillText(poi.n.slice(0, 22), px, py - 11);
          }
        }
      }
    }
  }

  _renderRoute(ctx, pal) {
    const r = this.routeData;
    const wps = r.geometriaRota?.waypoints || [];
    if (wps.length < 2) return;

    const screenPts = wps.map((p) => this.latLngToScreen(p.lat, p.lng));

    // 1. Trilha base completa
    ctx.save();
    ctx.beginPath();
    screenPts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(59, 130, 246, 0.35)';
    ctx.lineWidth = 11;
    ctx.stroke();

    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 5;
    ctx.stroke();

    // Fluxo direcional animado
    ctx.setLineDash([10, 14]);
    ctx.lineDashOffset = -this.trafficOffset;
    ctx.strokeStyle = '#93c5fd';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.setLineDash([]);

    // 2. Trecho já percorrido em Neon Mint
    const posFloat = (this.vehicleProgress / 100) * (screenPts.length - 1);
    const idxA = Math.floor(posFloat);
    const idxB = Math.min(screenPts.length - 1, idxA + 1);
    const frac = posFloat - idxA;

    const ptA = screenPts[idxA];
    const ptB = screenPts[idxB];
    const vx = ptA.x + (ptB.x - ptA.x) * frac;
    const vy = ptA.y + (ptB.y - ptA.y) * frac;
    const angle = idxA < idxB ? Math.atan2(ptB.y - ptA.y, ptB.x - ptA.x) : 0;

    if (this.vehicleProgress > 0) {
      ctx.beginPath();
      for (let i = 0; i <= idxA; i++) {
        if (i === 0) ctx.moveTo(screenPts[i].x, screenPts[i].y);
        else ctx.lineTo(screenPts[i].x, screenPts[i].y);
      }
      ctx.lineTo(vx, vy);
      ctx.strokeStyle = '#a3e635';
      ctx.lineWidth = 6;
      ctx.shadowColor = '#a3e635';
      ctx.shadowBlur = 12;
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

    // 3.5 Radares fiscalizando a rota (destacados) e semáforos no trajeto
    const sr = r.sinalizacaoRota;
    if (sr) {
      if (this.zoom >= 13.5 && Array.isArray(sr.semaforos)) {
        for (const s of sr.semaforos) {
          const sp = this.latLngToScreen(s[0], s[1]);
          if (sp.x < -10 || sp.y < -10 || sp.x > this.width + 10 || sp.y > this.height + 10) continue;
          this._drawTrafficLight(ctx, sp.x, sp.y, 0.85);
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

    // 5. Veículo Animado na Posição Exata (com rotação na direção da rua)
    ctx.save();
    ctx.translate(vx, vy);
    ctx.beginPath();
    ctx.arc(0, 0, 20, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(163, 230, 53, 0.22)';
    ctx.fill();

    ctx.rotate(angle + Math.PI / 2);
    ctx.beginPath();
    ctx.roundRect(-8, -13, 16, 26, 5);
    ctx.fillStyle = '#090e1a';
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#a3e635';
    ctx.stroke();

    // Para-brisa do veículo
    ctx.beginPath();
    ctx.roundRect(-5.5, -7, 11, 7, 2);
    ctx.fillStyle = '#a3e635';
    ctx.fill();
    ctx.restore();

    // 6. Placa de limite da via atual acompanhando o veículo
    if (this.vehicleProgress > 0 && this.vehicleProgress < 100) {
      const lim = this._currentSpeedLimit();
      if (lim) this._drawSpeedSign(ctx, vx + 24, vy - 24, lim.kmh, 12);
    }

    ctx.restore();
  }
}
