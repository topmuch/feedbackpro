// ============================================================
// FeedbackPro - Constantes métier partagées (client + serveur)
// Conforme Session 1 : "Le Coach IA d'Audit Qualité Continu"
// ============================================================

// ---------- Plans d'abonnement (S1 : Starter 29€ / Pro 99€ / Enterprise 249€) ----------

export type PlanId = "STARTER" | "PRO" | "ENTERPRISE"

export const PLANS: Record<
  PlanId,
  {
    id: PlanId
    name: string
    price: number
    tagline: string
    features: string[]
    limites: { retours: string; employes: string; zones: string }
  }
> = {
  STARTER: {
    id: "STARTER",
    name: "Starter",
    price: 29,
    tagline: "Transformez vos premiers clients en auditeurs qualité",
    features: [
      "Jusqu'à 3 zones de contact",
      "QR code dédié par zone",
      "50 retours / mois",
      "Rapport IA hebdomadaire",
      "Alertes WhatsApp en temps réel",
    ],
    limites: { retours: "50/mois", employes: "2", zones: "3" },
  },
  PRO: {
    id: "PRO",
    name: "Pro",
    price: 99,
    tagline: "Le Coach IA complet pour piloter vos équipes",
    features: [
      "Tout Starter, plus :",
      "Zones & retours illimités",
      "Rapport IA quotidien (Coach)",
      "Top 3 priorités du jour",
      "Leaderboard & besoins de formation",
      "Statistiques avancées + heatmap",
      "Exports CSV & PDF",
    ],
    limites: { retours: "∞", employes: "15", zones: "15" },
  },
  ENTERPRISE: {
    id: "ENTERPRISE",
    name: "Enterprise",
    price: 249,
    tagline: "Pour les franchises et groupes multi-sites",
    features: [
      "Tout Pro, plus :",
      "Multi-établissements illimités",
      "Employés illimités",
      "Rapports consolidés par site",
      "API & intégrations",
      "Support prioritaire",
    ],
    limites: { retours: "∞", employes: "∞", zones: "∞" },
  },
}

/** Affiche le prix d'un plan : « Gratuit » si 0, sinon « 29 € » */
export function planPriceLabel(price: number): string {
  return price === 0 ? "Gratuit" : `${price} €`
}

// ---------- Supports physiques (vendus par le Superadmin) ----------

export type TypeSupportId = "STICKERS_50" | "CHEVALET_ACRYLIQUE" | "AFFICHE_A4"

export const SUPPORTS: Record<
  TypeSupportId,
  { id: TypeSupportId; label: string; price: number; description: string; emoji: string; delai: string }
> = {
  STICKERS_50: {
    id: "STICKERS_50",
    label: "Pack 50 autocollants vinyle",
    price: 29,
    description: "Autocollants 5x5 cm haute résistance, résistants à l'eau et aux UVs",
    emoji: "🏷️",
    delai: "Impression 48h + expédition 3 jours",
  },
  CHEVALET_ACRYLIQUE: {
    id: "CHEVALET_ACRYLIQUE",
    label: "Chevalet acrylique comptoir",
    price: 49,
    description: "Chevalet A5 en acrylique transparent 5mm, élégant et stable",
    emoji: "🏛️",
    delai: "Fabrication 72h + expédition 3 jours",
  },
  AFFICHE_A4: {
    id: "AFFICHE_A4",
    label: "Affiche A4 plastifiée",
    price: 19,
    description: "Affiche A4 plastifiée brillante, prête à afficher en vitrine",
    emoji: "🖼️",
    delai: "Impression 24h + expédition 3 jours",
  },
}

// ---------- Les 7 vrais problèmes des commerçants (Session 1) ----------

export const PROBLEMES: { id: string; label: string; emoji: string }[] = [
  { id: "formation_produits", label: "Manque de formation sur les produits", emoji: "📦" },
  { id: "impolitesse", label: "Impolitesse du personnel", emoji: "😠" },
  { id: "info_societe", label: "Manque d'information sur la société", emoji: "❓" },
  { id: "formation_generale", label: "Manque de formation générale", emoji: "🎓" },
  { id: "distraction", label: "Employés distraits (discussions entre eux)", emoji: "💬" },
  { id: "attente", label: "Attente trop longue (plats, service)", emoji: "⏳" },
  { id: "propriete", label: "Commerce mal rangé / sale", emoji: "🧹" },
]

// ---------- Tags du formulaire de scan (défauts à la création d'une zone) ----------

export type TagDef = { id: string; label: string; emoji: string }

export const POSITIVE_TAGS: TagDef[] = [
  { id: "accueillant", label: "Très accueillant", emoji: "😊" },
  { id: "rapide", label: "Ultra rapide", emoji: "⚡" },
  { id: "competent", label: "Super bien renseigné", emoji: "🎓" },
  { id: "pro", label: "Très professionnel", emoji: "🏆" },
]

export const NEGATIVE_TAGS: TagDef[] = [
  { id: "impoli", label: "Personnel impoli / Froid", emoji: "🟥" },
  { id: "mal_renseigne", label: "Mal renseigné sur les produits", emoji: "🟨" },
  { id: "attente", label: "Attente trop longue", emoji: "🟦" },
  { id: "distrait", label: "Personnel distrait / discussions entre eux", emoji: "💬" },
  { id: "mal_range", label: "Lieu mal rangé / sale", emoji: "🧹" },
  { id: "erreur", label: "Erreur / Problème technique", emoji: "🟧" },
]

export const ALL_TAGS: TagDef[] = [...POSITIVE_TAGS, ...NEGATIVE_TAGS]

// Mapping tag → catégorie (pour les statistiques)
export const TAG_CATEGORIES: Record<
  string,
  "Accueil" | "Rapidité" | "Compétence" | "Qualité" | "Attention" | "Propreté"
> = {
  accueillant: "Accueil",
  impoli: "Accueil",
  rapide: "Rapidité",
  attente: "Rapidité",
  competent: "Compétence",
  mal_renseigne: "Compétence",
  pro: "Qualité",
  erreur: "Qualité",
  distrait: "Attention",
  mal_range: "Propreté",
}

export function tagLabel(id: string): string {
  const t = ALL_TAGS.find((t) => t.id === id)
  return t ? `${t.emoji} ${t.label}` : id
}

// ---------- Types d'établissements (Session 1 : hotel, restaurant, boutique, salon, hopital...) ----------

export const TYPES_ETABLISSEMENT = [
  "Restaurant",
  "Hôtel",
  "Café",
  "Boulangerie",
  "Boutique",
  "Salon de coiffure",
  "Institut de beauté",
  "Garage automobile",
  "Hôpital / Clinique",
  "Autre",
]

/** Alias rétro-compatible (ancien nom utilisé dans quelques composants) */
export const CATEGORIES_COMMERCE = TYPES_ETABLISSEMENT

// ---------- Statuts libellés ----------

export const STATUT_RETOUR_LABEL: Record<string, string> = {
  NEW: "Nouveau",
  IN_PROGRESS: "En cours",
  RESOLVED: "Résolu",
}

export const STATUT_COMMANDE_LABEL: Record<string, string> = {
  A_IMPRIMER: "À imprimer",
  IMPRIME: "Imprimé",
  EXPEDIE: "Expédié",
  LIVRE: "Livré",
}

export const STATUT_COMMANDE_ORDRE = ["A_IMPRIMER", "IMPRIME", "EXPEDIE", "LIVRE"]

// ---------- Jours de la semaine (heatmap) ----------

export const JOURS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"]

// ---------- Contraintes de plans ----------

export const PLAN_LIMITS: Record<PlanId, { employes: number; zones: number }> = {
  STARTER: { employes: 2, zones: 3 },
  PRO: { employes: 15, zones: 15 },
  ENTERPRISE: { employes: 999, zones: 999 },
}
