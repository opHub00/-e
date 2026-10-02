# User-centric assessment portfolio

## Purpose

The Portfolio reuses one authenticated user's `ApplicantProfileV3` across a bounded set of listings. Eligibility, stage, and score still come only from the existing deterministic assessment engine. The client cannot submit a calculated result.

Production remains disabled. The Portfolio is available only when the runtime is explicitly `staging` and the profile, trusted-result, and Portfolio flags are all enabled.

## Candidate selection

Candidates must have an active, public, approved RuleSet. They are ranked in this order:

1. listings saved by the user;
2. active listings whose region matches the user's profile preferences;
3. other active analyzable listings.

The first release selects at most 8 candidates (hard maximum 12) and evaluates at concurrency 2. This keeps one interactive Edge request bounded while preserving room for partial results. One candidate failure becomes an `UNAVAILABLE` item and does not fail the batch.

## API contract

The provider-independent client exposes:

- `getPortfolio()` — reads persisted results and reports current freshness without calculating missing results;
- `refreshPortfolio()` — reuses fresh results and calculates only missing or stale candidates;
- `getMissingProfileFacts()` — returns aggregated user facts ordered by completion impact;
- `getPortfolioResult(listingId, supplyType)` — returns one current item.

The Staging Edge endpoint accepts only `get` or `refresh`. It derives the actor from the bearer token, loads the actor's V3 profile with the service role, reads approved RuleSets, runs `assessApplication()` through the trusted server adapter, and persists results through the server-only RPC.

## Freshness and idempotency

Freshness compares stored provenance with the current:

- profile revision;
- RuleSet ID and version;
- source document hash;
- engine version.

The UI contract distinguishes `FRESH`, `STALE_PROFILE`, `STALE_RULE`, `STALE_DOCUMENT`, and `STALE_ENGINE`. Profile writes mark prior current results stale. Identical user input does not create a new profile revision. The result-save RPC uses a transaction advisory lock per user/listing/supply, reuses an identical current result, supersedes only when provenance changes, and prevents duplicate concurrent calculations from producing two current rows.

## Missing information

Each Portfolio item retains `missingUserFields` and `missingAnnouncementFields`. User fields are aggregated into:

- field;
- affected listing count;
- affected result IDs;
- priority;
- completion impact.

The initial completion impact counts results that become calculable when the field is their last missing user fact. The contract permits a richer impact model later without changing the UI-facing API.

## Profile conflicts

The three-way conflict contract compares the base profile, local edited profile, and latest server profile. It reports conflicting fields, non-conflicting fields, fields safe to merge automatically, fields requiring user choice, and the latest server revision. It does not automatically overwrite either side.

## Staging verification

The deployed browser test covers login, profile input, reload restore, trusted assessment, logout and re-login result reuse, profile-change stale detection, recalculation, and account isolation. A separate remote Staging verifier covers bounded Portfolio selection, first calculation, fresh reuse, stale recalculation, and cross-user result isolation.

No Production migration, deployment, backfill, or write is part of this phase.
