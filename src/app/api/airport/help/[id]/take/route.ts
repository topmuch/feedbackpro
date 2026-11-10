// ============================================================
// POST /api/airport/help/[id]/take
// ------------------------------------------------------------
// Marque une demande d'aide comme PRIS_EN_CHARGE par un agent
// ops. Le numéro de l'agent est enregistré pour audit.
//
// Body : { phone: string }
//
// Réponses :
//   200 { ok: true, data: { id, statut, assignedTo } }
//   404 si la demande n'existe pas
//   409 si déjà pris en charge ou résolue
// ============================================================

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params
  if (!id) return fail('id manquant', 400)

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return fail('Payload JSON invalide', 400)
  }

  const b = body as { phone?: string }
  if (!b.phone || typeof b.phone !== 'string') {
    return fail('phone manquant', 400)
  }
  const phone = b.phone.replace(/[^0-9]/g, '')
  if (!/^\d{8,15}$/.test(phone)) {
    return fail('phone invalide (format attendu : international sans +)', 400)
  }

  const existing = await db.airportHelpRequest.findUnique({
    where: { id },
    select: { id: true, statut: true, assignedTo: true },
  })
  if (!existing) {
    return fail('Demande d\'aide introuvable', 404)
  }
  if (existing.statut !== 'EN_ATTENTE') {
    return fail(
      `Demande déjà dans le statut ${existing.statut} — impossible de la prendre en charge`,
      409,
    )
  }

  const updated = await db.airportHelpRequest.update({
    where: { id },
    data: {
      statut: 'PRIS_EN_CHARGE',
      assignedTo: phone,
    },
    select: { id: true, statut: true, assignedTo: true },
  })

  console.log(
    `[airport-help] take — demande ${updated.id} prise en charge par ${phone}`,
  )

  return ok({
    id: updated.id,
    statut: updated.statut,
    assignedTo: updated.assignedTo,
  })
}
