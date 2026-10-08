import { strict as assert } from 'node:assert';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { evaluateEvent } from '../evaluate.ts';
import { kioskEvent } from '../kioskEvent.ts';
import { evaluatePhase4Personas } from '../phase4Personas.ts';
import { useKioskStore } from '../useKioskStore.ts';
import { buildInfo, DEMO_PERSONAS, injectPersona, isDemoModeEnabled } from './demoMode.ts';

const load = kioskEvent();
if (!load.ok) throw new Error(load.error);
const event = load.event;

test('Demo Mode is off unless development or the explicit build flag', () => {
  assert.equal(isDemoModeEnabled({}), false);
  assert.equal(isDemoModeEnabled({ EXPO_PUBLIC_EVENT_DEMO_MODE: 'true' }), false, 'only the exact value 1 enables it');
  assert.equal(isDemoModeEnabled({ EXPO_PUBLIC_EVENT_DEMO_MODE: '1' }), true);
  assert.deepEqual(buildInfo({}), { commit: '기록 없음', builtAt: '기록 없음', mode: 'off' });
  assert.equal(buildInfo({ EXPO_PUBLIC_EVENT_DEMO_MODE: '1', EXPO_PUBLIC_BUILD_COMMIT: 'abc1234' }).commit, 'abc1234');
});

test('persona injection replaces the session with answers only and leaves the result to the real engine', () => {
  useKioskStore.getState().toggleFavorite('stale-favorite');
  const before = useKioskStore.getState().sessionKey;
  injectPersona('NEWLYWED_ONE_CHILD', 'withAdaptive');
  const state = useKioskStore.getState();
  assert.equal(state.sessionKey, before + 1, 'went through reset');
  assert.equal(state.evaluation, null, 'no precomputed result is injected');
  assert.deepEqual(state.favorites, []);
  assert.ok(state.answered.every(key => key.startsWith('adaptive.')));

  // 같은 답을 실제 엔진에 넣으면 Phase 4 기준 persona 결과와 같아야 한다.
  const expected = evaluatePhase4Personas(event).find(item => item.personaId === 'NEWLYWED_ONE_CHILD')!;
  const actual = evaluateEvent(event, state.answers);
  const distribution = { COMPLETE: 0, NEEDS_USER_INPUT: 0, INELIGIBLE: 0, UNAVAILABLE: 0 };
  for (const outcome of actual.outcomes) distribution[outcome.status] += 1;
  assert.deepEqual(distribution, expected.after);
  state.reset();
});

test('input-only injection leaves adaptive answers empty so the adaptive screen still appears', () => {
  injectPersona('YOUNG_SINGLE', 'inputs');
  const state = useKioskStore.getState();
  assert.deepEqual(state.answered, []);
  assert.ok(Object.values(state.answers.adaptive).every(value => value === null));
  state.reset();
  assert.ok(DEMO_PERSONAS.length >= 8);
  assert.throws(() => injectPersona('NOPE' as never, 'inputs'), /DEMO_PERSONA_UNKNOWN/);
});

test('step direction: forward, back, and a fresh start never inherits the previous visitor', async () => {
  const { stepDirection } = await import('../motion/stepDirection.ts');
  assert.equal(stepDirection(0), 0);
  assert.equal(stepDirection(1), 1);
  assert.equal(stepDirection(2), 1);
  assert.equal(stepDirection(1), -1);
  assert.equal(stepDirection(0), 0);
});

test('event motion stays on design tokens and respects reduced motion', () => {
  const dir = 'features/eventKiosk/motion';
  const files = readdirSync(dir).filter(name => /\.tsx?$/.test(name));
  const tokens = readFileSync(join(dir, 'eventMotion.ts'), 'utf8');
  assert.ok(/from '\.\.\/\.\.\/\.\.\/design\/motion'/.test(tokens));
  assert.ok(!/duration:\s*\d/.test(tokens), 'no literal durations in event motion tokens');
  for (const name of files) {
    const text = readFileSync(join(dir, name), 'utf8');
    assert.ok(!/delay=\{\s*index\s*\*/.test(text), `${name}: list stagger must go through AppearItem`);
    assert.ok(!/spring|bounce/i.test(text.replace(/bounce 는 쓰지|bounce·scale 튐 없음/g, '')), `${name}: no spring/bounce`);
    if (/Animated\.timing/.test(text)) assert.ok(/useReducedMotion/.test(text), `${name}: animated values must honour reduced motion`);
  }
  const analysis = readFileSync(join(dir, 'AnalysisSteps.tsx'), 'utf8');
  assert.ok(/totalMs \/ steps\.length/.test(analysis), 'analysis steps pace inside the existing minimum time');
});
