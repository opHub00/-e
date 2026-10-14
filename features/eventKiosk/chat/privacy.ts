import {
  EVENT_CHAT_MAX_HISTORY_CHARS,
  EVENT_CHAT_MAX_HISTORY_TURNS,
  EVENT_CHAT_MAX_QUESTION_CHARS,
  type EventChatHistoryTurn,
} from './contract.ts';

const HTML = /<\/?[a-z][^>]*>/gi;
const SCRIPT_PROTOCOL = /(?:javascript|data)\s*:/gi;
const RESIDENT_NUMBER = /\b\d{6}\s*[- ]?\s*[1-4]\d{6}\b/g;
const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE = /\b(?:01[016789]|0\d{1,2})[- .]?\d{3,4}[- .]?\d{4}\b/g;
const ISO_DATE = /\b(?:19|20)\d{2}[-/.](?:0?[1-9]|1[0-2])[-/.](?:0?[1-9]|[12]\d|3[01])\b/g;
const MONEY = /(?:\b\d[\d,]{4,}|\b\d+(?:\.\d+)?\s*(?:만|억))\s*원/g;

export function stripMarkup(value: string): string {
  return value.replace(HTML, '').replace(SCRIPT_PROTOCOL, '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** User-authored chat text is redacted before it crosses the browser/server boundary. */
export function redactEventChatText(value: string): string {
  return stripMarkup(value)
    .replace(RESIDENT_NUMBER, '[주민등록번호 삭제]')
    .replace(EMAIL, '[이메일 삭제]')
    .replace(PHONE, '[연락처 삭제]')
    .replace(ISO_DATE, '[정확한 날짜 삭제]')
    .replace(MONEY, '[정확한 금액 삭제]')
    .slice(0, EVENT_CHAT_MAX_QUESTION_CHARS);
}

export function boundedEventChatHistory(turns: readonly EventChatHistoryTurn[]): EventChatHistoryTurn[] {
  const result: EventChatHistoryTurn[] = [];
  let chars = 0;
  for (const turn of turns.slice(-EVENT_CHAT_MAX_HISTORY_TURNS).reverse()) {
    if (turn.role !== 'user' && turn.role !== 'assistant') continue;
    const text = redactEventChatText(turn.text);
    if (!text) continue;
    const remaining = EVENT_CHAT_MAX_HISTORY_CHARS - chars;
    if (remaining <= 0) break;
    result.push({ role: turn.role, text: text.slice(0, remaining) });
    chars += Math.min(text.length, remaining);
  }
  return result.reverse();
}

export function containsDirectIdentifier(value: string): boolean {
  return [RESIDENT_NUMBER, EMAIL, PHONE, ISO_DATE, MONEY].some(pattern => {
    pattern.lastIndex = 0;
    return pattern.test(value);
  });
}
