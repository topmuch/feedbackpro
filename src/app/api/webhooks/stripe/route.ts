// ============================================================
// FeedbackPro - Webhook Stripe (Session 6 §1)
// POST /api/webhooks/stripe
// ------------------------------------------------------------
// PRODUCTION-READY SANS CLÉS : tant que STRIPE_SECRET_KEY /
// STRIPE_WEBHOOK_SECRET ne sont pas définis, le webhook répond 501
// et n'a aucun effet (mode démo partout ailleurs).
//
// ⚠️ Pas de colonne stripeCustomerId en base : le rapprochement
// Stripe → Pro se fait EXCLUSIVEMENT via `metadata.proId` transmis
// au moment de la création de la Checkout Session (voir
// src/app/api/pro/billing/checkout/route.ts).
//
// ─── Comment créer les Price IDs Stripe ──────────────────────
// 1. Dashboard Stripe → Produits → "Ajouter un produit"
//    - "FeedbackPro Pro"        : prix récurrent 99 € / mois  → price_xxx → STRIPE_PRICE_PRO
//    - "FeedbackPro Enterprise" : prix récurrent 249 € / mois → price_xxx → STRIPE_PRICE_ENTERPRISE
// 2. Copier les deux `price_...` dans les variables d'env (.env / Vercel)
// 3. Créer un endpoint webhook (https://feedbackpro.fr/api/webhooks/stripe)
//    avec les événements ci-dessous → copier le secret (whsec_...)
//    dans STRIPE_WEBHOOK_SECRET
// 4. En local : stripe listen --forward-to localhost:3000/api/webhooks/stripe
// ============================================================

import { NextRequest } from "next/server"
import Stripe from "stripe"
import { db } from "@/lib/db"
import { fail, ok } from "@/lib/session"
import { PLANS, SUPPORTS, TypeSupportId } from "@/lib/constants"
import { creerCommandeAvecConfirmation, quantitePour } from "@/lib/commandes"

export async function POST(req: NextRequest) {
  try {
    const secretKey = process.env.STRIPE_SECRET_KEY
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

    // ---------- Stripe non configuré → 501 claire ----------
    if (!secretKey || !webhookSecret) {
      return fail("Stripe non configuré (STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET absents)", 501)
    }

    const stripe = new Stripe(secretKey)

    // ---------- Vérification de la signature (sécurité obligatoire) ----------
    const signature = req.headers.get("stripe-signature")
    const body = await req.text()
    let event: Stripe.Event
    try {
      event = stripe.webhooks.constructEvent(body, signature ?? "", webhookSecret)
    } catch (e) {
      console.error("Webhook Stripe : signature invalide", e)
      return fail("Signature webhook invalide", 400)
    }

    // ---------- Routage des événements ----------
    switch (event.type) {
      // Paiement réussi : abonnement (metadata.plan) OU commande de support
      // physique (metadata.kind="commande", cf. /api/pro/commandes/checkout)
      case "checkout.session.completed": {
        const session = event.data.object
        const proId = session.metadata?.proId

        // ---------- Cas 1 : commande de support physique ----------
        if (session.metadata?.kind === "commande") {
          // Sécurité : on ne crée la commande qu'une fois le paiement réglé
          if (session.payment_status && session.payment_status !== "paid" && session.payment_status !== "no_payment_required") {
            console.log(`[STRIPE] commande : paiement non réglé (${session.payment_status}) → ignoré`)
            break
          }
          const typeSupport = session.metadata.typeSupport as TypeSupportId
          const support = SUPPORTS[typeSupport]
          if (!proId || !support) {
            console.warn(`[STRIPE] commande : metadata incomplète (id=${session.id})`)
            break
          }
          const pro = await db.pro.findUnique({ where: { id: proId } })
          if (!pro) {
            console.warn(`[STRIPE] commande : Pro ${proId} introuvable (id=${session.id})`)
            break
          }
          // Idempotence : une même Checkout Session ne doit créer la
          // commande qu'une seule fois (Stripe peut rejouer l'événement).
          const dejaCreee = await db.commande.findFirst({
            where: { proId, typeSupport, statut: "A_IMPRIMER", createdAt: { gte: new Date(Date.now() - 10 * 60 * 1000) } },
          })
          if (dejaCreee) {
            console.log(`[STRIPE] commande déjà créée pour la session ${session.id} → ignoré`)
            break
          }
          const commande = await creerCommandeAvecConfirmation(
            pro,
            {
              proId,
              typeSupport,
              adresseLivraison: session.metadata.adresseLivraison || "",
              zoneId: session.metadata.zoneId || null,
            },
            pro.email
          )
          console.log(
            `[STRIPE] checkout.session.completed → commande ${commande.id} créée (${support.label}, ${quantitePour(typeSupport)} u., ${commande.prixEuros} €)`
          )
          break
        }

        // ---------- Cas 2 : abonnement (checkout initial) ----------
        const plan = session.metadata?.plan
        if (proId && plan && PLANS[plan as keyof typeof PLANS]) {
          await db.pro.update({ where: { id: proId }, data: { plan } })
          console.log(`[STRIPE] checkout.session.completed → Pro ${proId} passe au plan ${plan}`)
        } else {
          console.warn(`[STRIPE] checkout.session.completed sans metadata proId/plan (id=${session.id})`)
        }
        break
      }

      // Renouvellement / changement de siège : la metadata est portée par
      // subscription_data.metadata (recopiée depuis la Checkout Session)
      case "customer.subscription.updated": {
        const subscription = event.data.object
        const proId = subscription.metadata?.proId
        const plan = subscription.metadata?.plan
        if (proId && plan && PLANS[plan as keyof typeof PLANS]) {
          await db.pro.update({ where: { id: proId }, data: { plan } })
          console.log(`[STRIPE] customer.subscription.updated → Pro ${proId} plan ${plan}`)
        }
        break
      }

      // Résiliation / impayé : retour au plan gratuit
      case "customer.subscription.deleted": {
        const subscription = event.data.object
        const proId = subscription.metadata?.proId
        if (proId) {
          await db.pro.update({ where: { id: proId }, data: { plan: "STARTER" } })
          console.log(`[STRIPE] customer.subscription.deleted → Pro ${proId} repasse au plan STARTER`)
        }
        break
      }

      // Factures récurrentes : rien à synchroniser (l'historique est géré
      // par Stripe) — log seulement pour le suivi.
      case "invoice.paid":
      case "invoice.payment_succeeded":
      case "invoice.payment_failed": {
        const invoice = event.data.object
        console.log(
          `[STRIPE] ${event.type} — ${invoice.amount_paid / 100} € (client=${typeof invoice.customer})`
        )
        break
      }

      default:
        // Événements non gérés : acquittés silencieusement (200) pour
        // éviter les retries inutiles côté Stripe.
        break
    }

    return ok({ received: true })
  } catch (e) {
    console.error("webhook stripe error", e)
    return fail("Erreur serveur lors du traitement du webhook", 500)
  }
}
