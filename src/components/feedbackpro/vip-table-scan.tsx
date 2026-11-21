'use client'

// ============================================================
// <VipTableScan /> — Expérience « Nathalie · Luxe Silencieux »
// ------------------------------------------------------------
// Vue client après scan d'un QR code (entrée OU table VIP).
//  ÉCRAN 1 — L'Accueil Magique (QR_GLOBAL) : hero photo salon +
//    voile anthracite, logo du salon EN GRAND, Wi-Fi « copier en
//    1 clic », cartes de Service en verre dépoli, sélecteurs
//    d'emplacement visuels.
//  ÉCRAN 2 — L'Expérience Table (QR_ZONE) : en-tête contextuel
//    « Table T-01 · Vue sur le tarmac », carte Concierge (Amadou),
//    Prêt Express façon vitrine avec coche dorée qui se dessine.
//  ÉCRAN 3 — La Confirmation « WAAHOU » : prénom, promesse, réf.
//    élégante, barre de progression douce.
// Palette « Or & Soie » : #ffffff / var(--fp-gold) / #0f0f1c /
// #bc7155 / #bc7155. Playfair Display (titres) + Inter (corps).
// ============================================================

import { useEffect, useState, useRef, type ChangeEvent } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Armchair,
  Copy,
  Wifi,
  Wine,
  Utensils,
  ShowerHead,
  Plug,
  ConciergeBell,
  AlertTriangle,
  Star,
  Loader2,
  ArrowLeft,
  ArrowRight,
  Moon,
  Sun,
  Sparkles,
  Camera,
  Crown,
  Phone,
  X,
  Check,
  Send,
  Package,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { VipUpsellCatalog } from '@/components/feedbackpro/vip-upsell-catalog'
import { VipShowerReservation } from '@/components/feedbackpro/vip-shower-reservation'
import { VipLoanCatalog } from '@/components/feedbackpro/vip-loan-catalog'

// ============================================================
// Types
// ============================================================
type VipClient = {
  id?: string
  name: string
  vipLevel: string
  preferences: string[]
  allergies?: string[]
  photo?: string | null
  airline?: string | null
  visitCount?: number
}

type ScanTable = {
  id: string
  tableNumber: string
  zone: string
  seats: number
  status: string
  clientName?: string | null
  clientVipLevel?: string | null
  qrToken: string
  vipClient: VipClient | null
}

type RequestType =
  | 'refreshment'
  | 'menu'
  | 'shower'
  | 'charger'
  | 'concierge'
  | 'problem'
  | 'rating'
  | 'upsell'
  | 'loan'

type View = 'main' | 'problem' | 'refreshment' | 'concierge' | 'upsell' | 'shower-reservation' | 'loan' | 'rating'

type Confirmation = {
  type: RequestType
  trackingNumber: string
  tableNumber: string
  // Pré-parsé depuis le `metadata` envoyé (items / tags / requestType…)
  metadata?: any
}

// PWA — événement beforeinstallprompt (Chrome / Edge / Android).
// Capturé tôt (preventDefault pour bloquer la mini-infobar Chrome),
// il permet au bouton « Garder Nathalie » de lancer la VRAIE boîte
// de dialogue d'installation native de la PWA.
type BipEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

// ÉCRAN 2 — Prêt Express : objet vedette affiché en vitrine
// (le client voit « 2 disponibles » en vert sauge, comme en boutique)
type QuickLoanItem = {
  id: string
  name: string
  emoji: string | null
  availableStock: number
  category?: string
}

type ActionDef = {
  type: RequestType
  emoji: string
  label: string
  description: string
  Icon: typeof Wine
  tone: 'gold' | 'bronze' | 'sage' | 'amethyst' | 'terracotta'
  behavior: 'direct' | 'form:refreshment' | 'form:concierge' | 'form:problem' | 'form:upsell' | 'form:shower-reservation' | 'form:loan' | 'form:rating'
}

// ============================================================
// Constantes — palette, actions, tags, menu, concierge
// ============================================================
const SHOWER_AVAILABLE = 3
const CONCIERGE_NAME = 'Amadou'

const ACTIONS: ActionDef[] = [
  {
    type: 'refreshment',
    emoji: '🍸',
    label: 'Commander un rafraîchissement',
    description: 'Champagne, cocktail, café…',
    Icon: Wine,
    tone: 'gold',
    behavior: 'form:refreshment',
  },
  {
    type: 'menu',
    emoji: '📋',
    label: 'Voir le menu du jour',
    description: 'Carte & suggestions du chef',
    Icon: Utensils,
    tone: 'bronze',
    behavior: 'direct',
  },
  {
    type: 'shower',
    emoji: '🚿',
    label: 'Réserver une douche',
    description: `${SHOWER_AVAILABLE} cabines disponibles`,
    Icon: ShowerHead,
    tone: 'sage',
    behavior: 'form:shower-reservation',
  },
  {
    type: 'charger',
    emoji: '🔌',
    label: 'Demander un chargeur',
    description: 'USB-C, Lightning, micro-USB',
    Icon: Plug,
    tone: 'bronze',
    behavior: 'direct',
  },
  {
    type: 'upsell',
    emoji: '✨',
    label: "S'offrir un moment d'exception",
    description: 'Massage, champagne, fast-track, boutique…',
    Icon: Sparkles,
    tone: 'gold',
    behavior: 'form:upsell',
  },
  {
    type: 'loan',
    emoji: '📦',
    label: 'Prêt gratuit',
    description: 'Chargeurs, casques, plaids, presse…',
    Icon: Package,
    tone: 'sage',
    behavior: 'form:loan',
  },
  {
    type: 'concierge',
    emoji: '🛎️',
    label: 'Appeler le concierge',
    description: 'Une demande spécifique ?',
    Icon: ConciergeBell,
    tone: 'amethyst',
    behavior: 'form:concierge',
  },
  {
    type: 'problem',
    emoji: '⚠️',
    label: 'Signaler un problème',
    description: 'Confort, propreté, bruit…',
    Icon: AlertTriangle,
    tone: 'terracotta',
    behavior: 'form:problem',
  },
  {
    type: 'rating',
    emoji: '⭐',
    label: 'Noter mon expérience',
    description: 'Aidez-nous à nous améliorer',
    Icon: Star,
    tone: 'gold',
    behavior: 'form:rating',
  },
]

const TONE_STYLE: Record<
  ActionDef['tone'],
  { bg: string; ring: string; iconText: string; hover: string }
> = {
  gold: {
    bg: 'bg-[var(--fp-gold)]/8',
    ring: 'ring-[var(--fp-gold)]/30',
    iconText: 'text-[var(--fp-gold)]',
    hover: 'hover:bg-[var(--fp-gold)]/12 hover:ring-[var(--fp-gold)]/40',
  },
  bronze: {
    bg: 'bg-[var(--fp-muted)]/8',
    ring: 'ring-[var(--fp-muted)]/30',
    iconText: 'text-[var(--fp-muted)]',
    hover: 'hover:bg-[var(--fp-muted)]/12 hover:ring-[var(--fp-muted)]/40',
  },
  sage: {
    bg: 'bg-[#bc7155]/8',
    ring: 'ring-[#bc7155]/30',
    iconText: 'text-[#bc7155]',
    hover: 'hover:bg-[#bc7155]/12 hover:ring-[#bc7155]/40',
  },
  amethyst: {
    bg: 'bg-[#bc7155]/8',
    ring: 'ring-[#bc7155]/30',
    iconText: 'text-[#bc7155]',
    hover: 'hover:bg-[#bc7155]/12 hover:ring-[#bc7155]/40',
  },
  terracotta: {
    bg: 'bg-[#bc7155]/8',
    ring: 'ring-[#bc7155]/30',
    iconText: 'text-[#bc7155]',
    hover: 'hover:bg-[#bc7155]/12 hover:ring-[#bc7155]/40',
  },
}

const PROBLEM_TAGS = [
  { id: 'bruit', label: 'Bruit excessif', labelEn: 'Excessive noise', emoji: '🔊' },
  { id: 'proprete', label: 'Propreté', labelEn: 'Cleanliness', emoji: '🧹' },
  { id: 'confort', label: 'Confort', labelEn: 'Comfort', emoji: '🛋️' },
  { id: 'temperature', label: 'Température', labelEn: 'Temperature', emoji: '❄️' },
  { id: 'service', label: 'Service lent', labelEn: 'Slow service', emoji: '⏱️' },
  { id: 'equipement', label: 'Équipement HS', labelEn: 'Broken equipment', emoji: '🔌' },
  { id: 'autre', label: 'Autre', labelEn: 'Other', emoji: '✏️' },
] as const

type MenuItem = {
  id: string
  name: string
  /** Nom anglais (sélecteur FR/EN — le nom transmis au staff reste FR) */
  nameEn: string
  emoji: string
  category: string
}

const MENU_ITEMS: MenuItem[] = [
  { id: 'cafe', name: 'Café crème', nameEn: 'Coffee with cream', emoji: '☕', category: 'Boissons chaudes' },
  { id: 'the', name: 'Thé vert', nameEn: 'Green tea', emoji: '🍵', category: 'Boissons chaudes' },
  { id: 'chocolat', name: 'Chocolat chaud', nameEn: 'Hot chocolate', emoji: '🥛', category: 'Boissons chaudes' },
  { id: 'jus', name: "Jus d'orange", nameEn: 'Orange juice', emoji: '🥤', category: 'Boissons fraîches' },
  { id: 'eau', name: 'Eau minérale', nameEn: 'Mineral water', emoji: '💧', category: 'Boissons fraîches' },
  { id: 'soda', name: 'Soda', nameEn: 'Soda', emoji: '🥤', category: 'Boissons fraîches' },
  { id: 'champagne', name: 'Coupe de champagne', nameEn: 'Glass of champagne', emoji: '🥂', category: 'Alcool & Champagne' },
  { id: 'cocktail', name: 'Cocktail maison', nameEn: 'House cocktail', emoji: '🍸', category: 'Alcool & Champagne' },
  { id: 'vin', name: 'Verre de vin', nameEn: 'Glass of wine', emoji: '🍷', category: 'Alcool & Champagne' },
]

const MENU_CATEGORIES: { fr: string; en: string }[] = [
  { fr: 'Boissons chaudes', en: 'Hot drinks' },
  { fr: 'Boissons fraîches', en: 'Cold drinks' },
  { fr: 'Alcool & Champagne', en: 'Alcohol & Champagne' },
]

const CONCIERGE_TYPES = [
  { id: 'taxi', label: 'Réserver un taxi', labelEn: 'Book a taxi', emoji: '🚕' },
  { id: 'vol', label: 'Info sur mon vol', labelEn: 'Flight information', emoji: '✈️' },
  { id: 'appel', label: 'Appel téléphonique', labelEn: 'Phone call', emoji: '📞' },
  { id: 'reunion', label: 'Salle de réunion', labelEn: 'Meeting room', emoji: '💼' },
  { id: 'autre', label: 'Autre demande', labelEn: 'Other request', emoji: '🎁' },
] as const

const ZONE_LABELS: Record<string, string> = {
  main: 'Espace Principal',
  buffet: 'Buffet & Bar',
  relaxation: 'Espace Détente',
  meeting: 'Salles de Réunion',
  // QR_ROUTING — zone proposée uniquement via la modale d'entrée
  terrasse: 'Terrasse',
}

// ÉCRAN 2 — Description contextuelle par zone (« Vue sur le
// tarmac ») : le client est assis, l'écran SAIT déjà où il est.
const ZONE_VIEWS: Record<string, string> = {
  main: 'Vue sur le tarmac',
  buffet: 'Face au buffet du chef',
  relaxation: "L'espace feutré",
  meeting: 'Aile confidentielle',
  terrasse: 'Terrasse plein ciel',
}

// ÉCRAN 1 — Wi-Fi du salon : PAS de valeurs codées en dur. Le Wi-Fi
// vient de la config tenant (/api/vip/lounge-info — champs wifiNom /
// wifiMotDePasse, éditables dans Paramètres → Général). Si le salon
// n'a rien configuré, la carte Wi-Fi est simplement masquée.

// ÉCRAN 1 — Cartes de Service en verre dépoli (Glassmorphism).
// Pourquoi le flou ? Il transforme une liste en vitrine : chaque
// carte est une invitation, pas un bouton d'admin. Chaque carte
// route vers l'ActionDef correspondante (ZONE_REQUIRED et
// formulaires inchangés — aucune régression fonctionnelle).
const SERVICE_CARDS: {
  id: string
  label: string
  /** Libellé anglais (sélecteur FR/EN — voyageurs internationaux) */
  labelEn: string
  desc: string
  descEn: string
  Icon: typeof Wine
  actionType: RequestType
}[] = [
  {
    id: 'detente',
    label: 'Mon Espace Détente',
    labelEn: 'My Relaxation Space',
    desc: 'Plaids, casques, presse',
    descEn: 'Blankets, headphones, press',
    Icon: Armchair,
    actionType: 'loan',
  },
  {
    id: 'gastro',
    label: 'Gastronomie & Bar',
    labelEn: 'Gastronomy & Bar',
    desc: 'Champagne & carte du chef',
    descEn: 'Champagne & the chef’s menu',
    Icon: Wine,
    actionType: 'refreshment',
  },
  {
    id: 'bienetre',
    label: 'Bien-être & Douches',
    labelEn: 'Wellness & Showers',
    desc: 'Cabines privatives',
    descEn: 'Private cabins',
    Icon: ShowerHead,
    actionType: 'shower',
  },
  {
    id: 'concierge',
    label: 'Conciergerie Privée',
    labelEn: 'Private Concierge',
    desc: 'Amadou vous écoute',
    descEn: 'Amadou is listening',
    Icon: ConciergeBell,
    actionType: 'concierge',
  },
]

const ACTIONS_BY_TYPE = Object.fromEntries(
  ACTIONS.map((a) => [a.type, a]),
) as Record<RequestType, ActionDef>

// ÉCRAN 1 — « Autres attentions » : pilules fines sous les cartes
// de service (les 4 grandes cartes portent les services majeurs).
const OTHER_ACTIONS: { def: ActionDef; short: string; shortEn: string }[] = [
  { def: ACTIONS_BY_TYPE.menu, short: 'Menu du jour', shortEn: 'Today’s menu' },
  { def: ACTIONS_BY_TYPE.charger, short: 'Chargeur', shortEn: 'Charger' },
  { def: ACTIONS_BY_TYPE.upsell, short: "Moment d'exception", shortEn: 'Exceptional moment' },
  { def: ACTIONS_BY_TYPE.loan, short: 'Prêt express', shortEn: 'Quick loan' },
  { def: ACTIONS_BY_TYPE.problem, short: 'Signaler', shortEn: 'Report' },
  { def: ACTIONS_BY_TYPE.rating, short: 'Noter', shortEn: 'Rate' },
]

// ÉCRAN 3 — Estimations du temps, formulées comme une promesse
// (jamais un compte à rebours agressif).
const ESTIMATE_LABELS: Partial<Record<RequestType, { fr: string; en: string }>> = {
  refreshment: { fr: 'Livraison estimée · 3–5 min', en: 'Estimated delivery · 3–5 min' },
  charger: { fr: 'Livraison estimée · 2–4 min', en: 'Estimated delivery · 2–4 min' },
  loan: { fr: 'Livraison estimée · 3–6 min', en: 'Estimated delivery · 3–6 min' },
  concierge: { fr: 'Amadou arrive · 1–3 min', en: 'Amadou is on his way · 1–3 min' },
  problem: { fr: 'Intervention · 5–10 min', en: 'Intervention · 5–10 min' },
  shower: { fr: 'Votre cabine est prête', en: 'Your cabin is ready' },
  menu: { fr: 'La carte arrive · quelques secondes', en: 'The menu is on its way · seconds away' },
  upsell: { fr: 'Préparation · 5–8 min', en: 'Preparation · 5–8 min' },
  rating: { fr: '', en: '' },
}

// ============================================================
// QR_ROUTING — Mode CLIENT_GLOBAL (QR d'entrée du salon)
// ============================================================
// Le QR d'ENTRÉE (grand QR sur le chevalet d'accueil) ouvre
// Nathalie SANS table assignée : current_zone = null. Ces
// constantes pilotent l'écran d'accueil GLOBAL et la modale de
// géolocalisation dynamique (« Où êtes-vous installé
// actuellement ? »).
// ============================================================

// Nom par défaut (surchargé par /api/vip/lounge-info — config tenant)
const DEFAULT_LOUNGE_NAME = 'Salon VIP'

// Zones visuelles de la modale + champ libre « Numéro de fauteuil »
const GLOBAL_ZONES: { id: string; label: string; labelEn: string; emoji: string }[] = [
  { id: 'buffet', label: 'Zone Buffet', labelEn: 'Buffet area', emoji: '🍽️' },
  { id: 'relaxation', label: 'Espace Détente', labelEn: 'Relaxation area', emoji: '🛋️' },
  { id: 'terrasse', label: 'Terrasse', labelEn: 'Terrace', emoji: '🌿' },
  { id: 'meeting', label: 'Salles de Réunion', labelEn: 'Meeting rooms', emoji: '💼' },
]

// Actions qui nécessitent de savoir OÙ se trouve le client
// (livraison ou intervention physique). En mode CLIENT_GLOBAL, la
// PREMIÈRE de ces actions déclenche la modale ; l'emplacement est
// ensuite stocké dans la session Nathalie. Les actions sans
// localisation (douche : le client s'y rend lui-même — cf. Scénario
// 1 de la spec ; rating : simple avis) ne la déclenchent JAMAIS.
const ZONE_REQUIRED_TYPES = new Set<RequestType>([
  'refreshment',
  'menu',
  'charger',
  'loan',
  'upsell',
  'concierge',
  'problem',
])

const CONFIRMATION_CONTENT: Record<
  RequestType,
  { title: string; subtitle: string; titleEn: string; subtitleEn: string }
> = {
  refreshment: {
    title: 'Commande envoyée au bar',
    subtitle: 'Le barman prépare votre demande. Livraison estimée : 3-5 min',
    titleEn: 'Order sent to the bar',
    subtitleEn: 'The bartender is preparing your request. Estimated delivery: 3-5 min',
  },
  menu: {
    title: 'Menu envoyé',
    subtitle: 'Le chef vous présente la carte du jour.',
    titleEn: 'Menu sent',
    subtitleEn: "The chef presents today's menu.",
  },
  shower: {
    title: 'Douche réservée',
    subtitle: 'Votre cabine vous attend. Le staff vous guide.',
    titleEn: 'Shower reserved',
    subtitleEn: 'Your cabin awaits. Our staff will guide you.',
  },
  charger: {
    title: 'Chargeur en route',
    subtitle: "Un membre du staff vous l'apporte.",
    titleEn: 'Charger on its way',
    subtitleEn: 'A member of our staff will bring it to you.',
  },
  concierge: {
    title: 'Le concierge arrive',
    subtitle: 'Il vous accompagne dans un instant.',
    titleEn: 'The concierge is on his way',
    subtitleEn: 'He will assist you in a moment.',
  },
  problem: {
    title: 'Signalement transmis',
    subtitle:
      'Notre équipe intervient dans un instant. Votre confort est notre priorité.',
    titleEn: 'Report received',
    subtitleEn: 'Our team is on its way. Your comfort is our priority.',
  },
  rating: {
    title: 'Merci pour votre retour',
    subtitle: 'Votre avis nous aide à parfaire le service.',
    titleEn: 'Thank you for your feedback',
    subtitleEn: 'Your feedback helps us perfect our service.',
  },
  upsell: {
    title: 'Commande transmise',
    subtitle: 'Notre équipe vous sert dans un instant.',
    titleEn: 'Order received',
    subtitleEn: 'Our team will serve you in a moment.',
  },
  loan: {
    title: 'Demande de prêt envoyée',
    subtitle: 'Votre objet vous est apporté à table.',
    titleEn: 'Loan request sent',
    subtitleEn: 'Your item will be brought to your table.',
  },
}

const SERIF = { fontFamily: '"Playfair Display", Georgia, serif' } as const

// ============================================================
// « Option C » — Audio Préchargé + Mode Sombre Luxueux
// ------------------------------------------------------------
// Deux palettes gérées par variables CSS :
//   · Luxe Lumineux — ivoire #ffffff, or champagne #bc7155
//   · Luxe Sombre   — #0f0f1c (jamais noir pur), or lumineux
//     #bc7155, texte crème #F5F5F0, cartes verre assombries
// Transition douce 600 ms entre les deux modes, choix du client
// mémorisé (localStorage). Le :where() laisse les utilitaires
// Tailwind garder la priorité sur les micro-interactions.
// ============================================================
const NATHALIE_CSS = `
.nathalie-root{--fp-bg:#ffffff;--fp-card:#FFFFFF;--fp-g1:#FFFBEF;--fp-g2:#FAF3E0;--fp-g3:#F6EDD7;--fp-text:#2C2C2C;--fp-muted:#8B6F47;--fp-border:#E7DFC9;--fp-gold:#bc7155;transition:background-color .6s ease,color .6s ease}
:where(.nathalie-root) :where(*){transition-property:background-color,border-color,color,fill,stroke;transition-duration:600ms;transition-timing-function:ease}
.nathalie-sombre{--fp-bg:#0f0f1c;--fp-card:#161619;--fp-g1:rgba(255,255,255,0.055);--fp-g2:rgba(255,255,255,0.075);--fp-g3:rgba(255,255,255,0.10);--fp-text:#F5F5F0;--fp-muted:#BFAD92;--fp-border:rgba(212,175,55,0.20);--fp-gold:#bc7155}
@keyframes haloOr{0%{box-shadow:0 0 0 0 rgba(212,175,55,0.45)}70%{box-shadow:0 0 0 26px rgba(212,175,55,0)}100%{box-shadow:0 0 0 0 rgba(212,175,55,0)}}
.halo-or{animation:haloOr 2.6s ease-out infinite}
@keyframes ondeBarre{0%,100%{transform:scaleY(0.35)}50%{transform:scaleY(1)}}
.onde-barre{transform-origin:bottom;animation:ondeBarre 1.05s ease-in-out infinite}
@keyframes brillance{0%{transform:translateX(-130%)}100%{transform:translateX(130%)}}
.btn-shimmer{position:relative;overflow:hidden}
.btn-shimmer::after{content:'';position:absolute;inset:0;background:linear-gradient(110deg,transparent 25%,rgba(255,255,255,0.32) 50%,transparent 75%);transform:translateX(-130%)}
.btn-shimmer:hover::after{animation:brillance 0.9s ease}
`

// ============================================================
// Composant principal
// ============================================================
export function VipTableScan({
  qrToken,
  onExit,
  // QR_ROUTING — type de QR scanné, lu depuis l'URL par page.tsx :
  //   ?qr_type=CLIENT_GLOBAL            → Nathalie SANS table (entrée)
  //   ?qr_type=CLIENT_ZONE&zone_id=<t>  → Nathalie AVEC la table (historique)
  // Défaut 'CLIENT_ZONE' : tout appel existant sans prop garde le
  // comportement contextuel d'origine (aucune régression).
  qrType = 'CLIENT_ZONE',
}: {
  qrToken: string | null
  onExit?: () => void
  qrType?: 'CLIENT_GLOBAL' | 'CLIENT_ZONE'
}) {
  // ============================================================
  // QR_ROUTING — ROUTAGE CONDITIONNEL (if/else sur qr_type)
  // ============================================================
  // isGlobal = true  → QR d'ENTRÉE : current_zone/table_id = NULL,
  //                    écran d'accueil GLOBAL, zone demandée seulement
  //                    quand une action en a besoin.
  // isGlobal = false → QR de TABLE : current_zone = table scannée,
  //                    accueil contextuel « Bienvenue à la Table T-xx ».
  // ============================================================
  const isGlobal = qrType === 'CLIENT_GLOBAL' && !qrToken

  const [table, setTable] = useState<ScanTable | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState<RequestType | null>(null)
  const [view, setView] = useState<View>('main')
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null)
  const [ratingStars, setRatingStars] = useState(0)

  // ---- QR_ROUTING — État du mode CLIENT_GLOBAL (QR d'entrée) ----
  // Nom du salon (config tenant, chargé via /api/vip/lounge-info)
  const [loungeName, setLoungeName] = useState<string>(DEFAULT_LOUNGE_NAME)
  // Logo du salon (config tenant — /api/vip/lounge-info, public).
  // Affiché dans la carte d'accueil du scanner (les deux modes) : le
  // client reconnaît instantanément le salon qu'il vient de scanner.
  const [salonLogo, setSalonLogo] = useState<string | null>(null)
  // Message d'accueil officiel (messageBienvenue — paramètres Denise)
  const [loungeWelcome, setLoungeWelcome] = useState<string>('')
  // Vrai dès que /api/vip/lounge-info a répondu (déclenche la session)
  const [loungeLoaded, setLoungeLoaded] = useState(false)
  // Emplacement choisi dynamiquement par le client — STOCKÉ DANS LA
  // SESSION Nathalie et réutilisé pour chaque demande jusqu'à
  // modification (chip « Modifier »). Null à l'arrivée (QR global).
  const [globalZone, setGlobalZone] = useState<string | null>(null)
  // Modale « Où êtes-vous installé actuellement ? »
  const [zoneModalOpen, setZoneModalOpen] = useState(false)
  const [zoneFauteuil, setZoneFauteuil] = useState('')
  // Action cliquée mise EN ATTENTE du choix de zone (ex: problem)
  const [pendingAction, setPendingAction] = useState<ActionDef | null>(null)

  // ---- « Luxe Silencieux » — micro-interactions ----
  // Wi-Fi : l'icône change au clic (Copy → Check, retour après 2 s)
  const [wifiCopied, setWifiCopied] = useState(false)
  const wifiTimer = useRef<number | null>(null)
  // Sélection de zone en cours : la carte cliquée passe en OR avec
  // une coche ✓ pendant ~450 ms avant confirmation (feedback visible,
  // demande directeur : « la zone sélectionnée doit devenir dorée »).
  const [zoneChoisie, setZoneChoisie] = useState<string | null>(null)
  const zoneTimer = useRef<number | null>(null)
  // Wi-Fi du salon — config tenant (Paramètres → Général). La carte
  // « Copier en 1 clic » n'apparaît QUE si le salon l'a renseigné.
  const [wifiNom, setWifiNom] = useState('')
  const [wifiMotDePasse, setWifiMotDePasse] = useState('')
  // Salutation selon l'heure (« Bonsoir, Cher Hôte ») — calculée
  // côté client uniquement pour éviter tout mismatch d'hydratation
  const [salutation, setSalutation] = useState('Bonsoir')
  // Prêt Express (ÉCRAN 2) — 2 objets vedettes du catalogue de prêt
  const [quickLoans, setQuickLoans] = useState<QuickLoanItem[]>([])
  // Animation « coche dorée qui se dessine » lors d'un Me l'apporter
  const [loanDraw, setLoanDraw] = useState<string | null>(null)

  // ---- « Option C » — Écran d'entrée + audio préchargé (Denise) ----
  // Le navigateur interdit tout son sans geste utilisateur : UN SEUL
  // bouton « Entrer dans le salon » débloque l'audio, lance le
  // message d'accueil de Denise, puis l'écran d'entrée s'efface en
  // fondu (800 ms). Après ce message : SILENCE TOTAL — Denise ne
  // reparle JAMAIS (Mode Discrétion).
  const [entree, setEntree] = useState(false)
  const [gateFondu, setGateFondu] = useState(false)
  const deniseDejaParle = useRef(false)
  const deniseTimers = useRef<number[]>([])
  const [deniseEtat, setDeniseEtat] = useState<'idle' | 'parle' | 'fini'>('idle')
  const [deniseTexte, setDeniseTexte] = useState('')

  // ---- Mode Sombre Luxueux (toggle soleil/lune, persistance) ----
  const [modeSombre, setModeSombre] = useState(false)

  // ---- PWA — « Garder Nathalie » (installation native) ----
  // installEvt : événement beforeinstallprompt capturé au chargement.
  // pwaInstalle : true si la PWA tourne déjà en standalone (on affiche
  // alors « ✓ Nathalie est installée » au lieu du bouton d'install).
  const [installEvt, setInstallEvt] = useState<BipEvent | null>(null)
  const [pwaInstalle, setPwaInstalle] = useState(false)

  // ---- Toast élégant (jamais d'alert() brut) ----
  const [toast, setToast] = useState<{ msg: string; emoji: string } | null>(null)
  const toastTimer = useRef<number | null>(null)

  // ---- Timer de session EN TEMPS RÉEL (4 h, pied de page) ----
  const [sessionFin, setSessionFin] = useState<number | null>(null)
  const [sessionRestant, setSessionRestant] = useState('4 h 00')

  // ---- Module 3 — Détection langue + Module 11 — Session Nathalie ----
  const [detectedLang, setDetectedLang] = useState<string>('fr')
  const [sessionToken, setSessionToken] = useState<string | null>(null)

  // ---- États spécifiques aux formulaires ----
  // Problem
  const [problemTags, setProblemTags] = useState<string[]>([])
  const [problemDescription, setProblemDescription] = useState('')
  const [problemPhoto, setProblemPhoto] = useState<File | null>(null)
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Refreshment
  const [cart, setCart] = useState<Record<string, number>>({})

  // Concierge
  const [conciergeType, setConciergeType] = useState<string | null>(null)
  const [conciergeDetails, setConciergeDetails] = useState('')

  // ---- Prévisualisation photo (avec cleanup) ----
  useEffect(() => {
    if (!problemPhoto) {
      setPhotoPreviewUrl(null)
      return
    }
    const url = URL.createObjectURL(problemPhoto)
    setPhotoPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [problemPhoto])

  // ---- Config tenant : logo + nom du salon (LES DEUX modes) ----
  // Le QR de table (CLIENT_ZONE) doit afficher le logo du salon au
  // même titre que le QR d'entrée (CLIENT_GLOBAL) : fetch public,
  // indépendant de la résolution de table, jamais bloquant.
  useEffect(() => {
    let cancelled = false
    fetch('/api/vip/lounge-info', { cache: 'no-store' })
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return
        if (json?.ok && json.data?.logo) setSalonLogo(json.data.logo)
        if (json?.ok && json.data?.nom) setLoungeName(json.data.nom)
        // ÉCRAN 1 — Wi-Fi du salon (config tenant, public)
        if (json?.ok && typeof json.data?.wifiNom === 'string') {
          setWifiNom(json.data.wifiNom)
        }
        if (json?.ok && typeof json.data?.wifiMotDePasse === 'string') {
          setWifiMotDePasse(json.data.wifiMotDePasse)
        }
      })
      .catch(() => {
        /* silencieux : le scanner doit toujours s'afficher */
      })
    return () => {
      cancelled = true
    }
  }, [])

  // ---- PWA — capture beforeinstallprompt + détection « déjà installé » ----
  // Chrome/Edge/Android : l'événement arrive après l'enregistrement du
  // SW (page.tsx) si le manifest est déclaré — on l'intercepte pour
  // brancher notre bouton « Garder Nathalie ». iOS/Safari ne l'émet
  // JAMAIS → le bouton bascule sur le partage natif (repli).
  useEffect(() => {
    const onBip = (e: Event) => {
      e.preventDefault()
      setInstallEvt(e as BipEvent)
    }
    const onInstalled = () => {
      setInstallEvt(null)
      setPwaInstalle(true)
    }
    window.addEventListener('beforeinstallprompt', onBip)
    window.addEventListener('appinstalled', onInstalled)
    // Déjà installée (relance depuis l'icône d'accueil) ?
    try {
      const standalone =
        window.matchMedia('(display-mode: standalone)').matches ||
        (navigator as unknown as { standalone?: boolean }).standalone === true
      if (standalone) setPwaInstalle(true)
    } catch {
      /* ignore */
    }
    return () => {
      window.removeEventListener('beforeinstallprompt', onBip)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  // ---- Résolution du QR scanné (QR_ROUTING — if/else sur le type) ----
  useEffect(() => {
    let cancelled = false

    // ============================================================
    // BRANCHE 1 — ?qr_type=CLIENT_GLOBAL (QR d'ENTRÉE sur le chevalet)
    // ------------------------------------------------------------
    // AUCUNE résolution de table : current_zone/table_id restent à
    // NULL. Nathalie affiche l'écran d'accueil GLOBAL avec le nom du
    // salon (config tenant — jamais codé en dur).
    // ============================================================
    if (isGlobal) {
      setLoading(true)
      setError(null)
      fetch('/api/vip/lounge-info', { cache: 'no-store' })
        .then((r) => r.json())
        .then((json) => {
          if (cancelled) return
          if (json?.ok && json.data?.nom) setLoungeName(json.data.nom)
          if (json?.ok && json.data?.messageBienvenue) {
            setLoungeWelcome(json.data.messageBienvenue)
          }
          setLoading(false)
          setLoungeLoaded(true)
        })
        .catch(() => {
          if (cancelled) return
          // L'accueil ne doit JAMAIS planter : les défauts
          // (loungeName) sont déjà en place.
          setLoading(false)
          setLoungeLoaded(true)
        })
      return () => {
        cancelled = true
      }
    }

    // ============================================================
    // BRANCHE 2 — ?qr_type=CLIENT_ZONE (QR de table, COMPORTEMENT
    // HISTORIQUE CONSERVÉ à l'identique)
    // ============================================================
    setLoading(true)
    setError(null)
    // deviceId persistant (localStorage) → reconnaissance "retour client"
    let deviceId: string | null = null
    try {
      deviceId = localStorage.getItem('fp_vip_device_id')
      if (!deviceId) {
        deviceId = `dev-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
        localStorage.setItem('fp_vip_device_id', deviceId)
      }
    } catch {
      deviceId = null
    }
    const qs = deviceId ? `?deviceId=${encodeURIComponent(deviceId)}` : ''
    fetch(`/api/vip/tables/by-qr/${encodeURIComponent(qrToken ?? '')}${qs}`, {
      cache: 'no-store',
    })
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return
        if (!json?.ok) {
          setError(json?.error || 'QR code introuvable.')
          setLoading(false)
          return
        }
        const d = json.data
        // CLIENT_ZONE — current_zone = table scannée (contexte direct)
        setTable({
          id: d.id ?? qrToken ?? '',
          tableNumber: d.tableNumber,
          zone: d.zone,
          seats: d.seats,
          status: d.status ?? 'occupied',
          clientName: d.clientName ?? null,
          clientVipLevel: d.clientVipLevel ?? null,
          qrToken: qrToken ?? '',
          vipClient: d.vipClient ?? null,
        })
        setLoading(false)
      })
      .catch(() => {
        if (cancelled) return
        setError('Erreur réseau. Vérifiez votre connexion.')
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [isGlobal, qrToken])

  // ---- Module 3 — Détection automatique de langue (FR/EN/AR/ES/DE/PT/WO) ----
  useEffect(() => {
    if (typeof navigator === 'undefined') return
    const lang = navigator.language || (navigator.languages && navigator.languages[0]) || 'fr'
    const code = lang.split('-')[0].toLowerCase()
    if (['fr', 'en', 'ar', 'es', 'de', 'pt', 'it', 'zh', 'wo'].includes(code)) {
      setDetectedLang(code)
    }
  }, [])

  // ---- Module 11 — Session Nathalie (création/reprise, expiry 4h) ----
  // QR_ROUTING — la session 4 h fonctionne pour LES DEUX types de QR
  // (critère d'acceptation) :
  //   CLIENT_GLOBAL → qrType 'CLIENT_GLOBAL', contextZone = null
  //   CLIENT_ZONE   → qrType 'CLIENT_ZONE',  contextZone = n° de table
  useEffect(() => {
    // Attente du contexte : info salon (global) OU table résolue (zone)
    if (isGlobal) {
      if (!loungeLoaded) return
    } else if (!table) {
      return
    }
    try {
      let deviceId = localStorage.getItem('fp_device_id')
      if (!deviceId) {
        deviceId = `dev-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
        localStorage.setItem('fp_device_id', deviceId)
      }
      fetch('/api/vip/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // QR_ROUTING — le type de QR scanné est enregistré tel quel
          qrType: isGlobal ? 'CLIENT_GLOBAL' : 'CLIENT_ZONE',
          // CLIENT_GLOBAL → AUCUNE table assignée (null)
          contextZone: isGlobal ? null : (table?.tableNumber ?? null),
          deviceId,
        }),
      })
        .then((r) => r.json())
        .then((json) => {
          if (json?.ok && json.data?.token) {
            setSessionToken(json.data.token)
          }
        })
        .catch(() => {})
    } catch {
      /* localStorage indisponible */
    }
  }, [isGlobal, table, loungeLoaded])

  // ---- « Luxe Silencieux » — salutation selon l'heure (client only) ----
  useEffect(() => {
    const h = new Date().getHours()
    setSalutation(h < 12 ? 'Bonjour' : h < 18 ? 'Bon après-midi' : 'Bonsoir')
  }, [])

  // ---- Mode Sombre — choix du client mémorisé (localStorage) ----
  // « Le choix du client est respecté » : relu à chaque visite.
  useEffect(() => {
    try {
      setModeSombre(window.localStorage.getItem('nathalie-mode') === 'sombre')
    } catch {
      /* localStorage indisponible */
    }
  }, [])

  const basculerMode = () => {
    setModeSombre((v) => {
      const suivant = !v
      try {
        window.localStorage.setItem('nathalie-mode', suivant ? 'sombre' : 'lumineux')
      } catch {
        /* ignore */
      }
      return suivant
    })
  }

  // ---- FR / EN — sélecteur de langue discret (Module 3 évolué) ----
  // Les voyageurs internationaux ont souvent un téléphone configuré
  // dans une autre langue : Nathalie démarre dans la langue du
  // navigateur (en* → EN, sinon FR) et le client bascule FR/EN via
  // la pilule en haut à droite. Choix mémorisé dans localStorage
  // 'nathalie-lang' (même philosophie que 'nathalie-mode').
  const [langue, setLangue] = useState<'fr' | 'en'>('fr')
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem('nathalie-lang')
      if (saved === 'fr' || saved === 'en') {
        setLangue(saved)
        return
      }
    } catch {
      /* localStorage indisponible */
    }
    const nav = (navigator.language || 'fr').toLowerCase()
    setLangue(nav.startsWith('en') ? 'en' : 'fr')
  }, [])
  const changerLangue = (l: 'fr' | 'en') => {
    setLangue(l)
    try {
      window.localStorage.setItem('nathalie-lang', l)
    } catch {
      /* ignore */
    }
  }
  // T('Texte français', 'English text') — traduction inline des
  // libellés de l'expérience client (écran d'entrée, accueil, pied
  // de page). Les libellés envoyés au staff restent en français.
  const T = (fr: string, en: string) => (langue === 'en' ? en : fr)
  // Salutation traduite (l'état reste FR — seule l'affichage s'adapte)
  const salutationAffichee =
    langue === 'en'
      ? salutation === 'Bonjour'
        ? 'Good morning'
        : salutation === 'Bon après-midi'
          ? 'Good afternoon'
          : 'Good evening'
      : salutation
  // Libellé de zone mémorisée affiché dans la langue courante — la
  // valeur stockée (et transmise au staff) reste en français.
  // « Fauteuil 12 » (saisie libre) → « Seat 12 » en anglais.
  const afficherZone = (label: string) => {
    if (langue !== 'en') return label
    const z = GLOBAL_ZONES.find((x) => x.label === label)
    if (z?.labelEn) return z.labelEn
    const fauteuil = label.match(/^Fauteuil\s+(.+)$/i)
    return fauteuil ? `Seat ${fauteuil[1]}` : label
  }
  // ---- Formulaires (signalement / rafraîchissement / conciergerie) :
  // libellés AFFICHÉS dans la langue courante. Les valeurs ENVOYÉES au
  // staff (tags, noms du menu, types de demande) restent françaises —
  // seule la couche affichée est traduite.
  const libelleTag = (id: string) => {
    const t = PROBLEM_TAGS.find((x) => x.id === id)
    if (!t) return id
    return langue === 'en' ? t.labelEn : t.label
  }
  const libelleConcierge = (id: string) => {
    const t = CONCIERGE_TYPES.find((x) => x.id === id)
    if (!t) return id
    return langue === 'en' ? t.labelEn : t.label
  }
  const nomMenu = (m: { name: string; nameEn?: string }) =>
    langue === 'en' && m.nameEn ? m.nameEn : m.name
  // ---- Sélecteur FR/EN — pilule discrète assortie au toggle thème
  // (verre + or). Deux segments cliquables, actif = remplissage or.
  const selecteurLangue = (position: string) => (
    <div
      className={cn(
        'fixed top-4 z-[70] flex h-11 items-center gap-0.5 rounded-full border border-[var(--fp-gold)]/40 bg-[var(--fp-g2)] p-1 shadow-[0_6px_24px_rgba(0,0,0,0.18)] backdrop-blur-xl',
        position,
      )}
      role="group"
      aria-label="Langue / Language"
    >
      {(['fr', 'en'] as const).map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => changerLangue(l)}
          aria-pressed={langue === l}
          aria-label={l === 'fr' ? 'Afficher en français' : 'Switch to English'}
          className={cn(
            'flex h-9 min-w-[44px] items-center justify-center rounded-full px-2.5 text-[11px] font-bold uppercase tracking-[0.08em] transition-all duration-300',
            langue === l
              ? 'bg-[var(--fp-gold)] text-[#0f0f1c] shadow-[0_4px_14px_rgba(201,169,97,0.45)]'
              : 'text-[var(--fp-muted)] hover:text-[var(--fp-text)]',
          )}
        >
          {l}
        </button>
      ))}
    </div>
  )

  // ---- Toast élégant ----
  const afficherToast = (msg: string, emoji = '✨') => {
    setToast({ msg, emoji })
    if (toastTimer.current) window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 2600)
  }

  // ---- Timer de session 4 h — décompte temps réel (pied de page) ----
  useEffect(() => {
    if (!sessionToken) return
    setSessionFin(Date.now() + 4 * 60 * 60 * 1000)
  }, [sessionToken])

  useEffect(() => {
    if (!sessionFin) return
    const tic = () => {
      const ms = sessionFin - Date.now()
      if (ms <= 0) {
        setSessionRestant('0 h 00')
        return
      }
      const h = Math.floor(ms / 3600000)
      const m = Math.floor((ms % 3600000) / 60000)
      setSessionRestant(`${h} h ${String(m).padStart(2, '0')}`)
    }
    tic()
    const id = window.setInterval(tic, 10000)
    return () => window.clearInterval(id)
  }, [sessionFin])

  // ---- Denise — message d'accueil vocal (UNE SEULE fois) ----
  // Composé depuis la config tenant : salutation selon l'heure +
  // nom du salon + messageBienvenue (Paramètres → Denise).
  const messageDenise = () => {
    const nom = loungeName || DEFAULT_LOUNGE_NAME
    const suite =
      loungeWelcome?.trim() ||
      'Nathalie, votre guide personnel, est à votre entière disposition.'
    return `${salutation}. Je suis Denise. Bienvenue au ${nom}. ${suite} Belle escale.`
  }

  const terminerDenise = () => {
    setDeniseTexte(messageDenise())
    deniseTimers.current.push(window.setTimeout(() => setDeniseEtat('fini'), 450))
    deniseTimers.current.push(window.setTimeout(() => setDeniseEtat('idle'), 1500))
  }

  const lancerDenise = () => {
    // Verrou éternel : Denise ne se présente qu'UNE fois par session —
    // ensuite, silence de cathédrale (Mode Discrétion).
    if (deniseDejaParle.current) return
    deniseDejaParle.current = true
    const texte = messageDenise()
    const mots = texte.split(/\s+/)
    setDeniseEtat('parle')
    setDeniseTexte('')
    // Révélation du texte mot à mot — cadence douce (~330 ms/mot)
    let idx = 0
    const idReveal = window.setInterval(() => {
      idx += 1
      setDeniseTexte(mots.slice(0, idx).join(' '))
      if (idx >= mots.length) window.clearInterval(idReveal)
    }, 330)
    deniseTimers.current.push(idReveal)
    try {
      // « hasTTS » dans une variable : évite le narrowing TS « never »
      // sur `window` dans la branche else ('speechSynthesis' in window).
      const hasTTS =
        typeof window !== 'undefined' && 'speechSynthesis' in window
      if (hasTTS) {
        const synth = window.speechSynthesis
        synth.cancel()
        const u = new SpeechSynthesisUtterance(texte)
        u.lang = 'fr-FR'
        u.rate = 0.95 // ton doux, posé
        u.pitch = 1.05
        u.volume = 0.9
        const voix =
          synth
            .getVoices()
            .find(
              (v) =>
                v.lang?.toLowerCase().startsWith('fr') &&
                /(google|amélie|amelie|audrey|thomas|marie|denise|virginie)/i.test(v.name),
            ) ??
          synth.getVoices().find((v) => v.lang?.toLowerCase().startsWith('fr')) ??
          null
        if (voix) u.voice = voix
        // Synchro fine quand le navigateur publie les bornes de mots
        u.onboundary = (e) => {
          const ci = e.charIndex ?? 0
          let cum = 0
          let n = 0
          for (const m of mots) {
            if (cum > ci) break
            cum += m.length + 1
            n += 1
          }
          if (n > idx) {
            idx = n
            setDeniseTexte(mots.slice(0, n).join(' '))
          }
        }
        u.onend = terminerDenise
        u.onerror = terminerDenise
        synth.speak(u)
        // Filet de sécurité : si aucune voix ne démarre (voix absente,
        // navigateur muet), le texte déroule seul puis la barre s'efface.
        deniseTimers.current.push(
          window.setTimeout(() => {
            if (!synth.speaking) terminerDenise()
          }, 2600),
        )
      } else {
        // Pas de TTS : le texte défile seul, puis silence complet.
        deniseTimers.current.push(
          window.setTimeout(terminerDenise, mots.length * 330 + 900),
        )
      }
    } catch {
      terminerDenise()
    }
  }

  // Denise — nettoyage complet au démontage (jamais de voix orpheline)
  useEffect(() => {
    return () => {
      deniseTimers.current.forEach((t) => window.clearTimeout(t))
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel()
      }
    }
  }, [])

  // ---- « Option C » — Entrée dans le salon (débloque l'audio) ----
  const entrerDansLeSalon = () => {
    if (entree || gateFondu) return
    lancerDenise() // le geste utilisateur = la clé du son (policy)
    setGateFondu(true) // fondu de sortie 800 ms
    deniseTimers.current.push(
      window.setTimeout(() => {
        setEntree(true) // Nathalie apparaît (fade-in + cascade)
      }, 850),
    )
  }

  // ---- Denise — « Passer » : le client coupe le message vocal d'un
  // geste discret (barre + voix + révélation mot à mot s'arrêtent
  // net). Denise ne reparle jamais ensuite (Mode Discrétion).
  const passerDenise = () => {
    deniseTimers.current.forEach((t) => window.clearTimeout(t))
    deniseTimers.current = []
    try {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel()
      }
    } catch {
      /* ignore */
    }
    setDeniseEtat('fini')
    deniseTimers.current.push(window.setTimeout(() => setDeniseEtat('idle'), 350))
  }

  // ---- ÉCRAN 2 — Prêt Express : 2 objets vedettes (casques & plaids
  // priorisés selon le brief DA), stock temps réel du catalogue ----
  useEffect(() => {
    if (isGlobal || !table) return
    let cancelled = false
    fetch('/api/vip/loan-items', { cache: 'no-store' })
      .then((r) => r.json())
      .then((json) => {
        if (cancelled || !json?.ok || !Array.isArray(json.data)) return
        const vedettes = (json.data as any[])
          .filter((i) => i?.active !== false && (i?.availableStock ?? 0) > 0)
          .sort((a, b) => {
            const pa =
              a.category === 'headphone' || a.category === 'blanket' ? 0 : 1
            const pb =
              b.category === 'headphone' || b.category === 'blanket' ? 0 : 1
            return pa - pb || (b.availableStock ?? 0) - (a.availableStock ?? 0)
          })
          .slice(0, 2)
          .map(
            (i): QuickLoanItem => ({
              id: i.id,
              name: i.name,
              emoji: i.emoji ?? null,
              availableStock: i.availableStock,
              category: i.category,
            }),
          )
        setQuickLoans(vedettes)
      })
      .catch(() => {
        /* silencieux : le prêt express est un bonus, jamais bloquant */
      })
    return () => {
      cancelled = true
    }
  }, [isGlobal, table])

  // ---- Helpers ----
  const safeParse = (s: string) => {
    try {
      return JSON.parse(s)
    } catch {
      return s
    }
  }

  const zoneLabel = (z: string) => ZONE_LABELS[z] ?? z

  // QR_ROUTING — libellés d'emplacement selon le mode :
  //   CLIENT_ZONE  → « Table T-05 » (contexte direct)
  //   CLIENT_GLOBAL → « Zone Buffet » / « Fauteuil 12 » / « Salon VIP »
  const locationLabel = isGlobal
    ? globalZone ?? DEFAULT_LOUNGE_NAME
    : table?.tableNumber ?? ''
  // En-tête des vues secondaires (problème, commande, concierge…) —
  // affiché dans la langue courante, la valeur stockée reste française.
  const headerLocation = isGlobal
    ? globalZone
      ? langue === 'en'
        ? `Seated: ${afficherZone(globalZone)}`
        : `Installé : ${globalZone}`
      : T('Salon VIP', 'VIP Lounge')
    : `${T('Table', 'Table')} ${table?.tableNumber ?? ''}`

  const cartCount = Object.values(cart).reduce((a, b) => a + b, 0)
  const cartItems = MENU_ITEMS.filter((m) => (cart[m.id] ?? 0) > 0)

  // Racines d'écrans — thème Nathalie (lumineux/sombre) + transition douce
  // Le fond fait partie de la racine : chaque vue hérite de la palette.
  const racineCls = cn(
    'nathalie-root min-h-screen bg-[var(--fp-bg)]',
    modeSombre && 'nathalie-sombre',
  )

  // ---- Envoi d'une demande via POST /api/vip/requests ----
  const sendRequest = async (
    type: RequestType,
    opts?: { message?: string; metadata?: string; zone?: string },
  ) => {
    // CLIENT_ZONE → table requise ; CLIENT_GLOBAL → pas de table
    if (!isGlobal && !table) return
    setSending(type)
    setError(null)
    try {
      const res = await fetch('/api/vip/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          isGlobal
            ? {
                // QR_ROUTING — BRANCHE CLIENT_GLOBAL (QR d'entrée) :
                // AUCUN qrToken/tableId. L'emplacement déclaré dans la
                // session Nathalie (modale) accompagne la demande via
                // contextZone. Pour 'rating' il peut rester null.
                type,
                message: opts?.message,
                metadata: opts?.metadata,
                contextZone: opts?.zone ?? globalZone ?? undefined,
              }
            : {
                // QR_ROUTING — BRANCHE CLIENT_ZONE (QR de table,
                // inchangé) : la commande part avec la mention Table.
                qrToken: table?.qrToken,
                type,
                message: opts?.message,
                metadata: opts?.metadata,
              },
        ),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || 'Erreur')
      }
      const meta = opts?.metadata ? safeParse(opts.metadata) : undefined
      setConfirmation({
        type,
        trackingNumber: json.data?.trackingNumber ?? '—',
        // CLIENT_ZONE → n° de table · CLIENT_GLOBAL → emplacement choisi
        tableNumber:
          json.data?.table?.tableNumber ??
          json.data?.contextZone ??
          opts?.zone ??
          globalZone ??
          locationLabel,
        metadata: meta,
      })
      setView('main')
      // Reset des états de formulaires (prêt pour la prochaine demande)
      setProblemTags([])
      setProblemDescription('')
      setProblemPhoto(null)
      setCart({})
      setConciergeType(null)
      setConciergeDetails('')
    } catch {
      setError(
        T(
          "Impossible d'envoyer votre demande. Réessayez dans un instant.",
          'Unable to send your request. Please try again in a moment.',
        ),
      )
    } finally {
      setSending(null)
    }
  }

  // ---- Handlers d'action (cartes principales) ----
  const handleActionClick = (action: ActionDef) => {
    if (sending) return
    // ============================================================
    // QR_ROUTING — GÉOLOCALISATION DYNAMIQUE (mode CLIENT_GLOBAL)
    // ------------------------------------------------------------
    // Le client est entré par le QR du chevalet : il ne sait pas
    // encore où il s'installera. Si l'action nécessite un emplacement
    // (signalement, concierge, commande…) et qu'aucune zone n'est
    // encore connue → modale élégante « Où êtes-vous installé
    // actuellement ? ». Une fois la zone choisie, elle est stockée
    // dans la session Nathalie et l'action reprend automatiquement.
    // ============================================================
    if (isGlobal && ZONE_REQUIRED_TYPES.has(action.type) && !globalZone) {
      setPendingAction(action)
      setZoneModalOpen(true)
      return
    }
    if (action.behavior === 'direct') {
      sendRequest(action.type)
    } else if (action.behavior === 'form:refreshment') {
      setView('refreshment')
    } else if (action.behavior === 'form:concierge') {
      setView('concierge')
    } else if (action.behavior === 'form:problem') {
      setView('problem')
    } else if (action.behavior === 'form:rating') {
      setRatingStars(0)
      setView('rating')
    } else if (action.behavior === 'form:upsell') {
      setView('upsell')
    } else if (action.behavior === 'form:shower-reservation') {
      setView('shower-reservation')
    } else if (action.behavior === 'form:loan') {
      setView('loan')
    }
  }

  // ---- QR_ROUTING — Suite de l'action après choix de zone ----
  // La zone est passée explicitement (le state globalZone n'est pas
  // encore à jour dans ce tick) et stockée dans la session pour les
  // demandes suivantes.
  const confirmZoneSelection = (zone: string) => {
    setGlobalZone(zone)
    setZoneModalOpen(false)
    setZoneFauteuil('')
    afficherToast(
      langue === 'en'
        ? `Seated: ${afficherZone(zone)} — Nathalie has been informed`
        : `Installé : ${zone} — Nathalie est informée`,
      '📍',
    )
    const action = pendingAction
    setPendingAction(null)
    if (!action) return // simple changement d'emplacement (chip Modifier)
    // Reprend l'action mise en attente
    if (action.behavior === 'direct') {
      sendRequest(action.type, { zone })
    } else if (action.behavior === 'form:refreshment') {
      setView('refreshment')
    } else if (action.behavior === 'form:concierge') {
      setView('concierge')
    } else if (action.behavior === 'form:problem') {
      setView('problem')
    } else if (action.behavior === 'form:rating') {
      setRatingStars(0)
      setView('rating')
    } else if (action.behavior === 'form:upsell') {
      setView('upsell')
    } else if (action.behavior === 'form:shower-reservation') {
      setView('shower-reservation')
    } else if (action.behavior === 'form:loan') {
      setView('loan')
    }
  }

  // Annulation de la modale : l'action en attente est abandonnée
  const cancelZoneModal = () => {
    setZoneModalOpen(false)
    setZoneFauteuil('')
    setPendingAction(null)
  }

  const handlePhotoChange = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null
    setProblemPhoto(f)
  }

  const removePhoto = () => {
    setProblemPhoto(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // ---- ÉCRAN 1 — Wi-Fi « Copier en 1 clic » : feedback TOUJOURS visible ----
  // Demande directeur : après le clic, le bouton affiche « ✓ Copié ! »
  // (fond vert sauge) pendant 2 s. Double stratégie de copie :
  //   1. navigator.clipboard (https, navigateurs modernes)
  //   2. repli universel textarea + execCommand (WebViews, iOS,
  //      permissions restreintes) — l'échec silencieux qui laissait
  //      l'utilisateur sans aucun retour est CORRIGÉ ici.
  const copierWifi = async () => {
    const texte = wifiMotDePasse
      ? langue === 'en'
        ? `${wifiNom} — password: ${wifiMotDePasse}`
        : `${wifiNom} — mot de passe : ${wifiMotDePasse}`
      : wifiNom
    let succes = false
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(texte)
        succes = true
      }
    } catch {
      succes = false
    }
    if (!succes) {
      try {
        const ta = document.createElement('textarea')
        ta.value = texte
        ta.setAttribute('readonly', '')
        ta.style.position = 'fixed'
        ta.style.opacity = '0'
        document.body.appendChild(ta)
        ta.select()
        succes = document.execCommand('copy')
        document.body.removeChild(ta)
      } catch {
        succes = false
      }
    }
    if (succes) {
      /* copie réussie — le toast ci-dessous le confirme */
    }
    if (wifiTimer.current) window.clearTimeout(wifiTimer.current)
    setWifiCopied(true)
    afficherToast(
      succes
        ? T(
            'Wi-Fi copié — connexion en un instant',
            'Wi-Fi copied — you will be connected in an instant',
          )
        : T(
            'Mot de passe affiché — copiez-le manuellement',
            'Password displayed — copy it manually',
          ),
      '📶',
    )
    wifiTimer.current = window.setTimeout(() => setWifiCopied(false), 2000)
  }

  // ---- ÉCRAN 1 — Sélection de zone : feedback OR + ✓ avant confirmation ----
  // La carte cliquée devient dorée avec une coche ✓ (~450 ms), PUIS la
  // sélection est confirmée (chip « Installé : … » / fermeture modale).
  // Le garde-fou zoneTimer évite les doubles confirmations de clic.
  const choisirZone = (zone: string) => {
    if (zoneTimer.current) return
    setZoneChoisie(zone)
    zoneTimer.current = window.setTimeout(() => {
      zoneTimer.current = null
      setZoneChoisie(null)
      confirmZoneSelection(zone)
    }, 450)
  }

  // ---- PWA — « Garder Nathalie » : installation native en 1 tap ----
  //   · beforeinstallprompt capturé → prompt() natif (Chrome/Android)
  //   · iOS Safari → partage natif (l'invité choisit « Sur l'écran
  //     d'accueil ») ; à défaut, copie du lien + instructions toast.
  const garderNathalie = async () => {
    if (installEvt) {
      try {
        await installEvt.prompt()
        const choix = await installEvt.userChoice
        if (choix.outcome === 'accepted') {
          setInstallEvt(null)
          setPwaInstalle(true)
          afficherToast(
            T(
              "Nathalie est installée sur votre écran d'accueil",
              'Nathalie has been installed on your home screen',
            ),
            '📱',
          )
        }
      } catch {
        /* installation annulée */
      }
      return
    }
    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({
          title: 'Nathalie — Salon VIP',
          text: T(
            "Gardez Nathalie : Partager → « Sur l'écran d'accueil »",
            'Keep Nathalie: Share → “Add to Home Screen”',
          ),
          url: window.location.href,
        })
        return
      }
      await navigator.clipboard?.writeText(window.location.href)
      afficherToast(
        T(
          "Lien copié — menu Partager → « Sur l'écran d'accueil »",
          'Link copied — Share menu → “Add to Home Screen”',
        ),
        '📱',
      )
    } catch {
      /* partage annulé */
    }
  }

  // ---- ÉCRAN 2 — « Me l'apporter » : la coche dorée se dessine
  // (~900 ms), PUIS la confirmation WAAHOU prend le relais ----
  const apporterQuick = async (item: QuickLoanItem) => {
    if (!table || loanDraw) return
    setLoanDraw(item.id)
    try {
      const res = await fetch('/api/vip/loan-items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId: item.id, tableNumber: table.tableNumber }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.ok) throw new Error(json?.error || 'Erreur')
      // Laisse vivre l'animation avant la carte de confirmation
      setTimeout(() => {
        setLoanDraw(null)
        // Réf. élégante courte (#N-XXXX) — un cuid brut serait un
        // blasphème sur une carte de conciergerie.
        const refCourte = `N-${String(json.data?.id ?? '').slice(-4).toUpperCase() || '0000'}`
        setConfirmation({
          type: 'loan',
          trackingNumber: refCourte,
          tableNumber: table.tableNumber,
          metadata: { loanItem: item.name, items: [{ name: item.name, qty: 1 }] },
        })
        // Stock temps réel — décrémente localement, retire l'objet épuisé
        setQuickLoans((prev) =>
          prev
            .map((x) =>
              x.id === item.id
                ? { ...x, availableStock: Math.max(0, x.availableStock - 1) }
                : x,
            )
            .filter((x) => x.availableStock > 0),
        )
      }, 900)
    } catch {
      setLoanDraw(null)
      setError(
        T(
          "Impossible d'envoyer votre demande. Réessayez dans un instant.",
          'Unable to send your request. Please try again in a moment.',
        ),
      )
    }
  }

  // ---- Soumission des formulaires ----
  const submitProblem = () => {
    if (problemTags.length === 0 && !problemDescription.trim()) return
    const meta = JSON.stringify({
      tags: problemTags,
      description: problemDescription.trim(),
      photoUrl: null, // prêt pour upload futur
    })
    sendRequest('problem', {
      message: problemDescription.trim() || 'Signalement transmis',
      metadata: meta,
    })
  }

  const submitRefreshment = () => {
    if (cartCount === 0) return
    const items = cartItems.map((m) => ({
      name: m.name,
      qty: cart[m.id],
      category: m.category,
    }))
    const summary = items.map((i) => `${i.name} × ${i.qty}`).join(', ')
    sendRequest('refreshment', {
      message: summary,
      metadata: JSON.stringify({ items }),
    })
  }

  const submitConcierge = () => {
    if (!conciergeType) return
    const typeLabel =
      CONCIERGE_TYPES.find((t) => t.id === conciergeType)?.label ?? 'Demande'
    const details = conciergeDetails.trim()
    sendRequest('concierge', {
      message: details || typeLabel,
      metadata: JSON.stringify({ requestType: conciergeType, details }),
    })
  }

  // ============================================================
  // RENDU — Loading
  // ============================================================
  if (loading) {
    return (
      // « L'écran ne charge pas brutalement » — Nathalie se
      // matérialise dans son médailon, halo champagne, aucune
      // brutalité (Mode Discrétion).
      <div className={cn(racineCls, 'flex flex-col items-center justify-center gap-5 px-6')}>
        <style dangerouslySetInnerHTML={{ __html: NATHALIE_CSS }} />
        <div className="relative flex h-24 w-24 items-center justify-center">
          <div
            className="absolute inset-0 animate-pulse rounded-full bg-[var(--fp-gold)]/20 blur-md"
            aria-hidden
          />
          <img
            src="/brand/nathalie-avatar.png"
            alt="Nathalie"
            className="relative h-20 w-20 rounded-full object-cover shadow-[0_4px_20px_rgba(201,169,97,0.30)] ring-2 ring-[var(--fp-gold)]/60"
          />
        </div>
        <p className="text-sm italic text-[var(--fp-muted)]" style={SERIF}>
          {/* QR_ROUTING — libellé adapté au type de QR scanné */}
          {isGlobal ? T('Nathalie arrive…', 'Nathalie is on her way…') : T('Connexion à votre table…', 'Connecting to your table…')}
        </p>
      </div>
    )
  }

  // ============================================================
  // RENDU — Error (avant résolution du QR — CLIENT_ZONE uniquement :
  // en mode global l'info salon ne peut pas échouer bloquamment)
  // ============================================================
  if (error && !isGlobal && !table) {
    return (
      <div className={cn(racineCls, 'flex flex-col items-center justify-center gap-4 px-6 text-center')}>
        <style dangerouslySetInnerHTML={{ __html: NATHALIE_CSS }} />
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#bc7155]/10">
          <AlertTriangle className="h-7 w-7 text-[#bc7155]" aria-hidden />
        </div>
        <h1 className="text-2xl font-semibold text-[var(--fp-text)]" style={SERIF}>
          Oups, ce QR code est introuvable
        </h1>
        <p className="max-w-sm text-sm text-[var(--fp-muted)]">{error}</p>
        <p className="text-xs text-[var(--fp-muted)]/70">
          Demandez à l&apos;hôte du salon de vérifier le QR code affiché sur
          votre table.
        </p>
        {onExit && (
          <Button
            variant="outline"
            onClick={onExit}
            className="mt-2 gap-2 border-[var(--fp-border)] bg-[var(--fp-card)] text-[var(--fp-muted)]"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden /> {T('Retour', 'Back')}
          </Button>
        )}
      </div>
    )
  }

  // QR_ROUTING — en mode CLIENT_GLOBAL il n'y a PAS de table : on ne
  // bloque PAS le rendu sur table null. En mode zone, table est requis.
  if (!isGlobal && !table) return null

  // ============================================================
  // RENDU — « Option C » : ÉCRAN D'ENTRÉE (audio préchargé)
  // ------------------------------------------------------------
  // Fond dégradé sombre, logo pulsant doré, UN SEUL bouton :
  // l'interaction débloque le son du navigateur, lance le message
  // de Denise, puis l'écran d'entrée s'efface en fondu (800 ms).
  // ============================================================
  if (!entree) {
    return (
      <div
        className={cn(
          'nathalie-root flex min-h-screen flex-col items-center justify-center px-6 text-center transition-opacity duration-[800ms] ease-out',
          gateFondu && 'pointer-events-none opacity-0',
        )}
        style={{
          background:
            'radial-gradient(130% 90% at 50% 0%, #201B12 0%, #0f0f1c 48%, #0f0f1c 100%)',
        }}
        aria-label="Écran d'entrée du salon"
      >
        <style dangerouslySetInnerHTML={{ __html: NATHALIE_CSS }} />

        {/* FR / EN — sélecteur discret pour les voyageurs internationaux
            (l'écran d'entrée est le PREMIER contact : on doit pouvoir
            choisir sa langue AVANT d'entrer). */}
        {selecteurLangue('right-4')}

        {/* Logo du salon — pulsation dorée (halo qui respire) */}
        <div className="relative flex h-28 w-28 items-center justify-center">
          <span className="halo-or absolute inset-0 rounded-[28px]" aria-hidden />
          {salonLogo ? (
            <img
              src={salonLogo}
              alt="Logo du salon"
              className="relative h-24 w-24 rounded-[22px] bg-[#FBF7EC] object-contain p-3 shadow-[0_18px_50px_rgba(0,0,0,0.55)] ring-1 ring-[var(--fp-gold)]/60"
            />
          ) : (
            <img
              src="/brand/nathalie-avatar.png"
              alt="Nathalie — votre guide personnel"
              className="relative h-24 w-24 rounded-full object-cover shadow-[0_18px_50px_rgba(0,0,0,0.55)] ring-2 ring-[var(--fp-gold)]/60"
            />
          )}
        </div>

        <p className="mt-8 text-[10px] font-medium uppercase tracking-[0.42em] text-[var(--fp-gold)]">
          {T('Bienvenue', 'Welcome')}
        </p>
        <h1 className="mt-3 text-4xl font-semibold text-[#F5F1E6]" style={SERIF}>
          {loungeName}
        </h1>
        <p
          className="mt-3 max-w-xs text-[15px] italic leading-relaxed text-[#dba28a]"
          style={SERIF}
        >
          {T(
            'Nathalie, votre guide personnel, est à votre entière disposition.',
            'Nathalie, your personal guide, is at your entire disposal.',
          )}
        </p>

        {/* UN SEUL bouton — remplissage or au survol + shimmer */}
        <button
          type="button"
          onClick={entrerDansLeSalon}
          className="btn-shimmer group relative mt-10 inline-flex min-h-[56px] items-center gap-3 overflow-hidden rounded-full border border-[var(--fp-gold)]/60 bg-[var(--fp-gold)]/10 px-9 transition-all duration-300 hover:border-[var(--fp-gold)] hover:shadow-[0_14px_44px_rgba(212,175,55,0.28)]"
          aria-label={T('Entrer dans le salon', 'Enter the lounge')}
        >
          {/* remplissage or — montée douce au survol */}
          <span
            className="absolute inset-0 origin-bottom scale-y-0 bg-gradient-to-t from-[var(--fp-gold)] via-[var(--fp-gold)] to-[#dba28a] transition-transform duration-500 ease-out group-hover:scale-y-100"
            aria-hidden
          />
          <span className="relative z-10 text-[15px] font-medium text-[#F5F1E6] transition-colors duration-300 group-hover:text-[#0f0f1c]">
            {T('Entrer dans le salon', 'Enter the lounge')}
          </span>
          <ArrowRight
            className="relative z-10 h-4 w-4 text-[var(--fp-gold)] transition-all duration-300 group-hover:translate-x-1.5 group-hover:text-[#0f0f1c]"
            aria-hidden
          />
        </button>

        <p className="mt-6 text-[11px] text-[#F5F1E6]/45">
          {T(
            'Une voix douce vous accueillera — votre entrée active le son.',
            'A soft voice will greet you — entering enables sound.',
          )}
        </p>
      </div>
    )
  }

  // ============================================================
  // RENDU — Confirmation (personnalisée par type)
  // ============================================================
  if (confirmation) {
    const conf = CONFIRMATION_CONTENT[confirmation.type]
    const meta = confirmation.metadata

    // Bloc « détails » variable selon le type
    let detailsBox: any = null
    if (confirmation.type === 'refreshment' && meta?.items?.length) {
      detailsBox = (
        <div className="mt-3 space-y-1 border-t border-[var(--fp-border)] pt-3 text-left">
          {meta.items.map((it: any, i: number) => (
            <p key={i} className="text-sm text-[var(--fp-text)]">
              • {nomMenu(it)} × {it.qty}
            </p>
          ))}
        </div>
      )
    } else if (confirmation.type === 'concierge' && meta) {
      const tLabel = libelleConcierge(meta.requestType ?? '')
      detailsBox = (
        <div className="mt-3 space-y-1 border-t border-[var(--fp-border)] pt-3 text-left">
          <p className="text-sm text-[var(--fp-text)]">
            • {T('Demande', 'Request')} : {tLabel}
          </p>
          {meta.details && (
            <p className="text-sm text-[var(--fp-text)]">
              • {T('Détails', 'Details')} : {meta.details}
            </p>
          )}
          <p className="text-sm text-[var(--fp-text)]">
            • {T('Concierge', 'Concierge')} : {CONCIERGE_NAME}
          </p>
        </div>
      )
    } else if (confirmation.type === 'problem' && meta) {
      const tagLabels = (meta.tags ?? []).map((id: string) => {
        const t = PROBLEM_TAGS.find((p) => p.id === id)
        return t ? `${t.emoji} ${libelleTag(id)}` : id
      })
      detailsBox = (
        <div className="mt-3 space-y-1 border-t border-[var(--fp-border)] pt-3 text-left">
          <p className="text-sm text-[var(--fp-text)]">
            • {T('Types', 'Types')} : {tagLabels.join(', ') || T('Signalement', 'Report')}
          </p>
          {meta.description && (
            <p className="text-sm text-[var(--fp-text)]">• {meta.description}</p>
          )}
          <p className="text-sm text-[var(--fp-muted)]">
            • {T('Pris en charge', 'Being handled')} : {T('il y a quelques sec', 'a few seconds ago')}
          </p>
        </div>
      )
    }

    const trackingLabel =
      confirmation.type === 'refreshment'
        ? T('Commande', 'Order')
        : confirmation.type === 'problem'
          ? T('Signalement', 'Report')
          : T('Demande', 'Request')
    // QR_ROUTING — libellé de l'emplacement dans la carte de suivi :
    //   CLIENT_ZONE  → « Table » + n° de table scannée
    //   CLIENT_GLOBAL → « Emplacement » + zone choisie dans la session
    const locationFieldLabel = isGlobal
      ? T('Emplacement', 'Location')
      : T('Table', 'Table')

    // ============================================================
    // ÉCRAN 3 — LA CONFIRMATION « WAAHOU »
    // ------------------------------------------------------------
    // JAMAIS un simple « Demande envoyée » : on adresse au client
    // par son prénom, on formule une promesse, on offre une
    // référence élégante et une barre de progression douce.
    // ============================================================
    const prenom =
      table?.vipClient?.name?.trim().split(/\s+/)[0] || null

    // La promesse — le verbe du service, jamais le jargon technique
    const promesse =
      confirmation.type === 'loan'
        ? langue === 'en'
          ? `${CONCIERGE_NAME} is bringing ${
              meta?.loanItem
                ? `your ${String(meta.loanItem).toLowerCase()}`
                : 'your request'
            } in a moment.`
          : `${CONCIERGE_NAME} vous apporte ${
              meta?.loanItem
                ? `votre ${String(meta.loanItem).toLowerCase()}`
                : 'votre demande'
            } dans un instant.`
        : confirmation.type === 'refreshment'
          ? langue === 'en'
            ? 'The bartender is composing your order — served at your seat.'
            : 'Le barman compose votre commande — servie à votre place.'
          : confirmation.type === 'concierge'
            ? langue === 'en'
              ? `${CONCIERGE_NAME} is coming to assist you.`
              : `${CONCIERGE_NAME} arrive pour vous accompagner.`
            : langue === 'en'
              ? conf.subtitleEn
              : conf.subtitle

    // Référence élégante — formulée comme un savoir-faire maison
    const refLabel =
      confirmation.type === 'refreshment'
        ? T('Réf. Bar', 'Bar ref.')
        : confirmation.type === 'problem'
          ? T('Réf. Intervention', 'Intervention ref.')
          : confirmation.type === 'rating'
            ? T('Réf. Avis', 'Review ref.')
            : T('Réf. Conciergerie', 'Concierge ref.')

    // Estimation du temps — une promesse, pas un chrono
    const estimateLabel =
      (langue === 'en'
        ? ESTIMATE_LABELS[confirmation.type]?.en
        : ESTIMATE_LABELS[confirmation.type]?.fr) ?? ''

    return (
      <div className={cn(racineCls, 'flex flex-col items-center justify-center px-6 py-12 text-center')}>
        <style dangerouslySetInnerHTML={{ __html: NATHALIE_CSS }} />
        {/* Coche dorée qui se dessine — le cercle se trace, la coche
            s'écrit. Halo champagne diffus : vivant, jamais clignotant. */}
        <div className="relative flex h-28 w-28 items-center justify-center">
          <div
            className="absolute inset-0 rounded-full bg-gradient-to-br from-[var(--fp-gold)]/25 via-[var(--fp-gold)]/8 to-[#bc7155]/15 blur-md"
            aria-hidden
          />
          <motion.svg viewBox="0 0 64 64" className="relative h-20 w-20" aria-hidden>
            <motion.circle
              cx="32"
              cy="32"
              r="29"
              fill="none"
              stroke="#bc7155"
              strokeWidth="1.75"
              initial={{ pathLength: 0, opacity: 0.45 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{ duration: 0.9, ease: 'easeOut' }}
            />
            <motion.path
              d="M20 33 L29 42 L45 24"
              fill="none"
              stroke="#bc7155"
              strokeWidth="3.25"
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ delay: 0.6, duration: 0.55, ease: 'easeOut' }}
            />
          </motion.svg>
        </div>

        {/* Titre + promesse — la voix de Nathalie, serif italique */}
        <div className="mt-5">
          <h1
            className="text-[26px] font-semibold leading-snug text-[var(--fp-text)]"
            style={SERIF}
          >
            {T('C’est noté', 'Noted')}{prenom ? `, ${prenom}` : ''}.
          </h1>
          <p className="mt-2 max-w-sm text-sm leading-relaxed text-[var(--fp-muted)]">
            <span className="italic" style={SERIF}>
              {promesse}
            </span>
          </p>
        </div>

        {/* Barre de progression minimale — un fil d'or qui avance
            doucement ; l'estimation est une promesse, pas un compte
            à rebours agressif. */}
        {estimateLabel && (
          <div className="mt-6 w-full max-w-xs">
            <div className="h-[3px] w-full overflow-hidden rounded-full bg-[var(--fp-border)]">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-[var(--fp-gold)]/50 via-[var(--fp-gold)] to-[var(--fp-muted)]"
                initial={{ width: '6%' }}
                animate={{ width: '92%' }}
                transition={{ duration: 7, ease: [0.22, 0.61, 0.36, 1] }}
              />
            </div>
            <p className="mt-2.5 text-[11px] font-medium uppercase tracking-[0.22em] text-[var(--fp-muted)]/80">
              {estimateLabel}
            </p>
          </div>
        )}

        {/* Référence + emplacement — carte ivoire, verre dépoli */}
        <div className="mt-7 w-full max-w-sm rounded-2xl border border-[var(--fp-border)] bg-[var(--fp-g3)] px-5 py-4 text-left shadow-[0_20px_40px_-10px_rgba(0,0,0,0.05)] backdrop-blur">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-[var(--fp-gold)]">
              {refLabel}
            </p>
            <span className="text-[11px] font-medium text-[#bc7155]">
              {T('Pris en charge', 'Being handled')}
            </span>
          </div>
          <p className="mt-1 text-sm font-semibold tracking-wide text-[var(--fp-text)]">
            #{confirmation.trackingNumber}
          </p>
          {detailsBox}
          <div className="mt-3 border-t border-[var(--fp-border)] pt-3">
            <p className="text-[10px] font-medium uppercase tracking-widest text-[var(--fp-muted)]">
              {locationFieldLabel}
            </p>
            <p className="mt-0.5 text-sm font-semibold text-[var(--fp-text)]">
              {confirmation.tableNumber}
            </p>
          </div>
        </div>

        {/* Actions secondaires (variables par type) */}
        <div className="flex flex-wrap items-center justify-center gap-3">
          {confirmation.type === 'refreshment' && (
            <Button
              variant="outline"
              disabled={!!sending}
              onClick={() => sendRequest('menu')}
              className="gap-2 border-[var(--fp-gold)]/40 bg-[var(--fp-gold)]/8 text-[var(--fp-muted)] hover:bg-[var(--fp-gold)]/15"
            >
              {sending === 'menu' ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Utensils className="h-4 w-4" aria-hidden />
              )}
              {T('Voir le menu', 'View the menu')}
            </Button>
          )}
          {confirmation.type === 'problem' && (
            <Button
              variant="outline"
              disabled={!!sending}
              onClick={() => sendRequest('rating')}
              className="gap-2 border-[var(--fp-gold)]/40 bg-[var(--fp-gold)]/8 text-[var(--fp-muted)] hover:bg-[var(--fp-gold)]/15"
            >
              {sending === 'rating' ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Star className="h-4 w-4" aria-hidden />
              )}
              {T("Noter l'intervention", 'Rate the intervention')}
            </Button>
          )}
          <Button
            variant="outline"
            disabled={!!sending}
            onClick={() => setConfirmation(null)}
            className="gap-2 border-[var(--fp-border)] bg-[var(--fp-card)] text-[var(--fp-muted)] hover:bg-[var(--fp-border)]/40"
          >
            <ConciergeBell className="h-4 w-4" aria-hidden />{' '}
            {T('Autre demande', 'New request')}
          </Button>
        </div>

        {/* Erreur inline (si un send secondaire échoue) */}
        {error && (
          <div className="flex max-w-sm items-start gap-3 rounded-2xl border border-[#bc7155]/25 bg-[#bc7155]/8 px-4 py-3 text-sm text-[#bc7155]">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <p className="flex-1">{error}</p>
            <button
              type="button"
              onClick={() => setError(null)}
              className="text-xs font-medium underline"
            >
              {T('Fermer', 'Close')}
            </button>
          </div>
        )}
      </div>
    )
  }

  // ============================================================
  // RENDU — Vue Notation (étoiles 1-5 → metadata.rating)
  // Alimente la métrique Satisfaction du Rapport mensuel.
  // ============================================================
  if (view === 'rating') {
    const LABELS = ['', 'Décevant', 'Correct', 'Bien', 'Excellent', 'Inoubliable']
    return (
      <div className={racineCls}>
        <style dangerouslySetInnerHTML={{ __html: NATHALIE_CSS }} />
        <div className="mx-auto max-w-xl px-4 py-8 sm:px-6 sm:py-12">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-widest text-[var(--fp-muted)]">
                {/* QR_ROUTING — « Table T-05 » en mode zone ·
                    « Installé : Zone Buffet » / « Salon VIP » en global */}
                {headerLocation}
              </p>
              <h1 className="mt-1 text-2xl font-semibold text-[var(--fp-text)]" style={SERIF}>
                ⭐ Noter mon expérience
              </h1>
            </div>
            <Button
              variant="outline"
              onClick={() => setView('main')}
              className="gap-2 border-[var(--fp-border)] bg-[var(--fp-card)] text-[var(--fp-muted)] hover:bg-[var(--fp-border)]/40"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden /> {T('Retour', 'Back')}
            </Button>
          </div>

          <div className="mt-8 rounded-2xl border border-[var(--fp-border)] bg-[var(--fp-card)] p-6 text-center shadow-[0_4px_20px_rgba(201,169,97,0.06)]">
            <p className="text-sm text-[var(--fp-muted)]">Comment s’est passée votre visite ?</p>
            <div className="mt-4 flex items-center justify-center gap-3" role="radiogroup" aria-label="Note de 1 à 5 étoiles">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={ratingStars === n}
                  aria-label={`${n} étoile${n > 1 ? 's' : ''}`}
                  onClick={() => setRatingStars(n)}
                  className="p-1 transition-transform hover:scale-110"
                >
                  <Star
                    className={cn(
                      'h-9 w-9 transition-colors',
                      n <= ratingStars ? 'fill-[var(--fp-gold)] text-[var(--fp-gold)]' : 'text-[var(--fp-border)]',
                    )}
                    aria-hidden
                  />
                </button>
              ))}
            </div>
            {ratingStars > 0 && (
              <p className="mt-3 text-sm font-semibold text-[var(--fp-muted)]" style={SERIF}>
                {LABELS[ratingStars]}
              </p>
            )}
            <Button
              className="mt-6 w-full gap-2 bg-gradient-to-br from-[var(--fp-gold)] to-[var(--fp-muted)] text-white hover:opacity-90"
              disabled={ratingStars === 0 || sending === 'rating'}
              onClick={() =>
                sendRequest('rating', { metadata: JSON.stringify({ rating: ratingStars }) })
              }
            >
              {sending === 'rating' ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Star className="h-4 w-4" aria-hidden />
              )}
              Envoyer ma note
            </Button>
          </div>
        </div>
      </div>
    )
  }

  // ============================================================
  // RENDU — Vue Problème (tags + description + photo)
  // ============================================================
  if (view === 'problem') {
    const canSubmit =
      problemTags.length > 0 || problemDescription.trim().length > 0

    return (
      <div className={racineCls}>
        <style dangerouslySetInnerHTML={{ __html: NATHALIE_CSS }} />
        <div className="mx-auto max-w-xl px-4 py-8 sm:px-6 sm:py-12">
          {/* Header Waaahou — bouton circulaire de verre + titre serif,
              navigation unifiée avec la vue Menu (prototype directeur) */}
          <div className="flex items-center gap-3 py-2">
            <button
              type="button"
              onClick={() => setView('main')}
              aria-label={T('Retour à Nathalie', 'Back to Nathalie')}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--fp-border)] bg-[var(--fp-card)] text-[var(--fp-text)] shadow-[0_4px_16px_rgba(0,0,0,0.06)] backdrop-blur transition-all duration-300 hover:scale-105 hover:border-[var(--fp-gold)] active:scale-95"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden />
            </button>
            <div className="min-w-0">
              <h1 className="text-xl font-semibold text-[var(--fp-text)]" style={SERIF}>
                {T('Signaler un besoin', 'Report a need')}
              </h1>
              <p className="truncate text-[10px] font-medium uppercase tracking-[0.22em] text-[var(--fp-muted)]">
                {headerLocation}
              </p>
            </div>
          </div>

          {/* Promesse de discrétion — la voix de Nathalie, en italique */}
          <p
            className="mt-1 text-[13px] italic leading-relaxed text-[var(--fp-muted)]"
            style={SERIF}
          >
            {T(
              '« Votre confort est notre priorité absolue. Chaque signalement est traité avec la plus grande discrétion. »',
              '“Your comfort is our absolute priority. Every report is handled with the utmost discretion.”',
            )}
          </p>

          <div className="mt-5 space-y-6 rounded-none border border-[var(--fp-border)] bg-[var(--fp-card)] p-5 shadow-[0_4px_20px_rgba(201,169,97,0.06)]">
            {/* Type de besoin — grille 2 colonnes, sélection dorée
                (un clic, la tuile devient or — prototype directeur) */}
            <div>
              <p className="mb-2.5 text-[10px] font-semibold uppercase tracking-[0.3em] text-[var(--fp-muted)]">
                {T('Type de besoin', 'Type of need')}
              </p>
              <div className="grid grid-cols-2 gap-2">
                {PROBLEM_TAGS.map((t) => {
                  const selected = problemTags.includes(t.id)
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() =>
                        setProblemTags((prev) =>
                          prev.includes(t.id)
                            ? prev.filter((x) => x !== t.id)
                            : [...prev, t.id],
                        )
                      }
                      className={cn(
                        'flex min-h-[46px] items-center gap-2 rounded-xl border px-3 text-[13px] font-medium transition-all duration-300',
                        selected
                          ? 'border-[var(--fp-gold)] bg-[var(--fp-gold)] text-[#0f0f1c] shadow-[0_10px_26px_-8px_rgba(201,169,97,0.55)]'
                          : 'border-[var(--fp-border)] bg-[var(--fp-card)] text-[var(--fp-text)] hover:-translate-y-0.5 hover:border-[var(--fp-gold)]/60',
                      )}
                    >
                      <span className="text-base" aria-hidden>
                        {t.emoji}
                      </span>
                      <span className="min-w-0 flex-1 text-left leading-tight">
                        {langue === 'en' ? t.labelEn : t.label}
                      </span>
                      {selected && <Check className="h-3.5 w-3.5 shrink-0" aria-hidden />}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Détails (optionnel) */}
            <div>
              <p className="mb-2.5 text-[10px] font-semibold uppercase tracking-[0.3em] text-[var(--fp-muted)]">
                {T('Détails (optionnel)', 'Details (optional)')}
              </p>
              <Textarea
                value={problemDescription}
                onChange={(e) => setProblemDescription(e.target.value)}
                placeholder={T('La table à côté…', 'The table next to me…')}
                className="mt-2 min-h-24 resize-none border-[var(--fp-border)] bg-[var(--fp-card)] text-sm text-[var(--fp-text)] placeholder:text-[var(--fp-muted)]/50 focus-visible:border-[var(--fp-gold)] focus-visible:ring-[var(--fp-gold)]/20"
              />
            </div>

            {/* Photo (optionnel) — zone de dépôt en pointillés, large */}
            <div>
              <p className="mb-2.5 text-[10px] font-semibold uppercase tracking-[0.3em] text-[var(--fp-muted)]">
                {T('Photo (optionnel)', 'Photo (optional)')}
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handlePhotoChange}
                className="hidden"
              />
              <div className="mt-3 flex items-center gap-3">
                {photoPreviewUrl ? (
                  <div className="relative">
                    { }
                    <img
                      src={photoPreviewUrl}
                      alt={T('Aperçu du signalement', 'Report photo preview')}
                      className="h-20 w-20 rounded-xl border border-[var(--fp-border)] object-cover"
                    />
                    <button
                      type="button"
                      onClick={removePhoto}
                      className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full border border-[var(--fp-border)] bg-[var(--fp-card)] text-[var(--fp-muted)] shadow"
                      aria-label={T('Retirer la photo', 'Remove photo')}
                    >
                      <X className="h-3 w-3" aria-hidden />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex w-full flex-col items-center gap-1.5 rounded-2xl border border-dashed border-[var(--fp-gold)]/40 bg-[var(--fp-gold)]/6 px-4 py-6 text-xs font-medium text-[var(--fp-muted)] transition-all duration-300 hover:border-[var(--fp-gold)] hover:bg-[var(--fp-gold)]/10"
                  >
                    <Camera className="h-6 w-6 text-[var(--fp-gold)]" aria-hidden />
                    {T('Ajouter une photo', 'Add a photo')}
                  </button>
                )}
              </div>
            </div>

            {/* Submit */}
            <div className="space-y-3">
              <Button
                type="button"
                disabled={!!sending || !canSubmit}
                onClick={submitProblem}
                className="w-full gap-2 rounded-2xl border border-transparent bg-[#0f0f1c] text-[#F5F1E6] shadow-[0_14px_36px_-10px_rgba(20,17,11,0.5)] transition-all duration-300 hover:border-[var(--fp-gold)] hover:bg-[var(--fp-gold)] hover:text-[#0f0f1c]"
              >
                {sending === 'problem' ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Send className="h-4 w-4" aria-hidden />
                )}
                {T('Transmettre discrètement', 'Send discreetly')}
              </Button>
              <p className="text-center text-xs text-[var(--fp-muted)]">
                {T('🔒 Votre signalement est confidentiel.', '🔒 Your report is confidential.')}
              </p>
            </div>

            {error && (
              <div className="flex items-start gap-3 rounded-2xl border border-[#bc7155]/25 bg-[#bc7155]/8 px-4 py-3 text-sm text-[#bc7155]">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <p className="flex-1">{error}</p>
                <button
                  type="button"
                  onClick={() => setError(null)}
                  className="text-xs font-medium underline"
                >
                  {T('Fermer', 'Close')}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ============================================================
  // RENDU — Vue Rafraîchissement (menu + panier)
  // ============================================================
  if (view === 'refreshment') {
    return (
      <div className={racineCls}>
        <style dangerouslySetInnerHTML={{ __html: NATHALIE_CSS }} />
        <div className="mx-auto max-w-xl px-4 pb-36 pt-8 sm:px-6 sm:pb-40 sm:pt-12">
          {/* Header Waaahou — bouton circulaire de verre + titre serif,
              navigation unifiée avec la vue Signaler */}
          <div className="flex items-center gap-3 py-2">
            <button
              type="button"
              onClick={() => setView('main')}
              aria-label={T('Retour à Nathalie', 'Back to Nathalie')}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--fp-border)] bg-[var(--fp-card)] text-[var(--fp-text)] shadow-[0_4px_16px_rgba(0,0,0,0.06)] backdrop-blur transition-all duration-300 hover:scale-105 hover:border-[var(--fp-gold)] active:scale-95"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden />
            </button>
            <div className="min-w-0">
              <h1 className="text-xl font-semibold text-[var(--fp-text)]" style={SERIF}>
                {T('Gastronomie & Bar', 'Gastronomy & Bar')}
              </h1>
              <p className="truncate text-[10px] font-medium uppercase tracking-[0.22em] text-[var(--fp-muted)]">
                {headerLocation}
              </p>
            </div>
          </div>

          <div className="mt-5 space-y-7 rounded-none border border-[var(--fp-border)] bg-[var(--fp-card)] p-5 pb-6 shadow-[0_4px_20px_rgba(201,169,97,0.06)]">
            {/* Menu groupé par catégorie — titre serif + barre d'or
                (prototype directeur : catégories élégantes) */}
            {MENU_CATEGORIES.map((cat) => (
              <div key={cat.fr}>
                <p
                  className="flex items-center gap-2 text-[17px] font-semibold text-[var(--fp-text)]"
                  style={SERIF}
                >
                  <span
                    className="h-4 w-1 rounded-full bg-[var(--fp-gold)]"
                    aria-hidden
                  />
                  {langue === 'en' ? cat.en : cat.fr}
                </p>
                <div className="mt-3 space-y-2.5">
                  {MENU_ITEMS.filter((m) => m.category === cat.fr).map((m) => {
                    const qty = cart[m.id] ?? 0
                    return (
                      <div
                        key={m.id}
                        className="flex items-center gap-3 rounded-2xl border border-[var(--fp-border)] bg-[var(--fp-bg)] px-3.5 py-3 transition-all duration-300 hover:border-[var(--fp-gold)]/40"
                      >
                        <span className="text-xl" aria-hidden>
                          {m.emoji}
                        </span>
                        <span className="flex-1 text-sm font-medium text-[var(--fp-text)]">
                          {nomMenu(m)}
                        </span>
                        {qty > 0 ? (
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                setCart((p) => ({
                                  ...p,
                                  [m.id]: Math.max(0, qty - 1),
                                }))
                              }
                              className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--fp-border)] bg-[var(--fp-card)] text-[var(--fp-muted)]"
                              aria-label={`${T('Retirer', 'Remove')} ${nomMenu(m)}`}
                            >
                              −
                            </button>
                            <span className="min-w-[1.5rem] text-center text-sm font-semibold text-[var(--fp-text)]">
                              {qty}
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                setCart((p) => ({ ...p, [m.id]: qty + 1 }))
                              }
                              className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--fp-gold)] bg-[var(--fp-gold)]/12 text-[var(--fp-gold)]"
                              aria-label={`${T('Ajouter', 'Add')} ${nomMenu(m)}`}
                            >
                              +
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() =>
                              setCart((p) => ({ ...p, [m.id]: 1 }))
                            }
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--fp-gold)] bg-transparent text-lg leading-none text-[var(--fp-gold)] transition-all duration-300 hover:scale-110 hover:bg-[var(--fp-gold)] hover:text-[#0f0f1c] active:scale-95"
                            aria-label={`${T('Ajouter', 'Add')} ${nomMenu(m)}`}
                          >
                            +
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}

            {/* Invite discrète quand le panier est vide — le vrai panier
                vit désormais dans la pilule FLOTTANTE en bas d'écran */}
            {cartCount === 0 ? (
              <p className="pb-1 text-center text-xs text-[var(--fp-muted)]">
                {T(
                  'Sélectionnez vos boissons — Nathalie s’occupe du reste.',
                  'Select your drinks — Nathalie takes care of the rest.',
                )}
              </p>
            ) : null}

            {error && (
              <div className="flex items-start gap-3 rounded-2xl border border-[#bc7155]/25 bg-[#bc7155]/8 px-4 py-3 text-sm text-[#bc7155]">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <p className="flex-1">{error}</p>
                <button
                  type="button"
                  onClick={() => setError(null)}
                  className="text-xs font-medium underline"
                >
                  {T('Fermer', 'Close')}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Panier FLOTTANT — pilule de verre anthracite, glisse depuis
            le bas dès qu'un article est choisi (prototype directeur).
            La commande part vers le vrai endpoint /api/vip/requests. */}
        <AnimatePresence>
          {cartCount > 0 && (
            <motion.div
              key="cart-flottant"
              initial={{ y: 90, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 90, opacity: 0 }}
              transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
              className="fixed inset-x-0 bottom-6 z-[80] flex justify-center px-4"
            >
              <div className="flex w-full max-w-md items-center justify-between gap-3 rounded-full border border-[var(--fp-gold)]/35 bg-[#0f0f1c]/95 px-5 py-3 shadow-[0_20px_44px_rgba(0,0,0,0.45)] backdrop-blur-xl">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[#F5F1E6]">
                    {cartCount} {T('article', 'item')}
                    {cartCount > 1 ? 's' : ''}
                  </p>
                  <p className="text-[11px] text-[#F5F1E6]/65">
                    {T('⏱️ Livraison ~ 3 min', '⏱️ Delivery ~ 3 min')}
                  </p>
                </div>
                <Button
                  type="button"
                  disabled={!!sending}
                  onClick={submitRefreshment}
                  className="shrink-0 gap-2 rounded-full border border-[var(--fp-gold)] bg-[var(--fp-gold)] px-5 py-2.5 text-[13px] font-bold text-[#0f0f1c] shadow-[0_8px_22px_-6px_rgba(201,169,97,0.6)] transition-all duration-300 hover:bg-[#dba28a]"
                >
                  {sending === 'refreshment' ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <Send className="h-4 w-4" aria-hidden />
                  )}
                  {T('Commander', 'Order')}
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    )
  }

  // ============================================================
  // RENDU — Vue Concierge (sélecteur + détails)
  // ============================================================
  if (view === 'concierge') {
    return (
      <div className={racineCls}>
        <style dangerouslySetInnerHTML={{ __html: NATHALIE_CSS }} />
        <div className="mx-auto max-w-xl px-4 py-8 sm:px-6 sm:py-12">
          {/* Header */}
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-widest text-[var(--fp-muted)]">
                {/* QR_ROUTING — « Table T-05 » en mode zone ·
                    « Installé : Zone Buffet » / « Salon VIP » en global */}
                {headerLocation}
              </p>
              <h1 className="mt-1 text-2xl font-semibold text-[var(--fp-text)]" style={SERIF}>
                {T('🛎️ Appeler le concierge', '🛎️ Call the concierge')}
              </h1>
            </div>
            <Button
              variant="outline"
              onClick={() => setView('main')}
              className="gap-2 border-[var(--fp-border)] bg-[var(--fp-card)] text-[var(--fp-muted)] hover:bg-[var(--fp-border)]/40"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden /> {T('Retour', 'Back')}
            </Button>
          </div>

          <div className="mt-6 space-y-6 rounded-none border border-[var(--fp-border)] bg-[var(--fp-card)] p-6 shadow-[0_4px_20px_rgba(201,169,97,0.06)]">
            {/* Sélecteur de demande (single-select) */}
            <div>
              <p className="text-sm font-medium text-[var(--fp-text)]">
                {T('Comment pouvons-nous vous aider ?', 'How may we assist you?')}
              </p>
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {CONCIERGE_TYPES.map((t) => {
                  const selected = conciergeType === t.id
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setConciergeType(t.id)}
                      className={cn(
                        'flex items-center gap-2 rounded-xl border px-3 py-3 text-left text-sm font-medium transition-all',
                        selected
                          ? 'border-[#bc7155] bg-[#bc7155]/10 text-[#bc7155]'
                          : 'border-[var(--fp-border)] bg-[var(--fp-bg)] text-[var(--fp-muted)] hover:border-[#bc7155]/40 hover:bg-[#bc7155]/6',
                      )}
                    >
                      <span className="text-xl" aria-hidden>
                        {t.emoji}
                      </span>
                      <span className="flex-1">{langue === 'en' ? t.labelEn : t.label}</span>
                      {selected && <Check className="h-4 w-4" aria-hidden />}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Détails optionnels */}
            <div>
              <p className="text-sm font-medium text-[var(--fp-text)]">
                {T('Détails (optionnel)', 'Details (optional)')} :
              </p>
              <Textarea
                value={conciergeDetails}
                onChange={(e) => setConciergeDetails(e.target.value)}
                placeholder={T('Je souhaite un taxi pour 18h…', 'I would like a taxi for 6 pm…')}
                className="mt-2 min-h-24 resize-none border-[var(--fp-border)] bg-[var(--fp-bg)] text-sm text-[var(--fp-text)] placeholder:text-[var(--fp-muted)]/50 focus-visible:border-[#bc7155] focus-visible:ring-[#bc7155]/20"
              />
            </div>

            {/* Submit */}
            <div className="space-y-3">
              <Button
                type="button"
                disabled={!!sending || !conciergeType}
                onClick={submitConcierge}
                className="w-full gap-2 rounded-2xl border border-[#bc7155] bg-[#bc7155] text-white shadow-[0_4px_20px_rgba(107,76,154,0.18)] hover:bg-[#bc7155]/90"
              >
                {sending === 'concierge' ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Send className="h-4 w-4" aria-hidden />
                )}
                {T('TRANSMETTRE AU CONCIERGE', 'SEND TO THE CONCIERGE')}
              </Button>
              <p className="inline-flex items-center justify-center gap-1.5 text-center text-xs text-[var(--fp-muted)]">
                <Phone className="h-3 w-3" aria-hidden />{' '}
                {T('Concierge disponible :', 'Concierge on duty:')}{' '}
                {CONCIERGE_NAME}
              </p>
            </div>

            {error && (
              <div className="flex items-start gap-3 rounded-2xl border border-[#bc7155]/25 bg-[#bc7155]/8 px-4 py-3 text-sm text-[#bc7155]">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <p className="flex-1">{error}</p>
                <button
                  type="button"
                  onClick={() => setError(null)}
                  className="text-xs font-medium underline"
                >
                  {T('Fermer', 'Close')}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ============================================================
  // RENDU — Vue Upsell (Module 5 — Nathalie integration)
  // QR_ROUTING — fonctionne dans les DEUX modes : tableNumber vaut
  // le n° de table (zone) ou l'emplacement choisi (global).
  // ============================================================
  if (view === 'upsell') {
    return (
      <div className={racineCls}>
        <style dangerouslySetInnerHTML={{ __html: NATHALIE_CSS }} />
        <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6">
          <VipUpsellCatalog
            tableNumber={locationLabel}
            onBack={() => setView('main')}
          />
        </div>
      </div>
    )
  }

  // ============================================================
  // RENDU — Vue Réservation Douche (Module 4 — Smart Shower Queue)
  // QR_ROUTING — Scénario 1 : depuis le QR d'entrée, le client
  // réserve SANS qu'on lui demande sa zone (il ira à la douche).
  // ============================================================
  if (view === 'shower-reservation') {
    return (
      <div className={racineCls}>
        <style dangerouslySetInnerHTML={{ __html: NATHALIE_CSS }} />
        <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6">
          <VipShowerReservation
            tableNumber={locationLabel}
            onBack={() => setView('main')}
          />
        </div>
      </div>
    )
  }

  // ============================================================
  // RENDU — Vue Prêt Express (Module 6 — Prêt gratuit)
  // ============================================================
  if (view === 'loan') {
    return (
      <div className={racineCls}>
        <style dangerouslySetInnerHTML={{ __html: NATHALIE_CSS }} />
        <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6">
          <VipLoanCatalog
            tableNumber={locationLabel}
            onBack={() => setView('main')}
          />
        </div>
      </div>
    )
  }

  // ============================================================
  // RENDU — Vue principale (bandeau + bannière VIP + cartes)
  // ============================================================
  return (
    <div className={racineCls}>
      <style dangerouslySetInnerHTML={{ __html: NATHALIE_CSS }} />

      {/* FR / EN — pilule discrète À GAUCHE du toggle thème (haut droit) */}
      {selecteurLangue('right-[4.5rem]')}

      {/* Mode Sombre Luxueux — toggle discret (icône soleil/lune),
          choix du client mémorisé dans localStorage */}
      <button
        type="button"
        onClick={basculerMode}
        aria-label={modeSombre ? 'Passer en mode clair' : 'Passer en mode sombre'}
        title={modeSombre ? 'Mode clair' : 'Mode sombre'}
        className="fixed right-4 top-4 z-[70] flex h-11 w-11 items-center justify-center rounded-full border border-[var(--fp-gold)]/40 bg-[var(--fp-g2)] shadow-[0_6px_24px_rgba(0,0,0,0.18)] backdrop-blur-xl transition-all duration-300 hover:rotate-12 hover:scale-105 hover:border-[var(--fp-gold)] active:scale-95"
      >
        {modeSombre ? (
          <Sun className="h-5 w-5 text-[var(--fp-gold)]" aria-hidden />
        ) : (
          <Moon className="h-5 w-5 text-[var(--fp-muted)]" aria-hidden />
        )}
      </button>

      {/* Nathalie apparaît — fondu d'entrée doux (700 ms) */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: 'easeOut' }}
        className="mx-auto max-w-xl px-4 py-8 sm:px-6 sm:py-12"
      >  {/* ============================================================
            ROUTAGE DES ÉCRANS —
            ÉCRAN 1 : L'Accueil Magique (QR d'entrée CLIENT_GLOBAL)
            ÉCRAN 2 : L'Expérience Table (QR de table CLIENT_ZONE)
            ============================================================ */}
        {isGlobal ? (
          <div>
            {/* HERO — WAAAHOU v2 : la photo du salon est VISIBLE
                (voile léger 25→60 %, luminosité 88 %) — fini l'ambiance
                « triste ». Badge « Salon VIP » en verre en haut, texte
                ancré en bas : la composition respire. */}
            <div className="relative overflow-hidden rounded-[28px] shadow-[0_20px_40px_-10px_rgba(0,0,0,0.12)]">
              <img
                src="/brand/salon-hero.png"
                alt="L'intérieur du salon"
                className="absolute inset-0 h-full w-full object-cover brightness-[0.88]"
              />
              <div
                className="absolute inset-0 bg-gradient-to-b from-black/25 via-black/30 to-black/65"
                aria-hidden
              />
              {/* Badge « Salon VIP » — UN SEUL badge élégant en haut à
                  gauche (demande directeur : fini les 3 éléments empilés
                  badge central + logo carré + logo rond). Logo du salon
                  gravé dans la pilule de verre quand il est configuré,
                  sinon couronne or. */}
              <div className="absolute left-4 top-4 flex items-center gap-2.5 rounded-2xl border border-[#bc7155]/40 bg-black/60 px-3 py-1.5 backdrop-blur-md">
                {salonLogo ? (
                  <img
                    src={salonLogo}
                    alt="Logo du salon"
                    className="h-7 w-7 rounded-md bg-[#FBF7EC]/95 object-contain p-0.5 ring-1 ring-[#bc7155]/60"
                  />
                ) : (
                  <span
                    className="flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-[#dba28a] to-[#bc7155] text-sm shadow-[0_4px_14px_rgba(201,169,97,0.45)]"
                    aria-hidden
                  >
                    👑
                  </span>
                )}
                <span className="text-[9px] font-semibold uppercase tracking-[0.28em] text-[#F5F5F0]">
                  Salon VIP
                </span>
              </div>
              <div className="relative flex flex-col items-center justify-end px-6 pb-7 pt-16 text-center">
                {/* Message dynamique — « Bonsoir, Cher Hôte. Je suis Nathalie. » */}
                <p className="mt-3 text-[10px] font-medium uppercase tracking-[0.34em] text-[var(--fp-gold)]">
                  {salonLogo ? loungeName : 'Salon VIP'}
                </p>
                <h1
                  className="mt-2 text-[28px] font-semibold leading-tight text-white [text-shadow:0_2px_12px_rgba(0,0,0,0.45)]"
                  style={SERIF}
                >
                  {salutationAffichee},{' '}
                  {table?.vipClient?.name?.trim().split(/\s+/)[0] ?? T('Cher Hôte', 'Dear Guest')}.
                </h1>
                <p className="mt-1 text-lg italic text-[#dba28a]" style={SERIF}>
                  {T('Je suis Nathalie.', 'I am Nathalie.')}
                </p>
                <p className="mt-2.5 max-w-xs text-[13px] leading-relaxed text-white/75">
                  {loungeWelcome ||
                    T(
                      'Votre guide personnel. Comment puis-je rendre votre instant plus doux ?',
                      'Your personal guide. How may I make your moment softer?',
                    )}
                </p>
              </div>
            </div>

            {/* Wi-Fi — l'icône change au clic (Copy → Check) : la
                micro-interaction la plus simple, et pourtant celle qui
                donne le sentiment que « tout répond ». Affiché SEULEMENT
                si le salon a configuré son réseau (Paramètres). */}
            {wifiNom && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.25, ease: 'easeOut' }}
                className="mt-4 flex items-center gap-4 rounded-2xl border border-[var(--fp-gold)]/25 bg-[var(--fp-g2)] px-4 py-3.5 shadow-[0_20px_40px_-10px_rgba(0,0,0,0.05)] backdrop-blur-xl"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--fp-gold)]/10 ring-1 ring-[var(--fp-gold)]/30">
                  <Wifi className="h-5 w-5 text-[var(--fp-gold)]" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-[var(--fp-gold)]">
                    {T('Wi-Fi du salon', 'Lounge Wi-Fi')}
                  </p>
                  <p className="mt-0.5 truncate text-sm font-medium text-[var(--fp-text)]">
                    {wifiNom}
                    {wifiMotDePasse && (
                      <span className="text-[var(--fp-muted)]"> · {wifiMotDePasse}</span>
                    )}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={copierWifi}
                  className={cn(
                    'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-4 py-2.5 text-xs font-semibold transition-all active:scale-[0.96]',
                    wifiCopied
                      ? 'border-[#bc7155] bg-[#bc7155] text-white shadow-[0_8px_22px_-6px_rgba(74,124,89,0.55)]'
                      : 'border-[var(--fp-gold)]/40 bg-[var(--fp-gold)]/8 text-[var(--fp-muted)] hover:bg-[var(--fp-gold)]/15',
                  )}
                  aria-live="polite"
                >
                  {wifiCopied ? (
                    <Check className="h-3.5 w-3.5" aria-hidden />
                  ) : (
                    <Copy className="h-3.5 w-3.5" aria-hidden />
                  )}
                  {wifiCopied ? T('Copié !', 'Copied!') : T('Copier en 1 clic', 'Copy in 1 tap')}
                </button>
              </motion.div>
            )}

            {/* Cartes de Service — verre dépoli, icônes fines Or
                Champagne. Chaque carte est une invitation. */}
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="mt-8 text-[10px] font-medium uppercase tracking-[0.34em] text-[var(--fp-muted)]"
            >
              {T('À votre entière disposition', 'At your entire disposal')}
            </motion.p>
            <div className="mt-3 grid grid-cols-2 gap-3">
              {SERVICE_CARDS.map((card, idxService) => {
                const Icon = card.Icon
                return (
                  <motion.button
                    key={card.id}
                    type="button"
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: 0.35 + idxService * 0.08, ease: 'easeOut' }}
                    onClick={() => handleActionClick(ACTIONS_BY_TYPE[card.actionType])}
                    className="group relative rounded-[20px] border border-[var(--fp-gold)]/25 bg-[var(--fp-g1)] p-5 text-left shadow-[0_10px_30px_-10px_rgba(0,0,0,0.10)] backdrop-blur-xl transition-all duration-300 hover:-translate-y-[3px] hover:border-[var(--fp-gold)]/60 hover:shadow-[0_22px_44px_-12px_rgba(201,169,97,0.38)] active:scale-[0.98] active:border-[var(--fp-gold)]/60"
                    aria-label={card.label}
                  >
                    {/* Flèche d'action — apparaît au survol (invite tactile) */}
                    <span
                      className="absolute right-4 top-4 -translate-x-1 text-lg text-[var(--fp-gold)] opacity-0 transition-all duration-300 group-hover:translate-x-0 group-hover:opacity-80"
                      aria-hidden
                    >
                      →
                    </span>
                    <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-[var(--fp-gold)]/20 to-[var(--fp-gold)]/6 ring-1 ring-[var(--fp-gold)]/30 transition-colors group-hover:from-[var(--fp-gold)]/30 group-hover:to-[var(--fp-gold)]/10">
                      <Icon className="h-5 w-5 text-[var(--fp-gold)]" aria-hidden />
                    </span>
                    <p className="mt-3 text-sm font-semibold text-[var(--fp-text)]" style={SERIF}>
                      {langue === 'en' && card.labelEn ? card.labelEn : card.label}
                    </p>
                    {card.id === 'concierge' ? (
                      <p className="mt-1 flex items-center gap-1.5 text-xs leading-relaxed text-[var(--fp-muted)]">
                        <img
                          src="/brand/amadou-concierge.png"
                          alt="Amadou — concierge privé"
                          className="h-5 w-5 rounded-full object-cover ring-1 ring-[var(--fp-gold)]/50"
                        />
                        {langue === 'en' && card.descEn ? card.descEn : card.desc}
                      </p>
                    ) : (
                      <p className="mt-1 text-xs leading-relaxed text-[var(--fp-muted)]">
                        {langue === 'en' && card.descEn ? card.descEn : card.desc}
                      </p>
                    )}
                  </motion.button>
                )
              })}
            </div>

            {/* Autres attentions — pilules fines, jamais un menu liste */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.55, ease: 'easeOut' }}
              className="mt-4 flex flex-wrap gap-2"
            >
              {OTHER_ACTIONS.map(({ def, short, shortEn }) => (
                <button
                  key={def.type}
                  type="button"
                  disabled={!!sending}
                  onClick={() => handleActionClick(def)}
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-[var(--fp-border)] bg-[var(--fp-g2)] px-4 py-2 text-[13px] font-medium text-[var(--fp-text)] backdrop-blur transition-all duration-300 hover:-translate-y-0.5 hover:border-[var(--fp-gold)] hover:bg-[var(--fp-gold)] hover:text-[#0f0f1c] hover:shadow-[0_10px_26px_-8px_rgba(201,169,97,0.55)] active:scale-[0.96] disabled:opacity-60"
                  aria-label={def.label}
                >
                  <span aria-hidden>{def.emoji}</span>
                  {langue === 'en' && shortEn ? shortEn : short}
                </button>
              ))}
            </motion.div>

            {/* « Où vous trouvez-vous actuellement ? » — sélecteurs
                visuels (petites cartes ivoire), jamais de dropdown. */}
            {!globalZone ? (
              <motion.div
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.55, delay: 0.65, ease: 'easeOut' }}
                className="mt-5 rounded-[24px] border border-[var(--fp-border)] bg-[var(--fp-g3)] p-5 shadow-[0_10px_30px_-10px_rgba(0,0,0,0.08)] backdrop-blur-xl"
              >
                <p className="text-[15px] font-semibold text-[var(--fp-text)]" style={SERIF}>
                  {T('Où vous trouvez-vous actuellement ?', 'Where are you currently seated?')}
                </p>
                <p className="mt-0.5 text-[11px] leading-snug text-[var(--fp-muted)]">
                  {T(
                    'Nathalie transmet votre emplacement avec chaque demande — discret et sans effort.',
                    'Nathalie shares your location with every request — discreet and effortless.',
                  )}
                </p>
                <div className="mt-3.5 grid grid-cols-2 gap-2">
                  {GLOBAL_ZONES.map((z) => {
                    const estChoisie = zoneChoisie === z.label
                    return (
                      <button
                        key={z.id}
                        type="button"
                        onClick={() => choisirZone(z.label)}
                        className={cn(
                          'relative flex min-h-[46px] items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-xs font-medium transition-all duration-300',
                          estChoisie
                            ? 'scale-[0.98] border-[var(--fp-gold)] bg-[var(--fp-gold)] text-[#0f0f1c] shadow-[0_10px_26px_-8px_rgba(201,169,97,0.55)]'
                            : 'border-[var(--fp-border)] bg-[var(--fp-card)] text-[var(--fp-text)] hover:-translate-y-0.5 hover:border-[var(--fp-gold)] hover:bg-[var(--fp-gold)] hover:text-[#0f0f1c] hover:shadow-[0_10px_26px_-8px_rgba(201,169,97,0.55)]',
                        )}
                        aria-label={
                          langue === 'en'
                            ? `I am at: ${z.labelEn ?? z.label}`
                            : `Je suis : ${z.label}`
                        }
                        aria-pressed={estChoisie}
                      >
                        <span
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--fp-gold)]/10 text-sm"
                          aria-hidden
                        >
                          {z.emoji}
                        </span>
                        {langue === 'en' && z.labelEn ? z.labelEn : z.label}
                        {/* Coche ✓ — la zone sélectionnée devient dorée
                            avec une coche visible (demande directeur) */}
                        {estChoisie && (
                          <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-[#0f0f1c]/85 text-[10px] font-bold text-[var(--fp-gold)]" aria-hidden>
                            ✓
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>

                {/* Ou préciser un fauteuil — même élégance, un seul champ */}
                <div className="my-3 flex items-center gap-3" aria-hidden>
                  <span className="h-px flex-1 bg-[var(--fp-border)]" />
                  <span className="text-[9px] font-medium uppercase tracking-[0.28em] text-[var(--fp-muted)]/70">
                    {T('ou', 'or')}
                  </span>
                  <span className="h-px flex-1 bg-[var(--fp-border)]" />
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    const v = zoneFauteuil.trim()
                    if (!v) return
                    // Normalise « 12 » / « Seat 12 » → « Fauteuil 12 »
                    // (valeur staff française ; affichage traduit par
                    // afficherZone).
                    const brut = v.replace(/^(seat|fauteuil)\s*/i, '')
                    const zone = brut ? `Fauteuil ${brut}` : v
                    confirmZoneSelection(zone)
                  }}
                  className="flex gap-2"
                >
                  <Input
                    value={zoneFauteuil}
                    onChange={(e) => setZoneFauteuil(e.target.value)}
                    placeholder={T('Ex : Fauteuil 12', 'e.g. Seat 12')}
                    aria-label={T('Numéro de fauteuil', 'Seat number')}
                    className="border-[var(--fp-border)] bg-[var(--fp-card)] text-sm text-[var(--fp-text)] placeholder:text-[var(--fp-muted)]/50 focus-visible:border-[var(--fp-gold)] focus-visible:ring-[var(--fp-gold)]/20"
                  />
                  <Button
                    type="submit"
                    disabled={!zoneFauteuil.trim()}
                    className="shrink-0 rounded-2xl border border-[var(--fp-gold)] bg-[var(--fp-gold)] text-white shadow-[0_4px_20px_rgba(201,169,97,0.18)] hover:bg-[var(--fp-gold)]/90"
                  >
                    <Check className="h-4 w-4" aria-hidden />
                    <span className="sr-only">{T('Valider mon emplacement', 'Confirm my location')}</span>
                  </Button>
                </form>
              </motion.div>
            ) : (
              /* Emplacement mémorisé — chip + Modifier */
              <div className="mt-6 flex justify-center">
                <div className="inline-flex items-center gap-2 rounded-full border border-[var(--fp-gold)]/40 bg-[var(--fp-gold)]/8 px-4 py-2">
                  <span aria-hidden>📍</span>
                  <span className="text-xs font-medium text-[var(--fp-muted)]">
                    {T('Installé :', 'Seated:')} {afficherZone(globalZone)}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setPendingAction(null)
                      setZoneModalOpen(true)
                    }}
                    className="text-xs font-semibold text-[var(--fp-gold)] underline underline-offset-2 hover:text-[var(--fp-muted)]"
                  >
                    {T('Modifier', 'Change')}
                  </button>
                </div>
              </div>
            )}

            {/* Erreur inline (mode global) */}
            {error && (
              <div className="mt-4 flex items-start gap-3 rounded-2xl border border-[#bc7155]/25 bg-[#bc7155]/8 px-4 py-3 text-sm text-[#bc7155]">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <p className="flex-1">{error}</p>
                <button
                  type="button"
                  onClick={() => setError(null)}
                  className="text-xs font-medium underline"
                >
                  {T('Fermer', 'Close')}
                </button>
              </div>
            )}
          </div>
        ) : (
          <div>
            {/* ============================================================
                ÉCRAN 2 — L'EXPÉRIENCE TABLE (QR Zone T-01)
                Le client est assis : l'écran SAIT déjà où il est.
                ============================================================ */}
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.1, ease: 'easeOut' }}
              className="relative overflow-hidden rounded-[28px] border border-[var(--fp-border)] bg-[var(--fp-card)] px-6 pb-6 pt-7 text-center shadow-[0_20px_40px_-10px_rgba(0,0,0,0.06)]"
            >
              <div
                className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[var(--fp-gold)] via-[var(--fp-muted)] to-[var(--fp-gold)]"
                aria-hidden
              />
              {/* LOGO DU SALON EN GRAND (Paramètres → Général → Logo) */}
              {salonLogo ? (
                <img
                  src={salonLogo}
                  alt="Logo du salon"
                  className="mx-auto h-16 w-16 rounded-xl bg-[#FBF7EC] object-contain p-2 shadow-[0_6px_20px_rgba(201,169,97,0.30)] ring-1 ring-[var(--fp-gold)]/55"
                />
              ) : null}
              <p className="mt-3 text-[10px] font-medium uppercase tracking-[0.34em] text-[var(--fp-gold)]">
                Votre Table
              </p>
              <h1 className="mt-1.5 text-3xl font-semibold text-[var(--fp-text)]" style={SERIF}>
                Table {table?.tableNumber ?? ''}
              </h1>
              <p className="mt-1 text-sm italic text-[var(--fp-muted)]" style={SERIF}>
                {ZONE_VIEWS[table?.zone ?? ''] ?? 'Vue sur le tarmac'}
              </p>
              <p className="mt-2 text-xs text-[var(--fp-muted)]/80">
                {table?.seats} places · {zoneLabel(table?.zone ?? 'main')}
              </p>
            </motion.div>

            {/* Conciergerie — carte proéminente, Amadou en personne.
                Pourquoi un fond anthracite ? Le contraste fait de cette
                carte le point focal ; l'or champagne réserve l'action. */}
            <div className="relative mt-4 overflow-hidden rounded-[24px] bg-gradient-to-br from-[#0f0f1c] via-[#2E2C28] to-[#0f0f1c] p-5 shadow-[0_20px_40px_-10px_rgba(26,26,26,0.35)]">
              <div
                className="pointer-events-none absolute inset-0 opacity-40"
                style={{
                  backgroundImage:
                    'radial-gradient(120% 90% at 15% 0%, rgba(201,169,97,0.18), transparent 55%)',
                }}
                aria-hidden
              />
              <div className="relative flex items-center gap-4">
                <img
                  src="/brand/amadou-concierge.png"
                  alt="Amadou, votre concierge privé"
                  className="h-14 w-14 rounded-full object-cover shadow-[0_4px_16px_rgba(0,0,0,0.4)] ring-2 ring-[var(--fp-gold)]/70"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-medium uppercase tracking-[0.28em] text-[var(--fp-gold)]">
                    Conciergerie Privée
                  </p>
                  <p className="mt-0.5 text-sm font-medium text-white/90">
                    {CONCIERGE_NAME} est à votre disposition
                  </p>
                </div>
              </div>
              <Button
                type="button"
                onClick={() => setView('concierge')}
                className="relative mt-4 w-full gap-2 rounded-2xl bg-[var(--fp-gold)] font-semibold text-[#0f0f1c] shadow-[0_8px_24px_rgba(201,169,97,0.35)] hover:bg-[var(--fp-gold)]/90"
              >
                <ConciergeBell className="h-4 w-4" aria-hidden />
                Appeler votre Concierge
              </Button>
            </div>

            {/* Prêt Express — présenté comme une vitrine de boutique :
                médaillon ivoire, badge vert sauge « X disponibles »,
                « Me l'apporter » → coche dorée qui se dessine. */}
            {quickLoans.length > 0 && (
              <div className="mt-4 rounded-[24px] border border-[var(--fp-border)] bg-[var(--fp-card)] p-5 shadow-[0_20px_40px_-10px_rgba(0,0,0,0.05)]">
                <div className="flex items-center justify-between">
                  <p className="text-base font-semibold text-[var(--fp-text)]" style={SERIF}>
                    Prêt Express
                  </p>
                  <button
                    type="button"
                    onClick={() => setView('loan')}
                    className="text-xs font-semibold text-[var(--fp-gold)] underline-offset-2 hover:underline"
                  >
                    Voir tout
                  </button>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  {quickLoans.map((item) => (
                    <div
                      key={item.id}
                      className="relative overflow-hidden rounded-2xl border border-[var(--fp-border)] bg-[var(--fp-bg)] p-4 text-center"
                    >
                      {/* Coche dorée qui se dessine — confirmation élégante */}
                      {loanDraw === item.id && (
                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-[var(--fp-bg)]/95"
                        >
                          <svg viewBox="0 0 64 64" className="h-14 w-14" aria-hidden>
                            <circle
                              cx="32"
                              cy="32"
                              r="29"
                              fill="none"
                              stroke="#efe7e0"
                              strokeWidth="2"
                            />
                            <motion.path
                              d="M20 33 L29 42 L45 24"
                              fill="none"
                              stroke="#bc7155"
                              strokeWidth="3.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              initial={{ pathLength: 0 }}
                              animate={{ pathLength: 1 }}
                              transition={{ duration: 0.55, ease: 'easeOut' }}
                            />
                          </svg>
                          <p className="mt-1.5 text-xs font-medium text-[var(--fp-muted)]">
                            C&apos;est noté
                          </p>
                        </motion.div>
                      )}
                      <span
                        className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[var(--fp-card)] text-xl ring-1 ring-[var(--fp-gold)]/30"
                        aria-hidden
                      >
                        {item.emoji ?? '📦'}
                      </span>
                      <p className="mt-2 truncate text-sm font-medium text-[var(--fp-text)]">
                        {item.name}
                      </p>
                      <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-[#bc7155]/10 px-2.5 py-0.5 text-[10px] font-semibold text-[#bc7155]">
                        {item.availableStock}{' '}
                        {item.availableStock > 1 ? 'disponibles' : 'disponible'}
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        disabled={!!loanDraw || !!sending}
                        onClick={() => apporterQuick(item)}
                        className="mt-3 w-full gap-1.5 rounded-xl border border-[var(--fp-gold)]/50 bg-[var(--fp-gold)]/10 text-xs font-semibold text-[var(--fp-muted)] hover:bg-[var(--fp-gold)]/20"
                      >
                        <Package className="h-3.5 w-3.5" aria-hidden />
                        Me l&apos;apporter
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

        {/* Bannière de détection VIP (CLIENT_ZONE — détection au scan de table) */}
        {!isGlobal && table?.vipClient && (
          <div className="mt-4 flex items-start gap-3 rounded-2xl border border-[#bc7155]/25 bg-[#bc7155]/8 px-4 py-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#bc7155]/15">
              <Crown className="h-5 w-5 text-[#bc7155]" aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <p
                className="text-base font-semibold text-[#bc7155]"
                style={SERIF}
              >
                🥂 Bienvenue, {table.vipClient.name}
              </p>
              <p className="mt-0.5 text-sm text-[var(--fp-text)]">
                Nous sommes honorés de vous accueillir.
              </p>
              {table.vipClient.preferences?.length > 0 && (
                <p className="mt-1 text-xs text-[var(--fp-muted)]">
                  Vos préférences : {table.vipClient.preferences.join(', ')}
                </p>
              )}
              {(table.vipClient.allergies?.length ?? 0) > 0 && (
                <p className="mt-1 text-xs font-medium text-[#bc7155]">
                  Nous prenons en compte vos allergies : {table.vipClient.allergies?.join(', ')}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Erreur réseau inline (réinitialisée à chaque sendRequest) */}
        {error && (
          <div className="mt-4 flex items-start gap-3 rounded-2xl border border-[#bc7155]/25 bg-[#bc7155]/8 px-4 py-3 text-sm text-[#bc7155]">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <p className="flex-1">{error}</p>
            <button
              type="button"
              onClick={() => setError(null)}
              className="text-xs font-medium underline"
            >
              {T('Fermer', 'Close')}
            </button>
          </div>
        )}

        {/* Grille des cartes d'action — la Conciergerie a sa carte
            dédiée ci-dessus (Zéro Clutter) ; le Prêt Express aussi
            dès que la vitrine est servie */}
        <div className="mt-6 space-y-3">
          {ACTIONS.filter(
            (a) =>
              a.type !== 'concierge' &&
              (a.type !== 'loan' || quickLoans.length === 0),
          ).map((action) => {
            const tone = TONE_STYLE[action.type] ?? TONE_STYLE.gold
            const Icon = action.Icon
            const isSending = sending === action.type
            return (
              <button
                key={action.type}
                type="button"
                disabled={!!sending}
                onClick={() => handleActionClick(action)}
                className={cn(
                  'group flex w-full items-center gap-4 rounded-2xl border border-[var(--fp-border)] bg-[var(--fp-card)] p-4 text-left shadow-[0_4px_20px_rgba(201,169,97,0.06)] ring-1 ring-transparent transition-all hover:-translate-y-0.5 hover:shadow-[0_8px_28px_rgba(201,169,97,0.12)] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0',
                  tone.hover,
                )}
                aria-label={action.label}
              >
                {/* Pastille emoji colorée par tone */}
                <span
                  className={cn(
                    'flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-2xl ring-1 transition-colors',
                    tone.bg,
                    tone.ring,
                  )}
                  aria-hidden
                >
                  {action.emoji}
                </span>

                {/* Texte */}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-[var(--fp-text)]">
                    {action.label}
                  </p>
                  <p className="mt-0.5 text-xs text-[var(--fp-muted)]">
                    {action.description}
                  </p>
                </div>

                {/* Spinner ou icône d'action */}
                <span
                  className={cn(
                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
                    tone.bg,
                  )}
                >
                  {isSending ? (
                    <Loader2
                      className={cn('h-4 w-4 animate-spin', tone.iconText)}
                      aria-hidden
                    />
                  ) : (
                    <Icon
                      className={cn('h-4 w-4', tone.iconText)}
                      aria-hidden
                    />
                  )}
                </span>
              </button>
            )
          })}
        </div>
          </div>
        )}

        {/* Pied de page — signature luxe : tagline serif italique or,
            timer de session en temps réel, Garder Nathalie (partage). */}
        <div className="mt-8 flex flex-col items-center gap-2 border-t border-[var(--fp-border)] pt-5 text-center">
          <p
            className="inline-flex items-center gap-1.5 text-xs italic text-[var(--fp-gold)]"
            style={SERIF}
          >
            <span aria-hidden>✦</span>{' '}
            {T('Service discret — votre confort d’abord.', 'Discreet service — your comfort first.')}
          </p>
          <p className="text-[11px] text-[var(--fp-muted)]/70">
            {isGlobal
              ? // QR_ROUTING — GLOBAL : aucune référence de table.
                // Timer de session EN TEMPS RÉEL (4 h — décompte vivant)
                `${loungeName} · ${T('Session Nathalie', 'Nathalie session')} · ${sessionRestant}`
              : `${T('Table', 'Table')} ${table?.tableNumber} · ${table?.seats} ${T('places', 'seats')} · ${
                  zoneLabel(table?.zone ?? 'main')
                }`}
          </p>
          {/* Module 3 — Indicateur langue détectée + PWA « Garder Nathalie » */}
          <div className="mt-2 flex flex-col items-center gap-2.5">
            {detectedLang !== 'fr' && (
              <span className="inline-flex items-center gap-1 rounded-full bg-[var(--fp-gold)]/8 px-2.5 py-1 text-[10px] font-medium text-[var(--fp-muted)]">
                🌐 {detectedLang.toUpperCase()}
              </span>
            )}
            {pwaInstalle ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[#bc7155]/35 bg-[#bc7155]/10 px-4 py-2 text-xs font-semibold text-[#bc7155]">
                ✓ {T('Nathalie est installée', 'Nathalie is installed')}
              </span>
            ) : (
              /* PWA — bouton PROÉMINENT (min 48px, or champagne) qui
                  déclenche la VRAIE installation PWA : prompt natif via
                  beforeinstallprompt (Chrome/Android), partage natif
                  iOS (« Sur l'écran d'accueil »), copie du lien sinon. */
              <button
                type="button"
                onClick={garderNathalie}
                title={T(
                  'Installer Nathalie sur votre écran d’accueil',
                  'Install Nathalie on your home screen',
                )}
                className="btn-shimmer inline-flex min-h-[48px] items-center justify-center gap-2 rounded-2xl border border-[var(--fp-gold)] bg-gradient-to-r from-[var(--fp-gold)] to-[#B8944D] px-6 py-3 text-sm font-semibold text-[#0f0f1c] shadow-[0_10px_30px_-8px_rgba(201,169,97,0.55)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_14px_36px_-8px_rgba(201,169,97,0.65)] active:scale-[0.98]"
              >
                <span aria-hidden>📱</span>
                {installEvt
                  ? T('Installer Nathalie', 'Install Nathalie')
                  : T('Garder Nathalie', 'Keep Nathalie')}
              </button>
            )}
          </div>
        </div>
      </motion.div>

      {/* ============================================================
          QR_ROUTING — MODALE « Où êtes-vous installé actuellement ? »
          ------------------------------------------------------------
          Mode CLIENT_GLOBAL uniquement (QR d'entrée). Affichée quand
          une action nécessite un emplacement (signalement, concierge,
          commande…). Design « Luxe Lumineux » : fond clair, filet
          doré, cartes tactiles 44px+, aucun mode sombre.
          ============================================================ */}
      {isGlobal && zoneModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-[#2C2C2C]/40 p-4 backdrop-blur-sm sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="zone-modal-title"
        >
          <div className="relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-none border border-[var(--fp-border)] bg-[var(--fp-card)] p-6 shadow-[0_16px_48px_rgba(201,169,97,0.18)] sm:p-8">
            {/* Filet doré supérieur (signature Luxe Lumineux) */}
            <div
              className="pointer-events-none absolute inset-x-0 top-0 h-1 rounded-t-3xl bg-gradient-to-r from-[var(--fp-gold)] via-[var(--fp-muted)] to-[var(--fp-gold)]"
              aria-hidden
            />

            {/* Titre + fermeture */}
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-widest text-[var(--fp-gold)]">
                  Nathalie
                </p>
                <h2
                  id="zone-modal-title"
                  className="mt-1 text-xl font-semibold text-[var(--fp-text)]"
                  style={SERIF}
                >
                  {T('Où êtes-vous installé actuellement ?', 'Where are you currently seated?')}
                </h2>
                <p className="mt-1.5 text-sm text-[var(--fp-muted)]">
                  {T(
                    'Nathalie transmettra votre emplacement avec votre demande.',
                    'Nathalie will share your location with your request.',
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={cancelZoneModal}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--fp-border)] bg-[var(--fp-card)] text-[var(--fp-muted)] transition hover:bg-[var(--fp-border)]/40"
                aria-label={T("Fermer la sélection d'emplacement", 'Close location selection')}
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>

            {/* Boutons visuels de zone — feedback OR + ✓ avant confirmation */}
            <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {GLOBAL_ZONES.map((z) => {
                const estChoisie = zoneChoisie === z.label
                return (
                  <button
                    key={z.id}
                    type="button"
                    onClick={() => choisirZone(z.label)}
                    className={cn(
                      'relative flex min-h-[52px] items-center gap-3 rounded-2xl border px-4 py-3 text-left text-sm font-medium transition-all',
                      estChoisie
                        ? 'scale-[0.98] border-[var(--fp-gold)] bg-[var(--fp-gold)] text-[#0f0f1c] shadow-[0_10px_26px_-8px_rgba(201,169,97,0.55)]'
                        : 'border-[var(--fp-border)] bg-[var(--fp-bg)] text-[var(--fp-text)] hover:border-[var(--fp-gold)]/50 hover:bg-[var(--fp-gold)]/8',
                    )}
                    aria-pressed={estChoisie}
                  >
                    <span
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--fp-gold)]/10 text-lg"
                      aria-hidden
                    >
                      {z.emoji}
                    </span>
                    {langue === 'en' ? z.labelEn : z.label}
                    {estChoisie && (
                      <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-[#0f0f1c]/85 text-[10px] font-bold text-[var(--fp-gold)]" aria-hidden>
                        ✓
                      </span>
                    )}
                  </button>
                )
              })}
            </div>

            {/* Séparateur « ou » */}
            <div className="my-5 flex items-center gap-3" aria-hidden>
              <span className="h-px flex-1 bg-[var(--fp-border)]" />
              <span className="text-[10px] font-medium uppercase tracking-widest text-[var(--fp-muted)]/70">
                {T('ou', 'or')}
              </span>
              <span className="h-px flex-1 bg-[var(--fp-border)]" />
            </div>

            {/* Champ libre « Numéro de fauteuil » */}
            <form
              onSubmit={(e) => {
                e.preventDefault()
                const v = zoneFauteuil.trim()
                if (!v) return
                // Normalise « 12 » → « Fauteuil 12 » (valeur stockée côté
                // staff, toujours française) — « Seat 12 » (EN) est aussi
                // reconnu. L'affichage est traduit par afficherZone().
                const brut = v.replace(/^(seat|fauteuil)\s*/i, '')
                const zone = brut ? `Fauteuil ${brut}` : v
                confirmZoneSelection(zone)
              }}
              className="space-y-3"
            >
              <div>
                <label
                  htmlFor="zone-fauteuil"
                  className="text-sm font-medium text-[var(--fp-text)]"
                >
                  {T('Indiquez votre numéro de fauteuil', 'Enter your seat number')}
                </label>
                <Input
                  id="zone-fauteuil"
                  value={zoneFauteuil}
                  onChange={(e) => setZoneFauteuil(e.target.value)}
                  placeholder={T('Ex : Fauteuil 12', 'e.g. Seat 12')}
                  inputMode="text"
                  className="mt-2 border-[var(--fp-border)] bg-[var(--fp-bg)] text-sm text-[var(--fp-text)] placeholder:text-[var(--fp-muted)]/50 focus-visible:border-[var(--fp-gold)] focus-visible:ring-[var(--fp-gold)]/20"
                />
              </div>
              <Button
                type="submit"
                disabled={!zoneFauteuil.trim()}
                className="w-full gap-2 rounded-2xl border border-[var(--fp-gold)] bg-[var(--fp-gold)] text-white shadow-[0_4px_20px_rgba(201,169,97,0.18)] hover:bg-[var(--fp-gold)]/90"
              >
                <Check className="h-4 w-4" aria-hidden />
                {T('Valider mon emplacement', 'Confirm my location')}
              </Button>
            </form>

            <p className="mt-4 text-center text-[11px] text-[var(--fp-muted)]/70">
              {T(
                'Votre choix est mémorisé pour la session — modifiable à tout moment.',
                'Your choice is remembered for the session — change it anytime.',
              )}
            </p>
          </div>
        </div>
      )}

      {/* ============================================================
          Denise — indicateur vocal (barre dorée + onde sonore +
          texte du message en temps réel). Après le message :
          SILENCE TOTAL — Denise ne reparle jamais (Mode Discrétion).
          ============================================================ */}
      <AnimatePresence>
        {deniseEtat !== 'idle' && (
          <motion.div
            key="denise"
            initial={{ y: -70, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -70, opacity: 0 }}
            transition={{ duration: 0.45, ease: 'easeOut' }}
            className="fixed inset-x-0 top-0 z-[90]"
          >
            <div className="mx-auto max-w-xl px-4 pt-3 sm:px-6">
              <div
                className="flex items-center gap-3 rounded-2xl border border-[#dba28a]/60 px-4 py-3 shadow-[0_12px_40px_rgba(0,0,0,0.35)]"
                style={{
                  background:
                    'linear-gradient(100deg, rgba(227,201,133,0.97) 0%, rgba(201,169,97,0.97) 55%, rgba(227,201,133,0.97) 100%)',
                }}
                role="status"
                aria-live="polite"
              >
                <span className="flex h-5 items-end gap-[3px]" aria-hidden>
                  {[0, 1, 2, 3, 4].map((i) => (
                    <span
                      key={i}
                      className="onde-barre h-[14px] w-[3px] rounded-full bg-[#3A2E1A]"
                      style={{ animationDelay: `${i * 0.12}s` }}
                    />
                  ))}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[9px] font-semibold uppercase tracking-[0.3em] text-[#3A2E1A]/80">
                    Denise · Accueil vocal
                  </p>
                  <p className="mt-0.5 truncate text-[13px] font-medium text-[#0f0f1c]">
                    {deniseTexte || '…'}
                  </p>
                </div>
                {/* Passer — couper le message d'un geste discret */}
                <button
                  type="button"
                  onClick={passerDenise}
                  className="shrink-0 rounded-full border border-[#3A2E1A]/35 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#3A2E1A]/85 transition-all duration-300 hover:bg-[#3A2E1A]/12 active:scale-95"
                >
                  Passer
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toast élégant — jamais d'alert() brut */}
      <div className="pointer-events-none fixed inset-x-0 bottom-7 z-[85] flex justify-center px-4">
        <AnimatePresence>
          {toast && (
            <motion.div
              key={toast.msg + toast.emoji}
              initial={{ y: 24, opacity: 0, scale: 0.96 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 24, opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
              className="flex items-center gap-2.5 rounded-full border border-[var(--fp-gold)]/45 bg-[#0f0f1c]/95 px-5 py-3 shadow-[0_14px_40px_rgba(0,0,0,0.45)] backdrop-blur-xl"
              role="status"
            >
              <span aria-hidden>{toast.emoji}</span>
              <p className="text-[13px] font-medium text-[#F5F1E6]">{toast.msg}</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

export default VipTableScan
