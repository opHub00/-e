import type { ConsoleAssessmentStats, ConsoleAuditEntry, ConsoleNotice, ConsoleRule, ConsoleSnapshot } from '../contract.ts';
import { resolveProductV3StagingTarget, sanitizeUnresolvedCategory, type ProductV3StagingTarget } from '../../productV3/admin/stagingTarget.ts';
import { buildMetricTrend, type MetricWindowQuery } from './metrics.ts';

type Row = Record<string, unknown>;
type Table = 'announcements' | 'announcement_documents' | 'assessment_rule_sets' | 'assessment_rules' |
  'rule_evidence' | 'assessment_rule_review_versions' | 'assessment_rule_reviews' |
  'product_v3_ai_monitoring' | 'product_v3_assessment_monitoring' | 'product_v3_assessment_events' | 'product_v3_admin_audit_log';

const selections: Record<Table, string> = {
  announcements: 'id,title,region_name,announcement_date,status,updated_at,source_url',
  announcement_documents: 'id,announcement_id,file_name,sha256,is_official,source_url,created_at',
  assessment_rule_sets: 'id,announcement_id,version,is_active,approved_at,source_status,document_id',
  assessment_rules: 'id,rule_set_id,supply_type,category,rule_key',
  rule_evidence: 'rule_id,section,text_excerpt,locator,evidence_label',
  assessment_rule_review_versions: 'rule_set_id,lifecycle_status',
  assessment_rule_reviews: 'rule_set_id,materialized_rule_id,review_status',
  product_v3_ai_monitoring: 'request_id,created_at,resolver,mode,provider,rag_evidence_count,grounding_result,fallback_reason,latency_ms',
  product_v3_assessment_monitoring: 'created_at,complete_count,needs_user_input_count,ineligible_count,unavailable_count,unresolved_labels',
  product_v3_assessment_events: 'request_id,created_at,notice_id,supply_type,status,unresolved_categories,evidence_complete,rule_package_version,source_status',
  product_v3_admin_audit_log: 'id,actor_id,action,entity,entity_id,before_snapshot,after_snapshot,created_at',
};

const string = (value: unknown): string => typeof value === 'string' ? value : '';
const number = (value: unknown): number => typeof value === 'number' && Number.isFinite(value) ? value : 0;
const rowsOf = (value: unknown): Row[] => {
  if (!Array.isArray(value) || value.some(row => !row || typeof row !== 'object' || Array.isArray(row))) throw new Error('PRODUCT_V3_STAGING_RESPONSE_INVALID');
  return value as Row[];
};
const emptyStats = (day: string): ConsoleAssessmentStats => ({ date: day, byStatus: { COMPLETE: 0, NEEDS_USER_INPUT: 0, INELIGIBLE: 0, UNAVAILABLE: 0 }, blockers: [] });

/** Reads only named columns; no entire profile, token, or rule config reaches this transport. */
async function readTable(target: ProductV3StagingTarget, table: Table, fetcher: typeof fetch): Promise<Row[]> {
  const all: Row[] = [];
  for (let offset = 0; offset < 5000; offset += 500) {
    const url = new URL(`/rest/v1/${table}`, target.url);
    url.searchParams.set('select', selections[table]);
    url.searchParams.set('limit', '500');
    url.searchParams.set('offset', String(offset));
    const response = await fetcher(url, {
      headers: { apikey: target.serviceRoleKey, authorization: `Bearer ${target.serviceRoleKey}` },
      cache: 'no-store', signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) throw new Error(`PRODUCT_V3_STAGING_READ_FAILED:${table}:${response.status}`);
    const page = rowsOf(await response.json());
    all.push(...page);
    if (page.length < 500) return all;
  }
  throw new Error(`PRODUCT_V3_STAGING_PAGE_LIMIT:${table}`);
}

const auditFields = (value: unknown): ConsoleAuditEntry['before'] => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Row;
  return Object.fromEntries(['id', 'status', 'version', 'sourceHash', 'updatedAt']
    .filter(key => ['string', 'number', 'boolean'].includes(typeof row[key]) || row[key] === null)
    .map(key => [key, row[key] as string | number | boolean | null]));
};

export async function loadProductV3StagingSnapshot(
  env: Record<string, string | undefined>,
  fetcher: typeof fetch = fetch,
  now: () => string = () => new Date().toISOString(),
  metricWindow?: MetricWindowQuery,
): Promise<ConsoleSnapshot> {
  const target = resolveProductV3StagingTarget(env);
  const tables = Object.keys(selections) as Table[];
  const values = await Promise.all(tables.map(table => readTable(target, table, fetcher)));
  const data = Object.fromEntries(tables.map((table, index) => [table, values[index]])) as Record<Table, Row[]>;
  const documents = new Map<string, Row>();
  for (const document of data.announcement_documents) {
    const id = string(document.announcement_id);
    if (document.is_official === true || !documents.has(id)) documents.set(id, document);
  }
  const packages = new Map<string, Row[]>();
  for (const pkg of data.assessment_rule_sets) {
    const id = string(pkg.announcement_id);
    packages.set(id, [...(packages.get(id) ?? []), pkg]);
  }
  const evidence = new Map<string, Row>();
  for (const item of data.rule_evidence) if (!evidence.has(string(item.rule_id))) evidence.set(string(item.rule_id), item);
  const reviews = new Map<string, Row>();
  for (const item of data.assessment_rule_reviews) if (item.materialized_rule_id) reviews.set(string(item.materialized_rule_id), item);
  const reviewVersions = new Map(data.assessment_rule_review_versions.map(item => [string(item.rule_set_id), item]));
  const rules: ConsoleRule[] = data.assessment_rules.flatMap(rule => {
    const pkg = data.assessment_rule_sets.find(item => item.id === rule.rule_set_id);
    if (!pkg) return [];
    const source = evidence.get(string(rule.id));
    const reviewed = reviews.get(string(rule.id));
    const approved = pkg.is_active === true || !!pkg.approved_at || ['APPROVED', 'APPROVED_WITH_EDIT'].includes(string(reviewed?.review_status));
    const hasEvidence = !!source?.text_excerpt && !!source?.locator;
    return [{ id: string(rule.id), noticeId: string(pkg.announcement_id), ruleType: string(rule.category), supplyType: string(rule.supply_type),
      condition: string(source?.evidence_label) || string(rule.rule_key), value: '',
      evidence: { section: string(source?.section), excerpt: string(source?.text_excerpt) || '근거 문장 확인 필요', locator: source?.locator ? JSON.stringify(source.locator) : 'locator 없음' },
      validation: hasEvidence ? { status: 'PASS' as const, messages: [] } : { status: 'WARN' as const, messages: ['원문 근거 확인 필요'] },
      status: approved ? 'APPROVED' as const : reviewed?.review_status === 'REJECTED' ? 'REJECTED' as const : 'PENDING' as const }];
  });
  const audit: ConsoleAuditEntry[] = data.product_v3_admin_audit_log.map(item => ({
    id: string(item.id), at: string(item.created_at), actor: string(item.actor_id), action: string(item.action),
    entity: { type: string(item.entity) === 'NOTICE' ? 'NOTICE' : 'RULE_PACKAGE', id: string(item.entity_id), label: string(item.entity_id) },
    before: auditFields(item.before_snapshot), after: auditFields(item.after_snapshot),
  }));
  const notices: ConsoleNotice[] = data.announcements.map(item => {
    const id = string(item.id), document = documents.get(id), allPackages = packages.get(id) ?? [];
    const active = allPackages.find(pkg => pkg.is_active === true);
    const current = active ?? allPackages.find(pkg => !!pkg.approved_at) ?? allPackages[0];
    const state = string(item.status);
    const status: ConsoleNotice['status'] = state === 'ARCHIVED' ? 'ARCHIVED' : state === 'DRAFT' ? 'DRAFT'
      : active ? 'ACTIVE' : current && reviewVersions.get(string(current.id))?.lifecycle_status === 'REVALIDATION_REQUIRED' ? 'REVIEW_REQUIRED'
        : current?.approved_at ? 'APPROVED' : current ? 'REVIEW_REQUIRED' : document?.is_official === true ? 'SOURCE_VERIFIED' : 'REVIEW_REQUIRED';
    const currentRuleIds = new Set(data.assessment_rules.filter(rule => rule.rule_set_id === current?.id).map(rule => string(rule.id)));
    const relatedRules = rules.filter(rule => currentRuleIds.has(rule.id));
    return { id, title: string(item.title), region: string(item.region_name), announcementDate: string(item.announcement_date), status,
      ruleVersion: current ? string(current.version) : null, ragVersion: null,
      provenance: { fileName: string(document?.file_name), sha256: string(document?.sha256), official: document?.is_official === true, sourceUrl: string(document?.source_url) || string(item.source_url) || null },
      updatedAt: string(item.updated_at), supplyTypes: [...new Set(relatedRules.map(rule => rule.supplyType))], ruleCount: relatedRules.length,
      ragChunkCount: 0,
      validation: document?.is_official === true && !!current && relatedRules.length > 0 && relatedRules.every(rule => rule.validation.status === 'PASS')
        ? { status: 'PASS', messages: [] } : { status: 'WARN', messages: ['공고문 또는 규칙 근거 확인 필요'] },
      history: audit.filter(entry => entry.entity.id === id).map(entry => ({ at: entry.at, actor: entry.actor, summary: entry.action })),
    };
  });
  const generatedAt = now();
  const assessments = emptyStats(generatedAt.slice(0, 10));
  const frequency = new Map<string, number>();
  for (const item of data.product_v3_assessment_events) {
    if (!string(item.created_at).startsWith(assessments.date)) continue;
    const status = string(item.status) as keyof typeof assessments.byStatus;
    if (status in assessments.byStatus) assessments.byStatus[status] += 1;
    for (const label of new Set(Array.isArray(item.unresolved_categories) ? item.unresolved_categories : [])) {
      const safe = sanitizeUnresolvedCategory(label);
      frequency.set(safe, (frequency.get(safe) ?? 0) + 1);
    }
  }
  assessments.blockers = [...frequency].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'ko'));
  return { generatedAt, notices, rules, assessments,
    ...(metricWindow ? { trend: buildMetricTrend(
      data.product_v3_assessment_events.map(row => ({ created_at: row.created_at, status: row.status })),
      data.product_v3_ai_monitoring.map(row => ({ created_at: row.created_at, mode: row.mode })), metricWindow) } : {}),
    ai: data.product_v3_ai_monitoring.map(item => ({ id: string(item.request_id), at: string(item.created_at), question: `질문 분류: ${/^[A-Z_]{2,40}$/.test(string(item.resolver)) ? string(item.resolver) : 'OTHER'}`,
      mode: item.mode === 'llm' ? 'llm' : item.mode === 'fallback' ? 'fallback' : 'deterministic', provider: string(item.provider) || null,
      fallbackReason: string(item.fallback_reason) || null, groundingRejected: item.grounding_result === 'REJECTED',
      providerError: item.fallback_reason === 'provider_error' || item.fallback_reason === 'timeout', evidenceCount: number(item.rag_evidence_count),
      latencyMs: number(item.latency_ms), evidence: [] })), audit,
    errors: notices.length ? [{ at: generatedAt, source: 'RAG 메타데이터', message: '이 Staging schema에는 RAG 버전과 청크 수가 저장되지 않아 표시할 수 없어요.' }] : [] };
}
