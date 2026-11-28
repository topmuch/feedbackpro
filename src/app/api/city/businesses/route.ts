// ============================================================
// /api/city/businesses
// ------------------------------------------------------------
// Ville Connectée — Annuaire self-service des commerces et
// artisans de Dakar (vitrine + GPS + offre flash premium).
//
// POST → Self-service create business listing (artisan ou commerce).
//        Body : { name, trade, category, phone, whatsapp?, district?,
//                  address?, lat?, lng?, photoUrl?, hours?,
//                  description? }
//        category ∈ { artisan, commerce, restaurant, coiffure,
//                     mecanicien, telephonie, nettoyage }
//        Crée avec status="pending", verified=false.
//        Retourne 201 { ok: true, data: { business: { id, status } } }
//
// GET  → Liste businesses avec filtres optionnels.
//        Query : ?lat=X&lng=Y&radius=500 (Haversine, défaut 500m),
//                ?category=Z, ?status=approved (défaut: approved+verified),
//                ?district=X
//        Si lat/lng fournis → calcul distance, filtre radius, tri distance.
//        Retourne { ok: true, data: { businesses: [{..., distance?}] } }
//
// NOTE: Le modèle Prisma est CityArtisan (utilisé pour les artisans
// ET les commerces — le champ `category` distingue les deux).
// ============================================================

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// ---------------------------------------------------------------
// Constantes de validation
// ---------------------------------------------------------------

const VALID_CATEGORIES = new Set([
  'artisan',
  'commerce',
  'restaurant',
  'coiffure',
  'mecanicien',
  'telephonie',
  'nettoyage',
])

/** Normalise un numéro de téléphone (supprime espaces, ., -). */
function normalizePhone(raw: string | undefined | null): string | null {
  if (!raw || typeof raw !== 'string') return null
  const cleaned = raw.replace(/[\s.-]/g, '')
  if (!/^\+?\d{8,15}$/.test(cleaned)) return null
  return cleaned
}

/**
 * Distance Haversine en mètres entre 2 points GPS.
 * Formule compacte (task spec) :
 *   acos(sin(φ1)·sin(φ2) + cos(φ1)·cos(φ2)·cos(Δλ)) × R
 * avec R = 6371000 m. Les lat/lng doivent être en radians.
 */
function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const r1 = toRad(lat1)
  const r2 = toRad(lat2)
  const dLng = toRad(lng2 - lng1)
  return (
    Math.acos(
      Math.sin(r1) * Math.sin(r2) +
        Math.cos(r1) * Math.cos(r2) * Math.cos(dLng),
    ) * 6371000
  )
}

/** Parse un nombre (lat/lng/radius) depuis number ou string. */
function parseNumber(
  value: string | null,
  min: number,
  max: number,
  label: string,
): number | null {
  if (value === null) return null
  const parsed = parseFloat(value)
  if (Number.isNaN(parsed) || parsed < min || parsed > max) {
    return null
  }
  return parsed
}

// ---------------------------------------------------------------
// POST — Self-service create business listing
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
    category?: string
    phone?: string
    whatsapp?: string
    district?: string
    address?: string
    lat?: number
    lng?: number
    photoUrl?: string
    hours?: string
    description?: string
    requestedPlan?: string
    menu?: string
    priceGrid?: string
  }

  // --- name (obligatoire, 2-80) ---
  if (typeof b.name !== 'string' || b.name.trim().length < 2) {
    console.log('[city-businesses] name manquant ou trop court')
    return fail('Le nom est obligatoire (min. 2 caractères)', 400)
  }
  if (b.name.trim().length > 80) {
    return fail('Le nom est trop long (max. 80 caractères)', 400)
  }
  const name = b.name.trim()

  // --- trade (obligatoire, 2-60) ---
  if (typeof b.trade !== 'string' || b.trade.trim().length < 2) {
    console.log('[city-businesses] trade manquant ou trop court')
    return fail('Le métier/activité est obligatoire (min. 2 caractères)', 400)
  }
  if (b.trade.trim().length > 60) {
    return fail('Le métier est trop long (max. 60 caractères)', 400)
  }
  const trade = b.trade.trim()

  // --- category (obligatoire, dans la liste valide) ---
  if (typeof b.category !== 'string' || !VALID_CATEGORIES.has(b.category)) {
    console.log(
      `[city-businesses] category invalide: ${String(b.category).slice(0, 40)}`,
    )
    return fail(
      'category invalide : doit être artisan, commerce, restaurant, coiffure, mecanicien, telephonie ou nettoyage',
      400,
    )
  }
  const category = b.category

  // --- phone (obligatoire, format valide) ---
  const phone = normalizePhone(b.phone)
  if (!phone) {
    console.log('[city-businesses] phone invalide')
    return fail(
      'Téléphone invalide (format attendu : +221 77 000 00 00 ou 770000000)',
      400,
    )
  }

  // --- whatsapp (optionnel) ---
  let whatsapp: string | null = null
  if (b.whatsapp !== undefined && b.whatsapp !== null) {
    whatsapp = normalizePhone(b.whatsapp)
    if (!whatsapp) {
      return fail('whatsapp invalide (même format que phone)', 400)
    }
  }

  // --- Champs texte optionnels ---
  let district: string | null = null
  let address: string | null = null
  let hours: string | null = null
  let description: string | null = null

  if (b.district && typeof b.district === 'string') {
    district = b.district.trim().slice(0, 60) || null
  }
  if (b.address && typeof b.address === 'string') {
    address = b.address.trim().slice(0, 200) || null
  }
  if (b.hours && typeof b.hours === 'string') {
    hours = b.hours.trim().slice(0, 200) || null
  }
  if (b.description && typeof b.description === 'string') {
    description = b.description.trim().slice(0, 1000) || null
  }

  // --- photoUrl (optionnel, data URL ou URL HTTP) ---
  let photoUrl: string | null = null
  if (b.photoUrl && typeof b.photoUrl === 'string') {
    photoUrl = b.photoUrl.trim().slice(0, 500_000) || null
  }

  // --- lat/lng (optionnels, validés) ---
  let lat: number | null = null
  let lng: number | null = null
  if (typeof b.lat === 'number' && typeof b.lng === 'number') {
    if (b.lat < -90 || b.lat > 90) {
      return fail('lat invalide (latitude -90..90)', 400)
    }
    if (b.lng < -180 || b.lng > 180) {
      return fail('lng invalide (longitude -180..180)', 400)
    }
    lat = b.lat
    lng = b.lng
  } else if (b.lat !== undefined || b.lng !== undefined) {
    // lat fourni sans lng ou inversement → incohérent
    return fail('lat et lng doivent être fournis ensemble', 400)
  }

  // ---------------------------------------------------------------
  // Plan : standard (auto-validé) ou premium (dossier + paiement mairie)
  // ---------------------------------------------------------------
  const requestedPlan = b.requestedPlan === 'premium' ? 'premium' : 'standard'

  // Génère un numéro de dossier pour les premium (ex: 1544DFF)
  const generateDossier = () => {
    const nums = Math.floor(1000 + Math.random() * 9000)
    const letters = Array.from({ length: 3 }, () =>
      String.fromCharCode(65 + Math.floor(Math.random() * 26)),
    ).join('')
    return `${nums}${letters}`
  }

  // Menu / priceGrid (pour premium — l'artisan configure ses produits)
  let menuJson: string | null = null
  if (typeof b.menu === 'string' && b.menu.trim().startsWith('[')) {
    try {
      const parsed = JSON.parse(b.menu)
      if (Array.isArray(parsed) && parsed.length <= 10) menuJson = b.menu.trim().slice(0, 500_000)
    } catch { /* ignore */ }
  }
  let priceGridJson: string | null = null
  if (typeof b.priceGrid === 'string' && b.priceGrid.trim().startsWith('[')) {
    try {
      const parsed = JSON.parse(b.priceGrid)
      if (Array.isArray(parsed) && parsed.length <= 10) priceGridJson = b.priceGrid.trim().slice(0, 500_000)
    } catch { /* ignore */ }
  }

  // ---------------------------------------------------------------
  // Création
  // - Standard : auto-validé (status=approved, verified=true)
  // - Premium  : en attente (status=pending) + numéro de dossier
  // ---------------------------------------------------------------
  const isPremium = requestedPlan === 'premium'
  const dossierNumber = isPremium ? generateDossier() : null

  // Pour premium, on stocke le numéro de dossier dans la description
  const finalDescription = isPremium
    ? `${description || ''}${description ? ' — ' : ''}[DOSSIER PREMIUM: ${dossierNumber} — Paiement à la mairie pour activation]`
    : description

  const business = await db.cityArtisan.create({
    data: {
      name,
      trade,
      category,
      phone,
      whatsapp,
      district,
      address,
      lat,
      lng,
      photoUrl,
      hours,
      description: finalDescription,
      verified: !isPremium, // standard = auto-validé, premium = en attente
      status: isPremium ? 'pending' : 'approved',
      premium: false, // sera activé manuellement après paiement
      isSponsored: false,
      menu: menuJson,
      priceGrid: priceGridJson,
      rating: 5.0,
      reviewCount: 0,
      contactCount: 0,
      active: true,
    },
  })

  console.log(
    `[city-businesses] Business « ${name} » (${category}/${trade}) créé — ${isPremium ? `PREMIUM dossier ${dossierNumber}` : 'STANDARD auto-validé'}`,
  )

  // Retour
  return ok(
    {
      business: {
        id: business.id,
        status: business.status,
        plan: requestedPlan,
        dossierNumber,
        verified: business.verified,
      },
    },
    201,
  )
}

// ---------------------------------------------------------------
// GET — Liste businesses avec filtres
// ---------------------------------------------------------------
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const latStr = url.searchParams.get('lat')
  const lngStr = url.searchParams.get('lng')
  const radiusStr = url.searchParams.get('radius') ?? '500'
  const category = url.searchParams.get('category')
  const statusParam = url.searchParams.get('status')
  const district = url.searchParams.get('district')

  // Filtre par défaut : status="approved" + verified=true
  // (pour ne montrer que les commerces validés par la mairie).
  // Si ?status=explicit (pending|approved|rejected|all) → surcharge.
  const where: {
    category?: string
    status?: string
    verified?: boolean
    district?: string
    active?: boolean
  } = {
    status: 'approved',
    verified: true,
    active: true,
  }

  if (category && VALID_CATEGORIES.has(category)) {
    where.category = category
  }

  // Status override :
  //  - "all" → pas de filtre status (mais garde verified=true par défaut)
  //  - "pending"|"approved"|"rejected" → filtre status explicite
  //  - sinon → défaut approved
  if (statusParam === 'all') {
    delete where.status
    // Pour ?status=all on relaxe aussi le filtre verified (admin view)
    delete where.verified
  } else if (
    statusParam === 'pending' ||
    statusParam === 'approved' ||
    statusParam === 'rejected'
  ) {
    where.status = statusParam
    // Pour les vues admin (pending/rejected) on relaxe le filtre verified.
    if (statusParam !== 'approved') {
      delete where.verified
    }
  }

  if (district && district.trim().length > 0) {
    where.district = district.trim()
  }

  const businesses = await db.cityArtisan.findMany({
    where,
    orderBy: [{ premium: 'desc' }, { rating: 'desc' }],
    take: 200,
  })

  // ---------------------------------------------------------------
  // Si lat/lng fournis → Haversine + filtre radius + tri par distance
  // ---------------------------------------------------------------
  const latNum = parseNumber(latStr, -90, 90, 'lat')
  const lngNum = parseNumber(lngStr, -180, 180, 'lng')
  const radiusNum = parseFloat(radiusStr)
  const hasGeo =
    latNum !== null &&
    lngNum !== null &&
    !Number.isNaN(radiusNum) &&
    radiusNum > 0

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
const serialize = (
  a: (typeof businesses)[number],
  distance?: number,
) => ({
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
  active: a.active,
  offerText: a.offerText,
  offerEndsAt: a.offerEndsAt ? a.offerEndsAt.toISOString() : null,
  rating: a.rating,
  reviewCount: a.reviewCount,
  contactCount: a.contactCount,
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
  distance: distance ?? undefined,
})

  if (hasGeo) {
    const withDistance = businesses
      .filter((a) => a.lat !== null && a.lng !== null)
      .map((a) => ({
        business: a,
        distance: haversineMeters(latNum!, lngNum!, a.lat!, a.lng!),
      }))
      .filter((x) => x.distance <= radiusNum)
      .sort((a, b) => a.distance - b.distance)

    const serialized = withDistance.map((x) =>
      serialize(x.business, Math.round(x.distance)),
    )

    return ok({
      businesses: serialized,
      count: serialized.length,
      filtered: true,
      radius: radiusNum,
    })
  }

  const serialized = businesses.map((a) => serialize(a))

  return ok({ businesses: serialized, count: serialized.length })
}
