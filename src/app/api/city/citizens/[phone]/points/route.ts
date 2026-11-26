// ============================================================
// /api/city/citizens/[phone]/points
// ------------------------------------------------------------
// Feature #7 — Gamification citoyenne.
//
// GET  → renvoie le solde de points actuel du citoyen.
// POST → crédite des points selon l'action citoyenne réalisée :
//          - report       : +10  (signalement d'incident)
//          - tax_report   : +50  (signalement fraude fiscale)
//          - quartier_ad  : +5   (publication d'une annonce de quartier)
//          - checkin      : +2   (check-in école / point bas)
//          - sos          : +0   (alerte sécurité — jamais gamifiée)
//
// Le citoyen est identifié par son téléphone (clé unique). Si le
// compte n'existe pas encore, on renvoie 404 — le frontend doit
// d'abord POST /api/city/citizens pour créer le compte.
//
// L'incrémentation est atomique via Prisma { points: { increment } },
// ce qui garantit la cohérence même en cas d'appels concurrents
// (deux signalements simultanés depuis le même téléphone).
//
// Route paramétrée : le [phone] est lu depuis params (Next.js 16
// attend une Promise pour params — on await).
// ============================================================

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// ---------------------------------------------------------------
// Grille de points par action citoyenne.
// `sos` est volontairement à 0 : on ne gamifie jamais la sécurité
// (un SOS n'est pas une "réussite" à récompenser, c'est une urgence).
// ---------------------------------------------------------------
const POINTS_BY_ACTION: Readonly<Record<string, number>> = {
  report: 10,
  tax_report: 50,
  quartier_ad: 5,
  checkin: 2,
  sos: 0,
} as const

type CitizenAction = keyof typeof POINTS_BY_ACTION

/** Normalise un téléphone depuis l'URL (peut contenir %2B pour le « + »). */
function normalizePhoneFromParam(raw: string): string | null {
  if (!raw) return null
  // Décode %2B → + et supprime les espaces encodés
  const decoded = decodeURIComponent(raw).replace(/[\s.-]/g, '')
  if (!/^\+?\d{8,15}$/.test(decoded)) return null
  return decoded
}

// ---------------------------------------------------------------
// GET — solde de points du citoyen
// ---------------------------------------------------------------
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ phone: string }> },
) {
  const { phone: phoneParam } = await params
  const phone = normalizePhoneFromParam(phoneParam)
  if (!phone) {
    return fail('Téléphone invalide', 400)
  }

  const citizen = await db.cityCitizen.findUnique({
    where: { phone },
    select: {
      id: true,
      phone: true,
      name: true,
      points: true,
      createdAt: true,
      updatedAt: true,
    },
  })

  if (!citizen) {
    return fail('Citoyen introuvable — créez d\'abord le compte via /api/city/citizens', 404)
  }

  return ok({
    citizen: {
      id: citizen.id,
      phone: citizen.phone,
      name: citizen.name,
      points: citizen.points,
      createdAt: citizen.createdAt.toISOString(),
      updatedAt: citizen.updatedAt.toISOString(),
    },
  })
}

// ---------------------------------------------------------------
// POST — créditer des points pour une action citoyenne
// Body : { action: 'report' | 'tax_report' | 'quartier_ad' | 'checkin' | 'sos' }
// ---------------------------------------------------------------
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ phone: string }> },
) {
  const { phone: phoneParam } = await params
  const phone = normalizePhoneFromParam(phoneParam)
  if (!phone) {
    return fail('Téléphone invalide', 400)
  }

  const body = await req.json().catch(() => null)
  if (!body) return fail('Payload invalide', 400)

  const action = (body as { action?: string }).action
  if (!action || typeof action !== 'string' || !(action in POINTS_BY_ACTION)) {
    return fail(
      `action invalide : doit être ${Object.keys(POINTS_BY_ACTION).join(' | ')}`,
      400,
    )
  }

  const amount = POINTS_BY_ACTION[action as CitizenAction]

  // Cas SOS : on ne crédite rien mais on répond OK (pour ne pas casser
  // le flux frontend qui déclenche systématiquement l'appel). On renvoie
  // juste le solde courant sans modification.
  if (amount === 0) {
    const citizen = await db.cityCitizen.findUnique({
      where: { phone },
      select: { id: true, phone: true, points: true },
    })
    if (!citizen) {
      return fail('Citoyen introuvable', 404)
    }
    console.log(`[city-points] SOS pour ${phone} — aucun point crédité (sécurité non gamifiée)`)
    return ok({
      action,
      awarded: 0,
      total: citizen.points,
      note: 'SOS non gamifié (sécurité)',
    })
  }

  // Vérifie l'existence du citoyen AVANT l'incrémentation (sinon
  // update lèverait une erreur Prisma sur where.phone introuvable).
  const existing = await db.cityCitizen.findUnique({
    where: { phone },
    select: { id: true, points: true },
  })
  if (!existing) {
    return fail('Citoyen introuvable — créez d\'abord le compte via /api/city/citizens', 404)
  }

  // Incrémentation atomique — sûre en concurrence.
  const updated = await db.cityCitizen.update({
    where: { phone },
    data: { points: { increment: amount } },
    select: { id: true, phone: true, points: true },
  })

  console.log(
    `[city-points] +${amount} pts pour ${phone} (action=${action}) → total ${updated.points}`,
  )

  return ok({
    action,
    awarded: amount,
    total: updated.points,
    previousTotal: existing.points,
  })
}
