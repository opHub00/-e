# Product V3 Staging Admin activation — code/audit gate

Date: 2026-10-17. Base: `integration/product-v3 @ 1336534a673bc7b754575d6a2cabcd0a4b72a71e`.

## Environment identity and stop condition

Supabase CLI project inventory identifies two separate projects in the same organization:

| Role | Project | Ref | Observed state |
| --- | --- | --- | --- |
| Staging | `완판e-staging` | `krkeiytshxpqojrlrmsx` | `INACTIVE` |
| Production | `완판e` | `ypdreeipoxcztbxtiklt` | `ACTIVE_HEALTHY` |

The existing private staging configuration's URL host and staging/production refs agree with these identities. No secret value was copied or logged. The staging host did not resolve while inactive. The Supabase connector in this Codex session listed zero projects, and `supabase migration list --project-ref krkeiytshxpqojrlrmsx` could not reach the DB from the current IPv6 path. **Remote migration history and actual schema are not verified.** The user instructed us not to resume the inactive staging project during this pass. No remote SQL or deployment was run.

Vercel's `wanpan-e` Preview environment lists the same public Supabase URL variable as Production rather than an explicit staging binding. Treat it as production-connected until a separate branch-scoped or separate-project Preview is verified. The existing `staging-supabase-rule-review-e2e` Vercel project has no configured environment variables. Do not deploy the Admin build with either configuration as-is.

## Migration audit: `20261016054748_product_v3_operations.sql`

- Additive DDL: three new `public.product_v3_*` tables, four secondary indexes, one immutable-audit trigger function, one trigger. No existing table is altered and no seed/activation occurs.
- RLS is enabled on all three tables. `PUBLIC`, `anon`, and `authenticated` have no table privileges or policies. `service_role` has only `SELECT` and `INSERT`. A `BEFORE UPDATE OR DELETE` trigger rejects audit-log changes, including through an elevated role.
- No foreign keys are added: telemetry notice IDs and audit entity IDs are strings because the current notice registry is not the same as the existing `announcements` table. This trades referential enforcement for migration compatibility; the server writer restricts event notice IDs.
- The audit trigger is `SECURITY INVOKER` with an empty search path. It has no broadening `SECURITY DEFINER` boundary. The existing `get_assessment_review_access` RPC, not an email string, remains the authorization source.
- The migration has no destructive rollback script. Before remote application, save a Staging backup/schema snapshot and verify migration history plus object-name collisions. If already used, correct with a forward migration; do not drop telemetry or audit rows casually.
- Isolated PGlite verification now checks 49 assertions, including tables, four indexes, RLS, `anon`/`authenticated` privilege denial, `service_role` select/insert-only, and audit update/delete denial. This **does not prove** actual Supabase RLS/PostgREST behavior.

## Code boundary prepared on this branch

- Admin API authorization and reads require an explicit server-only staging URL/ref, a *different* explicit production ref, `WANPANE_ENV=staging`, and non-Production Vercel runtime. The app's `EXPO_PUBLIC_SUPABASE_URL` can no longer silently select the Admin DB.
- The Admin API now reads named columns from staging tables through a server-only service-role transport. It never substitutes the static notice seed when a table is absent or unavailable; the response is `503` instead. Browser code still calls only `/admin-api/product-v3`.
- AI telemetry hook is active only for explicit staging runtime. The free-form question is not persisted: a bounded resolver category is stored instead. The aggregate assessment writer is prepared but has **no trusted runtime caller yet**; assessment counts will remain zero until one is connected. RAG version/chunk metadata is not persisted in these tables, so the Admin snapshot displays a warning rather than an invented value.
- No Admin mutation endpoint was added. Existing rule-review RPC is the candidate for a later staging-only workflow test; this pass does not pretend the in-memory Product V3 workflow is a persistent database workflow.

## Required gate before remote activation

1. Owner resumes the named Staging project. Recheck the project inventory, DNS/health, and both refs.
2. Obtain a Staging-only Preview binding. Server-only keys: `WANPANE_ENV=staging`, `SUPABASE_STAGING_URL`, `SUPABASE_STAGING_PROJECT_REF`, `SUPABASE_PRODUCTION_PROJECT_REF`, `SUPABASE_STAGING_ANON_KEY`, `SUPABASE_STAGING_SERVICE_ROLE_KEY`. Browser auth build must use the matching Staging public URL/anon key. Never put service-role material in an `EXPO_PUBLIC_*` variable.
3. Read remote migration history, table/column/index/grant/RLS state and compare to the isolated schema. Resolve conflicts before applying the migration. Capture backup/snapshot.
4. Apply this migration to the Staging ref only. Verify objects, grants, row access, audit immutability, and migration history from the actual database.
5. Use actual unauthenticated, non-admin, and admin accounts to test the Admin API and Console. Generate safe Staging AI and assessment telemetry; connect assessment monitoring through a trusted server path, not an unauthenticated browser count. Verify dashboard totals and retention/privacy.
6. Only after full regression passes, deploy a Staging-connected Preview and inspect `/`, `/event`, `/event/chat`, `/admin/console`. Never promote it to Production.

Current release verdict: **NO-GO for Staging Admin activation**. The project is inactive, remote schema/auth/telemetry cannot be proven, and the aggregate assessment runtime writer is not yet connected. The code/audit preparation is complete for this pass; Production was not changed.
