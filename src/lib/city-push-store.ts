// ============================================================
// city-push-store.ts — Stockage in-memory des abonnements push
// ------------------------------------------------------------
// Feature #5 — Notifications push pour la Mairie (V1).
//
// V1 : pas de modèle Prisma dédié (CityPushSubscription n'existe
// pas encore dans le schéma). On stocke les abonnements dans une
// Map globale au process Node. Cela fonctionne pour un serveur
// monoinstance (dev / sandbox). En production multi-instance,
// il faudra migrer vers une table Prisma dédiée.
//
// La Map est keyed par endpoint (unique par appareil/navigateur),
// ce qui permet l'upsert : même appareil qui ré-active les
// notifs → update plutôt qu'insert.
// ============================================================

export type CityPushSubscription = {
  id: string
  endpoint: string
  p256dh: string
  auth: string
  staffName: string | null
  createdAt: Date
  updatedAt: Date
}

type CityPushStore = Map<string, CityPushSubscription>

// Singleton global : on utilise globalThis pour survivre aux HMR
// en dev (Next.js recharge les modules mais globalThis persiste).
const g = globalThis as unknown as { __CITY_PUSH_STORE__?: CityPushStore }

const store: CityPushStore = g.__CITY_PUSH_STORE__ ?? new Map()
if (!g.__CITY_PUSH_STORE__) {
  g.__CITY_PUSH_STORE__ = store
}

let seq = 0
function nextId(): string {
  seq += 1
  return `city-push-${Date.now().toString(36)}-${seq.toString(36)}`
}

/** Upsert : si l'endpoint existe déjà, on met à jour les clés/staffName. */
export function upsertSubscription(input: {
  endpoint: string
  p256dh: string
  auth: string
  staffName: string | null
}): CityPushSubscription {
  const now = new Date()
  const existing = store.get(input.endpoint)
  if (existing) {
    const updated: CityPushSubscription = {
      ...existing,
      p256dh: input.p256dh,
      auth: input.auth,
      staffName: input.staffName ?? existing.staffName,
      updatedAt: now,
    }
    store.set(input.endpoint, updated)
    return updated
  }
  const created: CityPushSubscription = {
    id: nextId(),
    endpoint: input.endpoint,
    p256dh: input.p256dh,
    auth: input.auth,
    staffName: input.staffName,
    createdAt: now,
    updatedAt: now,
  }
  store.set(input.endpoint, created)
  return created
}

/** Liste tous les abonnements (optionnellement filtrés par staffName). */
export function listSubscriptions(staffName?: string | null): CityPushSubscription[] {
  const all = Array.from(store.values())
  if (!staffName) return all
  return all.filter((s) => s.staffName === staffName)
}

/** Supprime un abonnement expiré (404/410 côté FCM/APNS). */
export function removeSubscription(endpoint: string): boolean {
  return store.delete(endpoint)
}

/** Nombre total d'abonnés (pour debug / dashboard). */
export function countSubscriptions(): number {
  return store.size
}
