import {
  AI_HISTORY_TEXT_LIMIT,
  AI_HISTORY_TURN_LIMIT,
  buildAiRequestPayload,
  buildAiRequestHistory,
  canStartAiRequest,
  getAiErrorMessage,
  getAiLoadingMode,
} from './requestUx.ts';

let checks = 0;
const check = (condition: unknown, message: string) => {
  checks += 1;
  if (!condition) throw new Error(`FAIL: ${message}`);
};

check(canStartAiRequest('질문', false), '일반 질문은 전송 가능');
check(!canStartAiRequest('질문', true), 'in-flight 중복 전송 차단');
check(!canStartAiRequest('   ', false), '빈 질문 전송 차단');
check(getAiErrorMessage(429).includes('요청이 많아요'), '429 사용자 안전 문구');
check(!getAiErrorMessage(500).includes('500'), '내부 status code 비노출');
check(getAiErrorMessage(null, true).includes('응답이 늦어지고'), 'timeout 사용자 안전 문구');
check(getAiLoadingMode(true) === 'static', 'reduced motion은 정적 로딩');
check(getAiLoadingMode(false) === 'animated', '기본 로딩은 애니메이션');

const history = Array.from({ length: 10 }, (_, index) => ({
  role: index % 2 === 0 ? 'user' as const : 'model' as const,
  text: `${index}`.repeat(AI_HISTORY_TEXT_LIMIT + 100),
}));
const compact = buildAiRequestHistory(history);
check(compact.length === AI_HISTORY_TURN_LIMIT, '최근 대화만 전송');
check(compact.every((turn) => turn.text.length <= AI_HISTORY_TEXT_LIMIT), 'history text 크기 제한');
const plainPayload = buildAiRequestPayload('질문', '상태', [], null, null);
check(!('lesson' in plainPayload), '일반 AI 요청은 null lesson을 보내지 않는다');
check(!('listingFit' in plainPayload), '일반 AI 요청은 null listingFit을 보내지 않는다');
check(!('benchmark' in plainPayload), '일반 AI 요청은 null benchmark를 보내지 않는다');
check(
  'listingFit' in buildAiRequestPayload('질문', '상태', [], null, { status: 'needs_information' }),
  'Personal Fit context는 있을 때만 전송한다',
);
check(
  'benchmark' in buildAiRequestPayload('질문', '상태', [], null, null, { feature: 'peer_preparation_benchmark_v1' }),
  'Benchmark context는 있을 때만 전송한다',
);

console.log(`features/ai/requestUx: ${checks}개 검증 통과`);
