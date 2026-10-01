import assert from 'node:assert/strict';
import test from 'node:test';
import { createApplicantProfileFromLegacy, knownField, notApplicableField, unknownField } from './domain.ts';
import { migrateApplicantProfileV2ToV3, profileFactValue } from './v3.ts';

const legacy = () => {
  const profile = createApplicantProfileFromLegacy({
    name: '홍길동', age: 31, occupation: 'worker', region: '제주특별자치도',
    hasSubscriptionAccount: true, accountMonths: 24, monthlyPayment: 100_000, isNoHomeOwner: true,
  });
  profile.basic.birthDate = knownField('1995-09-14');
  profile.family.marriageStatus = knownField('married');
  profile.family.marriageYears = knownField(2);
  profile.family.childrenCount = knownField(2);
  profile.family.childBirthYears = knownField([2022, 2024]);
  profile.income.annualRange = knownField('30m-50m');
  profile.assets.realEstate = knownField('50m-100m');
  profile.assets.vehicle = notApplicableField();
  profile.assets.debt = unknownField();
  return profile;
};

test('V2 facts are migrated without inventing exact dates or amounts', () => {
  const migrated = migrateApplicantProfileV2ToV3(legacy(), {
    source: 'PERSISTED_USER', observedAt: '2026-10-01T00:00:00.000Z',
  });
  assert.deepEqual(profileFactValue(migrated.identity.birthDate), { value: '1995-09-14', precision: 'DAY' });
  assert.equal(migrated.subscriptionAccount.openedAt.state, 'UNKNOWN');
  assert.equal(profileFactValue(migrated.subscriptionAccount.legacyAccountMonths), 24);
  assert.equal(migrated.family.marriageDate.state, 'UNKNOWN');
  assert.equal(profileFactValue(migrated.family.legacyMarriageYears), 2);
  assert.equal(migrated.income.monthlyApplicantIncome.state, 'UNKNOWN');
  assert.equal(migrated.assets.totalApplicantAssets.state, 'UNKNOWN');
  assert.equal(profileFactValue(migrated.income.annualRange), '30m-50m');
  assert.equal(migrated.assets.vehicleRange.state, 'NOT_APPLICABLE');
  assert.equal(migrated.assets.debtRange.state, 'UNKNOWN');
  const children = profileFactValue(migrated.family.children)!;
  assert.deepEqual(children.map(child => profileFactValue(child.birthDate)), [
    { value: '2022', precision: 'YEAR' }, { value: '2024', precision: 'YEAR' },
  ]);
  assert.equal(migrated.identity.displayName.source, 'MIGRATED_V2');
});

test('demo seed provenance never promotes demo defaults to user facts', () => {
  const migrated = migrateApplicantProfileV2ToV3(legacy(), { source: 'DEMO_SEED' });
  assert.equal(migrated.identity.displayName.state, 'UNKNOWN');
  assert.equal(migrated.identity.birthDate.state, 'UNKNOWN');
  assert.equal(migrated.residence.currentRegion.state, 'UNKNOWN');
  assert.equal(migrated.subscriptionAccount.hasAccount.state, 'UNKNOWN');
  assert.equal(migrated.housing.currentOwnership.state, 'UNKNOWN');
  assert.deepEqual(migrated.preferences.regions, []);
});
