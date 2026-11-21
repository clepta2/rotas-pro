import {
  calcularDistanciaHaversineKm,
  calcularBearingGraus,
  geocodificarLocal,
  geocodificarReverso,
  calcularRotaCompleta,
  otimizarRotaMultiParadas,
  calcularTrackingViagemAoVivo,
  renderizarMapaRotaSvg,
  gerarWaypointsMalhaViaria,
  suavizarCurvasEsquinas,
  aplicarOffsetMaoDireita,
  calcularTelemetriaVelocidade,
  detectarPontesViadutosNaRota,
  detectarRotatoriasNaRota,
  gerarArcoRotatoria,
  gerarRotasAlternativas,
  diagnosticarPlacaNaRota,
  ajustarGpsNaMalhaViaria
} from './rotas-pro.js';
import { calcularCicloSemaforico } from './sinalizacao.js';
import { GEO_MUNICIPIOS_IBGE } from './municipios_geo.js';
import { resumirCoberturaViewport } from './ponte-maps-engine.js';
import { enriquecerRotaComAStar } from './worker.js';

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

console.log('\n8. Topografia, Sinalização Viária e Pedágios (R2 simulado em memória):');
{
  const { gzipSync } = await import('zlib');
  const sinal = await import('./sinalizacao.js');
  const store = new Map();
  const tileOf = (lat, lng, z) => {
    const n = 2 ** z;
    const fx = ((lng + 180) / 360) * n;
    const lr = (lat * Math.PI) / 180;
    const fy = ((1 - Math.log(Math.tan(lr) + 1 / Math.cos(lr)) / Math.PI) / 2) * n;
    return { x: Math.floor(fx), y: Math.floor(fy) };
  };
  // Rampa de 700 m → 900 m de oeste para leste no tile z12 da Paulista
  const tz = tileOf(-23.5614, -46.6558, 12);
  const grid = new Int16Array(128 * 128);
  for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) grid[y * 128 + x] = 700 + Math.round((x / 127) * 200);
  store.set(`terrain/12/${tz.x}/${tz.y}.bin`, gzipSync(Buffer.from(grid.buffer)));
  store.set(`sinal/12/${tz.x}/${tz.y}.json`, JSON.stringify({
    s: [[-23.5614, -46.6560], [-23.5620, -46.6550]],
    r: [[-23.5612, -46.6555, 50]],
    l: [[-23.5615, -46.6557]],
    v: [[50, 3, 'Avenida Paulista', [-23.5600, -46.6580, -23.5630, -46.6530]]]
  }));
  store.set('geo/pedagios-osm.json', JSON.stringify([[-23.0, -47.0, 'Praça Teste', 'Concessionária X', 'SP-348']]));
  const env = {
    ROTAS_R2: {
      async get(k) {
        if (!store.has(k)) return null;
        const v = store.get(k);
        const buf = Buffer.isBuffer(v) ? v : Buffer.from(v, 'utf8');
        return { body: new Response(buf).body, json: async () => JSON.parse(buf.toString('utf8')) };
      }
    }
  };

  const e = await sinal.elevacaoEm(env, -23.5614, -46.6558);
  assert(e && e.m >= 700 && e.m <= 900 && e.z === 12, `Elevação deve vir da grade z12 do R2 (${e && e.m} m)`);
  const semR2 = await sinal.elevacaoEm({}, -10.5, -50.5);
  assert(semR2 === null, 'Sem R2 a elevação deve degradar para null sem lançar erro');

  const dl = await sinal.dadosLocais(env, -23.5614, -46.6558);
  assert(dl.limiteVelocidade && dl.limiteVelocidade.kmh === 50, 'Dados locais devem retornar limite 50 km/h da via mapeada');
  assert(dl.radaresProximos.length === 1 && dl.radaresProximos[0].limiteKmh === 50, 'Dados locais devem listar o radar próximo com limite');
  assert(dl.semaforosRaio400m === 2 && dl.lombadasRaio400m === 1, 'Dados locais devem contar semáforos e lombadas no raio');

  const ped = await sinal.listarPedagiosMapa(env);
  assert(ped.some((p) => p.fonte === 'tabela_antt' && p.tarifaCarro > 0) && ped.some((p) => p.fonte === 'osm'), 'Pedágios do mapa devem mesclar tabela ANTT (com tarifa) e praças OSM');

  const rota = {
    valido: true,
    resumoViagem: { distanciaViariaKm: 0.6 },
    geometriaRota: { waypoints: [{ lat: -23.5600, lng: -46.6580 }, { lat: -23.5614, lng: -46.6556 }, { lat: -23.5630, lng: -46.6530 }] }
  };
  await sinal.enriquecerRotaComSinalizacao(rota, env);
  assert(rota.sinalizacaoRota && rota.sinalizacaoRota.totalRadares === 1, 'Rota deve detectar o radar sobre o trajeto');
  assert(rota.sinalizacaoRota.trechosLimiteVelocidade[0].kmh === 50 && rota.sinalizacaoRota.trechosLimiteVelocidade[0].fonte === 'placa_osm', 'Rota deve usar a placa OSM como limite do trecho');
  assert(rota.perfilAltimetrico && rota.perfilAltimetrico.disponivel && rota.perfilAltimetrico.ganhoElevacaoM > 0, 'Rota deve ter perfil altimétrico com ganho de elevação');
}

console.log('\n9. Suavização de Curvas, Mão de Direção, Ciclos Semafóricos e Telemetria de Velocidade:');
{
  const coberturaTeste = resumirCoberturaViewport({
    lat: 0,
    lng: 0,
    zoom: 2,
    width: 256,
    height: 256,
    tileZoom: 2,
    index: { 2: new Set(['2/2']), 1: new Set(['0/0']) },
    fallbackZooms: [1]
  });
  assert(coberturaTeste.status === 'ready' && coberturaTeste.total === 4, 'Cobertura do viewport deve contar os tiles intersectados pelo enquadramento');
  assert(coberturaTeste.native === 1 && coberturaTeste.fallback === 1 && coberturaTeste.missing === 2, 'Cobertura deve separar tiles nativos, ancestrais e ausentes');
  assert(coberturaTeste.percent === 50, 'Percentual deve incluir tiles cobertos por fallback ancestral');

  const rotaSemR2 = {
    valido: true,
    origem: { lat: -23.56, lng: -46.65 },
    destino: { lat: -23.57, lng: -46.66 },
    geometriaRota: { waypoints: [{ lat: -23.56, lng: -46.65 }, { lat: -23.57, lng: -46.66 }] }
  };
  await enriquecerRotaComAStar(rotaSemR2, {});
  assert(rotaSemR2.qualidadeRoteamento?.nivel === 'aproximado', 'Rota sem binding R2 deve ser marcada como aproximada');
  assert(rotaSemR2.qualidadeRoteamento?.confiavel === false, 'Rota aproximada não deve ser apresentada como caminho viário confirmado');

  const rotaComFalhaR2 = {
    valido: true,
    origem: { lat: -23.56, lng: -46.65 },
    destino: { lat: -23.57, lng: -46.66 },
    geometriaRota: { waypoints: [{ lat: -23.56, lng: -46.65 }, { lat: -23.57, lng: -46.66 }] }
  };
  await enriquecerRotaComAStar(rotaComFalhaR2, { ROTAS_R2: { get: async () => { throw new Error('R2 indisponível'); } } });
  assert(rotaComFalhaR2.qualidadeRoteamento?.motivo === 'ERRO_ASTAR', 'Falha ao consultar os tiles deve permanecer distinta de ausência de dados');

  // Teste de Suavização de Esquinas (Bézier viário 90 graus)
  const quina90 = [
    { lat: -23.5600, lng: -46.6600 },
    { lat: -23.5600, lng: -46.6500 },
    { lat: -23.5700, lng: -46.6500 }
  ];
  const suave = suavizarCurvasEsquinas(quina90, 14, 3);
  assert(suave.length > quina90.length, `Suavização deve inserir pontos de concordância Bézier (gerados: ${suave.length})`);
  assert(suave[0].lat === quina90[0].lat && suave[suave.length - 1].lat === quina90[2].lat, 'Extremidades devem ser preservadas');

  // Teste de Mão Direita (Offset perpendicular)
  const maoDireita = aplicarOffsetMaoDireita(suave, 2.5);
  assert(maoDireita.length === suave.length, 'Offset de mão direita deve manter a quantidade de waypoints');
  assert(maoDireita[1].lat !== suave[1].lat || maoDireita[1].lng !== suave[1].lng, 'Pontos devem ter deslocamento lateral na pista');

  // Teste do Ciclo Semafórico
  const semCiclo = calcularCicloSemaforico(-23.5614, -46.6560);
  assert(['VERDE', 'AMARELO', 'VERMELHO'].includes(semCiclo.estado), `Estado do semáforo deve ser válido (${semCiclo.estado})`);
  assert(semCiclo.tempoRestanteSegundos > 0, `Tempo restante do semáforo deve ser positivo (${semCiclo.tempoRestanteSegundos}s)`);
  assert(semCiclo.cicloTotalSegundos >= 60, `Ciclo total compatível CONTRAN (${semCiclo.cicloTotalSegundos}s)`);

  // Teste de Telemetria de Velocidade por Modal
  const velCarro = calcularTelemetriaVelocidade({ modal: 'carro', limiteKmh: 60, velocidadeGps: 58 });
  assert(velCarro.valido && velCarro.velocidadeInstantaneaKmh === 58, 'Velocidade do carro deve refletir o valor informado');
  assert(velCarro.statusSeguranca === 'VELOCIDADE_SEGURA', 'Status de segurança deve indicar velocidade segura');

  const velExcesso = calcularTelemetriaVelocidade({ modal: 'moto', limiteKmh: 50, velocidadeGps: 65 });
  assert(velExcesso.excessoVelocidade === true, 'Deve alertar excesso de velocidade acima de 50 km/h');
  assert(velExcesso.autuavel === true, 'Deve classificar como autuável acima da margem de tolerância do radar');

  // Teste de Corredores Arteriais Estruturais Urbanos
  const rotaUrbana = gerarWaypointsMalhaViaria(
    { lat: -23.5614, lng: -46.6558 },
    { lat: -23.5869, lng: -46.6822 }
  );
  assert(rotaUrbana.length >= 10, 'Rota urbana estrutural Paulista -> Faria Lima deve conter waypoints arteriais detalhados');
  assert(rotaUrbana[0].lat === -23.5614 && rotaUrbana[0].lng === -46.6558, 'Origem deve ser preservada');
  assert(rotaUrbana[rotaUrbana.length - 1].lat === -23.5869 && rotaUrbana[rotaUrbana.length - 1].lng === -46.6822, 'Destino deve ser preservado');

  // Teste de Pontes, Viadutos, Gabarito Vertical e Placas Pro Caminhão
  const infoCaminhao = diagnosticarPlacaNaRota('CAM2026');
  assert(infoCaminhao.especificacoesFisicas.ehVeiculoPesado === true, 'CAM2026 deve ser identificado como veículo pesado');
  assert(infoCaminhao.especificacoesFisicas.alturaTotalMetros === 4.40, 'CAM2026 deve ter altura regulamentar de 4.40m');

  const pontesRota = detectarPontesViadutosNaRota(rotaUrbana, infoCaminhao.especificacoesFisicas.alturaTotalMetros);
  assert(Array.isArray(pontesRota.pontesNaRota), 'Deve retornar array de pontes no trajeto');
  assert(typeof pontesRota.alertaGabarito === 'boolean', 'Deve avaliar alerta de gabarito vertical de pontes');

  // Teste de Bloqueio Automático de Gabarito para Caminhão de 4.40m em Viaduto Baixo
  const rotaComViadutoBaixo = [
    { lat: -23.5240, lng: -46.6780, progresso: 50 },
    { lat: -23.5250, lng: -46.6780, progresso: 51 }
  ];
  const bloqueio = detectarPontesViadutosNaRota(rotaComViadutoBaixo, 4.40);
  assert(bloqueio.alertaGabarito === true, 'Caminhão de 4.40m deve ser bloqueado em viaduto de 4.10m');
  assert(bloqueio.statusGabaritoGeral === 'VIOLACAO_GABARITO_ALTURA_PONTE', 'Status deve indicar violação de gabarito');

  // Teste de Rotas Alternativas
  const rotasAlts = gerarRotasAlternativas(
    { lat: -23.5614, lng: -46.6558 },
    { lat: -23.5869, lng: -46.6822 },
    rotaUrbana,
    'carro',
    1.50
  );
  assert(rotasAlts.length === 2, 'Deve gerar 2 rotas alternativas para opção de desvio');
  assert(rotasAlts[0].distanciaViariaKm > 0 && rotasAlts[1].distanciaViariaKm > 0, 'Rotas alternativas devem ter distâncias válidas');
  assert(rotasAlts[0].waypoints.length === rotaUrbana.length, 'Waypoints das rotas alternativas devem ser consistentes');

  // Teste de Snap to Road (Map Matching do GPS na Rua)
  const snap = ajustarGpsNaMalhaViaria(-23.5592, -46.6580, rotaUrbana, 60);
  assert(snap.valido === true, 'Snap-to-Road deve ser válido');
  assert(snap.snapped === true, 'GPS próximo da via deve fazer snap na rua');
  assert(snap.distanciaSnapMetros > 0 && snap.distanciaSnapMetros <= 60, 'Distância de snap deve ser coerente');
  assert(snap.pontoAjustadoNaRua.lat !== undefined && snap.pontoAjustadoNaRua.lng !== undefined, 'Deve retornar coordenadas corrigidas no asfalto');

  // Teste de Rotatórias (inclusive sobre canais) e Traçado sem Zigue-Zague
  const arcoRot = gerarArcoRotatoria({ lat: -23.9642, lng: -46.3331 }, 38, Math.PI, 0, 6);
  assert(arcoRot.length === 7 && arcoRot.every((p) => p.rotatoria === true), 'Arco de rotatória deve gerar pontos circulares suaves marcados como rotatória');

  const rotaSantosCanal = gerarWaypointsMalhaViaria(
    { lat: -23.9580, lng: -46.3331 },
    { lat: -23.9700, lng: -46.3331 }
  );
  const rotDetect = detectarRotatoriasNaRota(rotaSantosCanal);
  assert(rotDetect.totalRotatorias >= 1 && rotDetect.possuiRotatoriaSobreCanal === true, 'Deve detectar rotatória sobre canal em Santos (Canal 3)');

  // Rota longa fora de corredores (> 5 km) não pode gerar escada em zigue-zague
  const rotaLongaSemCorredor = gerarWaypointsMalhaViaria(
    { lat: -23.5000, lng: -46.7000 },
    { lat: -23.5500, lng: -46.6200 }
  );
  let inversoesSinal = 0;
  let prevSign = 0;
  for (let i = 1; i < rotaLongaSemCorredor.length - 1; i++) {
    const a = rotaLongaSemCorredor[i - 1];
    const b = rotaLongaSemCorredor[i];
    const c = rotaLongaSemCorredor[i + 1];
    const v1x = b.lng - a.lng; const v1y = b.lat - a.lat;
    const v2x = c.lng - b.lng; const v2y = c.lat - b.lat;
    const denom = Math.hypot(v1x, v1y) * Math.hypot(v2x, v2y);
    const sinTheta = denom > 0 ? (v1x * v2y - v1y * v2x) / denom : 0;
    if (Math.abs(sinTheta) > 0.05) {
      const sign = sinTheta > 0 ? 1 : -1;
      if (prevSign !== 0 && sign !== prevSign) inversoesSinal++;
      prevSign = sign;
    }
  }
  assert(inversoesSinal <= 2, `Rota longa fora de corredor não deve fazer zigue-zague em escada (inversões: ${inversoesSinal})`);

  // Teste de cobertura nacional de CEPs do interior e cobertura HQ multi-zoom
  const cepBauru = geocodificarLocal('17010-000');
  assert(cepBauru.valido && cepBauru.cidade === 'Bauru' && cepBauru.uf === 'SP', `CEP 17010-000 deve resolver para Bauru/SP (obtido: ${cepBauru.cidade}/${cepBauru.uf})`);
  const cepLondrina = geocodificarLocal('86010-000');
  assert(cepLondrina.valido && cepLondrina.cidade === 'Londrina' && cepLondrina.uf === 'PR', `CEP 86010-000 deve resolver para Londrina/PR (obtido: ${cepLondrina.cidade}/${cepLondrina.uf})`);
  const cepBoaVista = geocodificarLocal('69301-000');
  assert(cepBoaVista.valido && cepBoaVista.cidade === 'Boa Vista' && cepBoaVista.uf === 'RR', `CEP 69301-000 deve resolver para Boa Vista/RR (obtido: ${cepBoaVista.cidade}/${cepBoaVista.uf})`);
  const feira = geocodificarLocal('Feira de Santana-BA');
  assert(feira.valido && feira.uf === 'BA' && feira.lat > -13 && feira.lat < -11, `Feira de Santana-BA deve resolver para BA e não para Santana/SP (obtido: ${feira.cidade}/${feira.uf})`);
  const paulistaPe = geocodificarLocal('Paulista-PE');
  assert(paulistaPe.valido && paulistaPe.uf === 'PE' && paulistaPe.lat > -9 && paulistaPe.lat < -7, `Paulista-PE deve resolver para PE e não para Av. Paulista/SP (obtido: ${paulistaPe.cidade}/${paulistaPe.uf})`);
  const revLondrina = geocodificarReverso(-23.3045, -51.1696);
  assert(revLondrina.valido && revLondrina.cepEstimado.startsWith('860'), `Geocodificação reversa em Londrina/PR não deve retornar 80000-000 da capital (obtido: ${revLondrina.cepEstimado})`);
  const revMaringa = geocodificarReverso(-23.4205, -51.9333);
  assert(revMaringa.valido && revMaringa.cepEstimado.startsWith('870'), `Geocodificação reversa em Maringá/PR deve usar faixa 870xx (obtido: ${revMaringa.cepEstimado})`);

  const cobBrasil = resumirCoberturaViewport({
    lat: -22.3145,
    lng: -49.0587,
    zoom: 15.5,
    width: 800,
    height: 600,
    tileZoom: 14,
    index: { 14: new Set(), 10: new Set(['372/577']), 8: new Set(['93/144']) },
    fallbackZooms: [13, 12, 10, 8, 6]
  });
  assert(cobBrasil.percent === 100 && cobBrasil.fallback > 0, `Cobertura nacional deve usar fallback ancestral até z6/z8/z10 (${cobBrasil.percent}%)`);

  const { rotearRodoviarioNacionalR2 } = await import('./astar-routing.js');
  const hwMock = await rotearRodoviarioNacionalR2(
    { lat: -16.6869, lng: -49.2648 },
    { lat: -15.7942, lng: -47.8825 },
    async () => ({
      e: 4096,
      road: [{ k: 'motorway', c: [0, 4096, 2048, 2048, 4096, 0] }],
      name: [{ n: 'BR-060', c: [0, 4096, 4096, 0] }]
    })
  );
  assert(hwMock.found && hwMock.waypoints.length >= 3, 'Roteador rodoviário nacional A* deve conectar cidades via malha z8');
}

console.log('\n========================================');
console.log(`RESULTADO FINAL: ${passed} PASSOU | ${failed} FALHOU`);
console.log('========================================');
if (failed > 0) process.exit(1);
