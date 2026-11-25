// ============================================================
// /api/city/businesses/[id]
// ------------------------------------------------------------
// Ville Connectée — Actions admin sur une fiche commerce/artisan.
//
// PATCH → Update business (admin actions mairie).
//         Body : { status?: "approved"|"rejected",
//                  verified?: boolean,
//                  isPremium?: boolean,
//                  isSponsored?: boolean,
//                  offerText?: string,
//                  offerEndsAt?: string (ISO) }
//         Quand status → "approved", on force aussi verified=true.
//         Retourne { ok: true, data: { business: {...} } }
//
// DELETE → Delete business.
//          Retourne { ok: true, data: { deleted: id } }
//
// NOTE: Le modèle Prisma est CityArtisan (champ `premium` en base,
// mappé depuis `isPremium` dans l'API pour la cohérence avec la spec).
// ============================================================

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// ---------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------

const VALID_STATUSES = new Set(['approved', 'rejected'])

/** Parse un champ JSON stocké en base (menu / priceGrid) en tableau typé.
 *  Renvoie [] si la valeur est null ou invalide — defensive parsing. */
function parseJsonArray<T>(raw: string | null): T[] {
  if (!raw || typeof raw !== 'string') return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as T[]) : []
  } catch {
    return []
  }
}

/** Sérialise un business pour la réponse API. */
function serialize(a: {
  id: string
  name: string
  trade: string
  category: string
  phone: string
  whatsapp: string | null
  district: string | null
  address: string | null
  lat: number | null
  lng: number | null
  photoUrl: string | null
  hours: string | null
  description: string | null
  verified: boolean
  status: string
  premium: boolean
  isSponsored: boolean
  offerText: string | null
  offerEndsAt: Date | null
  rating: number
  reviewCount: number
  contactCount: number
  active: boolean
  menu: string | null
  priceGrid: string | null
  createdAt: Date
  updatedAt: Date
}) {
  return {
    id: a.id,
    name: a.name,
    trade: a.trade,
    category: a.category,
    phone: a.phone,
    whatsapp: a.whatsapp,
    district: a.district,
    address: a.address,
    lat: a.lat,
    lng: a.lng,
    photoUrl: a.photoUrl,
    hours: a.hours,
    description: a.description,
    verified: a.verified,
    status: a.status,
    isPremium: a.premium,
    isSponsored: a.isSponsored,
    offerText: a.offerText,
    offerEndsAt: a.offerEndsAt ? a.offerEndsAt.toISOString() : null,
    rating: a.rating,
    reviewCount: a.reviewCount,
    contactCount: a.contactCount,
    active: a.active,
    // Champs premium : JSON parsé côté serveur → tableau prêt à l'emploi
    menu: parseJsonArray<{
      id?: string
      name: string
      price: number
      description?: string | null
      photo?: string | null
    }>(a.menu),
    priceGrid: parseJsonArray<{
      id?: string
      service: string
      price: number
      unit?: string | null
      photo?: string | null
    }>(a.priceGrid),
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  }
}

// ---------------------------------------------------------------
// PATCH — Update business (admin actions)
// ---------------------------------------------------------------
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  if (!id) return fail('ID manquant', 400)

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return fail('Payload JSON invalide', 400)
  }

  const b = body as {
    status?: string
    verified?: boolean
    isPremium?: boolean
    isSponsored?: boolean
    offerText?: string
    offerEndsAt?: string
    premiumFeatures?: string[]
    // Premium features — JSON string sérialisé côté client
    menu?: string | null
    priceGrid?: string | null
  }

  const current = await db.cityArtisan.findUnique({ where: { id } })
  if (!current) {
    console.log(`[city-businesses] PATCH: business ${id} introuvable`)
    return fail('Business introuvable', 404)
  }

  const data: Record<string, unknown> = {}

  // --- status (approved | rejected) ---
  if (typeof b.status === 'string') {
    if (!VALID_STATUSES.has(b.status)) {
      return fail(
        'status invalide : doit être "approved" ou "rejected"',
        400,
      )
    }
    data.status = b.status
    // Quand status → "approved", on force aussi verified=true
    // (un business approuvé par la mairie est implicitement vérifié).
    if (b.status === 'approved') {
      data.verified = true
    }
  }

  // --- verified (boolean explicite) ---
  if (typeof b.verified === 'boolean') {
    // Sauf si status="approved" vient juste de forcer verified=true,
    // on prend la valeur explicite du body.
    if (!(data.status === 'approved' && b.verified === false)) {
      data.verified = b.verified
    }
  }

  // --- isPremium → premium (mapping champ API → champ DB) ---
  if (typeof b.isPremium === 'boolean') {
    data.premium = b.isPremium
  }

  // --- isSponsored ---
  if (typeof b.isSponsored === 'boolean') {
    data.isSponsored = b.isSponsored
  }

  // --- offerText (string optionnel, max 500) ---
  if (b.offerText !== undefined) {
    if (b.offerText !== null && typeof b.offerText !== 'string') {
      return fail('offerText invalide (chaîne attendue)', 400)
    }
    const trimmed =
      typeof b.offerText === 'string' ? b.offerText.trim() : null
    if (trimmed && trimmed.length > 500) {
      return fail('offerText trop long (max. 500 caractères)', 400)
    }
    data.offerText = trimmed || null
  }

  // --- offerEndsAt (ISO string → Date) ---
  if (b.offerEndsAt !== undefined) {
    if (b.offerEndsAt === null || b.offerEndsAt === '') {
      data.offerEndsAt = null
    } else if (typeof b.offerEndsAt === 'string') {
      const parsed = new Date(b.offerEndsAt)
      if (Number.isNaN(parsed.getTime())) {
        return fail('offerEndsAt invalide (format ISO attendu)', 400)
      }
      data.offerEndsAt = parsed
    } else {
      return fail('offerEndsAt invalide (chaîne ISO attendue)', 400)
    }
  }

  // --- menu (JSON string : [{name, photo, price, description?}])
  //      Limité à 10 items, photos en data URL (max ~500 KB par item).
  if (b.menu !== undefined) {
    if (b.menu === null || b.menu === '') {
      data.menu = null
    } else if (typeof b.menu === 'string') {
      // Validation : doit parser en tableau ≤ 10 items
      try {
        const parsed = JSON.parse(b.menu)
        if (!Array.isArray(parsed)) {
          return fail('menu invalide (tableau JSON attendu)', 400)
        }
        if (parsed.length > 10) {
          return fail('menu trop long (max. 10 articles)', 400)
        }
        // Limite anti-abus sur la taille totale du JSON stocké
        if (b.menu.length > 5_000_000) {
          return fail('menu trop volumineux (max. 5 Mo)', 400)
        }
      } catch {
        return fail('menu invalide (JSON malformé)', 400)
      }
      data.menu = b.menu
    } else {
      return fail('menu invalide (chaîne JSON attendue)', 400)
    }
  }

  // --- priceGrid (JSON string : [{service, photo, price, unit?}])
  if (b.priceGrid !== undefined) {
    if (b.priceGrid === null || b.priceGrid === '') {
      data.priceGrid = null
    } else if (typeof b.priceGrid === 'string') {
      try {
        const parsed = JSON.parse(b.priceGrid)
        if (!Array.isArray(parsed)) {
          return fail('priceGrid invalide (tableau JSON attendu)', 400)
        }
        if (parsed.length > 10) {
          return fail('priceGrid trop long (max. 10 prestations)', 400)
        }
        if (b.priceGrid.length > 5_000_000) {
          return fail('priceGrid trop volumineux (max. 5 Mo)', 400)
        }
      } catch {
        return fail('priceGrid invalide (JSON malformé)', 400)
      }
      data.priceGrid = b.priceGrid
    } else {
      return fail('priceGrid invalide (chaîne JSON attendue)', 400)
    }
  }

  if (Object.keys(data).length === 0) {
    return fail('Aucun champ à mettre à jour', 400)
  }

  const updated = await db.cityArtisan.update({
    where: { id },
    data,
  })

  console.log(
    `[city-businesses] Business ${id} mis à jour — champs: ${Object.keys(data).join(', ')}`,
  )

  return ok({ business: serialize(updated) })
}

// ---------------------------------------------------------------
// DELETE — Delete business
// ---------------------------------------------------------------
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  if (!id) return fail('ID manquant', 400)

  const existing = await db.cityArtisan.findUnique({
    where: { id },
    select: { id: true, name: true },
  })

  if (!existing) {
    console.log(`[city-businesses] DELETE: business ${id} introuvable`)
    return fail('Business introuvable', 404)
  }

  await db.cityArtisan.delete({ where: { id } })

  console.log(`[city-businesses] Business « ${existing.name} » (${id}) supprimé`)

  return ok({ deleted: id })
}
