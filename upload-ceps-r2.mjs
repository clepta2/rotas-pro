import fs from 'fs';
import path from 'path';
import { r2PutMany } from './r2-s3.mjs';

const BASE = 'C:\\Users\\Win10\\Documents\\osm-data\\cep-out\\12';
const items = [];
for (const x of fs.readdirSync(BASE)) {
  for (const f of fs.readdirSync(path.join(BASE, x))) {
    items.push({ key: `cep/12/${x}/${f}`, body: fs.readFileSync(path.join(BASE, x, f)) });
  }
}
console.log(`[cep-upload] ${items.length} shards`);
const t0 = Date.now();
await r2PutMany(items, 20, (d, t) => console.log(`  ${d}/${t} (${((Date.now() - t0) / 1000).toFixed(0)}s)`));
console.log(`[cep-upload] OK em ${((Date.now() - t0) / 1000).toFixed(0)}s`);
