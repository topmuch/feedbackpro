// ============================================================
// FeedbackPro - Service Worker (D6 - PWA installable)
// ------------------------------------------------------------
// Stratégie minimale de cache offline :
//   - Au precache : la shell de l'app (/, /manifest.webmanifest, icons).
//   - Au fetch : network-first pour les navigations (HTML) avec repli cache,
//     cache-first pour les assets statiques (js, css, images, fonts).
//   - Les requêtes API (/api/*) et la page de scan (/r/*) passent en
//     network-only (jamais mises en cache : données temps réel / RGPD).
//
// Note technique : placé dans public/ (et non src/app/sw.ts) car un service
// worker DOIT être servi avec le MIME application/javascript et une URL
// stable à la racine — public/sw.js est servi tel quel par Next.js.
// ============================================================

const CACHE_NAME = "feedbackpro-v1"
const PRECACHE_URLS = [
  "/",
  "/manifest.webmanifest",
  "/icon-192.png",
  "/icon-512.png",
  "/logo.svg",
]

// ---------- Install : precache du shell ----------
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS).catch(() => undefined))
      .then(() => self.skipWaiting())
  )
})

// ---------- Activate : nettoyage des anciens caches ----------
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  )
})

// ---------- Fetch : stratégies réseau/cache ----------
self.addEventListener("fetch", (event) => {
  const req = event.request
  // Ignore les requêtes non GET (POST/PATCH/PUT/DELETE ne se cachent pas)
  if (req.method !== "GET") return

  const url = new URL(req.url)
  // Jamais de cache pour : API, WebSockets, page de scan (données RGPD temps réel)
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/r/")) {
    return
  }

  // Navigations (HTML) : network-first avec repli cache (offline-friendly)
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(() => undefined)
          return res
        })
        .catch(() => caches.match(req).then((r) => r || caches.match("/")))
    )
    return
  }

  // Assets statiques (same-origin) : cache-first avec mise à jour en arrière-plan
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then((cached) => {
        const network = fetch(req)
          .then((res) => {
            if (res && res.status === 200 && res.type === "basic") {
              const copy = res.clone()
              caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(() => undefined)
            }
            return res
          })
          .catch(() => cached)
        return cached || network
      })
    )
  }
})
