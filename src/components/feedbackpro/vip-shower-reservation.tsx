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
//   • Bilingue FR/EN via la prop `langue` (défaut 'fr').
//   • Filtre anti-périmé : réservations queued/ready expirées et
//     'using' > 60 min (no-show) traitées comme inactives côté lecture.
//
// Palette « Luxe Lumineux » :
//   - Background   #ffffff    - Cards  #FFFFFF + shadow gold 6%
//   - Gold         #bc7155    - Bronze #8B6F47
//   - Text         #2C2C2C    - VIP    #bc7155
//   - Success      #bc7155    - Alert  #bc7155
//   - Border       #efe7e0
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

/** Langue d'affichage du module (bilingue FR/EN). */
type Langue = 'fr' | 'en'

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

/** No-show : une résa 'using' dont reservedAt date de plus de 60 min est périmée. */
const USING_STALE_MS = 60 * 60_000
/** Plafond d'affichage (minutes) anti-valeurs absurdes (ETA, « Occupée depuis »). */
const MAX_DISPLAY_MIN = 120

const STATUS_META: Record<
  DerivedStatus,
  {
    labelFr: string
    labelEn: string
    emoji: string
    badgeClass: string
    ringClass: string
  }
> = {
  free: {
    labelFr: 'Libre',
    labelEn: 'Available',
    emoji: '🟢',
    badgeClass:
      'bg-[#faf1ec] text-[#8a4f3b] border-[#e7c1ae]',
    ringClass: 'ring-[#e7c1ae]/60',
  },
  occupied: {
    labelFr: 'Occupée',
    labelEn: 'Occupied',
    emoji: '🟠',
    badgeClass:
      'bg-[#faf1ec] text-[#8a4f3b] border-[#e7c1ae]',
    ringClass: 'ring-[#e7c1ae]/60',
  },
  cleaning: {
    labelFr: 'Nettoyage',
    labelEn: 'Cleaning',
    emoji: '🔵',
    badgeClass: 'bg-[#f0f1f2] text-[#2e3040] border-[#b9bbc2]',
    ringClass: 'ring-[#b9bbc2]/60',
  },
}

/**
 * QR_ROUTING — Libellé d'emplacement affiché :
 *   - n° de table ("T-05")  → « Table T-05 » (mode CLIENT_ZONE)
 *   - zone/fauteuil ("Zone Buffet", "Fauteuil 12", "Salon VIP")
 *     → affiché tel quel (mode CLIENT_GLOBAL, QR d'entrée).
 */
function displayLocation(t: string, langue: Langue = 'fr'): string {
  const raw = (t ?? '').trim()
  if (!raw) return langue === 'en' ? 'VIP Lounge' : 'Salon VIP'
  return /^t[-\s]?\d+/i.test(raw) ? `Table ${raw}` : raw
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

/** Formate "X min" en gérant le singulier/pluriel (bilingue FR/EN). */
function fmtMinutes(min: number, langue: Langue = 'fr'): string {
  if (min <= 0) return langue === 'en' ? 'just now' : "à l'instant"
  if (min === 1) return '1 min'
  return `${min} min`
}

/**
 * FILTRE ANTI-PÉRIMÉ — une réservation n'est « active » que si :
 *   • son statut est queued / ready / using, ET
 *   • queued|ready : expiresAt n'est pas déjà passé (sinon le no-show
 *     n'a jamais été libéré côté lecture → « Occupée depuis 3373 min ») ;
 *   • using : reservedAt date de moins de 60 min (no-show présumé).
 * Les réservations périmées sont ignorées comme si elles étaient
 * terminées (done / cancelled).
 */
function isReservationActive(r: ShowerReservation): boolean {
  if (!ACTIVE_RESERVATION_STATUSES.has(r.status)) return false
  const now = Date.now()
  // (a) queued / ready : expiresAt passé → périmée
  if (r.status === 'queued' || r.status === 'ready') {
    if (r.expiresAt) {
      const exp = new Date(r.expiresAt).getTime()
      if (!Number.isNaN(exp) && exp < now) return false
    }
  }
  // (b) using : reservedAt vieux de plus de 60 min → périmée (no-show)
  if (r.status === 'using') {
    const started = new Date(r.reservedAt).getTime()
    if (!Number.isNaN(started) && now - started > USING_STALE_MS) {
      return false
    }
  }
  return true
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
    // Filtre anti-périmé : queued/ready expirées et 'using' > 60 min
    // ne comptent plus (ni file, ni ETA, ni occupation).
    if (!isReservationActive(r)) continue
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

    // Queue = nombre de réservations "queued" (en attente) non périmées
    const queueCount = active.filter((r) => r.status === 'queued').length
    // ETA = nombre de gens devant * SLOT_MIN (incluant l'usage courant),
    // plafonné à MAX_DISPLAY_MIN pour éviter les ETA absurdes.
    const slotsAhead = Math.max(0, active.length)
    const etaMin =
      status === 'free'
        ? 0
        : Math.min(slotsAhead * SLOT_MIN, MAX_DISPLAY_MIN)

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
  langue?: Langue
}

function ShowerCard({
  view,
  onReserve,
  busy,
  langue = 'fr',
}: ShowerCardProps) {
  const T = (fr: string, en: string) => (langue === 'en' ? en : fr)
  const meta = STATUS_META[view.status]
  const elapsedMin = minutesSince(view.occupiedSince)
  // Garde-fou d'affichage : au-delà de MAX_DISPLAY_MIN minutes, la valeur
  // « Occupée depuis » est absurde (occupation fantôme non encore
  // auto-libérée côté backend) → on affiche « — ».
  const elapsedLabel =
    elapsedMin > MAX_DISPLAY_MIN ? '—' : fmtMinutes(elapsedMin, langue)

  return (
    <article
      className={cn(
        'relative flex flex-col rounded-xl border bg-white p-5 transition-all',
        'border-[#efe7e0]',
        view.status === 'free'
          ? 'hover:border-[#bc7155]/40 hover:shadow-[0_8px_28px_rgba(74,124,89,0.10)]'
          : 'hover:border-[#bc7155]/30',
        CARD_SHADOW,
      )}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              'flex size-11 items-center justify-center rounded-full',
              'bg-[#ffffff] ring-2',
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
              {T('Cabine', 'Cabin')} {view.showerNumber}
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
          {T(meta.labelFr, meta.labelEn)}
        </span>
      </div>

      {/* Détail selon le statut */}
      <div className="mt-4 flex-1 text-sm">
        {view.status === 'free' ? (
          <p className="text-[#bc7155]">
            {T('Cabine disponible immédiatement.', 'Cabin available right away.')}
          </p>
        ) : view.status === 'cleaning' ? (
          <div className="space-y-1">
            <p className="text-[#6b6b6b]">
              {T('En cours de nettoyage.', 'Currently being cleaned.')}
            </p>
            <p className="inline-flex items-center gap-1 text-xs text-[#8B6F47]">
              <Clock className="size-3" />{' '}
              {T('Fin prévue ≈', 'Ready in ≈')}{' '}
              {fmtMinutes(CLEANING_MIN, langue)}
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            <p className="inline-flex items-center gap-1 text-[#6b6b6b]">
              <Clock className="size-3 text-[#bc7155]" />{' '}
              {T('Occupée depuis', 'In use for')} {elapsedLabel}
            </p>
            {view.queueCount > 0 && (
              <p className="inline-flex items-center gap-1 text-xs text-[#8B6F47]">
                <Users className="size-3" /> {view.queueCount}{' '}
                {view.queueCount === 1
                  ? T('personne', 'person')
                  : T('personnes', 'people')}{' '}
                {T('en file', 'in queue')}
              </p>
            )}
            <p className="inline-flex items-center gap-1 text-xs text-[#8B6F47]">
              <Clock className="size-3" />{' '}
              {T('Libre dans ≈', 'Available in ≈')}{' '}
              {fmtMinutes(view.etaMin, langue)}
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
            'bg-[#bc7155] text-white hover:bg-[#3D6A4B] active:bg-[#34593F]',
            'shadow-sm transition-colors',
          )}
        >
          {busy ? (
            <>
              <Loader2 className="size-4 animate-spin" />{' '}
              {T('Réservation…', 'Reserving…')}
            </>
          ) : (
            <>
              <Check className="size-4" /> {T('Réserver', 'Reserve')}
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
  langue?: Langue
}

function ConfirmationView({
  state,
  onBack,
  onReserveAnother,
  langue = 'fr',
}: ConfirmationViewProps) {
  const T = (fr: string, en: string) => (langue === 'en' ? en : fr)
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 py-10 text-center">
      <div
        className={cn(
          'flex size-20 items-center justify-center rounded-full',
          'bg-[#bc7155]/10 ring-4 ring-[#bc7155]/15',
        )}
      >
        <Check className="size-10 text-[#bc7155]" strokeWidth={3} />
      </div>

      <h2
        className="mt-6 text-2xl text-[#2C2C2C]"
        style={TITLE_FONT}
      >
        {T('Douche réservée', 'Shower reserved')}
      </h2>
      <p className="mt-2 text-sm text-[#6b6b6b]">
        {T('Votre douche', 'Your shower')}{' '}
        <span className="font-semibold text-[#2C2C2C]">
          {showerLabel(state.showerNumber)}
        </span>{' '}
        {T('sera prête dans ≈', 'will be ready in ≈')}{' '}
        {fmtMinutes(state.etaMin, langue)}.
      </p>

      <div
        className={cn(
          'mt-6 w-full rounded-xl border border-[#efe7e0] bg-white p-5 text-left',
          CARD_SHADOW,
        )}
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wide text-[#8B6F47]">
            {T('N° de suivi', 'Tracking number')}
          </span>
          <span
            className="text-lg font-bold tracking-wider text-[#bc7155]"
            style={TITLE_FONT}
          >
            #{state.trackingNumber}
          </span>
        </div>
        <div className="my-3 h-px bg-[#efe7e0]" />
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <div className="text-[10px] uppercase tracking-wide text-[#8B6F47]">
              {T('Cabine', 'Cabin')}
            </div>
            <div className="text-sm font-semibold text-[#2C2C2C]">
              {showerLabel(state.showerNumber)}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-[#8B6F47]">
              {T('Position file', 'Queue position')}
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
              {fmtMinutes(state.etaMin, langue)}
            </div>
          </div>
        </div>
      </div>

      <div
        className={cn(
          'mt-4 flex items-start gap-2 rounded-lg border border-[#efe7e0]',
          'bg-[#ffffff] px-4 py-3 text-left text-xs text-[#6b6b6b]',
        )}
      >
        <Bell className="mt-0.5 size-4 shrink-0 text-[#bc7155]" />
        <span>
          {T(
            'Nous vous notifierons à votre table',
            'We will notify you at your table',
          )}{' '}
          <span className="font-semibold text-[#2C2C2C]">
            {showerLabel(state.showerNumber)}
          </span>{' '}
          {T(
            "dès qu'elle sera prête. Conservez votre n° de suivi.",
            'as soon as it is ready. Please keep your tracking number.',
          )}
        </span>
      </div>

      <div className="mt-6 flex w-full gap-2">
        <Button
          variant="ghost"
          onClick={onReserveAnother}
          className={cn(
            'flex-1 rounded-md border border-[#efe7e0] bg-white text-[#8B6F47]',
            'hover:bg-[#ffffff] hover:text-[#2C2C2C]',
          )}
        >
          <ShowerHead className="size-4" />{' '}
          {T('Réserver une autre cabine', 'Reserve another cabin')}
        </Button>
        <Button
          onClick={onBack}
          className={cn(
            'flex-1 rounded-md bg-[#bc7155] px-6 text-sm font-semibold text-white',
            'hover:bg-[#B8974A] active:bg-[#A6863C]',
          )}
        >
          <ArrowLeft className="size-4" />{' '}
          {T('Retour à la table', 'Back to your table')}
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
  langue = 'fr',
}: {
  tableNumber: string
  onBack: () => void
  langue?: Langue
}) {
  const { toast } = useToast()

  // Helper de traduction local : T(fr, en).
  // Mémorisé sur `langue` pour conserver une identité stable dans les
  // dépendances des useCallback ci-dessous (sinon le polling bouclerait).
  const T = useMemo(
    () => (fr: string, en: string) => (langue === 'en' ? en : fr),
    [langue],
  )

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
      throw new Error(
        T('Réservations indisponibles', 'Reservations unavailable'),
      )
    }
    return body.data as ShowerReservation[]
  }, [T])

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
        const msg =
          err instanceof Error
            ? err.message
            : T('Erreur réseau', 'Network error')
        toast({
          title: T('Synchronisation impossible', 'Unable to refresh'),
          description: msg,
          variant: 'destructive',
        })
      } finally {
        if (!silent) setRefreshing(false)
        if (mountedRef.current) setLoading(false)
      }
    },
    [fetchReservations, fetchShowers, toast, T],
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
    // Total des "queued" non périmées (file d'attente globale)
    return reservations.filter(
      (r) => isReservationActive(r) && r.status === 'queued',
    ).length
  }, [reservations])

  const globalEtaMin = useMemo(() => {
    if (!bestShower) return 0
    // Plafond de sécurité (déjà appliqué dans buildShowerViews)
    return Math.min(bestShower.etaMin, MAX_DISPLAY_MIN)
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
          throw new Error(
            body?.error || T('Réservation refusée', 'Reservation refused'),
          )
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
        // Plafond de sécurité sur l'ETA affiché (évite les ETA absurdes).
        const safeEtaMin = Math.min(etaMin, MAX_DISPLAY_MIN)
        setConfirmation({
          showerNumber,
          etaMin: safeEtaMin,
          queuePosition,
          reservationId,
          trackingNumber,
        })
        setScreen('confirm')
        toast({
          title: T('Douche réservée', 'Shower reserved'),
          description: `${showerLabel(showerNumber)} · ETA ≈ ${fmtMinutes(
            safeEtaMin,
            langue,
          )}`,
        })
        // Refresh silencieux pour mettre à jour la grille
        void refresh({ silent: true })
      } catch (err) {
        const msg =
          err instanceof Error
            ? err.message
            : T('Erreur réseau', 'Network error')
        toast({
          title: T('Réservation impossible', 'Unable to reserve'),
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
    [refresh, tableNumber, toast, T, langue],
  )

  const handleJoinQueue = useCallback(() => {
    if (!bestShower) {
      toast({
        title: T('Aucune cabine disponible', 'No cabin available'),
        description: T(
          'Veuillez patienter quelques minutes.',
          'Please wait a few minutes.',
        ),
        variant: 'destructive',
      })
      return
    }
    void handleReserve(bestShower.showerNumber)
  }, [bestShower, handleReserve, toast, T])

  const handleBackToTable = useCallback(() => {
    onBack()
  }, [onBack])

  const handleReserveAnother = useCallback(() => {
    setConfirmation(null)
    setScreen('main')
    void refresh({ silent: false })
  }, [refresh])

  // ----- Label du pied de page sync (bilingue, garde « à l'instant ») -----
  const minsSinceSync = lastSyncAt
    ? Math.floor((Date.now() - lastSyncAt) / 60_000)
    : 0
  const autoRefreshLabel =
    langue === 'en'
      ? `Auto-refresh every ${POLL_INTERVAL_MS / 1000}s`
      : `MAJ auto toutes les ${POLL_INTERVAL_MS / 1000}s`
  const syncLabel = !lastSyncAt
    ? T('Synchronisation en cours…', 'Synchronising…')
    : minsSinceSync <= 0
      ? langue === 'en'
        ? `Synced just now · ${autoRefreshLabel}`
        : `Synchronisé à l'instant · ${autoRefreshLabel}`
      : langue === 'en'
        ? `Synced ${fmtMinutes(minsSinceSync, langue)} ago · ${autoRefreshLabel}`
        : `Synchronisé il y a ${fmtMinutes(minsSinceSync, langue)} · ${autoRefreshLabel}`

  // ----- Render : écran confirmation -----
  if (screen === 'confirm' && confirmation) {
    return (
      <div className="min-h-screen bg-[#ffffff]">
        <ConfirmationView
          state={confirmation}
          onBack={handleBackToTable}
          onReserveAnother={handleReserveAnother}
          langue={langue}
        />
      </div>
    )
  }

  // ----- Render : écran principal -----
  return (
    <div className="min-h-screen bg-[#ffffff] text-[#2C2C2C]">
      {/* ---------- Header ---------- */}
      <header
        className={cn(
          'sticky top-0 z-10 border-b border-[#efe7e0] bg-white/90 backdrop-blur',
          CARD_SHADOW,
        )}
      >
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          <button
            type="button"
            onClick={onBack}
            aria-label={T('Retour', 'Back')}
            className={cn(
              'flex size-9 items-center justify-center rounded-full',
              'border border-[#efe7e0] bg-white text-[#8B6F47]',
              'transition-colors hover:border-[#bc7155]/50 hover:text-[#2C2C2C]',
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
                {T('Réserver une douche', 'Reserve a shower')}
              </h1>
              <p className="text-xs text-[#8B6F47]">
                {displayLocation(tableNumber, langue)}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void refresh({ silent: false })}
            disabled={refreshing}
            aria-label={T('Rafraîchir', 'Refresh')}
            className={cn(
              'flex size-9 items-center justify-center rounded-full',
              'border border-[#efe7e0] bg-white text-[#8B6F47]',
              'transition-colors hover:border-[#bc7155]/50 hover:text-[#2C2C2C]',
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
            'mb-5 flex items-start gap-3 rounded-xl border border-[#efe7e0]',
            'bg-white p-4 text-sm',
            CARD_SHADOW,
          )}
        >
          <ShowerHead className="mt-0.5 size-5 shrink-0 text-[#bc7155]" />
          <div>
            <div
              className="font-semibold text-[#2C2C2C]"
              style={TITLE_FONT}
            >
              {freeCount > 0
                ? langue === 'en'
                  ? `${freeCount} cabin${freeCount > 1 ? 's' : ''} available`
                  : `${freeCount} cabine${freeCount > 1 ? 's' : ''} disponible${freeCount > 1 ? 's' : ''}`
                : T(
                    'Toutes les cabines sont occupées',
                    'All cabins are currently in use',
                  )}
            </div>
            <p className="mt-1 text-xs leading-relaxed text-[#6b6b6b]">
              {T(
                "Réservez en un clic. Vous recevrez une notification à votre table dès que votre douche sera prête (durée d'usage 20 min, nettoyage 10 min).",
                'Reserve in one tap — you will be notified at your table as soon as your shower is ready (20-minute usage, 10-minute cleaning).',
              )}
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
                langue={langue}
              />
            ))}
          </div>
        )}

        {/* Section file d'attente globale */}
        {!loading && freeCount === 0 && (
          <section
            className={cn(
              'mt-6 rounded-xl border border-[#efe7e0] bg-white p-5',
              CARD_SHADOW,
            )}
          >
            <div className="flex items-start gap-3">
              <div className="flex size-10 items-center justify-center rounded-full bg-[#bc7155]/10">
                <Users className="size-5 text-[#bc7155]" />
              </div>
              <div className="flex-1">
                <h3
                  className="text-base text-[#2C2C2C]"
                  style={TITLE_FONT}
                >
                  {T("File d'attente intelligente", 'Smart queue')}
                </h3>
                <p className="mt-1 text-xs text-[#6b6b6b]">
                  {globalQueueAhead > 0
                    ? langue === 'en'
                      ? `${globalQueueAhead} ${
                          globalQueueAhead > 1 ? 'people' : 'person'
                        } ahead of you.`
                      : `${globalQueueAhead} personne${globalQueueAhead > 1 ? 's' : ''} devant vous.`
                    : T('Aucune file en cours.', 'No queue at the moment.')}
                </p>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div className="rounded-lg bg-[#ffffff] p-3 text-center">
                    <div className="text-[10px] uppercase tracking-wide text-[#8B6F47]">
                      {T("File d'attente", 'Queue')}
                    </div>
                    <div
                      className="mt-1 text-xl font-semibold text-[#2C2C2C]"
                      style={TITLE_FONT}
                    >
                      {globalQueueAhead}{' '}
                      <span className="text-xs font-normal text-[#8B6F47]">
                        {globalQueueAhead === 1
                          ? T('personne', 'person')
                          : T('personnes', 'people')}
                      </span>
                    </div>
                  </div>
                  <div className="rounded-lg bg-[#ffffff] p-3 text-center">
                    <div className="text-[10px] uppercase tracking-wide text-[#8B6F47]">
                      {T('ETA estimé', 'Estimated ETA')}
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
                    'bg-[#bc7155] text-white hover:bg-[#5A3F84] active:bg-[#4D3473]',
                  )}
                >
                  {busyQueue ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />{' '}
                      {T('Réservation…', 'Reserving…')}
                    </>
                  ) : (
                    <>
                      <ShowerHead className="size-4" />{' '}
                      {T('Réserver ma douche', 'Reserve my shower')}
                    </>
                  )}
                </Button>
                {bestShower && (
                  <p className="mt-2 text-center text-[11px] text-[#8B6F47]">
                    {T('Cabine recommandée :', 'Recommended cabin:')}{' '}
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
            {syncLabel}
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
            'h-44 animate-pulse rounded-xl border border-[#efe7e0] bg-white',
            CARD_SHADOW,
          )}
        >
          <div className="flex h-full flex-col p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="size-11 rounded-full bg-[#efe7e0]" />
                <div>
                  <div className="h-4 w-12 rounded bg-[#efe7e0]" />
                  <div className="mt-2 h-2 w-16 rounded bg-[#efe7e0]" />
                </div>
              </div>
              <div className="h-5 w-16 rounded-full bg-[#efe7e0]" />
            </div>
            <div className="mt-4 h-3 w-3/4 rounded bg-[#efe7e0]" />
            <div className="mt-2 h-3 w-1/2 rounded bg-[#efe7e0]" />
            <div className="mt-auto h-9 w-full rounded bg-[#efe7e0]" />
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
