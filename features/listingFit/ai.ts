import type { DiscoveryListing } from '../discovery/types.ts';
import type {
  ListingPersonalFitCheckStatus,
  ListingPersonalFitResult,
  ListingPersonalFitSource,
  ListingPersonalFitStatus,
} from './personalFit.ts';

export type ListingFitExplanationCheck = {
  key: string;
  label: string;
  status: ListingPersonalFitCheckStatus;
  reason: string;
  sources: ListingPersonalFitSource[];
};

export type ListingFitExplanationContext = {
  feature: 'listing_personal_fit_v1';
  status: ListingPersonalFitStatus;
  summary: string;
  listing: {
    name: string;
    region: string;
    housingType: string;
    supplyType: string;
    recruitmentStatus: DiscoveryListing['recruitmentStatus'];
    recruitmentSchedule: string;
  };
  checks: ListingFitExplanationCheck[];
  missingBundles: string[];
  actions: string[];
  ruleSetVersion: string;
  firstHomeRuleSetVersion: string;
  disclaimer: string;
};

const CONTEXT_KEYS = [
  'feature',
  'status',
  'summary',
  'listing',
  'checks',
  'missingBundles',
  'actions',
  'ruleSetVersion',
  'firstHomeRuleSetVersion',
  'disclaimer',
] as const;

const LISTING_KEYS = [
  'name',
  'region',
  'housingType',
  'supplyType',
  'recruitmentStatus',
  'recruitmentSchedule',
] as const;

const CHECK_KEYS = ['key', 'label', 'status', 'reason', 'sources'] as const;
const FIT_STATUSES: ListingPersonalFitStatus[] = [
  'good_fit',
  'needs_information',
  'needs_listing_confirmation',
  'limited_fit',
];
const CHECK_STATUSES: ListingPersonalFitCheckStatus[] = [
  'matched',
  'needs_information',
  'needs_listing_confirmation',
  'limited',
];
const SOURCES: ListingPersonalFitSource[] = [
  'profile',
  'listing',
  'first-home-rule',
  'listing-confirmation-required',
];
const RECRUITMENT_STATUSES: DiscoveryListing['recruitmentStatus'][] = [
  'open',
  'upcoming',
  'closed',
  'unknown',
];

/** Detail에서 계산한 결과만 허용 목록으로 줄여 AI에 전달한다. raw ApplicantProfile과 listing id는 포함하지 않는다. */
export function buildListingFitExplanationContext(
  listing: DiscoveryListing,
  result: ListingPersonalFitResult,
): ListingFitExplanationContext {
  return {
    feature: 'listing_personal_fit_v1',
    status: result.status,
    summary: result.summary,
    listing: {
      name: listing.complexName,
      region: listing.region,
      housingType: listing.housingType,
      supplyType: listing.supplyType,
      recruitmentStatus: listing.recruitmentStatus,
      recruitmentSchedule: formatSchedule(listing),
    },
    checks: result.checks.map(({ key, label, status, reason, sources }) => ({
      key,
      label,
      status,
      reason,
      sources: [...sources],
    })),
    missingBundles: [...result.missingBundles],
    actions: result.actions.map((action) => action.label),
    ruleSetVersion: result.metadata.ruleSetVersion,
    firstHomeRuleSetVersion: result.metadata.firstHomeRuleSetVersion,
    disclaimer: result.disclaimer,
  };
}

export function isListingFitExplanationContext(value: unknown): value is ListingFitExplanationContext {
  if (!isRecord(value) || hasUnexpectedKeys(value, CONTEXT_KEYS)) return false;
  if (value.feature !== 'listing_personal_fit_v1') return false;
  if (!FIT_STATUSES.includes(value.status as ListingPersonalFitStatus)) return false;
  if (!isShortString(value.summary, 500)) return false;
  if (!isShortString(value.ruleSetVersion, 120) || !isShortString(value.firstHomeRuleSetVersion, 120)) return false;
  if (!isShortString(value.disclaimer, 500)) return false;
  if (!isListingSummary(value.listing)) return false;
  if (!Array.isArray(value.checks) || value.checks.length > 12 || !value.checks.every(isCheck)) return false;
  if (!isShortStringArray(value.missingBundles, 9, 60)) return false;
  if (!isShortStringArray(value.actions, 6, 120)) return false;
  return true;
}

export function parseListingFitExplanationContext(
  value: string | undefined,
): ListingFitExplanationContext | null {
  if (!value || value.length > 12_000) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return isListingFitExplanationContext(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function formatListingFitExplanationContext(context: ListingFitExplanationContext): string {
  return JSON.stringify(context);
}

/** 확률·점수·새 자격 판정이나 deterministic status와 반대되는 설명은 fallback으로 교체한다. */
export function isSafeListingFitExplanation(
  explanation: string,
  context: ListingFitExplanationContext,
): boolean {
  const text = explanation.trim();
  if (!text || text.length > 2_000) return false;
  if (/[가-힣]{2,4}님/.test(text)) return false;
  if (/\d+(?:\.\d+)?\s*(?:%|점)|당첨\s*(?:확률|가능성)|합격\s*확률|승산|커트라인|경쟁률/.test(text)) return false;
  if (/(?:신청|청약)\s*(?:자격|가능 여부).*(?:확정|충족|가능)|자격이\s*(?:됩니다|있습니다|없습니다)/.test(text)) return false;
  if (context.status === 'limited_fit' && /(?:아주|매우|충분히)?\s*잘\s*맞|좋은\s*선택|유리/.test(text)) return false;
  if (context.status === 'needs_information' && /모든\s*(?:정보|조건).*(?:확인|충족)|추가\s*정보가\s*필요\s*없/.test(text)) return false;
  if (context.status === 'needs_listing_confirmation' && /공고문.*확인.*필요\s*없|조건.*모두.*확인/.test(text)) return false;
  return true;
}

export function buildListingFitExplanationFallback(
  context: ListingFitExplanationContext,
): string {
  const firstCheck = context.checks[0];
  const nextAction = context.actions[0] ?? '모집공고 원문 확인하기';
  return [
    context.summary,
    firstCheck ? `${firstCheck.label}: ${firstCheck.reason}` : null,
    `다음에는 ${nextAction}부터 확인해 보세요.`,
    context.disclaimer,
  ].filter((line): line is string => Boolean(line)).join(' ');
}

function formatSchedule(listing: DiscoveryListing): string {
  if (listing.recruitmentStartDate && listing.recruitmentEndDate) {
    return `${listing.recruitmentStartDate}~${listing.recruitmentEndDate}`;
  }
  return listing.recruitmentStartDate ?? listing.recruitmentEndDate ?? '공고문 확인 필요';
}

function isListingSummary(value: unknown): value is ListingFitExplanationContext['listing'] {
  if (!isRecord(value) || hasUnexpectedKeys(value, LISTING_KEYS)) return false;
  return isShortString(value.name, 200)
    && isShortString(value.region, 40)
    && isShortString(value.housingType, 60)
    && isShortString(value.supplyType, 80)
    && RECRUITMENT_STATUSES.includes(value.recruitmentStatus as DiscoveryListing['recruitmentStatus'])
    && isShortString(value.recruitmentSchedule, 80);
}

function isCheck(value: unknown): value is ListingFitExplanationCheck {
  if (!isRecord(value) || hasUnexpectedKeys(value, CHECK_KEYS)) return false;
  return isShortString(value.key, 80)
    && isShortString(value.label, 100)
    && CHECK_STATUSES.includes(value.status as ListingPersonalFitCheckStatus)
    && isShortString(value.reason, 500)
    && Array.isArray(value.sources)
    && value.sources.length > 0
    && value.sources.length <= 4
    && value.sources.every((source) => SOURCES.includes(source as ListingPersonalFitSource));
}

function hasUnexpectedKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).some((key) => !allowed.includes(key));
}

function isShortString(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= max;
}

function isShortStringArray(value: unknown, maxItems: number, maxLength: number): value is string[] {
  return Array.isArray(value)
    && value.length <= maxItems
    && value.every((item) => isShortString(item, maxLength));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
