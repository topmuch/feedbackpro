// ============================================================
// Page /ops-wallboard — Wallboard Ops Room Aéroport
// ------------------------------------------------------------
// Style "Split-Flap Departure Board" — reproduction d'un panneau
// de départ type aéroport (tuiles split-flap à charnière) :
//   - Fond global GRIS FONCÉ #2B2B2B
//   - Panneau NOIR PUR #000000, coins arrondis 6px, padding 24px
//   - Texte BLANC PUR #FFFFFF, MAJUSCULES, sans-serif bold/black
//   - Tuiles split-flap : gradient gris vertical + charnière médiane
//   - AUCUNE couleur jaune/bleu/violet — uniquement noir/gris/blanc
//   - Statuts colorés : VERT (résolu), AMBER (attente),
//     ORANGE (en cours), ROUGE (retard/critique)
//   - Icônes avion (lucide Plane) encadrant le titre
//   - Chaque valeur dans une tuile flap (gradient + charnière)
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
//   - Radar prédiction (wrapper noir/blanc)
//   - Bottom strip (SLA + charge par zone)
//   - SOS help requests support
//   - recently_resolved sound trigger
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
  Plane,
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
// Constantes — palette SPLIT-FLAP (NOIR / GRIS / BLANC)
// ---------------------------------------------------------------
const BLACK = '#000000'
const PAGE_BG = '#2B2B2B'
const WHITE = '#FFFFFF'
const GREEN = '#2d8a2d'
const AMBER = '#8a732d'
const ORANGE = '#8a5a2d'
const RED = '#8a2d2d'
const TILE_BORDER = '#1c1c1c'
const HINGE_LINE = '#1a1a1a'
const DOT_RED = '#ef4444'

// ---------------------------------------------------------------
// Variantes de tuile flap
// ---------------------------------------------------------------
type FlapVariant = 'default' | 'green' | 'amber' | 'orange' | 'red'

const FLAP_GRADIENTS: Record<FlapVariant, string> = {
  default: 'linear-gradient(180deg,#3d3d3d 0%,#575757 45%,#454545 50%,#2e2e2e 100%)',
  green: 'linear-gradient(180deg,#1a5c1a 0%,#2d8a2d 45%,#1f6b1f 50%,#1a4a1a 100%)',
  amber: 'linear-gradient(180deg,#5c4a1a 0%,#8a732d 45%,#6b5a22 50%,#4a3a15 100%)',
  orange: 'linear-gradient(180deg,#5c3a1a 0%,#8a5a2d 45%,#6b4520 50%,#4a3015 100%)',
  red: 'linear-gradient(180deg,#5c1a1a 0%,#8a2d2d 45%,#6b2020 50%,#4a1515 100%)',
}

const FLAP_BORDER: Record<FlapVariant, string> = {
  default: TILE_BORDER,
  green: '#1a4a1a',
  amber: '#4a3a15',
  orange: '#4a3015',
  red: '#4a1515',
}

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

function relativeTimeFlap(iso: string | null): string {
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

function formatTimeShort(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Statut meta — palette split-flap :
 *   EN_ATTENTE → AMBER (tuile amber)
 *   EN_COURS   → ORANGE (tuile orange)
 *   RESOLU     → GREEN (tuile green)
 *   EN_RETARD  → RED + pulse (tuile red) */
const STATUT_META: Record<Statut, { label: string; variant: FlapVariant }> = {
  EN_ATTENTE: { label: 'ATTENTE', variant: 'amber' },
  EN_COURS: { label: 'EN COURS', variant: 'orange' },
  RESOLU: { label: 'RÉSOLU', variant: 'green' },
}

function statutMeta(s: string): { label: string; variant: FlapVariant } {
  return STATUT_META[s as Statut] ?? { label: s, variant: 'default' }
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

const ZONE_STATUS_META: Record<ZoneStatus, { variant: FlapVariant; label: string; dotColor: string }> = {
  calm: { variant: 'green', label: 'CALME', dotColor: GREEN },
  attention: { variant: 'amber', label: 'ATTENTION', dotColor: AMBER },
  critical: { variant: 'red', label: 'CRITIQUE', dotColor: RED },
  none: { variant: 'default', label: 'N/A', dotColor: '#555555' },
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

// ============================================================
// Sous-composants — SPLIT-FLAP DEPARTURE BOARD
// ============================================================

/**
 * FlapTile — la tuile split-flap de base.
 * Gradient gris vertical avec charnière médiane (ligne noire au milieu).
 * Variantes colorées pour les statuts (green/amber/orange/red).
 */
function FlapTile({
  children,
  className = '',
  variant = 'default',
  pulse = false,
  borderAccent,
}: {
  children: React.ReactNode
  className?: string
  variant?: FlapVariant
  pulse?: boolean
  borderAccent?: string
}) {
  return (
    <span
      className={`relative inline-flex items-center justify-center rounded-[3px] px-2 py-1 font-bold uppercase text-white ${pulse ? 'ops-pulse' : ''} ${className}`}
      style={{
        backgroundImage: FLAP_GRADIENTS[variant],
        border: `1px solid ${borderAccent ?? FLAP_BORDER[variant]}`,
        boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.5)',
        fontSize: '14px',
        letterSpacing: '1px',
        lineHeight: 1.1,
      }}
    >
      {children}
      {/* Charnière médiane — ligne noire horizontale au milieu */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-1/2 h-px"
        style={{ backgroundColor: HINGE_LINE }}
      />
    </span>
  )
}

/**
 * FlapString — découpe une chaîne en tuiles flap par caractère.
 * Simule un panneau split-flap où chaque lettre est une tuile.
 * Les espaces deviennent des points médians '·'.
 */
function FlapString({
  text,
  variant = 'default',
  maxLength = 10,
  pulse = false,
  className = '',
  tileSize = 'sm',
}: {
  text: string
  variant?: FlapVariant
  maxLength?: number
  pulse?: boolean
  className?: string
  tileSize?: 'xs' | 'sm' | 'md'
}) {
  const display = truncateName(text.toUpperCase(), maxLength)
  const sizeCls =
    tileSize === 'xs'
      ? 'min-w-[16px] px-1 text-[11px]'
      : tileSize === 'sm'
        ? 'min-w-[20px] px-1 text-xs'
        : 'min-w-[24px] px-1.5 text-sm'
  return (
    <div className={`inline-flex flex-wrap gap-[3px] ${className}`}>
      {display.split('').map((ch, i) => (
        <FlapTile key={i} variant={variant} pulse={pulse} className={sizeCls}>
          {ch === ' ' ? '·' : ch}
        </FlapTile>
      ))}
    </div>
  )
}

/**
 * KpiTile — grande tuile flap pour la KPI strip.
 * Valeur en grand, label en dessous, bordure colorée selon statut.
 */
function KpiTile({
  label,
  value,
  variant = 'default',
}: {
  label: string
  value: string | number
  variant?: FlapVariant
}) {
  return (
    <div className="flex flex-1 flex-col items-center gap-1.5 px-2 py-2">
      <span
        className="inline-flex min-w-[70px] items-center justify-center rounded-[3px] px-3 py-2 font-black tabular-nums text-white"
        style={{
          backgroundImage: FLAP_GRADIENTS[variant],
          border: `2px solid ${FLAP_BORDER[variant]}`,
          boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.5)',
          fontSize: 'clamp(20px, 3vw, 28px)',
          letterSpacing: '1px',
          lineHeight: 1,
          position: 'relative',
        }}
      >
        {value}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-1/2 h-px"
          style={{ backgroundColor: HINGE_LINE }}
        />
      </span>
      <span
        className="font-bold uppercase text-white"
        style={{ fontSize: '10px', letterSpacing: '2px', opacity: 0.6 }}
      >
        {label}
      </span>
    </div>
  )
}

/**
 * ZoneTile — tuile flap représentant une zone.
 * Contient emoji + nom + badge count coloré.
 * Clic → filtre le tableau. Zone critique → pulse + bordure rouge.
 */
function ZoneTile({
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
  const countVariant: FlapVariant =
    st === 'calm' ? 'green' : st === 'attention' ? 'amber' : st === 'critical' ? 'red' : 'default'
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={isActive}
      title={`${zone.nom} — ${ZONE_STATUS_META[st].label} · ${zone.count_en_attente} en attente`}
      className={`transition-opacity hover:opacity-90 ${isCritical ? 'ops-pulse' : ''}`}
    >
      <FlapTile
        variant="default"
        borderAccent={isCritical ? RED : isActive ? WHITE : TILE_BORDER}
        className="gap-1.5 px-2 py-1.5"
      >
        <span aria-hidden style={{ fontSize: '14px', lineHeight: 1 }}>
          {zone.emoji}
        </span>
        <span
          className="font-bold uppercase text-white"
          style={{ fontSize: '11px', letterSpacing: '1px' }}
        >
          {truncateName(zone.nom.toUpperCase(), 10)}
        </span>
        <span
          className="ml-1 inline-flex items-center justify-center rounded-[2px] px-1.5 text-xs font-black tabular-nums text-white"
          style={{
            backgroundImage: FLAP_GRADIENTS[countVariant],
            border: `1px solid ${FLAP_BORDER[countVariant]}`,
            minWidth: '22px',
            boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.5)',
            position: 'relative',
          }}
        >
          {zone.count_en_attente}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-1/2 h-px"
            style={{ backgroundColor: HINGE_LINE }}
          />
        </span>
      </FlapTile>
    </button>
  )
}

/**
 * ActionFlapTile — petite tuile flap pour bouton d'action.
 * Bordure blanche, fond flap, icône blanche.
 */
function ActionFlapTile({
  onClick,
  disabled,
  label,
  title,
  children,
  variant = 'default',
}: {
  onClick: () => void
  disabled?: boolean
  label: string
  title: string
  children: React.ReactNode
  variant?: FlapVariant
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={title}
      className="transition-opacity hover:opacity-90 disabled:opacity-50"
    >
      <FlapTile variant={variant} className="gap-1 px-2 py-1 text-xs">
        {children}
        <span>{label}</span>
      </FlapTile>
    </button>
  )
}

/**
 * AlertTileRow — rangée de tuiles flap pour une alerte seuil.
 */
function AlertTileRow({ alert }: { alert: TriggeredAlert }) {
  const isCritical = alert.severity === 'critical'
  const variant: FlapVariant = isCritical ? 'red' : 'amber'
  return (
    <div
      role="alert"
      className={`flex flex-wrap items-center gap-1.5 ${isCritical ? 'ops-flash-red' : ''}`}
      style={{
        padding: '6px 8px',
        backgroundColor: isCritical ? 'rgba(138,45,45,0.12)' : 'rgba(138,115,45,0.08)',
        borderRadius: '3px',
      }}
    >
      <FlapTile variant={variant} pulse={isCritical} className="px-2 py-1 text-xs">
        <span aria-hidden style={{ fontSize: '13px', lineHeight: 1 }}>
          {isCritical ? '⚠' : '!'}
        </span>
      </FlapTile>
      <FlapString
        text={alert.zoneCode}
        variant="default"
        maxLength={10}
        tileSize="xs"
      />
      <FlapString
        text={alert.message}
        variant="default"
        maxLength={24}
        tileSize="xs"
        className="flex-1"
      />
      <FlapTile variant="red" className="px-2 py-1 text-xs tabular-nums">
        {relativeTimeFlap(alert.triggeredAt)}
      </FlapTile>
      <ActionFlapTile onClick={() => {}} label="APPELER" title="APPELER">
        <Phone className="size-3" aria-hidden />
      </ActionFlapTile>
      <ActionFlapTile onClick={() => {}} label="ESCALADER" title="ESCALADER" variant="red">
        <Megaphone className="size-3" aria-hidden />
      </ActionFlapTile>
    </div>
  )
}

/**
 * ReportAlertTileRow — rangée de tuiles flap pour un signalement actif.
 * Boutons APPELER / ASSIGNER (menu) / ESCALADER.
 */
function ReportAlertTileRow({
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
  const statusVariant: FlapVariant = isLate ? 'red' : s.variant
  const [showAssignMenu, setShowAssignMenu] = useState(false)
  return (
    <div
      role="alert"
      className={`relative flex flex-wrap items-center gap-1.5 ${isLate ? 'ops-flash-red' : ''}`}
      style={{
        padding: '6px 8px',
        backgroundColor: isLate ? 'rgba(138,45,45,0.12)' : 'rgba(0,0,0,0.4)',
        borderRadius: '3px',
      }}
    >
      <FlapTile variant="default" className="px-2 py-1 text-xs">
        <span aria-hidden style={{ fontSize: '14px', lineHeight: 1 }}>
          {r.zone?.emoji ?? '📍'}
        </span>
      </FlapTile>
      <FlapString
        text={(r.zone?.nom ?? 'ZONE').toUpperCase()}
        variant="default"
        maxLength={10}
        tileSize="xs"
      />
      <FlapString
        text={r.problemType}
        variant="default"
        maxLength={20}
        tileSize="xs"
        className="flex-1"
      />
      <FlapTile variant={statusVariant} pulse={isLate} className="px-2 py-1 text-xs">
        {isLate ? 'EN RETARD' : s.label}
      </FlapTile>
      <FlapTile variant="red" className="px-2 py-1 text-xs tabular-nums">
        {relativeTimeFlap(r.createdAt)}
      </FlapTile>
      <ActionFlapTile onClick={onCall} label="APPELER" title="APPELER OPS">
        <Phone className="size-3" aria-hidden />
      </ActionFlapTile>
      <div className="relative">
        <ActionFlapTile
          onClick={() => setShowAssignMenu((v) => !v)}
          disabled={busy}
          label="ASSIGNER"
          title="ASSIGNER / REROUTER"
        >
          <Wrench className="size-3" aria-hidden />
        </ActionFlapTile>
        {showAssignMenu && (
          <div
            role="menu"
            className="absolute right-0 top-full z-30 mt-1 w-44 p-1"
            style={{
              backgroundColor: BLACK,
              border: `1px solid ${WHITE}`,
              borderRadius: '3px',
            }}
          >
            <p
              className="px-2 py-1 font-bold uppercase text-white"
              style={{ fontSize: '10px', letterSpacing: '1px', opacity: 0.7 }}
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
                  className="flex w-full items-center gap-2 px-2 py-1.5 text-left font-bold uppercase text-white transition-opacity hover:opacity-80"
                  style={{ fontSize: '11px', letterSpacing: '1px' }}
                >
                  <span aria-hidden>{TEAM_META[k].emoji}</span>
                  <span>{TEAM_META[k].label}</span>
                </button>
              ))}
          </div>
        )}
      </div>
      <ActionFlapTile
        onClick={onEscalate}
        disabled={busy}
        label="ESCALADER"
        title="ESCALADER"
        variant="red"
      >
        <Megaphone className="size-3" aria-hidden />
      </ActionFlapTile>
    </div>
  )
}

/** HelpRequestTileRow — rangée de tuiles flap pour SOS voyageur. */
function HelpRequestTileRow({ h }: { h: HelpRequestLite }) {
  const elapsedMin = Math.floor((Date.now() - new Date(h.createdAt).getTime()) / 60000)
  const isLate = elapsedMin > 15
  const variant: FlapVariant = isLate ? 'red' : 'amber'
  return (
    <div
      role="alert"
      className={`flex flex-wrap items-center gap-1.5 ${isLate ? 'ops-flash-red' : ''}`}
      style={{
        padding: '6px 8px',
        backgroundColor: isLate ? 'rgba(138,45,45,0.12)' : 'rgba(138,115,45,0.08)',
        borderRadius: '3px',
      }}
    >
      <FlapTile variant={variant} pulse={isLate} className="px-2 py-1 text-xs">
        <span aria-hidden style={{ fontSize: '13px', lineHeight: 1 }}>🆘</span>
      </FlapTile>
      <FlapString
        text={`SOS ${(h.zone?.nom ?? 'ZONE').toUpperCase()}`}
        variant={variant}
        maxLength={14}
        tileSize="xs"
      />
      <FlapString
        text={h.message ?? "Demande d'aide voyageur"}
        variant="default"
        maxLength={24}
        tileSize="xs"
        className="flex-1"
      />
      <FlapTile variant="red" className="px-2 py-1 text-xs tabular-nums">
        {relativeTimeFlap(h.createdAt)}
      </FlapTile>
      {h.travelerPhone && (
        <a
          href={`tel:${h.travelerPhone}`}
          className="transition-opacity hover:opacity-90"
        >
          <FlapTile variant="default" className="gap-1 px-2 py-1 text-xs">
            <Phone className="size-3" aria-hidden />
            <span>APPELER VOYAGEUR</span>
          </FlapTile>
        </a>
      )}
    </div>
  )
}

/**
 * IncidentFlapRow — ligne du tableau d'incidents en tuiles split-flap.
 * TIME / ZONE / PROBLÈME en tuiles par caractère.
 * STATUT / ÉQUIPE / ÉCoulÉ en une tuile chacun.
 * Actions en petites tuiles flap avec icônes.
 */
function IncidentFlapRow({
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
  const statusVariant: FlapVariant = isLate ? 'red' : s.variant
  const statusLabel = isLate ? 'EN RETARD' : s.label
  const rowBg = index % 2 === 0 ? BLACK : '#0d0d0d'

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
      className={`flex items-center gap-2 px-2 py-2 ${fresh ? 'ops-flap-in' : ''}`}
      style={{
        backgroundColor: isLate ? 'rgba(138,45,45,0.10)' : rowBg,
        borderBottom: `1px solid ${TILE_BORDER}`,
      }}
    >
      {/* TIME — tuiles par caractère [H][H][:][M][M] */}
      <div role="cell" className="flex shrink-0 items-center">
        <FlapString
          text={formatTimeShort(r.createdAt)}
          variant="default"
          maxLength={5}
          tileSize="sm"
        />
      </div>

      {/* ZONE — tuiles par caractère */}
      <div role="cell" className="flex min-w-0 flex-1 items-center gap-1.5">
        <span aria-hidden style={{ fontSize: '14px', lineHeight: 1 }}>
          {r.zone?.emoji ?? '📍'}
        </span>
        <FlapString
          text={(r.zone?.nom ?? 'ZONE INCONNUE').toUpperCase()}
          variant="default"
          maxLength={10}
          tileSize="xs"
        />
      </div>

      {/* PROBLÈME — tuiles par caractère */}
      <div
        role="cell"
        className="hidden min-w-0 flex-1 items-center gap-1.5 sm:flex"
      >
        {r.isHelpRequest && (
          <FlapTile variant="red" pulse className="px-1.5 py-0.5 text-[10px]">
            SOS
          </FlapTile>
        )}
        <FlapString
          text={r.problemType}
          variant="default"
          maxLength={12}
          tileSize="xs"
        />
      </div>

      {/* STATUT — une tuile colorée */}
      <div role="cell" className="hidden shrink-0 items-center md:flex">
        <FlapTile
          variant={statusVariant}
          pulse={isLate}
          className="px-2 py-1 text-[11px] whitespace-nowrap"
        >
          {statusLabel}
        </FlapTile>
      </div>

      {/* ÉQUIPE — une tuile */}
      <div role="cell" className="hidden shrink-0 items-center lg:flex">
        {team ? (
          <FlapTile variant="default" className="gap-1 px-2 py-1 text-[11px]">
            <span aria-hidden>{team.emoji}</span>
            <span>{team.abbr}</span>
          </FlapTile>
        ) : (
          <FlapTile variant="default" className="px-2 py-1 text-[11px]">—</FlapTile>
        )}
      </div>

      {/* ÉCoulÉ — une tuile */}
      <div role="cell" className="flex shrink-0 items-center">
        <FlapTile
          variant={isLate ? 'red' : 'default'}
          pulse={isLate}
          className="px-2 py-1 text-[11px] tabular-nums whitespace-nowrap"
        >
          {relativeTimeFlap(r.createdAt)}
        </FlapTile>
      </div>

      {/* ACTIONS — petites tuiles flap avec icônes */}
      <div role="cell" className="hidden shrink-0 items-center gap-1 xl:flex">
        {!r.isHelpRequest && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowAssignMenu((v) => !v)}
              disabled={busy}
              aria-label="Assigner ou rerouter le signalement"
              title="ASSIGNER / REROUTER"
              className="transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              <FlapTile variant="default" className="px-1.5 py-1">
                <Wrench className="size-3.5 text-white" aria-hidden />
              </FlapTile>
            </button>
            {showAssignMenu && (
              <div
                role="menu"
                className="absolute right-0 top-full z-20 mt-1 w-44 p-1"
                style={{
                  backgroundColor: BLACK,
                  border: `1px solid ${WHITE}`,
                  borderRadius: '3px',
                }}
              >
                <p
                  className="px-2 py-1 font-bold uppercase text-white"
                  style={{ fontSize: '10px', letterSpacing: '1px', opacity: 0.7 }}
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
                      className="flex w-full items-center gap-2 px-2 py-1.5 text-left font-bold uppercase text-white transition-opacity hover:opacity-80"
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
          className="transition-opacity hover:opacity-90"
        >
          <FlapTile variant="default" className="px-1.5 py-1">
            <Phone className="size-3.5 text-white" aria-hidden />
          </FlapTile>
        </button>
        {!r.isHelpRequest && (
          <button
            type="button"
            onClick={handleEscalate}
            disabled={busy}
            aria-label="Escalader auprès de Denise"
            title="ESCALADER (DENISE TAKE_CHARGE)"
            className="transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            <FlapTile variant="red" pulse={isLate} className="px-1.5 py-1">
              <Megaphone className="size-3.5 text-white" aria-hidden />
            </FlapTile>
          </button>
        )}
      </div>
    </div>
  )
}

function PlaceholderFlapRow({ index }: { index: number }) {
  const rowBg = index % 2 === 0 ? BLACK : '#0d0d0d'
  return (
    <div
      role="row"
      aria-hidden
      className="flex items-center gap-2 px-2 py-2"
      style={{ backgroundColor: rowBg, borderBottom: `1px solid ${TILE_BORDER}` }}
    >
      <div className="flex shrink-0 gap-[3px]">
        {Array.from({ length: 5 }).map((_, i) => (
          <FlapTile key={i} variant="default" className="min-w-[20px] px-1 text-xs">
            ·
          </FlapTile>
        ))}
      </div>
      <div className="flex min-w-0 flex-1 gap-[3px]">
        {Array.from({ length: 8 }).map((_, i) => (
          <FlapTile key={i} variant="default" className="min-w-[16px] px-1 text-[11px]">
            ·
          </FlapTile>
        ))}
      </div>
      <div className="hidden min-w-0 flex-1 gap-[3px] sm:flex">
        {Array.from({ length: 10 }).map((_, i) => (
          <FlapTile key={i} variant="default" className="min-w-[16px] px-1 text-[11px]">
            ·
          </FlapTile>
        ))}
      </div>
      <div className="hidden shrink-0 md:block">
        <FlapTile variant="default" className="px-2 py-1 text-[11px]">· · ·</FlapTile>
      </div>
      <div className="hidden shrink-0 lg:block">
        <FlapTile variant="default" className="px-2 py-1 text-[11px]">· ·</FlapTile>
      </div>
      <div className="flex shrink-0">
        <FlapTile variant="default" className="px-2 py-1 text-[11px]">· ·</FlapTile>
      </div>
      <div className="hidden shrink-0 gap-1 xl:flex">
        <FlapTile variant="default" className="px-1.5 py-1">·</FlapTile>
        <FlapTile variant="default" className="px-1.5 py-1">·</FlapTile>
        <FlapTile variant="default" className="px-1.5 py-1">·</FlapTile>
      </div>
    </div>
  )
}

/** SlaTileRow — ligne SLA par zone en tuiles flap. */
function SlaTileRow({ zone, sla }: { zone: ZoneAgg; sla?: SlaStats }) {
  if (!sla || sla.targetMinutes === null) {
    return (
      <div className="flex items-center gap-1.5 px-1 py-1">
        <span aria-hidden style={{ fontSize: '13px' }}>{zone.emoji}</span>
        <FlapString
          text={zone.nom.toUpperCase()}
          variant="default"
          maxLength={12}
          tileSize="xs"
          className="flex-1"
        />
        <FlapTile variant="default" className="px-2 py-0.5 text-[10px]">N/A</FlapTile>
      </div>
    )
  }
  const pct = sla.slaCompliancePercent
  const hasResolutions = sla.resolvedCount > 0
  const pctVariant: FlapVariant = !hasResolutions
    ? 'default'
    : pct >= 80
      ? 'green'
      : pct >= 60
        ? 'amber'
        : 'red'
  return (
    <div className="flex items-center gap-1.5 px-1 py-1">
      <span aria-hidden style={{ fontSize: '13px' }}>{zone.emoji}</span>
      <FlapString
        text={zone.nom.toUpperCase()}
        variant="default"
        maxLength={12}
        tileSize="xs"
        className="min-w-0 flex-1"
      />
      <FlapTile variant="default" className="px-1.5 py-0.5 text-[10px] tabular-nums">
        ≤{sla.targetMinutes}M
      </FlapTile>
      {hasResolutions && pct >= 80 ? (
        <FlapTile variant="green" className="px-1.5 py-0.5 text-[10px]">✓</FlapTile>
      ) : null}
      <FlapTile
        variant={pctVariant}
        className="px-2 py-0.5 text-[11px] tabular-nums"
      >
        {hasResolutions ? `${pct}%` : '—'}
      </FlapTile>
    </div>
  )
}

/** ChargeTileRow — ligne charge par zone : barre grayscale + count en tuile. */
function ChargeTileRow({ zone, max }: { zone: ZoneAgg; max: number }) {
  const pct = max > 0 ? Math.max(2, Math.round((zone.count_en_attente / max) * 100)) : 0
  const countVariant: FlapVariant =
    zone.count_en_attente > 5 ? 'red' : zone.count_en_attente > 0 ? 'amber' : 'default'
  return (
    <div className="flex items-center gap-1.5 px-1 py-1">
      <span aria-hidden style={{ fontSize: '13px' }}>{zone.emoji}</span>
      <FlapString
        text={zone.nom.toUpperCase()}
        variant="default"
        maxLength={12}
        tileSize="xs"
        className="min-w-0 flex-1"
      />
      {/* Progress bar grayscale — gradient white to dark gray */}
      <div
        className="overflow-hidden rounded-[2px]"
        style={{ width: '80px', height: '10px', backgroundColor: '#1a1a1a' }}
      >
        <div
          className="h-full transition-all duration-700"
          style={{
            width: `${zone.count_en_attente === 0 ? 0 : pct}%`,
            backgroundImage:
              'linear-gradient(90deg,#ffffff 0%,#cccccc 50%,#555555 100%)',
          }}
        />
      </div>
      <FlapTile
        variant={countVariant}
        className="px-2 py-0.5 text-[11px] tabular-nums"
      >
        {zone.count_en_attente}
      </FlapTile>
    </div>
  )
}

// --- Squelettes de chargement ---
function KpiSkeletonFlap() {
  return (
    <div className="flex flex-1 flex-col items-center gap-1.5 px-2 py-2">
      <div
        className="ops-pulse rounded-[3px]"
        style={{ width: '70%', height: '32px', backgroundColor: '#222222' }}
      />
      <div
        className="ops-pulse rounded-[3px]"
        style={{ width: '50%', height: '10px', backgroundColor: '#222222' }}
      />
    </div>
  )
}

function RowSkeletonFlap() {
  return (
    <div
      className="flex items-center gap-2 px-2 py-2"
      style={{ backgroundColor: BLACK, borderBottom: `1px solid ${TILE_BORDER}` }}
    >
      <div className="ops-pulse rounded-[3px]" style={{ width: '90px', height: '24px' }} />
      <div className="ops-pulse flex-1 rounded-[3px]" style={{ height: '24px' }} />
      <div className="hidden ops-pulse flex-1 rounded-[3px] sm:block" style={{ height: '24px' }} />
      <div className="hidden ops-pulse rounded-[3px] md:block" style={{ width: '80px', height: '24px' }} />
      <div className="hidden ops-pulse rounded-[3px] lg:block" style={{ width: '50px', height: '24px' }} />
      <div className="ops-pulse rounded-[3px]" style={{ width: '50px', height: '24px' }} />
    </div>
  )
}

function MiniRowSkeletonFlap() {
  return (
    <div className="flex items-center gap-1.5 px-1 py-1">
      <div className="ops-pulse rounded-[3px]" style={{ width: '16px', height: '16px' }} />
      <div className="ops-pulse flex-1 rounded-[3px]" style={{ height: '16px' }} />
      <div className="ops-pulse rounded-[3px]" style={{ width: '40px', height: '16px' }} />
    </div>
  )
}

/**
 * CrisisButtonFlap — bouton mode crise style split-flap.
 * Inactif : tuile transparente bordure blanche.
 * Actif : tuile rouge pulse + timer + bouton FIN (vert). */
function CrisisButtonFlap({
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
        <FlapTile variant="red" pulse className="flex-col gap-0 px-2 py-1">
          <span className="text-[9px] font-black uppercase tracking-wider">CRISE ACTIVE</span>
          <span
            suppressHydrationWarning
            className="font-bold tabular-nums text-white"
            style={{ fontSize: '11px' }}
          >
            {formatDurationSec(elapsedSec)}
          </span>
        </FlapTile>
        <button
          type="button"
          onClick={onEnd}
          aria-pressed={active}
          aria-label="Désactiver le mode crise"
          title="Terminer la crise"
          className="transition-opacity hover:opacity-90"
        >
          <FlapTile variant="green" className="gap-1 px-2 py-1.5 text-[11px]">
            <ShieldAlert className="size-3.5 text-white" aria-hidden />
            <span>FIN</span>
          </FlapTile>
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
      className="transition-opacity hover:opacity-90"
    >
      <span
        className="inline-flex items-center gap-1.5 rounded-[3px] px-2.5 py-1.5 font-bold uppercase text-white"
        style={{
          backgroundColor: 'transparent',
          border: `1px solid ${WHITE}`,
          fontSize: '11px',
          letterSpacing: '1px',
        }}
      >
        <ShieldAlert className="size-3.5" aria-hidden />
        MODE CRISE
      </span>
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

  const slaAccent: FlapVariant =
    overallSlaPctNum === null
      ? 'default'
      : overallSlaPctNum >= 80
        ? 'green'
        : overallSlaPctNum < 60
          ? 'red'
          : 'amber'

  const enAttenteAccent: FlapVariant =
    data && data.stats.en_attente > 5 ? 'red' : data && data.stats.en_attente > 0 ? 'amber' : 'default'

  const untreatedAccent: FlapVariant = untreatedOver10Min > 0 ? 'red' : 'green'

  const staffAccent: FlapVariant = staffActive.count > 0 ? 'green' : 'amber'

  // KPI definitions for the flap strip
  const kpis: { label: string; value: string | number; variant: FlapVariant }[] = data
    ? [
        { label: 'CRIT.', value: untreatedOver10Min, variant: untreatedAccent },
        { label: 'ATT.', value: data.stats.en_attente, variant: enAttenteAccent },
        { label: 'RÉSOL.', value: data.stats.resolus_24h, variant: 'green' },
        { label: 'TEMPS', value: formatDurationMin(data.stats.avg_resolution_minutes), variant: 'amber' },
        { label: 'SLA', value: overallSlaPct, variant: slaAccent },
        { label: 'STAFF', value: `${staffActive.count}/${staffActive.total}`, variant: staffAccent },
      ]
    : []

  return (
    <div
      className="flex min-h-screen flex-col overflow-x-hidden font-sans"
      style={{ backgroundColor: PAGE_BG }}
    >
      {/* Keyframes globales — split-flap animations */}
      <style>{`
        @keyframes opsPulse { 0%,100%{opacity:1} 50%{opacity:.55} }
        @keyframes opsFlashRed {
          0%,100% { background-color: rgba(138,45,45,0.10); }
          50% { background-color: rgba(138,45,45,0.24); }
        }
        @keyframes opsFlapIn {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes opsLiveBlink {
          0%,100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        .ops-pulse { animation: opsPulse 1.4s ease-in-out infinite; }
        .ops-flash-red { animation: opsFlashRed 1.2s ease-in-out infinite; }
        .ops-flap-in { animation: opsFlapIn 0.5s ease-out; }
        .ops-crisis-overlay { background-color: rgba(138,45,45,0.06); }
        .ops-live-blink { animation: opsLiveBlink 1.4s ease-in-out infinite; }
        .ops-scroll::-webkit-scrollbar { width: 6px; height: 6px; }
        .ops-scroll::-webkit-scrollbar-track { background: #1a1a1a; }
        .ops-scroll::-webkit-scrollbar-thumb { background: #454545; border-radius: 3px; }
        .ops-scroll::-webkit-scrollbar-thumb:hover { background: #575757; }
      `}</style>

      {/* Élément audio caché pour le ding */}
      <audio ref={audioRef} preload="auto" />

      {/* === PANNEAU PRINCIPAL — bloc noir arrondi sur fond gris foncé === */}
      <div
        className={`mx-auto flex w-full max-w-[1920px] flex-1 flex-col overflow-hidden rounded-md p-4 sm:p-6 ${
          crisisMode ? 'ops-crisis-overlay' : ''
        }`}
        style={{
          backgroundColor: BLACK,
          border: `1px solid ${TILE_BORDER}`,
        }}
      >
        {/* ============================================================
            1. HEADER — bandeau NOIR avec icônes avion + texte blanc
            ============================================================ */}
        <header
          className="flex shrink-0 flex-wrap items-center justify-between gap-3 pb-4"
          style={{ borderBottom: `1px solid ${TILE_BORDER}` }}
        >
          {/* LEFT — Plane icon (mirrored) + title + Plane icon */}
          <div className="flex items-center gap-3">
            <Plane
              className="size-8 -scale-x-100 text-white"
              aria-hidden
            />
            <h1
              className="font-black uppercase text-white"
              style={{ fontSize: 'clamp(16px, 2.5vw, 24px)', letterSpacing: '2px' }}
            >
              AÉROPORT OPS · WALLBOARD
            </h1>
            <Plane
              className="size-8 text-white"
              aria-hidden
            />
          </div>

          {/* CENTER — Date + alert count */}
          <div className="hidden flex-col items-center md:flex">
            <span
              className="font-bold uppercase text-white"
              style={{ fontSize: '11px', letterSpacing: '2px', opacity: 0.7 }}
            >
              {formatDateFR(now)}
            </span>
            <span
              className="font-bold uppercase text-white"
              style={{ fontSize: '10px', letterSpacing: '2px', opacity: 0.5 }}
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
                    className="ops-live-blink size-2 rounded-full"
                    style={{ backgroundColor: DOT_RED }}
                    aria-hidden
                  />
                  <span
                    className="ops-live-blink font-bold uppercase"
                    style={{ fontSize: '11px', letterSpacing: '2px', color: DOT_RED }}
                  >
                    ERREUR
                  </span>
                </>
              ) : (
                <>
                  <span
                    className="size-2 rounded-full"
                    style={{ backgroundColor: DOT_RED }}
                    aria-hidden
                  />
                  <span
                    className="font-bold uppercase text-white"
                    style={{ fontSize: '11px', letterSpacing: '2px' }}
                  >
                    LIVE
                  </span>
                </>
              )}
            </div>

            {/* Clock — white tabular-nums */}
            <span
              suppressHydrationWarning
              className="font-bold tabular-nums text-white"
              style={{ fontSize: 'clamp(18px, 3vw, 24px)', letterSpacing: '1px' }}
            >
              {formatClock(now)}
            </span>

            {/* MODE CRISE */}
            <CrisisButtonFlap
              active={crisisMode}
              onStart={handleCrisisStart}
              onEnd={handleCrisisEnd}
              elapsedSec={crisisElapsedSec}
            />

            {/* Sound toggle — transparent bg, white border */}
            <button
              type="button"
              onClick={toggleSound}
              aria-pressed={soundOn}
              aria-label={soundOn ? 'Couper le son' : 'Activer le son (ding + annonces vocales)'}
              title={soundOn ? 'Son activé — clic pour couper' : 'Son coupé — clic pour activer ding + annonces vocales'}
              className="transition-opacity hover:opacity-90"
            >
              <span
                className="inline-flex items-center gap-1.5 rounded-[3px] px-2.5 py-1.5 font-bold uppercase text-white"
                style={{
                  backgroundColor: 'transparent',
                  border: `1px solid ${WHITE}`,
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
              </span>
            </button>
          </div>
        </header>

        {/* ---------- BANNIÈRE D'ACTIVATION DU SON ---------- */}
        {showSoundBanner && !soundOn && (
          <div
            className="mt-4 flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-[3px] px-3 py-3"
            style={{ backgroundColor: '#0d0d0d', border: `1px solid ${TILE_BORDER}` }}
          >
            <div className="flex items-center gap-3">
              <span
                className="ops-pulse size-2.5 rounded-full"
                style={{ backgroundColor: DOT_RED }}
                aria-hidden
              />
              <div className="flex flex-col">
                <p
                  className="font-bold uppercase text-white"
                  style={{ fontSize: '12px', letterSpacing: '1px' }}
                >
                  ACTIVEZ LE SON POUR LES ALERTES VOCALES
                </p>
                <p
                  className="font-bold text-white"
                  style={{ fontSize: '10px', letterSpacing: '1px', opacity: 0.5 }}
                >
                  DING + ANNONCES VOCALES À CHAQUE NOUVEAU SIGNALEMENT
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={toggleSound}
                className="transition-opacity hover:opacity-90"
              >
                <FlapTile variant="green" className="gap-1 px-3 py-2 text-xs">
                  <Volume2 className="size-4 text-white" aria-hidden />
                  <span>ACTIVER LE SON</span>
                </FlapTile>
              </button>
              <button
                type="button"
                onClick={() => setShowSoundBanner(false)}
                aria-label="Fermer la bannière"
                className="transition-opacity hover:opacity-90"
              >
                <span
                  className="inline-flex items-center justify-center rounded-[3px] px-2 py-1.5 font-bold text-white"
                  style={{ border: `1px solid ${WHITE}` }}
                >
                  <span style={{ fontSize: '16px', lineHeight: 1 }} aria-hidden>×</span>
                </span>
              </button>
            </div>
          </div>
        )}

        {/* ---------- Résumé fin de crise ---------- */}
        {crisisSummary && !crisisMode && (
          <div
            role="status"
            className="mt-4 flex shrink-0 items-center justify-center gap-3 rounded-[3px] px-4 py-2"
            style={{ backgroundColor: '#0d0d0d', border: `1px solid ${GREEN}` }}
          >
            <ShieldAlert className="size-4" style={{ color: GREEN }} aria-hidden />
            <p
              className="font-bold uppercase text-white"
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
            className="mt-4 flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-[3px] px-4 py-2"
            style={{ backgroundColor: 'rgba(138,45,45,0.2)', border: `1px solid ${RED}` }}
          >
            <div className="flex items-center gap-2">
              <ShieldAlert className="ops-pulse size-4 text-white" aria-hidden />
              <span
                className="font-bold uppercase text-white"
                style={{ fontSize: '12px', letterSpacing: '2px' }}
              >
                MODE CRISE — BOARD FILTRÉ AUX INCIDENTS CRITIQUES UNIQUEMENT
              </span>
            </div>
            {activeFilterLabel && (
              <span
                className="font-bold uppercase text-white"
                style={{ fontSize: '11px', letterSpacing: '2px' }}
              >
                {activeFilterLabel}
              </span>
            )}
          </div>
        )}

        {/* ============================================================
            2. KPI STRIP — 6 tuiles flap avec valeur + label
            ============================================================ */}
        <section
          aria-label="KPI temps réel"
          className="mt-4 flex shrink-0 flex-wrap items-start gap-2"
        >
          {data ? (
            kpis.map((kpi) => (
              <KpiTile
                key={kpi.label}
                label={kpi.label}
                value={kpi.value}
                variant={kpi.variant}
              />
            ))
          ) : (
            Array.from({ length: 6 }).map((_, i) => <KpiSkeletonFlap key={i} />)
          )}
        </section>

        {/* ============================================================
            3. ZONE MAP — tuiles flap groupées par famille
            ============================================================ */}
        <section aria-label="Carte zones" className="mt-4 shrink-0">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Plane className="size-5 -scale-x-100 text-white" aria-hidden />
              <h2
                className="font-bold uppercase text-white"
                style={{ fontSize: '13px', letterSpacing: '2px' }}
              >
                CARTE TEMPS RÉEL · {data?.zones.length ?? 0} ZONES
              </h2>
              <Plane className="size-5 text-white" aria-hidden />
            </div>
            {filterZone && (
              <button
                type="button"
                onClick={() => setFilterZone(null)}
                className="transition-opacity hover:opacity-90"
              >
                <FlapTile variant="default" className="px-2 py-1 text-xs">
                  ✕ FILTRE: {filterZone.toUpperCase()}
                </FlapTile>
              </button>
            )}
          </div>

          {/* Familles de zones — tuiles flap */}
          <div className="flex flex-col gap-3">
            {families.map((fam) => {
              const famZones = zonesByFamily[fam] ?? []
              if (famZones.length === 0) return null
              return (
                <div key={fam} className="flex flex-col gap-1.5">
                  <h3
                    className="font-bold uppercase text-white"
                    style={{ fontSize: '10px', letterSpacing: '2px', opacity: 0.5 }}
                  >
                    {fam}
                  </h3>
                  <div className="flex flex-wrap gap-1.5">
                    {famZones.map((z) => (
                      <ZoneTile
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
            4. ALERTES ACTIVES — rangées de tuiles flap
            ============================================================ */}
        <section
          aria-label="Alertes actives"
          className="mt-4 shrink-0"
        >
          <div className="mb-3 flex items-center gap-2">
            <Plane className="size-5 -scale-x-100 text-white" aria-hidden />
            <h2
              className="font-bold uppercase text-white"
              style={{ fontSize: '13px', letterSpacing: '2px' }}
            >
              ALERTES ACTIVES
            </h2>
            <Plane className="size-5 text-white" aria-hidden />
          </div>
          <div
            className="flex max-h-[420px] flex-col gap-1.5 overflow-y-auto pr-1 ops-scroll"
          >
            {topAlerts.map((a, idx) => (
              <AlertTileRow key={`alert-${a.thresholdId}-${a.zoneCode}-${idx}`} alert={a} />
            ))}
            {data?.help_requests?.slice(0, 3).map((h) => (
              <HelpRequestTileRow key={`help-${h.id}`} h={h} />
            ))}
            {activeReportAlerts.map((r) => (
              <ReportAlertTileRow
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
                  className="flex items-center justify-center rounded-[3px] px-3 py-6"
                  style={{ border: `1px solid ${TILE_BORDER}` }}
                >
                  <FlapTile variant="green" className="px-3 py-2 text-xs">
                    AUCUNE ALERTE ACTIVE
                  </FlapTile>
                </div>
              )}
          </div>
        </section>

        {/* ============================================================
            5. INCIDENTS TABLE — split-flap departure board
            ============================================================ */}
        <main
          aria-label="Derniers signalements"
          className="relative mt-4 flex min-h-0 flex-1 flex-col"
        >
          {/* Title bar — ✈ INCIDENTS BOARD ✈ */}
          <div
            className="mb-2 flex items-center justify-center gap-3 rounded-[3px] px-4 py-2"
            style={{ backgroundColor: '#0d0d0d', border: `1px solid ${TILE_BORDER}` }}
          >
            <Plane className="size-6 -scale-x-100 text-white" aria-hidden />
            <span
              className="font-black uppercase text-white"
              style={{ fontSize: 'clamp(16px, 2vw, 22px)', letterSpacing: '4px' }}
            >
              INCIDENTS BOARD
            </span>
            <Plane className="size-6 text-white" aria-hidden />
          </div>

          {/* En-tête table — texte blanc sur fond noir (no tiles for headers) */}
          <div
            role="row"
            className="flex items-center gap-2 px-2 py-2"
            style={{ borderBottom: `1px solid ${TILE_BORDER}` }}
          >
            <div
              className="shrink-0 font-bold uppercase text-white"
              style={{ fontSize: '11px', letterSpacing: '2px', opacity: 0.6, width: '90px' }}
            >
              TIME
            </div>
            <div
              className="min-w-0 flex-1 font-bold uppercase text-white"
              style={{ fontSize: '11px', letterSpacing: '2px', opacity: 0.6 }}
            >
              ZONE
            </div>
            <div
              className="hidden min-w-0 flex-1 font-bold uppercase text-white sm:block"
              style={{ fontSize: '11px', letterSpacing: '2px', opacity: 0.6 }}
            >
              PROBLÈME
            </div>
            <div
              className="hidden shrink-0 font-bold uppercase text-white md:block"
              style={{ fontSize: '11px', letterSpacing: '2px', opacity: 0.6, width: '90px' }}
            >
              STATUT
            </div>
            <div
              className="hidden shrink-0 font-bold uppercase text-white lg:block"
              style={{ fontSize: '11px', letterSpacing: '2px', opacity: 0.6, width: '70px' }}
            >
              ÉQUIPE
            </div>
            <div
              className="shrink-0 font-bold uppercase text-white"
              style={{ fontSize: '11px', letterSpacing: '2px', opacity: 0.6, width: '60px' }}
            >
              ÉCoulÉ
            </div>
            <div
              className="hidden shrink-0 font-bold uppercase text-white xl:block"
              style={{ fontSize: '11px', letterSpacing: '2px', opacity: 0.6, width: '90px' }}
            >
              ACTIONS
            </div>
          </div>

          {/* Lignes — tuiles flap par caractère */}
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto ops-scroll">
            {data ? (
              filledRows.length > 0 ? (
                <>
                  {filledRows.map((r, idx) => (
                    <IncidentFlapRow
                      key={r.id}
                      r={r}
                      fresh={freshIds.has(r.id)}
                      onActionFeedback={handleActionFeedback}
                      index={idx}
                    />
                  ))}
                  {Array.from({ length: placeholderCount }).map((_, i) => (
                    <PlaceholderFlapRow key={`ph-${i}`} index={filledRows.length + i} />
                  ))}
                </>
              ) : (
                <div className="flex flex-1 items-center justify-center px-6 py-12">
                  <FlapTile variant="default" className="px-4 py-3 text-sm">
                    {crisisMode
                      ? 'AUCUN INCIDENT CRITIQUE — CRISE MAÎTRISÉE'
                      : filterZone
                        ? `AUCUN SIGNALEMENT (${filterZone.toUpperCase()})`
                        : 'AUCUN SIGNALEMENT 24H'}
                  </FlapTile>
                </div>
              )
            ) : (
              Array.from({ length: 10 }).map((_, i) => <RowSkeletonFlap key={i} />)
            )}
          </div>

          {/* Toast feedback Actions rapides */}
          {actionToast && (
            <div
              role="status"
              className="pointer-events-none absolute left-1/2 top-2 z-30 -translate-x-1/2"
            >
              <FlapTile
                variant={actionToast.kind === 'ok' ? 'green' : 'red'}
                className="px-4 py-2 text-xs"
              >
                {actionToast.msg}
              </FlapTile>
            </div>
          )}
        </main>

        {/* ============================================================
            6. PREDICTION RADAR — wrapper noir/blanc
            ============================================================ */}
        <section
          aria-label="Radar prédiction des pics de plaintes"
          className="mt-4 flex shrink-0 flex-col gap-2"
        >
          <div className="flex items-center gap-2">
            <Plane className="size-5 -scale-x-100 text-white" aria-hidden />
            <h2
              className="font-bold uppercase text-white"
              style={{ fontSize: '13px', letterSpacing: '2px' }}
            >
              RADAR PRÉDICTION
            </h2>
            <Plane className="size-5 text-white" aria-hidden />
          </div>
          <div
            className="rounded-[3px] p-3"
            style={{ backgroundColor: '#0d0d0d', border: `1px solid ${TILE_BORDER}` }}
          >
            <AirportPredictionRadar className="w-full" />
          </div>
        </section>

        {/* ============================================================
            7. BOTTOM STRIP — SLA + Charge par zone (tuiles flap)
            ============================================================ */}
        <footer
          aria-label="Synthèse SLA et charge par zone"
          className="mt-4 grid shrink-0 grid-cols-1 gap-4 lg:grid-cols-2"
        >
          <section
            className="flex flex-col gap-2 rounded-[3px] p-3"
            style={{ backgroundColor: '#0d0d0d', border: `1px solid ${TILE_BORDER}` }}
          >
            <div className="flex items-center gap-2">
              <Plane className="size-4 -scale-x-100 text-white" aria-hidden />
              <h2
                className="font-bold uppercase text-white"
                style={{ fontSize: '11px', letterSpacing: '2px' }}
              >
                SLA PAR ZONE
              </h2>
            </div>
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {data ? (
                data.zones.slice(0, 6).map((z) => (
                  <SlaTileRow key={`sla-${z.code}`} zone={z} sla={data.sla?.[z.code]} />
                ))
              ) : (
                Array.from({ length: 6 }).map((_, i) => <MiniRowSkeletonFlap key={i} />)
              )}
            </div>
          </section>

          <section
            className="flex flex-col gap-2 rounded-[3px] p-3"
            style={{ backgroundColor: '#0d0d0d', border: `1px solid ${TILE_BORDER}` }}
          >
            <div className="flex items-center gap-2">
              <Plane className="size-4 -scale-x-100 text-white" aria-hidden />
              <h2
                className="font-bold uppercase text-white"
                style={{ fontSize: '11px', letterSpacing: '2px' }}
              >
                CHARGE PAR ZONE · EN ATTENTE
              </h2>
            </div>
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {data ? (
                data.zones.slice(0, 6).map((z) => (
                  <ChargeTileRow key={`chg-${z.code}`} zone={z} max={maxEnAttente} />
                ))
              ) : (
                Array.from({ length: 6 }).map((_, i) => <MiniRowSkeletonFlap key={i} />)
              )}
            </div>
          </section>
        </footer>

        {/* ============================================================
            8. LEGEND — tuiles flap avec dots colorés
            ============================================================ */}
        <div
          className="mt-4 flex shrink-0 flex-wrap items-center justify-center gap-x-6 gap-y-2 rounded-[3px] px-4 py-2"
          style={{ backgroundColor: '#0d0d0d', border: `1px solid ${TILE_BORDER}` }}
        >
          <span className="flex items-center gap-1.5">
            <FlapTile variant="green" className="px-2 py-0.5 text-[10px]">
              <span
                className="size-2 rounded-full"
                style={{ backgroundColor: GREEN }}
                aria-hidden
              />
              <span className="font-bold uppercase text-white">CALME (0)</span>
            </FlapTile>
          </span>
          <span className="flex items-center gap-1.5">
            <FlapTile variant="amber" className="px-2 py-0.5 text-[10px]">
              <span
                className="size-2 rounded-full"
                style={{ backgroundColor: AMBER }}
                aria-hidden
              />
              <span className="font-bold uppercase text-white">ATTENTION (1-2)</span>
            </FlapTile>
          </span>
          <span className="flex items-center gap-1.5">
            <FlapTile variant="red" className="px-2 py-0.5 text-[10px]">
              <span
                className="size-2 rounded-full"
                style={{ backgroundColor: RED }}
                aria-hidden
              />
              <span className="font-bold uppercase text-white">CRITIQUE (3+)</span>
            </FlapTile>
          </span>
          <span
            className="ml-auto font-bold uppercase text-white"
            style={{ fontSize: '10px', letterSpacing: '2px', opacity: 0.4 }}
          >
            CLIC ZONE POUR FILTRER · {data?.stats.total_24h ?? 0} TOTAL 24H
          </span>
        </div>
      </div>
    </div>
  )
}
