"use client"

// ============================================================
// FeedbackPro - Helper offline-sync (Task M3)
// ------------------------------------------------------------
// Côté client : enregistre le service worker + helper pour la queue
// IndexedDB des retours offline (utilisé par scan-view.tsx).
//
// API publique :
//   - enregistrerServiceWorker() : à appeler au boot de l'app.
//   - stockerRetourOfflineLocal(corps) : alternative au SW (si SW pas
//     enregistré ou sync non supporté), stocke dans IndexedDB côté page.
//   - rejouerRetoursOfflineLocal() : tente de rejouer la queue (à
//     appeler au boot ET sur l'event 'online').
//   - compterRetoursOffline() : pour afficher un badge "X retours en
//     attente" dans le dashboard Pro.
// ============================================================

const DB_NAME = "fp-offline"
const DB_STORE = "retours"
const DB_VERSION = 1

/** Ouvre (ou crée) la base IndexedDB des retours offline. */
function ouvrirDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB indisponible"))
      return
    }
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

/**
 * Enregistre le service worker /sw.js. Best-effort : silencieux en cas
 * d'échec (navigateurs sans SW, navigation privée…). À appeler une fois
 * au boot de l'app (page.tsx ou _app équivalent).
 */
export async function enregistrerServiceWorker(): Promise<void> {
  if (typeof window === "undefined") return
  if (!("serviceWorker" in navigator)) return
  try {
    await navigator.serviceWorker.register("/sw.js", { scope: "/" })
    // Demande au SW de rejouer la queue au boot (au cas où Background Sync
    // n'est pas supporté — Safari/iOS ne le supporte pas).
    navigator.serviceWorker.ready
      .then((reg) => {
        if (reg.active) reg.active.postMessage("fp-replay-offline")
      })
      .catch(() => undefined)
  } catch (e) {
    // Non bloquant : l'app reste fonctionnelle sans SW (pas de cache offline).
    console.warn("[offline] SW non enregistré", e)
  }
}

/**
 * Stocke localement (IndexedDB) un payload de retour pour envoi différé.
 * Utilisé par scan-view.tsx quand POST /api/public/retour échoue ET que
 * le SW n'a pas pu intercepter (ou pour navigateurs sans Background Sync).
 */
export async function stockerRetourOfflineLocal(corps: string): Promise<void> {
  try {
    const db = await ouvrirDb()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, "readwrite")
      const store = tx.objectStore(DB_STORE)
      store.add({ corps, ts: Date.now() })
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch (e) {
    console.warn("[offline] Impossible de stocker le retour offline", e)
  }
}

/**
 * Compte les retours offline en attente. Sert pour afficher un badge
 * dans le dashboard Pro ("X retours en attente d'envoi").
 */
export async function compterRetoursOffline(): Promise<number> {
  try {
    const db = await ouvrirDb()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, "readonly")
      const store = tx.objectStore(DB_STORE)
      const req = store.count()
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  } catch {
    return 0
  }
}

/**
 * Tente de rejouer tous les retours offline stockés localement.
 * À appeler :
 *   - au boot de l'app (page.tsx)
 *   - sur l'événement window 'online'
 *   - périodiquement (ex : toutes les 60s) si l'app reste ouverte
 *
 * Supprime chaque retour dont l'envoi réussit (200 + ok:true).
 */
export async function rejouerRetoursOfflineLocal(): Promise<{
  envoyes: number
  restants: number
}> {
  let envoyes = 0
  let restants = 0
  try {
    const db = await ouvrirDb()
    const liste = await new Promise<
      Array<{ id: number; corps: string; ts: number }>
    >((resolve, reject) => {
      const tx = db.transaction(DB_STORE, "readonly")
      const store = tx.objectStore(DB_STORE)
      const req = store.getAll()
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })

    for (const r of liste) {
      try {
        const res = await fetch("/api/public/retour", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: r.corps,
        })
        const json = await res.json().catch(() => null)
        if (res.ok && json?.ok) {
          // Succès : on supprime de la queue
          await new Promise<void>((resolve, reject) => {
            const tx = db.transaction(DB_STORE, "readwrite")
            tx.objectStore(DB_STORE).delete(r.id)
            tx.oncomplete = () => resolve()
            tx.onerror = () => reject(tx.error)
          })
          envoyes += 1
        } else {
          restants += 1
        }
      } catch {
        restants += 1
        break // réseau down : inutile d'insister, on réessaiera plus tard
      }
    }
  } catch (e) {
    console.warn("[offline] rejouerRetoursOfflineLocal échoué", e)
  }
  return { envoyes, restants }
}
