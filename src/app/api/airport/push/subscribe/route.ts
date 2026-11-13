// ============================================================
// POST /api/airport/push/subscribe
// ------------------------------------------------------------
// Reçoit une PushSubscription (endpoint + clés p256dh/auth) depuis
// la PWA staff et la persiste en BDD (model AirportPushSubscription).
//
// Le navigateur génère cette subscription côté client via
// pushManager.subscribe() (src/lib/push-manager.ts). L'endpoint est
// unique par appareil/navigateur : on l'utilise comme clé d'upsert
// pour éviter les doublons (même employé ré-active les notifs =
// même endpoint → update plutôt qu'insert).
//
// Payload attendu (JSON) :
//   {
//     endpoint: string,            // https://fcm.googleapis.com/fcm/send/...
//     keys: { p256dh: string, auth: string },  // base64url, pour chiffrer le payload
//     staffName?: string           // nom de l'employé (clé localStorage fp-staff-name)
//   }
//
// Réponse (200) : { ok: true, data: { id, endpoint, staffName } }
// Réponse (4xx) : { ok: false, error: string }
// ============================================================

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail } from '@/lib/session'

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

  const staffName = typeof b.staffName === 'string' && b.staffName.trim() ? b.staffName.trim() : null

  try {
    // Upsert : si l'endpoint existe déjà (même appareil qui ré-active
    // les notifs), on met à jour les clés et le staffName. Sinon on crée.
    const sub = await db.airportPushSubscription.upsert({
      where: { endpoint: b.endpoint },
      create: {
        endpoint: b.endpoint,
        p256dh: b.keys.p256dh,
        auth: b.keys.auth,
        staffName,
      },
      update: {
        p256dh: b.keys.p256dh,
        auth: b.keys.auth,
        staffName: staffName ?? undefined, // null → on garde l'ancien
      },
    })

    console.log(`[push-subscribe] Subscription ${sub.id} enregistrée pour staff=${staffName ?? 'anonyme'}`)

    return ok({ id: sub.id, endpoint: sub.endpoint, staffName: sub.staffName })
  } catch (err) {
    console.error('[push-subscribe] Erreur BDD:', err)
    return fail('Impossible d\'enregistrer la subscription', 500)
  }
}
