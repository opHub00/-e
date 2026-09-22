import type {
  ConsultationFieldUpdate,
  ConsultationIntent,
  ConsultationInterpretation,
  ConsultationLanguageProvider,
} from './types.ts';
import type { SupplyType } from '../types.ts';
import { REGION_DEFINITIONS } from '../../discovery/regions.ts';

const INTENTS = new Set<ConsultationIntent>([
  'CHECK_ELIGIBILITY', 'CHECK_SCORE', 'CHECK_STAGE', 'WHY_RESULT',
  'CHECK_REQUIREMENT', 'CHECK_EXCEPTION', 'CHECK_DOCUMENTS',
  'UPDATE_USER_INFO', 'SHOW_PROFILE', 'UNKNOWN',
]);
const SUPPLIES = new Set<SupplyType>(['youth', 'newlywed', 'firstHome']);
const UPDATE_FIELDS = new Set<ConsultationFieldUpdate['field']>([
  'declaredAgeYears', 'birthDate', 'currentResidence', 'residenceDurationMonths',
  'subscriptionDurationMonths', 'recognizedPaymentCount', 'recognizedDepositAmount',
  'monthlyIncome', 'householdIncome', 'totalAssets', 'parentAssets',
  'incomeTaxPaymentYears', 'workOrBusinessIncomeEligible', 'marriageStatus', 'currentHousingOwnership',
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

/** "내가 지금 저장한 정보 보여줘"처럼 상담에 쓰는 내 정보를 보여달라는 요청. */
const SHOW_PROFILE = /(?:저장(?:한|된|해\s*둔)|입력(?:한|된)|사용\s*중인|쓰고\s*있는|(?:내가|제가)\s*말한|알려\s*준|등록(?:한|된))\s*(?:내\s*|제\s*)?(?:정보|프로필|내용)(?!\s*(?:로|으로))\s*.{0,8}(?:보여|확인|알려|뭐|어떻게|정리|목록|요약)|(?:내|제|나의|저의)\s*(?:정보|프로필)(?!\s*(?:로|으로))\s*(?:좀\s*)?(?:보여|확인|알려|뭐|어떻게|정리)/;

function classifyIntent(message: string, hasUpdates: boolean): ConsultationIntent {
  if (SHOW_PROFILE.test(message)) return 'SHOW_PROFILE';
  if (/(서류|증빙|준비물)/.test(message)) return 'CHECK_DOCUMENTS';
  if (/(근거|공고.*어디|왜.*점|왜.*결과|왜.*판정|왜\s*(?:안\s*돼|안\s*되|신청\s*못|탈락|어려|안되는))/i.test(message)) return 'WHY_RESULT';
  if (/(예외|특례|결혼 전|혼인 전|해외.?체류|국외.?체류|출산.?완화|배우자.*집)/.test(message)) return 'CHECK_EXCEPTION';
  if (/(몇 ?점|가점|점수)/.test(message)) return 'CHECK_SCORE';
  if (/(어느 단계|공급.?단계|우선공급|일반공급|추첨공급)/.test(message)) return 'CHECK_STAGE';
  if (/(조건|기준|필요해|부모님.*집)/.test(message)) return 'CHECK_REQUIREMENT';
  const kind = classifyConsultationUtterance(message);
  if ((kind === 'QUESTION' || kind === 'CONDITIONAL_QUESTION') && /(살|개월|회|원|년|이상|이하|초과|미만)/.test(message)) return 'CHECK_REQUIREMENT';
  if (/(넣을 수|신청.*가능|자격|청약.*가능)/.test(message)) return 'CHECK_ELIGIBILITY';
  return hasUpdates ? 'UPDATE_USER_INFO' : 'UNKNOWN';
}

export type ConsultationUtteranceKind = 'ASSERTION' | 'QUESTION' | 'CONDITIONAL_QUESTION' | 'UNKNOWN';

const QUESTION_ENDING = /(?:\?|나요|인가요|되나요|되나|일까요|까요|할까|될까|되니|하니|가능한가|가능해|가능할|어때|몇\s*(?:점|년|개월|회|살)?|얼마|뭐|무엇|어떻게|어떤|왜|언제|어디|알려\s*줘|알려\s*주세요|보여\s*줘|보여\s*주세요|궁금|는지|은지|인지|기준(?:이|은)?\s*(?:뭐|어떻|몇|얼마)|기준(?:이야|이에요|인가)?\s*$)/;
const CONDITION = /(?:만약|만일|가정(?:하|해|이)|(?:이라|라|다|으|하|되|있으|없으|했으|넘으|넣으|이|살|가|사|보|치)면(?!서|적|제))/;
const CONDITIONAL_QUESTION = new RegExp(`(?:${CONDITION.source}|여야|해야).*(?:\\?|나요|인가요|되나요|되나|몇\\s*점|얼마|가능|기준|유리|불리|돼요|되요|안\\s*돼|어때|어떻게)`);
/** 추측·기억이 불확실한 말은 사실로 저장하지 않는다. */
const HEDGE = /(?:아마|대충|대략|얼추|글쎄|거의|확실(?:하지|치|히는)\s*(?:않|모르|아니)|기억(?:이)?\s*(?:안|잘|가물)|헷갈|모르겠|것\s*같|거\s*같|듯(?:해|합|요|싶|하)|(?<!\d)(?:을|일|할|될)\s*(?:거(?!주|래|절)|걸|껄)|쯤|정도|남짓|(?:^|\s)약\s*\d|(?:였|이었|했|됐)나|인가\s*봐|수도\s*있)/;
/** 앞으로의 계획이나 예정은 지금의 사실이 아니다. */
const FUTURE = /(?:예정|계획|하려(?:고|구|면)?|할게|할래|생각\s*(?:중|이에요|입니다|이야|이다)|(?:^|\s)곧|나중에|내년|다음\s*(?:달|해)|앞으로|거예요|거에요|거야|겁니다)/;
/** 다른 사람 이야기나 비교는 신청자 사실이 아니다. 배우자 유무는 혼인 사실로 따로 받는다. */
const THIRD_PARTY = /(?:보다|처럼|만큼|비교|친구|동생|(?<![가-힣])형(?:은|이|도|네|한테)|누나|언니|오빠|엄마|아빠|어머니|아버지|부모(?!님?\s*(?:의\s*)?(?:총\s*)?(?:자산|재산))|배우자|남편|아내|와이프|남자\s*친구|여자\s*친구|애인|지인|남들|다른\s*사람|사촌|옆집)/;
const SPOUSE_PRESENCE = /^(?:저는\s*|전\s*|저\s*)?(?:현재\s*|지금\s*)?(?:(?:배우자|남편|아내|와이프)(?:는|가|도)?\s*(?:없|있)|(?:배우자|남편|아내|와이프)(?:와|랑|이랑|하고)\s*(?:혼인|결혼)\s*(?:중|했|한\s*지))/;
const DOUBLE_NEGATIVE = /(?:없지\s*(?:는|도)?\s*않|없진\s*않|없는\s*(?:건|것은?|게)\s*아니|아니(?:지|진)\s*않|않은\s*(?:건|것은?|게)\s*아니|안\s*한\s*(?:건|것은?|게)\s*아니|없다고\s*(?:는|하긴)?\s*(?:못|어렵))/;

type ClauseGuard = 'NONE' | 'HEDGE' | 'FUTURE' | 'CONDITION' | 'THIRD_PARTY' | 'DOUBLE_NEGATIVE';

function clauseGuard(value: string): ClauseGuard {
  if (DOUBLE_NEGATIVE.test(value)) return 'DOUBLE_NEGATIVE';
  if (HEDGE.test(value)) return 'HEDGE';
  if (FUTURE.test(value)) return 'FUTURE';
  if (CONDITION.test(value)) return 'CONDITION';
  if (THIRD_PARTY.test(value) && !SPOUSE_PRESENCE.test(value)) return 'THIRD_PARTY';
  return 'NONE';
}

/**
 * Conservative, local guard used before any literal becomes an applicant fact.
 * Hedged, future, hypothetical, comparative and double-negative statements are
 * UNKNOWN: they are neither questions nor facts.
 */
export function classifyConsultationUtterance(text: string): ConsultationUtteranceKind {
  const value = text.trim();
  if (!value) return 'UNKNOWN';
  if (CONDITIONAL_QUESTION.test(value)) return 'CONDITIONAL_QUESTION';
  if (QUESTION_ENDING.test(value)) return 'QUESTION';
  if (isUnknownConsultationAnswer(value) || clauseGuard(value) !== 'NONE') return 'UNKNOWN';
  return 'ASSERTION';
}

export function isUnknownConsultationAnswer(message: string): boolean {
  return /^(?:잘\s*)?모르겠(?:어|어요|습니다)?[.!?\s]*$|^(?:확인(?:을)?\s*)?못\s*했(?:어|어요|습니다)?[.!?\s]*$/i.test(message.trim());
}

// ── 숫자 정규화 ────────────────────────────────────────────────────────────

const NATIVE_ONES: Record<string, number> = {
  한: 1, 하나: 1, 두: 2, 둘: 2, 세: 3, 셋: 3, 석: 3, 네: 4, 넷: 4, 넉: 4,
  다섯: 5, 여섯: 6, 일곱: 7, 여덟: 8, 아홉: 9,
};
const NATIVE_TENS: Record<string, number> = { 열: 10, 스물: 20, 스무: 20, 서른: 30, 마흔: 40, 쉰: 50 };
const SINO: Record<string, number> = { 일: 1, 이: 2, 삼: 3, 사: 4, 오: 5, 육: 6, 칠: 7, 팔: 8, 구: 9 };
const MONEY_UNITS: Record<string, number> = { 억: 1e8, 천만: 1e7, 백만: 1e6, 십만: 1e5, 만: 1e4, 천: 1e3, 백: 1e2 };

function sinoValue(text: string): number | null {
  const match = text.match(/^([일이삼사오육칠팔구])?(십)?([일이삼사오육칠팔구])?$/);
  if (!match || (!match[1] && !match[2] && !match[3])) return null;
  if (match[1] && !match[2] && match[3]) return null;
  const tens = match[2] ? (match[1] ? SINO[match[1]] : 1) * 10 : 0;
  const ones = match[2] ? (match[3] ? SINO[match[3]] : 0) : SINO[match[1] ?? match[3]];
  return tens + ones;
}

function moneyValue(expression: string): number | null {
  const tokens = [...expression.matchAll(/(\d+(?:\.\d+)?)\s*(억|천만|백만|십만|만|천|백)?/g)];
  if (!tokens.length) return null;
  let total = 0;
  let afterEok = false;
  for (const [, digits, unit] of tokens) {
    const amount = Number(digits);
    if (!Number.isFinite(amount)) return null;
    // "2억 5천"은 2억 5천만원이다. 억 뒤의 천·백은 만 단위로 읽는다.
    const scale = unit === undefined ? 1 : (afterEok && (unit === '천' || unit === '백') ? MONEY_UNITS[unit] * 1e4 : MONEY_UNITS[unit]);
    total += amount * scale;
    if (unit === '억') afterEok = true;
  }
  return Number.isSafeInteger(Math.round(total)) ? Math.round(total) : null;
}

/** 같은 뜻의 숫자 표기를 하나로 맞춘다. 판정에 쓰는 값은 여기서 바꾸지 않는다. */
export function normalizeConsultationNumbers(message: string): string {
  let text = message.normalize('NFKC');
  text = text.replace(/(\d),(?=\d{3}(?!\d))/g, '$1');
  // 고유어 수사 + 단위: 열두 번, 두 달, 스물다섯 살. "한 번도"는 부정 관용구라 남긴다.
  text = text.replace(
    /(?<![가-힣])(열|스물|스무|서른|마흔|쉰)?\s?(하나|다섯|여섯|일곱|여덟|아홉|한|두|둘|세|셋|석|네|넷|넉)?\s*(번|회|달|살|명)(?![가-힣]*도(?![가-힣]))/g,
    (whole, tens: string | undefined, ones: string | undefined, unit: string) => {
      if (!tens && !ones) return whole;
      const value = (tens ? NATIVE_TENS[tens] : 0) + (ones ? NATIVE_ONES[ones] : 0);
      return `${value}${unit === '달' ? '개월' : unit}`;
    },
  );
  // 한자어 수사 + 단위: 육 개월, 삼십육 회, 삼 년.
  text = text.replace(/(?<![가-힣\d])([일이삼사오육칠팔구십]{1,3})\s*(개월|년|회(?![사의장원계식복]))/g, (whole, digits: string, unit: string) => {
    const value = sinoValue(digits);
    return value === null ? whole : `${value}${unit}`;
  });
  text = text.replace(/(\d+)\s*달/g, '$1개월');
  text = text.replace(/반\s*년/g, '6개월');
  text = text.replace(/(\d+)\s*년\s*반/g, (_, years: string) => `${Number(years) * 12 + 6}개월`);
  text = text.replace(/(\d+)\s*년\s*(\d+)\s*개월/g, (_, years: string, months: string) => `${Number(years) * 12 + Number(months)}개월`);
  // 금액: 250만원, 2억 5천만 원, 5천만원 → 원 단위 정수.
  text = text.replace(
    /(?<![\d.])(\d+(?:\.\d+)?\s*(?:억|천만|백만|십만|만|천|백)(?:\s*\d+(?:\.\d+)?\s*(?:억|천만|백만|십만|만|천|백))*)(\s*원)?/g,
    (whole, expression: string) => {
      if (!/억|만/.test(expression)) return whole;
      const value = moneyValue(expression);
      return value === null ? whole : `${value}원`;
    },
  );
  return text;
}

// ── 절 나누기와 극성 ────────────────────────────────────────────────────────

function splitClauses(text: string): string[] {
  return text
    .replace(/(?<!\d)\.|\.(?!\d)/g, '.\n')
    .replace(/[!?！？]/g, '$&\n')
    .replace(/\s*[,，;]\s*/g, '\n')
    .replace(/(인데|은데|는데|지만|이며|으며|는데요|그리고|근데|그런데)\s*/g, '$1\n')
    // "없고 ", "살았고 ", "이고 "는 나누되 "살고 있어요", "가지고 있어요", 명사 나열 "하고"는 나누지 않는다.
    .replace(/(?<=[가-힣])(?<!하)고\s+(?!있|계|싶|나서|말|다니|해(?:요|서|야|도)|하(?:다|는|고|며|면|기))/g, '고\n')
    .replace(/(?<=(?:요|니다|없음|있음|아님))\s+(?=[가-힣])/g, '\n')
    .split(/\n+/)
    .map(part => part.trim())
    .filter(Boolean);
}

type Polarity = 'NEG' | 'POS' | 'NONE';

const NEGATIVE = /(?:없|아니|아님|아닙|안\s*(?:했|해|됐|돼|되|됩|받|갔|가|샀|사|넣|낳|가져|가졌|살|다녀|만들)|(?:하|되|받|가|사|가지|걸리|해당하|있|다니|살)지\s*(?:는\s*|도\s*)?않|해당\s*(?:사항\s*)?(?:없|안|아니)|못\s*(?:했|받)|무주택|전무)/g;
const POSITIVE = /(?:있|해당(?:돼|되|됩|해요|합니다|함|사항\s*있)|받았|했|됐|살았|살아|살고|거주(?:해|했|합|하고|하며|중)|보유\s*중|소유\s*중|다녀)/;

function polarityOf(clause: string): Polarity {
  if (clause.match(NEGATIVE)) {
    const rest = clause.replace(NEGATIVE, ' ');
    // "없는데 있어요"처럼 한 절에 둘 다 있으면 극성을 정하지 않는다.
    return POSITIVE.test(rest) && /있/.test(rest) ? 'NONE' : 'NEG';
  }
  return POSITIVE.test(clause) ? 'POS' : 'NONE';
}

// ── 개념별 추출 ────────────────────────────────────────────────────────────

const REGION_ALIASES = REGION_DEFINITIONS
  .flatMap(region => region.aliases.map(alias => ({ alias, profile: region.profile })))
  .sort((a, b) => b.alias.length - a.alias.length);
const REGION_PATTERN = new RegExp(`(?<![가-힣])(${REGION_ALIASES.map(item => item.alias).join('|')})(?=에|에서|은|는|이|도|로|$|\\s|거주|연속|계속|산|살)`, 'g');

function regionsIn(clause: string): string[] {
  const found = [...clause.matchAll(REGION_PATTERN)].map(match => REGION_ALIASES.find(item => item.alias === match[1])!.profile);
  return [...new Set(found)];
}

type Topic = 'age' | 'birth' | 'residence' | 'account' | 'payments' | 'money' | 'tax' | 'work' | 'marriage'
  | 'housing' | 'specialSupply' | 'reWinning' | 'overseas' | 'exceptions' | 'children' | 'dualIncome';
type Extracted = { topic: Topic; update: ConsultationFieldUpdate };

const HOUSE = /(?:주택|(?<!모)집(?!합|중|계)|아파트|자가|빌라|오피스텔|분양권|입주권)/;
const HOUSEHOLD = /(?:세대\s*(?:원|전원|구성원)?|가구원|가족\s*(?:모두|전원|중))/;
const CHILDREN = /(?<![가-힣])(?:자녀|자식|아이(?!디)|애기|아기|애(?![매인정착])|태아|입양|임신|출산)/;
const OVERSEAS = /(?:해외|국외|외국|유학|어학\s*연수|워홀|워킹\s*홀리데이)/;
const ACCOUNT = /(?:청약\s*통장|(?<![가-힣])통장|청약\s*저축|주택청약종합저축|청약\s*예금|청약\s*부금)/;
const PAST_ONLY = /(?:예전|전에|과거|옛날|었었|였었|했었)/;
const THRESHOLD_AFTER = '(?!\\s*(?:까지|이하|이상|미만|초과|부터|넘|안\\s*되|이전|전|때|기준))';

function durationMonths(clause: string): number[] {
  return [...clause.matchAll(new RegExp(`(?<!\\d)(\\d{1,3})\\s*(년|개월)${THRESHOLD_AFTER}`, 'g'))]
    .map(match => Number(match[1]) * (match[2] === '년' ? 12 : 1));
}

function amount(clause: string, label: RegExp): number | undefined {
  const match = clause.match(new RegExp(`${label.source}[^\\d]{0,8}?(\\d+)\\s*원${THRESHOLD_AFTER}`));
  return match ? Number(match[1]) : undefined;
}

/** ASSERTION으로 분류된 절 하나에서만 호출한다. */
function extractClause(clause: string): Extracted[] {
  const out: Extracted[] = [];
  const push = (topic: Topic, update: ConsultationFieldUpdate) => out.push({ topic, update });
  // 배우자 이야기는 혼인 사실로만 읽는다. 배우자의 주택·소득은 신청자 사실이 아니다.
  if (SPOUSE_PRESENCE.test(clause)) {
    if (!PAST_ONLY.test(clause)) push('marriage', { field: 'marriageStatus', value: /없/.test(clause) ? 'single' : 'married' });
    return out;
  }
  const polarity = polarityOf(clause);
  // 주택청약종합저축의 "주택"은 집 이야기가 아니다.
  const housingText = clause.replace(/주택\s*청약\s*종합\s*저축|주택\s*청약/g, '청약통장');

  // 나이·생년월일
  const hasChildren = CHILDREN.test(clause);
  const age = clause.match(new RegExp(`(?:나이(?:는|가)?\\s*)?(?:만\\s*)?(?<!\\d)(\\d{1,2})\\s*(?:살|세(?!대))${THRESHOLD_AFTER}`))
    ?? clause.match(/나이(?:는|가)\s*(?:만\s*)?(\d{1,2})(?!\d|\s*(?:개월|년|회|원))/);
  if (age && !hasChildren) {
    const value = Number(age[1]);
    if (value >= 15 && value <= 99) push('age', { field: 'declaredAgeYears', value });
  }
  const birth = clause.match(/((?:19|20)\d{2})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})\s*(?:일)?\s*(?:에)?\s*(?:생|출생|태어(?:남|났))/)
    ?? clause.match(/(?:생년월일|생일)(?:은|이|:)?\s*((?:19|20)\d{2})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})/);
  if (birth) {
    const [month, day] = [Number(birth[2]), Number(birth[3])];
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      push('birth', { field: 'birthDate', value: `${birth[1]}-${birth[2].padStart(2, '0')}-${birth[3].padStart(2, '0')}` });
    }
  }

  // 거주지역과 거주기간. 공고 지역은 규칙이 판단하므로 여기서는 말한 지역을 그대로 옮긴다.
  const regions = regionsIn(clause);
  const lives = /(?:거주|살(?:았|아|고|며|던|다)|산\s*지|사는|전입)/.test(clause);
  const bareRegion = /^(?:저는\s*|지금\s*|현재\s*)?(?:거주지(?:는|역은)?\s*)?\S+?(?:이요|요|입니다|이에요|예요|이고|이며)?[.\s]*$/.test(clause);
  if (regions.length === 1 && polarity !== 'NEG' && !OVERSEAS.test(clause) && !PAST_ONLY.test(clause) && (lives || bareRegion || /거주지/.test(clause))) {
    push('residence', { field: 'currentResidence', value: regions[0] });
    const months = durationMonths(clause);
    if (months.length === 1 && lives && !ACCOUNT.test(clause)) push('residence', { field: 'residenceDurationMonths', value: months[0] });
  }

  // 청약통장
  const payments = clause.match(new RegExp(`(\\d+)\\s*(?:번|회)(?:차)?${THRESHOLD_AFTER}`));
  const paid = /(?:납입|넣|냈|부었|불입|입금|인정\s*회차|회차)/.test(clause) && !/(?:소득세|당첨|체류|이사)/.test(clause);
  if (ACCOUNT.test(clause)) {
    const months = durationMonths(clause);
    if (polarity === 'NEG' && !months.length && !payments) {
      push('account', { field: 'hasSubscriptionAccount', value: false });
    } else if (polarity !== 'NEG') {
      if (months.length === 1) {
        push('account', { field: 'hasSubscriptionAccount', value: true });
        push('account', { field: 'subscriptionDurationMonths', value: months[0] });
      }
      if (/(?:주택청약종합저축|청약\s*저축)/.test(clause)) {
        push('account', { field: 'hasSubscriptionAccount', value: true });
        push('account', { field: 'accountKindEligible', value: true });
      }
      if (/(?:있|가입했|만들었|개설했)/.test(clause)) push('account', { field: 'hasSubscriptionAccount', value: true });
    }
  }
  if (payments && paid && polarity !== 'NEG') push('payments', { field: 'recognizedPaymentCount', value: Number(payments[1]) });

  // 소득·자산 (금액은 원 단위로 정규화된 뒤다)
  if (!/부모/.test(clause)) {
    const household = /(?:세대|가구)/.test(clause);
    const monthly = amount(clause, household
      ? /(?:세대|가구)\s*(?:월\s*)?(?:평균\s*)?(?:소득|수입)/
      : /(?:월\s*(?:평균\s*)?(?:소득|수입)|월급|한\s*달\s*(?:소득|수입)|소득(?:은|이)?\s*월\s*(?:평균)?)/);
    if (monthly !== undefined) push('money', { field: household ? 'householdIncome' : 'monthlyIncome', value: monthly });
    const assets = amount(clause, /(?:(?:총|세대|본인)\s*(?:총\s*)?(?:자산|재산)|(?<![가-힣])(?:자산|재산))/);
    if (assets !== undefined) push('money', { field: 'totalAssets', value: assets });
  } else {
    const parents = amount(clause, /부모(?:님)?\s*(?:의\s*)?(?:총\s*)?(?:자산|재산)/);
    if (parents !== undefined) push('money', { field: 'parentAssets', value: parents });
  }
  const deposit = amount(clause, /(?:저축액|예치금|예치액|선납금|납입\s*(?:인정\s*)?금액|인정\s*금액)/);
  if (deposit !== undefined) push('money', { field: 'recognizedDepositAmount', value: deposit });

  // 소득세 납부기간과 근로·사업소득
  if (/소득세/.test(clause)) {
    const years = clause.match(new RegExp(`소득세[^\\d]{0,10}?(\\d+)\\s*년${THRESHOLD_AFTER}`)) ?? clause.match(new RegExp(`(\\d+)\\s*년${THRESHOLD_AFTER}\\s*(?:동안|간|째)?\\s*소득세`));
    if (years && polarity !== 'NEG') push('tax', { field: 'incomeTaxPaymentYears', value: Number(years[1]) });
    else if (!years && /(?:낸|납부한|내\s*본)\s*적\s*(?:이|은)?\s*(?:한\s*번도\s*)?없/.test(clause)) push('tax', { field: 'incomeTaxPaymentYears', value: 0 });
  }
  const workTopic = /(?:근로\s*(?:·|,|\/|나|랑|이나)?\s*(?:사업)?\s*소득|사업\s*소득|직장(?:인|에|을)?\s*(?:다니|다녀)?|회사(?:에|를)?\s*(?:다니|다녀)|회사원|자영업|재직)/;
  if (workTopic.test(clause) && !/(?:알바|아르바이트|프리랜서)/.test(clause)) {
    push('work', { field: 'workOrBusinessIncomeEligible', value: polarity !== 'NEG' });
  } else if (/(?:무직|백수|(?<![가-힣])일\s*안\s*(?:해|하))/.test(clause)) {
    push('work', { field: 'workOrBusinessIncomeEligible', value: false });
  }

  // 혼인
  if (!/(?:이혼|사별|돌싱|했었)/.test(clause)) {
    const single = /(?:미혼|싱글|솔로|(?:결혼|혼인)\s*(?:은|을|도)?\s*(?:아직\s*)?(?:안\s*했|안\s*한|하지\s*않았|한\s*적\s*(?:이|은)?\s*없|전이에요|전입니다|전이야)|아직\s*(?:결혼|혼인)\s*(?:안|전))/.test(clause);
    const married = /(?:기혼|유부|(?<!안\s)(?:결혼|혼인)\s*(?:을|은|도)?\s*했|결혼한\s*지|혼인\s*(?:중|상태|신고\s*했)|신혼(?:이에요|입니다|부부(?:예요|입니다)))/.test(clause);
    if (single !== married) push('marriage', { field: 'marriageStatus', value: single ? 'single' : 'married' });
  }

  // 주택 소유 (신청자 본인과 세대)
  if (HOUSE.test(housingText)) {
    const household = HOUSEHOLD.test(housingText);
    const neverOwned = /(?:(?:소유|보유|가져|가진|가졌|(?<![가-힣])샀|(?<![가-힣])사|(?<![가-힣])산|구입|구매|취득)\s*(?:한|했던|해\s*본|해본|본|봤던|던|했었던)?\s*적\s*(?:이|은|도)?\s*(?:한\s*번도\s*)?없|소유\s*이력\s*(?:은|이|도)?\s*없|한\s*번도\s*.{0,10}(?:없|안))/.test(housingText);
    const ownsNow = /(?:(?:소유|보유)\s*(?:중|하고\s*있)|가지고\s*있|한\s*채|(?:집|주택|아파트)(?:이|가|은|는|도)?\s*있(?!었))/.test(housingText) && polarity !== 'NEG';
    const ownedBefore = /(?:있었|팔았|처분|매도|가졌었|소유했었|보유했었|소유\s*이력\s*(?:이|은)?\s*있)/.test(housingText) && polarity !== 'NEG';
    if (household) {
      if (neverOwned || (polarity === 'NEG' && !PAST_ONLY.test(housingText))) {
        push('housing', { field: 'householdHasHome', value: false });
        push('housing', { field: 'currentHousingOwnership', value: 'no-home' });
      } else if (ownsNow) push('housing', { field: 'householdHasHome', value: true });
    } else if (neverOwned) {
      push('housing', { field: 'previousHousingOwnership', value: false });
      push('housing', { field: 'currentHousingOwnership', value: 'no-home' });
    } else if (ownedBefore) {
      push('housing', { field: 'previousHousingOwnership', value: true });
    } else if (ownsNow) {
      push('housing', { field: 'currentHousingOwnership', value: 'owns-home' });
    } else if (polarity === 'NEG' && !PAST_ONLY.test(housingText)) {
      push('housing', { field: 'currentHousingOwnership', value: 'no-home' });
    }
  }

  // 특별공급 당첨 이력과 재당첨 제한. "A와 B 없어요"처럼 나열된 개념은 같은 극성을 받는다.
  const specialSupply = /(?:특별\s*공급|특공).{0,12}(?:당첨|선정|받|이력)|(?<!재)당첨\s*(?:된|됐던|이력|경험|받은|한)/.test(clause);
  if (specialSupply && polarity !== 'NONE') push('specialSupply', { field: 'specialSupplyHistory', value: polarity === 'POS' });
  if (/재당첨/.test(clause) && polarity !== 'NONE') push('reWinning', { field: 'reWinningRestriction', value: polarity === 'POS' });

  // 해외체류. 여행·출장은 체류 요건과 달라 읽지 않는다.
  if (OVERSEAS.test(clause) && !/(?:여행|출장)/.test(clause)) {
    const stay = clause.match(new RegExp(`(\\d+)\\s*(년|개월|일)${THRESHOLD_AFTER}`));
    if (polarity === 'NEG' && !stay) push('overseas', { field: 'overseasClear', value: true });
    else if (stay && polarity !== 'NEG') push('overseas', { field: 'specialException', value: `해외체류 ${stay[1]}${stay[2]} (정확한 체류일 확인 필요)` });
    else if (polarity === 'POS') push('overseas', { field: 'specialException', value: '해외체류 이력 추가 확인' });
  }

  // 자녀·태아·입양
  if (hasChildren) {
    const count = /(?:\d+\s*명|하나(?!도)|둘|셋)/.test(clause);
    if (polarity === 'NEG' && !count) push('children', { field: 'childbirthClear', value: true });
    else if (polarity === 'POS' || count || /임신\s*중/.test(clause)) push('children', { field: 'specialException', value: '자녀·태아·입양 자녀 상세정보 추가 확인' });
  }

  // 특례
  if (/특례/.test(clause)) {
    if (polarity === 'NEG') push('exceptions', { field: 'specialExceptionsClear', value: true });
    else if (polarity === 'POS') push('exceptions', { field: 'specialException', value: clause.slice(0, 200) });
  }
  if (/(?:생업\s*목적|출산.?특례|출산.?완화|중복\s*청약)/.test(clause) && polarity !== 'NEG') {
    push('exceptions', { field: 'specialException', value: clause.slice(0, 200) });
  }

  // 맞벌이
  const dual = /맞벌이/.test(clause), single = /(?:외벌이|홑벌이)/.test(clause);
  if (dual !== single) push('dualIncome', { field: 'dualIncome', value: dual && polarity !== 'NEG' });
  return out;
}

/**
 * 배우자의 혼인 전 주택처럼 다른 사람 이야기라도 특례 검토가 필요한 경우가 있다.
 * 사실로 저장하지 않고 검토 항목으로만 남겨, 판정이 검토 필요 쪽으로 가게 한다.
 */
function reviewFlags(clause: string): Extracted[] {
  if (/(?:배우자|남편|아내|와이프).*(?:결혼|혼인)\s*전.*(?:집|주택)|중복\s*청약.*(?:배우자|남편|아내)/.test(clause)) {
    return [{ topic: 'exceptions', update: { field: 'specialException', value: clause.slice(0, 200) } }];
  }
  return [];
}

/**
 * 같은 개념에 서로 다른 값이 나오면 그 개념 전체를 버린다. 질문이 남는 쪽이 안전하다.
 */
function mergeExtracted(items: Extracted[]): ConsultationFieldUpdate[] {
  const dropped = new Set<Topic>();
  const values = new Map<string, Set<string>>();
  for (const { update } of items) {
    if (update.field === 'specialException') continue;
    const seen = values.get(update.field) ?? new Set<string>();
    seen.add(JSON.stringify(update.value));
    values.set(update.field, seen);
  }
  for (const { topic, update } of items) {
    if ((values.get(update.field)?.size ?? 0) > 1) dropped.add(topic);
  }
  const value = (field: string) => {
    const seen = values.get(field);
    return seen && seen.size === 1 ? JSON.parse([...seen][0]) : undefined;
  };
  // 한 번도 가진 적 없다면서 지금 가지고 있다고 하면 주택 이야기는 모두 읽지 않는다.
  if (value('previousHousingOwnership') === false && value('currentHousingOwnership') === 'owns-home') dropped.add('housing');
  if (value('hasSubscriptionAccount') === false && (values.has('subscriptionDurationMonths') || values.has('recognizedPaymentCount'))) {
    dropped.add('account'); dropped.add('payments');
  }
  const overseasAffirmed = items.some(item => item.topic === 'overseas' && item.update.field === 'specialException');
  const childrenAffirmed = items.some(item => item.topic === 'children' && item.update.field === 'specialException');
  const merged: ConsultationFieldUpdate[] = [];
  const emitted = new Set<string>();
  for (const { topic, update } of items) {
    if (dropped.has(topic)) continue;
    if (update.field === 'overseasClear' && overseasAffirmed) continue;
    if (update.field === 'childbirthClear' && childrenAffirmed) continue;
    const key = `${update.field}:${JSON.stringify(update.value)}`;
    if (emitted.has(key)) continue;
    emitted.add(key);
    merged.push(update);
  }
  return merged;
}

export type ConsultationClauseTrace = {
  text: string;
  kind: ConsultationUtteranceKind;
  guard: ClauseGuard;
  updates: ConsultationFieldUpdate[];
};

/** 발화를 절 단위로 나누고, 절마다 따로 사실을 뽑는다. 테스트와 디버깅에서 근거를 보려고 공개한다. */
export function traceConsultationClauses(message: string): ConsultationClauseTrace[] {
  return splitClauses(normalizeConsultationNumbers(message)).map(text => {
    const kind = classifyConsultationUtterance(text);
    const guard = clauseGuard(text);
    return { text, kind, guard, updates: kind === 'ASSERTION' ? extractClause(text).map(item => item.update) : [] };
  });
}

function parseSupply(message: string): SupplyType | undefined {
  if (/청년/.test(message)) return 'youth';
  if (/(신혼|예비신혼|한부모)/.test(message)) return 'newlywed';
  if (/생애.?최초/.test(message)) return 'firstHome';
  return undefined;
}

/**
 * Small offline interpreter for tests and no-provider environments. It extracts
 * only explicit literals and never returns a result, stage or score.
 */
export class DeterministicConsultationInterpreter implements ConsultationLanguageProvider {
  async interpret({ message }: { message: string }): Promise<ConsultationInterpretation> {
    const clauses = splitClauses(normalizeConsultationNumbers(message));
    const extracted = clauses.flatMap(text => {
      const kind = classifyConsultationUtterance(text);
      if (kind === 'ASSERTION') return extractClause(text);
      return kind === 'UNKNOWN' && clauseGuard(text) === 'THIRD_PARTY' ? reviewFlags(text) : [];
    });
    const intent = classifyIntent(message, extracted.length > 0);
    const updates = intent === 'SHOW_PROFILE' ? [] : mergeExtracted(extracted);
    return {
      intent: intent === 'UPDATE_USER_INFO' && !updates.length ? 'UNKNOWN' : intent,
      supplyType: parseSupply(message),
      updates,
      evidenceRequested: intent !== 'SHOW_PROFILE' && /(근거|공고.*어디|보여줘)/.test(message),
    };
  }
}
