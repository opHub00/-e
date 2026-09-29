import type { FormulaAuditEntry, ScoringActor, StoredScoringFormula } from './repository.ts';
import { scoringErrorMessage } from './repository.ts';
import type { ScoringComponent, ScoringStatus } from './domain.ts';

/**
 * 운영자가 읽는 말로 옮기는 자리.
 *
 * 서버 계약(`repository.ts`)과 migration 은 백엔드 쪽이 정한다. 여기서는 그 결과를 화면 말로만 바꾼다.
 * 규칙 하나: **사람이 아닌 값(UUID·enum·SQL 원문)은 기본 화면에 내보내지 않는다.**
 * 필요하면 '고급 정보'에 따로 둔다. 숨기는 게 아니라, 먼저 읽을 것과 나중에 볼 것을 나누는 것이다.
 */

/** 감사 기록의 action 코드를 운영자 말로. 서버가 새 코드를 더하면 여기서 한 줄 더한다. */
const AUDIT_ACTION_LABEL: Record<string, string> = {
  CREATE: '산식 만들기',
  SEED: '초기 등록',
  CLONE: '새 버전 생성',
  CLONE_VERSION: '새 버전 생성',
  UPDATE_METADATA: '기본 정보 수정',
  CREATE_ITEM: '배점 항목 추가',
  UPDATE_ITEM: '배점 항목 수정',
  DELETE_ITEM: '배점 항목 삭제',
  CREATE_BAND: '구간 추가',
  UPDATE_BAND: '구간 수정',
  DELETE_BAND: '구간 삭제',
  CREATE_TEST_CASE: '검증 예시 추가',
  UPDATE_TEST_CASE: '검증 예시 수정',
  DELETE_TEST_CASE: '검증 예시 삭제',
  REQUEST_REVIEW: '검토 요청',
  ACTIVATE: '활성화',
  RETIRE: '중지',
  AUTO_RETIRE_FOR_REPLACEMENT: '새 버전으로 교체되며 중지',
  RETURN_TO_DRAFT: '초안으로 되돌림',
  PUBLISH_TO_USERS: '사용자에게 공개',
  HIDE_FROM_USERS: '사용자에게 숨김',
};

/** 모르는 코드는 코드값 대신 '기타 변경'으로 적고, 원래 코드는 고급 정보에서 본다. */
export const auditActionLabel = (action: string): string => AUDIT_ACTION_LABEL[action] ?? '기타 변경';

/**
 * 감사 RPC가 제공한 displayLabel을 우선 사용한다. 이전 fixture처럼 actor가
 * 비어 있는 기록만 같은 산식의 actors를 fallback directory로 쓴다.
 * 운영자에게 36자리 UUID 는 이름이 아니다.
 */
export function actorDirectory(actors: StoredScoringFormula['actors']): Map<string, string> {
  const directory = new Map<string, string>();
  for (const actor of [actors.created, actors.updated, actors.activated]) {
    if (actor?.userId) directory.set(actor.userId, actorName(actor));
  }
  return directory;
}

export const actorName = (actor: ScoringActor | null): string =>
  actor?.displayLabel ?? actor?.email ?? (actor?.userId ? '확인할 수 없는 계정' : '기록 없음');

export const auditActorLabel = (userId: string | null, directory: Map<string, string>): string => {
  if (!userId) return '시스템';
  return directory.get(userId) ?? '확인할 수 없는 계정';
};

export type AuditRow = {
  key: string;
  at: string;
  actor: string;
  action: string;
  /** 왜 바꿨는지. 서버가 받은 reason 을 그대로 쓴다. 비어 있으면 빈 칸으로 둔다. */
  reason: string;
  /** 고급 정보용. 화면 기본 표시에는 쓰지 않는다. */
  raw: { action: string; actorUserId: string | null; revision: number };
};

/** 감사 기록을 화면 표에 그대로 얹을 수 있는 줄로. 최근 것이 앞에 온다. */
export function auditRows(entries: FormulaAuditEntry[], actors: StoredScoringFormula['actors']): AuditRow[] {
  const directory = actorDirectory(actors);
  return [...entries]
    .sort((left, right) => right.id - left.id)
    .map(entry => ({
      key: String(entry.id),
      at: entry.createdAt,
      actor: entry.actor?.displayLabel ?? auditActorLabel(entry.actorUserId, directory),
      action: auditActionLabel(entry.action),
      reason: entry.reason?.trim() ?? '',
      raw: { action: entry.action, actorUserId: entry.actorUserId, revision: entry.revision },
    }));
}

/**
 * 서버가 준 오류를 화면 문구와 '고급 정보'로 나눈다.
 *
 * 계약에 있는 코드는 계약 문구를 쓴다. 계약에 없는 것(주로 DB 원문)은 운영자에게
 * 제약 이름이나 SQL 조각을 보여줘 봐야 할 수 있는 일이 없다. 그래서 한 문장으로 줄이고
 * 원문은 개발자에게 전달할 수 있도록 고급 정보에만 남긴다.
 */
export type OperatorError = { message: string; detail: string | null };

/** 서버 계약에 아직 없지만 화면이 받을 수 있는 코드. */
const EXTRA_MESSAGE: Record<string, string> = {
  SCORING_NOT_READY: '활성화 전 검사를 통과하지 못했어요. 배점표와 예시를 먼저 확인해 주세요.',
  SCORING_REPOSITORY_UNAVAILABLE: '산식 저장소에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.',
  SCORING_DUPLICATE_DRAFT: '이미 만들어 둔 초안이 있어요. 그 초안을 이어서 고쳐 주세요.',
  REASON_REQUIRED: '무엇을 왜 바꾸는지 사유를 적어 주세요.',
  // 서버가 이 코드를 쓰면, 화면은 어떤 배점 항목이 어긋났는지 이름으로 다시 적는다(testInputMismatchMessage).
  TEST_INPUT_KEYS_MISMATCH: '검증 예시의 입력이 배점 항목과 맞지 않아요. 배점 항목을 모두 채워 주세요.',
};

export function operatorError(code: string): OperatorError {
  if (EXTRA_MESSAGE[code]) return { message: EXTRA_MESSAGE[code], detail: null };

  // Repository contract 밖의 DB 원문은 화면에 전달하지 않는다. 원문은
  // server/debug telemetry에만 남고 운영자는 안정된 메시지만 본다.
  if (code.startsWith('SCORING_DB_ERROR:')) return {
    message: '저장소에서 처리하지 못했어요. 잠시 후 다시 시도하고, 계속되면 개발자에게 알려 주세요.',
    detail: null,
  };

  const known = scoringErrorMessage(code);
  // scoringErrorMessage 는 모르는 코드에 코드값을 끼워 돌려준다. 그 형태면 코드를 숨긴다.
  if (known.includes(`(${code})`)) {
    return { message: '요청을 처리하지 못했어요. 잠시 후 다시 시도하고, 계속되면 개발자에게 알려 주세요.', detail: code };
  }
  return { message: known, detail: null };
}

/**
 * 검증 예시의 입력 키가 배점 항목과 어긋났을 때.
 *
 * 서버는 어떤 키가 문제인지 코드로만 알려 준다. 운영자는 '키'라는 말을 모른다.
 * 그래서 배점 항목 이름으로 바꿔 무엇이 빠졌고 무엇이 남는지 적는다.
 */
export function testInputMismatchMessage(components: ScoringComponent[], inputs: Record<string, unknown>): string {
  const expected = components.map(component => component.id);
  const given = Object.keys(inputs);
  const nameOf = (id: string) => components.find(component => component.id === id)?.label ?? id;
  const missing = expected.filter(id => !given.includes(id)).map(nameOf);
  const extra = given.filter(id => !expected.includes(id));

  const parts: string[] = [];
  if (missing.length) parts.push(`${missing.join(', ')} 값이 빠졌어요`);
  if (extra.length) parts.push(`배점 항목에 없는 값(${extra.join(', ')})이 들어 있어요`);
  if (!parts.length) return '검증 예시의 입력이 배점 항목과 맞지 않아요.';
  return `${parts.join('. ')}. 검증 예시는 배점 항목 ${expected.length}개를 모두 채워야 해요.`;
}

/**
 * 상태 버튼이 막혀 있는 이유.
 *
 * 비활성 버튼만 두면 운영자는 고장으로 읽는다. 왜 못 누르는지, 대신 무엇을 하면 되는지 적는다.
 * 전이 규칙 자체는 서버가 정한다(활성화는 검토 중에서만). 여기서는 그 규칙을 설명만 한다.
 */
export function transitionReason(current: ScoringStatus, next: ScoringStatus, canEdit: boolean): string | null {
  if (current === next) return null;
  if (!canEdit) return '상태 변경은 관리자만 할 수 있어요.';
  if (current === 'ACTIVE' && next !== 'SUSPENDED') {
    return '활성 버전은 직접 수정할 수 없어요. 새 버전을 만들어 주세요.';
  }
  if (current === 'SUSPENDED') {
    return '중지된 버전은 되살리지 않아요. 새 버전을 만들어 활성화해 주세요.';
  }
  if (current === 'DRAFT' && next === 'ACTIVE') {
    return '먼저 검토 요청을 거쳐야 활성화할 수 있어요.';
  }
  if (current === 'DRAFT' && next === 'SUSPENDED') return '아직 서비스에 쓰인 적이 없는 버전이에요.';
  if (current === 'REVIEW' && next === 'SUSPENDED') return '아직 서비스에 쓰인 적이 없는 버전이에요.';
  return null;
}
