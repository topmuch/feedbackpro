// ============================================================
// FeedbackPro - Checkout Stripe d'une commande de support physique
// POST /api/pro/commandes/checkout { typeSupport, adresseLivraison, zoneId? }
// ------------------------------------------------------------
// - Sans STRIPE_SECRET_KEY : mode démo → la commande est créée
//   immédiatement (paiement simulé), réponse { mode: "DEMO", commande }.
// - Avec clés : crée une Checkout Session mode=payment (montant du
//   catalogue en centimes) avec metadata.kind="commande" ; le webhook
//   /api/webhooks/stripe créera la commande après checkout.session.completed.
//   Réponse { mode: "STRIPE", url } → le frontend redirige vers la page
//   de paiement hébergée par Stripe.
// ============================================================

import { NextRequest } from "next/server"
import Stripe from "stripe"
import { db } from "@/lib/db"
import { ok, fail } from "@/lib/session"
import { requirePro, unauthorized } from "@/lib/guards"
import { SUPPORTS, TypeSupportId } from "@/lib/constants"
import { commandeSchema, firstError } from "@/lib/validation"
import { creerCommandeAvecConfirmation } from "@/lib/commandes"

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

    // ---------- Mode démo : pas de clés Stripe ----------
    if (!process.env.STRIPE_SECRET_KEY) {
      console.log(
        `[STRIPE SIMULÉ] Paiement ${support.price} EUR pour ${ctx.pro.nomEtablissement} - ${support.label}`
      )
      const commande = await creerCommandeAvecConfirmation(
        ctx.pro,
        { proId: ctx.pro.id, typeSupport: typeSupport as TypeSupportId, adresseLivraison, zoneId },
        ctx.pro.email || ctx.user.email
      )
      return ok({ mode: "DEMO", commande }, 201)
    }

    // ---------- Stripe actif : Checkout Session (paiement unique) ----------
    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "")

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "eur",
            unit_amount: support.price * 100,
            product_data: {
              name: support.label,
              description: support.description,
            },
          },
        },
      ],
      // Le webhook retrouvera toutes les informations pour créer la
      // commande sans colonne dédiée en base (rapprochement par metadata).
      metadata: {
        kind: "commande",
        proId: ctx.pro.id,
        typeSupport,
        adresseLivraison,
        zoneId: zoneId || "",
      },
      success_url: `${appUrl}/dashboard/commander?succes=1`,
      cancel_url: `${appUrl}/dashboard/commander?annule=1`,
      client_reference_id: ctx.pro.id,
    })

    return ok({ mode: "STRIPE", url: session.url })
  } catch (e) {
    console.error("commandes checkout error", e)
    return fail("Erreur serveur lors de la création du paiement", 500)
  }
}
