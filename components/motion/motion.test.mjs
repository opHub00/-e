import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

let checks = 0;
const check = (condition, message) => {
  checks += 1;
  if (!condition) throw new Error(`FAIL: ${message}`);
};
const read = (path) => readFileSync(path, 'utf8');

const motion = read('design/motion.ts');
const pressable = read('components/motion/MotionPressable.tsx');
const appear = read('components/motion/Appear.tsx');
const screenEnter = read('components/motion/ScreenEnter.tsx');
const reduced = read('hooks/useReducedMotion.ts');
const rootLayout = read('app/_layout.tsx');
const tabsLayout = read('app/(tabs)/_layout.tsx');
const map = read('features/discovery/components/DiscoveryMap.web.tsx');
const loader = read('features/discovery/components/kakaoMapsLoader.ts');

check(/pressIn:\s*120/.test(motion) && /pressOut:\s*160/.test(motion), 'press duration token');
check(/pressed:\s*0\.98/.test(motion), 'pressed scale token');
check(/if \(!disabled\) animate\(1\)/.test(pressable), 'disabled press-in does not animate');
check(/if \(!disabled\) animate\(0\)/.test(pressable), 'disabled press-out does not animate');
check(!pressable.includes('setTimeout'), 'onPress is never delayed by motion');
check(/transform:\s*reduced\s*\?\s*\[\]/.test(appear), 'Appear removes travel for reduced motion');
check(/useState\(\(\) =>/.test(reduced), 'web reduced-motion preference is read on first render');
check(rootLayout.includes("animation: reducedMotion ? 'none'"), 'stack transition respects reduced motion');
check(tabsLayout.includes('outputRange: [0.96, 1, 0.96]'), 'tab transition stays subtle');
check(tabsLayout.includes("name=\"discovery\"") && tabsLayout.includes("animation: 'none'"), 'Discovery scene motion is disabled');
check(screenEnter.includes("const WEB = Platform.OS === 'web'"), 'ScreenEnter avoids native stack duplication');
check(!/MotionPressable|Appear|ScreenEnter|Animated/.test(map), 'Kakao map container has no app motion wrapper');
check(!/MotionPressable|Appear|ScreenEnter|Animated/.test(loader), 'Kakao loader has no app motion dependency');

const sourceFiles = [];
for (const root of ['app', 'components', 'features']) {
  const visit = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (path.endsWith('.tsx')) sourceFiles.push(path);
    }
  };
  visit(root);
}

const rawPressableFiles = sourceFiles
  .filter((path) => /<Pressable\b/.test(read(path)))
  .map((path) => relative('.', path).replaceAll('\\', '/'));
const intentionalRawPressables = new Set([
  'app/future.tsx',
  'components/NewsImpactSheet.tsx',
  'features/discovery/components/DiscoveryMapFallback.tsx',
]);
check(
  rawPressableFiles.length === intentionalRawPressables.size &&
    rawPressableFiles.every((path) => intentionalRawPressables.has(path)),
  `unexpected raw Pressable migration gap: ${rawPressableFiles.join(', ')}`,
);

console.log(`components/motion: ${checks} checks passed`);
