import { listingMedia, type ListingMedia, type ListingMediaImage } from './listingMedia.ts';

const LH_JEJU_HAPPINESS_SOURCE = 'https://apply.lh.or.kr/lhapply/apply/wt/wrtanc/selectWrtancInfo.do?aisTpCd=10&ccrCnntSysDsCd=03&mi=1026&panId=2015122300020804&uppAisTpCd=06';

/** Official presentation assets only. Rule evaluation never reads this registry. */
const OFFICIAL_IMAGES_BY_SOURCE_ID: Readonly<Record<string, readonly ListingMediaImage[]>> = {
  'lh:pan:2015122300020804': [
    {
      uri: 'https://apply.lh.or.kr/upload/Files/upload_dec/2021/LSE/12/01/2021120146460281.jpg',
      alt: '제주일도이동 행복주택 단지 조감도',
      sourceLabel: 'LH청약플러스',
      sourceUrl: LH_JEJU_HAPPINESS_SOURCE,
      attribution: '한국토지주택공사 공식 공고 제공',
      license: null,
      kind: 'render',
      primary: true,
    },
    {
      uri: 'https://apply.lh.or.kr/upload/Files/upload_dec/2022/LSE/06/09/2022060948717453.jpg',
      alt: '제주삼도이동 H-1BL 행복주택 단지 조감도',
      sourceLabel: 'LH청약플러스',
      sourceUrl: LH_JEJU_HAPPINESS_SOURCE,
      attribution: '한국토지주택공사 공식 공고 제공',
      license: null,
      kind: 'render',
      primary: false,
    },
    {
      uri: 'https://apply.lh.or.kr/upload/Files/upload_dec/2022/LSE/06/09/2022060948717789.jpg',
      alt: '제주삼도이동 H-2BL 행복주택 단지 조감도',
      sourceLabel: 'LH청약플러스',
      sourceUrl: LH_JEJU_HAPPINESS_SOURCE,
      attribution: '한국토지주택공사 공식 공고 제공',
      license: null,
      kind: 'render',
      primary: false,
    },
  ],
};

export function officialListingMediaImages(sourceId: string): readonly ListingMediaImage[] {
  return OFFICIAL_IMAGES_BY_SOURCE_ID[sourceId] ?? [];
}

export function officialListingMedia(sourceId: string, title: string): ListingMedia {
  return listingMedia(officialListingMediaImages(sourceId), title);
}
