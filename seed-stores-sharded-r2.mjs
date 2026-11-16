import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const TEMP_DIR = 'C:\\Users\\Win10\\Documents\\rotas-pro\\tmp_sharded_stores';
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

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

function extractAllBusinessesFromPbf(buf) {
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
          if (!nome || nome.length < 2) continue;
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
  return { lat: (latRad * 180) / Math.PI, lng };
}

function normToLatLng(nx, ny, tx, ty, z) {
  const tl = tile2latlng(tx, ty, z);
  const br = tile2latlng(tx + 1, ty + 1, z);
  return {
    lat: Number((tl.lat + (ny / 1000) * (br.lat - tl.lat)).toFixed(5)),
    lng: Number((tl.lng + (nx / 1000) * (br.lng - tl.lng)).toFixed(5))
  };
}

function classificarEmpresa(cls, sub) {
  const s = `${cls} ${sub}`.toLowerCase();
  if (/tree|bench|waste|hydrant|bollard|street_lamp|crossing|bus_stop|traffic|bench|fountain|statue|memorial|monument/.test(s)) return null;
  if (/restaurant|cafe|coffee|bakery|fast_food|bar|pub|food|pizz|ice_cream|butcher|deli|bistro|beer/.test(s)) return 'alimentacao';
  if (/pharmacy|chemist|hospital|clinic|dentist|doctor|veterinary|optician|health/.test(s)) return 'saude';
  if (/supermarket|grocery|convenience|mall|department_store|clothes|shoes|electronics|mobile|books|furniture|jewelry|toy|sports|shop|retail|market|boutique|hardware|pet/.test(s)) return 'varejo';
  return 'servicos'; // Inclui escritórios, bancos, oficinas, academias, hotéis, escolas, postos, empresas B2B
}

const REGIOES = [
  { nome: 'São Paulo Capital', lat: -23.568, lng: -46.655, g: 3 },
  { nome: 'Grande ABC & Zona Leste', lat: -23.660, lng: -46.530, g: 2 },
  { nome: 'Guarulhos & Zona Norte', lat: -23.465, lng: -46.535, g: 1 },
  { nome: 'Osasco & Barueri (Alphaville)', lat: -23.515, lng: -46.835, g: 2 },
  { nome: 'Campinas', lat: -22.905, lng: -47.060, g: 2 },
  { nome: 'Santos & Litoral', lat: -23.965, lng: -46.332, g: 1 },
  { nome: 'Rio de Janeiro', lat: -22.935, lng: -43.210, g: 3 },
  { nome: 'Barra da Tijuca', lat: -23.000, lng: -43.365, g: 1 },
  { nome: 'Belo Horizonte', lat: -19.922, lng: -43.938, g: 2 },
  { nome: 'Curitiba', lat: -25.432, lng: -49.275, g: 2 },
  { nome: 'Brasília', lat: -15.794, lng: -47.882, g: 2 },
  { nome: 'Porto Alegre', lat: -30.032, lng: -51.225, g: 2 },
  { nome: 'Salvador', lat: -12.985, lng: -38.510, g: 2 },
  { nome: 'Recife', lat: -8.063, lng: -34.880, g: 2 },
  { nome: 'Fortaleza', lat: -3.728, lng: -38.505, g: 2 },
  { nome: 'Goiânia', lat: -16.686, lng: -49.264, g: 2 },
  { nome: 'Manaus', lat: -3.119, lng: -60.021, g: 1 },
  { nome: 'Belém', lat: -1.455, lng: -48.490, g: 1 },
  { nome: 'Florianópolis', lat: -27.595, lng: -48.548, g: 1 },
  { nome: 'Vitória', lat: -20.315, lng: -40.312, g: 1 },
  { nome: 'Ribeirão Preto', lat: -21.177, lng: -47.810, g: 1 }
];

const tiles14 = [];
const seenT = new Set();
for (const reg of REGIOES) {
  const c = deg2num(reg.lat, reg.lng, 14);
  for (let dx = -reg.g; dx <= reg.g; dx++) {
    for (let dy = -reg.g; dy <= reg.g; dy++) {
      const k = `${c.x + dx}/${c.y + dy}`;
      if (!seenT.has(k)) { seenT.add(k); tiles14.push({ x: c.x + dx, y: c.y + dy, city: reg.nome }); }
    }
  }
}

console.log(`Extraindo empresas e lojas sharded por célula z12 de ${tiles14.length} tiles z14 (${REGIOES.length} regiões)...`);

const shards12 = new Map(); // "x/y" -> []
const seenGlobal = new Set();
let totalEmpresas = 0;

async function processBatch(batch) {
  await Promise.all(batch.map(async (t) => {
    try {
      const r = await fetch(`https://tiles.openfreemap.org/planet/20261101_080013_pt/14/${t.x}/${t.y}.pbf`);
      if (!r.ok) return;
      const pois = extractAllBusinessesFromPbf(await r.arrayBuffer());
      for (const poi of pois) {
        const cat = classificarEmpresa(poi.cls, poi.sub);
        if (!cat) continue;
        const ll = normToLatLng(poi.nx, poi.ny, t.x, t.y, 14);
        const dedup = `${poi.nome.toLowerCase()}_${Math.round(ll.lat * 1500)}_${Math.round(ll.lng * 1500)}`;
        if (seenGlobal.has(dedup)) continue;
        seenGlobal.add(dedup);

        const s12 = deg2num(ll.lat, ll.lng, 12);
        const sKey = `${s12.x}/${s12.y}`;
        if (!shards12.has(sKey)) shards12.set(sKey, []);
        totalEmpresas++;
        shards12.get(sKey).push({
          id: `emp_${totalEmpresas}`,
          n: poi.nome,
          cat,
          sub: poi.sub || poi.cls || 'empresa',
          c: t.city,
          lat: ll.lat,
          lng: ll.lng
        });
      }
    } catch (_) {}
  }));
}

(async () => {
  for (let i = 0; i < tiles14.length; i += 10) {
    await processBatch(tiles14.slice(i, i + 10));
    if ((i + 10) % 50 === 0 || i + 10 >= tiles14.length) {
      console.log(`  Progresso extração: ${Math.min(i + 10, tiles14.length)}/${tiles14.length} tiles | Empresas acumuladas: ${totalEmpresas} em ${shards12.size} células z12`);
    }
  }

  console.log(`\nSubindo ${shards12.size} shards z12 para Cloudflare R2 (rotas-mapas-r2/stores/12/...)...`);
  let uploaded = 0;
  for (const [sKey, arr] of shards12) {
    const [sx, sy] = sKey.split('/');
    const fp = path.join(TEMP_DIR, `s12_${sx}_${sy}.json`);
    fs.writeFileSync(fp, JSON.stringify(arr), 'utf8');
    execSync(`npx.cmd wrangler r2 object put rotas-mapas-r2/stores/12/${sx}/${sy}.json --file="${fp}" --content-type=application/json --remote`, {
      stdio: 'ignore',
      env: process.env
    });
    uploaded++;
    if (uploaded % 15 === 0 || uploaded === shards12.size) {
      console.log(`  [${uploaded}/${shards12.size}] Shards z12 gravados no R2!`);
    }
  }

  fs.rmSync(TEMP_DIR, { recursive: true, force: true });
  console.log(`\nCONCLUÍDO! ${totalEmpresas} lojas e empresas ativas distribuídas em ${shards12.size} shards R2!`);
})();
