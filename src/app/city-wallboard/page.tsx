// ============================================================
// Page /city-wallboard — Centre de Supervision Urbain — Dakar
// ------------------------------------------------------------
// Affichage TV plein écran pour la salle de supervision municipale.
// Refonte charte signalétique aéroport : panneaux modulaires jaune
// #FFD700 (alertes/tâches) + bleu #0026A3 (statut/identité),
// icônes sur tuiles blanches arrondies, typo Arial grasse uppercase,
// fort contraste, coins arrondis 16px.
//
// Fonctionnalités (inchangées) :
//   - Polling /api/city/wallboard toutes les 5s
//   - Horloge live (1s)
//   - 6 KPI cards (urgences, signalements, orientations, artisans,
//     satisfaction, revenus)
//   - Liste incidents récents (gauche) + panneau alertes (droite)
//   - Annonces vocales Aminata via parler() sur nouveaux incidents
//   - Ding (/sounds/ding-dong.mp3) sur nouvel incident
//   - Toggle son persisté (localStorage "city_wallboard_sound")
//   - Déverrouillage audio au premier geste (autoplay policy)
//
// Page standalone (accessible directement à l'URL /city-wallboard).
// ============================================================

'use client'

export const dynamic = 'force-dynamic'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Volume2,
  VolumeX,
  Siren,
  Megaphone,
  Compass,
  Wrench,
  Star,
  Wallet,
  Building2,
  Clock,
  MapPin,
  AlertTriangle,
} from 'lucide-react'
import { parler } from '@/lib/staff-tts'

// ---------------------------------------------------------------
// Palette signalétique aéroport
//   YELLOW = alertes/tâches  · BLUE = statut/identité
//   BLACK  = texte sur jaune  · WHITE = tuiles icônes + texte sur bleu
// ---------------------------------------------------------------
const YELLOW = '#FFD700'
const BLUE = '#0026A3'
const RED = '#E30613'
const GREEN = '#00A651'
const ORANGE = '#FF6B00'
const BLACK = '#000000'
const WHITE = '#FFFFFF'
const BG = '#E8E8E8' // backdrop gris clair — fait ressortir les panneaux
const PANEL_BORDER = '#D0D0D0'
const ROW_BG = '#FAFAFA'
const TEXT_MUTED = '#555555'
const FONT_SIGNAGE = "'Arial, Helvetica, sans-serif'"

const DING_SOUND = '/sounds/ding-dong.mp3'
const LS_KEY = 'city_wallboard_sound'

// ---------------------------------------------------------------
// Types — match /api/city/wallboard
// ---------------------------------------------------------------
type CityIncidentLite = {
  id: string
  plateId: string | null
  plate: {
    id: string
    plateNumber: string
    label: string
    district: string | null
  } | null
  qrToken: string | null
  type: string // emergency | report | orientation | artisan | mairie
  category: string | null
  description: string | null
  gpsLat: number | null
  gpsLng: number | null
  status: string // pending | assigned | in_progress | resolved
  assignedTo: string | null
  staffName: string | null
  resolvedAt: string | null
  createdAt: string
  updatedAt: string
}

type WallboardData = {
  stats: {
    totalIncidents24h: number
    pendingEmergencies: number
    pendingReports: number
    resolvedToday: number
    platesCount: number
    activeArtisans: number
    avgSatisfaction: number
    revenueTotal: number
  }
  recentIncidents: CityIncidentLite[]
}

// ---------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

function fmtClock(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function fmtDateFR(d: Date): string {
  const jours = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi']
  const mois = [
    'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
    'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
  ]
  return `${jours[d.getDay()]} ${d.getDate()} ${mois[d.getMonth()]} ${d.getFullYear()}`
}

function fmtTimeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const sec = Math.floor(diff / 1000)
  if (sec < 60) return `${sec}s`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}min`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h}h`
  const j = Math.floor(h / 24)
  return `${j}j`
}

function fmtFCFA(n: number): string {
  if (n >= 1_000_000) {
    const m = n / 1_000_000
    return `${m.toFixed(m >= 10 ? 1 : 2).replace('.', ',')}M FCFA`
  }
  if (n >= 1_000) return `${Math.round(n / 1000)}K FCFA`
  return `${n} FCFA`
}

/** Label FR lisible pour le type d'incident. */
function typeLabel(t: string): string {
  switch (t) {
    case 'emergency': return 'Urgence'
    case 'report': return 'Signalement'
    case 'orientation': return 'Orientation'
    case 'artisan': return 'Artisan'
    case 'mairie': return 'Mairie'
    default: return t
  }
}

/** Couleur d'accent selon le type d'incident (bord gauche des rows). */
function typeColor(t: string): string {
  switch (t) {
    case 'emergency': return RED
    case 'report': return ORANGE
    case 'orientation': return BLUE
    case 'artisan': return YELLOW
    case 'mairie': return BLUE
    default: return TEXT_MUTED
  }
}

/** Icône lucide selon le type d'incident. */
function typeIcon(t: string) {
  switch (t) {
    case 'emergency': return Siren
    case 'report': return Megaphone
    case 'orientation': return Compass
    case 'artisan': return Wrench
    case 'mairie': return Building2
    default: return AlertTriangle
  }
}

/** Couleur du statut pour les badges. */
function statusColor(s: string): string {
  switch (s) {
    case 'pending': return ORANGE
    case 'assigned': return YELLOW
    case 'in_progress': return BLUE
    case 'resolved': return GREEN
    default: return TEXT_MUTED
  }
}

function statusLabel(s: string): string {
  switch (s) {
    case 'pending': return 'EN ATTENTE'
    case 'assigned': return 'ASSIGNÉ'
    case 'in_progress': return 'EN COURS'
    case 'resolved': return 'RÉSOLU'
    default: return s.toUpperCase()
  }
}

// ---------------------------------------------------------------
// Carte KPI — panneau signalétique modulaire
//   [tuile icône blanche] → [LABEL uppercase] → [BIG NUMBER]
//                                            [sub-label smaller]
//   variant 'yellow' = panneau jaune (alertes/tâches), texte noir
//   variant 'blue'   = panneau bleu  (statut/identité), texte blanc
// ---------------------------------------------------------------
type KpiProps = {
  icon: typeof Siren
  label: string
  value: string
  sub?: string
  variant: 'yellow' | 'blue'
  badgeCount?: number
  badgeColor?: string
}

function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  variant,
  badgeCount,
  badgeColor = RED,
}: KpiProps) {
  const isYellow = variant === 'yellow'
  const bgColor = isYellow ? YELLOW : BLUE
  const fgColor = isYellow ? BLACK : WHITE
  return (
    <div
      className="flex items-center gap-3 p-4"
      style={{
        backgroundColor: bgColor,
        color: fgColor,
        borderRadius: '16px',
        fontFamily: FONT_SIGNAGE,
      }}
    >
      {/* Tuile icône blanche arrondie */}
      <div
        className="flex h-12 w-12 shrink-0 items-center justify-center"
        style={{ backgroundColor: WHITE, borderRadius: '12px' }}
      >
        <Icon className="h-6 w-6" style={{ color: BLACK }} />
      </div>

      {/* Colonne label + valeur + sub */}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span
          className="text-[11px] font-bold leading-none"
          style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}
        >
          {label}
        </span>
        <span
          className="text-2xl font-black leading-none tabular-nums whitespace-nowrap md:text-3xl"
        >
          {value}
        </span>
        {sub && (
          <span
            className="text-[10px] font-semibold leading-none opacity-80"
            style={{ textTransform: 'uppercase', letterSpacing: '0.04em' }}
          >
            {sub}
          </span>
        )}
      </div>

      {/* Badge alerte optionnel (ex. count urgences > 0) */}
      {badgeCount !== undefined && badgeCount > 0 && (
        <span
          className="flex h-7 min-w-[28px] shrink-0 items-center justify-center rounded-full px-2 text-xs font-black text-white"
          style={{ backgroundColor: badgeColor }}
        >
          {badgeCount}
        </span>
      )}
    </div>
  )
}

// ============================================================
// Page principale
// ============================================================
export default function CityWallboardPage() {
  const [data, setData] = useState<WallboardData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState<Date | null>(null)
  const [soundOn, setSoundOn] = useState<boolean>(true)
  const [audioUnlocked, setAudioUnlocked] = useState<boolean>(false)

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const seenIdsRef = useRef<Set<string>>(new Set())
  const firstPollRef = useRef<boolean>(true)
  const announcedRef = useRef<Set<string>>(new Set())
  const announcedResolvedRef = useRef<Set<string>>(new Set())

  // --- Horloge live (1s) ---
  useEffect(() => {
    setNow(new Date())
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  // --- Préférence son persistée ---
  useEffect(() => {
    try {
      const pref = localStorage.getItem(LS_KEY)
      // Préférence absente → son activé par défaut (wallboard TV dédié).
      if (pref === '0') setSoundOn(false)
    } catch {
      /* localStorage indisponible */
    }
  }, [])

  // --- Déverrouillage audio au premier geste (autoplay policy) ---
  useEffect(() => {
    const unlock = () => {
      if (audioRef.current && !audioRef.current.paused) return
      setAudioUnlocked(true)
      try {
        const a = audioRef.current
        if (a) {
          a.src = DING_SOUND
          a.volume = 0.001
          a.play().then(() => {
            a.pause()
            a.currentTime = 0
            a.volume = 0.45
          }).catch(() => {})
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

  // --- Ping sonore + annonce Aminata ---
  const playDing = useCallback(() => {
    if (!soundOn) return
    try {
      const a = audioRef.current
      if (a) {
        a.src = DING_SOUND
        a.volume = 0.45
        a.play().catch(() => {})
      }
    } catch {
      /* ignore */
    }
  }, [soundOn])

  const announceIncident = useCallback(
    (inc: CityIncidentLite) => {
      if (!soundOn) return
      if (announcedRef.current.has(inc.id)) return
      announcedRef.current.add(inc.id)
      const category = inc.category ? inc.category.charAt(0).toUpperCase() + inc.category.slice(1) : 'Sans catégorie'
      const service = inc.assignedTo ?? ''
      const desc = inc.description ? `. ${inc.description.substring(0, 100)}` : ''
      if (inc.type === 'emergency') {
        const msg = service
          ? `Nouvelle urgence signalée. ${category}${desc}. ${service} notifié.`
          : `Nouvelle urgence signalée. ${category}${desc}.`
        parler(msg)
      } else if (inc.type === 'report') {
        const msg = service
          ? `Nouveau signalement. ${category}${desc}. ${service} notifié.`
          : `Nouveau signalement. ${category}${desc}.`
        parler(msg)
      }
    },
    [soundOn],
  )

  // --- Polling /api/city/wallboard toutes les 5s ---
  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch('/api/city/wallboard', { cache: 'no-store' })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const json = await res.json()
        if (!json?.ok) throw new Error(json?.error ?? 'Réponse invalide')
        const d = json.data as WallboardData
        setData(d)
        setError(null)

        // Détection des nouveaux incidents (non vus au précédent poll).
        // On capture les IDs vus AVANT d'ajouter les nouveaux (pour détecter les résolutions).
        const previouslySeen = new Set(seenIdsRef.current)
        const fresh: CityIncidentLite[] = []
        for (const inc of d.recentIncidents) {
          if (!seenIdsRef.current.has(inc.id)) {
            fresh.push(inc)
            seenIdsRef.current.add(inc.id)
          }
        }

        // Au tout premier poll, on AMORCE le seenIdsRef sans announce
        // (sinon on déclencherait une salve d'annonces pour tous les
        // incidents historiques au chargement du wallboard).
        if (firstPollRef.current) {
          firstPollRef.current = false
          return
        }

        // Détection des résolutions (incidents précédemment vus, maintenant résolus)
        const resolved: CityIncidentLite[] = []
        for (const inc of d.recentIncidents) {
          if (
            inc.status === 'resolved' &&
            previouslySeen.has(inc.id) &&
            !announcedResolvedRef.current.has(inc.id)
          ) {
            resolved.push(inc)
            announcedResolvedRef.current.add(inc.id)
          }
        }

        // Annonces : on ne traite QUE les emergencies + reports
        // (orientations/artisans/mairie n'ont pas de signal sonore).
        const announceWorthy = fresh.filter(
          (i) => i.type === 'emergency' || i.type === 'report',
        )
        if (announceWorthy.length > 0) {
          playDing()
          // Séquence les annonces (3s d'écart) — parler() coupe l'annonce
          // précédente, mais on espaço pour la lisibilité en salle ops.
          announceWorthy.slice(0, 3).forEach((inc, i) => {
            setTimeout(() => announceIncident(inc), i * 3000)
          })
        }

        // Annonce des résolutions par Aminata
        if (resolved.length > 0 && soundOn) {
          resolved.slice(0, 3).forEach((inc, i) => {
            setTimeout(() => {
              const category = inc.category
                ? inc.category.charAt(0).toUpperCase() + inc.category.slice(1)
                : 'Signalement'
              const service = inc.assignedTo ?? 'Mairie'
              parler(`Signalement résolu. ${category}. ${service} a traité le problème.`)
            }, i * 3000)
          })
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Erreur réseau'
        setError(msg)
      }
    }
    void poll()
    const t = setInterval(() => void poll(), 5000)
    return () => clearInterval(t)
  }, [playDing, announceIncident])

  // --- Toggle son (persisté) ---
  const toggleSound = useCallback(() => {
    setSoundOn((prev) => {
      const next = !prev
      try {
        localStorage.setItem(LS_KEY, next ? '1' : '0')
      } catch {
        /* ignore */
      }
      if (!next && typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel()
      }
      if (next) {
        // Petit ding de confirmation + annonce test.
        try {
          const a = audioRef.current
          if (a) {
            a.src = DING_SOUND
            a.volume = 0.45
            a.play().catch(() => {})
          }
        } catch {
          /* ignore */
        }
        parler('Son activé. Centre de supervision urbain de Dakar en ligne.')
      }
      return next
    })
  }, [])

  // --- Données dérivées pour le panneau d'alertes (droite) ---
  const activeEmergencies = (data?.recentIncidents ?? []).filter(
    (i) => i.type === 'emergency' && i.status !== 'resolved',
  )
  const pendingReportsList = (data?.recentIncidents ?? []).filter(
    (i) => i.type === 'report' && i.status === 'pending',
  )

  const stats = data?.stats

  return (
    <div
      className="flex min-h-screen flex-col"
      style={{ backgroundColor: BG, color: BLACK, fontFamily: FONT_SIGNAGE }}
    >
      {/* Scrollbar custom pour les listes du wallboard */}
      <style>{`
        .wb-scroll::-webkit-scrollbar { width: 8px; height: 8px; }
        .wb-scroll::-webkit-scrollbar-track { background: transparent; }
        .wb-scroll::-webkit-scrollbar-thumb {
          background: ${PANEL_BORDER};
          border-radius: 4px;
        }
        .wb-scroll::-webkit-scrollbar-thumb:hover { background: #999; }
        .wb-scroll { scrollbar-width: thin; scrollbar-color: ${PANEL_BORDER} transparent; }
      `}</style>

      {/* Audio caché pour le ding */}
      <audio ref={audioRef} preload="auto" />

      {/* ---------------- Header — panneau bleu ---------------- */}
      <header
        className="flex items-center justify-between gap-4 px-6 py-4"
        style={{ backgroundColor: BLUE, color: WHITE, borderRadius: '0 0 16px 16px' }}
      >
        <div className="flex items-center gap-4">
          {/* Tuile icône blanche arrondie */}
          <div
            className="flex h-14 w-14 shrink-0 items-center justify-center"
            style={{ backgroundColor: WHITE, borderRadius: '14px' }}
          >
            <Building2 className="h-8 w-8" style={{ color: BLACK }} />
          </div>
          <div className="min-w-0">
            <h1
              className="text-xl font-black leading-tight tracking-wide md:text-3xl"
              style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}
            >
              Centre de Supervision Urbain
            </h1>
            <p
              className="text-[11px] font-bold uppercase opacity-80 md:text-xs"
              style={{ letterSpacing: '0.2em' }}
            >
              Ville Connectée — Dakar
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Horloge live */}
          <div className="text-right">
            <div className="flex items-center justify-end gap-2">
              <Clock className="h-5 w-5" />
              <span className="text-2xl font-black tabular-nums md:text-3xl">
                {now ? fmtClock(now) : '--:--:--'}
              </span>
            </div>
            <div
              className="text-[10px] font-bold uppercase opacity-80 md:text-[11px]"
              style={{ letterSpacing: '0.1em' }}
            >
              {now ? fmtDateFR(now) : 'Chargement…'}
            </div>
          </div>

          {/* Toggle son — jaune si ON, blanc/bleu si OFF */}
          <button
            type="button"
            onClick={toggleSound}
            aria-pressed={soundOn}
            aria-label={soundOn ? 'Couper le son' : 'Activer le son (ding + annonces Aminata)'}
            title={soundOn ? 'Son activé — clic pour couper' : 'Son coupé — clic pour activer ding + annonces Aminata'}
            className="flex h-14 w-14 shrink-0 items-center justify-center transition-colors"
            style={{
              backgroundColor: soundOn ? YELLOW : WHITE,
              borderRadius: '14px',
              color: soundOn ? BLACK : BLUE,
              border: `2px solid ${soundOn ? BLACK : BLUE}`,
            }}
          >
            {soundOn ? <Volume2 className="h-7 w-7" /> : <VolumeX className="h-7 w-7" />}
          </button>
        </div>
      </header>

      {/* ---------------- KPI row (6 cartes signalétiques) ---------------- */}
      <section className="grid grid-cols-2 gap-3 px-6 py-4 md:grid-cols-3 lg:grid-cols-6">
        <KpiCard
          icon={Siren}
          label="Urgences"
          value={stats ? String(stats.pendingEmergencies) : '—'}
          sub="Non résolues"
          variant="yellow"
          badgeCount={stats?.pendingEmergencies}
          badgeColor={RED}
        />
        <KpiCard
          icon={Megaphone}
          label="Signalements"
          value={stats ? String(stats.pendingReports) : '—'}
          sub="En attente"
          variant="yellow"
        />
        <KpiCard
          icon={Compass}
          label="Orientations"
          value={stats ? String(stats.resolvedToday) : '—'}
          sub="Résolus aujourd'hui"
          variant="blue"
        />
        <KpiCard
          icon={Wrench}
          label="Artisans"
          value={stats ? String(stats.activeArtisans) : '—'}
          sub="Actifs"
          variant="blue"
        />
        <KpiCard
          icon={Star}
          label="Satisfaction"
          value={stats ? stats.avgSatisfaction.toFixed(1) : '—'}
          sub="Citoyens (mock)"
          variant="blue"
        />
        <KpiCard
          icon={Wallet}
          label="Revenus"
          value={stats ? fmtFCFA(stats.revenueTotal) : '—'}
          sub="Cumul (mock)"
          variant="blue"
        />
      </section>

      {/* ---------------- Bandeau contextuel (live status) ---------------- */}
      <div
        className="flex flex-wrap items-center gap-4 px-6 pb-2 text-xs font-bold"
        style={{ color: TEXT_MUTED }}
      >
        <span className="flex items-center gap-1.5">
          <span
            className="h-2.5 w-2.5 rounded-full animate-pulse"
            style={{ backgroundColor: GREEN }}
          />
          <span style={{ textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Live — màj toutes les 5s
          </span>
        </span>
        {stats && (
          <>
            <span>·</span>
            <span style={{ textTransform: 'uppercase' }}>
              {stats.totalIncidents24h} incidents (24h)
            </span>
            <span>·</span>
            <span style={{ textTransform: 'uppercase' }}>
              {stats.platesCount} plaques QR
            </span>
          </>
        )}
        {error && (
          <>
            <span>·</span>
            <span style={{ color: RED }}>ERREUR : {error}</span>
          </>
        )}
      </div>

      {/* ---------------- Grille principale : incidents | alertes ---------------- */}
      <section className="grid flex-1 grid-cols-1 gap-4 px-6 py-4 lg:grid-cols-[2fr_1fr]">
        {/* ---- Liste incidents récents (gauche, 2fr) ---- */}
        <div
          className="flex flex-col overflow-hidden"
          style={{
            backgroundColor: WHITE,
            borderRadius: '16px',
            border: `1px solid ${PANEL_BORDER}`,
          }}
        >
          {/* En-tête panneau bleu */}
          <div
            className="flex items-center justify-between px-4 py-3"
            style={{ backgroundColor: BLUE, color: WHITE }}
          >
            <h2
              className="flex items-center gap-2 text-sm font-black md:text-base"
              style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}
            >
              <AlertTriangle className="h-5 w-5" />
              Incidents récents
            </h2>
            <span
              className="text-[10px] font-bold uppercase opacity-80 md:text-[11px]"
              style={{ letterSpacing: '0.08em' }}
            >
              10 derniers · tous types
            </span>
          </div>

          {/* Rows — chaque incident = mini-panneau avec bord gauche coloré */}
          <div className="wb-scroll max-h-[calc(100vh-380px)] overflow-y-auto p-3">
            {data?.recentIncidents.length === 0 && (
              <div
                className="flex items-center justify-center p-8 text-sm font-bold uppercase"
                style={{ color: TEXT_MUTED }}
              >
                Aucun incident récent.
              </div>
            )}
            {!data && (
              <div
                className="flex items-center justify-center p-8 text-sm font-bold uppercase"
                style={{ color: TEXT_MUTED }}
              >
                Chargement des incidents…
              </div>
            )}
            <div className="flex flex-col gap-2">
              {data?.recentIncidents.map((inc) => {
                const Icon = typeIcon(inc.type)
                const isResolved = inc.status === 'resolved'
                // Bord gauche : vert si résolu, sinon couleur du type
                const borderColor = isResolved ? GREEN : typeColor(inc.type)
                return (
                  <div
                    key={inc.id}
                    className="flex items-center gap-3 p-3"
                    style={{
                      backgroundColor: ROW_BG,
                      borderRadius: '12px',
                      border: `1px solid ${PANEL_BORDER}`,
                      borderLeft: `6px solid ${borderColor}`,
                      opacity: isResolved ? 0.65 : 1,
                    }}
                  >
                    {/* Tuile icône blanche */}
                    <div
                      className="flex h-10 w-10 shrink-0 items-center justify-center"
                      style={{
                        backgroundColor: WHITE,
                        borderRadius: '10px',
                        border: `1px solid ${PANEL_BORDER}`,
                      }}
                    >
                      <Icon className="h-5 w-5" style={{ color: BLACK }} />
                    </div>

                    {/* Catégorie + lieu */}
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span
                        className="truncate text-sm font-black"
                        style={{
                          textTransform: 'uppercase',
                          letterSpacing: '0.03em',
                          textDecoration: isResolved ? 'line-through' : 'none',
                        }}
                      >
                        {inc.category ?? typeLabel(inc.type)}
                      </span>
                      <span
                        className="flex items-center gap-1 truncate text-xs"
                        style={{ color: TEXT_MUTED }}
                      >
                        {inc.plate ? (
                          <>
                            <MapPin className="h-3 w-3 shrink-0" />
                            <span className="truncate">
                              {inc.plate.label}
                              {inc.plate.district ? ` · ${inc.plate.district}` : ''}
                            </span>
                          </>
                        ) : (
                          'Hors plaque'
                        )}
                      </span>
                    </div>

                    {/* Badge statut */}
                    <span
                      className="shrink-0 rounded-md px-2 py-1 text-[10px] font-black uppercase"
                      style={{
                        backgroundColor: statusColor(inc.status),
                        color: WHITE,
                        letterSpacing: '0.04em',
                      }}
                    >
                      {statusLabel(inc.status)}
                    </span>

                    {/* Il y a */}
                    <span
                      className="shrink-0 text-right text-xs font-bold tabular-nums"
                      style={{ color: TEXT_MUTED, minWidth: '38px' }}
                    >
                      {fmtTimeAgo(inc.createdAt)}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* ---- Panneau alertes (droite, 1fr) ---- */}
        <div className="flex flex-col gap-3 overflow-hidden">
          {/* URGENCES EN COURS — en-tête panneau jaune */}
          <div
            className="flex flex-col overflow-hidden"
            style={{
              borderRadius: '16px',
              border: `1px solid ${PANEL_BORDER}`,
            }}
          >
            <div
              className="flex items-center justify-between px-4 py-3"
              style={{ backgroundColor: YELLOW, color: BLACK }}
            >
              <h2
                className="flex items-center gap-2 text-sm font-black md:text-base"
                style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}
              >
                <span
                  className="flex h-6 w-6 items-center justify-center"
                  style={{ backgroundColor: WHITE, borderRadius: '6px' }}
                >
                  <Siren className="h-4 w-4" style={{ color: RED }} />
                </span>
                Urgences en cours
              </h2>
              <span
                className="flex h-6 min-w-[24px] items-center justify-center rounded-full px-2 text-[11px] font-black text-white"
                style={{ backgroundColor: RED }}
              >
                {activeEmergencies.length}
              </span>
            </div>

            <div
              className="wb-scroll max-h-[calc(50vh-90px)] overflow-y-auto p-3"
              style={{ backgroundColor: WHITE }}
            >
              <div className="flex flex-col gap-2">
                {activeEmergencies.length === 0 && (
                  <div
                    className="rounded-lg p-3 text-center text-xs font-bold uppercase"
                    style={{ backgroundColor: ROW_BG, color: TEXT_MUTED }}
                  >
                    Aucune urgence active.
                  </div>
                )}
                {activeEmergencies.map((inc) => (
                  <div
                    key={inc.id}
                    className="flex items-center gap-2 p-2"
                    style={{
                      backgroundColor: ROW_BG,
                      borderRadius: '10px',
                      borderLeft: `4px solid ${RED}`,
                    }}
                  >
                    <span
                      className="flex h-8 w-8 shrink-0 items-center justify-center"
                      style={{
                        backgroundColor: WHITE,
                        borderRadius: '8px',
                        border: `1px solid ${PANEL_BORDER}`,
                      }}
                    >
                      <Siren className="h-4 w-4" style={{ color: RED }} />
                    </span>
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span
                        className="truncate text-xs font-black"
                        style={{ textTransform: 'uppercase' }}
                      >
                        {inc.category ?? 'Urgence'}
                      </span>
                      <span
                        className="truncate text-[10px]"
                        style={{ color: TEXT_MUTED }}
                      >
                        {inc.plate?.label ?? 'Lieu inconnu'}
                      </span>
                    </div>
                    <span
                      className="shrink-0 text-[10px] font-bold tabular-nums"
                      style={{ color: TEXT_MUTED }}
                    >
                      {fmtTimeAgo(inc.createdAt)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* SIGNALEMENTS EN ATTENTE — en-tête panneau bleu */}
          <div
            className="flex flex-col overflow-hidden"
            style={{
              borderRadius: '16px',
              border: `1px solid ${PANEL_BORDER}`,
            }}
          >
            <div
              className="flex items-center justify-between px-4 py-3"
              style={{ backgroundColor: BLUE, color: WHITE }}
            >
              <h2
                className="flex items-center gap-2 text-sm font-black md:text-base"
                style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}
              >
                <span
                  className="flex h-6 w-6 items-center justify-center"
                  style={{ backgroundColor: WHITE, borderRadius: '6px' }}
                >
                  <Megaphone className="h-4 w-4" style={{ color: BLACK }} />
                </span>
                Signalements en attente
              </h2>
              <span
                className="flex h-6 min-w-[24px] items-center justify-center rounded-full px-2 text-[11px] font-black"
                style={{ backgroundColor: WHITE, color: BLUE }}
              >
                {pendingReportsList.length}
              </span>
            </div>

            <div
              className="wb-scroll max-h-[calc(50vh-90px)] overflow-y-auto p-3"
              style={{ backgroundColor: WHITE }}
            >
              <div className="flex flex-col gap-2">
                {pendingReportsList.length === 0 && (
                  <div
                    className="rounded-lg p-3 text-center text-xs font-bold uppercase"
                    style={{ backgroundColor: ROW_BG, color: TEXT_MUTED }}
                  >
                    Aucun signalement en attente.
                  </div>
                )}
                {pendingReportsList.map((inc) => (
                  <div
                    key={inc.id}
                    className="flex items-center gap-2 p-2"
                    style={{
                      backgroundColor: ROW_BG,
                      borderRadius: '10px',
                      borderLeft: `4px solid ${ORANGE}`,
                    }}
                  >
                    <span
                      className="flex h-8 w-8 shrink-0 items-center justify-center"
                      style={{
                        backgroundColor: WHITE,
                        borderRadius: '8px',
                        border: `1px solid ${PANEL_BORDER}`,
                      }}
                    >
                      <Megaphone className="h-4 w-4" style={{ color: ORANGE }} />
                    </span>
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span
                        className="truncate text-xs font-black"
                        style={{ textTransform: 'uppercase' }}
                      >
                        {inc.category ?? 'Signalement'}
                      </span>
                      <span
                        className="truncate text-[10px]"
                        style={{ color: TEXT_MUTED }}
                      >
                        {inc.plate?.label ?? 'Hors plaque'}
                      </span>
                    </div>
                    <span
                      className="shrink-0 text-[10px] font-bold tabular-nums"
                      style={{ color: TEXT_MUTED }}
                    >
                      {fmtTimeAgo(inc.createdAt)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------- Footer — barre noire, texte jaune ---------------- */}
      <footer
        className="mt-auto flex flex-wrap items-center justify-between gap-2 px-6 py-3 text-xs font-black"
        style={{
          backgroundColor: BLACK,
          color: YELLOW,
          borderRadius: '16px 16px 0 0',
        }}
      >
        <span style={{ textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          PLAQUES: {stats?.platesCount ?? '—'} | ARTISANS: {stats?.activeArtisans ?? '—'} | SATISFACTION: {stats ? `${stats.avgSatisfaction.toFixed(1)}/5` : '—'}
        </span>
        <span
          className="text-[10px] font-bold md:text-xs"
          style={{ textTransform: 'uppercase', letterSpacing: '0.08em', opacity: 0.7 }}
        >
          FeedVoice × Mairie de Dakar · Voix: Aminata · Son: {soundOn ? 'activé' : 'coupé'} · {audioUnlocked ? 'audio déverrouillé' : 'en attente de geste'}
        </span>
      </footer>
    </div>
  )
}
