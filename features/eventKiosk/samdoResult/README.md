# 공고 전용 결과 (삼도이동 1지구)

`/event/samdo` — "이 공고에 어떻게 신청하는 게 가장 유리한가"를 바로 보여 주는 화면.

| 파일 | 역할 |
|---|---|
| `samdoInput.ts` | 행사 답변 → `AssessmentInput`. 모르는 값은 비워 둔다(엔진이 CONDITIONAL 로 남김). **Codex 검토 대상** |
| `samdoEvaluate.ts` | 체크인된 규칙 패키지 + `buildSamdoRecommendation` → `toSamdoPresentationRecommendation` (판정·순위는 Codex 그대로) |
| `samdoResultModel.ts` | 화면 모델: 추천 hero → 왜 추천 → 다른 유형 → 어려운 유형 → 일정·서류. 순서를 바꾸지 않고 문장만 고른다 |
| `samdoSummary.ts` | QR: 기존 v1 결과 세션 계약 그대로(개인정보 없음) |
| `SamdoResultView.tsx` | 밀도별 배치. desktop 2단(추천+이유+일정 / 다른 유형), iPad 1열·대안 2열, 휴대폰 추천→이유→대안→일정 |
| `brandAssets.ts` | 완판이(업로드 `.ai` 원본 앞면), ㈜흥인코퍼레이션 로고(업로드 원본). 없으면 null → 'asset 필요' 자리 |
| `SamdoEntryBanner.tsx` | 결과 목록 위 입구 |

- 공급 세대수는 정보로만 보여 주고 당첨 가능성처럼 쓰지 않는다. 경쟁률·확률은 없다.
- 시연: Demo Mode 빌드에서 `/event/samdo?persona=NEWLYWED_ONE_CHILD`.
- 점검: `npm run test:event-kiosk`(samdoResult.test.ts 포함), `node scripts/event-samdo-e2e.mjs`.
