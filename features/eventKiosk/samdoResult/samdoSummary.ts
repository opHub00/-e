import type { KioskBucket } from '../evaluate.ts';
import type { SamdoPresentationItem, SamdoPresentationRecommendation } from '../samdo/index.ts';
import { SAMDO_DEEP_RULE_PACKAGE, SAMDO_ELIGIBILITY_LABELS } from '../samdo/index.ts';
import type { ResultSummaryV1, SummaryItem } from '../summary.ts';
import { shortStage, type SamdoResultView } from './samdoResultModel.ts';

/**
 * 휴대폰 QR 결과(기존 v1 결과 세션 계약 그대로). 개인정보 없이 공급유형·상태·단계·한 줄 메모만 담는다.
 * 결과 세션의 형식·보안 검사는 바꾸지 않는다.
 */
const BUCKET: Record<SamdoPresentationItem['eligibility'], KioskBucket> = {
  ELIGIBLE: 'eligible', EVIDENCE_REQUIRED: 'review', CONDITIONAL: 'review', INELIGIBLE: 'difficult',
};

function item(source: SamdoPresentationItem, note: string | null): SummaryItem {
  return {
    title: SAMDO_DEEP_RULE_PACKAGE.title,
    supply: source.supplyLabel,
    bucket: BUCKET[source.eligibility],
    stage: source.eligibility === 'INELIGIBLE' ? null : shortStage(source),
    note: note ? note.slice(0, 500) : SAMDO_ELIGIBILITY_LABELS[source.eligibility],
  };
}

export function buildSamdoQrSummary(input: { eventId: string; date: string; recommendation: SamdoPresentationRecommendation; view: SamdoResultView }): ResultSummaryV1 {
  const { recommendation: rec, view } = input;
  const ranked = [rec.recommendedType, ...rec.alternatives, ...rec.lowerPriorityTypes].filter((entry): entry is SamdoPresentationItem => Boolean(entry));
  const recommended = ranked.slice(0, 5).map((entry, index) => item(entry, index === 0 && rec.recommendedType ? `가장 유리한 신청유형 · 접수 ${view.hero.chips.find(chip => chip.testID === 'samdo-hero-date')?.label.replace(/^접수 /, '') ?? entry.applicationDate}` : view.alternatives.find(card => card.supplyType === entry.supplyType)?.checks[0] ?? null));
  return {
    v: 1,
    event: input.eventId,
    date: input.date,
    household: null,
    counts: {
      eligible: ranked.filter(entry => entry.eligibility === 'ELIGIBLE').length,
      review: ranked.filter(entry => entry.eligibility !== 'ELIGIBLE').length,
      difficult: rec.rejectedTypes.length,
    },
    recommended,
    // 휴대폰 화면의 '관심' 칸은 비워 둔다(이 화면에는 관심 담기가 없다).
    favorites: [],
    cautions: [...view.documents.slice(0, 3).map(doc => `준비 서류: ${doc}`), ...view.notes].slice(0, 6),
  };
}
