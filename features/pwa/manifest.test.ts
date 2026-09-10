import { readFileSync } from 'node:fs';
import { detectPwaInstallPlatform, isIosSafari, isStandaloneDisplay } from './platform.ts';

let checks = 0;
const check = (condition: unknown, message: string) => {
  checks += 1;
  if (!condition) throw new Error(`FAIL: ${message}`);
};

const manifest = JSON.parse(readFileSync('public/manifest.webmanifest', 'utf8')) as Record<string, unknown>;
const icons = manifest.icons as Array<{ sizes?: string; src?: string; type?: string; purpose?: string }>;
const html = readFileSync('app/+html.tsx', 'utf8');
const serviceWorker = readFileSync('public/service-worker.js', 'utf8');
const registration = readFileSync('public/pwa-register.js', 'utf8');
const offline = readFileSync('public/offline.html', 'utf8');

check(manifest.name === '완판e', 'PWA name');
check(manifest.short_name === '완판e', 'PWA short name');
check(manifest.start_url === '/', 'production start_url');
check(manifest.scope === '/', 'production scope');
check(manifest.display === 'standalone', 'standalone display');
check(manifest.background_color === '#FCF8FF', 'background color');
check(manifest.theme_color === '#4F3AA8', 'theme color');
check(icons.some((icon) => icon.sizes === '192x192' && icon.type === 'image/png'), '192 PNG icon contract');
check(icons.some((icon) => icon.sizes === '512x512' && icon.type === 'image/png' && icon.purpose === 'any'), '512 PNG icon contract');
check(icons.some((icon) => icon.sizes === '512x512' && icon.purpose === 'maskable'), 'maskable icon contract');
check(html.includes('manifest.webmanifest'), '모든 route HTML에 manifest 연결');
check(html.includes('apple-touch-icon.png'), 'Apple touch icon 연결');
check(html.includes('apple-mobile-web-app-capable'), 'Apple standalone metadata');
check(html.includes('apple-mobile-web-app-status-bar-style'), 'Apple status bar metadata');
check(html.includes('/pwa-register.js'), 'PWA registration script 연결');
check(registration.includes("serviceWorker.register('/service-worker.js'"), 'service worker 등록');
check(registration.includes("updateViaCache: 'none'"), 'service worker script cache 우회');
check(serviceWorker.includes("const OFFLINE_URL = '/offline.html'"), 'offline fallback precache');
check(serviceWorker.includes("request.mode === 'navigate'"), 'navigation network-first 처리');
check(serviceWorker.includes("STATIC_PATH_PREFIXES = ['/_expo/static/', '/assets/', '/icons/']"), '정적 asset allowlist');
check(!serviceWorker.includes('skipWaiting'), '열린 화면을 강제 교체하지 않음');
check(serviceWorker.includes("key.startsWith('wanpane-shell-')"), '과거 version cache cleanup');
check(!serviceWorker.includes('/functions/v1/'), 'Supabase/API 응답 cache 금지');
check(!serviceWorker.includes('kakao.com'), 'Kakao 요청 cache 금지');
check(offline.includes('인터넷 연결을 확인해 주세요'), 'offline 안내 제목');
check(offline.includes('청약 공고와 AI 기능은'), 'offline network requirement 안내');
check(offline.includes('location.reload()'), 'offline 다시 시도');

check(isStandaloneDisplay({ displayModeStandalone: true, navigatorStandalone: false }), 'display-mode standalone 감지');
check(isStandaloneDisplay({ displayModeStandalone: false, navigatorStandalone: true }), 'iOS standalone 감지');
check(isIosSafari({ userAgent: 'Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 Version/17.0 Mobile Safari/604.1' }), 'iOS Safari 감지');
check(!isIosSafari({ userAgent: 'Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 CriOS/120 Mobile Safari/604.1' }), 'iOS Chrome을 Safari 안내에서 제외');
check(detectPwaInstallPlatform({ standalone: false, hasNativePrompt: true, userAgent: 'Chrome' }) === 'native', 'native install prompt 우선');
check(detectPwaInstallPlatform({ standalone: true, hasNativePrompt: true, userAgent: 'Chrome' }) === 'standalone', '설치 후 CTA 숨김');

console.log(`features/pwa/manifest: ${checks}개 검증 통과`);
