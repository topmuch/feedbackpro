// ============================================================
// API Pro - Commandes de supports physiques
// GET  /api/pro/commandes
// POST /api/pro/commandes { typeSupport, adresseLivraison }  (paiement simulé)
// ============================================================

import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, fail } from "@/lib/session"
import { requirePro, unauthorized } from "@/lib/guards"
import { SUPPORTS, TypeSupportId } from "@/lib/constants"

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

    const body = await req.json()
    const typeSupport = String(body.typeSupport || "") as TypeSupportId
    const adresseLivraison = String(body.adresseLivraison || "").trim()

    const support = SUPPORTS[typeSupport]
    if (!support) return fail("Type de support invalide", 400)
    if (adresseLivraison.length < 10) return fail("Indiquez une adresse de livraison complète", 400)

    const quantite = typeSupport === "STICKERS_50" ? 50 : 1

    // === Paiement Stripe simulé (sandbox sans clés API) ===
    console.log(`[STRIPE SIMULÉ] Paiement ${support.price} EUR pour ${ctx.pro.nomCommerce} - ${support.label}`)

    const commande = await db.commande.create({
      data: {
        proId: ctx.pro.id,
        typeSupport,
        quantite,
        prixEuros: support.price,
        adresseLivraison,
        statut: "A_IMPRIMER",
      },
    })

    return ok({ commande }, 201)
  } catch (e) {
    console.error("commandes POST error", e)
    return fail("Erreur serveur", 500)
  }
}
