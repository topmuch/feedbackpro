// ============================================================
// POST /api/airport/check-record
// ------------------------------------------------------------
// Vérifie si une résolution constitue un "record personnel" et/ou
// respecte le SLA cible de la zone. Appelé par la PWA staff après
// la résolution d'un incident pour déclencher la voix Nathalie +
// le son "level up" + l'overlay de célébration.
//
// Body JSON :
//   {
//     staffName: string,         // "Amadou Diallo"
//     resolutionMinutes: number, // 3
//     zoneCode: string           // "sanitaires"
//   }
//
// Réponse :
//   {
//     ok: true,
//     data: {
//       isRecord: boolean,        // true → nouveau record perso (all-time)
//       isUnderTarget: boolean,   // true → résolu ≤ SLA cible
//       targetMinutes: number | null,
//       previousAvg: number,      // moyenne mensuelle AVANT cette résolution
//       resolutionMinutes: number,
//       firstResolution: boolean  // true → première résolution all-time
//     }
//   }
//
// Logique :
//   1. Lecture du AirportAgentScore du mois courant (staffName + month).
//      NB : à ce stade, le score a DÉJÀ été mis à jour par la route
//      /api/airport/staff-scan (action=RESOLVE) qui appelle
//      updateAgentScore(). Donc score.totalMinutes / score.resolutions
//      incluent la résolution courante.
//
//   2. Lecture du AirportSla pour la zone (targetMinutes).
//
//   3. Comptage des entrées AirportAuditTrail (action=RESOLVED,
//      actor=staffName) :
//      - totalCount : toutes les entrées résolues de l'agent
//        (en production, INCLUT l'entrée courante écrite par staff-scan)
//      - strictlyLessCount : entrées avec elapsedMin < resolutionMinutes
//        (entrées passées strictement plus rapides que la courante)
//
//   4. previousAvg : moyenne AVANT la résolution courante, recalculée
//      à partir du score mis à jour :
//        prevTotal = totalMinutes - resolutionMinutes
//        prevResolutions = resolutions - 1
//        previousAvg = round(prevTotal / prevResolutions)
//
//   5. firstResolution : vrai si l'agent n'avait jamais résolu
//      d'incident avant celui-ci. Détection : totalCount <= 1 (la
//      seule entrée dans l'audit trail est l'entrée courante, ou
//      l'audit trail est vide — cas défensif).
//
//   6. isRecord : true si
//      - firstResolution (triviallement record — premier = meilleur), OU
//      - strictlyLessCount === 0 (aucune résolution passée strictement
//        plus rapide → la courante est la meilleure, ex-aequo toléré), OU
//      - score existe et resolutionMinutes < previousAvg (plus rapide
//        que la moyenne mensuelle précédente).
// ============================================================

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type CheckRecordData = {
  isRecord: boolean
  isUnderTarget: boolean
  targetMinutes: number | null
  previousAvg: number
  resolutionMinutes: number
  firstResolution: boolean
}

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return fail('Payload JSON invalide', 400)
  }

  const b = body as {
    staffName?: string
    resolutionMinutes?: number
    zoneCode?: string
  }

  if (
    !b.staffName ||
    typeof b.staffName !== 'string' ||
    typeof b.resolutionMinutes !== 'number' ||
    Number.isNaN(b.resolutionMinutes) ||
    !b.zoneCode ||
    typeof b.zoneCode !== 'string'
  ) {
    return fail('staffName, resolutionMinutes et zoneCode requis', 400)
  }

  const staffName = b.staffName.trim()
  const resolutionMinutes = Math.max(0, Math.round(b.resolutionMinutes))
  const zoneCode = b.zoneCode.trim()

  // 1) Mois courant (YYYY-MM)
  const now = new Date()
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  // 2) Score agent du mois courant + SLA zone + compteurs audit trail
  //    On lance les 3 requêtes en parallèle.
  const [score, sla, totalCount, strictlyLessCount] = await Promise.all([
    db.airportAgentScore.findUnique({
      where: { staffName_month: { staffName, month } },
    }),
    db.airportSla.findUnique({ where: { zoneCode } }),
    // totalCount : toutes les résolutions de l'agent (en production,
    // l'entrée courante est déjà présente car staff-scan a tourné avant).
    db.airportAuditTrail.count({
      where: {
        actor: staffName,
        action: 'RESOLVED',
      },
    }),
    // strictlyLessCount : entrées passées strictement plus rapides que
    // la résolution courante. L'entrée courante a elapsedMin =
    // resolutionMinutes, donc elle n'est PAS comptée (strictement <).
    db.airportAuditTrail.count({
      where: {
        actor: staffName,
        action: 'RESOLVED',
        elapsedMin: { lt: resolutionMinutes },
      },
    }),
  ])

  const targetMinutes = sla?.targetMinutes ?? null

  // 3) previousAvg : moyenne mensuelle AVANT la résolution courante.
  //    Le score a déjà été mis à jour par staff-scan (updateAgentScore),
  //    donc score.totalMinutes et score.resolutions incluent la courante.
  let previousAvg = 0
  if (score && score.resolutions > 1) {
    const prevTotal = score.totalMinutes - resolutionMinutes
    const prevResolutions = score.resolutions - 1
    if (prevResolutions > 0 && prevTotal >= 0) {
      previousAvg = Math.round(prevTotal / prevResolutions)
    }
  }

  // 4) firstResolution : l'agent n'avait jamais résolu d'incident avant.
  //    En production (staff-scan a tourné), l'audit trail contient au
  //    minimum l'entrée courante. totalCount === 0 → cas défensif
  //    (logAuditEntry aurait échoué silencieusement). totalCount === 1
  //    → seule l'entrée courante est présente → première résolution.
  //    totalCount >= 2 → au moins une résolution passée → PAS première.
  const firstResolution = totalCount <= 1

  // 5) isRecord :
  //    a. firstResolution → record (premier = meilleur)
  //    b. strictlyLessCount === 0 → aucune résolution passée strictement
  //       plus rapide → la courante est la meilleure (ex-aequo toléré
  //       comme "record" : signifie "pas plus lent que le meilleur").
  //    c. resolutionMinutes < previousAvg (plus rapide que la moyenne
  //       mensuelle précédente) → on compte comme record (gamification
  //       souple — "faster than average" mérite félicitations).
  let isRecord = false
  if (firstResolution) {
    isRecord = true
  } else if (strictlyLessCount === 0) {
    isRecord = true
  } else if (score && score.resolutions > 1 && resolutionMinutes < previousAvg) {
    isRecord = true
  }

  // 6) isUnderTarget : résolu dans le temps cible SLA (≤ targetMinutes).
  const isUnderTarget = targetMinutes !== null && resolutionMinutes <= targetMinutes

  const data: CheckRecordData = {
    isRecord,
    isUnderTarget,
    targetMinutes,
    previousAvg,
    resolutionMinutes,
    firstResolution,
  }

  return ok(data)
}
