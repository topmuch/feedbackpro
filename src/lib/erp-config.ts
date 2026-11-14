// ============================================================
// FeedbackPro — Configuration statique des zones ERP
// ------------------------------------------------------------
// ERP = Établissement Recevant du Public (administration,
// mairie, préfecture, CAF, CPAM, service des impôts, Pôle
// Emploi, etc.). Source de vérité pour les 12 zones ERP et
// leurs problématiques prédéfinies (boutons rapides). Le seed
// prisma/seed-all-sectors.ts lit cette config et l'injecte en BDD.
//
// Un tag URL (ex: "erp_accueil_1") est scanné via QR code,
// résolu en ErpZone via la propriété `tags`.
//
// 12 zones réparties en familles fonctionnelles :
//   - FLUX          (accueil/guichet, salle d'attente, info point)
//   - BUREAUX       (bureaux services publics, salles réunion)
//   - SELF-SERVICE  (bornes interactives)
//   - CIRCULATION   (couloirs, ascenseurs, sanitaires)
//   - LOGISTIQUE    (resto, parking, sécurité/contrôle)
// ============================================================

export type ErpZoneConfig = {
  /** Code métier lisible, clé unique en BDD. */
  code: string
  /** Nom affiché en gros en haut de l'écran de l'usager */
  nom: string
  /** Emoji illustrant la zone */
  emoji: string
  /** Description courte optionnelle */
  description?: string
  /** Tags URL acceptés pour cette zone (lus depuis l'URL ?erp=<tag>) */
  tags: string[]
  /** Les problématiques prédéfinies (boutons rapides) — 4 par zone. */
  problemes: string[]
}

export const ERP_ZONES: ErpZoneConfig[] = [
  // ===========================================================
  // FLUX (3)
  // ===========================================================
  {
    code: 'erp_accueil',
    nom: 'Accueil / Guichet',
    emoji: '🏛️',
    tags: ['erp_accueil_1', 'erp_accueil_2', 'erp_guichet_1'],
    problemes: ['File trop longue', 'Guichet fermé', 'Personnel désagréable', 'Info absente'],
  },
  {
    code: 'erp_attente',
    nom: 'Salle d’attente',
    emoji: '🪑',
    tags: ['erp_attente_1', 'erp_attente_2', 'erp_salle_attente_1'],
    problemes: ['Places insuffisantes', 'Clim HS', 'Propreté insuffisante', 'Bruit excessif'],
  },
  {
    code: 'erp_info',
    nom: 'Info point / Kiosque',
    emoji: 'ℹ️',
    tags: ['erp_info_1', 'erp_info_2', 'erp_kiosque_1'],
    problemes: ['Borne HS', 'Info erronée', 'Écran cassé', 'Non accessible PMR'],
  },

  // ===========================================================
  // BUREAUX (2)
  // ===========================================================
  {
    code: 'erp_bureau',
    nom: 'Bureaux (services publics)',
    emoji: '📋',
    tags: ['erp_bureau_1', 'erp_bureau_2', 'erp_bureau_etage_1'],
    problemes: ['Personnel absent', 'Attente excessive', 'Dossier bloqué', 'Système en panne'],
  },
  {
    code: 'erp_salle',
    nom: 'Salles de réunion / Auditorium',
    emoji: '🎭',
    tags: ['erp_salle_1', 'erp_salle_2', 'erp_auditorium_1'],
    problemes: ['Clim HS', 'Équipement audiovisuel HS', 'Places insuffisantes', 'Propreté insuffisante'],
  },

  // ===========================================================
  // SELF-SERVICE (1)
  // ===========================================================
  {
    code: 'erp_borne',
    nom: 'Bornes interactives',
    emoji: '🖥️',
    tags: ['erp_borne_1', 'erp_borne_2', 'erp_borne_interactive_1'],
    problemes: ['Borne HS', 'Écran cassé', 'Logiciel en panne', 'Non accessible PMR'],
  },

  // ===========================================================
  // CIRCULATION (3)
  // ===========================================================
  {
    code: 'erp_sanitaires',
    nom: 'Sanitaires',
    emoji: '🚻',
    tags: ['erp_wc_1', 'erp_wc_2', 'erp_wc_hall_1'],
    problemes: ['Papier manquant', 'Sol mouillé', 'Odeur', 'Propreté insuffisante'],
  },
  {
    code: 'erp_couloir',
    nom: 'Couloirs / Hall',
    emoji: '🚶',
    tags: ['erp_couloir_1', 'erp_couloir_2', 'erp_hall_1'],
    problemes: ['Éclairage HS', 'Propreté insuffisante', 'Encombrement', 'Accessibilité PMR'],
  },
  {
    code: 'erp_ascenseur',
    nom: 'Ascenseurs',
    emoji: '🛗',
    tags: ['erp_ascenseur_1', 'erp_ascenseur_2', 'erp_elevator_1'],
    problemes: ['En panne', 'Lent', 'Propreté insuffisante', 'Sécurité insuffisante'],
  },

  // ===========================================================
  // LOGISTIQUE (3)
  // ===========================================================
  {
    code: 'erp_resto',
    nom: 'Restauration / Cafétéria',
    emoji: '☕',
    tags: ['erp_resto_1', 'erp_resto_2', 'erp_cafeteria_1'],
    problemes: ['Service lent', 'Produit indisponible', 'Table sale', 'Prix abusif'],
  },
  {
    code: 'erp_parking',
    nom: 'Parking',
    emoji: '🅿️',
    tags: ['erp_parking_1', 'erp_parking_2', 'erp_parking_entree'],
    problemes: ['Place introuvable', 'Barrière HS', 'Éclairage HS', 'Insécurité'],
  },
  {
    code: 'erp_securite',
    nom: 'Sécurité / Contrôle d’accès',
    emoji: '🛡️',
    tags: ['erp_securite_1', 'erp_securite_2', 'erp_controle_1'],
    problemes: ['Agent absent', 'Détecteur HS', 'File excessive', 'Info absente'],
  },
]

/**
 * Mapping émoji par problématique ERP (pour l'affichage PWA usager).
 */
export const ERP_PROBLEM_EMOJIS: Record<string, string> = {
  // Accueil
  'File trop longue': '⏳',
  'Guichet fermé': '🔒',
  'Personnel désagréable': '😠',
  'Info absente': 'ℹ️',
  // Attente
  'Places insuffisantes': '🪑',
  'Clim HS': '🌡️',
  'Propreté insuffisante': '🧹',
  'Bruit excessif': '🔊',
  // Info point / Borne
  'Borne HS': '🖥️',
  'Info erronée': 'ℹ️',
  'Écran cassé': '📺',
  'Non accessible PMR': '♿',
  'Logiciel en panne': '💻',
  // Bureau
  'Personnel absent': '🙅',
  'Attente excessive': '⏳',
  'Dossier bloqué': '📁',
  'Système en panne': '💻',
  // Salle
  'Équipement audiovisuel HS': '📽️',
  // Sanitaires
  'Papier manquant': '🧻',
  'Sol mouillé': '💧',
  'Odeur': '🤢',
  // Couloir
  'Éclairage HS': '💡',
  'Encombrement': '📦',
  'Accessibilité PMR': '♿',
  // Ascenseur
  'En panne': '🛑',
  'Lent': '🐌',
  'Sécurité insuffisante': '🛡️',
  // Resto
  'Service lent': '🐌',
  'Produit indisponible': '📦',
  'Table sale': '🍽️',
  'Prix abusif': '💸',
  // Parking
  'Place introuvable': '🔍',
  'Barrière HS': '🚧',
  'Insécurité': '🚨',
  // Sécurité
  'Agent absent': '🙅',
  'Détecteur HS': '🛂',
  'File excessive': '👥',
}

/** Retourne l'émoji associé à une problématique ERP, ou un émoji générique */
export function getErpProblemEmoji(problem: string): string {
  return ERP_PROBLEM_EMOJIS[problem] ?? '⚠️'
}

/** Résout un tag URL scanné vers la zone ERP correspondante. */
export function resoudreErpZoneParTag(tag: string): ErpZoneConfig | null {
  const normalise = tag.trim().toLowerCase()
  if (!normalise) return null
  for (const z of ERP_ZONES) {
    if (z.tags.some((t) => t.toLowerCase() === normalise)) return z
  }
  return null
}

/** Récupère une zone ERP par son code métier. */
export function getErpZoneParCode(code: string): ErpZoneConfig | null {
  return ERP_ZONES.find((z) => z.code === code) ?? null
}
