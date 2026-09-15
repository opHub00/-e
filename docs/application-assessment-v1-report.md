# 청약 맞춤판정 구현 보고

## 시작 상태와 기준

- 실제 저장소: `C:/완판e/완판e` (상위 `C:/완판e`는 worktree들을 보관하는 디렉터리)
- 시작 branch: `ui/listing-visual-polish`, HEAD `5bcc4a0`
- 시작 작업 트리: clean
- origin: `https://github.com/opHub00/-e.git`, fetch 성공
- 최신 배포 기준: `origin/master`, `4163c99`
- 신규 branch: `feature/application-assessment-v1` (위 origin/master에서 생성)
- 원래 브랜치와 다른 worktree의 파일은 수정하지 않음

## 구현

`features/applicationAssessment`에 기존 프로필 어댑터, JSON 호환 규칙 타입, 순수 판정 엔진, 참조 규칙, 입력·결과 화면, 홈 진입 컴포넌트, 테스트를 추가했다.

청년은 기본 자격과 우선/일반 단계, 각각 3/4항목의 가점 구조를 제공한다.
신혼부부는 신혼/예비신혼/한부모 분기, 우선/일반 단계, 각각 3/4항목의 가점 구조를 제공한다.
생애최초는 기본 자격과 우선/일반/추첨 3단계를 제공하며 가점을 생성하지 않는다.

날짜는 고정된 공고일 기준으로 계산하고, 모르는 입력은 null 상태로 남긴다.
결과에 충족/미달/미상 조건, 단계 설명, 가점 입력값·적용구간, 누락정보, 증빙, 근거 ID와 출처 메타데이터를 보존한다.

홈에서 세 핵심 기능을 동일 위계로 노출한다. 하단 탭은 홈/청약찾기/맞춤판정/준비/전체이며 AI는 기존 전체 메뉴와 문맥 CTA에서 접근한다.
공고 상세 CTA는 URL에 공고 ID만 전달한다. 개인정보는 전달하지 않는다. 미등록 공고는 규칙 준비 중 상태로 처리한다.

## 변경 파일

- 추가: `app/(tabs)/assessment.tsx`
- 추가: `features/applicationAssessment/{types.ts,facts.ts,engine.ts,referenceRules.ts,form.ts,AssessmentScreen.tsx,AssessmentResult.tsx,CoreJourney.tsx,assessment.test.ts,README.md}`
- 변경: `app/(tabs)/home.tsx`, `app/(tabs)/_layout.tsx`, `app/discovery/[id].tsx`
- 변경: `package.json`, `DESIGN_SYSTEM.md`
- 추가: 이 보고서

## 검증 결과

- 새 판정 단위 테스트: **21/21 통과**
- 기존 domain/discovery/news/profile/auth/motion/tokens 테스트: **모두 통과**
- 기존 Edge 테스트: 최초 npm 런타임 다운로드가 sandbox 네트워크 제한으로 실패. 별도 `npm run test:edge` 재실행: **65개 검증 통과**
- `npm run typecheck`: **통과**
- `npx expo export --platform web`: **통과**, `/assessment`를 포함한 26개 정적 경로 출력
- `git diff --check`: **통과**
- 최종 React 검토: shared tokens / MotionPressable 사용, hook 순서, 미상·오류 상태, 라디오 접근성 상태, 프로필 변경 시 이전 결과 무효화 확인
- 브라우저 실제 클릭·모바일 시각 QA와 native 기기 빌드는 이번 작업에서 수행하지 않음
- 의존성·lockfile·DB·클라우드 프로필 schema 변경 없음

## 운영 전 남은 작업

**공식 삼도이동 공고 원문이 없어 현재 UI는 확인 필요 상태를 제공한다.** 금액·배점·기준일을 추정해서 채우지 않았다.
시험용 가상 수치는 단위 테스트에만 존재한다. 원문에서 실제 자격과 우선공급 조건식, 소득 기준표, 배점, 예외, 증빙을 검증하고 실제 공고 ID를 등록해야 실제 신청 가능/점수 판정을 활성화할 수 있다.

세부 규칙 계약, 활성화 순서, Claude UX QA 항목은 `features/applicationAssessment/README.md`에 기록했다.
특히 홈 위계, 미확인 공고 상태 이해, 긴 입력 흐름, 프로필 수정 복귀, 생애최초 무가점 표현, 모바일 키보드·큰 글자·근거 펼침을 확인해야 한다.
