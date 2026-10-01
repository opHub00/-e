# User-centric assessment domain

This phase defines the application contracts only. It does not add or run a database migration.

## Profile source of truth

`ApplicantProfileV3` stores reusable applicant facts. Every fact is one of `KNOWN`, `UNKNOWN`, or
`NOT_APPLICABLE` and can carry `observedAt`, `effectiveFrom`, `effectiveTo`, and `source` metadata.
Exact dates and amounts are stored only when they are known. Year-only child birth data uses a
`PartialDate` with `YEAR` precision.

Announcement-specific values such as priority-target status, income household size for a specific
notice, planned-marriage deadline qualification, and special exception application remain outside
the permanent profile. They enter the existing engine through `announcementDetails`.

## V2 migration rules

- V2 values are migrated only when the caller declares `PERSISTED_USER` provenance.
- `accountMonths` remains `legacyAccountMonths`; it never becomes an invented opening date.
- `marriageYears` remains `legacyMarriageYears`; it never becomes an invented marriage date.
- income and asset ranges remain ranges; they never become exact won amounts.
- child birth years become year-precision dates, not January 1 dates.
- fields absent from V2 remain `UNKNOWN`.
- `DEMO_SEED` provenance creates an empty V3 profile, preventing demo defaults from becoming facts.

## Assessment flow

`assessmentInputFromApplicantProfileV3()` projects reusable facts into the existing
`AssessmentInput`. `assessApplication()` remains the sole deterministic evaluator.

Portfolio entries add a cross-listing status:

- `COMPLETE`: the existing engine returned `ELIGIBLE`.
- `NEEDS_USER_INPUT`: the engine needs one or more `input:*` facts.
- `INELIGIBLE`: the engine returned `INELIGIBLE`.
- `UNAVAILABLE`: rules or announcement-side facts are unavailable.

The complete engine result, evidence, warnings, score, stage, and condition results remain attached.

## Result persistence contract

`PersistedUserAssessmentResult` records user/listing/supply identity, RuleSet version, source
document hash, profile revision, engine version, input hash, portfolio and engine states, evidence,
calculation time, and an explicit stale state. RuleSet and document identifiers are nullable only for
an unavailable result where no active RuleSet exists.

## Local draft privacy

Questionnaire drafts are scoped by user ID, listing, and supply type. Logout and account switching
remove only the previous user's drafts. Legacy unscoped drafts migrate only to the guest scope and
are never read by an authenticated user.

## Proposed next database migration

1. Add a versioned `applicant_profiles_v3` JSON/schema contract or typed fact tables with
   `user_id`, `revision`, timestamps, and owner-only RLS.
2. Add a migration job that reads V2 rows, calls the same deterministic migration rules, and stores
   a migration provenance record. Demo rows must be explicitly identified, never value-matched.
3. Add `user_assessment_results` with unique result identity, provenance columns, JSON snapshots for
   engine detail, and owner-only RLS.
4. Add stale-marking functions for profile revision, active RuleSet, source hash, and engine-version
   changes. Recalculation writes a new result or revision; it does not overwrite audit provenance.
5. Backfill and validate in staging before any production schema or data mutation.
