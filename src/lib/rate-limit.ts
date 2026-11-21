// ============================================================
// FeedVoice - Rate limiting en mémoire (sliding window)
// ------------------------------------------------------------
// Protection simple et sans dépendance des endpoints publics contre
// l'abus (scans automatisés, brute-force login, spam de retours/loterie).
//
// Fenêtre glissante en mémoire process : suffisante pour une instance
// unique Coolify ; en cas de redémarrage, le compteur repart de zéro
// (acceptable : on bloque les rafales, pas la forensique).
//
// Usage dans une route POST :
//   const bloque = limiteTaux(req, "login", { max: 8, fenetreMs: 60_000 })
//   if (bloque) return bloque
//   // ... suite du handler
// ============================================================

import { NextRequest, NextResponse } from "next/server"

type FenetreGlissante = {
  /** Horodatages (ms) des requêtes acceptées dans la fenêtre courante. */
  horodatages: number[]
}

/**
 * Store sur globalThis pour survivre au HMR en dev (même pattern que
 * le client Prisma de src/lib/db.ts).
 */
const CLE_GLOBAL = "__fv_rate_limit_store__"

function store(): Map<string, FenetreGlissante> {
  const g = globalThis as { [CLE_GLOBAL]?: Map<string, FenetreGlissante> }
  if (!g[CLE_GLOBAL]) g[CLE_GLOBAL] = new Map()
  return g[CLE_GLOBAL]
}

/** Plafond de clés suivies (anti-fuite mémoire si scan d'IP spoofée). */
const MAX_CLES = 10_000

/**
 * Vérifie la fenêtre glissante pour une clé. Mutation : ajoute l'horodatage
 * si autorisé, purge les entrées expirées de la clé concernée.
 */
function verifier(cle: string, max: number, fenetreMs: number): { autorise: boolean; retryApresSec: number } {
  const maintenant = Date.now()
  const s = store()

  // Purge globale légère quand le store grossit trop (O(n) sur les clés).
  if (s.size > MAX_CLES) {
    for (const [k, f] of s) {
      const vivants = f.horodatages.filter((t) => maintenant - t < fenetreMs)
      if (vivants.length === 0) s.delete(k)
      else f.horodatages = vivants
    }
    // Si toujours trop gros (rares clés actives), on coupe les plus anciennes.
    if (s.size > MAX_CLES) {
      const aSupprimer = [...s.keys()].slice(0, s.size - MAX_CLES)
      for (const k of aSupprimer) s.delete(k)
    }
  }

  const f = s.get(cle) ?? { horodatages: [] }
  f.horodatages = f.horodatages.filter((t) => maintenant - t < fenetreMs)

  if (f.horodatages.length >= max) {
    const plusAncien = f.horodatages[0]
    const retryApresSec = Math.max(1, Math.ceil((plusAncien + fenetreMs - maintenant) / 1000))
    s.set(cle, f)
    return { autorise: false, retryApresSec }
  }

  f.horodatages.push(maintenant)
  s.set(cle, f)
  return { autorise: true, retryApresSec: 0 }
}

/** Meilleure IP client disponible (proxy Coolify/Caddy → x-forwarded-for). */
export function ipClient(req: NextRequest): string {
  const xff = req.headers.get("x-forwarded-for")
  if (xff) return xff.split(",")[0].trim()
  const xr = req.headers.get("x-real-ip")
  if (xr) return xr.trim()
  return "inconnu"
}

/**
 * Applique une limite de taux pour la route donnée. Retourne :
 *   - null si la requête est autorisée (continuer le handler) ;
 *   - une Response 429 JSON (header Retry-After) sinon.
 */
export function limiteTaux(
  req: NextRequest,
  route: string,
  opts: { max: number; fenetreMs?: number }
): NextResponse | null {
  const fenetreMs = opts.fenetreMs ?? 60_000
  const { autorise, retryApresSec } = verifier(`${route}:${ipClient(req)}`, opts.max, fenetreMs)
  if (autorise) return null
  return NextResponse.json(
    { ok: false, error: "Trop de requêtes. Réessayez dans quelques instants." },
    {
      status: 429,
      headers: { "Retry-After": String(retryApresSec) },
    }
  )
}
