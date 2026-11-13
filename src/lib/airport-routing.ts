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
// Couvre désormais l'ensemble des 25 zones aéroport
// (historique + extérieur + sûreté + terminal + commercial +
//  service + urgence).
//
// routerVersService(problemType) → code équipe
// serviceLabel(team)            → libellé affichable
// ============================================================

const PROBLEM_TO_TEAM: Record<string, string> = {
  // =========================================================
  // SÉCURITÉ — danger immédiat, agression, insécurité, brutalité
  // =========================================================
  'Insécurité': 'securite',
  'Contrôle brutal': 'securite',
  'Comportement agressif': 'securite',
  'Jeu cassé ou dangereux': 'securite',

  // =========================================================
  // MAINTENANCE — pannes, équipements HS, accès bloqués
  // (Note : "Jeu cassé ou dangereux" est redéclaré plus bas en
  //  maintenance — la dernière déclaration gagne. On le retire
  //  du bloc Sécurité ci-dessus pour éviter toute ambiguïté :
  //  en pratique le danger prime, donc on le garde en Sécurité.)
  // =========================================================
  'Barrière bloquée': 'maintenance',
  'Éclairage HS': 'maintenance',
  'Tapis arrêté': 'maintenance',
  "Chasse d'eau HS": 'maintenance',
  'Clim/Chauffage HS': 'maintenance',
  'Système en panne': 'maintenance',
  'Équipement bébé HS': 'maintenance',
  'Équipement HS': 'maintenance',
  'Accès bloqué': 'maintenance',
  'Accès fermé': 'maintenance',
  'Bacs en plastique manquants': 'maintenance',

  // =========================================================
  // NETTOYAGE — saleté, odeurs, propreté, consommables
  // =========================================================
  'Véhicule sale ou endommagé': 'nettoyage',
  'Sol mouillé ou sale': 'nettoyage',
  'Papier manquant': 'nettoyage',
  'Odeur': 'nettoyage',
  'Tapis sale': 'nettoyage',
  'Propreté insuffisante': 'nettoyage',
  'Table sale': 'nettoyage',
  'Nourriture froide': 'nettoyage',

  // =========================================================
  // ACCUEIL — files, attentes, info, saturation de flux
  // =========================================================
  'Place introuvable': 'accueil',
  'Pas de place disponible': 'accueil',
  'Congestion totale': 'accueil',
  'Attente > 15 min': 'accueil',
  'Attente > 30 min': 'accueil',
  'Attente excessive': 'accueil',
  'File excessive': 'accueil',
  'File trop lente (> 20 min)': 'accueil',
  'File aussi lente que standard': 'accueil',
  'Comptoir fermé': 'accueil',
  'Hôtesse absente': 'accueil',
  'Guichets fermés': 'accueil',
  'Information absente': 'accueil',
  'Retard non annoncé': 'accueil',
  'Porte changée sans info': 'accueil',
  'Retard navette': 'accueil',
  'Surcharge véhicule': 'accueil',
  'Surpeuplé': 'accueil',
  'Occupé en permanence': 'accueil',
  'Navette absente': 'accueil',

  // =========================================================
  // LOGISTIQUE — bagages, chariots, matériel, staffing
  // =========================================================
  'Valise abîmée': 'logistique',
  'Chariot HS': 'logistique',
  'Produit indisponible': 'logistique',
  'Matériel manquant': 'logistique',
  'Personnel absent': 'logistique',
  'Non surveillé': 'logistique',
  'Délai intervention long': 'logistique',
  'Staff ignoré': 'logistique',

  // =========================================================
  // OTHER — litiges commerciaux, comportements, tarifs, confort
  // =========================================================
  'Tarif illisible': 'other',
  'Agent verbalise injustement': 'other',
  'Chauffeur refuse compteur': 'other',
  'Tarif abusif': 'other',
  'Prix non affiché': 'other',
  'Prix abusif': 'other',
  'Agent désagréable': 'other',
  'Consignes floues': 'other',
  'Accès refusé injustifié': 'other',
  'Pas de file prioritaire active': 'other',
  'Arrêt non accessible PMR': 'other',
  "Manque d'intimité": 'other',
  'Horaires non respectés': 'other',
  'Wi-Fi inaccessible': 'other',
  'Plat froid ou frit': 'other',
  'Service lent (> 15 min)': 'other',

  // =========================================================
  // HISTORIQUE (5 zones d'origine) — conservé pour rétro-compat
  // =========================================================
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
  // Logistique
  "Mon bagage n'est pas sur le tapis": 'logistique',
  'Chariots indisponibles': 'logistique',

  // =========================================================
  // URGENCE — bouton unique SOS (override final)
  // "APPELER SECOURS" doit toujours router vers Sécurité,
  // même si l'équipe par défaut d'une zone serait autre.
  // =========================================================
  'APPELER SECOURS': 'securite',
}

/**
 * Renvoie le code équipe (nettoyage, maintenance, …) pour un
 * problemType donné. 'other' si non reconnu.
 *
 * Cas particulier : "APPELER SECOURS" (zone urg_sos) → 'securite'
 * afin que le SOC reçoive l'alerte en temps réel.
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
