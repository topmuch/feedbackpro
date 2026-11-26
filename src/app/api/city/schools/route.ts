// ============================================================
// /api/city/schools
// ------------------------------------------------------------
// Écoles & Cours — annuaire des établissements + soutien scolaire.
//
// GET  → liste des écoles (filtres: ?type=primaire&district=X)
// POST → crée une école (self-service ou admin)
// ============================================================

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const VALID_TYPES = new Set([
  'creche', 'primaire', 'college', 'lycee', 'institut', 'formation', 'repetiteur',
])

// ---------------------------------------------------------------
// GET
// ---------------------------------------------------------------
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const type = url.searchParams.get('type')
  const district = url.searchParams.get('district')

  const where: { type?: string; status?: string; district?: string; active?: boolean } = {
    status: 'approved',
    active: true,
  }
  if (type && VALID_TYPES.has(type)) where.type = type
  if (district) where.district = district

  const schools = await db.citySchool.findMany({
    where,
    orderBy: [{ isPremium: 'desc' }, { name: 'asc' }],
    take: 50,
  })

  return ok({
    schools: schools.map((s) => ({
      id: s.id,
      name: s.name,
      type: s.type,
      levels: s.levels,
      phone: s.phone,
      whatsapp: s.whatsapp,
      address: s.address,
      lat: s.lat,
      lng: s.lng,
      hours: s.hours,
      photoUrl: s.photoUrl,
      description: s.description,
      district: s.district,
      isPremium: s.isPremium,
      coursePrice: s.coursePrice,
      verified: s.verified,
      createdAt: s.createdAt.toISOString(),
    })),
    count: schools.length,
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
    name?: string
    type?: string
    levels?: string
    phone?: string
    whatsapp?: string
    address?: string
    lat?: number
    lng?: number
    hours?: string
    photoUrl?: string
    description?: string
    district?: string
    coursePrice?: string
  }

  if (!b.name || b.name.trim().length < 3) {
    return fail('Nom requis (min. 3 caractères)', 400)
  }
  if (!b.type || !VALID_TYPES.has(b.type)) {
    return fail('Type invalide', 400)
  }
  if (!b.phone || b.phone.trim().length < 6) {
    return fail('Téléphone requis', 400)
  }

  const school = await db.citySchool.create({
    data: {
      name: b.name.trim().slice(0, 120),
      type: b.type,
      levels: b.levels?.trim().slice(0, 100) || null,
      phone: b.phone.trim().slice(0, 30),
      whatsapp: b.whatsapp?.trim().slice(0, 30) || null,
      address: b.address?.trim().slice(0, 200) || null,
      lat: typeof b.lat === 'number' ? b.lat : null,
      lng: typeof b.lng === 'number' ? b.lng : null,
      hours: b.hours?.trim().slice(0, 100) || null,
      photoUrl: b.photoUrl?.slice(0, 500_000) || null,
      description: b.description?.trim().slice(0, 500) || null,
      district: b.district || null,
      coursePrice: b.coursePrice?.trim().slice(0, 60) || null,
      status: 'pending',
      verified: false,
      isPremium: false,
    },
  })

  console.log(`[city-schools] 🏫 École créée: ${school.name} (${school.type})`)
  return ok({ school: { id: school.id, name: school.name, status: school.status } }, 201)
}
