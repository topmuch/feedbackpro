'use client'

// ============================================================
// <VipShowerReservation /> — Module 4 · Smart Shower Queue
// ------------------------------------------------------------
// Vue CLIENT (après scan QR table). Permet de réserver une
// douche VIP ou de rejoindre la file d'attente intelligente.
//
// Fonctionnalités :
//   • Grille 4 cabines (D-01 à D-04) avec statut temps réel
//     (Libre / Occupée / Nettoyage).
//   • Pour chaque cabine occupée : file d'attente + ETA.
//   • Bouton "RÉSERVER" sur cabine libre (réservation directe).
//   • Bouton "RÉSERVER MA DOUCHE" (rejoint la file la plus courte).
//   • Écran de confirmation avec n° de suivi + ETA personnel.
//
// Palette « Luxe Lumineux » :
//   - Background   #FAFAF7    - Cards  #FFFFFF + shadow gold 6%
//   - Gold         #C9A961    - Bronze #8B6F47
//   - Text         #2C2C2C    - VIP    #6B4C9A
//   - Success      #4A7C59    - Alert  #C97B63
//   - Border       #EAE5DC
//
// APIs consommées :
//   GET  /api/vip/shower-reservations          → liste réservations
//   GET  /api/vip/showers                      → statuts cabines (best-effort)
//   POST /api/vip/shower-reservations          → création réservation
//        Body   : { showerNumber, tableNumber }
//        Réponse: { reservation, etaMinutes, queuePosition }
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft,
  ShowerHead,
  Clock,
  Check,
  Loader2,
  Users,
  RefreshCw,
  Bell,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'

// ============================================================
// Types
// ============================================================

interface ShowerReservation {
  id: string
  showerNumber: number
  tableNumber: string | null
  clientName: string | null
  status:
    | 'queued'
    | 'ready'
    | 'using'
    | 'done'
    | 'cancelled'
  reservedAt: string
  readyAt: string | null
  expiresAt: string | null
  createdAt: string
  updatedAt: string
}

interface ShowerStatusRow {
  id: string
  showerNumber: number
  status: 'free' | 'occupied' | 'cleaning'
  occupiedSince: string | null
  updatedAt: string
}

type DerivedStatus = 'free' | 'occupied' | 'cleaning'

interface ShowerView {
  showerNumber: number
  label: string // "D-01"
  status: DerivedStatus
  queueCount: number // queued ahead
  etaMin: number // minutes estimées avant libération
  occupiedSince: string | null
  lastUpdatedAt: string | null
}

interface ReserveResult {
  reservation: {
    id: string
    showerNumber: number
    tableNumber: string | null
    status: string
  }
  etaMinutes: number
  queuePosition: number
}

type Screen = 'main' | 'confirm'

interface ConfirmationState {
  showerNumber: number
  etaMin: number
  queuePosition: number
  reservationId: string
  trackingNumber: string
}

// ============================================================
// Constantes & helpers
// ============================================================

const TITLE_FONT = {
  fontFamily: 'Georgia, "Playfair Display", serif',
} as const

const CARD_SHADOW = 'shadow-[0_4px_20px_rgba(201,169,97,0.06)]'

const SHOWER_COUNT = 4
const USAGE_MIN = 20
const CLEANING_MIN = 10
const SLOT_MIN = USAGE_MIN + CLEANING_MIN // 30 min par créneau
const POLL_INTERVAL_MS = 15_000

const ACTIVE_RESERVATION_STATUSES = new Set(['queued', 'ready', 'using'])

const STATUS_META: Record<
  DerivedStatus,
  { label: string; emoji: string; badgeClass: string; ringClass: string }
> = {
  free: {
    label: 'Libre',
    emoji: '🟢',
    badgeClass:
      'bg-emerald-50 text-emerald-700 border-emerald-200',
    ringClass: 'ring-emerald-200/60',
  },
  occupied: {
    label: 'Occupée',
    emoji: '🟠',
    badgeClass:
      'bg-amber-50 text-amber-700 border-amber-200',
    ringClass: 'ring-amber-200/60',
  },
  cleaning: {
    label: 'Nettoyage',
    emoji: '🔵',
    badgeClass: 'bg-sky-50 text-sky-700 border-sky-200',
    ringClass: 'ring-sky-200/60',
  },
}

/** Label formaté "D-01" pour un showerNumber 1..4. */
function showerLabel(n: number): string {
  return `D-${String(n).padStart(2, '0')}`
}

/** Écart en minutes entre maintenant et une date ISO. */
function minutesSince(iso: string | null): number {
  if (!iso) return 0
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return 0
  return Math.max(0, Math.floor((Date.now() - t) / 60_000))
}

/** Formate "X min" en gérant le singulier/pluriel. */
function fmtMinutes(min: number): string {
  if (min <= 0) return "à l'instant"
  if (min === 1) return '1 min'
  return `${min} min`
}

/**
 * Construit la liste des ShowerView à partir :
 *   • des ShowerStatus (si l'API est dispo / auth)
 *   • des réservations actives (fallback + source de la file)
 *
 * Logique de fallback (quand /api/vip/showers est 401) :
 *   - aucune réservation active pour ce shower → "free"
 *   - réservation "using" / "ready" → "occupied"
 *   - réservation "queued" seule → "occupied" (la cabine est
 *     déjà en train de servir quelqu'un d'autre ou en file)
 */
function buildShowerViews(
  showers: ShowerStatusRow[] | null,
  reservations: ShowerReservation[],
): ShowerView[] {
  // Index des réservations actives par showerNumber
  const activeByShower = new Map<number, ShowerReservation[]>()
  for (const r of reservations) {
    if (!ACTIVE_RESERVATION_STATUSES.has(r.status)) continue
    const arr = activeByShower.get(r.showerNumber) ?? []
    arr.push(r)
    activeByShower.set(r.showerNumber, arr)
  }

  const showersMap = new Map<number, ShowerStatusRow>()
  if (showers) {
    for (const s of showers) showersMap.set(s.showerNumber, s)
  }

  const views: ShowerView[] = []
  for (let i = 1; i <= SHOWER_COUNT; i++) {
    const row = showersMap.get(i) ?? null
    const active = (activeByShower.get(i) ?? []).sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    )

    let status: DerivedStatus
    if (row) {
      status = row.status
    } else {
      // Fallback : on dérive depuis les réservations
      const hasUsingOrReady = active.some(
        (r) => r.status === 'using' || r.status === 'ready',
      )
      status = active.length > 0 || hasUsingOrReady ? 'occupied' : 'free'
    }

    // Queue = nombre de réservations "queued" (en attente)
    const queueCount = active.filter((r) => r.status === 'queued').length
    // ETA = nombre de gens devant * SLOT_MIN (incluant l'usage courant)
    const slotsAhead = Math.max(0, active.length)
    const etaMin = status === 'free' ? 0 : slotsAhead * SLOT_MIN

    const occupiedSince =
      row?.occupiedSince ??
      (active.length > 0 ? active[0].reservedAt : null)

    views.push({
      showerNumber: i,
      label: showerLabel(i),
      status,
      queueCount,
      etaMin,
      occupiedSince,
      lastUpdatedAt: row?.updatedAt ?? null,
    })
  }
  return views
}

/** Choisit la cabine avec la file la plus courte (ou libre). */
function pickBestShower(views: ShowerView[]): ShowerView | null {
  if (views.length === 0) return null
  const free = views.find((v) => v.status === 'free')
  if (free) return free
  // Sinon : occupée avec la plus petite ETA
  return views.reduce((best, cur) =>
    cur.etaMin < best.etaMin ? cur : best,
  )
}

// ============================================================
// Sous-composant : ShowerCard
// ============================================================

interface ShowerCardProps {
  view: ShowerView
  onReserve: (showerNumber: number) => void
  busy?: boolean
}

function ShowerCard({ view, onReserve, busy }: ShowerCardProps) {
  const meta = STATUS_META[view.status]
  const elapsedMin = minutesSince(view.occupiedSince)

  return (
    <article
      className={cn(
        'relative flex flex-col rounded-xl border bg-white p-5 transition-all',
        'border-[#EAE5DC]',
        view.status === 'free'
          ? 'hover:border-[#4A7C59]/40 hover:shadow-[0_8px_28px_rgba(74,124,89,0.10)]'
          : 'hover:border-[#C9A961]/30',
        CARD_SHADOW,
      )}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              'flex size-11 items-center justify-center rounded-full',
              'bg-[#FAFAF7] ring-2',
              meta.ringClass,
            )}
          >
            <ShowerHead className="size-5 text-[#8B6F47]" />
          </div>
          <div>
            <div
              className="text-lg leading-none text-[#2C2C2C]"
              style={TITLE_FONT}
            >
              {view.label}
            </div>
            <div className="mt-1 text-[11px] uppercase tracking-wide text-[#8B6F47]">
              Cabine {view.showerNumber}
            </div>
          </div>
        </div>
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-full border px-2 py-0.5',
            'text-[11px] font-semibold',
            meta.badgeClass,
          )}
        >
          <span aria-hidden>{meta.emoji}</span>
          {meta.label}
        </span>
      </div>

      {/* Détail selon le statut */}
      <div className="mt-4 flex-1 text-sm">
        {view.status === 'free' ? (
          <p className="text-[#4A7C59]">
            Cabine disponible immédiatement.
          </p>
        ) : view.status === 'cleaning' ? (
          <div className="space-y-1">
            <p className="text-[#6b6b6b]">En cours de nettoyage.</p>
            <p className="inline-flex items-center gap-1 text-xs text-[#8B6F47]">
              <Clock className="size-3" /> Fin prévue ≈ {fmtMinutes(CLEANING_MIN)}
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            <p className="inline-flex items-center gap-1 text-[#6b6b6b]">
              <Clock className="size-3 text-[#C97B63]" /> Occupée depuis{' '}
              {fmtMinutes(elapsedMin)}
            </p>
            {view.queueCount > 0 && (
              <p className="inline-flex items-center gap-1 text-xs text-[#8B6F47]">
                <Users className="size-3" /> {view.queueCount}{' '}
                {view.queueCount === 1 ? 'personne' : 'personnes'} en file
              </p>
            )}
            <p className="inline-flex items-center gap-1 text-xs text-[#8B6F47]">
              <Clock className="size-3" /> Libre dans ≈ {fmtMinutes(view.etaMin)}
            </p>
          </div>
        )}
      </div>

      {/* Bouton d'action si libre */}
      {view.status === 'free' && (
        <Button
          type="button"
          disabled={busy}
          onClick={() => onReserve(view.showerNumber)}
          className={cn(
            'mt-4 h-10 rounded-md px-4 text-sm font-bold uppercase tracking-wide',
            'bg-[#4A7C59] text-white hover:bg-[#3D6A4B] active:bg-[#34593F]',
            'shadow-sm transition-colors',
          )}
        >
          {busy ? (
            <>
              <Loader2 className="size-4 animate-spin" /> Réservation…
            </>
          ) : (
            <>
              <Check className="size-4" /> Réserver
            </>
          )}
        </Button>
      )}
    </article>
  )
}

// ============================================================
// Sous-composant : ConfirmationView
// ============================================================

interface ConfirmationViewProps {
  state: ConfirmationState
  onBack: () => void
  onReserveAnother: () => void
}

function ConfirmationView({
  state,
  onBack,
  onReserveAnother,
}: ConfirmationViewProps) {
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
        Douche réservée
      </h2>
      <p className="mt-2 text-sm text-[#6b6b6b]">
        Votre douche{' '}
        <span className="font-semibold text-[#2C2C2C]">
          {showerLabel(state.showerNumber)}
        </span>{' '}
        sera prête dans ≈ {fmtMinutes(state.etaMin)}.
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
            #{state.trackingNumber}
          </span>
        </div>
        <div className="my-3 h-px bg-[#EAE5DC]" />
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <div className="text-[10px] uppercase tracking-wide text-[#8B6F47]">
              Cabine
            </div>
            <div className="text-sm font-semibold text-[#2C2C2C]">
              {showerLabel(state.showerNumber)}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-[#8B6F47]">
              Position file
            </div>
            <div className="text-sm font-semibold text-[#2C2C2C]">
              #{state.queuePosition}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-[#8B6F47]">
              ETA
            </div>
            <div className="text-sm font-semibold text-[#2C2C2C]">
              {fmtMinutes(state.etaMin)}
            </div>
          </div>
        </div>
      </div>

      <div
        className={cn(
          'mt-4 flex items-start gap-2 rounded-lg border border-[#EAE5DC]',
          'bg-[#FAFAF7] px-4 py-3 text-left text-xs text-[#6b6b6b]',
        )}
      >
        <Bell className="mt-0.5 size-4 shrink-0 text-[#C9A961]" />
        <span>
          Nous vous notifierons à votre table{' '}
          <span className="font-semibold text-[#2C2C2C]">
            {showerLabel(state.showerNumber)}
          </span>{' '}
          dès qu'elle sera prête. Conservez votre n° de suivi.
        </span>
      </div>

      <div className="mt-6 flex w-full gap-2">
        <Button
          variant="ghost"
          onClick={onReserveAnother}
          className={cn(
            'flex-1 rounded-md border border-[#EAE5DC] bg-white text-[#8B6F47]',
            'hover:bg-[#FAFAF7] hover:text-[#2C2C2C]',
          )}
        >
          <ShowerHead className="size-4" /> Réserver une autre cabine
        </Button>
        <Button
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
// Composant principal
// ============================================================

export function VipShowerReservation({
  tableNumber,
  onBack,
}: {
  tableNumber: string
  onBack: () => void
}) {
  const { toast } = useToast()

  // ----- State -----
  const [reservations, setReservations] = useState<ShowerReservation[]>([])
  const [showers, setShowers] = useState<ShowerStatusRow[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null)
  const [busyShower, setBusyShower] = useState<number | null>(null)
  const [busyQueue, setBusyQueue] = useState(false)
  const [screen, setScreen] = useState<Screen>('main')
  const [confirmation, setConfirmation] = useState<ConfirmationState | null>(
    null,
  )

  // ----- Refs -----
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const mountedRef = useRef(true)

  // ----- Fetchers -----
  const fetchReservations = useCallback(async (): Promise<ShowerReservation[]> => {
    const res = await fetch('/api/vip/shower-reservations', {
      credentials: 'include',
    })
    const body = await res.json().catch(() => null)
    if (!body || body.ok !== true || !Array.isArray(body.data)) {
      throw new Error('Réservations indisponibles')
    }
    return body.data as ShowerReservation[]
  }, [])

  const fetchShowers = useCallback(async (): Promise<ShowerStatusRow[] | null> => {
    // Best-effort : l'API peut renvoyer 401 côté client non authentifié.
    try {
      const res = await fetch('/api/vip/showers', { credentials: 'include' })
      if (!res.ok) return null
      const body = await res.json().catch(() => null)
      if (!body || body.ok !== true || !Array.isArray(body.data)) return null
      return body.data as ShowerStatusRow[]
    } catch {
      return null
    }
  }, [])

  const refresh = useCallback(
    async (opts?: { silent?: boolean }) => {
      const silent = opts?.silent ?? false
      if (!silent) setRefreshing(true)
      try {
        const [reservList, showerList] = await Promise.all([
          fetchReservations(),
          fetchShowers(),
        ])
        if (!mountedRef.current) return
        setReservations(reservList)
        setShowers(showerList)
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
        if (!silent) setRefreshing(false)
        if (mountedRef.current) setLoading(false)
      }
    },
    [fetchReservations, fetchShowers, toast],
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

  // ----- Derived data -----
  const views = useMemo(
    () => buildShowerViews(showers, reservations),
    [showers, reservations],
  )

  const freeCount = useMemo(
    () => views.filter((v) => v.status === 'free').length,
    [views],
  )

  const bestShower = useMemo(() => pickBestShower(views), [views])

  const globalQueueAhead = useMemo(() => {
    // Total des "queued" sur toutes les cabines (file d'attente globale)
    return reservations.filter((r) => r.status === 'queued').length
  }, [reservations])

  const globalEtaMin = useMemo(() => {
    if (!bestShower) return 0
    return bestShower.etaMin
  }, [bestShower])

  // ----- Actions -----
  const handleReserve = useCallback(
    async (showerNumber: number) => {
      setBusyShower(showerNumber)
      setBusyQueue(true)
      try {
        const res = await fetch('/api/vip/shower-reservations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ showerNumber, tableNumber }),
        })
        const body = await res.json().catch(() => null)
        if (!body || body.ok !== true || !body.data) {
          throw new Error(body?.error || 'Réservation refusée')
        }
        // La route renvoie { reservation, etaMinutes, queuePosition }.
        // On tolère aussi l'ancienne forme { id, status, etaMin }.
        const data = body.data as ReserveResult & {
          id?: string
          status?: string
          etaMin?: number
        }
        const reservation = data.reservation ?? null
        const etaMin =
          typeof data.etaMinutes === 'number'
            ? data.etaMinutes
            : typeof data.etaMin === 'number'
              ? data.etaMin
              : 0
        const queuePosition = typeof data.queuePosition === 'number' ? data.queuePosition : 1
        const reservationId = reservation?.id ?? data.id ?? ''
        const trackingNumber = buildTrackingNumber(reservationId, showerNumber)

        if (!mountedRef.current) return
        setConfirmation({
          showerNumber,
          etaMin,
          queuePosition,
          reservationId,
          trackingNumber,
        })
        setScreen('confirm')
        toast({
          title: 'Douche réservée',
          description: `${showerLabel(showerNumber)} · ETA ≈ ${fmtMinutes(etaMin)}`,
        })
        // Refresh silencieux pour mettre à jour la grille
        void refresh({ silent: true })
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Erreur réseau'
        toast({
          title: 'Réservation impossible',
          description: msg,
          variant: 'destructive',
        })
      } finally {
        if (mountedRef.current) {
          setBusyShower(null)
          setBusyQueue(false)
        }
      }
    },
    [refresh, tableNumber, toast],
  )

  const handleJoinQueue = useCallback(() => {
    if (!bestShower) {
      toast({
        title: 'Aucune cabine disponible',
        description: 'Veuillez patienter quelques minutes.',
        variant: 'destructive',
      })
      return
    }
    void handleReserve(bestShower.showerNumber)
  }, [bestShower, handleReserve, toast])

  const handleBackToTable = useCallback(() => {
    onBack()
  }, [onBack])

  const handleReserveAnother = useCallback(() => {
    setConfirmation(null)
    setScreen('main')
    void refresh({ silent: false })
  }, [refresh])

  // ----- Render : écran confirmation -----
  if (screen === 'confirm' && confirmation) {
    return (
      <div className="min-h-screen bg-[#FAFAF7]">
        <ConfirmationView
          state={confirmation}
          onBack={handleBackToTable}
          onReserveAnother={handleReserveAnother}
        />
      </div>
    )
  }

  // ----- Render : écran principal -----
  return (
    <div className="min-h-screen bg-[#FAFAF7] text-[#2C2C2C]">
      {/* ---------- Header ---------- */}
      <header
        className={cn(
          'sticky top-0 z-10 border-b border-[#EAE5DC] bg-white/90 backdrop-blur',
          CARD_SHADOW,
        )}
      >
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
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
            <span className="text-xl" aria-hidden>🚿</span>
            <div className="min-w-0">
              <h1
                className="truncate text-lg leading-tight text-[#2C2C2C]"
                style={TITLE_FONT}
              >
                Réserver une douche
              </h1>
              <p className="text-xs text-[#8B6F47]">Table {tableNumber}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void refresh({ silent: false })}
            disabled={refreshing}
            aria-label="Rafraîchir"
            className={cn(
              'flex size-9 items-center justify-center rounded-full',
              'border border-[#EAE5DC] bg-white text-[#8B6F47]',
              'transition-colors hover:border-[#C9A961]/50 hover:text-[#2C2C2C]',
              'disabled:opacity-50',
            )}
          >
            <RefreshCw className={cn('size-4', refreshing && 'animate-spin')} />
          </button>
        </div>
      </header>

      {/* ---------- Contenu ---------- */}
      <div className="mx-auto max-w-3xl px-4 py-6">
        {/* Bandeau d'aide */}
        <div
          className={cn(
            'mb-5 flex items-start gap-3 rounded-xl border border-[#EAE5DC]',
            'bg-white p-4 text-sm',
            CARD_SHADOW,
          )}
        >
          <ShowerHead className="mt-0.5 size-5 shrink-0 text-[#C9A961]" />
          <div>
            <div
              className="font-semibold text-[#2C2C2C]"
              style={TITLE_FONT}
            >
              {freeCount > 0
                ? `${freeCount} cabine${freeCount > 1 ? 's' : ''} disponible${freeCount > 1 ? 's' : ''}`
                : 'Toutes les cabines sont occupées'}
            </div>
            <p className="mt-1 text-xs leading-relaxed text-[#6b6b6b]">
              Réservez en un clic. Vous recevrez une notification à votre
              table dès que votre douche sera prête (durée d'usage 20 min,
              nettoyage 10 min).
            </p>
          </div>
        </div>

        {/* Grille des cabines */}
        {loading ? (
          <ShowerGridSkeleton />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {views.map((view) => (
              <ShowerCard
                key={view.showerNumber}
                view={view}
                onReserve={handleReserve}
                busy={busyShower === view.showerNumber}
              />
            ))}
          </div>
        )}

        {/* Section file d'attente globale */}
        {!loading && freeCount === 0 && (
          <section
            className={cn(
              'mt-6 rounded-xl border border-[#EAE5DC] bg-white p-5',
              CARD_SHADOW,
            )}
          >
            <div className="flex items-start gap-3">
              <div className="flex size-10 items-center justify-center rounded-full bg-[#6B4C9A]/10">
                <Users className="size-5 text-[#6B4C9A]" />
              </div>
              <div className="flex-1">
                <h3
                  className="text-base text-[#2C2C2C]"
                  style={TITLE_FONT}
                >
                  File d'attente intelligente
                </h3>
                <p className="mt-1 text-xs text-[#6b6b6b]">
                  {globalQueueAhead > 0
                    ? `${globalQueueAhead} personne${globalQueueAhead > 1 ? 's' : ''} devant vous.`
                    : 'Aucune file en cours.'}
                </p>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div className="rounded-lg bg-[#FAFAF7] p-3 text-center">
                    <div className="text-[10px] uppercase tracking-wide text-[#8B6F47]">
                      File d'attente
                    </div>
                    <div
                      className="mt-1 text-xl font-semibold text-[#2C2C2C]"
                      style={TITLE_FONT}
                    >
                      {globalQueueAhead}{' '}
                      <span className="text-xs font-normal text-[#8B6F47]">
                        {globalQueueAhead === 1 ? 'personne' : 'personnes'}
                      </span>
                    </div>
                  </div>
                  <div className="rounded-lg bg-[#FAFAF7] p-3 text-center">
                    <div className="text-[10px] uppercase tracking-wide text-[#8B6F47]">
                      ETA estimé
                    </div>
                    <div
                      className="mt-1 text-xl font-semibold text-[#2C2C2C]"
                      style={TITLE_FONT}
                    >
                      ~{globalEtaMin}{' '}
                      <span className="text-xs font-normal text-[#8B6F47]">
                        min
                      </span>
                    </div>
                  </div>
                </div>

                <Button
                  type="button"
                  disabled={busyQueue || !bestShower}
                  onClick={handleJoinQueue}
                  className={cn(
                    'mt-4 h-11 w-full rounded-md text-sm font-bold uppercase tracking-wide',
                    'bg-[#6B4C9A] text-white hover:bg-[#5A3F84] active:bg-[#4D3473]',
                  )}
                >
                  {busyQueue ? (
                    <>
                      <Loader2 className="size-4 animate-spin" /> Réservation…
                    </>
                  ) : (
                    <>
                      <ShowerHead className="size-4" /> Réserver ma douche
                    </>
                  )}
                </Button>
                {bestShower && (
                  <p className="mt-2 text-center text-[11px] text-[#8B6F47]">
                    Cabine recommandée :{' '}
                    <span className="font-semibold">
                      {showerLabel(bestShower.showerNumber)}
                    </span>
                  </p>
                )}
              </div>
            </div>
          </section>
        )}

        {/* Sync footer */}
        {!loading && (
          <div className="mt-6 flex items-center justify-center gap-2 text-[11px] text-[#8B6F47]">
            <Clock className="size-3" />
            {lastSyncAt
              ? `Synchronisé il y a ${fmtMinutes(
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
// Sous-composants utilitaires
// ============================================================

function ShowerGridSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {Array.from({ length: SHOWER_COUNT }).map((_, i) => (
        <div
          key={i}
          className={cn(
            'h-44 animate-pulse rounded-xl border border-[#EAE5DC] bg-white',
            CARD_SHADOW,
          )}
        >
          <div className="flex h-full flex-col p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="size-11 rounded-full bg-[#EAE5DC]" />
                <div>
                  <div className="h-4 w-12 rounded bg-[#EAE5DC]" />
                  <div className="mt-2 h-2 w-16 rounded bg-[#EAE5DC]" />
                </div>
              </div>
              <div className="h-5 w-16 rounded-full bg-[#EAE5DC]" />
            </div>
            <div className="mt-4 h-3 w-3/4 rounded bg-[#EAE5DC]" />
            <div className="mt-2 h-3 w-1/2 rounded bg-[#EAE5DC]" />
            <div className="mt-auto h-9 w-full rounded bg-[#EAE5DC]" />
          </div>
        </div>
      ))}
    </div>
  )
}

/** Construit un n° de suivi affichable : DOUCHE-<shower>-<shortId>. */
function buildTrackingNumber(reservationId: string, shower: number): string {
  const short = (reservationId || '').slice(-6).toUpperCase() || 'XXXXXX'
  return `DOUCHE-${shower}-${short}`
}

// ============================================================
// Default export
// ============================================================

export default VipShowerReservation
