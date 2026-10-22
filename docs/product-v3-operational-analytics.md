# Product V3 운영 Analytics — Staging 준비 계약

이 변경은 migration 파일과 서버 코드를 준비한 것이며 Staging/Production DB에 적용하지 않았다. 현재 `EVENT_ANALYTICS_ENABLED` 기본값은 false다. `real` 수집은 이 브랜치에서 활성화하지 않는다.

## 사건과 프라이버시

`SESSION_STARTED`, `ASSESSMENT_STARTED`, `QUESTION_ANSWERED`, `FACT_MARKED_UNKNOWN`, `ASSESSMENT_COMPLETED`, `RESULT_VIEWED`, `NOTICE_COMPARED`, `COPILOT_USED`, `SIMULATION_RUN`, `RESULT_SAVED`, `QR_CREATED`, `SESSION_COMPLETED`만 허용한다. 데이터베이스에는 랜덤·메모리 전용 익명 세션 UUID, 공고/원문 버전, 공급유형, 판정 상태, 안전한 미해결 범주, 시각, 환경/트래픽 종류, 제한된 턴 수·소요시간 구간·AI mode/fallback reason만 남는다. 이름, 연락처, 생년월일, 정확한 소득·자산, 원본 fact 값, 대화 원문, QR token은 필드 자체가 없다.

브라우저는 `/event-api/analytics`에 이벤트의 발생만 알린다. 환경, 트래픽 종류, 원문 버전, 판정 상태는 지정할 수 없다. 서버가 등록된 공고에서 버전을 찾고 안전한 필드만 다시 만든 뒤 Staging 전용 service-role 경로로 기록한다. `/event-api/assessments`는 기존처럼 서버에서 재판정한 후 공급유형별 결과와 미해결 범주를 만든다. SQL의 `event_id` 기본키와 `on_conflict=event_id`가 재시도 중복을 막는다. 기록 실패는 방문자 결과·상담·QR을 실패시키지 않는다.

익명 세션은 고유 **사람**이 아니다. Dashboard는 상담 세션·판정 세션·완료 세션만 표시한다. 완료율은 공급유형 셀 수가 아니라 판정을 시작한 익명 세션 중 완료 이벤트가 있는 세션의 비율이다. `FACT_MARKED_UNKNOWN`은 동일 세션·범주를 한 번 센다. QA/Staging/Production 및 `qa/internal/beta/real`은 독립 필터다.

## Staging 적용 전 절차

1. 승인된 운영자가 migration chain을 확인한다. 다음 파일은 `supabase/migrations/20261022120000_product_v3_operational_analytics.sql` 하나여야 한다.
2. 승인 후 **Staging ref만** 대상으로 migration을 적용한다. 이 작업에는 DB 적용 권한이 포함되지 않는다. Production ref에 적용하지 않는다.
3. RLS와 grants를 검증한다: `anon`/`authenticated` 읽기·쓰기 거부, `service_role` SELECT/INSERT만 허용. migration의 isolated PGlite 검사는 `node scripts/check-product-v3-analytics.mjs`이다.
4. Staging Preview에서 `EVENT_ANALYTICS_ENABLED=true`, `EVENT_ANALYTICS_ALLOWED_TRAFFIC_TYPES=qa,internal,beta`, `EVENT_ANALYTICS_TRAFFIC_TYPE=qa`, `EVENT_ANALYTICS_COLLECTION_START_AT=2026-10-27T00:00:00+09:00`, `EVENT_ANALYTICS_REQUIRED_NOTICE_VERSION=VER1.8`을 **Preview 범위에서만** 설정한다. 기본은 수집 안 함이다.
5. Admin이 실제 Staging QA 이벤트를 볼 수 있는지 인증된 계정으로 검사한다. `/admin-api/product-v3?analytics=summary&from=YYYY-MM-DD&to=YYYY-MM-DD&environment=staging&trafficType=qa`는 Admin 전용이다. Reviewer는 403이다. migration 전 Dashboard는 `아직 수집 전`으로 표시해야 한다.

## 공식 운영 게이트

`real`은 기본 허용 목록에 없다. 나중에 공식 1.8 원문 게시·해시 검증·Rule Package 승인·공고 ACTIVE가 완료되어 서버의 `sourceDocument.official=true`가 확인되고, 환경이 Production이며 시작시각과 공고 버전이 모두 일치해야만 gate 함수가 허용한다. 현재 두 삼도 공고의 `isOfficial`은 false이고 Production 쓰기 target은 구현하지 않았으므로 `real` 수집은 불가능하다. Production promotion에는 별도 승인, 복구 전략, 서버 측 공식 활성상태 재검증, 남용 방지, 부하/용량 검증이 필요하다.

## 보존 정책

`EVENT_ANALYTICS_RETENTION_DAYS`는 1~3650일의 설정 계약만 준비했다. 보존기간 자체는 아직 결정하지 않았고 자동 삭제 작업도 없다. 운영 활성화 전 법무·개인정보·백업 요구사항과 기간을 결정하고, 삭제 작업을 별도 검수해야 한다. 무기한 보존을 운영 정책으로 간주하지 않는다.

## 한계

현재 Admin 기본 카드에는 Staging QA 최근 7일 세션만 표시한다. 임의 기간·공고·환경·트래픽 비교는 인증된 Admin summary API가 제공한다. 집계는 서버에서 최대 10만 이벤트를 페이지 읽어 계산하므로 공식 운영량이 늘면 DB 측 aggregate 또는 rollup으로 이전해야 한다. 브라우저 발생 이벤트는 악의적 반복 요청을 완전히 차단하지 않으므로 `real` 수집 전에 보호된 세션 발급·rate limit·abuse monitor가 필요하다. 현재는 Preview/Staging QA 계측용이다.
