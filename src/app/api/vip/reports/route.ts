// ============================================================
// /api/vip/reports — Rapports manager (traçabilité + preuve de ROI)
// ------------------------------------------------------------
// GET ?month=YYYY-MM (défaut : mois courant)
//   Métriques période courante + période précédente (comparaison) :
//   - Incidents résolus + temps moyen de résolution
//   - Satisfaction (moyenne des étoiles des demandes "rating")
//   - Récompenses offertes (nombre + coût FCFA)
//   - Utilisation douches (réservations)
//   - Heures de pointe (visites + demandes par heure)
//   - Upsells : CA + commissions (10%)
//   - Prêts express (demandes)
//   - Lost & Found (objets déclarés / restitués)
// GET ?format=csv → export CSV (compatible Excel, séparateur ;)
// Le 1er du mois, /api/cron/rapports-mensuels-vip envoie le PDF/Excel
// au manager (email simulé en mode démo sans clés).
// ============================================================

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, getSessionUser } from '@/lib/session'
import { parseJsonObject } from '@/lib/vip-clients'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const COMMISSION_RATE = 0.1 // 10% de commission sur les ventes upsell

function bornesMois(month?: string | null): { debut: Date; fin: Date; label: string } {
  const now = new Date()
  let annee = now.getUTCFullYear()
  let mois = now.getUTCMonth() // 0-11
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    annee = parseInt(month.slice(0, 4), 10)
    mois = parseInt(month.slice(5, 7), 10) - 1
  }
  const debut = new Date(Date.UTC(annee, mois, 1, 0, 0, 0))
  const fin = new Date(Date.UTC(annee, mois + 1, 1, 0, 0, 0))
  const label = `${String(mois + 1).padStart(2, '0')}/${annee}`
  return { debut, fin, label }
}

async function metriquesPeriode(debut: Date, fin: Date) {
  const [problemes, resolus, ratings, grants, douches, orders, prets, lostfound] = await Promise.all([
    db.vipTableRequest.findMany({
      where: { type: 'problem', createdAt: { gte: debut, lt: fin } },
      select: { status: true, createdAt: true, updatedAt: true },
    }),
    db.vipTableRequest.findMany({
      where: { type: 'problem', status: 'done', updatedAt: { gte: debut, lt: fin } },
      select: { createdAt: true, updatedAt: true },
    }),
    db.vipTableRequest.findMany({
      where: { type: 'rating', createdAt: { gte: debut, lt: fin } },
      select: { metadata: true },
    }),
    db.rewardGrant.findMany({
      where: { deliveredAt: { gte: debut, lt: fin } },
      include: { reward: { select: { costFcfa: true, title: true } } },
    }),
    db.showerReservation.findMany({
      where: { reservedAt: { gte: debut, lt: fin }, status: { not: 'cancelled' } },
      select: { id: true, status: true },
    }),
    db.vipOrder.findMany({
      where: { createdAt: { gte: debut, lt: fin }, status: { not: 'cancelled' } },
      select: { totalFcfa: true, createdAt: true },
    }),
    db.loanRequest.count({ where: { requestedAt: { gte: debut, lt: fin } } }),
    db.lostFoundItem.findMany({
      where: { createdAt: { gte: debut, lt: fin } },
      select: { status: true },
    }),
  ])

  const incidentsCrees = problemes.length
  const incidentsResolus = resolus.length
  const tempsMoyenMin =
    resolus.length > 0
      ? resolus.reduce((acc, r) => acc + (r.updatedAt.getTime() - r.createdAt.getTime()) / 60000, 0) / resolus.length
      : null

  // Satisfaction : moyenne des étoiles (metadata.rating 1-5)
  const etoiles = ratings
    .map((r) => parseJsonObject<{ rating?: number }>(r.metadata, {}).rating)
    .filter((n): n is number => typeof n === 'number' && n >= 1 && n <= 5)
  const satisfaction = etoiles.length ? etoiles.reduce((a, b) => a + b, 0) / etoiles.length : null

  const recompensesCount = grants.length
  const recompensesCout = grants.reduce((acc, g) => acc + (g.reward?.costFcfa ?? 0), 0)

  // Utilisation douches : toute réservation non annulée compte comme une utilisation
  const douchesUtilisees = douches.length
  const douchesTotal = douches.length

  const upsellCa = orders.reduce((acc, o) => acc + o.totalFcfa, 0)
  const upsellCommissions = Math.round(upsellCa * COMMISSION_RATE)
  const upsellNb = orders.length

  // Heures de pointe : distribution par heure (visites via demandes + commandes)
  const heures: number[] = new Array(24).fill(0)
  for (const p of problemes) heures[p.createdAt.getHours()]++
  for (const o of orders) heures[o.createdAt.getHours()]++
  const heurePointe = heures.reduce((max, v, i) => (v > heures[max] ? i : max), 0)
  const totalActivite = heures.reduce((a, b) => a + b, 0)

  const lostFoundTotal = lostfound.length
  const lostFoundRestitues = lostfound.filter((l) => l.status === 'returned').length

  return {
    incidentsCrees,
    incidentsResolus,
    tempsMoyenMin: tempsMoyenMin !== null ? Math.round(tempsMoyenMin * 10) / 10 : null,
    satisfaction: satisfaction !== null ? Math.round(satisfaction * 10) / 10 : null,
    satisfactionNb: etoiles.length,
    recompensesCount,
    recompensesCout,
    douchesTotal,
    douchesUtilisees,
    upsellCa,
    upsellCommissions,
    upsellNb,
    pretsCount: prets,
    lostFoundTotal,
    lostFoundRestitues,
    heurePointe,
    heures,
    totalActivite,
  }
}

function delta(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null) return null
  if (previous === 0) return current > 0 ? 100 : null
  return Math.round(((current - previous) / previous) * 1000) / 10
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)

  // Export CSV
  if (searchParams.get('format') === 'csv') {
    const user = await getSessionUser(req)
    if (!user) return fail('Non authentifié', 401)
    const { debut, fin, label } = bornesMois(searchParams.get('month'))
    const m = await metriquesPeriode(debut, fin)
    const lignes = [
      'Rapport VIP Lounge',
      `Période;${label}`,
      '',
      'Indicateur;Valeur',
      `Incidents créés;${m.incidentsCrees}`,
      `Incidents résolus;${m.incidentsResolus}`,
      `Temps moyen de résolution (min);${m.tempsMoyenMin ?? '—'}`,
      `Satisfaction moyenne (étoiles/5);${m.satisfaction ?? '—'} (${m.satisfactionNb} avis)`,
      `Récompenses offertes;${m.recompensesCount}`,
      `Coût récompenses (FCFA);${m.recompensesCout}`,
      `Réservations douches;${m.douchesTotal}`,
      `Douches utilisées;${m.douchesUtilisees}`,
      `Ventes upsell (FCFA);${m.upsellCa}`,
      `Commissions générées (FCFA);${m.upsellCommissions}`,
      `Commandes upsell;${m.upsellNb}`,
      `Prêts express;${m.pretsCount}`,
      `Lost & Found déclarés;${m.lostFoundTotal}`,
      `Lost & Found restitués;${m.lostFoundRestitues}`,
      `Heure de pointe;${String(m.heurePointe).padStart(2, '0')}h`,
    ]
    const csv = '\uFEFF' + lignes.join('\n')
    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="rapport-vip-${label.replace('/', '-')}.csv"`,
      },
    })
  }

  const user = await getSessionUser(req)
  if (!user) return fail('Non authentifié', 401)

  const moisCourant = bornesMois(searchParams.get('month'))
  const moisPrecedent = bornesMois(
    new Date(moisCourant.debut.getTime() - 24 * 3600 * 1000).toISOString().slice(0, 7),
  )

  const [courant, precedent] = await Promise.all([
    metriquesPeriode(moisCourant.debut, moisCourant.fin),
    metriquesPeriode(moisPrecedent.debut, moisPrecedent.fin),
  ])

  return ok({
    periode: { label: moisCourant.label, debut: moisCourant.debut.toISOString(), fin: moisCourant.fin.toISOString() },
    periodePrecedente: { label: moisPrecedent.label },
    metriques: {
      ...courant,
      deltas: {
        incidentsResolus: delta(courant.incidentsResolus, precedent.incidentsResolus),
        tempsMoyenMin: delta(courant.tempsMoyenMin, precedent.tempsMoyenMin),
        satisfaction: delta(courant.satisfaction, precedent.satisfaction),
        recompensesCout: delta(courant.recompensesCout, precedent.recompensesCout),
        douchesUtilisees: delta(courant.douchesUtilisees, precedent.douchesUtilisees),
        upsellCa: delta(courant.upsellCa, precedent.upsellCa),
        pretsCount: delta(courant.pretsCount, precedent.pretsCount),
        lostFoundTotal: delta(courant.lostFoundTotal, precedent.lostFoundTotal),
      },
    },
    comparaison: {
      precedent: { ...precedent, heures: undefined },
    },
  })
}
