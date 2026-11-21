// ============================================================
// POST /api/routing/tick — Battement du moteur (orchestration)
// ------------------------------------------------------------
// Appelé par le polling des dashboards (manager / wallboard) :
//   1. Balaye les tâches assignées non prises en charge après
//      rule.escalationAfterMin → escalade + alertes
//   2. Exécute les tâches proactives arrivées à échéance
//      (création + routage + planification suivante)
//
// Renvoie : escalades fraîches + tâches créées + file Denise urgent.
// ============================================================

import { NextRequest } from 'next/server'
import { ok, fail, getSessionUser } from '@/lib/session'
import { balayerEscalades, executerTickProactif } from '@/lib/routing-engine'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user) return fail('Non authentifié', 401)

  const body = await req.json().catch(() => ({}))
  const tenantKey = typeof body?.tenantKey === 'string' ? body.tenantKey : 'vip_lounge'

  const escalades = await balayerEscalades(tenantKey)
  const { creees } = await executerTickProactif(tenantKey)

  const deniseQueue = [
    ...escalades.map((e) => ({
      tone: 'urgent' as const,
      message: `Alerte : ${e.staffName} n'a pas pris en charge « ${e.label} ». Escalade vers manager.`,
    })),
    ...creees.map((c) => ({
      tone: 'normal' as const,
      message: `Tâche proactive : ${c.title}. Assignée à ${c.staffName ?? 'le manager'}.`,
    })),
  ]

  return ok({ escalades, proactiveCreees: creees, deniseQueue, tickedAt: new Date().toISOString() })
}
