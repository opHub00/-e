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
const entrance = read('components/BrandEntrance.tsx');
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

// 브랜드 인트로는 앱이 열리는 순간에만 돈다. 계약이 조용히 풀리면 사용 흐름을 막는다.
check(
  /pointerEvents="none"/.test(entrance),
  'brand entrance never intercepts touches or navigation',
);
check(
  /accessibilityElementsHidden/.test(entrance) && /no-hide-descendants/.test(entrance),
  'brand entrance stays out of the accessibility tree',
);
check(
  /if \(phase !== 'playing'\) return null/.test(entrance),
  'brand entrance unmounts instead of leaving an invisible overlay',
);
check(
  /const failsafe = setTimeout\(/.test(entrance) && /clearTimeout\(failsafe\)/.test(entrance),
  'brand entrance is torn down by time even if the animation is interrupted',
);
// 문서 표식이 남으면 첫 paint 를 덮은 판이 그대로 화면에 남는다.
check(
  (entrance.match(/clearBrandEntranceCover\(\)/g) ?? []).length >= 4,
  'brand entrance clears the pre-paint cover on every exit path',
);
// 표식은 앱 컨테이너 위에 그려진다. 재생 중에 들고 있으면 로고까지 가린다.
check(
  entrance.indexOf('clearBrandEntranceCover();') < entrance.indexOf('const settle = Animated.sequence'),
  'brand entrance drops the cover as soon as the overlay is on screen',
);
// 하이드레이션이 느려도 총 길이가 상한을 넘지 않게 예산으로 버전을 고른다.
check(
  /chooseBrandEntranceVariant\(/.test(entrance) && /const elapsedMs = brandEntranceElapsedMs\(\);/.test(entrance),
  'brand entrance shortens itself when the cover has already been up',
);
check(
  /transform: minimal\s*\?\s*\[\]/.test(entrance) && /minimal \? null :/.test(entrance),
  'brand entrance drops travel, scale and sweep in its minimal variant',
);
// reduced motion 은 예산과 무관하게 언제나 minimal 로 떨어져야 한다.
{
  const session = read('features/brandEntrance/session.ts');
  check(
    /if \(!input\.reduced && budget >= input\.fullMs\) return 'full';/.test(session),
    'reduced motion never reaches the full brand entrance variant',
  );
}
// 인트로는 데이터를 기다리는 splash 가 아니다. 로딩 상태를 읽으면 안 된다.
check(
  !/useUserStore|useDiscoveryStore|useAuthStore|fetch\(/.test(entrance),
  'brand entrance never waits on app data',
);
// 길이는 800~1200ms 안에 있어야 한다. "열린다"가 아니라 "기다린다"가 되면 실패다.
{
  const total = /const FULL_MS = TIMELINE\.hold \+ TIMELINE\.exit;/.test(entrance);
  const major = Number(motion.match(/major:\s*(\d+)/)?.[1] ?? 0);
  const content = Number(motion.match(/content:\s*(\d+)/)?.[1] ?? 0);
  check(total && major + content >= 800 && major + content <= 1200, 'brand entrance runs 800~1200ms');
}

console.log(`components/motion: ${checks} checks passed`);
