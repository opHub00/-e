/** 개인화 문구를 어떤 프로필 정보로 만들지 고른다. 없으면 personalTip 을 그대로 쓴다. */
export type QuizTopic = 'account' | 'timing' | 'future' | 'score' | 'profile';

export type Quiz = {
  id: string;
  question: string;
  answer: boolean;
  explanation: string;
  personalTip: string;
  topic?: QuizTopic;
};

export const quizzes: Quiz[] = [
  {
    id: 'q1',
    question: '청약통장은 오래 유지할수록 준비에 도움이 될 수 있다?',
    answer: true,
    explanation: '청약에서는 통장 가입 기간이나 납입 이력이 중요하게 활용되는 경우가 있어요.',
    personalTip: '내 가입 기간이 얼마나 되었는지 먼저 확인해보세요.',
    topic: 'account',
  },
  {
    id: 'q2',
    question: '모든 청약의 자격 조건은 완전히 같다?',
    answer: false,
    explanation: '공급 유형과 지역, 주택에 따라 자격 조건이 달라질 수 있어요.',
    personalTip: '공고를 볼 때는 내 조건과 공급 유형을 함께 확인해야 해요.',
    topic: 'profile',
  },
  {
    id: 'q3',
    question: '청약은 신청 직전에만 알아봐도 충분하다?',
    answer: false,
    explanation: '가입 기간이나 무주택 상태처럼 시간이 쌓여야 의미가 생기는 조건이 있어요.',
    personalTip: '지금부터 내 상태를 기록해두면 나중에 훨씬 편해요.',
    topic: 'timing',
  },
  {
    id: 'q4',
    question: '청약통장이 있다고 해서 모든 주택에 바로 신청할 수 있다?',
    answer: false,
    explanation: '통장 외에도 지역, 세대, 소득 등 추가 조건을 확인해야 할 수 있어요.',
    personalTip: '통장은 준비의 시작이지 자동 합격권은 아니에요.',
    topic: 'account',
  },
  {
    id: 'q5',
    question: '내 청약 조건은 시간이 지나면서 바뀔 수 있다?',
    answer: true,
    explanation: '나이, 가입 기간, 거주 기간, 가족 상황 등이 달라질 수 있어요.',
    personalTip: '완판e의 미래 시뮬레이션으로 변화를 먼저 살펴보세요.',
    topic: 'future',
  },
  {
    id: 'q6',
    question: '청약 공고의 모집 일정은 공고마다 다를 수 있다?',
    answer: true,
    explanation: '모집공고, 특별공급, 1순위 등 일정은 공고별로 확인해야 해요.',
    personalTip: '관심 공고는 일정 알림을 따로 관리하는 게 좋아요.',
  },
  {
    id: 'q7',
    question: '청약 정보에서 모르는 용어가 나오면 조건 확인과 무관하다?',
    answer: false,
    explanation: '용어를 잘못 이해하면 내 조건을 잘못 판단할 수 있어요.',
    personalTip: '모르는 표현은 AI 설명 기능으로 바로 풀어보세요.',
  },
  {
    id: 'q8',
    question: '대학생처럼 당장 청약 계획이 없어도 미리 준비할 의미가 있다?',
    answer: true,
    explanation: '시간이 필요한 조건은 일찍 이해하고 관리할수록 선택지가 넓어질 수 있어요.',
    personalTip: '지금은 신청보다 준비 습관을 만드는 단계라고 생각해보세요.',
    topic: 'timing',
  },
  {
    id: 'q9',
    question: '완판e 준비도 70은 실제 당첨 확률 70%라는 뜻이다?',
    answer: false,
    explanation: '완판e 준비도는 서비스 내부의 학습·준비 지표예요.',
    personalTip: '실제 신청 전에는 반드시 공식 공고 기준을 확인해야 해요.',
    topic: 'score',
  },
  {
    id: 'q10',
    question: '청약 조건은 한 번 입력하면 평생 업데이트할 필요가 없다?',
    answer: false,
    explanation: '직업, 소득, 거주지, 가족 구성 등은 계속 달라질 수 있어요.',
    personalTip: '큰 변화가 생겼을 때 내 프로필을 갱신해보세요.',
    topic: 'profile',
  },
];
