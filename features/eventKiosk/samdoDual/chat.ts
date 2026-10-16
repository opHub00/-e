import type { EventChatComparison, EventChatDualContext, EventChatFallback, EventChatHistoryTurn, EventChatOfficialScore, EventChatResolution, EventChatSchedule } from '../chat/contract.ts';
import type { SamdoRecommendationItem } from '../samdo/types.ts';
import { retrieveSamdoEvidence } from './rag.ts';
import type { SamdoDistrictAssessment, SamdoDualAssessment, SamdoRagIntent, SamdoUnitType } from './types.ts';
import type { SamdoUnresolvedAssessmentFact } from './unresolved.ts';

const won = (value: number) => `${value.toLocaleString('ko-KR')}원`;
const officialDate = (value: string) => value.replaceAll('-', '.');
const districtLabel = (id: 'samdo-1' | 'samdo-2') => id === 'samdo-1' ? '1지구' : '2지구';

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
    status: 'AVAILABLE', label: `공식 ${item.officialScore.total}/${item.officialScore.max}점`, total: item.officialScore.total, max: item.officialScore.max,
    breakdown: item.officialScore.breakdown.map(value => ({ label: value.label, points: value.points, max: value.max })),
  };
}

function comparison(item: SamdoRecommendationItem | null): EventChatComparison | null {
  return item ? {
    supplyType: item.supplyLabel, eligibility: item.eligibility, priorityStage: item.stageLabel,
    officialScore: item.officialScore.status === 'AVAILABLE' ? `${item.officialScore.total}/${item.officialScore.max}점` : item.officialScore.status,
  } : null;
}

export function buildSamdoDualChatContext(assessment: SamdoDualAssessment, _question: string, unresolvedFacts: readonly SamdoUnresolvedAssessmentFact[] = []): EventChatDualContext {
  const preferred = assessment.comparison.preferredDistrictId
    ? assessment.districts.find(item => item.district.id === assessment.comparison.preferredDistrictId)!
    : assessment.districts[0];
  const focus = preferred.recommendation.recommendedType ?? preferred.recommendation.evaluations[0];
  return {
    schemaVersion: 2, scope: 'SAMDO_DUAL', listingTitle: '삼도이동 1·2지구 토지임대부 분양주택', schedule: null,
    focus: {
      supplyType: focus?.supplyLabel ?? '추천유형 없음', eligibility: focus?.eligibility ?? 'CONDITIONAL', priorityStage: focus?.stageLabel ?? null,
      officialScore: score(focus ?? null), matchedAdvantages: focus?.matchedAdvantages.slice(0, 8) ?? [],
      missingInformation: unresolvedFacts.slice(0, 8).map(item => item.label), cautions: focus?.cautions.slice(0, 8) ?? [],
      evidence: (focus?.evidence ?? []).slice(0, 8).map(item => ({ label: item.label, section: item.section, ...(item.page === undefined ? {} : { page: item.page }) })),
      applicationDate: focus?.applicationDate, supplyCount: focus?.supplyCount,
    },
    recommendation: {
      recommendedType: preferred.recommendation.recommendedType?.supplyLabel ?? null,
      alternatives: preferred.recommendation.alternatives.slice(0, 5).map(item => comparison(item)!),
      lowerPriorityTypes: preferred.recommendation.lowerPriorityTypes.slice(0, 5).map(item => comparison(item)!),
      rejectedTypes: preferred.recommendation.rejectedTypes.slice(0, 6).map(item => ({ supplyType: item.supplyLabel, reason: item.failedReasons[0] ?? '공고 조건 미충족' })),
    },
    districts: assessment.districts.map(item => ({
      id: item.district.id, title: item.district.title, managementNumber: item.district.managementNumber, schedule: schedule(item),
      supplyCounts: { ...item.district.inventory.bySupplyType },
      units: item.district.units.map(unit => ({ unitType: unit.unitType, prices: unit.prices, monthlyLandRentKrw: unit.monthlyLandRentKrw })),
      recommendation: comparison(item.recommendation.recommendedType),
    })),
    unresolvedFacts: unresolvedFacts.slice(0, 16).map(item => ({
      label: item.label, state: item.state, districts: [...item.districts], affectedSupplyTypes: [...item.affectedSupplyLabels],
      userFacingQuestion: item.userFacingQuestion, reason: item.reason, evidenceNeeded: item.evidenceNeeded,
    })),
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
  if (/당첨.*발표/.test(question)) return { text: selected.map(item => `${districtLabel(item.district.id)} 당첨자 발표는 ${officialDate(item.district.schedule.winnerAnnouncement)}예요.`).join(' ') };
  if (/특별\s*공급/.test(question)) return { text: `두 지구 특별공급 접수일은 ${officialDate(selected[0].district.schedule.special)}예요.` };
  if (/일반\s*공급.*1\s*순위|1\s*순위/.test(question)) return { text: `두 지구 일반공급 1순위 접수일은 ${officialDate(selected[0].district.schedule.generalFirst)}예요.` };
  if (/일반\s*공급.*2\s*순위|2\s*순위/.test(question)) return { text: `두 지구 일반공급 2순위 접수일은 ${officialDate(selected[0].district.schedule.generalSecond)}예요.` };
  return { text: '두 지구의 청약 접수일은 같아요.', detail: [
    `특별공급 ${officialDate(selected[0].district.schedule.special)}`, `일반공급 1순위 ${officialDate(selected[0].district.schedule.generalFirst)}`,
    `일반공급 2순위 ${officialDate(selected[0].district.schedule.generalSecond)}`,
    ...selected.map(item => `${districtLabel(item.district.id)} 당첨자 발표 ${officialDate(item.district.schedule.winnerAnnouncement)}`),
  ] };
}

function economicsAnswer(assessment: SamdoDualAssessment, question: string, intent: SamdoRagIntent): EventChatFallback {
  const selected = /2지구/.test(question) ? [assessment.districts[1]] : /1지구/.test(question) ? [assessment.districts[0]] : [...assessment.districts];
  const unitTypes: SamdoUnitType[] = /49/.test(question) ? ['49A'] : /59/.test(question) ? ['59A'] : ['49A', '59A'];
  if (intent === 'LAND_RENT') return { text: selected.flatMap(item => unitTypes.map(unitType => {
    const unit = item.district.units.find(value => value.unitType === unitType)!;
    return `${districtLabel(item.district.id)} ${unitType.replace('A', '㎡')} 월 토지임대료는 ${won(unit.monthlyLandRentKrw)}이에요.`;
  })).join(' ') };
  return { text: selected.flatMap(item => unitTypes.map(unitType => {
    const unit = item.district.units.find(value => value.unitType === unitType)!;
    return `${districtLabel(item.district.id)} ${unitType.replace('A', '㎡')} 분양가격은 ${unit.prices.map(price => `${price.floor} ${won(price.priceKrw)}`).join(', ')}이에요.`;
  })).join(' ') };
}

function objectiveComparison(assessment: SamdoDualAssessment): EventChatFallback {
  const [first, second] = assessment.districts;
  const unit = (district: SamdoDistrictAssessment, type: SamdoUnitType) => district.district.units.find(item => item.unitType === type)!;
  const range = (district: SamdoDistrictAssessment, type: SamdoUnitType) => {
    const prices = unit(district, type).prices.map(item => item.priceKrw);
    return `${won(Math.min(...prices))}~${won(Math.max(...prices))}`;
  };
  return { text: '가장 큰 차이는 공급 규모, 분양가격·월 토지임대료, 당첨자 발표일이에요. 공급유형별 자격조건은 두 최종1.8 공고에서 같은 기준으로 구조화되어 있어요.', detail: [
    `공급 규모: 1지구 ${first.district.inventory.total}세대(49㎡ ${unit(first, '49A').supplyCount}·59㎡ ${unit(first, '59A').supplyCount}), 2지구 ${second.district.inventory.total}세대(49㎡ ${unit(second, '49A').supplyCount}·59㎡ ${unit(second, '59A').supplyCount})`,
    `59㎡ 분양가격: 1지구 ${range(first, '59A')}, 2지구 ${range(second, '59A')}`,
    `59㎡ 월 토지임대료: 1지구 ${won(unit(first, '59A').monthlyLandRentKrw)}, 2지구 ${won(unit(second, '59A').monthlyLandRentKrw)}`,
    `당첨자 발표: 1지구 ${officialDate(first.district.schedule.winnerAnnouncement)}, 2지구 ${officialDate(second.district.schedule.winnerAnnouncement)}`,
    '공급 세대수 차이는 경쟁률이나 당첨확률을 뜻하지 않아요.',
  ] };
}

const factDetail = (facts: readonly SamdoUnresolvedAssessmentFact[]) => facts.slice(0, 6).map((fact, index) => `${index + 1}. ${fact.label} · ${fact.reason} · 영향: ${fact.affectedSupplyLabels.join('·')}`);

function unresolvedAnswer(facts: readonly SamdoUnresolvedAssessmentFact[], unknownOnly: boolean, firstOnly = false): EventChatFallback {
  const selected = unknownOnly ? facts.filter(item => item.state === 'DOES_NOT_KNOW' || item.state === 'UNKNOWN') : [...facts];
  if (!selected.length) return { text: unknownOnly ? '현재 모름 또는 미입력으로 남은 항목은 없어요.' : '현재 확정 판정을 막는 추가 입력 항목은 없어요. 서류 원본은 접수 전에 다시 확인해 주세요.' };
  if (firstOnly) {
    const fact = selected[0];
    return { text: `가장 먼저 ${fact.label}을(를) 확인해 주세요.`, detail: [`이유: ${fact.reason}`, `영향: ${fact.affectedSupplyLabels.join('·')}`, `확인 방법: ${fact.evidenceNeeded}`] };
  }
  return { text: `현재 확정 판정을 위해 ${selected.length}가지를 더 확인하면 돼요.`, detail: factDetail(selected) };
}

function eligibilityAnswer(assessment: SamdoDualAssessment, unresolvedFacts: readonly SamdoUnresolvedAssessmentFact[]): EventChatFallback {
  const detail = assessment.districts.map(item => {
    const recommendation = item.recommendation.recommendedType;
    return `${districtLabel(item.district.id)}: ${recommendation ? `${recommendation.supplyLabel} · ${recommendation.eligibility} · ${recommendation.stageLabel}` : '확정 추천유형 없음'}`;
  });
  return { text: unresolvedFacts.length
    ? `동일한 입력으로 두 지구를 각각 판정했지만, 아직 ${unresolvedFacts.length}개 확인 항목이 남아 확정 추천이 제한될 수 있어요.`
    : '동일한 입력으로 두 지구를 각각 판정한 결과예요.', detail };
}

function personalComparison(assessment: SamdoDualAssessment): EventChatFallback {
  if (!assessment.comparison.preferredDistrictId || assessment.comparison.basis === 'SUPPLY_COUNT') return {
    text: '현재 입력 기준으로는 자격·공급단계·공식 점수만으로 어느 지구가 더 맞는다고 확정하기 어려워요.',
    detail: assessment.comparison.basis === 'SUPPLY_COUNT'
      ? ['두 지구의 판정 조건은 같고 공급 세대수만 달라요.', '공급량만으로 당첨확률이나 개인 적합도를 추정하지 않아요.']
      : [...assessment.comparison.reasons, assessment.comparison.disclaimer],
  };
  return { text: `현재 입력 기준으로는 ${districtLabel(assessment.comparison.preferredDistrictId)}의 판정 순서가 먼저예요. 이것은 당첨확률 판단이 아니에요.`, detail: [...assessment.comparison.reasons, assessment.comparison.disclaimer] };
}

function freeformFallback(assessment: SamdoDualAssessment, question: string, intent: SamdoRagIntent): EventChatFallback {
  const retrieval = retrieveSamdoEvidence(question);
  if (intent === 'LAND_LEASE') return { text: '토지임대부 분양주택은 토지는 공공이 소유하고 건물은 수분양자가 소유하는 방식으로, 공고에 정한 월 토지임대료를 납부해요.', detail: retrieval.chunks.slice(0, 2).map(chunk => `${districtLabel(chunk.districtId)} 공고문 ${chunk.section}`) };
  if (intent === 'OVERSEAS') return { text: '해외체류가 있으면 공고문 기준에 따라 제주 거주기간 산정과 지역 우선공급 인정 여부를 확인해야 해요.', detail: retrieval.chunks.slice(0, 2).map(chunk => `${districtLabel(chunk.districtId)} 공고문 ${chunk.section}`) };
  if (intent === 'DOCUMENTS') return { text: '신청유형에 따라 주민등록표등본·초본, 청약통장 순위확인서, 소득·자산 확인 서류와 가족관계·혼인·출생 관련 증빙을 준비해야 해요.', detail: assessment.districts[0].checklist.slice(0, 5).map(item => item.label) };
  return retrieval.chunks.length
    ? { text: '공고문 근거와 현재 판정 결과를 함께 확인해 답할게요.', detail: retrieval.chunks.slice(0, 3).map(chunk => `${districtLabel(chunk.districtId)} 공고문 ${chunk.section}`) }
    : { text: '질문의 의미를 두 가지로 볼 수 있어요. 신청 준비사항을 말씀하시는 건가요, 아니면 1순위 자격조건을 말씀하시는 건가요?' };
}

export type SamdoDualConversationResolution = { resolution: EventChatResolution; answer: EventChatFallback };

export function resolveSamdoDualConversation(assessment: SamdoDualAssessment, question: string, history: readonly EventChatHistoryTurn[] = [], unresolvedFacts: readonly SamdoUnresolvedAssessmentFact[] = []): SamdoDualConversationResolution {
  const retrieval = retrieveSamdoEvidence(question);
  const value = question.replace(/\s+/g, '');
  const priorUser = [...history].reverse().find(item => item.role === 'user')?.text ?? '';
  const priorAssistant = [...history].reverse().find(item => item.role === 'assistant')?.text ?? '';

  if (/관리번호/.test(value)) {
    const selected = /1지구/.test(value) ? [assessment.districts[0]] : /2지구/.test(value) ? [assessment.districts[1]] : [...assessment.districts];
    return { resolution: 'EXACT_STRUCTURED', answer: { text: selected.map(item => `${districtLabel(item.district.id)} 관리번호는 ${item.district.managementNumber}예요.`).join(' ') } };
  }
  if (retrieval.intent === 'SCHEDULE') return { resolution: 'EXACT_STRUCTURED', answer: scheduleAnswer(assessment, question) };
  if (retrieval.intent === 'SUPPLY_COUNT') return { resolution: 'EXACT_STRUCTURED', answer: supplyCountAnswer(assessment, question) };
  if (retrieval.intent === 'PRICE') return { resolution: 'EXACT_STRUCTURED', answer: economicsAnswer(assessment, question, 'PRICE') };
  if (retrieval.intent === 'LAND_RENT') return { resolution: 'EXACT_STRUCTURED', answer: economicsAnswer(assessment, question, 'LAND_RENT') };

  if (/모르는것만|모름.*(항목|것)|내가모르는/.test(value)) return { resolution: 'ASSESSMENT_AWARE', answer: unresolvedAnswer(unresolvedFacts, true) };
  if (/그중.*(제일|먼저|중요)|제일먼저확인/.test(value)) return { resolution: 'ASSESSMENT_AWARE', answer: unresolvedAnswer(unresolvedFacts, false, true) };
  if (/(어떤정보|뭘더|무엇을더).*(입력|확인)|확정.*(추천|판정)|왜.*확정.*(안|못)|부족한조건/.test(value)
      || (/^(그럼|그러면)/.test(value) && /(신청가능|확정추천|판정)/.test(priorUser.replace(/\s+/g, '')))) return { resolution: 'ASSESSMENT_AWARE', answer: unresolvedAnswer(unresolvedFacts, false) };
  if (/(지금)?1순위로대비|제일먼저.*준비|우선.*(확인|준비)|지금.*대비해야/.test(value)) return { resolution: 'ASSESSMENT_AWARE', answer: unresolvedAnswer(unresolvedFacts, false, true) };
  if (/청약통장|입주자저축|납입횟수|저축총액/.test(value)) {
    const facts = unresolvedFacts.filter(item => /청약|통장|납입|저축/.test(`${item.label}${item.reason}`));
    return { resolution: 'ASSESSMENT_AWARE', answer: facts.length
      ? { text: '청약통장은 가입기간, 인정 납입횟수, 인정 저축총액을 먼저 확인해 주세요.', detail: factDetail(facts) }
      : { text: '청약통장은 공고일 기준 가입 6개월 경과, 월 납입 6회 이상 여부를 확인해 주세요. 생애최초는 인정 저축총액 기준도 함께 확인해요.' } };
  }
  if (/(둘다.*신청|신청.*가능|자격.*어때)/.test(value)) return { resolution: 'ASSESSMENT_AWARE', answer: eligibilityAnswer(assessment, unresolvedFacts) };
  if (/(1지구.*2지구|두지구).*(차이|비교)|차이점/.test(value)) return { resolution: 'ASSESSMENT_AWARE', answer: objectiveComparison(assessment) };
  if (/(나한테|내게|나는).*(어디|지구).*(맞|나아)|둘중/.test(value) || (/^(그러면|그럼)/.test(value) && /(차이|비교)/.test(priorUser))) return { resolution: 'ASSESSMENT_AWARE', answer: personalComparison(assessment) };
  if (/^왜\??$|왜그래|왜그렇게/.test(value) && priorAssistant) return { resolution: 'ASSESSMENT_AWARE', answer: personalComparison(assessment) };
  if (/그조건만.*(충족|되면)|그것만.*(확인|알면)/.test(value)) return { resolution: 'ASSESSMENT_AWARE', answer: unresolvedFacts.length <= 1
    ? { text: '현재 판정에 남은 확인 항목은 그것 하나예요. 다만 실제 접수 때는 공고상 증빙서류 검증이 별도로 필요해요.' }
    : { text: '그 조건을 확인해도 다른 확인 항목이 남아 있어 확정 판정으로 자동 승격되지는 않아요.', detail: factDetail(unresolvedFacts.slice(1)) } };

  const answer = freeformFallback(assessment, question, retrieval.intent);
  return { resolution: retrieval.chunks.length ? 'FREEFORM_RAG' : 'CLARIFICATION', answer };
}

export function answerSamdoDualDeterministically(assessment: SamdoDualAssessment, question: string, history: readonly EventChatHistoryTurn[] = [], unresolvedFacts: readonly SamdoUnresolvedAssessmentFact[] = []): EventChatFallback {
  return resolveSamdoDualConversation(assessment, question, history, unresolvedFacts).answer;
}
