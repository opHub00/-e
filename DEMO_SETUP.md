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

`전체 → 데모 초기화`는 Intro, ApplicantProfile, 저장 공고 ID, 퀴즈/XP, prompt fatigue의 앱 로컬 상태를 초기화합니다. Supabase Auth 사용자나 cloud profile/saved 데이터는 삭제하지 않습니다. 로그인 중에는 cloud write를 일시정지하고 `전체 → 클라우드 정보 복원`으로 다시 가져올 수 있습니다.

권장 흐름:

```text
Demo Reset → Intro → Onboarding(전국 17개 시도) → Home 실제 공고
→ Profile → Preparation → Future → 생애최초 → 전국 Discovery
→ Listing Detail → Personal Fit → 부족한 Profile bundle 입력 → Detail 복귀
→ Save → Home → 새로고침 → 저장 유지 → AI 설명
```

Auth/cloud sync 시연은 guest Profile 입력과 공고 저장 후 `전체 → 로그인하고 이어보기`에서 이메일 계정을 만듭니다. 금요일 데모의 production Auth는 이메일 확인을 요구하지 않는 시연용 정책이며, 가입 즉시 session을 발급하고 local→cloud 동기화 후 짧은 성공 안내와 함께 Home으로 이동합니다. 이메일 소유권을 검증하지 않으므로 일반 공개 운영 전에는 확인 메일 또는 검증된 custom SMTP 정책을 다시 적용해야 합니다. 최초 로그인은 local profile을 빈 cloud에 올리고, 다른 브라우저 로그인은 cloud profile과 저장 공고를 복원합니다. 서로 다른 확정 profile 값이 양쪽에 있으면 자동 덮어쓰기 대신 `이 기기 정보 사용` 또는 `클라우드 정보 사용`을 선택합니다.

로그아웃은 계정의 cloud 데이터를 유지하지만 해당 브라우저의 profile·saved cache를 비웁니다. 따라서 공유 기기에서 다음 guest에게 이전 계정 정보가 노출되지 않습니다.

Profile의 전문용어 도움말은 답변을 바꾸지 않습니다. 판단하기 어려우면 `잘 모르겠어요`를 선택하며 기존 `unknown` 상태로 저장됩니다. AI 요청 중에는 진행 표시와 중복 제출 차단이 적용되고, timeout·429·일시적 서버 오류는 자동 재시도 없이 안전한 안내와 `다시 시도`를 제공합니다.

## 3. PWA 설치 준비

production export에는 web app manifest와 192/512 아이콘, standalone 시작 설정이 포함됩니다. 설치 이벤트를 제공하는 데스크톱/Android 브라우저에서는 `전체 → 앱처럼 사용하기`를 사용할 수 있습니다. iOS Safari는 공유 메뉴의 `홈 화면에 추가`를 사용합니다. 브라우저 정책에 따라 설치 항목이 즉시 보이지 않을 수 있습니다.

이번 V1은 Service Worker와 offline cache를 등록하지 않습니다. 따라서 새 배포 JS와 ApplyHome·Supabase Edge·Kakao Map·News·AI 응답을 오래된 cache가 가로채지 않습니다. 설치 후에도 네트워크 연결은 필요합니다.

## 4. 정적 export

```powershell
npx expo export --platform web
```

출력은 `dist/`입니다. 배포 전 `/`, `/profile`, `/future`, `/eligibility/first-home`, `/discovery`, `/discovery/[id]` 결과가 빈 shell이 아니고 Expo root markup과 route bundle을 포함하는지 확인합니다. root `/`는 클라이언트 hydration 뒤 Intro/Onboarding 상태에 따라 이동합니다.

## 5. 추천 플랫폼: Vercel

현재 production은 https://wanpan-e.vercel.app 에 배포되어 있습니다. 저장소의 `vercel.json`은 build command, `dist` 출력 디렉터리, 임의의 공고 ID를 export된 `/discovery/[id]` route로 연결하는 rewrite만 고정합니다. `.vercelignore`는 로컬 `.env`와 `.env.*` 파일이 원격 빌드에 업로드되지 않도록 차단합니다.

Vercel 프로젝트 설정:

1. 저장소 root를 프로젝트 root로 선택합니다.
2. Build Command는 `npx expo export --platform web`, Output Directory는 `dist`를 사용합니다.
3. 위 세 `EXPO_PUBLIC_*` 환경변수만 Production/Preview에 등록합니다.
4. Kakao Developers → 앱 → 플랫폼 키 → JavaScript 키 → JavaScript SDK 도메인에 `https://wanpan-e.vercel.app`을 등록하고, Device Toolbar 상태를 먼저 정한 뒤 페이지를 새로고침해 지도를 확인합니다. JavaScript SDK의 도메인 허용 목록 변경에는 앱 재배포가 필요하지 않습니다.

`GEMINI_API_KEY`, `NAVER_NEWS_CLIENT_ID`, `NAVER_NEWS_CLIENT_SECRET`, `DATA_GO_KR_SERVICE_KEY`, `KAKAO_REST_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`는 Vercel 환경변수에 넣지 않습니다.

## 6. Supabase Edge Functions

production 클라이언트는 `EXPO_PUBLIC_SUPABASE_URL`의 표준 endpoint를 anon key와 함께 호출합니다.

| Function | Client route | 서버 secret |
|---|---|---|
| `listings` | `/functions/v1/listings` | `DATA_GO_KR_SERVICE_KEY`, `KAKAO_REST_API_KEY`, Supabase server vars |
| `news` | `/functions/v1/news` | `NAVER_NEWS_CLIENT_ID`, `NAVER_NEWS_CLIENT_SECRET` |
| `news-impact` | `/functions/v1/news-impact` | `GEMINI_API_KEY` |
| `ai` | `/functions/v1/ai` | `GEMINI_API_KEY` |

네 함수는 web client용 CORS/OPTIONS와 `authorization`, `apikey` header를 수용합니다. 서버 secret은 Supabase Dashboard/CLI에서만 관리합니다.

Auth/cloud sync는 별도 public env를 추가하지 않고 같은 Supabase URL/anon key를 사용합니다. `user_profiles`와 `saved_listings`는 authenticated 역할에만 Data API 권한을 주고, 모든 CRUD 정책에서 `auth.uid() = user_id`를 확인합니다. 기존 Edge Functions의 anonymous demo 사용 정책은 변경하지 않습니다.

```powershell
supabase functions deploy listings
supabase functions deploy news
supabase functions deploy news-impact
supabase functions deploy ai --no-verify-jwt
```

배포 정책의 JWT 설정은 현재 client 호출 방식과 프로젝트 정책을 함께 확인해 결정합니다. URL/anon key가 없거나 네트워크 요청이 실패하면 화면은 오류 또는 명시된 fallback을 표시해야 하며, secret을 클라이언트로 옮겨 해결하지 않습니다.

## 7. 시연 전 검증

```powershell
npm test
npx tsc --noEmit
npx expo export --platform web
git diff --check
```

`test:edge`의 Deno 다운로드/cache 실패는 TypeScript나 Edge 로직 실패와 구분해 기록합니다. 인터넷 연결이 가능한 환경에서는 dependency cache를 준비한 뒤 다시 실행합니다.
