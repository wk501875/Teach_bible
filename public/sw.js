// 공과강사 서비스 워커: 공과 알림 표시와 "확인했어요" 처리
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data?.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || '공과강사', {
    body: d.body || '',
    tag: d.date ? `lesson-${d.date}` : 'teach-bible',
    renotify: true,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: d,
    actions: d.date ? [{ action: 'ack', title: '확인했어요' }] : [],
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const d = e.notification.data || {};
  if (e.action === 'ack' && d.teacher && d.date) {
    e.waitUntil(fetch('/api/ack', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ teacher: d.teacher, date: d.date }) }));
    return;
  }
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(ws => {
    const w = ws.find(x => 'focus' in x);
    return w ? w.focus() : self.clients.openWindow(d.url || '/');
  }));
});
