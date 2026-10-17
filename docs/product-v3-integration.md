# Product V3 integration contract

`integration/product-v3` merges the generic notice/domain work with the responsive UI. The Product V3 notice platform is the assessment source of truth; the Samdo 1·2 adapters remain compatibility layers for the current event experience.

## Admin console

- Browser route: `/admin/console`; server transport: read-only `GET /admin-api/product-v3`.
- The browser sends the current access token. The server independently checks the existing review-access RPC before returning a presentation-only `ConsoleSnapshot`.
- The snapshot maps `AdminDashboardViewModel`, notice/rule review, assessment monitoring, AI monitoring and audit records. The UI does not query Supabase tables directly.
- `?demo=1` uses labelled sample data only when Demo Mode is enabled. Connected mode never mutates rules; the local approval interaction is demo-only.
- The Product V3 migration is committed but is **not** applied to any remote database. Until an approved staging migration and monitoring writer exist, monitoring panels show a visible unavailable warning instead of invented activity.

## Copilot

- `noticePlatform.assessNotices`, `getNextBestQuestion` and `planCopilotAction` drive the next-question order and conversation action. `runCopilotSimulation` evaluates a cloned input; no what-if value is saved to the user's answers or QR payload.
- The current Samdo event screen retains `buildSamdoDualAssessment`, `applySamdoResolvedFact` and Samdo presentation grouping to preserve the existing result contract. These are compatibility adapters, not a second ranking engine.
- Server-grounded chat responses separate `text`/`detail` from an `evidence[]` array. The user can expand notice title, section and summary; locators remain in the response contract for operations, but are not rendered in the consumer UI.

## Safe activation path

1. Verify a dedicated Preview/Staging Supabase target and obtain separate approval before applying `20261016054748_product_v3_operations.sql`.
2. Connect authorized monitoring writers/readers and rerun PGlite, server authorization, Admin E2E and privacy tests.
3. Replace the remaining Samdo event presentation adapters only after equivalence snapshots for both districts pass.

Production resources, existing integration branches and release tags are outside this integration's write scope.
