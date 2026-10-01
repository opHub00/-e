# 사용자 중심 Assessment Staging Persistence

## Profile 저장 전략

| 기준 | A. `user_profiles` 확장 | B. `applicant_profiles_v3` 병행 |
| --- | --- | --- |
| migration 위험 | 기존 `schema_version = 2` 제약, V2 upsert와 같은 행을 변경하므로 높음 | 기존 테이블을 건드리지 않는 additive migration이라 낮음 |
| rollback | V2/V3가 한 행을 공유해 column·payload rollback이 어려움 | V3 read를 끄고 새 테이블/RPC를 제거하면 됨 |
| V2 호환성 | 기존 클라이언트가 V3 행을 V2로 덮을 수 있음 | 기존 V2 read/write가 그대로 유지됨 |
| dual read/write | 한 행 내부 분기와 schema-version 경쟁이 생김 | V3 우선, V2 fallback이라는 명시적 read 순서가 필요함 |
| production 전환 | 한 번에 제약과 writer를 교체해야 함 | 사용자 단위 backfill 후 V3 writer를 점진적으로 켤 수 있음 |
| 데이터 중복 | 낮음 | 병행 기간 동안 V2/V3가 중복됨 |
| 장기 유지보수 | 전환 후 단순하나 rollout 위험이 큼 | cutover 뒤 V2를 retire하면 단순해짐 |

이 Phase에서는 **B를 선택한다**. V2가 실제 서비스에 남아 있고, 모르는 값을 추정하지 않는
backfill과 rollback이 최우선이기 때문이다. 병행 기간의 중복은 provenance, revision, 명시적
fallback으로 관리하며 V2 write를 즉시 중단하지 않는다.

## 생성 객체

- `applicant_profiles_v3`: V3 payload, schema version, optimistic revision, 동의·완료 시각, provenance.
- `user_assessment_results`: 공고·listing·공급유형별 계산 snapshot과 RuleSet/document/profile/engine provenance.
- `save_applicant_profile_v3`: `auth.uid()` 소유자만, expected revision 일치 시 저장하고 revision을 증가.
- `backfill_applicant_profile_v3`: service role 전용. 검토된 사용자 allow-list와 Phase 2 converter 결과만 저장.
- `save_user_assessment_result`: 로그인 소유자의 profile revision, RuleSet version, document hash를 확인한 뒤 저장.
- `mark_user_assessment_results_stale`: service role 전용 lifecycle hook.

`20261001073009_user_centric_assessment_service_role_fix.sql`은 최초 Staging 적용 후 발견한
PostgREST 호출자 판별 차이를 correction한다. 적용된 migration을 수정하지 않고, SECURITY DEFINER
함수의 service-role 확인을 `current_user`가 아닌 `auth.role()`로 교체한다.

직접 client mutation grant는 없다. 두 테이블 모두 authenticated owner `SELECT`만 허용하며,
쓰기는 RPC를 통과한다. Assessment 결과는 같은 provenance/input hash에 대해 한 current row만
허용한다. 새 계산은 같은 listing/supply의 이전 current row를 삭제하지 않고 `superseded_at`으로
보존한다.

## Backfill

`scripts/backfill-applicant-profiles-v3.mjs`는 dry-run이 기본이다. 실제 이관은 다음 조건을 모두
만족해야 한다.

1. `WANPANE_ENV=staging`.
2. URL에서 읽은 project ref가 명시된 staging ref와 일치하고 production ref와 다름.
3. `PROFILE_V3_BACKFILL_ALLOW_WRITE=true`.
4. 미이관 V2 사용자가 모두 `PROFILE_V3_BACKFILL_USER_IDS` allow-list에 있음.

이 allow-list가 demo provenance 부재를 안전하게 다루는 경계다. V2의 개월·연수·구간 값은
가입일·혼인일·정확 금액으로 역산하지 않는다. TypeScript의 canonical V2→V3 converter가
`UNKNOWN`, legacy summary, `MIGRATED_V2` source와 observed timestamp를 보존한다.

## Stale 계약

- profile revision 변경: profile 저장 transaction에서 기존 current 결과에 `PROFILE_CHANGED` 표시.
- active RuleSet 변경: lifecycle/server에서 `RULE_SET_CHANGED` marker 호출.
- source document hash 변경: lifecycle/server에서 `SOURCE_DOCUMENT_CHANGED` marker 호출.
- engine version 변경: 배포 lifecycle에서 `ENGINE_CHANGED` marker 호출.

앱의 `detectAssessmentResultStaleness`도 네 provenance를 같은 우선순위로 비교한다. stale row는
삭제하지 않으며 사용자가 재계산하면 기존 row가 superseded history로 남는다.

## Rollback

1. V3 feature flag/read wiring을 끄고 기존 V2 read/write만 사용한다.
2. V3 결과 저장 호출을 중단한다.
3. 아직 production에는 적용하지 않는다. staging rollback이 필요하면 migration 적용 전 snapshot으로
   복구하거나 correction migration에서 RPC execute grant를 회수하고 신규 테이블을 quarantine한다.
4. 이미 저장된 V3/backfill/result row를 V2에 역변환하거나 덮어쓰지 않는다.

Production 전환 전에는 실제 V2 row의 demo provenance 분류, server-side result writer 신뢰 경계,
RuleSet/document lifecycle stale hook 연결, backup/restore rehearsal가 추가로 필요하다.
