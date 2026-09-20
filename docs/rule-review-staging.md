# Rule Review Staging

## 목적과 안전 경계

관리자 Rule Review를 InMemory 개발 저장소와 같은 domain contract로 Supabase에 저장한다. 원격 변경은 세 값이 모두 일치할 때만 허용한다.

- `WANPANE_ENV=staging`
- `SUPABASE_STAGING_PROJECT_REF=<명시된 staging ref>`
- `SUPABASE_STAGING_URL=https://<동일 ref>.supabase.co`

`SUPABASE_PRODUCTION_PROJECT_REF`와 같거나 환경이 `production`/`unknown`이면 명령이 실패한다. 클라이언트도 `EXPO_PUBLIC_WANPANE_ENV`, URL, staging ref를 다시 검사한다. service-role key는 `EXPO_PUBLIC_*`에 둘 수 없다.

현재 저장소에는 확인된 staging ref가 없으므로 migration과 원격 테스트는 실행하지 않았다.

## 구성

- `SupabaseRuleReviewRepository`: 로그인한 사용자의 JWT로 read/mutation RPC 호출
- `assessment_review_members`: `reviewer`/`admin` 역할의 최소 allow-list
- `load_assessment_rule_review_workspace`: UI DTO 전체를 읽는 권한 검사 RPC
- `mutate_assessment_rule_review`: revision lock, 변경, audit, revision 증가를 한 transaction에서 수행
- `activate_reviewed_assessment_rule_set`: admin 권한, revision, DB activation gate를 같은 transaction에서 재검사
- `InMemoryRuleReviewRepository`: 테스트와 명시적 dev seed 전용

브라우저는 review table을 직접 읽거나 쓰지 않는다. `anon`과 일반 authenticated 사용자는 table 권한이 없고 RPC 내부의 `auth.uid()` allow-list 검사를 통과해야 한다.

## 적용 순서

1. staging project ref를 production ref와 대조한다.
2. staging DB backup 및 schema snapshot을 보관한다.
3. `npm run check:staging:rule-review`로 대상 identity를 확인한다. 이 명령은 write하지 않는다.
4. 기존 registry/import/review migration 뒤에 `20260920143000_assessment_rule_review_staging.sql`을 적용한다.
5. migration history, functions, grants, table RLS를 확인한다.
6. Auth 사용자의 UUID를 `assessment_review_members`에 service-side 관리 작업으로 등록한다.
7. 기존 assessment import lifecycle로 Samdo candidate/rule set을 staging에만 준비한다.
8. `RULE_REVIEW_STAGING_ALLOW_WRITE=true`를 한 번만 명시한 server shell에서 `npm run seed:staging:rule-review`로 review version/candidates를 생성한다. 이 script만 dev seed를 읽으며 앱 bundle은 import하지 않는다.
9. `npm run test:staging:rule-review`로 reviewer read contract를 확인한다.
10. 두 브라우저 세션으로 stale revision을 확인한 후 review lifecycle을 수행한다.

## 권한

| 주체 | review read/mutation | activate | raw table |
|---|---:|---:|---:|
| anon | 금지 | 금지 | 금지 |
| 일반 authenticated | 금지 | 금지 | 금지 |
| reviewer | RPC review 허용 | 금지 | 금지 |
| admin | RPC review 허용 | RPC 허용 | 금지 |
| service_role | server maintenance | server maintenance | 허용 |

역할은 `user_metadata`를 신뢰하지 않는다. DB allow-list와 `auth.uid()`를 사용한다.

## 동시성, 감사, 불변성

모든 mutation은 화면이 읽은 `expectedRevision`을 전달한다. DB가 review version row를 잠근 뒤 값이 다르면 `STALE_REVIEW_REVISION`으로 종료한다. Audit row는 같은 transaction에 append되며 기존 trigger가 update/delete를 차단한다. AI original candidate/hash는 기존 immutable trigger로 보호한다.

문서 hash 변경은 같은 공고에 등록된 document hash만 허용하며 lifecycle을 `REVALIDATION_REQUIRED`로 바꾼다. DRAFT에서 OFFICIAL로 바뀌어도 이전 approval을 승계하지 않는다.

## 활성화와 상담

클라이언트의 blocker 계산은 설명용이다. 활성화 RPC는 `can_activate_assessment_rule_version()`을 서버에서 다시 실행하고, admin·revision·current document를 검증한다. `canActivate=true`만으로 자동 활성화하지 않는다.

상담 runtime은 이미 `AssessmentRuleRepository.getActiveRuleSet()`과 `read_assessment_rule_set` RPC를 통해 approved + active version만 읽는다. DB unavailable, rule missing, malformed/multiple active state에서 static fixture로 fallback하지 않는 기존 fail-closed 경계를 유지한다.

## Rollback

Staging 검증 실패 시 먼저 애플리케이션의 staging review 연결을 끄고 migration 전 snapshot으로 복원한다. 이미 생성된 review audit은 임의 삭제하지 않는다. 함수와 role table만 되돌려야 한다면 별도 forward migration으로 execute grants를 revoke하고 RPC를 제거한다. production에서 수동 `down` SQL을 즉석 실행하지 않는다.

## Production promotion checklist

1. staging 전체 lifecycle과 두-session concurrency 통과
2. anon/normal/reviewer/admin/service role RLS 결과 기록
3. backup/restore rehearsal
4. service-role client bundle 및 source map 부재 확인
5. migration review와 승인
6. production ref를 별도 명시하고 staging 값 재사용 금지
7. migration 후 read-only smoke
8. reviewer/admin membership 최소 등록
9. candidate import → review → activation smoke
10. rollback 조건: auth bypass, raw table exposure, revision loss, audit mutation, multiple active version 중 하나라도 발생

## 현재 남은 작업

확인된 staging project, reviewer/admin Auth 사용자, staging Samdo rule set이 제공되어야 원격 migration, seed, 실제 persistence/refresh, two-session concurrency, activation 및 consultation round-trip을 실행할 수 있다.
