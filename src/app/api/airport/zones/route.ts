// ============================================================
// /api/airport/zones
// ------------------------------------------------------------
// GET  → liste toutes les zones aéroport (config statique + BDD).
//        Les zones custom (ajoutées via le dashboard, absentes de
//        AIRPORT_ZONES) sont incluses à la fin de la liste.
// POST → crée une nouvelle zone aéroport (code unique, lowercase).
//        Body : { code, nom, emoji, description?, tags[], problemes[] }
// ============================================================

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail } from '@/lib/session'
import { AIRPORT_ZONES } from '@/lib/airport-config'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function safeParse<T>(s: string | null, fallback: T): T {
  if (!s) return fallback
  try {
    return JSON.parse(s) as T
  } catch {
    return fallback
  }
}

// --- Validation ---

const CODE_REGEX = /^[a-z0-9_]{2,40}$/

function validateCode(code: string): string | null {
  if (!code) return 'Code vide'
  if (!CODE_REGEX.test(code)) {
    return 'Code invalide : lettres minuscules, chiffres ou _ uniquement (2-40 caractères)'
  }
  return null
}

// --- GET ---

export async function GET(_req: NextRequest) {
  const zonesBdd = await db.airportZone.findMany({
    orderBy: { code: 'asc' },
    include: {
      _count: { select: { reports: true } },
    },
  })

  // Fusion : on part de la config statique (source de vérité pour l'ordre
  // et les codes "canoniques") et on enrichit avec les données BDD si elles
  // existent. Les zones custom (en BDD mais pas dans AIRPORT_ZONES) sont
  // ajoutées à la fin de la liste, triées par code.
  const staticZones = AIRPORT_ZONES.map((config) => {
    const bdd = zonesBdd.find((z) => z.code === config.code)
    return {
      code: config.code,
      nom: bdd?.nom ?? config.nom,
      emoji: bdd?.emoji ?? config.emoji,
      description: bdd?.description ?? config.description ?? null,
      tags: safeParse<string[]>(bdd?.tags ?? null, config.tags),
      problemes: safeParse<string[]>(bdd?.problemes ?? null, [...config.problemes]),
      reportsCount: bdd?._count.reports ?? 0,
      id: bdd?.id ?? null,
      // true si la zone a été personnalisée en BDD (vs config statique)
      custom: bdd !== undefined,
    }
  })

  // Zones custom = en BDD mais pas dans la config statique
  const staticCodes: Set<string> = new Set(
    AIRPORT_ZONES.map((z) => z.code as string),
  )
  const customZones = zonesBdd
    .filter((z) => !staticCodes.has(z.code))
    .map((z) => ({
      code: z.code,
      nom: z.nom,
      emoji: z.emoji,
      description: z.description,
      tags: safeParse<string[]>(z.tags, []),
      problemes: safeParse<string[]>(z.problemes, []),
      reportsCount: z._count.reports,
      id: z.id,
      custom: true,
    }))
    .sort((a, b) => a.code.localeCompare(b.code))

  const zones = [...staticZones, ...customZones]

  return ok({ zones })
}

// --- POST ---

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return fail('Payload JSON invalide', 400)
  }
  const b = body as {
    code?: string
    nom?: string
    emoji?: string
    description?: string | null
    tags?: string[]
    problemes?: string[]
  }

  // Code
  const rawCode = typeof b.code === 'string' ? b.code.trim().toLowerCase() : ''
  const codeErr = validateCode(rawCode)
  if (codeErr) return fail(codeErr, 400)

  // Nom
  if (typeof b.nom !== 'string' || b.nom.trim().length < 2) {
    return fail('Le nom doit faire au moins 2 caractères', 400)
  }
  if (b.nom.trim().length > 60) {
    return fail('Le nom doit faire au plus 60 caractères', 400)
  }
  const nom = b.nom.trim()

  // Emoji
  if (typeof b.emoji !== 'string' || b.emoji.length === 0) {
    return fail('Emoji invalide', 400)
  }
  if (b.emoji.length > 8) {
    return fail('Emoji invalide (trop long)', 400)
  }
  const emoji = b.emoji

  // Description (optionnelle)
  let description: string | null = null
  if (b.description !== undefined && b.description !== null) {
    if (typeof b.description !== 'string') {
      return fail('Description invalide', 400)
    }
    if (b.description.length > 200) {
      return fail('La description doit faire au plus 200 caractères', 400)
    }
    description = b.description.trim() || null
  }

  // Tags
  if (!Array.isArray(b.tags)) {
    return fail('Tags doit être un tableau', 400)
  }
  if (b.tags.length > 10) {
    return fail('Maximum 10 tags URL par zone', 400)
  }
  const tagsValides = b.tags.filter(
    (t) => typeof t === 'string' && /^[a-z0-9_-]{2,40}$/i.test(t),
  )
  if (tagsValides.length !== b.tags.length) {
    return fail(
      'Tags invalides : format attendu lettres/chiffres/-/_ (2-40 caractères)',
      400,
    )
  }

  // Problématiques
  if (!Array.isArray(b.problemes)) {
    return fail('Problématiques doit être un tableau', 400)
  }
  if (b.problemes.length < 4) {
    return fail('Au moins 4 problématiques par zone', 400)
  }
  if (b.problemes.length > 12) {
    return fail('Maximum 12 problématiques par zone', 400)
  }
  const problemesValides = b.problemes.filter(
    (p) => typeof p === 'string' && p.trim().length >= 3 && p.trim().length <= 100,
  )
  if (problemesValides.length !== b.problemes.length) {
    return fail('Problématiques invalides : 3-100 caractères chacune', 400)
  }
  const problemes = problemesValides.map((p) => p.trim())

  // Unicité du code (collision avec config statique OU BDD existante)
  const inStatic = AIRPORT_ZONES.some((z) => z.code === rawCode)
  const existing = await db.airportZone.findUnique({ where: { code: rawCode } })
  if (inStatic && existing) {
    return fail(`La zone « ${rawCode} » existe déjà`, 409)
  }
  // Si la zone existe dans la config statique mais pas encore en BDD, on
  // lève aussi une erreur : le manager doit utiliser "Modifier" sur la zone
  // existante plutôt que d'en créer une nouvelle avec le même code.
  if (inStatic) {
    return fail(
      `Le code « ${rawCode} » est réservé par une zone existante. Choisissez un autre code.`,
      409,
    )
  }
  if (existing) {
    return fail(`La zone « ${rawCode} » existe déjà`, 409)
  }

  const zone = await db.airportZone.create({
    data: {
      code: rawCode,
      nom,
      emoji,
      description,
      tags: JSON.stringify(tagsValides),
      problemes: JSON.stringify(problemes),
    },
  })

  console.log(`[airport-zones] Zone ${rawCode} créée par ops`)

  return ok({
    zone: {
      code: zone.code,
      nom: zone.nom,
      emoji: zone.emoji,
      description: zone.description,
      tags: safeParse<string[]>(zone.tags, []),
      problemes: safeParse<string[]>(zone.problemes, []),
      id: zone.id,
      custom: true,
      reportsCount: 0,
    },
  })
}
