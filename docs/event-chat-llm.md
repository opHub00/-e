# 행사 상담 LLM 계약

`/event/chat`의 판정 source of truth는 기존 assessment/Samdo recommendation engine이다. LLM은 판정·순위·공식 점수·공급량·접수일을 계산하지 않고, `POST /event-api/chat`에 전달된 화면용 스냅샷을 설명만 한다.

## 서버 설정

- provider: Google Gemini
- 기본 model: `gemini-2.5-flash`
- key 우선순위: `EVENT_CHAT_GEMINI_API_KEY`, `GEMINI_API_KEY`
- model override: `EVENT_CHAT_GEMINI_MODEL`
- 모든 변수는 서버 함수에서만 읽는다. Expo/browser bundle은 key를 읽지 않는다.

## 전송하는 정보

`EventChatContext`는 공고명, 공급유형, 확정된 판정 상태, 공급단계, 공식 점수/항목, 충족 조건, 확인 필요 항목, 주의사항, 근거 section/page, 추천 대안만 담는다.

다음은 전송하지 않는다.

- 이름, 원문 생년월일, 정확한 소득·자산
- `UserProfile`, 내부 fact/rule key, Rule Package 원문
- QR token 또는 세션 payload

사용자가 질문이나 최근 대화에 직접 입력한 연락처·이메일·주민등록번호·정확한 날짜·금액은 서버 전송 전에 마스킹하고 서버에서도 한 번 더 제한한다. 최근 이력은 최대 6턴, 총 3,000자로 제한한다.

## 실패 및 안전 처리

키 미설정, 8초 timeout, rate limit, provider 오류, 잘린 응답, JSON/grounding 불일치, 확률·경쟁률 추정, prompt injection 요청은 모두 기존 deterministic 답변으로 돌아간다. 응답 `mode`는 `llm`, `deterministic`, `fallback` 중 하나이며 provider/model/requestId는 화면 상태에 QA metadata로 보존한다.

