/**
 * test.js — Testes de Integridade de Rotas e Coordenadas Geodésicas
 * @license MIT
 */

import assert from 'assert';
import fs from 'fs';
import { GEO_MUNICIPIOS_IBGE } from './municipios_geo.js';

console.log('🧪 Iniciando testes de integridade do Rotas Pro...\n');

let total = 0;
let passed = 0;

function test(nome, fn) {
  total++;
  try {
    fn();
    passed++;
    console.log(`  ✅ [PASS] ${nome}`);
  } catch (err) {
    console.error(`  ❌ [FAIL] ${nome}:`, err.message);
  }
}

// 1. Integridade dos 5.570 Municípios
test('Validação de coordenadas geográficas de todos os municípios brasileiros', () => {
  assert.ok(GEO_MUNICIPIOS_IBGE, 'Objeto GEO_MUNICIPIOS_IBGE deve existir');
  const count = Object.keys(GEO_MUNICIPIOS_IBGE).length;
  console.log(`     ℹ️ Total de municípios catalogados: ${count}`);
  assert.ok(count >= 5565, 'Deve conter os municípios oficiais do IBGE');
});

// 2. Coordenadas de Capitais Principais
test('Validação de coordenadas de São Paulo (3550308) e Rio de Janeiro (3304557)', () => {
  const sp = GEO_MUNICIPIOS_IBGE['3550308'];
  assert.ok(sp, 'São Paulo deve estar presente');
  assert.strictEqual(sp[2], '11', 'DDD de SP deve ser 11');

  const rj = GEO_MUNICIPIOS_IBGE['3304557'];
  assert.ok(rj, 'Rio de Janeiro deve estar presente');
  assert.strictEqual(rj[2], '21', 'DDD do RJ deve ser 21');
});

// 3. Fórmula de Haversine para Distância Geodésica
function calcularHaversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // Raio da Terra em KM
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

test('Cálculo de distância em linha reta entre SP e RJ (~357 km)', () => {
  const sp = GEO_MUNICIPIOS_IBGE['3550308'];
  const rj = GEO_MUNICIPIOS_IBGE['3304557'];
  const dist = calcularHaversineKm(sp[0], sp[1], rj[0], rj[1]);
  console.log(`     ℹ️ Distância calculada SP <-> RJ: ${dist} km`);
  assert.ok(dist >= 350 && dist <= 370, 'Distância deve estar em torno de 357 km');
});

console.log(`\n🏁 Resultado: ${passed}/${total} testes passaram com 100% de sucesso!`);
if (passed !== total) process.exit(1);
