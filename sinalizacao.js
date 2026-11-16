/**
 * sinalizacao.js
 * Camadas de Topografia, Sinalização Viária e Pedágios — Rotas & Mapas Pro (Worker Cloudflare)
 *
 * Dados 100% servidos do nosso R2 (rotas-mapas-r2), pré-processados offline:
 *   terrain/{z}/{x}/{y}.bin   → grade 128x128 Int16LE (metros) gzip (SRTM/GMTED)
 *   sinal/12/{x}/{y}.json     → { s: semáforos, r: radares, l: lombadas, v: vias com limite } (OSM/ODbL)
 *   geo/pedagios-osm.json     → praças de pedágio nacionais (OSM/ODbL)
 * Zero chamadas a terceiros em tempo de execução.
 */
import { PRACAS_PEDAGIO_BRASIL, calcularDistanciaHaversineKm } from './rotas-pro.js';

export const TERRAIN_GRID = 128;
export const SINAL_SHARD_Z = 12;
const TERRAIN_ZOOMS = [12, 10, 7];
const VAZIO_SINAL = Object.freeze({ s: [], r: [], l: [], v: [] });

// Limites genéricos do CTB (art. 61) quando a via não tem placa mapeada
export const CTB_LIMITE_POR_CLASSE = { 1: 110, 2: 80, 3: 60, 4: 50, 5: 40, 6: 40, 7: 30, 8: 20 };

const memTerrain = new Map();
const memSinal = new Map();
let memPedagios = null;

function lruSet(map, key, val, max) {
  if (map.size >= max) map.delete(map.keys().next().value);
  map.set(key, val);
}

function tileFrac(lat, lng, z) {
  const n = 2 ** z;
  const fx = ((lng + 180) / 360) * n;
  const latRad = (lat * Math.PI) / 180;
  const fy = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
  return { x: Math.floor(fx), y: Math.floor(fy), fx, fy };
}

// ── TOPOGRAFIA ──
export async function lerGradeTerreno(env, z, x, y) {
  const k = `${z}/${x}/${y}`;
  if (memTerrain.has(k)) return memTerrain.get(k);
  let grid = null;
  if (!env || !env.ROTAS_R2) return null;
  try {
    const obj = await env.ROTAS_R2.get(`terrain/${k}.bin`);
    if (obj) {
      const buf = await new Response(obj.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
      if (buf.byteLength === TERRAIN_GRID * TERRAIN_GRID * 2) grid = new Int16Array(buf);
    }
  } catch (_) {
    return null;
  }
  lruSet(memTerrain, k, grid, 48);
  return grid;
}

export function amostrarGrade(grid, fracX, fracY) {
  const G = TERRAIN_GRID;
  const gx = Math.max(0, Math.min(G - 1.001, fracX * G - 0.5));
  const gy = Math.max(0, Math.min(G - 1.001, fracY * G - 0.5));
  const x0 = Math.floor(gx); const y0 = Math.floor(gy);
  const tx = gx - x0; const ty = gy - y0;
  const a = grid[y0 * G + x0]; const b = grid[y0 * G + x0 + 1];
  const c = grid[(y0 + 1) * G + x0]; const d = grid[(y0 + 1) * G + x0 + 1];
  return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
}

export async function elevacaoEm(env, lat, lng, zooms = TERRAIN_ZOOMS) {
  for (const z of zooms) {
    const t = tileFrac(lat, lng, z);
    const grid = await lerGradeTerreno(env, z, t.x, t.y);
    if (grid) return { m: Math.round(amostrarGrade(grid, t.fx - t.x, t.fy - t.y)), z };
  }
  return null;
}

export async function perfilAltimetrico(env, pontos, maxAmostras = 64) {
  if (!Array.isArray(pontos) || pontos.length === 0) return null;
  const step = Math.max(1, (pontos.length - 1) / Math.max(1, maxAmostras - 1));
  const amostras = [];
  for (let i = 0; i < pontos.length; i += step) amostras.push(pontos[Math.round(i)]);
  if (amostras[amostras.length - 1] !== pontos[pontos.length - 1]) amostras.push(pontos[pontos.length - 1]);

  let spanKm = 0;
  for (let i = 1; i < pontos.length; i++) spanKm += calcularDistanciaHaversineKm(pontos[i - 1].lat, pontos[i - 1].lng, pontos[i].lat, pontos[i].lng);
  const zooms = spanKm > 120 ? [10, 7] : TERRAIN_ZOOMS;

  const elev = [];
  let distAcum = 0;
  for (let i = 0; i < amostras.length; i++) {
    const p = amostras[i];
    if (i > 0) distAcum += calcularDistanciaHaversineKm(amostras[i - 1].lat, amostras[i - 1].lng, p.lat, p.lng);
    const e = await elevacaoEm(env, p.lat, p.lng, zooms);
    elev.push({ km: Number(distAcum.toFixed(2)), m: e ? e.m : null });
  }
  const validos = elev.filter((e) => e.m !== null);
  if (validos.length < 2) return { disponivel: false, amostras: elev };

  let ganho = 0; let perda = 0;
  for (let i = 1; i < validos.length; i++) {
    const d = validos[i].m - validos[i - 1].m;
    if (d > 0) ganho += d; else perda -= d;
  }
  const ms = validos.map((e) => e.m);
  let maxRampa = 0;
  for (let i = 1; i < validos.length; i++) {
    const dKm = validos[i].km - validos[i - 1].km;
    if (dKm > 0.05) maxRampa = Math.max(maxRampa, Math.abs(validos[i].m - validos[i - 1].m) / (dKm * 10));
  }
  return {
    disponivel: true,
    fonte: 'SRTM/GMTED (R2 soberano)',
    altitudeMinM: Math.min(...ms),
    altitudeMaxM: Math.max(...ms),
    ganhoElevacaoM: Math.round(ganho),
    perdaElevacaoM: Math.round(perda),
    inclinacaoMaxPct: Number(maxRampa.toFixed(1)),
    amostras: elev
  };
}

// ── SINALIZAÇÃO VIÁRIA ──
export async function lerShardSinal(env, x, y) {
  const k = `${x}/${y}`;
  if (memSinal.has(k)) return memSinal.get(k);
  let data = VAZIO_SINAL;
  if (!env || !env.ROTAS_R2) return data;
  try {
    const obj = await env.ROTAS_R2.get(`sinal/${SINAL_SHARD_Z}/${k}.json`);
    if (obj) data = await obj.json();
  } catch (_) {
    return VAZIO_SINAL;
  }
  lruSet(memSinal, k, data, 32);
  return data;
}

// Distância aproximada (m) de P ao segmento AB em projeção equiretangular local
function distPontoSegM(plat, plng, alat, alng, blat, blng) {
  const kx = 111320 * Math.cos((plat * Math.PI) / 180);
  const ky = 110540;
  const ax = (alng - plng) * kx; const ay = (alat - plat) * ky;
  const bx = (blng - plng) * kx; const by = (blat - plat) * ky;
  const dx = bx - ax; const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? -(ax * dx + ay * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx; const cy = ay + t * dy;
  return Math.sqrt(cx * cx + cy * cy);
}

function viaMaisProxima(ways, lat, lng, maxM) {
  let best = null; let bestD = maxM;
  for (const w of ways) {
    const f = w[3];
    for (let i = 0; i + 3 < f.length; i += 2) {
      const d = distPontoSegM(lat, lng, f[i], f[i + 1], f[i + 2], f[i + 3]);
      if (d < bestD) { bestD = d; best = w; }
    }
  }
  return best ? { kmh: best[0], classe: best[1], via: best[2] || null, distM: Math.round(bestD) } : null;
}

export async function dadosLocais(env, lat, lng) {
  const t = tileFrac(lat, lng, SINAL_SHARD_Z);
  const [shard, elev] = await Promise.all([lerShardSinal(env, t.x, t.y), elevacaoEm(env, lat, lng)]);
  const raioKm = (arr, km) => arr
    .map((p) => ({ p, d: calcularDistanciaHaversineKm(lat, lng, p[0], p[1]) }))
    .filter((o) => o.d <= km)
    .sort((a, b) => a.d - b.d);

  const radares = raioKm(shard.r, 1.0).slice(0, 10).map((o) => ({
    lat: o.p[0], lng: o.p[1], limiteKmh: o.p[2] || null, distanciaM: Math.round(o.d * 1000)
  }));
  const semaforos = raioKm(shard.s, 0.4);
  const lombadas = raioKm(shard.l, 0.4);
  const via = viaMaisProxima(shard.v, lat, lng, 40);
  const pedagios = await listarPedagiosMapa(env);
  let pedagioMaisProximo = null;
  for (const p of pedagios) {
    const d = calcularDistanciaHaversineKm(lat, lng, p.lat, p.lng);
    if (!pedagioMaisProximo || d < pedagioMaisProximo.distanciaKm) pedagioMaisProximo = { ...p, distanciaKm: Number(d.toFixed(1)) };
  }

  return {
    valido: true,
    coordenadas: { lat, lng },
    altitudeM: elev ? elev.m : null,
    limiteVelocidade: via
      ? { kmh: via.kmh, via: via.via, fonte: 'placa_mapeada_osm', distanciaViaM: via.distM }
      : null,
    radaresProximos: radares,
    semaforosRaio400m: semaforos.length,
    semaforoMaisProximoM: semaforos.length ? Math.round(semaforos[0].d * 1000) : null,
    lombadasRaio400m: lombadas.length,
    pedagioMaisProximo,
    fonteDados: 'R2 soberano (OSM/ODbL + SRTM) — zero terceiros em tempo real'
  };
}

// ── PEDÁGIOS NACIONAIS (tabela ANTT com tarifas + praças OSM) ──
export async function listarPedagiosMapa(env) {
  if (memPedagios) return memPedagios;
  const lista = PRACAS_PEDAGIO_BRASIL.map((p) => ({
    id: p.id, nome: p.nome, rodovia: p.rodovia, uf: p.uf, lat: p.lat, lng: p.lng,
    tarifaCarro: p.tarifaCarro, tarifaMoto: p.tarifaMoto, tarifaEixoCaminhao: p.tarifaEixoCaminhao,
    fonte: 'tabela_antt'
  }));
  if (env && env.ROTAS_R2) {
    try {
      const obj = await env.ROTAS_R2.get('geo/pedagios-osm.json');
      if (obj) {
        const osm = await obj.json();
        for (const [lat, lng, nome, operador, ref] of osm) {
          const dup = lista.some((p) => Math.abs(p.lat - lat) < 0.03 && Math.abs(p.lng - lng) < 0.03);
          if (dup) continue;
          lista.push({
            id: `osm_${lat.toFixed(4)}_${lng.toFixed(4)}`,
            nome: nome || 'Praça de Pedágio',
            rodovia: ref || null,
            operador: operador || null,
            lat, lng,
            tarifaCarro: null, tarifaMoto: null, tarifaEixoCaminhao: null,
            fonte: 'osm'
          });
        }
      }
    } catch (_) {}
  }
  memPedagios = lista;
  return lista;
}

// ── ENRIQUECIMENTO DA ROTA: radares, semáforos, limites por trecho e perfil altimétrico ──
export async function enriquecerRotaComSinalizacao(rota, env) {
  const wps = rota && rota.geometriaRota && rota.geometriaRota.waypoints;
  if (!rota || !rota.valido || !Array.isArray(wps) || wps.length < 2 || !env || !env.ROTAS_R2) return rota;

  try {
    rota.perfilAltimetrico = await perfilAltimetrico(env, wps, 64);
  } catch (_) {}

  const distKm = Number(rota.resumoViagem && (rota.resumoViagem.distanciaViariaKm || rota.resumoViagem.distanciaKm)) || 0;
  const urbana = distKm > 0 && distKm <= 60;

  try {
    const cells = new Map();
    for (const p of wps) {
      const t = tileFrac(p.lat, p.lng, SINAL_SHARD_Z);
      cells.set(`${t.x}/${t.y}`, t);
      if (cells.size >= 14) break;
    }
    const shards = urbana ? await Promise.all([...cells.values()].map((t) => lerShardSinal(env, t.x, t.y))) : [];

    let minLat = Infinity; let maxLat = -Infinity; let minLng = Infinity; let maxLng = -Infinity;
    for (const p of wps) {
      if (p.lat < minLat) minLat = p.lat;
      if (p.lat > maxLat) maxLat = p.lat;
      if (p.lng < minLng) minLng = p.lng;
      if (p.lng > maxLng) maxLng = p.lng;
    }
    const m = 0.0006;
    const inBox = (lat, lng) => lat >= minLat - m && lat <= maxLat + m && lng >= minLng - m && lng <= maxLng + m;

    const cum = [0];
    for (let i = 1; i < wps.length; i++) cum.push(cum[i - 1] + calcularDistanciaHaversineKm(wps[i - 1].lat, wps[i - 1].lng, wps[i].lat, wps[i].lng));

    const projetarNaRota = (lat, lng, tolM) => {
      let best = -1; let bestD = tolM;
      for (let i = 0; i + 1 < wps.length; i++) {
        const d = distPontoSegM(lat, lng, wps[i].lat, wps[i].lng, wps[i + 1].lat, wps[i + 1].lng);
        if (d < bestD) { bestD = d; best = i; }
      }
      return best;
    };

    const radares = [];
    let semaforos = 0;
    let lombadas = 0;
    const semaforosPts = [];
    const ways = [];
    for (const sh of shards) {
      for (const r of sh.r) {
        if (!inBox(r[0], r[1])) continue;
        const idx = projetarNaRota(r[0], r[1], 35);
        if (idx >= 0) radares.push({ lat: r[0], lng: r[1], limiteKmh: r[2] || null, kmNaRota: Number(cum[idx].toFixed(2)), indiceWaypoint: idx });
      }
      for (const s of sh.s) {
        if (!inBox(s[0], s[1])) continue;
        if (projetarNaRota(s[0], s[1], 22) >= 0) { semaforos++; if (semaforosPts.length < 150) semaforosPts.push([s[0], s[1]]); }
      }
      for (const l of sh.l) {
        if (inBox(l[0], l[1]) && projetarNaRota(l[0], l[1], 18) >= 0) lombadas++;
      }
      for (const w of sh.v) {
        const f = w[3];
        for (let i = 0; i < f.length; i += 2) {
          if (inBox(f[i], f[i + 1])) { ways.push(w); break; }
        }
      }
    }
    radares.sort((a, b) => a.kmNaRota - b.kmNaRota);

    // Limite por trecho: placa OSM mais próxima de cada waypoint, senão CTB por tipo de via
    const padrao = urbana ? 50 : 100;
    const trechos = [];
    let last = null;
    for (let i = 0; i < wps.length; i++) {
      const v = ways.length ? viaMaisProxima(ways, wps[i].lat, wps[i].lng, 30) : null;
      const kmh = v ? v.kmh : (last ? last.kmh : padrao);
      const fonte = v ? 'placa_osm' : (last ? last.fonte : 'ctb_inferido');
      const via = v ? v.via : (last ? last.via : null);
      if (last && last.kmh === kmh && last.via === via) {
        last.ateIndice = i;
        last.ateKm = Number(cum[i].toFixed(2));
      } else {
        last = { deIndice: i, ateIndice: i, deKm: Number(cum[i].toFixed(2)), ateKm: Number(cum[i].toFixed(2)), kmh, via, fonte };
        trechos.push(last);
      }
    }

    const totalKm = cum[cum.length - 1] || 1;
    const fatorTempo = trechos.reduce((acc, t) => acc + ((t.ateKm - t.deKm) / Math.max(10, t.kmh)), 0);

    rota.sinalizacaoRota = {
      fonte: urbana ? 'OSM (ODbL) pré-processado no R2' : 'CTB inferido (rota rodoviária longa)',
      radares,
      totalRadares: radares.length,
      totalSemaforos: semaforos,
      semaforos: semaforosPts,
      totalLombadas: lombadas,
      trechosLimiteVelocidade: trechos,
      limiteMaximoKmh: Math.max(...trechos.map((t) => t.kmh)),
      tempoMinimoLegalMin: Math.round(fatorTempo * 60),
      extensaoAnalisadaKm: Number(totalKm.toFixed(2))
    };
  } catch (_) {}
  return rota;
}
