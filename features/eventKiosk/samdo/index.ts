export { buildSamdoRecommendation, samdoScalarFacts } from './evaluate.ts';
export { buildSamdoQuestionPlan, SAMDO_QUESTION_DEFINITIONS } from './questions.ts';
export { SAMDO_DEEP_RULE_PACKAGE, SAMDO_EVIDENCE } from './rulePackage.ts';
export {
  SAMDO_ELIGIBILITY_LABELS,
  SAMDO_OFFICIAL_SCORE_LABELS,
  SAMDO_STAGE_LABELS,
  SAMDO_SUPPLY_LABELS,
  toSamdoPresentationRecommendation,
} from './presentation.ts';
export type {
  SamdoAssessmentInput,
  SamdoDeepRulePackage,
  SamdoEligibility,
  SamdoOfficialScore,
  SamdoPresentationItem,
  SamdoPresentationRecommendation,
  SamdoQuestion,
  SamdoQuestionPlan,
  SamdoRecommendation,
  SamdoRecommendationItem,
  SamdoStage,
  SamdoSupplyEvaluation,
  SamdoSupplyType,
} from './types.ts';
