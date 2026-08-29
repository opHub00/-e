# Claude Code Instructions — 완판e MVP

## Goal
2~3분 시연 가능한 2030 청약 준비 프로토타입을 만든다.

## 반드시 지킬 것
- PRODUCT.md, MVP_SCOPE.md, DESIGN_SYSTEM.md를 먼저 읽는다.
- Stitch 화면을 그대로 복제하지 않는다. 디자인 스타일만 참고한다.
- 한 번에 한 Vertical Slice만 완성한다.
- 계산 로직은 `domain/`에 순수 함수로 작성한다.
- AI에게 점수/자격 계산을 시키지 않는다.
- 새로운 dependency 추가 전 필요성을 확인한다.
- 컴포넌트 중복을 피하되 과도한 추상화도 하지 않는다.
- 사용자에게 보여주는 문구는 한국어 해요체를 사용한다.

## First Vertical Slice
Onboarding → Home → Future

완료 조건:
1. 프로필 입력 가능
2. 준비도 계산
3. 홈 표시
4. 1/2/5년 선택 시 미래 상태 갱신
5. 추천 행동 3개 표시
