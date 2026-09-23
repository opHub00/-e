import type { Answers } from './questions.ts';

/**
 * 질문지 진행 상황은 이 기기에만 남긴다. 서버 테이블이나 migration 은 만들지 않는다.
 * 공고와 공급유형마다 따로 저장하므로, 다른 공고를 보다가 돌아와도 답이 섞이지 않는다.
 */
const KEY = 'wanpane:assessment-questionnaire:v1';
const MAX_ANSWERS = 60;
const MAX_VALUE = 200;

export type QuestionnaireDraft = { answers: Answers; index: number; savedAt: string };
export type DraftStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export const draftKey = (listingId: string, supply: string) => `${KEY}:${encodeURIComponent(listingId)}:${supply}`;

const browserStorage = (): DraftStorage | null => {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
};

export function writeDraft(listingId: string, supply: string, draft: Omit<QuestionnaireDraft, 'savedAt'>, storage: DraftStorage | null = browserStorage()): void {
  if (!listingId) return;
  const answers: Answers = {};
  for (const [id, value] of Object.entries(draft.answers).slice(0, MAX_ANSWERS)) {
    if (typeof value === 'string' && value.length <= MAX_VALUE) answers[id] = value;
  }
  try {
    storage?.setItem(draftKey(listingId, supply), JSON.stringify({ answers, index: draft.index, savedAt: new Date().toISOString() }));
  } catch { /* 저장 공간이 없으면 진행만 계속한다 */ }
}

export function readDraft(listingId: string, supply: string, storage: DraftStorage | null = browserStorage()): QuestionnaireDraft | null {
  if (!listingId) return null;
  try {
    const raw = storage?.getItem(draftKey(listingId, supply));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as QuestionnaireDraft;
    if (!parsed || typeof parsed !== 'object' || typeof parsed.answers !== 'object' || parsed.answers === null) return null;
    const answers: Answers = {};
    for (const [id, value] of Object.entries(parsed.answers)) if (typeof value === 'string') answers[id] = value;
    const index = Number.isInteger(parsed.index) && parsed.index >= 0 ? parsed.index : 0;
    return { answers, index, savedAt: typeof parsed.savedAt === 'string' ? parsed.savedAt : '' };
  } catch { return null; }
}

export function clearDraft(listingId: string, supply: string, storage: DraftStorage | null = browserStorage()): void {
  try { storage?.removeItem(draftKey(listingId, supply)); } catch { /* 지울 수 없으면 그대로 둔다 */ }
}

/** 테스트와 서버 렌더에서 쓰는 메모리 저장소. */
export function createMemoryDraftStorage(): DraftStorage {
  const map = new Map<string, string>();
  return {
    getItem: key => map.get(key) ?? null,
    setItem: (key, value) => { map.set(key, value); },
    removeItem: key => { map.delete(key); },
  };
}
