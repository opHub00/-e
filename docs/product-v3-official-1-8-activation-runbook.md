# Product V3: official Samdo final 1.8 activation hold point

Prepared 2026-10-19. This is a procedure, **not** approval or activation. Do not run the activation before the publisher posts both official 1.8 notices. Production (`ypdreeipoxcztbxtiklt`) and release tags are out of scope. Every database command must target Staging (`krkeiytshxpqojrlrmsx`) explicitly.

## Current evidence and decision

| District | User-provided 1.8 HWP SHA-256 | Management number in draft package | Staging status |
| --- | --- | --- | --- |
| Samdo 1 | `5834b996f9d49ea7dc6e45fc36312b2fba1b4d5fa3b5d1bcd3a7d8e9189b90d2` | `2026000434` | Active source is older, non-official v1.7; 1.8 is not approved or active. |
| Samdo 2 | `336c345354c6ab9085683ede9e8fde52f4be73969c5058c0a62602257289ab71` | `2026000435` | No active Samdo 2 notice verified. |

These hashes identify the files supplied by the user, **not** official publication. Both package documents currently say `DRAFT`, `isOfficial=false`, and have no official source URL. The configured announcement date is 2026-10-27. A matching filename, date, or management number is not sufficient evidence of publication. The dual-district product is not official-data-ready if either district fails a gate.

## Staging RAG metadata migration preflight

Migration: `supabase/migrations/20261018134607_product_v3_rag_index_metadata.sql`. It creates an additive metadata/audit schema; it does not index a document, approve a rule, register a metadata row, or activate anything. It remains unapplied.

Read-only checks on 2026-10-19:

- The existing Supabase CLI login can list both projects and connect to **Staging**. The Staging project is `ACTIVE_HEALTHY`. No manual access token or database password was required for the CLI's read-only migration listing. The separate Supabase connector identity lists no accessible projects; use the authenticated CLI identity, not the connector, for any later authorized operation.
- Staging migration history includes `20261016054748` and `20261018072931`; local `20261018134607` is pending.
- `supabase db push --project-ref krkeiytshxpqojrlrmsx --dry-run --skip-vault` does **not** pass. Six older versions exist remotely but not in this checkout: `20261001071555`, `20261001073009`, `20261001080049`, `20261001081655`, `20261002042012`, `20261005090000`. Their original SQL files are recoverable from repository history (the first group from the user-centric assessment branch history, the last from `2f9d2cd`). This is a **local/remote migration history mismatch**, not a missing Supabase account permission, project role, database credential, or management API capability.

Before any Staging application, restore the six exact historical SQL files from their Git objects into the migration directory on a reviewed branch; compare their contents and version names with Staging's recorded history. Do **not** use `migration repair`, mark them reverted, or run `db pull` as an unreviewed shortcut. Then repeat read-only `migration list --project-ref krkeiytshxpqojrlrmsx` and `db push --project-ref krkeiytshxpqojrlrmsx --dry-run --skip-vault`. Proceed only if the dry run lists **exactly** `20261018134607`, with no Vault, role, seed, or unrelated schema operations. Capture a Staging backup/export and a tested rollback path before the real migration. The actual `db push` requires a separate activation decision and authorized operator; this preparation pass stops at the dry-run gate.

## After official posting on or after 2026-10-27 — perform for **both** districts

1. Record each publisher's official notice page URL, direct document URL, publisher identity, publication time, management number, announcement date, and immutable downloaded HWP bytes. Confirm that the URLs are official JPDC/authorized publisher sources and refer to the correct district. If either source is unavailable, **STOP**; do not label a draft official.
2. Compute SHA-256 of each downloaded original HWP and compare to the district hash above and `data/assessment-rules/samdo-final-1.8-source-manifest.json`. Independently compare the extracted text, tables, and section locators to the user-provided draft, even when hashes match. If bytes or content differ, **STOP automatic promotion**, create a new source version and human-reviewed diff, then regenerate affected Rule Package, config, evidence and test expectations. Never overwrite the old source or relabel a draft hash as official.
3. Review each district independently: location, management number, total/unit/supply counts, floor-specific price, monthly land rent, all application/document/contract dates, eligibility, income/assets, savings account, special exceptions, re-winning and overseas-stay rules. Check every rule's supply scope, excerpt, paragraph/table locator and source hash. No cross-district fallback or value borrowing. Record reviewer, decision, evidence, and outstanding ambiguity. Ambiguity stays `REVIEW_REQUIRED` or evidence-required, not optimistic eligibility.
4. In Staging only, preserve the active 1-district v1.7 document, RuleSet, listing binding and review history as rollback references. Map the 1.8 package's draft announcement ID to the canonical Staging notice under a reviewed import; do not duplicate the notice blindly. Create the second district's own canonical notice/document/RuleSet and independently bind its listing.
5. Advance each source and package through source verification → rule review → approval → activation using audited actions. The package must be explicitly approved before it can be active. Confirm one active, source-hash-matched package and listing binding per district; Samdo 2 must not inherit Samdo 1's source or result.
6. Build and test separate RAG indexes from the newly verified official documents. Only after the metadata migration is applied, register the index version, source version/hash, chunk count and timestamp for each notice. Mark `ACTIVE` only when an actual index exists and its source hash equals the active approved RuleSet/document. Otherwise retain `REINDEX_REQUIRED` or `STALE`.
7. Re-run the 72-cell legacy matrix, nine Samdo personas, dual-district personas, DOES_NOT_KNOW, simulation, structured dates/prices/rents/counts, RAG locator/grounding, deterministic and Gemini fallback, QR privacy, Admin lineage, and external Preview flow. Assert zero 1↔2 cross-contamination. Both district activations and actual Admin/RAG rows must be visible in the Staging Admin Console before an official-data GO.

Do not infer Production readiness from Staging activation. Production requires its own backup/PITR/restore and migration approval gate.

## Existing permanent Admin E2E — ready to execute, not yet passed

Use only an already approved administrator's normal login on the protected **Staging-bound** Preview; do not create an account, impersonate one, copy a session into logs, or bypass RLS. Before testing, verify the Preview's server Staging ref and non-Production runtime, and verify no `?demo=1` flag.

1. Without an application session, request `/admin-api/product-v3`: expect `401`; the Console should offer normal login, not fake data.
2. If an existing non-admin test session is legitimately available, use it and expect `403`. Do not create an account solely to obtain this case.
3. With the approved admin session, expect API `200`, then inspect Dashboard, Notices, Notice Detail (each district), Rule Review, Assessment Monitoring, AI Monitoring, and Audit Log. Confirm the content is live Staging data, not a placeholder. Check relevant pagination/filter states and that any mutation stays behind the existing audited Staging-only workflow.
4. Record only timestamp, deployment URL/commit, HTTP status, screen name, notice IDs, redacted counts and pass/fail. Never record bearer tokens, raw profile, PII or secret values. Log out and verify the API returns `401` again.

The permanent-admin E2E is **pending an existing approved admin session**. Previous temporary-account/local tests do not satisfy this gate.

## Gate snapshot (2026-10-19)

| Gate | Status | Basis |
| --- | --- | --- |
| CODE_READY | GO | Prepared package, lineage schema, tests and activation procedure exist; no code defect is inferred from an unpublished source. |
| STAGING_INFRA_READY | NO-GO | Staging is online and CLI access works, but RAG migration remains pending behind six-file migration-history reconciliation and permanent-admin E2E remains unverified. |
| OFFICIAL_DATA_READY | NO-GO | Neither district has a verified public official 1.8 URL/hash/review/activation chain. |
| PRODUCT_V3_BASELINE | NO-GO | Staging and official-data gates have not passed. |
| PRODUCTION_PROMOTION | NO-ACTION | No Production SQL, env, deployment, tag or approval change in this work. |

Next operator actions: review/restore the six historical migrations and repeat the Staging-only dry run; provide an approved existing Admin session via the normal login for E2E; after 2026-10-27 supply/verify both official publisher URLs and documents. Do not activate only district 1 and call the dual product complete.
