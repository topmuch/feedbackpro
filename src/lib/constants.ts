// ============================================================
// FeedbackPro - Constantes métier partagées (client + serveur)
// ============================================================

// ---------- Plans d'abonnement ----------

export type PlanId = "STARTER" | "PRO" | "ENTERPRISE"

export const PLANS: Record<
  PlanId,
  {
    id: PlanId
    name: string
    price: number
    tagline: string
    features: string[]
    limites: { retours: string; employes: string; boutiques: string }
  }
> = {
  STARTER: {
    id: "STARTER",
    name: "Starter",
    price: 0, // Gratuit
    tagline: "Pour tester la magie des retours clients",
    features: [
      "1 boutique",
      "QR Code basique + téléchargements",
      "20 retours / mois",
      "Alertes WhatsApp",
      "Statistiques de base",
    ],
    limites: { retours: "20/mois", employes: "2", boutiques: "1" },
  },
  PRO: {
    id: "PRO",
    name: "Pro",
    price: 19,
    tagline: "Pour piloter la performance de vos équipes",
    features: [
      "Tout Starter, plus :",
      "Retours illimités",
      "QR personnalisé & supports imprimables",
      "Alertes WhatsApp instantanées",
      "Statistiques avancées + heatmap",
      "Équipe & leaderboard",
      "Export CSV",
    ],
    limites: { retours: "∞", employes: "10", boutiques: "1" },
  },
  ENTERPRISE: {
    id: "ENTERPRISE",
    name: "Enterprise",
    price: 79,
    tagline: "Pour les franchises et groupes multi-sites",
    features: [
      "Tout Pro, plus :",
      "Multi-boutiques illimitées",
      "Leaderboard multi-sites",
      "Employés illimités",
      "Rapports consolidés",
      "API & intégrations",
    ],
    limites: { retours: "∞", employes: "∞", boutiques: "∞" },
  },
}

/** Affiche le prix d'un plan : « Gratuit » si 0, sinon « 19 € » */
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

// ---------- Tags du formulaire de scan ----------

export type TagDef = { id: string; label: string; emoji: string }

export const POSITIVE_TAGS: TagDef[] = [
  { id: "accueillant", label: "Très accueillant", emoji: "😊" },
  { id: "rapide", label: "Ultra rapide", emoji: "⚡" },
  { id: "competent", label: "Super bien renseigné", emoji: "🎓" },
  { id: "pro", label: "Très professionnel", emoji: "🏆" },
]

export const NEGATIVE_TAGS: TagDef[] = [
  { id: "impoli", label: "Personnel impoli / Froid", emoji: "🟥" },
  { id: "mal_renseigne", label: "Mal renseigné", emoji: "🟨" },
  { id: "attente", label: "Attente trop longue", emoji: "🟦" },
  { id: "erreur", label: "Erreur / Problème technique", emoji: "🟧" },
]

export const ALL_TAGS: TagDef[] = [...POSITIVE_TAGS, ...NEGATIVE_TAGS]

// Mapping tag → catégorie (pour les statistiques)
export const TAG_CATEGORIES: Record<string, "Accueil" | "Rapidité" | "Compétence" | "Qualité"> = {
  accueillant: "Accueil",
  impoli: "Accueil",
  rapide: "Rapidité",
  attente: "Rapidité",
  competent: "Compétence",
  mal_renseigne: "Compétence",
  pro: "Qualité",
  erreur: "Qualité",
}

export function tagLabel(id: string): string {
  const t = ALL_TAGS.find((t) => t.id === id)
  return t ? `${t.emoji} ${t.label}` : id
}

// ---------- Catégories de commerces ----------

export const CATEGORIES_COMMERCE = [
  "Restaurant",
  "Pizzeria",
  "Bistro / Café",
  "Boulangerie",
  "Salon de coiffure",
  "Institut de beauté",
  "Boutique de vêtements",
  "Garage automobile",
  "Franchise",
  "Autre",
]

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

export const PLAN_LIMITS: Record<PlanId, { employes: number; boutiques: number }> = {
  STARTER: { employes: 2, boutiques: 1 },
  PRO: { employes: 10, boutiques: 1 },
  ENTERPRISE: { employes: 999, boutiques: 999 },
}
