/**
 * 공고 대표 이미지 자동 매칭.
 *
 * 규칙은 하나다: **그 공고의 공식 분양/공급기관 사이트가 스스로 올린 이미지만** 후보가 된다.
 * 단지명이 비슷하다는 이유로 다른 아파트 사진을 쓰지 않고, 출처를 모르는 이미지도, 생성 이미지도 쓰지 않는다.
 *
 * og:image 하나만 보지 않는다. 그 값은 대개 회사 로고이기 때문이다. 페이지 안의 이미지를 모아
 * 단지 사진일 가능성을 점수로 매기고, 로고·SEO·공용 배너는 걸러 낸다. 확신이 서지 않으면 막는 쪽으로 기운다.
 */
export type ListingVisualSourceType =
  /** 공식 분양 홈페이지의 hero·main visual */
  | 'official_hero'
  /** 공식 홈페이지의 조감도·투시도·gallery */
  | 'official_gallery'
  /** 단지배치도·대표 건축 이미지 */
  | 'official_sitemap'
  /** 공급기관·press 페이지 대표 이미지 */
  | 'official_press'
  /** 사람이 검증해 등록해 둔 사진 */
  | 'verified_registry';

/** 출처 우선순위. 같은 공고에 후보가 여럿이면 위쪽을 먼저 본다. */
export const SOURCE_PRIORITY: ListingVisualSourceType[] = [
  'official_hero', 'official_gallery', 'official_sitemap', 'official_press', 'verified_registry',
];

export type ReusePermission = { basis: 'open-license' | 'written-permission'; referenceUrl: string };

export type ListingVisualRecord = {
  listingId: string;
  imageUrl: string;
  sourceUrl: string;
  sourceType: ListingVisualSourceType;
  /** 화면에 내보내도 되는가. 아래 검증을 모두 통과해야 true. */
  verified: boolean;
  fetchedAt: string;
  /** 0~1. 이 이미지가 그 단지의 대표 사진일 가능성. */
  confidence: number;
  /** 왜 그렇게 봤는지. 사람이 다시 볼 때 근거가 된다. */
  evidence: string[];
  announcementNo: string;
  announcementTitle: string;
  width: number | null;
  height: number | null;
  byteLength: number | null;
  contentType: string | null;
  reusePermission: ReusePermission | null;
  /** verified 가 아닌 이유. 비어 있으면 통과. */
  blockedReason: string | null;
};

const httpsUrl = (value: string) => {
  try { return new URL(value).protocol === 'https:'; } catch { return false; }
};

export function sameOrigin(left: string, right: string): boolean {
  try { return new URL(left).origin === new URL(right).origin; } catch { return false; }
}

/** 로고·SEO·공용 배너처럼 단지와 무관한 그림. 하나라도 걸리면 후보에서 뺀다. */
const EXCLUDED = [
  /\/(common|shared|global|layout)\//,
  /(^|\/)(og|og_img|og-image|seo|logo|brand|favicon|share|sprite|icon|ico)[-_.]?[a-z0-9]*\.(png|jpe?g|webp|avif|gif|svg)$/,
  /_seo\.|_logo\.|_icon\./,
  /\/(banner|bnr|popup|pop)[-_/]/,
  /\.(svg|gif)$/,
];

export function isExcludedImage(imageUrl: string): boolean {
  try {
    const path = new URL(imageUrl).pathname.toLowerCase();
    return EXCLUDED.some(pattern => pattern.test(path));
  } catch { return true; }
}

/** 단지 사진을 가리키는 낱말. 경로·alt 어디에 있어도 같은 무게로 본다. */
const POSITIVE = [
  { pattern: /(조감도|투시도|전경|외관|단지|아파트)/, score: 0.35, label: '조감도·투시도·전경 표현' },
  { pattern: /(aerial|perspective|exterior|complex|landscape)/i, score: 0.3, label: '영문 조감도·외관 표현' },
  { pattern: /(visual|main|hero|top)[-_/]?\d*\.(png|jpe?g|webp|avif)$/i, score: 0.25, label: '메인 비주얼 경로' },
  { pattern: /(gallery|photo|view|img\/main|main\/)/i, score: 0.2, label: '갤러리·메인 이미지 경로' },
  { pattern: /(배치도|평면도|sitemap|siteplan)/i, score: 0.15, label: '단지배치도 표현' },
];

export type CandidateInput = {
  imageUrl: string;
  /** 이미지가 실린 페이지 */
  pageUrl: string;
  /** 공고 데이터(HMPG_ADRES)에 적힌 그 공고의 공식 홈페이지 */
  officialHomepage: string | null;
  alt: string;
  pageTitle: string;
  announcementTitle: string;
  sourceType: ListingVisualSourceType;
  width: number | null;
  height: number | null;
  byteLength: number | null;
  contentType: string | null;
};

/** 단지명에서 비교에 쓸 낱말을 뽑는다. 괄호·블록 표기는 버린다. */
export function nameTokens(title: string): string[] {
  return title
    .replace(/\(.*?\)/g, ' ')
    .split(/[\s·,]+/)
    .map(token => token.replace(/[^가-힣A-Za-z0-9]/g, ''))
    .filter(token => token.length >= 2 && !/^(공공분양주택|분양주택|아파트|주택|특별공급)$/.test(token));
}

const MIN_WIDTH = 640;
const MIN_HEIGHT = 360;
const MIN_BYTES = 20_000;
const IMAGE_TYPE = /^image\/(png|jpe?g|webp|avif)/i;

export type Scored = { confidence: number; evidence: string[]; blocked: string[] };

/**
 * 후보 하나를 점수로 매긴다.
 * 점수는 "이 그림이 이 단지의 대표 사진일 가능성"이고, blocked 는 통과할 수 없는 이유다.
 */
export function scoreCandidate(input: CandidateInput): Scored {
  const evidence: string[] = [];
  const blocked: string[] = [];
  let confidence = 0;

  if (!httpsUrl(input.imageUrl)) blocked.push('이미지 주소가 https 가 아니에요.');
  const official = Boolean(input.officialHomepage && sameOrigin(input.officialHomepage, input.imageUrl));
  if (official) { confidence += 0.4; evidence.push('공고에 적힌 공식 홈페이지와 같은 도메인이에요.'); }
  else blocked.push('이 공고의 공식 홈페이지 도메인이 아니에요.');

  if (isExcludedImage(input.imageUrl)) blocked.push('로고·SEO·공용 배너로 보이는 경로예요.');

  const haystack = `${decodeURIComponent(input.imageUrl)} ${input.alt} ${input.pageTitle}`;
  for (const rule of POSITIVE) {
    if (rule.pattern.test(haystack)) { confidence += rule.score; evidence.push(rule.label); }
  }

  const tokens = nameTokens(input.announcementTitle);
  const matched = tokens.filter(token => `${input.alt} ${input.pageTitle}`.includes(token));
  if (matched.length) { confidence += 0.2; evidence.push(`페이지에 단지명 조각(${matched.slice(0, 2).join(', ')})이 있어요.`); }

  if (!IMAGE_TYPE.test(input.contentType ?? '')) blocked.push('이미지 형식이 아니에요.');
  if ((input.byteLength ?? 0) < MIN_BYTES) blocked.push('파일이 너무 작아 대표 사진으로 보기 어려워요.');
  if (input.width !== null && input.height !== null) {
    if (input.width < MIN_WIDTH || input.height < MIN_HEIGHT) {
      blocked.push(`해상도가 작아요(${input.width}×${input.height}, 최소 ${MIN_WIDTH}×${MIN_HEIGHT}).`);
    } else {
      confidence += 0.15;
      evidence.push(`해상도 ${input.width}×${input.height}`);
    }
  } else if (!blocked.length) {
    blocked.push('이미지 크기를 읽지 못했어요.');
  }

  return { confidence: Math.min(1, Math.round(confidence * 100) / 100), evidence, blocked };
}

export type RecordInput = CandidateInput & {
  listingId: string;
  announcementNo: string;
  fetchedAt: string;
  reusePermission?: ReusePermission | null;
};

/** 최소 confidence. 이보다 낮으면 근거가 약해 화면에 내보내지 않는다. */
export const MIN_CONFIDENCE = 0.6;

export function buildVisualRecord(input: RecordInput): ListingVisualRecord {
  const scored = scoreCandidate(input);
  const blocked = [...scored.blocked];
  if (!blocked.length && scored.confidence < MIN_CONFIDENCE) {
    blocked.push(`근거가 약해요(confidence ${scored.confidence} < ${MIN_CONFIDENCE}).`);
  }
  return {
    listingId: input.listingId,
    imageUrl: input.imageUrl,
    sourceUrl: input.pageUrl,
    sourceType: input.sourceType,
    verified: blocked.length === 0,
    fetchedAt: input.fetchedAt,
    confidence: scored.confidence,
    evidence: scored.evidence,
    announcementNo: input.announcementNo,
    announcementTitle: input.announcementTitle,
    width: input.width,
    height: input.height,
    byteLength: input.byteLength,
    contentType: input.contentType,
    reusePermission: input.reusePermission ?? null,
    blockedReason: blocked.length ? blocked.join(' ') : null,
  };
}

/** 통과한 후보 중 출처 우선순위 → confidence 순으로 하나를 고른다. */
export function pickBest(records: ListingVisualRecord[]): ListingVisualRecord | null {
  const usable = records.filter(record => record.verified);
  if (!usable.length) return null;
  return usable.slice().sort((left, right) =>
    SOURCE_PRIORITY.indexOf(left.sourceType) - SOURCE_PRIORITY.indexOf(right.sourceType)
    || right.confidence - left.confidence)[0];
}

/** PNG·JPEG·WebP 머리 부분에서 가로·세로를 읽는다. 못 읽으면 null. */
export function imageDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length > 24 && bytes[0] === 0x89 && bytes[1] === 0x50) {
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) { offset += 1; continue; }
      const marker = bytes[offset + 1];
      const length = view.getUint16(offset + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { height: view.getUint16(offset + 5), width: view.getUint16(offset + 7) };
      }
      offset += 2 + length;
    }
    return null;
  }
  if (bytes.length > 30 && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP') {
    const format = String.fromCharCode(...bytes.slice(12, 16));
    if (format === 'VP8X') return { width: 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16)), height: 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16)) };
    if (format === 'VP8 ') return { width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff };
    if (format === 'VP8L') {
      const bits = bytes[21] | (bytes[22] << 8) | (bytes[23] << 16) | (bytes[24] << 24);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
  }
  return null;
}
