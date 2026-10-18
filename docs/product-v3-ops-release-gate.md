# Product V3 operations release gate

## Staging scope and evidence (2026-10-18)

- Staging Supabase project ref: `krkeiytshxpqojrlrmsx`. Production ref `ypdreeipoxcztbxtiklt` is checked and refused by every new staging path.
- The additive `20261018072931_product_v3_assessment_events.sql` migration was applied to Staging only. It records one row per request, notice, and supply type. RLS is enabled, no anon/authenticated policy exists, and only `service_role` has SELECT/INSERT grants.
- The event browser sends a minimal assessment input to `/event-api/assessments`. The server recomputes against the active notice registry; client-supplied statuses, counts, and notice IDs are not accepted. A telemetry write failure returns `recorded:false` without changing the browser's deterministic assessment.
- Persisted telemetry contains request ID, timestamp, notice/supply identifiers, status, unresolved **category** labels, evidence completeness, and source/package versions. Raw profile, name, contact details, birth date, exact financial values, QR token, and raw fact keys are not stored in this table.
- The Staging QA account is temporary: a real Supabase Auth user is created, promoted through an audited membership change, tested, membership disabled with an audit entry, and Auth user deleted.
- Normal Admin mode loads authenticated Staging data; `?demo=1` is the only demo-data path. AI, audit, and notices have an authenticated server paging/filter/search contract. The current implementation pages a sanitized snapshot (up to 5,000 rows per source table), not a database cursor; replace this before high-volume operation.
- Trend-ready metrics support `from`, `to`, `bucket=day|week|month`, and `previousPeriod`. Rates are per supply assessment event, not per unique visitor. Empty denominators return `null`.
- A real, existing non-Samdo imported package (`jj-panmun-2026000446`) is exercised as an inactive NoticePlatform adapter for ingestion, assessment, evidence retrieval, and comparison. It is **not** activated for user-facing recommendations.
- A separate Vercel project (`staging-supabase-rule-review-e2e`) holds the six Staging connection variables as **Preview-only Secrets** after explicit approval. The attempted Preview `dpl_HB7N3Vy7eTDpPNUNremJBNrarerk` was blocked before build because commit author `Wanpane Local <wanpane@local>` does not have deploy permission on that project. It is not a verified Preview URL. Do not bypass this restriction by rewriting author identity or weakening deployment protection; arrange authorized Git/Vercel identity first.

## Production promotion gates

1. Confirm and enable an appropriate backup policy before any Production migration. The Staging project currently reports `pitr_enabled=false` and no downloadable backups (`backups=[]`); WAL-G is enabled. This is **not** evidence of recoverable point-in-time backup.
2. Test restore/PITR against a disposable project, establish RPO/RTO and rollback instructions, and retain a pre-migration backup. Do not infer Production backup state from Staging.
3. Review and approve the new migration, RLS/grants, service-role isolation, retention period, and event endpoint abuse/rate limits. The anonymous event endpoint is same-origin guarded and recomputes server-side, but needs rate limiting before high-volume public use.
4. Replace the 5,000-row in-memory Admin snapshot/pagination cap with database-side query and aggregate pagination; set retention and index strategy for assessment events.
5. Register RAG version/chunk metadata in the operations schema if Admin must show it; until then the connected dashboard correctly reports this missing coverage as an operational warning.
6. Re-run full regression, real administrator auth, dashboard metrics, and Preview external QA against the exact candidate commit. Promotion is **NO-GO** until all gates are reviewed and separately approved.

Production deployment, environment, database, and release tags were not changed in this work.
