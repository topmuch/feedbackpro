// ============================================================
// /api/city/artisans
// ------------------------------------------------------------
// Ville Connectée — Annuaire des artisans de Dakar vérifiés
// par la mairie. Monétisation via les annonces premium dans
// l'assistant Aminata (le citoyen demande "Je cherche un
// plombier" → Aminata suggère un artisan premium).
//
// GET  → liste des artisans vérifiés et actifs.
//        Filtre optionnel ?district=xxx.
//        Tri : premium DESC, rating DESC.
//        Auto-seed de 8 artisans si la base est vide.
// POST → crée un nouvel artisan (verified=false par défaut :
//        l'inscription est en attente de validation mairie).
//        Body : { name, trade, phone, district?, address? }
// ============================================================

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// ---------------------------------------------------------------
// Seed initial — 8 artisans Dakar couvrant les métiers les plus
// demandés par les citoyens (via Aminata).
// ---------------------------------------------------------------

const SEED_ARTISANS: ReadonlyArray<{
  name: string
  trade: string
  phone: string
  district: string
  premium: boolean
}> = [
  { name: 'Mamadou Sow', trade: 'Plombier', phone: '+221770100001', district: 'Plateau', premium: true },
  { name: 'Aïssatou Fall', trade: 'Électricienne', phone: '+221770100002', district: 'Médina', premium: true },
  { name: 'Ibrahima Ndiaye', trade: 'Menuisier', phone: '+221770100003', district: 'Grand Dakar', premium: false },
  { name: 'Fatou Diop', trade: 'Couturière', phone: '+221770100004', district: 'Parcelles', premium: true },
  { name: 'Moussa Bâ', trade: 'Mécanicien', phone: '+221770100005', district: 'Grand Dakar', premium: false },
  { name: 'Khady Sarr', trade: 'Coiffeuse', phone: '+221770100006', district: 'Plateau', premium: true },
  { name: 'Ousmane Cissé', trade: 'Maçon', phone: '+221770100007', district: 'Médina', premium: false },
  { name: 'Awa Mbaye', trade: 'Tisseuse', phone: '+221770100008', district: 'Parcelles', premium: false },
] as const

/** Note initiale aléatoire entre 4.5 et 5.0 (jauge de satisfaction). */
function seedRating(): number {
  return Math.round((4.5 + Math.random() * 0.5) * 10) / 10
}

/** Nombre d'avis initial aléatoire (5..80). */
function seedReviewCount(): number {
  return Math.floor(Math.random() * (80 - 5 + 1)) + 5
}

/** Nombre de contacts initial aléatoire (10..250). */
function seedContactCount(): number {
  return Math.floor(Math.random() * (250 - 10 + 1)) + 10
}

/**
 * Auto-seed : si aucun artisan n'existe en base, on insère les 8 artisans
 * canoniques. Tous vérifiés (la mairie a validé leur identité), avec
 * premium=true pour 4 d'entre eux (monétisation).
 */
async function autoSeedIfEmpty(): Promise<void> {
  const count = await db.cityArtisan.count()
  if (count > 0) return

  await db.cityArtisan.createMany({
    data: SEED_ARTISANS.map((a) => ({
      name: a.name,
      trade: a.trade,
      phone: a.phone,
      district: a.district,
      verified: true,
      premium: a.premium,
      rating: seedRating(),
      reviewCount: seedReviewCount(),
      contactCount: seedContactCount(),
      active: true,
    })),
  })

  console.log(
    `[city-artisans] 🛠️ Auto-seed initial : ${SEED_ARTISANS.length} artisans vérifiés créés`,
  )
}

/** Normalise un numéro de téléphone sénégalais (+221…). */
function normalizePhone(raw: string | undefined | null): string | null {
  if (!raw || typeof raw !== 'string') return null
  const cleaned = raw.replace(/[\s.-]/g, '')
  if (!/^\+?\d{8,15}$/.test(cleaned)) return null
  return cleaned
}

// ---------------------------------------------------------------
// Sérialisation API
// ---------------------------------------------------------------
function serialize(a: {
  id: string
  name: string
  trade: string
  phone: string
  district: string | null
  address: string | null
  verified: boolean
  premium: boolean
  rating: number
  reviewCount: number
  contactCount: number
  active: boolean
  createdAt: Date
  updatedAt: Date
}) {
  return {
    id: a.id,
    name: a.name,
    trade: a.trade,
    phone: a.phone,
    district: a.district,
    address: a.address,
    verified: a.verified,
    premium: a.premium,
    rating: a.rating,
    reviewCount: a.reviewCount,
    contactCount: a.contactCount,
    active: a.active,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  }
}

// ---------------------------------------------------------------
// GET — liste des artisans vérifiés et actifs
// ---------------------------------------------------------------
export async function GET(req: NextRequest) {
  // Auto-seed (idempotent) — exécuté avant la lecture.
  try {
    await autoSeedIfEmpty()
  } catch (e) {
    console.error('[city-artisans] Erreur auto-seed :', e)
  }

  const url = new URL(req.url)
  const district = url.searchParams.get('district')

  const where: { verified?: boolean; active?: boolean; district?: string } = {
    verified: true,
    active: true,
  }
  if (district && district.trim().length > 0) {
    where.district = district.trim()
  }

  const artisans = await db.cityArtisan.findMany({
    where,
    orderBy: [{ premium: 'desc' }, { rating: 'desc' }],
  })

  const serialized = artisans.map(serialize)

  return ok({ artisans: serialized, count: serialized.length })
}

// ---------------------------------------------------------------
// POST — créer un nouvel artisan (en attente de validation mairie)
// Body : { name, trade, phone, district?, address? }
// ---------------------------------------------------------------
export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return fail('Payload JSON invalide', 400)
  }

  const b = body as {
    name?: string
    trade?: string
    phone?: string
    district?: string
    address?: string
  }

  // name obligatoire (min 2, max 80)
  if (typeof b.name !== 'string' || b.name.trim().length < 2) {
    return fail('Le nom est obligatoire (min. 2 caractères)', 400)
  }
  if (b.name.trim().length > 80) {
    return fail('Le nom est trop long (max. 80 caractères)', 400)
  }
  const name = b.name.trim()

  // trade obligatoire (min 2, max 60)
  if (typeof b.trade !== 'string' || b.trade.trim().length < 2) {
    return fail('Le métier est obligatoire (min. 2 caractères)', 400)
  }
  if (b.trade.trim().length > 60) {
    return fail('Le métier est trop long (max. 60 caractères)', 400)
  }
  const trade = b.trade.trim()

  // phone obligatoire
  const phone = normalizePhone(b.phone)
  if (!phone) {
    return fail(
      'Téléphone invalide (format attendu : +221 77 000 00 00 ou 770000000)',
      400,
    )
  }

  // Unicité du téléphone (un artisan = un numéro). La colonne `phone`
  // n'a pas de contrainte @unique en base, on utilise findFirst pour
  // vérifier l'existence d'un doublon avant l'insertion.
  const existing = await db.cityArtisan.findFirst({
    where: { phone },
    select: { id: true, name: true },
  })
  if (existing) {
    return fail(
      `Ce numéro est déjà utilisé par « ${existing.name} ». Contactez la mairie si vous êtes le même artisan.`,
      409,
    )
  }

  // district optionnel (max 60)
  let district: string | null = null
  if (b.district !== undefined && b.district !== null) {
    if (typeof b.district !== 'string') {
      return fail('district invalide', 400)
    }
    const trimmed = b.district.trim()
    if (trimmed.length > 60) {
      return fail('district trop long (max. 60 caractères)', 400)
    }
    district = trimmed || null
  }

  // address optionnelle (max 200)
  let address: string | null = null
  if (b.address !== undefined && b.address !== null) {
    if (typeof b.address !== 'string') {
      return fail('address invalide', 400)
    }
    const trimmed = b.address.trim()
    if (trimmed.length > 200) {
      return fail('address trop longue (max. 200 caractères)', 400)
    }
    address = trimmed || null
  }

  // Création — verified=false (en attente de validation mairie).
  // premium=false par défaut (l'artisan doit être vérifié avant de
  // pouvoir souscrire au programme premium monétisé).
  const artisan = await db.cityArtisan.create({
    data: {
      name,
      trade,
      phone,
      district,
      address,
      verified: false,
      premium: false,
      rating: 5.0,
      reviewCount: 0,
      contactCount: 0,
      active: true,
    },
  })

  console.log(
    `[city-artisans] 🛠️ Artisan « ${name} » (${trade}) inscrit — en attente de validation mairie`,
  )

  return ok(
    {
      artisan: serialize(artisan),
      message:
        'Inscription enregistrée. La mairie validera votre profil sous 48h ouvrées.',
    },
    201,
  )
}
