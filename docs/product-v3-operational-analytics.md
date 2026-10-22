# Product V3 운영 Analytics — Staging 준비 계약

이 변경은 migration 파일과 서버 코드를 준비한 것이며 Staging/Production DB에 적용하지 않았다. 현재 `EVENT_ANALYTICS_ENABLED` 기본값은 false다. `real` 수집은 이 브랜치에서 활성화하지 않는다.

## 사건과 프라이버시

`SESSION_STARTED`, `ASSESSMENT_STARTED`, `QUESTION_ANSWERED`, `FACT_MARKED_UNKNOWN`, `ASSESSMENT_COMPLETED`, `RESULT_VIEWED`, `NOTICE_COMPARED`, `COPILOT_USED`, `SIMULATION_RUN`, `RESULT_SAVED`, `QR_CREATED`, `SESSION_COMPLETED`만 허용한다. 데이터베이스에는 랜덤·메모리 전용 익명 세션 UUID, 공고/원문 버전, 공급유형, 판정 상태, 안전한 미해결 범주, 시각, 환경/트래픽 종류, 제한된 턴 수·소요시간 구간·AI mode/fallback reason만 남는다. 이름, 연락처, 생년월일, 정확한 소득·자산, 원본 fact 값, 대화 원문, QR token은 필드 자체가 없다.

브라우저는 `/event-api/analytics`에 이벤트의 발생만 알린다. 환경, 트래픽 종류, 원문 버전, 판정 상태는 지정할 수 없다. 서버가 등록된 공고에서 버전을 찾고 안전한 필드만 다시 만든 뒤 Staging 전용 service-role 경로로 기록한다. `/event-api/assessments`는 기존처럼 서버에서 재판정한 후 공급유형별 결과와 미해결 범주를 만든다. SQL의 `event_id` 기본키와 `on_conflict=event_id`가 재시도 중복을 막는다. 기록 실패는 방문자 결과·상담·QR을 실패시키지 않는다.

익명 세션은 고유 **사람**이 아니다. Dashboard는 상담 세션·판정 세션·완료 세션만 표시한다. 완료율은 공급유형 셀 수가 아니라 판정을 시작한 익명 세션 중 완료 이벤트가 있는 세션의 비율이다. `FACT_MARKED_UNKNOWN`은 동일 세션·범주를 한 번 센다. QA/Staging/Production 및 `qa/internal/beta/real`은 독립 필터다.

## Analytics 계약 v2

기존 `resultViews`·`resultSaves`·`qrCreates`는 **이벤트 횟수**로 유지한다. 별도 `resultViewSessions`·`resultSaveSessions`·`qrCreateSessions`는 같은 이벤트를 여러 번 낸 익명 세션을 한 번만 센다. `supplyTypeAssessmentDistribution`은 공급유형별 COMPLETE/NEEDS_USER_INPUT/INELIGIBLE/UNAVAILABLE 판정 셀 수이며 당첨확률이 아니다. `generatedAt`은 서버 집계 시각, `lastEventAt`은 현재 필터에 맞는 마지막 이벤트 시각(없으면 null)이다. 이전 기간 비교에는 판정 시작, 결과 조회·저장·QR 세션, NEEDS_USER_INPUT 셀, fallback 이벤트도 포함한다.

기간 `from`·`to`는 **Asia/Seoul 달력 날짜**다. 각 시작일 00:00 KST부터 종료일 다음 날 00:00 KST 직전까지 조회하고, 미래 이벤트는 집계 시각 이후에 포함하지 않는다. UI의 `today`/`7d`/`30d` 계산과 같은 날짜 경계를 쓴다. 임의 timezone 파라미터는 받지 않는다.

서버 summary는 `collection.collectionState`(PRE_LAUNCH/READY_NOT_STARTED/COLLECTING/PAUSED/MISCONFIGURED), `officialDataReady`, `requiredNoticeVersion`, `collectionStartAt`을 함께 반환한다. UI는 로컬 기본 env로 공식 게시 여부를 결정하지 말고 이 서버 값을 사용해야 한다. 현재 보유 원문은 공식 게시·검증 전이므로 `officialDataReady=false`다. Claude UI 브랜치의 기존 필드는 변경하지 않았으며, 통합 시 이 additive 필드로 pre-launch 안내를 전환해야 한다.

### 전역 상태와 조회 필터 분리

`globalCollection` 및 `globalCollectionState`·`globalOfficialDataReady`·`globalCollectionStartAt`·`globalRequiredNoticeVersion`·`globalTargetEnvironment`·`globalAllowedTrafficTypes`는 서버 설정과 공식 ACTIVE 원문 metadata만으로 계산한다. Admin의 공고·환경·트래픽 필터나 해당 필터의 이벤트 수를 이 상태에 사용하지 않는다. 기존 UI용 `collection`은 같은 전역 상태의 호환 alias다. `currentQuery`는 별도로 선택된 환경·트래픽과 `AVAILABLE`/`NO_EVENTS`/`STORE_UNAVAILABLE`, 필터별 `lastEventAt`을 담는다. Admin-only `GET /admin-api/product-v3?analytics=status`는 필터와 관계없이 전역 상태를 확인하는 경로다.

현재 Analytics 물리 저장소는 **Staging 전용**이다. Preview/Staging QA 조회만 Staging Supabase를 읽는다. `environment=production` 조회는 Staging DB에 질의하지 않고 `currentQuery.dataState=STORE_UNAVAILABLE`을 반환한다. Production 저장소 URL·ref·비밀키와 별도 read/write adapter는 아직 구현하지 않았다. 따라서 공식 데이터가 준비되더라도 저장소가 미연결이면 전역 상태는 `MISCONFIGURED`이며, Staging 수치를 Production real 수치로 표시할 수 없다. 실제 Production 연결은 별도 승인·분리된 저장소·권한·복구 검증 이후에만 구현한다.

Admin summary 오류 응답은 원문 DB 에러 대신 안정적인 `ANALYTICS_SCHEMA_NOT_READY`, `ANALYTICS_READ_FAILED`, `ANALYTICS_AUTH_UNAVAILABLE`, `ANALYTICS_TIMEOUT` 중 하나다. 인증되지 않은 요청은 기존 `AUTH_REQUIRED`(401), Admin이 아닌 요청은 `FORBIDDEN`(403)을 유지한다.

## Staging 적용 전 절차

1. 승인된 운영자가 migration chain을 확인한다. 다음 파일은 `supabase/migrations/20261022120000_product_v3_operational_analytics.sql` 하나여야 한다.
2. 승인 후 **Staging ref만** 대상으로 migration을 적용한다. 이 작업에는 DB 적용 권한이 포함되지 않는다. Production ref에 적용하지 않는다.
3. RLS와 grants를 검증한다: `anon`/`authenticated` 읽기·쓰기 거부, `service_role` SELECT/INSERT만 허용. migration의 isolated PGlite 검사는 `node scripts/check-product-v3-analytics.mjs`이다.
4. Staging Preview에서 `EVENT_ANALYTICS_ENABLED=true`, `EVENT_ANALYTICS_ALLOWED_TRAFFIC_TYPES=qa,internal,beta`, `EVENT_ANALYTICS_TRAFFIC_TYPE=qa`, `EVENT_ANALYTICS_COLLECTION_START_AT=2026-10-27T00:00:00+09:00`, `EVENT_ANALYTICS_REQUIRED_NOTICE_VERSION=VER1.8`을 **Preview 범위에서만** 설정한다. 기본은 수집 안 함이다.
5. Admin이 실제 Staging QA 이벤트를 볼 수 있는지 인증된 계정으로 검사한다. `/admin-api/product-v3?analytics=summary&from=YYYY-MM-DD&to=YYYY-MM-DD&environment=staging&trafficType=qa`는 Admin 전용이다. Reviewer는 403이다. migration 전 Dashboard는 `아직 수집 전`으로 표시해야 한다.

로컬 순서 검사는 `node scripts/check-product-v3-analytics.mjs`가 registry → operations → assessment events → RAG metadata → grants hardening → Analytics를 한 PGlite 인스턴스에 적용한다. migration version 중복·객체 충돌·RLS·권한을 검사하지만 **원격 Staging migration history와 schema를 확인하지는 않는다**. 승인 후 적용 직전에 원격 history의 다음 버전이 `20261022120000` 하나인지 다시 확인해야 한다.

승인 관리자 세션을 이용한 읽기 전용 E2E 절차는 [Analytics Admin E2E 준비 문서](product-v3-analytics-admin-e2e.md)를 따른다. 계정 생성·인증 우회·서비스 키 브라우저 노출은 금지한다.

## 공식 운영 게이트

`real`은 기본 허용 목록에 없다. 나중에 공식 1.8 원문 게시·해시 검증·Rule Package 승인·공고 ACTIVE가 완료되어 서버의 `sourceDocument.official=true`가 확인되고, 환경이 Production이며 시작시각과 공고 버전이 모두 일치해야만 gate 함수가 허용한다. 현재 두 삼도 공고의 `isOfficial`은 false이고 Production 쓰기 target은 구현하지 않았으므로 `real` 수집은 불가능하다. Production promotion에는 별도 승인, 복구 전략, 서버 측 공식 활성상태 재검증, 남용 방지, 부하/용량 검증이 필요하다.

브라우저 입력의 `environment`·`trafficType`·`noticeVersion`·판정 상태는 폐기하고 서버가 등록된 공고와 배포 환경에서 다시 만든다. `EVENT_ANALYTICS_SESSION_EVENT_CAP`(기본 300)과 `EVENT_ANALYTICS_RATE_LIMIT_PER_MINUTE`(기본 60)는 현재 서버 인스턴스 단위의 QA 방어다. 서버리스 인스턴스 간 공유되지 않으므로 **Production real 수집의 충분한 abuse guard가 아니다**. 실운영 전에 공유 저장소 기반 rate/cap, 보호된 익명 세션 발급, 부하 검증을 별도로 통과해야 한다. eventId 기본키의 재시도 중복 제거는 유지한다.

## 보존 정책

`EVENT_ANALYTICS_RETENTION_DAYS`는 1~3650일의 설정 계약만 준비했다. 보존기간 자체는 아직 결정하지 않았고 자동 삭제 작업도 없다. 운영 활성화 전 법무·개인정보·백업 요구사항과 기간을 결정하고, 삭제 작업을 별도 검수해야 한다. 무기한 보존을 운영 정책으로 간주하지 않는다.

초기 제안은 **90일**이다. `planStagingAnalyticsCleanup`은 Staging 프로젝트 identity와 삭제 기준 시각을 검증해 `DRY_RUN` 계획만 반환한다. 실제 DELETE 권한·스케줄·Production 자동 삭제는 이 변경에 없다. Staging에서 계획을 검증하고 백업/복구 및 보존기간 승인 후 별도 migration/job으로 활성화한다.

## 한계

현재 Admin 기본 카드에는 Staging QA 최근 7일 세션만 표시한다. 임의 기간·공고·환경·트래픽 비교는 인증된 Admin summary API가 제공한다. 집계는 서버에서 최대 10만 이벤트를 페이지 읽어 계산하므로 공식 운영량이 늘면 DB 측 aggregate 또는 rollup으로 이전해야 한다. 브라우저 발생 이벤트는 악의적 반복 요청을 완전히 차단하지 않으므로 `real` 수집 전에 보호된 세션 발급·rate limit·abuse monitor가 필요하다. 현재는 Preview/Staging QA 계측용이다.
