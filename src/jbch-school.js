// 전국교회학교(www.jbch.org/ko/school) 연간공과 일정 표를 읽어 공과별 자료(유튜브 설교, PDF, 한글파일)를 추출한다.
const BASE = 'https://www.jbch.org/ko/school/true/list.php';

// 연간공과 일정 페이지 (cId)
export const SOURCES = {
  kinder: { cId: 753, label: '유치부 머릿돌' },
  elementary: { cId: 755, label: '초등부 머릿돌' },
  youth: { cId: 762, label: '중고등부 참빛' },
};

const decode = s => s
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&bull;/g, '•');
const text = html => decode(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

function toISO(dot) {
  const m = dot.match(/(\d{4})\.(\d{1,2})\.(\d{1,2})/);
  return m ? `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` : '';
}

// 한 칸(td) 안의 링크들 → [{label, url, kind}]
function parseCell(html, header) {
  const out = [];
  const re = /<a\b([^>]*)>(.*?)<\/a>/gs;
  let m;
  while ((m = re.exec(html))) {
    const attrs = m[1];
    const inner = text(m[2]);
    const yt = attrs.match(/viewYoutube\('([\w-]+)'\)/);
    const mp3 = attrs.match(/playMp3\('\s*([^']+?)\s*'\)/);
    const href = attrs.match(/href=['"]([^'"]+)['"]/);
    if (yt) out.push({ kind: 'youtube', label: `${header} 영상`, url: `https://www.youtube.com/watch?v=${yt[1]}` });
    else if (mp3) out.push({ kind: 'audio', label: `${header} 음성`, url: mp3[1] });
    else if (href && /^https?:\/\//.test(href[1])) {
      const kind = /\.pdf($|\?)/i.test(href[1]) ? 'pdf' : /\.hwp($|\?)/i.test(href[1]) ? 'hwp' : 'file';
      const name = inner || kind.toUpperCase();
      const label = header.includes(name) ? header : name.startsWith(header) ? name : `${header} ${name}`.trim();
      out.push({ kind, label, url: href[1] });
    }
  }
  return out;
}

export function parseSchedule(html) {
  const tableStart = html.indexOf('<thead');
  if (tableStart < 0) return [];
  const thead = html.slice(tableStart, html.indexOf('</thead>', tableStart));
  const headers = [...thead.matchAll(/<th[^>]*>(.*?)<\/th>/gs)].map(m => text(m[1]));
  const tbodyStart = html.indexOf('<tbody', tableStart);
  const tbody = html.slice(tbodyStart, html.indexOf('</tbody>', tbodyStart));
  const lessons = [];
  for (const row of tbody.split(/<tr\b[^>]*>/).slice(1)) {
    const tds = [...row.matchAll(/<td[^>]*>(.*?)<\/td>/gs)].map(m => m[1]);
    if (tds.length < 4) continue;
    const date = toISO(text(tds[0]));
    if (!date) continue;
    const materials = [];
    for (let i = 4; i < tds.length; i++) {
      const header = headers[i] || '';
      if (header === '관리') continue;
      materials.push(...parseCell(tds[i], header));
    }
    lessons.push({ date, no: Number(text(tds[1])) || null, title: text(tds[2]), preacher: text(tds[3]), materials });
  }
  return lessons;
}

// KV가 있으면 6시간 캐시
export async function getSchedule(key, year, kv) {
  const src = SOURCES[key];
  if (!src) throw new Error('알 수 없는 부서');
  const cacheKey = `curriculum:${key}:${year}`;
  if (kv) {
    const hit = await kv.get(cacheKey, 'json');
    if (hit) return hit;
  }
  const url = `${BASE}?cId=${src.cId}&year=${year}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000), headers: { 'User-Agent': 'teach-bible/0.1' } });
  if (!res.ok) throw new Error(`연간공과 일정 요청 실패 (${res.status})`);
  const data = { key, label: src.label, year, source: url, lessons: parseSchedule(await res.text()) };
  // 아직 안 올라온 해(빈 표)는 1시간, 있는 해는 6시간 캐시 → 새 연간공과가 올라오면 1시간 안에 반영
  if (kv) await kv.put(cacheKey, JSON.stringify(data), { expirationTtl: data.lessons.length ? 6 * 60 * 60 : 60 * 60 });
  return data;
}
