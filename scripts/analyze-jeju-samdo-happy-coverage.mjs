import { readFile } from 'node:fs/promises';
import { assessApplication } from '../features/applicationAssessment/engine.ts';
import { knownField, createMinimalApplicantProfile } from '../features/profile/domain.ts';
import { validateImportPackage } from '../features/applicationAssessment/server/importPackage.ts';

const packageJson = JSON.parse(await readFile(new URL(
  '../data/assessment-rules/lh-jeju-ildo-samdo-happy-20260918.json', import.meta.url,
), 'utf8'));
const rules = validateImportPackage(packageJson).rules;
const supplies = ['student', 'youth', 'newlywed', 'senior', 'housingBenefit'];

function profileFor(supply) {
  const age = supply === 'senior' ? 76 : 30;
  const profile = createMinimalApplicantProfile({
    name: `삼도 ${supply} coverage`, age,
    currentRegion: '제주특별자치도', preferredRegions: ['제주특별자치도'],
  });
  profile.family.marriageStatus = knownField(supply === 'newlywed' || supply === 'senior' ? 'married' : 'single');
  profile.housing.currentOwnership = knownField('no-home');
  profile.housing.householdHasHome = knownField(false);
  profile.household.memberCount = knownField(supply === 'newlywed' ? 2 : 1);
  return profile;
}

function reusableDetails(supply) {
  const common = {
    birthDate: supply === 'senior' ? '1950-01-01' : '1996-09-18',
    currentResidence: '제주특별자치도',
    incomeSourceRegion: '제주특별자치도',
    children: [],
    incomeHouseholdSize: supply === 'newlywed' ? 2 : 1,
    householdIncome: supply === 'newlywed' ? 6_000_000 : 4_000_000,
    totalAssets: supply === 'newlywed' || supply === 'senior' ? 200_000_000 : 100_000_000,
    vehicleValue: supply === 'student' ? 0 : 20_000_000,
    specialExceptions: [],
  };
  if (supply === 'student') Object.assign(common, {
    educationStatus: 'ENROLLED_OR_INCOMING', parentApplicantMonthlyIncome: 4_000_000,
    schoolRegion: '제주특별자치도',
  });
  if (supply === 'newlywed') Object.assign(common, {
    familyCategory: 'engaged', plannedMarriageWithinDeadline: true, dualIncome: false,
  });
  if (supply === 'housingBenefit') common.housingBenefitRecipient = true;
  return common;
}

const listingScopedAnswers = {
  adultOrMinorHouseholdHeadException: true,
  noPublicRentalSubletRestriction: true,
  singleHouseholdApplicationClear: true,
  canProveSubscriptionByMoveIn: true,
};

function assess(supply, revisit) {
  const details = reusableDetails(supply);
  if (revisit) Object.assign(details, listingScopedAnswers);
  const result = assessApplication(rules, { profile: profileFor(supply), details }, rules.listingId)
    .find(item => item.supplyType === supply);
  if (!result) throw new Error(`SUPPLY_RESULT_MISSING:${supply}`);
  return result;
}

const rows = supplies.map((supply) => {
  const first = assess(supply, false);
  const revisit = assess(supply, true);
  const repeatedQuestionsAvoided = first.missingInformation.filter(field => !revisit.missingInformation.includes(field));
  return {
    supplyType: supply,
    firstVisitStatus: first.status,
    firstVisitMissing: first.missingInformation,
    revisitStatus: revisit.status,
    revisitMissing: revisit.missingInformation,
    repeatedQuestionsAvoided,
  };
});

const report = {
  announcement: packageJson.announcement.externalId,
  firstVisit: {
    missingFacts: rows.reduce((sum, row) => sum + row.firstVisitMissing.length, 0),
    needsUserInput: rows.filter(row => row.firstVisitStatus === 'NEEDS_MORE_INFORMATION').length,
    confirmed: rows.filter(row => row.firstVisitStatus !== 'NEEDS_MORE_INFORMATION').length,
  },
  revisit: {
    missingFacts: rows.reduce((sum, row) => sum + row.revisitMissing.length, 0),
    needsUserInput: rows.filter(row => row.revisitStatus === 'NEEDS_MORE_INFORMATION').length,
    confirmed: rows.filter(row => row.revisitStatus !== 'NEEDS_MORE_INFORMATION').length,
    repeatedQuestionsAvoided: rows.reduce((sum, row) => sum + row.repeatedQuestionsAvoided.length, 0),
  },
  rows,
};

console.log(JSON.stringify(report, null, 2));
