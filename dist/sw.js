// Push-only service worker: Web Push notifications for therapists
// (confirm / cancel / new llamada — sent by netlify/lib/push.mjs).
//
// ⚠️ NO `fetch` handler — ever. Without one the browser goes straight to the
// network for every navigation and asset, so this SW cannot cache or serve a
// stale app shell (the bug an earlier caching SW caused; its self-destroying
// replacement previously lived at this URL). The activate-time cache wipe stays
// as a safety net for any leftover caches. Served with Cache-Control: no-cache
// (public/_headers) so update checks always see new versions.

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(keys.map((k) => caches.delete(k)))
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    // non-JSON payload — show a generic notification
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Efimeramente', {
      body: data.body || '',
      icon: '/logos/ISOTIPO%20(1).png',
      badge: '/logos/ISOTIPO%20(1).png',
      data: { url: data.url || '/' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/'
  event.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      if (wins.length) {
        wins[0].focus()
        if (wins[0].navigate) wins[0].navigate(url)
        return
      }
      await self.clients.openWindow(url)
    })(),
  )
})
