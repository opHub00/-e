import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ConsoleAiEvent, ConsoleAuditEntry, ConsoleNotice } from './contract';
import { useConsole } from './ConsoleShell';
import type { ConsoleCollection } from './server/pagination';

type Row = ConsoleAiEvent | ConsoleAuditEntry | ConsoleNotice;
type PageState<T> = { key: string; items: T[]; total: number; nextCursor: string | null; error: boolean };
const PAGE_SIZE = 25;

/** Demo uses the local fixture; connected mode fetches every visible page from the authorized server. */
export function useConsolePagedRows<T extends Row>(collection: ConsoleCollection, localRows: T[], filter: string, search: string) {
  const { mode, loadPage } = useConsole();
  const key = `${collection}|${filter}|${search}`;
  const [state, setState] = useState<PageState<T> | null>(null);
  const [demoLimit, setDemoLimit] = useState(PAGE_SIZE);
  const query = useMemo(() => ({ collection, filter, search, limit: PAGE_SIZE }), [collection, filter, search]);
  useEffect(() => {
    setDemoLimit(PAGE_SIZE);
    if (mode !== 'CONNECTED') return;
    let active = true;
    void loadPage(query).then(page => {
      if (active) setState({ key, items: page.items as T[], total: page.total, nextCursor: page.nextCursor, error: false });
    }).catch(() => {
      if (active) setState({ key, items: [], total: 0, nextCursor: null, error: true });
    });
    return () => { active = false; };
  }, [key, loadPage, mode, query]);
  const current = state?.key === key ? state : null;
  const rows = mode === 'DEMO' ? localRows.slice(0, demoLimit) : current?.items ?? localRows.slice(0, PAGE_SIZE);
  const total = mode === 'DEMO' ? localRows.length : current?.total ?? localRows.length;
  const more = useCallback(() => {
    if (mode === 'DEMO') { setDemoLimit(value => value + PAGE_SIZE); return; }
    if (!current?.nextCursor) return;
    void loadPage({ ...query, cursor: current.nextCursor }).then(page => setState(previous => previous?.key === key
      ? { key, items: [...previous.items, ...page.items as T[]], total: page.total, nextCursor: page.nextCursor, error: false } : previous));
  }, [current, key, loadPage, mode, query]);
  return { rows, total, more, error: current?.error ?? false };
}
