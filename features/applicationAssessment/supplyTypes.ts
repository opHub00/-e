import type { AnnouncementRules, SupplyType } from './types.ts';

/** Runtime-supported supply categories. Keep this list as the single codec/engine allow-list. */
export const SUPPLY_TYPES = [
  'youth',
  'newlywed',
  'firstHome',
  'student',
  'senior',
  'housingBenefit',
] as const satisfies readonly SupplyType[];

export const SUPPLY_TYPE_SET: ReadonlySet<string> = new Set(SUPPLY_TYPES);

export const SUPPLY_LABELS: Record<SupplyType, string> = {
  youth: '청년 특별공급',
  newlywed: '신혼부부 특별공급',
  firstHome: '생애최초 특별공급',
  student: '대학생',
  senior: '고령자',
  housingBenefit: '주거급여수급자',
};

/** Announcement packages may override presentation wording without creating a new supply enum. */
export function supplyLabelFor(rules: AnnouncementRules | null | undefined, type: SupplyType): string {
  const configured = rules?.parameters[`supplyLabel.${type}`];
  return typeof configured === 'string' && configured.trim() ? configured : SUPPLY_LABELS[type];
}
