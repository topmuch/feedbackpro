import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// PATCH /api/city/incidents/[id] — Update status (take charge / resolve)
// Body accepts: status, staffName, arrivedAt (ISO), beforePhoto, afterPhoto.
// SLA photos are persisted as-is (data URL base64) for transparency to citizens.
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

  // SLA : scan d'arrivée agent (timestamp ISO)
  if (body.arrivedAt !== undefined && body.arrivedAt !== null) {
    if (typeof body.arrivedAt === 'string') {
      const parsed = new Date(body.arrivedAt)
      if (!isNaN(parsed.getTime())) {
        data.arrivedAt = parsed
      }
    } else if (body.arrivedAt === true) {
      // Shortcut: "marquer pris en charge maintenant"
      data.arrivedAt = new Date()
    }
  }

  // SLA : photo avant intervention (data URL)
  if (typeof body.beforePhoto === 'string') {
    const trimmed = body.beforePhoto.trim()
    data.beforePhoto = trimmed.length > 0 ? trimmed : null
  }

  // SLA : photo après intervention (data URL)
  if (typeof body.afterPhoto === 'string') {
    const trimmed = body.afterPhoto.trim()
    data.afterPhoto = trimmed.length > 0 ? trimmed : null
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
    arrivedAt: updated.arrivedAt?.toISOString() ?? null,
    beforePhoto: updated.beforePhoto ?? null,
    afterPhoto: updated.afterPhoto ?? null,
    updatedAt: updated.updatedAt.toISOString(),
  })
}
