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

/**
 * Browser -> event chat function boundary.
 *
 * This is deliberately presentation-safe. It contains no profile object, person id,
 * birth date, exact income/assets, raw fact key, QR token, or Rule Package.
 */
export type EventChatContext = {
  schemaVersion: 1;
  scope: 'SAMDO' | 'PORTFOLIO';
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

export type EventChatFallback = { text: string; detail?: string[] };

export type EventChatRequest = {
  question: string;
  history: EventChatHistoryTurn[];
  context: EventChatContext;
  fallback: EventChatFallback;
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

