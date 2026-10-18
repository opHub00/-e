# Product V3 Staging migration-history reconciliation

Read-only Staging audit on 2026-10-19. Staging ref: `krkeiytshxpqojrlrmsx`. Production ref `ypdreeipoxcztbxtiklt` was not queried or changed. No SQL migration was applied, and no `migration repair` was used.

## Provenance and remote history

The six entries below existed in Staging `supabase_migrations.schema_migrations` but were absent from the `integration/product-v3-ops` checkout. Their exact SQL was found in Git history and restored without editing. SHA-256 values refer to the **canonical committed Git blob bytes**; Windows `core.autocrlf=true` can give working-tree files a different byte hash while the staged/committed blobs remain identical.

| Version and remote name | Source commit | Canonical SQL SHA-256 | Final Staging effect and classification |
| --- | --- | --- | --- |
| `20261001071555_user_centric_assessment_persistence` | `9d7dcf832d5ebb72c96db8b1f3446d475c4ad590` | `f518f4eca5637a4ca57282f9133ff90d8ec674470bba14c44c97acee4c3bb8d6` | Applicant V3 profile and assessment-result tables, constraints, indexes, owner-read policies, RPCs and grants; **RESTORED_VERIFIED**. |
| `20261001073009_user_centric_assessment_service_role_fix` | `9d7dcf832d5ebb72c96db8b1f3446d475c4ad590` | `2a756152f52776b8a132ba58626cd49fafb43114e8a72938f78aeeb91869aace` | Service-role authorization for backfill/stale RPCs; **RESTORED_VERIFIED**. |
| `20261001080049_user_centric_assessment_server_execution` | `e3f0838ffe82bd4108db2385f3d1b92f3ccf93eb` | `38d7f0dee6e0bc8befad1068fa60f4c2d1d81659b995e8095340eca7fc3f9f0f` | Server-only result-save RPC and client-execute revoke; **RESTORED_VERIFIED**. |
| `20261001081655_user_centric_assessment_server_reuse_fix` | `e3f0838ffe82bd4108db2385f3d1b92f3ccf93eb` | `9df78bfe6abfbd7843625ba6ea511624f2376ff5ba99abc5a039d9f46df4f353` | Same RPC replaced to exclude stale results from reuse; **RESTORED_VERIFIED**. |
| `20261002042012_user_assessment_result_concurrency_lock` | `50f73c4b06fde267e0d25d7551652a067e5c3959` | `bb32c63b21aba64d7d18a7268200c707c47809d317ea4a32f53ff212494db8c8` | Same RPC replaced with transaction advisory lock; **RESTORED_VERIFIED**. |
| `20261005090000_user_listing_assessment_inputs` | `2f9d2cdb7035cd2874b61052103f86ab27e25d3a` | `6969830a4d218999df06cb0454c53d7653b92c4c63917654a396312398eded44` | Listing/supply answers table, constraints/indexes, owner-read policy, read/save RPCs, and `LISTING_INPUT_CHANGED` stale reason; **RESTORED_VERIFIED**. |

Each restored path is `supabase/migrations/<version-and-name>.sql`. No fake or empty migration was created. Staging history recorded respectively 32, 8, 8, 8, 8 and 20 SQL statements; **all 84 statements appear exactly, in order, in the corresponding Git original**. This establishes stronger source identity than filename matching alone. The Staging history table has only `version`, `name`, and `statements`; it has **no `applied_at` column**. The timestamp in the version is a filename timestamp, not proof of actual application time, so actual `applied_at` is **not recorded / unknown** for all six.

## Catalog comparison

Read-only `pg_catalog`/`information_schema` checks covered all three tables' columns, types, defaults, primary/foreign/check/unique constraints, indexes, RLS flags, owner-read policies, and role-specific SELECT/INSERT/UPDATE/DELETE privileges. Seven relevant RPC signatures, `SECURITY DEFINER`, empty search paths, role execute grants and core body guards were checked. The final server-save RPC contains both the stale-result exclusion and advisory transaction lock. The three tables have no unexpected non-internal triggers. These final-state objects match the ordered six-migration source. Earlier versions of the server-save function were intentionally superseded by later versions; they are not expected to coexist in the current catalog. No schema mismatch was found in the inspected objects.

This is a schema/statement audit, not a replay of the six migrations. Their SQL contains historical `CREATE`, `REVOKE`, function replacement and a targeted constraint replacement. The dry run confirms **none** would execute again. Original source files were intentionally not reformatted; two retain their original trailing blank line, which `git diff --check` warns about. Git blob identity and the 84/84 statement comparison take precedence over cosmetic whitespace cleanup.

## Staging-only dry-run and next gate

After restoring the files, `supabase migration list --project-ref krkeiytshxpqojrlrmsx` showed all six local/remote versions aligned. `supabase db push --project-ref krkeiytshxpqojrlrmsx --dry-run --skip-vault` exited successfully and listed **only** `20261018134607_product_v3_rag_index_metadata.sql`; seeds and roles were empty. The RAG metadata tables and three named functions are absent from the Staging catalog, so no current-object collision was found. The RAG migration itself remains **unapplied**.

**STAGING_MIGRATION_CHAIN_READY: GO** for the limited migration-chain/dry-run gate. This does not approve the pending RAG migration, official Samdo 1.8 source, Admin E2E, Product V3 baseline, or Production promotion. Before any later real Staging push, repeat the explicit-ref dry run, review the exact migration contents, and obtain the separate operational authorization/backup gate.
