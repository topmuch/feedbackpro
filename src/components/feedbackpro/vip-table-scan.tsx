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
// Palette « Or & Soie » : #FAFAF7 / #C9A961 / #1A1A1A /
// #4A7C59 / #C97B63. Playfair Display (titres) + Inter (corps).
// ============================================================

import { useEffect, useState, useRef, type ChangeEvent } from 'react'
import { motion } from 'framer-motion'
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
    bg: 'bg-[#C9A961]/8',
    ring: 'ring-[#C9A961]/30',
    iconText: 'text-[#C9A961]',
    hover: 'hover:bg-[#C9A961]/12 hover:ring-[#C9A961]/40',
  },
  bronze: {
    bg: 'bg-[#8B6F47]/8',
    ring: 'ring-[#8B6F47]/30',
    iconText: 'text-[#8B6F47]',
    hover: 'hover:bg-[#8B6F47]/12 hover:ring-[#8B6F47]/40',
  },
  sage: {
    bg: 'bg-[#4A7C59]/8',
    ring: 'ring-[#4A7C59]/30',
    iconText: 'text-[#4A7C59]',
    hover: 'hover:bg-[#4A7C59]/12 hover:ring-[#4A7C59]/40',
  },
  amethyst: {
    bg: 'bg-[#6B4C9A]/8',
    ring: 'ring-[#6B4C9A]/30',
    iconText: 'text-[#6B4C9A]',
    hover: 'hover:bg-[#6B4C9A]/12 hover:ring-[#6B4C9A]/40',
  },
  terracotta: {
    bg: 'bg-[#C97B63]/8',
    ring: 'ring-[#C97B63]/30',
    iconText: 'text-[#C97B63]',
    hover: 'hover:bg-[#C97B63]/12 hover:ring-[#C97B63]/40',
  },
}

const PROBLEM_TAGS = [
  { id: 'bruit', label: 'Bruit excessif', emoji: '🔊' },
  { id: 'proprete', label: 'Propreté', emoji: '🧹' },
  { id: 'confort', label: 'Confort', emoji: '🛋️' },
  { id: 'temperature', label: 'Température', emoji: '❄️' },
  { id: 'service', label: 'Service lent', emoji: '⏱️' },
  { id: 'equipement', label: 'Équipement HS', emoji: '🔌' },
  { id: 'autre', label: 'Autre', emoji: '✏️' },
] as const

type MenuItem = { id: string; name: string; emoji: string; category: string }

const MENU_ITEMS: MenuItem[] = [
  { id: 'cafe', name: 'Café crème', emoji: '☕', category: 'Boissons chaudes' },
  { id: 'the', name: 'Thé vert', emoji: '🍵', category: 'Boissons chaudes' },
  { id: 'chocolat', name: 'Chocolat chaud', emoji: '🥛', category: 'Boissons chaudes' },
  { id: 'jus', name: "Jus d'orange", emoji: '🥤', category: 'Boissons fraîches' },
  { id: 'eau', name: 'Eau minérale', emoji: '💧', category: 'Boissons fraîches' },
  { id: 'soda', name: 'Soda', emoji: '🥤', category: 'Boissons fraîches' },
  { id: 'champagne', name: 'Coupe de champagne', emoji: '🥂', category: 'Alcool & Champagne' },
  { id: 'cocktail', name: 'Cocktail maison', emoji: '🍸', category: 'Alcool & Champagne' },
  { id: 'vin', name: 'Verre de vin', emoji: '🍷', category: 'Alcool & Champagne' },
]

const MENU_CATEGORIES = ['Boissons chaudes', 'Boissons fraîches', 'Alcool & Champagne']

const CONCIERGE_TYPES = [
  { id: 'taxi', label: 'Réserver un taxi', emoji: '🚕' },
  { id: 'vol', label: 'Info sur mon vol', emoji: '✈️' },
  { id: 'appel', label: 'Appel téléphonique', emoji: '📞' },
  { id: 'reunion', label: 'Salle de réunion', emoji: '💼' },
  { id: 'autre', label: 'Autre demande', emoji: '🎁' },
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
  desc: string
  Icon: typeof Wine
  actionType: RequestType
}[] = [
  {
    id: 'detente',
    label: 'Mon Espace Détente',
    desc: 'Plaids, casques, presse',
    Icon: Armchair,
    actionType: 'loan',
  },
  {
    id: 'gastro',
    label: 'Gastronomie & Bar',
    desc: 'Champagne & carte du chef',
    Icon: Wine,
    actionType: 'refreshment',
  },
  {
    id: 'bienetre',
    label: 'Bien-être & Douches',
    desc: 'Cabines privatives',
    Icon: ShowerHead,
    actionType: 'shower',
  },
  {
    id: 'concierge',
    label: 'Conciergerie Privée',
    desc: 'Amadou vous écoute',
    Icon: ConciergeBell,
    actionType: 'concierge',
  },
]

const ACTIONS_BY_TYPE = Object.fromEntries(
  ACTIONS.map((a) => [a.type, a]),
) as Record<RequestType, ActionDef>

// ÉCRAN 1 — « Autres attentions » : pilules fines sous les cartes
// de service (les 4 grandes cartes portent les services majeurs).
const OTHER_ACTIONS: { def: ActionDef; short: string }[] = [
  { def: ACTIONS_BY_TYPE.menu, short: 'Menu du jour' },
  { def: ACTIONS_BY_TYPE.charger, short: 'Chargeur' },
  { def: ACTIONS_BY_TYPE.upsell, short: "Moment d'exception" },
  { def: ACTIONS_BY_TYPE.loan, short: 'Prêt express' },
  { def: ACTIONS_BY_TYPE.problem, short: 'Signaler' },
  { def: ACTIONS_BY_TYPE.rating, short: 'Noter' },
]

// ÉCRAN 3 — Estimations du temps, formulées comme une promesse
// (jamais un compte à rebours agressif).
const ESTIMATE_LABELS: Partial<Record<RequestType, string>> = {
  refreshment: 'Livraison estimée · 3–5 min',
  charger: 'Livraison estimée · 2–4 min',
  loan: 'Livraison estimée · 3–6 min',
  concierge: 'Amadou arrive · 1–3 min',
  problem: 'Intervention · 5–10 min',
  shower: 'Votre cabine est prête',
  menu: 'La carte arrive · quelques secondes',
  upsell: 'Préparation · 5–8 min',
  rating: '',
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
const GLOBAL_ZONES: { id: string; label: string; emoji: string }[] = [
  { id: 'buffet', label: 'Zone Buffet', emoji: '🍽️' },
  { id: 'relaxation', label: 'Espace Détente', emoji: '🛋️' },
  { id: 'terrasse', label: 'Terrasse', emoji: '🌿' },
  { id: 'meeting', label: 'Salles de Réunion', emoji: '💼' },
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

const CONFIRMATION_CONTENT: Record<RequestType, { title: string; subtitle: string }> = {
  refreshment: {
    title: 'Commande envoyée au bar',
    subtitle: 'Le barman prépare votre demande. Livraison estimée : 3-5 min',
  },
  menu: {
    title: 'Menu envoyé',
    subtitle: 'Le chef vous présente la carte du jour.',
  },
  shower: {
    title: 'Douche réservée',
    subtitle: 'Votre cabine vous attend. Le staff vous guide.',
  },
  charger: {
    title: 'Chargeur en route',
    subtitle: "Un membre du staff vous l'apporte.",
  },
  concierge: {
    title: 'Le concierge arrive',
    subtitle: 'Il vous accompagne dans un instant.',
  },
  problem: {
    title: 'Signalement transmis',
    subtitle:
      'Notre équipe intervient dans un instant. Votre confort est notre priorité.',
  },
  rating: {
    title: 'Merci pour votre retour',
    subtitle: 'Votre avis nous aide à parfaire le service.',
  },
  upsell: {
    title: 'Commande transmise',
    subtitle: 'Notre équipe vous sert dans un instant.',
  },
  loan: {
    title: 'Demande de prêt envoyée',
    subtitle: 'Votre objet vous est apporté à table.',
  },
}

const SERIF = { fontFamily: '"Playfair Display", Georgia, serif' } as const

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
  // En-tête des vues secondaires (problème, commande, concierge…)
  const headerLocation = isGlobal
    ? globalZone
      ? `Installé : ${globalZone}`
      : 'Salon VIP'
    : `Table ${table?.tableNumber ?? ''}`

  const cartCount = Object.values(cart).reduce((a, b) => a + b, 0)
  const cartItems = MENU_ITEMS.filter((m) => (cart[m.id] ?? 0) > 0)

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
        "Impossible d'envoyer votre demande. Réessayez dans un instant.",
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

  // ---- ÉCRAN 1 — Wi-Fi « Copier en 1 clic » (icône qui change) ----
  const copierWifi = async () => {
    try {
      await navigator.clipboard?.writeText(
        wifiMotDePasse
          ? `${wifiNom} — mot de passe : ${wifiMotDePasse}`
          : wifiNom,
      )
      setWifiCopied(true)
      // L'icône revient à « Copier » après 2 s — feedback vivant,
      // sans jamais crier (Mode Discrétion).
      setTimeout(() => setWifiCopied(false), 2000)
    } catch {
      /* clipboard indisponible */
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
      setError("Impossible d'envoyer votre demande. Réessayez dans un instant.")
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
      <div className="flex min-h-screen flex-col items-center justify-center gap-5 bg-[#FAFAF7] px-6">
        <div className="relative flex h-24 w-24 items-center justify-center">
          <div
            className="absolute inset-0 animate-pulse rounded-full bg-[#C9A961]/20 blur-md"
            aria-hidden
          />
          <img
            src="/brand/nathalie-avatar.png"
            alt="Nathalie"
            className="relative h-20 w-20 rounded-full object-cover shadow-[0_4px_20px_rgba(201,169,97,0.30)] ring-2 ring-[#C9A961]/60"
          />
        </div>
        <p className="text-sm italic text-[#8B6F47]" style={SERIF}>
          {/* QR_ROUTING — libellé adapté au type de QR scanné */}
          {isGlobal ? 'Nathalie arrive…' : 'Connexion à votre table…'}
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
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#FAFAF7] px-6 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#C97B63]/10">
          <AlertTriangle className="h-7 w-7 text-[#C97B63]" aria-hidden />
        </div>
        <h1 className="text-2xl font-semibold text-[#2C2C2C]" style={SERIF}>
          Oups, ce QR code est introuvable
        </h1>
        <p className="max-w-sm text-sm text-[#8B6F47]">{error}</p>
        <p className="text-xs text-[#8B6F47]/70">
          Demandez à l&apos;hôte du salon de vérifier le QR code affiché sur
          votre table.
        </p>
        {onExit && (
          <Button
            variant="outline"
            onClick={onExit}
            className="mt-2 gap-2 border-[#EAE5DC] bg-white text-[#8B6F47]"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden /> Retour
          </Button>
        )}
      </div>
    )
  }

  // QR_ROUTING — en mode CLIENT_GLOBAL il n'y a PAS de table : on ne
  // bloque PAS le rendu sur table null. En mode zone, table est requis.
  if (!isGlobal && !table) return null

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
        <div className="mt-3 space-y-1 border-t border-[#EAE5DC] pt-3 text-left">
          {meta.items.map((it: any, i: number) => (
            <p key={i} className="text-sm text-[#2C2C2C]">
              • {it.name} × {it.qty}
            </p>
          ))}
        </div>
      )
    } else if (confirmation.type === 'concierge' && meta) {
      const tLabel =
        CONCIERGE_TYPES.find((t) => t.id === meta.requestType)?.label ??
        meta.requestType
      detailsBox = (
        <div className="mt-3 space-y-1 border-t border-[#EAE5DC] pt-3 text-left">
          <p className="text-sm text-[#2C2C2C]">• Demande : {tLabel}</p>
          {meta.details && (
            <p className="text-sm text-[#2C2C2C]">• Détails : {meta.details}</p>
          )}
          <p className="text-sm text-[#2C2C2C]">
            • Concierge : {CONCIERGE_NAME}
          </p>
        </div>
      )
    } else if (confirmation.type === 'problem' && meta) {
      const tagLabels = (meta.tags ?? []).map((id: string) => {
        const t = PROBLEM_TAGS.find((p) => p.id === id)
        return t ? `${t.emoji} ${t.label}` : id
      })
      detailsBox = (
        <div className="mt-3 space-y-1 border-t border-[#EAE5DC] pt-3 text-left">
          <p className="text-sm text-[#2C2C2C]">
            • Types : {tagLabels.join(', ') || 'Signalement'}
          </p>
          {meta.description && (
            <p className="text-sm text-[#2C2C2C]">• {meta.description}</p>
          )}
          <p className="text-sm text-[#8B6F47]">
            • Pris en charge : il y a quelques sec
          </p>
        </div>
      )
    }

    const trackingLabel =
      confirmation.type === 'refreshment'
        ? 'Commande'
        : confirmation.type === 'problem'
          ? 'Signalement'
          : 'Demande'
    // QR_ROUTING — libellé de l'emplacement dans la carte de suivi :
    //   CLIENT_ZONE  → « Table » + n° de table scannée
    //   CLIENT_GLOBAL → « Emplacement » + zone choisie dans la session
    const locationFieldLabel = isGlobal ? 'Emplacement' : 'Table'

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
        ? `${CONCIERGE_NAME} vous apporte ${
            meta?.loanItem
              ? `votre ${String(meta.loanItem).toLowerCase()}`
              : 'votre demande'
          } dans un instant.`
        : confirmation.type === 'refreshment'
          ? 'Le barman compose votre commande — servie à votre place.'
          : confirmation.type === 'concierge'
            ? `${CONCIERGE_NAME} arrive pour vous accompagner.`
            : conf.subtitle

    // Référence élégante — formulée comme un savoir-faire maison
    const refLabel =
      confirmation.type === 'refreshment'
        ? 'Réf. Bar'
        : confirmation.type === 'problem'
          ? 'Réf. Intervention'
          : confirmation.type === 'rating'
            ? 'Réf. Avis'
            : 'Réf. Conciergerie'

    // Estimation du temps — une promesse, pas un chrono
    const estimateLabel = ESTIMATE_LABELS[confirmation.type] ?? ''

    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#FAFAF7] px-6 py-12 text-center">
        {/* Coche dorée qui se dessine — le cercle se trace, la coche
            s'écrit. Halo champagne diffus : vivant, jamais clignotant. */}
        <div className="relative flex h-28 w-28 items-center justify-center">
          <div
            className="absolute inset-0 rounded-full bg-gradient-to-br from-[#C9A961]/25 via-[#C9A961]/8 to-[#4A7C59]/15 blur-md"
            aria-hidden
          />
          <motion.svg viewBox="0 0 64 64" className="relative h-20 w-20" aria-hidden>
            <motion.circle
              cx="32"
              cy="32"
              r="29"
              fill="none"
              stroke="#C9A961"
              strokeWidth="1.75"
              initial={{ pathLength: 0, opacity: 0.45 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{ duration: 0.9, ease: 'easeOut' }}
            />
            <motion.path
              d="M20 33 L29 42 L45 24"
              fill="none"
              stroke="#4A7C59"
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
            className="text-[26px] font-semibold leading-snug text-[#2C2C2C]"
            style={SERIF}
          >
            C&apos;est noté{prenom ? `, ${prenom}` : ''}.
          </h1>
          <p className="mt-2 max-w-sm text-sm leading-relaxed text-[#8B6F47]">
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
            <div className="h-[3px] w-full overflow-hidden rounded-full bg-[#EAE5DC]">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-[#C9A961]/50 via-[#C9A961] to-[#8B6F47]"
                initial={{ width: '6%' }}
                animate={{ width: '92%' }}
                transition={{ duration: 7, ease: [0.22, 0.61, 0.36, 1] }}
              />
            </div>
            <p className="mt-2.5 text-[11px] font-medium uppercase tracking-[0.22em] text-[#8B6F47]/80">
              {estimateLabel}
            </p>
          </div>
        )}

        {/* Référence + emplacement — carte ivoire, verre dépoli */}
        <div className="mt-7 w-full max-w-sm rounded-2xl border border-[#EAE5DC] bg-white/80 px-5 py-4 text-left shadow-[0_20px_40px_-10px_rgba(0,0,0,0.05)] backdrop-blur">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-[#C9A961]">
              {refLabel}
            </p>
            <span className="text-[11px] font-medium text-[#4A7C59]">
              Pris en charge
            </span>
          </div>
          <p className="mt-1 text-sm font-semibold tracking-wide text-[#2C2C2C]">
            #{confirmation.trackingNumber}
          </p>
          {detailsBox}
          <div className="mt-3 border-t border-[#EAE5DC] pt-3">
            <p className="text-[10px] font-medium uppercase tracking-widest text-[#8B6F47]">
              {locationFieldLabel}
            </p>
            <p className="mt-0.5 text-sm font-semibold text-[#2C2C2C]">
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
              className="gap-2 border-[#C9A961]/40 bg-[#C9A961]/8 text-[#8B6F47] hover:bg-[#C9A961]/15"
            >
              {sending === 'menu' ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Utensils className="h-4 w-4" aria-hidden />
              )}
              Voir le menu
            </Button>
          )}
          {confirmation.type === 'problem' && (
            <Button
              variant="outline"
              disabled={!!sending}
              onClick={() => sendRequest('rating')}
              className="gap-2 border-[#C9A961]/40 bg-[#C9A961]/8 text-[#8B6F47] hover:bg-[#C9A961]/15"
            >
              {sending === 'rating' ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Star className="h-4 w-4" aria-hidden />
              )}
              Noter l&apos;intervention
            </Button>
          )}
          <Button
            variant="outline"
            disabled={!!sending}
            onClick={() => setConfirmation(null)}
            className="gap-2 border-[#EAE5DC] bg-white text-[#8B6F47] hover:bg-[#EAE5DC]/40"
          >
            <ConciergeBell className="h-4 w-4" aria-hidden /> Autre demande
          </Button>
        </div>

        {/* Erreur inline (si un send secondaire échoue) */}
        {error && (
          <div className="flex max-w-sm items-start gap-3 rounded-2xl border border-[#C97B63]/25 bg-[#C97B63]/8 px-4 py-3 text-sm text-[#C97B63]">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <p className="flex-1">{error}</p>
            <button
              type="button"
              onClick={() => setError(null)}
              className="text-xs font-medium underline"
            >
              Fermer
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
      <div className="min-h-screen bg-[#FAFAF7]">
        <div className="mx-auto max-w-xl px-4 py-8 sm:px-6 sm:py-12">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-widest text-[#8B6F47]">
                {/* QR_ROUTING — « Table T-05 » en mode zone ·
                    « Installé : Zone Buffet » / « Salon VIP » en global */}
                {headerLocation}
              </p>
              <h1 className="mt-1 text-2xl font-semibold text-[#2C2C2C]" style={SERIF}>
                ⭐ Noter mon expérience
              </h1>
            </div>
            <Button
              variant="outline"
              onClick={() => setView('main')}
              className="gap-2 border-[#EAE5DC] bg-white text-[#8B6F47] hover:bg-[#EAE5DC]/40"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden /> Retour
            </Button>
          </div>

          <div className="mt-8 rounded-2xl border border-[#EAE5DC] bg-white p-6 text-center shadow-[0_4px_20px_rgba(201,169,97,0.06)]">
            <p className="text-sm text-[#8B6F47]">Comment s’est passée votre visite ?</p>
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
                      n <= ratingStars ? 'fill-[#C9A961] text-[#C9A961]' : 'text-[#EAE5DC]',
                    )}
                    aria-hidden
                  />
                </button>
              ))}
            </div>
            {ratingStars > 0 && (
              <p className="mt-3 text-sm font-semibold text-[#8B6F47]" style={SERIF}>
                {LABELS[ratingStars]}
              </p>
            )}
            <Button
              className="mt-6 w-full gap-2 bg-gradient-to-br from-[#C9A961] to-[#8B6F47] text-white hover:opacity-90"
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
      <div className="min-h-screen bg-[#FAFAF7]">
        <div className="mx-auto max-w-xl px-4 py-8 sm:px-6 sm:py-12">
          {/* Header */}
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-widest text-[#8B6F47]">
                {/* QR_ROUTING — « Table T-05 » en mode zone ·
                    « Installé : Zone Buffet » / « Salon VIP » en global */}
                {headerLocation}
              </p>
              <h1 className="mt-1 text-2xl font-semibold text-[#2C2C2C]" style={SERIF}>
                ⚠️ Signaler un problème
              </h1>
            </div>
            <Button
              variant="outline"
              onClick={() => setView('main')}
              className="gap-2 border-[#EAE5DC] bg-white text-[#8B6F47] hover:bg-[#EAE5DC]/40"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden /> Retour
            </Button>
          </div>

          <div className="mt-6 space-y-6 rounded-3xl border border-[#EAE5DC] bg-white p-6 shadow-[0_4px_20px_rgba(201,169,97,0.06)]">
            {/* Tags multi-select */}
            <div>
              <p className="text-sm font-medium text-[#2C2C2C]">
                Quel type de problème ?
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
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
                        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all',
                        selected
                          ? 'border-[#C97B63] bg-[#C97B63]/12 text-[#C97B63]'
                          : 'border-[#EAE5DC] bg-white text-[#8B6F47] hover:border-[#C97B63]/40 hover:bg-[#C97B63]/8',
                      )}
                    >
                      <span aria-hidden>{t.emoji}</span>
                      {t.label}
                      {selected && <Check className="h-3 w-3" aria-hidden />}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Description */}
            <div>
              <p className="text-sm font-medium text-[#2C2C2C]">
                Décrivez brièvement :
              </p>
              <Textarea
                value={problemDescription}
                onChange={(e) => setProblemDescription(e.target.value)}
                placeholder="La table à côté…"
                className="mt-2 min-h-24 resize-none border-[#EAE5DC] bg-[#FAFAF7] text-sm text-[#2C2C2C] placeholder:text-[#8B6F47]/50 focus-visible:border-[#C9A961] focus-visible:ring-[#C9A961]/20"
              />
            </div>

            {/* Photo optionnelle */}
            <div>
              <p className="text-sm font-medium text-[#2C2C2C]">
                📸 Ajouter une photo (optionnel)
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
                      alt="Aperçu du signalement"
                      className="h-20 w-20 rounded-xl border border-[#EAE5DC] object-cover"
                    />
                    <button
                      type="button"
                      onClick={removePhoto}
                      className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full border border-[#EAE5DC] bg-white text-[#8B6F47] shadow"
                      aria-label="Retirer la photo"
                    >
                      <X className="h-3 w-3" aria-hidden />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-2 rounded-xl border border-dashed border-[#C9A961]/40 bg-[#C9A961]/6 px-4 py-3 text-xs font-medium text-[#8B6F47] hover:bg-[#C9A961]/12"
                  >
                    <Camera className="h-4 w-4 text-[#C9A961]" aria-hidden />{' '}
                    Prendre une photo
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
                className="w-full gap-2 rounded-2xl border border-[#C9A961] bg-[#C9A961] text-white shadow-[0_4px_20px_rgba(201,169,97,0.18)] hover:bg-[#C9A961]/90"
              >
                {sending === 'problem' ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Send className="h-4 w-4" aria-hidden />
                )}
                TRANSMETTRE DISCRÈTEMENT
              </Button>
              <p className="text-center text-xs text-[#8B6F47]">
                🔒 Votre signalement est confidentiel.
              </p>
            </div>

            {error && (
              <div className="flex items-start gap-3 rounded-2xl border border-[#C97B63]/25 bg-[#C97B63]/8 px-4 py-3 text-sm text-[#C97B63]">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <p className="flex-1">{error}</p>
                <button
                  type="button"
                  onClick={() => setError(null)}
                  className="text-xs font-medium underline"
                >
                  Fermer
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
      <div className="min-h-screen bg-[#FAFAF7]">
        <div className="mx-auto max-w-xl px-4 py-8 sm:px-6 sm:py-12">
          {/* Header */}
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-widest text-[#8B6F47]">
                {/* QR_ROUTING — « Table T-05 » en mode zone ·
                    « Installé : Zone Buffet » / « Salon VIP » en global */}
                {headerLocation}
              </p>
              <h1 className="mt-1 text-2xl font-semibold text-[#2C2C2C]" style={SERIF}>
                🍸 Commander un rafraîchissement
              </h1>
            </div>
            <Button
              variant="outline"
              onClick={() => setView('main')}
              className="gap-2 border-[#EAE5DC] bg-white text-[#8B6F47] hover:bg-[#EAE5DC]/40"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden /> Retour
            </Button>
          </div>

          <div className="mt-6 space-y-6 rounded-3xl border border-[#EAE5DC] bg-white p-6 shadow-[0_4px_20px_rgba(201,169,97,0.06)]">
            {/* Menu groupé par catégorie */}
            {MENU_CATEGORIES.map((cat) => (
              <div key={cat}>
                <p className="text-[11px] font-semibold uppercase tracking-widest text-[#8B6F47]">
                  {cat}
                </p>
                <div className="mt-3 space-y-2">
                  {MENU_ITEMS.filter((m) => m.category === cat).map((m) => {
                    const qty = cart[m.id] ?? 0
                    return (
                      <div
                        key={m.id}
                        className="flex items-center gap-3 rounded-xl border border-[#EAE5DC] bg-[#FAFAF7] px-3 py-2"
                      >
                        <span className="text-xl" aria-hidden>
                          {m.emoji}
                        </span>
                        <span className="flex-1 text-sm font-medium text-[#2C2C2C]">
                          {m.name}
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
                              className="flex h-7 w-7 items-center justify-center rounded-full border border-[#EAE5DC] bg-white text-[#8B6F47]"
                              aria-label={`Retirer ${m.name}`}
                            >
                              −
                            </button>
                            <span className="min-w-[1.5rem] text-center text-sm font-semibold text-[#2C2C2C]">
                              {qty}
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                setCart((p) => ({ ...p, [m.id]: qty + 1 }))
                              }
                              className="flex h-7 w-7 items-center justify-center rounded-full border border-[#C9A961] bg-[#C9A961]/12 text-[#C9A961]"
                              aria-label={`Ajouter ${m.name}`}
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
                            className="rounded-full border border-[#C9A961]/40 bg-[#C9A961]/8 px-3 py-1 text-xs font-medium text-[#8B6F47] hover:bg-[#C9A961]/15"
                          >
                            Ajouter
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}

            {/* Panier */}
            <div className="rounded-2xl border border-[#C9A961]/25 bg-[#C9A961]/6 p-4">
              <div className="flex items-center gap-2">
                <span aria-hidden>🛒</span>
                <p className="text-sm font-semibold text-[#2C2C2C]">
                  Votre commande ({cartCount}{' '}
                  {cartCount > 1 ? 'articles' : 'article'})
                </p>
              </div>
              {cartCount === 0 ? (
                <p className="mt-2 text-xs text-[#8B6F47]">
                  Sélectionnez une boisson ci-dessus.
                </p>
              ) : (
                <ul className="mt-2 space-y-1">
                  {cartItems.map((m) => (
                    <li key={m.id} className="text-sm text-[#2C2C2C]">
                      • {m.name} × {cart[m.id]}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Submit */}
            <div className="space-y-2">
              <Button
                type="button"
                disabled={!!sending || cartCount === 0}
                onClick={submitRefreshment}
                className="w-full gap-2 rounded-2xl border border-[#C9A961] bg-[#C9A961] text-white shadow-[0_4px_20px_rgba(201,169,97,0.18)] hover:bg-[#C9A961]/90"
              >
                {sending === 'refreshment' ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Send className="h-4 w-4" aria-hidden />
                )}
                ENVOYER LA COMMANDE
              </Button>
              <p className="text-center text-xs text-[#8B6F47]">
                ⏱️ Temps estimé : 3-5 minutes
              </p>
            </div>

            {error && (
              <div className="flex items-start gap-3 rounded-2xl border border-[#C97B63]/25 bg-[#C97B63]/8 px-4 py-3 text-sm text-[#C97B63]">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <p className="flex-1">{error}</p>
                <button
                  type="button"
                  onClick={() => setError(null)}
                  className="text-xs font-medium underline"
                >
                  Fermer
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ============================================================
  // RENDU — Vue Concierge (sélecteur + détails)
  // ============================================================
  if (view === 'concierge') {
    return (
      <div className="min-h-screen bg-[#FAFAF7]">
        <div className="mx-auto max-w-xl px-4 py-8 sm:px-6 sm:py-12">
          {/* Header */}
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-widest text-[#8B6F47]">
                {/* QR_ROUTING — « Table T-05 » en mode zone ·
                    « Installé : Zone Buffet » / « Salon VIP » en global */}
                {headerLocation}
              </p>
              <h1 className="mt-1 text-2xl font-semibold text-[#2C2C2C]" style={SERIF}>
                🛎️ Appeler le concierge
              </h1>
            </div>
            <Button
              variant="outline"
              onClick={() => setView('main')}
              className="gap-2 border-[#EAE5DC] bg-white text-[#8B6F47] hover:bg-[#EAE5DC]/40"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden /> Retour
            </Button>
          </div>

          <div className="mt-6 space-y-6 rounded-3xl border border-[#EAE5DC] bg-white p-6 shadow-[0_4px_20px_rgba(201,169,97,0.06)]">
            {/* Sélecteur de demande (single-select) */}
            <div>
              <p className="text-sm font-medium text-[#2C2C2C]">
                Comment pouvons-nous vous aider ?
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
                          ? 'border-[#6B4C9A] bg-[#6B4C9A]/10 text-[#6B4C9A]'
                          : 'border-[#EAE5DC] bg-[#FAFAF7] text-[#8B6F47] hover:border-[#6B4C9A]/40 hover:bg-[#6B4C9A]/6',
                      )}
                    >
                      <span className="text-xl" aria-hidden>
                        {t.emoji}
                      </span>
                      <span className="flex-1">{t.label}</span>
                      {selected && <Check className="h-4 w-4" aria-hidden />}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Détails optionnels */}
            <div>
              <p className="text-sm font-medium text-[#2C2C2C]">
                Détails (optionnel) :
              </p>
              <Textarea
                value={conciergeDetails}
                onChange={(e) => setConciergeDetails(e.target.value)}
                placeholder="Je souhaite un taxi pour 18h…"
                className="mt-2 min-h-24 resize-none border-[#EAE5DC] bg-[#FAFAF7] text-sm text-[#2C2C2C] placeholder:text-[#8B6F47]/50 focus-visible:border-[#6B4C9A] focus-visible:ring-[#6B4C9A]/20"
              />
            </div>

            {/* Submit */}
            <div className="space-y-3">
              <Button
                type="button"
                disabled={!!sending || !conciergeType}
                onClick={submitConcierge}
                className="w-full gap-2 rounded-2xl border border-[#6B4C9A] bg-[#6B4C9A] text-white shadow-[0_4px_20px_rgba(107,76,154,0.18)] hover:bg-[#6B4C9A]/90"
              >
                {sending === 'concierge' ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Send className="h-4 w-4" aria-hidden />
                )}
                TRANSMETTRE AU CONCIERGE
              </Button>
              <p className="inline-flex items-center justify-center gap-1.5 text-center text-xs text-[#8B6F47]">
                <Phone className="h-3 w-3" aria-hidden /> Concierge disponible :{' '}
                {CONCIERGE_NAME}
              </p>
            </div>

            {error && (
              <div className="flex items-start gap-3 rounded-2xl border border-[#C97B63]/25 bg-[#C97B63]/8 px-4 py-3 text-sm text-[#C97B63]">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <p className="flex-1">{error}</p>
                <button
                  type="button"
                  onClick={() => setError(null)}
                  className="text-xs font-medium underline"
                >
                  Fermer
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
      <div className="min-h-screen bg-[#FAFAF7]">
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
      <div className="min-h-screen bg-[#FAFAF7]">
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
      <div className="min-h-screen bg-[#FAFAF7]">
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
    <div className="min-h-screen bg-[#FAFAF7]">
      <div className="mx-auto max-w-xl px-4 py-8 sm:px-6 sm:py-12">
        {/* ============================================================
            ROUTAGE DES ÉCRANS —
            ÉCRAN 1 : L'Accueil Magique (QR d'entrée CLIENT_GLOBAL)
            ÉCRAN 2 : L'Expérience Table (QR de table CLIENT_ZONE)
            ============================================================ */}
        {isGlobal ? (
          <div>
            {/* HERO — Pourquoi un voile sombre sur la photo ? Il fait
                ressortir l'or champagne et le logo, créant une entrée
                en scène douce (jamais blanche ni agressive). */}
            <div className="relative overflow-hidden rounded-[28px] shadow-[0_20px_40px_-10px_rgba(0,0,0,0.10)]">
              <img
                src="/brand/salon-hero.png"
                alt="L'intérieur du salon"
                className="absolute inset-0 h-full w-full object-cover"
              />
              <div
                className="absolute inset-0 bg-gradient-to-b from-[#1A1A1A]/72 via-[#1A1A1A]/55 to-[#1A1A1A]/82"
                aria-hidden
              />
              <div className="relative flex flex-col items-center px-6 pb-8 pt-10 text-center">
                {/* LOGO DU SALON EN GRAND (Paramètres → Général → Logo) —
                    la première chose que le client reconnaît. */}
                {salonLogo ? (
                  <img
                    src={salonLogo}
                    alt="Logo du salon"
                    className="h-24 w-24 rounded-2xl bg-[#FBF7EC]/95 object-contain p-2.5 shadow-[0_14px_36px_rgba(0,0,0,0.38)] ring-1 ring-[#C9A961]/70"
                  />
                ) : null}

                {/* Nathalie — médailon discret, la même guide quel que
                    soit le QR scanné (identité de marque FeedbackPro). */}
                <img
                  src="/brand/nathalie-avatar.png"
                  alt="Nathalie — votre guide personnel"
                  className="mt-4 h-14 w-14 rounded-full object-cover shadow-[0_4px_20px_rgba(0,0,0,0.4)] ring-2 ring-[#C9A961]/70"
                />

                {/* Message dynamique — « Bonsoir, Cher Hôte. Je suis Nathalie. » */}
                <p className="mt-4 text-[10px] font-medium uppercase tracking-[0.34em] text-[#C9A961]">
                  {salonLogo ? loungeName : 'Salon VIP'}
                </p>
                <h1
                  className="mt-2 text-[28px] font-semibold leading-tight text-white"
                  style={SERIF}
                >
                  {salutation},{' '}
                  {table?.vipClient?.name?.trim().split(/\s+/)[0] ?? 'Cher Hôte'}.
                </h1>
                <p className="mt-1 text-lg italic text-[#E3C985]" style={SERIF}>
                  Je suis Nathalie.
                </p>
                <p className="mt-2.5 max-w-xs text-[13px] leading-relaxed text-white/75">
                  {loungeWelcome ||
                    'Votre guide personnel. Comment puis-je rendre votre instant plus doux ?'}
                </p>
              </div>
            </div>

            {/* Wi-Fi — l'icône change au clic (Copy → Check) : la
                micro-interaction la plus simple, et pourtant celle qui
                donne le sentiment que « tout répond ». Affiché SEULEMENT
                si le salon a configuré son réseau (Paramètres). */}
            {wifiNom && (
              <div className="mt-4 flex items-center gap-4 rounded-2xl border border-[#C9A961]/25 bg-white/70 px-4 py-3.5 shadow-[0_20px_40px_-10px_rgba(0,0,0,0.05)] backdrop-blur-xl">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#C9A961]/10 ring-1 ring-[#C9A961]/30">
                  <Wifi className="h-5 w-5 text-[#C9A961]" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-[#C9A961]">
                    Wi-Fi du salon
                  </p>
                  <p className="mt-0.5 truncate text-sm font-medium text-[#2C2C2C]">
                    {wifiNom}
                    {wifiMotDePasse && (
                      <span className="text-[#8B6F47]"> · {wifiMotDePasse}</span>
                    )}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={copierWifi}
                  className={cn(
                    'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-2 text-xs font-semibold transition-all',
                    wifiCopied
                      ? 'border-[#4A7C59]/40 bg-[#4A7C59]/10 text-[#4A7C59]'
                      : 'border-[#C9A961]/40 bg-[#C9A961]/8 text-[#8B6F47] hover:bg-[#C9A961]/15',
                  )}
                  aria-live="polite"
                >
                  {wifiCopied ? (
                    <Check className="h-3.5 w-3.5" aria-hidden />
                  ) : (
                    <Copy className="h-3.5 w-3.5" aria-hidden />
                  )}
                  {wifiCopied ? 'Copié' : 'Copier en 1 clic'}
                </button>
              </div>
            )}

            {/* Cartes de Service — verre dépoli, icônes fines Or
                Champagne. Chaque carte est une invitation. */}
            <p className="mt-8 text-[10px] font-medium uppercase tracking-[0.34em] text-[#8B6F47]">
              À votre entière disposition
            </p>
            <div className="mt-3 grid grid-cols-2 gap-3">
              {SERVICE_CARDS.map((card) => {
                const Icon = card.Icon
                return (
                  <button
                    key={card.id}
                    type="button"
                    onClick={() => handleActionClick(ACTIONS_BY_TYPE[card.actionType])}
                    className="group rounded-[20px] border border-[#C9A961]/25 bg-white/60 p-5 text-left shadow-[0_20px_40px_-10px_rgba(0,0,0,0.05)] backdrop-blur-xl transition-all duration-300 hover:-translate-y-0.5 hover:border-[#C9A961]/45 hover:shadow-[0_20px_40px_-10px_rgba(201,169,97,0.22)]"
                    aria-label={card.label}
                  >
                    <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#C9A961]/10 ring-1 ring-[#C9A961]/30 transition-colors group-hover:bg-[#C9A961]/18">
                      <Icon className="h-5 w-5 text-[#C9A961]" aria-hidden />
                    </span>
                    <p className="mt-3 text-sm font-semibold text-[#2C2C2C]" style={SERIF}>
                      {card.label}
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-[#8B6F47]">
                      {card.desc}
                    </p>
                  </button>
                )
              })}
            </div>

            {/* Autres attentions — pilules fines, jamais un menu liste */}
            <div className="mt-4 flex flex-wrap gap-2">
              {OTHER_ACTIONS.map(({ def, short }) => (
                <button
                  key={def.type}
                  type="button"
                  disabled={!!sending}
                  onClick={() => handleActionClick(def)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-[#EAE5DC] bg-white/70 px-3.5 py-2 text-xs font-medium text-[#8B6F47] backdrop-blur transition-all hover:border-[#C9A961]/45 hover:bg-[#C9A961]/8 disabled:opacity-60"
                  aria-label={def.label}
                >
                  <span aria-hidden>{def.emoji}</span>
                  {short}
                </button>
              ))}
            </div>

            {/* « Où vous trouvez-vous actuellement ? » — sélecteurs
                visuels (petites cartes ivoire), jamais de dropdown. */}
            {!globalZone ? (
              <div className="mt-8 rounded-[24px] border border-[#EAE5DC] bg-white/80 p-6 shadow-[0_20px_40px_-10px_rgba(0,0,0,0.05)] backdrop-blur-xl">
                <p className="text-base font-semibold text-[#2C2C2C]" style={SERIF}>
                  Où vous trouvez-vous actuellement ?
                </p>
                <p className="mt-1 text-xs leading-relaxed text-[#8B6F47]">
                  Nathalie transmet votre emplacement avec chaque demande —
                  discret et sans effort.
                </p>
                <div className="mt-4 grid grid-cols-2 gap-2.5">
                  {GLOBAL_ZONES.map((z) => (
                    <button
                      key={z.id}
                      type="button"
                      onClick={() => confirmZoneSelection(z.label)}
                      className="flex min-h-[56px] items-center gap-2.5 rounded-2xl border border-[#EAE5DC] bg-[#FAFAF7] px-3.5 py-3 text-left text-[13px] font-medium text-[#2C2C2C] transition-all hover:border-[#C9A961]/50 hover:bg-[#C9A961]/8"
                      aria-label={`Je suis : ${z.label}`}
                    >
                      <span
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#C9A961]/10 text-base"
                        aria-hidden
                      >
                        {z.emoji}
                      </span>
                      {z.label}
                    </button>
                  ))}
                </div>

                {/* Ou préciser un fauteuil — même élégance, un seul champ */}
                <div className="my-4 flex items-center gap-3" aria-hidden>
                  <span className="h-px flex-1 bg-[#EAE5DC]" />
                  <span className="text-[9px] font-medium uppercase tracking-[0.28em] text-[#8B6F47]/70">
                    ou
                  </span>
                  <span className="h-px flex-1 bg-[#EAE5DC]" />
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    const v = zoneFauteuil.trim()
                    if (!v) return
                    const zone = /^fauteuil/i.test(v) ? v : `Fauteuil ${v}`
                    confirmZoneSelection(zone)
                  }}
                  className="flex gap-2"
                >
                  <Input
                    value={zoneFauteuil}
                    onChange={(e) => setZoneFauteuil(e.target.value)}
                    placeholder="Ex : Fauteuil 12"
                    aria-label="Numéro de fauteuil"
                    className="border-[#EAE5DC] bg-[#FAFAF7] text-sm text-[#2C2C2C] placeholder:text-[#8B6F47]/50 focus-visible:border-[#C9A961] focus-visible:ring-[#C9A961]/20"
                  />
                  <Button
                    type="submit"
                    disabled={!zoneFauteuil.trim()}
                    className="shrink-0 rounded-2xl border border-[#C9A961] bg-[#C9A961] text-white shadow-[0_4px_20px_rgba(201,169,97,0.18)] hover:bg-[#C9A961]/90"
                  >
                    <Check className="h-4 w-4" aria-hidden />
                    <span className="sr-only">Valider mon emplacement</span>
                  </Button>
                </form>
              </div>
            ) : (
              /* Emplacement mémorisé — chip + Modifier */
              <div className="mt-6 flex justify-center">
                <div className="inline-flex items-center gap-2 rounded-full border border-[#C9A961]/40 bg-[#C9A961]/8 px-4 py-2">
                  <span aria-hidden>📍</span>
                  <span className="text-xs font-medium text-[#8B6F47]">
                    Installé : {globalZone}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setPendingAction(null)
                      setZoneModalOpen(true)
                    }}
                    className="text-xs font-semibold text-[#C9A961] underline underline-offset-2 hover:text-[#8B6F47]"
                  >
                    Modifier
                  </button>
                </div>
              </div>
            )}

            {/* Erreur inline (mode global) */}
            {error && (
              <div className="mt-4 flex items-start gap-3 rounded-2xl border border-[#C97B63]/25 bg-[#C97B63]/8 px-4 py-3 text-sm text-[#C97B63]">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <p className="flex-1">{error}</p>
                <button
                  type="button"
                  onClick={() => setError(null)}
                  className="text-xs font-medium underline"
                >
                  Fermer
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
            <div className="relative overflow-hidden rounded-[28px] border border-[#EAE5DC] bg-white px-6 pb-6 pt-7 text-center shadow-[0_20px_40px_-10px_rgba(0,0,0,0.06)]">
              <div
                className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#C9A961] via-[#8B6F47] to-[#C9A961]"
                aria-hidden
              />
              {/* LOGO DU SALON EN GRAND (Paramètres → Général → Logo) */}
              {salonLogo ? (
                <img
                  src={salonLogo}
                  alt="Logo du salon"
                  className="mx-auto h-16 w-16 rounded-xl bg-[#FBF7EC] object-contain p-2 shadow-[0_6px_20px_rgba(201,169,97,0.30)] ring-1 ring-[#C9A961]/55"
                />
              ) : null}
              <p className="mt-3 text-[10px] font-medium uppercase tracking-[0.34em] text-[#C9A961]">
                Votre Table
              </p>
              <h1 className="mt-1.5 text-3xl font-semibold text-[#2C2C2C]" style={SERIF}>
                Table {table?.tableNumber ?? ''}
              </h1>
              <p className="mt-1 text-sm italic text-[#8B6F47]" style={SERIF}>
                {ZONE_VIEWS[table?.zone ?? ''] ?? 'Vue sur le tarmac'}
              </p>
              <p className="mt-2 text-xs text-[#8B6F47]/80">
                {table?.seats} places · {zoneLabel(table?.zone ?? 'main')}
              </p>
            </div>

            {/* Conciergerie — carte proéminente, Amadou en personne.
                Pourquoi un fond anthracite ? Le contraste fait de cette
                carte le point focal ; l'or champagne réserve l'action. */}
            <div className="relative mt-4 overflow-hidden rounded-[24px] bg-gradient-to-br from-[#1A1A1A] via-[#2E2C28] to-[#1A1A1A] p-5 shadow-[0_20px_40px_-10px_rgba(26,26,26,0.35)]">
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
                  className="h-14 w-14 rounded-full object-cover shadow-[0_4px_16px_rgba(0,0,0,0.4)] ring-2 ring-[#C9A961]/70"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-medium uppercase tracking-[0.28em] text-[#C9A961]">
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
                className="relative mt-4 w-full gap-2 rounded-2xl bg-[#C9A961] font-semibold text-[#1A1A1A] shadow-[0_8px_24px_rgba(201,169,97,0.35)] hover:bg-[#C9A961]/90"
              >
                <ConciergeBell className="h-4 w-4" aria-hidden />
                Appeler votre Concierge
              </Button>
            </div>

            {/* Prêt Express — présenté comme une vitrine de boutique :
                médaillon ivoire, badge vert sauge « X disponibles »,
                « Me l'apporter » → coche dorée qui se dessine. */}
            {quickLoans.length > 0 && (
              <div className="mt-4 rounded-[24px] border border-[#EAE5DC] bg-white p-5 shadow-[0_20px_40px_-10px_rgba(0,0,0,0.05)]">
                <div className="flex items-center justify-between">
                  <p className="text-base font-semibold text-[#2C2C2C]" style={SERIF}>
                    Prêt Express
                  </p>
                  <button
                    type="button"
                    onClick={() => setView('loan')}
                    className="text-xs font-semibold text-[#C9A961] underline-offset-2 hover:underline"
                  >
                    Voir tout
                  </button>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  {quickLoans.map((item) => (
                    <div
                      key={item.id}
                      className="relative overflow-hidden rounded-2xl border border-[#EAE5DC] bg-[#FAFAF7] p-4 text-center"
                    >
                      {/* Coche dorée qui se dessine — confirmation élégante */}
                      {loanDraw === item.id && (
                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-[#FAFAF7]/95"
                        >
                          <svg viewBox="0 0 64 64" className="h-14 w-14" aria-hidden>
                            <circle
                              cx="32"
                              cy="32"
                              r="29"
                              fill="none"
                              stroke="#EAE5DC"
                              strokeWidth="2"
                            />
                            <motion.path
                              d="M20 33 L29 42 L45 24"
                              fill="none"
                              stroke="#C9A961"
                              strokeWidth="3.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              initial={{ pathLength: 0 }}
                              animate={{ pathLength: 1 }}
                              transition={{ duration: 0.55, ease: 'easeOut' }}
                            />
                          </svg>
                          <p className="mt-1.5 text-xs font-medium text-[#8B6F47]">
                            C&apos;est noté
                          </p>
                        </motion.div>
                      )}
                      <span
                        className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-white text-xl ring-1 ring-[#C9A961]/30"
                        aria-hidden
                      >
                        {item.emoji ?? '📦'}
                      </span>
                      <p className="mt-2 truncate text-sm font-medium text-[#2C2C2C]">
                        {item.name}
                      </p>
                      <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-[#4A7C59]/10 px-2.5 py-0.5 text-[10px] font-semibold text-[#4A7C59]">
                        {item.availableStock}{' '}
                        {item.availableStock > 1 ? 'disponibles' : 'disponible'}
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        disabled={!!loanDraw || !!sending}
                        onClick={() => apporterQuick(item)}
                        className="mt-3 w-full gap-1.5 rounded-xl border border-[#C9A961]/50 bg-[#C9A961]/10 text-xs font-semibold text-[#8B6F47] hover:bg-[#C9A961]/20"
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
          <div className="mt-4 flex items-start gap-3 rounded-2xl border border-[#6B4C9A]/25 bg-[#6B4C9A]/8 px-4 py-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#6B4C9A]/15">
              <Crown className="h-5 w-5 text-[#6B4C9A]" aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <p
                className="text-base font-semibold text-[#6B4C9A]"
                style={SERIF}
              >
                🥂 Bienvenue, {table.vipClient.name}
              </p>
              <p className="mt-0.5 text-sm text-[#2C2C2C]">
                Nous sommes honorés de vous accueillir.
              </p>
              {table.vipClient.preferences?.length > 0 && (
                <p className="mt-1 text-xs text-[#8B6F47]">
                  Vos préférences : {table.vipClient.preferences.join(', ')}
                </p>
              )}
              {(table.vipClient.allergies?.length ?? 0) > 0 && (
                <p className="mt-1 text-xs font-medium text-[#C97B63]">
                  Nous prenons en compte vos allergies : {table.vipClient.allergies?.join(', ')}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Erreur réseau inline (réinitialisée à chaque sendRequest) */}
        {error && (
          <div className="mt-4 flex items-start gap-3 rounded-2xl border border-[#C97B63]/25 bg-[#C97B63]/8 px-4 py-3 text-sm text-[#C97B63]">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <p className="flex-1">{error}</p>
            <button
              type="button"
              onClick={() => setError(null)}
              className="text-xs font-medium underline"
            >
              Fermer
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
                  'group flex w-full items-center gap-4 rounded-2xl border border-[#EAE5DC] bg-white p-4 text-left shadow-[0_4px_20px_rgba(201,169,97,0.06)] ring-1 ring-transparent transition-all hover:-translate-y-0.5 hover:shadow-[0_8px_28px_rgba(201,169,97,0.12)] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0',
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
                  <p className="text-sm font-semibold text-[#2C2C2C]">
                    {action.label}
                  </p>
                  <p className="mt-0.5 text-xs text-[#8B6F47]">
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

        {/* Pied de page */}
        <div className="mt-8 flex flex-col items-center gap-2 text-center">
          <p className="inline-flex items-center gap-1.5 text-[11px] text-[#8B6F47]">
            <Sparkles className="h-3 w-3" aria-hidden /> Service discret — votre
            confort d&apos;abord.
          </p>
          <p className="text-[11px] text-[#8B6F47]/70">
            {isGlobal
              ? // QR_ROUTING — GLOBAL : aucune référence de table,
                // on rappelle la session Nathalie (4 h, anti-abus)
                `${loungeName} · Session Nathalie · 4 h`
              : `Table ${table?.tableNumber} · ${table?.seats} places · ${
                  zoneLabel(table?.zone ?? 'main')
                }`}
          </p>
          {/* Module 3 — Indicateur langue détectée + Module 11 — Session Nathalie */}
          <div className="mt-2 flex items-center gap-3">
            {detectedLang !== 'fr' && (
              <span className="inline-flex items-center gap-1 rounded-full bg-[#C9A961]/8 px-2.5 py-1 text-[10px] font-medium text-[#8B6F47]">
                🌐 {detectedLang.toUpperCase()}
              </span>
            )}
            {sessionToken && (
              <button
                type="button"
                onClick={() => {
                  try {
                    if (typeof navigator !== 'undefined' && navigator.share) {
                      navigator.share({
                        title: 'Nathalie — Salon VIP',
                        text: 'Gardez Nathalie dans votre poche',
                        url: window.location.href,
                      }).catch(() => {})
                    } else {
                      navigator.clipboard?.writeText(window.location.href).catch(() => {})
                    }
                  } catch { /* ignore */ }
                }}
                className="inline-flex items-center gap-1 rounded-full border border-[#C9A961]/30 bg-white px-2.5 py-1 text-[10px] font-medium text-[#8B6F47] transition hover:bg-[#C9A961]/8"
              >
                📱 Garder Nathalie
              </button>
            )}
          </div>
        </div>
      </div>

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
          <div className="relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-3xl border border-[#EAE5DC] bg-white p-6 shadow-[0_16px_48px_rgba(201,169,97,0.18)] sm:p-8">
            {/* Filet doré supérieur (signature Luxe Lumineux) */}
            <div
              className="pointer-events-none absolute inset-x-0 top-0 h-1 rounded-t-3xl bg-gradient-to-r from-[#C9A961] via-[#8B6F47] to-[#C9A961]"
              aria-hidden
            />

            {/* Titre + fermeture */}
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-widest text-[#C9A961]">
                  Nathalie
                </p>
                <h2
                  id="zone-modal-title"
                  className="mt-1 text-xl font-semibold text-[#2C2C2C]"
                  style={SERIF}
                >
                  Où êtes-vous installé actuellement ?
                </h2>
                <p className="mt-1.5 text-sm text-[#8B6F47]">
                  Nathalie transmettra votre emplacement avec votre demande.
                </p>
              </div>
              <button
                type="button"
                onClick={cancelZoneModal}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#EAE5DC] bg-white text-[#8B6F47] transition hover:bg-[#EAE5DC]/40"
                aria-label="Fermer la sélection d'emplacement"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>

            {/* Boutons visuels de zone — sélection immédiate */}
            <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {GLOBAL_ZONES.map((z) => (
                <button
                  key={z.id}
                  type="button"
                  onClick={() => confirmZoneSelection(z.label)}
                  className={cn(
                    'flex min-h-[52px] items-center gap-3 rounded-2xl border px-4 py-3 text-left text-sm font-medium transition-all',
                    'border-[#EAE5DC] bg-[#FAFAF7] text-[#2C2C2C] hover:border-[#C9A961]/50 hover:bg-[#C9A961]/8',
                  )}
                >
                  <span
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#C9A961]/10 text-lg"
                    aria-hidden
                  >
                    {z.emoji}
                  </span>
                  {z.label}
                </button>
              ))}
            </div>

            {/* Séparateur « ou » */}
            <div className="my-5 flex items-center gap-3" aria-hidden>
              <span className="h-px flex-1 bg-[#EAE5DC]" />
              <span className="text-[10px] font-medium uppercase tracking-widest text-[#8B6F47]/70">
                ou
              </span>
              <span className="h-px flex-1 bg-[#EAE5DC]" />
            </div>

            {/* Champ libre « Numéro de fauteuil » */}
            <form
              onSubmit={(e) => {
                e.preventDefault()
                const v = zoneFauteuil.trim()
                if (!v) return
                // Normalise « 12 » → « Fauteuil 12 » (déjà préfixé → tel quel)
                const zone = /^fauteuil/i.test(v) ? v : `Fauteuil ${v}`
                confirmZoneSelection(zone)
              }}
              className="space-y-3"
            >
              <div>
                <label
                  htmlFor="zone-fauteuil"
                  className="text-sm font-medium text-[#2C2C2C]"
                >
                  Indiquez votre numéro de fauteuil
                </label>
                <Input
                  id="zone-fauteuil"
                  value={zoneFauteuil}
                  onChange={(e) => setZoneFauteuil(e.target.value)}
                  placeholder="Ex : Fauteuil 12"
                  inputMode="text"
                  className="mt-2 border-[#EAE5DC] bg-[#FAFAF7] text-sm text-[#2C2C2C] placeholder:text-[#8B6F47]/50 focus-visible:border-[#C9A961] focus-visible:ring-[#C9A961]/20"
                />
              </div>
              <Button
                type="submit"
                disabled={!zoneFauteuil.trim()}
                className="w-full gap-2 rounded-2xl border border-[#C9A961] bg-[#C9A961] text-white shadow-[0_4px_20px_rgba(201,169,97,0.18)] hover:bg-[#C9A961]/90"
              >
                <Check className="h-4 w-4" aria-hidden />
                Valider mon emplacement
              </Button>
            </form>

            <p className="mt-4 text-center text-[11px] text-[#8B6F47]/70">
              Votre choix est mémorisé pour la session — modifiable à tout
              moment.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

export default VipTableScan
