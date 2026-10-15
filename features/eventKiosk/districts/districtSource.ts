import type { CodexDistrictPresentation } from './districtContract.ts';

/**
 * Codex 1·2지구 presentation 값의 단일 연결 지점.
 *
 * Codex 가 지구별 판정·분양가·토지임대료·일정을 제공하면 여기서만 CodexDistrictPresentation[] 으로 바꿔 돌려준다.
 * (예: 2지구 rule package 의 inventory·schedule·costs, 2지구 판정 결과 요약)
 * 지금은 연결된 값이 없어 null — 화면은 없는 값을 '공고 데이터 연결 전'으로 보여 준다.
 */
export function codexDistrictPresentation(): CodexDistrictPresentation[] | null {
  return null;
}

/**
 * 레이아웃 점검 전용 예시 값(Demo Mode 의 ?layout=sample 에서만). 실제 공고 값이 아니며
 * 화면 맨 위에 '레이아웃 점검용 예시'가 크게 표시된다. 행사 사용자 경로에서는 쓰지 않는다.
 * 숫자는 긴 금액·날짜가 들어갔을 때 줄바꿈·넘침을 보려는 자리 채움이다.
 */
export const DISTRICT_LAYOUT_SAMPLE: CodexDistrictPresentation[] = [
  {
    id: 'D1',
    costs: { salePrice49: 123_450_000, salePrice59: 234_560_000, monthlyLandRent49: 123_400, monthlyLandRent59: 234_500 },
    source: { status: 'LAYOUT_SAMPLE', label: '레이아웃 점검용 예시' },
  },
  {
    id: 'D2',
    costs: { salePrice49: 135_790_000, salePrice59: 246_800_000, monthlyLandRent49: 135_700, monthlyLandRent59: 246_800 },
    schedule: { special: '2099-12-01', generalFirst: '2099-12-02', generalSecond: '2099-12-03', winnerAnnouncement: '2099-12-09' },
    assessment: { status: 'READY', recommendedSupply: '생애최초 특별공급', eligibility: 'EVIDENCE_REQUIRED', priorityStage: '우선공급', officialScore: { status: 'NOT_APPLICABLE' }, supplyCount: 6 },
    source: { status: 'LAYOUT_SAMPLE', label: '레이아웃 점검용 예시' },
  },
];
