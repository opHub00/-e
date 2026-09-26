// 공고 대표 이미지 후보를 공식 분양 홈페이지에서 모아 점수로 고른다. 생성 이미지도, 추측도 쓰지 않는다.
//
// 출처는 청약홈 공식 분양정보의 HMPG_ADRES(그 공고의 공식 홈페이지)에서 출발한다.
// og:image 하나만 보지 않는다. 그 값은 대개 회사 로고다. 페이지의 <img>·배경 이미지·갤러리 링크를 모아
// 로고·SEO·공용 배너를 걸러 내고, 실제로 내려받아 형식과 해상도를 확인한 뒤 점수를 매긴다.
//
// Usage: node scripts/resolve-listing-visuals.mjs --listings <listings.json> --out <resolved.json>
//        [--only <PBLANC_NO>,<PBLANC_NO>] [--max 3]
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { buildVisualRecord, imageDimensions, isExcludedImage, pickBest, scoreCandidate } from '../features/listingVisual/resolver.ts';

export function flag(argv, name) {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] && !argv[index + 1].startsWith('--') ? argv[index + 1] : null;
}

const UA = { 'User-Agent': 'Mozilla/5.0 (compatible; wanpane-listing-visual/2)' };

async function fetchText(url, timeoutMs = 25000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: UA, redirect: 'follow' });
    return { ok: response.ok, url: response.url || url, text: await response.text() };
  } catch { return { ok: false, url, text: '' }; } finally { clearTimeout(timer); }
}

async function fetchImage(url, timeoutMs = 30000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: UA });
    const bytes = new Uint8Array(await response.arrayBuffer());
    const size = imageDimensions(bytes);
    return { ok: response.ok, contentType: response.headers.get('content-type'), byteLength: bytes.length, width: size?.width ?? null, height: size?.height ?? null };
  } catch { return { ok: false, contentType: null, byteLength: null, width: null, height: null }; } finally { clearTimeout(timer); }
}

const absolute = (value, base) => { try { return new URL(value, base).toString(); } catch { return null; } };

/** 페이지에서 이미지 후보를 뽑는다. img 태그, srcset, 인라인 배경, og:image 를 모두 본다. */
export function collectImageCandidates(html, pageUrl) {
  const found = new Map();
  const push = (raw, alt, kind) => {
    const url = absolute(raw.trim(), pageUrl);
    if (!url || !/^https?:/.test(url)) return;
    if (!found.has(url)) found.set(url, { url, alt: alt ?? '', kind });
    else if (alt && !found.get(url).alt) found.get(url).alt = alt;
  };
  for (const match of html.matchAll(/<img[^>]*>/gi)) {
    const tag = match[0];
    const src = tag.match(/\ssrc=["']([^"']+)["']/i)?.[1];
    const alt = tag.match(/\salt=["']([^"']*)["']/i)?.[1] ?? '';
    if (src) push(src, alt, 'img');
    const srcset = tag.match(/\ssrcset=["']([^"']+)["']/i)?.[1];
    if (srcset) for (const part of srcset.split(',')) push(part.trim().split(/\s+/)[0], alt, 'img');
  }
  for (const match of html.matchAll(/background-image\s*:\s*url\((["']?)([^"')]+)\1\)/gi)) push(match[2], '', 'background');
  const og = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)?.[1];
  if (og) push(og, '', 'og');
  return [...found.values()];
}

const pageTitleOf = html => (html.match(/<title[^>]*>([\s\S]{0,200}?)<\/title>/i)?.[1] ?? '').replace(/\s+/g, ' ').trim();

/** 경로 모양으로 출처 종류를 나눈다. 확신이 없으면 가장 낮은 등급으로 둔다. */
export function classifySource(imageUrl, kind) {
  const path = decodeURIComponent(imageUrl).toLowerCase();
  if (/(조감|투시|aerial|perspective|gallery|photo)/.test(path)) return 'official_gallery';
  if (/(배치도|siteplan|sitemap)/.test(path)) return 'official_sitemap';
  if (kind === 'background' || /(visual|hero|main|top)/.test(path)) return 'official_hero';
  return 'official_press';
}

const listingIdFor = record => `apt-${record.HOUSE_MANAGE_NO}-${record.PBLANC_NO}`;

export async function resolveForRecord(record, fetchedAt, maxCandidates) {
  const homepage = (record.HMPG_ADRES ?? '').trim();
  const shared = {
    listingId: listingIdFor(record),
    announcementNo: record.PBLANC_NO,
    announcementTitle: record.HOUSE_NM,
    officialHomepage: homepage || null,
    fetchedAt,
  };
  if (!homepage) {
    return [buildVisualRecord({
      ...shared, imageUrl: '', pageUrl: '', alt: '', pageTitle: '', sourceType: 'official_press',
      width: null, height: null, byteLength: null, contentType: null,
    })];
  }
  const page = await fetchText(homepage.startsWith('http') ? homepage : `https://${homepage}`);
  const pageUrl = page.url;
  const pageTitle = pageTitleOf(page.text);
  const candidates = collectImageCandidates(page.text, pageUrl)
    .filter(item => !isExcludedImage(item.url))
    // 내려받기 전에 점수 후보를 좁힌다. 전부 받으면 느리고 서버에도 부담이다.
    .map(item => ({
      ...item,
      preview: scoreCandidate({
        imageUrl: item.url, pageUrl, officialHomepage: homepage, alt: item.alt, pageTitle,
        announcementTitle: record.HOUSE_NM, sourceType: classifySource(item.url, item.kind),
        width: null, height: null, byteLength: null, contentType: 'image/jpeg',
      }).confidence,
    }))
    .sort((left, right) => right.preview - left.preview)
    .slice(0, Math.max(maxCandidates * 3, 6));

  const records = [];
  for (const item of candidates) {
    if (records.length >= maxCandidates) break;
    const probe = await fetchImage(item.url);
    records.push(buildVisualRecord({
      ...shared, imageUrl: item.url, pageUrl, alt: item.alt, pageTitle,
      sourceType: classifySource(item.url, item.kind),
      width: probe.width, height: probe.height, byteLength: probe.byteLength, contentType: probe.contentType,
    }));
  }
  if (!records.length) {
    records.push(buildVisualRecord({
      ...shared, imageUrl: '', pageUrl, alt: '', pageTitle, sourceType: 'official_press',
      width: null, height: null, byteLength: null, contentType: null,
    }));
  }
  return records;
}

const invokedDirectly = process.argv[1]?.replace(/\\/g, '/').endsWith('scripts/resolve-listing-visuals.mjs');
if (invokedDirectly) {
  const listingsPath = flag(process.argv, '--listings');
  const outPath = flag(process.argv, '--out');
  if (!listingsPath || !outPath) { console.error('Usage: --listings <listings.json> --out <resolved.json>'); process.exit(1); }
  const only = (flag(process.argv, '--only') ?? '').split(',').map(value => value.trim()).filter(Boolean);
  const maxCandidates = Number(flag(process.argv, '--max') ?? 3);
  const payload = JSON.parse(await readFile(resolve(listingsPath), 'utf8'));
  const targets = (payload.records ?? []).filter(record => !only.length || only.includes(record.PBLANC_NO));
  const fetchedAt = new Date().toISOString();
  const visuals = [];
  for (const record of targets) {
    const found = await resolveForRecord(record, fetchedAt, maxCandidates);
    visuals.push(...found);
    const best = pickBest(found);
    console.log(`\n${record.HOUSE_NM?.slice(0, 26)} (${record.PBLANC_NO}) · 후보 ${found.length}건`);
    for (const item of found) {
      console.log(`  ${item.verified ? 'OK  ' : 'HOLD'} c=${item.confidence} ${item.sourceType} ${item.width ?? '?'}×${item.height ?? '?'} ${item.imageUrl.slice(0, 84) || '(없음)'}`);
      if (item.blockedReason) console.log(`        ${item.blockedReason}`);
    }
    console.log(`  선택: ${best ? `${best.imageUrl.slice(0, 84)} (confidence ${best.confidence})` : '없음 → 기존 fallback'}`);
  }
  await mkdir(dirname(resolve(outPath)), { recursive: true });
  await writeFile(resolve(outPath), `${JSON.stringify({ schemaVersion: 2, visuals }, null, 2)}\n`, 'utf8');
  console.log(`\n기록 ${visuals.length}건 · 노출 가능 ${visuals.filter(item => item.verified).length}건 → ${outPath}`);
}
