// 공과강사 서버: 정적 파일 + 배정표/공과자료 저장 API + api.jbch.org 프록시 (토큰은 서버에만 보관)
import http from 'node:http';
import { readFile, writeFile, readdir, rename } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getSchedule, SOURCES } from './jbch-school.js';

const PORT = Number(process.env.PORT) || 3000;
const BASE_URL = (process.env.JBCH_BASE_URL || 'https://api.jbch.org').replace(/\/+$/, '');
const DEV_NAME = process.env.JBCH_DEV_NAME || '';
const TOKEN_ID = process.env.JBCH_TOKEN_ID || '';
const ROOT = fileURLToPath(new URL('.', import.meta.url));
const PUBLIC_DIR = join(ROOT, 'public');
const DATA_DIR = join(ROOT, 'data');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';

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

// ---------- 배정표 / 공과 자료 저장소 (data/*.json) ----------
async function readJson(file, fallback) {
  try { return JSON.parse(await readFile(join(DATA_DIR, file), 'utf8')); } catch { return fallback; }
}
async function writeJson(file, data) {
  const tmp = join(DATA_DIR, `.${file}.tmp`);
  await writeFile(tmp, JSON.stringify(data, null, 2));
  await rename(tmp, join(DATA_DIR, file));
}
function canEdit(req) {
  return !ADMIN_PASSWORD || req.headers['x-admin-password'] === ADMIN_PASSWORD;
}
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function validSchedule(s, month) {
  return s && s.month === month && Array.isArray(s.weeks) &&
    s.weeks.every(w => /^\d{4}-\d{2}-\d{2}$/.test(w.date) && w.cells && typeof w.cells === 'object');
}

async function handleData(req, res, path) {
  if (path === '/api/schedules' && req.method === 'GET') {
    const files = (await readdir(DATA_DIR).catch(() => [])).filter(f => /^schedule-\d{4}-\d{2}\.json$/.test(f));
    return sendJson(res, 200, files.map(f => f.slice(9, 16)).sort());
  }
  const m = path.match(/^\/api\/schedules\/(\d{4}-\d{2})$/);
  if (m && MONTH_RE.test(m[1])) {
    const file = `schedule-${m[1]}.json`;
    if (req.method === 'GET') {
      const data = await readJson(file, null);
      return data ? sendJson(res, 200, data) : sendJson(res, 404, { error: '배정표 없음' });
    }
    if (req.method === 'PUT') {
      if (!canEdit(req)) return sendJson(res, 401, { error: '관리자 비밀번호가 틀렸습니다' });
      let body; try { body = JSON.parse(await readBody(req)); } catch { return sendJson(res, 400, { error: '잘못된 JSON' }); }
      if (!validSchedule(body, m[1])) return sendJson(res, 400, { error: '배정표 형식이 올바르지 않습니다' });
      await writeJson(file, body);
      return sendJson(res, 200, { ok: true });
    }
  }
  // 전국교회학교 연간공과 일정: GET /api/curriculum?year=2026
  if (path === '/api/curriculum' && req.method === 'GET') {
    const year = Number(new URL(req.url, 'http://x').searchParams.get('year')) || new Date().getFullYear();
    if (year < 2000 || year > 2100) return sendJson(res, 400, { error: 'year 범위 오류' });
    const results = await Promise.allSettled(Object.keys(SOURCES).map(k => getSchedule(k, year)));
    const out = {}; const errors = {};
    Object.keys(SOURCES).forEach((k, i) => {
      if (results[i].status === 'fulfilled') out[k] = results[i].value;
      else errors[k] = results[i].reason.message;
    });
    return sendJson(res, 200, { year, schedules: out, errors });
  }
  if (path === '/api/resources') {
    if (req.method === 'GET') return sendJson(res, 200, await readJson('resources.json', {}));
    if (req.method === 'PUT') {
      // 공과 제목 하나의 자료(교재/영상 링크)만 갱신: { title, resource: {textbook, textbookUrl, youtube, note} | null }
      let body; try { body = JSON.parse(await readBody(req)); } catch { return sendJson(res, 400, { error: '잘못된 JSON' }); }
      const title = String(body.title || '').trim();
      if (!title) return sendJson(res, 400, { error: 'title 필요' });
      const all = await readJson('resources.json', {});
      if (body.resource) {
        const r = body.resource;
        const url = v => (/^https?:\/\//.test(String(v || '').trim()) ? String(v).trim() : '');
        all[title] = { textbook: String(r.textbook || '').slice(0, 200), textbookUrl: url(r.textbookUrl), youtube: url(r.youtube), note: String(r.note || '').slice(0, 2000) };
      } else delete all[title];
      await writeJson('resources.json', all);
      return sendJson(res, 200, { ok: true });
    }
  }
  return false;
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
    const path = new URL(req.url, 'http://x').pathname;
    if (path === '/api/status' && req.method === 'GET') {
      return sendJson(res, 200, { configured: Boolean(DEV_NAME && TOKEN_ID), adminLocked: Boolean(ADMIN_PASSWORD) });
    }
    if (path.startsWith('/api/') && path !== '/api/jbch') {
      if ((await handleData(req, res, path)) !== false) return;
      return sendJson(res, 404, { error: 'not found' });
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
