// ============================================================
// POST /api/airport/help/[id]/resolve
// ------------------------------------------------------------
// Marque une demande d'aide comme RESOLU.
//
// Body : {} (vide) ou { phone?: string } pour audit
//
// Réponses :
//   200 { ok: true, data: { id, statut, resolvedAt } }
//   404 si la demande n'existe pas
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

  // Body optionnel — on accepte {} ou { phone }
  let body: unknown = {}
  try {
    body = await req.json()
  } catch {
    // body vide (pas de JSON) — on continue
  }
  const b = (body ?? {}) as { phone?: string }
  const phone =
    typeof b.phone === 'string' ? b.phone.replace(/[^0-9]/g, '') : null

  const existing = await db.airportHelpRequest.findUnique({
    where: { id },
    select: { id: true, statut: true },
  })
  if (!existing) {
    return fail('Demande d\'aide introuvable', 404)
  }
  if (existing.statut === 'RESOLU') {
    // Idempotent — on renvoie juste l'état actuel
    const fresh = await db.airportHelpRequest.findUnique({
      where: { id },
      select: { id: true, statut: true, resolvedAt: true },
    })
    return ok({
      id: fresh!.id,
      statut: fresh!.statut,
      resolvedAt: fresh!.resolvedAt?.toISOString() ?? null,
    })
  }

  const now = new Date()
  const updated = await db.airportHelpRequest.update({
    where: { id },
    data: {
      statut: 'RESOLU',
      resolvedAt: now,
    },
    select: { id: true, statut: true, resolvedAt: true },
  })

  console.log(
    `[airport-help] resolve — demande ${updated.id} résolue par ${phone ?? 'unknown'}`,
  )

  return ok({
    id: updated.id,
    statut: updated.statut,
    resolvedAt: updated.resolvedAt?.toISOString() ?? null,
  })
}
