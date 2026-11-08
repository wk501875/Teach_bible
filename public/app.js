// 공과강사: 배정표 → 내 공과 → 교재·영상 자료를 한 곳에서
const SCHOOL_URL = 'https://www.jbch.org/ko/school/?cId=715'; // 전국교회학교 연간공과 일정
const DEPTS = [
  { key: 'kinder', label: '유치부', short: '유치부' },
  { key: 'elLow', label: '초등 1~3학년', short: '초등 1~3' },
  { key: 'elHigh', label: '초등 4~6학년', short: '초등 4~6' },
  { key: 'middle', label: '중등부', short: '중등부' },
  { key: 'high', label: '고등부', short: '고등부' },
];
const YOUTH = { key: 'youth', label: '중고등부 (통합)', short: '중고등' };
const deptLabel = k => (k === 'youth' ? YOUTH.label : DEPTS.find(d => d.key === k)?.label || k);
const DEPT_EMO = { kinder: '🧸', elLow: '✏️', elHigh: '📘', middle: '🎒', high: '🎓', youth: '🎒' };
const DEPT_BAR = { kinder: '#3d7bff', elLow: '#22a45d', elHigh: '#7c5cff', middle: '#ff8a4c', high: '#ff5c9a', youth: '#ff8a4c' };
const MAT_EMO = { youtube: '🎬', pdf: '📄', hwp: '📝', audio: '🎧', file: '🔗' };
const MAT_HINT = { youtube: '앱 안에서 재생', pdf: '앱 안에서 보기', hwp: '바로 다운로드', audio: '앱 안에서 듣기', file: '새 창에서 열기' };

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ls = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
};

const state = {
  user: null, loginAvailable: false, adminLocked: false,
  months: [], schedules: {}, resources: {}, curriculum: {}, curriculumErrors: [],
  me: ls.get('teach.me') || '', monthIdx: 0, dept: 'all', day: '', view: 'mine',
};

// ---------- 날짜 ----------
const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토'];
const todayISO = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
const md = iso => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`;
function fmtDate(iso) { const [y, m, d] = iso.split('-').map(Number); return `${m}/${d} (${WEEKDAY[new Date(y, m - 1, d).getDay()]})`; }
function fmtLong(iso) { const [y, m, d] = iso.split('-').map(Number); return `${m}월 ${d}일 ${WEEKDAY[new Date(y, m - 1, d).getDay()]}요일`; }
const weekNo = iso => Math.ceil(Number(iso.slice(8, 10)) / 7);
function dday(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const [ty, tm, td] = todayISO().split('-').map(Number);
  const diff = Math.round((new Date(y, m - 1, d) - new Date(ty, tm - 1, td)) / 86400000);
  return diff === 0 ? '오늘' : diff > 0 ? `D-${diff}` : `${-diff}일 전`;
}

async function api(path, opts = {}) {
  const r = await fetch(path, opts);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
  return data;
}

async function loadAll() {
  const [months, resources, status, me] = await Promise.all([
    api('/api/schedules'), api('/api/resources'), api('/api/status'), api('/api/me').catch(() => ({ loggedIn: false })),
  ]);
  state.user = me.loggedIn ? me : null; state.loginAvailable = me.loginAvailable !== false;
  state.months = months; state.resources = resources; state.adminLocked = status.adminLocked;
  const list = await Promise.all(months.map(m => api(`/api/schedules/${m}`)));
  state.schedules = Object.fromEntries(list.map(s => [s.month, s]));
  const years = [...new Set(months.map(m => m.slice(0, 4)))];
  await Promise.all(years.map(async y => {
    try {
      const r = await api(`/api/curriculum?year=${y}`);
      state.curriculum[y] = r.schedules;
      for (const [k, e] of Object.entries(r.errors || {})) state.curriculumErrors.push(`${y} ${k}: ${e}`);
    } catch (err) { state.curriculumErrors.push(`${y}: ${err.message}`); }
  }));
  const idx = months.indexOf(todayISO().slice(0, 7));
  state.monthIdx = idx >= 0 ? idx : Math.max(0, months.length - 1);
}

// 모든 배정: [{date, dept, title, teacher, tag}]
function allAssignments() {
  const out = [];
  for (const s of Object.values(state.schedules)) {
    for (const w of s.weeks) {
      for (const [dept, c] of Object.entries(w.cells)) if (c && (c.title || c.teacher)) out.push({ date: w.date, dept, ...c });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}
const allWeeks = () => Object.values(state.schedules).flatMap(s => s.weeks).sort((a, b) => a.date.localeCompare(b.date));
const teacherNames = () => [...new Set(allAssignments().map(a => a.teacher).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ko'));

// ---------- 전국교회학교 연간공과와 매칭 ----------
const SRC = { kinder: 'kinder', elLow: 'elementary', elHigh: 'elementary', middle: 'youth', high: 'youth', youth: 'youth' };
const HIDE = { elLow: ['5,6학년'], elHigh: ['1,2학년'], middle: ['고등부'], high: ['중등부'] }; // 다른 학년 자료 숨김
const KIND_ORDER = { youtube: 0, pdf: 1, hwp: 2, audio: 3, file: 4 };
const norm = t => String(t || '').replace(/[\s.,!?·'"()~\-]/g, '');
function dice(a, b) {
  if (a === b) return 1;
  const grams = s => { const g = new Map(); for (let i = 0; i < s.length - 1; i++) { const k = s.slice(i, i + 2); g.set(k, (g.get(k) || 0) + 1); } return g; };
  const ga = grams(a), gb = grams(b); let hit = 0;
  for (const [k, n] of ga) hit += Math.min(n, gb.get(k) || 0);
  return (2 * hit) / Math.max(1, a.length - 1 + b.length - 1);
}
const daysBetween = (a, b) => Math.abs(new Date(a) - new Date(b)) / 86400000;
// 제목이 비슷한 전국 공과 중 날짜가 가장 가까운 것 (행사로 건너뛰는 주가 있어도 어긋나지 않음)
function findLesson(a) {
  const key = SRC[a.dept]; if (!key || !a.title) return null;
  const y = Number(a.date.slice(0, 4));
  const pool = [y, y - 1].flatMap(yy => state.curriculum[yy]?.[key]?.lessons || []);
  const t = norm(a.title);
  let best = null;
  for (const l of pool) {
    const score = dice(t, norm(l.title));
    if (score < 0.6) continue;
    const dist = daysBetween(l.date, a.date);
    if (!best || score > best.score + 0.05 || (Math.abs(score - best.score) <= 0.05 && dist < best.dist)) best = { lesson: l, score, dist };
  }
  return best?.lesson || null;
}
const sourceLabel = dept => state.curriculum[Object.keys(state.curriculum)[0]]?.[SRC[dept]]?.label || '';
function lessonInfo(a) {
  const l = findLesson(a);
  if (!l) return null;
  const hide = HIDE[a.dept] || [];
  const mats = l.materials.filter(m => !hide.some(h => m.label.includes(h)))
    .sort((x, y) => (KIND_ORDER[x.kind] ?? 9) - (KIND_ORDER[y.kind] ?? 9))
    .map(m => {
      const ext = (m.url.split('?')[0].split('.').pop() || '').toLowerCase();
      return { ...m, name: `${l.no ?? ''}과 ${l.title} ${m.label}${['pdf', 'hwp', 'mp3'].includes(ext) ? '.' + ext : ''}` };
    });
  return { l, mats, sermon: mats.find(m => m.kind === 'youtube'), source: sourceLabel(a.dept) };
}
const matAttrs = m => `data-mat="${m.kind}" data-url="${esc(m.url)}" data-name="${esc(m.name)}"`;
const resAttrs = a => `data-res="${esc(a.title)}" data-dept="${a.dept}" data-date="${a.date}"`;

// 자료 체크리스트
function tasksHtml(a, withManual = true) {
  const info = lessonInfo(a);
  const r = state.resources[a.title] || {};
  const rows = [];
  const row = (emoCls, emo, title, sub, attrs, tag = 'button') =>
    `<${tag} ${tag === 'button' ? 'type="button"' : ''} class="task" ${attrs}><span class="emo ${emoCls}">${emo}</span><span class="txt"><b>${title}</b><small>${sub}</small></span><span class="go">›</span></${tag}>`;
  if (info) {
    for (const m of info.mats) rows.push(row(m.kind, MAT_EMO[m.kind] || '📄', esc(m === info.sermon ? '공과 말씀 영상' : m.label), MAT_HINT[m.kind] || '', matAttrs(m)));
  } else if (state.curriculumErrors.length) {
    rows.push(row('file', '🔗', '연간공과 일정을 불러오지 못했어요', '전국교회학교에서 직접 확인', `href="${SCHOOL_URL}" target="_blank" rel="noopener"`, 'a'));
  }
  if (withManual) {
    if (r.textbook || r.textbookUrl) rows.push(row('file', '📎', esc(r.textbook || '추가 자료'), '강사 추가 자료', r.textbookUrl ? `href="${esc(r.textbookUrl)}" target="_blank" rel="noopener"` : '', 'a'));
    if (r.youtube) rows.push(row('youtube', '🎬', '추가 영상', '강사 추가 자료', `href="${esc(r.youtube)}" target="_blank" rel="noopener"`, 'a'));
    if (r.note) rows.push(`<div class="task"><span class="emo note">🗒️</span><span class="txt"><b>메모</b><small>${esc(r.note)}</small></span></div>`);
  }
  return rows.join('');
}

// 일정 카드
function agendaHtml(a, { big = false, flag = '' } = {}) {
  const info = lessonInfo(a);
  const mine = state.me && a.teacher === state.me;
  const meta = info ? `${info.source} ${info.l.no}과 · ${info.l.preacher}` : (a.teacher ? '' : '특별 일정');
  return `<button type="button" class="agenda ${big ? 'big' : ''} ${mine && !big ? 'mine' : ''}" style="--bar:${info ? DEPT_BAR[a.dept] : '#ffd84d'}" ${resAttrs(a)}>
    ${flag ? `<span class="flag">${flag}</span>` : ''}
    <div class="when"><span class="emo">${DEPT_EMO[a.dept] || '📘'}</span>${fmtDate(a.date)} · ${esc(deptLabel(a.dept))}</div>
    <div class="title">${esc(a.title)}</div>
    <div class="meta">${[a.teacher && `${esc(a.teacher)}${esc(a.tag || '')}`, meta && esc(meta)].filter(Boolean).join(' · ')}</div>
  </button>`;
}

// ---------- 오늘 (내 공과) ----------
function renderMine() {
  const all = allAssignments();
  const names = teacherNames();
  const loginName = state.user?.name?.replace(/\s/g, '');
  const matched = loginName && names.find(n => n.replace(/\s/g, '') === loginName);
  if (matched) state.me = matched;
  const church = Object.values(state.schedules).at(-1)?.church || '일산교회';
  $('#mineEyebrow').textContent = `공과강사 · ${church} 교회학교`;
  $('#mineTitle').textContent = state.me ? `${state.me} 님의 공과` : '내 공과';
  $('#avatarBtn').textContent = state.user ? '😊' : '🙂';

  const body = $('#mineBody');
  const today = todayISO();
  const mine = state.me ? all.filter(a => a.teacher === state.me) : [];
  const upcoming = mine.filter(a => a.date >= today);
  const past = mine.filter(a => a.date < today).reverse();
  const next = upcoming[0];
  $('#mineSub').textContent = state.user && !matched ? `배정표에서 '${state.user.name}' 님을 찾지 못했어요. 아래에서 이름을 골라 주세요.`
    : next ? `다음 공과까지 ${dday(next.date)} · ${fmtLong(next.date)}` : state.me ? '다가오는 배정이 없어요' : '이름을 고르거나 깨사모로 로그인하세요';

  let html = '';
  // 이름 선택 칩 (로그인으로 매칭되지 않았을 때)
  if (!matched) {
    html += `<div class="chips scroll">${names.map(n => `<button class="chip ${n === state.me ? 'active' : ''}" data-me="${esc(n)}">${esc(n)}</button>`).join('')}</div>`;
  }
  if (!state.me) { body.innerHTML = html + `<div class="card empty">위에서 이름을 고르면 내 공과가 나타나요 👆</div>`; return; }

  // 통계 타일
  const month = todayISO().slice(0, 7);
  const thisMonth = mine.filter(a => a.date.startsWith(month)).length;
  const nextInfo = next ? lessonInfo(next) : null;
  html += `<div class="stats">
    <div class="stat peach"><span class="emo">⏰</span><b>${next ? dday(next.date) : '-'}</b><small>다음 공과</small></div>
    <div class="stat lav"><span class="emo">🗓️</span><b>${thisMonth}회</b><small>이번 달 배정</small></div>
    <div class="stat green"><span class="emo">📚</span><b>${nextInfo ? nextInfo.mats.length : 0}개</b><small>준비 자료</small></div>
  </div>`;

  if (next) {
    html += `<p class="section-label">⭐ 다음 공과</p>${agendaHtml(next, { big: true, flag: next.date === today ? 'TODAY' : dday(next.date) })}`;
    const tasks = tasksHtml(next);
    html += `<p class="section-label">준비 자료 · TASKS</p><div class="card"><div class="tasks">${tasks || '<p class="empty">연결된 자료가 없어요</p>'}</div></div>`;
    html += `<div class="actions">${nextInfo?.sermon ? `<button class="btn dark block" ${matAttrs(nextInfo.sermon)}>🎬 공과 말씀 영상 보기</button>` : ''}
      <button class="btn ${nextInfo?.sermon ? '' : 'block'}" ${resAttrs(next)}>🗒️ 메모</button></div>`;
  } else {
    html += `<div class="card empty">다가오는 배정이 없어요. 새 배정표가 오면 '입력'에서 넣어 주세요 ✍️</div>`;
  }

  // 일요일별 이 주의 공과
  const weeks = allWeeks();
  if (!state.day || !weeks.some(w => w.date === state.day)) state.day = (weeks.find(w => w.date >= today) || weeks.at(-1))?.date || '';
  const curMonth = state.day.slice(0, 7);
  const monthWeeks = weeks.filter(w => w.date.startsWith(curMonth));
  if (monthWeeks.length) {
    html += `<p class="section-label">📅 ${Number(curMonth.slice(5))}월 · 이 주의 공과</p>
      <div class="days">${monthWeeks.map(w => {
        const isMine = Object.values(w.cells).some(c => c?.teacher === state.me);
        return `<button class="day ${w.date === state.day ? 'active' : ''} ${isMine ? 'mine' : ''}" data-day="${w.date}"><b>${Number(w.date.slice(8))}</b><small>${weekNo(w.date)}주차</small></button>`;
      }).join('')}</div>`;
    const w = weeks.find(x => x.date === state.day);
    const keys = w.cells.youth ? ['kinder', 'elLow', 'elHigh', 'youth'] : DEPTS.map(d => d.key);
    html += keys.map(k => w.cells[k] && agendaHtml({ date: w.date, dept: k, ...w.cells[k] }, { flag: w.cells[k].teacher === state.me ? 'MINE' : '' })).filter(Boolean).join('');
  }

  if (upcoming.length > 1) html += `<p class="section-label">다가오는 공과</p>${upcoming.slice(1).map(a => agendaHtml(a, { flag: dday(a.date) })).join('')}`;
  if (past.length) html += `<p class="section-label">지난 공과</p>${past.map(a => agendaHtml(a)).join('')}`;
  body.innerHTML = html;
}
$('#mineBody').addEventListener('click', e => {
  const me = e.target.closest('[data-me]');
  if (me) { state.me = me.dataset.me; ls.set('teach.me', state.me); renderAll(); return; }
  const day = e.target.closest('[data-day]');
  if (day) { state.day = day.dataset.day; renderMine(); }
});
$('#avatarBtn').onclick = () => show('settings');

// ---------- 배정표 ----------
function renderDeptChips() {
  const opts = [['all', '전체'], ['kinder', '🧸 유치부'], ['elLow', '✏️ 초등 1~3'], ['elHigh', '📘 초등 4~6'], ['youth', '🎒 중고등부'], ['me', '⭐ 내 공과']];
  $('#deptChips').innerHTML = opts.map(([k, l]) => `<button class="chip ${state.dept === k ? 'active' : ''}" data-dept-chip="${k}">${l}</button>`).join('');
}
$('#deptChips').addEventListener('click', e => {
  const c = e.target.closest('[data-dept-chip]'); if (!c) return;
  state.dept = c.dataset.deptChip; renderTable();
});
const DEPT_ORDER = ['kinder', 'elLow', 'elHigh', 'youth', 'middle', 'high'];
function renderTable() {
  renderDeptChips();
  const month = state.months[state.monthIdx];
  const s = state.schedules[month];
  $('#prevMonth').disabled = state.monthIdx <= 0;
  $('#nextMonth').disabled = state.monthIdx >= state.months.length - 1;
  if (!s) { $('#tableEyebrow').textContent = 'SCHEDULE'; $('#tableSub').textContent = ''; $('#tableBody').innerHTML = `<div class="card empty">'입력'에서 이번 달 배정표를 넣어 주세요.</div>`; return; }
  const [y, m] = month.split('-').map(Number);
  $('#tableEyebrow').textContent = `SCHEDULE · ${y}년 ${m}월`;
  $('#tableSub').textContent = `${s.church || ''} 교회학교 · ${s.weeks.length}주`;
  const today = todayISO();

  if (state.dept === 'all') {
    const cell = (c, k, date, span = false) => {
      if (!c) return `<div class="mx-c blank ${span ? 'span2' : ''}"></div>`;
      const mine = state.me && c.teacher === state.me;
      const info = lessonInfo({ ...c, dept: k, date });
      return `<button class="mx-c ${info ? k : 'event'} ${mine ? 'mine' : ''} ${span ? 'span2' : ''}" ${resAttrs({ ...c, dept: k, date })}>
        <b>${esc(c.title)}</b><small>${mine ? '⭐ ' : ''}${esc(c.teacher)}${esc(c.tag || '')}${info && !mine ? ` · ${info.l.no}과` : ''}</small></button>`;
    };
    const rows = s.weeks.map(w => {
      const youth = w.cells.youth ? cell(w.cells.youth, 'youth', w.date, true) : cell(w.cells.middle, 'middle', w.date) + cell(w.cells.high, 'high', w.date);
      return `<div class="mx-d">${md(w.date)}<small>${w.date === today ? '오늘' : `${weekNo(w.date)}주`}</small></div>${cell(w.cells.kinder, 'kinder', w.date)}${cell(w.cells.elLow, 'elLow', w.date)}${cell(w.cells.elHigh, 'elHigh', w.date)}${youth}`;
    }).join('');
    const myCount = s.weeks.reduce((n, w) => n + Object.values(w.cells).filter(c => c?.teacher === state.me).length, 0);
    $('#tableBody').innerHTML = `
      <div class="matrix-wrap"><div class="matrix">
        <div class="mx-h">일자</div>${DEPTS.map(d => `<div class="mx-h">${d.short}</div>`).join('')}
        ${rows}
      </div></div>
      ${state.me && myCount ? `<div class="alert">⭐ <span><b>${esc(state.me)} 님 공과 ${myCount}개</b>빨간 테두리 칸이 내 공과예요</span></div>` : ''}
      <div class="legend"><span><i style="background:var(--blue-soft)"></i>유치부</span><span><i style="background:var(--green-soft)"></i>초등 1~3</span><span><i style="background:var(--lav-soft)"></i>초등 4~6</span><span><i style="background:var(--peach-soft)"></i>중등·중고등</span><span><i style="background:var(--pink-soft)"></i>고등부</span><span><i style="background:var(--yellow)"></i>집회·행사</span></div>`;
    return;
  }
  // 부서별 / 내 공과 목록
  const match = (k, c) => state.dept === 'me' ? c.teacher === state.me
    : state.dept === 'youth' ? ['middle', 'high', 'youth'].includes(k) : k === state.dept;
  const html = s.weeks.map(w => {
    const items = Object.entries(w.cells).filter(([k, c]) => c && match(k, c))
      .sort(([a], [b]) => DEPT_ORDER.indexOf(a) - DEPT_ORDER.indexOf(b))
      .map(([k, c]) => agendaHtml({ date: w.date, dept: k, ...c }, { flag: w.date === today ? 'TODAY' : '' })).join('');
    return items ? `<p class="section-label">${fmtLong(w.date)} · ${weekNo(w.date)}주차</p>${items}` : '';
  }).join('');
  $('#tableBody').innerHTML = html || `<div class="card empty">${state.dept === 'me' ? (state.me ? '이번 달 내 공과가 없어요' : '설정에서 이름을 고르거나 로그인하세요') : '배정이 없어요'}</div>`;
}
$('#prevMonth').onclick = () => { state.monthIdx--; renderTable(); };
$('#nextMonth').onclick = () => { state.monthIdx++; renderTable(); };

// ---------- 공과 자료 · 메모 시트 ----------
let resEditing = '';
document.addEventListener('click', e => {
  const mat = e.target.closest('[data-mat]');
  if (mat) { e.stopPropagation(); openMaterial(mat.dataset.mat, mat.dataset.url, mat.dataset.name); return; }
  const el = e.target.closest('[data-res]');
  if (!el || !el.dataset.res || e.target.closest('a')) return;
  resEditing = el.dataset.res;
  const a = { title: resEditing, dept: el.dataset.dept, date: el.dataset.date };
  const info = a.dept ? lessonInfo(a) : null;
  const r = state.resources[resEditing] || {};
  $('#resTitle').textContent = resEditing;
  $('#resSub').textContent = [a.date && fmtLong(a.date), a.dept && deptLabel(a.dept), info && `${info.source} ${info.l.no}과`].filter(Boolean).join(' · ');
  const tasks = a.dept ? tasksHtml(a, false) : '';
  $('#resAuto').innerHTML = tasks ? `<p class="section-label">준비 자료</p><div class="tasks">${tasks}</div>` : '';
  $('#resTextbook').value = r.textbook || '';
  $('#resTextbookUrl').value = r.textbookUrl || '';
  $('#resYoutube').value = r.youtube || '';
  $('#resNote').value = r.note || '';
  $('#resMsg').innerHTML = `<a href="${SCHOOL_URL}" target="_blank" rel="noopener">전국교회학교 ↗</a>`;
  $('#resDialog').showModal();
});
$('#resSave').onclick = async () => {
  const resource = {
    textbook: $('#resTextbook').value.trim(), textbookUrl: $('#resTextbookUrl').value.trim(),
    youtube: $('#resYoutube').value.trim(), note: $('#resNote').value.trim(),
  };
  if ([resource.textbookUrl, resource.youtube].some(u => u && !/^https?:\/\//.test(u))) { $('#resMsg').textContent = '링크는 https:// 로 시작해야 해요'; return; }
  const empty = !Object.values(resource).some(Boolean);
  try {
    await api('/api/resources', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: resEditing, resource: empty ? null : resource }) });
    if (empty) delete state.resources[resEditing]; else state.resources[resEditing] = resource;
    $('#resDialog').close();
    renderMine(); renderTable();
  } catch (err) { $('#resMsg').textContent = `저장 실패: ${err.message}`; }
};

// ---------- 배정표 입력 ----------
function sundaysOf(month) {
  const [y, m] = month.split('-').map(Number);
  const out = []; const d = new Date(y, m - 1, 1);
  while (d.getDay() !== 0) d.setDate(d.getDate() + 1);
  while (d.getMonth() === m - 1) { out.push(`${y}-${String(m).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`); d.setDate(d.getDate() + 7); }
  return out;
}
const cellValue = c => (c ? { title: c.title || '', who: `${c.teacher || ''}${c.tag || ''}` } : { title: '', who: '' });
function parseWho(s) {
  const v = s.trim(); const m = v.match(/^(.+?)([A-Za-z])$/);
  return m ? { teacher: m[1].trim(), tag: m[2] } : { teacher: v, tag: '' };
}
function editCell(key, label, c) {
  const v = cellValue(c);
  return `<div class="edit-cell ${key}" data-key="${key}"><span class="dept">${DEPT_EMO[key] || ''} ${label}</span>
    <input data-k="title" placeholder="공과 제목" value="${esc(v.title)}" />
    <input data-k="who" placeholder="담당 (예: 유석준B)" value="${esc(v.who)}" /></div>`;
}
function weekEditor(w) {
  const youth = !!w.cells.youth;
  return `<div class="card edit-week">
    <div class="week-head">
      <input type="date" data-k="date" value="${esc(w.date)}" />
      <label><input type="checkbox" data-k="youth" ${youth ? 'checked' : ''} /> 중고등 통합</label>
      <div class="spacer"></div>
      <button class="x-btn" data-remove-week aria-label="이 주 삭제">✕</button>
    </div>
    <div class="edit-grid">
      ${DEPTS.slice(0, 3).map(d => editCell(d.key, d.label, w.cells[d.key])).join('')}
      ${youth ? editCell('youth', YOUTH.label, w.cells.youth) : editCell('middle', '중등부', w.cells.middle) + editCell('high', '고등부', w.cells.high)}
    </div></div>`;
}
function readWeek(el) {
  const cells = {};
  $$('.edit-cell', el).forEach(c => {
    const title = $('[data-k=title]', c).value.trim(); const who = $('[data-k=who]', c).value;
    if (title || who.trim()) cells[c.dataset.key] = { title, ...parseWho(who) };
  });
  return { date: $('[data-k=date]', el).value, cells };
}
const readEditor = () => $$('.edit-week').map(readWeek).filter(w => w.date).sort((a, b) => a.date.localeCompare(b.date));
function renderEditStats() {
  const weeks = readEditor();
  const cells = weeks.flatMap(w => Object.entries(w.cells).map(([k, c]) => ({ ...c, dept: k, date: w.date })));
  const teachers = new Set(cells.map(c => c.teacher).filter(Boolean)).size;
  const linked = cells.filter(c => lessonInfo(c)).length;
  $('#editStats').innerHTML = `
    <div class="stat peach"><span class="emo">📅</span><b>${weeks.length}</b><small>주</small></div>
    <div class="stat lav"><span class="emo">🧑‍🏫</span><b>${teachers}</b><small>강사</small></div>
    <div class="stat green"><span class="emo">🔗</span><b>${linked}</b><small>자료 연결</small></div>`;
}
function renderEditor(month) {
  $('#editMonth').value = month;
  const s = state.schedules[month];
  $('#editChurch').value = s?.church || '일산교회';
  const weeks = s?.weeks?.length ? s.weeks : sundaysOf(month).map(date => ({ date, cells: {} }));
  $('#editBody').innerHTML = weeks.map(weekEditor).join('');
  $('#editMsg').textContent = s ? '저장된 배정표를 수정해요' : '새 배정표 · 일요일이 자동으로 채워졌어요';
  renderEditStats();
}
$('#editMonth').onchange = e => e.target.value && renderEditor(e.target.value);
$('#editBody').addEventListener('change', e => {
  if (e.target.dataset.k === 'title' || e.target.dataset.k === 'who') return renderEditStats();
  if (e.target.dataset.k !== 'youth') return;
  // 통합 여부를 바꾸면 입력값을 유지한 채 그 주의 칸만 다시 그림
  const weekEl = e.target.closest('.edit-week');
  const cur = readWeek(weekEl);
  if (e.target.checked) {
    cur.cells.youth = cur.cells.middle || cur.cells.high || { title: '', teacher: '', tag: '' };
    delete cur.cells.middle; delete cur.cells.high;
  } else {
    const y = cur.cells.youth; delete cur.cells.youth;
    if (y) { cur.cells.middle = { ...y }; cur.cells.high = { title: y.title, teacher: '', tag: '' }; }
  }
  weekEl.outerHTML = weekEditor(cur);
});
$('#editBody').addEventListener('click', e => { if (e.target.closest('[data-remove-week]')) { e.target.closest('.edit-week').remove(); renderEditStats(); } });
$('#addWeek').onclick = () => {
  const last = readEditor().at(-1)?.date;
  let date = '';
  if (last) { const [y, m, d] = last.split('-').map(Number); const n = new Date(y, m - 1, d + 7); date = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`; }
  $('#editBody').insertAdjacentHTML('beforeend', weekEditor({ date, cells: {} }));
  renderEditStats();
};
$('#saveSchedule').onclick = async () => {
  const month = $('#editMonth').value;
  if (!month) { $('#editMsg').textContent = '월을 선택하세요'; return; }
  const schedule = { month, church: $('#editChurch').value.trim(), weeks: readEditor() };
  const headers = { 'Content-Type': 'application/json' };
  if (state.adminLocked) {
    const pw = prompt('관리자 비밀번호'); if (pw === null) return;
    headers['X-Admin-Password'] = pw;
  }
  try {
    await api(`/api/schedules/${month}`, { method: 'PUT', headers, body: JSON.stringify(schedule) });
    state.schedules[month] = schedule;
    if (!state.months.includes(month)) { state.months.push(month); state.months.sort(); }
    state.monthIdx = state.months.indexOf(month);
    $('#editMsg').textContent = '✅ 저장되었어요';
    renderMine(); renderTable(); renderEditStats();
  } catch (err) { $('#editMsg').textContent = `저장 실패: ${err.message}`; }
};

// ---------- 설정 · 로그인 ----------
function renderSettings() {
  const u = state.user;
  $('#profileCard').innerHTML = u
    ? `<div class="profile"><span class="face">😊</span><div><b>${esc(u.name)}</b><small>${esc(u.church || '')}${u.church ? ' · ' : ''}깨사모 ${esc(u.userid || '')}</small></div></div>`
    : `<div class="profile"><span class="face">🙂</span><div><b>${esc(state.me || '로그인하지 않음')}</b><small>${state.me ? '이름을 직접 선택했어요' : '깨사모로 로그인하면 내 공과를 자동으로 찾아요'}</small></div></div>`;
  const names = teacherNames();
  const rows = [];
  if (u) rows.push(`<button class="set-row" id="logoutBtn"><span class="emo">🚪</span><span class="txt"><b>로그아웃</b><small>이 기기에서 깨사모 로그아웃</small></span><span class="go">›</span></button>`);
  else if (state.loginAvailable) rows.push(`<button class="set-row" id="loginBtn"><span class="emo">🔐</span><span class="txt"><b>깨사모 로그인</b><small>한 번 로그인하면 계속 유지돼요</small></span><span class="go">›</span></button>`);
  if (!u || !names.some(n => n.replace(/\s/g, '') === u.name.replace(/\s/g, ''))) {
    rows.push(`<div class="set-row"><span class="emo">🧑‍🏫</span><span class="txt"><b>내 이름 직접 선택</b><small>배정표에 있는 이름 중에서 골라요</small>
      <select id="meSelect"><option value="">선택하세요</option>${names.map(n => `<option ${n === state.me ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></span></div>`);
  }
  rows.push(`<a class="set-row" href="${SCHOOL_URL}" target="_blank" rel="noopener"><span class="emo">📚</span><span class="txt"><b>전국교회학교 연간공과</b><small>머릿돌 · 참빛 원본 페이지</small></span><span class="go">↗</span></a>`);
  rows.push(`<button class="set-row" id="reloadBtn"><span class="emo">🔄</span><span class="txt"><b>새로고침</b><small>배정표와 연간공과를 다시 불러와요</small></span><span class="go">›</span></button>`);
  $('#settingsRows').innerHTML = rows.join('');
  $('#loginBtn')?.addEventListener('click', () => { $('#loginMsg').textContent = ''; $('#loginDialog').showModal(); $('#loginId').focus(); });
  $('#logoutBtn')?.addEventListener('click', async () => {
    await api('/api/logout', { method: 'POST' }).catch(() => {});
    state.user = null; renderAll();
  });
  $('#meSelect')?.addEventListener('change', e => { state.me = e.target.value; ls.set('teach.me', state.me); renderAll(); });
  $('#reloadBtn')?.addEventListener('click', () => location.reload());
}
$('#loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = $('#loginSubmit'); btn.disabled = true; $('#loginMsg').textContent = '로그인 중…';
  try {
    state.user = await api('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userid: $('#loginId').value, password: $('#loginPw').value }) });
    $('#loginPw').value = '';
    $('#loginDialog').close();
    renderAll(); show('mine');
  } catch (err) { $('#loginMsg').textContent = err.message; }
  finally { btn.disabled = false; }
});

// ---------- 화면 전환 ----------
function renderAll() { renderMine(); renderTable(); renderSettings(); }
function show(view) {
  state.view = view;
  $$('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  $$('[data-section]').forEach(s => s.classList.toggle('hidden', s.dataset.section !== view));
  ls.set('teach.view', view);
  window.scrollTo({ top: 0 });
}
$$('.nav-btn').forEach(b => (b.onclick = () => show(b.dataset.view)));

// ---------- 앱 안에서 자료 보기 / 받기 ----------
const fileUrl = (url, name, dl) => `/api/file?url=${encodeURIComponent(url)}&name=${encodeURIComponent(name)}${dl ? '&dl=1' : ''}`;
const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174';
let pdfjsReady;
function loadPdfJs() {
  pdfjsReady ??= new Promise((resolve, reject) => {
    const sc = document.createElement('script');
    sc.src = `${PDFJS}/pdf.min.js`;
    sc.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = `${PDFJS}/pdf.worker.min.js`; resolve(window.pdfjsLib); };
    sc.onerror = () => { pdfjsReady = null; reject(new Error('PDF 뷰어를 불러오지 못했어요')); };
    document.head.append(sc);
  });
  return pdfjsReady;
}
let viewerToken = 0;
async function renderPdf(src, box, token) {
  box.innerHTML = '<p class="viewer-msg">PDF 불러오는 중…</p>';
  const res = await fetch(src);
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
  const [lib, data] = await Promise.all([loadPdfJs(), res.arrayBuffer()]);
  const pdf = await lib.getDocument({ data }).promise;
  if (token !== viewerToken) return;
  box.innerHTML = '';
  const width = Math.min(box.clientWidth || 800, 1000);
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    if (token !== viewerToken) return;
    const scale = width / page.getViewport({ scale: 1 }).width;
    const ratio = window.devicePixelRatio || 1;
    const vp = page.getViewport({ scale: scale * ratio });
    const canvas = document.createElement('canvas');
    canvas.width = vp.width; canvas.height = vp.height;
    canvas.style.width = `${vp.width / ratio}px`;
    box.append(canvas);
    await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
  }
}
function downloadFile(url, name) {
  const a = document.createElement('a');
  a.href = fileUrl(url, name, true); a.download = name;
  document.body.append(a); a.click(); a.remove();
}
function openMaterial(kind, url, name) {
  if (kind === 'hwp') return downloadFile(url, name);
  if (kind === 'file') return window.open(url, '_blank', 'noopener');
  const box = $('#viewerBody'); const token = ++viewerToken;
  $('#viewerTitle').textContent = name.replace(/\.(pdf|mp3)$/, '');
  $('#viewerSub').textContent = MAT_HINT[kind] || '공과 자료';
  $('#viewerIcon').textContent = MAT_EMO[kind] || '📄';
  const dl = $('#viewerDownload');
  dl.classList.toggle('hidden', kind === 'youtube');
  dl.onclick = () => downloadFile(url, name);
  if (kind === 'youtube') {
    const id = new URL(url).searchParams.get('v');
    box.innerHTML = `<div class="video"><iframe src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?autoplay=1&rel=0" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe></div>`;
  } else if (kind === 'audio') {
    box.innerHTML = `<audio controls autoplay src="${esc(fileUrl(url, name))}"></audio>`;
  } else if (kind === 'pdf') {
    renderPdf(fileUrl(url, name), box, token).catch(err => {
      if (token === viewerToken) box.innerHTML = `<p class="viewer-msg">PDF를 열지 못했어요: ${esc(err.message)}<br><a href="${esc(url)}" target="_blank" rel="noopener">원본 링크로 열기</a></p>`;
    });
  }
  $('#viewer').showModal();
}
$('#viewer').addEventListener('close', () => { viewerToken++; $('#viewerBody').innerHTML = ''; });

// ---------- 시작 ----------
(async () => {
  show(ls.get('teach.view') || 'mine');
  try { await loadAll(); }
  catch (err) { $('#mineBody').innerHTML = `<div class="card empty">서버에 연결할 수 없어요: ${esc(err.message)}</div>`; return; }
  renderAll();
  renderEditor(state.months.at(-1) || todayISO().slice(0, 7));
})();
