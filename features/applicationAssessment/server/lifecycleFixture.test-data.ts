/** Engineering data only. Not Samdo rules and never imported by the application runtime. */
import { createHash } from 'node:crypto';
import type { ImportPackage } from './importPackage.ts';
import { createMinimalApplicantProfile, knownField } from '../../profile/domain.ts';

export const syntheticOriginal = 'SYNTHETIC TEST DOCUMENT. NOT A HOUSING ANNOUNCEMENT.\n';
export function syntheticPackage(): ImportPackage {
  const announcementId = '11111111-1111-4111-8111-111111111111', documentId = '33333333-3333-4333-8333-333333333333';
  const rules: ImportPackage['rules'] = [];
  const condition = (key: string, type: string, stage: string | null, expression: unknown) => {
    rules.push({ ruleKey: key, supplyType: type, stage, category: stage === null ? 'ELIGIBILITY' : 'STAGE', config: { label: `TEST ${key}`, expression, documents: ['TEST ONLY document'] }, evidence: evidence(key) }); return key;
  };
  const evidence = (key: string) => ({ id: `test:${key}`, documentId, source: 'SYNTHETIC TEST DOCUMENT', section: 'Test cases', label: key, tableLabel: 'SYNTHETIC TABLE', pageNumber: null, textExcerpt: null, sourceUrl: null, locator: {} });
  const score = (key: string, type: string, stage: string) => {
    rules.push({ ruleKey: key, supplyType: type, stage, category: 'SCORE', config: { label: 'TEST score', fact: 'age', bands: [{ min: 19, max: 29, points: 1 }, { min: 30, points: 3 }] }, evidence: evidence(key) }); return key;
  };
  const supplies = [
    { type: 'youth', eligibility: [condition('youth.age', 'youth', null, { fact: 'age', op: 'gte', value: 19 })], stages: [
      { stage: 'PRIORITY', conditions: [condition('youth.priority', 'youth', 'PRIORITY', { fact: 'age', op: 'gte', value: 30 })], scores: [score('youth.score', 'youth', 'PRIORITY')] },
      { stage: 'GENERAL', conditions: [], scores: [score('youth.generalScore', 'youth', 'GENERAL')] }] },
    { type: 'newlywed', eligibility: [condition('newlywed.married', 'newlywed', null, { fact: 'maritalStatus', op: 'eq', value: 'married' })],
      stages: [{ stage: 'GENERAL', conditions: [], scores: [score('newlywed.score', 'newlywed', 'GENERAL')] }] },
    { type: 'firstHome', eligibility: [condition('firstHome.deposit', 'firstHome', null, { fact: 'recognizedDepositAmount', op: 'gte', value: { parameter: 'TEST.deposit' } })],
      stages: [{ stage: 'PRIORITY', conditions: [], scores: null }] },
  ];
  return { schemaVersion: 1, announcement: { id: announcementId, source: 'LOCAL_TEST', externalId: 'SYNTHETIC-IMPORT-TEST', housingManagementNumber: null,
    title: '[TEST ONLY] Rule import lifecycle', publisher: 'TEST RUNNER', announcementDate: '2026-09-14', regionCode: null, regionName: 'TEST REGION', sourceUrl: null },
    document: { id: documentId, documentType: 'DRAFT', storagePath: `2026/${announcementId}/${documentId}/original.txt`, fileName: 'synthetic.txt', mimeType: 'text/plain',
      versionLabel: 'TEST-v1', sha256: createHash('sha256').update(syntheticOriginal).digest('hex'), isOfficial: false, sourceUrl: null, publishedAt: null },
    ruleSet: { id: '22222222-2222-4222-8222-222222222222', version: 'SYNTHETIC-1', sourceStatus: 'DRAFT_SOURCE_VERIFIED', effectiveDate: '2026-09-14', config: { parameters: { 'TEST.deposit': 100 }, supplies } }, rules };
}
export function syntheticApplicant() {
  const profile = createMinimalApplicantProfile({ name: 'TEST ONLY', age: 30, currentRegion: '제주특별자치도', preferredRegions: [] });
  profile.family.marriageStatus = knownField('married');
  return { profile, details: { birthDate: '1996-09-14', recognizedDepositAmount: 100 } };
}
