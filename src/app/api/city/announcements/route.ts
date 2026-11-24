// ============================================================
// /api/city/announcements
// ------------------------------------------------------------
// Ville Connectée — Annonces vocales diffusées sur les QR codes.
//
// GET  → liste des annonces (triées par createdAt DESC).
// POST → crée une nouvelle annonce.
//
// Body POST : { title, message, audioText?, status?, priority?,
//               broadcastHours? (string[]), targetDistrict?,
//               startAt?, endAt? }
// ============================================================

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// ---------------------------------------------------------------
// Helpers de validation
// ---------------------------------------------------------------

const VALID_STATUSES = new Set(['draft', 'scheduled', 'active', 'expired'])
const VALID_PRIORITIES = new Set(['normal', 'urgent', 'info'])

// ---------------------------------------------------------------
// GET — liste des annonces
// ---------------------------------------------------------------
export async function GET() {
  const announcements = await db.cityAnnouncement.findMany({
    orderBy: { createdAt: 'desc' },
    take: 100,
  })

  const serialized = announcements.map((a) => ({
    id: a.id,
    title: a.title,
    message: a.message,
    audioText: a.audioText,
    status: a.status,
    priority: a.priority,
    broadcastHours: a.broadcastHours ? JSON.parse(a.broadcastHours) : null,
    targetDistrict: a.targetDistrict,
    startAt: a.startAt ? a.startAt.toISOString() : null,
    endAt: a.endAt ? a.endAt.toISOString() : null,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  }))

  return ok({ announcements: serialized, count: serialized.length })
}

// ---------------------------------------------------------------
// POST — créer une annonce
// ---------------------------------------------------------------
export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return fail('Payload JSON invalide', 400)
  }

  const b = body as {
    title?: string
    message?: string
    audioText?: string
    status?: string
    priority?: string
    broadcastHours?: string[]
    targetDistrict?: string
    startAt?: string
    endAt?: string
  }

  // --- Validation ---

  if (!b.title || typeof b.title !== 'string' || b.title.trim().length < 3) {
    return fail('Le titre est requis (min. 3 caractères)', 400)
  }
  if (!b.message || typeof b.message !== 'string' || b.message.trim().length < 5) {
    return fail('Le message est requis (min. 5 caractères)', 400)
  }

  const status = b.status && VALID_STATUSES.has(b.status) ? b.status : 'scheduled'
  const priority = b.priority && VALID_PRIORITIES.has(b.priority) ? b.priority : 'normal'

  // broadcastHours : tableau de strings "HH:MM"
  let broadcastHoursJson: string | null = null
  if (Array.isArray(b.broadcastHours)) {
    const valid = b.broadcastHours
      .filter((h) => typeof h === 'string' && /^\d{2}:\d{2}$/.test(h))
      .slice(0, 12)
    if (valid.length > 0) broadcastHoursJson = JSON.stringify(valid)
  }

  // Dates optionnelles
  let startAt: Date | null = null
  let endAt: Date | null = null
  try {
    if (b.startAt) startAt = new Date(b.startAt)
    if (b.endAt) endAt = new Date(b.endAt)
  } catch {
    return fail('Format de date invalide', 400)
  }

  // targetDistrict : string optionnelle (max 60)
  let targetDistrict: string | null = null
  if (typeof b.targetDistrict === 'string' && b.targetDistrict.trim().length > 0) {
    targetDistrict = b.targetDistrict.trim().slice(0, 60)
  }

  // --- Création ---

  const announcement = await db.cityAnnouncement.create({
    data: {
      title: b.title.trim().slice(0, 120),
      message: b.message.trim().slice(0, 1000),
      audioText: b.audioText?.trim().slice(0, 500) || null,
      status,
      priority,
      broadcastHours: broadcastHoursJson,
      targetDistrict,
      startAt,
      endAt,
    },
  })

  console.log(
    `[city-announcements] 📢 Annonce créée: "${announcement.title}" (${announcement.priority})`,
  )

  return ok(
    {
      announcement: {
        id: announcement.id,
        title: announcement.title,
        message: announcement.message,
        status: announcement.status,
        priority: announcement.priority,
        createdAt: announcement.createdAt.toISOString(),
      },
    },
    201,
  )
}
