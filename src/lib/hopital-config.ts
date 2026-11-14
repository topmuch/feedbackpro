// ============================================================
// FeedbackPro — Configuration statique des zones hôpital
// ------------------------------------------------------------
// Source de vérité pour les 12 zones hôpital/clinique et leurs
// problématiques prédéfinies (boutons rapides). Le seed
// prisma/seed-all-sectors.ts lit cette config et l'injecte en BDD.
//
// Un tag URL (ex: "hop_accueil_1") est scanné via QR code,
// résolu en HopitalZone via la propriété `tags`.
//
// 12 zones réparties en familles fonctionnelles :
//   - FLUX      (accueil, salle d'attente, urgences)
//   - SOINS     (chambres, bloc, labo, imagerie, pharmacie)
//   - CIRCULATION (couloirs, sanitaires)
//   - LOGISTIQUE (resto, parking)
// ============================================================

export type HopitalZoneConfig = {
  /** Code métier lisible, clé unique en BDD. */
  code: string
  /** Nom affiché en gros en haut de l'écran du patient */
  nom: string
  /** Emoji illustrant la zone */
  emoji: string
  /** Description courte optionnelle */
  description?: string
  /** Tags URL acceptés pour cette zone (lus depuis l'URL ?hop=<tag>) */
  tags: string[]
  /** Les problématiques prédéfinies (boutons rapides) — 4 par zone. */
  problemes: string[]
}

export const HOPITAL_ZONES: HopitalZoneConfig[] = [
  // ===========================================================
  // FLUX (3)
  // ===========================================================
  {
    code: 'hop_accueil',
    nom: 'Accueil / Admission',
    emoji: '🏥',
    tags: ['hop_accueil_1', 'hop_accueil_2', 'hop_admission_1'],
    problemes: ['File trop longue', 'Personnel absent', 'Info absente', 'Système en panne'],
  },
  {
    code: 'hop_attente',
    nom: 'Salle d’attente',
    emoji: '🪑',
    tags: ['hop_attente_1', 'hop_attente_2', 'hop_attente_urgent_1'],
    problemes: ['Attente excessive', 'Places insuffisantes', 'Clim HS', 'Bruit excessif'],
  },
  {
    code: 'hop_urgences',
    nom: 'Service des Urgences',
    emoji: '🚑',
    tags: ['hop_urgences_1', 'hop_urgences_2', 'hop_urgences_triage'],
    problemes: ['Attente excessive', 'Personnel insuffisant', 'Équipement manquant', 'Sécurité insuffisante'],
  },

  // ===========================================================
  // SOINS (5)
  // ===========================================================
  {
    code: 'hop_chambre',
    nom: 'Chambres (patients)',
    emoji: '🛏️',
    tags: ['hop_chambre_101', 'hop_chambre_102', 'hop_chambre_201'],
    problemes: ['Hygiène insuffisante', 'Clim HS', 'Literie inconfortable', 'Bruit couloirs'],
  },
  {
    code: 'hop_bloc',
    nom: 'Bloc opératoire',
    emoji: '🔬',
    tags: ['hop_bloc_1', 'hop_bloc_2', 'hop_bloc_prep_1'],
    problemes: ['Hygiène insuffisante', 'Équipement HS', 'Clim HS', 'Sécurité insuffisante'],
  },
  {
    code: 'hop_labo',
    nom: 'Laboratoire',
    emoji: '🧪',
    tags: ['hop_labo_1', 'hop_labo_2', 'hop_laboratoire_1'],
    problemes: ['Attente résultats', 'Personnel absent', 'Équipement HS', 'Info absente'],
  },
  {
    code: 'hop_imagerie',
    nom: 'Imagerie (Radio/IRM)',
    emoji: '📷',
    tags: ['hop_imagerie_1', 'hop_imagerie_2', 'hop_radio_1'],
    problemes: ['Attente excessive', 'Équipement en panne', 'Personnel absent', 'Info absente'],
  },
  {
    code: 'hop_pharmacie',
    nom: 'Pharmacie / Dispensaire',
    emoji: '💊',
    tags: ['hop_pharmacie_1', 'hop_pharmacie_2', 'hop_dispensaire_1'],
    problemes: ['Médicament indisponible', 'File excessive', 'Personnel absent', 'Info absente'],
  },

  // ===========================================================
  // CIRCULATION (2)
  // ===========================================================
  {
    code: 'hop_couloir',
    nom: 'Couloirs / Circulation',
    emoji: '🚶',
    tags: ['hop_couloir_1', 'hop_couloir_2', 'hop_couloir_etage_1'],
    problemes: ['Éclairage HS', 'Propreté insuffisante', 'Encombrement', 'Accessibilité PMR'],
  },
  {
    code: 'hop_sanitaires',
    nom: 'Sanitaires',
    emoji: '🚻',
    tags: ['hop_wc_1', 'hop_wc_2', 'hop_wc_hall_1'],
    problemes: ['Hygiène insuffisante', 'Papier manquant', 'Sol mouillé', 'Odeur'],
  },

  // ===========================================================
  // LOGISTIQUE (2)
  // ===========================================================
  {
    code: 'hop_resto',
    nom: 'Restauration / Cafétéria',
    emoji: '🍽️',
    tags: ['hop_resto_1', 'hop_resto_2', 'hop_cafeteria_1'],
    problemes: ['Hygiène insuffisante', 'Service lent', 'Produit indisponible', 'Prix abusif'],
  },
  {
    code: 'hop_parking',
    nom: 'Parking',
    emoji: '🅿️',
    tags: ['hop_parking_1', 'hop_parking_2', 'hop_parking_urgent'],
    problemes: ['Place introuvable', 'Barrière HS', 'Éclairage HS', 'Accessibilité PMR'],
  },
]

/**
 * Mapping émoji par problématique hôpital (pour l'affichage PWA patient).
 */
export const HOPITAL_PROBLEM_EMOJIS: Record<string, string> = {
  // Accueil
  'File trop longue': '⏳',
  'Personnel absent': '🙅',
  'Info absente': 'ℹ️',
  'Système en panne': '💻',
  // Attente
  'Attente excessive': '⏳',
  'Places insuffisantes': '🪑',
  'Clim HS': '🌡️',
  'Bruit excessif': '🔊',
  // Urgences
  'Personnel insuffisant': '🙍',
  'Équipement manquant': '🩹',
  'Sécurité insuffisante': '🛡️',
  // Chambre
  'Hygiène insuffisante': '🧼',
  'Literie inconfortable': '🛏️',
  'Bruit couloirs': '🔊',
  // Bloc
  'Équipement HS': '🔧',
  // Labo
  'Attente résultats': '⏳',
  // Imagerie
  'Équipement en panne': '🛠️',
  // Pharmacie
  'Médicament indisponible': '💊',
  'File excessive': '👥',
  // Couloir
  'Éclairage HS': '💡',
  'Propreté insuffisante': '🧹',
  'Encombrement': '📦',
  'Accessibilité PMR': '♿',
  // Sanitaires
  'Papier manquant': '🧻',
  'Sol mouillé': '💧',
  'Odeur': '🤢',
  // Resto
  'Service lent': '🐌',
  'Produit indisponible': '📦',
  'Prix abusif': '💸',
  // Parking
  'Place introuvable': '🔍',
  'Barrière HS': '🚧',
}

/** Retourne l'émoji associé à une problématique hôpital, ou un émoji générique */
export function getHopitalProblemEmoji(problem: string): string {
  return HOPITAL_PROBLEM_EMOJIS[problem] ?? '⚠️'
}

/** Résout un tag URL scanné vers la zone hôpital correspondante. */
export function resoudreHopitalZoneParTag(tag: string): HopitalZoneConfig | null {
  const normalise = tag.trim().toLowerCase()
  if (!normalise) return null
  for (const z of HOPITAL_ZONES) {
    if (z.tags.some((t) => t.toLowerCase() === normalise)) return z
  }
  return null
}

/** Récupère une zone hôpital par son code métier. */
export function getHopitalZoneParCode(code: string): HopitalZoneConfig | null {
  return HOPITAL_ZONES.find((z) => z.code === code) ?? null
}
