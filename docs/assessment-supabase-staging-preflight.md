# ApplicationAssessment Supabase staging preflight

검사일: 2026-09-17. 시작 HEAD: `a401d52`, branch: `feature/assessment-rule-import`, working tree clean.

## 결론: staging 식별 전 원격 실행 보류

**실제 staging E2E는 미완료다. 현재 project가 production일 가능성을 배제할 수 없음.**
사용자가 명시한 환경 판별 조건에 따라 원격 migration, Storage upload, import/review/approve/activate,
테스트용 write 및 staging browser 검증을 실행하지 않았다. 기존 격리 DB 성공을 staging 성공으로 간주하지 않는다.
이번 변경은 이 사전점검/재개 문서이며 엔진·UI·migration·기존 package는 변경하지 않는다.

## 1. 환경 판별과 읽기 전용 원격 검사

| 항목 | 확인 결과 |
|---|---|
| SUPABASE_URL | configured (`.env`) |
| ANON_KEY | configured, JWT role=`anon` |
| SERVICE_ROLE | 로컬 import용 설정 missing; 원격 Edge secret 값은 조회하지 않음 |
| project ref | `ypdreeipoxcztbxtiklt` |
| 프로젝트 이름/상태 | 완판e / ACTIVE_HEALTHY / 서울 / PostgreSQL 17 |
| 환경 분류 | staging 미확인, 운영 연결로 보수적으로 취급 |
| CLI linked ref | 앱 `.env`와 동일 |
| staging 전용 설정 | `.env.assessment-staging` 없음, process import 환경변수 없음 |
| Supabase local config | `supabase/config.toml` 없음 |
| Vercel 연결 | `wanpan-e`, Expo export → `dist` |
| Vercel preview env | 로컬 저장본 없음. 원격 Vercel 환경변수는 검증하지 않음 |

Supabase connector `list_projects`는 빈 목록을 반환했지만 알려진 ref의 `get_project`, migration/table/function 조회는 성공했다.
따라서 빈 목록을 다른 project가 존재하지 않는다는 증거로 사용하지 않는다.
해당 project의 `list_branches` 결과는 빈 목록이었다. 별도 staging ref와 그 환경의 서버 자격 증명이 필요하다.

원격에서 조회한 기존 migration:

- `20260825070000 create_listing_geocode_cache`
- `20260905091513 auth_cloud_profile_v1`
- `20260908125941 create_listing_competition_cache`

기존 public tables: `listing_geocode_cache`, `user_profiles`, `saved_listings`, `listing_competition_cache`.
모두 RLS enabled. 사용자 row 내용은 조회하지 않았다.
assessment tables/migrations는 없다. `storage.buckets`와 Storage policy metadata 조회 결과도 빈 목록이다.
이는 Storage HTTP 보안 테스트 통과를 의미하지 않는다.

Edge Functions 7개: `news`, `news-impact`, `listings`, `ai`, `competition`, `ai-newlywed-v1-preview`, `ai-newlywed`.
기존 기능이 배치되어 있다는 보조 근거이며, 함수명에 preview가 있다는 이유로 project 전체를 staging으로 간주하지 않는다.
운영 여부는 프로젝트 이름 하나로 단정하지 않고 앱/CLI 연결과 기존 배포 기록을 함께 고려했다.

## 2. Migration preflight

대상 파일(기존 파일 그대로):

1. `supabase/migrations/20260915105910_assessment_rule_registry.sql`
2. `supabase/migrations/20260915112848_assessment_rule_import_lifecycle.sql`

검토 결과:

- DROP TABLE, 기존 column type 변경, 기존 auth/profile/listing table 변경 없음.
- 신규 8 tables와 관련 indexes/functions/triggers/policies만 추가. 기존 public table 이름과 충돌 없음.
- FK 생성 순서가 부모 → 자식이며 document/announcement 일치와 evidence document 일치를 제한한다.
- 공고별 active set은 partial unique index로 하나만 허용한다.
- 승인 전 inactive/private, 승인에는 review 필요. 승인된 규칙/evidence/document는 변경 방지 trigger로 보호한다.
- activation은 announcement row lock 및 expected-active 검사로 동시 버전 전환 충돌을 거부한다.
- public tables RLS enabled. anon/authenticated는 공개된 active+approved set과 연결된 데이터만 읽는다.
- 공개 announcement metadata는 `PUBLISHED` 기준이며 원문 파일 공개를 뜻하지 않는다.
- write/approval RPC는 SECURITY INVOKER, 빈 search_path, PUBLIC/anon/authenticated EXECUTE revoke, service_role만 grant.
- Storage policy는 announcement-documents에 대한 client 접근을 restrictive policy로 차단한다.
  다른 bucket에는 이 제한식이 true이므로 기존 permissive policy를 확장하거나 대체하지 않는다.
- bucket insert는 `public=false`. migration 재실행이나 기존 동일 bucket/table이 있는 경우 충돌할 수 있으므로
  **staging에서도 적용 직전 migration history와 이름 충돌을 새로 확인**해야 한다. 자동 재실행하지 않는다.
- 두 번째 migration은 PostgREST schema reload notification을 포함한다.
- `storage.objects`의 service_role SELECT 등 실제 hosted platform grants와 Storage API 동작은 미검증이다.

이 검토는 환경 승인이나 실제 hosted Supabase 호환성 검증을 대체하지 않는다.

## 3. 실행 상태

| 단계 | 이번 실행 결과 |
|---|---|
| 실제 staging migration | 미실행: staging 미식별 |
| private bucket 생성/검증 | 미실행 |
| Samdo HWP upload/SHA round-trip | 미실행 |
| 실제 import / review / approve / activate | 미실행 |
| 실제 PostgREST / DatabaseRuleRepository round-trip | 미실행 |
| staging browser 청년 / 신혼 / 생애최초 | 모두 미실행 |
| 실제 anon RLS write/approve/activate 거부 | 미실행 |
| 실제 Storage anon list/upload/delete/download 차단 | 미실행 |
| staging 오류 주입(지연/401/403/timeout/malformed) | 미실행 |
| staging에 남긴 데이터 | 없음 |
| production 변경 / push / OFFICIAL_VERIFIED 승격 | 없음 |

기존 Samdo package는 75개 규칙, VER1.7, DRAFT_SOURCE_VERIFIED를 유지한다.
관리번호 매핑·지역우선 날짜 충돌·검토 메모·미지원 특례는 [원문 명세](./samdo-assessment-rule-spec.md)를 따른다.

## 4. Secret 및 오류 경로 검사

- `.env`/`.env.local`은 Git 추적 대상이 아니다. `.env.*`, `.vercel`, `.cache`, 원문 HWP는 ignored.
- 로컬 환경에서 service-role/secret을 EXPO_PUBLIC 변수에 설정한 항목은 발견하지 못했다.
- service-role 변수 참조는 Node import CLI와 기존 Edge Functions에 있으며 앱 client source에 없다.
- client source 161개 파일 및 최종 web export 32개 파일에서 service_role JWT와 실제 `sb_secret_` 형태 키를 검사했다.
  privileged key 발견 0건, bundle 내 서버 전용 환경변수 참조 0건이다. JWT는 payload role만 확인하고 값은 출력하지 않았다.
  이 검사는 전체 Git 이력/모든 원격 로그에 대한 secret audit은 아니다.
- 실제 client transport는 `createSupabaseRuleRepository`를 사용하며 선택한 공고만 RPC로 읽는다.
  15초 AbortController timeout, RPC 오류는 SERVICE_UNAVAILABLE, 없는 규칙은 RULE_NOT_AVAILABLE,
  잘못된 payload는 INVALID_RULE_SET이다. 정적 reference fallback을 추가하지 않았다.
- 기존 unit tests의 오류/없는 규칙/malformed/evidence 누락 검사는 유지한다.
  실제 네트워크에서 401/403/timeout을 재현한 결과로 보고하지 않는다.

## 5. 검증 결과

로컬 회귀 검사만 수행하며 실제 staging 결과와 구분한다. 실행 로그는 ignored `.cache/staging-preflight-*.log`에 보관한다.

| 검사 | 결과 |
|---|---|
| typecheck | 통과 |
| assessment tests | 기존 138개 통과 (engine23 + repository23 + import16 + Samdo76) |
| npm test | 전체 통과, Edge65 포함 |
| SQL/RLS | 111개 통과, 격리 PGlite |
| import lifecycle | 54개 통과, 격리 PGlite |
| Samdo DB scenarios | 9개 통과, 격리 PGlite, 75 rules round-trip |
| web export | 통과, 기존 앱 환경의 dist 재생성. staging build가 아님 |
| diff check | 통과 |

첫 npm test 실행은 마지막 Deno 단계에서 npm 캐시 접근 EACCES로 중단됐다.
필요한 실행 권한으로 같은 npm test를 재실행하여 exit code 0을 확인했다. 테스트 코드를 변경하지 않았다.

## 6. Staging 식별 후 재개 절차

1. 사용자가 지정한 staging project ref 및 project/branch metadata를 대조한다. 현재 운영 후보 ref와 달라야 한다.
   새 project 생성은 이번 작업에서 수행하지 않았다. 비용 발생 서비스는 별도 선택/확인 후 준비한다.
2. ignored `.env.assessment-staging`에 서버 전용 환경을 설정한다. 키를 채팅, 명령 인자, 문서, Git에 넣지 않는다.

   ```text
   ASSESSMENT_IMPORT_ENV=staging
   ASSESSMENT_IMPORT_URL=https://<confirmed-staging-ref>.supabase.co
   ASSESSMENT_STAGING_PROJECT_REF=<confirmed-staging-ref>
   ASSESSMENT_SERVICE_ROLE_KEY=<server-only credential>
   ```

3. staging migration history/schema snapshot/bucket/grants를 기록하고 두 migration을 순서대로 적용한다.
   연결된 운영 CLI target을 그대로 쓰지 않는다. SQL별 migration history와 PostgREST schema cache를 확인한다.
4. 기존 `scripts/assessment-rules.mjs`로 validate → upload(upsert:false) → import를 실행한다.
   package는 `data/assessment-rules/samdo-2026-v1.7.json`, 원문은 사용자 제공 HWP다.
   업로드 전과 trusted download 후 SHA-256 일치를 확인한다.
5. 미승인 snapshot에서는 approved_at=null, is_active=false, source_status=DRAFT_SOURCE_VERIFIED를 확인한다.
   anon의 table/RPC 조회와 write/approve/activate 거부, private Storage 접근 거부를 실제 HTTP로 검증한다.
6. CLI review는 검수 artifact를 저장한다. approve가 fingerprint 일치 확인 후 review record와 approved_at을 함께 기록한다.
   검수와 DB approval record 생성 시점을 혼동하지 않는다.
7. 별도 staging QA version으로 stale fingerprint/미승인 activation/version conflict를 검증한다.
   승인된 Samdo 원본을 변경하거나 삭제해서 테스트하지 않는다.
8. approve 이후에도 inactive set은 anon에서 보이지 않아야 한다. activate 이후에만 active/public 조회를 검증한다.
9. 실제 Supabase client로 DatabaseRuleRepository를 구성하여 ruleSemantics, sourceStatus, stage/score,
   evidence.documentId → document.sha256/storagePath를 package와 비교한다.
10. 별도 프로세스의 공개 staging URL/anon key만으로 Expo를 `--clear` export한다. 서버 환경 파일을 앱 export에 로드하지 않는다.
    현재 `.env`/CLI linked ref를 staging으로 덮어쓰면 importer의 production guard에 걸리므로 그대로 유지한다.
11. Chrome viewport 390×844를 로드 전 설정하고 Home → 공고 선택 → 질문 → 결과를 청년/신혼/생애최초 각각 검사한다.
    청년9/9, 신혼 실제 stage/score, 생애최초 무가점 및 검토본 안내를 확인한다.
    네트워크 host가 실제 staging인지 증거를 남기고 ineligible/missing과 오류 상태도 확인한다.
12. 합성 QA 객체와 immutable versions는 자동 삭제하지 않는다. 비공개·비활성으로 보존하거나 별도 disposable staging을 사용한다.
    테스트 데이터 잔존 목록과 Samdo 활성 상태를 보고한다.

## 7. Production 적용 계획 (이번에는 실행 금지)

Staging E2E와 별도의 production 변경 승인을 받은 뒤 진행하는 runbook이다.
현재 import CLI는 production endpoint를 차단한다. 이 guard를 제거하거나 staging으로 위장해서 우회하지 않는다.
운영 실행 전에는 승인된 trusted backend release 경로와 대상별 권한을 별도로 마련해야 한다.

1. 원격 schema/migration history, 기존 active version, bucket/policy/grants snapshot 및 복구 가능한 DB backup을 준비한다.
   DB backup이 원문 파일 백업을 대신하지 않으므로 Storage 원본과 SHA 목록을 별도로 보존한다.
2. 검토된 두 assessment migrations만 순서대로 적용한다. 기존 기능 table이나 auth 정책을 변경하지 않는다.
3. 각 단계에서 migration history, indexes/FK/check, RLS/grants, RPC EXECUTE 및 private bucket을 확인한다.
4. 승인된 운영 경로에서 HWP를 새 document UUID path로 업로드하고 SHA 검증 후 기존 lifecycle 서비스를 호출한다.
5. import → 원문/검토 snapshot 대조 → approve → activate 순서를 유지한다. 운영 등록도 DRAFT_SOURCE_VERIFIED다.
6. anon과 trusted server를 분리하여 read/write/storage 권한을 검사하고 세 유형 browser smoke 및 기존 기능 회귀를 수행한다.
7. 실패 시 신규 노출을 중단한다. 미승인 공개/anon write/Storage 원문 공개/잘못된 규칙·버전/가점 불일치를 중단 조건으로 삼는다.

복구 방침:

- 신규 활성화 전 실패: 공개하지 않고 private/inactive 상태로 보존한다. Storage 업로드와 DB transaction은 별개라
  import 실패 시 원문이 남을 수 있다. 참조 상태를 확인하기 전에 자동 삭제/재시도하지 않는다.
- 활성화 후 실패: 승인된 trusted 운영 절차로 해당 set을 비공개·비활성화한다.
  이전 승인 버전이 있으면 expected-active를 확인해 원복하고, 없으면 unavailable 상태를 유지한다.
- 승인된 rule/document/review는 append-only 제약을 지킨다. DROP/역방향 destructive migration으로 되돌리지 않는다.
- 보안 정책 문제는 신규 read 경로를 차단한 상태에서 forward-fix migration으로 수정한다.
- timeout은 서버 commit 여부가 불명확하므로 UUID/snapshot/active 상태를 먼저 조회한다.
- 앱도 필요하면 이전 승인 배포로 복구하되 reference fallback은 사용하지 않는다.

## 8. 다음 자동화 단계

이번 staging 성공 기준이 아직 충족되지 않았으므로 crawler/AI extraction 구현으로 넘어가지 않는다.
Staging 검증 후 수집 worker는 원문 저장/metadata 생성, extraction worker는 schemaVersion=1 package 생성을 맡고
기존 validateImportPackage/createRuleLifecycle을 재사용할 수 있다. 승인·활성화는 자동 수집과 분리한다.
사용자 요청은 DB + deterministic evaluator를 사용하고 원문 전체를 요청마다 LLM에 보내지 않는다.

참고: [Supabase private bucket 접근 모델](https://supabase.com/docs/guides/storage/buckets/fundamentals),
[기존 import 명령과 보안 경계](./assessment-rule-import-lifecycle.md).
