/**
 * 공고 대표 이미지·갤러리 자동 매칭.
 *
 * 규칙은 하나다: **그 공고의 공식 분양/공급기관 사이트가 스스로 올린 이미지만** 후보가 된다.
 * 단지명이 비슷하다는 이유로 다른 아파트 사진을 쓰지 않고, 출처를 모르는 이미지도, 생성 이미지도 쓰지 않는다.
 *
 * 여기서 더 나아가, 통과한 이미지가 **무엇을 찍은 그림인지** 나눈다.
 * 같은 공식 홈페이지 안에도 커뮤니티 라운지, 조경, 평면도, 약도가 섞여 있고,
 * 그중 대표로 내걸 수 있는 것은 건물·단지가 주 피사체인 그림뿐이기 때문이다.
 * 판단은 경로·alt·주변 글·섹션 이름·비율만 쓴다. 외부 모델은 쓰지 않는다.
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

/** 그림이 무엇을 찍었는가. 대표 이미지를 고르는 기준이 된다. */
export type ListingSubjectType =
  | 'apartment_exterior'
  | 'complex_overview'
  | 'building_render'
  | 'landscape'
  | 'community'
  | 'floor_plan'
  | 'map'
  | 'brand'
  | 'unknown';

/** 대표 이미지가 될 수 있는 종류. 위쪽이 먼저다. 갤러리 정렬도 같은 순서를 쓴다. */
export const SUBJECT_PRIORITY: ListingSubjectType[] = [
  'apartment_exterior', 'complex_overview', 'building_render', 'landscape', 'community',
];

/** 평면도·약도·브랜드 이미지는 단지 사진이 아니다. 대표에서도 갤러리에서도 뺀다. */
export const NON_SUBJECT: ListingSubjectType[] = ['floor_plan', 'map', 'brand', 'unknown'];

export type ReusePermission = { basis: 'open-license' | 'written-permission'; referenceUrl: string };

export type ListingVisualRecord = {
  listingId: string;
  imageUrl: string;
  sourceUrl: string;
  sourceType: ListingVisualSourceType;
  /** 무엇을 찍은 그림인가. */
  subjectType: ListingSubjectType;
  /** 그렇게 본 근거. */
  subjectEvidence: string[];
  /** 대표 이미지로서의 점수. 0~1. */
  primaryScore: number;
  /** 대표 이미지로 내걸 수 있는가. 건물·단지가 주 피사체여야 true. */
  primaryEligible: boolean;
  /** 같은 그림의 다른 크기를 묶는 열쇠. 갤러리 중복 제거에 쓴다. */
  dedupeKey: string;
  /** 화면에 내보내도 되는가. 아래 검증을 모두 통과해야 true. */
  verified: boolean;
  fetchedAt: string;
  /** 0~1. 이 이미지가 그 단지의 공식 이미지일 가능성. */
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
/** 이보다 납작하면 페이지 머리에 까는 띠다. 단지가 찍혀 있어도 대표로 쓸 그림이 아니다. */
const MAX_BANNER_RATIO = 3.2;

/**
 * 공고·페이지에 적힌 블록 표기(`A11BL`, `B-2BL`, `33BL` 같은 꼴).
 *
 * 한 사업지에 블록이 여럿이면 공고도 블록마다 따로 나온다.
 * 건설사 사이트는 그 블록들을 한 화면에 함께 올려 두기 때문에,
 * 블록을 구분하지 못하면 옆 블록 투시도를 이 공고 사진으로 내걸게 된다.
 * 글자 앞머리(A/B…)는 표기가 들쭉날쭉해 숫자와 BL 만 남겨 비교한다.
 */
export function extractBlockCodes(text: string): string[] {
  // 파일 이름은 소문자로 적히는 일이 많다(`a65bl-view.jpg`). 대소문자를 가리지 않는다.
  const found = (text.match(/[A-Za-z]{0,2}-?\s?\d{1,3}\s?BL\b/gi) ?? [])
    .map(raw => `${raw.replace(/[^0-9]/g, '')}BL`);
  return [...new Set(found)];
}

/** 최소 confidence. 이보다 낮으면 근거가 약해 화면에 내보내지 않는다. */
export const MIN_CONFIDENCE = 0.6;
/** 대표 이미지 최소 점수. 애매하면 대표로 세우지 않고 기존 대체 표현을 남긴다. */
export const MIN_PRIMARY_SCORE = 0.5;
/** 한 공고가 보여 줄 갤러리 장수. */
export const MAX_GALLERY = 5;

/**
 * 주제 판정 규칙.
 *
 * 위에서부터 본다. 평면도·약도·브랜드가 가장 확실한 신호라 먼저 걸러 내고,
 * 커뮤니티·조경은 건물 낱말보다 강하게 본다. `main`·`visual` 같은 자리 이름만으로는
 * 무엇을 찍었는지 알 수 없어, 다른 신호가 없으면 unknown 으로 남긴다.
 */
const SUBJECT_RULES: { subject: ListingSubjectType; pattern: RegExp; label: string }[] = [
  { subject: 'floor_plan', pattern: /(floor[-_]?plan|floorplan|unitplan|type[-_]?plan|평면도|평면|유니트|세대평면)/i, label: '평면도 표현' },
  { subject: 'map', pattern: /(^|[^a-z])(map|sitemap|location|direction|access|way)([^a-z]|$)|약도|위치도|교통도|오시는/i, label: '약도·위치도 표현' },
  // 수상 트로피·패턴·천 같은 장식 배경은 단지와 아무 상관이 없다. 로고와 같은 칸에 둔다.
  { subject: 'brand', pattern: /(logo|brand|^ci$|^bi$|emblem|symbol|watermark|prize|award|trophy|pattern|texture|fabric|bokeh|수상)/i, label: '브랜드·장식 이미지' },
  { subject: 'community', pattern: /(community|club|fitness|gx|pool|sauna|lounge|cafe|library|golf|kids|interior|indoor|커뮤니티|피트니스|수영장|라운지|사우나|골프|독서실|실내)/i, label: '커뮤니티·실내 표현' },
  { subject: 'landscape', pattern: /(landscape|garden|park|green|water[-_]?front|plaza|walk|조경|정원|산책|수경|광장)/i, label: '조경 표현' },
  { subject: 'complex_overview', pattern: /(bird[-_]?view|birdeye|aerial|overview|master[-_]?plan|siteplan|site[-_]?plan|배치도|조감|전경)/i, label: '조감·단지 전경 표현' },
  { subject: 'building_render', pattern: /(perspective|render|cg[-_]|투시|투시도)/i, label: '투시도 표현' },
  { subject: 'apartment_exterior', pattern: /(apartment|apt|exterior|elevation|tower|facade|외관|입면|동배치|아파트|단지)/i, label: '외관·단지 표현' },
];

/** `xxx_bg.jpg` 처럼 섹션 배경임을 이름으로 밝힌 파일. */
const SECTION_BACKGROUND = /[a-z0-9]+[-_](bg|background)[-_]?\d*\.(png|jpe?g|webp|avif)(\?|$)/i;
/** 그중 첫 화면 대표 그림은 남긴다. */
const MAIN_BACKGROUND = /(hero|main|visual|key|top)[-_]?(bg|background)/i;

/** 건물이 찍혔다고 볼 만한 낱말. 조경·커뮤니티 그림이 대표로 올라오려면 이 신호가 있어야 한다. */
const BUILDING_HINT = /(apartment|apt|complex|building|exterior|elevation|tower|facade|bird[-_]?view|aerial|overview|perspective|아파트|단지|외관|입면|조감|투시|전경)/i;
/** 대표 점수를 크게 깎는 낱말. */
const PRIMARY_PENALTY = /(community[-_]?img|community|garden|landscape|club|fitness|pool|interior|floor[-_]?plan|unit|map|location|커뮤니티|조경|정원|평면|약도)/i;
/** 대표 점수를 올리는 낱말. */
const PRIMARY_BONUS = /(apt|apartment|complex|building|exterior|bird[-_]?view|overview|main|visual|perspective|elevation|tower|아파트|단지|외관|조감|투시|전경)/i;

export type CandidateInput = {
  imageUrl: string;
  /** 이미지가 실린 페이지 */
  pageUrl: string;
  /** 공고 데이터(HMPG_ADRES)에 적힌 그 공고의 공식 홈페이지 */
  officialHomepage: string | null;
  alt: string;
  /** img 의 title 속성 */
  title?: string;
  /** 이미지 둘레의 글. 캡션이나 같은 칸의 제목. */
  nearbyText?: string;
  /** 이미지를 담은 섹션의 id·class 이름. */
  sectionHint?: string;
  pageTitle: string;
  announcementTitle: string;
  sourceType: ListingVisualSourceType;
  width: number | null;
  height: number | null;
  byteLength: number | null;
  contentType: string | null;
  /** 크롤러가 돈 페이지들의 글에서 찾은 블록 표기. 이 사이트가 몇 개 블록을 함께 다루는지 알려 준다. */
  siteBlockCodes?: string[];
};

/** 판정에 쓰는 모든 글을 한 줄로 모은다. 경로는 한글이 섞일 수 있어 풀어 둔다. */
function signalsOf(input: CandidateInput): string {
  let path = input.imageUrl;
  try { path = decodeURIComponent(input.imageUrl); } catch { /* 잘못된 인코딩은 원문을 그대로 쓴다 */ }
  return [path, input.alt, input.title, input.nearbyText, input.sectionHint].filter(Boolean).join(' ');
}

export type SubjectVerdict = { subject: ListingSubjectType; evidence: string[] };

/** 무엇을 찍은 그림인지 나눈다. 확신이 없으면 unknown 으로 남기고 대표로 세우지 않는다. */
export function classifySubject(input: CandidateInput): SubjectVerdict {
  const signals = signalsOf(input);
  const evidence: string[] = [];

  // `intro_bg`, `premium-bg-01` 처럼 섹션 뒤에 까는 배경은 대리석 무늬나 빛 CG 인 경우가 많다.
  // 다만 `hero_bg`·`main_bg` 는 첫 화면 대표 그림이라 배경이라는 이름만으로 버리지 않는다.
  let filePath = input.imageUrl;
  try { filePath = decodeURIComponent(input.imageUrl); } catch { /* 원문 사용 */ }
  if (SECTION_BACKGROUND.test(filePath) && !MAIN_BACKGROUND.test(filePath)) {
    return { subject: 'brand', evidence: ['글 뒤에 까는 섹션 배경이에요.'] };
  }

  let subject: ListingSubjectType = 'unknown';
  for (const rule of SUBJECT_RULES) {
    if (!rule.pattern.test(signals)) continue;
    if (subject === 'unknown') subject = rule.subject;
    evidence.push(rule.label);
  }
  const ratio = input.width && input.height ? input.width / input.height : null;
  if (ratio !== null) {
    // 가로로 긴 큰 그림은 대개 외관·전경이다. 세로로 긴 그림은 평면도·배너 쪽이다.
    if (ratio >= 1.3) evidence.push(`가로로 긴 비율(${ratio.toFixed(2)})`);
    if (ratio < 0.8) evidence.push(`세로로 긴 비율(${ratio.toFixed(2)})`);
    if (subject === 'unknown' && ratio >= 1.3 && (input.width ?? 0) >= 1200) {
      subject = 'building_render';
      evidence.push('큰 가로 이미지라 단지 이미지로 본다');
    }
  }
  return { subject, evidence };
}

export type Scored = {
  confidence: number;
  evidence: string[];
  blocked: string[];
  subject: ListingSubjectType;
  subjectEvidence: string[];
  primaryScore: number;
  primaryEligible: boolean;
};

/**
 * 후보 하나를 점수로 매긴다.
 *
 * confidence 는 "이 그림이 이 단지의 공식 이미지일 가능성"이고,
 * primaryScore 는 "대표로 내걸 만한가"다. 둘은 다르다.
 * 공식 홈페이지의 커뮤니티 사진은 confidence 가 높아도 대표로는 쓰지 않는다.
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

  const { subject, evidence: subjectEvidence } = classifySubject(input);
  const signals = signalsOf(input);
  if (subject !== 'unknown') { confidence += 0.2; evidence.push(`무엇을 찍었는지 알 수 있어요(${subject}).`); }

  const tokens = nameTokens(input.announcementTitle);
  const haystack = `${input.alt} ${input.title ?? ''} ${input.nearbyText ?? ''} ${input.pageTitle}`;
  const matched = tokens.filter(token => haystack.includes(token));
  if (matched.length) { confidence += 0.2; evidence.push(`페이지에 단지명 조각(${matched.slice(0, 2).join(', ')})이 있어요.`); }

  if (!IMAGE_TYPE.test(input.contentType ?? '')) blocked.push('이미지 형식이 아니에요.');
  if ((input.byteLength ?? 0) < MIN_BYTES) blocked.push('파일이 너무 작아 대표 사진으로 보기 어려워요.');
  if (input.width !== null && input.height !== null) {
    if (input.width < MIN_WIDTH || input.height < MIN_HEIGHT) {
      blocked.push(`해상도가 작아요(${input.width}×${input.height}, 최소 ${MIN_WIDTH}×${MIN_HEIGHT}).`);
    } else if (input.width / input.height > MAX_BANNER_RATIO) {
      blocked.push(`페이지 머리에 까는 띠 비율이에요(${input.width}×${input.height}).`);
    } else {
      confidence += 0.2;
      evidence.push(`해상도 ${input.width}×${input.height}`);
    }
  } else if (!blocked.length) {
    blocked.push('이미지 크기를 읽지 못했어요.');
  }

  // 한 사업지에 블록이 여럿인 사이트라면, 이 공고의 블록이라고 말할 수 있는 그림만 쓴다.
  const ourBlock = extractBlockCodes(input.announcementTitle)[0] ?? null;
  const siteBlocks = [...new Set(input.siteBlockCodes ?? [])];
  if (ourBlock && siteBlocks.some(code => code !== ourBlock)) {
    // 페이지 제목은 보지 않는다. 그 제목이야말로 블록 여럿을 한꺼번에 이고 있어서,
    // 그것까지 세면 같은 페이지의 모든 그림이 "우리 블록"으로 통과해 버린다.
    const contextBlocks = extractBlockCodes(signals);
    if (contextBlocks.includes(ourBlock)) {
      confidence += 0.1;
      evidence.push(`블록 표기(${ourBlock})가 공고와 같아요.`);
    } else if (contextBlocks.length) {
      blocked.push(`다른 블록(${contextBlocks[0]}) 이미지예요.`);
    } else {
      blocked.push(`이 홈페이지가 블록 ${siteBlocks.join('·')}을 함께 다루고 있어, 어느 블록 사진인지 확인할 수 없어요.`);
    }
  }

  // 대표 점수. 주제 우선순위에서 출발해 낱말과 비율로 더하고 뺀다.
  const rank = SUBJECT_PRIORITY.indexOf(subject);
  let primaryScore = rank >= 0 ? 0.8 - rank * 0.1 : 0.1;
  const building = BUILDING_HINT.test(signals);
  if (PRIMARY_BONUS.test(signals)) primaryScore += 0.1;
  if (PRIMARY_PENALTY.test(signals)) primaryScore -= 0.35;
  if (building) primaryScore += 0.15;
  const ratio = input.width && input.height ? input.width / input.height : null;
  if (ratio !== null) {
    if (ratio >= 1.3 && ratio <= 3) primaryScore += 0.1;
    if (ratio > 6) primaryScore -= 0.3;
    if (ratio < 0.8) primaryScore -= 0.2;
  }
  primaryScore = Math.max(0, Math.min(1, Math.round(primaryScore * 100) / 100));

  // 조경·커뮤니티 그림은 건물이 함께 찍혔다는 신호가 있을 때만 대표가 될 수 있다.
  const needsBuilding = subject === 'landscape' || subject === 'community';
  const primaryEligible = rank >= 0
    && primaryScore >= MIN_PRIMARY_SCORE
    && (!needsBuilding || building)
    && blocked.length === 0;

  return {
    confidence: Math.min(1, Math.round(confidence * 100) / 100),
    evidence,
    blocked,
    subject,
    subjectEvidence,
    primaryScore,
    primaryEligible,
  };
}

/**
 * 같은 그림의 다른 크기를 하나로 묶는 열쇠.
 * 썸네일 폴더와 `_600x400`, `@2x` 같은 크기 표시만 걷어 내고 이름은 남긴다.
 * `complex-01` 과 `complex-02` 는 서로 다른 그림이라 번호는 지우지 않는다.
 */
export function dedupeKey(imageUrl: string): string {
  let path: string;
  try { path = new URL(imageUrl).pathname.toLowerCase(); } catch { return imageUrl.toLowerCase(); }
  const base = (path.split('/').pop() ?? path)
    .replace(/\.(png|jpe?g|webp|avif)$/i, '')
    // 같은 그림의 모바일·PC 판. `m_visual-apt` 와 `visual-apt` 는 한 장이다.
    .replace(/^(m|mo|mobile|sp|pc|web|tablet)[-_]/i, '')
    .replace(/[-_]?\d{2,4}x\d{2,4}$/i, '')
    .replace(/@[0-9](\.[0-9])?x$/i, '')
    .replace(/[-_](thumb|thumbnail|small|medium|large|big|min|mini|s|m|l|xl)$/i, '')
    .replace(/[-_](\d{3,4}w?)$/i, '');
  return base || path;
}

export type RecordInput = CandidateInput & {
  listingId: string;
  announcementNo: string;
  fetchedAt: string;
  reusePermission?: ReusePermission | null;
};

export function buildVisualRecord(input: RecordInput): ListingVisualRecord {
  const scored = scoreCandidate(input);
  const blocked = [...scored.blocked];
  if (!blocked.length && scored.confidence < MIN_CONFIDENCE) {
    blocked.push(`근거가 약해요(confidence ${scored.confidence} < ${MIN_CONFIDENCE}).`);
  }
  if (!blocked.length && NON_SUBJECT.includes(scored.subject)) {
    blocked.push(`단지 사진이 아니에요(${scored.subject}).`);
  }
  return {
    listingId: input.listingId,
    imageUrl: input.imageUrl,
    sourceUrl: input.pageUrl,
    sourceType: input.sourceType,
    subjectType: scored.subject,
    subjectEvidence: scored.subjectEvidence,
    primaryScore: scored.primaryScore,
    primaryEligible: scored.primaryEligible && blocked.length === 0,
    dedupeKey: dedupeKey(input.imageUrl),
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

const subjectRank = (record: ListingVisualRecord) => {
  const rank = SUBJECT_PRIORITY.indexOf(record.subjectType);
  return rank >= 0 ? rank : SUBJECT_PRIORITY.length;
};
const area = (record: ListingVisualRecord) => (record.width ?? 0) * (record.height ?? 0);

/**
 * 대표 이미지 하나를 고른다.
 * 주제 우선순위 → 대표 점수 → 출처 → 크기 순으로 본다. 아무것도 없으면 null 이고 화면은 대체 표현을 쓴다.
 */
export function pickPrimary(records: ListingVisualRecord[]): ListingVisualRecord | null {
  const usable = records.filter(record => record.verified && record.primaryEligible);
  if (!usable.length) return null;
  return usable.slice().sort((left, right) =>
    subjectRank(left) - subjectRank(right)
    || right.primaryScore - left.primaryScore
    || SOURCE_PRIORITY.indexOf(left.sourceType) - SOURCE_PRIORITY.indexOf(right.sourceType)
    || right.confidence - left.confidence
    || area(right) - area(left))[0];
}

/**
 * 갤러리. 대표 이미지를 맨 앞에 두고, 외관 → 전경 → 투시 → 조경 → 커뮤니티 순으로 채운다.
 * 같은 그림의 다른 크기는 큰 쪽만 남긴다.
 */
export function pickGallery(records: ListingVisualRecord[], max = MAX_GALLERY): ListingVisualRecord[] {
  const usable = records.filter(record => record.verified && !NON_SUBJECT.includes(record.subjectType));
  const best = new Map<string, ListingVisualRecord>();
  for (const record of usable) {
    const current = best.get(record.dedupeKey);
    if (!current || area(record) > area(current)) best.set(record.dedupeKey, record);
  }
  const primary = pickPrimary(records);
  const rest = [...best.values()]
    .filter(record => !primary || record.dedupeKey !== primary.dedupeKey)
    .sort((left, right) =>
      subjectRank(left) - subjectRank(right)
      || right.primaryScore - left.primaryScore
      || area(right) - area(left));
  return [...(primary ? [primary] : []), ...rest].slice(0, max);
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
