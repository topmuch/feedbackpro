// ============================================================
// FeedbackPro — Configuration statique des zones aéroport
// ------------------------------------------------------------
// Source de vérité pour les 5 zones aéroport et leurs 4
// problématiques prédéfinies (boutons rapides). Le seed
// prisma/seed-airport.ts lit cette config et l'injecte en BDD.
//
// Un tag URL (ex: "tapis_bagages_1") est scanné via QR code,
// résolu en AirportZone via la propriété `tags`. Plusieurs tags
// physiques peuvent pointer vers la même zone logique.
//
// Le cahier des charges impose exactement 4 problématiques par
// zone — c'est respecté ici (et validé par le type TypeScript).
// ============================================================

export type AirportZoneConfig = {
  /** Code métier lisible, clé unique en BDD */
  code: 'bagages' | 'sanitaires' | 'files_attente' | 'embarquement' | 'restauration'
  /** Nom affiché en gros en haut de l'écran du voyageur */
  nom: string
  /** Emoji illustrant la zone (affiché en gros à côté du nom) */
  emoji: string
  /** Description courte optionnelle (sous-titre) */
  description?: string
  /** Tags URL acceptés pour cette zone (lus depuis l'URL ?airport=<tag>) */
  tags: string[]
  /** Les 4 problématiques prédéfinies (boutons rapides) */
  problemes: [string, string, string, string]
}

export const AIRPORT_ZONES: AirportZoneConfig[] = [
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
]

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
