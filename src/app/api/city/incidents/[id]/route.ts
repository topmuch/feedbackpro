import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// PATCH /api/city/incidents/[id] — Update status (take charge / resolve)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  if (!id) return fail('ID manquant', 400)

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return fail('Body JSON invalide', 400)

  const current = await db.cityIncident.findUnique({ where: { id } })
  if (!current) return fail('Incident introuvable', 404)

  const data: Record<string, unknown> = {}

  if (typeof body.status === 'string' && ['pending', 'assigned', 'in_progress', 'resolved'].includes(body.status)) {
    data.status = body.status
    if (body.status === 'resolved') {
      data.resolvedAt = new Date()
    }
  }

  if (typeof body.staffName === 'string') {
    data.staffName = body.staffName.trim() || null
  }

  if (Object.keys(data).length === 0) {
    return fail('Aucun champ à mettre à jour', 400)
  }

  const updated = await db.cityIncident.update({ where: { id }, data })
  return ok({
    id: updated.id,
    status: updated.status,
    staffName: updated.staffName,
    resolvedAt: updated.resolvedAt?.toISOString() ?? null,
    updatedAt: updated.updatedAt.toISOString(),
  })
}
