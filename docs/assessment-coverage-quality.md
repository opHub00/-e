# Assessment coverage and quality audit

Audit date: 2026-10-05 KST  
Staging project: `krkeiytshxpqojrlrmsx`  
Mode: metadata and active RuleSet reads only; zero user-profile reads, zero result reads, zero remote writes

## 1. Dataset and definitions

The primary operational denominator is the set of non-test announcements currently registered in Staging. It contains two announcements:

| Announcement | Source | Document | Active supplies |
| --- | --- | --- | --- |
| 삼도이동 1지구 토지임대부 공공분양주택 | LOCAL_DRAFT | DRAFT, source-verified | youth, newlywed, firstHome |
| 힐스테이트 고덕엘리스트 A65BL 공공분양주택 | APT_APPLY | OFFICIAL | newlywed, firstHome |

No Staging row matched the explicit test/demo classifier. Repository fixtures and generated review artifacts are not counted as Staging announcements.

The repository separately contains five valid real-announcement import packages. Samdo and Godeok are in Staging. The following three official, deterministic packages are not yet in the Staging import/review/activation/binding lifecycle:

- 광명 시티프라디움 에듀하임 — 16 rules
- 검암역 푸르지오 프라베뉴 (B-1BL) — 28 rules
- 진주 판문지구 레이크써밋 웰가 — 15 rules

Therefore current operational Staging coverage is 2 announcements, while repository-known source coverage is 5 unique real announcements. Only 2/5 (40%) of the known packages are operational in Staging.

For assessment quality, the audit executes the current deterministic engine with no announcement-specific overrides and three synthetic profiles:

1. `complete-general`: reusable V3 facts are broadly known.
2. `partial`: only the five initial onboarding facts are known.
3. `newlywed-special`: reusable married/child/income/asset facts are broadly known.

No real user data is read. Each profile is evaluated against all five Staging listing/supply candidates, producing 15 results.

`System-interpreted` means `COMPLETE + NEEDS_USER_INPUT + INELIGIBLE`. `INELIGIBLE` is a valid deterministic outcome. `UNAVAILABLE` alone indicates a coverage/system-data failure.

## 2. End-to-end Staging funnel

| Stage | Count | Total rate | Previous-stage loss | Measurement |
| --- | ---: | ---: | ---: | --- |
| Operational announcements | 2 | 100% | 0% | Measured |
| Immutable source document | 2 | 100% | 0% | Measured |
| Parsing successful | NOT_MEASURED | — | — | Parsed artifact status is not persisted in the registry |
| Rule extraction successful | NOT_MEASURED | — | — | `rule_extraction_jobs` has 0 rows for the active RuleSets |
| RuleSet exists | 2 | 100% | 0% | Measured |
| Human approval recorded | 2 | 100% | 0% | `approved_at` plus APPROVED admin decision |
| Active + public + approved | 2 | 100% | 0% | Measured |
| Explicit listing binding | 2 | 100% | 0% | Binding points to the active RuleSet |
| Deterministic decoder accepts | 2 | 100% | 0% | Schema 1 decode |
| Portfolio-exposable | 2 | 100% | 0% | At least one supported supply |

Structural assessable coverage inside Staging is 2/2 (100%). Across the five repository-known real packages, operational coverage is 2/5 (40%). These percentages have different denominators and must not be combined.

## 3. Portfolio status distribution

| Profile | COMPLETE | NEEDS_USER_INPUT | INELIGIBLE | UNAVAILABLE |
| --- | ---: | ---: | ---: | ---: |
| complete-general | 0 | 4 | 1 | 0 |
| partial | 0 | 5 | 0 | 0 |
| newlywed-special | 0 | 5 | 0 | 0 |
| **Total** | **0** | **14** | **1** | **0** |

- System-interpreted: 15/15 (100%)
- Structurally unavailable: 0/15 (0%)
- Definitive result (`COMPLETE + INELIGIBLE`): 1/15 (6.7%)
- Eligible complete result: 0/15 (0%)

The engine and RuleSets are working, but the actual Portfolio path cannot finish most assessments because it passes an empty announcement-specific detail object.

## 4. UNAVAILABLE analysis

No UNAVAILABLE result occurred in the 15-result audit, and both operational announcements passed document, active RuleSet, binding and decoder checks. All measured reason counts are zero.

The runtime now exposes only stable categories:

- `NO_ACTIVE_RULE_SET`
- `NO_LISTING_BINDING`
- `DOCUMENT_MISSING`
- `DOCUMENT_PARSE_FAILED`
- `RULE_EXTRACTION_FAILED`
- `RULE_REVIEW_PENDING`
- `INVALID_RULE_SET`
- `UNSUPPORTED_SCHEMA`
- `UNRESOLVED_CRITICAL_RULE`
- `SOURCE_DOCUMENT_REVALIDATION_REQUIRED`
- `SERVER_REPOSITORY_ERROR`

Unknown database/provider messages are logged server-side and map to `SERVER_REPOSITORY_ERROR`; raw details are no longer returned as a Portfolio item failure code.

## 5. Missing user information

Top current missing facts among the 14 NEEDS_USER_INPUT results:

| Fact | Results | Listings | V3 persistence | Onboarding |
| --- | ---: | ---: | --- | --- |
| `exceptionsClear` | 14 | 2 | No; announcement-specific | None |
| `accountKindEligible` | 5 | 2 | Yes (`subscriptionAccount.kind`) | Progressive |
| `accountMonths` | 5 | 2 | Yes (`openedAt`) | Progressive |
| `childbirthClear` | 5 | 2 | Not as a direct boolean | None |
| `noReWinningRestriction` | 5 | 2 | Yes | Progressive |
| `noSpecialRestriction` | 5 | 2 | Yes | Progressive |
| `noSpecialSupplyHistory` | 5 | 2 | Not mapped to progressive field | None |
| `overseasClear` | 5 | 2 | History exists, but no progressive field | None |
| `recognizedPaymentCount` | 5 | 2 | Yes | Progressive |
| `dualIncome` | 4 | 2 | Yes | Progressive |

`exceptionsClear` is the universal blocker. It is intentionally not a permanent profile fact because it is an announcement-specific declaration. The Portfolio flow needs a listing-scoped answer/override store and must feed that value into trusted server execution.

The audit also observed explicit review requirements: childbirth review affected six results across the three supplies, and the first-home household review affected one result. These are announcement-side review states, not values to infer from a user profile.

## 6. Supply-type RuleSet coverage

| Supply | Announcements | RuleSets | Active RuleSets | Assessable listings | Rules |
| --- | ---: | ---: | ---: | ---: | ---: |
| youth | 1 | 1 | 1 | 1 | 24 |
| newlywed | 2 | 2 | 2 | 2 | 51 |
| firstHome | 2 | 2 | 2 | 2 | 46 |

General supply, multi-child, institutional recommendation and other supply types have no rows in the measured Staging dataset. Their coverage is **DATA_NOT_AVAILABLE**, not 0% accuracy.

## 7. Rule extraction and review lifecycle

The active sets contain 121 rules and 121 evidence rows. Review data contains 120 APPROVED rules, one APPROVED_WITH_EDIT rule, 121 VALID evidence reviews, one resolved conflict, three resolved unresolved-items, five linked exceptions and ten independent exceptions. No critical unresolved row remains open.

Two lifecycle gaps remain:

1. Parsing and extraction provenance cannot be reconstructed: there is no persisted parse status and `rule_extraction_jobs` is empty.
2. Both review workspaces still say `IN_REVIEW` even though the canonical RuleSets have approval decisions and are active/public. Activation safety is intact, but operational dashboards can misread the workspace state.

Existing Gemini benchmarks remain historical quality evidence. This audit made zero LLM calls.

## 8. Deterministic engine capability

Both active RuleSets decode successfully. Observed invalid RuleSets: 0. Observed unsupported schemas: 0. The active data uses the current `eq`, `gte`, and `lte` expression contract, so no new operator is required by the measured dataset.

The main quality gap is orchestration input, not an unsupported deterministic operator. Several announcement-scoped facts (`exceptionsClear`, engaged/single-parent category, household five-year winning history) cannot be produced by the current reusable profile alone.

## 9. Ranked bottlenecks

| Rank | Class | Bottleneck | Affected scope | Difficulty | Regression risk | Expected effect |
| ---: | --- | --- | --- | --- | --- | --- |
| 1 | Medium | Three validated official packages are not in Staging lifecycle | 3 of 5 known announcements | Medium | Medium | Operational known-package coverage 40% → up to 100%, after human review |
| 2 | Medium | No listing-scoped answer persistence for `exceptionsClear` and related qualifiers | 14/15 benchmark results | Medium | Medium | Removes the universal user-input blocker; one current result has a direct one-field completion impact |
| 3 | Quick Win, completed | V3 account kind and household size were not projected to engine facts | 18 missing-fact occurrences | Low | Low | Missing occurrences 131 → 113 (-13.7%); status unchanged because other blockers remain |
| 4 | Medium | Review workspace lifecycle disagrees with active approval state | 2/2 active RuleSets | Medium | Medium | Reliable admin coverage metrics and less operational ambiguity |
| 5 | Long-term | Parse/extraction lineage is absent | 2/2 active RuleSets | Medium | Low | Enables measurable early funnel and failure attribution |
| 6 | Long-term | No data/rules for other supply families | Entire unmeasured supply families | High | High | Extends addressable market only after source and oracle coverage exist |

## 10. Quick Wins implemented

### V3 fact projection

- `subscriptionAccount.kind` now supplies `accountKindEligible` deterministically: known supported kinds → true, `OTHER` → false, UNKNOWN → undefined.
- `household.memberCount` now supplies `incomeHouseholdSize`.
- The misleading `currentReWinningRestriction → householdNoWinningFiveYears` profile-field mapping was removed because current restriction and five-year household history are not equivalent.

This removed 10 account-kind and 8 household-size missing occurrences. Portfolio status counts did not change because `exceptionsClear` and other announcement-specific inputs still block completion.

### Stable failure reasons

Raw thrown messages no longer become client-visible Portfolio reason codes. The server logs raw detail and returns a stable, typed reason. This changes observability only; deterministic eligibility, stage and score semantics are unchanged.

## 11. Regression fixtures

Added regression coverage verifies:

- operational rows remain separate from explicit TEST/FIXTURE/DEMO rows;
- unavailable parsing/extraction measurements remain null instead of becoming false 0%;
- `INELIGIBLE` counts as a successful deterministic interpretation;
- missing-fact frequency and one-field completion impact;
- known and unknown Portfolio errors map to safe stable codes;
- V3 account kind and household size reach the engine;
- unknown account kind stays unknown and `OTHER` deterministically fails eligibility;
- five-year household history is not falsely represented by current re-winning restriction.

## 12. Operations metrics contract

`CoverageOperationsMetrics` exposes:

- `totalActiveListings`
- `assessableListings`
- `unavailableListings`
- `activeRuleSetCoverageRate`
- `listingBindingCoverageRate`
- `unavailableByReason`
- `missingFactTopN`
- `assessmentSuccessRate`
- `staleResultCount`

`staleResultCount` is null in this audit because user assessment rows were deliberately not read. A future trusted aggregate RPC can supply it without exposing owner data.

## 13. Proposed release gates

The next release should use these evidence-based gates:

1. **Known-package operational coverage:** 5/5 (100%). The three missing packages already pass offline package and deterministic regression checks; the remaining work is controlled import, review and binding.
2. **Active listing structural coverage:** keep RuleSet, approval, binding and decoder coverage at 100% for every active Portfolio listing.
3. **Safety:** invalid active RuleSet = 0, unsupported active schema = 0, unresolved critical rule = 0, evidence-less active critical rule = 0.
4. **Honesty:** parsing/extraction metrics must remain NOT_MEASURED until lineage is persisted; they must not be reported as 100%.
5. **User completion:** before setting a percentage gate, implement listing-scoped inputs and remeasure the same 15-case pack. Until then, require that `exceptionsClear` is no longer a universal blocker and that every rich fixture produces at least one definitive result per supported announcement.
6. **Regression:** deterministic assessment, owner/RLS, UNKNOWN preservation and no-inference tests must remain at zero failures.

## Reproduction

Run with explicit Staging environment variables:

```text
npm run analyze:assessment-coverage:staging
```

The script refuses non-Staging targets, refuses the configured Production ref, reads no user profile/result table and performs no writes.

