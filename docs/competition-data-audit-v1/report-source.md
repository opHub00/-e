# Competition Data Audit V1

- 감사일: 2026-09-08 (Asia/Seoul)
- 대상: 완판e `feature/competition-insight-v1`
- audience: 제품·개발·시연 운영 담당자
- 범위: 공식 경쟁률 source, ApplyHome operation/schema, 현재 production 90일 공고의 join 가능성, 안전한 후속 구현 조건
- 결론: **2026-09-08 활용신청 반영 후 공식 API 접근과 167건 전수 측정에 성공했다. 종료 공고 매칭률 90.60%, HTTP 성공률 100%, p95 126ms여서 보수적인 lazy-load Competition Insight 구현을 feature branch에서 진행한다.**

## Executive answer

한국부동산원은 공공데이터포털에서 청약Home 경쟁률 및 특별공급 신청현황 API를 공식 제공한다. APT, 오피스텔 계열, 공공지원 민간임대, 취소후재공급, 잔여세대, 임의공급을 분리된 operation으로 조회할 수 있고 APT 당첨가점과 특별공급 신청현황도 제공한다. 공식 설명은 은행 전산 사정으로 접수건수가 이후 일부 변동될 수 있으며 청약Home 최종정보와 차이가 날 수 있다고 명시한다. [공공데이터포털 서비스](https://www.data.go.kr/data/15098905/openapi.do), [한국부동산원 기술문서](https://www.reb.or.kr/reb/na/ntt/selectNttInfo.do?mi=10251&bbsId=1268&nttSn=82345)

활용신청 반영 후 현재 `DATA_GO_KR_SERVICE_KEY`로 APT 일반, 잔여세대, APT 특별공급 endpoint가 모두 HTTP 200을 반환했다. 비밀값은 출력하거나 저장하지 않았다. 현재 production 90일 공고 167건을 공식 두 식별자로 전수 조회했으며 136건에서 경쟁률 행을 찾았다. 접수 전·진행 중을 제외한 종료 공고는 135/149건이 매칭됐다.

## 1. 현재 완판e 데이터 경로 감사

현재 구조는 `Expo → Supabase Edge listings → ApplyhomeInfoDetailSvc → client repository/cache → Discovery/Detail`이다.

- `listings` Edge는 `getAPTLttotPblancDetail`, `getRemndrLttotPblancDetail` 두 operation을 최근 90일 범위로 조회한다.
- production smoke의 원본 레코드는 167건: APT 84건, 잔여세대 83건.
- 167건 모두 `HOUSE_MANAGE_NO`와 `PBLANC_NO`를 갖는다. 잠재적 deterministic join coverage는 167/167, 100%다.
- normalized `DiscoveryListing.id`는 두 번호를 포함해 생성되지만 두 번호를 별도 typed field로 보존하지 않는다. 구현 시 문자열 ID를 역파싱하지 말고 source identifier를 명시적으로 보존해야 한다.
- 2026-09-08 기준 접수 상태는 APT: 종료 68, 진행 6, 예정 10; 잔여세대: 종료 81, 진행 1, 예정 1이다.
- client의 5분 memory cache는 listing dataset용이다. 경쟁률 API cache로 재사용하기에는 범위와 수명이 맞지 않는다.

## 2. 공식 operation과 endpoint

공식 Swagger host/base는 `https://api.odcloud.kr/api`, 서비스 base는 `/ApplyhomeInfoCmpetRtSvc/v1`이다. 공공데이터포털의 공식 명세와 한국부동산원 2024-12-03 기술문서를 교차 확인했다. 2024-02-29에는 서비스명이 경쟁률 및 특별공급 신청현황 조회로 바뀌고 APT 특별공급 신청현황 operation이 추가됐다. [공식 변경 공지](https://www.data.go.kr/bbs/ntc/selectNotice.do?originId=NOTICE_0000000003499)

| operation | 용도 | 추가 filter |
|---|---|---|
| `getAPTLttotPblancCmpet` | APT 분양정보/경쟁률 | `HOUSE_MANAGE_NO`, `PBLANC_NO`, `RESIDE_SECD` |
| `getUrbtyOfctlLttotPblancCmpet` | 오피스텔/도시형/민간임대/생활숙박 | 두 공식 번호 |
| `getPblPvtRentLttotPblancCmpet` | 공공지원 민간임대 | 두 공식 번호, `SPSPLY_KND_CODE` |
| `getCancResplLttotPblancCmpet` | 취소후재공급 | 두 공식 번호 |
| `getRemndrLttotPblancCmpet` | 잔여세대 | 두 공식 번호, 선택적으로 `REMNDR_HSHLD_PBLANC_TYCD` |
| `getAptLttotPblancScore` | APT 당첨가점 | 두 공식 번호, `RESIDE_SECD` |
| `getOPTLttotPblancCmpet` | 임의공급 | 두 공식 번호 |
| `getAPTSpsplyReqstStus` | APT 특별공급 신청현황 | 두 공식 번호 |

모든 endpoint는 `page`, `perPage`, `returnType`, `serviceKey`를 사용한다. 키는 client/Vercel에 넣지 않고 Supabase Edge secret에만 두어야 한다.

## 3. 공식 응답 필드

### APT 일반공급 경쟁률

`HOUSE_MANAGE_NO`, `PBLANC_NO`, `MODEL_NO`, `HOUSE_TY`, `SUPLY_HSHLDCO`, `SUBSCRPT_RANK_CODE`, `RESIDE_SECD`, `RESIDE_SENM`, `REQ_CNT`, `CMPET_RATE`.

즉 주택형·순위·거주범위별 공급세대수, 접수건수, 공식 경쟁률을 제공한다. 이 행들을 합산해 하나의 “전체 경쟁률”로 만드는 공식 aggregation field는 없다.

### APT 특별공급 신청현황

주택형과 전체 특별공급 세대수 외에 다자녀, 신혼부부, 생애최초, 청년, 노부모, 신생아, 기관추천, 이전기관의 배정세대수와 지역별 접수건수를 제공한다. `CMPET_RATE` 필드는 없으므로 동일 주택형·동일 특별공급 유형의 배정세대수와 접수건수임이 확인되는 범위에서만 계산 후보가 된다.

### 취소후재공급

일반·다자녀·신혼부부·생애최초·노부모·기관추천별 배정세대수, 접수건수, 경쟁률 필드를 직접 제공한다.

### 잔여세대·임의공급·기타 공급

주택형, 공급세대수, 접수건수, 경쟁률을 제공한다. 공공지원 민간임대는 공급유형별 배정세대수와 경쟁률을 제공한다.

### 당첨가점

APT에 한해 주택형·거주범위별 `LWET_SCORE`, `TOP_SCORE`, `AVRG_SCORE`를 제공한다. 이것은 과거 결과이며 현재 공고의 당첨확률이나 미래 커트라인으로 변환하면 안 된다.

## 4. 데이터 가능성 매트릭스

| 데이터 | 판정 | 근거와 제한 |
|---|---|---|
| 전체 경쟁률 | 추가 확인 필요 | 공식 응답은 주택형·순위·거주범위 행이다. 순위별 잔여물량과 지역 행을 단순 합산하면 분모가 중복될 수 있다. |
| 주택형별 경쟁률 | 공식적으로 가능 | 모든 주요 경쟁률 operation이 `HOUSE_TY`, 공급세대수, 접수건수, 경쟁률을 제공한다. |
| 일반공급 경쟁률 | 공식적으로 가능 | APT 일반, 취소후재공급 일반 등에서 공식 경쟁률 제공. |
| 특별공급 경쟁률 | 계산 가능 / 특정 공급유형만 가능 | APT 특별공급은 유형별 배정·지역별 접수건수로 동일 scope 계산 가능. 취소후재공급은 일부 유형의 공식 경쟁률 제공. |
| 신청자 수 | 공식적으로 가능 | `REQ_CNT` 또는 공급유형별 접수건수 필드. |
| 공급 세대수 | 공식적으로 가능 | `SUPLY_HSHLDCO` 및 공급유형별 배정세대수 필드. |
| 지역별 신청자 | 특정 공급유형만 가능 | APT 일반의 `RESIDE_SECD`; APT 특별공급의 해당/기타경기/기타지역 count. |
| 청약 순위별 신청자 | 특정 공급유형만 가능 | APT 일반에 `SUBSCRPT_RANK_CODE`. |
| 당첨가점 최저 | 특정 공급유형만 가능 | APT 당첨가점 operation. |
| 당첨가점 평균 | 특정 공급유형만 가능 | APT 당첨가점 operation. |
| 당첨가점 최고 | 특정 공급유형만 가능 | APT 당첨가점 operation. |
| 예비당첨 정보 | 공개 데이터 없음 | 공식 Swagger에 예비당첨 번호·인원·명단 field가 없다. 기관추천 `PREPAR_CNT`는 일반 예비당첨 정보로 해석하지 않는다. |
| 과거 유사단지 경쟁률 | 추가 확인 필요 | 동일 공고의 과거 결과는 공식 번호로 조회 가능하지만 유사단지 관계와 검색 API는 제공되지 않는다. fuzzy name match를 primary join으로 쓰지 않는다. |

## 5. 다른 공식 공급기관 조사

- 청약Home/한국부동산원: 현재 완판e ApplyHome 공고와 같은 공식 번호 체계라 가장 직접적인 source다. 청약Home 웹 UI도 APT 분양정보와 경쟁률을 별도 화면으로 제공한다. [청약Home APT 분양정보/경쟁률](https://www.applyhome.co.kr/ai/aia/selectAPTLttotPblancListView.do)
- LH: 공공데이터포털에는 분양임대 **공고** 조회 API가 확인되지만 통합 경쟁률 API는 확인되지 않았다. 경쟁·신청현황은 개별 공지와 첨부파일로 게시되는 사례가 있다. [LH 공고 OpenAPI 목록](https://www.data.go.kr/dataset/3036180/openapi.do), [LH 신청현황 공식 공지 예시](https://apply.lh.or.kr/lhapply/apply/noti/an/view.do?bbsSn=9102835508&ccrCnntSysDsCd=03&mi=1079)
- GH: 공식 청약센터에 경쟁률 조회 화면과 공고별 첨부 결과가 있지만 ApplyHome 공식 번호와 공통인 문서화된 API는 확인되지 않았다. [GH 경쟁률 조회](https://apply.gh.or.kr/sb/sr/sr7170/selectGetCompete.do)
- SH: 공식 인터넷청약시스템과 공고 문서는 확인했으나 이번 조사 범위에서 안정적인 공개 경쟁률 API와 ApplyHome join key는 확인하지 못했다.

따라서 V1 provider는 ApplyHome 공식 API만 고려하고, LH/SH/GH 파일 scraping이나 단지명 fuzzy join은 제외한다.

## 6. Live smoke와 데이터 품질

활용신청 반영 뒤 동일 로컬 secret으로 재측정했다. API key 값은 출력하거나 문서에 저장하지 않았다.

| 측정 | 결과 |
|---|---|
| 현재 90일 listings | 167건 (APT 84, 잔여세대 83) |
| 공식 identifier | 167/167, 100% |
| competition HTTP 성공 | 167/167, 100% |
| 전체 공고 매칭 | 136/167, 81.44% |
| 종료 공고 매칭 | 135/149, 90.60% |
| APT 일반 매칭 | 63/84, 75.00% |
| 잔여세대 매칭 | 73/83, 87.95% |
| APT 특별공급 전체 매칭 | 58/84, 69.05% |
| APT 특별공급 종료 공고 매칭 | 57/68, 83.82% |
| 일반/잔여 API latency | mean 98.2ms, p50 104ms, p95 126ms, max 168ms |
| 특별공급 API latency | mean 94.4ms, p50 91ms, p95 120ms, max 146ms |

일반/잔여 응답은 총 1,640행이었다. `HOUSE_MANAGE_NO`, `PBLANC_NO`, `HOUSE_TY`, `SUPLY_HSHLDCO`, `REQ_CNT`, `CMPET_RATE` 결측은 모두 0건이고 공식 identifier 불일치도 0건이다. 특별공급 334개 원본 주택형 행도 identifier, 주택형, 총 특별공급 세대수, 결과명 결측이 0건이었다.

일정별로는 종료 149건 중 135건, 진행 중 7건 중 1건, 접수 전 11건 중 0건이 매칭됐다. 접수 전 0건은 정상적인 상태로 보고 숫자를 표시하지 않는다. 종료 공고 14건은 공식 endpoint가 빈 결과를 반환하므로 `데이터 미제공`으로 처리한다.

`CMPET_RATE`는 숫자만 오는 필드가 아니다. 1,640행 중 숫자 359행, `-` 522행, 미달 표기 756행, 기타 3행이었다. 78.11%가 비숫자이므로 원문을 숫자로 coercion하지 않는다. UI는 숫자 공식값만 `n : 1`, 신청 0건은 `신청 없음`, 공식 미달 표기는 `미달 n세대`, 그 외에는 `공식 경쟁률 확인 필요`로 표시한다.

## 7. 감사용 domain/adapter

`features/competition/auditAdapter.ts`는 production에서 import되지 않는 순수 계약이다.

- status: `available | in_progress | not_started | not_available`
- deterministic join: `HOUSE_MANAGE_NO + PBLANC_NO`; 하나라도 없으면 join하지 않는다.
- APT 일반과 잔여세대 row를 주택형·순위·거주범위 단위로 보존한다.
- `CMPET_RATE`가 없거나 malformed면 `null`; 신청자/공급 수치로 자동 backfill하지 않는다.
- 별도 계산 함수는 분모와 분자의 scope key가 정확히 같고 공급세대수가 0보다 클 때만 `applicants / suppliedUnits`를 계산한다.
- 접수 예정은 `not_started`, 접수 중은 row 유무와 무관하게 `in_progress`; 종료 공고에 공식 row가 있어야 `available`이다.

이는 향후 구현의 contract test용이며 Listing Detail, AI, Edge, Supabase DB에는 연결하지 않았다.

## 8. Competition Insight V1 구현 범위

feature branch에는 다음 보수적 구조를 적용한다.

1. `DiscoveryListing.sourceIdentifiers`에 `HOUSE_MANAGE_NO`, `PBLANC_NO`를 별도 보존한다. 화면 id 역파싱과 단지명 fuzzy join은 사용하지 않는다.
2. Detail의 종료 공고에서만 별도 `competition` Edge Function을 lazy 호출한다. Discovery 초기 로드, 접수 전, 접수 중에는 외부 competition 요청을 만들지 않는다.
3. cache key는 `sourceType + HOUSE_MANAGE_NO + PBLANC_NO`다. 서버 cache는 공식 행 10분, 빈 응답 5분이며 anon/authenticated에는 table 권한이 없다.
4. client와 Edge isolate에서 동일 공고 동시 요청을 single-flight로 합친다. cache 장애 시에도 공식 upstream 조회는 fail-open하고 기존 Detail은 유지한다.
5. UI는 Personal Fit과 독립된 `청약 경쟁 정보` section이다. APT 일반은 주택형·순위·거주범위, 잔여세대는 주택형, 특별공급은 주택형·유형 범위를 보존한다.
6. APT 특별공급은 동일 주택형·동일 유형의 공식 배정세대수와 지역별 신청건수만 합산해 계산한다. 기관추천처럼 필드 의미가 다른 유형은 V1 계산에서 제외한다.
7. 높음/보통/낮음, 전체 합산 경쟁률, 당첨확률, 가짜 커트라인은 만들지 않는다.
8. AI에는 최대 8개의 검증된 범위·공식 숫자만 전달하고 listing id와 raw profile은 보내지 않는다. 허용되지 않은 새 경쟁률이나 확률 문구는 validator가 거부한다.

## 9. 출시 판단

**FEATURE IMPLEMENTATION GO / PRODUCTION PROMOTION GO**

- 공식 data grounding: 충족
- live transport reliability: 251회 전수 호출(일반/잔여 167 + 특별공급 84) 모두 성공
- 종료 공고 match: 일반/잔여 90.60%, APT 특별공급 83.82%
- 핵심 field 결측 및 join mismatch: 0
- cache/load: 별도 lazy Edge + server/client dedup으로 구현
- backend readiness: remote migration 적용, Edge live smoke와 20개 동시 cold 요청의 cross-isolate dedup 확인
- validation: 전체 test/typecheck/export/diff check 통과
- browser QA: 보호된 feature preview의 390×844/desktop Detail에서 공식 데이터 있음·없음, 접수 전·진행 중, direct route, 저장 persistence, Detail→AI를 확인
- production regression: 기존 배포에서 ApplyHome Discovery, Kakao 지도 타일·marker·drag를 확인하고 runtime error/warning이 없음을 확인

## 10. 다음 단계

production 승격 후 공식 경쟁률 있음·없음 공고의 direct route와 기존 Home/Discovery/News/AI 회귀를 한 번 더 확인한다. 금요일 시연 중에는 cache hit/error 비율을 관찰하고, 공식 upstream 장애 시 기존 Detail을 유지하는 fail-open 경로를 우선한다.

## Source ledger

| source | 소유기관 | 사용 근거 |
|---|---|---|
| [경쟁률 OpenAPI](https://www.data.go.kr/data/15098905/openapi.do) | 행정안전부 공공데이터포털 / 한국부동산원 | 서비스 범위, 공식 경고, 트래픽, Swagger operation/schema |
| [한국부동산원 기술문서 게시물](https://www.reb.or.kr/reb/na/ntt/selectNttInfo.do?mi=10251&bbsId=1268&nttSn=82345) | 한국부동산원 | operation 추가 이력, 공식 기술문서 2024-12-03 |
| [2024-02-29 변경 공지](https://www.data.go.kr/bbs/ntc/selectNotice.do?originId=NOTICE_0000000003499) | 공공데이터포털 / 한국부동산원 | 서비스명 변경, 특별공급 신청현황 추가 |
| [청약Home APT 조회](https://www.applyhome.co.kr/ai/aia/selectAPTLttotPblancListView.do) | 한국부동산원 | 공식 사용자 화면의 경쟁률 제공 경로 |
| [LH 공고 OpenAPI](https://www.data.go.kr/dataset/3036180/openapi.do) | 공공데이터포털 / LH | LH 공개 API가 공고 조회 중심임을 확인 |
| [LH 신청현황 공지 예시](https://apply.lh.or.kr/lhapply/apply/noti/an/view.do?bbsSn=9102835508&ccrCnntSysDsCd=03&mi=1079) | LH | 기관별 신청현황이 첨부파일로 게시되는 사례 |
| [GH 경쟁률 조회](https://apply.gh.or.kr/sb/sr/sr7170/selectGetCompete.do) | GH | 공식 기관별 경쟁률 화면 존재 확인 |
