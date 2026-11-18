// ============================================================
// /api/vip/orders — Module 5 (Upselling & Partenariats) — Commandes
// ------------------------------------------------------------
// GET  : liste des commandes VIP (VipOrder).
//        Filtres optionnels :
//          ?status=pending|paid|preparing|delivered|cancelled
//          ?tableNumber=T-01
//        Tri : createdAt desc.
// POST : crée une commande (simule un paiement réussi).
//        Body : {
//          tableNumber?,
//          clientName?,
//          items: [{ offerId, title, priceFcfa, qty }],
//          paymentMethod: 'wave' | 'orange_money' | 'cash'
//        }
//        - Calcule totalFcfa = sum(priceFcfa * qty)
//        - Génère paymentRef = PAY-<timestamp>-<rand3>
//        - Crée VipOrder avec status="paid"
//        - Génère trackingNumber = CMD-<year>-<seq> (4 chiffres, anti-collision)
// ============================================================

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const VALID_STATUSES = new Set([
  'pending',
  'paid',
  'preparing',
  'delivered',
  'cancelled',
])
const VALID_PAYMENT_METHODS = new Set(['wave', 'orange_money', 'cash'])

interface OrderItemInput {
  offerId?: string
  title?: string
  priceFcfa?: number
  qty?: number
}

interface SerializedItem {
  offerId: string | null
  title: string
  priceFcfa: number
  qty: number
}

// GET /api/vip/orders
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const status = url.searchParams.get('status')
  const tableNumber = url.searchParams.get('tableNumber')

  const where: { status?: string; tableNumber?: string } = {}
  if (status && VALID_STATUSES.has(status)) where.status = status
  if (tableNumber && tableNumber.trim()) where.tableNumber = tableNumber.trim()

  const orders = await db.vipOrder.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 200,
  })

  return ok(
    orders.map((o) => ({
      id: o.id,
      trackingNumber: o.trackingNumber,
      tableNumber: o.tableNumber,
      clientName: o.clientName,
      items: safeParseItems(o.items),
      totalFcfa: o.totalFcfa,
      status: o.status,
      paymentRef: o.paymentRef,
      paymentMethod: o.paymentMethod,
      deliveredAt: o.deliveredAt ? o.deliveredAt.toISOString() : null,
      createdAt: o.createdAt.toISOString(),
      updatedAt: o.updatedAt.toISOString(),
    })),
  )
}

// POST /api/vip/orders
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return fail('Body JSON invalide', 400)
  }

  // Validation des items (au moins 1, structure correcte)
  if (!Array.isArray(body.items) || body.items.length === 0) {
    return fail('items requis (tableau non vide)', 400)
  }

  const items: SerializedItem[] = []
  for (let i = 0; i < body.items.length; i++) {
    const raw: OrderItemInput = body.items[i] ?? {}
    if (typeof raw.title !== 'string' || !raw.title.trim()) {
      return fail(`items[${i}].title invalide`, 400)
    }
    if (typeof raw.priceFcfa !== 'number' || raw.priceFcfa < 0) {
      return fail(`items[${i}].priceFcfa invalide`, 400)
    }
    if (typeof raw.qty !== 'number' || !Number.isInteger(raw.qty) || raw.qty < 1) {
      return fail(`items[${i}].qty invalide (entier >= 1)`, 400)
    }
    items.push({
      offerId:
        typeof raw.offerId === 'string' && raw.offerId.trim()
          ? raw.offerId.trim()
          : null,
      title: raw.title.trim().slice(0, 120),
      priceFcfa: Math.round(raw.priceFcfa),
      qty: raw.qty,
    })
  }

  // Méthode de paiement
  const paymentMethod =
    typeof body.paymentMethod === 'string' &&
    VALID_PAYMENT_METHODS.has(body.paymentMethod)
      ? body.paymentMethod
      : null
  if (!paymentMethod) {
    return fail('paymentMethod invalide (wave | orange_money | cash)', 400)
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

  // Calcul du total
  const totalFcfa = items.reduce((sum, it) => sum + it.priceFcfa * it.qty, 0)

  // Référence paiement (simulé : Wave / Orange Money / Cash)
  const paymentRef = `PAY-${Date.now()}-${Math.floor(Math.random() * 1000)}`

  // Numéro de suivi CMD-YYYY-NNNN (anti-collision @unique)
  const year = new Date().getFullYear()
  let trackingNumber = ''
  for (let attempt = 0; attempt < 5; attempt++) {
    const seq = String(Math.floor(Math.random() * 9000) + 1000)
    trackingNumber = `CMD-${year}-${seq}`
    const exists = await db.vipOrder.findFirst({
      where: { trackingNumber },
      select: { id: true },
    })
    if (!exists) break
  }

  const created = await db.vipOrder.create({
    data: {
      tableNumber,
      clientName,
      items: JSON.stringify(items),
      totalFcfa,
      status: 'paid', // paiement simulé réussi
      paymentRef,
      paymentMethod,
    },
  })

  return ok(
    {
      id: created.id,
      trackingNumber: created.trackingNumber,
      tableNumber: created.tableNumber,
      clientName: created.clientName,
      items: safeParseItems(created.items),
      totalFcfa: created.totalFcfa,
      status: created.status,
      paymentRef: created.paymentRef,
      paymentMethod: created.paymentMethod,
      createdAt: created.createdAt.toISOString(),
      updatedAt: created.updatedAt.toISOString(),
    },
    201,
  )
}

// Parse défensif du JSON items (la colonne est une string JSON)
function safeParseItems(raw: string): SerializedItem[] {
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed as SerializedItem[]
  } catch {
    /* ignore */
  }
  return []
}
