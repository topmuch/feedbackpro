// ============================================================
// API Publique - Liste des modules actifs (sans authentification)
// ------------------------------------------------------------
// GET /api/modules-public → { modules: string[] }
//
// Utilisé par la page de scan (scan-view.tsx) pour savoir quels
// modules optionnels activer côté client :
//   - voice_to_text  → afficher le bouton « 🎤 Parler »
//   - loterie        → proposer le ticket à gratter après l'avis
//   - smart_qr       → adapter la phrase d'accroche selon l'heure
//   - double_shield  → bouton Google proéminent + message privé
//
// Aucune donnée sensible n'est renvoyée : seules les clés des
// modules ACTIFS sont exposées. La config spécifique (tauxGain,
// phone…) reste côté serveur.
// ============================================================

import { NextRequest } from "next/server"
import { ok, fail } from "@/lib/session"
import { getModulesActifs } from "@/lib/modules"
import { limiteTaux } from "@/lib/rate-limit"

export async function GET(req: NextRequest) {
  // 60/min/IP : la page de scan n'appelle cette route qu'une fois par scan.
  const bloque = limiteTaux(req, "modules-public", { max: 60, fenetreMs: 60_000 })
  if (bloque) return bloque

  try {
    const actifs = await getModulesActifs()
    return ok({ modules: [...actifs] })
  } catch (e) {
    console.error("modules-public error", e)
    return fail("Erreur serveur", 500)
  }
}
