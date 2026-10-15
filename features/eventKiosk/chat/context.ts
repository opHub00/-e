import type { KioskChat } from '../consult.ts';
import { KIOSK_STATUS_LABELS, humanize, humanizeAll } from '../presentation.ts';
import { SAMDO_ELIGIBILITY_LABELS } from '../samdo/presentation.ts';
import type {
  EventChatComparison,
  EventChatContext,
  EventChatOfficialScore,
} from './contract.ts';
import { SAMDO_EVENT } from '../samdoEventScope.ts';

const text = (value: string): string => humanize(value).slice(0, 300);
const list = (values: readonly string[], max = 8): string[] => humanizeAll(values).slice(0, max).map(value => value.slice(0, 300));

function genericScore(chat: KioskChat): EventChatOfficialScore {
  const score = chat.result?.officialScore;
  if (!score || score.status === 'NOT_APPLICABLE') return { status: 'NOT_APPLICABLE', label: '공식 점수 해당 없음' };
  if (score.status === 'PENDING') return { status: 'PENDING', label: '공식 점수 계산에 정보·서류 확인 필요' };
  return {
    status: 'AVAILABLE',
    label: `공식 가점 ${score.total}/${score.max}점`,
    total: score.total,
    max: score.max,
    breakdown: score.breakdown.slice(0, 8).map(item => ({ label: text(item.label), points: item.points, max: item.max })),
  };
}

const samdoScore = (score: NonNullable<KioskChat['samdoRecommendation']>['evaluations'][number]['officialScore']): EventChatOfficialScore => {
  if (score.status === 'NOT_APPLICABLE') return { status: 'NOT_APPLICABLE', label: '공식 점수 해당 없음' };
  if (score.status === 'PENDING') return { status: 'PENDING', label: '공식 가점 계산 전' };
  return {
    status: 'AVAILABLE',
    label: `공식 가점 ${score.total}/${score.max}점`,
    total: score.total,
    max: score.max,
    breakdown: score.breakdown.slice(0, 8).map(item => ({ label: text(item.label), points: item.points, max: item.max })),
  };
};

function samdoComparison(item: NonNullable<KioskChat['samdoRecommendation']>['evaluations'][number]): EventChatComparison {
  return {
    supplyType: text(item.supplyLabel),
    eligibility: SAMDO_ELIGIBILITY_LABELS[item.eligibility],
    priorityStage: item.stageLabel ? text(item.stageLabel) : null,
    officialScore: samdoScore(item.officialScore).label,
  };
}

function samdoContext(chat: KioskChat): EventChatContext | null {
  const recommendation = chat.samdoRecommendation;
  if (!recommendation) return null;
  const focus = recommendation.recommendedType ?? recommendation.alternatives[0] ?? recommendation.lowerPriorityTypes[0] ?? recommendation.rejectedTypes[0] ?? null;
  if (!focus) return null;
  return {
    schemaVersion: 1,
    scope: 'SAMDO',
    listingTitle: text(chat.context.listingTitle ?? SAMDO_EVENT.title),
    schedule: {
      special: SAMDO_EVENT.schedule.special,
      generalFirst: SAMDO_EVENT.schedule.generalFirst,
      generalSecond: SAMDO_EVENT.schedule.generalSecond,
      winnerAnnouncement: SAMDO_EVENT.schedule.winnerAnnouncement,
      documentSubmissionStart: SAMDO_EVENT.schedule.documentSubmission.start,
      documentSubmissionEnd: SAMDO_EVENT.schedule.documentSubmission.end,
      contractStart: SAMDO_EVENT.schedule.contract.start,
      contractEnd: SAMDO_EVENT.schedule.contract.end,
    },
    focus: {
      supplyType: text(focus.supplyLabel),
      eligibility: SAMDO_ELIGIBILITY_LABELS[focus.eligibility],
      priorityStage: focus.stageLabel ? text(focus.stageLabel) : null,
      officialScore: samdoScore(focus.officialScore),
      matchedAdvantages: list(focus.matchedAdvantages),
      missingInformation: list(focus.evidenceRequired),
      cautions: list([...focus.cautions, ...focus.failedReasons]),
      evidence: focus.evidence.slice(0, 8).map(item => ({
        label: text(item.label),
        section: text(item.section),
        ...(item.page === undefined ? {} : { page: item.page }),
      })),
      applicationDate: focus.applicationDate,
      supplyCount: focus.supplyCount,
    },
    recommendation: {
      recommendedType: recommendation.recommendedType ? text(recommendation.recommendedType.supplyLabel) : null,
      alternatives: recommendation.alternatives.slice(0, 5).map(samdoComparison),
      lowerPriorityTypes: recommendation.lowerPriorityTypes.slice(0, 5).map(samdoComparison),
      rejectedTypes: recommendation.rejectedTypes.slice(0, 6).map(item => ({ supplyType: text(item.supplyLabel), reason: text(item.failedReasons[0] ?? '신청 조건을 충족하지 못했어요.') })),
    },
  };
}

function portfolioContext(chat: KioskChat): EventChatContext | null {
  const result = chat.result;
  const listing = chat.listing;
  if (!result || !listing) return null;
  const eligibility = result.eligibility === 'ELIGIBLE'
    ? KIOSK_STATUS_LABELS.COMPLETE
    : result.eligibility === 'INELIGIBLE'
      ? KIOSK_STATUS_LABELS.INELIGIBLE
      : KIOSK_STATUS_LABELS.NEEDS_USER_INPUT;
  const comparisons = (chat.assessmentContext?.assessments ?? []).filter(item => !(item.listingId === result.listingId && item.supplyType === result.supplyType));
  const comparison = (item: typeof comparisons[number]): EventChatComparison => ({
    supplyType: text(`${item.listingTitle} · ${item.supplyLabel}`),
    eligibility: item.eligibility === 'ELIGIBLE' ? '신청 가능' : item.eligibility === 'INELIGIBLE' ? '신청 어려움' : '추가 확인 필요',
    priorityStage: item.priority.status === 'DETERMINED' ? text(item.priority.label) : null,
    officialScore: item.officialScore.status === 'AVAILABLE'
      ? `공식 가점 ${item.officialScore.total}/${item.officialScore.max}점`
      : item.officialScore.status === 'PENDING' ? '공식 점수 확인 필요' : '공식 점수 해당 없음',
  });
  return {
    schemaVersion: 1,
    scope: 'PORTFOLIO',
    listingTitle: text(listing.title),
    schedule: null,
    focus: {
      supplyType: text(result.supplyLabel),
      eligibility,
      priorityStage: result.priority.status === 'DETERMINED' ? text(result.priority.label) : null,
      officialScore: genericScore(chat),
      matchedAdvantages: list(result.matchedRules.map(item => item.label)),
      missingInformation: list(result.missingInformation),
      cautions: list([...result.failedRules.map(item => item.label), ...result.warnings]),
      evidence: (chat.assessmentContext?.evidence ?? []).filter(item => item.listingId === result.listingId && result.evidenceIds.includes(item.id)).slice(0, 8).map(item => ({
        label: text(item.label),
        section: text(item.section),
        ...(item.page === undefined ? {} : { page: item.page }),
      })),
      applicationDate: `${listing.applicationStartDate}~${listing.applicationEndDate}`,
    },
    recommendation: {
      recommendedType: null,
      alternatives: comparisons.filter(item => item.eligibility === 'ELIGIBLE').slice(0, 5).map(comparison),
      lowerPriorityTypes: comparisons.filter(item => item.eligibility !== 'ELIGIBLE' && item.eligibility !== 'INELIGIBLE').slice(0, 5).map(comparison),
      rejectedTypes: comparisons.filter(item => item.eligibility === 'INELIGIBLE').slice(0, 6).map(item => ({ supplyType: text(`${item.listingTitle} · ${item.supplyLabel}`), reason: text(item.failedRules[0]?.label ?? '신청 조건을 충족하지 못했어요.') })),
    },
  };
}

export function buildEventChatContext(chat: KioskChat): EventChatContext | null {
  return samdoContext(chat) ?? portfolioContext(chat);
}
