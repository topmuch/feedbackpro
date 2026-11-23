// ============================================================
// /api/city/plates
// ------------------------------------------------------------
// Ville Connectée — Plaques QR citoyennes installées dans les
// espaces publics de Dakar (marchés, places, gares…).
//
// GET  → liste toutes les plaques (auto-seed de 10 plaques si la
//        base est vide). Triées par plateNumber ASC.
// POST → crée une nouvelle plaque (plateNumber + qrToken auto).
//        Body : { label, district?, address?, lat?, lng? }
// ============================================================

import { NextRequest } from 'next/server'
import crypto from 'crypto'
import { db } from '@/lib/db'
import { ok, fail } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// ---------------------------------------------------------------
// Plaques Dakar — seed initial (10 plaques emblématiques).
// Attribuées à des quartiers réels de la capitale.
// ---------------------------------------------------------------

const SEED_PLATES: ReadonlyArray<{
  plateNumber: string
  label: string
  district: string
  address?: string
  lat?: number
  lng?: number
}> = [
  {
    plateNumber: '#0001',
    label: "Place de l'Indépendance",
    district: 'Plateau',
    address: 'Place de l\'Indépendance, Dakar',
    lat: 14.6707,
    lng: -17.4393,
  },
  {
    plateNumber: '#0002',
    label: 'Marché Sandaga',
    district: 'Plateau',
    address: 'Rue Thannos, Dakar',
    lat: 14.6655,
    lng: -17.4366,
  },
  {
    plateNumber: '#0003',
    label: 'Gare Routière Pompiers',
    district: 'Médina',
    address: 'Boulevard du Général de Gaulle, Dakar',
    lat: 14.6693,
    lng: -17.4534,
  },
  {
    plateNumber: '#0004',
    label: 'Avenue Léopold Sédar Senghor',
    district: 'Plateau',
    address: 'Avenue Léopold Sédar Senghor, Dakar',
    lat: 14.6750,
    lng: -17.4409,
  },
  {
    plateNumber: '#0005',
    label: 'Mosquée de la Divinité',
    district: 'Parcelles',
    address: 'Corniche Ouest, Dakar',
    lat: 14.6840,
    lng: -17.4685,
  },
  {
    plateNumber: '#0006',
    label: 'Stade Léopold Sédar Senghor',
    district: 'Grand Dakar',
    address: 'Boulevard Général de Gaulle, Dakar',
    lat: 14.7300,
    lng: -17.4567,
  },
  {
    plateNumber: '#0007',
    label: 'Marché Tilène',
    district: 'Médina',
    address: 'Rue 10 Médina, Dakar',
    lat: 14.6720,
    lng: -17.4500,
  },
  {
    plateNumber: '#0008',
    label: 'Avenue Cheikh Anta Diop',
    district: 'Plateau',
    address: 'Avenue Cheikh Anta Diop, Dakar',
    lat: 14.6760,
    lng: -17.4370,
  },
  {
    plateNumber: '#0009',
    label: 'Port de Dakar',
    district: 'Grand Dakar',
    address: 'Boulevard de la République, Dakar',
    lat: 14.6825,
    lng: -17.4189,
  },
  {
    plateNumber: '#0010',
    label: 'Pharmacie de Garde Plateau',
    district: 'Plateau',
    address: 'Rue Mohamed V, Dakar',
    lat: 14.6680,
    lng: -17.4385,
  },
] as const

/** Tire un scanCount aléatoire entre 10 et 500 (jauge de fréquentation). */
function randomScanCount(): number {
  return Math.floor(Math.random() * (500 - 10 + 1)) + 10
}

/** Génère un qrToken cryptographique (12 octets → 24 caractères hex). */
function generateQrToken(): string {
  return crypto.randomBytes(12).toString('hex')
}

/**
 * Auto-seed : si aucune plaque n'existe en base, on insère les 10 plaques
 * Dakar canoniques avec un qrToken unique et un scanCount aléatoire.
 * Idempotent : si au moins une plaque existe déjà, on ne fait rien.
 */
async function autoSeedIfEmpty(): Promise<void> {
  const count = await db.cityPlate.count()
  if (count > 0) return

  await db.cityPlate.createMany({
    data: SEED_PLATES.map((p) => ({
      plateNumber: p.plateNumber,
      qrToken: generateQrToken(),
      label: p.label,
      district: p.district,
      address: p.address ?? null,
      lat: p.lat ?? null,
      lng: p.lng ?? null,
      status: 'active',
      scanCount: randomScanCount(),
    })),
  })

  console.log(
    `[city-plates] 🏙️ Auto-seed initial : ${SEED_PLATES.length} plaques Dakar créées`,
  )
}

/**
 * Calcule le prochain plateNumber disponible au format #00XX.
 * On lit toutes les plaques existantes, on extrait le numéro le plus élevé
 * et on l'incrémente de 1. Format zero-padded sur 4 chiffres.
 */
async function nextPlateNumber(): Promise<string> {
  const plates = await db.cityPlate.findMany({
    select: { plateNumber: true },
    orderBy: { plateNumber: 'asc' },
  })

  let max = 0
  for (const p of plates) {
    // "#0007" → extrait "0007" → 7
    const match = p.plateNumber.match(/#?(\d+)/)
    if (match) {
      const n = parseInt(match[1], 10)
      if (!Number.isNaN(n) && n > max) max = n
    }
  }

  const next = max + 1
  return `#${String(next).padStart(4, '0')}`
}

// ---------------------------------------------------------------
// Sérialisation API (forme stable, jamais d'id brut inutile mais
// qrToken conservé pour la génération du QR code côté frontend).
// ---------------------------------------------------------------
function serialize(p: {
  id: string
  plateNumber: string
  qrToken: string
  label: string
  district: string | null
  address: string | null
  lat: number | null
  lng: number | null
  status: string
  installedAt: Date
  lastScanAt: Date | null
  scanCount: number
  createdAt: Date
  updatedAt: Date
}) {
  return {
    id: p.id,
    plateNumber: p.plateNumber,
    qrToken: p.qrToken,
    label: p.label,
    district: p.district,
    address: p.address,
    lat: p.lat,
    lng: p.lng,
    status: p.status,
    installedAt: p.installedAt.toISOString(),
    lastScanAt: p.lastScanAt ? p.lastScanAt.toISOString() : null,
    scanCount: p.scanCount,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  }
}

// ---------------------------------------------------------------
// GET — liste des plaques (avec auto-seed si base vide)
// ---------------------------------------------------------------
export async function GET(_req: NextRequest) {
  // Auto-seed (idempotent) — exécuté avant la lecture.
  try {
    await autoSeedIfEmpty()
  } catch (e) {
    console.error('[city-plates] Erreur auto-seed :', e)
  }

  const plates = await db.cityPlate.findMany({
    orderBy: { plateNumber: 'asc' },
  })

  const serialized = plates.map(serialize)

  return ok({ plates: serialized, count: serialized.length })
}

// ---------------------------------------------------------------
// POST — création d'une nouvelle plaque
// Body : { label, district?, address?, lat?, lng? }
// ---------------------------------------------------------------
export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return fail('Payload JSON invalide', 400)
  }

  const b = body as {
    label?: string
    district?: string
    address?: string
    lat?: number
    lng?: number
  }

  // label obligatoire (min 2, max 100)
  if (typeof b.label !== 'string' || b.label.trim().length < 2) {
    return fail('Le libellé est obligatoire (min. 2 caractères)', 400)
  }
  if (b.label.trim().length > 100) {
    return fail('Le libellé est trop long (max. 100 caractères)', 400)
  }
  const label = b.label.trim()

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

  // lat/lng optionnelles (float)
  let lat: number | null = null
  let lng: number | null = null
  if (b.lat !== undefined && b.lat !== null) {
    const parsed = typeof b.lat === 'number' ? b.lat : parseFloat(String(b.lat))
    if (Number.isNaN(parsed) || parsed < -90 || parsed > 90) {
      return fail('lat invalide (latitude -90..90)', 400)
    }
    lat = parsed
  }
  if (b.lng !== undefined && b.lng !== null) {
    const parsed = typeof b.lng === 'number' ? b.lng : parseFloat(String(b.lng))
    if (Number.isNaN(parsed) || parsed < -180 || parsed > 180) {
      return fail('lng invalide (longitude -180..180)', 400)
    }
    lng = parsed
  }

  // Génération plateNumber + qrToken uniques
  const plateNumber = await nextPlateNumber()
  let qrToken = generateQrToken()

  // Sécurité : on vérifie l'unicité du token (collision quasi impossible
  // avec 12 octets, mais Prisma lèverait une contrainte — on gère proprement
  // en régénérant un token si collision).
  const existingToken = await db.cityPlate.findUnique({
    where: { qrToken },
    select: { id: true },
  })
  if (existingToken) {
    qrToken = crypto.randomBytes(16).toString('hex')
  }

  const created = await db.cityPlate.create({
    data: {
      plateNumber,
      qrToken,
      label,
      district,
      address,
      lat,
      lng,
      status: 'active',
    },
  })

  console.log(
    `[city-plates] 🆕 Plaque ${plateNumber} « ${label} » créée (${district ?? 'quartier non précisé'})`,
  )

  return ok({ plate: serialize(created) }, 201)
}
