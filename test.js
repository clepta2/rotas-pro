import {
  calcularDistanciaHaversineKm,
  calcularBearingGraus,
  geocodificarLocal,
  geocodificarReverso,
  calcularRotaCompleta,
  otimizarRotaMultiParadas,
  calcularTrackingViagemAoVivo,
  renderizarMapaRotaSvg
} from './rotas-pro.js';
import { GEO_MUNICIPIOS_IBGE } from './municipios_geo.js';

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) {
    console.log(`  ✓ ${msg}`);
    passed++;
  } else {
    console.error(`  ✗ FALHA: ${msg}`);
    failed++;
  }
}

console.log('=== TESTES UNITÁRIOS - ROTAS & MAPAS PRO (SOBERANIA GEODÉSICA & LOGÍSTICA) ===\n');

console.log('1. Módulo Geodésico & Base IBGE (5.570 Municípios):');
assert(Object.keys(GEO_MUNICIPIOS_IBGE).length >= 5565, 'Base IBGE deve conter os 5.570 municípios');
const distSpRj = calcularDistanciaHaversineKm(-23.5505, -46.6333, -22.9068, -43.1729);
assert(distSpRj > 350 && distSpRj < 370, `Distância linear SP <-> RJ deve ser ~358km (calculado: ${distSpRj.toFixed(1)}km)`);
const bearingSpRj = calcularBearingGraus(-23.5505, -46.6333, -22.9068, -43.1729);
assert(bearingSpRj >= 60 && bearingSpRj <= 85, `Azimute SP -> RJ deve apontar para Leste-Nordeste (${bearingSpRj}°)`);

console.log('\n2. Módulo de Geocodificação Soberana (CEP, Coordenadas, IBGE e Cidades):');
const geoPaulista = geocodificarLocal('01310-100');
assert(geoPaulista.valido === true, 'CEP 01310-100 deve ser válido');
assert(geoPaulista.logradouro.includes('Paulista'), 'CEP 01310-100 deve resolver para Avenida Paulista');
assert(geoPaulista.uf === 'SP', 'UF deve ser SP');

const geoAlias = geocodificarLocal('Aeroporto de Congonhas');
assert(geoAlias.valido === true && geoAlias.cep === '04626-911', 'Apelido Aeroporto de Congonhas deve resolver para CEP 04626-911');

const geoCidade = geocodificarLocal('Curitiba - PR');
assert(geoCidade.valido === true && geoCidade.uf === 'PR', 'Cidade Curitiba - PR deve resolver no catálogo IBGE');

const geoCoords = geocodificarLocal('-23.5869,-46.6822');
assert(geoCoords.valido === true && geoCoords.uf === 'SP', 'Coordenadas da Faria Lima devem resolver para SP');

console.log('\n3. Módulo de Geocodificação Reversa (GPS -> Endereço/Município):');
const revPaulista = geocodificarReverso(-23.5614, -46.6558);
assert(revPaulista.valido === true, 'Geocodificação reversa na Av. Paulista deve ser válida');
assert(revPaulista.cepEstimado === '01310-100', 'Deve retornar o CEP 01310-100 mais próximo');

const revCampinas = geocodificarReverso(-22.9056, -47.0608);
assert(revCampinas.valido === true && revCampinas.municipio === 'Campinas', 'Coordenada de Campinas deve identificar município de Campinas');

console.log('\n4. Cálculo de Rota Urbana (Delivery Moto / Uber) e Integrações:');
const rotaUrbana = calcularRotaCompleta({
  origem: '01310-100',
  destino: '04538-133',
  modal: 'moto',
  placa: 'BRA2E19'
});
assert(rotaUrbana.valido === true, 'Rota urbana Paulista -> Faria Lima deve ser válida');
assert(rotaUrbana.resumoViagem.distanciaViariaKm > 3 && rotaUrbana.resumoViagem.distanciaViariaKm < 12, `Distância viária urbana coerente (${rotaUrbana.resumoViagem.distanciaViariaKm} km)`);
assert(rotaUrbana.cotacoesCorridaEFrete.modalidades.uberX.valor > 8, 'Deve calcular tarifa UberX');
assert(rotaUrbana.cotacoesCorridaEFrete.modalidades.motoDeliveryIfood.valor > 6, 'Deve calcular tarifa iFood Moto');
assert(rotaUrbana.inteligenciaVeicularPlacasPro.placaValida === true, 'Deve integrar dados da placa BRA2E19 via Placas Pro');
assert(rotaUrbana.pagamentoPixIntegrado.pixCopiaECola.startsWith('000201'), 'Deve gerar payload Pix EMV válido para a corrida');
assert(rotaUrbana.passoAPassoTurnByTurn.length >= 3, 'Deve gerar instruções Turn-by-Turn');

console.log('\n5. Cálculo de Rota Rodoviária Interestadual & Detecção de Pedágios (Via Dutra SP -> RJ):');
const rotaDutra = calcularRotaCompleta({
  origem: '01310-100',
  destino: '20040-002',
  modal: 'caminhao',
  eixos: 4
});
assert(rotaDutra.valido === true, 'Rota rodoviária SP -> RJ deve ser válida');
assert(rotaDutra.tipoPercurso === 'rodoviario_interestadual', 'Deve classificar como percurso rodoviário interestadual');
assert(rotaDutra.pedagios.quantidadePracas >= 2, `Deve detectar praças de pedágio na Via Dutra (encontradas: ${rotaDutra.pedagios.quantidadePracas})`);
assert(rotaDutra.pedagios.custoTotalPedagios > 50, `Deve multiplicar tarifa de pedágio pelos 4 eixos do caminhão (R$ ${rotaDutra.pedagios.custoTotalPedagios})`);

console.log('\n6. Otimizador de Entregas Multi-Paradas (TSP 2-Opt):');
const tsp = otimizarRotaMultiParadas({
  origem: '01310-100',
  paradas: [
    '04626-911',
    '01001-000',
    '04538-133',
    '04094-050'
  ],
  retornarOrigem: true,
  modal: 'moto'
});
assert(tsp.valido === true, 'Otimização TSP deve ser válida');
assert(tsp.totalParadas === 4, 'Deve processar as 4 paradas');
assert(tsp.metricasOtimizacao.distanciaOtimizadaKm <= tsp.metricasOtimizacao.distanciaOrdemOriginalKm, 'Distância otimizada 2-Opt deve ser menor ou igual à ordem original bagunçada');
assert(tsp.sequenciaOtimizada.length === 4, 'Deve retornar a sequência exata de 4 entregas');

console.log('\n7. Tracking Ao Vivo (Simulador de Viagem em Tempo Real) & Mapa SVG:');
const track50 = calcularTrackingViagemAoVivo({
  origem: '01310-100',
  destino: '04626-911',
  progresso: 50,
  placa: 'BRA2E19'
});
assert(track50.valido === true, 'Tracking em 50% deve ser válido');
assert(track50.statusFase === 'EM_DESLOCAMENTO', 'Status em 50% deve ser EM_DESLOCAMENTO');
assert(track50.telemetriaVeiculo.distanciaRestanteKm > 0, 'Deve informar distância restante maior que zero');

const svgDark = renderizarMapaRotaSvg({
  origem: '01310-100',
  destino: '04538-133',
  progresso: 65,
  tema: 'dark',
  placa: 'BRA2E19'
});
assert(svgDark.includes('<svg') && svgDark.includes('BRA2E19'), 'Renderizador SVG deve produzir mapa vetorial contendo a placa e o veículo');
assert(svgDark.includes('PROGRESSO DA ENTREGA: 65%'), 'Renderizador SVG deve exibir barra de progresso em 65%');

console.log('\n========================================');
console.log(`RESULTADO FINAL: ${passed} PASSOU | ${failed} FALHOU`);
console.log('========================================');
if (failed > 0) process.exit(1);
