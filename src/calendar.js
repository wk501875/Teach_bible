// 내 공과를 휴대폰 캘린더에 추가 (.ics): 어떤 브라우저든 동작하고, 알림은 캘린더 앱이 울림
const DEPT_LABEL = { kinder: '유치부', elLow: '초등 1~3학년', elHigh: '초등 4~6학년', middle: '중등부', high: '고등부', youth: '중고등부' };
const norm = s => String(s || '').replace(/\s/g, '');
const esc = s => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
const ymd = iso => iso.replace(/-/g, '');
function nextDay(iso) { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); }

// 75바이트마다 줄 접기 (RFC 5545)
function fold(line) {
  const enc = new TextEncoder(); const out = []; let cur = '';
  for (const ch of line) {
    if (enc.encode(cur + ch).length > (out.length ? 74 : 75)) { out.push(cur); cur = ch; } else cur += ch;
  }
  out.push(cur);
  return out.join('\r\n ');
}

export function buildIcs(lessons, appUrl) {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//teach-bible//KO', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:공과강사'];
  for (const l of lessons) {
    const dept = DEPT_LABEL[l.dept] || l.dept;
    lines.push('BEGIN:VEVENT',
      `UID:${ymd(l.date)}-${l.dept}-${encodeURIComponent(norm(l.teacher))}@teach-bible`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${ymd(l.date)}`,
      `DTEND;VALUE=DATE:${ymd(nextDay(l.date))}`,
      `SUMMARY:${esc(`공과: ${l.title} (${dept})`)}`,
      `DESCRIPTION:${esc(`${l.teacher} 님 공과\n${dept} · ${l.title}\n공과 자료: ${appUrl}`)}`,
      `URL:${appUrl}`,
      'TRANSP:TRANSPARENT',
      // 일요일 0시 기준: 월요일 오전 9시, 토요일 오전 9시
      'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(`이번 주 공과: ${l.title}`)}`, 'TRIGGER:-P5DT15H', 'END:VALARM',
      'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(`내일 공과: ${l.title}`)}`, 'TRIGGER:-PT15H', 'END:VALARM',
      'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}

// GET /api/calendar.ics?teacher=이름[&date=YYYY-MM-DD]  → 오늘 이후 내 공과 (date 주면 그 날만)
export async function handleCalendar(req, env, url, loadSchedule, listMonths) {
  const teacher = url.searchParams.get('teacher') || '';
  const only = url.searchParams.get('date') || '';
  if (!norm(teacher)) return new Response('teacher 필요', { status: 400 });
  const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const months = (await listMonths(env)).filter(m => m >= today.slice(0, 7));
  const lessons = [];
  for (const m of months) {
    const s = await loadSchedule(env, m);
    for (const w of s?.weeks || []) {
      if (only ? w.date !== only : w.date < today) continue;
      for (const [dept, c] of Object.entries(w.cells)) if (c && norm(c.teacher) === norm(teacher)) lessons.push({ date: w.date, dept, title: c.title, teacher: c.teacher });
    }
  }
  const name = only ? `공과-${only}.ics` : '내-공과.ics';
  return new Response(buildIcs(lessons, url.origin + '/'), {
    headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(name)}`, 'Cache-Control': 'no-store' },
  });
}
