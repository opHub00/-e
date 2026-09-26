// 공고 대표 이미지·갤러리 후보를 공식 분양 홈페이지에서 모아 점수로 고른다. 생성 이미지도, 추측도 쓰지 않는다.
//
// 출처는 청약홈 공식 분양정보의 HMPG_ADRES(그 공고의 공식 홈페이지)에서 출발한다.
// og:image 하나만 보지 않는다. 그 값은 대개 회사 로고다. 실제 브라우저로 페이지를 열어
// <img>·srcset·lazy 속성·CSS 배경·슬라이더·갤러리를 모두 모으고, 갤러리·단지 소개로 가는
// 같은 도메인 링크를 한 단계 더 따라간다. 그다음 후보를 내려받아 형식·해상도를 확인하고,
// 경로·alt·주변 글·섹션 이름·비율로 무엇을 찍은 그림인지 나눈 뒤 점수를 매긴다.
//
// 특정 공고를 알지 못한다. HMPG_ADRES 가 있는 어떤 공고에도 같은 경로로 돈다.
// 사이트마다 다른 사정은 scripts/listing-visual-adapters.mjs 의 선택적 어댑터로만 다룬다.
//
// Usage: node --experimental-strip-types scripts/resolve-listing-visuals.mjs \
//          --listings <listings.json> --out <resolved.json> [--only <PBLANC_NO>,<PBLANC_NO>] [--max 20]
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { chromium } from 'playwright';
import {
  MAX_GALLERY, buildVisualRecord, extractBlockCodes, imageDimensions, isExcludedImage, pickGallery, pickPrimary,
  scoreCandidate,
} from '../features/listingVisual/resolver.ts';
import { adapterFor } from './listing-visual-adapters.mjs';

export function flag(argv, name) {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] && !argv[index + 1].startsWith('--') ? argv[index + 1] : null;
}

const UA = 'Mozilla/5.0 (compatible; wanpane-listing-visual/3)';

/** 갤러리·단지 소개로 보이는 링크. 한 단계만 따라간다. */
const FOLLOW = /(gallery|photo|complex|overview|premium|design|system|exterior|landscape|단지|조감|갤러리|투시|외관|조경|안내)/i;

/**
 * 이 공고의 사이트가 어디까지인지.
 *
 * 건설사 통합 사이트에서는 공고마다 제 폴더를 쓰고, 그 위로 올라가면 **다른 단지**의 화면이 나온다.
 * 도메인만 같으면 된다고 두면 남의 단지 사진을 그 공고 사진으로 들고 오게 된다.
 * 그래서 HMPG_ADRES 가 가리키는 폴더 아래만 돌아다닌다.
 */
/** `main`, `index`, `pages` 처럼 어느 사이트에나 있는 폴더 이름. 공고를 가리키는 이름이 아니다. */
const GENERIC_DIR = /^(main|index|html|pages?|www|kr|ko|eng?|default|home|view)$/i;

export function scopeOf(homepageUrl) {
  const url = new URL(homepageUrl);
  const path = url.pathname.endsWith('/') ? url.pathname : url.pathname.replace(/[^/]*$/, '');
  const parts = path.split('/').filter(Boolean);
  // 주소가 `.../1052/main/index` 처럼 끝나면 공고의 자리는 그 위 폴더다.
  // `main` 은 어느 사이트에나 있는 이름이라 거기까지만 보면 나머지 화면을 못 읽는다.
  while (parts.length > 1 && GENERIC_DIR.test(parts[parts.length - 1])) parts.pop();
  return `${url.origin}/${parts.length ? `${parts.join('/')}/` : ''}`;
}

export const inScope = (candidateUrl, scope) => {
  try { return new URL(candidateUrl).toString().startsWith(scope); } catch { return false; }
};

/**
 * 열린 페이지에서 이미지 후보를 뽑는다.
 * 주소만이 아니라 alt·title·주변 글·섹션 이름·화면에 그려진 크기까지 함께 가져온다.
 * 무엇을 찍은 그림인지는 그 맥락이 있어야 알 수 있다.
 */
export const EXTRACT_CANDIDATES = () => {
  const out = new Map();
  const push = (raw, context) => {
    if (!raw) return;
    let url;
    try { url = new URL(raw, document.baseURI).toString(); } catch { return; }
    if (!/^https?:/.test(url) || /^data:/.test(raw)) return;
    const current = out.get(url);
    if (!current) { out.set(url, { url, ...context }); return; }
    for (const key of ['alt', 'title', 'nearbyText', 'sectionHint']) {
      if (!current[key] && context[key]) current[key] = context[key];
    }
    if ((context.renderedWidth ?? 0) > (current.renderedWidth ?? 0)) {
      current.renderedWidth = context.renderedWidth;
      current.renderedHeight = context.renderedHeight;
    }
  };

  const sectionOf = node => {
    const names = [];
    let current = node;
    for (let depth = 0; current && depth < 4; depth += 1) {
      const id = current.id ? `#${current.id}` : '';
      const className = typeof current.className === 'string' ? current.className : '';
      if (id || className) names.push(`${current.tagName.toLowerCase()}${id}.${className}`.slice(0, 80));
      current = current.parentElement;
    }
    return names.join(' ');
  };

  const nearbyOf = node => {
    const figure = node.closest('figure, li, .slide, .swiper-slide, .item, section, article');
    const text = (figure?.innerText ?? node.parentElement?.innerText ?? '').replace(/\s+/g, ' ').trim();
    return text.slice(0, 160);
  };

  for (const img of document.querySelectorAll('img')) {
    const context = {
      alt: img.getAttribute('alt') ?? '',
      title: img.getAttribute('title') ?? '',
      nearbyText: nearbyOf(img),
      sectionHint: sectionOf(img),
      kind: 'img',
      renderedWidth: img.naturalWidth || img.clientWidth || 0,
      renderedHeight: img.naturalHeight || img.clientHeight || 0,
    };
    push(img.currentSrc || img.getAttribute('src'), context);
    for (const attribute of ['data-src', 'data-original', 'data-lazy', 'data-echo', 'data-bg']) {
      push(img.getAttribute(attribute), context);
    }
    const srcset = img.getAttribute('srcset') || img.getAttribute('data-srcset');
    if (srcset) for (const part of srcset.split(',')) push(part.trim().split(/\s+/)[0], context);
  }

  for (const source of document.querySelectorAll('picture source, video')) {
    const srcset = source.getAttribute('srcset') || source.getAttribute('poster');
    if (srcset) {
      for (const part of srcset.split(',')) {
        push(part.trim().split(/\s+/)[0], {
          alt: '', title: '', nearbyText: nearbyOf(source), sectionHint: sectionOf(source), kind: 'img',
          renderedWidth: 0, renderedHeight: 0,
        });
      }
    }
  }

  // 슬라이더와 hero 는 배경 이미지로 깔리는 경우가 많다. 계산된 스타일까지 본다.
  for (const node of document.querySelectorAll('*')) {
    const background = getComputedStyle(node).backgroundImage;
    if (!background || background === 'none') continue;
    for (const match of background.matchAll(/url\((["']?)([^"')]+)\1\)/g)) {
      const rect = node.getBoundingClientRect();
      push(match[2], {
        alt: '', title: node.getAttribute('title') ?? '', nearbyText: nearbyOf(node), sectionHint: sectionOf(node),
        kind: 'background', renderedWidth: Math.round(rect.width), renderedHeight: Math.round(rect.height),
      });
    }
  }

  for (const anchor of document.querySelectorAll('a[href]')) {
    const href = anchor.getAttribute('href') ?? '';
    if (!/\.(png|jpe?g|webp|avif)(\?|$)/i.test(href)) continue;
    push(href, {
      alt: anchor.getAttribute('title') ?? '', title: '', nearbyText: nearbyOf(anchor),
      sectionHint: sectionOf(anchor), kind: 'img', renderedWidth: 0, renderedHeight: 0,
    });
  }

  const og = document.querySelector('meta[property="og:image"]')?.getAttribute('content');
  if (og) push(og, { alt: '', title: '', nearbyText: '', sectionHint: 'meta og:image', kind: 'og', renderedWidth: 0, renderedHeight: 0 });

  const text = `${document.title ?? ''} ${document.body?.innerText ?? ''}`.replace(/\s+/g, ' ').slice(0, 20000);
  return { title: document.title ?? '', text, candidates: [...out.values()] };
};

/** 갤러리·단지 소개로 가는 같은 도메인 링크. */
export const EXTRACT_LINKS = () => [...document.querySelectorAll('a[href]')]
  .map(anchor => ({ href: anchor.href, text: (anchor.innerText ?? '').replace(/\s+/g, ' ').trim().slice(0, 40) }))
  .filter(link => /^https?:/.test(link.href));

/** 경로 모양과 맥락으로 출처 종류를 나눈다. 확신이 없으면 가장 낮은 등급으로 둔다. */
export function classifySource(imageUrl, kind, context = '') {
  let path = imageUrl;
  try { path = decodeURIComponent(imageUrl); } catch { /* 원문 사용 */ }
  const haystack = `${path} ${context}`.toLowerCase();
  if (/(gallery|photo|갤러리)/.test(haystack)) return 'official_gallery';
  if (/(배치도|siteplan|site-plan|sitemap|masterplan)/.test(haystack)) return 'official_sitemap';
  if (kind === 'background' || /(visual|hero|main|top|slide|swiper)/.test(haystack)) return 'official_hero';
  return 'official_press';
}

const listingIdFor = record => `apt-${record.HOUSE_MANAGE_NO}-${record.PBLANC_NO}`;

async function probeImage(url, timeoutMs = 30000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': UA } });
    const bytes = new Uint8Array(await response.arrayBuffer());
    const size = imageDimensions(bytes);
    return {
      contentType: response.headers.get('content-type'),
      byteLength: bytes.length,
      width: size?.width ?? null,
      height: size?.height ?? null,
    };
  } catch {
    return { contentType: null, byteLength: null, width: null, height: null };
  } finally { clearTimeout(timer); }
}

async function collectFromPage(page, url, waitMs) {
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
  } catch {
    try { await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 }); } catch { return null; }
  }
  await page.waitForTimeout(waitMs);
  // 게으른 이미지와 슬라이더가 붙도록 한 번 훑어 내린다.
  await page.evaluate(() => new Promise(done => {
    let y = 0;
    const timer = setInterval(() => {
      window.scrollTo(0, y);
      y += Math.max(400, window.innerHeight * 0.8);
      if (y > document.body.scrollHeight + window.innerHeight) { clearInterval(timer); window.scrollTo(0, 0); done(); }
    }, 120);
  })).catch(() => {});
  await page.waitForTimeout(800);
  try { return { url: page.url(), ...(await page.evaluate(EXTRACT_CANDIDATES)) }; } catch { return null; }
}

/** 한 공고의 공식 홈페이지를 돌며 후보를 모으고 검증한다. */
export async function resolveForRecord(browser, record, fetchedAt, maxCandidates) {
  const homepage = (record.HMPG_ADRES ?? '').trim();
  const shared = {
    listingId: listingIdFor(record),
    announcementNo: record.PBLANC_NO,
    announcementTitle: record.HOUSE_NM,
    officialHomepage: homepage || null,
    fetchedAt,
  };
  const emptyRecord = (pageUrl, reasonContext) => buildVisualRecord({
    ...shared, imageUrl: '', pageUrl, alt: '', title: '', nearbyText: '', sectionHint: reasonContext,
    pageTitle: '', sourceType: 'official_press', width: null, height: null, byteLength: null, contentType: null,
  });

  if (!homepage) return { records: [emptyRecord('', '공식 홈페이지 주소가 공고에 없음')], pages: [] };

  const start = homepage.startsWith('http') ? homepage : `https://${homepage}`;
  const adapter = adapterFor(start);
  const waitMs = adapter?.waitMs ?? 1500;
  const context = await browser.newContext({ userAgent: UA, viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();

  const visited = [];
  const seenUrls = new Set();
  const candidates = new Map();
  const siteBlockCodes = new Set(extractBlockCodes(record.HOUSE_NM ?? ''));
  const absorb = result => {
    if (!result) return;
    visited.push({ url: result.url, title: result.title, found: result.candidates.length });
    for (const code of extractBlockCodes(result.text ?? '')) siteBlockCodes.add(code);
    for (const item of result.candidates) {
      if (isExcludedImage(item.url)) continue;
      const previous = candidates.get(item.url);
      if (!previous) candidates.set(item.url, { ...item, pageUrl: result.url, pageTitle: result.title });
      else for (const key of ['alt', 'title', 'nearbyText', 'sectionHint']) {
        if (!previous[key] && item[key]) previous[key] = item[key];
      }
    }
  };

  const first = await collectFromPage(page, start, waitMs);
  seenUrls.add(start);
  absorb(first);

  // 리다이렉트로 옮겨 갔더라도 같은 폴더 안이면 그쪽을 기준으로 삼는다.
  let scope = scopeOf(start);
  if (first && inScope(first.url, `${new URL(scope).origin}/`)) {
    const landed = scopeOf(first.url);
    if (landed.startsWith(scope) || scope.startsWith(landed)) scope = landed.length > scope.length ? scope : landed;
  }

  // 어댑터가 알려 준 경로를 먼저 열고, 그다음 문서에서 찾은 갤러리·단지 링크를 따라간다.
  // 둘 다 이 공고의 폴더 밖으로는 나가지 않는다.
  const queue = [];
  for (const path of adapter?.extraPaths ?? []) {
    try {
      const url = new URL(path, scope).toString();
      if (inScope(url, scope)) queue.push(url);
    } catch { /* 잘못된 경로는 건너뛴다 */ }
  }
  if (first) {
    const links = await page.evaluate(EXTRACT_LINKS).catch(() => []);
    for (const link of links) {
      if (queue.length >= 8) break;
      if (!inScope(link.href, scope)) continue;
      if (!FOLLOW.test(`${link.href} ${link.text}`)) continue;
      if (!queue.includes(link.href)) queue.push(link.href);
    }
  }
  for (const url of queue) {
    if (seenUrls.has(url) || visited.length >= 6) continue;
    seenUrls.add(url);
    absorb(await collectFromPage(page, url, waitMs));
  }

  await context.close();

  // 내려받기 전에 후보를 좁힌다. 전부 받으면 느리고 상대 서버에도 부담이다.
  const ranked = [...candidates.values()]
    .map(item => {
      const preview = scoreCandidate({
        imageUrl: item.url, pageUrl: item.pageUrl, officialHomepage: homepage, alt: item.alt ?? '',
        title: item.title ?? '', nearbyText: item.nearbyText ?? '', sectionHint: item.sectionHint ?? '',
        pageTitle: item.pageTitle ?? '', announcementTitle: record.HOUSE_NM,
        sourceType: classifySource(item.url, item.kind, `${item.alt ?? ''} ${item.sectionHint ?? ''}`),
        width: item.renderedWidth || null, height: item.renderedHeight || null,
        byteLength: null, contentType: 'image/jpeg', siteBlockCodes: [...siteBlockCodes],
      });
      return { ...item, previewScore: preview.primaryScore + preview.confidence };
    })
    .sort((left, right) => right.previewScore - left.previewScore)
    .slice(0, maxCandidates);

  const records = [];
  for (const item of ranked) {
    const probe = await probeImage(item.url);
    records.push(buildVisualRecord({
      ...shared,
      imageUrl: item.url,
      pageUrl: item.pageUrl,
      alt: item.alt ?? '',
      title: item.title ?? '',
      nearbyText: item.nearbyText ?? '',
      sectionHint: item.sectionHint ?? '',
      pageTitle: item.pageTitle ?? '',
      sourceType: classifySource(item.url, item.kind, `${item.alt ?? ''} ${item.sectionHint ?? ''}`),
      width: probe.width, height: probe.height, byteLength: probe.byteLength, contentType: probe.contentType,
      siteBlockCodes: [...siteBlockCodes],
    }));
  }
  if (!records.length) records.push(emptyRecord(first?.url ?? start, '페이지에서 후보를 찾지 못함'));
  return { records, pages: visited, siteBlockCodes: [...siteBlockCodes] };
}

const invokedDirectly = process.argv[1]?.replace(/\\/g, '/').endsWith('scripts/resolve-listing-visuals.mjs');
if (invokedDirectly) {
  const listingsPath = flag(process.argv, '--listings');
  const outPath = flag(process.argv, '--out');
  if (!listingsPath || !outPath) { console.error('Usage: --listings <listings.json> --out <resolved.json>'); process.exit(1); }
  const only = (flag(process.argv, '--only') ?? '').split(',').map(value => value.trim()).filter(Boolean);
  const maxCandidates = Number(flag(process.argv, '--max') ?? 20);
  const payload = JSON.parse(await readFile(resolve(listingsPath), 'utf8'));
  const targets = (payload.records ?? []).filter(record => !only.length || only.includes(record.PBLANC_NO));
  const fetchedAt = new Date().toISOString();
  const browser = await chromium.launch();
  const visuals = [];
  for (const record of targets) {
    const { records, pages, siteBlockCodes } = await resolveForRecord(browser, record, fetchedAt, maxCandidates);
    visuals.push(...records);
    const primary = pickPrimary(records);
    const gallery = pickGallery(records);
    const subjects = new Map();
    for (const item of records) subjects.set(item.subjectType, (subjects.get(item.subjectType) ?? 0) + 1);
    console.log(`\n${record.HOUSE_NM?.slice(0, 28)} (${record.PBLANC_NO})`);
    console.log(`  페이지 ${pages.length}개 · 후보 ${records.length}건 · verified ${records.filter(item => item.verified).length}건`);
    if (siteBlockCodes.length > 1) console.log(`  이 사이트가 함께 다루는 블록: ${siteBlockCodes.join(' · ')}`);
    console.log(`  주제 분포: ${[...subjects].map(([key, count]) => `${key} ${count}`).join(' · ')}`);
    for (const item of records) {
      console.log(`  ${item.verified ? 'OK  ' : 'HOLD'} ${item.primaryEligible ? 'P' : ' '} ${item.subjectType.padEnd(18)} c=${item.confidence} p=${item.primaryScore} ${item.width ?? '?'}×${item.height ?? '?'} ${item.imageUrl.slice(-64) || '(없음)'}`);
      if (item.blockedReason) console.log(`        ${item.blockedReason}`);
    }
    console.log(`  대표: ${primary ? `${primary.imageUrl.slice(-70)} (${primary.subjectType}, p=${primary.primaryScore})` : '없음 → 기존 fallback'}`);
    console.log(`  갤러리 ${gallery.length}/${MAX_GALLERY}장: ${gallery.map(item => item.subjectType).join(' → ') || '없음'}`);
  }
  await browser.close();
  await mkdir(dirname(resolve(outPath)), { recursive: true });
  await writeFile(resolve(outPath), `${JSON.stringify({ schemaVersion: 3, visuals }, null, 2)}\n`, 'utf8');
  console.log(`\n기록 ${visuals.length}건 · 노출 가능 ${visuals.filter(item => item.verified).length}건 → ${outPath}`);
}
