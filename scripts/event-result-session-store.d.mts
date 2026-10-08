import type { ResultSummary } from '../features/eventKiosk/summary.ts';

export const RESULT_SESSION_TTL_MS: number;
export const RESULT_SESSION_TOKEN_PATTERN: RegExp;
export function isOpaqueResultToken(value: unknown): value is string;
export function isValidResultSummary(value: unknown): value is ResultSummary;
