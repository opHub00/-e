import { NoticePlatform } from '../../noticePlatform/platform.ts';
import type { Assessment, NoticeAssessmentInput } from '../../noticePlatform/types.ts';
import type { CopilotSimulationOverride, CopilotSimulationResult } from './types.ts';

const getRecommended = (value: Assessment) => value.recommendation.recommended?.supplyTypeId ?? null;
const eligible = (value: Assessment) => new Set(value.evaluations.filter(item => item.eligibility === 'ELIGIBLE').map(item => item.supplyTypeId));
const score = (value: Assessment) => value.recommendation.recommended?.officialScore;

function applyOverride(input: NoticeAssessmentInput, override: CopilotSimulationOverride) {
  if (!override.path.startsWith('details.')) throw new Error(`SIMULATION_OVERRIDE_NOT_ALLOWED:${override.path}`);
  const key = override.path.slice('details.'.length);
  if (!key || key.includes('.') || ['profile', 'answerStates'].includes(key)) throw new Error(`SIMULATION_OVERRIDE_NOT_ALLOWED:${override.path}`);
  (input.details as Record<string, unknown>)[key] = override.value;
}

/** Runs only on a cloned input. No profile/store persistence is available from this function. */
export function runCopilotSimulation(platform: NoticePlatform, profile: NoticeAssessmentInput, noticeIds: readonly string[], overrides: readonly CopilotSimulationOverride[]): CopilotSimulationResult {
  const baselineInput = structuredClone(profile), simulatedInput = structuredClone(profile);
  for (const override of overrides) applyOverride(simulatedInput, override);
  const baseline = platform.assessNotices(baselineInput, noticeIds), simulatedResult = platform.assessNotices(simulatedInput, noticeIds);
  const diffs = baseline.map(before => {
    const after = simulatedResult.find(item => item.noticeId === before.noticeId)!;
    const beforeEligible = eligible(before), afterEligible = eligible(after);
    return { noticeId: before.noticeId, recommendedTypeBefore: getRecommended(before), recommendedTypeAfter: getRecommended(after),
      newlyEligibleTypes: [...afterEligible].filter(item => !beforeEligible.has(item)).sort(),
      noLongerEligibleTypes: [...beforeEligible].filter(item => !afterEligible.has(item)).sort(),
      officialScoreChanged: JSON.stringify(score(before)) !== JSON.stringify(score(after)),
      unresolvedBefore: before.unresolvedFacts.length, unresolvedAfter: after.unresolvedFacts.length };
  });
  return { baseline, overrides: overrides.map(value => structuredClone(value)), simulatedResult, diffs };
}
