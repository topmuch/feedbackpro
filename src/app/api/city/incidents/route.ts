// ============================================================
// /api/city/incidents
// ------------------------------------------------------------
// Ville Connectée — Signalements citoyens émis depuis les
// plaques QR publiques de Dakar.
//
// GET  → liste des incidents (filtres ?status & ?type).
//        Triés par createdAt DESC, limit 100, avec plaque liée.
// POST → crée un incident depuis le scan citoyen :
//          - si qrToken → résout la plaque, incrémente scanCount,
//            met à jour lastScanAt.
//          - type : emergency | report | orientation | artisan | mairie
//          - emergency → assignedTo="Police", status="assigned"
//          - report    → auto-routage par category vers Mairie /
//                        Senelec / ONAS.
// Body : { qrToken?, type, category?, description?, gpsLat?, gpsLng? }
// ============================================================

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// ---------------------------------------------------------------
// Types & constantes de validation
// ---------------------------------------------------------------

const VALID_TYPES = new Set([
  'emergency',
  'report',
  'orientation',
  'artisan',
  'mairie',
])

const VALID_STATUSES = new Set([
  'pending',
  'assigned',
  'in_progress',
  'resolved',
])

/** Catégories reconnues pour le type "report" et leur service assigné. */
const CATEGORY_ROUTING: Readonly<Record<string, string>> = {
  propreté: 'Mairie',
  proprete: 'Mairie',
  voirie: 'Mairie',
  éclairage: 'Senelec',
  eclairage: 'Senelec',
  eau: 'ONAS',
  transport: 'Mairie',
  sécurité: 'Police',
  securite: 'Police',
} as const

/**
 * Détermine le service assigné à un signalement citoyen.
 * - Pour "emergency" → Police (toujours)
 * - Pour "report"    → Mairie par défaut, sauf routage spécialisé
 *                      (Senelec pour éclairage, ONAS pour eau…)
 * - Pour les autres types → null (à assigner manuellement par la mairie)
 */
function resolveAssignedTo(type: string, category?: string | null): string | null {
  if (type === 'emergency') return 'Police'
  if (type === 'report') {
    if (!category) return 'Mairie'
    const normalized = category.trim().toLowerCase()
    return CATEGORY_ROUTING[normalized] ?? 'Mairie'
  }
  return null
}

// ---------------------------------------------------------------
// GET — liste des incidents (avec plaque liée)
// ---------------------------------------------------------------
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const status = url.searchParams.get('status')
  const type = url.searchParams.get('type')
  const limit = Math.min(
    parseInt(url.searchParams.get('limit') ?? '100', 10) || 100,
    200,
  )

  const where: { status?: string; type?: string } = {}
  if (status && VALID_STATUSES.has(status)) where.status = status
  if (type && VALID_TYPES.has(type)) where.type = type

  const incidents = await db.cityIncident.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: {
      plate: {
        select: {
          id: true,
          plateNumber: true,
          label: true,
          district: true,
        },
      },
    },
  })

  const serialized = incidents.map((i) => ({
    id: i.id,
    plateId: i.plateId,
    plate: i.plate
      ? {
          id: i.plate.id,
          plateNumber: i.plate.plateNumber,
          label: i.plate.label,
          district: i.plate.district,
        }
      : null,
    qrToken: i.qrToken,
    type: i.type,
    category: i.category,
    description: i.description,
    gpsLat: i.gpsLat,
    gpsLng: i.gpsLng,
    status: i.status,
    assignedTo: i.assignedTo,
    staffName: i.staffName,
    resolvedAt: i.resolvedAt ? i.resolvedAt.toISOString() : null,
    // SLA photos (transparence citoyenne)
    arrivedAt: i.arrivedAt ? i.arrivedAt.toISOString() : null,
    beforePhoto: i.beforePhoto ?? null,
    afterPhoto: i.afterPhoto ?? null,
    createdAt: i.createdAt.toISOString(),
    updatedAt: i.updatedAt.toISOString(),
  }))

  return ok({ incidents: serialized, count: serialized.length })
}

// ---------------------------------------------------------------
// POST — créer un incident depuis un scan citoyen
// ---------------------------------------------------------------
export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return fail('Payload JSON invalide', 400)
  }

  const b = body as {
    qrToken?: string
    type?: string
    category?: string
    description?: string
    gpsLat?: number
    gpsLng?: number
  }

  // type obligatoire
  if (typeof b.type !== 'string' || !VALID_TYPES.has(b.type)) {
    return fail(
      'type invalide : doit être emergency, report, orientation, artisan ou mairie',
      400,
    )
  }
  const type = b.type as string

  // category optionnelle (max 60)
  let category: string | null = null
  if (b.category !== undefined && b.category !== null) {
    if (typeof b.category !== 'string') {
      return fail('category invalide', 400)
    }
    const trimmed = b.category.trim()
    if (trimmed.length > 60) {
      return fail('category trop longue (max. 60 caractères)', 400)
    }
    category = trimmed || null
  }

  // description optionnelle (max 1000)
  let description: string | null = null
  if (b.description !== undefined && b.description !== null) {
    if (typeof b.description !== 'string') {
      return fail('description invalide', 400)
    }
    const trimmed = b.description.trim()
    if (trimmed.length > 1000) {
      return fail('description trop longue (max. 1000 caractères)', 400)
    }
    description = trimmed || null
  }

  // GPS optionnel
  let gpsLat: number | null = null
  let gpsLng: number | null = null
  if (b.gpsLat !== undefined && b.gpsLat !== null) {
    const parsed =
      typeof b.gpsLat === 'number' ? b.gpsLat : parseFloat(String(b.gpsLat))
    if (Number.isNaN(parsed) || parsed < -90 || parsed > 90) {
      return fail('gpsLat invalide (latitude -90..90)', 400)
    }
    gpsLat = parsed
  }
  if (b.gpsLng !== undefined && b.gpsLng !== null) {
    const parsed =
      typeof b.gpsLng === 'number' ? b.gpsLng : parseFloat(String(b.gpsLng))
    if (Number.isNaN(parsed) || parsed < -180 || parsed > 180) {
      return fail('gpsLng invalide (longitude -180..180)', 400)
    }
    gpsLng = parsed
  }

  // ---------------------------------------------------------------
  // 1. Résolution de la plaque (si qrToken fourni)
  // ---------------------------------------------------------------
  let plateId: string | null = null
  let qrTokenResolved: string | null = null

  if (b.qrToken && typeof b.qrToken === 'string') {
    const token = b.qrToken.trim()
    if (token.length === 0) {
      return fail('qrToken vide', 400)
    }

    const plate = await db.cityPlate.findUnique({
      where: { qrToken: token },
      select: { id: true, plateNumber: true, label: true, scanCount: true },
    })

    if (!plate) {
      return fail(
        'Plaque introuvable pour ce qrToken. Le QR code est peut-être non installé ou désactivé.',
        404,
      )
    }

    plateId = plate.id
    qrTokenResolved = token

    // Incrémentation scanCount + maj lastScanAt (transaction atomique).
    await db.cityPlate.update({
      where: { id: plate.id },
      data: {
        scanCount: { increment: 1 },
        lastScanAt: new Date(),
      },
    })

    console.log(
      `[city-incidents] 📲 Plaque ${plate.plateNumber} scannée — scanCount=${plate.scanCount + 1}`,
    )
  }

  // ---------------------------------------------------------------
  // 2. Routage automatique selon type + category
  // ---------------------------------------------------------------
  const assignedTo = resolveAssignedTo(type, category)
  // Pour "emergency", on passe directement en "assigned" (pas de pending).
  const initialStatus = type === 'emergency' ? 'assigned' : 'pending'

  // ---------------------------------------------------------------
  // 3. Création de l'incident
  // ---------------------------------------------------------------
  const incident = await db.cityIncident.create({
    data: {
      plateId,
      qrToken: qrTokenResolved,
      type,
      category,
      description,
      gpsLat,
      gpsLng,
      status: initialStatus,
      assignedTo,
    },
    include: {
      plate: {
        select: {
          id: true,
          plateNumber: true,
          label: true,
          district: true,
        },
      },
    },
  })

  console.log(
    `[city-incidents] 🆕 Incident ${incident.type} créé (#${incident.id.slice(-6)})` +
      (assignedTo ? ` → assigné à ${assignedTo}` : '') +
      (incident.plate ? ` | Plaque ${incident.plate.plateNumber}` : ''),
  )

  // ---------------------------------------------------------------
  // 4. Réponse
  // ---------------------------------------------------------------
  return ok(
    {
      incident: {
        id: incident.id,
        plateId: incident.plateId,
        plate: incident.plate
          ? {
              id: incident.plate.id,
              plateNumber: incident.plate.plateNumber,
              label: incident.plate.label,
              district: incident.plate.district,
            }
          : null,
        qrToken: incident.qrToken,
        type: incident.type,
        category: incident.category,
        description: incident.description,
        gpsLat: incident.gpsLat,
        gpsLng: incident.gpsLng,
        status: incident.status,
        assignedTo: incident.assignedTo,
        staffName: incident.staffName,
        resolvedAt: incident.resolvedAt ? incident.resolvedAt.toISOString() : null,
        createdAt: incident.createdAt.toISOString(),
        updatedAt: incident.updatedAt.toISOString(),
      },
    },
    201,
  )
}
