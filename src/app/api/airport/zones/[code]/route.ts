// ============================================================
// /api/airport/zones/[code]
// ------------------------------------------------------------
// PUT   (legacy, garde pour l'éditeur inline existant) — body
//       { nom?, emoji?, description?, tags?, problemes? }
// PATCH (Task Z1) — met à jour n'importe quelle zone (custom ou
//       canonique). Body identique à PUT.
// DELETE (Task Z1) — supprime une zone (cascade les reports via
//        onDelete: Cascade défini dans le schéma Prisma).
// ============================================================

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail } from '@/lib/session'
import { getZoneParCode } from '@/lib/airport-config'

export const runtime = 'nodejs'

function safeParse<T>(s: string | null, fallback: T): T {
  if (!s) return fallback
  try {
    return JSON.parse(s) as T
  } catch {
    return fallback
  }
}

type ValidateResult =
  | { error: string }
  | {
      updates: {
        nom?: string
        emoji?: string
        description?: string | null
        tags?: string
        problemes?: string
      }
    }

function validatePayload(body: unknown): ValidateResult {
  const b = body as {
    nom?: string
    emoji?: string
    description?: string | null
    tags?: string[]
    problemes?: string[]
  }

  const updates: {
    nom?: string
    emoji?: string
    description?: string | null
    tags?: string
    problemes?: string
  } = {}

  if (b.nom !== undefined) {
    if (typeof b.nom !== 'string' || b.nom.trim().length < 2) {
      return { error: 'Le nom doit faire au moins 2 caractères' }
    }
    if (b.nom.trim().length > 60) {
      return { error: 'Le nom doit faire au plus 60 caractères' }
    }
    updates.nom = b.nom.trim()
  }

  if (b.emoji !== undefined) {
    if (typeof b.emoji !== 'string' || b.emoji.length === 0) {
      return { error: 'Emoji invalide' }
    }
    if (b.emoji.length > 8) {
      return { error: 'Emoji invalide (trop long)' }
    }
    updates.emoji = b.emoji
  }

  if (b.description !== undefined) {
    if (b.description === null) {
      updates.description = null
    } else if (typeof b.description === 'string') {
      if (b.description.length > 200) {
        return { error: 'La description doit faire au plus 200 caractères' }
      }
      updates.description = b.description.trim() || null
    } else {
      return { error: 'Description invalide' }
    }
  }

  if (b.tags !== undefined) {
    if (!Array.isArray(b.tags)) {
      return { error: 'Tags doit être un tableau' }
    }
    if (b.tags.length > 10) {
      return { error: 'Maximum 10 tags URL par zone' }
    }
    const tagsValides = b.tags.filter(
      (t) => typeof t === 'string' && /^[a-z0-9_-]{2,40}$/i.test(t),
    )
    if (tagsValides.length !== b.tags.length) {
      return {
        error:
          'Tags invalides : format attendu lettres/chiffres/-/_ (2-40 caractères)',
      }
    }
    updates.tags = JSON.stringify(tagsValides)
  }

  if (b.problemes !== undefined) {
    if (!Array.isArray(b.problemes)) {
      return { error: 'Problématiques doit être un tableau' }
    }
    if (b.problemes.length === 0 || b.problemes.length > 12) {
      return { error: 'Entre 1 et 12 problématiques par zone' }
    }
    const problemesValides = b.problemes.filter(
      (p) => typeof p === 'string' && p.trim().length >= 3 && p.trim().length <= 100,
    )
    if (problemesValides.length !== b.problemes.length) {
      return { error: 'Problématiques invalides : 3-100 caractères chacune' }
    }
    updates.problemes = JSON.stringify(problemesValides.map((p) => p.trim()))
  }

  return { updates }
}

// --- PUT (legacy, exige que le code soit dans la config statique) ---

export async function PUT(req: NextRequest, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params
  if (!code) return fail('Code de zone manquant', 400)

  // Vérifier que le code correspond à une zone connue
  const config = getZoneParCode(code)
  if (!config) {
    return fail(
      `Code de zone inconnu : ${code}. Codes valides : bagages, sanitaires, files_attente, embarquement, restauration.`,
      404,
    )
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return fail('Payload JSON invalide', 400)
  }

  const result = validatePayload(body)
  if ('error' in result) return fail(result.error, 400)
  const updates = result.updates

  const existing = await db.airportZone.findUnique({ where: { code } })
  let zone
  if (existing) {
    zone = await db.airportZone.update({ where: { code }, data: updates })
  } else {
    zone = await db.airportZone.create({
      data: {
        code: config.code,
        nom: updates.nom ?? config.nom,
        emoji: updates.emoji ?? config.emoji,
        description: updates.description ?? config.description ?? null,
        tags: updates.tags ?? JSON.stringify(config.tags),
        problemes: updates.problemes ?? JSON.stringify([...config.problemes]),
      },
    })
  }

  console.log(`[airport-zones] Zone ${code} mise à jour par ops (PUT)`)

  return ok({
    zone: {
      code: zone.code,
      nom: zone.nom,
      emoji: zone.emoji,
      description: zone.description,
      tags: safeParse<string[]>(zone.tags, []),
      problemes: safeParse<string[]>(zone.problemes, []),
    },
  })
}

// --- PATCH (Task Z1 — met à jour n'importe quelle zone existante) ---

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ code: string }> },
) {
  const { code } = await ctx.params
  if (!code) return fail('Code de zone manquant', 400)

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return fail('Payload JSON invalide', 400)
  }

  const result = validatePayload(body)
  if ('error' in result) return fail(result.error, 400)
  const updates = result.updates

  if (Object.keys(updates).length === 0) {
    return fail('Aucun champ à mettre à jour', 400)
  }

  const existing = await db.airportZone.findUnique({ where: { code } })
  if (!existing) {
    // PATCH ne crée pas — refuse si la zone n'existe pas en BDD
    return fail(
      `Zone « ${code} » introuvable. Utilisez POST /api/airport/zones pour en créer une nouvelle.`,
      404,
    )
  }

  const zone = await db.airportZone.update({ where: { code }, data: updates })

  console.log(`[airport-zones] Zone ${code} mise à jour par ops (PATCH)`)

  return ok({
    zone: {
      code: zone.code,
      nom: zone.nom,
      emoji: zone.emoji,
      description: zone.description,
      tags: safeParse<string[]>(zone.tags, []),
      problemes: safeParse<string[]>(zone.problemes, []),
      id: zone.id,
    },
  })
}

// --- DELETE (Task Z1) ---

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ code: string }> },
) {
  const { code } = await ctx.params
  if (!code) return fail('Code de zone manquant', 400)

  const existing = await db.airportZone.findUnique({ where: { code } })
  if (!existing) {
    return fail(`Zone « ${code} » introuvable.`, 404)
  }

  // Cascade : les AirportReport liés sont supprimés automatiquement
  // grâce à onDelete: Cascade défini dans le schéma Prisma.
  await db.airportZone.delete({ where: { code } })

  console.log(`[airport-zones] Zone ${code} supprimée par ops (DELETE)`)

  return ok({ deleted: true, code })
}
