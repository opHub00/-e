import type { AnnouncementRules, Expression } from './types.ts';

function expressionFacts(expression: Expression, out: Set<string>) {
  if ('all' in expression) expression.all.forEach(item => expressionFacts(item, out));
  else if ('any' in expression) expression.any.forEach(item => expressionFacts(item, out));
  else out.add(expression.fact);
}

/** Every fact the rules read, in eligibility, stage conditions and score tables. */
export function factsUsedByRules(rules: AnnouncementRules | undefined): Set<string> {
  const out = new Set<string>();
  for (const supply of rules?.supplies ?? []) {
    supply.eligibility.forEach(rule => expressionFacts(rule.expression, out));
    for (const stage of supply.stages) {
      stage.conditions.forEach(rule => expressionFacts(rule.expression, out));
      stage.scores?.forEach(rule => out.add(rule.fact));
    }
  }
  return out;
}
