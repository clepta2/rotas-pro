/**
 * astar-routing.js
 * Motor de Roteamento Real por Grafo de Ruas (Algoritmo A* / A-Star)
 * Constrói o grafo viário diretamente a partir dos tiles vetoriais do nosso R2 soberano.
 * 100% Zero Terceiros (Zero OSRM externo, Zero Google Directions).
 */

import { calcularDistanciaHaversineKm, suavizarCurvasEsquinas, aplicarOffsetMaoDireita } from './rotas-pro.js';

export function deg2num(lat, lng, z = 14) {
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
    lat: tl.lat + (ny / 1000) * (br.lat - tl.lat),
    lng: tl.lng + (nx / 1000) * (br.lng - tl.lng)
  };
}

class MinHeap {
  constructor() { this.data = []; }
  push(item) {
    this.data.push(item);
    let i = this.data.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.data[p].f <= this.data[i].f) break;
      [this.data[p], this.data[i]] = [this.data[i], this.data[p]];
      i = p;
    }
  }
  pop() {
    if (this.data.length === 0) return null;
    const top = this.data[0];
    const last = this.data.pop();
    if (this.data.length > 0) {
      this.data[0] = last;
      let i = 0;
      const n = this.data.length;
      while (true) {
        let s = i;
        const l = 2 * i + 1;
        const r = 2 * i + 2;
        if (l < n && this.data[l].f < this.data[s].f) s = l;
        if (r < n && this.data[r].f < this.data[s].f) s = r;
        if (s === i) break;
        [this.data[i], this.data[s]] = [this.data[s], this.data[i]];
        i = s;
      }
    }
    return top;
  }
  get size() { return this.data.length; }
}

const ROAD_SPEED_WEIGHT = {
  motorway: 0.70,
  trunk: 0.78,
  primary: 0.85,
  secondary: 0.95,
  tertiary: 1.05,
  minor: 1.20,
  service: 1.35,
  residential: 1.20,
  living_street: 1.30,
  unclassified: 1.15
};

/**
 * Executa roteamento A* sobre os tiles vetoriais z14 reais armazenados no R2.
 */
export async function rotearPorMalhaRealR2(origem, destino, tileFetcher) {
  const distDiretaKm = calcularDistanciaHaversineKm(origem.lat, origem.lng, destino.lat, destino.lng);
  if (distDiretaKm > 25 || distDiretaKm < 0.05) {
    return { found: false, reason: 'OUT_OF_URBAN_RANGE' };
  }

  const tA = deg2num(origem.lat, origem.lng, 14);
  const tB = deg2num(destino.lat, destino.lng, 14);

  const minX = Math.min(tA.x, tB.x);
  const maxX = Math.max(tA.x, tB.x);
  const minY = Math.min(tA.y, tB.y);
  const maxY = Math.max(tA.y, tB.y);

  if ((maxX - minX + 1) * (maxY - minY + 1) > 9) {
    return { found: false, reason: 'TOO_MANY_TILES' };
  }

  const tilePromises = [];
  for (let tx = minX; tx <= maxX; tx++) {
    for (let ty = minY; ty <= maxY; ty++) {
      tilePromises.push(tileFetcher(14, tx, ty).then((tile) => ({ tx, ty, tile })));
    }
  }

  const loaded = await Promise.all(tilePromises);
  const validTiles = loaded.filter((t) => t.tile && Array.isArray(t.tile.road) && t.tile.road.length > 0);
  if (validTiles.length === 0) {
    return { found: false, reason: 'NO_TILES_IN_R2' };
  }

  // Constrói grafo arterial conectado (grade ~55m para unir cruzamentos reais de avenidas)
  const nodes = new Map();
  const roadLabels = [];

  const getOrCreateNode = (lat, lng) => {
    const key = `${Math.round(lat * 1800)}_${Math.round(lng * 1800)}`;
    let node = nodes.get(key);
    if (!node) {
      node = { id: key, lat, lng, edges: [] };
      nodes.set(key, node);
    }
    return node;
  };

  for (const { tx, ty, tile } of validTiles) {
    for (const rd of tile.road) {
      if (rd.n && rd.c[0] && rd.c[0].length > 0) {
        const midPt = rd.c[0][Math.floor(rd.c[0].length / 2)];
        const ll = normToLatLng(midPt[0], midPt[1], tx, ty, 14);
        roadLabels.push({ lat: ll.lat, lng: ll.lng, name: rd.n });
      }
      if (rd.lbl) continue;
      const weight = ROAD_SPEED_WEIGHT[rd.cls];
      if (!weight) continue;

      for (const ring of rd.c) {
        if (ring.length < 2) continue;
        let prevNode = null;
        for (let i = 0; i < ring.length; i++) {
          const ll = normToLatLng(ring[i][0], ring[i][1], tx, ty, 14);
          if (i > 0) {
            const prevLl = normToLatLng(ring[i - 1][0], ring[i - 1][1], tx, ty, 14);
            const steps = Math.min(5, Math.floor(Math.hypot(ll.lat - prevLl.lat, ll.lng - prevLl.lng) * 2200));
            for (let s = 1; s <= steps; s++) {
              const f = s / (steps + 1);
              const midNode = getOrCreateNode(prevLl.lat + (ll.lat - prevLl.lat) * f, prevLl.lng + (ll.lng - prevLl.lng) * f);
              if (prevNode && prevNode.id !== midNode.id) {
                const segDist = Math.hypot(midNode.lat - prevNode.lat, midNode.lng - prevNode.lng) * 111.32;
                const cost = segDist * weight;
                prevNode.edges.push({ to: midNode.id, cost });
                midNode.edges.push({ to: prevNode.id, cost });
              }
              prevNode = midNode;
            }
          }
          const curNode = getOrCreateNode(ll.lat, ll.lng);
          if (prevNode && prevNode.id !== curNode.id) {
            const segDist = Math.hypot(curNode.lat - prevNode.lat, curNode.lng - prevNode.lng) * 111.32;
            const cost = segDist * weight;
            prevNode.edges.push({ to: curNode.id, cost });
            curNode.edges.push({ to: prevNode.id, cost });
          }
          prevNode = curNode;
        }
      }
    }
  }

  if (nodes.size < 20) {
    return { found: false, reason: 'SPARSE_GRAPH' };
  }

  // Encontra nó de partida e chegada mais próximos no grafo
  let startNode = null;
  let endNode = null;
  let minStartD = Infinity;
  let minEndD = Infinity;

  for (const node of nodes.values()) {
    if (node.edges.length === 0) continue;
    const dS = (node.lat - origem.lat) ** 2 + (node.lng - origem.lng) ** 2;
    if (dS < minStartD) { minStartD = dS; startNode = node; }
    const dE = (node.lat - destino.lat) ** 2 + (node.lng - destino.lng) ** 2;
    if (dE < minEndD) { minEndD = dE; endNode = node; }
  }

  if (!startNode || !endNode) {
    return { found: false, reason: 'NO_SNAP_NODES' };
  }

  // Algoritmo A*
  const open = new MinHeap();
  const gScore = new Map();
  const cameFrom = new Map();
  const closed = new Set();

  const heuristic = (n) => Math.hypot(n.lat - endNode.lat, n.lng - endNode.lng) * 111.32 * 0.75;

  gScore.set(startNode.id, 0);
  open.push({ id: startNode.id, f: heuristic(startNode) });

  let iterations = 0;
  let reached = false;

  while (open.size > 0 && iterations < 8000) {
    iterations++;
    const current = open.pop();
    if (current.id === endNode.id) {
      reached = true;
      break;
    }
    if (closed.has(current.id)) continue;
    closed.add(current.id);

    const curNode = nodes.get(current.id);
    const curG = gScore.get(current.id) ?? Infinity;

    for (const edge of curNode.edges) {
      if (closed.has(edge.to)) continue;
      const tentativeG = curG + edge.cost;
      if (tentativeG < (gScore.get(edge.to) ?? Infinity)) {
        cameFrom.set(edge.to, current.id);
        gScore.set(edge.to, tentativeG);
        const nextNode = nodes.get(edge.to);
        open.push({ id: edge.to, f: tentativeG + heuristic(nextNode) });
      }
    }
  }

  if (!reached) {
    return { found: false, reason: 'PATH_NOT_CONNECTED', iterations };
  }

  // Reconstrói o caminho real nas esquinas
  const pathNodes = [];
  let currId = endNode.id;
  while (currId) {
    const n = nodes.get(currId);
    pathNodes.push({ lat: Number(n.lat.toFixed(6)), lng: Number(n.lng.toFixed(6)) });
    currId = cameFrom.get(currId);
  }
  pathNodes.reverse();

  // Garante exatamente origem e destino nas pontas
  const rawWaypoints = [
    { lat: Number(origem.lat.toFixed(6)), lng: Number(origem.lng.toFixed(6)) },
    ...pathNodes,
    { lat: Number(destino.lat.toFixed(6)), lng: Number(destino.lng.toFixed(6)) }
  ];

  // Calcula distância viária real e identifica nomes das vias atravessadas
  let distRealKm = 0;
  for (let i = 0; i < rawWaypoints.length - 1; i++) {
    distRealKm += calcularDistanciaHaversineKm(
      rawWaypoints[i].lat, rawWaypoints[i].lng,
      rawWaypoints[i + 1].lat, rawWaypoints[i + 1].lng
    );
  }

  const viasAtravessadas = [];
  const viasSet = new Set();
  const sampleStep = Math.max(1, Math.floor(rawWaypoints.length / 8));
  for (let i = 1; i < rawWaypoints.length - 1; i += sampleStep) {
    const wp = rawWaypoints[i];
    let bestLabel = null;
    let bestD = 0.000018; // ~450m max
    for (const lbl of roadLabels) {
      const d = (lbl.lat - wp.lat) ** 2 + (lbl.lng - wp.lng) ** 2;
      if (d < bestD) { bestD = d; bestLabel = lbl.name; }
    }
    if (bestLabel && !viasSet.has(bestLabel)) {
      viasSet.add(bestLabel);
      viasAtravessadas.push(bestLabel);
    }
  }

  // Suaviza as esquinas e conversões e ajusta a rota para a mão direita da pista
  const waypointsSuaves = suavizarCurvasEsquinas(rawWaypoints, 18, 4);

  // Filtra espúrios/doglegs causados pela grade discreta de nós do A*
  const cosLatA = Math.cos((origem.lat * Math.PI) / 180);
  const mLatA = 111320;
  const mLngA = 111320 * cosLatA;

  const filtrados = [waypointsSuaves[0]];
  for (let i = 1; i < waypointsSuaves.length; i++) {
    const cur = waypointsSuaves[i];
    const prev = filtrados[filtrados.length - 1];
    const d = Math.hypot((cur.lng - prev.lng) * mLngA, (cur.lat - prev.lat) * mLatA);
    if (d >= 2.5 || i === waypointsSuaves.length - 1) filtrados.push(cur);
  }

  const unkinked = [filtrados[0]];
  for (let i = 1; i < filtrados.length - 1; i++) {
    const p0 = unkinked[unkinked.length - 1];
    const p1 = filtrados[i];
    const p2 = filtrados[i + 1];

    const v1x = (p1.lng - p0.lng) * mLngA;
    const v1y = (p1.lat - p0.lat) * mLatA;
    const v2x = (p2.lng - p1.lng) * mLngA;
    const v2y = (p2.lat - p1.lat) * mLatA;
    const len1 = Math.hypot(v1x, v1y);
    const len2 = Math.hypot(v2x, v2y);
    const dot = (v1x * v2x + v1y * v2y) / Math.max(0.01, len1 * len2);

    if (dot < 0.15 && (len1 < 30 || len2 < 30)) continue;
    unkinked.push(p1);
  }
  unkinked.push(filtrados[filtrados.length - 1]);

  const waypointsNaMao = aplicarOffsetMaoDireita(unkinked, 2.0);

  const waypoints = waypointsNaMao.map((p, idx) => ({
    ...p,
    progresso: Math.round((idx / (waypointsNaMao.length - 1)) * 100)
  }));

  return {
    found: true,
    waypoints,
    distanciaRealKm: Number(Math.max(0.2, distRealKm).toFixed(2)),
    viasAtravessadas,
    nodesGraph: nodes.size,
    iterations
  };
}
