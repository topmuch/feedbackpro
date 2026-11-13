// ============================================================
// FeedbackPro — Configuration statique des zones aéroport
// ------------------------------------------------------------
// Source de vérité pour les 25 zones aéroport et leurs
// problématiques prédéfinies (boutons rapides). Le seed
// prisma/seed-zones-v2.ts lit cette config et l'injecte en BDD.
//
// Un tag URL (ex: "tapis_bagages_1") est scanné via QR code,
// résolu en AirportZone via la propriété `tags`. Plusieurs tags
// physiques peuvent pointer vers la même zone logique.
//
// Le `code` est désormais un `string` libre (union retirée) car
// le catalogue aéroport couvre 25 zones réparties en 7 familles :
//   - EXTÉRIEUR  (parkings, dépose-minute, taxis, transports)
//   - SÛRETÉ     (filtrage, file prioritaire, PAF)
//   - TERMINAL   (portes, bagages, check-in, sanitaires, PMR)
//   - COMMERCIAL (restauration, duty-free, lounges)
//   - SERVICE    (enfants, prière, infirmerie)
//   - URGENCE    (point SOS — bouton unique APPELER SECOURS)
//   + les 5 zones historiques (bagages, sanitaires, files_attente,
//     embarquement, restauration) conservées pour rétro-compat.
// ============================================================

export type AirportZoneConfig = {
  /** Code métier lisible, clé unique en BDD.
   *  Type libre (string) : le catalogue aéroport couvre 25+ zones. */
  code: string
  /** Nom affiché en gros en haut de l'écran du voyageur */
  nom: string
  /** Emoji illustrant la zone (affiché en gros à côté du nom) */
  emoji: string
  /** Description courte optionnelle (sous-titre) */
  description?: string
  /** Tags URL acceptés pour cette zone (lus depuis l'URL ?airport=<tag>) */
  tags: string[]
  /** Les problématiques prédéfinies (boutons rapides) — tableau flexible
   * (1 minimum pour la zone SOS, 4+ pour les autres). */
  problemes: string[]
}

export const AIRPORT_ZONES: AirportZoneConfig[] = [
  // ===========================================================
  // ZONES HISTORIQUES (5) — conservées pour rétro-compat
  // ===========================================================
  {
    code: 'bagages',
    nom: 'Livraison des Bagages',
    emoji: '🛢️',
    description: 'Tapis bagages, chariots et zone de récupération',
    tags: ['tapis_bagages_1', 'tapis_bagages_4', 'bagages_tapis_principal', 'bagages_zone_recup'],
    problemes: [
      'Tapis arrêté ou bloqué',
      'Attente trop longue (> 30 min)',
      'Chariots indisponibles',
      'Bagage endommagé sur le tapis',
      'Mon bagage n\'est pas sur le tapis',
      'Bagage perdu',
    ],
  },
  {
    code: 'sanitaires',
    nom: 'Sanitaires et Soins',
    emoji: '🚻',
    description: 'Toilettes, espaces soins et hygiène',
    tags: ['toilettes_T2_porteB', 'wc_hall_arrivee', 'sanitaires_T1_nord', 'wc_zone_embarquement'],
    problemes: [
      'Manque de consommables (Papier/Savon)',
      'Problème de propreté (Sol/Cuvette)',
      "Dysfonctionnement technique (Chasse d'eau/Robinet)",
      'Poubelle qui déborde',
    ],
  },
  {
    code: 'files_attente',
    nom: 'Files d’Attente',
    emoji: '⏳',
    description: 'Sécurité, PAF/Immigration et contrôle aux frontières',
    tags: ['securite_flux_principal', 'paf_immigration_T1', 'securite_T2_sud', 'paf_frontieres_nord'],
    problemes: [
      'Nombre de guichets ouverts insuffisant',
      "Temps d'attente anormalement long",
      'Absence de file Prioritaire/Famille active',
      'Manque de bacs en plastique (Sécurité)',
    ],
  },
  {
    code: 'embarquement',
    nom: 'Salles d’Embarquement',
    emoji: '🛋️',
    description: 'Portes, lounges et espaces d’attente porte',
    tags: ['porte_A12', 'lounge_coworking_T2', 'porte_B07', 'lounge_business_T1'],
    problemes: [
      'Bornes de recharge / Ports USB HS',
      'Wi-Fi inaccessible ou trop lent',
      'Problème de température (Trop chaud / Trop froid)',
      'Sièges cassés ou sol sale',
    ],
  },
  {
    code: 'restauration',
    nom: 'Restauration et Boutiques',
    emoji: '🍽️',
    description: 'Food court, duty free et commerces',
    tags: ['food_court_central', 'duty_free_zone', 'food_court_T2', 'duty_free_T1'],
    problemes: [
      'Tables non débarrassées',
      'Distributeur automatique en panne',
      'Prix non affichés',
      'Personnel indisponible ou fermé',
    ],
  },

  // ===========================================================
  // EXTÉRIEUR (5 zones)
  // ===========================================================
  { code: 'ext_park_p1', nom: 'Parking P1 (Courte Durée)', emoji: '🅿️', description: 'Parking courte durée', tags: ['ext_park_p1_zone_a', 'ext_park_p1_zone_b', 'ext_park_p1_entree', 'ext_park_p1_sortie'], problemes: ['Barrière bloquée', 'Place introuvable', 'Tarif illisible', 'Insécurité'] },
  { code: 'ext_park_p2', nom: 'Parking P2 (Longue Durée)', emoji: '🅿️', description: 'Parking longue durée', tags: ['ext_park_p2_zone_a', 'ext_park_p2_zone_b', 'ext_park_p2_navette', 'ext_park_p2_entree'], problemes: ['Navette absente', 'Véhicule sale ou endommagé', 'Éclairage HS', 'Insécurité'] },
  { code: 'ext_depose_min', nom: 'Dépose-Minute / Kiss & Fly', emoji: '🚗', description: 'Zone dépose-minute', tags: ['ext_depose_min_1', 'ext_depose_min_2', 'ext_kiss_fly_1'], problemes: ['Congestion totale', 'Pas de place disponible', 'Agent verbalise injustement', 'Attente excessive'] },
  { code: 'ext_taxi_off', nom: 'Station Taxis Officiels', emoji: '🚕', description: 'Station de taxis officiels', tags: ['ext_taxi_off_1', 'ext_taxi_off_2', 'ext_taxi_rank_1'], problemes: ['Chauffeur refuse compteur', 'Attente > 15 min', 'Comportement agressif', 'Tarif abusif'] },
  { code: 'ext_transport_pub', nom: 'Arrêt Bus / VTC / Navette', emoji: '🚌', description: 'Transport public et navettes', tags: ['ext_bus_stop_1', 'ext_vtc_pickup_1', 'ext_navette_1', 'ext_transport_pub_1'], problemes: ['Retard navette', 'Information absente', 'Surcharge véhicule', 'Arrêt non accessible PMR'] },

  // ===========================================================
  // SÛRETÉ (3 zones)
  // ===========================================================
  { code: 'sec_filt_std', nom: 'Filtrage de Sûreté (Standard)', emoji: '🛡️', description: 'Filtrage sûreté standard', tags: ['sec_filt_std_1', 'sec_filt_std_2', 'sec_filt_std_a', 'sec_filt_std_b'], problemes: ['File trop lente (> 20 min)', 'Agent désagréable', 'Consignes floues', 'Bacs en plastique manquants'] },
  { code: 'sec_filt_fast', nom: 'File Prioritaire / RAPIDE', emoji: '⚡', description: 'File prioritaire sûreté', tags: ['sec_filt_fast_1', 'sec_filt_fast_2', 'sec_priority_1'], problemes: ['Accès refusé injustifié', 'File aussi lente que standard', 'Pas de file prioritaire active', 'Information absente'] },
  { code: 'sec_paf', nom: 'Police aux Frontières (PAF)', emoji: '🛂', description: 'Contrôle aux frontières PAF', tags: ['sec_paf_1', 'sec_paf_2', 'sec_paf_t1', 'sec_paf_t2'], problemes: ['Guichets fermés', 'Attente excessive', 'Contrôle brutal', 'Information absente'] },

  // ===========================================================
  // TERMINAL (5 zones)
  // ===========================================================
  { code: 'term_embarq', nom: 'Salles d\'Embarquement (Gates)', emoji: '✈️', description: 'Portes d\'embarquement', tags: ['term_embarq_a12', 'term_embarq_b07', 'term_embarq_c03', 'term_gate_1'], problemes: ['Porte changée sans info', 'Retard non annoncé', 'Clim/Chauffage HS', 'Sièges cassés ou sales'] },
  { code: 'term_bagages', nom: 'Livraison des Bagages', emoji: '🧳', description: 'Tapis bagages et récupération', tags: ['term_bagages_1', 'term_bagages_2', 'term_bagages_tapis_a', 'term_bagages_tapis_b'], problemes: ['Tapis arrêté', 'Valise abîmée', 'Attente > 30 min', 'Chariot HS'] },
  { code: 'term_checkin', nom: 'Files d\'Attente (Check-in)', emoji: '📋', description: 'Comptoirs d\'enregistrement', tags: ['term_checkin_1', 'term_checkin_2', 'term_checkin_a', 'term_checkin_b'], problemes: ['Comptoir fermé', 'Hôtesse absente', 'Système en panne', 'Attente excessive'] },
  { code: 'term_sanitaires', nom: 'Sanitaires Publics', emoji: '🚻', description: 'Toilettes publiques', tags: ['term_sanitaires_1', 'term_sanitaires_2', 'term_wc_hall_1', 'term_wc_t1_1'], problemes: ['Papier manquant', 'Sol mouillé ou sale', 'Chasse d\'eau HS', 'Odeur'] },
  { code: 'term_san_pmr', nom: 'Toilettes PMR / Famille', emoji: '♿', description: 'Sanitaires accessibles PMR', tags: ['term_san_pmr_1', 'term_san_pmr_2', 'term_wc_pmr_1'], problemes: ['Occupé en permanence', 'Équipement bébé HS', 'Accès bloqué', 'Propreté insuffisante'] },

  // ===========================================================
  // COMMERCIAL (3 zones)
  // ===========================================================
  { code: 'com_resto', nom: 'Restauration (Landside/Airside)', emoji: '🍽️', description: 'Restaurants et cafés', tags: ['com_resto_1', 'com_resto_2', 'com_resto_food_court', 'com_resto_cafe_1'], problemes: ['Service lent (> 15 min)', 'Plat froid ou frit', 'Table sale', 'Prix abusif'] },
  { code: 'com_dutyfree', nom: 'Boutiques Duty-Free', emoji: '🛍️', description: 'Boutiques hors taxes', tags: ['com_dutyfree_1', 'com_dutyfree_2', 'com_dutyfree_a', 'com_dutyfree_b'], problemes: ['Produit indisponible', 'Prix non affiché', 'Staff ignoré', 'File excessive'] },
  { code: 'com_lounge', nom: 'Salon VIP / Lounge', emoji: '🥂', description: 'Salons VIP et lounges', tags: ['com_lounge_1', 'com_lounge_2', 'com_lounge_t1', 'com_lounge_t2'], problemes: ['Accès refusé (bug système)', 'Surpeuplé', 'Nourriture froide', 'Wi-Fi inaccessible'] },

  // ===========================================================
  // SERVICE (3 zones)
  // ===========================================================
  { code: 'srv_enfants', nom: 'Espace Enfants / Aire de Jeux', emoji: '🧸', description: 'Aire de jeux enfants', tags: ['srv_enfants_1', 'srv_enfants_2', 'srv_aire_jeux_1'], problemes: ['Jeu cassé ou dangereux', 'Propreté insuffisante', 'Non surveillé', 'Équipement HS'] },
  { code: 'srv_priere', nom: 'Espace Prière / Confessionnal', emoji: '🕌', description: 'Espace de prière', tags: ['srv_priere_1', 'srv_priere_2', 'srv_mosque_1'], problemes: ['Tapis sale', 'Horaires non respectés', 'Manque d\'intimité', 'Propreté insuffisante'] },
  { code: 'srv_medical', nom: 'Infirmerie / Secours', emoji: '🚑', description: 'Infirmerie et secours', tags: ['srv_medical_1', 'srv_medical_2', 'srv_infirmerie_1'], problemes: ['Personnel absent', 'Délai intervention long', 'Matériel manquant', 'Accès fermé'] },

  // ===========================================================
  // URGENCE (1 zone) — Bouton unique APPELER SECOURS
  // ===========================================================
  { code: 'urg_sos', nom: 'Point d\'Urgence / SOS', emoji: '🚨', description: 'Point d\'urgence — bouton unique APPELER SECOURS', tags: ['urg_sos_1', 'urg_sos_2', 'urg_sos_colonne_1', 'urg_sos_borne_1'], problemes: ['APPELER SECOURS'] },
]

/**
 * Mapping émoji par problématique (pour l'affichage PWA voyageur).
 * Si un problème n'est pas dans la map, un émoji générique est utilisé.
 */
export const PROBLEM_EMOJIS: Record<string, string> = {
  // Bagages (historique)
  'Tapis arrêté ou bloqué': '🛑',
  'Attente trop longue (> 30 min)': '⏳',
  'Chariots indisponibles': '🛒',
  'Bagage endommagé sur le tapis': '🧳',
  "Mon bagage n'est pas sur le tapis": '❓',
  'Bagage perdu': '🧳',
  // Sanitaires (historique)
  'Manque de consommables (Papier/Savon)': '🧻',
  'Problème de propreté (Sol/Cuvette)': '🧹',
  "Dysfonctionnement technique (Chasse d'eau/Robinet)": '🔧',
  'Poubelle qui déborde': '🗑️',
  // Files d'attente (historique)
  'Nombre de guichets ouverts insuffisant': '🚫',
  "Temps d'attente anormalement long": '⏳',
  'Absence de file Prioritaire/Famille active': '👨\u200d👩\u200d👧',
  'Manque de bacs en plastique (Sécurité)': '🧺',
  // Embarquement (historique)
  'Bornes de recharge / Ports USB HS': '🔌',
  'Wi-Fi inaccessible ou trop lent': '📶',
  'Problème de température (Trop chaud / Trop froid)': '🌡️',
  'Sièges cassés ou sol sale': '🪑',
  // Restauration (historique)
  'Tables non débarrassées': '🍽️',
  'Distributeur automatique en panne': '🤖',
  'Prix non affichés': '💰',
  'Personnel indisponible ou fermé': '🔒',
  // --- EXTÉRIEUR ---
  'Barrière bloquée': '🚧',
  'Place introuvable': '🔍',
  'Tarif illisible': '🏷️',
  'Insécurité': '🚨',
  'Navette absente': '🚌',
  'Véhicule sale ou endommagé': '🚙',
  'Éclairage HS': '💡',
  'Congestion totale': '🚦',
  'Pas de place disponible': '🅿️',
  'Agent verbalise injustement': '👮',
  'Attente excessive': '⏳',
  'Chauffeur refuse compteur': '🚕',
  'Attente > 15 min': '⏳',
  'Comportement agressif': '😠',
  'Tarif abusif': '💸',
  'Retard navette': '🚌',
  'Information absente': 'ℹ️',
  'Surcharge véhicule': '👥',
  'Arrêt non accessible PMR': '♿',
  // --- SÛRETÉ ---
  'File trop lente (> 20 min)': '🐌',
  'Agent désagréable': '😠',
  'Consignes floues': '❓',
  'Bacs en plastique manquants': '🧺',
  'Accès refusé injustifié': '🚫',
  'File aussi lente que standard': '🐌',
  'Pas de file prioritaire active': '🚷',
  'Guichets fermés': '🔒',
  'Contrôle brutal': '🛂',
  // --- TERMINAL ---
  'Porte changée sans info': '🔄',
  'Retard non annoncé': '⏰',
  'Clim/Chauffage HS': '🌡️',
  'Sièges cassés ou sales': '🪑',
  'Tapis arrêté': '🛑',
  'Valise abîmée': '🧳',
  'Attente > 30 min': '⏳',
  'Chariot HS': '🛒',
  'Comptoir fermé': '🔒',
  'Hôtesse absente': '🙍',
  'Système en panne': '💻',
  'Papier manquant': '🧻',
  'Sol mouillé ou sale': '🧹',
  "Chasse d'eau HS": '🔧',
  'Odeur': '🤢',
  'Occupé en permanence': '🚷',
  'Équipement bébé HS': '🍼',
  'Accès bloqué': '🚫',
  'Propreté insuffisante': '🧹',
  // --- COMMERCIAL ---
  'Service lent (> 15 min)': '🐌',
  'Plat froid ou frit': '🍽️',
  'Table sale': '🍽️',
  'Prix abusif': '💸',
  'Produit indisponible': '📦',
  'Staff ignoré': '🙍',
  'File excessive': '👥',
  'Accès refusé (bug système)': '🔒',
  'Surpeuplé': '👥',
  'Nourriture froide': '🍽️',
  // --- SERVICE ---
  'Jeu cassé ou dangereux': '🧸',
  'Non surveillé': '👁️',
  'Équipement HS': '🔧',
  'Tapis sale': '🧹',
  'Horaires non respectés': '⏰',
  "Manque d'intimité": '🤫',
  'Personnel absent': '🙅',
  'Délai intervention long': '⏳',
  'Matériel manquant': '🩹',
  'Accès fermé': '🔒',
  // --- URGENCE ---
  'APPELER SECOURS': '🆘',
}

/** Retourne l'émoji associé à une problématique, ou un émoji générique */
export function getProblemEmoji(problem: string): string {
  return PROBLEM_EMOJIS[problem] ?? '⚠️'
}

/**
 * Résout un tag URL scanné vers la zone aéroport correspondante.
 * Retourne null si le tag n'est reconnu par aucune zone.
 */
export function resoudreZoneParTag(tag: string): AirportZoneConfig | null {
  const normalise = tag.trim().toLowerCase()
  if (!normalise) return null
  for (const z of AIRPORT_ZONES) {
    if (z.tags.some((t) => t.toLowerCase() === normalise)) return z
  }
  return null
}

/**
 * Récupère une zone par son code métier.
 */
export function getZoneParCode(code: string): AirportZoneConfig | null {
  return AIRPORT_ZONES.find((z) => z.code === code) ?? null
}

/**
 * Détecte si une zone est un point d'urgence SOS (1 seul problème
 * "APPELER SECOURS"). Utilisé par la PWA pour afficher le bouton
 * d'urgence stylisé différemment de la grille de problèmes standard.
 */
export function isSosZone(zone: { problemes?: string[] } | null | undefined): boolean {
  if (!zone || !Array.isArray(zone.problemes)) return false
  if (zone.problemes.length !== 1) return false
  return zone.problemes[0] === 'APPELER SECOURS'
}

// ============================================================
// Génération du payload WhatsApp destiné aux équipes terrain
// ------------------------------------------------------------
// Format imposé par le cahier des charges :
// "🔴 **ALERTE OPÉRA-AÉROPORT**
//  **Zone :** [Nom propre de la zone détectée]
//  **Problème :** [Problématique sélectionnée]
//  **Heure :** [Heure actuelle]
//  **Action :** Veuillez dépêcher un agent sur place."
// ============================================================

export type AirportWhatsappPayload = {
  zoneNom: string
  zoneEmoji: string
  problemType: string
  tagScanne: string
  commentaire?: string | null
  photoUrl?: string | null
  /** Date de création du signalement */
  createdAt: Date
}

export function buildAirportWhatsappMessage(p: AirportWhatsappPayload): string {
  const heure = p.createdAt.toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  const lignes: string[] = [
    '🔴 *ALERTE OPÉRA-AÉROPORT*',
    '',
    `*Zone :* ${p.zoneEmoji} ${p.zoneNom}`,
    `*Problème :* ${p.problemType}`,
    `*Emplacement :* ${p.tagScanne}`,
    `*Heure :* ${heure}`,
  ]

  if (p.commentaire && p.commentaire.trim()) {
    lignes.push(`*Précision voyageur :* ${p.commentaire.trim()}`)
  }
  if (p.photoUrl) {
    lignes.push(`*Photo jointe :* ${p.photoUrl}`)
  }

  lignes.push('', '*Action :* Veuillez dépêcher un agent sur place.')

  return lignes.join('\n')
}

/**
 * Numéro WhatsApp des équipes opérationnelles aéroport.
 * En production : variable d'environnement AIRPORT_OPS_WHATSAPP
 * (format international sans +, ex: 33612345678).
 * En démo : fallback 33612345678 (numéro Twilio de test).
 */
export function getAirportOpsWhatsapp(): string {
  const env = process.env.AIRPORT_OPS_WHATSAPP
  if (env && /^\d{8,15}$/.test(env)) return env
  // Mode démo — retourne un numéro factice qui sera intercepté
  // côté client par le deep link wa.me (l'utilisateur verra l'écran
  // de composition WhatsApp sans envoi réel).
  return '33612345678'
}

/**
 * Construit le deep link WhatsApp (wa.me) pour ouvrir WhatsApp
 * pré-rempli avec le payload ALERTE OPÉRA-AÉROPORT.
 */
export function buildAirportWhatsappLink(payload: AirportWhatsappPayload): string {
  const numero = getAirportOpsWhatsapp()
  const message = buildAirportWhatsappMessage(payload)
  return `https://api.whatsapp.com/send?phone=${numero}&text=${encodeURIComponent(message)}&type=phone_number&app_absent=0`
}
