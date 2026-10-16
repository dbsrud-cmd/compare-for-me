# 나 대신 비교해줘 — 무료 인터넷 배포

GitHub 저장소는 소스 보관 장소입니다. GitHub Pages는 서버를 실행하지 않으므로 이 AI 서비스를 단독으로 운영할 수 없습니다. API 키는 반드시 서버에만 등록합니다.

## Cloudflare Workers Free

1. Cloudflare 계정에서 Workers & Pages를 열고 Workers Free인지 확인합니다. 유료 업그레이드·카드 등록이 요구되면 중단합니다.
2. Git 저장소 연결로 `dbsrud-cmd/compare-for-me`를 선택합니다. 새 계정 생성과 GitHub 접근 권한 승인은 사용자가 직접 확인합니다.
3. Build command는 `npm run build`, Deploy command는 `npx wrangler deploy`, 프로젝트 루트는 저장소 최상위로 설정합니다. 빌드는 외부 서버에서 실행되며 이 PC에 프로그램을 설치하지 않습니다.
4. 첫 배포는 비밀 설정이 없으므로 AI 요청을 거절합니다. 발급된 workers.dev 주소를 확인합니다.
5. Worker의 Settings → Variables and Secrets에서 `GEMINI_API_KEY`, `ACCESS_PASSWORD`를 **Secret**으로 등록합니다. ACCESS_PASSWORD는 영문·숫자 16자 이상으로 정하세요. 키·암호를 코드, GitHub 파일 또는 빌드 로그에 넣지 마세요.
6. Gemini 프로젝트가 결제 미연결 Free Tier이고 Worker도 Free임을 확인한 뒤 `FREE_TIER_CONFIRMED` 환경변수를 `true`로 설정합니다. `keep_vars: true`로 대시보드에서 등록한 값이 코드 재배포 후에도 유지됩니다. 이 값이 없으면 분석은 차단됩니다. 이 값은 사용자의 확인 표시이며 계정 과금을 자동 검증하지 않습니다.
7. 새 HTTPS 주소에서 텍스트 및 개인정보 없는 이미지로 실제 분석을 테스트합니다. 운영 주소를 확인하기 전에는 배포 완료로 간주하지 않습니다.

공유할 때 링크 표시 이름은 **나 대신 비교해줘**로 씁니다. 실제 URL은 Cloudflare가 부여하는 영문 workers.dev 주소이며 커스텀 도메인 구매는 필요하지 않습니다.

## 제한과 보안

- 무료 한도 초과 시 중단하고 유료 모델 전환이나 자동 재시도를 하지 않습니다.
- 앱 요청 제한은 Worker 인스턴스당 분당 3회·하루 30회이며 전역 계정 한도가 아닙니다. 무료 티어 여부를 반드시 계정에서 확인합니다.
- 초기 운영은 이용 암호를 아는 사람만 사용하도록 합니다. 공개 다중 사용자 서비스로 확대하기 전 전역 사용량 제한을 별도로 검토합니다.
- `deploy/public`에는 허용된 정적 파일 5개만 포함됩니다. 비밀 파일·서버 소스·테스트 이미지를 정적 파일로 배포하지 않습니다.
- 아직 Cloudflare 계정 설정·서버 비밀 등록·인터넷 배포 검증은 완료하지 않았습니다.

공식 문서: https://developers.cloudflare.com/workers/platform/pricing/ / https://developers.cloudflare.com/workers/configuration/secrets/ / https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages
