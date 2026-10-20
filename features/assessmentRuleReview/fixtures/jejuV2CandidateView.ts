/** Admin-only, read-only presentation of the unregistered Jeju v2 review candidate. */
import { readFileSync } from 'node:fs';
import { prepareJejuHappyV2Candidate } from './jejuHappyCandidate.ts';
import { createRuleReviewWorkspace, canActivateRuleVersion } from '../server/service.ts';
import { SCOPE_TEXT } from '../ui/ruleFields.ts';
import type { JejuV2CandidateView } from '../../adminConsole/reviewCandidateContract.ts';

const file = (suffix: string): unknown => JSON.parse(readFileSync(
  new URL(`../../../data/assessment-rules/lh-jeju-ildo-samdo-happy-20260918.v2.${suffix}.json`, import.meta.url), 'utf8'));

type Locator = Record<string, unknown>;
type Change = { ruleId: string; supplyType: string; v1Condition: unknown; v2Condition: unknown;
  v1Scope: string; v2Scope: string; v1Locator: Locator; v2Locator: Locator; changeReason: string;
  userImpact: string; adminReviewPoint: string };
type Warning = { id: string; ruleId: string; supplyType: string; message: string; classification: string;
  assessmentImpactPossible: boolean; evidenceImpactPossible: boolean; adminDecisionRequired: boolean; recommendedAction: string };
type Parameter = { parameterId: string; supplyType: string; v1Value: unknown; v2CandidateValue: unknown;
  effectiveV2ScopeMode: string | null; source: { page: number; section: string; locator: string; sourceWording: string };
  decision: string; reviewerAction: string };
type Boundary = { id: string; persona: string; v1Result: string; v2Result: string; sourceLocator: string; reason: string };
type Manifest = { status: 'REVIEW_CANDIDATE'; approved: false; active: false;
  source: { url: string; pdfUrl: string; sha256: string };
  ruleSet: { id: string; version: string; previousVersion: string; ruleCount: number; supplyTypes: string[] };
  warnings: Warning[]; manualParameters: Parameter[]; semanticChanges: Change[]; boundaryComparisons: Boundary[];
  unresolved: { unresolvedId: string; type: string; description: string; ruleKeys: string[];
    decision: 'UNRESOLVED_BLOCKER'; causes: string[]; nextAction: string } };
type Diff = { documentSha256: string; changedRuleIds: string[]; changes: Array<{ ruleKey: string }>;
  parameterChanges: Array<{ key: string; oldValue: unknown; newValue: unknown }> };

export function buildJejuV2CandidateView(): JejuV2CandidateView {
  const { adapter, reviewSeed, metadata } = prepareJejuHappyV2Candidate();
  const manifest = metadata as Manifest;
  const diff = file('review-diff') as Diff;
  const workspace = createRuleReviewWorkspace(reviewSeed);
  const gate = canActivateRuleVersion(workspace);
  const changed = new Set(diff.changedRuleIds);
  const rules = workspace.rules.map(rule => ({
    id: rule.ruleId, label: rule.originalCandidate.label, supplyType: rule.originalCandidate.supplyType,
    category: rule.originalCandidate.category, scope: rule.originalCandidate.scope,
    scopeLabel: SCOPE_TEXT[rule.originalCandidate.scope ?? ''] ?? '적용 대상 검수 필요',
    evidence: rule.originalCandidate.evidence.map(item => ({ section: item.section, excerpt: item.textExcerpt,
      locator: item.locator })), changed: changed.has(rule.ruleId), status: rule.reviewStatus,
  }));
  const notInSource = manifest.manualParameters.filter((item): item is Parameter & { v2CandidateValue: null } =>
    item.decision === 'NOT_IN_SOURCE' && item.v2CandidateValue === null).map(item => ({
    ...item, displayValue: '원문에 수치 없음 · NOT_IN_SOURCE · 관리자 결정 필요' as const,
  }));
  const blockerRules = rules.filter(rule => manifest.unresolved.ruleKeys.includes(rule.id));
  const blocker = { ...manifest.unresolved,
    affectedSupplyTypes: [...new Set(blockerRules.map(rule => rule.supplyType))],
    locators: blockerRules.flatMap(rule => rule.evidence.map(item => ({ ruleId: rule.id, section: item.section, locator: item.locator }))),
    assessmentImpact: '해당 범위·빈 표 셀은 확정 판정으로 보정하지 않고 확인 필요로 유지합니다.',
    resolutionOptions: ['RESOLVED_WITH_SOURCE', 'RESOLVED_WITH_SCOPE_DECISION', 'REJECT_RULE', 'KEEP_BLOCKED'] as const,
  };
  const warnings = manifest.warnings.map(item => ({ ...item, reviewStatus: 'PENDING_REVIEW' as const,
    severity: item.classification === 'BLOCKER' ? 'BLOCKER' as const
      : item.classification === 'SAFE_WARNING' ? 'INFO' as const : 'REVIEW_REQUIRED' as const,
    reviewerNote: null as null,
    evidence: rules.find(rule => rule.id === item.ruleId)?.evidence ?? [],
  }));
  const warningCounts = Object.fromEntries([...new Set(manifest.warnings.map(item => item.classification))]
    .map(classification => [classification, manifest.warnings.filter(item => item.classification === classification).length]));
  if (manifest.source.sha256 !== diff.documentSha256 || manifest.source.sha256 !== adapter.notice.sourceDocument.sha256 ||
    manifest.ruleSet.id !== workspace.ruleVersionId || manifest.ruleSet.ruleCount !== rules.length ||
    diff.changedRuleIds.length !== 18 || diff.changes.length !== 18 || manifest.semanticChanges.length !== 18 ||
    manifest.warnings.length !== 22 || notInSource.length !== 5 || gate.canActivate || gate.unresolvedCount !== 1 ||
    diff.parameterChanges.filter(item => item.newValue === null).length !== 5 ||
    manifest.semanticChanges.some(item => !changed.has(item.ruleId)) ||
    diff.changes.some(item => !changed.has(item.ruleKey))) throw new Error('JEJU_V2_REVIEW_VIEW_INTEGRITY_FAILED');
  return {
    status: manifest.status, publicationStatus: 'INACTIVE' as const, registrationStatus: 'NOT_REGISTERED' as const,
    title: adapter.notice.title, noticeFamily: adapter.notice.managementNumber,
    version: manifest.ruleSet.version, previousVersion: manifest.ruleSet.previousVersion,
    ruleSetId: manifest.ruleSet.id, source: manifest.source, sourceVerification: reviewSeed.sourceStatus,
    approved: false as const, active: false as const, ruleCount: rules.length, changedRuleCount: changed.size,
    warningCount: manifest.warnings.length, warningCounts, blockerCount: gate.unresolvedCount,
    supplyTypes: manifest.ruleSet.supplyTypes, rules, changes: manifest.semanticChanges,
    parameterChanges: diff.parameterChanges, notInSource, warnings,
    blocker, boundaryComparisons: manifest.boundaryComparisons,
    reviewActions: { available: false as const, reason: 'Staging에 검수 workspace가 등록되기 전에는 결정을 저장할 수 없습니다.',
      options: ['ADD_NOTE', 'MARK_REVIEWED', 'RESOLVE_WARNING', 'RESOLVE_BLOCKER', 'REJECT_CANDIDATE', 'START_REVIEW'] as const },
    activation: { allowed: false as const, reason: '미해결 blocker와 미승인 Rule Package로 승인·활성화가 차단됩니다.' },
  };
}
