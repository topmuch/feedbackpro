// ============================================================
// /api/vip/settings — Configuration du tenant lounge
// ------------------------------------------------------------
// GET : config complète (public en lecture — les vues client/staff
//       doivent connaître modulesEnabled, DND, réglages Denise).
// PUT : (session PRO requise) merge par section + clamp DUR :
//       - volume Denise plafonné à 30% côté serveur (impossible de
//         monter plus, même en forgeant la requête)
//       - validation des bornes numériques
//       Audit trail à chaque modification.
// Stockage : VipTenantConfig.config + deniseSettings (JSONB-like).
// ============================================================

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, getSessionUser } from '@/lib/session'
import {
  chargerVipConfig,
  mergeConfigValide,
} from '@/lib/vip-settings'
import { logAudit } from '@/lib/vip-clients'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const { config, deniseSettings, updatedAt } = await chargerVipConfig()
  return ok({ config, deniseSettings, updatedAt: updatedAt.toISOString() })
}

export async function PUT(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user) return fail('Non authentifié', 401)

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return fail('Body JSON invalide', 400)

  const result = await mergeConfigValide(body.config, body.deniseSettings)
  if ('erreur' in result) return fail(result.erreur, 400)

  const saved = await db.vipTenantConfig.upsert({
    where: { loungeKey: 'lounge' },
    create: {
      loungeKey: 'lounge',
      config: JSON.stringify(result.config),
      deniseSettings: JSON.stringify(result.deniseSettings),
    },
    update: {
      config: JSON.stringify(result.config),
      deniseSettings: JSON.stringify(result.deniseSettings),
    },
  })

  await logAudit({
    actor: user.email,
    actorRole: 'PRO',
    action: 'SETTINGS_MODIFIEES',
    cible: 'tenant lounge',
    detail: `Sections : ${[
      body.config ? Object.keys(body.config).join(', ') : '',
      body.deniseSettings ? 'denise' : '',
    ].filter(Boolean).join(' + ') || '—'}`,
  })

  return ok({
    config: result.config,
    deniseSettings: result.deniseSettings,
    updatedAt: saved.updatedAt.toISOString(),
  })
}
