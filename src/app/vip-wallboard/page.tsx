// ============================================================
// Page /vip-wallboard — Wallboard Salon VIP "Luxe Lumineux"
// ------------------------------------------------------------
// Affichage TV plein écran pour la salle de supervision du salon
// VIP (ops room). Palette chaude "Luxe Lumineux" :
//   - Background   #FAFAF7 (warm off-white)
//   - Header       #2C2C2C (anthracite) + accent or #C9A961
//   - Cards        #FFFFFF (white) + shadow rgba(201,169,97,0.06)
//   - Accent gold  #C9A961
//   - Accent bronze #8B6F47
//   - Text         #2C2C2C
//   - Success      #4A7C59 (sage green)
//   - Alert        #C97B63 (terracotta)
//   - VIP badge    #6B4C9A (amethyst)
//   - Border       #EAE5DC
//   - Title font   Georgia, "Playfair Display", serif
//
// API : GET /api/vip/wallboard toutes les 5 secondes.
// Horloge : 1 seconde.
//
// Sons & TTS :
//   - Nouveau signalement     → ding (880 Hz) + Denise parle.
//   - Signalement résolu      → resolved (660 Hz) + Denise parle.
//   - Retard ≥ 10 min         → escalation (990/880/990 Hz) + Denise,
//     puis rappel toutes les 5 min tant que non résolu.
//   - Toggle son persisté en localStorage "vip_wallboard_sound".
//   - Sons synthétisés via Web Audio API (aucun fichier externe).
// ============================================================

'use client'

// Force dynamic rendering — empêche Next.js de mettre en cache la
// page côté CDN (sinon une version périmée serait servie en HIT).
export const dynamic = 'force-dynamic'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Volume2,
  VolumeX,
  Plane,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Megaphone,
  Armchair,
  MapPin,
  Star,
  TrendingUp,
  Loader2,
  Sun,
  Moon,
} from 'lucide-react'
import { parler } from '@/lib/staff-tts'
import { cn } from '@/lib/utils'

// ============================================================
// Types — match exact du contrat /api/vip/wallboard
// ============================================================

type WallboardData = {
  kpis: {
    total_today: number
    pending: number
    in_progress: number
    resolved_today: number
    avg_resolution_min: number
    tables_occupied: number
    tables_total: number
    satisfaction_score: number
  }
  active_incidents: Array<{
    id: string
    trackingNumber: string | null
    type: string
    typeLabel: string
    message: string | null
    status: string
    tableNumber: string
    tableZone: string
    zoneLabel: string
    createdAt: string
    elapsedMin: number
    isLate: boolean
  }>
  recently_resolved: Array<{
    id: string
    trackingNumber: string | null
    type: string
    typeLabel: string
    tableNumber: string
    resolvedAt: string
    resolvedMinAgo: number
  }>
  tables: Array<{
    id: string
    tableNumber: string
    zone: string
    zoneLabel: string
    seats: number
    status: string
    clientName: string | null
    clientVipLevel: string | null
    activeRequests: number
  }>
}

// ============================================================
// Constantes — palette "Luxe Lumineux"
// ============================================================

const COLORS = {
  bg: '#FAFAF7',
  header: '#2C2C2C',
  card: '#FFFFFF',
  gold: '#C9A961',
  bronze: '#8B6F47',
  text: '#2C2C2C',
  success: '#4A7C59',
  alert: '#C97B63',
  vip: '#6B4C9A',
  border: '#EAE5DC',
} as const

// Palette mode sombre (pour affichage TV en salle ops sombre)
const COLORS_DARK = {
  bg: '#0F0F0F',
  header: '#000000',
  card: '#1A1A1A',
  gold: '#C9A961',
  bronze: '#8B6F47',
  text: '#FAFAF7',
  success: '#4A7C59',
  alert: '#C97B63',
  vip: '#9B7BC9',
  border: '#333333',
} as const

const LATE_THRESHOLD_MIN = 10
const REMINDER_INTERVAL_MIN = 5
const POLL_INTERVAL_MS = 5000
const CLOCK_INTERVAL_MS = 1000

const SOUND_STORAGE_KEY = 'vip_wallboard_sound'
const DARK_MODE_STORAGE_KEY = 'vip_wallboard_dark'

// Ordre d'affichage des zones dans le plan du salon.
const ZONE_ORDER = ['main', 'buffet', 'relaxation', 'meeting'] as const

const ZONE_EMOJI: Record<string, string> = {
  main: '🪑',
  buffet: '🍽️',
  relaxation: '🛋️',
  meeting: '💼',
}

// ============================================================
// Helpers — sons (Web Audio API, sans fichier externe)
// ============================================================

/**
 * Crée (ou réutilise) un AudioContext navigable sur Safari (webkit).
 * Retourne null si Web Audio n'est pas disponible.
 */
function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext
  if (!Ctor) return null
  try {
    const ctx = new Ctor()
    if (ctx.state === 'suspended') void ctx.resume().catch(() => {})
    return ctx
  } catch {
    return null
  }
}

/**
 * Émet un ton simple à `freq` Hz pendant `duration` secondes avec
 * un fade-out exponentiel. Ferme le contexte après le son.
 */
function playTone(freq: number, duration: number, peak = 0.3): void {
  const ctx = getAudioContext()
  if (!ctx) return
  try {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.frequency.value = freq
    osc.type = 'sine'
    gain.gain.setValueAtTime(peak, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration)
    osc.start()
    osc.stop(ctx.currentTime + duration)
    setTimeout(() => ctx.close().catch(() => {}), (duration + 0.2) * 1000)
  } catch {
    // Web Audio indisponible — silencieux
  }
}

/** Ding nouveau signalement : 880 Hz, 0.3 s. */
function playDing(): void {
  playTone(880, 0.3, 0.3)
}

/** Son résolution : 660 Hz, 0.4 s. */
function playResolved(): void {
  playTone(660, 0.4, 0.3)
}

/**
 * Son d'escalade retard : 3 bips successifs (990 / 880 / 990 Hz).
 * Chaque bip dure 0.18 s, espacés de 0.18 s.
 */
function playEscalation(): void {
  const ctx = getAudioContext()
  if (!ctx) {
    // Fallback : un seul ton si Web Audio ne permet pas de séquencer.
    playTone(990, 0.3, 0.3)
    return
  }
  try {
    const tones = [990, 880, 990]
    tones.forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      const startTime = ctx.currentTime + i * 0.22
      gain.gain.setValueAtTime(0, startTime)
      gain.gain.linearRampToValueAtTime(0.3, startTime + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.01, startTime + 0.18)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(startTime)
      osc.stop(startTime + 0.2)
    })
    setTimeout(() => ctx.close().catch(() => {}), 1200)
  } catch {
    // silencieux
  }
}

// ============================================================
// Helpers — formatage
// ============================================================

/** Padd à 2 chiffres. */
function pad2(n: number): string {
  return n.toString().padStart(2, '0')
}

/** "HH:MM" depuis Date. */
function formatClock(d: Date): string {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

/** "HH:MM:SS" depuis Date (pour le footer live). */
function formatClockSec(d: Date): string {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`
}

/** Date longue française : "lundi 5 janvier 2026". */
function formatDateLong(d: Date): string {
  try {
    return d.toLocaleDateString('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
  } catch {
    return d.toDateString()
  }
}

/** "il y a 3 min" / "à l'instant" / "il y a 1 h 05". */
function formatRelativeMin(min: number): string {
  if (min <= 0) return 'à l\'instant'
  if (min < 60) return `il y a ${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return `il y a ${h} h ${pad2(m)}`
}

// ============================================================
// Sous-composants — KPI cards
// ============================================================

/**
 * Carte KPI colorée pour la row supérieure. Affiche une valeur
 * (gros chiffre) + label + optionnel badge/bonus info.
 */
function KpiCard({
  label,
  value,
  sub,
  bg,
  fg,
  badge,
}: {
  label: string
  value: string | number
  sub?: React.ReactNode
  bg: string
  fg: string
  badge?: React.ReactNode
}) {
  return (
    <div
      className="relative flex flex-col justify-between rounded-2xl px-4 py-4"
      style={{
        backgroundColor: bg,
        color: fg,
        minHeight: 128,
        boxShadow: '0 4px 20px rgba(201,169,97,0.10)',
      }}
    >
      {badge ? <div className="absolute right-3 top-3">{badge}</div> : null}
      <div
        className="font-black leading-none tabular-nums"
        style={{
          fontFamily: 'Georgia, "Playfair Display", serif',
          // V3 : les valeurs longues (« 1h 23min », « 0/12 »…) rétrécissent
          // pour ne jamais déborder de la carte sur les écrans denses.
          fontSize:
            typeof value === 'string' && value.length > 5
              ? 'clamp(20px, 2.2vw, 34px)'
              : 'clamp(28px, 3vw, 44px)',
        }}
        suppressHydrationWarning
      >
        {value}
      </div>
      <div className="mt-2">
        <div
          className="font-bold uppercase"
          style={{ fontSize: 11, letterSpacing: 2 }}
        >
          {label}
        </div>
        {sub ? (
          <div className="mt-1 opacity-80" style={{ fontSize: 11 }}>
            {sub}
          </div>
        ) : null}
      </div>
    </div>
  )
}

// ============================================================
// Sous-composants — Table card (plan du salon)
// ============================================================

/**
 * Carte d'une table du salon. Affiche le n° de table, le statut
 * couleur, le nom du client si occupée, et un badge du nombre de
 * demandes actives si > 0. Clic désactivé (wallboard = display only).
 */
function TableCard({ t, darkMode }: { t: WallboardData['tables'][number]; darkMode: boolean }) {
  const C = darkMode ? COLORS_DARK : COLORS
  const statusColor =
    t.status === 'free'
      ? C.success
      : t.status === 'occupied'
        ? C.vip
        : t.status === 'problem'
          ? C.alert
          : t.status === 'reserved'
            ? C.gold
            : '#999999'
  const statusLabel =
    t.status === 'free'
      ? 'Libre'
      : t.status === 'occupied'
        ? 'Occupée'
        : t.status === 'problem'
          ? 'Problème'
          : t.status === 'reserved'
            ? 'Réservée'
            : t.status

  return (
    <div
      className="relative flex flex-col rounded-xl border bg-white p-3"
      style={{
        borderColor: C.border,
        boxShadow: '0 2px 10px rgba(201,169,97,0.06)',
        minHeight: 96,
      }}
    >
      {/* Liseré couleur statut à gauche */}
      <div
        className="absolute left-0 top-0 h-full w-1.5 rounded-l-xl"
        style={{ backgroundColor: statusColor }}
      />

      {/* Numéro table + nb places */}
      <div className="flex items-center justify-between pl-2">
        <span
          className="font-black"
          style={{ fontSize: 18, color: C.text }}
        >
          {t.tableNumber}
        </span>
        <span
          className="flex items-center gap-1 text-xs"
          style={{ color: '#8a8170' }}
          title={`${t.seats} places`}
        >
          <Armchair size={12} />
          {t.seats}
        </span>
      </div>

      {/* Statut */}
      <div className="mt-1 pl-2">
        <span
          className="inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase"
          style={{
            backgroundColor: statusColor + '22',
            color: statusColor,
            letterSpacing: 1,
          }}
        >
          {statusLabel}
        </span>
      </div>

      {/* Client (si occupée) */}
      {t.status === 'occupied' && t.clientName ? (
        <div
          className="mt-2 truncate pl-2"
          style={{ fontSize: 11, color: C.text }}
          title={t.clientName}
        >
          <span style={{ color: C.gold }}>★ </span>
          {t.clientName}
          {t.clientVipLevel ? (
            <span
              className="ml-1 rounded px-1 py-px text-[9px] font-bold uppercase"
              style={{
                backgroundColor: C.vip + '22',
                color: C.vip,
              }}
            >
              {t.clientVipLevel}
            </span>
          ) : null}
        </div>
      ) : null}

      {/* Badge demandes actives */}
      {t.activeRequests > 0 ? (
        <div className="absolute -right-1.5 -top-1.5 flex h-6 min-w-[24px] items-center justify-center rounded-full px-1.5 text-[11px] font-black text-white shadow-md"
          style={{ backgroundColor: C.alert }}
        >
          {t.activeRequests}
        </div>
      ) : null}
    </div>
  )
}

// ============================================================
// Sous-composants — Alert card (panneau de droite)
// ============================================================

/**
 * Carte d'alerte pour une demande active. Bordure rouge si type
 * "problem", bordure or sinon. Bordure rouge clignotante si
 * isLate (animation CSS via tailwind animate-pulse appliquée
 * sur une sur-couche).
 */
function AlertCard({
  incident,
  darkMode,
}: {
  incident: WallboardData['active_incidents'][number]
  darkMode: boolean
}) {
  const C = darkMode ? COLORS_DARK : COLORS
  const isProblem = incident.type === 'problem'
  const borderColor = incident.isLate
    ? C.alert
    : isProblem
      ? C.alert
      : C.gold
  const bgTint = isProblem ? C.alert + '0A' : C.gold + '0A'

  return (
    <div
      className={cn(
        'relative rounded-xl border-2 bg-white p-3',
        incident.isLate && 'animate-pulse',
      )}
      style={{
        borderColor,
        backgroundColor: bgTint,
        boxShadow: incident.isLate
          ? '0 0 0 3px rgba(201,123,99,0.15), 0 4px 14px rgba(201,123,99,0.18)'
          : '0 2px 10px rgba(201,169,97,0.06)',
      }}
    >
      {/* Top : zone + tracking + retard badge */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <MapPin size={12} style={{ color: C.bronze }} />
          <span
            className="truncate text-[11px] font-bold uppercase"
            style={{ color: C.bronze, letterSpacing: 1 }}
          >
            {incident.zoneLabel || incident.tableZone || '—'}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {incident.isLate ? (
            <span
              className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-black uppercase text-white"
              style={{ backgroundColor: C.alert, letterSpacing: 1 }}
            >
              <AlertTriangle size={10} />
              En retard
            </span>
          ) : null}
          {incident.trackingNumber ? (
            <span
              className="rounded px-1.5 py-0.5 text-[10px] font-mono"
              style={{
                backgroundColor: '#F5F0E5',
                color: C.text,
              }}
            >
              {incident.trackingNumber}
            </span>
          ) : null}
        </div>
      </div>

      {/* Middle : type + message */}
      <div className="mt-2">
        <div
          className="text-[13px] font-bold"
          style={{ color: C.text }}
        >
          {incident.typeLabel}
        </div>
        {incident.message ? (
          <div
            className="mt-0.5 text-[13px]"
            style={{ color: '#555550' }}
          >
            « {incident.message} »
          </div>
        ) : null}
      </div>

      {/* Bottom : il y a X min + table */}
      <div className="mt-2 flex items-center justify-between text-[11px]"
        style={{ color: '#8a8170' }}
      >
        <span className="flex items-center gap-1">
          <Clock size={11} />
          {formatRelativeMin(incident.elapsedMin)}
        </span>
        <span className="font-bold" style={{ color: C.text }}>
          {incident.tableNumber || '—'}
        </span>
      </div>
    </div>
  )
}

// ============================================================
// Sous-composants — Resolved card (section basse)
// ============================================================

function ResolvedCard({
  r,
  darkMode,
}: {
  r: WallboardData['recently_resolved'][number]
  darkMode: boolean
}) {
  const C = darkMode ? COLORS_DARK : COLORS
  return (
    <div
      className="flex min-w-[220px] flex-col rounded-xl border p-3"
      style={{
        backgroundColor: C.card,
        borderColor: C.border,
        boxShadow: '0 2px 10px rgba(74,124,89,0.08)',
      }}
    >
      <div className="flex items-center gap-1.5">
        <CheckCircle2 size={14} style={{ color: C.success }} />
        <span
          className="text-[11px] font-bold uppercase"
          style={{ color: C.success, letterSpacing: 1 }}
        >
          Résolu
        </span>
      </div>
      <div
        className="mt-1.5 font-mono text-[12px] font-bold"
        style={{ color: C.text }}
      >
        {r.trackingNumber || r.id.slice(0, 8)}
      </div>
      <div className="mt-1 text-[12px]" style={{ color: C.text }}>
        {r.typeLabel}
      </div>
      <div
        className="mt-1.5 flex items-center justify-between text-[11px]"
        style={{ color: '#8a8170' }}
      >
        <span className="font-bold" style={{ color: C.bronze }}>
          {r.tableNumber || '—'}
        </span>
        <span>résolu {formatRelativeMin(r.resolvedMinAgo)}</span>
      </div>
    </div>
  )
}

// ============================================================
// Page principale
// ============================================================

export default function VipWallboardPage() {
  const [data, setData] = useState<WallboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [now, setNow] = useState<Date>(() => new Date())
  // --- V3 DIAGNOSTIC — même bug que le wallboard ops corrigé ---
  // ANCIEN BUG : soundOn démarrait à FALSE et exigeait un clic sur une
  // bannière de 15 s → aucun annonce de nouveau signalement ni de
  // résolution ne sortait, seuls les rappels « EN RETARD » (visuels)
  // semblaient fonctionner. FIX : son ACTIVÉ PAR DÉFAUT (préférence
  // persistée), et déverrouillage audio au premier geste.
  const [soundOn, setSoundOn] = useState(true)
  const [darkMode, setDarkMode] = useState(false)
  const [showSoundBanner, setShowSoundBanner] = useState(false)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
  const [error, setError] = useState<string | null>(null)
  const audioUnlockedRef = useRef<boolean>(false)

  // Palette active selon le mode sombre/clair
  const C = darkMode ? COLORS_DARK : COLORS

  // --- Refs pour la déduplication des annonces ---
  // seenIdsRef : IDs des incidents déjà vus (évite de réannoncer au
  // premier poll ceux qui existent déjà côté serveur).
  const seenIdsRef = useRef<Set<string>>(new Set())
  // announcedResolvedRef : IDs des résolutions déjà annoncées.
  const announcedResolvedRef = useRef<Set<string>>(new Set())
  // alertedLateRef : clés `${id}-${min}min` déjà alertées (10/15/20…).
  const alertedLateRef = useRef<Set<string>>(new Set())
  // firstPollRef : true tant qu'aucun poll n'a réussi (skip des annonces).
  const firstPollRef = useRef(true)

  // ---------------------------------------------------------------
  // Polling — /api/vip/wallboard toutes les 5 s
  // ---------------------------------------------------------------
  const poll = useCallback(async () => {
    try {
      const res = await fetch('/api/vip/wallboard', { cache: 'no-store' })
      if (!res.ok) {
        setError('Erreur réseau — impossible de contacter le serveur.')
        return
      }
      const json = (await res.json()) as { ok?: boolean; data?: WallboardData }
      if (!json?.ok || !json.data) {
        setError('Réponse invalide du serveur.')
        return
      }
      setError(null)
      const fresh = json.data
      setData(fresh)
      setLastUpdate(new Date())

      const isFirst = firstPollRef.current
      firstPollRef.current = false

      // --- Détection nouveaux incidents ---
      // On ignore les incidents déjà présents au premier poll (sinon on
      // déclencherait un ding à l'ouverture du wallboard sur un salon
      // déjà actif).
      const freshIds = new Set(fresh.active_incidents.map((i) => i.id))
      const newIncidents = isFirst
        ? []
        : fresh.active_incidents.filter((i) => !seenIdsRef.current.has(i.id))

      for (const inc of newIncidents) {
        if (soundOn) {
          playDing()
          setTimeout(
            () =>
              parler(
                `Nouveau signalement. Table ${inc.tableNumber || 'inconnue'}. ${inc.typeLabel}.`,
              ),
            250,
          )
        }
      }

      // --- Détection résolutions récentes ---
      // Même logique : on n'annonce rien au premier poll (les résolutions
      // antérieures à l'ouverture du wallboard ne nous intéressent pas).
      const newResolved = isFirst
        ? []
        : fresh.recently_resolved.filter(
            (r) => !announcedResolvedRef.current.has(r.id),
          )

      for (const r of newResolved) {
        if (soundOn) {
          playResolved()
          setTimeout(
            () =>
              parler(
                `Signalement résolu. Table ${r.tableNumber || 'inconnue'}.`,
              ),
            250,
          )
        }
      }

      // --- Mise à jour des sets de déduplication ---
      // On ajoute les nouveaux IDs aux sets vus, et on retire des sets
      // les IDs qui ne sont plus dans la réponse (incident résolu ou
      // expiré côté serveur) pour éviter une croissance infinie.
      for (const inc of fresh.active_incidents) {
        seenIdsRef.current.add(inc.id)
      }
      for (const r of fresh.recently_resolved) {
        announcedResolvedRef.current.add(r.id)
      }
      // Cleanup seenIdsRef : retirer les incidents qui ne sont plus actifs.
      for (const id of [...seenIdsRef.current]) {
        if (!freshIds.has(id)) seenIdsRef.current.delete(id)
      }
      // Cleanup announcedResolvedRef : limiter à 50 entrées (LRU approximatif).
      if (announcedResolvedRef.current.size > 50) {
        const arr = [...announcedResolvedRef.current]
        announcedResolvedRef.current = new Set(arr.slice(-50))
      }

      // --- Détection retards (≥ 10 min) + rappels toutes les 5 min ---
      // Pour chaque incident actif en retard, on calcule tous les
      // paliers (10, 15, 20, …) déjà passés et on alerte ceux non
      // encore alertés. Au premier poll, on marque tous les paliers
      // ≤ elapsedMin comme déjà alertés (pas d'annonce rétroactive).
      const activeIds = new Set(fresh.active_incidents.map((i) => i.id))
      for (const inc of fresh.active_incidents) {
        if (!inc.isLate) continue
        let t = LATE_THRESHOLD_MIN
        while (t <= inc.elapsedMin) {
          const key = `${inc.id}-${t}min`
          if (!alertedLateRef.current.has(key)) {
            alertedLateRef.current.add(key)
            // Au premier poll ou si le son est off, on n'annonce pas —
            // on se contente de marquer le palier comme vu.
            if (soundOn && !isFirst) {
              playEscalation()
              setTimeout(
                () =>
                  parler(
                    `Signalement en retard. ${t} minutes écoulées. Table ${inc.tableNumber || 'inconnue'}. Intervention requise.`,
                  ),
                300,
              )
            }
          }
          t += REMINDER_INTERVAL_MIN
        }
      }
      // Cleanup alertedLateRef : retire les paliers dont l'incident n'est
      // plus actif (résolu ou disparu).
      for (const key of [...alertedLateRef.current]) {
        const incidentId = key.replace(/-\d+min$/, '')
        if (!activeIds.has(incidentId)) {
          alertedLateRef.current.delete(key)
        }
      }
    } catch {
      setError('Connexion au serveur impossible.')
    } finally {
      setLoading(false)
    }
  }, [soundOn])

  // Lance le polling au montage + toutes les 5 s.
  useEffect(() => {
    void poll()
    const id = setInterval(() => void poll(), POLL_INTERVAL_MS)
    return () => clearInterval(id)
  }, [poll])

  // ---------------------------------------------------------------
  // Horloge 1 s
  // ---------------------------------------------------------------
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), CLOCK_INTERVAL_MS)
    return () => clearInterval(id)
  }, [])

  // ---------------------------------------------------------------
  // Préférence son (localStorage) + bannière d'activation
  // V3 : si aucune préférence → son ACTIVÉ par défaut (TV ops room).
  // La bannière ne sert qu'à informer du déverrouillage audio.
  // ---------------------------------------------------------------
  useEffect(() => {
    const t = setTimeout(() => {
      let pref: string | null = null
      try {
        pref = localStorage.getItem(SOUND_STORAGE_KEY)
      } catch {
        /* localStorage indisponible */
      }
      if (pref === '0') {
        setSoundOn(false)
      } else {
        setSoundOn(true)
        setShowSoundBanner(true)
        const dismiss = setTimeout(() => setShowSoundBanner(false), 8000)
        return () => clearTimeout(dismiss)
      }
    }, 0)
    return () => clearTimeout(t)
  }, [])

  // --- V3 — Déverrouillage audio au premier geste (autoplay policy) ---
  useEffect(() => {
    const unlock = () => {
      if (audioUnlockedRef.current) return
      audioUnlockedRef.current = true
      setShowSoundBanner(false)
      try {
        playDing()
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

  // Préférence mode sombre/clair (localStorage)
  // ---------------------------------------------------------------
  useEffect(() => {
    try {
      const saved = localStorage.getItem(DARK_MODE_STORAGE_KEY)
      if (saved === '1') setDarkMode(true)
    } catch {
      /* ignore */
    }
  }, [])

  const toggleDarkMode = useCallback(() => {
    setDarkMode((prev) => {
      const next = !prev
      try {
        localStorage.setItem(DARK_MODE_STORAGE_KEY, next ? '1' : '0')
      } catch {
        /* ignore */
      }
      return next
    })
  }, [])

  const toggleSound = useCallback(() => {
    setSoundOn((prev) => {
      const next = !prev
      try {
        localStorage.setItem(SOUND_STORAGE_KEY, next ? '1' : '0')
      } catch {
        /* ignore */
      }
      setShowSoundBanner(false)
      if (next) {
        // Petit ding de confirmation + annonce vocale Denise.
        playDing()
        setTimeout(() => parler('Son activé. Wallboard salon VIP opérationnel.'), 200)
      } else if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel()
      }
      return next
    })
  }, [])

  // ---------------------------------------------------------------
  // Valeurs dérivées pour le rendu
  // ---------------------------------------------------------------
  const alertCount = data?.active_incidents.length ?? 0
  const lateCount = data?.active_incidents.filter((i) => i.isLate).length ?? 0

  // Tables groupées par zone (en respectant ZONE_ORDER).
  const tablesByZone = (() => {
    if (!data) return [] as Array<{ zone: string; zoneLabel: string; tables: WallboardData['tables'] }>
    const map = new Map<string, WallboardData['tables']>()
    for (const t of data.tables) {
      const arr = map.get(t.zone) ?? []
      arr.push(t)
      map.set(t.zone, arr)
    }
    const result: Array<{ zone: string; zoneLabel: string; tables: WallboardData['tables'] }> = []
    for (const zone of ZONE_ORDER) {
      const arr = map.get(zone)
      if (!arr || arr.length === 0) continue
      result.push({
        zone,
        zoneLabel: arr[0].zoneLabel,
        tables: arr,
      })
    }
    // Zones éventuelles non listées dans ZONE_ORDER (robustesse).
    for (const [zone, arr] of map.entries()) {
      if (ZONE_ORDER.includes(zone as (typeof ZONE_ORDER)[number])) continue
      result.push({ zone, zoneLabel: arr[0].zoneLabel, tables: arr })
    }
    return result
  })()

  // ---------------------------------------------------------------
  // Rendu
  // ---------------------------------------------------------------
  return (
    <div
      className="flex h-[100dvh] w-full flex-col overflow-hidden"
      style={{ backgroundColor: C.bg, color: C.text }}
    >
      {/* ===== Header (sticky, anthracite) ===== */}
      <header
        className="z-30 w-full shrink-0"
        style={{
          backgroundColor: C.header,
          color: '#FFFFFF',
          boxShadow: '0 4px 20px rgba(0,0,0,0.18)',
        }}
      >
        <div className="mx-auto flex max-w-[1800px] items-center justify-between gap-4 px-6 py-3">
          {/* Left : logo gold + subtitle */}
          <div className="flex items-center gap-3">
            <div
              className="flex h-11 w-11 items-center justify-center rounded-lg text-2xl"
              style={{
                backgroundColor: C.gold,
                color: C.header,
                boxShadow: '0 2px 8px rgba(201,169,97,0.30)',
              }}
            >
              🥂
            </div>
            <div className="leading-tight">
              <div
                className="text-lg font-bold"
                style={{
                  fontFamily: 'Georgia, "Playfair Display", serif',
                  color: C.gold,
                  letterSpacing: 1,
                }}
              >
                SALON VIP OPS
              </div>
              <div
                className="text-[10px] font-semibold uppercase opacity-70"
                style={{ letterSpacing: 2 }}
              >
                Wallboard · Lounge
              </div>
            </div>
          </div>

          {/* Center : titre + alert count */}
          <div className="hidden flex-1 items-center justify-center gap-4 md:flex">
            <span
              className="text-sm font-bold uppercase"
              style={{ letterSpacing: 3 }}
            >
              Wallboard · Salon VIP
            </span>
            <span
              className="flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-black uppercase"
              style={{
                backgroundColor:
                  alertCount > 0 ? C.alert + '33' : C.gold + '33',
                color: alertCount > 0 ? C.alert : C.gold,
                letterSpacing: 1,
              }}
            >
              <AlertTriangle size={12} />
              {alertCount} alerte{alertCount > 1 ? 's' : ''}
              {lateCount > 0 ? (
                <span
                  className="ml-1 rounded-full px-1.5 py-px text-[10px] text-white"
                  style={{ backgroundColor: C.alert }}
                >
                  {lateCount} retard
                </span>
              ) : null}
            </span>
          </div>

          {/* Right : date + système OK + LIVE dot + horloge */}
          <div className="flex items-center gap-3">
            <div className="hidden text-right leading-tight lg:block">
              <div className="text-[11px] capitalize opacity-80">
                {formatDateLong(now)}
              </div>
              <div
                className="text-[10px] font-bold uppercase"
                style={{ color: C.gold, letterSpacing: 2 }}
              >
                <span className="inline-flex items-center gap-1">
                  <span
                    className="inline-block h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: C.success }}
                  />
                  Système OK
                </span>
              </div>
            </div>

            {/* LIVE dot rouge pulsant */}
            <span className="hidden items-center gap-1.5 text-[10px] font-bold uppercase opacity-90 sm:flex">
              <span
                className="relative inline-flex h-2.5 w-2.5"
                style={{ letterSpacing: 2 }}
              >
                <span
                  className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75"
                  style={{ backgroundColor: '#E30613' }}
                />
                <span
                  className="relative inline-flex h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: '#E30613' }}
                />
              </span>
              Live
            </span>

            {/* Horloge gold cartouche */}
            <div
              className="rounded-lg px-3 py-1.5 text-center"
              style={{
                backgroundColor: C.gold,
                color: C.header,
                boxShadow: '0 2px 8px rgba(201,169,97,0.30)',
              }}
            >
              <div
                className="font-mono text-xl font-black tabular-nums"
                suppressHydrationWarning
              >
                {formatClock(now)}
              </div>
              <div
                className="text-[9px] font-bold uppercase"
                style={{ letterSpacing: 2 }}
              >
                Heure locale
              </div>
            </div>

            {/* Toggle son */}
            <button
              type="button"
              onClick={toggleSound}
              aria-pressed={soundOn}
              title={soundOn ? 'Désactiver le son' : 'Activer le son'}
              className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold uppercase transition"
              style={{
                backgroundColor: soundOn ? C.gold + '33' : 'transparent',
                color: soundOn ? C.gold : '#FFFFFF',
                border: `1px solid ${soundOn ? C.gold : '#555'}`,
                letterSpacing: 1,
              }}
            >
              {soundOn ? <Volume2 size={14} /> : <VolumeX size={14} />}
              <span className="hidden sm:inline">
                {soundOn ? 'Son ON' : 'Son OFF'}
              </span>
            </button>

            {/* Toggle mode sombre/clair */}
            <button
              type="button"
              onClick={toggleDarkMode}
              aria-pressed={darkMode}
              title={darkMode ? 'Passer en mode clair' : 'Passer en mode sombre'}
              className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold uppercase transition"
              style={{
                backgroundColor: darkMode ? C.gold + '33' : 'transparent',
                color: darkMode ? C.gold : '#FFFFFF',
                border: `1px solid ${darkMode ? C.gold : '#555'}`,
                letterSpacing: 1,
              }}
            >
              {darkMode ? <Sun size={14} /> : <Moon size={14} />}
              <span className="hidden sm:inline">
                {darkMode ? 'Clair' : 'Sombre'}
              </span>
            </button>
          </div>
        </div>

        {/* === Bannière de déverrouillage audio (V3) === */}
        {showSoundBanner && soundOn ? (
          <div
            className="flex w-full items-center justify-between gap-3 px-6 py-2"
            style={{
              backgroundColor: C.success,
              color: '#FFFFFF',
            }}
          >
            <span className="flex items-center gap-2 text-xs font-bold uppercase"
              style={{ letterSpacing: 1 }}
            >
              <Megaphone size={14} />
              Son activé — un clic n'importe où pour débloquer l'audio
            </span>
            <button
              type="button"
              onClick={toggleSound}
              className="flex items-center gap-1.5 rounded-md bg-white px-3 py-1.5 text-xs font-black uppercase transition hover:bg-opacity-90"
              style={{ color: C.success, letterSpacing: 1 }}
            >
              🔇 Couper le son
            </button>
          </div>
        ) : null}
      </header>

      {/* ===== Corps — V3 : la zone de contenu occupe TOUT l'espace restant
          et défile en interne (aucun scroll de page, affichage TV plein écran) ===== */}
      <main className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden" style={{ scrollbarWidth: 'thin' }}>
        <div className="mx-auto max-w-[1800px] px-6 py-4">
        {/* === Indicateur de chargement initial === */}
        {loading && !data ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20">
            <Loader2 size={32} className="animate-spin" style={{ color: C.gold }} />
            <div
              className="text-sm font-bold uppercase opacity-70"
              style={{ letterSpacing: 2 }}
            >
              Chargement du wallboard…
            </div>
          </div>
        ) : null}

        {/* === Bandeau erreur (non bloquant) === */}
        {error ? (
          <div
            className="mb-4 rounded-xl border-2 px-4 py-2 text-sm font-bold"
            style={{
              borderColor: C.alert,
              backgroundColor: C.alert + '11',
              color: C.alert,
            }}
          >
            ⚠ {error} — nouvelle tentative dans 5 s…
          </div>
        ) : null}

        {data ? (
          <>
            {/* === KPI ROW === */}
            <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
              {/* 1. Satisfaction */}
              <KpiCard
                label="Score satisfaction"
                value={`${data.kpis.satisfaction_score.toFixed(1)}/5`}
                bg={C.success}
                fg="#FFFFFF"
                badge={
                  <span
                    className="rounded-full px-2 py-0.5 text-[9px] font-black uppercase"
                    style={{
                      backgroundColor: 'rgba(255,255,255,0.20)',
                      color: '#FFFFFF',
                      letterSpacing: 1,
                    }}
                  >
                    ● Live
                  </span>
                }
                sub={
                  <span>
                    MAJ {lastUpdate ? formatClock(lastUpdate) : '—'}
                  </span>
                }
              />

              {/* 2. En attente */}
              <KpiCard
                label="En attente"
                value={data.kpis.pending}
                bg='#F6C443'
                fg={C.header}
              />

              {/* 3. En cours */}
              <KpiCard
                label="En cours"
                value={data.kpis.in_progress}
                bg='#7DB3D8'
                fg='#FFFFFF'
              />

              {/* 4. Résolus auj. */}
              <KpiCard
                label="Résolus auj."
                value={data.kpis.resolved_today}
                bg='#2F8F5F'
                fg='#FFFFFF'
              />

              {/* 5. Temps moyen */}
              <KpiCard
                label="Temps moyen"
                value={`${data.kpis.avg_resolution_min}min`}
                bg={C.header}
                fg='#FFFFFF'
              />

              {/* 6. Tables occupées */}
              <KpiCard
                label="Tables occupées"
                value={`${data.kpis.tables_occupied}/${data.kpis.tables_total}`}
                bg={C.gold}
                fg={C.header}
              />

              {/* 7. Total demandes */}
              <KpiCard
                label="Demandes auj."
                value={data.kpis.total_today}
                bg={C.bronze}
                fg='#FFFFFF'
              />
            </section>

            {/* === MAIN LAYOUT : 2fr left | 1fr right === */}
            <section className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-[2fr_1fr]">
              {/* --- LEFT : Plan du Salon --- */}
              <div
                className="rounded-2xl border bg-white p-5"
                style={{
                  borderColor: C.border,
                  boxShadow: '0 4px 20px rgba(201,169,97,0.06)',
                }}
              >
                <div className="mb-4 flex items-center justify-between gap-3">
                  <h2
                    className="text-lg font-bold"
                    style={{
                      fontFamily: 'Georgia, "Playfair Display", serif',
                      color: C.text,
                    }}
                  >
                    🪑 Plan du Salon — Temps Réel
                  </h2>
                  <span
                    className="text-[10px] font-bold uppercase opacity-60"
                    style={{ letterSpacing: 2 }}
                  >
                    {data.tables.length} tables · {data.kpis.tables_occupied} occupées
                  </span>
                </div>

                {tablesByZone.length === 0 ? (
                  <div className="py-10 text-center text-sm opacity-60">
                    Aucune table configurée.
                  </div>
                ) : (
                  <div className="space-y-5">
                    {tablesByZone.map((zg) => (
                      <div key={zg.zone}>
                        {/* Sous-titre zone */}
                        <div className="mb-2 flex items-center gap-2">
                          <span className="text-base">
                            {ZONE_EMOJI[zg.zone] ?? '📍'}
                          </span>
                          <span
                            className="text-[12px] font-bold uppercase"
                            style={{
                              color: C.bronze,
                              letterSpacing: 2,
                            }}
                          >
                            {zg.zoneLabel}
                          </span>
                          <span
                            className="text-[10px] opacity-60"
                          >
                            ({zg.tables.length} tables)
                          </span>
                          <div
                            className="ml-2 h-px flex-1"
                            style={{ backgroundColor: C.border }}
                          />
                        </div>
                        {/* Grille tables */}
                        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
                          {zg.tables.map((t) => (
                            <TableCard key={t.id} t={t} darkMode={darkMode} />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Légende statuts */}
                <div
                  className="mt-5 flex flex-wrap items-center gap-3 border-t pt-3 text-[10px] font-bold uppercase"
                  style={{
                    borderColor: C.border,
                    color: '#8a8170',
                    letterSpacing: 1,
                  }}
                >
                  <span>Légende :</span>
                  <LegendDot color={C.success} label='Libre' />
                  <LegendDot color={C.vip} label='Occupée' />
                  <LegendDot color={C.alert} label='Problème' />
                  <LegendDot color={C.gold} label='Réservée' />
                </div>
              </div>

              {/* --- RIGHT : Alertes actives --- */}
              <div
                className="rounded-2xl border bg-white p-5"
                style={{
                  borderColor: C.border,
                  boxShadow: '0 4px 20px rgba(201,169,97,0.06)',
                }}
              >
                <div className="mb-4 flex items-center justify-between gap-3">
                  <h2
                    className="text-lg font-bold"
                    style={{
                      fontFamily: 'Georgia, "Playfair Display", serif',
                      color: C.text,
                    }}
                  >
                    ⚠ Alertes Actives
                  </h2>
                  <span
                    className="rounded-full px-2.5 py-1 text-[10px] font-black uppercase"
                    style={{
                      backgroundColor:
                        alertCount > 0
                          ? C.alert + '22'
                          : C.success + '22',
                      color: alertCount > 0 ? C.alert : C.success,
                      letterSpacing: 1,
                    }}
                  >
                    {alertCount} active{alertCount > 1 ? 's' : ''}
                  </span>
                </div>

                {data.active_incidents.length === 0 ? (
                  <div
                    className="flex flex-col items-center justify-center gap-3 py-16 text-center"
                    style={{ color: C.success }}
                  >
                    <CheckCircle2 size={48} />
                    <div>
                      <div
                        className="text-sm font-bold uppercase"
                        style={{ letterSpacing: 2 }}
                      >
                        Aucune alerte
                      </div>
                      <div className="mt-1 text-xs opacity-70">
                        Tout est sous contrôle
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2.5">
                    {data.active_incidents.map((inc) => (
                      <AlertCard key={inc.id} incident={inc} darkMode={darkMode} />
                    ))}
                  </div>
                )}
              </div>
            </section>

            {/* === RÉSOLUS RÉCEMMENT (full width) === */}
            <section className="mt-5">
              <div
                className="rounded-2xl border bg-white p-5"
                style={{
                  borderColor: C.border,
                  boxShadow: '0 4px 20px rgba(201,169,97,0.06)',
                }}
              >
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h2
                    className="text-lg font-bold"
                    style={{
                      fontFamily: 'Georgia, "Playfair Display", serif',
                      color: C.text,
                    }}
                  >
                    ✓ Résolus Récemment
                  </h2>
                  <span
                    className="text-[10px] font-bold uppercase opacity-60"
                    style={{ letterSpacing: 2 }}
                  >
                    {data.recently_resolved.length} sur les 5 dernières min
                  </span>
                </div>

                {data.recently_resolved.length === 0 ? (
                  <div className="py-8 text-center text-sm opacity-60">
                    Aucune résolution récente — patience, ça va venir.
                  </div>
                ) : (
                  <div className="flex gap-3 overflow-x-auto pb-2">
                    {data.recently_resolved.map((r) => (
                      <ResolvedCard key={r.id} r={r} darkMode={darkMode} />
                    ))}
                  </div>
                )}
              </div>
            </section>
          </>
        ) : null}
        </div>
      </main>

      {/* ===== Footer ===== */}
      <footer
        className="z-20 w-full shrink-0 border-t"
        style={{
          backgroundColor: C.header,
          color: '#FFFFFF',
          borderColor: '#1a1a1a',
        }}
      >
        <div className="mx-auto flex max-w-[1800px] items-center justify-between gap-4 px-6 py-2.5">
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase opacity-80"
            style={{ letterSpacing: 2 }}
          >
            <Plane size={12} style={{ color: C.gold }} />
            FeedbackPro · Salon VIP Wallboard
          </div>
          <div className="flex items-center gap-4 text-[11px]">
            <span className="hidden items-center gap-1.5 opacity-70 sm:flex">
              <TrendingUp size={12} style={{ color: C.gold }} />
              Live · MAJ {lastUpdate ? formatClockSec(lastUpdate) : '—'}
            </span>
            <span
              className="font-mono font-black tabular-nums"
              style={{ color: C.gold }}
              suppressHydrationWarning
            >
              {formatClockSec(now)}
            </span>
          </div>
        </div>
      </footer>
    </div>
  )
}

// ============================================================
// LegendDot — pastille de légende couleur + label
// ============================================================

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className="inline-block h-2.5 w-2.5 rounded-full"
        style={{ backgroundColor: color }}
      />
      {label}
    </span>
  )
}
