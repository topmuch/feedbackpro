// ============================================================
// GET /api/airport/direction-dashboard
// ------------------------------------------------------------
// Agrège les KPI exécutifs (C-Level) pour le directeur d'aéroport :
//   - Total passagers servis (estimation : vols × load factor moyen)
//   - Taux de satisfaction (% de retours positifs ≥ 4/5)
//   - NPS aéroport (depuis les notes nps 0-10 des retours)
//   - Temps moyen de résolution (24h, 7j, 30j)
//   - Taux de conformité SLA (% résolus dans le target de la zone)
//   - Revenu publicitaire (mois en cours, somme priceMonthlyFcfa
//     des campagnes actives)
//   - Top 3 performers (AirportAgentScore, mois en cours)
//   - Tendance incidents (vs semaine dernière, vs mois dernier)
//   - Classement de risque par zone (volume + temps moyen + EN_ATTENTE)
//
// Toutes les métriques agrégées — aucun détail opérationnel individuel
// (pas d'ID signalement, pas de commentaire voyageur). Conçu pour
// être consommé par l'onglet "Direction" du dashboard admin.
// ============================================================

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok } from '@/lib/session'
import { AIRPORT_ZONES } from '@/lib/airport-config'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Estimation : moyenne empirique passagers/vol sur un aéroport régional
const AVG_PAX_PER_FLIGHT = 150

function nowMs(): number {
  return Date.now()
}

function daysAgoMs(days: number): number {
  return nowMs() - days * 24 * 3600 * 1000
}

function startOfMonth(): Date {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0)
}

function monthKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** Moyenne de minutes entre createdAt et resolvedAt pour une liste de reports résolus. */
function avgResolutionMinutes(
  rows: { createdAt: Date; resolvedAt: Date | null }[],
): number | null {
  if (rows.length === 0) return null
  let total = 0
  let count = 0
  for (const r of rows) {
    if (!r.resolvedAt) continue
    const ms = r.resolvedAt.getTime() - r.createdAt.getTime()
    if (ms >= 0) {
      total += ms
      count++
    }
  }
  if (count === 0) return null
  return Math.round(total / count / 60000)
}

export async function GET(_req: NextRequest) {
  const now = new Date()
  const since24h = new Date(daysAgoMs(1))
  const since7d = new Date(daysAgoMs(7))
  const since30d = new Date(daysAgoMs(30))
  const since14d = new Date(daysAgoMs(14))
  const since60d = new Date(daysAgoMs(60))
  const monthStart = startOfMonth()

  // ----------------------------------------------------------
  // 1. Total passagers servis (estimation)
  //    = (vols actifs en 24h) × AVG_PAX_PER_FLIGHT
  //    + (volshistoriques 7j) × AVG_PAX_PER_FLIGHT
  //    + retours 24h comme proxy (au cas où pas de vols enregistrés)
  // ----------------------------------------------------------
  const activeFlights = await db.airportFlightGate.count({
    where: { active: true },
  })
  const totalFlightsAllTime = await db.airportFlightGate.count()
  // Estimation des vols sur 24h : on suppose qu'un vol actif dure ~2h,
  // donc on estime ~ 12 vols par jour si on a des gates.
  const estimatedFlights24h = Math.max(
    activeFlights * 4, // 4 rotations / porte / jour
    totalFlightsAllTime > 0 ? 8 : 0,
  )
  const totalPaxServed = estimatedFlights24h * AVG_PAX_PER_FLIGHT

  // ----------------------------------------------------------
  // 2. Taux de satisfaction — Retours (note ≥ 4) sur tous les Pros Aéroport
  // ----------------------------------------------------------
  // On récupère les Pros de type "Aéroport" pour filtrer les retours
  const airportPros = await db.pro.findMany({
    where: { typeEtablissement: 'Aéroport' },
    select: { id: true },
  })
  const airportProIds = airportPros.map((p) => p.id)

  let satisfactionRate = 0
  let npsScore = 0
  let npsResponses = 0

  if (airportProIds.length > 0) {
    const retours30d = await db.retour.findMany({
      where: { proId: { in: airportProIds }, createdAt: { gte: since30d } },
      select: { note: true, nps: true },
    })
    if (retours30d.length > 0) {
      const positives = retours30d.filter((r) => r.note >= 4).length
      satisfactionRate = Math.round((positives / retours30d.length) * 100)
    }

    // NPS : Promoteurs (nps 9-10) - Détracteurs (nps 0-6) / total × 100
    const npsValues = retours30d
      .map((r) => r.nps)
      .filter((n): n is number => typeof n === 'number' && n >= 0 && n <= 10)
    npsResponses = npsValues.length
    if (npsValues.length > 0) {
      const promoters = npsValues.filter((n) => n >= 9).length
      const detractors = npsValues.filter((n) => n <= 6).length
      npsScore = Math.round(((promoters - detractors) / npsValues.length) * 100)
    }
  }

  // ----------------------------------------------------------
  // 3. Temps moyen de résolution (24h, 7j, 30j)
  // ----------------------------------------------------------
  const [resolved24h, resolved7d, resolved30d] = await Promise.all([
    db.airportReport.findMany({
      where: {
        statut: 'RESOLU',
        resolvedAt: { gte: since24h },
        createdAt: { gte: since24h },
      },
      select: { createdAt: true, resolvedAt: true },
    }),
    db.airportReport.findMany({
      where: {
        statut: 'RESOLU',
        resolvedAt: { gte: since7d },
        createdAt: { gte: since7d },
      },
      select: { createdAt: true, resolvedAt: true },
    }),
    db.airportReport.findMany({
      where: {
        statut: 'RESOLU',
        resolvedAt: { gte: since30d },
        createdAt: { gte: since30d },
      },
      select: { createdAt: true, resolvedAt: true },
    }),
  ])

  const avgResolution = {
    '24h': avgResolutionMinutes(resolved24h),
    '7d': avgResolutionMinutes(resolved7d),
    '30d': avgResolutionMinutes(resolved30d),
  }

  // ----------------------------------------------------------
  // 4. SLA compliance rate — % de résolus dont le temps ≤ target zone
  // ----------------------------------------------------------
  const slas = await db.airportSla.findMany()
  const slaByZoneCode = new Map(slas.map((s) => [s.zoneCode, s.targetMinutes]))

  // Pour calculer le SLA on a besoin du zoneId → zoneCode mapping
  const zones = await db.airportZone.findMany({ select: { id: true, code: true } })
  const zoneCodeById = new Map(zones.map((z) => [z.id, z.code]))

  const resolvedWithZone30d = await db.airportReport.findMany({
    where: {
      statut: 'RESOLU',
      resolvedAt: { gte: since30d },
      createdAt: { gte: since30d },
    },
    select: { createdAt: true, resolvedAt: true, zoneId: true },
  })

  let slaCompliant = 0
  let slaTotal = 0
  for (const r of resolvedWithZone30d) {
    if (!r.resolvedAt) continue
    const code = zoneCodeById.get(r.zoneId)
    if (!code) continue
    const target = slaByZoneCode.get(code)
    if (typeof target !== 'number') continue
    const min = (r.resolvedAt.getTime() - r.createdAt.getTime()) / 60000
    if (min >= 0) {
      slaTotal++
      if (min <= target) slaCompliant++
    }
  }
  const slaComplianceRate =
    slaTotal > 0 ? Math.round((slaCompliant / slaTotal) * 100) : 100

  // ----------------------------------------------------------
  // 5. Revenu publicitaire (mois en cours) — somme priceMonthlyFcfa
  //    des campagnes actives dont startDate <= now && (endDate null ou >= now)
  // ----------------------------------------------------------
  const activeCampaigns = await db.campaign.findMany({
    where: {
      status: 'active',
      startDate: { lte: now },
      AND: [{ OR: [{ endDate: null }, { endDate: { gte: now } }] }],
    },
    select: { priceMonthlyFcfa: true, zoneCode: true },
  })
  const adRevenueMonthToDate = activeCampaigns.reduce(
    (sum, c) => sum + (c.priceMonthlyFcfa ?? 0),
    0,
  )

  // ----------------------------------------------------------
  // 6. Top 3 performers (mois en cours) — AirportAgentScore
  // ----------------------------------------------------------
  const currentMonth = monthKey(now)
  const topPerformersRaw = await db.airportAgentScore.findMany({
    where: { month: currentMonth },
    orderBy: { points: 'desc' },
    take: 3,
  })
  const topPerformers = topPerformersRaw.map((p, i) => ({
    rank: i + 1,
    staffName: p.staffName,
    points: p.points,
    resolutions: p.resolutions,
    avgMinutes: p.avgMinutes,
  }))

  // ----------------------------------------------------------
  // 7. Tendance incidents (vs semaine dernière, vs mois dernier)
  // ----------------------------------------------------------
  const [
    incidents7d,
    incidentsPrev7d,
    incidents30d,
    incidentsPrev30d,
  ] = await Promise.all([
    db.airportReport.count({ where: { createdAt: { gte: since7d } } }),
    db.airportReport.count({
      where: { createdAt: { gte: since14d, lt: since7d } },
    }),
    db.airportReport.count({ where: { createdAt: { gte: since30d } } }),
    db.airportReport.count({
      where: { createdAt: { gte: since60d, lt: since30d } },
    }),
  ])
  const weeklyTrendPct =
    incidentsPrev7d > 0
      ? Math.round(((incidents7d - incidentsPrev7d) / incidentsPrev7d) * 100)
      : incidents7d > 0
      ? 100
      : 0
  const monthlyTrendPct =
    incidentsPrev30d > 0
      ? Math.round(((incidents30d - incidentsPrev30d) / incidentsPrev30d) * 100)
      : incidents30d > 0
      ? 100
      : 0

  // ----------------------------------------------------------
  // 8. Tendance hebdomadaire — 7 barres pour les 7 derniers jours
  // ----------------------------------------------------------
  const weeklyBars: { day: string; date: string; count: number; resolved: number }[] = []
  for (let i = 6; i >= 0; i--) {
    const start = new Date(nowMs() - i * 24 * 3600 * 1000)
    start.setHours(0, 0, 0, 0)
    const end = new Date(start.getTime() + 24 * 3600 * 1000)
    const dayLabel = start.toLocaleDateString('fr-FR', { weekday: 'short' })
    const dateLabel = start.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })
    const [count, resolved] = await Promise.all([
      db.airportReport.count({
        where: { createdAt: { gte: start, lt: end } },
      }),
      db.airportReport.count({
        where: { resolvedAt: { gte: start, lt: end } },
      }),
    ])
    weeklyBars.push({ day: dayLabel, date: dateLabel, count, resolved })
  }

  // ----------------------------------------------------------
  // 9. Classement de risque par zone
  //    Score = nb_incidents_30j × 1 + nb_en_attente × 3
  //            + avg_resolution_min × 0.2 (pénalité lenteur)
  // ----------------------------------------------------------
  const zoneStats = await Promise.all(
    AIRPORT_ZONES.map(async (zCfg) => {
      const zone = await db.airportZone.findUnique({
        where: { code: zCfg.code },
        select: { id: true },
      })
      if (!zone) {
        return {
          code: zCfg.code,
          nom: zCfg.nom,
          emoji: zCfg.emoji,
          incidents30d: 0,
          enAttente: 0,
          enCours: 0,
          resolus30d: 0,
          avgMinutes: null,
          riskScore: 0,
          riskLevel: 'unknown' as const,
        }
      }
      const [incidents30d, enAttente, enCours, resolus30d, resolvedRows] =
        await Promise.all([
          db.airportReport.count({
            where: { zoneId: zone.id, createdAt: { gte: since30d } },
          }),
          db.airportReport.count({
            where: { zoneId: zone.id, statut: 'EN_ATTENTE' },
          }),
          db.airportReport.count({
            where: { zoneId: zone.id, statut: 'EN_COURS' },
          }),
          db.airportReport.count({
            where: {
              zoneId: zone.id,
              statut: 'RESOLU',
              resolvedAt: { gte: since30d },
            },
          }),
          db.airportReport.findMany({
            where: {
              zoneId: zone.id,
              statut: 'RESOLU',
              resolvedAt: { gte: since30d },
              createdAt: { gte: since30d },
            },
            select: { createdAt: true, resolvedAt: true },
          }),
        ])
      const avgMin = avgResolutionMinutes(resolvedRows)
      const riskScore =
        incidents30d * 1 + enAttente * 3 + (avgMin ? avgMin * 0.2 : 0)
      let riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'low'
      if (riskScore >= 30) riskLevel = 'critical'
      else if (riskScore >= 15) riskLevel = 'high'
      else if (riskScore >= 5) riskLevel = 'medium'
      return {
        code: zCfg.code,
        nom: zCfg.nom,
        emoji: zCfg.emoji,
        incidents30d,
        enAttente,
        enCours,
        resolus30d,
        avgMinutes: avgMin,
        riskScore: Math.round(riskScore * 10) / 10,
        riskLevel,
      }
    }),
  )
  const zoneRiskRanking = zoneStats
    .filter((z) => z.incidents30d > 0 || z.enAttente > 0 || z.enCours > 0)
    .sort((a, b) => b.riskScore - a.riskScore)
    .slice(0, 8)

  // ----------------------------------------------------------
  // Réponse agrégée
  // ----------------------------------------------------------
  return ok({
    generatedAt: now.toISOString(),
    period: {
      since24h: since24h.toISOString(),
      since7d: since7d.toISOString(),
      since30d: since30d.toISOString(),
      monthStart: monthStart.toISOString(),
    },
    passengers: {
      totalServed: totalPaxServed,
      estimation: 'vols_actifs × 4 rotations × 150 pax/vol',
      activeFlights,
      avgPaxPerFlight: AVG_PAX_PER_FLIGHT,
    },
    satisfaction: {
      rate: satisfactionRate,
      sampleSize: airportProIds.length,
      period: '30d',
    },
    nps: {
      score: npsScore,
      responses: npsResponses,
      period: '30d',
      source: 'retours_app',
    },
    resolution: avgResolution,
    sla: {
      complianceRate: slaComplianceRate,
      sampleSize: slaTotal,
      period: '30d',
    },
    adRevenue: {
      monthToDate: adRevenueMonthToDate,
      currency: 'XOF',
      activeCampaigns: activeCampaigns.length,
    },
    topPerformers,
    trends: {
      weekly: {
        current: incidents7d,
        previous: incidentsPrev7d,
        deltaPct: weeklyTrendPct,
      },
      monthly: {
        current: incidents30d,
        previous: incidentsPrev30d,
        deltaPct: monthlyTrendPct,
      },
    },
    weeklyBars,
    zoneRiskRanking,
    activeZones: zoneRiskRanking.length,
  })
}
