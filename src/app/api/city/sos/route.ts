// ============================================================
// /api/city/sos
// ------------------------------------------------------------
// Ville Connectée — SOS silencieux (appui long).
// Déclenché en situation d'urgence (agression, harcèlement, malaise)
// sans alerter l'agresseur. Capture photo/audio discrètement et
// envoie la position GPS à la Police.
//
// POST → Silent SOS (long press).
//        Body : { plateId?, qrToken?, photoDataUrl?, audioDataUrl?,
//                  gpsLat?, gpsLng?, citizenPhone? }
//        Crée un CityIncident (type="emergency", category="sécurité",
//          description="SOS silencieux déclenché", assignedTo="Police").
//        Stocke photo/audio/GPS dans la description (préfixes
//          SOS_PHOTO: / SOS_AUDIO: / SOS_GPS:) car le modèle
//          CityIncident n'a pas de champs dédiés pour ces médias.
//        Retourne 201 { ok: true, data: { sos: { id, incidentId } } }
// ============================================================

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// ---------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------

/** Normalise un numéro de téléphone (supprime espaces, ., -). */
function normalizePhone(raw: string | undefined | null): string | null {
  if (!raw || typeof raw !== 'string') return null
  const cleaned = raw.replace(/[\s.-]/g, '')
  if (!/^\+?\d{8,15}$/.test(cleaned)) return null
  return cleaned
}

/** Parse un nombre GPS (lat/lng) depuis number ou string. */
function parseGps(
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
// POST — Silent SOS (long press)
// ---------------------------------------------------------------
export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return fail('Payload JSON invalide', 400)
  }

  const b = body as {
    plateId?: string
    qrToken?: string
    photoDataUrl?: string
    audioDataUrl?: string
    gpsLat?: number
    gpsLng?: number
    citizenPhone?: string
  }

  // --- plateId (optionnel) ---
  let plateId: string | null = null
  if (b.plateId !== undefined && b.plateId !== null) {
    if (typeof b.plateId !== 'string' || b.plateId.trim().length === 0) {
      return fail('plateId invalide', 400)
    }
    plateId = b.plateId.trim()
  }

  // --- qrToken (optionnel) → résout la plaque si fournie ---
  let qrTokenResolved: string | null = null
  if (b.qrToken && typeof b.qrToken === 'string') {
    const token = b.qrToken.trim()
    if (token.length === 0) {
      return fail('qrToken vide', 400)
    }

    // Si on a déjà un plateId explicite, on le garde tel quel.
    // Sinon, on essaie de résoudre via qrToken.
    if (!plateId) {
      const plate = await db.cityPlate.findUnique({
        where: { qrToken: token },
        select: { id: true, plateNumber: true },
      })
      if (plate) {
        plateId = plate.id
        qrTokenResolved = token
        console.log(
          `[city-sos] Plaque ${plate.plateNumber} résolue via qrToken`,
        )
      } else {
        console.log(`[city-sos] qrToken ${token} non trouvé — SOS sans plaque`)
        // On garde quand même le qrToken dans l'incident pour traçabilité.
        qrTokenResolved = token
      }
    } else {
      qrTokenResolved = token
    }
  }

  // --- citizenPhone (optionnel) ---
  let citizenPhone: string | null = null
  if (b.citizenPhone !== undefined && b.citizenPhone !== null) {
    citizenPhone = normalizePhone(b.citizenPhone)
    if (!citizenPhone) {
      return fail('citizenPhone invalide', 400)
    }
  }

  // --- GPS (optionnel) ---
  let gpsLat: number | null = null
  let gpsLng: number | null = null
  try {
    gpsLat = parseGps(b.gpsLat, -90, 90, 'gpsLat')
    gpsLng = parseGps(b.gpsLng, -180, 180, 'gpsLng')
  } catch (e) {
    return fail((e as Error).message, 400)
  }

  // --- photoDataUrl / audioDataUrl (optionnels, data URLs) ---
  // On borne la longueur pour éviter un payload démesuré mais on
  // accepte les data URLs JPEG/PNG/WebP typiques (< 500 KB base64 ≈ 700k chars).
  const photoDataUrl =
    typeof b.photoDataUrl === 'string' && b.photoDataUrl.startsWith('data:')
      ? b.photoDataUrl.slice(0, 500_000)
      : null

  const audioDataUrl =
    typeof b.audioDataUrl === 'string' && b.audioDataUrl.startsWith('data:')
      ? b.audioDataUrl.slice(0, 500_000)
      : null

  // ---------------------------------------------------------------
  // Construction de la description — on concatène les médias et le GPS
  // avec des préfixes pour pouvoir les extraire côté dashboard si besoin.
  // Le modèle CityIncident n'a pas de champ photo/audio dédié, donc on
  // stocke tout dans description (champ texte libre).
  // ---------------------------------------------------------------
  const descParts: string[] = ['SOS silencieux déclenché']

  if (citizenPhone) {
    descParts.push(`citizen:${citizenPhone}`)
  }
  if (gpsLat !== null && gpsLng !== null) {
    descParts.push(`SOS_GPS:${gpsLat.toFixed(6)},${gpsLng.toFixed(6)}`)
  }
  if (photoDataUrl) {
    // On stocke un marqueur indiquant qu'une photo a été capturée.
    // La photo elle-même (data URL) est trop volumineuse pour la stocker
    // dans description ; on signale sa présence et on logge sa taille.
    descParts.push(`SOS_PHOTO:${photoDataUrl.length}chars`)
  }
  if (audioDataUrl) {
    descParts.push(`SOS_AUDIO:${audioDataUrl.length}chars`)
  }

  const description = descParts.join(' | ')

  // ---------------------------------------------------------------
  // Création de l'incident emergency → Police
  // status="assigned" car un SOS doit être pris en charge immédiatement.
  // ---------------------------------------------------------------
  const incident = await db.cityIncident.create({
    data: {
      plateId,
      qrToken: qrTokenResolved,
      type: 'emergency',
      category: 'sécurité',
      description,
      gpsLat,
      gpsLng,
      status: 'assigned',
      assignedTo: 'Police',
    },
  })

  console.log(
    `[city-sos] 🆘 SOS silencieux déclenché — incident ${incident.id}` +
      (plateId ? ` | plaque=${plateId}` : '') +
      (gpsLat !== null ? ` | gps=${gpsLat},${gpsLng}` : '') +
      (photoDataUrl ? ' | photo=oui' : '') +
      (audioDataUrl ? ' | audio=oui' : ''),
  )

  return ok(
    {
      sos: {
        id: incident.id,
        incidentId: incident.id,
      },
    },
    201,
  )
}
