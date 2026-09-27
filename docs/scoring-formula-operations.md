# 가점 산식 운영 backend

## 범위

이 구현은 `data/scoring-formulas/formulas.json`의 84점 산식을 운영 DB에 넣을 수 있는 형태로 준비한다. migration, repository, transactional RPC, deterministic seed와 격리 DB 검증까지만 포함한다. 사용자 판정 엔진과 현재 활성 rule binding은 변경하지 않았으며, production에는 적용하지 않았다.

## 상태와 버전

DB 상태는 `DRAFT → IN_REVIEW → ACTIVE → RETIRED`다. `(slug, version)`은 유일하다. ACTIVE 또는 RETIRED snapshot과 그 item/band/test case는 직접 수정할 수 없다. 변경은 ACTIVE v1을 `clone_scoring_formula_version`으로 DRAFT v2로 복제한 뒤 검토·활성화한다.

한 formula version은 한 `target`과 한 `scope_key`를 가진다. ACTIVE `scope_key`에는 partial unique index가 있어 동시 요청에서도 두 ACTIVE version이 생기지 않는다. 향후 지역·공급 단계 같은 qualifier는 `applicable_scope`와 이를 정규화한 `scope_key`로 확장한다.

## canonical 평가 contract

입력은 item의 `fact` key(`noHomeMonths`, `dependentCount`, `subscriptionMonths` 등)에 대응하는 숫자 또는 `null`이다. 기존 browser fixture를 위해 item key도 읽지만 신규 연결은 fact key를 쓴다. 출력은 `total`, `max`, item별 `breakdown`, `problems`, `interpretation`이다. 값이 없거나 구간이 유일하게 결정되지 않으면 `total=null`인 incomplete 결과다. unknown을 0점으로 계산하지 않는다.

TypeScript `calculateScore()`와 SQL `evaluate_scoring_formula_snapshot()`은 같은 inclusive boundary contract를 사용한다. activation RPC는 반드시 SQL evaluator로 저장 test case를 다시 실행한다. 경계 fixture는 두 구현에서 0개월, 모든 경계 전·경계·후, 최대 초과, null을 검증한다.

## 데이터 무결성

- item/band/test case order는 formula 또는 item 안에서 유일하다.
- 점수와 선언 만점은 음수가 될 수 없다.
- `min_value <= max_value`를 DB check로 보장한다.
- 빈 item, 빈 band, 구간 겹침·빈틈, 열린 구간 뒤 추가 구간, 선언 만점 불일치는 activation에서 차단한다.
- test case가 없거나 하나라도 기대 총점과 다르면 activation을 rollback한다.
- `published_to_users=true`는 ACTIVE에서만 가능하다.
- audit log는 append-only이며 formula 삭제로 연쇄 삭제되지 않는다.

## RPC

읽기: `list_scoring_formulas`, `get_scoring_formula_detail`, `get_scoring_formula_audit`, `get_active_scoring_formula`, `evaluate_active_scoring_formula`.

운영: `create_scoring_formula_draft`, `clone_scoring_formula_version`, `mutate_scoring_formula_draft`, `request_scoring_formula_review`, `activate_scoring_formula`, `retire_scoring_formula`.

서버 전용: `seed_scoring_formula_package`. `mutate_scoring_formula_draft`는 metadata/item/band/test case CRUD를 action/payload로 transaction 안에서 처리하고 매번 expected revision과 audit를 기록한다.

`activate_scoring_formula`는 admin 확인, row lock, revision, 상태, snapshot validation, test case 실행, scope advisory lock, 기존 ACTIVE retire, 새 ACTIVE 전환, audit를 한 transaction에서 수행한다. 오류는 전체 transaction을 rollback한다.

## 권한과 RLS

기존 `assert_assessment_review_access`를 재사용한다. reviewer/admin은 관리 RPC로 목록과 detail을 읽을 수 있다. reviewer는 검토와 테스트 결과를 읽을 수 있지만 mutation/activation RPC는 admin을 요구한다. anon과 일반 authenticated 사용자는 raw draft/test/audit를 읽거나 쓸 수 없다. 사용자 읽기는 `ACTIVE AND published_to_users` formula/item/band와 제한된 active read/evaluate RPC뿐이며, 공개 active snapshot에서는 test case와 내부 history를 제거한다.

모든 SECURITY DEFINER 함수는 `search_path=''`와 schema-qualified object를 사용한다. 함수 기본 실행권은 회수하고 필요한 role에만 다시 부여한다. service-role seed는 server script에만 있으며 client bundle에 import되지 않는다.

## deterministic seed

`npm run seed:scoring:dry-run`은 네트워크 없이 package와 SHA-256을 출력한다. package는 property 순서를 고정한 canonical JSON으로 해시하고 항상 `IN_REVIEW`, `publishedToUsers=false`다. 동일 `(slug, version, sourcePackageHash)`는 `NO_CHANGE`, 같은 버전에 다른 hash는 `SCORING_SEED_CONFLICT`다.

실제 staging seed 명령은 `npm run seed:staging:scoring`이다. 이 명령은 `WANPANE_ENV=staging`, staging URL/ref 일치, production ref 불일치, server-only staging service key를 모두 요구한다. 이 작업에서는 실행하지 않았다.

## migration과 rollback

적용 전 staging backup과 migration history를 확인하고 격리 staging에서 먼저 실행한다. 아직 사용자 연결 전 rollback은 새 RPC execute 권한을 revoke한 뒤 scoring 전용 함수·trigger·table을 dependency 역순으로 drop하는 후속 migration으로 수행한다. 적용 뒤 데이터가 생겼다면 down SQL로 삭제하지 않고 backup/point-in-time restore 또는 correction migration을 사용한다. 기존 assessment rule table에는 FK나 trigger를 추가하지 않으므로 영향 범위는 scoring 전용 객체에 한정된다.

## production 승인 전 checklist

1. 별도 staging project identity와 backup을 확인한다.
2. migration 전체를 staging clean DB와 기존 schema가 있는 DB 모두에 적용한다.
3. reviewer/admin/normal/anon/service 역할 matrix를 실제 Auth JWT로 재검증한다.
4. 동시에 두 version을 활성화해 하나만 성공하는지 확인한다.
5. 84점 seed dry-run hash를 검토하고 staging에는 IN_REVIEW로만 삽입한다.
6. 운영자가 법적 근거와 모든 band 경계를 검수하고 test case를 승인한다.
7. `published_to_users=false`로 activation rehearsal 후 public read가 비어 있는지 확인한다.
8. rollback/restore 담당자와 maintenance window를 확정한다.

## UI 연결 contract

Admin UI는 `ScoringFormulaRepository`만 사용한다. 모든 mutation은 `expectedRevision`과 `reason`을 전달하며 서버가 돌려준 snapshot만 채택한다. ACTIVE 편집은 `SCORING_VERSION_IMMUTABLE`을 받으면 clone-version flow로 전환한다. 사용자 서비스 연결점은 `getActiveFormula(target)`과 `evaluateActiveFormula(target,input)`이며, 현재 assessment에는 자동 연결하지 않는다.
