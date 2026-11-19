'use client'

// ============================================================
// <VipTableScan /> — Refonte « Luxe Lumineux »
// ------------------------------------------------------------
// Vue client après scan d'un QR code de table VIP.
//  1. Résout qrToken → table (GET /api/vip/tables/by-qr/:token)
//  2. Affiche un bandeau de bienvenue + bannière VIP (si client
//     reconnu) + 7 cartes d'action.
//  3. Formulaires riches pour refreshment (panier), problem
//     (tags + photo), concierge (sélecteur de demande).
//  4. Vue confirmation personnalisée par type avec n° de suivi.
// La palette « Luxe Lumineux » (champagne / bronze / anthracite)
// est appliquée partout. Service discret, confort d'abord.
// ============================================================

import { useEffect, useState, useRef, type ChangeEvent } from 'react'
import {
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
import { VipUpsellCatalog } from '@/components/feedbackpro/vip-upsell-catalog'
import { VipShowerReservation } from '@/components/feedbackpro/vip-shower-reservation'
import { VipLoanCatalog } from '@/components/feedbackpro/vip-loan-catalog'

// ============================================================
// Types
// ============================================================
type VipClient = {
  name: string
  vipLevel: string
  preferences: string[]
  airline?: string | null
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

type View = 'main' | 'problem' | 'refreshment' | 'concierge' | 'upsell' | 'shower-reservation' | 'loan'

type Confirmation = {
  type: RequestType
  trackingNumber: string
  tableNumber: string
  // Pré-parsé depuis le `metadata` envoyé (items / tags / requestType…)
  metadata?: any
}

type ActionDef = {
  type: RequestType
  emoji: string
  label: string
  description: string
  Icon: typeof Wine
  tone: 'gold' | 'bronze' | 'sage' | 'amethyst' | 'terracotta'
  behavior: 'direct' | 'form:refreshment' | 'form:concierge' | 'form:problem' | 'form:upsell' | 'form:shower-reservation' | 'form:loan'
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
    behavior: 'direct',
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
}

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
}

const SERIF = { fontFamily: 'Georgia, "Playfair Display", serif' } as const

// ============================================================
// Composant principal
// ============================================================
export function VipTableScan({
  qrToken,
  onExit,
}: {
  qrToken: string
  onExit?: () => void
}) {
  const [table, setTable] = useState<ScanTable | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState<RequestType | null>(null)
  const [view, setView] = useState<View>('main')
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null)

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

  // ---- Résolution du token → table ----
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetch(`/api/vip/tables/by-qr/${encodeURIComponent(qrToken)}`, {
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
        setTable({
          id: d.id ?? qrToken,
          tableNumber: d.tableNumber,
          zone: d.zone,
          seats: d.seats,
          status: d.status ?? 'occupied',
          clientName: d.clientName ?? null,
          clientVipLevel: d.clientVipLevel ?? null,
          qrToken,
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
  }, [qrToken])

  // ---- Helpers ----
  const safeParse = (s: string) => {
    try {
      return JSON.parse(s)
    } catch {
      return s
    }
  }

  const zoneLabel = (z: string) => ZONE_LABELS[z] ?? z

  const cartCount = Object.values(cart).reduce((a, b) => a + b, 0)
  const cartItems = MENU_ITEMS.filter((m) => (cart[m.id] ?? 0) > 0)

  // ---- Envoi d'une demande via POST /api/vip/requests ----
  const sendRequest = async (
    type: RequestType,
    opts?: { message?: string; metadata?: string },
  ) => {
    if (!table) return
    setSending(type)
    setError(null)
    try {
      const res = await fetch('/api/vip/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          qrToken: table.qrToken,
          type,
          message: opts?.message,
          metadata: opts?.metadata,
        }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || 'Erreur')
      }
      const meta = opts?.metadata ? safeParse(opts.metadata) : undefined
      setConfirmation({
        type,
        trackingNumber: json.data?.trackingNumber ?? '—',
        tableNumber: json.data?.table?.tableNumber ?? table.tableNumber,
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
    if (action.behavior === 'direct') {
      sendRequest(action.type)
    } else if (action.behavior === 'form:refreshment') {
      setView('refreshment')
    } else if (action.behavior === 'form:concierge') {
      setView('concierge')
    } else if (action.behavior === 'form:problem') {
      setView('problem')
    } else if (action.behavior === 'form:upsell') {
      setView('upsell')
    } else if (action.behavior === 'form:shower-reservation') {
      setView('shower-reservation')
    } else if (action.behavior === 'form:loan') {
      setView('loan')
    }
  }

  const handlePhotoChange = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null
    setProblemPhoto(f)
  }

  const removePhoto = () => {
    setProblemPhoto(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
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
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#FAFAF7] px-6">
        <Loader2 className="h-8 w-8 animate-spin text-[#C9A961]" aria-hidden />
        <p className="text-sm text-[#8B6F47]">Connexion à votre table…</p>
      </div>
    )
  }

  // ============================================================
  // RENDU — Error (avant résolution de la table)
  // ============================================================
  if (error && !table) {
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

  if (!table) return null

  // ============================================================
  // RENDU — Confirmation (personnalisée par type)
  // ============================================================
  if (confirmation) {
    const action = ACTIONS.find((a) => a.type === confirmation.type)!
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

    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-[#FAFAF7] px-6 py-12 text-center">
        {/* Grand emoji dans un médaillon doré */}
        <div className="relative flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-[#C9A961]/20 to-[#4A7C59]/20 ring-4 ring-white">
          <span className="text-5xl" aria-hidden>
            {action.emoji}
          </span>
        </div>

        <div>
          <h1 className="text-2xl font-semibold text-[#2C2C2C]" style={SERIF}>
            {conf.title}
          </h1>
          <p className="mt-2 max-w-sm text-sm text-[#8B6F47]">
            {conf.subtitle}
          </p>
        </div>

        {/* Carte n° de suivi + détails */}
        <div className="w-full max-w-sm rounded-2xl border border-[#EAE5DC] bg-white px-5 py-4 text-left shadow-[0_4px_20px_rgba(201,169,97,0.06)]">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-medium uppercase tracking-widest text-[#8B6F47]">
              {trackingLabel}
            </p>
            <Check className="h-4 w-4 text-[#4A7C59]" aria-hidden />
          </div>
          <p className="mt-1 text-sm font-semibold tracking-wide text-[#2C2C2C]">
            #{confirmation.trackingNumber}
          </p>
          {detailsBox}
          <div className="mt-3 border-t border-[#EAE5DC] pt-3">
            <p className="text-[10px] font-medium uppercase tracking-widest text-[#8B6F47]">
              Table
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
                Table {table.tableNumber}
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
                    {/* eslint-disable-next-line @next/next/no-img-element */}
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
                Table {table.tableNumber}
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
                Table {table.tableNumber}
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
  // ============================================================
  if (view === 'upsell' && table) {
    return (
      <div className="min-h-screen bg-[#FAFAF7]">
        <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6">
          <VipUpsellCatalog
            tableNumber={table.tableNumber}
            onBack={() => setView('main')}
          />
        </div>
      </div>
    )
  }

  // ============================================================
  // RENDU — Vue Réservation Douche (Module 4 — Smart Shower Queue)
  // ============================================================
  if (view === 'shower-reservation' && table) {
    return (
      <div className="min-h-screen bg-[#FAFAF7]">
        <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6">
          <VipShowerReservation
            tableNumber={table.tableNumber}
            onBack={() => setView('main')}
          />
        </div>
      </div>
    )
  }

  // ============================================================
  // RENDU — Vue Prêt Express (Module 6 — Prêt gratuit)
  // ============================================================
  if (view === 'loan' && table) {
    return (
      <div className="min-h-screen bg-[#FAFAF7]">
        <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6">
          <VipLoanCatalog
            tableNumber={table.tableNumber}
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
        {/* Bandeau de bienvenue */}
        <div className="relative overflow-hidden rounded-3xl border border-[#EAE5DC] bg-white p-8 text-center shadow-[0_8px_32px_rgba(201,169,97,0.10)]">
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#C9A961] via-[#8B6F47] to-[#C9A961]"
            aria-hidden
          />
          <div
            className="pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full bg-[#C9A961]/10"
            aria-hidden
          />
          <div
            className="pointer-events-none absolute -bottom-12 -left-12 h-32 w-32 rounded-full bg-[#6B4C9A]/8"
            aria-hidden
          />

          <span className="text-5xl" aria-hidden>
            🥂
          </span>
          <p className="mt-3 text-xs font-medium uppercase tracking-widest text-[#8B6F47]">
            Salon VIP · Lounge Premium
          </p>
          <h1 className="mt-2 text-2xl font-semibold text-[#2C2C2C]" style={SERIF}>
            Bienvenue à la Table {table.tableNumber}
          </h1>
          <p className="mt-2 text-sm text-[#8B6F47]">
            Notre équipe est à votre service.
          </p>
        </div>

        {/* Bannière de détection VIP */}
        {table.vipClient && (
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

        {/* Grille des 7 cartes d'action */}
        <div className="mt-6 space-y-3">
          {ACTIONS.map((action) => {
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

        {/* Pied de page */}
        <div className="mt-8 flex flex-col items-center gap-2 text-center">
          <p className="inline-flex items-center gap-1.5 text-[11px] text-[#8B6F47]">
            <Sparkles className="h-3 w-3" aria-hidden /> Service discret — votre
            confort d&apos;abord.
          </p>
          <p className="text-[11px] text-[#8B6F47]/70">
            Table {table.tableNumber} · {table.seats} places ·{' '}
            {zoneLabel(table.zone)}
          </p>
        </div>
      </div>
    </div>
  )
}

export default VipTableScan
