// ============================================================
// API publique - Liste des fiches SecteurConfig (Task M1)
// ------------------------------------------------------------
// GET /api/secteurs → { ok, data: SecteurConfig[] }
//
// Utilisé par :
//   - l'onboarding (auth-view.tsx) pour proposer les zones et tags
//     par défaut du secteur choisi (à la place du fichier statique
//     src/lib/secteurs.ts) ;
//   - la page RGPD (/rgpd) pour afficher les règles spécifiques au
//     secteur (photos interdites en hôpital, zones sensibles en
//     aéroport…) ;
//   - le Coach IA pour adapter son ton au secteur de l'établissement.
//
// Public (pas d'auth) : ces données ne contiennent aucune information
// sensible, seulement des templates de configuration.
// ============================================================

import { db } from "@/lib/db"
import { ok, fail } from "@/lib/session"

/** Forme publique d'un SecteurConfig (JSON parsé côté serveur) */
type ZoneDefaut = { nom: string; tagsPos: string[]; tagsNeg: string[] }
type KpiSpec = { id: string; label: string; target: number; unit: string }
type RegleSecurite = { photosInterdites: boolean; zonesSensibles: string[] }

export type SecteurConfigPublic = {
  id: string
  nom: string
  zonesDefaut: ZoneDefaut[]
  tagsGlobaux: string[]
  kpisSpeciaux: KpiSpec[]
  languesSupportees: string[]
  reglesSecurite: RegleSecurite
  emoji: string
  description: string
}

/** Parse un champ JSON en tolérant les valeurs vides/invalides. */
function parseJson<T>(valeur: string | null | undefined, defaut: T): T {
  if (!valeur) return defaut
  try {
    return JSON.parse(valeur) as T
  } catch {
    return defaut
  }
}

export async function GET() {
  try {
    const secteurs = await db.secteurConfig.findMany({
      orderBy: { nom: "asc" },
    })

    const data: SecteurConfigPublic[] = secteurs.map((s) => ({
      id: s.id,
      nom: s.nom,
      zonesDefaut: parseJson<ZoneDefaut[]>(s.zonesDefaut, []),
      tagsGlobaux: parseJson<string[]>(s.tagsGlobaux, []),
      kpisSpeciaux: parseJson<KpiSpec[]>(s.kpisSpeciaux, []),
      languesSupportees: parseJson<string[]>(s.languesSupportees, []),
      reglesSecurite: parseJson<RegleSecurite>(s.reglesSecurite, {
        photosInterdites: false,
        zonesSensibles: [],
      }),
      emoji: s.emoji,
      description: s.description,
    }))

    return ok(data)
  } catch (e) {
    console.error("secteurs GET error", e)
    return fail("Impossible de charger la liste des secteurs", 500)
  }
}

// Next.js : pas de cache statique (les fiches peuvent évoluer en BDD)
export const dynamic = "force-dynamic"
