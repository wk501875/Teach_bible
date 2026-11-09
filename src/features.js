// 관리자 권한 · 공과 교환 · 암송/본문 캐시
import { sendPush } from './push.js';

const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
const norm = s => String(s || '').replace(/\s/g, '');
const body = async req => { try { return await req.json(); } catch { return null; } };
const DEPT_LABEL = { kinder: '유치부', elLow: '초등 1~3학년', elHigh: '초등 4~6학년', middle: '중등부', high: '고등부', youth: '중고등부' };
const md = iso => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`;

// ---------- 관리자 ----------
// 관리자 = Cloudflare 변수 ADMIN_USERIDS(쉼표 구분) + 앱에서 추가한 아이디(KV 'admins')
export async function getAdmins(env) {
  const fromEnv = String(env.ADMIN_USERIDS || '').split(',').map(s => s.trim()).filter(Boolean);
  const fromKv = (await env.DATA.get('admins', 'json')) || [];
  return [...new Set([...fromEnv, ...fromKv])];
}
// 아직 관리자가 한 명도 없으면 로그인한 누구나 관리자처럼 동작 (처음 설정용)
export async function isAdmin(env, session) {
  if (!session) return false;
  const admins = await getAdmins(env);
  return admins.length === 0 || admins.includes(session.userid);
}

async function handleAdmins(req, env, path, session) {
  if (path === '/api/admins' && req.method === 'GET') {
    const admins = await getAdmins(env);
    return json({ admins, isAdmin: await isAdmin(env, session), configured: admins.length > 0 });
  }
  if (path === '/api/admins' && (req.method === 'POST' || req.method === 'DELETE')) {
    if (!(await isAdmin(env, session))) return json({ error: '관리자만 할 수 있습니다' }, 403);
    const b = await body(req); const userid = String(b?.userid || '').trim().slice(0, 50);
    if (!userid) return json({ error: '깨사모 아이디를 입력하세요' }, 400);
    const list = (await env.DATA.get('admins', 'json')) || [];
    let next = req.method === 'POST' ? [...new Set([...list, userid])] : list.filter(x => x !== userid);
    // 마지막 관리자가 자기 자신을 지우는 실수 방지
    const envAdmins = String(env.ADMIN_USERIDS || '').split(',').map(s => s.trim()).filter(Boolean);
    if (req.method === 'DELETE' && next.length + envAdmins.length === 0) return json({ error: '관리자가 최소 한 명은 있어야 합니다' }, 400);
    if (req.method === 'POST' && list.length === 0 && envAdmins.length === 0 && !next.includes(session.userid)) next = [session.userid, ...next];
    await env.DATA.put('admins', JSON.stringify(next));
    return json({ ok: true, admins: await getAdmins(env) });
  }
  return null;
}

// ---------- 공과 교환 ----------
// swap:<id> = { id, date, dept, title, from:{teacher,tag,userid}, note, status:'open'|'accepted'|'cancelled', to, give, createdAt, doneAt }
async function listSwaps(env) {
  const out = []; let cursor;
  do {
    const page = await env.DATA.list({ prefix: 'swap:', cursor });
    for (const k of page.keys) { const v = await env.DATA.get(k.name, 'json'); if (v) out.push(v); }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return out.sort((a, b) => a.date.localeCompare(b.date) || b.createdAt - a.createdAt);
}
// 이름에 붙는 표시(B/T/P…)를 배정표에서 찾아옴
async function tagOf(env, ctx, name) {
  for (const m of (await ctx.listMonths(env)).reverse()) {
    const s = await ctx.loadSchedule(env, m);
    for (const w of s?.weeks || []) for (const c of Object.values(w.cells)) if (c && norm(c.teacher) === norm(name) && c.tag) return c.tag;
  }
  return '';
}
const cellAt = (schedule, date, dept) => schedule?.weeks?.find(w => w.date === date)?.cells?.[dept] || null;

async function notify(env, filter, payload) {
  let cursor;
  do {
    const page = await env.DATA.list({ prefix: 'push:', cursor });
    for (const k of page.keys) {
      const rec = await env.DATA.get(k.name, 'json');
      if (!rec || !filter(rec)) continue;
      try { const st = await sendPush(env, rec.subscription, payload, rec.origin); if (st === 404 || st === 410) await env.DATA.delete(k.name); } catch { /* 계속 */ }
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
}

async function handleSwaps(req, env, path, session, ctx, waitUntil) {
  if (path === '/api/swaps' && req.method === 'GET') {
    const since = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    return json((await listSwaps(env)).filter(s => s.status === 'open' || s.date >= since));
  }
  if (path === '/api/swaps' && req.method === 'POST') {
    const b = await body(req);
    const date = String(b?.date || ''); const dept = String(b?.dept || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !DEPT_LABEL[dept]) return json({ error: '날짜와 부서가 필요합니다' }, 400);
    const schedule = await ctx.loadSchedule(env, date.slice(0, 7));
    const cell = cellAt(schedule, date, dept);
    if (!cell) return json({ error: '배정표에서 그 공과를 찾지 못했습니다' }, 404);
    if (norm(cell.teacher) !== norm(session.name) && !(await isAdmin(env, session))) return json({ error: '내가 맡은 공과만 교환을 요청할 수 있습니다' }, 403);
    const existing = (await listSwaps(env)).find(s => s.status === 'open' && s.date === date && s.dept === dept);
    if (existing) return json({ error: '이미 교환 요청이 올라와 있습니다' }, 409);
    const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const swap = { id, date, dept, title: cell.title, from: { teacher: cell.teacher, tag: cell.tag || '', userid: session.userid }, note: String(b?.note || '').slice(0, 200), status: 'open', createdAt: Date.now() };
    await env.DATA.put(`swap:${id}`, JSON.stringify(swap), { expirationTtl: 120 * 86400 });
    waitUntil(notify(env, rec => norm(rec.teacher) !== norm(cell.teacher), {
      title: '공과 교환 요청', body: `${md(date)}(일) ${DEPT_LABEL[dept]} · ${cell.title}\n${cell.teacher} 님이 대신 맡아 줄 분을 찾고 있어요${swap.note ? `\n"${swap.note}"` : ''}`, url: '/',
    }));
    return json(swap);
  }
  const m = path.match(/^\/api\/swaps\/([a-z0-9]+)\/(accept|cancel)$/);
  if (m && req.method === 'POST') {
    const swap = await env.DATA.get(`swap:${m[1]}`, 'json');
    if (!swap) return json({ error: '요청을 찾지 못했습니다' }, 404);
    if (swap.status !== 'open') return json({ error: '이미 처리된 요청입니다' }, 409);
    if (m[2] === 'cancel') {
      if (swap.from.userid !== session.userid && norm(swap.from.teacher) !== norm(session.name) && !(await isAdmin(env, session))) return json({ error: '요청한 사람만 취소할 수 있습니다' }, 403);
      Object.assign(swap, { status: 'cancelled', doneAt: Date.now() });
      await env.DATA.put(`swap:${swap.id}`, JSON.stringify(swap), { expirationTtl: 60 * 86400 });
      return json(swap);
    }
    // 수락: 대신 맡기, 또는 내 공과(give)와 맞바꾸기
    if (norm(swap.from.teacher) === norm(session.name)) return json({ error: '내 요청은 수락할 수 없습니다' }, 400);
    const b = await body(req) || {};
    const month = swap.date.slice(0, 7);
    const schedule = await ctx.loadSchedule(env, month);
    const cell = cellAt(schedule, swap.date, swap.dept);
    if (!cell || norm(cell.teacher) !== norm(swap.from.teacher)) return json({ error: '배정표가 바뀌어 처리할 수 없습니다' }, 409);
    const myTag = await tagOf(env, ctx, session.name);
    const changed = new Map([[month, schedule]]);
    let give = null;
    if (b.giveDate && b.giveDept) {
      const gm = String(b.giveDate).slice(0, 7);
      const gs = changed.get(gm) || await ctx.loadSchedule(env, gm);
      const gcell = cellAt(gs, b.giveDate, b.giveDept);
      if (!gcell || norm(gcell.teacher) !== norm(session.name)) return json({ error: '맞바꿀 내 공과를 찾지 못했습니다' }, 400);
      gcell.teacher = swap.from.teacher; gcell.tag = swap.from.tag;
      changed.set(gm, gs);
      give = { date: b.giveDate, dept: b.giveDept, title: gcell.title };
    }
    cell.teacher = session.name; cell.tag = myTag;
    for (const [mon, s] of changed) await env.DATA.put(`schedule:${mon}`, JSON.stringify(s));
    Object.assign(swap, { status: 'accepted', to: { teacher: session.name, tag: myTag, userid: session.userid }, give, doneAt: Date.now() });
    await env.DATA.put(`swap:${swap.id}`, JSON.stringify(swap), { expirationTtl: 60 * 86400 });
    waitUntil(notify(env, rec => norm(rec.teacher) === norm(swap.from.teacher), {
      title: '공과 교환 완료', body: give
        ? `${session.name} 님이 ${md(swap.date)} 공과를 맡고, 대신 ${md(give.date)}(일) ${DEPT_LABEL[give.dept]} · ${give.title}을(를) 맡게 되었어요`
        : `${session.name} 님이 ${md(swap.date)}(일) ${DEPT_LABEL[swap.dept]} · ${swap.title} 공과를 대신 맡아 주셨어요`, url: '/',
    }));
    return json(swap);
  }
  return null;
}

// ---------- 본문 · 암송 (공과 PDF에서 앱이 읽은 결과를 함께 저장) ----------
async function handleVerses(req, env, path, url) {
  if (path !== '/api/verses') return null;
  const okUrl = u => /^https:\/\/school\.jbch\.org\/[\w\-./,%]+\.pdf$/i.test(u);
  if (req.method === 'GET') {
    const urls = (url.searchParams.get('urls') || '').split('|').filter(okUrl).slice(0, 20);
    const out = {};
    for (const u of urls) { const v = await env.DATA.get(`verse:${u}`, 'json'); if (v) out[u] = v; }
    return json(out);
  }
  if (req.method === 'POST') {
    const b = await body(req);
    if (!b || !okUrl(b.url)) return json({ error: '잘못된 요청' }, 400);
    const clean = s => String(s || '').replace(/\s+/g, ' ').trim().slice(0, 300);
    const v = { passage: clean(b.passage), verse: clean(b.verse), ref: clean(b.ref).slice(0, 40), at: Date.now() };
    await env.DATA.put(`verse:${b.url}`, JSON.stringify(v), { expirationTtl: 400 * 86400 });
    return json(v);
  }
  return null;
}

export async function handleFeatures(req, env, path, url, session, ctx, waitUntil) {
  return (await handleAdmins(req, env, path, session))
    || (await handleSwaps(req, env, path, session, ctx, waitUntil))
    || (await handleVerses(req, env, path, url));
}
