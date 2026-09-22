# 공고 입력 계약 (두 번째 공고부터 같은 파이프라인)

이 문서는 새 청약 공고 하나를 판정·상담에 쓰기까지 파이프라인이 **무엇을 입력으로 받고**, 각 단계가
**자동 / 결정적(deterministic) / 검토자 확인 필요** 중 무엇인지 정한다. 삼도이동 1지구(VER1.7)는 이
계약을 따르는 첫 번째 공고이며, 코드에는 어떤 공고도 박혀 있지 않다
(`npm run test:hardcode-guard`가 이를 막는다).

## 1. 입력물

| 입력 | 형태 | 위치 | 비고 |
|---|---|---|---|
| 원본 문서 | HWP/PDF 원문 파일 | Storage `YYYY/<announcementId>/<documentId>/<file>` | `assessment-rules upload`가 경로·해시를 검증 |
| 문서 해시 | SHA-256 hex 64자 | `package.document.sha256` | 모든 annotation·seed는 이 해시에 고정됨 |
| 공고 정체성 | `announcement.id`(uuid), `source`, `externalId`, `housingManagementNumber`, `title`, `publisher`, `announcementDate`, `sourceUrl` | import package | 관리번호가 불확실하면 `null` + review annotation의 unresolved 항목 |
| 지역 | `announcement.regionName`, `regionCode` + 규칙 `residence eq <공식 지역명>` | import package | 공식 지역명은 `features/discovery/regions.ts` 레지스트리의 이름만 사용 (예: `서울특별시`, `경기도`, `제주특별자치도`) |
| 공급유형 | `youth` / `newlywed` / `firstHome` | `rules[].supplyType` | 판정 엔진이 아는 공급유형만 |
| 규칙 사실 | `rules[]`: `ruleKey`, `supplyType`, `stage`, `category`(ELIGIBILITY/STAGE/SCORE), `config.expression` | import package | `ruleKey = <supplyType>.<concept>[.<detail>]`, concept은 `REVIEW_CATEGORY_BY_CONCEPT` 어휘 안에서만. 모르는 concept은 seed 생성이 멈춤 |
| 근거 span | `rules[].evidence`: `section`, `tableLabel`, `pageNumber`, `textExcerpt`, `locator` | import package | 규칙 하나당 근거 하나 이상. 근거 없는 critical 규칙은 승인 불가 |
| 공고별 수치 | 자산·소득 한도, 기준일, 점수표 | `ruleSet.config` / `config.expression`의 값·parameter | 추출기 안전 검사에 쓸 공고별 literal은 `AnnouncementLiteralExpectations`로 호출자가 넘김 |
| 예외 관계 | 거주 ↔ 해외체류 (법정, 자동) + 공고별 추가 | 자동은 builder, 추가는 annotation `exceptions` | 예외 쪽 규칙이 EXCEPTION concept이 아니면 거부 |
| 충돌 | 같은 개념의 서로 다른 읽기 (예: 지역우선 기준일) | annotation `conflicts` | 후보 2개 이상, 근거는 규칙 키로 참조 |
| 검토 annotation | `<package>.review-annotations.json` | `data/assessment-rules/` | 스키마: `features/assessmentRuleReview/seed/annotations.ts`. 공고 id·문서 해시·버전이 package와 다르면 거부 |
| listing binding | `announcement_listing_bindings(listing_id, announcement_id, bound_rule_set_id, revision)` | DB | import API로는 쓸 수 없음. admin 전용 RPC로만 변경 (아래 5번) |

## 2. 단계별 성격

| 단계 | 명령/모듈 | 성격 |
|---|---|---|
| 1. 문서 수집·파싱 | `ingest-announcements`, `parse-announcement` | 자동 |
| 2. 규칙 패키지 작성 | 사람 전사 → `assessment-rules validate PACKAGE.json` | **검토자 확인 필요** (전사). 검증 자체는 결정적 |
| 3. 원문 업로드 | `assessment-rules upload PACKAGE.json --document ORIGINAL` | 결정적 (해시·경로 불일치 시 실패) |
| 4. import | `assessment-rules import PACKAGE.json` | 결정적. 승인·공개·binding은 이 API로 바꿀 수 없음 |
| 5. review seed 생성 | `buildAssessmentReviewSeed(package, annotation)` / `seed:staging:rule-review --package … --annotations …` | 결정적. 같은 입력이면 같은 seed. 모든 candidate는 PENDING으로 시작 |
| 6. 규칙 검토 | 관리자 검토 콘솔 | **검토자 확인 필요** (critical 규칙·근거·예외·충돌·미해결) |
| 7. 활성화 게이트 | `can_activate_assessment_rule_version` → `review`/`approve --fingerprint`/`activate` | 결정적 게이트 + **승인자 확인 필요** |
| 8. listing binding | admin이 `/admin/listing-bindings`(`bind_listing_to_assessment_rule_set`)로 연결 | **관리자 확인 필요**. 서버가 권한·공고 일치·활성 버전·revision을 검증하고 audit을 남김. binding이 없으면 fail-closed |
| 9. 판정·상담 | `read_assessment_rule_set` → `assessApplication()` | 결정적. UI는 재계산하지 않음 |

## 3. 새 공고에서 해도 되는 것 / 안 되는 것

- 해도 됨: 새 import package JSON, 새 review annotation JSON, 새 literal expectation 객체(벤치마크·추출용),
  `REVIEW_CATEGORY_BY_CONCEPT` 어휘 확장(모든 공고에 공통인 concept일 때만).
- 안 됨: 공고 이름·지역·금액·특정 rule key를 generic 모듈에 추가, 지역별 if문, 다른 공고의 규칙으로 대신 판정,
  activation gate 완화, review row 임의 조작.

## 4. 삼도이동 1지구에 남아 있는 공고별 자료 (모두 data/fixture 계층)

- `data/assessment-rules/samdo-2026-v1.7.json`: import package
- `data/assessment-rules/samdo-2026-v1.7.review-annotations.json`: 저축액 근거 불일치 blocker, 지역우선 기준일 충돌, 관리번호 미해결
- `features/ruleExtraction/server/fixtures/samdoLiteralExpectations.ts`: 추출 벤치마크용 공고 literal
- `features/applicationAssessment/reference/`: LEGACY/REFERENCE_ONLY 구조 샘플 (명시 선택 시에만)
- `scripts/*samdo*`, `scripts/build-samdo-draft-package.py`: 보관용 삼도 벤치마크·전사 도구

## 5. 두 번째 공고로 확인한 절차 (힐스테이트 고덕엘리스트 A65BL, 청약홈 2026000438)

| 단계 | 실행한 명령·RPC | 결과 |
|---|---|---|
| 전사 → 패키지 | `node --experimental-strip-types scripts/build-import-package.mjs --transcription <공고>.transcription.json --parsed <parsed document.json> --out <공고>.json` | 인용 블록의 원문·페이지·bbox를 그대로 복사. 원문 해시가 다르거나, 없는 블록을 인용하거나, 규칙 숫자가 인용 원문에 없으면 실패 |
| 검증 | `assessment-rules validate <공고>.json` | 구조·규칙 디코딩 |
| 원문 업로드 | `assessment-rules upload <공고>.json --document <원문>` | 원문 SHA-256 재확인 후 비공개 저장 |
| import | `assessment-rules import <공고>.json` | 저장된 원문 해시 재확인, 의미 round-trip, 승인·활성화 안 함 |
| review seed | `seed-rule-review-staging.mjs --package … --annotations …` (`RULE_REVIEW_STAGING_ALLOW_WRITE=true`는 이 프로세스에서만) | 모든 규칙이 PENDING 후보 |
| 검수 | reviewer 계정으로 `mutate_assessment_rule_review` (START_REVIEW → REVIEW_EVIDENCE → APPROVE_RULE → RESOLVE_UNRESOLVED → REVIEW_EXCEPTION) | 근거는 인용 블록 원문과 다시 대조한 뒤에만 VALID |
| 레지스트리 승인 | `assessment-rules review <ruleSetId> --out …` → `approve <ruleSetId> --fingerprint … --reviewer …` | 저장된 스냅샷 지문으로만 승인 |
| 활성화 | admin 계정으로 `activate_reviewed_assessment_rule_set(p_rule_set_id, p_expected_revision, p_expected_active_id)` | reviewer는 FORBIDDEN. 활성 버전은 공고 단위로 하나 |

### listing binding: admin 전용 운영 기능

수동 SQL 대신 관리자 화면 `/admin/listing-bindings` 또는 아래 RPC를 쓴다. 모든 판단은 서버가 한다.

| RPC | 권한 | 서버 검증 |
|---|---|---|
| `load_assessment_listing_bindings()` | reviewer·admin (읽기) | 공고별 활성 버전, 공고 출처에서 도출한 정규 listing id, 현재 binding, 최근 audit 50건 |
| `bind_listing_to_assessment_rule_set(p_listing_id, p_rule_set_id, p_expected_revision, p_reason)` | admin | 사유 필수 · rule set 존재·활성·승인·공개 · listing이 그 공고의 정규 listing인지(아니면 `ANNOUNCEMENT_MISMATCH`/`UNKNOWN_LISTING`) · revision 일치(`STALE_BINDING_REVISION`) · 같은 값이면 `NO_CHANGE` |
| `unbind_listing_from_assessment_rule_set(p_listing_id, p_expected_revision, p_reason)` | admin | 사유 필수 · binding 존재 · revision 일치 |

- 정규 listing id: 청약홈 APT `getAPTLttotPblancDetail:<관리번호>:<공고번호>` → `apt-<관리번호>-<공고번호>`, 무순위 → `remndr-…`, 그 외에는 listing 모양의 external id 그대로(`assessment_announcement_listing_ids`). 앱의 `normalizeListingRecord`와 같은 규칙이다.
- 새 binding은 `p_expected_revision = 0`, 기존 binding은 화면에서 읽은 revision을 넘긴다. 해제 뒤 옛 revision으로는 다시 연결할 수 없다.
- 모든 변경은 `announcement_listing_binding_audit_log`(append-only)에 행위자·역할·listing·이전/새 공고·이전/새 rule set·revision·사유·시각으로 남는다.
- 읽기 경로 `read_assessment_rule_set`은 바뀌지 않았다. binding이 없으면 상담·판정은 "준비 중"으로 fail-closed.

### 이 공고로 추가된 범용 어휘

- 사실: `realEstateAssets`(세대 부동산), `vehicleValue`(최고 차량가액), `householdIncomeScoreEligible`(공고 비율 `incomeScore.singlePercent/dualPercent` 이하면 1),
  `newlywedMarriageScoreMonths`·`singleParentChildScoreMonths`(가족 유형상 선택 불가 항목은 -1)
- 배점 구간 `notApplicable: true`: 선택할 수 없는 항목은 0점이고 최대점에서도 뺀다
- 규칙 개념: `realEstate`, `vehicle` → ASSET(세대)
- 경고: `warning.<supplyType>.*`는 해당 공급유형 결과에만 붙는다
- 거주: 공고 규칙에 `residence eq`가 없으면(전국 청약) 폼은 중립 질문을 하고 지역을 가정하지 않는다
