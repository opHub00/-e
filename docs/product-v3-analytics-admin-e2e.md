# Product V3 Analytics — 승인 관리자 Staging E2E 절차

이 문서는 **준비 절차**다. 이 작업에서 실제 Staging DB migration을 적용하거나 승인 관리자 세션을 사용하지 않았다. Production 연결·수집 활성화는 범위 밖이다.

## 사전 게이트

1. 승인된 운영자가 Staging ref와 Production ref가 서로 다름을 확인한다. Analytics migration `20261022120000_product_v3_operational_analytics.sql`이 원격 history에서 다음 적용 대상 **하나**인지 확인한다.
2. 별도 승인 후 Staging에만 migration을 적용하고, `anon`/`authenticated` SELECT·INSERT 거부, `service_role` SELECT·INSERT만 허용, RLS enabled와 Staging Data API 노출 설정을 검증한다. 이 문서 자체는 적용 승인이 아니다.
3. Staging Preview에서 `WANPANE_ENV=staging`, `VERCEL_ENV=preview`, Staging 전용 Supabase ref/URL/credential의 일치 여부를 **값을 출력하지 않고** 확인한다. QA 수집을 사용한다면 `EVENT_ANALYTICS_TRAFFIC_TYPE=qa`; `real`은 허용하지 않는다.
4. 기존 승인 관리자 세션을 사용한다. 임시 관리자 생성, 인증 우회, service-role 키를 브라우저에 붙여넣는 행위는 금지한다.

## 읽기 전용 확인

| 경로/화면 | 기대 결과 |
| --- | --- |
| 비로그인 `GET /admin-api/product-v3?analytics=status` | 401 `AUTH_REQUIRED` |
| reviewer 세션 동일 요청 | 403 `FORBIDDEN` |
| 승인 admin 세션 동일 요청 | 200, `collectionState`, `officialDataReady`, `productionStoreReady=false`, 시작 시각·버전·대상 환경·허용 트래픽 확인 |
| `GET /admin-api/product-v3?analytics=summary&from=YYYY-MM-DD&to=YYYY-MM-DD&environment=staging&trafficType=qa` | 200, `globalCollection`은 위 status와 같고 `currentQuery`는 staging/qa |
| Admin Analytics 화면의 Staging/QA 필터 | QA 표시, `generatedAt`과 `lastEventAt`(이벤트가 없으면 null), 퍼널·공급유형×판정상태·오류 상태 확인 |
| Production/real 필터 | Staging DB 접근 없음, `currentQuery.dataState=STORE_UNAVAILABLE`; Staging QA 숫자가 운영 숫자로 표시되지 않음 |

Staging QA 이벤트를 승인된 테스트 흐름에서 발생시킨 후 결과 조회·저장·QR 반복 시 이벤트 횟수와 고유 세션 수를 구분한다. 같은 세션에서 반복 조회해도 `resultViewSessions`는 1이다. 공급유형×상태의 합은 실제 판정 이벤트 셀과 일치해야 한다. 전역 상태는 QA 이벤트 수나 필터 변경에 따라 달라지면 안 된다.

오류 주입 또는 schema 미적용 환경에서 `ANALYTICS_SCHEMA_NOT_READY`, 읽기 장애에서 `ANALYTICS_READ_FAILED`, 인증 경로 장애에서 `ANALYTICS_AUTH_UNAVAILABLE`, timeout에서 `ANALYTICS_TIMEOUT`을 확인한다. 응답에 원문 DB 오류나 비밀값이 없어야 한다. 모든 테스트 후 Admin 화면 새로고침과 서버 재시작에서도 수치가 일치하는지 확인한다.

## 승격 보류 조건

원격 migration history 미확인, 실제 Admin 200 미검증, UI↔backend 통합 미검증, Production 물리 저장소 미구축 중 하나라도 남으면 `ANALYTICS_STAGING_E2E_READY` 또는 `ANALYTICS_REAL_COLLECTION_READY`를 GO로 표시하지 않는다.
