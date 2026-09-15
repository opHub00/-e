# 삼도이동 실제 import 준비 상태

**BLOCKED_SOURCE_UNAVAILABLE — 이 문서는 규칙 명세나 검증된 공고가 아니다.**

요청된 원문:
`(VER1.7_부동산원 제출용_공통) 삼도이동 1지구 토지임대부 분양주택 입주자모집공고문.hwp`

2026-09-16 작업 재개 시 확인:

- 저장소 및 `C:/완판e` 내 HWP/HWPX 파일 없음.
- Downloads에서 삼도/VER1.7 이름의 파일 없음.
- `docs/samdo-assessment-rule-spec.md` 없음.
- 사용자가 언급한 외부 대화의 첨부파일 경로/다운로드 URL은 현재 작업에 제공되지 않음.
- 기존 `samdoReferenceRules`는 REFERENCE_ONLY이며 실제 금액/배점의 source of truth로 사용하지 않음.

따라서 `data/assessment-rules/samdo-2026-v1.7.json`을 만들거나 DRAFT_SOURCE_VERIFIED로 등록하지 않았다.
파일 hash, 근거 페이지, 관리번호별 지구 매핑을 임의로 만들지 않았다.
이전 메시지의 규칙 수치는 원문 대조 체크리스트로만 활용할 수 있으며 직접 검증 완료를 뜻하지 않는다.

다음 입력이 필요하다:

1. 접근 가능한 HWP 원본의 파일 경로 또는 다운로드 URL.
2. 가능하다면 원문과 함께 추출 텍스트/표를 제공하되 HWP의 버전 및 SHA-256을 확인할 것.
3. 명확한 원문 section/table/label로 청년·신혼·생애최초 규칙을 대조할 것.
4. 공고일/가구원수별 금액/특례/무주택기간/해외체류 규칙과 관리번호 매핑을 확인할 것.

검토본을 직접 대조한 뒤에만 DRAFT_SOURCE_VERIFIED package를 작성한다.
공식 최종본이 아니므로 OFFICIAL_VERIFIED로 승격하지 않는다.
관리번호가 명시적으로 매핑되지 않으면 housingManagementNumber는 null로 두고 discovery listing binding도 만들지 않는다.

import lifecycle의 합성 문서 테스트 결과는 이 공고의 신청 가능 여부·가점·실제 browser 성공을 입증하지 않는다.
