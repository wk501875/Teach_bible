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

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ls = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
};

const state = { months: [], schedules: {}, resources: {}, me: ls.get('teach.me') || '', monthIdx: 0, adminLocked: false };

const todayISO = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토'];
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
  const [months, resources, status] = await Promise.all([api('/api/schedules'), api('/api/resources'), api('/api/status')]);
  state.months = months; state.resources = resources; state.adminLocked = status.adminLocked;
  const list = await Promise.all(months.map(m => api(`/api/schedules/${m}`)));
  state.schedules = Object.fromEntries(list.map(s => [s.month, s]));
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

// ---------- 공과 자료 표시 ----------
function resourceHtml(title) {
  const r = state.resources[title] || {};
  const yt = r.youtube
    ? `<a href="${esc(r.youtube)}" target="_blank" rel="noopener">▶ 공과 말씀 영상 보기</a>`
    : `<a href="https://www.youtube.com/results?search_query=${encodeURIComponent(title + ' 공과')}" target="_blank" rel="noopener">유튜브에서 찾기</a> <span class="chip">링크 미등록</span>`;
  const book = r.textbook || r.textbookUrl
    ? `${esc(r.textbook || '')} ${r.textbookUrl ? `<a href="${esc(r.textbookUrl)}" target="_blank" rel="noopener">열기</a>` : ''}`
    : `<a href="${SCHOOL_URL}" target="_blank" rel="noopener">연간공과일정에서 확인</a> <span class="chip">미등록</span>`;
  return `<div class="res">
    <div class="res-row"><span class="k">📘 교재</span><span class="v">${book}</span></div>
    <div class="res-row"><span class="k">▶️ 영상</span><span class="v">${yt}</span></div>
    ${r.note ? `<div class="res-row"><span class="k">📝 메모</span><span class="v">${esc(r.note)}</span></div>` : ''}
  </div>`;
}

// ---------- 내 공과 ----------
function renderMine() {
  const all = allAssignments();
  const names = [...new Set(all.map(a => a.teacher).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ko'));
  $('#meSelect').innerHTML = `<option value="">선택하세요</option>` +
    names.map(n => `<option ${n === state.me ? 'selected' : ''}>${esc(n)}</option>`).join('');
  const body = $('#mineBody');
  if (!state.me) { body.innerHTML = `<div class="empty">이름을 선택하면 내 공과 배정이 나타납니다.</div>`; return; }

  const mine = all.filter(a => a.teacher === state.me);
  const today = todayISO();
  const upcoming = mine.filter(a => a.date >= today);
  const past = mine.filter(a => a.date < today).reverse();
  const card = (a, next) => `
    <article class="lesson ${next ? 'next' : ''}">
      <div class="meta">
        <span class="chip ${next ? 'dday' : ''}">${dday(a.date)}</span>
        <span>${fmtDate(a.date)}</span> · <span>${esc(deptLabel(a.dept))}</span>
      </div>
      <h3>${esc(a.title)}</h3>
      ${resourceHtml(a.title)}
      <div class="foot"><button class="btn small" data-res="${esc(a.title)}">자료 링크 수정</button></div>
    </article>`;
  body.innerHTML = !mine.length ? `<div class="empty">${esc(state.me)} 님의 배정이 없습니다.</div>` :
    (upcoming.length ? `<h2 class="section-title">다가오는 공과</h2>${upcoming.map((a, i) => card(a, i === 0)).join('')}`
                     : `<div class="empty">다가오는 배정이 없습니다. 새 배정표가 올라오면 '배정표 입력'에서 넣어 주세요.</div>`) +
    (past.length ? `<h2 class="section-title">지난 공과</h2>${past.map(a => card(a, false)).join('')}` : '');
}
$('#meSelect').onchange = e => { state.me = e.target.value; ls.set('teach.me', state.me); renderMine(); };

// ---------- 배정표 ----------
function renderTable() {
  const month = state.months[state.monthIdx];
  const s = state.schedules[month];
  $('#prevMonth').disabled = state.monthIdx <= 0;
  $('#nextMonth').disabled = state.monthIdx >= state.months.length - 1;
  if (!s) { $('#monthTitle').textContent = '배정표 없음'; $('#tableBody').innerHTML = `<div class="empty">'배정표 입력'에서 이번 달 배정표를 넣어 주세요.</div>`; return; }
  const [y, m] = month.split('-').map(Number);
  $('#monthTitle').textContent = `${y}년 ${m}월 ${s.church || ''} 공과 배정표`;

  const cellHtml = (c, attrs = '') => {
    if (!c) return `<td></td>`;
    const mine = state.me && c.teacher === state.me;
    const linked = state.resources[c.title]?.youtube ? 'linked' : '';
    return `<td class="cell ${mine ? 'mine' : ''}" data-res="${esc(c.title)}" ${attrs}>
      <div class="t ${linked}">${esc(c.title)}</div><div class="p">${esc(c.teacher)}${esc(c.tag || '')}</div></td>`;
  };
  const rows = s.weeks.map(w => {
    const [, mm, dd] = w.date.split('-').map(Number);
    const youth = w.cells.youth ? cellHtml(w.cells.youth, 'colspan="2"') : cellHtml(w.cells.middle) + cellHtml(w.cells.high);
    return `<tr><th>${mm}/${dd}</th>${cellHtml(w.cells.kinder)}${cellHtml(w.cells.elLow)}${cellHtml(w.cells.elHigh)}${youth}</tr>`;
  }).join('');
  const table = `<table class="grid"><thead><tr><th>일자</th>${DEPTS.map(d => `<th>${d.label}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>`;

  const cards = s.weeks.map(w => {
    const keys = w.cells.youth ? ['kinder', 'elLow', 'elHigh', 'youth'] : DEPTS.map(d => d.key);
    return `<div class="week-card"><h3>${fmtDate(w.date)}</h3>${keys.map(k => {
      const c = w.cells[k]; if (!c) return '';
      const mine = state.me && c.teacher === state.me;
      return `<div class="item ${mine ? 'mine' : ''}" data-res="${esc(c.title)}"><span class="dept">${esc(deptLabel(k))}</span>
        <span><b>${esc(c.title)}</b><br><span class="p">${esc(c.teacher)}${esc(c.tag || '')}</span></span></div>`;
    }).join('')}</div>`;
  }).join('');
  $('#tableBody').innerHTML = table + `<div class="week-cards">${cards}</div>`;
}
$('#prevMonth').onclick = () => { state.monthIdx--; renderTable(); };
$('#nextMonth').onclick = () => { state.monthIdx++; renderTable(); };

// ---------- 자료 링크 수정 ----------
let resEditing = '';
document.addEventListener('click', e => {
  const el = e.target.closest('[data-res]');
  if (!el || !el.dataset.res) return;
  if (e.target.closest('a')) return;
  resEditing = el.dataset.res;
  const r = state.resources[resEditing] || {};
  $('#resTitle').textContent = resEditing;
  $('#resTextbook').value = r.textbook || '';
  $('#resTextbookUrl').value = r.textbookUrl || '';
  $('#resYoutube').value = r.youtube || '';
  $('#resNote').value = r.note || '';
  $('#resMsg').innerHTML = `<a href="${SCHOOL_URL}" target="_blank" rel="noopener">연간공과일정 열기 ↗</a>`;
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
  return `<div class="edit-cell" data-key="${key}"><span class="dept">${label}</span>
    <input data-k="title" placeholder="공과 제목" value="${esc(v.title)}" />
    <input data-k="who" placeholder="담당 (예: 유석준B)" value="${esc(v.who)}" /></div>`;
}
function weekEditor(w) {
  const youth = !!w.cells.youth;
  return `<div class="card edit-week">
    <div class="head">
      <input type="date" data-k="date" value="${esc(w.date)}" />
      <label><input type="checkbox" data-k="youth" ${youth ? 'checked' : ''} /> 중고등 통합</label>
      <div class="spacer"></div>
      <button class="icon-btn" data-remove-week aria-label="이 주 삭제">✕</button>
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

// ---------- 화면 전환 ----------
function show(view) {
  $$('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  $$('[data-section]').forEach(s => s.classList.toggle('hidden', s.dataset.section !== view));
  ls.set('teach.view', view);
}
$$('.nav-btn').forEach(b => (b.onclick = () => show(b.dataset.view)));

(async () => {
  try { await loadAll(); }
  catch (err) { $('#mineBody').innerHTML = `<div class="empty">서버에 연결할 수 없습니다: ${esc(err.message)}</div>`; return; }
  renderMine(); renderTable();
  renderEditor(state.months.at(-1) || todayISO().slice(0, 7));
  show(ls.get('teach.view') || 'mine');
})();
