export const AUTH_SUCCESS_ROUTE = '/home' as const;

export function shouldNavigateAfterSignUp(needsEmailConfirmation: boolean): boolean {
  return !needsEmailConfirmation;
}
