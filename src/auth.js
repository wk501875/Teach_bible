// 깨사모 로그인 (생명선 API) + 자동 로그인 세션
// - 비밀번호는 로그인 확인에만 쓰고 저장하지 않는다.
// - 로그인 후 받은 hash 와 회원 이름을 KV 세션에 두고, 1년짜리 HttpOnly 쿠키로 자동 로그인한다.
const API = 'https://api.jbch.org';
const COOKIE = 'tb_session';
const SESSION_TTL = 365 * 24 * 60 * 60; // 1년
const RECHECK_MS = 24 * 60 * 60 * 1000; // 하루에 한 번 hash 가 아직 유효한지 확인

async function callJbch(env, path, params) {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ dev_name: env.JBCH_DEV_NAME, tokenId: env.JBCH_TOKEN_ID, ...params }),
    signal: AbortSignal.timeout(15_000),
  });
  const text = await res.text();
  try { return JSON.parse(text); } catch { return { status: 'error', result: text.slice(0, 200) }; }
}

// 응답 어디에 있든 첫 번째로 맞는 키의 문자열 값을 찾는다 (응답 모양이 문서에 자세히 없어서 넓게 찾음)
function findValue(obj, keys, depth = 0) {
  if (!obj || typeof obj !== 'object' || depth > 4) return '';
  for (const k of keys) {
    const hit = Object.keys(obj).find(x => x.toLowerCase() === k.toLowerCase());
    if (hit && (typeof obj[hit] === 'string' || typeof obj[hit] === 'number') && String(obj[hit]).trim()) return String(obj[hit]).trim();
  }
  for (const v of Object.values(obj)) {
    const found = findValue(v, keys, depth + 1);
    if (found) return found;
  }
  return '';
}
const keyList = (obj, prefix = '', depth = 0) => (!obj || typeof obj !== 'object' || depth > 3) ? [] :
  Object.entries(obj).flatMap(([k, v]) => [prefix + k, ...keyList(v, `${prefix}${k}.`, depth + 1)]);

const NAME_KEYS = ['name', 'mb_name', 'user_name', 'username', 'kname', 'real_name', 'nickname', '성명', '이름'];
const CHURCH_KEYS = ['church_name', 'churchname', 'church', 'chname', '교회명', '교회'];
const isOk = r => String(r?.status).toLowerCase() === 'ok' || String(r?.result).toLowerCase() === 'ok';

async function fetchProfile(env, hash) {
  const r = await callJbch(env, '/in/member_json.php', { hash });
  if (String(r?.status).toLowerCase() === 'error') return { ok: false, error: String(r.result || r.comment || '회원정보 오류') };
  const name = findValue(r, NAME_KEYS).replace(/\s*(형제|자매|목사|전도사)$/, '');
  if (!name) return { ok: false, error: `회원정보에서 이름을 찾지 못했습니다 (받은 항목: ${keyList(r).join(', ').slice(0, 300)})` };
  return { ok: true, name, church: findValue(r, CHURCH_KEYS) };
}

function readCookie(req, name) {
  const m = (req.headers.get('Cookie') || '').match(new RegExp(`(?:^|;\\s*)${name}=([A-Za-z0-9_-]+)`));
  return m ? m[1] : '';
}
const sessionCookie = (id, maxAge) =>
  `${COOKIE}=${id}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
function randomId() {
  const b = new Uint8Array(32); crypto.getRandomValues(b);
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function getSession(req, env) {
  const id = readCookie(req, COOKIE);
  if (!id) return null;
  const s = await env.DATA.get(`session:${id}`, 'json');
  if (!s) return null;
  // 하루에 한 번 hash 재확인 (깨사모에서 로그아웃했거나 만료되면 세션 종료)
  if (Date.now() - (s.checkedAt || 0) > RECHECK_MS && env.JBCH_DEV_NAME) {
    try {
      const p = await fetchProfile(env, s.hash);
      if (!p.ok) { await env.DATA.delete(`session:${id}`); return null; }
      Object.assign(s, { name: p.name, church: p.church || s.church, checkedAt: Date.now() });
      await env.DATA.put(`session:${id}`, JSON.stringify(s), { expirationTtl: SESSION_TTL });
    } catch { /* 일시적인 네트워크 오류면 기존 세션 유지 */ }
  }
  return { id, ...s };
}

const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers } });

export async function handleAuth(req, env, path) {
  if (path === '/api/me' && req.method === 'GET') {
    const s = await getSession(req, env);
    return json(s ? { loggedIn: true, name: s.name, church: s.church || '', userid: s.userid }
                  : { loggedIn: false, loginAvailable: Boolean(env.JBCH_DEV_NAME && env.JBCH_TOKEN_ID) });
  }

  if (path === '/api/login' && req.method === 'POST') {
    if (!env.JBCH_DEV_NAME || !env.JBCH_TOKEN_ID) return json({ error: '서버에 생명선 API 키가 설정되지 않았습니다' }, 503);
    let body; try { body = await req.json(); } catch { return json({ error: '잘못된 요청' }, 400); }
    const userid = String(body.userid || '').trim().slice(0, 100);
    const password = String(body.password || '').slice(0, 200);
    if (!userid || !password) return json({ error: '아이디와 비밀번호를 입력하세요' }, 400);

    const r = await callJbch(env, '/in/login.php', { Userid: userid, password, device: 'Web', output: '1' });
    const hash = findValue(r, ['hash', 'login_hash', 'token']);
    if (!isOk(r) || !hash) {
      const msg = String(r?.comment || r?.result || '');
      if (/certification|forbidden|권한/i.test(msg)) return json({ error: '로그인 API 권한이 아직 없습니다 (생명선앱스 승인 필요)' }, 502);
      return json({ error: msg && msg !== 'error' ? `로그인 실패: ${msg}` : '아이디 또는 비밀번호가 맞지 않습니다' }, 401);
    }
    const p = await fetchProfile(env, hash);
    if (!p.ok) return json({ error: p.error }, 502);

    const id = randomId();
    const session = { hash, userid, name: p.name, church: p.church, createdAt: Date.now(), checkedAt: Date.now() };
    await env.DATA.put(`session:${id}`, JSON.stringify(session), { expirationTtl: SESSION_TTL });
    return json({ loggedIn: true, name: p.name, church: p.church, userid }, 200, { 'Set-Cookie': sessionCookie(id, SESSION_TTL) });
  }

  if (path === '/api/logout' && req.method === 'POST') {
    const s = await getSession(req, env);
    if (s) {
      await env.DATA.delete(`session:${s.id}`);
      try { await callJbch(env, '/in/logout.php', { hash: s.hash }); } catch { /* 무시 */ }
    }
    return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie('', 0) });
  }

  return null;
}
