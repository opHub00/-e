import { knownField } from '../../profile/domain.ts';
import type { AnnouncementRules, AssessmentInput, SupplyType } from '../types.ts';
import type {
  ConsultationCollectedAnswers,
  ConsultationFieldUpdate,
  ConsultationSession,
  ConsultationTurn,
} from './types.ts';

const MAX_TURNS = 12;
const MAX_TURN_CHARS = 1_200;

export function createConsultationSession(input: {
  announcementId: string;
  listingId: string;
  userProfileSnapshot: AssessmentInput['profile'];
  collectedAnswers?: ConsultationCollectedAnswers;
  supplyType?: SupplyType | null;
}): ConsultationSession {
  return {
    announcementId: input.announcementId,
    listingId: input.listingId,
    supplyType: input.supplyType ?? null,
    userProfileSnapshot: structuredClone(input.userProfileSnapshot),
    collectedAnswers: structuredClone(input.collectedAnswers ?? {}),
    lastAssessmentResult: null,
    missingFields: [],
    deferredFields: [],
    conversationFactKeys: [],
    conversationTurns: [],
  };
}

export function appendTurn(turns: ConsultationTurn[], turn: ConsultationTurn): ConsultationTurn[] {
  const bounded = { ...turn, message: turn.message.trim().slice(0, MAX_TURN_CHARS) };
  return [...turns, bounded].slice(-MAX_TURNS);
}

function subtractMonths(date: string | null, months: number): string | undefined {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isSafeInteger(months) || months < 0) return undefined;
  const [year, month, day] = date.split('-').map(Number);
  const absolute = year * 12 + month - 1 - months;
  const targetYear = Math.floor(absolute / 12);
  const targetMonth = ((absolute % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  return `${targetYear.toString().padStart(4, '0')}-${(targetMonth + 1).toString().padStart(2, '0')}-${Math.min(day, lastDay).toString().padStart(2, '0')}`;
}

type DateRange = { start: string; end: string };
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const validIso = (value: string) => ISO_DATE.test(value) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

/** "YYYY-MM-DD" or "YYYY-MM-DD~YYYY-MM-DD". */
function parseDateRange(value: string): DateRange | null {
  const [start, end = start] = value.trim().split('~');
  return validIso(start) && validIso(end) && start <= end ? { start, end } : null;
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

/** "min~max" completed months at the announcement date → the marriage dates that give exactly that. */
function durationRange(value: string, asOf: string | null): DateRange | null {
  const [min, max] = value.split('~').map(Number);
  if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max) || min < 0 || max < min) return null;
  const latest = subtractMonths(asOf, min), beforeEarliest = subtractMonths(asOf, max + 1);
  return latest && beforeEarliest ? { start: addDays(beforeEarliest, 1), end: latest } : null;
}

/** Narrow the known marriage window. Statements that cannot both be true leave the date unknown. */
function applyMarriageRange(session: ConsultationSession, range: DateRange | null) {
  const answers = session.collectedAnswers;
  if (!range) return;
  const current = answers.marriageDate ? { start: answers.marriageDate, end: answers.marriageDateLatest ?? answers.marriageDate } : null;
  const start = current && current.start > range.start ? current.start : range.start;
  const end = current && current.end < range.end ? current.end : range.end;
  if (start > end) { delete answers.marriageDate; delete answers.marriageDateLatest; return; }
  answers.marriageDate = start;
  if (end !== start) answers.marriageDateLatest = end; else delete answers.marriageDateLatest;
}

export function applyConsultationUpdates(
  session: ConsultationSession,
  updates: ConsultationFieldUpdate[],
  rules: AnnouncementRules,
): ConsultationSession {
  const next = structuredClone(session);
  for (const update of updates) {
    next.conversationFactKeys = [...new Set([...(next.conversationFactKeys ?? []), update.field])];
    switch (update.field) {
      case 'declaredAgeYears': next.collectedAnswers.declaredAgeYears = update.value; break;
      case 'birthDate': next.collectedAnswers.birthDate = update.value; break;
      case 'currentResidence': next.collectedAnswers.currentResidence = update.value; break;
      case 'residenceDurationMonths': {
        next.collectedAnswers.declaredResidenceMonths = update.value;
        const date = subtractMonths(rules.announcementDate, update.value);
        if (date) next.collectedAnswers.residenceStartDate = date;
        break;
      }
      case 'subscriptionDurationMonths': {
        next.collectedAnswers.declaredSubscriptionMonths = update.value;
        const date = subtractMonths(rules.announcementDate, update.value);
        if (date) next.collectedAnswers.subscriptionAccountOpenedAt = date;
        break;
      }
      case 'incomeTaxPaymentYears': next.userProfileSnapshot.income.incomeTaxPaymentYears = knownField(update.value); break;
      case 'workOrBusinessIncomeEligible': next.userProfileSnapshot.income.workOrBusinessIncomeEligible = knownField(update.value); break;
      case 'marriageStatus': next.userProfileSnapshot.family.marriageStatus = knownField(update.value); break;
      case 'currentHousingOwnership': next.userProfileSnapshot.housing.currentOwnership = knownField(update.value); break;
      case 'previousHousingOwnership': next.userProfileSnapshot.housing.previousOwnership = knownField(update.value); break;
      case 'householdHasHome': next.userProfileSnapshot.housing.householdHasHome = knownField(update.value); break;
      case 'hasSubscriptionAccount': next.userProfileSnapshot.subscriptionAccount.hasAccount = knownField(update.value); break;
      case 'overseasClear': {
        next.collectedAnswers.overseasStayHistory = update.value ? [] : undefined;
        if (!update.value) next.collectedAnswers.specialExceptions = [...new Set([...(next.collectedAnswers.specialExceptions ?? []), '해외체류 이력 추가 확인'])];
        break;
      }
      case 'specialExceptionsClear': next.collectedAnswers.specialExceptions = update.value ? [] : next.collectedAnswers.specialExceptions; break;
      case 'childbirthClear': next.collectedAnswers.children = update.value ? [] : next.collectedAnswers.children; break;
      case 'marriageDate': applyMarriageRange(next, parseDateRange(update.value)); break;
      case 'marriageDurationMonths': applyMarriageRange(next, durationRange(update.value, rules.announcementDate)); break;
      case 'childBirthDates': {
        const children = update.value.split(',').map(parseDateRange);
        const count = next.collectedAnswers.declaredChildCount;
        // 말한 자녀 수와 생년월일 개수가 다르면 어느 쪽도 고르지 않는다.
        if (children.some(child => child === null) || (count !== undefined && count !== children.length)) delete next.collectedAnswers.children;
        else next.collectedAnswers.children = children.map(child => ({ birthDate: child!.start, ...(child!.end !== child!.start ? { birthDateLatest: child!.end } : {}), unborn: false }));
        break;
      }
      case 'childCount': {
        next.collectedAnswers.declaredChildCount = update.value;
        const current = next.collectedAnswers.children;
        if (update.value === 0) next.collectedAnswers.children = [];
        else if (current && current.length !== update.value) delete next.collectedAnswers.children;
        break;
      }
      case 'specialSupplyRestriction': next.userProfileSnapshot.housing.hasSpecialSupplyRestriction = knownField(update.value); break;
      case 'specialException': next.collectedAnswers.specialExceptions = [...new Set([...(next.collectedAnswers.specialExceptions ?? []), update.value])]; break;
      default: {
        const field = update.field as keyof AssessmentInput['details'];
        (next.collectedAnswers as Record<string, unknown>)[field] = update.value;
      }
    }
  }
  return next;
}

export function assessmentInputFromSession(session: ConsultationSession): AssessmentInput {
  const details = structuredClone(session.collectedAnswers);
  delete details.declaredAgeYears;
  delete details.declaredResidenceMonths;
  delete details.declaredSubscriptionMonths;
  delete details.declaredChildCount;
  return { profile: structuredClone(session.userProfileSnapshot), details };
}
