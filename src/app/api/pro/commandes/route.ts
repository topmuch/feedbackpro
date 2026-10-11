// ============================================================
// API Pro - Commandes de supports physiques
// GET  /api/pro/commandes → { commandes }
// POST /api/pro/commandes { typeSupport, adresseLivraison, zoneId? }
//      → { commande } (quantité/prix issus du catalogue SUPPORTS
//        + email de confirmation non bloquant)
// ============================================================

import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, fail } from "@/lib/session"
import { requirePro, unauthorized } from "@/lib/guards"
import { SUPPORTS, TypeSupportId } from "@/lib/constants"
import { commandeSchema, firstError } from "@/lib/validation"
import { sendEmail, emailConfirmationCommande } from "@/lib/email"

export async function GET(req: NextRequest) {
  try {
    const ctx = await requirePro(req)
    if (!ctx) return unauthorized()

    const commandes = await db.commande.findMany({
      where: { proId: ctx.pro.id },
      orderBy: { createdAt: "desc" },
    })
    return ok({ commandes })
  } catch (e) {
    console.error("commandes GET error", e)
    return fail("Erreur serveur", 500)
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await requirePro(req)
    if (!ctx) return unauthorized()

    const parsed = commandeSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return fail(firstError(parsed.error), 400)
    const { typeSupport, adresseLivraison, zoneId } = parsed.data

    const support = SUPPORTS[typeSupport as TypeSupportId]
    if (!support) return fail("Type de support invalide", 400)

    // Zone optionnelle : le support peut être dédié à une zone précise
    if (zoneId) {
      const zone = await db.zone.findFirst({ where: { id: zoneId, proId: ctx.pro.id } })
      if (!zone) return fail("Zone introuvable", 404)
    }

    // Quantité du catalogue : 50 autocollants, 1 chevalet, 1 affiche
    const quantite = typeSupport === "STICKERS_50" ? 50 : 1

    // === Paiement Stripe simulé (sandbox sans clés API) ===
    console.log(`[STRIPE SIMULÉ] Paiement ${support.price} EUR pour ${ctx.pro.nomEtablissement} - ${support.label}`)

    const commande = await db.commande.create({
      data: {
        proId: ctx.pro.id,
        zoneId: zoneId || null,
        typeSupport,
        quantite,
        prixEuros: support.price,
        adresseLivraison,
        statut: "A_IMPRIMER",
      },
    })

    // Email de confirmation : non bloquant — un échec d'envoi ne doit
    // jamais faire échouer la création de la commande.
    try {
      const destinataire = ctx.pro.email || ctx.user.email
      await sendEmail(
        destinataire,
        "Confirmation de votre commande FeedbackPro",
        emailConfirmationCommande(ctx.pro.nomEtablissement, support.label, support.price, adresseLivraison)
      )
    } catch (e) {
      console.warn("Email de confirmation de commande non envoyé (non bloquant)", e)
    }

    return ok({ commande }, 201)
  } catch (e) {
    console.error("commandes POST error", e)
    return fail("Erreur serveur", 500)
  }
}
