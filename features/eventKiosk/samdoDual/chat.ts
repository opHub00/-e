import type { EventChatComparison, EventChatDualContext, EventChatFallback, EventChatOfficialScore, EventChatSchedule } from '../chat/contract.ts';
import type { SamdoRecommendationItem } from '../samdo/types.ts';
import { retrieveSamdoEvidence } from './rag.ts';
import type { SamdoDistrictAssessment, SamdoDualAssessment, SamdoRagIntent, SamdoUnitType } from './types.ts';

const won = (value: number) => `${value.toLocaleString('ko-KR')}원`;
const officialDate = (value: string) => value.replaceAll('-', '.');

function schedule(district: SamdoDistrictAssessment): EventChatSchedule {
  const value = district.district.schedule;
  return {
    special: value.special, generalFirst: value.generalFirst, generalSecond: value.generalSecond,
    winnerAnnouncement: value.winnerAnnouncement,
    documentSubmissionStart: value.documentSubmission.start, documentSubmissionEnd: value.documentSubmission.end,
    contractStart: value.contract.start, contractEnd: value.contract.end,
  };
}

function score(item: SamdoRecommendationItem | null): EventChatOfficialScore {
  if (!item || item.officialScore.status === 'PENDING') return { status: 'PENDING', label: '추가 확인 필요' };
  if (item.officialScore.status === 'NOT_APPLICABLE') return { status: 'NOT_APPLICABLE', label: '공식 점수 비적용' };
  return {
    status: 'AVAILABLE', label: `공식 ${item.officialScore.total}/${item.officialScore.max}점`,
    total: item.officialScore.total, max: item.officialScore.max,
    breakdown: item.officialScore.breakdown.map(value => ({ label: value.label, points: value.points, max: value.max })),
  };
}

function comparison(item: SamdoRecommendationItem | null): EventChatComparison | null {
  return item ? {
    supplyType: item.supplyLabel,
    eligibility: item.eligibility,
    priorityStage: item.stageLabel,
    officialScore: item.officialScore.status === 'AVAILABLE' ? `${item.officialScore.total}/${item.officialScore.max}점` : item.officialScore.status,
  } : null;
}

export function buildSamdoDualChatContext(assessment: SamdoDualAssessment, _question: string): EventChatDualContext {
  const preferred = assessment.comparison.preferredDistrictId
    ? assessment.districts.find(item => item.district.id === assessment.comparison.preferredDistrictId)!
    : assessment.districts[0];
  const focus = preferred.recommendation.recommendedType ?? preferred.recommendation.evaluations[0];
  return {
    schemaVersion: 2,
    scope: 'SAMDO_DUAL',
    listingTitle: '삼도이동 1·2지구 토지임대부 분양주택',
    schedule: null,
    focus: {
      supplyType: focus?.supplyLabel ?? '추천유형 없음', eligibility: focus?.eligibility ?? 'CONDITIONAL',
      priorityStage: focus?.stageLabel ?? null, officialScore: score(focus ?? null),
      matchedAdvantages: focus?.matchedAdvantages.slice(0, 8) ?? [],
      missingInformation: [...(focus?.evidenceRequired ?? []), ...(focus?.missingFacts ?? [])].slice(0, 8),
      cautions: focus?.cautions.slice(0, 8) ?? [],
      evidence: (focus?.evidence ?? []).slice(0, 8).map(item => ({ label: item.label, section: item.section, ...(item.page === undefined ? {} : { page: item.page }) })),
      applicationDate: focus?.applicationDate, supplyCount: focus?.supplyCount,
    },
    recommendation: {
      recommendedType: focus?.supplyLabel ?? null,
      alternatives: preferred.recommendation.alternatives.slice(0, 5).map(item => comparison(item)!),
      lowerPriorityTypes: preferred.recommendation.lowerPriorityTypes.slice(0, 5).map(item => comparison(item)!),
      rejectedTypes: preferred.recommendation.rejectedTypes.slice(0, 6).map(item => ({ supplyType: item.supplyLabel, reason: item.failedReasons[0] ?? '공고 조건 미충족' })),
    },
    districts: assessment.districts.map(item => ({
      id: item.district.id,
      title: item.district.title,
      managementNumber: item.district.managementNumber,
      schedule: schedule(item),
      supplyCounts: { ...item.district.inventory.bySupplyType },
      units: item.district.units.map(unit => ({ unitType: unit.unitType, prices: unit.prices, monthlyLandRentKrw: unit.monthlyLandRentKrw })),
      recommendation: comparison(item.recommendation.recommendedType),
    })),
    // Trusted HWP evidence is attached inside the server endpoint after validation.
    // The browser must never be allowed to author its own RAG evidence.
    retrievedEvidence: [],
  };
}

function supplyCountAnswer(assessment: SamdoDualAssessment, question: string): EventChatFallback {
  const district = /2지구/.test(question) ? assessment.districts[1] : assessment.districts[0];
  const entries: Array<[RegExp, keyof typeof district.district.inventory.bySupplyType, string]> = [
    [/신생아/, 'NEWBORN', '신생아 특별공급'], [/청년/, 'YOUTH', '청년 특별공급'], [/신혼/, 'NEWLYWED', '신혼부부 특별공급'],
    [/생애최초/, 'FIRST_HOME', '생애최초 특별공급'], [/일반/, 'GENERAL', '일반공급'],
  ];
  const selected = entries.find(([pattern]) => pattern.test(question));
  if (selected) return { text: `${district.district.title}의 ${selected[2]}은 ${district.district.inventory.bySupplyType[selected[1]]}세대예요.`, detail: ['공급 세대수는 당첨확률이나 경쟁률을 뜻하지 않아요.'] };
  return { text: `${district.district.title}은 총 ${district.district.inventory.total}세대이며, 특별공급 ${district.district.inventory.special}세대·일반공급 ${district.district.inventory.general}세대예요.` };
}

function scheduleAnswer(assessment: SamdoDualAssessment, question: string): EventChatFallback {
  const selected = /2지구/.test(question) ? [assessment.districts[1]] : /1지구/.test(question) ? [assessment.districts[0]] : [...assessment.districts];
  if (/당첨.*발표/.test(question)) return { text: selected.map(item => `${item.district.id === 'samdo-1' ? '1지구' : '2지구'} 당첨자 발표는 ${officialDate(item.district.schedule.winnerAnnouncement)}예요.`).join(' ') };
  if (/특별\s*공급/.test(question)) return { text: `두 지구 특별공급 접수일은 ${officialDate(selected[0].district.schedule.special)}예요.` };
  if (/일반\s*공급.*1\s*순위|1\s*순위/.test(question)) return { text: `두 지구 일반공급 1순위 접수일은 ${officialDate(selected[0].district.schedule.generalFirst)}예요.` };
  if (/일반\s*공급.*2\s*순위|2\s*순위/.test(question)) return { text: `두 지구 일반공급 2순위 접수일은 ${officialDate(selected[0].district.schedule.generalSecond)}예요.` };
  return {
    text: '두 지구의 청약 접수일은 같아요.',
    detail: [
      `특별공급 ${officialDate(selected[0].district.schedule.special)}`,
      `일반공급 1순위 ${officialDate(selected[0].district.schedule.generalFirst)}`,
      `일반공급 2순위 ${officialDate(selected[0].district.schedule.generalSecond)}`,
      ...selected.map(item => `${item.district.id === 'samdo-1' ? '1지구' : '2지구'} 당첨자 발표 ${officialDate(item.district.schedule.winnerAnnouncement)}`),
    ],
  };
}

function economicsAnswer(assessment: SamdoDualAssessment, question: string, intent: SamdoRagIntent): EventChatFallback {
  const selected = /2지구/.test(question) ? [assessment.districts[1]] : /1지구/.test(question) ? [assessment.districts[0]] : [...assessment.districts];
  const unitTypes: SamdoUnitType[] = /49/.test(question) ? ['49A'] : /59/.test(question) ? ['59A'] : ['49A', '59A'];
  if (intent === 'LAND_RENT') {
    return { text: selected.flatMap(item => unitTypes.map(unitType => {
      const unit = item.district.units.find(value => value.unitType === unitType)!;
      return `${item.district.id === 'samdo-1' ? '1지구' : '2지구'} ${unitType.replace('A', '㎡')} 월 토지임대료는 ${won(unit.monthlyLandRentKrw)}이에요.`;
    })).join(' ') };
  }
  return { text: selected.flatMap(item => unitTypes.map(unitType => {
    const unit = item.district.units.find(value => value.unitType === unitType)!;
    return `${item.district.id === 'samdo-1' ? '1지구' : '2지구'} ${unitType.replace('A', '㎡')} 분양가격은 ${unit.prices.map(price => `${price.floor} ${won(price.priceKrw)}`).join(', ')}이에요.`;
  })).join(' ') };
}

export function answerSamdoDualDeterministically(assessment: SamdoDualAssessment, question: string): EventChatFallback {
  const retrieval = retrieveSamdoEvidence(question);
  switch (retrieval.intent) {
    case 'SCHEDULE': return scheduleAnswer(assessment, question);
    case 'SUPPLY_COUNT': return supplyCountAnswer(assessment, question);
    case 'PRICE': return economicsAnswer(assessment, question, 'PRICE');
    case 'LAND_RENT': return economicsAnswer(assessment, question, 'LAND_RENT');
    case 'COMPARISON': return {
      text: assessment.comparison.preferredDistrictId ? `${assessment.comparison.preferredDistrictId === 'samdo-1' ? '1지구' : '2지구'}가 현재 비교 기준에서 먼저 정렬돼요.` : '현재 입력에서는 두 지구의 판정 우선순위가 같아요.',
      detail: [
        ...assessment.comparison.reasons,
        `1지구 총 ${assessment.districts[0].district.inventory.total}세대·2지구 총 ${assessment.districts[1].district.inventory.total}세대`,
        `59㎡ 월 토지임대료: 1지구 ${won(assessment.districts[0].district.units[1].monthlyLandRentKrw)}·2지구 ${won(assessment.districts[1].district.units[1].monthlyLandRentKrw)}`,
        assessment.comparison.disclaimer,
      ],
    };
    case 'LAND_LEASE': return { text: '토지임대부 분양주택은 토지는 공공이 소유하고 건물은 수분양자가 소유하는 방식으로, 공고에 정한 월 토지임대료를 납부해요.', detail: retrieval.chunks.slice(0, 2).map(chunk => `${chunk.districtId === 'samdo-1' ? '1지구' : '2지구'} 공고문 ${chunk.section}`) };
    case 'OVERSEAS': return { text: '해외체류가 있으면 공고문 기준에 따라 제주 거주기간 산정과 지역 우선공급 인정 여부를 확인해야 해요.', detail: retrieval.chunks.slice(0, 2).map(chunk => `${chunk.districtId === 'samdo-1' ? '1지구' : '2지구'} 공고문 ${chunk.section}`) };
    case 'DOCUMENTS': return { text: '신청유형에 따라 주민등록표등본·초본, 청약통장 순위확인서, 소득·자산 확인 서류와 가족관계·혼인·출생 관련 증빙을 준비해야 해요.', detail: assessment.districts[0].checklist.slice(0, 5).map(item => item.label) };
    case 'ELIGIBILITY': {
      const detail = assessment.districts.map(item => {
        const recommendation = item.recommendation.recommendedType;
        return `${item.district.id === 'samdo-1' ? '1지구' : '2지구'}: ${recommendation ? `${recommendation.supplyLabel} ${recommendation.eligibility}` : '확정 추천유형 없음'}`;
      });
      return { text: '동일한 입력으로 두 지구를 각각 판정했어요. 자세한 자격 상태는 아래와 같아요.', detail };
    }
    default: return { text: '질문을 정확히 이해하지 못했어요. 1·2지구 차이, 신청 일정, 공급 세대수, 분양가격, 토지임대료, 자격조건, 준비서류 중 무엇이 궁금한가요?' };
  }
}
