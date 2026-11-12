// ============================================================
// GET /api/airport/audit?reportId=xxx
// ------------------------------------------------------------
// Récupère l'historique immuable (Black Box) d'un signalement.
// ============================================================

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const reportId = url.searchParams.get('reportId')

  if (!reportId) {
    // Sans reportId : retourner les 50 dernières entrées (vue direction)
    const entries = await db.airportAuditTrail.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
    })
    return ok({ entries })
  }

  const entries = await db.airportAuditTrail.findMany({
    where: { reportId },
    orderBy: { createdAt: 'asc' },
  })

  if (entries.length === 0) {
    return fail('Aucune entrée d\'audit pour ce signalement', 404)
  }

  return ok({ entries, reportId })
}
