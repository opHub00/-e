# 삼도 1·2지구 presentation adapter

- 공고 숫자·일정·가격·토지임대료는 `samdoDual/config.ts`만 읽는다.
- 사용자 판정은 `buildSamdoDualAssessment(input)` 결과만 읽는다.
- `districtAdapter.ts`는 위 domain 값을 화면 모델로 변환할 뿐 자격·순위·점수를 계산하지 않는다.
- 정상 `/event` 경로에는 brief/placeholder 데이터가 없다.
- `districtSource.ts`의 값은 Demo Mode `?layout=sample`에서만 쓰는 명시적 레이아웃 QA fixture다.
- 층별 분양가격을 단일 대표가격으로 축약하지 않는다.
- 공급 세대수와 경제조건을 경쟁률 또는 당첨확률로 표현하지 않는다.
