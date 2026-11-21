/**
 * osm-extract-ceps.mjs
 * Extrai CEPs reais (addr:postcode / postal_code) + logradouro + bairro de brazil-latest.osm.pbf
 * e gera shards z12 compactos (cep/12/{x}/{y}.json) para geocodificação reversa real em todo o Brasil.
 */
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

const PBF = 'C:\\Users\\Win10\\Documents\\osm-data\\brazil-latest.osm.pbf';
const OUT = 'C:\\Users\\Win10\\Documents\\osm-data\\cep-out';

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
  }
}
const toInt = (n) => (n > 2147483647 ? n - 18446744073709552000 : n);
function packedRange(r) { const l = r.v(); const s = r.p; r.p += l; return [s, s + l]; }
function* blobs(fd, fileSize) {
  let off = 0; const lenBuf = Buffer.alloc(4);
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
  return raw || zlib.inflateSync(zdata);
}
function parseBlock(buf) {
  const r = new R(buf); const strings = []; const groups = [];
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
    } else if (f === 2 && w === 2) { const l = r.v(); groups.push([r.p, r.p + l]); r.p += l; }
    else if (f === 17) gran = r.v();
    else if (f === 19) latOff = toInt(r.v());
    else if (f === 20) lonOff = toInt(r.v());
    else r.skip(w);
  }
  return { strings, groups, gran, latOff, lonOff };
}
function cleanCep(s) {
  if (!s) return '';
  const d = s.replace(/\D/g, '');
  if (d.length !== 8 || d === '00000000') return '';
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}

class GrowF64 {
  constructor(n = 1 << 20) { this.a = new Float64Array(n); this.n = 0; }
  push(x) { if (this.n === this.a.length) { const b = new Float64Array(this.a.length * 2); b.set(this.a); this.a = b; } this.a[this.n++] = x; }
}

const t0 = Date.now();
const fd = fs.openSync(PBF, 'r');
const fileSize = fs.fstatSync(fd).size;
const nodeBlocks = [];
const nodeCeps = []; // [lat, lng, cep, street, suburb]
const wayRefs = new GrowF64(1 << 20);
const ways = []; // { ref, cep, street, suburb }
let blocks = 0;

for (const bl of blobs(fd, fileSize)) {
  if (bl.type !== 'OSMData') continue;
  const data = readBlob(fd, bl.offset, bl.dataSize);
  const blk = parseBlock(data);
  const S = blk.strings;
  const kPost = S.indexOf('addr:postcode');
  const kPost2 = S.indexOf('postal_code');
  const kStreet = S.indexOf('addr:street');
  const kName = S.indexOf('name');
  const kSuburb = S.indexOf('addr:suburb');
  const kNeigh = S.indexOf('addr:neighbourhood');
  const kHighway = S.indexOf('highway');
  blocks++;

  for (const [gs, ge] of blk.groups) {
    const g = new R(data, gs, ge);
    while (g.p < g.e) {
      const tag = g.v(); const f = tag >>> 3; const w = tag & 7;
      if (f === 2 && w === 2) {
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
        const hasPostKey = kPost >= 0 || kPost2 >= 0;
        while (ri.p < ri.e) {
          id += ri.sv(); la += rla.sv(); lo += rlo.sv();
          if (id < minId) minId = id;
          if (id > maxId) maxId = id;
          if (!rkv) continue;
          let cep = ''; let street = ''; let suburb = '';
          while (rkv.p < rkv.e) {
            const k = rkv.v();
            if (k === 0) break;
            const v = rkv.v();
            if (!hasPostKey) continue;
            if (k === kPost || k === kPost2) cep = cleanCep(S[v]);
            else if (k === kStreet) street = S[v];
            else if (k === kSuburb || k === kNeigh) suburb = S[v];
          }
          if (cep) {
            const lat = 1e-9 * (blk.latOff + blk.gran * la);
            const lng = 1e-9 * (blk.lonOff + blk.gran * lo);
            nodeCeps.push([lat, lng, cep, street.slice(0, 60), suburb.slice(0, 40)]);
          }
        }
        nodeBlocks.push({ offset: bl.offset, dataSize: bl.dataSize, minId, maxId });
      } else if (f === 3 && w === 2) {
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
        if (!keysR || !refsR || (kPost < 0 && kPost2 < 0)) continue;
        const rk = new R(data, keysR[0], keysR[1]);
        const rv = new R(data, valsR[0], valsR[1]);
        let cep = ''; let street = ''; let name = ''; let suburb = ''; let isHw = false;
        while (rk.p < rk.e) {
          const k = rk.v(); const v = rv.v();
          if (k === kPost || k === kPost2) cep = cleanCep(S[v]);
          else if (k === kStreet) street = S[v];
          else if (k === kName) name = S[v];
          else if (k === kSuburb || k === kNeigh) suburb = S[v];
          else if (k === kHighway) isHw = true;
        }
        if (!cep) continue;
        const rr = new R(data, refsR[0], refsR[1]);
        const first = rr.sv();
        ways.push({ ref: first, cep, street: (street || (isHw ? name : '')).slice(0, 60), suburb: suburb.slice(0, 40) });
        wayRefs.push(first);
      } else g.skip(w);
    }
  }
  if (blocks % 5000 === 0) console.log(`[A] blocos=${blocks} nodeCeps=${nodeCeps.length} wayCeps=${ways.length} (${((Date.now()-t0)/1000).toFixed(0)}s)`);
}
console.log(`[A] fim: nodeCeps=${nodeCeps.length} wayCeps=${ways.length}`);

const needed = wayRefs.a.slice(0, wayRefs.n).sort();
let uniq = 0;
for (let i = 0; i < needed.length; i++) if (i === 0 || needed[i] !== needed[i - 1]) needed[uniq++] = needed[i];
const ids = needed.subarray(0, uniq);
const nLat = new Float64Array(uniq).fill(NaN);
const nLng = new Float64Array(uniq).fill(NaN);

let ptr = 0;
for (const nb of nodeBlocks) {
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
        }
      }
    }
  }
}
fs.closeSync(fd);

function findIdx(id) {
  let lo = 0; let hi = uniq - 1;
  while (lo <= hi) {
    const m = (lo + hi) >> 1;
    if (ids[m] === id) return m;
    if (ids[m] < id) lo = m + 1; else hi = m - 1;
  }
  return -1;
}
function deg2num(lat, lng, z) {
  const n = 2 ** z;
  const x = Math.floor(((lng + 180) / 360) * n);
  const lr = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(lr) + 1 / Math.cos(lr)) / Math.PI) / 2) * n);
  return { x, y };
}

const shards = new Map();
const seenCepCell = new Set();
const addPt = (lat, lng, cep, street, suburb) => {
  const t = deg2num(lat, lng, 12);
  const k = `${t.x}/${t.y}`;
  // Deduplica mesmo CEP + rua dentro de ~100m para manter shards leves
  const dk = `${k}_${cep}_${Math.round(lat * 1000)}_${Math.round(lng * 1000)}`;
  if (seenCepCell.has(dk)) return;
  seenCepCell.add(dk);
  let arr = shards.get(k);
  if (!arr) { arr = []; shards.set(k, arr); }
  if (arr.length < 600) arr.push([Math.round(lat * 1e5) / 1e5, Math.round(lng * 1e5) / 1e5, cep, street, suburb]);
};

for (const [lat, lng, cep, st, sb] of nodeCeps) addPt(lat, lng, cep, st, sb);
for (const wy of ways) {
  const ix = findIdx(wy.ref);
  if (ix >= 0 && !Number.isNaN(nLat[ix])) addPt(nLat[ix], nLng[ix], wy.cep, wy.street, wy.suburb);
}

fs.mkdirSync(path.join(OUT, '12'), { recursive: true });
let totalPts = 0;
for (const [k, arr] of shards) {
  const [x, y] = k.split('/');
  const dir = path.join(OUT, '12', x);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${y}.json`), JSON.stringify(arr));
  totalPts += arr.length;
}
console.log(`[cep-out] shards=${shards.size} pontos=${totalPts} em ${((Date.now()-t0)/1000).toFixed(0)}s`);
