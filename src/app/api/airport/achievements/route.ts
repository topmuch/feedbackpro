// ============================================================
// GET /api/airport/achievements
// ------------------------------------------------------------
// Mini-Game Staff 2.0 — expose les données de gamification pour
// le wallboard ops (section "CLASSEMENT") :
//
//   - definitions      : tous les badges possibles ( AchievementDef[] )
//   - competition      : résolutions par quart (matin/soir/nuit) sur 24h
//   - streakDays       : série actuelle de jours SLA > 90%
//   - streakSlaPct     : SLA global moyen (%)
//   - topPerformer     : #1 du classement mensuel + ses badges
//   - leaderboard      : top 10 du mois + badges par agent
//
// Le wallboard :
//   - affiche la compétition d'équipes (MATIN X | SOIR Y | NUIT Z)
//   - met en avant le top performer avec ses badges
//   - affiche le compteur de série ("🔥 N jours SLA > 90%")
//   - annonce vocalement chaque nouveau badge débloqué via Nathalie
//
// Route publique (wallboard ops). runtime = nodejs + force-dynamic.
// ============================================================

import { db } from '@/lib/db'
import { ok } from '@/lib/session'
import {
  ACHIEVEMENT_DEFS,
  checkAchievements,
  computeSlaStreak,
  getTeamCompetition,
  type Achievement,
} from '@/lib/airport-achievements'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type LeaderboardRow = {
  rank: number
  staffName: string
  points: number
  resolutions: number
  avgMinutes: number
  achievements: Achievement[]
}

type AchievementsData = {
  definitions: typeof ACHIEVEMENT_DEFS
  competition: { morning: number; evening: number; night: number }
  streakDays: number
  streakSlaPct: number
  topPerformer: (LeaderboardRow & { lastResolvedAt: string | null }) | null
  leaderboard: LeaderboardRow[]
}

export async function GET() {
  const now = new Date()
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  // --- Compétition d'équipes + streak SLA (en parallèle) ---
  const [competition, streakInfo, scores] = await Promise.all([
    getTeamCompetition(),
    computeSlaStreak(),
    db.airportAgentScore.findMany({
      where: { month },
      orderBy: { points: 'desc' },
      take: 10,
    }),
  ])

  // --- Détection des badges pour chaque agent du top 10 ---
  // Limité au top 5 pour plafonner le coût (chaque checkAchievements
  // fait quelques requêtes Prisma). Le top performer (#1) est toujours
  // évalué en premier pour leannouncement vocal côté wallboard.
  const topForBadges = scores.slice(0, 5)
  const achievementsByStaff = new Map<string, Achievement[]>()
  await Promise.all(
    topForBadges.map(async (s) => {
      const ach = await checkAchievements(s.staffName)
      achievementsByStaff.set(s.staffName, ach)
    }),
  )

  const leaderboard: LeaderboardRow[] = scores.map((s, i) => ({
    rank: i + 1,
    staffName: s.staffName,
    points: s.points,
    resolutions: s.resolutions,
    avgMinutes: s.avgMinutes,
    achievements: achievementsByStaff.get(s.staffName) ?? [],
  }))

  const topScore = scores[0] ?? null
  const topPerformer: AchievementsData['topPerformer'] = topScore
    ? {
        rank: 1,
        staffName: topScore.staffName,
        points: topScore.points,
        resolutions: topScore.resolutions,
        avgMinutes: topScore.avgMinutes,
        lastResolvedAt: topScore.lastResolvedAt
          ? topScore.lastResolvedAt.toISOString()
          : null,
        achievements: achievementsByStaff.get(topScore.staffName) ?? [],
      }
    : null

  const data: AchievementsData = {
    definitions: ACHIEVEMENT_DEFS,
    competition,
    streakDays: streakInfo.streakDays,
    streakSlaPct: streakInfo.slaPct,
    topPerformer,
    leaderboard,
  }

  return ok(data)
}
