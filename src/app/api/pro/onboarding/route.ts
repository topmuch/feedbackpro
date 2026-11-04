// ============================================================
// API Pro - Programme d'onboarding "First Week" (Task 1)
// ------------------------------------------------------------
// POST /api/pro/onboarding { step }
//   step = 1..5 — incrémente onboardingStep côté Pro.
//   - step 5 marque l'onboarding comme terminé (onboardingDone = true).
//   - Les transitions arrière sont ignorées (on ne redescend jamais).
//   - Renvoie le Pro mis à jour sérialisé pour rafraîchir le store.
//
// GET /api/pro/onboarding
//   → { step, etapes: [{ n, titre, fait, lien }] }
//   Liste statique des 4 étapes + état courant (utilisé par la bannière).
// ============================================================

import { NextRequest } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { ok, fail, serializePro } from "@/lib/session"
import { requirePro, unauthorized } from "@/lib/guards"
import { firstError } from "@/lib/validation"

const patchSchema = z.object({
  step: z
    .number()
    .int()
    .min(0, "Étape invalide")
    .max(5, "Étape invalide"),
})

/** Définition statique des 4 étapes de la "First Week" (Task 1 spec). */
export const ETAPES_ONBOARDING: ReadonlyArray<{
  n: number
  titre: string
  description: string
  lien: string
}> = [
  {
    n: 1,
    titre: "Créez vos zones de contact",
    description:
      "Identifiez les points de contact où vos clients laissent une impression (Accueil, Salle, Toilettes…).",
    lien: "/dashboard/zones",
  },
  {
    n: 2,
    titre: "Téléchargez vos QR codes",
    description:
      "Exportez chaque QR code en PDF prêt à imprimer pour vos affichettes et chevalets.",
    lien: "/dashboard/qr-codes",
  },
  {
    n: 3,
    titre: "Présentez le concept à votre équipe",
    description:
      "Vos collaborateurs sont les premiers acteurs de la qualité — expliquez le dispositif.",
    lien: "/dashboard/equipe",
  },
  {
    n: 4,
    titre: "Attendez vos premiers retours",
    description:
      "Les premiers retours arrivent en 24-72 h. Dès 5 retours, votre Coach IA génère un premier audit.",
    lien: "/dashboard",
  },
] as const

export async function GET(req: NextRequest) {
  try {
    const ctx = await requirePro(req)
    if (!ctx) return unauthorized()

    const step = (ctx.pro as unknown as { onboardingStep?: number }).onboardingStep ?? 0
    return ok({
      step,
      termine: step >= 5,
      etapes: ETAPES_ONBOARDING.map((e) => ({ ...e, fait: step > e.n })),
    })
  } catch (e) {
    console.error("onboarding GET error", e)
    return fail("Erreur serveur", 500)
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await requirePro(req)
    if (!ctx) return unauthorized()

    const parsed = patchSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return fail(firstError(parsed.error), 400)
    const stepCible = parsed.data.step

    // On ne redescend jamais (l'utilisateur a déjà vu les étapes précédentes).
    const stepActuel = (ctx.pro as unknown as { onboardingStep?: number }).onboardingStep ?? 0
    const stepFinal = Math.max(stepActuel, stepCible)

    const updated = await db.pro.update({
      where: { id: ctx.pro.id },
      data: {
        onboardingStep: stepFinal,
        // step 5 = onboarding terminé
        onboardingDone: stepFinal >= 5 ? true : ctx.pro.onboardingDone,
      },
    })

    return ok({ pro: serializePro(updated), step: stepFinal })
  } catch (e) {
    console.error("onboarding POST error", e)
    return fail("Erreur serveur", 500)
  }
}
