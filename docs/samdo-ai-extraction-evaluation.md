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
