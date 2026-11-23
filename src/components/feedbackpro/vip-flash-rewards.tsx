'use client'

// ============================================================
// <VipFlashRewards /> — Module 10 · Flash Rewards Premium
// ------------------------------------------------------------
// Vue STAFF (concierge VIP). Permet à un membre du personnel
// d'offrir une récompense de luxe (coupe champagne, upgrade
// suite, massage…) à un client en 1 clic — le geste de
// réparation VIP par excellence.
//
// Fonctionnalités :
//   • Header « Luxe Lumineux » : 🎁 Flash Rewards Premium
//   • Grille des récompenses premium (GET /api/vip/premium-rewards)
//     — chaque carte : emoji, titre, description, coût (FCFA),
//       bouton « OFFRIR » (or).
//   • Dialog d'offre :
//       - récompense sélectionnée (aperçu)
//       - n° de table (requis)
//       - nom client (optionnel)
//       - select de déclencheur :
//           Manuel / VIP mécontent résolu / Incident traité
//           rapidement / Séjour prolongé / Anniversaire
//       - bouton « CONFIRMER L'OFFRE » → POST
//         /api/vip/premium-rewards
//   • Écran de confirmation : « Récompense offerte ✓ »
//     + « 🥂 {titre} offert à Table T-XX »
//     + notification (toast + message inline)
//   • Section « Attributions récentes » :
//     - GET /api/vip/reward-grants?staffName=xxx
//     - liste (emoji + titre + table + client + déclencheur +
//       horodatage relatif)
//   • Polling 30 s de l'historique (rafraîchit après chaque offre).
//
// Palette « Luxe Lumineux » :
//   - Background   #ffffff    - Cards  #FFFFFF + shadow gold 6%
//   - Gold         #bc7155    - Bronze #8B6F47
//   - Text         #2C2C2C    - Success #bc7155
//   - Alert        #bc7155    - VIP     #bc7155
//   - Border       #efe7e0    - Title font Georgia / Playfair
//
// APIs consommées :
//   GET  /api/vip/premium-rewards
//        → { ok, data: [{ id, title, description, emoji,
//                          costFcfa, active, createdAt,
//                          updatedAt }] }
//   POST /api/vip/premium-rewards
//        body: { rewardId, tableNumber?, clientName?,
//                staffName, triggeredBy }
//        → { ok, data: { id, rewardId, rewardTitle,
//                         rewardEmoji, …, deliveredAt,
//                         createdAt } }
//   GET  /api/vip/reward-grants?staffName=xxx
//        → { ok, data: [{ id, rewardTitle, rewardEmoji,
//                          tableNumber, clientName, staffName,
//                          triggeredBy, deliveredAt, createdAt }] }
// ============================================================

import { useCallback, useEffect, useState } from 'react'
import { Gift, Check, Loader2, ArrowLeft, History, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'

// ============================================================
// Types — miroir des réponses API
// ============================================================

interface PremiumReward {
  id: string
  title: string
  description: string
  emoji: string
  costFcfa: number
  active: boolean
  createdAt?: string
  updatedAt?: string
}

interface RewardGrant {
  id: string
  rewardId?: string
  rewardTitle: string | null
  rewardEmoji: string | null
  tableNumber: string | null
  clientName: string | null
  staffName: string
  triggeredBy: string
  deliveredAt: string | null
  createdAt: string
}

interface GrantResult {
  id: string
  rewardId?: string
  rewardTitle: string
  rewardEmoji: string
  rewardDescription?: string
  rewardCostFcfa?: number
  tableNumber: string | null
  clientName: string | null
  staffName: string
  triggeredBy: string
  deliveredAt: string | null
  createdAt: string
}

// ============================================================
// Constantes & helpers
// ============================================================

const TITLE_FONT = {
  fontFamily: 'Georgia, "Playfair Display", serif',
} as const

const CARD_SHADOW = 'shadow-[0_4px_20px_rgba(201,169,97,0.06)]'

const POLL_INTERVAL_MS = 30_000

// Couleurs palette « Luxe Lumineux »
const GOLD = '#bc7155'
const BRONZE = '#8B6F47'
const TEXT = '#2C2C2C'
const SUCCESS = '#bc7155'
const ALERT = '#bc7155'
const VIP = '#bc7155'
const BG = '#ffffff'
const BORDER = '#efe7e0'

// Déclencheurs d'offre (libellé FR → clé API).
// La clé est envoyée telle-quelle au POST ; le serveur l'enregistre
// dans RewardGrant.triggeredBy (varchar 40, défaut "manual").
const TRIGGER_OPTIONS: Array<{ value: string; label: string; hint?: string }> = [
  {
    value: 'manual',
    label: 'Manuel',
    hint: 'Geste spontané du concierge',
  },
  {
    value: 'vip_discontent_resolved',
    label: 'VIP mécontent résolu',
    hint: 'Client apaisé après intervention',
  },
  {
    value: 'incident_quick_resolution',
    label: 'Incident traité rapidement',
    hint: 'SLA respecté, geste de remerciement',
  },
  {
    value: 'stay_extended',
    label: 'Séjour prolongé',
    hint: 'Le client reste plus longtemps',
  },
  {
    value: 'birthday',
    label: 'Anniversaire',
    hint: 'Une attention personnalisée',
  },
]

/** Trouve le libellé FR d'un déclencheur à partir de sa clé API. */
function triggerLabel(value: string): string {
  const found = TRIGGER_OPTIONS.find((o) => o.value === value)
  return found ? found.label : value || 'Manuel'
}

/**
 * Normalise un n° de table saisi par le staff.
 *   "12"      → "T-12"
 *   "T-12"    → "T-12"
 *   "table 12"→ "T-12"
 *   ""        → ""
 */
function normalizeTable(raw: string): string {
  const trimmed = (raw ?? '').trim()
  if (!trimmed) return ''
  // Si déjà préfixé « T- » ou « T » on garde tel quel (normalisé).
  const cleaned = trimmed.replace(/^table\s*/i, '').trim()
  if (/^T-?/i.test(cleaned)) {
    return cleaned.replace(/^T-?/i, 'T-')
  }
  return `T-${cleaned}`
}

/** Formate un montant FCFA : 8000 → « 8 000 FCFA ». */
function formatFcfa(amount: number): string {
  const n = Number.isFinite(amount) ? amount : 0
  return `${n.toLocaleString('fr-FR').replace(/\u202f/g, ' ')} FCFA`
}

/** Formate un horodatage ISO en horloge HH:MM locale (fr-FR). */
function formatTime(iso: string | null): string {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return '—'
    return d.toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return '—'
  }
}

/** Renvoie un libellé relatif : « à l'instant », « il y a 5 min », etc. */
function relativeTime(iso: string | null): string {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return '—'
    const diffMs = Date.now() - d.getTime()
    const sec = Math.floor(diffMs / 1000)
    if (sec < 45) return "à l'instant"
    if (sec < 90) return 'il y a 1 min'
    const min = Math.floor(sec / 60)
    if (min < 60) return `il y a ${min} min`
    const h = Math.floor(min / 60)
    if (h < 24) return `il y a ${h} h`
    const days = Math.floor(h / 24)
    if (days === 1) return 'hier'
    if (days < 7) return `il y a ${days} j`
    return d.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
    })
  } catch {
    return '—'
  }
}

// ============================================================
// Composant principal
// ============================================================

export function VipFlashRewards({
  staffName,
  staffRole,
}: {
  staffName: string
  staffRole: string
}) {
  const { toast } = useToast()

  // ----- États -----
  const [rewards, setRewards] = useState<PremiumReward[]>([])
  const [rewardsLoading, setRewardsLoading] = useState(true)
  const [rewardsError, setRewardsError] = useState<string | null>(null)

  const [grants, setGrants] = useState<RewardGrant[]>([])
  const [grantsLoading, setGrantsLoading] = useState(true)

  // Récompense actuellement sélectionnée pour ouverture du dialog.
  const [selected, setSelected] = useState<PremiumReward | null>(null)

  // Formulaire du dialog
  const [tableInput, setTableInput] = useState('')
  const [clientName, setClientName] = useState('')
  const [triggeredBy, setTriggeredBy] = useState<string>('manual')
  const [submitting, setSubmitting] = useState(false)
  const [tableTouched, setTableTouched] = useState(false)

  // Confirmation post-offre
  const [confirmation, setConfirmation] = useState<{
    reward: PremiumReward
    tableLabel: string
    clientName: string | null
    triggeredBy: string
    grantId: string
    notification: string
  } | null>(null)

  // ----- Validation -----
  const tableValid = normalizeTable(tableInput).length > 0
  const formValid = tableValid && !submitting

  // ----- Fetch récompenses -----
  const fetchRewards = useCallback(async () => {
    try {
      setRewardsError(null)
      const res = await fetch('/api/vip/premium-rewards', {
        method: 'GET',
        cache: 'no-store',
      })
      const json = (await res.json()) as { ok: boolean; data?: PremiumReward[] }
      if (!res.ok || !json.ok || !Array.isArray(json.data)) {
        throw new Error('Réponse invalide')
      }
      // On n'affiche que les actives (sécurité : l'API filtre déjà).
      setRewards(json.data.filter((r) => r.active))
    } catch (err) {
      console.error('[VipFlashRewards] fetch rewards error:', err)
      setRewardsError('Impossible de charger les récompenses.')
    } finally {
      setRewardsLoading(false)
    }
  }, [])

  // ----- Fetch historique (attribution du staff) -----
  const fetchGrants = useCallback(
    async (silent = true) => {
      try {
        if (!silent) setGrantsLoading(true)
        const params = new URLSearchParams({
          staffName: staffName.slice(0, 80),
        })
        const res = await fetch(
          `/api/vip/reward-grants?${params.toString()}`,
          { method: 'GET', cache: 'no-store' },
        )
        const json = (await res.json()) as { ok: boolean; data?: RewardGrant[] }
        if (!res.ok || !json.ok || !Array.isArray(json.data)) {
          throw new Error('Réponse invalide')
        }
        setGrants(json.data)
      } catch (err) {
        console.error('[VipFlashRewards] fetch grants error:', err)
        // Silencieux : on ne notifie pas l'utilisateur pour l'historique.
      } finally {
        setGrantsLoading(false)
      }
    },
    [staffName],
  )

  // ----- Effets : chargements initiaux + polling -----
  useEffect(() => {
    void fetchRewards()
  }, [fetchRewards])

  useEffect(() => {
    void fetchGrants(false)
  }, [fetchGrants])

  // Polling 30s de l'historique (rafraîchit aussi après confirmation).
  useEffect(() => {
    const id = setInterval(() => {
      void fetchGrants(true)
    }, POLL_INTERVAL_MS)
    return () => clearInterval(id)
  }, [fetchGrants])

  // Fermeture du dialog (Échap géré par Radix via onOpenChange).
  const openDialog = selected !== null && confirmation === null
  const openConfirmation = confirmation !== null

  // ----- Handlers -----
  function handleOpenReward(reward: PremiumReward) {
    setSelected(reward)
    setTableInput('')
    setClientName('')
    setTriggeredBy('manual')
    setTableTouched(false)
    setConfirmation(null)
  }

  function handleCloseDialog(open: boolean) {
    if (!open) {
      // On ne reset PAS `selected` ici si on est en train de confirmer,
      // mais on le fait si l'utilisateur ferme manuellement.
      setSelected(null)
      setConfirmation(null)
    }
  }

  async function handleSubmitOffer(e: React.FormEvent) {
    e.preventDefault()
    if (!selected) return
    setTableTouched(true)
    if (!tableValid) return

    const tableLabel = normalizeTable(tableInput)
    const payload = {
      rewardId: selected.id,
      tableNumber: tableLabel,
      clientName: clientName.trim() || null,
      staffName: staffName.slice(0, 80),
      triggeredBy: triggeredBy || 'manual',
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/vip/premium-rewards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = (await res.json()) as { ok: boolean; data?: GrantResult }
      if (!res.ok || !json.ok || !json.data) {
        throw new Error('Réponse invalide')
      }

      // Message de notification (sens métier)
      const notif = buildNotificationMessage({
        reward: selected,
        tableLabel,
        clientName: clientName.trim() || null,
        triggeredBy,
      })

      setConfirmation({
        reward: selected,
        tableLabel,
        clientName: clientName.trim() || null,
        triggeredBy,
        grantId: json.data.id,
        notification: notif,
      })

      toast({
        title: 'Récompense offerte ✓',
        description: notif,
      })

      // Rafraîchir l'historique immédiatement
      void fetchGrants(true)
    } catch (err) {
      console.error('[VipFlashRewards] submit offer error:', err)
      toast({
        title: "Échec de l'offre",
        description:
          "La récompense n'a pas pu être enregistrée. Réessayez.",
        variant: 'destructive',
      })
    } finally {
      setSubmitting(false)
    }
  }

  function handleOfferAnother() {
    setSelected(null)
    setConfirmation(null)
    setTableInput('')
    setClientName('')
    setTriggeredBy('manual')
    setTableTouched(false)
  }

  // ============================================================
  // Rendu
  // ============================================================

  return (
    <section
      className="min-h-screen w-full px-4 py-6 sm:px-6 sm:py-8"
      style={{ backgroundColor: BG }}
      aria-labelledby="flash-rewards-title"
    >
      <div className="mx-auto max-w-6xl">
        {/* ===================== Header ===================== */}
        <header className="mb-6 flex flex-col gap-3 sm:mb-8 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div
              className="flex size-12 shrink-0 items-center justify-center rounded-full ring-1 ring-[#efe7e0]"
              style={{ backgroundColor: '#FFFFFF' }}
              aria-hidden
            >
              <Gift className="size-6" style={{ color: GOLD }} />
            </div>
            <div>
              <h1
                id="flash-rewards-title"
                className="text-2xl leading-tight text-[#2C2C2C] sm:text-3xl"
                style={TITLE_FONT}
              >
                🎁 Flash Rewards Premium
              </h1>
              <p className="mt-1 text-sm text-[#8B6F47]">
                Offrir un moment d&apos;exception
              </p>
            </div>
          </div>
          <div className="flex flex-col items-start gap-1 sm:items-end">
            <span
              className="text-[11px] uppercase tracking-wider text-[#8B6F47]"
            >
              Concierge
            </span>
            <span
              className="text-sm font-semibold text-[#2C2C2C]"
              style={TITLE_FONT}
            >
              {staffName || '—'}
            </span>
            <span className="text-[11px] text-[#8B6F47]">
              {staffRole || '—'}
            </span>
          </div>
        </header>

        {/* ===================== Grille récompenses ===================== */}
        <section aria-labelledby="rewards-grid-title" className="mb-8">
          <div className="mb-3 flex items-center justify-between">
            <h2
              id="rewards-grid-title"
              className="text-lg text-[#2C2C2C]"
              style={TITLE_FONT}
            >
              Catalogue Premium
            </h2>
            {rewards.length > 0 && (
              <span className="text-xs text-[#8B6F47]">
                {rewards.length}{' '}
                {rewards.length > 1 ? 'récompenses' : 'récompense'}
              </span>
            )}
          </div>

          {/* États : loading / error / empty / grid */}
          {rewardsLoading ? (
            <RewardsSkeleton />
          ) : rewardsError ? (
            <div
              className="rounded-xl border border-[#efe7e0] bg-white p-6 text-center"
              style={{ boxShadow: '0 4px 20px rgba(201,169,97,0.06)' }}
            >
              <p className="text-sm" style={{ color: ALERT }}>
                {rewardsError}
              </p>
              <Button
                variant="outline"
                className="mt-3"
                onClick={() => {
                  setRewardsLoading(true)
                  void fetchRewards()
                }}
              >
                Réessayer
              </Button>
            </div>
          ) : rewards.length === 0 ? (
            <div
              className="rounded-xl border border-dashed border-[#efe7e0] bg-white p-8 text-center"
              style={{ boxShadow: '0 4px 20px rgba(201,169,97,0.06)' }}
            >
              <Sparkles
                className="mx-auto size-8"
                style={{ color: BRONZE }}
                aria-hidden
              />
              <p className="mt-2 text-sm text-[#2C2C2C]">
                Aucune récompense premium active pour le moment.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {rewards.map((reward) => (
                <RewardCard
                  key={reward.id}
                  reward={reward}
                  onOffer={() => handleOpenReward(reward)}
                />
              ))}
            </div>
          )}
        </section>

        {/* ===================== Historique ===================== */}
        <section aria-labelledby="recent-grants-title">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <History className="size-5" style={{ color: BRONZE }} aria-hidden />
              <h2
                id="recent-grants-title"
                className="text-lg text-[#2C2C2C]"
                style={TITLE_FONT}
              >
                Attributions récentes
              </h2>
            </div>
            <button
              type="button"
              onClick={() => void fetchGrants(false)}
              className="text-xs font-medium text-[#8B6F47] underline-offset-2 hover:underline"
              aria-label="Rafraîchir l'historique"
            >
              Rafraîchir
            </button>
          </div>

          <div
            className="rounded-xl border border-[#efe7e0] bg-white"
            style={{ boxShadow: '0 4px 20px rgba(201,169,97,0.06)' }}
          >
            {grantsLoading ? (
              <GrantsSkeleton />
            ) : grants.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <p className="text-sm text-[#8B6F47]">
                  Aucune attribution récente à afficher.
                </p>
                <p className="mt-1 text-xs text-[#8B6F47]/80">
                  Offrez votre première récompense pour la voir apparaître ici.
                </p>
              </div>
            ) : (
              <ul role="list" className="divide-y divide-[#efe7e0]">
                {grants.map((g) => (
                  <GrantRow key={g.id} grant={g} />
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>

      {/* ===================== Dialog d'offre ===================== */}
      {openDialog && selected && (
        <OfferDialog
          reward={selected}
          staffName={staffName}
          tableInput={tableInput}
          setTableInput={setTableInput}
          tableTouched={tableTouched}
          setTableTouched={setTableTouched}
          tableValid={tableValid}
          clientName={clientName}
          setClientName={setClientName}
          triggeredBy={triggeredBy}
          setTriggeredBy={setTriggeredBy}
          submitting={submitting}
          formValid={formValid}
          onSubmit={handleSubmitOffer}
          onClose={handleCloseDialog}
        />
      )}

      {/* ===================== Confirmation ===================== */}
      {openConfirmation && confirmation && (
        <ConfirmationOverlay
          reward={confirmation.reward}
          tableLabel={confirmation.tableLabel}
          clientName={confirmation.clientName}
          triggeredBy={confirmation.triggeredBy}
          notification={confirmation.notification}
          onAnother={handleOfferAnother}
          onClose={() => handleCloseDialog(false)}
        />
      )}
    </section>
  )
}

// ============================================================
// Sous-composant : RewardCard
// ============================================================

interface RewardCardProps {
  reward: PremiumReward
  onOffer: () => void
}

function RewardCard({ reward, onOffer }: RewardCardProps) {
  const emoji = reward.emoji || '🎁'
  return (
    <article
      className={cn(
        'group flex flex-col rounded-xl border bg-white p-5 transition-all',
        'border-[#efe7e0]',
        'hover:border-[#bc7155]/40 hover:shadow-[0_8px_28px_rgba(201,169,97,0.10)]',
        CARD_SHADOW,
      )}
    >
      {/* Emoji + titre */}
      <div className="flex items-start gap-3">
        <div
          className={cn(
            'flex size-14 shrink-0 items-center justify-center rounded-full',
            'bg-[#ffffff] ring-2 ring-[#efe7e0]',
          )}
          aria-hidden
        >
          <span className="text-3xl leading-none">{emoji}</span>
        </div>
        <div className="min-w-0 flex-1">
          <h3
            className="truncate text-base leading-snug text-[#2C2C2C]"
            style={TITLE_FONT}
          >
            {reward.title}
          </h3>
          <p className="mt-1 line-clamp-2 text-xs text-[#8B6F47]">
            {reward.description}
          </p>
        </div>
      </div>

      {/* Coût */}
      <div className="mt-4 flex items-baseline justify-between">
        <span className="text-[11px] uppercase tracking-wider text-[#8B6F47]">
          Coût
        </span>
        <span
          className="text-sm font-semibold"
          style={{ color: BRONZE }}
        >
          {formatFcfa(reward.costFcfa)}
        </span>
      </div>

      {/* Bouton OFFRIR */}
      <Button
        type="button"
        onClick={onOffer}
        aria-label={`Offrir ${reward.title}`}
        className={cn(
          'mt-4 h-10 w-full rounded-md text-sm font-semibold uppercase tracking-wide',
          'text-white shadow-sm transition-colors',
        )}
        style={{ backgroundColor: GOLD }}
      >
        <Gift className="size-4" aria-hidden /> Offrir
      </Button>
    </article>
  )
}

// ============================================================
// Sous-composant : OfferDialog (overlay custom, pas Radix Dialog)
// ============================================================
// On évite <Dialog> de shadcn pour pouvoir styliser entièrement
// selon la palette Luxe Lumineux (overlay + carte blanche dorée).

interface OfferDialogProps {
  reward: PremiumReward
  staffName: string
  tableInput: string
  setTableInput: (v: string) => void
  tableTouched: boolean
  setTableTouched: (v: boolean) => void
  tableValid: boolean
  clientName: string
  setClientName: (v: string) => void
  triggeredBy: string
  setTriggeredBy: (v: string) => void
  submitting: boolean
  formValid: boolean
  onSubmit: (e: React.FormEvent) => void
  onClose: (open: boolean) => void
}

function OfferDialog({
  reward,
  staffName,
  tableInput,
  setTableInput,
  tableTouched,
  setTableTouched,
  tableValid,
  clientName,
  setClientName,
  triggeredBy,
  setTriggeredBy,
  submitting,
  formValid,
  onSubmit,
  onClose,
}: OfferDialogProps) {
  // Fermeture clavier (Échap)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !submitting) onClose(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, submitting])

  const emoji = reward.emoji || '🎁'

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="offer-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6"
    >
      {/* Voile */}
      <div
        className="absolute inset-0 backdrop-blur-sm"
        style={{ backgroundColor: 'rgba(44,44,44,0.55)' }}
        onClick={() => !submitting && onClose(false)}
        aria-hidden
      />

      {/* Carte */}
      <div
        className={cn(
          'relative z-10 w-full max-w-lg overflow-hidden rounded-2xl bg-white',
          'border border-[#efe7e0]',
        )}
        style={{ boxShadow: '0 12px 40px rgba(201,169,97,0.18)' }}
      >
        {/* En-tête doré */}
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{
            background: `linear-gradient(135deg, ${GOLD} 0%, ${BRONZE} 100%)`,
          }}
        >
          <div className="flex items-center gap-2">
            <Gift className="size-5 text-white" aria-hidden />
            <h2
              id="offer-dialog-title"
              className="text-base font-semibold text-white"
              style={TITLE_FONT}
            >
              Offrir une récompense
            </h2>
          </div>
          <button
            type="button"
            onClick={() => !submitting && onClose(false)}
            disabled={submitting}
            aria-label="Fermer"
            className="flex size-8 items-center justify-center rounded-full bg-white/15 text-white transition-colors hover:bg-white/25 disabled:opacity-50"
          >
            <ArrowLeft className="size-4" aria-hidden />
          </button>
        </div>

        {/* Corps */}
        <form onSubmit={onSubmit} className="px-5 py-5 sm:px-6">
          {/* Aperçu de la récompense sélectionnée */}
          <div
            className={cn(
              'mb-5 flex items-center gap-4 rounded-xl border border-[#efe7e0] bg-[#ffffff] p-4',
            )}
          >
            <div
              className="flex size-12 shrink-0 items-center justify-center rounded-full bg-white ring-2 ring-[#efe7e0]"
              aria-hidden
            >
              <span className="text-2xl leading-none">{emoji}</span>
            </div>
            <div className="min-w-0 flex-1">
              <h3
                className="truncate text-base text-[#2C2C2C]"
                style={TITLE_FONT}
              >
                {reward.title}
              </h3>
              <p className="mt-0.5 line-clamp-1 text-xs text-[#8B6F47]">
                {reward.description}
              </p>
            </div>
            <Badge
              variant="outline"
              className="shrink-0 border-[#efe7e0] text-[#8B6F47]"
            >
              {formatFcfa(reward.costFcfa)}
            </Badge>
          </div>

          {/* Champ : N° de table (requis) */}
          <div className="mb-4">
            <Label
              htmlFor="offer-table"
              className="mb-1.5 text-sm font-medium text-[#2C2C2C]"
            >
              N° de table <span style={{ color: ALERT }}>*</span>
            </Label>
            <Input
              id="offer-table"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              placeholder="Ex : 12 ou T-12"
              value={tableInput}
              disabled={submitting}
              onChange={(e) => setTableInput(e.target.value)}
              onBlur={() => setTableTouched(true)}
              aria-invalid={tableTouched && !tableValid}
              aria-required="true"
              className={cn(
                'border-[#efe7e0] bg-white text-[#2C2C2C]',
                'focus-visible:border-[#bc7155]',
                tableTouched &&
                  !tableValid && [
                    'border-[#bc7155]',
                    'focus-visible:border-[#bc7155]',
                  ],
              )}
            />
            {tableTouched && !tableValid ? (
              <p className="mt-1 text-xs" style={{ color: ALERT }}>
                Le numéro de table est requis.
              </p>
            ) : (
              <p className="mt-1 text-xs text-[#8B6F47]">
                Normalisé en « T-XX » côté serveur.
              </p>
            )}
          </div>

          {/* Champ : Nom du client (optionnel) */}
          <div className="mb-4">
            <Label
              htmlFor="offer-client"
              className="mb-1.5 text-sm font-medium text-[#2C2C2C]"
            >
              Nom du client{' '}
              <span className="text-xs font-normal text-[#8B6F47]">
                (optionnel)
              </span>
            </Label>
            <Input
              id="offer-client"
              type="text"
              autoComplete="off"
              placeholder="Ex : M. Diop"
              value={clientName}
              disabled={submitting}
              maxLength={80}
              onChange={(e) => setClientName(e.target.value)}
              className="border-[#efe7e0] bg-white text-[#2C2C2C] focus-visible:border-[#bc7155]"
            />
          </div>

          {/* Select : Déclencheur */}
          <div className="mb-5">
            <Label className="mb-1.5 text-sm font-medium text-[#2C2C2C]">
              Déclencheur
            </Label>
            <Select
              value={triggeredBy}
              onValueChange={(v) => setTriggeredBy(v)}
              disabled={submitting}
            >
              <SelectTrigger
                className={cn(
                  'w-full border-[#efe7e0] bg-white text-[#2C2C2C]',
                  'focus-visible:border-[#bc7155]',
                )}
                aria-label="Déclencheur de l'offre"
              >
                <SelectValue placeholder="Choisir un déclencheur" />
              </SelectTrigger>
              <SelectContent>
                {TRIGGER_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    <span className="flex flex-col">
                      <span>{opt.label}</span>
                      {opt.hint && (
                        <span className="text-[11px] text-[#8B6F47]">
                          {opt.hint}
                        </span>
                      )}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-1 text-xs text-[#8B6F47]">
              Justifie le geste de réparation VIP (traçabilité).
            </p>
          </div>

          {/* Footer : actions */}
          <div className="flex items-center justify-between gap-3 border-t border-[#efe7e0] pt-4">
            <span className="text-xs text-[#8B6F47]">
              Par{' '}
              <span className="font-semibold text-[#2C2C2C]">
                {staffName || '—'}
              </span>
            </span>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onClose(false)}
                disabled={submitting}
                className="border-[#efe7e0] text-[#2C2C2C] hover:bg-[#ffffff]"
              >
                Annuler
              </Button>
              <Button
                type="submit"
                disabled={!formValid}
                className="gap-2 text-white shadow-sm transition-colors"
                style={{ backgroundColor: GOLD }}
              >
                {submitting ? (
                  <>
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                    Enregistrement…
                  </>
                ) : (
                  <>
                    <Check className="size-4" aria-hidden />
                    Confirmer l&apos;offre
                  </>
                )}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}

// ============================================================
// Sous-composant : ConfirmationOverlay
// ============================================================

interface ConfirmationOverlayProps {
  reward: PremiumReward
  tableLabel: string
  clientName: string | null
  triggeredBy: string
  notification: string
  onAnother: () => void
  onClose: () => void
}

function ConfirmationOverlay({
  reward,
  tableLabel,
  clientName,
  triggeredBy,
  notification,
  onAnother,
  onClose,
}: ConfirmationOverlayProps) {
  // Fermeture clavier (Échap)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const emoji = reward.emoji || '🎁'

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
      className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6"
    >
      {/* Voile */}
      <div
        className="absolute inset-0 backdrop-blur-sm"
        style={{ backgroundColor: 'rgba(44,44,44,0.55)' }}
        onClick={onClose}
        aria-hidden
      />

      {/* Carte */}
      <div
        className={cn(
          'relative z-10 w-full max-w-md overflow-hidden rounded-2xl bg-white',
          'border border-[#efe7e0]',
        )}
        style={{ boxShadow: '0 12px 40px rgba(201,169,97,0.18)' }}
      >
        {/* Bande supérieure : succès */}
        <div
          className="px-5 py-4 text-center"
          style={{ backgroundColor: SUCCESS }}
        >
          <div className="mx-auto mb-2 flex size-10 items-center justify-center rounded-full bg-white/15">
            <Check className="size-6 text-white" aria-hidden />
          </div>
          <h2
            id="confirm-title"
            className="text-base font-semibold text-white"
            style={TITLE_FONT}
          >
            Récompense offerte ✓
          </h2>
        </div>

        {/* Corps */}
        <div className="px-5 py-5 sm:px-6">
          {/* Résumé de l'offre */}
          <div
            className={cn(
              'mb-4 flex items-center gap-3 rounded-xl border border-[#efe7e0] bg-[#ffffff] p-4',
            )}
          >
            <div
              className="flex size-12 shrink-0 items-center justify-center rounded-full bg-white ring-2 ring-[#efe7e0]"
              aria-hidden
            >
              <span className="text-2xl leading-none">{emoji}</span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs uppercase tracking-wider text-[#8B6F47]">
                {reward.title}
              </p>
              <p className="mt-0.5 text-sm text-[#2C2C2C]">
                🥂 {reward.title} offert à Table {tableLabel}
              </p>
            </div>
          </div>

          {/* Notification détaillée */}
          <div
            className="rounded-xl border border-[#efe7e0] p-3"
            style={{ backgroundColor: `${VIP}0A` }}
            role="status"
            aria-live="polite"
          >
            <div className="flex items-start gap-2">
              <Sparkles
                className="mt-0.5 size-4 shrink-0"
                style={{ color: VIP }}
                aria-hidden
              />
              <p className="text-sm leading-relaxed text-[#2C2C2C]">
                {notification}
              </p>
            </div>
          </div>

          {/* Méta-infos */}
          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
            <dt className="text-[#8B6F47]">Table</dt>
            <dd className="text-right font-medium text-[#2C2C2C]">
              {tableLabel}
            </dd>
            <dt className="text-[#8B6F47]">Client</dt>
            <dd className="text-right font-medium text-[#2C2C2C]">
              {clientName || '—'}
            </dd>
            <dt className="text-[#8B6F47]">Déclencheur</dt>
            <dd className="text-right font-medium text-[#2C2C2C]">
              {triggerLabel(triggeredBy)}
            </dd>
          </dl>

          {/* Actions */}
          <div className="mt-5 flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="flex-1 border-[#efe7e0] text-[#2C2C2C] hover:bg-[#ffffff]"
            >
              Fermer
            </Button>
            <Button
              type="button"
              onClick={onAnother}
              className="flex-1 gap-2 text-white shadow-sm"
              style={{ backgroundColor: GOLD }}
            >
              <Gift className="size-4" aria-hidden />
              Offrir une autre
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================================================
// Sous-composant : GrantRow (ligne d'historique)
// ============================================================

interface GrantRowProps {
  grant: RewardGrant
}

function GrantRow({ grant }: GrantRowProps) {
  const emoji = grant.rewardEmoji || '🎁'
  const title = grant.rewardTitle || 'Récompense'
  const table = grant.tableNumber || '—'
  const client = grant.clientName || 'Client'

  // Couleur du badge déclencheur selon le type
  const triggerBadgeStyle = (() => {
    switch (grant.triggeredBy) {
      case 'manual':
        return { bg: '#f7efe9', color: BRONZE }
      case 'vip_discontent_resolved':
      case 'incident_quick_resolution':
        return { bg: '#FBEAE4', color: ALERT }
      case 'stay_extended':
        return { bg: '#E6F0EA', color: SUCCESS }
      case 'birthday':
        return { bg: '#EFE8F6', color: VIP }
      default:
        return { bg: '#f7efe9', color: BRONZE }
    }
  })()

  return (
    <li className="flex items-center gap-3 px-4 py-3 sm:px-5">
      {/* Emoji */}
      <div
        className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#ffffff] ring-1 ring-[#efe7e0]"
        aria-hidden
      >
        <span className="text-lg leading-none">{emoji}</span>
      </div>

      {/* Texte */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-[#2C2C2C]">
          <span className="font-semibold">{title}</span>
          <span className="text-[#8B6F47]"> · Table {table}</span>
        </p>
        <p className="mt-0.5 truncate text-xs text-[#8B6F47]">
          {client}
          {grant.staffName ? ` · par ${grant.staffName}` : ''}
        </p>
      </div>

      {/* Déclencheur (badge) */}
      <span
        className="hidden shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium sm:inline"
        style={{
          backgroundColor: triggerBadgeStyle.bg,
          color: triggerBadgeStyle.color,
        }}
      >
        {triggerLabel(grant.triggeredBy)}
      </span>

      {/* Horodatage */}
      <time
        className="shrink-0 text-xs text-[#8B6F47]"
        dateTime={grant.createdAt}
        title={formatTime(grant.deliveredAt || grant.createdAt)}
      >
        {relativeTime(grant.createdAt)}
      </time>
    </li>
  )
}

// ============================================================
// Sous-composants : skeletons
// ============================================================

function RewardsSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div
          key={i}
          className={cn(
            'flex flex-col rounded-xl border border-[#efe7e0] bg-white p-5',
            CARD_SHADOW,
          )}
        >
          <div className="flex items-start gap-3">
            <div className="size-14 shrink-0 animate-pulse rounded-full bg-[#f7efe9]" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-2/3 animate-pulse rounded bg-[#f7efe9]" />
              <div className="h-3 w-full animate-pulse rounded bg-[#f7efe9]" />
              <div className="h-3 w-4/5 animate-pulse rounded bg-[#f7efe9]" />
            </div>
          </div>
          <div className="mt-4 h-8 w-full animate-pulse rounded-md bg-[#f7efe9]" />
        </div>
      ))}
    </div>
  )
}

function GrantsSkeleton() {
  return (
    <ul role="list" className="divide-y divide-[#efe7e0]">
      {[0, 1, 2].map((i) => (
        <li key={i} className="flex items-center gap-3 px-4 py-3 sm:px-5">
          <div className="size-10 shrink-0 animate-pulse rounded-full bg-[#f7efe9]" />
          <div className="flex-1 space-y-2">
            <div className="h-3.5 w-1/2 animate-pulse rounded bg-[#f7efe9]" />
            <div className="h-3 w-1/3 animate-pulse rounded bg-[#f7efe9]" />
          </div>
          <div className="h-3 w-12 animate-pulse rounded bg-[#f7efe9]" />
        </li>
      ))}
    </ul>
  )
}

// ============================================================
// Helper : message de notification (sens métier)
// ============================================================

/**
 * Construit un message de notification « orienté staff » après une
 * offre réussie. Varie selon le déclencheur pour donner du contexte.
 */
function buildNotificationMessage(args: {
  reward: PremiumReward
  tableLabel: string
  clientName: string | null
  triggeredBy: string
}): string {
  const { reward, tableLabel, clientName, triggeredBy } = args
  const clientStr = clientName ? ` (${clientName})` : ''
  const base = `${reward.title} offert à Table ${tableLabel}${clientStr}`

  switch (triggeredBy) {
    case 'vip_discontent_resolved':
      return `${base}. Geste de réparation posé suite à mécontentement VIP résolu.`
    case 'incident_quick_resolution':
      return `${base}. Récompense attribuée pour résolution rapide d'incident.`
    case 'stay_extended':
      return `${base}. Attention offerte pour remercier la prolongation du séjour.`
    case 'birthday':
      return `${base}. 🎂 Une attention personnalisée pour son anniversaire.`
    case 'manual':
    default:
      return `${base}. Offre manuelle posée par le concierge.`
  }
}

// ============================================================
// Default export (compat import par défaut)
// ============================================================

export default VipFlashRewards
