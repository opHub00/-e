# 제주 행복주택 RuleSet v2 → Product V3 검수 후보 이식

이 문서는 코드 이식 및 관리자 검수 준비 기록이다. 승인, Staging DB 등록, 활성화 또는 공개를 뜻하지 않는다.

## 기준과 산출물

- Product V3 기준: `integration/product-v3-ops` 로컬 `94343004ea4b962296b43ee386288ac9a9ab9d5f`. 작업 시작 시 원격 `origin/integration/product-v3-ops`는 `5e4328bf47597137885a3537d1f13105e1be4eb1`였고, 로컬은 원격의 두 커밋을 추가로 포함했다.
- 제주 v2 원본: `feature/jeju-happy-ruleset-v2` `e021363560faee83a71d8ae92fb2c8f680203638`. 전체 브랜치 병합 대신 RuleSet·검수 메타데이터·필요한 평가 fact/engine 변경만 이식했다.
- 원본 PDF SHA-256: `76c89334fb042564569d9856acd073c85a84c425f124474891bdb01303d6404e`.
- v1 파일 `lh-jeju-ildo-samdo-happy-20260918.json`과 v2 파일 `lh-jeju-ildo-samdo-happy-20260918.v2.json`은 별개 ID로 공존한다. 두 파일은 Product V3 기준에 없던 원본 artifact를 그대로 가져온 것이다. v1을 v2로 덮어쓰지 않았다.
- v2는 공급유형 5개, 규칙 44개, semantic change 18건, 경고 22건, `UNRESOLVED_BLOCKER` 1건이다. 자세한 원문 locator·변경 전후 식은 `data/assessment-rules/*.v2.review-candidate.json` 및 `*.v2.review-diff.json`에 있다.

## 공개 게이트

`NoticePlatform`의 사용자 경로는 출처 검증/해시/Rule evidence, 검수 승인, Rule Package 승인, 공고 활성, listing binding 활성 상태를 각각 확인한다. `assessNotice`, `assessNotices`, `getNoticePresentation`, `retrieveNoticeEvidence`, `rulePackage`, `ragSource`, `compareAssessmentResults`에서 검수 후보를 거부한다. 내부 거부 이유는 `SOURCE_NOT_VERIFIED`, `REVIEW_REQUIRED`, `RULE_PACKAGE_NOT_APPROVED`, `NOT_ACTIVE`로 구분된다. 이 내부 코드를 사용자 화면에 직접 보여주는 계약은 추가하지 않았다.

Import는 구조 검증만 수행하고 새 공고를 `DRAFT`/`INACTIVE`로 만든다. 제주 v2 후보는 `REVIEW_REQUIRED`/`INACTIVE`이고 blocker를 유지한다. Import된 Rule Package에는 검수 미완료와 blocker를 `validationErrors`에도 남겨 기존 Admin service의 `canApprove`가 false가 되게 한다. 현재 승인·활성 상태로 바꾸는 API나 DB mutation은 추가하지 않았다. 같은 관리번호의 두 버전이 동시에 사용자 공개 상태가 되면 registry 생성이 실패한다.

기존 Samdo 두 공고의 active fixture는 종전 동작을 유지하도록 lifecycle을 명시했다. 이는 제주 행복주택에 대한 승인이나 공식 게시 확인이 아니다.

## 의미 보존

- 청년: 세대주일 때 현재 세대, 세대원일 때 본인 소득·자산·차량을 사용한다.
- 대학생: 신청자+부모 합산 소득의 별도 가구원수와 신청자 본인 자산을 구분한다. 차량 미소유 사실은 차량가액 0원과 다르다.
- 예비신혼: 미래 구성 세대의 무주택·소득·자산·차량 fact를 현재 세대에서 추론하지 않는다.
- 청약통장과 지역우선: 신청자·배우자·예비배우자 적용 범위를 RuleSet 식에 따라 유지한다.
- 원문에 없는 신혼 1인 소득 셀 2건, 대학생 자동차 금액 셀 3건은 `null`이다. 숫자 0이나 기존 기본값으로 변환하지 않는다.
- 관리자 review seed는 `HEAD_HOUSEHOLD_OR_MEMBER_APPLICANT`, `APPLICANT_AND_PARENTS`, `CURRENT_OR_FUTURE_HOUSEHOLD`, `APPLICANT_OR_SPOUSE` scope를 노출한다. 기존 검수 UI의 필드 라벨만 추가했고 화면 레이아웃은 바꾸지 않았다.
- 여섯 데이터 artifact의 Git blob은 v2 원본 커밋과 모두 동일하다. 평가 엔진 파일과 v2 경계 테스트도 원본과 동일하며, fact/types/validation에는 Product V3의 기존 미성년 세대주 예외 필드를 보존하는 최소 조정만 있다.

## 관리자 검수 경계

`features/assessmentRuleReview/fixtures/jejuHappyCandidate.ts`는 오프라인 검수 준비용으로 파일을 로드하여 identity, source hash, annotation, blocker를 확인한 뒤 검수 seed와 비공개 adapter를 반환한다. 일반 런타임 코드에서 import하지 않으며 공용 registry나 staging repository에 등록하지 않는다.

`features/noticePlatform/server/reviewPreview.ts`는 `REVIEW_PREVIEW`와 호출자가 제공하는 reviewer authorization callback을 요구하며, 결과에 `public:false`를 표시한다. 현재 서버 API와 실제 관리자 인증/감사로그에는 연결하지 않았다. 호출 서버가 진짜 인증·권한·감사 경계를 제공하기 전에는 운영 검수 기능으로 노출하면 안 된다.

## 남은 관리자 결정

1. `UNRESOLVED_BLOCKER`를 공고문 근거로 해결한다.
2. 9개 수동 검수 parameter와 22개 경고 분류를 관리자 워크스페이스에서 재확인한다.
3. 검수자 인증, revision/fingerprint, 감사로그를 갖춘 운영 review preview 경로를 결정한다.
4. 실제 승인을 별도 단계로 수행하고 source/version/listing binding의 변경 통제를 검증한다.
5. 이 문서의 코드 준비 상태를 Staging 등록·승인·활성화 허가로 해석하지 않는다.
