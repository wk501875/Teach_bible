// 공과강사 서버: 정적 파일 제공 + api.jbch.org 프록시 (토큰은 서버에만 보관)
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.env.PORT) || 3000;
const BASE_URL = (process.env.JBCH_BASE_URL || 'https://api.jbch.org').replace(/\/+$/, '');
const DEV_NAME = process.env.JBCH_DEV_NAME || '';
const TOKEN_ID = process.env.JBCH_TOKEN_ID || '';
const PUBLIC_DIR = join(fileURLToPath(new URL('.', import.meta.url)), 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': MIME['.json'] });
  res.end(JSON.stringify(data));
}

async function readBody(req, limit = 1_000_000) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new Error('요청 본문이 너무 큽니다');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

// 클라이언트 요청: POST /api/jbch  { method: "GET"|"POST", path: "board/list", params: {...} }
// 서버가 dev_name, tokenId 를 붙여 api.jbch.org 로 전달한다.
async function proxyJbch(req, res) {
  if (!DEV_NAME || !TOKEN_ID) {
    return sendJson(res, 503, { error: '서버에 JBCH_DEV_NAME / JBCH_TOKEN_ID 가 설정되지 않았습니다 (.env 확인)' });
  }
  let payload;
  try {
    payload = JSON.parse((await readBody(req)) || '{}');
  } catch {
    return sendJson(res, 400, { error: '잘못된 JSON 입니다' });
  }
  const method = String(payload.method || 'POST').toUpperCase();
  const path = String(payload.path || '').replace(/^\/+/, '');
  const params = payload.params && typeof payload.params === 'object' ? payload.params : {};

  if (!['GET', 'POST'].includes(method)) return sendJson(res, 400, { error: 'method 는 GET 또는 POST' });
  if (!/^[A-Za-z0-9_\-./]*$/.test(path) || path.includes('..')) {
    return sendJson(res, 400, { error: '허용되지 않는 path 입니다' });
  }

  const auth = { dev_name: DEV_NAME, tokenId: TOKEN_ID };
  const url = new URL(`${BASE_URL}/${path}`);
  const init = { method, headers: { Accept: 'application/json' } };
  if (method === 'GET') {
    for (const [k, v] of Object.entries({ ...params, ...auth })) url.searchParams.set(k, String(v));
  } else {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify({ ...params, ...auth });
  }

  try {
    const upstream = await fetch(url, { ...init, signal: AbortSignal.timeout(15_000) });
    const text = await upstream.text();
    let data;
    try { data = JSON.parse(text); } catch { data = text; }
    sendJson(res, upstream.ok ? 200 : 502, { status: upstream.status, data });
  } catch (err) {
    sendJson(res, 502, { error: `api.jbch.org 요청 실패: ${err.message}` });
  }
}

async function serveStatic(req, res) {
  const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const rel = normalize(urlPath === '/' ? '/index.html' : urlPath).replace(/^([/\\])+/, '');
  const file = join(PUBLIC_DIR, rel);
  if (!file.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end(); }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  }
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.url === '/api/status' && req.method === 'GET') {
      return sendJson(res, 200, { configured: Boolean(DEV_NAME && TOKEN_ID), baseUrl: BASE_URL });
    }
    if (req.url === '/api/jbch' && req.method === 'POST') return await proxyJbch(req, res);
    if (req.method === 'GET') return await serveStatic(req, res);
    res.writeHead(405); res.end();
  } catch (err) {
    sendJson(res, 500, { error: err.message });
  }
});

server.listen(PORT, () => {
  console.log(`공과강사 실행 중: http://localhost:${PORT}`);
  if (!DEV_NAME || !TOKEN_ID) console.log('⚠️  .env 에 JBCH_DEV_NAME / JBCH_TOKEN_ID 를 설정하면 API 연동이 활성화됩니다.');
});
