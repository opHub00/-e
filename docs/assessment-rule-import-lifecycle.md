# Rule import / review / approval / activation

## 구현 상태와 제한

**후속 업데이트:** 사용자 제공 HWP를 확보하여 삼도이동 package와 실제 규칙 검증을 추가했다. 아래 원문 부재 설명은 `5f9d4a8` 시점의 기록이다. 현재 상태는 [삼도이동 명세](./samdo-assessment-rule-spec.md)와 [원문 상태](./samdo-assessment-source-status.md)를 따른다.

- 시작 HEAD `b5b64ae`, `feature/assessment-rule-db`, clean. 작업 브랜치 `feature/assessment-rule-import`.
- 기존 schema/순수 evaluator/RuleRepository/Claude UX를 유지한다. 앱 코드와 runtime fixture는 변경하지 않는다.
- 이번 도구는 Node 서버용이며 새로운 의존성을 추가하지 않는다. 이미 설치된 Supabase JS를 재사용한다.
- 운영 프로젝트에 migration이나 데이터를 적용하지 않았다. push/배포도 하지 않았다.
- 로컬 Docker/Podman과 별도 staging 설정이 없어 실제 Supabase/PostgREST/Storage API 검증은 미완료다.
- 격리 PGlite PostgreSQL에서 실제 migration SQL, service_role import/승인 RPC, anon 조회, DatabaseAssessmentRuleRepository와 evaluator를 검증한다.
- 사용한 검증 문서는 **합성 engineering fixture**다. 삼도이동 HWP 원문이 없으므로 삼도이동 DRAFT_SOURCE_VERIFIED package와 실제 공고 browser ELIGIBLE은 미완료다.
- 관련 원문 상태: [삼도이동 원문 확보 상태](./samdo-assessment-source-status.md).

## 구성

| 파일 | 역할 |
| --- | --- |
| `features/applicationAssessment/server/importPackage.ts` | Import JSON 구조와 domain 규칙 검증. network 이전 실패 |
| `features/applicationAssessment/server/lifecycle.ts` | importer/review/approve/activate 공용 서비스. CLI·후속 worker가 공유 |
| `features/applicationAssessment/server/importTarget.ts` | local/staging 대상 제한 |
| `scripts/assessment-rules.mjs` | Node CLI, 원문 hash 검증, private upload, RPC 호출 |
| `supabase/migrations/20260915112848_assessment_rule_import_lifecycle.sql` | 서비스 전용 transaction RPC 4개 |
| `scripts/check-assessment-import.mjs` | 격리 PostgreSQL lifecycle·판정 검사 |

## Import schema v1

`ImportPackage` TypeScript 타입과 `validateImportPackage`가 실행 가능한 계약이다. 앱이 import JSON을 직접 읽지 않는다.
알려지지 않은 필드는 무시하지 않고 거부한다. 최대 JSON 파일 2 MB, 규칙 수 1,000개.

| 경로 | 필수 내용 |
| --- | --- |
| `schemaVersion` | 현재 `1` |
| `announcement` | `id`, `source`, `externalId`, `housingManagementNumber`, `title`, `publisher`, `announcementDate`, `regionCode`, `regionName`, `sourceUrl` |
| `document` | `id`, `documentType`, `storagePath`, `fileName`, `mimeType`, `versionLabel`, `sha256`, `isOfficial`, `sourceUrl`, `publishedAt` |
| `ruleSet` | `id`, `version`, `sourceStatus`, `effectiveDate`, `config` |
| `rules[]` | `ruleKey`, `supplyType`, `stage`, `category`, `config`, `evidence` |
| `rules[].evidence` | `id`, `documentId`, `source`, `section`, `label`, `tableLabel`, `pageNumber`, `textExcerpt`, `sourceUrl`, `locator` |

명시적 null 허용 필드: externalId, housingManagementNumber, regionCode, sourceUrl, publishedAt,
자격 규칙의 stage, evidence의 tableLabel/pageNumber/textExcerpt/sourceUrl.
document ID/SHA-256/문서 버전은 반드시 있어야 한다. page를 모르면 null이며 0으로 채우지 않는다.
publishedAt은 이번 package schema에서 `YYYY-MM-DD` 또는 null이다. DB에는 timestamp로 저장한다.
정밀 게시 시각이 필요하면 package schema를 확장한다.

ruleSet.config는 기존 `parameters` + 순서가 있는 supplies/rule-key manifest를 그대로 사용한다.
조건 config는 `{label, expression, documents, onFailure?}`, 점수 config는 `{label, fact, bands}`다.
지원 operator/fact, 단계 순서, 중복/누락 rule, 배점 구간, evidence 문서 일치는 기존 decoder를 재사용해 검사한다.
ELIGIBILITY/STAGE/SCORE category를 column으로 저장하고, 가점 없는 단계는 scores:null을 유지한다.

`packageToWire`와 검수 validation은 decoder 재사용을 위해 메모리에서만 공개 플래그를 채운다.
이 값들은 **DB write나 client 응답으로 사용하지 않는다**. DB import RPC는 승인·공개·활성 플래그를 입력으로 받지 않는다.

기존 `export:assessment-reference` 출력은 이전 wire fixture이며 이 import package와 다르다.
이를 sourceStatus만 바꿔 import하지 않는다. 원문 검증과 명시적 document metadata가 먼저 필요하다.

## 환경

기본 앱 환경이나 linked production project를 import target으로 자동 사용하지 않는다.
아래 값은 별도의 ignored env 파일 또는 서버 secret 환경에 설정한다. 키는 command argument에 넣지 않는다.

```text
ASSESSMENT_IMPORT_ENV=local
ASSESSMENT_IMPORT_URL=http://127.0.0.1:54321
ASSESSMENT_SERVICE_ROLE_KEY=<local service role key>
```

staging은 `ASSESSMENT_IMPORT_ENV=staging`과 `ASSESSMENT_STAGING_PROJECT_REF`가 추가로 필요하며
URL host가 해당 ref의 `https://{ref}.supabase.co`와 일치해야 한다.
앱 `.env`, `.env.local`, 현재 EXPO_PUBLIC_SUPABASE_URL 및 linked-project ref의 원격 host는 보수적으로 운영 대상으로 간주하여 차단한다.
따라서 import 전용 staging env를 쓰고 운영 checkout의 app/linked 설정을 staging으로 덮어쓰지 않는다.
loopback local endpoint는 앱의 local 설정과 같아도 허용한다. production override 옵션은 없다.
staging 키를 사용하더라도 anon/authenticated 자격이면 DB의 EXECUTE 권한 검사에서 거부된다.

Node 내장 env-file 예시:

```powershell
node --env-file=.env.assessment-local --experimental-strip-types scripts/assessment-rules.mjs --help
```

검증된 staging project가 아직 없으므로 위 예시를 실제 프로젝트에 실행하지 않았다.

## 실행 순서

### 1. 구조 검사

```powershell
npm run assessment:rules -- validate data/assessment-rules/announcement.json
```

`VALID_STRUCTURE_ONLY`는 법적 규칙의 검증이나 승인을 뜻하지 않는다.
sourceStatus를 도구가 추론/승격하지 않는다. 추출 worker가 만든 미대조 규칙은 REFERENCE를 사용한다.
실제 검토본 대조가 끝났을 때만 DRAFT_SOURCE_VERIFIED package를 만들 수 있다.

### 2. 원문 업로드

환경을 로드한 동일 CLI로:

```text
upload PACKAGE.json --document ORIGINAL.hwp
```

로컬 파일 SHA-256이 package와 일치하는지 확인한 뒤 비공개 bucket에 `upsert:false`로 업로드한다.
50 MB를 초과하는 원문은 거부한다. 경로는 `{year}/{announcementUuid}/{documentUuid}/original.hwp` 형식이다.
다른 버전은 새 document UUID/path로 등록한다. 기존 객체를 덮어쓰지 않는다.

### 3. Atomic DB import

```text
import PACKAGE.json
```

먼저 private Storage 원문을 다운로드하여 SHA-256을 다시 확인한다.
그 다음 `import_assessment_rule_package` 한 호출로 announcement/document/rule_set/rules/evidence를 등록한다.
SQL 도중 실패하면 이 호출의 DB 변경이 모두 rollback된다.
동일 canonical announcement/document는 모든 metadata가 같을 때만 재사용하며 덮어쓰지 않는다.
기존 rule set ID/version 충돌은 오류다. 성공 후 서버 검수 snapshot을 다시 읽고 domain semantics 왕복을 검사한다.

**Storage 업로드와 DB transaction은 별개의 단계다.** DB import 실패 시 앞서 업로드한 비공개 원문은 남는다.
이를 성공한 공고 등록으로 취급하지 않는다. 자동 삭제하지 않으며, 같은 파일/metadata로 수정된 import를 시도하거나
운영자가 참조가 없음을 확인한 뒤 별도의 retention 절차로 정리한다.
timeout은 commit 여부가 불명확할 수 있으므로 자동 재시도/삭제를 하지 않는다. rule-set ID로 review snapshot을 조회해 상태부터 확인한다.

### 4. 검수 artifact 저장

```text
review RULE_SET_UUID --out REVIEW.json
```

비공개/비활성 set을 서버 전용 `get_assessment_review_snapshot`으로 읽고 decoder 검증을 수행한다.
원문 metadata, 규칙, evidence, fingerprint를 UTF-8 JSON에 저장한다. 파일 덮어쓰기는 거부한다.
운영자가 원문과 이 artifact를 대조한다. 이 명령만으로 APPROVED review record가 생기지 않는다.

### 5. 승인

```text
approve RULE_SET_UUID --fingerprint SAVED_FINGERPRINT --reviewer REVIEWER_NAME
```

원문 대조를 마친 운영자가 실행한다. RPC는 검수된 fingerprint와 현재 snapshot이 같을 때만
APPROVED review record와 approved_at을 같은 transaction에 기록한다.
fingerprint는 PostgreSQL canonical JSON의 MD5로 계산하는 **동시 수정 감지 토큰**이며 전자서명/원문 hash가 아니다.
원문 자체의 hash는 별도 SHA-256이다. 승인 후 규칙/evidence는 기존 immutable trigger로 보호된다.
reviewer_label은 trusted 서버 운영자 입력이다. 관리자 UI가 생길 때 인증된 관리자 ID 연결을 추가해야 한다.
이 단계까지 client는 읽을 수 없다.

### 6. 활성화

```text
activate RULE_SET_UUID --expected-active none
activate NEXT_RULE_SET_UUID --expected-active PREVIOUS_RULE_SET_UUID
```

승인된 set만 활성화할 수 있다. announcement row lock과 기존 unique index로 하나의 active 버전만 유지한다.
동시에 다른 운영자가 버전을 바꾸면 expected-active 불일치로 실패한다.
기존 active 해제, 새 public/active 설정, announcement PUBLISHED 전환은 한 transaction이다.
그 다음 일반 사용자 `DatabaseAssessmentRuleRepository`에서 조회할 수 있다.
OFFICIAL_VERIFIED로 바꾸는 명령은 없다. source status는 승인된 버전 내용에 포함된다.

## 보안 / 검증 경계

- 새 RPC 4개는 SECURITY INVOKER + 빈 search_path. PUBLIC/anon/authenticated의 EXECUTE를 revoke하고 service_role에만 grant.
- 익명·로그인 사용자는 비공개 review snapshot 접근, import, approve, activate 모두 불가.
- 전사된 규칙의 진실성은 SQL로 증명할 수 없다. 사람의 원문 대조가 필수다.
- CLI와 공용 lifecycle service가 전체 TypeScript schema 검증을 수행한다. SQL은 FK/check/manifest/출처 상태와 transaction 경계를 추가로 검증한다.
- service role은 원래 raw table write가 가능한 trusted context다. 이 secret을 앱/사용자/AI에게 전달하지 않는다.
- 원문 파일과 rule package는 Expo runtime import 경로에 포함하지 않는다.

## 테스트

```powershell
npm run typecheck
npm run test:assessment
npm test
npm run test:assessment-db
npm run test:assessment-import-db
npx expo export --platform web
git diff --check
```

격리 DB 검사는 이전 phase의 ignored `.cache/assessment-sql-check` PGlite 0.5.8 런타임을 재사용한다.
새 환경은 [기존 설치 절차](./application-assessment-data-architecture.md#11-검증)를 따른다.

| 검사 | 검증 내용 |
| --- | --- |
| 기존 assessment 46개 | 기존 evaluator / repository 동작 보존 |
| import unit 16개 | metadata/config/evidence/date/hash/schema, network 이전 거부, 환경 제한, timeout |
| 기존 SQL/RLS 111개 | schema, 권한, immutable, active 버전, Storage 제한 |
| import SQL lifecycle 54개 | service import → review → approve → activate → anon DB repository → engine, rollback, 충돌, stale review, 실패 경로 |

합성 문서로 청년 ELIGIBLE/INELIGIBLE, 신혼 ELIGIBLE, 생애최초 ELIGIBLE·무가점, 데이터 부족 NEEDS_MORE_INFORMATION을 assertion한다.
public DB read에서 돌아온 공급유형·단계·배점·threshold·evidence·sourceStatus·version을 import package와 비교한다.
이는 **실제 삼도이동 판정 검증이 아니다**. 실제 PostgREST의 JSON/role 전환 및 Storage HTTP 동작도 대체하지 않는다.

2026-09-16 재개 후 실행 결과:

- `npm run typecheck`: 통과.
- `npm test`: 전체 통과. assessment 62개(기존 engine 23 + repository 23 + import 16) 포함.
- `npm run test:assessment-db`: 111개 통과.
- `npm run test:assessment-import-db`: 54개 통과.
- CLI `validate`를 합성 JSON 파일로 실행: `VALID_STRUCTURE_ONLY` 확인.
- `npx expo export --platform web`: 통과, `dist` 생성.
- `git diff --check`: 통과.
- 실제 삼도이동 DB import 및 Chrome ELIGIBLE: 원문과 local/staging Supabase 부재로 실행하지 못함.

## Staging / production 적용 전 checklist

1. 명시적으로 지정된 non-production Supabase 마련. 두 assessment migrations를 순서대로 적용.
2. CLI lint, PostgREST schema cache, service RPC/anon 권한, private Storage upload/download를 실제 환경에서 검사.
3. Samdo HWP 직접 대조 → source SHA-256 → verified draft package 작성. 관리번호 매핑이 불확실하면 null 유지.
4. 세 공급유형 실제 경계값 및 특례 review case를 package와 함께 검증.
5. 위 도구로 import·review·approve·activate. 실제 앱을 staging에 연결해 Chrome 390×844 ELIGIBLE flow 확인.
6. 승인된 release에서만 별도의 production migration 적용 절차 수행. 이 CLI는 production write를 허용하지 않는다.
7. 문제 발생 시 잘못된 set을 비공개/비활성화하거나 이전 승인 set을 재활성화. 문서/규칙 이력은 삭제하지 않는다.

## 이후 자동화

Crawler는 수집/원문 업로드와 metadata 생성까지만 담당한다.
Extractor는 이 package 계약에 맞는 미검증 JSON을 생성하고 `validateImportPackage` → 같은 importer를 호출한다.
추출 성공이 승인으로 이어지지 않으며 검수/승인/활성화는 계속 분리한다.
사용자 판정은 기존 DB RuleRepository + deterministic engine을 사용하므로 요청마다 원문을 LLM에 보내지 않는다.
