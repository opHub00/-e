# User-centric assessment app flow (Phase 4)

## Scope and rollout gate

The V3 path is additive. The existing V2 profile and local deterministic assessment remain unchanged when either public flag is off.

| Flag | Meaning |
| --- | --- |
| `EXPO_PUBLIC_USER_CENTRIC_PROFILE_V3=true` | Read V3 first, keep V2 as a fallback/cache, and save explicit user edits with `expectedRevision`. |
| `EXPO_PUBLIC_USER_CENTRIC_ASSESSMENT_RESULTS=true` | Use the trusted server assessment and persisted-result path. Requires the profile flag. |

Both flags resolve to `false` unless `EXPO_PUBLIC_WANPANE_ENV=staging`. Production therefore remains off even if a flag is copied accidentally. The Edge Function has an independent Staging identity check and two server-side kill switches (`WANPANE_USER_CENTRIC_PROFILE_V3`, `WANPANE_USER_CENTRIC_ASSESSMENT_RESULTS`). Turning either server flag off stops trusted execution without a database rollback.

## Profile source and cache

`applicant_profiles_v3` is the source of truth while `useApplicantProfileV3Store` is only a session cache. Its explicit states are `loading`, `ready`, `saving`, `conflict`, `error`, and `disabled`; cache freshness is `FRESH`, `V2_LOCAL_FALLBACK`, or `STALE`.

On login the app reads V3 first. If it is absent, the existing V2 record is converted only in memory and marked `V2_LOCAL_FALLBACK`. That fallback is never automatically written. An explicit profile or questionnaire save may create V3 revision 1. Every later write supplies the last server revision; conflict keeps both the user's local draft and the latest server row.

Logout and account changes cancel the previous load generation and clear the V3 session cache. A late response from the previous account cannot replace the current account.

## Questionnaire fact boundary

Reusable raw facts are copied to V3: exact birth/residence/account dates, recognized payments, raw income/assets with observation time, children, overseas stays, household-head status and current re-winning restriction. Announcement-only values remain in assessment details: priority target, exception answer, announcement household-size interpretation, planned-marriage deadline, single-parent qualification and other rule-specific qualifiers.

No duration is converted into an invented date, and no range is converted into an exact amount.

## Trusted server execution

Phase 4 uses a Supabase Edge Function instead of a separate server route. This keeps the existing pure TypeScript engine reusable, uses the established Supabase Auth session, avoids an additional deployment/runtime, and is testable with the same engine fixtures.

The `user-assessment` function:

1. verifies the JWT and takes the user id from Auth;
2. reads that user's V3 profile with service credentials;
3. reads and decodes the active, public, approved RuleSet;
4. reads the source document hash;
5. combines V3 raw facts with allow-listed announcement details;
6. runs `assessApplication()` without changing its semantics;
7. creates a canonical SHA-256 input hash and provenance;
8. reuses an exact fresh result or calls the service-only result RPC;
9. returns the server-confirmed snapshot.

The request accepts no user id, profile revision, score, stage, result snapshot or provenance. The old authenticated `save_user_assessment_result` grant is revoked. `save_user_assessment_result_server` is service-role only and revalidates the profile revision, active/public/approved RuleSet, listing binding and document hash before writing.

## Result and stale contract

The owner can read the latest non-superseded result by listing and supply type. UI freshness is one of:

- `FRESH`
- `STALE_PROFILE`
- `STALE_RULE`
- `STALE_DOCUMENT`
- `STALE_ENGINE`

Profile updates mark existing current results stale in the same profile transaction. Rule, document and engine changes are also caught by the server's exact provenance/input-hash comparison; a mismatched result is not reused. There is no background queue. Entering an assessment checks persistence and asks the server to reuse or recalculate atomically.

## Staging deployment and rollback

Staging project `krkeiytshxpqojrlrmsx` received migration `20261001080049_user_centric_assessment_server_execution.sql` and the `user-assessment` Edge Function. The production project is explicitly refused by both build and server gates.

Rollback order:

1. turn off the two server-side user-centric flags;
2. build Staging with the two public flags off so the app uses V2;
3. retain V3 profiles and historical results; do not delete or reverse revisions;
4. deploy a forward correction migration if the database contract needs a change.

No Production migration, backfill, write or cutover is part of this phase.
