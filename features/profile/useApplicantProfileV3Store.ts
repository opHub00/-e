import { create } from 'zustand';
import type { ApplicantProfileV2 } from './domain.ts';
import {
  ApplicantProfileV3RepositoryError,
  readApplicantProfileWithV2Fallback,
  type ApplicantProfileReadResult,
  type ApplicantProfileV3Record,
  type ApplicantProfileV3Repository,
} from './v3Repository.ts';
import type { ApplicantProfileV3 } from './v3.ts';
import {
  mergeExplicitV2ProfileEditIntoV3,
  mergeReusableAssessmentDetailsIntoV3,
} from './v3Bridge.ts';
import type { AssessmentInput } from '../applicationAssessment/types.ts';
import { canonicalSerialize } from '../applicationAssessment/serverExecution.ts';

export type ApplicantProfileV3SyncStatus =
  | 'disabled'
  | 'loading'
  | 'ready'
  | 'saving'
  | 'conflict'
  | 'error';

export type ApplicantProfileV3CacheState = 'FRESH' | 'V2_LOCAL_FALLBACK' | 'STALE';

export type ApplicantProfileV3SessionState = {
  userId: string | null;
  profile: ApplicantProfileV3 | null;
  record: ApplicantProfileV3Record | null;
  status: ApplicantProfileV3SyncStatus;
  cacheState: ApplicantProfileV3CacheState | null;
  source: ApplicantProfileReadResult['source'] | null;
  errorCode: ApplicantProfileV3RepositoryError['code'] | null;
  conflict: { base: ApplicantProfileV3; local: ApplicantProfileV3; server: ApplicantProfileV3Record | null } | null;
};

const initial: ApplicantProfileV3SessionState = {
  userId: null,
  profile: null,
  record: null,
  status: 'disabled',
  cacheState: null,
  source: null,
  errorCode: null,
  conflict: null,
};

export const useApplicantProfileV3Store = create<ApplicantProfileV3SessionState>(() => initial);

let repository: ApplicantProfileV3Repository | null = null;
let generation = 0;
let saveQueue: Promise<ApplicantProfileV3Record | null> = Promise.resolve(null);

function profileValueSnapshot(profile: ApplicantProfileV3): unknown {
  const visit = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(visit);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => key !== 'observedAt')
        .map(([key, child]) => [key, visit(child)]),
    );
  };
  return visit(profile);
}

export async function startApplicantProfileV3Session(input: {
  userId: string;
  repository: ApplicantProfileV3Repository;
  v2: Parameters<typeof readApplicantProfileWithV2Fallback>[0]['v2'];
  decodeV2: Parameters<typeof readApplicantProfileWithV2Fallback>[0]['decodeV2'];
}): Promise<ApplicantProfileReadResult> {
  const ownGeneration = ++generation;
  repository = input.repository;
  useApplicantProfileV3Store.setState({ ...initial, userId: input.userId, status: 'loading' });
  try {
    const result = await readApplicantProfileWithV2Fallback({
      userId: input.userId,
      v3: input.repository,
      v2: input.v2,
      decodeV2: input.decodeV2,
    });
    if (ownGeneration !== generation) return result;
    if (result.source === 'V3') {
      useApplicantProfileV3Store.setState({
        userId: input.userId,
        profile: result.record.profile,
        record: result.record,
        status: 'ready',
        cacheState: 'FRESH',
        source: 'V3',
        errorCode: null,
        conflict: null,
      });
    } else {
      useApplicantProfileV3Store.setState({
        userId: input.userId,
        profile: result.profile,
        record: null,
        status: 'ready',
        cacheState: result.source === 'V2_FALLBACK' ? 'V2_LOCAL_FALLBACK' : null,
        source: result.source,
        errorCode: null,
        conflict: null,
      });
    }
    return result;
  } catch (error) {
    if (ownGeneration === generation) {
      useApplicantProfileV3Store.setState({
        ...initial,
        userId: input.userId,
        status: 'error',
        cacheState: 'STALE',
        errorCode: error instanceof ApplicantProfileV3RepositoryError ? error.code : 'PROFILE_V3_READ_FAILED',
      });
    }
    throw error;
  }
}

export function stopApplicantProfileV3Session(): void {
  generation += 1;
  repository = null;
  saveQueue = Promise.resolve(null);
  useApplicantProfileV3Store.setState(initial);
}

async function saveProfile(
  next: ApplicantProfileV3,
  metadata: { completedAt?: string | null; consentVersion?: string | null } = {},
): Promise<ApplicantProfileV3Record | null> {
  const state = useApplicantProfileV3Store.getState();
  const activeRepository = repository;
  const ownGeneration = generation;
  if (!state.userId || !activeRepository) return null;
  if (
    state.record
    && state.profile
    && canonicalSerialize(profileValueSnapshot(state.profile)) === canonicalSerialize(profileValueSnapshot(next))
    && (metadata.completedAt === undefined || metadata.completedAt === state.record.completedAt)
    && (metadata.consentVersion === undefined || metadata.consentVersion === state.record.consentVersion)
  ) {
    return state.record;
  }
  useApplicantProfileV3Store.setState({ status: 'saving', errorCode: null, conflict: null });
  try {
    const saved = await activeRepository.update({
      expectedRevision: state.record?.revision ?? 0,
      profile: next,
      completedAt: metadata.completedAt,
      consentVersion: metadata.consentVersion,
    });
    if (ownGeneration === generation && useApplicantProfileV3Store.getState().userId === saved.userId) {
      useApplicantProfileV3Store.setState({
        profile: saved.profile,
        record: saved,
        status: 'ready',
        cacheState: 'FRESH',
        source: 'V3',
        errorCode: null,
        conflict: null,
      });
    }
    return saved;
  } catch (error) {
    if (ownGeneration !== generation) throw error;
    if (error instanceof ApplicantProfileV3RepositoryError && error.code === 'PROFILE_V3_REVISION_CONFLICT') {
      const server = await activeRepository.read(state.userId).catch(() => null);
      useApplicantProfileV3Store.setState({
        profile: state.profile,
        record: server,
        status: 'conflict',
        cacheState: 'STALE',
        errorCode: error.code,
        conflict: { base: state.record?.profile ?? state.profile ?? next, local: next, server },
      });
    } else {
      useApplicantProfileV3Store.setState({
        status: 'error',
        cacheState: 'STALE',
        errorCode: error instanceof ApplicantProfileV3RepositoryError ? error.code : 'PROFILE_V3_WRITE_FAILED',
      });
    }
    throw error;
  }
}

/** Explicit V3 editor entry point. All writes still use the repository revision gate. */
export async function saveApplicantProfileV3(
  next: ApplicantProfileV3,
  metadata: { completedAt?: string | null; consentVersion?: string | null } = {},
): Promise<ApplicantProfileV3Record | null> {
  const task = saveQueue.catch(() => null).then(() => saveProfile(next, metadata));
  saveQueue = task;
  return task;
}

/** Reloads the authoritative server profile after a conflict or explicit retry. */
export async function reloadApplicantProfileV3FromServer(): Promise<ApplicantProfileV3Record | null> {
  const state = useApplicantProfileV3Store.getState();
  const activeRepository = repository;
  const ownGeneration = generation;
  if (!state.userId || !activeRepository) return null;
  useApplicantProfileV3Store.setState({ status: 'loading', errorCode: null });
  try {
    const record = await activeRepository.read(state.userId);
    if (ownGeneration === generation && useApplicantProfileV3Store.getState().userId === state.userId) {
      useApplicantProfileV3Store.setState({
        profile: record?.profile ?? null,
        record,
        status: 'ready',
        cacheState: record ? 'FRESH' : null,
        source: record ? 'V3' : 'NONE',
        errorCode: null,
        conflict: null,
      });
    }
    return record;
  } catch (error) {
    if (ownGeneration === generation) {
      useApplicantProfileV3Store.setState({
        status: 'error',
        cacheState: 'STALE',
        errorCode: error instanceof ApplicantProfileV3RepositoryError ? error.code : 'PROFILE_V3_READ_FAILED',
      });
    }
    throw error;
  }
}

/**
 * Keeps the user's local edit in memory while adopting only the latest server
 * revision. It is never auto-saved; the next explicit save remains revision-gated.
 */
export function keepLocalApplicantProfileV3ConflictDraft(): void {
  const state = useApplicantProfileV3Store.getState();
  if (!state.conflict) return;
  useApplicantProfileV3Store.setState({
    profile: state.conflict.local,
    record: state.conflict.server,
    status: 'ready',
    cacheState: 'STALE',
    source: state.conflict.server ? 'V3' : state.source,
    errorCode: null,
    conflict: null,
  });
}

export async function saveExplicitV2ProfileEditToV3(
  edited: ApplicantProfileV2,
  observedAt = new Date().toISOString(),
): Promise<ApplicantProfileV3Record | null> {
  const task = saveQueue.catch(() => null).then(() => {
    const current = useApplicantProfileV3Store.getState().profile;
    return current ? saveProfile(mergeExplicitV2ProfileEditIntoV3(current, edited, observedAt)) : null;
  });
  saveQueue = task;
  return task;
}

export async function saveReusableAssessmentDetailsToV3(
  details: AssessmentInput['details'],
  observedAt = new Date().toISOString(),
): Promise<ApplicantProfileV3Record | null> {
  const task = saveQueue.catch(() => null).then(() => {
    const current = useApplicantProfileV3Store.getState().profile;
    return current ? saveProfile(mergeReusableAssessmentDetailsIntoV3(current, details, observedAt)) : null;
  });
  saveQueue = task;
  return task;
}
