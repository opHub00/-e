# User-centric Portfolio app flow

## Access policy

Public introduction, announcements and public content remain available without an account. Profile storage, Portfolio, personalized assessment, saved announcements, checklists and personalized consultation require an authenticated user while the Staging-only V3 flags are enabled. Production keeps the previous V2 behaviour until a separate cutover.

The route guard accepts only internal post-auth return paths. Logout and account switch continue to clear owner-scoped profile and questionnaire caches.

## Initial profile gate

The first Portfolio only requires five raw facts that recur across the current youth, newlywed and first-home rule sets:

1. birth date, used to calculate age at each announcement date;
2. current residence region, used by residence and regional-priority rules;
3. subscription-account ownership, used to decide whether account questions apply;
4. marriage status, shared by supply eligibility and household interpretation;
5. current applicant home ownership, shared by the core housing eligibility rules.

Exact dates, payment counts, incomes, assets and household details remain progressive fields. Portfolio missing-fact impact decides what to ask next. Announcement-only qualifiers and exceptions never become permanent profile facts.

## Layering

```text
route/screen
  -> AuthGate / profile lifecycle presentation
  -> onboarding or Portfolio controller/store
  -> V3 profile / Portfolio repository
  -> Supabase RPC or trusted Edge Function
  -> deterministic assessment engine
```

Screens do not select listings, calculate eligibility, score, freshness, missing-fact priority or conflict fields. Those values come from the existing domain and server contracts.

## Profile onboarding

Known initial facts are skipped. Every completed step is saved with `expectedRevision`, so reload resumes at the next missing fact. `NOT_APPLICABLE` account details are skipped when the user has no account. A V2 fallback is shown for confirmation and must be explicitly persisted as V3 before Portfolio starts.

A revision conflict keeps the local input and the latest server snapshot. The user may load the server value or preserve the local draft and explicitly save again. There is no automatic merge for conflicting fields.

## Portfolio lifecycle

The screen uses only `getPortfolio`, `refreshPortfolio`, `getMissingProfileFacts` and `getPortfolioResult`. It represents loading, empty, complete, needs-input, ineligible, unavailable, stale, offline, auth-required and server-error states separately.

The first-entry explanation is stored per authenticated user. It contains no profile facts. A profile revision change restarts the Portfolio session; the server reuses fresh results and recalculates only stale or absent results. Candidate placeholders marked `NOT_CALCULATED` also trigger the initial bounded refresh, so their mere presence cannot suppress the first deterministic calculation.

The deployed Staging browser journey covers profile creation, reload, trusted assessment persistence, logout/login restore, profile-revision staleness, recalculation and account isolation. A separate new-member journey covers initial onboarding, Portfolio batch calculation, progressive missing-fact input and result restoration.

## Feature and production safety

The app flow requires all three Staging flags:

- `EXPO_PUBLIC_USER_CENTRIC_PROFILE_V3=true`
- `EXPO_PUBLIC_USER_CENTRIC_ASSESSMENT_RESULTS=true`
- `EXPO_PUBLIC_USER_CENTRIC_PORTFOLIO=true`

Unknown, test without explicit overrides, and Production builds remain fail-closed. This phase does not migrate, backfill, write, or deploy Production data.
