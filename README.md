# 완판e MVP — RC2

2030 청약 준비 프로토타입. Expo (SDK 57) + Expo Router + TypeScript + Zustand.

**RC2 = 동결 상태.** Vertical Slice 1~4 완료, 시연 가능. 추가 코드 변경 없음.

## 실행

```bash
npm install
npm run web       # 가장 빠른 시연 경로
npm run android   # 또는 npm run ios
```

## 검증

```bash
npm run typecheck    # tsc --noEmit
npm run test:domain  # domain 순수 함수 자체 검증
```

## 구조

| 경로 | 역할 |
|---|---|
| `app/` | Expo Router 라우트. `index`(온보딩) → `home` → `future` |
| `domain/` | 준비도/미래 계산. 순수 함수, UI 의존 없음 |
| `store/` | Zustand — UserProfile, XP, streak |
| `components/` | WanpanCard / PrimaryButton / MetricCard / Disclaimer |
| `design/tokens.ts` | 색·간격·radius·타이포 스케일·컨트롤 높이 |
| `data/` | 퀴즈 콘텐츠 |
| `supabase/functions/ai/` | Gemini proxy Edge Function (Deno) |

## AI 설정 (Vertical Slice 3)

Gemini API Key는 **클라이언트에 절대 들어가지 않는다.** Edge Function의 secret으로만 존재한다.

```bash
supabase login
supabase link --project-ref <project-ref>
supabase secrets set GEMINI_API_KEY=<google-ai-studio-key>
supabase functions deploy ai --no-verify-jwt
```

그 다음 `.env.example`을 `.env`로 복사하고 프로젝트 URL / anon key를 채운다.

```
EXPO_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...
```

설정 전에는 `/ai` 화면이 크래시 없이 "AI 연결이 아직 설정되지 않았어요" 오류 카드를 보여준다.

> `.env` 를 고쳤으면 **`npx expo export --platform web --clear`** 로 캐시를 비우고 다시 빌드해야 한다.
> Metro 가 이전 번들을 재사용해서 값이 인라인되지 않는다. (RC1 검증 중 실제로 겪음)

### Supabase 없이 로컬에서 확인하기

Edge Function 은 Deno 파일이라 그대로 실행할 수 있다. Docker/Supabase CLI 가 필요 없다.

```bash
GEMINI_API_KEY=<key> npx deno@2 run --allow-net --allow-env supabase/functions/ai/index.ts
```

`.env` 를 `EXPO_PUBLIC_SUPABASE_URL=http://localhost:8000` 으로 두면 앱이 이 서버를 호출한다.
(`ANON_KEY` 는 아무 문자열이나 넣으면 된다 — 로컬 실행에는 Supabase 게이트웨이가 없다.)

계산은 전부 `domain/`이 끝낸 뒤 `formatContextForPrompt()`로 프롬프트에 실려 나간다.
Gemini는 그 숫자를 **설명만** 한다 — 새 숫자, 가점, 당첨 확률, 자격 판정은 system prompt에서 금지.

## RC2 (2026-08-24) — 동결

RC1 잔여 이슈 1번(AI가 청약 제도 요건을 단정)만 수정했다.
변경 파일은 `supabase/functions/ai/index.ts` 의 system prompt 하나뿐. 앱 코드·domain 은 RC1 그대로다.

system prompt 에 "청약 제도 언급 금지" 블록 추가:
- [사용자 상태]에 없는 청약 제도 기준을 새로 언급하지 않는다
- 1순위·특별공급 자격·가점·당첨 가능성·자격 충족 여부를 추론하거나 단정하지 않는다
- 계산된 변화는 설명하되, 그것이 특정 자격 획득으로 이어진다고 연결하지 않는다
- 자격 질문에는 "정확한 자격은 해당 모집공고와 공식 기준 확인이 필요합니다"로 안내한다

### 실제 Gemini 응답 검증 (Home 3회 / Future 3회)
위반 0건 / 6건.

| | RC1 | RC2 |
|---|---|---|
| 통장 2년 언급 | "2년이 되면 **1순위 자격을 얻을 수 있는 중요한 기준 중 하나를 만족**하게 돼요" | "청약통장 가입 기간이 **2년이 돼요.** 통장을 그대로 유지하면서…" |

`당첨 확률` / `청약 가점` 이 등장한 4건은 전부 `"…와는 다르다"` 형태의 고지 재진술로,
기존 프롬프트가 지시하는 정상 동작이다.

### RC2 알려진 이슈
- **응답에 간혹 마크다운 문법이 섞인다.** 6건 중 1건에서 `**굵게**` 와 `*` 불릿이 나왔다.
  앱은 답변을 일반 `Text` 로 렌더하므로 별표가 그대로 보인다. 표시 품질 문제이며 동작에는 지장 없다.
- Home 인사말이 레벨 칩과 겹쳐 2줄로 감긴다. 가독성 문제는 없다.
- 상태는 메모리에만 있다. 앱을 껐다 켜면 온보딩부터 다시 시작한다 (AsyncStorage 는 P1).
- 대화 내용은 저장하지 않는다.

### Gemini free tier 한도 주의
`gemini-2.5-flash` 무료 등급은 요청 수 한도가 매우 낮다 (`limit: 20`).
검증 중 소진되면 Edge Function 이 502 `"AI 응답을 받지 못했어요"` 를 반환한다.
**502 가 뜨면 코드 문제가 아니라 쿼터부터 확인할 것.** 시연 전에는 여유 쿼터를 확보해 두는 게 좋다.

## RC1 검증 결과 (2026-08-24)

| 항목 | 결과 |
|---|---|
| `npm run test:domain` | 145개 검증 통과 |
| `npx tsc --noEmit` | 통과 |
| `npx expo export --platform web` | 7개 라우트 |
| 앱 → Edge Function → Gemini → 앱 왕복 | 실제 키로 성공 (2.1~2.7초) |
| Home / Future / Quiz / AI 모바일 390×844 | 확인 |
| Quiz O 선택 → 결과 → +10 XP | 확인 |
| AI loading / error / 다시 시도 | 확인 |

### RC1에서 고친 치명적 버그
`gemini-2.5-flash` 는 thinking 모델이라 사고 토큰이 `maxOutputTokens` 를 소모한다.
600 토큰 중 573을 사고에 쓰고 답변은 23토큰에서 `MAX_TOKENS` 로 잘렸다 — **모든 AI 답변이 한 문장도 못 채우고 끊겼다.**
`thinkingConfig: { thinkingBudget: 0 }` 로 해결. 응답 시간도 4.0초 → 2.4초로 줄었다.
추가로 `finishReason !== 'STOP'` 이면 잘린 답변을 노출하지 않고 오류로 처리한다.

### RC1 잔여 이슈였던 것
AI 가 "2년이 되면 1순위 자격을 얻을 수 있는 기준 중 하나를 만족" 처럼 제도 요건을 단정했다.
→ **RC2 에서 수정 완료.**

## 시연 순서 (2~3분)

1. 온보딩 인트로 → **시작하기**
2. 프로필 폼 (기본값 그대로) → **내 준비도 보기**
3. 홈 — 준비도 72점, `2년 뒤 +12`
4. **미래의 나는?** → 1/2/5년 전환, 변화 이유 확인
5. **왜 이렇게 달라지나요? ✨** → AI 설명
6. 홈 → **오늘의 30초 퀴즈** → O/X → 결과 + 개인화 → +10 XP
7. 홈에서 XP 반영 확인

## 데모 진행

기본 프로필이 **지민 / 22세 / 학생 / 무주택 / 통장 14개월 / 월 10만원**으로 채워져 있다.
온보딩 폼은 이 값이 프리필된 상태로 열리니 발표 중에는 그대로 넘기면 된다.

홈 맨 아래 **"데모 처음부터 다시하기"** 로 프로필·XP·퀴즈 완료 상태를 초기값으로 되돌린다.

## 스타일링

NativeWind 대신 `StyleSheet` + `design/tokens.ts` 를 쓴다. 화면 5개 규모에서
Tailwind 빌드 체인(babel/metro/tailwind.config)을 붙일 이유가 없다.
클래스명 기반 스타일링이 필요해지면 그때 도입한다.

화면에서 숫자를 직접 쓰지 않는다. 색·간격·radius·글자 크기·컨트롤 높이는 전부 토큰이다.
새 크기가 필요하면 화면에서 덮어쓰지 말고 `type` / `size` 스케일에 단계를 추가한다.

## 참고

Stitch는 화면 복제 대상이 아니라 스타일 레퍼런스다. (`reference/stitch/`)
