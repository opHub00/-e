import district2Import from '../../../data/assessment-rules/samdo-2-2026-v1.8.json' with { type: 'json' };
import { validateImportPackage } from '../../applicationAssessment/server/importPackage.ts';
import type { AnnouncementRules, Evidence } from '../../applicationAssessment/types.ts';
import { SAMDO_DEEP_RULE_PACKAGE } from '../samdo/rulePackage.ts';
import type { SamdoDeepRulePackage, SamdoSupplyType } from '../samdo/types.ts';
import { SAMDO_DISTRICTS } from './config.ts';

const DISTRICT_2_DOCUMENT_ID = '28f88d9e-b4a4-4cf1-97e1-8b1838e81d02';

function shiftedParagraphRange(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  return value.replace(/\d+/g, raw => {
    const number = Number(raw);
    return String(number >= 744 ? number + 1 : number);
  });
}

function district2Evidence(evidence: Evidence): Evidence {
  return {
    ...evidence,
    id: evidence.id.replace('samdo.deep.ev.', 'samdo.deep.d2.ev.'),
    source: SAMDO_DISTRICTS['samdo-2'].document.fileName,
    documentId: DISTRICT_2_DOCUMENT_ID,
    textExcerpt: evidence.textExcerpt?.replaceAll('1지구', '2지구').replaceAll('2026.11.24', '2026.11.25'),
    locator: {
      ...evidence.locator,
      paragraphRange: shiftedParagraphRange(evidence.locator?.paragraphRange),
      sha256: SAMDO_DISTRICTS['samdo-2'].document.sha256,
    },
  };
}

const counts: Record<SamdoSupplyType, number> = {
  YOUTH: 6,
  NEWLYWED: 6,
  FIRST_HOME: 6,
  NEWBORN: 14,
  GENERAL: 8,
  INSTITUTIONAL_RECOMMENDATION: 0,
};

export const SAMDO_DISTRICT2_DEEP_RULE_PACKAGE: SamdoDeepRulePackage = {
  ...structuredClone(SAMDO_DEEP_RULE_PACKAGE),
  id: 'samdo-2-deep-analysis-final-1.8',
  baseRuleSetId: '28f88d9e-b4a4-4cf1-97e1-8b1838e81c02',
  announcementId: '28f88d9e-b4a4-4cf1-97e1-8b1838e81a02',
  listingId: 'samdo-2-2026-final-1.8',
  title: SAMDO_DISTRICTS['samdo-2'].title,
  schedule: SAMDO_DISTRICTS['samdo-2'].schedule,
  document: {
    id: DISTRICT_2_DOCUMENT_ID,
    fileName: SAMDO_DISTRICTS['samdo-2'].document.fileName,
    sha256: SAMDO_DISTRICTS['samdo-2'].document.sha256,
    isOfficial: false,
  },
  inventory: { total: 40, units49: 8, units59: 32, special: 32, general: 8 },
  supplies: SAMDO_DEEP_RULE_PACKAGE.supplies.map(supply => ({
    ...supply,
    supplyCount: counts[supply.supplyType],
    rules: supply.rules.map(rule => ({ ...rule, id: rule.id.replace('samdo.deep.', 'samdo.deep.d2.'), evidence: district2Evidence(rule.evidence) })),
  })),
};

let district2RulesCache: AnnouncementRules | null = null;

export function samdoDistrict2Rules(): AnnouncementRules {
  district2RulesCache ??= validateImportPackage(district2Import).rules;
  return district2RulesCache;
}
