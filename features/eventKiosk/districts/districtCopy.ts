import { DISTRICT_PROGRAM_TITLE } from './districtAdapter.ts';

/** 1·2지구 통합 행사 화면 문구(UI 담당). 숫자는 넣지 않는다 — 숫자는 adapter 의 공고 값에서 온다. */
export const DISTRICT_COPY = {
  programTitle: DISTRICT_PROGRAM_TITLE,
  eyebrow: '삼도이동 토지임대부 분양주택 1·2지구 통합 분석',
  landingTitle: '1·2지구를 한 번에 비교해 보세요',
  landingSubtitle: '정보를 한 번만 입력하면 두 지구에서 신청할 수 있는 유형과 우선단계, 공급 조건을 나란히 보여드려요.',
  landingCta: '내 신청유형 비교하기',
  chatContext: '삼도이동 1·2지구 공고 상담',
  chatSuggestions: ['1지구와 2지구 차이', '59㎡ 토지임대료 비교', '내가 둘 다 신청 가능한지', '신청 일정'],
} as const;
