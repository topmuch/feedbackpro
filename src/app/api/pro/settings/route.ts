// ============================================================
// API Pro - Paramètres de la boutique
// PUT /api/pro/settings
// ============================================================

import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, fail } from "@/lib/session"
import { requirePro, unauthorized } from "@/lib/guards"
import { CATEGORIES_COMMERCE } from "@/lib/constants"
import { LOGO_MAX_LENGTH } from "@/lib/validation"

export async function PUT(req: NextRequest) {
  try {
    const ctx = await requirePro(req)
    if (!ctx) return unauthorized()

    const body = await req.json()
    const nomCommerce = String(body.nomCommerce || "").trim()
    const categorie = String(body.categorie || "").trim()
    const adresse = String(body.adresse || "").trim()
    const ville = String(body.ville || "").trim()
    // WhatsApp : chiffres uniquement (format international sans +)
    const whatsapp = String(body.whatsapp || "").replace(/[^0-9]/g, "")
    const googleUrl = String(body.googleUrl || "").trim()
    const messageWhatsapp = String(body.messageWhatsapp || "").trim()
    // Session 6 : alertes SMS pour les réclamations (note ≤ 2★)
    // undefined = ne pas modifier · true/false = définir
    const smsAlertes = typeof body.smsAlertes === "boolean" ? body.smsAlertes : undefined

    if (nomCommerce.length < 2) return fail("Le nom du commerce est requis", 400)
    if (!CATEGORIES_COMMERCE.includes(categorie)) return fail("Catégorie invalide", 400)
    if (whatsapp && whatsapp.length < 8) return fail("Numéro WhatsApp invalide (format international : 33612345678)", 400)

    // Logo : undefined = ne pas modifier · null/"" = supprimer · data URL ou https = définir
    let logoUrl: string | null | undefined
    const logoInput = typeof body.logoUrl === "string" ? body.logoUrl : body.logoUrl === null ? null : undefined
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
        whatsapp: whatsapp || null,
        googleUrl: googleUrl || null,
        messageWhatsapp: messageWhatsapp || null,
        logoUrl,
        ...(smsAlertes !== undefined ? { smsAlertes } : {}),
      },
    })

    // Synchronise le nom de la boutique par défaut
    await db.boutique.updateMany({ where: { proId: ctx.pro.id }, data: { nom: nomCommerce, adresse } })

    return ok({ pro: updated })
  } catch (e) {
    console.error("settings error", e)
    return fail("Erreur serveur", 500)
  }
}
