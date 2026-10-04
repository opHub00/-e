import { decodeRuleSet } from '../../../features/applicationAssessment/data/ruleCodec.ts';
import {
  executeTrustedAssessment,
  trustedAssessmentInputHash,
  USER_CENTRIC_ASSESSMENT_ENGINE_VERSION,
} from '../../../features/applicationAssessment/serverExecution.ts';
import type { AssessmentInput, SupplyType } from '../../../features/applicationAssessment/types.ts';
import { assessmentDetailsFromListingAnswers } from '../../../features/applicationAssessment/listingInputs.ts';
import type { ApplicantProfileV3 } from '../../../features/profile/v3.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});
const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const SUPPLIES = new Set<SupplyType>(['youth', 'newlywed', 'firstHome']);
const DETAIL_KEYS = new Set([
  'birthDate', 'firstMarriageDate', 'everMarried', 'accountKindEligible', 'firstRank',
  'isHouseholdHead', 'householdNoWinningFiveYears', 'incomeHouseholdSize',
  'plannedMarriageWithinDeadline', 'singleParentQualified', 'unmarriedChildInHousehold',
  'marriageDate', 'marriageDateLatest', 'familyCategory', 'spouse', 'children',
  'householdMembers', 'currentResidence', 'residenceStartDate', 'overseasStayHistory',
  'housingOwnershipHistory', 'housingDisposalDates', 'noHomeSince',
  'subscriptionAccountOpenedAt', 'recognizedPaymentCount', 'recognizedDepositAmount',
  'monthlyIncome', 'spouseIncome', 'householdIncome', 'dualIncome', 'earnedIncome',
  'businessIncome', 'totalAssets', 'parentAssets', 'realEstateAssets', 'vehicleValue',
  'workStartedAt', 'youthPriorityTarget', 'newlywedPriorityTarget', 'specialSupplyHistory',
  'reWinningRestriction', 'specialExceptions',
]);

type Environment = {
  url: string;
  anonKey: string;
  serviceKey: string;
};

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
      || Deno.env.get('WANPANE_USER_CENTRIC_ASSESSMENT_RESULTS') !== 'true') {
    throw new Error('USER_CENTRIC_STAGING_DISABLED');
  }
  if (!anonKey || !serviceKey) throw new Error('USER_CENTRIC_SERVER_CONFIGURATION_MISSING');
  return { url, anonKey, serviceKey };
}

async function serviceFetch<T>(env: Environment, path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${env.url}${path}`, {
    ...init,
    headers: {
      apikey: env.serviceKey,
      Authorization: `Bearer ${env.serviceKey}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    console.error('user-assessment service operation failed', {
      path: path.split('?')[0], status: response.status,
      code: isRecord(payload) && typeof payload.code === 'string' ? payload.code : 'UNKNOWN',
    });
    throw new Error('USER_CENTRIC_SERVER_OPERATION_FAILED');
  }
  return response.json() as Promise<T>;
}

async function authenticatedUser(env: Environment, authorization: string | null): Promise<string> {
  if (!authorization?.startsWith('Bearer ')) throw new Error('AUTH_REQUIRED');
  const response = await fetch(`${env.url}/auth/v1/user`, {
    headers: { apikey: env.anonKey, Authorization: authorization },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !isRecord(payload) || typeof payload.id !== 'string') throw new Error('AUTH_REQUIRED');
  return payload.id;
}

function parseRequest(value: unknown): {
  listingId: string;
  supplyType: SupplyType;
  announcementDetails: AssessmentInput['details'];
} {
  if (!isRecord(value) || typeof value.listingId !== 'string'
      || value.listingId.length < 1 || value.listingId.length > 256
      || typeof value.supplyType !== 'string' || !SUPPLIES.has(value.supplyType as SupplyType)) {
    throw new Error('INVALID_REQUEST');
  }
  const source = value.announcementDetails ?? {};
  if (!isRecord(source) || JSON.stringify(source).length > 40_000
      || Object.keys(source).some(key => !DETAIL_KEYS.has(key))) throw new Error('INVALID_REQUEST');
  return {
    listingId: value.listingId,
    supplyType: value.supplyType as SupplyType,
    announcementDetails: source as AssessmentInput['details'],
  };
}

function resultFromRow(row: Record<string, unknown>) {
  if (!isRecord(row.result_snapshot)) throw new Error('INVALID_RESULT_ROW');
  return {
    ...row.result_snapshot,
    id: row.id,
    calculatedAt: row.calculated_at,
    stale: row.stale_at && row.stale_reason
      ? { isStale: true, reason: row.stale_reason, detectedAt: row.stale_at }
      : { isStale: false },
  };
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (request.method !== 'POST') return json({ code: 'METHOD_NOT_ALLOWED' }, 405);
  try {
    const env = environment();
    const userId = await authenticatedUser(env, request.headers.get('authorization'));
    const input = parseRequest(await request.json());
    const profiles = await serviceFetch<Record<string, unknown>[]>(
      env,
      `/rest/v1/applicant_profiles_v3?select=user_id,revision,profile_json&user_id=eq.${encodeURIComponent(userId)}&limit=1`,
    );
    const profileRow = profiles[0];
    if (!profileRow || typeof profileRow.revision !== 'number' || !isRecord(profileRow.profile_json)) {
      return json({ code: 'PROFILE_V3_REQUIRED' }, 409);
    }

    const announcementId = input.listingId.startsWith('announcement:')
      ? input.listingId.slice('announcement:'.length)
      : null;
    const rulePayload = await serviceFetch<unknown>(env, '/rest/v1/rpc/read_assessment_rule_set', {
      method: 'POST',
      body: JSON.stringify({
        p_announcement_id: announcementId,
        p_listing_id: announcementId ? null : input.listingId,
      }),
    });
    const decoded = decodeRuleSet(rulePayload, announcementId
      ? { announcementId }
      : { listingId: input.listingId });
    if (decoded.status !== 'AVAILABLE') return json({ code: decoded.status }, 409);
    if (decoded.rules.listingId !== input.listingId) return json({ code: 'RULE_LISTING_MISMATCH' }, 409);
    if (!decoded.rules.supplies.some(supply => supply.type === input.supplyType)) {
      return json({ code: 'SUPPLY_TYPE_NOT_AVAILABLE' }, 409);
    }

    const sourceDocumentId = decoded.rules.provenance?.documentId ?? null;
    let sourceDocumentHash: string | null = null;
    if (sourceDocumentId) {
      const documents = await serviceFetch<Array<{ sha256: string }>>(
        env,
        `/rest/v1/announcement_documents?select=sha256&id=eq.${encodeURIComponent(sourceDocumentId)}&limit=1`,
      );
      sourceDocumentHash = documents[0]?.sha256 ?? null;
      if (!sourceDocumentHash) return json({ code: 'SOURCE_DOCUMENT_MISMATCH' }, 409);
    }

    const listingInputRows = await serviceFetch<Array<{
      answers: Record<string, string>;
      rule_set_id: string;
      rule_set_version: string;
      source_document_id: string | null;
      source_document_hash: string | null;
      stale_at: string | null;
    }>>(
      env,
      `/rest/v1/user_listing_assessment_inputs?select=answers,rule_set_id,rule_set_version,source_document_id,source_document_hash,stale_at`
        + `&user_id=eq.${encodeURIComponent(userId)}&listing_id=eq.${encodeURIComponent(input.listingId)}`
        + `&supply_type=eq.${encodeURIComponent(input.supplyType)}&limit=1`,
    );
    const listingInput = listingInputRows[0];
    const savedDetails = listingInput
      && listingInput.stale_at === null
      && listingInput.rule_set_id === decoded.rules.id
      && listingInput.rule_set_version === decoded.rules.version
      && listingInput.source_document_id === sourceDocumentId
      && listingInput.source_document_hash === sourceDocumentHash
      ? assessmentDetailsFromListingAnswers(listingInput.answers, input.supplyType)
      : {};
    // Listing answers are trusted only after the owner-scoped RPC has validated
    // and persisted them. A client payload can request a calculation but cannot
    // inject transient facts into a server-persisted result.
    const announcementDetails = savedDetails;

    const profile = profileRow.profile_json as unknown as ApplicantProfileV3;
    const inputHash = await trustedAssessmentInputHash({
      listingId: input.listingId,
      supplyType: input.supplyType,
      profileRevision: profileRow.revision,
      profile,
      announcementDetails,
      ruleSetId: decoded.rules.id,
      ruleSetVersion: decoded.rules.version,
      sourceDocumentHash,
    });
    const query = new URLSearchParams({
      select: 'id,result_snapshot,calculated_at,stale_at,stale_reason',
      user_id: `eq.${userId}`,
      listing_id: `eq.${input.listingId}`,
      supply_type: `eq.${input.supplyType}`,
      profile_revision: `eq.${profileRow.revision}`,
      rule_set_id: `eq.${decoded.rules.id}`,
      rule_set_version: `eq.${decoded.rules.version}`,
      engine_version: `eq.${USER_CENTRIC_ASSESSMENT_ENGINE_VERSION}`,
      input_hash: `eq.${inputHash}`,
      stale_at: 'is.null',
      superseded_at: 'is.null',
      order: 'calculated_at.desc',
      limit: '1',
    });
    const existing = await serviceFetch<Record<string, unknown>[]>(env, `/rest/v1/user_assessment_results?${query}`);
    if (existing[0]) return json({ result: resultFromRow(existing[0]), reused: true, freshness: 'FRESH' });

    const result = await executeTrustedAssessment({
      userId,
      announcementId: decoded.rules.provenance?.announcementId ?? announcementId ?? '',
      profileRevision: profileRow.revision,
      profile,
      rules: decoded.rules,
      supplyType: input.supplyType,
      announcementDetails,
      sourceDocumentHash,
    });
    const saved = await serviceFetch<Record<string, unknown>>(env, '/rest/v1/rpc/save_user_assessment_result_server', {
      method: 'POST', body: JSON.stringify({ p_user_id: userId, p_result: result }),
    });
    return json({ result: resultFromRow(saved), reused: false, freshness: 'FRESH' });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'UNEXPECTED_ERROR';
    if (code === 'AUTH_REQUIRED') return json({ code }, 401);
    if (code === 'INVALID_REQUEST') return json({ code }, 400);
    if (code === 'USER_CENTRIC_STAGING_DISABLED') return json({ code }, 404);
    console.error('user-assessment request failed', { code });
    return json({ code: 'ASSESSMENT_SERVER_FAILED' }, 500);
  }
});
