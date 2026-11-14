// ============================================================
// FeedbackPro — Configuration statique des zones gare
// ------------------------------------------------------------
// Source de vérité pour les 12 zones gare (routière + maritime)
// et leurs problématiques prédéfinies (boutons rapides). Le seed
// prisma/seed-all-sectors.ts lit cette config et l'injecte en BDD.
//
// Un tag URL (ex: "gar_hall_1") est scanné via QR code, résolu
// en GareZone via la propriété `tags`.
//
// 12 zones réparties en familles fonctionnelles :
//   - FLUX        (hall, billeterie, info voyageurs)
//   - EMBARQUEMENT (quai bus, quai bateau, salle d'attente)
//   - SERVICES    (sanitaires, resto, boutiques, consignes)
//   - LOGISTIQUE  (parking/dépose-minute, accessibilité PMR)
// ============================================================

export type GareZoneConfig = {
  /** Code métier lisible, clé unique en BDD. */
  code: string
  /** Nom affiché en gros en haut de l'écran du voyageur */
  nom: string
  /** Emoji illustrant la zone */
  emoji: string
  /** Description courte optionnelle */
  description?: string
  /** Tags URL acceptés pour cette zone (lus depuis l'URL ?gare=<tag>) */
  tags: string[]
  /** Les problématiques prédéfinies (boutons rapides) — 4 par zone. */
  problemes: string[]
}

export const GARE_ZONES: GareZoneConfig[] = [
  // ===========================================================
  // FLUX (3)
  // ===========================================================
  {
    code: 'gar_hall',
    nom: 'Hall principal',
    emoji: '🏛️',
    tags: ['gar_hall_1', 'gar_hall_2', 'gar_hall_entree'],
    problemes: ['Clim ou chauffage HS', 'Propreté insuffisante', 'Info absente', 'Surpeuplé'],
  },
  {
    code: 'gar_billeterie',
    nom: 'Guichets / Billéterie',
    emoji: '🎫',
    tags: ['gar_guichet_1', 'gar_guichet_2', 'gar_billeterie_1'],
    problemes: ['Guichet fermé', 'Attente excessive', 'Personnel désagréable', 'Système en panne'],
  },
  {
    code: 'gar_info',
    nom: 'Info voyageurs',
    emoji: '📺',
    tags: ['gar_info_1', 'gar_info_2', 'gar_ecran_info_1'],
    problemes: ['Info erronée ou absente', 'Écran HS', 'Annonce inaudible', 'Retard non annoncé'],
  },

  // ===========================================================
  // EMBARQUEMENT (3)
  // ===========================================================
  {
    code: 'gar_quai_bus',
    nom: 'Quais embarquement bus',
    emoji: '🚌',
    tags: ['gar_quai_bus_1', 'gar_quai_bus_2', 'gar_quai_a', 'gar_quai_b'],
    problemes: ['Quai saturé', 'Bus retardé', 'Info absente', 'Sécurité insuffisante'],
  },
  {
    code: 'gar_quai_bateau',
    nom: 'Quais embarquement bateau',
    emoji: '⚓',
    tags: ['gar_quai_bateau_1', 'gar_quai_bateau_2', 'gar_ponton_1'],
    problemes: ['Embarquement bloqué', 'File excessive', 'Sécurité insuffisante', 'Info absente'],
  },
  {
    code: 'gar_attente',
    nom: 'Salle d’attente',
    emoji: '🪑',
    tags: ['gar_attente_1', 'gar_attente_2', 'gar_salle_attente_1'],
    problemes: ['Places insuffisantes', 'Clim HS', 'Propreté insuffisante', 'Bruit excessif'],
  },

  // ===========================================================
  // SERVICES (4)
  // ===========================================================
  {
    code: 'gar_sanitaires',
    nom: 'Sanitaires',
    emoji: '🚻',
    tags: ['gar_wc_1', 'gar_wc_2', 'gar_wc_hall_1'],
    problemes: ['Papier manquant', 'Sol mouillé', 'Odeur', 'Propreté insuffisante'],
  },
  {
    code: 'gar_resto',
    nom: 'Restauration / Café',
    emoji: '☕',
    tags: ['gar_resto_1', 'gar_resto_2', 'gar_cafe_1'],
    problemes: ['Service lent', 'Produit indisponible', 'Table sale', 'Prix abusif'],
  },
  {
    code: 'gar_boutique',
    nom: 'Boutiques',
    emoji: '🛍️',
    tags: ['gar_boutique_1', 'gar_boutique_2', 'gar_shop_1'],
    problemes: ['Produit indisponible', 'Prix non affiché', 'Staff ignoré', 'File excessive'],
  },
  {
    code: 'gar_consigne',
    nom: 'Consignes / Bagagerie',
    emoji: '🧳',
    tags: ['gar_consigne_1', 'gar_consigne_2', 'gar_bagagerie_1'],
    problemes: ['Consigne HS', 'Bagage bloqué', 'Personnel absent', 'Sécurité insuffisante'],
  },

  // ===========================================================
  // LOGISTIQUE (2)
  // ===========================================================
  {
    code: 'gar_parking',
    nom: 'Parking / Dépose-minute',
    emoji: '🅿️',
    tags: ['gar_parking_1', 'gar_depose_min_1', 'gar_kiss_fly_1'],
    problemes: ['Congestion totale', 'Place introuvable', 'Barrière HS', 'Insécurité'],
  },
  {
    code: 'gar_pmr',
    nom: 'Accessibilité PMR',
    emoji: '♿',
    tags: ['gar_pmr_1', 'gar_pmr_2', 'gar_ascenseur_pmr_1'],
    problemes: ['Ascenseur HS', 'Accès bloqué', 'Rampe manquante', 'Info absente'],
  },
]

/**
 * Mapping émoji par problématique gare (pour l'affichage PWA voyageur).
 */
export const GARE_PROBLEM_EMOJIS: Record<string, string> = {
  // Hall
  'Clim ou chauffage HS': '🌡️',
  'Propreté insuffisante': '🧹',
  'Info absente': 'ℹ️',
  'Surpeuplé': '👥',
  // Billeterie
  'Guichet fermé': '🔒',
  'Attente excessive': '⏳',
  'Personnel désagréable': '😠',
  'Système en panne': '💻',
  // Info voyageurs
  'Info erronée ou absente': 'ℹ️',
  'Écran HS': '📺',
  'Annonce inaudible': '📢',
  'Retard non annoncé': '⏰',
  // Quais bus
  'Quai saturé': '👥',
  'Bus retardé': '🚌',
  'Sécurité insuffisante': '🛡️',
  // Quais bateau
  'Embarquement bloqué': '⛔',
  'File excessive': '👥',
  // Attente
  'Places insuffisantes': '🪑',
  'Clim HS': '🌡️',
  'Bruit excessif': '🔊',
  // Sanitaires
  'Papier manquant': '🧻',
  'Sol mouillé': '💧',
  'Odeur': '🤢',
  // Resto / Boutique
  'Service lent': '🐌',
  'Produit indisponible': '📦',
  'Table sale': '🍽️',
  'Prix abusif': '💸',
  'Prix non affiché': '💰',
  'Staff ignoré': '🙍',
  // Consigne
  'Consigne HS': '🔒',
  'Bagage bloqué': '🧳',
  // Parking / PMR
  'Congestion totale': '🚦',
  'Place introuvable': '🔍',
  'Barrière HS': '🚧',
  'Insécurité': '🚨',
  'Ascenseur HS': '🛗',
  'Accès bloqué': '🚫',
  'Rampe manquante': '♿',
}

/** Retourne l'émoji associé à une problématique gare, ou un émoji générique */
export function getGareProblemEmoji(problem: string): string {
  return GARE_PROBLEM_EMOJIS[problem] ?? '⚠️'
}

/**
 * Résout un tag URL scanné vers la zone gare correspondante.
 */
export function resoudreGareZoneParTag(tag: string): GareZoneConfig | null {
  const normalise = tag.trim().toLowerCase()
  if (!normalise) return null
  for (const z of GARE_ZONES) {
    if (z.tags.some((t) => t.toLowerCase() === normalise)) return z
  }
  return null
}

/** Récupère une zone gare par son code métier. */
export function getGareZoneParCode(code: string): GareZoneConfig | null {
  return GARE_ZONES.find((z) => z.code === code) ?? null
}
