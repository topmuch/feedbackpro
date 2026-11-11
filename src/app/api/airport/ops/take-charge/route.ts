// ============================================================
// POST /api/airport/ops/take-charge
// ------------------------------------------------------------
// Marque un signalement comme "EN_COURS" (un ops a pris en charge).
// Body: { reportId: string, phone?: string }
// ============================================================

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail } from '@/lib/session'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return fail('Payload JSON invalide', 400)
  }
  const b = body as { reportId?: string; phone?: string }
  if (!b.reportId || typeof b.reportId !== 'string') {
    return fail('reportId manquant', 400)
  }

  const existing = await db.airportReport.findUnique({ where: { id: b.reportId } })
  if (!existing) {
    return fail('Signalement introuvable', 404)
  }
  if (existing.statut === 'RESOLU') {
    return fail('Ce signalement est déjà résolu', 400)
  }

  const updated = await db.airportReport.update({
    where: { id: b.reportId },
    data: { statut: 'EN_COURS' },
  })

  console.log(`[airport-ops] Report ${b.reportId} → EN_COURS par ${b.phone ?? 'ops'}`)

  return ok({
    reportId: updated.id,
    statut: updated.statut,
  })
}
