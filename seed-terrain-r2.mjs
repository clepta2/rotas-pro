/**
 * seed-terrain-r2.mjs
 * Semeia o relevo soberano do Brasil no R2 (rotas-mapas-r2/terrain/{z}/{x}/{y}.bin).
 *
 * - Fonte offline (só no seed): tiles Terrarium do AWS Open Data (SRTM/GMTED, domínio público/atribuição Mapzen)
 * - Decodificador PNG nativo (zlib do Node + desfiltragem Paeth), zero dependências
 * - Cada tile vira uma grade 128x128 Int16 (metros) comprimida em gzip (~10-20 KB)
 * - Cobertura: z7 Brasil inteiro, z10 em torno dos 5.570 municípios IBGE, z12 nas regiões metropolitanas semeadas
 *
 * Uso: node seed-terrain-r2.mjs [z7|z10|z12|all]
 */
import zlib from 'zlib';
import { GEO_MUNICIPIOS_IBGE } from './municipios_geo.js';
import { r2Put } from './r2-s3.mjs';

const MODE = process.argv[2] || 'all';
const SRC = (z, x, y) => `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;
const GRID = 128;
const CONCURRENCY = 10;

function deg2num(lat, lng, z) {
  const n = 2 ** z;
  const x = Math.floor(((lng + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);
  return { x, y };
}

function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('não é PNG');
  let off = 8; let w = 0; let h = 0; let ctype = 0; let depth = 0;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); depth = data[8]; ctype = data[9]; if (data[12]) throw new Error('PNG entrelaçado'); }
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  if (depth !== 8 || (ctype !== 2 && ctype !== 6)) throw new Error(`PNG não suportado ct=${ctype} d=${depth}`);
  const bpp = ctype === 6 ? 4 : 3;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * bpp;
  const out = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    const src = y * (stride + 1) + 1;
    const dst = y * stride;
    for (let i = 0; i < stride; i++) {
      const x = raw[src + i];
      const a = i >= bpp ? out[dst + i - bpp] : 0;
      const b = y > 0 ? out[dst - stride + i] : 0;
      const c = i >= bpp && y > 0 ? out[dst - stride + i - bpp] : 0;
      let v;
      if (f === 0) v = x;
      else if (f === 1) v = x + a;
      else if (f === 2) v = x + b;
      else if (f === 3) v = x + ((a + b) >> 1);
      else {
        const p = a + b - c; const pa = Math.abs(p - a); const pb = Math.abs(p - b); const pc = Math.abs(p - c);
        v = x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
      }
      out[dst + i] = v & 255;
    }
  }
  return { w, h, bpp, px: out };
}

// Terrarium: altura = R*256 + G + B/256 - 32768 → média 2x2 para grade 128x128
function toGrid(png) {
  const { w, bpp, px } = png;
  const f = w / GRID;
  const grid = new Int16Array(GRID * GRID);
  let max = -32768;
  for (let gy = 0; gy < GRID; gy++) {
    for (let gx = 0; gx < GRID; gx++) {
      let sum = 0; let n = 0;
      for (let dy = 0; dy < f; dy++) {
        for (let dx = 0; dx < f; dx++) {
          const i = ((gy * f + dy) * w + (gx * f + dx)) * bpp;
          sum += px[i] * 256 + px[i + 1] + px[i + 2] / 256 - 32768;
          n++;
        }
      }
      const v = Math.max(-500, Math.min(9000, Math.round(sum / n)));
      grid[gy * GRID + gx] = v;
      if (v > max) max = v;
    }
  }
  return { grid, max };
}

function buildTileList() {
  const set = new Map();
  const add = (z, x, y) => set.set(`${z}/${x}/${y}`, { z, x, y });
  const muni = Object.values(GEO_MUNICIPIOS_IBGE);

  if (MODE === 'all' || MODE === 'z7') {
    const a = deg2num(5.5, -74.5, 7); const b = deg2num(-34.2, -28.5, 7);
    for (let x = a.x; x <= b.x; x++) for (let y = a.y; y <= b.y; y++) add(7, x, y);
  }
  if (MODE === 'all' || MODE === 'z10') {
    for (const [lat, lng] of muni) {
      const t = deg2num(lat, lng, 10);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) add(10, t.x + dx, t.y + dy);
    }
  }
  if (MODE === 'all' || MODE === 'z12') {
    const metros = [
      [-23.568, -46.66, 4], [-22.94, -43.195, 3], [-19.922, -43.938, 2], [-25.432, -49.275, 2],
      [-15.794, -47.882, 2], [-30.032, -51.225, 2], [-12.985, -38.51, 2], [-8.063, -34.88, 2],
      [-3.728, -38.505, 2], [-22.9056, -47.0608, 2], [-23.9678, -46.3322, 2], [-23.1791, -45.8872, 1],
      [-27.5954, -48.548, 2], [-20.3155, -40.3128, 2], [-16.6869, -49.2648, 2], [-3.119, -60.0217, 2],
      [-1.4558, -48.4902, 2], [-22.4, -43.1, 2], [-22.75, -45.6, 2]
    ];
    for (const [lat, lng, r] of metros) {
      const t = deg2num(lat, lng, 12);
      for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) add(12, t.x + dx, t.y + dy);
    }
  }
  return [...set.values()];
}

async function fetchWithRetry(url, tries = 4) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(30000) });
      if (r.status === 404) return null;
      if (r.ok) return Buffer.from(await r.arrayBuffer());
    } catch (_) {}
    await new Promise((res) => setTimeout(res, 600 * (i + 1)));
  }
  throw new Error('falha ' + url);
}

const tiles = buildTileList();
console.log(`[terrain] modo=${MODE} tiles=${tiles.length}`);
const t0 = Date.now();
let idx = 0; let ok = 0; let ocean = 0; let fail = 0; let bytes = 0;
const index = {};

async function worker() {
  while (idx < tiles.length) {
    const t = tiles[idx++];
    try {
      const png = await fetchWithRetry(SRC(t.z, t.x, t.y));
      if (!png) { fail++; continue; }
      const { grid, max } = toGrid(decodePng(png));
      if (max <= 0) { ocean++; continue; }
      const gz = zlib.gzipSync(Buffer.from(grid.buffer), { level: 9 });
      await r2Put(`terrain/${t.z}/${t.x}/${t.y}.bin`, gz, 'application/octet-stream');
      (index[t.z] ||= []).push(`${t.x}/${t.y}`);
      bytes += gz.length;
      ok++;
    } catch (e) {
      fail++;
      if (fail < 10) console.log('  erro', t, e.message);
    }
    const done = ok + ocean + fail;
    if (done % 250 === 0) {
      console.log(`  ${done}/${tiles.length} ok=${ok} oceano=${ocean} falhas=${fail} ${(bytes / 1e6).toFixed(1)}MB ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    }
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }, worker));

// Índice de cobertura mesclado com o existente (o engine evita 404 em áreas sem relevo)
let prev = {};
try {
  const { r2Get } = await import('./r2-s3.mjs');
  const old = await r2Get('terrain/index.json');
  if (old) prev = JSON.parse(old.toString('utf8')).tiles || {};
} catch (_) {}
for (const [z, arr] of Object.entries(index)) prev[z] = [...new Set([...(prev[z] || []), ...arr])];
await r2Put('terrain/index.json', JSON.stringify({
  formato: 'Int16LE 128x128 gzip, metros',
  fonte: 'SRTM/GMTED via Terrarium (AWS Open Data), pré-processado offline',
  atualizadoEm: new Date().toISOString(),
  tiles: prev
}));
console.log(`[terrain] OK=${ok} oceano=${ocean} falhas=${fail} ${(bytes / 1e6).toFixed(1)}MB em ${((Date.now() - t0) / 1000).toFixed(0)}s`);
