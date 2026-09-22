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
| listing binding | `announcement_listing_bindings(listing_id, announcement_id)` | DB | import API로는 쓸 수 없음. 운영자 단계 (아래 6번) |

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
| 8. listing binding | 운영자가 `announcement_listing_bindings`에 행 추가 | **운영자 확인 필요**. 명시 binding이 없으면 상담·판정은 "준비 중"으로 fail-closed |
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
