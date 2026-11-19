'use client'

// ============================================================
// <VipStaffView /> — PWA Staff Salon VIP · "Luxe Lumineux"
// ------------------------------------------------------------
// Vue mobile-first destinée au staff du salon VIP. Permet :
//   1. Connexion par sélection de profil (dropdown des 6 staff VIP).
//   2. Feed temps réel (polling 10 s) des demandes "pending" +
//      "in_progress", fusionnées et triées par createdAt DESC.
//   3. Prise en charge d'une demande (action TAKE_CHARGE).
//   4. Résolution d'une demande (action RESOLVE) via un écran de
//      confirmation (resolve-confirm) avec commentaire optionnel.
//   5. Déconnexion → retour à l'écran de login + appel onExit.
//
// Palette "Luxe Lumineux" :
//   - Background   #FAFAF7 (warm off-white)
//   - Cards        #FFFFFF (pure white) + shadow gold 6%
//   - Accent gold  #C9A961 (champagne)
//   - Bronze       #8B6F47
//   - Text         #2C2C2C (anthracite)
//   - Success      #4A7C59 (sage)
//   - Alert        #C97B63 (terracotta)
//   - VIP badge    #6B4C9A (amethyst)
//
// API consommées :
//   • GET  /api/vip/staff-auth                      → liste staff
//   • GET  /api/vip/requests?status=pending|in_progress|done
//   • POST /api/vip/staff-scan { requestId, action, staffId, staffName }
//
// Son : ding à 880 Hz (Web Audio API) quand un nouvel incident
// (id inconnu de seenIdsRef) apparaît dans le feed.
// ============================================================

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Loader2,
  LogOut,
  Bell,
  Check,
  X,
  AlertTriangle,
  Wine,
  Utensils,
  ShowerHead,
  Plug,
  ConciergeBell,
  Star,
  Trash2,
  ArrowLeft,
  RefreshCw,
  Package,
  Gift,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'
import { VipGuestAlertBanner } from '@/components/feedbackpro/vip-guest-alert'
import { cn } from '@/lib/utils'
import { VipLostFound } from '@/components/feedbackpro/vip-lost-found'
import { VipBriefing } from '@/components/feedbackpro/vip-briefing'
import { VipFlashRewards } from '@/components/feedbackpro/vip-flash-rewards'

// ============================================================
// Types
// ============================================================

type Screen = 'login' | 'briefing' | 'feed' | 'resolve-confirm' | 'lost-found' | 'rewards'

interface VipStaffMember {
  id: string
  name: string
  role: string
  emoji: string
}

interface VipTable {
  id: string
  tableNumber: string
  zone: string
  clientName: string | null
  clientVipLevel: string | null
}

interface VipRequest {
  id: string
  tableId: string
  table: VipTable
  type: string
  message: string | null
  metadata: string
  trackingNumber: string | null
  status: string
  staffName: string | null
  createdAt: string
  updatedAt: string
}

// ============================================================
// Constantes — labels & styles
// ============================================================

const TYPE_LABELS: Record<string, { label: string; emoji: string }> = {
  refreshment: { label: 'Commande rafraîchissement', emoji: '🍸' },
  menu: { label: 'Demande menu', emoji: '📋' },
  shower: { label: 'Réservation douche', emoji: '🚿' },
  charger: { label: 'Demande chargeur', emoji: '🔌' },
  concierge: { label: 'Appel concierge', emoji: '🛎️' },
  problem: { label: 'Signalement problème', emoji: '⚠️' },
  rating: { label: 'Évaluation client', emoji: '⭐' },
  cleanup: { label: 'Nettoyage table', emoji: '🧹' },
}

const ZONE_LABELS: Record<string, string> = {
  main: 'Espace Principal',
  buffet: 'Buffet & Bar',
  relaxation: 'Espace Détente',
  meeting: 'Salles de Réunion',
}

const STATUS_STYLES: Record<
  string,
  { label: string; color: string }
> = {
  pending: {
    label: 'En attente',
    color: 'bg-amber-100 text-amber-800 border-amber-300',
  },
  in_progress: {
    label: 'En cours',
    color: 'bg-sky-100 text-sky-800 border-sky-300',
  },
  done: {
    label: 'Résolu',
    color: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  },
}

// Icons lucide par type (fallback élégant si l'emoji ne suffit pas)
const TYPE_ICONS: Record<string, typeof Wine> = {
  refreshment: Wine,
  menu: Utensils,
  shower: ShowerHead,
  charger: Plug,
  concierge: ConciergeBell,
  problem: AlertTriangle,
  rating: Star,
  cleanup: Trash2,
}

// ============================================================
// Helpers
// ============================================================

function getTypeInfo(type: string): { label: string; emoji: string } {
  return (
    TYPE_LABELS[type] || {
      label: type.charAt(0).toUpperCase() + type.slice(1),
      emoji: '🔔',
    }
  )
}

function getZoneLabel(zone: string): string {
  return ZONE_LABELS[zone] || zone
}

function getStatusInfo(status: string): { label: string; color: string } {
  return (
    STATUS_STYLES[status] || {
      label: status,
      color: 'bg-slate-100 text-slate-800 border-slate-300',
    }
  )
}

/** Écart en minutes entre maintenant et une date ISO. */
function elapsedMinutes(iso: string): number {
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return 0
  return Math.max(0, Math.floor((Date.now() - t) / 60000))
}

/** Formate "il y a X min" / "il y a X h Y min" / "à l'instant". */
function formatElapsed(iso: string): string {
  const mins = elapsedMinutes(iso)
  if (mins < 1) return 'à l’instant'
  if (mins < 60) return `il y a ${mins} min`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return `il y a ${h} h ${String(m).padStart(2, '0')} min`
}

/** Décode le champ metadata (JSON string). Tolère un JSON invalide. */
function parseMetadata(raw: string): Record<string, unknown> {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

/** Extrait un libellé court pour une demande (items, tags…). */
function describeRequest(req: VipRequest): string {
  if (req.message && req.message.trim()) return req.message.trim()
  const meta = parseMetadata(req.metadata)
  if (Array.isArray(meta.items) && meta.items.length > 0) {
    return (meta.items as Array<{ name?: string; qty?: number }>)
      .map((it) => {
        const qty = typeof it.qty === 'number' && it.qty > 1 ? `${it.qty} × ` : ''
        const name = typeof it.name === 'string' ? it.name : ''
        return `${qty}${name}`.trim()
      })
      .filter(Boolean)
      .join(' · ')
  }
  if (Array.isArray(meta.tags) && meta.tags.length > 0) {
    return (meta.tags as string[]).join(' · ')
  }
  return getTypeInfo(req.type).label
}

/** Ding discret à 880 Hz (Web Audio). */
function playDing() {
  try {
    const ctx = new (window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext)()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.frequency.value = 880
    osc.type = 'sine'
    gain.gain.setValueAtTime(0.3, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5)
    osc.start()
    osc.stop(ctx.currentTime + 0.5)
  } catch {
    /* ignore — AudioContext peut être indispo */
  }
}

// ============================================================
// Composant principal
// ============================================================

export function VipStaffView({
  staffTag,
  onExit,
}: {
  staffTag: string
  onExit?: () => void
}) {
  const { toast } = useToast()

  // ----- State machine -----
  const [screen, setScreen] = useState<Screen>('login')

  // ----- Staff (auth Tél+PIN Module 1 — Cockpit Manager) -----
  const [phoneInput, setPhoneInput] = useState('')
  const [pinInput, setPinInput] = useState('')
  const [loginError, setLoginError] = useState<string | null>(null)
  const [loginBusy, setLoginBusy] = useState(false)
  const [currentStaff, setCurrentStaff] = useState<VipStaffMember | null>(null)

  // ----- Feed -----
  const [requests, setRequests] = useState<VipRequest[]>([])
  const [feedLoading, setFeedLoading] = useState(false)
  const [lastPollAt, setLastPollAt] = useState<number | null>(null)

  // ----- KPIs -----
  const [countPending, setCountPending] = useState(0)
  const [countInProgress, setCountInProgress] = useState(0)
  const [countDone, setCountDone] = useState(0)

  // ----- Resolve flow -----
  const [resolveTarget, setResolveTarget] = useState<VipRequest | null>(null)
  const [resolveComment, setResolveComment] = useState('')
  const [resolveBusy, setResolveBusy] = useState(false)

  // ----- Take-charge flow (loading per request id) -----
  const [takingChargeId, setTakingChargeId] = useState<string | null>(null)

  // ----- Refs -----
  const seenIdsRef = useRef<Set<string>>(new Set())
  const pollingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const isFirstFetchRef = useRef(true)

  // ============================================================
  // Effet : au montage, si staffTag ressemble à un numéro de tél,
  // on pré-remplit le champ téléphone.
  // ============================================================
  useEffect(() => {
    if (staffTag && staffTag.startsWith('+')) {
      setPhoneInput(staffTag)
    }
  }, [staffTag])

  // ============================================================
  // Fetch requests : interroge les 3 statuts en parallèle.
  // Renvoie les listes pending/in_progress/done + feed fusionné.
  // ============================================================
  const fetchRequests = useCallback(
    async (opts?: { silent?: boolean }): Promise<void> => {
      const silent = opts?.silent ?? true
      if (!silent) setFeedLoading(true)
      try {
        const [pRes, ipRes, dRes] = await Promise.all([
          fetch('/api/vip/requests?status=pending', {
            credentials: 'include',
          }).then((r) => r.json()),
          fetch('/api/vip/requests?status=in_progress', {
            credentials: 'include',
          }).then((r) => r.json()),
          fetch('/api/vip/requests?status=done', {
            credentials: 'include',
          }).then((r) => r.json()),
        ])

        const pending: VipRequest[] =
          pRes && pRes.ok && Array.isArray(pRes.data) ? pRes.data : []
        const inProgress: VipRequest[] =
          ipRes && ipRes.ok && Array.isArray(ipRes.data) ? ipRes.data : []
        const done: VipRequest[] =
          dRes && dRes.ok && Array.isArray(dRes.data) ? dRes.data : []

        // Feed = pending + in_progress, tri DESC createdAt.
        const merged = [...pending, ...inProgress].sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        )

        // Détection nouveaux incidents (uniquement après le 1er fetch).
        if (!isFirstFetchRef.current) {
          const knownIds = seenIdsRef.current
          let hasNew = false
          for (const r of pending) {
            if (!knownIds.has(r.id)) {
              hasNew = true
              knownIds.add(r.id)
            }
          }
          if (hasNew) playDing()
        } else {
          // 1er fetch : on initialise seenIds sans ding.
          for (const r of merged) seenIdsRef.current.add(r.id)
          isFirstFetchRef.current = false
        }

        // On nettoie seenIds des ids qui ne sont plus actifs (zone mémoire).
        const activeIds = new Set(merged.map((r) => r.id))
        for (const id of Array.from(seenIdsRef.current)) {
          if (!activeIds.has(id)) seenIdsRef.current.delete(id)
        }

        setRequests(merged)
        setCountPending(pending.length)
        setCountInProgress(inProgress.length)
        setCountDone(done.length)
        setLastPollAt(Date.now())
      } catch {
        if (!silent) {
          toast({
            title: 'Feed indisponible',
            description: 'Impossible de rafraîchir les demandes.',
            variant: 'destructive',
          })
        }
      } finally {
        if (!silent) setFeedLoading(false)
      }
    },
    [toast],
  )

  // ============================================================
  // Effet : quand on entre sur l'écran feed, on lance un fetch
  // immédiat + un polling toutes les 10 s. On nettoie au logout.
  // ============================================================
  useEffect(() => {
    if (screen !== 'feed') return
    // reset du seenIds à chaque entrée feed pour ne pas déclencher
    // un ding pour les incidents déjà connus juste avant.
    isFirstFetchRef.current = true
    seenIdsRef.current = new Set()
    fetchRequests({ silent: false })

    pollingTimerRef.current = setInterval(() => {
      fetchRequests({ silent: true })
    }, 10000)

    return () => {
      if (pollingTimerRef.current) {
        clearInterval(pollingTimerRef.current)
        pollingTimerRef.current = null
      }
    }
  }, [screen, fetchRequests])

  // ============================================================
  // Handlers
  // ============================================================

  // ============================================================
  // Login Tél+PIN — POST /api/vip/auth-pin { phone, pin }
  // ============================================================
  async function handleLogin() {
    setLoginError(null)
    const phone = phoneInput.trim()
    const pin = pinInput.trim()
    if (!phone || !pin) {
      setLoginError('Numéro de téléphone et PIN requis.')
      return
    }
    if (pin.length !== 4) {
      setLoginError('Le PIN doit comporter 4 chiffres.')
      return
    }
    setLoginBusy(true)
    try {
      const res = await fetch('/api/vip/auth-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, pin }),
      })
      const json = await res.json()
      if (!res.ok || !json?.ok) {
        const msg = json?.error || "Erreur d'authentification."
        setLoginError(msg)
        if (res.status === 423) {
          // Compte verrouillé
          setPinInput('')
        }
        return
      }
      const d = json.data
      const staff: VipStaffMember = {
        id: d.id,
        name: d.name,
        role: d.role,
        emoji: '👤',
      }
      setCurrentStaff(staff)
      setScreen('briefing')
      setPhoneInput('')
      setPinInput('')
      toast({
        title: `Bienvenue, ${staff.name}`,
        description: `${staff.role} · Service discret.`,
      })
    } catch {
      setLoginError('Erreur réseau. Vérifiez votre connexion.')
    } finally {
      setLoginBusy(false)
    }
  }

  function handleLogout() {
    if (pollingTimerRef.current) {
      clearInterval(pollingTimerRef.current)
      pollingTimerRef.current = null
    }
    setCurrentStaff(null)
    setRequests([])
    setCountPending(0)
    setCountInProgress(0)
    setCountDone(0)
    seenIdsRef.current = new Set()
    isFirstFetchRef.current = true
    setScreen('login')
    onExit?.()
  }

  async function handleTakeCharge(req: VipRequest) {
    if (!currentStaff) return
    setTakingChargeId(req.id)
    try {
      const res = await fetch('/api/vip/staff-scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          requestId: req.id,
          action: 'TAKE_CHARGE',
          staffId: currentStaff.id,
          staffName: currentStaff.name,
        }),
      })
      const body = await res.json()
      if (!res.ok || !body?.ok) {
        throw new Error(body?.error || 'Erreur serveur')
      }
      toast({
        title: 'Pris en charge',
        description: `#${req.trackingNumber || req.id.slice(0, 6)} — ${currentStaff.name}`,
      })
      await fetchRequests({ silent: true })
    } catch (e) {
      toast({
        title: 'Échec prise en charge',
        description:
          e instanceof Error ? e.message : 'Réessayez dans un instant.',
        variant: 'destructive',
      })
    } finally {
      setTakingChargeId(null)
    }
  }

  function handleOpenResolve(req: VipRequest) {
    setResolveTarget(req)
    setResolveComment('')
    setScreen('resolve-confirm')
  }

  function handleCancelResolve() {
    setResolveTarget(null)
    setResolveComment('')
    setScreen('feed')
  }

  async function handleConfirmResolve() {
    if (!resolveTarget || !currentStaff) return
    setResolveBusy(true)
    try {
      const res = await fetch('/api/vip/staff-scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          requestId: resolveTarget.id,
          action: 'RESOLVE',
          staffId: currentStaff.id,
          staffName: currentStaff.name,
        }),
      })
      const body = await res.json()
      if (!res.ok || !body?.ok) {
        throw new Error(body?.error || 'Erreur serveur')
      }
      toast({
        title: 'Résolution confirmée',
        description: `#${resolveTarget.trackingNumber || resolveTarget.id.slice(0, 6)} clôturé ✨`,
      })
      setResolveTarget(null)
      setResolveComment('')
      setScreen('feed')
      await fetchRequests({ silent: true })
    } catch (e) {
      toast({
        title: 'Échec résolution',
        description:
          e instanceof Error ? e.message : 'Réessayez dans un instant.',
        variant: 'destructive',
      })
    } finally {
      setResolveBusy(false)
    }
  }

  function handleManualRefresh() {
    fetchRequests({ silent: false })
  }

  // ============================================================
  // Renders
  // ============================================================

  // ----- En-tête global (header commun aux 3 écrans) -----
  function renderHeader() {
    if (screen === 'login') {
      return (
        <header className="text-center px-6 pt-10 pb-6">
          <div className="text-3xl mb-2" aria-hidden>
            🥂
          </div>
          <h1
            className="text-xl tracking-[0.18em] text-[#2C2C2C]"
            style={{ fontFamily: 'Georgia, "Playfair Display", serif' }}
          >
            SALON VIP · STAFF
          </h1>
          <p className="text-sm text-[#8B6F47] mt-1">
            Sélectionnez votre profil
          </p>
        </header>
      )
    }
    if (screen === 'feed' && currentStaff) {
      return (
        <header className="px-5 pt-6 pb-4 border-b border-[#EAE5DC]">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-2xl" aria-hidden>
                  {currentStaff.emoji}
                </span>
                <div className="min-w-0">
                  <h2
                    className="text-lg leading-tight text-[#2C2C2C] truncate"
                    style={{ fontFamily: 'Georgia, "Playfair Display", serif' }}
                  >
                    Bonjour, {currentStaff.name}
                  </h2>
                  <p className="text-xs text-[#8B6F47] truncate">
                    {currentStaff.role}
                  </p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* Module 2 — Permissions par rôle : Récompenses uniquement pour manager + maitre_dhotel */}
              {(currentStaff.role === 'manager' || currentStaff.role === 'maitre_dhotel') && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setScreen('rewards')}
                  className="border-[#C9A961]/40 text-[#8B6F47] hover:bg-[#C9A961]/8 hover:text-[#8B6F47] gap-1.5"
                  title="Flash Rewards Premium"
                >
                  <Gift className="size-3.5" />
                  <span className="hidden xs:inline">Récompenses</span>
                </Button>
              )}
              {/* Module 2 — Lost & Found pour tous les rôles sauf barman */}
              {currentStaff.role !== 'barman' && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setScreen('lost-found')}
                  className="border-[#EAE5DC] text-[#8B6F47] hover:bg-[#FAFAF7] hover:text-[#2C2C2C] gap-1.5"
                  title="Objets trouvés"
                >
                  <Package className="size-3.5" />
                  <span className="hidden xs:inline">Objets trouvés</span>
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={handleLogout}
                className="border-[#EAE5DC] text-[#8B6F47] hover:bg-[#FAFAF7] hover:text-[#2C2C2C]"
              >
                <LogOut className="size-3.5" />
                Déconnexion
              </Button>
            </div>
          </div>
        </header>
      )
    }
    // resolve-confirm : header minimal
    return (
      <header className="px-5 pt-6 pb-2 border-b border-[#EAE5DC]">
        <button
          type="button"
          onClick={handleCancelResolve}
          className="inline-flex items-center gap-1.5 text-sm text-[#8B6F47] hover:text-[#2C2C2C] transition-colors"
        >
          <ArrowLeft className="size-4" />
          Retour au feed
        </button>
      </header>
    )
  }

  // ----- Écran 1 : LOGIN Tél+PIN (Module 1 — Cockpit Manager) -----
  function renderLogin() {
    return (
      <div className="px-6 pb-10">
        <div className="bg-white rounded-2xl border border-[#EAE5DC] shadow-[0_4px_20px_rgba(201,169,97,0.06)] p-5">
          {/* Numéro de téléphone */}
          <label
            className="block text-xs font-medium uppercase tracking-wider text-[#8B6F47] mb-2"
            htmlFor="vip-staff-phone"
          >
            Numéro de téléphone
          </label>
          <input
            id="vip-staff-phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="+221 77 000 00 01"
            value={phoneInput}
            onChange={(e) => setPhoneInput(e.target.value)}
            className="w-full h-11 rounded-md border border-[#EAE5DC] bg-[#FAFAF7] px-3 text-sm text-[#2C2C2C] placeholder:text-[#8B6F47]/40 focus:border-[#C9A961] focus:outline-none focus:ring-2 focus:ring-[#C9A961]/20"
            disabled={loginBusy}
          />

          {/* PIN 4 chiffres */}
          <label
            className="block text-xs font-medium uppercase tracking-wider text-[#8B6F47] mb-2 mt-4"
            htmlFor="vip-staff-pin"
          >
            PIN (4 chiffres)
          </label>
          <input
            id="vip-staff-pin"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            maxLength={4}
            placeholder="••••"
            value={pinInput}
            onChange={(e) => {
              const v = e.target.value.replace(/\D/g, '').slice(0, 4)
              setPinInput(v)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && phoneInput && pinInput.length === 4) {
                handleLogin()
              }
            }}
            className="w-full h-11 rounded-md border border-[#EAE5DC] bg-[#FAFAF7] px-3 text-center text-lg font-mono tracking-[0.5em] text-[#2C2C2C] placeholder:text-[#8B6F47]/40 focus:border-[#C9A961] focus:outline-none focus:ring-2 focus:ring-[#C9A961]/20"
            disabled={loginBusy}
          />

          {/* Erreur */}
          {loginError && (
            <div className="mt-3 rounded-md border border-[#C97B63]/30 bg-[#C97B63]/8 px-3 py-2 text-xs text-[#C97B63]">
              {loginError}
            </div>
          )}

          {/* Bouton connexion */}
          <Button
            onClick={handleLogin}
            disabled={loginBusy || !phoneInput.trim() || pinInput.length !== 4}
            className="mt-5 w-full h-11 rounded-md text-sm font-semibold tracking-wide"
            style={{
              backgroundColor: '#C9A961',
              color: '#FFFFFF',
              boxShadow: '0 4px 14px rgba(201,169,97,0.25)',
            }}
          >
            {loginBusy ? (
              <>
                <Loader2 className="size-4 animate-spin mr-2" />
                Connexion…
              </>
            ) : (
              '🔗 SE CONNECTER'
            )}
          </Button>

          {/* Aide — comptes démo */}
          <div className="mt-4 rounded-md bg-[#FAFAF7] border border-[#EAE5DC] px-3 py-2 text-[11px] text-[#8B6F47]/70">
            <p className="font-medium text-[#8B6F47] mb-1">Comptes démo :</p>
            <p>Amadou (Manager) — +221770000001 / PIN 1234</p>
            <p>Fatou (Concierge) — +221770000002 / PIN 1234</p>
          </div>
        </div>

        <p className="text-center text-xs text-[#8B6F47] mt-6 italic">
          Service discret — votre confort d'abord
        </p>
      </div>
    )
  }

  // ----- KPIs -----
  function renderKpis() {
    const kpis = [
      {
        label: 'EN ATTENTE',
        value: countPending,
        color: '#C9A961',
        bg: 'bg-amber-50',
      },
      {
        label: 'EN COURS',
        value: countInProgress,
        color: '#4A7C59',
        bg: 'bg-emerald-50',
      },
      {
        label: 'RÉSOLUS',
        value: countDone,
        color: '#6B4C9A',
        bg: 'bg-violet-50',
      },
    ]
    return (
      <div className="grid grid-cols-3 gap-2 px-5 py-3 border-b border-[#EAE5DC]">
        {kpis.map((k) => (
          <div
            key={k.label}
            className={cn(
              'rounded-lg border border-[#EAE5DC] px-2 py-2 text-center',
              k.bg,
            )}
          >
            <div
              className="text-xl font-semibold leading-none"
              style={{ color: k.color, fontFamily: 'Georgia, serif' }}
            >
              {k.value}
            </div>
            <div className="mt-1 text-[10px] font-medium tracking-wider text-[#8B6F47]">
              {k.label}
            </div>
          </div>
        ))}
      </div>
    )
  }

  // ----- Carte d'une demande -----
  function renderRequestCard(req: VipRequest) {
    const info = getTypeInfo(req.type)
    const IconCmp = TYPE_ICONS[req.type] || Bell
    const status = getStatusInfo(req.status)
    const isPending = req.status === 'pending'
    const isInProgress = req.status === 'in_progress'
    const takingCharge = takingChargeId === req.id

    return (
      <article
        key={req.id}
        className="bg-white rounded-xl border border-[#EAE5DC] shadow-[0_4px_20px_rgba(201,169,97,0.06)] p-4"
      >
        {/* Ligne titre */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2 min-w-0">
            <span className="text-xl mt-0.5" aria-hidden>
              {info.emoji}
            </span>
            <div className="min-w-0">
              <h3
                className="text-sm font-semibold text-[#2C2C2C] leading-snug truncate"
                style={{ fontFamily: 'Georgia, serif' }}
              >
                {info.label}
              </h3>
              <p className="text-xs text-[#8B6F47] mt-0.5">
                {req.trackingNumber
                  ? `#${req.trackingNumber}`
                  : `#${req.id.slice(0, 8)}`}{' '}
                · Table {req.table.tableNumber}
              </p>
            </div>
          </div>
          <Badge
            variant="outline"
            className={cn(
              'shrink-0 text-[10px] font-medium border',
              status.color,
            )}
          >
            {status.label}
          </Badge>
        </div>

        {/* Description */}
        <p className="mt-3 text-sm text-[#2C2C2C] leading-relaxed line-clamp-3">
          “{describeRequest(req)}”
        </p>

        {/* Méta zone + temps */}
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[#8B6F47]">
          <span className="inline-flex items-center gap-1">
            <IconCmp className="size-3" />
            {getZoneLabel(req.table.zone)}
          </span>
          <span aria-hidden>·</span>
          <span>{formatElapsed(req.createdAt)}</span>
          {req.table.clientName && (
            <>
              <span aria-hidden>·</span>
              <span className="text-[#6B4C9A]">
                {req.table.clientName}
                {req.table.clientVipLevel
                  ? ` · ${req.table.clientVipLevel}`
                  : ''}
              </span>
            </>
          )}
        </div>

        {/* Si prise en charge par un collègue, on l'affiche */}
        {isInProgress && req.staffName && (
          <div className="mt-2 text-[11px] text-[#4A7C59] bg-emerald-50 border border-emerald-200 rounded-md px-2 py-1">
            Pris en charge par{' '}
            <span className="font-semibold">{req.staffName}</span>
          </div>
        )}

        {/* Actions */}
        <div className="mt-3 flex items-center gap-2">
          {isPending && (
            <Button
              size="sm"
              onClick={() => handleTakeCharge(req)}
              disabled={takingCharge}
              className="h-8 text-xs font-medium border-[#EAE5DC] text-[#2C2C2C] bg-white hover:bg-[#FAFAF7]"
              variant="outline"
            >
              {takingCharge ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Check className="size-3.5" />
              )}
              PRENDRE EN CHARGE
            </Button>
          )}
          <Button
            size="sm"
            onClick={() => handleOpenResolve(req)}
            disabled={takingCharge}
            className="h-8 text-xs font-semibold"
            style={{
              backgroundColor: isPending ? '#C9A961' : '#4A7C59',
              color: '#FFFFFF',
            }}
          >
            <Check className="size-3.5" />
            RÉSOUDRE
          </Button>
        </div>
      </article>
    )
  }

  // ----- Écran 2 : FEED -----
  function renderFeed() {
    const empty = requests.length === 0
    return (
      <div className="flex flex-col h-full">
        {renderKpis()}

        {/* Alerte Maître d'Hôtel — détection VIP, visuelle uniquement (discrétion) */}
        <div className="px-5 pt-3">
          <VipGuestAlertBanner />
        </div>

        {/* Bandeau feed + refresh */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[#EAE5DC]">
          <div className="flex items-center gap-2">
            <Bell className="size-4 text-[#C9A961]" />
            <h3
              className="text-sm font-semibold tracking-wide text-[#2C2C2C]"
              style={{ fontFamily: 'Georgia, serif' }}
            >
              FEED TEMPS RÉEL
            </h3>
            {lastPollAt && (
              <span className="text-[10px] text-[#8B6F47]">
                · MAJ {new Date(lastPollAt).toLocaleTimeString('fr-FR')}
              </span>
            )}
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={handleManualRefresh}
            disabled={feedLoading}
            className="h-7 px-2 text-[#8B6F47] hover:text-[#2C2C2C] hover:bg-[#FAFAF7]"
          >
            <RefreshCw
              className={cn('size-3.5', feedLoading && 'animate-spin')}
            />
            <span className="text-xs">Rafraîchir</span>
          </Button>
        </div>

        {/* Liste */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3 bg-[#FAFAF7]">
          {feedLoading && empty ? (
            <div className="flex flex-col items-center justify-center py-16 text-[#8B6F47]">
              <Loader2 className="size-6 animate-spin mb-3" />
              <p className="text-sm">Chargement des demandes…</p>
            </div>
          ) : empty ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div
                className="text-3xl mb-3"
                aria-hidden
                style={{ filter: 'saturate(0.9)' }}
              >
                ✨
              </div>
              <p
                className="text-base text-[#2C2C2C]"
                style={{ fontFamily: 'Georgia, serif' }}
              >
                Tout est sous contrôle
              </p>
              <p className="text-xs text-[#8B6F47] mt-1">
                Aucune demande en attente.
              </p>
            </div>
          ) : (
            requests.map(renderRequestCard)
          )}

          {/* Footer pédale */}
          <p className="text-center text-[10px] text-[#8B6F47] pt-4 pb-2">
            Polling automatique toutes les 10 s · Salon VIP
          </p>
        </div>
      </div>
    )
  }

  // ----- Écran 3 : RESOLVE CONFIRM -----
  function renderResolveConfirm() {
    if (!resolveTarget) return null
    const info = getTypeInfo(resolveTarget.type)
    return (
      <div className="px-5 py-6 flex flex-col h-full">
        <div className="text-center mb-5">
          <div
            className="mx-auto mb-3 size-12 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center"
            aria-hidden
          >
            <Check className="size-6 text-[#4A7C59]" />
          </div>
          <h2
            className="text-lg text-[#2C2C2C] tracking-wide"
            style={{ fontFamily: 'Georgia, "Playfair Display", serif' }}
          >
            CONFIRMER LA RÉSOLUTION
          </h2>
        </div>

        <div className="bg-white rounded-2xl border border-[#EAE5DC] shadow-[0_4px_20px_rgba(201,169,97,0.06)] p-5">
          {/* Récap demande */}
          <div className="flex items-start gap-3">
            <span className="text-2xl" aria-hidden>
              {info.emoji}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[#2C2C2C]">
                {info.label}
              </p>
              <p className="text-xs text-[#8B6F47] mt-0.5">
                {resolveTarget.trackingNumber
                  ? `#${resolveTarget.trackingNumber}`
                  : `#${resolveTarget.id.slice(0, 8)}`}{' '}
                · Table {resolveTarget.table.tableNumber}
              </p>
            </div>
          </div>

          {/* Détails */}
          <div className="mt-4 space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-[#8B6F47]">Zone</span>
              <span className="text-[#2C2C2C] font-medium">
                {getZoneLabel(resolveTarget.table.zone)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[#8B6F47]">Signalé</span>
              <span className="text-[#2C2C2C] font-medium">
                il y a {elapsedMinutes(resolveTarget.createdAt)} min
              </span>
            </div>
            {resolveTarget.staffName && (
              <div className="flex items-center justify-between">
                <span className="text-[#8B6F47]">Pris en charge par</span>
                <span className="text-[#2C2C2C] font-medium">
                  {resolveTarget.staffName}
                </span>
              </div>
            )}
          </div>

          {resolveTarget.message && (
            <div className="mt-4 text-sm text-[#2C2C2C] bg-[#FAFAF7] border border-[#EAE5DC] rounded-md p-3 italic">
              “{resolveTarget.message}”
            </div>
          )}

          {/* Commentaire optionnel */}
          <div className="mt-5">
            <label
              htmlFor="vip-resolve-comment"
              className="block text-xs font-medium uppercase tracking-wider text-[#8B6F47] mb-2"
            >
              Commentaire (optionnel)
            </label>
            <Textarea
              id="vip-resolve-comment"
              value={resolveComment}
              onChange={(e) => setResolveComment(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="Ex : Client satisfait, ajustement effectué…"
              className="border-[#EAE5DC] bg-[#FAFAF7] text-[#2C2C2C] resize-none focus-visible:border-[#C9A961] focus-visible:ring-[#C9A961]/20"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="mt-6 flex items-center gap-3">
          <Button
            variant="outline"
            onClick={handleCancelResolve}
            disabled={resolveBusy}
            className="flex-1 h-11 border-[#EAE5DC] text-[#8B6F47] hover:bg-[#FAFAF7] hover:text-[#2C2C2C]"
          >
            <X className="size-4" />
            ANNULER
          </Button>
          <Button
            onClick={handleConfirmResolve}
            disabled={resolveBusy}
            className="flex-1 h-11 text-sm font-semibold"
            style={{
              backgroundColor: '#4A7C59',
              color: '#FFFFFF',
              boxShadow: '0 4px 14px rgba(74,124,89,0.25)',
            }}
          >
            {resolveBusy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Check className="size-4" />
            )}
            CONFIRMER RÉSOLUTION
          </Button>
        </div>
      </div>
    )
  }

  // ============================================================
  // Render racine
  // ============================================================
  return (
    <div
      className="min-h-screen w-full flex flex-col items-stretch"
      style={{ backgroundColor: '#FAFAF7' }}
    >
      {/* Conteneur mobile-first centré (max 480px) */}
      <div className="mx-auto w-full max-w-[480px] min-h-screen flex flex-col bg-[#FAFAF7] shadow-[0_0_40px_rgba(0,0,0,0.04)]">
        {renderHeader()}
        <main className="flex-1 flex flex-col">
          {screen === 'login' && renderLogin()}
          {screen === 'briefing' && currentStaff && (
            <VipBriefing
              staffName={currentStaff.name}
              staffRole={currentStaff.role}
              onDismiss={() => setScreen('feed')}
            />
          )}
          {screen === 'feed' && renderFeed()}
          {screen === 'resolve-confirm' && renderResolveConfirm()}
          {screen === 'lost-found' && currentStaff && (
            <div className="px-5 py-4">
              <div className="mb-4 flex items-center justify-between">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setScreen('feed')}
                  className="gap-2 border-[#EAE5DC] bg-white text-[#8B6F47]"
                >
                  <ArrowLeft className="h-4 w-4" /> Retour au feed
                </Button>
              </div>
              <VipLostFound staffName={currentStaff.name} />
            </div>
          )}
          {screen === 'rewards' && currentStaff && (
            <div className="px-5 py-4">
              <div className="mb-4 flex items-center justify-between">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setScreen('feed')}
                  className="gap-2 border-[#EAE5DC] bg-white text-[#8B6F47]"
                >
                  <ArrowLeft className="h-4 w-4" /> Retour au feed
                </Button>
              </div>
              <VipFlashRewards staffName={currentStaff.name} staffRole={currentStaff.role} />
            </div>
          )}
        </main>
      </div>
    </div>
  )
}

export default VipStaffView
