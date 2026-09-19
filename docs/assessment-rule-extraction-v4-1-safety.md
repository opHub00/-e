# ApplicationAssessment Rule Extraction v4.1 semantic safety

## 상태와 범위

이 단계는 Samdo VER1.7의 v4 provider 결과를 오프라인에서 재생해 semantic binding 안전성을 강화하고, 이후 모델 비교에 사용할 동일 입력 묶음을 만드는 작업이다. AI API, Supabase, Rule DB import, review, approve, activate는 실행하지 않았다.

## v4 실패 분석

v4의 retrieval은 critical fact 41/41을 후보에 포함했지만, 모델은 올바른 후보 안에서도 다른 의미의 fact를 선택했다. locator가 실재한다는 사실은 그 locator가 semantic role을 뒷받침한다는 뜻이 아니었다.

v4의 11개 확인된 hallucination과 14개 HIGH critical error는 다음 유형으로 분류했다.

| 유형 | 대표 사례 | 차단 계층 |
|---|---|---|
| `WRONG_SEMANTIC_ROLE` | 청년 최저 나이에 65세/14세, 청년 소득 상한에 70/100/80/90%, 납입 최소에 24회 | role literal guard |
| `WRONG_FACT_BINDING` | 범위의 한쪽 경계만 선택, score가 아닌 수치를 score로 선택 | range/score guard |
| `WRONG_SCOPE` | 신혼 납입 규칙의 세대 범위, 청년 부모 자산을 신청자 자산으로 결합 | scope guard |
| `WRONG_EXCEPTION_RELATION` | 해외체류·배우자·출산 예외가 base rule 없이 존재 | exception relation validator |
| `WRONG_CATEGORY` | 600만원 청약저축을 자산으로 취급, 생애최초에 score 생성 | asset/savings/score guard |
| `WRONG_STAGE` | 단계별 공급비율 또는 소득 기준을 다른 단계로 결합 | host task stage + exact role guard |
| `EVIDENCE_SEMANTIC_MISMATCH` | 존재하는 locator가 다른 표·문맥을 가리킴 | semantic evidence guard |

한 오류가 여러 유형에 속할 수 있다. v4.1 replay의 자동 taxonomy는 guard가 실제로 낸 차단 사유만 집계하며, 사람의 사후 분류를 수치에 섞지 않는다.

## Critical role validation

`AGE`, `HOUSING`, `SUBSCRIPTION`, `INCOME`, `ASSET`, `TAX_HISTORY`, `SAVINGS`, `STAGE`, `SCORE`, `SCOPE`, `EXCEPTION`을 critical role로 등록했다. provider binding은 기존 fact contract와 다음 v4.1 guard를 모두 통과해야 RuleBuilder에 도달한다.

### Income guard

- `INCOME` context가 필수다.
- `ASSET`, `SUBSCRIPTION`, `CHILDBIRTH_RELAXATION` 전용 문맥을 거부한다.
- 공급유형과 단계별 허용 의미를 확인한다.
- 청년 140%, 신혼 130/140/200%, 생애최초 100/120/130/140/200%를 서로 교환하지 않는다.

### Asset and savings guard

- 자산은 `MONEY`와 `ASSET` context가 모두 필요하다.
- 청약저축과 소득 금액은 자산으로 사용할 수 없다.
- 청년 신청자 276백만원은 `APPLICANT`, 부모 1,034백만원은 `PARENT`, 신혼·생애최초 362백만원은 `HOUSEHOLD` 범위를 확인한다.
- 생애최초 600만원은 `SAVINGS`와 `SUBSCRIPTION` 문맥으로만 처리한다.

### Score and range guard

- score role은 `SCORE_VALUE` 또는 `MAX_SCORE` fact만 받는다.
- 생애최초 score role은 `CRITICAL_SCORE_VIOLATION`으로 거부한다.
- `70% 초과 100% 이하` 같은 `RangeFact`가 있으면 한쪽 scalar 경계만 선택한 binding은 `PARTIAL_RANGE_BINDING`으로 거부한다.

### Scope and stage guard

- `APPLICANT`, `HOUSEHOLD`, `FUTURE_HOUSEHOLD`, `SPOUSE`, `PARENT`, `CHILD`를 별도로 검사한다.
- stage는 모델 출력이 아닌 task definition에서만 온다.
- 단계별 공급비율은 host의 exact role contract와 operator를 모두 통과해야 한다.

## Exception relation validation

지원하는 최소 relation type은 `LIMITED_BY`, `EXEMPTED_BY`, `OVERRIDDEN_BY`, `QUALIFIED_BY`, `APPLIES_ONLY_IF`다. exception 존재만으로 보존 성공으로 계산하지 않는다. base, exception, relation 및 relation type을 함께 검사해 `LINKED`, `ORPHAN_EXCEPTION`, `MISSING_EXCEPTION`, `WRONG_RELATION`으로 분류한다.

v4 artifact의 exception rule 8개에는 실제 relation이 없어서 v4.1 기준 orphan 8개다. 이는 자동 승인 가능한 상태가 아니다.

## Confidence v4.1

critical role은 단일 locator만으로 HIGH가 되지 않는다. HIGH는 deterministic fact type, exact role contract, exact scope, semantic evidence guard, 완전한 range, exception/conflict 없음, parser warning 없음, 인식된 table identity를 모두 만족할 때만 가능하다. 나머지는 `MEDIUM` 또는 `REVIEW_REQUIRED`다.

Samdo v4 replay 결과:

| 항목 | 수 |
|---|---:|
| 기존 rules | 74 |
| v4.1 accepted | 21 |
| v4.1 review required | 32 |
| v4.1 rejected | 21 |
| 기존 HIGH critical errors | 14 |
| HIGH로 남은 critical errors | 0 |

자동 guard taxonomy는 `WRONG_SEMANTIC_ROLE` 19건, `WRONG_FACT_BINDING` 2건을 기록했다. scope/exception/evidence의 전체 정확도 평가는 relation과 oracle review가 추가로 필요하므로 guard count를 곧바로 전체 오류 수로 해석하지 않는다.

## Evidence equivalence

preferred evidence는 다음 네 상태로 평가한다.

- `EXACT_LOCATOR_MATCH`: locator가 정확히 동일하다.
- `EQUIVALENT_SOURCE_SUPPORT`: 같은 block 또는 같은 table의 동등한 cell이다.
- `DIFFERENT_BUT_VALID`: locator는 다르지만 semantic guard를 통과하는 유효 근거다.
- `SEMANTIC_MISMATCH`: role을 뒷받침하지 않는다.

따라서 table cell과 oracle paragraph의 locator가 다르다는 이유만으로 semantic support를 실패 처리하지 않는다.

## Frozen benchmark pack

Samdo PLAN_A의 retrieval 결과를 provider-independent pack으로 만든다. pack에는 task id, scope, candidate facts, source context, role 목록, minimal schema와 profile만 포함한다. human-verified rule과 oracle 답은 포함하지 않는다.

- pack version: `samdo-semantic-binding-v4.1`
- Samdo local pack hash: `90936b302840fc046a4fe70f5b3845eb8121b365066f5845482adeff5b9c889b`
- `SMALL`: 6개 task
- `FULL_PLAN_A`: 16개 task

hash는 canonical JSON의 SHA-256이다. provider 실행 전후 hash를 재검증하므로 adapter가 입력을 수정하면 실패한다. pack은 `.ingestion` 아래 local artifact이며 Git에 넣지 않는다.

### SMALL profile

`youth.income`, `youth.assets`, `newlywed.financial`, `newlywed.score`, `firstTime.coreEligibility`, `firstTime.financial`로 provider 호환성과 어려운 의미 결합을 먼저 확인한다.

### FULL_PLAN_A profile

기존 PLAN_A_16의 16개 task를 동일 순서와 동일 fact/source 입력으로 사용한다. SMALL을 통과한 모델만 실행 대상으로 삼는다.

## Provider comparison protocol

`BenchmarkProvider`는 `id`, `model`, `bind(frozenTask)`만 구현한다. 기존 structured provider는 adapter로 감싸며 SDK를 domain에 추가하지 않는다. 모델마다 retrieval을 재실행하지 않고 동일 pack hash를 사용한다.

비교 metric은 oracle precision/recall, numeric/operator/score/stage fidelity, semantic evidence support, scope fidelity, exception relation accuracy, hallucination, HIGH critical error, task completion, provider error rate, tokens와 cost다. 모든 비율은 numerator, denominator, coverage, methodology를 보존한다.

모델 분류는 `SEMANTIC_SAFE`, `SEMANTIC_UNSAFE`, `PROVIDER_UNSTABLE`, `INSUFFICIENT_SAMPLE`다. 단순 F1로 최고 모델을 선택하지 않는다. critical hallucination, 잘못된 numeric/operator/score/scope binding, silent exception loss, HIGH critical error 중 하나라도 있으면 safety blocker다.

## 다음 benchmark 절차

1. local Samdo parsed document로 frozen pack을 다시 만들고 hash가 동일한지 확인한다.
2. SMALL profile을 provider별로 실행한다.
3. v4.1 semantic guard와 relation validator를 적용한다.
4. provider 호출이 모두 끝난 후에만 oracle을 읽는다.
5. safety blocker가 없는 provider만 FULL_PLAN_A 대상으로 제안한다.
6. 실제 실행은 별도 승인 후 진행한다.

현재 `MODEL_COMPARISON_READY = YES`다. 이는 비교 harness가 준비되었다는 뜻이며 어떤 모델도 안전하다고 승인했다는 뜻은 아니다.
