# 고덕 A65BL production 승격 — 최종 실행 계획

대상: 승인 후 production 승격을 실행하는 운영자. 공통 규칙과 명령 형식은 [production-operations.md](production-operations.md)를 따른다.
기준 commit: 이 문서가 포함된 commit. 작성 시점(2026-09-22) read-only preflight 결과를 반영했다.

## 범위

- 포함: 고덕 A65BL, rule set `d96c7afc-e10c-43cd-815f-97e401fc318f`, `OFFICIAL_VERIFIED`, listing `apt-2026000438-2026000438`.
- 제외: 삼도 VER1.7 (`DRAFT_SOURCE_VERIFIED`). `--allow-draft-source`는 쓰지 않는다. 쓰지 않으면 CLI가 삼도 import를 `PRODUCTION_SOURCE_NOT_OFFICIAL`로 거부한다(dry-run으로 확인).

## Preflight 결과 (read-only, 2026-09-22)

| 항목 | 결과 |
|---|---|
| production 프로젝트 | `ypdreeipoxcztbxtiklt` "완판e", ACTIVE_HEALTHY. staging `krkeiytshxpqojrlrmsx`와 다름 |
| client URL / key | URL ref = 선언된 production ref, key role = anon, key의 project = production. secret key 아님 |
| migration history | `20260825070000`, `20260905091513`, `20260908125941` 적용됨 |
| assessment 객체 | 테이블·함수·`announcement-documents` bucket 모두 없음 → 7개 migration과 충돌 없음 |
| assessment 데이터 | 테이블 자체가 없음 → 고덕 rule set / 원문 / binding / active rule set 모두 없음(정상) |
| `assessment_review_members` | 없음 (migration 4에서 생성) |
| Auth 사용자 | 4명. bootstrap admin은 이 중 실제 운영자 계정이어야 한다 |
| security advisor | ERROR 0, WARN 1 (leaked password protection 꺼짐), INFO 2 (cache 테이블 RLS policy 없음, 의도) |
| 백업 | **백업 0개, PITR 꺼짐** → 1단계 수동 dump가 필수 |
| Vercel Production env | `EXPO_PUBLIC_SUPABASE_URL`(production), `EXPO_PUBLIC_SUPABASE_ANON_KEY`(anon), `EXPO_PUBLIC_KAKAO_MAP_JAVASCRIPT_KEY` 있음. service-role 없음. **`SUPABASE_PRODUCTION_PROJECT_REF` 없음** |
| release build | Vercel env 그대로: `PRODUCTION_PROJECT_REF_REQUIRED`로 실패(의도한 fail-closed). ref 추가 시: 통과, production host 4, staging ref/host 0, service-role 0, OIDC 0, fixture 0, local seed/fault plan guard = production |
| 고덕 원문 | 로컬 `.ingestion/blobs/be9fc0f6….pdf` sha256 일치 |
| CLI dry-run | bootstrap-admin → upload → import → open-review(46 rules) → review → approve → activate 전부 `DRY_RUN_OK`, 네트워크 0 |

### Migration gap

| # | Migration | 상태 |
|---|---|---|
| – | `20260825070000_create_listing_geocode_cache` | APPLIED |
| – | `20260905091513_auth_cloud_profile_v1` | APPLIED |
| – | `20260908125941_create_listing_competition_cache` | APPLIED |
| 1 | `20260915105910_assessment_rule_registry` | MISSING |
| 2 | `20260915112848_assessment_rule_import_lifecycle` | MISSING |
| 3 | `20260919204711_assessment_rule_review_backend` | MISSING |
| 4 | `20260920143000_assessment_rule_review_staging` | MISSING |
| 5 | `20260922120000_listing_binding_operations` | MISSING |
| 6 | `20260922121000_listing_binding_read_fix` | MISSING |
| 7 | `20260923090000_assessment_review_membership` | MISSING |

CONFLICT 0, UNKNOWN 0. MISSING은 위 번호 순서대로 적용한다.

## 주의: CLI의 임시 login role

`supabase db query/advisors/push/dump --linked`는 실행 전에 `POST /v1/projects/<ref>/cli/login-role`로 **임시 CLI login role**을 만든다. 이번 preflight에서도 6회 발생했다(SELECT만 실행, 스키마·데이터 변경 없음). 앞으로 production을 "쓰기 0"으로 읽어야 할 때는 Dashboard SQL editor나 read-only DB 사용자 + `--db-url`을 쓴다.

## 실행 순서

각 단계는 **stop condition**이 하나라도 걸리면 멈추고, 다음 단계로 가지 않는다. CLI 단계는 먼저 `--dry-run`, 그다음 같은 명령을 실제로 실행한다.

| # | 단계 | 실행 | Stop condition | Rollback checkpoint |
|---|---|---|---|---|
| 1 | 백업 | `pg_dump`(schema+data)를 read-only 연결로 떠서 암호화 보관. 로컬 Postgres에 복원해 테이블 4개와 행 수 확인 | dump 실패, 복원 실패, 행 수 불일치 | **CP1**: 이 dump가 유일한 복원점(PITR 없음) |
| 2 | migration | 별도 빈 폴더에서 `--project-ref ypdreeipoxcztbxtiklt` 명시, `migration list` → `db push --dry-run`이 정확히 위 7개일 때만 `db push` | dry-run 목록이 7개와 다름, 적용 중 오류, 적용 후 advisor ERROR > 0, anon이 review/member 테이블 읽기 가능 | **CP2**: 7개 모두 additive. 문제 시 web 배포 전이므로 사용자 영향 없음. 필요 시 역순 drop 스크립트 또는 CP1 |
| 3 | 첫 admin | `assessment-rules bootstrap-admin <운영자 email> --reason … --confirm bootstrap-admin:<ref>:<email>` | `USER_NOT_FOUND`, `ADMIN_ALREADY_EXISTS`(예상 외 admin), audit에 BOOTSTRAP_ADMIN 1행이 아님 | admin이 revoke 가능(자기 자신 제외) |
| 3b | reviewer | admin 세션으로 `set_assessment_review_member(<reviewer email>,'reviewer',<사유>)` | reviewer 계정 없음, audit GRANT 없음 | `revoke_assessment_review_member` |
| 4 | 원문 업로드 | `assessment-rules upload lh-godeok-….json --document <be9fc0f6….pdf> --confirm upload:<ref>:d96c7afc-…` | sha256 불일치, 업로드 오류(덮어쓰기 없음) | 비공개 bucket 객체 1개. 사용자 노출 없음 |
| 5 | import | `assessment-rules import … --confirm import:<ref>:d96c7afc-…` | 저장 원문 sha 불일치, semantic round-trip 불일치, `approved:false, active:false`가 아님 | rule set은 미승인·비활성. 공개되지 않음 |
| 6 | 검수 열기 | `assessment-rules open-review d96c7afc-… --package … --annotations … --confirm open-review:<ref>:d96c7afc-…` | `REVIEW_SEED_ALREADY_EXISTS`, rules ≠ 46 | 검수 데이터만. 공개 영향 없음 |
| 7 | reviewer 검수 | release bundle을 **로컬에서** 서빙(`npm run build:web:release` + 정적 서버) 후 `/admin/rule-review?ruleSetId=d96c7afc-…` | 배너가 "운영(Production) DB"가 아님, critical 대기·충돌·미해결 > 0 | 검수 결정은 audit에 남고 revision으로 되돌릴 수 있음 |
| 8 | 승인 | `assessment-rules review … --out` → `approve … --fingerprint <fp> --reviewer <이름> --confirm approve:…` | `Stale review fingerprint` | 승인만으로는 공개되지 않음 |
| 9 | 활성화 | 로컬 서빙 admin 화면에서 활성화(actor 기록) | `ACTIVATION_BLOCKED`, `STALE_REVIEW_REVISION`, 활성 버전이 예상과 다름 | **CP3**: 이전 활성 없음 → 문제 시 binding을 만들지 않으면 상담에 노출되지 않음 |
| 10 | listing 연결 | `/admin/listing-bindings`에서 `apt-2026000438-2026000438` → 고덕 bind, 사유 기록 | listing이 공고에서 파생되지 않음, revision ≠ 1 | **CP4**: unbind(audit 기록) → 상담 fail-closed |
| 11 | Vercel 배포 | Vercel Production에 `SUPABASE_PRODUCTION_PROJECT_REF=ypdreeipoxcztbxtiklt` 추가 → release commit 배포(`npm run build:web:release`) | build 실패, 번들 검사 실패 | **CP5**: Vercel Instant Rollback으로 직전 배포 |
| 12 | smoke | 고덕 신혼 채팅 전용 A 10/13 · B INELIGIBLE · C NEEDS_MORE, 생애최초 "가점제 아님", binding 없는 listing "준비 중", 네트워크 차단 시 fail-closed, 삼도 listing은 "준비 중"(범위 밖), admin 화면 load | 하나라도 실패 | CP5 → 필요 시 CP4 |
| 13 | rollback checkpoint 기록 | 배포 id, binding revision, 활성 rule set id, dump 위치를 기록 | 기록 누락 | — |

7~10단계의 admin 작업은 새 web 배포 없이 로컬에서 서빙한 release bundle로 한다. 기존 production 배포는 assessment RPC를 호출하지 않으므로, 11단계 전까지 사용자에게 보이는 변화는 없다.

## 남은 결정·작업 (승인 전)

1. bootstrap admin과 reviewer로 쓸 production Auth 계정(email) 확정.
2. Vercel Production env에 `SUPABASE_PRODUCTION_PROJECT_REF` 추가(11단계 직전, 값은 production ref).
3. Auth leaked password protection 활성화 여부 결정(권장).
4. 백업 방식 확정: 무료 플랜 기준 자동 백업이 없으므로 1단계 수동 dump와 복원 검증이 필수.
