// ============================================================
// FeedbackPro - Cron : emails d'onboarding "First Week" (Task 1)
// GET /api/cron/onboarding-emails
// ------------------------------------------------------------
// Appelé une fois par jour (vercel.json). Envoie les 3 emails J0 / J3 / J7
// aux Pros éligibles selon l'âge de leur compte.
// Sécurité : CRON_SECRET obligatoire dans l'en-tête Authorization.
// ============================================================

import { NextRequest } from "next/server"
import { ok, fail } from "@/lib/session"
import { cronOnboardingEmails } from "@/lib/cron"

export async function GET(req: NextRequest) {
  try {
    const secret = process.env.CRON_SECRET
    if (!secret) {
      return fail("Cron non configuré (CRON_SECRET absent)", 501)
    }
    const auth = req.headers.get("authorization") ?? ""
    if (auth !== `Bearer ${secret}`) {
      return fail("Non autorisé", 401)
    }

    const resultat = await cronOnboardingEmails()
    return ok(resultat)
  } catch (e) {
    console.error("cron onboarding-emails error", e)
    return fail("Erreur serveur lors de l'envoi des emails d'onboarding", 500)
  }
}
