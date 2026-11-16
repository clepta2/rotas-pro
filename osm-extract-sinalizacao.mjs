/**
 * osm-extract-sinalizacao.mjs
 * Extrator OSM PBF 100% nativo (zlib do Node, zero dependências) — Ecossistema Ponte / Rotas Pro.
 *
 * Lê o extrato brazil-latest.osm.pbf (snapshot offline, ODbL © OpenStreetMap contributors) e gera
 * shards soberanos por célula z12 com:
 *   s = semáforos (highway=traffic_signals)
 *   r = radares / fiscalização eletrônica (highway=speed_camera) + limite quando informado
 *   l = lombadas / redutores (traffic_calming=bump|hump|table|cushion)
 *   v = vias com limite de velocidade sinalizado (maxspeed) — polilinha decimada + classe + nome
 * e um arquivo nacional de praças de pedágio (barrier=toll_booth).
 *
 * Passo A: varre o arquivo inteiro → nós marcados + vias com maxspeed (refs decimados).
 * Passo B: relê só os blocos de nós que contêm refs necessários (merge-walk em IDs ordenados).
 *
 * Uso: node --max-old-space-size=4096 osm-extract-sinalizacao.mjs [arquivo.pbf] [dirSaida]
 */
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

const PBF = process.argv[2] || 'C:\\Users\\Win10\\Documents\\osm-data\\brazil-latest.osm.pbf';
const OUT = process.argv[3] || 'C:\\Users\\Win10\\Documents\\osm-data\\out';
const SHARD_Z = 12;
const MAX_PTS_PER_WAY = 8;

const HW_CLASS = {
  motorway: 1, motorway_link: 1, trunk: 2, trunk_link: 2, primary: 3, primary_link: 3,
  secondary: 4, secondary_link: 4, tertiary: 5, tertiary_link: 5, unclassified: 6,
  residential: 7, living_street: 8, road: 6
};
const CALMING = new Set(['bump', 'hump', 'table', 'cushion', 'yes']);

// ── Leitor Protobuf mínimo (varints > 2^32 por aritmética de ponto flutuante) ──
class R {
  constructor(buf, pos = 0, end = buf.length) { this.b = buf; this.p = pos; this.e = end; }
  v() {
    const b = this.b;
    let byte = b[this.p++]; let val = byte & 0x7f;
    if (byte < 0x80) return val;
    byte = b[this.p++]; val |= (byte & 0x7f) << 7; if (byte < 0x80) return val;
    byte = b[this.p++]; val |= (byte & 0x7f) << 14; if (byte < 0x80) return val;
    byte = b[this.p++]; val |= (byte & 0x7f) << 21; if (byte < 0x80) return val;
    let mul = 268435456;
    do { byte = b[this.p++]; val += (byte & 0x7f) * mul; mul *= 128; } while (byte >= 0x80);
    return val;
  }
  sv() { const n = this.v(); return n % 2 === 1 ? -(n + 1) / 2 : n / 2; }
  skip(wire) {
    if (wire === 0) this.v();
    else if (wire === 2) { const l = this.v(); this.p += l; }
    else if (wire === 1) this.p += 8;
    else if (wire === 5) this.p += 4;
    else throw new Error('wire type ' + wire);
  }
}

// int32 negativo vem como varint de 10 bytes (2^64 - n)
const toInt = (n) => (n > 2147483647 ? n - 18446744073709552000 : n);

// ── Iterador de blobs do arquivo PBF ──
function* blobs(fd, fileSize) {
  let off = 0;
  const lenBuf = Buffer.alloc(4);
  while (off < fileSize) {
    fs.readSync(fd, lenBuf, 0, 4, off);
    const hLen = lenBuf.readUInt32BE(0);
    const hBuf = Buffer.alloc(hLen);
    fs.readSync(fd, hBuf, 0, hLen, off + 4);
    const h = new R(hBuf);
    let type = ''; let dataSize = 0;
    while (h.p < h.e) {
      const tag = h.v(); const f = tag >>> 3; const w = tag & 7;
      if (f === 1 && w === 2) { const l = h.v(); type = hBuf.toString('utf8', h.p, h.p + l); h.p += l; }
      else if (f === 3 && w === 0) dataSize = h.v();
      else h.skip(w);
    }
    yield { type, offset: off + 4 + hLen, dataSize };
    off += 4 + hLen + dataSize;
  }
}

function readBlob(fd, offset, dataSize) {
  const buf = Buffer.alloc(dataSize);
  fs.readSync(fd, buf, 0, dataSize, offset);
  const r = new R(buf);
  let raw = null; let zdata = null;
  while (r.p < r.e) {
    const tag = r.v(); const f = tag >>> 3; const w = tag & 7;
    if (f === 1 && w === 2) { const l = r.v(); raw = buf.subarray(r.p, r.p + l); r.p += l; }
    else if (f === 3 && w === 2) { const l = r.v(); zdata = buf.subarray(r.p, r.p + l); r.p += l; }
    else r.skip(w);
  }
  if (raw) return raw;
  if (zdata) return zlib.inflateSync(zdata);
  throw new Error('Blob sem dados suportados (lzma/zstd)');
}

// Lê cabeçalho do PrimitiveBlock: tabela de strings, granularidade, offsets e grupos
function parseBlock(buf) {
  const r = new R(buf);
  const strings = [];
  const groups = [];
  let gran = 100; let latOff = 0; let lonOff = 0;
  while (r.p < r.e) {
    const tag = r.v(); const f = tag >>> 3; const w = tag & 7;
    if (f === 1 && w === 2) {
      const l = r.v(); const end = r.p + l;
      while (r.p < end) {
        const t2 = r.v();
        if ((t2 >>> 3) === 1) { const sl = r.v(); strings.push(buf.toString('utf8', r.p, r.p + sl)); r.p += sl; }
        else r.skip(t2 & 7);
      }
    } else if (f === 2 && w === 2) {
      const l = r.v(); groups.push([r.p, r.p + l]); r.p += l;
    } else if (f === 17) gran = r.v();
    else if (f === 19) latOff = toInt(r.v());
    else if (f === 20) lonOff = toInt(r.v());
    else r.skip(w);
  }
  return { strings, groups, gran, latOff, lonOff };
}

function packedRange(r) { const l = r.v(); const s = r.p; r.p += l; return [s, s + l]; }

// ── Armazenamento crescente em typed arrays (fora do heap V8) ──
class GrowF64 {
  constructor(n = 1 << 20) { this.a = new Float64Array(n); this.n = 0; }
  push(x) { if (this.n === this.a.length) { const b = new Float64Array(this.a.length * 2); b.set(this.a); this.a = b; } this.a[this.n++] = x; }
}

const t0 = Date.now();
const fd = fs.openSync(PBF, 'r');
const fileSize = fs.fstatSync(fd).size;
console.log(`[osm] ${PBF} (${(fileSize / 1e9).toFixed(2)} GB)`);

const pts = { s: [], r: [], l: [], toll: [] };
const nodeBlocks = [];
const wayRefs = new GrowF64(1 << 22);
const ways = [];
const tollWays = [];
let blockCount = 0;
let bytesDone = 0;

// ════════ PASSO A ════════
for (const bl of blobs(fd, fileSize)) {
  bytesDone = bl.offset + bl.dataSize;
  if (bl.type !== 'OSMData') continue;
  const data = readBlob(fd, bl.offset, bl.dataSize);
  const blk = parseBlock(data);
  const S = blk.strings;
  const sIdx = (s) => S.indexOf(s);
  const kHighway = sIdx('highway'); const kBarrier = sIdx('barrier'); const kCalming = sIdx('traffic_calming');
  const kMaxspeed = sIdx('maxspeed'); const kName = sIdx('name'); const kOperator = sIdx('operator');
  const kRef = sIdx('ref');
  blockCount++;

  for (const [gs, ge] of blk.groups) {
    const g = new R(data, gs, ge);
    while (g.p < g.e) {
      const tag = g.v(); const f = tag >>> 3; const w = tag & 7;
      if (f === 2 && w === 2) {
        // DenseNodes
        const l = g.v(); const end = g.p + l;
        const d = new R(data, g.p, end);
        let idR = null; let latR = null; let lonR = null; let kvR = null;
        while (d.p < d.e) {
          const t2 = d.v(); const f2 = t2 >>> 3;
          if (f2 === 1) idR = packedRange(d);
          else if (f2 === 8) latR = packedRange(d);
          else if (f2 === 9) lonR = packedRange(d);
          else if (f2 === 10) kvR = packedRange(d);
          else d.skip(t2 & 7);
        }
        g.p = end;
        const ri = new R(data, idR[0], idR[1]);
        const rla = new R(data, latR[0], latR[1]);
        const rlo = new R(data, lonR[0], lonR[1]);
        const rkv = kvR ? new R(data, kvR[0], kvR[1]) : null;
        let id = 0; let la = 0; let lo = 0; let minId = Infinity; let maxId = -Infinity;
        const interesting = kHighway >= 0 || kBarrier >= 0 || kCalming >= 0;
        while (ri.p < ri.e) {
          id += ri.sv(); la += rla.sv(); lo += rlo.sv();
          if (id < minId) minId = id;
          if (id > maxId) maxId = id;
          if (!rkv) continue;
          let kind = null; let maxsp = 0; let name = ''; let oper = ''; let ref = '';
          while (rkv.p < rkv.e) {
            const k = rkv.v();
            if (k === 0) break;
            const v = rkv.v();
            if (!interesting) continue;
            if (k === kHighway) {
              const sv = S[v];
              if (sv === 'traffic_signals') kind = 's';
              else if (sv === 'speed_camera') kind = 'r';
            } else if (k === kBarrier && S[v] === 'toll_booth') kind = 'toll';
            else if (k === kCalming && CALMING.has(S[v])) kind = kind || 'l';
            else if (k === kMaxspeed) maxsp = parseInt(S[v], 10) || 0;
            else if (k === kName) name = S[v];
            else if (k === kOperator) oper = S[v];
            else if (k === kRef) ref = S[v];
          }
          if (kind) {
            const lat = 1e-9 * (blk.latOff + blk.gran * la);
            const lng = 1e-9 * (blk.lonOff + blk.gran * lo);
            if (kind === 'r') pts.r.push([lat, lng, maxsp]);
            else if (kind === 'toll') pts.toll.push([lat, lng, (name || '').slice(0, 60), (oper || '').slice(0, 50), ref]);
            else pts[kind].push([lat, lng]);
          }
        }
        nodeBlocks.push({ offset: bl.offset, dataSize: bl.dataSize, minId, maxId });
      } else if (f === 3 && w === 2) {
        // Way
        const l = g.v(); const end = g.p + l;
        const wr = new R(data, g.p, end);
        let keysR = null; let valsR = null; let refsR = null;
        while (wr.p < wr.e) {
          const t2 = wr.v(); const f2 = t2 >>> 3;
          if (f2 === 2) keysR = packedRange(wr);
          else if (f2 === 3) valsR = packedRange(wr);
          else if (f2 === 8) refsR = packedRange(wr);
          else wr.skip(t2 & 7);
        }
        g.p = end;
        if (!keysR || !refsR) continue;
        const rk = new R(data, keysR[0], keysR[1]);
        const rv = new R(data, valsR[0], valsR[1]);
        let cls = 0; let maxsp = 0; let name = ''; let isToll = false; let tollOper = '';
        while (rk.p < rk.e) {
          const k = rk.v(); const v = rv.v();
          if (k === kHighway) cls = HW_CLASS[S[v]] || 0;
          else if (k === kMaxspeed) maxsp = parseInt(S[v], 10) || 0;
          else if (k === kName) name = S[v];
          else if (k === kBarrier && S[v] === 'toll_booth') isToll = true;
          else if (k === kOperator) tollOper = S[v];
        }
        if (isToll) {
          const rr = new R(data, refsR[0], refsR[1]);
          const first = rr.sv();
          tollWays.push({ ref: first, name: name.slice(0, 60), oper: tollOper.slice(0, 50) });
          wayRefs.push(first);
          continue;
        }
        if (!cls || maxsp < 5 || maxsp > 130) continue;
        const rr = new R(data, refsR[0], refsR[1]);
        const all = [];
        let acc = 0;
        while (rr.p < rr.e) { acc += rr.sv(); all.push(acc); }
        if (all.length < 2) continue;
        const keep = [];
        if (all.length <= MAX_PTS_PER_WAY) keep.push(...all);
        else {
          const step = (all.length - 1) / (MAX_PTS_PER_WAY - 1);
          for (let i = 0; i < MAX_PTS_PER_WAY; i++) keep.push(all[Math.round(i * step)]);
        }
        ways.push({ start: wayRefs.n, count: keep.length, max: maxsp, cls, name: name.slice(0, 48) });
        for (const id of keep) wayRefs.push(id);
      } else g.skip(w);
    }
  }
  if (blockCount % 1000 === 0) {
    console.log(`[A] ${(100 * bytesDone / fileSize).toFixed(1)}% blocos=${blockCount} sem=${pts.s.length} rad=${pts.r.length} lomb=${pts.l.length} ped=${pts.toll.length + tollWays.length} vias=${ways.length} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  }
}
console.log(`[A] concluído: semáforos=${pts.s.length} radares=${pts.r.length} lombadas=${pts.l.length} pedágios(nó)=${pts.toll.length} pedágios(via)=${tollWays.length} vias_maxspeed=${ways.length} refs=${wayRefs.n}`);

// ════════ PASSO B — resolve coordenadas dos refs necessários ════════
const needed = wayRefs.a.slice(0, wayRefs.n).sort();
let uniq = 0;
for (let i = 0; i < needed.length; i++) if (i === 0 || needed[i] !== needed[i - 1]) needed[uniq++] = needed[i];
const ids = needed.subarray(0, uniq);
const nLat = new Float64Array(uniq).fill(NaN);
const nLng = new Float64Array(uniq).fill(NaN);
console.log(`[B] refs únicos a resolver: ${uniq}`);

let ptr = 0;
let resolved = 0;
let bDone = 0;
for (const nb of nodeBlocks) {
  bDone++;
  while (ptr < uniq && ids[ptr] < nb.minId) ptr++;
  if (ptr >= uniq) break;
  if (ids[ptr] > nb.maxId) continue;
  const data = readBlob(fd, nb.offset, nb.dataSize);
  const blk = parseBlock(data);
  for (const [gs, ge] of blk.groups) {
    const g = new R(data, gs, ge);
    while (g.p < g.e) {
      const tag = g.v(); const f = tag >>> 3; const w = tag & 7;
      if (f !== 2 || w !== 2) { g.skip(w); continue; }
      const l = g.v(); const end = g.p + l;
      const d = new R(data, g.p, end);
      let idR = null; let latR = null; let lonR = null;
      while (d.p < d.e) {
        const t2 = d.v(); const f2 = t2 >>> 3;
        if (f2 === 1) idR = packedRange(d);
        else if (f2 === 8) latR = packedRange(d);
        else if (f2 === 9) lonR = packedRange(d);
        else d.skip(t2 & 7);
      }
      g.p = end;
      const ri = new R(data, idR[0], idR[1]);
      const rla = new R(data, latR[0], latR[1]);
      const rlo = new R(data, lonR[0], lonR[1]);
      let id = 0; let la = 0; let lo = 0;
      while (ri.p < ri.e) {
        id += ri.sv(); la += rla.sv(); lo += rlo.sv();
        while (ptr < uniq && ids[ptr] < id) ptr++;
        if (ptr < uniq && ids[ptr] === id) {
          nLat[ptr] = 1e-9 * (blk.latOff + blk.gran * la);
          nLng[ptr] = 1e-9 * (blk.lonOff + blk.gran * lo);
          resolved++;
        }
      }
    }
  }
  if (bDone % 1000 === 0) console.log(`[B] blocos ${bDone}/${nodeBlocks.length} resolvidos=${resolved}`);
}
fs.closeSync(fd);
console.log(`[B] concluído: ${resolved}/${uniq} coordenadas (${((Date.now() - t0) / 1000).toFixed(0)}s)`);

function findIdx(id) {
  let lo = 0; let hi = uniq - 1;
  while (lo <= hi) {
    const m = (lo + hi) >> 1;
    if (ids[m] === id) return m;
    if (ids[m] < id) lo = m + 1; else hi = m - 1;
  }
  return -1;
}

// ════════ MONTAGEM DOS SHARDS z12 ════════
function deg2num(lat, lng, z) {
  const n = 2 ** z;
  const x = Math.floor(((lng + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);
  return { x, y };
}
const r5 = (n) => Math.round(n * 1e5) / 1e5;
const shards = new Map();
const shardOf = (lat, lng) => {
  const t = deg2num(lat, lng, SHARD_Z);
  const k = `${t.x}/${t.y}`;
  let s = shards.get(k);
  if (!s) { s = { s: [], r: [], l: [], v: [] }; shards.set(k, s); }
  return s;
};

for (const [lat, lng] of pts.s) shardOf(lat, lng).s.push([r5(lat), r5(lng)]);
for (const [lat, lng, mx] of pts.r) shardOf(lat, lng).r.push([r5(lat), r5(lng), mx]);
for (const [lat, lng] of pts.l) shardOf(lat, lng).l.push([r5(lat), r5(lng)]);

let waysOut = 0;
for (const wy of ways) {
  const flat = [];
  for (let i = 0; i < wy.count; i++) {
    const ix = findIdx(wayRefs.a[wy.start + i]);
    if (ix < 0 || Number.isNaN(nLat[ix])) continue;
    flat.push(r5(nLat[ix]), r5(nLng[ix]));
  }
  if (flat.length < 4) continue;
  const mid = Math.floor(flat.length / 4) * 2;
  shardOf(flat[mid], flat[mid + 1]).v.push([wy.max, wy.cls, wy.name, flat]);
  waysOut++;
}

const tolls = pts.toll.map(([lat, lng, n, o, ref]) => [r5(lat), r5(lng), n, o, ref]);
for (const tw of tollWays) {
  const ix = findIdx(tw.ref);
  if (ix >= 0 && !Number.isNaN(nLat[ix])) tolls.push([r5(nLat[ix]), r5(nLng[ix]), tw.name, tw.oper, '']);
}
// Deduplica cabines da mesma praça (raio ~250 m) mantendo a de nome mais completo
tolls.sort((a, b) => (b[2].length + b[3].length) - (a[2].length + a[3].length));
const pracas = [];
for (const t of tolls) {
  if (pracas.some((p) => Math.abs(p[0] - t[0]) < 0.0025 && Math.abs(p[1] - t[1]) < 0.0025)) continue;
  pracas.push(t);
}

fs.mkdirSync(path.join(OUT, 'sinal', String(SHARD_Z)), { recursive: true });
let bytes = 0;
for (const [k, s] of shards) {
  const [x, y] = k.split('/');
  const dir = path.join(OUT, 'sinal', String(SHARD_Z), x);
  fs.mkdirSync(dir, { recursive: true });
  const body = JSON.stringify(s);
  bytes += body.length;
  fs.writeFileSync(path.join(dir, `${y}.json`), body);
}
fs.mkdirSync(path.join(OUT, 'geo'), { recursive: true });
fs.writeFileSync(path.join(OUT, 'geo', 'pedagios-osm.json'), JSON.stringify(pracas));
const manifest = {
  fonte: 'OpenStreetMap (ODbL) — extrato Geofabrik Brasil, processado offline pelo extrator soberano Ponte',
  geradoEm: new Date().toISOString(),
  shardZoom: SHARD_Z,
  shards: shards.size,
  semaforos: pts.s.length,
  radares: pts.r.length,
  lombadas: pts.l.length,
  viasComLimite: waysOut,
  pracasPedagio: pracas.length,
  bytesShards: bytes
};
fs.writeFileSync(path.join(OUT, 'sinal', 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log('[OK]', JSON.stringify(manifest), `${((Date.now() - t0) / 1000).toFixed(0)}s`);
