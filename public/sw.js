// Self-destroying service worker.
//
// This app does NOT use a service worker — it's an always-online internal tool
// that must serve fresh data, not a cached offline shell. An earlier deploy,
// however, registered a real SW; browsers that installed it are now stuck
// serving a stale cached app shell forever, because the current build ships no
// SW to update or evict it (the old SW's update check for /sw.js used to get
// HTML back, which browsers reject, so the orphan kept running).
//
// This file exists solely to clean those orphans up: it installs, then on
// activate wipes every cache, unregisters itself, and reloads open tabs so they
// re-fetch the fresh, SW-less assets. Once every affected browser has picked
// this up once, no service worker remains anywhere. Keep it shipped so late
// stragglers still get evicted; served with Cache-Control: no-cache (see
// public/_headers) so update checks always see it.

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Drop every cache this origin holds (old app-shell/asset caches).
      const keys = await caches.keys()
      await Promise.all(keys.map((k) => caches.delete(k)))
      // Remove ourselves so future navigations have no controlling SW at all.
      await self.registration.unregister()
      // Force any open tabs onto the fresh assets.
      const clients = await self.clients.matchAll({ type: 'window' })
      for (const client of clients) {
        client.navigate(client.url)
      }
    })(),
  )
})
