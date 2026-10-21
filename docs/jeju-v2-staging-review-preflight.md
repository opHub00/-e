# 제주 v2 Staging 검수 등록 사전 점검 (로컬 전용)

이 단계에서는 **Staging 연결, 등록, 승인, 활성화, 배포를 하지 않는다**. `feature/product-v3-jeju-v2-staging-review`의 계약과 테스트는 향후 승인된 Staging 작업을 준비하기 위한 것이다. 공통 방향 문서의 지정 경로는 이 작업 PC에서 접근할 수 없었다. Git과 현재 코드를 구현 상태의 기준으로 사용했다.

## 오프라인 명령

`npm run preflight:jeju-v2-review`는 두 import package와 v2 manifest·annotation·diff를 로컬에서 비교하고, 예정 작업 및 write blocker를 JSON으로 출력한다. `-- --document <공식 원본 PDF 경로>`를 주면 파일을 최대 50 MB까지 읽어 SHA-256만 비교한다. 어느 형태도 네트워크나 DB에 접속하지 않는다. 원본 PDF는 현재 checkout에 없으므로 기본 실행은 `ORIGINAL_DOCUMENT_BYTES_NOT_VERIFIED`를 유지한다.

고정된 식별자: announcement `902916ae-bb9a-4ddf-a3cc-505d18a20e25`; v1 RuleSet `20b37b91-9edf-479a-a56a-ac9d3b70c424`; v2 RuleSet `bd20aacc-a52b-4fc9-92fe-a70cdb0a170f`; v2 원문 hash `76c89334fb042564569d9856acd073c85a84c425f124474891bdb01303d6404e`. v1/v2는 같은 공고군이지만 문서/RuleSet ID가 다르며 v1은 변경하지 않는다.

## 검수 결정·감사 계약

`jejuV2Decisions.ts`는 `MOVE_TO_IN_REVIEW`, note, rule review/reject, warning, blocker, 원문 공란, scope 결정을 타입별로 분리한다. 모든 결정은 actor(role 포함), action, entity, before/after, timestamp, candidateVersion, reason의 감사 항목을 만든다. 원문 기반 해소에는 후보 문서 hash·locator·excerpt를 요구한다. 공란 셀에는 0/default 결정을 허용하지 않는다. 모든 전이는 후보를 `INACTIVE`, 미승인·비활성으로 유지한다. `LocalCandidateDecisionStore`는 테스트 전용이며 서버리스 저장소가 아니다. 감사 기록 실패나 revision 충돌 시 상태가 바뀌지 않는 테스트를 통과해야 한다.

현재 Staging의 `mutate_assessment_rule_review`는 규칙·근거·unresolved 변경과 감사 insert를 하나의 트랜잭션으로 처리하지만, **22개 warning, 5개 NOT_IN_SOURCE, typed scope/source decision**을 직접 저장할 계약은 없다. 기존 `reason` 문자열 또는 `product_v3_admin_audit_log`에 이를 무리하게 인코딩하지 않는다. 실제 등록 전 승인된 Staging 계정에서 현행 schema·migration history를 읽고, typed decision을 위한 별도 검토된 migration과 원자적 RPC를 준비해야 한다. 새 테이블/RPC에는 최소 권한, RLS, 명시적 grant, non-reviewer 거부, 감사 insert 실패 rollback을 테스트한다. 이 migration은 이 로컬 단계에서 만들거나 적용하지 않았다.

## Staging 연결 후 실행 게이트

1. 승인 계정으로 Staging ref `krkeiytshxpqojrlrmsx`와 Production ref `ypdreeipoxcztbxtiklt`의 분리, Preview target, 관리자 권한을 확인한다. Production은 읽기/쓰기 대상이 아니다.
2. Staging의 해당 공고·문서·v1 RuleSet·v2 RuleSet/검수 workspace 존재 여부와 migration history를 **읽기 전용**으로 확인한다. 이미 있으면 중복 import/seed를 하지 않는다.
3. 원본 PDF bytes와 private storage 파일의 hash를 고정 hash와 대조한다. 다르면 중단한다.
4. 검토된 schema/RPC 적용과 백업/복구 경로를 별도로 승인받는다. 이후에만 기존 import/seed 경로로 v2를 독립 등록하고, 서버 검증된 reviewer/admin의 audited transition으로 `IN_REVIEW`에 둔다. `APPROVED`, `ACTIVE`, public binding은 금지한다.
5. 실제 세션으로 401/403/200, 규칙 44·변경 18·경고 22·공란 5·blocker 1, decision/audit 원자성, v1 불변, 공개 assess/compare/presentation/RAG/discovery/Copilot 격리를 확인한다.

현재 결과는 **로컬 계약·사전 점검 준비**일 뿐 `JEJU_V2_ADMIN_REVIEW_READY` 또는 `JEJU_V2_STAGING_REVIEW_READY`의 GO 증거가 아니다. blocker의 근거 판단 없이 `JEJU_V2_ACTIVATION_READY`는 NO-GO다.
