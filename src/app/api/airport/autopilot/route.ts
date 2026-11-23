// ============================================================
// POST /api/airport/autopilot
// ------------------------------------------------------------
// Auto-Pilot Nathalie — décisions automatiques quand personne ne
// réagit sur le wallboard ops.
//
// Trois types de décisions évaluées à chaque appel (60s polling) :
//
//   1. AUTO_ASSIGN — Incidents EN_ATTENTE > 10 minutes sans prise
//      en charge → auto-affectation à l'équipe la plus disponible
//      (charge active EN_COURS la plus faible). Met à jour le
//      signalement (routedTeam + assignedTo + statut EN_COURS) +
//      trace dans l'audit trail (actor "denise-autopilot").
//
//   2. PATTERN_ALERT — 3+ signalements similaires (même zone) dans
//      la dernière heure → Nathalie annonce "problème systémique".
//      Aucun effet de bord BDD : juste une action retournée pour
//      que le wallboard l'annonce vocalement.
//
//   3. PREPOSITION — Une zone a un score de prédiction > 80
//      (risque imminent de pic de plaintes) → Nathalie annonce
//      "pic imminent, renforts demandés". Reproduit l'heuristique
//      du radar prédiction (/api/airport/predict) de façon allégée.
//
// Réponse (enveloppe ok/data) :
//   {
//     ok: true,
//     data: {
//       actions: [{ type, description, reportId? }],
//       generatedAt: ISO
//     }
//   }
// ============================================================

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok } from '@/lib/session'
import { logAuditEntry } from '@/lib/airport-gamification'
import { AIRPORT_ZONES } from '@/lib/airport-config'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type AutopilotAction = {
  type: 'AUTO_ASSIGN' | 'PATTERN_ALERT' | 'PREPOSITION'
  description: string
  reportId?: string
  zoneCode?: string
}

const MS_5MIN = 5 * 60 * 1000
const MS_10MIN = 10 * 60 * 1000
const MS_30MIN = 30 * 60 * 1000
const MS_60MIN = 60 * 60 * 1000

const TEAMS = ['nettoyage', 'maintenance', 'securite', 'accueil', 'logistique'] as const
type TeamKey = (typeof TEAMS)[number]

const TEAM_LABELS: Record<TeamKey, string> = {
  nettoyage: 'Nettoyage',
  maintenance: 'Maintenance',
  securite: 'Sécurité',
  accueil: 'Accueil',
  logistique: 'Logistique',
}

/** Compte la charge active (EN_COURS) par équipe — plus basse = plus disponible. */
async function activeCountByTeam(): Promise<Record<string, number>> {
  const rows = await db.airportReport.groupBy({
    by: ['routedTeam'],
    where: { statut: 'EN_COURS', routedTeam: { not: null } },
    _count: { _all: true },
  })
  const counts: Record<string, number> = {}
  for (const t of TEAMS) counts[t] = 0
  for (const row of rows) {
    if (row.routedTeam) counts[row.routedTeam] = row._count._all
  }
  return counts
}

/** Équipe la plus disponible (charge active la plus faible). Tiebreak alphabétique. */
function pickMostAvailableTeam(counts: Record<string, number>): TeamKey {
  let best: TeamKey = 'nettoyage'
  let bestCount = Infinity
  for (const t of TEAMS) {
    const c = counts[t] ?? 0
    if (c < bestCount || (c === bestCount && t < best)) {
      best = t
      bestCount = c
    }
  }
  return best
}

/**
 * Score de risque simplifié par zone (réplique allégée du radar prédiction).
 * Retourne les zones dont le score > 80 (IMMINENT).
 */
async function computeImminentZones(): Promise<
  { code: string; nom: string; score: number }[]
> {
  const now = Date.now()
  const since60 = new Date(now - MS_60MIN)

  const reports = await db.airportReport.findMany({
    where: { createdAt: { gte: since60 } },
    select: {
      createdAt: true,
      statut: true,
      zone: { select: { code: true, nom: true } },
    },
  })

  type ZoneAgg = {
    code: string
    nom: string
    countLast5: number
    countLast30: number
    countPrev30: number
    pending: number
  }
  const aggByCode = new Map<string, ZoneAgg>()
  const ensure = (code: string, nom: string): ZoneAgg => {
    let a = aggByCode.get(code)
    if (!a) {
      a = {
        code,
        nom,
        countLast5: 0,
        countLast30: 0,
        countPrev30: 0,
        pending: 0,
      }
      aggByCode.set(code, a)
    }
    return a
  }
  // Initialiser depuis la config (pour avoir toutes les zones même vides)
  for (const z of AIRPORT_ZONES) ensure(z.code, z.nom)

  const t5 = now - MS_5MIN
  const t30 = now - MS_30MIN
  const t60 = now - MS_60MIN
  for (const r of reports) {
    const c = r.createdAt.getTime()
    const code = r.zone?.code ?? 'restauration'
    const nom = r.zone?.nom ?? 'Zone'
    const a = ensure(code, nom)
    if (c >= t5) a.countLast5++
    if (c >= t30) a.countLast30++
    else if (c >= t60) a.countPrev30++
    if (r.statut === 'EN_ATTENTE' || r.statut === 'EN_COURS') a.pending++
  }

  const imminent: { code: string; nom: string; score: number }[] = []
  for (const a of aggByCode.values()) {
    const trendRatio = a.countLast30 / Math.max(a.countPrev30, 1)
    let score = a.countLast30 * 12
    if (trendRatio >= 1.5) score += 25
    if (trendRatio >= 2.0) score += 15
    if (a.pending >= 3) score += 15
    if (a.pending >= 5) score += 15
    if (a.countLast5 >= 2) score += 20
    score = Math.min(100, Math.max(0, Math.round(score)))
    if (score > 80) imminent.push({ code: a.code, nom: a.nom, score })
  }
  return imminent.sort((x, y) => y.score - x.score)
}

export async function POST(_req: NextRequest) {
  const now = Date.now()
  const actions: AutopilotAction[] = []

  // -----------------------------------------------------------
  // 1. AUTO_ASSIGN — incidents EN_ATTENTE > 10 min
  // -----------------------------------------------------------
  const tenMinAgo = new Date(now - MS_10MIN)
  const stalePending = await db.airportReport.findMany({
    where: {
      statut: 'EN_ATTENTE',
      createdAt: { lte: tenMinAgo },
    },
    orderBy: { createdAt: 'asc' },
    take: 5, // plafonné pour éviter une rafale massive
    include: { zone: { select: { code: true, nom: true } } },
  })

  if (stalePending.length > 0) {
    const counts = await activeCountByTeam()
    for (const report of stalePending) {
      // Si déjà routé vers une équipe et EN_COURS, on skip (ne devrait pas
      // arriver ici puisque statut=EN_ATTENTE, mais défensif).
      if (report.routedTeam && report.statut !== 'EN_ATTENTE') continue
      const team = pickMostAvailableTeam(counts)
      const fromStatut = report.statut
      await db.airportReport.update({
        where: { id: report.id },
        data: {
          routedTeam: team,
          assignedTo: `team:${team}`,
          statut: 'EN_COURS',
        },
      })
      // Incrémente la charge active pour le prochain pick
      counts[team] = (counts[team] ?? 0) + 1
      await logAuditEntry({
        reportId: report.id,
        action: 'ASSIGNED',
        actor: 'denise-autopilot',
        fromStatut,
        toStatut: 'EN_COURS',
        note: `Auto-pilot — signalement non pris en charge > 10min → affecté à ${TEAM_LABELS[team]} (charge active: ${counts[team] - 1})`,
      })
      actions.push({
        type: 'AUTO_ASSIGN',
        description: `Signalement ${report.id.slice(-8)} (${report.zone?.nom ?? 'Zone'}) en attente depuis > 10 min — auto-affecté à l'équipe ${TEAM_LABELS[team]}.`,
        reportId: report.id,
      })
    }
  }

  // -----------------------------------------------------------
  // 2. PATTERN_ALERT — 3+ signalements même zone dans la dernière heure
  // -----------------------------------------------------------
  const since1h = new Date(now - MS_60MIN)
  const recentReports = await db.airportReport.findMany({
    where: { createdAt: { gte: since1h } },
    select: {
      createdAt: true,
      problemType: true,
      zone: { select: { code: true, nom: true } },
    },
  })
  const byZone = new Map<
    string,
    { code: string; nom: string; count: number; sampleProblem: string }
  >()
  for (const r of recentReports) {
    const code = r.zone?.code ?? 'inconnu'
    const nom = r.zone?.nom ?? 'Zone inconnue'
    const e = byZone.get(code) ?? { code, nom, count: 0, sampleProblem: r.problemType }
    e.count++
    byZone.set(code, e)
  }
  for (const e of byZone.values()) {
    if (e.count >= 3) {
      actions.push({
        type: 'PATTERN_ALERT',
        description: `Problème systémique sur ${e.nom} — ${e.count} signalements en 1 heure (${e.sampleProblem}).`,
        zoneCode: e.code,
      })
    }
  }

  // -----------------------------------------------------------
  // 3. PREPOSITION — score de prédiction > 80
  // -----------------------------------------------------------
  const imminent = await computeImminentZones()
  for (const z of imminent.slice(0, 2)) {
    actions.push({
      type: 'PREPOSITION',
      description: `Pic imminent sur ${z.nom} — score ${z.score}/100. Renforts demandés, pré-positionner les équipes.`,
      zoneCode: z.code,
    })
  }

  return ok({
    actions,
    generatedAt: new Date(now).toISOString(),
  })
}
