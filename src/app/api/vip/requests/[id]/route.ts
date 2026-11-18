// ============================================================
// /api/vip/requests/[id] — Mise à jour d'une VipTableRequest
// ------------------------------------------------------------
// PATCH : met à jour le statut (pending → in_progress → done) et
//         affecte un staffName.
//         Body : { status?, staffName? }
//
// Règle : quand on passe à "done", on décrémente activeRequests
//         de la table liée (si la demande n'était pas déjà done).
// ============================================================

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, getSessionUser } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const STATUS_VALIDES = new Set(['pending', 'in_progress', 'done'])

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

  const current = await db.vipTableRequest.findUnique({ where: { id } })
  if (!current) return fail('Demande introuvable', 404)

  const data: Record<string, unknown> = {}

  if (typeof body.status === 'string') {
    if (!STATUS_VALIDES.has(body.status)) {
      return fail('Statut invalide (pending | in_progress | done)', 400)
    }
    data.status = body.status
  }

  if (typeof body.staffName === 'string') {
    data.staffName = body.staffName.trim() || null
  } else if (body.staffName === null) {
    data.staffName = null
  }

  if (Object.keys(data).length === 0) {
    return fail('Aucun champ à mettre à jour', 400)
  }

  const updated = await db.vipTableRequest.update({ where: { id }, data })

  // Ajuster le compteur activeRequests de la table :
  // - Si on passe à "done" alors que la demande était active → décrémenter
  // - Si on repasse à pending/in_progress depuis done → incrémenter
  const wasActive = current.status === 'pending' || current.status === 'in_progress'
  const isNowActive = updated.status === 'pending' || updated.status === 'in_progress'
  if (!wasActive && isNowActive) {
    await db.vipTable.update({
      where: { id: current.tableId },
      data: { activeRequests: { increment: 1 } },
    })
  } else if (wasActive && !isNowActive) {
    await db.vipTable.update({
      where: { id: current.tableId },
      data: { activeRequests: { decrement: 1 } },
    })
  }

  return ok({
    id: updated.id,
    tableId: updated.tableId,
    type: updated.type,
    message: updated.message,
    status: updated.status,
    staffName: updated.staffName,
    createdAt: updated.createdAt.toISOString(),
    updatedAt: updated.updatedAt.toISOString(),
  })
}
