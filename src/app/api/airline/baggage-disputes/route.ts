// ============================================================
// /api/airline/baggage-disputes — Module Compagnie (TENANT-3)
// ------------------------------------------------------------
// GET    : liste des litiges bagages (BaggageDispute).
// PATCH  : mise à jour du statut (open → resolved | escalated).
//          Body : { id, status }
// ============================================================

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, getSessionUser } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const STATUTS_VALIDES = new Set(['open', 'resolved', 'escalated'])

export async function GET(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user) return fail('Non authentifié', 401)

  const disputes = await db.baggageDispute.findMany({
    orderBy: { createdAt: 'desc' },
    take: 100,
  })

  return ok(
    disputes.map((d) => ({
      id: d.id,
      flightNumber: d.flightNumber ?? null,
      passengerName: d.passengerName ?? null,
      description: d.description,
      photoUrl: d.photoUrl ?? null,
      status: d.status as 'open' | 'resolved' | 'escalated',
      reportId: d.reportId ?? null,
      createdAt: d.createdAt.toISOString(),
      updatedAt: d.updatedAt.toISOString(),
    })),
  )
}

export async function PATCH(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user) return fail('Non authentifié', 401)

  const body = await req.json().catch(() => null)
  if (!body || typeof body.id !== 'string' || typeof body.status !== 'string') {
    return fail('Paramètres manquants (id + status)', 400)
  }
  if (!STATUTS_VALIDES.has(body.status)) {
    return fail('Statut invalide', 400)
  }

  const existing = await db.baggageDispute.findUnique({ where: { id: body.id } })
  if (!existing) return fail('Litige introuvable', 404)

  const nextStatus = body.status as 'open' | 'resolved' | 'escalated'
  await db.baggageDispute.update({
    where: { id: body.id },
    data: { status: nextStatus },
  })

  return ok({ id: body.id, status: nextStatus })
}
