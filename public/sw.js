// ============================================================
// FeedbackPro - Service Worker avancé (Task M3 — Mode Offline)
// ------------------------------------------------------------
// Stratégies de cache hybrides :
//   1. Network-first pour la page de scan /r/[qrToken] (avec repli cache) :
//      on veut la dernière version si possible, mais on garde le cache
//      offline pour qu'un client sans connexion puisse quand même
//      remplir le formulaire.
//   2. Stale-while-revalidate pour les assets CSS/JS critiques : on
//      sert immédiatement depuis le cache, puis on met à jour en
//      arrière-plan pour la prochaine visite.
//   3. Cache-first (expiration 1h) pour /api/zone/[qrToken] : ces
//      configs de zones changent rarement (emoji, tags proposés…) ;
//      on évite une requête réseau systématique au client.
//   4. Background Sync API : si POST /api/public/retour échoue
//      (offline), on stocke le payload dans IndexedDB et on rejoue
//      la requête à la reconnexion (event 'sync').
//
// NOTE : un service worker DOIT être servi avec le MIME
// application/javascript et une URL stable à la racine — placé dans
// public/ il est servi tel quel par Next.js.
// ============================================================

const CACHE_NAME = "feedbackpro-v2"
const CACHE_API = "feedbackpro-api-v2"
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
            .filter((k) => k !== CACHE_NAME && k !== CACHE_API)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  )
})

// ---------- Helper : expiration du cache API (1h) ----------
const API_CACHE_TTL_MS = 60 * 60 * 1000 // 1 heure
async function apiCacheValide(cle: Request): Promise<Response | null> {
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

async function mettreEnCacheApi(cle: Request, res: Response) {
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
            if ("sync" in self && "register" in (self as unknown as { sync: { register: (t: string) => Promise<void> } }).sync) {
              try {
                await (self as unknown as { sync: { register: (t: string) => Promise<void> } }).sync.register("fp-retour-sync")
              } catch {
                /* sync non supporté : on tentera au prochain fetch */
              }
            }
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
// IndexedDB — Stockage de la queue des retours offline
// ============================================================
const DB_NAME = "fp-offline"
const DB_STORE = "retours"
const DB_VERSION = 1

function ouvrirDb(): Promise<IDBDatabase> {
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

async function stockerRetourOffline(corps: string): Promise<void> {
  const db = await ouvrirDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, "readwrite")
    const store = tx.objectStore(DB_STORE)
    store.add({ corps, ts: Date.now() })
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function lireRetoursOffline(): Promise<Array<{ id: number; corps: string; ts: number }>> {
  const db = await ouvrirDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, "readonly")
    const store = tx.objectStore(DB_STORE)
    const req = store.getAll()
    req.onsuccess = () => resolve(req.result as Array<{ id: number; corps: string; ts: number }>)
    req.onerror = () => reject(req.error)
  })
}

async function supprimerRetourOffline(id: number): Promise<void> {
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
  }
})

async function rejouerRetoursOffline(): Promise<void> {
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

// ---------- Au démarrage du SW : rejoue aussi (au cas où sync n'est pas supporté) ----------
self.addEventListener("message", (event) => {
  if (event.data === "fp-replay-offline") {
    event.waitUntil(rejouerRetoursOffline())
  }
})
