'use client'

// ============================================================
// <VipLoanCatalog /> — Module 6 · Prêt Express
// ------------------------------------------------------------
// Vue CLIENT (après scan QR table). Présente le catalogue des
// objets de prêt (adaptateurs, chargeurs, casques, plaids,
// masques, presse) avec leur stock disponible en temps réel.
//
// Fonctionnalités :
//   • Items regroupés par catégorie (6 catégories).
//   • Badge de stock : "X dispo" (vert) / "X dispo" (ambre si
//     <= seuil) / "Épuisé" (rouge si 0).
//   • Bouton "M'apporter à ma place" par item (désactivé si
//     stock=0).
//   • Au clic → POST /api/vip/loan-items { itemId, tableNumber }
//     qui décrémente atomiquement le stock côté serveur.
//   • Écran de confirmation : "Demande envoyée ✓" + message
//     "Le staff vous apporte {item} à votre Table T-XX".
//   • Polling auto 15s pour rafraîchir le stock (temps réel).
//
// Palette « Luxe Lumineux » :
//   - Background   #FAFAF7    - Cards  #FFFFFF + shadow gold 6%
//   - Gold         #C9A961    - Bronze #8B6F47
//   - Text         #2C2C2C    - Success #4A7C59
//   - Alert        #C97B63    - Border #EAE5DC
//   - Title font   Georgia, "Playfair Display", serif
//
// APIs consommées :
//   GET  /api/vip/loan-items
//        → { ok, data: [{ id, name, category, emoji,
//                          totalStock, availableStock,
//                          lowStockThreshold, active }] }
//   POST /api/vip/loan-items { itemId, tableNumber }
//        → { ok, data: { id, status } }
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft,
  Package,
  Check,
  Loader2,
  RefreshCw,
  Clock,
  Bell,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'

// ============================================================
// Types
// ============================================================

interface LoanItem {
  id: string
  name: string
  category: string
  emoji: string | null
  totalStock: number
  availableStock: number
  lowStockThreshold: number
  active: boolean
}

interface LoanRequestResult {
  id: string
  status: string
}

type Screen = 'catalog' | 'confirm'

interface ConfirmationState {
  item: LoanItem
  requestId: string
}

// ============================================================
// Constantes & helpers
// ============================================================

const TITLE_FONT = {
  fontFamily: 'Georgia, "Playfair Display", serif',
} as const

const CARD_SHADOW = 'shadow-[0_4px_20px_rgba(201,169,97,0.06)]'

const POLL_INTERVAL_MS = 15_000

const CATEGORY_META: Record<string, { label: string; emoji: string }> = {
  adapter: { label: 'Adaptateurs', emoji: '🔌' },
  charger: { label: 'Chargeurs', emoji: '⚡' },
  headphone: { label: 'Casques', emoji: '🎧' },
  blanket: { label: 'Plaid & Confort', emoji: '🧣' },
  mask: { label: 'Masques de sommeil', emoji: '😴' },
  press: { label: 'Presse', emoji: '📰' },
}

// Ordre canonique d'affichage des catégories.
const CATEGORY_ORDER: string[] = [
  'adapter',
  'charger',
  'headphone',
  'blanket',
  'mask',
  'press',
]

/** Renvoie le libellé + emoji d'une catégorie (avec fallback sûr). */
function categoryMeta(category: string): { label: string; emoji: string } {
  return (
    CATEGORY_META[category] ?? {
      label: category.charAt(0).toUpperCase() + category.slice(1),
      emoji: '📦',
    }
  )
}

/**
 * Badge de stock :
 *   - available === 0     → "Épuisé" (rouge)
 *   - available <= seuil  → "X dispo" (ambre)
 *   - sinon               → "X dispo" (vert)
 */
function stockBadge(
  available: number,
  threshold: number,
): { text: string; class: string } {
  if (available === 0)
    return { text: 'Épuisé', class: 'bg-red-100 text-red-700' }
  if (available <= threshold)
    return {
      text: `${available} dispo`,
      class: 'bg-amber-100 text-amber-800',
    }
  return {
    text: `${available} dispo`,
    class: 'bg-emerald-100 text-emerald-700',
  }
}

/**
 * Formate un libellé de table robuste :
 *   - "T-12"  → "Table T-12"
 *   - "12"    → "Table T-12"
 *   - "table 12" → "Table T-12"
 */
function formatTableLabel(tableNumber: string): string {
  const raw = (tableNumber ?? '').trim()
  if (!raw) return 'Table'
  // QR_ROUTING — emplacement libre déclaré via le QR d'entrée
  // ("Zone Buffet", "Fauteuil 12", "Salon VIP") → affiché tel quel,
  // SANS préfixe « Table » ni normalisation "T-xx".
  if (!/^t[-\s]?\d+/i.test(raw) && !/^table\b/i.test(raw) && !/^\d+$/.test(raw)) {
    return raw
  }
  // Si déjà préfixé "T-" ou "Table", on normalise.
  const digits = raw.replace(/[^0-9A-Za-z]/g, '').toUpperCase()
  if (/^T\d+$/i.test(digits)) return `Table ${digits}`
  // Sinon on préfixe "T-".
  return `Table T-${raw.replace(/^T-?/i, '').trim()}`
}

/** Formate "X min" en gérant singulier/pluriel. */
function fmtMinutes(min: number): string {
  if (min <= 0) return "à l'instant"
  if (min === 1) return '1 min'
  return `${min} min`
}

/** Construit un n° de suivi affichable : PRET-<shortId>. */
function buildTrackingNumber(requestId: string): string {
  const short = (requestId || '').slice(-6).toUpperCase() || 'XXXXXX'
  return `PRET-${short}`
}

// ============================================================
// Sous-composant : ItemCard
// ============================================================

interface ItemCardProps {
  item: LoanItem
  tableLabel: string
  busy: boolean
  onRequest: (item: LoanItem) => void
}

function ItemCard({ item, tableLabel, busy, onRequest }: ItemCardProps) {
  const badge = stockBadge(item.availableStock, item.lowStockThreshold)
  const exhausted = item.availableStock === 0
  const emoji = item.emoji || '📦'

  return (
    <article
      className={cn(
        'flex flex-col rounded-xl border bg-white p-5 transition-all',
        'border-[#EAE5DC]',
        exhausted
          ? 'opacity-80'
          : 'hover:border-[#C9A961]/40 hover:shadow-[0_8px_28px_rgba(201,169,97,0.10)]',
        CARD_SHADOW,
      )}
    >
      {/* Emoji + nom + badge */}
      <div className="flex items-start gap-3">
        <div
          className={cn(
            'flex size-12 shrink-0 items-center justify-center rounded-full',
            'bg-[#FAFAF7] ring-2 ring-[#EAE5DC]',
            exhausted && 'grayscale',
          )}
          aria-hidden
        >
          <span className="text-2xl leading-none">{emoji}</span>
        </div>
        <div className="min-w-0 flex-1">
          <h3
            className="truncate text-base leading-snug text-[#2C2C2C]"
            style={TITLE_FONT}
          >
            {item.name}
          </h3>
          <div className="mt-1.5 flex items-center gap-2">
            <span
              className={cn(
                'inline-flex items-center rounded-full px-2 py-0.5',
                'text-[11px] font-semibold',
                badge.class,
              )}
            >
              {badge.text}
            </span>
            {item.totalStock > 0 && (
              <span className="text-[11px] text-[#8B6F47]">
                / {item.totalStock} au total
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Bouton d'action */}
      <Button
        type="button"
        disabled={exhausted || busy}
        onClick={() => onRequest(item)}
        aria-label={`Demander ${item.name} à ma place`}
        className={cn(
          'mt-4 h-10 w-full rounded-md text-sm font-semibold uppercase tracking-wide',
          exhausted
            ? 'bg-[#EAE5DC] text-[#8B6F47]'
            : 'bg-[#C9A961] text-white hover:bg-[#B8974A] active:bg-[#A6863C]',
          'shadow-sm transition-colors',
        )}
      >
        {busy ? (
          <>
            <Loader2 className="size-4 animate-spin" /> Envoi…
          </>
        ) : exhausted ? (
          'Indisponible'
        ) : (
          <>
            <Bell className="size-4" /> M&rsquo;apporter à ma place
          </>
        )}
      </Button>

      {/* Hint discret */}
      {!exhausted && (
        <p className="mt-2 text-center text-[11px] text-[#8B6F47]">
          Livraison à {tableLabel}
        </p>
      )}
    </article>
  )
}

// ============================================================
// Sous-composant : ConfirmationView
// ============================================================

interface ConfirmationViewProps {
  state: ConfirmationState
  tableLabel: string
  onAnotherRequest: () => void
  onBack: () => void
}

function ConfirmationView({
  state,
  tableLabel,
  onAnotherRequest,
  onBack,
}: ConfirmationViewProps) {
  const { item } = state
  const emoji = item.emoji || '📦'
  const tracking = buildTrackingNumber(state.requestId)

  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 py-10 text-center">
      {/* Cercle de confirmation */}
      <div
        className={cn(
          'flex size-20 items-center justify-center rounded-full',
          'bg-[#4A7C59]/10 ring-4 ring-[#4A7C59]/15',
        )}
      >
        <Check className="size-10 text-[#4A7C59]" strokeWidth={3} />
      </div>

      {/* Titre */}
      <h2
        className="mt-6 text-2xl text-[#2C2C2C]"
        style={TITLE_FONT}
      >
        Demande envoyée <span aria-hidden>✓</span>
      </h2>

      {/* Message principal */}
      <p className="mt-3 text-sm leading-relaxed text-[#6b6b6b]">
        Le staff vous apporte{' '}
        <span className="font-semibold text-[#2C2C2C]">
          <span aria-hidden>{emoji} </span>
          {item.name}
        </span>{' '}
        à votre{' '}
        <span className="font-semibold text-[#2C2C2C]">{tableLabel}</span>.
      </p>

      <p className="mt-2 text-sm text-[#8B6F47]">Nous arrivons dans un instant.</p>

      {/* Carte récapitulative */}
      <div
        className={cn(
          'mt-6 w-full rounded-xl border border-[#EAE5DC] bg-white p-5 text-left',
          CARD_SHADOW,
        )}
      >
        <div className="flex items-center gap-3">
          <div
            className={cn(
              'flex size-11 shrink-0 items-center justify-center rounded-full',
              'bg-[#FAFAF7] ring-2 ring-[#C9A961]/30',
            )}
            aria-hidden
          >
            <span className="text-2xl leading-none">{emoji}</span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] uppercase tracking-wide text-[#8B6F47]">
              Objet demandé
            </div>
            <div
              className="truncate text-base font-semibold text-[#2C2C2C]"
              style={TITLE_FONT}
            >
              {item.name}
            </div>
          </div>
        </div>

        <div className="my-4 h-px bg-[#EAE5DC]" />

        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-wide text-[#8B6F47]">
              N° de suivi
            </div>
            <div
              className="mt-1 text-sm font-bold tracking-wider text-[#C9A961]"
              style={TITLE_FONT}
            >
              #{tracking}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-[#8B6F47]">
              Livraison
            </div>
            <div className="mt-1 text-sm font-semibold text-[#2C2C2C]">
              {tableLabel}
            </div>
          </div>
        </div>
      </div>

      {/* Note d'info */}
      <div
        className={cn(
          'mt-4 flex items-start gap-2 rounded-lg border border-[#EAE5DC]',
          'bg-[#FAFAF7] px-4 py-3 text-left text-xs text-[#6b6b6b]',
        )}
      >
        <Bell className="mt-0.5 size-4 shrink-0 text-[#C9A961]" />
        <span>
          Conservez votre n° de suivi. Le staff confirmera la remise en main
          propre à votre arrivée à la table.
        </span>
      </div>

      {/* Actions */}
      <div className="mt-6 flex w-full gap-2">
        <Button
          type="button"
          variant="ghost"
          onClick={onAnotherRequest}
          className={cn(
            'flex-1 rounded-md border border-[#EAE5DC] bg-white text-[#8B6F47]',
            'hover:bg-[#FAFAF7] hover:text-[#2C2C2C]',
          )}
        >
          <Package className="size-4" /> Autre demande
        </Button>
        <Button
          type="button"
          onClick={onBack}
          className={cn(
            'flex-1 rounded-md bg-[#C9A961] px-6 text-sm font-semibold text-white',
            'hover:bg-[#B8974A] active:bg-[#A6863C]',
          )}
        >
          <ArrowLeft className="size-4" /> Retour à la table
        </Button>
      </div>
    </div>
  )
}

// ============================================================
// Sous-composant : ItemGridSkeleton
// ============================================================

function ItemGridSkeleton() {
  return (
    <div className="space-y-8">
      {Array.from({ length: 2 }).map((_, g) => (
        <section key={g}>
          <div className="mb-3 h-5 w-40 animate-pulse rounded bg-[#EAE5DC]" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className={cn(
                  'h-40 animate-pulse rounded-xl border border-[#EAE5DC] bg-white',
                  CARD_SHADOW,
                )}
              >
                <div className="flex h-full flex-col p-5">
                  <div className="flex items-center gap-3">
                    <div className="size-12 rounded-full bg-[#EAE5DC]" />
                    <div className="flex-1">
                      <div className="h-4 w-3/4 rounded bg-[#EAE5DC]" />
                      <div className="mt-2 h-4 w-16 rounded-full bg-[#EAE5DC]" />
                    </div>
                  </div>
                  <div className="mt-auto h-9 w-full rounded bg-[#EAE5DC]" />
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

// ============================================================
// Composant principal
// ============================================================

export function VipLoanCatalog({
  tableNumber,
  onBack,
}: {
  tableNumber: string
  onBack: () => void
}) {
  const { toast } = useToast()

  // ----- State -----
  const [items, setItems] = useState<LoanItem[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null)
  const [busyItemId, setBusyItemId] = useState<string | null>(null)
  const [screen, setScreen] = useState<Screen>('catalog')
  const [confirmation, setConfirmation] = useState<ConfirmationState | null>(
    null,
  )

  // ----- Refs -----
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const mountedRef = useRef(true)

  // ----- Libellé table -----
  const tableLabel = useMemo(
    () => formatTableLabel(tableNumber),
    [tableNumber],
  )

  // ----- Fetcher -----
  const fetchItems = useCallback(async (): Promise<LoanItem[]> => {
    const res = await fetch('/api/vip/loan-items', {
      credentials: 'include',
    })
    const body = await res.json().catch(() => null)
    if (!body || body.ok !== true || !Array.isArray(body.data)) {
      throw new Error('Catalogue indisponible')
    }
    return body.data as LoanItem[]
  }, [])

  const refresh = useCallback(
    async (opts?: { silent?: boolean }) => {
      const silent = opts?.silent ?? false
      if (!silent) setRefreshing(true)
      try {
        const list = await fetchItems()
        if (!mountedRef.current) return
        setItems(list)
        setLastSyncAt(Date.now())
      } catch (err) {
        if (silent) return
        const msg = err instanceof Error ? err.message : 'Erreur réseau'
        toast({
          title: 'Synchronisation impossible',
          description: msg,
          variant: 'destructive',
        })
      } finally {
        if (mountedRef.current) {
          if (!silent) setRefreshing(false)
          setLoading(false)
        }
      }
    },
    [fetchItems, toast],
  )

  // ----- Effet de montage + polling -----
  useEffect(() => {
    mountedRef.current = true
    void refresh({ silent: false })
    pollRef.current = setInterval(() => {
      void refresh({ silent: true })
    }, POLL_INTERVAL_MS)
    return () => {
      mountedRef.current = false
      if (pollRef.current) clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [refresh])

  // ----- Items regroupés par catégorie (ordre canonique) -----
  const grouped = useMemo(() => {
    const map = new Map<string, LoanItem[]>()
    for (const it of items) {
      const arr = map.get(it.category) ?? []
      arr.push(it)
      map.set(it.category, arr)
    }
    // Pour chaque catégorie, on garde l'ordre renvoyé par l'API
    // (déjà trié par name asc côté serveur).
    return CATEGORY_ORDER.filter((c) => map.has(c)).map((category) => ({
      category,
      meta: categoryMeta(category),
      items: map.get(category) ?? [],
    }))
  }, [items])

  // ----- Statistiques globales -----
  const stats = useMemo(() => {
    const totalItems = items.length
    const exhausted = items.filter((i) => i.availableStock === 0).length
    const available = items.filter((i) => i.availableStock > 0).length
    const totalAvailableStock = items.reduce(
      (sum, i) => sum + Math.max(0, i.availableStock),
      0,
    )
    return { totalItems, exhausted, available, totalAvailableStock }
  }, [items])

  // ----- Action : demander un item -----
  const handleRequest = useCallback(
    async (item: LoanItem) => {
      if (item.availableStock === 0) return
      setBusyItemId(item.id)
      try {
        const res = await fetch('/api/vip/loan-items', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ itemId: item.id, tableNumber }),
        })
        const body = await res.json().catch(() => null)
        if (!body || body.ok !== true || !body.data) {
          throw new Error(body?.error || 'Demande refusée')
        }
        const data = body.data as LoanRequestResult
        if (!mountedRef.current) return

        // Mise à jour optimistic + refresh silencieux pour rester cohérent.
        setItems((prev) =>
          prev.map((it) =>
            it.id === item.id
              ? {
                  ...it,
                  availableStock: Math.max(0, it.availableStock - 1),
                }
              : it,
          ),
        )

        setConfirmation({ item, requestId: data.id })
        setScreen('confirm')
        toast({
          title: 'Demande envoyée',
          description: `${item.name} · ${tableLabel}`,
        })
        // Re-synchronisation discrète pour récupérer la vérité serveur.
        void refresh({ silent: true })
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Erreur réseau'
        toast({
          title: 'Demande impossible',
          description: msg,
          variant: 'destructive',
        })
      } finally {
        if (mountedRef.current) setBusyItemId(null)
      }
    },
    [refresh, tableNumber, tableLabel, toast],
  )

  // ----- Action : autre demande (retour au catalogue) -----
  const handleAnotherRequest = useCallback(() => {
    setConfirmation(null)
    setScreen('catalog')
    void refresh({ silent: false })
  }, [refresh])

  // ----- Action : retour à la table -----
  const handleBackToTable = useCallback(() => {
    onBack()
  }, [onBack])

  // ----- Render : écran confirmation -----
  if (screen === 'confirm' && confirmation) {
    return (
      <div className="min-h-screen bg-[#FAFAF7]">
        <ConfirmationView
          state={confirmation}
          tableLabel={tableLabel}
          onAnotherRequest={handleAnotherRequest}
          onBack={handleBackToTable}
        />
      </div>
    )
  }

  // ----- Render : écran catalogue -----
  return (
    <div className="min-h-screen bg-[#FAFAF7] text-[#2C2C2C]">
      {/* ---------- Header ---------- */}
      <header
        className={cn(
          'sticky top-0 z-10 border-b border-[#EAE5DC] bg-white/90 backdrop-blur',
          CARD_SHADOW,
        )}
      >
        <div className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-3">
          <Button
            type="button"
            variant="ghost"
            onClick={onBack}
            aria-label="Retour"
            className={cn(
              'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm',
              'border border-[#EAE5DC] bg-white text-[#8B6F47]',
              'transition-colors hover:border-[#C9A961]/50 hover:text-[#2C2C2C]',
            )}
          >
            <ArrowLeft className="size-4" /> Retour
          </Button>

          <div className="flex min-w-0 flex-1 items-center gap-2">
            <span className="text-xl" aria-hidden>
              📦
            </span>
            <div className="min-w-0">
              <h1
                className="truncate text-lg leading-tight text-[#2C2C2C]"
                style={TITLE_FONT}
              >
                Prêt Express
              </h1>
              <p className="truncate text-xs text-[#8B6F47]">
                {tableLabel} · Disponibilité en temps réel
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void refresh({ silent: false })}
            disabled={refreshing || loading}
            aria-label="Rafraîchir le stock"
            className={cn(
              'flex size-9 items-center justify-center rounded-full',
              'border border-[#EAE5DC] bg-white text-[#8B6F47]',
              'transition-colors hover:border-[#C9A961]/50 hover:text-[#2C2C2C]',
              'disabled:opacity-50',
            )}
          >
            <RefreshCw
              className={cn('size-4', refreshing && 'animate-spin')}
            />
          </button>
        </div>
      </header>

      {/* ---------- Contenu ---------- */}
      <div className="mx-auto max-w-4xl px-4 py-6">
        {/* Bandeau résumé */}
        {!loading && stats.totalItems > 0 && (
          <div
            className={cn(
              'mb-5 flex items-center gap-4 rounded-xl border border-[#EAE5DC]',
              'bg-white p-4 text-sm',
              CARD_SHADOW,
            )}
          >
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#C9A961]/10">
              <Package className="size-5 text-[#C9A961]" />
            </div>
            <div className="flex-1">
              <div
                className="font-semibold text-[#2C2C2C]"
                style={TITLE_FONT}
              >
                {stats.totalAvailableStock > 0
                  ? `${stats.totalAvailableStock} objet${stats.totalAvailableStock > 1 ? 's' : ''} disponible${stats.totalAvailableStock > 1 ? 's' : ''}`
                  : 'Tous les objets sont épuisés'}
              </div>
              <p className="mt-0.5 text-xs text-[#6b6b6b]">
                {stats.available}/{stats.totalItems} références en stock
                {stats.exhausted > 0 &&
                  ` · ${stats.exhausted} épuisé${stats.exhausted > 1 ? 's' : ''}`}
              </p>
            </div>
            <Badge
              variant="outline"
              className={cn(
                'border-[#EAE5DC] text-[11px] font-semibold text-[#8B6F47]',
              )}
            >
              Temps réel
            </Badge>
          </div>
        )}

        {/* Grille par catégorie */}
        {loading ? (
          <ItemGridSkeleton />
        ) : grouped.length === 0 ? (
          <EmptyState onRetry={() => void refresh({ silent: false })} />
        ) : (
          <div className="space-y-8">
            {grouped.map(({ category, meta, items: catItems }) => (
              <section key={category} aria-label={meta.label}>
                {/* Titre de catégorie */}
                <div className="mb-3 flex items-center gap-2">
                  <span className="text-xl" aria-hidden>
                    {meta.emoji}
                  </span>
                  <h2
                    className="text-lg leading-tight text-[#2C2C2C]"
                    style={TITLE_FONT}
                  >
                    {meta.label}
                  </h2>
                  <span className="ml-1 text-[11px] uppercase tracking-wide text-[#8B6F47]">
                    ({catItems.length})
                  </span>
                </div>

                {/* Cartes */}
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {catItems.map((item) => (
                    <ItemCard
                      key={item.id}
                      item={item}
                      tableLabel={tableLabel}
                      busy={busyItemId === item.id}
                      onRequest={handleRequest}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}

        {/* Sync footer */}
        {!loading && items.length > 0 && (
          <div className="mt-8 flex items-center justify-center gap-2 text-[11px] text-[#8B6F47]">
            <Clock className="size-3" />
            {lastSyncAt
              ? `Synchronisé ${fmtMinutes(
                  Math.floor((Date.now() - lastSyncAt) / 60_000),
                )} · MAJ auto toutes les ${POLL_INTERVAL_MS / 1000}s`
              : 'Synchronisation en cours…'}
          </div>
        )}
      </div>
    </div>
  )
}

// ============================================================
// Sous-composant : EmptyState
// ============================================================

function EmptyState({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      className={cn(
        'flex flex-col items-center rounded-xl border border-[#EAE5DC]',
        'bg-white px-6 py-12 text-center',
        CARD_SHADOW,
      )}
    >
      <div className="flex size-14 items-center justify-center rounded-full bg-[#FAFAF7] ring-2 ring-[#EAE5DC]">
        <Package className="size-7 text-[#8B6F47]" />
      </div>
      <h3
        className="mt-4 text-lg text-[#2C2C2C]"
        style={TITLE_FONT}
      >
        Catalogue vide
      </h3>
      <p className="mt-1 max-w-sm text-sm text-[#6b6b6b]">
        Aucun objet de prêt n&rsquo;est actuellement publié. Le staff ajoute
        les références depuis le back-office VIP.
      </p>
      <Button
        type="button"
        variant="ghost"
        onClick={onRetry}
        className={cn(
          'mt-4 rounded-md border border-[#EAE5DC] bg-white text-[#8B6F47]',
          'hover:bg-[#FAFAF7] hover:text-[#2C2C2C]',
        )}
      >
        <RefreshCw className="size-4" /> Réessayer
      </Button>
    </div>
  )
}

// ============================================================
// Default export
// ============================================================

export default VipLoanCatalog
