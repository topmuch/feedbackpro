// ============================================================
// /api/city/citizens
// ------------------------------------------------------------
// Ville Connectée — Compte citoyen (téléphone + profil + points).
// Inscription / connexion par téléphone SANS mot de passe
// (trust-based : OTP optionnel côté frontend, pas de vérif ici).
//
// POST → Register or login citizen by phone.
//        If citizen exists → update fields (name, schoolName,
//        parentPhone, emergencyContacts), return existing.
//        If not → create new CityCitizen.
//        Body : { phone, name?, schoolName?, parentPhone?, emergencyContacts? }
// GET  → ?phone=X → return citizen profile or 404.
// ============================================================

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// ---------------------------------------------------------------
// Helpers de validation
// ---------------------------------------------------------------

/** Normalise un numéro de téléphone (supprime espaces, ., -). */
function normalizePhone(raw: string | undefined | null): string | null {
  if (!raw || typeof raw !== 'string') return null
  const cleaned = raw.replace(/[\s.-]/g, '')
  if (!/^\+?\d{8,15}$/.test(cleaned)) return null
  return cleaned
}

/** Valide une chaîne optionnelle (trim + longueur max). */
function optionalString(
  value: unknown,
  max: number,
  label: string,
): string | null {
  if (value === undefined || value === null) return null
  if (typeof value !== 'string') {
    throw new Error(`${label} invalide (chaîne attendue)`)
  }
  const trimmed = value.trim()
  if (trimmed.length > max) {
    throw new Error(`${label} trop long (max. ${max} caractères)`)
  }
  return trimmed || null
}

/** Sérialise un citizen pour la réponse API. */
function serialize(c: {
  id: string
  phone: string
  name: string | null
  points: number
  schoolName: string | null
  parentPhone: string | null
  emergencyContacts: string | null
  createdAt: Date
  updatedAt: Date
}) {
  return {
    id: c.id,
    phone: c.phone,
    name: c.name,
    points: c.points,
    schoolName: c.schoolName,
    parentPhone: c.parentPhone,
    emergencyContacts: c.emergencyContacts,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  }
}

// ---------------------------------------------------------------
// POST — Register or login citizen by phone (trust-based)
// ---------------------------------------------------------------
export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return fail('Payload JSON invalide', 400)
  }

  const b = body as {
    phone?: string
    name?: string
    schoolName?: string
    parentPhone?: string
    emergencyContacts?: string
  }

  // phone obligatoire
  const phone = normalizePhone(b.phone)
  if (!phone) {
    console.log('[city-citizens] phone invalide ou manquant')
    return fail(
      'Téléphone invalide (format attendu : +221 77 000 00 00 ou 770000000)',
      400,
    )
  }

  // Champs optionnels
  let name: string | null = null
  let schoolName: string | null = null
  let parentPhone: string | null = null
  let emergencyContacts: string | null = null

  try {
    name = optionalString(b.name, 80, 'name')
    schoolName = optionalString(b.schoolName, 120, 'schoolName')
    emergencyContacts = optionalString(b.emergencyContacts, 2000, 'emergencyContacts')

    // parentPhone : validation spécifique (format téléphone)
    if (b.parentPhone !== undefined && b.parentPhone !== null) {
      parentPhone = normalizePhone(b.parentPhone)
      if (!parentPhone) {
        return fail('parentPhone invalide', 400)
      }
    }
  } catch (e) {
    return fail((e as Error).message, 400)
  }

  // ---------------------------------------------------------------
  // Upsert : update si existe, sinon création
  // ---------------------------------------------------------------
  const existing = await db.cityCitizen.findUnique({
    where: { phone },
  })

  let citizen

  if (existing) {
    // Update : on ne met à jour que les champs fournis (non null).
    // On ne touche pas aux points (gamification).
    const data: Record<string, unknown> = {}
    if (name !== null) data.name = name
    if (schoolName !== null) data.schoolName = schoolName
    if (parentPhone !== null) data.parentPhone = parentPhone
    if (emergencyContacts !== null) data.emergencyContacts = emergencyContacts

    if (Object.keys(data).length > 0) {
      citizen = await db.cityCitizen.update({
        where: { id: existing.id },
        data,
      })
      console.log(
        `[city-citizens] Citizen ${phone} reconnecté — ${Object.keys(data).length} champ(s) mis à jour`,
      )
    } else {
      citizen = existing
      console.log(`[city-citizens] Citizen ${phone} reconnecté (aucune MAJ)`)
    }
  } else {
    // Création
    citizen = await db.cityCitizen.create({
      data: {
        phone,
        name,
        schoolName,
        parentPhone,
        emergencyContacts,
      },
    })
    console.log(`[city-citizens] Nouveau citizen inscrit: ${phone}`)
  }

  return ok({ citizen: serialize(citizen) })
}

// ---------------------------------------------------------------
// GET — ?phone=X → return citizen profile or 404
// ---------------------------------------------------------------
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const phoneRaw = url.searchParams.get('phone')

  if (!phoneRaw) {
    return fail('Paramètre ?phone requis', 400)
  }

  const phone = normalizePhone(phoneRaw)
  if (!phone) {
    return fail('Téléphone invalide', 400)
  }

  const citizen = await db.cityCitizen.findUnique({
    where: { phone },
  })

  if (!citizen) {
    console.log(`[city-citizens] Profile introuvable pour ${phone}`)
    return fail('Citoyen introuvable', 404)
  }

  return ok({ citizen: serialize(citizen) })
}
