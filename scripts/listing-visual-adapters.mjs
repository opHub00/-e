// generic crawler 위에 얹는 **선택적** 사이트 어댑터.
//
// 기본은 어댑터 없이 도는 것이다. generic crawler 가 공고 홈페이지에서 갤러리·단지 소개 링크를
// 스스로 찾아 들어가기 때문에, 지금 다루는 사이트들은 어댑터 없이도 후보가 모인다.
// 그래서 등록된 어댑터는 비어 있다. 이 층은 generic 경로로 안 되는 사이트가 나왔을 때를 위한 자리다.
//
// 어댑터가 할 수 있는 일은 "어디를 더 열어 볼지"와 "얼마나 기다릴지"뿐이다.
// 점수·주제 판정·검증은 어댑터가 건드리지 않는다. 그 규칙은 모든 공고에 똑같이 적용되어야 한다.
// extraPaths 는 공고 홈페이지 폴더를 기준으로 삼고, 그 밖으로 나가는 경로는 crawler 가 버린다.
// 남의 단지 화면을 이 공고 사진으로 들고 오지 않기 위해서다.
//
// 예:
//   { host: /(^|\.)example\.co\.kr$/, extraPaths: ['gallery.html'], waitMs: 2500, note: '인트로 뒤 갤러리' }

/** @typedef {{ host: RegExp, extraPaths?: string[], waitMs?: number, note: string }} VisualAdapter */

/** @type {VisualAdapter[]} */
export const ADAPTERS = [];

/** 이 주소에 맞는 어댑터. 없으면 null 이고, crawler 는 generic 경로만 돈다. */
export function adapterFor(pageUrl, adapters = ADAPTERS) {
  let host;
  try { host = new URL(pageUrl).hostname; } catch { return null; }
  return adapters.find(adapter => adapter.host.test(host)) ?? null;
}
