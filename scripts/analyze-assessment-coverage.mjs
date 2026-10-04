import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { assessApplication } from '../features/applicationAssessment/engine.ts';
import { decodeRuleSet } from '../features/applicationAssessment/data/ruleCodec.ts';
import { portfolioEntryFromAssessment } from '../features/applicationAssessment/portfolio.ts';
import {
  aggregateCoverageMissingFields,
  aggregatePortfolioRuns,
  buildCoverageFunnel,
  coverageOperationsMetrics,
  isTestFixtureAnnouncement,
} from '../features/applicationAssessment/coverageAnalysis.ts';
import { assessmentInputFromApplicantProfileV3 } from '../features/applicationAssessment/v3Adapter.ts';
import { validateImportPackage } from '../features/applicationAssessment/server/importPackage.ts';
import { createEmptyApplicantProfileV3, knownProfileFact } from '../features/profile/v3.ts';
import { profileFieldForAssessmentFact } from '../features/profile/v3Completeness.ts';

const environment = process.env.WANPANE_ENV?.trim().toLowerCase();
const url = process.env.SUPABASE_STAGING_URL?.trim();
const stagingRef = process.env.SUPABASE_STAGING_PROJECT_REF?.trim().toLowerCase();
const productionRef = process.env.SUPABASE_PRODUCTION_PROJECT_REF?.trim().toLowerCase();
const serviceKey = process.env.SUPABASE_STAGING_SERVICE_ROLE_KEY?.trim();
const actualRef = (() => {
  try { return new URL(url).hostname.match(/^([a-z0-9]+)\.supabase\.co$/)?.[1] ?? null; }
  catch { return null; }
})();

assert.equal(environment, 'staging', 'STAGING_ENV_REQUIRED');
assert.ok(stagingRef && actualRef === stagingRef, 'STAGING_PROJECT_REF_MISMATCH');
assert.ok(productionRef && actualRef !== productionRef, 'PRODUCTION_PROJECT_FORBIDDEN');
assert.ok(serviceKey, 'STAGING_SERVICE_KEY_REQUIRED');

const tableRows = async table => {
  const response = await fetch(`${url}/rest/v1/${table}?select=*`, {
    headers: { apikey: serviceKey, authorization: `Bearer ${serviceKey}`, prefer: 'count=exact' },
  });
  if (!response.ok) return { error: `${response.status}:${(await response.json().catch(() => ({}))).message ?? 'REQUEST_FAILED'}` };
  const range = response.headers.get('content-range');
  const total = range?.split('/')[1];
  return { count: total && total !== '*' ? Number(total) : null, data: await response.json() };
};
const tables = [
  'announcements', 'announcement_documents', 'rule_extraction_jobs', 'assessment_rule_sets',
  'assessment_rules', 'rule_evidence', 'assessment_admin_reviews', 'announcement_listing_bindings',
  'assessment_rule_review_versions', 'assessment_rule_reviews', 'assessment_rule_evidence_reviews',
  'assessment_rule_review_conflicts', 'assessment_rule_review_unresolved', 'assessment_rule_exception_reviews',
];
const rows = {};
for (const table of tables) {
  rows[table] = await tableRows(table);
}
const tableErrors = Object.entries(rows).filter(([, result]) => 'error' in result);
assert.deepEqual(tableErrors, [], `STAGING_METADATA_READ_FAILED:${JSON.stringify(tableErrors)}`);

const fullProfile = ({ partial = false, newlywed = false } = {}) => {
  const p = createEmptyApplicantProfileV3();
  p.identity.birthDate = knownProfileFact({ value: '1993-05-05', precision: 'DAY' });
  p.residence.currentRegion = knownProfileFact(newlywed ? '경기도' : '제주특별자치도');
  p.family.marriageStatus = knownProfileFact(newlywed ? 'married' : 'single');
  p.housing.currentOwnership = knownProfileFact('no-home');
  p.subscriptionAccount.hasAccount = knownProfileFact(true);
  if (partial) return p;
  p.residence.startedAt = knownProfileFact({ value: '2020-01-01', precision: 'DAY' });
  p.residence.overseasStays = knownProfileFact([]);
  p.subscriptionAccount.kind = knownProfileFact('HOUSING_SUBSCRIPTION');
  p.subscriptionAccount.openedAt = knownProfileFact({ value: '2019-01-10', precision: 'DAY' });
  p.subscriptionAccount.recognizedPaymentCount = knownProfileFact(40);
  p.subscriptionAccount.recognizedPaymentCountAsOf = knownProfileFact({ value: '2026-09-01', precision: 'DAY' });
  p.subscriptionAccount.recognizedDepositAmount = knownProfileFact(12_000_000);
  p.subscriptionAccount.firstRank = knownProfileFact(true);
  p.housing.previousOwnership = knownProfileFact(false);
  p.housing.householdHasHome = knownProfileFact(false);
  p.housing.householdDisqualifyingPreviousOwnership = knownProfileFact(false);
  p.housing.hasSpecialSupplyRestriction = knownProfileFact(false);
  p.housing.ownershipHistory = knownProfileFact([]);
  p.housing.specialSupplyHistory = knownProfileFact([]);
  p.housing.reWinningRestrictionHistory = knownProfileFact([]);
  p.housing.currentReWinningRestriction = knownProfileFact(false);
  p.household.memberCount = knownProfileFact(newlywed ? 3 : 1);
  p.household.members = knownProfileFact([]);
  p.household.isHouseholdHead = knownProfileFact(true);
  p.family.marriageDate = newlywed ? knownProfileFact({ value: '2023-06-01', precision: 'DAY' }) : knownProfileFact({ value: '2020-01-01', precision: 'DAY' });
  p.family.firstMarriageDate = p.family.marriageDate;
  p.family.childrenCount = knownProfileFact(newlywed ? 1 : 0);
  p.family.children = knownProfileFact(newlywed ? [{ id: 'fixture-child-1', status: 'BORN', birthDate: knownProfileFact({ value: '2024-01-01', precision: 'DAY' }) }] : []);
  p.income.monthlyApplicantIncome = knownProfileFact(4_000_000);
  p.income.monthlySpouseIncome = knownProfileFact(newlywed ? 2_000_000 : 0);
  p.income.monthlyHouseholdIncome = knownProfileFact(newlywed ? 6_000_000 : 4_000_000);
  p.income.dualIncome = knownProfileFact(newlywed);
  p.income.workStartedAt = knownProfileFact({ value: '2018-01-01', precision: 'DAY' });
  p.income.workOrBusinessIncomeEligible = knownProfileFact(true);
  p.income.incomeTaxPaymentYears = knownProfileFact(7);
  p.assets.totalApplicantAssets = knownProfileFact(100_000_000);
  p.assets.parentAssets = knownProfileFact(200_000_000);
  p.assets.householdRealEstateAssets = knownProfileFact(0);
  p.assets.vehicleValue = knownProfileFact(0);
  return p;
};

const profiles = [
  { id: 'complete-general', profile: fullProfile() },
  { id: 'partial', profile: fullProfile({ partial: true }) },
  { id: 'newlywed-special', profile: fullProfile({ newlywed: true }) },
];
const packageDirectory = resolve('data/assessment-rules');
const packageFiles = (await readdir(packageDirectory)).filter(name => name.endsWith('.json')
  && !name.includes('.transcription.') && !name.includes('.review-annotations.')
  && !name.includes('.literal-expectations.') && !name.startsWith('demo-'));
const localPackages = [];
for (const file of packageFiles) {
  const raw = JSON.parse(await readFile(resolve(packageDirectory, file), 'utf8'));
  const validated = validateImportPackage(raw);
  localPackages.push({ file, announcementId: raw.announcement.id, externalId: raw.announcement.externalId,
    title: validated.rules.title, sourceStatus: validated.rules.sourceStatus,
    supplies: validated.rules.supplies.map(item => item.type), rules: raw.rules.length });
}
const assessmentRuns = [];
const baselineRuns = [];
const decodedBindings = [];
const runFromResult = (profileId, result) => {
  const entry = portfolioEntryFromAssessment(result);
  return {
    profileId,
    listingId: entry.listingId,
    supplyType: entry.supplyType,
    status: entry.status,
    missingUserFields: entry.missingUserFields,
    missingAnnouncementFields: entry.missingAnnouncementFields,
    ...(entry.unavailableReason ? { unavailableReason: entry.unavailableReason } : {}),
  };
};
for (const binding of rows.announcement_listing_bindings.data ?? []) {
  const response = await fetch(`${url}/rest/v1/rpc/read_assessment_rule_set`, {
    method: 'POST',
    headers: { apikey: serviceKey, authorization: `Bearer ${serviceKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({ p_announcement_id: null, p_listing_id: binding.listing_id }),
  });
  const payload = await response.json();
  const decoded = decodeRuleSet(payload, { listingId: binding.listing_id });
  decodedBindings.push({ listingId: binding.listing_id, announcementId: binding.announcement_id,
    status: decoded.status, supplies: decoded.status === 'AVAILABLE' ? decoded.rules.supplies.map(item => item.type) : [] });
  if (decoded.status !== 'AVAILABLE') {
    continue;
  }
  for (const fixture of profiles) {
    const input = assessmentInputFromApplicantProfileV3(fixture.profile, { announcementDate: decoded.rules.announcementDate, announcementDetails: {} });
    const priorAdapterInput = structuredClone(input);
    delete priorAdapterInput.details.accountKindEligible;
    delete priorAdapterInput.details.incomeHouseholdSize;
    assessmentRuns.push(...assessApplication(decoded.rules, input, decoded.rules.listingId).map(result => runFromResult(fixture.id, result)));
    baselineRuns.push(...assessApplication(decoded.rules, priorAdapterInput, decoded.rules.listingId).map(result => runFromResult(fixture.id, result)));
  }
}

const announcements = (rows.announcements.data ?? []).map(({ id, source, external_id, title, status }) =>
  ({ id, source, externalId: external_id, title, status }));
const fixtures = announcements.filter(isTestFixtureAnnouncement);
const operational = announcements.filter(item => !isTestFixtureAnnouncement(item));
const operationalIds = new Set(operational.map(item => item.id));
const documents = (rows.announcement_documents.data ?? []).filter(row => operationalIds.has(row.announcement_id));
const ruleSets = (rows.assessment_rule_sets.data ?? []).filter(row => operationalIds.has(row.announcement_id));
const adminApprovals = new Set((rows.assessment_admin_reviews.data ?? [])
  .filter(row => row.decision === 'APPROVED').map(row => row.rule_set_id));
const ruleSetAnnouncementIds = new Set(ruleSets.map(row => row.announcement_id));
const reviewedAnnouncementIds = new Set(ruleSets.filter(row => row.approved_at && adminApprovals.has(row.id)).map(row => row.announcement_id));
const activeSets = ruleSets.filter(row => row.is_active && row.is_public && row.approved_at);
const activeByAnnouncement = new Map(activeSets.map(row => [row.announcement_id, row]));
const correctBindings = (rows.announcement_listing_bindings.data ?? []).filter(binding =>
  operationalIds.has(binding.announcement_id) && activeByAnnouncement.get(binding.announcement_id)?.id === binding.bound_rule_set_id);
const decodedAnnouncementIds = new Set(decodedBindings.filter(row => row.status === 'AVAILABLE').map(row => row.announcementId));
const portfolioAnnouncementIds = new Set(decodedBindings.filter(row => row.status === 'AVAILABLE' && row.supplies.length).map(row => row.announcementId));
const extractionJobs = rows.rule_extraction_jobs.data ?? [];
const extracted = extractionJobs.length
  ? new Set(extractionJobs.filter(row => row.status === 'APPROVED').map(row => row.announcement_id)).size
  : null;
const funnel = buildCoverageFunnel({
  total: operational.length,
  documents: new Set(documents.map(row => row.announcement_id)).size,
  parsing: null,
  extraction: extracted,
  ruleSets: ruleSetAnnouncementIds.size,
  reviewed: reviewedAnnouncementIds.size,
  activePublicApproved: new Set(activeSets.map(row => row.announcement_id)).size,
  listingBindings: new Set(correctBindings.map(row => row.announcement_id)).size,
  deterministic: decodedAnnouncementIds.size,
  portfolioExposable: portfolioAnnouncementIds.size,
});
const portfolio = aggregatePortfolioRuns(assessmentRuns);
const baselinePortfolio = aggregatePortfolioRuns(baselineRuns);
const missing = aggregateCoverageMissingFields(assessmentRuns).map(item => {
  const definition = profileFieldForAssessmentFact(item.field);
  return { ...item, profileV3Supported: Boolean(definition), onboarding: definition ? (definition.initial ? 'INITIAL' : 'PROGRESSIVE') : 'NONE' };
});
const missingCount = runs => runs.reduce((sum, run) => sum + run.missingUserFields.length, 0);
const occurrence = (runs, field) => runs.filter(run => run.missingUserFields.map(item => item.replace(/^input:/, '')).includes(field)).length;
const supplyTypes = ['youth', 'newlywed', 'firstHome'];
const supplyCoverage = Object.fromEntries(supplyTypes.map(type => {
  const sets = ruleSets.filter(row => row.config?.supplies?.some(item => item.type === type));
  const active = activeSets.filter(row => row.config?.supplies?.some(item => item.type === type));
  const decoded = decodedBindings.filter(row => row.status === 'AVAILABLE' && row.supplies.includes(type));
  return [type, {
    announcements: new Set(sets.map(row => row.announcement_id)).size,
    ruleSets: sets.length,
    activeRuleSets: active.length,
    assessableListings: new Set(decoded.map(row => row.listingId)).size,
    rules: (rows.assessment_rules.data ?? []).filter(row => row.supply_type === type).length,
  }];
}));
const unavailableMetadata = [];
for (const announcement of operational) {
  const set = activeByAnnouncement.get(announcement.id);
  if (!documents.some(row => row.announcement_id === announcement.id)) unavailableMetadata.push({ announcementId: announcement.id, reason: 'DOCUMENT_MISSING' });
  else if (!ruleSetAnnouncementIds.has(announcement.id)) unavailableMetadata.push({ announcementId: announcement.id, reason: 'NO_ACTIVE_RULE_SET' });
  else if (!set) unavailableMetadata.push({ announcementId: announcement.id, reason: 'RULE_REVIEW_PENDING' });
  else if (!correctBindings.some(row => row.announcement_id === announcement.id)) unavailableMetadata.push({ announcementId: announcement.id, reason: 'NO_LISTING_BINDING' });
  else if (!decodedAnnouncementIds.has(announcement.id)) {
    const status = decodedBindings.find(row => row.announcementId === announcement.id)?.status;
    unavailableMetadata.push({ announcementId: announcement.id, reason: status === 'UNSUPPORTED_SCHEMA' ? 'UNSUPPORTED_SCHEMA' : 'INVALID_RULE_SET' });
  }
}
const missingAnnouncement = Object.entries(Object.groupBy(
  assessmentRuns.filter(run => run.status === 'NEEDS_USER_INPUT').flatMap(run => run.missingAnnouncementFields),
  value => value,
)).map(([field, values]) => ({ field, affectedResults: values.length })).sort((a, b) => b.affectedResults - a.affectedResults);
const operationsMetrics = coverageOperationsMetrics({ funnel, portfolio, missing });

const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  source: { projectRef: actualRef, mode: 'STAGING_READ_ONLY', remoteReads: tables.length + decodedBindings.length, remoteWrites: 0,
    userProfileReads: 0, userResultReads: 0 },
  dataset: { operationalAnnouncements: operational, explicitFixturesExcluded: fixtures, supplyCandidates: assessmentRuns.length / profiles.length,
    canonicalProfiles: profiles.map(item => item.id),
    repositoryPackages: localPackages.map(item => ({ ...item, staged: operational.some(row => row.id === item.announcementId || row.title === item.title) })),
    repositoryKnownUniqueAnnouncements: localPackages.length,
    repositoryPackagesNotStaged: localPackages.filter(item => !operational.some(row => row.id === item.announcementId || row.title === item.title)).length,
  },
  funnel,
  portfolio,
  unavailableMetadata,
  missingUserFacts: missing,
  missingAnnouncementFacts: missingAnnouncement,
  supplyCoverage,
  ruleLifecycle: {
    rules: rows.assessment_rules.count,
    evidence: rows.rule_evidence.count,
    extractionJobs: rows.rule_extraction_jobs.count,
    adminApprovals: (rows.assessment_admin_reviews.data ?? []).filter(row => row.decision === 'APPROVED').length,
    ruleReviews: Object.fromEntries(Object.entries(Object.groupBy(rows.assessment_rule_reviews.data ?? [], row => row.review_status)).map(([key, values]) => [key, values.length])),
    evidenceReviews: Object.fromEntries(Object.entries(Object.groupBy(rows.assessment_rule_evidence_reviews.data ?? [], row => row.review_status)).map(([key, values]) => [key, values.length])),
    conflicts: Object.fromEntries(Object.entries(Object.groupBy(rows.assessment_rule_review_conflicts.data ?? [], row => row.resolution_status)).map(([key, values]) => [key, values.length])),
    unresolved: { total: rows.assessment_rule_review_unresolved.count, open: (rows.assessment_rule_review_unresolved.data ?? []).filter(row => row.resolution === null).length },
    exceptions: Object.fromEntries(Object.entries(Object.groupBy(rows.assessment_rule_exception_reviews.data ?? [], row => row.review_status)).map(([key, values]) => [key, values.length])),
    workspaceLifecycle: Object.fromEntries(Object.entries(Object.groupBy(rows.assessment_rule_review_versions.data ?? [], row => row.lifecycle_status)).map(([key, values]) => [key, values.length])),
  },
  quickWinImpact: {
    before: { statuses: baselinePortfolio.statuses, missingUserFactOccurrences: missingCount(baselineRuns) },
    after: { statuses: portfolio.statuses, missingUserFactOccurrences: missingCount(assessmentRuns) },
    removedOccurrences: {
      accountKindEligible: occurrence(baselineRuns, 'accountKindEligible') - occurrence(assessmentRuns, 'accountKindEligible'),
      incomeHouseholdSize: occurrence(baselineRuns, 'incomeHouseholdSize') - occurrence(assessmentRuns, 'incomeHouseholdSize'),
      total: missingCount(baselineRuns) - missingCount(assessmentRuns),
    },
  },
  deterministicUnsupported: {
    invalidRuleSets: decodedBindings.filter(row => row.status === 'INVALID_RULE_SET').length,
    unsupportedSchemas: decodedBindings.filter(row => row.status === 'UNSUPPORTED_SCHEMA').length,
    supportedOperators: ['eq', 'gte', 'lte'],
    observedUnsupported: 0,
  },
  operationsMetrics,
  dataLimitations: [
    'Parsing success is NOT_MEASURED because no parsed-artifact status is persisted in the assessment registry.',
    'Extraction lineage is NOT_MEASURED because rule_extraction_jobs has no rows for the two active RuleSets.',
    'Stale result count is NOT_MEASURED because this audit intentionally does not read user result rows.',
    'Fixture profiles use no real user personal data and pass no announcement-specific overrides.',
  ],
};

console.log(JSON.stringify(report, null, 2));
