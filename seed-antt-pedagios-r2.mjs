/**
 * seed-antt-pedagios-r2.mjs
 * Baixa o catálogo oficial de Praças de Pedágio da ANTT (dados.antt.gov.br)
 * e grava em geo/pedagios-antt.json no R2 para enriquecer o mapa e a API de pedágios.
 */
import { r2Put } from './r2-s3.mjs';

const URL_ANTT = 'https://dados.antt.gov.br/dataset/a7e1e12d-f8e8-40cd-bc1f-57973a4a4a6d/resource/d400debd-8058-4971-9625-8b614b08cf9c/download/dados-dos-praas-de-pedgio.json';

const res = await fetch(URL_ANTT, { signal: AbortSignal.timeout(30000) });
if (!res.ok) throw new Error(`ANTT HTTP ${res.status}`);
const raw = await res.json();
const arr = Array.isArray(raw) ? raw : (raw.praca_de_pedagio || Object.values(raw)[0] || []);

const pracas = [];
for (const p of arr) {
  const lat = parseFloat(String(p.latitude || '').replace(',', '.'));
  const lng = parseFloat(String(p.longitude || '').replace(',', '.'));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
  if (String(p.situacao || '').toLowerCase().includes('inativ')) continue;
  pracas.push({
    nome: `Pedágio ${p.praca_de_pedagio || 'ANTT'} (${p.rodovia || ''} km ${p.km_m || ''})`.trim(),
    rodovia: p.rodovia || null,
    uf: p.uf || null,
    municipio: p.municipio || null,
    operador: p.concessionaria || null,
    km: p.km_m || null,
    sentido: p.sentido || null,
    lat: Number(lat.toFixed(6)),
    lng: Number(lng.toFixed(6))
  });
}

await r2Put('geo/pedagios-antt.json', JSON.stringify(pracas));
console.log(`[antt] ${pracas.length} praças ativas gravadas em geo/pedagios-antt.json`);
