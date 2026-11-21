// ============================================================
// GET /api/admin/ads/zones
// ------------------------------------------------------------
// Renvoie toutes les zones aéroport (25 + 5 historiques) avec :
//   - isAdEligible (true par défaut, false pour urg_sos)
//   - stats summary par zone (impressions, clics, CTR, revenus,
//     remplissage, # campagnes actives)
//
// Utilisé par le frontend pour afficher la liste des zones
// éligibles (vert) vs interdites (rouge, lock icon) — Task AD1
// Section D du composant admin-ads-tab.
//
// Réponse enveloppe { ok, data }.
// ============================================================

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok } from '@/lib/session'
import { AIRPORT_ZONES } from '@/lib/airport-config'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type ZoneSummary = {
  code: string
  nom: string
  emoji: string
  description: string | null
  isAdEligible: boolean
  impressions: number
  clicks: number
  uniqueVisitors: number
  ctr: number // 0..1
  revenue: number // FCFA
  fillRate: number // 0..1
  activeCampaigns: number
  totalCampaigns: number
  forbiddenReason: string | null // explication si interdite
}

// ---------- GET : liste des zones avec stats ----------
export async function GET(_req: NextRequest) {
  // Agrège stats + campagnes par zoneCode
  const campaigns = await db.campaign.findMany({
    select: {
      zoneCode: true,
      status: true,
      priceMonthlyFcfa: true,
      stats: {
        select: { impressions: true, clicks: true, uniqueVisitors: true, zoneCode: true },
      },
    },
  })

  type ZoneAgg = {
    impressions: number
    clicks: number
    uniqueVisitors: number
    revenue: number
    activeCampaigns: number
    totalCampaigns: number
  }
  const aggByZone = new Map<string, ZoneAgg>()

  const ensure = (code: string): ZoneAgg => {
    const cur = aggByZone.get(code)
    if (cur) return cur
    const fresh: ZoneAgg = {
      impressions: 0,
      clicks: 0,
      uniqueVisitors: 0,
      revenue: 0,
      activeCampaigns: 0,
      totalCampaigns: 0,
    }
    aggByZone.set(code, fresh)
    return fresh
  }

  for (const c of campaigns) {
    const agg = ensure(c.zoneCode)
    agg.totalCampaigns += 1
    if (c.status === 'active') {
      agg.activeCampaigns += 1
      agg.revenue += c.priceMonthlyFcfa ?? 0
    }
    for (const s of c.stats) {
      const sAgg = ensure(s.zoneCode)
      sAgg.impressions += s.impressions
      sAgg.clicks += s.clicks
      sAgg.uniqueVisitors += s.uniqueVisitors
    }
  }

  const zones: ZoneSummary[] = AIRPORT_ZONES.map((z) => {
    const isEligible = z.isAdEligible !== false
    const agg = aggByZone.get(z.code) ?? {
      impressions: 0,
      clicks: 0,
      uniqueVisitors: 0,
      revenue: 0,
      activeCampaigns: 0,
      totalCampaigns: 0,
    }
    const fillRate = isEligible ? (agg.activeCampaigns > 0 ? 1 : 0) : 0
    const ctr = agg.impressions > 0 ? agg.clicks / agg.impressions : 0
    return {
      code: z.code,
      nom: z.nom,
      emoji: z.emoji,
      description: z.description ?? null,
      isAdEligible: isEligible,
      impressions: agg.impressions,
      clicks: agg.clicks,
      uniqueVisitors: agg.uniqueVisitors,
      ctr,
      revenue: agg.revenue,
      fillRate,
      activeCampaigns: agg.activeCampaigns,
      totalCampaigns: agg.totalCampaigns,
      forbiddenReason: isEligible
        ? null
        : 'Zone protégée — interdiction absolue de publicité (sécurité publique). Règle FeedVoice : jamais sur urgence.',
    }
  })

  // Tri : zones autorisées d'abord (par impressions desc), puis interdites
  zones.sort((a, b) => {
    if (a.isAdEligible !== b.isAdEligible) return a.isAdEligible ? -1 : 1
    return b.impressions - a.impressions
  })

  return ok({ zones, total: zones.length })
}
