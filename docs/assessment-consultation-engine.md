# ApplicationAssessment 상담 엔진

## 목적

청약 맞춤판정 상담은 자연어를 입력 수단으로 사용하지만, 자격·공급단계·가점의 계산기는 새로 만들지 않는다. 기존 `assessApplication()`과 승인된 `AnnouncementRules`가 유일한 판정 근거다.

```text
사용자 메시지
  → Intent / Field Extraction
  → 프로필 스냅샷 + 수집 답변 병합
  → assessApplication()
  → 누락정보 우선순위화
  → Consultation Response Builder
```

Rule이 없거나 공고 쪽 규칙이 미해결이면 일반 상식이나 다른 공고 rule로 대신 답하지 않는다.

## 책임 경계

### 자연어 계층

- 의도 분류
- 사용자가 명시한 값 추출
- 다음 질문 선택
- 엔진 결과를 읽기 쉬운 문장으로 조립

### deterministic 계층

- 공고일 기준 나이
- 소득·자산 한도 비교
- 청약통장 가입기간과 납입횟수
- 신청 자격
- 우선·일반·추첨 단계
- 가점과 항목별 breakdown

`ConsultationLanguageProvider` 출력에는 eligibility, stage, score, evidence 객체가 존재하지 않는다. 허용 필드 외 값이 있으면 전체 provider 출력을 거부한다. 따라서 provider가 `score: 9` 또는 `eligible: true`를 반환해도 사용자 결과에 들어갈 수 없다.

## 세션 모델

`ConsultationSession`은 다음 정보를 가진다.

- `announcementId`, `listingId`, 선택한 `supplyType`
- 대화 시작 시점의 `userProfileSnapshot`
- 이번 상담에서 받은 `collectedAnswers`
- 마지막 deterministic `ApplicationAssessmentResult`
- 현재 `missingFields`
- 최근 대화 turn

대화는 최근 12개 turn, turn당 1,200자로 제한한다. 원문 문서나 긴 provider context는 세션에 저장하지 않는다. 입력 병합 시 세션과 프로필을 복제하여 기존 store 객체를 변경하지 않는다.

## Intent

- `CHECK_ELIGIBILITY`
- `CHECK_SCORE`
- `CHECK_STAGE`
- `WHY_RESULT`
- `CHECK_REQUIREMENT`
- `CHECK_EXCEPTION`
- `CHECK_DOCUMENTS`
- `UPDATE_USER_INFO`
- `UNKNOWN`

기본 구현은 명시적인 한국어 표현만 추출하는 offline interpreter를 제공한다. 향후 LLM provider도 같은 좁은 contract를 사용한다.

## 자연어 입력 정규화

“통장 2년, 25회 납입”은 가입기간 24개월과 인정 납입횟수 25회로 분리한다. 기간을 날짜로 바꿀 때는 기기 현재시각이 아니라 rule set의 공고일을 기준으로 한다.

“31살”은 `declaredAgeYears`로 보존하지만 생년월일을 만들지 않는다. 청약의 연령 경계는 날짜에 따라 달라질 수 있으므로 exact birth date가 없으면 엔진은 계속 생년월일을 요청한다.

“부모님 집이 있다”는 표현도 즉시 주택보유 boolean으로 바꾸지 않는다. 부모 자산, 신청자 본인의 무주택 범위, 세대 범위를 공고 근거와 함께 구분해야 한다.

## 누락정보 전략

기존 `missingInformation`을 그대로 사용하며 세 종류로 구분한다.

1. 상담 답변으로 채울 수 있는 값
2. 기존 프로필에서 확인할 값
3. 공고 검수로만 해결할 값

한 응답에서는 자격에 영향이 큰 질문을 최대 3개만 제안한다. 공고 쪽 누락값은 사용자에게 입력하라고 요구하지 않고 `REVIEW_REQUIRED`와 공고 검토 action으로 돌린다.

## Answer Builder

응답은 다음 순서를 따른다.

1. 신청 가능·어려움·확인 필요 결론
2. 공급유형과 단계 또는 점수
3. 충족·미충족·확인 필요인 핵심 이유
4. 다음 질문
5. 사람이 읽는 공고 근거
6. source status 안내

생애최초처럼 가점이 없는 유형은 0점으로 표현하지 않는다. “가점제가 아니라 공급단계와 추첨 방식이며 별도 점수로 환산하지 않는다”고 설명한다.

## Evidence

응답 객체의 `evidenceRefs`에는 `evidenceId`와 source/section/table/text excerpt를 보존한다. 기본 문장에는 내부 rule ID나 DB UUID를 출력하지 않는다. “왜?”, “근거 보여줘”, “공고 어디에 있어?”에는 연결된 section과 table label을 표시할 수 있다.

## Source status

- `REFERENCE`: 참고 기준, 원문 검증 전
- `DRAFT_SOURCE_VERIFIED`: 제공된 검토본 기준, 최종 공고에서 변경 가능
- `OFFICIAL_VERIFIED`: 공식 공고 기준, 최종 심사는 기관에서 확정

Samdo VER1.7은 `DRAFT_SOURCE_VERIFIED` 문구를 응답당 한 번만 표시한다.

## 예외와 실패 폐쇄

- 규칙 미등록: `CONSULTATION_UNSUPPORTED`
- 공급유형 미선택/미지원: `CONSULTATION_UNSUPPORTED`
- provider output contract 위반: `INTERPRETATION_FAILED`
- 특례, 충돌, 공고 쪽 미해결 규칙: `REVIEW_REQUIRED`

배우자의 혼인 전 주택소유, 해외체류, 출산 완화 같은 입력은 일반 규칙으로 조용히 계산하지 않는다. `specialExceptions`를 통해 기존 엔진에 전달하고, 검토 규칙이 확인될 때까지 확정 답변을 막는다.

## UI contract와 presentation adapter

`sendMessage()`는 갱신된 session과 다음 response를 반환한다.

```ts
{
  message,
  intent,
  resolution,
  assessmentStatus,
  supplyType,
  stage,
  score,
  suggestedQuestions,
  actions,
  evidenceRefs,
  sourceStatus
}
```

위 객체는 domain 내부 응답이다. `features/assessmentConsultation/engineAdapter.ts`가 이를 Claude UX의 `AssessmentConsultationResponse` 형태로 옮긴다. 이 경계에서 `failedConditions`와 `missingInformation`을 사용자용 `blocking`/`pending` 문구로 바꾸고, action·evidence·source status를 전달한다. adapter는 eligibility, stage, score를 계산하지 않는다.

UI는 Supabase schema나 rule expression을 알 필요가 없다. `evidenceId`는 drill-down 연결용이며 기본 화면 text로 출력하지 않는다. 맞춤판정 결과에서 상담을 열 때는 메모리 내 seed로 이미 계산된 결과와 입력을 복제해 넘기므로 같은 질문을 반복하지 않는다.

## 향후 연결

실제 provider는 intent/field extraction adapter로만 추가한다. provider별 schema 검증, timeout, privacy 정책을 적용한 뒤에도 최종 응답은 항상 동일한 `assessApplication()` 호출을 거쳐야 한다. 이 Phase에서는 실제 AI 호출, Rule DB 쓰기, rule 승인·활성화를 수행하지 않는다.
