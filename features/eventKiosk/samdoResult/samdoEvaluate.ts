import rulePackage from '../../../data/assessment-rules/samdo-2026-v1.7.json' with { type: 'json' };
import { validateImportPackage } from '../../applicationAssessment/server/importPackage.ts';
import type { AnnouncementRules } from '../../applicationAssessment/types.ts';
import type { KioskAnswers } from '../model.ts';
import { buildSamdoRecommendation, toSamdoPresentationRecommendation, type SamdoPresentationRecommendation } from '../samdo/index.ts';
import { samdoInputFromAnswers } from './samdoInput.ts';

/**
 * 체크인된 규칙 패키지(초안·출처 확인됨)를 그대로 읽어 Codex 판정을 부른다.
 * 자격·순위는 buildSamdoRecommendation 이 정하고, 화면은 toSamdoPresentationRecommendation 결과만 쓴다.
 * 패키지에는 인증 정보가 없다. 검증 함수는 같은 패키지를 DB 에 넣기 전 쓰는 것과 같은 것이다.
 */
let cached: AnnouncementRules | null = null;

export function samdoRules(): AnnouncementRules {
  cached ??= validateImportPackage(rulePackage).rules;
  return cached;
}

export function samdoRecommendationForAnswers(answers: KioskAnswers): SamdoPresentationRecommendation {
  return toSamdoPresentationRecommendation(buildSamdoRecommendation(samdoRules(), samdoInputFromAnswers(answers)));
}
