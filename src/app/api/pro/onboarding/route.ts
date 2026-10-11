// ============================================================
// API Pro - Onboarding (3 étapes) : finalise la configuration
// PUT /api/pro/onboarding
// Body : { nomCommerce, categorie, adresse, ville, whatsapp?, googleUrl?,
//          logoUrl?, onboardingDone }
// Validation zod partagée : src/lib/validation.ts
// ============================================================

import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, fail } from "@/lib/session"
import { requirePro, unauthorized } from "@/lib/guards"
import { onboardingSchema, firstError, LOGO_MAX_LENGTH } from "@/lib/validation"

export async function PUT(req: NextRequest) {
  try {
    const ctx = await requirePro(req)
    if (!ctx) return unauthorized()

    const body = await req.json().catch(() => null)
    if (!body) return fail("Requête invalide", 400)

    // Validation zod (schéma partagé avec le formulaire client)
    const parsed = onboardingSchema.safeParse(body)
    if (!parsed.success) return fail(firstError(parsed.error), 400)

    const { nomCommerce, categorie, adresse, ville } = parsed.data
    const whatsapp = parsed.data.whatsapp ?? ""
    const googleUrl = parsed.data.googleUrl
    const onboardingDone = parsed.data.onboardingDone === true

    // WhatsApp facultatif aux étapes intermédiaires, obligatoire à la finalisation
    if (onboardingDone && whatsapp.length < 8) {
      return fail("Numéro WhatsApp invalide (format international : 33612345678)", 400)
    }

    // Logo : undefined = ne pas modifier · null/"" = supprimer · data URL ou https = définir
    let logoUrl: string | null | undefined
    const logoInput = parsed.data.logoUrl
    if (logoInput === undefined) {
      logoUrl = undefined
    } else if (logoInput === null || logoInput === "") {
      logoUrl = null
    } else if (logoInput.length > LOGO_MAX_LENGTH) {
      return fail("Logo trop volumineux (300 Ko maximum)", 400)
    } else {
      logoUrl = logoInput
    }

    const updated = await db.pro.update({
      where: { id: ctx.pro.id },
      data: {
        nomCommerce,
        categorie,
        adresse,
        ville,
        // "" = efface explicitement le lien Google ; undefined = conserve l'existant
        googleUrl: googleUrl === undefined ? undefined : googleUrl === "" ? null : googleUrl,
        onboardingDone,
        logoUrl,
        ...(whatsapp ? { whatsapp } : {}),
      },
    })

    // Synchronise la boutique par défaut
    await db.boutique.updateMany({
      where: { proId: ctx.pro.id },
      data: { nom: nomCommerce, adresse },
    })

    return ok({ pro: updated })
  } catch (e) {
    console.error("onboarding error", e)
    return fail("Erreur serveur", 500)
  }
}
