// ============================================================
// FeedbackPro - Cron : rapports quotidiens du Coach IA (Session 5 §3)
// GET /api/cron/rapports-quotidiens
// ------------------------------------------------------------
// Planifié chaque jour à 7h00 par Vercel Cron (vercel.json).
// Peut aussi être appelé manuellement :
//   curl -H "Authorization: Bearer $CRON_SECRET" \
//     https://feedbackpro.fr/api/cron/rapports-quotidiens
//
// → cronRapportQuotidien() (src/lib/cron.ts) : boucle sur tous les
//   Pros plan PRO+ (PRO / ENTERPRISE) en fréquence quotidienne, non
//   suspendus, ayant reçu au moins un retour sur les 24 dernières
//   heures, et génère leur rapport quotidien via genererRapportIA()
//   (LLM + fallback déterministe + email automatique).
//
// → { ok, data: { cibles, rapports: [...], erreurs: [...] } }
// ============================================================

import { NextRequest } from "next/server"
import { ok, fail } from "@/lib/session"
import { cronRapportQuotidien } from "@/lib/cron"

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

    const resultat = await cronRapportQuotidien()
    return ok(resultat)
  } catch (e) {
    console.error("cron rapports-quotidiens error", e)
    return fail("Erreur serveur lors de la génération des rapports quotidiens", 500)
  }
}
