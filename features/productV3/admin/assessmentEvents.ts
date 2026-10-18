import type { NoticeAssessmentInput, Assessment, AssessmentFact, NoticeSupplyAssessment } from '../../noticePlatform/types.ts';
import { noticePlatform } from '../../eventKiosk/noticePlatform/index.ts';
import { resolveProductV3StagingTarget, sanitizeUnresolvedCategory } from './stagingTarget.ts';

export type AssessmentEventStatus = 'COMPLETE' | 'NEEDS_USER_INPUT' | 'INELIGIBLE' | 'UNAVAILABLE';
export type AssessmentEvent = {
  request_id: string;
  notice_id: string;
  supply_type: string;
  status: AssessmentEventStatus;
  unresolved_categories: string[];
  evidence_complete: boolean;
  rule_package_id: string;
  rule_package_version: string;
  source_status: Assessment['sourceStatus'];
};

const requestIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const categoryPatterns: Array<[RegExp, string]> = [
  [/재당첨|rewinning|rewinn/i, '재당첨 제한'],
  [/특별공급.*(당첨|이력)|special.*(supply|history)/i, '특별공급 당첨이력'],
  [/해외|overseas/i, '해외체류'],
  [/청약통장|입주자저축|납입|subscription|account|payment|deposit/i, '청약통장'],
  [/부모|세대.*자산|자산|asset|vehicle/i, '자산'],
  [/소득|income|맞벌이/i, '소득'],
  [/자녀|출생|입양|태아|child|birth/i, '자녀정보'],
  [/주택소유|무주택|주택 이력|ownership|housing/i, '주택소유'],
  [/혼인|결혼|marriage|spouse/i, '혼인'],
];

export const unresolvedCategory = (fact: AssessmentFact): string => {
  const value = `${fact.id} ${fact.label}`;
  return sanitizeUnresolvedCategory(categoryPatterns.find(([pattern]) => pattern.test(value))?.[1]);
};

const statusOf = (item: NoticeSupplyAssessment): AssessmentEventStatus => {
  if (!item.autoRecommend || item.eligibility === 'UNAVAILABLE') return 'UNAVAILABLE';
  if (item.eligibility === 'INELIGIBLE') return 'INELIGIBLE';
  if (item.eligibility === 'ELIGIBLE' && item.evidenceRequired.length === 0 && item.missingInformation.length === 0) return 'COMPLETE';
  return 'NEEDS_USER_INPUT';
};

export function assessmentEvents(requestId: string, assessments: readonly Assessment[]): AssessmentEvent[] {
  if (!requestIdPattern.test(requestId)) throw new Error('ASSESSMENT_EVENT_ID_INVALID');
  return assessments.flatMap(assessment => assessment.evaluations.map(item => ({
    request_id: requestId,
    notice_id: assessment.noticeId,
    supply_type: item.supplyTypeId,
    status: statusOf(item),
    unresolved_categories: [...new Set(assessment.unresolvedFacts
      .filter(fact => fact.affectedSupplyTypeIds.includes(item.supplyTypeId) && fact.state !== 'ANSWERED')
      .map(unresolvedCategory))],
    evidence_complete: item.evidenceRequired.length === 0 && item.missingInformation.length === 0,
    rule_package_id: assessment.rulePackageId,
    rule_package_version: assessment.rulePackageVersion,
    source_status: assessment.sourceStatus,
  })));
}

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
export function parseAssessmentRequest(value: unknown): { requestId: string; input: NoticeAssessmentInput } | null {
  if (!record(value) || !requestIdPattern.test(String(value.requestId ?? '')) || !record(value.input)) return null;
  const input = value.input;
  if (!record(input.profile) || input.profile.version !== 2 || !record(input.profile.basic) || input.profile.basic.name !== '' || !record(input.details)) return null;
  // The event route only assesses the two active Samdo notices. Client-provided statuses/counts/notice IDs are ignored.
  return { requestId: String(value.requestId), input: input as NoticeAssessmentInput };
}

export async function evaluateAndRecordAssessment(
  request: unknown,
  env: Record<string, string | undefined>,
  fetcher: typeof fetch = fetch,
): Promise<{ status: number; body: { result: string; recorded?: boolean } }> {
  // Check the exact staging identity before reading or evaluating a private request.
  const target = resolveProductV3StagingTarget(env);
  const parsed = parseAssessmentRequest(request);
  if (!parsed) return { status: 400, body: { result: 'INVALID_ASSESSMENT_REQUEST' } };
  let events: AssessmentEvent[];
  try {
    events = assessmentEvents(parsed.requestId, noticePlatform.assessNotices(parsed.input, ['samdo-1', 'samdo-2']));
  } catch {
    return { status: 400, body: { result: 'ASSESSMENT_INPUT_INVALID' } };
  }
  try {
    const response = await fetcher(new URL('/rest/v1/product_v3_assessment_events?on_conflict=request_id,notice_id,supply_type', target.url), {
      method: 'POST',
      headers: { apikey: target.serviceRoleKey, authorization: `Bearer ${target.serviceRoleKey}`, 'content-type': 'application/json', Prefer: 'resolution=ignore-duplicates,return=minimal' },
      body: JSON.stringify(events),
      signal: AbortSignal.timeout(6000),
    });
    return { status: 200, body: { result: 'ASSESSMENT_COMPLETED', recorded: response.ok } };
  } catch {
    // Monitoring must never change the user's deterministic assessment.
    return { status: 200, body: { result: 'ASSESSMENT_COMPLETED', recorded: false } };
  }
}
