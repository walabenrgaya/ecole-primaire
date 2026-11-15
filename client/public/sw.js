/* Service worker EduPilot : application installable (PWA) + notifications push */
const CACHE = 'edupilot-v2';
const SHELL = ['/', '/manifest.json', '/icon.svg'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // Jamais de cache pour l'API ni les fichiers déposés (données personnelles)
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api') || url.pathname.startsWith('/uploads')) return;
  if (e.request.mode === 'navigate') {
    e.respondWith(fetch(e.request).catch(() => caches.match('/')));
    return;
  }
  if (url.pathname.startsWith('/assets/')) {
    e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
      return res;
    })));
  }
});

self.addEventListener('push', e => {
  let data = {};
  try { data = e.data.json(); } catch { data = { titre: 'EduPilot', message: e.data?.text() }; }
  e.waitUntil(self.registration.showNotification(data.titre || 'EduPilot', {
    body: data.message || '',
    icon: '/icon.svg',
    badge: '/icon.svg',
    data: { lien: data.lien || '/' }
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const lien = e.notification.data?.lien || '/';
  e.waitUntil(self.clients.matchAll({ type: 'window' }).then(list => {
    const w = list.find(c => c.url.startsWith(self.location.origin));
    if (w) { w.navigate(lien); return w.focus(); }
    return self.clients.openWindow(lien);
  }));
});
