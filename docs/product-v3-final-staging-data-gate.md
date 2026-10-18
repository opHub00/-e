# Product V3 final Staging data gate (2026-10-18)

This is an operational record, not authorization to activate an unverified source. Production and release tags are out of scope.

## Read-only Staging inventory

Staging is `krkeiytshxpqojrlrmsx`; Production is `ypdreeipoxcztbxtiklt`. The active Samdo 1 announcement is `bade0617-63c6-4f61-86bf-6cd5ae17b101` (`PUBLISHED`, source `LOCAL_DRAFT`, announcement date 2026-09-14). Its active document is `bade0617-63c6-4f61-86bf-6cd5ae17d101`, version `VER1.7`, SHA-256 `bd67d7ee6c9b9dbbe043f9c966679c791185ba0f21ae80050a33a489112e8763`, `is_official=false`, with no official source URL. Its active RuleSet is `bade0617-63c6-4f61-86bf-6cd5ae17a101`, version `VER1.7-draft-transcription-1`, status `DRAFT_SOURCE_VERIFIED`; the listing binding is `samdo-1-2026-ver1.7`. Rule review remains `IN_REVIEW`. There is no persisted RAG index metadata for this source.

Staging also contains a separate, non-Samdo announcement. It must not be used as evidence of a Samdo 2 activation. Samdo 2 is not present as a Staging active notice.

## Final 1.8 package and diff

The user-provided 1-district HWP hashes to `5834b996f9d49ea7dc6e45fc36312b2fba1b4d5fa3b5d1bcd3a7d8e9189b90d2`, matching the `document.sha256` in `data/assessment-rules/samdo-2026-v1.8.json`. The package file hashes to `745cd0a52b76535d6496cda59b2979aaeb0e3cdb62a7b06e9ee4d6857d5cc789`. The older package file hashes to `d7a73898922b440ff27955a4deeebeb1a1267d9c4a7f2c6c7d4dcff7aa10e6ef`. Both packages contain 75 rules with 75 source-hash-bound locators and 75 excerpts. Run `node --experimental-strip-types scripts/report-samdo-promotion.mjs` for the full machine-readable diff.

There are 22 changed package parameters: supply inventory and dates previously unspecified in 1.7 are explicit in 1.8, management number is narrowed to `2026000434`, youth parent asset default and one-recent-child household asset threshold are explicit, and the draft warning is updated. Three rule configs changed: the youth parent asset limit is 1,034 → 1,035 million KRW, and newlywed/first-home age gates include an evidenced minor household-head exception. The nine existing Samdo persona snapshots show no status/stage/official-score difference. Two targeted probes **do** change: youth parent assets at 1,034.5 million KRW moves `INELIGIBLE → ELIGIBLE`; a minor newlywed household head with the explicit exception moves `NEEDS_MORE_INFORMATION → ELIGIBLE`. These are material review points before approval, not reasons to silently promote the draft.

The 1.8 package and HWP are marked `DRAFT` / `DRAFT_SOURCE_VERIFIED`, `isOfficial=false`, and have no official URL. Its stated announcement date, 2026-10-27, is later than this audit date. A matching user-provided file is not proof that the public official source has been posted. This prevents a truthful `APPROVED`/`ACTIVE` promotion now.

## Promotion package and hold point

When the official publisher makes the source available and a reviewer confirms the published bytes or documented discrepancy, perform these **Staging-only** steps with an authorized operator:

1. Record official URL, publisher, published document SHA-256, HWP locator map and review decision. If the official bytes differ, regenerate/review the package; never relabel the user-provided hash as official.
2. Preserve the existing 1.7 document, RuleSet, review history and binding in the database. The 1.8 artifact uses a different announcement ID; do not blindly import it as a duplicate notice. Map to the existing canonical Samdo 1 announcement under a reviewed migration/import transaction.
3. Insert a new source document and versioned 1.8 RuleSet with 75 rules/evidence rows. Verify every locator's source hash, excerpt and supply scope, then advance review → approval through the existing audited workflow. Record actor, before/after and timestamp for each mutation.
4. Activate only the approved package, switch the canonical listing binding, and verify exactly one active package for Samdo 1. Re-run nine Samdo personas, 72-cell regression, dual-district assessment, source lineage and RAG retrieval. Preserve 1.7 rollback identifiers.
5. Build a fresh RAG index from the approved document, count and validate chunks and retrieval, then register the metadata row against the **same active source hash**. The additive migration `20261018134607_product_v3_rag_index_metadata.sql` requires an authorized Staging migration session; it has not been applied. Set `ACTIVE` only after the index really exists. Use `REINDEX_REQUIRED` / `STALE` for older or mismatched sources.

No 1.8 promotion or RAG metadata write was performed in this audit. The existing Staging source mismatch is a release blocker, not a warning to suppress.

## RAG operational contract

The additive migration stores notice ID, announcement ID, source version/hash, index version, chunk count, indexed time and status, with append-only audit history and no anon/authenticated access. An `ACTIVE` record requires an existing source document and an approved active RuleSet with the same hash. Admin reads the persisted row and shows an indexed version/count only on an exact active-source match; missing or stale metadata remains visible as a warning. The migration passed isolated PGlite/RLS tests but could not be applied to Staging because the available Supabase management connection cannot run migrations. Service-role REST is not a substitute for a reviewed SQL migration.

## QR storage decision

| Property | Existing Staging Supabase private Storage | New Upstash Redis |
| --- | --- | --- |
| Resource/cost | Reuses existing Staging project and a private `event-qr-sessions-staging` bucket | Requires an additional Preview-only resource and cost review |
| Token and privacy | 256-bit opaque token; only SHA-256 object name is stored; validated minimal summary | Existing NX/EX repository also uses an opaque token; Redis key contains token |
| Access | Service-role server access only; anon read/write denied in live test | REST token server only |
| Expiry | Six-hour expiry enforced on every read, with expired object deletion; periodic orphan cleanup must be operated | Native EX TTL removes expired data |
| Isolation | Exact Staging ref and Preview environment required; Production ref rejected | Requires separate Redis resource/variables |

Staging uses Supabase Storage because it meets the QR security contract without a new paid service. Its loss of native automatic expiry is an operational trade-off: run `node --env-file=<local Staging env> --experimental-strip-types scripts/cleanup-staging-qr-storage.mjs` as a dry run, then use `--apply` under an authorized Staging operations session. The task only targets up to 100 SHA-256-named objects older than seven hours in the dedicated private Staging bucket; repeat while `morePagesPossible` is true and monitor bucket growth. Do not use this Staging-only adapter for Production without a separate architecture/review decision. The private bucket was created in Staging; no Production resource was changed. A live Staging API test confirmed create/read, duplicate rejection, anonymous read/write denial, expiry rejection and removal, and no raw token in the object path. External Preview QR E2E is a separate gate and must not be inferred from this server-side test.

## Remaining gates

### External protected Preview verification

Preview `https://staging-supabase-rule-review-e2e-kcfmrh4hm-ophub00s-projects.vercel.app` is a Staging-only deployment of commit `5058166` with Vercel Authentication retained. Using the linked project's short-lived development OIDC token (never logged), `/`, `/event`, `/event/chat` and `/admin/console` returned 200; the Admin API returned 401 without an application Admin session. QR POST → GET → DELETE → GET returned 201 → 200 → 204 → 404. The mobile result page returned 200; invalid token and private payload returned 400. A protected external Chromium run completed the newborn persona from landing/story/questionnaire through dual result, simulation, chat, QR and mobile result across desktop, laptop, both iPad orientations and 430/390/360/320 mobile widths; horizontal overflow, other-listing exposure and small touch targets were zero in that run. This verifies the **user path**, not the missing permanent Admin-authenticated path or the unpublished 1.8 Staging promotion.

- Public final 1.8 official source, reviewer approval, 1.8 activation, Samdo 2 Staging source, and index registration are pending.
- Existing approved permanent Admin account session is not available to this automation. Do not create a QA admin or bypass RLS to declare the seven-screen auth test passed.
- External protected Preview must verify real user QR creation/redemption and Admin screens. Vercel Authentication stays enabled.
- Production backup/PITR state and restore test remain a separate Production-promotion gate. Neither Production data nor settings were touched.

**PRODUCT_V3_BASELINE: NO-GO** until all Staging data and external gates pass. **PRODUCTION_PROMOTION: NO-GO / NO-ACTION** pending its own backup, restore, migration and approval checks.
