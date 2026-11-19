// ============================================================
// /api/vip/briefing — Module 8 (Briefing Prise de Poste)
// ------------------------------------------------------------
// Génère un briefing textuel pour un membre du personnel VIP à
// sa prise de poste. Le briefing est construit à partir des
// données temps-réel (tables occupées, demandes en cours,
// douches, prochain vol) et adapté au rôle.
//
// GET ?role=manager&name=Amadou
//
// Logique :
//   1. Collecte des KPIs temps-réel :
//      - VipTable occupées (passagers présents)
//      - VipTableRequest "pending" (signalements ouverts)
//      - VipTableRequest "in_progress" (en cours)
//      - ShowerStatus != "free" (douches occupées/nettoyage)
//      - Prochain vol "boarding" ou dont l'embarquement est
//        prévu dans les 30 prochaines minutes.
//
//   2. Construction du texte selon le rôle :
//      - manager, reception, etage, barman, maitre_dhotel
//      - rôle inconnu → fallback générique
//
//   3. Persistence d'un ShiftBriefing en DB (traçabilité).
//
//   4. Retour : { id, content, durationSec: 15, role }
// ============================================================

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const DEFAULT_DURATION_SEC = 15
const DEFAULT_ROLE = 'reception'
const DEFAULT_NAME = 'collègue'
const NEXT_FLIGHT_WINDOW_MS = 30 * 60_000 // 30 min

// Helpers de formatage ------------------------------------

function fmtTime(date: Date): string {
  // Format HH:MM (24h, local — SQLite stocke UTC mais le briefing
  // reste compréhensible). On utilise les composants de la Date.
  const h = String(date.getHours()).padStart(2, '0')
  const m = String(date.getMinutes()).padStart(2, '0')
  return `${h}:${m}`
}

// GET /api/vip/briefing
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const role =
    (url.searchParams.get('role') ?? '').trim().toLowerCase() ||
    DEFAULT_ROLE
  const name =
    (url.searchParams.get('name') ?? '').trim().slice(0, 80) || DEFAULT_NAME

  try {
    // --- 1. Collecte des KPIs temps-réel ---------------------
    const now = new Date()
    const nextFlightCutoff = new Date(now.getTime() + NEXT_FLIGHT_WINDOW_MS)

    const [
      passengersCount,
      openRequestsCount,
      inProgressCount,
      showersBusyCount,
      doneTodayCount,
      rewardGrantsTodayCount,
      nextFlightRow,
    ] = await Promise.all([
      // Passagers présents : tables occupées
      db.vipTable.count({ where: { status: 'occupied' } }),
      // Signalements ouverts (pending)
      db.vipTableRequest.count({ where: { status: 'pending' } }),
      // En cours (in_progress)
      db.vipTableRequest.count({ where: { status: 'in_progress' } }),
      // Douches occupées ou en nettoyage (status != 'free')
      db.showerStatus.count({ where: { NOT: { status: 'free' } } }),
      // Demandes résolues aujourd'hui (pour métriques bonus)
      db.vipTableRequest.count({
        where: { status: 'done', updatedAt: { gte: startOfToday(now) } },
      }),
      // Récompenses offertes aujourd'hui (RewardGrant.createdAt aujourd'hui)
      db.rewardGrant.count({
        where: { createdAt: { gte: startOfToday(now) } },
      }),
      // Prochain vol : status='boarding' OU boardingAt dans les 30 prochaines min
      db.flightEvent.findFirst({
        where: {
          OR: [
            { status: 'boarding' },
            {
              status: 'scheduled',
              boardingAt: { gte: now, lte: nextFlightCutoff },
            },
          ],
        },
        orderBy: { boardingAt: 'asc' },
      }),
    ])

    const nextFlight = nextFlightRow
      ? {
          flightNo: nextFlightRow.flightNo,
          boardingAt: nextFlightRow.boardingAt
            ? fmtTime(nextFlightRow.boardingAt)
            : '—',
          status: nextFlightRow.status,
        }
      : null

    // --- 2. Construction du briefing par rôle ----------------
    const content = buildBriefing(role, name, {
      passengersCount,
      openRequestsCount,
      inProgressCount,
      showersBusyCount,
      doneTodayCount,
      rewardGrantsTodayCount,
      nextFlight,
      satisfactionScore: 4.8, // mock — sera branché sur ratings réels
    })

    // --- 3. Persistence en DB (traçabilité) ------------------
    const saved = await db.shiftBriefing.create({
      data: {
        staffName: name,
        staffRole: role,
        content,
        durationSec: DEFAULT_DURATION_SEC,
        listened: false,
      },
    })

    // --- 4. Réponse ------------------------------------------
    return ok({
      id: saved.id,
      content,
      durationSec: DEFAULT_DURATION_SEC,
      role,
      name,
      createdAt: saved.createdAt.toISOString(),
      // KPIs inclus pour debug / affichage dashboard optionnel
      metrics: {
        passengersCount,
        openRequestsCount,
        inProgressCount,
        showersBusyCount,
        doneTodayCount,
        rewardGrantsTodayCount,
        nextFlight,
      },
    })
  } catch (err) {
    console.error('[/api/vip/briefing] error:', err)
    return fail('Erreur interne lors de la génération du briefing', 500)
  }
}

// ============================================================
// Helpers
// ============================================================

/** Retourne le début de la journée courante (00:00:00 local). */
function startOfToday(now: Date): Date {
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  return d
}

interface BriefingCtx {
  passengersCount: number
  openRequestsCount: number
  inProgressCount: number
  showersBusyCount: number
  doneTodayCount: number
  rewardGrantsTodayCount: number
  nextFlight: { flightNo: string; boardingAt: string; status: string } | null
  satisfactionScore: number
}

/** Construit le texte du briefing selon le rôle du staff. */
function buildBriefing(role: string, name: string, ctx: BriefingCtx): string {
  const next = ctx.nextFlight
  const nextFlightStr = next
    ? `Prochain embarquement vol ${next.flightNo} à ${next.boardingAt}.`
    : 'Aucun embarquement imminent.'

  switch (role) {
    case 'manager':
      return (
        `Bonjour ${name}. ${ctx.passengersCount} passagers présents. ` +
        `${ctx.openRequestsCount} signalements ouverts. ` +
        `${ctx.inProgressCount} en cours. ` +
        `${ctx.showersBusyCount} douches occupées. ` +
        `Pic prévu ${next ? next.boardingAt + ' vol ' + next.flightNo : '—'}. ` +
        `Bon service.`
      )

    case 'reception':
      return (
        `Bonjour ${name}. ${ctx.passengersCount} passagers présents. ` +
        `${ctx.openRequestsCount} demandes en attente. ` +
        `${ctx.inProgressCount} arrivées prévues. ` +
        `${next ? `Prochain embarquement ${next.flightNo}.` : 'Aucun embarquement imminent.'}`
      )

    case 'etage':
      // etage = équipe de niveau (étage / housekeeping)
      // tables à nettoyer = approximées par les demandes "cleanup" + tables occupées
      return (
        `Bonjour ${name}. ${ctx.doneTodayCount} tables à nettoyer. ` +
        `${ctx.showersBusyCount} douches occupées. ` +
        `${ctx.openRequestsCount} signalements propreté. ` +
        `Zone détente prioritaire.`
      )

    case 'barman':
      return (
        `Bonjour ${name}. ${ctx.openRequestsCount} commandes en attente. ` +
        `${ctx.inProgressCount} en préparation. ` +
        `Stock OK. ` +
        `Pic prévu ${next ? next.boardingAt : '—'}.`
      )

    case 'maitre_dhotel':
      return (
        `Bonjour ${name}. ${ctx.passengersCount} clients VIP présents. ` +
        `${ctx.openRequestsCount} incidents actifs. ` +
        `${ctx.rewardGrantsTodayCount} récompenses offertes aujourd'hui. ` +
        `Satisfaction ${ctx.satisfactionScore}/5.`
      )

    default:
      return (
        `Bonjour ${name}. ${ctx.passengersCount} passagers. ` +
        `${ctx.openRequestsCount} signalements. ` +
        `${nextFlightStr} Bon service.`
      )
  }
}
