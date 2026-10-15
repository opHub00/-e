# 삼도이동 1·2지구 비교 UI — Codex 연결 지점

UI 는 숫자를 직접 적지 않는다. 화면은 `buildDistrictComparison()` 의 출력만 그린다.

| 값 | 지금 원천 | Codex 연결 후 |
|---|---|---|
| 1지구 세대수·일정 | `SAMDO_DEEP_RULE_PACKAGE` (최종 1.8) | 그대로 또는 Codex 값으로 덮어씀 |
| 1지구 판정(추천 유형·자격·우선단계·공식 점수·공급세대) | `toSamdoPresentationRecommendation()` 결과 | 그대로 |
| 2지구 세대수 | `data/events/samdo-districts.brief.json` (행사 브리프) | Codex 2지구 패키지 inventory |
| 2지구 판정·일정, 1·2지구 분양가·월 토지임대료 | 없음 → 화면에 '공고 데이터 연결 전' | Codex presentation |

## 연결 방법

`districtSource.ts` 의 `codexDistrictPresentation()` 한 곳만 바꾼다. 지구마다 `CodexDistrictPresentation`(`districtContract.ts`)을 돌려주면 된다.

```ts
{ id: 'D2',
  inventory: { total, units49, units59 },
  costs: { salePrice49, salePrice59, monthlyLandRent49, monthlyLandRent59 },  // 원 단위 정수
  schedule: { special, generalFirst, generalSecond, winnerAnnouncement },        // 'YYYY-MM-DD'
  assessment: { status: 'READY', recommendedSupply, eligibility, priorityStage, officialScore, supplyCount } | { status: 'PENDING', reason },
  source: { status: 'OFFICIAL' | 'FINAL_USER_SOURCE', label } }
```

- 필드 단위로 덮어쓴다. `null`/`undefined` 필드는 기존 값을 지우지 않는다.
- 2지구 판정은 같은 입력(`KioskAnswers`)으로 Codex 엔진이 계산해 `assessment` 로 넘긴다. UI 는 라벨만 고른다.
- 레이아웃 점검: Demo Mode 빌드에서 `/event/samdo?persona=NEWLYWED_ONE_CHILD&layout=sample` — 예시 값이며 화면 상단에 경고가 뜬다.

## 화면

- `/event` landing: 1·2지구 소개 카드(총 세대·49/59㎡ 세대), CTA '내 신청유형 비교하기'
- `/event/samdo`: 내 신청 가능한 선택지(지구 카드 2) → 두 지구 비교 → 신청 일정 → 비용 비교 → 1지구 상세(휴대폰은 접힘)
- `/event/chat`: '삼도이동 1·2지구 공고 상담' 표시, 예시 질문 칩, 답변 출처 배지(응답 `mode` 사용)
- Product Story: 1·2지구 5장면(세대수·일정은 이 adapter 에서 읽음)
