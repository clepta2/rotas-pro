/**
 * r2-s3.mjs — Cliente S3 SigV4 mínimo (zero dependências) para o bucket R2 rotas-mapas-r2.
 * Credenciais lidas do cofre local contas-cloudflare.env (nunca hardcoded).
 */
import fs from 'fs';
import crypto from 'crypto';

const ENV_FILE = 'C:\\Users\\Win10\\Documents\\contas-cloudflare.env';

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
  throw new Error('Credenciais R2 da conta clepta2 não encontradas em contas-cloudflare.env');
}

const hmac = (key, msg) => crypto.createHmac('sha256', key).update(msg).digest();
const sha256Hex = (data) => crypto.createHash('sha256').update(data).digest('hex');

export async function s3Request(method, keyPath, body = null, contentType = 'application/json') {
  const url = new URL(`${R2.endpoint}/${R2.bucket}/${keyPath}`);
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256Hex(body || '');
  const headers = { host: url.host, 'x-amz-content-sha256': payloadHash, 'x-amz-date': amzDate };
  if (body) headers['content-type'] = contentType;

  const signedKeys = Object.keys(headers).sort();
  const canonicalHeaders = signedKeys.map((k) => `${k}:${headers[k]}\n`).join('');
  const signedHeaders = signedKeys.join(';');
  const canonicalRequest = [method, url.pathname, '', canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const scope = `${dateStamp}/auto/s3/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256Hex(canonicalRequest)].join('\n');
  const kSigning = hmac(hmac(hmac(hmac('AWS4' + R2.secretAccessKey, dateStamp), 'auto'), 's3'), 'aws4_request');
  const signature = crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex');
  headers.authorization = `AWS4-HMAC-SHA256 Credential=${R2.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return fetch(url.toString(), { method, headers, body: body || undefined });
}

export async function r2Put(keyPath, body, contentType = 'application/json', retries = 4) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body), 'utf8');
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await s3Request('PUT', keyPath, buf, contentType);
      if (res.ok) return true;
      if (attempt === retries) throw new Error(`HTTP ${res.status} em ${keyPath}`);
    } catch (e) {
      if (attempt === retries) throw e;
    }
    await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
  }
  return false;
}

export async function r2Get(keyPath) {
  const res = await s3Request('GET', keyPath);
  if (!res.ok) return null;
  return Buffer.from(await res.arrayBuffer());
}

/** Envia N objetos com concorrência limitada (sem picos de rede). */
export async function r2PutMany(items, concurrency = 12, onProgress = null) {
  let idx = 0;
  let done = 0;
  const worker = async () => {
    while (idx < items.length) {
      const it = items[idx++];
      await r2Put(it.key, it.body, it.contentType || 'application/json');
      done++;
      if (onProgress && done % 200 === 0) onProgress(done, items.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return done;
}
