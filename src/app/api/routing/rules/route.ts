// ============================================================
// /api/routing/rules — Matrice de Routage (Le Cerveau)
// ------------------------------------------------------------
// GET    : liste des règles (superadmin)
// POST   : upsert d'une règle (superadmin) — si body.id présent →
//          mise à jour, sinon création.
// DELETE : ?id=… (superadmin)
// ============================================================

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail } from '@/lib/session'
import { requireAdmin, unauthorized } from '@/lib/guards'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req)
  if (!admin) return unauthorized()
  const tenantKey = req.nextUrl.searchParams.get('tenant') ?? 'vip_lounge'
  const rules = await db.routingRule.findMany({
    where: { tenantKey },
    orderBy: [{ rulePriority: 'desc' }, { createdAt: 'asc' }],
  })
  return ok({ rules })
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req)
  if (!admin) return unauthorized()

  const body = await req.json().catch(() => null)
  if (!body) return fail('Payload JSON invalide', 400)

  const data = {
    tenantKey: typeof body.tenantKey === 'string' ? body.tenantKey : 'vip_lounge',
    zoneCode: body.zoneCode === undefined ? null : (body.zoneCode || null),
    signalType: body.signalType === undefined ? null : (body.signalType || null),
    priority: ['low', 'medium', 'high', 'critical'].includes(body.priority) ? body.priority : 'medium',
    targetCategory: typeof body.targetCategory === 'string' && body.targetCategory ? body.targetCategory : 'serveur',
    targetStaffIds: JSON.stringify(Array.isArray(body.targetStaffIds) ? body.targetStaffIds : []),
    fallbackCategory: body.fallbackCategory || null,
    escalationAfterMin: Number.isFinite(Number(body.escalationAfterMin)) ? Math.max(0, Math.round(Number(body.escalationAfterMin))) : 10,
    escalationTarget: body.escalationTarget === 'director' ? 'director' : 'manager',
    deniseAnnounce: body.deniseAnnounce !== false,
    deniseTone: ['soft', 'normal', 'urgent'].includes(body.deniseTone) ? body.deniseTone : 'normal',
    rulePriority: Number.isFinite(Number(body.rulePriority)) ? Math.round(Number(body.rulePriority)) : 1,
    active: body.active !== false,
  }

  try {
    const rule = body.id
      ? await db.routingRule.update({ where: { id: body.id }, data })
      : await db.routingRule.create({ data })
    return ok({ rule })
  } catch {
    return fail('Règle introuvable ou invalide', 400)
  }
}

export async function DELETE(req: NextRequest) {
  const admin = await requireAdmin(req)
  if (!admin) return unauthorized()
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return fail('Paramètre id manquant', 400)
  try {
    await db.routingRule.delete({ where: { id } })
    return ok({ deleted: id })
  } catch {
    return fail('Règle introuvable', 404)
  }
}
