import { groupMissingInformation } from '../applicationAssessment/form.ts';
import type { ApplicationAssessmentResult, SupplyType } from '../applicationAssessment/types.ts';

/**
 * 판정 결과를 공고 카드·상세에서 읽을 수 있는 형태로 바꾼다.
 *
 * 새 점수나 합격 확률을 만들지 않는다. 엔진이 이미 준 PASS/FAIL/UNKNOWN 개수와
 * missingInformation 을 세어 문장으로 바꿀 뿐이다. 특히 UNKNOWN 은 절대 충족처럼 보이면 안 되므로
 * "확인 필요"라는 자기 자리를 갖고, 충족 수에 합산하지 않는다.
 */
export type InsightStatus =
  /** 자격 판단이 끝났고 막는 조건이 없다. */
  | 'ANALYZED'
  /** 아직 모르는 조건이 남아 판단을 끝내지 못했다. */
  | 'NEEDS_MORE_INFORMATION'
  /** 현재 입력 기준으로 막는 조건이 있다. */
  | 'INELIGIBLE';

export type ListingInsight = {
  listingId: string;
  supplyType: SupplyType;
  status: InsightStatus;
  /** 카드에 한 줄로 쓰는 말. */
  label: string;
  /** 상세 상단에 쓰는 한 문장. */
  sentence: string;
  passed: number;
  failed: number;
  unknown: number;
  total: number;
  /** 사용자가 직접 답해서 풀 수 있는 항목 수. 공고 기준 미확인 같은 항목은 여기 넣지 않는다. */
  answerableMissing: number;
  /** 사람이 읽는 부족 정보 문구. */
  missingLabels: string[];
  /** 공고 기준 자체가 없어서 생긴 항목. 사용자가 입력해도 풀리지 않는다. */
  announcementMissingLabels: string[];
  profileMissingLabels: string[];
  scoring: ApplicationAssessmentResult['scoring'];
  scoreText: string | null;
  sourceStatus: ApplicationAssessmentResult['sourceStatus'];
};

/** 색만으로 구분하지 않도록 아이콘·문구를 함께 정한다. */
export const INSIGHT_VIEW: Record<InsightStatus, { tone: 'green' | 'amber' | 'pink'; icon: 'check-circle' | 'help-outline' | 'error-outline' }> = {
  ANALYZED: { tone: 'green', icon: 'check-circle' },
  NEEDS_MORE_INFORMATION: { tone: 'amber', icon: 'help-outline' },
  INELIGIBLE: { tone: 'pink', icon: 'error-outline' },
};

const statusOf = (result: ApplicationAssessmentResult): InsightStatus =>
  result.status === 'INELIGIBLE' ? 'INELIGIBLE'
    : result.status === 'ELIGIBLE' ? 'ANALYZED'
      : 'NEEDS_MORE_INFORMATION';

/**
 * 판정 결과 하나를 카드·상세용 요약으로 바꾼다.
 * 조건 수는 엔진이 준 배열 길이를 그대로 쓴다. 우리가 다시 계산하지 않는다.
 */
export function buildListingInsight(result: ApplicationAssessmentResult): ListingInsight {
  const passed = result.satisfiedConditions.length;
  const failed = result.failedConditions.length;
  const unknown = result.unknownConditions.length;
  const total = passed + failed + unknown;
  const grouped = groupMissingInformation(result.missingInformation);
  const status = statusOf(result);
  const answerableMissing = grouped.answers.length;
  // 엔진은 막는 조건이 있어도 다른 조건이 UNKNOWN 이면 판단을 끝내지 않는다(NEEDS_MORE_INFORMATION).
  // 그 뜻을 바꾸지 않되, 이미 맞지 않는 조건이 있다는 사실은 감추지 않는다.
  const label = status === 'INELIGIBLE'
    ? '현재 조건으로는 신청이 어려워요'
    : status === 'ANALYZED'
      ? '지금 정보로 신청 조건을 충족해요'
      : failed > 0
        ? `맞지 않는 조건 ${failed}개가 있어요. 확인이 더 필요해요`
        : answerableMissing > 0
          ? `정보 ${answerableMissing}개를 더 입력하면 분석할 수 있어요`
          : '확인이 더 필요한 조건이 있어요';
  const sentence = total > 0
    ? `조건 ${total}개 중 ${passed}개 충족${unknown ? ` · ${unknown}개 확인 필요` : ''}${failed ? ` · ${failed}개 미충족` : ''}`
    : '아직 확인된 조건이 없어요';
  return {
    listingId: result.listingId,
    supplyType: result.supplyType,
    status,
    label,
    sentence,
    passed,
    failed,
    unknown,
    total,
    answerableMissing,
    missingLabels: grouped.answers,
    announcementMissingLabels: grouped.announcement,
    profileMissingLabels: grouped.profile,
    scoring: result.scoring,
    scoreText: result.scoring === 'AVAILABLE' && result.score ? `${result.score.total} / ${result.score.max}점` : null,
    sourceStatus: result.sourceStatus,
  };
}

/**
 * 한 공고에 여러 공급유형 결과가 있으면 사용자에게 가장 의미 있는 것 하나를 고른다.
 * 좋아 보이는 쪽을 고르는 게 아니라, 판단이 끝난 것 > 확인이 필요한 것 > 막힌 것 순으로
 * "다음 행동이 있는" 결과를 앞세운다.
 */
const PRIORITY: Record<InsightStatus, number> = { ANALYZED: 0, NEEDS_MORE_INFORMATION: 1, INELIGIBLE: 2 };

export function pickPrimaryInsight(results: ApplicationAssessmentResult[]): ListingInsight | null {
  const insights = results.map(buildListingInsight);
  if (!insights.length) return null;
  return insights.slice().sort((left, right) =>
    PRIORITY[left.status] - PRIORITY[right.status]
    || right.passed - left.passed
    || left.answerableMissing - right.answerableMissing)[0];
}

/** 마감까지 남은 날. 날짜가 없거나 이미 지났으면 null 을 준다(추정하지 않는다). */
export function daysUntil(endDate: string | null | undefined, today: string): number | null {
  if (!endDate || !/^\d{4}-\d{2}-\d{2}/.test(endDate) || !/^\d{4}-\d{2}-\d{2}/.test(today)) return null;
  const end = Date.UTC(Number(endDate.slice(0, 4)), Number(endDate.slice(5, 7)) - 1, Number(endDate.slice(8, 10)));
  const now = Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1, Number(today.slice(8, 10)));
  const days = Math.round((end - now) / 86_400_000);
  return days < 0 ? null : days;
}

export function deadlineLabel(endDate: string | null | undefined, today: string): string | null {
  const days = daysUntil(endDate, today);
  if (days === null) return null;
  return days === 0 ? '오늘 마감' : `마감 D-${days}`;
}
