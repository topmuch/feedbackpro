// ============================================================
// /api/vip/demo-data — Injection d'un état de démo réaliste
// ------------------------------------------------------------
// POST (session staff requise).
//
// Objectif : en UN clic (bouton « Données démo » du dashboard),
// transformer un salon vide (toutes les tables vertes, timers
// périmés à 4024 min…) en état de service CRÉDIBLE pour démo :
//   - 3 tables occupées (clients VIP nommés, arrivées étalées)
//   - 1 table en problème (terracotta)
//   - 1 table réservée (or)
//   - 2 demandes actives à la table (pending / in_progress)
//   - Buffet frais : timer réaliste (28 min / 12 min / 5 min),
//     1 item volontairement en léger retard → alerte honnête
//     « dernière vérification il y a 28 min » (jamais 4024 !)
//   - 1 douche occupée + 1 en nettoyage → alerte douce
//   - 1 signalement VIP ouvert (zone relaxation) → alerte amethyst
//
// Idempotent : chaque POST RESET l'état démo (tables libres
// d'abord, demandes démo précédentes marquées done).
// ============================================================

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, getSessionUser } from '@/lib/session'
import { getZonesByTenant } from '@/lib/airport-config'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const VIP_ZONE_CODES = getZonesByTenant('vip_lounge').map((z) => z.code)

/** Génère un token QR unique identique à /api/vip/tables. */
function genererQrToken(): string {
  return 't' + Math.random().toString(36).slice(2) + Date.now().toString(36)
}

/** Auto-seed des 12 tables standards (même répartition que /api/vip/tables). */
async function seedTablesSiVide(): Promise<void> {
  const count = await db.vipTable.count()
  if (count > 0) return
  const zones: Array<{ zone: string; n: number }> = [
    { zone: 'main', n: 5 },
    { zone: 'buffet', n: 3 },
    { zone: 'relaxation', n: 2 },
    { zone: 'meeting', n: 2 },
  ]
  let i = 1
  const data: Array<{ tableNumber: string; zone: string; seats: number; qrToken: string }> = []
  for (const z of zones) {
    for (let k = 0; k < z.n; k++) {
      data.push({
        tableNumber: `T-${String(i).padStart(2, '0')}`,
        zone: z.zone,
        seats: z.zone === 'meeting' ? 6 : z.zone === 'buffet' ? 2 : 4,
        qrToken: genererQrToken(),
      })
      i++
    }
  }
  await db.vipTable.createMany({ data })
}

const minAgo = (m: number) => new Date(Date.now() - m * 60_000)
const inMin = (m: number) => new Date(Date.now() + m * 60_000)

export async function POST(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user) return fail('Non authentifié', 401)

  try {
    // --- 0. Tables garanties ---
    await seedTablesSiVide()
    const tables = await db.vipTable.findMany({ orderBy: { tableNumber: 'asc' } })
    const byNumber = new Map(tables.map((t) => [t.tableNumber, t]))

    // --- 1. RESET : demandes démo précédentes → done, tables → libres ---
    await db.vipTableRequest.updateMany({
      where: { status: { in: ['pending', 'in_progress'] }, tableId: { not: null } },
      data: { status: 'done' },
    })
    await db.vipTable.updateMany({
      data: { status: 'free', clientName: null, clientVipLevel: null, arrivedAt: null },
    })

    // --- 2. Tables : 3 occupées + 1 problème + 1 réservée ---
    const OCCUPIED: Array<{ no: string; name: string; level: string; arrivedMinAgo: number }> = [
      { no: 'T-01', name: 'Sophie Marchand', level: 'diamond', arrivedMinAgo: 70 },
      { no: 'T-03', name: 'Alexandre Laurent', level: 'platinum', arrivedMinAgo: 45 },
      { no: 'T-06', name: 'Karim Benali', level: 'gold', arrivedMinAgo: 25 },
    ]
    for (const occ of OCCUPIED) {
      const t = byNumber.get(occ.no)
      if (!t) continue
      await db.vipTable.update({
        where: { id: t.id },
        data: {
          status: 'occupied',
          clientName: occ.name,
          clientVipLevel: occ.level,
          arrivedAt: minAgo(occ.arrivedMinAgo),
        },
      })
    }
    const problemTable = byNumber.get('T-09')
    if (problemTable) {
      await db.vipTable.update({
        where: { id: problemTable.id },
        data: { status: 'problem', clientName: null, clientVipLevel: null, arrivedAt: null },
      })
    }
    const reservedTable = byNumber.get('T-11')
    if (reservedTable) {
      await db.vipTable.update({
        where: { id: reservedTable.id },
        data: { status: 'reserved', clientName: 'Yuki Tanaka', clientVipLevel: 'platinum', arrivedAt: null },
      })
    }

    // --- 3. Demandes actives crédibles ---
    const t01 = byNumber.get('T-01')
    const t03 = byNumber.get('T-03')
    if (t01) {
      await db.vipTableRequest.create({
        data: {
          tableId: t01.id,
          type: 'refreshment',
          message: "Deux coupes d'eau pétillante, svp",
          status: 'pending',
          createdAt: minAgo(9),
        },
      })
    }
    if (t03) {
      await db.vipTableRequest.create({
        data: {
          tableId: t03.id,
          type: 'concierge',
          message: 'Souhaite réserver une salle de réunion',
          status: 'in_progress',
          staffName: 'Nadia Cherif',
          createdAt: minAgo(14),
        },
      })
    }

    // Recalcul du compteur activeRequests par table
    const counts = await db.vipTableRequest.groupBy({
      by: ['tableId'],
      where: { status: { in: ['pending', 'in_progress'] }, tableId: { not: null } },
      _count: { _all: true },
    })
    for (const c of counts) {
      if (!c.tableId) continue
      await db.vipTable.update({
        where: { id: c.tableId },
        data: { activeRequests: c._count._all },
      })
    }
    // Tables reset → compteur 0 (sécurité)
    for (const t of tables) {
      if (!counts.some((c) => c.tableId === t.id)) {
        await db.vipTable.updateMany({
          where: { id: t.id, status: { not: 'occupied' } },
          data: { activeRequests: 0 },
        })
      }
    }

    // --- 4. Buffet : timers FRAIS + 1 retard volontaire (alerte honnête) ---
    const buffetItems = await db.buffetChecklist.findMany({ orderBy: { item: 'asc' } })
    const BUFFET_DEMO: Record<string, { fill: number; lastCheckMinAgo: number; dueInMin: number }> = {
      buffet_fill: { fill: 68, lastCheckMinAgo: 28, dueInMin: -2 },  // en retard de 2 min → alerte
      drinks_level: { fill: 55, lastCheckMinAgo: 12, dueInMin: 18 },
      cleanliness: { fill: 92, lastCheckMinAgo: 5, dueInMin: 25 },
    }
    for (const item of buffetItems) {
      const demo = BUFFET_DEMO[item.item] ?? { fill: 80, lastCheckMinAgo: 10, dueInMin: 20 }
      await db.buffetChecklist.update({
        where: { id: item.id },
        data: {
          fillLevel: demo.fill,
          lastCheck: minAgo(demo.lastCheckMinAgo),
          nextCheck: inMin(demo.dueInMin),
          status: demo.fill <= 20 ? 'critical' : demo.fill <= 50 ? 'warning' : 'ok',
        },
      })
    }

    // --- 5. Douches : 1 occupée + 1 en nettoyage, le reste libre ---
    const showers = await db.showerStatus.findMany({ orderBy: { showerNumber: 'asc' } })
    for (const s of showers) {
      const next =
        s.showerNumber === 1
          ? 'occupied'
          : s.showerNumber === 3
            ? 'cleaning'
            : 'free'
      await db.showerStatus.update({
        where: { id: s.id },
        data: { status: next, occupiedSince: next === 'occupied' ? minAgo(11) : null },
      })
    }

    // --- 6. Signalement VIP ouvert (zone relaxation) → alerte amethyst ---
    const relaxationZone = await db.airportZone.findFirst({
      where: { code: { in: VIP_ZONE_CODES, not: 'vip_showers' } },
    })
    let incidentCreated = false
    if (relaxationZone) {
      await db.airportReport.updateMany({
        where: { zoneId: { in: VIP_ZONE_CODES }, statut: { in: ['EN_ATTENTE', 'EN_COURS'] } },
        data: { statut: 'RESOLU', resolvedAt: new Date() },
      })
      await db.airportReport.create({
        data: {
          zoneId: relaxationZone.id,
          tagScanne: relaxationZone.tags[0] ?? relaxationZone.code,
          problemType: 'Niveau sonore élevé',
          commentaire: 'Client VIP Diamond — demande un environnement plus calme.',
          statut: 'EN_ATTENTE',
        },
      })
      incidentCreated = true
    }

    return ok({
      tablesOccupied: OCCUPIED.length,
      tableProbleme: problemTable?.tableNumber ?? null,
      tableReservee: reservedTable?.tableNumber ?? null,
      demandesActives: t01 && t03 ? 2 : t01 || t03 ? 1 : 0,
      incidentCree: incidentCreated,
      message:
        'État de démo appliqué : 3 tables occupées, 1 problème, 1 réservée, buffet frais, alertes actives.',
    })
  } catch (err) {
    console.error('[/api/vip/demo-data] error:', err)
    return fail('Erreur lors de l\'injection des données de démo', 500)
  }
}
