# Listing Visual V1 source audit

Reviewed 2026-09-11. “Searchable” does not mean “licensed for use as a listing image.”

## Production decision

V1 ships no apartment photographs. `verified_image` is accepted only when the registry entry includes an HTTPS source page and an HTTPS reference proving an open license or written permission. The production registry is intentionally empty. Listings with existing coordinates use the local `map_preview` contract; listings without coordinates use `none`.

## Sources reviewed

- [한국부동산원 청약홈 분양정보 조회 서비스](https://www.data.go.kr/data/15098547/openapi.do): the public API is free and marked without an API-data use restriction, but its documented listing data does not provide a reusable apartment image. A supplied sales homepage URL is a link, not permission to copy that site’s photographs.
- Official developer, builder, or sales websites: these can establish who published an image, but reuse rights depend on each site or a direct grant. No blanket license was found, so V1 does not ingest those images.
- Other public data: an image may be used only when the specific dataset and item expose a compatible license and attribution. No such image field is present in the current ApplyHome ingestion.
- [Kakao Maps REST API](https://developers.kakao.com/docs/ko/kakaomap/rest-api): Local search returns place metadata and coordinates, not place photographs. The official static-map endpoint can return a map image, requires a REST API key, and retains the Kakao CI. V1 avoids a new proxy and per-card remote calls; it reuses the already resolved listing coordinates for a lightweight location visual.
- [NAVER Search API](https://developers.naver.com/products/service-api/search/search.md) and [current Search API terms notice](https://developers.naver.com/notice/article/33400): image search can discover third-party results, but does not prove apartment identity or transfer reuse rights. Current terms also require source display/linking, unmodified independent result presentation, and restricted caching. V1 does not use NAVER image results as listing photographs.

## Future verified-image ingestion

Add an entry only after confirming all of the following:

1. The image depicts the exact listing or an explicitly identified official rendering.
2. The publisher and source page are recorded.
3. Reuse is covered by an open license or written permission, with a reference URL.
4. Required attribution is retained.
5. The image URL is HTTPS and has a stable delivery/cache policy.
