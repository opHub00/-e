import { create } from 'zustand';
import { defaultChatOutcome, sendChat, startChat, startSamdoChat, startSamdoDualChat, type KioskChat } from './consult.ts';
import type { SamdoPresentationRecommendation } from './samdo/index.ts';
import type { SamdoDualAssessment } from './samdoDual/types.ts';
import { evaluateEvent, type KioskEvaluation } from './evaluate.ts';
import type { AdaptiveQuestionPlan } from './adaptiveAssessment.ts';
import type { LoadedEvent } from './eventConfig.ts';
import {
  emptyAnswers,
  resizeChildDates,
  resizeChildren,
  type AdaptiveInfo,
  type AnswerState,
  type ApplicantInfo,
  type HouseholdInfo,
  type HouseholdType,
  type KioskAnswers,
  type SubscriptionInfo,
  type InputStep,
} from './model.ts';
import { skippedQuestionKeys, type AnswerStateMap } from './questionPolicy.ts';
import { samdoInputFromAnswers } from './samdoResult/samdoInput.ts';

/**
 * 행사 체험 한 번의 상태.
 *
 * 메모리에만 둔다. localStorage·sessionStorage·서버 어디에도 쓰지 않는다.
 * 그래서 reset 한 번이면 이전 방문자의 입력·결과·관심 공고·상담 내용이 모두 사라지고,
 * 새로고침해도 남는 것이 없다.
 */
export type AnalysisState = 'idle' | 'running' | 'done' | 'error';

type KioskState = {
  /** reset 할 때마다 바뀐다. 화면이 이 값으로 지역 상태(스크롤, 입력 중 텍스트)를 버린다. */
  sessionKey: number;
  answers: KioskAnswers;
  analysis: AnalysisState;
  analysisError: string | null;
  evaluation: KioskEvaluation | null;
  adaptivePlan: AdaptiveQuestionPlan | null;
  /** 결과를 계산한 뒤 답을 고치면 true. 결과 화면이 다시 분석하라고 알려 준다. */
  stale: boolean;
  favorites: string[];
  chat: KioskChat | null;
  chatBusy: boolean;
  /** 방문자가 손댄 질문. '잘 모르겠어요'(null)와 아직 답하지 않은 것을 화면에서 구별하는 데만 쓴다. */
  answered: string[];
  /** 명시적으로 답한 값과 '잘 모르겠어요'를 분리한다. */
  answerStates: AnswerStateMap;

  setHouseholdType: (type: HouseholdType) => void;
  patchApplicant: (patch: Partial<ApplicantInfo>) => void;
  patchHousehold: (patch: Partial<HouseholdInfo>) => void;
  patchSubscription: (patch: Partial<SubscriptionInfo>) => void;
  patchAdaptive: (patch: Partial<AdaptiveInfo>) => void;
  /** 해결 센터에서 사용자가 직접 확인한 값만 현재 세션의 원본 답변에 반영한다. */
  applyRefinementAnswers: (answers: KioskAnswers, answeredKeys: string[]) => void;
  runAnalysis: (event: LoadedEvent) => Promise<void>;
  markAnswered: (key: string) => void;
  markDoesNotKnow: (key: string) => void;
  clearAnswerState: (key: string) => void;
  finalizeStep: (step: InputStep) => void;
  toggleFavorite: (outcomeId: string) => void;
  openChat: (event: LoadedEvent, outcomeId: string | null) => void;
  openSamdoChat: (event: LoadedEvent, recommendation: SamdoPresentationRecommendation) => void;
  openSamdoDualChat: (event: LoadedEvent, assessment: SamdoDualAssessment) => void;
  ask: (event: LoadedEvent, message: string) => Promise<void>;
  /** Copilot 화면이 직접 답한 대화(모름·나중에·왜·가정 열기)를 기록한다. 서버를 부르지 않는다. */
  appendLocalExchange: (userText: string, reply: { text: string; detail?: string[] }) => void;
  /** 답이 바뀐 뒤 상담 맥락의 두 지구 판정만 최신으로 바꾼다(대화 기록 유지). */
  refreshSamdoDualAssessment: (assessment: SamdoDualAssessment) => void;
  reset: () => void;
  /**
   * 개발·QA 전용. 시연 persona 의 답을 한 번에 넣는다. 화면 흐름(분석 → 질문 → 결과)은 그대로 거친다.
   * 행사용 빌드의 화면에서는 부르는 곳이 없다(/event/qa 는 개발 빌드에서만 동작).
   */
  qaLoadAnswers: (answers: KioskAnswers, answeredKeys: string[]) => void;
};

/** 분석 화면이 너무 빨리 지나가면 방문자가 무슨 일이 있었는지 모른다. 최소한 이만큼은 보여 준다. */
export const MIN_ANALYSIS_MS = 1600;

const initial = () => ({
  answers: emptyAnswers(),
  analysis: 'idle' as AnalysisState,
  analysisError: null,
  evaluation: null,
  adaptivePlan: null,
  stale: false,
  favorites: [] as string[],
  chat: null,
  chatBusy: false,
  answered: [] as string[],
  answerStates: {} as AnswerStateMap,
});

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const useKioskStore = create<KioskState>()((set, get) => ({
  sessionKey: 0,
  ...initial(),

  setHouseholdType: (type) => set(state => {
    const answers = structuredClone(state.answers);
    const answerStates: AnswerStateMap = { ...state.answerStates, householdType: 'ANSWERED' as AnswerState };
    answers.householdType = type;
    // 배우자가 없는 가구로 바꾸면 배우자 관련 답을 지운다. 남겨 두면 보이지 않는 답이 판정에 섞인다.
    if (type !== 'couple' && type !== 'withChildren') {
      answers.household.marriageRegistered = null;
      answers.household.marriageDate = '';
      answers.household.plannedMarriageWithinDeadline = null;
      answers.household.dualIncome = null;
      for (const key of ['household.marriageRegistered', 'household.marriageDate', 'household.plannedMarriageWithinDeadline', 'household.dualIncome']) delete answerStates[key];
    }
    if (type !== 'singleParent') {
      answers.household.singleParentQualified = null;
      delete answerStates['household.singleParentQualified'];
    }
    if (type === 'single' || type === 'couple' || type === 'other') {
      answers.household.childrenCount = null;
      answers.household.childBirthYears = [];
      answers.household.childBirthDates = [];
      delete answerStates['household.childrenCount'];
      for (const key of Object.keys(answerStates)) if (key.startsWith('household.childBirthDates.')) delete answerStates[key];
    }
    if (type === 'single') {
      answers.household.householdSize = null;
      answers.household.householdIncome = null;
      delete answerStates['household.householdSize'];
      delete answerStates['household.householdIncome'];
    }
    const answered = [...new Set([...state.answered, 'householdType'])].filter(key => answerStates[key] !== undefined);
    return { answers, answerStates, answered, stale: state.evaluation !== null };
  }),
  patchApplicant: (patch) => set(state => ({
    answers: { ...state.answers, applicant: { ...state.answers.applicant, ...patch } },
    stale: state.evaluation !== null,
  })),
  patchHousehold: (patch) => set(state => {
    const household = { ...state.answers.household, ...patch };
    if ('childrenCount' in patch) {
      household.childBirthYears = resizeChildren(household.childBirthYears, household.childrenCount);
      household.childBirthDates = resizeChildDates(household.childBirthDates, household.childrenCount);
    }
    return { answers: { ...state.answers, household }, stale: state.evaluation !== null };
  }),
  patchSubscription: (patch) => set(state => ({
    answers: { ...state.answers, subscription: { ...state.answers.subscription, ...patch } },
    stale: state.evaluation !== null,
  })),
  patchAdaptive: (patch) => set(state => ({
    answers: { ...state.answers, adaptive: { ...state.answers.adaptive, ...patch } },
    stale: state.evaluation !== null,
  })),

  applyRefinementAnswers: (answers, answeredKeys) => set(state => {
    const answerStates = { ...state.answerStates };
    for (const key of answeredKeys) answerStates[key] = 'ANSWERED';
    return {
      answers: structuredClone(answers),
      answered: [...new Set([...state.answered, ...answeredKeys])],
      answerStates,
      stale: state.evaluation !== null,
      chat: null,
    };
  }),

  runAnalysis: async (event) => {
    const sessionKey = get().sessionKey;
    set({ analysis: 'running', analysisError: null });
    const started = Date.now();
    try {
      const current = get();
      const evaluation = evaluateEvent(event, current.answers);
      // /event is scoped to Samdo final 1.8. The base questionnaire already asks every user-answerable
      // Samdo fact; unresolved evidence stays in the result refinement center. Never surface frozen
      // multi-listing questions (for example event.eligibleResident) in this route.
      const adaptivePlan: AdaptiveQuestionPlan = { questions: [], evidenceOnlyFacts: [], excludedIneligible: [] };
      await wait(Math.max(0, MIN_ANALYSIS_MS - (Date.now() - started)));
      // 분석 중에 reset 됐다면 이전 방문자의 결과를 새 세션에 넣지 않는다.
      if (get().sessionKey !== sessionKey) return;
      const known = new Set(evaluation.outcomes.map(outcome => outcome.id));
      set(state => ({
        analysis: 'done',
        evaluation,
        adaptivePlan,
        stale: false,
        favorites: state.favorites.filter(id => known.has(id)),
        chat: null,
      }));
      // Staging-only server independently re-evaluates this input. The browser never writes telemetry
      // or supplies status counts; monitoring failure cannot affect the on-device result.
      if (typeof window !== 'undefined' && globalThis.crypto?.randomUUID) {
        const source = samdoInputFromAnswers(current.answers);
        const input = { ...source, profile: { ...source.profile, basic: { ...source.profile.basic, name: '' } }, answerStates: current.answerStates };
        void fetch('/event-api/assessments', {
          method: 'POST', headers: { 'content-type': 'application/json' }, cache: 'no-store',
          body: JSON.stringify({ requestId: globalThis.crypto.randomUUID(), input }),
        }).catch(() => undefined);
      }
    } catch (error) {
      if (get().sessionKey !== sessionKey) return;
      set({ analysis: 'error', analysisError: error instanceof Error ? error.message : 'ANALYSIS_FAILED' });
    }
  },

  markAnswered: (key) => set(state => ({
    answered: state.answered.includes(key) ? state.answered : [...state.answered, key],
    answerStates: { ...state.answerStates, [key]: 'ANSWERED' },
  })),

  markDoesNotKnow: (key) => set(state => ({
    answered: state.answered.includes(key) ? state.answered : [...state.answered, key],
    answerStates: { ...state.answerStates, [key]: 'DOES_NOT_KNOW' },
  })),

  clearAnswerState: (key) => set(state => {
    const answerStates = { ...state.answerStates };
    delete answerStates[key];
    return { answerStates, answered: state.answered.filter(item => item !== key) };
  }),

  finalizeStep: (step) => set(state => {
    const missing = skippedQuestionKeys(state.answers, step, state.answerStates);
    if (!missing.length) return state;
    const answerStates = { ...state.answerStates };
    for (const key of missing) answerStates[key] = 'DOES_NOT_KNOW';
    const answers = structuredClone(state.answers);
    // These enums carry a meaningful reason beyond a nullable scalar, so persist the explicit state in the answer too.
    if (missing.includes('household.childExpectationStatus')) answers.household.childExpectationStatus = 'DOES_NOT_KNOW';
    if (missing.includes('household.parentInformationStatus')) answers.household.parentInformationStatus = 'DOES_NOT_KNOW';
    return { answers, answerStates, answered: [...new Set([...state.answered, ...missing])] };
  }),

  toggleFavorite: (outcomeId) => set(state => ({
    favorites: state.favorites.includes(outcomeId)
      ? state.favorites.filter(id => id !== outcomeId)
      : [...state.favorites, outcomeId],
  })),

  openChat: (event, outcomeId) => {
    const { chat, evaluation } = get();
    if (chat && chat.context.outcomeId === outcomeId) return;
    const outcomes = evaluation?.outcomes ?? [];
    // 공고를 정하지 않고 상담을 열면 결과에서 가장 앞에 있는, 판정할 수 있는 공급으로 시작한다.
    const outcome = outcomeId ? outcomes.find(item => item.id === outcomeId) ?? null : defaultChatOutcome(outcomes);
    if (chat && outcome && chat.context.outcomeId === outcome.id) return;
    set({ chat: startChat(event, evaluation, outcome) });
  },

  openSamdoChat: (event, recommendation) => set({ chat: startSamdoChat(event, recommendation) }),
  openSamdoDualChat: (event, assessment) => set(state => ({ chat: startSamdoDualChat(event, assessment, state.answerStates) })),

  ask: async (event, message) => {
    const { chat, sessionKey } = get();
    if (!chat || get().chatBusy) return;
    set({ chatBusy: true });
    try {
      const next = await sendChat(event, chat, message);
      if (get().sessionKey !== sessionKey) return;
      set({ chat: next });
    } catch {
      if (get().sessionKey !== sessionKey) return;
      set({
        chat: {
          ...chat,
          messages: [...chat.messages, { role: 'user', text: message }, { role: 'assistant', text: '답을 만드는 중에 문제가 생겼어요. 다시 한 번 물어봐 주세요.' }],
        },
      });
    } finally {
      if (get().sessionKey === sessionKey) set({ chatBusy: false });
    }
  },

  appendLocalExchange: (userText, reply) => set(state => (state.chat ? {
    chat: { ...state.chat, messages: [...state.chat.messages, { role: 'user', text: userText }, { role: 'assistant', text: reply.text, detail: reply.detail }] },
  } : {})),

  refreshSamdoDualAssessment: (assessment) => set(state => (state.chat?.samdoDualAssessment ? {
    chat: { ...state.chat, samdoDualAssessment: assessment },
  } : {})),

  reset: () => set(state => ({ sessionKey: state.sessionKey + 1, ...initial() })),

  qaLoadAnswers: (answers, answeredKeys) => set(state => ({
    sessionKey: state.sessionKey + 1,
    ...initial(),
    answers: structuredClone(answers),
    answered: [...new Set(answeredKeys)],
    answerStates: Object.fromEntries([...new Set(answeredKeys)].map(key => [key, 'ANSWERED'])) as AnswerStateMap,
  })),
}));
