# Rule Review Staging

## 목적과 안전 경계

관리자 Rule Review를 InMemory 개발 저장소와 같은 domain contract로 Supabase에 저장한다. 원격 변경은 세 값이 모두 일치할 때만 허용한다.

- `WANPANE_ENV=staging`
- `SUPABASE_STAGING_PROJECT_REF=<명시된 staging ref>`
- `SUPABASE_STAGING_URL=https://<동일 ref>.supabase.co`

`SUPABASE_PRODUCTION_PROJECT_REF`와 같거나 환경이 `production`/`unknown`이면 명령이 실패한다. 클라이언트도 `EXPO_PUBLIC_WANPANE_ENV`, URL, staging ref를 다시 검사한다. service-role key는 `EXPO_PUBLIC_*`에 둘 수 없다.

현재 저장소에는 확인된 staging ref가 없으므로 migration과 원격 테스트는 실행하지 않았다.

## 구성

- `RuleReviewConsole → ReviewGateway → RuleReviewRepository`: UI가 transport나 Supabase client를 직접 알지 않는 canonical 경계
- `ReviewGateway`: load의 `READY/AUTH_REQUIRED/FORBIDDEN/OFFLINE/FAILED`와 commit의 `SAVED/STALE/AUTH_EXPIRED/OFFLINE/REJECTED/FAILED`를 명시적으로 변환
- `SupabaseRuleReviewRepository`: 로그인한 사용자의 JWT로 read/mutation RPC 호출
- `assessment_review_members`: `reviewer`/`admin` 역할의 최소 allow-list
- `load_assessment_rule_review_workspace`: UI DTO 전체를 읽는 권한 검사 RPC
- `mutate_assessment_rule_review`: revision lock, 변경, audit, revision 증가를 한 transaction에서 수행
- `activate_reviewed_assessment_rule_set`: admin 권한, revision, DB activation gate를 같은 transaction에서 재검사
- `InMemoryRuleReviewRepository`: 테스트와 명시적 dev seed 전용

브라우저는 review table을 직접 읽거나 쓰지 않는다. `anon`과 일반 authenticated 사용자는 table 권한이 없고 RPC 내부의 `auth.uid()` allow-list 검사를 통과해야 한다.

성공한 mutation RPC는 변경·audit·revision 증가와 같은 transaction에서 최종 workspace를 반환한다. gateway는 이 값을 authoritative snapshot으로 채택하며 성공 뒤 두 번째 read를 하지 않는다. `STALE_REVIEW_REVISION`일 때만 최신 snapshot을 별도로 읽어 사용자 draft와 함께 유지하고 자동 merge하지 않는다. draft는 사용자와 rule set으로 만든 필수 session key에 격리된다. 로그아웃·계정 전환 시 이전 workspace를 즉시 제거하지만 같은 사용자의 `TOKEN_REFRESHED`/`USER_UPDATED`는 편집 화면을 다시 로드하지 않는다. offline mutation은 queue나 background sync 없이 거절하고 사용자가 명시적으로 다시 시도해야 한다.

SQL의 대문자 `RAISE EXCEPTION` token이 transport error code의 canonical source다. `AUTH_REQUIRED`, `FORBIDDEN`, `STALE_REVIEW_REVISION`은 별도 auth/concurrency outcome으로 변환하고 나머지 deterministic guard는 `REJECTED`로 보존한다. 알 수 없는 backend 오류만 `FAILED`가 된다. Migration과 TypeScript inventory의 drift는 로컬 테스트가 차단한다.

## Web build profiles and cache isolation

브라우저 build는 다음 공식 명령을 사용한다.

| 용도 | 명령 | public environment | 산출물 | Metro cache namespace |
|---|---|---|---|---|
| Local development | `npm run web` | 개발 shell에서 명시 | 개발 서버 | `default` 또는 명시한 namespace |
| Playwright E2E | `npm run test:e2e` | `test` | `.e2e/dist` | `e2e` |
| Staging export | `npm run build:web:staging` | `staging` | `.staging/dist` | `staging` |
| Production export | `npm run build:web` | `production` | `dist` | `production` |

`npm run build:web:staging`은 `.env.staging.local`(또는 `WANPANE_STAGING_ENV_FILE`)에서 staging URL·ref·anon key·production ref·`RULE_REVIEW_STAGING_RULE_SET_ID`만 읽어 `EXPO_PUBLIC_*`로 옮긴다. URL과 ref 불일치, staging=production, anon이 아닌 key는 build 전에 실패한다. service-role·access token·write 스위치는 build 환경에서 제거된다. 별도 wrapper는 필요 없다.

E2E runner는 child process에만 `EXPO_PUBLIC_WANPANE_ENV=test`와 비밀이 아닌 fixture Supabase endpoint를 전달한다. 부모 `process.env`는 변경하지 않는다. E2E 산출물과 Metro transform/file-map cache는 staging 및 production과 별도 디렉터리를 사용한다. 공식 staging/production wrapper는 매번 clean export를 수행하며, 상속된 test environment 또는 E2E fixture URL/key를 발견하면 `TEST_ENV_NOT_ALLOWED_IN_RELEASE_BUILD`로 중단한다. 환경값을 바꾸었을 때 raw `npx expo export`를 배포 명령으로 사용하지 않는다.

Rule Review Playwright specs는 Supabase network request가 0건임을 직접 확인한다. 일부 다른 specs는 필요한 endpoint를 route interception으로 대체한다. 모든 브라우저 요청이 일괄 interception된다고 가정하지 않는다. shell에서 E2E 환경변수를 따로 설정할 필요는 없다. staging은 server 측 `WANPANE_ENV=staging`과 client build의 `EXPO_PUBLIC_WANPANE_ENV=staging`을 각각 명시해야 한다. 환경이 없거나 알 수 없는 값이면 local review seed와 test fault plan은 fail-closed된다.

`npm run test:build-isolation`은 release/E2E 순서를 바꾸어 가며 전용 산출물을 만들고, 마지막 release 및 staging-like bundle에 E2E fixture 값이나 service-role 표식이 없는지 검사한다. 이 검사는 실제 Supabase에 연결하거나 원격 요청을 보내지 않는다.

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
