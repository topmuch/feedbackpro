// ============================================================
// FeedbackPro - Création de commandes de supports physiques
// ------------------------------------------------------------
// Logique partagée entre :
//  · POST /api/pro/commandes          (paiement simulé, mode démo)
//  · POST /api/pro/commandes/checkout (Stripe actif → webhook)
//  · webhook Stripe checkout.session.completed (metadata kind="commande")
//
// Quantité issue du catalogue : 50 autocollants, 1 chevalet, 1 affiche.
// L'email de confirmation est NON bloquant : un échec d'envoi ne doit
// jamais faire échouer la création de la commande.
// ============================================================

import { db } from "@/lib/db"
import type { Pro } from "@prisma/client"
import { SUPPORTS, TypeSupportId } from "@/lib/constants"
import { sendEmail, emailConfirmationCommande } from "@/lib/email"

/** Quantité associée à chaque type de support du catalogue */
export function quantitePour(typeSupport: string): number {
  return typeSupport === "STICKERS_50" ? 50 : 1
}

type ParamsCommande = {
  proId: string
  typeSupport: TypeSupportId
  adresseLivraison: string
  zoneId?: string | null
}

/** Crée la commande en base à partir d'un type de support validé */
export async function creerCommande(params: ParamsCommande) {
  const support = SUPPORTS[params.typeSupport]
  return db.commande.create({
    data: {
      proId: params.proId,
      zoneId: params.zoneId || null,
      typeSupport: params.typeSupport,
      quantite: quantitePour(params.typeSupport),
      prixEuros: support.price,
      adresseLivraison: params.adresseLivraison,
      statut: "A_IMPRIMER",
    },
  })
}

/**
 * Crée la commande puis envoie l'email de confirmation (non bloquant).
 * Utilisée par le mode démo (sans clés Stripe) et par le webhook Stripe
 * après un paiement réussi — le comportement est identique dans les deux cas.
 */
export async function creerCommandeAvecConfirmation(
  pro: Pro,
  params: ParamsCommande,
  emailDestinataire: string
) {
  const commande = await creerCommande(params)
  const support = SUPPORTS[params.typeSupport]

  try {
    await sendEmail(
      emailDestinataire,
      "Confirmation de votre commande FeedbackPro",
      emailConfirmationCommande(pro.nomEtablissement, support.label, support.price, params.adresseLivraison)
    )
  } catch (e) {
    console.warn("Email de confirmation de commande non envoyé (non bloquant)", e)
  }

  return commande
}
