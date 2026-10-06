import { create } from 'zustand';
import { defaultChatOutcome, sendChat, startChat, type KioskChat } from './consult.ts';
import { evaluateEvent, type KioskEvaluation } from './evaluate.ts';
import type { LoadedEvent } from './eventConfig.ts';
import {
  emptyAnswers,
  resizeChildren,
  type ApplicantInfo,
  type HouseholdInfo,
  type HouseholdType,
  type KioskAnswers,
  type SubscriptionInfo,
} from './model.ts';

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
  /** 결과를 계산한 뒤 답을 고치면 true. 결과 화면이 다시 분석하라고 알려 준다. */
  stale: boolean;
  favorites: string[];
  chat: KioskChat | null;
  chatBusy: boolean;
  /** 방문자가 손댄 질문. '잘 모르겠어요'(null)와 아직 답하지 않은 것을 화면에서 구별하는 데만 쓴다. */
  answered: string[];

  setHouseholdType: (type: HouseholdType) => void;
  patchApplicant: (patch: Partial<ApplicantInfo>) => void;
  patchHousehold: (patch: Partial<HouseholdInfo>) => void;
  patchSubscription: (patch: Partial<SubscriptionInfo>) => void;
  runAnalysis: (event: LoadedEvent) => Promise<void>;
  markAnswered: (key: string) => void;
  toggleFavorite: (outcomeId: string) => void;
  openChat: (event: LoadedEvent, outcomeId: string | null) => void;
  ask: (event: LoadedEvent, message: string) => Promise<void>;
  reset: () => void;
};

/** 분석 화면이 너무 빨리 지나가면 방문자가 무슨 일이 있었는지 모른다. 최소한 이만큼은 보여 준다. */
export const MIN_ANALYSIS_MS = 1600;

const initial = () => ({
  answers: emptyAnswers(),
  analysis: 'idle' as AnalysisState,
  analysisError: null,
  evaluation: null,
  stale: false,
  favorites: [] as string[],
  chat: null,
  chatBusy: false,
  answered: [] as string[],
});

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const useKioskStore = create<KioskState>()((set, get) => ({
  sessionKey: 0,
  ...initial(),

  setHouseholdType: (type) => set(state => {
    const answers = structuredClone(state.answers);
    answers.householdType = type;
    // 배우자가 없는 가구로 바꾸면 배우자 관련 답을 지운다. 남겨 두면 보이지 않는 답이 판정에 섞인다.
    if (type !== 'couple' && type !== 'withChildren') {
      answers.household.marriageRegistered = null;
      answers.household.marriageDate = '';
      answers.household.plannedMarriageWithinDeadline = null;
      answers.household.dualIncome = null;
    }
    if (type !== 'singleParent') answers.household.singleParentQualified = null;
    if (type === 'single' || type === 'couple' || type === 'other') {
      answers.household.childrenCount = null;
      answers.household.childBirthYears = [];
    }
    if (type === 'single') answers.household.householdSize = null;
    return { answers, stale: state.evaluation !== null };
  }),
  patchApplicant: (patch) => set(state => ({
    answers: { ...state.answers, applicant: { ...state.answers.applicant, ...patch } },
    stale: state.evaluation !== null,
  })),
  patchHousehold: (patch) => set(state => {
    const household = { ...state.answers.household, ...patch };
    if ('childrenCount' in patch) household.childBirthYears = resizeChildren(household.childBirthYears, household.childrenCount);
    return { answers: { ...state.answers, household }, stale: state.evaluation !== null };
  }),
  patchSubscription: (patch) => set(state => ({
    answers: { ...state.answers, subscription: { ...state.answers.subscription, ...patch } },
    stale: state.evaluation !== null,
  })),

  runAnalysis: async (event) => {
    const sessionKey = get().sessionKey;
    set({ analysis: 'running', analysisError: null });
    const started = Date.now();
    try {
      const evaluation = evaluateEvent(event, get().answers);
      await wait(Math.max(0, MIN_ANALYSIS_MS - (Date.now() - started)));
      // 분석 중에 reset 됐다면 이전 방문자의 결과를 새 세션에 넣지 않는다.
      if (get().sessionKey !== sessionKey) return;
      const known = new Set(evaluation.outcomes.map(outcome => outcome.id));
      set(state => ({
        analysis: 'done',
        evaluation,
        stale: false,
        favorites: state.favorites.filter(id => known.has(id)),
        chat: null,
      }));
    } catch (error) {
      if (get().sessionKey !== sessionKey) return;
      set({ analysis: 'error', analysisError: error instanceof Error ? error.message : 'ANALYSIS_FAILED' });
    }
  },

  markAnswered: (key) => set(state => (state.answered.includes(key) ? state : { answered: [...state.answered, key] })),

  toggleFavorite: (outcomeId) => set(state => ({
    favorites: state.favorites.includes(outcomeId)
      ? state.favorites.filter(id => id !== outcomeId)
      : [...state.favorites, outcomeId],
  })),

  openChat: (event, outcomeId) => {
    const { chat, evaluation, answers } = get();
    if (chat && chat.context.outcomeId === outcomeId) return;
    const outcomes = evaluation?.outcomes ?? [];
    // 공고를 정하지 않고 상담을 열면 결과에서 가장 앞에 있는, 판정할 수 있는 공급으로 시작한다.
    const outcome = outcomeId ? outcomes.find(item => item.id === outcomeId) ?? null : defaultChatOutcome(outcomes);
    if (chat && outcome && chat.context.outcomeId === outcome.id) return;
    set({ chat: startChat(event, answers, outcome) });
  },

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

  reset: () => set(state => ({ sessionKey: state.sessionKey + 1, ...initial() })),
}));
