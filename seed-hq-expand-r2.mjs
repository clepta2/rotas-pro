/**
 * seed-hq-expand-r2.mjs
 * Expande a cobertura HQ v2 no R2 para:
 *   - z13 em TODOS os 5.570 municípios IBGE (~4,8 km x 4,8 km por cidade, com ruas locais e prédios)
 *   - z14 (raio 2 = 5x5 tiles ≈ 12 km x 12 km + rt/14 para A*) nas ~120 maiores cidades do Brasil
 *
 * Retomável: pula tiles já presentes em hq/index.json.
 */
import zlib from 'zlib';
import { GEO_MUNICIPIOS_IBGE } from './municipios_geo.js';
import { decodeMvtToHqTile, hqToRoutingTile } from './mvt-decoder.js';
import { r2Put, r2Get } from './r2-s3.mjs';

const TILE_SRC = 'https://tiles.openfreemap.org/planet/20261101_080013_pt';
const CONCURRENCY = 16;

// Principais cidades e polos regionais do Brasil (raio 2 em z14 ≈ 12 km x 12 km)
const POLOS_Z14 = [
  [-23.5505, -46.6333], [-22.9068, -43.1729], [-15.7942, -47.8825], [-12.9714, -38.5014],
  [-3.7172, -38.5433], [-19.9167, -43.9345], [-3.1190, -60.0217], [-25.4284, -49.2733],
  [-8.0476, -34.8770], [-16.6869, -49.2648], [-1.4558, -48.4902], [-30.0346, -51.2177],
  [-23.4538, -46.5333], [-22.9056, -47.0608], [-2.5307, -44.3068], [-22.8268, -43.0539],
  [-9.6658, -35.7350], [-22.7856, -43.3117], [-20.4697, -54.6201], [-5.7945, -35.2110],
  [-5.0892, -42.8016], [-23.6821, -46.5650], [-23.5329, -46.7916], [-7.1195, -34.8450],
  [-21.1775, -47.8103], [-23.1791, -45.8872], [-18.9186, -48.2772], [-19.9320, -44.0539],
  [-23.5015, -47.4526], [-10.9472, -37.0731], [-12.2664, -38.9663], [-15.6014, -56.0979],
  [-26.3045, -48.8487], [-21.7642, -43.3503], [-23.3045, -51.1696], [-22.8833, -43.1036],
  [-1.3727, -48.3722], [-22.7592, -43.4511], [-29.1678, -51.1794], [-27.5954, -48.5480],
  [-8.7612, -63.9004], [-0.0349, -51.0694], [-23.9678, -46.3322], [-23.5225, -46.1883],
  [-23.2237, -45.9009], [-22.3246, -49.0871], [-20.8113, -49.3758], [-22.7338, -47.6476],
  [-23.1857, -46.8978], [-22.1207, -51.3925], [-22.2171, -49.9501], [-20.5386, -47.4008],
  [-21.7946, -48.1766], [-22.0174, -47.8909], [-22.5645, -47.4017], [-22.7394, -47.3311],
  [-23.2642, -47.2992], [-23.0889, -47.2181], [-23.9608, -46.3969], [-24.0058, -46.4028],
  [-23.9931, -46.2564], [-23.0264, -45.5553], [-22.9519, -46.5419], [-23.5489, -46.3108],
  [-23.6639, -46.4614], [-23.6226, -46.5489], [-23.6939, -46.5650], [-23.5226, -46.8358],
  [-23.6036, -46.9192], [-23.4628, -46.9189], [-23.4261, -46.7489], [-23.4806, -46.3489],
  [-20.3155, -40.3128], [-20.3478, -40.2950], [-20.1286, -40.3078], [-20.2976, -40.2958],
  [-21.7622, -41.3181], [-22.5112, -43.1779], [-22.5231, -44.1042], [-22.8792, -42.0186],
  [-19.9678, -44.1983], [-16.7282, -43.8578], [-19.7472, -47.9381], [-18.8545, -41.9555],
  [-19.4679, -42.5367], [-20.1389, -44.8839], [-21.5556, -45.4364], [-21.7878, -46.5614],
  [-14.8619, -40.8442], [-14.7935, -39.0464], [-14.7886, -39.2803], [-12.6975, -38.3242],
  [-8.2845, -35.9699], [-9.3891, -40.5027], [-7.2307, -35.8817], [-5.1875, -37.3442],
  [-7.2131, -39.3153], [-5.5185, -47.4777], [-2.4385, -54.6996], [-5.3686, -49.1178],
  [-16.3285, -48.9534], [-17.7923, -50.9192], [-16.4673, -54.6372], [-11.8604, -55.5091],
  [-22.2231, -54.8120], [-23.4205, -51.9333], [-24.9578, -53.4595], [-25.5163, -54.5854],
  [-25.0916, -50.1668], [-25.5313, -49.2031], [-26.9194, -49.0661], [-26.9078, -48.6619],
  [-26.9906, -48.6347], [-28.6775, -49.3697], [-27.1004, -52.6152], [-29.9189, -51.1781],
  [-29.6842, -51.1406], [-31.7654, -52.3376], [-29.6842, -53.8069], [-28.2628, -52.4067],
  [-9.9754, -67.8249], [2.8235, -60.6758], [-10.1844, -48.3336]
];

function deg2num(lat, lng, z) {
  const n = 2 ** z;
  const x = Math.floor(((lng + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);
  return { x, y };
}

let existingIndex = {};
try {
  const old = await r2Get('hq/index.json');
  if (old) existingIndex = JSON.parse(old.toString('utf8')).tiles || {};
} catch (_) {}

const existingSets = {};
for (const [z, arr] of Object.entries(existingIndex)) existingSets[z] = new Set(arr);

const wanted = new Map();
const addTile = (z, x, y) => {
  const k = `${x}/${y}`;
  if (existingSets[z]?.has(k)) return;
  wanted.set(`${z}/${k}`, { z, x, y });
};

// 0. z4 e z5 cobrindo todo o Brasil (visão continental sem depender de SVG simples)
for (const z of [4, 5]) {
  const tl = deg2num(6.0, -74.5, z);
  const br = deg2num(-34.5, -34.0, z);
  for (let x = tl.x; x <= br.x; x++) for (let y = tl.y; y <= br.y; y++) addTile(z, x, y);
}

// 1. z13 para todos os 5.570 municípios
for (const [lat, lng] of Object.values(GEO_MUNICIPIOS_IBGE)) {
  const t = deg2num(lat, lng, 13);
  addTile(13, t.x, t.y);
}

// 2. z14 expandido (r=2 -> 5x5 tiles ≈ 12 km x 12 km) para os ~120 polos urbanos
for (const [lat, lng] of POLOS_Z14) {
  const c = deg2num(lat, lng, 14);
  for (let dx = -2; dx <= 2; dx++) {
    for (let dy = -2; dy <= 2; dy++) {
      addTile(14, c.x + dx, c.y + dy);
      addTile(13, (c.x + dx) >> 1, (c.y + dy) >> 1);
    }
  }
}

const list = [...wanted.values()].sort((a, b) => a.z - b.z);
console.log(`[hq-expand] novos_tiles=${list.length} (z13=${list.filter(t=>t.z===13).length}, z14=${list.filter(t=>t.z===14).length})`);
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

const added = { 4: [], 5: [], 13: [], 14: [] };
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
      if (t.z === 14) await r2Put(`rt/14/${t.x}/${t.y}.json`, JSON.stringify(hqToRoutingTile(hq)));
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
console.log(`[hq-expand] CONCLUÍDO ok=${ok} vazio=${vazio} falhas=${fail} ${(bytes / 1e6).toFixed(1)}MB em ${((Date.now() - t0) / 1000).toFixed(0)}s`);
