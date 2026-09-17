# 공고 발견 → 원문 확보 → extraction 입력

## 범위와 시작 상태

시작: `feature/assessment-rule-import`, `edcfd28`, clean.
작업 branch: `feature/announcement-ingestion`.
Node 로컬 수집 도구만 추가했다. Expo 화면, 기존 Listing provider, ApplicationAssessment 엔진/규칙,
Supabase migration/Storage/데이터는 변경하지 않았다. AI 호출, crawler 배포, cron, 관리자 UI도 없다.

```text
공공데이터 청약홈 APT/잔여세대 API
  → 기존 ApplyHomeApi 모듈
  → AnnouncementSourceAdapter
  → normalize / identity / dedupe / metadata hash
  → 공식 상세 페이지의 실제 첨부 anchor
  → 제한된 GET download / signature / SHA-256
  → .ingestion blobs + version manifest + state
  → buildExtractionInput (REFERENCE, human review required)
  → [향후] extraction → review → Rule DB
```

## 1. 기존 source audit

앱은 `features/discovery/data/ApplyHomeListingProvider.ts`에서 Supabase `listings` Edge Function을 호출한다.
그 함수는 `features/discovery/server/ApplyHomeApi.ts`를 사용한다.

- API base: `https://api.odcloud.kr/api/ApplyhomeInfoDetailSvc/v1`
- `getAPTLttotPblancDetail`: APT
- `getRemndrLttotPblancDetail`: APT 무순위/잔여세대
- 식별자: `HOUSE_MANAGE_NO`, `PBLANC_NO`, operation
- 공고일: `RCRIT_PBLANC_DE`, 상세: `PBLANC_URL`, 사업주체: `BSNS_MBY_NM`
- 실제 응답에는 PDF/HWP URL 필드가 없고 PBLANC_URL만 있다.
- 기존 Edge는 지오코딩 캐시에 쓸 수 있어 **이번 CLI는 Edge를 호출하지 않는다**. 순수 API 모듈만 직접 재사용한다.
- 173건은 이전 시점의 목록 수이며 고정 dataset이 아니다. 이번에는 2026-09-10~17의 14건을 직접 조회했다.

공식 명세: [공공데이터포털 청약홈 분양정보](https://www.data.go.kr/data/15098547/openapi.do),
[한국부동산원 기술문서 안내](https://www.reb.or.kr/reb/na/ntt/selectNttInfo.do?bbsId=1268&mi=10251&nttSn=79889).

## 2. 파일/adapter 구조

| 파일 | 역할 |
|---|---|
| `features/announcementIngestion/server/model.ts` | source interface, normalized model, manifest/state |
| `domain.ts` | identity, stable hashes, dedupe, 날짜 범위, validation, extraction 입력 |
| `applyHomeSource.ts` | 첫 APT_APPLY adapter, 관측된 attachment anchor 파싱 |
| `http.ts` | allowlist, GET, 직렬화, rate limit, timeout, bounded response |
| `documents.ts` | 원문 signature, download/cache/hash |
| `localStore.ts` | immutable local blobs/version files, lock, state 교체 |
| `pipeline.ts` | 증분 처리, 실패 격리, 결과 요약 |
| `ingestion.test.ts` | network/DB 독립 unit/integration 테스트 |
| `scripts/ingest-announcements.mjs` | 로컬 CLI, MANUAL compatibility |

LH/SH/GH/JPDC는 아직 구현하지 않았다. 새로운 adapter는 fetchAnnouncements, normalize, discoverDocuments를 구현한다.
현재 downloader의 host allowlist는 청약홈 전용이다. 새 adapter를 붙일 때 source별 공식 document host와 endpoint를 검토해야 한다.
자동으로 임의 host를 신뢰하지 않는다.

## 3. NormalizedAnnouncement

필드: `source`, `externalId`, nullable `housingManagementNumber`, `title`, nullable `publisher`,
`announcementDate`, `region {code,name}`, nullable `detailUrl`, `documentUrls[]`, `rawMetadata`, `retrievedAt`.

rawMetadata는 날짜/주소/공급량/접수기간/원본 식별자 등 명시적으로 선택한 원본 필드만 보존한다.
요청 URL·serviceKey·token·지오코딩 결과를 저장하지 않는다. API가 제공하지 않은 값은 추정하지 않는다.
이번 API의 normalized documentUrls는 빈 배열이고 상세에서 발견·다운로드한 실제 URL은 manifest.documents.sourceUrl에 기록한다.
다운로드 실패 공고는 error code와 원래 detailUrl로 재시도하며, 실패한 원문 바이트는 정상 document로 저장하지 않는다.

## 4. Identity / dedupe

우선순위:

1. source + externalId
2. source + housingManagementNumber
3. source + canonical detail URL
4. source + 정규화된 title + publisher + announcementDate

APT_APPLY externalId는 `operation:HOUSE_MANAGE_NO:PBLANC_NO`다. 재공급/잔여세대가 최초 공고와 합쳐지지 않게 한다.
관리번호만으로 source 간 병합하지 않는다. 제목 fallback은 publisher가 없으면 실패한다.
fallback으로만 식별되는 공고의 제목이 바뀌면 새 후보가 될 수 있으므로 후속 canonical linking 검수가 필요하다.
식별자는 SHA-256 hex이며 미래 DB의 UUID와는 별도의 수집 식별자다.

동일 batch의 exact duplicate는 제거하고, 같은 identity인데 내용이 충돌하면 해당 identity를 격리한다.
임의 last-write-wins나 자동 병합을 하지 않으며 cursor도 전진하지 않는다.

## 5. 변경·문서 version

- metadataHash: 정규화된 내용의 hash. retrievedAt 제외.
- document SHA-256: 실제 파일 bytes 기준. MIME/header만으로 동일성을 판단하지 않는다.
- manifest version: metadata hash + 정렬한 source URL/document hash + 처리 상태/error codes의 hash.
- NEW / UNCHANGED / MODIFIED는 전사 규칙 검증상태가 아니라 수집 변경 분류다.
- 정상 다운로드에서 document hash 또는 URL이 바뀌면 새 manifest version 후보를 생성한다.
- 일시적인 네트워크 실패만으로 MODIFIED 공고로 표시하지 않는다. 실패 관측도 별도 version artifact로 남는다.
- 같은 파일 hash는 같은 blob을 재사용한다. 같은 성공 version은 같은 extraction jobKey를 사용해 재분석을 생략할 수 있다.
- ETag/Last-Modified가 있으면 조건부 GET/304를 사용한다. 로컬 blob이 없거나 hash가 다르면 304를 신뢰하지 않는다.
- 이번 실제 첨부 서버는 두 validator 모두 없었다. 이런 경우 24시간 후 또는 --recheck에서 파일을 다시 받아 hash를 비교해야 한다.
  **동일 bytes인지 확인하기 전 재다운로드까지 항상 생략할 수 있는 것은 아니다.**

## 6. Document discovery / download

공식 structured document URL이 있을 때 우선 사용하는 interface다. 현재 API에는 없어서 PBLANC_URL의 HTML을 1회 읽는다.
anchor href만 파싱하고 script/comment는 제외한다. JS 실행, ID 추측, 검색엔진 결과 자동 수집, 로그인/CAPTCHA 우회는 없다.

이번에 확인한 endpoint:

```text
https://static.applyhome.co.kr/ai/aia/getAtchmnfl.do
  ?houseManageNo=...&pblancNo=...&atchmnflSeqNo=...&atchmnflSn=...
```

HTML에 실제 존재한 모든 인자만 사용하며 상세의 관리번호/공고번호와 일치해야 한다.
다른 링크는 allowlisted host의 PDF/HWP/HWPX 확장자에 한정한다. 첨부 5개 초과는 자동 절단하지 않고 FAILED로 남긴다.
URL list가 없는 경우 DISCOVERED 상태이며 extraction 입력을 만들지 않는다.

HTTP status와 파일 signature를 모두 확인한다. HTML 오류를 PDF로 저장하지 않는다.
PDF 헤더, HWP OLE/HWP signature, HWPX ZIP/container markers 확인은 **transport 식별**이며 완전한 문서 유효성/악성코드 검사는 아니다.
향후 parser/extractor는 격리된 환경에서 크기·압축률·실행시간 제한으로 추가 검증해야 한다. 수집기는 문서를 실행하거나 압축 해제하지 않는다.

## 7. Local manifest / 저장

```text
.ingestion/
  state.json
  sync.lock                         # 실행 중만 존재
  blobs/{sha256}.pdf|hwp|hwpx
  announcements/{canonicalId}/
    versions/{version}.json          # 최초 관측 manifest, overwrite 없음
    extraction/{version}.json        # extraction-ready 입력
```

manifest schemaVersion=1, canonicalId/identityBasis/version/metadataHash/sourceStatusCandidate,
announcement, documents, status/errors를 포함한다.
각 document에는 sourceUrl, localPath, SHA, size, MIME, retrievedAt, nullable ETag/Last-Modified가 있다.
localPath는 root 상대의 hash 기반 경로만 허용하며 원본 파일명을 경로로 사용하지 않는다.

공고별 저장 직후 state를 임시 파일→rename으로 교체한다. crash 전 성공한 공고는 보존된다.
sync.lock의 wx 생성으로 동시 writer를 거부한다. 비정상 종료 후 lock을 자동 제거하지 않는다.
PID의 종료와 다른 작업 부재를 확인한 후 운영자가 해당 work directory의 lock만 정리해야 한다.
state와 그 안의 manifest/version 정보가 손상되면 조용히 empty state로 바꾸지 않고 실패한다.
미래 worker는 별도 version artifact를 읽을 때도 validateManifest와 blob SHA 검사를 다시 수행해야 한다.
원문과 version은 삭제하지 않으며 실패/중단 중 orphan blob이나 tmp가 남을 수 있다. 자동 GC는 이번 범위가 아니다.
수집 root는 신뢰된 로컬 디렉터리로 관리하고 외부 사용자가 파일/심볼릭 링크를 수정할 수 있게 제공하지 않는다.

`.ingestion/`는 Git 및 Vercel 업로드에서 제외하며 runtime에서 import하지 않는다. --work-dir을 바꾸면 해당 경로의 ignore/접근권한은 실행자가 관리한다.

## 8. Extraction / DB handoff

`buildExtractionInput(manifest)`는 정상 DOWNLOADED manifest만 받는다.
jobKey, announcement metadata, document paths/SHA/sourceUrl, version,
`sourceStatusCandidate=REFERENCE`, `requiresHumanReview=true`를 반환한다.
자동 수집은 공식 host에서 받았다는 이유로 DRAFT_SOURCE_VERIFIED/OFFICIAL_VERIFIED를 만들지 않는다.

이 JSON은 rule import package와 다르다. 미래 worker는:

1. manifest와 blob SHA를 다시 확인하고 신뢰되지 않은 원문을 격리 parser로 읽는다.
2. canonicalId ↔ announcement UUID를 저장하고 document hash별 새 document UUID/path를 부여한다.
3. 승인된 환경에서 Storage upload + announcement_documents metadata를 저장한다.
4. extraction job 입력을 기록하고 AI가 만든 rule output을 기존 validateImportPackage 계약으로 변환한다.
5. 기존 import/review/approve/activate lifecycle을 사용한다. 추출 성공과 승인은 분리한다.

DB mapping: normalized announcement → announcements, blob → Storage/announcement_documents,
extraction input → rule_extraction_jobs, 검수된 rule output → assessment_rule_sets/rules/evidence.
**이번 CLI에는 Supabase client나 write 경로가 없다.** staging 보류 상태를 우회하지 않는다.

## 9. Incremental sync / retry / cadence

- 기본 최근 7일(KST); cursor가 있으면 마지막 완료일에서 6일 겹쳐 재조회한다.
- source가 모든 페이지를 반환하고, normalization/conflict/download 실패가 없고, limit에 잘리지 않은 연속 범위만 cursor 전진.
- 명시적 backfill은 cursor를 뒤로 돌리지 않는다. 중간 날짜를 건너뛴 조회도 기존 cursor를 전진시키지 않는다.
- --limit은 공고별 상세/원문 처리 수이다. metadata API는 operation별 page100, 최대5page다.
- 신규/수정 우선, 그 다음 오래전에 확인한 공고 순서로 처리해 적은 limit에서 미처리 공고가 계속 밀리지 않게 한다.
- 성공한 동일 metadata는 24시간 동안 원문 재확인을 생략한다. 실패 공고는 다음 선택된 sync에서 재시도한다.
- GET concurrency=1, 요청 시작 간격1초, 요청당25초 timeout, 최대3redirect, 429/5xx만 1회 retry.
  Retry-After 10초 초과는 기다리며 반복하지 않고 RETRY_LATER로 남긴다. 401/403/CAPTCHA는 우회하지 않는다.
- API3MB, HTML2MB, document50MB 상한을 stream 읽는 동안 적용한다.
- source fetch 실패는 전체 sync를 중단하지만 기존 state는 보존한다. 공고별 원문 실패는 다른 공고를 중단하지 않는다.
- CLI exit0: 처리 성공(부분 limit 여부는 complete 확인), exit2: 공고별/정규화/충돌 실패, exit1: 설정/전체 source/local storage 실패.

권고 cadence(실제 scheduler 미배포): APT_APPLY는 **1시간**마다 metadata 확인부터 시작한다.
분 단위 실시간 필요성이 확인되지 않아 15/30분 polling은 기본값으로 권하지 않는다.
문서는 기본24시간 재점검, 주1회 최근90일을 작은 날짜 구간으로 나눠 --recheck하여 과거 공고의 정정을 보완한다.
90일보다 오래된 변경, upstream 삭제/tombstone, 목록 밖 문서 교체는 자동 발견을 보장하지 않는다.
LH/SH/GH/JPDC cadence는 source별 API 이용조건·quota·갱신 주기를 확인한 다음 정한다.

## 10. CLI / 보안

```powershell
npm run ingest:announcements -- --help
npm run ingest:announcements -- --source APT_APPLY --from 2026-09-10 --to 2026-09-17 --limit 3 --dry-run
npm run ingest:announcements -- --source APT_APPLY --limit 10
npm run ingest:announcements -- --source APT_APPLY --limit 10 --recheck
```

npm script는 ignored `.env`가 있으면 Node env-file로 로드한다. DATA_GO_KR_SERVICE_KEY만 사용하며 이미 설정된 process env가 우선한다.
현재 앱의 Supabase URL/키도 환경에 존재할 수 있지만 CLI는 이를 사용하지 않는다. 사용자 shell에 환경을 설정하면 .env 없이 실행 가능하다.
serviceKey를 인자로 전달하지 않는다. 로그에는 bounded error code와 공개 공고 metadata만 기록한다.
API GET의 key는 공식 API host로만 전송하며 redirect는 거부한다.
document HTTPS host는 www.applyhome.co.kr/static.applyhome.co.kr만 허용한다. redirect마다 다시 검사하고
credentials/secret query parameters/비표준 port/private IP URL은 거부한다. 쿠키·인증 header를 전달하지 않는다.

## 11. 실제 네트워크 검증

2026-09-10~17 API 읽기 결과: APT6 + 잔여세대8 = **14건**. 기존 Edge/DB는 호출하지 않았다.
첫 dry-run: 14 normalize, 3선택, 실제 attachment link3개, `.ingestion` 생성 없음.
후속 dry-run: NEW11/UNCHANGED3, link14개, state hash 전후 일치, cursor 변경 없음.

실제 local download:

| 공고 | 결과 | bytes | SHA-256 |
|---|---|---:|---|
| 더샵 트리센트 | PDF 저장 | 264,928 | `a4da2c72c8d7ff7eefb546ca45905afd57a7a935868b86f02429a42d7a9bae64` |
| 힐스테이트 고덕엘리스트 A65BL 공공분양주택 | PDF 저장 | 1,152,965 | `be9fc0f60a274236b5de9391bf4279dce90252821009735a60e969eada768542` |
| 더 리치먼드 미아(3차) | FAILED / UNSUPPORTED_DOCUMENT_CONTENT | 원문 저장 없음 | 없음 |

세 번째 공고의 attachment endpoint는 HTTP200이지만 text/html 59bytes로 URL not found 메시지를 반환했다.
정상 PDF로 위장하지 않았고 앞선 두 성공 공고와 extraction manifest는 보존됐다.
실제 게시본의 내용/청약 규칙 검증은 하지 않았다. 문서 확보와 source verification은 다른 단계다.
원문 URL은 각 local manifest에 있으며 모집공고문 첨부 ID를 추측하지 않았다.

## 12. Samdo MANUAL 호환

```powershell
npm run ingest:announcements -- --source MANUAL --package data/assessment-rules/samdo-2026-v1.7.json --document "C:/완판e/source/(VER1.7_부동산원 제출용_공통) 삼도이동 1지구 토지임대부 분양주택 입주자모집공고문.hwp"
```

기존 package schema 및 원문 SHA를 검사한 후 같은 local store/manifest/extraction builder를 사용한다.
source=MANUAL, suppliedManually=true, sourceUrl=null. DOWNLOADED는 로컬 bytes 확보 상태이며 network 수집을 뜻하지 않는다.
4,534,784bytes, SHA `bd67d7ee6c9b9dbbe043f9c966679c791185ba0f21ae80050a33a489112e8763` 일치를 확인했다.
기존 검토된 rule package는 DRAFT_SOURCE_VERIFIED로 그대로 보존한다. 새 extraction 후보는 REFERENCE이며 자동 승격하지 않는다.

## 13. 테스트 / 남은 작업

unit/integration: normalize, identity fallback, collision quarantine, metadata/document 변경, URL parsing,
allowlist/redirect/401/retry, size/signature, SHA/304/cache, manifest validation, 실패 격리, cursor/limit/backfill,
dry-run 새 디렉터리 미생성 및 기존 state byte 일치, concurrent lock/state corruption을 검사한다.
기존 assessment 138개와 전체 회귀 테스트는 유지한다.

최종 실행 결과:

| 검사 | 결과 |
|---|---|
| typecheck | 통과 |
| 수집 tests | 33개 통과 |
| 기존 assessment tests | 138개 통과 |
| npm test | 전체 통과, Edge65 포함 |
| web export --clear | 통과 |
| bundle 검사 | 32개 파일에서 공공데이터 key, service-role key, ingestion server 코드 미발견 |
| local manifest/blob 검증 | 4개 manifest 및 성공 document3개의 size/SHA/jobKey 대조 통과 |
| git diff --check | 통과 |

검증 로그/요약은 ignored `.cache/ingestion-*.log`, `.cache/ingestion-proof.json`에 남겼다.
실제 네트워크 검증 중 형식 오류의 추가 진단이 한 차례 도구 사용량 제한으로 보류됐으나,
사용자 재개 요청 후 동일한 읽기 검사로 오류 HTML임을 확인했다. 원격 write는 없었다.

남은 작업: 다른 source adapters, 문서 parser의 완전한 형식 검사, 삭제/정정의 전용 이벤트 source,
실제 scheduler, 재시도 관측/retention, staging DB handoff, AI extraction 및 관리자 검수 연결.
다음 Phase는 확보된 PDF/HWP를 격리 parser로 읽고 evidence locator를 보존하는 extraction 계약부터 검증한다.
원문 속 지시문을 실행하거나 extraction 결과를 자동 승인하지 않는다.
