import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

/**
 * 활성화 gate.
 *
 * 승인 기준은 사람이 검수한 주석(demo-2026-review-annotations.json)에 적혀 있다.
 * 여기서는 그 주석을 기계적으로 읽어 "자격에 영향을 주는 HELD/REJECTED 가 하나라도 있으면
 * 활성화하지 않는다"는 gate 를 고정한다. 숫자를 채우려고 gate 를 낮추지 않기 위해서다.
 */
type Decision = { decision: 'APPROVED' | 'HELD' | 'REJECTED'; critical?: boolean; reason: string };
type Gap = { item: string; impact: string; critical: boolean };
type Entry = { package: string; title: string; ruleSetId: string; decisions: Record<string, Decision>; packageGaps: Gap[] };

const annotations = JSON.parse(readFileSync(new URL('../../../data/assessment-rules/demo-2026-review-annotations.json', import.meta.url), 'utf8')) as { announcements: Entry[] };

const pkg = (name: string) => JSON.parse(readFileSync(new URL(`../../../data/assessment-rules/${name}`, import.meta.url), 'utf8')) as { rules: { ruleKey: string }[]; ruleSet: { id: string } };

export function gateFor(entry: Entry) {
  const decisions = Object.values(entry.decisions);
  const criticalHeld = Object.entries(entry.decisions).filter(([, d]) => d.decision !== 'APPROVED' && d.critical);
  const criticalGaps = entry.packageGaps.filter(gap => gap.critical);
  return {
    total: decisions.length,
    approved: decisions.filter(d => d.decision === 'APPROVED').length,
    held: decisions.filter(d => d.decision === 'HELD').length,
    rejected: decisions.filter(d => d.decision === 'REJECTED').length,
    criticalHeld: criticalHeld.map(([key]) => key),
    criticalGaps: criticalGaps.map(gap => gap.item),
    canActivate: criticalHeld.length === 0 && criticalGaps.length === 0 && decisions.every(d => d.decision !== 'REJECTED'),
  };
}

test('검수 주석이 패키지의 모든 규칙을 빠짐없이 다룬다', () => {
  for (const entry of annotations.announcements) {
    const rules = pkg(entry.package);
    assert.equal(rules.ruleSet.id, entry.ruleSetId, `${entry.package}: rule set id 가 다르다`);
    const keys = rules.rules.map(rule => rule.ruleKey).sort();
    assert.deepEqual(Object.keys(entry.decisions).sort(), keys, `${entry.package}: 검수하지 않은 규칙이 있다`);
  }
});

test('자동 전부 승인이 아니다 — 세 공고 모두 HELD 가 남아 있다', () => {
  for (const entry of annotations.announcements) {
    const gate = gateFor(entry);
    assert.ok(gate.held > 0, `${entry.title}: HELD 가 하나도 없다. 보수적 검수로 보기 어렵다`);
    assert.equal(gate.rejected, 0, `${entry.title}: 원문과 명백히 다른 규칙이 있다면 활성화 대상이 아니다`);
  }
});

test('자격에 영향을 주는 HELD·누락이 있으면 활성화 gate 를 통과하지 못한다', () => {
  const summary = annotations.announcements.map(entry => ({ title: entry.title, ...gateFor(entry) }));
  for (const item of summary) {
    if (item.criticalHeld.length || item.criticalGaps.length) {
      assert.equal(item.canActivate, false, `${item.title}: 치명 항목이 있는데 활성화 가능으로 계산됐다`);
    }
  }
  // 지금 상태: 검암역만 gate 를 통과한다. 민영 두 건은 예치금·소득 대체 기준이 남아 있어 활성화하지 않는다.
  assert.deepEqual(summary.filter(item => item.canActivate).map(item => item.title), ['검암역 푸르지오 프라베뉴 (B-1BL) 공공분양주택']);
  for (const item of summary.filter(i => !i.canActivate)) {
    assert.ok(item.criticalHeld.length + item.criticalGaps.length > 0, `${item.title}: 이유 없이 활성화를 막고 있다`);
  }
});

test('고덕은 이 검수 대상에 들어 있지 않다', () => {
  for (const entry of annotations.announcements) {
    assert.ok(!entry.package.includes('godeok'), '고덕은 재검수 대상이 아니다');
    assert.notEqual(entry.ruleSetId, 'd96c7afc-e10c-43cd-815f-97e401fc318f');
  }
});
