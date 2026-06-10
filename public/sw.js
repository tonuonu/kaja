/* Kaja service worker: offline-first app shell.
   - Navigations (the HTML) are network-first: a new deploy is picked up on
     the very next load, which prevents stale app code from meeting a newer
     IndexedDB schema. The cache is the offline fallback.
   - Hashed assets (/assets/) are immutable: cache-first.
   - Everything else same-origin: stale-while-revalidate. */
const CACHE = 'kaja-v2'

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(['./']))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  if (request.mode === 'navigate') {
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        try {
          const fresh = await fetch(request)
          if (fresh.ok) cache.put(request, fresh.clone())
          return fresh
        } catch {
          return (await cache.match(request)) ?? (await cache.match('./')) ?? Response.error()
        }
      }),
    )
    return
  }

  const immutable = url.pathname.includes('/assets/')
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(request)
      if (cached && immutable) return cached
      const refresh = fetch(request)
        .then((response) => {
          if (response.ok) cache.put(request, response.clone())
          return response
        })
        .catch(() => cached)
      return cached ?? refresh
    }),
  )
})
