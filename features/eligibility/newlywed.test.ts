import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createMinimalApplicantProfile, knownField, unknownField, notApplicableField, createPromptFatigueState, resolveFeaturePrompt, recordBundleShown, type ApplicantProfileV2 } from '../profile/domain.ts';
import { evaluateNewlywedEligibility as evaluate, NEWLYWED_RULE_METADATA, NEWLYWED_STATUS_LABELS, NEWLYWED_CHECK_LABELS, newlywedProfileRoute, buildNewlywedListingContext, type NewlywedListingContext } from './newlywed.ts';
import { buildNewlywedAiContext, isNewlywedAiContext, parseNewlywedAiSelection, buildNewlywedExplanation } from './newlywedAi.ts';
import type { DiscoveryListing } from '../discovery/types.ts';

let assertions = 0;
function eq(actual: unknown, expected: unknown) { assertions++; assert.deepEqual(actual, expected); }
function ok(value: unknown) { assertions++; assert.ok(value); }
function empty() { return createMinimalApplicantProfile({ name: 'PRIVATE_NAME_MARKER', age: 32, currentRegion: '', preferredRegions: [] }); }
function complete(): ApplicantProfileV2 {
  const p = empty();
  p.residence.currentRegion = 'PRIVATE_REGION_MARKER';
  p.family = { marriageStatus: knownField('married'), marriageYears: knownField(3), childrenCount: knownField(0), childBirthYears: notApplicableField() };
  p.subscriptionAccount = { hasAccount: knownField(true), accountMonths: knownField(12), monthlyPayment: knownField(123456) };
  p.housing.currentOwnership = knownField('no-home'); p.housing.householdHasHome = knownField(false); p.housing.hasSpecialSupplyRestriction = knownField(false);
  p.income.annualRange = knownField('30m-50m'); p.assets.realEstate = notApplicableField();
  return p;
}
function status(key: string, mutate?: (p: ApplicantProfileV2) => void, context?: NewlywedListingContext) {
  const p = complete(); mutate?.(p); return evaluate(p, context).checks.find(c => c.key === key)?.status;
}
eq(evaluate(empty()).status, 'needs_information');
eq(evaluate(complete()).status, 'needs_listing_confirmation');
eq(evaluate(complete()).checks.length, 12);
eq(status('marriage_status'), 'met');
eq(status('marriage_status', p => p.family.marriageStatus = knownField('single')), 'not_met');
eq(status('marriage_status', p => p.family.marriageStatus = unknownField()), 'needs_information');
for (const years of [0, 1, 6, 6.9]) eq(status('marriage_period', p => p.family.marriageYears = knownField(years)), 'met');
eq(status('marriage_period', p => p.family.marriageYears = knownField(7)), 'needs_listing_confirmation');
for (const years of [7.01, 8, 20]) eq(status('marriage_period', p => p.family.marriageYears = knownField(years)), 'not_met');
for (const value of [unknownField<number>(), notApplicableField<number>(), knownField(-1), knownField(NaN), knownField(Infinity)]) eq(status('marriage_period', p => p.family.marriageYears = value), 'needs_information');
eq(status('household_housing'), 'met');
eq(status('household_housing', p => p.housing.currentOwnership = knownField('owns-home')), 'needs_listing_confirmation');
eq(status('household_housing', p => p.housing.householdHasHome = knownField(true)), 'needs_listing_confirmation');
eq(status('household_housing', p => p.housing.householdHasHome = unknownField()), 'needs_information');
eq(status('household_housing', p => p.housing.currentOwnership = unknownField()), 'needs_information');
eq(status('household_housing', p => { p.housing.previousOwnership = knownField(true); p.housing.householdDisqualifyingPreviousOwnership = knownField(true); }), 'met');
eq(status('special_supply_restriction'), 'met');
eq(status('special_supply_restriction', p => p.housing.hasSpecialSupplyRestriction = knownField(true)), 'needs_listing_confirmation');
eq(status('special_supply_restriction', p => p.housing.hasSpecialSupplyRestriction = unknownField()), 'needs_information');
eq(status('subscription_period'), 'met');
eq(status('subscription_period', p => p.subscriptionAccount.hasAccount = knownField(false)), 'not_met');
eq(status('subscription_period', p => p.subscriptionAccount.hasAccount = unknownField()), 'needs_information');
eq(status('subscription_period', p => p.subscriptionAccount.accountMonths = unknownField()), 'needs_information');
for (const months of [0, 1, 5]) eq(status('subscription_period', p => p.subscriptionAccount.accountMonths = knownField(months)), 'not_met');
for (const months of [6, 7, 600]) eq(status('subscription_period', p => p.subscriptionAccount.accountMonths = knownField(months)), 'met');
eq(status('subscription_deposit', p => p.subscriptionAccount.monthlyPayment = knownField(5000000)), 'needs_listing_confirmation');
for (const range of ['under-30m', '30m-50m', '50m-70m', '70m-100m', 'over-100m'] as const) eq(status('income', p => p.income.annualRange = knownField(range)), 'needs_listing_confirmation');
eq(status('income', p => p.income.annualRange = unknownField()), 'needs_information');
for (const range of ['under-10m', '10m-30m', '30m-50m', '50m-100m', 'over-100m'] as const) eq(status('real_estate', p => p.assets.realEstate = knownField(range)), 'needs_listing_confirmation');
eq(status('real_estate'), 'needs_listing_confirmation');
eq(status('real_estate', p => p.assets.realEstate = unknownField()), 'needs_information');
for (const count of [0, 1, 3]) eq(status('children_priority', p => { p.family.childrenCount = knownField(count); p.family.childBirthYears = knownField([2026]); }), 'needs_listing_confirmation');
eq(status('children_priority', p => p.family.childrenCount = unknownField()), 'needs_information');
eq(status('residence'), 'needs_listing_confirmation');
eq(status('residence', p => { p.residence.currentRegion = ''; p.preferences.regions = ['서울']; }), 'needs_information');
for (const supplyType of ['national-housing', 'public-sale', 'rental'] as const) eq(evaluate(complete(), { supplyType }).status, 'unsupported');
eq(evaluate(empty(), { housingType: 'other' }).status, 'unsupported');
eq(evaluate(complete(), { exclusiveAreaM2: 85.01 }).status, 'unsupported');
eq(status('supported_scope', undefined, { supplyType: 'private-housing', housingType: 'apartment', exclusiveAreaM2: 85 }), 'met');
eq(status('newlywed_allocation', undefined, { newlywedSupplyCount: 0 }), 'unsupported');
eq(status('newlywed_allocation', undefined, { newlywedSupplyCount: 2 }), 'met');
eq(status('newlywed_allocation'), 'needs_listing_confirmation');
for (const date of ['2026-07-07', '2025-01-01', 'garbage', '2026-02-30']) {
  const p = complete(); p.family.marriageYears = knownField(20);
  eq(evaluate(p, { announcementDate: date }).status, 'needs_listing_confirmation');
  eq(evaluate(p, { announcementDate: date }).checks.length, 1);
}
eq(evaluate(complete(), { announcementDate: '2026-07-08' }).checks.length, 12);
for (const field of ['marriageStatus', 'marriageYears', 'childrenCount'] as const) {
  const p = complete(); p.family[field] = { status: 'unknown' }; ok(evaluate(p).status !== 'not_eligible');
}
const missing = evaluate(empty());
ok(missing.checks.every(c => c.status !== 'not_met'));
eq(missing.missingBundles.length, new Set(missing.missingBundles).size);
ok(missing.checks.every(c => c.sourceRefs.length));
ok(missing.checks.filter(c => c.status === 'needs_information').every(c => c.requiredBundle));
for (const bundle of missing.missingBundles) ok(newlywedProfileRoute(bundle).endsWith('&returnTo=/eligibility/newlywed'));
const prompt = createPromptFatigueState();
eq(resolveFeaturePrompt('newlywed', empty(), prompt), 'FAMILY');
eq(resolveFeaturePrompt('newlywed', empty(), recordBundleShown(prompt, 'FAMILY')), null);
const route = readFileSync(new URL('../../app/eligibility/newlywed.tsx', import.meta.url), 'utf8');
ok(route.includes('ProfilePromptSheet')); ok(route.includes('newlywedProfileRoute(bundleId)'));
ok(readFileSync(new URL('../../app/profile.tsx', import.meta.url), 'utf8').includes('router.replace(params.returnTo as Href)'));
const fakeListing = { sourceType: 'applyhome-apt', isDemo: false, supplyType: '민간분양', housingType: '아파트', announcementDate: '2026-09-01', complexName: '신혼 확정', officialSchedule: { specialSupply: { startDate: '2026-09-15' } } } as DiscoveryListing;
const listingContext = buildNewlywedListingContext(fakeListing);
eq(listingContext.newlywedSupplyCount, undefined); eq(listingContext.exclusiveAreaM2, undefined);
eq(evaluate(complete(), listingContext).status, 'needs_listing_confirmation');
eq(buildNewlywedListingContext({ ...fakeListing, isDemo: true }), {});
eq(NEWLYWED_RULE_METADATA.effectiveDate, '2026-07-08');
eq(NEWLYWED_RULE_METADATA.sources[0].effectiveDate, '2026-06-15');

const p = complete(); const beforeProfile = JSON.stringify(p); const result = evaluate(p); const beforeResult = JSON.stringify(result);
const context = buildNewlywedAiContext(result);
ok(isNewlywedAiContext(context));
for (const marker of ['PRIVATE_NAME_MARKER', 'PRIVATE_REGION_MARKER', '123456', '30m-50m', 'applicantProfile', 'subscriptionAccount']) ok(!JSON.stringify(context).includes(marker));
ok(!isNewlywedAiContext({ ...context, profile: p }));
ok(!isNewlywedAiContext({ ...context, checks: [{ ...context.checks[0], rawProfile: p }] }));
ok(!isNewlywedAiContext({ ...context, ruleMetadata: { ...context.ruleMetadata, raw: p } }));
ok(!isNewlywedAiContext({ ...context, status: 'likely_eligible' }));
ok(!isNewlywedAiContext({ ...context, missingInfo: ['income'] }));
for (const modelOutput of ['자격이 됩니다', { answer: '당첨 확률 90%' }, { checkKeys: ['income'], status: 'likely_eligible' }, { checkKeys: ['income'], score: 100 }, { checkKeys: ['unknown'] }, { checkKeys: [] }, { checkKeys: ['income', 'income'] }, { checkKeys: ['income'], answer: '합격 가능합니다' }]) {
  eq(parseNewlywedAiSelection(modelOutput, context), null);
}
const selection = parseNewlywedAiSelection({ checkKeys: ['income', 'real_estate'] }, context);
ok(selection); ok(buildNewlywedExplanation(context, selection).includes('공고 확인이 필요해요'));
ok(buildNewlywedExplanation(context).includes('최종 신청 가능 여부'));
eq(JSON.stringify(p), beforeProfile); eq(JSON.stringify(result), beforeResult);
const forged = { ...result, rawProfile: p };
ok(!JSON.stringify(buildNewlywedAiContext(forged)).includes('rawProfile'));
// Check public copy values, not internal feature/version identifiers or TS source strings.
const copyResults = [evaluate(empty()), evaluate(complete()), evaluate(complete(), { supplyType: 'rental' }), evaluate(complete(), { announcementDate: '2025-01-01' })];
const publicCopy = [...Object.values(NEWLYWED_STATUS_LABELS), ...Object.values(NEWLYWED_CHECK_LABELS), ...copyResults.flatMap(r => [r.title, r.summary, r.disclaimer, ...r.checks.flatMap(c => [c.label, c.reason]), ...r.actions.map(a => a.label)])];
ok(publicCopy.every(copy => !/\bv1\b/i.test(copy)));
ok(copyResults.every(r => r.disclaimer.endsWith('확인해 주세요.')));
ok(NEWLYWED_RULE_METADATA.ruleSetVersion.endsWith('-v1'));
console.log(`newlywed eligibility + AI: ${assertions} assertions passed`);
