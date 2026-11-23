// ============================================================
// /api/city/tax-reports
// ------------------------------------------------------------
// Ville Connectée — Signalements de fraude fiscale par les
// citoyens (camions bennes sauvages, conteneurs non déclarés,
// véhicules commerciaux sans immatriculation…).
//
// GET  → liste des signalements fiscaux (filtre ?status & ?limit).
//        Triés par createdAt DESC, limit 100 (défaut 50),
//        avec plaque liée (plateNumber, label, district).
// POST → crée un signalement fiscal depuis un scan citoyen :
//          - si qrToken → résout la plaque, incrémente scanCount.
//          - photoUrl = dataURL base64 (caméra mobile), stockée as-is.
//          - status initial = 'reported'.
//          - crée aussi un CityIncident (type='report',
//            category='tax_fraud') pour l'intégration dashboard.
// Body : { qrToken?, photoUrl?, vehiclePlate?, description?,
//          gpsLat?, gpsLng?, citizenPhone? }
// ============================================================

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// ---------------------------------------------------------------
// Constantes de validation
// ---------------------------------------------------------------

const VALID_STATUSES = new Set([
  'reported',
  'verified',
  'tax_collected',
  'rewarded',
])

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 100

// ---------------------------------------------------------------
// Helpers de parsing
// ---------------------------------------------------------------

/** Parse un nombre décimal (lat/lng/amount) depuis number ou string. */
function parseNumber(
  value: unknown,
  min: number,
  max: number,
  label: string,
): number | null {
  if (value === undefined || value === null) return null
  const parsed = typeof value === 'number' ? value : parseFloat(String(value))
  if (Number.isNaN(parsed) || parsed < min || parsed > max) {
    throw new Error(`${label} invalide`)
  }
  return parsed
}

// ---------------------------------------------------------------
// GET — liste des signalements fiscaux (avec plaque liée)
// ---------------------------------------------------------------
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const status = url.searchParams.get('status')

  const requestedLimit = parseInt(
    url.searchParams.get('limit') ?? String(DEFAULT_LIMIT),
    10,
  )
  const limit = Number.isNaN(requestedLimit)
    ? DEFAULT_LIMIT
    : Math.min(requestedLimit, MAX_LIMIT)

  const where: { status?: string } = {}
  if (status && VALID_STATUSES.has(status)) where.status = status

  const reports = await db.cityTaxReport.findMany({
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

  const serialized = reports.map((r) => ({
    id: r.id,
    plateId: r.plateId,
    plate: r.plate
      ? {
          id: r.plate.id,
          plateNumber: r.plate.plateNumber,
          label: r.plate.label,
          district: r.plate.district,
        }
      : null,
    qrToken: r.qrToken,
    photoUrl: r.photoUrl,
    vehiclePlate: r.vehiclePlate,
    description: r.description,
    gpsLat: r.gpsLat,
    gpsLng: r.gpsLng,
    status: r.status,
    taxAmount: r.taxAmount,
    rewardAmount: r.rewardAmount,
    rewardMethod: r.rewardMethod,
    citizenPhone: r.citizenPhone,
    agentName: r.agentName,
    verifiedAt: r.verifiedAt ? r.verifiedAt.toISOString() : null,
    resolvedAt: r.resolvedAt ? r.resolvedAt.toISOString() : null,
    rewardedAt: r.rewardedAt ? r.rewardedAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }))

  return ok({ reports: serialized, count: serialized.length })
}

// ---------------------------------------------------------------
// POST — créer un signalement fiscal depuis un scan citoyen
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
    photoUrl?: string
    vehiclePlate?: string
    description?: string
    gpsLat?: number
    gpsLng?: number
    citizenPhone?: string
  }

  // ---------------------------------------------------------------
  // 1. Validation des champs optionnels
  // ---------------------------------------------------------------

  // photoUrl : dataURL base64 de la caméra mobile. On accepte la chaîne
  // telle quelle (potentiellement volumineuse mais OK pour la démo).
  // On borne uniquement la longueur minimale pour écarter les valeurs vides.
  let photoUrl: string | null = null
  if (b.photoUrl !== undefined && b.photoUrl !== null) {
    if (typeof b.photoUrl !== 'string') {
      return fail('photoUrl invalide (chaîne attendue)', 400)
    }
    const trimmed = b.photoUrl.trim()
    if (trimmed.length > 0) {
      photoUrl = trimmed
    }
  }

  // vehiclePlate : plaque d'immatriculation du véhicule signalé
  let vehiclePlate: string | null = null
  if (b.vehiclePlate !== undefined && b.vehiclePlate !== null) {
    if (typeof b.vehiclePlate !== 'string') {
      return fail('vehiclePlate invalide', 400)
    }
    const trimmed = b.vehiclePlate.trim()
    if (trimmed.length > 20) {
      return fail('vehiclePlate trop long (max. 20 caractères)', 400)
    }
    vehiclePlate = trimmed || null
  }

  // description (max 1000)
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
  try {
    gpsLat = parseNumber(b.gpsLat, -90, 90, 'gpsLat')
    gpsLng = parseNumber(b.gpsLng, -180, 180, 'gpsLng')
  } catch (e) {
    return fail((e as Error).message, 400)
  }

  // citizenPhone : téléphone du citoyen (pour la récompense ultérieure)
  let citizenPhone: string | null = null
  if (b.citizenPhone !== undefined && b.citizenPhone !== null) {
    if (typeof b.citizenPhone !== 'string') {
      return fail('citizenPhone invalide', 400)
    }
    const trimmed = b.citizenPhone.trim()
    if (trimmed.length > 30) {
      return fail('citizenPhone trop long (max. 30 caractères)', 400)
    }
    citizenPhone = trimmed || null
  }

  // ---------------------------------------------------------------
  // 2. Résolution de la plaque (si qrToken fourni)
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
      select: { id: true, plateNumber: true, scanCount: true },
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
      `[city-tax-reports] 📲 Plaque ${plate.plateNumber} scannée — scanCount=${plate.scanCount + 1}`,
    )
  }

  // ---------------------------------------------------------------
  // 3. Création du signalement fiscal (transaction atomique
  //    avec l'incident dashboard pour garantir la cohérence)
  // ---------------------------------------------------------------
  const taxReport = await db.$transaction(async (tx) => {
    // 3a. CityTaxReport — enregistrement principal
    const report = await tx.cityTaxReport.create({
      data: {
        plateId,
        qrToken: qrTokenResolved,
        photoUrl,
        vehiclePlate,
        description,
        gpsLat,
        gpsLng,
        status: 'reported',
        citizenPhone,
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

    // 3b. CityIncident — miroir pour l'intégration dashboard ville.
    //     type='report', category='tax_fraud' → routage Mairie par défaut.
    await tx.cityIncident.create({
      data: {
        plateId,
        qrToken: qrTokenResolved,
        type: 'report',
        category: 'tax_fraud',
        description: description ?? 'Signalement fraude fiscale',
        gpsLat,
        gpsLng,
        status: 'pending',
        assignedTo: 'Mairie',
      },
    })

    return report
  })

  console.log(
    `[city-tax-reports] 🆕 Signalement fiscal créé (#${taxReport.id.slice(-6)})` +
      (taxReport.plate ? ` | Plaque ${taxReport.plate.plateNumber}` : '') +
      (vehiclePlate ? ` | Véhicule ${vehiclePlate}` : ' | Dump sauvage'),
  )

  // ---------------------------------------------------------------
  // 4. Réponse
  // ---------------------------------------------------------------
  return ok(
    {
      report: {
        id: taxReport.id,
        plateId: taxReport.plateId,
        plate: taxReport.plate
          ? {
              id: taxReport.plate.id,
              plateNumber: taxReport.plate.plateNumber,
              label: taxReport.plate.label,
              district: taxReport.plate.district,
            }
          : null,
        qrToken: taxReport.qrToken,
        photoUrl: taxReport.photoUrl,
        vehiclePlate: taxReport.vehiclePlate,
        description: taxReport.description,
        gpsLat: taxReport.gpsLat,
        gpsLng: taxReport.gpsLng,
        status: taxReport.status,
        taxAmount: taxReport.taxAmount,
        rewardAmount: taxReport.rewardAmount,
        rewardMethod: taxReport.rewardMethod,
        citizenPhone: taxReport.citizenPhone,
        agentName: taxReport.agentName,
        verifiedAt: taxReport.verifiedAt
          ? taxReport.verifiedAt.toISOString()
          : null,
        resolvedAt: taxReport.resolvedAt
          ? taxReport.resolvedAt.toISOString()
          : null,
        rewardedAt: taxReport.rewardedAt
          ? taxReport.rewardedAt.toISOString()
          : null,
        createdAt: taxReport.createdAt.toISOString(),
        updatedAt: taxReport.updatedAt.toISOString(),
      },
    },
    201,
  )
}
