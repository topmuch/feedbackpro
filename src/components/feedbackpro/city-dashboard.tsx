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

import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
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
  Plus,
  Search,
  Check,
  Phone,
  Clock,
  Megaphone,
  Monitor,
  Trash2,
  Calendar,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useAppStore } from '@/store/app-store'
import { useToast } from '@/hooks/use-toast'
import { parler } from '@/lib/staff-tts'
import { composeQrPremium, qrServerUrl } from '@/lib/qr-premium'
import { CityWallboardTab } from '@/components/feedbackpro/city-wallboard-tab'

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
      { id: 'wallboard', label: 'Wallboard TV', icon: Monitor },
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
      { id: 'announcements', label: 'Annonces', icon: Megaphone },
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

  // --- Logo ville (pour QR codes premium) ---
  const [cityLogoUrl, setCityLogoUrl] = useState<string | null>(null)
  const logoInputRef = useRef<HTMLInputElement>(null)
  const [composedQrs, setComposedQrs] = useState<Record<string, string>>({})

  // Charger le logo depuis localStorage au montage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('city_logo_url')
      if (saved) setCityLogoUrl(saved)
    } catch { /* ignore */ }
  }, [])

  // Compose les QR codes premium avec le logo quand les plaques ou le logo changent
  useEffect(() => {
    if (!plates.length) return
    const compose = async () => {
      const result: Record<string, string> = {}
      const origin = typeof window !== 'undefined' ? window.location.origin : 'https://feedback.qrbags.com'
      for (const p of plates.slice(0, 24)) {
        const qrUrl = qrServerUrl(`${origin}/?cityPlate=${p.qrToken}`, 400)
        try {
          const composed = await composeQrPremium(qrUrl, cityLogoUrl, p.plateNumber, 'Dakar')
          result[p.id] = composed
        } catch {
          result[p.id] = qrUrl
        }
      }
      setComposedQrs(result)
    }
    compose()
  }, [plates, cityLogoUrl])

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

  // --- Upload logo ville ---
  const handleLogoUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 2 * 1024 * 1024) {
      toast({ title: 'Fichier trop volumineux', description: 'Maximum 2 Mo.', variant: 'destructive' })
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result as string
      setCityLogoUrl(dataUrl)
      try { localStorage.setItem('city_logo_url', dataUrl) } catch { /* ignore */ }
      toast({ title: 'Logo enregistré', description: 'Le logo apparaîtra au centre des QR codes.' })
    }
    reader.readAsDataURL(file)
  }, [toast])

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
          {cityLogoUrl ? (
            <img src={cityLogoUrl} alt="Logo ville" className="h-8 w-8 rounded-lg object-cover" />
          ) : (
            <span className="text-2xl" aria-hidden>
              🏙️
            </span>
          )}
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

          {/* ====== VUE PARAMÈTRES ====== */}
          {activeNav === 'settings' && (
            <div className="mx-auto max-w-2xl space-y-5">
              <h2 className="text-xl font-bold text-[#1A1A1A]" style={{ fontFamily: 'Georgia, "Playfair Display", serif' }}>
                Paramètres · Ville Connectée
              </h2>

              {/* Logo ville */}
              <div className="rounded-2xl border border-[#EAE5DC] bg-white p-6 shadow-sm">
                <h3 className="mb-4 text-sm font-bold uppercase tracking-wide text-[#1A1A1A]/60">
                  Logo de la ville
                </h3>
                <p className="mb-4 text-sm text-[#1A1A1A]/60">
                  Ce logo s'affiche au centre de tous les QR codes des plaques citoyennes.
                </p>

                <div className="flex items-center gap-6">
                  {/* Preview logo */}
                  <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-xl border-2 border-[#EAE5DC] bg-[#FAFAF7]">
                    {cityLogoUrl ? (
                      <img src={cityLogoUrl} alt="Logo ville" className="h-full w-full object-cover" />
                    ) : (
                      <Building2 className="h-8 w-8 text-[#1A1A1A]/30" />
                    )}
                  </div>

                  <div className="flex-1 space-y-3">
                    <input
                      ref={logoInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/svg+xml"
                      onChange={handleLogoUpload}
                      className="hidden"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => logoInputRef.current?.click()}
                      className="border-[#C9A961]/40 text-[#1A1A1A] hover:bg-[#C9A961]/8"
                    >
                      📷 {cityLogoUrl ? 'Changer le logo' : 'Uploader un logo'}
                    </Button>
                    {cityLogoUrl && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setCityLogoUrl(null)
                          try { localStorage.removeItem('city_logo_url') } catch { /* ignore */ }
                          toast({ title: 'Logo supprimé' })
                        }}
                        className="text-[#E30613]"
                      >
                        Supprimer
                      </Button>
                    )}
                  </div>
                </div>

                {/* QR preview avec logo */}
                {cityLogoUrl && plates[0] && (
                  <div className="mt-4 rounded-xl bg-[#FAFAF7] p-4">
                    <p className="mb-2 text-xs font-medium text-[#1A1A1A]/50">Aperçu QR code premium :</p>
                    {composedQrs[plates[0].id] ? (
                      <img src={composedQrs[plates[0].id]} alt="QR premium preview" className="h-56 w-auto rounded-xl shadow-md" />
                    ) : (
                      <div className="h-32 w-32 animate-pulse rounded-lg bg-[#EAE5DC]" />
                    )}
                  </div>
                )}
              </div>

              {/* Configuration Denise */}
              <div className="rounded-2xl border border-[#EAE5DC] bg-white p-6 shadow-sm">
                <h3 className="mb-4 text-sm font-bold uppercase tracking-wide text-[#1A1A1A]/60">
                  Voix Denise (supervision)
                </h3>
                <div className="flex items-center justify-between rounded-xl bg-[#FAFAF7] px-4 py-3">
                  <div className="flex items-center gap-3">
                    {soundOn ? <Volume2 className="h-5 w-5 text-[#C9A961]" /> : <VolumeX className="h-5 w-5 text-[#1A1A1A]/40" />}
                    <div>
                      <p className="text-sm font-medium text-[#1A1A1A]">Alertes vocales</p>
                      <p className="text-xs text-[#1A1A1A]/50">Ding + annonces à chaque nouveau signalement</p>
                    </div>
                  </div>
                  <Button size="sm" variant={soundOn ? 'default' : 'outline'} onClick={toggleSound}
                    className={soundOn ? 'bg-[#4A7C59] text-white' : 'border-[#EAE5DC]'}>
                    {soundOn ? 'ON' : 'OFF'}
                  </Button>
                </div>
              </div>

              {/* Configuration Aminata */}
              <div className="rounded-2xl border border-[#EAE5DC] bg-white p-6 shadow-sm">
                <h3 className="mb-4 text-sm font-bold uppercase tracking-wide text-[#1A1A1A]/60">
                  Voix Aminata (citoyen)
                </h3>
                <div className="flex items-center justify-between rounded-xl bg-[#FAFAF7] px-4 py-3">
                  <div className="flex items-center gap-3">
                    <Radio className="h-5 w-5 text-[#6B4C9A]" />
                    <div>
                      <p className="text-sm font-medium text-[#1A1A1A]">Message d'accueil automatique</p>
                      <p className="text-xs text-[#1A1A1A]/50">"Bonjour, je suis Aminata, votre guide..."</p>
                    </div>
                  </div>
                  <Badge className="bg-[#4A7C59]/12 text-[#4A7C59]">Activé</Badge>
                </div>
              </div>
            </div>
          )}

          {/* ====== VUE GESTION PLAQUES (QR codes premium + génération lot + recherche) ====== */}
          {activeNav === 'plates-mgmt' && (
            <PlatesManagementView
              plates={plates}
              composedQrs={composedQrs}
              cityLogoUrl={cityLogoUrl}
              onRefresh={handleRefresh}
            />
          )}

          {/* ====== VUE URGENCES ====== */}
          {activeNav === 'emergencies' && (
            <EmergenciesView incidents={incidents} />
          )}

          {/* ====== VUE SIGNALEMENTS ====== */}
          {activeNav === 'reports' && (
            <ReportsView incidents={incidents} />
          )}

          {/* ====== VUE ARTISANS VÉRIFIÉS ====== */}
          {activeNav === 'artisans' && (
            <ArtisansView artisans={artisans} />
          )}

          {/* ====== VUE MAIRIE DYNAMIQUE ====== */}
          {activeNav === 'mairie-dynamic' && (
            <MairieDynamicView />
          )}

          {/* ====== VUE REVENUS ====== */}
          {activeNav === 'revenue' && (
            <RevenueView artisans={artisans} />
          )}

          {/* ====== VUE CARTE DES PLAQUES ====== */}
          {activeNav === 'plates-map' && (
            <PlatesMapView plates={plates} incidents={incidents} />
          )}

          {/* ====== VUE WALLBOARD TV ====== */}
          {activeNav === 'wallboard' && (
            <CityWallboardTab />
          )}

          {/* ====== VUE ANNONCES ====== */}
          {activeNav === 'announcements' && (
            <AnnouncementsView />
          )}

          {/* ====== VUE OVERVIEW (défaut) ====== */}
          {activeNav === 'overview' && (
            <>
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
          </>
          )}

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

// ============================================================
// PlatesManagementView — Gestion plaques avec lot + recherche + édition GPS
// ============================================================

function PlatesManagementView({
  plates,
  composedQrs,
  cityLogoUrl,
  onRefresh,
}: {
  plates: CityPlate[]
  composedQrs: Record<string, string>
  cityLogoUrl: string | null
  onRefresh: () => Promise<void>
}) {
  const { toast } = useToast()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [showBatchDialog, setShowBatchDialog] = useState(false)
  const [batchCount, setBatchCount] = useState(10)
  const [generating, setGenerating] = useState(false)
  const [editingPlate, setEditingPlate] = useState<CityPlate | null>(null)
  const [editLabel, setEditLabel] = useState('')
  const [editDistrict, setEditDistrict] = useState('')
  const [editAddress, setEditAddress] = useState('')
  const [editLat, setEditLat] = useState<string>('')
  const [editLng, setEditLng] = useState<string>('')
  const [savingPlate, setSavingPlate] = useState(false)
  const [locating, setLocating] = useState(false)

  // Filtrage
  const filtered = useMemo(() => {
    return plates.filter((p) => {
      if (statusFilter !== 'all' && p.status !== statusFilter) return false
      if (search.trim()) {
        const q = search.trim().toLowerCase()
        const hay = `${p.plateNumber} ${p.label} ${p.district ?? ''} ${p.address ?? ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [plates, search, statusFilter])

  // Stats par statut
  const stats = useMemo(() => ({
    total: plates.length,
    pending: plates.filter((p) => p.status === 'pending').length,
    active: plates.filter((p) => p.status === 'active').length,
    maintenance: plates.filter((p) => p.status === 'maintenance').length,
    offline: plates.filter((p) => p.status === 'offline').length,
  }), [plates])

  // Génération de lot
  const handleGenerateBatch = async () => {
    setGenerating(true)
    try {
      const res = await fetch('/api/city/plates/generate-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count: batchCount }),
      })
      const json = await res.json()
      if (json?.ok) {
        toast({
          title: 'Lot généré',
          description: `${json.data.generated} plaques créées (${json.data.range})`,
        })
        setShowBatchDialog(false)
        await onRefresh()
      } else {
        toast({ title: 'Erreur', description: json?.error ?? 'Échec', variant: 'destructive' })
      }
    } catch {
      toast({ title: 'Erreur réseau', variant: 'destructive' })
    } finally {
      setGenerating(false)
    }
  }

  // Édition plaque
  const openEdit = (plate: CityPlate) => {
    setEditingPlate(plate)
    setEditLabel(plate.label === 'Plaque non assignée' ? '' : plate.label)
    setEditDistrict(plate.district ?? '')
    setEditAddress(plate.address ?? '')
    setEditLat(plate.lat != null ? String(plate.lat) : '')
    setEditLng(plate.lng != null ? String(plate.lng) : '')
  }

  // GPS live
  const handleLocate = () => {
    setLocating(true)
    if (!navigator.geolocation) {
      toast({ title: 'GPS indisponible', variant: 'destructive' })
      setLocating(false)
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setEditLat(pos.coords.latitude.toFixed(6))
        setEditLng(pos.coords.longitude.toFixed(6))
        setLocating(false)
        toast({ title: 'Position capturée', description: `${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}` })
      },
      () => {
        toast({ title: 'GPS refusé ou indisponible', variant: 'destructive' })
        setLocating(false)
      },
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }

  // Sauvegarder plaque
  const handleSavePlate = async () => {
    if (!editingPlate) return
    setSavingPlate(true)
    try {
      const body: Record<string, unknown> = {
        label: editLabel.trim() || 'Plaque non assignée',
        district: editDistrict.trim() || null,
        address: editAddress.trim() || null,
      }
      if (editLat && editLng) {
        body.lat = parseFloat(editLat)
        body.lng = parseFloat(editLng)
      }
      const res = await fetch(`/api/city/plates/${editingPlate.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (json?.ok) {
        toast({ title: 'Plaque mise à jour', description: `${editingPlate.plateNumber} → ${editLabel || 'non assignée'}` })
        setEditingPlate(null)
        await onRefresh()
      } else {
        toast({ title: 'Erreur', description: json?.error ?? 'Échec', variant: 'destructive' })
      }
    } catch {
      toast({ title: 'Erreur réseau', variant: 'destructive' })
    } finally {
      setSavingPlate(false)
    }
  }

  const SERIF = { fontFamily: 'Georgia, "Playfair Display", serif' } as const

  return (
    <div className="space-y-5">
      {/* Header + actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold text-[#1A1A1A]" style={SERIF}>
          Plaques QR · {stats.total} au total
        </h2>
        <div className="flex items-center gap-2">
          {cityLogoUrl && <Badge className="bg-[#C9A961]/15 text-[#8B6F47]">Logo ✓</Badge>}
          <Button size="sm" onClick={() => setShowBatchDialog(true)} className="bg-[#C9A961] text-[#1A1A1A] hover:bg-[#B8964F]">
            <Plus className="h-4 w-4 mr-1" /> Générer un lot
          </Button>
        </div>
      </div>

      {/* Stats rapides */}
      <div className="flex flex-wrap gap-2 text-xs">
        {[
          { label: 'Total', value: stats.total, color: 'bg-[#EAE5DC] text-[#1A1A1A]' },
          { label: 'En attente', value: stats.pending, color: 'bg-amber-100 text-amber-800' },
          { label: 'Actives', value: stats.active, color: 'bg-[#4A7C59]/12 text-[#4A7C59]' },
          { label: 'Maintenance', value: stats.maintenance, color: 'bg-[#FF6B00]/12 text-[#FF6B00]' },
          { label: 'Hors ligne', value: stats.offline, color: 'bg-[#E30613]/12 text-[#E30613]' },
        ].map((s) => (
          <button
            key={s.label}
            onClick={() => setStatusFilter(s.label === 'Total' ? 'all' : s.label.toLowerCase().replace(' ', '_').replace('hors ligne', 'offline').replace('en attente', 'pending'))}
            className={cn('rounded-lg px-3 py-1.5 font-medium transition', s.color, statusFilter === (s.label === 'Total' ? 'all' : s.label.toLowerCase().replace(' ', '_').replace('hors ligne', 'offline').replace('en attente', 'pending')) && 'ring-2 ring-[#C9A961]')}
          >
            {s.label}: {s.value}
          </button>
        ))}
      </div>

      {/* Barre de recherche */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#1A1A1A]/30" />
        <input
          type="text"
          placeholder="Rechercher par numéro, nom, quartier, adresse…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-xl border border-[#EAE5DC] bg-white py-2.5 pl-10 pr-4 text-sm text-[#1A1A1A] placeholder:text-[#1A1A1A]/40 focus:border-[#C9A961] focus:outline-none focus:ring-2 focus:ring-[#C9A961]/20"
        />
      </div>

      {/* Liste plaques (tableau) */}
      <div className="overflow-x-auto rounded-2xl border border-[#EAE5DC] bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-[#EAE5DC] bg-[#FAFAF7]">
            <tr>
              <th className="px-4 py-3 font-semibold text-[#1A1A1A]/70">N°</th>
              <th className="px-4 py-3 font-semibold text-[#1A1A1A]/70">Lieu</th>
              <th className="px-4 py-3 font-semibold text-[#1A1A1A]/70">Quartier</th>
              <th className="px-4 py-3 font-semibold text-[#1A1A1A]/70">GPS</th>
              <th className="px-4 py-3 font-semibold text-[#1A1A1A]/70">Statut</th>
              <th className="px-4 py-3 font-semibold text-[#1A1A1A]/70">Scans</th>
              <th className="px-4 py-3 text-right font-semibold text-[#1A1A1A]/70">Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, 50).map((p) => (
              <tr key={p.id} className="border-b border-[#EAE5DC]/50 hover:bg-[#FAFAF7]">
                <td className="px-4 py-3 font-bold text-[#1A1A1A]">{p.plateNumber}</td>
                <td className="px-4 py-3 text-[#1A1A1A]/80">{p.label}</td>
                <td className="px-4 py-3 text-[#1A1A1A]/60">{p.district ?? '—'}</td>
                <td className="px-4 py-3 text-xs text-[#1A1A1A]/50">
                  {p.lat != null ? `${p.lat.toFixed(4)}, ${p.lng?.toFixed(4)}` : '—'}
                </td>
                <td className="px-4 py-3">
                  <Badge className={cn(
                    'text-[10px]',
                    p.status === 'active' ? 'bg-[#4A7C59]/12 text-[#4A7C59]' :
                    p.status === 'pending' ? 'bg-amber-100 text-amber-800' :
                    p.status === 'maintenance' ? 'bg-[#FF6B00]/12 text-[#FF6B00]' :
                    'bg-[#E30613]/12 text-[#E30613]'
                  )}>
                    {p.status === 'pending' ? 'En attente' : p.status}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-[#1A1A1A]/60">{p.scanCount}</td>
                <td className="px-4 py-3 text-right">
                  <Button size="sm" variant="outline" onClick={() => openEdit(p)} className="border-[#EAE5DC] text-[#1A1A1A] hover:border-[#C9A961]">
                    Éditer
                  </Button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-[#1A1A1A]/40">
                  Aucune plaque trouvée. {search ? 'Affinez votre recherche.' : 'Générez un lot pour commencer.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {filtered.length > 50 && (
          <div className="border-t border-[#EAE5DC] px-4 py-3 text-center text-xs text-[#1A1A1A]/50">
            Affichage de 50 plaques sur {filtered.length}. Affinez la recherche pour voir plus.
          </div>
        )}
      </div>

      {/* Dialog génération lot */}
      {showBatchDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowBatchDialog(false)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-4 text-lg font-bold text-[#1A1A1A]" style={SERIF}>Générer un lot de plaques</h3>
            <p className="mb-4 text-sm text-[#1A1A1A]/60">
              Les plaques seront créées avec un numéro auto et un token QR unique. Elles seront en statut "en attente" jusqu'à géolocalisation.
            </p>
            <label className="block text-sm font-medium text-[#1A1A1A]/70 mb-2">Nombre de plaques</label>
            <input
              type="number"
              min={1}
              max={500}
              value={batchCount}
              onChange={(e) => setBatchCount(Math.min(500, Math.max(1, parseInt(e.target.value) || 1)))}
              className="w-full rounded-xl border border-[#EAE5DC] bg-[#FAFAF7] px-4 py-2.5 text-sm focus:border-[#C9A961] focus:outline-none"
            />
            <p className="mt-2 text-xs text-[#1A1A1A]/50">Maximum 500 par lot. Les numéros continuent à partir du dernier existant.</p>
            <div className="mt-6 flex justify-end gap-3">
              <Button variant="outline" onClick={() => setShowBatchDialog(false)}>Annuler</Button>
              <Button onClick={handleGenerateBatch} disabled={generating} className="bg-[#C9A961] text-[#1A1A1A] hover:bg-[#B8964F]">
                {generating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
                {generating ? 'Génération…' : `Générer ${batchCount} plaques`}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Dialog édition plaque (géolocalisation) */}
      {editingPlate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setEditingPlate(null)}>
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-[#1A1A1A]" style={SERIF}>
                Plaque {editingPlate.plateNumber}
              </h3>
              <button onClick={() => setEditingPlate(null)} className="text-[#1A1A1A]/40 hover:text-[#1A1A1A]">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* QR preview */}
            <div className="mb-4 flex justify-center">
              {composedQrs[editingPlate.id] ? (
                <img src={composedQrs[editingPlate.id]} alt="QR premium" className="h-48 w-auto rounded-xl shadow-lg" />
              ) : (
                <div className="h-32 w-32 rounded-xl bg-[#FAFAF7] flex items-center justify-center">
                  <QrCode className="h-12 w-12 text-[#1A1A1A]/20" />
                </div>
              )}
            </div>

            <div className="space-y-4">
              {/* Nom du lieu */}
              <div>
                <label className="block text-sm font-medium text-[#1A1A1A]/70 mb-1.5">Nom du lieu</label>
                <input
                  type="text"
                  value={editLabel}
                  onChange={(e) => setEditLabel(e.target.value)}
                  placeholder="ex: Marché Sandaga, Rue Félix Faure…"
                  className="w-full rounded-xl border border-[#EAE5DC] bg-[#FAFAF7] px-4 py-2.5 text-sm focus:border-[#C9A961] focus:outline-none"
                />
              </div>

              {/* Quartier */}
              <div>
                <label className="block text-sm font-medium text-[#1A1A1A]/70 mb-1.5">Quartier</label>
                <input
                  type="text"
                  value={editDistrict}
                  onChange={(e) => setEditDistrict(e.target.value)}
                  placeholder="ex: Plateau, Médina, Grand Dakar…"
                  className="w-full rounded-xl border border-[#EAE5DC] bg-[#FAFAF7] px-4 py-2.5 text-sm focus:border-[#C9A961] focus:outline-none"
                />
              </div>

              {/* Adresse */}
              <div>
                <label className="block text-sm font-medium text-[#1A1A1A]/70 mb-1.5">Adresse (optionnel)</label>
                <input
                  type="text"
                  value={editAddress}
                  onChange={(e) => setEditAddress(e.target.value)}
                  placeholder="ex: Avenue Léopold Sédar Senghor"
                  className="w-full rounded-xl border border-[#EAE5DC] bg-[#FAFAF7] px-4 py-2.5 text-sm focus:border-[#C9A961] focus:outline-none"
                />
              </div>

              {/* GPS */}
              <div>
                <label className="block text-sm font-medium text-[#1A1A1A]/70 mb-2">Géolocalisation (GPS)</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={editLat}
                    onChange={(e) => setEditLat(e.target.value)}
                    placeholder="Latitude"
                    className="flex-1 rounded-xl border border-[#EAE5DC] bg-[#FAFAF7] px-3 py-2.5 text-sm focus:border-[#C9A961] focus:outline-none"
                  />
                  <input
                    type="text"
                    value={editLng}
                    onChange={(e) => setEditLng(e.target.value)}
                    placeholder="Longitude"
                    className="flex-1 rounded-xl border border-[#EAE5DC] bg-[#FAFAF7] px-3 py-2.5 text-sm focus:border-[#C9A961] focus:outline-none"
                  />
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleLocate}
                  disabled={locating}
                  className="mt-2 border-[#C9A961]/40 text-[#1A1A1A] hover:bg-[#C9A961]/8"
                >
                  {locating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <MapPin className="h-4 w-4 mr-2" />}
                  {locating ? 'Localisation…' : '📍 Ma position GPS'}
                </Button>
                <p className="mt-1 text-xs text-[#1A1A1A]/50">
                  La géolocalisation active automatiquement la plaque (statut → "active").
                </p>
              </div>
            </div>

            {/* Actions */}
            <div className="mt-6 flex justify-end gap-3">
              <Button variant="outline" onClick={() => setEditingPlate(null)}>Annuler</Button>
              <Button onClick={handleSavePlate} disabled={savingPlate} className="bg-[#4A7C59] text-white hover:bg-[#3D6B4D]">
                {savingPlate ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Check className="h-4 w-4 mr-2" />}
                {savingPlate ? 'Sauvegarde…' : 'Sauvegarder & activer'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================================
// VUES SUPPLÉMENTAIRES
// Urgences · Signalements · Artisans · Mairie · Revenus · Carte plaques
// ============================================================

/** Emoji basé sur le type + catégorie d'incident. */
function incidentEmoji(type: string, category?: string | null): string {
  const cat = (category ?? '').toLowerCase()
  if (cat.includes('accident') || cat.includes('feu') || cat.includes('incendie')) return '🚒'
  if (cat.includes('vol') || cat.includes('agression') || cat.includes('police')) return '🚓'
  if (cat.includes('electric') || cat.includes('senelec') || cat.includes('électric')) return '⚡'
  if (cat.includes('eau') || cat.includes('fuite') || cat.includes('onas')) return '💧'
  if (cat.includes('voirie') || cat.includes('dechet') || cat.includes('déchets') || cat.includes('nid')) return '🚧'
  if (cat.includes('ordures') || cat.includes('matière')) return '🗑️'
  if (type === 'emergency') return '🚨'
  if (type === 'report') return '📋'
  if (type === 'orientation') return '🗺️'
  if (type === 'artisan') return '🔧'
  if (type === 'mairie') return '🏛️'
  return '📌'
}

/** Badge de statut d'incident (libellé + couleurs Tailwind). */
function incidentStatusInfo(status: string): {
  label: string
  bg: string
  color: string
} {
  switch (status) {
    case 'pending':
      return { label: 'En attente', bg: 'bg-[#FF6B00]/12 text-[#FF6B00]', color: COLOR_ORANGE }
    case 'assigned':
      return { label: 'Assigné', bg: 'bg-[#0066CC]/12 text-[#0066CC]', color: COLOR_BLUE }
    case 'in_progress':
      return { label: 'En cours', bg: 'bg-[#0066CC]/12 text-[#0066CC]', color: COLOR_BLUE }
    case 'resolved':
      return { label: 'Résolu', bg: 'bg-[#4A7C59]/12 text-[#4A7C59]', color: COLOR_GREEN }
    default:
      return { label: status, bg: 'bg-[#EAE5DC] text-[#1A1A1A]', color: COLOR_ANTHRACITE }
  }
}

/** Service assigné (label + emoji) — Police / Senelec / ONAS / Mairie. */
function serviceInfo(assignedTo: string | null): { label: string; emoji: string } {
  if (!assignedTo) return { label: 'Non assigné', emoji: '⏳' }
  const s = assignedTo.toLowerCase()
  if (s.includes('police')) return { label: 'Police', emoji: '🚓' }
  if (s.includes('senelec')) return { label: 'Senelec', emoji: '⚡' }
  if (s.includes('onas')) return { label: 'ONAS', emoji: '💧' }
  if (s.includes('mairie')) return { label: 'Mairie', emoji: '🏛️' }
  return { label: assignedTo, emoji: '🏛️' }
}

// ---------------------------------------------------------------
// IncidentCard — carte partagée (urgences + signalements)
// ---------------------------------------------------------------

function IncidentCard({ inc, accent }: { inc: CityIncident; accent: string }) {
  const status = incidentStatusInfo(inc.status)
  const service = serviceInfo(inc.assignedTo)
  const plateLabel = inc.plate
    ? `${inc.plate.plateNumber}${inc.plate.district ? ` · ${inc.plate.district}` : ''}`
    : 'GPS citoyen'
  return (
    <article
      className="overflow-hidden rounded-2xl border border-[#EAE5DC] bg-white shadow-sm"
      style={{ borderTop: `3px solid ${accent}` }}
    >
      <div className="p-4">
        <div className="mb-3 flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="text-2xl leading-none" aria-hidden>
              {incidentEmoji(inc.type, inc.category)}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-[#1A1A1A]">
                {inc.category ?? incidentTypeLabel(inc.type)}
              </p>
              <p className="text-[10px] uppercase tracking-wider text-[#1A1A1A]/45">
                {incidentTypeLabel(inc.type)}
              </p>
            </div>
          </div>
          <Badge className={cn('text-[10px] font-semibold', status.bg)}>
            {status.label}
          </Badge>
        </div>
        <p className="mb-3 text-sm leading-relaxed text-[#1A1A1A]/80">
          {inc.description ?? 'Aucune description fournie.'}
        </p>
        <div className="space-y-1.5 border-t border-[#EAE5DC] pt-3 text-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[#1A1A1A]/50">Service</span>
            <span className="font-medium text-[#1A1A1A]">
              {service.emoji} {service.label}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[#1A1A1A]/50">Plaque</span>
            <span className="truncate font-medium text-[#1A1A1A]">{plateLabel}</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[#1A1A1A]/50">Signalé</span>
            <span className="font-medium text-[#1A1A1A]">{timeAgo(inc.createdAt)}</span>
          </div>
        </div>
      </div>
    </article>
  )
}

// ---------------------------------------------------------------
// EmergenciesView — Urgences citoyennes filtrables
// ---------------------------------------------------------------

function EmergenciesView({ incidents }: { incidents: CityIncident[] }) {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  const emergencies = useMemo(
    () => incidents.filter((i) => i.type === 'emergency'),
    [incidents],
  )

  const filtered = useMemo(() => {
    return emergencies.filter((inc) => {
      if (statusFilter !== 'all' && inc.status !== statusFilter) return false
      if (search.trim()) {
        const q = search.trim().toLowerCase()
        const hay = `${inc.category ?? ''} ${inc.description ?? ''} ${inc.plate?.plateNumber ?? ''} ${inc.assignedTo ?? ''} ${inc.plate?.district ?? ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [emergencies, search, statusFilter])

  const counts = useMemo(
    () => ({
      all: emergencies.length,
      pending: emergencies.filter((i) => i.status === 'pending').length,
      assigned: emergencies.filter(
        (i) => i.status === 'assigned' || i.status === 'in_progress',
      ).length,
      resolved: emergencies.filter((i) => i.status === 'resolved').length,
    }),
    [emergencies],
  )

  const SERIF = { fontFamily: 'Georgia, "Playfair Display", serif' } as const

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-[#1A1A1A]" style={SERIF}>
            Urgences citoyennes
          </h2>
          <p className="text-xs text-[#1A1A1A]/55">
            {counts.pending} en attente · {counts.assigned} assignées · {counts.resolved} résolues
          </p>
        </div>
        <Badge className="bg-[#E30613]/12 text-[#E30613]">
          <AlertTriangle className="mr-1 h-3 w-3" /> {emergencies.length} total
        </Badge>
      </div>

      {/* Filtres statut */}
      <div className="flex flex-wrap gap-2 text-xs">
        {[
          { key: 'all', label: 'Tous', value: counts.all, color: 'bg-[#EAE5DC] text-[#1A1A1A]' },
          { key: 'pending', label: 'En attente', value: counts.pending, color: 'bg-[#FF6B00]/12 text-[#FF6B00]' },
          { key: 'assigned', label: 'Assignées', value: counts.assigned, color: 'bg-[#0066CC]/12 text-[#0066CC]' },
          { key: 'resolved', label: 'Résolues', value: counts.resolved, color: 'bg-[#4A7C59]/12 text-[#4A7C59]' },
        ].map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => setStatusFilter(s.key)}
            className={cn(
              'rounded-lg px-3 py-1.5 font-medium transition',
              s.color,
              statusFilter === s.key && 'ring-2 ring-[#C9A961]',
            )}
          >
            {s.label}: {s.value}
          </button>
        ))}
      </div>

      {/* Recherche */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#1A1A1A]/30" />
        <input
          type="text"
          placeholder="Rechercher par catégorie, description, plaque, service…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-xl border border-[#EAE5DC] bg-white py-2.5 pl-10 pr-4 text-sm text-[#1A1A1A] placeholder:text-[#1A1A1A]/40 focus:border-[#C9A961] focus:outline-none focus:ring-2 focus:ring-[#C9A961]/20"
        />
      </div>

      {/* Liste */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#EAE5DC] bg-white p-12 text-center">
          <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-[#1A1A1A]/20" />
          <p className="text-sm font-medium text-[#1A1A1A]/60">Aucune urgence pour le moment</p>
          <p className="mt-1 text-xs text-[#1A1A1A]/40">
            {emergencies.length === 0
              ? 'Les urgences signalées par les citoyens apparaîtront ici.'
              : 'Aucun résultat avec ces filtres.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((inc) => (
            <IncidentCard key={inc.id} inc={inc} accent={COLOR_RED} />
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------
// ReportsView — Signalements groupés par statut
// ---------------------------------------------------------------

function ReportsView({ incidents }: { incidents: CityIncident[] }) {
  const [search, setSearch] = useState('')

  const reports = useMemo(
    () => incidents.filter((i) => i.type === 'report'),
    [incidents],
  )

  const filtered = useMemo(() => {
    return reports.filter((inc) => {
      if (search.trim()) {
        const q = search.trim().toLowerCase()
        const hay = `${inc.category ?? ''} ${inc.description ?? ''} ${inc.plate?.plateNumber ?? ''} ${inc.assignedTo ?? ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [reports, search])

  const groups = useMemo(
    () => ({
      pending: filtered.filter((i) => i.status === 'pending'),
      inProgress: filtered.filter(
        (i) => i.status === 'assigned' || i.status === 'in_progress',
      ),
      resolved: filtered.filter((i) => i.status === 'resolved'),
    }),
    [filtered],
  )

  const SERIF = { fontFamily: 'Georgia, "Playfair Display", serif' } as const

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-[#1A1A1A]" style={SERIF}>
            Signalements citoyens
          </h2>
          <p className="text-xs text-[#1A1A1A]/55">
            {reports.length} signalements au total
          </p>
        </div>
        <Badge className="bg-[#FF6B00]/12 text-[#FF6B00]">
          <Bell className="mr-1 h-3 w-3" /> {reports.length}
        </Badge>
      </div>

      {/* Recherche */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#1A1A1A]/30" />
        <input
          type="text"
          placeholder="Rechercher par catégorie, description, plaque…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-xl border border-[#EAE5DC] bg-white py-2.5 pl-10 pr-4 text-sm text-[#1A1A1A] placeholder:text-[#1A1A1A]/40 focus:border-[#C9A961] focus:outline-none focus:ring-2 focus:ring-[#C9A961]/20"
        />
      </div>

      {reports.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#EAE5DC] bg-white p-12 text-center">
          <Bell className="mx-auto mb-3 h-8 w-8 text-[#1A1A1A]/20" />
          <p className="text-sm font-medium text-[#1A1A1A]/60">
            Aucun signalement pour le moment
          </p>
          <p className="mt-1 text-xs text-[#1A1A1A]/40">
            Les signalements citoyens apparaîtront ici, groupés par statut.
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#EAE5DC] bg-white p-12 text-center">
          <Search className="mx-auto mb-3 h-8 w-8 text-[#1A1A1A]/20" />
          <p className="text-sm font-medium text-[#1A1A1A]/60">Aucun résultat</p>
          <p className="mt-1 text-xs text-[#1A1A1A]/40">
            Aucun signalement ne correspond à votre recherche.
          </p>
        </div>
      ) : (
        <>
          <ReportGroup title="En attente" icon="⏳" color={COLOR_ORANGE} items={groups.pending} />
          <ReportGroup title="En cours" icon="🔄" color={COLOR_BLUE} items={groups.inProgress} />
          <ReportGroup title="Résolus" icon="✓" color={COLOR_GREEN} items={groups.resolved} />
        </>
      )}
    </div>
  )
}

function ReportGroup({
  title,
  icon,
  color,
  items,
}: {
  title: string
  icon: string
  color: string
  items: CityIncident[]
}) {
  if (items.length === 0) return null
  return (
    <section className="overflow-hidden rounded-2xl border border-[#EAE5DC] bg-white shadow-sm">
      <div
        className="flex items-center justify-between border-b border-[#EAE5DC] px-4 py-3"
        style={{ borderLeft: `4px solid ${color}` }}
      >
        <div className="flex items-center gap-2">
          <span className="text-lg" aria-hidden>
            {icon}
          </span>
          <h3
            className="text-sm font-bold text-[#1A1A1A]"
            style={{ fontFamily: 'Georgia, "Playfair Display", serif' }}
          >
            {title}
          </h3>
        </div>
        <span
          className="rounded-full px-2.5 py-0.5 text-xs font-bold text-white"
          style={{ backgroundColor: color }}
        >
          {items.length}
        </span>
      </div>
      <div className="grid grid-cols-1 gap-4 p-4 md:grid-cols-2 xl:grid-cols-3">
        {items.map((inc) => (
          <IncidentCard key={inc.id} inc={inc} accent={color} />
        ))}
      </div>
    </section>
  )
}

// ---------------------------------------------------------------
// ArtisansView — Table des artisans vérifiés
// ---------------------------------------------------------------

function ArtisansView({ artisans }: { artisans: CityArtisan[] }) {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'verified' | 'premium'>('all')

  const filtered = useMemo(() => {
    return artisans.filter((a) => {
      if (filter === 'verified' && !a.verified) return false
      if (filter === 'premium' && !a.premium) return false
      if (search.trim()) {
        const q = search.trim().toLowerCase()
        const hay = `${a.name} ${a.trade} ${a.district ?? ''} ${a.phone}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [artisans, search, filter])

  const stats = useMemo(
    () => ({
      total: artisans.length,
      verified: artisans.filter((a) => a.verified).length,
      premium: artisans.filter((a) => a.premium).length,
      contacts: artisans.reduce((s, a) => s + a.contactCount, 0),
    }),
    [artisans],
  )

  const SERIF = { fontFamily: 'Georgia, "Playfair Display", serif' } as const

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-[#1A1A1A]" style={SERIF}>
            Artisans vérifiés
          </h2>
          <p className="text-xs text-[#1A1A1A]/55">
            {stats.verified} vérifiés · {stats.premium} premium · {stats.contacts} contacts cumulés
          </p>
        </div>
        <Badge className="bg-[#4A7C59]/12 text-[#4A7C59]">
          <Wrench className="mr-1 h-3 w-3" /> {artisans.length} artisans
        </Badge>
      </div>

      {/* Filtres */}
      <div className="flex flex-wrap gap-2 text-xs">
        {[
          { key: 'all' as const, label: 'Tous', value: stats.total, color: 'bg-[#EAE5DC] text-[#1A1A1A]' },
          { key: 'verified' as const, label: 'Vérifiés', value: stats.verified, color: 'bg-[#0066CC]/12 text-[#0066CC]' },
          { key: 'premium' as const, label: 'Premium', value: stats.premium, color: 'bg-[#C9A961]/15 text-[#8B6F47]' },
        ].map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => setFilter(s.key)}
            className={cn(
              'rounded-lg px-3 py-1.5 font-medium transition',
              s.color,
              filter === s.key && 'ring-2 ring-[#C9A961]',
            )}
          >
            {s.label}: {s.value}
          </button>
        ))}
      </div>

      {/* Recherche */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#1A1A1A]/30" />
        <input
          type="text"
          placeholder="Rechercher par nom, métier, quartier, téléphone…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-xl border border-[#EAE5DC] bg-white py-2.5 pl-10 pr-4 text-sm text-[#1A1A1A] placeholder:text-[#1A1A1A]/40 focus:border-[#C9A961] focus:outline-none focus:ring-2 focus:ring-[#C9A961]/20"
        />
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#EAE5DC] bg-white p-12 text-center">
          <Wrench className="mx-auto mb-3 h-8 w-8 text-[#1A1A1A]/20" />
          <p className="text-sm font-medium text-[#1A1A1A]/60">Aucun artisan pour le moment</p>
          <p className="mt-1 text-xs text-[#1A1A1A]/40">
            {artisans.length === 0
              ? 'Les artisans vérifiés apparaîtront ici.'
              : 'Aucun résultat avec ces filtres.'}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-[#EAE5DC] bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-[#EAE5DC] bg-[#FAFAF7]">
              <tr>
                <th className="px-4 py-3 font-semibold text-[#1A1A1A]/70">Artisan</th>
                <th className="px-4 py-3 font-semibold text-[#1A1A1A]/70">Quartier</th>
                <th className="px-4 py-3 font-semibold text-[#1A1A1A]/70">Téléphone</th>
                <th className="px-4 py-3 font-semibold text-[#1A1A1A]/70">Badges</th>
                <th className="px-4 py-3 font-semibold text-[#1A1A1A]/70">Note</th>
                <th className="px-4 py-3 text-right font-semibold text-[#1A1A1A]/70">Contacts</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 100).map((a) => (
                <tr key={a.id} className="border-b border-[#EAE5DC]/50 hover:bg-[#FAFAF7]">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#C9A961]/15 text-xs font-bold text-[#8B6F47]">
                        {a.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-[#1A1A1A]">{a.name}</p>
                        <p className="truncate text-xs text-[#1A1A1A]/55">{a.trade}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-[#1A1A1A]/70">{a.district ?? '—'}</td>
                  <td className="px-4 py-3">
                    <a
                      href={`tel:${a.phone.replace(/\s/g, '')}`}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[#EAE5DC] px-2.5 py-1 text-xs font-medium text-[#1A1A1A] transition hover:border-[#C9A961] hover:bg-[#C9A961]/8"
                    >
                      <Phone className="h-3 w-3 text-[#4A7C59]" />
                      {a.phone}
                    </a>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {a.verified && (
                        <Badge className="bg-[#0066CC]/12 text-[#0066CC] text-[10px]">
                          <Check className="mr-0.5 h-2.5 w-2.5" /> Vérifié
                        </Badge>
                      )}
                      {a.premium && (
                        <Badge className="bg-[#C9A961]/15 text-[#8B6F47] text-[10px]">
                          <Star className="mr-0.5 h-2.5 w-2.5" /> Premium
                        </Badge>
                      )}
                      {!a.verified && !a.premium && (
                        <span className="text-xs text-[#1A1A1A]/30">—</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <Star className="h-3.5 w-3.5 fill-[#C9A961] text-[#C9A961]" />
                      <span className="font-semibold tabular-nums text-[#1A1A1A]">
                        {a.rating.toFixed(1)}
                      </span>
                      <span className="text-xs text-[#1A1A1A]/40">({a.reviewCount})</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="font-semibold tabular-nums text-[#1A1A1A]">
                      {a.contactCount}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length > 100 && (
            <div className="border-t border-[#EAE5DC] px-4 py-3 text-center text-xs text-[#1A1A1A]/50">
              Affichage de 100 artisans sur {filtered.length}. Affinez la recherche pour voir plus.
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------
// MairieDynamicView — Services + horaires + annonces
// ---------------------------------------------------------------

const MAIRIE_SERVICES = [
  { name: 'État civil', phone: '+221338230000', desc: 'Naissances, mariages, décès', icon: '📄' },
  { name: 'Permis de construire', phone: '+221338230001', desc: 'Autorisations urbanisme', icon: '🏗️' },
  { name: 'Impôts et taxes', phone: '+221338230002', desc: 'Taxes locales, foncier', icon: '💰' },
  { name: "Carte d'identité", phone: '+221338230003', desc: 'Renouvellement CNI', icon: '🪪' },
] as const

const MAIRIE_ANNOUNCEMENTS = [
  { title: 'Collecte des déchets — Plateau & Médina', date: "Aujourd'hui", time: 'Avant 7h', emoji: '🗑️' },
  { title: "Coupure d'eau programmée — Yoff", date: 'Demain', time: '9h - 14h', emoji: '💧' },
  { title: 'Réunion publique — Grand Dakar', date: '15 déc.', time: '16h', emoji: '👥' },
  { title: "Marché de Noël — Place de l'Indépendance", date: '18-23 déc.', time: '10h - 20h', emoji: '🎄' },
] as const

function MairieDynamicView() {
  const [now, setNow] = useState<Date | null>(null)
  useEffect(() => {
    const t = setTimeout(() => setNow(new Date()), 0)
    const i = setInterval(() => setNow(new Date()), 30000)
    return () => {
      clearTimeout(t)
      clearInterval(i)
    }
  }, [])

  // Lun-Ven 8h-16h, Sam 8h-12h, Dim fermé
  const isOpen = useMemo(() => {
    if (!now) return false
    const day = now.getDay() // 0 = dimanche, 6 = samedi
    const h = now.getHours()
    if (day === 0) return false
    if (day === 6) return h >= 8 && h < 12
    return h >= 8 && h < 16
  }, [now])

  const SERIF = { fontFamily: 'Georgia, "Playfair Display", serif' } as const

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-[#1A1A1A]" style={SERIF}>
          Mairie dynamique
        </h2>
        <p className="text-xs text-[#1A1A1A]/55">
          Services municipaux · horaires · annonces en temps réel
        </p>
      </div>

      {/* Statut d'ouverture */}
      <div
        className={cn(
          'flex items-center justify-between rounded-2xl border p-5 shadow-sm',
          isOpen
            ? 'border-[#4A7C59]/30 bg-[#4A7C59]/5'
            : 'border-[#E30613]/30 bg-[#E30613]/5',
        )}
      >
        <div className="flex items-center gap-3">
          <div
            className={cn(
              'flex h-12 w-12 items-center justify-center rounded-full',
              isOpen ? 'bg-[#4A7C59]/15' : 'bg-[#E30613]/15',
            )}
          >
            {isOpen ? (
              <Check className="h-6 w-6 text-[#4A7C59]" />
            ) : (
              <X className="h-6 w-6 text-[#E30613]" />
            )}
          </div>
          <div>
            <p className="text-lg font-bold text-[#1A1A1A]" style={SERIF}>
              {isOpen ? 'Mairie ouverte' : 'Mairie fermée'}
            </p>
            <p className="text-xs text-[#1A1A1A]/60" suppressHydrationWarning>
              {now
                ? `${now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} · heure locale de Dakar`
                : '--:--'}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-wider text-[#1A1A1A]/50">
            Prochaine fenêtre
          </p>
          <p className="text-sm font-semibold text-[#1A1A1A]">
            {isOpen ? 'Ferme à 16h' : 'Ouvre demain 8h'}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Horaires */}
        <section className="overflow-hidden rounded-2xl border border-[#EAE5DC] bg-white shadow-sm">
          <div className="flex items-center gap-2 border-b border-[#EAE5DC] px-4 py-3">
            <Clock className="h-4 w-4 text-[#1A1A1A]" />
            <h3 className="text-sm font-bold text-[#1A1A1A]" style={SERIF}>
              Horaires d&apos;ouverture
            </h3>
          </div>
          <div className="divide-y divide-[#EAE5DC]/60">
            {[
              { day: 'Lundi', hours: '8h00 - 16h00', open: true },
              { day: 'Mardi', hours: '8h00 - 16h00', open: true },
              { day: 'Mercredi', hours: '8h00 - 16h00', open: true },
              { day: 'Jeudi', hours: '8h00 - 16h00', open: true },
              { day: 'Vendredi', hours: '8h00 - 16h00', open: true },
              { day: 'Samedi', hours: '8h00 - 12h00', open: true },
              { day: 'Dimanche', hours: 'Fermé', open: false },
            ].map((row) => (
              <div key={row.day} className="flex items-center justify-between px-4 py-2.5">
                <span className="text-sm font-medium text-[#1A1A1A]">{row.day}</span>
                <span
                  className={cn(
                    'text-sm tabular-nums',
                    row.open ? 'text-[#4A7C59]' : 'text-[#E30613]',
                  )}
                >
                  {row.hours}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* Services */}
        <section className="overflow-hidden rounded-2xl border border-[#EAE5DC] bg-white shadow-sm">
          <div className="flex items-center gap-2 border-b border-[#EAE5DC] px-4 py-3">
            <Landmark className="h-4 w-4 text-[#1A1A1A]" />
            <h3 className="text-sm font-bold text-[#1A1A1A]" style={SERIF}>
              Services municipaux
            </h3>
          </div>
          <div className="divide-y divide-[#EAE5DC]/60">
            {MAIRIE_SERVICES.map((svc) => (
              <div key={svc.name} className="flex items-center gap-3 px-4 py-3">
                <span className="text-2xl" aria-hidden>
                  {svc.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-[#1A1A1A]">{svc.name}</p>
                  <p className="truncate text-xs text-[#1A1A1A]/55">{svc.desc}</p>
                </div>
                <a
                  href={`tel:${svc.phone}`}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#4A7C59]/12 text-[#4A7C59] transition hover:bg-[#4A7C59] hover:text-white"
                  aria-label={`Appeler ${svc.name}`}
                >
                  <Phone className="h-4 w-4" />
                </a>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Annonces */}
      <section className="overflow-hidden rounded-2xl border border-[#EAE5DC] bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-[#EAE5DC] px-4 py-3">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-[#C9A961]" />
            <h3 className="text-sm font-bold text-[#1A1A1A]" style={SERIF}>
              Annonces récentes
            </h3>
          </div>
          <span className="text-[10px] font-medium text-[#1A1A1A]/50">
            {MAIRIE_ANNOUNCEMENTS.length} actives
          </span>
        </div>
        <div className="divide-y divide-[#EAE5DC]/60">
          {MAIRIE_ANNOUNCEMENTS.map((a, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3">
              <span className="text-xl" aria-hidden>
                {a.emoji}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-[#1A1A1A]">{a.title}</p>
                <p className="text-xs text-[#1A1A1A]/50">
                  {a.date} · {a.time}
                </p>
              </div>
              <Badge variant="outline" className="border-[#EAE5DC] text-[10px] text-[#1A1A1A]/60">
                Diffusion
              </Badge>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

// ---------------------------------------------------------------
// RevenueView — Revenus artisans + part mairie + top contributeurs
// ---------------------------------------------------------------

const MONTHLY_TREND = [
  { month: 'Juil', value: 12.5 },
  { month: 'Août', value: 14.2 },
  { month: 'Sept', value: 15.8 },
  { month: 'Oct', value: 16.1 },
  { month: 'Nov', value: 17.3 },
  { month: 'Déc', value: 18.4 },
] as const

const RATE_PER_CONTACT = 5000 // FCFA par mise en relation générée

function RevenueView({ artisans }: { artisans: CityArtisan[] }) {
  const SERIF = { fontFamily: 'Georgia, "Playfair Display", serif' } as const

  const totalRevenue = useMemo(
    () => artisans.reduce((s, a) => s + a.contactCount * RATE_PER_CONTACT, 0),
    [artisans],
  )

  // Fallback mock réaliste si pas d'artisans (cohérent avec l'overview)
  const displayTotal = totalRevenue > 0 ? totalRevenue : 18_400_000
  const mairieShare = Math.round(displayTotal * 0.3)
  const premiumCount = artisans.filter((a) => a.premium).length

  const topArtisans = useMemo(() => {
    return [...artisans]
      .map((a) => ({ ...a, revenue: a.contactCount * RATE_PER_CONTACT }))
      .sort((x, y) => y.revenue - x.revenue)
      .slice(0, 8)
  }, [artisans])

  const maxRevenue = topArtisans[0]?.revenue ?? 1
  const maxTrend = Math.max(...MONTHLY_TREND.map((m) => m.value))

  const formatFCFA = (n: number) => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace('.', ',')}M`
    if (n >= 1_000) return `${Math.round(n / 1000)}k`
    return String(n)
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-[#1A1A1A]" style={SERIF}>
          Revenus artisans
        </h2>
        <p className="text-xs text-[#1A1A1A]/55">
          Monétisation · part mairie · top contributeurs
        </p>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {/* Total */}
        <div className="overflow-hidden rounded-2xl bg-gradient-to-br from-[#1A1A1A] to-[#2C2C2C] p-5 text-[#FAFAF7] shadow-sm">
          <div className="mb-2 flex items-center gap-2">
            <Wallet className="h-4 w-4 text-[#C9A961]" />
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[#FAFAF7]/55">
              Revenus totaux
            </p>
          </div>
          <p className="text-3xl font-bold tabular-nums text-[#C9A961]" style={SERIF}>
            {formatFCFA(displayTotal)}
            <span className="ml-1 text-sm font-medium text-[#FAFAF7]/60">FCFA</span>
          </p>
          <p className="mt-2 text-[10px] text-[#FAFAF7]/45">Cumul artisans via Aminata</p>
        </div>

        {/* Part mairie */}
        <div className="overflow-hidden rounded-2xl border border-[#C9A961]/30 bg-[#C9A961]/5 p-5 shadow-sm">
          <div className="mb-2 flex items-center gap-2">
            <Building2 className="h-4 w-4 text-[#8B6F47]" />
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[#8B6F47]">
              Part mairie (30%)
            </p>
          </div>
          <p className="text-3xl font-bold tabular-nums text-[#8B6F47]" style={SERIF}>
            {formatFCFA(mairieShare)}
            <span className="ml-1 text-sm font-medium text-[#8B6F47]/70">FCFA</span>
          </p>
          <p className="mt-2 text-[10px] text-[#1A1A1A]/50">
            Commission sur chaque mise en relation
          </p>
        </div>

        {/* Premium */}
        <div className="overflow-hidden rounded-2xl border border-[#EAE5DC] bg-white p-5 shadow-sm">
          <div className="mb-2 flex items-center gap-2">
            <Star className="h-4 w-4 text-[#C9A961]" />
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[#1A1A1A]/55">
              Artisans premium
            </p>
          </div>
          <p className="text-3xl font-bold tabular-nums text-[#1A1A1A]" style={SERIF}>
            {premiumCount}
          </p>
          <p className="mt-2 text-[10px] text-[#1A1A1A]/50">Abonnement mensuel actif</p>
        </div>
      </div>

      {/* Tendance mensuelle */}
      <section className="overflow-hidden rounded-2xl border border-[#EAE5DC] bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-[#4A7C59]" />
            <h3 className="text-sm font-bold text-[#1A1A1A]" style={SERIF}>
              Tendance mensuelle
            </h3>
          </div>
          <span className="text-[10px] font-medium text-[#1A1A1A]/50">
            en millions FCFA
          </span>
        </div>
        <div className="flex h-40 items-end justify-between gap-3 sm:gap-4">
          {MONTHLY_TREND.map((m, i) => {
            const h = (m.value / maxTrend) * 100
            const isLast = i === MONTHLY_TREND.length - 1
            return (
              <div key={m.month} className="flex flex-1 flex-col items-center gap-2">
                <span className="text-[10px] font-bold tabular-nums text-[#1A1A1A]/70">
                  {m.value.toFixed(1).replace('.', ',')}
                </span>
                <div className="flex w-full flex-1 items-end">
                  <div
                    className={cn(
                      'w-full rounded-t-md transition-all',
                      isLast ? 'bg-[#C9A961]' : 'bg-[#4A7C59]/70',
                    )}
                    style={{ height: `${h}%` }}
                  />
                </div>
                <span className="text-[10px] font-medium text-[#1A1A1A]/55">{m.month}</span>
              </div>
            )
          })}
        </div>
      </section>

      {/* Top artisans */}
      <section className="overflow-hidden rounded-2xl border border-[#EAE5DC] bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-[#EAE5DC] px-4 py-3">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-[#C9A961]" />
            <h3 className="text-sm font-bold text-[#1A1A1A]" style={SERIF}>
              Top artisans contributeurs
            </h3>
          </div>
          <span className="text-[10px] font-medium text-[#1A1A1A]/50">
            par revenu généré
          </span>
        </div>
        {topArtisans.length === 0 || topArtisans[0].revenue === 0 ? (
          <div className="p-10 text-center">
            <Wallet className="mx-auto mb-3 h-8 w-8 text-[#1A1A1A]/20" />
            <p className="text-sm font-medium text-[#1A1A1A]/60">
              Aucune donnée de revenu disponible
            </p>
            <p className="mt-1 text-xs text-[#1A1A1A]/40">
              Les revenus apparaîtront dès que des artisans seront contactés.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[#EAE5DC]/60">
            {topArtisans.map((a, i) => (
              <div key={a.id} className="flex items-center gap-3 px-4 py-3">
                <span
                  className={cn(
                    'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold',
                    i === 0
                      ? 'bg-[#C9A961] text-[#1A1A1A]'
                      : i === 1
                        ? 'bg-[#EAE5DC] text-[#1A1A1A]'
                        : i === 2
                          ? 'bg-[#D4A574]/30 text-[#8B6F47]'
                          : 'bg-[#FAFAF7] text-[#1A1A1A]/50',
                  )}
                >
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-semibold text-[#1A1A1A]">{a.name}</p>
                    {a.premium && <Star className="h-3 w-3 fill-[#C9A961] text-[#C9A961]" />}
                  </div>
                  <p className="truncate text-xs text-[#1A1A1A]/55">
                    {a.trade}
                    {a.district ? ` · ${a.district}` : ''}
                  </p>
                </div>
                <div className="hidden h-2 w-24 overflow-hidden rounded-full bg-[#F2EEE5] sm:block">
                  <div
                    className="h-full rounded-full bg-[#4A7C59]"
                    style={{ width: `${(a.revenue / maxRevenue) * 100}%` }}
                  />
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold tabular-nums text-[#1A1A1A]">
                    {formatFCFA(a.revenue)}
                  </p>
                  <p className="text-[10px] text-[#1A1A1A]/50">
                    FCFA · {a.contactCount} contacts
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

// ---------------------------------------------------------------
// PlatesMapView — Liste des plaques avec localisation
// ---------------------------------------------------------------

function PlatesMapView({
  plates,
  incidents,
}: {
  plates: CityPlate[]
  incidents: CityIncident[]
}) {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  const filtered = useMemo(() => {
    return plates.filter((p) => {
      if (statusFilter !== 'all' && p.status !== statusFilter) return false
      if (search.trim()) {
        const q = search.trim().toLowerCase()
        const hay = `${p.plateNumber} ${p.label} ${p.district ?? ''} ${p.address ?? ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [plates, search, statusFilter])

  const stats = useMemo(
    () => ({
      total: plates.length,
      active: plates.filter((p) => p.status === 'active').length,
      maintenance: plates.filter((p) => p.status === 'maintenance').length,
      offline: plates.filter((p) => p.status === 'offline').length,
      totalScans: plates.reduce((s, p) => s + p.scanCount, 0),
    }),
    [plates],
  )

  const emergenciesByPlate = useMemo(() => {
    const map: Record<string, number> = {}
    for (const inc of incidents) {
      if (inc.type === 'emergency' && inc.status !== 'resolved' && inc.plateId) {
        map[inc.plateId] = (map[inc.plateId] ?? 0) + 1
      }
    }
    return map
  }, [incidents])

  const SERIF = { fontFamily: 'Georgia, "Playfair Display", serif' } as const

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-[#1A1A1A]" style={SERIF}>
            Carte des plaques
          </h2>
          <p className="text-xs text-[#1A1A1A]/55">
            {stats.total} plaques · {stats.totalScans} scans cumulés · {stats.active} actives
          </p>
        </div>
        <Badge className="bg-[#C9A961]/15 text-[#8B6F47]">
          <MapPin className="mr-1 h-3 w-3" /> {stats.total} localisations
        </Badge>
      </div>

      {/* Filtres statut */}
      <div className="flex flex-wrap gap-2 text-xs">
        {[
          { key: 'all', label: 'Tous', value: stats.total, color: 'bg-[#EAE5DC] text-[#1A1A1A]' },
          { key: 'active', label: 'Actives', value: stats.active, color: 'bg-[#4A7C59]/12 text-[#4A7C59]' },
          { key: 'maintenance', label: 'Maintenance', value: stats.maintenance, color: 'bg-[#FF6B00]/12 text-[#FF6B00]' },
          { key: 'offline', label: 'Hors ligne', value: stats.offline, color: 'bg-[#E30613]/12 text-[#E30613]' },
        ].map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => setStatusFilter(s.key)}
            className={cn(
              'rounded-lg px-3 py-1.5 font-medium transition',
              s.color,
              statusFilter === s.key && 'ring-2 ring-[#C9A961]',
            )}
          >
            {s.label}: {s.value}
          </button>
        ))}
      </div>

      {/* Recherche */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#1A1A1A]/30" />
        <input
          type="text"
          placeholder="Rechercher par numéro, lieu, quartier…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-xl border border-[#EAE5DC] bg-white py-2.5 pl-10 pr-4 text-sm text-[#1A1A1A] placeholder:text-[#1A1A1A]/40 focus:border-[#C9A961] focus:outline-none focus:ring-2 focus:ring-[#C9A961]/20"
        />
      </div>

      {/* Liste plaques (cards) */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#EAE5DC] bg-white p-12 text-center">
          <MapPin className="mx-auto mb-3 h-8 w-8 text-[#1A1A1A]/20" />
          <p className="text-sm font-medium text-[#1A1A1A]/60">Aucune plaque pour le moment</p>
          <p className="mt-1 text-xs text-[#1A1A1A]/40">
            {plates.length === 0
              ? 'Les plaques installées apparaîtront ici.'
              : 'Aucun résultat avec ces filtres.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.slice(0, 60).map((p) => {
            const emergencyCount = emergenciesByPlate[p.id] ?? 0
            const statusColor =
              p.status === 'active'
                ? COLOR_GREEN
                : p.status === 'maintenance'
                  ? COLOR_ORANGE
                  : p.status === 'offline'
                    ? COLOR_RED
                    : COLOR_ANTHRACITE
            return (
              <article
                key={p.id}
                className="overflow-hidden rounded-2xl border border-[#EAE5DC] bg-white shadow-sm transition-shadow hover:shadow-md"
                style={{ borderTop: `3px solid ${statusColor}` }}
              >
                <div className="p-4">
                  <div className="mb-3 flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#1A1A1A] text-white">
                        <QrCode className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-[#1A1A1A]">
                          {p.plateNumber}
                        </p>
                        <p className="truncate text-xs text-[#1A1A1A]/55">{p.label}</p>
                      </div>
                    </div>
                    {emergencyCount > 0 && (
                      <Badge className="animate-pulse bg-[#E30613] text-[10px] text-white">
                        <AlertTriangle className="mr-0.5 h-2.5 w-2.5" /> {emergencyCount}
                      </Badge>
                    )}
                  </div>

                  <div className="mb-3 space-y-1.5 text-xs">
                    <div className="flex items-center gap-2">
                      <MapPin className="h-3 w-3 shrink-0 text-[#1A1A1A]/40" />
                      <span className="truncate text-[#1A1A1A]/70">
                        {p.district ?? 'Quartier non renseigné'}
                      </span>
                    </div>
                    {p.address && (
                      <div className="flex items-center gap-2">
                        <Building2 className="h-3 w-3 shrink-0 text-[#1A1A1A]/40" />
                        <span className="truncate text-[#1A1A1A]/70">{p.address}</span>
                      </div>
                    )}
                    {p.lat != null && p.lng != null && (
                      <div className="flex items-center gap-2">
                        <span className="text-[#1A1A1A]/40">GPS</span>
                        <span className="tabular-nums text-[#1A1A1A]/70">
                          {p.lat.toFixed(4)}, {p.lng.toFixed(4)}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between gap-2 border-t border-[#EAE5DC] pt-3">
                    <div className="flex items-center gap-3 text-xs">
                      <span className="flex items-center gap-1">
                        <span className="text-[#1A1A1A]/45">Scans</span>
                        <span className="font-bold tabular-nums text-[#1A1A1A]">
                          {p.scanCount}
                        </span>
                      </span>
                      <span className="text-[#1A1A1A]/20">·</span>
                      <span className="flex items-center gap-1">
                        <span className="text-[#1A1A1A]/45">Dernier</span>
                        <span className="font-medium text-[#1A1A1A]">
                          {p.lastScanAt ? timeAgo(p.lastScanAt) : 'jamais'}
                        </span>
                      </span>
                    </div>
                    <Badge
                      className={cn(
                        'text-[10px]',
                        p.status === 'active'
                          ? 'bg-[#4A7C59]/12 text-[#4A7C59]'
                          : p.status === 'maintenance'
                            ? 'bg-[#FF6B00]/12 text-[#FF6B00]'
                            : p.status === 'offline'
                              ? 'bg-[#E30613]/12 text-[#E30613]'
                              : 'bg-amber-100 text-amber-800',
                      )}
                    >
                      {p.status === 'pending'
                        ? 'En attente'
                        : p.status === 'active'
                          ? 'Active'
                          : p.status === 'maintenance'
                            ? 'Maintenance'
                            : p.status === 'offline'
                              ? 'Hors ligne'
                              : p.status}
                    </Badge>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      )}
      {filtered.length > 60 && (
        <p className="text-center text-xs text-[#1A1A1A]/50">
          Affichage de 60 plaques sur {filtered.length}. Affinez la recherche pour voir plus.
        </p>
      )}
    </div>
  )
}

// ============================================================
// AnnouncementsView — Annonces vocales diffusées sur les QR codes
// ============================================================

type Announcement = {
  id: string
  title: string
  message: string
  audioText: string | null
  status: string
  priority: string
  broadcastHours: string[] | null
  targetDistrict: string | null
  startAt: string | null
  endAt: string | null
  createdAt: string
}

function AnnouncementsView() {
  const { toast } = useToast()
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [creating, setCreating] = useState(false)

  // Form state
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [priority, setPriority] = useState('normal')
  const [targetDistrict, setTargetDistrict] = useState('')
  const [hours, setHours] = useState<string[]>([])
  const [hourInput, setHourInput] = useState('08:00')

  const fetchAnnouncements = useCallback(async () => {
    try {
      const res = await fetch('/api/city/announcements', { cache: 'no-store' })
      const json = await res.json()
      if (json?.ok && Array.isArray(json.data?.announcements)) {
        setAnnouncements(json.data.announcements)
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAnnouncements()
  }, [fetchAnnouncements])

  const handleCreate = async () => {
    if (title.trim().length < 3 || message.trim().length < 5) {
      toast({ title: 'Champs requis', description: 'Titre (min. 3) et message (min. 5).' })
      return
    }
    setCreating(true)
    try {
      const res = await fetch('/api/city/announcements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          message: message.trim(),
          priority,
          targetDistrict: targetDistrict.trim() || null,
          broadcastHours: hours.length > 0 ? hours : undefined,
          status: 'scheduled',
        }),
      })
      const json = await res.json()
      if (json?.ok) {
        toast({ title: 'Annonce créée', description: `"${title.trim()}" est programmée.` })
        setTitle('')
        setMessage('')
        setHours([])
        setShowForm(false)
        fetchAnnouncements()
      } else {
        toast({ title: 'Erreur', description: json?.error || 'Création impossible.' })
      }
    } catch {
      toast({ title: 'Erreur réseau', description: 'Vérifiez votre connexion.' })
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await fetch(`/api/city/announcements/${id}`, { method: 'DELETE' })
      setAnnouncements((prev) => prev.filter((a) => a.id !== id))
      toast({ title: 'Annonce supprimée' })
    } catch {
      /* ignore */
    }
  }

  const handleDiffuse = (a: Announcement) => {
    const text = a.audioText || a.message
    try {
      parler(text)
      toast({ title: 'Diffusion vocale', description: `Aminata lit : "${a.title}"` })
    } catch {
      toast({ title: 'Voix indisponible' })
    }
  }

  const addHour = () => {
    if (/^\d{2}:\d{2}$/.test(hourInput) && !hours.includes(hourInput)) {
      setHours((prev) => [...prev, hourInput].sort())
    }
  }

  const removeHour = (h: string) => {
    setHours((prev) => prev.filter((x) => x !== h))
  }

  const priorityColor = (p: string) =>
    p === 'urgent' ? COLOR_RED : p === 'info' ? COLOR_BLUE : COLOR_PURPLE
  const statusColor = (s: string) =>
    s === 'active' ? COLOR_GREEN : s === 'expired' ? '#999' : COLOR_ORANGE
  const statusLabel = (s: string) =>
    s === 'active' ? 'Active' : s === 'expired' ? 'Expirée' : s === 'draft' ? 'Brouillon' : 'Programmée'

  return (
    <div className="space-y-4">
      {/* Header + bouton créer */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-[#1A1A1A]" style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}>
            Annonces vocales
          </h2>
          <p className="text-sm text-[#1A1A1A]/60">
            Programmez des annonces diffusées par Aminata sur les QR codes citoyens.
          </p>
        </div>
        <Button
          onClick={() => setShowForm((v) => !v)}
          className="gap-2 rounded-xl bg-[#6B4C9A] text-white hover:bg-[#5a3d82]"
        >
          <Plus className="size-4" />
          {showForm ? 'Annuler' : 'Nouvelle annonce'}
        </Button>
      </div>

      {/* Formulaire de création */}
      {showForm && (
        <div className="rounded-2xl border-2 border-[#6B4C9A]/20 bg-white p-5 shadow-sm">
          <h3 className="mb-4 text-sm font-bold text-[#1A1A1A]">Créer une annonce</h3>
          <div className="space-y-3">
            {/* Titre */}
            <div>
              <label className="text-xs font-semibold text-[#1A1A1A]/60">Titre court</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex : Collecte des déchets exceptionnelle"
                maxLength={120}
                className="mt-1 w-full rounded-xl border-2 border-[#d5d3d4] px-3 py-2 text-sm focus:border-[#6B4C9A] focus:outline-none"
              />
            </div>
            {/* Message */}
            <div>
              <label className="text-xs font-semibold text-[#1A1A1A]/60">Message (affiché + lu par Aminata)</label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Ex : La collecte des déchets aura lieu ce soir à 19h. Sortez vos bacs."
                maxLength={1000}
                rows={3}
                className="mt-1 w-full rounded-xl border-2 border-[#d5d3d4] px-3 py-2 text-sm focus:border-[#6B4C9A] focus:outline-none"
              />
            </div>
            {/* Priorité + District */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-[#1A1A1A]/60">Priorité</label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  className="mt-1 w-full rounded-xl border-2 border-[#d5d3d4] px-3 py-2 text-sm focus:border-[#6B4C9A] focus:outline-none"
                >
                  <option value="normal">Normal</option>
                  <option value="urgent">Urgent</option>
                  <option value="info">Info</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-[#1A1A1A]/60">Quartier ciblé (vide = tous)</label>
                <input
                  type="text"
                  value={targetDistrict}
                  onChange={(e) => setTargetDistrict(e.target.value)}
                  placeholder="Ex : Plateau"
                  maxLength={60}
                  className="mt-1 w-full rounded-xl border-2 border-[#d5d3d4] px-3 py-2 text-sm focus:border-[#6B4C9A] focus:outline-none"
                />
              </div>
            </div>
            {/* Heures de diffusion */}
            <div>
              <label className="text-xs font-semibold text-[#1A1A1A]/60">Heures de diffusion (optionnel)</label>
              <div className="mt-1 flex gap-2">
                <input
                  type="time"
                  value={hourInput}
                  onChange={(e) => setHourInput(e.target.value)}
                  className="rounded-xl border-2 border-[#d5d3d4] px-3 py-2 text-sm focus:border-[#6B4C9A] focus:outline-none"
                />
                <Button onClick={addHour} variant="outline" className="rounded-xl" type="button">
                  <Plus className="size-4" />
                </Button>
              </div>
              {hours.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {hours.map((h) => (
                    <span
                      key={h}
                      className="inline-flex items-center gap-1 rounded-full bg-[#6B4C9A]/10 px-3 py-1 text-xs font-bold text-[#6B4C9A]"
                    >
                      {h}
                      <button onClick={() => removeHour(h)} className="text-[#6B4C9A]/60 hover:text-[#E30613]">
                        <X className="size-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
            {/* Bouton créer */}
            <Button
              onClick={handleCreate}
              disabled={creating}
              className="w-full rounded-xl bg-[#6B4C9A] py-3 text-white hover:bg-[#5a3d82] disabled:opacity-50"
            >
              {creating ? <Loader2 className="size-4 animate-spin" /> : <Megaphone className="size-4" />}
              {creating ? 'Création…' : "Programmer l'annonce"}
            </Button>
          </div>
        </div>
      )}

      {/* Liste des annonces */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="size-6 animate-spin text-[#6B4C9A]" />
        </div>
      ) : announcements.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-[#d5d3d4] p-12 text-center">
          <Megaphone className="mx-auto size-10 text-[#1A1A1A]/20" />
          <p className="mt-3 text-sm font-medium text-[#1A1A1A]/50">
            Aucune annonce pour le moment.
          </p>
          <p className="text-xs text-[#1A1A1A]/40">
            Cliquez sur « Nouvelle annonce » pour en créer une.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {announcements.map((a) => (
            <div
              key={a.id}
              className="rounded-2xl border-2 border-[#d5d3d4] bg-white p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate text-sm font-bold text-[#1A1A1A]">{a.title}</h3>
                    <span
                      className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase"
                      style={{ background: `${priorityColor(a.priority)}15`, color: priorityColor(a.priority) }}
                    >
                      {a.priority}
                    </span>
                    <span
                      className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                      style={{ background: `${statusColor(a.status)}15`, color: statusColor(a.status) }}
                    >
                      {statusLabel(a.status)}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-[#1A1A1A]/70">{a.message}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-[#1A1A1A]/50">
                    {a.targetDistrict && (
                      <span className="flex items-center gap-1">
                        <MapPin className="size-3" />
                        {a.targetDistrict}
                      </span>
                    )}
                    {a.broadcastHours && a.broadcastHours.length > 0 && (
                      <span className="flex items-center gap-1">
                        <Clock className="size-3" />
                        {a.broadcastHours.join(' · ')}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <Calendar className="size-3" />
                      {new Date(a.createdAt).toLocaleDateString('fr-FR')}
                    </span>
                  </div>
                </div>
              </div>
              {/* Actions */}
              <div className="mt-3 flex items-center gap-2">
                <Button
                  onClick={() => handleDiffuse(a)}
                  size="sm"
                  className="gap-1.5 rounded-lg bg-[#6B4C9A] text-white hover:bg-[#5a3d82]"
                >
                  <Volume2 className="size-3.5" />
                  Diffuser maintenant
                </Button>
                <Button
                  onClick={() => handleDelete(a.id)}
                  size="sm"
                  variant="outline"
                  className="gap-1.5 rounded-lg border-[#E30613]/30 text-[#E30613] hover:bg-[#E30613]/5"
                >
                  <Trash2 className="size-3.5" />
                  Supprimer
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
