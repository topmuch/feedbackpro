// ============================================================
// Page /ops-wallboard — Wallboard Ops Room Aéroport
// ------------------------------------------------------------
// Style "Signalétique Aéroportuaire" — reproduction exacte des
// panneaux signalétiques IATA (istockphoto-1913318633) :
//   - fond NOIR PUR #000000 (pas #0A0A0A, pas slate)
//   - JAUNE IATA #F5C400 (pas #FCD116)
//   - texte JAUNE, MAJUSCULES, BOLD, sans-serif
//   - ZERO coins arrondis (rounded-none partout, sauf dots légende)
//   - PAS de glassmorphism, PAS de gradients, PAS de backdrop-blur
//   - layout en LIGNES HORIZONTALES (bandeaux rectangulaires)
//   - séparation par GAPS, pas par bordures fines
//   - carrés jaunes pleins avec picto noir pour les signalétiques
//   - flèche ▸ jaune devant chaque panneau
//   - bordure gauche 4px pour les bandeaux d'alerte
//
// Polling identique au précédent :
//   - /api/airport/wallboard toutes les 5s
//   - /api/airport/alerts/check toutes les 30s
//   - /api/airport/leaderboard toutes les 60s
//   - horloge 1s
//
// Fonctionnalités préservées :
//   - Sons (ding-dong, ding-critical, resolved, escalade 660/880/990Hz)
//   - TTS Denise (decideAndSpeakForWallboard + race-condition fix)
//   - Rappel 15 min (badge EN RETARD + escalade sonore 15/20/25/30)
//   - Toggle son (persisté localStorage)
//   - Mode crise (filtre incidents critiques + timer + overlay)
//   - Actions rapides (assign / call / escalate)
//   - Filtre zone (clic sur le panneau → filtre le tableau)
//   - Radar prédiction (wrapper noir/jaune)
//   - Bottom strip (SLA + charge par zone)
// ============================================================

'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Volume2,
  VolumeX,
  Phone,
  Megaphone,
  Wrench,
  ShieldAlert,
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
  isHelpRequest?: boolean
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
// Constantes signalétique — IATA #F5C400
// ---------------------------------------------------------------
const YELLOW = '#F5C400'
const BLACK = '#000000'
const RED = '#FF3B30'
const GREEN = '#34C759'
const AMBER = '#FF9500'
const WHITE = '#FFFFFF'

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

function relativeTimeSignaletique(iso: string | null): string {
  if (!iso) return '—'
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 0) return '0 MIN'
  const sec = Math.floor(diff / 1000)
  if (sec < 60) return '<1 MIN'
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min} MIN`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h} H`
  const j = Math.floor(h / 24)
  return `${j} J`
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

/** Statut meta — palette signalétique aéroport :
 *   EN_ATTENTE → AMBER #FF9500 (bg-amber-500, texte noir)
 *   EN_COURS   → RED #FF3B30 (bg-red-500, texte blanc)
 *   RESOLU     → YELLOW #F5C400 (bg-[#F5C400], texte noir) */
const STATUT_META: Record<Statut, { label: string; color: string; bg: string; text: string }> = {
  EN_ATTENTE: { label: 'EN ATTENTE', color: AMBER, bg: AMBER, text: BLACK },
  EN_COURS: { label: 'EN COURS', color: RED, bg: RED, text: WHITE },
  RESOLU: { label: 'RÉSOLU', color: YELLOW, bg: YELLOW, text: BLACK },
}

function statutMeta(s: string): { label: string; color: string; bg: string; text: string } {
  return (
    STATUT_META[s as Statut] ?? {
      label: s,
      color: '#999999',
      bg: '#999999',
      text: BLACK,
    }
  )
}

const TEAM_META: Record<TeamKey, { emoji: string; label: string }> = {
  nettoyage: { emoji: '🧹', label: 'NETTOYAGE' },
  maintenance: { emoji: '🔧', label: 'MAINTENANCE' },
  securite: { emoji: '🛡️', label: 'SÉCURITÉ' },
  accueil: { emoji: '👋', label: 'ACCUEIL' },
  logistique: { emoji: '🛃', label: 'LOGISTIQUE' },
  other: { emoji: '❓', label: 'AUTRE' },
}

function teamMeta(key: string | null): { emoji: string; label: string } | null {
  if (!key) return null
  return TEAM_META[key as TeamKey] ?? TEAM_META.other
}

function formatDurationMin(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return '—'
  const totalSec = Math.round(minutes * 60)
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}M ${String(s).padStart(2, '0')}S`
}

function formatDurationSec(totalSec: number): string {
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}MIN ${String(s).padStart(2, '0')}S`
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

function truncateName(name: string, max = 12): string {
  if (name.length <= max) return name
  return `${name.slice(0, max - 1)}…`
}

type ZoneStatus = 'calm' | 'attention' | 'critical' | 'none'

function zoneStatus(count: number | null | undefined): ZoneStatus {
  if (count === null || count === undefined) return 'none'
  if (count === 0) return 'calm'
  if (count <= 2) return 'attention'
  return 'critical'
}

const ZONE_STATUS_META: Record<ZoneStatus, { color: string; label: string }> = {
  calm: { color: GREEN, label: 'CALME' },
  attention: { color: YELLOW, label: 'ATTENTION' },
  critical: { color: RED, label: 'CRITIQUE' },
  none: { color: '#555555', label: 'N/A' },
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
// Voice Decision Engine — Denise
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

// ---------------------------------------------------------------
// Sous-composants — SIGNALÉTIQUE AÉROPORT EXACT
// ---------------------------------------------------------------

/**
 * Cellule KPI — bandeau horizontal plat dans une strip unique.
 * Séparation par ligne jaune fine (border-r #F5C400/30).
 * PAS de fond différent, PAS de bordure arrondie. */
function KpiCell({
  label,
  value,
  accent = 'yellow',
  isLast = false,
}: {
  label: string
  value: string | number
  accent?: 'yellow' | 'red' | 'green' | 'amber' | 'white'
  isLast?: boolean
}) {
  const colorMap = {
    yellow: YELLOW,
    red: RED,
    green: GREEN,
    amber: AMBER,
    white: WHITE,
  } as const
  const color = colorMap[accent]
  return (
    <div
      className="flex flex-1 flex-col items-center justify-center gap-1 px-3 py-3"
      style={{ borderRight: isLast ? 'none' : `1px solid ${YELLOW}4D` }}
    >
      <span
        className="font-bold tabular-nums leading-none uppercase"
        style={{ fontSize: 'clamp(28px, 4vw, 42px)', color, letterSpacing: '1px' }}
      >
        {value}
      </span>
      <span
        className="font-bold uppercase"
        style={{ fontSize: '11px', letterSpacing: '2px', color: `${YELLOW}99` }}
      >
        {label}
      </span>
    </div>
  )
}

/**
 * Mini-panneau signalétique de zone — bandeau horizontal plat :
 *   ▸ [CARRÉ JAUNE 32×32 avec picto] NOM  COUNT
 * - PAS de bordure sur les panneaux normaux
 * - Zone critique : fond rouge subtil + bordure gauche rouge 2px
 * - Clic → filtre le tableau */
function ZonePanel({
  zone,
  isActive,
  onClick,
}: {
  zone: ZoneAgg
  isActive: boolean
  onClick: () => void
}) {
  const st = zoneStatus(zone.count_en_attente)
  const isCritical = st === 'critical'
  const countColor = zone.count_en_attente > 0 ? RED : `${GREEN}80`
  const cls = [
    'flex items-center gap-1.5 px-2 py-1.5 transition-opacity hover:opacity-80',
    isCritical ? 'bg-red-500/10 border-l-2 border-red-500' : '',
    isActive ? `bg-[${YELLOW}]/15` : '',
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={isActive}
      title={`${zone.nom} — ${ZONE_STATUS_META[st].label} · ${zone.count_en_attente} en attente`}
      className={cls}
    >
      <span
        aria-hidden
        className="font-bold leading-none"
        style={{ fontSize: '15px', color: YELLOW }}
      >
        ▸
      </span>
      <span
        aria-hidden
        className="flex size-8 items-center justify-center bg-[#F5C400] text-black"
        style={{ fontSize: '16px', lineHeight: 1 }}
      >
        {zone.emoji}
      </span>
      <span
        className="truncate font-bold uppercase"
        style={{ fontSize: '11px', letterSpacing: '1px', color: YELLOW }}
      >
        {truncateName(zone.nom.toUpperCase(), 10)}
      </span>
      <span
        className="ml-auto font-bold tabular-nums leading-none"
        style={{ fontSize: '16px', color: countColor }}
      >
        {zone.count_en_attente}
      </span>
    </button>
  )
}

/**
 * Bouton d'action signalétique — carré jaune plein avec icône noire.
 * Coins droits, fond #F5C400, texte/icône noir. */
function ActionSquare({
  onClick,
  disabled,
  label,
  title,
  children,
  variant = 'yellow',
}: {
  onClick: () => void
  disabled?: boolean
  label: string
  title: string
  children: React.ReactNode
  variant?: 'yellow' | 'red'
}) {
  const bg = variant === 'red' ? RED : YELLOW
  const fg = variant === 'red' ? WHITE : BLACK
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={title}
      className="flex items-center justify-center gap-1 px-2 py-1 font-bold uppercase transition-opacity hover:opacity-80 disabled:opacity-50"
      style={{ backgroundColor: bg, color: fg, fontSize: '11px', letterSpacing: '1px' }}
    >
      {children}
      <span>{label}</span>
    </button>
  )
}

/**
 * Bandeau d'alerte seuil — bandeau horizontal plat :
 *   [bordure gauche 4px] ▸ [CARRÉ JAUNE ⚠] ZONE · MESSAGE · TEMPS  [APPELER] [ESCALADER]
 * PAS de coins arrondis, fond noir. */
function AlertBandeau({ alert }: { alert: TriggeredAlert }) {
  const isCritical = alert.severity === 'critical'
  const accent = isCritical ? RED : YELLOW
  return (
    <div
      role="alert"
      className={`flex items-center gap-2 bg-black px-3 py-2 ${isCritical ? 'ops-flash-red' : ''}`}
      style={{ borderLeft: `4px solid ${accent}` }}
    >
      <span aria-hidden className="font-bold leading-none" style={{ fontSize: '15px', color: YELLOW }}>
        ▸
      </span>
      <span
        aria-hidden
        className="flex size-8 shrink-0 items-center justify-center bg-[#F5C400] font-bold text-black"
        style={{ fontSize: '14px', lineHeight: 1 }}
      >
        {isCritical ? '⚠' : '!'}
      </span>
      <div className="flex min-w-0 flex-1 items-baseline gap-2">
        <span
          className="shrink-0 font-bold uppercase"
          style={{ fontSize: '12px', letterSpacing: '1px', color: YELLOW }}
        >
          {alert.zoneCode}
        </span>
        <span
          className="truncate font-bold uppercase"
          style={{ fontSize: '12px', letterSpacing: '0.5px', color: `${YELLOW}CC` }}
        >
          · {alert.message}
        </span>
      </div>
      <span
        className="shrink-0 font-bold tabular-nums uppercase"
        style={{ fontSize: '12px', color: RED }}
      >
        {relativeTimeSignaletique(alert.triggeredAt)}
      </span>
      <ActionSquare onClick={() => {}} label="APPELER" title="APPELER">
        <Phone className="size-3" aria-hidden />
      </ActionSquare>
      <ActionSquare onClick={() => {}} label="ESCALADER" title="ESCALADER">
        <Megaphone className="size-3" aria-hidden />
      </ActionSquare>
    </div>
  )
}

/**
 * Bandeau d'alerte basé sur un signalement récent — même format signalétique.
 * Boutons APPELER / ASSIGNER (menu) / ESCALADER. */
function ReportAlertBandeau({
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
  const s = statutMeta(r.statut)
  const elapsedMin = Math.floor((Date.now() - new Date(r.createdAt).getTime()) / 60000)
  const isLate = elapsedMin > 15 && r.statut !== 'RESOLU'
  const accent = isLate ? RED : s.color
  const [showAssignMenu, setShowAssignMenu] = useState(false)
  return (
    <div
      role="alert"
      className={`relative flex items-center gap-2 bg-black px-3 py-2 ${isLate ? 'ops-flash-red' : ''}`}
      style={{ borderLeft: `4px solid ${accent}` }}
    >
      <span aria-hidden className="font-bold leading-none" style={{ fontSize: '15px', color: YELLOW }}>
        ▸
      </span>
      <span
        aria-hidden
        className="flex size-8 shrink-0 items-center justify-center bg-[#F5C400] text-base text-black"
        style={{ lineHeight: 1 }}
      >
        {r.zone?.emoji ?? '📍'}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-baseline gap-2">
          <span
            className="shrink-0 font-bold uppercase"
            style={{ fontSize: '12px', letterSpacing: '1px', color: YELLOW }}
          >
            {(r.zone?.nom ?? 'ZONE').toUpperCase()}
          </span>
          <span
            className="truncate font-bold uppercase"
            style={{ fontSize: '12px', letterSpacing: '0.5px', color: `${YELLOW}CC` }}
          >
            · {r.problemType}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="font-bold uppercase"
            style={{
              fontSize: '10px',
              letterSpacing: '1px',
              color: s.text,
              backgroundColor: s.bg,
              padding: '1px 6px',
            }}
          >
            {s.label}
          </span>
          {isLate && (
            <span
              className="font-bold uppercase ops-pulse"
              style={{ fontSize: '10px', letterSpacing: '1px', color: RED }}
            >
              EN RETARD
            </span>
          )}
        </div>
      </div>
      <span
        className="shrink-0 font-bold tabular-nums uppercase"
        style={{ fontSize: '12px', color: RED }}
      >
        {relativeTimeSignaletique(r.createdAt)}
      </span>
      <ActionSquare onClick={onCall} label="APPELER" title="APPELER OPS">
        <Phone className="size-3" aria-hidden />
      </ActionSquare>
      <div className="relative">
        <ActionSquare
          onClick={() => setShowAssignMenu((v) => !v)}
          disabled={busy}
          label="ASSIGNER"
          title="ASSIGNER / REROUTER"
        >
          <Wrench className="size-3" aria-hidden />
        </ActionSquare>
        {showAssignMenu && (
          <div
            role="menu"
            className="absolute right-0 top-full z-30 mt-1 w-40 bg-black p-1"
            style={{ border: `1px solid ${YELLOW}` }}
          >
            <p
              className="px-2 py-1 font-bold uppercase"
              style={{ fontSize: '10px', letterSpacing: '1px', color: YELLOW }}
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
                  className="flex w-full items-center gap-2 px-2 py-1.5 text-left font-bold uppercase transition-colors hover:bg-[#F5C400]/10"
                  style={{ fontSize: '11px', color: WHITE, letterSpacing: '1px' }}
                >
                  <span aria-hidden>{TEAM_META[k].emoji}</span>
                  <span>{TEAM_META[k].label}</span>
                </button>
              ))}
          </div>
        )}
      </div>
      <ActionSquare onClick={onEscalate} disabled={busy} label="ESCALADER" title="ESCALADER" variant="red">
        <Megaphone className="size-3" aria-hidden />
      </ActionSquare>
    </div>
  )
}

/** Bandeau SOS — demande d'aide voyageur. */
function HelpRequestBandeau({ h }: { h: HelpRequestLite }) {
  const elapsedMin = Math.floor((Date.now() - new Date(h.createdAt).getTime()) / 60000)
  const isLate = elapsedMin > 15
  const accent = isLate ? RED : YELLOW
  return (
    <div
      role="alert"
      className={`flex items-center gap-2 bg-black px-3 py-2 ${isLate ? 'ops-flash-red' : ''}`}
      style={{ borderLeft: `4px solid ${accent}` }}
    >
      <span aria-hidden className="font-bold leading-none" style={{ fontSize: '15px', color: YELLOW }}>
        ▸
      </span>
      <span
        aria-hidden
        className="flex size-8 shrink-0 items-center justify-center bg-[#F5C400] text-base text-black"
        style={{ lineHeight: 1 }}
      >
        🆘
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span
          className="font-bold uppercase"
          style={{ fontSize: '12px', letterSpacing: '1px', color: accent }}
        >
          SOS {(h.zone?.nom ?? 'ZONE').toUpperCase()}
        </span>
        <span
          className="truncate font-bold uppercase"
          style={{ fontSize: '11px', letterSpacing: '0.5px', color: `${YELLOW}CC` }}
        >
          · {h.message ?? "Demande d'aide voyageur"}
        </span>
      </div>
      <span
        className="shrink-0 font-bold tabular-nums uppercase"
        style={{ fontSize: '12px', color: RED }}
      >
        {relativeTimeSignaletique(h.createdAt)}
      </span>
      {h.travelerPhone && (
        <a
          href={`tel:${h.travelerPhone}`}
          className="flex items-center gap-1 px-2 py-1 font-bold uppercase transition-opacity hover:opacity-80"
          style={{ backgroundColor: YELLOW, color: BLACK, fontSize: '11px', letterSpacing: '1px' }}
        >
          <Phone className="size-3" aria-hidden />
          APPELER VOYAGEUR
        </a>
      )}
    </div>
  )
}

/**
 * Ligne du tableau d'incidents — style signalétique.
 * En-tête jaune, lignes noires, séparateurs colonnes jaune fin.
 * Statut badge plein (jaune/rouge/amber). Actions = carrés jaunes. */
function IncidentRow({
  r,
  fresh,
  onActionFeedback,
  index,
}: {
  r: RecentReport
  fresh: boolean
  onActionFeedback?: (msg: string, kind?: 'ok' | 'err') => void
  index: number
}) {
  const s = statutMeta(r.statut)
  const team = teamMeta(r.routedTeam)
  const [showAssignMenu, setShowAssignMenu] = useState(false)
  const [busy, setBusy] = useState(false)
  const elapsedMin = Math.floor((Date.now() - new Date(r.createdAt).getTime()) / 60000)
  const isLate = elapsedMin > 15 && r.statut !== 'RESOLU'
  const rowBg = index % 2 === 0 ? BLACK : '#0A0A0A'

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
        onActionFeedback?.(`ESCALADE DENISE → ${(r.zone?.nom ?? 'ZONE').toUpperCase()}`, 'ok')
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
      className={`grid shrink-0 grid-cols-[1fr_1.4fr_0.8fr_1fr_0.6fr] ${fresh ? 'ops-fade-in' : ''}`}
      style={{
        backgroundColor: isLate ? 'rgba(255,59,48,0.08)' : rowBg,
        borderTop: `1px solid ${YELLOW}33`,
      }}
    >
      {/* ZONE */}
      <div role="cell" className="flex min-w-0 items-center gap-2 px-3 py-2">
        <span aria-hidden className="font-bold leading-none" style={{ fontSize: '14px', color: YELLOW }}>
          ▸
        </span>
        <span aria-hidden style={{ fontSize: '16px', lineHeight: 1 }}>
          {r.zone?.emoji ?? '📍'}
        </span>
        <span
          className="truncate font-bold uppercase"
          style={{ fontSize: '13px', color: YELLOW, letterSpacing: '1px' }}
        >
          {(r.zone?.nom ?? 'ZONE INCONNUE').toUpperCase()}
        </span>
      </div>

      {/* PROBLÈME */}
      <div
        role="cell"
        className="flex min-w-0 items-center gap-2 px-3 py-2"
        style={{ borderLeft: `1px solid ${YELLOW}1A` }}
      >
        {r.isHelpRequest && (
          <span
            className="shrink-0 font-bold uppercase"
            style={{
              fontSize: '10px',
              letterSpacing: '1px',
              color: BLACK,
              backgroundColor: YELLOW,
              padding: '2px 6px',
            }}
          >
            SOS
          </span>
        )}
        <span
          className="truncate font-bold uppercase"
          style={{ fontSize: '13px', color: WHITE, letterSpacing: '0.5px' }}
          title={r.problemType}
        >
          {r.problemType}
        </span>
      </div>

      {/* STATUT */}
      <div
        role="cell"
        className="hidden items-center gap-1 px-3 py-2 sm:flex"
        style={{ borderLeft: `1px solid ${YELLOW}1A` }}
      >
        <span
          className="font-bold uppercase"
          style={{
            fontSize: '11px',
            color: s.text,
            backgroundColor: s.bg,
            padding: '2px 8px',
            letterSpacing: '1px',
          }}
        >
          {s.label}
        </span>
        {isLate && (
          <span
            className="font-bold uppercase ops-pulse"
            style={{ fontSize: '10px', letterSpacing: '1px', color: RED }}
          >
            EN RETARD
          </span>
        )}
      </div>

      {/* ÉQUIPE + ACTIONS */}
      <div
        role="cell"
        className="hidden items-center gap-2 px-3 py-2 sm:flex"
        style={{ borderLeft: `1px solid ${YELLOW}1A` }}
      >
        {team ? (
          <span
            className="truncate font-bold uppercase"
            style={{ fontSize: '12px', color: YELLOW, letterSpacing: '1px' }}
          >
            {team.emoji} {team.label}
          </span>
        ) : (
          <span className="font-bold uppercase" style={{ fontSize: '12px', color: '#555555' }}>
            —
          </span>
        )}
        <div className="ml-auto flex items-center gap-1">
          {!r.isHelpRequest && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowAssignMenu((v) => !v)}
                disabled={busy}
                aria-label="Assigner ou rerouter le signalement"
                title="ASSIGNER / REROUTER"
                className="flex size-7 items-center justify-center bg-[#F5C400] text-black transition-opacity hover:opacity-80 disabled:opacity-50"
              >
                <Wrench className="size-3.5" aria-hidden />
              </button>
              {showAssignMenu && (
                <div
                  role="menu"
                  className="absolute right-0 top-full z-20 mt-1 w-40 bg-black p-1"
                  style={{ border: `1px solid ${YELLOW}` }}
                >
                  <p
                    className="px-2 py-1 font-bold uppercase"
                    style={{ fontSize: '10px', letterSpacing: '1px', color: YELLOW }}
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
                        className="flex w-full items-center gap-2 px-2 py-1.5 text-left font-bold uppercase transition-colors hover:bg-[#F5C400]/10"
                        style={{ fontSize: '11px', color: WHITE, letterSpacing: '1px' }}
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
            className="flex size-7 items-center justify-center bg-[#F5C400] text-black transition-opacity hover:opacity-80"
          >
            <Phone className="size-3.5" aria-hidden />
          </button>
          {!r.isHelpRequest && (
            <button
              type="button"
              onClick={handleEscalate}
              disabled={busy}
              aria-label="Escalader auprès de Denise"
              title="ESCALADER (DENISE TAKE_CHARGE)"
              className="flex size-7 items-center justify-center bg-red-500 text-white transition-opacity hover:opacity-80 disabled:opacity-50"
            >
              <Megaphone className="size-3.5" aria-hidden />
            </button>
          )}
        </div>
      </div>

      {/* IL Y A */}
      <div
        role="cell"
        className="flex items-center justify-end px-3 py-2"
        style={{ borderLeft: `1px solid ${YELLOW}1A` }}
      >
        <span
          className={`font-bold tabular-nums uppercase ${isLate ? 'ops-pulse' : ''}`}
          style={{ fontSize: '13px', color: isLate ? RED : WHITE, letterSpacing: '1px' }}
        >
          {relativeTimeSignaletique(r.createdAt)}
        </span>
      </div>
    </div>
  )
}

function PlaceholderRow({ index }: { index: number }) {
  const rowBg = index % 2 === 0 ? BLACK : '#0A0A0A'
  return (
    <div
      role="row"
      aria-hidden
      className="grid shrink-0 grid-cols-[1fr_1.4fr_0.8fr_1fr_0.6fr]"
      style={{ backgroundColor: rowBg, borderTop: `1px solid ${YELLOW}33` }}
    >
      <div className="px-3 py-2 font-bold uppercase" style={{ fontSize: '13px', color: '#333333' }}>
        · · · · ·
      </div>
      <div className="px-3 py-2 font-bold uppercase" style={{ fontSize: '13px', color: '#333333' }}>
        · · · · · · · ·
      </div>
      <div className="hidden px-3 py-2 sm:block" style={{ color: '#333333' }}>· · ·</div>
      <div className="hidden px-3 py-2 sm:block" style={{ color: '#333333' }}>· · · ·</div>
      <div className="px-3 py-2 text-right" style={{ color: '#333333' }}>· · ·</div>
    </div>
  )
}

/** Ligne SLA par zone — bandeau plat signalétique. */
function SlaRow({ zone, sla }: { zone: ZoneAgg; sla?: SlaStats }) {
  if (!sla || sla.targetMinutes === null) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 bg-black">
        <span aria-hidden style={{ fontSize: '14px' }}>{zone.emoji}</span>
        <span
          className="min-w-0 flex-1 truncate font-bold uppercase"
          style={{ fontSize: '11px', color: YELLOW, letterSpacing: '1px' }}
        >
          {zone.nom.toUpperCase()}
        </span>
        <span className="font-bold uppercase" style={{ fontSize: '11px', color: '#555555', letterSpacing: '1px' }}>
          N/A
        </span>
      </div>
    )
  }
  const pct = sla.slaCompliancePercent
  const hasResolutions = sla.resolvedCount > 0
  const pctColor = !hasResolutions ? '#555555' : pct >= 80 ? GREEN : pct >= 60 ? YELLOW : RED
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-black">
      <span aria-hidden style={{ fontSize: '14px' }}>{zone.emoji}</span>
      <span
        className="min-w-0 flex-1 truncate font-bold uppercase"
        style={{ fontSize: '11px', color: YELLOW, letterSpacing: '1px' }}
        title={zone.nom}
      >
        {zone.nom.toUpperCase()}
      </span>
      <span className="font-bold tabular-nums" style={{ fontSize: '11px', color: YELLOW }}>
        ≤{sla.targetMinutes}M
      </span>
      {hasResolutions && pct >= 80 ? (
        <span className="font-bold" style={{ fontSize: '11px', color: GREEN }} aria-hidden>
          ✓
        </span>
      ) : null}
      <span
        className="w-12 text-right font-bold tabular-nums"
        style={{ fontSize: '12px', color: pctColor }}
        title={`MOY: ${sla.avgResolutionMinutes ?? '—'} MIN · RETARDS: ${sla.pendingBreaches}`}
      >
        {hasResolutions ? `${pct}%` : '—'}
      </span>
    </div>
  )
}

/** Ligne charge par zone — barre jaune + count. */
function ChargeRow({ zone, max }: { zone: ZoneAgg; max: number }) {
  const pct = max > 0 ? Math.max(2, Math.round((zone.count_en_attente / max) * 100)) : 0
  const barColor = zone.count_en_attente > 5 ? RED : zone.count_en_attente > 0 ? YELLOW : '#333333'
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-black">
      <span aria-hidden style={{ fontSize: '14px' }}>{zone.emoji}</span>
      <span
        className="min-w-0 flex-1 truncate font-bold uppercase"
        style={{ fontSize: '11px', color: YELLOW, letterSpacing: '1px' }}
        title={zone.nom}
      >
        {zone.nom.toUpperCase()}
      </span>
      <div className="overflow-hidden" style={{ width: '96px', height: '8px', backgroundColor: BLACK }}>
        <div
          className="h-full transition-all duration-700"
          style={{
            width: `${zone.count_en_attente === 0 ? 0 : pct}%`,
            backgroundColor: barColor,
          }}
        />
      </div>
      <span className="w-8 text-right font-bold tabular-nums" style={{ fontSize: '12px', color: WHITE }}>
        {zone.count_en_attente}
      </span>
    </div>
  )
}

// --- Squelettes de chargement ---
function KpiSkeleton({ isLast = false }: { isLast?: boolean }) {
  return (
    <div
      className="flex flex-1 flex-col items-center justify-center gap-1 px-2 py-3"
      style={{ borderRight: isLast ? 'none' : `1px solid ${YELLOW}4D` }}
    >
      <div className="ops-pulse" style={{ width: '60%', height: '36px', backgroundColor: '#222222' }} />
      <div className="ops-pulse" style={{ width: '40%', height: '12px', backgroundColor: '#222222' }} />
    </div>
  )
}

function RowSkeleton() {
  return (
    <div
      className="grid shrink-0 grid-cols-[1fr_1.4fr_0.8fr_1fr_0.6fr]"
      style={{ backgroundColor: BLACK, borderTop: `1px solid ${YELLOW}33` }}
    >
      <div className="ops-pulse px-3 py-2" style={{ height: '42px' }} />
      <div className="ops-pulse px-3 py-2" style={{ height: '42px' }} />
      <div className="hidden ops-pulse px-3 py-2 sm:block" style={{ height: '42px' }} />
      <div className="hidden ops-pulse px-3 py-2 sm:block" style={{ height: '42px' }} />
      <div className="ops-pulse px-3 py-2" style={{ height: '42px' }} />
    </div>
  )
}

function MiniRowSkeleton() {
  return <div className="ops-pulse" style={{ height: '32px', backgroundColor: '#222222' }} />
}

/**
 * Mode Crise : bouton bordure rouge (fond transparent) + timer quand actif. */
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
          <span
            className="font-bold uppercase ops-pulse"
            style={{ fontSize: '10px', letterSpacing: '2px', color: RED }}
          >
            CRISE ACTIVE
          </span>
          <span
            suppressHydrationWarning
            className="font-bold tabular-nums"
            style={{ fontSize: '12px', color: WHITE, letterSpacing: '1px' }}
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
          className="flex items-center gap-1.5 px-3 py-1.5 font-bold uppercase transition-opacity hover:opacity-80"
          style={{
            backgroundColor: GREEN,
            color: BLACK,
            fontSize: '12px',
            letterSpacing: '1px',
          }}
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
      className="flex items-center gap-1.5 px-3 py-1.5 font-bold uppercase transition-opacity hover:opacity-80"
      style={{
        backgroundColor: 'transparent',
        color: RED,
        fontSize: '12px',
        letterSpacing: '1px',
        border: '2px solid #FF3B30',
      }}
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

  const [soundOn, setSoundOn] = useState<boolean>(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const announcedAlertsRef = useRef<Set<string>>(new Set())
  const [showSoundBanner, setShowSoundBanner] = useState<boolean>(false)

  const [alerts, setAlerts] = useState<TriggeredAlert[]>([])
  const [alertsError, setAlertsError] = useState<string | null>(null)

  const [filterZone, setFilterZone] = useState<string | null>(null)
  const [crisisMode, setCrisisMode] = useState<boolean>(false)
  const [crisisStart, setCrisisStart] = useState<Date | null>(null)
  const [crisisSummary, setCrisisSummary] = useState<string | null>(null)
  const [leaderboard, setLeaderboard] = useState<LeaderboardData | null>(null)
  const [actionToast, setActionToast] = useState<{ msg: string; kind: 'ok' | 'err' } | null>(null)

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
          if (soundOn && newReports.length > 0) {
            const latest = newReports[0]
            playSound(SOUND_NORMAL, audioRef)
            const zoneNom = latest.zone?.nom ?? latest.tagScanne
            const elapsedMs = Date.now() - new Date(latest.createdAt).getTime()
            const tempsMin = Math.max(1, Math.floor(elapsedMs / 60000))
            const team = latest.routedTeam
            const equipeLabel = team ? ` Équipe ${team}.` : ''
            const annonce = latest.isHelpRequest
              ? `Demande d'aide SOS voyageur. ${zoneNom}. ${latest.problemType}. En attente depuis ${tempsMin} minute${tempsMin > 1 ? 's' : ''}.`
              : `Nouvel incident signalé. ${zoneNom}. Type: ${latest.problemType}.${equipeLabel} En attente depuis ${tempsMin} minute${tempsMin > 1 ? 's' : ''}.`
            setTimeout(() => speak(annonce, soundOn), 300)
          }
        }
      }

      if (soundOn && d.recently_resolved && d.recently_resolved.length > 0) {
        for (const r of d.recently_resolved) {
          if (!announcedResolvedRef.current.has(r.id)) {
            announcedResolvedRef.current.add(r.id)
            playSound(SOUND_RESOLVED, audioRef)
            const zoneNom = r.zone?.nom ?? r.tagScanne
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
  }, [soundOn])

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
      if (soundOn) {
        for (const alert of a) {
          const alertKey = `${alert.thresholdId}-${alert.type}`
          if (!announcedAlertsRef.current.has(alertKey) && alert.severity === 'critical') {
            announcedAlertsRef.current.add(alertKey)
            playSound(SOUND_CRITICAL, audioRef)
            setTimeout(() => speak(`Alerte critique. ${alert.message}`, soundOn), 500)
            break
          }
        }
        const activeKeys = new Set(a.map((al) => `${al.thresholdId}-${al.type}`))
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
  }, [now, data, soundOn])

  // --- Horloge 1s ---
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  // --- Chargement de la préférence son (localStorage) ---
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
        setShowSoundBanner(true)
        const dismiss = setTimeout(() => setShowSoundBanner(false), 10000)
        return () => clearTimeout(dismiss)
      }
    }, 0)
    return () => clearTimeout(t)
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
          handleActionFeedback(`ESCALADE DENISE → ${(r.zone?.nom ?? 'ZONE').toUpperCase()}`, 'ok')
        } else {
          handleActionFeedback(json?.error ?? 'ÉCHEC ESCALADE', 'err')
        }
      } catch {
        handleActionFeedback('ERREUR RÉSEAU ESCALADE', 'err')
      }
    },
    [handleActionFeedback],
  )

  const slaAccent: 'white' | 'green' | 'amber' | 'red' =
    overallSlaPctNum === null
      ? 'white'
      : overallSlaPctNum >= 80
        ? 'green'
        : overallSlaPctNum < 60
          ? 'red'
          : 'amber'

  const enAttenteAccent: 'white' | 'yellow' | 'red' =
    data && data.stats.en_attente > 5 ? 'red' : data && data.stats.en_attente > 0 ? 'yellow' : 'white'

  const untreatedAccent: 'white' | 'red' | 'green' = untreatedOver10Min > 0 ? 'red' : 'green'

  const staffAccent: 'white' | 'green' | 'yellow' = staffActive.count > 0 ? 'green' : 'yellow'

  // KPI definitions for the flat strip
  const kpis: { label: string; value: string | number; accent: 'yellow' | 'red' | 'green' | 'amber' | 'white' }[] = data
    ? [
        { label: 'CRITIQUE', value: untreatedOver10Min, accent: untreatedAccent },
        { label: 'ATTENTE', value: data.stats.en_attente, accent: enAttenteAccent },
        { label: 'RÉSOLUS', value: data.stats.resolus_24h, accent: 'green' },
        { label: 'TEMPS', value: formatDurationMin(data.stats.avg_resolution_minutes), accent: 'yellow' },
        { label: 'SLA', value: overallSlaPct, accent: slaAccent },
        { label: 'STAFF', value: `${staffActive.count}/${staffActive.total}`, accent: staffAccent },
      ]
    : []

  return (
    <div
      className={`flex min-h-screen flex-col overflow-x-hidden bg-black font-sans text-white ${
        crisisMode ? 'ops-crisis-overlay' : ''
      }`}
    >
      {/* Keyframes globales — signalétique animations */}
      <style>{`
        @keyframes opsPulse { 0%,100%{opacity:1} 50%{opacity:.55} }
        @keyframes opsFlashRed {
          0%,100% { background-color: rgba(255,59,48,0.08); }
          50% { background-color: rgba(255,59,48,0.22); }
        }
        @keyframes opsFadeIn {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes opsLiveBlink {
          0%,100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        .ops-pulse { animation: opsPulse 1.4s ease-in-out infinite; }
        .ops-flash-red { animation: opsFlashRed 1.2s ease-in-out infinite; }
        .ops-fade-in { animation: opsFadeIn 0.5s ease-out; }
        .ops-crisis-overlay { background-color: rgba(255,59,48,0.05); }
        .ops-live-blink { animation: opsLiveBlink 1.4s ease-in-out infinite; }
      `}</style>

      {/* Élément audio caché pour le ding */}
      <audio ref={audioRef} preload="auto" />

      <div className="mx-auto flex w-full max-w-[1920px] flex-1 flex-col overflow-hidden">
        {/* ============================================================
            1. HEADER — bandeau NOIR avec texte JAUNE
            ============================================================ */}
        <header
          className="flex h-16 shrink-0 flex-wrap items-center justify-between gap-3 bg-black px-4 sm:px-6"
          style={{ borderBottom: `1px solid ${YELLOW}4D` }}
        >
          {/* LEFT — ▸ FBK logo square + title */}
          <div className="flex items-center gap-3">
            <span aria-hidden className="font-bold leading-none" style={{ fontSize: '18px', color: YELLOW }}>
              ▸
            </span>
            <div
              className="bg-[#F5C400] px-3 py-1 font-bold text-black"
              style={{ fontSize: '18px', letterSpacing: '2px' }}
            >
              FBK
            </div>
            <h1
              className="font-bold uppercase"
              style={{ fontSize: 'clamp(16px, 2.5vw, 22px)', letterSpacing: '2px', color: YELLOW }}
            >
              AÉROPORT OPS · WALLBOARD · DIASS
            </h1>
          </div>

          {/* CENTER — Date + alert count */}
          <div className="hidden flex-col items-center md:flex">
            <span
              className="font-bold uppercase"
              style={{ fontSize: '12px', letterSpacing: '3px', color: `${YELLOW}CC` }}
            >
              {formatDateFR(now)}
            </span>
            <span
              className="font-bold uppercase"
              style={{ fontSize: '11px', letterSpacing: '2px', color: `${YELLOW}99` }}
            >
              {alertsError ? 'ALERTES: ERREUR' : `${alerts.length} ALERTE(S)`}
            </span>
          </div>

          {/* RIGHT — LIVE + Clock + MODE CRISE + Sound */}
          <div className="flex items-center gap-3">
            {/* LIVE indicator — red dot + white text */}
            <div className="flex items-center gap-1.5">
              {error ? (
                <>
                  <span
                    className="ops-live-blink size-2 rounded-full bg-red-500"
                    aria-hidden
                  />
                  <span
                    className="ops-live-blink font-bold uppercase"
                    style={{ fontSize: '11px', letterSpacing: '2px', color: RED }}
                  >
                    ERREUR
                  </span>
                </>
              ) : (
                <>
                  <span className="size-2 rounded-full bg-red-500" aria-hidden />
                  <span
                    className="font-bold uppercase text-white"
                    style={{ fontSize: '11px', letterSpacing: '2px' }}
                  >
                    LIVE
                  </span>
                </>
              )}
            </div>

            {/* Clock */}
            <span
              suppressHydrationWarning
              className="font-bold tabular-nums text-[#F5C400]"
              style={{ fontSize: 'clamp(18px, 3vw, 24px)', letterSpacing: '1px' }}
            >
              {formatClock(now)}
            </span>

            {/* MODE CRISE */}
            <CrisisButton
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
              className="flex items-center gap-1.5 px-3 py-1.5 font-bold uppercase transition-opacity hover:opacity-80"
              style={{
                backgroundColor: 'transparent',
                color: YELLOW,
                fontSize: '11px',
                letterSpacing: '2px',
                border: 'none',
              }}
            >
              {soundOn ? (
                <>
                  <Volume2 className="size-5" aria-hidden />
                  <span>ON</span>
                </>
              ) : (
                <>
                  <VolumeX className="size-5" aria-hidden />
                  <span>OFF</span>
                </>
              )}
            </button>
          </div>
        </header>

        {/* ---------- BANNIÈRE D'ACTIVATION DU SON ---------- */}
        {showSoundBanner && !soundOn && (
          <div
            className="flex shrink-0 items-center justify-between gap-4 bg-black px-4 py-3 sm:px-6"
            style={{ borderBottom: `1px solid ${YELLOW}33` }}
          >
            <div className="flex items-center gap-3">
              <span className="ops-pulse size-3 rounded-full bg-red-500" aria-hidden />
              <div className="flex flex-col">
                <p
                  className="font-bold uppercase"
                  style={{ fontSize: '13px', letterSpacing: '1px', color: YELLOW }}
                >
                  ACTIVEZ LE SON POUR LES ALERTES VOCALES
                </p>
                <p className="font-bold" style={{ fontSize: '11px', color: `${YELLOW}99` }}>
                  DING + ANNONCES VOCALES À CHAQUE NOUVEAU SIGNALEMENT
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={toggleSound}
                className="flex items-center gap-1.5 px-4 py-2 font-bold uppercase transition-opacity hover:opacity-80"
                style={{ backgroundColor: YELLOW, color: BLACK, fontSize: '12px', letterSpacing: '2px' }}
              >
                <Volume2 className="size-4" aria-hidden />
                ACTIVER LE SON
              </button>
              <button
                type="button"
                onClick={() => setShowSoundBanner(false)}
                aria-label="Fermer la bannière"
                className="flex items-center justify-center px-2.5 py-2 font-bold"
                style={{ border: `1px solid ${YELLOW}`, color: YELLOW }}
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
            className="flex shrink-0 items-center justify-center gap-3 px-4 py-2 sm:px-6"
            style={{ backgroundColor: GREEN, borderBottom: `1px solid ${BLACK}` }}
          >
            <ShieldAlert className="size-4" style={{ color: BLACK }} aria-hidden />
            <p className="font-bold uppercase" style={{ fontSize: '13px', letterSpacing: '2px', color: BLACK }}>
              {crisisSummary}
            </p>
          </div>
        )}

        {/* ---------- Bandeau crise active ---------- */}
        {crisisMode && (
          <div
            role="alert"
            className="flex shrink-0 items-center justify-between gap-3 px-4 py-2 sm:px-6"
            style={{ backgroundColor: RED, borderBottom: `1px solid ${BLACK}` }}
          >
            <div className="flex items-center gap-2">
              <ShieldAlert className="ops-pulse size-4 text-white" aria-hidden />
              <span className="font-bold uppercase text-white" style={{ fontSize: '12px', letterSpacing: '2px' }}>
                MODE CRISE — BOARD FILTRÉ AUX INCIDENTS CRITIQUES UNIQUEMENT
              </span>
            </div>
            {activeFilterLabel && (
              <span className="font-bold uppercase text-white" style={{ fontSize: '11px', letterSpacing: '2px' }}>
                {activeFilterLabel}
              </span>
            )}
          </div>
        )}

        {/* ============================================================
            2. KPI ROW — bandeau horizontal plat, séparateurs jaunes
            ============================================================ */}
        <section
          aria-label="KPI temps réel"
          className="flex shrink-0 bg-black"
          style={{ borderBottom: `1px solid ${YELLOW}4D` }}
        >
          {data ? (
            kpis.map((kpi, i) => (
              <KpiCell
                key={kpi.label}
                label={kpi.label}
                value={kpi.value}
                accent={kpi.accent}
                isLast={i === kpis.length - 1}
              />
            ))
          ) : (
            Array.from({ length: 6 }).map((_, i) => <KpiSkeleton key={i} isLast={i === 5} />)
          )}
        </section>

        {/* ============================================================
            3. ZONE MAP — panneaux signalétiques horizontaux
            ============================================================ */}
        <section aria-label="Carte zones" className="shrink-0 bg-black px-4 py-4 sm:px-6">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2
              className="font-bold uppercase"
              style={{ fontSize: '13px', letterSpacing: '3px', color: YELLOW }}
            >
              CARTE TEMPS RÉEL · {data?.zones.length ?? 0} ZONES
            </h2>
            {filterZone && (
              <button
                type="button"
                onClick={() => setFilterZone(null)}
                className="font-bold uppercase transition-opacity hover:opacity-80"
                style={{
                  fontSize: '11px',
                  letterSpacing: '2px',
                  color: BLACK,
                  backgroundColor: YELLOW,
                  padding: '4px 8px',
                }}
              >
                ✕ FILTRE: {filterZone.toUpperCase()}
              </button>
            )}
          </div>

          {/* Familles de zones — panneaux signalétiques */}
          <div className="flex flex-col gap-4">
            {families.map((fam) => {
              const famZones = zonesByFamily[fam] ?? []
              if (famZones.length === 0) return null
              return (
                <div key={fam} className="flex flex-col gap-2">
                  <h3
                    className="font-bold uppercase"
                    style={{ fontSize: '11px', letterSpacing: '3px', color: `${YELLOW}CC` }}
                  >
                    {fam}
                  </h3>
                  <div className="flex flex-wrap gap-2">
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
          </div>
        </section>

        {/* ============================================================
            4. ALERTES ACTIVES — bandeaux horizontaux avec bordure gauche
            ============================================================ */}
        <section
          aria-label="Alertes actives"
          className="shrink-0 bg-black px-4 py-4 sm:px-6"
          style={{ borderTop: `1px solid ${YELLOW}33` }}
        >
          <h2
            className="mb-3 font-bold uppercase"
            style={{ fontSize: '13px', letterSpacing: '3px', color: YELLOW }}
          >
            ALERTES ACTIVES
          </h2>
          <div className="flex max-h-[460px] flex-col gap-2 overflow-y-auto pr-1">
            {topAlerts.map((a, idx) => (
              <AlertBandeau key={`alert-${a.thresholdId}-${a.zoneCode}-${idx}`} alert={a} />
            ))}
            {data?.help_requests?.slice(0, 3).map((h) => (
              <HelpRequestBandeau key={`help-${h.id}`} h={h} />
            ))}
            {activeReportAlerts.map((r) => (
              <ReportAlertBandeau
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
                  className="flex items-center justify-center px-3 py-8 bg-black"
                  style={{ border: `1px solid ${YELLOW}33` }}
                >
                  <p
                    className="font-bold uppercase"
                    style={{ fontSize: '13px', letterSpacing: '2px', color: GREEN }}
                  >
                    AUCUNE ALERTE ACTIVE
                  </p>
                </div>
              )}
          </div>
        </section>

        {/* ============================================================
            5. INCIDENTS TABLE — tableau signalétique avec en-tête jaune
            ============================================================ */}
        <main
          aria-label="Derniers signalements"
          className="relative flex min-h-0 flex-1 flex-col bg-black"
          style={{ borderTop: `1px solid ${YELLOW}4D` }}
        >
          {/* En-tête table — fond jaune, texte noir */}
          <div
            role="row"
            className="grid grid-cols-[1fr_1.4fr_0.8fr_1fr_0.6fr]"
            style={{ backgroundColor: YELLOW }}
          >
            {['ZONE', 'PROBLÈME', 'STATUT', 'ÉQUIPE', 'IL Y A'].map((header, i) => (
              <div
                key={header}
                role="columnheader"
                className={`px-3 py-2 font-bold uppercase ${i >= 2 ? 'hidden sm:block' : ''} ${
                  i === 4 ? 'text-right' : ''
                }`}
                style={{
                  fontSize: '12px',
                  letterSpacing: '2px',
                  color: BLACK,
                  borderLeft: i > 0 ? `1px solid ${BLACK}33` : 'none',
                }}
              >
                {header}
              </div>
            ))}
          </div>

          {/* Lignes */}
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            {data ? (
              filledRows.length > 0 ? (
                <>
                  {filledRows.map((r, idx) => (
                    <IncidentRow
                      key={r.id}
                      r={r}
                      fresh={freshIds.has(r.id)}
                      onActionFeedback={handleActionFeedback}
                      index={idx}
                    />
                  ))}
                  {Array.from({ length: placeholderCount }).map((_, i) => (
                    <PlaceholderRow key={`ph-${i}`} index={filledRows.length + i} />
                  ))}
                </>
              ) : (
                <div className="flex flex-1 items-center justify-center bg-black px-6 py-12">
                  <p
                    className="font-bold uppercase"
                    style={{ fontSize: '14px', letterSpacing: '2px', color: `${YELLOW}99` }}
                  >
                    {crisisMode
                      ? 'AUCUN INCIDENT CRITIQUE EN COURS — CRISE MAÎTRISÉE'
                      : filterZone
                        ? `AUCUN SIGNALEMENT POUR CETTE ZONE (${filterZone.toUpperCase()})`
                        : 'AUCUN SIGNALEMENT DANS LES DERNIÈRES 24H'}
                  </p>
                </div>
              )
            ) : (
              Array.from({ length: 10 }).map((_, i) => <RowSkeleton key={i} />)
            )}
          </div>

          {/* Toast feedback Actions rapides */}
          {actionToast && (
            <div
              role="status"
              className="pointer-events-none absolute left-1/2 top-2 z-30 -translate-x-1/2 px-4 py-2 font-bold uppercase"
              style={{
                fontSize: '12px',
                letterSpacing: '2px',
                border: `1px solid ${actionToast.kind === 'ok' ? GREEN : RED}`,
                backgroundColor: BLACK,
                color: actionToast.kind === 'ok' ? GREEN : RED,
              }}
            >
              {actionToast.msg}
            </div>
          )}
        </main>

        {/* ============================================================
            6. PREDICTION RADAR — wrapper noir/jaune
            ============================================================ */}
        <section
          aria-label="Radar prédiction des pics de plaintes"
          className="flex shrink-0 flex-col gap-2 bg-black px-4 py-4 sm:px-6"
          style={{ borderTop: `1px solid ${YELLOW}33` }}
        >
          <h2
            className="font-bold uppercase"
            style={{ fontSize: '13px', letterSpacing: '3px', color: YELLOW }}
          >
            RADAR PRÉDICTION — ÇA VA PÉTER DANS 20 MIN ?
          </h2>
          <div style={{ border: `1px solid ${YELLOW}4D` }} className="p-3">
            <AirportPredictionRadar className="w-full" />
          </div>
        </section>

        {/* ============================================================
            7. BOTTOM STRIP — SLA par zone + Charge par zone
            ============================================================ */}
        <footer
          aria-label="Synthèse SLA et charge par zone"
          className="grid shrink-0 grid-cols-1 bg-black lg:grid-cols-2"
          style={{ borderTop: `1px solid ${YELLOW}4D` }}
        >
          <section
            className="flex flex-col gap-1.5 px-4 py-4 sm:px-6"
            style={{ borderRight: `1px solid ${YELLOW}33` }}
          >
            <h2
              className="mb-2 font-bold uppercase"
              style={{ fontSize: '12px', letterSpacing: '3px', color: YELLOW }}
            >
              SLA PAR ZONE
            </h2>
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {data ? (
                data.zones.slice(0, 6).map((z) => (
                  <SlaRow key={`sla-${z.code}`} zone={z} sla={data.sla?.[z.code]} />
                ))
              ) : (
                Array.from({ length: 6 }).map((_, i) => <MiniRowSkeleton key={i} />)
              )}
            </div>
          </section>

          <section className="flex flex-col gap-1.5 px-4 py-4 sm:px-6">
            <h2
              className="mb-2 font-bold uppercase"
              style={{ fontSize: '12px', letterSpacing: '3px', color: YELLOW }}
            >
              CHARGE PAR ZONE · EN ATTENTE
            </h2>
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {data ? (
                data.zones.slice(0, 6).map((z) => (
                  <ChargeRow key={`chg-${z.code}`} zone={z} max={maxEnAttente} />
                ))
              ) : (
                Array.from({ length: 6 }).map((_, i) => <MiniRowSkeleton key={i} />)
              )}
            </div>
          </section>
        </footer>

        {/* ============================================================
            8. LEGEND — bandeau horizontal simple
            ============================================================ */}
        <div
          className="flex shrink-0 flex-wrap items-center justify-center gap-x-6 gap-y-1 bg-black px-4 py-2 sm:px-6"
          style={{ borderTop: `1px solid ${YELLOW}33` }}
        >
          <span
            className="flex items-center gap-1.5 font-bold uppercase"
            style={{ fontSize: '11px', letterSpacing: '2px', color: `${YELLOW}99` }}
          >
            <span className="size-2 rounded-full bg-green-500" aria-hidden />
            CALME (0)
          </span>
          <span
            className="flex items-center gap-1.5 font-bold uppercase"
            style={{ fontSize: '11px', letterSpacing: '2px', color: `${YELLOW}99` }}
          >
            <span className="size-2 rounded-full bg-[#F5C400]" aria-hidden />
            ATTENTION (1-2)
          </span>
          <span
            className="flex items-center gap-1.5 font-bold uppercase"
            style={{ fontSize: '11px', letterSpacing: '2px', color: `${YELLOW}99` }}
          >
            <span className="size-2 rounded-full bg-red-500" aria-hidden />
            CRITIQUE (3+)
          </span>
          <span
            className="ml-auto font-bold uppercase"
            style={{ fontSize: '11px', letterSpacing: '2px', color: `${YELLOW}66` }}
          >
            CLIC SUR UNE ZONE POUR FILTRER · {data?.stats.total_24h ?? 0} TOTAL 24H
          </span>
        </div>
      </div>
    </div>
  )
}
