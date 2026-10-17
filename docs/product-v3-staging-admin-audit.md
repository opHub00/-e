# Product V3 Staging Admin activation — Staging execution record

Date: 2026-10-17. Base: `integration/product-v3 @ 1336534a673bc7b754575d6a2cabcd0a4b72a71e`.

## Environment identity and stop condition

Supabase CLI project inventory identifies two separate projects in the same organization:

| Role | Project | Ref | Observed state |
| --- | --- | --- | --- |
| Staging | `완판e-staging` | `krkeiytshxpqojrlrmsx` | `ACTIVE_HEALTHY` |
| Production | `완판e` | `ypdreeipoxcztbxtiklt` | `ACTIVE_HEALTHY` |

The existing private staging configuration's URL host and staging/production refs agree with these identities. Secret values were not copied into the repository. The owner resumed Staging; the CLI reported `ACTIVE_HEALTHY`. The Production ref was used for identity comparison only; no Production SQL, deployment, or configuration change was made.

Vercel's `wanpan-e` Preview environment lists the same public Supabase URL variable as Production rather than an explicit staging binding. Treat it as production-connected until a separate branch-scoped or separate-project Preview is verified. The existing `staging-supabase-rule-review-e2e` Vercel project has no configured environment variables. Do not deploy the Admin build with either configuration as-is.

## Migration audit: `20261016054748_product_v3_operations.sql`

- Additive DDL: three new `public.product_v3_*` tables, four secondary indexes, one immutable-audit trigger function, one trigger. No existing table is altered and no seed/activation occurs.
- RLS is enabled on all three tables. `PUBLIC`, `anon`, and `authenticated` have no table privileges or policies. `service_role` has only `SELECT` and `INSERT`. Staging's default table privileges initially gave `service_role` UPDATE/DELETE despite the original grant statement. The migration source and Staging table grants were corrected with an explicit `REVOKE ALL FROM service_role` before the narrow grant. A `BEFORE UPDATE OR DELETE` trigger rejects audit-log changes, including through an elevated role.
- No foreign keys are added: telemetry notice IDs and audit entity IDs are strings because the current notice registry is not the same as the existing `announcements` table. This trades referential enforcement for migration compatibility; the server writer restricts event notice IDs.
- The audit trigger is `SECURITY INVOKER` with an empty search path. It has no broadening `SECURITY DEFINER` boundary. The existing `get_assessment_review_access` RPC, not an email string, remains the authorization source.
- The migration has no destructive rollback script. Supabase's backup listing returned no physical backup and PITR disabled for this Staging project. Because this migration is additive and transaction-wrapped, existing tables were not changed. Remote history and object-name collisions were checked before application. Do not drop telemetry or audit rows casually.
- Operational caution: the CLI's schema-dump `--dry-run` prints a CLI-generated database login credential into command output. Do not capture or circulate that output. No credential was added to the repository; restrict access to the command transcript and rotate that credential if its lifetime cannot be confirmed.
- Isolated PGlite verification checks 49 assertions, including tables, four indexes, RLS, `anon`/`authenticated` privilege denial, `service_role` select/insert-only, and audit update/delete denial. Live Staging PostgREST was also tested: anon GET/POST 401, service GET 200, service PATCH/DELETE 403 on all relevant roles/tables.

## Code boundary prepared on this branch

- Admin API authorization and reads require an explicit server-only staging URL/ref, a *different* explicit production ref, `WANPANE_ENV=staging`, and non-Production Vercel runtime. The app's `EXPO_PUBLIC_SUPABASE_URL` can no longer silently select the Admin DB.
- The Admin API now reads named columns from staging tables through a server-only service-role transport. It never substitutes the static notice seed when a table is absent or unavailable; the response is `503` instead. Browser code still calls only `/admin-api/product-v3`.
- AI telemetry hook is active only for explicit staging runtime. The free-form question is not persisted: a bounded resolver category is stored instead. The aggregate assessment writer is prepared but has **no trusted runtime caller yet**; assessment counts will remain zero until one is connected. RAG version/chunk metadata is not persisted in these tables, so the Admin snapshot displays a warning rather than an invented value.
- No Admin mutation endpoint was added. Existing rule-review RPC is the candidate for a later staging-only workflow test; this pass does not pretend the in-memory Product V3 workflow is a persistent database workflow.

## Activation and verification (2026-10-17)

- Staging migration history had six versions not present in this checkout. A bulk `db push --dry-run --skip-vault` refused to run. No history was reverted. Only `20261016054748_product_v3_operations.sql` was executed against the explicit Staging ref, then that one version was marked applied. Its local and remote history entries now match.
- The three Product V3 tables, four secondary indexes, RLS enabled, zero policies, and append-only audit trigger are present. `anon`/`authenticated` have no table read access; `service_role` has SELECT/INSERT, not UPDATE/DELETE. Live PostgREST requests confirmed the deny/allow behavior.
- An isolated Staging QA account exercised the actual Admin authorization RPC and snapshot transport: unauthenticated GET 401, ordinary user 403, admin 200 with two notices, mutation method 405. A Staging-targeted web build and local browser test loaded Dashboard, Notices, Notice Detail, Rule Review, Assessment Monitoring, AI Monitoring, and Audit Log; each made a successful Admin API request. The temporary user was deleted and its membership disabled. Auth user count remained five and enabled admin count remained one; grant/revoke actions remain in the membership audit log.
- A synthetic AI row and aggregate assessment row were written through the server telemetry functions. The actual event chat API produced a deterministic schedule answer and a second AI telemetry row. Stored questions are resolver categories, notice IDs are filtered, and an attempted raw fact key was mapped to a safe category. Snapshot shows two AI events and one aggregate assessment QA event.
- `npm run typecheck`, the Staging web build with zero Production host references, and the full `npm test` (including PGlite and Edge 65) passed. Initial sandbox-only npm cache failure was rerun successfully without changing source.

## Remaining activation boundary

The Admin read-only transport is verified locally against Staging. There is **no Staging-only Vercel Preview binding/deployment** in this run; the existing `wanpan-e` Preview has Production public Supabase variables and must not be reused for Staging Admin. The aggregate assessment telemetry writer has no trusted runtime caller in the existing client-side assessment flow, so its live count remains unproven beyond the synthetic QA event. A server-side assessment boundary is needed before interpreting that dashboard metric as production-like traffic. No Production setting or release tag was changed.
