// Notifications only. No caching of authenticated data or application bundles.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()))
self.addEventListener('push', event => {
  let data = {}
  try { data = event.data?.json() || {} } catch { /* Always display a fallback. */ }
  event.waitUntil(self.registration.showNotification(String(data.title || '234Cargo').slice(0, 100), {
    body: String(data.body || 'You have an update. Open 234Cargo to view it.').slice(0, 240),
    icon: '/favicon.svg',
    tag: String(data.tag || '234cargo-update'),
    data: { url: '/' },
  }))
})
self.addEventListener('notificationclick', event => {
  event.notification.close()
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const existing = windows.find(client => new URL(client.url).origin === self.location.origin)
    if (existing) return existing.focus()
    return self.clients.openWindow('/')
  })())
})
