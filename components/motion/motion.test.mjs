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
check(/sheet:\s*24/.test(motion), 'sheet travel token');
// ease-in-out 은 초반이 느려 누른 순간이 늦게 온다. 눌림은 양방향 모두 앞쪽에 몰린 곡선을 쓴다.
check(!/easing\.standard/.test(pressable), 'press feedback never uses the slow-start curve');
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

// 시트 3종(청약찾기 목록·미래 조건·뉴스 브리핑)이 한 제품처럼 뜨려면 이동 거리가 한 곳에서 와야 한다.
const literalSheetTravel = sourceFiles
  .filter((path) => /distance=\{24\}/.test(read(path)))
  .map((path) => relative('.', path).replaceAll('\\', '/'));
check(
  literalSheetTravel.length === 0,
  `sheet travel must come from travel.sheet: ${literalSheetTravel.join(', ')}`,
);

const rawPressableFiles = sourceFiles
  .filter((path) => /<Pressable\b/.test(read(path)))
  .map((path) => relative('.', path).replaceAll('\\', '/'));
const intentionalRawPressables = new Set([
  'app/future.tsx',
  'components/NewsImpactSheet.tsx',
  'components/ProfilePromptSheet.tsx',
  'features/discovery/components/DiscoveryMapFallback.tsx',
]);
check(
  rawPressableFiles.length === intentionalRawPressables.size &&
    rawPressableFiles.every((path) => intentionalRawPressables.has(path)),
  `unexpected raw Pressable migration gap: ${rawPressableFiles.join(', ')}`,
);

// 목록 등장은 AppearItem 이 항목 수를 제한한다.
// map 안에서 Appear 에 index 로 delay 를 직접 계산하면 긴 목록 전체가 계단이 된다.
const manualListStagger = sourceFiles
  .map((path) => relative('.', path).replaceAll('\\', '/'))
  // 계단을 실제로 계산하는 곳은 primitive 하나뿐이어야 한다.
  .filter((path) => path !== 'components/motion/AppearItem.tsx')
  .filter((path) => /delay=\{\s*index\s*\*/.test(read(path)));
check(
  manualListStagger.length === 0,
  `list stagger must go through AppearItem: ${manualListStagger.join(', ')}`,
);

const appearItem = read('components/motion/AppearItem.tsx');
check(
  /index >= listReveal\.count/.test(appearItem),
  'AppearItem caps how many items animate',
);
check(
  /return <>\{children\}<\/>/.test(appearItem),
  'AppearItem renders later items without an Animated.View',
);

// hover 는 포인터 환경 전용이다. 터치에서 상태가 남으면 안 된다.
check(
  /const HOVERABLE = Platform\.OS === 'web'/.test(pressable),
  'hover feedback is web only',
);
check(
  !/scale: hover/.test(pressable),
  'hover never changes scale, only opacity',
);

console.log(`components/motion: ${checks} checks passed`);
