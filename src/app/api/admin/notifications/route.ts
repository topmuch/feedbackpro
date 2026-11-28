// ============================================================
// API Superadmin — Centre de Notifications (vue agrégée)
// ------------------------------------------------------------
// GET   /api/admin/notifications
//   → renvoie TOUS les NotificationTemplate, regroupés par tenantType.
//   Shape de réponse :
//     {
//       ok: true,
//       data: {
//         templates: NotificationTemplate[],     // tous, triés par trigger
//         byTenant: {
//           airport:    NotificationTemplate[],
//           city:       NotificationTemplate[],
//           vip_lounge: NotificationTemplate[],
//           classic:    NotificationTemplate[],
//           airline:    NotificationTemplate[],
//           platform:   NotificationTemplate[],
//         },
//       },
//     }
//
// PATCH /api/admin/notifications
//   body: { trigger: string, active?: boolean, channels?: string[] }
//   → met à jour le toggle `active` (on/off) et/ou les `channels`
//     (quels canaux utiliser pour ce déclencheur).
//   → renvoie le template mis à jour (même forme que GET).
//
// Note : les routes dédiées /templates, /settings, /logs, /test restent
// disponibles pour la granularité fine (CRUD complet des templates,
// config des canaux, historique). Ce route agrège la lecture pour
// afficher un centre de notifications "tenant-aware".
// ============================================================

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, getSessionUser } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Les 6 tenant types officiels du système multi-tenant (cf. schema.prisma). */
const TENANT_TYPES = [
  'airport',
  'city',
  'vip_lounge',
  'classic',
  'airline',
  'platform',
] as const

/** Canaux valides (doivent matcher NotificationSetting.canal). */
const CANAUX_VALIDES = ['email', 'whatsapp', 'sms_mtarget', 'push_pwa'] as const

/**
 * Garantit que les 5 NotificationTemplate par défaut existent en base.
 * Idempotent : ne crée que les triggers manquants. Miroir de la logique
 * de /api/admin/notifications/templates (le seed doit aussi tourner ici
 * pour que le GET renvoie toujours les 5 triggers même si la route
 * sœur n'a jamais été appelée).
 */
async function seedTemplatesSiVide(): Promise<void> {
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
          tenantType: t.tenantType,
          active: t.active,
        },
      }),
    ),
  )
  console.log(
    `[admin/notifications] Seed: ${manquants.length} template(s) créé(s)`,
  )
}

/** Templates par défaut (miroir de /templates/route.ts — tenant airport). */
const TEMPLATES_DEFAUT: {
  trigger: string
  label: string
  channels: string[]
  template: string
  recipient: string
  tenantType: string
  active: boolean
}[] = [
  {
    trigger: 'new_incident',
    label: 'Nouvel Incident',
    channels: ['push_pwa', 'sms_mtarget'],
    template: 'Incident {TYPE} a {ZONE}. Lien : {LIEN_DIRECT}',
    recipient: 'assigned_staff',
    tenantType: 'airport',
    active: true,
  },
  {
    trigger: 'assigned',
    label: 'Prise en charge',
    channels: ['push_pwa'],
    template: 'Incident pris en charge par {STAFF_NOM}',
    recipient: 'assigned_staff',
    tenantType: 'airport',
    active: true,
  },
  {
    trigger: 'resolved',
    label: 'Résolution',
    channels: ['push_pwa'],
    template: 'Incident resolu en {TEMPS}',
    recipient: 'assigned_staff',
    tenantType: 'airport',
    active: true,
  },
  {
    trigger: 'escalation_15min',
    label: 'Escalade 15 min',
    channels: ['sms_mtarget', 'push_pwa'],
    template: 'URGENT: Incident {TYPE} non resolu depuis 15min a {ZONE}',
    recipient: 'supervisor',
    tenantType: 'airport',
    active: true,
  },
  {
    trigger: 'escalation_30min',
    label: 'Escalade 30 min',
    channels: ['sms_mtarget', 'whatsapp', 'email'],
    template: 'CRITIQUE: Incident {INCIDENT_ID} non resolu depuis 30min',
    recipient: 'supervisor',
    tenantType: 'airport',
    active: true,
  },
]

/** Sérialise un NotificationTemplate Prisma en DTO stable pour le frontend. */
function serializeTemplate(t: {
  id: string
  trigger: string
  label: string
  tenantType: string
  channels: string
  template: string
  recipient: string
  description: string | null
  active: boolean
  createdAt: Date
  updatedAt: Date
}) {
  return {
    id: t.id,
    trigger: t.trigger,
    label: t.label,
    tenantType: t.tenantType,
    channels: safeParseArray(t.channels),
    template: t.template,
    recipient: t.recipient,
    description: t.description,
    active: t.active,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  }
}

function safeParseArray(json: string): string[] {
  try {
    const arr = JSON.parse(json)
    return Array.isArray(arr) ? arr.filter((c) => typeof c === 'string') : []
  } catch {
    return []
  }
}

// ---------- GET ----------

export async function GET(req: NextRequest) {
  // Garde-fou : réservé au superadmin. On utilise getSessionUser
  // directement (sans requireAdmin) pour rester aligné avec le
  // pattern demandé par le contrat de l'API.
  const user = await getSessionUser(req)
  if (!user || user.role !== 'SUPERADMIN') {
    return fail('Non autorise', 401)
  }

  // Seed des 5 templates par defaut (idempotent) — garantit que la
  // reponse n'est jamais vide meme au premier appel.
  await seedTemplatesSiVide()

  const templates = await db.notificationTemplate.findMany({
    orderBy: [{ tenantType: 'asc' }, { trigger: 'asc' }],
  })

  // Groupage par tenantType — on initialise les 6 cles attendues
  // a [] pour garantir une shape stable (le frontend peut mapper
  // dessus sans check hasOwnProperty).
  const byTenant: Record<string, ReturnType<typeof serializeTemplate>[]> = {}
  for (const t of TENANT_TYPES) byTenant[t] = []
  for (const t of templates) {
    const dto = serializeTemplate(t)
    if (byTenant[dto.tenantType]) {
      byTenant[dto.tenantType].push(dto)
    } else {
      // tenantType inconnu (custom) — on l'ajoute dynamiquement
      // plutot que de le perdre silencieusement.
      byTenant[dto.tenantType] = [dto]
    }
  }

  return ok({
    templates: templates.map(serializeTemplate),
    byTenant,
  })
}

// ---------- PATCH ----------

export async function PATCH(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user || user.role !== 'SUPERADMIN') {
    return fail('Non autorise', 401)
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return fail('Payload JSON invalide', 400)
  }

  const b = body as {
    trigger?: unknown
    active?: unknown
    channels?: unknown
  }

  if (typeof b.trigger !== 'string' || b.trigger.trim().length === 0) {
    return fail('Champ "trigger" requis (string non vide)', 400)
  }

  const trigger = b.trigger.trim()

  // Au moins un des deux champs updatable doit etre present.
  const hasActive = typeof b.active === 'boolean'
  const hasChannels = Array.isArray(b.channels)
  if (!hasActive && !hasChannels) {
    return fail(
      'Aucun champ a mettre a jour. Fournir "active" (boolean) et/ou "channels" (string[]).',
      400,
    )
  }

  // Validation des channels : doit etre un tableau de chaines parmi
  // les canaux valides. On tolere les chaines vides (filtrees) pour
  // eviter de breaker si le frontend envoie un tableau pollue.
  if (hasChannels) {
    if (!(b.channels as unknown[]).every((c) => typeof c === 'string')) {
      return fail('Champ "channels" doit etre un tableau de chaines', 400)
    }
    const invalid = (b.channels as string[]).filter(
      (c) => c && !CANAUX_VALIDES.includes(c as (typeof CANAUX_VALIDES)[number]),
    )
    if (invalid.length > 0) {
      return fail(
        `Canaux invalides: ${invalid.join(', ')}. Attendus: ${CANAUX_VALIDES.join(', ')}`,
        400,
      )
    }
  }

  // Charge le template existant (pour appliquer un update partiel
  // sans ecraser les champs non fournis).
  const existing = await db.notificationTemplate.findUnique({
    where: { trigger },
  })
  if (!existing) {
    return fail(`Template introuvable pour le trigger "${trigger}"`, 404)
  }

  // Construit le payload d'update — uniquement les champs fournis.
  const update: { active?: boolean; channels?: string } = {}
  if (hasActive) update.active = b.active as boolean
  if (hasChannels) {
    // On filtre les chaines vides et on deduplique.
    const clean = Array.from(
      new Set((b.channels as string[]).filter((c) => c.trim().length > 0)),
    )
    update.channels = JSON.stringify(clean)
  }

  const updated = await db.notificationTemplate.update({
    where: { trigger },
    data: update,
  })

  return ok({ template: serializeTemplate(updated) })
}
