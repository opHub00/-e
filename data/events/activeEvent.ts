/**
 * 지금 진행 중인 행사의 데이터.
 *
 * 행사마다 바뀌는 것은 전부 여기 있다: 지역 이름, 화면 문구, 공고 목록, 공고별 분석 규칙.
 * 앱 코드는 이 파일만 읽는다. 다른 지역 행사를 열 때는 이 파일이 가리키는 데이터만 바꾸면 된다.
 *
 * 규칙 패키지는 행사장에서 네트워크가 끊겨도 판정이 되도록 앱에 함께 싣는다.
 */
import config from './jeju-2026.json' with { type: 'json' };
import primaryRulePackage from '../assessment-rules/samdo-2026-v1.7.json' with { type: 'json' };

export const activeEventConfig: unknown = config;

/** 이벤트 설정의 `rulePackage` 키 → 규칙 패키지 원본. */
export const activeEventRulePackages: Record<string, unknown> = {
  primary: primaryRulePackage,
};
