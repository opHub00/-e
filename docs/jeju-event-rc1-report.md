# 제주 행사 Demo Phase 3 · RC1 통합 보고서

## 통합 checkout

- 원본 UI checkout: `C:\완판e\staging-supabase-rule-review-e2e`
- 원본 UI branch/commit: `feature/jeju-event-kiosk` / `a5c0812`
- 통합 checkout: `C:\Users\user\Documents\Codex\2026-10-06\jeju-event-rc1`
- 통합 branch: `integration/jeju-event-rc1`
- production working tree, production DB, Supabase, production deployment 변경 없음

## 실제 dataset 연결

- source of truth: `data/events/jeju-event-2026-10-v1.json`
- artifact SHA-256: `701a9adbfaad236d182737c54e33fb58b0c9f171c316f5f6d9bb026b2df8b7a6`
- dataset fingerprint: `sha256:51aeeb22999594de30b2d032e2c885f3395cf18fb9dea2f43dacbb156fa0f5c8`
- source fingerprint: `sha256:b9393c78bc6d893c4ab8623f6421a9b8fcfb3e916ce592a1c083997d5bc6b4e9`
- runtime inventory: 공식 공고 5개, 공고/공급유형 9개
- runtime은 외부 listing API, PDF, production DB를 읽지 않음
- frozen dataset의 listing, Rule Package, evidence를 앱 bundle에서 검증한 뒤 일괄 평가

`KioskAnswers → UserProfile → assessFrozenDataset → EvaluationResult[9] → KioskOutcome[9]` adapter를 사용한다. 배우자는 별도 `SpouseProfile`로 만들고, 화면이 세대 합계로 받은 소득·자산은 배우자 개인값으로 분배하지 않고 `HouseholdProfile.declaredTotals`에 유지한다. 자녀 출생연도는 정확한 생일로 만들어 내지 않고 `UNKNOWN`으로 남긴다.

## 표시와 context

- `officialScore=NOT_APPLICABLE`: 숫자 0 대신 `공식 배점 · 해당 없음`
- `officialScore=PENDING`: 숫자 대신 `공식 배점 · 정보 확인 필요`
- 완판e 내부 score: 숫자를 숨기고 `적극 검토 / 검토 가능 / 조건 확인 필요 / 신청 어려움`
- 상세: 각 결과의 evidence id만 Rule Package evidence에 연결해 section/page/excerpt 표시
- 상담: 현재 `UserProfile`, 선택 `Listing`, 선택 `EvaluationResult`, 전체 privacy-reduced `AssessmentContext`를 함께 보유
- QR: URL에는 64자리 opaque token 하나만 포함. 개인정보를 제외한 `ResultSummary`만 RC 서버 메모리에 6시간 저장
- reset/refresh: Zustand 메모리의 입력, 결과, 관심 공고, 상담 context를 제거

## persona 브라우저 결과

아래 값은 현재 UI에서 실제로 입력 가능한 항목만 답한 결과다. 각 persona는 Landing → Intro → 정보 입력 → 분석 → 9개 카드 → 상세/evidence → 상담 → 관심 공고 → QR → 390×844 결과 페이지 → Reset을 Chromium에서 수행했다.

| Persona | Viewport | COMPLETE | NEEDS_USER_INPUT | INELIGIBLE | UNAVAILABLE | 분석/렌더 |
|---|---:|---:|---:|---:|---:|---:|
| 20대 미혼 청년 | 1440×900 | 0 | 5 | 4 | 0 | 1956ms |
| 예비신혼부부 | 768×1024 | 0 | 4 | 5 | 0 | 1924ms |
| 신혼부부 | 1024×768 | 0 | 4 | 5 | 0 | 1937ms |
| 신혼 + 자녀 1명 | 1440×900 | 0 | 5 | 4 | 0 | 1922ms |
| 생애최초 부부 | 768×1024 | 0 | 4 | 5 | 0 | 1935ms |
| 다자녀 가구 | 1024×768 | 0 | 5 | 4 | 0 | 1934ms |
| 일반 무주택 가구 | 1440×900 | 0 | 3 | 6 | 0 | 1926ms |
| 명확한 자격 미달 가구 | 768×1024 | 0 | 0 | 9 | 0 | 1932ms |

Phase 2의 완전한 domain persona는 기존과 동일하게 72개 결과를 만든다. 대표 분포는 청년 `2/0/7/0`, 다자녀 `3/0/6/0`, 명확한 미달 `0/0/9/0`이며 event integration test에서 재검증했다.

## 발견·수정한 mismatch

수정 완료:

- 2개 `DEMO_FIXTURE` + 삼도 package 연결을 frozen 5개/9개 dataset으로 교체
- 기존 applicationAssessment adapter를 Phase 2 UserProfile/batch engine adapter로 교체
- 공식 배점 미적용을 0점처럼 보일 수 있던 공백 표시를 명시적 `해당 없음`으로 교체
- 완판e score를 숫자 대신 정성 label로 교체
- URL fragment에 요약 전체를 넣던 QR을 opaque token session으로 교체
- 390px 결과 없음 화면의 14px 가로 overflow 수정(상단 액션을 56px 아이콘 버튼으로 축약)

미해결:

- domain test persona에는 공고별 증빙 사실이 채워져 있지만 기존 UI에는 `eligibleResident`, `currentProgramTenant`, 자동차가액, 복지/학생/취업준비/일반매입임대 우선자격 등 입력이 없다.
- 엔진은 누락값을 추측하지 않으므로, 명백한 자격 미달 persona를 제외한 7개 유효 persona가 UI에서 모두 `COMPLETE=0`이다.
- 자녀 입력은 연도뿐이라 정확한 미성년/7세 미만 경계 판정에 필요한 생년월일을 만들 수 없다.

## QA

- typecheck: PASS
- event integration: 10/10 PASS
- 기존 assessment regression: PASS (기존 174/174 baseline 유지)
- production fail-closed web export: PASS
- 8 persona full-flow browser QA: PASS
- 9 cards, 5 listings, source/evidence, chat context, favorite, QR, reset: PASS
- iPad portrait 768×1024: PASS (simulated Chromium viewport)
- iPad landscape 1024×768: PASS (simulated Chromium viewport)
- desktop 1440×900: PASS
- mobile QR 390×844: PASS
- horizontal overflow/touch target ≥44px: PASS
- back navigation 입력 유지: PASS
- refresh 개인정보 제거: PASS
- invalid/expired token: PASS
- empty result state: PASS
- idle reset: PASS (clock-advanced browser verification)
- reduced viewport에서 input/CTA 비중첩: PASS
- 실제 iPad OS 가상 키보드와 카메라 QR 스캔: 물리 기기 미검증

## Release 판단

**NO-GO**

데이터·engine·화면 연결과 전체 navigation은 RC1 수준으로 통합되었지만, 현재 UI가 approved Rule Package의 필수 사용자 사실을 수집하지 못해 행사에서 유효 방문자에게도 신청 가능 결과를 한 건도 보여 주지 못한다. 입력 schema/UI를 frozen Rule Package의 missing facts와 정렬하고 실제 iPad 키보드·카메라 검증을 통과하기 전에는 행사 release로 승격하지 않는다.
