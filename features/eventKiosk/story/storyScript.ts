/**
 * Product Story — 처음 온 사람에게 완판e 가 무엇을 해 주는지 화면 변화로 보여 주는 짧은 서사.
 *
 * UI Motion(상태 변화 피드백, design/motion 토큰)과는 다른 계층이다. 여기 시간은 '한 장면을 읽고 이해하는 시간'이라
 * micro motion 토큰으로 표현하지 않고 장면 단위로 정한다. 장면마다 문장 하나, 그림 하나.
 */
export type StorySceneId = 'complexity' | 'profile' | 'analysis' | 'sorting' | 'action';

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
    id: 'complexity',
    message: () => '나에게 맞는 청약,\n공고마다 직접 확인하고 계신가요?',
    description: region => `${region} 공고 카드 여러 장과 소득·무주택·거주기간 같은 조건이 겹쳐 보여요.`,
    holdMs: 1800,
    buildMs: 1200,
  },
  {
    id: 'profile',
    message: () => '내 조건은 한 번만.',
    description: () => '공고들이 뒤로 물러나고, 나이·혼인·자녀·무주택·청약통장 정보가 하나의 프로필로 모여요.',
    holdMs: 1900,
    buildMs: 1400,
  },
  {
    id: 'analysis',
    message: () => '한 번의 프로필로\n모든 공고를 함께 판단해요.',
    description: region => `내 프로필에서 ${region} 공고마다 선이 동시에 이어지고, 같은 다섯 가지 조건이 모든 공고에서 함께 검사된 뒤 공고마다 결과가 정해져요.`,
    holdMs: 3600,
    buildMs: 3000,
  },
  {
    id: 'sorting',
    message: () => '어디에 신청할 수 있는지,\n왜 가능한지까지 알려 드려요.',
    description: () => '공급유형이 색으로 구분된 신청 가능·조건 확인·신청 어려움 세 묶음으로 나뉘고, 신청 가능한 하나가 강조되며 어디에·왜·무엇을 알려 줘요.',
    holdMs: 3000,
    buildMs: 2300,
  },
  {
    id: 'action',
    message: () => '신청할 집을 확인하고\n바로 시작하세요.',
    description: () => '선택한 주택이 커지며 대표 이미지, 신청 가능 상태, 접수 일정, AI에게 물어보기가 차례로 나타나요.',
    holdMs: 0,
    buildMs: 1400,
  },
] as const;

/**
 * 마지막 장면에 닿기까지 자동 재생 시간. 마지막 장면 그림까지 더해 10~13초 안.
 * 장면 1·2(문제·입력)는 짧게, 3·4(완판e 가 하는 일)는 길게 머문다.
 */
export const STORY_AUTOPLAY_MS = STORY_SCENES.reduce((sum, scene) => sum + scene.holdMs, 0);

export function nextSceneIndex(index: number): number | null {
  return index + 1 < STORY_SCENES.length ? index + 1 : null;
}

export const isLastScene = (index: number): boolean => index === STORY_SCENES.length - 1;
