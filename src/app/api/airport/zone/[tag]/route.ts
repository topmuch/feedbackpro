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

  // 2b. Récupère le logo + nom de l'aéroport (le premier Pro "Aéroport")
  //     + l'URL d'avis Google Reviews (D8 — utilisé par l'écran de
  //     confirmation de la PWA voyageur pour proposer de laisser un avis
  //     public lorsque le voyageur a noté 4-5★).
  const airportPro = await db.pro.findFirst({
    where: { typeEtablissement: 'Aéroport', suspendu: false },
    select: { logoUrl: true, nomEtablissement: true, googleReviewUrl: true },
  })

  // 2c. QR Dynamique Vol — Task D Phase 3.
  //     Si le tag correspond à une porte avec un vol actif à quai,
  //     on l'attache au payload : la PWA pré-remplit + verrouille le
  //     champ "numéro de vol" côté voyageur (pas de saisie manuelle).
  const activeFlight = await db.airportFlightGate.findFirst({
    where: { gateTag: tag, active: true },
  })
  const currentFlight = activeFlight
    ? {
        flightNumber: activeFlight.flightNumber,
        airline: activeFlight.airline,
        destination: activeFlight.destination,
        scheduledDeparture: activeFlight.scheduledDeparture,
        status: activeFlight.status,
      }
    : null

  const data = {
    code: config.code,
    nom: zone?.nom ?? config.nom,
    emoji: zone?.emoji ?? config.emoji,
    description: zone?.description ?? config.description ?? null,
    tags: safeParse<string[]>(zone?.tags ?? null, config.tags),
    problemes: safeParse<string[]>(zone?.problemes ?? null, [...config.problemes]),
    tagScanne: tag,
    airportLogo: airportPro?.logoUrl ?? null,
    airportName: airportPro?.nomEtablissement ?? null,
    // D8 — URL d'avis Google Reviews de l'aéroport (null si aucun Pro
    // "Aéroport" rattaché ou si googleReviewUrl n'est pas renseigné).
    airportGoogleReviewUrl: airportPro?.googleReviewUrl ?? null,
    // Task D Phase 3 — vol actuellement à quai à cette porte (null si
    // la porte est libre ou si le tag n'est pas une porte assignée).
    currentFlight,
  }

  return ok({ zone: data })
}

// Helpers exportés pour réutilisation interne (tests, seed check)
export { AIRPORT_ZONES }
