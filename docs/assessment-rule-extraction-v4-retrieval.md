# ApplicationAssessment Rule Extraction v4: fact retrieval

## 1. v3 failure analysis

v3 successfully kept locators valid, but it selected sources first and then truncated facts in document order. Valid locators therefore pointed to semantically wrong values. Examples included childbirth-relaxation percentages in `youth.income`, subscription savings in an asset task, and missing age, asset, tax, and score facts. A valid locator is only a structural property; it does not establish semantic support.

The v3 benchmark metric path also mixed measured comparisons with hand-authored safe values. v4 removes that path. Unmeasured values are now `null` with `measured: false`.

## 2. Metric audit

`buildV3MetricInput` derives metric input from candidate reviews, rejected/unresolved outputs, conflict reviews, task coverage, and explicit source reviews. Each metric reports:

- numerator and denominator
- whether it was measured
- evaluated coverage and the known universe
- the comparison methodology

An unmatched extra defaults to `NEEDS_HUMAN_REVIEW`. It can only become `SOURCE_SUPPORTED`, `UNVERIFIED_EXTRA`, or `HALLUCINATION` through an explicit review result. Evidence remains split into locator validity, semantic support, and oracle-preferred evidence match.

## 3. Deterministic fact contracts

Each semantic role defines allowed fact types and units, required and forbidden context, preferred table identities, applicant scope, operator requirements, and a per-role top-K. Examples:

- youth income accepts percent/KRW facts in youth income context and rejects childbirth relaxation, assets, and subscription context;
- first-time assets accept KRW facts in total-asset context and reject subscription, deposit, prepayment, and 6-million-won savings context;
- first-time subscription savings accepts KRW facts in subscription/prepayment context;
- score roles select score/range facts and the threshold type appropriate to that score component.

## 4. Context and scope tags

Facts carry deterministic tags for supply type and subject area, plus applicant scopes:

`YOUTH`, `NEWLYWED`, `FIRST_TIME`, `INCOME`, `ASSET`, `SUBSCRIPTION`, `SCORE`, `STAGE`, `RESIDENCE`, `AGE`, `TAX`, `EXCEPTION`, and `CHILDBIRTH_RELAXATION`.

Applicant scope is preserved as `APPLICANT`, `HOUSEHOLD`, `FUTURE_HOUSEHOLD`, `SPOUSE`, `PARENT`, or `CHILD`. Table row/column headers and merged-cell coverage are used to recover supply scope without an LLM.

## 5. Table classification

Tables are classified from captions, cells, nearby supply sections, and row/column headers as income, asset, youth score, newlywed score, stage, subscription, or unknown. Unknown remains explicit. Table IDs are not hard-coded as semantic truth.

Score tables produce deterministic `SCORE_VALUE` facts from score cells. `MAX_SCORE` is derived by summing the maximum score of each visible component group. This yields the source-table totals 9 and 12 without sending an oracle answer to the LLM.

## 6. Ranges and operators

Expressions such as `70% 초과 100% 이하` and `12회 이상 24회 미만` are preserved as one range fact with both bounds and operators. Korean operators are parsed deterministically. `가입 6개월 경과` is normalized to `>= 6 months`, and `7년 이내` to `<= 7 years`.

The RuleBuilder no longer converts a missing numeric operator to equality. It emits `MISSING_OPERATOR` or `AMBIGUOUS_OPERATOR_BINDING`. Equality is limited to roles whose source meaning is deterministic, such as boolean eligibility, score cells, and supply ratios.

## 7. Ranking and visibility

Ranking uses type/unit compatibility, supply scope, context tags, semantic keywords, table identity, applicant scope, operator binding, stage context, and score-cell priority. Forbidden context is removed before ranking.

Each plan row records available facts, facts after type and context filtering, selected facts, source counts, truncation, dropped facts, and per-role readiness. A task with missing required facts or operators is skipped before a provider call.

## 8. Exception handling

Strong markers (`단`, `다만`, `제외`, `예외`, `불구하고`, `특례`) work alone. Contextual words (`배우자`, `혼인 전`, `해외체류`, `생업`, `출산`) require supporting context. This avoids treating every occurrence of “배우자” or “의 경우” as an exception while preserving meaningful exception sources.

`youth.exceptions`, `newlywed.exceptions`, and `firstTime.exceptions` are present in both plans. Exception context prevents HIGH host confidence. Internal review priority distinguishes `AUTO_SAFE_CANDIDATE`, `REVIEW_REQUIRED`, and `UNRESOLVED`; none of these statuses approve or activate a rule.

## 9. Plans

`PLAN_A_16` contains common regional priority plus core, financial, stage, score, and exception tasks for all three supply types. `PLAN_B_24` is a strict superset of every PLAN_A task and adds detailed diagnostic tasks. This invariant is tested.

## 10. Samdo offline scorecard

The VER1.7 ParsedDocument was evaluated without an AI call.

| Scope | Critical facts retrieved | Coverage | Known wrong high-ranked facts |
|---|---:|---:|---:|
| Youth | 12 / 12 | 100% | 0 |
| Newlywed | 15 / 15 | 100% | 0 |
| First-time | 14 / 14 | 100% | 0 |
| Total | 41 / 41 | 100% | 0 |

The score table gate found 1, 2, and 3-point values and derived 9 and 12-point maxima. Missing-operator fallback count is zero. PLAN_B superset and exception-task presence both pass. The local artifact is written below `.ingestion` and is excluded from Git.

This scorecard measures candidate retrieval only. It does not claim that future LLM semantic bindings are correct.

## 11. Ready gate

Gemini remains blocked unless all conditions pass:

- critical fact retrieval coverage is 100%;
- known wrong-fact regressions are zero;
- missing-operator fallback is zero;
- score table fact coverage is 100%;
- PLAN_B is a superset of PLAN_A;
- exception tasks are present;
- metric honesty tests pass;
- the full regression suite passes.

At this revision, the offline gate is `FACT_RETRIEVAL_V4_READY = YES`. No Gemini, Supabase, import, review, approval, or activation call was performed.
