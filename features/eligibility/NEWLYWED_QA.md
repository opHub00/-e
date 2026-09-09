# Newlywed Eligibility release QA — 2026-09-10

## 판정과 범위

릴리스 전 판정: **GO**. 공식 근거·시행일·12개 check·5개 status·unknown 처리·지원 제외 범위는 [NEWLYWED_README.md](./NEWLYWED_README.md)에 기록했다. 공식 소득표/예치금/순위와 신청 자격을 확정하지 않는다. unknown 자체를 불충족으로 처리하지 않는다.

Claude의 고정 lavender hero, amber/purple/neutral 상태 pill, 다음 행동 우선, 정보 필요 우선 정렬, 최초 3개 조건, 펼침/접기, 도움말 6종, summary replay를 보존했다. 추가 수정은 펼침 후 접기 유지, 도움말 44px, hydration 전 자동 프로필 안내 방지, 사용자 카피의 V1 제거, 해요체 disclaimer다. 내부 버전은 유지했다.

## 실제 preview QA

최종 애플리케이션 preview: https://wanpan-7msgjbsi9-ophub00s-projects.vercel.app

Deployment: `dpl_67kjoMkwQSZgTrPP3yAACcVd5CrE` (READY). 보호를 해제하지 않고 기존 Vercel 신원의 단기 OIDC 헤더로 검증했다. QA 자료 업로드 제외를 위한 `.vercelignore` 추가만 이 배포 뒤에 이루어졌으며 애플리케이션 코드는 동일하다.

- 390×844: Preparation → 신혼부부 특별공급 → Eligibility 진입. 정보 부족 fixture의 amber 상태, fold 위 CTA, 정보 필요 우선 3개 조건, 12개 펼침/접기, `aria-expanded`, 전문용어 도움말 및 44px 터치 높이를 확인했다.
- 부족 정보 → FAMILY Profile에서 기혼/혼인기간/자녀 입력 → 저장 → Eligibility 복귀. 정보 필요 9→6, 확인 1→3으로 실제 재계산됐다.
- 충분한 정보: 확인 6/정보 필요 0/공고 확인 6, purple 상태. 최종 preview에서 불필요한 자동 입력 sheet가 없음을 재검증했다.
- 혼인 8년 fixture: neutral 불충족 pill과 고정 lavender hero를 실제 이미지로 확인했다. 합불에 따른 빨강/초록 hero가 없다.
- 모바일 측정 가로 overflow 0. primary CTA y≈422, 높이 44px 이상.
- 1440×900: Newlywed dashboard → Eligibility → FAMILY Profile 저장 → Eligibility → 실제 AI 응답을 확인했다. 가로 overflow 0, Eligibility 카드 약 720px, 중앙 정렬. viewport를 정한 뒤 새로 로드했다.
- 화면 캡처를 직접 확인했다. 증거 파일은 로컬 `test-results/newlywed-*.png`에 있으며 Git 및 Vercel 업로드에서 제외된다.

## AI 원인과 검증

기존 fallback은 secret 누락이 아니었다. `GEMINI_API_KEY` 존재와 로컬/원격 digest 일치를 확인했다. Gemini 2.5 Flash의 실제 HTTP 200 응답에서 500-token 예산 중 thinking 479 tokens 후 `MAX_TOKENS`로 JSON이 잘렸다. secret 값은 출력하지 않았다.

`thinkingBudget: 0`, 출력 예산 1024, 현재 check key enum을 포함한 JSON schema를 적용하고 STOP 완료 응답만 수용한다. 기존 `ai` endpoint는 변경하지 않았다. 운영 client는 JWT 검증이 켜진 독립 `ai-newlywed`를 사용한다. `ai-newlywed-v1-preview`는 같은 handler의 호환 entrypoint다.

실제 브라우저 요청 **5회**에서 HTTP 200, `fallback: false`, 허용된 checkKeys만 반환됨을 확인했다(모바일 4회, 데스크톱 1회). 요청 root는 `newlywed` 하나이며 context 필드는 feature/status/checks/missingInfo/actions/ruleMetadata뿐이다. 프로필 원본·이름·지역명·금액을 보내지 않았다. 모델은 항목만 선택하고 표시 문장은 결정론적 결과에서 구성한다. 확률·점수·새 판정은 생성하지 않는다. 요청 중 spinner와 비활성 버튼을 확인했다.

브라우저의 해당 endpoint에만 일시 응답 mock을 적용해 `fallback: true` UI, 기존 공고 확인 상태, disclaimer, overflow 0을 확인한 뒤 mock을 제거했다. provider 오류/키 없음/잘못된 키/추가 prose/점수/불완전 JSON/SAFETY/MAX_TOKENS는 handler 테스트로 확인했다.

## 기존 기능 회귀와 검증 한계

- Home, Preparation, Calendar, Newlywed, Benchmark, First-home, Discovery, Detail, Profile, Auth, AI 화면을 실제 preview에서 열었다. 화면별 가로 overflow 0. 실제 공고 `브라운스톤 월곡 센트럴`에서 Personal Fit 및 공식 Competition 접수중 안내와 상세 일정/원문 링크를 확인했다. Preparation의 실제 News 목록도 확인했다.
- Auth 로그인/가입/게스트 UI 및 기존 Auth/Cloud Sync 38개 테스트 통과. 실제 사용자 계정 로그인이나 두 기기 간 동기화는 실행하지 않았다. Auth/RLS/충돌 처리/DB migration 변경은 없다.
- Calendar/News/Discovery/Competition/Personal Fit/Benchmark/기존 AI/PWA의 기존 자동 테스트 통과. PWA 설치 계약(이름, 아이콘, manifest, start URL) 및 service worker 미등록 정책을 유지한다.
- 임시 preview 호스트의 Kakao allowlist 오류는 운영 장애로 판정하지 않는다. 배포 전 고정 운영 도메인에서 데스크톱 Kakao 지도 타일/공고를 확인했다. 운영 배포 후 같은 도메인 모바일 smoke 및 HTTP 상태는 최종 릴리스 보고에 기록한다.
- 기존 First-home의 상태별 hero UI와 초기 hydration 입력 sheet 동작은 별도 UI debt로 남긴다. 이번에 First-home 규칙/UI를 수정하지 않았다.

## 필수 검증

- `npm test`: PASS. 신규 domain/AI 129 assertions, 신규 Edge handler, 기존 모든 suite 포함.
- `npx tsc --noEmit`: PASS.
- `npx expo export --platform web`: PASS, static routes **24개**.
- `git diff --check`: PASS.
- Deno의 `ai-newlywed/index.ts` check: PASS.

기능 및 Claude UI가 신규 route 내부에서 함께 변경되어 안전하게 한 기능 commit으로 보존한다. 운영 릴리스는 master merge/push → production deploy → 고정 도메인 smoke → `newlywed-eligibility-v1` tag 순서다. 실제 commit/deployment/tag hash와 운영 smoke 결과는 최종 사용자 보고에서 확정한다.
