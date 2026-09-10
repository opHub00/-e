const CACHE_VERSION = '2026-09-10-1';
const SHELL_CACHE = `wanpane-shell-v2-${CACHE_VERSION}`;
const OFFLINE_URL = '/offline.html';
const PRECACHE_URLS = [
  OFFLINE_URL,
  '/manifest.webmanifest',
  '/icons/wanpane-192.png',
  '/icons/wanpane-512.png',
  '/icons/wanpane-maskable-512.png',
  '/apple-touch-icon.png',
];
const STATIC_PATH_PREFIXES = ['/_expo/static/', '/assets/', '/icons/'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.addAll(PRECACHE_URLS)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key.startsWith('wanpane-shell-') && key !== SHELL_CACHE)
          .map((key) => caches.delete(key)),
      ))
      .then(() => self.clients.claim()),
  );
});

function isStaticAsset(url) {
  return url.origin === self.location.origin
    && STATIC_PATH_PREFIXES.some((prefix) => url.pathname.startsWith(prefix));
}

async function networkFirst(request) {
  try {
    return await fetch(request);
  } catch {
    return (await caches.match(OFFLINE_URL)) || Response.error();
  }
}

async function cacheFirstStatic(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok && response.type === 'basic') {
    const cache = await caches.open(SHELL_CACHE);
    await cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
    return;
  }

  if (url.origin === self.location.origin && url.pathname === '/manifest.webmanifest') {
    event.respondWith(
      fetch(request).catch(async () => (await caches.match(request)) || Response.error()),
    );
    return;
  }

  if (isStaticAsset(url)) event.respondWith(cacheFirstStatic(request));
});
