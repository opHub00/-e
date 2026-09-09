import type {
  BenchmarkDimensionStatus,
  BenchmarkSource,
  PeerBenchmarkResult,
} from './domain.ts';

export type BenchmarkExplanationDimension = {
  id: string;
  title: string;
  status: BenchmarkDimensionStatus;
  detail: string;
  source: BenchmarkSource;
};

export type BenchmarkExplanationContext = {
  feature: 'peer_preparation_benchmark_v1';
  summary: string;
  dimensions: BenchmarkExplanationDimension[];
  missingData: string[];
  actions: string[];
  officialSource: {
    institution: string;
    checkedAt: string;
    dataRange: string;
    limitation: string;
  };
  disclaimer: string;
};

const CONTEXT_KEYS = [
  'feature',
  'summary',
  'dimensions',
  'missingData',
  'actions',
  'officialSource',
  'disclaimer',
] as const;
const DIMENSION_KEYS = ['id', 'title', 'status', 'detail', 'source'] as const;
const OFFICIAL_KEYS = ['institution', 'checkedAt', 'dataRange', 'limitation'] as const;
const STATUSES: BenchmarkDimensionStatus[] = [
  'well-prepared',
  'checking',
  'information-needed',
  'listing-confirmation',
];
const SOURCES: BenchmarkSource[] = ['official', 'wanpane-reference', 'profile'];

/** Raw ApplicantProfile 대신 화면에 확정 표시된 비교 결과만 허용 목록으로 복사한다. */
export function buildBenchmarkExplanationContext(
  result: PeerBenchmarkResult,
): BenchmarkExplanationContext {
  return {
    feature: 'peer_preparation_benchmark_v1',
    summary: result.summary,
    dimensions: result.comparison.dimensions.map(({ id, title, status, detail, source }) => ({
      id,
      title,
      status,
      detail,
      source,
    })),
    missingData: [...result.comparison.missingData],
    actions: result.comparison.actions.slice(0, 4).map((action) => action.label),
    officialSource: {
      institution: result.officialMetadata.institution,
      checkedAt: result.officialMetadata.checkedAt,
      dataRange: result.officialMetadata.dataRange,
      limitation: result.official.dimensions[0].detail,
    },
    disclaimer: result.disclaimer,
  };
}

export function formatBenchmarkExplanationContext(context: BenchmarkExplanationContext): string {
  return JSON.stringify(context);
}

export function parseBenchmarkExplanationContext(
  value: string | undefined,
): BenchmarkExplanationContext | null {
  if (!value || value.length > 12_000) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return isBenchmarkExplanationContext(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function isBenchmarkExplanationContext(
  value: unknown,
): value is BenchmarkExplanationContext {
  if (!isRecord(value) || hasUnexpectedKeys(value, CONTEXT_KEYS)) return false;
  if (value.feature !== 'peer_preparation_benchmark_v1') return false;
  if (!isShortString(value.summary, 300) || !isShortString(value.disclaimer, 500)) return false;
  if (!Array.isArray(value.dimensions) || value.dimensions.length !== 8) return false;
  if (!value.dimensions.every(isDimension)) return false;
  if (!isShortStringArray(value.missingData, 8, 80)) return false;
  if (!isShortStringArray(value.actions, 4, 100)) return false;
  if (!isOfficialSource(value.officialSource)) return false;
  return true;
}

/** 평균·확률·새 점수·새 자격 판정을 만들면 deterministic fallback으로 교체한다. */
export function isSafeBenchmarkExplanation(
  explanation: string,
  context: BenchmarkExplanationContext,
): boolean {
  const text = explanation.trim();
  if (!text || text.length > 2_000) return false;
  if (/\d+(?:\.\d+)?\s*(?:%|점)/.test(text)) return false;
  if (/(?:20|30|40|50|60)대|또래|당첨자/.test(text) && /평균|상위|하위|순위/.test(text)) return false;
  if (/당첨\s*(?:확률|가능성)|합격\s*확률|승산|커트라인/.test(text)) return false;
  if (/(?:신청|청약)\s*(?:자격|가능 여부).*(?:확정|충족|가능)|자격이\s*(?:됩니다|있습니다)/.test(text)) return false;
  if (/미입력|정보\s*부족/.test(text) && /낮은\s*점수|감점|뒤처/.test(text)) return false;
  if (context.missingData.length > 0 && /모든\s*(?:정보|준비).*(?:완료|충분)/.test(text)) return false;
  return true;
}

export function buildBenchmarkExplanationFallback(
  context: BenchmarkExplanationContext,
): string {
  const prepared = context.dimensions.find((item) => item.status === 'well-prepared');
  const needed = context.dimensions.find((item) => item.status === 'information-needed');
  const action = context.actions[0];
  return [
    context.summary,
    prepared ? `${prepared.title}: ${prepared.detail}` : null,
    needed ? `${needed.title}: ${needed.detail}` : null,
    action ? `다음에는 ${action}부터 해보세요.` : '다음에는 공고별 확인 항목을 살펴보세요.',
    context.disclaimer,
  ].filter((line): line is string => Boolean(line)).join(' ');
}

function isDimension(value: unknown): value is BenchmarkExplanationDimension {
  if (!isRecord(value) || hasUnexpectedKeys(value, DIMENSION_KEYS)) return false;
  return isShortString(value.id, 60)
    && isShortString(value.title, 80)
    && STATUSES.includes(value.status as BenchmarkDimensionStatus)
    && isShortString(value.detail, 500)
    && SOURCES.includes(value.source as BenchmarkSource);
}

function isOfficialSource(value: unknown): value is BenchmarkExplanationContext['officialSource'] {
  if (!isRecord(value) || hasUnexpectedKeys(value, OFFICIAL_KEYS)) return false;
  return isShortString(value.institution, 80)
    && /^\d{4}-\d{2}-\d{2}$/.test(String(value.checkedAt))
    && isShortString(value.dataRange, 200)
    && isShortString(value.limitation, 500);
}

function isShortStringArray(value: unknown, maxItems: number, maxLength: number): value is string[] {
  return Array.isArray(value)
    && value.length <= maxItems
    && value.every((item) => isShortString(item, maxLength));
}

function isShortString(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= max;
}

function hasUnexpectedKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).some((key) => !allowed.includes(key));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
