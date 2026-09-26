/**
 * 공고 대표 이미지 자동 매칭.
 *
 * 규칙은 하나다: **그 공고의 공식 출처가 스스로 내건 이미지만** 후보가 된다.
 * 단지명이 비슷하다는 이유로 다른 아파트 사진을 붙이지 않는다. 출처를 모르는 이미지도 쓰지 않는다.
 * 생성 이미지는 후보에 넣지 않는다.
 *
 * 자동으로 확인할 수 있는 것과 없는 것을 나눈다.
 *  - 자동 확인 가능: 이 페이지가 공식 데이터(청약홈 HMPG_ADRES)에 그 공고의 홈페이지로 적혀 있는가,
 *    이미지가 실제로 받아지는가, 이미지 형식인가.
 *  - 자동 확인 불가: 재사용 허가. 그래서 허가가 기록되기 전에는 verified 가 되지 않고 화면에 나가지 않는다.
 */
export type ListingVisualSourceType =
  /** 공고문·공급기관이 낸 공식 공고 페이지 */
  | 'official_announcement'
  /** 공식 분양/사업 홈페이지(공고 데이터에 적힌 주소) */
  | 'official_project_page'
  /** 사람이 이미 검증해 등록해 둔 사진 */
  | 'verified_registry';

/** 재사용 허가는 사람이 확인해 기록한다. 자동으로 채우지 않는다. */
export type ReusePermission = { basis: 'open-license' | 'written-permission'; referenceUrl: string };

export type ListingVisualRecord = {
  listingId: string;
  imageUrl: string;
  sourceUrl: string;
  sourceType: ListingVisualSourceType;
  /** 화면에 내보내도 되는가. 출처 확인 + 재사용 허가가 모두 있어야 true. */
  verified: boolean;
  fetchedAt: string;
  /** 어떤 공고의 이미지인지 못 박는다. 다른 단지 사진이 섞이는 것을 막는 열쇠다. */
  announcementNo: string;
  announcementTitle: string;
  /** 자동으로 확인한 사실. 사람이 다시 볼 때 근거가 된다. */
  checks: { officialHomepageMatch: boolean; imageFetched: boolean; contentType: string | null; byteLength: number | null };
  reusePermission: ReusePermission | null;
  /** verified 가 아닌 이유. 화면·관리자에 그대로 보여 준다. */
  blockedReason: string | null;
};

const HTTPS = (value: string) => {
  try { return new URL(value).protocol === 'https:'; } catch { return false; }
};

/** 페이지가 내건 대표 이미지(og:image)를 절대 URL 로 바꾼다. 없으면 null. */
export function representativeImageUrl(html: string, pageUrl: string): string | null {
  const meta = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
    ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
  if (!meta) return null;
  try { return new URL(meta[1], pageUrl).toString(); } catch { return null; }
}

export type ResolveInput = {
  listingId: string;
  announcementNo: string;
  announcementTitle: string;
  /** 공고 데이터(HMPG_ADRES)에 적힌 공식 홈페이지. 이 값이 없으면 후보를 만들지 않는다. */
  officialHomepage: string | null;
  imageUrl: string | null;
  sourceUrl: string | null;
  sourceType: ListingVisualSourceType;
  fetch: { ok: boolean; contentType: string | null; byteLength: number | null };
  reusePermission?: ReusePermission | null;
  fetchedAt: string;
};

const IMAGE_TYPE = /^image\/(png|jpe?g|webp|avif)/i;

/**
 * 사이트 전체가 공유하는 브랜드·SEO 이미지인지 본다.
 * og:image 는 흔히 단지 사진이 아니라 회사 로고다. 그런 그림을 단지 사진처럼 내보내면 안 된다.
 * 확실하지 않으면 막는 쪽으로 기운다(막히면 기존 fallback 이 나온다).
 */
export function looksSiteWideBrandImage(imageUrl: string): boolean {
  try {
    const path = new URL(imageUrl).pathname.toLowerCase();
    return /\/(common|shared|assets\/images\/common)\//.test(path)
      || /(^|\/)(og|og_img|og-image|seo|logo|brand|share)[-_.]?[a-z0-9]*\.(png|jpe?g|webp|avif)$/.test(path)
      || /_seo\.|_logo\./.test(path);
  } catch { return true; }
}

/**
 * 후보 하나를 기록으로 만든다. 통과하지 못한 이유를 반드시 남긴다.
 * 이유 없이 화면에서 사라지면 운영자가 원인을 못 찾는다.
 */
export function buildVisualRecord(input: ResolveInput): ListingVisualRecord {
  const officialHomepageMatch = Boolean(
    input.officialHomepage && input.sourceUrl && sameOrigin(input.officialHomepage, input.sourceUrl),
  );
  const imageFetched = input.fetch.ok && IMAGE_TYPE.test(input.fetch.contentType ?? '') && (input.fetch.byteLength ?? 0) > 2048;
  const permission = input.reusePermission ?? null;
  const reasons: string[] = [];
  if (!input.imageUrl || !HTTPS(input.imageUrl)) reasons.push('이미지 주소가 https 가 아니거나 없어요.');
  if (!officialHomepageMatch) reasons.push('이 공고의 공식 홈페이지에서 온 이미지가 아니에요.');
  if (!imageFetched) reasons.push('이미지를 실제로 받아 확인하지 못했어요.');
  if (input.imageUrl && looksSiteWideBrandImage(input.imageUrl)) {
    reasons.push('사이트 공통 브랜드·SEO 이미지로 보여요. 이 단지 사진이라고 볼 수 없어요.');
  }
  if (!permission) reasons.push('재사용 허가가 기록되지 않았어요. 사람이 확인해 적어야 화면에 나가요.');
  return {
    listingId: input.listingId,
    imageUrl: input.imageUrl ?? '',
    sourceUrl: input.sourceUrl ?? '',
    sourceType: input.sourceType,
    verified: reasons.length === 0,
    fetchedAt: input.fetchedAt,
    announcementNo: input.announcementNo,
    announcementTitle: input.announcementTitle,
    checks: { officialHomepageMatch, imageFetched, contentType: input.fetch.contentType, byteLength: input.fetch.byteLength },
    reusePermission: permission,
    blockedReason: reasons.length ? reasons.join(' ') : null,
  };
}

export function sameOrigin(left: string, right: string): boolean {
  try { return new URL(left).origin === new URL(right).origin; } catch { return false; }
}

/** 출처 우선순위. 같은 공고에 후보가 여럿이면 위쪽을 쓴다. */
export const SOURCE_PRIORITY: ListingVisualSourceType[] = ['official_announcement', 'official_project_page', 'verified_registry'];

export function pickBest(records: ListingVisualRecord[]): ListingVisualRecord | null {
  const usable = records.filter(record => record.verified);
  if (!usable.length) return null;
  return usable.slice().sort((a, b) => SOURCE_PRIORITY.indexOf(a.sourceType) - SOURCE_PRIORITY.indexOf(b.sourceType))[0];
}
