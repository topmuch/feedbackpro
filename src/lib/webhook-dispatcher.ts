// ============================================================
// FeedVoice — Webhook Dispatcher (Task F3 — Marketplace)
// ------------------------------------------------------------
// Dispatcher de webhooks pour intégrations tierces (Slack, Microsoft
// Teams, Zapier, Make.com, n8n, IFTTT, etc.). Chaque endpoint
// enregistré dans WebhookEndpoint s'abonne à une liste d'événements.
// Quand un de ces événements se produit, dispatchWebhook() envoie
// un HTTP POST au webhook avec un payload JSON standardisé.
//
// Événements supportés :
//   - "new_incident"     : nouveau signalement voyageur
//   - "resolved"         : signalement résolu
//   - "escalation"       : escalade (SLA dépassé / critique)
//   - "prediction_alert" : alerte prédiction IA
//
// Contrats :
//   - Strictement non bloquant : un échec réseau est loggué et ignoré
//   - Timeout 5 s par webhook
//   - Payload JSON générique (compatible Zapier/Make/Slack/Teams)
//
// Intégrations appelantes :
//   - /api/airport/report/route.ts        → dispatchWebhook('new_incident', …)
//   - /api/airport/ops/resolve/route.ts   → dispatchWebhook('resolved', …)
// ============================================================

import { db } from '@/lib/db'

/** Liste des événements reconnus (servira aussi côté UI pour les checkboxes). */
export const WEBHOOK_EVENTS = [
  'new_incident',
  'resolved',
  'escalation',
  'prediction_alert',
] as const

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number]

/** Type du payload envoyé à chaque webhook. */
export type WebhookPayload = {
  /** Plateforme émettrice — toujours "feedbackpro". */
  source: string
  /** Type d'événement ("new_incident", "resolved", etc.). */
  event: string
  /** Horodatage ISO 8601 UTC. */
  timestamp: string
  /** Données métier de l'événement (variable selon le type). */
  data: Record<string, unknown>
}

/**
 * Désérialise le champ `events` (JSON string[]) d'un WebhookEndpoint.
 * Tolérant : retourne [] si le JSON est invalide.
 */
export function parseWebhookEvents(eventsJson: string): string[] {
  if (!eventsJson) return []
  try {
    const arr = JSON.parse(eventsJson)
    if (Array.isArray(arr)) {
      return arr.filter((e) => typeof e === 'string')
    }
  } catch {
    /* ignore — JSON invalide */
  }
  return []
}

/**
 * Sérialise un tableau d'événements en JSON string pour stockage Prisma.
 */
export function serializeWebhookEvents(events: string[]): string {
  return JSON.stringify(events)
}

/**
 * Récupère tous les webhooks actifs abonnés à un événement donné.
 */
async function getEndpointsForEvent(event: string) {
  const all = await db.webhookEndpoint.findMany({
    where: { active: true },
  })
  return all.filter((e) => parseWebhookEvents(e.events).includes(event))
}

/**
 * Envoie un webhook à une URL unique. Strictement non bloquant.
 *
 * @returns true si HTTP 2xx reçu, false sinon (jamais d'exception)
 */
async function sendToWebhook(
  url: string,
  payload: WebhookPayload,
): Promise<boolean> {
  if (!url) return false
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'FeedVoice-Webhooks/1.0',
        'X-FeedVoice-Event': payload.event,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      console.warn(
        `[webhook-dispatcher] Échec ${res.status} sur ${url.slice(0, 80)} : ${detail.slice(0, 200)}`,
      )
      return false
    }
    return true
  } catch (err) {
    console.warn(
      `[webhook-dispatcher] Erreur non bloquante sur ${url.slice(0, 80)} :`,
      err instanceof Error ? err.message : String(err),
    )
    return false
  }
}

/**
 * Dispatch un événement à tous les webhooks actifs abonnés.
 *
 * @param event   Type d'événement ("new_incident", "resolved", "escalation", "prediction_alert")
 * @param data    Données métier de l'événement
 *
 * @returns Nombre de webhooks qui ont répondu 2xx (pour audit). Jamais d'exception.
 */
export async function dispatchWebhook(
  event: string,
  data: Record<string, unknown>,
): Promise<number> {
  try {
    const endpoints = await getEndpointsForEvent(event)
    if (endpoints.length === 0) {
      // Aucun endpoint abonné — sortie rapide, pas de log bruyant
      return 0
    }

    const payload: WebhookPayload = {
      source: 'feedbackpro',
      event,
      timestamp: new Date().toISOString(),
      data,
    }

    console.log(
      `[webhook-dispatcher] Dispatch "${event}" vers ${endpoints.length} webhook(s)`,
    )

    const results = await Promise.allSettled(
      endpoints.map((ep) => sendToWebhook(ep.url, payload)),
    )
    const ok = results.filter(
      (r) => r.status === 'fulfilled' && r.value === true,
    ).length
    return ok
  } catch (err) {
    console.error('[webhook-dispatcher] Erreur inattendue :', err)
    return 0
  }
}

/**
 * Envoie un payload de test à un endpoint donné (pour le bouton "Test"
 * dans l'UI admin). Contourne la vérification d'événements abonnés.
 */
export async function sendTestWebhook(
  url: string,
  name: string,
): Promise<{ ok: boolean; status?: number; error?: string }> {
  try {
    const payload: WebhookPayload = {
      source: 'feedbackpro',
      event: 'test',
      timestamp: new Date().toISOString(),
      data: {
        message: `Test webhook — endpoint "${name}"`,
        note: 'Ceci est un test automatique envoyé depuis le dashboard admin.',
      },
    }
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'FeedVoice-Webhooks/1.0',
        'X-FeedVoice-Event': 'test',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      return { ok: false, status: res.status, error: detail.slice(0, 200) }
    }
    return { ok: true, status: res.status }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}
