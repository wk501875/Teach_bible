// 공과강사 Cloudflare Worker: 정적 화면(ASSETS) + 배정표/메모 저장(KV) + 전국교회학교 연간공과 일정
import { getSchedule, SOURCES } from './jbch-school.js';
import seed202610 from '../data/schedule-2026-10.json';
import seed202611 from '../data/schedule-2026-11.json';

// KV가 비어 있을 때 쓰는 기본 배정표
const SEED = { '2026-10': seed202610, '2026-11': seed202611 };
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

  if (path === '/api/status' && req.method === 'GET') {
    return json({ adminLocked: Boolean(env.ADMIN_PASSWORD) });
  }

  if (path === '/api/schedules' && req.method === 'GET') return json(await listMonths(env));

  const m = path.match(/^\/api\/schedules\/(\d{4}-\d{2})$/);
  if (m && MONTH_RE.test(m[1])) {
    const month = m[1];
    if (req.method === 'GET') {
      const data = (await env.DATA.get(`schedule:${month}`, 'json')) || SEED[month];
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

  return json({ error: 'not found' }, 404);
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
};
