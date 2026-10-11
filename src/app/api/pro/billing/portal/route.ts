// ============================================================
// FeedbackPro - Portail client Stripe (Customer Portal)
// POST /api/pro/billing/portal
// ------------------------------------------------------------
// - Sans STRIPE_SECRET_KEY : mode démo → { mode: "DEMO" } (le frontend
//   affiche un message explicite, aucun prélèvement ni redirection).
// - Avec clés : retrouve le client Stripe par email (aucune colonne
//   stripeCustomerId en base, cf. choix Session 6) puis crée une session
//   Billing Portal → { mode: "STRIPE", url }. Le commerçant peut y gérer
//   son moyen de paiement, ses factures et résilier son abonnement.
// ============================================================

import { NextRequest } from "next/server"
import Stripe from "stripe"
import { ok, fail } from "@/lib/session"
import { requirePro, unauthorized } from "@/lib/guards"

export async function POST(req: NextRequest) {
  try {
    const ctx = await requirePro(req)
    if (!ctx) return unauthorized()

    // ---------- Mode démo : pas de clés Stripe ----------
    if (!process.env.STRIPE_SECRET_KEY) {
      console.log(`[STRIPE SIMULÉ] Portail client demandé par ${ctx.pro.nomEtablissement} (mode démo)`)
      return ok({ mode: "DEMO" })
    }

    const email = ctx.pro.email || ctx.user.email
    if (!email) {
      return fail("Aucun email de facturation renseigné dans vos paramètres", 400)
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

    // Rapprochement par email : le client Stripe est créé par la Checkout
    // Session d'abonnement avec le même email (mode subscription).
    const clients = await stripe.customers.list({ email, limit: 1 })
    const client = clients.data[0]
    if (!client) {
      return fail(
        "Aucun client Stripe associé à votre compte. Effectuez d'abord un changement de plan payant.",
        404
      )
    }

    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "")
    const session = await stripe.billingPortal.sessions.create({
      customer: client.id,
      return_url: `${appUrl}/dashboard/billing`,
    })

    return ok({ mode: "STRIPE", url: session.url })
  } catch (e) {
    console.error("billing portal error", e)
    return fail("Erreur serveur lors de l'ouverture du portail de facturation", 500)
  }
}
