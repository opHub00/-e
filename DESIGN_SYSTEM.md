# 완판e MVP Design System

## Design Intent
Stitch의 화면 구조를 그대로 복제하지 않는다. 아래 디자인 DNA만 재사용해 새로운 화면을 설계한다.

- Modern Flat
- Bento Card
- Friendly + Trustworthy
- 넓은 여백, 낮은 정보 밀도
- 큰 숫자 + 짧은 설명
- 친근한 캐릭터는 온보딩/성공/빈 상태에 제한적으로 사용
- 중요 정보 화면에서는 캐릭터보다 데이터 신뢰도를 우선

## Colors
| Token | Value | Use |
|---|---|---|
| primary | `#3B309E` | CTA, active state |
| primaryContainer | `#534AB7` | 강조 영역 |
| lavender | `#EEEDFE` | secondary tile |
| primaryFixed | `#E3DFFF` | soft highlight |
| background | `#FCF8FF` | app background |
| surface | `#FFFFFF` | card |
| surfaceContainer | `#F0ECF6` | nested area |
| text | `#1C1B22` | primary text |
| textMuted | `#474553` | secondary text |
| outline | `#C8C4D5` | border |
| success | `#2E7D55` | 완료/충족 |
| warning | `#C96A24` | 금액/주의 |
| error | `#BA1A1A` | 오류 |

## Typography
- Korean UI: Pretendard 우선
- Headline: Bold
- Body: Regular/Medium
- 기능 라벨은 한국어
- 해요체
- 긴 법률 문구 대신 요약 → 상세보기 구조

## Spacing
- Mobile side padding: 20
- Card gap: 16
- Vertical rhythm: 8 단위
- Section gap: 24~32

## Radius
- Card: 16
- Small card: 12
- Button: 10
- Chip: full pill

## Component Rules
### WanpanCard
- white 또는 soft lavender surface
- 12~16 radius
- heavy shadow 금지
- 1px soft border 또는 tonal layering

### PrimaryButton
- purple background
- white label
- 10 radius
- 최소 높이 52

### MetricCard
- 숫자가 첫 번째 시선
- 의미 설명은 한 줄
- 변화량은 별도 badge

### AI CTA
- “AI 상담”을 남발하지 않는다.
- 문맥형 문구 사용: “왜 달라졌나요?”, “나에게 무슨 의미예요?”

## Navigation
MVP 기준: 홈 / 배우기 / 찾기 / AI / MY
단, 첫 Vertical Slice에서는 홈·미래·배우기만 실제 동작해도 됨.
