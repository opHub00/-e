# 제주 행복주택 v2 Admin 검수 연결

상태: `REVIEW_CANDIDATE`, 공개 판정 `INACTIVE`, Staging 미등록. 이 문서는 승인/활성화 기록이 아니다.

## 읽기 경로

- `/admin/console/rules`는 기존 Supabase 관리자 세션을 사용한다.
- 브라우저는 `GET /admin-api/product-v3?reviewCandidate=jeju-v2`에 bearer token을 보낸다.
- 서버는 기존 `get_assessment_review_access` RPC로 `reviewer`/`admin`을 확인한 뒤 저장소의 고정된 후보 manifest, Rule Package, review seed, diff를 검증하고 반환한다.
- 토큰 없음: 401, 권한 없는 인증 사용자: 403, 검수자/관리자: 200. POST 등 변경 요청: 405.
- 패키지는 공용 NoticePlatform registry에 등록하지 않는다. Admin 읽기는 공개 assessment/RAG/telemetry를 호출하지 않는다.

## 화면에 표시되는 근거

원문 SHA-256, 공고/PDF URL, 소스 상태, 44개 규칙과 적용 범위, 18개 조건·범위·locator 변경, 8개 경계 사례, 8개 파라미터 변경, `NOT_IN_SOURCE` null 5개, 22개 분류 경고 및 원문 위치, 별도의 미해결 blocker 1개를 표시한다. 수치가 없는 셀에 `0` 또는 기본값을 채우지 않는다. 모든 수치는 매 요청 시 고정된 repository artifact에서 구성하고 개수·해시·규칙 관계를 검증한다.

## 검수 결정과 감사의 경계

현재 v2 후보가 Staging `assessment_rule_review_versions`에 없으므로 Admin 화면의 결정은 **저장 불가**다. 브라우저의 임시 선택을 승인으로 오해하지 않도록 선택/저장 컨트롤을 열지 않는다. 기존 운영 검수 콘솔의 `mutate_assessment_rule_review` RPC는 인증, revision 검사, 변경과 `assessment_rule_review_audit_log` 기록을 한 DB transaction에서 수행한다. 감사 insert 실패 시 transaction 전체가 실패한다. 이 경로로 가려면 별도 승인 아래 원문·Rule Package·44-rule seed를 Staging에 등록하고, 동일 SHA/RuleSet ID를 확인해야 한다.

등록 후 검수 action 매핑을 별도로 검토해야 한다. 기존 RPC의 `START_REVIEW`, `REVIEW_EVIDENCE`, `REJECT_RULE`, `RESOLVE_UNRESOLVED`는 각각 검수 시작·근거 상태·규칙 반려·미해결 항목 처리에 해당한다. 후보 전체 반려, 개별 warning의 결정/메모, `RESOLVED_WITH_SOURCE`와 `RESOLVED_WITH_SCOPE_DECISION`의 typed provenance는 현재 RPC에 직접 대응하지 않는다. 이 네 항목을 무리하게 기존 `reason`에 우겨 넣거나 임시 저장소를 쓰지 않는다. Staging DB contract를 확장해 typed decision과 immutable audit를 검증한 뒤 UI action을 열어야 한다.

## 게이트

- `JEJU_V2_ADMIN_REVIEW_READY`: 읽기 검수는 가능하지만 결정/감사 저장이 없어 전체 운영 검수는 NO-GO.
- `JEJU_V2_STAGING_REGISTRATION_READY`: 후보 자료/검증 계약은 준비됨. 실제 등록은 별도 승인 필요.
- `JEJU_V2_ACTIVATION_READY`: 미해결 blocker, 22개 경고의 검수, 44개 rule review, source verification이 끝나기 전까지 NO-GO.

Staging DB, Production DB, 배포와 환경변수는 이번 작업에서 변경하지 않는다.
