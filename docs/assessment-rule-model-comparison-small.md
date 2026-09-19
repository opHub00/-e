# ApplicationAssessment frozen SMALL model comparison

## 결론

Samdo VER1.7의 동일한 frozen SMALL 입력으로 `gemini-2.5-flash`와 `gemini-3.1-pro-preview`를 비교했다. frozen pack은 재생성하지 않았고 hash는 실행 전후 모두 `90936b302840fc046a4fe70f5b3845eb8121b365066f5845482adeff5b9c889b`였다. human-verified 75개 rule은 모든 provider 호출과 마지막 retry가 끝난 뒤에만 evaluator가 읽었다.

두 모델의 품질 비교는 **미완료**다. Gemini 2.5 Flash는 6개 중 5개 task를 완료했지만 provider error가 발생해 `PROVIDER_UNSTABLE`이다. Gemini 3.1 Pro Preview는 모델 목록에서 확인됐으나 6개 task와 cooldown 후 retry 1개가 모두 HTTP 429여서 semantic 표본이 없고 `INSUFFICIENT_SAMPLE`이다. 따라서 FULL benchmark는 권장하지 않는다.

## Frozen input과 SMALL profile

- pack version: `samdo-semantic-binding-v4.1`
- hash: `90936b302840fc046a4fe70f5b3845eb8121b365066f5845482adeff5b9c889b`
- retrieval regeneration: 없음
- oracle 포함: 없음
- provider별 task, fact, source, role contract, output contract: 동일

SMALL 6개 task는 변경하지 않았다.

1. `youth.income`
2. `youth.assets`
3. `newlywed.financial`
4. `newlywed.score`
5. `firstTime.coreEligibility`
6. `firstTime.financial`

## Provider와 compatibility

| 구분 | Provider A | Provider B |
|---|---|---|
| provider | Google Gemini REST | Google Gemini REST |
| model | `gemini-2.5-flash` | `gemini-3.1-pro-preview` |
| key | 기존 server-only `GEMINI_API_KEY` | 동일 key |
| model discovery | 사용 가능 목록에서 확인 | 사용 가능 목록에서 확인 |
| compatibility | `COMPATIBLE` | `UNCONFIRMED` |
| 분류 | `PROVIDER_UNSTABLE` | `INSUFFICIENT_SAMPLE` |

새 SDK나 API key는 추가하지 않았다. Provider B의 첫 frozen task를 compatibility probe로 사용했으며 원문 없는 별도 probe는 실행하지 않았다. 모델 목록 확인 요청은 semantic inference call 수에 포함하지 않고 별도로 수행했다.

## 호출, 안정성, 비용

| 항목 | Provider A | Provider B |
|---|---:|---:|
| semantic task calls | 6 | 6 |
| retries | 1 | 1 |
| 총 HTTP calls | 7 | 7 |
| completed tasks | 5/6 | 0/6 |
| HTTP 503 | 1 | 0 |
| HTTP 429 | 1 | 7 |
| input tokens | 15,417 | 미보고 |
| output tokens | 2,770 | 미보고 |
| thinking tokens | 4,817 | 미보고 |
| total tokens | 23,004 | 미보고 |
| estimated cost | US$0.0235926 | US$0 |

Provider B의 US$0은 무료 실행을 뜻하지 않는다. 모든 요청이 inference 전에 429로 거절되어 usage가 보고되지 않았다는 뜻이다. 전체 semantic call은 hard cap 14회를 모두 사용했고 예상 비용은 US$0.0235926이었다. API key와 전체 source context는 artifact에 기록하지 않았다.

Provider A 완료 상태:

- SUCCESS: `youth.income`, `youth.assets`, `newlywed.financial`, `newlywed.score`, `firstTime.coreEligibility`
- FAILED: `firstTime.financial` — HTTP 429

Provider B는 모든 task가 HTTP 429였고, cooldown 뒤 `youth.income` retry도 HTTP 429였다.

## v4.1 validation 결과

두 provider에 동일한 role contract, fact/source consistency, income, asset, score, range, scope, exception relation, semantic evidence 및 confidence guard를 적용했다.

| 항목 | Provider A | Provider B |
|---|---:|---:|
| raw bindings | 27 | 0 |
| accepted rules | 10 | 0 |
| review required | 7 | 0 |
| rejected bindings | 13 | 0 |

Provider A의 13개 rejection은 실행 실패가 아니라 guard가 위험한 binding을 차단한 결과다.

- 청년 소득 role에 70/100/80/90을 상한으로 붙인 binding 4개
- 신혼 자산의 literal/scope가 맞지 않은 binding 3개
- point와 max-score fact를 함께 제공하지 않은 신혼 score binding 6개

Provider B의 0개 rule과 0개 error는 안전하다는 증거가 아니다. semantic response가 한 건도 없었으므로 모든 의미 품질 지표는 `NOT_MEASURED`다.

## 측정 지표

### Provider A — Gemini 2.5 Flash

| 지표 | 결과 | coverage | 방법 |
|---|---:|---:|---|
| Oracle target precision | 17/17 = 100% | 17/17 built rules | v4.1 guard 후 oracle target mapping과 deterministic semantic check를 모두 통과한 rule |
| Oracle target recall | 12/75 = 16% | 12/75 oracle rules | SMALL이 도달한 고유 oracle rule |
| Numeric fidelity | 13/13 = 100% | 10/15 expected atoms | rule value와 bound fact value/unit 비교 |
| Operator fidelity | 13/13 = 100% | 10/15 expected atoms | deterministic fact operator 비교 |
| Score fidelity | `NOT_MEASURED` | 0/4 score roles | score binding 6개가 point/max pair guard에서 거부됨 |
| Stage fidelity | `NOT_MEASURED` | stage task 없음 | SMALL에 stage task가 없음 |
| Scope fidelity | 17/17 = 100% | 17/17 rules | bound fact scope와 role contract 교집합 |
| Locator validity | 17/17 = 100% | 17/17 rules | `validateEvidence` 통과 |
| Semantic evidence support | 17/17 = 100% | 17/17 rules | role별 literal/phrase와 source context 검사 |
| Oracle preferred evidence | `NOT_MEASURED` | preferred locator map 없음 | semantic support와 분리 |
| Exception preservation/relation | `NOT_MEASURED` | exception task 없음 | SMALL 범위 밖 |

Post-guard source-supported extra 0, unverified extra 0, confirmed hallucination 0, HIGH-confidence critical error 0이다. Safety blocker도 평가된 17개 rule에서는 모두 0이다. 이는 raw model output 전체가 안전했다는 뜻이 아니다. 27개 raw binding 중 13개를 host가 거부했고 first-time financial task는 provider failure로 평가하지 못했다.

비용 효율은 참고값이다.

- completed task당 US$0.00471852
- completed task당 4,600.8 tokens
- accepted safe rule당 비용의 역수: 423.86 rules/US$

### Provider B — Gemini 3.1 Pro Preview

Precision, recall, numeric, operator, score, stage, scope, locator, semantic evidence, preferred evidence, exception 및 hallucination은 모두 `NOT_MEASURED`다. 각 metric은 numerator/denominator를 `null`, coverage를 0으로 기록한다. 관찰된 blocker 0을 안전성 근거로 사용하지 않는다.

## Safety blockers와 label

Provider A는 평가된 post-guard rule에서 다음 blocker가 0이었다.

- `CRITICAL_HALLUCINATION`
- `WRONG_NUMERIC_BINDING`
- `WRONG_OPERATOR_BINDING`
- `WRONG_SCORE_BINDING`
- `WRONG_SCOPE_BINDING`
- `SILENT_EXCEPTION_LOSS`
- `HIGH_CRITICAL_ERROR`

그러나 task completion이 5/6이고 503/429가 발생해 label은 `PROVIDER_UNSTABLE`이다. Provider B는 0/6 completion이므로 `INSUFFICIENT_SAMPLE`이다. 비교 가능한 두 semantic sample이 없으므로 모델 ranking이나 winner를 만들지 않는다.

## 다음 단계

`FULL_BENCHMARK_RECOMMENDED = NO`다.

다음 실행 전 blocker는 Provider B quota/availability 확인과 Provider A의 429/503 안정성이다. Provider B가 SMALL 6개 task의 유효 표본을 만들 수 있는 환경을 확보한 뒤 **동일 hash의 frozen pack**으로 SMALL만 다시 실행한다. Provider A도 score와 first-time financial coverage가 없는 상태라 FULL 후보로 바로 올리지 않는다.

이번 benchmark에서는 Supabase/DB write, import, review queue 생성, approve, activate, FULL_PLAN_A 실행을 하지 않았다.
