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

export function applyConsultationUpdates(
  session: ConsultationSession,
  updates: ConsultationFieldUpdate[],
  rules: AnnouncementRules,
): ConsultationSession {
  const next = structuredClone(session);
  for (const update of updates) {
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
      case 'marriageStatus': next.userProfileSnapshot.family.marriageStatus = knownField(update.value); break;
      case 'currentHousingOwnership': next.userProfileSnapshot.housing.currentOwnership = knownField(update.value); break;
      case 'previousHousingOwnership': next.userProfileSnapshot.housing.previousOwnership = knownField(update.value); break;
      case 'householdHasHome': next.userProfileSnapshot.housing.householdHasHome = knownField(update.value); break;
      case 'hasSubscriptionAccount': next.userProfileSnapshot.subscriptionAccount.hasAccount = knownField(update.value); break;
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
  return { profile: structuredClone(session.userProfileSnapshot), details };
}
