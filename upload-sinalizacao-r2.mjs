/**
 * upload-sinalizacao-r2.mjs
 * Envia ao R2 os shards de sinalização gerados por osm-extract-sinalizacao.mjs
 * (sinal/12/{x}/{y}.json, sinal/manifest.json e geo/pedagios-osm.json) com concorrência limitada.
 *
 * Uso: node upload-sinalizacao-r2.mjs [dirSaida]
 */
import fs from 'fs';
import path from 'path';
import { r2PutMany } from './r2-s3.mjs';

const OUT = process.argv[2] || 'C:\\Users\\Win10\\Documents\\osm-data\\out';
const items = [];
const base = path.join(OUT, 'sinal', '12');
for (const x of fs.readdirSync(base)) {
  for (const f of fs.readdirSync(path.join(base, x))) {
    items.push({ key: `sinal/12/${x}/${f}`, body: fs.readFileSync(path.join(base, x, f)) });
  }
}
items.push({ key: 'sinal/manifest.json', body: fs.readFileSync(path.join(OUT, 'sinal', 'manifest.json')) });
items.push({ key: 'geo/pedagios-osm.json', body: fs.readFileSync(path.join(OUT, 'geo', 'pedagios-osm.json')) });

console.log(`[upload] ${items.length} objetos`);
const t0 = Date.now();
await r2PutMany(items, 16, (d, t) => console.log(`  ${d}/${t} (${((Date.now() - t0) / 1000).toFixed(0)}s)`));
console.log(`[upload] OK em ${((Date.now() - t0) / 1000).toFixed(0)}s`);
