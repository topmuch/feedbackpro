// ============================================================
// PUT /api/airport/zones/[code]
// ------------------------------------------------------------
// Met à jour la configuration d'une zone aéroport (nom, emoji,
// description, tags URL, problématiques prédéfinies).
//
// Payload JSON :
//   {
//     nom?: string,
//     emoji?: string,
//     description?: string,
//     tags?: string[],        // max 10 tags URL
//     problemes?: string[]   // max 6 problématiques (boutons rapides)
//   }
//
// Crée la zone en BDD si elle n'existe pas encore (upsert).
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

export async function PUT(req: NextRequest, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params
  if (!code) return fail('Code de zone manquant', 400)

  // Vérifier que le code correspond à une zone connue
  const config = getZoneParCode(code)
  if (!config) {
    return fail(`Code de zone inconnu : ${code}. Codes valides : bagages, sanitaires, files_attente, embarquement, restauration.`, 404)
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return fail('Payload JSON invalide', 400)
  }
  const b = body as {
    nom?: string
    emoji?: string
    description?: string
    tags?: string[]
    problemes?: string[]
  }

  // --- Validation ---
  const updates: {
    nom?: string
    emoji?: string
    description?: string | null
    tags?: string
    problemes?: string
  } = {}

  if (b.nom !== undefined) {
    if (typeof b.nom !== 'string' || b.nom.trim().length < 2) {
      return fail('Le nom doit faire au moins 2 caractères', 400)
    }
    if (b.nom.trim().length > 60) {
      return fail('Le nom doit faire au plus 60 caractères', 400)
    }
    updates.nom = b.nom.trim()
  }

  if (b.emoji !== undefined) {
    if (typeof b.emoji !== 'string' || b.emoji.length === 0) {
      return fail('Emoji invalide', 400)
    }
    if (b.emoji.length > 8) {
      return fail('Emoji invalide (trop long)', 400)
    }
    updates.emoji = b.emoji
  }

  if (b.description !== undefined) {
    if (b.description === null) {
      updates.description = null
    } else if (typeof b.description === 'string') {
      if (b.description.length > 200) {
        return fail('La description doit faire au plus 200 caractères', 400)
      }
      updates.description = b.description.trim() || null
    } else {
      return fail('Description invalide', 400)
    }
  }

  if (b.tags !== undefined) {
    if (!Array.isArray(b.tags)) {
      return fail('Tags doit être un tableau', 400)
    }
    if (b.tags.length > 10) {
      return fail('Maximum 10 tags URL par zone', 400)
    }
    const tagsValides = b.tags.filter((t) => typeof t === 'string' && /^[a-z0-9_-]{2,40}$/i.test(t))
    if (tagsValides.length !== b.tags.length) {
      return fail('Tags invalides : format attendu lettres/chiffres/-/_ (2-40 caractères)', 400)
    }
    updates.tags = JSON.stringify(tagsValides)
  }

  if (b.problemes !== undefined) {
    if (!Array.isArray(b.problemes)) {
      return fail('Problématiques doit être un tableau', 400)
    }
    if (b.problemes.length === 0 || b.problemes.length > 6) {
      return fail('Entre 1 et 6 problématiques par zone', 400)
    }
    const problemesValides = b.problemes.filter(
      (p) => typeof p === 'string' && p.trim().length >= 3 && p.trim().length <= 100
    )
    if (problemesValides.length !== b.problemes.length) {
      return fail('Problématiques invalides : 3-100 caractères chacune', 400)
    }
    updates.problemes = JSON.stringify(problemesValides.map((p) => p.trim()))
  }

  // --- Upsert en BDD ---
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

  console.log(`[airport-zones] Zone ${code} mise à jour par ops`)

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
