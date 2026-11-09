// 배정표 이미지 읽기 (Cloudflare Workers AI, 무료 사용량 안에서)
// 결과는 바로 저장하지 않고 입력 화면에 채워 사람이 확인한 뒤 저장한다.
const MODELS = [
  { id: '@cf/meta/llama-4-scout-17b-16e-instruct', style: 'chat' },
  { id: '@cf/mistralai/mistral-small-3.1-24b-instruct', style: 'chat' },
  { id: '@cf/google/gemma-3-12b-it', style: 'chat' },
  { id: '@cf/meta/llama-3.2-11b-vision-instruct', style: 'legacy' },
];

const PROMPT = `이 이미지는 한국 교회학교의 월별 "공과 배정표"입니다.
열: 일자 | 유치부 | 초등 1~3학년 | 초등 4~6학년 | 중등부 | 고등부
각 칸은 첫 줄이 공과 제목, 둘째 줄이 담당자(한글 이름 + 영문 대문자 한 글자, 예: 유석준B)입니다.
중등부와 고등부가 하나로 합쳐진 칸은 "youth"에 넣고 middle, high는 null로 두세요.
담당자 없이 행사 이름만 있는 칸(예: 대전도집회 생활말씀)은 teacher를 ""로 두세요.
글자는 이미지에 보이는 그대로 옮기고, 추측해서 바꾸지 마세요.
아래 JSON 형식으로만 답하세요. 설명이나 다른 글은 쓰지 마세요.
{"title":"표 제목","weeks":[{"date":"11/1","kinder":{"title":"","teacher":""},"elLow":{...},"elHigh":{...},"middle":{...}|null,"high":{...}|null,"youth":{...}|null}]}`;

function extractJson(text) {
  const s = String(text || '');
  const a = s.indexOf('{'); const b = s.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(s.slice(a, b + 1)); } catch { return null; }
}
const textOf = r => typeof r === 'string' ? r : r?.response ?? r?.result?.response ?? r?.choices?.[0]?.message?.content ?? (typeof r?.response === 'object' ? JSON.stringify(r.response) : '');

async function runModel(env, m, dataUrl, bytes) {
  if (m.style === 'chat') {
    return env.AI.run(m.id, {
      messages: [{ role: 'user', content: [{ type: 'text', text: PROMPT }, { type: 'image_url', image_url: { url: dataUrl } }] }],
      max_tokens: 2500, temperature: 0,
    });
  }
  const input = { messages: [{ role: 'user', content: PROMPT }], image: [...bytes], max_tokens: 2500, temperature: 0 };
  try { return await env.AI.run(m.id, input); }
  catch (e) {
    // Llama 3.2 Vision은 처음 한 번 라이선스 동의가 필요
    if (/agree|license/i.test(String(e?.message))) { await env.AI.run(m.id, { prompt: 'agree' }); return env.AI.run(m.id, input); }
    throw e;
  }
}

export async function handleScheduleImage(req, env) {
  if (!env.AI) return new Response(JSON.stringify({ error: 'AI 기능이 연결되지 않았습니다 (wrangler 설정의 ai 바인딩)' }), { status: 503, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
  let b; try { b = await req.json(); } catch { b = null; }
  const dataUrl = String(b?.image || '');
  const m64 = dataUrl.match(/^data:image\/(png|jpe?g|webp);base64,([A-Za-z0-9+/=]+)$/);
  if (!m64) return new Response(JSON.stringify({ error: '이미지 형식이 올바르지 않습니다' }), { status: 400, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
  if (m64[2].length > 4_000_000) return new Response(JSON.stringify({ error: '이미지가 너무 큽니다' }), { status: 413, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
  const bytes = Uint8Array.from(atob(m64[2]), c => c.charCodeAt(0));
  const errors = [];
  for (const m of MODELS) {
    try {
      const r = await runModel(env, m, dataUrl, bytes);
      const parsed = extractJson(textOf(r));
      if (parsed?.weeks?.length) {
        return new Response(JSON.stringify({ model: m.id, result: parsed }), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
      }
      errors.push(`${m.id.split('/').pop()}: 표를 읽지 못함`);
    } catch (e) { errors.push(`${m.id.split('/').pop()}: ${String(e?.message || e).slice(0, 120)}`); }
  }
  return new Response(JSON.stringify({ error: '이미지에서 배정표를 읽지 못했습니다', details: errors }), { status: 502, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
}
