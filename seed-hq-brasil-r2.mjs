/**
 * seed-hq-brasil-r2.mjs
 * Semeia tiles vetoriais HQ v2 para TODO O BRASIL no Cloudflare R2 (rotas-mapas-r2):
 *   - z6:  Brasil inteiro (36+ tiles) — rodovias federais/estaduais, rios, cidades
 *   - z8:  Brasil inteiro (bbox continental ~650 tiles) — malha regional completa
 *   - z10: Todos os 5.570 municípios IBGE (~2.370 tiles) — rodovias e áreas urbanas
 *   - z12: Todos os 5.570 municípios IBGE (~5.342 tiles) — bairros e avenidas principais
 *   - z14: Sedes de todos os 5.570 municípios IBGE (~5.566 tiles) + rt/14 para roteamento A*
 *
 * Fonte offline (apenas no seed): OpenMapTiles PBF via OpenFreeMap (© OpenStreetMap contributors, ODbL).
 * Pula tiles já listados em hq/index.json (retomável e incremental).
 *
 * Uso: node seed-hq-brasil-r2.mjs [z6|z8|z10|z12|z14|all]
 */
import zlib from 'zlib';
import { GEO_MUNICIPIOS_IBGE } from './municipios_geo.js';
import { decodeMvtToHqTile, hqToRoutingTile } from './mvt-decoder.js';
import { r2Put, r2Get } from './r2-s3.mjs';

const MODE = (process.argv[2] || 'all').toLowerCase();
const TILE_SRC = 'https://tiles.openfreemap.org/planet/20261101_080013_pt';
const CONCURRENCY = 14;

function deg2num(lat, lng, z) {
  const n = 2 ** z;
  const x = Math.floor(((lng + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);
  return { x, y };
}

// Carrega índice existente para pular tiles já semeados
let existingIndex = {};
try {
  const old = await r2Get('hq/index.json');
  if (old) existingIndex = JSON.parse(old.toString('utf8')).tiles || {};
} catch (_) {}

const existingSets = {};
for (const [z, arr] of Object.entries(existingIndex)) {
  existingSets[z] = new Set(arr);
}

const munis = Object.values(GEO_MUNICIPIOS_IBGE);
const wanted = new Map();
const addTile = (z, x, y) => {
  const k = `${x}/${y}`;
  if (existingSets[z]?.has(k)) return;
  wanted.set(`${z}/${k}`, { z, x, y });
};

if (MODE === 'all' || MODE === 'z6') {
  const tl = deg2num(5.5, -74.2, 6);
  const br = deg2num(-34.0, -34.5, 6);
  for (let x = tl.x; x <= br.x; x++) for (let y = tl.y; y <= br.y; y++) addTile(6, x, y);
}

if (MODE === 'all' || MODE === 'z8') {
  // Cobre todos os municípios + vizinhança 1 tile em z8 (cobre rodovias entre cidades)
  for (const [lat, lng] of munis) {
    const t = deg2num(lat, lng, 8);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) addTile(8, t.x + dx, t.y + dy);
  }
}

if (MODE === 'all' || MODE === 'z10') {
  for (const [lat, lng] of munis) {
    const t = deg2num(lat, lng, 10);
    addTile(10, t.x, t.y);
  }
}

if (MODE === 'all' || MODE === 'z12') {
  for (const [lat, lng] of munis) {
    const t = deg2num(lat, lng, 12);
    addTile(12, t.x, t.y);
  }
}

if (MODE === 'all' || MODE === 'z14') {
  for (const [lat, lng] of munis) {
    const t = deg2num(lat, lng, 14);
    addTile(14, t.x, t.y);
  }
}

const list = [...wanted.values()].sort((a, b) => a.z - b.z);
console.log(`[hq-brasil] modo=${MODE} novos_tiles=${list.length} (z6=${list.filter(t=>t.z===6).length}, z8=${list.filter(t=>t.z===8).length}, z10=${list.filter(t=>t.z===10).length}, z12=${list.filter(t=>t.z===12).length}, z14=${list.filter(t=>t.z===14).length})`);

if (list.length === 0) {
  console.log('[hq-brasil] Todos os tiles solicitados já estão no índice R2.');
  process.exit(0);
}

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

const added = { 6: [], 8: [], 10: [], 12: [], 14: [] };
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
      if (t.z === 14) {
        await r2Put(`rt/14/${t.x}/${t.y}.json`, JSON.stringify(hqToRoutingTile(hq)));
      }
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
    if (done % 1500 === 0) {
      await flushIndex().catch(() => {});
    }
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }, worker));
await flushIndex();
console.log(`[hq-brasil] CONCLUÍDO ok=${ok} vazio=${vazio} falhas=${fail} ${(bytes / 1e6).toFixed(1)}MB em ${((Date.now() - t0) / 1000).toFixed(0)}s`);
