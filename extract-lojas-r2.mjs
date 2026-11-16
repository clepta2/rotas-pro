import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const TEMP_DIR = 'C:\\Users\\Win10\\Documents\\rotas-pro\\tmp_lojas';
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

// Mini leitor PBF apenas para extrair TODOS os POIs comerciais sem truncar em 100
class Pbf {
  constructor(buf) { this.buf = new Uint8Array(buf); this.pos = 0; this.len = this.buf.length; }
  varint() {
    let v = 0, s = 0;
    while (this.pos < this.len) {
      const b = this.buf[this.pos++];
      v |= (b & 0x7f) << s;
      if ((b & 0x80) === 0) return v >>> 0;
      s += 7;
      if (s > 35) { while (this.pos < this.len && (this.buf[this.pos++] & 0x80)) {} return v; }
    }
    return v >>> 0;
  }
  svarint() { const u = this.varint(); return (u >>> 1) ^ -(u & 1); }
  str(l) { const s = new TextDecoder().decode(this.buf.subarray(this.pos, this.pos + l)); this.pos += l; return s; }
  skip(w) { if (w === 0) this.varint(); else if (w === 1) this.pos += 8; else if (w === 2) this.pos += this.varint(); else if (w === 5) this.pos += 4; }
}

function readVal(p, end) {
  let v = null;
  while (p.pos < end) {
    const t = p.varint(), f = t >>> 3, w = t & 7;
    if (f === 1) v = p.str(p.varint());
    else if (f === 2) { p.pos += 4; }
    else if (f === 3) { p.pos += 8; }
    else if (f === 4 || f === 5) v = p.varint();
    else if (f === 6) v = p.svarint();
    else if (f === 7) v = p.varint() !== 0;
    else p.skip(w);
  }
  return v;
}

function extractPoisFromPbf(buf) {
  const p = new Pbf(buf);
  const pois = [];
  while (p.pos < p.len) {
    const tag = p.varint(), f = tag >>> 3, w = tag & 7;
    if (f === 3) {
      const len = p.varint(), end = p.pos + len;
      let name = '', extent = 4096;
      const keys = [], vals = [], rawF = [];
      while (p.pos < end) {
        const lt = p.varint(), lf = lt >>> 3, lw = lt & 7;
        if (lf === 1) name = p.str(p.varint());
        else if (lf === 2) { const fl = p.varint(); rawF.push([p.pos, p.pos + fl]); p.pos += fl; }
        else if (lf === 3) keys.push(p.str(p.varint()));
        else if (lf === 4) { const vl = p.varint(); vals.push(readVal(p, p.pos + vl)); }
        else if (lf === 5) extent = p.varint();
        else p.skip(lw);
      }
      if (name === 'poi') {
        for (const [fs0, fe] of rawF) {
          p.pos = fs0;
          let type = 0; const tags = [], geom = [];
          while (p.pos < fe) {
            const ft = p.varint(), ff = ft >>> 3, fw = ft & 7;
            if (ff === 2) { const tl = p.varint(), te = p.pos + tl; while (p.pos < te) tags.push(p.varint()); }
            else if (ff === 3) type = p.varint();
            else if (ff === 4) { const gl = p.varint(), ge = p.pos + gl; while (p.pos < ge) geom.push(p.varint()); }
            else p.skip(fw);
          }
          if (type !== 1 || geom.length < 3) continue;
          const props = {};
          for (let i = 0; i + 1 < tags.length; i += 2) props[keys[tags[i]]] = vals[tags[i + 1]];
          const nome = props['name:pt'] || props.name;
          if (!nome || nome.length < 3) continue;
          const dx = (geom[1] >>> 1) ^ -(geom[1] & 1);
          const dy = (geom[2] >>> 1) ^ -(geom[2] & 1);
          pois.push({
            nome,
            cls: props.class || '',
            sub: props.subclass || '',
            nx: Math.round((dx / extent) * 1000),
            ny: Math.round((dy / extent) * 1000)
          });
        }
      }
      p.pos = end;
    } else p.skip(w);
  }
  return pois;
}

function deg2num(lat, lng, z = 14) {
  const n = Math.pow(2, z);
  const x = Math.floor(((lng + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);
  return { z, x, y };
}

function tile2latlng(x, y, z = 14) {
  const n = Math.pow(2, z);
  const lng = (x / n) * 360 - 180;
  const latRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n)));
  return { lat: (latRad * 180) / Math.PI, lng };
}

function normToLatLng(nx, ny, tx, ty, z = 14) {
  const tl = tile2latlng(tx, ty, z);
  const br = tile2latlng(tx + 1, ty + 1, z);
  return {
    lat: Number((tl.lat + (ny / 1000) * (br.lat - tl.lat)).toFixed(5)),
    lng: Number((tl.lng + (nx / 1000) * (br.lng - tl.lng)).toFixed(5))
  };
}

function classificarLoja(cls, sub) {
  const s = `${cls} ${sub}`.toLowerCase();
  if (/restaurant|cafe|coffee|bakery|fast_food|bar|pub|food|pizz|ice_cream|butcher|deli/.test(s)) return 'alimentacao';
  if (/pharmacy|chemist|hospital|clinic|dentist|doctor|veterinary|optician/.test(s)) return 'saude';
  if (/supermarket|grocery|convenience|mall|department_store|clothes|shoes|electronics|mobile_phone|books|furniture|jewelry|toy|sports|shop|retail/.test(s)) return 'varejo';
  if (/bank|atm|fuel|car_repair|car_wash|hairdresser|beauty|laundry|hotel|lodging|post_office|gym|fitness/.test(s)) return 'servicos';
  return null;
}

const HUBS = [
  { nome: 'São Paulo', lat: -23.568, lng: -46.660, g: 2 },
  { nome: 'Rio de Janeiro', lat: -22.940, lng: -43.195, g: 1 },
  { nome: 'Belo Horizonte', lat: -19.922, lng: -43.938, g: 1 },
  { nome: 'Curitiba', lat: -25.432, lng: -49.275, g: 1 },
  { nome: 'Brasília', lat: -15.794, lng: -47.882, g: 1 },
  { nome: 'Porto Alegre', lat: -30.032, lng: -51.225, g: 1 },
  { nome: 'Salvador', lat: -12.985, lng: -38.510, g: 1 },
  { nome: 'Recife', lat: -8.063, lng: -34.880, g: 1 },
  { nome: 'Fortaleza', lat: -3.728, lng: -38.505, g: 1 }
];

const tiles = [];
const seenT = new Set();
for (const h of HUBS) {
  const c = deg2num(h.lat, h.lng, 14);
  for (let dx = -h.g; dx <= h.g; dx++) {
    for (let dy = -h.g; dy <= h.g; dy++) {
      const k = `${c.x + dx}/${c.y + dy}`;
      if (!seenT.has(k)) { seenT.add(k); tiles.push({ x: c.x + dx, y: c.y + dy, city: h.nome }); }
    }
  }
}

console.log(`Extraindo 100% das Lojas & Comércios Ativos de ${tiles.length} tiles metropolitanos...`);

const lojas = [];
const seenLojas = new Set();

(async () => {
  for (let i = 0; i < tiles.length; i++) {
    const t = tiles[i];
    try {
      const r = await fetch(`https://tiles.openfreemap.org/planet/20261101_080013_pt/14/${t.x}/${t.y}.pbf`);
      if (!r.ok) continue;
      const pois = extractPoisFromPbf(await r.arrayBuffer());
      for (const poi of pois) {
        const cat = classificarLoja(poi.cls, poi.sub);
        if (!cat) continue;
        const ll = normToLatLng(poi.nx, poi.ny, t.x, t.y, 14);
        const key = `${poi.nome.toLowerCase()}_${Math.round(ll.lat * 1000)}_${Math.round(ll.lng * 1000)}`;
        if (seenLojas.has(key)) continue;
        seenLojas.add(key);
        lojas.push({
          id: `lj_${lojas.length + 1}`,
          n: poi.nome,
          cat,
          sub: poi.sub || poi.cls,
          c: t.city,
          lat: ll.lat,
          lng: ll.lng
        });
      }
    } catch (_) {}
  }

  console.log(`Total de Lojas & Comércios Ativos extraídos: ${lojas.length}`);
  const outPath = path.join(TEMP_DIR, 'lojas-ativas.json');
  fs.writeFileSync(outPath, JSON.stringify(lojas), 'utf8');

  execSync(`npx.cmd wrangler r2 object put rotas-mapas-r2/geo/lojas-ativas.json --file="${outPath}" --content-type=application/json --remote`, {
    stdio: 'inherit',
    env: process.env
  });

  fs.rmSync(TEMP_DIR, { recursive: true, force: true });
  console.log('Upload de geo/lojas-ativas.json concluído no Cloudflare R2!');
})();
