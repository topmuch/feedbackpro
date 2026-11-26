// ============================================================
// /api/city/quartier-ads
// ------------------------------------------------------------
// Annonces du Quartier — ventes, dons, services entre particuliers.
//
// GET  → liste des annonces (filtres: ?type=vente&district=X)
// POST → crée une annonce (self-service depuis le QR code)
// ============================================================

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const VALID_TYPES = new Set(['vente', 'don', 'service'])

// ---------------------------------------------------------------
// GET
// ---------------------------------------------------------------
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const type = url.searchParams.get('type')
  const district = url.searchParams.get('district')

  const where: { type?: string; status?: string; district?: string } = {
    status: 'active',
  }
  if (type && VALID_TYPES.has(type)) where.type = type
  if (district) where.district = district

  const ads = await db.cityQuartierAd.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 50,
  })

  return ok({
    ads: ads.map((a) => ({
      id: a.id,
      type: a.type,
      title: a.title,
      description: a.description,
      price: a.price,
      photoUrl: a.photoUrl,
      phone: a.phone,
      whatsapp: a.whatsapp,
      district: a.district,
      lat: a.lat,
      lng: a.lng,
      status: a.status,
      createdAt: a.createdAt.toISOString(),
    })),
    count: ads.length,
  })
}

// ---------------------------------------------------------------
// POST
// ---------------------------------------------------------------
export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return fail('Payload JSON invalide', 400)
  }

  const b = body as {
    type?: string
    title?: string
    description?: string
    price?: string
    photoUrl?: string
    phone?: string
    whatsapp?: string
    plateId?: string
    qrToken?: string
    district?: string
    lat?: number
    lng?: number
  }

  if (!b.type || !VALID_TYPES.has(b.type)) {
    return fail('Type invalide (vente, don ou service)', 400)
  }
  if (!b.title || b.title.trim().length < 3) {
    return fail('Titre requis (min. 3 caractères)', 400)
  }
  if (!b.phone || b.phone.trim().length < 6) {
    return fail('Téléphone requis', 400)
  }

  const ad = await db.cityQuartierAd.create({
    data: {
      type: b.type,
      title: b.title.trim().slice(0, 120),
      description: b.description?.trim().slice(0, 500) || null,
      price: b.price?.trim().slice(0, 60) || null,
      photoUrl: b.photoUrl?.slice(0, 500_000) || null,
      phone: b.phone.trim().slice(0, 30),
      whatsapp: b.whatsapp?.trim().slice(0, 30) || null,
      plateId: b.plateId || null,
      qrToken: b.qrToken || null,
      district: b.district || null,
      lat: typeof b.lat === 'number' ? b.lat : null,
      lng: typeof b.lng === 'number' ? b.lng : null,
      status: 'active',
    },
  })

  console.log(`[city-quartier-ads] 📢 Annonce créée: ${ad.type} — ${ad.title}`)
  return ok({ ad: { id: ad.id, type: ad.type, title: ad.title } }, 201)
}
