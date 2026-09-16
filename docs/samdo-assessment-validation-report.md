# Samdo VER1.7 실제 원문 → DB → 판정 검증

## 시작 및 변경 범위

- 시작: `feature/assessment-rule-import`, `5f9d4a8`. 사용자가 추가한 `source/*.hwp`만 untracked였다.
- 기존 `a3f31da`, `d82b8e8`, `b5b64ae`, `5f9d4a8` 보존. 운영 migration/push 없음.
- 원문 SHA 및 상세 규칙/검토 메모: [규칙 명세](./samdo-assessment-rule-spec.md).
- import JSON은 런타임 registry가 아니다. 앱에 직접 import하지 않는다.
- 기존 evaluator의 조건/단계/가점 알고리즘과 Claude UX 구조는 유지했다. 실제 입력에 필요한 날짜·소득표 derived facts, 질문 필드, 지역우선 별도 결과를 추가했다.
- 기존 fixture의 소수 금액·태아 처리까지 회귀 테스트로 보존했다. 원 단위 정수 및 태아 인정은 새 package의 명시적 parameter로 적용한다.

## DB lifecycle

Docker/Podman 및 명시적 staging 환경이 없어 격리 PGlite PostgreSQL을 사용했다.

1. 실제 HWP bytes의 SHA-256이 package와 같은지 확인.
2. 두 기존 migration을 실제 SQL로 적용.
3. private `storage.objects` metadata stand-in 등록. HWP 원본은 로컬 디스크에 보존.
4. service_role import → private/inactive/unapproved.
5. anon DatabaseRuleRepository 조회 불가 assertion.
6. 원문 전사 package와 review snapshot semantics 일치 확인.
7. review fingerprint로 APPROVED record/approved_at 기록.
8. inactive 상태의 anon 조회 불가 assertion.
9. activate → active/public → anon DatabaseRuleRepository 반환.
10. 제목·공급유형·stage/score config·금액·evidence·sourceStatus·version·document provenance 동등성 assertion.

이는 **실제 Supabase Storage 업로드/다운로드 및 PostgREST 서비스 통합을 검증한 것이 아니다.** Storage HTTP 및 production/staging 등록은 기존 서버 CLI로 별도 진행해야 한다. 승인 기록은 이 격리 검증 DB 안의 전사 검수 기록이며 사업주체의 공식 자격 승인과 다르다.

## DB에서 읽은 규칙으로 실제 판정

공고일 `2026-09-14`, 원문에서 대조한 75개 규칙. 신청자는 가상 테스트 프로필이다.

| 시나리오 | 결과 | 최초 진입 단계 | 예상 가점 |
|---|---|---|---|
|청년, 납세5년·저소득·거주2년·납입24회|ELIGIBLE|PRIORITY|9/9|
|청년, 납세3년|ELIGIBLE|GENERAL|11/12|
|청년, 만19세 미만|INELIGIBLE|없음|없음|
|입력정보 누락|NEEDS_MORE_INFORMATION|없음|없음|
|신혼, 혼인1년·자녀없음·저소득|ELIGIBLE|PRIORITY|9/9|
|신혼, 혼인5년·무주택5년·자녀없음|ELIGIBLE|GENERAL|9/12|
|생애최초 맞벌이 월900만원|ELIGIBLE|PRIORITY|없음|
|생애최초 맞벌이 월1,000만원|ELIGIBLE|GENERAL|없음|
|생애최초 맞벌이 월1,200만원|ELIGIBLE|LOTTERY|없음|

모든 결과에서 evidence.documentId → announcement document 연결 및 locator SHA를 확인했다.
지역우선 배정은 표2 수정 메모가 남아 있어 **NEEDS_REVIEW**다. 위 ELIGIBLE은 지원 범위의 예상 신청자격이며 지역 배정·당첨을 확정하지 않는다.

## Chrome 모바일 검증

- 실제 앱 web export, Chrome 390×844.
- 가상의 기존 profile을 로컬 저장소에 준비하고 추가 질문은 실제 입력 UI로 작성했다.
- 홈 → 청약 맞춤판정 → 삼도이동 **검토본 기준** 공고 → 청년 → 추가정보 → 결과.
- **신청 가능 / 1단계 우선공급 / 예상9/9점** 확인.
- 소득3·거주3·납입3 breakdown, 검토본 안내, 지역우선 검토 안내, 필요서류 표시.
- DOM viewport 390×844, 가로 넘침 없음. 이미지 직접 확인.
- 실제 network: localhost `/rest/v1/rpc/list_assessment_announcements`, `/rest/v1/rpc/read_assessment_rule_set` 모두 HTTP200. rule readCount=1.
- 읽기 HTTP bridge가 PostgreSQL의 anon RPC를 실행한다. 정적 JSON 응답이나 static repository를 사용하지 않는다. bridge에는 import/approve/write API가 없다.
- 초기 export의 Metro 캐시가 기존 원격 URL을 포함해 read-only 요청404가 한 번 발생했다. 이후 `--clear`, `EXPO_NO_DOTENV=1`, 명시적 loopback 환경 및 원격 Supabase 요청 차단으로 검증했다. 운영 write는 없었다.
- 신혼·생애최초는 DB/evaluator 시나리오로 검증했다. 이번 최종 모바일 smoke 범위는 청년이다.

로컬 artifact(ignored): `.cache/samdo-youth-mobile.png`, `.cache/samdo-mobile-result.txt`, `.cache/samdo-db-proof.json`.

## 실행 결과

| 명령/검사 | 결과 |
|---|---|
|typecheck|통과|
|assessment tests|기존62 + Samdo76 = 138개 통과|
|npm test|전체 통과, Edge65 포함|
|기존 SQL/RLS|111개 통과|
|기존 import lifecycle|54개 통과|
|실제 Samdo DB lifecycle|왕복 및 위9개 판정 시나리오 통과|
|web export|통과, loopback QA는 별도 `.cache/samdo-web`, 최종 `dist`는 기존 앱 환경으로 캐시를 비워 다시 생성|
|git diff --check|통과|

Samdo76개는 연령19/39, 가입6개월, 납입6/11/12/23/24, 청년 소득70/100/140%, 거주1/2년, 납세3/5년,
혼인2/7년 일 경계, 자녀2/3/6세, 자녀수1/2/3, 원문 무주택 사례6개 및1/3년 경계,
맞벌이 소득 경계, 생애최초600만원·납세5년·세대주·1인 가구 검토 상태, 4–8인 금액표,
자산 상한, 특례/해외체류/출산완화/9인이상·미상·원단위 소수·통장 충돌을 확인한다.

## 재현

파서용 dependency는 runtime dependency가 아니다:

```powershell
python -m pip install --target .cache/hwp-parser olefile==0.47
python scripts/extract-hwp-text.py "C:/완판e/source/원문파일명.hwp" .cache/samdo-hwp.json
python scripts/build-samdo-draft-package.py
npm run test:assessment-samdo-db
```

DB 검증 기본 파일 위치는 `../source/{package.document.fileName}`. 다르면 서버 환경변수 `SAMDO_HWP_PATH`를 지정한다.
PGlite0.5.8 설치는 [기존 DB 문서](./application-assessment-data-architecture.md#11-검증)를 따른다.

브라우저 QA는 아래 local 환경으로 **반드시 캐시를 비워** 별도 export한다:

```powershell
$env:EXPO_NO_DOTENV='1'
$env:EXPO_PUBLIC_SUPABASE_URL='http://127.0.0.1:9531'
$env:EXPO_PUBLIC_SUPABASE_ANON_KEY='local-qa-anon-not-a-secret'
npx expo export --platform web --clear --output-dir .cache/samdo-web
node --experimental-strip-types scripts/check-samdo-lifecycle.mjs --serve
```

local QA export를 배포하면 안 된다. 정상 배포 시 해당 shell의 QA 환경변수를 해제하고 승인된 환경으로 다시 export한다.
원문 file/host key를 public bundle에 포함하지 않는다.

## 다음 검수

1. 공식 최종본과 관리번호별 지구 확정, 표2 기준일·1인 가구·통장·일정 메모 해소.
2. Supabase staging에서 private original upload → CLI import/review/approve/activate 및 PostgREST/RLS 재확인.
3. 출산 완화·배우자 이력 예외·군인·해외체류·재혼/입양을 증빙 기반으로 확장.
4. 신혼·생애최초의 전체 모바일 질문 UX QA. 특히 소득 산정 가구원수와 실제 세대원 수, 최초/현재 혼인일을 구별할 수 있는지 확인.
5. 최종 원문 검증을 마친 **새 document + 새 rule version**에서만 OFFICIAL_VERIFIED 검토. 이번 버전은 덮어쓰지 않는다.
