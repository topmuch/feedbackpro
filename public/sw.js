// ============================================================
// FeedbackPro - Service Worker (Phase 2 — Mode Offline étendu)
// ------------------------------------------------------------
// Stratégies de cache hybrides :
//   1. POST /api/public/retour (offline) → IndexedDB + Background Sync
//   1b. POST /api/airport/report (offline) → IndexedDB + Background Sync
//   2. Cache-first (TTL 1h) pour /api/zone/[qrToken] (configs restaurant)
//   2b. Network-first (repli cache) pour /api/airport/zone/* (configs aéroport)
//   3. Network-first pour la page de scan /r/[qrToken]
//   4. Stale-while-revalidate pour les assets same-origin
//
// Fichier PLAIN JAVASCRIPT (aucune annotation TypeScript — un SW est
// servi tel quel par Next.js sans compilation).
// ============================================================

// CACHE_NAME bumpé v2 → v3 (feedbackpro-airport-v3) pour forcer le
// refresh du shell suite à l'ajout des routes aéroport offline (Task 3 Phase 2).
const CACHE_NAME = "feedbackpro-airport-v3"
const CACHE_API = "feedbackpro-api-v2"
// Cache dédié aux réponses GET /api/airport/zone/* (network-first, pas de
// TTL : on veut toujours la version réseau si disponible, le cache n'est
// qu'un repli offline). Séparé de CACHE_API pour ne pas mélanger avec les
// réponses TTL-marquées de /api/zone/[qrToken].
const CACHE_AIRPORT_API = "feedbackpro-airport-api-v3"
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
          keys
            .filter((k) => k !== CACHE_NAME && k !== CACHE_API && k !== CACHE_AIRPORT_API)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  )
})

// ---------- Helper : expiration du cache API (1h) ----------
const API_CACHE_TTL_MS = 60 * 60 * 1000 // 1 heure

async function apiCacheValide(cle) {
  const cache = await caches.open(CACHE_API)
  const cached = await cache.match(cle)
  if (!cached) return null
  // Stocke le timestamp dans un header personnalisé (cache.put ne permet
  // pas de metadata native ; on utilise une Response clonée avec header).
  const tsHeader = cached.headers.get("x-fp-cache-ts")
  if (!tsHeader) return cached // pas de timestamp → on sert (best-effort)
  const age = Date.now() - parseInt(tsHeader, 10)
  if (Number.isNaN(age) || age > API_CACHE_TTL_MS) return null // expiré
  return cached
}

async function mettreEnCacheApi(cle, res) {
  try {
    const cache = await caches.open(CACHE_API)
    // Cloner la réponse et injecter le timestamp de mise en cache
    const copie = new Response(res.body, {
      status: res.status,
      statusText: res.statusText,
      headers: {
        ...Object.fromEntries(res.headers.entries()),
        "x-fp-cache-ts": String(Date.now()),
      },
    })
    await cache.put(cle, copie)
  } catch {
    /* silencieux : le cache est best-effort */
  }
}

// ---------- Helper : enregistre un tag Background Sync si l'API est dispo ----------
function registerSyncTag(tag) {
  try {
    if ("serviceWorker" in self && "sync" in self.registration) {
      return self.registration.sync.register(tag).catch(() => undefined)
    }
  } catch {
    /* sync non supporté : le client tentera forceSync() au retour réseau */
  }
  return Promise.resolve()
}

// ---------- Fetch : stratégies réseau/cache ----------
self.addEventListener("fetch", (event) => {
  const req = event.request
  const url = new URL(req.url)

  // 1) POST /api/public/retour — Background Sync API (offline)
  // On intercepte UNIQUEMENT les échecs réseau : si la requête réussit,
  // on laisse passer ; si elle échoue (offline), on stocke dans IndexedDB
  // et on enregistre un sync pour rejouer plus tard.
  if (req.method === "POST" && url.pathname === "/api/public/retour") {
    event.respondWith(
      (async () => {
        try {
          const reponse = await fetch(req.clone())
          if (!reponse.ok) throw new Error(`HTTP ${reponse.status}`)
          return reponse
        } catch (_e) {
          // Stocke le payload dans IndexedDB et planifie un background sync
          try {
            const corps = await req.clone().text()
            await stockerRetourOffline(corps)
            await registerSyncTag("fp-retour-sync")
            // Réponse simulée pour que le client affiche l'écran "hors ligne"
            return new Response(
              JSON.stringify({
                ok: true,
                offline: true,
                message: "Retour enregistré hors ligne — sera envoyé à la reconnexion",
              }),
              {
                status: 200,
                headers: { "Content-Type": "application/json" },
              }
            )
          } catch (e) {
            return new Response(
              JSON.stringify({ ok: false, error: "Impossible d'enregistrer le retour hors ligne" }),
              { status: 500, headers: { "Content-Type": "application/json" } }
            )
          }
        }
      })()
    )
    return
  }

  // 1b) POST /api/airport/report — Background Sync API (signalements aéroport)
  // Même mécanisme que /api/public/retour mais pour les signalements aéroport :
  // on intercepte UNIQUEMENT les échecs réseau (throw) ou 5xx serveur. Les
  // 4xx (payload invalide) ne sont PAS mis en file — un retry ne résoudra rien.
  // Sur échec, on stocke le corps dans IndexedDB (store airport-pending-reports)
  // et on enregistre un sync 'sync-airport-report' pour rejouer à la reconnexion.
  if (req.method === "POST" && url.pathname === "/api/airport/report") {
    event.respondWith(
      (async () => {
        try {
          const reponse = await fetch(req.clone())
          // 5xx → on le traite comme un échec retryable (throw → catch)
          if (!reponse.ok && reponse.status >= 500) {
            throw new Error(`HTTP ${reponse.status}`)
          }
          return reponse
        } catch (_e) {
          try {
            const corps = await req.clone().text()
            await stockerRapportAirportOffline(corps)
            await registerSyncTag("sync-airport-report")
            // Réponse simulée pour que la PWA affiche l'écran « hors ligne »
            return new Response(
              JSON.stringify({
                ok: true,
                offline: true,
                message: "Signalement en file d'attente — sera envoyé au retour du réseau",
              }),
              {
                status: 200,
                headers: { "Content-Type": "application/json" },
              }
            )
          } catch (e) {
            return new Response(
              JSON.stringify({ ok: false, error: "Impossible d'enregistrer le signalement hors ligne" }),
              { status: 500, headers: { "Content-Type": "application/json" } }
            )
          }
        }
      })()
    )
    return
  }

  // Les autres requêtes non-GET ne se cachent pas
  if (req.method !== "GET") return

  // 2) Cache-first (expiration 1h) pour /api/zone/[qrToken]
  if (url.pathname.startsWith("/api/zone/")) {
    event.respondWith(
      (async () => {
        const cached = await apiCacheValide(req)
        if (cached) return cached
        try {
          const res = await fetch(req)
          if (res && res.status === 200) {
            await mettreEnCacheApi(req, res.clone())
          }
          return res
        } catch {
          // Fallback : sert la version cache même expirée si pas de réseau
          const cache = await caches.open(CACHE_API)
          const fallback = await cache.match(req)
          return (
            fallback ??
            new Response("Offline", { status: 503, statusText: "Offline" })
          )
        }
      })()
    )
    return
  }

  // 2b) Network-first (repli cache offline) pour /api/airport/zone/*
  // La PWA aéroport doit pouvoir s'ouvrir sans réseau : on tente le réseau
  // d'abord, on met en cache la réponse 200, et on sert le cache si le réseau
  // est injoignable. Pas de TTL : on préfère toujours la version réseau.
  if (url.pathname.startsWith("/api/airport/zone/")) {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req)
          if (res && res.status === 200) {
            const copie = res.clone()
            ;(await caches.open(CACHE_AIRPORT_API)).put(req, copie).catch(() => undefined)
          }
          return res
        } catch {
          const cache = await caches.open(CACHE_AIRPORT_API)
          const fallback = await cache.match(req)
          return (
            fallback ??
            new Response("Offline", { status: 503, statusText: "Offline" })
          )
        }
      })()
    )
    return
  }

  // 3) Network-first pour la page de scan /r/[qrToken]
  if (url.pathname.startsWith("/r/")) {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req)
          const copy = res.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(() => undefined)
          return res
        } catch {
          const cached = await caches.match(req)
          if (cached) return cached
          return caches.match("/")
        }
      })()
    )
    return
  }

  // 4) Stale-while-revalidate pour les assets statiques same-origin
  if (url.origin === self.location.origin) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(req)
        const networkPromise = fetch(req)
          .then((res) => {
            if (res && res.status === 200 && res.type === "basic") {
              const copy = res.clone()
              caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(() => undefined)
            }
            return res
          })
          .catch(() => null)
        // Sert le cache immédiatement s'il existe, sinon attend le réseau
        return cached ?? (await networkPromise) ?? new Response("Offline", { status: 503 })
      })()
    )
    return
  }
})

// ============================================================
// IndexedDB — Stockage de la queue des retours offline (restaurant)
// ============================================================
const DB_NAME = "fp-offline"
const DB_STORE = "retours"
const DB_VERSION = 1

function ouvrirDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(DB_STORE)) {
        db.createObjectStore(DB_STORE, { keyPath: "id", autoIncrement: true })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function stockerRetourOffline(corps) {
  const db = await ouvrirDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, "readwrite")
    const store = tx.objectStore(DB_STORE)
    store.add({ corps, ts: Date.now() })
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function lireRetoursOffline() {
  const db = await ouvrirDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, "readonly")
    const store = tx.objectStore(DB_STORE)
    const req = store.getAll()
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function supprimerRetourOffline(id) {
  const db = await ouvrirDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, "readwrite")
    const store = tx.objectStore(DB_STORE)
    store.delete(id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

// ---------- Background Sync : rejoue les retours offline ----------
self.addEventListener("sync", (event) => {
  if (event.tag === "fp-retour-sync") {
    event.waitUntil(rejouerRetoursOffline())
  } else if (event.tag === "sync-airport-report") {
    event.waitUntil(rejouerRapportsAirportOffline())
  }
})

async function rejouerRetoursOffline() {
  const retours = await lireRetoursOffline()
  for (const r of retours) {
    try {
      const res = await fetch("/api/public/retour", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: r.corps,
      })
      if (res.ok) {
        await supprimerRetourOffline(r.id)
      }
    } catch {
      // Toujours offline : on garde en file, on réessaiera au prochain sync
      break
    }
  }
}

// ---------- Message du client : rejoue aussi (fallback si Background Sync indispo) ----------
self.addEventListener("message", (event) => {
  if (event.data === "fp-replay-offline") {
    event.waitUntil(rejouerRetoursOffline())
  } else if (event.data === "airport-replay-offline") {
    event.waitUntil(rejouerRapportsAirportOffline())
  }
})

// ============================================================
// AIRPORT — IndexedDB pour la queue des signalements offline
// (Task 3 Phase 2 — PWA aéroport hors ligne)
// ============================================================
// DB dédiée (feedbackpro-airport) séparée de la DB restaurant (fp-offline).
// Store : airport-pending-reports, keyPath 'id', autoIncrement.
// Lue/écrite à la fois par le SW (replay background sync) ET par le hook
// client useAirportOffline (compteur pour le banner + forceSync fallback).
const AIRPORT_DB_NAME = "feedbackpro-airport"
const AIRPORT_DB_STORE = "airport-pending-reports"
const AIRPORT_DB_VERSION = 1

function ouvrirDbAirport() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(AIRPORT_DB_NAME, AIRPORT_DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(AIRPORT_DB_STORE)) {
        db.createObjectStore(AIRPORT_DB_STORE, { keyPath: "id", autoIncrement: true })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function stockerRapportAirportOffline(corps) {
  const db = await ouvrirDbAirport()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(AIRPORT_DB_STORE, "readwrite")
    const store = tx.objectStore(AIRPORT_DB_STORE)
    store.add({ corps, ts: Date.now() })
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function lireRapportsAirportOffline() {
  const db = await ouvrirDbAirport()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(AIRPORT_DB_STORE, "readonly")
    const store = tx.objectStore(AIRPORT_DB_STORE)
    const req = store.getAll()
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function supprimerRapportAirportOffline(id) {
  const db = await ouvrirDbAirport()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(AIRPORT_DB_STORE, "readwrite")
    const store = tx.objectStore(AIRPORT_DB_STORE)
    store.delete(id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function rejouerRapportsAirportOffline() {
  const rapports = await lireRapportsAirportOffline()
  for (const r of rapports) {
    try {
      const res = await fetch("/api/airport/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: r.corps,
      })
      if (res.ok) {
        await supprimerRapportAirportOffline(r.id)
      } else if (res.status >= 400 && res.status < 500) {
        // 4xx : payload invalide (tag inconnu, problématique non reconnue…).
        // Un retry ne résoudra rien — on supprime pour éviter une file bloquante.
        await supprimerRapportAirportOffline(r.id)
      }
      // 5xx : on garde en file, on réessaiera au prochain sync.
    } catch {
      // Toujours offline : on garde en file, on réessaiera au prochain sync.
      break
    }
  }
  // Notifie les clients que la file a changé (rafraîchit le banner offline).
  await notifieClientsAirportPendingChanged()
}

// Notifie tous les clients contrôlés que la file d'attente aéroport a changé
// (pour rafraîchir le compteur du banner useAirportOffline).
async function notifieClientsAirportPendingChanged() {
  try {
    const clients = await self.clients.matchAll({ includeUncontrolled: true, type: "window" })
    for (const c of clients) {
      c.postMessage({ type: "airport-pending-changed" })
    }
  } catch {
    /* silencieux */
  }
}
