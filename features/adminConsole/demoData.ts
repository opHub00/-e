import type { ConsoleSnapshot } from './contract.ts';

/**
 * 콘솔 레이아웃 점검용 예시 데이터. 실제 운영 값이 아니다.
 * Demo 빌드에서 ?demo=1 일 때만 쓰이고, 화면 맨 위에 '예시 데이터' 띠가 항상 보인다.
 * 제목·질문에 '[예시]'를 붙여 실제 공고·대화로 오해하지 않게 한다. 개인정보 없음.
 */
const DAY = '2026-10-16';
const at = (time: string) => `${DAY}T${time}:00+09:00`;

export const CONSOLE_DEMO_SNAPSHOT: ConsoleSnapshot = {
  generatedAt: at('10:30'),
  notices: [
    {
      id: 'demo-notice-a', title: '[예시] 가람마을 A단지 토지임대부 분양주택', region: '예시시 북구', announcementDate: '2026-10-27', status: 'ACTIVE',
      ruleVersion: 'rules-1.8.0', ragVersion: 'rag-2026.10.15', provenance: { fileName: '(예시) A단지 입주자모집공고문.hwp', sha256: 'demo0001aaaabbbbccccddddeeeeffff0001', official: false },
      updatedAt: at('09:40'), supplyTypes: ['청년', '신혼부부', '신생아', '생애최초', '일반공급'], ruleCount: 75, ragChunkCount: 214,
      validation: { status: 'PASS', messages: ['공급 세대 합계 = 32', '일정 4건 확인'] },
      history: [{ at: at('09:40'), actor: '운영자 A', summary: 'RAG 색인 갱신' }, { at: '2026-10-15T17:35:00+09:00', actor: '운영자 B', summary: '규칙 패키지 1.8 승인' }],
    },
    {
      id: 'demo-notice-b', title: '[예시] 가람마을 B단지 토지임대부 분양주택', region: '예시시 북구', announcementDate: '2026-10-27', status: 'ACTIVE',
      ruleVersion: 'rules-1.8.0', ragVersion: 'rag-2026.10.15', provenance: { fileName: '(예시) B단지 입주자모집공고문.hwp', sha256: 'demo0002aaaabbbbccccddddeeeeffff0002', official: false },
      updatedAt: at('09:42'), supplyTypes: ['청년', '신혼부부', '신생아', '생애최초', '일반공급'], ruleCount: 78, ragChunkCount: 229,
      validation: { status: 'WARN', messages: ['기관추천 세대 수 공고 표기 확인 필요'] },
      history: [{ at: at('09:42'), actor: '운영자 A', summary: 'RAG 색인 갱신' }],
    },
    {
      id: 'demo-notice-c', title: '[예시] 나래지구 국민임대 예비입주자', region: '예시시 남구', announcementDate: '2026-11-03', status: 'REVIEW_REQUIRED',
      ruleVersion: 'rules-0.3.0', ragVersion: null, provenance: { fileName: '(예시) 나래지구 모집공고.pdf', sha256: 'demo0003aaaabbbbccccddddeeeeffff0003', official: true },
      updatedAt: at('08:15'), supplyTypes: ['일반', '우선'], ruleCount: 41, ragChunkCount: 0,
      validation: { status: 'WARN', messages: ['소득 기준 표 2개 중 1개 미추출', 'RAG 색인 없음'] },
      history: [{ at: at('08:15'), actor: '추출 파이프라인', summary: '규칙 41건 추출' }],
    },
    {
      id: 'demo-notice-d', title: '[예시] 다솜동 행복주택 추가모집', region: '예시시 북구', announcementDate: '2026-11-10', status: 'SOURCE_VERIFIED',
      ruleVersion: null, ragVersion: null, provenance: { fileName: '(예시) 다솜동 행복주택 공고.pdf', sha256: 'demo0004aaaabbbbccccddddeeeeffff0004', official: true },
      updatedAt: '2026-10-15T16:02:00+09:00', supplyTypes: ['청년', '신혼부부', '고령자'], ruleCount: 0, ragChunkCount: 0,
      validation: { status: 'PASS', messages: ['원문 해시 일치'] }, history: [{ at: '2026-10-15T16:02:00+09:00', actor: '운영자 B', summary: '원문 등록' }],
    },
    {
      id: 'demo-notice-e', title: '[예시] 2025 라온동 매입임대(종료)', region: '예시시 북구', announcementDate: '2025-08-01', status: 'ARCHIVED',
      ruleVersion: 'rules-0.9.2', ragVersion: 'rag-2025.08.01', provenance: { fileName: '(예시) 라온동 매입임대.hwp', sha256: 'demo0005aaaabbbbccccddddeeeeffff0005', official: true },
      updatedAt: '2025-09-30T10:00:00+09:00', supplyTypes: ['일반'], ruleCount: 22, ragChunkCount: 64,
      validation: { status: 'PASS', messages: [] }, history: [{ at: '2025-09-30T10:00:00+09:00', actor: '운영자 A', summary: '모집 종료로 보관' }],
    },
  ],
  rules: [
    { id: 'r1', noticeId: 'demo-notice-c', ruleType: '소득', supplyType: '일반', condition: '세대 월평균소득 ≤', value: '도시근로자 70%', evidence: { section: '3. 신청자격', excerpt: '(예시) 해당 세대의 월평균소득이 전년도 도시근로자 가구당 월평균소득의 70% 이하인 자', locator: 'p.4 · 표3 · row 2' }, validation: { status: 'PASS', messages: [] }, status: 'PENDING', changed: true },
    { id: 'r2', noticeId: 'demo-notice-c', ruleType: '자산', supplyType: '일반', condition: '세대 총자산 ≤', value: '3억 4,500만원', evidence: { section: '3. 신청자격', excerpt: '(예시) 총자산가액 합계금액 3억4천5백만원 이하', locator: 'p.4 · 문단 18' }, validation: { status: 'PASS', messages: [] }, status: 'PENDING', changed: false },
    { id: 'r3', noticeId: 'demo-notice-c', ruleType: '자동차', supplyType: '일반', condition: '자동차 가액 ≤', value: '3,708만원', evidence: { section: '3. 신청자격', excerpt: '(예시) 자동차가액 3,708만원 이하', locator: 'p.5 · 문단 2' }, validation: { status: 'WARN', messages: ['연도 기준 표기 확인 필요'] }, status: 'PENDING', changed: true },
    { id: 'r4', noticeId: 'demo-notice-c', ruleType: '거주', supplyType: '우선', condition: '해당 지역 거주기간 ≥', value: '1년', evidence: { section: '4. 우선공급', excerpt: '(예시) 공고일 현재 서귀포시에 1년 이상 거주한 자', locator: 'p.6 · 문단 7' }, validation: { status: 'PASS', messages: [] }, status: 'APPROVED', changed: false },
    { id: 'r5', noticeId: 'demo-notice-c', ruleType: '무주택', supplyType: '일반', condition: '세대 구성원 전원 무주택', value: '예', evidence: { section: '3. 신청자격', excerpt: '(예시) 무주택세대구성원으로서', locator: 'p.4 · 문단 15' }, validation: { status: 'FAIL', messages: ['우선공급 조건과 중복 추출 의심'] }, status: 'PENDING', changed: false },
  ],
  assessments: {
    date: DAY,
    byStatus: { COMPLETE: 184, NEEDS_USER_INPUT: 97, INELIGIBLE: 41, UNAVAILABLE: 6 },
    blockers: [
      { label: '재당첨·부적격 당첨 제한', count: 52 }, { label: '세대 월평균소득', count: 47 }, { label: '판정 대상 총자산', count: 39 },
      { label: '청약통장 인정 납입횟수', count: 28 }, { label: '장기 해외체류 이력', count: 17 }, { label: '부모 총자산', count: 9 },
    ],
  },
  ai: [
    { id: 'a1', at: at('10:21'), question: '[예시] A단지와 B단지 중 어디가 신청하기 좋아요?', mode: 'llm', provider: 'google-gemini', fallbackReason: null, groundingRejected: false, providerError: false, evidenceCount: 3, latencyMs: 2140, evidence: [{ section: '공급 내역', excerpt: '(예시) A단지 32세대 · 2지구 40세대', locator: 'D1 p.2 / D2 p.2' }] },
    { id: 'a2', at: at('10:18'), question: '[예시] 신청은 언제부터 할 수 있어?', mode: 'deterministic', provider: null, fallbackReason: null, groundingRejected: false, providerError: false, evidenceCount: 1, latencyMs: 35, evidence: [{ section: '일정', excerpt: '(예시) 특별공급 11.16', locator: 'D1 p.3 · 표 일정' }] },
    { id: 'a3', at: at('10:11'), question: '[예시] 59㎡ 토지임대료 비교해 줘', mode: 'fallback', provider: 'google-gemini', fallbackReason: 'grounding_rejected', groundingRejected: true, providerError: false, evidenceCount: 2, latencyMs: 2870, evidence: [{ section: '토지임대료', excerpt: '(예시) 월 임대료 표', locator: 'D2 p.5 · 표 7' }] },
    { id: 'a4', at: at('10:02'), question: '[예시] 재당첨 제한이 뭐예요?', mode: 'llm', provider: 'google-gemini', fallbackReason: null, groundingRejected: false, providerError: false, evidenceCount: 2, latencyMs: 1930, evidence: [{ section: '재당첨 제한', excerpt: '(예시) 재당첨 제한 기간 내 신청 불가', locator: 'D1 p.9 · 문단 40' }] },
    { id: 'a5', at: at('09:55'), question: '[예시] 둘 다 신청 가능한가요?', mode: 'fallback', provider: 'google-gemini', fallbackReason: 'timeout', groundingRejected: false, providerError: true, evidenceCount: 0, latencyMs: 8000, evidence: [] },
    { id: 'a6', at: at('09:41'), question: '[예시] 당첨자 발표 언제야?', mode: 'deterministic', provider: null, fallbackReason: null, groundingRejected: false, providerError: false, evidenceCount: 1, latencyMs: 28, evidence: [{ section: '일정', excerpt: '(예시) 당첨자 발표 11.24', locator: 'D1 p.3 · 표 일정' }] },
  ],
  audit: [
    { id: 'u1', at: at('09:42'), actor: '운영자 A', action: 'RAG 색인 갱신', entity: { type: 'RAG', id: 'demo-notice-b', label: '[예시] B단지' }, before: { ragVersion: 'rag-2026.10.14', chunks: 221 }, after: { ragVersion: 'rag-2026.10.15', chunks: 229 } },
    { id: 'u2', at: at('08:20'), actor: '운영자 B', action: '규칙 반려', entity: { type: 'RULE', id: 'r6', label: '[예시] 나래 · 소득 중복' }, before: { status: 'PENDING' }, after: { status: 'REJECTED', reason: '중복 추출' } },
    { id: 'u3', at: '2026-10-15T17:35:00+09:00', actor: '운영자 B', action: '규칙 패키지 승인', entity: { type: 'RULE_PACKAGE', id: 'rules-1.8.0', label: '[예시] A단지 규칙 1.8' }, before: { status: 'REVIEW_REQUIRED', version: '1.7.2' }, after: { status: 'APPROVED', version: '1.8.0' } },
    { id: 'u4', at: '2026-10-15T16:02:00+09:00', actor: '운영자 B', action: '공고 원문 등록', entity: { type: 'NOTICE', id: 'demo-notice-d', label: '[예시] 다솜동 행복주택' }, before: null, after: { status: 'SOURCE_VERIFIED', sha256: 'demo0004…0004' } },
  ],
  errors: [
    { at: at('09:55'), source: 'AI 상담', message: '[예시] 제공자 응답 시간 초과(8초) — 대체 답변으로 전환', level: 'WARNING' },
    { at: at('08:15'), source: '규칙 추출', message: '[예시] 나래지구 소득 기준 표 1개 미추출', level: 'WARNING' },
  ],
};
