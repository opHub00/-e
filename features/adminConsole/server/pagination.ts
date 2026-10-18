import type { ConsoleAiEvent, ConsoleAuditEntry, ConsoleNotice, ConsoleSnapshot } from '../contract.ts';

export type ConsoleCollection = 'ai' | 'audit' | 'notices';
export type ConsolePageQuery = { collection: ConsoleCollection; cursor?: string; limit?: number; filter?: string; search?: string };
export type ConsolePage<T> = { items: T[]; total: number; nextCursor: string | null };

const includes = (text: string, search: string) => text.toLocaleLowerCase().includes(search.toLocaleLowerCase());
export function parseConsolePageQuery(raw: Record<string, unknown>): ConsolePageQuery | null {
  if (!['ai', 'audit', 'notices'].includes(String(raw.collection))) return null;
  const cursor = raw.cursor === undefined ? '0' : String(raw.cursor);
  const limit = raw.limit === undefined ? 25 : Number(raw.limit);
  const filter = raw.filter === undefined ? '' : String(raw.filter);
  const search = raw.search === undefined ? '' : String(raw.search).trim();
  if (!/^(0|[1-9]\d{0,5})$/.test(cursor) || !Number.isInteger(limit) || limit < 1 || limit > 100 || filter.length > 50 || search.length > 100) return null;
  return { collection: raw.collection as ConsoleCollection, cursor, limit, filter, search };
}

export function pageConsoleSnapshot(snapshot: ConsoleSnapshot, query: ConsolePageQuery): ConsolePage<ConsoleAiEvent | ConsoleAuditEntry | ConsoleNotice> {
  const offset = Number(query.cursor ?? '0'), limit = query.limit ?? 25, search = query.search ?? '', filter = query.filter ?? '';
  let rows: Array<ConsoleAiEvent | ConsoleAuditEntry | ConsoleNotice>;
  if (query.collection === 'ai') rows = snapshot.ai.filter(item =>
    (!filter || filter === 'all' || (filter === 'grounding' ? item.groundingRejected : filter === 'provider' ? item.providerError : filter === 'timeout' ? item.fallbackReason === 'timeout' : item.mode === filter))
    && (!search || includes(`${item.question} ${item.fallbackReason ?? ''} ${item.provider ?? ''}`, search)));
  else if (query.collection === 'audit') rows = snapshot.audit.filter(item =>
    (!filter || filter === 'ALL' || item.entity.type === filter)
    && (!search || includes(`${item.actor} ${item.action} ${item.entity.label}`, search)));
  else rows = snapshot.notices.filter(item =>
    (!filter || filter === 'ALL' || item.status === filter)
    && (!search || includes(`${item.title} ${item.region} ${item.id}`, search)));
  const time = (item: ConsoleAiEvent | ConsoleAuditEntry | ConsoleNotice) => 'at' in item ? item.at : item.updatedAt;
  rows.sort((a, b) => time(b).localeCompare(time(a)));
  const next = offset + limit;
  return { items: rows.slice(offset, next), total: rows.length, nextCursor: next < rows.length ? String(next) : null };
}
