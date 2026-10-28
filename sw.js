const CACHE_NAME = 'paycheck-shell-v2';
const SCOPE_URL = new URL(self.registration.scope);
const INDEX_URL = new URL('index.html', SCOPE_URL);
const SHELL = [
  SCOPE_URL.href,
  INDEX_URL.href,
  new URL('manifest.webmanifest', SCOPE_URL).href,
  new URL('paycheck-icon-192.png', SCOPE_URL).href,
  new URL('paycheck-icon-512.png', SCOPE_URL).href,
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(SHELL);
    const page = await fetch(INDEX_URL);
    if (page.ok) {
      const html = await page.clone().text();
      await cache.put(INDEX_URL, page);
      const assets = [...html.matchAll(/(?:src|href)=["']([^"']+\.(?:m?js|css)(?:\?[^"']*)?)["']/g)]
        .map(match => new URL(match[1], INDEX_URL))
        .filter(url => url.origin === SCOPE_URL.origin && url.href.startsWith(SCOPE_URL.href));
      await Promise.all(assets.map(async url => {
        try {
          const response = await fetch(url);
          if (response.ok) await cache.put(url, response);
        } catch {
          // A failed optional bundle should not prevent the app shell from installing.
        }
      }));
    }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const requestUrl = new URL(request.url);
  if (request.method !== 'GET' || requestUrl.origin !== SCOPE_URL.origin) return;

  event.respondWith(fetch(request).then(response => {
    if (response.ok) {
      const copy = response.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
    }
    return response;
  }).catch(async () => {
    const cached = await caches.match(request);
    if (cached) return cached;
    if (request.mode === 'navigate') return caches.match(INDEX_URL);
    return Response.error();
  }));
});
