# 삼도이동 행사 V2 — 1·2지구 데이터/판정 통합 노트

## 범위와 source of truth

- 기준 브랜치: `feature/samdo-dual-district-v2`
- 기준 RC: `samdo-demo-rc4` (`24894ed`)
- 1지구 원문 SHA-256: `5834b996f9d49ea7dc6e45fc36312b2fba1b4d5fa3b5d1bcd3a7d8e9189b90d2`
- 2지구 원문 SHA-256: `336c345354c6ab9085683ede9e8fde52f4be73969c5058c0a62602257289ab71`
- 두 HWP는 `HWP5_RECORDS`로 독립 추출했다. 한 지구의 누락값을 다른 지구 값으로 보완하지 않는다.
- 사용자가 제공한 최종1.8 파일이므로 `DRAFT_SOURCE_VERIFIED`를 유지한다. 공개 공식 URL 확인 전 `OFFICIAL_VERIFIED`로 올리지 않는다.

## UI가 가져갈 진입점

```ts
import { buildSamdoDualAssessment } from '@/features/eventKiosk/samdoDual/evaluate';
import { samdoInputFromAnswers } from '@/features/eventKiosk/samdoResult/samdoInput';

const dual = buildSamdoDualAssessment(samdoInputFromAnswers(kioskAnswers));
```

`dual.districts`는 항상 `[1지구, 2지구]` 순서다. 각 항목은 다음을 독립 보유한다.

- `district`: 관리번호, 위치, 공급량, 주택형, 층별 분양가격, 월 토지임대료, 전체 일정, 문서 해시/locator
- `recommendation`: 기존 Samdo recommendation과 동일한 semantics
- `checklist`: 공고 근거가 연결된 공식 준비 항목만 포함
- `specialProvisions`: evaluator가 `EVIDENCE_REQUIRED`로 남긴 특례만 포함

`dual.comparison.preferredDistrictId`는 “당첨 가능성이 더 높은 지구”가 아니다. 자격 → 공급단계 → 공식 점수 → 증빙 완결성 → 동일 공급유형 세대수 순으로 UI 정렬을 돕는 값이다. 분양가격·월 토지임대료는 `economicContext`에서 별도로 보여야 한다.

## 지구별 확정값

| 항목 | 1지구 | 2지구 |
|---|---:|---:|
| 관리번호 | 2026000434 | 2026000435 |
| 위치 | 제주시 삼도이동 1244-1 외 0필지 | 제주시 삼도이동 1246-1 외 4필지 |
| 총 공급 | 32 | 40 |
| 특별/일반 | 26 / 6 | 32 / 8 |
| 청년 | 5 | 6 |
| 신혼부부 | 5 | 6 |
| 신생아 | 11 | 14 |
| 생애최초 | 5 | 6 |
| 일반공급 | 6 | 8 |
| 49㎡ | 8 | 8 |
| 59㎡ | 24 | 32 |
| 당첨자 발표 | 2026-11-24 | 2026-11-25 |

공통 접수일은 특별공급 2026-11-16, 일반공급 1순위 2026-11-17, 일반공급 2순위 2026-11-18이다.

## 상담 연결

```ts
import { startSamdoDualChat, sendChat } from '@/features/eventKiosk/consult';

const chat = startSamdoDualChat(event, dual);
const next = await sendChat(event, chat, userQuestion);
```

- 브라우저는 구조화된 일정·가격·토지임대료·공급량과 판정 스냅샷만 전송한다.
- 브라우저가 RAG evidence를 작성할 수 없도록 요청의 `retrievedEvidence`는 빈 배열만 허용한다.
- 서버가 질문 intent/district를 분류하고 해시/locator가 고정된 `samdo-dual-v2-rag.json`에서 evidence를 다시 검색해 Gemini에 붙인다.
- Gemini가 없거나 timeout/rate-limit/5xx/unsafe output/anchor mismatch가 발생하면 같은 구조화 데이터 기반 deterministic 답변으로 fallback한다.
- 이름, 생년월일 원문, 정확한 소득·자산, 내부 fact key, QR token은 context에 포함하지 않는다.

## Claude UI 통합 시 지켜야 할 점

1. 기존 BrandMark, PartnerBadge, Product Story, theme/layout/mobile styles는 이 브랜치에서 변경하지 않았다.
2. `district.recommendation`을 UI에서 다시 정렬하거나 자격을 재계산하지 않는다.
3. `officialScore.status === 'NOT_APPLICABLE'`를 0점으로 표시하지 않는다.
4. 비교 우선 지구 문구에 “당첨 가능성이 높다”, “경쟁률이 유리하다”를 쓰지 않는다.
5. 가격은 층별 값이며 단일 대표가격으로 축약할 때는 반드시 범위임을 표시한다.
6. `checklist[].official === true`인 항목만 공고상 공식 준비항목으로 표현한다.
7. `specialProvisions`는 적용 확정이 아니라 증빙 확인이 필요한 항목이다.
8. QR에는 dual result의 presentation-safe 요약만 별도 계약으로 넣고 원본 profile이나 simulation state를 넣지 않는다.

## 생성/검증

`node scripts/build-samdo-dual-v2.mjs`는 로컬 HWP 추출 캐시를 입력으로 사용해 다음 checked-in 산출물을 재생성한다.

- `data/assessment-rules/samdo-2-2026-v1.8.json`
- `data/event/samdo-dual-v2-rag.json`

생성기는 1지구 evidence 문단을 2지구 원문의 동일 문장에 다시 매칭한다. 매칭되지 않는 문단이 있으면 실패하며 임의 locator를 만들지 않는다.
