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

function decodeGeometry(geomInts, type, extent) {
  const rings = [];
  let ring = [];
  let x = 0;
  let y = 0;
  let i = 0;
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
        const nx = Math.round((x / extent) * 1000);
        const ny = Math.round((y / extent) * 1000);
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

function readFeature(pbf, end, keys, values, extent) {
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
    coords: decodeGeometry(geom, type, extent)
  };
}

function readLayer(pbf, end) {
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
    features.push(readFeature(pbf, rf.end, keys, values, extent));
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
