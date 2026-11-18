import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, getSessionUser } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// PATCH /api/vip/lost-found/[id] — Update status (claimed | returned)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser(req)
  if (!user) return fail('Non authentifié', 401)

  const { id } = await params
  if (!id) return fail('ID manquant', 400)

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return fail('Body JSON invalide', 400)

  const current = await db.lostFoundItem.findUnique({ where: { id } })
  if (!current) return fail('Objet introuvable', 404)

  const data: Record<string, unknown> = {}
  if (typeof body.status === 'string' && ['found', 'claimed', 'returned'].includes(body.status)) {
    data.status = body.status
    if (body.status === 'claimed' && typeof body.claimedBy === 'string') {
      data.claimedBy = body.claimedBy
    }
    if (body.status === 'returned') {
      data.returnedAt = new Date()
    }
  } else {
    return fail('Statut invalide (found | claimed | returned)', 400)
  }

  const updated = await db.lostFoundItem.update({ where: { id }, data })
  return ok({
    id: updated.id,
    status: updated.status,
    claimedBy: updated.claimedBy,
    returnedAt: updated.returnedAt?.toISOString() ?? null,
  })
}
