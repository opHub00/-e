export type EventChatHistoryTurn = {
  role: 'user' | 'assistant';
  text: string;
};

export type EventChatOfficialScore =
  | {
      status: 'AVAILABLE';
      label: string;
      total: number;
      max: number;
      breakdown: Array<{ label: string; points: number; max: number }>;
    }
  | { status: 'NOT_APPLICABLE' | 'PENDING'; label: string };

export type EventChatEvidence = {
  label: string;
  section: string;
  page?: number;
};

export type EventChatComparison = {
  supplyType: string;
  eligibility: string;
  priorityStage: string | null;
  officialScore: string;
};

export type EventChatSchedule = {
  special: string;
  generalFirst: string;
  generalSecond: string;
  winnerAnnouncement: string;
  documentSubmissionStart: string;
  documentSubmissionEnd: string;
  contractStart: string;
  contractEnd: string;
};

/**
 * Browser -> event chat function boundary.
 *
 * This is deliberately presentation-safe. It contains no profile object, person id,
 * birth date, exact income/assets, raw fact key, QR token, or Rule Package.
 */
type EventChatContextBase = {
  listingTitle: string;
  focus: {
    supplyType: string;
    eligibility: string;
    priorityStage: string | null;
    officialScore: EventChatOfficialScore;
    matchedAdvantages: string[];
    missingInformation: string[];
    cautions: string[];
    evidence: EventChatEvidence[];
    applicationDate?: string;
    supplyCount?: number;
  };
  recommendation: {
    recommendedType: string | null;
    alternatives: EventChatComparison[];
    lowerPriorityTypes: EventChatComparison[];
    rejectedTypes: Array<{ supplyType: string; reason: string }>;
  };
};

export type EventChatSingleContext = EventChatContextBase & {
  schemaVersion: 1;
  scope: 'SAMDO' | 'PORTFOLIO';
  schedule: EventChatSchedule | null;
};

export type EventChatDualContext = EventChatContextBase & {
  schemaVersion: 2;
  scope: 'SAMDO_DUAL';
  schedule: null;
  districts: Array<{
    id: 'samdo-1' | 'samdo-2';
    title: string;
    managementNumber: string;
    schedule: EventChatSchedule;
    supplyCounts: Record<string, number>;
    units: Array<{
      unitType: string;
      prices: Array<{ floor: string; priceKrw: number }>;
      monthlyLandRentKrw: number;
    }>;
    recommendation: EventChatComparison | null;
  }>;
  unresolvedFacts: Array<{
    label: string;
    state: 'DOES_NOT_KNOW' | 'UNKNOWN' | 'EVIDENCE_REQUIRED' | 'CONDITIONAL';
    districts: Array<'samdo-1' | 'samdo-2'>;
    affectedSupplyTypes: string[];
    userFacingQuestion: string;
    reason: string;
    evidenceNeeded: string;
  }>;
  retrievedEvidence: Array<{
    districtId: 'samdo-1' | 'samdo-2';
    section: string;
    textExcerpt: string;
    locator: string;
  }>;
};

export type EventChatContext = EventChatSingleContext | EventChatDualContext;

export type EventChatFallback = { text: string; detail?: string[] };

export type EventChatResolution = 'EXACT_STRUCTURED' | 'ASSESSMENT_AWARE' | 'FREEFORM_RAG' | 'CLARIFICATION';

export type EventChatRequest = {
  question: string;
  history: EventChatHistoryTurn[];
  context: EventChatContext;
  fallback: EventChatFallback;
  resolution: EventChatResolution;
};

export type EventChatMode = 'llm' | 'deterministic' | 'fallback';

export type EventChatResponse = {
  text: string;
  detail?: string[];
  mode: EventChatMode;
  provider?: 'google-gemini';
  model?: string;
  requestId?: string;
};

export const EVENT_CHAT_MAX_REQUEST_CHARS = 16_000;
export const EVENT_CHAT_MAX_QUESTION_CHARS = 500;
export const EVENT_CHAT_MAX_HISTORY_TURNS = 6;
export const EVENT_CHAT_MAX_HISTORY_CHARS = 3_000;
