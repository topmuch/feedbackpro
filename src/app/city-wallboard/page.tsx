// ============================================================
// Page /city-wallboard — Centre de Supervision Urbain — Dakar
// ------------------------------------------------------------
// Affichage TV plein écran pour la salle de supervision municipale.
// Inspiré du wallboard ops aéroport (/ops-wallboard) mais version
// allégée et thématique ville : dark + accent jaune #FFDD00 / bleu
// #1B2A8C (charte Ville Connectée).
//
// Fonctionnalités :
//   - Polling /api/city/wallboard toutes les 5s
//   - Horloge live (1s)
//   - 6 KPI cards (urgences, signalements, orientations, artisans,
//     satisfaction, revenus)
//   - Tableau incidents récents (gauche) + panneau alertes (droite)
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
// Palette charte Ville Connectée
// ---------------------------------------------------------------
const BG = '#0a0a0a'
const CARD = '#1a1a1a'
const CARD_BORDER = '#262626'
const YELLOW = '#FFDD00'
const BLUE = '#1B2A8C'
const RED = '#E30613'
const GREEN = '#00A651'
const ORANGE = '#FF6B00'
const TEXT_MUTED = '#9CA3AF'

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

/** Couleur d'accent selon le type d'incident (badges/tableau). */
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
// Carte KPI
// ---------------------------------------------------------------
type KpiProps = {
  icon: typeof Siren
  label: string
  value: string
  sub?: string
  accent: string
}

function KpiCard({ icon: Icon, label, value, sub, accent }: KpiProps) {
  return (
    <div
      className="flex flex-col gap-1 rounded-2xl p-4"
      style={{ backgroundColor: CARD, border: `1px solid ${CARD_BORDER}` }}
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: TEXT_MUTED }}>
          {label}
        </span>
        <span
          className="flex h-7 w-7 items-center justify-center rounded-lg"
          style={{ backgroundColor: `${accent}22`, color: accent }}
        >
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <div className="text-3xl font-bold tabular-nums leading-tight" style={{ color: accent }}>
        {value}
      </div>
      {sub && (
        <div className="text-[10px] uppercase tracking-wide" style={{ color: TEXT_MUTED }}>
          {sub}
        </div>
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
      if (inc.type === 'emergency') {
        const msg = service
          ? `Nouvelle urgence signalée. ${category}. ${service} notifié.`
          : `Nouvelle urgence signalée. ${category}.`
        parler(msg)
      } else if (inc.type === 'report') {
        const msg = service
          ? `Nouveau signalement. ${category}. ${service} notifié.`
          : `Nouveau signalement. ${category}.`
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
      className="flex min-h-screen flex-col text-white"
      style={{ backgroundColor: BG }}
    >
      {/* Audio caché pour le ding */}
      <audio ref={audioRef} preload="auto" />

      {/* ---------------- Header ---------------- */}
      <header
        className="flex items-center justify-between px-6 py-4"
        style={{ borderBottom: `2px solid ${YELLOW}` }}
      >
        <div className="flex items-center gap-4">
          <div
            className="flex h-12 w-12 items-center justify-center rounded-xl"
            style={{ backgroundColor: BLUE, border: `2px solid ${YELLOW}` }}
          >
            <Building2 className="h-7 w-7" style={{ color: YELLOW }} />
          </div>
          <div>
            <h1
              className="text-2xl font-extrabold leading-tight tracking-wide"
              style={{ color: YELLOW }}
            >
              CENTRE DE SUPERVISION URBAIN
            </h1>
            <p className="text-xs font-semibold uppercase tracking-[0.3em]" style={{ color: TEXT_MUTED }}>
              Ville Connectée — Dakar
            </p>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="text-right">
            <div className="flex items-center gap-2 justify-end">
              <Clock className="h-4 w-4" style={{ color: YELLOW }} />
              <span className="text-3xl font-bold tabular-nums" style={{ color: YELLOW }}>
                {now ? fmtClock(now) : '--:--:--'}
              </span>
            </div>
            <div className="text-[11px] uppercase tracking-wider" style={{ color: TEXT_MUTED }}>
              {now ? fmtDateFR(now) : 'Chargement…'}
            </div>
          </div>

          {/* Toggle son */}
          <button
            type="button"
            onClick={toggleSound}
            aria-pressed={soundOn}
            aria-label={soundOn ? 'Couper le son' : 'Activer le son (ding + annonces Aminata)'}
            title={soundOn ? 'Son activé — clic pour couper' : 'Son coupé — clic pour activer ding + annonces Aminata'}
            className="flex h-12 w-12 items-center justify-center rounded-xl transition-colors"
            style={{
              backgroundColor: soundOn ? YELLOW : CARD,
              border: `2px solid ${soundOn ? YELLOW : CARD_BORDER}`,
              color: soundOn ? BG : TEXT_MUTED,
            }}
          >
            {soundOn ? <Volume2 className="h-6 w-6" /> : <VolumeX className="h-6 w-6" />}
          </button>
        </div>
      </header>

      {/* ---------------- KPI row (6 cartes) ---------------- */}
      <section className="grid grid-cols-2 gap-3 px-6 py-4 md:grid-cols-3 lg:grid-cols-6">
        <KpiCard
          icon={Siren}
          label="Urgences"
          value={stats ? String(stats.pendingEmergencies) : '—'}
          sub="Non résolues"
          accent={RED}
        />
        <KpiCard
          icon={Megaphone}
          label="Signalements"
          value={stats ? String(stats.pendingReports) : '—'}
          sub="En attente"
          accent={ORANGE}
        />
        <KpiCard
          icon={Compass}
          label="Orientations"
          value={stats ? String(stats.resolvedToday) : '—'}
          sub="Résolus aujourd'hui"
          accent={BLUE}
        />
        <KpiCard
          icon={Wrench}
          label="Artisans"
          value={stats ? String(stats.activeArtisans) : '—'}
          sub="Actifs"
          accent={YELLOW}
        />
        <KpiCard
          icon={Star}
          label="Satisfaction"
          value={stats ? stats.avgSatisfaction.toFixed(1) : '—'}
          sub="Citoyens (mock)"
          accent={YELLOW}
        />
        <KpiCard
          icon={Wallet}
          label="Revenus"
          value={stats ? fmtFCFA(stats.revenueTotal) : '—'}
          sub="Cumul (mock)"
          accent={GREEN}
        />
      </section>

      {/* ---------------- Bandeau contextuel ---------------- */}
      <div className="flex items-center gap-4 px-6 text-xs" style={{ color: TEXT_MUTED }}>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full animate-pulse" style={{ backgroundColor: GREEN }} />
          Live — màj toutes les 5s
        </span>
        {stats && (
          <>
            <span>·</span>
            <span>{stats.totalIncidents24h} incidents (24h)</span>
            <span>·</span>
            <span>{stats.platesCount} plaques QR</span>
          </>
        )}
        {error && (
          <>
            <span>·</span>
            <span style={{ color: RED }}>Erreur : {error}</span>
          </>
        )}
      </div>

      {/* ---------------- Grille principale : tableau | alertes ---------------- */}
      <section className="grid flex-1 grid-cols-1 gap-4 px-6 py-4 lg:grid-cols-[2fr_1fr]">
        {/* ---- Tableau incidents récents (gauche) ---- */}
        <div
          className="flex flex-col overflow-hidden rounded-2xl"
          style={{ backgroundColor: CARD, border: `1px solid ${CARD_BORDER}` }}
        >
          <div
            className="flex items-center justify-between px-4 py-3"
            style={{ borderBottom: `1px solid ${CARD_BORDER}` }}
          >
            <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider">
              <AlertTriangle className="h-4 w-4" style={{ color: YELLOW }} />
              Incidents récents
            </h2>
            <span className="text-[11px]" style={{ color: TEXT_MUTED }}>
              10 derniers · tous types
            </span>
          </div>

          <div className="max-h-[calc(100vh-360px)] overflow-y-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0" style={{ backgroundColor: CARD }}>
                <tr className="text-[10px] uppercase tracking-wider" style={{ color: TEXT_MUTED }}>
                  <th className="px-4 py-2 font-semibold">Type</th>
                  <th className="px-4 py-2 font-semibold">Catégorie</th>
                  <th className="px-4 py-2 font-semibold">Lieu</th>
                  <th className="px-4 py-2 font-semibold">Statut</th>
                  <th className="px-4 py-2 font-semibold">Service</th>
                  <th className="px-4 py-2 text-right font-semibold">Il y a</th>
                </tr>
              </thead>
              <tbody>
                {data?.recentIncidents.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center" style={{ color: TEXT_MUTED }}>
                      Aucun incident récent.
                    </td>
                  </tr>
                )}
                {data?.recentIncidents.map((inc) => {
                  const tcol = typeColor(inc.type)
                  return (
                    <tr
                      key={inc.id}
                      className="border-t"
                      style={{ borderColor: CARD_BORDER }}
                    >
                      <td className="px-4 py-2.5">
                        <span
                          className="inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-bold uppercase"
                          style={{ backgroundColor: `${tcol}22`, color: tcol }}
                        >
                          {typeLabel(inc.type)}
                        </span>
                      </td>
                      <td className="px-4 py-2.5" style={{ color: '#E5E7EB' }}>
                        {inc.category ?? '—'}
                      </td>
                      <td className="px-4 py-2.5">
                        {inc.plate ? (
                          <span className="flex items-center gap-1.5">
                            <MapPin className="h-3.5 w-3.5" style={{ color: YELLOW }} />
                            <span className="text-xs">
                              {inc.plate.label}
                              {inc.plate.district ? ` · ${inc.plate.district}` : ''}
                            </span>
                          </span>
                        ) : (
                          <span className="text-xs" style={{ color: TEXT_MUTED }}>Hors plaque</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <span
                          className="text-[11px] font-bold uppercase tracking-wide"
                          style={{ color: statusColor(inc.status) }}
                        >
                          {statusLabel(inc.status)}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-xs" style={{ color: '#E5E7EB' }}>
                        {inc.assignedTo ?? '—'}
                      </td>
                      <td className="px-4 py-2.5 text-right text-xs tabular-nums" style={{ color: TEXT_MUTED }}>
                        {fmtTimeAgo(inc.createdAt)}
                      </td>
                    </tr>
                  )
                })}
                {!data && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center" style={{ color: TEXT_MUTED }}>
                      Chargement des incidents…
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* ---- Panneau alertes (droite) ---- */}
        <div
          className="flex flex-col gap-3 overflow-hidden rounded-2xl"
          style={{ backgroundColor: CARD, border: `1px solid ${CARD_BORDER}` }}
        >
          <div
            className="flex items-center justify-between px-4 py-3"
            style={{ borderBottom: `1px solid ${CARD_BORDER}` }}
          >
            <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider">
              <Siren className="h-4 w-4" style={{ color: RED }} />
              Alertes actives
            </h2>
            <span
              className="rounded-md px-2 py-0.5 text-[11px] font-bold"
              style={{ backgroundColor: `${RED}22`, color: RED }}
            >
              {activeEmergencies.length} urgences
            </span>
          </div>

          <div className="max-h-[calc(100vh-360px)] overflow-y-auto px-4 pb-4">
            <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: TEXT_MUTED }}>
              Urgences en cours
            </div>
            <div className="mt-2 flex flex-col gap-2">
              {activeEmergencies.length === 0 && (
                <div className="rounded-lg p-3 text-xs" style={{ backgroundColor: BG, color: TEXT_MUTED }}>
                  Aucune urgence active.
                </div>
              )}
              {activeEmergencies.map((inc) => (
                <div
                  key={inc.id}
                  className="rounded-lg p-3"
                  style={{
                    backgroundColor: BG,
                    border: `1px solid ${RED}55`,
                    boxShadow: `0 0 0 1px ${RED}22 inset`,
                  }}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase" style={{ color: RED }}>
                      {inc.category ?? 'Urgence'}
                    </span>
                    <span className="text-[10px] tabular-nums" style={{ color: TEXT_MUTED }}>
                      {fmtTimeAgo(inc.createdAt)}
                    </span>
                  </div>
                  <div className="mt-1 text-xs" style={{ color: '#E5E7EB' }}>
                    {inc.plate?.label ?? 'Lieu inconnu'}
                  </div>
                  <div className="mt-1 text-[11px]" style={{ color: YELLOW }}>
                    → {inc.assignedTo ?? 'Non assigné'}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 text-[10px] font-semibold uppercase tracking-wider" style={{ color: TEXT_MUTED }}>
              Signalements en attente
            </div>
            <div className="mt-2 flex flex-col gap-2">
              {pendingReportsList.length === 0 && (
                <div className="rounded-lg p-3 text-xs" style={{ backgroundColor: BG, color: TEXT_MUTED }}>
                  Aucun signalement en attente.
                </div>
              )}
              {pendingReportsList.map((inc) => (
                <div
                  key={inc.id}
                  className="rounded-lg p-3"
                  style={{ backgroundColor: BG, border: `1px solid ${CARD_BORDER}` }}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase" style={{ color: ORANGE }}>
                      {inc.category ?? 'Signalement'}
                    </span>
                    <span className="text-[10px] tabular-nums" style={{ color: TEXT_MUTED }}>
                      {fmtTimeAgo(inc.createdAt)}
                    </span>
                  </div>
                  <div className="mt-1 text-xs" style={{ color: '#E5E7EB' }}>
                    {inc.plate?.label ?? 'Hors plaque'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ---------------- Footer ---------------- */}
      <footer
        className="flex items-center justify-between px-6 py-2 text-[10px] uppercase tracking-wider"
        style={{ borderTop: `1px solid ${CARD_BORDER}`, color: TEXT_MUTED }}
      >
        <span>FeedVoice × Mairie de Dakar — Ville Connectée</span>
        <span>
          Voix : Aminata · Son : {soundOn ? 'activé' : 'coupé'} · {audioUnlocked ? 'audio déverrouillé' : 'en attente de geste'}
        </span>
      </footer>
    </div>
  )
}
