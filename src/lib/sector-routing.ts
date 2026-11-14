// ============================================================
// sector-routing.ts — Routage auto problemType → équipe staff
// ------------------------------------------------------------
// Mappe le libellé du problemType (tel que saisi par le client
// ou le bot WhatsApp) vers l'équipe staff responsable :
//   nettoyage | maintenance | accueil | securite | logistique | other
//
// SECTOR-AGNOSTIC : un même libellé de problème route vers la
// même équipe, quel que soit le secteur (aéroport, hôtel, gare,
// hôpital, ERP). Par exemple "Éclairage HS" → maintenance
// indépendamment de la zone (couloir hôtel, quai de gare,
// parking ERP…).
//
// Couvre l'ensemble des problématiques de TOUS les secteurs :
//   - Aéroport  (25 zones — historique + extérieur + sûreté +
//     terminal + commercial + service + urgence)
//   - Hôtel     (15 zones — accueil/chambres/restauration/wellness/
//     services/extérieur)
//   - Gare      (12 zones — flux/embarquement/services/logistique)
//   - Hôpital   (12 zones — flux/soins/circulation/logistique)
//   - ERP       (12 zones — flux/bureaux/self-service/circulation/
//     logistique)
//
// routerVersService(problemType) → code équipe
// serviceLabel(team)            → libellé affichable
//
// Fichier historic : airport-routing.ts est conservé comme simple
// re-export `export * from './sector-routing'` pour rétro-compat.
// ============================================================

const PROBLEM_TO_TEAM: Record<string, string> = {
  // =========================================================
  // SÉCURITÉ — danger immédiat, agression, insécurité, brutalité
  // =========================================================
  'Insécurité': 'securite',
  'Contrôle brutal': 'securite',
  'Comportement agressif': 'securite',
  'Jeu cassé ou dangereux': 'securite',
  // Multi-secteurs : sécurité insuffisante (hôtel, gare, hôpital, ERP)
  'Sécurité insuffisante': 'securite',

  // =========================================================
  // MAINTENANCE — pannes, équipements HS, accès bloqués
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
  // Multi-secteurs : pannes & équipements HS (hôtel/gare/hôpital/ERP)
  'Clé ou carte fonctionnelle HS': 'maintenance',
  'Clim ou chauffage HS': 'maintenance',
  'Clim HS': 'maintenance',
  'TV ou minibar HS': 'maintenance',
  'Sèche-cheveux HS': 'maintenance',
  'Jacuzzi ou spa HS': 'maintenance',
  'Équipement audiovisuel HS': 'maintenance',
  'En panne': 'maintenance',
  'Lent': 'maintenance',
  'Barrière HS': 'maintenance',
  'Mobilier cassé': 'maintenance',
  'Écran HS': 'maintenance',
  'Écran cassé': 'maintenance',
  'Consigne HS': 'maintenance',
  'Ascenseur HS': 'maintenance',
  'Rampe manquante': 'maintenance',
  'Équipement en panne': 'maintenance',
  'Borne HS': 'maintenance',
  'Logiciel en panne': 'maintenance',
  'Détecteur HS': 'maintenance',

  // =========================================================
  // NETTOYAGE — saleté, odeurs, propreté, consommables, hygiène
  // =========================================================
  'Véhicule sale ou endommagé': 'nettoyage',
  'Sol mouillé ou sale': 'nettoyage',
  'Papier manquant': 'nettoyage',
  'Odeur': 'nettoyage',
  'Tapis sale': 'nettoyage',
  'Propreté insuffisante': 'nettoyage',
  'Table sale': 'nettoyage',
  'Nourriture froide': 'nettoyage',
  // Multi-secteurs : hygiène & saleté (hôtel/gare/hôpital/ERP)
  'Propreté draps ou sol': 'nettoyage',
  'Eau trouble ou froide': 'nettoyage',
  'Sol mouillé': 'nettoyage',
  'Hygiène insuffisante': 'nettoyage',

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
  // Multi-secteurs : files, attentes, info (hôtel/gare/hôpital/ERP)
  'File trop longue': 'accueil',
  'Bruit excessif': 'accueil',
  'Bruit couloirs': 'accueil',
  'Réservation impossible': 'accueil',
  'Espace insuffisant': 'accueil',
  'Info absente': 'accueil',
  'Info erronée': 'accueil',
  'Info erronée ou absente': 'accueil',
  'Annonce inaudible': 'accueil',
  'Guichet fermé': 'accueil',
  'Quai saturé': 'accueil',
  'Bus retardé': 'accueil',
  'Embarquement bloqué': 'accueil',
  'Places insuffisantes': 'accueil',
  'Attente résultats': 'accueil',
  'Dossier bloqué': 'accueil',

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
  // Multi-secteurs : bagages, staffing, matériel (hôtel/gare/hôpital/ERP)
  'Bagage égaré': 'logistique',
  'Minibar vide': 'logistique',
  'Buffet épuisé': 'logistique',
  'Transats manquants': 'logistique',
  'Bagage bloqué': 'logistique',
  'Personnel insuffisant': 'logistique',
  'Équipement manquant': 'logistique',
  'Encombrement': 'logistique',
  'Médicament indisponible': 'logistique',
  'Agent absent': 'logistique',

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
  // Multi-secteurs : confort, litiges, accessibilité (hôtel/gare/hôpital/ERP)
  'Literie inconfortable': 'other',
  'Vue obstruée': 'other',
  'Isolation phonique': 'other',
  'Service lent': 'other',
  'Plat froid': 'other',
  'Moustiques': 'other',
  'Personnel désagréable': 'other',
  'Accessibilité PMR': 'other',
  'Non accessible PMR': 'other',

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
 *
 * Sector-agnostic : le routing ne dépend QUE du libellé du
 * problemType, pas du secteur (aéroport / hôtel / gare / hôpital /
 * ERP) de la zone signalée.
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

/**
 * Renvoie la liste des codes équipes disponibles.
 * Utile pour les filtres PWA staff, le wallboard ops, etc.
 */
export function getAllTeams(): string[] {
  return ['nettoyage', 'maintenance', 'accueil', 'securite', 'logistique', 'other']
}

/**
 * Renvoie tous les problemTypes connus du routing (clés de la map).
 * Utile pour valider qu'un problemType saisi dans un signalement
 * est bien routable, ou pour construire un audit du coverage.
 */
export function getAllKnownProblems(): string[] {
  return Object.keys(PROBLEM_TO_TEAM)
}
