import type { AssessmentFact } from '../../noticePlatform/types.ts';
import type { CopilotMessage, NextBestQuestion, NextBestQuestionInput } from './types.ts';

const criticalPattern = /(재당첨|주택소유|무주택|특별공급.*이력|당첨.*이력|해외체류)/;
const priorityPattern = /(거주기간|지역.*거주|세대주|혼인|자녀|청약통장|가입기간|납입횟수)/;
const scorePattern = /(점수|가점|무주택기간|저축총액|납입횟수|거주기간)/;
const recommendationPattern = /(소득|자산|부모|맞벌이|혼인|자녀|청약통장)/;

type Candidate = AssessmentFact & { noticeIds: Set<string>; supplyTypes: Set<string>; score: number };

const normalizedAlias = (fact: AssessmentFact) => fact.label.toLowerCase().replace(/[\s·/()_-]/g, '').replace(/정확한|현재|여부|확인/g, '');

function dispositionByFact(conversation: readonly CopilotMessage[]): Map<string, CopilotMessage['factDisposition']> {
  const values = new Map<string, CopilotMessage['factDisposition']>();
  for (let index = 0; index < conversation.length; index++) {
    const message = conversation[index];
    if (message.factId && message.factDisposition) values.set(message.factId, message.factDisposition);
    if (message.role !== 'assistant' || !message.factId) continue;
    const reply = conversation.slice(index + 1).find(item => item.role === 'user');
    if (!reply) continue;
    const value = reply.text.replace(/\s+/g, '');
    if (/(잘모르|모르겠|확인해봐야)/.test(value)) values.set(message.factId, 'DOES_NOT_KNOW');
    else if (/(나중에|건너|넘어가|패스)/.test(value)) values.set(message.factId, 'SKIPPED');
    else values.set(message.factId, 'ANSWERED');
  }
  return values;
}

function informationGain(candidate: Omit<Candidate, 'score'>, totalNoticeCount: number): number {
  const label = candidate.label;
  const coverage = candidate.noticeIds.size * 35 + candidate.supplyTypes.size * 14;
  const globalBlocker = candidate.noticeIds.size === totalNoticeCount && criticalPattern.test(label) ? 90 : criticalPattern.test(label) ? 55 : 0;
  const priority = priorityPattern.test(label) ? 30 : 0;
  const officialScore = scorePattern.test(label) ? 20 : 0;
  const recommendation = recommendationPattern.test(label) ? 12 : 0;
  const evidence = candidate.state === 'EVIDENCE_REQUIRED' ? 8 : candidate.state === 'CONDITIONAL' ? 10 : 5;
  return coverage + globalBlocker + priority + officialScore + recommendation + evidence;
}

const priorityLabel = (score: number): NextBestQuestion['priority'] => score >= 150 ? 'CRITICAL' : score >= 100 ? 'HIGH' : score >= 60 ? 'MEDIUM' : 'LOW';

/** Deterministic information-gain ranking. The LLM may explain the choice but cannot replace it. */
export function getNextBestQuestion({ assessments, conversation }: NextBestQuestionInput): NextBestQuestion | null {
  const dispositions = dispositionByFact(conversation);
  const aliases = new Map<string, Candidate>();
  for (const assessment of assessments) for (const fact of assessment.unresolvedFacts) {
    if (fact.state === 'ANSWERED' || fact.state === 'DOES_NOT_KNOW') continue;
    if (dispositions.has(fact.id)) continue;
    const alias = normalizedAlias(fact), current = aliases.get(alias);
    if (current) {
      current.noticeIds.add(assessment.noticeId);
      for (const supply of fact.affectedSupplyTypeIds) current.supplyTypes.add(supply);
      if (fact.state === 'EVIDENCE_REQUIRED') current.state = 'EVIDENCE_REQUIRED';
      continue;
    }
    aliases.set(alias, { ...structuredClone(fact), noticeIds: new Set([assessment.noticeId]), supplyTypes: new Set(fact.affectedSupplyTypeIds), score: 0 });
  }
  const candidates = [...aliases.values()].map(candidate => ({ ...candidate, score: informationGain(candidate, assessments.length) }))
    .sort((a, b) => b.score - a.score || b.noticeIds.size - a.noticeIds.size || a.label.localeCompare(b.label, 'ko'));
  const selected = candidates[0];
  if (!selected) return null;
  return { factId: selected.id, question: selected.question, reason: selected.reason, affectedNoticeIds: [...selected.noticeIds].sort(),
    affectedSupplyTypes: [...selected.supplyTypes].sort(), priority: priorityLabel(selected.score), expectedInformationGain: selected.score,
    evidenceNeeded: selected.evidenceNeeded };
}

export function explainQuestionPriority(question: NextBestQuestion): string {
  const scope = question.affectedNoticeIds.length > 1 ? `${question.affectedNoticeIds.length}개 공고` : question.affectedNoticeIds[0] ?? '현재 공고';
  return `${question.reason} 이 답은 ${scope}의 ${question.affectedSupplyTypes.length}개 공급유형 판정에 영향을 줘서 먼저 확인해요.`;
}
