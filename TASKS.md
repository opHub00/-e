# Sprint 0

## Foundation
- [x] Expo TypeScript 프로젝트 생성
- [x] Expo Router 설정
- [ ] ~~NativeWind 설정~~ → StyleSheet + `design/tokens.ts` 로 대체 (보류)
- [x] Pretendard 적용
- [x] `design/tokens.ts` 연결
- [x] Zustand 설치

## Vertical Slice 1
- [x] Onboarding UI
- [x] UserProfile 저장
- [x] preparation score 연결
- [x] Home UI
- [x] Future UI
- [x] 1/2/5년 시뮬레이션
- [x] recommended actions

## Vertical Slice 2
- [x] Quiz 10개
- [x] O/X interaction
- [x] XP + streak

## Vertical Slice 3
- [x] Gemini Edge Function
- [x] contextual AI CTA

## Vertical Slice 4 — Demo Polish
- [ ] tokens.ts 단일 소스화 — 부분 완료
  - [x] letterSpacing: 화면에 남은 raw 값 0 (tracking 토큰으로 수렴)
  - [x] radius: 카드 구간 raw 값 0 (진행바·점의 end cap 만 예외)
  - [ ] 색상: 화면 하드코딩 hex 8개. 대부분 경고/오류 카드의 옅은 배경이라
        tint 에 대응 단계가 없어서 남아 있다.
  - [ ] spacing: raw 숫자 427개. 화면 바깥 여백(spacing.screen)은 일관되지만
        카드 안쪽 값은 아직 화면마다 직접 쓴다.
  - [ ] fontSize: 스케일 밖 override 21개. 대부분 브랜드 밴드의 큰 숫자다.
- [x] Home 정보 우선순위 재배치 · 카드 1개 삭제
- [x] Future 연차 전환 명확화 + 변화 이유 표시
- [x] Quiz 결과에서 개인화 카드 강조 · XP 보조화
- [x] AI 화면을 설명 화면으로 재구성
- [x] 데모 프로필 고정 + reset
