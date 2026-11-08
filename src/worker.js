// 공과강사 Cloudflare Worker: 정적 화면(ASSETS) + 배정표/메모 저장(KV) + 전국교회학교 연간공과 일정
import { getSchedule, SOURCES } from './jbch-school.js';
import { handleAuth } from './auth.js';
import { handlePush, runDailyReminders } from './push.js';
import seed202610 from '../data/schedule-2026-10.json';
import seed202611 from '../data/schedule-2026-11.json';
import seed202612 from '../data/schedule-2026-12.json';

// KV가 비어 있을 때 쓰는 기본 배정표
const SEED = { '2026-10': seed202610, '2026-11': seed202611, '2026-12': seed202612 };
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } });

async function readBody(req) {
  const text = await req.text();
  if (text.length > 1_000_000) throw new Error('요청 본문이 너무 큽니다');
  return JSON.parse(text || '{}');
}

const canEdit = (req, env) => !env.ADMIN_PASSWORD || req.headers.get('X-Admin-Password') === env.ADMIN_PASSWORD;

function validSchedule(s, month) {
  return s && s.month === month && Array.isArray(s.weeks) && s.weeks.length <= 10 &&
    s.weeks.every(w => /^\d{4}-\d{2}-\d{2}$/.test(w.date) && w.cells && typeof w.cells === 'object');
}

const loadSchedule = async (env, month) => (await env.DATA.get(`schedule:${month}`, 'json')) || SEED[month] || null;

async function listMonths(env) {
  const months = new Set(Object.keys(SEED));
  let cursor;
  do {
    const r = await env.DATA.list({ prefix: 'schedule:', cursor });
    r.keys.forEach(k => months.add(k.name.slice(9)));
    cursor = r.list_complete ? undefined : r.cursor;
  } while (cursor);
  return [...months].sort();
}

async function handleApi(req, env, url) {
  const path = url.pathname;

  const auth = await handleAuth(req, env, path);
  if (auth) return auth;
  const push = await handlePush(req, env, path, url);
  if (push) return push;

  if (path === '/api/status' && req.method === 'GET') {
    // 설정 확인용: 값은 절대 보내지 않고 들어 있는지만 알려줌
    return json({ adminLocked: Boolean(env.ADMIN_PASSWORD), keys: { JBCH_DEV_NAME: Boolean(env.JBCH_DEV_NAME), JBCH_TOKEN_ID: Boolean(env.JBCH_TOKEN_ID) } });
  }

  if (path === '/api/schedules' && req.method === 'GET') return json(await listMonths(env));

  const m = path.match(/^\/api\/schedules\/(\d{4}-\d{2})$/);
  if (m && MONTH_RE.test(m[1])) {
    const month = m[1];
    if (req.method === 'GET') {
      const data = await loadSchedule(env, month);
      return data ? json(data) : json({ error: '배정표 없음' }, 404);
    }
    if (req.method === 'PUT') {
      if (!canEdit(req, env)) return json({ error: '관리자 비밀번호가 틀렸습니다' }, 401);
      let body; try { body = await readBody(req); } catch { return json({ error: '잘못된 JSON' }, 400); }
      if (!validSchedule(body, month)) return json({ error: '배정표 형식이 올바르지 않습니다' }, 400);
      await env.DATA.put(`schedule:${month}`, JSON.stringify(body));
      return json({ ok: true });
    }
  }

  if (path === '/api/resources') {
    if (req.method === 'GET') return json((await env.DATA.get('resources', 'json')) || {});
    if (req.method === 'PUT') {
      // 공과 제목 하나의 추가 링크/메모만 갱신: { title, resource: {...} | null }
      let body; try { body = await readBody(req); } catch { return json({ error: '잘못된 JSON' }, 400); }
      const title = String(body.title || '').trim().slice(0, 200);
      if (!title) return json({ error: 'title 필요' }, 400);
      const all = (await env.DATA.get('resources', 'json')) || {};
      if (body.resource) {
        const r = body.resource;
        const link = v => (/^https?:\/\//.test(String(v || '').trim()) ? String(v).trim().slice(0, 1000) : '');
        all[title] = { textbook: String(r.textbook || '').slice(0, 200), textbookUrl: link(r.textbookUrl), youtube: link(r.youtube), note: String(r.note || '').slice(0, 2000) };
      } else delete all[title];
      await env.DATA.put('resources', JSON.stringify(all));
      return json({ ok: true });
    }
  }

  // 전국교회학교 연간공과 일정: GET /api/curriculum?year=2026
  if (path === '/api/curriculum' && req.method === 'GET') {
    const year = Number(url.searchParams.get('year')) || new Date().getFullYear();
    if (year < 2000 || year > 2100) return json({ error: 'year 범위 오류' }, 400);
    const keys = Object.keys(SOURCES);
    const results = await Promise.allSettled(keys.map(k => getSchedule(k, year, env.DATA)));
    const schedules = {}; const errors = {};
    keys.forEach((k, i) => {
      if (results[i].status === 'fulfilled') schedules[k] = results[i].value;
      else errors[k] = String(results[i].reason?.message || results[i].reason);
    });
    return json({ year, schedules, errors });
  }

  // 공과 자료 파일 중계: GET /api/file?url=...&name=...&dl=1
  if (path === '/api/file' && req.method === 'GET') return proxyFile(req, url);

  return json({ error: 'not found' }, 404);
}

// 교회학교 자료 파일만 중계 (PDF, 한글, mp3). http 음성도 https로 들을 수 있게 됨.
const FILE_HOSTS = new Set(['school.jbch.org', 'tv.jbch.org', 'www.jbch.org']);
const EXT_TYPES = { pdf: 'application/pdf', hwp: 'application/x-hwp', mp3: 'audio/mpeg' };

function allowedFileUrl(raw) {
  try {
    const u = new URL(raw);
    return ['http:', 'https:'].includes(u.protocol) && FILE_HOSTS.has(u.hostname) ? u : null;
  } catch { return null; }
}

async function proxyFile(req, url) {
  const target = allowedFileUrl(url.searchParams.get('url') || '');
  if (!target) return json({ error: '허용되지 않은 파일 주소입니다' }, 400);

  const headers = { 'User-Agent': 'teach-bible/0.2' };
  const range = req.headers.get('Range');
  if (range) headers.Range = range;
  const upstream = await fetch(target, { headers, redirect: 'follow', cf: { cacheTtl: 86400, cacheEverything: true } });
  if (!allowedFileUrl(upstream.url)) return json({ error: '허용되지 않은 주소로 이동했습니다' }, 502);
  if (!upstream.ok && upstream.status !== 206) return json({ error: `파일을 가져오지 못했습니다 (${upstream.status})` }, 502);

  const ext = (target.pathname.split('.').pop() || '').toLowerCase();
  let type = upstream.headers.get('Content-Type') || '';
  if (type.includes('text/html')) {
    // 파일 대신 웹페이지(로그인 화면 등)가 온 경우
    return json({ error: '파일 대신 웹페이지가 왔습니다. 로그인이 필요한 파일일 수 있습니다.' }, 502);
  }
  if (!type || type === 'application/octet-stream') type = EXT_TYPES[ext] || 'application/octet-stream';

  const name = (url.searchParams.get('name') || decodeURIComponent(target.pathname.split('/').pop() || 'file'))
    .replace(/[\\/:*?"<>|\r\n]/g, '_').slice(0, 150);
  const out = new Headers({
    'Content-Type': type,
    'Content-Disposition': `${url.searchParams.get('dl') ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(name)}`,
    'Cache-Control': 'public, max-age=86400',
    'X-Content-Type-Options': 'nosniff',
  });
  for (const h of ['Content-Length', 'Content-Range', 'Accept-Ranges', 'Last-Modified', 'ETag']) {
    const v = upstream.headers.get(h); if (v) out.set(h, v);
  }
  return new Response(upstream.body, { status: upstream.status, headers: out });
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname.startsWith('/api/')) {
      try { return await handleApi(req, env, url); }
      catch (err) { return json({ error: err.message }, 500); }
    }
    return env.ASSETS.fetch(req);
  },
  // 매일 00:00 UTC = 오전 9시 (KST): 이번 주 공과 알림
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runDailyReminders(env, month => loadSchedule(env, month)).then(r => console.log('reminders', JSON.stringify(r))));
  },
};
