// 공과 알림: 웹 푸시 (VAPID + RFC 8291 aes128gcm 암호화)
// - VAPID 키는 처음 쓸 때 자동으로 만들어 KV에 저장한다 (따로 설정할 것 없음)
// - 매일 오전 9시(KST) cron: 이번 주 일요일에 공과가 있는 강사에게, 확인(ack)할 때까지 매일 알림
const enc = new TextEncoder();
const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), c => c.charCodeAt(0));
const concat = (...parts) => { const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out; };
const sha256 = async s => b64u(await crypto.subtle.digest('SHA-256', enc.encode(s)));

// ---------- VAPID ----------
export async function vapidKeys(kv) {
  let k = await kv.get('vapid', 'json');
  if (!k) {
    const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    const priv = await crypto.subtle.exportKey('jwk', pair.privateKey);
    const pub = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
    k = { privateJwk: priv, publicKey: b64u(pub) };
    await kv.put('vapid', JSON.stringify(k));
  }
  return k;
}
async function vapidAuth(endpoint, keys, subject) {
  const aud = new URL(endpoint).origin;
  const header = b64u(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64u(enc.encode(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject })));
  const key = await crypto.subtle.importKey('jwk', keys.privateJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(`${header}.${claims}`));
  return `vapid t=${header}.${claims}.${b64u(sig)}, k=${keys.publicKey}`;
}

// ---------- 페이로드 암호화 (RFC 8291) ----------
async function hkdf(salt, ikm, info, length) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, length * 8));
}
export async function encryptPayload(subscription, payload, { salt = crypto.getRandomValues(new Uint8Array(16)), serverKeys } = {}) {
  const uaPublic = unb64u(subscription.keys.p256dh);
  const authSecret = unb64u(subscription.keys.auth);
  const as = serverKeys || await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', as.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, as.privateKey, 256));
  const ikm = await hkdf(authSecret, shared, concat(enc.encode('WebPush: info\0'), uaPublic, asPublic), 32);
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);
  const aesKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const plain = concat(enc.encode(payload), new Uint8Array([2])); // 마지막 레코드 구분자
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey, plain));
  const rs = new Uint8Array([0, 0, 16, 0]); // 레코드 크기 4096
  return concat(salt, rs, new Uint8Array([asPublic.length]), asPublic, cipher);
}

export async function sendPush(env, subscription, payload, subject) {
  const keys = await vapidKeys(env.DATA);
  const body = await encryptPayload(subscription, JSON.stringify(payload));
  const res = await fetch(subscription.endpoint, {
    method: 'POST',
    headers: { 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', TTL: '86400', Urgency: 'high', Authorization: await vapidAuth(subscription.endpoint, keys, subject) },
    body,
  });
  return res.status;
}

// ---------- 날짜 (KST) ----------
const kstToday = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
function addDays(iso, n) { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
const weekday = iso => new Date(`${iso}T00:00:00Z`).getUTCDay();
// 오늘이 속한 공과 주의 일요일 (월요일~일요일 → 그 주 일요일)
export const lessonSunday = iso => addDays(iso, (7 - weekday(iso)) % 7);

const DEPT_LABEL = { kinder: '유치부', elLow: '초등 1~3학년', elHigh: '초등 4~6학년', middle: '중등부', high: '고등부', youth: '중고등부' };
const norm = s => String(s || '').replace(/\s/g, '');

// 그 일요일에 이 강사가 맡은 공과들
export function lessonsFor(schedule, sunday, teacher) {
  const week = schedule?.weeks?.find(w => w.date === sunday);
  if (!week) return [];
  return Object.entries(week.cells).filter(([, c]) => c && norm(c.teacher) === norm(teacher)).map(([dept, c]) => ({ dept, title: c.title, date: sunday }));
}

// ---------- API ----------
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } });

export async function handlePush(req, env, path, url) {
  if (path === '/api/push/key' && req.method === 'GET') {
    return json({ publicKey: (await vapidKeys(env.DATA)).publicKey });
  }
  if (path === '/api/push/subscribe' && req.method === 'POST') {
    let b; try { b = await req.json(); } catch { return json({ error: '잘못된 요청' }, 400); }
    const sub = b.subscription;
    const teacher = String(b.teacher || '').trim().slice(0, 50);
    if (!teacher || !sub?.endpoint || !/^https:\/\//.test(sub.endpoint) || !sub.keys?.p256dh || !sub.keys?.auth) return json({ error: '구독 정보가 올바르지 않습니다' }, 400);
    const id = await sha256(sub.endpoint);
    await env.DATA.put(`push:${id}`, JSON.stringify({ teacher, subscription: { endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } }, origin: url.origin, createdAt: Date.now() }));
    return json({ ok: true, id });
  }
  if (path === '/api/push/unsubscribe' && req.method === 'POST') {
    let b; try { b = await req.json(); } catch { return json({ error: '잘못된 요청' }, 400); }
    if (b.endpoint) await env.DATA.delete(`push:${await sha256(b.endpoint)}`);
    return json({ ok: true });
  }
  if (path === '/api/push/test' && req.method === 'POST') {
    let b; try { b = await req.json(); } catch { return json({ error: '잘못된 요청' }, 400); }
    if (!b.endpoint) return json({ error: 'endpoint 필요' }, 400);
    const rec = await env.DATA.get(`push:${await sha256(b.endpoint)}`, 'json');
    if (!rec) return json({ error: '구독 정보를 찾을 수 없습니다' }, 404);
    const status = await sendPush(env, rec.subscription, { title: '공과강사 알림 테스트', body: `${rec.teacher} 님, 알림이 잘 설정되었습니다.`, url: '/' }, rec.origin);
    return json({ ok: status < 300, status });
  }
  // 준비 확인 (체크): { teacher, date } → 그 주 알림 중단
  if (path === '/api/ack') {
    if (req.method === 'GET') {
      const teacher = url.searchParams.get('teacher') || '';
      const list = await env.DATA.list({ prefix: `ack:${norm(teacher)}:` });
      return json(list.keys.map(k => k.name.split(':')[2]));
    }
    if (req.method === 'POST' || req.method === 'DELETE') {
      let b; try { b = await req.json(); } catch { return json({ error: '잘못된 요청' }, 400); }
      const teacher = norm(b.teacher).slice(0, 50); const date = String(b.date || '');
      if (!teacher || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ error: 'teacher, date 필요' }, 400);
      if (req.method === 'POST') await env.DATA.put(`ack:${teacher}:${date}`, '1', { expirationTtl: 60 * 24 * 3600 });
      else await env.DATA.delete(`ack:${teacher}:${date}`);
      return json({ ok: true });
    }
  }
  return null;
}

// ---------- 매일 오전 9시 (KST) ----------
export async function runDailyReminders(env, loadSchedule, today = kstToday()) {
  const sunday = lessonSunday(today);
  const schedule = await loadSchedule(sunday.slice(0, 7));
  const result = { today, sunday, sent: 0, skipped: 0, removed: 0 };
  if (!schedule) return result;
  let cursor;
  do {
    const page = await env.DATA.list({ prefix: 'push:', cursor });
    for (const k of page.keys) {
      const rec = await env.DATA.get(k.name, 'json');
      if (!rec) continue;
      const lessons = lessonsFor(schedule, sunday, rec.teacher);
      if (!lessons.length || await env.DATA.get(`ack:${norm(rec.teacher)}:${sunday}`)) { result.skipped++; continue; }
      const [, m, d] = sunday.split('-').map(Number);
      const body = lessons.map(l => `${m}/${d}(일) ${DEPT_LABEL[l.dept] || l.dept} · ${l.title}`).join('\n');
      const first = weekday(today) === 1;
      try {
        const status = await sendPush(env, rec.subscription, {
          title: first ? '이번 주 공과 안내' : '이번 주 공과 준비 확인',
          body: first ? body : `${body}\n아직 확인하지 않았어요. 준비했으면 확인을 눌러 주세요.`,
          teacher: rec.teacher, date: sunday, url: '/',
        }, rec.origin);
        if (status === 404 || status === 410) { await env.DATA.delete(k.name); result.removed++; }
        else if (status < 300) result.sent++;
      } catch { /* 다음 구독 계속 */ }
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return result;
}
