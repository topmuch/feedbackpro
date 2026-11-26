// ============================================================
// POST /api/city/push/subscribe
// ------------------------------------------------------------
// Feature #5 — Notifications push pour la Mairie.
//
// Clone du pattern /api/airport/push/subscribe, adapté pour le
// module Ville. Reçoit une PushSubscription (endpoint + clés
// p256dh/auth) depuis la PWA mairie et la persiste.
//
// V1 : stockage in-memory (cf. src/lib/city-push-store.ts) car
// le modèle Prisma CityPushSubscription n'existe pas encore.
// Suffisant pour un serveur monoinstance (dev / sandbox).
//
// Payload attendu (JSON) :
//   {
//     endpoint: string,            // https://fcm.googleapis.com/fcm/send/...
//     keys: { p256dh: string, auth: string },
//     staffName?: string           // nom de l'agent mairie (optionnel)
//   }
//
// Réponse (200) : { ok: true, data: { id, endpoint, staffName } }
// Réponse (4xx) : { ok: false, error }
// ============================================================

import { NextRequest } from 'next/server'
import { ok, fail } from '@/lib/session'
import { upsertSubscription } from '@/lib/city-push-store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return fail('Payload JSON invalide', 400)
  }

  const b = body as {
    endpoint?: string
    keys?: { p256dh?: string; auth?: string }
    staffName?: string
  }

  // --- Validation ---
  if (!b.endpoint || typeof b.endpoint !== 'string' || b.endpoint.length < 16) {
    return fail('endpoint manquant ou invalide', 400)
  }
  if (!b.keys?.p256dh || typeof b.keys.p256dh !== 'string') {
    return fail('clé p256dh manquante', 400)
  }
  if (!b.keys?.auth || typeof b.keys.auth !== 'string') {
    return fail('clé auth manquante', 400)
  }

  const staffName =
    typeof b.staffName === 'string' && b.staffName.trim()
      ? b.staffName.trim().slice(0, 80)
      : null

  try {
    const sub = upsertSubscription({
      endpoint: b.endpoint,
      p256dh: b.keys.p256dh,
      auth: b.keys.auth,
      staffName,
    })

    console.log(
      `[city-push-subscribe] Subscription ${sub.id} enregistrée pour staff=${staffName ?? 'anonyme'}`,
    )

    return ok({ id: sub.id, endpoint: sub.endpoint, staffName: sub.staffName })
  } catch (err) {
    console.error('[city-push-subscribe] Erreur:', err)
    return fail('Impossible d\'enregistrer la subscription', 500)
  }
}
