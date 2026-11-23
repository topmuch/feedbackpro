// ============================================================
// /api/city/artisans
// ------------------------------------------------------------
// Ville Connectée — Annuaire des artisans de Dakar vérifiés
// par la mairie. GPS + calcul distance Haversine.
//
// GET  → liste des artisans vérifiés et actifs.
//        Filtres: ?district=xxx ?lat=X&lng=Y&radius=500 (Haversine)
//        Tri par distance si lat/lng fournis, sinon premium DESC, rating DESC.
//        Auto-seed de 8 artisans avec GPS si la base est vide.
// POST → crée un nouvel artisan (verified=false par défaut).
//        Body : { name, trade, phone, district?, address?, lat?, lng? }
// ============================================================

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// ---------------------------------------------------------------
// Seed initial — 8 artisans Dakar avec GPS
// ---------------------------------------------------------------

const SEED_ARTISANS: ReadonlyArray<{
  name: string
  trade: string
  phone: string
  district: string
  premium: boolean
  lat: number
  lng: number
}> = [
  { name: 'Mamadou Sow', trade: 'Plombier', phone: '+221770100001', district: 'Plateau', premium: true, lat: 14.6928, lng: -17.4467 },
  { name: 'Aïssatou Fall', trade: 'Électricienne', phone: '+221770100002', district: 'Médina', premium: true, lat: 14.6730, lng: -17.4380 },
  { name: 'Ibrahima Ndiaye', trade: 'Menuisier', phone: '+221770100003', district: 'Grand Dakar', premium: false, lat: 14.7330, lng: -17.4640 },
  { name: 'Fatou Diop', trade: 'Couturière', phone: '+221770100004', district: 'Parcelles', premium: true, lat: 14.7500, lng: -17.4700 },
  { name: 'Moussa Bâ', trade: 'Mécanicien', phone: '+221770100005', district: 'Grand Dakar', premium: false, lat: 14.7280, lng: -17.4520 },
  { name: 'Khady Sarr', trade: 'Coiffeuse', phone: '+221770100006', district: 'Plateau', premium: true, lat: 14.6900, lng: -17.4430 },
  { name: 'Ousmane Cissé', trade: 'Maçon', phone: '+221770100007', district: 'Médina', premium: false, lat: 14.6760, lng: -17.4410 },
  { name: 'Awa Mbaye', trade: 'Tisseuse', phone: '+221770100008', district: 'Parcelles', premium: false, lat: 14.7520, lng: -17.4680 },
] as const

function seedRating(): number {
  return Math.round((4.5 + Math.random() * 0.5) * 10) / 10
}
function seedReviewCount(): number {
  return Math.floor(Math.random() * (80 - 5 + 1)) + 5
}
function seedContactCount(): number {
  return Math.floor(Math.random() * (250 - 10 + 1)) + 10
}

async function autoSeedIfEmpty(): Promise<void> {
  const count = await db.cityArtisan.count()
  if (count > 0) return

  await db.cityArtisan.createMany({
    data: SEED_ARTISANS.map((a) => ({
      name: a.name,
      trade: a.trade,
      phone: a.phone,
      district: a.district,
      lat: a.lat,
      lng: a.lng,
      verified: true,
      premium: a.premium,
      rating: seedRating(),
      reviewCount: seedReviewCount(),
      contactCount: seedContactCount(),
      active: true,
    })),
  })

  console.log(
    `[city-artisans] Auto-seed initial : ${SEED_ARTISANS.length} artisans vérifiés créés avec GPS`,
  )
}

function normalizePhone(raw: string | undefined | null): string | null {
  if (!raw || typeof raw !== 'string') return null
  const cleaned = raw.replace(/[\s.-]/g, '')
  if (!/^\+?\d{8,15}$/.test(cleaned)) return null
  return cleaned
}

// ---------------------------------------------------------------
// Haversine — distance en mètres entre 2 points GPS
// ---------------------------------------------------------------
function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000 // rayon Terre en mètres
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
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
  lat: number | null
  lng: number | null
  verified: boolean
  premium: boolean
  rating: number
  reviewCount: number
  contactCount: number
  active: boolean
  createdAt: Date
  updatedAt: Date
}, distance?: number) {
  return {
    id: a.id,
    name: a.name,
    trade: a.trade,
    phone: a.phone,
    district: a.district,
    address: a.address,
    lat: a.lat,
    lng: a.lng,
    verified: a.verified,
    premium: a.premium,
    rating: a.rating,
    reviewCount: a.reviewCount,
    contactCount: a.contactCount,
    active: a.active,
    distance: distance ?? null, // distance en mètres depuis la plaque
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  }
}

// ---------------------------------------------------------------
// GET — liste des artisans vérifiés et actifs
// Params: ?district=xxx ?lat=X&lng=Y&radius=500 (Haversine)
// ---------------------------------------------------------------
export async function GET(req: NextRequest) {
  try {
    await autoSeedIfEmpty()
  } catch (e) {
    console.error('[city-artisans] Erreur auto-seed :', e)
  }

  const url = new URL(req.url)
  const district = url.searchParams.get('district')
  const lat = url.searchParams.get('lat')
  const lng = url.searchParams.get('lng')
  const radius = url.searchParams.get('radius') ?? '500'

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

  // Si lat/lng fournis → calcul Haversine + filtre radius + tri par distance
  if (lat && lng) {
    const latNum = parseFloat(lat)
    const lngNum = parseFloat(lng)
    const radiusNum = parseFloat(radius)

    if (!isNaN(latNum) && !isNaN(lngNum) && !isNaN(radiusNum)) {
      const withDistance = artisans
        .filter((a) => a.lat != null && a.lng != null)
        .map((a) => ({
          ...a,
          _distance: haversine(latNum, lngNum, a.lat!, a.lng!),
        }))
        .filter((a) => a._distance <= radiusNum)
        .sort((a, b) => a._distance - b._distance)

      const serialized = withDistance.map((a) =>
        serialize(a, Math.round(a._distance)),
      )

      return ok({ artisans: serialized, count: serialized.length, filtered: true, radius: radiusNum })
    }
  }

  const serialized = artisans.map((a) => serialize(a))

  return ok({ artisans: serialized, count: serialized.length })
}

// ---------------------------------------------------------------
// POST — créer un nouvel artisan (en attente de validation mairie)
// Body : { name, trade, phone, district?, address?, lat?, lng? }
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
    lat?: number
    lng?: number
  }

  if (typeof b.name !== 'string' || b.name.trim().length < 2) {
    return fail('Le nom est obligatoire (min. 2 caractères)', 400)
  }
  if (b.name.trim().length > 80) {
    return fail('Le nom est trop long (max. 80 caractères)', 400)
  }
  const name = b.name.trim()

  if (typeof b.trade !== 'string' || b.trade.trim().length < 2) {
    return fail('Le métier est obligatoire (min. 2 caractères)', 400)
  }
  if (b.trade.trim().length > 60) {
    return fail('Le métier est trop long (max. 60 caractères)', 400)
  }
  const trade = b.trade.trim()

  const phone = normalizePhone(b.phone)
  if (!phone) {
    return fail(
      'Téléphone invalide (format attendu : +221 77 000 00 00 ou 770000000)',
      400,
    )
  }

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

  let district: string | null = null
  if (b.district && typeof b.district === 'string') {
    district = b.district.trim().slice(0, 60) || null
  }

  let address: string | null = null
  if (b.address && typeof b.address === 'string') {
    address = b.address.trim().slice(0, 200) || null
  }

  let lat: number | null = null
  let lng: number | null = null
  if (typeof b.lat === 'number' && typeof b.lng === 'number') {
    lat = b.lat
    lng = b.lng
  }

  const artisan = await db.cityArtisan.create({
    data: {
      name,
      trade,
      phone,
      district,
      address,
      lat,
      lng,
      verified: false,
      premium: false,
      rating: 5.0,
      reviewCount: 0,
      contactCount: 0,
      active: true,
    },
  })

  console.log(
    `[city-artisans] Artisan « ${name} » (${trade}) inscrit — en attente de validation mairie`,
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
