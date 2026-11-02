// ============================================================
// FeedbackPro - Base de vérité sectorielle v2 (5 macro-secteurs)
// ------------------------------------------------------------
// Source de vérité des 5 macro-secteurs (RESTAURATION, HOTELLERIE,
// TRANSPORT_AEROPORT_GARE, SANTE_HOPITAL_CLINIQUE,
// ADMINISTRATION_ERP_PUBLIC). Chaque macro-secteur définit :
//   - 4 PILIERS (axes d'audit)
//   - 4 TAGS POSITIFS (id, label, pilier)
//   - 4 TAGS NÉGATIFS (id, label, pilier)
//
// + TAGS EMPLOYÉS TRANSVERSAUX (communs à tous les macro-secteurs)
//   avec leurs contextes d'application (TOUS = tous secteurs, sinon
//   liste de macros : "HOTELLERIE", "SANTE", "TRANSPORT"…).
//
// Ce fichier est utilisé :
//   - par prisma/seed-secteurs-v2.ts pour hydrater la BDD ;
//   - par /api/public/scan et /api/secteurs pour ENRICHIR les
//     réponses (les piliers et tagsEmployes sont lus depuis la BDD,
//     mais les labels/piliers des tags sectoriels sont résolus ici
//     car le SecteurConfig ne stocke que des IDs de tags) ;
//   - par le Coach IA (src/lib/ia.ts) pour interpréter les
//     mentions comportementales dans les retours.
// ============================================================

// ---------- Types ----------

export type MacroSecteurId =
  | "RESTAURATION"
  | "HOTELLERIE"
  | "TRANSPORT_AEROPORT_GARE"
  | "SANTE_HOPITAL_CLINIQUE"
  | "ADMINISTRATION_ERP_PUBLIC"

/** Tag sectoriel (positif ou négatif) rattaché à un pilier. */
export type TagSectoriel = {
  id: string
  label: string
  pilier: string
}

/** Définition complète d'un macro-secteur. */
export type MacroSecteur = {
  nom: MacroSecteurId
  piliers: string[]
  tagsPositifs: TagSectoriel[]
  tagsNegatifs: TagSectoriel[]
}

/** Tag employé transversal (positif ou négatif) avec ses contextes. */
export type TagEmployeTransversal = {
  id: string
  label: string
  /** "TOUS" = tous secteurs, sinon liste de macros courtes
   *  ("HOTELLERIE", "SANTE", "TRANSPORT", "RESTAURATION", "ADMINISTRATION"). */
  contextes: string[]
}

export type TagsEmployesTransversaux = {
  positifs: TagEmployeTransversal[]
  negatifs: TagEmployeTransversal[]
}

// ---------- Base de vérité (miroir du JSON fourni par le métier) ----------

export const MACRO_SECTEURS: MacroSecteur[] = [
  {
    nom: "RESTAURATION",
    piliers: ["Accueil & Service", "Rapidité & Flux", "Compétence & Info", "Produit & Qualité"],
    tagsPositifs: [
      { id: "acc_chaleureux", label: "😊 Très accueillant", pilier: "Accueil & Service" },
      { id: "srv_rapide", label: "⚡ Ultra rapide", pilier: "Rapidité & Flux" },
      { id: "info_pertinente", label: "🎓 Super bien renseigné", pilier: "Compétence & Info" },
      { id: "plat_excellent", label: "🍽️ Plat excellent", pilier: "Produit & Qualité" },
    ],
    tagsNegatifs: [
      { id: "acc_froid", label: "🧊 Accueil froid / désagréable", pilier: "Accueil & Service" },
      { id: "attente_longue", label: "🟦 Attente trop longue", pilier: "Rapidité & Flux" },
      { id: "pers_distrait", label: "💬 Personnel distrait / discussions", pilier: "Compétence & Info" },
      { id: "plat_tiede", label: "🥶 Plat tiède / erreur commande", pilier: "Produit & Qualité" },
    ],
  },
  {
    nom: "HOTELLERIE",
    piliers: ["Check-in & Accueil", "Chambre & Ménage", "Équipements & SPA", "Petit-Déj & Resto"],
    tagsPositifs: [
      { id: "checkin_perso", label: "😊 Accueil personnalisé", pilier: "Check-in & Accueil" },
      { id: "chambre_impec", label: "✨ Chambre impeccable", pilier: "Chambre & Ménage" },
      { id: "equip_top", label: "🏊 Équipements fonctionnels", pilier: "Équipements & SPA" },
      { id: "pdj_frais", label: "🥐 Produits frais & variés", pilier: "Petit-Déj & Resto" },
    ],
    tagsNegatifs: [
      { id: "checkin_robot", label: "🐌 Check-in lent / robotique", pilier: "Check-in & Accueil" },
      { id: "menage_bacle", label: "🧹 Ménage insuffisant", pilier: "Chambre & Ménage" },
      { id: "equip_hs", label: "🔧 Panne / non-fonctionnel", pilier: "Équipements & SPA" },
      { id: "buffet_froid", label: "🥶 Buffet froid / vide", pilier: "Petit-Déj & Resto" },
    ],
  },
  {
    nom: "TRANSPORT_AEROPORT_GARE",
    piliers: ["Orientation & Info", "Sécurité & Contrôle", "Rapidité & Flux", "Confort & Propreté"],
    tagsPositifs: [
      { id: "signal_claire", label: "🗺️ Signalisation claire", pilier: "Orientation & Info" },
      { id: "securite_fluide", label: "🛡️ Contrôle fluide / rassurant", pilier: "Sécurité & Contrôle" },
      { id: "flux_rapide", label: "⚡ Embarquement rapide", pilier: "Rapidité & Flux" },
      { id: "espace_propre", label: "🧹 Espace propre / confortable", pilier: "Confort & Propreté" },
    ],
    tagsNegatifs: [
      { id: "orient_difficile", label: "❓ Difficile de se repérer", pilier: "Orientation & Info" },
      { id: "stress_controle", label: "😰 Stressant / file interminable", pilier: "Sécurité & Contrôle" },
      { id: "attente_guichet", label: "🐌 Attente excessive guichet", pilier: "Rapidité & Flux" },
      { id: "sale_inconfort", label: "🪑 Sale / inconfortable / bruyant", pilier: "Confort & Propreté" },
    ],
  },
  {
    nom: "SANTE_HOPITAL_CLINIQUE",
    piliers: ["Accueil & Empathie", "Soins & Prise en charge", "Information & Communication", "Environnement & Hygiène"],
    tagsPositifs: [
      { id: "accueil_empathique", label: "🤗 Accueil empathique / rassurant", pilier: "Accueil & Empathie" },
      { id: "soins_competents", label: "💉 Soins compétents / doux", pilier: "Soins & Prise en charge" },
      { id: "explications_claires", label: "📋 Explications claires / pédagogiques", pilier: "Information & Communication" },
      { id: "env_apaisant", label: "🧼 Propre / calme / apaisant", pilier: "Environnement & Hygiène" },
    ],
    tagsNegatifs: [
      { id: "accueil_brusque", label: "😠 Accueil brusque / déshumanisé", pilier: "Accueil & Empathie" },
      { id: "attente_sans_info", label: "⏳ Attente longue sans info", pilier: "Soins & Prise en charge" },
      { id: "info_contradictoire", label: "🤷 Infos contradictoires / manquantes", pilier: "Information & Communication" },
      { id: "env_stressant", label: "🔊 Bruyant / sale / stressant", pilier: "Environnement & Hygiène" },
    ],
  },
  {
    nom: "ADMINISTRATION_ERP_PUBLIC",
    piliers: ["Accueil & Guichet", "Dossier & Procédure", "Délai & Réactivité", "Accessibilité & Confort"],
    tagsPositifs: [
      { id: "accueil_courtois", label: "😊 Accueil courtois / orienté", pilier: "Accueil & Guichet" },
      { id: "dossier_efficient", label: "📄 Dossier traité efficacement", pilier: "Dossier & Procédure" },
      { id: "delai_respecte", label: "⏱️ Délai respecté / rapide", pilier: "Délai & Réactivité" },
      { id: "accessible_pmr", label: "♿ Accessible PMR / confortable", pilier: "Accessibilité & Confort" },
    ],
    tagsNegatifs: [
      { id: "accueil_sec", label: "😠 Accueil sec / décourageant", pilier: "Accueil & Guichet" },
      { id: "proced_complexe", label: "🤯 Procédure incompréhensible", pilier: "Dossier & Procédure" },
      { id: "delai_non_respecte", label: "🐌 Délai non-respecté / sans info", pilier: "Délai & Réactivité" },
      { id: "inaccessible", label: "🚫 Inaccessible / inconfortable", pilier: "Accessibilité & Confort" },
    ],
  },
]

export const TAGS_EMPLOYES_TRANSVERSAUX: TagsEmployesTransversaux = {
  positifs: [
    { id: "emp_empathique", label: "À l'écoute / humain", contextes: ["HOTELLERIE", "SANTE"] },
    { id: "emp_pedagogue", label: "Explications claires / patient", contextes: ["ADMINISTRATION", "SANTE"] },
    { id: "emp_pro", label: "Posture professionnelle / souriant", contextes: ["TRANSPORT", "RESTAURATION"] },
    { id: "emp_reactif", label: "Réactif / proactif", contextes: ["TOUS"] },
  ],
  negatifs: [
    { id: "emp_froid", label: "Froid / distant / cassant", contextes: ["TOUS"] },
    { id: "emp_distrait", label: "Distrait / téléphone / bavardages", contextes: ["TOUS"] },
    { id: "emp_incompetent", label: "Mal informé / hésitant", contextes: ["RESTAURATION", "ADMINISTRATION"] },
    { id: "emp_dehumanise", label: "Déshumanisant / brusque", contextes: ["SANTE", "TRANSPORT"] },
  ],
}

// ---------- Mapping macro-secteur → secteurs BDD (15 fiches) ----------

/**
 * Associe chaque macro-secteur aux fiches SecteurConfig existantes
 * (par leur `nom` unique en BDD). Plusieurs fiches peuvent partager
 * un même macro-secteur : elles reçoivent alors les mêmes piliers et
 * les mêmes tags sectoriels.
 */
export const MACRO_SECTEUR_VERS_SECTEURS_BDD: Record<MacroSecteurId, string[]> = {
  RESTAURATION: ["Restaurant", "Fast Food", "Café / Bar", "Boulangerie / Pâtisserie"],
  HOTELLERIE: ["Hôtel"],
  TRANSPORT_AEROPORT_GARE: ["Aéroport", "Gare / Station"],
  SANTE_HOPITAL_CLINIQUE: ["Hôpital / Clinique"],
  ADMINISTRATION_ERP_PUBLIC: ["Mairie / Administration", "Entreprise (accueil public)"],
}

/**
 * Mapping inverse : nom de secteur BDD → macro-secteur. Pour les
 * secteurs non couverts par la base v2 (Boutique, Salon, Institut,
 * Garage, Autre), renvoie null (le seed dépose alors des piliers
 * génériques et les tags employés "TOUS").
 */
export const SECTEUR_BDD_VERS_MACRO: Record<string, MacroSecteurId | undefined> = (() => {
  const map: Record<string, MacroSecteurId> = {}
  for (const [macro, secteurs] of Object.entries(MACRO_SECTEUR_VERS_SECTEURS_BDD)) {
    for (const s of secteurs) map[s] = macro as MacroSecteurId
  }
  return map
})()

/** Renvoie le macro-secteur d'un secteur BDD (ou null si non couvert). */
export function macroSecteurPourSecteur(nomSecteur: string): MacroSecteur | null {
  const macroId = SECTEUR_BDD_VERS_MACRO[nomSecteur]
  if (!macroId) return null
  return MACRO_SECTEURS.find((m) => m.nom === macroId) ?? null
}

// ---------- Helpers de résolution des tags sectoriels ----------

/**
 * Renvoie le tag sectoriel (positif ou négatif) correspondant à un
 * id, pour un macro-secteur donné. Permet à l'API scan de résoudre
 * le label et le pilier d'un id stocké en BDD.
 */
export function trouverTagSectoriel(
  macroId: MacroSecteurId,
  tagId: string,
  positif: boolean
): TagSectoriel | null {
  const macro = MACRO_SECTEURS.find((m) => m.nom === macroId)
  if (!macro) return null
  const liste = positif ? macro.tagsPositifs : macro.tagsNegatifs
  return liste.find((t) => t.id === tagId) ?? null
}

/**
 * Renvoie le pilier d'un tag sectoriel à partir de son id (recherche
 * across tous les macro-secteurs). Utile quand on n'a que l'id du tag
 * sans connaître le macro-secteur (ex : agrégation côté Coach IA).
 */
export function pilierPourTag(tagId: string): string | null {
  for (const macro of MACRO_SECTEURS) {
    const positif = macro.tagsPositifs.find((t) => t.id === tagId)
    if (positif) return positif.pilier
    const negatif = macro.tagsNegatifs.find((t) => t.id === tagId)
    if (negatif) return negatif.pilier
  }
  return null
}

/**
 * Renvoie le label d'un tag sectoriel à partir de son id (recherche
 * across tous les macro-secteurs). Retombe sur l'id brut si non trouvé.
 */
export function labelPourTagSectoriel(tagId: string): string {
  for (const macro of MACRO_SECTEURS) {
    const positif = macro.tagsPositifs.find((t) => t.id === tagId)
    if (positif) return positif.label
    const negatif = macro.tagsNegatifs.find((t) => t.id === tagId)
    if (negatif) return negatif.label
  }
  // Tags employés transversaux
  for (const t of TAGS_EMPLOYES_TRANSVERSAUX.positifs) {
    if (t.id === tagId) return t.label
  }
  for (const t of TAGS_EMPLOYES_TRANSVERSAUX.negatifs) {
    if (t.id === tagId) return t.label
  }
  return tagId
}

// ---------- Helpers de filtrage des tags employés ----------

/**
 * "Code macro court" utilisé dans les contextes des tags employés :
 * "HOTELLERIE", "SANTE", "TRANSPORT", "RESTAURATION", "ADMINISTRATION",
 * ou "TOUS". Convertit un MacroSecteurId vers ce code court.
 */
export function codeMacroCourt(macroId: MacroSecteurId): string {
  switch (macroId) {
    case "RESTAURATION":
      return "RESTAURATION"
    case "HOTELLERIE":
      return "HOTELLERIE"
    case "TRANSPORT_AEROPORT_GARE":
      return "TRANSPORT"
    case "SANTE_HOPITAL_CLINIQUE":
      return "SANTE"
    case "ADMINISTRATION_ERP_PUBLIC":
      return "ADMINISTRATION"
  }
}

/**
 * Filtre les tags employés transversaux par contexte du secteur.
 * Un tag avec "TOUS" s'applique à tous les secteurs ; sinon il ne
 * s'applique qu'aux macros listées dans ses contextes.
 */
export function tagsEmployesPourMacro(macroId: MacroSecteurId | null): TagsEmployesTransversaux {
  if (!macroId) {
    // Secteur non couvert par la base v2 (Boutique, Salon…) :
    // on ne renvoie QUE les tags "TOUS".
    return {
      positifs: TAGS_EMPLOYES_TRANSVERSAUX.positifs.filter((t) => t.contextes.includes("TOUS")),
      negatifs: TAGS_EMPLOYES_TRANSVERSAUX.negatifs.filter((t) => t.contextes.includes("TOUS")),
    }
  }
  const code = codeMacroCourt(macroId)
  return {
    positifs: TAGS_EMPLOYES_TRANSVERSAUX.positifs.filter(
      (t) => t.contextes.includes("TOUS") || t.contextes.includes(code)
    ),
    negatifs: TAGS_EMPLOYES_TRANSVERSAUX.negatifs.filter(
      (t) => t.contextes.includes("TOUS") || t.contextes.includes(code)
    ),
  }
}

// ---------- Piliers génériques (pour les secteurs non couverts) ----------

export const PILIERS_GENERIQUES: string[] = [
  "Accueil & Service",
  "Rapidité & Flux",
  "Compétence & Info",
  "Propreté & Confort",
]

// ---------- Helpers de groupage par pilier (côté serveur) ----------

/** Forme d'un tag enrichi pour l'UI scan-view (id + label + pilier). */
export type TagEnrichi = {
  id: string
  label: string
  pilier: string
}

/**
 * Enrichit une liste d'IDs de tags avec leur label et pilier, pour un
 * macro-secteur donné. Les IDs non reconnus sont filtrés (ils ne
 * proviennent pas de la base v2 — tags anciens ou personnalisés).
 */
export function enrichirTags(
  ids: string[],
  macroId: MacroSecteurId | null
): TagEnrichi[] {
  const macro = macroId ? MACRO_SECTEURS.find((m) => m.nom === macroId) : null
  if (!macro) return []
  const tous = [...macro.tagsPositifs, ...macro.tagsNegatifs]
  const out: TagEnrichi[] = []
  for (const id of ids) {
    const def = tous.find((t) => t.id === id)
    if (def) out.push({ id: def.id, label: def.label, pilier: def.pilier })
  }
  return out
}

/**
 * Groupe une liste de tags enrichis par pilier, en respectant l'ordre
 * des piliers défini dans le macro-secteur. Les piliers sans tag ne
 * sont pas inclus.
 */
export function grouperTagsParPilier(
  tags: TagEnrichi[],
  macroId: MacroSecteurId | null
): { pilier: string; tags: TagEnrichi[] }[] {
  const macro = macroId ? MACRO_SECTEURS.find((m) => m.nom === macroId) : null
  const ordrePiliers = macro?.piliers ?? []
  const parPilier = new Map<string, TagEnrichi[]>()
  for (const t of tags) {
    const liste = parPilier.get(t.pilier) ?? []
    liste.push(t)
    parPilier.set(t.pilier, liste)
  }
  // Tri selon l'ordre des piliers du macro-secteur ; les piliers
  // inconnus (théoriquement absents) sont placés à la fin.
  return [...parPilier.entries()]
    .sort((a, b) => {
      const ia = ordrePiliers.indexOf(a[0])
      const ib = ordrePiliers.indexOf(b[0])
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib)
    })
    .map(([pilier, list]) => ({ pilier, tags: list }))
}
