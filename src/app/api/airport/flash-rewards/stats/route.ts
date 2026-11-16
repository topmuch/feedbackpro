// ============================================================
// GET /api/airport/flash-rewards/stats
// ------------------------------------------------------------
// Agrège les statistiques par campagne Flash Rewards.
//
// Query : ?campaignId=xxx pour filtrer sur une seule campagne,
//         sinon toutes les campagnes.
//
// Pour chaque campagne :
//   - total codes, codes par statut (unused/scratched/used/expired)
//   - total vues, grattements, codes utilisés
//   - revenus (used × pricePerCodeFcfa)
//   - taux de conversion (used / scratches)
//
// + recentCodes (20 derniers) avec le titre de la campagne.
//
// Réponse : { ok: true, data: { campaigns: [...], recentCodes: [...] } }
// ============================================================

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type StatRow = {
  id: string
  campaignId: string
  statDate: Date
  views: number
  scratches: number
  used: number
  revenueFcfa: number
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const campaignIdFilter = url.searchParams.get('campaignId')

  const where = campaignIdFilter ? { id: campaignIdFilter } : undefined

  const campaigns = await db.flashRewardCampaign.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      advertiser: { select: { companyName: true } },
      _count: { select: { codes: true } },
    },
  })

  // Récupère toutes les stats pour les campagnes concernées
  const campaignIds = campaigns.map((c) => c.id)
  const allStats: StatRow[] =
    campaignIds.length > 0
      ? await db.flashRewardStat.findMany({ where: { campaignId: { in: campaignIds } } })
      : []

  // Récupère tous les codes pour ces campagnes (pour les comptes par statut)
  const allCodes =
    campaignIds.length > 0
      ? await db.flashRewardCode.findMany({
          where: { campaignId: { in: campaignIds } },
          select: {
            id: true,
            campaignId: true,
            code: true,
            status: true,
            zoneCode: true,
            clientIp: true,
            createdAt: true,
            expiresAt: true,
            scratchedAt: true,
            usedAt: true,
          },
          orderBy: { createdAt: 'desc' },
        })
      : []

  // Index stats par campaignId
  const statsByCampaign = new Map<string, StatRow[]>()
  for (const s of allStats) {
    const arr = statsByCampaign.get(s.campaignId) ?? []
    arr.push(s)
    statsByCampaign.set(s.campaignId, arr)
  }

  // Index codes par campaignId
  const codesByCampaign = new Map<
    string,
    Array<{
      id: string
      status: string
      zoneCode: string | null
      createdAt: Date
      expiresAt: Date
      scratchedAt: Date | null
      usedAt: Date | null
    }>
  >()
  for (const c of allCodes) {
    const arr = codesByCampaign.get(c.campaignId) ?? []
    arr.push({
      id: c.id,
      status: c.status,
      zoneCode: c.zoneCode,
      createdAt: c.createdAt,
      expiresAt: c.expiresAt,
      scratchedAt: c.scratchedAt,
      usedAt: c.usedAt,
    })
    codesByCampaign.set(c.campaignId, arr)
  }

  const campaignStats = campaigns.map((c) => {
    const stats = statsByCampaign.get(c.id) ?? []
    const codes = codesByCampaign.get(c.id) ?? []

    const totalViews = stats.reduce((acc, s) => acc + s.views, 0)
    const totalScratches = stats.reduce((acc, s) => acc + s.scratches, 0)
    const totalUsed = stats.reduce((acc, s) => acc + s.used, 0)

    // Comptes par statut (depuis la table codes, source de vérité)
    const statusCounts: Record<string, number> = {
      unused: 0,
      scratched: 0,
      used: 0,
      expired: 0,
    }
    for (const code of codes) {
      if (statusCounts[code.status] !== undefined) {
        statusCounts[code.status]++
      }
    }

    const revenueFcfa = totalUsed * c.pricePerCodeFcfa
    const conversionRate =
      totalScratches > 0 ? Math.round((totalUsed / totalScratches) * 1000) / 10 : 0

    return {
      campaign: {
        id: c.id,
        title: c.title,
        advertiserId: c.advertiserId,
        advertiserName: c.advertiser?.companyName ?? null,
        rewardType: c.rewardType,
        rewardValue: c.rewardValue,
        pricePerCodeFcfa: c.pricePerCodeFcfa,
        status: c.status,
        startDate: c.startDate.toISOString(),
        endDate: c.endDate ? c.endDate.toISOString() : null,
        createdAt: c.createdAt.toISOString(),
      },
      totalCodes: codes.length,
      codesByStatus: statusCounts,
      totalViews,
      totalScratches,
      totalUsed,
      revenueFcfa,
      conversionRate,
    }
  })

  // 20 derniers codes (toutes campagnes confondues) avec le titre campagne
  const recentCodes = allCodes.slice(0, 20).map((code) => {
    const camp = campaigns.find((c) => c.id === code.campaignId)
    return {
      id: code.id,
      code: code.code,
      status: code.status,
      campaignId: code.campaignId,
      campaignTitle: camp?.title ?? null,
      zoneCode: code.zoneCode,
      clientIp: code.clientIp,
      createdAt: code.createdAt.toISOString(),
      expiresAt: code.expiresAt.toISOString(),
      scratchedAt: code.scratchedAt ? code.scratchedAt.toISOString() : null,
      usedAt: code.usedAt ? code.usedAt.toISOString() : null,
    }
  })

  return ok({ campaigns: campaignStats, recentCodes })
}
