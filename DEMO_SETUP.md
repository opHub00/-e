# 완판e Demo / Web Deployment Setup

## 1. 로컬 데모

준비물은 Node.js 22 LTS, npm, 배포된 Supabase 프로젝트의 URL/anon key, Kakao Maps JavaScript key입니다.

```powershell
npm install
Copy-Item .env.example .env
npx expo start --web --port 8081
```

`.env`에는 아래 세 공개 클라이언트 설정만 입력합니다. 값이나 `.env` 파일은 커밋하지 않습니다.

```dotenv
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
EXPO_PUBLIC_KAKAO_MAP_JAVASCRIPT_KEY=
```

Kakao Developers → 내 애플리케이션 → 플랫폼 → Web 사이트 도메인에 로컬 시연 주소 `http://localhost:8081`을 등록합니다. Device Toolbar의 모바일/데스크톱 상태를 먼저 정한 뒤 새로고침해야 지도 lifecycle을 올바르게 확인할 수 있습니다.

## 2. 시연 전 초기화와 흐름

`전체 → 데모 초기화`는 Intro, ApplicantProfile, 저장 공고 ID, 퀴즈/XP, prompt fatigue의 앱 로컬 상태를 초기화합니다. Supabase 데이터나 다른 사용자 데이터는 건드리지 않습니다.

권장 흐름:

```text
Demo Reset → Intro → Onboarding(전국 17개 시도) → Home 실제 공고
→ Profile → Preparation → Future → 생애최초 → 전국 Discovery
→ Listing Detail → Save → Home → 새로고침 → 저장 유지 → AI
```

## 3. 정적 export

```powershell
npx expo export --platform web
```

출력은 `dist/`입니다. 배포 전 `/`, `/profile`, `/future`, `/eligibility/first-home`, `/discovery`, `/discovery/[id]` 결과가 빈 shell이 아니고 Expo root markup과 route bundle을 포함하는지 확인합니다. root `/`는 클라이언트 hydration 뒤 Intro/Onboarding 상태에 따라 이동합니다.

## 4. 추천 플랫폼: Vercel

현재 구조에는 Vercel의 정적 output 배포가 가장 단순합니다. 저장소의 `vercel.json`은 build command, `dist` 출력 디렉터리, 임의의 공고 ID를 export된 `/discovery/[id]` route로 연결하는 rewrite만 고정합니다. 실제 계정 로그인이나 production 배포는 이 저장소 작업에 포함하지 않습니다.

Vercel 프로젝트 설정:

1. 저장소 root를 프로젝트 root로 선택합니다.
2. Build Command는 `npx expo export --platform web`, Output Directory는 `dist`를 사용합니다.
3. 위 세 `EXPO_PUBLIC_*` 환경변수만 Production/Preview에 등록합니다.
4. 첫 배포 URL이 정해지면 Kakao Web 사이트 도메인에 `https://<production-domain>`을 추가한 뒤 다시 배포합니다.

`GEMINI_API_KEY`, `NAVER_NEWS_CLIENT_ID`, `NAVER_NEWS_CLIENT_SECRET`, `DATA_GO_KR_SERVICE_KEY`, `KAKAO_REST_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`는 Vercel 환경변수에 넣지 않습니다.

## 5. Supabase Edge Functions

production 클라이언트는 `EXPO_PUBLIC_SUPABASE_URL`의 표준 endpoint를 anon key와 함께 호출합니다.

| Function | Client route | 서버 secret |
|---|---|---|
| `listings` | `/functions/v1/listings` | `DATA_GO_KR_SERVICE_KEY`, `KAKAO_REST_API_KEY`, Supabase server vars |
| `news` | `/functions/v1/news` | `NAVER_NEWS_CLIENT_ID`, `NAVER_NEWS_CLIENT_SECRET` |
| `news-impact` | `/functions/v1/news-impact` | `GEMINI_API_KEY` |
| `ai` | `/functions/v1/ai` | `GEMINI_API_KEY` |

네 함수는 web client용 CORS/OPTIONS와 `authorization`, `apikey` header를 수용합니다. 서버 secret은 Supabase Dashboard/CLI에서만 관리합니다.

```powershell
supabase functions deploy listings
supabase functions deploy news
supabase functions deploy news-impact
supabase functions deploy ai --no-verify-jwt
```

배포 정책의 JWT 설정은 현재 client 호출 방식과 프로젝트 정책을 함께 확인해 결정합니다. URL/anon key가 없거나 네트워크 요청이 실패하면 화면은 오류 또는 명시된 fallback을 표시해야 하며, secret을 클라이언트로 옮겨 해결하지 않습니다.

## 6. 시연 전 검증

```powershell
npm test
npx tsc --noEmit
npx expo export --platform web
git diff --check
```

`test:edge`의 Deno 다운로드/cache 실패는 TypeScript나 Edge 로직 실패와 구분해 기록합니다. 인터넷 연결이 가능한 환경에서는 dependency cache를 준비한 뒤 다시 실행합니다.
