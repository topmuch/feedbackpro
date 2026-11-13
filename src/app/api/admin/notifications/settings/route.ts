// ============================================================
// API Superadmin — Notification Settings (canaux de communication)
// ------------------------------------------------------------
// GET  /api/admin/notifications/settings
//   → renvoie tous les NotificationSetting (4 canaux)
//   → seed les valeurs par défaut si la table est vide
// POST /api/admin/notifications/settings
//   body: { canal, active, config }
//   → upsert un NotificationSetting (active le canal + sauve la config JSON)
// ============================================================

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail } from '@/lib/session'
import { requireAdmin, unauthorized } from '@/lib/guards'

export const runtime = 'nodejs'

/** Canaux supportés par le centre de notifications. */
const CANAUX = ['email', 'whatsapp', 'sms_mtarget', 'push_pwa'] as const
type Canal = (typeof CANAUX)[number]

/** Configurations par défaut au premier seed (aucune clé API — mode démo). */
const CONFIG_DEFAUT: Record<Canal, Record<string, string>> = {
  email: {
    provider: 'resend',
    fromName: 'FeedbackPro Alertes',
    fromEmail: 'alertes@feedbackpro.sn',
  },
  whatsapp: {
    provider: 'meta',
    phoneNumberId: '',
    templateId: 'incident_alert_staff',
  },
  sms_mtarget: {
    endpoint: 'https://api.mtarget.sn/v1/sms/send',
    login: '',
    password: '',
    senderId: 'FBKPRO',
    defaultCountryCode: '221',
  },
  push_pwa: {
    provider: 'web-push',
    appId: '',
  },
}

/** Seed : active par défaut email + push_pwa, laisse whatsapp + sms_mtarget inactifs. */
const ACTIVE_DEFAUT: Record<Canal, boolean> = {
  email: true,
  push_pwa: true,
  whatsapp: false,
  sms_mtarget: false,
}

/**
 * Garantit que les 4 NotificationSetting existent en base.
 * Si la table est vide au premier appel, on crée les 4 lignes avec les
 * valeurs par défaut (email + push actifs, sms + whatsapp inactifs).
 * Idempotent : ne crée que les canaux manquants.
 */
async function seedSiVide(): Promise<void> {
  const existants = await db.notificationSetting.findMany()
  const manquants = CANAUX.filter((c) => !existants.some((e) => e.canal === c))
  if (manquants.length === 0) return

  await Promise.all(
    manquants.map((canal) =>
      db.notificationSetting.create({
        data: {
          canal,
          active: ACTIVE_DEFAUT[canal],
          config: JSON.stringify(CONFIG_DEFAUT[canal]),
        },
      }),
    ),
  )
  console.log(`[notif-settings] Seed: ${manquants.length} canal/canaux créés`)
}

// ---------- GET ----------

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req)
  if (!admin) return unauthorized()

  await seedSiVide()
  const settings = await db.notificationSetting.findMany({
    orderBy: { canal: 'asc' },
  })

  // On parse la config JSON pour le frontend (évite un JSON.parse côté client)
  const data = settings.map((s) => ({
    id: s.id,
    canal: s.canal,
    active: s.active,
    config: safeParseConfig(s.config),
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  }))

  return ok({ settings: data })
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

  const b = body as { canal?: string; active?: boolean; config?: unknown }
  if (!b.canal || !CANAUX.includes(b.canal as Canal)) {
    return fail(`Canal invalide (attendu: ${CANAUX.join(', ')})`, 400)
  }
  if (typeof b.active !== 'boolean') {
    return fail('Champ "active" requis (booléen)', 400)
  }

  // La config doit être un objet sérialisable en JSON
  let configStr = '{}'
  if (b.config !== undefined && b.config !== null) {
    if (typeof b.config !== 'object' || Array.isArray(b.config)) {
      return fail('Champ "config" doit être un objet JSON', 400)
    }
    try {
      configStr = JSON.stringify(b.config)
    } catch {
      return fail('Config non sérialisable en JSON', 400)
    }
  }

  const canal = b.canal as Canal
  const setting = await db.notificationSetting.upsert({
    where: { canal },
    update: { active: b.active, config: configStr },
    create: { canal, active: b.active, config: configStr },
  })

  return ok({
    setting: {
      id: setting.id,
      canal: setting.canal,
      active: setting.active,
      config: safeParseConfig(setting.config),
      updatedAt: setting.updatedAt,
    },
  })
}

// ---------- Helpers ----------

function safeParseConfig(json: string): Record<string, unknown> {
  try {
    return JSON.parse(json) as Record<string, unknown>
  } catch {
    return {}
  }
}
