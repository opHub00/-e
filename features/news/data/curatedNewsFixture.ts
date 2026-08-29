import type { RawNewsRecord } from './NewsProvider.ts';

type CuratedFixtureSeed = {
  title: string;
  description: string;
  originalUrl: string;
  daysAgo: number;
};

/**
 * 실시간 기사를 가장하지 않는 장애 대응용 공식 확인 경로다.
 * 발행 시점은 dataset 조회일 기준으로 생성되고, UI는 source.kind === 'fixture'를 표시할 수 있다.
 */
const CURATED_FIXTURE_SEEDS: readonly CuratedFixtureSeed[] = [
  {
    title: '청약Home 공식 모집공고 확인 안내',
    description: '주택청약 일정과 세부 조건은 청약Home의 최신 입주자 모집공고 원문에서 확인해 주세요.',
    originalUrl: 'https://www.applyhome.co.kr/co/coa/selectMainView.do',
    daysAgo: 0,
  },
  {
    title: '마이홈 청년 주거 지원 정보 확인 안내',
    description: '청년 주거 정책과 지원 정보는 마이홈 포털의 최신 공식 안내를 기준으로 확인해 주세요.',
    originalUrl: 'https://www.myhome.go.kr/hws/portal/main/getMgtMainPage.do',
    daysAgo: 1,
  },
  {
    title: '국토교통부 주택 정책 보도자료 확인 안내',
    description: '청약 제도와 주택 정책의 변경 여부는 국토교통부 보도자료와 공식 발표에서 확인해 주세요.',
    originalUrl: 'https://www.molit.go.kr/USR/NEWS/m_71/lst.jsp',
    daysAgo: 2,
  },
  {
    title: 'LH 분양·임대 공고 확인 안내',
    description: '공급 일정과 신청 전 확인사항은 LH의 최신 분양·임대 공고 원문에서 확인해 주세요.',
    originalUrl: 'https://apply.lh.or.kr/',
    daysAgo: 3,
  },
  {
    title: '서울주거포털 청년 주거 정책 확인 안내',
    description: '서울 지역 청년 주거 정책은 서울주거포털의 최신 공지와 사업 안내를 확인해 주세요.',
    originalUrl: 'https://housing.seoul.go.kr/',
    daysAgo: 4,
  },
];

export function createCuratedNewsFixture(referenceDate: Date): RawNewsRecord[] {
  const safeReference = Number.isFinite(referenceDate.getTime()) ? referenceDate : new Date();
  return CURATED_FIXTURE_SEEDS.map((seed) => ({
    title: seed.title,
    description: seed.description,
    originallink: seed.originalUrl,
    link: seed.originalUrl,
    pubDate: new Date(safeReference.getTime() - seed.daysAgo * 24 * 60 * 60 * 1000).toUTCString(),
  }));
}
