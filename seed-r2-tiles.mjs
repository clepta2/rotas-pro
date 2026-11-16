import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { decodeMvtToCompactTile } from './mvt-decoder.js';

const TEMP_DIR = 'C:\\Users\\Win10\\Documents\\rotas-pro\\tmp_tiles';
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

function deg2num(lat, lng, z) {
  const n = Math.pow(2, z);
  const x = Math.floor(((lng + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);
  return { z, x, y };
}

// Principais regiões metropolitanas do Brasil para pré-aquecer no nosso R2 soberano
const HUBS_BRASIL = [
  { nome: 'São Paulo (Paulista/Centro/Faria Lima)', lat: -23.5614, lng: -46.6558, zooms: [12, 13, 14] },
  { nome: 'Rio de Janeiro (Centro/Copacabana)', lat: -22.9068, lng: -43.1729, zooms: [12, 13, 14] },
  { nome: 'Belo Horizonte (Centro/Savassi)', lat: -19.9191, lng: -43.9386, zooms: [12, 13] },
  { nome: 'Curitiba (Centro/Batel)', lat: -25.4284, lng: -49.2733, zooms: [12, 13] },
  { nome: 'Brasília (Plano Piloto)', lat: -15.7942, lng: -47.8825, zooms: [12, 13] },
  { nome: 'Porto Alegre (Centro)', lat: -30.0277, lng: -51.2287, zooms: [12, 13] },
  { nome: 'Salvador (Centro/Barra)', lat: -12.9714, lng: -38.5014, zooms: [12, 13] },
  { nome: 'Recife (Centro/Boa Viagem)', lat: -8.0631, lng: -34.8711, zooms: [12, 13] },
  { nome: 'Fortaleza (Meireles)', lat: -3.7265, lng: -38.4962, zooms: [12, 13] }
];

const tilesToFetch = new Map();

// Adiciona tiles centrais e vizinhos 3x3 em z=14 para São Paulo (cobre Paulista, Faria Lima, Sé, Ibirapuera, Pinheiros)
const spCenter14 = deg2num(-23.5614, -46.6558, 14);
for (let dx = -1; dx <= 1; dx++) {
  for (let dy = -1; dy <= 1; dy++) {
    const key = `14/${spCenter14.x + dx}/${spCenter14.y + dy}`;
    tilesToFetch.set(key, { z: 14, x: spCenter14.x + dx, y: spCenter14.y + dy });
  }
}

for (const hub of HUBS_BRASIL) {
  for (const z of hub.zooms) {
    const t = deg2num(hub.lat, hub.lng, z);
    tilesToFetch.set(`${z}/${t.x}/${t.y}`, t);
  }
}

console.log(`Total sovereign tiles to pre-seed in R2: ${tilesToFetch.size}`);

async function run() {
  let okCount = 0;
  for (const [key, t] of tilesToFetch) {
    const url = `https://tiles.openfreemap.org/planet/20261101_080013_pt/${t.z}/${t.x}/${t.y}.pbf`;
    try {
      const resp = await fetch(url);
      if (!resp.ok) {
        console.log(`  Skip ${key}: HTTP ${resp.status}`);
        continue;
      }
      const ab = await resp.arrayBuffer();
      const compact = decodeMvtToCompactTile(new Uint8Array(ab));
      const outPath = path.join(TEMP_DIR, `${t.z}_${t.x}_${t.y}.json`);
      fs.writeFileSync(outPath, JSON.stringify(compact), 'utf8');

      // Upload para R2 usando wrangler (usa CLOUDFLARE_API_TOKEN do ambiente)
      execSync(`npx.cmd wrangler r2 object put rotas-mapas-r2/tiles/${t.z}/${t.x}/${t.y}.json --file="${outPath}" --content-type=application/json --remote`, {
        stdio: 'ignore',
        env: process.env
      });
      okCount++;
      console.log(`  [${okCount}/${tilesToFetch.size}] Seeded R2 tile: ${key} (roads: ${compact.road.length}, pois: ${compact.poi.length})`);
    } catch (err) {
      console.error(`  Error on ${key}:`, err.message);
    }
  }
  fs.rmSync(TEMP_DIR, { recursive: true, force: true });
  console.log(`Done! ${okCount} tiles stored in Cloudflare R2.`);
}

run();
