// ============================================================
// /api/airport/ops-contacts — CRUD sur le répertoire ops
// ------------------------------------------------------------
// Liste les numéros ops autorisés à interroger le bot WhatsApp
// (model AirportOpsContact). Utilisé par l'onglet « Bot WhatsApp »
// du dashboard aéroport pour afficher/gérer le répertoire ops.
//
// Verbes supportés :
//   GET    /api/airport/ops-contacts
//     → { ok: true, data: { contacts: [...], count, actifs } }
//
//   POST   /api/airport/ops-contacts   body { phone, name, role?, actif? }
//     → Valide phone (^\d{8,15}$), déduplique par phone unique,
//       crée un contact. role par défaut "ops", actif par défaut true.
//     → 409 si phone déjà existant.
//
//   PUT    /api/airport/ops-contacts   body { id, phone?, name?, role?, actif? }
//     → Met à jour partiellement un contact par son id.
//     → 404 si id introuvable. 409 si nouveau phone déjà pris.
//
//   DELETE /api/airport/ops-contacts   body { id }
//     → Supprime un contact par son id.
//     → 404 si id introuvable.
//
// Toutes les réponses suivent l'envelope { ok: true, data } | { ok: false, error }.
// Public pour l'instant (démo) — en production, protéger par
// un cookie de session ops-aéroport (requireAirportOps).
// ============================================================

import { NextRequest } from 'next/server'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { ok, fail } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// ----------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------

const VALID_ROLES = new Set(['ops', 'manager', 'nettoyage', 'maintenance', 'securite'])

function normalizePhone(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const cleaned = raw.replace(/[^0-9]/g, '')
  if (!/^\d{8,15}$/.test(cleaned)) return null
  return cleaned
}

function serializeContact(c: {
  id: string
  phone: string
  name: string
  role: string
  actif: boolean
  createdAt: Date
}) {
  return {
    id: c.id,
    phone: c.phone,
    name: c.name,
    role: c.role,
    actif: c.actif,
    createdAt: c.createdAt.toISOString(),
  }
}

// ----------------------------------------------------------------
// GET — liste des contacts ops
// ----------------------------------------------------------------
export async function GET(_req: NextRequest) {
  try {
    const contacts = await db.airportOpsContact.findMany({
      orderBy: [{ actif: 'desc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        phone: true,
        name: true,
        role: true,
        actif: true,
        createdAt: true,
      },
    })

    return ok({
      contacts: contacts.map(serializeContact),
      count: contacts.length,
      actifs: contacts.filter((c) => c.actif).length,
    })
  } catch (err) {
    console.error('[airport-ops-contacts] GET erreur :', err)
    return fail('Erreur lors de la récupération des contacts ops', 500)
  }
}

// ----------------------------------------------------------------
// POST — création d'un contact
// ----------------------------------------------------------------
export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return fail('Payload JSON invalide', 400)
  }

  const b = body as {
    phone?: unknown
    name?: unknown
    role?: unknown
    actif?: unknown
  }

  const phone = normalizePhone(b.phone)
  if (!phone) {
    return fail(
      'Téléphone invalide. Format attendu : international sans + (8 à 15 chiffres, ex: 33612345678).',
      400,
    )
  }

  const name =
    typeof b.name === 'string' ? b.name.trim().slice(0, 120) : ''
  if (!name) {
    return fail('Nom manquant ou vide', 400)
  }

  const role =
    typeof b.role === 'string' && VALID_ROLES.has(b.role) ? b.role : 'ops'

  const actif = typeof b.actif === 'boolean' ? b.actif : true

  // Déduction : phone est unique en BDD → on tente create et on
  // intercepte P2002 (unique constraint violation) pour renvoyer 409.
  try {
    const created = await db.airportOpsContact.create({
      data: { phone, name, role, actif },
    })
    return ok({ contact: serializeContact(created) }, 201)
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    ) {
      return fail(`Un contact ops existe déjà avec le phone ${phone}`, 409)
    }
    console.error('[airport-ops-contacts] POST erreur :', err)
    return fail("Erreur lors de la création du contact ops", 500)
  }
}

// ----------------------------------------------------------------
// PUT — mise à jour d'un contact (sur la collection, par id dans le body)
// ----------------------------------------------------------------
export async function PUT(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return fail('Payload JSON invalide', 400)
  }

  const b = body as {
    id?: unknown
    phone?: unknown
    name?: unknown
    role?: unknown
    actif?: unknown
  }

  const id = typeof b.id === 'string' ? b.id.trim() : ''
  if (!id) {
    return fail('id manquant', 400)
  }

  const existing = await db.airportOpsContact.findUnique({ where: { id } })
  if (!existing) {
    return fail('Contact ops introuvable', 404)
  }

  // Construit l'objet data partiel — uniquement les champs présents.
  const data: {
    phone?: string
    name?: string
    role?: string
    actif?: boolean
  } = {}

  if (b.phone !== undefined) {
    const phone = normalizePhone(b.phone)
    if (!phone) {
      return fail(
        'Téléphone invalide. Format attendu : international sans + (8 à 15 chiffres).',
        400,
      )
    }
    if (phone !== existing.phone) {
      // Vérifie l'unicité à la main pour distinguer 409 de 404.
      const dup = await db.airportOpsContact.findUnique({ where: { phone } })
      if (dup && dup.id !== id) {
        return fail(`Un contact ops existe déjà avec le phone ${phone}`, 409)
      }
      data.phone = phone
    }
  }

  if (b.name !== undefined) {
    const name = typeof b.name === 'string' ? b.name.trim().slice(0, 120) : ''
    if (!name) {
      return fail('name ne peut pas être vide', 400)
    }
    data.name = name
  }

  if (b.role !== undefined) {
    if (typeof b.role !== 'string' || !VALID_ROLES.has(b.role)) {
      return fail(
        `role invalide. Valeurs acceptées : ${[...VALID_ROLES].join(', ')}`,
        400,
      )
    }
    data.role = b.role
  }

  if (b.actif !== undefined) {
    if (typeof b.actif !== 'boolean') {
      return fail('actif doit être un booléen', 400)
    }
    data.actif = b.actif
  }

  if (Object.keys(data).length === 0) {
    return fail(
      "Aucun champ à mettre à jour (fournir phone, name, role ou actif)",
      400,
    )
  }

  try {
    const updated = await db.airportOpsContact.update({
      where: { id },
      data,
    })
    return ok({ contact: serializeContact(updated) })
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    ) {
      return fail('Conflit de phone (déjà utilisé par un autre contact)', 409)
    }
    console.error('[airport-ops-contacts] PUT erreur :', err)
    return fail("Erreur lors de la mise à jour du contact ops", 500)
  }
}

// ----------------------------------------------------------------
// DELETE — suppression d'un contact par id
// ----------------------------------------------------------------
export async function DELETE(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return fail('Payload JSON invalide', 400)
  }

  const b = body as { id?: unknown }
  const id = typeof b.id === 'string' ? b.id.trim() : ''
  if (!id) {
    return fail('id manquant', 400)
  }

  const existing = await db.airportOpsContact.findUnique({ where: { id } })
  if (!existing) {
    return fail('Contact ops introuvable', 404)
  }

  try {
    await db.airportOpsContact.delete({ where: { id } })
    return ok({ deleted: id, phone: existing.phone })
  } catch (err) {
    console.error('[airport-ops-contacts] DELETE erreur :', err)
    return fail("Erreur lors de la suppression du contact ops", 500)
  }
}
