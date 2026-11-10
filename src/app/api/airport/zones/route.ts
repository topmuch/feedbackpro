// ============================================================
// GET /api/airport/zones
// ------------------------------------------------------------
// Liste toutes les zones aéroport avec leur config complète
// (nom, emoji, description, tags, problèmes). Public pour l'instant
// (le dashboard aéroport sera protégé par cookie ops plus tard).
// ============================================================

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok } from '@/lib/session'
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

export async function GET(_req: NextRequest) {
  const zonesBdd = await db.airportZone.findMany({
    orderBy: { code: 'asc' },
    include: {
      _count: { select: { reports: true } },
    },
  })

  // Fusion : on part de la config statique (source de vérité pour l'ordre
  // et les codes) et on enrichit avec les données BDD si elles existent.
  const zones = AIRPORT_ZONES.map((config) => {
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
    }
  })

  return ok({ zones })
}
