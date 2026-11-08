# 📖 공과강사

유초등부·중고등부 공과를 준비하고, 수업 시간에 큰 화면으로 진행하는 웹 앱입니다.

## 기능
- 공과 작성: 제목, 날짜, 본문 구절, 말씀 본문, 핵심 메시지
- **유초등부** 탭: 도입 이야기, 쉬운 설명, 활동/게임, 퀴즈(정답 포함), 암송 구절
- **중고등부** 탭: 도입 질문, 말씀 설명, 토론 질문, 삶에 적용하기
- **수업 모드**: 큰 글씨로 한 장씩 넘기며 진행 (퀴즈 정답 보기, 키보드 ←/→)
- 인쇄용 진행안, 자동 저장(브라우저), 휴대폰/태블릿 화면 지원
- **API 테스트** 창: `api.jbch.org` 엔드포인트를 직접 호출해 응답 확인

## 실행
Node.js 22 이상이 필요합니다. 별도 패키지 설치는 없습니다.

```bash
cp .env.example .env   # dev_name, tokenId 입력
npm start              # http://localhost:3000
```

## API 연동 구조
`apps.jbch.org` 매뉴얼에 따라 모든 요청에 `dev_name`과 `tokenId`가 포함되어야 합니다.
토큰이 브라우저에 노출되지 않도록 **서버(`server.js`)가 대신 붙여서** `https://api.jbch.org`로 전달합니다.

```
브라우저 ──POST /api/jbch {method, path, params}──▶ server.js ──(+dev_name, tokenId)──▶ api.jbch.org
```

`.env` 파일은 `.gitignore`에 포함되어 있으니 절대 커밋하지 마세요.
