# Product V3 domain/backend architecture

## Boundary

Product V3 adds a generic notice platform around the already verified Samdo evaluators. It does not change Samdo eligibility, priority, official-score, recommendation, simulation, QR, or RAG provenance semantics.

The platform is additive:

- `features/noticePlatform/types.ts`: generic `Notice`, `Listing`, `Complex`, `SupplyType`, `RulePackage`, `Rule`, `AssessmentFact`, `Assessment`, `OfficialScore`, `Recommendation`, `RAGSource`, and `ComparisonResult` contracts.
- `features/noticePlatform/platform.ts`: notice registry and the six public APIs.
- `features/eventKiosk/noticePlatform/samdoAdapter.ts`: announcement-specific migration adapter for Samdo 1/2 final 1.8, kept outside the generic core.
- `features/productV3/admin/**`: server-only operational contracts, staging workflow, metrics, and telemetry adapter.
- `features/productV3/copilot/**`: deterministic planner, next-best-question ranking, safe prompt context, read-only policy executor, comparison view model, and clone-only simulation.

## Generic notice APIs

```ts
assessNotice(profile, noticeId)
assessNotices(profile, noticeIds)
compareAssessmentResults(results)
retrieveNoticeEvidence(noticeId, query)
getNoticePresentation(noticeId)
getActiveNotices()
```

`NoticePlatform` accepts injected adapters, so tests and future providers can register N notices. Registration rejects duplicate IDs and any mismatch among notice, Rule Package, and RAG notice IDs. The default event composition lives under `features/eventKiosk/noticePlatform`, which keeps announcement names and regional literals out of the generic core and satisfies the hard-code guard without disabling it.

Adding a verified notice requires:

1. Notice/listing metadata.
2. An approved Rule Package and evaluator adapter.
3. A notice-scoped RAG source with locator/provenance.
4. Registry activation.

No Samdo route or visual component needs to be copied.

## Compatibility

`buildSamdoDistrictAssessment(input, districtId)` is the narrow compatibility boundary. The legacy `buildSamdoDualAssessment` calls it twice, while the generic Samdo adapters call it once per notice. Nine Samdo persona snapshots are checked against the generic output field by field.

## Admin operation backend

The Admin Console consumes presentation contracts rather than raw tables:

- `AdminDashboardViewModel`
- `NoticeAdminViewModel`
- `RulePackageReviewViewModel`
- `AiMonitoringViewModel`
- `AssessmentMonitoringViewModel`

`AdminOperationService` is staging-only. In a `production` runtime every mutation throws `PRODUCTION_ADMIN_MUTATION_DISABLED`. Rule Packages can transition only:

`DRAFT → IN_REVIEW → APPROVED → ACTIVE`

An ACTIVE package is immutable through this service. Every accepted mutation creates an audit record with actor, action, entity, before, after, reason, and timestamp in the same store replacement.

The existing announcement/rule-review tables remain the source of truth for imported rules. The additive migration `20261016054748_product_v3_operations.sql` adds only:

- sanitized AI request telemetry;
- aggregate assessment telemetry;
- append-only admin audit records.

All three tables have RLS enabled, no `anon`/`authenticated` privileges, and service-role-only select/insert. The migration was verified only in isolated PGlite; it was not applied to any remote environment.

## Assessment Copilot

`planCopilotAction` returns an explicit policy plan. The LLM may propose language but never executes a plan. `runCopilotTurn` authorizes a known read-only plan, evaluates the selected notices with the deterministic engine, and produces a presentation-safe context.

Next-best-question ranking is deterministic and weighs:

1. number of notices and live supply types affected;
2. a possible cross-supply eligibility blocker;
3. priority-stage impact;
4. official-score impact;
5. recommendation impact;
6. evidence completeness.

`expectedInformationGain` is internal only. Facts already answered, explicitly unknown, skipped, or answered through an alias are excluded. `DOES_NOT_KNOW` remains unresolved in the assessment but is not asked again.

What-if evaluation accepts only `details.*` overrides, clones the input, reruns the same evaluators, and returns `{ baseline, overrides, simulatedResult, diffs }`. It has no persistence capability.

## Privacy and monitoring

Copilot prompt context excludes the raw profile, internal fact IDs, QR tokens, exact income/assets, and answer-state keys. The existing Gemini handler can emit a sanitized telemetry record through `EventChatDependencies.monitor`; monitoring failure never changes the user answer.

No API key, profile, raw QR token, internal fact key, or exact private financial value is stored in the Product V3 telemetry contract.

## Verification

- `npm run test:product-v3`: generic platform, N-notice fixture, contamination guards, admin workflow, monitoring/privacy, Copilot A–H, simulation, and comparison.
- `npm run test:product-v3-db`: isolated PGlite migration/RLS/audit checks.
- Existing event-chat, event-kiosk, Samdo persona, and full repository suites remain authoritative regressions.

## Remaining technical debt

- The registry is static code. A future server-side approved-notice loader should populate adapters from the reviewed rule registry without allowing client-side activation.
- The migration is committed but intentionally not applied. Environment-specific rollout, service-role wiring, retention policy, and data-volume monitoring need separate approval.
- `AdminOperationStore` ships with an in-memory staging implementation. Production-like notice/rule mutations must reuse the existing authenticated rule-review RPCs rather than serializing whole snapshots.
- The current event UI still calls the Samdo compatibility path. Claude can migrate view adapters to the generic contracts without changing domain semantics.
