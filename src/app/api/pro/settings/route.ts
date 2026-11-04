// ============================================================
// API Pro - Paramètres de l'établissement
// PUT /api/pro/settings
// { nomEtablissement, typeEtablissement, adresse, ville, whatsapp,
//   email, logoUrl?, messageWhatsapp?, frequenceRapport, recompense?,
//   recompenseActive?, recompenseType?, recompenseCode?, smsAlertes? } → { pro }
// ============================================================

import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, fail, serializePro } from "@/lib/session"
import { requirePro, unauthorized } from "@/lib/guards"
import { settingsSchema, firstError } from "@/lib/validation"

export async function PUT(req: NextRequest) {
  try {
    const ctx = await requirePro(req)
    if (!ctx) return unauthorized()

    const parsed = settingsSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return fail(firstError(parsed.error), 400)
    const champs = parsed.data

    // Logo : undefined = ne pas modifier · null/"" = supprimer · data URL ou https = définir
    let logoUrl: string | null | undefined
    if (champs.logoUrl === undefined) {
      logoUrl = undefined
    } else if (champs.logoUrl === null || champs.logoUrl === "") {
      logoUrl = null
    } else {
      logoUrl = champs.logoUrl
    }

    const updated = await db.pro.update({
      where: { id: ctx.pro.id },
      data: {
        nomEtablissement: champs.nomEtablissement,
        typeEtablissement: champs.typeEtablissement,
        adresse: champs.adresse,
        ville: champs.ville,
        whatsapp: champs.whatsapp || null,
        email: champs.email,
        messageWhatsapp: champs.messageWhatsapp || null,
        frequenceRapport: champs.frequenceRapport,
        recompense: champs.recompense || null,
        // Récompenses structurées (Session 3) : la récompense n'est montrée
        // au client que si le toggle est actif ET que le texte est renseigné
        ...(champs.recompenseActive !== undefined ? { recompenseActive: champs.recompenseActive } : {}),
        ...(champs.recompenseType !== undefined ? { recompenseType: champs.recompenseType } : {}),
        ...(champs.recompenseCode !== undefined ? { recompenseCode: champs.recompenseCode } : {}),
        logoUrl,
        ...(champs.smsAlertes !== undefined ? { smsAlertes: champs.smsAlertes } : {}),
        // D8 : Google Business Profile (saisie manuelle, pas d'API réelle)
        ...(champs.googleReviewUrl !== undefined
          ? { googleReviewUrl: champs.googleReviewUrl || null }
          : {}),
        ...(champs.googlePlaceId !== undefined
          ? { googlePlaceId: champs.googlePlaceId || null }
          : {}),
        // Task 6 — Webhooks sortants (Slack / Discord)
        ...(champs.webhookSlackUrl !== undefined
          ? { webhookSlackUrl: champs.webhookSlackUrl || null }
          : {}),
        ...(champs.webhookDiscordUrl !== undefined
          ? { webhookDiscordUrl: champs.webhookDiscordUrl || null }
          : {}),
      },
    })

    return ok({ pro: serializePro(updated) })
  } catch (e) {
    console.error("settings error", e)
    return fail("Erreur serveur", 500)
  }
}
