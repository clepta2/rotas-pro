/**
 * mvt-decoder.js
 * Decodificador Puro de Mapbox Vector Tiles (MVT / Protobuf v2) em JavaScript
 * Zero dependências externas — funciona nativamente em Node.js e Cloudflare Workers V8.
 */

class PbfReader {
  constructor(buf) {
    this.buf = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    this.pos = 0;
    this.length = this.buf.length;
  }

  readVarint() {
    let val = 0;
    let shift = 0;
    while (this.pos < this.length) {
      const b = this.buf[this.pos++];
      val |= (b & 0x7f) << shift;
      if ((b & 0x80) === 0) return val >>> 0;
      shift += 7;
      if (shift > 35) return this._readVarintBig(val, shift);
    }
    return val >>> 0;
  }

  _readVarintBig(low, shift) {
    let val = low;
    let mul = Math.pow(2, shift);
    while (this.pos < this.length) {
      const b = this.buf[this.pos++];
      val += (b & 0x7f) * mul;
      if ((b & 0x80) === 0) return val;
      mul *= 128;
    }
    return val;
  }

  readSVarint() {
    const u = this.readVarint();
    return (u >>> 1) ^ -(u & 1);
  }

  readFloat() {
    const dv = new DataView(this.buf.buffer, this.buf.byteOffset + this.pos, 4);
    this.pos += 4;
    return dv.getFloat32(0, true);
  }

  readDouble() {
    const dv = new DataView(this.buf.buffer, this.buf.byteOffset + this.pos, 8);
    this.pos += 8;
    return dv.getFloat64(0, true);
  }

  readString(len) {
    const slice = this.buf.subarray(this.pos, this.pos + len);
    this.pos += len;
    return new TextDecoder().decode(slice);
  }

  skip(wireType) {
    if (wireType === 0) this.readVarint();
    else if (wireType === 1) this.pos += 8;
    else if (wireType === 2) this.pos += this.readVarint();
    else if (wireType === 5) this.pos += 4;
  }
}

function readValue(pbf, end) {
  let val = null;
  while (pbf.pos < end) {
    const tag = pbf.readVarint();
    const field = tag >>> 3;
    const wire = tag & 0x7;
    if (field === 1) val = pbf.readString(pbf.readVarint());
    else if (field === 2) val = pbf.readFloat();
    else if (field === 3) val = pbf.readDouble();
    else if (field === 4) val = pbf.readVarint();
    else if (field === 5) val = pbf.readVarint();
    else if (field === 6) val = pbf.readSVarint();
    else if (field === 7) val = pbf.readVarint() !== 0;
    else pbf.skip(wire);
  }
  return val;
}

function decodeGeometry(geomInts, type, extent, raw = false) {
  const rings = [];
  let ring = [];
  let x = 0;
  let y = 0;
  let i = 0;
  const f = raw ? 4096 / extent : 1000 / extent;
  while (i < geomInts.length) {
    const cmdInt = geomInts[i++];
    const cmd = cmdInt & 0x7;
    const count = cmdInt >>> 3;
    if (cmd === 1 || cmd === 2) {
      for (let k = 0; k < count; k++) {
        const dx = (geomInts[i] >>> 1) ^ -(geomInts[i] & 1); i++;
        const dy = (geomInts[i] >>> 1) ^ -(geomInts[i] & 1); i++;
        x += dx;
        y += dy;
        const nx = Math.round(x * f);
        const ny = Math.round(y * f);
        if (cmd === 1) {
          if (ring.length > 0) rings.push(ring);
          ring = [[nx, ny]];
        } else {
          ring.push([nx, ny]);
        }
      }
    } else if (cmd === 7) {
      if (ring.length > 0) {
        ring.push(ring[0]);
        rings.push(ring);
        ring = [];
      }
    }
  }
  if (ring.length > 0) rings.push(ring);

  if (type === 1) return rings.flat(); // Point(s)
  return rings; // LineString(s) or Polygon ring(s)
}

function readFeature(pbf, end, keys, values, extent, raw = false) {
  let type = 0;
  const tags = [];
  const geom = [];

  while (pbf.pos < end) {
    const tag = pbf.readVarint();
    const field = tag >>> 3;
    const wire = tag & 0x7;
    if (field === 1) { pbf.readVarint(); } // id
    else if (field === 2) {
      if (wire === 2) {
        const len = pbf.readVarint();
        const tEnd = pbf.pos + len;
        while (pbf.pos < tEnd) tags.push(pbf.readVarint());
      } else tags.push(pbf.readVarint());
    } else if (field === 3) {
      type = pbf.readVarint();
    } else if (field === 4) {
      if (wire === 2) {
        const len = pbf.readVarint();
        const gEnd = pbf.pos + len;
        while (pbf.pos < gEnd) geom.push(pbf.readVarint());
      } else geom.push(pbf.readVarint());
    } else {
      pbf.skip(wire);
    }
  }

  const props = {};
  for (let i = 0; i + 1 < tags.length; i += 2) {
    const k = keys[tags[i]];
    const v = values[tags[i + 1]];
    if (k !== undefined && v !== undefined) props[k] = v;
  }

  return {
    type, // 1=Point, 2=LineString, 3=Polygon
    props,
    coords: decodeGeometry(geom, type, extent, raw)
  };
}

function readLayer(pbf, end, raw = false) {
  let name = '';
  let extent = 4096;
  const keys = [];
  const values = [];
  const rawFeatures = [];

  while (pbf.pos < end) {
    const tag = pbf.readVarint();
    const field = tag >>> 3;
    const wire = tag & 0x7;
    if (field === 1) name = pbf.readString(pbf.readVarint());
    else if (field === 2) {
      const len = pbf.readVarint();
      rawFeatures.push({ start: pbf.pos, end: pbf.pos + len });
      pbf.pos += len;
    } else if (field === 3) {
      keys.push(pbf.readString(pbf.readVarint()));
    } else if (field === 4) {
      const len = pbf.readVarint();
      values.push(readValue(pbf, pbf.pos + len));
    } else if (field === 5) {
      extent = pbf.readVarint();
    } else {
      pbf.skip(wire);
    }
  }

  const features = [];
  for (const rf of rawFeatures) {
    pbf.pos = rf.start;
    features.push(readFeature(pbf, rf.end, keys, values, extent, raw));
  }

  pbf.pos = end;
  return { name, extent, features };
}

function simplifyRing(ring, tol = 4) {
  if (!ring || ring.length <= 3) return ring;
  const out = [ring[0]];
  let last = ring[0];
  for (let i = 1; i < ring.length - 1; i++) {
    const pt = ring[i];
    if (Math.abs(pt[0] - last[0]) + Math.abs(pt[1] - last[1]) >= tol) {
      out.push(pt);
      last = pt;
    }
  }
  out.push(ring[ring.length - 1]);
  return out;
}

export function decodeMvtToCompactTile(uint8Array) {
  const pbf = new PbfReader(uint8Array);
  const layers = {};

  while (pbf.pos < pbf.length) {
    const tag = pbf.readVarint();
    const field = tag >>> 3;
    const wire = tag & 0x7;
    if (field === 3) {
      const len = pbf.readVarint();
      const layer = readLayer(pbf, pbf.pos + len);
      layers[layer.name] = layer.features;
    } else {
      pbf.skip(wire);
    }
  }

  // Filtra e compacta apenas as camadas essenciais para renderização ultra-rápida
  const compact = {
    water: [],
    park: [],
    building: [],
    road: [],
    poi: [],
    place: []
  };

  if (layers.water) {
    for (const f of layers.water) {
      if (f.coords.length) compact.water.push({ c: f.coords.map(r => simplifyRing(r, 8)), cls: f.props.class || 'water' });
    }
  }
  if (layers.park) {
    for (const f of layers.park) {
      if (f.coords.length) compact.park.push({ c: f.coords.map(r => simplifyRing(r, 6)), n: f.props.name || '' });
    }
  }
  if (layers.landuse) {
    for (const f of layers.landuse) {
      if (f.props.class === 'park' || f.props.class === 'grass' || f.props.class === 'cemetery') {
        if (f.coords.length) compact.park.push({ c: f.coords.map(r => simplifyRing(r, 8)), n: f.props.name || '' });
      }
    }
  }
  if (layers.building) {
    // Limita a 450 prédios por tile com geometria simplificada
    for (let i = 0; i < layers.building.length && compact.building.length < 450; i++) {
      const f = layers.building[i];
      if (f.coords.length) compact.building.push({ c: f.coords.map(r => simplifyRing(r, 5)), h: Math.round(f.props.render_height || 12) });
    }
  }
  if (layers.transportation) {
    for (const f of layers.transportation) {
      const cls = f.props.class || 'minor';
      if (cls === 'path' || cls === 'track') continue;
      if (f.coords.length) {
        compact.road.push({
          c: f.coords.map(r => simplifyRing(r, 4)),
          cls,
          ow: f.props.oneway || 0
        });
      }
    }
  }
  if (layers.transportation_name) {
    const seenRoads = new Set();
    for (const f of layers.transportation_name) {
      const name = f.props['name:pt'] || f.props.name || f.props.ref;
      if (name && f.coords.length && !seenRoads.has(name)) {
        seenRoads.add(name);
        compact.road.push({
          c: f.coords.map(r => simplifyRing(r, 10)),
          cls: f.props.class || 'primary',
          n: name,
          lbl: 1
        });
      }
    }
  }
  if (layers.poi) {
    const seenPois = new Set();
    for (const f of layers.poi) {
      const name = f.props['name:pt'] || f.props.name;
      if (name && f.coords.length && !seenPois.has(name) && compact.poi.length < 100) {
        seenPois.add(name);
        compact.poi.push({
          p: f.coords[0],
          n: name,
          cls: f.props.class || f.props.subclass || 'poi'
        });
      }
    }
  }
  if (layers.place) {
    for (const f of layers.place) {
      const name = f.props['name:pt'] || f.props.name;
      if (name && f.coords.length) {
        compact.place.push({
          p: f.coords[0],
          n: name,
          cls: f.props.class || 'city'
        });
      }
    }
  }

  return compact;
}


// ════════════════════════════════════════════════════════════════════════════
// FORMATO HQ v2 — tile de alta fidelidade para renderização em zoom de rua (z15–z19)
// Coordenadas 0..4096 (resolução nativa do MVT, ~0,6 m em z14) em arrays achatados [x,y,x,y...]
// Simplificação Douglas-Peucker com tolerância por camada (preserva curvas e esquinas).
// ════════════════════════════════════════════════════════════════════════════

function readLayersRaw(uint8Array) {
  const pbf = new PbfReader(uint8Array);
  const layers = {};
  while (pbf.pos < pbf.length) {
    const tag = pbf.readVarint();
    const field = tag >>> 3;
    const wire = tag & 0x7;
    if (field === 3) {
      const len = pbf.readVarint();
      const layer = readLayer(pbf, pbf.pos + len, true);
      layers[layer.name] = layer.features;
    } else {
      pbf.skip(wire);
    }
  }
  return layers;
}

function dpFlat(ring, tol) {
  const n = ring.length;
  if (n <= 2 || tol <= 0) return ring.flat();
  const keep = new Uint8Array(n);
  keep[0] = 1;
  keep[n - 1] = 1;
  const stack = [[0, n - 1]];
  const t2 = tol * tol;
  while (stack.length) {
    const [a, b] = stack.pop();
    const ax = ring[a][0]; const ay = ring[a][1];
    const dx = ring[b][0] - ax; const dy = ring[b][1] - ay;
    const len2 = dx * dx + dy * dy;
    let maxD = -1; let idx = -1;
    for (let i = a + 1; i < b; i++) {
      const px = ring[i][0] - ax; const py = ring[i][1] - ay;
      let d;
      if (len2 === 0) d = px * px + py * py;
      else {
        const t = Math.max(0, Math.min(1, (px * dx + py * dy) / len2));
        const ex = px - t * dx; const ey = py - t * dy;
        d = ex * ex + ey * ey;
      }
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (maxD > t2 && idx > 0) {
      keep[idx] = 1;
      stack.push([a, idx], [idx, b]);
    }
  }
  const out = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(ring[i][0], ring[i][1]);
  return out;
}

function polyArea(ring) {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]);
  return Math.abs(a / 2);
}

const ROAD_RANK = {
  motorway: 9, trunk: 8, primary: 7, secondary: 6, tertiary: 5, minor: 4, service: 3,
  raceway: 3, busway: 4, bus_guideway: 4, track: 2, path: 1, pier: 1, rail: 0, transit: 0, ferry: 0
};
const LAND_CLASSES = {
  wood: 'wood', forest: 'wood', grass: 'grass', meadow: 'grass', park: 'park', garden: 'park', cemetery: 'cemetery',
  farmland: 'farm', farm: 'farm', sand: 'sand', beach: 'sand', wetland: 'wetland', residential: 'residential',
  commercial: 'commercial', retail: 'commercial', industrial: 'industrial', railway: 'industrial',
  hospital: 'hospital', school: 'school', university: 'school', college: 'school', kindergarten: 'school',
  stadium: 'sport', pitch: 'sport', playground: 'park', military: 'industrial', ice: 'water', rock: 'sand',
  quarry: 'industrial', zoo: 'park', theme_park: 'park', parking: 'parking', track: 'sport'
};
const POI_PRIORITY = {
  hospital: 9, railway: 9, bus: 6, aerialway: 7, airport: 9, college: 7, school: 6, town_hall: 8, police: 7,
  fire_station: 7, shop: 4, grocery: 5, fuel: 6, bank: 5, pharmacy: 6, restaurant: 4, fast_food: 4, cafe: 3,
  bar: 3, lodging: 5, museum: 8, theatre: 7, cinema: 6, attraction: 7, park: 7, stadium: 8, place_of_worship: 5,
  library: 6, post: 5, parking: 2, car: 4, clothing_store: 3
};

/**
 * Decodifica PBF (OpenMapTiles) em tile HQ v2.
 * Estrutura: { v:2, e:4096, land:[{k,c:[[flat]]}], water:[[flat]], wway:[{w,c:[flat]}], aero:[[flat]],
 *   bldg:[{h,m,c:[[flat]]}], road:[{k,r,c:[flat],b,o,l,sv}], rail:[[flat]], name:[{n,k,c:[flat]}],
 *   poi:[{p:[x,y],n,k,s,r}], hn:[[x,y,'123']], place:[{p,n,k,r}] }
 */
export function decodeMvtToHqTile(uint8Array, z = 14) {
  const L = readLayersRaw(uint8Array);
  // Tolerâncias em unidades 0..4096 (z14: 1 unidade ≈ 0,6 m)
  const tol = z >= 14 ? { poly: 1.2, line: 0.9, land: 2.5 } : z === 13 ? { poly: 2, line: 1.5, land: 4 } : { poly: 3.5, line: 2.5, land: 6 };
  const t = { v: 2, e: 4096, z, land: [], water: [], wway: [], aero: [], bldg: [], road: [], rail: [], name: [], poi: [], hn: [], place: [] };

  const pushPoly = (arr, feat, tl, extra = {}) => {
    const rings = [];
    for (const r of feat.coords) {
      if (r.length < 4 || polyArea(r) < 6) continue;
      const f = dpFlat(r, tl);
      if (f.length >= 6) rings.push(f);
    }
    if (rings.length) arr.push({ ...extra, c: rings });
  };

  for (const f of L.landcover || []) {
    const k = LAND_CLASSES[f.props.subclass] || LAND_CLASSES[f.props.class];
    if (k) pushPoly(t.land, f, tol.land, { k });
  }
  for (const f of L.landuse || []) {
    const k = LAND_CLASSES[f.props.class];
    if (k) pushPoly(t.land, f, tol.land, { k });
  }
  for (const f of L.park || []) pushPoly(t.land, f, tol.land, { k: 'park', n: f.props['name:pt'] || f.props.name || undefined });
  // Ordem de pintura: áreas grandes primeiro
  const landOrder = { residential: 0, commercial: 1, industrial: 1, farm: 0, wood: 2, grass: 3, wetland: 3, sand: 3, park: 4, cemetery: 4, hospital: 5, school: 5, sport: 6, parking: 6 };
  t.land.sort((a, b) => (landOrder[a.k] ?? 3) - (landOrder[b.k] ?? 3));

  for (const f of L.water || []) {
    for (const r of f.coords) {
      if (r.length < 4) continue;
      const fl = dpFlat(r, tol.poly);
      if (fl.length >= 6) t.water.push(fl);
    }
  }
  for (const f of L.waterway || []) {
    const w = f.props.class === 'river' ? 3 : f.props.class === 'canal' ? 2 : 1;
    for (const r of f.coords) if (r.length >= 2) t.wway.push({ w, c: dpFlat(r, tol.line) });
  }
  for (const f of L.aeroway || []) {
    if (f.type === 3) for (const r of f.coords) { if (r.length >= 4) t.aero.push(dpFlat(r, tol.poly)); }
  }

  if (z >= 13) {
    for (const f of L.building || []) {
      if (f.props.hide_3d) continue;
      const h = Math.round(Number(f.props.render_height) || 8);
      const m = Math.round(Number(f.props.render_min_height) || 0);
      pushPoly(t.bldg, f, tol.poly * 0.6, { h, m });
    }
    // Desenho baixo → alto para oclusão 3D correta
    t.bldg.sort((a, b) => a.h - b.h);
  }

  for (const f of L.transportation || []) {
    const cls = f.props.class || 'minor';
    if (f.type !== 2) continue;
    if (cls === 'rail' || cls === 'transit') {
      if (f.props.brunnel === 'tunnel') continue;
      for (const r of f.coords) if (r.length >= 2) t.rail.push(dpFlat(r, tol.line));
      continue;
    }
    if (cls === 'ferry') continue;
    const sub = f.props.subclass || '';
    const isLink = /_link$/.test(sub) || f.props.ramp === 1;
    const isRoundaboutProp = sub === 'roundabout' || f.props.junction === 'roundabout' || f.props.roundabout === 1;
    const rank = ROAD_RANK[cls] ?? 3;
    if (z < 14 && rank <= 2) continue;
    if (z <= 12 && rank <= 3) continue;
    for (const r of f.coords) {
      if (r.length < 2) continue;
      const o = { k: cls, r: rank, c: dpFlat(r, tol.line) };
      if (f.props.brunnel === 'bridge') o.b = 1;
      else if (f.props.brunnel === 'tunnel') o.b = 2;
      if (f.props.oneway === 1 || f.props.oneway === -1) o.o = f.props.oneway;
      if (isLink) o.lk = 1;
      if (isRoundaboutProp) {
        o.rb = 1;
      } else if (f.props.oneway === 1 && r.length >= 6) {
        const dEnd = Math.hypot(r[0][0] - r[r.length - 1][0], r[0][1] - r[r.length - 1][1]);
        if (dEnd < 24) {
          let minX = Infinity; let maxX = -Infinity; let minY = Infinity; let maxY = -Infinity;
          for (const pt of r) {
            if (pt[0] < minX) minX = pt[0]; if (pt[0] > maxX) maxX = pt[0];
            if (pt[1] < minY) minY = pt[1]; if (pt[1] > maxY) maxY = pt[1];
          }
          const span = Math.max(maxX - minX, maxY - minY);
          if (span >= 18 && span <= 480) o.rb = 1;
        }
      }
      if (f.props.layer) o.l = Number(f.props.layer);
      if (sub === 'footway' || sub === 'pedestrian' || sub === 'steps' || sub === 'cycleway') o.sv = sub;
      if (f.props.surface === 'unpaved') o.u = 1;
      t.road.push(o);
    }
  }
  // Ordem de desenho por camada (túneis → solo → pontes) e importância
  t.road.sort((a, b) => ((a.b === 2 ? -1 : a.b === 1 ? 1 : 0) - (b.b === 2 ? -1 : b.b === 1 ? 1 : 0)) || (a.r - b.r));

  for (const f of L.transportation_name || []) {
    const n = f.props['name:pt'] || f.props.name || f.props.ref;
    if (!n || f.type !== 2) continue;
    for (const r of f.coords) if (r.length >= 2) t.name.push({ n, k: f.props.class || 'minor', ref: f.props.ref || undefined, c: dpFlat(r, tol.line * 2) });
  }

  const pois = [];
  for (const f of L.poi || []) {
    const n = f.props['name:pt'] || f.props.name;
    if (!n || !f.coords.length) continue;
    const k = f.props.class || 'poi';
    const pr = (POI_PRIORITY[k] || POI_PRIORITY[f.props.subclass] || 3) * 10 - (Number(f.props.rank) || 30) * 0.1;
    pois.push({ p: f.coords[0], n, k, s: f.props.subclass || undefined, r: Math.round(pr) });
  }
  pois.sort((a, b) => b.r - a.r);
  t.poi = pois.slice(0, 400);

  if (z >= 14) {
    for (const f of L.housenumber || []) {
      if (f.coords.length && f.props.housenumber) t.hn.push([f.coords[0][0], f.coords[0][1], String(f.props.housenumber).slice(0, 8)]);
      if (t.hn.length >= 1500) break;
    }
  }
  for (const f of L.place || []) {
    const n = f.props['name:pt'] || f.props.name;
    if (n && f.coords.length) t.place.push({ p: f.coords[0], n, k: f.props.class || 'neighbourhood', r: Number(f.props.rank) || 10 });
  }
  return t;
}

/** Converte tile HQ v2 em tile leve compatível com o roteador A* (coords 0..1000, só vias roteáveis). */
export function hqToRoutingTile(hq) {
  const s = 1000 / hq.e;
  const ROUTABLE = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'minor', 'service']);
  const road = [];
  for (const r of hq.road) {
    if (!ROUTABLE.has(r.k) || r.sv) continue;
    const ring = [];
    for (let i = 0; i < r.c.length; i += 2) ring.push([Math.round(r.c[i] * s), Math.round(r.c[i + 1] * s)]);
    const entry = { c: [ring], cls: r.k, ow: r.o || 0 };
    if (r.rb) entry.rb = 1;
    if (r.b) entry.b = r.b;
    road.push(entry);
  }
  const seen = new Set();
  for (const nm of hq.name) {
    if (seen.has(nm.n)) continue;
    seen.add(nm.n);
    const ring = [];
    for (let i = 0; i < nm.c.length; i += 2) ring.push([Math.round(nm.c[i] * s), Math.round(nm.c[i + 1] * s)]);
    road.push({ c: [ring], cls: nm.k, n: nm.n, lbl: 1 });
  }
  return { water: [], park: [], building: [], road, poi: [], place: [] };
}
