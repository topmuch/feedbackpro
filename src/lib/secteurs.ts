// ============================================================
// FeedbackPro - Configuration multisectorielle (Task 2)
// ------------------------------------------------------------
// Chaque type d'établissement a une fiche :
//   - zonesParDefaut : noms des zones pré-remplies à l'inscription
//   - tagsPositifs   : ids de tags positifs proposés par défaut sur chaque zone
//   - tagsNegatifs   : ids de tags négatifs proposés par défaut sur chaque zone
//   - emoji          : visuel de la carte de sélection (wizard d'inscription)
//   - description    : sous-titre affiché sous le nom du secteur
//
// Les ids de tags proviennent du catalogue src/lib/constants.ts (ALL_TAGS).
// Utilisé côté client (wizard d'inscription + settings) ET côté serveur
// (création des zones à l'inscription avec leurs tags par défaut).
// ============================================================

export type SecteurConfig = {
  zonesParDefaut: string[]
  tagsPositifs: string[]
  tagsNegatifs: string[]
  emoji: string
  description: string
}

export const SECTEUR_CONFIG: Record<string, SecteurConfig> = {
  Restaurant: {
    zonesParDefaut: ["Accueil", "Salle", "Toilettes"],
    tagsPositifs: ["plat_excellent", "service_rapide_repas", "serveur_accueillant"],
    tagsNegatifs: ["service_lent", "plat_tiede", "personnel_impoli_repas"],
    emoji: "🍽️",
    description: "Restaurant de table, bistrot, brasserie",
  },
  "Fast Food": {
    zonesParDefaut: ["Commande", "Retrait", "Salle"],
    tagsPositifs: ["rapide", "plat_excellent", "service_rapide_repas"],
    tagsNegatifs: ["attente", "erreur", "service_lent"],
    emoji: "🍔",
    description: "Restauration rapide, drive, takeaway",
  },
  Hôtel: {
    zonesParDefaut: ["Réception", "Chambre", "Petit-déjeuner"],
    tagsPositifs: ["accueillant", "propre", "competent"],
    tagsNegatifs: ["accueil_froid", "sale", "mal_range"],
    emoji: "🏨",
    description: "Hôtel, résidence, chambre d'hôtes",
  },
  "Café / Bar": {
    zonesParDefaut: ["Comptoir", "Salle", "Terrasse"],
    tagsPositifs: ["serveur_accueillant", "plat_excellent", "accueil_chaleureux"],
    tagsNegatifs: ["service_lent", "attente_accueil", "personnel_impoli_repas"],
    emoji: "☕",
    description: "Café, bar, salon de thé",
  },
  "Boulangerie / Pâtisserie": {
    zonesParDefaut: ["Accueil", "Vente à emporter"],
    tagsPositifs: ["rapide", "competent", "plat_excellent"],
    tagsNegatifs: ["attente", "mal_renseigne", "erreur"],
    emoji: "🥐",
    description: "Boulangerie, pâtisserie, viennoiserie",
  },
  "Boutique / Commerce": {
    zonesParDefaut: ["Accueil", "Caisse", "Vitrine"],
    tagsPositifs: ["accueillant", "competent", "pro"],
    tagsNegatifs: ["accueil_froid", "mal_renseigne", "distrait"],
    emoji: "🛍️",
    description: "Boutique, magasin, commerce de détail",
  },
  "Salon de coiffure": {
    zonesParDefaut: ["Accueil", "Station de travail"],
    tagsPositifs: ["competent", "pro", "accueillant"],
    tagsNegatifs: ["mal_renseigne", "attente", "distrait"],
    emoji: "💇",
    description: "Salon de coiffure, barbier",
  },
  "Institut de beauté / Spa": {
    zonesParDefaut: ["Accueil", "Cabine de soin"],
    tagsPositifs: ["accueillant", "propre", "competent"],
    tagsNegatifs: ["accueil_froid", "sale", "mal_renseigne"],
    emoji: "💅",
    description: "Institut, spa, esthétique",
  },
  "Garage automobile": {
    zonesParDefaut: ["Accueil", "Atelier"],
    tagsPositifs: ["competent", "pro", "rapide"],
    tagsNegatifs: ["mal_renseigne", "attente", "erreur"],
    emoji: "🔧",
    description: "Garage, concession, réparation auto",
  },
  "Hôpital / Clinique": {
    zonesParDefaut: ["Accueil", "Salle d'attente", "Sanitaires"],
    tagsPositifs: ["accueillant", "propre", "competent"],
    tagsNegatifs: ["attente", "accueil_froid", "sale"],
    emoji: "🏥",
    description: "Hôpital, clinique, cabinet médical",
  },
  Aéroport: {
    zonesParDefaut: ["Check-in", "Sécurité", "Embarquement"],
    tagsPositifs: ["rapide", "competent", "propre"],
    tagsNegatifs: ["attente", "mal_renseigne", "distrait"],
    emoji: "✈️",
    description: "Aéroport, terminal, porte d'embarquement",
  },
  "Gare / Station": {
    zonesParDefaut: ["Accueil", "Quai", "Toilettes"],
    tagsPositifs: ["propre", "rapide", "competent"],
    tagsNegatifs: ["sale", "attente", "mal_renseigne"],
    emoji: "🚉",
    description: "Gare, station de transport",
  },
  "Entreprise (accueil public)": {
    zonesParDefaut: ["Accueil", "Salle d'attente", "Sanitaires"],
    tagsPositifs: ["accueillant", "competent", "pro"],
    tagsNegatifs: ["accueil_froid", "attente", "mal_renseigne"],
    emoji: "🏢",
    description: "Entreprise recevant du public, banque, assurance",
  },
  "Mairie / Administration": {
    zonesParDefaut: ["Accueil", "Guichet", "Salle d'attente"],
    tagsPositifs: ["competent", "accueillant", "pro"],
    tagsNegatifs: ["attente", "mal_renseigne", "accueil_froid"],
    emoji: "🏛️",
    description: "Mairie, service public, administration",
  },
  Autre: {
    zonesParDefaut: ["Accueil"],
    tagsPositifs: ["accueillant", "competent", "pro"],
    tagsNegatifs: ["impoli", "attente", "mal_renseigne"],
    emoji: "📍",
    description: "Autre type d'établissement",
  },
}

/**
 * Récupère la fiche secteur (toujours définie — repli sur « Autre » si le
 * type passé n'est pas dans SECTEUR_CONFIG, par robustesse face aux données
 * anciennes ou aux saisies libres).
 */
export function configSecteur(typeEtablissement: string): SecteurConfig {
  return SECTEUR_CONFIG[typeEtablissement] ?? SECTEUR_CONFIG.Autre
}
