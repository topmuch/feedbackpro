// ============================================================
// FeedbackPro — Configuration statique des zones hôtellerie
// ------------------------------------------------------------
// Source de vérité pour les 15 zones hôtel et leurs
// problématiques prédéfinies (boutons rapides). Le seed
// prisma/seed-all-sectors.ts lit cette config et l'injecte en
// BDD (table AirportZone — table générique servant de registry
// multi-secteurs).
//
// Un tag URL (ex: "hot_reception_1") est scanné via QR code,
// résolu en HotelZone via la propriété `tags`. Plusieurs tags
// physiques peuvent pointer vers la même zone logique.
//
// 15 zones réparties en 6 familles :
//   - ACCUEIL      (réception, lobby)
//   - CHAMBRES     (standard, supérieure, suite)
//   - RESTAURATION (restaurant, bar)
//   - WELLNESS     (spa, piscine)
//   - SERVICES     (réunion/banquet, ascenseur, couloir, sanitaires)
//   - EXTERIEUR    (parking, jardin/terrasse)
// ============================================================

export type HotelZoneConfig = {
  /** Code métier lisible, clé unique en BDD. */
  code: string
  /** Nom affiché en gros en haut de l'écran du client */
  nom: string
  /** Emoji illustrant la zone (affiché en gros à côté du nom) */
  emoji: string
  /** Description courte optionnelle (sous-titre) */
  description?: string
  /** Tags URL acceptés pour cette zone (lus depuis l'URL ?hotel=<tag>) */
  tags: string[]
  /** Les problématiques prédéfinies (boutons rapides) — 4 par zone. */
  problemes: string[]
}

export const HOTEL_ZONES: HotelZoneConfig[] = [
  // ===========================================================
  // ACCUEIL (2)
  // ===========================================================
  {
    code: 'hot_reception',
    nom: 'Réception / Concierge',
    emoji: '🛎️',
    description: 'Accueil et conciergerie',
    tags: ['hot_reception_1', 'hot_reception_2', 'hot_concierge_1'],
    problemes: ['File trop longue', 'Personnel absent', 'Clé ou carte fonctionnelle HS', 'Bagage égaré'],
  },
  {
    code: 'hot_lobby',
    nom: 'Hall / Lobby',
    emoji: '🏛️',
    description: 'Hall d’accueil',
    tags: ['hot_lobby_1', 'hot_lobby_2', 'hot_hall_entree'],
    problemes: ['Clim ou chauffage HS', 'Propreté insuffisante', 'Bruit excessif', 'Éclairage HS'],
  },

  // ===========================================================
  // CHAMBRES (3)
  // ===========================================================
  {
    code: 'hot_chambre_std',
    nom: 'Chambres Standard',
    emoji: '🛏️',
    description: 'Chambres standard',
    tags: ['hot_chambre_101', 'hot_chambre_102', 'hot_chambre_201', 'hot_chambre_202'],
    problemes: ['Literie inconfortable', 'Clim ou chauffage HS', 'Propreté draps ou sol', 'TV ou minibar HS'],
  },
  {
    code: 'hot_chambre_sup',
    nom: 'Chambres Supérieures',
    emoji: '🌟',
    description: 'Chambres supérieures',
    tags: ['hot_chambre_301', 'hot_chambre_302', 'hot_suite_1'],
    problemes: ['Sèche-cheveux HS', 'Vue obstruée', 'Isolation phonique', 'Wi-Fi inaccessible'],
  },
  {
    code: 'hot_suite',
    nom: 'Suites',
    emoji: '💎',
    description: 'Suites premium',
    tags: ['hot_suite_401', 'hot_suite_402', 'hot_suite_presidentielle'],
    problemes: ['Jacuzzi ou spa HS', 'Clim HS', 'Literie inconfortable', 'Minibar vide'],
  },

  // ===========================================================
  // RESTAURATION (2)
  // ===========================================================
  {
    code: 'hot_resto',
    nom: 'Restaurant / Petit-déjeuner',
    emoji: '🍳',
    description: 'Restaurant et petit-déjeuner',
    tags: ['hot_resto_1', 'hot_resto_petitdej', 'hot_breakfast_1'],
    problemes: ['Service lent', 'Plat froid', 'Table sale', 'Buffet épuisé'],
  },
  {
    code: 'hot_bar',
    nom: 'Bar / Lounge',
    emoji: '🍸',
    description: 'Bar et lounge',
    tags: ['hot_bar_1', 'hot_bar_2', 'hot_lounge_1'],
    problemes: ['Service lent', 'Produit indisponible', 'Bruit excessif', 'Table sale'],
  },

  // ===========================================================
  // WELLNESS (2)
  // ===========================================================
  {
    code: 'hot_spa',
    nom: 'Spa / Wellness',
    emoji: '💆',
    description: 'Spa et espace wellness',
    tags: ['hot_spa_1', 'hot_spa_2', 'hot_wellness_1'],
    problemes: ['Réservation impossible', 'Équipement HS', 'Propreté insuffisante', 'Personnel absent'],
  },
  {
    code: 'hot_pool',
    nom: 'Piscine',
    emoji: '🏊',
    description: 'Piscine et solarium',
    tags: ['hot_pool_1', 'hot_pool_2', 'hot_piscine_1'],
    problemes: ['Eau trouble ou froide', 'Transats manquants', 'Propreté insuffisante', 'Sécurité insuffisante'],
  },

  // ===========================================================
  // SERVICES (4)
  // ===========================================================
  {
    code: 'hot_meeting',
    nom: 'Salles de réunion / Banquet',
    emoji: '🤝',
    description: 'Salles événementielles',
    tags: ['hot_meeting_1', 'hot_meeting_2', 'hot_banquet_1'],
    problemes: ['Clim HS', 'Équipement audiovisuel HS', 'Wi-Fi inaccessible', 'Espace insuffisant'],
  },
  {
    code: 'hot_ascenseur',
    nom: 'Ascenseurs',
    emoji: '🛗',
    description: 'Ascenseurs et élévateurs',
    tags: ['hot_ascenseur_1', 'hot_ascenseur_2', 'hot_elevator_1'],
    problemes: ['En panne', 'Lent', 'Propreté insuffisante', 'Sécurité insuffisante'],
  },
  {
    code: 'hot_couloir',
    nom: 'Couloirs / Circulation',
    emoji: '🚶',
    description: 'Couloirs et halls d’étage',
    tags: ['hot_couloir_1', 'hot_couloir_2', 'hot_hall_etage_1'],
    problemes: ['Éclairage HS', 'Propreté insuffisante', 'Bruit excessif', 'Accessibilité PMR'],
  },
  {
    code: 'hot_sanitaires',
    nom: 'Sanitaires communs',
    emoji: '🚻',
    description: 'Toilettes publiques',
    tags: ['hot_wc_1', 'hot_wc_2', 'hot_wc_hall_1'],
    problemes: ['Papier manquant', 'Sol mouillé', 'Odeur', 'Propreté insuffisante'],
  },

  // ===========================================================
  // EXTERIEUR (2)
  // ===========================================================
  {
    code: 'hot_parking',
    nom: 'Parking',
    emoji: '🅿️',
    description: 'Parking de l’hôtel',
    tags: ['hot_parking_1', 'hot_parking_2', 'hot_parking_entree'],
    problemes: ['Place introuvable', 'Barrière HS', 'Éclairage HS', 'Insécurité'],
  },
  {
    code: 'hot_exterieur',
    nom: 'Jardin / Terrasse',
    emoji: '🌳',
    description: 'Espaces extérieurs',
    tags: ['hot_jardin_1', 'hot_terrasse_1', 'hot_garden_1'],
    problemes: ['Mobilier cassé', 'Propreté insuffisante', 'Éclairage HS', 'Moustiques'],
  },
]

/**
 * Mapping émoji par problématique hôtel (pour l'affichage PWA client).
 * Si un problème n'est pas dans la map, un émoji générique est utilisé.
 */
export const HOTEL_PROBLEM_EMOJIS: Record<string, string> = {
  // Accueil
  'File trop longue': '⏳',
  'Personnel absent': '🙅',
  'Clé ou carte fonctionnelle HS': '🔑',
  'Bagage égaré': '🧳',
  // Hall
  'Clim ou chauffage HS': '🌡️',
  'Propreté insuffisante': '🧹',
  'Bruit excessif': '🔊',
  'Éclairage HS': '💡',
  // Chambres
  'Literie inconfortable': '🛏️',
  'Propreté draps ou sol': '🧹',
  'TV ou minibar HS': '📺',
  'Sèche-cheveux HS': '💨',
  'Vue obstruée': '🚫',
  'Isolation phonique': '🔇',
  'Wi-Fi inaccessible': '📶',
  // Suites
  'Jacuzzi ou spa HS': '🛀',
  'Clim HS': '🌡️',
  'Minibar vide': '🥤',
  // Restauration
  'Service lent': '🐌',
  'Plat froid': '🍽️',
  'Table sale': '🍽️',
  'Buffet épuisé': '🍽️',
  'Produit indisponible': '📦',
  // Wellness
  'Réservation impossible': '📅',
  'Équipement HS': '🔧',
  'Eau trouble ou froide': '💧',
  'Transats manquants': '🪑',
  'Sécurité insuffisante': '🛡️',
  // Services
  'Équipement audiovisuel HS': '📽️',
  'Espace insuffisant': '📐',
  'En panne': '🛑',
  'Lent': '🐌',
  'Accessibilité PMR': '♿',
  // Sanitaires
  'Papier manquant': '🧻',
  'Sol mouillé': '💧',
  'Odeur': '🤢',
  // Parking / exterieur
  'Place introuvable': '🔍',
  'Barrière HS': '🚧',
  'Insécurité': '🚨',
  'Mobilier cassé': '🪑',
  'Moustiques': '🦟',
}

/** Retourne l'émoji associé à une problématique hôtel, ou un émoji générique */
export function getHotelProblemEmoji(problem: string): string {
  return HOTEL_PROBLEM_EMOJIS[problem] ?? '⚠️'
}

/**
 * Résout un tag URL scanné vers la zone hôtel correspondante.
 * Retourne null si le tag n'est reconnu par aucune zone.
 */
export function resoudreHotelZoneParTag(tag: string): HotelZoneConfig | null {
  const normalise = tag.trim().toLowerCase()
  if (!normalise) return null
  for (const z of HOTEL_ZONES) {
    if (z.tags.some((t) => t.toLowerCase() === normalise)) return z
  }
  return null
}

/**
 * Récupère une zone hôtel par son code métier.
 */
export function getHotelZoneParCode(code: string): HotelZoneConfig | null {
  return HOTEL_ZONES.find((z) => z.code === code) ?? null
}
