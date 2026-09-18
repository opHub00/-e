# ApplicationAssessment Rule Extraction v3

## 1. v1/v2 실패 진단

v2는 원문 locator의 무결성과 명시적 숫자·연산자 정확성은 확보했지만, 공급유형 전체를 한 요청에서 `CandidateRulePackage`로 생성했다. 모델이 숫자, 연산자, 단계, 점수, evidence metadata, 식별자를 모두 다시 작성하면서 출력이 커졌고 `INCOMPLETE_OUTPUT`, HTTP 400, HTTP 429의 영향 범위가 공급유형 전체로 확대됐다. Samdo v2에서 grounding은 56/56이었지만 oracle precision 8.9%, recall 6.7%에 머물렀다.

v3는 모델 성능을 보정하는 대신 모델의 책임을 줄인다. 기존 v1/v2 코드와 결과 artifact는 보존하며 v3는 별도 경로로 동작한다.

## 2. v3 흐름

```text
ParsedDocument
  -> deterministic ExtractedFact
  -> table-first task context
  -> LLM semantic binding (factIds/sourceIds only)
  -> host RuleBuilder
  -> CandidateRule validator
  -> review required
```

v3 후보는 계속 `REFERENCE / REVIEW_REQUIRED`이다. DB import, 승인, 활성화와 ApplicationAssessment 실행에는 자동 전달하지 않는다.

## 3. Deterministic fact layer

`ExtractedFact`는 `PERCENT`, `MONEY`, `DATE`, `DURATION_MONTHS`, `DURATION_YEARS`, `COUNT`, `SCORE`, `RATIO`, `AGE`, `BOOLEAN_PHRASE`를 표현한다. 각 fact는 원문 값, 정규화 값, 단위, 연산자, source locator, table row/column과 주변 block ID를 보존한다. ID는 source 위치와 match를 해시해 재실행해도 동일하다.

금액은 원문 단위를 보존하면서 KRW로 정규화한다. 예를 들어 `362백만원`은 `362000000`, `600만원`은 `6000000`이다. `이상`, `이하`, `초과`, `미만`은 각각 `gte`, `lte`, `gt`, `lt`로 코드가 변환한다. 하나의 값에 복수 연산자가 붙어 결합이 불명확하면 `AMBIGUOUS_OPERATOR_BINDING`으로 남고 RuleBuilder가 규칙을 만들지 않는다.

## 4. Table-first 처리

표 내부 block은 cell 단위로 먼저 처리한다. fact는 table ID, row, column과 immutable locator를 가진다. 같은 block을 다시 paragraph fact로 생성하지 않아 중복을 줄인다. 표가 `GEOMETRY_INFERRED`이거나 warning이 있으면 host confidence를 높이지 않는다.

`70% 초과 100% 이하`, `12회 이상 24회 미만`, `9 / 12점`의 각 경계와 점수/최대점수는 별도 fact다. 모델은 이 숫자를 다시 출력하지 않는다.

## 5. Semantic task 분해

공급유형 전체 요청을 제거하고 `youth.income`, `newlywed.homelessDuration`, `firstTime.savings`처럼 한 목적의 task로 분할했다. 각 task는 공급유형, host 지정 stage, 허용 semantic role, keyword, 예상 binding 수(최대 6)를 가진다.

task context는 관련 source를 relevance로 정렬해 최대 6개, fact 최대 12개로 제한한다. 긴 source는 keyword 주변 1,200자 excerpt를 사용하고 원본 source ID는 유지한다. 실제 Samdo 4,115 block/172 table plan에서 모든 task가 context를 확보했으며 최대 input은 약 10KB 수준이다.

## 6. 최소 provider schema

모델 출력은 다음 두 배열만 가진다.

```json
{
  "bindings": [{
    "bindingId": "...",
    "semanticRole": "...",
    "factIds": ["..."],
    "sourceIds": ["..."],
    "qualifierSourceIds": ["..."]
  }],
  "unresolved": [{ "reason": "...", "sourceIds": ["..."] }]
}
```

숫자, 연산자, 점수, stage, confidence, evidence object, DB metadata는 provider output에 없다. validator는 task에 없는 role과 존재하지 않는 fact/source ID를 거부한다. Gemini 호환 profile은 `$ref`, `oneOf`, `anyOf`, `allOf`, `maxItems`, nullable union, 과도한 배열 중첩을 금지한다.

## 7. RuleBuilder와 host confidence

RuleBuilder가 binding의 fact ID를 조회해 값, 연산자, 점수, evidence locator를 구성한다. stage는 task가 지정한다. COMMON은 특정 공급단계로 추론하지 않는다. `FIRST_TIME` 추첨에는 점수를 만들지 않는다. 완성된 후보는 기존 `validateCandidatePackage`를 통과해야 한다.

confidence도 host가 계산한다.

- `HIGH`: 단일 원문 위치, deterministic fact, 예외 marker·표 warning·conflict 없음
- `MEDIUM`: 여러 source 결합 또는 재구성 표
- `REVIEW_REQUIRED`: exception qualifier, 검토 문구, 모호한 fact 결합 또는 conflict

`REVIEW_REQUIRED`는 현재 CandidateRule 호환 시 `LOW + REVIEW_REQUIRED`로 표현된다.

## 8. 예외 pipeline

예외는 base binding과 분리한다.

1. deterministic marker discovery
2. exception semantic binding
3. base `limitedBy/exceptedBy` relation 연결

`단`, `다만`, `제외`, `예외`, `배우자`, `혼인 전`, `해외체류`, `국외체류`, `생업`, `출산`, `특례`, `불구하고`, `한하여`, 검토 문구를 탐지한다. marker source가 exception binding 또는 qualifier로 연결되지 않으면 `EXCEPTION_UNRESOLVED`를 생성한다. silent drop은 허용하지 않는다.

## 9. ConflictScanner

conflict 탐지는 rule extraction 성공 여부와 분리한다. 동일 semantic concept에 같은 단위·연산자지만 다른 값이 연결되면 두 source/value를 모두 보존하고 `resolution: null`, `requiresReview: true`로 반환한다. note와 검토/수정 문구도 별도 review issue로 남긴다. 자동 선택은 없다.

## 10. Provider failure와 retry

각 task 상태는 `SUCCESS`, `INCOMPLETE`, `FAILED`, `SKIPPED`다. 실패한 task만 손실되고 다른 task 결과는 보존된다.

| 오류 | 정책 |
| --- | --- |
| HTTP 400/401/403 | 재시도 없음 |
| HTTP 429 | benchmark task skip, 장기 backoff |
| HTTP 503 | 최대 1회 bounded retry |
| INCOMPLETE_OUTPUT | context/task를 더 작게 split 후 1회 |

retry가 전체 benchmark budget을 소진하지 않는다.

## 11. 호출 계획

실제 provider 호출 전 `npm run plan:samdo:v3`로 plan-only artifact를 생성한다. 출력에는 task, scope, stage, input chars, table/block/fact 수, 예상 binding 수, schema bytes가 포함된다. provider 호출 수는 0이다.

`runV3BindingBenchmark`는 기존 provider adapter를 최소 schema로 호출하는 명시적 진입점이다. 기본 실행 경로와 CLI는 plan-only이며 이 함수가 자동 호출되지는 않는다. task별 응답 검증과 RuleBuilder를 거치고, 429 또는 다른 task 실패가 발생해도 이미 성공한 결과를 보존한다. oracle과 DB lifecycle 의존성은 없다.

- `PLAN_A_16`: 숫자·연산자·표·세 공급유형 핵심 category를 확인하는 16-call safety plan
- `PLAN_B_24`: 공급단계와 무주택기간까지 확장한 24-call benchmark plan

예외 marker scan과 conflict scan은 호출 계획과 무관하게 항상 deterministic하게 실행한다. 24-call 밖의 세부 exception semantic task는 scanner 결과를 먼저 보존하고 다음 bounded batch에서 처리한다.

## 12. Metric 재설계

v3는 다음을 분리한다.

- Oracle Target Precision / Recall
- Source-supported Extra
- Confirmed Hallucination
- Unresolved
- Conflict Detection
- Evidence Locator Validity
- Semantic Evidence Support
- Oracle Preferred Evidence Match

locator가 존재한다는 사실과 해당 evidence가 rule 의미를 지지한다는 사실, oracle이 선호한 위치와 같은지는 서로 다른 metric이다. source-supported COMMON extra는 자동 false positive가 아니다.

## 13. Admin review 진입 기준

- critical numeric fidelity = 100%
- critical operator fidelity = 100%
- score fidelity = 100%
- 평가된 critical stage fidelity = 100%
- confirmed critical hallucination = 0
- HIGH-confidence critical error = 0
- exception silent-drop = 0
- evidence locator validity >= 99%
- YOUTH / NEWLYWED / FIRST_TIME core category coverage

recall보다 안전 기준이 우선이다. 조건 미충족 시 규칙 생성 대신 unresolved/review required를 선택한다.

## 14. Offline 검증과 향후 비교

Samdo 기반 15개 fixture가 parser model부터 fact, mock binding, RuleBuilder, 기존 candidate validator까지 통과한다. offline simulator는 한 task가 실패해도 성공 task의 규칙을 보존한다. 실제 Gemini benchmark는 fixture, schema, plan, RuleBuilder, 예외, conflict, retry, 전체 회귀가 모두 통과한 뒤 별도 승인된 실행에서만 수행한다.

provider 비교와 fine-tuning은 v3 Gemini 안정성 및 안전 metric이 측정된 뒤 검토한다. 다음 provider는 동일 ParsedDocument, fact set, task plan, semantic binding schema와 metric을 사용해야 한다.
