# 생애최초 특별공급 Eligibility V1

## 지원 범위

- 2026-07-08 현재 민영주택 전용 85㎡ 이하 생애최초 특별공급의 공고 전 기본조건
- `ApplicantProfileV2`의 확인된 값만 사용하는 deterministic 분석
- `FirstHomeListingContext`가 제공되면 그 컨텍스트에서 명시적으로 확인된 1순위, 소득·부동산, 전용면적만 반영

## 지원하지 않는 범위

- 국민주택, 공공분양, 공공임대
- 지역별 우선공급·거주기간
- 청약통장 1순위의 지역·규제지역·예치금 세부 계산
- 가구원수별 전년도 도시근로자 월평균소득 금액과 출산가구 완화 계산
- 부동산 가액 산정
- 실제 공고 전체의 신청 자격 확정

지원하지 않거나 공고가 필요한 조건은 `needs_listing_confirmation`으로 남긴다. `unknown`은 절대 `not_eligible`로 바꾸지 않는다.

## 공식 근거

- [주택공급에 관한 규칙 제43조·제55조·제55조의3](https://www.law.go.kr/LSW/lsInfoP.do?lsId=008243), 시행 2026-06-15
- [생애최초 주택 특별공급 운용지침](https://www.law.go.kr/LSW/admRulLsInfoP.do?admRulSeq=2100000282432), 시행 2026-07-08

규칙 버전: `KR-FIRST-HOME-PRIVATE-2026.07.08-v1`
