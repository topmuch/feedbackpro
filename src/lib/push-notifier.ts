// ============================================================
// push-notifier.ts — Helper serveur pour déclencher un push staff
// ------------------------------------------------------------
// Task P1 — wrapper fire-and-forget autour de /api/airport/push/send.
//
// Pourquoi un helper séparé plutôt qu'un import direct de web-push ?
//   - Centralise le payload (title/body/url/tag) dans un seul type
//   - Cache les détails HTTP (appels internes = pas de Caddy gateway)
//   - Permet aux routes POST /api/airport/report et /api/airport/staff-scan
//     de déclencher un push en une seule ligne : triggerPushNotification({...})
//   - En cas d'échec réseau, logge seulement — ne casse pas la route
//     appelante (le push est best-effort, le polling 10s reste actif).
//
// Implémente l'appel en HTTP interne (fetch vers /api/airport/push/send)
// plutôt qu'en inline pour :
//   - Garde la route /report simple (pas d'import de web-push côté route)
//   - Permet à un mini-service externe (alertes ops) de réutiliser le
//     même endpoint sans connaître la signature VAPID.
// ============================================================

export interface PushPayload {
  /** Titre de la notification (ex: "Nouvel incident"). */
  title: string
  /** Corps du message (ex: "Terminal 2, Porte B12 — Propreté"). */
  body: string
  /** URL cible au clic sur la notif (ex: "/?staff=1&report=xxx"). */
  url?: string
  /** Tag unique (ex: "incident-<id>") pour éviter le stacking. */
  tag?: string
  /** Cible un employé précis (sinon broadcast à tout le staff). */
  staffName?: string
}

/**
 * Déclenche un push notification vers tous les appareils staff abonnés.
 * Fire-and-forget : ne lève jamais. En cas d'échec, logge sur stderr.
 *
 * Usage :
 *   triggerPushNotification({
 *     title: 'Nouvel incident',
 *     body: `${zone.nom} — ${problemType}`,
 *     url: `/?staff=1&report=${report.id}`,
 *     tag: `incident-${report.id}`,
 *   }).catch(() => {})
 */
export async function triggerPushNotification(payload: PushPayload): Promise<void> {
  try {
    // Appel HTTP interne vers /api/airport/push/send.
    // On ne passe pas par le gateway Caddy (pas de XTransformPort) car
    // la route vit dans la même app Next.js — fetch relatif suffit.
    // Next.js route en runtime nodejs → pas de souci de résolution.
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const res = await fetch(`${baseUrl}/api/airport/push/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      // 8s max — un push lent ne doit pas bloquer le signalement voyageur.
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) {
      const txt = await res.text().catch(() => '')
      console.warn(`[push-notifier] /api/airport/push/send → HTTP ${res.status}: ${txt.slice(0, 200)}`)
      return
    }
    const json = (await res.json().catch(() => null)) as { ok?: boolean; data?: { sent?: number; total?: number } }
    if (json?.ok) {
      console.log(`[push-notifier] Push envoyé: ${json.data?.sent ?? 0}/${json.data?.total ?? 0} abonnés`)
    }
  } catch (err) {
    console.warn(
      '[push-notifier] Erreur déclenchement push:',
      err instanceof Error ? err.message : String(err),
    )
  }
}
