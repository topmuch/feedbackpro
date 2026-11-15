// ============================================================
// Page /ops-wallboard — Wallboard Ops Room Aéroport
// ------------------------------------------------------------
// Style "Signalétique Aéroportuaire" — panneaux jaune/noir
// à haute visibilité inspirés des enseignes IATA :
//   - fond noir profond #0A0A0A (PAS slate/neutral)
//   - barre d'en-tête jaune IATA #FCD116
//   - bordures 3px jaune pour sections, 2px pour tuiles
//   - texte BLANC, MAJUSCULES, letter-spacing 2-4px
//   - chiffres KPI géants (56px, font-weight 900)
//   - tuiles zone "signalétique" avec bordure colorée par statut
//   - table d'incidents style panneau d'affichage
//   - cartes d'alertes avec bordure gauche colorée par sévérité
//   - animations : pulse pour LIVE, flashRed pour zones critiques
//
// Polling identique au précédent :
//   - /api/airport/wallboard toutes les 5s
//   - /api/airport/alerts/check toutes les 30s
//   - /api/airport/leaderboard toutes les 60s
//   - horloge 1s
//
// Fonctionnalités préservées :
//   - Sons (ding-dong, ding-critical, resolved, escalade 660/880/990Hz)
//   - TTS Denise (decideAndSpeakForWallboard)
//   - Rappel 15 min (badge EN RETARD + escalade sonore 15/20/25/30)
//   - Toggle son (persisté localStorage)
//   - Mode crise (filtre incidents critiques + timer + overlay)
//   - Actions rapides (🔧 assign / 📞 call / 📢 escalate)
//   - Filtre zone (clic sur la carte → filtre le tableau)
//   - Radar prédiction
//   - Bottom strip (SLA + charge par zone)
// ============================================================

'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Plane,
  TriangleAlert,
  OctagonAlert,
  Volume2,
  VolumeX,
  Phone,
  Megaphone,
  Trophy,
  TrendingUp,
  TrendingDown,
  ShieldAlert,
  Activity,
  Wrench,
  Users,
  Clock,
  AlertTriangle,
  Map as MapIcon,
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
  /** Issue 1 — true pour les SOS help requests fusionnées dans le feed */
  isHelpRequest?: boolean
}

// Issue 1 — SOS / demandes d'aide voyageur affichées dans le panneau
// d'alertes du wallboard via <HelpRequestAlertCard />.
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
  help_requests?: HelpRequestLite[]
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

/** "il y a 12 MIN" — version signalétique (UPPERCASE, court) */
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
 *   EN_ATTENTE → jaune IATA (#FCD116)
 *   EN_COURS   → orange (#FF9500)
 *   RESOLU     → vert OK (#34C759) */
const STATUT_META: Record<Statut, { label: string; color: string; bg: string; border: string }> = {
  EN_ATTENTE: {
    label: 'EN ATTENTE',
    color: '#FCD116',
    bg: 'rgba(252,209,22,0.15)',
    border: '#FCD116',
  },
  EN_COURS: {
    label: 'EN COURS',
    color: '#FF9500',
    bg: 'rgba(255,149,0,0.15)',
    border: '#FF9500',
  },
  RESOLU: {
    label: 'RÉSOLU',
    color: '#34C759',
    bg: 'rgba(52,199,89,0.15)',
    border: '#34C759',
  },
}

function statutMeta(s: string): { label: string; color: string; bg: string; border: string } {
  return (
    STATUT_META[s as Statut] ?? {
      label: s,
      color: '#999999',
      bg: 'rgba(153,153,153,0.15)',
      border: '#999999',
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

// ---------------------------------------------------------------
// Task WB2 — Helpers additionnels
// ---------------------------------------------------------------

/** "8M 23S" — formatage humain court en MAJUSCULES */
function formatDurationMin(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return '—'
  const totalSec = Math.round(minutes * 60)
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}M ${String(s).padStart(2, '0')}S`
}

/** "12MIN 34S" — formatage d'une durée en secondes pour le timer Mode Crise */
function formatDurationSec(totalSec: number): string {
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}MIN ${String(s).padStart(2, '0')}S`
}

/** Code zone → famille (EXTÉRIEUR / TERMINAL / SÛRETÉ / COMMERCIAL / SERVICE / URGENCE / HISTORIQUE) */
type ZoneFamily =
  | 'EXTÉRIEUR'
  | 'SÛRETÉ'
  | 'TERMINAL'
  | 'COMMERCIAL'
  | 'SERVICE'
  | 'URGENCE'
  | 'HISTORIQUE'

function zoneFamily(code: string): ZoneFamily {
  // Issue 2 — anciennes zones historiques (rétro-compat) mappées vers
  // les nouvelles familles signalétiques AVANT les checks de préfixe.
  // Sans cela, les reports créés via ?airport=tapis_bagages_1 (code
  // "bagages") n'apparaissaient pas sur la carte (famille HISTORIQUE
  // → ignorée) et les tuiles affichaient 0.
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

/** Truncate a zone name for compact map display */
function truncateName(name: string, max = 12): string {
  if (name.length <= max) return name
  return `${name.slice(0, max - 1)}…`
}

/** Détermine la couleur de statut d'une zone selon son count_en_attente :
 *   - 0           → 'calm' (green)
 *   - 1-2         → 'attention' (yellow)
 *   - 3+          → 'critical' (red, flashRed animation)
 *   - null/undef  → 'none' (gray) */
type ZoneStatus = 'calm' | 'attention' | 'critical' | 'none'

function zoneStatus(count: number | null | undefined): ZoneStatus {
  if (count === null || count === undefined) return 'none'
  if (count === 0) return 'calm'
  if (count <= 2) return 'attention'
  return 'critical'
}

/** Palette signalétique pour les statuts de zone — couleurs IATA */
const ZONE_STATUS_META: Record<ZoneStatus, { color: string; label: string }> = {
  calm: { color: '#34C759', label: 'CALME' },
  attention: { color: '#FCD116', label: 'ATTENTION' },
  critical: { color: '#FF3B30', label: 'CRITIQUE' },
  none: { color: '#555555', label: 'N/A' },
}

/** Task WB2 Feature 4 — Mode Crise :
 *  Détermine si un signalement est "critique" (à afficher en mode crise). */
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
// Helpers son — Ding + TTS (synthèse vocale navigateur)
// ---------------------------------------------------------------
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
    // NE PAS appeler cancel() juste avant speak() — sur certains navigateurs
    // (Chrome notamment), cancel() est asynchrone et annule aussi le speak()
    // qui suit immédiatement. On utilise une file d'attente naturelle à la
    // place : si Denise parlait déjà, le nouveau message s'ajoute à la file.
    // Pour couper l'annonce précédente, on ne fait rien — la nouvelle
    // annonce remplace naturellement l'ancienne après qu'elle se termine.

    const u = new SpeechSynthesisUtterance(text)
    u.lang = 'fr-FR'
    u.rate = 1.05
    u.pitch = 1.0
    u.volume = 0.9

    // Charger les voix françaises si disponibles
    const voices = window.speechSynthesis.getVoices()
    const frVoice = voices.find(v => v.lang.startsWith('fr'))
    if (frVoice) {
      u.voice = frVoice
    }

    // Si Denise parlait déjà, on annule APRES un court délai pour laisser
    // le nouveau speak() se mettre en file (évite la race condition).
    if (window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel()
      // Petit délai pour que le cancel soit bien traité avant le speak
      setTimeout(() => window.speechSynthesis.speak(u), 50)
    } else {
      window.speechSynthesis.speak(u)
    }
  } catch {
    // TTS indisponible — silencieux
  }
}

// ============================================================
// Voice Decision Engine — Denise "réfléchit" avant de parler
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

/** Triple-ding d'escalade — généré via Web Audio API (660/880/990 Hz). */
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
    setTimeout(() => ctx.close().catch(() => {}), 900)
  } catch {
    // Web Audio indisponible — silencieux
  }
}

// ---------------------------------------------------------------
// Sous-composants — SIGNALÉTIQUE AÉROPORT
// ---------------------------------------------------------------

/**
 * Tuile KPI géante — style signalétique IATA.
 *   - Fond noir, bordure droite 2px #333
 *   - Chiffre géant 56px font-weight 900
 *   - Bordure basse 4px colorée par sévérité
 *   - Label 14px 700 weight letter-spacing 2px #999 */
function KpiTile({
  label,
  value,
  accent = 'white',
}: {
  label: string
  value: string | number
  accent?: 'white' | 'yellow' | 'red' | 'green' | 'orange'
}) {
  const colorMap = {
    white: '#FFFFFF',
    yellow: '#FCD116',
    red: '#FF3B30',
    green: '#34C759',
    orange: '#FF9500',
  } as const
  const borderColor = colorMap[accent]
  return (
    <div
      className="relative flex flex-col items-center justify-center gap-1 bg-[#0A0A0A] px-2 py-3"
      style={{ borderRight: '2px solid #333333', borderBottom: `4px solid ${borderColor}` }}
    >
      <span
        className="font-black tabular-nums leading-none uppercase"
        style={{
          fontSize: 'clamp(28px, 5vw, 56px)',
          color: borderColor,
          letterSpacing: '1px',
        }}
      >
        {value}
      </span>
      <span
        className="font-bold uppercase"
        style={{ fontSize: '12px', letterSpacing: '2px', color: '#999999' }}
      >
        {label}
      </span>
    </div>
  )
}

/** Tuile Zone Signalétique —
 *   - Fond noir, bordure 3px colorée par statut
 *   - Critical : bordure rouge + fond flashRed + animation
 *   - Clic → filtre le tableau d'incidents */
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
  const meta = ZONE_STATUS_META[st]
  const isCritical = st === 'critical'
  const isAttention = st === 'attention'
  const borderColor = meta.color
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={isActive}
      title={`${zone.nom} — ${meta.label} · ${zone.count_en_attente} en attente`}
      className={`relative flex flex-col items-center justify-center gap-0.5 px-2 py-2 text-center transition-all ${
        isCritical ? 'ops-flash-red' : ''
      }`}
      style={{
        backgroundColor: isCritical
          ? 'rgba(255,59,48,0.15)'
          : isAttention
            ? 'rgba(252,209,22,0.1)'
            : '#0A0A0A',
        border: `3px solid ${isActive ? '#FCD116' : borderColor}`,
        boxShadow: isActive ? '0 0 0 2px #FCD116' : 'none',
      }}
    >
      {/* Issue 4 — signalétique : [flèche jaune] [pictogramme] puis
          nom + compteur. La flèche ▸ jaune IATA #FCD116 indique la
          direction (standard signalétique aéroportuaire). */}
      <div className="flex items-center gap-1" aria-hidden>
        <span
          style={{
            fontSize: '15px',
            lineHeight: 1,
            color: '#FCD116',
            fontWeight: 900,
          }}
        >
          ▸
        </span>
        <span style={{ fontSize: '16px', lineHeight: 1 }}>{zone.emoji}</span>
      </div>
      <span
        className="w-full truncate font-bold uppercase"
        style={{ fontSize: '10px', letterSpacing: '1px', color: '#FFFFFF' }}
      >
        {truncateName(zone.nom.toUpperCase(), 12)}
      </span>
      <span
        className="font-black tabular-nums leading-none"
        style={{ fontSize: '20px', color: borderColor }}
      >
        {zone.count_en_attente}
      </span>
    </button>
  )
}

/**
 * Carte d'alerte (panneau droit) — style signalétique.
 *   - Bordure 3px, bordure gauche 8px colorée par sévérité
 *   - Zone en jaune, temps en rouge, problème en blanc gras
 *   - Boutons d'action : fond jaune #FCD116, texte noir */
function AlertCard({
  alert,
}: {
  alert: TriggeredAlert
}) {
  const isCritical = alert.severity === 'critical'
  const accent = isCritical ? '#FF3B30' : '#FCD116'
  return (
    <div
      role="alert"
      className={`flex flex-col gap-1 bg-[#0A0A0A] px-3 py-2 ${
        isCritical ? 'ops-flash-red' : ''
      }`}
      style={{
        border: '3px solid #333333',
        borderLeft: `8px solid ${accent}`,
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className="font-bold uppercase"
          style={{ fontSize: '13px', letterSpacing: '2px', color: '#FCD116' }}
        >
          {isCritical ? '🔴 ' : '🟡 '}
          {alert.zoneCode}
        </span>
        <span
          className="font-bold tabular-nums"
          style={{ fontSize: '13px', color: '#FF3B30' }}
        >
          {relativeTimeSignaletique(alert.triggeredAt)}
        </span>
      </div>
      <p
        className="font-bold uppercase leading-tight"
        style={{ fontSize: '15px', color: '#FFFFFF', letterSpacing: '0.5px' }}
      >
        {alert.message}
      </p>
      <div className="flex items-center gap-1">
        <span
          className="font-bold uppercase"
          style={{ fontSize: '11px', color: '#999999', letterSpacing: '1px' }}
        >
          {alert.type.replace(/_/g, ' ')}
        </span>
        <span
          className="ml-auto font-bold tabular-nums"
          style={{ fontSize: '12px', color: accent }}
        >
          {alert.currentValue}/{alert.threshold}
        </span>
      </div>
      <div className="mt-1 flex gap-1.5">
        <button
          type="button"
          className="flex items-center gap-1 px-2 py-1 font-bold uppercase transition-opacity hover:opacity-80"
          style={{
            backgroundColor: '#FCD116',
            color: '#0A0A0A',
            fontSize: '11px',
            letterSpacing: '1px',
          }}
        >
          <Phone className="size-3" aria-hidden />
          APPELER
        </button>
        <button
          type="button"
          className="flex items-center gap-1 px-2 py-1 font-bold uppercase transition-opacity hover:opacity-80"
          style={{
            backgroundColor: '#FCD116',
            color: '#0A0A0A',
            fontSize: '11px',
            letterSpacing: '1px',
          }}
        >
          <Megaphone className="size-3" aria-hidden />
          ESCALADER
        </button>
      </div>
    </div>
  )
}

/** Carte d'alerte basée sur un signalement récent (panneau droit).
 *  Utilise les signalements EN_ATTENTE/EN_COURS comme alertes actives
 *  quand peu d'alertes seuil sont déclenchées. */
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
  const s = statutMeta(r.statut)
  const team = teamMeta(r.routedTeam)
  const elapsedMin = Math.floor((Date.now() - new Date(r.createdAt).getTime()) / 60000)
  const isLate = elapsedMin > 15 && r.statut !== 'RESOLU'
  const accent = isLate ? '#FF3B30' : s.color
  const [showAssignMenu, setShowAssignMenu] = useState(false)
  return (
    <div
      role="alert"
      className={`relative flex flex-col gap-1 bg-[#0A0A0A] px-3 py-2 ${
        isLate ? 'ops-flash-red' : ''
      }`}
      style={{
        border: '3px solid #333333',
        borderLeft: `8px solid ${accent}`,
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className="font-bold uppercase"
          style={{ fontSize: '13px', letterSpacing: '2px', color: '#FCD116' }}
        >
          {r.zone?.emoji ?? '📍'} {(r.zone?.nom ?? 'ZONE').toUpperCase()}
        </span>
        <span
          className="font-bold tabular-nums"
          style={{ fontSize: '13px', color: '#FF3B30' }}
        >
          {elapsedMin} MIN
        </span>
      </div>
      <p
        className="font-bold uppercase leading-tight"
        style={{ fontSize: '15px', color: '#FFFFFF', letterSpacing: '0.5px' }}
      >
        {r.problemType}
      </p>
      <div className="flex items-center gap-2">
        <span
          className="inline-flex items-center font-bold uppercase"
          style={{
            fontSize: '10px',
            color: s.color,
            border: `1px solid ${s.color}`,
            backgroundColor: s.bg,
            padding: '1px 6px',
            letterSpacing: '1px',
          }}
        >
          {s.label}
        </span>
        {team && (
          <span
            className="font-bold uppercase"
            style={{ fontSize: '11px', color: '#999999', letterSpacing: '1px' }}
          >
            {team.emoji} {team.label}
          </span>
        )}
        {isLate && (
          <span
            className="font-bold uppercase ops-pulse"
            style={{
              fontSize: '10px',
              color: '#FF3B30',
              border: '1px solid #FF3B30',
              backgroundColor: 'rgba(255,59,48,0.2)',
              padding: '1px 6px',
              letterSpacing: '1px',
            }}
          >
            EN RETARD
          </span>
        )}
      </div>
      <div className="mt-1 flex gap-1.5">
        <button
          type="button"
          onClick={onCall}
          className="flex items-center gap-1 px-2 py-1 font-bold uppercase transition-opacity hover:opacity-80"
          style={{
            backgroundColor: '#FCD116',
            color: '#0A0A0A',
            fontSize: '11px',
            letterSpacing: '1px',
          }}
        >
          <Phone className="size-3" aria-hidden />
          APPELER OPS
        </button>
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowAssignMenu((v) => !v)}
            disabled={busy}
            className="flex items-center gap-1 px-2 py-1 font-bold uppercase transition-opacity hover:opacity-80 disabled:opacity-50"
            style={{
              backgroundColor: '#FCD116',
              color: '#0A0A0A',
              fontSize: '11px',
              letterSpacing: '1px',
            }}
          >
            <Wrench className="size-3" aria-hidden />
            ASSIGNER
          </button>
          {showAssignMenu && (
            <div
              role="menu"
              className="absolute left-0 top-full z-30 mt-1 w-40 border-2 bg-black p-1"
              style={{ borderColor: '#FCD116' }}
            >
              <p
                className="px-2 py-1 font-bold uppercase"
                style={{ fontSize: '10px', letterSpacing: '1px', color: '#FCD116' }}
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
                    className="flex w-full items-center gap-2 px-2 py-1.5 text-left font-bold uppercase transition-colors hover:bg-[#FCD116]/10"
                    style={{ fontSize: '11px', color: '#FFFFFF', letterSpacing: '1px' }}
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
          className="flex items-center gap-1 px-2 py-1 font-bold uppercase transition-opacity hover:opacity-80 disabled:opacity-50"
          style={{
            backgroundColor: '#FF3B30',
            color: '#FFFFFF',
            fontSize: '11px',
            letterSpacing: '1px',
          }}
        >
          <Megaphone className="size-3" aria-hidden />
          ESCALADER
        </button>
      </div>
    </div>
  )
}

/** Carte d'alerte SOS — demande d'aide voyageur (panneau droit).
 *  Style signalétique : bordure gauche jaune IATA #FCD116, badge SOS,
 *  message du voyageur, et bouton "APPELER VOYAGEUR" si un numéro est
 *  joint. Issue 1 — les help requests disposent désormais d'une carte
 *  dédiée dans le panneau d'alertes du wallboard. */
function HelpRequestAlertCard({ h }: { h: HelpRequestLite }) {
  const elapsedMin = Math.floor(
    (Date.now() - new Date(h.createdAt).getTime()) / 60000,
  )
  const isLate = elapsedMin > 15
  const accent = isLate ? '#FF3B30' : '#FCD116'
  return (
    <div
      role="alert"
      className={`relative flex flex-col gap-1 bg-[#0A0A0A] px-3 py-2 ${
        isLate ? 'ops-flash-red' : ''
      }`}
      style={{
        border: '3px solid #333333',
        borderLeft: `8px solid ${accent}`,
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className="font-black uppercase"
          style={{ fontSize: '13px', letterSpacing: '2px', color: accent }}
        >
          🆘 SOS {(h.zone?.nom ?? 'ZONE').toUpperCase()}
        </span>
        <span
          className="font-bold tabular-nums"
          style={{ fontSize: '13px', color: '#FF3B30' }}
        >
          {elapsedMin} MIN
        </span>
      </div>
      <p
        className="font-bold uppercase leading-tight"
        style={{ fontSize: '15px', color: '#FFFFFF', letterSpacing: '0.5px' }}
      >
        {h.message ?? "Demande d'aide voyageur"}
      </p>
      <div className="flex items-center gap-2">
        <span
          className="font-bold uppercase"
          style={{ fontSize: '11px', color: '#999999', letterSpacing: '1px' }}
        >
          {h.tagScanne}
        </span>
        {h.travelerPhone && (
          <a
            href={`tel:${h.travelerPhone}`}
            className="ml-auto flex items-center gap-1 px-2 py-1 font-bold uppercase transition-opacity hover:opacity-80"
            style={{
              backgroundColor: '#FCD116',
              color: '#0A0A0A',
              fontSize: '11px',
              letterSpacing: '1px',
            }}
          >
            <Phone className="size-3" aria-hidden />
            APPELER VOYAGEUR
          </a>
        )}
      </div>
    </div>
  )
}

/** Ligne du tableau d'incidents — style signalétique.
 *  Feature W1 — rappel 15 min : si > 15 min en attente, badge EN RETARD.
 *  Issue 1 — les SOS help requests (isHelpRequest) y apparaissent aussi
 *  avec un badge SOS jaune ; les actions assign/escalade (liées aux
 *  AirportReport) y sont masquées car l'id est préfixé `sos_`. */
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
  const rowBg = index % 2 === 0 ? '#0A0A0A' : '#111111'
  const statusDot = isLate ? '#FF3B30' : s.color

  // --- Actions handlers ---
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
          onActionFeedback?.(
            `AFFECTÉ → ${TEAM_META[teamKey].label} — ${r.zone?.nom ?? 'ZONE'}`,
            'ok',
          )
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
        onActionFeedback?.(
          `ESCALADE DENISE → ${(r.zone?.nom ?? 'ZONE').toUpperCase()}`,
          'ok',
        )
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
      className={`grid shrink-0 grid-cols-[1fr_1.4fr_0.8fr_1fr_0.6fr] ${
        fresh ? 'ops-fade-in' : ''
      }`}
      style={{
        backgroundColor: isLate ? 'rgba(255,59,48,0.08)' : rowBg,
        borderTop: '2px solid #222222',
      }}
    >
      {/* ZONE */}
      <div role="cell" className="flex min-w-0 items-center gap-2 px-3 py-2">
        <span
          aria-hidden
          className="shrink-0 rounded-full"
          style={{ width: '8px', height: '8px', backgroundColor: statusDot }}
        />
        <span style={{ fontSize: '16px', lineHeight: 1 }} aria-hidden>
          {r.zone?.emoji ?? '📍'}
        </span>
        <span
          className="truncate font-bold uppercase"
          style={{ fontSize: '14px', color: '#FCD116', letterSpacing: '1px' }}
        >
          {(r.zone?.nom ?? 'ZONE INCONNUE').toUpperCase()}
        </span>
      </div>

      {/* PROBLÈME */}
      <div role="cell" className="flex min-w-0 items-center gap-2 px-3 py-2">
        {r.isHelpRequest && (
          <span
            className="shrink-0 font-black uppercase"
            style={{
              fontSize: '10px',
              letterSpacing: '1px',
              color: '#0A0A0A',
              backgroundColor: '#FCD116',
              padding: '2px 6px',
              border: '1px solid #FCD116',
            }}
          >
            SOS
          </span>
        )}
        <span
          className="truncate font-bold uppercase"
          style={{ fontSize: '14px', color: '#FFFFFF', letterSpacing: '0.5px' }}
          title={r.problemType}
        >
          {r.problemType}
        </span>
      </div>

      {/* STATUT */}
      <div role="cell" className="hidden items-center px-3 py-2 sm:flex">
        <span
          className="inline-flex font-bold uppercase"
          style={{
            fontSize: '11px',
            color: s.color,
            border: `1px solid ${s.color}`,
            backgroundColor: s.bg,
            padding: '2px 8px',
            letterSpacing: '1px',
          }}
        >
          {s.label}
        </span>
        {isLate && (
          <span
            className="ml-1 font-bold uppercase ops-pulse"
            style={{
              fontSize: '10px',
              color: '#FF3B30',
              border: '1px solid #FF3B30',
              backgroundColor: 'rgba(255,59,48,0.2)',
              padding: '1px 5px',
              letterSpacing: '1px',
            }}
          >
            EN RETARD
          </span>
        )}
      </div>

      {/* ÉQUIPE + ACTIONS */}
      <div role="cell" className="hidden items-center gap-2 px-3 py-2 sm:flex">
        {team ? (
          <span
            className="truncate font-bold uppercase"
            style={{ fontSize: '13px', color: '#FCD116', letterSpacing: '1px' }}
          >
            {team.emoji} {team.label}
          </span>
        ) : (
          <span
            className="font-bold uppercase"
            style={{ fontSize: '13px', color: '#555555' }}
          >
            —
          </span>
        )}
        {/* ACTIONS rapides */}
        <div className="ml-auto flex items-center gap-1">
          {!r.isHelpRequest && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowAssignMenu((v) => !v)}
              disabled={busy}
              aria-label="Assigner ou rerouter le signalement"
              title="ASSIGNER / REROUTER"
              className="flex size-7 items-center justify-center border-2 transition-colors disabled:opacity-50"
              style={{ borderColor: '#FCD116', color: '#FCD116' }}
            >
              <Wrench className="size-3.5" aria-hidden />
            </button>
            {showAssignMenu && (
              <div
                role="menu"
                className="absolute right-0 top-full z-20 mt-1 w-40 border-2 bg-black p-1"
                style={{ borderColor: '#FCD116' }}
              >
                <p
                  className="px-2 py-1 font-bold uppercase"
                  style={{ fontSize: '10px', letterSpacing: '1px', color: '#FCD116' }}
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
                      className="flex w-full items-center gap-2 px-2 py-1.5 text-left font-bold uppercase transition-colors hover:bg-[#FCD116]/10"
                      style={{ fontSize: '11px', color: '#FFFFFF', letterSpacing: '1px' }}
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
            className="flex size-7 items-center justify-center border-2 transition-colors"
            style={{ borderColor: '#FCD116', color: '#FCD116' }}
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
            className="flex size-7 items-center justify-center border-2 transition-colors disabled:opacity-50"
            style={{ borderColor: '#FF3B30', color: '#FF3B30' }}
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
      >
        <span
          className="font-bold tabular-nums uppercase"
          style={{
            fontSize: '14px',
            color: isLate ? '#FF3B30' : '#FFFFFF',
            letterSpacing: '1px',
          }}
        >
          {relativeTimeSignaletique(r.createdAt)}
        </span>
      </div>
    </div>
  )
}

/** Ligne placeholder vide — comme un vrai panneau d'affichage */
function PlaceholderRow({ index }: { index: number }) {
  const rowBg = index % 2 === 0 ? '#0A0A0A' : '#111111'
  return (
    <div
      role="row"
      aria-hidden
      className="grid shrink-0 grid-cols-[1fr_1.4fr_0.8fr_1fr_0.6fr]"
      style={{ backgroundColor: rowBg, borderTop: '2px solid #222222' }}
    >
      <div className="px-3 py-2 font-bold uppercase" style={{ fontSize: '14px', color: '#333333' }}>
        · · · · ·
      </div>
      <div className="px-3 py-2 font-bold uppercase" style={{ fontSize: '14px', color: '#333333' }}>
        · · · · · · · ·
      </div>
      <div className="hidden px-3 py-2 sm:block" style={{ color: '#333333' }}>· · ·</div>
      <div className="hidden px-3 py-2 sm:block" style={{ color: '#333333' }}>· · · ·</div>
      <div className="px-3 py-2 text-right" style={{ color: '#333333' }}>· · ·</div>
    </div>
  )
}

/** Ligne SLA par zone — style signalétique compact */
function SlaBottomRow({ zone, sla }: { zone: ZoneAgg; sla?: SlaStats }) {
  if (!sla || sla.targetMinutes === null) {
    return (
      <div
        className="flex items-center gap-2 px-3 py-1.5"
        style={{ border: '2px solid #333333' }}
      >
        <span style={{ fontSize: '14px' }} aria-hidden>{zone.emoji}</span>
        <span
          className="min-w-0 flex-1 truncate font-bold uppercase"
          style={{ fontSize: '11px', color: '#FFFFFF', letterSpacing: '1px' }}
        >
          {zone.nom.toUpperCase()}
        </span>
        <span
          className="font-bold uppercase"
          style={{ fontSize: '11px', color: '#555555', letterSpacing: '1px' }}
        >
          N/A
        </span>
      </div>
    )
  }
  const pct = sla.slaCompliancePercent
  const hasResolutions = sla.resolvedCount > 0
  const pctColor = !hasResolutions
    ? '#555555'
    : pct >= 80
      ? '#34C759'
      : pct >= 60
        ? '#FCD116'
        : '#FF3B30'
  return (
    <div
      className="flex items-center gap-2 px-3 py-1.5"
      style={{ border: '2px solid #333333' }}
    >
      <span style={{ fontSize: '14px' }} aria-hidden>{zone.emoji}</span>
      <span
        className="min-w-0 flex-1 truncate font-bold uppercase"
        style={{ fontSize: '11px', color: '#FFFFFF', letterSpacing: '1px' }}
        title={zone.nom}
      >
        {zone.nom.toUpperCase()}
      </span>
      <span
        className="font-bold tabular-nums"
        style={{ fontSize: '11px', color: '#FCD116' }}
      >
        ≤{sla.targetMinutes}M
      </span>
      <span
        className="w-12 text-right font-black tabular-nums"
        style={{ fontSize: '12px', color: pctColor }}
        title={`MOY RÉSOLUTION: ${sla.avgResolutionMinutes ?? '—'} MIN · RETARDS: ${sla.pendingBreaches}`}
      >
        {hasResolutions ? `${pct}%` : '—'}
      </span>
    </div>
  )
}

/** Ligne charge par zone — barre colorée + count */
function ZoneChargeRow({ zone, max }: { zone: ZoneAgg; max: number }) {
  const pct = max > 0 ? Math.max(2, Math.round((zone.count_en_attente / max) * 100)) : 0
  const barColor =
    zone.count_en_attente > 5
      ? '#FF3B30'
      : zone.count_en_attente > 0
        ? '#FCD116'
        : '#333333'
  return (
    <div
      className="flex items-center gap-2 px-3 py-1.5"
      style={{ border: '2px solid #333333' }}
    >
      <span style={{ fontSize: '14px' }} aria-hidden>{zone.emoji}</span>
      <span
        className="min-w-0 flex-1 truncate font-bold uppercase"
        style={{ fontSize: '11px', color: '#FFFFFF', letterSpacing: '1px' }}
        title={zone.nom}
      >
        {zone.nom.toUpperCase()}
      </span>
      <div
        className="overflow-hidden"
        style={{ width: '96px', height: '8px', backgroundColor: '#000000' }}
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
        className="w-8 text-right font-black tabular-nums"
        style={{ fontSize: '12px', color: '#FFFFFF' }}
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
      className="flex flex-col items-center justify-center gap-1 px-2 py-3"
      style={{ borderRight: '2px solid #333333', borderBottom: '4px solid #333333' }}
    >
      <div className="ops-pulse" style={{ width: '60%', height: '40px', backgroundColor: '#222222' }} />
      <div className="ops-pulse" style={{ width: '40%', height: '14px', backgroundColor: '#222222' }} />
    </div>
  )
}

function RowSkeleton() {
  return (
    <div
      className="grid shrink-0 grid-cols-[1fr_1.4fr_0.8fr_1fr_0.6fr]"
      style={{ backgroundColor: '#0A0A0A', borderTop: '2px solid #222222' }}
    >
      <div className="ops-pulse px-3 py-2" style={{ height: '44px' }} />
      <div className="ops-pulse px-3 py-2" style={{ height: '44px' }} />
      <div className="hidden ops-pulse px-3 py-2 sm:block" style={{ height: '44px' }} />
      <div className="hidden ops-pulse px-3 py-2 sm:block" style={{ height: '44px' }} />
      <div className="ops-pulse px-3 py-2" style={{ height: '44px' }} />
    </div>
  )
}

function MiniRowSkeleton() {
  return <div className="ops-pulse" style={{ height: '32px', backgroundColor: '#222222' }} />
}

/**
 * Feature WB2 #4 — Mode Crise : bouton header + timer.
 * Bouton pulsant rouge "MODE CRISE" (bordure rouge signalétique).
 * Quand actif : timer "DEPUIS HH:MM:SS" + bouton "FIN DE CRISE". */
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
            style={{ fontSize: '10px', letterSpacing: '2px', color: '#FF3B30' }}
          >
            CRISE ACTIVE
          </span>
          <span
            suppressHydrationWarning
            className="font-black tabular-nums"
            style={{ fontSize: '12px', color: '#FFFFFF', letterSpacing: '1px' }}
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
          className="flex items-center gap-1.5 px-3 py-1.5 font-bold uppercase transition-transform hover:scale-105"
          style={{
            backgroundColor: '#34C759',
            color: '#0A0A0A',
            fontSize: '12px',
            letterSpacing: '1px',
            border: '2px solid #34C759',
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
      className="flex items-center gap-1.5 px-3 py-1.5 font-bold uppercase transition-transform hover:scale-105 ops-pulse"
      style={{
        backgroundColor: '#0A0A0A',
        color: '#FF3B30',
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

  // --- État son ---
  const [soundOn, setSoundOn] = useState<boolean>(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const announcedAlertsRef = useRef<Set<string>>(new Set())
  const [showSoundBanner, setShowSoundBanner] = useState<boolean>(false)

  // --- État des alertes (poll 30s) ---
  const [alerts, setAlerts] = useState<TriggeredAlert[]>([])
  const [alertsError, setAlertsError] = useState<string | null>(null)

  // --- Task WB2 — États additionnels ---
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
            // Le wallboard annonce TOUJOURS les nouveaux incidents via speak()
            // directement (pas via decideAndSpeakForWallboard) car l'engine
            // peut supprimer l'annonce à cause de la déduplication avec la
            // PWA staff qui a déjà annoncé le même incident. Le wallboard est
            // une TV dans une salle ops — il DOIT annoncer même si le
            // téléphone du staff l'a déjà fait.
            const team = latest.routedTeam
            const equipeLabel = team ? ` Équipe ${team}.` : ''
            const annonce = latest.isHelpRequest
              ? `Demande d'aide SOS voyageur. ${zoneNom}. ${latest.problemType}. En attente depuis ${tempsMin} minute${tempsMin > 1 ? 's' : ''}.`
              : `Nouvel incident signalé. ${zoneNom}. Type: ${latest.problemType}.${equipeLabel} En attente depuis ${tempsMin} minute${tempsMin > 1 ? 's' : ''}.`
            setTimeout(
              () => speak(annonce, soundOn),
              300,
            )
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
        // silently ignore
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

  const topZone = useMemo<ZoneAgg | null>(() => {
    if (!data?.top_zones || data.top_zones.length === 0) return null
    return data.top_zones[0]
  }, [data])

  const tendance = useMemo<{ dir: 'up' | 'down' | 'flat'; pct: number; label: string }>(() => {
    if (!data) return { dir: 'flat', pct: 0, label: '—' }
    const upCount = data.zones.filter((z) => z.trend === 'up').length
    const downCount = data.zones.filter((z) => z.trend === 'down').length
    if (upCount === 0 && downCount === 0) {
      return { dir: 'flat', pct: 0, label: 'STABLE' }
    }
    if (upCount > downCount) {
      const pct = data.stats.total_24h > 0
        ? Math.round((upCount / Math.max(1, upCount + downCount)) * 100)
        : 0
      return { dir: 'up', pct, label: `↑${pct}%` }
    }
    if (downCount > upCount) {
      const pct = data.stats.total_24h > 0
        ? Math.round((downCount / Math.max(1, upCount + downCount)) * 100)
        : 0
      return { dir: 'down', pct, label: `↓${pct}%` }
    }
    return { dir: 'flat', pct: 0, label: 'STABLE' }
  }, [data])

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

  // --- Signalements actifs pour le panneau d'alertes droit ---
  // Combine alertes seuil + signalements EN_ATTENTE/EN_COURS (max 4)
  const activeReportAlerts = useMemo<RecentReport[]>(() => {
    if (!data) return []
    const nowMs = Date.now()
    return data.recent_reports
      .filter((r) => r.statut !== 'RESOLU' && !r.isHelpRequest)
      .sort((a, b) => {
        // Tri : en retard d'abord, puis par ancienneté
        const aMin = (nowMs - new Date(a.createdAt).getTime()) / 60000
        const bMin = (nowMs - new Date(b.createdAt).getTime()) / 60000
        const aLate = aMin > 15 ? 1 : 0
        const bLate = bMin > 15 ? 1 : 0
        if (bLate !== aLate) return bLate - aLate
        return bMin - aMin
      })
      .slice(0, 4 - topAlerts.length)
  }, [data, topAlerts.length])

  // --- Familles de zones pour la carte ---
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

  // --- Handlers pour les ReportAlertCard (actions rapides) ---
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
          handleActionFeedback(
            `ESCALADE DENISE → ${(r.zone?.nom ?? 'ZONE').toUpperCase()}`,
            'ok',
          )
        } else {
          handleActionFeedback(json?.error ?? 'ÉCHEC ESCALADE', 'err')
        }
      } catch {
        handleActionFeedback('ERREUR RÉSEAU ESCALADE', 'err')
      }
    },
    [handleActionFeedback],
  )

  // SLA accent color pour la KPI tile
  const slaAccent: 'white' | 'green' | 'orange' | 'red' =
    overallSlaPctNum === null
      ? 'white'
      : overallSlaPctNum >= 80
        ? 'green'
        : overallSlaPctNum < 60
          ? 'red'
          : 'orange'

  const enAttenteAccent: 'white' | 'yellow' | 'red' =
    data && data.stats.en_attente > 5
      ? 'red'
      : data && data.stats.en_attente > 0
        ? 'yellow'
        : 'white'

  const untreatedAccent: 'white' | 'red' | 'green' =
    untreatedOver10Min > 0 ? 'red' : 'green'

  const staffAccent: 'white' | 'green' | 'yellow' =
    staffActive.count > 0 ? 'green' : 'yellow'

  return (
    <div
      className={`flex min-h-screen flex-col overflow-x-hidden bg-[#0A0A0A] font-sans text-white ${
        crisisMode ? 'ops-crisis-overlay' : ''
      }`}
    >
      {/* Keyframes globales — signalétique animations */}
      <style>{`
        @keyframes opsPulse { 0%,100%{opacity:1} 50%{opacity:.55} }
        @keyframes opsFlashRed {
          0%,100% { background-color: rgba(255,59,48,0.12); }
          50% { background-color: rgba(255,59,48,0.28); }
        }
        @keyframes opsFadeIn {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes opsPing {
          0% { transform: scale(1); opacity: 1; }
          75%,100% { transform: scale(2); opacity: 0; }
        }
        @keyframes opsLiveBlink {
          0%,100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        .ops-pulse { animation: opsPulse 1.4s ease-in-out infinite; }
        .ops-flash-red { animation: opsFlashRed 1.2s ease-in-out infinite; }
        .ops-fade-in { animation: opsFadeIn 0.5s ease-out; }
        .ops-crisis-overlay { background-color: rgba(255,59,48,0.06); }
        .ops-live-dot {
          position: relative;
          display: inline-block;
        }
        .ops-live-dot::before {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: 9999px;
          background-color: #FF3B30;
          animation: opsPing 1.4s cubic-bezier(0,0,0.2,1) infinite;
        }
        .ops-live-blink { animation: opsLiveBlink 1.4s ease-in-out infinite; }
      `}</style>

      {/* Élément audio caché pour le ding */}
      <audio ref={audioRef} preload="auto" />

      <div className="mx-auto flex w-full max-w-[1920px] flex-1 flex-col overflow-hidden">
        {/* ============================================================
            1. HEADER — barre jaune IATA pleine largeur
            ============================================================ */}
        <header
          className="flex shrink-0 flex-wrap items-center justify-between gap-3 px-4 py-2 sm:px-6"
          style={{
            backgroundColor: '#FCD116',
            color: '#0A0A0A',
            borderBottom: '3px solid #0A0A0A',
          }}
        >
          {/* LEFT — Logo + titre */}
          <div className="flex items-center gap-3">
            <div
              className="flex size-11 items-center justify-center"
              aria-hidden
              style={{ backgroundColor: '#0A0A0A', color: '#FCD116' }}
            >
              <Plane className="size-6" strokeWidth={2.5} />
            </div>
            <div className="flex flex-col leading-tight">
              <h1
                className="font-black uppercase"
                style={{ fontSize: 'clamp(20px, 3vw, 32px)', letterSpacing: '2px' }}
              >
                AÉROPORT OPS
              </h1>
              <span
                className="font-bold uppercase"
                style={{ fontSize: '12px', letterSpacing: '3px', color: '#0A0A0A', opacity: 0.7 }}
              >
                WALLBOARD · DIASS · DÉPARTS
              </span>
            </div>
          </div>

          {/* CENTER — Date + alert count */}
          <div className="hidden flex-col items-center md:flex">
            <div
              className="font-bold uppercase"
              style={{ fontSize: '16px', letterSpacing: '2px', color: '#0A0A0A' }}
            >
              {formatDateFR(now)}
            </div>
            <div
              className="flex items-center gap-1.5 font-bold uppercase"
              style={{ fontSize: '13px', letterSpacing: '2px', color: '#0A0A0A', opacity: 0.75 }}
            >
              {alertsError ? (
                <span>ALERTES: ERREUR</span>
              ) : (
                <>
                  <TriangleAlert className="size-3.5" aria-hidden />
                  <span>{alerts.length} ALERTE(S)</span>
                </>
              )}
            </div>
          </div>

          {/* RIGHT — LIVE + Clock + MODE CRISE + Sound */}
          <div className="flex items-center gap-3">
            {/* LIVE indicator (red, pulsing) */}
            <div
              className="flex items-center gap-1.5 px-2 py-1"
              style={{ backgroundColor: '#0A0A0A' }}
            >
              {error ? (
                <>
                  <span
                    className="ops-live-blink"
                    style={{ width: '8px', height: '8px', borderRadius: '9999px', backgroundColor: '#FF3B30' }}
                    aria-hidden
                  />
                  <span
                    className="font-bold uppercase ops-live-blink"
                    style={{ fontSize: '11px', letterSpacing: '2px', color: '#FF3B30' }}
                  >
                    ERREUR
                  </span>
                </>
              ) : (
                <>
                  <span className="ops-live-dot" style={{ width: '8px', height: '8px' }} aria-hidden />
                  <span className="ops-live-dot" style={{ width: '8px', height: '8px', borderRadius: '9999px', backgroundColor: '#FF3B30' }} aria-hidden />
                  <span
                    className="font-black uppercase"
                    style={{ fontSize: '11px', letterSpacing: '2px', color: '#FF3B30' }}
                  >
                    LIVE
                  </span>
                </>
              )}
            </div>

            {/* Clock (42px tabular-nums) */}
            <div
              className="font-black tabular-nums"
              style={{
                backgroundColor: '#0A0A0A',
                color: '#FCD116',
                fontSize: 'clamp(20px, 4vw, 42px)',
                letterSpacing: '1px',
                padding: '4px 12px',
              }}
              aria-label="Heure courante"
              suppressHydrationWarning
            >
              {formatClock(now)}
            </div>

            {/* MODE CRISE button */}
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
              className="flex items-center gap-1.5 px-3 py-1.5 transition-transform hover:scale-105"
              style={{
                backgroundColor: '#0A0A0A',
                color: soundOn ? '#FCD116' : '#FFFFFF',
                border: '2px solid #0A0A0A',
              }}
            >
              {soundOn ? (
                <>
                  <Volume2 className="size-5" aria-hidden />
                  <span className="font-bold uppercase" style={{ fontSize: '11px', letterSpacing: '2px' }}>
                    ON
                  </span>
                </>
              ) : (
                <>
                  <VolumeX className="size-5" aria-hidden />
                  <span className="font-bold uppercase" style={{ fontSize: '11px', letterSpacing: '2px' }}>
                    OFF
                  </span>
                </>
              )}
            </button>
          </div>
        </header>

        {/* ---------- BANNIÈRE D'ACTIVATION DU SON ---------- */}
        {showSoundBanner && !soundOn && (
          <div
            className="flex shrink-0 items-center justify-between gap-4 px-4 py-3 sm:px-6"
            style={{ backgroundColor: '#FCD116', borderBottom: '2px solid #0A0A0A' }}
          >
            <div className="flex items-center gap-3">
              <span
                className="ops-pulse"
                style={{ width: '12px', height: '12px', borderRadius: '9999px', backgroundColor: '#FF3B30' }}
                aria-hidden
              />
              <div className="flex flex-col">
                <p className="font-black uppercase" style={{ fontSize: '14px', letterSpacing: '1px', color: '#0A0A0A' }}>
                  ACTIVEZ LE SON POUR LES ALERTES VOCALES
                </p>
                <p className="font-bold" style={{ fontSize: '11px', color: '#0A0A0A', opacity: 0.75 }}>
                  DING + ANNONCES VOCALES À CHAQUE NOUVEAU SIGNALEMENT
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={toggleSound}
                className="flex items-center gap-1.5 px-4 py-2 font-black uppercase transition-transform hover:scale-105"
                style={{ backgroundColor: '#0A0A0A', color: '#FCD116', fontSize: '13px', letterSpacing: '2px' }}
              >
                <Volume2 className="size-4" aria-hidden />
                ACTIVER LE SON
              </button>
              <button
                type="button"
                onClick={() => setShowSoundBanner(false)}
                aria-label="Fermer la bannière"
                className="flex items-center justify-center px-2.5 py-2 font-black"
                style={{ border: '2px solid #0A0A0A', color: '#0A0A0A' }}
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
            style={{ backgroundColor: '#34C759', borderBottom: '2px solid #0A0A0A' }}
          >
            <ShieldAlert className="size-4" style={{ color: '#0A0A0A' }} aria-hidden />
            <p className="font-black uppercase" style={{ fontSize: '14px', letterSpacing: '2px', color: '#0A0A0A' }}>
              {crisisSummary}
            </p>
          </div>
        )}

        {/* ---------- Bandeau crise active ---------- */}
        {crisisMode && (
          <div
            role="alert"
            className="flex shrink-0 items-center justify-between gap-3 px-4 py-2 sm:px-6"
            style={{ backgroundColor: '#FF3B30', borderBottom: '2px solid #0A0A0A' }}
          >
            <div className="flex items-center gap-2">
              <ShieldAlert className="size-4 ops-pulse" style={{ color: '#FFFFFF' }} aria-hidden />
              <span
                className="font-black uppercase"
                style={{ fontSize: '12px', letterSpacing: '2px', color: '#FFFFFF' }}
              >
                MODE CRISE — BOARD FILTRÉ AUX INCIDENTS CRITIQUES UNIQUEMENT
              </span>
            </div>
            {activeFilterLabel && (
              <span
                className="font-bold uppercase"
                style={{ fontSize: '11px', letterSpacing: '2px', color: '#FFFFFF' }}
              >
                {activeFilterLabel}
              </span>
            )}
          </div>
        )}

        {/* ============================================================
            2. KPI ROW — 6 tuiles géantes signalétique
            ============================================================ */}
        <section
          aria-label="KPI temps réel"
          className="grid shrink-0 grid-cols-3 lg:grid-cols-6"
          style={{ borderBottom: '3px solid #FCD116' }}
        >
          {data ? (
            <>
              <KpiTile label="CRITIQUE" value={untreatedOver10Min} accent={untreatedAccent} />
              <KpiTile label="EN ATTENTE" value={data.stats.en_attente} accent={enAttenteAccent} />
              <KpiTile label="RÉSOLUS" value={data.stats.resolus_24h} accent="green" />
              <KpiTile
                label="TEMPS MOY."
                value={formatDurationMin(data.stats.avg_resolution_minutes)}
                accent="yellow"
              />
              <KpiTile label="SLA" value={overallSlaPct} accent={slaAccent} />
              <KpiTile
                label="STAFF"
                value={`${staffActive.count}/${staffActive.total}`}
                accent={staffAccent}
              />
            </>
          ) : (
            Array.from({ length: 6 }).map((_, i) => <KpiSkeleton key={i} />)
          )}
        </section>

        {/* ============================================================
            3. MAIN GRID — 2 colonnes : Carte zones (2fr) + Alertes (1fr)
            ============================================================ */}
        <section
          aria-label="Carte zones et alertes actives"
          className="grid shrink-0 grid-cols-1 gap-0 lg:grid-cols-[2fr_1fr]"
        >
          {/* ---------- LEFT — Carte des zones (signalétique) ---------- */}
          <div
            className="flex flex-col gap-2 p-3"
            style={{ borderRight: '3px solid #222222' }}
          >
            <div className="flex items-center justify-between gap-2">
              <h2
                className="flex items-center gap-2 font-black uppercase"
                style={{ fontSize: '16px', letterSpacing: '4px', color: '#FCD116' }}
              >
                <MapIcon className="size-4" aria-hidden />
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
                    color: '#0A0A0A',
                    backgroundColor: '#FCD116',
                    padding: '4px 8px',
                    border: '2px solid #FCD116',
                  }}
                >
                  ✕ FILTRE: {filterZone.toUpperCase()}
                </button>
              )}
            </div>

            {/* Familles de zones */}
            <div className="flex flex-col gap-3">
              {families.map((fam) => {
                const famZones = zonesByFamily[fam] ?? []
                if (famZones.length === 0) return null
                return (
                  <div key={fam} className="flex flex-col gap-1.5">
                    <div
                      className="flex items-center gap-2 font-black uppercase"
                      style={{
                        fontSize: '13px',
                        letterSpacing: '4px',
                        color: '#FCD116',
                        borderBottom: '2px solid #333333',
                        paddingBottom: '4px',
                      }}
                    >
                      <span style={{ color: '#FCD116' }} aria-hidden>▶</span>
                      {fam}
                    </div>
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-6">
                      {famZones.map((z) => (
                        <ZoneTile
                          key={z.code}
                          zone={z}
                          isActive={filterZone === z.code}
                          onClick={() =>
                            setFilterZone(filterZone === z.code ? null : z.code)
                          }
                        />
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Mini info bars — Top zone critique + Tendance + Top performer */}
            {data && (
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                <div
                  className="flex items-center gap-2 px-2 py-1.5"
                  style={{ border: '2px solid #333333', borderLeft: '4px solid #FF9500' }}
                >
                  <AlertTriangle className="size-3.5 shrink-0" style={{ color: '#FF9500' }} aria-hidden />
                  <span
                    className="shrink-0 font-bold uppercase"
                    style={{ fontSize: '10px', letterSpacing: '1px', color: '#FF9500' }}
                  >
                    ZONE CRITIQUE
                  </span>
                  <span
                    className="min-w-0 flex-1 truncate font-bold uppercase"
                    style={{ fontSize: '11px', color: '#FFFFFF', letterSpacing: '1px' }}
                  >
                    {topZone ? `${topZone.emoji} ${topZone.nom.toUpperCase()}` : 'AUCUNE'}
                  </span>
                  {topZone && (
                    <span className="font-black tabular-nums" style={{ fontSize: '12px', color: '#FCD116' }}>
                      {topZone.count_24h}
                    </span>
                  )}
                </div>
                <div
                  className="flex items-center gap-2 px-2 py-1.5"
                  style={{
                    border: '2px solid #333333',
                    borderLeft: `4px solid ${
                      tendance.dir === 'up' ? '#FF9500' : tendance.dir === 'down' ? '#34C759' : '#999999'
                    }`,
                  }}
                >
                  {tendance.dir === 'up' ? (
                    <TrendingUp className="size-3.5 shrink-0" style={{ color: '#FF9500' }} aria-hidden />
                  ) : tendance.dir === 'down' ? (
                    <TrendingDown className="size-3.5 shrink-0" style={{ color: '#34C759' }} aria-hidden />
                  ) : (
                    <Activity className="size-3.5 shrink-0" style={{ color: '#999999' }} aria-hidden />
                  )}
                  <span
                    className="shrink-0 font-bold uppercase"
                    style={{
                      fontSize: '10px',
                      letterSpacing: '1px',
                      color: tendance.dir === 'up' ? '#FF9500' : tendance.dir === 'down' ? '#34C759' : '#999999',
                    }}
                  >
                    TENDANCE 24H
                  </span>
                  <span
                    className="ml-auto font-black uppercase"
                    style={{ fontSize: '13px', color: '#FFFFFF', letterSpacing: '1px' }}
                  >
                    {tendance.label}
                  </span>
                </div>
                <div
                  className="flex items-center gap-2 px-2 py-1.5"
                  style={{ border: '2px solid #333333', borderLeft: '4px solid #34C759' }}
                >
                  <Trophy className="size-3.5 shrink-0" style={{ color: '#34C759' }} aria-hidden />
                  <span
                    className="shrink-0 font-bold uppercase"
                    style={{ fontSize: '10px', letterSpacing: '1px', color: '#34C759' }}
                  >
                    TOP PERFORMER
                  </span>
                  <span
                    className="min-w-0 flex-1 truncate font-bold uppercase"
                    style={{ fontSize: '11px', color: '#FFFFFF', letterSpacing: '1px' }}
                  >
                    {leaderboard && leaderboard.leaderboard[0]
                      ? leaderboard.leaderboard[0].staffName.toUpperCase()
                      : 'AUCUN CLASSEMENT'}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* ---------- RIGHT — Panneau Alertes Actives ---------- */}
          <div className="flex flex-col gap-2 p-3" style={{ backgroundColor: '#080808' }}>
            <h2
              className="font-black uppercase"
              style={{
                fontSize: '16px',
                letterSpacing: '4px',
                color: '#FCD116',
                borderBottom: '3px solid #FCD116',
                paddingBottom: '4px',
              }}
            >
              ALERTES ACTIVES
            </h2>
            <div className="flex max-h-[420px] flex-col gap-2 overflow-y-auto pr-1 lg:max-h-[520px]">
              {/* Alertes seuil (de /api/airport/alerts/check) */}
              {topAlerts.map((a, idx) => (
                <AlertCard key={`alert-${a.thresholdId}-${a.zoneCode}-${idx}`} alert={a} />
              ))}
              {/* Issue 1 — SOS : demandes d'aide voyageur actives */}
              {data?.help_requests?.slice(0, 3).map((h) => (
                <HelpRequestAlertCard key={`help-${h.id}`} h={h} />
              ))}
              {/* Alertes basées sur les signalements EN_ATTENTE/EN_COURS */}
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
              {topAlerts.length === 0 && activeReportAlerts.length === 0 && (data?.help_requests?.length ?? 0) === 0 && (
                <div
                  className="flex items-center justify-center px-3 py-8"
                  style={{ border: '2px solid #333333' }}
                >
                  <p
                    className="font-bold uppercase"
                    style={{ fontSize: '13px', letterSpacing: '2px', color: '#34C759' }}
                  >
                    AUCUNE ALERTE ACTIVE
                  </p>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* ============================================================
            4. INCIDENTS TABLE — style panneau d'affichage
            ============================================================ */}
        <main
          aria-label="Derniers signalements"
          className="relative flex min-h-0 flex-1 flex-col"
          style={{ borderTop: '3px solid #FCD116' }}
        >
          {/* En-tête table */}
          <div
            role="row"
            className="grid grid-cols-[1fr_1.4fr_0.8fr_1fr_0.6fr]"
            style={{ backgroundColor: '#FCD116' }}
          >
            <div
              className="px-3 py-2 font-black uppercase"
              style={{ fontSize: '13px', letterSpacing: '2px', color: '#0A0A0A' }}
            >
              ZONE
            </div>
            <div
              className="px-3 py-2 font-black uppercase"
              style={{ fontSize: '13px', letterSpacing: '2px', color: '#0A0A0A' }}
            >
              PROBLÈME
            </div>
            <div
              className="hidden px-3 py-2 font-black uppercase sm:block"
              style={{ fontSize: '13px', letterSpacing: '2px', color: '#0A0A0A' }}
            >
              STATUT
            </div>
            <div
              className="hidden px-3 py-2 font-black uppercase sm:block"
              style={{ fontSize: '13px', letterSpacing: '2px', color: '#0A0A0A' }}
            >
              ÉQUIPE
            </div>
            <div
              className="px-3 py-2 text-right font-black uppercase"
              style={{ fontSize: '13px', letterSpacing: '2px', color: '#0A0A0A' }}
            >
              IL Y A
            </div>
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
                <div
                  className="flex flex-1 items-center justify-center px-6 py-12"
                  style={{ backgroundColor: '#0A0A0A' }}
                >
                  <p
                    className="font-bold uppercase"
                    style={{ fontSize: '15px', letterSpacing: '2px', color: '#999999' }}
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
              className="pointer-events-none absolute left-1/2 top-2 z-30 -translate-x-1/2 px-4 py-2 font-black uppercase shadow-lg"
              style={{
                fontSize: '12px',
                letterSpacing: '2px',
                border: '2px solid',
                borderColor: actionToast.kind === 'ok' ? '#34C759' : '#FF3B30',
                backgroundColor: actionToast.kind === 'ok' ? '#0A0A0A' : '#0A0A0A',
                color: actionToast.kind === 'ok' ? '#34C759' : '#FF3B30',
              }}
            >
              {actionToast.msg}
            </div>
          )}
        </main>

        {/* ============================================================
            5. PREDICTION RADAR (signalétique styled wrapper)
            ============================================================ */}
        <section
          aria-label="Radar prédiction des pics de plaintes"
          className="flex shrink-0 flex-col gap-1.5 p-3"
          style={{ borderTop: '3px solid #FCD116' }}
        >
          <h2
            className="flex items-center gap-2 font-black uppercase"
            style={{ fontSize: '14px', letterSpacing: '4px', color: '#FCD116' }}
          >
            <span aria-hidden>🔮</span>
            RADAR PRÉDICTION — ÇA VA PÉTER DANS 20 MIN ?
          </h2>
          <AirportPredictionRadar
            className="w-full"
          />
        </section>

        {/* ============================================================
            6. BOTTOM STRIP — SLA par zone + Charge par zone
            ============================================================ */}
        <footer
          aria-label="Synthèse SLA et charge par zone"
          className="grid shrink-0 grid-cols-1 gap-0 lg:grid-cols-2"
          style={{ borderTop: '3px solid #FCD116' }}
        >
          <section className="flex flex-col gap-1.5 p-3" style={{ borderRight: '3px solid #222222' }}>
            <h2
              className="font-black uppercase"
              style={{ fontSize: '13px', letterSpacing: '4px', color: '#FCD116' }}
            >
              SLA PAR ZONE
            </h2>
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {data ? (
                data.zones.slice(0, 6).map((z) => (
                  <SlaBottomRow key={`sla-${z.code}`} zone={z} sla={data.sla?.[z.code]} />
                ))
              ) : (
                Array.from({ length: 6 }).map((_, i) => <MiniRowSkeleton key={i} />)
              )}
            </div>
          </section>

          <section className="flex flex-col gap-1.5 p-3">
            <h2
              className="font-black uppercase"
              style={{ fontSize: '13px', letterSpacing: '4px', color: '#FCD116' }}
            >
              CHARGE PAR ZONE · EN ATTENTE
            </h2>
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {data ? (
                data.zones.slice(0, 6).map((z) => (
                  <ZoneChargeRow key={`chg-${z.code}`} zone={z} max={maxEnAttente} />
                ))
              ) : (
                Array.from({ length: 6 }).map((_, i) => <MiniRowSkeleton key={i} />)
              )}
            </div>
          </section>
        </footer>

        {/* ============================================================
            7. LEGEND BAR — barre de légende statuts + rappel filtre
            ============================================================ */}
        <div
          className="flex shrink-0 flex-wrap items-center justify-center gap-x-6 gap-y-1 px-4 py-2"
          style={{ backgroundColor: '#0A0A0A', borderTop: '2px solid #FCD116' }}
        >
          <span className="flex items-center gap-1.5 font-bold uppercase" style={{ fontSize: '12px', letterSpacing: '2px', color: '#34C759' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '9999px', backgroundColor: '#34C759' }} aria-hidden />
            CALME (0)
          </span>
          <span className="flex items-center gap-1.5 font-bold uppercase" style={{ fontSize: '12px', letterSpacing: '2px', color: '#FCD116' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '9999px', backgroundColor: '#FCD116' }} aria-hidden />
            ATTENTION (1-2)
          </span>
          <span className="flex items-center gap-1.5 font-bold uppercase" style={{ fontSize: '12px', letterSpacing: '2px', color: '#FF3B30' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '9999px', backgroundColor: '#FF3B30' }} aria-hidden />
            CRITIQUE (3+)
          </span>
          <span className="ml-auto font-bold uppercase" style={{ fontSize: '11px', letterSpacing: '2px', color: '#999999' }}>
            CLIC SUR UNE ZONE POUR FILTRER · {data?.stats.total_24h ?? 0} TOTAL 24H
          </span>
        </div>
      </div>
    </div>
  )
}
