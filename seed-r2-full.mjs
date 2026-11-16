import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { decodeMvtToCompactTile } from './mvt-decoder.js';

const TEMP_DIR = 'C:\\Users\\Win10\\Documents\\rotas-pro\\tmp_tiles_all';
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

function deg2num(lat, lng, z) {
  const n = Math.pow(2, z);
  const x = Math.floor(((lng + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);
  return { z, x, y };
}

function tile2latlng(x, y, z) {
  const n = Math.pow(2, z);
  const lng = (x / n) * 360 - 180;
  const latRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n)));
  const lat = (latRad * 180) / Math.PI;
  return { lat, lng };
}

// Converte coordenada normalizada (0..1000) dentro do tile z/x/y para Lat/Lng real
function normToLatLng(nx, ny, tx, ty, z) {
  const tl = tile2latlng(tx, ty, z);
  const br = tile2latlng(tx + 1, ty + 1, z);
  const lng = tl.lng + (nx / 1000) * (br.lng - tl.lng);
  const lat = tl.lat + (ny / 1000) * (br.lat - tl.lat);
  return { lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)) };
}

const HUBS = [
  // São Paulo Centro Expandido (Paulista, Sé, Faria Lima, Ibirapuera, Congonhas, Pinheiros, Morumbi, Tatuapé, Santana) -> grid 4x4 z14 + 2x2 z13
  { nome: 'São Paulo', lat: -23.568, lng: -46.660, grid14: 2, grid13: 1 },
  // Rio de Janeiro (Centro, Copacabana, Ipanema, Botafogo, Tijuca, Galeão) -> grid 3x3 z14
  { nome: 'Rio de Janeiro', lat: -22.940, lng: -43.195, grid14: 1, grid13: 1 },
  // Belo Horizonte (Centro, Savassi, Pampulha)
  { nome: 'Belo Horizonte', lat: -19.922, lng: -43.938, grid14: 1, grid13: 0 },
  // Curitiba (Centro, Batel)
  { nome: 'Curitiba', lat: -25.432, lng: -49.275, grid14: 1, grid13: 0 },
  // Brasília (Plano Piloto, Esplanada)
  { nome: 'Brasília', lat: -15.794, lng: -47.882, grid14: 1, grid13: 0 },
  // Porto Alegre (Centro, Moinhos)
  { nome: 'Porto Alegre', lat: -30.032, lng: -51.225, grid14: 1, grid13: 0 },
  // Salvador (Centro, Barra)
  { nome: 'Salvador', lat: -12.985, lng: -38.510, grid14: 1, grid13: 0 },
  // Recife (Centro, Boa Viagem)
  { nome: 'Recife', lat: -8.063, lng: -34.880, grid14: 1, grid13: 0 },
  // Fortaleza (Centro, Meireles)
  { nome: 'Fortaleza', lat: -3.728, lng: -38.505, grid14: 1, grid13: 0 }
];

const tilesMap = new Map();
for (const h of HUBS) {
  const t14 = deg2num(h.lat, h.lng, 14);
  for (let dx = -h.grid14; dx <= h.grid14; dx++) {
    for (let dy = -h.grid14; dy <= h.grid14; dy++) {
      const k = `14/${t14.x + dx}/${t14.y + dy}`;
      tilesMap.set(k, { z: 14, x: t14.x + dx, y: t14.y + dy, city: h.nome });
    }
  }
  const t12 = deg2num(h.lat, h.lng, 12);
  tilesMap.set(`12/${t12.x}/${t12.y}`, { z: 12, x: t12.x, y: t12.y, city: h.nome });
  const t13 = deg2num(h.lat, h.lng, 13);
  for (let dx = -h.grid13; dx <= h.grid13; dx++) {
    for (let dy = -h.grid13; dy <= h.grid13; dy++) {
      tilesMap.set(`13/${t13.x + dx}/${t13.y + dy}`, { z: 13, x: t13.x + dx, y: t13.y + dy, city: h.nome });
    }
  }
}

console.log(`Preparando extração soberana de ${tilesMap.size} tiles + índice de busca de ruas/POIs...`);

const placesIndex = [];
const seenPlaces = new Set();

async function run() {
  let ok = 0;
  for (const [key, t] of tilesMap) {
    const url = `https://tiles.openfreemap.org/planet/20261101_080013_pt/${t.z}/${t.x}/${t.y}.pbf`;
    try {
      const resp = await fetch(url);
      if (!resp.ok) continue;
      const ab = await resp.arrayBuffer();
      const compact = decodeMvtToCompactTile(new Uint8Array(ab));

      const outPath = path.join(TEMP_DIR, `${t.z}_${t.x}_${t.y}.json`);
      fs.writeFileSync(outPath, JSON.stringify(compact), 'utf8');

      // Coleta ruas reais e POIs do z14 para o Índice de Busca Soberano
      if (t.z === 14) {
        for (const rd of compact.road) {
          if (rd.n && rd.c[0] && rd.c[0].length > 0) {
            const pt = rd.c[0][Math.floor(rd.c[0].length / 2)];
            const kName = `${rd.n.toLowerCase()}_${t.city}`;
            if (!seenPlaces.has(kName) && rd.n.length >= 4) {
              seenPlaces.add(kName);
              const ll = normToLatLng(pt[0], pt[1], t.x, t.y, 14);
              placesIndex.push({ n: rd.n, c: t.city, t: 'via', lat: ll.lat, lng: ll.lng });
            }
          }
        }
        for (const poi of compact.poi) {
          if (poi.n && poi.p) {
            const kName = `${poi.n.toLowerCase()}_${t.city}`;
            if (!seenPlaces.has(kName) && poi.n.length >= 4) {
              seenPlaces.add(kName);
              const ll = normToLatLng(poi.p[0], poi.p[1], t.x, t.y, 14);
              placesIndex.push({ n: poi.n, c: t.city, t: poi.cls || 'poi', lat: ll.lat, lng: ll.lng });
            }
          }
        }
      }

      execSync(`npx.cmd wrangler r2 object put rotas-mapas-r2/tiles/${t.z}/${t.x}/${t.y}.json --file="${outPath}" --content-type=application/json --remote`, {
        stdio: 'ignore',
        env: process.env
      });
      ok++;
      if (ok % 10 === 0 || ok === tilesMap.size) {
        console.log(`  [${ok}/${tilesMap.size}] R2 seeded (index atual: ${placesIndex.length} ruas/POIs)`);
      }
    } catch (e) {
      console.error(`  Err ${key}:`, e.message);
    }
  }

  // Salva e sobe o Índice Soberano de Ruas & POIs para o R2
  const indexPath = path.join(TEMP_DIR, 'places-index.json');
  fs.writeFileSync(indexPath, JSON.stringify(placesIndex), 'utf8');
  execSync(`npx.cmd wrangler r2 object put rotas-mapas-r2/geo/places-index.json --file="${indexPath}" --content-type=application/json --remote`, {
    stdio: 'ignore',
    env: process.env
  });

  // Também salva uma versão compacta local em places-index.js para fallback instantâneo no Worker
  const topPlaces = placesIndex.slice(0, 1500);
  fs.writeFileSync('C:\\Users\\Win10\\Documents\\rotas-pro\\places-index.js', `export const PLACES_INDEX_BR = ${JSON.stringify(topPlaces)};\n`, 'utf8');

  fs.rmSync(TEMP_DIR, { recursive: true, force: true });
  console.log(`Concluído! ${ok} tiles gravados no R2 + ${placesIndex.length} ruas/POIs indexados!`);
}

run();
