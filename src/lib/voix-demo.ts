// ============================================================
// FeedVoice - Source unique des annonces de démonstration Nathalie
// ------------------------------------------------------------
// Partagée entre :
//   · src/components/feedbackpro/voice-demo-nathalie.tsx (affichage)
//   · src/app/api/voice/demo/route.ts (synthèse vocale serveur)
// Le texte affiché et le texte synthétisé sont donc STRICTEMENT
// identiques — aucune divergence possible entre l'écrit et le dit.
//
// vitesse : 0.5-2.0 (contrainte API TTS). « doux » = 0.88 (ton posé),
// « normal » = 1.0 (professionnel neutre) — même ressentis que les
// réglages rate/pitch de la Web Speech API utilisés en repli.
// ============================================================

export type ContexteVocalId = "vip" | "airport" | "restaurant" | "hotel"

export interface AnnonceDemo {
  /** Texte exact prononcé par Nathalie (identique au rendu à l'écran). */
  texte: string
  /** Vitesse TTS (0.5-2.0) — plus lent en ton « doux ». */
  vitesse: number
}

export const ANNONCES_DEMO: Record<ContexteVocalId, AnnonceDemo> = {
  vip: {
    texte:
      "Point d'attention : Buffet niveau bas à 35 %. Rafraîchissement recommandé. Table T-08 signale un bruit excessif, intervention discrète en cours.",
    vitesse: 0.88,
  },
  airport: {
    texte:
      "Alerte zone bagages. Tapis numéro 4 arrêté depuis 8 minutes. Équipe maintenance notifiée. Temps d'attente estimé : 15 minutes.",
    vitesse: 1.0,
  },
  restaurant: {
    texte:
      "Attention équipe. Table 12 attend son plat depuis 18 minutes. Cuisine, priorité table 12. Service, vérification en salle.",
    vitesse: 1.0,
  },
  hotel: {
    texte:
      "Bonsoir équipe. Résumé de la nuit : 2 incidents résolus. Chambre 302 a signalé un bruit de climatisation. Maintenance passée, soyez vigilants. Petit-déjeuner : 60 couverts, pic à 8 h 30.",
    vitesse: 0.88,
  },
}

/** Liste des identifiants valides (pour le zod de la route). */
export const IDS_CONTEXTE_VOCAL = Object.keys(ANNONCES_DEMO) as ContexteVocalId[]
