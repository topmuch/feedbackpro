// ============================================================
// /api/city/checkins
// ------------------------------------------------------------
// Ville Connectée — Check-in École.
// L'enfant scanne la plaque à l'entrée de l'école (plateType=ecole)
// et presse un bouton sans saisie de texte. Le parent reçoit une
// notification (WhatsApp/SMS) avec le statut et l'horodatage.
//
// POST → School check-in.
//        Body : { plateId?, citizenPhone, status: "arrived"|"left"|"sos" }
//        Crée un CitySchoolCheckin.
//        Si status === "sos" → crée aussi un CityIncident
//          (type="emergency", category="sécurité", assignedTo="Police").
//        Retourne 201 { ok: true, data: { checkin: { id, status, createdAt } } }
// ============================================================

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// ---------------------------------------------------------------
// Constantes de validation
// ---------------------------------------------------------------

const VALID_STATUSES = new Set(['arrived', 'left', 'sos'])

/** Normalise un numéro de téléphone (supprime espaces, ., -). */
function normalizePhone(raw: string | undefined | null): string | null {
  if (!raw || typeof raw !== 'string') return null
  const cleaned = raw.replace(/[\s.-]/g, '')
  if (!/^\+?\d{8,15}$/.test(cleaned)) return null
  return cleaned
}

// ---------------------------------------------------------------
// POST — School check-in (+ incident SOS si status === "sos")
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
    citizenPhone?: string
    status?: string
  }

  // --- citizenPhone (obligatoire) ---
  const citizenPhone = normalizePhone(b.citizenPhone)
  if (!citizenPhone) {
    console.log('[city-checkins] citizenPhone invalide ou manquant')
    return fail(
      'citizenPhone invalide (format attendu : +221 77 000 00 00 ou 770000000)',
      400,
    )
  }

  // --- status (obligatoire, dans la liste valide) ---
  if (typeof b.status !== 'string' || !VALID_STATUSES.has(b.status)) {
    console.log(
      `[city-checkins] status invalide: ${String(b.status).slice(0, 40)}`,
    )
    return fail(
      'status invalide : doit être "arrived", "left" ou "sos"',
      400,
    )
  }
  const status = b.status

  // --- plateId (optionnel, mais si fourni doit exister) ---
  let plateId: string | null = null
  if (b.plateId !== undefined && b.plateId !== null) {
    if (typeof b.plateId !== 'string' || b.plateId.trim().length === 0) {
      return fail('plateId invalide', 400)
    }
    plateId = b.plateId.trim()

    // On vérifie que la plaque existe (SetNull si supprimée plus tard).
    const plate = await db.cityPlate.findUnique({
      where: { id: plateId },
      select: { id: true, plateNumber: true },
    })
    if (!plate) {
      console.log(`[city-checkins] plateId ${plateId} introuvable`)
      return fail('Plaque introuvable', 404)
    }
  }

  // ---------------------------------------------------------------
  // Transaction atomique :
  //   1. Création du CitySchoolCheckin
  //   2. Si status === "sos" → création d'un CityIncident emergency
  // ---------------------------------------------------------------
  const checkin = await db.$transaction(async (tx) => {
    const record = await tx.citySchoolCheckin.create({
      data: {
        plateId,
        citizenPhone,
        status,
      },
    })

    if (status === 'sos') {
      // Incident SOS : emergency + sécurité + Police.
      // Le check-in SOS est un signal d'alerte (agression, kidnap…).
      await tx.cityIncident.create({
        data: {
          plateId,
          type: 'emergency',
          category: 'sécurité',
          description: `SOS école — check-in ${record.id} (citizen ${citizenPhone})`,
          status: 'assigned',
          assignedTo: 'Police',
        },
      })
      console.log(
        `[city-checkins] 🚨 SOS école déclenché — citizen ${citizenPhone}, checkin ${record.id}`,
      )
    } else {
      console.log(
        `[city-checkins] Check-in ${status} — citizen ${citizenPhone}, checkin ${record.id}`,
      )
    }

    return record
  })

  return ok(
    {
      checkin: {
        id: checkin.id,
        status: checkin.status,
        createdAt: checkin.createdAt.toISOString(),
      },
    },
    201,
  )
}
