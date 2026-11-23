'use client'

// ============================================================
// <VipBriefing /> — Module 8 · Briefing de Prise de Poste
// ------------------------------------------------------------
// Vue STAFF. Affiche un briefing automatiquement généré pour le
// membre du personnel VIP à sa prise de poste (début de shift).
//
// Le briefing est généré côté serveur à partir des données temps-
// réel (tables occupées, demandes en cours, douches occupées,
// prochain vol) et adapté au rôle (reception, manager, etage,
// barman, maitre_dhotel).
//
// Flux :
//   1. Au montage → GET /api/vip/briefing?role={staffRole}&name={staffName}
//   2. Spinner pendant le fetch
//   3. Une fois chargé → affichage du briefing dans une carte
//      « Luxe Lumineux »
//   4. Bouton « ▶ ÉCOUTER » (or) → parle(content) via @/lib/staff-tts
//      (voix « Nathalie » : française, grave, débit rapide)
//   5. Bouton « PASSER » (outline) → onDismiss()
//   6. Auto-play : tenté au montage si le navigateur l'autorise,
//      mais la plupart des navigateurs bloquent l'autoplay sans
//      interaction. Le bouton « ÉCOUTER » reste donc proéminent.
//
// Palette « Luxe Lumineux » :
//   - Background   #ffffff    - Cards  #FFFFFF + shadow gold 6%
//   - Gold         #bc7155    - Bronze #8B6F47
//   - Text         #2C2C2C    - Success #bc7155
//   - Border       #efe7e0    - Title font Georgia / Playfair
//
// API consommée :
//   GET /api/vip/briefing?role=reception&name=Moussa
//        → { ok, data: { id, content, durationSec, role, name,
//                        createdAt, metrics?: { … } } }
// ============================================================

import { useEffect, useState } from 'react'
import { Loader2, Volume2, X, Mic } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { parler } from '@/lib/staff-tts'

// ============================================================
// Types — miroir de la réponse API
// ============================================================

interface BriefingData {
  id: string
  content: string
  durationSec: number
  role: string
  name: string
  createdAt?: string
  metrics?: {
    passengersCount?: number
    openRequestsCount?: number
    inProgressCount?: number
    showersBusyCount?: number
    doneTodayCount?: number
    rewardGrantsTodayCount?: number
    nextFlight?: {
      flightNo: string
      boardingAt: string
      status: string
    } | null
  }
}

// ============================================================
// Constantes & helpers
// ============================================================

const TITLE_FONT = {
  fontFamily: 'Georgia, "Playfair Display", serif',
} as const

const CARD_SHADOW = 'shadow-[0_4px_20px_rgba(201,169,97,0.06)]'

// Palette « Luxe Lumineux »
const GOLD = '#bc7155'
const BRONZE = '#8B6F47'
const TEXT = '#2C2C2C'
const SUCCESS = '#bc7155'
const ALERT = '#bc7155'
const BG = '#ffffff'
const BORDER = '#efe7e0'

/**
 * Tente de récupérer le flag localStorage « auto-play briefing ».
 * False par défaut (les navigateurs bloquent l'autoplay de toute
 * façon sans interaction préalable).
 */
function readAutoplayPref(): boolean {
  if (typeof window === 'undefined') return false
  try {
    const v = window.localStorage.getItem('vip.briefing.autoplay')
    return v === '1'
  } catch {
    return false
  }
}

/** Formate un horodatage ISO en horloge HH:MM locale. */
function formatTime(iso?: string | null): string {
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

/** Libellé humain du rôle (reception → « Réception », etc.). */
function roleLabel(role: string): string {
  const r = (role || '').toLowerCase()
  switch (r) {
    case 'manager':
      return 'Manager'
    case 'reception':
      return 'Réception'
    case 'etage':
      return "Étage"
    case 'barman':
      return 'Barman'
    case 'maitre_dhotel':
    case 'maitre_d_hotel':
    case 'maitre':
      return "Maître d'hôtel"
    default:
      return role ? role.charAt(0).toUpperCase() + role.slice(1) : '—'
  }
}

/** Durée estimée d'écoute formatée : 15 → « ~15 s ». */
function formatDuration(sec?: number): string {
  if (!sec || sec <= 0) return '—'
  if (sec < 60) return `~${sec} s`
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return s ? `~${m} min ${s} s` : `~${m} min`
}

// ============================================================
// Composant principal
// ============================================================

export function VipBriefing({
  staffName,
  staffRole,
  onDismiss,
}: {
  staffName: string
  staffRole: string
  onDismiss: () => void
}) {
  // ----- États -----
  const [briefing, setBriefing] = useState<BriefingData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [listened, setListened] = useState(false)
  const [speaking, setSpeaking] = useState(false)

  // ----- Effet : fetch initial au montage -----
  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)
      try {
        const params = new URLSearchParams({
          role: (staffRole || 'reception').slice(0, 40),
          name: (staffName || 'collègue').slice(0, 80),
        })
        const res = await fetch(`/api/vip/briefing?${params.toString()}`, {
          method: 'GET',
          cache: 'no-store',
        })
        const json = (await res.json()) as {
          ok: boolean
          data?: BriefingData
        }
        if (cancelled) return
        if (!res.ok || !json.ok || !json.data) {
          throw new Error('Réponse invalide')
        }
        setBriefing(json.data)

        // Auto-play : tenté si la préférence est activée.
        // NB : la plupart des navigateurs bloquent l'autoplay audio
        // avant une interaction utilisateur — on catche l'échec
        // silencieusement, le bouton « ÉCOUTER » reste visible.
        if (readAutoplayPref() && json.data.content) {
          try {
            parler(json.data.content)
            setListened(true)
          } catch {
            /* autoplay bloqué : ignore */
          }
        }
      } catch (err) {
        if (cancelled) return
        console.error('[VipBriefing] fetch error:', err)
        setError('Impossible de générer le briefing.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [staffName, staffRole])

  // ----- Effet : nettoyage de la synthèse vocale au démontage -----
  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        try {
          window.speechSynthesis.cancel()
        } catch {
          /* ignore */
        }
      }
    }
  }, [])

  // ----- Effet : fermeture clavier (Échap) -----
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        // Arrêt de la voix avant fermeture
        if (typeof window !== 'undefined' && window.speechSynthesis) {
          try {
            window.speechSynthesis.cancel()
          } catch {
            /* ignore */
          }
        }
        onDismiss()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onDismiss])

  // ----- Handlers -----
  function handleListen() {
    if (!briefing?.content) return
    setSpeaking(true)
    try {
      parler(briefing.content)
      setListened(true)
    } finally {
      // La synthèse navigateur n'expose pas de promesse ; on simule
      // la fin du « speaking » après la durée estimée (+ marge 1 s).
      const dur = Math.max(2, briefing.durationSec || 15) * 1000 + 1000
      setTimeout(() => setSpeaking(false), dur)
    }
  }

  function handleSkip() {
    // Arrêt de la voix éventuellement en cours
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      try {
        window.speechSynthesis.cancel()
      } catch {
        /* ignore */
      }
    }
    onDismiss()
  }

  // ============================================================
  // Rendu
  // ============================================================

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="briefing-title"
      className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6"
    >
      {/* Voile */}
      <div
        className="absolute inset-0 backdrop-blur-sm"
        style={{ backgroundColor: 'rgba(44,44,44,0.55)' }}
        onClick={handleSkip}
        aria-hidden
      />

      {/* Carte principale */}
      <div
        className={cn(
          'relative z-10 w-full max-w-2xl overflow-hidden rounded-2xl bg-white',
          'border border-[#efe7e0]',
        )}
        style={{ boxShadow: '0 12px 40px rgba(201,169,97,0.18)' }}
      >
        {/* ===================== En-tête ===================== */}
        <div
          className="flex items-center justify-between px-5 py-4 sm:px-6"
          style={{
            background: `linear-gradient(135deg, ${GOLD} 0%, ${BRONZE} 100%)`,
          }}
        >
          <div className="flex items-center gap-3">
            <div
              className="flex size-10 items-center justify-center rounded-full bg-white/15"
              aria-hidden
            >
              <Mic className="size-5 text-white" aria-hidden />
            </div>
            <div>
              <h2
                id="briefing-title"
                className="text-base font-semibold text-white sm:text-lg"
                style={TITLE_FONT}
              >
                🎙 Briefing de Prise de Poste
              </h2>
              <p className="text-xs text-white/85">
                Pour {staffName || '—'} ({roleLabel(staffRole)})
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleSkip}
            aria-label="Fermer le briefing"
            className="flex size-8 items-center justify-center rounded-full bg-white/15 text-white transition-colors hover:bg-white/25"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>

        {/* ===================== Corps ===================== */}
        <div className="px-5 py-5 sm:px-6 sm:py-6">
          {loading ? (
            <LoadingState />
          ) : error ? (
            <ErrorState
              message={error}
              onRetry={() => {
                setLoading(true)
                setError(null)
                // Re-déclenche le fetch en modifiant un state trigger :
                // on force un re-render via setBriefing(null).
                setBriefing(null)
              }}
            />
          ) : briefing ? (
            <BriefingContent
              briefing={briefing}
              listened={listened}
              speaking={speaking}
              onListen={handleListen}
            />
          ) : null}

          {/* Footer actions — toujours visibles sauf pendant le loading initial */}
          {!loading && !error && briefing && (
            <div className="mt-5 flex flex-col-reverse gap-2 border-t border-[#efe7e0] pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-[#8B6F47]">
                {listened ? (
                  <span
                    className="inline-flex items-center gap-1"
                    style={{ color: SUCCESS }}
                  >
                    <Volume2 className="size-3.5" aria-hidden />
                    Briefing écouté ✓
                  </span>
                ) : (
                  'Écoute conseillée avant prise de poste.'
                )}
              </p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleSkip}
                  className="border-[#efe7e0] text-[#2C2C2C] hover:bg-[#ffffff]"
                >
                  Passer
                </Button>
                <Button
                  type="button"
                  onClick={handleListen}
                  disabled={speaking}
                  className="gap-2 text-white shadow-sm transition-colors"
                  style={{ backgroundColor: GOLD }}
                >
                  {speaking ? (
                    <>
                      <Loader2 className="size-4 animate-spin" aria-hidden />
                      Lecture…
                    </>
                  ) : (
                    <>
                      <Volume2 className="size-4" aria-hidden />
                      ▶ Écouter
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ============================================================
// Sous-composant : LoadingState
// ============================================================

function LoadingState() {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-center">
      <div
        className="flex size-12 items-center justify-center rounded-full ring-2 ring-[#efe7e0]"
        style={{ backgroundColor: BG }}
        aria-hidden
      >
        <Loader2 className="size-6 animate-spin" style={{ color: BRONZE }} />
      </div>
      <p className="mt-3 text-sm text-[#2C2C2C]">
        Génération du briefing en cours…
      </p>
      <p className="mt-1 text-xs text-[#8B6F47]">
        Collecte des KPIs temps-réel (tables, demandes, douches, vols).
      </p>
    </div>
  )
}

// ============================================================
// Sous-composant : ErrorState
// ============================================================

function ErrorState({
  message,
  onRetry,
}: {
  message: string
  onRetry: () => void
}) {
  return (
    <div
      className="flex flex-col items-center justify-center rounded-xl border border-[#efe7e0] bg-[#ffffff] py-8 text-center"
    >
      <p className="text-sm" style={{ color: ALERT }}>
        {message}
      </p>
      <Button
        type="button"
        variant="outline"
        onClick={onRetry}
        className="mt-3 border-[#efe7e0] text-[#2C2C2C] hover:bg-white"
      >
        Réessayer
      </Button>
    </div>
  )
}

// ============================================================
// Sous-composant : BriefingContent (texte + KPIs)
// ============================================================

interface BriefingContentProps {
  briefing: BriefingData
  listened: boolean
  speaking: boolean
  onListen: () => void
}

function BriefingContent({
  briefing,
  listened,
  speaking,
  onListen,
}: BriefingContentProps) {
  const metrics = briefing.metrics

  // Construit les pastilles KPI si metrics est présent
  const kpiChips: Array<{ label: string; value: string | number; color: string }> =
    []
  if (metrics) {
    if (typeof metrics.passengersCount === 'number') {
      kpiChips.push({
        label: 'Passagers',
        value: metrics.passengersCount,
        color: BRONZE,
      })
    }
    if (typeof metrics.openRequestsCount === 'number') {
      kpiChips.push({
        label: 'Demandes ouvertes',
        value: metrics.openRequestsCount,
        color: metrics.openRequestsCount > 0 ? ALERT : SUCCESS,
      })
    }
    if (typeof metrics.inProgressCount === 'number') {
      kpiChips.push({
        label: 'En cours',
        value: metrics.inProgressCount,
        color: GOLD,
      })
    }
    if (typeof metrics.showersBusyCount === 'number') {
      kpiChips.push({
        label: 'Douches occupées',
        value: metrics.showersBusyCount,
        color: metrics.showersBusyCount > 0 ? ALERT : SUCCESS,
      })
    }
    if (metrics.nextFlight) {
      kpiChips.push({
        label: `Vol ${metrics.nextFlight.flightNo}`,
        value: metrics.nextFlight.boardingAt,
        color: BRONZE,
      })
    }
  }

  return (
    <div>
      {/* Bandeau méta : rôle + horodatage + durée estimée */}
      <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
        <span
          className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-medium"
          style={{ backgroundColor: '#f7efe9', color: BRONZE }}
        >
          <Mic className="size-3" aria-hidden />
          {roleLabel(briefing.role)}
        </span>
        {briefing.createdAt && (
          <span className="inline-flex items-center gap-1 rounded-full bg-[#ffffff] px-2.5 py-1 text-[#8B6F47] ring-1 ring-[#efe7e0]">
            Généré à {formatTime(briefing.createdAt)}
          </span>
        )}
        {briefing.durationSec ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-[#ffffff] px-2.5 py-1 text-[#8B6F47] ring-1 ring-[#efe7e0]">
            ⏱ {formatDuration(briefing.durationSec)}
          </span>
        ) : null}
      </div>

      {/* Texte du briefing — carte « Luxe Lumineux » */}
      <article
        className={cn(
          'rounded-xl border border-[#efe7e0] bg-[#ffffff] p-4 sm:p-5',
          CARD_SHADOW,
        )}
        aria-live="polite"
      >
        <div className="flex items-start gap-3">
          {/* Avatar « Nathalie » (voix de synthèse) */}
          <div
            className="flex size-10 shrink-0 items-center justify-center rounded-full ring-2 ring-[#efe7e0]"
            style={{ backgroundColor: '#FFFFFF' }}
            aria-hidden
          >
            <Mic className="size-5" style={{ color: GOLD }} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs uppercase tracking-wider text-[#8B6F47]">
              Nathalie · Voix de service
            </p>
            <p
              className="mt-1.5 text-sm leading-relaxed text-[#2C2C2C] sm:text-[15px]"
              style={{ whiteSpace: 'pre-wrap' }}
            >
              {briefing.content}
            </p>
          </div>
        </div>
      </article>

      {/* KPIs temps-réel (si présents dans la réponse API) */}
      {kpiChips.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-[11px] uppercase tracking-wider text-[#8B6F47]">
            Contexte temps-réel
          </p>
          <div className="flex flex-wrap gap-2">
            {kpiChips.map((chip, i) => (
              <span
                key={`${chip.label}-${i}`}
                className="inline-flex items-center gap-1.5 rounded-md border border-[#efe7e0] bg-white px-2.5 py-1 text-xs"
              >
                <span
                  className="size-1.5 rounded-full"
                  style={{ backgroundColor: chip.color }}
                  aria-hidden
                />
                <span className="text-[#8B6F47]">{chip.label}</span>
                <span className="font-semibold text-[#2C2C2C]">
                  {chip.value}
                </span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Rappel discret : écouter avant de passer */}
      {!listened && !speaking && (
        <p className="mt-3 text-center text-xs text-[#8B6F47]">
          Astuce : appuyez sur{' '}
          <button
            type="button"
            onClick={onListen}
            className="font-semibold underline-offset-2 hover:underline"
            style={{ color: BRONZE }}
          >
            ▶ Écouter
          </button>{' '}
          pour entendre le briefing à voix haute.
        </p>
      )}
    </div>
  )
}

// ============================================================
// Default export (compat import par défaut)
// ============================================================

export default VipBriefing
