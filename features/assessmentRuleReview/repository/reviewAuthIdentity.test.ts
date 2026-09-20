import assert from 'node:assert/strict';
import test from 'node:test';
import { createReviewAuthIdentityObserver } from './reviewAuthIdentity.ts';

test('same-user token refresh and user update keep the open review session', () => {
  let changes = 0;
  const observe = createReviewAuthIdentityObserver(() => { changes += 1; });
  observe('INITIAL_SESSION', { user: { id: 'user-a' } });
  observe('TOKEN_REFRESHED', { user: { id: 'user-a' } });
  observe('USER_UPDATED', { user: { id: 'user-a' } });
  assert.equal(changes, 0);
});

test('sign-out and account switch invalidate the actor workspace', () => {
  let changes = 0;
  const observe = createReviewAuthIdentityObserver(() => { changes += 1; });
  observe('INITIAL_SESSION', { user: { id: 'user-a' } });
  observe('SIGNED_OUT', null);
  observe('SIGNED_IN', { user: { id: 'user-b' } });
  observe('TOKEN_REFRESHED', { user: { id: 'user-b' } });
  assert.equal(changes, 2);
});

test('same-user sign-in reloads after re-authentication without treating token refresh as an actor change', () => {
  let changes = 0;
  const observe = createReviewAuthIdentityObserver(() => { changes += 1; });
  observe('INITIAL_SESSION', { user: { id: 'user-a' } });
  observe('TOKEN_REFRESHED', { user: { id: 'user-a' } });
  observe('SIGNED_IN', { user: { id: 'user-a' } });
  assert.equal(changes, 1);
});
