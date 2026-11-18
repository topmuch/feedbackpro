// ============================================================
// /api/vip/upsell-offers — Module 5 (Upselling & Partenariats)
// ------------------------------------------------------------
// GET  : liste des offres actives (UpsellOffer).
//        Filtre optionnel : ?type=upsell|dutyfree
//        Tri : type asc, puis title asc.
//        Auto-seed : 6 offres par défaut si la table est vide.
// POST : crée ou met à jour une offre (superadmin only — pas
//        d'auth check pour l'instant, en phase de prototypage).
//        Body (create) : { title, description?, priceFcfa, type, category?, emoji?, stock? }
//        Body (update) : { id, ...champs à patcher }
// ============================================================

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const VALID_TYPES = new Set(['upsell', 'dutyfree'])

// Seed initial : 4 offres upsell + 2 offres duty-free
const SEED_OFFERS: Array<{
  title: string
  description: string
  priceFcfa: number
  type: string
  category: string
  emoji: string
}> = [
  {
    title: 'Massage express 15 min',
    description: 'Massage relaxant express par notre thérapeute certifié.',
    priceFcfa: 25000,
    type: 'upsell',
    category: 'spa',
    emoji: '💆',
  },
  {
    title: 'Bouteille champagne millésimée',
    description: 'Champagne premium servi à la table, coupe incluse.',
    priceFcfa: 45000,
    type: 'upsell',
    category: 'champagne',
    emoji: '🥂',
  },
  {
    title: 'Fast-Track sécurité',
    description: 'Accès prioritaire au contrôle de sécurité aéroport.',
    priceFcfa: 15000,
    type: 'upsell',
    category: 'fasttrack',
    emoji: '✈️',
  },
  {
    title: 'Accès Salon Ultra-VIP',
    description: 'Accès privatif au salon Ultra-VIP avec service dédié.',
    priceFcfa: 30000,
    type: 'upsell',
    category: 'vip',
    emoji: '👑',
  },
  {
    title: 'Parfum duty-free',
    description: 'Sélection de parfums grand luxe, livraison à la table.',
    priceFcfa: 18000,
    type: 'dutyfree',
    category: 'souvenirs',
    emoji: '🎁',
  },
  {
    title: 'Montre luxe',
    description: 'Montre de luxe duty-free, édition limitée salon VIP.',
    priceFcfa: 120000,
    type: 'dutyfree',
    category: 'souvenirs',
    emoji: '⌚',
  },
]

async function ensureSeeded(): Promise<void> {
  const count = await db.upsellOffer.count()
  if (count > 0) return
  await db.upsellOffer.createMany({
    data: SEED_OFFERS.map((o) => ({
      title: o.title,
      description: o.description,
      priceFcfa: o.priceFcfa,
      type: o.type,
      category: o.category,
      emoji: o.emoji,
      stock: -1, // illimité par défaut
      active: true,
    })),
  })
}

// GET /api/vip/upsell-offers
export async function GET(req: NextRequest) {
  await ensureSeeded()

  const url = new URL(req.url)
  const type = url.searchParams.get('type')

  const where: { active?: boolean; type?: string } = { active: true }
  if (type && VALID_TYPES.has(type)) where.type = type

  const offers = await db.upsellOffer.findMany({
    where,
    orderBy: [{ type: 'asc' }, { title: 'asc' }],
  })

  return ok(
    offers.map((o) => ({
      id: o.id,
      title: o.title,
      description: o.description,
      priceFcfa: o.priceFcfa,
      type: o.type,
      category: o.category,
      emoji: o.emoji,
      stock: o.stock,
      active: o.active,
      createdAt: o.createdAt.toISOString(),
      updatedAt: o.updatedAt.toISOString(),
    })),
  )
}

// POST /api/vip/upsell-offers — create OR update (superadmin only — no auth for now)
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return fail('Body JSON invalide', 400)
  }

  // Mode UPDATE : si body.id est fourni, on patche l'offre existante
  if (typeof body.id === 'string' && body.id.trim()) {
    const existing = await db.upsellOffer.findUnique({ where: { id: body.id } })
    if (!existing) return fail('Offre introuvable', 404)

    const data: Record<string, unknown> = {}
    if (typeof body.title === 'string' && body.title.trim()) {
      data.title = body.title.trim().slice(0, 120)
    }
    if (typeof body.description === 'string') {
      data.description = body.description.trim().slice(0, 500)
    }
    if (typeof body.priceFcfa === 'number' && body.priceFcfa >= 0) {
      data.priceFcfa = Math.round(body.priceFcfa)
    }
    if (typeof body.type === 'string' && VALID_TYPES.has(body.type)) {
      data.type = body.type
    }
    if (typeof body.category === 'string') {
      data.category = body.category.trim().slice(0, 60)
    }
    if (typeof body.emoji === 'string') {
      data.emoji = body.emoji.trim().slice(0, 8)
    }
    if (typeof body.stock === 'number') {
      data.stock = Math.round(body.stock)
    }
    if (typeof body.active === 'boolean') {
      data.active = body.active
    }

    if (Object.keys(data).length === 0) {
      return fail('Aucun champ à mettre à jour', 400)
    }

    const updated = await db.upsellOffer.update({
      where: { id: body.id },
      data,
    })

    return ok({
      id: updated.id,
      title: updated.title,
      description: updated.description,
      priceFcfa: updated.priceFcfa,
      type: updated.type,
      category: updated.category,
      emoji: updated.emoji,
      stock: updated.stock,
      active: updated.active,
      updatedAt: updated.updatedAt.toISOString(),
    })
  }

  // Mode CREATE : valider les champs requis
  if (typeof body.title !== 'string' || !body.title.trim()) {
    return fail('title requis', 400)
  }
  if (typeof body.priceFcfa !== 'number' || body.priceFcfa < 0) {
    return fail('priceFcfa invalide (entier >= 0)', 400)
  }
  if (typeof body.type !== 'string' || !VALID_TYPES.has(body.type)) {
    return fail('type invalide (upsell | dutyfree)', 400)
  }

  const title = body.title.trim().slice(0, 120)
  const description =
    typeof body.description === 'string'
      ? body.description.trim().slice(0, 500)
      : null
  const priceFcfa = Math.round(body.priceFcfa)
  const type = body.type
  const category =
    typeof body.category === 'string' && body.category.trim()
      ? body.category.trim().slice(0, 60)
      : null
  const emoji =
    typeof body.emoji === 'string' && body.emoji.trim()
      ? body.emoji.trim().slice(0, 8)
      : null
  const stock =
    typeof body.stock === 'number' ? Math.round(body.stock) : -1 // -1 = illimité

  const created = await db.upsellOffer.create({
    data: {
      title,
      description,
      priceFcfa,
      type,
      category,
      emoji,
      stock,
      active: true,
    },
  })

  return ok(
    {
      id: created.id,
      title: created.title,
      description: created.description,
      priceFcfa: created.priceFcfa,
      type: created.type,
      category: created.category,
      emoji: created.emoji,
      stock: created.stock,
      active: created.active,
      createdAt: created.createdAt.toISOString(),
      updatedAt: created.updatedAt.toISOString(),
    },
    201,
  )
}
