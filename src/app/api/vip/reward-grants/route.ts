// ============================================================
// /api/vip/reward-grants — Module 10 (Flash Rewards Premium) — Grants
// ------------------------------------------------------------
// GET  : liste des RewardGrant (historique d'attribution).
//        Filtres optionnels :
//          ?staffName=Amadou   → staff qui a offert
//          ?tableNumber=T-01   → table/zone du client
//        Tri : createdAt desc, limit 50.
//        Inclut les détails de la récompense (rewardTitle, rewardEmoji).
// ============================================================

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_LIMIT = 50

// GET /api/vip/reward-grants
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const staffName = url.searchParams.get('staffName')
  const tableNumber = url.searchParams.get('tableNumber')

  const where: { staffName?: string; tableNumber?: string } = {}
  if (staffName && staffName.trim()) {
    where.staffName = staffName.trim().slice(0, 80)
  }
  if (tableNumber && tableNumber.trim()) {
    where.tableNumber = tableNumber.trim().slice(0, 20)
  }

  const grants = await db.rewardGrant.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: MAX_LIMIT,
    include: {
      reward: {
        select: {
          id: true,
          title: true,
          emoji: true,
        },
      },
    },
  })

  return ok(
    grants.map((g) => ({
      id: g.id,
      rewardId: g.rewardId,
      rewardTitle: g.reward?.title ?? null,
      rewardEmoji: g.reward?.emoji ?? null,
      tableNumber: g.tableNumber,
      clientName: g.clientName,
      staffName: g.staffName,
      triggeredBy: g.triggeredBy,
      deliveredAt: g.deliveredAt ? g.deliveredAt.toISOString() : null,
      createdAt: g.createdAt.toISOString(),
    })),
  )
}

// Helper réutilisable (au cas où un futur POST est requis sur cette route)
// Note : la création de grants se fait via /api/vip/premium-rewards POST.
export async function POST() {
  return fail(
    'Utiliser POST /api/vip/premium-rewards pour accorder une récompense',
    405,
  )
}
