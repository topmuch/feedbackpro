// ============================================================
// GET /api/admin/ads/stats
// ------------------------------------------------------------
// Agrège les statistiques de la Régie Publicitaire :
//   - revenus ce mois (somme priceMonthlyFcfa des campagnes actives)
//   - taux de remplissage global (# zones éligibles avec ≥1 campagne
//     active / # zones éligibles total)
//   - impressions totales
//   - clics totaux
//   - CTR moyen (clics / impressions)
//   - top zone (zone avec le plus d'impressions)
//   - détail par zone : impressions, clics, CTR, revenus, remplissage
//
// Réponse enveloppe { ok, data }.
// ============================================================

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok } from '@/lib/session'
import { AIRPORT_ZONES } from '@/lib/airport-config'
import { isZoneAdEligibleByCode } from '@/lib/sector-config'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type ZoneStat = {
  zoneCode: string
  zoneNom: string
  emoji: string
  isAdEligible: boolean
  impressions: number
  clicks: number
  uniqueVisitors: number
  ctr: number // 0..1
  revenue: number // FCFA
  fillRate: number // 0..1
  activeCampaigns: number
}

type StatsResponse = {
  revenueThisMonth: number
  fillRateGlobal: number // 0..1
  totalImpressions: number
  totalClicks: number
  totalUniqueVisitors: number
  ctrAvg: number // 0..1
  topZone: { zoneCode: string; zoneNom: string; impressions: number } | null
  zones: ZoneStat[]
  activeCampaignsCount: number
  totalCampaignsCount: number
  eligibleZonesCount: number
  filledZonesCount: number
}

// ---------- GET : agrège les stats ----------
export async function GET(_req: NextRequest) {
  // 1. Toutes les campagnes (avec stats agrégées)
  const campaigns = await db.campaign.findMany({
    include: {
      stats: {
        select: { impressions: true, clicks: true, uniqueVisitors: true, zoneCode: true },
      },
    },
  })

  // 2. Total impressions / clics / uniques
  let totalImpressions = 0
  let totalClicks = 0
  let totalUniqueVisitors = 0
  for (const c of campaigns) {
    for (const s of c.stats) {
      totalImpressions += s.impressions
      totalClicks += s.clicks
      totalUniqueVisitors += s.uniqueVisitors
    }
  }

  const ctrAvg = totalImpressions > 0 ? totalClicks / totalImpressions : 0

  // 3. Revenus ce mois = somme priceMonthlyFcfa des campagnes actives
  //    (une campagne "active" en cours ce mois génère son prix mensuel)
  const now = new Date()
  const activeThisMonth = campaigns.filter((c) => {
    if (c.status !== 'active') return false
    const start = c.startDate
    const end = c.endDate ?? new Date(now.getFullYear() + 1, 0, 1)
    return start <= now && end >= now
  })
  const revenueThisMonth = activeThisMonth.reduce(
    (s, c) => s + (c.priceMonthlyFcfa ?? 0),
    0,
  )

  // 4. Détail par zone aéroport (25 zones + 5 historiques)
  //    On ne traite QUE les zones aéroport (la régie est aéroport-only en V1).
  //    Les campagnes peuvent techniquement cibler n'importe quel code,
  //    mais les statistiques sont agrégées par zoneCode connu.
  const eligibleZoneCodes = AIRPORT_ZONES.filter((z) => z.isAdEligible !== false)
  const eligibleZonesCount = eligibleZoneCodes.length

  // Map code -> données agrégées
  type ZoneAgg = {
    impressions: number
    clicks: number
    uniqueVisitors: number
    revenue: number
    activeCampaigns: number
  }
  const zoneAgg = new Map<string, ZoneAgg>()

  const ensure = (code: string): ZoneAgg => {
    const cur = zoneAgg.get(code)
    if (cur) return cur
    const fresh: ZoneAgg = {
      impressions: 0,
      clicks: 0,
      uniqueVisitors: 0,
      revenue: 0,
      activeCampaigns: 0,
    }
    zoneAgg.set(code, fresh)
    return fresh
  }

  for (const c of campaigns) {
    const agg = ensure(c.zoneCode)
    if (c.status === 'active') {
      agg.activeCampaigns += 1
      agg.revenue += c.priceMonthlyFcfa ?? 0
    }
    for (const s of c.stats) {
      // s.zoneCode peut différer de c.zoneCode — on regroupe par s.zoneCode
      const sAgg = ensure(s.zoneCode)
      sAgg.impressions += s.impressions
      sAgg.clicks += s.clicks
      sAgg.uniqueVisitors += s.uniqueVisitors
    }
  }

  // Construction de la liste par zone (toutes les zones aéroport)
  const zones: ZoneStat[] = AIRPORT_ZONES.map((z) => {
    const agg = zoneAgg.get(z.code) ?? {
      impressions: 0,
      clicks: 0,
      uniqueVisitors: 0,
      revenue: 0,
      activeCampaigns: 0,
    }
    const isEligible = z.isAdEligible !== false
    // Fill rate : 1 si ≥1 campagne active, 0 sinon (pour les zones éligibles)
    const fillRate = isEligible ? (agg.activeCampaigns > 0 ? 1 : 0) : 0
    const ctr = agg.impressions > 0 ? agg.clicks / agg.impressions : 0
    return {
      zoneCode: z.code,
      zoneNom: z.nom,
      emoji: z.emoji,
      isAdEligible: isEligible,
      impressions: agg.impressions,
      clicks: agg.clicks,
      uniqueVisitors: agg.uniqueVisitors,
      ctr,
      revenue: agg.revenue,
      fillRate,
      activeCampaigns: agg.activeCampaigns,
    }
  }).sort((a, b) => b.impressions - a.impressions)

  // 5. Top zone (zone éligible avec le plus d'impressions)
  const eligibleZoneStats = zones.filter((z) => z.isAdEligible)
  const topZone =
    eligibleZoneStats.length > 0 && eligibleZoneStats[0].impressions > 0
      ? {
          zoneCode: eligibleZoneStats[0].zoneCode,
          zoneNom: eligibleZoneStats[0].zoneNom,
          impressions: eligibleZoneStats[0].impressions,
        }
      : null

  // 6. Taux de remplissage global : zones éligibles avec ≥1 campagne active
  //    divisé par le total de zones éligibles.
  const filledZonesCount = eligibleZoneCodes.filter((z) => {
    const agg = zoneAgg.get(z.code)
    return agg && agg.activeCampaigns > 0
  }).length
  const fillRateGlobal =
    eligibleZonesCount > 0 ? filledZonesCount / eligibleZonesCount : 0

  const totalCampaignsCount = campaigns.length
  const activeCampaignsCount = campaigns.filter((c) => c.status === 'active').length

  const data: StatsResponse = {
    revenueThisMonth,
    fillRateGlobal,
    totalImpressions,
    totalClicks,
    totalUniqueVisitors,
    ctrAvg,
    topZone,
    zones,
    activeCampaignsCount,
    totalCampaignsCount,
    eligibleZonesCount,
    filledZonesCount,
  }

  return ok(data)
}
