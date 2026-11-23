'use client'

// ============================================================
// <CityDashboard /> — Centre de Supervision Urbain
// ------------------------------------------------------------
// Module Ville Connectée — FeedVoice × Mairie de Dakar
// Vue pilotage pour le Directeur de Supervision : KPIs temps réel,
// cartographie des plaques QR, alertes citoyennes, monétisation
// artisans (premium) et assistant Aminata.
//
// Layout :
//   ┌───────────────┬─────────────────────────────────────────┐
//   │ SIDEBAR 280px │ HEADER (titre + date + actions)         │
//   │ #1A1A1A       ├─────────────────────────────────────────┤
//   │               │ KPI GRID (6 cards)                      │
//   │ Supervision   ├─────────────────────────────────────────┤
//   │ Services      │ CONTENT GRID (2fr / 1fr)                │
//   │ Administration│   Left  : Carte + Heatmap quartiers     │
//   │               │   Right : Alertes + Revenus + Aminata   │
//   │ User + Logout └─────────────────────────────────────────┘
//
// Auto-contained : fetch ses propres données depuis /api/city/*
// Responsive : sidebar se replie en drawer sous lg (toggle burger).
// ============================================================

import { useEffect, useState, useCallback, useRef } from 'react'
import {
  Loader2,
  RefreshCw,
  Download,
  MapPin,
  AlertTriangle,
  Bell,
  TrendingUp,
  Users,
  Star,
  Building2,
  LogOut,
  Menu,
  X,
  Activity,
  Wrench,
  Bus,
  Landmark,
  Users2,
  QrCode,
  Wallet,
  FileBarChart,
  Settings,
  Radio,
  Volume2,
  VolumeX,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useAppStore } from '@/store/app-store'
import { useToast } from '@/hooks/use-toast'
import { parler } from '@/lib/staff-tts'

// ---------------------------------------------------------------
// Types — shape des réponses API
// ---------------------------------------------------------------

type CityPlate = {
  id: string
  plateNumber: string
  qrToken: string
  label: string
  district: string | null
  address: string | null
  lat: number | null
  lng: number | null
  status: string
  installedAt: string
  lastScanAt: string | null
  scanCount: number
}

type CityIncident = {
  id: string
  plateId: string | null
  plate: {
    id: string
    plateNumber: string
    label: string
    district: string | null
  } | null
  qrToken: string | null
  type: string
  category: string | null
  description: string | null
  gpsLat: number | null
  gpsLng: number | null
  status: string
  assignedTo: string | null
  staffName: string | null
  resolvedAt: string | null
  createdAt: string
}

type CityArtisan = {
  id: string
  name: string
  trade: string
  phone: string
  district: string | null
  address: string | null
  verified: boolean
  premium: boolean
  rating: number
  reviewCount: number
  contactCount: number
  active: boolean
}

// ---------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------

/** Horloge live HH:MM:SS — initialisée côté client pour éviter un
 *  hydration mismatch (le serveur et le client ne sont pas à la
 *  même seconde). */
function useClock(): string {
  const [now, setNow] = useState<Date | null>(null)
  useEffect(() => {
    const initial = setTimeout(() => setNow(new Date()), 0)
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => {
      clearTimeout(initial)
      clearInterval(t)
    }
  }, [])
  if (!now) return '--:--:--'
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
}

function formatDateLong(d: Date): string {
  return d.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })
}

/** Formate un timestamp ISO en "il y a X min/h" pour les alertes. */
function timeAgo(iso: string): string {
  const then = new Date(iso).getTime()
  const diff = Date.now() - then
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'à l\'instant'
  if (min < 60) return `il y a ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `il y a ${h} h`
  const d = Math.floor(h / 24)
  return `il y a ${d} j`
}

/** Traduit un type d'incident en libellé français lisible. */
function incidentTypeLabel(type: string): string {
  switch (type) {
    case 'emergency':
      return 'Urgence'
    case 'report':
      return 'Signalement'
    case 'orientation':
      return 'Orientation'
    case 'artisan':
      return 'Artisan'
    case 'mairie':
      return 'Mairie'
    default:
      return type
  }
}

/** Vérifie si une date ISO correspond à aujourd'hui (local). */
function isToday(iso: string): boolean {
  const d = new Date(iso)
  const now = new Date()
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  )
}

// ---------------------------------------------------------------
// Navigation sidebar
// ---------------------------------------------------------------

type NavItem = {
  id: string
  label: string
  icon: typeof Activity
  badge?: 'count' | 'red'
}

type NavSection = {
  title: string
  items: NavItem[]
}

const NAV_SECTIONS: readonly NavSection[] = [
  {
    title: 'Supervision',
    items: [
      { id: 'overview', label: "Vue d'ensemble", icon: Activity },
      { id: 'plates-map', label: 'Carte des plaques', icon: MapPin, badge: 'count' },
      { id: 'emergencies', label: 'Urgences', icon: AlertTriangle, badge: 'red' },
      { id: 'reports', label: 'Signalements', icon: Bell, badge: 'count' },
    ],
  },
  {
    title: 'Services',
    items: [
      { id: 'artisans', label: 'Artisans vérifiés', icon: Wrench },
      { id: 'transports', label: 'Transports', icon: Bus },
      { id: 'mairie-dynamic', label: 'Mairie dynamique', icon: Landmark },
    ],
  },
  {
    title: 'Administration',
    items: [
      { id: 'teams', label: 'Équipes terrain', icon: Users2 },
      { id: 'plates-mgmt', label: 'Gestion plaques', icon: QrCode },
      { id: 'revenue', label: 'Revenus', icon: Wallet },
      { id: 'reports-mgmt', label: 'Rapports', icon: FileBarChart },
      { id: 'settings', label: 'Paramètres', icon: Settings },
    ],
  },
] as const

// ---------------------------------------------------------------
// Palette design — or/anthracite/crème
// ---------------------------------------------------------------

const COLOR_RED = '#E30613'
const COLOR_ORANGE = '#FF6B00'
const COLOR_BLUE = '#0066CC'
const COLOR_GREEN = '#00A651'
const COLOR_GOLD = '#C9A961'
const COLOR_PURPLE = '#6B4C9A'
const COLOR_ANTHRACITE = '#1A1A1A'
const COLOR_CREAM = '#FAFAF7'

// ---------------------------------------------------------------
// Mock data (infrastructures hors-API)
// ---------------------------------------------------------------

const HEATMAP_DATA = [
  { district: 'Plateau', value: 85 },
  { district: 'Médina', value: 65 },
  { district: 'Grand Dakar', value: 45 },
  { district: 'Parcelles', value: 38 },
  { district: 'Yoff', value: 28 },
  { district: 'Pikine', value: 22 },
] as const

const AMINATA_MESSAGE = {
  text: 'Bonjour chers habitants de Dakar, la collecte des déchets aura lieu ce matin dans les quartiers de Plateau et Médina. Merci de sortir vos bacs avant 7h.',
  timestamp: 'il y a 12 min',
}

// ============================================================
// Composant principal
// ============================================================

export default function CityDashboard() {
  // --- États données ---
  const [plates, setPlates] = useState<CityPlate[]>([])
  const [incidents, setIncidents] = useState<CityIncident[]>([])
  const [artisans, setArtisans] = useState<CityArtisan[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  // --- Voix Denise (TTS) + sons ---
  const [soundOn, setSoundOn] = useState(false)
  const [showSoundBanner, setShowSoundBanner] = useState(false)
  const seenIdsRef = useRef<Set<string>>(new Set())
  const firstPollRef = useRef(true)
  const alertedLateRef = useRef<Set<string>>(new Set())

  // --- États UI ---
  const [activeNav, setActiveNav] = useState('overview')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [today, setToday] = useState<Date | null>(null)
  const clock = useClock()

  // --- Store & toast ---
  const session = useAppStore((s) => s.session)
  const logout = useAppStore((s) => s.logout)
  const setView = useAppStore((s) => s.setView)
  const { toast } = useToast()

  // --- Mount SSR-safe ---
  useEffect(() => {
    const t = setTimeout(() => {
      setMounted(true)
      setToday(new Date())
    }, 0)
    return () => clearTimeout(t)
  }, [])

  // --- Fetch des données depuis les 3 APIs ---
  const loadData = useCallback(async () => {
    try {
      const [platesRes, incRes, artRes] = await Promise.all([
        fetch('/api/city/plates').then((r) => r.json()),
        fetch('/api/city/incidents').then((r) => r.json()),
        fetch('/api/city/artisans').then((r) => r.json()),
      ])
      if (platesRes?.ok) setPlates(platesRes.data.plates)
      if (incRes?.ok) setIncidents(incRes.data.incidents)
      if (artRes?.ok) setArtisans(artRes.data.artisans)
    } catch (e) {
      console.error('[city-dashboard] erreur fetch :', e)
      toast({
        title: 'Erreur de chargement',
        description: 'Impossible de récupérer les données ville.',
      })
    }
  }, [toast])

  // --- Chargement initial ---
  useEffect(() => {
    if (!mounted) return
    const t = setTimeout(() => {
      loadData().finally(() => setLoading(false))
    }, 0)
    return () => clearTimeout(t)
  }, [mounted, loadData])

  // --- Préférence son (localStorage) ---
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        const saved = localStorage.getItem('city_sound')
        if (saved === '1') {
          setSoundOn(true)
        } else {
          setShowSoundBanner(true)
          const dismiss = setTimeout(() => setShowSoundBanner(false), 15000)
          return () => clearTimeout(dismiss)
        }
      } catch { /* ignore */ }
    }, 0)
    return () => clearTimeout(t)
  }, [])

  // --- Sons (Web Audio API) ---
  const playDing = useCallback(() => {
    try {
      const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain); gain.connect(ctx.destination)
      osc.frequency.value = 880; osc.type = 'sine'
      gain.gain.setValueAtTime(0.3, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5)
      osc.start(); osc.stop(ctx.currentTime + 0.5)
    } catch { /* ignore */ }
  }, [])

  const playEscalation = useCallback(() => {
    try {
      const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
      const freqs = [990, 880, 990]
      freqs.forEach((freq, i) => {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.connect(gain); gain.connect(ctx.destination)
        osc.frequency.value = freq; osc.type = 'sine'
        const start = ctx.currentTime + i * 0.22
        gain.gain.setValueAtTime(0.3, start)
        gain.gain.exponentialRampToValueAtTime(0.01, start + 0.18)
        osc.start(start); osc.stop(start + 0.18)
      })
    } catch { /* ignore */ }
  }, [])

  // --- Détection nouveaux incidents + rappel retard (Denise TTS) ---
  useEffect(() => {
    if (!incidents || incidents.length === 0) return
    const isFirst = firstPollRef.current
    firstPollRef.current = false
    const nowMs = Date.now()

    for (const inc of incidents) {
      if (inc.status === 'resolved') continue
      // Nouvel incident détecté
      if (!seenIdsRef.current.has(inc.id)) {
        seenIdsRef.current.add(inc.id)
        if (!isFirst && soundOn) {
          playDing()
          const isEmergency = inc.type === 'emergency'
          const categoryLabel = inc.category || inc.type
          const serviceLabel = inc.assignedTo || 'Mairie'
          setTimeout(() => {
            parler(
              isEmergency
                ? `Urgence signalée. ${categoryLabel}. ${serviceLabel} alerté. Intervention requise.`
                : `Nouveau signalement. ${categoryLabel}. Routé vers ${serviceLabel}.`
            )
          }, 300)
        }
      }
      // Rappel retard (> 10 min sans résolution)
      const elapsedMin = Math.floor((nowMs - new Date(inc.createdAt).getTime()) / 60000)
      if (elapsedMin >= 10) {
        const lateKey = `${inc.id}-${Math.floor(elapsedMin / 5) * 5}min`
        if (!alertedLateRef.current.has(lateKey)) {
          alertedLateRef.current.add(lateKey)
          if (soundOn && !isFirst) {
            playEscalation()
            setTimeout(() => {
              parler(
                `Signalement en retard. ${elapsedMin} minutes écoulées. ${inc.category || inc.type}. ${inc.assignedTo || 'Mairie'}. Intervention requise.`
              )
            }, 300)
          }
        }
      }
    }
    // Nettoie les IDs résolus
    for (const id of [...seenIdsRef.current]) {
      const inc = incidents.find((i) => i.id === id)
      if (!inc || inc.status === 'resolved') {
        seenIdsRef.current.delete(id)
      }
    }
  }, [incidents, soundOn, playDing, playEscalation])

  // --- Polling 10s (incidents temps réel) ---
  useEffect(() => {
    if (!mounted || loading) return
    const interval = setInterval(() => {
      fetch('/api/city/incidents', { cache: 'no-store' })
        .then((r) => r.json())
        .then((json) => {
          if (json?.ok && json.data?.incidents) {
            setIncidents(json.data.incidents)
          }
        })
        .catch(() => {})
    }, 10000)
    return () => clearInterval(interval)
  }, [mounted, loading])

  // --- Toggle son ---
  const toggleSound = useCallback(() => {
    setSoundOn((prev) => {
      const next = !prev
      try { localStorage.setItem('city_sound', next ? '1' : '0') } catch { /* ignore */ }
      setShowSoundBanner(false)
      if (next) {
        playDing()
        setTimeout(() => parler('Voix Denise activée. Je surveille les alertes de la ville.'), 300)
      }
      return next
    })
  }, [playDing])

  // --- Actions ---
  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    await loadData()
    setRefreshing(false)
    toast({
      title: 'Données actualisées',
      description: 'Les KPIs urbains sont à jour.',
    })
  }, [loadData, toast])

  const handleExport = useCallback(() => {
    toast({
      title: 'Rapport généré',
      description: 'Le rapport PDF a été téléchargé dans votre dossier.',
    })
  }, [toast])

  const handleLogout = useCallback(async () => {
    await logout()
    setView('landing')
  }, [logout, setView])

  // --- KPIs dérivés (mémoïsés par calcul direct, pas cher) ---
  const kpis = {
    urgences: incidents.filter(
      (i) => i.type === 'emergency' && i.status !== 'resolved',
    ).length,
    signalements: incidents.filter(
      (i) => i.type === 'report' && i.status !== 'resolved',
    ).length,
    orientations: incidents.filter(
      (i) => i.type === 'orientation' && isToday(i.createdAt),
    ).length,
    artisansContactes: artisans.reduce((sum, a) => sum + a.contactCount, 0),
    satisfaction: 4.6,
  }

  const platesActive = plates.filter((p) => p.status === 'active').length
  const platesMaintenance = plates.filter(
    (p) => p.status === 'maintenance',
  ).length
  const platesOffline = plates.filter((p) => p.status === 'offline').length
  const platesUrgence = incidents.filter(
    (i) => i.type === 'emergency' && i.plateId,
  ).length

  // --- Alertes récentes (10 max) ---
  const recentAlerts = incidents.slice(0, 10)

  // --- SSR-safe : on ne rend rien côté serveur pour éviter l'hydration mismatch ---
  if (!mounted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#FAFAF7]">
        <div className="text-center">
          <span className="text-4xl">🏙️</span>
          <p className="mt-3 font-mono text-sm text-[#1A1A1A]/60">
            Chargement du Centre de Supervision…
          </p>
        </div>
      </div>
    )
  }

  // --- Loading spinner ---
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#FAFAF7]">
        <div className="text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-[#C9A961]" />
          <p className="mt-3 font-mono text-sm text-[#1A1A1A]/60">
            Connexion au Centre de Supervision Urbain…
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#FAFAF7] font-sans text-[#1A1A1A]">
      {/* ---------- BURGER (mobile) ---------- */}
      <button
        type="button"
        onClick={() => setSidebarOpen(true)}
        className="fixed left-3 top-3 z-40 inline-flex h-10 w-10 items-center justify-center rounded-lg border border-[#EAE5DC] bg-white shadow-sm lg:hidden"
        aria-label="Ouvrir le menu"
      >
        <Menu className="h-5 w-5 text-[#1A1A1A]" />
      </button>

      {/* ---------- SIDEBAR ---------- */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-30 flex w-[280px] flex-col bg-[#1A1A1A] text-[#FAFAF7] transition-transform duration-300 lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        {/* Logo */}
        <div className="flex items-center gap-2.5 px-5 pb-4 pt-5">
          <span className="text-2xl" aria-hidden>
            🏙️
          </span>
          <div className="min-w-0 flex-1">
            <h1
              className="truncate text-sm font-bold leading-tight text-[#FAFAF7]"
              style={{ fontFamily: 'Georgia, "Playfair Display", serif' }}
            >
              FeedVoice · Ville Connectée
            </h1>
            <p className="text-[11px] leading-tight text-[#FAFAF7]/60">
              Dakar · Centre de Supervision
            </p>
          </div>
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[#FAFAF7]/60 hover:bg-white/5 hover:text-[#FAFAF7] lg:hidden"
            aria-label="Fermer le menu"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Navigation scrollable */}
        <nav
          className="min-h-0 flex-1 overflow-y-auto px-3 py-2"
          aria-label="Navigation principale"
        >
          {NAV_SECTIONS.map((section) => (
            <div key={section.title} className="mb-4">
              <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#FAFAF7]/40">
                {section.title}
              </p>
              <ul className="space-y-0.5">
                {section.items.map((item) => {
                  const active = activeNav === item.id
                  const Icon = item.icon
                  const badgeValue =
                    item.badge === 'count'
                      ? item.id === 'plates-map'
                        ? plates.length
                        : item.id === 'reports'
                          ? kpis.signalements
                          : 0
                      : item.badge === 'red'
                        ? kpis.urgences
                        : 0
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setActiveNav(item.id)
                          setSidebarOpen(false)
                        }}
                        aria-current={active ? 'page' : undefined}
                        className={cn(
                          'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                          active
                            ? 'bg-[#C9A961] text-[#1A1A1A]'
                            : 'text-[#FAFAF7]/75 hover:bg-white/5 hover:text-[#FAFAF7]',
                        )}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        <span className="min-w-0 flex-1 truncate text-left">
                          {item.label}
                        </span>
                        {item.badge && badgeValue > 0 && (
                          <span
                            className={cn(
                              'inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[10px] font-bold tabular-nums',
                              item.badge === 'red'
                                ? 'bg-[#E30613] text-white'
                                : active
                                  ? 'bg-[#1A1A1A]/15 text-[#1A1A1A]'
                                  : 'bg-white/10 text-[#FAFAF7]',
                            )}
                          >
                            {badgeValue}
                          </span>
                        )}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </nav>

        {/* User + Logout */}
        <div className="border-t border-white/10 px-4 py-3">
          <div className="mb-2 flex items-center gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#C9A961] text-sm font-bold text-[#1A1A1A]">
              OD
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-[#FAFAF7]">
                Ousmane Diallo
              </p>
              <p className="truncate text-[10px] text-[#FAFAF7]/60">
                Directeur Supervision
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLogout}
            className="w-full justify-start gap-2 text-[#FAFAF7]/70 hover:bg-white/5 hover:text-[#FAFAF7]"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span className="text-xs">Déconnexion</span>
          </Button>
        </div>
      </aside>

      {/* Overlay (mobile) */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden
        />
      )}

      {/* ---------- MAIN ---------- */}
      <div className="lg:pl-[280px]">
        {/* Header */}
        <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-[#EAE5DC] bg-white/95 px-4 backdrop-blur sm:px-6 lg:px-8">
          <div className="ml-10 flex items-center gap-3 lg:ml-0">
            <div className="flex items-center gap-2">
              <span className="text-xl" aria-hidden>
                🏙️
              </span>
              <div>
                <h2
                  className="text-base font-bold leading-tight text-[#1A1A1A]"
                  style={{ fontFamily: 'Georgia, "Playfair Display", serif' }}
                >
                  Centre de Supervision Urbaine
                </h2>
                <p
                  className="text-[11px] text-[#1A1A1A]/55"
                  suppressHydrationWarning
                >
                  {today ? formatDateLong(today) : ''} · {clock}
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Toggle son Denise */}
            <Button
              variant="outline"
              size="sm"
              onClick={toggleSound}
              title={soundOn ? "Désactiver la voix Denise" : "Activer la voix Denise"}
              className={cn(
                "border-[#EAE5DC] bg-white hover:border-[#C9A961]",
                soundOn ? "text-[#C9A961] border-[#C9A961]/40 bg-[#C9A961]/8" : "text-[#1A1A1A]"
              )}
            >
              {soundOn ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
              <span className="hidden sm:inline">{soundOn ? "Son ON" : "Son OFF"}</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={refreshing}
              className="border-[#EAE5DC] bg-white text-[#1A1A1A] hover:border-[#C9A961] hover:bg-[#FAFAF7]"
            >
              <RefreshCw
                className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')}
              />
              <span className="hidden sm:inline">Actualiser</span>
            </Button>
            <Button
              size="sm"
              onClick={handleExport}
              className="bg-[#C9A961] text-[#1A1A1A] hover:bg-[#B8964F]"
            >
              <Download className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Exporter rapport</span>
            </Button>
          </div>
        </header>

        {/* Bannière activation sonore */}
        {showSoundBanner && !soundOn && (
          <div className="mb-4 flex items-center justify-between rounded-xl border border-[#C9A961]/30 bg-[#C9A961]/8 px-4 py-3">
            <div className="flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#C9A961]/15">
                <Volume2 className="h-4 w-4 text-[#C9A961]" />
              </span>
              <div>
                <p className="text-sm font-semibold text-[#1A1A1A]">
                  Activez la voix Denise pour les alertes vocales
                </p>
                <p className="text-xs text-[#1A1A1A]/60">
                  Ding + annonces vocales à chaque nouveau signalement
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={toggleSound} className="bg-[#4A7C59] text-white hover:bg-[#3D6B4D]">
                <Volume2 className="h-3.5 w-3.5 mr-1" /> Activer
              </Button>
              <button
                type="button"
                onClick={() => setShowSoundBanner(false)}
                className="text-[#1A1A1A]/40 hover:text-[#1A1A1A] p-1"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* Contenu principal */}
        <main className="px-4 py-5 sm:px-6 lg:px-8">
          {/* ---------- KPI GRID ---------- */}
          <section className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-6">
            <KpiCard
              title="Urgences actives"
              value={kpis.urgences}
              sub="Police notifiée"
              color={COLOR_RED}
              icon={AlertTriangle}
              critical
            />
            <KpiCard
              title="Signalements"
              value={kpis.signalements}
              sub="En cours de traitement"
              color={COLOR_ORANGE}
              icon={Bell}
              warning
            />
            <KpiCard
              title="Orientations"
              value={kpis.orientations}
              sub="Aujourd'hui"
              color={COLOR_BLUE}
              icon={Radio}
            />
            <KpiCard
              title="Artisans contactés"
              value={kpis.artisansContactes}
              sub="Cumul via Aminata"
              color={COLOR_GREEN}
              icon={Users}
              success
            />
            <KpiCard
              title="Satisfaction"
              value={`${kpis.satisfaction}/5`}
              sub="Évaluation citoyenne"
              color={COLOR_GOLD}
              icon={Star}
            />
            <KpiCard
              title="Revenus artisans"
              value="18.4M FCFA"
              sub="Part mairie 5.5M"
              color={COLOR_GREEN}
              icon={TrendingUp}
              success
            />
          </section>

          {/* ---------- CONTENT GRID (2fr / 1fr) ---------- */}
          <section className="grid grid-cols-1 gap-5 xl:grid-cols-[2fr_1fr]">
            {/* === LEFT COLUMN === */}
            <div className="space-y-5">
              {/* Carte des plaques */}
              <Panel title="Carte des plaques QR" icon={MapPin} subtitle={`${plates.length} plaques installées`}>
                <div className="relative h-[320px] overflow-hidden rounded-xl bg-gradient-to-br from-[#0a2a4a] via-[#1A1A1A] to-[#0a1f3a] sm:h-[360px]">
                  {/* Grille de fond */}
                  <div
                    className="absolute inset-0 opacity-20"
                    style={{
                      backgroundImage:
                        'linear-gradient(rgba(201,169,97,0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(201,169,97,0.15) 1px, transparent 1px)',
                      backgroundSize: '40px 40px',
                    }}
                    aria-hidden
                  />

                  {/* Pins plaques (positions simulées sur le Dakar métropolitain) */}
                  <div className="absolute inset-0">
                    {plates.slice(0, 12).map((p, i) => {
                      const isEmergency =
                        incidents.some(
                          (inc) =>
                            inc.plateId === p.id && inc.type === 'emergency',
                        )
                      const color = isEmergency
                        ? COLOR_RED
                        : p.status === 'maintenance'
                          ? COLOR_ORANGE
                          : p.status === 'offline'
                            ? '#666'
                            : COLOR_GOLD
                      // Distribue les pins dans un cadre décentré
                      const left = 15 + (i % 6) * 13 + ((i % 3) * 2)
                      const top = 20 + Math.floor(i / 6) * 35
                      return (
                        <div
                          key={p.id}
                          className="absolute flex flex-col items-center"
                          style={{ left: `${left}%`, top: `${top}%` }}
                          title={`${p.plateNumber} · ${p.label}`}
                        >
                          <div
                            className={cn(
                              'flex h-6 w-6 items-center justify-center rounded-full border-2 text-[9px] font-bold text-white shadow-lg',
                              isEmergency && 'animate-pulse',
                            )}
                            style={{
                              backgroundColor: color,
                              borderColor: 'rgba(255,255,255,0.4)',
                            }}
                          >
                            <MapPin className="h-3 w-3" />
                          </div>
                          <span className="mt-0.5 hidden rounded bg-black/60 px-1 text-[8px] text-white sm:block">
                            {p.plateNumber}
                          </span>
                        </div>
                      )
                    })}
                  </div>

                  {/* Légende */}
                  <div className="absolute bottom-3 left-3 right-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-lg bg-black/60 px-3 py-2 backdrop-blur">
                    <LegendDot color={COLOR_GOLD} label={`Actives (${platesActive})`} />
                    <LegendDot color={COLOR_ORANGE} label={`Maintenance (${platesMaintenance})`} />
                    <LegendDot color={COLOR_RED} label={`Urgences (${platesUrgence})`} />
                    <LegendDot color="#666" label={`Hors ligne (${platesOffline})`} />
                  </div>

                  {/* Badge nombre */}
                  <div className="absolute right-3 top-3 rounded-lg bg-[#C9A961] px-3 py-1.5 text-xs font-bold text-[#1A1A1A]">
                    {plates.length} plaques
                  </div>
                </div>
              </Panel>

              {/* Heatmap par quartier */}
              <Panel
                title="Densité d'activité par quartier"
                icon={Activity}
                subtitle="Scans QR / 24h"
              >
                <div className="space-y-3 px-1 pb-1">
                  {HEATMAP_DATA.map((row) => {
                    const isHigh = row.value >= 60
                    const isMid = row.value >= 35 && row.value < 60
                    const barColor = isHigh
                      ? COLOR_RED
                      : isMid
                        ? COLOR_ORANGE
                        : COLOR_BLUE
                    return (
                      <div key={row.district} className="flex items-center gap-3">
                        <div className="w-24 shrink-0 text-xs font-medium text-[#1A1A1A]">
                          {row.district}
                        </div>
                        <div className="h-6 flex-1 overflow-hidden rounded-md bg-[#F2EEE5]">
                          <div
                            className="flex h-full items-center justify-end rounded-md px-2 text-[10px] font-bold text-white transition-all"
                            style={{
                              width: `${row.value}%`,
                              backgroundColor: barColor,
                            }}
                          >
                            {row.value}%
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </Panel>
            </div>

            {/* === RIGHT COLUMN === */}
            <div className="space-y-5">
              {/* Alertes récentes */}
              <Panel
                title="Alertes en direct"
                icon={Bell}
                subtitle={`${recentAlerts.length} récentes`}
                accent={kpis.urgences > 0 ? COLOR_RED : undefined}
              >
                <div className="space-y-2">
                  {recentAlerts.length === 0 && (
                    <p className="px-1 py-4 text-center text-xs text-[#1A1A1A]/50">
                      Aucune alerte. La ville est calme.
                    </p>
                  )}
                  {recentAlerts.map((inc) => {
                    const isEmergency = inc.type === 'emergency'
                    const borderColor = isEmergency
                      ? COLOR_RED
                      : inc.type === 'report'
                        ? COLOR_ORANGE
                        : inc.type === 'orientation'
                          ? COLOR_BLUE
                          : COLOR_PURPLE
                    const plateLabel = inc.plate
                      ? `${inc.plate.plateNumber} · ${inc.plate.label}`
                      : 'Position GPS citoyen'
                    return (
                      <div
                        key={inc.id}
                        className="rounded-lg border-l-4 bg-[#FAFAF7] px-3 py-2.5"
                        style={{ borderLeftColor: borderColor }}
                      >
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <span
                            className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white"
                            style={{ backgroundColor: borderColor }}
                          >
                            {incidentTypeLabel(inc.type)}
                          </span>
                          <span className="text-[10px] text-[#1A1A1A]/50">
                            {timeAgo(inc.createdAt)}
                          </span>
                        </div>
                        <p className="line-clamp-2 text-xs font-medium text-[#1A1A1A]">
                          {inc.description ??
                            (inc.category
                              ? `Catégorie : ${inc.category}`
                              : incidentTypeLabel(inc.type))}
                        </p>
                        <div className="mt-1.5 flex items-center justify-between gap-2">
                          <span className="flex items-center gap-1 text-[10px] text-[#1A1A1A]/55">
                            <MapPin className="h-3 w-3" />
                            <span className="truncate">{plateLabel}</span>
                          </span>
                          {inc.assignedTo && (
                            <Badge
                              variant="outline"
                              className="border-[#EAE5DC] text-[9px] font-semibold text-[#1A1A1A]/70"
                            >
                              {inc.assignedTo}
                            </Badge>
                          )}
                        </div>
                        {/* Actions */}
                        <div className="mt-2 flex items-center gap-1.5">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-6 border-[#EAE5DC] px-2 text-[10px] text-[#1A1A1A] hover:border-[#C9A961] hover:bg-[#FAFAF7]"
                          >
                            Traiter
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-[10px] text-[#1A1A1A]/60 hover:bg-[#F2EEE5] hover:text-[#1A1A1A]"
                          >
                            Détails
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </Panel>

              {/* Revenus artisans (dark) */}
              <div className="overflow-hidden rounded-2xl bg-gradient-to-br from-[#1A1A1A] to-[#2C2C2C] p-5 text-[#FAFAF7] shadow-sm">
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-[#C9A961]" />
                    <h3
                      className="text-sm font-bold"
                      style={{ fontFamily: 'Georgia, "Playfair Display", serif' }}
                    >
                      Revenus Artisans
                    </h3>
                  </div>
                  <Badge className="bg-[#C9A961] text-[10px] font-bold text-[#1A1A1A]">
                    Premium
                  </Badge>
                </div>
                <p
                  className="text-3xl font-bold tabular-nums text-[#C9A961]"
                  style={{ fontFamily: 'Georgia, "Playfair Display", serif' }}
                >
                  18,4M
                  <span className="ml-1 text-sm font-medium text-[#FAFAF7]/60">
                    FCFA
                  </span>
                </p>
                <div className="mt-3 space-y-2 border-t border-white/10 pt-3">
                  <RevenueRow
                    label="Artisans premium"
                    value={`${artisans.filter((a) => a.premium).length} actifs`}
                  />
                  <RevenueRow
                    label="Part mairie (30%)"
                    value="5,5M FCFA"
                    highlight
                  />
                  <RevenueRow
                    label="Versements mois en cours"
                    value="2,1M FCFA"
                  />
                  <RevenueRow
                    label="Taux de conversion"
                    value="68%"
                  />
                </div>
              </div>

              {/* Aminata — assistant vocal citoyen (dark) */}
              <div className="overflow-hidden rounded-2xl bg-gradient-to-br from-[#1A1A1A] to-[#2C2C2C] p-5 text-[#FAFAF7] shadow-sm">
                <div className="mb-3 flex items-center gap-3">
                  <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#C9A961] to-[#B8964F] text-base font-bold text-[#1A1A1A]">
                    A
                    <span className="absolute -bottom-0.5 -right-0.5 flex h-3 w-3">
                      <span className="absolute h-full w-full animate-ping rounded-full bg-[#00A651] opacity-75" />
                      <span className="relative h-3 w-3 rounded-full bg-[#00A651]" />
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p
                      className="truncate text-sm font-bold text-[#FAFAF7]"
                      style={{ fontFamily: 'Georgia, "Playfair Display", serif' }}
                    >
                      Aminata · Écoute active
                    </p>
                    <p className="text-[10px] text-[#00A651]">
                      ● En ligne — voix wolof/français
                    </p>
                  </div>
                </div>
                <div className="rounded-lg bg-white/5 px-3 py-2.5">
                  <p className="mb-1.5 text-[10px] uppercase tracking-wider text-[#FAFAF7]/50">
                    Dernière annonce
                  </p>
                  <p className="text-xs leading-relaxed text-[#FAFAF7]/85">
                    « {AMINATA_MESSAGE.text} »
                  </p>
                  <p className="mt-2 text-[10px] text-[#FAFAF7]/40">
                    {AMINATA_MESSAGE.timestamp} · diffusion 4 plaques
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3 w-full justify-center border-[#C9A961]/40 bg-transparent text-[#C9A961] hover:bg-[#C9A961]/10 hover:text-[#C9A961]"
                >
                  <Radio className="h-3.5 w-3.5" />
                  Diffuser une annonce
                </Button>
              </div>
            </div>
          </section>

          {/* ---------- Footer ---------- */}
          <footer className="mt-8 flex flex-col items-start justify-between gap-2 border-t border-[#EAE5DC] py-4 text-[11px] text-[#1A1A1A]/55 sm:flex-row sm:items-center">
            <div className="flex items-center gap-2">
              <Building2 className="h-3 w-3" />
              <span>
                FeedVoice · Ville Connectée — Mairie de Dakar, Centre de Supervision
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span suppressHydrationWarning>{clock}</span>
              <span className="text-[#1A1A1A]/30">·</span>
              <span>Vue : {activeNav}</span>
            </div>
          </footer>
        </main>
      </div>
    </div>
  )
}

// ============================================================
// Sous-composants
// ============================================================

type KpiCardProps = {
  title: string
  value: string | number
  sub?: string
  color: string
  icon: typeof Activity
  critical?: boolean
  warning?: boolean
  success?: boolean
}

function KpiCard({
  title,
  value,
  sub,
  color,
  icon: Icon,
  critical,
  warning,
  success,
}: KpiCardProps) {
  return (
    <div
      className="relative overflow-hidden rounded-2xl bg-white shadow-sm transition-shadow hover:shadow-md"
      style={{ borderTop: `3px solid ${color}` }}
    >
      <div className="px-4 py-3 sm:px-4 sm:py-4">
        <div className="mb-2 flex items-start justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[#1A1A1A]/55">
            {title}
          </p>
          <div
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md"
            style={{ backgroundColor: `${color}15`, color }}
          >
            <Icon className="h-4 w-4" />
          </div>
        </div>
        <p
          className="text-2xl font-bold tabular-nums text-[#1A1A1A]"
          style={{ fontFamily: 'Georgia, "Playfair Display", serif' }}
        >
          {value}
        </p>
        {sub && (
          <p className="mt-1 truncate text-[10px] text-[#1A1A1A]/50">
            {sub}
          </p>
        )}
        {critical && (
          <div
            className="mt-2 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white"
            style={{ backgroundColor: COLOR_RED }}
          >
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
            Critique
          </div>
        )}
        {warning && !critical && (
          <div
            className="mt-2 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white"
            style={{ backgroundColor: COLOR_ORANGE }}
          >
            À traiter
          </div>
        )}
        {success && !critical && !warning && (
          <div
            className="mt-2 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white"
            style={{ backgroundColor: COLOR_GREEN }}
          >
            ↑ Positif
          </div>
        )}
      </div>
    </div>
  )
}

type PanelProps = {
  title: string
  icon: typeof Activity
  subtitle?: string
  accent?: string
  children: React.ReactNode
}

function Panel({ title, icon: Icon, subtitle, accent, children }: PanelProps) {
  return (
    <section className="overflow-hidden rounded-2xl border border-[#EAE5DC] bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-[#EAE5DC] px-4 py-3">
        <div className="flex items-center gap-2">
          <Icon
            className="h-4 w-4"
            style={{ color: accent ?? COLOR_ANTHRACITE }}
          />
          <h3
            className="text-sm font-bold text-[#1A1A1A]"
            style={{ fontFamily: 'Georgia, "Playfair Display", serif' }}
          >
            {title}
          </h3>
        </div>
        {subtitle && (
          <span className="text-[10px] font-medium text-[#1A1A1A]/50">
            {subtitle}
          </span>
        )}
      </div>
      <div className="p-3 sm:p-4">{children}</div>
    </section>
  )
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span
        className="h-2 w-2 rounded-full"
        style={{ backgroundColor: color }}
        aria-hidden
      />
      <span className="text-[10px] font-medium text-white/90">{label}</span>
    </div>
  )
}

function RevenueRow({
  label,
  value,
  highlight,
}: {
  label: string
  value: string
  highlight?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-[#FAFAF7]/60">{label}</span>
      <span
        className={cn(
          'text-xs font-semibold tabular-nums',
          highlight ? 'text-[#C9A961]' : 'text-[#FAFAF7]',
        )}
      >
        {value}
      </span>
    </div>
  )
}
