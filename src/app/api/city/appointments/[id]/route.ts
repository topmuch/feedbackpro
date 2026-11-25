// ============================================================
// /api/city/appointments/[id]
// ------------------------------------------------------------
// PATCH → met à jour le statut d'un RDV (confirmer/annuler/terminer)
// ============================================================

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const VALID_STATUSES = new Set(['pending', 'confirmed', 'cancelled', 'completed'])

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  if (!id) return fail('ID requis', 400)

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return fail('Payload JSON invalide', 400)
  }

  const b = body as { status?: string; assignedTo?: string; notes?: string }

  const data: Record<string, unknown> = {}
  if (b.status && VALID_STATUSES.has(b.status)) data.status = b.status
  if (typeof b.assignedTo === 'string') data.assignedTo = b.assignedTo.trim() || null
  if (typeof b.notes === 'string') data.notes = b.notes.trim().slice(0, 500)

  if (Object.keys(data).length === 0) {
    return fail('Aucun champ à mettre à jour', 400)
  }

  try {
    const updated = await db.cityAppointment.update({
      where: { id },
      data,
    })
    return ok({
      appointment: {
        id: updated.id,
        reference: updated.reference,
        status: updated.status,
        assignedTo: updated.assignedTo,
      },
    })
  } catch {
    return fail('Rendez-vous introuvable', 404)
  }
}
