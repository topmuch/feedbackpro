// ============================================================
// FeedbackPro - Cron : rapports HEBDOMADAIRES du Coach IA (Session 5 §3)
// GET /api/cron/rapports-hebdomadaires
// ------------------------------------------------------------
// Planifié chaque LUNDI à 7h00 par Vercel Cron (vercel.json).
// Peut aussi être appelé manuellement :
//   curl -H "Authorization: Bearer $CRON_SECRET" \
//     https://feedbackpro.fr/api/cron/rapports-hebdomadaires
//
// → cronRapportHebdomadaire() (src/lib/cron.ts) : boucle sur TOUS les
//   Pros plan PRO+ (PRO / ENTERPRISE), non suspendus, ayant reçu au
//   moins un retour sur les 7 derniers jours, et génère leur rapport
//   hebdomadaire via genererRapportIA() (LLM + fallback déterministe
//   + email automatique).
//
// → { ok, data: { cibles, rapports: [...], erreurs: [...] } }
// ============================================================

import { NextRequest } from "next/server"
import { ok, fail } from "@/lib/session"
import { cronRapportHebdomadaire } from "@/lib/cron"

export async function GET(req: NextRequest) {
  try {
    // ---------- Sécurité : CRON_SECRET obligatoire ----------
    const secret = process.env.CRON_SECRET
    if (!secret) {
      return fail("Cron non configuré (CRON_SECRET absent)", 501)
    }
    const auth = req.headers.get("authorization") ?? ""
    if (auth !== `Bearer ${secret}`) {
      return fail("Non autorisé", 401)
    }

    const resultat = await cronRapportHebdomadaire()
    return ok(resultat)
  } catch (e) {
    console.error("cron rapports-hebdomadaires error", e)
    return fail("Erreur serveur lors de la génération des rapports hebdomadaires", 500)
  }
}
