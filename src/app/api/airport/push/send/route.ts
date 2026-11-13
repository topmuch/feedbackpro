// ============================================================
// POST /api/airport/push/send
// ------------------------------------------------------------
// Envoie une notification Web Push à tous les appareils staff abonnés
// (ou à un employé précis via ?staffName=xxx).
//
// Récupère toutes les AirportPushSubscription en BDD, et pour chacune
// appelle web-push.sendNotification() qui :
//   1. chiffre le payload (ECDH P-256 + AES-GCM) avec les clés
//      p256dh/auth du client
//   2. signe l'endpoint avec la clé VAPID privée (Authorization header
//      VAPID JWT + Crypto-Key)
//   3. POST vers le endpoint push (FCM/APNS/Mozilla) qui délivrera la
//      notif au navigateur, réveillant le Service Worker même si la
//      PWA est fermée.
//
// Payload attendu (JSON) :
//   {
//     title: string,            // "Nouvel incident"
//     body: string,             // "Terminal 2, Porte B12 — Propreté"
//     url?: string,             // "/?staff=1&report=xxx" (ouvert au clic)
//     tag?: string,             // "incident-<id>" — évite le stacking
//     staffName?: string        // cible un employé précis (optionnel)
//   }
//
// Réponse (200) : { ok: true, data: { sent, failed, total } }
//   - sent   : nombre de push délivrés avec succès (status 201)
//   - failed : nombre d'échecs (410 = subscription expirée → on supprime)
//   - total  : nombre total d'abonnés interrogés
//
// En mode démo (pas de VAPID_PRIVATE_KEY / NEXT_PUBLIC_VAPID_PUBLIC_KEY
// dans .env), on logge juste le payload — pas d'envoi réel. La PWA
// staff garde le polling 10s comme repli.
// ============================================================

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// web-push est un module CommonJS — on utilise un import dynamique ESM
// (await import()) plutôt que require() pour rester compatible avec la
// règle ESLint @typescript-eslint/no-require-imports. Node.js gère
// l'interop CJS/ESM automatiquement (le default export correspond à
// module.exports).
type WebPushModule = {
  setVapidDetails: (subject: string, publicKey: string, privateKey: string) => void
  sendNotification: (
    subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
    payload: string,
    options?: { TTL?: number; urgency?: string; topic?: string },
  ) => Promise<Response>
}

async function getWebPush(): Promise<WebPushModule | null> {
  try {
    const mod = (await import('web-push')) as unknown as WebPushModule & { default?: WebPushModule }
    return mod.default ?? mod
  } catch (err) {
    console.warn('[push-send] web-push non chargé:', err instanceof Error ? err.message : String(err))
    return null
  }
}

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return fail('Payload JSON invalide', 400)
  }

  const b = body as {
    title?: string
    body?: string
    url?: string
    tag?: string
    staffName?: string
  }

  if (!b.body || typeof b.body !== 'string') {
    return fail('body requis', 400)
  }

  const title = typeof b.title === 'string' && b.title ? b.title : 'FeedbackPro'
  const payload = JSON.stringify({
    title,
    body: b.body,
    url: typeof b.url === 'string' && b.url ? b.url : '/',
    tag: typeof b.tag === 'string' && b.tag ? b.tag : 'fp-incident',
  })

  // --- Récupère les subscriptions ---
  // Option : filtrer par staffName si précisé (sinon broadcast à tout le staff)
  const where = b.staffName && typeof b.staffName === 'string' ? { staffName: b.staffName } : {}
  const subs = await db.airportPushSubscription.findMany({ where })

  if (subs.length === 0) {
    console.log('[push-send] Aucun abonnement push en BDD — notification loguée seulement')
    console.log(`[push-send] "${title}" — ${b.body}`)
    return ok({ sent: 0, failed: 0, total: 0, skipped: 'no_subscriptions' })
  }

  // --- Configuration web-push (clés VAPID) ---
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY
  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const vapidSubject = process.env.VAPID_SUBJECT || 'mailto:ops@feedbackpro.local'

  const webpush = await getWebPush()

  // Mode démo : pas de clés VAPID → on logge juste (les endpoints FCM
  // refuseraient un push sans signature VAPID valide).
  if (!webpush || !vapidPrivateKey || !vapidPublicKey) {
    console.log('[push-send] Mode démo (sans VAPID) — payload loggué, pas d\'envoi réel :')
    console.log(`[push-send] "${title}" → ${subs.length} abonnés`)
    console.log(`[push-send] body: ${b.body}`)
    return ok({
      sent: 0,
      failed: 0,
      total: subs.length,
      skipped: 'no_vapid_keys',
    })
  }

  try {
    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey)
  } catch (err) {
    console.error('[push-send] setVapidDetails failed:', err)
    return fail('Configuration VAPID invalide', 500)
  }

  // --- Envoi parallèle (best-effort, on n'attend pas tous les timeouts) ---
  let sent = 0
  let failed = 0
  const failedEndpoints: string[] = []

  // Promise.allSettled : on veut le résultat de chaque envoi même si
  // certains échouent (timeout, 410 Gone, 404…). On ne lève jamais.
  const results = await Promise.allSettled(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          payload,
          {
            TTL: 60 * 60, // 1h : si l'appareil est offline, FCM garde le push 1h max
            urgency: 'high',
            topic: b.tag || 'fp-incident',
          },
        )
        return { ok: true, endpoint: sub.endpoint }
      } catch (err) {
        const status =
          (err as { statusCode?: number }).statusCode ??
          (err instanceof Error ? parseInt(err.message.match(/\d{3}/)?.[0] ?? '0', 10) : 0)
        // 404 / 410 = subscription expirée ou invalide → on la supprime
        // de la BDD pour ne plus la réinterroger (sinon on accumule des
        // endpoints morts).
        if (status === 404 || status === 410) {
          failedEndpoints.push(sub.endpoint)
        }
        return { ok: false, endpoint: sub.endpoint, status }
      }
    }),
  )

  for (const r of results) {
    if (r.status === 'fulfilled') {
      if (r.value.ok) sent++
      else failed++
    } else {
      failed++
    }
  }

  // Nettoie les subscriptions mortes (404/410) — fire-and-forget
  if (failedEndpoints.length > 0) {
    try {
      await db.airportPushSubscription.deleteMany({
        where: { endpoint: { in: failedEndpoints } },
      })
      console.log(`[push-send] ${failedEndpoints.length} subscription(s) expirée(s) supprimée(s)`)
    } catch {
      /* silencieux */
    }
  }

  console.log(`[push-send] "${title}" → ${sent}/${subs.length} envoyés, ${failed} échecs`)

  return ok({ sent, failed, total: subs.length })
}
