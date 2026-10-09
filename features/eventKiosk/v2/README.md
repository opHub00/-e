# 제주 행사 V2 presentation 경계

Figma `Jeju Listing Experience V2` 를 코드에 옮길 때 바꾸는 곳과 바꾸지 않는 곳을 나눈다.
판정·Rule Package·adaptive 질문·QR 보안은 이 폴더와 무관하다. 화면은 아래 **모델**만 읽는다.

## 1. 밀도 (layout token)

| 밀도 | 기준 | 용도 | control / large | card padding | section gap | card basis | content max |
|---|---|---|---|---|---|---|---|
| `compact` | 폭 ≥ 1200, 마우스 | 노트북·데스크톱 | 44 / 52 | 16 | 20 | 320 (한 줄 3장) | 1320 |
| `comfortable` | 744 ≤ 폭 < 1200, 또는 넓은 터치 화면 | iPad·행사 키오스크 | 64 / 64 | 24 | 32 | 360 (한 줄 2장) | 1240 |
| `touch` | 폭 < 744 | 휴대폰 | 52 / 56 | 18 | 22 | 300 (한 줄 1장) | 640 |

- 크기 token: `features/eventKiosk/layout/density.ts` (순수 값, Node 테스트 가능)
- 글자 크기: `features/eventKiosk/layout/densityType.ts` (`page · section · cardTitle · body · bodyStrong · label · caption · button · buttonLarge`)
- 읽는 법: `const { density, d } = useDensity()` — `KioskFrame` 이 공급자다. 붙기 전(정적 HTML)에는 `comfortable`.
- Figma 적용: 프레임 폭별 수치를 이 표의 칸에 그대로 넣으면 된다. 색·의미 token(`ui/theme.ts`의 `k.colors`, `bucketTone`)은 밀도와 무관.

## 2. 교체 지점(component) → Figma 프레임

| Component | 파일 | 입력 | Figma 프레임(예정) |
|---|---|---|---|
| `ListingCardV2` | `v2/ListingCardV2.tsx` | `ListingCardModel` + `favoriteSlot` + `actions` | Result card (eligible / review / difficult / info, 빈 데이터) |
| `RecommendationSummaryV2View` | `v2/RecommendationSummaryV2View.tsx` | `RecommendationSummaryV2` (+ `favoritesSlot`) | Summary V2 (desktop 2열 / iPad·mobile 1열) |
| `ListingHighlights` | `v2/ListingPlaceSections.tsx` | listing record + 확인할 점 | 상세 '이 주택의 특징 ↔ 확인할 점' |
| `ListingPlace` | `v2/ListingPlaceSections.tsx` | listing record | 상세 위치·지도·주변 |
| `ListingMap` · `NearbyPlaces` · `DistanceBadge` · `LocationSummary` | `location/LocationViews.tsx` | `ListingLocation`, `NearbyPlace[]` | 지도 카드, 주변 시설 목록, 거리 배지 |
| `ListingFeatures` · `ListingCautions` | `location/LocationViews.tsx` | `VerifiedFeature[]`, `string[]` | 특징(초록) / 확인할 점(주황) |

- 모델 → 화면 사이에 저장소·내비게이션이 없다. Figma 를 반영할 때 모델과 adapter(`cardModelFromOutcome`, `cardModelFromServiceListing`, `buildRecommendationSummary`)는 그대로 두고 view 파일만 바꾼다.
- 기존 test ID(`listing-card-N`, `detail-N`, `favorite-*`, `official-score*`, `wanpan-indicator`, `summary`, `summary-selected*`)는 유지한다.
- 미리보기: Demo Mode 빌드의 `/event/components-preview` — 모든 칸이 찬 예시와 빈 데이터 카드를 한 화면에 보여 준다.

## 3. Codex 데이터 계약(받을 모양)

화면은 아래 필드가 listing(EventListing·ServiceListing)에 생기면 바로 쓴다. 없으면 그 칸을 그리지 않는다.

```ts
location?: { lat|latitude, lng|lon|longitude, address?, district?, precision?: 'EXACT'|'APPROXIMATE'|'DISTRICT', source?: { label, url? } }
nearbyPlaces?: Array<{ id?, name, category, distanceMeters|distance_m, walkMinutes?, lat?, lng?, source?: { label, url? } }>
//   category: TRANSIT · SCHOOL · CHILDCARE · HOSPITAL · MART · PARK · PUBLIC (또는 한글·영문 별칭)
features?: Array<{ text, kind?: 'SUPPLY'|'LOCATION'|'COST'|'FACILITY'|'SCHEDULE', evidence: { label, url?, page? } }>
//   evidence.label 이 없으면 표시하지 않는다(근거 없는 문구 금지).
media?: ListingMedia  // Codex media 계약 그대로(primary, gallery, placeholder)
```

- 지도 provider SDK 는 계약 확정 후 `ListingMap` 의 `renderProvider` 로 붙인다(자리·크기 동일). 지금은 좌표 개요도 + 지도 앱 링크.
- 추천(recommendation)은 엔진의 완판e 추천도(`wanpan.level`)를 말로만 쓴다. 숫자·게이지 없음. 공식 배점과 다른 상자.
