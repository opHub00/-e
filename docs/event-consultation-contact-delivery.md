# 행사 상담 연락처·결과 전달 — Staging 검토안

상태: 코드/로컬 테스트 완료, 원격 migration 미적용. Production 변경 금지.

## 적용 전 검토할 migration

이번 브랜치가 추가한 파일은 `supabase/migrations/20261026120000_event_consultation_contact_delivery.sql` 하나다. 앞선 로컬 migration은 `20261022120000_product_v3_operational_analytics.sql`이다. 원격 Staging history를 다시 확인하기 전에는 CLI `db push` 또는 SQL 적용을 하지 않는다. 로컬 Supabase CLI가 이 작업 환경에 설치되어 있지 않아 migration 파일은 수동으로 생성했고, 격리된 PGlite에서 SQL 실행·권한 검사를 마쳤다.

| 테이블 | 저장 범위 | 권한 |
| --- | --- | --- |
| `consultation_contacts` | 성함, 정규화한 휴대폰 번호, 동의 버전·시각·목적, 익명 Analytics 세션 ID, QR 결과 토큰의 SHA-256 해시, 공고 ID, 결과 상태·생성 시각, 보유 만료 시각 | RLS 활성화. anon/authenticated 직접 읽기·쓰기 없음. service-role 조회·삭제만 허용. 등록은 service-role 전용 RPC에서만 수행 |
| `consultation_result_deliveries` | 연락처 FK, 결과 해시, 공고 ID, SMS 상태, 요청·발송 시각, 제공자 메시지 ID/오류 코드(미연결이면 null) | RLS 활성화. anon/authenticated 직접 접근 없음. service-role 조회·상태 수정만 허용 |

`register_consultation_contact` RPC는 service-role만 실행하며 연락처와 SMS 전달 요청을 하나의 DB 트랜잭션으로 기록한다. 같은 결과 해시의 재시도는 기존 행을 반환하고, 다른 성함·번호로 재등록하면 충돌로 거부한다. 관리자 API는 기존 승인 관리자 JWT를 서버에서 재검증한 뒤 마스킹된 번호만 응답한다. 리뷰어·비관리자에게 PII 목록 권한은 없다.

익명 `product_v3_analytics_events` 스키마는 변경하지 않는다. 이름·전화번호·QR 토큰·원문 답변·정확 소득/자산을 Analytics에 쓰지 않는다. QR URL에는 불투명 토큰만 있고, 연락처 등록용 별도 확인값은 결과를 만든 화면 메모리에만 있다. 저장소에는 그 확인값의 해시만 남는다. QR 결과 공개 GET에도 확인값·해시는 포함되지 않는다.

## 동의·보유기간

연락처 제출은 선택 사항이다. 미동의·미입력이어도 판정, 결과 조회, QR 열람은 계속된다. 동의 문구는 성함·휴대폰 번호, 결과 제공/상담 이력 확인 목적, 임시 보유기간을 함께 보여준다. **7일은 행사 MVP 임시 운영값이지 법적으로 확정된 보존기간이 아니다.** `expires_at`을 저장하고 연락처 삭제 시 전달 행은 CASCADE 삭제된다. 자동 삭제 스케줄은 아직 없으므로 Staging/실운영 도입 전 승인된 cleanup job, 백업·복구 및 정보주체 삭제 요청 절차를 정해야 한다.

## SMS 경계

현재 등록 시 delivery 상태는 `PROVIDER_UNCONFIGURED`다. 실제 SMS 사업자/credential이 없으므로 발송 성공으로 표시하지 않는다. `ConsultationResultSender.sendConsultationResult` 계약에는 SMS 채널과 만료되는 결과 링크를 받는 경계만 있다. 실제 전송 adapter, 재시도/중복 발송 방지, 발송 직전 QR TTL 확인은 미구현이다. 카카오 알림톡·OCR·마케팅 메시지는 범위 밖이다.

## 배포·검증 순서

1. 이 문서와 SQL의 PII, RLS, 보유기간, rollback 계획을 사용자에게 보고하고 Staging 적용 승인을 별도로 받는다.
2. Staging ref 및 Production ref가 다름을 재확인하고, 원격 migration chain의 다음 파일이 정확히 위 파일 하나인지 확인한다.
3. 승인 후 Staging에만 적용하고 anon/authenticated 차단 및 관리자 401/403/200을 실제 계정으로 재검증한다.
4. Staging 전용 Preview를 배포해 결과 → QR → 동의/연락처 저장 → Admin 마스킹 목록을 실제 브라우저에서 확인한다.
5. SMS 제공자가 연결되기 전에는 `PROVIDER_UNCONFIGURED`를 유지한다.

현재는 1단계 검토와 별도 적용 승인 대기 상태이며 원격 DB 적용·Preview 배포를 하지 않았다.
