import assert from 'node:assert/strict';
import test from 'node:test';
import { accessLevelForPath, safeAuthReturnTo } from './authPolicy.ts';

const enabled = {
  userCentricProfileV3: true,
  userCentricAssessmentResults: true,
  userCentricPortfolio: true,
};

test('public discovery remains available while personal routes require auth', () => {
  assert.equal(accessLevelForPath('/discovery', enabled), 'PUBLIC');
  assert.equal(accessLevelForPath('/intro', enabled), 'PUBLIC');
  assert.equal(accessLevelForPath('/portfolio', enabled), 'AUTHENTICATED');
  assert.equal(accessLevelForPath('/assessment', enabled), 'AUTHENTICATED');
  assert.equal(accessLevelForPath('/profile-onboarding', enabled), 'AUTHENTICATED');
  assert.equal(accessLevelForPath('/portfolio', { ...enabled, userCentricProfileV3: false }), 'PUBLIC');
});

test('post-auth return target accepts only internal paths', () => {
  assert.equal(safeAuthReturnTo('/assessment?listingId=one'), '/assessment?listingId=one');
  assert.equal(safeAuthReturnTo(['/portfolio']), '/portfolio');
  assert.equal(safeAuthReturnTo('https://evil.example'), null);
  assert.equal(safeAuthReturnTo('//evil.example'), null);
  assert.equal(safeAuthReturnTo('/ok\n/evil'), null);
});
