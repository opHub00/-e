import type { AnnouncementLiteralExpectations } from '../v4_1/semanticSafety.ts';

/**
 * Benchmark fixture: literal values stated by the Samdo VER1.7 announcement.
 * Used only by the Samdo extraction benchmarks and their tests. These values
 * used to be hard-coded in the v4.1 safety guard; a different announcement
 * supplies its own expectations or none.
 */
export const SAMDO_LITERAL_EXPECTATIONS: AnnouncementLiteralExpectations = {
  exact: {
    'YOUTH.INCOME_LIMIT': { values: [5_338_708], operator: 'lte', scope: 'APPLICANT' },
    'YOUTH.APPLICANT_ASSET_LIMIT': { values: [276_000_000], operator: 'lte', unit: 'KRW', scope: 'APPLICANT' },
    'YOUTH.PARENT_ASSET_LIMIT': { values: [1_034_000_000], operator: 'lte', unit: 'KRW', scope: 'PARENT' },
    'NEWLYWED.ASSET_LIMIT': { values: [362_000_000], operator: 'lte', unit: 'KRW', scope: 'HOUSEHOLD' },
    'FIRST_TIME.ASSET_LIMIT': { values: [362_000_000], operator: 'lte', unit: 'KRW', scope: 'HOUSEHOLD' },
    'COMMON.REGION.RESIDENCE_MIN': { values: [1], operator: 'gte', unit: 'YEAR' },
    'COMMON.REGION.PRIORITY_RATIO': { values: [100], operator: 'eq', unit: 'PERCENT' },
  },
  income: { 'YOUTH.INCOME_LIMIT': [5_338_708] },
};
