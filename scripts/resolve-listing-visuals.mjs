// 공고 대표 이미지 후보를 공식 출처에서 찾아 기록한다. 생성 이미지도, 추측도 쓰지 않는다.
//
// 출처는 청약홈 공식 분양정보의 HMPG_ADRES(그 공고의 공식 홈페이지) 하나뿐이다.
// 그 페이지가 스스로 내건 대표 이미지(og:image)만 후보가 되고, 실제로 받아 확인한다.
// 재사용 허가는 자동으로 판단할 수 없어 비워 둔다. 허가가 기록되기 전에는 verified 가 아니고 화면에 나가지 않는다.
//
// Usage: node scripts/resolve-listing-visuals.mjs --listings <listings.json> --out data/listing-visuals/resolved.json
//        [--only <PBLANC_NO>,<PBLANC_NO>]
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { buildVisualRecord, representativeImageUrl } from '../features/listingVisual/resolver.ts';

export function flag(argv, name) {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] && !argv[index + 1].startsWith('--') ? argv[index + 1] : null;
}

const UA = { 'User-Agent': 'Mozilla/5.0 (compatible; wanpane-listing-visual/1)' };

async function fetchText(url, timeoutMs = 25000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: UA });
    return { ok: response.ok, text: await response.text() };
  } catch { return { ok: false, text: '' }; } finally { clearTimeout(timer); }
}

async function headImage(url, timeoutMs = 25000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: UA });
    const buffer = Buffer.from(await response.arrayBuffer());
    return { ok: response.ok, contentType: response.headers.get('content-type'), byteLength: buffer.length };
  } catch { return { ok: false, contentType: null, byteLength: null }; } finally { clearTimeout(timer); }
}

const listingIdFor = record => `apt-${record.HOUSE_MANAGE_NO}-${record.PBLANC_NO}`;

export async function resolveVisuals(records, fetchedAt) {
  const out = [];
  for (const record of records) {
    const homepage = (record.HMPG_ADRES ?? '').trim();
    const base = {
      listingId: listingIdFor(record),
      announcementNo: record.PBLANC_NO,
      announcementTitle: record.HOUSE_NM,
      officialHomepage: homepage || null,
      sourceType: 'official_project_page',
      fetchedAt,
    };
    if (!homepage) {
      out.push(buildVisualRecord({ ...base, imageUrl: null, sourceUrl: null, fetch: { ok: false, contentType: null, byteLength: null } }));
      continue;
    }
    const page = await fetchText(homepage);
    const imageUrl = page.ok ? representativeImageUrl(page.text, homepage) : null;
    const probe = imageUrl ? await headImage(imageUrl) : { ok: false, contentType: null, byteLength: null };
    out.push(buildVisualRecord({ ...base, imageUrl, sourceUrl: homepage, fetch: probe }));
  }
  return out;
}

const invokedDirectly = process.argv[1]?.replace(/\\/g, '/').endsWith('scripts/resolve-listing-visuals.mjs');
if (invokedDirectly) {
  const listingsPath = flag(process.argv, '--listings');
  const outPath = flag(process.argv, '--out');
  if (!listingsPath || !outPath) { console.error('Usage: --listings <listings.json> --out <resolved.json>'); process.exit(1); }
  const only = (flag(process.argv, '--only') ?? '').split(',').map(value => value.trim()).filter(Boolean);
  const payload = JSON.parse(await readFile(resolve(listingsPath), 'utf8'));
  const records = (payload.records ?? []).filter(record => !only.length || only.includes(record.PBLANC_NO));
  const resolved = await resolveVisuals(records, new Date().toISOString());
  await mkdir(dirname(resolve(outPath)), { recursive: true });
  await writeFile(resolve(outPath), `${JSON.stringify({ schemaVersion: 1, visuals: resolved }, null, 2)}\n`, 'utf8');
  const verified = resolved.filter(item => item.verified).length;
  for (const item of resolved) {
    console.log(`${item.verified ? 'SHOW' : 'HOLD'} ${item.listingId} · ${item.announcementTitle?.slice(0, 22) ?? ''} · ${item.imageUrl || '(이미지 없음)'}`);
    if (item.blockedReason) console.log(`      ${item.blockedReason}`);
  }
  console.log(`\n기록 ${resolved.length}건 · 화면 노출 가능 ${verified}건 → ${outPath}`);
}
