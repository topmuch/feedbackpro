// ============================================================
// FeedbackPro - Checkout Stripe (Session 6 §1)
// POST /api/pro/billing/checkout { plan: "PRO" | "ENTERPRISE" }
// ------------------------------------------------------------
// - Sans STRIPE_SECRET_KEY : renvoie { mode: "DEMO" } → le frontend
//   reste en paiement simulé (POST /api/pro/plan directement).
// - Avec clés : crée une Checkout Session mode subscription avec
//   metadata.proId (rapprochement webhook sans colonne en base),
//   success_url /dashboard/billing?paiement=succes, cancel_url /dashboard/billing.
// - Le plan Starter étant gratuit, le frontend appelle /api/pro/plan
//   directement pour un downgrade (aucun paiement nécessaire).
// ============================================================

import { NextRequest } from "next/server"
import Stripe from "stripe"
import { ok, fail } from "@/lib/session"
import { requirePro, unauthorized } from "@/lib/guards"
import { PLANS } from "@/lib/constants"

export async function POST(req: NextRequest) {
  try {
    const ctx = await requirePro(req)
    if (!ctx) return unauthorized()

    const body = await req.json().catch(() => null)
    const plan = String(body?.plan || "")
    if (!PLANS[plan as keyof typeof PLANS]) return fail("Plan invalide", 400)

    // ---------- Mode démo : pas de clés Stripe ----------
    if (!process.env.STRIPE_SECRET_KEY) {
      console.log(`[STRIPE SIMULÉ] ${ctx.pro.nomEtablissement} → checkout démo plan ${plan}`)
      return ok({ mode: "DEMO" })
    }

    // ---------- Plan gratuit : pas de paiement ----------
    if (plan === "STARTER") {
      return fail("Le plan Starter est gratuit : aucun paiement n'est nécessaire", 400)
    }

    // ---------- Résolution du Price ID ----------
    const priceId = plan === "PRO" ? process.env.STRIPE_PRICE_PRO : process.env.STRIPE_PRICE_ENTERPRISE
    if (!priceId) {
      return fail(
        `Stripe est configuré mais le prix du plan ${plan} est manquant (STRIPE_PRICE_${plan})`,
        500
      )
    }

    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "")

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      // Metadata recopiée sur l'abonnement : le webhook
      // customer.subscription.updated retrouvera le Pro sans colonne dédiée.
      metadata: { proId: ctx.pro.id, plan },
      subscription_data: {
        metadata: { proId: ctx.pro.id, plan },
      },
      success_url: `${appUrl}/dashboard/billing?paiement=succes`,
      cancel_url: `${appUrl}/dashboard/billing`,
      client_reference_id: ctx.pro.id,
    })

    return ok({ mode: "STRIPE", url: session.url })
  } catch (e) {
    console.error("checkout error", e)
    return fail("Erreur serveur lors de la création du paiement", 500)
  }
}
