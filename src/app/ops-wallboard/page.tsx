// ============================================================
// Page /ops-wallboard — Wallboard Ops Room Aéroport — V2.0 PREMIUM
// ------------------------------------------------------------
// Style "Aéroport Premium V2.0" — refoundation visuelle complète :
//   - Fond global GRIS CLAIR #F5F5F5 (makes panels pop)
//   - Header BLEU #000d10 (rounded bottom 20px) + logo JAUNE #C9A961
//   - KPI ROW : 6 cartes colorées (red/yellow/green/blue/yellow/green)
//   - MAIN LAYOUT 2fr/1fr : zones (white card) | alertes (white card)
//   - Zone panels : panneaux horizontaux colorés selon statut
//       · Calme (0)        → BLEU #000d10 texte blanc
//       · Attention (1-2)  → ORANGE #C9A961 texte blanc
//       · Critique (3+)    → ROUGE #E30613 texte blanc + flash
//       · Default          → JAUNE #C9A961 texte noir
//   - Incidents table : lignes séparées (gap 8px) avec coins arrondis
//   - Radar prédiction : wrapper premium blanc
//   - Legend bar : white card avec box colors + hint
//
// Palette V2.0 :
//   --jaune  #C9A961   --bleu  #000d10   --noir #000000
//   --blanc  #FFFFFF   --rouge #E30613   --vert #C9A961
//   --orange #C9A961   --page-bg #F5F5F5
//
// Police : Roboto Condensed (700/900) via Google Fonts @import
// Tout en MAJUSCULES, letter-spacing 1-4px selon élément
//
// Polling (IDENTIQUE au précédent — préservé 100%) :
//   - /api/airport/wallboard toutes les 5s
//   - /api/airport/alerts/check toutes les 30s
//   - /api/airport/leaderboard toutes les 60s
//   - horloge 1s
//
// Fonctionnalités préservées (100% — AUCUNE EXCEPTION) :
//   - Sons (ding-dong.mp3, ding-critical.wav, resolved.wav)
//   - Escalade sonore Web Audio (660/880/990 Hz)
//   - TTS Nathalie (decideAndSpeakForWallboard + race-condition fix)
//   - Rappel 15 min (alertedLateRef + badge EN RETARD + escalade)
//   - Toggle son (persisté localStorage "wallboard_sound")
//   - Mode crise (filtre incidents critiques + timer + overlay)
//   - Actions rapides par ligne : [ASSIGNER] [APPELER] [ESCALADER]
//   - Filtre zone (clic panneau zone → filtre le tableau)
//   - SOS help requests (HelpRequestAlertCard)
//   - recently_resolved (son + annonce Nathalie)
//   - firstLoadRef + seenIdsRef (détection nouveaux signalements)
//   - announcedResolvedRef + announcedAlertsRef (dédup annonces)
// ============================================================

'use client'

// Force dynamic rendering — empêche Next.js de mettre en cache la page
// (x-nextjs-cache: HIT avec s-maxage=31536000 sinon → ancienne version servie)
// NOTE: revalidate et fetchCache ne sont PAS valides sur les Client Components
// (Next.js interprète revalidate comme une fonction côté client). Seul
// `dynamic = 'force-dynamic'` fonctionne sur les pages 'use client'.
export const dynamic = 'force-dynamic'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Volume2,
  VolumeX,
  Phone,
  Megaphone,
  Wrench,
  ShieldAlert,
  Plane,
  Mic,
} from 'lucide-react'
import { AirportPredictionRadar } from '@/components/feedbackpro/airport-prediction-radar'
// AirportHeatmap import retiré — design original ZonePanel restauré
// (panneaux horizontaux colorés par famille, avec compteurs en attente + en cours).
import { parler } from '@/lib/staff-tts'
import { LiveScoreWidget } from '@/components/feedbackpro/live-score-widget'
// TENANT-3 — Filtre des zones airport uniquement (le wallboard ops room
// ne doit jamais afficher les zones airline ou vip_lounge).
import { AIRPORT_ZONES } from '@/lib/airport-config'

// Set des codes de zones autorisées sur le wallboard airport (tenantType
// 'airport' ou sans tenantType pour rétro-compat avec les zones historiques).
const AIRPORT_ZONE_CODES = new Set(
  AIRPORT_ZONES.filter((z) => z.tenantType === 'airport' || !z.tenantType).map((z) => z.code),
)

// ---------------------------------------------------------------
// Types — match exact du contrat /api/airport/wallboard
// ---------------------------------------------------------------
type Statut = 'EN_ATTENTE' | 'EN_COURS' | 'RESOLU'

// --- V3 — Notifications VISUELLES du wallboard (demande du directeur) ---
// Chaque événement opérationnel (nouveau signalement, SOS, résolution,
// retard) déclenche une carte overlay premium en haut à droite — visible
// même si le son est coupé. Auto-dismiss 9 s, pile de 4 cartes max.
type OverlayKind = 'nouveau' | 'sos' | 'resolu' | 'retard'
type OverlayNotif = {
  id: string
  kind: OverlayKind
  titre: string
  detail: string
  meta: string
}
type Trend = 'up' | 'down' | 'stable'
type TeamKey = 'nettoyage' | 'maintenance' | 'securite' | 'accueil' | 'logistique' | 'other'

type ZoneAgg = {
  code: string
  nom: string
  emoji: string
  count_24h: number
  count_en_attente: number
  count_en_cours: number
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
  isHelpRequest?: boolean
  // Task WAHOO-1 — Nathalie Traducteur Universel
  // Code langue source du commentaire (fr, en, zh, ar, es, de, pt, it,
  // ru, ja, wo, auto) ou null si le voyageur a écrit en français.
  // Utilisé pour annoncer « Message original en [langue] » via Nathalie.
  commentaireLang?: string | null
}

type HelpRequestLite = {
  id: string
  zone: { code: string; nom: string; emoji: string }
  tagScanne: string
  message: string | null
  problemType: string
  travelerPhone: string | null
  statut: string
  createdAt: string
  resolvedAt: Date | null
}

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
  help_requests?: HelpRequestLite[]
  recently_resolved?: {
    id: string
    zone: { code: string; nom: string; emoji: string } | null
    problemType: string
    tagScanne: string
    resolvedAt: Date | null
  }[]
}

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
// Types — Feature F1/F2/F3 (Nathalie conversationnelle, auto-pilot, achievements)
// ---------------------------------------------------------------

/** Sous-ensemble du SpeechRecognition (Web Speech API) — la lib DOM TS ne
 *  l'expose pas de façon stable, on déclare le minimum nécessaire. */
type SpeechRecognitionLike = {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  start: () => void
  stop: () => void
  abort: () => void
  onresult:
    | ((event: {
        results: ArrayLike<ArrayLike<{ transcript: string }>>
        resultIndex: number
      }) => void)
    | null
  onerror: ((event: { error: string }) => void) | null
  onend: (() => void) | null
}

type AutopilotAction = {
  type: 'AUTO_ASSIGN' | 'PATTERN_ALERT' | 'PREPOSITION'
  description: string
  reportId?: string
  zoneCode?: string
}

type AchievementBadge = {
  id: string
  label: string
  emoji: string
  description: string
  unlockedAt?: string
  meta?: string
}

type AchievementsData = {
  definitions: AchievementBadge[]
  competition: { morning: number; evening: number; night: number }
  streakDays: number
  streakSlaPct: number
  topPerformer: {
    rank: number
    staffName: string
    points: number
    resolutions: number
    avgMinutes: number
    lastResolvedAt: string | null
    achievements: AchievementBadge[]
  } | null
  leaderboard: {
    rank: number
    staffName: string
    points: number
    resolutions: number
    avgMinutes: number
    achievements: AchievementBadge[]
  }[]
}

// ---------------------------------------------------------------
// Task WAHOO-4 — Mode Prédictif de Nathalie
// Contrat /api/airport/predictive-alert → predictions[].
// ---------------------------------------------------------------
type PredictiveAlert = {
  id: string
  type: 'flight_arrival' | 'historical_pattern' | 'current_load'
  priority: 'high' | 'medium' | 'low'
  message: string
  zones: string[]
  flightCount: number
  paxCount: number
  etaMinutes: number
}

// ---------------------------------------------------------------
// Constantes — palette V2.0 PREMIUM
// ---------------------------------------------------------------
const JAUNE = '#C9A961' // Yellow IATA
const BLEU = '#000d10' // Airport blue
const NOIR = '#000000'
const BLANC = '#FFFFFF'
const ROUGE = '#E30613' // Alert red
const VERT = '#C9A961' // Success green
const ORANGE = '#C9A961' // Warning orange
const PAGE_BG = '#F5F5F5' // Light gray (makes panels pop)

// ---------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------

function relativeTime(iso: string | null): string {
  if (!iso) return '—'
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 0) return "à l'instant"
  const sec = Math.floor(diff / 1000)
  if (sec < 10) return "à l'instant"
  if (sec < 60) return `il y a ${sec} s`
  const min = Math.floor(sec / 60)
  if (min < 60) return `il y a ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `il y a ${h} h`
  const j = Math.floor(h / 24)
  return `il y a ${j} j`
}

function relativeTimeShort(iso: string | null): string {
  if (!iso) return '—'
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 0) return '0MIN'
  const sec = Math.floor(diff / 1000)
  if (sec < 60) return '<1MIN'
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}MIN`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h}H`
  const j = Math.floor(h / 24)
  return `${j}J`
}

function formatClock(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function formatDateFR(d: Date): string {
  const days = ['DIM', 'LUN', 'MAR', 'MER', 'JEU', 'VEN', 'SAM']
  const months = [
    'JAN',
    'FÉV',
    'MAR',
    'AVR',
    'MAI',
    'JUN',
    'JUL',
    'AOÛ',
    'SEP',
    'OCT',
    'NOV',
    'DÉC',
  ]
  return `${days[d.getDay()]} ${String(d.getDate()).padStart(2, '0')} ${months[d.getMonth()]}`
}

function formatTimeShort(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function formatDurationMin(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return '—'
  const m = Math.floor(minutes)
  return `${m}M`
}

function formatDurationSec(totalSec: number): string {
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

const TEAM_META: Record<TeamKey, { emoji: string; label: string; abbr: string }> = {
  nettoyage: { emoji: '🧹', label: 'NETTOYAGE', abbr: 'NET' },
  maintenance: { emoji: '🔧', label: 'MAINTENANCE', abbr: 'MAINT' },
  securite: { emoji: '🛡️', label: 'SÉCURITÉ', abbr: 'SEC' },
  accueil: { emoji: '👋', label: 'ACCUEIL', abbr: 'ACC' },
  logistique: { emoji: '🛃', label: 'LOGISTIQUE', abbr: 'LOG' },
  other: { emoji: '❓', label: 'AUTRE', abbr: 'AUT' },
}

function teamMeta(key: string | null): { emoji: string; label: string; abbr: string } | null {
  if (!key) return null
  return TEAM_META[key as TeamKey] ?? TEAM_META.other
}

type ZoneFamily =
  | 'EXTÉRIEUR'
  | 'SÛRETÉ'
  | 'TERMINAL'
  | 'COMMERCIAL'
  | 'SERVICE'
  | 'URGENCE'
  | 'HISTORIQUE'

function zoneFamily(code: string): ZoneFamily {
  if (
    code === 'bagages' ||
    code === 'sanitaires' ||
    code === 'files_attente' ||
    code === 'embarquement'
  )
    return 'TERMINAL'
  if (code === 'restauration') return 'COMMERCIAL'
  if (code.startsWith('ext_')) return 'EXTÉRIEUR'
  if (code.startsWith('sec_')) return 'SÛRETÉ'
  if (code.startsWith('term_')) return 'TERMINAL'
  if (code.startsWith('com_')) return 'COMMERCIAL'
  if (code.startsWith('srv_')) return 'SERVICE'
  if (code.startsWith('urg_')) return 'URGENCE'
  return 'HISTORIQUE'
}

function truncateName(name: string, max = 14): string {
  if (name.length <= max) return name
  return `${name.slice(0, max - 1)}…`
}

type ZoneStatus = 'calm' | 'attention' | 'critical' | 'none'

/**
 * Calcule le statut d'une zone à partir des compteurs en attente ET en cours.
 * On additionne les deux pour refléter la charge réelle de la zone :
 * un incident en cours (pris en charge mais non résolu) compte toujours
 * dans l'activité opérationnelle. 0 = calme, 1-2 = attention, 3+ = critique.
 */
function zoneStatus(enAttente: number | null | undefined, enCours: number | null | undefined): ZoneStatus {
  const a = enAttente ?? 0
  const c = enCours ?? 0
  const total = a + c
  if (total === 0) return 'calm'
  if (total <= 2) return 'attention'
  return 'critical'
}

const ZONE_STATUS_META_V2: Record<ZoneStatus, { label: string }> = {
  calm: { label: 'CALME' },
  attention: { label: 'ATTENTION' },
  critical: { label: 'CRITIQUE' },
  none: { label: 'N/A' },
}

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
  const json = (await res.json()) as AlertsCheckResponse | { ok: false; error: string }
  if (!json.ok) throw new Error(json.error ?? 'réponse invalide')
  return json.data.alerts
}

// ---------------------------------------------------------------
// Helpers son — Ding + TTS (synthèse vocale navigateur)
// ---------------------------------------------------------------
const SOUND_NORMAL = '/sounds/ding-dong.mp3'
const SOUND_CRITICAL = '/sounds/ding-critical.wav'
const SOUND_RESOLVED = '/sounds/resolved.wav'

/**
 * Task WAHOO-1 — Nathalie Traducteur Universel
 * Mappe un code langue (fr, en, zh, ar, es, de, pt, it, ru, ja, wo, auto)
 * vers son nom en français, pour l'annonce vocale :
 *   « Nouvel incident signalé. [...] Message original en anglais. »
 *
 * Renvoie null si le code est inconnu ou si c'est 'fr' (pas d'annonce
 * de langue dans ce cas — le message est déjà en français).
 */
function langueEnFrancais(code: string | null | undefined): string | null {
  if (!code) return null
  const map: Record<string, string> = {
    fr: 'français',
    en: 'anglais',
    zh: 'chinois',
    ar: 'arabe',
    es: 'espagnol',
    de: 'allemand',
    pt: 'portugais',
    it: 'italien',
    ru: 'russe',
    ja: 'japonais',
    wo: 'wolof',
    auto: 'langue auto-détectée',
  }
  const label = map[code.toLowerCase()]
  if (!label || code.toLowerCase() === 'fr') return null
  return label
}

function playSound(src: string, audioRef: React.RefObject<HTMLAudioElement | null>) {
  const a = audioRef.current
  if (!a) return
  a.src = src
  a.volume = 0.6
  a.play().catch(() => {
    // Autoplay bloqué — silencieux
  })
}

function speak(text: string, enabled: boolean) {
  if (!enabled) return
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return
  try {
    const u = new SpeechSynthesisUtterance(text)
    u.lang = 'fr-FR'
    u.rate = 1.05
    u.pitch = 1.0
    u.volume = 0.9

    const voices = window.speechSynthesis.getVoices()
    const frVoice = voices.find((v) => v.lang.startsWith('fr'))
    if (frVoice) {
      u.voice = frVoice
    }

    if (window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel()
      setTimeout(() => window.speechSynthesis.speak(u), 50)
    } else {
      window.speechSynthesis.speak(u)
    }
  } catch {
    // TTS indisponible
  }
}

// ============================================================
// Voice Decision Engine — Nathalie
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

void decideAndSpeakForWallboard

function playEscalationDing() {
  if (typeof window === 'undefined') return
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
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
    setTimeout(() => ctx.close().catch(() => {}), 900)
  } catch {
    // Web Audio indisponible
  }
}

// ============================================================
// Sous-composants — V2.0 PREMIUM
// ============================================================

/**
 * KpiCard — carte colorée pour la KPI row.
 * bg coloré selon type, value en 5xl font-black, label xs tracking 2px.
 */
function KpiCard({
  label,
  value,
  bgClass,
  textClass,
}: {
  label: string
  value: string | number
  bgClass: string
  textClass: string
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center rounded-[15px] px-3 py-5 text-center ${bgClass} ${textClass}`}
      style={{ boxShadow: '0 4px 8px rgba(0,0,0,0.1)', minHeight: '120px' }}
    >
      <span
        className="font-black uppercase leading-none tabular-nums"
        style={{ fontSize: 'clamp(28px, 3.2vw, 48px)', letterSpacing: '1px' }}
        suppressHydrationWarning
      >
        {value}
      </span>
      <span
        className="mt-2 font-bold uppercase"
        style={{ fontSize: '11px', letterSpacing: '2px' }}
      >
        {label}
      </span>
    </div>
  )
}

/**
 * ZonePanel — panneau horizontal coloré représentant une zone.
 * Layout : [icon white 45x45] [name] [status badge] [en attente | en cours] [→ arrow circle]
 * Couleur de fond selon statut (calme=bleu, attention=orange, critique=rouge+flash, default=jaune).
 * Le compteur affiche EN ATTENTE (grand) + EN COURS (badge pulsant si > 0).
 * Clic → filtre le tableau.
 */
function ZonePanel({
  zone,
  isActive,
  onClick,
}: {
  zone: ZoneAgg
  isActive: boolean
  onClick: () => void
}) {
  const st = zoneStatus(zone.count_en_attente, zone.count_en_cours)
  const isCritical = st === 'critical'
  const bgClass =
    st === 'calm'
      ? 'bg-[#000d10] text-white'
      : st === 'attention'
        ? 'bg-[#C9A961] text-white'
        : st === 'critical'
          ? 'bg-[#E30613] text-white'
          : 'bg-[#C9A961] text-black'
  const statusLabel = ZONE_STATUS_META_V2[st].label
  const hasOngoing = (zone.count_en_cours ?? 0) > 0
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={isActive}
      title={`${zone.nom} — ${statusLabel} · ${zone.count_en_attente} en attente · ${zone.count_en_cours ?? 0} en cours`}
      className={`group flex w-full items-center justify-between gap-3 rounded-[15px] px-5 py-[15px] transition-transform hover:-translate-y-0.5 ${bgClass} ${isCritical ? 'ops-flash-red' : ''}`}
      style={{
        boxShadow: '0 3px 6px rgba(0,0,0,0.1)',
        outline: isActive ? '3px solid #FFFFFF' : 'none',
        outlineOffset: isActive ? '-3px' : '0',
      }}
    >
      {/* White icon container 45×45 */}
      <span
        className="flex h-[45px] w-[45px] shrink-0 items-center justify-center rounded-[10px] bg-white"
        aria-hidden
        style={{ fontSize: '22px', lineHeight: 1 }}
      >
        {zone.emoji}
      </span>
      {/* Zone name */}
      <span
        className="min-w-0 flex-1 truncate text-left font-black uppercase"
        style={{ fontSize: '15px', letterSpacing: '1px' }}
      >
        {zone.nom}
      </span>
      {/* Status badge */}
      <span
        className="shrink-0 rounded-[12px] bg-white/30 px-2.5 py-1 font-black uppercase"
        style={{ fontSize: '11px', letterSpacing: '2px' }}
      >
        {statusLabel}
      </span>
      {/* Compteurs : en attente (grand) + en cours (badge pulsant) */}
      <span className="flex shrink-0 items-baseline gap-1.5">
        {/* EN COURS — badge pulsant si > 0 */}
        {hasOngoing && (
          <span
            className="ops-pulse-soft flex items-center gap-1 rounded-[10px] bg-white/90 px-1.5 py-0.5 font-black tabular-nums"
            style={{ fontSize: '13px', color: '#000d10', lineHeight: 1.1 }}
            title={`${zone.count_en_cours} incident(s) en cours`}
            suppressHydrationWarning
          >
            <span
              className="inline-block size-2 rounded-full bg-[#000d10]"
              style={{ animation: 'ops-pulse-dot 1.2s ease-in-out infinite' }}
              aria-hidden
            />
            {zone.count_en_cours}
          </span>
        )}
        {/* EN ATTENTE — compteur principal */}
        <span
          className="min-w-[44px] text-right font-black tabular-nums"
          style={{ fontSize: '32px', lineHeight: 1 }}
          suppressHydrationWarning
        >
          {zone.count_en_attente}
        </span>
      </span>
      {/* Arrow circle 40×40 */}
      <span
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white font-black text-black"
        aria-hidden
        style={{ fontSize: '20px', lineHeight: 1 }}
      >
        →
      </span>
    </button>
  )
}

// ============================================================
// V3 — Carte overlay de notification (haut-droite, pile)
// ------------------------------------------------------------
// Nouveau signalement (orange), SOS (rouge), résolution (vert),
// retard/alerte critique (rouge pulsé). Premium : coins arrondis,
// barre latérale colorée, entrée animée opsFlapIn.
// ============================================================

const OVERLAY_META: Record<OverlayKind, { emoji: string; barre: string; bg: string; texte: string; meta: string }> = {
  nouveau: { emoji: '⚠', barre: ORANGE, bg: '#FFF4E5', texte: '#7A3E00', meta: 'rgba(122,62,0,0.75)' },
  sos: { emoji: '🆘', barre: ROUGE, bg: '#FFE5E7', texte: '#7A0613', meta: 'rgba(122,6,19,0.75)' },
  resolu: { emoji: '✓', barre: VERT, bg: '#E3F7E9', texte: '#03531F', meta: 'rgba(3,83,31,0.7)' },
  retard: { emoji: '⏰', barre: ROUGE, bg: '#FFE5E7', texte: '#7A0613', meta: 'rgba(122,6,19,0.75)' },
}

function OverlayNotifCard({ n }: { n: OverlayNotif }) {
  const meta = OVERLAY_META[n.kind]
  return (
    <div
      role="status"
      className="ops-flap-in pointer-events-auto flex items-stretch gap-3 overflow-hidden rounded-[14px] pr-4"
      style={{
        backgroundColor: meta.bg,
        boxShadow: '0 10px 30px rgba(0,0,0,0.28)',
        borderLeft: `6px solid ${meta.barre}`,
      }}
    >
      <span
        className="flex w-12 shrink-0 items-center justify-center self-stretch font-black"
        style={{ backgroundColor: meta.barre, color: '#FFFFFF', fontSize: '20px' }}
        aria-hidden
      >
        {meta.emoji}
      </span>
      <span className="flex min-w-0 flex-col justify-center gap-0.5 py-2.5">
        <span className="font-black uppercase" style={{ fontSize: '13px', letterSpacing: '1.5px', color: meta.texte }}>
          {n.titre}
        </span>
        <span className="truncate font-bold" style={{ fontSize: '12px', letterSpacing: '0.5px', color: '#111111' }}>
          {n.detail}
        </span>
        <span className="truncate font-bold uppercase" style={{ fontSize: '9.5px', letterSpacing: '1px', color: meta.meta }}>
          {n.meta}
        </span>
      </span>
    </div>
  )
}

/**
 * AlertCard — carte pleine largeur pour une alerte seuil (TriggeredAlert).
 * Critical → bg rouge, Warning → bg orange.
 */
function AlertCard({ alert }: { alert: TriggeredAlert }) {
  const isCritical = alert.severity === 'critical'
  const bgClass = isCritical ? 'bg-[#E30613] text-white' : 'bg-[#C9A961] text-white'
  return (
    <div
      role="alert"
      className={`flex flex-col gap-2 rounded-[15px] px-5 py-4 ${bgClass}`}
      style={{
        marginBottom: '15px',
        boxShadow: isCritical ? '0 4px 8px rgba(227,6,19,0.3)' : '0 4px 8px rgba(255,107,0,0.3)',
      }}
    >
      {/* Header : zone name + time badge */}
      <div className="flex items-center justify-between gap-2">
        <span
          className="font-black uppercase"
          style={{ fontSize: '14px', letterSpacing: '2px' }}
        >
          {alert.zoneCode}
        </span>
        <span
          className="rounded-[12px] bg-white px-2.5 py-1 font-black uppercase tabular-nums"
          style={{ fontSize: '11px', letterSpacing: '1px', color: ROUGE }}
        >
          {relativeTimeShort(alert.triggeredAt)}
        </span>
      </div>
      {/* Problem */}
      <p
        className="font-black uppercase"
        style={{ fontSize: '18px', letterSpacing: '1px' }}
      >
        {alert.message}
      </p>
      {/* Buttons */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded-[10px] bg-white px-3 py-1.5 font-black uppercase transition-colors hover:bg-[#C9A961]"
          style={{ fontSize: '11px', letterSpacing: '1px', color: NOIR }}
        >
          APPELER
        </button>
        <button
          type="button"
          className="rounded-[10px] bg-white px-3 py-1.5 font-black uppercase transition-colors hover:bg-[#C9A961]"
          style={{ fontSize: '11px', letterSpacing: '1px', color: NOIR }}
        >
          ESCALADER
        </button>
      </div>
    </div>
  )
}

/**
 * ReportAlertCard — carte pleine largeur pour un signalement actif.
 * Critical (late > 15min) → bg rouge, sinon orange.
 * Boutons APPELER / ASSIGNER (menu) / ESCALADER.
 */
function ReportAlertCard({
  r,
  onCall,
  onEscalate,
  onAssign,
  busy,
}: {
  r: RecentReport
  onCall: () => void
  onEscalate: () => void
  onAssign: (team: TeamKey) => void
  busy: boolean
}) {
  const elapsedMin = Math.floor((Date.now() - new Date(r.createdAt).getTime()) / 60000)
  const isLate = elapsedMin > 15 && r.statut !== 'RESOLU'
  const bgClass = isLate ? 'bg-[#E30613] text-white' : 'bg-[#C9A961] text-white'
  const [showAssignMenu, setShowAssignMenu] = useState(false)
  return (
    <div
      role="alert"
      className={`relative flex flex-col gap-2 rounded-[15px] px-5 py-4 ${bgClass}`}
      style={{
        marginBottom: '15px',
        boxShadow: isLate ? '0 4px 8px rgba(227,6,19,0.3)' : '0 4px 8px rgba(255,107,0,0.3)',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <span
          className="font-black uppercase"
          style={{ fontSize: '14px', letterSpacing: '2px' }}
        >
          {(r.zone?.nom ?? 'ZONE').toUpperCase()}
        </span>
        <span
          className="rounded-[12px] bg-white px-2.5 py-1 font-black uppercase tabular-nums"
          style={{ fontSize: '11px', letterSpacing: '1px', color: ROUGE }}
        >
          {isLate ? 'EN RETARD' : relativeTimeShort(r.createdAt)}
        </span>
      </div>
      {/* Problem */}
      <p
        className="font-black uppercase"
        style={{ fontSize: '18px', letterSpacing: '1px' }}
      >
        {r.problemType}
      </p>
      {/* Buttons */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onCall}
          className="inline-flex items-center gap-1 rounded-[10px] bg-white px-3 py-1.5 font-black uppercase transition-colors hover:bg-[#C9A961]"
          style={{ fontSize: '11px', letterSpacing: '1px', color: NOIR }}
        >
          <Phone className="size-3" aria-hidden />
          APPELER
        </button>
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowAssignMenu((v) => !v)}
            disabled={busy}
            className="inline-flex items-center gap-1 rounded-[10px] bg-white px-3 py-1.5 font-black uppercase transition-colors hover:bg-[#C9A961] disabled:opacity-50"
            style={{ fontSize: '11px', letterSpacing: '1px', color: NOIR }}
          >
            <Wrench className="size-3" aria-hidden />
            ASSIGNER
          </button>
          {showAssignMenu && (
            <div
              role="menu"
              className="absolute left-0 top-full z-30 mt-1 w-48 rounded-[12px] bg-white p-1.5"
              style={{ boxShadow: '0 6px 14px rgba(0,0,0,0.2)' }}
            >
              <p
                className="px-2 py-1 font-black uppercase text-[#000d10]"
                style={{ fontSize: '10px', letterSpacing: '2px' }}
              >
                REROUTER VERS
              </p>
              {(Object.keys(TEAM_META) as TeamKey[])
                .filter((k) => k !== 'other')
                .map((k) => (
                  <button
                    key={k}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      onAssign(k)
                      setShowAssignMenu(false)
                    }}
                    className="flex w-full items-center gap-2 rounded-[8px] px-2 py-1.5 text-left font-bold uppercase text-black transition-colors hover:bg-[#C9A961]"
                    style={{ fontSize: '11px', letterSpacing: '1px' }}
                  >
                    <span aria-hidden>{TEAM_META[k].emoji}</span>
                    <span>{TEAM_META[k].label}</span>
                  </button>
                ))}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={onEscalate}
          disabled={busy}
          className="inline-flex items-center gap-1 rounded-[10px] bg-white px-3 py-1.5 font-black uppercase transition-colors hover:bg-[#C9A961] disabled:opacity-50"
          style={{ fontSize: '11px', letterSpacing: '1px', color: NOIR }}
        >
          <Megaphone className="size-3" aria-hidden />
          ESCALADER
        </button>
      </div>
    </div>
  )
}

/** HelpRequestAlertCard — carte SOS voyageur. */
function HelpRequestAlertCard({ h }: { h: HelpRequestLite }) {
  const elapsedMin = Math.floor((Date.now() - new Date(h.createdAt).getTime()) / 60000)
  const isLate = elapsedMin > 15
  const bgClass = isLate ? 'bg-[#E30613] text-white' : 'bg-[#C9A961] text-white'
  return (
    <div
      role="alert"
      className={`flex flex-col gap-2 rounded-[15px] px-5 py-4 ${bgClass}`}
      style={{
        marginBottom: '15px',
        boxShadow: isLate ? '0 4px 8px rgba(227,6,19,0.3)' : '0 4px 8px rgba(255,107,0,0.3)',
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className="font-black uppercase"
          style={{ fontSize: '14px', letterSpacing: '2px' }}
        >
          🆘 SOS {(h.zone?.nom ?? 'ZONE').toUpperCase()}
        </span>
        <span
          className="rounded-[12px] bg-white px-2.5 py-1 font-black uppercase tabular-nums"
          style={{ fontSize: '11px', letterSpacing: '1px', color: ROUGE }}
        >
          {relativeTimeShort(h.createdAt)}
        </span>
      </div>
      <p
        className="font-black uppercase"
        style={{ fontSize: '18px', letterSpacing: '1px' }}
      >
        {h.message ?? "DEMANDE D'AIDE VOYAGEUR"}
      </p>
      {h.travelerPhone && (
        <a
          href={`tel:${h.travelerPhone}`}
          className="inline-flex w-fit items-center gap-1 rounded-[10px] bg-white px-3 py-1.5 font-black uppercase transition-colors hover:bg-[#C9A961]"
          style={{ fontSize: '11px', letterSpacing: '1px', color: NOIR }}
        >
          <Phone className="size-3" aria-hidden />
          APPELER VOYAGEUR
        </a>
      )}
    </div>
  )
}

/**
 * IncidentRow — ligne du tableau d'incidents.
 * Ligne blanche arrondie (10px), cells en flex, première/dernière cell gère le radius.
 * Statut badge coloré, actions icônes 32×32 (bleu normal / rouge danger).
 * Time rouge si < 15min écoulées.
 */
function IncidentRow({
  r,
  fresh,
  onActionFeedback,
}: {
  r: RecentReport
  fresh: boolean
  onActionFeedback?: (msg: string, kind?: 'ok' | 'err') => void
}) {
  const team = teamMeta(r.routedTeam)
  const [showAssignMenu, setShowAssignMenu] = useState(false)
  const [busy, setBusy] = useState(false)
  const elapsedMin = Math.floor((Date.now() - new Date(r.createdAt).getTime()) / 60000)
  const isLate = elapsedMin > 15 && r.statut !== 'RESOLU'

  // Status badge classes
  const statusBadgeCls =
    r.statut === 'RESOLU'
      ? 'bg-[#C9A961] text-white'
      : r.statut === 'EN_ATTENTE'
        ? 'bg-[#E30613] text-white'
        : r.statut === 'EN_COURS'
          ? 'bg-[#C9A961] text-black'
          : 'bg-[#000d10] text-white'
  const statusLabel = isLate
    ? 'EN RETARD'
    : r.statut === 'EN_ATTENTE'
      ? 'EN ATTENTE'
      : r.statut === 'EN_COURS'
        ? 'EN COURS'
        : r.statut === 'RESOLU'
          ? 'RÉSOLU'
          : r.statut

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
            phone: `team:${teamKey}`,
            message: `Rerouting ops vers ${TEAM_META[teamKey].label}`,
          }),
        })
        const json = (await res.json()) as { ok?: boolean; error?: string }
        if (json?.ok) {
          onActionFeedback?.(`AFFECTÉ → ${TEAM_META[teamKey].label} — ${r.zone?.nom ?? 'ZONE'}`, 'ok')
        } else {
          onActionFeedback?.(json?.error ?? 'ÉCHEC ASSIGNATION', 'err')
        }
      } catch {
        onActionFeedback?.('ERREUR RÉSEAU ASSIGNATION', 'err')
      } finally {
        setBusy(false)
      }
    },
    [r.id, r.zone?.nom, onActionFeedback],
  )

  const handleCall = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.open('tel:+221784858226', '_self')
    }
    onActionFeedback?.('APPEL OPS CENTER…', 'ok')
  }, [onActionFeedback])

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
        onActionFeedback?.(`ESCALADE NATHALIE → ${(r.zone?.nom ?? 'ZONE').toUpperCase()}`, 'ok')
      } else {
        onActionFeedback?.(json?.error ?? 'ÉCHEC ESCALADE', 'err')
      }
    } catch {
      onActionFeedback?.('ERREUR RÉSEAU ESCALADE', 'err')
    } finally {
      setBusy(false)
    }
  }, [r.id, r.zone?.nom, r.problemType, onActionFeedback])

  return (
    <div
      role="row"
      className={`flex items-center gap-2 rounded-[10px] bg-white px-5 py-3.5 ${fresh ? 'ops-flap-in' : ''} ${isLate ? 'ops-flash-red-row' : ''}`}
      style={{ boxShadow: '0 2px 4px rgba(0,0,0,0.06)' }}
    >
      {/* TIME */}
      <div
        role="cell"
        className="shrink-0 font-black uppercase tabular-nums"
        style={{ fontSize: '14px', letterSpacing: '1px', width: '70px', color: isLate ? ROUGE : NOIR }}
      >
        {formatTimeShort(r.createdAt)}
      </div>

      {/* ZONE */}
      <div role="cell" className="flex min-w-0 flex-1 items-center gap-2">
        <span aria-hidden style={{ fontSize: '16px', lineHeight: 1 }}>
          {r.zone?.emoji ?? '📍'}
        </span>
        <span
          className="truncate font-black uppercase"
          style={{ fontSize: '13px', letterSpacing: '1px' }}
        >
          {(r.zone?.nom ?? 'ZONE INCONNUE').toUpperCase()}
        </span>
      </div>

      {/* PROBLÈME */}
      <div
        role="cell"
        className="hidden min-w-0 flex-1 items-center gap-1.5 sm:flex"
      >
        {r.isHelpRequest && (
          <span
            className="rounded-[8px] bg-[#E30613] px-1.5 py-0.5 font-black uppercase text-white"
            style={{ fontSize: '10px', letterSpacing: '1px' }}
          >
            SOS
          </span>
        )}
        <span
          className="truncate font-bold uppercase"
          style={{ fontSize: '12px', letterSpacing: '1px' }}
        >
          {r.problemType}
        </span>
      </div>

      {/* STATUT */}
      <div role="cell" className="hidden shrink-0 md:block">
        <span
          className={`inline-block rounded-[12px] px-3.5 py-1.5 font-black uppercase ${statusBadgeCls}`}
          style={{ fontSize: '11px', letterSpacing: '2px' }}
        >
          {statusLabel}
        </span>
      </div>

      {/* ÉQUIPE */}
      <div role="cell" className="hidden shrink-0 lg:block" style={{ width: '90px' }}>
        {team ? (
          <span
            className="font-bold uppercase"
            style={{ fontSize: '12px', letterSpacing: '1px' }}
          >
            <span aria-hidden>{team.emoji}</span> {team.abbr}
          </span>
        ) : (
          <span style={{ fontSize: '12px', opacity: 0.4 }}>—</span>
        )}
      </div>

      {/* ÉCOULÉ */}
      <div
        role="cell"
        className="shrink-0 font-black uppercase tabular-nums"
        style={{ fontSize: '12px', letterSpacing: '1px', width: '60px', color: isLate ? ROUGE : NOIR }}
      >
        {relativeTimeShort(r.createdAt)}
      </div>

      {/* ACTIONS — icônes 32×32 */}
      <div role="cell" className="hidden shrink-0 items-center gap-1.5 xl:flex">
        {!r.isHelpRequest && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowAssignMenu((v) => !v)}
              disabled={busy}
              aria-label="Assigner ou rerouter le signalement"
              title="ASSIGNER / REROUTER"
              className="flex h-8 w-8 items-center justify-center rounded-[8px] bg-[#000d10] text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              <Wrench className="size-4" aria-hidden />
            </button>
            {showAssignMenu && (
              <div
                role="menu"
                className="absolute right-0 top-full z-20 mt-1 w-44 rounded-[12px] bg-white p-1.5"
                style={{ boxShadow: '0 6px 14px rgba(0,0,0,0.2)' }}
              >
                <p
                  className="px-2 py-1 font-black uppercase text-[#000d10]"
                  style={{ fontSize: '10px', letterSpacing: '2px' }}
                >
                  REROUTER VERS
                </p>
                {(Object.keys(TEAM_META) as TeamKey[])
                  .filter((k) => k !== 'other')
                  .map((k) => (
                    <button
                      key={k}
                      type="button"
                      role="menuitem"
                      onClick={() => void handleAssign(k)}
                      className="flex w-full items-center gap-2 rounded-[8px] px-2 py-1.5 text-left font-bold uppercase text-black transition-colors hover:bg-[#C9A961]"
                      style={{ fontSize: '11px', letterSpacing: '1px' }}
                    >
                      <span aria-hidden>{TEAM_META[k].emoji}</span>
                      <span>{TEAM_META[k].label}</span>
                    </button>
                  ))}
              </div>
            )}
          </div>
        )}
        <button
          type="button"
          onClick={handleCall}
          aria-label="Appeler le PC ops"
          title="APPELER PC OPS (+221 78 485 8226)"
          className="flex h-8 w-8 items-center justify-center rounded-[8px] bg-[#000d10] text-white transition-opacity hover:opacity-90"
        >
          <Phone className="size-4" aria-hidden />
        </button>
        {!r.isHelpRequest && (
          <button
            type="button"
            onClick={handleEscalate}
            disabled={busy}
            aria-label="Escalader auprès de Nathalie"
            title="ESCALADER (NATHALIE TAKE_CHARGE)"
            className="flex h-8 w-8 items-center justify-center rounded-[8px] bg-[#E30613] text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            <Megaphone className="size-4" aria-hidden />
          </button>
        )}
      </div>
    </div>
  )
}

function PlaceholderRow() {
  return (
    <div
      role="row"
      aria-hidden
      className="flex items-center gap-2 rounded-[10px] bg-white/60 px-5 py-3.5"
      style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}
    >
      <div className="ops-pulse rounded-[6px]" style={{ width: '70px', height: '16px', backgroundColor: '#E0E0E0' }} />
      <div className="ops-pulse flex-1 rounded-[6px]" style={{ height: '16px', backgroundColor: '#E0E0E0' }} />
      <div className="ops-pulse hidden flex-1 rounded-[6px] sm:block" style={{ height: '16px', backgroundColor: '#E0E0E0' }} />
      <div className="ops-pulse hidden rounded-[12px] md:block" style={{ width: '90px', height: '24px', backgroundColor: '#E0E0E0' }} />
      <div className="ops-pulse hidden rounded-[6px] lg:block" style={{ width: '90px', height: '16px', backgroundColor: '#E0E0E0' }} />
      <div className="ops-pulse rounded-[6px]" style={{ width: '60px', height: '16px', backgroundColor: '#E0E0E0' }} />
      <div className="ops-pulse hidden rounded-[8px] xl:block" style={{ width: '32px', height: '32px', backgroundColor: '#E0E0E0' }} />
    </div>
  )
}

/** SlaRow — ligne SLA par zone. */
function SlaRow({ zone, sla }: { zone: ZoneAgg; sla?: SlaStats }) {
  if (!sla || sla.targetMinutes === null) {
    return (
      <div className="flex items-center gap-2 rounded-[8px] bg-[#F5F5F5] px-2.5 py-1.5">
        <span aria-hidden style={{ fontSize: '14px' }}>{zone.emoji}</span>
        <span
          className="min-w-0 flex-1 truncate font-black uppercase"
          style={{ fontSize: '11px', letterSpacing: '1px' }}
        >
          {zone.nom}
        </span>
        <span
          className="rounded-[8px] bg-[#000d10] px-2 py-0.5 font-black uppercase text-white"
          style={{ fontSize: '10px', letterSpacing: '1px' }}
        >
          N/A
        </span>
      </div>
    )
  }
  const pct = sla.slaCompliancePercent
  const hasResolutions = sla.resolvedCount > 0
  const pctCls =
    !hasResolutions
      ? 'bg-[#000d10] text-white'
      : pct >= 80
        ? 'bg-[#C9A961] text-white'
        : pct >= 60
          ? 'bg-[#C9A961] text-black'
          : 'bg-[#E30613] text-white'
  return (
    <div className="flex items-center gap-2 rounded-[8px] bg-[#F5F5F5] px-2.5 py-1.5">
      <span aria-hidden style={{ fontSize: '14px' }}>{zone.emoji}</span>
      <span
        className="min-w-0 flex-1 truncate font-black uppercase"
        style={{ fontSize: '11px', letterSpacing: '1px' }}
      >
        {zone.nom}
      </span>
      <span
        className="font-black uppercase tabular-nums"
        style={{ fontSize: '10px', letterSpacing: '1px', color: NOIR }}
      >
        ≤{sla.targetMinutes}M
      </span>
      <span
        className={`rounded-[8px] px-2 py-0.5 font-black uppercase tabular-nums ${pctCls}`}
        style={{ fontSize: '11px', letterSpacing: '1px' }}
      >
        {hasResolutions ? `${pct}%` : '—'}
      </span>
    </div>
  )
}

/** ChargeRow — ligne charge par zone : barre colorée + count. */
function ChargeRow({ zone, max }: { zone: ZoneAgg; max: number }) {
  const pct = max > 0 ? Math.max(2, Math.round((zone.count_en_attente / max) * 100)) : 0
  const countCls =
    zone.count_en_attente > 5
      ? 'bg-[#E30613] text-white'
      : zone.count_en_attente > 0
        ? 'bg-[#C9A961] text-white'
        : 'bg-[#000d10] text-white'
  const barColor =
    zone.count_en_attente > 5
      ? ROUGE
      : zone.count_en_attente > 0
        ? ORANGE
        : BLEU
  return (
    <div className="flex items-center gap-2 rounded-[8px] bg-[#F5F5F5] px-2.5 py-1.5">
      <span aria-hidden style={{ fontSize: '14px' }}>{zone.emoji}</span>
      <span
        className="min-w-0 flex-1 truncate font-black uppercase"
        style={{ fontSize: '11px', letterSpacing: '1px' }}
      >
        {zone.nom}
      </span>
      <div
        className="overflow-hidden rounded-[4px]"
        style={{ width: '80px', height: '8px', backgroundColor: '#E0E0E0' }}
      >
        <div
          className="h-full transition-all duration-700"
          style={{
            width: `${zone.count_en_attente === 0 ? 0 : pct}%`,
            backgroundColor: barColor,
          }}
        />
      </div>
      <span
        className={`rounded-[8px] px-2 py-0.5 font-black uppercase tabular-nums ${countCls}`}
        style={{ fontSize: '11px', letterSpacing: '1px' }}
      >
        {zone.count_en_attente}
      </span>
    </div>
  )
}

// --- Squelettes de chargement ---
function KpiSkeleton() {
  return (
    <div
      className="ops-pulse flex flex-col items-center justify-center rounded-[15px] px-3 py-5"
      style={{ backgroundColor: '#E0E0E0', minHeight: '120px' }}
    >
      <div className="rounded-[6px]" style={{ width: '60%', height: '36px', backgroundColor: '#D0D0D0' }} />
      <div className="mt-2 rounded-[4px]" style={{ width: '40%', height: '12px', backgroundColor: '#D0D0D0' }} />
    </div>
  )
}

function RowSkeleton() {
  return (
    <div
      className="flex items-center gap-2 rounded-[10px] bg-white px-5 py-3.5"
      style={{ boxShadow: '0 2px 4px rgba(0,0,0,0.06)' }}
    >
      <div className="ops-pulse rounded-[4px]" style={{ width: '70px', height: '16px', backgroundColor: '#E0E0E0' }} />
      <div className="ops-pulse flex-1 rounded-[4px]" style={{ height: '16px', backgroundColor: '#E0E0E0' }} />
      <div className="ops-pulse hidden flex-1 rounded-[4px] sm:block" style={{ height: '16px', backgroundColor: '#E0E0E0' }} />
      <div className="ops-pulse hidden rounded-[12px] md:block" style={{ width: '90px', height: '24px', backgroundColor: '#E0E0E0' }} />
      <div className="ops-pulse hidden rounded-[4px] lg:block" style={{ width: '90px', height: '16px', backgroundColor: '#E0E0E0' }} />
      <div className="ops-pulse rounded-[4px]" style={{ width: '60px', height: '16px', backgroundColor: '#E0E0E0' }} />
    </div>
  )
}

function MiniRowSkeleton() {
  return (
    <div className="flex items-center gap-2 rounded-[8px] bg-[#F5F5F5] px-2.5 py-1.5">
      <div className="ops-pulse rounded-[4px]" style={{ width: '16px', height: '16px', backgroundColor: '#D0D0D0' }} />
      <div className="ops-pulse flex-1 rounded-[4px]" style={{ height: '16px', backgroundColor: '#D0D0D0' }} />
      <div className="ops-pulse rounded-[8px]" style={{ width: '40px', height: '16px', backgroundColor: '#D0D0D0' }} />
    </div>
  )
}

/**
 * CrisisButtonV2 — bouton mode crise V2.0 premium.
 * Inactif : bg rouge, border blanc 3px, rounded 15px, texte blanc.
 * Actif : tuile rouge pulse + timer + bouton FIN (vert).
 */
function CrisisButtonV2({
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
        <div
          className="ops-pulse flex flex-col items-center rounded-[15px] bg-[#E30613] px-3 py-1.5 text-white"
          style={{ border: '3px solid #FFFFFF' }}
        >
          <span
            className="font-black uppercase"
            style={{ fontSize: '9px', letterSpacing: '2px' }}
          >
            CRISE ACTIVE
          </span>
          <span
            suppressHydrationWarning
            className="font-black tabular-nums"
            style={{ fontSize: '14px' }}
          >
            {formatDurationSec(elapsedSec)}
          </span>
        </div>
        <button
          type="button"
          onClick={onEnd}
          aria-pressed={active}
          aria-label="Désactiver le mode crise"
          title="Terminer la crise"
          className="flex items-center gap-1.5 rounded-[15px] bg-[#C9A961] px-3 py-2 font-black uppercase text-white transition-opacity hover:opacity-90"
          style={{ border: '3px solid #FFFFFF', fontSize: '11px', letterSpacing: '1px' }}
        >
          <ShieldAlert className="size-4" aria-hidden />
          FIN
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
      className="flex items-center gap-1.5 rounded-[15px] bg-[#E30613] px-3 py-2 font-black uppercase text-white transition-opacity hover:opacity-90"
      style={{ border: '3px solid #FFFFFF', fontSize: '11px', letterSpacing: '1px' }}
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
  const previousStatusRef = useRef<Map<string, string>>(new Map())
  const announcedResolvedRef = useRef<Set<string>>(new Set())
  const alertedLateRef = useRef<Set<string>>(new Set())
  const escalationStartedRef = useRef<boolean>(false)

  // --- DIAGNOSTIC V3 — Annonces vocales du wallboard ---
  // ANCIEN BUG (rapporté par le directeur) : soundOn démarrait à FALSE et la
  // bannière « Activer le son » ne s'affichait que 10 s au chargement. Si
  // personne ne cliquait à temps, AUCUNE annonce de nouveau signalement ni
  // de résolution n'était diffusée — seuls les rappels « EN RETARD »
  // (badges rouges visuels, indépendants du son) semblaient fonctionner.
  // FIX : le son est désormais ACTIVÉ PAR DÉFAUT (ops room = TV dédiée),
  // désactivable via le bouton haut-droite (préférence persistée), et un
  // premier clic/touche n'importe où déverrouille l'audio (autoplay policy).
  const [soundOn, setSoundOn] = useState<boolean>(true)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const announcedAlertsRef = useRef<Set<string>>(new Set())
  const audioUnlockedRef = useRef<boolean>(false)
  const [showSoundBanner, setShowSoundBanner] = useState<boolean>(false)

  const [alerts, setAlerts] = useState<TriggeredAlert[]>([])
  const [alertsError, setAlertsError] = useState<string | null>(null)

  // --- V3 — pile des notifications visuelles (overlays haut-droite) ---
  const [overlayNotifs, setOverlayNotifs] = useState<OverlayNotif[]>([])
  const pushOverlay = useCallback((n: Omit<OverlayNotif, 'id'>) => {
    const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
    setOverlayNotifs((prev) => [{ ...n, id }, ...prev].slice(0, 4))
    setTimeout(() => {
      setOverlayNotifs((prev) => prev.filter((o) => o.id !== id))
    }, 9000)
  }, [])

  const [filterZone, setFilterZone] = useState<string | null>(null)
  const [crisisMode, setCrisisMode] = useState<boolean>(false)
  const [crisisStart, setCrisisStart] = useState<Date | null>(null)
  const [crisisSummary, setCrisisSummary] = useState<string | null>(null)
  const [leaderboard, setLeaderboard] = useState<LeaderboardData | null>(null)
  const [actionToast, setActionToast] = useState<{ msg: string; kind: 'ok' | 'err' } | null>(null)

  // --- Feature F1 : Nathalie IA Conversationnelle (micro + SpeechRecognition) ---
  const [listening, setListening] = useState<boolean>(false)
  const [deniseTranscript, setDeniseTranscript] = useState<string>('')
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)

  // --- Feature F2 : Auto-Pilot Nathalie (polling 60s) ---
  const [autopilotActive, setAutopilotActive] = useState<boolean>(false)
  const [autopilotActions, setAutopilotActions] = useState<AutopilotAction[]>([])
  const announcedAutopilotRef = useRef<Map<string, number>>(new Map())

  // --- Feature F3 : Mini-Game Staff 2.0 (achievements + compétition) ---
  const [achievementsData, setAchievementsData] = useState<AchievementsData | null>(null)
  const announcedAchievementsRef = useRef<Set<string>>(new Set())

  // --- Task WAHOO-4 — Mode Prédictif de Nathalie (polling 5 min) ---
  // predictiveAlerts : liste des prédictions HIGH/MEDIUM renvoyées par
  //   /api/airport/predictive-alert (max 3, triées par priorité).
  // predictiveTick : index de la prédiction actuellement affichée dans
  //   le bandeau — cycle toutes les 8s si plusieurs prédictions.
  // announcedPredictionsRef : Set des IDs déjà annoncés vocalement par
  //   Nathalie (dédup — évite de répéter la même prédiction toutes les 5 min).
  const [predictiveAlerts, setPredictiveAlerts] = useState<PredictiveAlert[]>([])
  const [predictiveTick, setPredictiveTick] = useState(0)
  const announcedPredictionsRef = useRef<Set<string>>(new Set())

  // --- Polling API toutes les 5s ---
  const poll = useCallback(async () => {
    try {
      const d = await fetchWallboard()
      const newFresh = new Set<string>()
      const newReports: RecentReport[] = []
      for (const r of d.recent_reports) {
        if (!seenIdsRef.current.has(r.id)) {
          newFresh.add(r.id)
          seenIdsRef.current.add(r.id)
          newReports.push(r)
        }
      }
      if (firstLoadRef.current) {
        firstLoadRef.current = false
        setFreshIds(new Set())
      } else {
        setFreshIds(newFresh)
        if (newFresh.size > 0) {
          setTimeout(() => setFreshIds(new Set()), 1500)
          if (newReports.length > 0) {
            const latest = newReports[0]
            playSound(SOUND_NORMAL, audioRef)
            const zoneNom = latest.zone?.nom ?? latest.tagScanne
            const elapsedMs = Date.now() - new Date(latest.createdAt).getTime()
            const tempsMin = Math.max(1, Math.floor(elapsedMs / 60000))
            const team = latest.routedTeam
            const equipeLabel = team ? ` Équipe ${team}.` : ''
            // Task WAHOO-1 — Nathalie Traducteur Universel
            // Si le voyageur a écrit dans une langue ≠ français (commentaireLang
            // !== 'fr' et non null), on ajoute « Message original en [langue] »
            // à l'annonce vocale. Nathalie parle en français (le commentaire stocké
            // est la traduction FR), mais signale la langue d'origine au staff
            // pour contexte culturel (touriste chinois, voyageur wolof, etc.).
            const langueOrigine = langueEnFrancais(latest.commentaireLang)
            const origineLabel = langueOrigine ? ` Message original en ${langueOrigine}.` : ''
            const annonce = latest.isHelpRequest
              ? `Demande d'aide SOS voyageur. ${zoneNom}. ${latest.problemType}. En attente depuis ${tempsMin} minute${tempsMin > 1 ? 's' : ''}.${origineLabel}`
              : `Nouvel incident signalé. ${zoneNom}. Type: ${latest.problemType}.${equipeLabel} En attente depuis ${tempsMin} minute${tempsMin > 1 ? 's' : ''}.${origineLabel}`
            // V3 — annonce vocale TOUJOURS tentée (le son n'est coupable que
            // d'un choix explicite de l'opérateur via le bouton haut-droite).
            setTimeout(() => speak(annonce, soundOn), 300)
            // V3 — notification VISUELLE pour chaque nouveau signalement
            // (jusqu'à 3 par cycle) : carte overlay premium, indépendante du son.
            for (const r of newReports.slice(0, 3)) {
              const znom = r.zone?.nom ?? r.tagScanne
              pushOverlay({
                kind: r.isHelpRequest ? 'sos' : 'nouveau',
                titre: r.isHelpRequest ? 'SOS VOYAGEUR' : 'NOUVEAU SIGNALEMENT',
                detail: `${znom} — ${r.problemType}`,
                meta: r.isHelpRequest ? 'Demande d\'aide · Appuyez sur Appeler' : team ? `Équipe ${team} · en attente ${tempsMin} min` : `En attente ${tempsMin} min`,
              })
            }
          }
        }
      }

      // --- Annonce de RÉSOLUTION (Issue 6 + demande directeur V3) ---
      // « Le signalement déclaré résolu doit s'annoncer dans le wallboard » :
      // son resolved.wav + voix Nathalie + carte verte overlay systématiques.
      if (d.recently_resolved && d.recently_resolved.length > 0) {
        for (const r of d.recently_resolved) {
          if (!announcedResolvedRef.current.has(r.id)) {
            announcedResolvedRef.current.add(r.id)
            const zoneNom = r.zone?.nom ?? r.tagScanne
            pushOverlay({
              kind: 'resolu',
              titre: 'SIGNALEMENT RÉSOLU',
              detail: `${zoneNom} — ${r.problemType}`,
              meta: 'Intervention terminée · Merci à l\'équipe',
            })
            playSound(SOUND_RESOLVED, audioRef)
            setTimeout(
              () => speak(`Signalement résolu. ${zoneNom}. ${r.problemType}. Bien fait.`, soundOn),
              400,
            )
            break
          }
        }
      }
      if (d.recently_resolved) {
        const activeIds = new Set(d.recently_resolved.map((r) => r.id))
        for (const id of [...announcedResolvedRef.current]) {
          if (!activeIds.has(id)) announcedResolvedRef.current.delete(id)
        }
      }
      for (const r of d.recent_reports) {
        previousStatusRef.current.set(r.id, r.statut)
      }

      setData(d)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'erreur inconnue')
    }
  }, [soundOn, pushOverlay])

  useEffect(() => {
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
      // V3 — les alertes critiques s'annoncent TOUJOURS (son + voix + carte
      // overlay), indépendamment du bouton mute (sécurité ops room).
      for (const alert of a) {
        const alertKey = `${alert.thresholdId}-${alert.type}`
        if (!announcedAlertsRef.current.has(alertKey) && alert.severity === 'critical') {
          announcedAlertsRef.current.add(alertKey)
          pushOverlay({
            kind: 'retard',
            titre: 'ALERTE CRITIQUE',
            detail: alert.message,
            meta: 'Seuil franchi · Action immédiate',
          })
          playSound(SOUND_CRITICAL, audioRef)
          setTimeout(() => speak(`Alerte critique. ${alert.message}`, soundOn), 500)
          break
        }
      }
      const activeKeys = new Set(a.map((al) => `${al.thresholdId}-${al.type}`))
      for (const k of [...announcedAlertsRef.current]) {
        if (!activeKeys.has(k)) announcedAlertsRef.current.delete(k)
      }
      setAlerts(a)
      setAlertsError(null)
    } catch (e) {
      setAlertsError(e instanceof Error ? e.message : 'erreur alertes')
    }
  }, [soundOn, pushOverlay])

  useEffect(() => {
    const initial = setTimeout(() => void pollAlerts(), 1500)
    const api = setInterval(() => void pollAlerts(), 30000)
    return () => {
      clearTimeout(initial)
      clearInterval(api)
    }
  }, [pollAlerts])

  // --- Polling leaderboard (60s) ---
  useEffect(() => {
    const fetchLeaderboard = async () => {
      try {
        const res = await fetch('/api/airport/leaderboard', { cache: 'no-store' })
        if (!res.ok) return
        const json = (await res.json()) as { ok?: boolean; data?: LeaderboardData }
        if (json?.ok && json.data) setLeaderboard(json.data)
      } catch {
        // ignore
      }
    }
    const initial = setTimeout(() => void fetchLeaderboard(), 2000)
    const api = setInterval(() => void fetchLeaderboard(), 60000)
    return () => {
      clearTimeout(initial)
      clearInterval(api)
    }
  }, [])

  // --- Feature F2 : Auto-Pilot Nathalie (polling 60s) ---
  // Vérifie les incidents orphelins (> 10min), les motifs systémiques (3+
  // même zone en 1h) et les pics imminents (score prédiction > 80). Le
  // serveur exécute les auto-affectations ; le wallboard annonce chaque
  // action via parler() (voix Nathalie).
  const pollAutopilot = useCallback(async () => {
    try {
      const res = await fetch('/api/airport/autopilot', { method: 'POST' })
      if (!res.ok) return
      const json = (await res.json()) as {
        ok?: boolean
        data?: { actions: AutopilotAction[]; generatedAt: string }
      }
      if (!json?.ok || !json.data) return
      const actions = json.data.actions
      if (actions.length === 0) return
      setAutopilotActive(true)
      setAutopilotActions(actions)
      // Auto-hide du badge après 30s (l'action reste affichée le temps
      // que l'équipe ops la constate visuellement).
      setTimeout(() => setAutopilotActive(false), 30000)
      if (soundOn) {
        const nowMs = Date.now()
        const toAnnounce: string[] = []
        for (const action of actions) {
          const key = action.description
          const last = announcedAutopilotRef.current.get(key) ?? 0
          // Anti-spam : ne pas réannoncer la même description < 5min.
          if (nowMs - last < 5 * 60 * 1000) continue
          announcedAutopilotRef.current.set(key, nowMs)
          toAnnounce.push(action.description)
        }
        // Séquence les annonces (4s d'écart) — parler() coupe l'annonce
        // précédente, on espace donc pour que chaque message soit audible.
        toAnnounce.forEach((msg, i) => {
          setTimeout(() => parler(msg), i * 4000)
        })
        // Nettoyage des entrées expirées (> 10min).
        for (const [k, t] of announcedAutopilotRef.current) {
          if (nowMs - t > 10 * 60 * 1000) announcedAutopilotRef.current.delete(k)
        }
      }
    } catch {
      // ignore
    }
  }, [soundOn])

  useEffect(() => {
    const initial = setTimeout(() => void pollAutopilot(), 8000)
    const api = setInterval(() => void pollAutopilot(), 60000)
    return () => {
      clearTimeout(initial)
      clearInterval(api)
    }
  }, [pollAutopilot])

  // --- Feature F3 : Achievements (polling 60s) ---
  // Récupère la compétition d'équipes + le top performer + ses badges +
  // la série SLA. Annonce vocalement chaque nouveau badge débloqué via
  // parler() : "Achievement débloqué: Speed Demon! …"
  const pollAchievements = useCallback(async () => {
    try {
      const res = await fetch('/api/airport/achievements', { cache: 'no-store' })
      if (!res.ok) return
      const json = (await res.json()) as { ok?: boolean; data?: AchievementsData }
      if (!json?.ok || !json.data) return
      const data = json.data
      setAchievementsData(data)
      if (soundOn) {
        const toAnnounce: string[] = []
        for (const entry of data.leaderboard) {
          for (const ach of entry.achievements) {
            const key = `${entry.staffName}:${ach.id}`
            if (announcedAchievementsRef.current.has(key)) continue
            announcedAchievementsRef.current.add(key)
            toAnnounce.push(
              `Achievement débloqué: ${ach.label}! ${ach.description}`,
            )
          }
        }
        toAnnounce.forEach((msg, i) => {
          setTimeout(() => parler(msg), i * 4500)
        })
      }
    } catch {
      // ignore
    }
  }, [soundOn])

  useEffect(() => {
    const initial = setTimeout(() => void pollAchievements(), 3000)
    const api = setInterval(() => void pollAchievements(), 60000)
    return () => {
      clearTimeout(initial)
      clearInterval(api)
    }
  }, [pollAchievements])

  // --- Task WAHOO-4 — Polling prédictions Nathalie (5 min) ---
  //
  // Toutes les 5 min, on récupère les prédictions HIGH/MEDIUM calculées
  // côté serveur (vols aux portes + patterns historiques + charge actuelle).
  // Pour chaque NOUVELLE prédiction HIGH (non encore annoncée), Nathalie
  // l'énonce après un délai de 1,5 s pour éviter le chevauchement avec
  // d'autres annonces (nouvel incident, résolution, escalade, etc.).
  // Les prédictions MEDIUM ne sont pas annoncées vocalement (anti-spam) —
  // elles s'affichent juste dans le bandeau "PRÉDICTION NATHALIE".
  useEffect(() => {
    const fetchPredictive = async () => {
      try {
        const res = await fetch('/api/airport/predictive-alert', { cache: 'no-store' })
        const json = (await res.json()) as {
          ok?: boolean
          data?: { predictions: PredictiveAlert[] }
        }
        if (!json?.ok || !json.data?.predictions) return
        const preds = json.data.predictions
        setPredictiveAlerts(preds)
        // Reset predictiveTick si on dépasse la nouvelle longueur
        if (preds.length > 0) {
          setPredictiveTick((t) => t % preds.length)
        }
        // Annonce vocale des NOUVELLES prédictions HIGH via Nathalie.
        for (const pred of preds) {
          if (pred.priority !== 'high') continue
          if (announcedPredictionsRef.current.has(pred.id)) continue
          announcedPredictionsRef.current.add(pred.id)
          // Délai 1,5 s : laisse passer les annonces prioritaires (nouveaux
          // signalements, alertes critiques) avant la prédiction.
          setTimeout(() => speak(pred.message, soundOn), 1500)
        }
        // Cleanup : retire les IDs annoncés qui ne sont plus dans la réponse
        // (la prédiction a expiré — vol décollé, charge retombée, etc.).
        const activeIds = new Set(preds.map((p) => p.id))
        for (const id of [...announcedPredictionsRef.current]) {
          if (!activeIds.has(id)) announcedPredictionsRef.current.delete(id)
        }
      } catch {
        // ignore — réseau coupé, on réessaiera au prochain cycle
      }
    }
    void fetchPredictive()
    const id = setInterval(() => void fetchPredictive(), 5 * 60 * 1000) // 5 min
    return () => clearInterval(id)
  }, [soundOn])

  // --- Task WAHOO-4 — Cycle d'affichage du bandeau (8 s par prédiction) ---
  // Si plusieurs prédictions sont actives, on alterne entre elles toutes
  // les 8 s. Une seule prédiction → pas de cycle (fixe).
  useEffect(() => {
    if (predictiveAlerts.length <= 1) return
    const id = setInterval(
      () => setPredictiveTick((t) => (t + 1) % predictiveAlerts.length),
      8000,
    )
    return () => clearInterval(id)
  }, [predictiveAlerts.length])

  // --- Mode Crise ---
  const handleCrisisStart = useCallback(() => {
    setCrisisMode(true)
    setCrisisStart(new Date())
    setCrisisSummary(null)
    playEscalationDing()
    if (soundOn) {
      setTimeout(
        () =>
          speak(
            'Mode crise activé. Board filtré sur incidents critiques. Nathalie en mode crise.',
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
      setTimeout(() => setCrisisSummary(null), 6000)
    }
    setCrisisStart(null)
  }, [crisisStart, soundOn])

  const crisisElapsedSec = useMemo(() => {
    if (!crisisMode || !crisisStart) return 0
    return Math.max(0, Math.round((now.getTime() - crisisStart.getTime()) / 1000))
  }, [crisisMode, crisisStart, now])

  const handleActionFeedback = useCallback((msg: string, kind: 'ok' | 'err' = 'ok') => {
    setActionToast({ msg, kind })
    setTimeout(() => setActionToast(null), 3500)
  }, [])

  // --- Feature W1 — Rappel 15 min : escalade sonore ---
  useEffect(() => {
    if (!data) return
    const isFirstCheck = !escalationStartedRef.current
    escalationStartedRef.current = true
    const nowMs = Date.now()
    const activePendingIds = new Set<string>()
    for (const r of data.recent_reports) {
      if (r.statut === 'RESOLU') continue
      activePendingIds.add(r.id)
      const elapsedMin = Math.floor((nowMs - new Date(r.createdAt).getTime()) / 60000)
      if (elapsedMin < 15) continue
      let t = 15
      while (t <= elapsedMin) {
        const key = `${r.id}-${t}min`
        if (!alertedLateRef.current.has(key)) {
          alertedLateRef.current.add(key)
          if (!isFirstCheck) {
            playEscalationDing()
            const zoneNom = r.zone?.nom ?? r.tagScanne
            // V3 — notification visuelle de retard + annonce vocale
            pushOverlay({
              kind: 'retard',
              titre: 'SIGNALEMENT EN RETARD',
              detail: `${zoneNom} — ${r.problemType}`,
              meta: `${elapsedMin} minutes écoulées · Intervention requise`,
            })
            setTimeout(
              () =>
                speak(
                  `Signalement en retard. ${elapsedMin} minutes écoulées. ${zoneNom}. ${r.problemType}. Intervention requise.`,
                  soundOn,
                ),
              300,
            )
            break
          }
        }
        t += 5
      }
    }
    for (const key of [...alertedLateRef.current]) {
      const reportId = key.replace(/-\d+min$/, '')
      if (!activePendingIds.has(reportId)) {
        alertedLateRef.current.delete(key)
      }
    }
  }, [now, data, soundOn, pushOverlay])

  // --- Horloge 1s ---
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  // --- Chargement de la préférence son (localStorage) ---
  // V3 : si aucune préférence n'existe → son ACTIVÉ (comportement attendu
  // d'un wallboard TV). La bannière d'activation reste visible jusqu'au
  // premier clic (déverrouillage audio navigateur), sans timeout agressif.
  useEffect(() => {
    const t = setTimeout(() => {
      let pref: string | null = null
      try {
        pref = localStorage.getItem('wallboard_sound')
      } catch {
        /* localStorage indisponible */
      }
      if (pref === '0') {
        setSoundOn(false)
      } else {
        // pref === '1' ou absent → son activé + bannière de déverrouillage
        // (auto-dismiss 8 s : elle ne doit pas manger de la place sur la TV)
        setSoundOn(true)
        setShowSoundBanner(true)
        setTimeout(() => setShowSoundBanner(false), 8000)
      }
    }, 0)
    return () => clearTimeout(t)
  }, [])

  // --- Déverrouillage audio au premier geste (autoplay policy navigateur) ---
  // Un simple clic n'importe où sur le wallboard (ou une touche) joue le ding
  // d'accueil une unique fois : les <audio> et le TTS deviennent autorisés.
  useEffect(() => {
    const unlock = () => {
      if (audioUnlockedRef.current) return
      audioUnlockedRef.current = true
      setShowSoundBanner(false)
      try {
        const a = audioRef.current
        if (a) {
          a.src = SOUND_NORMAL
          a.volume = 0.35
          a.play().catch(() => {})
        }
      } catch {
        /* ignore */
      }
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
    }
    window.addEventListener('pointerdown', unlock)
    window.addEventListener('keydown', unlock)
    return () => {
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
    }
  }, [])

  const toggleSound = useCallback(() => {
    setSoundOn((prev) => {
      const next = !prev
      try {
        localStorage.setItem('wallboard_sound', next ? '1' : '0')
      } catch {
        /* ignore */
      }
      setShowSoundBanner(false)
      if (next) {
        playSound(SOUND_NORMAL, audioRef)
        speak('Son activé.', true)
      } else if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel()
      }
      return next
    })
  }, [])

  // --- Feature F1 : toggle micro (SpeechRecognition → processVoiceCommand → parler) ---
  // Bouton micro dans le header : démarre la reconnaissance vocale (fr-FR),
  // transcrit la phrase, l'envoie à /api/airport/denise-command (qui exécute
  // `processVoiceCommand()` côté serveur — la lib faisant des requêtes Prisma)
  // et énonce la réponse via parler() (voix Nathalie). Si l'action retournée
  // est 'crisis', déclenche handleCrisisStart() (qui énonce son propre message).
  const toggleListening = useCallback(() => {
    if (typeof window === 'undefined') return
    const w = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionLike
      webkitSpeechRecognition?: new () => SpeechRecognitionLike
    }
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition
    if (!Ctor) {
      handleActionFeedback(
        'Reconnaissance vocale non supportée par ce navigateur',
        'err',
      )
      return
    }
    if (listening) {
      recognitionRef.current?.stop()
      return
    }
    const rec = new Ctor()
    rec.lang = 'fr-FR'
    rec.continuous = false
    rec.interimResults = false
    rec.maxAlternatives = 1
    rec.onresult = async (event) => {
      const transcript = event.results[0]?.[0]?.transcript ?? ''
      if (!transcript) return
      setDeniseTranscript(transcript)
      try {
        const res = await fetch('/api/airport/denise-command', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: transcript }),
        })
        if (!res.ok) {
          parler('Erreur lors du traitement de la commande.')
          return
        }
        const json = (await res.json()) as {
          ok?: boolean
          data?: { response: string; action?: string }
          error?: string
        }
        if (!json?.ok || !json.data) {
          parler(json?.error ?? 'Erreur lors du traitement de la commande.')
          return
        }
        const result = json.data
        if (result.action === 'crisis') {
          // handleCrisisStart énonce son propre message + joue le ding
          // d'escalade — on évite le double parler.
          handleCrisisStart()
        } else {
          parler(result.response)
        }
      } catch {
        parler('Erreur lors du traitement de la commande.')
      }
    }
    rec.onerror = (event) => {
      console.warn('SpeechRecognition error', event.error)
      setListening(false)
    }
    rec.onend = () => {
      setListening(false)
      recognitionRef.current = null
    }
    recognitionRef.current = rec
    setListening(true)
    setDeniseTranscript('')
    try {
      rec.start()
    } catch (e) {
      console.warn('SpeechRecognition start error', e)
      setListening(false)
    }
  }, [listening, handleCrisisStart, handleActionFeedback])

  // --- Mémos ---
  const maxEnAttente = useMemo(
    () => (data ? Math.max(1, ...data.zones.map((z) => z.count_en_attente)) : 1),
    [data],
  )

  const overallSlaPct = useMemo<string>(() => {
    if (!data?.sla) return '—'
    const entries = Object.values(data.sla).filter(
      (s) => s.targetMinutes !== null && s.resolvedCount > 0,
    )
    if (entries.length === 0) return '—'
    const sum = entries.reduce((acc, s) => acc + s.slaCompliancePercent, 0)
    return `${Math.round(sum / entries.length)}%`
  }, [data])

  const overallSlaPctNum = useMemo<number | null>(() => {
    if (!data?.sla) return null
    const entries = Object.values(data.sla).filter(
      (s) => s.targetMinutes !== null && s.resolvedCount > 0,
    )
    if (entries.length === 0) return null
    const sum = entries.reduce((acc, s) => acc + s.slaCompliancePercent, 0)
    return Math.round(sum / entries.length)
  }, [data])

  const untreatedOver10Min = useMemo<number>(() => {
    if (!data) return 0
    const nowMs = Date.now()
    return data.recent_reports.filter((r) => {
      if (r.statut === 'RESOLU') return false
      const elapsedMin = (nowMs - new Date(r.createdAt).getTime()) / 60000
      return elapsedMin > 10
    }).length
  }, [data])

  const staffActive = useMemo<{ count: number; total: number }>(() => {
    if (!leaderboard) return { count: 0, total: 15 }
    const active = leaderboard.leaderboard.filter((e) => e.resolutions > 0).length
    return { count: active, total: Math.max(15, active) }
  }, [leaderboard])

  // --- Feature F3 : valeurs dérivées du payload achievements ---
  const competition = achievementsData?.competition ?? null
  const topPerformer = achievementsData?.topPerformer ?? null
  const streakDays = achievementsData?.streakDays ?? 0
  const streakSlaPct = achievementsData?.streakSlaPct ?? 0

  // --- Lignes filtrées (zone + crise) ---
  const filteredRows = useMemo<RecentReport[]>(() => {
    if (!data) return []
    let rows = data.recent_reports
    if (filterZone) {
      rows = rows.filter((r) => r.zone?.code === filterZone)
    }
    if (crisisMode) {
      rows = rows.filter((r) => isCriticalInCrisis(r))
    }
    return rows
  }, [data, filterZone, crisisMode])

  const filledRows = filteredRows.slice(0, 10)
  const placeholderCount = Math.max(0, 10 - filledRows.length)
  const topAlerts = alerts.slice(0, 4)
  const activeFilterLabel = crisisMode
    ? `MODE CRISE — ${filledRows.length} CRITIQUE(S)`
    : filterZone
      ? `FILTRE: ${filterZone.toUpperCase()} — ${filledRows.length} SIGNALEMENT(S)`
      : null

  const activeReportAlerts = useMemo<RecentReport[]>(() => {
    if (!data) return []
    const nowMs = Date.now()
    return data.recent_reports
      .filter((r) => r.statut !== 'RESOLU' && !r.isHelpRequest)
      .sort((a, b) => {
        const aMin = (nowMs - new Date(a.createdAt).getTime()) / 60000
        const bMin = (nowMs - new Date(b.createdAt).getTime()) / 60000
        const aLate = aMin > 15 ? 1 : 0
        const bLate = bMin > 15 ? 1 : 0
        if (bLate !== aLate) return bLate - aLate
        return bMin - aMin
      })
      .slice(0, 4 - topAlerts.length)
  }, [data, topAlerts.length])

  const families: Exclude<ZoneFamily, 'HISTORIQUE'>[] = [
    'EXTÉRIEUR',
    'SÛRETÉ',
    'TERMINAL',
    'COMMERCIAL',
    'SERVICE',
  ]
  const zonesByFamily = useMemo(() => {
    const groups: Partial<Record<Exclude<ZoneFamily, 'HISTORIQUE'>, ZoneAgg[]>> = {}
    if (!data) return groups
    for (const z of data.zones) {
      // TENANT-3 — Defensive filter : n'afficher que les zones airport.
      // L'API filtre déjà côté serveur mais on garde ce garde-fou client
      // au cas où une zone airline/vip_lounge serait remontée par legacy.
      if (!AIRPORT_ZONE_CODES.has(z.code)) continue
      const fam = zoneFamily(z.code)
      if (fam === 'HISTORIQUE') continue
      if (!groups[fam]) groups[fam] = []
      groups[fam]!.push(z)
    }
    return groups
  }, [data])

  const handleReportCall = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.open('tel:+221784858226', '_self')
    }
    handleActionFeedback('APPEL OPS CENTER…', 'ok')
  }, [handleActionFeedback])

  const handleReportAssign = useCallback(
    async (r: RecentReport, teamKey: TeamKey) => {
      try {
        const res = await fetch('/api/airport/assign', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            reportId: r.id,
            method: 'push',
            phone: `team:${teamKey}`,
            message: `Rerouting ops vers ${TEAM_META[teamKey].label}`,
          }),
        })
        const json = (await res.json()) as { ok?: boolean; error?: string }
        if (json?.ok) {
          handleActionFeedback(
            `AFFECTÉ → ${TEAM_META[teamKey].label} — ${(r.zone?.nom ?? 'ZONE').toUpperCase()}`,
            'ok',
          )
        } else {
          handleActionFeedback(json?.error ?? 'ÉCHEC ASSIGNATION', 'err')
        }
      } catch {
        handleActionFeedback('ERREUR RÉSEAU ASSIGNATION', 'err')
      }
    },
    [handleActionFeedback],
  )

  const handleReportEscalate = useCallback(
    async (r: RecentReport) => {
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
          handleActionFeedback(`ESCALADE NATHALIE → ${(r.zone?.nom ?? 'ZONE').toUpperCase()}`, 'ok')
        } else {
          handleActionFeedback(json?.error ?? 'ÉCHEC ESCALADE', 'err')
        }
      } catch {
        handleActionFeedback('ERREUR RÉSEAU ESCALADE', 'err')
      }
    },
    [handleActionFeedback],
  )

  const slaCardCls =
    overallSlaPctNum === null
      ? 'bg-[#C9A961] text-black'
      : overallSlaPctNum >= 80
        ? 'bg-[#C9A961] text-white'
        : overallSlaPctNum < 60
          ? 'bg-[#E30613] text-white'
          : 'bg-[#C9A961] text-black'

  return (
    <div
      className="flex h-[100dvh] flex-col overflow-hidden uppercase"
      style={{
        backgroundColor: PAGE_BG,
        fontFamily: "'Roboto Condensed', Arial, sans-serif",
      }}
    >
      {/* Keyframes globales — V2.0 animations */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Roboto+Condensed:wght@700;900&display=swap');
        @keyframes opsPulse { 0%,100%{opacity:1} 50%{opacity:.55} }
        @keyframes opsFlashRed {
          0%,100% { background-color: #E30613; }
          50% { background-color: #FF0000; }
        }
        @keyframes opsFlashRedRow {
          0%,100% { background-color: #FFFFFF; }
          50% { background-color: #FFE5E7; }
        }
        @keyframes opsFlapIn {
          from { opacity: 0; transform: translateY(-6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes opsLivePulse {
          0%,100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(1.3); }
        }
        @keyframes opsPulseDot {
          0%,100% { opacity: 0.45; transform: scale(0.9); }
          50% { opacity: 1; transform: scale(1.25); }
        }
        .ops-pulse { animation: opsPulse 1.4s ease-in-out infinite; }
        .ops-pulse-soft { animation: opsPulse 1.6s ease-in-out infinite; }
        .ops-flash-red { animation: opsFlashRed 2s ease-in-out infinite; }
        .ops-flash-red-row { animation: opsFlashRedRow 1.2s ease-in-out infinite; }
        .ops-flap-in { animation: opsFlapIn 0.5s ease-out; }
        .ops-live-pulse { animation: opsLivePulse 1.4s ease-in-out infinite; }
        .ops-crisis-overlay { background-color: rgba(227,6,19,0.04); }
        .ops-scroll::-webkit-scrollbar { width: 8px; height: 8px; }
        .ops-scroll::-webkit-scrollbar-track { background: #E0E0E0; border-radius: 4px; }
        .ops-scroll::-webkit-scrollbar-thumb { background: #000d10; border-radius: 4px; }
        .ops-scroll::-webkit-scrollbar-thumb:hover { background: #002277; }
        @keyframes opsPredMarquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        @keyframes opsPredFadeIn {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .ops-pred-marquee {
          display: inline-flex;
          align-items: center;
          animation: opsPredMarquee 30s linear infinite;
          will-change: transform;
        }
        .ops-pred-marquee:hover { animation-play-state: paused; }
        .ops-pred-fade-in { animation: opsPredFadeIn 0.4s ease-out; }
      `}</style>

      {/* Élément audio caché pour le ding */}
      <audio ref={audioRef} preload="auto" />

      {/* ============================================================
          V3 — PILE DES NOTIFICATIONS VISUELLES (haut-droite)
          Nouveau signalement / SOS / résolution / retard — visible même
          son coupé. aria-live pour les lecteurs d'écran.
          ============================================================ */}
      <div
        className="pointer-events-none fixed right-6 top-28 z-[70] flex w-[360px] max-w-[calc(100vw-60px)] flex-col gap-2.5"
        aria-live="polite"
      >
        {overlayNotifs.map((n) => (
          <OverlayNotifCard key={n.id} n={n} />
        ))}
      </div>

      {/* ============================================================
          1. HEADER — bandeau BLEU avec logo JAUNE + horloge JAUNE
          ============================================================ */}
      <header
        className="flex shrink-0 flex-wrap items-center justify-between gap-4 px-[30px] py-3 text-white"
        style={{
          backgroundColor: BLEU,
          borderRadius: '0 0 20px 20px',
          boxShadow: '0 4px 10px rgba(0,0,0,0.2)',
        }}
      >
        {/* LEFT — Logo box jaune avec icon blanc + titre */}
        <div
          className="flex items-center gap-3 rounded-[15px] px-4 py-2"
          style={{ backgroundColor: JAUNE }}
        >
          {/* White icon container 50×50 */}
          <span
            className="flex h-[50px] w-[50px] shrink-0 items-center justify-center rounded-[10px] bg-white"
            aria-hidden
          >
            <Plane className="size-7 text-[#000d10]" />
          </span>
          {/* Title + subtitle */}
          <div className="flex flex-col">
            <span
              className="font-black uppercase leading-none text-black"
              style={{ fontSize: 'clamp(18px, 2vw, 28px)', letterSpacing: '2px' }}
            >
              AÉROPORT OPS
            </span>
            <span
              className="mt-1 font-bold uppercase leading-none text-black"
              style={{ fontSize: '11px', letterSpacing: '2px', opacity: 0.75 }}
            >
              WALLBOARD · DIASS · DÉPARTS
            </span>
          </div>
        </div>

        {/* CENTER — Title + alerts count */}
        <div className="hidden flex-col items-center md:flex">
          <span
            className="font-black uppercase leading-none text-white"
            style={{ fontSize: '20px', letterSpacing: '4px' }}
          >
            WALLBOARD · DIASS
          </span>
          <span
            className="mt-1 font-bold uppercase"
            style={{ fontSize: '12px', letterSpacing: '2px', color: JAUNE }}
          >
            {alertsError ? 'ALERTES: ERREUR' : `${alerts.length} ALERTE(S)`}
          </span>
        </div>

        {/* RIGHT — Date + LIVE + Clock + MODE CRISE + Sound */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Date + alerts */}
          <div className="flex flex-col items-end">
            <span
              suppressHydrationWarning
              className="font-bold uppercase leading-none text-white"
              style={{ fontSize: '14px', letterSpacing: '2px' }}
            >
              {formatDateFR(now)}
            </span>
            <span
              className="mt-1 font-bold uppercase"
              style={{ fontSize: '11px', letterSpacing: '2px', color: JAUNE }}
            >
              {error ? 'ERREUR API' : 'SYSTÈME OK'}
            </span>
          </div>

          {/* LIVE badge */}
          <div
            className="ops-pulse flex items-center gap-1.5 rounded-[25px] px-3 py-1.5 text-white"
            style={{ backgroundColor: ROUGE }}
          >
            <span
              className="ops-live-pulse size-2 rounded-full bg-white"
              aria-hidden
            />
            <span className="font-black uppercase" style={{ fontSize: '11px', letterSpacing: '2px' }}>
              LIVE
            </span>
          </div>

          {/* Feature F2 — Badge AUTO-PILOT (actif tant que Nathalie a pris des décisions auto) */}
          {autopilotActive && (
            <div
              className="ops-pulse flex items-center gap-1.5 rounded-[25px] px-3 py-1.5 text-black"
              style={{ backgroundColor: JAUNE }}
              title={
                autopilotActions.length > 0
                  ? autopilotActions.map((a) => a.description).join('\n')
                  : 'Nathalie prend des décisions automatiques'
              }
            >
              <span className="font-black uppercase" style={{ fontSize: '11px', letterSpacing: '2px' }}>
                AUTO-PILOT
              </span>
            </div>
          )}

          {/* Clock — yellow bg, black text, 36px */}
          <span
            suppressHydrationWarning
            className="rounded-[15px] px-4 py-1.5 font-black tabular-nums text-black"
            style={{
              backgroundColor: JAUNE,
              fontSize: 'clamp(20px, 2.5vw, 36px)',
              letterSpacing: '1px',
              lineHeight: 1,
            }}
          >
            {formatClock(now)}
          </span>

          {/* MODE CRISE */}
          <CrisisButtonV2
            active={crisisMode}
            onStart={handleCrisisStart}
            onEnd={handleCrisisEnd}
            elapsedSec={crisisElapsedSec}
          />

          {/* Sound toggle */}
          <button
            type="button"
            onClick={toggleSound}
            aria-pressed={soundOn}
            aria-label={soundOn ? 'Couper le son' : 'Activer le son (ding + annonces vocales)'}
            title={soundOn ? 'Son activé — clic pour couper' : 'Son coupé — clic pour activer ding + annonces vocales'}
            className="flex items-center gap-1.5 rounded-[15px] px-3 py-2 font-black uppercase text-white transition-opacity hover:opacity-90"
            style={{
              backgroundColor: 'transparent',
              border: '3px solid #FFFFFF',
              fontSize: '11px',
              letterSpacing: '1px',
            }}
          >
            {soundOn ? (
              <>
                <Volume2 className="size-4" aria-hidden />
                <span>ON</span>
              </>
            ) : (
              <>
                <VolumeX className="size-4" aria-hidden />
                <span>OFF</span>
              </>
            )}
          </button>

          {/* Feature F1 — Micro Nathalie (SpeechRecognition) */}
          <button
            type="button"
            onClick={toggleListening}
            aria-pressed={listening}
            aria-label={
              listening ? 'Arrêter Nathalie' : 'Parler à Nathalie (commande vocale)'
            }
            title={
              listening
                ? 'Nathalie écoute — clic pour couper'
                : 'Parler à Nathalie (bilan, zone, assigne, alerte, calme, top performer, crise)'
            }
            className={`flex items-center gap-1.5 rounded-[15px] px-3 py-2 font-black uppercase text-white transition-opacity hover:opacity-90 ${listening ? 'ops-pulse' : ''}`}
            style={{
              backgroundColor: listening ? ROUGE : 'transparent',
              border: '3px solid #FFFFFF',
              fontSize: '11px',
              letterSpacing: '1px',
            }}
          >
            <Mic className="size-4" aria-hidden />
            <span>{listening ? 'NATHALIE' : 'MIC'}</span>
          </button>
        </div>
      </header>

      {/* ---------- Feature F1 — Indicateur "Nathalie écoute…" ---------- */}
      {listening && (
        <div
          role="status"
          className="mx-[30px] mt-4 flex shrink-0 flex-wrap items-center justify-center gap-3 rounded-[15px] px-5 py-2"
          style={{ backgroundColor: BLANC, boxShadow: '0 4px 10px rgba(0,0,0,0.1)' }}
        >
          <span
            className="ops-pulse size-2.5 rounded-full"
            style={{ backgroundColor: ROUGE }}
            aria-hidden
          />
          <span
            className="font-black uppercase text-black"
            style={{ fontSize: '12px', letterSpacing: '2px' }}
          >
            NATHALIE ÉCOUTE…
          </span>
          {deniseTranscript && (
            <span
              className="font-bold text-black"
              style={{ fontSize: '11px', letterSpacing: '1px', opacity: 0.7 }}
            >
              « {deniseTranscript} »
            </span>
          )}
        </div>
      )}

      {/* ---------- BANNIÈRE DE DÉVERROUILLAGE AUDIO (V3) ----------
          Le son est ON par défaut : cette bannière informe simplement que le
          navigateur exige UN clic pour autoriser l'audio. Elle disparaît au
          premier geste (listener global) ou via le bouton. */}
      {showSoundBanner && soundOn && (
        <div
          className="mx-[30px] mt-4 flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-[15px] px-5 py-3"
          style={{ backgroundColor: BLANC, boxShadow: '0 4px 10px rgba(0,0,0,0.1)' }}
        >
          <div className="flex items-center gap-3">
            <span
              className="ops-pulse size-2.5 rounded-full"
              style={{ backgroundColor: VERT }}
              aria-hidden
            />
            <div className="flex flex-col">
              <p
                className="font-black uppercase text-black"
                style={{ fontSize: '13px', letterSpacing: '1px' }}
              >
                SON ACTIVÉ — UN CLIC N'IMPORTE OÙ POUR DÉBLOQUER L'AUDIO
              </p>
              <p
                className="font-bold text-black"
                style={{ fontSize: '10px', letterSpacing: '1px', opacity: 0.6 }}
              >
                DING + ANNONCES VOCALES À CHAQUE NOUVEAU SIGNALEMENT, RÉSOLUTION ET RETARD
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleSound}
              className="flex items-center gap-1.5 rounded-[10px] bg-[#E30613] px-4 py-2 font-black uppercase text-white transition-opacity hover:opacity-90"
              style={{ fontSize: '11px', letterSpacing: '1px' }}
            >
              <VolumeX className="size-4" aria-hidden />
              COUPER LE SON
            </button>
            <button
              type="button"
              onClick={() => setShowSoundBanner(false)}
              aria-label="Fermer la bannière"
              className="flex items-center justify-center rounded-[10px] bg-[#000d10] px-3 py-2 font-black text-white transition-opacity hover:opacity-90"
            >
              <span style={{ fontSize: '16px', lineHeight: 1 }} aria-hidden>×</span>
            </button>
          </div>
        </div>
      )}

      {/* ---------- Résumé fin de crise ---------- */}
      {crisisSummary && !crisisMode && (
        <div
          role="status"
          className="mx-[30px] mt-4 flex shrink-0 items-center justify-center gap-3 rounded-[15px] px-5 py-2"
          style={{ backgroundColor: BLANC, boxShadow: '0 4px 10px rgba(0,0,0,0.1)' }}
        >
          <ShieldAlert className="size-4" style={{ color: VERT }} aria-hidden />
          <p
            className="font-black uppercase text-black"
            style={{ fontSize: '12px', letterSpacing: '2px' }}
          >
            {crisisSummary}
          </p>
        </div>
      )}

      {/* ---------- Bandeau crise active ---------- */}
      {crisisMode && (
        <div
          role="alert"
          className="mx-[30px] mt-4 flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-[15px] px-5 py-2"
          style={{ backgroundColor: 'rgba(227,6,19,0.15)', border: `2px solid ${ROUGE}` }}
        >
          <div className="flex items-center gap-2">
            <ShieldAlert className="ops-pulse size-4 text-[#E30613]" aria-hidden />
            <span
              className="font-black uppercase text-black"
              style={{ fontSize: '12px', letterSpacing: '2px' }}
            >
              MODE CRISE — BOARD FILTRÉ AUX INCIDENTS CRITIQUES UNIQUEMENT
            </span>
          </div>
          {activeFilterLabel && (
            <span
              className="font-black uppercase text-[#E30613]"
              style={{ fontSize: '11px', letterSpacing: '2px' }}
            >
              {activeFilterLabel}
            </span>
          )}
        </div>
      )}

      {/* ============================================================
          2. KPI ROW — 6 cartes colorées + Live Score (WAHOO-2)
          ============================================================ */}
      <section
        aria-label="KPI temps réel"
        className="grid shrink-0 gap-[15px] px-[30px] py-3"
        style={{ gridTemplateColumns: 'repeat(8, 1fr)' }}
      >
        {/* Live Score — hero temps réel, occupe 2 colonnes (prominent) */}
        <LiveScoreWidget
          compact
          className="col-span-2 min-h-[120px] flex flex-col justify-center"
        />
        {data ? (
          <>
            <KpiCard
              label="CRITIQUE"
              value={untreatedOver10Min}
              bgClass="bg-[#E30613]"
              textClass="text-white"
            />
            <KpiCard
              label="EN ATTENTE"
              value={data.stats.en_attente}
              bgClass="bg-[#C9A961]"
              textClass="text-black"
            />
            <KpiCard
              label="RÉSOLUS"
              value={data.stats.resolus_24h}
              bgClass="bg-[#C9A961]"
              textClass="text-white"
            />
            <KpiCard
              label="TEMPS MOY"
              value={formatDurationMin(data.stats.avg_resolution_minutes)}
              bgClass="bg-[#000d10]"
              textClass="text-white"
            />
            <KpiCard
              label="SLA"
              value={overallSlaPct}
              bgClass={slaCardCls.split(' ')[0]}
              textClass={slaCardCls.split(' ')[1] ?? 'text-black'}
            />
            <KpiCard
              label="STAFF"
              value={`${staffActive.count}/${staffActive.total}`}
              bgClass="bg-[#C9A961]"
              textClass="text-white"
            />
          </>
        ) : (
          Array.from({ length: 6 }).map((_, i) => <KpiSkeleton key={i} />)
        )}
      </section>

      {/* ============================================================
          Task WAHOO-4 — BANDEAU PRÉDICTION NATHALIE
          ------------------------------------------------------------
          Slim banner navy/gold affichant les prédictions HIGH/MEDIUM
          renvoyées par /api/airport/predictive-alert. Cycle de 8 s
          entre les prédictions si plusieurs sont actives. Le texte
          défile en marquee horizontal (CSS). Si aucune prédiction →
          bandeau invisible (ne prend pas de place).
          ============================================================ */}
      {predictiveAlerts.length > 0 && (
        <section
          aria-label="Prédictions Nathalie"
          aria-live="polite"
          className="mx-[30px] mb-1 shrink-0"
        >
          {(() => {
            const idx = predictiveTick % predictiveAlerts.length
            const pred = predictiveAlerts[idx]
            const isHigh = pred.priority === 'high'
            return (
              <div
                role="alert"
                className="flex items-stretch overflow-hidden rounded-[15px]"
                style={{
                  backgroundColor: BLEU,
                  borderLeft: `4px solid ${JAUNE}`,
                  boxShadow: '0 4px 10px rgba(0,0,0,0.15)',
                }}
              >
                {/* LEFT — label or + PRÉDICTION NATHALIE */}
                <div
                  className="flex shrink-0 items-center gap-2 px-4 py-2"
                  style={{ backgroundColor: BLEU }}
                >
                  <span
                    className="ops-pulse-soft"
                    style={{ fontSize: '16px', lineHeight: 1 }}
                    aria-hidden
                  >
                    🔮
                  </span>
                  <span
                    className="font-black uppercase"
                    style={{ fontSize: '11px', letterSpacing: '2px', color: JAUNE }}
                  >
                    PRÉDICTION NATHALIE
                  </span>
                </div>
                {/* RIGHT — priority badge + scrolling message + dots */}
                <div className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2">
                  {/* Priority badge (HIGH=red / MEDIUM=orange) */}
                  <span
                    className="shrink-0 rounded-[8px] px-2 py-0.5 font-black uppercase"
                    style={{
                      fontSize: '10px',
                      letterSpacing: '1px',
                      backgroundColor: isHigh ? ROUGE : ORANGE,
                      color: '#FFFFFF',
                    }}
                  >
                    {isHigh ? 'HIGH' : 'MEDIUM'}
                  </span>
                  {/* Marquee — duplicate text for seamless loop */}
                  <div
                    className="relative min-w-0 flex-1 overflow-hidden"
                    style={{ height: '18px' }}
                  >
                    <div
                      key={pred.id}
                      className="ops-pred-marquee ops-pred-fade-in whitespace-nowrap"
                      style={{
                        fontSize: '12px',
                        fontWeight: 700,
                        letterSpacing: '1px',
                        color: BLANC,
                        textTransform: 'uppercase',
                      }}
                    >
                      <span style={{ paddingRight: '60px' }} aria-label={pred.message}>
                        {pred.message}
                      </span>
                      <span style={{ paddingRight: '60px' }} aria-hidden>
                        {pred.message}
                      </span>
                    </div>
                  </div>
                  {/* Indicator dots if multiple predictions */}
                  {predictiveAlerts.length > 1 && (
                    <div className="flex shrink-0 items-center gap-1.5">
                      {predictiveAlerts.map((p, i) => (
                        <span
                          key={p.id}
                          className="rounded-full transition-all"
                          style={{
                            width: i === idx ? '10px' : '6px',
                            height: '6px',
                            backgroundColor:
                              i === idx ? JAUNE : 'rgba(255,255,255,0.35)',
                          }}
                          aria-hidden
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )
          })()}
        </section>
      )}

      {/* ============================================================
          Feature F3 — CLASSEMENT (V3 : bandeau compact sur UNE ligne)
          ============================================================ */}
      <section
        aria-label="Classement staff et achievements"
        className="shrink-0 px-[30px] pb-2"
      >
        <div
          className="flex flex-wrap items-center gap-x-6 gap-y-1.5 rounded-[16px] bg-white px-5 py-2.5"
          style={{ boxShadow: '0 4px 10px rgba(0,0,0,0.1)' }}
        >
          <h2
            className="shrink-0 font-black uppercase leading-none"
            style={{ fontSize: '13px', letterSpacing: '2px', color: BLEU }}
          >
            🏆 CLASSEMENT
          </h2>

          {/* --- Compétition d'équipes (24h) — inline --- */}
          <div className="flex items-center gap-2">
            <span
              className="font-black uppercase text-black"
              style={{ fontSize: '9.5px', letterSpacing: '1px', opacity: 0.55 }}
            >
              ÉQUIPES 24H
            </span>
            <span className="font-black tabular-nums text-[#000d10]" style={{ fontSize: '15px' }} suppressHydrationWarning>
              {competition?.morning ?? 0}
              <span className="ml-0.5 font-black uppercase text-black" style={{ fontSize: '9px', opacity: 0.6 }}>MAT</span>
            </span>
            <span className="font-black text-black" style={{ fontSize: '11px', opacity: 0.3 }} aria-hidden>|</span>
            <span className="font-black tabular-nums text-[#C9A961]" style={{ fontSize: '15px' }} suppressHydrationWarning>
              {competition?.evening ?? 0}
              <span className="ml-0.5 font-black uppercase text-black" style={{ fontSize: '9px', opacity: 0.6 }}>SOIR</span>
            </span>
            <span className="font-black text-black" style={{ fontSize: '11px', opacity: 0.3 }} aria-hidden>|</span>
            <span className="font-black tabular-nums text-[#000d10]" style={{ fontSize: '15px' }} suppressHydrationWarning>
              {competition?.night ?? 0}
              <span className="ml-0.5 font-black uppercase text-black" style={{ fontSize: '9px', opacity: 0.6 }}>NUIT</span>
            </span>
          </div>

          {/* --- Top performer — inline --- */}
          <div className="flex min-w-0 items-center gap-1.5">
            <span
              className="font-black uppercase text-black"
              style={{ fontSize: '9.5px', letterSpacing: '1px', opacity: 0.55 }}
            >
              TOP
            </span>
            {topPerformer ? (
              <span className="flex min-w-0 items-center gap-1.5">
                <span
                  className="truncate font-black uppercase text-black"
                  style={{ fontSize: '13px', letterSpacing: '1px' }}
                >
                  🥇 {truncateName(topPerformer.staffName, 16)}
                </span>
                <span className="shrink-0 font-black tabular-nums text-[#000d10]" style={{ fontSize: '13px' }}>
                  {topPerformer.points}pts
                </span>
                {topPerformer.achievements.slice(0, 2).map((a) => (
                  <span
                    key={a.id}
                    title={a.meta ? `${a.description} — ${a.meta}` : a.description}
                    className="inline-flex shrink-0 items-center gap-1 rounded-[8px] bg-[#C9A961] px-1.5 py-0.5 font-black uppercase text-black"
                    style={{ fontSize: '9px', letterSpacing: '1px' }}
                  >
                    {a.emoji} {a.label}
                  </span>
                ))}
              </span>
            ) : (
              <span
                className="font-bold uppercase text-black"
                style={{ fontSize: '10px', letterSpacing: '1px', opacity: 0.5 }}
              >
                AUCUN CLASSEMENT CE MOIS-CI
              </span>
            )}
          </div>

          {/* --- Série SLA — inline --- */}
          <div className="ml-auto flex items-center gap-1.5">
            <span style={{ fontSize: '16px', lineHeight: 1 }} aria-hidden>🔥</span>
            <span className="font-black tabular-nums leading-none text-[#E30613]" style={{ fontSize: '15px' }} suppressHydrationWarning>
              {streakDays}
            </span>
            <span
              className="font-black uppercase text-black"
              style={{ fontSize: '9.5px', letterSpacing: '1px', opacity: 0.7 }}
            >
              JOURS SLA {'>'} 90%
            </span>
            <span
              className="font-bold uppercase text-black"
              style={{ fontSize: '9.5px', letterSpacing: '1px', opacity: 0.45 }}
            >
              (GLOBAL {streakSlaPct}%)
            </span>
          </div>
        </div>
      </section>

      {/* ============================================================
          3. MAIN LAYOUT — 2 colonnes (2fr zones | 1fr alertes)
             V3 PLEIN ÉCRAN : la grille occupe tout l'espace restant
             (flex-1 min-h-0) et les DEUX panneaux scrollent en interne —
             plus aucun scroll de page.
          ============================================================ */}
      <div
        className={`grid min-h-0 flex-1 gap-4 px-[30px] pb-3 ${crisisMode ? 'ops-crisis-overlay' : ''}`}
        style={{ gridTemplateColumns: '2fr 1fr' }}
      >
        {/* ---------- LEFT : Zones section ---------- */}
        <section
          aria-label="Carte zones temps réel"
          className="flex min-h-0 flex-col overflow-hidden rounded-[20px] bg-white p-[20px]"
          style={{ boxShadow: '0 4px 10px rgba(0,0,0,0.1)' }}
        >
          {/* Section title */}
          <div className="mb-3 flex shrink-0 flex-wrap items-center justify-between gap-2">
            <h2
              className="font-black uppercase leading-none"
              style={{ fontSize: 'clamp(18px, 2vw, 24px)', letterSpacing: '3px', color: BLEU }}
            >
              🗺 CARTE THERMIQUE · TEMPS RÉEL
            </h2>
            {filterZone && (
              <button
                type="button"
                onClick={() => setFilterZone(null)}
                className="rounded-[10px] bg-[#E30613] px-3 py-1.5 font-black uppercase text-white transition-opacity hover:opacity-90"
                style={{ fontSize: '11px', letterSpacing: '1px' }}
              >
                ✕ FILTRE: {filterZone.toUpperCase()}
              </button>
            )}
          </div>

          {/* Familles de zones — panneaux colorés (design original restauré)
              V3 : scroll INTERNE stylé (ops-scroll) — le wallboard tient sur
              un seul écran sans jamais scroller la page. */}
          <div className="ops-scroll flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1">
            {families.map((fam) => {
              const famZones = zonesByFamily[fam] ?? []
              if (famZones.length === 0) return null
              return (
                <div key={fam} className="flex flex-col gap-2">
                  <h3
                    className="font-black uppercase text-black"
                    style={{
                      fontSize: '14px',
                      letterSpacing: '3px',
                      borderBottom: `3px solid ${JAUNE}`,
                      paddingBottom: '6px',
                    }}
                  >
                    {fam}
                  </h3>
                  <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                    {famZones.map((z) => (
                      <ZonePanel
                        key={z.code}
                        zone={z}
                        isActive={filterZone === z.code}
                        onClick={() => setFilterZone(filterZone === z.code ? null : z.code)}
                      />
                    ))}
                  </div>
                </div>
              )
            })}
            {data && data.zones.length === 0 && (
              <div
                className="rounded-[15px] bg-[#C9A961] px-5 py-6 text-center font-black uppercase text-black"
                style={{ fontSize: '14px', letterSpacing: '1px' }}
              >
                AUCUNE ZONE CONFIGURÉE
              </div>
            )}
            {!data && (
              <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div
                    key={i}
                    className="ops-pulse h-[75px] rounded-[15px]"
                    style={{ backgroundColor: '#E0E0E0' }}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Légende compteurs */}
          <div
            className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-[10px] px-4 py-2"
            style={{ background: '#F5F5F5' }}
          >
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-1.5">
                <span
                  className="inline-block rounded-[3px]"
                  style={{ width: '12px', height: '12px', background: '#000d10' }}
                  aria-hidden
                />
                <span className="font-black uppercase text-black" style={{ fontSize: '10px', letterSpacing: '1px' }}>
                  CALME
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span
                  className="inline-block rounded-[3px]"
                  style={{ width: '12px', height: '12px', background: '#C9A961' }}
                  aria-hidden
                />
                <span className="font-black uppercase text-black" style={{ fontSize: '10px', letterSpacing: '1px' }}>
                  ATTENTION
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span
                  className="inline-block rounded-[3px]"
                  style={{ width: '12px', height: '12px', background: '#E30613' }}
                  aria-hidden
                />
                <span className="font-black uppercase text-black" style={{ fontSize: '10px', letterSpacing: '1px' }}>
                  CRITIQUE
                </span>
              </div>
            </div>
            <div className="flex items-center gap-3" style={{ fontSize: '10px', fontWeight: 800, color: '#666' }}>
              <span className="flex items-center gap-1">
                <span
                  className="inline-block size-2 rounded-full"
                  style={{ background: '#000d10', animation: 'opsPulseDot 1.2s ease-in-out infinite' }}
                  aria-hidden
                />
                EN COURS
              </span>
              <span className="uppercase tracking-wide">Clic zone → filtrer</span>
            </div>
          </div>
        </section>

        {/* ---------- RIGHT : Alertes section ---------- */}
        <section
          aria-label="Alertes actives"
          className="flex min-h-0 flex-col rounded-[20px] bg-white p-[20px]"
          style={{ boxShadow: '0 4px 10px rgba(0,0,0,0.1)' }}
        >
          <h2
            className="mb-3 shrink-0 font-black uppercase leading-none"
            style={{ fontSize: 'clamp(16px, 1.8vw, 20px)', letterSpacing: '3px', color: BLEU }}
          >
            ⚠ ALERTES ACTIVES
          </h2>
          <div className="ops-scroll flex min-h-0 flex-1 flex-col overflow-y-auto pr-1">
            {topAlerts.map((a, idx) => (
              <AlertCard key={`alert-${a.thresholdId}-${a.zoneCode}-${idx}`} alert={a} />
            ))}
            {data?.help_requests?.slice(0, 3).map((h) => (
              <HelpRequestAlertCard key={`help-${h.id}`} h={h} />
            ))}
            {activeReportAlerts.map((r) => (
              <ReportAlertCard
                key={`report-alert-${r.id}`}
                r={r}
                onCall={handleReportCall}
                onEscalate={() => void handleReportEscalate(r)}
                onAssign={(teamKey) => void handleReportAssign(r, teamKey)}
                busy={false}
              />
            ))}
            {topAlerts.length === 0 &&
              activeReportAlerts.length === 0 &&
              (data?.help_requests?.length ?? 0) === 0 && (
                <div
                  className="flex items-center justify-center rounded-[15px] bg-[#C9A961] px-5 py-6 text-center font-black uppercase text-white"
                  style={{ fontSize: '13px', letterSpacing: '1px' }}
                >
                  AUCUNE ALERTE ACTIVE
                </div>
              )}
          </div>
        </section>
      </div>

      {/* ============================================================
          4-6. BLOC BAS V3 — INCIDENTS | RADAR + SLA/CHARGE sur UNE ligne
          Hauteur bornée (min(288px, 30vh)) : tout tient à l'écran,
          scroll interne uniquement — plus de scroll de page.
          ============================================================ */}
      <div
        className="grid h-[min(264px,28vh)] shrink-0 gap-4 px-[30px]"
        style={{ gridTemplateColumns: '3fr 2fr' }}
      >
        {/* ---------- INCIDENTS DU JOUR ---------- */}
        <section
          aria-label="Incidents du jour"
          className="flex min-h-0 flex-col rounded-[20px] bg-white p-[18px]"
          style={{ boxShadow: '0 4px 10px rgba(0,0,0,0.1)' }}
        >
          <h2
            className="mb-3 shrink-0 font-black uppercase leading-none"
            style={{ fontSize: 'clamp(16px, 1.6vw, 20px)', letterSpacing: '3px', color: BLEU }}
          >
            📋 INCIDENTS DU JOUR
          </h2>

          {/* En-tête table — bg bleu, coins arrondis haut */}
          <div
            role="row"
            className="mb-2 flex shrink-0 items-center gap-2 rounded-[10px_10px_0_0] px-4 py-2.5 text-white"
            style={{ backgroundColor: BLEU }}
          >
            <div
              className="shrink-0 font-black uppercase"
              style={{ fontSize: '11px', letterSpacing: '2px', width: '70px' }}
            >
              HEURE
            </div>
            <div
              className="min-w-0 flex-1 font-black uppercase"
              style={{ fontSize: '11px', letterSpacing: '2px' }}
            >
              ZONE
            </div>
            <div
              className="hidden min-w-0 flex-1 font-black uppercase sm:block"
              style={{ fontSize: '11px', letterSpacing: '2px' }}
            >
              PROBLÈME
            </div>
            <div
              className="hidden shrink-0 font-black uppercase md:block"
              style={{ fontSize: '11px', letterSpacing: '2px', width: '120px' }}
            >
              STATUT
            </div>
            <div
              className="hidden shrink-0 font-black uppercase lg:block"
              style={{ fontSize: '11px', letterSpacing: '2px', width: '90px' }}
            >
              ÉQUIPE
            </div>
            <div
              className="shrink-0 font-black uppercase"
              style={{ fontSize: '11px', letterSpacing: '2px', width: '60px' }}
            >
              ÉCOULÉ
            </div>
            <div
              className="hidden shrink-0 font-black uppercase xl:block"
              style={{ fontSize: '11px', letterSpacing: '2px', width: '120px' }}
            >
              ACTIONS
            </div>
          </div>

          {/* Lignes — séparées par gap ; scroll INTERNE (V3 plein écran) */}
          <div className="ops-scroll flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1">
            {data ? (
              filledRows.length > 0 ? (
                <>
                  {filledRows.map((r) => (
                    <IncidentRow
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
                <div
                  className="flex items-center justify-center rounded-[15px] bg-[#C9A961] px-6 py-8 text-center font-black uppercase text-black"
                  style={{ fontSize: '14px', letterSpacing: '1px' }}
                >
                  {crisisMode
                    ? 'AUCUN INCIDENT CRITIQUE — CRISE MAÎTRISÉE'
                    : filterZone
                      ? `AUCUN SIGNALEMENT (${filterZone.toUpperCase()})`
                      : 'AUCUN SIGNALEMENT 24H'}
                </div>
              )
            ) : (
              Array.from({ length: 8 }).map((_, i) => <RowSkeleton key={i} />)
            )}
          </div>

          {/* Toast feedback Actions rapides */}
          {actionToast && (
            <div
              role="status"
              className="pointer-events-none fixed left-1/2 top-24 z-30 -translate-x-1/2"
            >
              <div
                className={`rounded-[12px] px-5 py-2.5 font-black uppercase text-white ${actionToast.kind === 'ok' ? 'bg-[#C9A961]' : 'bg-[#E30613]'}`}
                style={{ fontSize: '12px', letterSpacing: '1px', boxShadow: '0 4px 10px rgba(0,0,0,0.2)' }}
              >
                {actionToast.msg}
              </div>
            </div>
          )}
        </section>

        {/* ---------- COLONNE DROITE : RADAR + SLA / CHARGE ---------- */}
        <div className="flex min-h-0 flex-col gap-3">
          {/* RADAR PRÉDICTION — compact */}
          <div
            className="flex shrink-0 flex-col rounded-[16px] bg-white px-4 py-2.5"
            style={{ boxShadow: '0 4px 10px rgba(0,0,0,0.1)' }}
          >
            <h2
              className="shrink-0 font-black uppercase leading-none"
              style={{ fontSize: '12px', letterSpacing: '2px', color: BLEU }}
            >
              🔮 RADAR PRÉDICTION · 20 MIN
            </h2>
            <div className="mt-1 min-h-0 overflow-hidden rounded-[10px] bg-[#F5F5F5] p-1">
              <AirportPredictionRadar className="h-[96px] w-full" />
            </div>
          </div>

          {/* SLA + CHARGE — 2 mini-colonnes, scroll interne */}
          <div className="grid min-h-0 flex-1 grid-cols-2 gap-3">
            <div
              className="flex min-h-0 flex-col rounded-[16px] bg-white p-[14px]"
              style={{ boxShadow: '0 4px 10px rgba(0,0,0,0.1)' }}
            >
              <h2
                className="mb-2 shrink-0 font-black uppercase leading-none"
                style={{ fontSize: '11px', letterSpacing: '2px', color: BLEU }}
              >
                📊 SLA PAR ZONE
              </h2>
              <div className="ops-scroll flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto pr-1">
                {data ? (
                  data.zones.slice(0, 6).map((z) => (
                    <SlaRow key={`sla-${z.code}`} zone={z} sla={data.sla?.[z.code]} />
                  ))
                ) : (
                  Array.from({ length: 4 }).map((_, i) => <MiniRowSkeleton key={i} />)
                )}
              </div>
            </div>

            <div
              className="flex min-h-0 flex-col rounded-[16px] bg-white p-[14px]"
              style={{ boxShadow: '0 4px 10px rgba(0,0,0,0.1)' }}
            >
              <h2
                className="mb-2 shrink-0 font-black uppercase leading-none"
                style={{ fontSize: '11px', letterSpacing: '2px', color: BLEU }}
              >
                ⚡ CHARGE PAR ZONE
              </h2>
              <div className="ops-scroll flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto pr-1">
                {data ? (
                  data.zones.slice(0, 6).map((z) => (
                    <ChargeRow key={`chg-${z.code}`} zone={z} max={maxEnAttente} />
                  ))
                ) : (
                  Array.from({ length: 4 }).map((_, i) => <MiniRowSkeleton key={i} />)
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ============================================================
          7. LEGEND BAR — compacte, collée en bas (V3 plein écran)
          ============================================================ */}
      <div
        className="mx-[30px] mb-3 flex shrink-0 flex-wrap items-center gap-6 rounded-[15px] px-[24px] py-3"
        style={{ backgroundColor: BLANC, boxShadow: '0 4px 10px rgba(0,0,0,0.1)' }}
      >
        <span className="flex items-center gap-2">
          <span
            className="size-5 rounded-[5px]"
            style={{ backgroundColor: ROUGE }}
            aria-hidden
          />
          <span className="font-black uppercase text-black" style={{ fontSize: '11px', letterSpacing: '2px' }}>
            CRITIQUE (3+)
          </span>
        </span>
        <span className="flex items-center gap-2">
          <span
            className="size-5 rounded-[5px]"
            style={{ backgroundColor: ORANGE }}
            aria-hidden
          />
          <span className="font-black uppercase text-black" style={{ fontSize: '11px', letterSpacing: '2px' }}>
            ATTENTION (1-2)
          </span>
        </span>
        <span className="flex items-center gap-2">
          <span
            className="size-5 rounded-[5px]"
            style={{ backgroundColor: JAUNE }}
            aria-hidden
          />
          <span className="font-black uppercase text-black" style={{ fontSize: '11px', letterSpacing: '2px' }}>
            SURVEILLANCE
          </span>
        </span>
        <span className="flex items-center gap-2">
          <span
            className="size-5 rounded-[5px]"
            style={{ backgroundColor: VERT }}
            aria-hidden
          />
          <span className="font-black uppercase text-black" style={{ fontSize: '11px', letterSpacing: '2px' }}>
            RÉSOLU / OK
          </span>
        </span>
        <span className="flex items-center gap-2">
          <span
            className="size-5 rounded-[5px]"
            style={{ backgroundColor: BLEU }}
            aria-hidden
          />
          <span className="font-black uppercase text-black" style={{ fontSize: '11px', letterSpacing: '2px' }}>
            CALME (0)
          </span>
        </span>
        <span
          className="ml-auto font-bold uppercase text-black"
          style={{ fontSize: '10px', letterSpacing: '2px', opacity: 0.6 }}
        >
          CLIC ZONE POUR FILTRER · {data?.stats.total_24h ?? 0} TOTAL 24H
        </span>
      </div>
    </div>
  )
}
