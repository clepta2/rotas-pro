/**
 * worker.js
 * Cloudflare Worker Anycast para Rotas & Mapas Pro API
 *
 * Inteligência Geodésica, Roteamento Urbano/Rodoviário, Tracking Ao Vivo (Uber/iFood),
 * Otimizador Multi-Paradas (TSP 2-Opt), Praças de Pedágio ANTT e Renderizador SVG.
 *
 * 100% Soberano (Zero Google Maps / Zero Mapbox / Zero Terceiros).
 *
 * @license MIT
 * @see https://github.com/clepta2/rotas-pro
 */

import { STYLES_CSS, HTML_INDEX, CLIENT_JS, OZPRO_MARK_SVG, MAPS_ENGINE_JS } from './site-assets.js';
import { rotearPorMalhaRealR2, deg2num } from './astar-routing.js';
import {
  geocodificarLocal,
  geocodificarReverso,
  calcularDistanciaHaversineKm,
  calcularRotaCompleta,
  otimizarRotaMultiParadas,
  calcularTrackingViagemAoVivo,
  renderizarMapaRotaSvg,
  calcularTelemetriaVelocidade,
  PRACAS_PEDAGIO_BRASIL
} from './rotas-pro.js';
import {
  lerShardSinal,
  elevacaoEm,
  perfilAltimetrico,
  dadosLocais,
  listarPedagiosMapa,
  enriquecerRotaComSinalizacao,
  calcularCicloSemaforico,
  SINAL_SHARD_Z
} from './sinalizacao.js';

let memLojasCache = null;

function gerarTileSinteticoLocal(z, x, y) {
  const seed = (Number(x) * 31 + Number(y) * 17 + Number(z)) % 97;
  const road = [];
  for (let i = 150; i <= 850; i += 200) {
    road.push({ c: [[[0, i], [1000, i + ((seed % 3) - 1) * 20]]], cls: i === 550 ? 'primary' : 'minor', ow: 0 });
    road.push({ c: [[[i, 0], [i + ((seed % 2) ? 15 : -15), 1000]]], cls: i === 350 ? 'secondary' : 'minor', ow: 0 });
  }
  return { water: [], park: [], building: [], road, poi: [], place: [], sintetico: true };
}

async function lerTileR2(env, z, x, y) {
  if (!env || !env.ROTAS_R2) return null;
  try {
    // Grafo leve derivado dos tiles HQ (cobertura ampla) com fallback para os tiles legados
    const rt = await env.ROTAS_R2.get(`rt/${z}/${x}/${y}.json`);
    if (rt) return await rt.json();
    const obj = await env.ROTAS_R2.get(`tiles/${z}/${x}/${y}.json`);
    if (obj) return await obj.json();
  } catch (_) {}
  return null;
}

async function enriquecerRotaComAStar(rota, env) {
  if (!rota || !rota.valido || !env || !env.ROTAS_R2) return rota;
  try {
    const astar = await rotearPorMalhaRealR2(rota.origem, rota.destino, (z, x, y) => lerTileR2(env, z, x, y));
    if (astar && astar.found && astar.waypoints.length >= 3) {
      rota.geometriaRota = {
        formato: 'GeoJSON_LineString_Compat',
        tipoRoteamento: 'malha_viaria_real_astar_R2',
        nodesGrafoAnalisados: astar.nodesGraph,
        totalWaypoints: astar.waypoints.length,
        waypoints: astar.waypoints
      };
      rota.resumoViagem.distanciaViariaKm = astar.distanciaRealKm;
      rota.resumoViagem.distanciaFormatada = `${astar.distanciaRealKm.toFixed(1).replace('.', ',')} km`;
      if (astar.viasAtravessadas && astar.viasAtravessadas.length > 0) {
        rota.viasPrincipaisNaRota = astar.viasAtravessadas;
        // Atualiza os passos turn-by-turn com os nomes reais das ruas atravessadas!
        const passos = rota.passoAPassoTurnByTurn || [];
        if (passos.length >= 3 && astar.viasAtravessadas[0]) {
          passos[1].instrucao = `Acesse ${astar.viasAtravessadas[0]} em direção ao trajeto principal`;
        }
        if (passos.length >= 4 && astar.viasAtravessadas[1]) {
          passos[2].instrucao = `Siga por ${astar.viasAtravessadas.slice(1, 3).join(' → ')}`;
        }
      }
    } else {
      rota.geometriaRota.tipoRoteamento = 'geodesico_calibrado';
    }
  } catch (_) {}
  return rota;
}

const CAPITAIS_E_POLOS_BR = [
  { nome: 'São Paulo', lat: -23.5505, lng: -46.6333, cap: true },
  { nome: 'Rio de Janeiro', lat: -22.9068, lng: -43.1729, cap: true },
  { nome: 'Brasília', lat: -15.7942, lng: -47.8825, cap: true },
  { nome: 'Salvador', lat: -12.9714, lng: -38.5014, cap: true },
  { nome: 'Fortaleza', lat: -3.7172, lng: -38.5433, cap: true },
  { nome: 'Belo Horizonte', lat: -19.9167, lng: -43.9345, cap: true },
  { nome: 'Manaus', lat: -3.1190, lng: -60.0217, cap: true },
  { nome: 'Curitiba', lat: -25.4284, lng: -49.2733, cap: true },
  { nome: 'Recife', lat: -8.0476, lng: -34.8770, cap: true },
  { nome: 'Goiânia', lat: -16.6869, lng: -49.2648, cap: true },
  { nome: 'Belém', lat: -1.4558, lng: -48.4902, cap: true },
  { nome: 'Porto Alegre', lat: -30.0346, lng: -51.2177, cap: true },
  { nome: 'Guarulhos', lat: -23.4538, lng: -46.5333, cap: false },
  { nome: 'Campinas', lat: -22.9056, lng: -47.0608, cap: false },
  { nome: 'São Luís', lat: -2.5307, lng: -44.3068, cap: true },
  { nome: 'Maceió', lat: -9.6658, lng: -35.7350, cap: true },
  { nome: 'Natal', lat: -5.7945, lng: -35.2110, cap: true },
  { nome: 'Campo Grande', lat: -20.4697, lng: -54.6201, cap: true },
  { nome: 'Teresina', lat: -5.0892, lng: -42.8016, cap: true },
  { nome: 'João Pessoa', lat: -7.1195, lng: -34.8450, cap: true },
  { nome: 'Aracaju', lat: -10.9472, lng: -37.0731, cap: true },
  { nome: 'Cuiabá', lat: -15.6014, lng: -56.0979, cap: true },
  { nome: 'Florianópolis', lat: -27.5954, lng: -48.5480, cap: true },
  { nome: 'Vitória', lat: -20.3155, lng: -40.3128, cap: true },
  { nome: 'Porto Velho', lat: -8.7612, lng: -63.9004, cap: true },
  { nome: 'Macapá', lat: 0.0349, lng: -51.0694, cap: true },
  { nome: 'Rio Branco', lat: -9.9754, lng: -67.8249, cap: true },
  { nome: 'Boa Vista', lat: 2.8235, lng: -60.6758, cap: true },
  { nome: 'Palmas', lat: -10.1844, lng: -48.3336, cap: true },
  { nome: 'Santos', lat: -23.9678, lng: -46.3322, cap: false },
  { nome: 'Ribeirão Preto', lat: -21.1775, lng: -47.8103, cap: false },
  { nome: 'São José dos Campos', lat: -23.1791, lng: -45.8872, cap: false },
  { nome: 'Sorocaba', lat: -23.5015, lng: -47.4526, cap: false },
  { nome: 'Uberlândia', lat: -18.9186, lng: -48.2772, cap: false },
  { nome: 'Londrina', lat: -23.3045, lng: -51.1696, cap: false },
  { nome: 'Joinville', lat: -26.3045, lng: -48.8487, cap: false },
  { nome: 'Caxias do Sul', lat: -29.1678, lng: -51.1794, cap: false }
];

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key',
  'Access-Control-Max-Age': '86400',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Ponte-Version': '3.0.0'
};

const PLANOS_CONFIG = {
  free: { nome: 'Free / Sandbox', rpm: 60, cotaDiaria: 1000, prefixo: 'rot_free_' },
  starter: { nome: 'Starter', rpm: 300, cotaDiaria: 25000, prefixo: 'rot_start_' },
  pro: { nome: 'Pro', rpm: 1200, cotaDiaria: 150000, prefixo: 'rot_pro_' },
  business: { nome: 'Business Enterprise', rpm: 3000, cotaDiaria: 1000000, prefixo: 'rot_biz_' },
  master: { nome: 'Master Admin (Bypass)', rpm: 6000, cotaDiaria: Infinity, prefixo: 'rot_master_' }
};

const minuteBuckets = new Map();
const activeTripsStore = new Map();

function resolverPlano(request) {
  const auth = request.headers.get('Authorization') || '';
  const xKey = request.headers.get('x-api-key') || '';
  const url = new URL(request.url);
  const qKey = url.searchParams.get('key') || url.searchParams.get('api_key') || '';
  const token = (auth.startsWith('Bearer ') ? auth.slice(7) : (xKey || qKey)).trim();

  if (!token) {
    const ip = request.headers.get('cf-connecting-ip') || 'anonymous';
    return { plano: 'free', keyId: `ip_${ip}`, config: PLANOS_CONFIG.free };
  }
  if (token.startsWith('rot_master_') || token.startsWith('pnt_live_')) {
    return { plano: 'master', keyId: token, config: PLANOS_CONFIG.master };
  }
  if (token.startsWith('rot_biz_')) return { plano: 'business', keyId: token, config: PLANOS_CONFIG.business };
  if (token.startsWith('rot_pro_')) return { plano: 'pro', keyId: token, config: PLANOS_CONFIG.pro };
  return { plano: 'starter', keyId: token, config: PLANOS_CONFIG.starter };
}

function checkRateLimit(keyId, config) {
  const now = Date.now();
  let b = minuteBuckets.get(keyId);
  if (!b || now >= b.resetAt) {
    b = { count: 0, resetAt: now + 60000 };
    minuteBuckets.set(keyId, b);
  }
  if (b.count >= config.rpm) {
    return { ok: false, error: 'RATE_LIMIT_EXCEEDED', message: `Limite de ${config.rpm} RPM excedido.` };
  }
  b.count++;
  return { ok: true, remaining: Math.max(0, config.rpm - b.count) };
}

export default {
  async fetch(request, env, ctx) {
    const t0 = Date.now();
    const url = new URL(request.url);
    const pathname = url.pathname.replace(/\/+$/, '') || '/';

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const auth = resolverPlano(request);
    const rl = checkRateLimit(auth.keyId, auth.config);
    if (!rl.ok) {
      return new Response(JSON.stringify(rl, null, 2), {
        status: 429,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' }
      });
    }

    const jsonResp = (data, status = 200) => {
      const payload = {
        ...data,
        telemetria: {
          latencyMs: Date.now() - t0,
          edgePoP: request.cf ? request.cf.colo : 'ANYCAST',
          plano: auth.plano,
          limiteRestante: rl.remaining,
          timestamp: new Date().toISOString()
        }
      };
      return new Response(JSON.stringify(payload, null, 2), {
        status,
        headers: {
          ...CORS_HEADERS,
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'public, max-age=30'
        }
      });
    };

    // ── ASSETS ESTÁTICOS E CONSOLE OFICIAL ──
    if (pathname === '/styles.css' || pathname === '/ponte-suite.css') {
      return new Response(STYLES_CSS, {
        headers: { ...CORS_HEADERS, 'Content-Type': 'text/css; charset=utf-8', 'Cache-Control': 'public, max-age=120' }
      });
    }
    if (pathname === '/brand/ozpro-mark.svg') {
      return new Response(OZPRO_MARK_SVG, {
        headers: { ...CORS_HEADERS, 'Content-Type': 'image/svg+xml; charset=utf-8', 'Cache-Control': 'public, max-age=86400' }
      });
    }
    if (pathname === '/rotas-pro.js') {
      return new Response(CLIENT_JS, {
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/javascript; charset=utf-8' }
      });
    }
    if (pathname === '/ponte-maps-engine.js') {
      return new Response(MAPS_ENGINE_JS, {
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'public, max-age=300' }
      });
    }

    // ── CAMADA DE TILES VETORIAIS SOBERANOS (100% R2 + FALLBACK LOCAL DETERMINÍSTICO, ZERO TERCEIROS) ──
    if (pathname.startsWith('/api/mapas/tiles/') && pathname.endsWith('.json')) {
      const cleanPath = pathname.replace('/api/mapas/tiles/', '').replace('.json', '');
      const parts = cleanPath.split('/');
      if (parts.length === 3) {
        const [z, x, y] = parts;
        const r2Key = `tiles/${z}/${x}/${y}.json`;

        // 1. Checa Cache API do PoP Cloudflare (0 leituras R2)
        const cache = caches.default;
        const cachedResp = await cache.match(request);
        if (cachedResp) return cachedResp;

        // 2. Checa Bucket R2 Soberano (rotas-mapas-r2)
        if (env && env.ROTAS_R2) {
          const obj = await env.ROTAS_R2.get(r2Key);
          if (obj) {
            const body = await obj.text();
            const resp = new Response(body, {
              status: 200,
              headers: {
                ...CORS_HEADERS,
                'Content-Type': 'application/json; charset=utf-8',
                'Cache-Control': 'public, max-age=604800, s-maxage=2592000',
                'X-Ponte-Tile-Source': 'R2-Sovereign-Cache'
              }
            });
            ctx.waitUntil(cache.put(request, resp.clone()));
            return resp;
          }
        }

        // 3. Fallback Sintético Local Determinístico (Zero chamadas externas!)
        const synthTile = gerarTileSinteticoLocal(z, x, y);
        return new Response(JSON.stringify(synthTile), {
          status: 200,
          headers: {
            ...CORS_HEADERS,
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'public, max-age=86400',
            'X-Ponte-Tile-Source': 'Local-Deterministic-Fallback'
          }
        });
      }
    }

    // ── TILES VETORIAIS DE ALTA FIDELIDADE (HQ v2, gzip no R2 → descompressão nativa no navegador) ──
    if (pathname === '/api/mapas/hq/index.json') {
      let idx = { tiles: {} };
      if (env && env.ROTAS_R2) {
        try {
          const obj = await env.ROTAS_R2.get('hq/index.json');
          if (obj) idx = await obj.json();
        } catch (_) {}
      }
      return new Response(JSON.stringify(idx), {
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=1800' }
      });
    }

    if (pathname.startsWith('/api/mapas/hq/') && pathname.endsWith('.json')) {
      const parts = pathname.replace('/api/mapas/hq/', '').replace('.json', '').split('/').map((n) => parseInt(n, 10));
      if (parts.length === 3 && parts.every((n) => Number.isFinite(n) && n >= 0)) {
        const [z, x, y] = parts;
        const cache = caches.default;
        const hit = await cache.match(request);
        if (hit) return hit;
        if (env && env.ROTAS_R2) {
          const obj = await env.ROTAS_R2.get(`hq/${z}/${x}/${y}.json`);
          if (obj) {
            const resp = new Response(obj.body, {
              status: 200,
              headers: {
                ...CORS_HEADERS,
                'Content-Type': 'application/json; charset=utf-8',
                'Content-Encoding': 'gzip',
                'Cache-Control': 'public, max-age=604800, s-maxage=2592000',
                'X-Ponte-Tile-Source': 'R2-HQ-v2'
              }
            });
            ctx.waitUntil(cache.put(request, resp.clone()));
            return resp;
          }
        }
        return new Response(null, { status: 204, headers: { ...CORS_HEADERS, 'Cache-Control': 'public, max-age=3600' } });
      }
    }

    // ── TOPOGRAFIA: GRADE DE ELEVAÇÃO 128x128 Int16 (R2, imutável → cache longo) ──
    if (pathname.startsWith('/api/mapas/terreno/') && pathname.endsWith('.bin')) {
      const parts = pathname.replace('/api/mapas/terreno/', '').replace('.bin', '').split('/').map((n) => parseInt(n, 10));
      if (parts.length === 3 && parts.every((n) => Number.isFinite(n) && n >= 0)) {
        const [z, x, y] = parts;
        const binHeaders = {
          ...CORS_HEADERS,
          'Content-Type': 'application/octet-stream',
          'Cache-Control': 'public, max-age=2592000, immutable'
        };
        const cache = caches.default;
        const hit = await cache.match(request);
        if (hit) return hit;
        if (env && env.ROTAS_R2) {
          const obj = await env.ROTAS_R2.get(`terrain/${z}/${x}/${y}.bin`);
          if (obj) {
            // Entrega a grade gzip com Content-Encoding: o navegador descomprime nativamente
            const resp = new Response(obj.body, {
              status: 200,
              encodeBody: 'manual',
              headers: { ...binHeaders, 'Content-Encoding': 'gzip', 'X-Ponte-Terrain': 'R2' }
            });
            ctx.waitUntil(cache.put(request, resp.clone()));
            return resp;
          }
        }
        return new Response(null, { status: 204, headers: { ...binHeaders, 'Cache-Control': 'public, max-age=86400' } });
      }
    }

    if (pathname === '/api/mapas/terreno/index.json') {
      let idx = { tiles: {} };
      if (env && env.ROTAS_R2) {
        try {
          const obj = await env.ROTAS_R2.get('terrain/index.json');
          if (obj) idx = await obj.json();
        } catch (_) {}
      }
      return new Response(JSON.stringify(idx), {
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=3600' }
      });
    }

    // ── ELEVAÇÃO PONTUAL OU PERFIL ALTIMÉTRICO (?pontos=lat,lng;lat,lng...) ──
    if (pathname === '/api/mapas/elevacao') {
      const pontosStr = url.searchParams.get('pontos');
      if (pontosStr) {
        const pontos = pontosStr.split(';').slice(0, 200).map((s) => {
          const [la, ln] = s.split(',').map(Number);
          return { lat: la, lng: ln };
        }).filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
        if (pontos.length < 2) return jsonResp({ valido: false, erro: 'Informe ao menos 2 pontos lat,lng separados por ;' }, 400);
        const perfil = await perfilAltimetrico(env, pontos, Math.min(128, pontos.length));
        return jsonResp({ valido: true, ...perfil });
      }
      const lat = parseFloat(url.searchParams.get('lat'));
      const lng = parseFloat(url.searchParams.get('lng'));
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return jsonResp({ valido: false, erro: 'Parâmetros lat e lng obrigatórios' }, 400);
      }
      const e = await elevacaoEm(env, lat, lng);
      return jsonResp({
        valido: Boolean(e),
        coordenadas: { lat, lng },
        altitudeM: e ? e.m : null,
        resolucaoZoom: e ? e.z : null,
        fonte: 'SRTM/GMTED (R2 soberano)'
      }, e ? 200 : 404);
    }

    // ── SINALIZAÇÃO VIÁRIA POR CÉLULA z12: SEMÁFOROS, RADARES, LOMBADAS E LIMITES DE VELOCIDADE ──
    if (pathname.startsWith('/api/mapas/sinalizacao/') && pathname.endsWith('.json')) {
      const parts = pathname.replace('/api/mapas/sinalizacao/', '').replace('.json', '').split('/').map((n) => parseInt(n, 10));
      if (parts.length === 2 && parts.every((n) => Number.isFinite(n) && n >= 0)) {
        const cache = caches.default;
        const hit = await cache.match(request);
        if (hit) return hit;
        const data = await lerShardSinal(env, parts[0], parts[1]);
        const resp = new Response(JSON.stringify(data), {
          headers: {
            ...CORS_HEADERS,
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'public, max-age=604800',
            'X-Ponte-Shard-Zoom': String(SINAL_SHARD_Z)
          }
        });
        ctx.waitUntil(cache.put(request, resp.clone()));
        return resp;
      }
    }

    // ── DADOS LOCAIS DE UM PONTO: LIMITE DA VIA, RADARES, SEMÁFOROS, ALTITUDE E PEDÁGIO MAIS PRÓXIMO ──
    if (pathname === '/api/mapas/dados-locais') {
      const lat = parseFloat(url.searchParams.get('lat'));
      const lng = parseFloat(url.searchParams.get('lng'));
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return jsonResp({ valido: false, erro: 'Parâmetros lat e lng obrigatórios' }, 400);
      }
      return jsonResp(await dadosLocais(env, lat, lng));
    }

    // ── CICLO SEMAFÓRICO EM TEMPO REAL (TEMPO RESTANTE VERDE / AMARELO / VERMELHO) ──
    if (pathname === '/api/mapas/semaforos/tempo') {
      const lat = parseFloat(url.searchParams.get('lat'));
      const lng = parseFloat(url.searchParams.get('lng'));
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return jsonResp({ valido: false, erro: 'Parâmetros lat e lng obrigatórios' }, 400);
      }
      return jsonResp({
        valido: true,
        coordenadas: { lat, lng },
        cicloSemaforico: calcularCicloSemaforico(lat, lng)
      });
    }

    // ── TELEMETRIA DE VELOCIDADE REAL / GPS PARA MODAIS (A PÉ, BIKE, MOTO, CARRO) ──
    if (pathname === '/api/rotas/velocidade') {
      const lat = parseFloat(url.searchParams.get('lat'));
      const lng = parseFloat(url.searchParams.get('lng'));
      const modal = url.searchParams.get('modal') || 'carro';
      const velGpsRaw = url.searchParams.get('velocidadeGps') || url.searchParams.get('speed');
      const velGps = velGpsRaw !== null && velGpsRaw !== undefined ? parseFloat(velGpsRaw) : null;

      let limiteKmh = 50;
      let viaInfo = null;
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        try {
          const loc = await dadosLocais(env, lat, lng);
          if (loc && loc.limiteVelocidade && loc.limiteVelocidade.kmh) {
            limiteKmh = loc.limiteVelocidade.kmh;
            viaInfo = loc.limiteVelocidade.via;
          }
        } catch (_) {}
      }

      const telemetria = calcularTelemetriaVelocidade({
        modal,
        limiteKmh,
        velocidadeGps: velGps
      });

      return jsonResp({
        ...telemetria,
        viaNome: viaInfo,
        coordenadas: Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null
      });
    }

    // ── PRAÇAS DE PEDÁGIO PARA O MAPA (TABELA ANTT COM TARIFAS + PRAÇAS OSM NACIONAIS) ──
    if (pathname === '/api/mapas/pedagios') {
      const lista = await listarPedagiosMapa(env);
      return new Response(JSON.stringify({ valido: true, total: lista.length, pracas: lista }), {
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=86400' }
      });
    }

    // ── BUSCA / AUTOCOMPLETE SOBERANO DE RUAS, POIS E CIDADES (R2 INDEX) ──
    if (pathname === '/api/rotas/buscar') {
      const q = (url.searchParams.get('q') || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (q.length < 2) {
        return jsonResp({ valido: true, resultados: [] });
      }
      let results = [];
      if (env && env.ROTAS_R2) {
        try {
          const idxObj = await env.ROTAS_R2.get('geo/places-index.json');
          if (idxObj) {
            const allPlaces = await idxObj.json();
            for (const item of allPlaces) {
              const normN = item.n.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
              if (normN.includes(q)) {
                results.push(item);
                if (results.length >= 12) break;
              }
            }
          }
        } catch (_) {}
      }
      if (results.length === 0) {
        const g = geocodificarLocal(url.searchParams.get('q'));
        if (g.valido) {
          results.push({ n: g.rotulo, c: g.cidade, t: g.tipoResolvido, lat: g.lat, lng: g.lng });
        }
      }
      return jsonResp({ valido: true, query: q, total: results.length, resultados: results });
    }

    // ── CAMADA DE LOJAS & COMÉRCIOS ATIVOS SHARDED POR CÉLULA z12 (ESCALA PARA MILHÕES DE EMPRESAS NO R2) ──
    if (pathname === '/api/rotas/lojas') {
      const lat = parseFloat(url.searchParams.get('lat') || '-23.5614');
      const lng = parseFloat(url.searchParams.get('lng') || '-46.6558');
      const raioKm = Math.min(20, Math.max(0.2, parseFloat(url.searchParams.get('raioKm') || '2.5')));
      const categoria = (url.searchParams.get('categoria') || 'todas').toLowerCase().trim();
      const q = (url.searchParams.get('q') || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const limite = Math.min(300, Math.max(1, parseInt(url.searchParams.get('limite') || '150', 10)));

      // 1. Calcula células z12 que cobrem o ponto + vizinhança imediata (máx 4 shards)
      const centerT = deg2num(lat, lng, 12);
      const shardCoords = [
        { x: centerT.x, y: centerT.y },
        { x: centerT.x + 1, y: centerT.y },
        { x: centerT.x - 1, y: centerT.y },
        { x: centerT.x, y: centerT.y + 1 },
        { x: centerT.x, y: centerT.y - 1 }
      ];

      let baseLojas = [];
      let totalShardsLidos = 0;

      if (env && env.ROTAS_R2) {
        const shardPromises = shardCoords.map(async (sc) => {
          try {
            const obj = await env.ROTAS_R2.get(`stores/12/${sc.x}/${sc.y}.json`);
            if (obj) {
              totalShardsLidos++;
              return await obj.json();
            }
          } catch (_) {}
          return [];
        });
        const arrays = await Promise.all(shardPromises);
        for (const arr of arrays) {
          if (Array.isArray(arr) && arr.length) baseLojas.push(...arr);
        }

        // Fallback para geo/lojas-ativas.json se não houver shard z12 na região
        if (baseLojas.length === 0) {
          if (!memLojasCache) {
            try {
              const obj = await env.ROTAS_R2.get('geo/lojas-ativas.json');
              if (obj) memLojasCache = await obj.json();
            } catch (_) {}
          }
          if (Array.isArray(memLojasCache)) baseLojas = memLojasCache;
        }
      }

      const filtradas = [];
      const dLatMax = raioKm / 111.0;
      const dLngMax = raioKm / 95.0;

      for (const lj of baseLojas) {
        if (Math.abs(lj.lat - lat) > dLatMax || Math.abs(lj.lng - lng) > dLngMax) continue;
        if (categoria !== 'todas' && lj.cat !== categoria) continue;
        if (q) {
          const normN = lj.n.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
          if (!normN.includes(q)) continue;
        }
        const dist = calcularDistanciaHaversineKm(lat, lng, lj.lat, lj.lng);
        if (dist <= raioKm) {
          filtradas.push({
            id: lj.id,
            nome: lj.n,
            categoria: lj.cat,
            subcategoria: lj.sub,
            cidade: lj.c,
            lat: lj.lat,
            lng: lj.lng,
            cnpj: lj.cnpj || null,
            cnae: lj.cnae || null,
            endereco: lj.end || null,
            cep: lj.cep || null,
            telefone: lj.tel || null,
            situacaoPresumida: 'ATIVA',
            distanciaKm: Number(dist.toFixed(2)),
            distanciaMetros: Math.round(dist * 1000),
            tempoAPeMin: Math.max(1, Math.round((dist / 4.5) * 60)),
            tempoMotoMin: Math.max(1, Math.round((dist / 32.0) * 60)),
            cnpjProBuscaUrl: lj.cnpj
              ? `https://cnpj-pro-api.maputo3.workers.dev/api/cnpj/${lj.cnpj}`
              : `https://cnpj-pro-api.maputo3.workers.dev/api/cnpj/busca?q=${encodeURIComponent(lj.n)}`
          });
        }
      }

      filtradas.sort((a, b) => a.distanciaKm - b.distanciaKm);
      const sliced = filtradas.slice(0, limite);

      return jsonResp({
        valido: true,
        centro: { lat, lng },
        raioKm,
        categoria,
        arquitetura: totalShardsLidos > 0 ? 'R2_Sharded_z12' : 'R2_Global_Fallback',
        shardsLidos: totalShardsLidos,
        lojasAnalisadasNaCelula: baseLojas.length,
        totalEncontradasNoRaio: filtradas.length,
        exibindo: sliced.length,
        lojas: sliced
      });
    }

    // ── CAMADAS NACIONAIS DO BRASIL (IBGE UFs + RIOS + RODOVIAS + MANCHAS URBANAS DO R2) ──
    if (pathname === '/api/mapas/camadas/brasil.json') {
      const cache = caches.default;
      const cached = await cache.match(request);
      if (cached) return cached;

      let ufs = [], roads = [], rivers = [], urban = [];
      if (env && env.ROTAS_R2) {
        const [oUfs, oRoads, oRivers, oUrban] = await Promise.all([
          env.ROTAS_R2.get('geo/br-ufs.json'),
          env.ROTAS_R2.get('geo/br-roads.json'),
          env.ROTAS_R2.get('geo/br-rivers.json'),
          env.ROTAS_R2.get('geo/br-urban.json')
        ]);
        if (oUfs) ufs = await oUfs.json();
        if (oRoads) roads = await oRoads.json();
        if (oRivers) rivers = await oRivers.json();
        if (oUrban) urban = await oUrban.json();
      }

      const payload = JSON.stringify({ ufs, roads, rivers, urban, cidades: CAPITAIS_E_POLOS_BR });
      const resp = new Response(payload, {
        status: 200,
        headers: {
          ...CORS_HEADERS,
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'public, max-age=604800, s-maxage=2592000'
        }
      });
      ctx.waitUntil(cache.put(request, resp.clone()));
      return resp;
    }

    // ── ROTA EMBED INTERATIVO (IFRAME PARA SITES DE CLIENTES) ──
    if (pathname === '/embed') {
      const orig = url.searchParams.get('origem') || '01310-100';
      const dest = url.searchParams.get('destino') || '04538-133';
      const tema = url.searchParams.get('tema') || 'dark';
      const embedHtml = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/><title>Ponte Maps Embed</title><style>html,body,#map-wrap{margin:0;padding:0;width:100%;height:100%;overflow:hidden;background:#0b1120;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;}</style></head><body><div id="map-wrap"><canvas id="ponte-canvas"></canvas></div><script type="module">import { PonteMapEngine } from '/ponte-maps-engine.js'; const engine = new PonteMapEngine(document.getElementById('ponte-canvas'), { theme: '${tema}', zoom: 13.5 }); fetch('/api/rotas/calcular?origem=${encodeURIComponent(orig)}&destino=${encodeURIComponent(dest)}').then(r=>r.json()).then(d=>{ if(d.valido) engine.setRoute(d, true); });</script></body></html>`;
      return new Response(embedHtml, {
        headers: { ...CORS_HEADERS, 'Content-Type': 'text/html; charset=utf-8' }
      });
    }

    const accept = request.headers.get('Accept') || '';
    if ((pathname === '/' || pathname === '/app') && !accept.includes('application/json')) {
      return new Response(HTML_INDEX, {
        headers: { ...CORS_HEADERS, 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=60' }
      });
    }

    if (pathname === '/health' || pathname === '/status') {
      return jsonResp({
        ok: true,
        servico: 'Rotas & Mapas Pro API Anycast',
        versao: '1.0.0',
        coberturaMunicipiosIbge: 5570,
        pracasPedagioMonitoradas: PRACAS_PEDAGIO_BRASIL.length
      });
    }

    // ── 1. ROTA: CALCULAR ROTA COMPLETA (URBANA / RODOVIÁRIA / PEDÁGIOS / COMBUSTÍVEL / PIX) ──
    if (pathname === '/api/rotas/calcular' || pathname === '/api/rotas') {
      let params = {
        origem: url.searchParams.get('origem') || '01310-100',
        destino: url.searchParams.get('destino') || '04538-133',
        modal: url.searchParams.get('modal') || 'carro',
        placa: url.searchParams.get('placa') || '',
        eixos: url.searchParams.get('eixos') || '3'
      };
      if (request.method === 'POST') {
        try {
          const body = await request.json();
          params = { ...params, ...body };
        } catch (_) {}
      }
      const res = calcularRotaCompleta(params);
      await enriquecerRotaComAStar(res, env);
      await enriquecerRotaComSinalizacao(res, env);
      return jsonResp(res, res.valido ? 200 : 400);
    }

    // ── 2. ROTA: TRACKING AO VIVO EM TEMPO REAL (ESTILO UBER / IFOOD) ──
    if (pathname === '/api/rotas/tracking') {
      let params = {
        origem: url.searchParams.get('origem') || '01310-100',
        destino: url.searchParams.get('destino') || '04538-133',
        modal: url.searchParams.get('modal') || 'carro',
        placa: url.searchParams.get('placa') || 'BRA2E19',
        progresso: url.searchParams.get('progresso') || '45',
        motorista: url.searchParams.get('motorista') || undefined
      };
      if (request.method === 'POST') {
        try {
          const body = await request.json();
          params = { ...params, ...body };
        } catch (_) {}
      }
      const res = calcularTrackingViagemAoVivo(params);
      if (res.valido && res.rotaBase) {
        await enriquecerRotaComAStar(res.rotaBase, env);
        await enriquecerRotaComSinalizacao(res.rotaBase, env);
      }
      return jsonResp(res, res.valido ? 200 : 400);
    }

    // ── 3. ROTA: RENDERIZADOR DE MAPA VETORIAL SVG (PARA TAG <IMG> OU EMBED) ──
    if (pathname === '/api/rotas/mapa.svg' || pathname === '/api/rotas/mapa-svg') {
      const params = {
        origem: url.searchParams.get('origem') || '01310-100',
        destino: url.searchParams.get('destino') || '04538-133',
        modal: url.searchParams.get('modal') || 'carro',
        placa: url.searchParams.get('placa') || 'BRA2E19',
        progresso: url.searchParams.get('progresso') || '45',
        tema: url.searchParams.get('tema') || 'dark'
      };
      const svg = renderizarMapaRotaSvg(params);
      return new Response(svg, {
        status: 200,
        headers: {
          ...CORS_HEADERS,
          'Content-Type': 'image/svg+xml; charset=utf-8',
          'Cache-Control': 'public, max-age=30'
        }
      });
    }

    // ── 4. ROTA: OTIMIZADOR DE ENTREGAS MULTI-PARADAS (TSP 2-OPT) ──
    if (pathname === '/api/rotas/otimizar') {
      let origem = url.searchParams.get('origem') || '01310-100';
      let paradasStr = url.searchParams.get('paradas') || '04626-911,01001-000,04571-010,04094-050';
      let paradas = paradasStr.split(',').map((s) => s.trim()).filter(Boolean);
      let retornarOrigem = url.searchParams.get('retornarOrigem') !== 'false';
      let modal = url.searchParams.get('modal') || 'moto';

      if (request.method === 'POST') {
        try {
          const body = await request.json();
          if (body.origem) origem = body.origem;
          if (Array.isArray(body.paradas)) paradas = body.paradas;
          if (body.retornarOrigem !== undefined) retornarOrigem = Boolean(body.retornarOrigem);
          if (body.modal) modal = body.modal;
        } catch (_) {}
      }

      const res = otimizarRotaMultiParadas({ origem, paradas, retornarOrigem, modal });
      return jsonResp(res, res.valido ? 200 : 400);
    }

    // ── 5. ROTA: GEOCODIFICAÇÃO DIRETA & REVERSA (5.570 MUNICÍPIOS IBGE + DNE) ──
    if (pathname === '/api/rotas/geocoding/reverso') {
      const lat = url.searchParams.get('lat') || '-23.5614';
      const lng = url.searchParams.get('lng') || '-46.6558';
      const res = geocodificarReverso(lat, lng);
      return jsonResp(res, res.valido ? 200 : 400);
    }

    if (pathname === '/api/rotas/geocoding') {
      const q = url.searchParams.get('q') || url.searchParams.get('local') || '01310-100';
      const res = geocodificarLocal(q);
      return jsonResp(res, res.valido ? 200 : 400);
    }

    // ── 6. ROTA: CRIAR E CONSULTAR SESSÃO DE VIAGEM AO VIVO (INTERPOLAÇÃO POR TIMESTAMP) ──
    if (pathname === '/api/rotas/viagem/criar') {
      let body = {};
      if (request.method === 'POST') {
        try { body = await request.json(); } catch (_) {}
      }
      const origem = body.origem || url.searchParams.get('origem') || '01310-100';
      const destino = body.destino || url.searchParams.get('destino') || '04538-133';
      const modal = body.modal || url.searchParams.get('modal') || 'moto';
      const placa = body.placa || url.searchParams.get('placa') || 'BRA2E19';
      const duracaoSegundos = parseInt(body.duracaoSegundos || url.searchParams.get('duracaoSegundos') || '300', 10);

      const id = `trp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
      const tripObj = {
        id,
        origem,
        destino,
        modal,
        placa,
        createdAt: Date.now(),
        duracaoMs: Math.max(30, duracaoSegundos) * 1000
      };
      activeTripsStore.set(id, tripObj);

      const trackingInicial = calcularTrackingViagemAoVivo({ origem, destino, modal, placa, progresso: 0, viagemId: id });
      return jsonResp({
        criada: true,
        viagemId: id,
        trackingUrl: `/api/rotas/viagem/${id}`,
        mapaSvgUrl: `/api/rotas/viagem/${id}/mapa.svg`,
        estadoInicial: trackingInicial
      });
    }

    if (pathname.startsWith('/api/rotas/viagem/')) {
      const partes = pathname.replace('/api/rotas/viagem/', '').split('/');
      const id = partes[0];
      const isSvg = partes[1] === 'mapa.svg';
      const trip = activeTripsStore.get(id);

      let prog = 50;
      let params = { origem: '01310-100', destino: '04538-133', modal: 'moto', placa: 'BRA2E19', viagemId: id };
      if (trip) {
        const elapsed = Date.now() - trip.createdAt;
        prog = Math.min(100, Math.round((elapsed / trip.duracaoMs) * 100));
        params = { ...trip, progresso: prog, viagemId: id };
      } else {
        params.progresso = prog;
      }

      if (isSvg) {
        const svg = renderizarMapaRotaSvg(params);
        return new Response(svg, {
          status: 200,
          headers: { ...CORS_HEADERS, 'Content-Type': 'image/svg+xml; charset=utf-8' }
        });
      }
      return jsonResp(calcularTrackingViagemAoVivo(params));
    }

    // ── 7. ROTA: LISTA DE PRAÇAS DE PEDÁGIO DO BRASIL ──
    if (pathname === '/api/rotas/pedagios') {
      const uf = (url.searchParams.get('uf') || '').toUpperCase().trim();
      const lista = uf ? PRACAS_PEDAGIO_BRASIL.filter((p) => p.uf === uf) : PRACAS_PEDAGIO_BRASIL;
      return jsonResp({ valido: true, total: lista.length, pracas: lista });
    }

    return jsonResp({
      erro: 'ROTA_NAO_ENCONTRADA',
      endpointsDisponiveis: [
        'GET /api/rotas/calcular?origem=01310-100&destino=04538-133&modal=moto&placa=BRA2E19',
        'GET /api/rotas/tracking?origem=01310-100&destino=04538-133&progresso=65',
        'GET /api/rotas/mapa.svg?origem=01310-100&destino=04538-133&progresso=65&tema=dark',
        'POST /api/rotas/otimizar',
        'GET /api/rotas/geocoding?q=01310-100',
        'GET /api/rotas/geocoding/reverso?lat=-23.5614&lng=-46.6558',
        'POST /api/rotas/viagem/criar',
        'GET /api/rotas/pedagios',
        'GET /api/mapas/pedagios',
        'GET /api/mapas/elevacao?lat=-23.5614&lng=-46.6558',
        'GET /api/mapas/elevacao?pontos=-23.56,-46.65;-23.60,-46.70',
        'GET /api/mapas/dados-locais?lat=-23.5614&lng=-46.6558',
        'GET /api/mapas/sinalizacao/{x}/{y}.json (célula z12)',
        'GET /api/mapas/terreno/{z}/{x}/{y}.bin (grade Int16 128x128)'
      ]
    }, 404);
  }
};
