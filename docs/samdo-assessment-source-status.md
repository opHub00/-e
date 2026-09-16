# 삼도이동 원문 확보 및 검증 상태

2026-09-16 사용자 제공 HWP를 확보했다. 이전 BLOCKED_SOURCE_UNAVAILABLE 상태는 해소됐다.

확보한 원문:
`(VER1.7_부동산원 제출용_공통) 삼도이동 1지구 토지임대부 분양주택 입주자모집공고문.hwp`

직접 확인:

- 경로: `C:/완판e/source/` 아래 위 파일명.
- SHA-256: `bd67d7ee6c9b9dbbe043f9c966679c791185ba0f21ae80050a33a489112e8763`.
- HWP5 파싱: 문단 4,115개. 메모 필드와 메모 ID 대조.
- 상태: DRAFT_SOURCE_VERIFIED. 공식 최종본이 아니다.
- 명세: [samdo-assessment-rule-spec.md](./samdo-assessment-rule-spec.md).
- Import package: `data/assessment-rules/samdo-2026-v1.7.json`, 75개 규칙.

원문 hash를 확인한 뒤 격리 PGlite에서 import → review → approve → activate → anon DatabaseRuleRepository → evaluator 왕복을 검증했다.
지역우선 표 수정 메모, 1인 가구 검토 메모, 관리번호/일정/공급량 미완성 표기는 확정하지 않았다.
pageNumber는 모두 null이며 내부 스트림/record offset을 근거에 보존했다.

남은 검증:

1. 실제 Supabase staging의 Storage/PostgREST 통합.
2. 최종 공고와 검토 메모 해소 여부의 대조.
3. 관리번호 매핑 및 특례·출산완화의 추가 검수.

OFFICIAL_VERIFIED로 승격하지 않았다. housingManagementNumber는 null이며 discovery listing binding도 없다.
원본은 Git 및 앱 번들에서 제외하고 로컬에 보존한다. 운영 DB에는 등록하지 않았다.

브라우저 검증은 실제 앱과 HWP-derived DB 규칙을 사용하되 로컬 HTTP read bridge를 사용한다. 이는 실제 Supabase 서비스 통합 검증과 구별한다.
