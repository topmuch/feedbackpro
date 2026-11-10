// ============================================================
// GET /api/airport/zone/[tag]
// ------------------------------------------------------------
// Résout un tag URL scanné (ex: "tapis_bagages_1") vers la zone
// aéroport correspondante. Retourne le nom, l'emoji, la description
// et les 4 problématiques prédéfinies (boutons rapides).
//
// Public (pas d'auth). Utilisé par la PWA voyageur au boot.
// ============================================================

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail } from '@/lib/session'
import { resoudreZoneParTag, AIRPORT_ZONES } from '@/lib/airport-config'

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

export async function GET(_req: NextRequest, ctx: { params: Promise<{ tag: string }> }) {
  const { tag } = await ctx.params
  if (!tag || typeof tag !== 'string') {
    return fail('Tag manquant', 400)
  }

  // 1. Résolution par la config statique (source de vérité)
  const config = resoudreZoneParTag(tag)
  if (!config) {
    return fail(`Tag inconnu : ${tag}`, 404)
  }

  // 2. Lookup BDD pour récupérer l'identifiant (la config peut avoir
  // été seedée, sinon on dégrade gracieusement avec les données statiques).
  const zone = await db.airportZone.findUnique({ where: { code: config.code } })

  const data = {
    code: config.code,
    nom: zone?.nom ?? config.nom,
    emoji: zone?.emoji ?? config.emoji,
    description: zone?.description ?? config.description ?? null,
    tags: safeParse<string[]>(zone?.tags ?? null, config.tags),
    problemes: safeParse<string[]>(zone?.problemes ?? null, [...config.problemes]),
    tagScanne: tag,
  }

  return ok({ zone: data })
}

// Helpers exportés pour réutilisation interne (tests, seed check)
export { AIRPORT_ZONES }
