// ============================================================
// /api/vip/requests — VipTableRequest (TENANT-3 — VIP Lounge Phase 1)
// ------------------------------------------------------------
// GET  : liste des demandes, avec info table jointe.
//        Filtre optionnel : ?status=pending|in_progress|done
//        Filtre optionnel : ?type=refreshment|menu|shower|charger|concierge|problem|rating|cleanup
// POST : crée une nouvelle demande (body: tableId, type, message?).
//
// L'API est publique côté POST car elle est appelée par le client
// depuis son smartphone après scan du QR de la table. On accepte
// un qrToken en alternative à tableId pour le flux client public.
// ============================================================

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, getSessionUser } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const TYPES_VALIDES = new Set([
  'refreshment',
  'menu',
  'shower',
  'charger',
  'concierge',
  'problem',
  'rating',
  'cleanup',
])
const STATUS_VALIDES = new Set(['pending', 'in_progress', 'done'])

export async function GET(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user) return fail('Non authentifié', 401)

  const url = new URL(req.url)
  const status = url.searchParams.get('status')
  const type = url.searchParams.get('type')

  const where: { status?: string; type?: string } = {}
  if (status && STATUS_VALIDES.has(status)) where.status = status
  if (type && TYPES_VALIDES.has(type)) where.type = type

  const requests = await db.vipTableRequest.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 200,
    include: {
      table: {
        select: {
          id: true,
          tableNumber: true,
          zone: true,
          clientName: true,
          clientVipLevel: true,
        },
      },
    },
  })

  return ok(
    requests.map((r) => ({
      id: r.id,
      tableId: r.tableId,
      table: r.table,
      type: r.type,
      message: r.message ?? null,
      status: r.status,
      staffName: r.staffName ?? null,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    })),
  )
}

export async function POST(req: NextRequest) {
  // POST est public : le client final (smartphone) crée une demande
  // depuis son scan QR. Pas de getSessionUser ici — on valide via
  // tableId ou qrToken.
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return fail('Body JSON invalide', 400)
  }

  // Résolution de la table : priorité tableId, fallback qrToken
  let table: Awaited<ReturnType<typeof db.vipTable.findUnique>> = null
  if (typeof body.tableId === 'string' && body.tableId.trim()) {
    table = await db.vipTable.findUnique({ where: { id: body.tableId } })
  } else if (typeof body.qrToken === 'string' && body.qrToken.trim()) {
    table = await db.vipTable.findUnique({ where: { qrToken: body.qrToken.trim() } })
  }

  if (!table) {
    return fail('Table introuvable (tableId ou qrToken invalide)', 404)
  }

  if (typeof body.type !== 'string' || !TYPES_VALIDES.has(body.type)) {
    return fail(
      `Type invalide. Types acceptés : refreshment, menu, shower, charger, concierge, problem, rating, cleanup`,
      400,
    )
  }

  const message =
    typeof body.message === 'string' && body.message.trim()
      ? body.message.trim().slice(0, 500)
      : null

  const created = await db.vipTableRequest.create({
    data: {
      tableId: table.id,
      type: body.type,
      message,
    },
  })

  // Incrémenter le compteur actif sur la table (dénormalisé pour perf)
  await db.vipTable.update({
    where: { id: table.id },
    data: { activeRequests: { increment: 1 } },
  })

  return ok(
    {
      id: created.id,
      tableId: created.tableId,
      type: created.type,
      message: created.message,
      status: created.status,
      createdAt: created.createdAt.toISOString(),
      table: {
        id: table.id,
        tableNumber: table.tableNumber,
        zone: table.zone,
      },
    },
    201,
  )
}
