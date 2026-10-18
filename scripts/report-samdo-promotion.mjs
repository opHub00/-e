import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { validateImportPackage } from '../features/applicationAssessment/server/importPackage.ts';
import { assessApplication } from '../features/applicationAssessment/engine.ts';
import { SAMDO_PERSONAS } from '../features/eventKiosk/samdo/personas.test-data.ts';
import { samdoApplicant } from '../features/applicationAssessment/server/samdoProfiles.test-data.ts';
import { knownField } from '../features/profile/domain.ts';

const files = ['samdo-2026-v1.7.json', 'samdo-2026-v1.8.json'];
const packages = files.map(file => {
  const bytes = readFileSync(new URL(`../data/assessment-rules/${file}`, import.meta.url));
  const raw = JSON.parse(bytes.toString('utf8'));
  return { file, fileSha256: createHash('sha256').update(bytes).digest('hex'), raw, rules: validateImportPackage(raw).rules };
});
const [previous, next] = packages;
const beforeByKey = new Map(previous.raw.rules.map(rule => [rule.ruleKey, rule]));
const afterByKey = new Map(next.raw.rules.map(rule => [rule.ruleKey, rule]));
const parameterKeys = [...new Set([
  ...Object.keys(previous.raw.ruleSet.config.parameters),
  ...Object.keys(next.raw.ruleSet.config.parameters),
])].sort();
const changedParameters = parameterKeys.filter(key =>
  JSON.stringify(previous.raw.ruleSet.config.parameters[key]) !== JSON.stringify(next.raw.ruleSet.config.parameters[key]));
const changedRules = [...new Set([...beforeByKey.keys(), ...afterByKey.keys()])].sort().filter(key =>
  JSON.stringify(beforeByKey.get(key)?.config) !== JSON.stringify(afterByKey.get(key)?.config));
const personaDiff = SAMDO_PERSONAS.flatMap(persona => {
  const old = assessApplication(previous.rules, structuredClone(persona.input));
  const current = assessApplication(next.rules, structuredClone(persona.input));
  return current.flatMap((result, index) => {
    const prior = old[index];
    const compact = value => ({ status: value.status, stage: value.stage, scoring: value.scoring, score: value.score?.total ?? null });
    return JSON.stringify(compact(prior)) === JSON.stringify(compact(result)) ? [] : [{
      persona: persona.id, supplyType: result.supplyType, before: compact(prior), after: compact(result),
    }];
  });
});
const parentAssetBoundary = samdoApplicant('youth');
parentAssetBoundary.details.parentAssets = 1_034_500_000;
const minorHouseholdHead = samdoApplicant('newlywed');
minorHouseholdHead.details.birthDate = '2008-10-28';
minorHouseholdHead.profile.basic.birthDate = knownField('2008-10-28');
minorHouseholdHead.profile.basic.age = 17;
minorHouseholdHead.details.minorHouseholdHeadException = true;
const targetedCases = [
  { id: 'youth-parent-asset-boundary', input: parentAssetBoundary, supplyType: 'youth' },
  { id: 'minor-household-head-exception', input: minorHouseholdHead, supplyType: 'newlywed' },
].map(({ id, input, supplyType }) => ({
  id,
  before: assessApplication(previous.rules, structuredClone(input)).find(row => row.supplyType === supplyType)?.status,
  after: assessApplication(next.rules, structuredClone(input)).find(row => row.supplyType === supplyType)?.status,
}));
const evidenceStats = pkg => ({
  rules: pkg.raw.rules.length,
  withLocator: pkg.raw.rules.filter(rule => rule.evidence?.locator?.sha256 === pkg.raw.document.sha256).length,
  withExcerpt: pkg.raw.rules.filter(rule => Boolean(rule.evidence?.textExcerpt)).length,
});
console.log(JSON.stringify({
  before: { file: previous.file, fileSha256: previous.fileSha256, sourceHash: previous.raw.document.sha256,
    version: previous.raw.ruleSet.version, ...evidenceStats(previous) },
  after: { file: next.file, fileSha256: next.fileSha256, sourceHash: next.raw.document.sha256,
    version: next.raw.ruleSet.version, ...evidenceStats(next) },
  changedParameters: changedParameters.map(key => ({ key, before: previous.raw.ruleSet.config.parameters[key] ?? null,
    after: next.raw.ruleSet.config.parameters[key] ?? null })),
  changedRules: changedRules.map(key => ({ key, before: beforeByKey.get(key)?.config ?? null,
    after: afterByKey.get(key)?.config ?? null })),
  personaDiff,
  targetedCases,
}, null, 2));
