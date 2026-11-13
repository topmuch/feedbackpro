// ============================================================
// airport-routing.ts — Routage auto problemType → équipe staff
// ------------------------------------------------------------
// Mappe le libellé du problemType (tel que saisi par le passager
// ou le bot WhatsApp) vers l'équipe staff responsable :
//   nettoyage | maintenance | accueil | securite | logistique | other
//
// Utilisé par la PWA staff pour afficher/masquer les incidents
// pertinents pour une équipe donnée, et pour formulé l'annonce
// vocale Denise ("Équipe Nettoyage, intervenez").
//
// routerVersService(problemType) → code équipe
// serviceLabel(team)            → libellé affichable
// ============================================================

const PROBLEM_TO_TEAM: Record<string, string> = {
  // Nettoyage
  'Manque de consommables (Papier/Savon)': 'nettoyage',
  'Problème de propreté (Sol/Cuvette)': 'nettoyage',
  'Poubelle qui déborde': 'nettoyage',
  // Maintenance
  'Tapis arrêté ou bloqué': 'maintenance',
  "Dysfonctionnement technique (Chasse d'eau/Robinet)": 'maintenance',
  'Bornes de recharge / Ports USB HS': 'maintenance',
  'Wi-Fi inaccessible ou trop lent': 'maintenance',
  'Problème de température (Trop chaud / Trop froid)': 'maintenance',
  // Accueil
  'Attente trop longue (> 30 min)': 'accueil',
  "Temps d'attente anormalement long": 'accueil',
  'Nombre de guichets ouverts insuffisant': 'accueil',
  'Absence de file Prioritaire/Famille active': 'accueil',
  // Sécurité
  'Manque de bacs en plastique (Sécurité)': 'securite',
  'Bagage endommagé sur le tapis': 'securite',
  'Bagage perdu': 'securite',
  "Mon bagage n'est pas sur le tapis": 'logistique',
  'Chariots indisponibles': 'logistique',
}

/**
 * Renvoie le code équipe (nettoyage, maintenance, …) pour un
 * problemType donné. 'other' si non reconnu.
 */
export function routerVersService(problemType: string): string {
  return PROBLEM_TO_TEAM[problemType] ?? 'other'
}

/**
 * Renvoie le libellé affichable d'une équipe.
 *   'nettoyage' → 'Nettoyage'
 *   'other'     → 'Autre'
 */
export function serviceLabel(team: string): string {
  const labels: Record<string, string> = {
    nettoyage: 'Nettoyage',
    maintenance: 'Maintenance',
    securite: 'Sécurité',
    accueil: 'Accueil',
    logistique: 'Logistique',
    other: 'Autre',
  }
  return labels[team] ?? team
}
