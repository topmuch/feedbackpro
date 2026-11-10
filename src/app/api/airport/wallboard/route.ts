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
//       by_team: { nettoyage, maintenance, securite, accueil, other }
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

    if (inLast24) {
      total_24h++
      agg.count_24h++
      if (agg.last_report_at === null || c > agg.last_report_at) {
        agg.last_report_at = c
      }
      // by_team : on ne compte que sur les 24h (cahier des charges)
      byTeam[bucketTeam(r.routedTeam)]++
      // statuts
      const statut = r.statut as Statut
      if (statut === 'EN_ATTENTE') en_attente++
      else if (statut === 'EN_COURS') en_cours++
      else if (statut === 'RESOLU') {
        resolus_24h++
        if (r.resolvedAt) {
          const ms = r.resolvedAt.getTime() - c
          if (ms >= 0) {
            sumResolutionMs += ms
            resolvedSamples++
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
  })
}
