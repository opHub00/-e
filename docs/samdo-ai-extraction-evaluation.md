# Samdo semantic extraction benchmark

## 실행 범위와 결론

Samdo VER1.7 검토본 한 건의 `ParsedDocument`만 Google Gemini에 전달했다. human-verified 75개 규칙은 API 실행이 종료된 뒤 로컬 평가 프로세스에서 처음 읽었다. Supabase/운영 DB write, import, review, approve, activate는 실행하지 않았다.

이번 benchmark는 **자동 Rule Extraction의 다음 단계로 진행할 기준을 충족하지 못했다.** 원인은 parser가 아니라 Pass 1의 과다 선택과 provider 장애였다. Pass 1은 COMMON 표 120개를 선택했고, 순차 실행이 COMMON부터 처리되면서 503 재시도가 전체 호출 한도를 소진했다. 청년·신혼부부·생애최초 Pass 2에는 도달하지 못했다.

부분 성공 응답은 숨기지 않고 CandidateRulePackage로 회수했다. 17개 후보가 schema/evidence validator를 통과했지만, 사람이 검토한 결과 단계·예외 범위를 평탄화한 critical 오류 6개가 있었다. 자동 import나 승인 근거로 사용할 수 없다.

## Provider와 prompt

- 기존 AI infrastructure: Gemini REST API. 새 SDK를 추가하지 않았다.
- prompt: `assessment-rule-extraction-v2`. 기존 v1은 보존했다.
- 최초 선택 `gemini-2.5-pro`: Google이 신규 사용자에게 종료하여 HTTP 404.
- 최신 `gemini-3.1-pro-preview`: 이 API key의 quota가 0이라 HTTP 429.
- 실제 추출 모델: 프로젝트에서 이미 사용하는 reasoning-capable `gemini-2.5-flash`.
- structured output: `responseMimeType=application/json` + `responseJsonSchema`.
- 가격 계산: Google 공식 가격표의 Standard paid rate, 입력 US$0.30/M, reasoning 포함 출력 US$2.50/M.

키는 server/CLI 환경변수로만 사용했다. API key, 원문 전체, oracle rules는 console/log에 저장하지 않았다. provider artifact에는 model, token usage, latency, status만 기록했다.

## Two-pass 실행

Pass 1은 172개 표의 ID·짧은 preview·heading과 표 밖 검토 메모만 받았다. 결과 선택은 다음과 같았다.

| 그룹 | 선택된 표 | 선택된 독립 block |
|---|---:|---:|
| COMMON | 120 | 0 |
| YOUTH | 8 | 0 |
| NEWLYWED | 6 | 0 |
| FIRST_TIME | 2 | 0 |
| EXCEPTIONS | 0 | 18 |

Pass 2는 선택된 표와 앞뒤 block을 24,000 characters 이하 원문 단위로 구성했다. 표를 자르지 않았으며 큰 원문 단위 3개는 `OVERSIZED_CONTEXT`로 제외했다. 총 26개 batch가 만들어졌지만 처리 순서가 COMMON 우선이어서 `COMMON-0`만 성공했다.

동일 원문 전체를 giant prompt로 보내지 않았고, 성공 batch는 해당 표와 주변 문맥만 포함했다. 다만 Pass 1의 COMMON precision이 낮아 section-aware chunking의 실용적인 call allocation이 실패했다.

## 호출·토큰·비용

사용자가 승인한 총 16회 한도를 정확히 지켰다. 추가 호출은 하지 않았다.

| 구분 | 호출 | 결과 |
|---|---:|---|
| 2.5 Pro 최초 Pass 1 | 1 | 404, token 없음 |
| 2.5 Pro 원문 없는 진단 | 1 | 404, token 없음 |
| 3.1 Pro 원문 없는 진단 | 1 | 429, token 없음 |
| 2.5 Flash 원문 없는 structured-output 진단 | 1 | 성공 |
| 2.5 Flash Samdo benchmark | 12 | 성공 2, 503 실패 10 |
| 합계 | 16 | 호출 상한 도달 |

| 사용량 | 전체 16회 집계 | benchmark run artifact |
|---|---:|---:|
| input tokens | 41,280 | 41,274 |
| output tokens | 6,930 | 6,925 |
| thinking tokens | 3,489 | 3,452 |
| total tokens | 51,699 | 51,651 |
| estimated cost | US$0.0384315 | US$0.0383247 |

usage가 없는 실패 호출을 0 token으로 위장하지 않고 null로 기록했다. 위 전체 합계에서 실패 호출은 token 합산에서 제외했다. 실제 청구액은 provider billing tier에 따라 다를 수 있다. US$4 상한의 약 0.96%에서 종료됐다.

## Candidate와 validator

- raw candidates: 17
- accepted after grounding/schema validation: 17
- rejected: 0
- unresolved: 공급그룹 미실행을 나타내는 5개 `MISSING_CONTEXT`
- completed semantic batch: COMMON-0 한 개
- 자동 import/approve/activate: false

모델이 지역거주 구간 두 개에 같은 raw `ruleKey`를 썼다. 이전 host key 생성도 같은 batch 안에서 충돌하여 최초 run이 `DUPLICATE_RULE`로 끝났다. 원 응답을 수정하지 않고 보존했으며, host candidate ID와 rule key에 batch index를 넣는 버그 수정 후 동일 raw artifact를 오프라인으로 재검증했다. 이것은 oracle 보정이나 추가 AI 호출이 아니다.

## Oracle 비교 결과

Oracle은 기존 Samdo DRAFT_SOURCE_VERIFIED 75개다: 청년 24, 신혼부부 26, 생애최초 25. 추출 호출이 모두 끝난 뒤 별도 offline script가 읽었다.

| 지표 | 결과 | 해석 |
|---|---:|---|
| overall rule recall | 0 / 75 = 0% | 공급유형 Pass 2 미실행 |
| oracle correspondence precision | 0 / 17 = 0% | 17개가 COMMON이며 현재 75-rule oracle 범위 밖 |
| critical target coverage | 0 / 75 = 0% | 비교 가능한 공급유형 후보 없음 |
| candidate-level numeric fidelity | 5 / 5 = 100% | 추출된 공통 숫자의 원문 literal만 평가 |
| candidate-level numeric operator fidelity | 5 / 5 = 100% | 공급유형 critical-rule operator 정확도가 아님 |
| target numeric/operator accuracy | 0 / 0 = N/A | 해당 후보를 추출하지 못함 |
| score accuracy | 0 / 0 = N/A | score candidate 없음 |
| target stage accuracy | 0 / 0 = N/A | oracle mapping 없음 |
| manually reviewed candidate stage/scope | 15 / 17 = 88.2% | 지역우선 구간 2개 scope 오류 |
| validator evidence grounding | 17 / 17 = 100% | block ID, locator, exact snippet 일치 |
| oracle evidence match | 0 / 0 = N/A | oracle mapping 없음 |
| confirmed hallucination | 0 | 17개 모두 cited source text 존재 |
| semantic extras needing review | 17 | source grounding은 semantic correctness가 아님 |
| conflict/unresolved recall | 0 / 7 = 0% | EXCEPTIONS batch 미실행 |
| critical extraction errors | 6 | stage/scope 2, unsupported exception flattening 4 |

Precision 0%는 17개가 환각이라는 뜻이 아니다. 현재 oracle은 청년·신혼·생애최초 runtime rule만 포함하고 COMMON 제도 사실은 포함하지 않는다. 그래서 source-supported COMMON 후보 17개를 `NEEDS_HUMAN_REVIEW`로 유지하면서 correspondence numerator에는 넣지 않았다. 확인되지 않은 extra를 환각으로 세지 않았다.

### Critical numeric/operator 평가

실제로 추출된 숫자 5개(제주 1년 이상/미만, 재당첨 10년, 전매 10년, 거주의무 5년)는 값과 `gte`/`lt`/`eq` 연산자가 원문과 일치했다. 하지만 사용자가 요구한 청년·신혼·생애최초의 핵심 숫자·연산자 batch가 실행되지 않았기 때문에 그 정확도는 N/A다. 5/5를 전체 critical accuracy로 확대 해석하면 안 된다.

### Evidence와 hallucination

17개 후보 모두 선택된 context 안 block ID를 사용했고, snippet은 해당 원문 문자열에 포함되며 immutable locator와 일치했다. 이 의미의 evidence grounding은 100%다.

원문에 전혀 없는 후보는 확인되지 않아 confirmed hallucination은 0개다. 다만 evidence가 존재해도 조건 의미를 과도하게 단순화할 수 있다. 그래서 17개 전부 semantic review 대상으로 남겼다.

### Critical errors

1. 1년 이상 지역 구간을 해당지역 우선공급 맥락이 아닌 `GENERAL` stage로 생성.
2. 1년 미만 구간을 미달 시 기타지역 공급 맥락이 아닌 `GENERAL` stage로 생성.
3. 무주택세대구성원 조건에서 청년 본인·예비신혼 미래세대 예외 scope 누락.
4. 입주 시까지 무주택 유지 조건에서 청년 본인 예외 scope 누락.
5. 중복청약 조건을 boolean으로 평탄화하면서 배우자 예외 누락.
6. 해외체류를 boolean으로 평탄화하면서 90일/183일 기준과 생업 목적 예외를 unresolved로 만들지 않음.

모델은 이 후보들을 모두 HIGH confidence로 출력했다. 따라서 evidence-grounded HIGH도 안전한 rule을 뜻하지 않는다는 점이 확인됐다.

## 공급유형별 결과

| 공급유형 | Oracle | 정확히 일치 | 결과 |
|---|---:|---:|---|
| 청년 | 24 | 0 | Pass 2 미실행, 모두 MISSING_RULE |
| 신혼부부 | 26 | 0 | Pass 2 미실행, 모두 MISSING_RULE |
| 생애최초 | 25 | 0 | Pass 2 미실행, 모두 MISSING_RULE |

따라서 나이, 혼인, 무주택, 통장 6개월/6회, 소득·자산, 600만원, 5년 소득세, 단계·가점·무가점 등 중요 규칙의 정확도를 이번 run에서 주장할 수 없다.

## Conflict 결과

평가 checklist: 지역우선 기준일, 관리번호↔지구 매핑, 검토 메모, 출산가구 완화, 배우자 혼인 전 이력, 해외체류 기준·예외, 기타 특례. 발견 0/7이다. Pass 1은 메모 block을 선택했지만 EXCEPTIONS Pass 2 호출 전에 예산을 소진했다. 해외체류는 conflict/unresolved 대신 단일 boolean으로 잘못 확정했다.

## 실패 원인

- Parser: 이번 실패 원인 아님. block/cell evidence 검증은 모두 통과.
- Section discovery: COMMON을 120/172표나 선택해 precision이 낮음.
- Scheduler: COMMON batch를 모두 먼저 시도해 공급유형별 공정한 coverage가 없음.
- Provider: 성공 2회 뒤 연속 HTTP 503. 한 번 재시도가 호출 예산을 빠르게 소진.
- Prompt/model: exception scope를 atomic boolean으로 평탄화했고 HIGH confidence를 과도하게 사용.
- Schema/host: 같은 raw ruleKey band의 host key 충돌 발견. index를 포함하도록 수정하고 회귀 테스트 추가.
- Validator: 문자열·locator grounding은 차단했지만 semantic scope 손실은 차단하지 못함.

## 개선 권고

1. Pass 1에 그룹별 최대 표 수와 title/section anchor allowlist를 적용한다.
2. 실행 순서를 COMMON 전체 우선이 아니라 COMMON→YOUTH→NEWLYWED→FIRST_TIME→EXCEPTIONS round-robin으로 바꾼다.
3. 공급유형별 최소 1회 quota를 예약하고 provider retry quota를 별도로 제한한다.
4. 503 첫 발생 후 backoff하거나 run을 중단하고 새 승인 없이 호출 예산을 소진하지 않는다.
5. `exception`, 괄호 scope, ‘단/다만/제외’가 있는 evidence는 조건 rule과 unresolved를 함께 요구한다.
6. HIGH confidence 후보가 scope 예외 문구를 포함하면 validator가 review warning을 생성하도록 한다.
7. 다음 benchmark는 provider quota가 안정된 뒤 새 run으로 실행한다. 이번 후보나 oracle을 다음 prompt에 넣지 않는다.

Fine-tuning, 무인 batch extraction, Rule DB handoff, 자동 승인으로 진행할 근거는 없다.

## Artifacts와 검증

Git에서 제외된 `.ingestion/announcements/{samdoId}/extraction/samdo-ai-v1-flash/`에 raw responses, selection locator/hash, usage, partial candidate, validation, oracle comparison을 저장했다. API에 보낸 source context 본문은 로그로 보존하지 않고 finalization에서 locator·크기·SHA-256으로 교체했다. API key와 원문 전체도 artifact에 복제하지 않았다. 첫 2.5 Pro 실패 run은 원인 추적에 필요한 상태·usage만 local artifact로 보존했다.

- `npm run typecheck`: 통과.
- `npm run test:semantic`: 26개 통과.
- 기존 extraction 33개, Python parser 14개, ingestion 33개, assessment 138개 보존.
- 전체 회귀와 web export는 최종 코드 변경 후 재실행한다.
- 원격 Supabase write, import/review/approve/activate, human-verified Samdo rule 변경 없음.

---

## Benchmark v2 — selection, scheduling, exception integrity 개선

### 결론

v2는 COMMON 호출 독점과 HIGH confidence 예외 누락은 완화했지만, **admin review 단계로 진행할 기준은 아직 충족하지 못했다.** 모든 공급유형 호출은 round-robin 첫 회차에서 실제 시도됐으나 `INCOMPLETE_OUTPUT`으로 후보를 회수하지 못했다. 남은 5회 축소 재시도도 provider의 HTTP 429/400으로 실패했다. Oracle을 이용한 output 보정이나 추가 호출은 하지 않았다.

### 적용한 개선

- Pass 1 selection cap: COMMON 8 tables/30 blocks, YOUTH 10/50, NEWLYWED 10/60, FIRST_TIME 8/50, EXCEPTIONS 8/60.
- deterministic heading/keyword bias로 청년 표7·8, 신혼 표9·10, 생애최초, 해외체류·특례 문맥을 우선했다.
- 실행 순서를 COMMON → YOUTH → NEWLYWED → FIRST_TIME → EXCEPTIONS round-robin으로 변경했다.
- 전체 16회 중 discovery 1, semantic 13, retry reserve 2로 분리했다.
- transient retry는 run 전체 최대 2회, 연속 오류 circuit breaker는 3회로 제한했다.
- `단/다만/제외/예외/배우자/혼인 전/해외체류/생업/출산/특례`가 있으면 앞 1개·뒤 2개 block과 표를 함께 유지했다.
- 예외 문맥에서 qualifier/unresolved를 내지 않은 rule은 `EXCEPTION_DROPPED`로 차단한다.
- 예외·복수 block·table warning 문맥의 `HIGH`는 host가 `MEDIUM`으로 낮춘다.
- COMMON stage 추론을 차단했고, v2에서 발견된 EXCEPTIONS→PRIORITY 오류도 이후 `EXCEPTION_STAGE_MISMATCH`로 차단한다.
- candidate 간 `relatedExceptionRuleKeys`를 지원하며 rejected exception 관계는 제거한다.

### Pass 1과 plan-only

실제 v2 Pass 1은 COMMON 표를 149개 선택했지만 deterministic policy가 8개로 제한했다. v1은 120개가 그대로 batch로 넘어갔다.

| 항목 | v1 | v2 |
|---|---:|---:|
| 모델이 선택한 COMMON tables | 120 | 149 |
| policy 이후 COMMON tables | 120 | 8 |
| 실행 예정 COMMON batches | COMMON 우선 전체 | 2 |
| 공급유형 최소 실행 슬롯 | 없음 | 청년 3 / 신혼 3 / 생애최초 3 |
| retry reserve | semantic과 공유 | 2 |

14,000-character plan-only 결과는 총 33개 고유 table, 1,492개 block, duplicate context ratio 37.1%, exception marker coverage 205/325(63.1%)였다. schedule은 `COMMON-0, YOUTH-0, NEWLYWED-0, FIRST_TIME-0, EXCEPTIONS-0` 순으로 첫 회차 coverage를 보장했다. 네트워크 호출과 Oracle 입력은 0이었다.

### 호출·토큰·비용

v2 본 실행 11회와 승인 한도 내 축소 재시도 5회를 합쳐 정확히 16회에서 종료했다.

| 결과 | 횟수 |
|---|---:|
| OK | 4 |
| INCOMPLETE_OUTPUT | 4 |
| HTTP 429 | 6 |
| HTTP 400 | 2 |

| 사용량 | v2 |
|---|---:|
| input tokens | 98,168 |
| output tokens | 85,510 |
| thinking tokens | 12,537 |
| total tokens | 196,215 |
| estimated cost | US$0.2745679 |

HTTP 400 두 건은 축소 재시도에 넣은 JSON Schema `maxItems`가 Gemini 지원 subset과 맞지 않은 것으로 추정한다. 응답 body를 저장하지 않았으므로 확정 원인으로 단정하지 않는다. 해당 keyword는 코드에서 제거했다. API key, 전체 원문 context, Oracle은 provider artifact에 기록하지 않았다.

### Candidate와 Oracle 결과

성공 응답은 Pass 1, COMMON 2개, EXCEPTIONS 1개다. 최초 relation cleanup 버그로 탈락했던 COMMON-0 raw 응답은 API 재호출 없이 현재 validator로 다시 검증해 27개를 회수했다. 기존 29개와 병합한 최종 후보는 56개다.

| 지표 | v2 결과 |
|---|---:|
| validator accepted candidates | 56 |
| validator evidence grounding | 56 / 56 = 100% |
| human Oracle rules | 75 |
| exact rule recall | 5 / 75 = 6.7% |
| semantic correspondence precision | 5 / 56 = 8.9% |
| mapped numeric accuracy | 3 / 3 = 100% |
| mapped operator accuracy | 14 / 14 = 100% |
| score accuracy | 0 / 0 = N/A |
| stage accuracy | 0 / 0 = N/A |
| strict Oracle evidence match | 5 / 14 = 35.7% |
| confirmed hallucination | 0 |
| conflict/unresolved recall | 2 / 7 = 28.6% |
| HIGH-confidence critical errors | 0 |
| manually confirmed critical errors | 11 |

Strict Oracle evidence는 candidate가 동일 규칙의 다른 유효 문단을 인용한 경우도 mismatch로 센다. 따라서 source grounding 100%와 Oracle locator match 35.7%를 구분해야 한다.

11개 critical error는 EXCEPTIONS batch의 혼인·출산·배우자 특례를 모두 `PRIORITY` stage로 지정한 오류다. host가 전부 `MEDIUM`으로 낮췄기 때문에 HIGH-confidence critical error는 0이지만, 당시 validator는 stage 오류를 허용했다. 이후 validator 회귀 테스트와 함께 차단했다.

### 공급유형과 예외 보존

| Scope | 실제 호출 | 후보 회수 | 결과 |
|---|---:|---:|---|
| COMMON | 예 | 예 | 2 batch + offline recovery |
| YOUTH | 예 | 아니오 | INCOMPLETE_OUTPUT/429/400 |
| NEWLYWED | 예 | 아니오 | INCOMPLETE_OUTPUT/429/400 |
| FIRST_TIME | 예 | 아니오 | INCOMPLETE_OUTPUT/429 |
| EXCEPTIONS | 예 | 예 | 1 batch |

예외 보존은 2/3(66.7%)이다.

- 해외체류: 90일·183일 조건과 생업 목적 예외가 후보로 보존되고 relation으로 연결됐다.
- 배우자 혼인 전 이력: 별도 exception 후보로 보존됐다.
- 무주택 scope: 생애최초 배우자 예외와 청년 applicant scope 일부는 남았지만 예비신혼 scope 관계가 완전하지 않아 PARTIAL이다.

### v1 대비

| 지표 | v1 | v2 |
|---|---:|---:|
| calls | 16 | 16 |
| total tokens | 51,699 | 196,215 |
| estimated cost | US$0.0384315 | US$0.2745679 |
| candidates | 17 | 56 |
| recall | 0% | 6.7% |
| correspondence precision | 0% | 8.9% |
| validator grounding | 100% | 100% |
| conflict recall | 0% | 28.6% |
| HIGH-confidence critical errors | 6 | 0 |
| confirmed hallucination | 0 | 0 |

Selection fairness와 exception safety는 개선됐다. 그러나 공급유형 단위 출력 크기와 provider 안정성이 새 병목으로 드러났다. 다음 benchmark 전에는 큰 공급표를 eligibility/stage/score 하위 task로 나누고, 각 응답 candidate 수를 prompt 수준에서 제한하며, Gemini가 실제 지원하는 structured-output schema subset만 사용해야 한다. 자동 import, DB handoff, admin review로 진행하지 않는다.

---

## Benchmark v3 — deterministic fact binding, PLAN_A_16

### 결론

`gemini-2.5-flash` 실제 실행에서 minimal schema 자체는 안정적으로 동작했지만, **ADMIN_REVIEW_READY는 NO**다. 숫자와 연산자가 LLM literal에서 생성되지는 않았으나 모델이 잘못된 deterministic fact를 semantic role에 연결했다. 청년 기본 소득 task는 출산가구 완화에 쓰인 10%·20% fact를 `YOUTH.INCOME_LIMIT`로 분류했다. 잘못된 fact를 손실 없이 보존하는 것만으로는 올바른 규칙이 되지 않는다.

### 실행 계획과 provider 결과

실행 당시 PLAN_A는 청년 6개, 신혼 5개, 생애최초 5개 작업이었다. 모든 task는 plan-only에서 READY였고 입력은 4,540–9,155자, 표 2–6개, block 0–4개, fact 7–12개였다. 모델 output에는 semantic role과 fact/source ID만 허용했다.

| 결과 | 값 |
|---|---:|
| semantic tasks | 16 |
| 실제 network calls | 9 |
| OK | 6 |
| HTTP 429 | 3 |
| circuit에서 차단된 task | 7 |
| retry calls | 0 |
| input tokens | 26,564 |
| output tokens | 2,156 |
| thinking tokens | 5,699 |
| total tokens | 34,419 |
| estimated cost | US$0.0276067 |

task 결과는 SUCCESS 4, INCOMPLETE 2, SKIPPED 3, FAILED 7이다. 청년 6개는 응답을 받았지만 신혼의 첫 3개가 연속 429였고, 당시 global circuit breaker가 이후 신혼 2개와 생애최초 5개를 원격 호출 전에 차단했다. 이는 semantic 품질과 별개의 scheduler/provider 실패다.

실행 후 PLAN_A 순서를 공급유형 round-robin으로 바꿨고, HTTP 429가 global circuit을 열지 않도록 수정했다. 429 task 다음에는 5초 backoff를 적용한다. 이 수정은 v3 결과를 바꾸기 위한 재호출에 사용하지 않았다.

### Candidate와 Oracle 결과

모든 provider 호출이 끝나고 `benchmark-complete.json`이 생성된 다음 별도 offline process가 75개 human-verified rule을 처음 읽었다. Oracle은 prompt, plan, binding context에 포함하지 않았다.

| 지표 | v3 결과 |
|---|---:|
| semantic bindings | 18 |
| RuleBuilder rules | 20 |
| 실행 당시 validator accepted / rejected | 20 / 0 |
| Oracle target precision | 0 / 20 = 0% |
| Oracle target recall | 0 / 75 = 0% |
| source-supported extra | 0 |
| confirmed semantic hallucination | 20 |
| numeric fidelity | 0 / 6 = 0% |
| operator fidelity | 0 / 6 = 0% |
| score fidelity | 0 / 0 = N/A |
| Oracle stage fidelity | 0 / 0 = N/A |
| host stage assignment integrity | 11 / 11 = 100% |
| evidence locator validity | 20 / 20 = 100% |
| semantic evidence support | 0 / 20 = 0% |
| Oracle preferred evidence match | 0 / 20 = 0% |
| conflict/unresolved recall | 5 / 7 = 71.4% |
| exception preservation | 6 / 6 = 100% unresolved, silent drop 0 |
| HIGH-confidence critical errors | 4 |

`confirmed semantic hallucination`은 원문에 숫자가 없다는 뜻이 아니다. fact는 실제 원문에서 왔지만 semantic role과 맞지 않았다. 예를 들어 `10%`, `20%`는 원문 값이지만 청년 기본 소득상한은 아니다. 이 구분이 locator validity 100%와 semantic support 0%가 동시에 나온 이유다.

### 공급유형 결과

| 공급유형 | 호출 결과 | core coverage |
|---|---|---:|
| YOUTH | 4 SUCCESS, 2 INCOMPLETE | 실패 |
| NEWLYWED | 3 HTTP 429, 2 circuit 차단 | 실패 |
| FIRST_TIME | 5 circuit 차단 | 실패 |

청년에서도 subscription/assets는 올바른 fact가 task context에 들어오지 않아 unresolved가 됐다. score 응답은 5개 binding을 만들었지만 point와 max-point fact가 한 binding에 함께 없어서 RuleBuilder가 rule 생성을 거부했다. 신혼과 생애최초는 semantic 품질을 측정할 provider output 자체가 없다.

### 안전장치에서 발견된 결함

실행 당시 binding validator는 `factId`와 `sourceId`가 각각 존재하는지만 검사했고, fact의 실제 source가 모델이 선언한 source 목록에 포함되는지는 확인하지 않았다. 이 때문에 `youth.stages`에서 다른 source의 `출산특례`, `예비신혼부부`, `우선공급` fact를 stage role에 연결한 응답이 통과했다.

benchmark artifact는 실행 당시 accepted 20개를 그대로 보존했다. 이후 validator에 `FACT_SOURCE_NOT_DECLARED`를 추가하고 회귀 테스트를 만들었다. Oracle 값을 이용해 후보를 보정하거나 결과를 재계산하지 않았다.

### Exception과 conflict

해외체류, 배우자 혼인 전 이력, 청년 무주택 scope, 예비신혼 scope, 출산특례, 중복청약 배우자 예외는 모두 unresolved로 남아 silent drop은 0이다. relation이 생성된 항목은 없으므로 이는 해석 성공이 아니라 안전한 보존이다. 알려진 7개 검토대상 중 review memo, 출산 완화, 배우자 이력, 해외체류, 기타 특례 5개가 표시됐다. 지역우선 기준일과 관리번호-지구 mapping은 탐지하지 못했다.

### v1 / v2 / v3 비교

| 지표 | v1 | v2 | v3 |
|---|---:|---:|---:|
| network calls | 16 | 16 | 9 |
| total tokens | 51,699 | 196,215 | 34,419 |
| estimated cost | US$0.0384315 | US$0.2745679 | US$0.0276067 |
| candidates/rules | 17 | 56 | 20 |
| precision | 0% | 8.9% | 0% |
| recall | 0% | 6.7% | 0% |
| numeric fidelity | N/A | 100% (3/3) | 0% (0/6) |
| operator fidelity | N/A | 100% (14/14) | 0% (0/6) |
| locator validity | 100% | 100% | 100% |
| semantic support / preferred evidence | 미측정 | 35.7% preferred | 0% / 0% |
| exception preservation | 0% | 66.7% | 100% unresolved |
| conflict recall | 0% | 28.6% | 71.4% |
| HIGH critical errors | 6 | 0 | 4 |
| core coverage | 없음 | 세 유형 output 회수 실패 | 세 유형 모두 실패 |

v3는 schema 크기와 token 비용을 크게 줄였고 locator 및 silent-drop 안전성은 유지했다. 그러나 context/fact selection precision과 semantic binding validation이 충분하지 않았다. PLAN_B_24를 실행하지 않는다. 다음 benchmark 전에는 semantic task별 deterministic candidate fact를 더 좁히고, source-fact 일치 검증을 유지하며, 공급유형 round-robin과 429 cooldown을 offline/provider fixture로 검증해야 한다.

---

## Benchmark v4 — role-aware fact retrieval, PLAN_A_16

### 결론

v4 fact retrieval은 실행 직전에도 critical fact 41/41, wrong top-ranked fact 0, missing-operator fallback 0을 유지했다. 실제 `gemini-2.5-flash` semantic binding은 v3보다 크게 개선됐지만 **SEMANTIC_READY, PROVIDER_STABLE, ADMIN_REVIEW_READY는 모두 NO**다. PLAN_B_24도 실행하지 않는다.

Oracle target precision은 57/74(77.0%), recall은 28/75(37.3%), semantic evidence support는 60/74(81.1%)로 올랐다. 반면 critical numeric 37/46(80.4%), operator 35/46(76.1%), scope 66/71(93.0%)은 필수 100% 기준에 못 미쳤다. score rule은 생성되지 않아 0/8 coverage이고, 의미가 틀린 target candidate 11건과 HIGH-confidence critical error 14건이 남았다.

### 실행과 provider

PLAN_A는 `YOUTH → NEWLYWED → FIRST_TIME → COMMON`으로 시작해 공급유형별 task를 round-robin 배치했다. 16 semantic task와 전역 retry 2회를 합쳐 hard cap 18회에서 종료했다.

| 항목 | v4 |
|---|---:|
| model | gemini-2.5-flash |
| HTTP calls | 18 |
| successful | 11 |
| HTTP 429 | 3 |
| HTTP 503 | 2 |
| INCOMPLETE_OUTPUT | 2 |
| retry calls | 2 |
| input tokens | 63,675 |
| output tokens | 8,361 |
| thinking tokens | 12,241 |
| total tokens | 84,277 |
| estimated cost | US$0.0706075 |

Task status는 SUCCESS 11, FAILED 1, SKIPPED 3, INCOMPLETE 1이다. `newlywed.financial`은 503 재시도 후 실패했고 `firstTime.financial`, `youth.assets`, `newlywed.exceptions`는 429로 건너뛰었다. `youth.score`는 축소 재시도 후에도 INCOMPLETE_OUTPUT이었다. 공급유형 starvation은 없었지만 provider는 안정적이지 않았다.

### 정직한 metric과 coverage

모든 지표는 numerator, denominator, 평가 coverage, methodology를 artifact에 기록한다. 측정하지 못한 score fidelity는 null이며 100%로 표시하지 않는다.

| 지표 | 결과 | 평가 coverage |
|---|---:|---:|
| Oracle target precision | 57/74 = 77.0% | 74/74 |
| Oracle target recall | 28/75 = 37.3% | 28/75 |
| source-supported extras | 3 | 전체 candidate 분류 |
| unverified extras | 3 | 전체 candidate 분류 |
| confirmed semantic hallucination | 11 | 전체 candidate 분류 |
| numeric fidelity | 37/46 = 80.4% | critical atoms 27/37 |
| operator fidelity | 35/46 = 76.1% | critical atoms 27/37 |
| score fidelity | NOT_MEASURED | score roles 0/8 |
| stage fidelity | 20/20 = 100% | stage roles 12/15 |
| scope fidelity | 66/71 = 93.0% | 71/71 |
| locator validity | 74/74 = 100% | 74/74 |
| semantic evidence support | 60/74 = 81.1% | 74/74 |
| Oracle preferred evidence match | 0/57 = 0% | 57/57 |
| exception preservation | 6/8 = 75% | 8/8 |
| exception relation accuracy | 3/8 = 37.5% | 8/8 |
| conflict recall | 5/7 = 71.4% | 7/7 |
| HIGH-confidence critical errors | 14 | 전체 candidate 분류 |

Preferred evidence 0/57은 locator가 유효하지 않다는 의미가 아니다. 생성 candidate는 주로 table-cell locator를 사용했지만 human oracle은 paragraph locator를 선호했다. 현재 비교기는 정확히 같은 HWP paragraph index 교집합만 인정한다. 두 위치가 같은 표를 가리키는지 검토하기 전에는 성공으로 승격하지 않는다.

### 공급유형 core coverage

- YOUTH: age, housing, subscription, income, stages는 MATCHED. marital과 score는 REVIEW_REQUIRED, assets는 provider 429로 MISSING.
- NEWLYWED: applicant types, housing, subscription은 MATCHED. stages와 score는 REVIEW_REQUIRED, income/assets는 503 task 실패로 MISSING.
- FIRST_TIME: housing, subscription, 600만원, tax, stages는 MATCHED. scoreless는 REVIEW_REQUIRED, income/assets는 provider 429로 MISSING.

생애최초 score rule은 생성되지 않았다. scoreless binding은 있었지만 RuleBuilder가 review 가능한 scoreless 결과로 완성하지 못해 MATCHED로 승격하지 않았다.

### Exception과 conflict

해외체류, 청년 applicant scope, 예비신혼 future household, 출산 특례는 relation이 생성됐다. 생업 목적과 배우자 혼인 전 이력은 unresolved로 보존됐다. 배우자 혼인 전 주택소유와 중복청약 배우자 예외는 MISSING이므로 silent-drop 기준을 통과하지 못했다. 지역우선 기준일 및 관리번호-지구 mapping도 여전히 탐지하지 못했다.

### v1 / v2 / v3 / v4 비교

| 지표 | v1 | v2 | v3 | v4 |
|---|---:|---:|---:|---:|
| HTTP calls | 16 | 16 | 9 | 18 |
| total tokens | 51,699 | 196,215 | 34,419 | 84,277 |
| estimated cost | $0.0384 | $0.2746 | $0.0276 | $0.0706 |
| rules/candidates | 17 | 56 | 20 | 74 |
| target precision | 0% | 8.9% | 0% | 77.0% |
| target recall | 0% | 6.7% | 0% | 37.3% |
| numeric fidelity | N/A | 3/3 | 0/6 | 37/46 |
| operator fidelity | N/A | 14/14 | 0/6 | 35/46 |
| locator validity | 100% | 100% | 100% | 100% |
| semantic support | 미측정 | 부분 측정 | 0% | 81.1% |
| exception preservation | 0% | 66.7% | 100% unresolved | 75% |
| conflict recall | 0% | 28.6% | 71.4% | 71.4% |
| HIGH critical errors | 6 | 0 | 4 | 14 |

v4는 “틀린 후보를 먼저 제거한다”는 retrieval 방향이 유효함을 보여줬다. 동시에 role contract가 아직 중복·인접 조건을 충분히 구분하지 못하고, score binding과 exception relation이 완성되지 않았으며, table-cell과 human preferred paragraph 간 provenance 연결도 부족함을 드러냈다. 다음 단계는 PLAN_B 확대가 아니라 PLAN_A의 role cardinality, stage별 score task 분해, scope contract 강화, 429/503 대응을 먼저 수정하는 것이다.
