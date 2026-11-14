// ============================================================
// Page /ops-wallboard — Wallboard Ops Room Aéroport
// ------------------------------------------------------------
// Affichage TV plein écran pour la salle de supervision ops.
// Style "departure board" (panneau d'affichage des départs) :
//   - carte noire (#0a0a0a) à coins arrondis sur fond très sombre
//   - header gradient amber→orange avec icône avion + horloge
//   - bannières d'alertes (rouge/amber) sous le header
//   - strip stats compact (5 tuiles)
//   - grille principale type "dot-matrix" : cellules #1a1a1a séparées
//     par des gaps noirs, texte monospace, 10 lignes (placeholder
//     dots "· · ·" pour les emplacements vides, comme un vrai board)
//   - footer 2 colonnes : SLA par zone | Charge par zone (barres amber)
//
// Polling identique au précédent :
//   - /api/airport/wallboard toutes les 5s
//   - /api/airport/alerts/check toutes les 30s
//   - horloge 1s
//
// Aucun scroll sur 1920×1080. Sur petits écrans, empilement vertical
// avec scroll (overflow-y-auto sur le main).
// ============================================================

'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Plane,
  TriangleAlert,
  OctagonAlert,
  Volume2,
  VolumeX,
  Map as MapIcon,
  Phone,
  Megaphone,
  Trophy,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Clock,
  ShieldAlert,
  Activity,
  Wrench,
  Users,
} from 'lucide-react'
import { AirportPredictionRadar } from '@/components/feedbackpro/airport-prediction-radar'

// ---------------------------------------------------------------
// Types — match exact du contrat /api/airport/wallboard
// ---------------------------------------------------------------
type Statut = 'EN_ATTENTE' | 'EN_COURS' | 'RESOLU'
type Trend = 'up' | 'down' | 'stable'
type TeamKey = 'nettoyage' | 'maintenance' | 'securite' | 'accueil' | 'logistique' | 'other'

type ZoneAgg = {
  code: string
  nom: string
  emoji: string
  count_24h: number
  count_en_attente: number
  last_report_at: string | null
  trend: Trend
}

type RecentReport = {
  id: string
  zone: { code: string; nom: string; emoji: string } | null
  tagScanne: string
  problemType: string
  statut: string
  photoCategory: string | null
  routedTeam: string | null
  flightNumber?: string | null
  createdAt: string
}

// Feature 3 — SLA temps de résolution par zone (renvoyé par le wallboard)
type SlaStats = {
  targetMinutes: number | null
  resolvedCount: number
  avgResolutionMinutes: number | null
  slaCompliancePercent: number
  pendingBreaches: number
}

type WallboardData = {
  stats: {
    total_24h: number
    en_attente: number
    en_cours: number
    resolus_24h: number
    avg_resolution_minutes: number | null
  }
  zones: ZoneAgg[]
  top_zones: ZoneAgg[]
  recent_reports: RecentReport[]
  by_team: Record<TeamKey, number>
  sla?: Record<string, SlaStats>
  // Signalements résolus dans les dernières 30 secondes (pour le son "résolu")
  recently_resolved?: {
    id: string
    zone: { code: string; nom: string; emoji: string } | null
    problemType: string
    tagScanne: string
    resolvedAt: Date | null
  }[]
}

// ---------------------------------------------------------------
// Types — Task WB2 — leaderboard pour Top Performer
// ---------------------------------------------------------------
type LeaderboardEntry = {
  rank: number
  id: string
  staffName: string
  staffPhone: string | null
  points: number
  resolutions: number
  avgMinutes: number | null
  lastResolvedAt: string | null
}

type LeaderboardData = {
  month: string
  leaderboard: LeaderboardEntry[]
}

// ---------------------------------------------------------------
// Types — /api/airport/alerts/check
// ---------------------------------------------------------------
type AlertType =
  | 'SPIKE_15MIN'
  | 'SPIKE_30MIN'
  | 'SPIKE_1H'
  | 'PENDING_COUNT'
  | 'NO_RESOLUTION_HOURS'

type TriggeredAlert = {
  thresholdId: string
  type: AlertType
  zoneCode: string
  currentValue: number
  threshold: number
  severity: 'warning' | 'critical'
  message: string
  triggeredAt: string
  suppressed: boolean
}

type AlertsCheckResponse = {
  ok: true
  data: {
    alerts: TriggeredAlert[]
    lastCheckedAt: string
    stats: { totalActive: number; triggered: number; critical: number; warning: number }
  }
}

// ---------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------

/** "il y a 3 min" / "il y a 1 h" / "il y a 2 j" / "à l'instant" */
function relativeTime(iso: string | null): string {
  if (!iso) return '—'
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 0) return 'à l\'instant'
  const sec = Math.floor(diff / 1000)
  if (sec < 10) return 'à l\'instant'
  if (sec < 60) return `il y a ${sec} s`
  const min = Math.floor(sec / 60)
  if (min < 60) return `il y a ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `il y a ${h} h`
  const j = Math.floor(h / 24)
  return `il y a ${j} j`
}

function formatClock(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function formatDateFR(d: Date): string {
  return d.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })
}

// Statut meta — palette departures board :
//   EN_ATTENTE → amber
//   EN_COURS   → sky
//   RESOLU     → green
const STATUT_META: Record<Statut, { label: string; badge: string; dot: string }> = {
  EN_ATTENTE: {
    label: 'EN ATTENTE',
    badge: 'border-amber-500/50 bg-amber-500/15 text-amber-400',
    dot: 'bg-amber-400',
  },
  EN_COURS: {
    label: 'EN COURS',
    badge: 'border-sky-500/50 bg-sky-500/15 text-sky-400',
    dot: 'bg-sky-400',
  },
  RESOLU: {
    label: 'RÉSOLU',
    badge: 'border-green-500/50 bg-green-500/15 text-green-500',
    dot: 'bg-green-500',
  },
}

function statutMeta(s: string): { label: string; badge: string; dot: string } {
  return (
    STATUT_META[s as Statut] ?? {
      label: s,
      badge: 'border-neutral-600 bg-neutral-700/40 text-neutral-400',
      dot: 'bg-neutral-500',
    }
  )
}

const TEAM_META: Record<TeamKey, { emoji: string; label: string }> = {
  nettoyage: { emoji: '🧹', label: 'Nettoyage' },
  maintenance: { emoji: '🔧', label: 'Maintenance' },
  securite: { emoji: '🛡️', label: 'Sécurité' },
  accueil: { emoji: '👋', label: 'Accueil' },
  logistique: { emoji: '🛃', label: 'Logistique' },
  other: { emoji: '❓', label: 'Autre' },
}

function teamMeta(key: string | null): { emoji: string; label: string } | null {
  if (!key) return null
  return TEAM_META[key as TeamKey] ?? TEAM_META.other
}

// ---------------------------------------------------------------
// Task WB2 — Helpers additionnels
// ---------------------------------------------------------------

/** "8m 23s" — formatage humain d'une durée en minutes décimales */
function formatDurationMin(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return '—'
  const totalSec = Math.round(minutes * 60)
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}m ${String(s).padStart(2, '0')}s`
}

/** "12min 34s" — formatage d'une durée en secondes pour le timer Mode Crise */
function formatDurationSec(totalSec: number): string {
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}min ${String(s).padStart(2, '0')}s`
}

/** Code zone → famille (EXTÉRIEUR / TERMINAL / SÛRETÉ / COMMERCIAL / SERVICE / URGENCE / HISTORIQUE)
 *  Utilisé par la Vue Cartographique pour grouper visuellement les zones. */
type ZoneFamily =
  | 'EXTÉRIEUR'
  | 'SÛRETÉ'
  | 'TERMINAL'
  | 'COMMERCIAL'
  | 'SERVICE'
  | 'URGENCE'
  | 'HISTORIQUE'

function zoneFamily(code: string): ZoneFamily {
  if (code.startsWith('ext_')) return 'EXTÉRIEUR'
  if (code.startsWith('sec_')) return 'SÛRETÉ'
  if (code.startsWith('term_')) return 'TERMINAL'
  if (code.startsWith('com_')) return 'COMMERCIAL'
  if (code.startsWith('srv_')) return 'SERVICE'
  if (code.startsWith('urg_')) return 'URGENCE'
  return 'HISTORIQUE'
}

/** Truncate a zone name for compact map display */
function truncateName(name: string, max = 12): string {
  if (name.length <= max) return name
  return `${name.slice(0, max - 1)}…`
}

/** Détermine la couleur de statut d'une zone selon son count_en_attente :
 *   - 0           → 'calm' (green)
 *   - 1-2         → 'attention' (amber)
 *   - 3+          → 'critical' (red, animate-pulse)
 *   - null/undef  → 'none' (gray) */
type ZoneStatus = 'calm' | 'attention' | 'critical' | 'none'

function zoneStatus(count: number | null | undefined): ZoneStatus {
  if (count === null || count === undefined) return 'none'
  if (count === 0) return 'calm'
  if (count <= 2) return 'attention'
  return 'critical'
}

const ZONE_STATUS_META: Record<ZoneStatus, { dot: string; ring: string; text: string; label: string }> = {
  calm: {
    dot: 'bg-green-500',
    ring: 'border-green-500/40 hover:border-green-400',
    text: 'text-green-400',
    label: 'Calme',
  },
  attention: {
    dot: 'bg-amber-400',
    ring: 'border-amber-500/50 hover:border-amber-400',
    text: 'text-amber-400',
    label: 'Attention',
  },
  critical: {
    dot: 'bg-red-500',
    ring: 'border-red-500 bg-red-500/10 animate-pulse hover:border-red-400',
    text: 'text-red-400',
    label: 'Critique',
  },
  none: {
    dot: 'bg-neutral-600',
    ring: 'border-neutral-700 hover:border-neutral-500',
    text: 'text-neutral-500',
    label: 'N/A',
  },
}

/** Task WB2 Feature 4 — Mode Crise :
 *  Détermine si un signalement est "critique" (à afficher en mode crise).
 *  Critères : statut EN_ATTENTE/EN_COURS ET au moins un des :
 *    - elapsedMin > 10 (incident qui s'éternise)
 *    - zone de sûreté/sanitaire/médical/SOS
 *    - team routed = securite
 *  Les signalements RESOLU ne sont jamais critiques en mode crise. */
function isCriticalInCrisis(r: RecentReport): boolean {
  if (r.statut === 'RESOLU') return false
  const elapsedMin = (Date.now() - new Date(r.createdAt).getTime()) / 60000
  if (elapsedMin > 10) return true
  const zc = r.zone?.code ?? ''
  if (zc.startsWith('sec_')) return true
  if (zc.startsWith('srv_medical') || zc.startsWith('urg_')) return true
  if (zc === 'sanitaires' || zc === 'term_sanitaires' || zc === 'term_san_pmr') return true
  if (r.routedTeam === 'securite') return true
  return false
}

// ---------------------------------------------------------------
// Fetch helpers
// ---------------------------------------------------------------
async function fetchWallboard(): Promise<WallboardData> {
  const res = await fetch('/api/airport/wallboard', { cache: 'no-store' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const json = (await res.json()) as { ok: boolean; data?: WallboardData; error?: string }
  if (!json.ok || !json.data) throw new Error(json.error ?? 'réponse invalide')
  return json.data
}

async function fetchAlerts(): Promise<TriggeredAlert[]> {
  const res = await fetch('/api/airport/alerts/check', { cache: 'no-store' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const json = (await res.json()) as
    | AlertsCheckResponse
    | { ok: false; error: string }
  if (!json.ok) throw new Error(json.error ?? 'réponse invalide')
  return json.data.alerts
}

// ---------------------------------------------------------------
// Sous-composants
// ---------------------------------------------------------------

/**
 * Bannière d'alerte — une par ligne, sous le header.
 *   critical : bg-red-950/80 border-red-500, animate-pulse, rouge
 *   warning  : bg-amber-950/80 border-amber-500, amber
 */
function AlertRow({ alert }: { alert: TriggeredAlert }) {
  const isCritical = alert.severity === 'critical'
  return (
    <div
      role="alert"
      className={`flex items-center gap-3 rounded-md border px-3 py-2 font-mono text-sm ${
        isCritical
          ? 'animate-pulse border-red-500 bg-red-950/80 text-red-300'
          : 'border-amber-500 bg-amber-950/80 text-amber-300'
      }`}
    >
      <span className="shrink-0" aria-hidden>
        {isCritical ? <OctagonAlert className="size-4" /> : <TriangleAlert className="size-4" />}
      </span>
      <span
        className={`shrink-0 text-[11px] font-bold uppercase tracking-wider ${
          isCritical ? 'text-red-400' : 'text-amber-400'
        }`}
      >
        {isCritical ? 'Critique' : 'Alerte'}
      </span>
      <span className="shrink-0 text-[11px] uppercase tracking-wider text-white/60">
        {alert.zoneCode} · {alert.type.replace(/_/g, ' ')}
      </span>
      <span className="min-w-0 flex-1 truncate text-white">{alert.message}</span>
      <span className="shrink-0 tabular-nums text-white/80">
        {alert.currentValue}/{alert.threshold}
      </span>
      <span className="shrink-0 text-[11px] tabular-nums text-white/50">
        {relativeTime(alert.triggeredAt)}
      </span>
    </div>
  )
}

/** Tuile statistique compacte : gros chiffre monospace + label amber */
function StatTile({
  label,
  value,
  accent = 'white',
}: {
  label: string
  value: string | number
  accent?: 'white' | 'amber' | 'sky' | 'green'
}) {
  const textCls = {
    white: 'text-white',
    amber: 'text-amber-400',
    sky: 'text-sky-400',
    green: 'text-green-500',
  }[accent]
  return (
    <div className="flex flex-col items-center justify-center gap-0.5 rounded-md bg-[#1a1a1a] px-3 py-2">
      <span className={`font-mono text-2xl font-bold tabular-nums sm:text-3xl ${textCls}`}>
        {value}
      </span>
      <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-amber-400">
        {label}
      </span>
    </div>
  )
}

/** Ligne de la grille principale (un signalement).
 *  Feature W1 — rappel 15 min : si le signalement est EN_ATTENTE/EN_COURS
 *  depuis plus de 15 min, la ligne prend une teinte rouge (bg-red-950/30),
 *  un badge pulsant "EN RETARD" s'affiche, et la colonne "Il y a" passe
 *  en rouge gras.
 *
 *  Feature WB2 #3 — Actions rapides : une 6e colonne "Actions" est ajoutée
 *  sur sm+ avec 3 boutons icônes (🔧 assigner, 📞 appeler ops, 📢 escalader). */
function BoardRow({
  r,
  fresh,
  onActionFeedback,
}: {
  r: RecentReport
  fresh: boolean
  onActionFeedback?: (msg: string, kind?: 'ok' | 'err') => void
}) {
  const s = statutMeta(r.statut)
  const team = teamMeta(r.routedTeam)
  const [showAssignMenu, setShowAssignMenu] = useState(false)
  const [busy, setBusy] = useState(false)
  // Temps écoulé en minutes depuis la création du signalement
  const elapsedMin = Math.floor(
    (Date.now() - new Date(r.createdAt).getTime()) / 60000,
  )
  const isLate = elapsedMin > 15 && r.statut !== 'RESOLU'
  // Fond teinté rouge pour toutes les cellules quand en retard
  const cellBg = isLate ? 'bg-red-950/30' : 'bg-[#1a1a1a]'
  const lateBadge = (
    <span className="inline-flex animate-pulse items-center gap-1 rounded border border-red-500 bg-red-500/20 px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-red-400">
      <OctagonAlert className="size-2.5" aria-hidden />
      EN RETARD
    </span>
  )

  // --- Actions handlers ---
  // 🔧 Assign/Reroute — POST /api/airport/assign avec method=push (le
  // backend met à jour assignedTo et log côté serveur). On passe le
  // "team" cible dans le champ phone (pas idéal mais permet de logguer
  // le rerouting sans modifier l'API). L'API renvoie { ok: true, data }.
  const handleAssign = useCallback(
    async (teamKey: TeamKey) => {
      setShowAssignMenu(false)
      setBusy(true)
      try {
        const res = await fetch('/api/airport/assign', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            reportId: r.id,
            method: 'push',
            // Le champ `phone` du payload assign est utilisé par le
            // backend pour setter assignedTo. On y place le team cible
            // pour tracer le rerouting côté ops.
            phone: `team:${teamKey}`,
            message: `Rerouting ops vers ${TEAM_META[teamKey].label}`,
          }),
        })
        const json = (await res.json()) as { ok?: boolean; error?: string }
        if (json?.ok) {
          onActionFeedback?.(
            `Affecté à ${TEAM_META[teamKey].label} — ${r.zone?.nom ?? 'zone'}`,
            'ok',
          )
        } else {
          onActionFeedback?.(json?.error ?? 'Échec assignation', 'err')
        }
      } catch {
        onActionFeedback?.('Erreur réseau assignation', 'err')
      } finally {
        setBusy(false)
      }
    },
    [r.id, r.zone?.nom, onActionFeedback],
  )

  // 📞 Call — ouvre le deep link tel: vers le PC ops
  const handleCall = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.open('tel:+221784858226', '_self')
    }
    onActionFeedback?.('Appel ops center en cours…', 'ok')
  }, [onActionFeedback])

  // 📢 Escalate — POST /api/airport/staff-scan avec action=TAKE_CHARGE
  // par "wallboard_supervisor". Cela déclenche l'escalade Denise
  // (report → EN_COURS + audit + voice sur le prochain poll).
  const handleEscalate = useCallback(async () => {
    setBusy(true)
    try {
      const res = await fetch('/api/airport/staff-scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          staffTag: 'wallboard_supervisor',
          action: 'TAKE_CHARGE',
          reportId: r.id,
          staffName: 'wallboard_supervisor',
          message: `Escalade manuelle wallboard — ${r.problemType}`,
        }),
      })
      const json = (await res.json()) as { ok?: boolean; error?: string }
      if (json?.ok) {
        onActionFeedback?.(
          `Escalade Denise déclenchée — ${r.zone?.nom ?? 'zone'}`,
          'ok',
        )
      } else {
        onActionFeedback?.(json?.error ?? 'Échec escalade', 'err')
      }
    } catch {
      onActionFeedback?.('Erreur réseau escalade', 'err')
    } finally {
      setBusy(false)
    }
  }, [r.id, r.zone?.nom, r.problemType, onActionFeedback])

  return (
    <div
      role="row"
      className={`grid shrink-0 grid-cols-[1fr_1.4fr] gap-1.5 sm:grid-cols-[1.2fr_2.5fr_1fr_1.3fr_0.8fr_0.6fr] ${
        fresh ? 'animate-in fade-in slide-in-from-top-2 duration-500' : ''
      }`}
    >
      {/* ZONE — toujours visible (mobile + desktop) */}
      <div
        role="cell"
        className={`flex min-w-0 items-center gap-2 rounded-md ${cellBg} px-3 py-2`}
      >
        <span className="text-base leading-none" aria-hidden>
          {r.zone?.emoji ?? '📍'}
        </span>
        <span className="truncate font-mono text-sm font-semibold text-amber-400">
          {r.zone?.nom ?? 'Zone inconnue'}
        </span>
      </div>

      {/* PROBLÈME — toujours visible (mobile + desktop) */}
      <div
        role="cell"
        className={`flex min-w-0 items-center gap-2 rounded-md ${cellBg} px-3 py-2`}
      >
        <span className="truncate font-mono text-sm text-white" title={r.problemType}>
          {r.problemType}
        </span>
        {/* Badge EN RETARD visible sur mobile (la colonne statut est masquée) */}
        {isLate && (
          <span className="ml-auto shrink-0 sm:hidden">{lateBadge}</span>
        )}
      </div>

      {/* STATUT — masqué sur mobile (trop étroit pour le badge) */}
      <div
        role="cell"
        className={`hidden items-center gap-1.5 rounded-md ${cellBg} px-3 py-2 sm:flex`}
      >
        <span
          className={`inline-flex items-center gap-1.5 rounded border px-2 py-0.5 font-mono text-[11px] font-bold uppercase tracking-wider ${s.badge}`}
        >
          <span className={`size-1.5 rounded-full ${s.dot}`} aria-hidden />
          {s.label}
        </span>
        {isLate && lateBadge}
      </div>

      {/* ÉQUIPE — masqué sur mobile */}
      <div
        role="cell"
        className={`hidden min-w-0 items-center gap-1.5 rounded-md ${cellBg} px-3 py-2 sm:flex`}
      >
        {team ? (
          <>
            <span className="text-sm leading-none" aria-hidden>
              {team.emoji}
            </span>
            <span className="truncate font-mono text-sm text-amber-400">{team.label}</span>
          </>
        ) : (
          <span className="font-mono text-sm text-neutral-600">—</span>
        )}
      </div>

      {/* IL Y A — masqué sur mobile. Rouge + gras quand en retard (> 15 min) */}
      <div
        role="cell"
        className={`hidden items-center justify-end rounded-md ${cellBg} px-3 py-2 sm:flex`}
      >
        <span
          className={`font-mono text-sm tabular-nums ${
            isLate ? 'font-bold text-red-400' : 'text-white'
          }`}
        >
          {relativeTime(r.createdAt)}
        </span>
      </div>

      {/* ACTIONS — Task WB2 Feature 3. Masqué sur mobile (sm+). */}
      <div
        role="cell"
        className={`relative hidden items-center justify-center gap-1 rounded-md ${cellBg} px-1.5 py-2 sm:flex`}
      >
        {/* 🔧 Assign/Reroute */}
        <button
          type="button"
          onClick={() => setShowAssignMenu((v) => !v)}
          disabled={busy}
          aria-label="Assigner ou rerouter le signalement"
          title="Assigner / rerouter"
          className="flex size-7 items-center justify-center rounded border border-amber-500/30 text-amber-400 transition-colors hover:border-amber-400 hover:bg-amber-500/10 disabled:opacity-50"
        >
          <Wrench className="size-3.5" aria-hidden />
        </button>
        {/* 📞 Call */}
        <button
          type="button"
          onClick={handleCall}
          aria-label="Appeler le PC ops"
          title="Appeler PC ops (+221 78 485 8226)"
          className="flex size-7 items-center justify-center rounded border border-sky-500/30 text-sky-400 transition-colors hover:border-sky-400 hover:bg-sky-500/10"
        >
          <Phone className="size-3.5" aria-hidden />
        </button>
        {/* 📢 Escalate */}
        <button
          type="button"
          onClick={handleEscalate}
          disabled={busy}
          aria-label="Escalader auprès de Denise"
          title="Escalader (Denise TAKE_CHARGE)"
          className="flex size-7 items-center justify-center rounded border border-red-500/40 text-red-400 transition-colors hover:border-red-400 hover:bg-red-500/10 disabled:opacity-50"
        >
          <Megaphone className="size-3.5" aria-hidden />
        </button>
        {/* Dropdown menu pour l'assignation */}
        {showAssignMenu && (
          <div
            role="menu"
            className="absolute right-0 top-full z-20 mt-1 w-40 rounded-md border border-amber-500/40 bg-black p-1 shadow-lg"
          >
            <p className="px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-amber-400">
              Rerouter vers
            </p>
            {(Object.keys(TEAM_META) as TeamKey[])
              .filter((k) => k !== 'other')
              .map((k) => (
                <button
                  key={k}
                  type="button"
                  role="menuitem"
                  onClick={() => void handleAssign(k)}
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left font-mono text-xs text-white transition-colors hover:bg-amber-500/10"
                >
                  <span aria-hidden>{TEAM_META[k].emoji}</span>
                  <span>{TEAM_META[k].label}</span>
                </button>
              ))}
          </div>
        )}
      </div>
    </div>
  )
}

/** Ligne "emplacement vide" — dots muted gray, comme un vrai departure board.
 *  Responsive : 2 colonnes sur mobile (zone + problème), 6 sur sm+ (avec Actions). */
function PlaceholderRow() {
  return (
    <div
      role="row"
      aria-hidden
      className="grid shrink-0 grid-cols-[1fr_1.4fr] gap-1.5 sm:grid-cols-[1.2fr_2.5fr_1fr_1.3fr_0.8fr_0.6fr]"
    >
      <div className="rounded-md bg-[#1a1a1a] px-3 py-2 font-mono text-sm text-neutral-700">
        · · · · ·
      </div>
      <div className="truncate rounded-md bg-[#1a1a1a] px-3 py-2 font-mono text-sm text-neutral-700">
        · · · · · · · · · ·
      </div>
      <div className="hidden rounded-md bg-[#1a1a1a] px-3 py-2 font-mono text-sm text-neutral-700 sm:block">
        · · ·
      </div>
      <div className="hidden rounded-md bg-[#1a1a1a] px-3 py-2 font-mono text-sm text-neutral-700 sm:block">
        · · · ·
      </div>
      <div className="hidden rounded-md bg-[#1a1a1a] px-3 py-2 text-right font-mono text-sm text-neutral-700 sm:block">
        · · ·
      </div>
      <div className="hidden rounded-md bg-[#1a1a1a] px-3 py-2 text-center font-mono text-sm text-neutral-700 sm:block">
        · · ·
      </div>
    </div>
  )
}

/** Ligne SLA par zone (footer gauche) */
function SlaBottomRow({ zone, sla }: { zone: ZoneAgg; sla?: SlaStats }) {
  if (!sla || sla.targetMinutes === null) {
    return (
      <div className="flex items-center gap-2 rounded-md bg-[#1a1a1a] px-3 py-1.5">
        <span className="text-sm leading-none" aria-hidden>
          {zone.emoji}
        </span>
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-white">
          {zone.nom}
        </span>
        <span className="font-mono text-[10px] uppercase text-neutral-600">N/A</span>
      </div>
    )
  }
  const pct = sla.slaCompliancePercent
  const hasResolutions = sla.resolvedCount > 0
  const pctCls = !hasResolutions
    ? 'text-neutral-500'
    : pct >= 80
      ? 'text-green-500'
      : pct >= 60
        ? 'text-amber-400'
        : 'text-red-500'
  return (
    <div className="flex items-center gap-2 rounded-md bg-[#1a1a1a] px-3 py-1.5">
      <span className="text-sm leading-none" aria-hidden>
        {zone.emoji}
      </span>
      <span className="min-w-0 flex-1 truncate font-mono text-xs text-white" title={zone.nom}>
        {zone.nom}
      </span>
      <span className="font-mono text-[10px] tabular-nums text-amber-400">
        ≤{sla.targetMinutes}m
      </span>
      <span
        className={`w-12 text-right font-mono text-xs font-bold tabular-nums ${pctCls}`}
        title={`Moyenne résolution : ${sla.avgResolutionMinutes ?? '—'} min · Retards : ${sla.pendingBreaches}`}
      >
        {hasResolutions ? `${pct}%` : '—'}
      </span>
    </div>
  )
}

/** Ligne charge par zone (footer droit) — barre amber + count */
function ZoneChargeRow({ zone, max }: { zone: ZoneAgg; max: number }) {
  const pct = max > 0 ? Math.max(2, Math.round((zone.count_en_attente / max) * 100)) : 0
  const barCls =
    zone.count_en_attente > 5
      ? 'bg-red-500'
      : zone.count_en_attente > 0
        ? 'bg-amber-400'
        : 'bg-neutral-700'
  return (
    <div className="flex items-center gap-2 rounded-md bg-[#1a1a1a] px-3 py-1.5">
      <span className="text-sm leading-none" aria-hidden>
        {zone.emoji}
      </span>
      <span className="min-w-0 flex-1 truncate font-mono text-xs text-white" title={zone.nom}>
        {zone.nom}
      </span>
      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-black/60">
        <div
          className={`h-full ${barCls} transition-all duration-700`}
          style={{ width: `${zone.count_en_attente === 0 ? 0 : pct}%` }}
        />
      </div>
      <span className="w-8 text-right font-mono text-xs font-bold tabular-nums text-white">
        {zone.count_en_attente}
      </span>
    </div>
  )
}

// --- Squelettes de chargement ---
function StatSkeleton() {
  return <div className="h-[68px] animate-pulse rounded-md bg-[#1a1a1a]" />
}

function RowSkeleton() {
  return (
    <div className="grid shrink-0 grid-cols-[1fr_1.4fr] gap-1.5 sm:grid-cols-[1.2fr_2.5fr_1fr_1.3fr_0.8fr_0.6fr]">
      <div className="h-11 animate-pulse rounded-md bg-[#1a1a1a]" />
      <div className="h-11 animate-pulse rounded-md bg-[#1a1a1a]" />
      <div className="hidden h-11 animate-pulse rounded-md bg-[#1a1a1a] sm:block" />
      <div className="hidden h-11 animate-pulse rounded-md bg-[#1a1a1a] sm:block" />
      <div className="hidden h-11 animate-pulse rounded-md bg-[#1a1a1a] sm:block" />
      <div className="hidden h-11 animate-pulse rounded-md bg-[#1a1a1a] sm:block" />
    </div>
  )
}

function MiniRowSkeleton() {
  return <div className="h-8 animate-pulse rounded-md bg-[#1a1a1a]" />
}

// ---------------------------------------------------------------
// Helpers son — Ding + TTS (synthèse vocale navigateur)
// ---------------------------------------------------------------
// Le wallboard émet un "ding" à chaque nouveau signalement, suivi
// d'une annonce vocale (TTS) qui décrit le problème. Les alertes
// critiques déclenchent un ding différent (grave) + une annonce
// "Alerte critique". L'utilisateur peut couper le son via un
// bouton 🔊/🔇 dans le header (préférence persistée en localStorage).
//
// Politique autoplay : les navigateurs bloquent l'audio sans
// interaction utilisateur. On active donc le son au premier clic
// sur le bouton mute (qui passe alors en "son activé"). Avant ça,
// le TTS et le ding sont silencieux (mais l'animation visuelle
// continue de fonctionner).

const SOUND_NORMAL = '/sounds/ding-dong.mp3'
const SOUND_CRITICAL = '/sounds/ding-critical.wav'
const SOUND_RESOLVED = '/sounds/resolved.wav'

/** Joue un fichier son si l'audio est activé */
function playSound(src: string, audioRef: React.RefObject<HTMLAudioElement | null>) {
  const a = audioRef.current
  if (!a) return
  a.src = src
  a.volume = 0.6
  a.play().catch(() => {
    // Autoplay bloqué — silencieux, l'utilisateur doit cliquer
  })
}

/** Annonce vocale via Web Speech API (synthèse navigateur) */
function speak(text: string, enabled: boolean) {
  if (!enabled) return
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return
  try {
    window.speechSynthesis.cancel() // coupe l'annonce précédente
    const u = new SpeechSynthesisUtterance(text)
    u.lang = 'fr-FR'
    u.rate = 1.05
    u.pitch = 1.0
    u.volume = 0.9
    window.speechSynthesis.speak(u)
  } catch {
    // TTS indisponible — silencieux
  }
}

// ============================================================
// Voice Decision Engine — Denise "réfléchit" avant de parler
// ------------------------------------------------------------
// Au lieu d'appeler speak() directement pour chaque nouveau signalement,
// on interroge POST /api/voice/decide. Le moteur applique :
//   1. La règle configurée pour (aeroport, eventType)
//   2. Le mode horaire (night / service_lunch / etc.)
//   3. L'agrégation (max N annonces / fenêtre par zone)
//   4. La déduplication (anti-double-scan < 60s, anti-doublon < 120s)
//
// Si shouldSpeak=true → speak(decision.message, true).
// Sinon → silence (le wallboard affiche visuellement le signalement
// mais n'émet pas de TTS — Denise décide qu'il n'est pas pertinent
// de parler pour cet événement à cette heure / pour cette zone).
// ============================================================
type VoiceEvent = {
  sector: 'aeroport' | 'restaurant'
  eventType: string
  zone?: string
  type?: string
  temps?: string
  table?: string
  produit?: string
  detail?: string
  reportId?: string
  staffName?: string
}
type VoiceDecision = {
  shouldSpeak: boolean
  priority: string
  tone: string
  volumeAdjustment: string
  message: string
  targetAudience: string[]
  aggregateId: string | null
  suppressUntil: string | null
  reason: string
}

async function decideAndSpeakForWallboard(event: VoiceEvent): Promise<VoiceDecision | null> {
  try {
    const res = await fetch('/api/voice/decide', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event }),
    })
    if (!res.ok) return null
    const json = (await res.json()) as { decision?: VoiceDecision }
    const decision = json.decision
    if (!decision) return null
    if (decision.shouldSpeak && decision.message) {
      speak(decision.message, true)
    }
    return decision
  } catch {
    return null
  }
}

/** Triple-ding d'escalade — généré via Web Audio API (660/880/990 Hz).
 *  Utilisé pour le rappel 15 min : quand un signalement EN_ATTENTE/EN_COURS
 *  franchit un seuil (15, 20, 25, 30… min), on joue ce triple-ding pour
 *  forcer l'attention du superviseur ops. Aucun fichier audio nécessaire. */
function playEscalationDing() {
  if (typeof window === 'undefined') return
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext
    if (!AudioCtx) return
    const ctx = new AudioCtx()
    if (ctx.state === 'suspended') void ctx.resume().catch(() => {})
    const tones = [660, 880, 990]
    tones.forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      const startTime = ctx.currentTime + i * 0.18
      gain.gain.setValueAtTime(0, startTime)
      gain.gain.linearRampToValueAtTime(0.25, startTime + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.16)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(startTime)
      osc.stop(startTime + 0.17)
    })
    // Ferme le contexte après la fin des 3 tons (~0.7s)
    setTimeout(() => ctx.close().catch(() => {}), 900)
  } catch {
    // Web Audio indisponible — silencieux
  }
}

// ---------------------------------------------------------------
// Task WB2 — Sous-composants additionnels
// ---------------------------------------------------------------

/**
 * Feature WB2 #1 — Vue Cartographique.
 * Carte schématique CSS de l'aéroport regroupant les zones par famille
 * (EXTÉRIEUR, SÛRETÉ, TERMINAL, COMMERCIAL, SERVICE). Chaque zone est
 * un box cliquable qui filtre le board ci-dessous.
 *
 * - Container : rounded-xl bg-black p-3
 * - Zone box : rounded-lg p-2 text-center, border coloré par statut
 * - Critical zones : animate-pulse border-red-500 bg-red-500/10
 * - Grid : grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-8 gap-2
 * - Section labels : text-[10px] uppercase tracking-wider text-amber-400
 */
function ZoneMapSection({
  zones,
  filterZone,
  onSelectZone,
}: {
  zones: ZoneAgg[]
  filterZone: string | null
  onSelectZone: (code: string | null) => void
}) {
  // Groupe les zones par famille, en excluant la famille HISTORIQUE
  // (doublons avec term_* / sanitaires etc.) si des zones cataloguées
  // existent déjà pour la même famille.
  const byFamily = useMemo(() => {
    const groups: Partial<Record<Exclude<ZoneFamily, 'HISTORIQUE'>, ZoneAgg[]>> = {}
    for (const z of zones) {
      const fam = zoneFamily(z.code)
      if (fam === 'HISTORIQUE') continue
      if (!groups[fam]) groups[fam] = []
      groups[fam]!.push(z)
    }
    return groups
  }, [zones])

  const families: Exclude<ZoneFamily, 'HISTORIQUE'>[] = [
    'EXTÉRIEUR',
    'SÛRETÉ',
    'TERMINAL',
    'COMMERCIAL',
    'SERVICE',
  ]

  return (
    <section
      aria-label="Vue cartographique des zones aéroport"
      className="shrink-0 rounded-xl bg-black p-3"
    >
      {/* En-tête de section */}
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <MapIcon className="size-3.5 text-amber-400" aria-hidden />
          <h2 className="font-mono text-[11px] font-bold uppercase tracking-wider text-amber-400">
            Carte temps réel · {zones.length} zones
          </h2>
        </div>
        {filterZone && (
          <button
            type="button"
            onClick={() => onSelectZone(null)}
            className="flex items-center gap-1 rounded border border-amber-500/40 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-amber-400 transition-colors hover:bg-amber-500/10"
          >
            ✕ Filtre: {filterZone}
          </button>
        )}
      </div>

      {/* Familles de zones */}
      <div className="flex flex-col gap-2">
        {families.map((fam) => {
          const famZones = byFamily[fam] ?? []
          if (famZones.length === 0) return null
          return (
            <div key={fam} className="flex flex-col gap-1.5">
              <span className="font-mono text-[10px] uppercase tracking-wider text-amber-400">
                {fam}
              </span>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-8">
                {famZones.map((z) => {
                  const st = zoneStatus(z.count_en_attente)
                  const meta = ZONE_STATUS_META[st]
                  const isActive = filterZone === z.code
                  return (
                    <button
                      key={z.code}
                      type="button"
                      onClick={() =>
                        onSelectZone(isActive ? null : z.code)
                      }
                      aria-pressed={isActive}
                      title={`${z.nom} — ${meta.label} · ${z.count_en_attente} en attente`}
                      className={`flex flex-col items-center justify-center gap-0.5 rounded-lg border p-2 text-center transition-all ${meta.ring} ${
                        isActive ? 'ring-2 ring-amber-400 ring-offset-1 ring-offset-black' : ''
                      }`}
                    >
                      <span className="text-base leading-none" aria-hidden>
                        {z.emoji}
                      </span>
                      <span
                        className={`w-full truncate font-mono text-[10px] font-semibold ${isActive ? 'text-amber-300' : 'text-white'}`}
                      >
                        {truncateName(z.nom, 14)}
                      </span>
                      <div className="flex items-center gap-1">
                        <span
                          className={`size-1.5 rounded-full ${meta.dot}`}
                          aria-hidden
                        />
                        <span
                          className={`font-mono text-[10px] font-bold tabular-nums ${meta.text}`}
                        >
                          {z.count_en_attente}
                        </span>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {/* Légende */}
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-neutral-800 pt-2 font-mono text-[10px] uppercase tracking-wider text-neutral-500">
        <span className="flex items-center gap-1">
          <span className="size-1.5 rounded-full bg-green-500" aria-hidden /> Calme (0)
        </span>
        <span className="flex items-center gap-1">
          <span className="size-1.5 rounded-full bg-amber-400" aria-hidden /> Attention (1-2)
        </span>
        <span className="flex items-center gap-1">
          <span className="size-1.5 rounded-full bg-red-500" aria-hidden /> Critique (3+)
        </span>
        <span className="ml-auto hidden text-neutral-600 sm:inline">
          Clic sur une zone pour filtrer le board
        </span>
      </div>
    </section>
  )
}

/**
 * Feature WB2 #2 — KPI Temps Réel (tuiles additionnelles).
 * Tuile "decision-oriented" : gros chiffre monospace, label amber,
 * et badge de tendance / état optionnel (↑↓ / warning).
 */
function EnhancedKpiTile({
  icon: Icon,
  label,
  value,
  trend,
  trendDir,
  warning,
  accent = 'white',
}: {
  icon: typeof Clock
  label: string
  value: string | number
  trend?: string
  trendDir?: 'up' | 'down' | 'flat'
  warning?: boolean
  accent?: 'white' | 'amber' | 'sky' | 'green' | 'red'
}) {
  const textCls = {
    white: 'text-white',
    amber: 'text-amber-400',
    sky: 'text-sky-400',
    green: 'text-green-500',
    red: 'text-red-400',
  }[accent]
  const TrendIcon =
    trendDir === 'up' ? TrendingUp : trendDir === 'down' ? TrendingDown : null
  return (
    <div
      className={`relative flex flex-col items-center justify-center gap-0.5 rounded-md bg-[#1a1a1a] px-3 py-2 ${
        warning ? 'border border-red-500/40' : ''
      }`}
    >
      {warning && (
        <span className="absolute right-1 top-1 flex size-1.5 animate-pulse rounded-full bg-red-500" aria-hidden />
      )}
      <div className="flex items-center gap-1">
        <Icon className={`size-3 ${textCls}`} aria-hidden />
        <span
          className={`font-mono text-2xl font-bold tabular-nums sm:text-3xl ${textCls}`}
        >
          {value}
        </span>
        {TrendIcon && trend && (
          <span className="flex items-center gap-0.5 font-mono text-[10px] text-neutral-400">
            <TrendIcon className="size-3" aria-hidden />
            {trend}
          </span>
        )}
      </div>
      <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-amber-400">
        {label}
      </span>
    </div>
  )
}

/**
 * Feature WB2 #6 — Barres d'info (top performer / zone critique / tendance).
 * Chaque barre est une ligne horizontale compacte accent couleur + icône.
 */
function InfoBar({
  icon: Icon,
  label,
  value,
  accent = 'neutral',
  detail,
}: {
  icon: typeof Trophy
  label: string
  value: string
  detail?: string
  accent?: 'emerald' | 'amber' | 'neutral'
}) {
  const accentCls = {
    emerald: {
      bar: 'bg-emerald-500',
      icon: 'text-emerald-400',
      label: 'text-emerald-400',
    },
    amber: {
      bar: 'bg-amber-400',
      icon: 'text-amber-400',
      label: 'text-amber-400',
    },
    neutral: {
      bar: 'bg-neutral-500',
      icon: 'text-neutral-300',
      label: 'text-neutral-300',
    },
  }[accent]
  return (
    <div className="flex items-center gap-3 rounded-md bg-[#1a1a1a] px-3 py-1.5">
      <span className={`h-8 w-1 shrink-0 rounded-full ${accentCls.bar}`} aria-hidden />
      <Icon className={`size-4 shrink-0 ${accentCls.icon}`} aria-hidden />
      <div className="flex min-w-0 flex-1 items-baseline gap-2">
        <span
          className={`shrink-0 font-mono text-[10px] font-bold uppercase tracking-wider ${accentCls.label}`}
        >
          {label}
        </span>
        <span className="min-w-0 flex-1 truncate font-mono text-sm text-white">
          {value}
        </span>
        {detail && (
          <span className="shrink-0 font-mono text-[10px] tabular-nums text-neutral-500">
            {detail}
          </span>
        )}
      </div>
    </div>
  )
}

/**
 * Feature WB2 #4 — Mode Crise : bouton header + timer.
 * Bouton pulsant rouge "MODE CRISE". Quand actif, devient vert
 * "FIN DE CRISE" + affiche un timer "CRISE ACTIVE DEPUIS HH:MM:SS".
 */
function CrisisButton({
  active,
  onStart,
  onEnd,
  elapsedSec,
}: {
  active: boolean
  onStart: () => void
  onEnd: () => void
  elapsedSec: number
}) {
  if (active) {
    return (
      <div className="flex items-center gap-2">
        <div className="flex flex-col items-end leading-tight">
          <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-red-200">
            CRISE ACTIVE
          </span>
          <span
            suppressHydrationWarning
            className="font-mono text-xs font-bold tabular-nums text-red-100"
          >
            DEPUIS {formatDurationSec(elapsedSec)}
          </span>
        </div>
        <button
          type="button"
          onClick={onEnd}
          aria-pressed={active}
          aria-label="Désactiver le mode crise"
          title="Terminer la crise"
          className="flex items-center gap-1.5 rounded-lg bg-green-500 px-3 py-1.5 text-sm font-bold uppercase tracking-wider text-black transition-transform hover:scale-105"
        >
          <ShieldAlert className="size-4" aria-hidden />
          FIN DE CRISE
        </button>
      </div>
    )
  }
  return (
    <button
      type="button"
      onClick={onStart}
      aria-pressed={false}
      aria-label="Activer le mode crise"
      title="Mode crise : filtre les incidents critiques uniquement"
      className="flex items-center gap-1.5 rounded-lg border-2 border-red-500 bg-red-600 px-3 py-1.5 text-sm font-bold uppercase tracking-wider text-white animate-pulse transition-transform hover:scale-105"
    >
      <ShieldAlert className="size-4" aria-hidden />
      MODE CRISE
    </button>
  )
}

// ---------------------------------------------------------------
// Page principale
// ---------------------------------------------------------------
export default function OpsWallboardPage() {
  const [data, setData] = useState<WallboardData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState<Date>(() => new Date())
  const [freshIds, setFreshIds] = useState<Set<string>>(new Set())
  const seenIdsRef = useRef<Set<string>>(new Set())
  const firstLoadRef = useRef<boolean>(true)
  // Track des statuts précédents pour détecter les résolutions
  // (quand un signalement passe de EN_ATTENTE/EN_COURS → RESOLU)
  const previousStatusRef = useRef<Map<string, string>>(new Map())
  // Track des IDs déjà annoncés comme résolus (anti-spam — évite de
  // re-annoncer la même résolution à chaque poll pendant 30s)
  const announcedResolvedRef = useRef<Set<string>>(new Set())

  // Feature W1 — rappel 15 min :
  // alertedLateRef : track des seuils d'escalade déjà alertés par signalement.
  //   Clé = `${reportId}-${threshold}min` (ex: "abc-15min", "abc-20min").
  //   Évite de rejouer le son d'escalade toutes les 5s de polling pour le
  //   même seuil franchi.
  const alertedLateRef = useRef<Set<string>>(new Set())
  // Indique si la première passe d'escalade a eu lieu. Au premier check
  // (chargement initial), on marque les seuils déjà franchis SANS sonner
  // (sinon le wallboard spammerait au démarrage pour tous les signalements
  // déjà en retard).
  const escalationStartedRef = useRef<boolean>(false)

  // --- État son (ding + TTS) ---
  // soundOn : false au démarrage (autoplay bloqué). L'utilisateur
  // clique le bouton 🔊 pour activer → true. Persistance localStorage.
  const [soundOn, setSoundOn] = useState<boolean>(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  // Track des IDs d'alertes déjà annoncées (évite de re-dire la même)
  const announcedAlertsRef = useRef<Set<string>>(new Set())
  // Bannière d'activation du son : affichée à l'ouverture si le son
  // n'est pas déjà activé. Se ferme après activation ou après 10s.
  const [showSoundBanner, setShowSoundBanner] = useState<boolean>(false)

  // --- État des alertes (poll 30s) ---
  const [alerts, setAlerts] = useState<TriggeredAlert[]>([])
  const [alertsError, setAlertsError] = useState<string | null>(null)

  // --- Task WB2 — États additionnels ---
  // Feature #1 : zone sélectionnée sur la carte → filtre le board.
  //   null = toutes les zones ; sinon ne montre que les signalements
  //   dont r.zone?.code === filterZone.
  const [filterZone, setFilterZone] = useState<string | null>(null)
  // Feature #4 : Mode Crise.
  //   crisisMode=true → board filtré aux incidents critiques + overlay
  //   bg-red-950/20 + Denise en mode "crisis" (uniquement critiques).
  //   crisisStart = Date d'activation (pour le timer "DEPUIS HH:MM:SS").
  //   crisisSummary = message affiché 6s après désactivation ("Crise
  //   terminée — Durée: Xmin Ys").
  const [crisisMode, setCrisisMode] = useState<boolean>(false)
  const [crisisStart, setCrisisStart] = useState<Date | null>(null)
  const [crisisSummary, setCrisisSummary] = useState<string | null>(null)
  // Feature #6 : Top performer du jour (fetch /api/airport/leaderboard).
  const [leaderboard, setLeaderboard] = useState<LeaderboardData | null>(null)
  // Toast feedback pour les Actions rapides (Feature #3).
  const [actionToast, setActionToast] = useState<{ msg: string; kind: 'ok' | 'err' } | null>(null)

  // --- Polling API toutes les 5s ---
  const poll = useCallback(async () => {
    try {
      const d = await fetchWallboard()
      // Détecte les nouveaux IDs (jamais vus) pour l'animation d'entrée
      const newFresh = new Set<string>()
      const newReports: RecentReport[] = []
      for (const r of d.recent_reports) {
        if (!seenIdsRef.current.has(r.id)) {
          newFresh.add(r.id)
          seenIdsRef.current.add(r.id)
          newReports.push(r)
        }
      }
      // Sur le tout premier chargement, on n'anime pas (sinon les 10
      // lignes existantes déclenchent une vague d'animation)
      if (firstLoadRef.current) {
        firstLoadRef.current = false
        setFreshIds(new Set())
      } else {
        setFreshIds(newFresh)
        // Nettoie les flags "fresh" après 1.5s pour qu'un re-render ultérieur
        // ne rejoue pas l'animation
        if (newFresh.size > 0) {
          setTimeout(() => setFreshIds(new Set()), 1500)
          // --- DING + TTS pour chaque nouveau signalement ---
          // On prend le plus récent (le tableau est trié desc par l'API).
          // Si plusieurs arrivent dans le même poll, on annonce le dernier
          // (évite une cacophonie de TTS).
          if (soundOn && newReports.length > 0) {
            const latest = newReports[0]
            playSound(SOUND_NORMAL, audioRef)
            // VDE — Voice Decision Engine :
            // Au lieu de forcer un TTS "Urgence. [Zone]…", on interroge le
            // moteur /api/voice/decide qui renvoie :
            //   - shouldSpeak=false → Denise se tait (mode nuit, doublon,
            //     agrégation saturée…). Le ding a déjà sonné pour attirer
            //     l'attention visuelle.
            //   - shouldSpeak=true → speak(decision.message) avec le
            //     template rendu côté serveur.
            const zoneNom = latest.zone?.nom ?? latest.tagScanne
            const elapsedMs = Date.now() - new Date(latest.createdAt).getTime()
            const tempsMin = Math.max(1, Math.floor(elapsedMs / 60000))
            void decideAndSpeakForWallboard({
              sector: 'aeroport',
              eventType: 'new_scan',
              zone: zoneNom,
              type: latest.problemType,
              temps: `${tempsMin} min`,
              reportId: latest.id,
            })
          }
        }
      }

      // --- Détection des résolutions (son "résolu") ---
      // APPROCHE ROBUSTE : l'API renvoie recently_resolved (signalements
      // résolus dans les dernières 30s). On joue le son pour ceux qu'on
      // n'a pas encore annoncés (anti-spam via announcedResolvedRef).
      if (soundOn && d.recently_resolved && d.recently_resolved.length > 0) {
        for (const r of d.recently_resolved) {
          if (!announcedResolvedRef.current.has(r.id)) {
            announcedResolvedRef.current.add(r.id)
            playSound(SOUND_RESOLVED, audioRef)
            const zoneNom = r.zone?.nom ?? r.tagScanne
            // Denise annonce la résolution comme un ordre accompli
            setTimeout(() => speak(`Signalement résolu. ${zoneNom}. ${r.problemType}. Bien fait.`, soundOn), 400)
            break // une seule annonce par poll
          }
        }
      }
      // Nettoie les IDs qui ne sont plus dans recently_resolved
      // (pour pouvoir re-annoncer si une nouvelle résolution arrive)
      if (d.recently_resolved) {
        const activeIds = new Set(d.recently_resolved.map(r => r.id))
        for (const id of [...announcedResolvedRef.current]) {
          if (!activeIds.has(id)) announcedResolvedRef.current.delete(id)
        }
      }
      // Met à jour les statuts précédents (fallback pour l'approche précédente)
      for (const r of d.recent_reports) {
        previousStatusRef.current.set(r.id, r.statut)
      }

      setData(d)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'erreur inconnue')
    }
  }, [soundOn])

  useEffect(() => {
    // Premier poll différé (setTimeout 0) pour ne pas appeler setState
    // directement dans le corps de l'effect (rule react-hooks/set-state-in-effect).
    const initial = setTimeout(() => void poll(), 0)
    const api = setInterval(() => void poll(), 5000)
    return () => {
      clearTimeout(initial)
      clearInterval(api)
    }
  }, [poll])

  // --- Polling alertes toutes les 30s ---
  const pollAlerts = useCallback(async () => {
    try {
      const a = await fetchAlerts()
      // --- DING CRITIQUE pour les nouvelles alertes ---
      // On annonce uniquement les alertes critiques jamais annoncées
      // (évite de re-dire la même alerte tous les 30s).
      if (soundOn) {
        for (const alert of a) {
          const alertKey = `${alert.thresholdId}-${alert.type}`
          if (!announcedAlertsRef.current.has(alertKey) && alert.severity === 'critical') {
            announcedAlertsRef.current.add(alertKey)
            playSound(SOUND_CRITICAL, audioRef)
            setTimeout(() => speak(`Alerte critique. ${alert.message}`, soundOn), 500)
            break // une seule annonce par poll (évite la cacophonie)
          }
        }
        // Nettoie les alertes qui ne sont plus actives (pour pouvoir
        // re-annoncer si elles reviennent plus tard)
        const activeKeys = new Set(a.map(al => `${al.thresholdId}-${al.type}`))
        for (const k of [...announcedAlertsRef.current]) {
          if (!activeKeys.has(k)) announcedAlertsRef.current.delete(k)
        }
      }
      setAlerts(a)
      setAlertsError(null)
    } catch (e) {
      setAlertsError(e instanceof Error ? e.message : 'erreur alertes')
    }
  }, [soundOn])

  useEffect(() => {
    const initial = setTimeout(() => void pollAlerts(), 1500)
    const api = setInterval(() => void pollAlerts(), 30000)
    return () => {
      clearTimeout(initial)
      clearInterval(api)
    }
  }, [pollAlerts])

  // --- Task WB2 — Polling leaderboard (Feature #6 Top Performer) ---
  // Poll léger toutes les 60s (pas besoin de fraîcheur 5s pour un
  // classement mensuel qui change lentement).
  useEffect(() => {
    const fetchLeaderboard = async () => {
      try {
        const res = await fetch('/api/airport/leaderboard', { cache: 'no-store' })
        if (!res.ok) return
        const json = (await res.json()) as { ok?: boolean; data?: LeaderboardData }
        if (json?.ok && json.data) setLeaderboard(json.data)
      } catch {
        // silently ignore — le leaderboard est optionnel
      }
    }
    const initial = setTimeout(() => void fetchLeaderboard(), 2000)
    const api = setInterval(() => void fetchLeaderboard(), 60000)
    return () => {
      clearTimeout(initial)
      clearInterval(api)
    }
  }, [])

  // --- Task WB2 — Mode Crise : activateurs / résumé (Feature #4) ---
  // Activation : playEscalationDing + TTS "Mode crise activé".
  // Désactivation : calcule la durée crise, l'affiche 6s en résumé,
  // et annonce "Crise terminée" par TTS.
  const handleCrisisStart = useCallback(() => {
    setCrisisMode(true)
    setCrisisStart(new Date())
    setCrisisSummary(null)
    playEscalationDing()
    if (soundOn) {
      setTimeout(
        () =>
          speak(
            'Mode crise activé. Board filtré sur incidents critiques. Denise en mode crise.',
            true,
          ),
        300,
      )
    }
  }, [soundOn])

  const handleCrisisEnd = useCallback(() => {
    setCrisisMode(false)
    if (crisisStart) {
      const elapsedSec = Math.round((Date.now() - crisisStart.getTime()) / 1000)
      const summary = `Crise terminée — Durée: ${formatDurationSec(elapsedSec)}`
      setCrisisSummary(summary)
      if (soundOn) {
        setTimeout(() => speak(summary, true), 200)
      }
      // Auto-dismiss après 6s
      setTimeout(() => setCrisisSummary(null), 6000)
    }
    setCrisisStart(null)
  }, [crisisStart, soundOn])

  // Durée crise en secondes (live, rafraîchi par l'horloge `now`)
  const crisisElapsedSec = useMemo(() => {
    if (!crisisMode || !crisisStart) return 0
    return Math.max(0, Math.round((now.getTime() - crisisStart.getTime()) / 1000))
  }, [crisisMode, crisisStart, now])

  // --- Task WB2 — Toast feedback Actions rapides (Feature #3) ---
  // Affiche un toast "ok"/"err" pendant 3.5s puis disparaît.
  const handleActionFeedback = useCallback((msg: string, kind: 'ok' | 'err' = 'ok') => {
    setActionToast({ msg, kind })
    setTimeout(() => setActionToast(null), 3500)
  }, [])

  // --- Feature W1 — Rappel 15 min : escalade sonore ---
  // Déclenché par `now` (1s) + `data` (5s) + `soundOn`.
  // Pour chaque signalement EN_ATTENTE/EN_COURS :
  //   - calcule elapsedMin depuis createdAt
  //   - si elapsedMin >= 15, détermine les seuils franchis (15, 20, 25, 30…)
  //   - pour chaque seuil NON déjà alerté : joue le triple-ding + TTS
  //     "Signalement en retard…" et marque le seuil dans alertedLateRef.
  // Nettoie les seuils des signalements résolus/disparus pour pouvoir
  // re-alerter si l'incident revient plus tard.
  useEffect(() => {
    if (!data) return
    const isFirstCheck = !escalationStartedRef.current
    escalationStartedRef.current = true
    const nowMs = Date.now()
    const activePendingIds = new Set<string>()
    for (const r of data.recent_reports) {
      if (r.statut === 'RESOLU') continue
      activePendingIds.add(r.id)
      const elapsedMin = Math.floor(
        (nowMs - new Date(r.createdAt).getTime()) / 60000,
      )
      if (elapsedMin < 15) continue
      // Seuils : 15, 20, 25, 30, 35… (tous les 5 min à partir de 15)
      let t = 15
      while (t <= elapsedMin) {
        const key = `${r.id}-${t}min`
        if (!alertedLateRef.current.has(key)) {
          alertedLateRef.current.add(key)
          // Au premier check (chargement initial), on marque sans sonner
          // (les signalements étaient déjà en retard avant qu'on regarde).
          if (soundOn && !isFirstCheck) {
            playEscalationDing()
            const zoneNom = r.zone?.nom ?? r.tagScanne
            setTimeout(
              () =>
                speak(
                  `Signalement en retard. ${elapsedMin} minutes écoulées. ${zoneNom}. ${r.problemType}. Intervention requise.`,
                  soundOn,
                ),
              300,
            )
            break // une seule annonce par signalement par cycle (anti-cacophonie)
          }
        }
        t += 5
      }
    }
    // Nettoie les seuils alertés des signalements résolus ou disparus
    // (pour pouvoir re-alerter si le même ID revient en retard plus tard)
    for (const key of [...alertedLateRef.current]) {
      const reportId = key.replace(/-\d+min$/, '')
      if (!activePendingIds.has(reportId)) {
        alertedLateRef.current.delete(key)
      }
    }
  }, [now, data, soundOn])

  // --- Horloge toutes les 1s ---
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  // --- Chargement de la préférence son (localStorage) au mount ---
  // Différé (setTimeout 0) pour respecter la règle set-state-in-effect.
  // Si le son n'était pas activé lors de la dernière visite, on affiche
  // la bannière d'activation (auto-dismiss après 10s).
  useEffect(() => {
    const t = setTimeout(() => {
      let alreadyOn = false
      try {
        alreadyOn = localStorage.getItem('wallboard_sound') === '1'
      } catch {
        /* localStorage indisponible */
      }
      if (alreadyOn) {
        setSoundOn(true)
      } else {
        // Son pas encore activé → affiche la bannière d'activation
        setShowSoundBanner(true)
        // Auto-dismiss après 10s (si l'utilisateur ignore la bannière)
        const dismiss = setTimeout(() => setShowSoundBanner(false), 10000)
        return () => clearTimeout(dismiss)
      }
    }, 0)
    return () => clearTimeout(t)
  }, [])

  // --- Bascule du son + persistance ---
  const toggleSound = useCallback(() => {
    setSoundOn((prev) => {
      const next = !prev
      try {
        localStorage.setItem('wallboard_sound', next ? '1' : '0')
      } catch {
        /* ignore */
      }
      // Ferme la bannière d'activation (si elle était visible)
      setShowSoundBanner(false)
      // Petit test son quand on active (feedback utilisateur immédiat)
      if (next) {
        playSound(SOUND_NORMAL, audioRef)
        speak('Son activé.', true)
      } else if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel()
      }
      return next
    })
  }, [])

  // --- Refresh relatif des "il y a X min" toutes les 30s ---
  // (on force un re-render en touchant `now` qui déclenche déjà 1s — suffisant)

  const maxEnAttente = useMemo(
    () => (data ? Math.max(1, ...data.zones.map((z) => z.count_en_attente)) : 1),
    [data],
  )

  // SLA global moyen : moyenne des slaCompliancePercent sur les zones
  // configurées (targetMinutes non null ET resolvedCount > 0).
  const overallSlaPct = useMemo<string>(() => {
    if (!data?.sla) return '—'
    const entries = Object.values(data.sla).filter(
      (s) => s.targetMinutes !== null && s.resolvedCount > 0,
    )
    if (entries.length === 0) return '—'
    const sum = entries.reduce((acc, s) => acc + s.slaCompliancePercent, 0)
    return `${Math.round(sum / entries.length)}%`
  }, [data])

  // --- Task WB2 — KPI Temps Réel (Feature #2) ---
  // SLA compliance en valeur numérique brute (pour indicateur couleur) :
  //   ≥ 80% → vert ; 60-79% → amber ; < 60% → rouge
  const overallSlaPctNum = useMemo<number | null>(() => {
    if (!data?.sla) return null
    const entries = Object.values(data.sla).filter(
      (s) => s.targetMinutes !== null && s.resolvedCount > 0,
    )
    if (entries.length === 0) return null
    const sum = entries.reduce((acc, s) => acc + s.slaCompliancePercent, 0)
    return Math.round(sum / entries.length)
  }, [data])

  const slaTrendDir: 'up' | 'down' | 'flat' =
    overallSlaPctNum === null
      ? 'flat'
      : overallSlaPctNum >= 80
        ? 'up'
        : overallSlaPctNum < 60
          ? 'down'
          : 'flat'

  // Incidents non traités > 10 min (statut ≠ RESOLU et elapsed > 10min)
  const untreatedOver10Min = useMemo<number>(() => {
    if (!data) return 0
    const nowMs = Date.now()
    return data.recent_reports.filter((r) => {
      if (r.statut === 'RESOLU') return false
      const elapsedMin = (nowMs - new Date(r.createdAt).getTime()) / 60000
      return elapsedMin > 10
    }).length
  }, [data])

  // Staff actif : nombre d'agents ayant au moins 1 résolution ce mois
  // (leaderboard filtré resolutions > 0). Valeur arrondie à un total
  // indicatif de 15 (configurable ; affiché "X/15").
  const staffActive = useMemo<{ count: number; total: number }>(() => {
    if (!leaderboard) return { count: 0, total: 15 }
    const active = leaderboard.leaderboard.filter((e) => e.resolutions > 0).length
    return { count: active, total: Math.max(15, active) }
  }, [leaderboard])

  // Top performer du jour : 1er du leaderboard (rank=1) ou null si vide.
  const topPerformer = useMemo<LeaderboardEntry | null>(() => {
    if (!leaderboard || leaderboard.leaderboard.length === 0) return null
    return leaderboard.leaderboard[0]
  }, [leaderboard])

  // Zone critique du jour : top_zones[0] (déjà trié desc par l'API).
  const topZone = useMemo<ZoneAgg | null>(() => {
    if (!data?.top_zones || data.top_zones.length === 0) return null
    return data.top_zones[0]
  }, [data])

  // Tendance 24h : on n'a pas "hier" dans l'API wallboard, mais on a
  // les trends par zone (up/down/stable). On agrège : si majorité "up"
  // → hausse ; majorité "down" → baisse ; sinon stable. La magnitude
  // (pourcentage) est approximée à partir du ratio total_24h / (zones
  // avec trend "up") — purement indicatif.
  const tendance = useMemo<{ dir: 'up' | 'down' | 'flat'; pct: number; label: string }>(() => {
    if (!data) return { dir: 'flat', pct: 0, label: '—' }
    const upCount = data.zones.filter((z) => z.trend === 'up').length
    const downCount = data.zones.filter((z) => z.trend === 'down').length
    if (upCount === 0 && downCount === 0) {
      return { dir: 'flat', pct: 0, label: 'Stable vs hier' }
    }
    if (upCount > downCount) {
      const pct = data.stats.total_24h > 0
        ? Math.round((upCount / Math.max(1, upCount + downCount)) * 100)
        : 0
      return { dir: 'up', pct, label: `↑${pct}% vs hier` }
    }
    if (downCount > upCount) {
      const pct = data.stats.total_24h > 0
        ? Math.round((downCount / Math.max(1, upCount + downCount)) * 100)
        : 0
      return { dir: 'down', pct, label: `↓${pct}% vs hier` }
    }
    return { dir: 'flat', pct: 0, label: 'Stable vs hier' }
  }, [data])

  // --- Lignes du board filtrées (Feature #1 filtre zone + Feature #4 crise) ---
  const filteredRows = useMemo<RecentReport[]>(() => {
    if (!data) return []
    let rows = data.recent_reports
    // Filtre par zone (Feature #1 — clic sur la carte)
    if (filterZone) {
      rows = rows.filter((r) => r.zone?.code === filterZone)
    }
    // Filtre Mode Crise (Feature #4) — uniquement les incidents critiques
    if (crisisMode) {
      rows = rows.filter((r) => isCriticalInCrisis(r))
    }
    return rows
  }, [data, filterZone, crisisMode])

  const filledRows = filteredRows.slice(0, 10)
  const placeholderCount = Math.max(0, 10 - filledRows.length)
  const topAlerts = alerts.slice(0, 3)

  // Header "filtre actif" : si crise OU filterZone → résumé compact
  const activeFilterLabel = crisisMode
    ? `MODE CRISE — ${filledRows.length} critique(s)`
    : filterZone
      ? `Filtre zone: ${filterZone} — ${filledRows.length} signalement(s)`
      : null

  return (
    <div
      className={`flex min-h-screen flex-col overflow-x-hidden bg-neutral-950 p-3 font-sans text-white sm:p-4 ${
        crisisMode ? 'bg-red-950/20' : ''
      }`}
    >
      {/* Élément audio caché pour le ding (play() programmatique) */}
      <audio ref={audioRef} preload="auto" />
      <div className="mx-auto flex w-full max-w-[1920px] flex-1 flex-col overflow-hidden rounded-[20px] border border-neutral-800 bg-[#0a0a0a] shadow-2xl">
        {/* ---------- HEADER BAR (gradient amber → orange) ---------- */}
        <header className="flex h-16 shrink-0 items-center justify-between gap-3 bg-gradient-to-r from-amber-400 to-orange-500 px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div
              className="flex size-11 items-center justify-center rounded-xl bg-black"
              aria-hidden
            >
              <Plane className="size-6 text-amber-400" strokeWidth={2.5} />
            </div>
            <div className="flex flex-col leading-tight">
              <h1 className="text-lg font-extrabold tracking-tight text-black sm:text-2xl">
                AÉROPORT OPS
              </h1>
              <span className="hidden font-mono text-[10px] uppercase tracking-[0.25em] text-black/60 sm:block">
                Wallboard · Départs
              </span>
            </div>
          </div>

          <div className="hidden flex-col items-center md:flex">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-black/70">
              {formatDateFR(now)}
            </div>
            <div className="font-mono text-[10px] uppercase tracking-wider text-black/50">
              {alertsError
                ? 'Alertes : erreur'
                : `${alerts.length} alerte(s) active(s)`}
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* LIVE indicator */}
            <div className="flex items-center gap-1.5 rounded-full bg-black/15 px-2.5 py-1">
              {error ? (
                <>
                  <span className="size-2 rounded-full bg-red-600" aria-hidden />
                  <span className="text-[11px] font-bold uppercase tracking-wider text-black">
                    Erreur
                  </span>
                </>
              ) : (
                <>
                  <span className="relative flex size-2" aria-hidden>
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-500 opacity-75" />
                    <span className="relative inline-flex size-2 rounded-full bg-green-500" />
                  </span>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-black">
                    Live
                  </span>
                </>
              )}
            </div>
            {/* Clock badge */}
            <div
              className="rounded-lg bg-black px-3 py-1.5 font-mono text-lg font-bold tabular-nums text-white sm:text-xl"
              aria-label="Heure courante"
            >
              {formatClock(now)}
            </div>
            {/* Task WB2 Feature #4 — Bouton MODE CRISE (rouge pulsant) */}
            <CrisisButton
              active={crisisMode}
              onStart={handleCrisisStart}
              onEnd={handleCrisisEnd}
              elapsedSec={crisisElapsedSec}
            />
            {/* Bouton mute 🔊/🔇 — active/désactive le ding + TTS.
                Rendu très visible (amber sur noir) car c'est le seul
                contrôle du wallboard et doit être cliqué au moins une
                fois pour débloquer l'audio navigateur. */}
            <button
              type="button"
              onClick={toggleSound}
              aria-pressed={soundOn}
              aria-label={soundOn ? "Couper le son" : "Activer le son (ding + annonces vocales)"}
              title={soundOn ? "Son activé — clic pour couper" : "Son coupé — clic pour activer ding + annonces vocales"}
              className="flex items-center gap-1.5 rounded-lg bg-black px-3 py-1.5 transition-transform hover:scale-105"
            >
              {soundOn ? (
                <>
                  <Volume2 className="size-5 text-amber-400" aria-hidden />
                  <span className="text-[11px] font-bold uppercase tracking-wider text-amber-400">ON</span>
                </>
              ) : (
                <>
                  <VolumeX className="size-5 text-white" aria-hidden />
                  <span className="text-[11px] font-bold uppercase tracking-wider text-white">OFF</span>
                </>
              )}
            </button>
          </div>
        </header>

        {/* ---------- BANNIÈRE D'ACTIVATION DU SON ----------
            Affichée à l'ouverture si le son n'est pas activé.
            Auto-dismiss après 10s ou au clic sur "Activer". */}
        {showSoundBanner && !soundOn && (
          <div className="flex shrink-0 items-center justify-between gap-4 border-b border-amber-500/40 bg-gradient-to-r from-amber-950 via-amber-900 to-amber-950 px-4 py-3 sm:px-6">
            <div className="flex items-center gap-3">
              <span
                className="relative flex size-3 shrink-0"
                aria-hidden
              >
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
                <span className="relative inline-flex size-3 rounded-full bg-amber-400" />
              </span>
              <div className="flex flex-col">
                <p className="text-sm font-bold text-amber-100">
                  🔔 Activez le son pour les alertes vocales
                </p>
                <p className="text-[11px] text-amber-200/70">
                  Le wallboard annoncera chaque nouveau signalement à voix haute (ding + description).
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={toggleSound}
                className="flex items-center gap-1.5 rounded-lg bg-amber-400 px-4 py-2 text-sm font-bold text-black transition-transform hover:scale-105"
              >
                <Volume2 className="size-4" aria-hidden />
                Activer le son
              </button>
              <button
                type="button"
                onClick={() => setShowSoundBanner(false)}
                aria-label="Fermer la bannière"
                className="flex items-center justify-center rounded-lg border border-amber-500/30 px-2.5 py-2 text-amber-300 transition-colors hover:bg-amber-900/50"
              >
                <span className="text-lg leading-none" aria-hidden>×</span>
              </button>
            </div>
          </div>
        )}

        {/* ---------- Task WB2 Feature #4 — Résumé fin de crise ----------
            Affiché 6s après désactivation du Mode Crise. */}
        {crisisSummary && !crisisMode && (
          <div
            role="status"
            className="flex shrink-0 items-center justify-center gap-3 border-b border-green-500/40 bg-gradient-to-r from-green-950 via-green-900 to-green-950 px-4 py-2 sm:px-6"
          >
            <ShieldAlert className="size-4 text-green-300" aria-hidden />
            <p className="font-mono text-sm font-bold text-green-100">
              {crisisSummary}
            </p>
          </div>
        )}

        {/* ---------- Task WB2 Feature #4 — Bandeau crise active ---------- */}
        {crisisMode && (
          <div
            role="alert"
            className="flex shrink-0 items-center justify-between gap-3 border-b border-red-500 bg-red-950 px-4 py-2 sm:px-6"
          >
            <div className="flex items-center gap-2">
              <ShieldAlert className="size-4 animate-pulse text-red-300" aria-hidden />
              <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-red-200">
                Mode crise — board filtré aux incidents critiques uniquement
              </span>
            </div>
            {activeFilterLabel && (
              <span className="font-mono text-[10px] uppercase tracking-wider text-red-300">
                {activeFilterLabel}
              </span>
            )}
          </div>
        )}

        {/* ---------- ALERTES ACTIVES ---------- */}
        {topAlerts.length > 0 && (
          <section
            aria-label="Alertes actives"
            className="shrink-0 space-y-1.5 bg-black p-2"
          >
            {topAlerts.map((a, idx) => (
              <AlertRow key={`${a.thresholdId}-${a.zoneCode}-${idx}`} alert={a} />
            ))}
          </section>
        )}

        {/* ---------- Task WB2 Feature #1 — VUE CARTOGRAPHIQUE ---------- */}
        {data && data.zones.length > 0 && (
          <ZoneMapSection
            zones={data.zones}
            filterZone={filterZone}
            onSelectZone={setFilterZone}
          />
        )}

        {/* ---------- STATS STRIP (5 tuiles existantes) ---------- */}
        <section
          aria-label="Statistiques 24h"
          className="grid shrink-0 grid-cols-2 gap-1.5 bg-black p-2 sm:grid-cols-3 lg:grid-cols-5"
        >
          {data ? (
            <>
              <StatTile label="24H" value={data.stats.total_24h} />
              <StatTile label="EN ATTENTE" value={data.stats.en_attente} accent="amber" />
              <StatTile label="EN COURS" value={data.stats.en_cours} accent="sky" />
              <StatTile label="RÉSOLUS" value={data.stats.resolus_24h} accent="green" />
              <StatTile label="SLA %" value={overallSlaPct} accent="green" />
            </>
          ) : (
            Array.from({ length: 5 }).map((_, i) => <StatSkeleton key={i} />)
          )}
        </section>

        {/* ---------- Task WB2 Feature #2 — KPI TEMPS RÉEL (4 tuiles décision) ---------- */}
        <section
          aria-label="KPI temps réel"
          className="grid shrink-0 grid-cols-2 gap-1.5 bg-black p-2 sm:grid-cols-4"
        >
          {data ? (
            <>
              <EnhancedKpiTile
                icon={Clock}
                label="TEMPS MOY. RÉSOLUTION"
                value={formatDurationMin(data.stats.avg_resolution_minutes)}
                accent="white"
              />
              <EnhancedKpiTile
                icon={Activity}
                label="SLA RESPECTÉ"
                value={overallSlaPct}
                trend={overallSlaPctNum !== null ? `${overallSlaPctNum >= 80 ? 'OK' : 'RISK'}` : ''}
                trendDir={slaTrendDir}
                accent={overallSlaPctNum === null ? 'white' : overallSlaPctNum >= 80 ? 'green' : overallSlaPctNum < 60 ? 'red' : 'amber'}
              />
              <EnhancedKpiTile
                icon={AlertTriangle}
                label="NON TRAITÉS >10MIN"
                value={untreatedOver10Min}
                warning={untreatedOver10Min > 0}
                accent={untreatedOver10Min > 0 ? 'red' : 'green'}
              />
              <EnhancedKpiTile
                icon={Users}
                label="STAFF ACTIF"
                value={`${staffActive.count}/${staffActive.total}`}
                accent={staffActive.count > 0 ? 'green' : 'amber'}
              />
            </>
          ) : (
            Array.from({ length: 4 }).map((_, i) => <StatSkeleton key={i} />)
          )}
        </section>

        {/* ---------- Task WB2 Feature #6 — BARRES INFO (top performer + zone critique + tendance) ---------- */}
        <section
          aria-label="Synthèse performance et tendance"
          className="grid shrink-0 grid-cols-1 gap-1.5 bg-black p-2 lg:grid-cols-3"
        >
          <InfoBar
            icon={Trophy}
            label="TOP PERFORMER"
            value={
              topPerformer
                ? `#${topPerformer.rank} ${topPerformer.staffName}`
                : 'Aucun classement'
            }
            detail={
              topPerformer
                ? `${topPerformer.resolutions} résolus · ${topPerformer.avgMinutes ?? '—'}min moy`
                : undefined
            }
            accent="emerald"
          />
          <InfoBar
            icon={AlertTriangle}
            label="ZONE CRITIQUE"
            value={
              topZone
                ? `${topZone.emoji} ${topZone.nom}`
                : 'Aucune zone critique'
            }
            detail={topZone ? `${topZone.count_24h} signalements 24h` : undefined}
            accent="amber"
          />
          <InfoBar
            icon={tendance.dir === 'up' ? TrendingUp : tendance.dir === 'down' ? TrendingDown : Activity}
            label="TENDANCE 24H"
            value={tendance.label}
            detail={data ? `${data.stats.total_24h} total` : undefined}
            accent={tendance.dir === 'up' ? 'amber' : tendance.dir === 'down' ? 'emerald' : 'neutral'}
          />
        </section>

        {/* ---------- MAIN BOARD (departure grid) ---------- */}
        <main
          aria-label="Derniers signalements"
          className="relative flex min-h-0 flex-1 flex-col gap-1.5 bg-black p-2"
        >
          {/* Column headers — masqués sur mobile (layout 2-col n'a pas de
              correspondance 1-pour-1 avec les entêtes ; les cellules
              restantes sont auto-descriptives grâce au texte monospace).
              Task WB2 Feature #3 : ajout 6e colonne "Actions". */}
          <div
            role="row"
            className="hidden shrink-0 grid-cols-[1.2fr_2.5fr_1fr_1.3fr_0.8fr_0.6fr] gap-1.5 sm:grid"
          >
            <div className="px-3 py-1 font-mono text-[11px] font-bold uppercase tracking-wider text-amber-400">
              Zone
            </div>
            <div className="px-3 py-1 font-mono text-[11px] font-bold uppercase tracking-wider text-amber-400">
              Problème
            </div>
            <div className="px-3 py-1 font-mono text-[11px] font-bold uppercase tracking-wider text-amber-400">
              Statut
            </div>
            <div className="px-3 py-1 font-mono text-[11px] font-bold uppercase tracking-wider text-amber-400">
              Équipe
            </div>
            <div className="px-3 py-1 text-right font-mono text-[11px] font-bold uppercase tracking-wider text-amber-400">
              Il y a
            </div>
            <div className="px-1.5 py-1 text-center font-mono text-[11px] font-bold uppercase tracking-wider text-amber-400">
              Actions
            </div>
          </div>

          {/* Rows */}
          <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto">
            {data ? (
              filledRows.length > 0 ? (
                <>
                  {filledRows.map((r) => (
                    <BoardRow
                      key={r.id}
                      r={r}
                      fresh={freshIds.has(r.id)}
                      onActionFeedback={handleActionFeedback}
                    />
                  ))}
                  {Array.from({ length: placeholderCount }).map((_, i) => (
                    <PlaceholderRow key={`ph-${i}`} />
                  ))}
                </>
              ) : (
                <div className="flex flex-1 items-center justify-center rounded-md bg-[#1a1a1a] p-6 font-mono text-sm text-neutral-600">
                  {crisisMode
                    ? 'Aucun incident critique en cours — crise maîtrisée'
                    : filterZone
                      ? `Aucun signalement pour cette zone (${filterZone})`
                      : 'Aucun signalement dans les dernières 24h'}
                </div>
              )
            ) : (
              Array.from({ length: 10 }).map((_, i) => <RowSkeleton key={i} />)
            )}
          </div>

          {/* Task WB2 Feature #3 — Toast feedback Actions rapides */}
          {actionToast && (
            <div
              role="status"
              className={`pointer-events-none absolute left-1/2 top-2 z-30 -translate-x-1/2 rounded-md border px-3 py-1.5 font-mono text-xs shadow-lg ${
                actionToast.kind === 'ok'
                  ? 'border-green-500/50 bg-green-950/90 text-green-200'
                  : 'border-red-500/50 bg-red-950/90 text-red-200'
              }`}
            >
              {actionToast.msg}
            </div>
          )}
        </main>

        {/* ---------- PREDICTION RADAR (Phase 2 — "Ça va péter dans 20 min") ---------- */}
        <section
          aria-label="Radar prédiction des pics de plaintes"
          className="flex shrink-0 flex-col gap-1.5 bg-black p-2"
        >
          <h2 className="flex items-center gap-2 px-1 font-mono text-[11px] font-bold uppercase tracking-wider text-amber-400">
            <span aria-hidden>🔮</span>
            Radar Prédiction — Ça va péter dans 20 min ?
          </h2>
          <AirportPredictionRadar className="w-full rounded-md border border-amber-500/20 bg-neutral-900/80" />
        </section>

        {/* ---------- BOTTOM STRIP (SLA + charge par zone) ---------- */}
        <footer
          aria-label="Synthèse SLA et charge par zone"
          className="grid shrink-0 grid-cols-1 gap-1.5 bg-black p-2 lg:grid-cols-2"
        >
          <section className="flex flex-col gap-1.5">
            <h2 className="px-1 font-mono text-[11px] font-bold uppercase tracking-wider text-amber-400">
              SLA par zone
            </h2>
            <div className="flex flex-col gap-1.5">
              {data ? (
                data.zones.slice(0, 5).map((z) => (
                  <SlaBottomRow key={`sla-${z.code}`} zone={z} sla={data.sla?.[z.code]} />
                ))
              ) : (
                Array.from({ length: 5 }).map((_, i) => <MiniRowSkeleton key={i} />)
              )}
            </div>
          </section>

          <section className="flex flex-col gap-1.5">
            <h2 className="px-1 font-mono text-[11px] font-bold uppercase tracking-wider text-amber-400">
              Charge par zone · en attente
            </h2>
            <div className="flex flex-col gap-1.5">
              {data ? (
                data.zones.slice(0, 5).map((z) => (
                  <ZoneChargeRow key={`chg-${z.code}`} zone={z} max={maxEnAttente} />
                ))
              ) : (
                Array.from({ length: 5 }).map((_, i) => <MiniRowSkeleton key={i} />)
              )}
            </div>
          </section>
        </footer>
      </div>
    </div>
  )
}
