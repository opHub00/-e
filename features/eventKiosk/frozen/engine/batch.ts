import { assertUserProfile, type UserProfile } from '../domain/profile.ts';
import type { EvaluationResult } from '../domain/evaluation.ts';
import type { FrozenListingDataset } from '../domain/rules.ts';
import { assessRulePackage } from './evaluator.ts';
import { buildHouseholdFacts } from './facts.ts';

export type BatchAssessment = {
  datasetId: string;
  datasetVersion: string;
  profileId: string;
  evaluatedAt: string;
  results: EvaluationResult[];
};

export function assessFrozenDataset(
  profile: UserProfile,
  dataset: FrozenListingDataset,
  options: { evaluatedAt?: string } = {},
): BatchAssessment {
  assertUserProfile(profile);
  assertDatasetBindings(dataset);
  const evaluatedAt = options.evaluatedAt ?? new Date().toISOString();
  const listingById = new Map(dataset.listings.map(listing => [listing.id, listing]));
  const results = dataset.rulePackages.flatMap(rulePackage => {
    const listing = listingById.get(rulePackage.listingId);
    if (!listing) throw new Error(`Listing ${rulePackage.listingId} is missing`);
    const facts = buildHouseholdFacts(profile, rulePackage.announcementDate);
    return assessRulePackage({ listing, rulePackage, facts, evaluatedAt });
  }).sort((left, right) =>
    right.wanpanScore.score - left.wanpanScore.score
    || left.listingId.localeCompare(right.listingId)
    || left.supplyType.localeCompare(right.supplyType));
  return { datasetId: dataset.eventId, datasetVersion: dataset.datasetVersion, profileId: profile.profileId, evaluatedAt, results };
}

export function assertDatasetBindings(dataset: FrozenListingDataset): void {
  if (dataset.schemaVersion !== 1) throw new Error('Unsupported dataset schema version');
  if (dataset.region !== '제주특별자치도') throw new Error('Demo dataset must be scoped to 제주특별자치도');
  const listingIds = dataset.listings.map(listing => listing.id);
  if (new Set(listingIds).size !== listingIds.length) throw new Error('Duplicate listing id');
  const packageListingIds = dataset.rulePackages.map(rulePackage => rulePackage.listingId);
  const packageIds = dataset.rulePackages.map(rulePackage => rulePackage.id);
  if (new Set(packageIds).size !== packageIds.length) throw new Error('Duplicate Rule Package id');
  if (new Set(packageListingIds).size !== packageListingIds.length) throw new Error('Each listing must have exactly one Rule Package');
  if (!/^sha256:[a-f0-9]{64}$/.test(dataset.sourceFingerprint)) throw new Error('Invalid source fingerprint');
  const sourceDocumentIds = new Set(dataset.sourceDocuments.map(document => document.id));
  if (sourceDocumentIds.size !== dataset.sourceDocuments.length) throw new Error('Duplicate source document id');
  for (const document of dataset.sourceDocuments) {
    if (!/^[A-Fa-f0-9]{64}$/.test(document.sha256)) throw new Error(`Invalid source document hash for ${document.id}`);
  }
  for (const listing of dataset.listings) {
    const rulePackage = dataset.rulePackages.find(candidate => candidate.listingId === listing.id);
    if (!rulePackage) throw new Error(`Rule Package is missing for ${listing.id}`);
    if (rulePackage.announcementDate !== listing.announcementDate) throw new Error(`Announcement date mismatch for ${listing.id}`);
    if (rulePackage.supplies.length === 0) throw new Error(`Supply rules are missing for ${listing.id}`);
    if (listing.reviewStatus !== 'APPROVED_FOR_EVENT' || rulePackage.reviewStatus !== 'APPROVED_FOR_EVENT') {
      throw new Error(`Only APPROVED_FOR_EVENT data may be frozen: ${listing.id}`);
    }
    if (listing.sourceDocumentIds.some(id => !sourceDocumentIds.has(id))) throw new Error(`Missing source document for ${listing.id}`);
    const ruleSupplyTypes = rulePackage.supplies.map(supply => supply.supplyType).sort();
    if (JSON.stringify(ruleSupplyTypes) !== JSON.stringify([...listing.supplyTypes].sort())) throw new Error(`Supply inventory mismatch for ${listing.id}`);
  }
  for (const rulePackage of dataset.rulePackages) {
    if (!listingIds.includes(rulePackage.listingId)) throw new Error(`Orphan Rule Package ${rulePackage.id}`);
    const evidenceIds = new Set(rulePackage.evidence.map(evidence => evidence.id));
    if (evidenceIds.size !== rulePackage.evidence.length) throw new Error(`Duplicate evidence id in ${rulePackage.id}`);
    const supplyTypes = rulePackage.supplies.map(supply => supply.supplyType);
    if (new Set(supplyTypes).size !== supplyTypes.length) throw new Error(`Duplicate supply type in ${rulePackage.id}`);
    const conditionRuleIds = rulePackage.supplies.flatMap(supply => [
      ...supply.eligibility.map(rule => rule.id),
      ...supply.priorityTiers.flatMap(tier => tier.conditions.map(rule => rule.id)),
    ]);
    if (new Set(conditionRuleIds).size !== conditionRuleIds.length) throw new Error(`Duplicate condition rule id in ${rulePackage.id}`);
    const scoreById = new Map<string, string>();
    for (const scoreRule of rulePackage.supplies.flatMap(supply => supply.priorityTiers.flatMap(tier => tier.officialScore ?? []))) {
      const signature = JSON.stringify(scoreRule);
      if (scoreById.has(scoreRule.id) && scoreById.get(scoreRule.id) !== signature) throw new Error(`Conflicting score rule id in ${rulePackage.id}`);
      scoreById.set(scoreRule.id, signature);
    }
    const referencedEvidence = rulePackage.supplies.flatMap(supply => [
      ...supply.eligibility.map(rule => rule.evidenceId),
      ...supply.priorityTiers.flatMap(tier => [
        ...tier.conditions.map(rule => rule.evidenceId),
        ...(tier.officialScore ?? []).map(rule => rule.evidenceId),
      ]),
    ]);
    if (referencedEvidence.some(id => !evidenceIds.has(id))) throw new Error(`Missing evidence in ${rulePackage.id}`);
    for (const supply of rulePackage.supplies) {
      const ranks = supply.priorityTiers.map(tier => tier.rank);
      if (ranks.some(rank => !Number.isInteger(rank) || rank < 1) || new Set(ranks).size !== ranks.length) {
        throw new Error(`Invalid priority ranks in ${rulePackage.id}:${supply.supplyType}`);
      }
      for (const scoreRule of supply.priorityTiers.flatMap(tier => tier.officialScore ?? [])) {
        if (scoreRule.bands.length === 0) throw new Error(`Empty score bands for ${scoreRule.id}`);
        for (const band of scoreRule.bands) {
          if (!Number.isFinite(band.points) || band.points < 0 || (band.min !== undefined && !Number.isFinite(band.min)) || (band.max !== undefined && !Number.isFinite(band.max)) || (band.min !== undefined && band.max !== undefined && band.min > band.max)) {
            throw new Error(`Invalid score band for ${scoreRule.id}`);
          }
        }
        for (let left = 0; left < scoreRule.bands.length; left += 1) {
          for (let right = left + 1; right < scoreRule.bands.length; right += 1) {
            const first = scoreRule.bands[left];
            const second = scoreRule.bands[right];
            if (first && second && rangesOverlap(first.min, first.max, second.min, second.max)) throw new Error(`Overlapping score bands for ${scoreRule.id}`);
          }
        }
      }
    }
  }
}

function rangesOverlap(leftMin: number | undefined, leftMax: number | undefined, rightMin: number | undefined, rightMax: number | undefined): boolean {
  const aMin = leftMin ?? Number.NEGATIVE_INFINITY;
  const aMax = leftMax ?? Number.POSITIVE_INFINITY;
  const bMin = rightMin ?? Number.NEGATIVE_INFINITY;
  const bMax = rightMax ?? Number.POSITIVE_INFINITY;
  return aMin <= bMax && bMin <= aMax;
}
