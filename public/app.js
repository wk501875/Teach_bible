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
const DEPT_BAR = { kinder: '#3d7bff', elLow: '#22a45d', elHigh: '#7c5cff', middle: '#ff8a4c', high: '#ff5c9a', youth: '#ff8a4c' };
const MAT_KIND = { youtube: '영상', pdf: 'PDF', hwp: 'HWP', audio: '음성', file: '링크' };
// 선 아이콘
const P = {
  home: '<path d="M3 11 12 4l9 7"/><path d="M5 10v10h14V10"/>',
  grid: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M9 4v16"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  chevronLeft: '<path d="m15 18-6-6 6-6"/>', chevronRight: '<path d="m9 18 6-6-6-6"/>',
  close: '<path d="M18 6 6 18M6 6l12 12"/>', user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  check: '<path d="M5 12.5 10 17 19 7"/>',
  external: '<path d="M14 4h6v6"/><path d="M20 4 10 14"/><path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/>',
};
const svg = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ''}</svg>`;
function applyIcons(root = document) { root.querySelectorAll('[data-icon]:empty').forEach(el => { el.innerHTML = svg(el.dataset.icon); }); }

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
  swaps: [], admin: { isAdmin: false, configured: false, admins: [] }, verses: {},
  me: ls.get('teach.me') || '', monthIdx: 0, dept: 'all', day: '', view: 'mine', acks: new Set(), push: { supported: false, on: false, busy: false, msg: '' },
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
  if (r.status === 401 && data.needLogin) lock();
  if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
  return data;
}

async function loadAll() {
  const [months, resources, status] = await Promise.all([api('/api/schedules'), api('/api/resources'), api('/api/status')]);
  state.months = months; state.resources = resources; state.adminLocked = status.adminLocked;
  const [swaps, adm] = await Promise.all([api('/api/swaps').catch(() => []), api('/api/admins').catch(() => null)]);
  state.swaps = swaps; if (adm) state.admin = { isAdmin: adm.isAdmin, configured: adm.configured, admins: adm.admins };
  $('.nav-btn[data-view=edit]').classList.toggle('hidden', !state.admin.isAdmin);
  if (!state.admin.isAdmin && state.view === 'edit') show('mine');
  const list = await Promise.all(months.map(m => api(`/api/schedules/${m}`)));
  state.schedules = Object.fromEntries(list.map(s => [s.month, s]));
  const now = new Date();
  const years = [...new Set([...months.map(m => m.slice(0, 4)), String(now.getFullYear()), ...(now.getMonth() >= 9 ? [String(now.getFullYear() + 1)] : [])])];
  await Promise.all(years.map(async y => {
    try {
      const r = await api(`/api/curriculum?year=${y}`);
      state.curriculum[y] = r.schedules;
      for (const [k, e] of Object.entries(r.errors || {})) state.curriculumErrors.push(`${y} ${k}: ${e}`);
    } catch (err) { state.curriculumErrors.push(`${y}: ${err.message}`); }
  }));
  // 배정표 탭에서 넘겨볼 달: 배정표가 있는 달 + 이번 달 이후 전국 공과가 있는 달
  const cur = todayISO().slice(0, 7);
  const future = Object.values(state.curriculum).flatMap(y => Object.values(y || {}).flatMap(src => src.lessons.map(l => l.date.slice(0, 7)))).filter(m => m >= cur);
  state.tableMonths = [...new Set([...months, ...future])].sort();
  const idx = state.tableMonths.indexOf(cur);
  state.monthIdx = idx >= 0 ? idx : Math.max(0, state.tableMonths.length - 1);
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
  const row = (kind, title, sub, attrs, tag = 'button') =>
    `<${tag} ${tag === 'button' ? 'type="button"' : ''} class="task" ${attrs}><span class="kind ${kind}">${MAT_KIND[kind] || '자료'}</span><span class="txt"><b>${title}</b><small>${sub}</small></span><span class="go">${svg(kind === 'file' ? 'external' : 'chevronRight')}</span></${tag}>`;
  if (info) {
    for (const m of info.mats) {
      const title = m === info.sermon ? '공과 말씀' : m.label.replace(/\s*(영상|PDF|한글|음성|Down)$/i, '') || m.label;
      const label = m.label.endsWith('Down') ? '설교 영상 파일 (구글드라이브)' : title;
      rows.push(row(m.kind, esc(label), '', matAttrs(m)));
    }
  } else if (state.curriculumErrors.length) {
    rows.push(row('file', '연간공과 일정을 불러오지 못했습니다', '전국교회학교 사이트에서 확인', `href="${SCHOOL_URL}" target="_blank" rel="noopener"`, 'a'));
  }
  if (withManual) {
    if (r.textbook || r.textbookUrl) rows.push(row('file', esc(r.textbook || '추가 자료'), '', r.textbookUrl ? `href="${esc(r.textbookUrl)}" target="_blank" rel="noopener"` : '', 'a'));
    if (r.youtube) rows.push(row('youtube', '추가 영상', '', `href="${esc(r.youtube)}" target="_blank" rel="noopener"`, 'a'));
    if (r.note) rows.push(`<div class="task"><span class="kind note">메모</span><span class="txt"><small style="color:var(--ink);font-size:.88rem">${esc(r.note)}</small></span></div>`);
  }
  return rows.join('');
}

// 일정 카드
function agendaHtml(a, { big = false, flag = '', plain = false } = {}) {
  const info = lessonInfo(a);
  const mine = state.me && a.teacher === state.me;
  const meta = info ? `${info.source} ${info.l.no}과` : '';
  return `<button type="button" class="agenda ${big ? 'big' : ''} ${mine && !big && !plain ? 'mine' : ''}" style="--bar:${info ? DEPT_BAR[a.dept] : '#ffd84d'}" ${resAttrs(a)}>
    ${flag ? `<span class="flag">${flag}</span>` : ''}
    <div class="when">${fmtDate(a.date)} · ${esc(deptLabel(a.dept))}</div>
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
  $('#mineEyebrow').textContent = '';
  $('#brandChurch').textContent = church;
  $('#mineTitle').textContent = state.me ? `${state.me} 님의 공과` : '내 공과';
  $('#avatarBtn').innerHTML = state.user ? esc(state.user.name.slice(0, 1)) : svg('user');

  const body = $('#mineBody');
  const today = todayISO();
  const mine = state.me ? all.filter(a => a.teacher === state.me) : [];
  const upcoming = mine.filter(a => a.date >= today);
  const past = mine.filter(a => a.date < today).reverse();
  const next = upcoming[0];
  $('#mineSub').textContent = state.user && !matched ? `배정표에 '${state.user.name}' 이름이 없습니다. 이름을 선택하세요.`
    : next ? `다음 공과 ${fmtLong(next.date)}` : state.me ? '예정된 공과가 없습니다' : '이름을 선택하거나 로그인하세요';

  let html = '';
  // 이름 선택 칩 (로그인으로 매칭되지 않았을 때)
  if (!matched) {
    html += `<div class="chips scroll">${names.map(n => `<button class="chip ${n === state.me ? 'active' : ''}" data-me="${esc(n)}">${esc(n)}</button>`).join('')}</div>`;
  }
  if (!state.me) { body.innerHTML = html + `<div class="card empty">이름을 선택하세요.</div>`; return; }

  // 통계 타일
  const month = todayISO().slice(0, 7);
  const thisMonth = mine.filter(a => a.date.startsWith(month)).length;
  const nextInfo = next ? lessonInfo(next) : null;
  html += `<div class="stats">
    <div class="stat accent"><b>${next ? dday(next.date) : '-'}</b><small>다음 공과</small></div>
    <div class="stat"><b>${thisMonth}회</b><small>이번 달</small></div>
    <div class="stat"><b>${nextInfo ? nextInfo.mats.length : 0}</b><small>자료</small></div>
  </div>`;

  html += swapRequestsHtml();
  if (next) {
    html += `<p class="section-label">다음 공과</p>${agendaHtml(next, { big: true, flag: next.date === today ? '오늘' : dday(next.date) })}`;
    html += verseHtml(next);
    const tasks = tasksHtml(next);
    const acked = state.acks.has(next.date);
    html += `<button class="check-row ${acked ? 'done' : ''}" data-ack="${next.date}">
      <span class="box">${acked ? svg('check') : ''}</span>
      <span><b>${acked ? '공과 준비 확인 완료' : '공과 준비를 확인했어요'}</b><small>${acked ? (state.push.on ? '이번 주 알림이 더 오지 않습니다' : '준비 완료로 표시했습니다') : (state.push.on ? '체크하기 전까지 매일 오전 9시에 알림이 갑니다' : '준비가 끝나면 체크하세요')}</small></span>
    </button>`;
    html += `<div class="actions">${nextInfo?.sermon ? `<button class="btn dark block" ${matAttrs(nextInfo.sermon)}>공과 말씀 영상 보기</button>` : ''}
      <button class="btn ${nextInfo?.sermon ? '' : 'block'}" ${resAttrs(next)}>메모</button></div>
      <div class="actions">${swapButton(next)}<a class="btn cal-btn" href="${calUrl(next.date)}">캘린더에 추가</a></div>`;
    html += `<p class="section-label">자료</p><div class="card"><div class="tasks">${tasks || '<p class="empty">연결된 자료가 없습니다</p>'}</div></div>`;
  } else {
    html += `<div class="card empty">예정된 공과가 없습니다.</div>`;
  }

  // 일요일별 이 주의 공과
  const weeks = allWeeks();
  if (!state.day || !weeks.some(w => w.date === state.day)) state.day = (weeks.find(w => w.date >= today) || weeks.at(-1))?.date || '';
  const curMonth = state.day.slice(0, 7);
  const monthWeeks = weeks.filter(w => w.date.startsWith(curMonth));
  if (monthWeeks.length) {
    html += `<p class="section-label">${Number(curMonth.slice(5))}월 주별 공과</p>
      <div class="days">${monthWeeks.map(w => {
        const isMine = Object.values(w.cells).some(c => c?.teacher === state.me);
        return `<button class="day ${w.date === state.day ? 'active' : ''} ${isMine ? 'mine' : ''}" data-day="${w.date}"><b>${Number(w.date.slice(8))}</b><small>${weekNo(w.date)}주차</small></button>`;
      }).join('')}</div>`;
    const w = weeks.find(x => x.date === state.day);
    const keys = w.cells.youth ? ['kinder', 'elLow', 'elHigh', 'youth'] : DEPTS.map(d => d.key);
    html += keys.map(k => w.cells[k] && agendaHtml({ date: w.date, dept: k, ...w.cells[k] }, { flag: w.cells[k].teacher === state.me ? '내 공과' : '' })).filter(Boolean).join('');
  }

  if (upcoming.length > 1) html += `<p class="section-label">다가오는 공과</p>${upcoming.slice(1).map(a => agendaHtml(a, { flag: dday(a.date), plain: true })).join('')}`;
  // 배정표 이후의 전국 공과 미리보기 (가장 최근에 맡은 부서 기준)
  const lastDept = mine.at(-1)?.dept;
  if (lastDept) {
    const after = lastAssignedDate();
    const src = SRC[lastDept];
    const ahead = nationalLessons(src).filter(l => l.date > after).slice(0, 4);
    if (ahead.length) {
      const label = { kinder: '유치부', elementary: '초등부', youth: '중고등부' }[src];
      html += `<p class="section-label">앞으로의 ${label} 공과 <span class="muted" style="font-weight:500">· 배정 전, 전국 일정 기준</span></p>`;
      html += ahead.map(l => agendaHtml({ date: l.date, dept: lastDept, title: l.title, teacher: '' }).replace(esc(deptLabel(lastDept)), label)).join('');
    }
  }
  if (past.length) html += `<p class="section-label">지난 공과</p>${past.map(a => agendaHtml(a, { plain: true })).join('')}`;
  body.innerHTML = html;
}
$('#mineBody').addEventListener('click', e => {
  const me = e.target.closest('[data-me]');
  if (me) { setMe(me.dataset.me); return; }
  const day = e.target.closest('[data-day]');
  if (day) { state.day = day.dataset.day; renderMine(); return; }
  const ack = e.target.closest('[data-ack]');
  if (ack) toggleAck(ack.dataset.ack);
});
// 교환 버튼은 어느 화면에서든 동작
document.addEventListener('click', e => {
  const n = e.target.closest('[data-swap-new]');
  if (n) { e.stopPropagation(); openSwapNew(n.dataset.date, n.dataset.dept); return; }
  const t = e.target.closest('[data-swap-take]');
  if (t) { e.stopPropagation(); openSwapTake(t.dataset.swapTake); return; }
  const c = e.target.closest('[data-swap-cancel]');
  if (c) { e.stopPropagation(); cancelSwap(c.dataset.swapCancel); }
}, true);
$('#avatarBtn').onclick = () => show('settings');

// ---------- 전국 일정 (배정 전) ----------
// 부서 키 → 전국 일정 출처
const NAT_COLS = [['kinder', 'kinder', '유치부'], ['elementary', 'elLow', '초등부'], ['youth', 'youth', '중고등부']];
function nationalLessons(srcKey) {
  return Object.values(state.curriculum).flatMap(y => y?.[srcKey]?.lessons || []).sort((a, b) => a.date.localeCompare(b.date));
}
const lastAssignedDate = () => allWeeks().at(-1)?.date || '';

// ---------- 배정표 ----------
function renderDeptChips() {
  const opts = [['all', '전체'], ['me', '내 공과'], ['kinder', '유치부'], ['elLow', '초등 1~3'], ['elHigh', '초등 4~6'], ['youth', '중고등부'], ['stats', '강사 통계']];
  $('#deptChips').innerHTML = opts.map(([k, l]) => `<button class="chip ${state.dept === k ? 'active' : ''}" data-dept-chip="${k}">${l}</button>`).join('');
}
$('#deptChips').addEventListener('click', e => {
  const c = e.target.closest('[data-dept-chip]'); if (!c) return;
  state.dept = c.dataset.deptChip; renderTable();
});
const DEPT_ORDER = ['kinder', 'elLow', 'elHigh', 'youth', 'middle', 'high'];
function renderTable() {
  renderDeptChips();
  const months = state.tableMonths || state.months;
  const month = months[state.monthIdx];
  const s = state.schedules[month];
  $('#prevMonth').disabled = state.monthIdx <= 0;
  $('#nextMonth').disabled = state.monthIdx >= months.length - 1;
  if (state.dept === 'stats') return renderStats(month);
  if (!s) return renderNational(month);
  const [y, m] = month.split('-').map(Number);
  $('#tableEyebrow').textContent = '';
  $('#tableSub').textContent = `${y}년 ${m}월`;
  const today = todayISO();

  if (state.dept === 'all') {
    const cell = (c, k, date, span = false) => {
      if (!c) return `<div class="mx-c blank ${span ? 'span2' : ''}"></div>`;
      const mine = state.me && c.teacher === state.me;
      const info = lessonInfo({ ...c, dept: k, date });
      return `<button class="mx-c ${info ? k : 'event'} ${mine ? 'mine' : ''} ${span ? 'span2' : ''}" ${resAttrs({ ...c, dept: k, date })}>
        <b>${esc(c.title)}</b><small>${esc(c.teacher)}${esc(c.tag || '')}${info ? ` · ${info.l.no}과` : ''}</small></button>`;
    };
    const rows = s.weeks.map(w => {
      const youth = w.cells.youth ? cell(w.cells.youth, 'youth', w.date, true) : cell(w.cells.middle, 'middle', w.date) + cell(w.cells.high, 'high', w.date);
      return `<div class="mx-d">${md(w.date)}<small>${w.date === today ? '오늘' : ''}</small></div>${cell(w.cells.kinder, 'kinder', w.date)}${cell(w.cells.elLow, 'elLow', w.date)}${cell(w.cells.elHigh, 'elHigh', w.date)}${youth}`;
    }).join('');
    $('#tableBody').innerHTML = `
      <div class="matrix-wrap"><div class="matrix">
        <div class="mx-h">일자</div>${DEPTS.map(d => `<div class="mx-h">${d.short}</div>`).join('')}
        ${rows}
      </div></div>
      <div class="legend"><span><i style="background:var(--blue-soft)"></i>유치부</span><span><i style="background:var(--green-soft)"></i>초등 1~3</span><span><i style="background:var(--lav-soft)"></i>초등 4~6</span><span><i style="background:var(--peach-soft)"></i>중등·중고등</span><span><i style="background:var(--pink-soft)"></i>고등부</span><span><i style="background:var(--yellow-soft)"></i>집회·행사</span>${state.me ? '<span><i style="background:#fff;box-shadow:inset 0 0 0 2px var(--pink)"></i>내 공과</span>' : ''}</div>`;
    return;
  }
  // 부서별 / 내 공과 목록
  const match = (k, c) => state.dept === 'me' ? c.teacher === state.me
    : state.dept === 'youth' ? ['middle', 'high', 'youth'].includes(k) : k === state.dept;
  const html = s.weeks.map(w => {
    const items = Object.entries(w.cells).filter(([k, c]) => c && match(k, c))
      .sort(([a], [b]) => DEPT_ORDER.indexOf(a) - DEPT_ORDER.indexOf(b))
      .map(([k, c]) => agendaHtml({ date: w.date, dept: k, ...c }, { flag: w.date === today ? '오늘' : '' })).join('');
    return items ? `<p class="section-label">${fmtLong(w.date)}</p>${items}` : '';
  }).join('');
  $('#tableBody').innerHTML = html || `<div class="card empty">${state.dept === 'me' ? (state.me ? '이번 달에는 공과가 없습니다' : '이름을 선택하거나 로그인하세요') : '배정이 없습니다'}</div>`;
}
// 배정표가 아직 없는 달: 전국 연간공과 일정으로 보여줌
function renderNational(month) {
  if (!month) { $('#tableEyebrow').textContent = ''; $('#tableSub').textContent = ''; $('#tableBody').innerHTML = `<div class="card empty">배정표가 없습니다.</div>`; return; }
  const [y, m] = month.split('-').map(Number);
  $('#tableEyebrow').textContent = '배정 전 · 전국 일정 기준';
  $('#tableSub').textContent = `${y}년 ${m}월`;
  const byDate = {};
  for (const [src, dept] of NAT_COLS) {
    for (const l of nationalLessons(src)) if (l.date.startsWith(month)) (byDate[l.date] ??= {})[dept] = l;
  }
  const dates = Object.keys(byDate).sort();
  if (!dates.length) { $('#tableBody').innerHTML = `<div class="card empty">아직 올라온 공과가 없습니다.</div>`; return; }
  const filter = state.dept;
  const show = dept => filter === 'all' || filter === 'me' || (filter === 'youth' ? dept === 'youth' : filter === 'kinder' ? dept === 'kinder' : dept === 'elLow');
  const card = (date, dept, l) => agendaHtml({ date, dept, title: l.title, teacher: '' });
  const html = dates.map(d => {
    const items = NAT_COLS.filter(([, dept]) => byDate[d][dept] && show(dept)).map(([, dept, label]) => card(d, dept, byDate[d][dept]).replace(esc(deptLabel(dept)), label)).join('');
    return items ? `<p class="section-label">${fmtLong(d)}</p>${items}` : '';
  }).join('');
  $('#tableBody').innerHTML = `<p class="hint" style="margin:0 2px 4px">일산교회 배정표가 아직 없어 전국 연간공과 일정을 보여줍니다. 집회·행사로 날짜가 달라질 수 있습니다.</p>${html}`;
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
  const cell = a.dept && allAssignments().find(x => x.date === a.date && x.dept === a.dept);
  const canSwap = cell && state.me && cell.teacher === state.me && a.date >= todayISO();
  state.sheetLesson = a.dept ? { ...a } : null;
  $('#resAuto').innerHTML = (a.dept ? verseHtml(a) : '') + (canSwap ? `<div class="actions">${swapButton(cell)}</div>` : '') + (tasks ? `<div class="tasks">${tasks}</div>` : '');
  $('#resTextbook').value = r.textbook || '';
  $('#resTextbookUrl').value = r.textbookUrl || '';
  $('#resYoutube').value = r.youtube || '';
  $('#resNote').value = r.note || '';
  $('#resMsg').textContent = '';
  $('#resDialog').showModal();
});
$('#resSave').onclick = async () => {
  const resource = {
    textbook: $('#resTextbook').value.trim(), textbookUrl: $('#resTextbookUrl').value.trim(),
    youtube: $('#resYoutube').value.trim(), note: $('#resNote').value.trim(),
  };
  if ([resource.textbookUrl, resource.youtube].some(u => u && !/^https?:\/\//.test(u))) { $('#resMsg').textContent = '링크는 https://로 시작해야 합니다'; return; }
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
  return `<div class="edit-cell ${key}" data-key="${key}"><span class="dept">${label}</span>
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
      <button class="x-btn" data-remove-week aria-label="이 주 삭제">${svg('close')}</button>
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
    <div class="stat"><b>${weeks.length}</b><small>주</small></div>
    <div class="stat"><b>${teachers}</b><small>강사</small></div>
    <div class="stat"><b>${linked}</b><small>자료 연결</small></div>`;
}
function fillEditor(weeks) {
  $('#editBody').innerHTML = weeks.map(weekEditor).join('');
  renderEditStats();
}
function renderEditor(month) {
  $('#editMonth').value = month;
  const s = state.schedules[month];
  $('#editChurch').value = s?.church || '일산교회';
  const weeks = s?.weeks?.length ? s.weeks : sundaysOf(month).map(date => ({ date, cells: {} }));
  $('#editBody').innerHTML = weeks.map(weekEditor).join('');
  $('#editMsg').textContent = s ? '' : '새 배정표';
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
  if (state.adminLocked && !state.admin.isAdmin) {
    const pw = prompt('관리자 비밀번호'); if (pw === null) return;
    headers['X-Admin-Password'] = pw;
  }
  try {
    await api(`/api/schedules/${month}`, { method: 'PUT', headers, body: JSON.stringify(schedule) });
    state.schedules[month] = schedule;
    if (!state.months.includes(month)) { state.months.push(month); state.months.sort(); }
    if (state.tableMonths && !state.tableMonths.includes(month)) { state.tableMonths.push(month); state.tableMonths.sort(); }
    state.monthIdx = (state.tableMonths || state.months).indexOf(month);
    $('#editMsg').textContent = '저장했습니다';
    renderMine(); renderTable(); renderEditStats();
  } catch (err) { $('#editMsg').textContent = `저장 실패: ${err.message}`; }
};

// ---------- 설정 · 로그인 ----------
function renderSettings() {
  const u = state.user;
  $('#profileCard').innerHTML = u
    ? `<div class="profile"><span class="face">${esc(u.name.slice(0, 1))}</span><div><b>${esc(u.name)}</b><small>${[u.church, u.userid].filter(Boolean).map(esc).join(' · ')}</small></div></div>`
    : `<div class="profile"><span class="face">${state.me ? esc(state.me.slice(0, 1)) : svg('user')}</span><div><b>${esc(state.me || '로그인 안 됨')}</b><small>${state.me ? '직접 선택한 이름' : '깨사모로 로그인하세요'}</small></div></div>`;
  const names = teacherNames();
  const rows = [];
  const go = svg('chevronRight');
  const p = state.push;
  const inApp = /KAKAOTALK|NAVER|Instagram|FBAN|FBAV|Line\//i.test(navigator.userAgent);
  const pushSub = inApp ? '카카오톡 등 앱 안의 브라우저에서는 알림을 켤 수 없습니다. 크롬에서 열어 주세요'
    : !p.supported ? (isIOS() ? '아이폰은 공유 → 홈 화면에 추가한 뒤 켤 수 있습니다. 아래 캘린더 추가를 쓰셔도 됩니다' : '이 브라우저는 알림을 지원하지 않습니다. 아래 캘린더 추가를 이용하세요')
    : !state.me ? '이름을 먼저 선택하세요'
    : p.msg || (p.on ? '공과가 있는 주 월요일 오전 9시, 확인할 때까지 매일' : '공과가 있는 주에 알림을 받습니다');
  rows.push(`<div class="set-row"><span class="txt"><b>공과 알림</b><small ${p.error ? 'style="color:var(--red)"' : p.busy ? 'style="color:var(--blue)"' : ''}>${esc(pushSub)}</small>
    ${p.on ? '<span class="sub-actions"><button class="btn small" id="pushTest">테스트 알림 보내기</button></span>' : ''}
    ${!p.on && (p.busy || p.error) && p.diag ? `<small style="display:block;margin-top:6px;font-size:.7rem;color:var(--muted)">${esc(p.diag)}</small>` : ''}</span>
    ${p.supported && state.me ? `<button class="toggle ${p.on ? 'on' : ''}" id="pushToggle" aria-label="공과 알림" ${p.busy ? 'disabled' : ''}></button>` : ''}</div>`);
  rows.push(adminRowsHtml());
  if (u) rows.push(`<button class="set-row" id="logoutBtn"><span class="txt"><b>로그아웃</b></span><span class="go">${go}</span></button>`);
  if (!u || !names.some(n => n.replace(/\s/g, '') === u.name.replace(/\s/g, ''))) {
    rows.push(`<div class="set-row"><span class="txt"><b>내 이름</b>
      <select id="meSelect"><option value="">선택하세요</option>${names.map(n => `<option ${n === state.me ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></span></div>`);
  }
  if (state.me) rows.push(`<a class="set-row" href="${calUrl()}"><span class="txt"><b>내 공과 전체를 캘린더에 추가</b><small>어떤 브라우저든 됩니다. 공과 주 월요일·토요일 오전 9시에 캘린더가 알려줍니다${inApp ? ' (카카오톡 안에서는 안 될 수 있어요)' : ''}</small></span><span class="go">${go}</span></a>`);
  rows.push(`<a class="set-row" href="${SCHOOL_URL}" target="_blank" rel="noopener"><span class="txt"><b>전국교회학교 연간공과</b></span><span class="go">${svg('external')}</span></a>`);
  rows.push(`<button class="set-row" id="reloadBtn"><span class="txt"><b>새로고침</b></span><span class="go">${go}</span></button>`);
  $('#settingsRows').innerHTML = rows.join('');
  $('#logoutBtn')?.addEventListener('click', async () => {
    await api('/api/logout', { method: 'POST' }).catch(() => {});
    state.user = null; lock();
  });
  $('#meSelect')?.addEventListener('change', e => setMe(e.target.value));
  $('#reloadBtn')?.addEventListener('click', () => location.reload());
  bindAdminRows();
  $('#pushToggle')?.addEventListener('click', togglePush);
  $('#pushTest')?.addEventListener('click', testPush);
}
$('#loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = $('#loginSubmit'); btn.disabled = true; $('#loginMsg').textContent = '로그인 중…';
  try {
    state.user = await api('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userid: $('#loginId').value, password: $('#loginPw').value }) });
    $('#loginPw').value = '';
    await start();
  } catch (err) { $('#loginMsg').textContent = err.message; }
  finally { btn.disabled = false; }
});

const calUrl = date => `/api/calendar.ics?teacher=${encodeURIComponent(state.me)}${date ? `&date=${date}` : ''}`;

// ---------- 본문 · 암송 (공과 PDF에서 읽어 서버에 함께 저장) ----------
const BIBLE_FULL = '창세기 출애굽기 레위기 민수기 신명기 여호수아 사사기 룻기 사무엘상 사무엘하 열왕기상 열왕기하 역대상 역대하 에스라 느헤미야 에스더 욥기 시편 잠언 전도서 아가 이사야 예레미야애가 예레미야 에스겔 다니엘 호세아 요엘 아모스 오바댜 요나 미가 나훔 하박국 스바냐 학개 스가랴 말라기 마태복음 마가복음 누가복음 요한복음 사도행전 로마서 고린도전서 고린도후서 갈라디아서 에베소서 빌립보서 골로새서 데살로니가전서 데살로니가후서 디모데전서 디모데후서 디도서 빌레몬서 히브리서 야고보서 베드로전서 베드로후서 요한일서 요한이서 요한삼서 유다서 요한계시록'.split(' ');
const BIBLE_ABBR = '창 출 레 민 신 수 삿 룻 삼상 삼하 왕상 왕하 대상 대하 스 느 에 욥 시 잠 전 아 사 렘 애 겔 단 호 욜 암 옵 욘 미 나 합 습 학 슥 말 마 막 눅 요 행 롬 고전 고후 갈 엡 빌 골 살전 살후 딤전 딤후 딛 몬 히 약 벧전 벧후 요일 요이 요삼 유 계'.split(' ');
const BOOK_RE = [...BIBLE_FULL, ...BIBLE_ABBR].sort((a, b) => b.length - a.length).join('|');
function parseVerse(text) {
  const t = text.replace(/\s+/g, ' ');
  const p1 = t.match(new RegExp(`(${BIBLE_FULL.join('|')})\\s?(\\d+)\\s?장\\s?(\\d+)\\s?절?\\s?[~\\-]\\s?(\\d+)\\s?절`));
  const p2 = t.match(new RegExp(`(${BOOK_RE})\\s?(\\d+)\\s?:\\s?(\\d+)\\s?[~\\-]\\s?(\\d+)`));
  const passage = p1 ? `${p1[1]} ${p1[2]}장 ${p1[3]}~${p1[4]}절` : p2 ? `${p2[1]} ${p2[2]}:${p2[3]}~${p2[4]}` : '';
  const anchors = [...t.matchAll(/암\s?송|마음판에 새기기/g)].map(m => m.index);
  let best = null;
  const refRe = new RegExp(`\\(\\s?(${BOOK_RE})\\s?(\\d+)\\s?(?::|장)\\s?(\\d+(?:\\s?[~\\-]\\s?\\d+)?)\\s?절?\\s?\\)`, 'g');
  if (anchors.length) for (const m of t.matchAll(refRe)) {
    const d = Math.min(...anchors.map(a => Math.abs(a - m.index)));
    if (d < 450 && (!best || d < best.d)) best = { m, d };
  }
  let verse = '', ref = '';
  if (best) {
    const before = t.slice(Math.max(0, best.m.index - 300), best.m.index);
    verse = before.split(/[.?!”"」\]]\s*|\)\s*/).pop().replace(/(.{3,}?)\1/g, '$1').replace(/^.*말 씀/, '').replace(/^.*새기기/, '').replace(/^[\d\s①-⑳]+/, '').trim();
    if (verse.length < 8 || /[A-Za-z]{4,}/.test(verse)) verse = '';
    else ref = `${best.m[1]} ${best.m[2]}:${best.m[3].replace(/\s/g, '')}`;
  }
  return { passage, verse, ref };
}
// 부서에 맞는 학생 공과 PDF
function versePdf(a) {
  const info = lessonInfo(a); if (!info) return '';
  const pdfs = info.mats.filter(m => m.kind === 'pdf');
  return (a.dept === 'elHigh' ? pdfs.at(-1) : pdfs[0])?.url || '';
}
function verseHtml(a) {
  const url = versePdf(a); if (!url) return '';
  const v = state.verses[url];
  if (v === undefined) ensureVerse(url);
  if (!v) return `<div class="verse-card loading" data-verse="${esc(url)}">본문·암송 불러오는 중…</div>`;
  if (!v.passage && !v.verse) return '';
  return `<div class="verse-card" data-verse="${esc(url)}">
    ${v.passage ? `<div class="v-row"><span class="v-k">본문</span><span class="v-t">${esc(v.passage)}</span></div>` : ''}
    ${v.verse ? `<div class="v-row"><span class="v-k">암송</span><span class="v-t">${esc(v.verse)}${v.ref ? ` <em>(${esc(v.ref)})</em>` : ''}</span></div>` : ''}
  </div>`;
}
async function ensureVerse(url) {
  if (state.verses[url] !== undefined) return;
  state.verses[url] = null;
  try {
    const cached = await api(`/api/verses?urls=${encodeURIComponent(url)}`);
    if (cached[url]) state.verses[url] = cached[url];
    else {
      const res = await fetch(fileUrl(url, 'lesson.pdf'));
      if (!res.ok) throw new Error('pdf');
      const [lib, data] = await Promise.all([loadPdfJs(), res.arrayBuffer()]);
      const pdf = await lib.getDocument({ data }).promise;
      let text = '';
      for (let i = 1; i <= Math.min(pdf.numPages, 12); i++) text += (await (await pdf.getPage(i)).getTextContent()).items.map(x => x.str).join('') + '\n';
      const v = parseVerse(text);
      state.verses[url] = v;
      api('/api/verses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url, ...v }) }).catch(() => {});
    }
  } catch { state.verses[url] = { passage: '', verse: '' }; }
  // 해당 카드만 다시 그림
  renderMine();
  if ($('#resDialog').open && state.sheetLesson && versePdf(state.sheetLesson) === url) {
    const box = $('#resAuto .verse-card'); if (box) box.outerHTML = verseHtml(state.sheetLesson) || '';
  }
}

// ---------- 공과 교환 ----------
const openSwaps = () => state.swaps.filter(x => x.status === 'open' && x.date >= todayISO());
const swapFor = a => openSwaps().find(x => x.date === a.date && x.dept === a.dept);
function swapButton(a) {
  const sw = swapFor(a);
  return sw ? `<button class="btn" data-swap-cancel="${sw.id}">교환 요청 중 · 취소</button>`
            : `<button class="btn" data-swap-new data-date="${a.date}" data-dept="${a.dept}">교환 요청</button>`;
}
function swapRequestsHtml() {
  const others = openSwaps().filter(x => x.from.teacher !== state.me);
  const done = state.swaps.filter(x => x.status === 'accepted' && x.date >= todayISO() && (x.from.teacher === state.me || x.to?.teacher === state.me));
  let html = '';
  if (others.length) {
    html += `<p class="section-label">공과 교환 요청 <span class="count">${others.length}</span></p>`;
    html += others.map(x => `<div class="swap-card">
      <div class="when">${fmtDate(x.date)} · ${esc(deptLabel(x.dept))}</div>
      <div class="title">${esc(x.title)}</div>
      <div class="meta">${esc(x.from.teacher)} 님${x.note ? ` · “${esc(x.note)}”` : ''}</div>
      <button class="btn dark small" data-swap-take="${x.id}">제가 맡을게요</button></div>`).join('');
  }
  if (done.length) {
    html += done.map(x => `<div class="swap-note">${x.from.teacher === state.me
      ? `${esc(x.to.teacher)} 님이 ${md(x.date)} ${esc(deptLabel(x.dept))} 공과를 맡아 주셨어요${x.give ? ` (대신 ${md(x.give.date)} 공과를 맡게 되었어요)` : ''}`
      : `${md(x.date)} ${esc(deptLabel(x.dept))} 「${esc(x.title)}」을(를) ${esc(x.from.teacher)} 님 대신 맡았어요`}</div>`).join('');
  }
  return html;
}
let swapCtx = null;
function openSwapNew(date, dept) {
  const a = allAssignments().find(x => x.date === date && x.dept === dept);
  if (!a) return;
  swapCtx = { mode: 'new', a };
  $('#swapTitle').textContent = '공과 교환 요청';
  $('#swapSub').textContent = `${fmtLong(date)} · ${deptLabel(dept)}`;
  $('#swapBody').innerHTML = `<div class="agenda static"><div class="title">${esc(a.title)}</div></div>
    <label class="field">남길 말 (선택)<textarea id="swapNote" rows="2" placeholder="예: 그 주 출장이 있어요"></textarea></label>
    <p class="hint">요청을 올리면 다른 강사님들께 보이고, 알림을 켠 분들께 알림이 갑니다. 누군가 수락하면 배정표가 자동으로 바뀝니다.</p>`;
  $('#swapSubmit').textContent = '요청 올리기';
  $('#swapMsg').textContent = '';
  $('#resDialog').open && $('#resDialog').close();
  $('#swapDialog').showModal();
}
function openSwapTake(id) {
  const x = state.swaps.find(s => s.id === id); if (!x) return;
  swapCtx = { mode: 'take', x };
  const mine = allAssignments().filter(a => a.teacher === state.me && a.date >= todayISO() && a.date !== x.date);
  $('#swapTitle').textContent = '공과 맡기';
  $('#swapSub').textContent = `${fmtLong(x.date)} · ${deptLabel(x.dept)} · ${x.from.teacher} 님`;
  $('#swapBody').innerHTML = `<div class="agenda static"><div class="title">${esc(x.title)}</div>${x.note ? `<div class="meta">“${esc(x.note)}”</div>` : ''}</div>
    <label class="radio"><input type="radio" name="swapMode" value="cover" checked /> 대신 맡기 <small>이 공과만 제가 맡아요</small></label>
    <label class="radio ${mine.length ? '' : 'disabled'}"><input type="radio" name="swapMode" value="trade" ${mine.length ? '' : 'disabled'} /> 내 공과와 맞바꾸기 <small>${mine.length ? '제 공과 하나를 대신 드려요' : '맞바꿀 내 공과가 없어요'}</small></label>
    ${mine.length ? `<select id="swapGive" class="hidden">${mine.map(a => `<option value="${a.date}|${a.dept}">${fmtDate(a.date)} ${esc(deptLabel(a.dept))} · ${esc(a.title)}</option>`).join('')}</select>` : ''}`;
  $('#swapBody').onchange = () => $('#swapGive')?.classList.toggle('hidden', $('input[name=swapMode]:checked')?.value !== 'trade');
  $('#swapSubmit').textContent = '맡을게요';
  $('#swapMsg').textContent = '';
  $('#swapDialog').showModal();
}
$('#swapSubmit').onclick = async () => {
  if (!swapCtx) return;
  const btn = $('#swapSubmit'); btn.disabled = true; $('#swapMsg').textContent = '처리 중…';
  try {
    if (swapCtx.mode === 'new') {
      await api('/api/swaps', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ date: swapCtx.a.date, dept: swapCtx.a.dept, note: $('#swapNote').value.trim() }) });
    } else {
      const trade = $('input[name=swapMode]:checked')?.value === 'trade';
      const [giveDate, giveDept] = trade ? $('#swapGive').value.split('|') : [];
      await api(`/api/swaps/${swapCtx.x.id}/accept`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(trade ? { giveDate, giveDept } : {}) });
    }
    $('#swapDialog').close();
    await refreshData();
  } catch (err) { $('#swapMsg').textContent = err.message; }
  btn.disabled = false;
};
async function cancelSwap(id) {
  if (!confirm('교환 요청을 취소할까요?')) return;
  try { await api(`/api/swaps/${id}/cancel`, { method: 'POST' }); await refreshData(); } catch (err) { alert(err.message); }
}
async function refreshData() {
  const keepIdx = state.monthIdx;
  await loadAll(); state.monthIdx = keepIdx;
  renderAll();
  if ($('#resDialog').open) $('#resDialog').close();
}

// ---------- 강사별 통계 ----------
function renderStats(month) {
  const year = (month || todayISO()).slice(0, 4);
  $('#tableEyebrow').textContent = '';
  $('#tableSub').textContent = `${year}년 강사별 공과`;
  const today = todayISO();
  const list = allAssignments().filter(a => a.date.startsWith(year) && a.teacher);
  const by = new Map();
  for (const a of list) {
    const r = by.get(a.teacher) || { name: a.teacher, total: 0, depts: {}, last: '', next: '' };
    r.total++; const g = deptLabel(a.dept).replace(' (통합)', '').replace('학년', ''); r.depts[g] = (r.depts[g] || 0) + 1;
    if (a.date < today) r.last = a.date; else if (!r.next) r.next = a.date;
    by.set(a.teacher, r);
  }
  const rows = [...by.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'ko'));
  const max = Math.max(1, ...rows.map(r => r.total));
  $('#tableBody').innerHTML = `
    <div class="stats"><div class="stat"><b>${list.length}</b><small>배정된 공과</small></div><div class="stat"><b>${rows.length}</b><small>강사</small></div><div class="stat"><b>${rows.length ? (list.length / rows.length).toFixed(1) : 0}</b><small>1인 평균</small></div></div>
    <div class="card"><div class="stat-list">${rows.map(r => `
      <div class="stat-row ${r.name === state.me ? 'me' : ''}">
        <div class="sr-top"><b>${esc(r.name)}</b><span class="sr-count">${r.total}회</span></div>
        <div class="sr-bar"><i style="width:${Math.round(r.total / max * 100)}%"></i></div>
        <div class="sr-meta">${Object.entries(r.depts).map(([k, n]) => `${esc(k)} ${n}`).join(' · ')}${r.next ? ` · 다음 ${md(r.next)}` : r.last ? ` · 최근 ${md(r.last)}` : ''}</div>
      </div>`).join('') || '<p class="empty">배정 기록이 없습니다</p>'}</div></div>
    <p class="hint" style="margin:0 2px">입력된 배정표(${[...new Set(list.map(a => a.date.slice(5, 7)))].map(Number).sort((a, b) => a - b).join(', ')}월) 기준입니다.</p>`;
}

// ---------- 엑셀 붙여넣기 ----------
function parseTSV(text) {
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') q = false; else cell += ch; }
    else if (ch === '"' && cell === '') q = true;
    else if (ch === '\t') { row.push(cell); cell = ''; }
    else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (ch !== '\r') cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim()));
}
function parseCellText(v) {
  const lines = String(v || '').split(/\n/).map(x => x.trim()).filter(Boolean);
  if (!lines.length) return null;
  const last = lines.at(-1);
  if (lines.length >= 2 && /^[가-힣]{2,4}\s?[A-Za-z]?$/.test(last)) return { title: lines.slice(0, -1).join(' '), ...parseWho(last) };
  const m = last.match(/^(.*\S)\s+([가-힣]{2,4}[A-Za-z])$/); // 한 줄에 "제목 이름B"
  if (lines.length === 1 && m) return { title: m[1], ...parseWho(m[2]) };
  return { title: lines.join(' '), teacher: '', tag: '' };
}
function parseDateCell(v, month) {
  const t = String(v || '').trim(); const y = Number(month.slice(0, 4));
  let m = t.match(/(\d{4})[.\-/년]\s?(\d{1,2})[.\-/월]\s?(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = t.match(/(\d{1,2})\s?[./월]\s?(\d{1,2})/);
  if (m) return `${y}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  return '';
}
function pasteToWeeks(text, month) {
  let rows = parseTSV(text);
  // 빈 열(배정표 가운데 여백) 제거
  const width = Math.max(...rows.map(r => r.length));
  const keep = [...Array(width).keys()].filter(i => rows.some(r => (r[i] || '').trim()));
  rows = rows.map(r => keep.map(i => r[i] || ''));
  let cols = ['date', 'kinder', 'elLow', 'elHigh', 'middle', 'high'];
  const head = rows.findIndex(r => r.some(c => /유치/.test(c)) && r.some(c => /중등|고등/.test(c)));
  if (head >= 0) {
    cols = rows[head].map(c => /일자|날짜|주일/.test(c) ? 'date' : /유치/.test(c) ? 'kinder' : /1\s*[~\-]\s*3/.test(c) ? 'elLow' : /4\s*[~\-]\s*6/.test(c) ? 'elHigh' : /중등/.test(c) ? 'middle' : /고등/.test(c) ? 'high' : '');
    if (!cols.includes('date')) cols[0] = 'date';
    rows = rows.slice(head + 1);
  }
  const weeks = [];
  for (const r of rows) {
    const rec = {}; cols.forEach((k, i) => { if (k) rec[k] = r[i]; });
    const date = parseDateCell(rec.date, month);
    if (!date) continue;
    const cells = {};
    for (const k of ['kinder', 'elLow', 'elHigh', 'middle', 'high']) { const c = parseCellText(rec[k]); if (c) cells[k] = c; }
    if (cells.middle && !cells.high) { cells.youth = cells.middle; delete cells.middle; } // 병합된 중고등 칸
    weeks.push({ date, cells });
  }
  return weeks.sort((a, b) => a.date.localeCompare(b.date));
}
$('#pasteApply').onclick = () => {
  const text = $('#pasteBox').value;
  if (!text.trim()) { $('#pasteMsg').textContent = '엑셀에서 표를 복사해 붙여넣어 주세요'; return; }
  const weeks = pasteToWeeks(text, $('#editMonth').value || todayISO().slice(0, 7));
  if (!weeks.length) { $('#pasteMsg').textContent = '날짜가 있는 줄을 찾지 못했습니다. 일자 열까지 함께 복사해 주세요'; return; }
  const mon = weeks[0].date.slice(0, 7);
  if (mon !== $('#editMonth').value) $('#editMonth').value = mon;
  fillEditor(weeks);
  const cells = weeks.reduce((n, w) => n + Object.keys(w.cells).length, 0);
  $('#pasteMsg').textContent = `${weeks.length}주, ${cells}칸을 채웠습니다. 확인한 뒤 저장하세요`;
  $('#editMsg').textContent = '붙여넣기로 채움 · 저장 전';
};

// ---------- 관리자 ----------
function adminRowsHtml() {
  const a = state.admin;
  if (!a.configured) return `<div class="set-row"><span class="txt"><b>관리자 지정</b><small>아직 관리자가 없어 누구나 배정표를 수정할 수 있습니다. 나를 관리자로 지정하면 관리자만 수정할 수 있어요</small>
    <span class="sub-actions"><button class="btn small dark" id="adminClaim">나를 관리자로 지정</button></span></span></div>`;
  if (!a.isAdmin) return '';
  return `<div class="set-row"><span class="txt"><b>관리자</b><small>배정표 입력은 관리자만 할 수 있습니다</small>
    <span class="admin-list">${a.admins.map(id => `<span class="admin-chip">${esc(id)}${id === state.user?.userid ? ' (나)' : ''}<button data-admin-del="${esc(id)}" aria-label="삭제">${svg('close')}</button></span>`).join('')}</span>
    <span class="sub-actions"><input id="adminNew" placeholder="깨사모 아이디" autocapitalize="off" /><button class="btn small" id="adminAdd">추가</button></span>
    <small id="adminMsg"></small></span></div>`;
}
function bindAdminRows() {
  const post = async (method, userid) => {
    try { const r = await api('/api/admins', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userid }) }); state.admin = { ...state.admin, admins: r.admins, configured: r.admins.length > 0, isAdmin: r.admins.includes(state.user?.userid) }; }
    catch (err) { alert(err.message); }
    $('.nav-btn[data-view=edit]').classList.toggle('hidden', !state.admin.isAdmin);
    renderSettings();
  };
  $('#adminClaim')?.addEventListener('click', () => post('POST', state.user?.userid));
  $('#adminAdd')?.addEventListener('click', () => { const v = $('#adminNew').value.trim(); if (v) post('POST', v); });
  $$('[data-admin-del]').forEach(b => b.addEventListener('click', () => { if (confirm(`${b.dataset.adminDel} 관리자를 삭제할까요?`)) post('DELETE', b.dataset.adminDel); }));
}

// ---------- 공과 알림 · 준비 확인 ----------
const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const urlB64ToBytes = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), c => c.charCodeAt(0));
let swReg = null;
async function initPush() {
  state.push.supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  if (!state.push.supported) return;
  try {
    swReg = await navigator.serviceWorker.register('/sw.js');
    api('/api/push/key').then(r => { state.pushKey = r.publicKey; }).catch(() => {});
    const sub = await swReg.pushManager.getSubscription();
    state.push.on = Boolean(sub) && Notification.permission === 'granted';
  } catch { state.push.supported = false; }
}
async function saveSubscription(sub) {
  await api('/api/push/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subscription: sub.toJSON(), teacher: state.me }) });
}
// 알림 진단 (설정 화면에 표시해 원인 파악)
async function pushDiag() {
  const ua = navigator.userAgent;
  const browser = (ua.match(/SamsungBrowser\/[\d.]+/) || ua.match(/KAKAOTALK[\/ ][\d.]+/i) || ua.match(/NAVER\([^)]*\)/) || ua.match(/Whale\/[\d.]+/) || ua.match(/Edg\/[\d.]+/) || ua.match(/CriOS\/[\d.]+/) || ua.match(/Chrome\/[\d.]+/) || ua.match(/Version\/[\d.]+.*Safari/) || ['알 수 없음'])[0];
  let perm = 'Notification' in window ? Notification.permission : '없음';
  try { const st = await navigator.permissions?.query({ name: 'notifications' }); if (st) perm += ` / ${st.state}`; } catch {}
  let sw = '없음';
  try { const r = await navigator.serviceWorker?.getRegistration(); sw = r ? (r.active ? '활성' : r.installing ? '설치 중' : r.waiting ? '대기' : '등록됨') : '미등록'; } catch {}
  const standalone = matchMedia('(display-mode: standalone)').matches ? '홈 화면 앱' : '브라우저';
  state.push.diag = `진단: ${browser} · ${standalone} · 권한 ${perm} · 서비스워커 ${sw} · 푸시 ${'PushManager' in window ? '지원' : '미지원'}`;
}

// 알림 허용 대기: 허용 창 응답, 또는 사용자가 크롬 사이트 설정에서 직접 허용으로 바꾼 경우 둘 다 감지
function waitPermission(early, earlyPerm) {
  return new Promise(resolve => {
    let done = false;
    const finish = v => { if (!done) { done = true; clearInterval(timer); resolve(v); } };
    early?.then(() => finish('granted'), () => {});
    (earlyPerm || Notification.requestPermission()).then(v => { if (v !== 'default') finish(v); }, () => {});
    // 설정에서 바꾸고 돌아오면 이어서 진행
    const timer = setInterval(() => { if (Notification.permission !== 'default') finish(Notification.permission); }, 1000);
    navigator.permissions?.query({ name: 'notifications' }).then(st => { st.onchange = () => { if (st.state !== 'prompt') finish(st.state === 'granted' ? 'granted' : 'denied'); }; }).catch(() => {});
  });
}
// 일정 시간 안에 끝나지 않으면 오류
const withTimeout = (promise, ms, msg) => Promise.race([promise, new Promise((_, rej) => setTimeout(() => rej(new Error(msg)), ms))]);
function pushStep(msg) { state.push.msg = msg; renderSettings(); }
async function togglePush() {
  const p = state.push; if (p.busy) return;
  // 허용 창은 '터치 직후'에 요청해야 뜬다 → 다른 await 보다 먼저, 두 가지 방식으로 동시에 요청
  let early = null, earlyPerm = null;
  if (!p.on && 'Notification' in window && Notification.permission === 'default') {
    if (swReg?.active && state.pushKey) {
      early = swReg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToBytes(state.pushKey) });
      early.catch(() => {});
    }
    try { earlyPerm = Notification.requestPermission(); earlyPerm?.catch?.(() => {}); } catch {}
  }
  p.busy = true; p.error = false;
  pushDiag().then(() => { if (p.busy) renderSettings(); });
  try {
    if (p.on) {
      pushStep('알림을 끄는 중…');
      const sub = await swReg?.pushManager.getSubscription();
      if (sub) { await api('/api/push/unsubscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: sub.endpoint }) }).catch(() => {}); await sub.unsubscribe(); }
      p.on = false; p.msg = '';
    } else {
      if (Notification.permission === 'denied') throw new Error('알림이 차단되어 있습니다. 주소창 왼쪽 아이콘 → 권한 → 알림을 허용으로 바꾼 뒤 다시 눌러 주세요');
      if (Notification.permission !== 'granted') {
        // 크롬은 허용 창 대신 주소창에 작은 종 아이콘만 띄우기도 함
        const standalone = matchMedia('(display-mode: standalone)').matches;
        const samsung = /SamsungBrowser/.test(navigator.userAgent);
        pushStep(standalone
          ? '알림 허용을 기다리는 중… 허용 창이 안 뜨면 휴대폰 설정 → 애플리케이션 → 공과강사 → 알림을 켜고 돌아오세요'
          : samsung ? '알림 허용을 기다리는 중… 허용 창이 안 뜨면 삼성 인터넷 ≡ → 설정 → 사이트 및 다운로드 → 알림에서 허용해 주세요'
          : '알림 허용을 기다리는 중… 허용 창이 안 뜨면 브라우저 설정 → 사이트 설정 → 알림에서 이 사이트를 허용해 주세요');
        const perm = await withTimeout(waitPermission(early, earlyPerm), 180000, '알림 허용 응답이 없습니다. 크롬 설정 → 사이트 설정 → 알림에서 이 사이트를 허용해 주세요');
        if (perm !== 'granted') throw new Error('알림을 허용해야 받을 수 있습니다. 주소창 왼쪽 아이콘 → 권한 → 알림을 허용해 주세요');
      }
      pushStep('알림 등록 중…');
      if (!swReg) swReg = await navigator.serviceWorker.register('/sw.js');
      // 활성화될 때까지 최대 10초 대기, 안 되면 등록 객체로 진행
      const reg = await withTimeout(navigator.serviceWorker.ready, 10000, 'sw-timeout').catch(() => swReg);
      swReg = reg;
      const { publicKey } = await api('/api/push/key');
      let sub = (early && await early.catch(() => null)) || await reg.pushManager.getSubscription();
      if (!sub) {
        try { sub = await withTimeout(reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToBytes(publicKey) }), 20000, '알림 서버 응답이 없습니다. 인터넷 연결을 확인하고 다시 눌러 주세요'); }
        catch (e) { throw new Error(e.message?.includes('알림 서버') ? e.message : `알림 등록 실패: ${e.name || ''} ${e.message || e}`.trim()); }
      }
      await saveSubscription(sub);
      p.on = true; p.msg = '';
    }
  } catch (err) { p.msg = err.message || String(err); p.error = true; console.error('push', err); }
  await pushDiag();
  p.busy = false; renderSettings();
}
async function testPush() {
  const sub = await swReg?.pushManager.getSubscription();
  if (!sub) return;
  try { const r = await api('/api/push/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: sub.endpoint }) }); state.push.msg = r.ok ? '테스트 알림을 보냈습니다' : `보내지 못했습니다 (${r.status})`; }
  catch (err) { state.push.msg = err.message; }
  renderSettings();
}
async function loadAcks() {
  if (!state.me) { state.acks = new Set(); return; }
  try { state.acks = new Set(await api(`/api/ack?teacher=${encodeURIComponent(state.me)}`)); } catch { /* 무시 */ }
}
async function toggleAck(date) {
  const on = !state.acks.has(date);
  on ? state.acks.add(date) : state.acks.delete(date);
  renderMine();
  try { await api('/api/ack', { method: on ? 'POST' : 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ teacher: state.me, date }) }); }
  catch { on ? state.acks.delete(date) : state.acks.add(date); renderMine(); }
}
async function setMe(name) {
  state.me = name; ls.set('teach.me', name);
  renderAll();
  await loadAcks(); renderMine();
  // 알림을 켜 둔 기기는 이름이 바뀌면 구독 정보도 갱신
  if (state.push.on && name) { const sub = await swReg?.pushManager.getSubscription(); if (sub) saveSubscription(sub).catch(() => {}); }
}

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
    sc.onerror = () => { pdfjsReady = null; reject(new Error('PDF 뷰어를 불러오지 못했습니다')); };
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
  $('#viewerSub').textContent = MAT_KIND[kind] || '';
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
      if (token === viewerToken) box.innerHTML = `<p class="viewer-msg">PDF를 열지 못했습니다: ${esc(err.message)}<br><a href="${esc(url)}" target="_blank" rel="noopener">원본 링크로 열기</a></p>`;
    });
  }
  $('#viewer').showModal();
}
$('#viewer').addEventListener('close', () => { viewerToken++; $('#viewerBody').innerHTML = ''; });

// ---------- 시작 ----------
applyIcons();
function lock() {
  document.body.classList.add('locked');
  $('#loginMsg').textContent = state.loginAvailable === false ? '로그인 설정이 아직 되지 않았습니다. 관리자에게 문의하세요.' : '';
  setTimeout(() => $('#loginId')?.focus(), 50);
}
let started = false;
async function start() {
  document.body.classList.remove('locked');
  show(started ? 'mine' : (ls.get('teach.view') || 'mine'));
  started = true;
  try { await loadAll(); }
  catch (err) { if (!document.body.classList.contains('locked')) $('#mineBody').innerHTML = `<div class="card empty">서버에 연결할 수 없습니다: ${esc(err.message)}</div>`; return; }
  renderAll();
  renderEditor(state.months.at(-1) || todayISO().slice(0, 7));
  await Promise.all([loadAcks(), initPush()]);
  renderMine(); renderSettings();
  // 로그인 이름이 배정표와 맞으면 알림 구독의 이름도 최신으로
  if (state.push.on && state.me) { const sub = await swReg?.pushManager.getSubscription(); if (sub) saveSubscription(sub).catch(() => {}); }
}
(async () => {
  // 자동 로그인: 세션 쿠키가 살아 있으면 바로 시작, 아니면 로그인 화면
  const me = await api('/api/me').catch(() => ({ loggedIn: false }));
  state.loginAvailable = me.loginAvailable !== false;
  if (me.loggedIn) { state.user = me; await start(); } else lock();
})();
