import { useCallback, useEffect, useState } from 'react';
import { getSupabaseClient } from '../auth/supabaseClient';
import { buildLearningRows, type LearningRow } from '../adminLearningStatus/domain';
import { LearningStatusRepository, type LearningStatusClient } from '../adminLearningStatus/repository';

/**
 * 관리자 화면들이 함께 쓰는 공고 현황.
 *
 * 조회 경로는 기존 LearningStatusRepository 그대로다(읽기 전용 select + 읽기 RPC).
 * 대시보드와 공고 목록이 같은 결과를 쓰도록 한 곳에서 불러온다.
 */
export type LearningRowsState =
  | { phase: 'LOADING' }
  | { phase: 'READY'; rows: LearningRow[] }
  | { phase: 'FAILED'; code: string };

export function useLearningRows(enabled: boolean): LearningRowsState & { refresh: () => void } {
  const [state, setState] = useState<LearningRowsState>({ phase: 'LOADING' });
  const [attempt, setAttempt] = useState(0);

  const load = useCallback(async () => {
    const client = getSupabaseClient();
    if (!client) { setState({ phase: 'FAILED', code: 'REVIEW_CONNECTION_REQUIRED' }); return; }
    setState({ phase: 'LOADING' });
    const result = await new LearningStatusRepository(client as unknown as LearningStatusClient).load();
    setState(result.status === 'READY'
      ? { phase: 'READY', rows: buildLearningRows(result.input) }
      : { phase: 'FAILED', code: result.code });
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let current = true;
    void load().then(() => { if (!current) return; });
    return () => { current = false; };
  }, [enabled, attempt, load]);

  return { ...state, refresh: () => setAttempt(n => n + 1) };
}
