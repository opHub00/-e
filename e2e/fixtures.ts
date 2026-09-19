/**
 * Deterministic browser fixtures.
 *
 * The rule package, the applicant profile and the engine are the project's own —
 * nothing here invents a verdict. The only thing faked is the database transport:
 * `serializeRuleSet` emits a rule set that is not yet active, so the three
 * activation columns are flipped to stand in for an approved row. Judgment inputs
 * are untouched, and every expectation below is produced by running the real
 * engine over the same strings the browser types.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { serializeRuleSet } from '../features/applicationAssessment/data/ruleCodec.ts';
import { assessApplication } from '../features/applicationAssessment/engine.ts';
import { parseForm } from '../features/applicationAssessment/form.ts';
import { validateImportPackage } from '../features/applicationAssessment/server/importPackage.ts';
import { samdoApplicant } from '../features/applicationAssessment/server/samdoProfiles.test-data.ts';
import { createMinimalApplicantProfile } from '../features/profile/domain.ts';
import type { ApplicationAssessmentResult, SupplyType } from '../features/applicationAssessment/types.ts';
import type { ApplicantProfileV2 } from '../features/profile/domain.ts';

// Playwright runs from the project root; the package is the same one the unit tests read.
const packagePath = resolve(process.cwd(), 'data/assessment-rules/samdo-2026-v1.7.json');
export const rules = validateImportPackage(JSON.parse(readFileSync(packagePath, 'utf8'))).rules;

export const ANNOUNCEMENT_ID = 'bade0617-63c6-4f61-86bf-6cd5ae17b101';
export const LISTING_ID = `announcement:${ANNOUNCEMENT_ID}`;
const RULE_SET_ID = '11111111-2222-4333-8444-555555555555';
const DOCUMENT_ID = 'bade0617-63c6-4f61-86bf-6cd5ae17d101';

/** What `read_assessment_rule_set` returns for an approved, active, public rule set. */
export function ruleSetPayload() {
  const wire = serializeRuleSet(rules, { announcementId: ANNOUNCEMENT_ID, ruleSetId: RULE_SET_ID, documentId: DOCUMENT_ID });
  return { ...wire, rule_set: { ...wire.rule_set, is_active: true, is_public: true, approved_at: '2026-09-14T00:00:00.000Z' } };
}
export const catalogPayload = () => [{ id: ANNOUNCEMENT_ID, title: rules.title, source_status: 'DRAFT_SOURCE_VERIFIED' }];

/** Exactly the values the browser types or taps. Keys match FORM_FIELDS plus the four choice cards. */
export const ANSWERS: Record<string, string> = {
  currentResidence: '제주특별자치도', familyCategory: 'married', overseas: 'no', exceptions: 'no',
  birthDate: '1995-09-14', residenceStartDate: '2024-09-14', subscriptionAccountOpenedAt: '2024-01-01',
  recognizedPaymentCount: '24', recognizedDepositAmount: '6000000', accountKindEligible: 'yes', firstRank: 'yes',
  isHouseholdHead: 'yes', householdNoWinningFiveYears: 'yes', monthlyIncome: '2669354', householdIncome: '5000000',
  incomeHouseholdSize: '2', dualIncome: 'no', totalAssets: '100000000', parentAssets: '200000000',
  specialSupplyHistory: 'no', reWinningRestriction: 'no', children: '없음', housingDisposalDates: '없음',
  marriageDate: '2025-09-14', firstMarriageDate: '2025-09-14', everMarried: 'yes',
};

/** A profile whose housing/account/income facts are still unknown, so the profile bucket has entries. */
export const bareProfile = () => createMinimalApplicantProfile({ name: '검증용 신청자', age: 31, currentRegion: '제주특별자치도', preferredRegions: [] });

export type Scenario = { name: string; supply: SupplyType; answers: Record<string, string>; profile: ApplicantProfileV2; expected: ApplicationAssessmentResult };

function outcome(supply: SupplyType, answers: Record<string, string>, profile: ApplicantProfileV2): ApplicationAssessmentResult {
  const parsed = parseForm(answers, supply);
  if (parsed.errors.length) throw new Error(`fixture answers rejected by parseForm: ${parsed.errors.join(' | ')}`);
  const result = assessApplication(rules, { profile, details: parsed.details }, LISTING_ID).find(r => r.supplyType === supply);
  if (!result) throw new Error(`no result for ${supply}`);
  return result;
}
const scenario = (name: string, supply: SupplyType, answers: Record<string, string>, profile = samdoApplicant(supply).profile): Scenario =>
  ({ name, supply, answers, profile, expected: outcome(supply, answers, profile) });

export const SCENARIOS: Scenario[] = [
  scenario('youth-eligible', 'youth', ANSWERS),
  scenario('newlywed-eligible', 'newlywed', ANSWERS),
  scenario('firstHome-eligible', 'firstHome', ANSWERS),
  scenario('youth-ineligible', 'youth', { ...ANSWERS, birthDate: '2008-09-15' }),
  scenario('youth-needs-info', 'youth', {}),
];
/** Same status as youth-needs-info, but the gaps live in the profile rather than in the answers. */
export const NEEDS_PROFILE = scenario('youth-needs-profile', 'youth', {}, bareProfile());

export const profileSeed = (supply: SupplyType) => samdoApplicant(supply).profile;
export const PROFILE_STORAGE_KEY = 'wanpan-e:applicant-profile-v2';
export const SUPPLY_TAB = { youth: '청년 특별공급', newlywed: '신혼부부 특별공급', firstHome: '생애최초 특별공급' } as const;
