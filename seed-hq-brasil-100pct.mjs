/**
 * seed-hq-brasil-100pct.mjs
 * Semeia 100% dos tiles z8 e z10 dentro do polígono oficial do Brasil (geo/br-ufs.json)
 * para que NENHUM ponto do território nacional fique sem cobertura vetorial HQ.
 */
import zlib from 'zlib';
import { decodeMvtToHqTile } from './mvt-decoder.js';
import { r2Put, r2Get } from './r2-s3.mjs';

const TILE_SRC = 'https://tiles.openfreemap.org/planet/20261101_080013_pt';
const CONCURRENCY = 18;

const deg2num = (lat, lng, z) => {
  const n = 2 ** z;
  const x = Math.floor(((lng + 180) / 360) * n);
  const lr = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(lr) + 1 / Math.cos(lr)) / Math.PI) / 2) * n);
  return { x, y };
};
const tileBounds = (x, y, z) => {
  const n = 2 ** z;
  const lng0 = (x / n) * 360 - 180;
  const lng1 = ((x + 1) / n) * 360 - 180;
  const lat0 = (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI;
  const lat1 = (Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + 1)) / n))) * 180) / Math.PI;
  return [
    [(lng0 + lng1) / 2, (lat0 + lat1) / 2],
    [lng0, lat0], [lng1, lat0], [lng0, lat1], [lng1, lat1]
  ];
};

const ufs = JSON.parse((await r2Get('geo/br-ufs.json')).toString('utf8'));
const polys = [];
for (const f of ufs) {
  const g = f.geometry;
  if (g.type === 'Polygon') polys.push(g.coordinates[0]);
  else if (g.type === 'MultiPolygon') for (const p of g.coordinates) polys.push(p[0]);
}
const inPoly = (pt, ring) => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    if (((yi > pt[1]) !== (yj > pt[1])) && (pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
};
const touchesBrazil = (x, y, z) => tileBounds(x, y, z).some((pt) => polys.some((r) => inPoly(pt, r)));

let existingIndex = {};
try {
  const old = await r2Get('hq/index.json');
  if (old) existingIndex = JSON.parse(old.toString('utf8')).tiles || {};
} catch (_) {}
const existingSets = {};
for (const [z, arr] of Object.entries(existingIndex)) existingSets[z] = new Set(arr);

const list = [];
for (const z of [8, 10]) {
  const tl = deg2num(5.5, -74.2, z);
  const br = deg2num(-34.0, -34.5, z);
  for (let x = tl.x; x <= br.x; x++) {
    for (let y = tl.y; y <= br.y; y++) {
      const k = `${x}/${y}`;
      if (existingSets[z]?.has(k)) continue;
      if (touchesBrazil(x, y, z)) list.push({ z, x, y });
    }
  }
}

console.log(`[hq-br-100] novos_tiles=${list.length} (z8=${list.filter(t=>t.z===8).length}, z10=${list.filter(t=>t.z===10).length})`);
if (!list.length) process.exit(0);

async function fetchPbf(t, tries = 4) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(`${TILE_SRC}/${t.z}/${t.x}/${t.y}.pbf`, { signal: AbortSignal.timeout(25000) });
      if (r.status === 204 || r.status === 404) return null;
      if (r.ok) return new Uint8Array(await r.arrayBuffer());
    } catch (_) {}
    await new Promise((res) => setTimeout(res, 500 * (i + 1)));
  }
  throw new Error('download falhou');
}

const added = { 8: [], 10: [] };
const t0 = Date.now();
let idx = 0; let ok = 0; let vazio = 0; let fail = 0; let bytes = 0;

async function flushIndex() {
  let prev = {};
  try {
    const old = await r2Get('hq/index.json');
    if (old) prev = JSON.parse(old.toString('utf8')).tiles || {};
  } catch (_) {}
  for (const [z, arr] of Object.entries(added)) {
    if (!arr.length) continue;
    prev[z] = [...new Set([...(prev[z] || []), ...arr])];
  }
  await r2Put('hq/index.json', JSON.stringify({
    formato: 'HQ v2 (coords 0..4096 achatadas, gzip)',
    fonte: 'OpenStreetMap (ODbL) via OpenMapTiles, pré-processado offline',
    atualizadoEm: new Date().toISOString(),
    tiles: prev
  }));
}

async function worker() {
  while (idx < list.length) {
    const t = list[idx++];
    try {
      const pbf = await fetchPbf(t);
      if (!pbf || pbf.length < 40) { vazio++; continue; }
      const hq = decodeMvtToHqTile(pbf, t.z);
      if (!hq.road.length && !hq.water.length && !hq.land.length && !hq.place.length) { vazio++; continue; }
      const gz = zlib.gzipSync(JSON.stringify(hq), { level: 6 });
      await r2Put(`hq/${t.z}/${t.x}/${t.y}.json`, gz, 'application/json');
      added[t.z].push(`${t.x}/${t.y}`);
      bytes += gz.length;
      ok++;
    } catch (e) {
      fail++;
      if (fail <= 10) console.log('  erro', t, e.message);
    }
    const done = ok + vazio + fail;
    if (done % 250 === 0) {
      console.log(`  ${done}/${list.length} ok=${ok} vazio=${vazio} falhas=${fail} ${(bytes / 1e6).toFixed(1)}MB ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    }
    if (done % 1500 === 0) await flushIndex().catch(() => {});
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }, worker));
await flushIndex();
console.log(`[hq-br-100] CONCLUÍDO ok=${ok} vazio=${vazio} falhas=${fail} ${(bytes / 1e6).toFixed(1)}MB em ${((Date.now() - t0) / 1000).toFixed(0)}s`);
