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
  if (/(근거|공고.*어디|왜.*점|왜.*결과|왜.*판정)/.test(message)) return 'WHY_RESULT';
  if (/(예외|특례|결혼 전|혼인 전|해외.?체류|국외.?체류|출산.?완화|배우자.*집)/.test(message)) return 'CHECK_EXCEPTION';
  if (/(몇 ?점|가점|점수)/.test(message)) return 'CHECK_SCORE';
  if (/(어느 단계|공급.?단계|우선공급|일반공급|추첨공급)/.test(message)) return 'CHECK_STAGE';
  if (/(조건|기준|필요해|부모님.*집)/.test(message)) return 'CHECK_REQUIREMENT';
  if (/(넣을 수|신청.*가능|자격|청약.*가능)/.test(message)) return 'CHECK_ELIGIBILITY';
  return hasUpdates ? 'UPDATE_USER_INFO' : 'UNKNOWN';
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
    pushNumber(updates, message, /(\d{1,2})\s*살/, 'declaredAgeYears');
    const birth = message.match(/(?:(?:생년월일|생일)(?:은|이|:)?\s*)?((?:19|20)\d{2})[.\-/년]\s*(\d{1,2})[.\-/월]\s*(\d{1,2})(?:일)?\s*(?:생|출생|태어남)/);
    if (birth) updates.push({ field: 'birthDate', value: `${birth[1]}-${birth[2].padStart(2, '0')}-${birth[3].padStart(2, '0')}` });
    const residence = message.match(/제주(?:특별자치도)?(?:에서|에)?\s*(?:산|거주한|거주)\s*(?:지)?\s*(\d+)\s*(년|개월)/);
    if (residence) updates.push({ field: 'currentResidence', value: '제주특별자치도' }, { field: 'residenceDurationMonths', value: Number(residence[1]) * (residence[2] === '년' ? 12 : 1) });
    const account = message.match(/(?:통장|청약저축)(?:은|이| 가입)?\s*(\d+)\s*(년|개월)/);
    if (account) updates.push({ field: 'hasSubscriptionAccount', value: true }, { field: 'subscriptionDurationMonths', value: Number(account[1]) * (account[2] === '년' ? 12 : 1) });
    pushNumber(updates, message, /(\d+)\s*(?:번|회)(?:\s*(?:넣|납입))?/, 'recognizedPaymentCount');
    pushNumber(updates, message, /(?:본인\s*)?월(?:평균)?소득\s*(?:은|이)?\s*([\d,]+)\s*원/, 'monthlyIncome');
    pushNumber(updates, message, /(?:세대|가구)\s*(?:월평균)?소득\s*(?:은|이)?\s*([\d,]+)\s*원/, 'householdIncome');
    pushNumber(updates, message, /(?:총|세대)자산\s*(?:은|이)?\s*([\d,]+)\s*원/, 'totalAssets');
    pushNumber(updates, message, /부모(?:님)?\s*자산\s*(?:은|이)?\s*([\d,]+)\s*원/, 'parentAssets');
    pushNumber(updates, message, /(?:저축액|예치금|선납금)\s*(?:은|이)?\s*([\d,]+)\s*원/, 'recognizedDepositAmount');
    pushNumber(updates, message, /소득세(?:를)?\s*(\d+)\s*년/, 'incomeTaxPaymentYears');
    if (/\b미혼\b/.test(message)) updates.push({ field: 'marriageStatus', value: 'single' });
    else if (/(기혼|현재\s*혼인|결혼했)/.test(message) && !/(결혼|혼인)\s*전/.test(message)) updates.push({ field: 'marriageStatus', value: 'married' });
    if (/(주택청약종합저축|청약저축)/.test(message)) updates.push({ field: 'hasSubscriptionAccount', value: true }, { field: 'accountKindEligible', value: true });
    if (/(특별공급|특공).{0,8}(?:당첨|선정).{0,8}(?:없|아니)|(?:당첨|선정).{0,8}이력.{0,4}(?:없|아니)/.test(message)) updates.push({ field: 'specialSupplyHistory', value: false });
    if (/재당첨.{0,8}(?:제한|기간).{0,8}(?:없|아니|해당하지)/.test(message)) updates.push({ field: 'reWinningRestriction', value: false });
    const overseasClear = /(해외|국외).?체류.{0,6}(?:없|안 했|하지 않았)/.test(message);
    const exceptionsClear = /특례.{0,6}(?:없|해당하지|적용하지)/.test(message);
    if (overseasClear) updates.push({ field: 'overseasClear', value: true });
    if (exceptionsClear) updates.push({ field: 'specialExceptionsClear', value: true });
    if (/(?:자녀.{0,4}없).*(?:태아|입양).{0,6}없|(?:태아|입양).{0,6}없.*자녀.{0,4}없/.test(message)) updates.push({ field: 'childbirthClear', value: true });
    if (/(해외.?체류|국외.?체류|생업 목적|출산.?특례|출산.?완화|배우자.*(?:결혼|혼인) 전.*(?:집|주택)|중복청약.*배우자)/.test(message)
      && !overseasClear && !exceptionsClear) {
      updates.push({ field: 'specialException', value: message.slice(0, 200) });
    }
    const intent = classifyIntent(message, updates.length > 0);
    return { intent, supplyType: parseSupply(message), updates, evidenceRequested: /(근거|공고.*어디|보여줘)/.test(message) };
  }
}
