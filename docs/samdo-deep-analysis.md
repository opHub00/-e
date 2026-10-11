# 삼도이동 1지구 전용 심층 분석 계약

## source와 범위

- source: `(VER1.7_부동산원 제출용_공통) 삼도이동 1지구 토지임대부 분양주택 입주자모집공고문.hwp`
- SHA-256: `bd67d7ee6c9b9dbbe043f9c966679c791185ba0f21ae80050a33a489112e8763`
- 상태: `DRAFT_SOURCE_VERIFIED` (제공된 HWP 원문과 hash는 검증했지만 공식 게시본으로 승격하지 않음)
- 기준일: 2026-09-14
- 대상: 삼도이동 1지구 32세대(49㎡ 8, 59㎡ 24)
- 자동 추천: 청년·신혼부부·생애최초·신생아 특별공급, 일반공급
- 정보 제공만: 기관추천 특별공급

기존 `applicationAssessment`의 청년·신혼부부·생애최초 판정은 변경하지 않고 그대로 호출한다. 신생아·일반공급은 HWP의 문단 locator가 있는 전용 evaluator만 사용한다. 공고에 없는 경쟁률·당첨확률은 계산하지 않는다.

## 공급유형과 배정

| 공급유형 | 1지구 배정 | 판정 | 선정 구조 |
|---|---:|---|---|
| 청년 특별공급 | 5 | 기존 engine | 우선·일반, 공식 가점 |
| 신혼부부 특별공급 | 5 | 기존 engine | 우선·일반·추첨, 단계별 공식 가점 |
| 생애최초 특별공급 | 5 | 기존 engine | 우선·일반·추첨, 공식 점수 없음 |
| 신생아 특별공급 | 11 | 전용 evaluator | 70% 우선·20% 일반·잔여 추첨, 앞 두 단계 12점 가점 |
| 일반공급 | 3 | 전용 evaluator | 50% 신생아 우선·30% 1순위 우선·잔여 추첨 |
| 기관추천 특별공급 | 3 | 정보 제공만 | 관계기관 추천 대상자만 신청 |

일반공급은 공식 점수제가 아니다. 1순위 동일지역 경쟁 때 `무주택 3년 이상 + 저축총액`, 이후 `저축총액` 순차를 표시하되 `officialScore`는 `NOT_APPLICABLE`로 유지한다.

## 결과와 ranking

`buildSamdoRecommendation(rules, input)`은 여섯 공급유형 평가를 한 번에 반환한다.

- `recommendedType`: 완전히 `ELIGIBLE`인 자동추천 유형 중 1위. 없으면 `null`.
- `alternatives`: 다른 `ELIGIBLE` 및 `EVIDENCE_REQUIRED` 유형.
- `lowerPriorityTypes`: 입력이 부족한 `CONDITIONAL` 유형.
- `rejectedTypes`: 공고의 명시 조건을 위반한 `INELIGIBLE` 유형.
- `informationOnlyTypes`: 기관추천.

화면은 `toSamdoPresentationRecommendation(result)`를 사용한다. adaptive 질문용 내부 fact key는 제거되고 사용자 문구, 상태, 점수, 근거만 남는다.

정렬은 자격 상태 → 공급단계 → 공식 가점 → 충족한 가점상 우위 → 공급세대수 → 확인사항 수 → 고정 공급유형 순서다. 공급세대수는 동률 해소용 context이며 당첨 가능성으로 표현하지 않는다.

## adaptive 질문

`buildSamdoQuestionPlan(recommendation)`은 아직 탈락하지 않은 유형의 `missingFacts`만 모아 한 번씩 질문한다. 같은 날짜로 자녀 연령·신생아 여부·미성년 자녀 수·출산특례를 함께 계산하고, 같은 청약통장 답으로 여러 유형을 판정한다. 이미 `INELIGIBLE`인 유형의 질문은 제외한다.

일반 입력과 별도로 서류 확인이 필요한 항목은 `evidenceOnly`에 둔다.

- 세대 월평균소득·가구원수
- 세대 총자산과 청년 부모 자산
- 근로·사업소득 및 소득세 납부기간
- 특별공급·재당첨 제한 이력
- 혼인·출산·장기복무군인 특례
- 태아·입양·출산가구 소득·자산 완화

`잘 모르겠어요`는 값을 채우지 않고 `CONDITIONAL` 또는 `EVIDENCE_REQUIRED`를 유지해야 한다.

## evidence 안전장치

모든 전용 규칙은 HWP 문단 범위와 동일 SHA-256을 보존한다. 출산가구 완화, 출산특례, 혼인 전 이력 예외처럼 증빙이 필요한 경우 기본조건을 임의로 통과시키지 않고 `EVIDENCE_REQUIRED`로 내린다. 공식 게시본이 확보되기 전에는 source 상태를 승격하지 않는다.
