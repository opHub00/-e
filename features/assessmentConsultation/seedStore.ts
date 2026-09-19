import type { ApplicantProfileV2 } from '../profile/domain.ts';
import type { ApplicationAssessmentResult, AssessmentInput, SupplyType } from '../applicationAssessment/types.ts';

export type AssessmentConsultationSeed = {
  listingId: string;
  supplyType: SupplyType;
  profile: ApplicantProfileV2;
  answers: AssessmentInput['details'];
  result: ApplicationAssessmentResult;
};

const seeds = new Map<string, AssessmentConsultationSeed>();
let sequence = 0;

/** Ephemeral hand-off only. Sensitive assessment answers are never persisted. */
export function registerAssessmentConsultationSeed(seed: AssessmentConsultationSeed): string {
  const id = `assessment-${++sequence}`;
  seeds.set(id, structuredClone(seed));
  while (seeds.size > 8) seeds.delete(seeds.keys().next().value as string);
  return id;
}

export function readAssessmentConsultationSeed(id: string | undefined): AssessmentConsultationSeed | null {
  const seed = id ? seeds.get(id) : undefined;
  return seed ? structuredClone(seed) : null;
}

export function clearAssessmentConsultationSeedsForTest() {
  seeds.clear(); sequence = 0;
}
