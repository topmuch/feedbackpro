// ============================================================
// GET  /api/admin/webhooks  — liste tous les webhooks
// POST /api/admin/webhooks  — crée un nouveau webhook
// ------------------------------------------------------------
// Body POST attendu :
//   { name: string, url: string, events?: string[] }
//
// Réponses :
//   200 { ok: true, data: { webhooks: [...] } }            (GET)
//   201 { ok: true, data: { webhook } }                    (POST)
//   400 { ok: false, error: string }
// ============================================================

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail } from '@/lib/session'
import {
  serializeWebhookEvents,
  parseWebhookEvents,
  WEBHOOK_EVENTS,
} from '@/lib/webhook-dispatcher'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function isValidUrl(s: string): boolean {
  try {
    const u = new URL(s)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

export async function GET() {
  const rows = await db.webhookEndpoint.findMany({
    orderBy: { createdAt: 'desc' },
  })
  return ok({
    webhooks: rows.map((r) => ({
      id: r.id,
      name: r.name,
      url: r.url,
      events: parseWebhookEvents(r.events),
      active: r.active,
      createdAt: r.createdAt.toISOString(),
    })),
    availableEvents: WEBHOOK_EVENTS,
  })
}

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return fail('Payload JSON invalide', 400)
  }

  const b = body as {
    name?: unknown
    url?: unknown
    events?: unknown
    active?: unknown
  }

  const name =
    typeof b.name === 'string' ? b.name.trim().slice(0, 80) : ''
  if (!name) {
    return fail('`name` est requis (max 80 caractères)', 400)
  }

  const url = typeof b.url === 'string' ? b.url.trim().slice(0, 500) : ''
  if (!url) {
    return fail('`url` est requis', 400)
  }
  if (!isValidUrl(url)) {
    return fail('`url` doit être une URL http(s) valide', 400)
  }

  // Normalisation des events : on ne garde que ceux connus
  let events: string[] = []
  if (Array.isArray(b.events)) {
    events = b.events
      .filter((e) => typeof e === 'string' && WEBHOOK_EVENTS.includes(e as never))
      .map((e) => e as string)
  }

  const active = b.active === false ? false : true

  const created = await db.webhookEndpoint.create({
    data: {
      name,
      url,
      events: serializeWebhookEvents(events),
      active,
    },
  })

  console.log(`[admin/webhooks] Webhook créé : ${created.name} → ${url.slice(0, 60)}…`)

  return ok(
    {
      webhook: {
        id: created.id,
        name: created.name,
        url: created.url,
        events: parseWebhookEvents(created.events),
        active: created.active,
        createdAt: created.createdAt.toISOString(),
      },
    },
    201,
  )
}
