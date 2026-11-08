// 공과강사: 배정표 → 내 공과 → 교재·영상 링크를 한 곳에서
const SCHOOL_URL = 'https://www.jbch.org/ko/school/?cId=715'; // 교회학교 연간공과일정
const DEPTS = [
  { key: 'kinder', label: '유치부' },
  { key: 'elLow', label: '초등 1~3학년' },
  { key: 'elHigh', label: '초등 4~6학년' },
  { key: 'middle', label: '중등부' },
  { key: 'high', label: '고등부' },
];
const YOUTH = { key: 'youth', label: '중고등부 (통합)' };
const deptLabel = k => (k === 'youth' ? YOUTH.label : DEPTS.find(d => d.key === k)?.label || k);

// 아이콘 (stroke SVG)
const P = {
  book: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19V5"/><path d="M8 7h7"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  chevronLeft: '<path d="m15 18-6-6 6-6"/>', chevronRight: '<path d="m9 18 6-6-6-6"/>',
  close: '<path d="M18 6 6 18M6 6l12 12"/>',
  home: '<path d="M3 11 12 4l9 7"/><path d="M5 10v10h14V10"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.5" cy="6" r="1"/><circle cx="3.5" cy="12" r="1"/><circle cx="3.5" cy="18" r="1"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  play: '<circle cx="12" cy="12" r="9"/><path d="m10 8.5 5.5 3.5-5.5 3.5z"/>',
  file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>',
  download: '<path d="M12 4v11"/><path d="m7 10 5 5 5-5"/><path d="M5 20h14"/>',
  headphones: '<path d="M4 15v-3a8 8 0 0 1 16 0v3"/><rect x="3" y="14" width="4" height="7" rx="1.5"/><rect x="17" y="14" width="4" height="7" rx="1.5"/>',
  external: '<path d="M14 4h6v6"/><path d="M20 4 10 14"/><path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/>',
  kid: '<circle cx="12" cy="12" r="9"/><path d="M9 10h.01M15 10h.01"/><path d="M8.5 14.5a4.5 4.5 0 0 0 7 0"/>',
  pencil: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><circle cx="17" cy="9" r="2.5"/><path d="M16 14a5 5 0 0 1 6 5"/>',
  star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
  note: '<path d="M5 3h10l4 4v14H5z"/><path d="M9 9h6M9 13h6M9 17h3"/>',
  logout: '<path d="M15 4h4v16h-4"/><path d="M10 8l-4 4 4 4"/><path d="M6 12h10"/>',
  chevron: '<path d="m9 18 6-6-6-6"/>',
};
const icon = (name, cls = '') => `<span class="${cls}" data-icon="${name}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ''}</svg></span>`;
function applyIcons(root = document) {
  root.querySelectorAll('[data-icon]:empty').forEach(el => {
    el.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[el.dataset.icon] || ''}</svg>`;
  });
}
const DEPT_ICON = { kinder: 'kid', elLow: 'pencil', elHigh: 'book', middle: 'users', high: 'star', youth: 'users' };
const MAT_ICON = { youtube: 'play', pdf: 'file', hwp: 'download', audio: 'headphones', file: 'external' };
const MAT_HINT = { youtube: '앱 안에서 재생', pdf: '앱 안에서 보기', hwp: '바로 다운로드', audio: '앱 안에서 듣기', file: '새 창에서 열기' };

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ls = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
};

const state = { user: null, months: [], schedules: {}, resources: {}, curriculum: {}, curriculumErrors: [], me: ls.get('teach.me') || '', monthIdx: 0, adminLocked: false };

const todayISO = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토'];
function fmtLong(iso) { const [y, m, d] = iso.split('-').map(Number); return `${m}월 ${d}일 ${WEEKDAY[new Date(y, m - 1, d).getDay()]}요일`; }
const weekNo = iso => Math.ceil(Number(iso.slice(8, 10)) / 7);
function fmtDate(iso) { const [y, m, d] = iso.split('-').map(Number); const dt = new Date(y, m - 1, d); return `${m}/${d} (${WEEKDAY[dt.getDay()]})`; }
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
  const [months, resources, status, me] = await Promise.all([api('/api/schedules'), api('/api/resources'), api('/api/status'), api('/api/me').catch(() => ({ loggedIn: false }))]);
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
  const cur = todayISO().slice(0, 7);
  const idx = months.indexOf(cur);
  state.monthIdx = idx >= 0 ? idx : Math.max(0, months.length - 1);
}

// 모든 배정을 평평하게: [{date, dept, title, teacher, tag}]
function allAssignments() {
  const out = [];
  for (const s of Object.values(state.schedules)) {
    for (const w of s.weeks) {
      for (const [dept, c] of Object.entries(w.cells)) {
        if (c && (c.title || c.teacher)) out.push({ date: w.date, dept, ...c });
      }
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

// ---------- 전국교회학교 연간공과와 매칭 ----------
const SRC = { kinder: 'kinder', elLow: 'elementary', elHigh: 'elementary', middle: 'youth', high: 'youth', youth: 'youth' };
// 부서와 상관없는 학년용 자료는 숨김
const HIDE = { elLow: ['5,6학년'], elHigh: ['1,2학년'], middle: ['고등부'], high: ['중등부'] };
const KIND_ORDER = { youtube: 0, pdf: 1, hwp: 2, audio: 3, file: 4 };
const norm = t => String(t || '').replace(/[\s.,!?·'"()~\-]/g, '');
function dice(a, b) {
  if (a === b) return 1;
  const grams = s => { const g = new Map(); for (let i = 0; i < s.length - 1; i++) { const k = s.slice(i, i + 2); g.set(k, (g.get(k) || 0) + 1); } return g; };
  const ga = grams(a), gb = grams(b); let hit = 0;
  for (const [k, n] of ga) hit += Math.min(n, gb.get(k) || 0);
  const total = Math.max(1, a.length - 1 + b.length - 1);
  return (2 * hit) / total;
}
const daysBetween = (a, b) => Math.abs(new Date(a) - new Date(b)) / 86400000;
// 배정(부서·날짜·제목)에 맞는 전국 공과를 찾는다. 제목이 비슷한 것 중 날짜가 가장 가까운 것.
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
function sourceLabel(dept) { const k = SRC[dept]; return state.curriculum[Object.keys(state.curriculum)[0]]?.[k]?.label || ''; }

// 배정 하나의 전국 공과와 자료
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

// 자료 목록 (타임라인 형태)
function materialsHtml(a, withManual = true) {
  const info = lessonInfo(a);
  const r = state.resources[a.title] || {};
  const rows = [];
  if (info) {
    for (const m of info.mats) {
      const label = m === info.sermon ? '공과 말씀 영상' : m.label;
      rows.push(`<button type="button" class="mat-row" ${matAttrs(m)}>
        ${icon(MAT_ICON[m.kind] || 'file', `icon-circle ${m.kind === 'youtube' ? 'accent' : m.kind === 'pdf' ? 'blue' : ''}`)}
        <span class="tl-main"><b>${esc(label)}</b><span class="tl-meta">${MAT_HINT[m.kind] || ''}</span></span>
        ${icon('chevron', 'chev')}</button>`);
    }
  } else if (state.curriculumErrors.length) {
    rows.push(`<div class="mat-row">${icon('external', 'icon-circle')}<span class="tl-main"><b>연간공과 일정을 불러오지 못했습니다</b>
      <span class="tl-meta"><a href="${SCHOOL_URL}" target="_blank" rel="noopener">전국교회학교에서 직접 확인</a></span></span></div>`);
  }
  if (!withManual) return rows.join('');
  if (r.textbook || r.textbookUrl) rows.push(`<a class="mat-row" ${r.textbookUrl ? `href="${esc(r.textbookUrl)}" target="_blank" rel="noopener"` : ''}>${icon('external', 'icon-circle')}<span class="tl-main"><b>${esc(r.textbook || '추가 자료')}</b><span class="tl-meta">강사 추가 자료</span></span></a>`);
  if (r.youtube) rows.push(`<a class="mat-row" href="${esc(r.youtube)}" target="_blank" rel="noopener">${icon('play', 'icon-circle')}<span class="tl-main"><b>추가 영상</b><span class="tl-meta">강사 추가 자료</span></span></a>`);
  if (r.note) rows.push(`<div class="mat-row">${icon('note', 'icon-circle')}<span class="tl-main"><b>메모</b><span class="tl-meta" style="white-space:pre-wrap">${esc(r.note)}</span></span></div>`);
  return rows.join('');
}

// ---------- 내 공과 ----------
function renderMine() {
  const all = allAssignments();
  const names = [...new Set(all.map(a => a.teacher).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ko'));
  const loginName = state.user?.name?.replace(/\s/g, '');
  const matched = loginName && names.find(n => n.replace(/\s/g, '') === loginName);
  if (matched) state.me = matched;
  $('#whoBox').classList.toggle('hidden', Boolean(matched));
  state.heroMine = state.me ? `${state.me} 님의 공과` : '내 공과';
  state.heroMineSub = state.user && !matched ? `배정표에서 '${state.user.name}' 님을 찾지 못했어요` : '';
  updateHero();
  $('#meSelect').innerHTML = `<option value="">선택하세요</option>` +
    names.map(n => `<option ${n === state.me ? 'selected' : ''}>${esc(n)}</option>`).join('');
  const body = $('#mineBody');
  if (!state.me) { body.innerHTML = `<div class="card empty">이름을 선택하거나 깨사모로 로그인하면 내 공과가 나타납니다.</div>`; return; }

  const mine = all.filter(a => a.teacher === state.me);
  const today = todayISO();
  const upcoming = mine.filter(a => a.date >= today);
  const past = mine.filter(a => a.date < today).reverse();
  if (!mine.length) { body.innerHTML = `<div class="card empty">${esc(state.me)} 님의 배정이 없습니다.</div>`; return; }

  const next = upcoming[0];
  let html = '';
  if (next) {
    const info = lessonInfo(next);
    const arc = `<svg viewBox="0 0 200 34" preserveAspectRatio="none"><path d="M4 30 Q100 -6 196 30" fill="none" stroke="rgba(255,255,255,.45)" stroke-width="1.2"/></svg>`;
    html += `
      <article class="ticket" data-res="${esc(next.title)}" data-dept="${next.dept}" data-date="${next.date}">
        <div class="ticket-top">
          <div class="ticket-row"><span>${icon('calendar')}다음 공과 · ${fmtLong(next.date)}</span><span class="dday">${dday(next.date)}</span></div>
          <div class="ticket-title">${esc(next.title)}</div>
          <div class="ticket-route">
            <div class="end"><b>${info ? `${info.l.no}과` : '행사'}</b><small>${info ? esc(info.source) : '특별 일정'}</small></div>
            <div class="arc">${arc}<span>${esc(deptLabel(next.dept))}</span></div>
            <div class="end right"><b>${Number(next.date.slice(5, 7))}/${Number(next.date.slice(8))}</b><small>${weekNo(next.date)}주차</small></div>
          </div>
        </div>
        <div class="ticket-bottom">
          <div><b>${esc(next.teacher)}${esc(next.tag || '')}</b><small>담당</small></div>
          <div><b>${info ? esc(info.l.preacher) : '-'}</b><small>설교</small></div>
          <div><b>${info ? info.mats.length : 0}개</b><small>준비 자료</small></div>
        </div>
      </article>`;
    const mats = materialsHtml(next);
    html += `<div class="card">
      <div class="card-head"><span>준비 자료</span><button class="btn small" data-res="${esc(next.title)}" data-dept="${next.dept}" data-date="${next.date}">${icon('note')}메모</button></div>
      <div class="timeline">${mats || '<p class="empty">이번 공과에 연결된 자료가 없습니다.</p>'}</div></div>`;
  } else {
    html += `<div class="card empty">다가오는 배정이 없습니다. 새 배정표가 올라오면 '배정표 입력'에서 넣어 주세요.</div>`;
  }
  const item = a => {
    const info = lessonInfo(a);
    return `<li class="tl-item clickable" data-res="${esc(a.title)}" data-dept="${a.dept}" data-date="${a.date}">
      ${icon(DEPT_ICON[a.dept] || 'book', 'icon-circle')}
      <div class="tl-main">
        <div class="tl-meta">${fmtDate(a.date)} · ${esc(deptLabel(a.dept))}${a.date >= today ? ` <span class="tag">${dday(a.date)}</span>` : ''}</div>
        <div class="tl-title">${esc(a.title)}</div>
        ${info ? `<div class="tl-sub"><span>${icon('book')}${esc(info.source)} ${info.l.no}과 · ${info.mats.length}개 자료</span></div>` : ''}
      </div></li>`;
  };
  if (upcoming.length > 1) html += `<div class="section-label">다가오는 공과</div><div class="card"><ul class="timeline">${upcoming.slice(1).map(item).join('')}</ul></div>`;
  if (past.length) html += `<div class="section-label">지난 공과</div><div class="card"><ul class="timeline">${past.map(item).join('')}</ul></div>`;
  body.innerHTML = html;
}
$('#meSelect').onchange = e => { state.me = e.target.value; ls.set('teach.me', state.me); renderMine(); };

// ---------- 배정표 ----------
function renderTable() {
  const month = state.months[state.monthIdx];
  const s = state.schedules[month];
  $('#prevMonth').disabled = state.monthIdx <= 0;
  $('#nextMonth').disabled = state.monthIdx >= state.months.length - 1;
  if (!s) { state.heroTable = '배정표 없음'; state.heroTableSub = ''; updateHero(); $('#tableBody').innerHTML = `<div class="card empty">'배정표 입력'에서 이번 달 배정표를 넣어 주세요.</div>`; return; }
  const [y, m] = month.split('-').map(Number);
  state.heroTable = `${m}월 공과 배정표`;
  state.heroTableSub = `${y}년 ${m}월 · ${s.church || ''} 교회학교`;
  updateHero();
  const today = todayISO();
  $('#tableBody').innerHTML = s.weeks.map(w => {
    const keys = w.cells.youth ? ['kinder', 'elLow', 'elHigh', 'youth'] : DEPTS.map(d => d.key);
    const items = keys.map(k => {
      const c = w.cells[k]; if (!c) return '';
      const mine = state.me && c.teacher === state.me;
      const info = lessonInfo({ ...c, dept: k, date: w.date });
      return `<li class="tl-item clickable ${mine ? 'mine' : ''}" data-res="${esc(c.title)}" data-dept="${k}" data-date="${w.date}">
        ${icon(DEPT_ICON[k] || 'book', `icon-circle ${mine ? 'accent' : ''}`)}
        <div class="tl-main">
          <div class="tl-meta">${esc(deptLabel(k))}${mine ? ' <span class="tag me">내 공과</span>' : ''}</div>
          <div class="tl-title">${esc(c.title)}</div>
          <div class="tl-sub">
            ${c.teacher ? `<span>${icon('user')}${esc(c.teacher)}${esc(c.tag || '')}</span>` : ''}
            ${info ? `<span>${icon('book')}${esc(info.source)} ${info.l.no}과</span>` : ''}
          </div>
          ${mine && info?.sermon ? `<button class="btn dark small dir-btn" ${matAttrs(info.sermon)}>${icon('play')}공과 말씀 영상 보기</button>` : ''}
        </div></li>`;
    }).join('');
    return `<div class="card">
      <div class="card-head"><span>${fmtLong(w.date)}</span><span class="muted">${w.date === today ? '오늘' : `${weekNo(w.date)}주차`}</span></div>
      <ul class="timeline">${items}</ul></div>`;
  }).join('');
}
$('#prevMonth').onclick = () => { state.monthIdx--; renderTable(); };
$('#nextMonth').onclick = () => { state.monthIdx++; renderTable(); };

// ---------- 자료 링크 수정 ----------
let resEditing = '';
document.addEventListener('click', e => {
  const mat = e.target.closest('[data-mat]');
  if (mat) { e.stopPropagation(); openMaterial(mat.dataset.mat, mat.dataset.url, mat.dataset.name); return; }
  const el = e.target.closest('[data-res]');
  if (!el || !el.dataset.res) return;
  if (e.target.closest('a')) return;
  resEditing = el.dataset.res;
  const r = state.resources[resEditing] || {};
  $('#resTitle').textContent = resEditing;
  const a = { title: resEditing, dept: el.dataset.dept, date: el.dataset.date };
  const info = a.dept ? lessonInfo(a) : null;
  $('#resSub').textContent = [a.date && fmtLong(a.date), a.dept && deptLabel(a.dept), info && `${info.source} ${info.l.no}과`].filter(Boolean).join(' · ');
  const mats = a.dept ? materialsHtml(a, false) : '';
  $('#resAuto').innerHTML = mats ? `<div class="timeline">${mats}</div>` : '';
  $('#resTextbook').value = r.textbook || '';
  $('#resTextbookUrl').value = r.textbookUrl || '';
  $('#resYoutube').value = r.youtube || '';
  $('#resNote').value = r.note || '';
  $('#resMsg').innerHTML = `<a href="${SCHOOL_URL}" target="_blank" rel="noopener">전국교회학교 연간공과 ↗</a>`;
  $('#resDialog').showModal();
});
$('#resSave').onclick = async () => {
  const resource = {
    textbook: $('#resTextbook').value.trim(), textbookUrl: $('#resTextbookUrl').value.trim(),
    youtube: $('#resYoutube').value.trim(), note: $('#resNote').value.trim(),
  };
  const bad = [resource.textbookUrl, resource.youtube].find(u => u && !/^https?:\/\//.test(u));
  if (bad) { $('#resMsg').textContent = '링크는 https:// 로 시작해야 합니다'; return; }
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
  return `<div class="edit-cell" data-key="${key}"><span class="dept">${icon(DEPT_ICON[key] || 'book')}${label}</span>
    <input data-k="title" placeholder="공과 제목" value="${esc(v.title)}" />
    <input data-k="who" placeholder="담당 (예: 유석준B)" value="${esc(v.who)}" /></div>`;
}
function weekEditor(w) {
  const youth = !!w.cells.youth;
  return `<div class="card edit-week">
    <div class="card-head">
      <input type="date" data-k="date" value="${esc(w.date)}" />
      <label><input type="checkbox" data-k="youth" ${youth ? 'checked' : ''} /> 중고등 통합</label>
      <div class="spacer"></div>
      <button class="close-btn" data-remove-week aria-label="이 주 삭제">${icon('close')}</button>
    </div>
    <div class="edit-grid">
      ${DEPTS.slice(0, 3).map(d => editCell(d.key, d.label, w.cells[d.key])).join('')}
      ${youth ? editCell('youth', YOUTH.label, w.cells.youth)
              : editCell('middle', '중등부', w.cells.middle) + editCell('high', '고등부', w.cells.high)}
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
function readEditor() {
  return $$('.edit-week').map(readWeek).filter(w => w.date).sort((a, b) => a.date.localeCompare(b.date));
}
function renderEditor(month) {
  $('#editMonth').value = month;
  const s = state.schedules[month];
  $('#editChurch').value = s?.church || '일산교회';
  const weeks = s?.weeks?.length ? s.weeks : sundaysOf(month).map(date => ({ date, cells: {} }));
  $('#editBody').innerHTML = weeks.map(weekEditor).join('');
  $('#editMsg').textContent = s ? '저장된 배정표를 수정합니다' : '새 배정표 — 일요일이 자동으로 채워졌습니다';
}
$('#editMonth').onchange = e => e.target.value && renderEditor(e.target.value);
$('#editBody').addEventListener('change', e => {
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
$('#editBody').addEventListener('click', e => { if (e.target.closest('[data-remove-week]')) e.target.closest('.edit-week').remove(); });
$('#addWeek').onclick = () => {
  const weeks = readEditor(); const last = weeks.at(-1)?.date;
  let date = '';
  if (last) { const [y, m, d] = last.split('-').map(Number); const n = new Date(y, m - 1, d + 7); date = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`; }
  $('#editBody').insertAdjacentHTML('beforeend', weekEditor({ date, cells: {} }));
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
    $('#editMsg').textContent = '✅ 저장되었습니다';
    renderMine(); renderTable();
  } catch (err) { $('#editMsg').textContent = `저장 실패: ${err.message}`; }
};

// ---------- 깨사모 로그인 ----------
function renderAccount() {
  const box = $('#account');
  if (state.user) {
    box.innerHTML = `<span class="me-chip">${icon('user', 'avatar')}${esc(state.user.name)}</span><button class="pill-btn" id="logoutBtn">${icon('logout')}로그아웃</button>`;
    $('#logoutBtn').onclick = async () => {
      await api('/api/logout', { method: 'POST' }).catch(() => {});
      state.user = null; renderAccount(); renderMine(); renderTable();
    };
  } else {
    box.innerHTML = state.loginAvailable ? `<button class="pill-btn solid" id="loginBtn">${icon('user')}깨사모 로그인</button>` : '';
    $('#loginBtn')?.addEventListener('click', () => { $('#loginMsg').textContent = ''; $('#loginDialog').showModal(); $('#loginId').focus(); });
  }
}
$('#loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = $('#loginSubmit'); btn.disabled = true; $('#loginMsg').textContent = '로그인 중…';
  try {
    state.user = await api('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userid: $('#loginId').value, password: $('#loginPw').value }) });
    $('#loginPw').value = '';
    $('#loginDialog').close();
    renderAccount(); renderMine(); renderTable(); show('mine');
  } catch (err) { $('#loginMsg').textContent = err.message; }
  finally { btn.disabled = false; }
});

// ---------- 화면 전환 ----------
function updateHero() {
  const v = state.view || 'mine';
  const title = v === 'mine' ? state.heroMine : v === 'table' ? state.heroTable : '배정표 입력';
  const church = Object.values(state.schedules).at(-1)?.church || '일산교회';
  const sub = v === 'mine' ? (state.heroMineSub || `${new Date().getFullYear()}년 · ${church} 교회학교`)
    : v === 'table' ? state.heroTableSub : '매달 받은 배정표를 입력하세요';
  $('#heroTitle').textContent = title || '공과강사';
  $('#heroSub').textContent = sub || '';
  $('#prevMonth').classList.toggle('hidden', v !== 'table');
  $('#nextMonth').classList.toggle('hidden', v !== 'table');
}
function show(view) {
  state.view = view; updateHero(); window.scrollTo({ top: 0 });
  $$('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  $$('[data-section]').forEach(s => s.classList.toggle('hidden', s.dataset.section !== view));
  ls.set('teach.view', view);
}
$$('.nav-btn').forEach(b => (b.onclick = () => show(b.dataset.view)));

applyIcons();
(async () => {
  try { await loadAll(); }
  catch (err) { $('#mineBody').innerHTML = `<div class="empty">서버에 연결할 수 없습니다: ${esc(err.message)}</div>`; return; }
  renderAccount(); renderMine(); renderTable();
  renderEditor(state.months.at(-1) || todayISO().slice(0, 7));
  show(ls.get('teach.view') || 'mine');
})();

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
    const base = page.getViewport({ scale: 1 });
    const scale = width / base.width;
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
  const dlg = $('#viewer'); const box = $('#viewerBody'); const token = ++viewerToken;
  $('#viewerTitle').textContent = name.replace(/\.(pdf|mp3)$/, '');
  $('#viewerSub').textContent = MAT_HINT[kind] || '공과 자료';
  $('#viewerIcon').innerHTML = icon(MAT_ICON[kind] || 'file');
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
  dlg.showModal();
}
$('#viewer').addEventListener('close', () => { viewerToken++; $('#viewerBody').innerHTML = ''; });
