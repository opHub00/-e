# 완판e Design System

이 문서는 `design/tokens.ts` 와 실제 화면 구현을 설명한다.
값이 어긋나면 토큰과 코드가 정본이고, 이 문서를 고친다.

## Design Intent

Stitch 의 화면 구조를 복제하지 않는다. 아래 디자인 DNA만 재사용한다.

- Modern Flat
- Friendly + Trustworthy
- 넓은 여백, 낮은 정보 밀도
- 큰 숫자 + 짧은 설명
- 중요 정보 화면에서는 장식보다 데이터 신뢰도를 우선

`reference/` 의 Monzo / Airbnb / Duolingo / Toss 문서는 **참고 자료이지
화면별 디자인 시스템이 아니다.** 특정 화면을 특정 타사 제품처럼 만들지 않는다.
기준은 이 문서와 `design/tokens.ts` 하나다.

### 우선순위

정보 이해 → 다음 행동의 명확성 → 신뢰감 → 화면 간 일관성 → 브랜드 개성 → 장식

## Colors

| Token | Value | Use |
|---|---|---|
| primary | `#3B309E` | CTA, active state |
| primaryContainer | `#534AB7` | 브랜드 gradient 의 밝은 쪽 |
| primaryFixed | `#E3DFFF` | 라벤더 카드의 테두리 |
| lavender | `#EEEDFE` | secondary surface |
| background | `#FCF8FF` | app background |
| surface | `#FFFFFF` | card |
| surfaceLow | `#F6F2FC` | 카드 안의 tonal group |
| surfaceContainer | `#F0ECF6` | 아이콘 버튼 배경 |
| surfaceHigh | `#EBE6F0` | **카드 테두리**, tonal group 안의 divider |
| text | `#1C1B22` | primary text |
| textMuted | `#474553` | secondary text |
| textSubtle | `#7A7786` | caption, 단위, 보조 라벨 |
| outline | `#C8C4D5` | **컨트롤 외곽선.** 입력창·외곽선 버튼·chevron |
| hairline | `#F1EDF6` | 흰 배경 위 divider |
| success / warning / error | `#2E7D55` / `#C96A24` / `#BA1A1A` | 상태 |

### 테두리 규칙

- **카드 테두리는 `surfaceHigh`** 다. 라벤더 카드만 `primaryFixed`.
- **`outline` 은 카드에 쓰지 않는다.** 입력창·외곽선 버튼처럼 눌리는 컨트롤용이다.
  카드에 쓰면 화면에서 혼자 진하게 뜬다.
- 카드 안에서 행을 나눌 때: 흰 배경 위는 `hairline`,
  tonal group(`surfaceLow`) 위는 `surfaceHigh`.

### 강조 색

한 화면에서 보라색 강조는 **핵심 행동 또는 핵심 정보 하나**에 집중한다.
모든 카드와 모든 라벨을 보라색으로 칠하지 않는다.

## Typography

- Korean UI: Pretendard
- 스케일은 `type` 토큰만 쓴다. 화면에서 `fontSize` 를 덮어쓰지 않는다.
  필요한 크기가 없으면 스케일에 단계를 추가한다.
- 해요체. 긴 법률 문구 대신 요약 → 상세보기.

### 장식성 영어 라벨 금지

완판e는 한국어 서비스다. 정보를 더하지 않는 영어 eyebrow 를 만들지 않는다.

```
PROFILE COMPLETENESS   →  (삭제) 아래 "프로필 완성도"가 이미 같은 말이다
PERSONAL TAKEAWAY      →  (삭제)
START HERE / LEARN     →  (삭제)
OFFICIAL DATA · 참고 정보 →  공식 자료 · 참고 정보
```

의미가 반드시 필요하면 자연스러운 한국어로 쓴다.

### tracking

글자 크기 구간별 광학 보정값이다. 화면에서 임의의 `letterSpacing` 을 만들지 않는다.

| Token | Value | 구간 |
|---|---|---|
| display | -2 | 40px 이상 숫자 |
| headline | -0.9 | 24~32px |
| tight | -0.5 | 17~22px |
| snug | -0.3 | 14~16px 행 제목 |
| normal | -0.2 | 본문 |
| wide | 0.5 | 11px 축약 라벨 (`type.micro` 에 포함) |

### 숫자

`numeric`(`tabular-nums`)은 **카운트업 숫자와 세로로 줄 맞춤이 필요한 표**에만 쓴다.
모든 숫자에 붙이지 않는다.

## Spacing

- Mobile side padding: `spacing.screen` (20)
- 카드 내부 padding: `spacing.md` (16). 중첩 카드는 12.
- Vertical rhythm: 8 단위
- 진행바·점의 radius 는 높이의 절반이라 토큰화하지 않는다.

## Radius

| Token | Value | Use |
|---|---|---|
| button | 10 | 버튼, 세그먼트 |
| cardSm | 12 | 중첩 카드, tonal group |
| card | 16 | 기본 카드 |
| bento | 24 | **화면당 강조 카드 1개** |
| pill | 999 | chip, 원형 아이콘 버튼 |

`bento` 는 화면에서 가장 중요한 카드에만 쓴다. 여러 카드에 돌려 쓰면 위계가 사라진다.

## Elevation

깊이는 그림자가 아니라 **1px 테두리와 tonal layer** 로 만든다.

- **테두리가 있는 카드에 shadow 를 겹치지 않는다.**
- `shadow.card` 는 테두리 없는 표면에만.
- `shadow.floating` 은 실제로 떠 있는 것(탭바, 바텀시트, 입력 바, 지도 위 오버레이)에만.
- 카드 안의 그룹은 카드를 한 겹 더 얹지 말고 `surfaceLow` tonal layer 로 내린다.

## Gradient / Glow

브랜드 보라 gradient 는 유지한다. 다만 **역할이 분명한 곳에만** 쓴다.

허용:
- 홈 / 준비 탭 상단 브랜드 밴드
- 온보딩 브랜드 밴드
- `GradientHero` (퀴즈 결과)
- `BrandMark` 로고

금지:
- 일반 카드, 목록 행, 버튼에 gradient 추가
- 새 glow 추가
- 한 밴드에 glow blob 2개 이상

glow 는 밴드당 1개, `overlay.glow` 토큰을 쓴다. 하드코딩 rgba 를 만들지 않는다.

## Components

### WanpanCard
기본 카드 표면. 레이아웃 없이 표면만 필요할 때 쓴다.
레이아웃(flexDirection/gap/minHeight)을 함께 들고 있는 카드는
화면에서 토큰으로 직접 구성한다. 위 테두리/radius/elevation 규칙을 따르면 된다.

### PrimaryButton
`radius.button`, 최소 높이 `size.control`, primary 배경 + 흰 라벨.
모든 버튼을 filled 로 만들지 않는다. Primary / Secondary(lavender) / Text action 위계를 지킨다.

### BackButton
모든 화면이 공유한다. `arrow-back` 아이콘, `size.iconButton`(36) 원형,
`surfaceContainer` 배경. 터치 영역은 hitSlop 으로 `size.touch`(44)를 확보한다.

### ScreenHeader
내부 화면의 상단 바. `BackButton` + 가운데 제목.
브랜드를 노출하는 탭 화면은 각자 밴드 안에서 브랜드 행을 그린다.

### StatusPill / IconChip
상태 표시와 아이콘 칩. `tint` 배색만 쓴다.

### AI CTA
"AI 상담"을 남발하지 않는다. 문맥형 문구를 쓴다.
예: "왜 달라졌나요?", "나에게 무슨 의미예요?"

## Navigation

실제 탭 구성이다.

| 홈 | 청약찾기 | 준비 | AI | 전체 |
|---|---|---|---|---|
| `home` | `discovery` | `preparation` | `ai` | `more` |

## Copy

- 사용자에게 내부 구현 용어를 노출하지 않는다.
  `Mock`, `V1`, `DEMO`, `서버 기능` 같은 말은 화면에 쓰지 않는다.
- 같은 뜻의 안내를 한 화면에서 반복하지 않는다.
  법적·안전 고지는 화면당 한 곳으로 모은다.
- 실제로 의미가 다른 고지(공식 출처 / 데이터 일부 제공 / 계산값 여부 /
  자격 판정 아님)는 합치지 않는다. 중복만 제거한다.
