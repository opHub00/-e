import { useCallback, useEffect, useRef, useState } from 'react';
import type { UserProfile } from '../../domain/types';
import { rankNewsForBriefing } from './quality';
import type { RankedNews } from './quality';
import type { NewsDataset } from './data/NewsProvider';

export type { RankedNews } from './quality';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const REQUEST_TIMEOUT_MS = 15_000;

export type NewsBriefingState =
  | { status: 'loading' }
  | { status: 'unconfigured' }
  | { status: 'error'; message: string }
  | {
      status: 'ready';
      /** 최신 뉴스를 못 받아 큐레이션 fixture 로 대체된 상태. 실시간처럼 표현하면 안 된다. */
      isFallback: boolean;
      fetchedAt: string;
      ranked: RankedNews[];
    };

export function useNewsBriefing(profile: UserProfile, limit = 4) {
  const [state, setState] = useState<NewsBriefingState>({ status: 'loading' });
  const mounted = useRef(true);

  const load = useCallback(async () => {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      setState({ status: 'unconfigured' });
      return;
    }

    setState({ status: 'loading' });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/news`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          apikey: SUPABASE_ANON_KEY,
        },
        signal: controller.signal,
      });
      const data = (await res.json()) as NewsDataset & { error?: string };
      if (!res.ok || !Array.isArray(data.articles)) {
        throw new Error(data.error ?? '뉴스를 불러오지 못했어요.');
      }
      if (!mounted.current) return;
      setState({
        status: 'ready',
        isFallback: Boolean(data.isFallback),
        fetchedAt: data.fetchedAt,
        ranked: rankNewsForBriefing(profile, data.articles).slice(0, limit),
      });
    } catch (error) {
      if (!mounted.current) return;
      const aborted = controller.signal.aborted;
      setState({
        status: 'error',
        message: aborted
          ? '응답이 늦어지고 있어요.'
          : error instanceof Error
            ? error.message
            : '뉴스를 불러오지 못했어요.',
      });
    } finally {
      clearTimeout(timer);
    }
  }, [limit, profile]);

  useEffect(() => {
    mounted.current = true;
    void load();
    return () => {
      mounted.current = false;
    };
  }, [load]);

  return { state, reload: load };
}
