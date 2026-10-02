import { decodeRuleSet } from '../../../features/applicationAssessment/data/ruleCodec.ts';
import {
  DEFAULT_PORTFOLIO_LIMIT,
  aggregateMissingProfileFacts,
  freshnessForResult,
  mapWithConcurrency,
  portfolioItemFromResult,
  selectPortfolioCandidates,
  summarizeFreshness,
  type PortfolioCandidate,
  type PortfolioCandidateSource,
} from '../../../features/applicationAssessment/portfolioOrchestration.ts';
import type { AssessmentPortfolioItem, AssessmentPortfolioSnapshot } from '../../../features/applicationAssessment/portfolioContract.ts';
import type { PersistedUserAssessmentResult } from '../../../features/applicationAssessment/resultPersistence.ts';
import {
  executeTrustedAssessment,
  USER_CENTRIC_ASSESSMENT_ENGINE_VERSION,
} from '../../../features/applicationAssessment/serverExecution.ts';
import type { SupplyType } from '../../../features/applicationAssessment/types.ts';
import type { ApplicantProfileV3 } from '../../../features/profile/v3.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});
const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

type Environment = { url: string; anonKey: string; serviceKey: string };
type ProfileRow = { revision: number; profile_json: ApplicantProfileV3 };
type RuleSetRow = {
  id: string; announcement_id: string; document_id: string | null; version: string;
  config: { supplies?: Array<{ type?: string }> };
};
type AnnouncementRow = { id: string; title: string; region_name: string | null; announcement_date: string | null };
type BindingRow = { listing_id: string; announcement_id: string; bound_rule_set_id: string | null };

function projectRef(url: string): string | null {
  try { return new URL(url).hostname.match(/^([a-z0-9]+)\.supabase\.co$/)?.[1] ?? null; }
  catch { return null; }
}

function environment(): Environment {
  const url = Deno.env.get('SUPABASE_URL')?.replace(/\/$/, '') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const actual = projectRef(url);
  const staging = Deno.env.get('WANPANE_STAGING_PROJECT_REF')?.trim().toLowerCase();
  const production = Deno.env.get('WANPANE_PRODUCTION_PROJECT_REF')?.trim().toLowerCase();
  if (Deno.env.get('WANPANE_ENV')?.trim().toLowerCase() !== 'staging'
      || !actual || !staging || actual !== staging || !production || actual === production
      || Deno.env.get('WANPANE_USER_CENTRIC_PROFILE_V3') !== 'true'
      || Deno.env.get('WANPANE_USER_CENTRIC_ASSESSMENT_RESULTS') !== 'true'
      || Deno.env.get('WANPANE_USER_CENTRIC_PORTFOLIO') !== 'true') {
    throw new Error('USER_CENTRIC_PORTFOLIO_DISABLED');
  }
  if (!anonKey || !serviceKey) throw new Error('USER_CENTRIC_SERVER_CONFIGURATION_MISSING');
  return { url, anonKey, serviceKey };
}

async function serviceFetch<T>(env: Environment, path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${env.url}${path}`, {
    ...init,
    headers: { apikey: env.serviceKey, Authorization: `Bearer ${env.serviceKey}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
  if (!response.ok) throw new Error('PORTFOLIO_SERVER_OPERATION_FAILED');
  const text = await response.text();
  return (text ? JSON.parse(text) : null) as T;
}

async function authenticatedUser(env: Environment, authorization: string | null): Promise<string> {
  if (!authorization?.startsWith('Bearer ')) throw new Error('AUTH_REQUIRED');
  const response = await fetch(`${env.url}/auth/v1/user`, { headers: { apikey: env.anonKey, Authorization: authorization } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !isRecord(payload) || typeof payload.id !== 'string') throw new Error('AUTH_REQUIRED');
  return payload.id;
}

function resultFromRow(row: Record<string, unknown>): PersistedUserAssessmentResult {
  if (!isRecord(row.result_snapshot)) throw new Error('INVALID_RESULT_ROW');
  return {
    ...(row.result_snapshot as unknown as PersistedUserAssessmentResult),
    id: String(row.id),
    calculatedAt: String(row.calculated_at),
    stale: row.stale_at && row.stale_reason
      ? { isStale: true, reason: row.stale_reason as PersistedUserAssessmentResult['stale']['reason'], detectedAt: String(row.stale_at) }
      : { isStale: false },
  };
}

function emptyItem(candidate: PortfolioCandidate, profileRevision: number, code: string): AssessmentPortfolioItem {
  return {
    listingId: candidate.listing.listingId,
    announcementId: candidate.listing.announcementId,
    supplyType: candidate.supplyType,
    listing: candidate.listing,
    priority: candidate.priority,
    analysisStatus: 'UNAVAILABLE', eligibilityStatus: null, scoringStatus: 'UNAVAILABLE',
    score: null, scoreMax: null, stage: null, missingUserFields: [], missingAnnouncementFields: [],
    freshness: 'FRESH', calculatedAt: null, failureCode: code,
    provenance: {
      resultId: null, ruleSetId: candidate.ruleSetId, ruleSetVersion: candidate.ruleSetVersion,
      sourceDocumentId: null, sourceDocumentHash: candidate.sourceDocumentHash,
      profileRevision, engineVersion: USER_CENTRIC_ASSESSMENT_ENGINE_VERSION,
    },
  };
}

async function candidateSources(env: Environment, userId: string, profile: ApplicantProfileV3) {
  const [savedRows, ruleSets, announcements, bindings, documents] = await Promise.all([
    serviceFetch<Array<{ listing_id: string }>>(env, `/rest/v1/saved_listings?select=listing_id&user_id=eq.${userId}`),
    serviceFetch<RuleSetRow[]>(env, '/rest/v1/assessment_rule_sets?select=id,announcement_id,document_id,version,config&is_active=eq.true&is_public=eq.true&approved_at=not.is.null'),
    serviceFetch<AnnouncementRow[]>(env, '/rest/v1/announcements?select=id,title,region_name,announcement_date&status=eq.PUBLISHED'),
    serviceFetch<BindingRow[]>(env, '/rest/v1/announcement_listing_bindings?select=listing_id,announcement_id,bound_rule_set_id'),
    serviceFetch<Array<{ id: string; sha256: string }>>(env, '/rest/v1/announcement_documents?select=id,sha256'),
  ]);
  const announcementById = new Map(announcements.map(row => [row.id, row]));
  const documentById = new Map(documents.map(row => [row.id, row.sha256]));
  const candidates: PortfolioCandidateSource[] = [];
  for (const set of ruleSets) {
    const announcement = announcementById.get(set.announcement_id);
    if (!announcement) continue;
    const setBindings = bindings.filter(binding => binding.announcement_id === set.announcement_id
      && (!binding.bound_rule_set_id || binding.bound_rule_set_id === set.id));
    const listingIds = setBindings.length ? setBindings.map(binding => binding.listing_id) : [`announcement:${set.announcement_id}`];
    for (const listingId of listingIds) for (const supply of set.config.supplies ?? []) {
      if (!['youth', 'newlywed', 'firstHome'].includes(supply.type ?? '')) continue;
      candidates.push({
        listing: {
          listingId, announcementId: announcement.id, title: announcement.title,
          region: announcement.region_name, announcementDate: announcement.announcement_date,
        },
        supplyType: supply.type as SupplyType,
        ruleSetId: set.id,
        ruleSetVersion: set.version,
        sourceDocumentHash: set.document_id ? documentById.get(set.document_id) ?? null : null,
      });
    }
  }
  return selectPortfolioCandidates({
    candidates,
    savedListingIds: savedRows.map(row => row.listing_id),
    preferredRegions: profile.preferences.regions,
    limit: DEFAULT_PORTFOLIO_LIMIT,
  });
}

async function buildPortfolio(input: {
  env: Environment; userId: string; profileRow: ProfileRow; action: 'get' | 'refresh';
}): Promise<{ portfolio: AssessmentPortfolioSnapshot; refresh: { considered: number; reused: number; recalculated: number; failed: number } }> {
  const selection = await candidateSources(input.env, input.userId, input.profileRow.profile_json);
  const rows = await serviceFetch<Record<string, unknown>[]>(input.env,
    `/rest/v1/user_assessment_results?select=id,result_snapshot,calculated_at,stale_at,stale_reason&user_id=eq.${input.userId}&superseded_at=is.null&order=calculated_at.desc`);
  const results = rows.map(resultFromRow);
  let reused = 0, recalculated = 0, failed = 0;
  const settled = await mapWithConcurrency(selection.candidates, 2, async candidate => {
    const current = {
      profileRevision: input.profileRow.revision,
      ruleSetId: candidate.ruleSetId,
      ruleSetVersion: candidate.ruleSetVersion,
      sourceDocumentHash: candidate.sourceDocumentHash,
      engineVersion: USER_CENTRIC_ASSESSMENT_ENGINE_VERSION,
    };
    const prior = results.find(result => result.listingId === candidate.listing.listingId && result.supplyType === candidate.supplyType);
    const freshness = prior ? freshnessForResult(prior, current) : null;
    if (prior && freshness === 'FRESH') {
      reused += 1;
      return portfolioItemFromResult({ candidate, result: prior, freshness });
    }
    if (input.action === 'get') return prior
      ? portfolioItemFromResult({ candidate, result: prior, freshness: freshness ?? 'FRESH' })
      : emptyItem(candidate, input.profileRow.revision, 'NOT_CALCULATED');

    const rulePayload = await serviceFetch<unknown>(input.env, '/rest/v1/rpc/read_assessment_rule_set', {
      method: 'POST', body: JSON.stringify(candidate.listing.listingId.startsWith('announcement:')
        ? { p_announcement_id: candidate.listing.announcementId, p_listing_id: null }
        : { p_announcement_id: null, p_listing_id: candidate.listing.listingId }),
    });
    const decoded = decodeRuleSet(rulePayload, candidate.listing.listingId.startsWith('announcement:')
      ? { announcementId: candidate.listing.announcementId }
      : { listingId: candidate.listing.listingId });
    if (decoded.status !== 'AVAILABLE') throw new Error(decoded.status);
    const result = await executeTrustedAssessment({
      userId: input.userId,
      announcementId: candidate.listing.announcementId,
      profileRevision: input.profileRow.revision,
      profile: input.profileRow.profile_json,
      rules: decoded.rules,
      supplyType: candidate.supplyType,
      announcementDetails: {},
      sourceDocumentHash: candidate.sourceDocumentHash,
    });
    const saved = await serviceFetch<Record<string, unknown>>(input.env, '/rest/v1/rpc/save_user_assessment_result_server', {
      method: 'POST', body: JSON.stringify({ p_user_id: input.userId, p_result: result }),
    });
    recalculated += 1;
    return portfolioItemFromResult({ candidate, result: resultFromRow(saved), freshness: 'FRESH' });
  });
  const items = settled.map((outcome, index) => {
    if (outcome.status === 'fulfilled') return outcome.value;
    failed += 1;
    const reason = outcome.reason instanceof Error ? outcome.reason.message : 'PORTFOLIO_ITEM_FAILED';
    return emptyItem(selection.candidates[index], input.profileRow.revision, reason);
  });
  const portfolio: AssessmentPortfolioSnapshot = {
    userId: input.userId,
    profileRevision: input.profileRow.revision,
    generatedAt: new Date().toISOString(),
    limit: DEFAULT_PORTFOLIO_LIMIT,
    truncated: selection.truncated,
    items,
    missingProfileFacts: aggregateMissingProfileFacts(items),
    freshness: summarizeFreshness(items),
  };
  return { portfolio, refresh: { considered: items.length, reused, recalculated, failed } };
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (request.method !== 'POST') return json({ code: 'METHOD_NOT_ALLOWED' }, 405);
  try {
    const env = environment();
    const userId = await authenticatedUser(env, request.headers.get('authorization'));
    const body = await request.json().catch(() => ({}));
    const action = isRecord(body) && (body.action === 'get' || body.action === 'refresh') ? body.action : null;
    if (!action) return json({ code: 'INVALID_REQUEST' }, 400);
    const profiles = await serviceFetch<ProfileRow[]>(env,
      `/rest/v1/applicant_profiles_v3?select=revision,profile_json&user_id=eq.${userId}&limit=1`);
    if (!profiles[0]) return json({ code: 'PROFILE_V3_REQUIRED' }, 409);
    const response = await buildPortfolio({ env, userId, profileRow: profiles[0], action });
    return json(action === 'get' ? response.portfolio : response);
  } catch (error) {
    const code = error instanceof Error ? error.message : 'UNEXPECTED_ERROR';
    if (code === 'AUTH_REQUIRED') return json({ code }, 401);
    if (code === 'USER_CENTRIC_PORTFOLIO_DISABLED') return json({ code }, 404);
    console.error('user-assessment-portfolio failed', { code });
    return json({ code: 'PORTFOLIO_SERVER_FAILED' }, 500);
  }
});
