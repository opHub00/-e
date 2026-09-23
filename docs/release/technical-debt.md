# Technical debt (production 운영 중 기록)

고치지 않고 기록만 해 둔 항목. 손대려면 별도 승인이 필요하다.

## 1. 프로필 동기화의 오류 가시성 (2026-09-23 기록)

**현재 production 동작은 정상이다.** 로그인 → 수정 → 저장 → 새로고침 → 로그아웃 → 재로그인에서 값이 유지되는 것을 production smoke로 확인했다(`user_profiles` read 200, upsert 200). 그래서 아래는 장애가 아니라, 문제가 생겼을 때 알아채기 어려운 구조에 대한 기록이다.

- 로그인 직후 initial sync가 실패하면, 그 뒤의 프로필 변경은 조용히 로컬에만 남는다.
- 충돌 상태나 upsert 실패에서도 cloud write를 멈추고 로컬에만 저장한다.
- 로그아웃하면 로컬 캐시를 지우므로, 그때까지 동기화되지 않은 변경은 사라진다.
- Supabase 오류 객체의 `code` / `message` / `details` / `hint`를 버리고 있어서, 실패 원인(예: 42501 RLS, PGRST205·42P01 스키마 캐시, 42703·PGRST204 컬럼, 401 인증)을 나중에 구분할 수 없다.

다음에 손볼 때의 최소 방향(제안):
1. 오류 코드를 보존해 로깅한다. 값 자체는 남기지 않는다.
2. "이 기기에만 저장됨" 상태를 사용자가 볼 수 있게 한다.
3. 로그아웃 시 미동기화 변경이 있으면 먼저 알린다.

architecture 변경은 이번 범위가 아니다. 지금은 관측성만 문제다.

## 2. 청약홈 공고 목록 0건 (2026-09-22 기록)

production `listings` Edge Function은 HTTP 200으로 응답하지만 상류 data.go.kr 조회가 0건을 돌려준다(`fetchedCount: 0`, 두 operation 모두). 앱은 설계대로 데모 목록을 보여준다. 그래서 공고 목록에서 고덕 상담으로 들어가는 경로가 없고, 직접 링크로만 열린다. web 배포와는 무관한 서버 쪽 문제다. key·할당량·조회 구간을 확인해야 한다.

## 3. Preview 환경 build 실패 (2026-09-22 기록)

Vercel Preview에는 `SUPABASE_PRODUCTION_PROJECT_REF`가 없어서 release build가 fail-closed로 실패한다. Preview를 쓰려면 Preview 전용 대상(스테이징 또는 production ref)을 정해야 한다.
