# Production rule 운영 runbook

대상: production에서 공고 rule을 올리고 검수·활성화·연결하는 운영자.
이 문서의 명령은 **별도 승인 전에는 실행하지 않는다.** 작성 시점에 production에 대한 읽기·쓰기·migration·배포는 0회다.

- production ref: `ypdreeipoxcztbxtiklt`
- staging ref: `krkeiytshxpqojrlrmsx`

## 0. 원칙

- staging DB 행은 복사하지 않는다. 커밋된 원문·패키지로 같은 감사 경로를 production에서 다시 실행한다.
- service-role key는 운영자 로컬 Node 프로세스(`assessment-rules` CLI)에서만 쓴다. 웹 번들, 로그, 커밋에 넣지 않는다.
- production의 모든 CLI 단계는 `--confirm <명령>:<production ref>:<대상>`을 따로 타이핑해야 실행된다. 한 단계의 확인값은 다른 단계에 쓸 수 없다.
- 먼저 `--dry-run`으로 확인한다. dry-run은 어떤 프로젝트에도 연결하지 않고, credential도 필요 없다.
- production에는 reset·reseed·delete 명령이 없다. staging 전용 seed/reset 스크립트는 production 환경을 거부한다.
- `OFFICIAL_VERIFIED`가 아닌 패키지(삼도 VER1.7 = `DRAFT_SOURCE_VERIFIED`)는 `--allow-draft-source <rule set id>` 없이는 upload/import가 거부된다. 이 flag는 "초안 기반으로 공개한다"는 별도 결정을 기록하는 용도이며, 패키지의 source status를 바꾸지 않는다.

## 1. 환경 (운영자 셸, 한 프로세스에만)

```
ASSESSMENT_IMPORT_ENV=production
ASSESSMENT_IMPORT_URL=https://ypdreeipoxcztbxtiklt.supabase.co
ASSESSMENT_PRODUCTION_PROJECT_REF=ypdreeipoxcztbxtiklt
ASSESSMENT_STAGING_PROJECT_REF=krkeiytshxpqojrlrmsx
ASSESSMENT_SERVICE_ROLE_KEY=<production service-role, 화면·로그에 출력 금지>
```

CLI는 다음 경우 연결 전에 거부한다: production ref 누락/형식 오류, staging ref와 같음, URL이 production ref가 아님, 다른 곳에 선언된 production identity와 충돌, credential의 project(`ref` claim)가 다름, credential이 service_role이 아님.

## 2. 순서

| # | 단계 | 명령 (각각 먼저 `--dry-run`) | 실행 주체 |
|---|---|---|---|
| 1 | migration | `supabase db push` (runbook §5 of `wanpane-mvp-rc1.md`, 7개) | 운영자 |
| 2 | 첫 admin | `assessment-rules bootstrap-admin <email> --reason "<사유>" --confirm bootstrap-admin:ypdreeipoxcztbxtiklt:<email>` | 운영자 (service role). admin이 이미 있으면 DB가 거부 |
| 3 | 추가 멤버 | `set_assessment_review_member(email, role, reason)` / `revoke_assessment_review_member(email, reason)` RPC | admin 세션. 모두 audit 기록 |
| 4 | 원문 업로드 | `assessment-rules upload <package> --document <원문> --confirm upload:<ref>:<rule set id>` | 운영자 |
| 5 | import | `assessment-rules import <package> --confirm import:<ref>:<rule set id>` | 운영자 |
| 6 | 검수 열기 | `assessment-rules open-review <rule set id> --package <package> --annotations <annotations> --confirm open-review:<ref>:<rule set id>` | 운영자. 이미 열려 있으면 DB가 거부 |
| 7 | 검수 | `/admin/rule-review?ruleSetId=<rule set id>` | reviewer |
| 8 | 승인 | `assessment-rules review <id> --out review.json` → `assessment-rules approve <id> --fingerprint <fp> --reviewer <이름> --confirm approve:<ref>:<id>` | 운영자 |
| 9 | 활성화 | `/admin/rule-review`의 활성화(admin) 또는 `assessment-rules activate <id> --expected-active none --confirm activate:<ref>:<id>` | admin 권장 (actor 기록) |
| 10 | listing 연결 | `/admin/listing-bindings` | admin. revision 검사 + audit |

DB가 모든 경로에서 검수 gate(`can_activate_assessment_rule_version`)와 승인 여부를 다시 검사한다.

## 3. Web

- Vercel: `buildCommand = npm run build:web:release`.
  - 필수 env: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_PRODUCTION_PROJECT_REF`(또는 `EXPO_PUBLIC_SUPABASE_PRODUCTION_PROJECT_REF`).
  - URL ref가 production ref와 다르거나, key가 anon이 아니거나, target이 비어 있으면 build가 실패한다.
- 로컬 사전 점검(배포 아님, 네트워크 없음):
  `WANPANE_PRODUCTION_ENV_FILE=<production public env file> npm run preflight:web:production` → `.cache/preflight/production-dist`
- runtime guard: production 번들은 URL이 inline된 production ref와 같을 때만 Supabase client를 만든다. staging 번들은 staging ref가 맞고 production ref가 아닐 때만 만든다. 다르면 client가 없고 앱은 fail-closed.
- admin 화면(`/admin/rule-review`, `/admin/listing-bindings`)은 production 번들에서도 열린다. 로그인한 reviewer/admin만 쓸 수 있다. local seed·fault plan은 production/staging에서 동작하지 않는다.

## 4. 멤버십 감사

- `assessment_review_membership_audit_log`: BASELINE(migration 시점 기존 멤버), BOOTSTRAP_ADMIN, GRANT, CHANGE_ROLE, REVOKE.
- append-only trigger가 있어 service role로도 수정·삭제할 수 없다.
- service role은 `assessment_review_members`에 직접 insert/update/delete 할 수 없다. 공식 RPC만 쓴다.
- admin은 자기 자신의 역할을 바꾸거나 회수할 수 없다. 마지막 admin이 스스로 잠기는 일을 막기 위해서다.
