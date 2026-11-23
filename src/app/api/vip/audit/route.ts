// ============================================================
// /api/vip/audit — Journal d'audit des actions (checklist livraison)
// ------------------------------------------------------------
// GET : dernières actions tracées (détection VIP, prise en charge
// d'alertes, purge RGPD, imports CSV, modifications clients,
// modifications paramètres, rapports mensuels...).
// Lecture réservée à la session PRO du lounge.
// ============================================================

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, getSessionUser } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user) return fail('Non authentifié', 401)

  const { searchParams } = new URL(req.url)
  const take = Math.min(100, Math.max(1, parseInt(searchParams.get('take') ?? '30', 10) || 30))
  const action = searchParams.get('action')?.trim()

  const where: Record<string, unknown> = {}
  if (action) where.action = action

  const entries = await db.vipAuditTrail.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take,
  })

  return ok(
    entries.map((e) => ({
      id: e.id,
      actor: e.actor,
      actorRole: e.actorRole,
      action: e.action,
      cible: e.cible,
      detail: e.detail,
      createdAt: e.createdAt.toISOString(),
    })),
  )
}
