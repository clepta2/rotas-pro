/**
 * ingest-rfb-cnpj-r2.mjs
 * Pipeline Soberano de Ingestão de CNPJs ATIVOS da Receita Federal (Dados Abertos 2026-11)
 * - Baixa Estabelecimentos{N}.zip direto do WebDAV oficial da Receita Federal
 * - Extrai com bsdtar nativo e lê o CSV em stream (< 100 MB RAM)
 * - Filtra apenas empresas ATIVAS ('02') com Nome Fantasia e CEP válido
 * - Geocodifica via motor soberano + classifica CNAE (alimentacao, varejo, saude, servicos)
 * - Faz upload paralelo via S3 SigV4 nativo para Cloudflare R2 (rotas-mapas-r2/stores/12/{x}/{y}.json)
 *
 * Uso: node ingest-rfb-cnpj-r2.mjs 0   (processa Estabelecimentos0.zip)
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import readline from 'readline';
import { execSync } from 'child_process';
import { geocodificarLocal } from './rotas-pro.js';
import { deg2num } from './astar-routing.js';

const PART_INDEX = process.argv[2] ?? '0';
const RFB_BASE = 'https://arquivos.receitafederal.gov.br/public.php/dav/files/YggdBLfdninEJX9/2026-11';
const ZIP_NAME = `Estabelecimentos${PART_INDEX}.zip`;
const WORK_DIR = `C:\\Users\\Win10\\Documents\\rotas-pro\\tmp_rfb_${PART_INDEX}`;
const ENV_FILE = 'C:\\Users\\Win10\\Documents\\contas-cloudflare.env';

if (!fs.existsSync(WORK_DIR)) fs.mkdirSync(WORK_DIR, { recursive: true });

// Carrega credenciais R2 do cofre local (nunca hardcoded)
function loadR2Creds() {
  const txt = fs.readFileSync(ENV_FILE, 'utf8');
  const get = (k) => {
    const line = txt.split(/\r?\n/).find((l) => l.startsWith(k + '='));
    return line ? line.slice(k.length + 1).trim() : '';
  };
  return {
    accessKeyId: get('CF_CLEPTA2_R2_ACCESS_KEY_ID'),
    secretAccessKey: get('CF_CLEPTA2_R2_SECRET_ACCESS_KEY'),
    endpoint: get('CF_CLEPTA2_R2_ENDPOINT'),
    bucket: 'rotas-mapas-r2'
  };
}

const R2 = loadR2Creds();
if (!R2.accessKeyId || !R2.secretAccessKey || !R2.endpoint) {
  console.error('Credenciais R2 da conta clepta2 não encontradas em contas-cloudflare.env');
  process.exit(1);
}

// ── Assinatura AWS Signature V4 Pura (Zero Dependências) ──
function hmac(key, msg) { return crypto.createHmac('sha256', key).update(msg).digest(); }
function sha256Hex(data) { return crypto.createHash('sha256').update(data).digest('hex'); }

async function s3Request(method, keyPath, bodyBuffer = null) {
  const url = new URL(`${R2.endpoint}/${R2.bucket}/${keyPath}`);
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256Hex(bodyBuffer || '');

  const headers = {
    host: url.host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate
  };
  if (bodyBuffer) headers['content-type'] = 'application/json';

  const signedHeaderKeys = Object.keys(headers).sort();
  const canonicalHeaders = signedHeaderKeys.map((k) => `${k}:${headers[k]}\n`).join('');
  const signedHeaders = signedHeaderKeys.join(';');

  const canonicalRequest = [
    method,
    url.pathname,
    '',
    canonicalHeaders,
    signedHeaders,
    payloadHash
  ].join('\n');

  const credentialScope = `${dateStamp}/auto/s3/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest)
  ].join('\n');

  const kDate = hmac('AWS4' + R2.secretAccessKey, dateStamp);
  const kRegion = hmac(kDate, 'auto');
  const kService = hmac(kRegion, 's3');
  const kSigning = hmac(kService, 'aws4_request');
  const signature = crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex');

  headers['authorization'] = `AWS4-HMAC-SHA256 Credential=${R2.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const res = await fetch(url.toString(), {
    method,
    headers,
    body: bodyBuffer || undefined
  });
  return res;
}

function classificarCnae(cnae) {
  const c = String(cnae || '');
  if (c.startsWith('56')) return { cat: 'alimentacao', sub: 'Restaurante / Alimentação' };
  if (c.startsWith('4771') || c.startsWith('86')) return { cat: 'saude', sub: 'Saúde / Farmácia' };
  if (c.startsWith('47')) return { cat: 'varejo', sub: 'Comércio Varejista' };
  return { cat: 'servicos', sub: 'Serviços / Empresa' };
}

function parseRfbCsvLine(line) {
  // RFB CSV usa ";" entre campos e aspas duplas ""
  const cols = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQ = !inQ; continue; }
    if (ch === ';' && !inQ) { cols.push(cur); cur = ''; continue; }
    cur += ch;
  }
  cols.push(cur);
  return cols;
}

async function run() {
  const zipPath = path.join(WORK_DIR, ZIP_NAME);
  console.log(`[1/4] Baixando ${ZIP_NAME} da Receita Federal (${RFB_BASE}/${ZIP_NAME})...`);
  execSync(`curl.exe -L --progress-bar "${RFB_BASE}/${ZIP_NAME}" -o "${zipPath}"`, { stdio: 'inherit' });

  console.log(`[2/4] Extraindo CSV com bsdtar nativo...`);
  execSync(`tar -xf "${zipPath}" -C "${WORK_DIR}"`, { stdio: 'inherit' });
  fs.unlinkSync(zipPath); // Apaga o .zip imediatamente para liberar 2.3 GB de disco

  const csvFile = fs.readdirSync(WORK_DIR).find((f) => !f.endsWith('.zip'));
  if (!csvFile) throw new Error('Arquivo CSV não encontrado após extração.');
  const csvPath = path.join(WORK_DIR, csvFile);

  console.log(`[3/4] Lendo ${csvFile} em stream e geocodificando CNPJs ATIVOS (02)...`);
  const shards = new Map(); // "x/y" -> []
  const MAX_PER_SHARD = 1200; // Mantém cada shard z12 < 250KB para carregamento instantâneo
  let totalLinhas = 0;
  let totalAtivas = 0;
  let totalAdicionadas = 0;

  const rl = readline.createInterface({
    input: fs.createReadStream(csvPath, { encoding: 'latin1' }),
    crlfDelay: Infinity
  });

  for await (const line of rl) {
    totalLinhas++;
    if (!line) continue;
    const c = parseRfbCsvLine(line);
    if (c.length < 21) continue;

    // Filtro: Situação Cadastral '02' (ATIVA), com Nome Fantasia [4] e CEP 8 dígitos [18]
    if (c[5] !== '02') continue;
    totalAtivas++;

    const fantasia = (c[4] || '').trim();
    const cep = (c[18] || '').replace(/\D/g, '');
    if (fantasia.length < 2 || cep.length !== 8) continue;

    const geo = geocodificarLocal(cep);
    if (!geo.valido) continue;

    // Pequeno jitter determinístico pelo CNPJ básico para não empilhar empresas do mesmo CEP no mesmo pixel
    const cnpjBasicoNum = parseInt(c[0], 10) || 1;
    const jLat = (((cnpjBasicoNum % 100) / 100) - 0.5) * 0.0028;
    const jLng = ((((cnpjBasicoNum * 7) % 100) / 100) - 0.5) * 0.0028;
    const lat = Number((geo.lat + jLat).toFixed(5));
    const lng = Number((geo.lng + jLng).toFixed(5));

    const s12 = deg2num(lat, lng, 12);
    const sKey = `${s12.x}/${s12.y}`;

    if (!shards.has(sKey)) shards.set(sKey, []);
    const arr = shards.get(sKey);
    if (arr.length >= MAX_PER_SHARD) continue;

    const cnpjFull = `${c[0]}${c[1]}${c[2]}`;
    const { cat, sub } = classificarCnae(c[11]);
    const end = [c[13], c[14], c[15], c[17]].filter(Boolean).join(' ').trim();
    const tel = c[21] && c[22] ? `(${c[21]}) ${c[22]}` : undefined;

    arr.push({
      id: `rfb_${cnpjFull}`,
      n: fantasia,
      cat,
      sub,
      c: geo.cidade || c[19],
      lat,
      lng,
      cnpj: cnpjFull,
      cnae: c[11],
      end: end || undefined,
      cep: `${cep.slice(0, 5)}-${cep.slice(5)}`,
      tel
    });
    totalAdicionadas++;

    if (totalLinhas % 500000 === 0) {
      console.log(`  Linhas: ${(totalLinhas / 1e6).toFixed(1)}M | Ativas: ${totalAtivas} | Mapeadas em shards z12: ${totalAdicionadas} (${shards.size} células)`);
    }
  }

  fs.unlinkSync(csvPath); // Limpa CSV gigante do disco
  fs.rmSync(WORK_DIR, { recursive: true, force: true });

  console.log(`\n[4/4] Fazendo merge e upload paralelo via S3 SigV4 de ${shards.size} shards z12 para Cloudflare R2...`);
  const entries = Array.from(shards.entries());
  let uploaded = 0;

  for (let i = 0; i < entries.length; i += 20) {
    const batch = entries.slice(i, i + 20);
    await Promise.all(batch.map(async ([sKey, newArr]) => {
      const r2Key = `stores/12/${sKey}.json`;
      let merged = newArr;
      try {
        const getRes = await s3Request('GET', r2Key);
        if (getRes.ok) {
          const existing = await getRes.json();
          if (Array.isArray(existing) && existing.length > 0) {
            // Prioriza lojas OSM reais + completa com CNPJs RFB até 1.500 por célula
            merged = [...existing, ...newArr].slice(0, 1500);
          }
        }
      } catch (_) {}

      const buf = Buffer.from(JSON.stringify(merged), 'utf8');
      const putRes = await s3Request('PUT', r2Key, buf);
      if (putRes.ok) uploaded++;
    }));

    if (uploaded % 100 === 0 || i + 20 >= entries.length) {
      console.log(`  Upload R2: ${uploaded}/${entries.length} shards z12 gravados!`);
    }
  }

  console.log(`\nCONCLUÍDO! ${ZIP_NAME}: ${totalLinhas} linhas lidas | ${totalAtivas} empresas ATIVAS | ${totalAdicionadas} empresas RFB geocodificadas em ${uploaded} shards no R2!`);
}

run().catch((err) => {
  console.error('Erro fatal na ingestão:', err);
  fs.rmSync(WORK_DIR, { recursive: true, force: true });
  process.exit(1);
});
