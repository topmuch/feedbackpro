// ============================================================
// FeedbackPro - Données landing partagées
// ------------------------------------------------------------
// Source unique pour les contenus marketing (features, use cases,
// pricing, comparison, testimonials, FAQ) utilisés à la fois par
// la SPA landing (src/components/feedbackpro/landing-view.tsx) et
// par les nouvelles pages App Router (/fonctionnalites, /cas-usage,
// /tarifs, /comparaison, /temoignages, /faq).
// ============================================================

import {
  BarChart3,
  BellRing,
  Bot,
  HeartPulse,
  Hotel,
  Landmark,
  MapPin,
  Package,
  QrCode,
  ScanLine,
  ShoppingBag,
  Trophy,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react"

// ---------- 7 problèmes résolus ----------

export const PROBLEM_CARDS: { emoji: string; titre: string; texte: string }[] = [
  {
    emoji: "🤐",
    titre: "Vos clients mécontents partent sans rien dire",
    texte:
      "96 % des clients insatisfaits ne se plaignent jamais. Ils disparaissent et vous ne le savez que sur un avis Google public, des semaines plus tard.",
  },
  {
    emoji: "💥",
    titre: "Un seul avis négatif détruit votre réputation",
    texte:
      "Sur Google, une note de 2 étoiles affichée pendant 3 mois coûte en moyenne 30 % de réservations. Et vous ne pouvez rien corriger a posteriori.",
  },
  {
    emoji: "🎲",
    titre: "Vous décidez à l'instinct, pas aux données",
    texte:
      "Pas de retour client en temps réel = impossible de savoir quel employé former, quel créneau renforcer, quel plat revoir. Vous pilotez à l'aveugle.",
  },
  {
    emoji: "🐌",
    titre: "Le client mystère traditionnel est trop lent",
    texte:
      "Une visite par mois, un rapport sous 15 jours, 1 500 € par audit. Vous apprenez vos problèmes 6 semaines après qu'ils aient coûté des clients.",
  },
  {
    emoji: "🧩",
    titre: "Vos données sont éparpillées",
    texte:
      "Avis Google, emails, WhatsApp, bouche-à-oreille… Aucune vue consolidée. Aucune priorisation. Vous subissez au lieu de piloter.",
  },
  {
    emoji: "🤝",
    titre: "Vos employés ne savent jamais où ils en sont",
    texte:
      "Sans feedback objectif, l'évaluation reste subjective. Les bons se découragent, les moins bons se croient excellents.",
  },
  {
    emoji: "📊",
    titre: "Aucune action concrète à la fin du mois",
    texte:
      "Vous avez 50 avis ? Et après ? Qu'est-ce qu'on fait lundi matin ? Sans synthèse actionnable, les données ne servent à rien.",
  },
]

// ---------- 4 étapes ----------

export const STEPS: { emoji: string; icone: LucideIcon; image: string; titre: string; texte: string }[] = [
  {
    emoji: "📱",
    icone: QrCode,
    image: "/solution/step1-qr.png",
    titre: "QR Code par zone",
    texte:
      "Un QR code dédié à chaque point de contact (accueil, salle, terrasse, toilettes…). Le client le scanne en 2 secondes.",
  },
  {
    emoji: "⭐",
    icone: ScanLine,
    image: "/solution/step2-scan.png",
    titre: "Scan client en 10 s",
    texte:
      "Le client note de 1 à 5 étoiles et choisit des tags en un clic. Aucune inscription, aucune app à installer.",
  },
  {
    emoji: "🧠",
    icone: Bot,
    image: "/solution/step3-ia.png",
    titre: "L'IA analyse tout",
    texte:
      "Notre Coach IA consolide les retours, détecte les patterns et identifie les priorités du jour automatiquement.",
  },
  {
    emoji: "📊",
    icone: BarChart3,
    image: "/solution/step4-rapport.png",
    titre: "Rapport quotidien",
    texte:
      "Chaque matin, vous recevez un rapport d'audit avec votre score global et vos 3 priorités actionnables.",
  },
]

// ---------- 6 fonctionnalités (Bento grid) ----------

export const FEATURES: {
  icone: LucideIcon
  emoji: string
  titre: string
  texte: string
  grand?: boolean
}[] = [
  {
    icone: Bot,
    emoji: "🤖",
    titre: "Coach IA quotidien",
    texte:
      "Chaque matin, l'IA analyse les retours de la veille et vous livre un rapport d'audit complet avec des recommandations concrètes et vos 3 priorités actionnables du jour.",
    grand: true,
  },
  {
    icone: MapPin,
    emoji: "📍",
    titre: "QR Zones intelligentes",
    texte:
      "Une zone par point de contact (accueil, salle, terrasse, toilettes…) avec son QR dédié et des tags contextuels.",
  },
  {
    icone: Trophy,
    emoji: "🏆",
    titre: "Leaderboard équipe",
    texte:
      "Classez vos employés, valorisez les meilleurs et repérez objectivement les besoins de formation.",
  },
  {
    icone: BellRing,
    emoji: "🔔",
    titre: "Alertes temps réel",
    texte:
      "Un client signale un problème ? Vous êtes alerté sur WhatsApp en quelques secondes pour corriger avant qu'il parte.",
  },
  {
    icone: BarChart3,
    emoji: "📊",
    titre: "Statistiques avancées",
    texte:
      "Suivez vos scores par zone, par jour et par heure. Heatmap, tendances, exports CSV / PDF.",
  },
  {
    icone: Package,
    emoji: "📦",
    titre: "Supports physiques livrés",
    texte:
      "Autocollants, chevalets et affiches haute qualité commandés en 1 clic, livrés prêts à poser sur le terrain.",
  },
]

// ---------- Cas d'usage (5 secteurs) ----------

export const USE_CASES: {
  id: string
  emoji: string
  icone: LucideIcon
  label: string
  points: { titre: string; texte: string }[]
}[] = [
  {
    id: "hotellerie",
    emoji: "🏨",
    icone: Hotel,
    label: "Hôtellerie",
    points: [
      { titre: "Accueil réception", texte: "Score instantané sur le check-in et la prise en charge." },
      { titre: "Chambres & étages", texte: "QR dédiés pour signaler propreté ou confort dès la 1re heure." },
      { titre: "Petit-déjeuner", texte: "Repérez les pics d'attente et ajustez le staff en temps réel." },
      { titre: "Conciergerie", texte: "Mesurez la qualité des recommandations et de la disponibilité." },
    ],
  },
  {
    id: "restauration",
    emoji: "🍽️",
    icone: UtensilsCrossed,
    label: "Restauration",
    points: [
      { titre: "Salle & terrasse", texte: "Notez service, rapidité et amabilité serveur en temps réel." },
      { titre: "Cuisine / plats", texte: "Alerte immédiate sur plat froid, erreur ou délai dépassé." },
      { titre: "Bar & comptoir", texte: "Pilotez les pics (apéro, pause déj) et fluidifiez le service." },
      { titre: "Toilettes", texte: "QR dédié propreté — un signalement = une action immédiate." },
    ],
  },
  {
    id: "retail",
    emoji: "🛍️",
    icone: ShoppingBag,
    label: "Retail",
    points: [
      { titre: "Accueil boutique", texte: "Sondage immédiat sur la disponibilité des vendeurs." },
      { titre: "Conseil produit", texte: "Détectez les manques de formation catalogue par rayon." },
      { titre: "Caisse & file d'attente", texte: "Repérez les créneaux saturés pour renforcer les caisses." },
      { titre: "Cabines & espaces", texte: "QR dédié propreté / rangement des cabines d'essayage." },
    ],
  },
  {
    id: "sante",
    emoji: "🏥",
    icone: HeartPulse,
    label: "Santé",
    points: [
      { titre: "Accueil patient", texte: "Mesurez la qualité d'écoute à la réception et au standard." },
      { titre: "Salle d'attente", texte: "QR dédié : temps d'attente ressenti, confort, propreté." },
      { titre: "Prise de rendez-vous", texte: "Identifiez les frictions (téléphone, plateforme, accueil)." },
      { titre: "Confidentialité", texte: "Captez les retours sur le respect de la vie privée." },
    ],
  },
  {
    id: "administrations",
    emoji: "🏛️",
    icone: Landmark,
    label: "Administrations",
    points: [
      { titre: "Guichet d'accueil", texte: "Notez l'amabilité et la clarté des informations données." },
      { titre: "Files d'attente", texte: "Repérez les pics et optimisez l'organisation des guichets." },
      { titre: "Démarches en ligne", texte: "Sondage sur la clarté des formulaires et procédures." },
      { titre: "Salles / espaces", texte: "QR dédié propreté et signalétique des espaces publics." },
    ],
  },
]

// ---------- Comparatif Traditionnel vs FeedbackPro ----------

export const COMPARISON_ROWS: { critere: string; traditionnel: string; feedbackpro: string }[] = [
  { critere: "Prix", traditionnel: "500 – 1 500 € par visite", feedbackpro: "29 € / mois" },
  { critere: "Fréquence", traditionnel: "1 visite par mois", feedbackpro: "Audit quotidien automatique" },
  { critere: "Couverture", traditionnel: "1 client mystère fictif", feedbackpro: "Tous vos vrais clients" },
  { critere: "Réactivité", traditionnel: "Rapport sous 15 jours", feedbackpro: "Alerte WhatsApp en temps réel" },
  { critere: "Actionnable", traditionnel: "Synthèse qualitative vague", feedbackpro: "Top 3 priorités générées par IA" },
  { critere: "ROI", traditionnel: "6 à 12 mois", feedbackpro: "Moins de 1 mois" },
]

// ---------- Témoignages ----------

export const TESTIMONIALS: {
  nom: string
  poste: string
  etablissement: string
  citation: string
  note: number
  initiales: string
  couleur: string
}[] = [
  {
    nom: "Sophie Marchand",
    poste: "Gérante",
    etablissement: "Bistrot Le Marais, Paris",
    citation:
      "En 3 semaines, on a corrigé un problème d'attente au déjeuner qu'on traînait depuis 2 ans. Le rapport du matin m'a permis de cibler exactement qui former.",
    note: 5,
    initiales: "SM",
    couleur: "from-[#002e85] to-[#0047c7]",
  },
  {
    nom: "Karim Benali",
    poste: "Directeur",
    etablissement: "Hôtel Royal Lyon, 4 ★",
    citation:
      "On a divisé par 4 les avis négatifs Google en 2 mois. Les alertes WhatsApp m'ont sauvé 3 clients qui allaient partir. ROI atteint en 3 semaines.",
    note: 5,
    initiales: "KB",
    couleur: "from-emerald-500 to-teal-500",
  },
  {
    nom: "Émilie Faure",
    poste: "Responsable qualité",
    etablissement: "Maison Vert (8 boutiques)",
    citation:
      "On pilotait 8 boutiques à l'instinct. Aujourd'hui chaque manager reçoit son rapport matinal. Le leaderboard a complètement changé la dynamique d'équipe.",
    note: 5,
    initiales: "EF",
    couleur: "from-[#002e85] to-[#0047c7]",
  },
]

// ---------- FAQ ----------

export const FAQ_ITEMS: { q: string; r: string }[] = [
  {
    q: "Comment fonctionne FeedbackPro concrètement ?",
    r: "Vous créez une zone (accueil, salle, terrasse…), nous générons un QR code dédié. Le client le scanne, note en 10 secondes, choisit des tags. Notre Coach IA analyse tout et vous livre chaque matin un rapport avec vos 3 priorités du jour.",
  },
  {
    q: "Est-ce que le client doit télécharger une application ?",
    r: "Non. Aucune app, aucune inscription. Le client scanne le QR avec son téléphone, répond sur la page web qui s'ouvre, et c'est tout. C'est ce qui fait notre taux de réponse exceptionnel.",
  },
  {
    q: "Combien de temps pour être opérationnel ?",
    r: "Moins de 10 minutes. Vous créez votre compte, ajoutez vos zones, téléchargez vos QR codes (PDF prêt à imprimer) ou commandez nos supports physiques livrés en 3 jours. Le premier rapport arrive dès le lendemain.",
  },
  {
    q: "Comment sont alertés les problèmes en temps réel ?",
    r: "Dès qu'un client laisse une note basse ou sélectionne un tag critique (propreté, attente, impolitesse…), vous recevez une alerte WhatsApp instantanée sur votre téléphone. Vous pouvez intervenir avant que le client ne quitte votre établissement.",
  },
  {
    q: "Quels secteurs sont compatibles ?",
    r: "Tous les secteurs avec un point de contact physique client : restauration, hôtellerie, retail, santé, administrations, salons, garages, transports, etc. Les tags sont adaptés automatiquement au contexte de chaque zone.",
  },
  {
    q: "Mes données et celles de mes clients sont-elles protégées ?",
    r: "Oui. Hébergement européen (RGPD), chiffrement TLS, données 100 % propriétaires et exportables à tout moment. Le client reste anonyme s'il le souhaite. Vous pouvez tout supprimer en 1 clic (droit à l'oubli).",
  },
  {
    q: "Puis-je changer de plan ou résilier à tout moment ?",
    r: "Oui, sans engagement. Vous changez de plan ou résiliez en 1 clic depuis votre espace. Pas de frais cachés, pas de période minimale. Le prorata est calculé automatiquement.",
  },
  {
    q: "Proposez-vous une période d'essai ?",
    r: "Oui, 14 jours d'essai gratuit sur le plan Pro, sans carte bancaire. Vous avez accès à toutes les fonctionnalités, y compris le rapport quotidien et les alertes WhatsApp.",
  },
]

// ---------- Tarifs ----------

export const PRICING: {
  id: "starter" | "pro" | "enterprise"
  nom: string
  prixMensuel: number
  tagline: string
  features: { texte: string; inclus: boolean }[]
  populaire?: boolean
  cta: string
}[] = [
  {
    id: "starter",
    nom: "Starter",
    prixMensuel: 29,
    tagline: "Pour démarrer et prouver la valeur",
    cta: "Commencer gratuitement",
    features: [
      { texte: "Jusqu'à 3 zones de contact", inclus: true },
      { texte: "50 retours / mois", inclus: true },
      { texte: "QR code dédié par zone", inclus: true },
      { texte: "Rapport IA hebdomadaire", inclus: true },
      { texte: "Alertes WhatsApp temps réel", inclus: true },
      { texte: "Rapport IA quotidien", inclus: false },
      { texte: "Leaderboard & formations", inclus: false },
      { texte: "Statistiques avancées + heatmap", inclus: false },
      { texte: "Multi-établissements", inclus: false },
    ],
  },
  {
    id: "pro",
    nom: "Pro",
    prixMensuel: 99,
    tagline: "Le Coach IA complet pour piloter vos équipes",
    populaire: true,
    cta: "Commencer gratuitement",
    features: [
      { texte: "Zones & retours illimités", inclus: true },
      { texte: "Rapport IA quotidien (Coach)", inclus: true },
      { texte: "Top 3 priorités du jour", inclus: true },
      { texte: "Leaderboard & besoins formation", inclus: true },
      { texte: "Statistiques avancées + heatmap", inclus: true },
      { texte: "Exports CSV & PDF", inclus: true },
      { texte: "Alertes WhatsApp temps réel", inclus: true },
      { texte: "Jusqu'à 15 employés", inclus: true },
      { texte: "Multi-établissements", inclus: false },
    ],
  },
  {
    id: "enterprise",
    nom: "Enterprise",
    prixMensuel: 249,
    tagline: "Pour les franchises et groupes multi-sites",
    cta: "Demander une démo",
    features: [
      { texte: "Tout le plan Pro, plus :", inclus: true },
      { texte: "Multi-établissements illimités", inclus: true },
      { texte: "Employés illimités", inclus: true },
      { texte: "Rapports consolidés par site", inclus: true },
      { texte: "API & intégrations sur-mesure", inclus: true },
      { texte: "Support prioritaire dédié", inclus: true },
      { texte: "Onboarding personnalisé", inclus: true },
      { texte: "SLA garanti", inclus: true },
      { texte: "Account manager dédié", inclus: true },
    ],
  },
]
