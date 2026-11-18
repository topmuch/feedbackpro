'use client'

// ============================================================
// <VipUpsellCatalog /> — Module 5 · Catalogue Upsell & Duty-Free
// ------------------------------------------------------------
// Vue CLIENT (après scan QR table). Présente le catalogue des
// offres premium réservables depuis la table :
//   • Onglet 1 — "S'offrir un moment d'exception" (type=upsell)
//   • Onglet 2 — "Boutique livrée à votre place" (type=dutyfree)
//
// Chaque offre est une carte : emoji + titre + description +
// prix FCFA + bouton "Réserver". Au clic → ouverture d'un
// dialog de paiement (Wave / Orange Money / Cash). La
// confirmation renvoie un n° de suivi #CMD-2026-XXXX.
//
// Palette « Luxe Lumineux » :
//   - Background   #FAFAF7    - Cards  #FFFFFF + shadow gold 6%
//   - Gold         #C9A961    - Bronze #8B6F47
//   - Text         #2C2C2C    - VIP    #6B4C9A
//   - Success      #4A7C59    - Alert  #C97B63
//   - Border       #EAE5DC
//
// APIs consommées :
//   GET  /api/vip/upsell-offers?type=upsell|dutyfree
//   POST /api/vip/orders { tableNumber, items, paymentMethod }
// ============================================================

import { useCallback, useEffect, useState } from 'react'
import {
  ArrowLeft,
  Sparkles,
  ShoppingBag,
  Check,
  Loader2,
  Crown,
  Plane,
  Gift,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'

// ============================================================
// Types
// ============================================================

type OfferType = 'upsell' | 'dutyfree'

interface UpsellOffer {
  id: string
  title: string
  description: string | null
  priceFcfa: number
  type: OfferType
  category: string | null
  emoji: string | null
  stock: number // -1 = illimité
  active: boolean
}

type PaymentMethod = 'wave' | 'orange_money' | 'cash'

interface OrderItem {
  offerId: string
  title: string
  priceFcfa: number
  qty: number
}

interface OrderResult {
  id: string
  trackingNumber: string
  tableNumber: string | null
  totalFcfa: number
  status: string
  paymentMethod: PaymentMethod
}

type Screen = 'catalog' | 'confirm'

// ============================================================
// Constantes & helpers
// ============================================================

const TITLE_FONT = {
  fontFamily: 'Georgia, "Playfair Display", serif',
} as const

const CARD_SHADOW = 'shadow-[0_4px_20px_rgba(201,169,97,0.06)]'

const PAYMENT_METHODS: Array<{
  value: PaymentMethod
  label: string
  emoji: string
  hint: string
  badgeClass: string
}> = [
  {
    value: 'wave',
    label: 'Wave',
    emoji: '🌊',
    hint: 'Paiement mobile instantané',
    badgeClass: 'bg-sky-50 text-sky-700 border-sky-200',
  },
  {
    value: 'orange_money',
    label: 'Orange Money',
    emoji: '🟠',
    hint: 'Compte Orange Money',
    badgeClass:
      'bg-orange-50 text-orange-700 border-orange-200',
  },
  {
    value: 'cash',
    label: 'Espèces',
    emoji: '💵',
    hint: 'Règlement au staff à votre table',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
]

/** Formate un montant en FCFA avec séparateur de milliers (espace). */
function formatFcfa(amount: number): string {
  const rounded = Math.round(amount)
  const withSpaces = rounded
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  return `${withSpaces} FCFA`
}

/** Capitalise discrètement une catégorie (spa → Spa). */
function prettyCategory(cat: string | null): string {
  if (!cat) return ''
  const trimmed = cat.trim()
  if (!trimmed) return ''
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1)
}

/** Renvoie un emoji par défaut si l'offre n'en a pas. */
function offerEmoji(offer: UpsellOffer): string {
  if (offer.emoji && offer.emoji.trim()) return offer.emoji.trim()
  if (offer.type === 'dutyfree') return '🎁'
  return '✨'
}

// ============================================================
// Sous-composant : OfferCard
// ============================================================

interface OfferCardProps {
  offer: UpsellOffer
  onReserve: (offer: UpsellOffer) => void
  busy?: boolean
}

function OfferCard({ offer, onReserve, busy }: OfferCardProps) {
  const emoji = offerEmoji(offer)
  const outOfStock = typeof offer.stock === 'number' && offer.stock === 0

  return (
    <article
      className={cn(
        'flex flex-col rounded-xl border border-[#EAE5DC] bg-white p-5',
        'transition-all duration-200',
        CARD_SHADOW,
        outOfStock
          ? 'opacity-60'
          : 'hover:border-[#C9A961]/40 hover:shadow-[0_8px_28px_rgba(201,169,97,0.12)]',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <span
          className="text-4xl leading-none"
          aria-hidden
          style={{ fontFamily: '"Apple Color Emoji","Segoe UI Emoji",sans-serif' }}
        >
          {emoji}
        </span>
        {offer.category && (
          <span
            className={cn(
              'rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
              'border-[#EAE5DC] bg-[#FAFAF7] text-[#8B6F47]',
            )}
          >
            {prettyCategory(offer.category)}
          </span>
        )}
      </div>

      <h3
        className="mt-4 text-lg leading-tight text-[#2C2C2C]"
        style={TITLE_FONT}
      >
        {offer.title}
      </h3>

      {offer.description && (
        <p className="mt-2 flex-1 text-sm leading-relaxed text-[#6b6b6b]">
          {offer.description}
        </p>
      )}

      <div className="mt-4 flex items-end justify-between gap-3">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-wide text-[#8B6F47]">
            Prix
          </div>
          <div
            className="text-xl font-semibold text-[#2C2C2C]"
            style={TITLE_FONT}
          >
            {formatFcfa(offer.priceFcfa)}
          </div>
        </div>

        <Button
          type="button"
          disabled={outOfStock || busy}
          onClick={() => onReserve(offer)}
          className={cn(
            'h-9 rounded-md px-4 text-sm font-semibold text-white',
            'bg-[#C9A961] hover:bg-[#B8974A] active:bg-[#A6863C]',
            'shadow-sm transition-colors',
            'disabled:cursor-not-allowed disabled:opacity-50',
          )}
        >
          {busy ? (
            <>
              <Loader2 className="size-4 animate-spin" /> Réservation…
            </>
          ) : outOfStock ? (
            'Épuisé'
          ) : (
            <>
              <Sparkles className="size-4" /> Réserver
            </>
          )}
        </Button>
      </div>
    </article>
  )
}

// ============================================================
// Sous-composant : PaymentDialog
// ============================================================

interface PaymentDialogProps {
  offer: UpsellOffer | null
  tableNumber: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirmed: (order: OrderResult) => void
}

function PaymentDialog({
  offer,
  tableNumber,
  open,
  onOpenChange,
  onConfirmed,
}: PaymentDialogProps) {
  const { toast } = useToast()
  const [method, setMethod] = useState<PaymentMethod>('wave')
  const [submitting, setSubmitting] = useState(false)

  // Reset du moyen de paiement à chaque ouverture
  useEffect(() => {
    if (open) setMethod('wave')
  }, [open, offer])

  const handleConfirm = useCallback(async () => {
    if (!offer) return
    setSubmitting(true)
    try {
      const payload = {
        tableNumber,
        items: [
          {
            offerId: offer.id,
            title: offer.title,
            priceFcfa: offer.priceFcfa,
            qty: 1,
          } satisfies OrderItem,
        ],
        paymentMethod: method,
      }

      const res = await fetch('/api/vip/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      })
      const body = await res.json().catch(() => null)

      if (!body || body.ok !== true || !body.data) {
        throw new Error(body?.error || 'Réponse invalide')
      }

      const data = body.data as OrderResult
      toast({
        title: 'Commande confirmée',
        description: `Suivi : ${data.trackingNumber}`,
      })
      onConfirmed(data)
      onOpenChange(false)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erreur réseau'
      toast({
        title: 'Paiement impossible',
        description: msg,
        variant: 'destructive',
      })
    } finally {
      setSubmitting(false)
    }
  }, [offer, method, tableNumber, toast, onConfirmed, onOpenChange])

  if (!offer) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-xl border-[#EAE5DC] bg-white p-6 sm:max-w-md">
        <DialogHeader>
          <DialogTitle
            className="text-xl text-[#2C2C2C]"
            style={TITLE_FONT}
          >
            Paiement de votre réservation
          </DialogTitle>
          <DialogDescription className="text-[#6b6b6b]">
            Table {tableNumber} · Choisissez votre moyen de paiement.
          </DialogDescription>
        </DialogHeader>

        {/* Récap offre */}
        <div
          className={cn(
            'flex items-center gap-3 rounded-lg border border-[#EAE5DC]',
            'bg-[#FAFAF7] p-4',
          )}
        >
          <span
            className="text-3xl"
            aria-hidden
            style={{ fontFamily: '"Apple Color Emoji","Segoe UI Emoji",sans-serif' }}
          >
            {offerEmoji(offer)}
          </span>
          <div className="min-w-0 flex-1">
            <div
              className="truncate text-base font-semibold text-[#2C2C2C]"
              style={TITLE_FONT}
            >
              {offer.title}
            </div>
            {offer.description && (
              <div className="truncate text-xs text-[#6b6b6b]">
                {offer.description}
              </div>
            )}
          </div>
          <div
            className="text-lg font-semibold text-[#C9A961]"
            style={TITLE_FONT}
          >
            {formatFcfa(offer.priceFcfa)}
          </div>
        </div>

        {/* Sélecteur de paiement */}
        <div className="space-y-2">
          <Label className="text-xs font-semibold uppercase tracking-wide text-[#8B6F47]">
            Moyen de paiement
          </Label>
          <RadioGroup
            value={method}
            onValueChange={(v) => setMethod(v as PaymentMethod)}
            className="gap-2"
          >
            {PAYMENT_METHODS.map((pm) => (
              <label
                key={pm.value}
                htmlFor={`pm-${pm.value}`}
                className={cn(
                  'flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-all',
                  method === pm.value
                    ? 'border-[#C9A961] bg-[#C9A961]/5 ring-1 ring-[#C9A961]/30'
                    : 'border-[#EAE5DC] bg-white hover:border-[#C9A961]/40',
                )}
              >
                <RadioGroupItem
                  id={`pm-${pm.value}`}
                  value={pm.value}
                  className="border-[#C9A961] text-[#C9A961]"
                />
                <span
                  className="text-2xl"
                  aria-hidden
                  style={{
                    fontFamily: '"Apple Color Emoji","Segoe UI Emoji",sans-serif',
                  }}
                >
                  {pm.emoji}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-[#2C2C2C]">
                    {pm.label}
                  </div>
                  <div className="text-xs text-[#6b6b6b]">{pm.hint}</div>
                </div>
              </label>
            ))}
          </RadioGroup>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
            className="text-[#8B6F47] hover:bg-[#FAFAF7] hover:text-[#2C2C2C]"
          >
            Annuler
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={submitting}
            className={cn(
              'h-10 rounded-md bg-[#C9A961] px-6 text-sm font-bold uppercase tracking-wide',
              'text-white hover:bg-[#B8974A] active:bg-[#A6863C]',
            )}
          >
            {submitting ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Traitement…
              </>
            ) : (
              <>
                <Check className="size-4" /> Confirmer et payer ·{' '}
                {formatFcfa(offer.priceFcfa)}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ============================================================
// Sous-composant : ConfirmationView
// ============================================================

interface ConfirmationViewProps {
  order: OrderResult
  onBack: () => void
}

function ConfirmationView({ order, onBack }: ConfirmationViewProps) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 py-10 text-center">
      <div
        className={cn(
          'flex size-20 items-center justify-center rounded-full',
          'bg-[#4A7C59]/10 ring-4 ring-[#4A7C59]/15',
        )}
      >
        <Check className="size-10 text-[#4A7C59]" strokeWidth={3} />
      </div>

      <h2
        className="mt-6 text-2xl text-[#2C2C2C]"
        style={TITLE_FONT}
      >
        Commande confirmée
      </h2>
      <p className="mt-2 text-sm text-[#6b6b6b]">
        Merci pour votre confiance. Notre équipe prépare votre
        commande et vous notifie à la table dès qu'elle est prête.
      </p>

      <div
        className={cn(
          'mt-6 w-full rounded-xl border border-[#EAE5DC] bg-white p-5 text-left',
          CARD_SHADOW,
        )}
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wide text-[#8B6F47]">
            N° de suivi
          </span>
          <span
            className="text-lg font-bold tracking-wider text-[#C9A961]"
            style={TITLE_FONT}
          >
            #{order.trackingNumber}
          </span>
        </div>
        <div className="my-3 h-px bg-[#EAE5DC]" />
        <div className="flex items-center justify-between text-sm">
          <span className="text-[#6b6b6b]">Total payé</span>
          <span className="font-semibold text-[#2C2C2C]">
            {formatFcfa(order.totalFcfa)}
          </span>
        </div>
        <div className="mt-2 flex items-center justify-between text-sm">
          <span className="text-[#6b6b6b]">Statut</span>
          <span className="inline-flex items-center gap-1 rounded-full bg-[#4A7C59]/10 px-2 py-0.5 text-xs font-semibold text-[#4A7C59]">
            <Check className="size-3" /> Payé
          </span>
        </div>
      </div>

      <Button
        onClick={onBack}
        className={cn(
          'mt-6 h-10 rounded-md bg-[#C9A961] px-6 text-sm font-semibold text-white',
          'hover:bg-[#B8974A] active:bg-[#A6863C]',
        )}
      >
        <ArrowLeft className="size-4" /> Retour au catalogue
      </Button>
    </div>
  )
}

// ============================================================
// Composant principal
// ============================================================

export function VipUpsellCatalog({
  tableNumber,
  onBack,
}: {
  tableNumber: string
  onBack: () => void
}) {
  const { toast } = useToast()

  // ----- State -----
  const [activeTab, setActiveTab] = useState<OfferType>('upsell')
  const [upsellOffers, setUpsellOffers] = useState<UpsellOffer[]>([])
  const [dutyfreeOffers, setDutyfreeOffers] = useState<UpsellOffer[]>([])
  const [loadingUpsell, setLoadingUpsell] = useState(true)
  const [loadingDutyfree, setLoadingDutyfree] = useState(true)
  const [selectedOffer, setSelectedOffer] = useState<UpsellOffer | null>(null)
  const [paymentOpen, setPaymentOpen] = useState(false)
  const [pendingOfferId, setPendingOfferId] = useState<string | null>(null)
  const [screen, setScreen] = useState<Screen>('catalog')
  const [confirmedOrder, setConfirmedOrder] = useState<OrderResult | null>(null)

  // ----- Fetch helpers -----
  const fetchByType = useCallback(
    async (type: OfferType): Promise<UpsellOffer[]> => {
      const res = await fetch(
        `/api/vip/upsell-offers?type=${type}`,
        { credentials: 'include' },
      )
      const body = await res.json().catch(() => null)
      if (!body || body.ok !== true || !Array.isArray(body.data)) {
        throw new Error(`Impossible de charger les offres (${type})`)
      }
      return body.data as UpsellOffer[]
    },
    [],
  )

  const loadUpsell = useCallback(async () => {
    setLoadingUpsell(true)
    try {
      const list = await fetchByType('upsell')
      setUpsellOffers(list)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erreur réseau'
      toast({ title: 'Chargement impossible', description: msg, variant: 'destructive' })
      setUpsellOffers([])
    } finally {
      setLoadingUpsell(false)
    }
  }, [fetchByType, toast])

  const loadDutyfree = useCallback(async () => {
    setLoadingDutyfree(true)
    try {
      const list = await fetchByType('dutyfree')
      setDutyfreeOffers(list)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erreur réseau'
      toast({ title: 'Chargement impossible', description: msg, variant: 'destructive' })
      setDutyfreeOffers([])
    } finally {
      setLoadingDutyfree(false)
    }
  }, [fetchByType, toast])

  // ----- Effet : chargement initial des deux listes -----
  useEffect(() => {
    void loadUpsell()
    void loadDutyfree()
  }, [loadUpsell, loadDutyfree])

  // ----- Actions -----
  const handleReserve = useCallback((offer: UpsellOffer) => {
    setSelectedOffer(offer)
    setPaymentOpen(true)
  }, [])

  const handleConfirmed = useCallback((order: OrderResult) => {
    setConfirmedOrder(order)
    setSelectedOffer(null)
    setScreen('confirm')
  }, [])

  const handleBackToCatalog = useCallback(() => {
    setConfirmedOrder(null)
    setScreen('catalog')
    // Re-charger pour rafraîchir les stocks éventuels
    void loadUpsell()
    void loadDutyfree()
  }, [loadUpsell, loadDutyfree])

  // ----- Render : écran confirmation -----
  if (screen === 'confirm' && confirmedOrder) {
    return (
      <div className="min-h-screen bg-[#FAFAF7]">
        <ConfirmationView
          order={confirmedOrder}
          onBack={handleBackToCatalog}
        />
      </div>
    )
  }

  // ----- Render : écran catalogue -----
  const currentList =
    activeTab === 'upsell' ? upsellOffers : dutyfreeOffers
  const currentLoading =
    activeTab === 'upsell' ? loadingUpsell : loadingDutyfree

  return (
    <div className="min-h-screen bg-[#FAFAF7] text-[#2C2C2C]">
      {/* ---------- Header ---------- */}
      <header
        className={cn(
          'sticky top-0 z-10 border-b border-[#EAE5DC] bg-white/90 backdrop-blur',
          CARD_SHADOW,
        )}
      >
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
          <button
            type="button"
            onClick={onBack}
            aria-label="Retour"
            className={cn(
              'flex size-9 items-center justify-center rounded-full',
              'border border-[#EAE5DC] bg-white text-[#8B6F47]',
              'transition-colors hover:border-[#C9A961]/50 hover:text-[#2C2C2C]',
            )}
          >
            <ArrowLeft className="size-4" />
          </button>

          <div className="flex min-w-0 flex-1 items-center gap-2">
            <span className="text-xl" aria-hidden>🥂</span>
            <div className="min-w-0">
              <h1
                className="truncate text-lg leading-tight text-[#2C2C2C]"
                style={TITLE_FONT}
              >
                Catalogue d'exception
              </h1>
              <p className="text-xs text-[#8B6F47]">
                Table {tableNumber}
              </p>
            </div>
          </div>

          <span
            className={cn(
              'hidden items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold sm:inline-flex',
              'border-[#EAE5DC] bg-[#FAFAF7] text-[#6B4C9A]',
            )}
          >
            <Crown className="size-3" /> VIP
          </span>
        </div>
      </header>

      {/* ---------- Bannière ---------- */}
      <div className="mx-auto max-w-5xl px-4 pt-6">
        <div
          className={cn(
            'flex items-start gap-3 rounded-xl border border-[#EAE5DC] bg-white p-4',
            CARD_SHADOW,
          )}
        >
          <Sparkles className="mt-0.5 size-5 shrink-0 text-[#C9A961]" />
          <div>
            <div
              className="text-sm font-semibold text-[#2C2C2C]"
              style={TITLE_FONT}
            >
              Bienvenue dans votre sélection personnelle
            </div>
            <p className="mt-1 text-xs leading-relaxed text-[#6b6b6b]">
              Offrez-vous un instant de luxe ou commandez en duty-free
              livré directement à votre place avant embarquement.
            </p>
          </div>
        </div>
      </div>

      {/* ---------- Tabs ---------- */}
      <div className="mx-auto max-w-5xl px-4 pt-5">
        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as OfferType)}
        >
          <TabsList
            className={cn(
              'h-auto w-full gap-1 rounded-xl border border-[#EAE5DC] bg-white p-1',
              CARD_SHADOW,
            )}
          >
            <TabsTrigger
              value="upsell"
              className={cn(
                'flex-1 rounded-lg py-2 text-sm font-semibold transition-colors',
                'data-[state=active]:bg-[#C9A961]/10 data-[state=active]:text-[#2C2C2C]',
                'text-[#8B6F47]',
              )}
            >
              <Crown className="size-4" />
              S'offrir un moment d'exception
            </TabsTrigger>
            <TabsTrigger
              value="dutyfree"
              className={cn(
                'flex-1 rounded-lg py-2 text-sm font-semibold transition-colors',
                'data-[state=active]:bg-[#C9A961]/10 data-[state=active]:text-[#2C2C2C]',
                'text-[#8B6F47]',
              )}
            >
              <Plane className="size-4" />
              Boutique livrée à votre place
            </TabsTrigger>
          </TabsList>

          {/* ---------- Tab 1 : Upsell ---------- */}
          <TabsContent value="upsell" className="mt-5">
            {loadingUpsell ? (
              <LoadingGrid />
            ) : upsellOffers.length === 0 ? (
              <EmptyState
                icon={<Crown className="size-7 text-[#C9A961]" />}
                title="Aucune offre disponible"
                description="Notre catalogue d'expériences est en cours d'enrichissement. Revenez dans quelques minutes."
              />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {upsellOffers.map((offer) => (
                  <OfferCard
                    key={offer.id}
                    offer={offer}
                    onReserve={handleReserve}
                    busy={pendingOfferId === offer.id}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          {/* ---------- Tab 2 : Duty-Free ---------- */}
          <TabsContent value="dutyfree" className="mt-5">
            {!loadingDutyfree && dutyfreeOffers.length > 0 && (
              <div
                className={cn(
                  'mb-4 flex items-center gap-3 rounded-lg border border-[#EAE5DC]',
                  'bg-[#FAFAF7] px-4 py-3 text-sm',
                )}
              >
                <Plane className="size-4 shrink-0 text-[#6B4C9A]" />
                <span className="text-[#6b6b6b]">
                  <span className="font-semibold text-[#2C2C2C]">
                    Livraison à votre place
                  </span>{' '}
                  avant embarquement — réglez maintenant, récupérez sans
                  file.
                </span>
              </div>
            )}

            {loadingDutyfree ? (
              <LoadingGrid />
            ) : dutyfreeOffers.length === 0 ? (
              <EmptyState
                icon={<Gift className="size-7 text-[#C9A961]" />}
                title="Boutique en réassort"
                description="La sélection duty-free est en cours de mise à jour. Notre concierge vous tient informé."
              />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {dutyfreeOffers.map((offer) => (
                  <OfferCard
                    key={offer.id}
                    offer={offer}
                    onReserve={handleReserve}
                    busy={pendingOfferId === offer.id}
                  />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* ---------- Footer ---------- */}
      <footer className="mx-auto max-w-5xl px-4 pb-10 pt-8">
        <div
          className={cn(
            'flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#EAE5DC]',
            'bg-white px-4 py-3 text-xs text-[#6b6b6b]',
            CARD_SHADOW,
          )}
        >
          <div className="flex items-center gap-2">
            <ShoppingBag className="size-4 text-[#C9A961]" />
            Paiement 100% sécurisé · Wave · Orange Money · Espèces
          </div>
          <div className="flex items-center gap-1.5">
            <Check className="size-3 text-[#4A7C59]" />
            Confirmation instantanée à votre table
          </div>
        </div>
      </footer>

      {/* ---------- Payment dialog ---------- */}
      <PaymentDialog
        offer={selectedOffer}
        tableNumber={tableNumber}
        open={paymentOpen}
        onOpenChange={(o) => {
          setPaymentOpen(o)
          if (!o) setSelectedOffer(null)
        }}
        onConfirmed={handleConfirmed}
      />
    </div>
  )
}

// ============================================================
// Sous-composants utilitaires (UI)
// ============================================================

function LoadingGrid() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          className={cn(
            'h-56 animate-pulse rounded-xl border border-[#EAE5DC] bg-white',
            CARD_SHADOW,
          )}
        >
          <div className="flex h-full flex-col p-5">
            <div className="size-10 rounded-full bg-[#EAE5DC]" />
            <div className="mt-4 h-4 w-3/4 rounded bg-[#EAE5DC]" />
            <div className="mt-2 h-3 w-full rounded bg-[#EAE5DC]" />
            <div className="mt-auto flex items-center justify-between">
              <div className="h-6 w-20 rounded bg-[#EAE5DC]" />
              <div className="h-8 w-24 rounded bg-[#EAE5DC]" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function EmptyState({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode
  title: string
  description: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-xl border border-dashed border-[#EAE5DC]',
        'bg-white px-6 py-12 text-center',
        CARD_SHADOW,
      )}
    >
      <div className="flex size-14 items-center justify-center rounded-full bg-[#FAFAF7]">
        {icon}
      </div>
      <h3
        className="mt-4 text-lg text-[#2C2C2C]"
        style={TITLE_FONT}
      >
        {title}
      </h3>
      <p className="mt-2 max-w-md text-sm text-[#6b6b6b]">{description}</p>
    </div>
  )
}

// ============================================================
// Default export
// ============================================================

export default VipUpsellCatalog
