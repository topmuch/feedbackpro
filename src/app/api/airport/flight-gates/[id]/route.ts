// ============================================================
// /api/airport/flight-gates/[id] — QR Dynamique Vol (Task D Phase 3)
// ------------------------------------------------------------
// PATCH → met à jour le statut / active / notes d'une assignation.
//         Cas d'usage :
//           - Marquer décollé        : { status: 'DEPARTED',  active: false }
//           - Retarder               : { status: 'DELAYED' }
//           - Annuler                : { status: 'CANCELLED', active: false }
//           - Mettre à jour les notes: { notes: '...' }
// DELETE → supprime complètement une assignation (cleanup).
//
// Réponse enveloppe ok/data via les helpers de session.ts.
// runtime = nodejs + force-dynamic → jamais mis en cache CDN.
// ============================================================

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const VALID_STATUSES = new Set(['BOARDING', 'DEPARTED', 'CANCELLED', 'DELAYED'])

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params
  if (!id) return fail('id manquant', 400)

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return fail('JSON invalide', 400)
  }

  const existing = await db.airportFlightGate.findUnique({ where: { id } })
  if (!existing) {
    return fail('Assignation introuvable', 404)
  }

  const data: {
    status?: string
    active?: boolean
    notes?: string | null
  } = {}

  if (typeof body.status === 'string') {
    const status = body.status.trim().toUpperCase()
    if (!VALID_STATUSES.has(status)) {
      return fail(
        `status invalide — attendu parmi BOARDING, DEPARTED, CANCELLED, DELAYED`,
        400,
      )
    }
    data.status = status
  }

  if (typeof body.active === 'boolean') {
    data.active = body.active
  }

  if (typeof body.notes === 'string') {
    const notes = body.notes.trim()
    data.notes = notes.length > 0 ? notes : null
  }

  if (Object.keys(data).length === 0) {
    return ok({ gate: existing })
  }

  const gate = await db.airportFlightGate.update({
    where: { id },
    data,
  })

  return ok({ gate })
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params
  if (!id) return fail('id manquant', 400)

  const existing = await db.airportFlightGate.findUnique({ where: { id } })
  if (!existing) {
    return fail('Assignation introuvable', 404)
  }

  await db.airportFlightGate.delete({ where: { id } })

  return ok({ deleted: id })
}
