// 공과강사 프론트엔드: 공과는 브라우저(localStorage)에 저장
const STORE_KEY = 'teach_bible.lessons.v1';
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

const state = { lessons: loadLessons(), currentId: null, tab: 'kids' };

function loadLessons() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY)) || []; } catch { return []; }
}
function persist() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(state.lessons));
    $('#savedMsg').textContent = `저장됨 ${new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}`;
  } catch {
    $('#savedMsg').textContent = '⚠️ 저장 실패 (브라우저 저장소를 확인하세요)';
  }
}
function newLesson() {
  return {
    id: crypto.randomUUID?.() || String(Date.now()),
    title: '', date: new Date().toISOString().slice(0, 10), passage: '', scripture: '', keyMessage: '',
    kids: { intro: '', explain: '', activity: '', quiz: [], memory: '' },
    teens: { intro: '', explain: '', discussion: [], apply: '' },
    updatedAt: Date.now(),
  };
}
const current = () => state.lessons.find(l => l.id === state.currentId);
const getPath = (obj, path) => path.split('.').reduce((o, k) => o?.[k], obj);
function setPath(obj, path, value) {
  const keys = path.split('.'); const last = keys.pop();
  keys.reduce((o, k) => (o[k] ??= {}), obj)[last] = value;
}
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- 목록 ----------
function renderList() {
  const q = $('#search').value.trim().toLowerCase();
  const items = [...state.lessons]
    .sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.updatedAt - a.updatedAt)
    .filter(l => !q || `${l.title} ${l.passage}`.toLowerCase().includes(q));
  $('#lessonList').innerHTML = items.map(l => `
    <li data-id="${esc(l.id)}" class="${l.id === state.currentId ? 'active' : ''}">
      <div class="t">${esc(l.title || '(제목 없음)')}</div>
      <div class="s">${esc(l.date)} · ${esc(l.passage || '본문 미정')}</div>
    </li>`).join('') || '<li class="s">공과가 없습니다</li>';
}

// ---------- 편집기 ----------
function openLesson(id) {
  state.currentId = id;
  const l = current();
  $('#emptyState').classList.toggle('hidden', !!l);
  $('#editor').classList.toggle('hidden', !l);
  $('#sidebar').classList.remove('open');
  if (!l) return renderList();
  $$('[data-f]').forEach(el => { el.value = getPath(l, el.dataset.f) ?? ''; });
  $$('[data-list]').forEach(renderListField);
  $('#savedMsg').textContent = '';
  renderList();
}

function renderListField(container) {
  const l = current(); const path = container.dataset.list; const kind = container.dataset.kind;
  const arr = getPath(l, path) || [];
  container.innerHTML = arr.map((item, i) => `
    <div class="list-item" data-i="${i}">
      <span class="num">${i + 1}.</span>
      <div class="inputs">
        ${kind === 'qa'
          ? `<input data-k="q" placeholder="질문" value="${esc(item.q)}" />
             <input data-k="a" placeholder="정답" value="${esc(item.a)}" />`
          : `<input data-k="text" placeholder="질문" value="${esc(item)}" />`}
      </div>
      <button class="icon-btn" data-remove aria-label="삭제">✕</button>
    </div>`).join('');
}

let saveTimer;
function scheduleSave() {
  const l = current(); if (!l) return;
  l.updatedAt = Date.now();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { persist(); renderList(); }, 400);
}

$('#editor').addEventListener('input', e => {
  const l = current(); if (!l) return;
  const el = e.target;
  if (el.dataset.f) { setPath(l, el.dataset.f, el.value); return scheduleSave(); }
  const container = el.closest('[data-list]');
  if (container && el.dataset.k) {
    const arr = getPath(l, container.dataset.list);
    const i = Number(el.closest('.list-item').dataset.i);
    if (el.dataset.k === 'text') arr[i] = el.value; else arr[i][el.dataset.k] = el.value;
    scheduleSave();
  }
});

$('#editor').addEventListener('click', e => {
  const l = current(); if (!l) return;
  const add = e.target.closest('[data-add]');
  if (add) {
    const path = add.dataset.add;
    const container = $(`[data-list="${path}"]`);
    const arr = getPath(l, path) || [];
    arr.push(container.dataset.kind === 'qa' ? { q: '', a: '' } : '');
    setPath(l, path, arr);
    renderListField(container);
    $$('input', container).at(container.dataset.kind === 'qa' ? -2 : -1)?.focus();
    return scheduleSave();
  }
  const rm = e.target.closest('[data-remove]');
  if (rm) {
    const container = rm.closest('[data-list]');
    getPath(l, container.dataset.list).splice(Number(rm.closest('.list-item').dataset.i), 1);
    renderListField(container);
    return scheduleSave();
  }
  const tab = e.target.closest('[data-tab]');
  if (tab) setTab(tab.dataset.tab);
});

function setTab(name) {
  state.tab = name;
  $$('[data-tab]').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
  $$('[data-panel]').forEach(p => p.classList.toggle('hidden', p.dataset.panel !== name));
}

$('#newBtn').onclick = () => {
  const l = newLesson();
  state.lessons.push(l); persist(); openLesson(l.id);
  $('[data-f="title"]').focus();
};
$('#deleteBtn').onclick = () => {
  const l = current();
  if (!l || !confirm(`"${l.title || '제목 없음'}" 공과를 삭제할까요?`)) return;
  state.lessons = state.lessons.filter(x => x.id !== l.id); persist(); openLesson(null);
};
$('#lessonList').onclick = e => { const li = e.target.closest('li[data-id]'); if (li) openLesson(li.dataset.id); };
$('#search').oninput = renderList;
$('#menuBtn').onclick = () => $('#sidebar').classList.toggle('open');

// ---------- 수업 모드 ----------
const GROUP = { kids: '🧒 유초등부', teens: '🧑 중고등부' };
let slides = [], slideIdx = 0, revealed = false;

function buildSlides(l, group) {
  const s = [];
  const push = (title, body, answer) => { if (String(body || '').trim()) s.push({ title, body, answer }); };
  push('오늘의 공과', [l.title, l.passage].filter(Boolean).join('\n'));
  push(`말씀 · ${l.passage}`, l.scripture);
  if (group === 'kids') {
    push('이야기로 시작해요', l.kids.intro);
    push('말씀 배우기', l.kids.explain);
    push('핵심 메시지', l.keyMessage);
    push('활동 시간', l.kids.activity);
    l.kids.quiz.forEach((q, i) => push(`퀴즈 ${i + 1}`, q.q, q.a));
    push('함께 외워요', l.kids.memory);
  } else {
    push('생각해 보기', l.teens.intro);
    push('말씀 이해하기', l.teens.explain);
    push('핵심 메시지', l.keyMessage);
    l.teens.discussion.forEach((q, i) => push(`토론 질문 ${i + 1}`, q));
    push('삶에 적용하기', l.teens.apply);
  }
  return s;
}
function renderSlide() {
  const sl = slides[slideIdx];
  $('#presentCount').textContent = `${slideIdx + 1} / ${slides.length}`;
  $('#presentBody').innerHTML = `
    <h2>${esc(sl.title)}</h2>
    <div class="big">${esc(sl.body)}</div>
    ${sl.answer && revealed ? `<div class="answer">정답: ${esc(sl.answer)}</div>` : ''}`;
  $('#revealBtn').classList.toggle('hidden', !sl.answer);
  $('#revealBtn').textContent = revealed ? '정답 숨기기' : '정답 보기';
  $('#prevSlide').disabled = slideIdx === 0;
  $('#nextSlide').disabled = slideIdx === slides.length - 1;
}
function go(d) { slideIdx = Math.max(0, Math.min(slides.length - 1, slideIdx + d)); revealed = false; renderSlide(); }

$('#presentBtn').onclick = () => {
  slides = buildSlides(current(), state.tab);
  if (!slides.length) return alert('수업할 내용을 먼저 입력해 주세요.');
  slideIdx = 0; revealed = false;
  $('#presentGroup').textContent = GROUP[state.tab];
  $('#present').classList.remove('hidden');
  renderSlide();
};
$('#presentClose').onclick = () => $('#present').classList.add('hidden');
$('#prevSlide').onclick = () => go(-1);
$('#nextSlide').onclick = () => go(1);
$('#revealBtn').onclick = () => { revealed = !revealed; renderSlide(); };
document.addEventListener('keydown', e => {
  if ($('#present').classList.contains('hidden')) return;
  if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); go(1); }
  if (e.key === 'ArrowLeft') go(-1);
  if (e.key === 'Escape') $('#present').classList.add('hidden');
});

// ---------- 인쇄 ----------
$('#printBtn').onclick = () => {
  const l = current(); const g = state.tab;
  const sec = (h, t) => String(t || '').trim() ? `<h3>${h}</h3><p>${esc(t)}</p>` : '';
  const kids = l.kids, teens = l.teens;
  const body = g === 'kids'
    ? sec('도입', kids.intro) + sec('쉬운 설명', kids.explain) + sec('활동', kids.activity)
      + (kids.quiz.length ? `<h3>퀴즈</h3>${kids.quiz.map((q, i) => `<p>${i + 1}. ${esc(q.q)}<br>→ ${esc(q.a)}</p>`).join('')}` : '')
      + sec('암송 구절', kids.memory)
    : sec('도입 질문', teens.intro) + sec('말씀 설명', teens.explain)
      + (teens.discussion.length ? `<h3>토론 질문</h3>${teens.discussion.map((q, i) => `<p>${i + 1}. ${esc(q)}</p>`).join('')}` : '')
      + sec('삶에 적용하기', teens.apply);
  $('#printArea').innerHTML = `
    <h1>${esc(l.title)}</h1><p>${esc(l.date)} · ${esc(l.passage)} · ${GROUP[g]}</p>
    ${sec('말씀', l.scripture)}${sec('핵심 메시지', l.keyMessage)}
    <h2>${GROUP[g]} 진행안</h2>${body}`;
  window.print();
};

// ---------- API ----------
async function checkApi() {
  const badge = $('#apiBadge');
  try {
    const r = await fetch('/api/status').then(r => r.json());
    badge.textContent = r.configured ? 'API 연결됨' : 'API 키 미설정';
    badge.classList.toggle('ok', r.configured);
  } catch {
    badge.textContent = '서버 연결 안 됨';
  }
}
$('#apiBtn').onclick = () => $('#apiDialog').showModal();
$('#apiSend').onclick = async () => {
  const out = $('#apiOut');
  let params;
  try { params = JSON.parse($('#apiParams').value || '{}'); } catch { out.textContent = '파라미터 JSON 형식이 올바르지 않습니다.'; return; }
  out.textContent = '요청 중…';
  try {
    const r = await fetch('/api/jbch', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ method: $('#apiMethod').value, path: $('#apiPath').value, params }),
    });
    out.textContent = JSON.stringify(await r.json(), null, 2);
  } catch (err) {
    out.textContent = `실패: ${err.message}`;
  }
};

renderList();
openLesson(state.lessons[0]?.id ?? null);
checkApi();
