// فريقنا: حفظ واجهة الموقع فقط. بيانات الحسابات تبقى في Appwrite.
const CACHE_NAME = 'fariqna-shell-v2';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(names => Promise.all(names.filter(n => n.startsWith('fariqna-shell-') && n !== CACHE_NAME).map(n => caches.delete(n)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // لا نُخزّن طلبات Appwrite أو CDN
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).then(response => response.ok ? response : Promise.reject(new Error('network')))
      .catch(() => caches.match('./index.html')));
    return;
  }
  event.respondWith(caches.match(req).then(hit => hit || fetch(req)));
});
