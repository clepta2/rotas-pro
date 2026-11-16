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

import { STYLES_CSS, HTML_INDEX, CLIENT_JS, OZPRO_MARK_SVG } from './site-assets.js';
import {
  geocodificarLocal,
  geocodificarReverso,
  calcularRotaCompleta,
  otimizarRotaMultiParadas,
  calcularTrackingViagemAoVivo,
  renderizarMapaRotaSvg,
  PRACAS_PEDAGIO_BRASIL
} from './rotas-pro.js';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key',
  'Access-Control-Max-Age': '86400'
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
        'GET /api/rotas/pedagios'
      ]
    }, 404);
  }
};
