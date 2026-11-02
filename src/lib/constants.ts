// ============================================================
// FeedbackPro - Constantes métier partagées (client + serveur)
// Conforme Session 1 : "Le Coach IA d'Audit Qualité Continu"
// ============================================================

import { labelPourTagSectoriel } from "@/lib/secteurs-v2"

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

// Tags génériques (catalogue de base, toutes zones)
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

// ---------- Tags CONTEXTUELS par type de zone (Session 3) ----------
// Chaque QR de zone propose des tags adaptés à son contexte :
// le QR des Toilettes ne demande pas la même chose que celui du Restaurant.

// Propreté / entretien (toilettes, piscine, spa, plages…)
export const POSITIVE_TAGS_PROPRIETE: TagDef[] = [
  { id: "propre", label: "Propre", emoji: "✨" },
  { id: "bien_approvisionne", label: "Bien approvisionné", emoji: "🧻" },
  { id: "odeur_agreable", label: "Odeur agréable", emoji: "🌸" },
]
export const NEGATIVE_TAGS_PROPRIETE: TagDef[] = [
  { id: "sale", label: "Sale", emoji: "🟫" },
  { id: "manque_papier", label: "Manque de papier", emoji: "🧻" },
  { id: "odeur_desagreable", label: "Odeur désagréable", emoji: "🤢" },
]

// Restauration (restaurant, salle, cuisine, bar…)
export const POSITIVE_TAGS_RESTAURATION: TagDef[] = [
  { id: "plat_excellent", label: "Plat excellent", emoji: "🍽️" },
  { id: "service_rapide_repas", label: "Service rapide", emoji: "⚡" },
  { id: "serveur_accueillant", label: "Serveur accueillant", emoji: "😊" },
]
export const NEGATIVE_TAGS_RESTAURATION: TagDef[] = [
  { id: "service_lent", label: "Service lent", emoji: "🐌" },
  { id: "plat_tiede", label: "Plat tiède", emoji: "🥶" },
  { id: "personnel_impoli_repas", label: "Personnel impoli", emoji: "🟥" },
]

// Accueil / réception (check-in, comptoir, boutique…)
export const POSITIVE_TAGS_ACCUEIL: TagDef[] = [
  { id: "accueil_chaleureux", label: "Accueil chaleureux", emoji: "🤗" },
  { id: "prise_en_charge_rapide", label: "Prise en charge rapide", emoji: "🚀" },
  { id: "bien_renseigne_accueil", label: "Personnel bien renseigné", emoji: "💡" },
]
export const NEGATIVE_TAGS_ACCUEIL: TagDef[] = [
  { id: "accueil_froid", label: "Accueil froid / désagréable", emoji: "🧊" },
  { id: "attente_accueil", label: "Attente trop longue", emoji: "⏳" },
  { id: "personnel_distrait_accueil", label: "Personnel distrait", emoji: "💬" },
]

/**
 * Presets de tags par CONTEXTE de zone (Session 3).
 * Le nom de la zone est analysé par mots-clés pour proposer
 * automatiquement les tags les plus pertinents à la création.
 */
export const PRESETS_TAGS_ZONE: {
  id: string
  label: string
  motsCles: string[]
  positifs: TagDef[]
  negatifs: TagDef[]
}[] = [
  {
    id: "toilettes",
    label: "Toilettes / Sanitaires",
    motsCles: ["toilette", "toilettes", "wc", "sanitaire", "douch", "vestiaire"],
    positifs: POSITIVE_TAGS_PROPRIETE,
    negatifs: NEGATIVE_TAGS_PROPRIETE,
  },
  {
    id: "entretien",
    label: "Piscine / Spa / Espace bien-être",
    motsCles: ["piscine", "spa", "hammam", "sauna", "jacuzzi", "salle de sport", "fitness"],
    positifs: POSITIVE_TAGS_PROPRIETE,
    negatifs: NEGATIVE_TAGS_PROPRIETE,
  },
  {
    id: "restauration",
    label: "Restaurant / Salle / Bar",
    motsCles: ["restaurant", "salle", "cuisine", "bar", "terrasse", "pizzeria", "brasserie", "cafeteria", "cafété"],
    positifs: POSITIVE_TAGS_RESTAURATION,
    negatifs: NEGATIVE_TAGS_RESTAURATION,
  },
  {
    id: "accueil",
    label: "Accueil / Réception / Comptoir",
    motsCles: ["accueil", "réception", "reception", "check-in", "checkin", "comptoir", "caisse", "boutique", "entrée"],
    positifs: POSITIVE_TAGS_ACCUEIL,
    negatifs: NEGATIVE_TAGS_ACCUEIL,
  },
]

/**
 * Détecte le preset adapté au nom d'une zone (ex. « Toilettes RDC » → propreté).
 * Retourne null si aucun contexte ne ressort (→ catalogue générique).
 */
export function presetPourZone(nomZone: string) {
  const nom = nomZone
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
  if (!nom.trim()) return null
  return PRESETS_TAGS_ZONE.find((p) => p.motsCles.some((m) => nom.includes(m))) ?? null
}

/**
 * Catalogue ÉLARGI pour le sélecteur de tags de l'onglet Zones :
 * tags génériques + tags contextuels (aucun doublon d'id).
 */
export const POSITIVE_TAGS_ETENDUS: TagDef[] = [
  ...POSITIVE_TAGS,
  ...POSITIVE_TAGS_PROPRIETE,
  ...POSITIVE_TAGS_RESTAURATION,
  ...POSITIVE_TAGS_ACCUEIL,
]
export const NEGATIVE_TAGS_ETENDUS: TagDef[] = [
  ...NEGATIVE_TAGS,
  ...NEGATIVE_TAGS_PROPRIETE,
  ...NEGATIVE_TAGS_RESTAURATION,
  ...NEGATIVE_TAGS_ACCUEIL,
]

export const ALL_TAGS: TagDef[] = [...POSITIVE_TAGS_ETENDUS, ...NEGATIVE_TAGS_ETENDUS]

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
  // Tags contextuels (Session 3)
  propre: "Propreté",
  bien_approvisionne: "Qualité",
  odeur_agreable: "Propreté",
  sale: "Propreté",
  manque_papier: "Propreté",
  odeur_desagreable: "Propreté",
  plat_excellent: "Qualité",
  service_rapide_repas: "Rapidité",
  serveur_accueillant: "Accueil",
  service_lent: "Rapidité",
  plat_tiede: "Qualité",
  personnel_impoli_repas: "Accueil",
  accueil_chaleureux: "Accueil",
  prise_en_charge_rapide: "Rapidité",
  bien_renseigne_accueil: "Compétence",
  accueil_froid: "Accueil",
  attente_accueil: "Rapidité",
  personnel_distrait_accueil: "Attention",
}

export function tagLabel(id: string): string {
  // v2 — On consulte d'abord le catalogue sectoriel v2 (5 macro-secteurs +
  // tags employés transversaux) qui contient les labels complets avec emoji
  // (ex : "😊 Très accueillant" pour acc_chaleureux, "À l'écoute / humain"
  // pour emp_empathique). Si l'id n'est pas dans le catalogue v2, on retombe
  // sur le catalogue historique ALL_TAGS.
  const labelV2 = labelPourTagSectoriel(id)
  if (labelV2 !== id) return labelV2
  const t = ALL_TAGS.find((t) => t.id === id)
  return t ? `${t.emoji} ${t.label}` : id
}

// ---------- Types d'établissements (multisectoriel — Task 2) ----------
// Couvre restauration, hébergement, transport, santé, administration, etc.
// Chaque entrée a une fiche détaillée dans src/lib/secteurs.ts (zones par défaut,
// tags positifs/négatifs, emoji, description).

export const TYPES_ETABLISSEMENT = [
  "Restaurant",
  "Fast Food",
  "Hôtel",
  "Café / Bar",
  "Boulangerie / Pâtisserie",
  "Boutique / Commerce",
  "Salon de coiffure",
  "Institut de beauté / Spa",
  "Garage automobile",
  "Hôpital / Clinique",
  "Aéroport",
  "Gare / Station",
  "Entreprise (accueil public)",
  "Mairie / Administration",
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
