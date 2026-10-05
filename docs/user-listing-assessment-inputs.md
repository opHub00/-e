# 공고별 사용자 답변 저장 계약

## 목적과 경계

`ApplicantProfileV3`는 여러 공고에서 재사용할 수 있는 원시 사용자 fact의 source of truth다. `user_listing_assessment_inputs`는 한 사용자·공고·공급유형에서만 의미가 있는 원시 답변을 보존한다. 점수, 단계, 판정, 계산된 기간과 boolean qualifier는 어느 입력 저장소에도 사용자 fact로 저장하지 않는다.

입력 우선순위는 다음과 같다.

1. `ApplicantProfileV3`의 `KNOWN` 장기 fact
2. 현재 RuleSet과 문서에 호환되는 서버 확정 공고별 답변
3. 아직 없는 항목에 대한 사용자 질문
4. 로컬 draft는 현재 작성 중인 값만 임시 보존하며 서버 확정 답변을 대체하지 않는다.

## Fact 분류

### A. ApplicantProfileV3 장기 fact

| 질문 | 장기 저장 근거 |
|---|---|
| 생년월일, 현재 거주지역, 거주 시작일, 해외체류 이력 | 공고와 무관한 관찰 사실이며 공고 기준일에 맞춰 엔진이 기간을 계산한다. |
| 혼인 상태·혼인일·최초 혼인일, 자녀 생년월일 | 개인·가족 이력이다. `childbirthClear`는 이 원시 fact와 공고 기준으로 계산한다. |
| 세대주·세대 구성, 본인/세대 주택 이력 | 사용자/세대의 지속 fact다. 공고별 무주택기간은 엔진이 산출한다. |
| 청약통장 보유·종류·가입일·인정 납입횟수/기준일·예치액·1순위 | 여러 공고에서 재사용하는 통장 원시 fact다. 가입개월은 저장하지 않고 기준일마다 계산한다. |
| 소득·자산 금액과 기준일, 근로 시작일, 소득세 납부연수 | 관찰시점을 가진 재사용 fact다. 소득구간/자산한도 충족 여부는 저장하지 않는다. |
| 특별공급·재당첨 제한 이력 | 사용자 이력이다. 개별 공고의 예외 적용 여부와 분리한다. |

현재 질문 ID 기준으로 `birthDate`, `currentResidence`, `overseas`, `residenceStartDate`, `marriageDate`, `everMarried`, `firstMarriageDate`, `children`, `isHouseholdHead`, `householdHomeOwnership`, `specialSupplyRestriction`, `housingDisposalDates`, `specialSupplyHistory`, `reWinningRestriction`, `hasAccount`, `subscriptionAccountOpenedAt`, `recognizedPaymentCount`, `recognizedDepositAmount`, `firstRank`, `monthlyIncome`, `householdIncome`, `dualIncome`, `workStartedAt`, `totalAssets`, `parentAssets`, `realEstateAssets`, `vehicleValue`가 이 범주다.

### B. Listing/announcement/supply 한정 fact

| 질문 | 저장 범위와 이유 |
|---|---|
| `familyCategory` | 신혼부부 공급에서 이번 공고에 신청하는 신청자 유형이다. 프로필 혼인 상태와 같지 않다. |
| `plannedMarriageWithinDeadline`, `singleParentQualified` | 이번 공고가 요구하는 입주기한/증빙 조건에 대한 확인이다. |
| `unmarriedChildInHousehold`, `incomeHouseholdSize` | 공고 기준일과 산정 정의가 적용된 가구 구성 확인값이다. 장기 세대원 수를 덮어쓰지 않는다. |
| `noHomeSince` | 현재 질문은 공고가 인정하는 무주택기간의 시작 확인이다. V3 주택 이력이 완전해지면 파생 가능하지만 그 전에는 공고 범위에 둔다. |
| `householdNoWinningFiveYears` | 특정 공고/공급유형의 최근 5년 요건 확인이다. |
| `accountKindEligible` | 통장 종류 자체가 아니라 이번 공고가 인정하는 통장인지에 대한 확인이다. |
| `youthPriorityTarget`, `newlywedPriorityTarget` | 이번 공고의 우선공급 문구에 대한 확인이다. |
| `exceptions` | 출산·혼인 등 이번 공고 특례 검토 필요 여부의 원시 사용자 답변이다. |

### C. 파생값 또는 결과: 입력 저장 금지

`age`, `accountMonths`, `residenceMonths`, `noHomeMonths`, `childbirthClear`, `exceptionsClear`, `stage`, `score`는 deterministic engine/parser 결과다. 특히 `childbirthClear`는 자녀 원시 fact와 공고별 특례 정의로 계산하고, `exceptionsClear`는 저장된 `exceptions` 답변에서 canonical parser가 생성한다. 클라이언트가 이 키들을 저장 RPC에 보내면 `LISTING_INPUT_INVALID_PAYLOAD`로 거절된다.

## Persistence schema

Migration `20261005090000_user_listing_assessment_inputs.sql`이 다음을 추가한다.

- 소유/범위: `user_id`, `listing_id`, `announcement_id`, `supply_type`
- payload: `schema_version=1`, 허용된 raw answer만 담는 `answers`
- 호환성 provenance: `rule_set_id`, `rule_set_version`, `source_document_id`, `source_document_hash`
- concurrency/lifecycle: `revision`, `stale_at`, `stale_reason`, DB `created_at`/`updated_at`
- 유일성: `(user_id, listing_id, supply_type)`

`save_user_listing_assessment_input`은 `auth.uid()`를 소유자로 고정하고 `expectedRevision`을 검사한다. 저장 성공 시 같은 범위의 기존 trusted result를 `LISTING_INPUT_CHANGED`로 stale 처리한다. `read_user_listing_assessment_input`은 현재 active/public/approved RuleSet과 문서 hash를 비교해 `CURRENT`, `STALE_RULE_SET`, `STALE_DOCUMENT`를 반환한다.

## RLS와 신뢰 경계

- anon: table/RPC 접근 불가
- authenticated: 자신의 row SELECT만 가능
- direct INSERT/UPDATE/DELETE: 불가
- 저장: owner-scoped RPC만 허용
- service role: trusted Edge orchestration에만 사용하며 client bundle에는 포함하지 않는다.

Trusted assessment와 Portfolio Edge Function은 같은 사용자·listing·supply에 대해 RuleSet id/version, source document id/hash가 모두 일치하고 stale이 아닌 답변만 canonical `parseForm()`으로 변환한다. 클라이언트가 전송한 임시 score/stage/derived details는 trusted result의 입력으로 채택하지 않는다.

## Questionnaire와 local draft

Questionnaire는 서버 snapshot을 먼저 불러오고 현재 미완료 draft를 그 위에 표시한다. 완료 시 장기 fact는 V3 repository에, 공고별 raw answer는 listing input RPC에 저장한 뒤 assessment를 요청한다. 로컬 draft key는 user + listing + supply뿐 아니라 RuleSet id/version과 document id를 포함한다. 로그아웃/계정 전환 격리는 기존 owner-scoped draft 정책을 유지한다.

서버 저장이 완료된 답변이 source of truth다. local draft는 저장 전 편집 복구에만 쓰며 RuleSet이 바뀌면 재사용하지 않는다.

## RuleSet/문서 변경 정책

- RuleSet id/version 불일치: `STALE_RULE_SET`
- source document id/hash 불일치: `STALE_DOCUMENT`
- stale 답변: 자동 적용하지 않으며 필요한 질문만 다시 요청
- 새 기준으로 사용자가 다시 확인해 저장하면 revision을 올리고 provenance를 새 기준으로 교체

field-level 의미 추론은 하지 않는다. 향후 질문별 semantic version이 생기기 전에는 RuleSet version이 달라진 모든 공고별 답변을 보수적으로 stale 처리한다.

## Phase 7 동일 fixture 재측정

Staging metadata는 read-only로 사용했고 실제 사용자 profile/result는 읽지 않았다. 총 15개 조합(운영 공고 2개, supply 후보 5개, 합성 profile 3개)을 측정했다.

| 시나리오 | 상태 분포 (완료/추가입력/미충족/분석불가) | missing fact | exceptionsClear | 확정 판정 | stale 답변 |
|---|---:|---:|---:|---:|---:|
| 첫 방문 | 0 / 14 / 1 / 0 | 113 | 14 | 1 | 0 |
| 재방문 | 1 / 3 / 5 / 6 | 72 | 0 | 6 | 0 |
| profile revision 변경 | 1 / 3 / 5 / 6 | 72 | 0 | 6 | 0 |
| RuleSet 변경 | 0 / 14 / 1 / 0 | 113 | 14 | 1 | 15 |

재방문에서 missing fact occurrence는 41개 줄었고, 질문 단위로는 39개 반복을 피했다. 분석불가 6건은 사용자 답변이 채워지면서 기존 공고측 검토 필요 항목이 드러난 결과다. 이를 사용자 입력 누락으로 숨기거나 자동 보정하지 않는다.

남은 주요 missing fact는 `accountMonths`, `childbirthClear`, `noReWinningRestriction`, `noSpecialRestriction`, `noSpecialSupplyHistory`, `overseasClear`, `recognizedPaymentCount`, 소득/주택/자산 관련 장기 fact다. 이들은 V3 onboarding 완성도 및 공고 rule 품질의 다음 과제이며 다른 공고의 답변으로 대체하지 않는다.

## Staging 적용과 rollback

Staging ref `krkeiytshxpqojrlrmsx`에만 migration과 두 Edge Function을 적용한다. 검증은 disposable Auth 사용자로 수행하고 종료 시 삭제한다. Production에는 적용하지 않는다.

Rollback이 필요하면 먼저 V3 listing-input feature 사용을 중지하고 이전 Edge Function 배포로 되돌린다. 이미 저장된 row와 result stale 이력은 삭제하지 않는다. DB 객체 제거가 필요할 때는 별도 correction migration을 작성하며 적용된 migration 파일을 수정하거나 destructive rollback하지 않는다.
