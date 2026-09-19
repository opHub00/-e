import type {
  ConsultationFieldUpdate,
  ConsultationIntent,
  ConsultationInterpretation,
  ConsultationLanguageProvider,
} from './types.ts';
import type { SupplyType } from '../types.ts';

const INTENTS = new Set<ConsultationIntent>([
  'CHECK_ELIGIBILITY', 'CHECK_SCORE', 'CHECK_STAGE', 'WHY_RESULT',
  'CHECK_REQUIREMENT', 'CHECK_EXCEPTION', 'CHECK_DOCUMENTS',
  'UPDATE_USER_INFO', 'UNKNOWN',
]);
const SUPPLIES = new Set<SupplyType>(['youth', 'newlywed', 'firstHome']);
const UPDATE_FIELDS = new Set<ConsultationFieldUpdate['field']>([
  'declaredAgeYears', 'birthDate', 'currentResidence', 'residenceDurationMonths',
  'subscriptionDurationMonths', 'recognizedPaymentCount', 'recognizedDepositAmount',
  'monthlyIncome', 'householdIncome', 'totalAssets', 'parentAssets',
  'incomeTaxPaymentYears', 'marriageStatus', 'currentHousingOwnership',
  'previousHousingOwnership', 'householdHasHome', 'hasSubscriptionAccount',
  'accountKindEligible', 'specialSupplyHistory', 'reWinningRestriction',
  'overseasClear', 'specialExceptionsClear', 'childbirthClear', 'dualIncome', 'specialException',
]);

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every(key => allowed.includes(key));
}

function validUpdate(value: unknown): value is ConsultationFieldUpdate {
  if (!record(value) || !exactKeys(value, ['field', 'value']) || !UPDATE_FIELDS.has(value.field as ConsultationFieldUpdate['field'])) return false;
  if (typeof value.value === 'number') return Number.isFinite(value.value) && value.value >= 0;
  if (typeof value.value === 'boolean') return true;
  if (typeof value.value !== 'string' || value.value.length > 200) return false;
  if (value.field === 'marriageStatus') return value.value === 'single' || value.value === 'married';
  if (value.field === 'currentHousingOwnership') return value.value === 'no-home' || value.value === 'owns-home';
  return true;
}

/** Rejects provider attempts to smuggle scores, eligibility or narrative answers. */
export function decodeConsultationInterpretation(value: unknown): ConsultationInterpretation {
  if (!record(value) || !exactKeys(value, ['intent', 'supplyType', 'updates', 'evidenceRequested'])) throw new Error('CONSULTATION_PROVIDER_OUTPUT_INVALID');
  if (!INTENTS.has(value.intent as ConsultationIntent) || !Array.isArray(value.updates) || !value.updates.every(validUpdate) || typeof value.evidenceRequested !== 'boolean') {
    throw new Error('CONSULTATION_PROVIDER_OUTPUT_INVALID');
  }
  if (value.supplyType !== undefined && !SUPPLIES.has(value.supplyType as SupplyType)) throw new Error('CONSULTATION_PROVIDER_OUTPUT_INVALID');
  return {
    intent: value.intent as ConsultationIntent,
    supplyType: value.supplyType as SupplyType | undefined,
    updates: value.updates,
    evidenceRequested: value.evidenceRequested,
  };
}

function classifyIntent(message: string, hasUpdates: boolean): ConsultationIntent {
  if (/(서류|증빙|준비물)/.test(message)) return 'CHECK_DOCUMENTS';
  if (/(근거|공고.*어디|왜.*점|왜.*결과|왜.*판정|왜\s*(?:안\s*돼|안\s*되|신청\s*못|탈락|어려|안되는))/i.test(message)) return 'WHY_RESULT';
  if (/(예외|특례|결혼 전|혼인 전|해외.?체류|국외.?체류|출산.?완화|배우자.*집)/.test(message)) return 'CHECK_EXCEPTION';
  if (/(몇 ?점|가점|점수)/.test(message)) return 'CHECK_SCORE';
  if (/(어느 단계|공급.?단계|우선공급|일반공급|추첨공급)/.test(message)) return 'CHECK_STAGE';
  if (/(조건|기준|필요해|부모님.*집)/.test(message)) return 'CHECK_REQUIREMENT';
  if (classifyConsultationUtterance(message) !== 'ASSERTION' && /(살|개월|회|원|년|이상|이하|초과|미만)/.test(message)) return 'CHECK_REQUIREMENT';
  if (/(넣을 수|신청.*가능|자격|청약.*가능)/.test(message)) return 'CHECK_ELIGIBILITY';
  return hasUpdates ? 'UPDATE_USER_INFO' : 'UNKNOWN';
}

export type ConsultationUtteranceKind = 'ASSERTION' | 'QUESTION' | 'CONDITIONAL_QUESTION' | 'UNKNOWN';

const QUESTION_ENDING = /(?:\?|나요|인가요|되나요|되나|일까요|까요|가능한가|가능해|가능할|어때|몇\s*점|얼마|기준(?:이|은|인가)?)/;
const CONDITIONAL_QUESTION = /(?:이라면|라면|이면|으면|다면|되면|여야|해야).*(?:\?|나요|인가요|되나요|되나|몇\s*점|얼마|가능|기준)/;

/** Conservative, local guard used before any literal becomes an applicant fact. */
export function classifyConsultationUtterance(text: string): ConsultationUtteranceKind {
  const value = text.trim();
  if (!value) return 'UNKNOWN';
  if (CONDITIONAL_QUESTION.test(value)) return 'CONDITIONAL_QUESTION';
  if (QUESTION_ENDING.test(value)) return 'QUESTION';
  return 'ASSERTION';
}

export function isUnknownConsultationAnswer(message: string): boolean {
  return /^(?:잘\s*)?모르겠(?:어|어요|습니다)?[.!?\s]*$|^(?:확인(?:을)?\s*)?못\s*했(?:어|어요|습니다)?[.!?\s]*$/i.test(message.trim());
}

function assertionClauses(message: string): string[] {
  // Connective endings are useful clause boundaries in mixed messages such as
  // "나는 31살인데 39살까지 가능한가요?". Each numeric span is guarded locally.
  return message
    .replace(/(?:인데|은데|는데|지만|이고|이며|하고|됐고|했고)\s*/g, '\n')
    .replace(/((?:이에요|예요|입니다|했어요|됐어요|없어요|있어요))\.\s*/g, '$1\n')
    // Commas and dots may be thousands separators or date separators.
    .replace(/([?!])/g, '$1\n')
    .split(/\n+/)
    .map(part => part.trim())
    .filter(part => classifyConsultationUtterance(part) === 'ASSERTION');
}

function parseSupply(message: string): SupplyType | undefined {
  if (/청년/.test(message)) return 'youth';
  if (/(신혼|예비신혼|한부모)/.test(message)) return 'newlywed';
  if (/생애.?최초/.test(message)) return 'firstHome';
  return undefined;
}

function pushNumber(updates: ConsultationFieldUpdate[], message: string, pattern: RegExp, field: ConsultationFieldUpdate['field'], multiplier = 1) {
  const match = message.match(pattern);
  if (!match) return;
  const value = Number(match[1].replaceAll(',', '')) * multiplier;
  if (Number.isFinite(value) && value >= 0) updates.push({ field, value } as ConsultationFieldUpdate);
}

/**
 * Small offline interpreter for tests and no-provider environments. It extracts
 * only explicit literals and never returns a result, stage or score.
 */
export class DeterministicConsultationInterpreter implements ConsultationLanguageProvider {
  async interpret({ message }: { message: string }): Promise<ConsultationInterpretation> {
    const updates: ConsultationFieldUpdate[] = [];
    const assertions = assertionClauses(message);
    const asserted = assertions.join(' ');
    pushNumber(updates, asserted, /(\d{1,2})\s*살(?:이에요|예요|입니다|이야|입니까|이)?(?=\s|$)/, 'declaredAgeYears');
    const birth = asserted.match(/(?:(?:생년월일|생일)(?:은|이|:)?\s*)?((?:19|20)\d{2})[.\-/년]\s*(\d{1,2})[.\-/월]\s*(\d{1,2})(?:일)?(?:에)?\s*(?:생|출생|태어(?:남|났))/);
    if (birth) updates.push({ field: 'birthDate', value: `${birth[1]}-${birth[2].padStart(2, '0')}-${birth[3].padStart(2, '0')}` });
    const residence = asserted.match(/제주(?:특별자치도)?(?:에서|에)?\s*(?:산|거주한|거주)\s*(?:지)?\s*(\d+)\s*(년|개월)/);
    if (residence) updates.push({ field: 'currentResidence', value: '제주특별자치도' }, { field: 'residenceDurationMonths', value: Number(residence[1]) * (residence[2] === '년' ? 12 : 1) });
    const account = asserted.match(/(?:통장|청약저축)(?:은|이| 가입)?\s*(\d+)\s*(년|개월)/);
    if (account) updates.push({ field: 'hasSubscriptionAccount', value: true }, { field: 'subscriptionDurationMonths', value: Number(account[1]) * (account[2] === '년' ? 12 : 1) });
    pushNumber(updates, asserted, /(\d+)\s*(?:번|회)(?:\s*(?:넣|납입))?/, 'recognizedPaymentCount');
    pushNumber(updates, asserted, /(?:본인\s*)?월(?:평균)?소득\s*(?:은|이)?\s*([\d,]+)\s*원/, 'monthlyIncome');
    pushNumber(updates, asserted, /(?:세대|가구)\s*(?:월평균)?소득\s*(?:은|이)?\s*([\d,]+)\s*원/, 'householdIncome');
    pushNumber(updates, asserted, /(?:총|세대)자산\s*(?:은|이)?\s*([\d,]+)\s*원/, 'totalAssets');
    pushNumber(updates, asserted, /부모(?:님)?\s*자산\s*(?:은|이)?\s*([\d,]+)\s*원/, 'parentAssets');
    pushNumber(updates, asserted, /(?:저축액|예치금|선납금)\s*(?:은|이)?\s*([\d,]+)\s*원/, 'recognizedDepositAmount');
    pushNumber(updates, asserted, /소득세(?:를)?\s*(\d+)\s*년/, 'incomeTaxPaymentYears');
    if (/\b미혼\b/.test(asserted)) updates.push({ field: 'marriageStatus', value: 'single' });
    else if (/(기혼|현재\s*혼인|결혼했)/.test(asserted) && !/(결혼|혼인)\s*전/.test(asserted)) updates.push({ field: 'marriageStatus', value: 'married' });
    if (/(주택청약종합저축|청약저축)/.test(asserted)) updates.push({ field: 'hasSubscriptionAccount', value: true }, { field: 'accountKindEligible', value: true });
    if (/(특별공급|특공).{0,8}(?:당첨|선정).{0,8}(?:없|아니)|(?:당첨|선정).{0,8}이력.{0,4}(?:없|아니)/.test(asserted)) updates.push({ field: 'specialSupplyHistory', value: false });
    if (/재당첨.{0,8}(?:제한|기간).{0,8}(?:없|아니|해당하지)/.test(asserted)) updates.push({ field: 'reWinningRestriction', value: false });
    if (/맞벌이/.test(asserted)) updates.push({ field: 'dualIncome', value: true });
    else if (/외벌이/.test(asserted)) updates.push({ field: 'dualIncome', value: false });
    const overseasClear = /(?:해외|국외)(?:에|에서)?.{0,4}(?:체류)?\s*(?:없|안\s*했|하지\s*않았)/.test(asserted);
    const exceptionsClear = /특례.{0,6}(?:없|해당하지|적용하지)/.test(asserted);
    if (overseasClear) updates.push({ field: 'overseasClear', value: true });
    if (exceptionsClear) updates.push({ field: 'specialExceptionsClear', value: true });
    if (/(?:자녀|아이|애).{0,5}(?:없|없습니다)|(?:임신\s*아님|태아.{0,4}없)/.test(asserted)) updates.push({ field: 'childbirthClear', value: true });
    else if (/(?:자녀|아이|애|태아).{0,5}(?:있|있습니다|임신)/.test(asserted)) updates.push({ field: 'specialException', value: '자녀·태아·입양 자녀 상세정보 추가 확인' });
    const overseasPositive = asserted.match(/(?:해외|국외)(?:에|에서)?.{0,8}(\d+)\s*(년|개월|일).{0,8}(?:있었|체류|머물)/);
    if (overseasPositive && !overseasClear) {
      updates.push({ field: 'specialException', value: `해외체류 ${overseasPositive[1]}${overseasPositive[2]} (정확한 체류일 확인 필요)` });
    }
    if (/(해외.?체류|국외.?체류|생업 목적|출산.?특례|출산.?완화|배우자.*(?:결혼|혼인) 전.*(?:집|주택)|중복청약.*배우자)/.test(asserted)
      && !overseasClear && !exceptionsClear) {
      updates.push({ field: 'specialException', value: asserted.slice(0, 200) });
    }
    const intent = classifyIntent(message, updates.length > 0);
    return { intent, supplyType: parseSupply(message), updates, evidenceRequested: /(근거|공고.*어디|보여줘)/.test(message) };
  }
}
