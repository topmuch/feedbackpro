'use client'

// ============================================================
// useAirportOffline — Hook React pour la PWA aéroport hors ligne
// (Task 3 Phase 2 — FeedbackPro airport)
// ------------------------------------------------------------
// Fournit à la PWA voyageur :
//   • isOnline       — état réseau (navigator.onLine + events online/offline)
//   • pendingCount   — nb de signalements en file d'attente IndexedDB
//   • pendingReports — liste détaillée (pour debug / affichage)
//   • enqueueReport  — stocke un signalement + registerSync()
//   • forceSync      — rejoue manuellement la file (fallback Safari)
//   • registerSync   — enregistre un Background Sync si supporté
//
// IndexedDB : DB 'feedbackpro-airport' v1, store 'airport-pending-reports'
// (keyPath 'id', autoIncrement). PARTAGÉE avec le service worker
// (public/sw.js) qui y lit/rejoue les payloads au prochain 'sync'.
//
// SSR-safe : tout accès window/navigator/indexedDB est gardé par
// typeof window !== 'undefined'. Au rendu serveur, retourne
// isOnline=true, pendingCount=0, pendingReports=[] et des fonctions no-op.
// ============================================================

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'

export type PendingReport = {
  id?: number
  payload: {
    tag: string
    problemType: string
    commentaire?: string
    photoUrl?: string
    whatsappOptin?: boolean
    whatsappPhone?: string
    flightNumber?: string
  }
  queuedAt: number // epoch ms
}

const DB_NAME = 'feedbackpro-airport'
const DB_VERSION = 1
const DB_STORE = 'airport-pending-reports'
const PENDING_CHANGED_EVENT = 'airport-pending-changed'

// ---------- IndexedDB helpers (promise wrapper, SSR-safe) ----------
function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB unavailable (SSR)'))
  }
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(DB_STORE)) {
        db.createObjectStore(DB_STORE, { keyPath: 'id', autoIncrement: true })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function readAllPending(): Promise<PendingReport[]> {
  if (typeof indexedDB === 'undefined') return []
  try {
    const db = await openDb()
    return await new Promise<PendingReport[]>((resolve, reject) => {
      const tx = db.transaction(DB_STORE, 'readonly')
      const store = tx.objectStore(DB_STORE)
      const req = store.getAll()
      // Schéma IndexedDB partagé avec le SW : { id, corps, ts } où `corps`
      // est une chaîne JSON du payload. On parse ici pour exposer un objet
      // typé PendingReport au reste de l'app.
      req.onsuccess = () => {
        const rows = req.result as Array<{ id: number; corps: string; ts: number }>
        const parsed: PendingReport[] = []
        for (const row of rows) {
          try {
            const payload = JSON.parse(row.corps) as PendingReport['payload']
            parsed.push({ id: row.id, payload, queuedAt: row.ts })
          } catch {
            // Entrée corrompue — on l'ignore (elle sera purgée par le SW au prochain replay).
          }
        }
        resolve(parsed)
      }
      req.onerror = () => reject(req.error)
    })
  } catch {
    return []
  }
}

async function addPending(payload: PendingReport['payload']): Promise<void> {
  if (typeof indexedDB === 'undefined') return
  const db = await openDb()
  // On stocke { corps, ts } — même schéma que public/sw.js pour que le
  // background sync du SW puisse rejouer l'entrée telle quelle.
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readwrite')
    const store = tx.objectStore(DB_STORE)
    store.add({ corps: JSON.stringify(payload), ts: Date.now() })
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function deletePending(id: number): Promise<void> {
  if (typeof indexedDB === 'undefined') return
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readwrite')
    const store = tx.objectStore(DB_STORE)
    store.delete(id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

function notifyPendingChanged() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(PENDING_CHANGED_EVENT))
}

// ---------- Souscription externe pour navigator.onLine ----------
// useSyncExternalStore est le pattern React recommandé pour lire un état
// externe synchrone (navigator.onLine) sans setState-in-effect ni mismatch
// d'hydratation (getServerSnapshot retourne true côté serveur).
function subscribeOnline(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined
  window.addEventListener('online', callback)
  window.addEventListener('offline', callback)
  return () => {
    window.removeEventListener('online', callback)
    window.removeEventListener('offline', callback)
  }
}

function getOnlineSnapshot(): boolean {
  if (typeof navigator === 'undefined') return true
  return navigator.onLine
}

function getServerOnlineSnapshot(): boolean {
  return true
}

// ---------- Type du retour ----------
export type UseAirportOfflineReturn = {
  isOnline: boolean
  pendingCount: number
  pendingReports: PendingReport[]
  enqueueReport: (payload: PendingReport['payload']) => Promise<void>
  forceSync: () => Promise<{ success: number; failed: number }>
  registerSync: () => Promise<void>
}

// ---------- Le hook ----------
export function useAirportOffline(): UseAirportOfflineReturn {
  // isOnline via useSyncExternalStore (pas de setState dans un effect,
  // pas de mismatch d'hydratation : serveur = true, client se resynchronise
  // automatiquement au mount).
  const isOnline = useSyncExternalStore(
    subscribeOnline,
    getOnlineSnapshot,
    getServerOnlineSnapshot,
  )
  // États initiaux = valeurs SSR-safe (0 / []).
  const [pendingCount, setPendingCount] = useState<number>(0)
  const [pendingReports, setPendingReports] = useState<PendingReport[]>([])

  // 1) Au retour réseau, on demande au SW de rejouer la file (utile quand
  //    Background Sync n'est pas supporté — ex: Safari). Pas de setState ici :
  //    effet pur de synchronisation avec un système externe (le SW).
  useEffect(() => {
    if (!isOnline) return
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
    if (!navigator.serviceWorker.controller) return
    navigator.serviceWorker.controller.postMessage('airport-replay-offline')
  }, [isOnline])

  // 2) Refresh au mount + sur l'événement custom 'airport-pending-changed'
  //    (dispatché par enqueueReport/forceSync après chaque écriture IndexedDB).
  //    L'appel setState est derrière un await (async IIFE) → non synchrone.
  useEffect(() => {
    if (typeof window === 'undefined') return
    let cancelled = false
    const load = async () => {
      const all = await readAllPending()
      if (cancelled) return
      setPendingReports(all)
      setPendingCount(all.length)
    }
    void load()
    const onChanged = () => void load()
    window.addEventListener(PENDING_CHANGED_EVENT, onChanged)
    return () => {
      cancelled = true
      window.removeEventListener(PENDING_CHANGED_EVENT, onChanged)
    }
  }, [])

  // 3) Refresh aussi quand le SW signale que la file a changé en arrière-plan
  //    (background sync a rejoué/supprimé des entrées). setState derrière await.
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
    let cancelled = false
    const onMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === 'airport-pending-changed') {
        const load = async () => {
          const all = await readAllPending()
          if (cancelled) return
          setPendingReports(all)
          setPendingCount(all.length)
        }
        void load()
      }
    }
    navigator.serviceWorker.addEventListener('message', onMessage)
    return () => {
      cancelled = true
      navigator.serviceWorker.removeEventListener('message', onMessage)
    }
  }, [])

  // 4) registerSync — enregistre un Background Sync si l'API est dispo.
  const registerSync = useCallback(async (): Promise<void> => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
    try {
      const reg = await navigator.serviceWorker.ready
      const syncManager = (
        reg as unknown as { sync?: { register: (tag: string) => Promise<void> } }
      ).sync
      if (syncManager && typeof syncManager.register === 'function') {
        await syncManager.register('sync-airport-report')
      }
      // Si sync non supporté : no-op (le navigateur / le hook.forceSync()
      // s'en chargera au prochain fetch online).
    } catch {
      /* no-op */
    }
  }, [])

  // 5) enqueueReport — stocke un payload + tente registerSync.
  const enqueueReport = useCallback(
    async (payload: PendingReport['payload']): Promise<void> => {
      if (typeof window === 'undefined') return
      await addPending(payload)
      notifyPendingChanged()
      await registerSync()
    },
    [registerSync],
  )

  // 6) forceSync — rejoue manuellement chaque entrée (fallback Safari).
  //    Fait un POST /api/airport/report par entrée ; supprime celles qui
  //    réussissent (2xx) ou qui sont invalides (4xx, non retryable).
  //    Stop au premier échec réseau (still offline).
  const forceSync = useCallback(
    async (): Promise<{ success: number; failed: number }> => {
      if (typeof window === 'undefined') return { success: 0, failed: 0 }
      const all = await readAllPending()
      let success = 0
      let failed = 0
      for (const r of all) {
        if (typeof r.id !== 'number') continue
        try {
          const res = await fetch('/api/airport/report', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            // r.payload est l'objet JS parsé depuis IndexedDB (corps JSON).
            body: JSON.stringify(r.payload),
          })
          if (res.ok) {
            await deletePending(r.id)
            success++
          } else if (res.status >= 400 && res.status < 500) {
            // 4xx : payload invalide, non retryable — on purge.
            await deletePending(r.id)
            failed++
          } else {
            // 5xx : serveur en carafe — on garde pour retry.
            failed++
          }
        } catch {
          // Toujours offline — on garde le reste en file, on arrête.
          failed++
          break
        }
      }
      notifyPendingChanged()
      return { success, failed }
    },
    [],
  )

  return {
    isOnline,
    pendingCount,
    pendingReports,
    enqueueReport,
    forceSync,
    registerSync,
  }
}
