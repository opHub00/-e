export type ReviewAuthEvent =
  | 'INITIAL_SESSION'
  | 'SIGNED_IN'
  | 'SIGNED_OUT'
  | 'TOKEN_REFRESHED'
  | 'USER_UPDATED'
  | 'PASSWORD_RECOVERY'
  | 'MFA_CHALLENGE_VERIFIED';

export type ReviewAuthSession = { user?: { id?: string | null } | null } | null;

/**
 * Emits only when the actor identity changes. Token refreshes and same-user metadata
 * updates keep the open editor and draft intact. Permission changes are picked up by
 * explicit reload or a subsequent FORBIDDEN mutation response.
 */
export function createReviewAuthIdentityObserver(onIdentityChange: () => void) {
  let previousUserId: string | null | undefined;
  return (event: ReviewAuthEvent | string, session: ReviewAuthSession) => {
    const nextUserId = session?.user?.id ?? null;
    if (event === 'INITIAL_SESSION') {
      previousUserId = nextUserId;
      return;
    }

    const changed = previousUserId !== undefined && previousUserId !== nextUserId;
    // A fresh SIGNED_IN must reload even when the same account re-authenticates
    // after AUTH_EXPIRED. Refresh and metadata events for that account stay quiet.
    const signedBoundary = event === 'SIGNED_OUT' || event === 'SIGNED_IN';
    previousUserId = nextUserId;
    if (changed || signedBoundary) onIdentityChange();
  };
}
