// ============================================================
// /api/vip/lost-found — Module 2 (Comptoir Réception) — Lost & Found
// ------------------------------------------------------------
// GET  : liste des objets trouvés (LostFoundItem).
//        Filtre optionnel : ?status=found|claimed|returned
//        Tri : createdAt desc.
// POST : crée un objet trouvé.
//        Body : { title, description?, category, tableNumber?, foundBy? }
//        Categories : electronics, clothing, accessories, documents, other
// ============================================================

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const VALID_STATUSES = new Set(['found', 'claimed', 'returned'])
const VALID_CATEGORIES = new Set([
  'electronics',
  'clothing',
  'accessories',
  'documents',
  'other',
])

// GET /api/vip/lost-found
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const status = url.searchParams.get('status')

  const where: { status?: string } = {}
  if (status && VALID_STATUSES.has(status)) where.status = status

  const items = await db.lostFoundItem.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 200,
  })

  return ok(
    items.map((i) => ({
      id: i.id,
      title: i.title,
      description: i.description,
      category: i.category,
      tableNumber: i.tableNumber,
      foundBy: i.foundBy,
      status: i.status,
      claimedBy: i.claimedBy,
      returnedAt: i.returnedAt ? i.returnedAt.toISOString() : null,
      createdAt: i.createdAt.toISOString(),
      updatedAt: i.updatedAt.toISOString(),
    })),
  )
}

// POST /api/vip/lost-found
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return fail('Body JSON invalide', 400)
  }

  if (typeof body.title !== 'string' || !body.title.trim()) {
    return fail('title requis', 400)
  }
  if (
    typeof body.category !== 'string' ||
    !VALID_CATEGORIES.has(body.category)
  ) {
    return fail(
      'category invalide (electronics | clothing | accessories | documents | other)',
      400,
    )
  }

  const title = body.title.trim().slice(0, 120)
  const description =
    typeof body.description === 'string' && body.description.trim()
      ? body.description.trim().slice(0, 1000)
      : null
  const category = body.category
  const tableNumber =
    typeof body.tableNumber === 'string' && body.tableNumber.trim()
      ? body.tableNumber.trim().slice(0, 20)
      : null
  const foundBy =
    typeof body.foundBy === 'string' && body.foundBy.trim()
      ? body.foundBy.trim().slice(0, 80)
      : null

  const created = await db.lostFoundItem.create({
    data: {
      title,
      description,
      category,
      tableNumber,
      foundBy,
      status: 'found',
    },
  })

  return ok(
    {
      id: created.id,
      title: created.title,
      description: created.description,
      category: created.category,
      tableNumber: created.tableNumber,
      foundBy: created.foundBy,
      status: created.status,
      claimedBy: created.claimedBy,
      returnedAt: created.returnedAt ? created.returnedAt.toISOString() : null,
      createdAt: created.createdAt.toISOString(),
      updatedAt: created.updatedAt.toISOString(),
    },
    201,
  )
}
