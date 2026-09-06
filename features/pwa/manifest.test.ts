import { readFileSync } from 'node:fs';

let checks = 0;
const check = (condition: unknown, message: string) => {
  checks += 1;
  if (!condition) throw new Error(`FAIL: ${message}`);
};

const manifest = JSON.parse(readFileSync('public/manifest.webmanifest', 'utf8')) as Record<string, unknown>;
const icons = manifest.icons as Array<{ sizes?: string; src?: string }>;
check(manifest.name === '완판e — 청약 준비', 'PWA name');
check(manifest.short_name === '완판e', 'PWA short name');
check(manifest.start_url === '/', 'production start_url');
check(manifest.display === 'standalone', 'standalone display');
check(icons.some((icon) => icon.sizes === '192x192'), '192 icon contract');
check(icons.some((icon) => icon.sizes === '512x512'), '512 icon contract');
check(readFileSync('app/+html.tsx', 'utf8').includes('manifest.webmanifest'), '모든 route HTML에 manifest 연결');
check(!readFileSync('app/+html.tsx', 'utf8').includes('serviceWorker.register'), 'API stale 위험의 service worker 미등록');

console.log(`features/pwa/manifest: ${checks}개 검증 통과`);
