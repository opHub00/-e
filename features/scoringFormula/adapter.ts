import type { AdminRole } from '../adminPortal/access.ts';
import type { ScoringFormula, ScoringStatus } from './domain.ts';
import { canActivate } from './draftStore.ts';
import { clearDraft, readDrafts, writeDraft } from './draftStore.ts';
import { loadFormulas } from './registry.ts';
import { scoringErrorMessage, type ScoringRepository } from './repository.ts';

/**
 * 산식 저장소의 경계.
 *
 * 화면은 `ScoringRepository` 만 안다. 지금 그 자리에 들어가 있는 것은 배포 파일 + 브라우저 초안이고,
 * 서버 구현이 준비되면 `createScoringRepository` 가 돌려주는 것만 바꾸면 된다. 화면은 그대로 둔다.
 *
 * `repository.ts` 의 계약(list/save/setStatus, 오류 코드)은 서버 쪽에서 정한다. 여기서 바꾸지 않는다.
 */

/** 서버 구현이 준비되면 이 자리에 끼운다. 지금은 비어 있고, 비어 있으면 로컬 구현을 쓴다. */
let serverRepository: ScoringRepository | null = null;

/** 서버 구현을 끼우는 유일한 지점. 앱 시작 시 한 번 부른다. */
export function useServerScoringRepository(repository: ScoringRepository | null): void {
  serverRepository = repository;
}

export type ScoringSource = 'local-draft' | 'server';

/** 지금 어디서 읽고 있는지. 화면은 이 값으로 "아직 반영되지 않았다"를 알린다. */
export const scoringSource = (): ScoringSource => (serverRepository ? 'server' : 'local-draft');

/**
 * 배포 파일을 읽고, 이 브라우저의 초안을 덮어쓴 목록.
 * 서버가 없을 때 화면이 그대로 돌아가게 하는 구현이다.
 */
export const localScoringRepository: ScoringRepository = {
  list: async () => {
    const drafts = readDrafts();
    return loadFormulas().map(formula => drafts[formula.id] ?? formula);
  },
  save: async formula => {
    const published = loadFormulas().find(item => item.id === formula.id);
    // 서버가 막는 것과 같은 것을 로컬에서도 막는다. 연결 뒤에 동작이 달라지면 안 된다.
    if (published && published.status === 'ACTIVE' && formula.status === 'ACTIVE') {
      throw new Error('SCORING_VERSION_PUBLISHED');
    }
    writeDraft(formula);
  },
  setStatus: async (id, status) => {
    const current = (await localScoringRepository.list()).find(item => item.id === id);
    if (!current) throw new Error('SCORING_FORMULA_NOT_FOUND');
    if (status === 'ACTIVE') {
      if (!canActivate(current)) throw new Error('SCORING_NOT_READY');
      const clash = (await localScoringRepository.list()).find(item =>
        item.id !== id && item.status === 'ACTIVE' && item.targets.some(target => current.targets.includes(target)));
      if (clash) throw new Error('SCORING_TARGET_ALREADY_ACTIVE');
    }
    writeDraft({ ...current, status });
  },
};

export const createScoringRepository = (): ScoringRepository => serverRepository ?? localScoringRepository;

/** 초안을 버리고 배포본으로 돌아간다. 서버 구현에는 이 개념이 없어 로컬에서만 쓴다. */
export const discardLocalDraft = (id: string): void => clearDraft(id);

export const hasLocalDraft = (id: string): boolean => Boolean(readDrafts()[id]);

/**
 * 아직 서버 계약에 없는 코드의 문구.
 *
 * `repository.ts` 는 서버 쪽이 정하는 파일이라 여기서 고치지 않는다.
 * 로컬 구현이 내는 코드만 여기서 말로 옮기고, 나머지는 계약의 문구를 그대로 쓴다.
 * (SCORING_NOT_READY 는 서버 계약에도 추가해 달라고 요청해 둔 상태다.)
 */
const LOCAL_MESSAGE: Record<string, string> = {
  SCORING_NOT_READY: '활성화 전 검사를 통과하지 못했어요. 배점표와 예시를 먼저 확인해 주세요.',
};

export const scoringMessage = (code: string): string => LOCAL_MESSAGE[code] ?? scoringErrorMessage(code);

/** 호출 결과를 화면이 그대로 쓸 수 있는 모양으로. 오류는 항상 운영자 문구로 바뀐다. */
export type ScoringOutcome<T> = { ok: true; value: T } | { ok: false; code: string; message: string };

export async function runScoring<T>(action: () => Promise<T>): Promise<ScoringOutcome<T>> {
  try {
    return { ok: true, value: await action() };
  } catch (error) {
    const code = error instanceof Error ? error.message : 'UNKNOWN';
    return { ok: false, code, message: scoringMessage(code) };
  }
}

/**
 * 누가 무엇을 할 수 있는가.
 *
 * 권한은 서버가 정한다(`assert_assessment_review_access`). 화면은 그 판정을 읽어 버튼을 잠근다.
 * 잠그기만 하고 이유를 안 적으면 운영자는 고장으로 읽는다. 그래서 이유를 함께 들고 다닌다.
 */
export type ScoringPermission = {
  canEdit: boolean;
  canActivate: boolean;
  /** 못 하는 이유. 할 수 있으면 null. */
  reason: string | null;
};

export function scoringPermission(role: AdminRole | null): ScoringPermission {
  if (role === 'admin') return { canEdit: true, canActivate: true, reason: null };
  if (role === 'reviewer') {
    return { canEdit: false, canActivate: false, reason: '검수자는 배점표를 볼 수 있어요. 고치거나 활성화하는 건 관리자만 할 수 있어요.' };
  }
  return { canEdit: false, canActivate: false, reason: '관리자 계정으로 로그인해 주세요.' };
}

/** 버전 문자열을 한 단계 올린다. `1.2.3` → `1.3.0`. 모양이 다르면 뒤에 `.1` 을 붙인다. */
export function nextVersion(version: string): string {
  const parts = version.trim().split('.');
  if (parts.length === 3 && parts.every(part => /^\d+$/.test(part))) {
    return `${parts[0]}.${Number(parts[1]) + 1}.0`;
  }
  return `${version.trim() || '1.0.0'}.1`;
}

/**
 * 이미 서비스에 쓰인 버전을 고치려 할 때 만드는 새 버전.
 *
 * 발행된 배점표를 그 자리에서 고치면, 지난주에 안내한 점수가 무엇이었는지 설명할 수 없게 된다.
 * 그래서 고치는 대신 초안 버전을 새로 뜬다. 예시와 해석 문구는 그대로 가져온다.
 */
export function newVersionFrom(formula: ScoringFormula, actor = '관리자'): ScoringFormula {
  const at = new Date().toISOString().slice(0, 10);
  const version = nextVersion(formula.version);
  return {
    ...formula,
    id: `${formula.id}@${version}`,
    version,
    status: 'DRAFT',
    publishedToUsers: false,
    updatedAt: at,
    history: [...formula.history, {
      at,
      actor,
      summary: `${formula.version} 이 이미 서비스에 쓰이고 있어, ${version} 초안을 새로 만들었어요.`,
    }],
  };
}

export type Editability = {
  /** 배점표를 지금 고칠 수 있는가. */
  canEditBands: boolean;
  /** 고치려면 새 버전을 떠야 하는가. */
  mustCreateNewVersion: boolean;
  /** 화면에 그대로 띄울 안내. 고칠 수 있으면 null. */
  notice: string | null;
};

export function editabilityOf(formula: ScoringFormula, permission: ScoringPermission): Editability {
  if (!permission.canEdit) {
    return { canEditBands: false, mustCreateNewVersion: false, notice: permission.reason };
  }
  if (formula.status === 'ACTIVE' || formula.status === 'SUSPENDED') {
    return {
      canEditBands: false,
      mustCreateNewVersion: true,
      notice: '이 버전은 이미 서비스에 쓰였어요. 배점을 바꾸려면 새 버전을 만들어야 해요. 지난 안내가 어떤 배점이었는지 남겨 두기 위해서예요.',
    };
  }
  return { canEditBands: true, mustCreateNewVersion: false, notice: null };
}

/** 활성화 버튼을 눌러도 되는지. 권한과 검사 결과를 한 번에 본다. */
export function activationBlock(formula: ScoringFormula, permission: ScoringPermission): string | null {
  if (!permission.canActivate) return permission.reason;
  if (!canActivate(formula)) return '통과하지 못한 검사가 있어 활성으로 바꿀 수 없어요.';
  return null;
}
