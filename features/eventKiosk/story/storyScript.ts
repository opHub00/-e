/**
 * Product Story — 삼도이동 1지구 행사용. 한 공고 안에서 '어떤 유형으로 신청하는 게 유리한가'를
 * 차분하게 보여 주는 짧은 서사(공공 청약 서비스 톤, 광고 영상처럼 만들지 않는다).
 *
 * UI Motion(상태 변화 피드백, design/motion 토큰)과는 다른 계층이다. 여기 시간은 '한 장면을 읽고 이해하는 시간'이라
 * micro motion 토큰으로 표현하지 않고 장면 단위로 정한다. 장면마다 문장 하나, 그림 하나.
 */
export type StorySceneId = 'supplies' | 'conditions' | 'check' | 'compare' | 'result';

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
    id: 'supplies',
    message: () => '같은 공고라도\n신청할 수 있는 유형은 다릅니다',
    description: region => `${region} 공고문 아래로 청년·신혼부부·신생아·생애최초·일반공급 다섯 가지 신청유형과 유형별 공급 세대수가 나타나요.`,
    holdMs: 2400,
    buildMs: 1700,
  },
  {
    id: 'conditions',
    message: () => '내 조건에 따라\n자격과 순위가 달라집니다',
    description: () => '나이·혼인·자녀·무주택·소득·자산·청약통장 조건이 차례로 나타나고, 이 조건이 자격과 공급 단계·순위를 정한다는 표시로 이어져요.',
    holdMs: 2400,
    buildMs: 1800,
  },
  {
    id: 'check',
    message: region => `완판e가 ${region} 공고 기준으로\n하나씩 확인합니다`,
    description: region => `${region} 공고문에서 거주·무주택·소득·자산·청약통장 조건을 뽑아내고, 입력한 정보와 하나씩 비교해 표시해요.`,
    holdMs: 2800,
    buildMs: 2200,
  },
  {
    id: 'compare',
    message: () => '신청 가능한 유형을 비교하고',
    description: () => '다섯 가지 신청유형 카드에 신청 가능·서류 확인 필요·신청 어려움 판정이 차례로 붙어요. 예시 화면이에요.',
    holdMs: 2600,
    buildMs: 2000,
  },
  {
    id: 'result',
    message: () => '가장 유리한 신청유형과\n이유를 보여드립니다',
    description: () => '추천 신청유형, 공식 가점, 충족한 자격 기준, 접수일이 담긴 결과 카드가 나타나요. 예시 화면이에요.',
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
