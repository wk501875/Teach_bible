# 📖 공과강사

매달 카톡방으로 받는 **공과 배정표**, 전국교회학교 **연간공과 일정(머릿돌·참빛)**, **유튜브 공과 말씀**을
한 화면에서 볼 수 있게 모아주는 웹 앱입니다. Cloudflare Workers에서 동작합니다.

## 화면
- **내 공과**: 이름을 고르면 다가오는 배정이 D-day와 함께 나옵니다.
  공과마다 몇 과인지, 공과 말씀 유튜브, 부서에 맞는 학년별 PDF, 한글파일, 음성이 자동으로 연결됩니다.
- **배정표**: 월별 배정표를 보여주고 내 칸을 강조합니다. 휴대폰에서는 주별 카드로 보입니다.
- **배정표 입력**: 매달 새 배정표를 입력합니다. 일요일은 자동으로 채워지고 "중고등 통합"도 선택할 수 있습니다.
  집회나 특별 행사 주는 그 일정을 그대로 적으면 됩니다. 연간공과에 없는 제목이라 자료가 붙지 않습니다.
- **앱 안에서 바로 보기**: PDF는 앱 안 뷰어(pdf.js)로 열리고 다운로드 버튼이 있습니다. 유튜브와 음성은 앱 안에서 재생되고,
  한글파일은 누르면 바로 받아집니다. 파일은 Worker의 `/api/file`이 jbch.org 주소만 중계합니다.
- **추가 메모**: 공과마다 링크나 메모를 더 저장하면 모든 강사가 함께 봅니다.

연간공과 자료는 [전국교회학교](https://www.jbch.org/ko/school/?cId=715) 연간공과 일정 표를 Worker가 직접 읽어서
배정표의 **공과 제목**과 맞춥니다. 행사로 건너뛰는 주가 있어도 어긋나지 않습니다. 로그인은 필요 없고, 결과는 6시간 동안 캐시합니다.

## 구조
| 파일 | 역할 |
|---|---|
| `public/` | 화면 (HTML/CSS/JS) |
| `src/worker.js` | API: 배정표, 메모, 연간공과 (`/api/...`) |
| `src/jbch-school.js` | 연간공과 일정 표 파서 |
| `data/schedule-*.json` | 기본 배정표 (2026년 10월, 11월). KV에 저장된 배정표가 있으면 그것을 우선 사용 |
| `wrangler.jsonc` | Cloudflare 설정 (KV 바인딩 `DATA`) |

## Cloudflare 배포 (태블릿에서도 가능)
1. Cloudflare 대시보드에서 **Workers & Pages → Create → Import a repository**를 선택합니다.
2. GitHub의 `wk501875/Teach_bible` 저장소를 연결합니다. Build command는 비워 두고, Deploy command는 `npx wrangler deploy`입니다.
3. 배포가 끝나면 `https://teach-bible.<계정>.workers.dev` 주소가 생깁니다. 이 주소를 카톡방에 공유하면 됩니다.
4. (선택) **Settings → Variables and Secrets**에서 Secret `ADMIN_PASSWORD`를 추가하면, 배정표를 저장할 때 비밀번호를 묻습니다.

배정표와 메모를 저장할 KV는 첫 배포 때 자동으로 만들어집니다. 만약 KV 관련 오류가 나면
**Storage & Databases → KV**에서 namespace를 하나 만들고, 그 ID를 `wrangler.jsonc`의 `kv_namespaces`에 `"id": "..."`로 넣어 주세요.

## 로컬 개발
```bash
npm install
cp .dev.vars.example .dev.vars   # 필요하면 ADMIN_PASSWORD 입력
npm run dev                      # http://localhost:8787
```
