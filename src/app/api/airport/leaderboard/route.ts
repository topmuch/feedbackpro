// ============================================================
// GET /api/airport/leaderboard
// ------------------------------------------------------------
// Classement mensuel des agents par score.
// ?month=2026-11 (défaut: mois courant)
// ============================================================

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const now = new Date()
  const month = url.searchParams.get('month') ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  const scores = await db.airportAgentScore.findMany({
    where: { month },
    orderBy: { points: 'desc' },
    take: 20,
  })

  return ok({
    month,
    leaderboard: scores.map((s, i) => ({
      rank: i + 1,
      id: s.id,
      staffName: s.staffName,
      staffPhone: s.staffPhone,
      points: s.points,
      resolutions: s.resolutions,
      avgMinutes: s.avgMinutes,
      lastResolvedAt: s.lastResolvedAt,
    })),
  })
}
