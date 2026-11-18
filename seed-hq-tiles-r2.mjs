/**
 * seed-hq-tiles-r2.mjs
 * Semeia tiles vetoriais de ALTA FIDELIDADE (formato HQ v2) no R2 para renderização nítida em zoom de rua.
 *
 * - Fonte offline (apenas no seed): OpenMapTiles PBF via OpenFreeMap (dados © OpenStreetMap contributors, ODbL)
 * - Decodificação + simplificação Douglas-Peucker local (mvt-decoder.js), zero dependências
 * - Grava no R2: hq/{z}/{x}/{y}.json (gzip) + rt/14/{x}/{y}.json (grafo leve para o A*) + hq/index.json
 * - Cobertura: 27 capitais + grandes cidades, z14 (rua) + z13/z12 (bairro/cidade)
 *
 * Uso: node seed-hq-tiles-r2.mjs [filtroCidade]
 */
import zlib from 'zlib';
import { decodeMvtToHqTile, hqToRoutingTile } from './mvt-decoder.js';
import { r2Put, r2Get } from './r2-s3.mjs';

const TILE_SRC = 'https://tiles.openfreemap.org/planet/20261101_080013_pt';
const FILTRO = (process.argv[2] || '').toLowerCase();
const CONCURRENCY = 6;

// [nome, lat, lng, raio em tiles z14 (~2,2 km cada)]
const CIDADES = [
  ['São Paulo', -23.585, -46.640, 9], ['Rio de Janeiro', -22.925, -43.300, 8], ['Belo Horizonte', -19.905, -43.955, 5],
  ['Brasília', -15.800, -47.900, 5], ['Curitiba', -25.445, -49.270, 4], ['Porto Alegre', -30.050, -51.190, 4],
  ['Salvador', -12.960, -38.470, 4], ['Recife', -8.070, -34.920, 4], ['Fortaleza', -3.760, -38.530, 4],
  ['Goiânia', -16.690, -49.265, 4], ['Manaus', -3.070, -60.010, 4], ['Belém', -1.420, -48.465, 3],
  ['Campinas', -22.900, -47.065, 3], ['Guarulhos', -23.450, -46.520, 3], ['Santos', -23.960, -46.340, 2],
  ['Florianópolis', -27.595, -48.540, 3], ['Vitória', -20.300, -40.300, 3], ['Natal', -5.810, -35.215, 3],
  ['João Pessoa', -7.130, -34.860, 3], ['Maceió', -9.630, -35.720, 3], ['Aracaju', -10.930, -37.065, 2],
  ['Teresina', -5.080, -42.800, 3], ['São Luís', -2.540, -44.250, 3], ['Cuiabá', -15.600, -56.080, 3],
  ['Campo Grande', -20.465, -54.620, 3], ['Porto Velho', -8.760, -63.880, 2], ['Macapá', 0.040, -51.070, 2],
  ['Rio Branco', -9.970, -67.820, 2], ['Boa Vista', 2.820, -60.690, 2], ['Palmas', -10.200, -48.330, 2],
  ['São José dos Campos', -23.200, -45.890, 2], ['Ribeirão Preto', -21.180, -47.810, 2], ['Sorocaba', -23.500, -47.460, 2],
  ['Uberlândia', -18.915, -48.270, 2], ['Londrina', -23.310, -51.165, 2], ['Joinville', -26.300, -48.845, 2],
  ['Niterói', -22.900, -43.090, 2], ['Juiz de Fora', -21.765, -43.350, 2], ['Caxias do Sul', -29.170, -51.180, 2],
  ['Feira de Santana', -12.255, -38.960, 2], ['Maringá', -23.420, -51.935, 2], ['Santo André/ABC', -23.680, -46.540, 3]
];

function deg2num(lat, lng, z) {
  const n = 2 ** z;
  const x = Math.floor(((lng + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);
  return { x, y };
}

const tiles = new Map();
for (const [nome, lat, lng, r] of CIDADES) {
  if (FILTRO && !nome.toLowerCase().includes(FILTRO)) continue;
  const c = deg2num(lat, lng, 14);
  for (let dx = -r; dx <= r; dx++) {
    for (let dy = -r; dy <= r; dy++) {
      if (dx * dx + dy * dy > (r + 0.5) * (r + 0.5)) continue;
      const x = c.x + dx; const y = c.y + dy;
      tiles.set(`14/${x}/${y}`, { z: 14, x, y });
      tiles.set(`13/${x >> 1}/${y >> 1}`, { z: 13, x: x >> 1, y: y >> 1 });
      tiles.set(`12/${x >> 2}/${y >> 2}`, { z: 12, x: x >> 2, y: y >> 2 });
    }
  }
}

const list = [...tiles.values()].sort((a, b) => a.z - b.z);
console.log(`[hq] ${list.length} tiles (z14=${list.filter((t) => t.z === 14).length}, z13=${list.filter((t) => t.z === 13).length}, z12=${list.filter((t) => t.z === 12).length})`);

async function fetchPbf(t, tries = 4) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(`${TILE_SRC}/${t.z}/${t.x}/${t.y}.pbf`, { signal: AbortSignal.timeout(30000) });
      if (r.status === 204 || r.status === 404) return null;
      if (r.ok) return new Uint8Array(await r.arrayBuffer());
    } catch (_) {}
    await new Promise((res) => setTimeout(res, 800 * (i + 1)));
  }
  throw new Error('download falhou');
}

const t0 = Date.now();
const index = { 12: [], 13: [], 14: [] };
let idx = 0; let ok = 0; let vazio = 0; let fail = 0; let bytes = 0;

async function worker() {
  while (idx < list.length) {
    const t = list[idx++];
    try {
      const pbf = await fetchPbf(t);
      if (!pbf || pbf.length < 50) { vazio++; continue; }
      const hq = decodeMvtToHqTile(pbf, t.z);
      if (!hq.road.length && !hq.water.length && !hq.land.length) { vazio++; continue; }
      const gz = zlib.gzipSync(JSON.stringify(hq), { level: 9 });
      await r2Put(`hq/${t.z}/${t.x}/${t.y}.json`, gz, 'application/json');
      if (t.z === 14) await r2Put(`rt/14/${t.x}/${t.y}.json`, JSON.stringify(hqToRoutingTile(hq)));
      index[t.z].push(`${t.x}/${t.y}`);
      bytes += gz.length;
      ok++;
    } catch (e) {
      fail++;
      if (fail < 10) console.log('  erro', t, e.message);
    }
    const done = ok + vazio + fail;
    if (done % 100 === 0) {
      console.log(`  ${done}/${list.length} ok=${ok} vazio=${vazio} falhas=${fail} ${(bytes / 1e6).toFixed(0)}MB ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    }
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }, worker));

let prev = {};
try {
  const old = await r2Get('hq/index.json');
  if (old) prev = JSON.parse(old.toString('utf8')).tiles || {};
} catch (_) {}
for (const [z, arr] of Object.entries(index)) prev[z] = [...new Set([...(prev[z] || []), ...arr])];
await r2Put('hq/index.json', JSON.stringify({
  formato: 'HQ v2 (coords 0..4096 achatadas, gzip)',
  fonte: 'OpenStreetMap (ODbL) via OpenMapTiles, pré-processado offline',
  atualizadoEm: new Date().toISOString(),
  tiles: prev
}));
console.log(`[hq] OK=${ok} vazio=${vazio} falhas=${fail} ${(bytes / 1e6).toFixed(0)}MB em ${((Date.now() - t0) / 1000).toFixed(0)}s`);
