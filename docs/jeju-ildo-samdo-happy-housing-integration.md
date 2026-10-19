# 제주일도·삼도 행복주택 RuleSet 통합

## 1. 기존 구조 감사

현재 공고 판정 경로는 다음과 같다.

1. PDF를 `ParsedDocument`와 안정적인 block/table locator로 변환한다.
2. 숫자·기간·점수 등의 `ExtractedFact`를 만들고 semantic binding 후보를 좁힌다.
3. deterministic RuleBuilder와 validator가 import package를 만든다.
4. package를 관리자 검수 lifecycle에 import한다. AI 원본은 immutable이고, 승인·수정·근거·예외·충돌 이력을 따로 보존한다.
5. 승인된 RuleSet을 활성화하고 `announcement_listing_bindings`로 listing과 연결한다.
6. runtime은 활성·공개·승인 RuleSet을 decode해 `assessApplication()`에 전달한다.

검수 전 source of truth는 `data/assessment-rules/*.json` import package이고, runtime source of truth는 DB에서 활성화되고 listing에 binding된 RuleSet이다. 판정 숫자와 연산자는 RuleSet에서 오며 LLM은 runtime 계산에 참여하지 않는다.

## 2. 삼도 공고와 기존 구조의 gap

검토한 원문은 `제주일도·삼도 행복주택 예비입주자 모집`(2026-09-18), SHA-256 `76c89334fb042564569d9856acd073c85a84c425f124474891bdb01303d6404e`이다. parser 결과는 18쪽, 1,127 blocks, 59 tables이며 reading-order/table-grid 경고 때문에 source status를 `DRAFT_SOURCE_VERIFIED`로 유지한다.

기존 runtime은 `youth/newlywed/firstHome` 세 공급유형과 분양 공고의 단계 문구에 치우쳐 있었다. 이 공고에는 대학생, 청년, 신혼부부·한부모가족, 고령자, 주거급여수급자가 있고 순위와 추첨을 함께 표현해야 한다. 또한 다음 raw fact가 기존 profile에 없었다.

- 재학·입학·졸업 상태와 졸업일
- 학교 소재지와 소득활동 소재지
- 청년 소득활동 유형과 총 소득활동 기간
- 신청자와 부모의 합산소득
- 주거급여 수급 여부
- 입주 전까지 청약통장 가입사실 증명 가능 여부

소득·자산 한도는 공급유형, 세대원 수, 맞벌이, 최근 출산·입양 자녀 수에 따라 달라진다. 기존 단일 threshold fact로는 안전하게 표현할 수 없었다.

## 3. 공통 구조 확장

- `SupplyType`을 `student`, `senior`, `housingBenefit`까지 확장하고 공통 registry를 runtime, decoder, Edge Function에서 공유한다.
- 소득·자산·자동차 한도를 RuleSet parameters의 matrix로 표현한다. engine은 공급유형과 raw profile fact로 해당 cell을 deterministic하게 고른다.
- matrix cell이 없으면 임의 값을 만들지 않고 `rule:threshold...` missing으로 fail closed한다.
- 1순위/2순위/추첨은 기존 stable stage enum을 유지하고 `stageLabel`만 RuleSet parameters에서 가져온다.
- 점수제가 없는 행복주택 공급유형은 `NOT_APPLICABLE`이며 0점을 생성하지 않는다.
- listing-scoped persistence의 supply constraint와 RPC allowlist를 additive migration으로 확장한다.

공고 전용 분기문 대신 `threshold.<supply>.*`, `stage.<supply>.*.label` parameter contract를 사용했으므로 다른 임대 공고도 같은 engine으로 표현할 수 있다.

## 4. Rule package

- external ID: `lh-jeju-ildo-samdo-happy-20260918`
- RuleSet: `DRAFT-2026-09-18-transcription-1`
- 공급유형: 5
- rules: 44
- 원문 전체를 저장소에 복제하지 않고 source hash, evidence block locator와 필요한 literal을 package에 보존한다.
- 모집 일정: 신청 2026-10-01 10:00~2026-10-02 17:00, 서류대상자 2026-10-08 16:00, 서류제출 2026-10-14까지, 당첨자 2026-12-28 16:00.

이 package는 기존 분양 공고용 `samdo-2026-v1.7.json`과 다른 공고이므로 announcement/document/RuleSet ID를 공유하지 않는다.

## 5. 입력 fact 분류

| 구분 | 항목 | 처리 |
|---|---|---|
| 장기 profile | 생년월일, 혼인상태, 자녀, 현재 주택/세대 무주택, 세대원 수, 소득·자산·자동차 | ApplicantProfileV3 |
| 장기 profile | 교육상태, 졸업일, 학교 소재지, 소득활동 소재지, 청년 활동유형·기간, 부모합산소득, 주거급여 | ApplicantProfileV3 optional fact |
| 공고별 답변 | 입주 전 통장 증명, 성년/예외 세대주 확인, 공공임대 불법양도 제한, 세대 내 중복신청 없음 | user + listing + supply scoped persistence |
| 공고문 결정 | 전국 신청 가능, 소득/자산/자동차 표, 최근 출산 완화폭, 순위와 일정 | RuleSet parameters/rules |
| 파생값 | 소득·자산 한도 충족, 순위, 최종 적격상태 | 저장 가능한 사용자 fact가 아니며 engine이 계산 |

`applicationResidencyEligible`은 이 공고가 전국 신청 가능하므로 사용자 질문으로 요구하지 않는다. source에서 결정되는 조건을 profile missing으로 만들지 않는다.

## 6. NEEDS_USER_INPUT 측정

`scripts/analyze-jeju-samdo-happy-coverage.mjs`는 완성된 장기 profile과 listing-scoped 답변 유무를 분리해 같은 다섯 공급유형을 평가한다.

| 시점 | missing facts | NEEDS_MORE_INFORMATION | 판정 완료 | 반복 질문 방지 |
|---|---:|---:|---:|---:|
| 첫 방문 | 17 | 5 | 0 | 0 |
| 동일 공고 재방문 | 0 | 0 | 5 | 17 |

첫 방문 질문을 숨기지 않는다. 사용자가 답한 네 종류의 공고별 확인값만 같은 user/listing/supply/RuleSet/document 조합에서 재사용한다. 다른 공고나 공급유형에는 전파하지 않는다.

## 7. 검증 lifecycle

로컬 검증은 source hash와 모든 evidence locator의 존재를 확인하고, package schema를 decode한 뒤 동일한 `assessApplication()`으로 다음 대표 profile을 평가한다.

- 적격: 청년 1순위, 대학생 1순위, 예비신혼 미래세대, 고령자, 주거급여수급자
- 부적격: 주택 소유 청년
- 추가정보: 소득 미입력
- 공고측 정보 부족: threshold matrix에 존재하지 않는 세대원 수

Staging 반영 순서는 additive migration → package import → 관리자 evidence/semantic review → approve → activate → listing binding → representative profile assessment이다. 검토본 status이므로 human review를 건너뛰지 않는다.

## 8. 남은 한계

- parser reading-order/table-grid 경고가 있어 원문 표 전체의 관리자 대조가 필요하다.
- 최근 출산·입양 완화는 raw child facts에서 결정하지만 태아/입양 provenance를 운영 profile에서 충분히 수집하는지 별도 UX 검증이 필요하다.
- 행복주택 계약·거주기간, 동일 유형 재청약 세부 제한은 eligibility와 계약 안내를 분리해 추가 모델링해야 한다.
- persisted Portfolio summary에는 stable stage enum이 저장된다. 사용자용 `1순위/2순위/추첨` label을 snapshot에서 보존·조회하는 후속 contract가 필요하다.
- 이 package는 `DRAFT_SOURCE_VERIFIED`이므로 공식 source URL과 원본 storage provenance가 확인되기 전 Production 활성화 대상이 아니다.

## 9. Staging 안전 원칙

`20261019083000_expand_listing_input_supply_types.sql`은 기존 테이블을 삭제하지 않는 additive correction이다. production에는 적용하지 않는다. Staging identity가 명시적으로 확인되고 production ref와 다를 때만 migration/import/review/activation/binding을 수행한다. 실패 시 기존 3개 공급유형 runtime을 유지하고 새 RuleSet과 binding을 비활성 상태로 둔다.
