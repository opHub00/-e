# 완판e MVP RC1 — production 승격 계획

대상: production 배포를 승인하고 실행할 운영자.
기준: tag `wanpane-mvp-rc1` / branch `release/wanpane-mvp-rc1`. 이 문서를 만든 작업에서는 production 프로젝트에 읽기·쓰기·migration을 하지 않았다.

- staging project: `krkeiytshxpqojrlrmsx`
- production project: `ypdreeipoxcztbxtiklt` (`SUPABASE_PRODUCTION_PROJECT_REF`)
- 기존 demo baseline: tag `demo-staging-ready-v1`, branch `demo/wanpane-staging-ready` (변경 없음)

## 1. 승격 인벤토리

분류: REQUIRED(배포 전 필수) / OPTIONAL / ALREADY_PRESENT(production에 이미 있다고 보이는 것, 배포 직전 read-only 확인 필요) / STAGING_ONLY(production에 가져가지 않음).

| 영역 | 항목 | 분류 | 비고 |
|---|---|---|---|
| DB migration | `20260825070000` ~ `20260908125941` (geocode cache, auth cloud profile, competition cache) | ALREADY_PRESENT | `master`에 있는 migration. 배포 직전 `migration list`로 확인 |
| DB migration | `20260915105910` ~ `20260922121000` (assessment 6개, §2) | REQUIRED | production 미적용으로 가정 |
| 환경변수 (Vercel, public) | `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` = production 값 | REQUIRED | `npm run build:web`은 staging ref가 번들에 있으면 실패한다 |
| 환경변수 (Vercel, public) | `EXPO_PUBLIC_KAKAO_MAP_JAVASCRIPT_KEY` | ALREADY_PRESENT | 기존 demo 배포 값 |
| 환경변수 (Vercel, public) | `EXPO_PUBLIC_WANPANE_ENV` | 설정 불필요 | `build:web`이 `production`으로 고정 |
| 환경변수 | `EXPO_PUBLIC_SUPABASE_STAGING_PROJECT_REF`, `EXPO_PUBLIC_RULE_REVIEW_RULE_SET_ID` | STAGING_ONLY | production build가 제거한다 |
| 환경변수 | `.env.staging.local`, `RULE_REVIEW_STAGING_*`, `SUPABASE_STAGING_*` | STAGING_ONLY | |
| Edge Function secrets | `GEMINI_API_KEY`, `NAVER_NEWS_*`, `DATA_GO_KR_SERVICE_KEY`, `KAKAO_REST_API_KEY` | ALREADY_PRESENT | 판정·상담 기능은 이 secret을 쓰지 않는다 |
| Auth/admin | `assessment_review_members` 에 reviewer/admin 등록 | REQUIRED | 멤버 추가 RPC가 없어 service-role SQL로만 가능. 감사 기록을 남기는 절차 필요(§5 blocker) |
| Auth/admin | staging 테스트 계정 (`staging-users.json`) | STAGING_ONLY | |
| Rule data | 고덕 A65BL 패키지 import (`OFFICIAL_VERIFIED`) | REQUIRED | §3 |
| Rule data | 삼도 VER1.7 패키지 import (`DRAFT_SOURCE_VERIFIED`) | REQUIRED, 단 source 확인 선행 | 부동산원 제출용 초안 기반. 최종 공고문과 대조 필요(§5 blocker) |
| Rule data | 원문 문서 업로드 (`announcement-documents` 비공개 bucket) | REQUIRED | `assessment-rules upload` |
| Review | review workspace seed + 검수 결정 | REQUIRED | staging의 결정은 복사하지 않고 production에서 다시 기록 |
| Activation | 각 공고당 활성 버전 1개 | REQUIRED | `activate_reviewed_assessment_rule_set` |
| Listing binding | `samdo-1-2026-ver1.7`, `apt-2026000438-2026000438` | REQUIRED | `bind_listing_to_assessment_rule_set` (admin RPC, audit 기록) |
| Listing binding | `staging-unbound-listing` fail-closed 확인용 | STAGING_ONLY | production에서는 binding 없는 실제 listing으로 확인 |
| Web | Vercel `buildCommand: npm run build:web` | REQUIRED | RC1에서 변경. 이전 값은 검증 없는 `npx expo export` |
| Web | `.staging/dist`, staging QA 스크립트 | STAGING_ONLY | |
| Admin UI | `/admin/rule-review`, `/admin/listing-bindings` | STAGING_ONLY (현재 코드) | 두 화면 모두 `EXPO_PUBLIC_WANPANE_ENV=staging`을 요구한다(§5 blocker) |
| Smoke | §4 | REQUIRED | |
| Rollback | §6 | REQUIRED | |

## 2. Migration 계획 (실행 금지 — 승인 후)

순서대로 적용한다. 모두 additive이며 기존 테이블(`listing_geocode_cache`, 프로필, competition cache)을 바꾸지 않는다.

| # | 파일 | 목적 | 위험 | Rollback | 데이터 영향 |
|---|---|---|---|---|---|
| 1 | `20260915105910_assessment_rule_registry.sql` | 공고·원문·rule set·rule·근거·binding·review 기본 테이블, append-only/immutability trigger, 공개 read RPC(`read_assessment_rule_set`, `list_assessment_announcements`), 비공개 bucket `announcement-documents` | 낮음. 새 테이블과 RLS만. bucket 이름 충돌 시 실패 | 새 객체 drop(아래 순서의 역순). bucket은 비어 있을 때만 삭제 | 기존 데이터 변경 없음 |
| 2 | `20260915112848_assessment_rule_import_lifecycle.sql` | service-role 전용 import/approve/activate RPC와 review snapshot | 낮음. EXECUTE는 service_role에만 | 함수 drop | 없음(호출 시에만 쓰기) |
| 3 | `20260919204711_assessment_rule_review_backend.sql` | 관리자 검수 테이블, audit log, `can_activate_assessment_rule_version`, `activate_assessment_rule_set` 교체 | 중간. `activate_assessment_rule_set`을 `create or replace`로 교체(검수 gate 추가) | 새 테이블 drop, 함수는 #2 정의로 되돌림 | 없음 |
| 4 | `20260920143000_assessment_rule_review_staging.sql` | `assessment_review_members`, 권한 검사, workspace load/mutate RPC, `seed_assessment_rule_review`(service_role), `activate_reviewed_assessment_rule_set` | 중간. 파일명은 staging이지만 production에도 필요한 권한 경계. seed 데이터 없음 | 함수·`assessment_review_members` drop | 없음 |
| 5 | `20260922120000_listing_binding_operations.sql` | binding에 `revision`/`bound_rule_set_id`/`bound_by`/`updated_at` 추가, audit log, admin 전용 bind/unbind/load RPC | 중간. `announcement_listing_bindings` ALTER + 기존 행 backfill `update` | 컬럼·audit·함수 drop | 기존 binding 행이 있으면 `bound_rule_set_id`만 채움. 신규 배포에서는 0행 |
| 6 | `20260922121000_listing_binding_read_fix.sql` | `load_assessment_listing_bindings` 변수명 모호성(42702) 수정 | 낮음 | #5의 함수 정의로 되돌림 | 없음 |

적용 절차(승인 후):
1. §6.1 백업.
2. 별도 checkout에서 `--project-ref ypdreeipoxcztbxtiklt`를 명시하고 `supabase migration list`로 1~3번 migration(`20260825070000` ~ `20260908125941`)이 적용돼 있고 assessment 6개가 없는지 확인(read-only).
3. `supabase db push --dry-run` 결과가 위 6개와 정확히 같을 때만 push.
4. 적용 직후 `test:assessment-db` 계열 SQL 검사와 같은 내용을 read-only로 확인: RLS 켜짐, anon이 review/member 테이블을 못 읽음, `read_assessment_rule_set`이 빈 결과를 fail-closed로 반환.

## 3. Rule data 승격 계획

원칙: staging DB 행을 복사하지 않는다. 저장소에 있는 원문·패키지로부터 같은 감사 경로를 production에서 다시 실행한다. 모든 쓰기는 actor와 audit가 남는 RPC로만 한다.

| 단계 | 고덕 A65BL | 삼도 VER1.7 |
|---|---|---|
| Source document | 청약홈 첨부 원문(2026.09.11). sha256 `be9fc0f60a27…` | `VER1.7_부동산원 제출용_공통 … 입주자모집공고문.hwp`, sha256 `bd67d7ee6c9b…` |
| Package | `data/assessment-rules/lh-godeok-a65bl-2026000438.json` (rule set `d96c7afc-e10c-43cd-815f-97e401fc318f`, transcription은 `.transcription.json`) | `data/assessment-rules/samdo-2026-v1.7.json` (rule set `bade0617-63c6-4f61-86bf-6cd5ae17a101`) |
| 재현 검증 | `assessment-rules validate`, `build-import-package` 재실행 결과가 커밋된 패키지와 동일 | 동일 + 최종 공고문 대조 |
| Upload/import | `assessment-rules upload … --document`, `import` | 동일 |
| Review | `seed_assessment_rule_review`로 review workspace 생성 후 production reviewer가 `/admin/rule-review`에서 결정 | 동일 |
| Approve/activate | review fingerprint로 approve → `activate_reviewed_assessment_rule_set` (expected active = none) | 동일 |
| Listing binding | admin이 `apt-2026000438-2026000438` → 고덕 bind (revision 1) | `samdo-1-2026-ver1.7` → 삼도 bind (revision 1) |

rule set UUID는 패키지에 고정돼 있으므로 production에서도 같은 id가 된다. 검수 결정·audit·binding revision은 production에서 새로 생긴다.

현재 코드로는 위 절차를 production에 실행할 수 없다(§5 B1·B2).

## 4. Production smoke (배포 직후)

읽기 위주로 확인한다.
1. `/consultation?listingId=samdo-1-2026-ver1.7&supplyType=youth`: 공고명 표시, 청년 예시 입력 9/9.
2. 삼도 newlywed 채팅 전용 A/B/C, 생애최초 "가점제 아님".
3. 고덕 newlywed 채팅 전용 10/13, 생애최초 "가점제 아님".
4. 공고 간 누출 0 (삼도 ↔ 고덕 화면 전환).
5. binding 없는 listing → "이 공고의 상담은 준비 중이에요".
6. 네트워크 차단 → "공고 기준을 불러오지 못했어요", fixture 노출 없음.
7. 번들: production host만, staging ref 0, service-role 0 (`npm run build:web`이 검사).
8. admin: reviewer/admin 로그인 후 rule review와 binding 화면 load(§5 B2 해결 후).

## 5. 남은 blocker

| # | Blocker | 해소 방법 |
|---|---|---|
| B1 | `assessment-rules` CLI는 `ASSESSMENT_IMPORT_ENV=local\|staging`만 허용하고 production endpoint를 거부한다. seed/reset 스크립트도 staging 전용 | production 전용 승인 게이트(명시 ref, 별도 opt-in, dry-run)를 가진 import/seed 경로를 별도 작업으로 추가 |
| B2 | `/admin/rule-review`, `/admin/listing-bindings`는 `EXPO_PUBLIC_WANPANE_ENV=staging`일 때만 동작 | production admin 대상 판정(`readPublicRuleReviewTarget`)을 production 허용 규칙으로 확장하거나 production 운영용 별도 admin build 결정 |
| B3 | 삼도 패키지 source가 `DRAFT_SOURCE_VERIFIED`(부동산원 제출용 초안) | 최종 게시 공고문과 대조 후 `OFFICIAL_VERIFIED` 패키지로 재import, 또는 초안임을 알고 공개할지 결정 |
| B4 | `assessment_review_members` 등록 RPC 없음 | 멤버 부여를 audit가 남는 방식(SQL 스크립트 + 기록, 또는 RPC)으로 정의 |
| B5 | production의 현재 migration 상태를 확인하지 않음(접근 금지) | 승인 후 read-only `migration list` |
| B6 | Vercel production 환경변수가 production Supabase를 가리키는지 확인하지 않음 | 승인 후 Vercel 프로젝트 env 확인 |

## 6. 백업과 rollback

### 6.1 DB 백업 (migration 전)
- Supabase 대시보드에서 PITR/일일 백업 존재 확인, 수동 백업 1회 생성.
- 추가로 `supabase db dump --project-ref ypdreeipoxcztbxtiklt` (schema + data)를 로컬 비공개 위치에 저장. credential은 출력·커밋하지 않는다.

### 6.2 Migration rollback
- 1~6은 additive라 기본 rollback은 "앱이 새 RPC를 호출하지 않도록 이전 web 배포로 되돌리기"다. schema는 남겨도 기존 기능에 영향이 없다.
- schema 제거가 꼭 필요하면 역순(6 → 1)으로 drop 스크립트를 따로 작성해 검토 후 실행: 함수 → trigger → policy → 테이블 → `announcement-documents` bucket(비어 있을 때).
- `activate_assessment_rule_set`(#3에서 교체)은 #2 정의로 되돌린다.
- 최후 수단: 6.1 백업으로 PITR 복원(다른 데이터 손실 범위 확인 후).

### 6.3 Rule activation rollback
- 새 버전에 문제가 있으면 `activate_reviewed_assessment_rule_set`으로 이전 승인 버전을 다시 활성화(expected active = 현재 버전). 공고당 활성 1개 unique index가 동시 활성화를 막는다.
- 이전 버전이 없으면 해당 listing을 unbind해서 상담을 fail-closed("준비 중")로 만든다. rule 행은 삭제하지 않는다(append-only).

### 6.4 Listing binding rollback
- `/admin/listing-bindings`에서 unbind 또는 이전 공고로 rebind. revision 검사로 동시 변경을 막고 audit log에 BIND/UNBIND가 남는다.
- SQL 직접 수정은 audit를 우회하므로 쓰지 않는다.

### 6.5 Web deploy rollback
- Vercel에서 직전 production deployment로 "Promote/Instant Rollback".
- Git 기준 복원점: `demo-staging-ready-v1`, `web-deployment-v1`.
- DB를 먼저 올리고 web을 나중에 올리면, web rollback만으로 사용자 영향은 사라진다(새 schema는 이전 앱이 쓰지 않음).
