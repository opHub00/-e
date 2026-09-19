# ApplicationAssessment Rule Review Backend

## 1. 목적과 범위

이 계층은 AI가 만든 candidate rule을 사람이 검수하는 **승인 전 작업공간**이다. AI 원본은 불변으로 보존하고, 수정본·근거 판단·충돌 해결·예외 연결을 별도 기록한다. `canActivateRuleVersion()`은 활성화 가능성만 계산한다. 자동 승인·자동 활성화·원격 Supabase mutation은 구현하지 않았다.

현재 구현은 `feature/assessment-rule-review-backend`의 순수 TypeScript service와 additive SQL migration으로 구성된다. 테스트는 Samdo VER1.7에서 파생한 fixture와 격리 PGlite만 사용한다. Samdo source status는 계속 `DRAFT_SOURCE_VERIFIED`다.

## 2. 기존 기반 감사

기존 schema의 `assessment_admin_reviews`는 rule-set 단위 `NEEDS_REVIEW / APPROVED / REJECTED` 기록만 제공했다. `approve_assessment_rule_set()`은 전체 snapshot fingerprint를 확인하고 승인했지만 다음 정보는 없었다.

- rule별 상태와 reviewer
- AI 원본과 관리자 수정본의 분리
- evidence별 유효성 판정
- structured conflict resolution
- orphan exception relation
- critical category coverage
- optimistic concurrency revision
- rule별 audit diff

새 migration은 기존 registry/import 테이블을 파괴하지 않고 검수 전용 테이블을 추가한다. activation RPC에는 검수 gate 재확인만 덧붙였다. 기존 runtime evaluator와 공개 read RLS는 변경하지 않는다.

AI candidate ID는 text로 저장하고 runtime `assessment_rules.id`와 구분한다. 검수 전 candidate를 runtime rule로 가장하지 않는다. 승인 후 deterministic runtime config로 materialize한 경우에만 별도 `materialized_rule_id`를 연결한다.

## 3. Lifecycle

### Rule 상태

`PENDING_REVIEW → IN_REVIEW → APPROVED | APPROVED_WITH_EDIT | HELD | REJECTED`

- `APPROVED`: AI 원본을 그대로 채택했다.
- `APPROVED_WITH_EDIT`: 원본을 유지하고 별도 `editedRuleSnapshot`과 field diff를 저장한다.
- `HELD`: 해결 상태가 아니며 critical 여부와 관계없이 활성화를 막는다.
- `REJECTED`: 잘못된 extra를 제외할 수 있다. required critical rule이면 category가 사라진 것으로 계산해 `MISSING_CRITICAL_RULE`을 만든다.

### Rule version 집계 상태

- `PENDING_REVIEW`
- `IN_REVIEW`
- `REVALIDATION_REQUIRED`
- 계산 결과인 `ACTIVATION_ELIGIBLE`은 DB 상태로 자동 저장하지 않는다.

모든 mutation은 `expectedRevision`을 받아 stale update를 거절한다. actor는 production auth에 종속되지 않은 opaque reviewer ID다.

## 4. 불변 원본과 수정 이력

`originalCandidate`와 canonical SHA-256인 `originalCandidateHash`는 불변이다. SQL trigger도 rule identity·원본 JSON·hash 변경을 차단한다.

`approveRuleWithEdit()`는 다음을 별도로 남긴다.

- edited snapshot
- field별 before/after diff
- 해결했다고 명시한 safety blocker
- reviewer, 시각, note, decision reason

rule key나 source document identity를 바꾸는 edit는 거절한다. critical rule은 유효한 evidence 없이 원본 승인과 수정 승인을 모두 할 수 없다.

## 5. Activation blocker

v4.1 safety 결과에서 다음 blocker를 그대로 수용한다.

- `CONFLICT`
- `UNRESOLVED`
- `ORPHAN_EXCEPTION`
- `MISSING_CRITICAL_RULE`
- `SEMANTIC_EVIDENCE_MISMATCH`
- `CRITICAL_SCORE_VIOLATION`
- `PARTIAL_RANGE_BINDING`
- `SCOPE_MISMATCH`
- `HIGH_CRITICAL_ERROR`

workflow blocker도 함께 계산한다.

- review 미시작 또는 critical pending
- critical reject
- held rule/exception
- critical evidence 미검수
- non-critical 미완료
- source document hash 변경

`canActivateRuleVersion()`은 `canActivate`, blocker 목록, unresolved/conflict/held/rejected/pending count, missing required category를 반환한다. `canActivate=true`는 production activation 명령이 아니다.

SQL에도 `can_activate_assessment_rule_version()`을 두고 기존 `activate_assessment_rule_set()`이 같은 트랜잭션에서 gate를 다시 확인하게 했다. 승인 candidate와 materialized runtime rule이 일대일로 연결되지 않거나 rejected critical candidate가 있으면 activation RPC가 실패한다.

## 6. Conflict와 unresolved

Conflict는 concept, 복수 candidate, source evidence ID, `resolution=null`로 시작한다. 관리자는 candidate 선택, 유효 evidence를 동반한 custom value, 보류 중 하나만 선택한다. 보류와 미해결 conflict는 활성화를 막는다.

Unresolved item은 명시적인 resolution과 reviewer가 기록될 때까지 blocker다. 추출 결과에서 사라지거나 승인 수에 묻히지 않는다.

## 7. Exception workflow

exception rule은 기본적으로 `ORPHAN_EXCEPTION`이다. 검수자는 다음 결정을 할 수 있다.

- base rule 연결: `LIMITED_BY`, `EXEMPTED_BY`, `OVERRIDDEN_BY`, `QUALIFIED_BY`, `APPLIES_ONLY_IF`
- independent rule 확인
- 제외
- 보류

relation endpoint와 relation type을 함께 검증한다. 예외 존재만으로 preservation 성공으로 보지 않는다. `EXCLUDED`는 해당 candidate를 `REJECTED`로 남겨 audit 가능하게 한다.

## 8. Evidence review

evidence 상태는 `VALID / INVALID / REPLACED / NEEDS_REVIEW`다. replacement는 같은 document에 속한 완전한 evidence snapshot이 필요하다. critical rule 승인에는 최소 한 개의 `VALID` 또는 `REPLACED` evidence가 필요하다.

원본 evidence는 candidate에 계속 남고, replacement 판단은 별도 record다.

## 9. Document hash와 source status

검수 root는 `reviewedDocumentHash`와 `currentDocumentHash`를 함께 가진다. 둘이 달라지면 `REVALIDATION_REQUIRED`이며 다른 mutation과 활성화 eligibility를 차단한다. 기존 승인 이력은 삭제하지 않는다.

검토본에서 공식 문서로 바뀌면 source status가 `DRAFT_SOURCE_VERIFIED → OFFICIAL_VERIFIED`가 될 수 있지만 기존 승인은 승계되지 않는다. immutable document record와 새 rule set/version을 만들고 다시 import·검수해야 한다.

## 10. 관리자 UI contract

`buildReviewSummary()`:

- announcement/document/sourceStatus/ruleVersion
- total, pending, approved, edited, held, rejected
- criticalPending, conflicts, orphanExceptions, unresolved
- activationBlockers와 aggregate status

`listReviewRules()`:

- supply type, criticality, review status, conflict, exception, warning filter
- critical blocker → review required → normal 순서

`getRuleDetail()`:

- 사람이 읽는 label, semantic role, value/operator/scope/stage/score
- source/evidence와 evidence review
- exception relation, warnings
- immutable original, edited candidate, history

raw DB row와 내부 UUID 중심 shape를 presentation component가 직접 해석할 필요가 없다.

## 11. Security와 RLS

새 테이블은 전부 RLS를 켜고 `public`, `anon`, `authenticated`의 모든 privilege를 명시적으로 회수했다. `service_role`만 접근할 수 있다. 관리자 인증 UI와 production admin role은 아직 없으므로 client write policy는 만들지 않았다.

DB function은 `SECURITY INVOKER`, 빈 `search_path`를 사용한다. audit table은 append-only trigger로 update/delete를 막는다. service role은 client bundle에 들어가면 안 된다.

## 12. Audit log

모든 domain mutation은 actor, timestamp, action, target, before, after, reason을 남긴다. 비밀·프로필·대화 원문은 저장하지 않는다. SQL audit table도 append-only다.

## 13. Bulk approval

일괄 승인은 다음 조건을 모두 만족한 non-critical candidate로 제한한다.

- `AUTO_SAFE_CANDIDATE`
- required가 아님
- safety blocker, conflict, unresolved, exception 없음
- evidence 검수 완료

critical/income/asset/score/scope/exception candidate는 개별 검수한다.

## 14. Production 연결 체크리스트

1. production admin auth와 reviewer authorization을 정의한다.
2. reviewer ID를 신뢰된 backend에서만 주입한다.
3. additive migration을 staging branch DB에 먼저 적용한다.
4. staging에서 table constraints, trigger, revision conflict, RLS, grants를 실제 PostgREST로 확인한다.
5. 현재의 provider-independent candidate materializer를 DB repository와 연결해 review queue를 transaction으로 저장한다.
6. v4.1 safety blocker와 review row의 일대일 변환을 검증한다.
7. 관리자 UI prototype을 summary/list/detail DTO에 연결한다.
8. activation RPC가 `canActivateRuleVersion()`과 동등한 DB-side gate를 다시 검사하도록 확장한다.
9. document replacement가 새 document/rule set을 만들고 기존 version을 revalidation 상태로 표시하는지 확인한다.
10. backup/schema snapshot, smoke test, rollback 조건을 문서화한 후 production migration을 별도 승인한다.

현재 production blocker는 **관리자 인증**, **candidate materialization repository**, **DB-side activation gate RPC**, **staging PostgREST/RLS 검증**, **실제 admin UI 연결**이다.
