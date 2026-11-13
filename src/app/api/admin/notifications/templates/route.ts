// ============================================================
// API Superadmin — Notification Templates (déclencheurs)
// ------------------------------------------------------------
// GET  /api/admin/notifications/templates
//   → renvoie tous les NotificationTemplate (5 déclencheurs)
//   → seed les templates par défaut si la table est vide
// POST /api/admin/notifications/templates
//   body: { trigger, label, channels[], template, recipient, active }
//   → upsert un NotificationTemplate
// ============================================================

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail } from '@/lib/session'
import { requireAdmin, unauthorized } from '@/lib/guards'

export const runtime = 'nodejs'

/** Triggers valides (doivent matcher les déclencheurs du métier). */
const TRIGGERS_VALIDES = [
  'new_incident',
  'assigned',
  'resolved',
  'escalation_15min',
  'escalation_30min',
] as const
type Trigger = (typeof TRIGGERS_VALIDES)[number]

/** Destinataires valides pour un template. */
const RECIPIENTS_VALIDES = ['assigned_staff', 'terminal_staff', 'supervisor'] as const
type Recipient = (typeof RECIPIENTS_VALIDES)[number]

/** Templates par défaut au premier seed. */
const TEMPLATES_DEFAUT: {
  trigger: Trigger
  label: string
  channels: string[]
  template: string
  recipient: Recipient
  active: boolean
}[] = [
  {
    trigger: 'new_incident',
    label: 'Nouvel Incident',
    channels: ['push_pwa', 'sms_mtarget'],
    template: 'Incident {TYPE} a {ZONE}. Lien : {LIEN_DIRECT}',
    recipient: 'assigned_staff',
    active: true,
  },
  {
    trigger: 'assigned',
    label: 'Prise en charge',
    channels: ['push_pwa'],
    template: 'Incident pris en charge par {STAFF_NOM}',
    recipient: 'assigned_staff',
    active: true,
  },
  {
    trigger: 'resolved',
    label: 'Résolution',
    channels: ['push_pwa'],
    template: 'Incident résolu en {TEMPS}',
    recipient: 'assigned_staff',
    active: true,
  },
  {
    trigger: 'escalation_15min',
    label: 'Escalade 15 min',
    channels: ['sms_mtarget', 'push_pwa'],
    template: 'URGENT: Incident {TYPE} non résolu depuis 15 min à {ZONE}',
    recipient: 'supervisor',
    active: true,
  },
  {
    trigger: 'escalation_30min',
    label: 'Escalade 30 min',
    channels: ['sms_mtarget', 'whatsapp', 'email'],
    template: 'CRITIQUE: Incident {INCIDENT_ID} non résolu depuis 30 min',
    recipient: 'supervisor',
    active: true,
  },
]

/**
 * Garantit que les 5 NotificationTemplate par défaut existent en base.
 * Idempotent : ne crée que les triggers manquants.
 */
async function seedSiVide(): Promise<void> {
  const existants = await db.notificationTemplate.findMany()
  const manquants = TEMPLATES_DEFAUT.filter(
    (t) => !existants.some((e) => e.trigger === t.trigger),
  )
  if (manquants.length === 0) return

  await Promise.all(
    manquants.map((t) =>
      db.notificationTemplate.create({
        data: {
          trigger: t.trigger,
          label: t.label,
          channels: JSON.stringify(t.channels),
          template: t.template,
          recipient: t.recipient,
          active: t.active,
        },
      }),
    ),
  )
  console.log(`[notif-templates] Seed: ${manquants.length} template(s) créé(s)`)
}

// ---------- GET ----------

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req)
  if (!admin) return unauthorized()

  await seedSiVide()
  const templates = await db.notificationTemplate.findMany({
    orderBy: { trigger: 'asc' },
  })

  const data = templates.map((t) => ({
    id: t.id,
    trigger: t.trigger,
    label: t.label,
    channels: safeParseArray(t.channels),
    template: t.template,
    recipient: t.recipient,
    active: t.active,
    updatedAt: t.updatedAt,
  }))

  return ok({ templates: data })
}

// ---------- POST ----------

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req)
  if (!admin) return unauthorized()

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return fail('Payload JSON invalide', 400)
  }

  const b = body as {
    trigger?: string
    label?: string
    channels?: unknown
    template?: string
    recipient?: string
    active?: boolean
  }

  if (!b.trigger || !TRIGGERS_VALIDES.includes(b.trigger as Trigger)) {
    return fail(`Trigger invalide (attendu: ${TRIGGERS_VALIDES.join(', ')})`, 400)
  }
  if (!b.label || typeof b.label !== 'string' || b.label.trim().length === 0) {
    return fail('Champ "label" requis', 400)
  }
  if (typeof b.template !== 'string') {
    return fail('Champ "template" requis (chaîne)', 400)
  }
  if (b.recipient && !RECIPIENTS_VALIDES.includes(b.recipient as Recipient)) {
    return fail(`Recipient invalide (attendu: ${RECIPIENTS_VALIDES.join(', ')})`, 400)
  }

  // Validation des channels : doit être un tableau de chaînes
  let channelsStr = '[]'
  if (b.channels !== undefined) {
    if (!Array.isArray(b.channels) || !b.channels.every((c) => typeof c === 'string')) {
      return fail('Champ "channels" doit être un tableau de chaînes', 400)
    }
    channelsStr = JSON.stringify(b.channels)
  }

  const trigger = b.trigger as Trigger
  const recipient = (b.recipient as Recipient) ?? 'assigned_staff'
  const active = typeof b.active === 'boolean' ? b.active : true

  const template = await db.notificationTemplate.upsert({
    where: { trigger },
    update: {
      label: b.label.trim(),
      channels: channelsStr,
      template: b.template,
      recipient,
      active,
    },
    create: {
      trigger,
      label: b.label.trim(),
      channels: channelsStr,
      template: b.template,
      recipient,
      active,
    },
  })

  return ok({
    template: {
      id: template.id,
      trigger: template.trigger,
      label: template.label,
      channels: safeParseArray(template.channels),
      template: template.template,
      recipient: template.recipient,
      active: template.active,
      updatedAt: template.updatedAt,
    },
  })
}

// ---------- Helpers ----------

function safeParseArray(json: string): string[] {
  try {
    const arr = JSON.parse(json)
    return Array.isArray(arr) ? arr.filter((c) => typeof c === 'string') : []
  } catch {
    return []
  }
}
