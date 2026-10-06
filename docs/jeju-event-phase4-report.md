# 제주 행사 Demo Phase 4 보고서

## 결론

**Phase 4 GO** — Rule Package와 평가 기준을 완화하지 않고 adaptive UI 입력 coverage를 확장했다. 7개 유효 persona가 모두 최소 1개 이상의 COMPLETE 결과를 만들고, 명확한 미달 persona는 COMPLETE 0 / INELIGIBLE 9를 유지한다.

- branch: `integration/jeju-event-phase4`
- base: RC1 `110f863`
- dataset: `wanpan-jeju-event-2026-10` / `2026.10.0-rc1`
- fingerprint: `sha256:51aeeb22999594de30b2d032e2c885f3395cf18fb9dea2f43dacbb156fa0f5c8`
- production DB, Supabase, production branch, deployment 변경 없음

## 기존 UI coverage

- Rule Package 참조 fact: 46개
- FULL: 16개
- PARTIAL: 7개
- NONE: 23개
- 엄격한 FULL 기준 coverage: **34.8%**

PARTIAL은 입력칸이 있어도 정확한 자녀 생년월일이 없거나, UI 답이 domain fact로 연결되지 않거나, Applicant와 Household 합계를 구분할 수 없는 경우다.

현재 9개 조합은 `spouse.*` fact를 직접 참조하지 않는다. 배우자는 별도 SpouseProfile로 유지되며 혼인·맞벌이·가구 합계처럼 Household scope로만 결합된다.

## 추가한 Core / Conditional facts

Core:

- 자녀 생년월일을 연도에서 YYYY-MM-DD로 확장하고 기존 `childBirthYears`를 유지
- 세대 차량 최고가액
- 기존 맞벌이 답을 `household.dualIncome`으로 연결
- Applicant 자산과 Household 합계를 분리

Conditional:

- 신청 가능 거주자 여부
- 동일 지자체 매입임대 계약·거주 여부
- 대학생·입학예정 여부
- 졸업·중퇴 후 2년 이내 취업준비 여부
- 복지급여/지원 자격
- 소득 있는 업무 종사기간
- 부모 월소득·부모 차량가액

Evidence-only는 질문으로 COMPLETE를 강제하지 않고 서류 확인 필요 상태를 유지한다.

## Adaptive question generation

1. 기본 questionnaire를 UserProfile로 변환
2. frozen dataset 9개 조합 1차 batch assessment
3. EvaluationResult의 원시 `unresolvedFacts` 집계
4. 이미 INELIGIBLE인 조합 제외
5. fact → 질문 dependency로 변환하고 질문 ID로 중복 제거
6. Core/Conditional 질문만 표시
7. Applicant/Household scope에 답을 merge하고 재평가
8. 새 분기에서 추가 fact가 드러나면 다음 adaptive round 수행
9. askable missing이 없거나 evidence-only만 남으면 결과 표시

사용자가 ‘잘 모르겠어요’를 선택하면 UNKNOWN을 유지하고 같은 값을 false/0으로 변환하지 않는다.

## Persona before / after

상태 표기 순서: COMPLETE / NEEDS_USER_INPUT / INELIGIBLE / UNAVAILABLE

| Persona | 질문 수 | 질문 ID | Before | After |
|---|---:|---|---:|---:|
| 20대 미혼 청년 | 8 | `vehicleValueKrw`, `collegeStudent`, `jobSeekerWithinTwoYears`, `benefitCategory`, `eligibleResident`, `currentProgramTenant`, `parentMonthlyIncomeKrw`, `parentVehicleValueKrw` | 0/5/4/0 | 3/0/6/0 |
| 30대 예비신혼부부 | 4 | `vehicleValueKrw`, `benefitCategory`, `eligibleResident`, `currentProgramTenant` | 0/4/5/0 | 3/0/6/0 |
| 30대 신혼부부 | 4 | `vehicleValueKrw`, `benefitCategory`, `eligibleResident`, `currentProgramTenant` | 0/4/5/0 | 3/0/6/0 |
| 신혼 + 자녀 1명 | 4 | `vehicleValueKrw`, `benefitCategory`, `eligibleResident`, `currentProgramTenant` | 0/4/5/0 | 3/0/6/0 |
| 생애최초 조건의 부부 | 4 | `vehicleValueKrw`, `benefitCategory`, `eligibleResident`, `currentProgramTenant` | 0/4/5/0 | 3/0/6/0 |
| 다자녀 가구 | 4 | `vehicleValueKrw`, `benefitCategory`, `eligibleResident`, `currentProgramTenant` | 0/5/4/0 | 4/0/5/0 |
| 일반 무주택 가구 | 3 | `benefitCategory`, `eligibleResident`, `currentProgramTenant` | 0/2/7/0 | 1/0/8/0 |
| 명확한 자격 미달 가구 | 0 | - | 0/0/9/0 | 0/0/9/0 |

## 남은 evidence-only facts

- `event.applicantDisabilityPoints`
- `event.generalRentalPriorityCategory`
- `score.applicantDisabled`
- `score.housingVulnerable`
- `score.parentNoHome`
- `score.supportsSeniorParent`
- `score.youthIncomeUnderHalf`

이 항목은 공식 가점·우선순위 서류에 해당한다. eligibility를 낙관적으로 통과시키거나 공식 점수를 0으로 만들지 않는다.

## Regression / browser

- typecheck: PASS
- event domain/integration: 18/18 PASS
- assessment regression: PASS
- core domain regression: PASS
- production fail-closed web export: PASS
- Chromium 8 persona adaptive full flow: PASS
- desktop 1440×900, iPad portrait 768×1024, iPad landscape 1024×768, mobile QR 390×844: PASS
- QR opaque token, reset, refresh privacy, invalid token, idle reset, reduced-height CTA, adaptive back-navigation 답변 유지: PASS
- browser result: PASS

## 전체 Rule fact inventory

`Kiosk/UI`는 RC1 이전 상태의 FULL/PARTIAL/NONE coverage다.

| Fact key | Type | Required | Listing/Supply | Kiosk/UI | Scope | Class | 사용자 질문 |
|---|---|---|---|---|---|---|---|
| `applicant.age` | NUMBER | REQUIRED | jpdc-23972-youth-purchased-rental:YOUTH<br>jpdc-24135-general-purchased-rental:GENERAL<br>lh-jeju-ildo-samdo-happy-housing-2026:SENIOR<br>lh-jeju-ildo-samdo-happy-housing-2026:YOUTH | FULL/FULL | APPLICANT | CORE | 신청자의 정확한 생년월일은 언제인가요? |
| `applicant.currentHomeCount` | NUMBER | REQUIRED | jpdc-23972-youth-purchased-rental:YOUTH<br>lh-jeju-ildo-samdo-happy-housing-2026:COLLEGE_STUDENT<br>lh-jeju-ildo-samdo-happy-housing-2026:YOUTH | FULL/FULL | APPLICANT | CORE | 신청자 본인이 현재 보유한 주택이 있나요? |
| `applicant.isJejuResident` | BOOLEAN | REQUIRED | jpdc-24134-multichild-purchased-rental:MULTI_CHILD<br>jpdc-24135-general-purchased-rental:GENERAL<br>lh-jeju-ildo-samdo-happy-housing-2026:COLLEGE_STUDENT<br>lh-jeju-ildo-samdo-happy-housing-2026:NEWLYWED_SINGLE_PARENT<br>lh-jeju-ildo-samdo-happy-housing-2026:YOUTH | FULL/FULL | APPLICANT | CORE | 현재 제주특별자치도에 거주하고 있나요? |
| `applicant.maritalStatus` | ENUM | REQUIRED | jpdc-23972-youth-purchased-rental:YOUTH<br>lh-jeju-ildo-samdo-happy-housing-2026:COLLEGE_STUDENT<br>lh-jeju-ildo-samdo-happy-housing-2026:YOUTH | FULL/FULL | APPLICANT | CORE | 현재 혼인 상태는 어떻게 되나요? |
| `applicant.monthlyIncomeKrw` | NUMBER | CONDITIONAL | jpdc-23972-youth-purchased-rental:YOUTH | FULL/FULL | APPLICANT | CORE | 신청자 본인의 월평균 소득은 얼마인가요? |
| `applicant.recognizedPaymentCount` | NUMBER | CONDITIONAL | jpdc-23972-youth-purchased-rental:YOUTH<br>jpdc-23973-newlywed-newborn-i:NEWLYWED_NEWBORN_I<br>jpdc-24134-multichild-purchased-rental:MULTI_CHILD<br>jpdc-24135-general-purchased-rental:GENERAL | FULL/FULL | APPLICANT | CORE | 청약통장 인정 납입 횟수는 몇 회인가요? |
| `applicant.residenceMonths` | NUMBER | CONDITIONAL | jpdc-23973-newlywed-newborn-i:NEWLYWED_NEWBORN_I<br>jpdc-24134-multichild-purchased-rental:MULTI_CHILD<br>jpdc-24135-general-purchased-rental:GENERAL | FULL/FULL | APPLICANT | CORE | 제주에 계속 거주한 기간은 몇 개월인가요? |
| `applicant.totalAssetsKrw` | NUMBER | REQUIRED | jpdc-23972-youth-purchased-rental:YOUTH<br>lh-jeju-ildo-samdo-happy-housing-2026:COLLEGE_STUDENT | PARTIAL/PARTIAL | APPLICANT | CORE | 신청자 본인의 총자산은 얼마인가요? |
| `event.applicantDisabilityPoints` | NUMBER | CONDITIONAL | jpdc-23972-youth-purchased-rental:YOUTH | NONE/NONE | APPLICANT | EVIDENCE_ONLY | 공고 기준 장애인 가점은 몇 점인가요? |
| `event.applicantParentMaxVehicleValueKrw` | NUMBER | CONDITIONAL | jpdc-23972-youth-purchased-rental:YOUTH | NONE/NONE | HOUSEHOLD | CONDITIONAL | 본인과 부모님의 차량 중 가장 높은 차량가액은 얼마인가요? |
| `event.applicantParentMonthlyIncomeKrw` | NUMBER | CONDITIONAL | jpdc-23972-youth-purchased-rental:YOUTH | NONE/NONE | HOUSEHOLD | CONDITIONAL | 본인과 부모님의 월평균 소득 합계는 얼마인가요? |
| `event.applicantParentTotalAssetsKrw` | NUMBER | CONDITIONAL | jpdc-23972-youth-purchased-rental:YOUTH | PARTIAL/PARTIAL | HOUSEHOLD | CONDITIONAL | 본인과 부모님의 총자산 합계는 얼마인가요? |
| `event.benefitCategory` | ENUM | REQUIRED | jpdc-23972-youth-purchased-rental:YOUTH<br>jpdc-23973-newlywed-newborn-i:NEWLYWED_NEWBORN_I<br>jpdc-24134-multichild-purchased-rental:MULTI_CHILD | NONE/NONE | HOUSEHOLD | CONDITIONAL | 현재 해당하는 복지급여 또는 지원 자격이 있나요? |
| `event.collegeStudent` | BOOLEAN | REQUIRED | jpdc-23972-youth-purchased-rental:YOUTH<br>lh-jeju-ildo-samdo-happy-housing-2026:COLLEGE_STUDENT | NONE/NONE | APPLICANT | CONDITIONAL | 현재 대학생이거나 입학·복학 예정인가요? |
| `event.currentProgramTenant` | BOOLEAN | REQUIRED | jpdc-23972-youth-purchased-rental:YOUTH<br>jpdc-24135-general-purchased-rental:GENERAL | NONE/NONE | APPLICANT | CONDITIONAL | 현재 동일 지자체 청년매입임대에 계약·거주 중인가요? |
| `event.eligibleResident` | BOOLEAN | REQUIRED | jpdc-23972-youth-purchased-rental:YOUTH<br>jpdc-23973-newlywed-newborn-i:NEWLYWED_NEWBORN_I<br>jpdc-24134-multichild-purchased-rental:MULTI_CHILD<br>jpdc-24135-general-purchased-rental:GENERAL | NONE/NONE | APPLICANT | CONDITIONAL | 국적 또는 외국인등록 기준상 신청 가능한 거주자인가요? |
| `event.generalRentalPriorityCategory` | ENUM | CONDITIONAL | jpdc-24135-general-purchased-rental:GENERAL | NONE/NONE | APPLICANT | EVIDENCE_ONLY | 일반 매입임대의 공식 우선순위 증빙이 있나요? |
| `event.isHousingBenefitRecipient` | BOOLEAN | REQUIRED | lh-jeju-ildo-samdo-happy-housing-2026:HOUSING_BENEFIT | NONE/NONE | HOUSEHOLD | CONDITIONAL | 현재 주거급여 수급자인가요? |
| `event.jobSeekerWithinTwoYears` | BOOLEAN | REQUIRED | jpdc-23972-youth-purchased-rental:YOUTH<br>lh-jeju-ildo-samdo-happy-housing-2026:COLLEGE_STUDENT | NONE/NONE | APPLICANT | CONDITIONAL | 졸업·중퇴 후 2년 이내의 취업준비생인가요? |
| `event.lhCollegeIncomeEligible` | BOOLEAN | REQUIRED | lh-jeju-ildo-samdo-happy-housing-2026:COLLEGE_STUDENT | NONE/NONE | APPLICANT | EVIDENCE_ONLY | 본인·부모 합산 소득이 공고 기준 이하임을 확인했나요? |
| `event.marriageBeforeMoveIn` | BOOLEAN | REQUIRED | jpdc-23973-newlywed-newborn-i:NEWLYWED_NEWBORN_I<br>lh-jeju-ildo-samdo-happy-housing-2026:NEWLYWED_SINGLE_PARENT | FULL/FULL | HOUSEHOLD | CONDITIONAL | 입주 전까지 혼인 사실을 증명할 수 있나요? |
| `event.rentBurdenPercent` | NUMBER | CONDITIONAL | jpdc-24135-general-purchased-rental:GENERAL | NONE/NONE | APPLICANT | EVIDENCE_ONLY | 월 소득 대비 임차료 부담률은 몇 퍼센트인가요? |
| `event.supportedSingleParent` | BOOLEAN | REQUIRED | jpdc-23973-newlywed-newborn-i:NEWLYWED_NEWBORN_I | FULL/FULL | HOUSEHOLD | CONDITIONAL | 한부모가족 증명서를 발급받을 수 있나요? |
| `event.workHistoryMonths` | NUMBER | REQUIRED | lh-jeju-ildo-samdo-happy-housing-2026:YOUTH | NONE/NONE | APPLICANT | CONDITIONAL | 소득이 있는 업무에 종사한 기간은 몇 개월인가요? |
| `family.marriageMonths` | NUMBER | REQUIRED | jpdc-23973-newlywed-newborn-i:NEWLYWED_NEWBORN_I<br>lh-jeju-ildo-samdo-happy-housing-2026:NEWLYWED_SINGLE_PARENT | FULL/FULL | HOUSEHOLD | CORE | 혼인신고일은 언제인가요? |
| `household.allNoHome` | BOOLEAN | REQUIRED | jpdc-23973-newlywed-newborn-i:NEWLYWED_NEWBORN_I<br>jpdc-24134-multichild-purchased-rental:MULTI_CHILD<br>jpdc-24135-general-purchased-rental:GENERAL<br>lh-jeju-ildo-samdo-happy-housing-2026:HOUSING_BENEFIT<br>lh-jeju-ildo-samdo-happy-housing-2026:NEWLYWED_SINGLE_PARENT<br>lh-jeju-ildo-samdo-happy-housing-2026:SENIOR | FULL/FULL | HOUSEHOLD | CORE | 본인과 세대원 모두 현재 무주택인가요? |
| `household.childUnder7Count` | NUMBER | REQUIRED | jpdc-23973-newlywed-newborn-i:NEWLYWED_NEWBORN_I<br>lh-jeju-ildo-samdo-happy-housing-2026:NEWLYWED_SINGLE_PARENT | PARTIAL/PARTIAL | HOUSEHOLD | CORE | 자녀의 정확한 생년월일은 언제인가요? |
| `household.dependentCount` | NUMBER | CONDITIONAL | jpdc-24135-general-purchased-rental:GENERAL | FULL/FULL | HOUSEHOLD | CORE | 신청자를 제외한 부양가족은 몇 명인가요? |
| `household.dualIncome` | BOOLEAN | REQUIRED | jpdc-23973-newlywed-newborn-i:NEWLYWED_NEWBORN_I<br>lh-jeju-ildo-samdo-happy-housing-2026:NEWLYWED_SINGLE_PARENT | PARTIAL/PARTIAL | HOUSEHOLD | CORE | 신청자와 배우자 모두 소득이 있나요? |
| `household.maxVehicleValueKrw` | NUMBER | REQUIRED | jpdc-23972-youth-purchased-rental:YOUTH<br>jpdc-23973-newlywed-newborn-i:NEWLYWED_NEWBORN_I<br>jpdc-24134-multichild-purchased-rental:MULTI_CHILD<br>lh-jeju-ildo-samdo-happy-housing-2026:COLLEGE_STUDENT<br>lh-jeju-ildo-samdo-happy-housing-2026:NEWLYWED_SINGLE_PARENT<br>lh-jeju-ildo-samdo-happy-housing-2026:SENIOR<br>lh-jeju-ildo-samdo-happy-housing-2026:YOUTH | NONE/NONE | HOUSEHOLD | CORE | 세대가 보유한 차량 중 가장 높은 차량가액은 얼마인가요? |
| `household.memberCount` | NUMBER | REQUIRED | jpdc-23973-newlywed-newborn-i:NEWLYWED_NEWBORN_I<br>jpdc-24134-multichild-purchased-rental:MULTI_CHILD<br>lh-jeju-ildo-samdo-happy-housing-2026:NEWLYWED_SINGLE_PARENT<br>lh-jeju-ildo-samdo-happy-housing-2026:SENIOR<br>lh-jeju-ildo-samdo-happy-housing-2026:YOUTH | FULL/FULL | HOUSEHOLD | CORE | 신청자를 포함한 세대원은 몇 명인가요? |
| `household.minorChildCount` | NUMBER | REQUIRED | jpdc-23973-newlywed-newborn-i:NEWLYWED_NEWBORN_I<br>jpdc-24134-multichild-purchased-rental:MULTI_CHILD<br>jpdc-24135-general-purchased-rental:GENERAL | PARTIAL/PARTIAL | HOUSEHOLD | CORE | 자녀의 정확한 생년월일은 언제인가요? |
| `household.monthlyIncomeKrw` | NUMBER | REQUIRED | jpdc-23973-newlywed-newborn-i:NEWLYWED_NEWBORN_I<br>jpdc-24134-multichild-purchased-rental:MULTI_CHILD<br>lh-jeju-ildo-samdo-happy-housing-2026:NEWLYWED_SINGLE_PARENT<br>lh-jeju-ildo-samdo-happy-housing-2026:SENIOR<br>lh-jeju-ildo-samdo-happy-housing-2026:YOUTH | FULL/FULL | HOUSEHOLD | CORE | 세대 전체 월평균 소득은 얼마인가요? |
| `household.newbornCountWithinTwoYears` | NUMBER | REQUIRED | jpdc-23973-newlywed-newborn-i:NEWLYWED_NEWBORN_I<br>jpdc-24134-multichild-purchased-rental:MULTI_CHILD | PARTIAL/PARTIAL | HOUSEHOLD | CORE | 자녀의 정확한 생년월일은 언제인가요? |
| `household.post20230328ChildCount` | NUMBER | REQUIRED | jpdc-23973-newlywed-newborn-i:NEWLYWED_NEWBORN_I<br>jpdc-24134-multichild-purchased-rental:MULTI_CHILD<br>lh-jeju-ildo-samdo-happy-housing-2026:NEWLYWED_SINGLE_PARENT<br>lh-jeju-ildo-samdo-happy-housing-2026:SENIOR<br>lh-jeju-ildo-samdo-happy-housing-2026:YOUTH | PARTIAL/PARTIAL | HOUSEHOLD | CORE | 자녀의 정확한 생년월일은 언제인가요? |
| `household.totalAssetsKrw` | NUMBER | REQUIRED | jpdc-23973-newlywed-newborn-i:NEWLYWED_NEWBORN_I<br>jpdc-24134-multichild-purchased-rental:MULTI_CHILD<br>lh-jeju-ildo-samdo-happy-housing-2026:NEWLYWED_SINGLE_PARENT<br>lh-jeju-ildo-samdo-happy-housing-2026:SENIOR<br>lh-jeju-ildo-samdo-happy-housing-2026:YOUTH | FULL/FULL | HOUSEHOLD | CORE | 세대 전체 총자산은 얼마인가요? |
| `profile.composition` | ENUM | REQUIRED | jpdc-23973-newlywed-newborn-i:NEWLYWED_NEWBORN_I<br>lh-jeju-ildo-samdo-happy-housing-2026:NEWLYWED_SINGLE_PARENT | FULL/FULL | HOUSEHOLD | CORE | 가구 형태는 어떻게 되나요? |
| `score.applicantDisabled` | NUMBER | CONDITIONAL | jpdc-23973-newlywed-newborn-i:NEWLYWED_NEWBORN_I | NONE/NONE | HOUSEHOLD | EVIDENCE_ONLY | 신청자 본인이 등록장애인인가요? |
| `score.benefit.jpdcMultiChild` | NUMBER | CONDITIONAL | jpdc-24134-multichild-purchased-rental:MULTI_CHILD | NONE/NONE | HOUSEHOLD | CONDITIONAL | 현재 해당하는 복지급여 또는 지원 자격이 있나요? |
| `score.benefit.jpdcNewlywed` | NUMBER | CONDITIONAL | jpdc-23973-newlywed-newborn-i:NEWLYWED_NEWBORN_I | NONE/NONE | HOUSEHOLD | CONDITIONAL | 현재 해당하는 복지급여 또는 지원 자격이 있나요? |
| `score.benefit.jpdcYouth` | NUMBER | CONDITIONAL | jpdc-23972-youth-purchased-rental:YOUTH | NONE/NONE | HOUSEHOLD | CONDITIONAL | 현재 해당하는 복지급여 또는 지원 자격이 있나요? |
| `score.housingVulnerable` | NUMBER | CONDITIONAL | jpdc-24134-multichild-purchased-rental:MULTI_CHILD<br>jpdc-24135-general-purchased-rental:GENERAL | NONE/NONE | HOUSEHOLD | EVIDENCE_ONLY | 주거취약계층 증빙을 받을 수 있나요? |
| `score.parentNoHome` | NUMBER | CONDITIONAL | jpdc-23972-youth-purchased-rental:YOUTH | NONE/NONE | HOUSEHOLD | EVIDENCE_ONLY | 부모님이 모두 무주택인가요? |
| `score.severeDisability` | NUMBER | CONDITIONAL | jpdc-24135-general-purchased-rental:GENERAL | NONE/NONE | HOUSEHOLD | EVIDENCE_ONLY | 세대에 중증장애인이 있나요? |
| `score.supportsSeniorParent` | NUMBER | CONDITIONAL | jpdc-23973-newlywed-newborn-i:NEWLYWED_NEWBORN_I<br>jpdc-24135-general-purchased-rental:GENERAL | NONE/NONE | HOUSEHOLD | EVIDENCE_ONLY | 만 65세 이상 직계존속을 부양하고 있나요? |
| `score.youthIncomeUnderHalf` | NUMBER | CONDITIONAL | jpdc-23972-youth-purchased-rental:YOUTH | NONE/NONE | HOUSEHOLD | EVIDENCE_ONLY | 청년 소득이 공고 기준의 50% 이하인가요? |
