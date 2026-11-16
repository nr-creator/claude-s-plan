// Service Worker: зберігає файли застосунку на пристрої, щоб він відкривався без інтернету.
// Запити до GitHub API не кешуються ніколи: дані живуть в IndexedDB.
const VERSION = 'plan-v1.3.0';
const FILES = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png',
  'js/app.js', 'js/cal.js', 'js/db.js', 'js/editor.js', 'js/format.js', 'js/github.js', 'js/i18n.js', 'js/icons.js',
  'js/image.js', 'js/ics.js', 'js/math.js', 'js/md.js', 'js/merge.js', 'js/parse.js', 'js/qa.js', 'js/qr.js', 'js/recur.js',
  'js/search.js', 'js/store.js', 'js/sync.js', 'js/theme.js', 'js/transfer.js', 'js/ui.js', 'js/util.js', 'js/zip.js',
  'js/views/appearance.js', 'js/views/calendar.js', 'js/views/entry.js', 'js/views/ics-ui.js', 'js/views/misc.js', 'js/views/notes.js',
  'js/views/settings.js', 'js/views/subject.js', 'js/views/today.js',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' })))));
});
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== VERSION) await caches.delete(k);
    await self.clients.claim();
  })());
});
self.addEventListener('message', e => { if (e.data === 'skip') self.skipWaiting(); });

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  // Сторінка: з кешу, щоб відкривалась миттєво й офлайн
  if (e.request.mode === 'navigate') {
    e.respondWith(caches.match('index.html').then(r => r || fetch(e.request)));
    return;
  }
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(r => r || fetch(e.request).then(res => {
    if (res.ok && res.type === 'basic') { const copy = res.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); }
    return res;
  })));
});

// Натиск на нагадування відкриває застосунок і запис
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const open = e.notification.data && e.notification.data.open;
    if (all.length) { all[0].focus(); if (open) all[0].postMessage({ open }); return; }
    await self.clients.openWindow('./#/today' + (open ? '?open=' + encodeURIComponent(open) : ''));
  })());
});
