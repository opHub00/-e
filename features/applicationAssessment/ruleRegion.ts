import { normalizeProfileRegion, REGION_DEFINITIONS } from '../discovery/regions.ts';
import type { AnnouncementRules, Expression } from './types.ts';

function residenceValues(expression: Expression, parameters: AnnouncementRules['parameters']): unknown[] {
  if ('all' in expression) return expression.all.flatMap(item => residenceValues(item, parameters));
  if ('any' in expression) return expression.any.flatMap(item => residenceValues(item, parameters));
  if (expression.fact !== 'residence' || expression.op !== 'eq') return [];
  const value = expression.value;
  return [typeof value === 'object' && value !== null && 'parameter' in value ? parameters[value.parameter] : value];
}

/**
 * The residence region an announcement requires, read from its own rules
 * (`residence eq <region>`). Returns null when the rules state none, or state
 * more than one region, so callers ask a neutral question instead of guessing.
 */
export function announcementResidenceRegion(rules: AnnouncementRules | undefined): { profile: string; short: string } | null {
  if (!rules) return null;
  const found = new Set<string>();
  for (const supply of rules.supplies) {
    const conditions = [...supply.eligibility, ...supply.stages.flatMap(stage => stage.conditions)];
    for (const condition of conditions) {
      for (const value of residenceValues(condition.expression, rules.parameters)) {
        const region = typeof value === 'string' ? normalizeProfileRegion(value) : null;
        if (region) found.add(region);
      }
    }
  }
  if (found.size !== 1) return null;
  const profile = [...found][0];
  return { profile, short: REGION_DEFINITIONS.find(region => region.profile === profile)!.discovery };
}
