// ============================================================
// /api/vip/loan-items — Module 6 (Prêt Express)
// ------------------------------------------------------------
// GET  : liste des objets en prêt (LoanItem).
//        Auto-seed : 8 objets par défaut si la table est vide.
//        Tri : category asc, puis name asc. Filtre active=true.
// POST : crée une demande de prêt (LoanRequest) et décrémente
//        availableStock atomiquement.
//        Body : { itemId, tableNumber?, clientName?, qty? }
//        - qty entier >= 1 (défaut 1)
//        - Si availableStock < qty → 400 "Stock insuffisant"
//        - status="pending" à la création
// ============================================================

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Seed initial : 8 objets de prêt couvrant les 6 catégories
const SEED_ITEMS: Array<{
  name: string
  category: string
  emoji: string
  totalStock: number
  availableStock: number
}> = [
  { name: 'Adaptateur USB-C', category: 'adapter', emoji: '🔌', totalStock: 5, availableStock: 5 },
  { name: 'Adaptateur Lightning', category: 'adapter', emoji: '🔌', totalStock: 3, availableStock: 3 },
  { name: 'Adaptateur micro-USB', category: 'adapter', emoji: '🔌', totalStock: 2, availableStock: 2 },
  { name: 'Chargeur sans fil', category: 'charger', emoji: '⚡', totalStock: 4, availableStock: 4 },
  { name: 'Casque anti-bruit', category: 'headphone', emoji: '🎧', totalStock: 3, availableStock: 3 },
  { name: 'Plaid cachemire', category: 'blanket', emoji: '🧣', totalStock: 6, availableStock: 6 },
  { name: 'Masque de sommeil', category: 'mask', emoji: '😴', totalStock: 8, availableStock: 8 },
  { name: 'Presse internationale', category: 'press', emoji: '📰', totalStock: 10, availableStock: 10 },
]

// Auto-seed si la table LoanItem est vide
async function ensureSeeded(): Promise<void> {
  const count = await db.loanItem.count()
  if (count > 0) return
  await db.loanItem.createMany({
    data: SEED_ITEMS.map((it) => ({
      name: it.name,
      category: it.category,
      emoji: it.emoji,
      totalStock: it.totalStock,
      availableStock: it.availableStock,
      active: true,
    })),
  })
}

// GET /api/vip/loan-items
export async function GET(req: NextRequest) {
  await ensureSeeded()

  const items = await db.loanItem.findMany({
    where: { active: true },
    orderBy: [{ category: 'asc' }, { name: 'asc' }],
  })

  return ok(
    items.map((i) => ({
      id: i.id,
      name: i.name,
      category: i.category,
      emoji: i.emoji,
      totalStock: i.totalStock,
      availableStock: i.availableStock,
      lowStockThreshold: i.lowStockThreshold,
      active: i.active,
      createdAt: i.createdAt.toISOString(),
      updatedAt: i.updatedAt.toISOString(),
    })),
  )
}

// POST /api/vip/loan-items — crée une demande de prêt + décrémente le stock
export async function POST(req: NextRequest) {
  await ensureSeeded()

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return fail('Body JSON invalide', 400)
  }

  // itemId requis
  if (typeof body.itemId !== 'string' || !body.itemId.trim()) {
    return fail('itemId requis', 400)
  }
  const itemId = body.itemId.trim()

  // qty : entier >= 1, défaut 1
  let qty =
    typeof body.qty === 'number'
      ? body.qty
      : typeof body.qty === 'string'
        ? Number(body.qty)
        : 1
  if (!Number.isInteger(qty) || qty < 1) {
    return fail('qty invalide (entier >= 1)', 400)
  }

  // Champs optionnels
  const tableNumber =
    typeof body.tableNumber === 'string' && body.tableNumber.trim()
      ? body.tableNumber.trim().slice(0, 20)
      : null
  const clientName =
    typeof body.clientName === 'string' && body.clientName.trim()
      ? body.clientName.trim().slice(0, 80)
      : null

  // 1. Trouver l'objet de prêt
  const item = await db.loanItem.findUnique({ where: { id: itemId } })
  if (!item) {
    return fail('Objet de prêt introuvable', 404)
  }
  if (!item.active) {
    return fail('Objet de prêt inactif', 400)
  }

  // 2. Vérifier le stock disponible
  if (item.availableStock < qty) {
    return fail('Stock insuffisant', 400)
  }

  // 3+4. Création de la demande + décrément atomique du stock
  const now = new Date()
  const created = await db.$transaction(async (tx) => {
    // Re-vérification concurrente sous transaction (sécurité)
    const fresh = await tx.loanItem.findUnique({ where: { id: itemId } })
    if (!fresh || fresh.availableStock < qty) {
      throw new Error('STOCK_INSUFFISANT')
    }

    const request = await tx.loanRequest.create({
      data: {
        itemId,
        tableNumber,
        clientName,
        qty,
        status: 'pending',
        requestedAt: now,
      },
    })

    await tx.loanItem.update({
      where: { id: itemId },
      data: { availableStock: { decrement: qty } },
    })

    return request
  })

  return ok(
    {
      id: created.id,
      itemId: created.itemId,
      tableNumber: created.tableNumber,
      clientName: created.clientName,
      qty: created.qty,
      status: created.status,
      requestedAt: created.requestedAt.toISOString(),
      deliveredAt: created.deliveredAt ? created.deliveredAt.toISOString() : null,
      returnedAt: created.returnedAt ? created.returnedAt.toISOString() : null,
      createdAt: created.createdAt.toISOString(),
      updatedAt: created.updatedAt.toISOString(),
    },
    201,
  )
}
