import type { ApplicantProfileV2 } from '../../profile/domain.ts';
import type {
  AnnouncementRules,
  ApplicationAssessmentResult,
  AssessmentInput,
  Evidence,
  RuleSourceStatus,
  Stage,
  Status,
  SupplyType,
} from '../types.ts';

export type ConsultationIntent =
  | 'CHECK_ELIGIBILITY'
  | 'CHECK_SCORE'
  | 'CHECK_STAGE'
  | 'WHY_RESULT'
  | 'CHECK_REQUIREMENT'
  | 'CHECK_EXCEPTION'
  | 'CHECK_DOCUMENTS'
  | 'UPDATE_USER_INFO'
  /** 상담에 사용 중인 내 정보를 보여 달라는 요청. 판정을 다시 하지 않는다. */
  | 'SHOW_PROFILE'
  | 'UNKNOWN';

export type ConsultationResolution =
  | 'ASSESSED'
  | 'NEEDS_MORE_INFORMATION'
  | 'REVIEW_REQUIRED'
  | 'CONSULTATION_UNSUPPORTED'
  | 'INTERPRETATION_FAILED';

export type ConsultationTurn = {
  role: 'USER' | 'ASSISTANT';
  message: string;
  intent?: ConsultationIntent;
};

export type ConsultationCollectedAnswers = AssessmentInput['details'] & {
  /** Preserved for follow-up, but never converted into a fabricated birth date. */
  declaredAgeYears?: number;
  declaredResidenceMonths?: number;
  declaredSubscriptionMonths?: number;
  /** Stated number of children; birth dates are used only when their count matches. */
  declaredChildCount?: number;
};

export type ConsultationSession = {
  announcementId: string;
  listingId: string;
  supplyType: SupplyType | null;
  userProfileSnapshot: ApplicantProfileV2;
  collectedAnswers: ConsultationCollectedAnswers;
  lastAssessmentResult: ApplicationAssessmentResult | null;
  missingFields: string[];
  /** Missing answers the user explicitly said they cannot confirm in this session. */
  deferredFields: string[];
  /** Fields the user stated in this conversation. Kept in the session only; never written to the saved profile. */
  conversationFactKeys?: ConsultationFieldUpdate['field'][];
  conversationTurns: ConsultationTurn[];
};

export type ConsultationFieldUpdate =
  | { field: 'declaredAgeYears'; value: number }
  | { field: 'birthDate'; value: string }
  | { field: 'currentResidence'; value: string }
  | { field: 'residenceDurationMonths'; value: number }
  | { field: 'subscriptionDurationMonths'; value: number }
  | { field: 'recognizedPaymentCount'; value: number }
  | { field: 'recognizedDepositAmount'; value: number }
  | { field: 'monthlyIncome'; value: number }
  | { field: 'householdIncome'; value: number }
  | { field: 'totalAssets'; value: number }
  | { field: 'parentAssets'; value: number }
  | { field: 'realEstateAssets'; value: number }
  /** "YYYY-MM-DD" or "YYYY-MM-DD~YYYY-MM-DD" when only a month or year is known. */
  | { field: 'marriageDate'; value: string }
  /** "min~max" completed months at the announcement date, e.g. "결혼한 지 3년" → "36~47". */
  | { field: 'marriageDurationMonths'; value: string }
  | { field: 'familyCategory'; value: 'married' | 'engaged' | 'singleParent' }
  | { field: 'singleParentQualified'; value: boolean }
  | { field: 'plannedMarriageWithinDeadline'; value: boolean }
  | { field: 'incomeHouseholdSize'; value: number }
  /** Comma-separated child birth dates, each "YYYY-MM-DD" or "YYYY-MM-DD~YYYY-MM-DD". */
  | { field: 'childBirthDates'; value: string }
  | { field: 'childCount'; value: number }
  | { field: 'specialSupplyRestriction'; value: boolean }
  | { field: 'vehicleValue'; value: number }
  | { field: 'incomeTaxPaymentYears'; value: number }
  | { field: 'workOrBusinessIncomeEligible'; value: boolean }
  | { field: 'marriageStatus'; value: 'single' | 'married' }
  | { field: 'currentHousingOwnership'; value: 'no-home' | 'owns-home' }
  | { field: 'previousHousingOwnership'; value: boolean }
  | { field: 'householdHasHome'; value: boolean }
  | { field: 'hasSubscriptionAccount'; value: boolean }
  | { field: 'accountKindEligible'; value: boolean }
  | { field: 'specialSupplyHistory'; value: boolean }
  | { field: 'reWinningRestriction'; value: boolean }
  | { field: 'overseasClear'; value: boolean }
  | { field: 'specialExceptionsClear'; value: boolean }
  | { field: 'childbirthClear'; value: boolean }
  | { field: 'dualIncome'; value: boolean }
  | { field: 'specialException'; value: string };

export type ConsultationInterpretation = {
  intent: ConsultationIntent;
  supplyType?: SupplyType;
  updates: ConsultationFieldUpdate[];
  evidenceRequested: boolean;
};

/**
 * Providers can only interpret text into this narrow contract. Eligibility,
 * stage, score, evidence and explanatory conclusions are deliberately absent.
 */
export interface ConsultationLanguageProvider {
  interpret(input: {
    message: string;
    announcementId: string;
    listingId: string;
    supplyType: SupplyType | null;
  }): Promise<unknown>;
}

export type ConsultationMissingQuestion = {
  key: string;
  prompt: string;
  target: 'ANSWER' | 'PROFILE';
  options?: { label: string; value: string }[];
};

export type ConsultationAction =
  | { type: 'ANSWER_QUESTION'; label: string }
  | { type: 'EDIT_PROFILE'; label: string }
  | { type: 'REVIEW_ANNOUNCEMENT'; label: string }
  | { type: 'VIEW_DOCUMENTS'; label: string };

export type ConsultationEvidenceRef = Omit<Evidence, 'id'> & {
  /** Kept for machine linking. The answer builder never prints this value. */
  evidenceId: string;
};

export type ConsultationResponse = {
  message: string;
  /** Optional presentation hierarchy; `message` remains the backwards-compatible rendering. */
  summary?: string;
  reason?: string;
  nextStep?: string;
  intent: ConsultationIntent;
  resolution: ConsultationResolution;
  assessmentStatus: Status | null;
  supplyType: SupplyType | null;
  stage: Stage | null;
  score?: ApplicationAssessmentResult['score'];
  suggestedQuestions: ConsultationMissingQuestion[];
  actions: ConsultationAction[];
  evidenceRefs: ConsultationEvidenceRef[];
  sourceStatus: RuleSourceStatus | null;
  unresolvedItems?: string[];
  contextTransition?: string;
};

export type ConsultationSendResult = {
  session: ConsultationSession;
  response: ConsultationResponse;
};

export type ConsultationEngineOptions = {
  rules: AnnouncementRules | null;
  provider?: ConsultationLanguageProvider;
};
