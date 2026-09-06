# 완판e MVP

청약 준비 상태를 쌓고, 생애최초 기본조건과 전국 청약홈 공고를 한 흐름에서 확인하는 Expo Router 앱입니다. Expo SDK 57, React Native Web, TypeScript, Zustand를 사용합니다.

## 현재 제품 흐름

```text
Intro → 최소 Onboarding → Home → 청약 프로필 → Preparation → Future
→ 생애최초 Eligibility → 전국 Discovery → Listing Detail → AI
```

- Home, Discovery, Listing Detail은 모두 `useListingDataset()`의 동일한 ApplyHome 데이터셋을 사용합니다.
- live 조회에 성공하면 mock 공고는 섞지 않습니다. 실패한 경우에만 화면에 표시된 demo fallback을 사용합니다.
- 추천 순서는 사용자가 입력한 관심지역·나이·주택·청약통장 정보 중 확인된 신호만 기존 relevance에 적용합니다. 자격이나 당첨 가능성을 판정하지 않습니다.
- Discovery는 17개 시도, 복수 지역 선택, Profile 관심지역 기본 필터를 지원합니다.
- 앱은 guest-first입니다. 로그인 없이 기존 흐름을 모두 사용할 수 있고, 이메일 계정은 ApplicantProfile V2와 저장 공고를 다른 기기에서도 이어볼 때만 제안합니다.
- 로그인 상태에서는 local cache를 즉시 갱신한 뒤 Supabase에 동기화합니다. 최초 로그인 시 profile은 unknown/응답값을 보존해 병합하고 확정값 충돌은 사용자가 선택하며, 저장 공고 ID는 합집합으로 병합합니다.

## 실행과 검증

```bash
npm install
npm run web
npm test
npx tsc --noEmit
npx expo export --platform web
git diff --check
```

웹 정적 결과는 `dist/`에 생성됩니다. 로컬·배포 준비 절차는 [DEMO_SETUP.md](./DEMO_SETUP.md)를 참고하세요.

Production 웹 데모: https://wanpan-e.vercel.app

## 클라이언트 환경변수

`.env.example`을 `.env`로 복사하고 다음 공개 클라이언트 설정만 입력합니다.

```dotenv
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
EXPO_PUBLIC_KAKAO_MAP_JAVASCRIPT_KEY=
```

`EXPO_PUBLIC_*` 값은 웹 번들에 포함됩니다. Gemini, Naver, 공공데이터, Kakao REST, Supabase service-role 키는 클라이언트 `.env`나 호스팅 변수에 넣지 않고 Supabase Edge Function secret으로만 관리합니다.
Vercel 업로드에서는 `.vercelignore`가 모든 `.env` 계열 파일을 차단합니다.

## 데이터와 로컬 상태

| 상태 | 저장 방식 | Demo Reset |
|---|---|---|
| Intro 완료 | web `localStorage` / native `AsyncStorage` | 초기화 |
| ApplicantProfile V2 | guest: local / 로그인: local cache + Supabase `user_profiles` | 로컬만 초기화 |
| 저장 공고 ID | guest: local / 로그인: local cache + Supabase `saved_listings` | 로컬만 초기화 |
| Supabase Auth session | Supabase client session storage | 유지 |
| 오늘 퀴즈 / XP | 세션 메모리 | 초기화 |
| Prompt fatigue | 세션 메모리 | 초기화 |
| AI 대화 | 화면 세션 메모리 | 화면을 나가면 종료 |

저장 공고에는 공고 객체가 아니라 ID만 보관합니다. 현재 live 데이터셋에서 사라진 ID는 화면에서 안전하게 건너뜁니다. Demo Reset은 위 표의 앱 로컬 데모 상태만 지우며 서버나 production 사용자 데이터는 삭제하지 않습니다.

로그아웃하면 cloud 데이터는 삭제하지 않고 다음 로그인에 복원할 수 있도록 유지합니다. 다만 공유 기기에서 이전 사용자의 개인정보가 보이지 않도록 해당 기기의 profile·saved cache는 즉시 비웁니다. 로그인 중 Demo Reset을 실행하면 cloud write를 일시정지하며, `전체` 탭에서 명시적으로 cloud 데이터를 복원할 수 있습니다.

## 주요 구조

| 경로 | 역할 |
|---|---|
| `app/` | Expo Router 화면과 제품 흐름 |
| `features/profile/` | ApplicantProfile V2, migration, completeness, prompt fatigue |
| `features/auth/` | 이메일 Auth, local/cloud merge, sync repository, session persistence |
| `features/eligibility/` | 생애최초 deterministic rule engine 및 AI context |
| `features/discovery/` | 17개 시도, ApplyHome repository, saved persistence, Kakao map |
| `features/news/` | Naver news 정규화, relevance, grounded impact context |
| `domain/` | Preparation / Future / Quiz / AI context 순수 계산 |
| `supabase/functions/` | `listings`, `news`, `news-impact`, `ai` Edge Functions |
| `supabase/migrations/` | Auth 사용자별 profile/saved schema, grants, RLS policies |

## 안전 경계

- 생애최초 결과는 입력 정보와 deterministic rule의 결과이며, 모집공고별 최종 자격 판정이 아닙니다.
- Gemini는 이미 계산된 결과나 제공된 뉴스 근거를 설명하며, 추천 순위·점수·당첨 확률을 새로 계산하지 않습니다.
- ApplyHome·Kakao·News 서버 키는 Edge Functions에만 존재해야 합니다.
