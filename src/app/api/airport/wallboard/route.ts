// ============================================================
// GET /api/airport/wallboard
// ------------------------------------------------------------
// Agrège les données temps-réel pour le wallboard ops room
// (affichage TV en salle de supervision aéroport).
//
// Route publique (l'URL est partagée à l'équipe ops). Aucune auth.
// runtime = nodejs + force-dynamic → jamais mis en cache CDN.
//
// Sortie (enveloppe ok/data) :
//   {
//     ok: true,
//     data: {
//       stats: { total_24h, en_attente, en_cours, resolus_24h,
//                avg_resolution_minutes: number | null },
//       zones: [{ code, nom, emoji, count_24h, count_en_attente,
//                 last_report_at, trend }],
//       top_zones: [...],     // top 3 zones par count_24h
//       recent_reports: [...], // 10 derniers signalements
//       by_team: { nettoyage, maintenance, securite, accueil, other },
//       sla: {                                  // Feature 3 — SLA par zone
//         [zoneCode]: {
//           targetMinutes: number | null,
//           resolvedCount: number,
//           avgResolutionMinutes: number | null,
//           slaCompliancePercent: number,
//           pendingBreaches: number
//         }
//       }
//     }
//   }
//
// Stratégie d'agrégation : on charge les reports des dernières 48h
// (last_24h + previous_24h pour le trend) et on agrège côté JS.
// Plus simple et plus portable que groupBy Prisma sur SQLite.
// ============================================================

import { db } from '@/lib/db'
import { ok } from '@/lib/session'
import { AIRPORT_ZONES } from '@/lib/airport-config'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Statut = 'EN_ATTENTE' | 'EN_COURS' | 'RESOLU'

type TeamKey = 'nettoyage' | 'maintenance' | 'securite' | 'accueil' | 'other'
const TEAM_KEYS: TeamKey[] = ['nettoyage', 'maintenance', 'securite', 'accueil', 'other']

function bucketTeam(raw: string | null | undefined): TeamKey {
  if (!raw) return 'other'
  const k = raw.trim().toLowerCase()
  if (TEAM_KEYS.includes(k as TeamKey)) return k as TeamKey
  return 'other'
}

function trendFromCounts(curr: number, prev: number): 'up' | 'down' | 'stable' {
  if (curr > prev) return 'up'
  if (curr < prev) return 'down'
  return 'stable'
}

export async function GET() {
  const now = Date.now()
  const MS_24H = 24 * 3600 * 1000
  const since24 = new Date(now - MS_24H)
  const since48 = new Date(now - 2 * MS_24H)

  // --- Charge tous les reports des dernières 48h (+ zone join) ---
  const reports = await db.airportReport.findMany({
    where: { createdAt: { gte: since48 } },
    orderBy: { createdAt: 'desc' },
    include: {
      zone: { select: { code: true, nom: true, emoji: true } },
    },
  })

  // --- Index zone metadata par code (fallback config si zone absente en BDD) ---
  const zoneMetaByCode = new Map<string, { code: string; nom: string; emoji: string }>()
  for (const z of AIRPORT_ZONES) {
    zoneMetaByCode.set(z.code, { code: z.code, nom: z.nom, emoji: z.emoji })
  }

  // --- Buckets par zone ---
  type ZoneAgg = {
    code: string
    nom: string
    emoji: string
    count_24h: number
    count_prev_24h: number
    count_en_attente: number
    last_report_at: number | null // ms epoch
  }
  const zoneAggByCode = new Map<string, ZoneAgg>()
  for (const z of AIRPORT_ZONES) {
    zoneAggByCode.set(z.code, {
      code: z.code,
      nom: z.nom,
      emoji: z.emoji,
      count_24h: 0,
      count_prev_24h: 0,
      count_en_attente: 0,
      last_report_at: null,
    })
  }

  // --- SLA per zone (Feature 3) ---
  // targetMinutes = null si aucun SLA défini → l'UI affiche "Non défini".
  // resolvedCount / slaCompliancePercent ne sont calculés que sur les
  // reports RESOLU des dernières 24h (cohérent avec le reste du wallboard).
  // pendingBreaches = EN_ATTENTE reports (fenêtre 48h) dont l'âge dépasse
  // targetMinutes. Les EN_ATTENTE plus anciens que 48h ne sont pas comptés
  // (anomalies rares, à traiter séparément).
  type SlaAgg = {
    targetMinutes: number | null
    resolvedCount: number
    resolvedWithinTarget: number
    sumResolutionMs: number
    pendingBreaches: number
  }
  const slaByZone = new Map<string, SlaAgg>()
  for (const z of AIRPORT_ZONES) {
    slaByZone.set(z.code, {
      targetMinutes: null,
      resolvedCount: 0,
      resolvedWithinTarget: 0,
      sumResolutionMs: 0,
      pendingBreaches: 0,
    })
  }
  const slaRows = await db.airportSla.findMany()
  for (const r of slaRows) {
    const agg = slaByZone.get(r.zoneCode)
    if (agg && r.active) {
      agg.targetMinutes = r.targetMinutes
    }
  }

  // --- Stats globales + by_team ---
  let total_24h = 0
  let en_attente = 0
  let en_cours = 0
  let resolus_24h = 0
  let sumResolutionMs = 0
  let resolvedSamples = 0
  const byTeam: Record<TeamKey, number> = {
    nettoyage: 0,
    maintenance: 0,
    securite: 0,
    accueil: 0,
    other: 0,
  }

  for (const r of reports) {
    const c = r.createdAt.getTime()
    const inLast24 = c >= since24.getTime()
    const code = r.zone?.code ?? 'restauration' // fallback : ne crash jamais
    const meta = zoneMetaByCode.get(code) ?? zoneMetaByCode.get('restauration')!

    // bucket zone : crée une entrée si la zone n'est pas dans la config (robustesse)
    let agg = zoneAggByCode.get(code)
    if (!agg) {
      agg = {
        code,
        nom: r.zone?.nom ?? meta.nom,
        emoji: r.zone?.emoji ?? meta.emoji,
        count_24h: 0,
        count_prev_24h: 0,
        count_en_attente: 0,
        last_report_at: null,
      }
      zoneAggByCode.set(code, agg)
    }

    const statut = r.statut as Statut

    // SLA — pendingBreaches (sur les 48h, peu importe inLast24)
    // On calcule cela avant la branche inLast24 pour ne pas rater les
    // EN_ATTENTE créés entre H-48 et H-24.
    if (statut === 'EN_ATTENTE') {
      const slaAgg = slaByZone.get(code)
      if (slaAgg && slaAgg.targetMinutes !== null) {
        const ageMs = now - c
        if (ageMs > slaAgg.targetMinutes * 60_000) {
          slaAgg.pendingBreaches++
        }
      }
    }

    if (inLast24) {
      total_24h++
      agg.count_24h++
      if (agg.last_report_at === null || c > agg.last_report_at) {
        agg.last_report_at = c
      }
      // by_team : on ne compte que sur les 24h (cahier des charges)
      byTeam[bucketTeam(r.routedTeam)]++
      // statuts
      if (statut === 'EN_ATTENTE') en_attente++
      else if (statut === 'EN_COURS') en_cours++
      else if (statut === 'RESOLU') {
        resolus_24h++
        if (r.resolvedAt) {
          const ms = r.resolvedAt.getTime() - c
          if (ms >= 0) {
            sumResolutionMs += ms
            resolvedSamples++

            // SLA — métriques de résolution
            const slaAgg = slaByZone.get(code)
            if (slaAgg) {
              slaAgg.resolvedCount++
              slaAgg.sumResolutionMs += ms
              if (slaAgg.targetMinutes !== null && ms / 60_000 <= slaAgg.targetMinutes) {
                slaAgg.resolvedWithinTarget++
              }
            }
          }
        }
      }
      if (statut === 'EN_ATTENTE') {
        agg.count_en_attente++
      }
    } else {
      agg.count_prev_24h++
    }
  }

  // --- Construction des zones ordonnées par count_en_attente desc ---
  const zones = Array.from(zoneAggByCode.values())
    .map((z) => ({
      code: z.code,
      nom: z.nom,
      emoji: z.emoji,
      count_24h: z.count_24h,
      count_en_attente: z.count_en_attente,
      last_report_at: z.last_report_at !== null ? new Date(z.last_report_at).toISOString() : null,
      trend: trendFromCounts(z.count_24h, z.count_prev_24h),
    }))
    .sort((a, b) => b.count_en_attente - a.count_en_attente || b.count_24h - a.count_24h)

  // --- Top 3 zones par count_24h ---
  const top_zones = [...zones].sort((a, b) => b.count_24h - a.count_24h).slice(0, 3)

  // --- 10 derniers reports (pré-formatés pour le feed) ---
  const recent = reports
    .filter((r) => r.createdAt.getTime() >= since24.getTime())
    .slice(0, 10)
    .map((r) => ({
      id: r.id,
      zone: r.zone
        ? { code: r.zone.code, nom: r.zone.nom, emoji: r.zone.emoji }
        : null,
      tagScanne: r.tagScanne,
      problemType: r.problemType,
      statut: r.statut,
      photoCategory: r.photoCategory ?? null,
      routedTeam: r.routedTeam ?? null,
      createdAt: r.createdAt.toISOString(),
    }))

  // --- Avg resolution en minutes (null si aucun résolu sur 24h) ---
  const avg_resolution_minutes =
    resolvedSamples > 0 ? Math.round((sumResolutionMs / resolvedSamples) / 60000) : null

  // --- SLA final : assemblage du dictionnaire par zone ---
  const sla: Record<string, {
    targetMinutes: number | null
    resolvedCount: number
    avgResolutionMinutes: number | null
    slaCompliancePercent: number
    pendingBreaches: number
  }> = {}
  for (const z of AIRPORT_ZONES) {
    const agg = slaByZone.get(z.code)
    if (!agg) continue
    sla[z.code] = {
      targetMinutes: agg.targetMinutes,
      resolvedCount: agg.resolvedCount,
      avgResolutionMinutes:
        agg.resolvedCount > 0
          ? Math.round((agg.sumResolutionMs / agg.resolvedCount) / 60000)
          : null,
      slaCompliancePercent:
        agg.resolvedCount > 0
          ? Math.round((agg.resolvedWithinTarget / agg.resolvedCount) * 100)
          : 0,
      pendingBreaches: agg.pendingBreaches,
    }
  }

  return ok({
    stats: {
      total_24h,
      en_attente,
      en_cours,
      resolus_24h,
      avg_resolution_minutes,
    },
    zones,
    top_zones,
    recent_reports: recent,
    by_team: byTeam,
    sla,
    // Signalements résolus dans les dernières 30 secondes — permet au
    // wallboard de jouer le son "résolu" même s'il vient d'être ouvert
    // ou s'il a manqué la transition de statut.
    recently_resolved: reports
      .filter((r) => r.statut === 'RESOLU' && r.resolvedAt && (now - r.resolvedAt.getTime()) < 30000)
      .map((r) => ({
        id: r.id,
        zone: r.zone ? { code: r.zone.code, nom: r.zone.nom, emoji: r.zone.emoji } : null,
        problemType: r.problemType,
        tagScanne: r.tagScanne,
        resolvedAt: r.resolvedAt,
      })),
  })
}
