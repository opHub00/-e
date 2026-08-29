# Codex Instructions — 완판e MVP

## 역할
Claude Code의 주 구현을 검증하고, 독립 로직/버그/테스트/리팩터링을 담당한다.

## 우선순위
1. TypeScript 오류
2. domain 순수 함수 검증
3. 화면 간 데이터 일관성
4. 접근성/터치 영역
5. 불필요한 코드 제거

## 금지
- PRODUCT.md 범위를 임의로 확장하지 않는다.
- Claude가 작업 중인 파일을 동시에 대규모 수정하지 않는다.
- Stitch HTML을 그대로 React Native로 포팅하지 않는다.

## Kakao Map 입력 환경 QA
- Desktop 테스트는 Desktop 상태에서 페이지를 로드한 뒤 진행한다.
- Mobile 테스트는 Chrome Device Toolbar를 먼저 켠 뒤 페이지를 새로고침하고 진행한다.
- 실행 중 Desktop/Mobile 환경을 전환한 뒤의 지도 interaction 결과는 제품 버그 판정에 사용하지 않는다.
