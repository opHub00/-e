# Newlywed Eligibility V1

## 공식 규정 감사 (2026-09-10)

- [주택공급에 관한 규칙 제41조](https://law.go.kr/lsLawLinkInfo.do?lsJoLnkSeq=1000808030&chrClsCd=010202): 국토교통부령 제1592호, 시행 **2026-06-15**. 민영주택 85㎡ 이하, 공고일 기준 혼인기간 7년 이내, 무주택세대구성원, 소득 또는 소득초과 부동산 경로, 자녀 관련 공급순위.
- [같은 규칙 제48조·별표2](https://law.go.kr/LSW/lsLinkCommonInfo.do?lspttninfSeq=123621): 가입 6개월과 지역·면적별 예치금. 월 납입액을 예치금으로 환산하지 않는다.
- [같은 규칙 제4조·제53조·제54조·제55조·제55조의3](https://www.law.go.kr/LSW/lsInfoP.do?lsId=008243): 거주·주택소유 인정·재당첨·특별공급 제한 및 본인/배우자 혼인 전 당첨, 출산가구 재공급 특례. 기존 프로필로 특례를 모두 확인할 수 없으므로 주택 보유나 제한 이력만으로 hard fail하지 않는다.
- [신생아 및 신혼부부 주택 특별공급 운용지침](https://www.law.go.kr/LSW/admRulLsInfoP.do?admRulSeq=2100000282334): 국토교통부고시 제2026-360호, 시행 **2026-07-08**. 종전 「신혼부부 주택 특별공급 운용지침」의 현행 명칭. 국토부 제2026-253호(2026-06-15) 개정 이후 시행본을 확인했다.
- 블로그·분양 홍보물은 판정 근거로 사용하지 않았다. 미래 시행 규정은 적용하지 않는다.

Rule version: `KR-NEWLYWED-PRIVATE-2026.07.08-v1`; metadata effective date: `2026-07-08`; reviewed: `2026-09-10`. 각 출처의 시행일은 별도 보존한다.

## 지원 범위와 한계

민영주택 전용 85㎡ 이하 **신혼부부 특별공급의 공고 전 기본조건**만 분석한다. 국민주택·공공분양·임대·85㎡ 초과는 `unsupported`이며 개인 탈락을 의미하지 않는다. 현행 신생아 특별공급은 별도 제도이므로 V1에 포함하지 않는다. 과거/잘못된 공고일은 경과규정 확인으로 반환하고 현재 규정의 개인 탈락 판정을 실행하지 않는다.

12 checks: 지원 범위, 혼인 상태, 혼인기간, 현재 세대 주택 보유, 통장 보유·기간, 예치금, 특별공급 제한·특례, 소득, 부동산 경로, 자녀·공급순위, 거주·신청 제한, 공고 신혼부부 물량. 각 check는 `key/label/status/reason/requiredBundle/sourceRefs`를 갖는다. 공식 소득표 금액, 맞벌이 세부 소득, 부동산 산정액, 순위·추첨 확률은 계산하지 않는다. 부동산 기준은 소득초과 시 경로이며 모든 가구의 독립적 필수 탈락 기준으로 적용하지 않는다.

`unsupported → not_eligible → needs_information → needs_listing_confirmation → likely_eligible` 순으로 요약한다. `unknown/not_applicable`의 필수값은 hard fail하지 않는다. 단 자산의 `not_applicable`은 기존 UI의 '없음' 응답이므로 입력 완료로 보고 법정 금액 충족은 공고 확인으로 남긴다. 알려진 다른 조건이 불충족이면 전체 상태는 `not_eligible`일 수 있지만 unknown check 자체는 항상 미확인이다.

혼인기간은 현재 저장된 연수만 사용한다. 7년 입력은 정확한 신고일/공고일을 모르므로 경계일 확인, 7년 초과는 입력 기준 불충족이다. 7년 미만도 공고일·동일인 재혼 합산기간을 최종 확인하도록 안내한다. 과거 소유 이력을 평생 무주택 요건으로 가져오지 않는다. 자녀 0명을 기본자격 탈락으로 처리하지 않으며 출생연도만으로 임신·입양·2세 미만·출산 특례를 확정하지 않는다.

V1에는 공고 금액/거주/예치금 확정 경로가 없으므로 모든 프로필 정보를 입력해도 일반적으로 `needs_listing_confirmation`이다. `likely_eligible`는 상태 계약에만 보존되며 공고 미확인을 모두 충족으로 덮어쓰는 boolean override는 제공하지 않는다.

## Profile·화면

ApplicantProfile V2 schema 변경 없음. 재사용: marriageStatus, marriageYears, childrenCount, currentOwnership, householdHasHome, hasSpecialSupplyRestriction, hasAccount, accountMonths, annualRange, realEstate, currentRegion. childBirthYears, previousOwnership, householdDisqualifyingPreviousOwnership, monthlyPayment, household.memberCount, preferences는 법정 증빙이나 금액 대신 사용하지 않는다. 임신·입양·정확한 신고일·배우자 소득·소득표 필드는 현재 없으며 invent하지 않는다.

`/newlywed` 관리 dashboard의 **내 신혼 청약 조건 보기 → /eligibility/newlywed**. 기존 ProfilePromptSheet, FAMILY bundle 자동 제안, prompt fatigue를 재사용한다. 모든 부족정보에는 기존 bundle 편집 링크가 있고 `returnTo=/eligibility/newlywed`로 돌아오면 store 변경에 따라 재계산한다. 새 질문을 추가하지 않았다.

관련 공고는 기존 dashboard로 돌아가 특별공급 일정 기반 후보를 확인한다. 신혼부부 확정 대상이라는 의미로 승격하지 않았다. UI에 범위·상태·공식 출처·규정 시행일·참고분석 문구를 표시한다.

`NewlywedListingContext`와 `buildNewlywedListingContext`는 향후 공고 연결용 독립 인터페이스다. 현 ApplyHome APT 모델의 공식 공급유형/주택유형/공고일만 사용한다. 이름·태그·특별공급 일정에서 신혼 물량을 추정하지 않는다. 현 데이터에 면적·신혼 물량이 없어 해당 값은 비워두며 route는 V1 공고 전 분석이다. Personal Fit·Peer Benchmark 점수에 합산하지 않는다.

## AI 계약과 독립 endpoint

- 클라이언트가 `{ newlywed: buildNewlywedAiContext(result) }`만 전송한다. 이름·지역명·금액·profile 원본을 전송하지 않는다.
- Edge 입력은 feature/status/checks/missingInfo/actions/ruleMetadata만 허용하며 중첩 추가 키·잘못된 버전·상태 불일치를 거부한다.
- Gemini는 기존 check key 1~3개만 선택한다. 응답의 새 자격 판정/점수/확률/설명 문장/추가 키/미지 key는 거부한다. 자유 생성 문장을 UI에 렌더링하지 않으므로 규칙 결과를 바꿀 수 없다.
- 클라이언트도 선택을 재검증하고 현재 결과의 label/reason/status로 설명을 구성한다. 불충족/부족/공고 확인 항목은 AI 선택과 관계없이 유지한다. 네트워크·키 없음·provider 장애·불안전 응답 시 같은 로컬 설명으로 fallback하고 표시한다.
- profile 변경/화면 종료 시 요청 취소 및 generation 검증으로 오래된 설명을 버린다. 로딩 중 중복 요청을 막는다.
- client는 독립 함수 `ai-newlywed`를 사용하며 JWT gateway 검증을 켠다. 이전 preview의 `ai-newlywed-v1-preview`는 같은 handler를 쓰는 호환 entrypoint다. 기존 `ai` 함수, Auth, RLS, DB migration 변경 없음.
- 2026-09-10 실제 Gemini 응답으로 기존 fallback을 재현했다. 키 digest 일치 및 HTTP 200을 확인했지만 500-token 예산 중 thinking 479 tokens 사용 후 `MAX_TOKENS`, 불완전 JSON을 반환했다. `thinkingBudget: 0`, 1024 output tokens, check key enum schema로 수정 후 1.6초 내 `STOP`, 정상 selection과 `fallback: false`를 확인했다. token/provider 장애 때의 안전한 fallback은 유지한다.

## UI 마무리

Claude의 고정 lavender hero, 상태 pill, 다음 행동 우선, 정보필요 우선 정렬, 기본 3개와 더보기, 전문용어 도움말 6종, summary replay를 보존했다. 펼침 후 접기 버튼이 유지되도록 조건을 수정하고 TermHelp 실제 터치 높이를 44px로 맞췄다. 사용자 카피의 V1을 제거하고 참고 안내를 해요체로 정리했다. 내부 rule/feature version은 유지한다. 공개 카피 값과 JSX 텍스트를 대상으로 최소 regression guard를 추가했다.

## 검증

`npm test`에 신규 domain/AI 계약/Edge handler 테스트 포함. 필수 `npx tsc --noEmit`, `npx expo export --platform web`, `git diff --check`. 브라우저 QA 및 배포 결과는 `NEWLYWED_QA.md`에 기록한다.
