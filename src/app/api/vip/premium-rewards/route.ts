// ============================================================
// /api/vip/premium-rewards — Module 10 (Flash Rewards Premium)
// ------------------------------------------------------------
// GET  : liste des récompenses premium actives (PremiumReward).
//        Auto-seed : 4 récompenses par défaut si la table est vide.
//        Tri : title asc. Filtre active=true.
// POST : accorde une récompense à un client (crée un RewardGrant).
//        Body : { rewardId, tableNumber?, clientName?, staffName, triggeredBy? }
//        - staffName requis (qui a offert)
//        - triggeredBy défaut "manual"
//        - deliveredAt = now
// ============================================================

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Seed initial : 4 récompenses premium luxe
const SEED_REWARDS: Array<{
  title: string
  description: string
  emoji: string
  costFcfa: number
}> = [
  {
    title: 'Coupe champagne',
    description: 'Cuvée prestige servie à votre place',
    emoji: '🥂',
    costFcfa: 8000,
  },
  {
    title: 'Upgrade Massage 15 min',
    description: 'Détente express en cabine privée',
    emoji: '💆',
    costFcfa: 15000,
  },
  {
    title: 'Upgrade Suite Lounge 1h',
    description: 'Accès privatif 1 heure',
    emoji: '👑',
    costFcfa: 20000,
  },
  {
    title: 'Cocktail signature',
    description: 'Création exclusive du barman',
    emoji: '🍸',
    costFcfa: 5000,
  },
]

// Auto-seed si la table PremiumReward est vide
async function ensureSeeded(): Promise<void> {
  const count = await db.premiumReward.count()
  if (count > 0) return
  await db.premiumReward.createMany({
    data: SEED_REWARDS.map((r) => ({
      title: r.title,
      description: r.description,
      emoji: r.emoji,
      costFcfa: r.costFcfa,
      active: true,
    })),
  })
}

// GET /api/vip/premium-rewards
export async function GET(req: NextRequest) {
  await ensureSeeded()

  const rewards = await db.premiumReward.findMany({
    where: { active: true },
    orderBy: { title: 'asc' },
  })

  return ok(
    rewards.map((r) => ({
      id: r.id,
      title: r.title,
      description: r.description,
      emoji: r.emoji,
      costFcfa: r.costFcfa,
      active: r.active,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    })),
  )
}

// POST /api/vip/premium-rewards — accorde une récompense
export async function POST(req: NextRequest) {
  await ensureSeeded()

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return fail('Body JSON invalide', 400)
  }

  // rewardId requis
  if (typeof body.rewardId !== 'string' || !body.rewardId.trim()) {
    return fail('rewardId requis', 400)
  }
  const rewardId = body.rewardId.trim()

  // staffName requis (qui a offert)
  if (typeof body.staffName !== 'string' || !body.staffName.trim()) {
    return fail('staffName requis', 400)
  }
  const staffName = body.staffName.trim().slice(0, 80)

  // Champs optionnels
  const tableNumber =
    typeof body.tableNumber === 'string' && body.tableNumber.trim()
      ? body.tableNumber.trim().slice(0, 20)
      : null
  const clientName =
    typeof body.clientName === 'string' && body.clientName.trim()
      ? body.clientName.trim().slice(0, 80)
      : null

  // triggeredBy : défaut "manual"
  const triggeredBy =
    typeof body.triggeredBy === 'string' && body.triggeredBy.trim()
      ? body.triggeredBy.trim().slice(0, 40)
      : 'manual'

  // 1. Trouver la récompense
  const reward = await db.premiumReward.findUnique({ where: { id: rewardId } })
  if (!reward) {
    return fail('Récompense introuvable', 404)
  }
  if (!reward.active) {
    return fail('Récompense inactive', 400)
  }

  // 2. Création du RewardGrant avec deliveredAt = now
  const now = new Date()
  const grant = await db.rewardGrant.create({
    data: {
      rewardId,
      tableNumber,
      clientName,
      staffName,
      triggeredBy,
      deliveredAt: now,
    },
  })

  return ok(
    {
      id: grant.id,
      rewardId: grant.rewardId,
      rewardTitle: reward.title,
      rewardEmoji: reward.emoji,
      rewardDescription: reward.description,
      rewardCostFcfa: reward.costFcfa,
      tableNumber: grant.tableNumber,
      clientName: grant.clientName,
      staffName: grant.staffName,
      triggeredBy: grant.triggeredBy,
      deliveredAt: grant.deliveredAt ? grant.deliveredAt.toISOString() : null,
      createdAt: grant.createdAt.toISOString(),
    },
    201,
  )
}
