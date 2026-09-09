export type AiTurn = { role: 'user' | 'model'; text: string };

export const AI_REQUEST_TIMEOUT_MS = 15_000;
export const AI_HISTORY_TURN_LIMIT = 6;
export const AI_HISTORY_TEXT_LIMIT = 1_200;

export function canStartAiRequest(question: string, inFlight: boolean): boolean {
  return question.trim().length > 0 && !inFlight;
}

export function buildAiRequestHistory(turns: AiTurn[]): AiTurn[] {
  return turns.slice(-AI_HISTORY_TURN_LIMIT).map((turn) => ({
    role: turn.role,
    text: turn.text.slice(0, AI_HISTORY_TEXT_LIMIT),
  }));
}

export function buildAiRequestPayload(
  question: string,
  context: string,
  history: AiTurn[],
  lesson: unknown | null,
  listingFit: unknown | null,
  benchmark: unknown | null = null,
) {
  return {
    question,
    context,
    history,
    ...(lesson ? { lesson } : {}),
    ...(listingFit ? { listingFit } : {}),
    ...(benchmark ? { benchmark } : {}),
  };
}

export function getAiErrorMessage(status: number | null, timedOut = false): string {
  if (timedOut) return '응답이 늦어지고 있어요. 네트워크를 확인한 뒤 다시 시도해 주세요.';
  if (status === 429) return '지금 요청이 많아요. 1분쯤 뒤에 다시 시도해 주세요.';
  if (status === 503) return 'AI가 잠시 붐비고 있어요. 잠시 후 다시 시도해 주세요.';
  if (status === null) return 'AI 서버에 연결하지 못했어요. 네트워크를 확인해 주세요.';
  return '답변을 가져오지 못했어요. 잠시 후 다시 시도해 주세요.';
}

export function getAiLoadingMode(reducedMotion: boolean): 'static' | 'animated' {
  return reducedMotion ? 'static' : 'animated';
}
