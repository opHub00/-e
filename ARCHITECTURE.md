# Architecture

## MVP
React Native + Expo + TypeScript

State:
- Zustand
- 필요 시 AsyncStorage

Backend:
- MVP 기본 플로우는 로컬 데이터
- Gemini 연결 시 API Key 보호를 위한 Edge Function만 추가

## Domain Boundary
- `domain/`: 숫자/상태 계산. UI와 분리.
- `store/`: 사용자 입력과 학습 상태.
- `data/`: 퀴즈/데모 콘텐츠.
- `components/`: 재사용 UI.
- `design/`: 토큰.

## Rule
AI에게 점수 계산을 맡기지 않는다.

- `calculatePreparationScore(profile)`
- `simulateFuture(profile, years)`
- `getRecommendedActions(profile)`

Gemini는 위 결과를 쉬운 말로 설명하는 역할만 담당한다.
