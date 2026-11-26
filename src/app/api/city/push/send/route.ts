// ============================================================
// POST /api/city/push/send
// ------------------------------------------------------------
// Feature #5 — Envoi de notifications Web Push à tous les
// appareils mairie abonnés (ou à un agent précis via ?staffName).
//
// Clone du pattern /api/airport/push/send. Mêmes clés VAPID que
// le module airport (process.env.VAPID_PRIVATE_KEY et
// NEXT_PUBLIC_VAPID_PUBLIC_KEY) — un seul jeu VAPID pour toute
// l'app, partagé entre les modules.
//
// Payload attendu (JSON) :
//   {
//     title: string,            // "Nouveau signalement citoyen"
//     body: string,             // "Plate Médina — Propreté"
//     url?: string,             // "/?city=1&incident=xxx" (ouvert au clic)
//     tag?: string,             // "city-incident-<id>"
//     staffName?: string        // cible un agent précis (optionnel)
//   }
//
// Réponse (200) : { ok: true, data: { sent, failed, total, skipped? } }
//
// Mode démo : sans VAPID_PRIVATE_KEY / NEXT_PUBLIC_VAPID_PUBLIC_KEY,
// on logge juste le payload — pas d'envoi réel. Le dashboard mairie
// garde le polling comme repli.
// ============================================================

import { NextRequest } from 'next/server'
import { ok, fail } from '@/lib/session'
import {
  listSubscriptions,
  removeSubscription,
} from '@/lib/city-push-store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// web-push est un module CommonJS — import dynamique ESM pour rester
// compatible avec la règle ESLint @typescript-eslint/no-require-imports.
type WebPushModule = {
  setVapidDetails: (
    subject: string,
    publicKey: string,
    privateKey: string,
  ) => void
  sendNotification: (
    subscription: {
      endpoint: string
      keys: { p256dh: string; auth: string }
    },
    payload: string,
    options?: { TTL?: number; urgency?: string; topic?: string },
  ) => Promise<Response>
}

async function getWebPush(): Promise<WebPushModule | null> {
  try {
    const mod = (await import('web-push')) as unknown as WebPushModule & {
      default?: WebPushModule
    }
    return mod.default ?? mod
  } catch (err) {
    console.warn(
      '[city-push-send] web-push non chargé:',
      err instanceof Error ? err.message : String(err),
    )
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

  const title =
    typeof b.title === 'string' && b.title ? b.title : 'Ville Connectée'
  const payload = JSON.stringify({
    title,
    body: b.body,
    url: typeof b.url === 'string' && b.url ? b.url : '/',
    tag: typeof b.tag === 'string' && b.tag ? b.tag : 'city-incident',
  })

  // --- Récupère les subscriptions (filtrage optionnel par staffName) ---
  const staffName =
    typeof b.staffName === 'string' && b.staffName.trim()
      ? b.staffName.trim()
      : null
  const subs = listSubscriptions(staffName)

  if (subs.length === 0) {
    console.log(
      '[city-push-send] Aucun abonnement mairie en mémoire — notification loguée seulement',
    )
    console.log(`[city-push-send] "${title}" — ${b.body}`)
    return ok({ sent: 0, failed: 0, total: 0, skipped: 'no_subscriptions' })
  }

  // --- Configuration web-push (clés VAPID partagées avec airport) ---
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY
  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const vapidSubject = process.env.VAPID_SUBJECT || 'mailto:ville@feedvoice.local'

  const webpush = await getWebPush()

  // Mode démo : pas de clés VAPID → on logge seulement.
  if (!webpush || !vapidPrivateKey || !vapidPublicKey) {
    console.log(
      '[city-push-send] Mode démo (sans VAPID) — payload loggué, pas d\'envoi réel :',
    )
    console.log(`[city-push-send] "${title}" → ${subs.length} abonnés mairie`)
    console.log(`[city-push-send] body: ${b.body}`)
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
    console.error('[city-push-send] setVapidDetails failed:', err)
    return fail('Configuration VAPID invalide', 500)
  }

  // --- Envoi parallèle (best-effort) ---
  let sent = 0
  let failed = 0
  const failedEndpoints: string[] = []

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
            TTL: 60 * 60, // 1h
            urgency: 'high',
            topic: b.tag || 'city-incident',
          },
        )
        return { ok: true, endpoint: sub.endpoint }
      } catch (err) {
        const status =
          (err as { statusCode?: number }).statusCode ??
          (err instanceof Error
            ? parseInt(err.message.match(/\d{3}/)?.[0] ?? '0', 10)
            : 0)
        // 404 / 410 = subscription expirée → on la supprime de la mémoire.
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

  // Nettoie les subscriptions mortes (404/410)
  if (failedEndpoints.length > 0) {
    for (const ep of failedEndpoints) removeSubscription(ep)
    console.log(
      `[city-push-send] ${failedEndpoints.length} subscription(s) expirée(s) supprimée(s)`,
    )
  }

  console.log(
    `[city-push-send] "${title}" → ${sent}/${subs.length} envoyés, ${failed} échecs`,
  )

  return ok({ sent, failed, total: subs.length })
}
