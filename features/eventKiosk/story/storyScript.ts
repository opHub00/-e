/**
 * Product Story — 삼도이동 토지임대부 분양주택 1·2지구 통합 행사용. 한 번 입력해 두 지구의 신청 선택지를
 * 비교한다는 것을 차분하게 보여 주는 짧은 서사(공공 청약 서비스 톤, 광고 영상처럼 만들지 않는다).
 *
 * UI Motion(상태 변화 피드백, design/motion 토큰)과는 다른 계층이다. 여기 시간은 '한 장면을 읽고 이해하는 시간'이라
 * micro motion 토큰으로 표현하지 않고 장면 단위로 정한다. 장면마다 문장 하나, 그림 하나.
 */
export type StorySceneId = 'districts' | 'profile' | 'check' | 'compare' | 'result';

export type StoryScene = {
  id: StorySceneId;
  /** 화면 위 큰 문장. 줄바꿈은 \n. */
  message: (region: string) => string;
  /** 화면을 못 보는 사람을 위한 장면 설명. */
  description: (region: string) => string;
  /** 자동으로 다음 장면으로 넘어가기까지의 시간. 마지막 장면은 0 = 멈춰서 CTA 를 기다린다. */
  holdMs: number;
  /** 장면 안 그림이 완성되기까지의 시간. holdMs 보다 짧아야 완성된 상태를 읽을 시간이 남는다. */
  buildMs: number;
};

export const STORY_SCENES: readonly StoryScene[] = [
  {
    id: 'districts',
    message: () => '삼도이동에는\n1지구와 2지구가 있습니다',
    description: () => '삼도이동 토지임대부 분양주택 아래로 1지구와 2지구 카드가 나타나고, 지구별 총 세대와 49㎡·59㎡ 세대수가 보여요.',
    holdMs: 2400,
    buildMs: 1700,
  },
  {
    id: 'profile',
    message: () => '내 조건은\n한 번만 입력하면 됩니다',
    description: () => '나이·혼인·자녀·무주택·소득·자산·청약통장 조건이 한 장의 내 조건 카드로 모여요.',
    holdMs: 2400,
    buildMs: 1800,
  },
  {
    id: 'check',
    message: () => '완판e가 두 지구의 신청유형을\n각각 확인합니다',
    description: () => '내 조건 카드에서 1지구와 2지구로 선이 이어지고, 지구마다 청년·신혼부부·신생아·생애최초·일반공급을 하나씩 확인해요.',
    holdMs: 2800,
    buildMs: 2200,
  },
  {
    id: 'compare',
    message: () => '자격·순위·공급조건을\n나란히 비교하고',
    description: () => '1지구와 2지구를 두 칸으로 놓고 자격, 우선단계, 공급세대, 분양가·토지임대료를 한 줄씩 비교해요. 예시 화면이에요.',
    holdMs: 2600,
    buildMs: 2000,
  },
  {
    id: 'result',
    message: () => '나에게 맞는 선택지와\n신청 일정을 보여드립니다',
    description: () => '지구별 추천 공급유형 카드와 특별공급·일반 1순위·일반 2순위·당첨자 발표 일정이 나타나요. 예시 화면이에요.',
    holdMs: 0,
    buildMs: 1600,
  },
] as const;

/** 마지막 장면에 닿기까지 자동 재생 시간. 마지막 그림 완성까지 합쳐 약 10~12초. */
export const STORY_AUTOPLAY_MS = STORY_SCENES.reduce((sum, scene) => sum + scene.holdMs, 0);

export function nextSceneIndex(index: number): number | null {
  return index + 1 < STORY_SCENES.length ? index + 1 : null;
}

export const isLastScene = (index: number): boolean => index === STORY_SCENES.length - 1;
