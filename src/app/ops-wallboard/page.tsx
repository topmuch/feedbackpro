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
import { Plane, TriangleAlert, OctagonAlert, Volume2, VolumeX } from 'lucide-react'

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

/** Ligne de la grille principale (un signalement) */
function BoardRow({ r, fresh }: { r: RecentReport; fresh: boolean }) {
  const s = statutMeta(r.statut)
  const team = teamMeta(r.routedTeam)
  return (
    <div
      role="row"
      className={`grid shrink-0 grid-cols-[1.2fr_2.5fr_1fr_1.3fr_0.8fr] gap-1.5 ${
        fresh ? 'animate-in fade-in slide-in-from-top-2 duration-500' : ''
      }`}
    >
      {/* ZONE */}
      <div
        role="cell"
        className="flex min-w-0 items-center gap-2 rounded-md bg-[#1a1a1a] px-3 py-2"
      >
        <span className="text-base leading-none" aria-hidden>
          {r.zone?.emoji ?? '📍'}
        </span>
        <span className="truncate font-mono text-sm font-semibold text-amber-400">
          {r.zone?.nom ?? 'Zone inconnue'}
        </span>
      </div>

      {/* PROBLÈME */}
      <div
        role="cell"
        className="flex min-w-0 items-center rounded-md bg-[#1a1a1a] px-3 py-2"
      >
        <span className="truncate font-mono text-sm text-white" title={r.problemType}>
          {r.problemType}
        </span>
      </div>

      {/* STATUT */}
      <div role="cell" className="flex items-center rounded-md bg-[#1a1a1a] px-3 py-2">
        <span
          className={`inline-flex items-center gap-1.5 rounded border px-2 py-0.5 font-mono text-[11px] font-bold uppercase tracking-wider ${s.badge}`}
        >
          <span className={`size-1.5 rounded-full ${s.dot}`} aria-hidden />
          {s.label}
        </span>
      </div>

      {/* ÉQUIPE */}
      <div
        role="cell"
        className="flex min-w-0 items-center gap-1.5 rounded-md bg-[#1a1a1a] px-3 py-2"
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

      {/* IL Y A */}
      <div
        role="cell"
        className="flex items-center justify-end rounded-md bg-[#1a1a1a] px-3 py-2"
      >
        <span className="font-mono text-sm tabular-nums text-white">
          {relativeTime(r.createdAt)}
        </span>
      </div>
    </div>
  )
}

/** Ligne "emplacement vide" — dots muted gray, comme un vrai departure board */
function PlaceholderRow() {
  return (
    <div
      role="row"
      aria-hidden
      className="grid shrink-0 grid-cols-[1.2fr_2.5fr_1fr_1.3fr_0.8fr] gap-1.5"
    >
      <div className="rounded-md bg-[#1a1a1a] px-3 py-2 font-mono text-sm text-neutral-700">
        · · · · ·
      </div>
      <div className="truncate rounded-md bg-[#1a1a1a] px-3 py-2 font-mono text-sm text-neutral-700">
        · · · · · · · · · ·
      </div>
      <div className="rounded-md bg-[#1a1a1a] px-3 py-2 font-mono text-sm text-neutral-700">
        · · ·
      </div>
      <div className="rounded-md bg-[#1a1a1a] px-3 py-2 font-mono text-sm text-neutral-700">
        · · · ·
      </div>
      <div className="rounded-md bg-[#1a1a1a] px-3 py-2 text-right font-mono text-sm text-neutral-700">
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
    <div className="grid shrink-0 grid-cols-[1.2fr_2.5fr_1fr_1.3fr_0.8fr] gap-1.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="h-11 animate-pulse rounded-md bg-[#1a1a1a]" />
      ))}
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

const SOUND_NORMAL = '/sounds/ding.wav'
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
            // --- DENISE COMMANDE : ordre impératif, pas juste une alerte ---
            // Format : "Urgence. [Zone]. [Problème]. [Équipe], intervenez immédiatement."
            // + vol si présent + tag emplacement
            const zoneNom = latest.zone?.nom ?? latest.tagScanne
            const teamMap: Record<string, string> = {
              nettoyage: 'Équipe nettoyage',
              maintenance: 'Équipe maintenance',
              securite: 'Équipe sécurité',
              accueil: 'Équipe accueil',
              logistique: 'Équipe logistique bagages',
              autre: 'Équipe ops',
            }
            const teamLabel = latest.routedTeam ? (teamMap[latest.routedTeam] ?? 'Équipe ops') : 'Équipe ops'
            const parts: string[] = ['Urgence']
            parts.push(zoneNom)
            parts.push(latest.problemType)
            parts.push(`${teamLabel}, intervenez immédiatement`)
            if (latest.flightNumber) parts.push(`Vol ${latest.flightNumber}`)
            parts.push(latest.tagScanne)
            setTimeout(() => speak(parts.join('. ') + '.', soundOn), 400)
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

  // Lignes du board (max 10) + placeholders pour combler
  const rows = data?.recent_reports ?? []
  const filledRows = rows.slice(0, 10)
  const placeholderCount = Math.max(0, 10 - filledRows.length)
  const topAlerts = alerts.slice(0, 3)

  return (
    <div className="flex min-h-screen flex-col bg-neutral-950 p-3 font-sans text-white sm:p-4">
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

        {/* ---------- STATS STRIP ---------- */}
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

        {/* ---------- MAIN BOARD (departure grid) ---------- */}
        <main
          aria-label="Derniers signalements"
          className="flex min-h-0 flex-1 flex-col gap-1.5 bg-black p-2"
        >
          {/* Column headers */}
          <div
            role="row"
            className="grid shrink-0 grid-cols-[1.2fr_2.5fr_1fr_1.3fr_0.8fr] gap-1.5"
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
          </div>

          {/* Rows */}
          <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto">
            {data ? (
              filledRows.length > 0 ? (
                <>
                  {filledRows.map((r) => (
                    <BoardRow key={r.id} r={r} fresh={freshIds.has(r.id)} />
                  ))}
                  {Array.from({ length: placeholderCount }).map((_, i) => (
                    <PlaceholderRow key={`ph-${i}`} />
                  ))}
                </>
              ) : (
                <div className="flex flex-1 items-center justify-center rounded-md bg-[#1a1a1a] p-6 font-mono text-sm text-neutral-600">
                  Aucun signalement dans les dernières 24h
                </div>
              )
            ) : (
              Array.from({ length: 10 }).map((_, i) => <RowSkeleton key={i} />)
            )}
          </div>
        </main>

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
