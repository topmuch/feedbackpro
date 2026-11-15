// ============================================================
// airport-achievements.ts — Gamification Staff 2.0
// ------------------------------------------------------------
// Mini-jeu staff : achievements (badges) + compétition d'équipes
// par quart de travail (matin / soir / nuit).
//
// Définitions des achievements :
//   - Speed Demon   — résoudre 5 incidents en < 5min chacun (même jour)
//   - Firefighter   — résoudre 3 incidents critiques en 1h
//   - Night Owl     — 20 résolutions pendant le quart de nuit (22h-6h)
//   - Zone Master   — garder une zone calme pendant 24h
//   - Streak Master — 12 jours consécutifs avec SLA > 90%
//
// `checkAchievements(staffName)` interroge AirportStaffScan (RESOLVE)
// + AirportReport (timing/zone) + AirportAgentScore (résolutions du
// mois) + AirportSla (streak SLA) pour détecter les badges débloqués.
//
// `getTeamCompetition()` compte les résolutions par quart sur 24h.
//
// Le wallboard annonce vocalement chaque nouveau badge via Denise :
//   "Achievement débloqué: Speed Demon! 5 incidents résolus en moins
//    de 5 minutes!"
// ============================================================

import { db } from '@/lib/db'

// ---------------------------------------------------------------
// Types & définitions
// ---------------------------------------------------------------

export type AchievementDef = {
  id: string
  label: string
  emoji: string
  description: string
}

export type Achievement = AchievementDef & {
  /** Timestamp ISO de détection (non persisté — recalculé à chaque appel). */
  unlockedAt?: string
  /** Info contextuelle (jour, zone, compte…) affichée sous le badge. */
  meta?: string
}

export const ACHIEVEMENT_DEFS: AchievementDef[] = [
  {
    id: 'speed_demon',
    label: 'Speed Demon',
    emoji: '⚡',
    description: 'Résoudre 5 incidents en moins de 5 minutes chacun (même journée)',
  },
  {
    id: 'firefighter',
    label: 'Firefighter',
    emoji: '🔥',
    description: 'Résoudre 3 incidents critiques en 1 heure',
  },
  {
    id: 'night_owl',
    label: 'Night Owl',
    emoji: '🦉',
    description: '20 résolutions pendant le quart de nuit (22h-6h)',
  },
  {
    id: 'zone_master',
    label: 'Zone Master',
    emoji: '🗺️',
    description: 'Garder une zone calme pendant 24 heures',
  },
  {
    id: 'streak_master',
    label: 'Streak Master',
    emoji: '🏆',
    description: '12 jours consécutifs avec SLA > 90%',
  },
]

export type TeamCompetition = {
  morning: number
  evening: number
  night: number
}

export type SlaStreakInfo = {
  streakDays: number
  slaPct: number
}

// ---------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`
}

/** Un signalement est "critique" si routé sécurité ou zone sûreté/urgence/infirmerie. */
function isCriticalReport(
  zoneCode: string | null,
  routedTeam: string | null,
): boolean {
  if (routedTeam === 'securite') return true
  if (!zoneCode) return false
  if (zoneCode.startsWith('sec_')) return true
  if (zoneCode.startsWith('urg_')) return true
  if (zoneCode.startsWith('srv_medical')) return true
  return false
}

// ---------------------------------------------------------------
// SLA streak (global) — utilisé par Streak Master + wallboard
// ---------------------------------------------------------------

/**
 * Calcule la série (streak) actuelle de jours consécutifs avec SLA ≥ 90%.
 * Parcourt les 30 derniers jours en partant d'aujourd'hui.
 * Un jour "compte" s'il a ≥ 1 résolution ET ≥ 90% dans les temps.
 */
export async function computeSlaStreak(): Promise<SlaStreakInfo> {
  const slas = await db.airportSla.findMany({ where: { active: true } })
  if (slas.length === 0) return { streakDays: 0, slaPct: 0 }
  const targetByZone = new Map(slas.map((s) => [s.zoneCode, s.targetMinutes]))

  const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const reports = await db.airportReport.findMany({
    where: { statut: 'RESOLU', resolvedAt: { not: null, gte: since30d } },
    select: {
      createdAt: true,
      resolvedAt: true,
      zone: { select: { code: true } },
    },
  })

  const byDay = new Map<string, { within: number; total: number }>()
  for (const r of reports) {
    if (!r.resolvedAt) continue
    const key = dayKey(r.resolvedAt)
    const entry = byDay.get(key) ?? { within: 0, total: 0 }
    const target = r.zone?.code ? targetByZone.get(r.zone.code) : undefined
    if (target !== undefined && target !== null) {
      const elapsedMin = (r.resolvedAt.getTime() - r.createdAt.getTime()) / 60000
      if (elapsedMin <= target) entry.within++
      entry.total++
    }
    byDay.set(key, entry)
  }

  // Streak : remonte à partir d'aujourd'hui. Si aujourd'hui n'a pas encore
  // de résolutions, on tolère (le jour n'est pas "raté", juste vide) en
  // avançant au jour précédent — pour ne pas casser la série en début
  // de journée.
  let streak = 0
  const today = new Date()
  for (let i = 0; i < 30; i++) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    const key = dayKey(d)
    const entry = byDay.get(key)
    if (!entry || entry.total === 0) {
      // Jour sans résolutions : on autorise le skip uniquement pour aujourd'hui.
      if (i === 0) continue
      break
    }
    const pct = (entry.within / entry.total) * 100
    if (pct >= 90) streak++
    else break
  }

  const allTotal = [...byDay.values()].reduce((s, e) => s + e.total, 0)
  const allWithin = [...byDay.values()].reduce((s, e) => s + e.within, 0)
  const slaPct = allTotal > 0 ? Math.round((allWithin / allTotal) * 100) : 0

  return { streakDays: streak, slaPct }
}

// ---------------------------------------------------------------
// checkAchievements — détection des badges d'un agent
// ---------------------------------------------------------------

type ResolvedRec = {
  reportId: string
  createdAt: Date
  resolvedAt: Date | null
  zoneCode: string | null
  zoneNom: string | null
  routedTeam: string | null
  elapsedMin: number | null
}

/**
 * Détecte tous les achievements actuellement débloqués par un agent.
 * Croise AirportStaffScan (RESOLVE) → AirportReport (timing, zone) +
 * AirportAgentScore (résolutions du mois) + AirportSla (streak).
 *
 * @param staffName - nom de l'agent (tel que saisi dans la PWA staff).
 * @returns liste des achievements débloqués (peut être vide).
 */
export async function checkAchievements(staffName: string): Promise<Achievement[]> {
  if (!staffName) return []
  const earned: Achievement[] = []
  const nowIso = new Date().toISOString()

  // --- Charge toutes les résolutions liées à ce staff ---
  const scans = await db.airportStaffScan.findMany({
    where: { staffName, action: 'RESOLVE' },
    select: { reportId: true, createdAt: true },
  })
  const reportIds = scans
    .map((s) => s.reportId)
    .filter((id): id is string => !!id)
  const reports = reportIds.length
    ? await db.airportReport.findMany({
        where: { id: { in: reportIds } },
        include: { zone: { select: { code: true, nom: true } } },
      })
    : []
  const reportById = new Map(reports.map((r) => [r.id, r]))

  const resolved: ResolvedRec[] = []
  for (const s of scans) {
    const r = s.reportId ? reportById.get(s.reportId) : null
    if (!r) continue
    const resolvedAt = r.resolvedAt ?? s.createdAt
    const elapsedMin = r.resolvedAt
      ? (r.resolvedAt.getTime() - r.createdAt.getTime()) / 60000
      : null
    resolved.push({
      reportId: r.id,
      createdAt: r.createdAt,
      resolvedAt,
      zoneCode: r.zone?.code ?? null,
      zoneNom: r.zone?.nom ?? null,
      routedTeam: r.routedTeam ?? null,
      elapsedMin,
    })
  }

  // --- Speed Demon : 5 résolutions < 5min le même jour ---
  const byDay = new Map<string, number>()
  for (const r of resolved) {
    if (r.resolvedAt === null || r.elapsedMin === null) continue
    if (r.elapsedMin >= 5) continue
    const key = dayKey(r.resolvedAt)
    byDay.set(key, (byDay.get(key) ?? 0) + 1)
  }
  let speedDemonDay: string | null = null
  let speedDemonCount = 0
  for (const [day, count] of byDay) {
    if (count >= 5 && count > speedDemonCount) {
      speedDemonDay = day
      speedDemonCount = count
    }
  }
  if (speedDemonDay) {
    earned.push({
      ...ACHIEVEMENT_DEFS[0]!,
      unlockedAt: nowIso,
      meta: `${speedDemonCount} résolutions < 5min le ${speedDemonDay}`,
    })
  }

  // --- Firefighter : 3 critiques résolus en 1h ---
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)
  const criticalsLast1h = resolved.filter((r) => {
    if (r.resolvedAt === null) return false
    if (r.resolvedAt < oneHourAgo) return false
    return isCriticalReport(r.zoneCode, r.routedTeam)
  })
  if (criticalsLast1h.length >= 3) {
    earned.push({
      ...ACHIEVEMENT_DEFS[1]!,
      unlockedAt: nowIso,
      meta: `${criticalsLast1h.length} critiques en 1h`,
    })
  }

  // --- Night Owl : 20 résolutions de nuit (22h-6h) ---
  const nightCount = resolved.filter((r) => {
    if (r.resolvedAt === null) return false
    const h = r.resolvedAt.getHours()
    return h >= 22 || h < 6
  }).length
  if (nightCount >= 20) {
    earned.push({
      ...ACHIEVEMENT_DEFS[2]!,
      unlockedAt: nowIso,
      meta: `${nightCount} résolutions de nuit`,
    })
  }

  // --- Zone Master : une zone gérée par le staff est calme depuis 24h ---
  const staffZoneCodes = new Set(
    resolved.map((r) => r.zoneCode).filter((c): c is string => !!c),
  )
  if (staffZoneCodes.size > 0) {
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const recentZoneReports = await db.airportReport.findMany({
      where: { createdAt: { gte: since24h } },
      select: { zone: { select: { code: true } } },
    })
    const busyZones = new Set(
      recentZoneReports
        .map((r) => r.zone?.code ?? null)
        .filter((c): c is string => !!c),
    )
    const calmZones = [...staffZoneCodes].filter((c) => !busyZones.has(c))
    if (calmZones.length > 0) {
      earned.push({
        ...ACHIEVEMENT_DEFS[3]!,
        unlockedAt: nowIso,
        meta: `Zone calme 24h: ${calmZones.join(', ')}`,
      })
    }
  }

  // --- Streak Master : 12 jours consécutifs SLA > 90% ---
  const streakInfo = await computeSlaStreak()
  if (streakInfo.streakDays >= 12) {
    // Attribué au staff s'il a au moins 1 résolution ce mois-ci
    const now = new Date()
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const score = await db.airportAgentScore.findUnique({
      where: { staffName_month: { staffName, month } },
    })
    if (score && score.resolutions > 0) {
      earned.push({
        ...ACHIEVEMENT_DEFS[4]!,
        unlockedAt: nowIso,
        meta: `${streakInfo.streakDays} jours SLA > 90%`,
      })
    }
  }

  return earned
}

// ---------------------------------------------------------------
// getTeamCompetition — résolutions par quart (24h)
// ---------------------------------------------------------------

/**
 * Compte les résolutions par quart de travail sur les dernières 24h.
 *   - Matin : 6h → 14h
 *   - Soir  : 14h → 22h
 *   - Nuit  : 22h → 6h
 */
export async function getTeamCompetition(): Promise<TeamCompetition> {
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const reports = await db.airportReport.findMany({
    where: { statut: 'RESOLU', resolvedAt: { not: null, gte: since24h } },
    select: { resolvedAt: true },
  })
  let morning = 0
  let evening = 0
  let night = 0
  for (const r of reports) {
    if (!r.resolvedAt) continue
    const h = r.resolvedAt.getHours()
    if (h >= 6 && h < 14) morning++
    else if (h >= 14 && h < 22) evening++
    else night++
  }
  return { morning, evening, night }
}
