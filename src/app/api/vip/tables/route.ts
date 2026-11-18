// ============================================================
// /api/vip/tables — VipTable (TENANT-3 — VIP Lounge Phase 1)
// ------------------------------------------------------------
// GET  : liste toutes les tables avec leur nombre de demandes
//        actives (status = pending | in_progress). Auto-seed de
//        12 tables (T-01 → T-12) si la base est vide. Chaque
//        table reçoit un qrToken unique (cuid) généré à l'insertion.
// POST : crée une nouvelle table (body: tableNumber, zone, seats).
//        Le qrToken est généré automatiquement.
// ============================================================

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, getSessionUser } from '@/lib/session'
import { randomUUID } from 'node:crypto'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ZONES_VALIDES = new Set(['main', 'buffet', 'relaxation', 'meeting'])

/** Génère un token QR unique (cuid-like, 24 chars). */
function genererQrToken(): string {
  return 't' + randomUUID().replace(/-/g, '').slice(0, 23)
}

/** Auto-seed des 12 tables standards (T-01 → T-12) réparties sur 4 zones. */
async function seedTablesSiVide() {
  const count = await db.vipTable.count()
  if (count > 0) return

  const zones: Array<{ zone: string; n: number }> = [
    { zone: 'main', n: 5 },        // T-01 à T-05
    { zone: 'buffet', n: 3 },      // T-06 à T-08
    { zone: 'relaxation', n: 2 },  // T-09 à T-10
    { zone: 'meeting', n: 2 },     // T-11 à T-12
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

export async function GET(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user) return fail('Non authentifié', 401)

  await seedTablesSiVide()

  const tables = await db.vipTable.findMany({
    orderBy: { tableNumber: 'asc' },
    include: {
      requests: {
        where: { status: { in: ['pending', 'in_progress'] } },
        select: { id: true, type: true, status: true, message: true, createdAt: true, staffName: true },
        orderBy: { createdAt: 'desc' },
      },
    },
  })

  return ok(
    tables.map((t) => ({
      id: t.id,
      tableNumber: t.tableNumber,
      zone: t.zone,
      seats: t.seats,
      status: t.status,
      qrToken: t.qrToken,
      clientName: t.clientName ?? null,
      clientVipLevel: t.clientVipLevel ?? null,
      arrivedAt: t.arrivedAt?.toISOString() ?? null,
      activeRequests: t.requests.length,
      requests: t.requests.map((r) => ({
        id: r.id,
        type: r.type,
        status: r.status,
        message: r.message ?? null,
        createdAt: r.createdAt.toISOString(),
        staffName: r.staffName ?? null,
      })),
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
    })),
  )
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user) return fail('Non authentifié', 401)

  const body = await req.json().catch(() => null)
  if (!body || typeof body.tableNumber !== 'string' || !body.tableNumber.trim()) {
    return fail('Paramètres manquants (tableNumber requis)', 400)
  }
  const tableNumber = body.tableNumber.trim().toUpperCase()
  const zone = typeof body.zone === 'string' && ZONES_VALIDES.has(body.zone) ? body.zone : 'main'
  const seats = Number.isInteger(body.seats) && body.seats > 0 ? body.seats : 4

  // Vérifier que tableNumber est unique
  const exists = await db.vipTable.findUnique({ where: { tableNumber } })
  if (exists) return fail(`La table ${tableNumber} existe déjà`, 409)

  // Générer un qrToken unique (rare collision → retry une fois)
  let qrToken = genererQrToken()
  if (await db.vipTable.findUnique({ where: { qrToken } })) {
    qrToken = genererQrToken()
  }

  const created = await db.vipTable.create({
    data: { tableNumber, zone, seats, qrToken },
  })

  return ok({
    id: created.id,
    tableNumber: created.tableNumber,
    zone: created.zone,
    seats: created.seats,
    status: created.status,
    qrToken: created.qrToken,
    clientName: created.clientName,
    clientVipLevel: created.clientVipLevel,
    arrivedAt: created.arrivedAt?.toISOString() ?? null,
    activeRequests: 0,
    createdAt: created.createdAt.toISOString(),
    updatedAt: created.updatedAt.toISOString(),
  })
}

export { ZONES_VALIDES }
