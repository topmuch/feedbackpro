// ============================================================
// /api/vip/tables/[id] — Mise à jour d'une VipTable
// ------------------------------------------------------------
// PATCH : met à jour le statut (free/occupied/problem/reserved),
//         le clientName, le clientVipLevel et l'arrivedAt.
//         Body accepté : { status?, clientName?, clientVipLevel?, arrivedAt? }
//
// Règles métier :
//  - Quand on libère une table (status=free) → on vide clientName,
//    clientVipLevel et arrivedAt.
//  - Quand on marque occupée sans arrivedAt → on pose la date du jour.
// ============================================================

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, getSessionUser } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const STATUTS_VALIDES = new Set(['free', 'occupied', 'problem', 'reserved'])
const VIP_LEVELS_VALIDES = new Set(['gold', 'platinum', 'diamond'])

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser(req)
  if (!user) return fail('Non authentifié', 401)

  const { id } = await params
  if (!id) return fail('ID manquant', 400)

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return fail('Body JSON invalide', 400)
  }

  const table = await db.vipTable.findUnique({ where: { id } })
  if (!table) return fail('Table introuvable', 404)

  const data: Record<string, unknown> = {}

  if (typeof body.status === 'string') {
    if (!STATUTS_VALIDES.has(body.status)) {
      return fail(`Statut invalide (free | occupied | problem | reserved)`, 400)
    }
    data.status = body.status
    // Libération → on nettoie les champs client
    if (body.status === 'free') {
      data.clientName = null
      data.clientVipLevel = null
      data.arrivedAt = null
    } else if (body.status === 'occupied' && !table.arrivedAt && body.arrivedAt === undefined) {
      // Première occupation sans arrivedAt explicite → on pose maintenant
      data.arrivedAt = new Date()
    }
  }

  if (typeof body.clientName === 'string') {
    data.clientName = body.clientName.trim() || null
  } else if (body.clientName === null) {
    data.clientName = null
  }

  if (typeof body.clientVipLevel === 'string') {
    if (!VIP_LEVELS_VALIDES.has(body.clientVipLevel)) {
      return fail('Niveau VIP invalide (gold | platinum | diamond)', 400)
    }
    data.clientVipLevel = body.clientVipLevel
  } else if (body.clientVipLevel === null) {
    data.clientVipLevel = null
  }

  if (typeof body.arrivedAt === 'string') {
    const d = new Date(body.arrivedAt)
    if (!isNaN(d.getTime())) data.arrivedAt = d
  } else if (body.arrivedAt === null) {
    data.arrivedAt = null
  }

  if (Object.keys(data).length === 0) {
    return fail('Aucun champ à mettre à jour', 400)
  }

  const updated = await db.vipTable.update({ where: { id }, data })

  // Recalcul des demandes actives pour la réponse
  const activeRequests = await db.vipTableRequest.count({
    where: { tableId: id, status: { in: ['pending', 'in_progress'] } },
  })

  return ok({
    id: updated.id,
    tableNumber: updated.tableNumber,
    zone: updated.zone,
    seats: updated.seats,
    status: updated.status,
    qrToken: updated.qrToken,
    clientName: updated.clientName,
    clientVipLevel: updated.clientVipLevel,
    arrivedAt: updated.arrivedAt?.toISOString() ?? null,
    activeRequests,
    updatedAt: updated.updatedAt.toISOString(),
  })
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser(req)
  if (!user) return fail('Non authentifié', 401)

  const { id } = await params
  if (!id) return fail('ID manquant', 400)

  const table = await db.vipTable.findUnique({ where: { id } })
  if (!table) return fail('Table introuvable', 404)

  // On supprime en cascade (les requests sont ON DELETE CASCADE dans le schéma)
  await db.vipTable.delete({ where: { id } })
  return ok({ id })
}
