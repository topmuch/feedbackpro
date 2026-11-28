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
  Utensils,
  Tag,
  ShoppingBag,
  Sparkles,
  Camera,
  Map,
  Save,
  Key,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { useAppStore } from '@/store/app-store'
import { useToast } from '@/hooks/use-toast'
import { parler } from '@/lib/staff-tts'
import { composeQrPremium, qrServerUrl } from '@/lib/qr-premium'
import { CityWallboardTab } from '@/components/feedbackpro/city-wallboard-tab'
import { DAKAR_REGION, ALL_COMMUNES } from '@/lib/city-seed-data'
import type { CommuneSeed } from '@/lib/city-seed-data'

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
  // SLA photos (transparence citoyenne — visibles staff + citoyens)
  arrivedAt?: string | null
  beforePhoto?: string | null
  afterPhoto?: string | null
}

type CityArtisan = {
  id: string
  name: string
  trade: string
  phone: string
  district: string | null
  address: string | null
  lat: number | null
  lng: number | null
  verified: boolean
  premium: boolean
  rating: number
  reviewCount: number
  contactCount: number
  active: boolean
}

// ---------------------------------------------------------------
// Business (commerces) — soumis par les artisans via la PWA citoyenne
// Flux : pending (en attente de validation) → approved / rejected
// Une fois approved : toggles premium / sponsorisé + menu + grille tarifaire
// ---------------------------------------------------------------

type BusinessMenuItem = {
  id?: string
  name: string
  price: number
  description?: string | null
  photo?: string | null // data URL JPEG (max 400px, qualité 0.7)
}

type BusinessPriceItem = {
  id?: string
  service: string // ex: "Réparation fuite", "Tonte pelouse"
  price: number
  unit?: string | null // ex: "forfait", "à l'heure", "m²"
  photo?: string | null // data URL JPEG (max 400px, qualité 0.7)
}

type CityBusiness = {
  id: string
  name: string
  trade: string
  category: string | null
  phone: string | null
  district: string | null
  address: string | null
  photoUrl: string | null
  status: 'pending' | 'approved' | 'rejected'
  active?: boolean
  isPremium: boolean
  isSponsored: boolean
  offerText: string | null
  offerEndsAt: string | null
  premiumFeatures: string[] | null // ['menu', 'priceGrid', 'sponsored']
  menu: BusinessMenuItem[] | null
  priceGrid: BusinessPriceItem[] | null
  createdAt: string
  updatedAt?: string
}

// ---------------------------------------------------------------
// TaxReport — signalements fiscaux citoyens avec analyse IA
// Flux : reported → verified → tax_collected → rewarded
// ---------------------------------------------------------------

type TaxReportAiAnalysis = {
  depositType?: string
  hasVehicle?: boolean
  vehiclePlate?: string | null
  description?: string | null
  confidence?: number
}

type CityTaxReport = {
  id: string
  plateId: string | null
  plate: {
    id: string
    plateNumber: string
    label: string
    district: string | null
  } | null
  qrToken: string | null
  photoUrl: string | null
  vehiclePlate: string | null
  description: string | null
  gpsLat: number | null
  gpsLng: number | null
  status: 'reported' | 'verified' | 'tax_collected' | 'rewarded'
  taxAmount: number
  rewardAmount: number
  rewardMethod: string | null
  citizenPhone: string | null
  agentName: string | null
  aiAnalysis: string | null // JSON sérialisé TaxReportAiAnalysis
  verifiedAt: string | null
  resolvedAt: string | null
  rewardedAt: string | null
  createdAt: string
  updatedAt: string
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

/** Formate un timestamp ISO en "JJ/MM/AAAA à HH:MM" (date complète courte). */
function formatDateTime(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} à ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Calcule la durée en minutes entre deux timestamps ISO (arrivedAt → resolvedAt). */
function resolutionMinutes(startIso: string, endIso: string): number | null {
  const start = new Date(startIso).getTime()
  const end = new Date(endIso).getTime()
  if (isNaN(start) || isNaN(end) || end < start) return null
  return Math.round((end - start) / 60000)
}

/** Convertit une minute-count en libellé lisible ("Résolu en 18 min" / "1 h 12"). */
function formatDurationLabel(min: number): string {
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const rem = min % 60
  return rem === 0 ? `${h} h` : `${h} h ${rem}`
}

/**
 * Extrait un numéro de téléphone depuis un texte libre (description
 * d'incident laissée par le citoyen). Reconnaît les formats :
 *   - "+221 77 123 45 67"  (intl avec espaces)
 *   - "771234567"            (local Sénégal, 9 chiffres)
 *   - "221771234567"         (intl sans + ni séparateurs)
 *   - "+33 6 12 34 56 78"    (intl France)
 *
 * On exclut les dates ISO (2026-11-20) et les montants (1000 FCFA)
 * via un filtre post-match : le candidat doit contenir 8 à 15 chiffres
 * au total et ne pas ressembler à une date YYYY-MM-DD.
 *
 * Retourne le premier candidat valide, ou null si aucun trouvé.
 */
function extractPhoneFromDescription(text: string | null | undefined): string | null {
  if (!text || typeof text !== 'string') return null
  // Matche des séquences commençant optionnellement par '+' puis 8 à 15
  // chiffres, potentiellement séparés par des espaces, points ou tirets.
  const candidates = text.match(/\+?\d(?:[\s.\-]?\d){7,14}/g)
  if (!candidates || candidates.length === 0) return null
  for (const c of candidates) {
    // Compte les chiffres uniquement.
    const digits = c.replace(/[^\d]/g, '')
    // Un téléphone valide fait 8 à 15 chiffres (E.164 max = 15).
    if (digits.length < 8 || digits.length > 15) continue
    // Exclut les dates ISO (ex: "2026-11-20" → 8 chiffres mais pattern date).
    if (/^\d{4}-\d{2}-\d{2}/.test(c)) continue
    return c.trim()
  }
  return null
}

/** Formate un montant FCFA en abrégé ("18,4M" / "450k" / "0"). */
function formatFCFA(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace('.', ',')}M`
  if (n >= 1_000) return `${Math.round(n / 1000)}k`
  return String(n)
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
      { id: 'history', label: 'Historique', icon: Calendar },
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
      { id: 'businesses', label: 'Commerces', icon: ShoppingBag },
      { id: 'tarifs', label: 'Tarifs', icon: Tag },
      { id: 'qr-config', label: 'QR Code', icon: QrCode },
      { id: 'announcements', label: 'Annonces', icon: Megaphone },
      { id: 'appointments', label: 'Rendez-vous', icon: Calendar },
      { id: 'revenue', label: 'Revenus', icon: Wallet },
      { id: 'reports-mgmt', label: 'Taxes Urbains', icon: FileBarChart },
      { id: 'settings', label: 'Paramètres', icon: Settings },
    ],
  },
] as const

// ---------------------------------------------------------------
// Palette design — bleu wallboard (#0026A3) + jaune accent (#FFD700)
// ---------------------------------------------------------------

const COLOR_RED = '#DC2626'
const COLOR_ORANGE = '#F97316'
const COLOR_BLUE = '#0026A3'
const COLOR_BLUE_HOVER = '#1E40AF'
const COLOR_GREEN = '#059669'
const COLOR_GOLD = '#FFD700'
const COLOR_PURPLE = '#6B4C9A'
const COLOR_ANTHRACITE = '#1A1A1A'
const COLOR_CREAM = '#FAFAF7'

// ============================================================
// Composant principal
// ============================================================

export default function CityDashboard() {
  // --- États données ---
  const [plates, setPlates] = useState<CityPlate[]>([])
  const [incidents, setIncidents] = useState<CityIncident[]>([])
  const [artisans, setArtisans] = useState<CityArtisan[]>([])
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  // --- Voix Aminata (TTS) + sons ---
  const [soundOn, setSoundOn] = useState(false)
  const [showSoundBanner, setShowSoundBanner] = useState(false)
  const seenIdsRef = useRef<Set<string>>(new Set())
  const firstPollRef = useRef(true)
  const alertedLateRef = useRef<Set<string>>(new Set())
  const announcedResolvedRef = useRef<Set<string>>(new Set())

  // --- États UI ---
  const [activeNav, setActiveNav] = useState('overview')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [today, setToday] = useState<Date | null>(null)
  const clock = useClock()

  // --- Logo ville (pour QR codes premium) ---
  const [cityLogoUrl, setCityLogoUrl] = useState<string | null>(null)
  const [qrTheme, setQrTheme] = useState<'signaletique' | 'modern'>('signaletique')
  const logoInputRef = useRef<HTMLInputElement>(null)
  const [composedQrs, setComposedQrs] = useState<Record<string, string>>({})

  // Charger le logo depuis localStorage OU depuis l'API (settings)
  useEffect(() => {
    const loadLogo = async () => {
      try {
        const saved = localStorage.getItem('city_logo_url')
        if (saved) {
          setCityLogoUrl(saved)
        } else {
          // Fallback: fetch from API (cross-device)
          const res = await fetch('/api/city/logo')
          const json = await res.json()
          if (json?.ok && json.data?.logoUrl) {
            setCityLogoUrl(json.data.logoUrl)
            try { localStorage.setItem('city_logo_url', json.data.logoUrl) } catch {}
          }
        }
      } catch { /* ignore */ }
    }
    loadLogo()
  }, [])

  // Charger le thème QR depuis l'API
  useEffect(() => {
    fetch('/api/city/qr-theme')
      .then(r => r.json())
      .then(d => { if (d?.ok && d.data?.theme) setQrTheme(d.data.theme) })
      .catch(() => {})
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

  // Changer le thème QR (déclaré après toast pour éviter l'erreur TDZ)
  const handleThemeChange = useCallback(async (theme: 'signaletique' | 'modern') => {
    setQrTheme(theme)
    try {
      await fetch('/api/city/qr-theme', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theme }),
      })
      toast({ title: 'Thème QR mis à jour', description: theme === 'modern' ? 'Design moderne avec dégradés.' : 'Design signalétique classique.' })
    } catch {
      toast({ title: 'Erreur', description: 'Impossible de changer le thème.' })
    }
  }, [toast])

  // --- Mount SSR-safe ---
  useEffect(() => {
    const t = setTimeout(() => {
      setMounted(true)
      setToday(new Date())
    }, 0)
    return () => clearTimeout(t)
  }, [])

  // --- Fetch des données depuis les APIs ---
  const loadData = useCallback(async () => {
    try {
      const [platesRes, incRes, artRes, annRes] = await Promise.all([
        fetch('/api/city/plates').then((r) => r.json()),
        fetch('/api/city/incidents').then((r) => r.json()),
        fetch('/api/city/artisans').then((r) => r.json()),
        fetch('/api/city/announcements', { cache: 'no-store' }).then((r) => r.json()),
      ])
      if (platesRes?.ok) setPlates(platesRes.data.plates)
      if (incRes?.ok) setIncidents(incRes.data.incidents)
      if (artRes?.ok) setArtisans(artRes.data.artisans)
      if (annRes?.ok && Array.isArray(annRes.data?.announcements)) {
        setAnnouncements(annRes.data.announcements)
      }
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

  // --- Détection nouveaux incidents + résolutions + rappel retard (Aminata TTS) ---
  useEffect(() => {
    if (!incidents || incidents.length === 0) return
    const isFirst = firstPollRef.current
    firstPollRef.current = false
    const nowMs = Date.now()
    // Capture des IDs vus au tour précédent (pour détecter les résolutions)
    const previouslySeen = new Set(seenIdsRef.current)

    for (const inc of incidents) {
      // Nouvel incident détecté
      if (!seenIdsRef.current.has(inc.id)) {
        seenIdsRef.current.add(inc.id)
        if (!isFirst && soundOn) {
          playDing()
          const isEmergency = inc.type === 'emergency'
          const categoryLabel = inc.category || inc.type
          const serviceLabel = inc.assignedTo || 'Mairie'
          const desc = inc.description ? `. ${inc.description.substring(0, 120)}` : ''
          setTimeout(() => {
            parler(
              isEmergency
                ? `Urgence signalée. ${categoryLabel}${desc}. ${serviceLabel} alerté. Intervention requise.`
                : `Nouveau signalement. ${categoryLabel}${desc}. Routé vers ${serviceLabel}.`
            )
          }, 300)
        }
      }

      // Résolution détectée (incident précédemment vu, maintenant résolu)
      if (inc.status === 'resolved' && previouslySeen.has(inc.id) && !announcedResolvedRef.current.has(inc.id)) {
        announcedResolvedRef.current.add(inc.id)
        if (!isFirst && soundOn) {
          setTimeout(() => {
            parler(`Signalement résolu. ${inc.category || inc.type}. ${inc.assignedTo || 'Mairie'} a traité le problème.`)
          }, 300)
        }
      }

      // Rappel retard (> 10 min sans résolution) — skip si résolu
      if (inc.status === 'resolved') continue
      const elapsedMin = Math.floor((nowMs - new Date(inc.createdAt).getTime()) / 60000)
      if (elapsedMin >= 10) {
        const lateKey = `${inc.id}-${Math.floor(elapsedMin / 5) * 5}min`
        if (!alertedLateRef.current.has(lateKey)) {
          alertedLateRef.current.add(lateKey)
          if (soundOn && !isFirst) {
            playEscalation()
            const desc = inc.description ? `. ${inc.description.substring(0, 80)}` : ''
            setTimeout(() => {
              parler(
                `Signalement en retard. ${elapsedMin} minutes écoulées. ${inc.category || inc.type}${desc}. ${inc.assignedTo || 'Mairie'}. Intervention requise.`
              )
            }, 300)
          }
        }
      }
    }
    // Nettoie les IDs résolus/disparus
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
        setTimeout(() => parler('Voix Aminata activée. Je surveille les alertes de la ville.'), 300)
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
      // Persiste en base (settings) pour que le QR citoyen puisse l'afficher
      fetch('/api/city/logo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ logoUrl: dataUrl }),
      }).catch(() => { /* non bloquant */ })
      toast({ title: 'Logo enregistré', description: 'Le logo apparaîtra sur les QR codes citoyens et au centre des plaques.' })
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
    // Génère un CSV simple avec tous les incidents (téléchargeable)
    try {
      const rows = [
        ['Date', 'Type', 'Catégorie', 'Description', 'Statut', 'Service', 'Plaque', 'Quartier'],
        ...incidents.map((inc) => [
          new Date(inc.createdAt).toLocaleString('fr-FR'),
          inc.type || '',
          inc.category || '',
          (inc.description || '').replace(/"/g, "'").substring(0, 100),
          inc.status || '',
          inc.assignedTo || '',
          inc.plate?.plateNumber || '',
          inc.plate?.district || '',
        ]),
      ]
      const csv = rows.map((r) => r.map((c) => `"${c}"`).join(',')).join('\n')
      const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `rapport-incidents-${new Date().toISOString().slice(0, 10)}.csv`
      a.click()
      URL.revokeObjectURL(url)
      toast({ title: 'Rapport téléchargé', description: `${incidents.length} incidents exportés en CSV.` })
    } catch {
      toast({ title: 'Erreur', description: 'Impossible de générer le rapport.' })
    }
  }, [incidents, toast])

  const handleLogout = useCallback(async () => {
    await logout()
    setView('landing')
  }, [logout, setView])

  // --- Mise à jour du statut d'un incident (Pris en charge / Résolu) ---
  // Met à jour l'état local de façon optimiste, puis PATCH l'API.
  // Lors de la prise en charge (in_progress), on marque aussi arrivedAt = now
  // côté optimiste et côté API (SLA temps réel).
  // En cas d'échec, on recharge toutes les données pour resynchroniser.
  const handleUpdateIncident = useCallback(
    async (id: string, newStatus: 'in_progress' | 'resolved') => {
      // Snapshot pour revert éventuel
      const snapshot = incidents
      const nowIso = new Date().toISOString()
      // Mise à jour optimiste
      setIncidents((prev) =>
        prev.map((i) =>
          i.id === id
            ? {
                ...i,
                status: newStatus,
                resolvedAt:
                  newStatus === 'resolved' ? nowIso : i.resolvedAt,
                // SLA : on fixe le scan d'arrivée agent quand on prend en charge
                arrivedAt:
                  newStatus === 'in_progress' && !i.arrivedAt ? nowIso : i.arrivedAt,
              }
            : i,
        ),
      )
      try {
        const patchBody: Record<string, unknown> = { status: newStatus }
        if (newStatus === 'in_progress') {
          // Marque la prise en charge côté API (timestamp serveur)
          patchBody.arrivedAt = true
        }
        const res = await fetch(`/api/city/incidents/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patchBody),
        })
        const json = await res.json()
        if (json?.ok) {
          toast({
            title:
              newStatus === 'resolved'
                ? 'Incident résolu'
                : 'Incident pris en charge',
            description:
              newStatus === 'resolved'
                ? 'Le citoyen sera notifié de la résolution.'
                : "L'incident est maintenant en cours de traitement.",
          })

          // Feature #1 — Notification WhatsApp du citoyen lors de la
          // résolution. On cherche un numéro dans la description du
          // signalement ; si trouvé, on appelle /api/city/notify-resolution
          // qui génère un lien wa.me pré-rempli, puis on l'ouvre dans un
          // nouvel onglet pour que l'agent valide l'envoi (V1 manuelle,
          // zéro coût API).
          if (newStatus === 'resolved') {
            const inc = snapshot.find((i) => i.id === id)
            const phone = extractPhoneFromDescription(inc?.description)
            if (phone) {
              try {
                const notifyRes = await fetch('/api/city/notify-resolution', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ incidentId: id, phone }),
                })
                const notifyJson = await notifyRes.json()
                if (notifyJson?.ok && notifyJson?.data?.whatsappUrl) {
                  // Ouvre WhatsApp dans un nouvel onglet (deep link wa.me).
                  // L'agent confirme/envoie manuellement — pas d'envoi
                  // automatique payant en V1.
                  if (typeof window !== 'undefined') {
                    window.open(notifyJson.data.whatsappUrl, '_blank', 'noopener,noreferrer')
                  }
                  toast({
                    title: 'Citoyen notifié par WhatsApp',
                    description: `Message de résolution prêt pour ${phone}`,
                  })
                } else {
                  console.warn(
                    '[handleUpdateIncident] notify-resolution a échoué:',
                    notifyJson?.error,
                  )
                }
              } catch (notifyErr) {
                // Non bloquant : l'incident est déjà résolu côté API.
                console.warn(
                  '[handleUpdateIncident] Erreur notification WhatsApp:',
                  notifyErr,
                )
              }
            } else {
              // Pas de téléphone dans la description — on logge seulement
              // (le toast "Incident résolu" standard a déjà été affiché).
              console.log(
                `[handleUpdateIncident] Aucun téléphone trouvé dans la description de l'incident ${id} — notification WhatsApp ignorée`,
              )
            }
          }
        } else {
          // Revert + message
          setIncidents(snapshot)
          toast({
            title: 'Erreur',
            description: json?.error ?? 'Mise à jour impossible',
            variant: 'destructive',
          })
        }
      } catch {
        setIncidents(snapshot)
        toast({ title: 'Erreur réseau', variant: 'destructive' })
      }
    },
    [incidents, toast],
  )

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
    satisfaction:
      artisans.length > 0
        ? Math.round(
            (artisans.reduce((s, a) => s + a.rating, 0) / artisans.length) * 10,
          ) / 10
        : 0,
  }

  const platesActive = plates.filter((p) => p.status === 'active').length
  const platesMaintenance = plates.filter(
    (p) => p.status === 'maintenance',
  ).length
  const platesOffline = plates.filter((p) => p.status === 'offline').length
  const platesUrgence = incidents.filter(
    (i) => i.type === 'emergency' && i.plateId,
  ).length

  // --- Revenus artisans (réel : contactCount × tarif) ---
  const revenueTotal = useMemo(
    () => artisans.reduce((s, a) => s + a.contactCount * RATE_PER_CONTACT, 0),
    [artisans],
  )
  const revenueMairieShare = Math.round(revenueTotal * 0.3)

  // --- Densité d'activité par quartier (réel : incidents groupés par district) ---
  const heatmapData = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const inc of incidents) {
      const district = inc.plate?.district
      if (!district) continue
      counts[district] = (counts[district] ?? 0) + 1
    }
    return Object.entries(counts)
      .map(([district, count]) => ({ district, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
  }, [incidents])
  const heatmapMax = heatmapData.length > 0 ? heatmapData[0].count : 0

  // --- Dernière annonce active (réel : depuis /api/city/announcements) ---
  const latestAnnouncement = useMemo(() => {
    const active = announcements.filter(
      (a) => a.status === 'active' || a.status === 'scheduled',
    )
    if (active.length === 0) return null
    return active.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )[0]
  }, [announcements])

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
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-[#FFD700]" />
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
          'fixed inset-y-0 left-0 z-30 flex w-[280px] flex-col bg-[#0026A3] text-white transition-transform duration-300 lg:translate-x-0',
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
              className="truncate text-sm font-bold leading-tight text-white"
              style={{ fontFamily: 'Georgia, "Playfair Display", serif' }}
            >
              FeedVoice · Ville Connectée
            </h1>
            <p className="text-[11px] leading-tight text-white/60">
              Dakar · Centre de Supervision
            </p>
          </div>
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-white/60 hover:bg-white/5 hover:text-white lg:hidden"
            aria-label="Fermer le menu"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Navigation scrollable */}
        <nav
          className="flex-1 px-3 py-2"
          aria-label="Navigation principale"
        >
          {NAV_SECTIONS.map((section) => (
            <div key={section.title} className="mb-4">
              <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-white/40">
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
                            ? 'bg-[#FFD700] text-[#1A1A1A]'
                            : 'text-white/75 hover:bg-white/5 hover:text-white',
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
                                ? 'bg-[#DC2626] text-white'
                                : active
                                  ? 'bg-[#1A1A1A]/15 text-[#1A1A1A]'
                                  : 'bg-white/10 text-white',
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
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#FFD700] text-sm font-bold text-[#1A1A1A]">
              OD
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-white">
                Ousmane Diallo
              </p>
              <p className="truncate text-[10px] text-white/60">
                Directeur Supervision
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLogout}
            className="w-full justify-start gap-2 text-white/70 hover:bg-white/5 hover:text-white"
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
        <header
          className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-[#FFD700]/30 px-4 backdrop-blur sm:px-6 lg:px-8"
          style={{ backgroundColor: '#0026A3' }}
        >
          <div className="ml-10 flex items-center gap-3 lg:ml-0">
            <div className="flex items-center gap-2">
              <span className="text-xl" aria-hidden>
                🏙️
              </span>
              <div>
                <h2
                  className="text-base font-bold leading-tight text-white"
                  style={{ fontFamily: 'Georgia, "Playfair Display", serif' }}
                >
                  Centre de Supervision Urbaine
                </h2>
                <p
                  className="text-[11px] font-medium"
                  style={{ color: 'rgba(255,255,255,0.65)' }}
                  suppressHydrationWarning
                >
                  {today ? formatDateLong(today) : ''}
                  {' · '}
                  <span style={{ color: '#FFD700', fontVariantNumeric: 'tabular-nums' }}>
                    {clock}
                  </span>
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Toggle son Aminata — jaune quand ON */}
            <Button
              variant="outline"
              size="sm"
              onClick={toggleSound}
              title={soundOn ? "Désactiver la voix Aminata" : "Activer la voix Aminata"}
              className={cn(
                "border-white/20 bg-transparent transition",
                soundOn
                  ? "border-[#FFD700]/60 bg-[#FFD700] text-[#0026A3] hover:bg-[#FFD700]/85"
                  : "text-white hover:bg-white/10 hover:text-white",
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
              className="border-white/20 bg-transparent text-white hover:border-[#FFD700]/40 hover:bg-white/10 hover:text-white"
            >
              <RefreshCw
                className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')}
              />
              <span className="hidden sm:inline">Actualiser</span>
            </Button>
            <Button
              size="sm"
              onClick={handleExport}
              className="bg-[#FFD700] text-[#0026A3] hover:bg-[#FFD700]/85"
            >
              <Download className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Exporter rapport</span>
            </Button>
          </div>
        </header>

        {/* Bannière activation sonore */}
        {showSoundBanner && !soundOn && (
          <div className="mb-4 flex items-center justify-between rounded-xl border border-[#FFD700]/30 bg-[#FFD700]/8 px-4 py-3">
            <div className="flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#FFD700]/15">
                <Volume2 className="h-4 w-4 text-[#FFD700]" />
              </span>
              <div>
                <p className="text-sm font-semibold text-[#1A1A1A]">
                  Activez la voix Aminata pour les alertes vocales
                </p>
                <p className="text-xs text-[#1A1A1A]/60">
                  Ding + annonces vocales à chaque nouveau signalement
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={toggleSound} className="bg-[#059669] text-white hover:bg-[#047857]">
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
              <h2 className="text-xl font-bold text-[#0026A3]" style={{ fontFamily: 'Georgia, "Playfair Display", serif' }}>
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
                      className="border-[#FFD700]/40 text-[#1A1A1A] hover:bg-[#FFD700]/8"
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
                        className="text-[#DC2626]"
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

              {/* Thème QR Code */}
              <div className="rounded-2xl border border-[#EAE5DC] bg-white p-6 shadow-sm">
                <h3 className="mb-1 text-sm font-bold uppercase tracking-wide text-[#1A1A1A]/60">
                  Thème QR Code Citoyen
                </h3>
                <p className="mb-4 text-xs text-[#1A1A1A]/50">
                  Choisissez le design visuel affiché sur les QR codes scannés par les citoyens.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => handleThemeChange('signaletique')}
                    className={cn(
                      'rounded-xl border-2 p-4 text-left transition-all',
                      qrTheme === 'signaletique'
                        ? 'border-[#0026A3] bg-[#0026A3]/5 ring-2 ring-[#0026A3]/20'
                        : 'border-[#EAE5DC] hover:border-[#0026A3]/30',
                    )}
                  >
                    <div className="mb-2 flex h-16 overflow-hidden rounded-lg bg-white">
                      <div className="flex items-center justify-center" style={{ background: '#1B2A8C', width: '40%' }}>
                        <span className="text-lg">👋</span>
                      </div>
                      <div className="flex flex-1 flex-col gap-1 p-2">
                        <div className="h-3 rounded" style={{ background: '#FFDD00' }} />
                        <div className="h-3 rounded" style={{ background: '#DC2626' }} />
                      </div>
                    </div>
                    <p className="text-sm font-bold text-[#1A1A1A]">Signalétique</p>
                    <p className="text-xs text-[#1A1A1A]/50">Couleurs pleines — Arial</p>
                  </button>
                  <button
                    onClick={() => handleThemeChange('modern')}
                    className={cn(
                      'rounded-xl border-2 p-4 text-left transition-all',
                      qrTheme === 'modern'
                        ? 'border-[#0026A3] bg-[#0026A3]/5 ring-2 ring-[#0026A3]/20'
                        : 'border-[#EAE5DC] hover:border-[#0026A3]/30',
                    )}
                  >
                    <div className="mb-2 flex h-16 overflow-hidden rounded-lg" style={{ background: '#FFFBEB' }}>
                      <div className="flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #1E3A8A 0%, #1E40AF 100%)', width: '40%' }}>
                        <span className="text-lg">👋</span>
                      </div>
                      <div className="flex flex-1 flex-col gap-1 p-2">
                        <div className="h-3 rounded" style={{ background: 'linear-gradient(135deg, #DC2626 0%, #991B1B 100%)' }} />
                        <div className="h-3 rounded" style={{ background: 'linear-gradient(135deg, #FFD700 0%, #F59E0B 100%)' }} />
                      </div>
                    </div>
                    <p className="text-sm font-bold text-[#1A1A1A]">Moderne</p>
                    <p className="text-xs text-[#1A1A1A]/50">Dégradés — Inter — crème</p>
                  </button>
                </div>
              </div>

              {/* Configuration Aminata */}
              <div className="rounded-2xl border border-[#EAE5DC] bg-white p-6 shadow-sm">
                <h3 className="mb-4 text-sm font-bold uppercase tracking-wide text-[#1A1A1A]/60">
                  Voix Aminata (supervision)
                </h3>
                <div className="flex items-center justify-between rounded-xl bg-[#FAFAF7] px-4 py-3">
                  <div className="flex items-center gap-3">
                    {soundOn ? <Volume2 className="h-5 w-5 text-[#FFD700]" /> : <VolumeX className="h-5 w-5 text-[#1A1A1A]/40" />}
                    <div>
                      <p className="text-sm font-medium text-[#1A1A1A]">Alertes vocales</p>
                      <p className="text-xs text-[#1A1A1A]/50">Ding + annonces à chaque nouveau signalement</p>
                    </div>
                  </div>
                  <Button size="sm" variant={soundOn ? 'default' : 'outline'} onClick={toggleSound}
                    className={soundOn ? 'bg-[#059669] text-white' : 'border-[#EAE5DC]'}>
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
                  <Badge className="bg-[#059669]/12 text-[#059669]">Activé</Badge>
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
            <EmergenciesView
              incidents={incidents}
              onUpdateStatus={handleUpdateIncident}
            />
          )}

          {/* ====== VUE SIGNALEMENTS ====== */}
          {activeNav === 'reports' && (
            <ReportsView
              incidents={incidents}
              onUpdateStatus={handleUpdateIncident}
            />
          )}

          {/* ====== VUE HISTORIQUE (filtre temporel + export CSV/PDF) ====== */}
          {activeNav === 'history' && (
            <HistoryView incidents={incidents} />
          )}

          {/* ====== VUE ARTISANS VÉRIFIÉS ====== */}
          {activeNav === 'artisans' && (
            <ArtisansView artisans={artisans} onRefresh={handleRefresh} />
          )}

          {/* ====== VUE TRANSPORTS ====== */}
          {activeNav === 'transports' && <TransportView />}

          {/* ====== VUE MAIRIE DYNAMIQUE ====== */}
          {activeNav === 'mairie-dynamic' && (
            <MairieDynamicView />
          )}

          {/* ====== VUE ÉQUIPES TERRAIN ====== */}
          {activeNav === 'teams' && <TeamsView />}

          {/* ====== VUE REVENUS ====== */}
          {activeNav === 'revenue' && (
            <RevenueView artisans={artisans} incidents={incidents} />
          )}

          {/* ====== VUE CARTE DES PLAQUES ====== */}
          {activeNav === 'plates-map' && (
            <PlatesMapView
              plates={plates}
              incidents={incidents}
              composedQrs={composedQrs}
              cityLogoUrl={cityLogoUrl}
              onRefresh={handleRefresh}
              onNavigate={setActiveNav}
            />
          )}

          {/* ====== VUE WALLBOARD TV ====== */}
          {activeNav === 'wallboard' && (
            <CityWallboardTab />
          )}

          {/* ====== VUE TARIFS ====== */}
          {activeNav === 'tarifs' && (
            <TarifsView />
          )}

          {/* ====== VUE CONFIG QR CODE ====== */}
          {activeNav === 'qr-config' && (
            <QrCodeConfigView />
          )}

          {/* ====== VUE ANNONCES ====== */}
          {activeNav === 'announcements' && (
            <AnnouncementsView />
          )}

          {/* ====== VUE RENDEZ-VOUS (citizen appointment requests) ====== */}
          {activeNav === 'appointments' && (
            <AppointmentsView />
          )}

          {/* ====== VUE COMMERCES (Business management) ====== */}
          {activeNav === 'businesses' && (
            <BusinessManagementView onRefresh={handleRefresh} />
          )}

          {/* ====== VUE RAPPORTS FISCAUX (tax reports + AI analysis) ====== */}
          {activeNav === 'reports-mgmt' && (
            <TaxReportsView />
          )}

          {/* ====== VUE OVERVIEW (défaut) — redesign moderne ====== */}
          {/* ====== VUE D'ENSEMBLE — design simple avec KPI multicolores ====== */}
          {activeNav === 'overview' && (
            <>
          {/* ---------- HEADER SIMPLE ---------- */}
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-[#0026A3]" style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}>
                Vue d&apos;ensemble
              </h2>
              <p className="text-xs text-[#1A1A1A]/50">Supervision temps réel · Dakar</p>
            </div>
            <div className="flex items-center gap-2 rounded-lg bg-[#0026A3]/5 px-3 py-1.5">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#059669] opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-[#059669]" />
              </span>
              <span className="text-xs font-medium text-[#0026A3]">En direct</span>
              <span className="ml-1 text-[10px] tabular-nums text-[#1A1A1A]/50" suppressHydrationWarning>{clock}</span>
            </div>
          </div>

          {/* ---------- KPI MULTICOLORES (6 cartes) ---------- */}
          <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {/* Urgences — ROUGE */}
            <div className="rounded-2xl p-4 text-white shadow-md" style={{ background: '#DC2626' }}>
              <AlertTriangle className="size-6 opacity-80" />
              <p className="mt-2 text-3xl font-bold">{kpis.urgences}</p>
              <p className="text-[10px] font-semibold uppercase tracking-wide opacity-80">Urgences</p>
              <p className="text-[9px] opacity-60">Police notifiée</p>
            </div>
            {/* Signalements — ORANGE */}
            <div className="rounded-2xl p-4 text-white shadow-md" style={{ background: '#F97316' }}>
              <Bell className="size-6 opacity-80" />
              <p className="mt-2 text-3xl font-bold">{kpis.signalements}</p>
              <p className="text-[10px] font-semibold uppercase tracking-wide opacity-80">Signalements</p>
              <p className="text-[9px] opacity-60">En cours</p>
            </div>
            {/* Plaques — BLEU */}
            <div className="rounded-2xl p-4 text-white shadow-md" style={{ background: '#0026A3' }}>
              <MapPin className="size-6 opacity-80" />
              <p className="mt-2 text-3xl font-bold">{platesActive}</p>
              <p className="text-[10px] font-semibold uppercase tracking-wide opacity-80">Plaques QR</p>
              <p className="text-[9px] opacity-60">{plates.length} au total</p>
            </div>
            {/* Artisans — VERT */}
            <div className="rounded-2xl p-4 text-white shadow-md" style={{ background: '#059669' }}>
              <Wrench className="size-6 opacity-80" />
              <p className="mt-2 text-3xl font-bold">{artisans.length}</p>
              <p className="text-[10px] font-semibold uppercase tracking-wide opacity-80">Artisans</p>
              <p className="text-[9px] opacity-60">{kpis.artisansContactes} contacts</p>
            </div>
            {/* Satisfaction — VIOLET */}
            <div className="rounded-2xl p-4 text-white shadow-md" style={{ background: '#6B4C9A' }}>
              <Star className="size-6 opacity-80" />
              <p className="mt-2 text-3xl font-bold">{kpis.satisfaction}</p>
              <p className="text-[10px] font-semibold uppercase tracking-wide opacity-80">/5 Satisfaction</p>
              <p className="text-[9px] opacity-60">Évaluation citoyenne</p>
            </div>
            {/* Revenus — DORÉ */}
            <div className="rounded-2xl p-4 text-white shadow-md" style={{ background: '#F59E0B' }}>
              <Wallet className="size-6 opacity-80" />
              <p className="mt-2 text-2xl font-bold">{formatFCFA(revenueTotal)}</p>
              <p className="text-[10px] font-semibold uppercase tracking-wide opacity-80">Revenus FCFA</p>
              <p className="text-[9px] opacity-60">Mairie: {formatFCFA(revenueMairieShare)}</p>
            </div>
          </div>

          {/* ---------- INCIDENTS RÉCENTS (liste simple) ---------- */}
          <div className="rounded-2xl border border-[#EAE5DC] bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <Activity className="size-4 text-[#0026A3]" />
              <h3 className="text-sm font-bold text-[#0026A3]">Incidents récents</h3>
              <span className="ml-auto text-xs text-[#1A1A1A]/40">{incidents.length} total</span>
            </div>
            <div className="space-y-2">
              {incidents.length === 0 ? (
                <p className="py-6 text-center text-sm text-[#1A1A1A]/40">Aucun incident pour le moment.</p>
              ) : (
                incidents.slice(0, 8).map((inc) => {
                  const statusInfo = incidentStatusInfo(inc.status)
                  return (
                    <div key={inc.id} className="flex items-center gap-3 rounded-xl border-l-4 bg-[#FAFAF7] px-3 py-2.5"
                      style={{ borderColor: statusInfo.color }}
                    >
                      <span className="text-lg">{incidentEmoji(inc.type)}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-[#1A1A1A]">
                          {inc.category || inc.type} {inc.description ? `· ${inc.description.slice(0, 50)}` : ''}
                        </p>
                        <p className="text-[10px] text-[#1A1A1A]/50">
                          {inc.plate?.label || 'Plaque inconnue'} · {timeAgo(inc.createdAt)}
                        </p>
                      </div>
                      <span className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                        style={{ background: `${statusInfo.color}20`, color: statusInfo.color }}
                      >
                        {statusInfo.label}
                      </span>
                    </div>
                  )
                })
              )}
            </div>
          </div>
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

// ---------------------------------------------------------------
// KpiCardEnhanced — variante avec indicateur de trend + halo coloré
// ---------------------------------------------------------------

type KpiCardEnhancedProps = {
  title: string
  value: string | number
  sub?: string
  color: string
  icon: typeof Activity
  trend?: string
  trendDirection?: 'up' | 'down' | 'flat'
  critical?: boolean
  warning?: boolean
  success?: boolean
}

function KpiCardEnhanced({
  title,
  value,
  sub,
  color,
  icon: Icon,
  trend,
  trendDirection = 'flat',
  critical,
  warning,
  success,
}: KpiCardEnhancedProps) {
  const trendColor =
    trendDirection === 'up'
      ? COLOR_GREEN
      : trendDirection === 'down'
        ? COLOR_RED
        : COLOR_ANTHRACITE
  const TrendIcon =
    trendDirection === 'up' ? TrendingUp : trendDirection === 'down' ? Activity : Activity
  return (
    <div
      className="relative overflow-hidden rounded-2xl bg-white transition-all hover:-translate-y-0.5"
      style={{
        borderLeft: `4px solid ${color}`,
        boxShadow: `0 4px 14px -8px ${color}55, 0 1px 2px rgba(0,0,0,0.04)`,
      }}
    >
      {/* Halo coloré discret en bas à droite */}
      <div
        className="pointer-events-none absolute -bottom-6 -right-6 h-20 w-20 rounded-full opacity-10"
        style={{ backgroundColor: color }}
        aria-hidden
      />
      <div className="relative px-4 py-3 sm:px-4 sm:py-4">
        <div className="mb-2 flex items-start justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[#1F2937]">
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
          className="text-2xl font-bold tabular-nums leading-none"
          style={{ fontFamily: 'Georgia, "Playfair Display", serif', color }}
        >
          {value}
        </p>
        {sub && (
          <p className="mt-1 truncate text-[10px] text-[#1F2937]/55">{sub}</p>
        )}
        <div className="mt-2 flex items-center justify-between gap-2">
          {trend && (
            <span
              className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-bold tabular-nums"
              style={{
                backgroundColor: `${trendColor}12`,
                color: trendColor,
              }}
            >
              <TrendIcon className="h-2.5 w-2.5" />
              {trend}
            </span>
          )}
          {critical && (
            <span
              className="ml-auto inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white"
              style={{ backgroundColor: COLOR_RED }}
            >
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
              Critique
            </span>
          )}
          {warning && !critical && (
            <span
              className="ml-auto inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white"
              style={{ backgroundColor: COLOR_ORANGE }}
            >
              À traiter
            </span>
          )}
          {success && !critical && !warning && (
            <span
              className="ml-auto inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white"
              style={{ backgroundColor: COLOR_GREEN }}
            >
              ✓ OK
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------
// QuickAction — bouton d'action rapide (grille overview)
// ---------------------------------------------------------------

type QuickActionProps = {
  label: string
  icon: typeof Activity
  color: string
  badge?: number
  onClick?: () => void
}

function QuickAction({ label, icon: Icon, color, badge, onClick }: QuickActionProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative flex flex-col items-start gap-2 rounded-xl border border-[#EAE5DC] bg-white p-3 text-left transition-all hover:-translate-y-0.5 hover:border-[#FFD700]/40 hover:shadow-md"
    >
      <div className="flex w-full items-center justify-between">
        <span
          className="flex h-8 w-8 items-center justify-center rounded-lg transition"
          style={{ backgroundColor: `${color}15`, color }}
        >
          <Icon className="h-4 w-4" />
        </span>
        {badge != null && badge > 0 && (
          <span
            className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[10px] font-bold text-white"
            style={{ backgroundColor: color }}
          >
            {badge}
          </span>
        )}
      </div>
      <span className="text-xs font-semibold leading-tight text-[#1A1A1A]">
        {label}
      </span>
      <span className="text-[10px] text-[#1A1A1A]/40 transition group-hover:text-[#FFD700]">
        Ouvrir →
      </span>
    </button>
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
      <div className="flex items-center justify-between border-b border-[#EAE5DC] border-l-4 border-l-[#FFD700] bg-[#0026A3]/5 px-4 py-3">
        <div className="flex items-center gap-2">
          <Icon
            className="h-4 w-4"
            style={{ color: accent ?? COLOR_ANTHRACITE }}
          />
          <h3
            className="text-sm font-bold text-[#0026A3]"
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
      <span className="text-xs text-white/60">{label}</span>
      <span
        className={cn(
          'text-xs font-semibold tabular-nums',
          highlight ? 'text-[#FFD700]' : 'text-white',
        )}
      >
        {value}
      </span>
    </div>
  )
}

// ============================================================
// CommuneSeederModal — Pré-charger une ville (génération auto
// des plaques pour tous les quartiers d'une commune de Dakar)
// ============================================================

// Palette par département — couleurs distinctes (aucun indigo/bleu franc).
const DEPARTMENT_COLORS: Record<string, { bg: string; ring: string; text: string; dot: string; btn: string }> = {
  Dakar: { bg: 'bg-[#2E5C8A]/10', ring: 'ring-[#2E5C8A]', text: 'text-[#2E5C8A]', dot: 'bg-[#2E5C8A]', btn: 'bg-[#2E5C8A] hover:bg-[#1F4A75]' },
  Pikine: { bg: 'bg-[#059669]/10', ring: 'ring-[#059669]', text: 'text-[#059669]', dot: 'bg-[#059669]', btn: 'bg-[#059669] hover:bg-[#047857]' },
  'Guédiawaye': { bg: 'bg-[#F97316]/10', ring: 'ring-[#F97316]', text: 'text-[#F97316]', dot: 'bg-[#F97316]', btn: 'bg-[#F97316] hover:bg-[#EA580C]' },
  'Keur Massar': { bg: 'bg-[#7A4FB0]/10', ring: 'ring-[#7A4FB0]', text: 'text-[#7A4FB0]', dot: 'bg-[#7A4FB0]', btn: 'bg-[#7A4FB0] hover:bg-[#6840A0]' },
  'Rufisque': { bg: 'bg-[#0F8A8A]/10', ring: 'ring-[#0F8A8A]', text: 'text-[#0F8A8A]', dot: 'bg-[#0F8A8A]', btn: 'bg-[#0F8A8A] hover:bg-[#0B7575]' },
}

function deptColor(name: string) {
  return (
    DEPARTMENT_COLORS[name] ?? {
      bg: 'bg-[#FFD700]/10',
      ring: 'ring-[#FFD700]',
      text: 'text-[#B8964F]',
      dot: 'bg-[#FFD700]',
      btn: 'bg-[#FFD700] hover:bg-[#B8964F]',
    }
  )
}

type SeedResult = {
  created: number
  commune: string
  department: string
  plates: { id: string; plateNumber: string; label: string }[]
}

function CommuneSeederModal({ onClose }: { onClose: () => void }) {
  const { toast } = useToast()
  const [selectedDept, setSelectedDept] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [result, setResult] = useState<SeedResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const SERIF = { fontFamily: 'Georgia, "Playfair Display", serif' } as const

  // Quartiers déjà existants (cache léger pour indiquer le statut dans la carte)
  // — évite un appel supplémentaire, on se base sur le résultat 409 de l'API.

  const handleGenerate = async (commune: CommuneSeed) => {
    setGenerating(true)
    setError(null)
    setResult(null)
    try {
      const res = await fetch('/api/city/plates/seed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ communeCode: commune.code }),
      })
      const json = await res.json()
      if (!res.ok) {
        if (res.status === 409) {
          setError(
            `Cette commune (${commune.code} — ${commune.name}) a déjà des plaques. Supprimez-les d'abord depuis le tableau pour régénérer.`,
          )
          toast({
            title: 'Commune déjà pré-chargée',
            description: `${commune.name} possède déjà des plaques (${commune.code}#).`,
            variant: 'destructive',
          })
        } else {
          setError(json?.error ?? 'Échec de la génération.')
          toast({ title: 'Erreur', description: json?.error ?? 'Échec', variant: 'destructive' })
        }
        return
      }
      if (json?.ok && json?.data) {
        const data = json.data as SeedResult
        setResult(data)
        toast({
          title: 'Ville pré-chargée',
          description: `${data.created} plaques créées pour ${data.commune} (${data.department}).`,
        })
      }
    } catch {
      setError('Erreur réseau. Vérifiez votre connexion et réessayez.')
      toast({ title: 'Erreur réseau', variant: 'destructive' })
    } finally {
      setGenerating(false)
    }
  }

  const reset = () => {
    setResult(null)
    setError(null)
    setSelectedDept(null)
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-3 sm:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Pré-charger une commune"
    >
      <div
        className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[#EAE5DC] bg-white px-5 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#2E5C8A]/10">
              <Map className="h-5 w-5 text-[#2E5C8A]" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-[#1A1A1A]" style={SERIF}>
                Pré-charger une ville
              </h3>
              <p className="text-xs text-[#1A1A1A]/60">
                Région de Dakar · {ALL_COMMUNES.length} communes disponibles
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-[#1A1A1A]/50 transition hover:bg-[#EAE5DC] hover:text-[#1A1A1A]"
            aria-label="Fermer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-5 py-5 sm:px-6">
          {/* Breadcrumb-like step indicator */}
          <div className="mb-5 flex items-center gap-2 text-xs">
            <span className={cn('rounded-full px-2.5 py-1 font-medium', selectedDept ? 'bg-[#059669]/12 text-[#059669]' : 'bg-[#1A1A1A]/8 text-[#1A1A1A]/70')}>
              1. Département
            </span>
            <span className="text-[#1A1A1A]/30">›</span>
            <span className={cn('rounded-full px-2.5 py-1 font-medium', selectedDept ? 'bg-[#1A1A1A]/8 text-[#1A1A1A]/70' : 'bg-[#1A1A1A]/5 text-[#1A1A1A]/40')}>
              2. Commune
            </span>
            <span className="text-[#1A1A1A]/30">›</span>
            <span className={cn('rounded-full px-2.5 py-1 font-medium', result || error || generating ? 'bg-[#1A1A1A]/8 text-[#1A1A1A]/70' : 'bg-[#1A1A1A]/5 text-[#1A1A1A]/40')}>
              3. Génération
            </span>
          </div>

          {/* ---------- STEP 1: Departments ---------- */}
          <div className="mb-4">
            <p className="mb-2 text-sm font-medium text-[#1A1A1A]/70">
              Sélectionnez un département :
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
              {DAKAR_REGION.map((dept) => {
                const c = deptColor(dept.name)
                const active = selectedDept === dept.name
                return (
                  <button
                    key={dept.name}
                    onClick={() => {
                      setSelectedDept(dept.name)
                      setResult(null)
                      setError(null)
                    }}
                    className={cn(
                      'flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition',
                      active
                        ? cn('border-transparent ring-2', c.ring, c.bg)
                        : 'border-[#EAE5DC] bg-white hover:border-[#FFD700]/40 hover:bg-[#FAFAF7]',
                    )}
                  >
                    <span className="flex items-center gap-1.5">
                      <span className={cn('h-2 w-2 rounded-full', c.dot)} />
                      <span className={cn('text-sm font-semibold', active ? c.text : 'text-[#1A1A1A]')}>
                        {dept.name}
                      </span>
                    </span>
                    <span className="text-[11px] text-[#1A1A1A]/55">
                      {dept.communes.length} communes
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* ---------- STEP 2: Communes for selected department ---------- */}
          {selectedDept && !result && (
            <div className="mt-5">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-medium text-[#1A1A1A]/70">
                  Communes de <span className="font-semibold text-[#1A1A1A]">{selectedDept}</span> :
                </p>
                <span className="text-xs text-[#1A1A1A]/50">
                  Cliquez sur « Générer les plaques » pour pré-charger tous les quartiers
                </span>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {DAKAR_REGION.find((d) => d.name === selectedDept)?.communes.map((commune) => {
                  const c = deptColor(commune.department)
                  return (
                    <div
                      key={commune.code}
                      className={cn('flex flex-col rounded-xl border border-[#EAE5DC] bg-white p-4 shadow-sm transition hover:border-[#FFD700]/40', generating && 'opacity-60')}
                    >
                      <div className="mb-2 flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className={cn('rounded-md px-2 py-0.5 text-xs font-bold', c.bg, c.text)}>
                            {commune.code}
                          </span>
                          <h4 className="text-sm font-semibold text-[#1A1A1A]">{commune.name}</h4>
                        </div>
                      </div>

                      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-[#1A1A1A]/60">
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {commune.quartiers.length} quartiers
                        </span>
                        <span className="inline-flex items-center gap-1 font-mono">
                          {commune.centerLat.toFixed(4)}, {commune.centerLng.toFixed(4)}
                        </span>
                      </div>

                      {/* Aperçu des quartiers (5 max) */}
                      <div className="mb-3 flex flex-wrap gap-1">
                        {commune.quartiers.slice(0, 5).map((q) => (
                          <span
                            key={q.name}
                            className="rounded bg-[#FAFAF7] px-1.5 py-0.5 text-[10px] text-[#1A1A1A]/60"
                          >
                            {q.name}
                          </span>
                        ))}
                        {commune.quartiers.length > 5 && (
                          <span className="rounded bg-[#FAFAF7] px-1.5 py-0.5 text-[10px] text-[#1A1A1A]/45">
                            +{commune.quartiers.length - 5} autres
                          </span>
                        )}
                      </div>

                      <Button
                        size="sm"
                        onClick={() => handleGenerate(commune)}
                        disabled={generating}
                        className={cn('mt-auto w-full text-white', c.btn)}
                      >
                        {generating ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <Map className="h-4 w-4 mr-2" />
                        )}
                        {generating ? 'Génération…' : 'Générer les plaques'}
                      </Button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* ---------- STEP 3: Generating loader ---------- */}
          {generating && (
            <div className="mt-6 flex flex-col items-center justify-center gap-3 rounded-xl bg-[#FAFAF7] py-10 text-center">
              <Loader2 className="h-8 w-8 animate-spin text-[#FFD700]" />
              <p className="text-sm text-[#1A1A1A]/70">
                Génération des plaques en cours…
              </p>
              <p className="text-xs text-[#1A1A1A]/50">
                Chaque quartier devient une plaque avec GPS pré-rempli.
              </p>
            </div>
          )}

          {/* ---------- STEP 3: Error (typically 409) ---------- */}
          {error && !generating && (
            <div className="mt-6 rounded-xl border border-[#DC2626]/30 bg-[#DC2626]/8 p-5">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[#DC2626]" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-[#DC2626]">Génération impossible</p>
                  <p className="mt-1 text-sm text-[#1A1A1A]/80">{error}</p>
                </div>
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={reset}>
                  Choisir une autre commune
                </Button>
              </div>
            </div>
          )}

          {/* ---------- STEP 4: Success result ---------- */}
          {result && !generating && (
            <div className="mt-6 rounded-xl border border-[#059669]/30 bg-[#059669]/8 p-5">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#059669] text-white">
                  <Check className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <p className="text-base font-bold text-[#059669]">
                    {result.created} plaques créées
                  </p>
                  <p className="mt-0.5 text-sm text-[#1A1A1A]/80">
                    Commune de <span className="font-semibold">{result.commune}</span> · {result.department}
                  </p>
                </div>
              </div>

              {/* Liste des 5 premières plaques */}
              <div className="mt-4">
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[#1A1A1A]/60">
                  Aperçu des plaques générées
                </p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {result.plates.slice(0, 5).map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between rounded-lg border border-[#EAE5DC] bg-white px-3 py-2"
                    >
                      <div className="flex items-center gap-2">
                        <span className="rounded-md bg-[#2E5C8A]/10 px-1.5 py-0.5 font-mono text-[11px] font-bold text-[#2E5C8A]">
                          {p.plateNumber}
                        </span>
                        <span className="truncate text-sm text-[#1A1A1A]/80">{p.label}</span>
                      </div>
                      <MapPin className="h-3.5 w-3.5 shrink-0 text-[#1A1A1A]/30" />
                    </div>
                  ))}
                </div>
                {result.plates.length > 5 && (
                  <p className="mt-2 text-xs text-[#1A1A1A]/50">
                    + {result.plates.length - 5} autres plaques. Visible dans le tableau ci-dessous après fermeture.
                  </p>
                )}
              </div>

              <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button variant="outline" size="sm" onClick={reset}>
                  Pré-charger une autre commune
                </Button>
                <Button
                  size="sm"
                  onClick={onClose}
                  className="bg-[#059669] text-white hover:bg-[#047857]"
                >
                  <Check className="h-4 w-4 mr-2" /> Fermer &amp; actualiser
                </Button>
              </div>
            </div>
          )}

          {/* Footer actions when idle (no result, no error, no generating) */}
          {!result && !error && !generating && !selectedDept && (
            <div className="mt-6 flex flex-col gap-3 rounded-xl bg-[#FAFAF7] p-4 text-xs text-[#1A1A1A]/60">
              <p className="flex items-start gap-2">
                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#FFD700]" />
                <span>
                  Cette fonction crée automatiquement une plaque QR par quartier de la commune choisie,
                  avec des coordonnées GPS pré-remplies (centre approximatif + légère spirale).
                </span>
              </p>
              <p className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#F97316]" />
                <span>
                  Une commune ne peut être pré-chargée qu&apos;une seule fois. Pour régénérer,
                  supprimez d&apos;abord les plaques portant son préfixe (ex : <code className="rounded bg-white px-1 font-mono">DD#001</code>).
                </span>
              </p>
            </div>
          )}

          {/* Bottom close (always visible) */}
          <div className="mt-6 flex justify-end border-t border-[#EAE5DC] pt-4">
            <Button variant="outline" onClick={onClose}>
              Fermer
            </Button>
          </div>
        </div>
      </div>
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
  const [showSeeder, setShowSeeder] = useState(false)

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
        <h2 className="text-xl font-bold text-[#0026A3]" style={SERIF}>
          Plaques QR · {stats.total} au total
        </h2>
        <div className="flex items-center gap-2">
          {cityLogoUrl && <Badge className="bg-[#FFD700]/15 text-[#B8964F]">Logo ✓</Badge>}
          <Button
            size="sm"
            onClick={() => setShowSeeder(true)}
            className="bg-[#2E5C8A] text-white hover:bg-[#1F4A75]"
            title="Générer automatiquement toutes les plaques d'une commune de la région de Dakar"
          >
            <Map className="h-4 w-4 mr-1.5" /> Pré-charger une ville
          </Button>
          <Button size="sm" onClick={() => setShowBatchDialog(true)} className="bg-[#0026A3] text-white hover:bg-[#1E40AF]">
            <Plus className="h-4 w-4 mr-1" /> Générer un lot
          </Button>
        </div>
      </div>

      {/* Stats rapides */}
      <div className="flex flex-wrap gap-2 text-xs">
        {[
          { label: 'Total', value: stats.total, color: 'bg-[#EAE5DC] text-[#1A1A1A]' },
          { label: 'En attente', value: stats.pending, color: 'bg-amber-100 text-amber-800' },
          { label: 'Actives', value: stats.active, color: 'bg-[#059669]/12 text-[#059669]' },
          { label: 'Maintenance', value: stats.maintenance, color: 'bg-[#F97316]/12 text-[#F97316]' },
          { label: 'Hors ligne', value: stats.offline, color: 'bg-[#DC2626]/12 text-[#DC2626]' },
        ].map((s) => (
          <button
            key={s.label}
            onClick={() => setStatusFilter(s.label === 'Total' ? 'all' : s.label.toLowerCase().replace(' ', '_').replace('hors ligne', 'offline').replace('en attente', 'pending'))}
            className={cn('rounded-lg px-3 py-1.5 font-medium transition', s.color, statusFilter === (s.label === 'Total' ? 'all' : s.label.toLowerCase().replace(' ', '_').replace('hors ligne', 'offline').replace('en attente', 'pending')) && 'ring-2 ring-[#FFD700]')}
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
          className="w-full rounded-xl border border-[#EAE5DC] bg-white py-2.5 pl-10 pr-4 text-sm text-[#1A1A1A] placeholder:text-[#1A1A1A]/40 focus:border-[#FFD700] focus:outline-none focus:ring-2 focus:ring-[#FFD700]/20"
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
                    p.status === 'active' ? 'bg-[#059669]/12 text-[#059669]' :
                    p.status === 'pending' ? 'bg-amber-100 text-amber-800' :
                    p.status === 'maintenance' ? 'bg-[#F97316]/12 text-[#F97316]' :
                    'bg-[#DC2626]/12 text-[#DC2626]'
                  )}>
                    {p.status === 'pending' ? 'En attente' : p.status}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-[#1A1A1A]/60">{p.scanCount}</td>
                <td className="px-4 py-3 text-right">
                  <Button size="sm" variant="outline" onClick={() => openEdit(p)} className="border-[#EAE5DC] text-[#1A1A1A] hover:border-[#FFD700]">
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
              className="w-full rounded-xl border border-[#EAE5DC] bg-[#FAFAF7] px-4 py-2.5 text-sm focus:border-[#FFD700] focus:outline-none"
            />
            <p className="mt-2 text-xs text-[#1A1A1A]/50">Maximum 500 par lot. Les numéros continuent à partir du dernier existant.</p>
            <div className="mt-6 flex justify-end gap-3">
              <Button variant="outline" onClick={() => setShowBatchDialog(false)}>Annuler</Button>
              <Button onClick={handleGenerateBatch} disabled={generating} className="bg-[#0026A3] text-white hover:bg-[#1E40AF]">
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
                  className="w-full rounded-xl border border-[#EAE5DC] bg-[#FAFAF7] px-4 py-2.5 text-sm focus:border-[#FFD700] focus:outline-none"
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
                  className="w-full rounded-xl border border-[#EAE5DC] bg-[#FAFAF7] px-4 py-2.5 text-sm focus:border-[#FFD700] focus:outline-none"
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
                  className="w-full rounded-xl border border-[#EAE5DC] bg-[#FAFAF7] px-4 py-2.5 text-sm focus:border-[#FFD700] focus:outline-none"
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
                    className="flex-1 rounded-xl border border-[#EAE5DC] bg-[#FAFAF7] px-3 py-2.5 text-sm focus:border-[#FFD700] focus:outline-none"
                  />
                  <input
                    type="text"
                    value={editLng}
                    onChange={(e) => setEditLng(e.target.value)}
                    placeholder="Longitude"
                    className="flex-1 rounded-xl border border-[#EAE5DC] bg-[#FAFAF7] px-3 py-2.5 text-sm focus:border-[#FFD700] focus:outline-none"
                  />
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleLocate}
                  disabled={locating}
                  className="mt-2 border-[#FFD700]/40 text-[#1A1A1A] hover:bg-[#FFD700]/8"
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
              <Button onClick={handleSavePlate} disabled={savingPlate} className="bg-[#059669] text-white hover:bg-[#047857]">
                {savingPlate ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Check className="h-4 w-4 mr-2" />}
                {savingPlate ? 'Sauvegarde…' : 'Sauvegarder & activer'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Pré-charger une ville (modal commune → seed plates) */}
      {showSeeder && (
        <CommuneSeederModal
          onClose={async () => {
            setShowSeeder(false)
            // Réactualise la liste des plaques côté parent.
            try {
              await onRefresh()
            } catch {
              /* ignore — toast already handled upstream */
            }
          }}
        />
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
      return { label: 'En attente', bg: 'bg-[#F97316]/12 text-[#F97316]', color: COLOR_ORANGE }
    case 'assigned':
      return { label: 'Assigné', bg: 'bg-[#0026A3]/12 text-[#0026A3]', color: COLOR_BLUE }
    case 'in_progress':
      return { label: 'En cours', bg: 'bg-[#0026A3]/12 text-[#0026A3]', color: COLOR_BLUE }
    case 'resolved':
      return { label: 'Résolu', bg: 'bg-[#059669]/12 text-[#059669]', color: COLOR_GREEN }
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
// PhotoLightbox — visionneuse plein écran (photo Avant/Après, menu, etc.)
// ---------------------------------------------------------------
// Usage : <PhotoLightbox src={dataUrl} caption="Avant" onClose={() => setShow(null)} />
// Clique en dehors de l'image ou sur le bouton X ferme la lightbox.
// ---------------------------------------------------------------

function PhotoLightbox({
  src,
  caption,
  onClose,
}: {
  src: string
  caption?: string
  onClose: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    // Verrouille le scroll arrière-plan pendant l'affichage
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={caption ?? 'Aperçu photo'}
    >
      <div
        className="relative w-full max-w-3xl rounded-2xl bg-white p-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#FAFAF7] text-[#1A1A1A] transition hover:bg-[#EAE5DC]"
          aria-label="Fermer l'aperçu"
        >
          <X className="h-4 w-4" />
        </button>
        {caption && (
          <p className="mb-2 text-center text-sm font-bold text-[#1A1A1A]" style={{ fontFamily: 'Georgia, "Playfair Display", serif' }}>
            {caption}
          </p>
        )}
        <div className="flex justify-center">
          <img
            src={src}
            alt={caption ?? 'Photo agrandie'}
            className="max-h-[75vh] w-auto rounded-xl object-contain shadow-md"
          />
        </div>
      </div>
    </div>
  )
}

/** Petit thumbnail photo cliquable — utilise PhotoLightbox pour l'agrandir. */
function PhotoThumb({
  src,
  label,
  size = 64,
}: {
  src: string
  label: string
  size?: number
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group relative overflow-hidden rounded-lg border border-[#EAE5DC] bg-white transition hover:border-[#FFD700] hover:shadow-md"
        style={{ width: size, height: size }}
        aria-label={`Agrandir la photo ${label}`}
        title={`Cliquez pour agrandir — ${label}`}
      >
        <img
          src={src}
          alt={label}
          className="h-full w-full object-cover"
          loading="lazy"
        />
        <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-1 py-0.5 text-center text-[9px] font-bold uppercase tracking-wide text-white">
          {label}
        </span>
      </button>
      {open && (
        <PhotoLightbox src={src} caption={label} onClose={() => setOpen(false)} />
      )}
    </>
  )
}

// ---------------------------------------------------------------
// IncidentCard — carte partagée (urgences + signalements)
// ---------------------------------------------------------------
// Props :
//   - inc        : l'incident à afficher
//   - accent     : couleur de bordure haute (rouge pour urgence, orange pour
//                  signalement, etc.)
//   - onUpdateStatus? : callback optionnel pour changer le statut. Si fourni,
//                  des boutons d'action apparaissent selon le statut courant :
//                     pending     → « Pris en charge » (in_progress)
//                     in_progress → « Résolu » (resolved)
//                     assigned    → « Résolu » (resolved)
//                     resolved    → badge vert « Résolu » (pas de bouton)
// ---------------------------------------------------------------

type IncidentCardProps = {
  inc: CityIncident
  accent: string
  onUpdateStatus?: (id: string, newStatus: 'in_progress' | 'resolved') => void
}

function IncidentCard({ inc, accent, onUpdateStatus }: IncidentCardProps) {
  const { toast } = useToast()
  const [pending, setPending] = useState(false)
  const status = incidentStatusInfo(inc.status)
  const service = serviceInfo(inc.assignedTo)
  const plateLabel = inc.plate
    ? `${inc.plate.plateNumber}${inc.plate.district ? ` · ${inc.plate.district}` : ''}`
    : 'GPS citoyen'

  const handleChange = (newStatus: 'in_progress' | 'resolved') => {
    if (pending) return
    setPending(true)
    try {
      if (onUpdateStatus) {
        onUpdateStatus(inc.id, newStatus)
      } else {
        // Sans callback parent : on appelle directement l'API
        fetch(`/api/city/incidents/${inc.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: newStatus }),
        })
          .then((r) => r.json())
          .then((json) => {
            if (json?.ok) {
              toast({
                title:
                  newStatus === 'resolved'
                    ? 'Incident résolu'
                    : 'Incident pris en charge',
              })
            } else {
              toast({
                title: 'Erreur',
                description: json?.error ?? 'Mise à jour impossible',
                variant: 'destructive',
              })
            }
          })
          .catch(() =>
            toast({ title: 'Erreur réseau', variant: 'destructive' }),
          )
      }
    } finally {
      // Petit délai pour laisser l'UI réagir (optimistic update du parent)
      setTimeout(() => setPending(false), 400)
    }
  }

  return (
    <article
      className="overflow-hidden rounded-2xl border border-[#EAE5DC] bg-white shadow-sm transition-shadow hover:shadow-md"
      style={{ borderLeft: `4px solid ${accent}` }}
    >
      <div className="p-4">
        <div className="mb-3 flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="text-2xl leading-none" aria-hidden>
              {incidentEmoji(inc.type, inc.category)}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-[#0026A3]">
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

        {/* ---- SLA : prise en charge + photos avant/après + temps résolution ----
            Les photos sont publiques (transparence) : visibles staff + citoyens. */}
        {(inc.arrivedAt || inc.beforePhoto || inc.afterPhoto) && (
          <div className="mt-3 space-y-2 border-t border-[#EAE5DC] pt-3">
            {/* Badge "Pris en charge le …" */}
            {inc.arrivedAt && (
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="gap-1 bg-[#0026A3]/12 text-[10px] text-[#0026A3]">
                  <Clock className="h-3 w-3" />
                  Pris en charge le {formatDateTime(inc.arrivedAt)}
                </Badge>
                {inc.resolvedAt && (() => {
                  const mins = resolutionMinutes(inc.arrivedAt!, inc.resolvedAt)
                  if (mins == null) return null
                  return (
                    <Badge className="gap-1 bg-[#059669]/12 text-[10px] text-[#059669]">
                      <Check className="h-3 w-3" />
                      Résolu en {formatDurationLabel(mins)}
                    </Badge>
                  )
                })()}
              </div>
            )}

            {/* Photos Avant / Après côte à côte */}
            {(inc.beforePhoto || inc.afterPhoto) && (
              <div className="flex flex-wrap items-end gap-3">
                {inc.beforePhoto && (
                  <div className="flex flex-col gap-1">
                    <PhotoThumb src={inc.beforePhoto} label="Avant" size={72} />
                  </div>
                )}
                {inc.afterPhoto && (
                  <div className="flex flex-col gap-1">
                    <PhotoThumb src={inc.afterPhoto} label="Après" size={72} />
                  </div>
                )}
                {(inc.beforePhoto && inc.afterPhoto) && (
                  <span className="self-center text-[10px] font-medium uppercase tracking-wide text-[#1A1A1A]/45">
                    Avant / Après
                  </span>
                )}
                <p className="ml-auto self-center text-[10px] text-[#1A1A1A]/45">
                  Photos publiques — transparence citoyenne
                </p>
              </div>
            )}
          </div>
        )}

        {/* ---- Boutons d'action selon le statut ---- */}
        {onUpdateStatus && inc.status !== 'resolved' && (
          <div className="mt-3 flex items-center gap-2 border-t border-[#EAE5DC] pt-3">
            {(inc.status === 'pending') && (
              <Button
                size="sm"
                onClick={() => handleChange('in_progress')}
                disabled={pending}
                className="gap-1.5 rounded-lg bg-[#0026A3] text-white hover:bg-[#1E40AF]"
              >
                {pending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Check className="h-3.5 w-3.5" />
                )}
                Pris en charge
              </Button>
            )}
            {(inc.status === 'in_progress' || inc.status === 'assigned') && (
              <Button
                size="sm"
                onClick={() => handleChange('resolved')}
                disabled={pending}
                className="gap-1.5 rounded-lg bg-[#059669] text-white hover:bg-[#047857]"
              >
                {pending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Check className="h-3.5 w-3.5" />
                )}
                Résolu
              </Button>
            )}
            <span className="ml-auto text-[10px] text-[#1A1A1A]/40">
              ID {inc.id.slice(-6)}
            </span>
          </div>
        )}

        {/* Badge "Résolu" vert si déjà résolu */}
        {onUpdateStatus && inc.status === 'resolved' && (
          <div className="mt-3 flex items-center justify-between border-t border-[#EAE5DC] pt-3">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#059669]/12 px-3 py-1 text-[11px] font-bold text-[#059669]">
              <Check className="h-3.5 w-3.5" />
              Résolu
              {inc.resolvedAt && (
                <span className="font-normal text-[#059669]/70">
                  · {timeAgo(inc.resolvedAt)}
                </span>
              )}
            </span>
            {inc.staffName && (
              <span className="text-[10px] text-[#1A1A1A]/50">
                Par {inc.staffName}
              </span>
            )}
          </div>
        )}
      </div>
    </article>
  )
}

// ---------------------------------------------------------------
// EmergenciesView — Urgences citoyennes filtrables
// ---------------------------------------------------------------

function EmergenciesView({
  incidents,
  onUpdateStatus,
}: {
  incidents: CityIncident[]
  onUpdateStatus?: (id: string, newStatus: 'in_progress' | 'resolved') => void
}) {
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
          <h2 className="text-xl font-bold text-[#0026A3]" style={SERIF}>
            Urgences citoyennes
          </h2>
          <p className="text-xs text-[#1A1A1A]/55">
            {counts.pending} en attente · {counts.assigned} assignées · {counts.resolved} résolues
          </p>
        </div>
        <Badge className="bg-[#DC2626]/12 text-[#DC2626]">
          <AlertTriangle className="mr-1 h-3 w-3" /> {emergencies.length} total
        </Badge>
      </div>

      {/* Filtres statut */}
      <div className="flex flex-wrap gap-2 text-xs">
        {[
          { key: 'all', label: 'Tous', value: counts.all, color: 'bg-[#EAE5DC] text-[#1A1A1A]' },
          { key: 'pending', label: 'En attente', value: counts.pending, color: 'bg-[#F97316]/12 text-[#F97316]' },
          { key: 'assigned', label: 'Assignées', value: counts.assigned, color: 'bg-[#0026A3]/12 text-[#0026A3]' },
          { key: 'resolved', label: 'Résolues', value: counts.resolved, color: 'bg-[#059669]/12 text-[#059669]' },
        ].map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => setStatusFilter(s.key)}
            className={cn(
              'rounded-lg px-3 py-1.5 font-medium transition',
              s.color,
              statusFilter === s.key && 'ring-2 ring-[#FFD700]',
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
          className="w-full rounded-xl border border-[#EAE5DC] bg-white py-2.5 pl-10 pr-4 text-sm text-[#1A1A1A] placeholder:text-[#1A1A1A]/40 focus:border-[#FFD700] focus:outline-none focus:ring-2 focus:ring-[#FFD700]/20"
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
            <IncidentCard
              key={inc.id}
              inc={inc}
              accent={COLOR_RED}
              onUpdateStatus={onUpdateStatus}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------
// ReportsView — Signalements groupés par statut
// ---------------------------------------------------------------

function ReportsView({
  incidents,
  onUpdateStatus,
}: {
  incidents: CityIncident[]
  onUpdateStatus?: (id: string, newStatus: 'in_progress' | 'resolved') => void
}) {
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
          <h2 className="text-xl font-bold text-[#0026A3]" style={SERIF}>
            Signalements citoyens
          </h2>
          <p className="text-xs text-[#1A1A1A]/55">
            {reports.length} signalements au total
          </p>
        </div>
        <Badge className="bg-[#F97316]/12 text-[#F97316]">
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
          className="w-full rounded-xl border border-[#EAE5DC] bg-white py-2.5 pl-10 pr-4 text-sm text-[#1A1A1A] placeholder:text-[#1A1A1A]/40 focus:border-[#FFD700] focus:outline-none focus:ring-2 focus:ring-[#FFD700]/20"
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
          <ReportGroup
            title="En attente"
            icon="⏳"
            color={COLOR_ORANGE}
            items={groups.pending}
            onUpdateStatus={onUpdateStatus}
          />
          <ReportGroup
            title="En cours"
            icon="🔄"
            color={COLOR_BLUE}
            items={groups.inProgress}
            onUpdateStatus={onUpdateStatus}
          />
          <ReportGroup
            title="Résolus"
            icon="✓"
            color={COLOR_GREEN}
            items={groups.resolved}
            onUpdateStatus={onUpdateStatus}
          />
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
  onUpdateStatus,
}: {
  title: string
  icon: string
  color: string
  items: CityIncident[]
  onUpdateStatus?: (id: string, newStatus: 'in_progress' | 'resolved') => void
}) {
  if (items.length === 0) return null
  return (
    <section className="overflow-hidden rounded-2xl border border-[#EAE5DC] bg-white shadow-sm">
      <div
        className="flex items-center justify-between border-b border-[#EAE5DC] border-l-4 border-l-[#FFD700] bg-[#0026A3]/5 px-4 py-3"
        style={{ borderLeft: `4px solid ${color}` }}
      >
        <div className="flex items-center gap-2">
          <span className="text-lg" aria-hidden>
            {icon}
          </span>
          <h3
            className="text-sm font-bold text-[#0026A3]"
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
          <IncidentCard
            key={inc.id}
            inc={inc}
            accent={color}
            onUpdateStatus={onUpdateStatus}
          />
        ))}
      </div>
    </section>
  )
}

// ---------------------------------------------------------------
// HistoryView — Historique des signalements avec filtres temporels
// ---------------------------------------------------------------
// Filtres : Aujourd'hui / Cette semaine (7j) / Ce mois (30j) / Tout
// Export CSV + PDF (impression navigateur) · Stats synthétiques en haut
// Tableau trié par date (plus récent en premier) + zebra striping.
// ---------------------------------------------------------------

type HistoryPeriod = 'today' | 'week' | 'month' | 'all'

const HISTORY_PERIODS: readonly {
  id: HistoryPeriod
  label: string
  days: number | null // null = pas de limite (Tout)
}[] = [
  { id: 'today', label: "Aujourd'hui", days: 0 },
  { id: 'week', label: 'Cette semaine', days: 7 },
  { id: 'month', label: 'Ce mois', days: 30 },
  { id: 'all', label: 'Tout', days: null },
]

function HistoryView({ incidents }: { incidents: CityIncident[] }) {
  const [period, setPeriod] = useState<HistoryPeriod>('today')

  const periodLabel = useMemo(() => {
    return HISTORY_PERIODS.find((x) => x.id === period)?.label ?? 'Tout'
  }, [period])

  // --- Filtre temporel + tri (plus récent en premier) ---
  const filtered = useMemo(() => {
    const now = Date.now()
    const cfg = HISTORY_PERIODS.find((x) => x.id === period)
    const days = cfg?.days ?? null
    let cutoff = 0
    if (period === 'today') {
      // Début de journée locale (00:00:00)
      const start = new Date()
      start.setHours(0, 0, 0, 0)
      cutoff = start.getTime()
    } else if (days != null) {
      cutoff = now - days * 24 * 60 * 60 * 1000
    }
    return incidents
      .filter((inc) => {
        const t = new Date(inc.createdAt).getTime()
        if (isNaN(t)) return false
        if (days == null) return true // Tout
        return t >= cutoff
      })
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )
  }, [incidents, period])

  // --- Comptes par période (badges sur les chips de filtre) ---
  const counts = useMemo(() => {
    const now = Date.now()
    const startToday = new Date()
    startToday.setHours(0, 0, 0, 0)
    const todayCutoff = startToday.getTime()
    const weekCutoff = now - 7 * 24 * 60 * 60 * 1000
    const monthCutoff = now - 30 * 24 * 60 * 60 * 1000
    return {
      today: incidents.filter(
        (i) => new Date(i.createdAt).getTime() >= todayCutoff,
      ).length,
      week: incidents.filter(
        (i) => new Date(i.createdAt).getTime() >= weekCutoff,
      ).length,
      month: incidents.filter(
        (i) => new Date(i.createdAt).getTime() >= monthCutoff,
      ).length,
      all: incidents.length,
    }
  }, [incidents])

  // --- Stats synthétiques sur la période filtrée ---
  const stats = useMemo(() => {
    const total = filtered.length
    const resolved = filtered.filter((i) => i.status === 'resolved').length
    const pending = filtered.filter(
      (i) =>
        i.status === 'pending' ||
        i.status === 'assigned' ||
        i.status === 'in_progress',
    ).length
    // Temps moyen de résolution (min) — basé sur arrivedAt → resolvedAt
    const durations: number[] = []
    filtered.forEach((inc) => {
      if (inc.arrivedAt && inc.resolvedAt) {
        const m = resolutionMinutes(inc.arrivedAt, inc.resolvedAt)
        if (m != null) durations.push(m)
      }
    })
    const avg =
      durations.length > 0
        ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
        : null
    return { total, resolved, pending, avg }
  }, [filtered])

  // --- Export CSV (UTF-8 BOM pour Excel) ---
  const exportCSV = useCallback(() => {
    if (filtered.length === 0) return
    const rows: string[][] = [
      [
        'Date',
        'Heure',
        'Type',
        'Catégorie',
        'Description',
        'Statut',
        'Service',
        'Plaque',
        'Quartier',
      ],
    ]
    filtered.forEach((inc) => {
      const d = new Date(inc.createdAt)
      rows.push([
        d.toLocaleDateString('fr-FR'),
        d.toLocaleTimeString('fr-FR'),
        incidentTypeLabel(inc.type),
        inc.category ?? '',
        (inc.description ?? '').replace(/"/g, "'").substring(0, 100),
        incidentStatusInfo(inc.status).label,
        inc.assignedTo ?? '',
        inc.plate?.plateNumber ?? '',
        inc.plate?.district ?? '',
      ])
    })
    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(',')).join('\n')
    const blob = new Blob(['\ufeff' + csv], {
      type: 'text/csv;charset=utf-8;',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `historique-${period}-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [filtered, period])

  // --- Export PDF (impression navigateur — fenêtre dédiée) ---
  const exportPDF = useCallback(() => {
    if (filtered.length === 0) return
    const win = window.open('', '_blank')
    if (!win) return
    const rowsHtml = filtered
      .map((inc) => {
        const d = new Date(inc.createdAt)
        return (
          `<tr><td>${d.toLocaleDateString('fr-FR')}</td>` +
          `<td>${d.toLocaleTimeString('fr-FR')}</td>` +
          `<td>${incidentTypeLabel(inc.type)}</td>` +
          `<td>${inc.category ?? ''}</td>` +
          `<td>${(inc.description ?? '').substring(0, 80)}</td>` +
          `<td>${inc.status}</td>` +
          `<td>${inc.assignedTo ?? ''}</td>` +
          `<td>${inc.plate?.plateNumber ?? ''}</td></tr>`
        )
      })
      .join('')
    win.document.write(
      `<html><head><title>Historique des signalements</title>` +
        `<style>body{font-family:Arial;padding:20px} table{width:100%;border-collapse:collapse} ` +
        `th,td{border:1px solid #ddd;padding:8px;text-align:left} th{background:#0026A3;color:white} ` +
        `.header{background:#0026A3;color:white;padding:15px;border-radius:8px;margin-bottom:20px} ` +
        `h1{margin:0}</style></head><body>` +
        `<div class="header"><h1>Historique des signalements</h1>` +
        `<p>Période: ${periodLabel} | ${filtered.length} incidents | ${new Date().toLocaleString('fr-FR')}</p></div>` +
        `<table><thead><tr><th>Date</th><th>Heure</th><th>Type</th><th>Catégorie</th>` +
        `<th>Description</th><th>Statut</th><th>Service</th><th>Plaque</th></tr></thead>` +
        `<tbody>${rowsHtml}</tbody></table></body></html>`,
    )
    win.document.close()
    win.focus()
    win.print()
  }, [filtered, periodLabel])

  const SERIF = { fontFamily: 'Georgia, "Playfair Display", serif' } as const

  return (
    <div className="space-y-5">
      {/* ---------- Titre + actions export ---------- */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-[#0026A3]" style={SERIF}>
            Historique des signalements
          </h2>
          <p className="text-xs text-[#1A1A1A]/55">
            Filtrage par période · export CSV / PDF · {incidents.length} incidents au total
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={exportCSV}
            disabled={filtered.length === 0}
            className="gap-1.5 rounded-lg border-[#EAE5DC] text-[#0026A3] hover:bg-[#0026A3]/5"
          >
            <Download className="h-4 w-4" />
            Exporter CSV
          </Button>
          <Button
            size="sm"
            onClick={exportPDF}
            disabled={filtered.length === 0}
            className="gap-1.5 rounded-lg bg-[#0026A3] text-white hover:bg-[#1E40AF]"
          >
            <FileBarChart className="h-4 w-4" />
            Exporter PDF
          </Button>
        </div>
      </div>

      {/* ---------- Chips de filtre temporel ---------- */}
      <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Filtrage par période">
        {HISTORY_PERIODS.map((p) => {
          const active = p.id === period
          const count = counts[p.id]
          return (
            <button
              key={p.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setPeriod(p.id)}
              className={cn(
                'inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium transition',
                active
                  ? 'bg-[#0026A3] text-white shadow-sm'
                  : 'border border-[#EAE5DC] bg-white text-[#1A1A1A]/70 hover:border-[#0026A3]/40 hover:text-[#0026A3]',
              )}
            >
              {p.label}
              <span
                className={cn(
                  'rounded-full px-1.5 py-0.5 text-[10px] font-bold',
                  active
                    ? 'bg-white/20 text-white'
                    : 'bg-[#0026A3]/10 text-[#0026A3]',
                )}
              >
                {count}
              </span>
            </button>
          )
        })}
      </div>

      {/* ---------- Stats synthétiques ---------- */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-[#EAE5DC] bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 text-[#0026A3]">
            <Bell className="h-4 w-4" />
            <span className="text-[10px] font-semibold uppercase tracking-wide">
              Total période
            </span>
          </div>
          <p className="mt-1 text-2xl font-bold text-[#1A1A1A]" style={SERIF}>
            {stats.total}
          </p>
        </div>
        <div className="rounded-2xl border border-[#EAE5DC] bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 text-[#059669]">
            <Check className="h-4 w-4" />
            <span className="text-[10px] font-semibold uppercase tracking-wide">
              Résolus
            </span>
          </div>
          <p className="mt-1 text-2xl font-bold text-[#059669]" style={SERIF}>
            {stats.resolved}
          </p>
        </div>
        <div className="rounded-2xl border border-[#EAE5DC] bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 text-[#F97316]">
            <Clock className="h-4 w-4" />
            <span className="text-[10px] font-semibold uppercase tracking-wide">
              En attente / cours
            </span>
          </div>
          <p className="mt-1 text-2xl font-bold text-[#F97316]" style={SERIF}>
            {stats.pending}
          </p>
        </div>
        <div className="rounded-2xl border border-[#EAE5DC] bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 text-[#0026A3]">
            <Clock className="h-4 w-4" />
            <span className="text-[10px] font-semibold uppercase tracking-wide">
              Temps moyen résolution
            </span>
          </div>
          <p className="mt-1 text-2xl font-bold text-[#1A1A1A]" style={SERIF}>
            {stats.avg != null ? formatDurationLabel(stats.avg) : '—'}
          </p>
        </div>
      </div>

      {/* ---------- Tableau des incidents ---------- */}
      <section className="overflow-hidden rounded-2xl border border-[#EAE5DC] bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-[#EAE5DC] bg-[#0026A3]/5 px-4 py-3">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-[#0026A3]" />
            <h3 className="text-sm font-bold text-[#0026A3]" style={SERIF}>
              {filtered.length} incident{filtered.length > 1 ? 's' : ''} — {periodLabel}
            </h3>
          </div>
          <span className="text-[10px] text-[#1A1A1A]/45">
            Tri : plus récent en premier
          </span>
        </div>

        {filtered.length === 0 ? (
          <div className="p-12 text-center">
            <Calendar className="mx-auto mb-3 h-8 w-8 text-[#1A1A1A]/20" />
            <p className="text-sm font-medium text-[#1A1A1A]/60">
              Aucun incident sur cette période
            </p>
            <p className="mt-1 text-xs text-[#1A1A1A]/40">
              Changez la période pour élargir la recherche.
            </p>
          </div>
        ) : (
          <div className="max-h-[60vh] overflow-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="sticky top-0 z-10 bg-[#0026A3] text-white">
                <tr>
                  <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide">
                    Date / Heure
                  </th>
                  <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide">
                    Type
                  </th>
                  <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide">
                    Catégorie
                  </th>
                  <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide">
                    Description
                  </th>
                  <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide">
                    Statut
                  </th>
                  <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide">
                    Service
                  </th>
                  <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide">
                    Plaque
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((inc, idx) => {
                  const status = incidentStatusInfo(inc.status)
                  const service = serviceInfo(inc.assignedTo)
                  const d = new Date(inc.createdAt)
                  return (
                    <tr
                      key={inc.id}
                      className={cn(
                        'border-b border-[#EAE5DC]/70',
                        idx % 2 === 1 ? 'bg-[#FAFAF7]' : 'bg-white',
                      )}
                    >
                      <td className="whitespace-nowrap px-3 py-2.5 text-xs text-[#1A1A1A]/80">
                        {d.toLocaleDateString('fr-FR')}
                        <span className="ml-1 text-[#1A1A1A]/45">
                          {d.toLocaleTimeString('fr-FR', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#1A1A1A]">
                          <span aria-hidden>
                            {incidentEmoji(inc.type, inc.category)}
                          </span>
                          {incidentTypeLabel(inc.type)}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-[#1A1A1A]/80">
                        {inc.category ?? '—'}
                      </td>
                      <td className="max-w-xs px-3 py-2.5 text-xs text-[#1A1A1A]/70">
                        <span className="line-clamp-2">
                          {inc.description ?? '—'}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <Badge
                          className={cn(
                            'text-[10px] font-semibold',
                            status.bg,
                          )}
                        >
                          {status.label}
                        </Badge>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-[#1A1A1A]/80">
                        <span className="inline-flex items-center gap-1">
                          <span aria-hidden>{service.emoji}</span>
                          {service.label}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-xs text-[#1A1A1A]/80">
                        {inc.plate?.plateNumber ?? 'GPS citoyen'}
                        {inc.plate?.district && (
                          <span className="ml-1 text-[#1A1A1A]/45">
                            · {inc.plate.district}
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

// ---------------------------------------------------------------
// ArtisansView — Table des artisans vérifiés + bouton "Ajouter"
// ---------------------------------------------------------------

function ArtisansView({
  artisans,
  onRefresh,
}: {
  artisans: CityArtisan[]
  onRefresh?: () => Promise<void>
}) {
  const { toast } = useToast()
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'verified' | 'premium'>('all')

  // --- Formulaire d'ajout d'artisan ---
  const [showForm, setShowForm] = useState(false)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({
    name: '',
    trade: '',
    phone: '',
    district: '',
    lat: '',
    lng: '',
    verified: false,
    premium: false,
  })

  // --- Artisans ajoutés localement (en attente de validation) ---
  // Comme l'API renvoie seulement les artisans verified=true, on garde
  // localement ceux que le directeur vient d'ajouter pour qu'ils restent
  // visibles à l'écran après l'optimistic add.
  const [localAdded, setLocalAdded] = useState<CityArtisan[]>([])

  // Combine les artisans serveur + ajoutés localement
  const allArtisans = useMemo(
    () => [...localAdded, ...artisans],
    [artisans, localAdded],
  )

  const filtered = useMemo(() => {
    return allArtisans.filter((a) => {
      if (filter === 'verified' && !a.verified) return false
      if (filter === 'premium' && !a.premium) return false
      if (search.trim()) {
        const q = search.trim().toLowerCase()
        const hay = `${a.name} ${a.trade} ${a.district ?? ''} ${a.phone}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [allArtisans, search, filter])

  const stats = useMemo(
    () => ({
      total: allArtisans.length,
      verified: allArtisans.filter((a) => a.verified).length,
      premium: allArtisans.filter((a) => a.premium).length,
      contacts: allArtisans.reduce((s, a) => s + a.contactCount, 0),
    }),
    [allArtisans],
  )

  const SERIF = { fontFamily: 'Georgia, "Playfair Display", serif' } as const

  // --- Soumission du formulaire ---
  const handleSubmit = async () => {
    if (form.name.trim().length < 2) {
      toast({ title: 'Nom requis', description: 'Minimum 2 caractères.', variant: 'destructive' })
      return
    }
    if (form.trade.trim().length < 2) {
      toast({ title: 'Métier requis', description: 'Minimum 2 caractères.', variant: 'destructive' })
      return
    }
    const phoneClean = form.phone.replace(/[\s.-]/g, '')
    if (!/^\+?\d{8,15}$/.test(phoneClean)) {
      toast({
        title: 'Téléphone invalide',
        description: 'Format attendu : +221 77 000 00 00',
        variant: 'destructive',
      })
      return
    }

    setCreating(true)
    try {
      const body: Record<string, unknown> = {
        name: form.name.trim(),
        trade: form.trade.trim(),
        phone: phoneClean,
        district: form.district.trim() || undefined,
      }
      if (form.lat && form.lng) {
        const la = parseFloat(form.lat)
        const ln = parseFloat(form.lng)
        if (!isNaN(la) && !isNaN(ln)) {
          body.lat = la
          body.lng = ln
        }
      }
      // Les champs verified / premium sont envoyés (l'API peut les ignorer,
      // on gère l'affichage localement via localAdded)
      body.verified = form.verified
      body.premium = form.premium

      const res = await fetch('/api/city/artisans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (json?.ok) {
        const created = json.data?.artisan
        // Si l'API renvoie l'artisan, on l'ajoute localement avec les
        // flags verified/premium que l'admin a choisis (l'API les force à
        // false, mais le directeur a la main dans ce back-office).
        if (created) {
          const displayArtisan: CityArtisan = {
            id: created.id,
            name: created.name,
            trade: created.trade,
            phone: created.phone,
            district: created.district,
            address: created.address,
            lat: created.lat,
            lng: created.lng,
            verified: form.verified, // Surcharge avec le choix admin
            premium: form.premium,
            rating: created.rating ?? 5,
            reviewCount: created.reviewCount ?? 0,
            contactCount: created.contactCount ?? 0,
            active: created.active ?? true,
          }
          setLocalAdded((prev) => [displayArtisan, ...prev])
        }
        toast({
          title: 'Artisan ajouté',
          description: `${form.name.trim()} (${form.trade.trim()}) a été enregistré.`,
        })
        // Reset form
        setForm({
          name: '',
          trade: '',
          phone: '',
          district: '',
          lat: '',
          lng: '',
          verified: false,
          premium: false,
        })
        setShowForm(false)
        // Recharge aussi côté serveur (les artisans verified restent visibles)
        if (onRefresh) await onRefresh()
      } else {
        toast({
          title: 'Erreur',
          description: json?.error ?? 'Ajout impossible',
          variant: 'destructive',
        })
      }
    } catch {
      toast({ title: 'Erreur réseau', variant: 'destructive' })
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-[#0026A3]" style={SERIF}>
            Artisans vérifiés
          </h2>
          <p className="text-xs text-[#1A1A1A]/55">
            {stats.verified} vérifiés · {stats.premium} premium · {stats.contacts} contacts cumulés
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge className="bg-[#059669]/12 text-[#059669]">
            <Wrench className="mr-1 h-3 w-3" /> {allArtisans.length} artisans
          </Badge>
          <Button
            size="sm"
            onClick={() => setShowForm((v) => !v)}
            className="gap-1.5 rounded-lg bg-[#059669] text-white hover:bg-[#047857]"
          >
            {showForm ? (
              <>
                <X className="h-4 w-4" /> Annuler
              </>
            ) : (
              <>
                <Plus className="h-4 w-4" /> Ajouter un artisan
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Formulaire d'ajout */}
      {showForm && (
        <div className="rounded-2xl border-2 border-[#059669]/20 bg-white p-5 shadow-sm">
          <h3 className="mb-4 text-sm font-bold text-[#0026A3]">
            Ajouter un artisan
          </h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {/* Nom */}
            <div>
              <label className="text-xs font-semibold text-[#1A1A1A]/60">Nom complet *</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Ex : Mamadou Sow"
                maxLength={80}
                className="mt-1 w-full rounded-xl border border-[#EAE5DC] bg-[#FAFAF7] px-3 py-2 text-sm focus:border-[#059669] focus:outline-none focus:ring-2 focus:ring-[#059669]/15"
              />
            </div>
            {/* Métier */}
            <div>
              <label className="text-xs font-semibold text-[#1A1A1A]/60">Métier *</label>
              <input
                type="text"
                value={form.trade}
                onChange={(e) => setForm((f) => ({ ...f, trade: e.target.value }))}
                placeholder="Ex : Plombier"
                maxLength={60}
                className="mt-1 w-full rounded-xl border border-[#EAE5DC] bg-[#FAFAF7] px-3 py-2 text-sm focus:border-[#059669] focus:outline-none focus:ring-2 focus:ring-[#059669]/15"
              />
            </div>
            {/* Téléphone */}
            <div>
              <label className="text-xs font-semibold text-[#1A1A1A]/60">Téléphone *</label>
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                placeholder="+221 77 000 00 00"
                className="mt-1 w-full rounded-xl border border-[#EAE5DC] bg-[#FAFAF7] px-3 py-2 text-sm focus:border-[#059669] focus:outline-none focus:ring-2 focus:ring-[#059669]/15"
              />
            </div>
            {/* Quartier */}
            <div>
              <label className="text-xs font-semibold text-[#1A1A1A]/60">Quartier</label>
              <input
                type="text"
                value={form.district}
                onChange={(e) => setForm((f) => ({ ...f, district: e.target.value }))}
                placeholder="Ex : Plateau"
                maxLength={60}
                className="mt-1 w-full rounded-xl border border-[#EAE5DC] bg-[#FAFAF7] px-3 py-2 text-sm focus:border-[#059669] focus:outline-none focus:ring-2 focus:ring-[#059669]/15"
              />
            </div>
            {/* GPS */}
            <div className="sm:col-span-2">
              <label className="text-xs font-semibold text-[#1A1A1A]/60">
                Coordonnées GPS (optionnel)
              </label>
              <div className="mt-1 flex gap-2">
                <input
                  type="text"
                  value={form.lat}
                  onChange={(e) => setForm((f) => ({ ...f, lat: e.target.value }))}
                  placeholder="Latitude (14.69)"
                  className="flex-1 rounded-xl border border-[#EAE5DC] bg-[#FAFAF7] px-3 py-2 text-sm focus:border-[#059669] focus:outline-none focus:ring-2 focus:ring-[#059669]/15"
                />
                <input
                  type="text"
                  value={form.lng}
                  onChange={(e) => setForm((f) => ({ ...f, lng: e.target.value }))}
                  placeholder="Longitude (-17.44)"
                  className="flex-1 rounded-xl border border-[#EAE5DC] bg-[#FAFAF7] px-3 py-2 text-sm focus:border-[#059669] focus:outline-none focus:ring-2 focus:ring-[#059669]/15"
                />
              </div>
            </div>
            {/* Checkboxes */}
            <div className="flex flex-wrap items-center gap-4 sm:col-span-2">
              <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-[#1A1A1A]">
                <input
                  type="checkbox"
                  checked={form.verified}
                  onChange={(e) => setForm((f) => ({ ...f, verified: e.target.checked }))}
                  className="h-4 w-4 rounded border-[#EAE5DC] accent-[#0026A3]"
                />
                <Check className="h-3.5 w-3.5 text-[#0026A3]" />
                Vérifié
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-[#1A1A1A]">
                <input
                  type="checkbox"
                  checked={form.premium}
                  onChange={(e) => setForm((f) => ({ ...f, premium: e.target.checked }))}
                  className="h-4 w-4 rounded border-[#EAE5DC] accent-[#FFD700]"
                />
                <Star className="h-3.5 w-3.5 fill-[#FFD700] text-[#FFD700]" />
                Premium
              </label>
            </div>
          </div>

          {/* Boutons */}
          <div className="mt-5 flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowForm(false)}
              className="border-[#EAE5DC]"
            >
              Annuler
            </Button>
            <Button
              size="sm"
              onClick={handleSubmit}
              disabled={creating}
              className="gap-1.5 rounded-lg bg-[#059669] text-white hover:bg-[#047857]"
            >
              {creating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              {creating ? 'Enregistrement…' : 'Enregistrer'}
            </Button>
          </div>
        </div>
      )}

      {/* Filtres */}
      <div className="flex flex-wrap gap-2 text-xs">
        {[
          { key: 'all' as const, label: 'Tous', value: stats.total, color: 'bg-[#EAE5DC] text-[#1A1A1A]' },
          { key: 'verified' as const, label: 'Vérifiés', value: stats.verified, color: 'bg-[#0026A3]/12 text-[#0026A3]' },
          { key: 'premium' as const, label: 'Premium', value: stats.premium, color: 'bg-[#FFD700]/15 text-[#B8964F]' },
        ].map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => setFilter(s.key)}
            className={cn(
              'rounded-lg px-3 py-1.5 font-medium transition',
              s.color,
              filter === s.key && 'ring-2 ring-[#FFD700]',
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
          className="w-full rounded-xl border border-[#EAE5DC] bg-white py-2.5 pl-10 pr-4 text-sm text-[#1A1A1A] placeholder:text-[#1A1A1A]/40 focus:border-[#FFD700] focus:outline-none focus:ring-2 focus:ring-[#FFD700]/20"
        />
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#EAE5DC] bg-white p-12 text-center">
          <Wrench className="mx-auto mb-3 h-8 w-8 text-[#1A1A1A]/20" />
          <p className="text-sm font-medium text-[#1A1A1A]/60">Aucun artisan pour le moment</p>
          <p className="mt-1 text-xs text-[#1A1A1A]/40">
            {allArtisans.length === 0
              ? 'Cliquez sur « Ajouter un artisan » pour commencer.'
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
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#FFD700]/15 text-xs font-bold text-[#B8964F]">
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
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[#EAE5DC] px-2.5 py-1 text-xs font-medium text-[#1A1A1A] transition hover:border-[#FFD700] hover:bg-[#FFD700]/8"
                    >
                      <Phone className="h-3 w-3 text-[#059669]" />
                      {a.phone}
                    </a>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {a.verified && (
                        <Badge className="bg-[#0026A3]/12 text-[#0026A3] text-[10px]">
                          <Check className="mr-0.5 h-2.5 w-2.5" /> Vérifié
                        </Badge>
                      )}
                      {a.premium && (
                        <Badge className="bg-[#FFD700]/15 text-[#B8964F] text-[10px]">
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
                      <Star className="h-3.5 w-3.5 fill-[#FFD700] text-[#FFD700]" />
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

// ============================================================
// BusinessManagementView — Gestion des commerces soumis par les artisans
// ------------------------------------------------------------
// Deux sections :
//   1. "En attente de validation" — fetch /api/city/businesses?status=pending
//      → boutons Approuver / Rejeter (PATCH status=approved|rejected)
//   2. "Commerces actifs" — fetch /api/city/businesses?status=approved
//      → toggle Premium, formulaire Sponsoriser (offerText + offerEndsAt),
//        boutons "Voir le menu" / "Voir la grille tarifaire" si données dispo,
//        boutons "Éditer le menu" / "Éditer la grille tarifaire" pour les
//        commerces premium (restaurants → menu, autres → grille tarifaire).
//
// Panneau "Premium activation" dédié : liste des commerces premium + toggle
// par feature (menu, priceGrid, sponsored).
// ============================================================

/** Resize une image (File) en data URL JPEG — maxDim 400px, qualité 0.7.
 *  Pattern identique à celui utilisé dans city-scan-view.tsx (handlePhoto). */
function resizePhotoToDataUrl(
  file: File,
  maxDim: number,
  quality: number,
  done: (dataUrl: string) => void,
) {
  const reader = new FileReader()
  reader.onload = () => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      const ratio = Math.min(maxDim / img.width, maxDim / img.height, 1)
      canvas.width = Math.round(img.width * ratio)
      canvas.height = Math.round(img.height * ratio)
      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        done(canvas.toDataURL('image/jpeg', quality))
      }
    }
    img.onerror = () => done('')
    img.src = reader.result as string
  }
  reader.onerror = () => done('')
  reader.readAsDataURL(file)
}

/** Génère un ID court pour un item de menu / priceGrid (pas persisté côté DB). */
function makeItemId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

function BusinessManagementView({ onRefresh }: { onRefresh?: () => Promise<void> }) {
  const { toast } = useToast()
  const SERIF = { fontFamily: 'Georgia, "Playfair Display", serif' } as const

  const [pending, setPending] = useState<CityBusiness[]>([])
  const [approved, setApproved] = useState<CityBusiness[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  // Pour le menu / priceGrid modal
  const [viewMenu, setViewMenu] = useState<CityBusiness | null>(null)
  const [viewPriceGrid, setViewPriceGrid] = useState<CityBusiness | null>(null)

  // Pour le formulaire sponsorisé
  const [sponsorBusiness, setSponsorBusiness] = useState<CityBusiness | null>(null)
  const [sponsorForm, setSponsorForm] = useState({ offerText: '', offerEndsAt: '' })
  const [savingSponsor, setSavingSponsor] = useState(false)

  // --- Bannière commerce (restaurant notamment) ---
  // La bannière est stockée sur le CityArtisan via les champs existants :
  //   - offerText    → texte affiché dans la bannière
  //   - isSponsored  → true = bannière visible, false = masquée
  // Pas besoin de nouveau champ Prisma : on réutilise offerText/isSponsored
  // exactement comme pour le sponsoring, mais via une UI dédiée bannière.
  const [bannerBusiness, setBannerBusiness] = useState<CityBusiness | null>(null)
  const [bannerForm, setBannerForm] = useState({ offerText: '', active: false })
  const [savingBanner, setSavingBanner] = useState(false)

  // Pour le panneau d'activation premium (choix de la feature)
  const [premiumSetup, setPremiumSetup] = useState<CityBusiness | null>(null)

  // --- Éditeurs menu / grille tarifaire (commerces premium) ---
  // editingMenu / editingPriceGrid : commerce actuellement édité (ouvre le modal)
  // menuItems / priceItems        : buffer d'édition local (add/remove/update)
  const [editingMenu, setEditingMenu] = useState<CityBusiness | null>(null)
  const [editingPriceGrid, setEditingPriceGrid] = useState<CityBusiness | null>(null)
  const [menuItems, setMenuItems] = useState<BusinessMenuItem[]>([])
  const [priceItems, setPriceItems] = useState<BusinessPriceItem[]>([])
  const [savingMenu, setSavingMenu] = useState(false)
  const [savingPriceGrid, setSavingPriceGrid] = useState(false)
  // Refs pour les inputs file (un par item) — clés = index de l'item
  const menuFileRefs = useRef<Record<number, HTMLInputElement | null>>({})
  const priceFileRefs = useRef<Record<number, HTMLInputElement | null>>({})

  // --- Fetch les deux listes ---
  const fetchLists = useCallback(async () => {
    try {
      const [pendRes, apprRes] = await Promise.all([
        fetch('/api/city/businesses?status=pending', { cache: 'no-store' }).then((r) => r.json()),
        fetch('/api/city/businesses?status=approved', { cache: 'no-store' }).then((r) => r.json()),
      ])
      if (pendRes?.ok && Array.isArray(pendRes.data?.businesses)) {
        setPending(pendRes.data.businesses)
      }
      if (apprRes?.ok && Array.isArray(apprRes.data?.businesses)) {
        setApproved(apprRes.data.businesses)
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchLists()
  }, [fetchLists])

  // --- PATCH générique ---
  const patchBusiness = useCallback(
    async (id: string, patch: Record<string, unknown>, successMsg: string) => {
      try {
        const res = await fetch(`/api/city/businesses/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch),
        })
        const json = await res.json()
        if (json?.ok) {
          toast({ title: successMsg })
          // Refresh listes après une mutation
          await fetchLists()
          if (onRefresh) await onRefresh()
        } else {
          toast({
            title: 'Erreur',
            description: json?.error ?? 'Mise à jour impossible',
            variant: 'destructive',
          })
        }
      } catch {
        toast({ title: 'Erreur réseau', variant: 'destructive' })
      }
    },
    [fetchLists, onRefresh, toast],
  )

  const handleApprove = (b: CityBusiness) =>
    patchBusiness(b.id, { status: 'approved' }, `Commerce approuvé — ${b.name}`)

  const handleReject = (b: CityBusiness) =>
    patchBusiness(b.id, { status: 'rejected' }, `Commerce rejeté — ${b.name}`)

  const handleTogglePremium = (b: CityBusiness) => {
    if (b.isPremium) {
      // Désactivation directe
      patchBusiness(
        b.id,
        { isPremium: false, isSponsored: false },
        `Premium désactivé — ${b.name}`,
      )
    } else {
      // Activation : ouvrir le panneau de choix de feature
      setPremiumSetup(b)
    }
  }

  const handleActivatePremiumWithFeature = (feature: 'menu' | 'priceGrid' | 'sponsored') => {
    if (!premiumSetup) return
    const features = Array.from(new Set([...(premiumSetup.premiumFeatures ?? []), feature]))
    if (feature === 'sponsored') {
      // Ouvrir le formulaire sponsorisé en parallèle
      setSponsorBusiness(premiumSetup)
      setSponsorForm({
        offerText: premiumSetup.offerText ?? '',
        offerEndsAt: premiumSetup.offerEndsAt
          ? new Date(premiumSetup.offerEndsAt).toISOString().slice(0, 16)
          : '',
      })
    }
    patchBusiness(
      premiumSetup.id,
      { isPremium: true, premiumFeatures: features },
      `Premium activé — ${premiumSetup.name} (${feature})`,
    )
    setPremiumSetup(null)
  }

  const openSponsorForm = (b: CityBusiness) => {
    setSponsorBusiness(b)
    setSponsorForm({
      offerText: b.offerText ?? '',
      offerEndsAt: b.offerEndsAt
        ? new Date(b.offerEndsAt).toISOString().slice(0, 16)
        : '',
    })
  }

  const handleSaveSponsor = async () => {
    if (!sponsorBusiness) return
    if (sponsorForm.offerText.trim().length < 3) {
      toast({ title: 'Offre requise', description: 'Minimum 3 caractères.', variant: 'destructive' })
      return
    }
    setSavingSponsor(true)
    const patch: Record<string, unknown> = {
      isSponsored: true,
      offerText: sponsorForm.offerText.trim(),
    }
    if (sponsorForm.offerEndsAt) {
      // datetime-local → ISO
      const d = new Date(sponsorForm.offerEndsAt)
      if (!isNaN(d.getTime())) {
        patch.offerEndsAt = d.toISOString()
      }
    } else {
      patch.offerEndsAt = null
    }
    await patchBusiness(
      sponsorBusiness.id,
      patch,
      `Sponsoring activé — ${sponsorBusiness.name}`,
    )
    setSavingSponsor(false)
    setSponsorBusiness(null)
  }

  const handleDeactivateSponsor = (b: CityBusiness) =>
    patchBusiness(
      b.id,
      { isSponsored: false, offerText: null, offerEndsAt: null },
      `Sponsoring désactivé — ${b.name}`,
    )

  // ============================================================
  // Actions de modération : Suspendre / Bloquer / Supprimer
  // ------------------------------------------------------------
  //   • Suspendre → PATCH { status: 'rejected' } : masque le commerce
  //     côté citoyen sans toucher aux autres champs (réversible).
  //   • Bloquer   → PATCH { active: false } : bloque toute activité
  //     (appels, messages, commandes). Réversible via { active: true }.
  //   • Supprimer → DELETE /api/city/businesses/{id} : suppression
  //     permanente de la fiche commerce.
  // Chaque action demande une confirmation via toast (description
  // explicite) puis rafraîchit les listes via fetchLists().
  // ============================================================

  const handleSuspend = (b: CityBusiness) => {
    toast({
      title: `Suspendre ${b.name} ?`,
      description:
        'Le commerce sera masqué des résultats citoyens (statut « rejected »). Réversible.',
    })
    patchBusiness(
      b.id,
      { status: 'rejected' },
      `Commerce suspendu — ${b.name}`,
    )
  }

  const handleBlock = (b: CityBusiness) => {
    toast({
      title: `Bloquer ${b.name} ?`,
      description:
        "Toute activité (appels, messages, commandes) sera bloquée. Activez à nouveau pour rétablir.",
    })
    patchBusiness(
      b.id,
      { active: false },
      `Commerce bloqué — ${b.name}`,
    )
  }

  const handleUnblock = (b: CityBusiness) =>
    patchBusiness(
      b.id,
      { active: true },
      `Commerce débloqué — ${b.name}`,
    )

  const handleDelete = async (b: CityBusiness) => {
    toast({
      title: `Supprimer ${b.name} ?`,
      description:
        'Suppression définitive. Cette action est irréversible.',
      variant: 'destructive',
    })
    try {
      const res = await fetch(`/api/city/businesses/${b.id}`, {
        method: 'DELETE',
      })
      const json = await res.json()
      if (json?.ok) {
        toast({ title: `Commerce supprimé — ${b.name}` })
        await fetchLists()
        if (onRefresh) await onRefresh()
      } else {
        toast({
          title: 'Erreur',
          description: json?.error ?? 'Suppression impossible',
          variant: 'destructive',
        })
      }
    } catch {
      toast({ title: 'Erreur réseau', variant: 'destructive' })
    }
  }

  // ============================================================
  // Bannière commerce — formulaire dédié
  // ------------------------------------------------------------
  // On réutilise offerText + isSponsored (mêmes champs que le
  // sponsoring) mais via une UI « bannière » plus simple :
  //   - texte libre (offerText)
  //   - toggle actif/inactif (isSponsored)
  // La vue restaurant/artisan lit ces deux champs pour afficher
  // une bannière promo en haut de sa fiche.
  // ============================================================

  const openBannerForm = (b: CityBusiness) => {
    setBannerBusiness(b)
    setBannerForm({
      offerText: b.offerText ?? '',
      active: !!b.isSponsored,
    })
  }

  const handleSaveBanner = async () => {
    if (!bannerBusiness) return
    // Si on active la bannière, il faut un texte non vide.
    if (bannerForm.active && bannerForm.offerText.trim().length < 3) {
      toast({
        title: 'Texte requis',
        description: 'Saisissez au moins 3 caractères pour la bannière.',
        variant: 'destructive',
      })
      return
    }
    setSavingBanner(true)
    const patch: Record<string, unknown> = {
      isSponsored: bannerForm.active,
      offerText: bannerForm.active ? bannerForm.offerText.trim() : null,
    }
    // Quand on désactive la bannière, on nettoie aussi offerEndsAt
    // pour éviter qu'une ancienne date d'expiration sponsorisée ne
    // traîne dans la fiche.
    if (!bannerForm.active) {
      patch.offerEndsAt = null
    }
    await patchBusiness(
      bannerBusiness.id,
      patch,
      bannerForm.active
        ? `Bannière activée — ${bannerBusiness.name}`
        : `Bannière désactivée — ${bannerBusiness.name}`,
    )
    setSavingBanner(false)
    setBannerBusiness(null)
  }

  // ============================================================
  // Éditeurs menu & grille tarifaire (commerces premium)
  // ------------------------------------------------------------
  // Les commerces premium (isPremium=true) peuvent publier :
  //   - restaurants   → menu   (jusqu'à 10 plats : {name, photo, price})
  //   - autres        → grille  (jusqu'à 10 prestations : {service, photo, price, unit})
  // Le contenu est sérialisé en JSON string côté client puis PATCHé vers
  // /api/city/businesses/{id} avec {menu: JSON.stringify(items)} ou
  // {priceGrid: JSON.stringify(items)}.
  // ============================================================

  const openMenuEditor = (b: CityBusiness) => {
    setEditingMenu(b)
    setMenuItems(
      (b.menu ?? []).map((it) => ({
        id: it.id ?? makeItemId('mi'),
        name: it.name ?? '',
        price: typeof it.price === 'number' ? it.price : 0,
        description: it.description ?? null,
        photo: it.photo ?? null,
      })),
    )
  }

  const openPriceGridEditor = (b: CityBusiness) => {
    setEditingPriceGrid(b)
    setPriceItems(
      // Compatibilité ascendante : anciens items pouvaient utiliser `label`
      // au lieu de `service` — on bascule proprement vers `service`.
      (b.priceGrid ?? []).map((it) => {
        const serviceStr =
          typeof it.service === 'string'
            ? it.service
            : ((it as unknown as { label?: string }).label ?? '')
        return {
          id: it.id ?? makeItemId('pi'),
          service: serviceStr,
          price: typeof it.price === 'number' ? it.price : 0,
          unit: it.unit ?? null,
          photo: it.photo ?? null,
        }
      }),
    )
  }

  // --- Menu : add / update / remove ---
  const addMenuItem = () => {
    if (menuItems.length >= 10) {
      toast({
        title: 'Maximum atteint',
        description: '10 plats maximum par menu.',
        variant: 'destructive',
      })
      return
    }
    setMenuItems((arr) => [
      ...arr,
      { id: makeItemId('mi'), name: '', price: 0, photo: null },
    ])
  }

  const updateMenuItem = (idx: number, patch: Partial<BusinessMenuItem>) =>
    setMenuItems((arr) => arr.map((it, i) => (i === idx ? { ...it, ...patch } : it)))

  const removeMenuItem = (idx: number) =>
    setMenuItems((arr) => arr.filter((_, i) => i !== idx))

  const handleMenuItemPhoto = (
    idx: number,
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0]
    if (!file) return
    resizePhotoToDataUrl(file, 400, 0.7, (dataUrl) => {
      if (dataUrl) updateMenuItem(idx, { photo: dataUrl })
      // reset input pour permettre de re-picker le même fichier
      e.target.value = ''
    })
  }

  // --- Price grid : add / update / remove ---
  const addPriceItem = () => {
    if (priceItems.length >= 10) {
      toast({
        title: 'Maximum atteint',
        description: '10 prestations maximum par grille.',
        variant: 'destructive',
      })
      return
    }
    setPriceItems((arr) => [
      ...arr,
      { id: makeItemId('pi'), service: '', price: 0, unit: '', photo: null },
    ])
  }

  const updatePriceItem = (idx: number, patch: Partial<BusinessPriceItem>) =>
    setPriceItems((arr) => arr.map((it, i) => (i === idx ? { ...it, ...patch } : it)))

  const removePriceItem = (idx: number) =>
    setPriceItems((arr) => arr.filter((_, i) => i !== idx))

  const handlePriceItemPhoto = (
    idx: number,
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0]
    if (!file) return
    resizePhotoToDataUrl(file, 400, 0.7, (dataUrl) => {
      if (dataUrl) updatePriceItem(idx, { photo: dataUrl })
      e.target.value = ''
    })
  }

  // --- Save menu ---
  const handleSaveMenu = async () => {
    if (!editingMenu) return
    // Nettoyage : on retire les plats sans nom (saisie inachevée)
    const cleaned: BusinessMenuItem[] = menuItems
      .map((it) => ({
        id: it.id,
        name: (it.name ?? '').trim(),
        price: Number.isFinite(it.price) ? Math.max(0, Math.round(it.price)) : 0,
        description: it.description?.trim() || null,
        photo: it.photo ?? null,
      }))
      .filter((it) => it.name.length > 0)

    if (cleaned.length === 0) {
      toast({
        title: 'Menu vide',
        description: 'Ajoutez au moins un plat avec un nom.',
        variant: 'destructive',
      })
      return
    }
    setSavingMenu(true)
    await patchBusiness(
      editingMenu.id,
      { menu: JSON.stringify(cleaned) },
      `Menu enregistré — ${editingMenu.name} (${cleaned.length} plats)`,
    )
    setSavingMenu(false)
    setEditingMenu(null)
    setMenuItems([])
  }

  // --- Save price grid ---
  const handleSavePriceGrid = async () => {
    if (!editingPriceGrid) return
    const cleaned: BusinessPriceItem[] = priceItems
      .map((it) => ({
        id: it.id,
        service: (it.service ?? '').trim(),
        price: Number.isFinite(it.price) ? Math.max(0, Math.round(it.price)) : 0,
        unit: it.unit?.trim() || null,
        photo: it.photo ?? null,
      }))
      .filter((it) => it.service.length > 0)

    if (cleaned.length === 0) {
      toast({
        title: 'Grille vide',
        description: 'Ajoutez au moins une prestation avec un nom.',
        variant: 'destructive',
      })
      return
    }
    setSavingPriceGrid(true)
    await patchBusiness(
      editingPriceGrid.id,
      { priceGrid: JSON.stringify(cleaned) },
      `Grille enregistrée — ${editingPriceGrid.name} (${cleaned.length} prestations)`,
    )
    setSavingPriceGrid(false)
    setEditingPriceGrid(null)
    setPriceItems([])
  }

  // --- Recherche dans la liste approuvée ---
  const filteredApproved = useMemo(() => {
    if (!search.trim()) return approved
    const q = search.trim().toLowerCase()
    return approved.filter((b) =>
      `${b.name} ${b.trade} ${b.category ?? ''} ${b.district ?? ''} ${b.phone ?? ''}`
        .toLowerCase()
        .includes(q),
    )
  }, [approved, search])

  const premiumCount = approved.filter((b) => b.isPremium).length
  const sponsoredCount = approved.filter((b) => b.isSponsored).length

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-[#0026A3]" style={SERIF}>
            Commerces
          </h2>
          <p className="text-xs text-[#1A1A1A]/55">
            {pending.length} en attente · {approved.length} actifs · {premiumCount} premium · {sponsoredCount} sponsorisés
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge className="bg-[#F97316]/12 text-[#F97316]">
            <Clock className="mr-1 h-3 w-3" /> {pending.length} à valider
          </Badge>
          <Badge className="bg-[#059669]/12 text-[#059669]">
            <ShoppingBag className="mr-1 h-3 w-3" /> {approved.length} actifs
          </Badge>
        </div>
      </div>

      {/* Loading */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-[#FFD700]" />
        </div>
      ) : (
        <>
          {/* ============== Section 1 : En attente de validation ============== */}
          <section className="overflow-hidden rounded-2xl border border-[#F97316]/30 bg-white shadow-sm">
            <div
              className="flex items-center justify-between border-b border-[#EAE5DC] border-l-4 border-l-[#FFD700] bg-[#0026A3]/5 px-4 py-3"
              style={{ borderLeft: '4px solid #F97316' }}
            >
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-[#F97316]" />
                <h3 className="text-sm font-bold text-[#0026A3]" style={SERIF}>
                  En attente de validation
                </h3>
              </div>
              <span className="rounded-full bg-[#F97316] px-2.5 py-0.5 text-xs font-bold text-white">
                {pending.length}
              </span>
            </div>
            <div className="p-4">
              {pending.length === 0 ? (
                <div className="py-8 text-center">
                  <Check className="mx-auto mb-2 h-7 w-7 text-[#059669]/40" />
                  <p className="text-sm font-medium text-[#1A1A1A]/60">
                    Aucun commerce en attente
                  </p>
                  <p className="mt-1 text-xs text-[#1A1A1A]/40">
                    Les nouvelles soumissions artisans apparaîtront ici.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {pending.map((b) => (
                    <BusinessCard
                      key={b.id}
                      business={b}
                      mode="pending"
                      onApprove={() => handleApprove(b)}
                      onReject={() => handleReject(b)}
                    />
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* ============== Section 2 : Commerces actifs ============== */}
          <section className="overflow-hidden rounded-2xl border border-[#EAE5DC] bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#EAE5DC] border-l-4 border-l-[#FFD700] bg-[#0026A3]/5 px-4 py-3">
              <div className="flex items-center gap-2">
                <ShoppingBag className="h-4 w-4 text-[#059669]" />
                <h3 className="text-sm font-bold text-[#0026A3]" style={SERIF}>
                  Commerces actifs
                </h3>
              </div>
              <div className="relative w-full sm:w-72">
                <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#1A1A1A]/30" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Rechercher commerce, métier, quartier…"
                  className="w-full rounded-lg border border-[#EAE5DC] bg-white py-2 pl-9 pr-3 text-xs text-[#1A1A1A] placeholder:text-[#1A1A1A]/40 focus:border-[#FFD700] focus:outline-none focus:ring-1 focus:ring-[#FFD700]/20"
                />
              </div>
            </div>
            <div className="p-4">
              {filteredApproved.length === 0 ? (
                <div className="py-8 text-center">
                  <ShoppingBag className="mx-auto mb-2 h-7 w-7 text-[#1A1A1A]/20" />
                  <p className="text-sm font-medium text-[#1A1A1A]/60">
                    Aucun commerce actif
                  </p>
                  <p className="mt-1 text-xs text-[#1A1A1A]/40">
                    Approuvez des commerces en attente pour les voir apparaître ici.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {filteredApproved.map((b) => (
                    <BusinessCard
                      key={b.id}
                      business={b}
                      mode="approved"
                      onTogglePremium={() => handleTogglePremium(b)}
                      onOpenSponsor={() => openSponsorForm(b)}
                      onDeactivateSponsor={() => handleDeactivateSponsor(b)}
                      onOpenBanner={() => openBannerForm(b)}
                      onViewMenu={() => setViewMenu(b)}
                      onViewPriceGrid={() => setViewPriceGrid(b)}
                      onEditMenu={() => openMenuEditor(b)}
                      onEditPriceGrid={() => openPriceGridEditor(b)}
                      onSuspend={() => handleSuspend(b)}
                      onBlock={() => handleBlock(b)}
                      onUnblock={() => handleUnblock(b)}
                      onDelete={() => handleDelete(b)}
                    />
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* ============== Panneau : Premium activation ============== */}
          <section className="overflow-hidden rounded-2xl border border-[#FFD700]/30 bg-gradient-to-br from-white to-[#FFD700]/5 shadow-sm">
            <div className="flex items-center gap-2 border-b border-[#EAE5DC] border-l-4 border-l-[#FFD700] bg-[#0026A3]/5 px-4 py-3">
              <Sparkles className="h-4 w-4 text-[#FFD700]" />
              <h3 className="text-sm font-bold text-[#0026A3]" style={SERIF}>
                Activation Premium
              </h3>
              <Badge className="ml-auto bg-[#FFD700]/15 text-[#B8964F]">
                {premiumCount} premium
              </Badge>
            </div>
            <div className="divide-y divide-[#EAE5DC]/60">
              {approved.filter((b) => b.isPremium).length === 0 ? (
                <div className="px-4 py-8 text-center">
                  <Star className="mx-auto mb-2 h-7 w-7 text-[#FFD700]/40" />
                  <p className="text-sm font-medium text-[#1A1A1A]/60">
                    Aucun commerce premium pour le moment
                  </p>
                  <p className="mt-1 text-xs text-[#1A1A1A]/45">
                    Activez Premium sur un commerce actif pour le voir ici.
                  </p>
                </div>
              ) : (
                approved
                  .filter((b) => b.isPremium)
                  .map((b) => (
                    <div key={b.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#FFD700]/15 text-xs font-bold text-[#B8964F]">
                        {b.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-[#1A1A1A]">{b.name}</p>
                        <p className="truncate text-xs text-[#1A1A1A]/55">
                          {b.trade}
                          {b.district ? ` · ${b.district}` : ''}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {(b.premiumFeatures ?? []).includes('menu') && (
                          <Badge className="bg-[#0026A3]/12 text-[10px] text-[#0026A3]">
                            <Utensils className="mr-0.5 h-2.5 w-2.5" /> Menu
                          </Badge>
                        )}
                        {(b.premiumFeatures ?? []).includes('priceGrid') && (
                          <Badge className="bg-[#6B4C9A]/12 text-[10px] text-[#6B4C9A]">
                            <Tag className="mr-0.5 h-2.5 w-2.5" /> Grille
                          </Badge>
                        )}
                        {b.isSponsored && (
                          <Badge className="bg-[#F97316]/12 text-[10px] text-[#F97316]">
                            <Megaphone className="mr-0.5 h-2.5 w-2.5" /> Sponsorisé
                          </Badge>
                        )}
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setPremiumSetup(b)}
                        className="border-[#FFD700]/40 text-[#1A1A1A] hover:bg-[#FFD700]/8"
                      >
                        <Plus className="mr-1 h-3 w-3" /> Feature
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleTogglePremium(b)}
                        className="text-[#DC2626] hover:bg-[#DC2626]/8"
                      >
                        Désactiver Premium
                      </Button>
                    </div>
                  ))
              )}
            </div>
          </section>
        </>
      )}

      {/* ---------- Modal : choix de la feature premium ---------- */}
      {premiumSetup && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setPremiumSetup(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-[#1A1A1A]" style={SERIF}>
                  Activer une fonction Premium
                </h3>
                <p className="text-xs text-[#1A1A1A]/55">
                  {premiumSetup.name} · {premiumSetup.trade}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPremiumSetup(null)}
                className="text-[#1A1A1A]/40 hover:text-[#1A1A1A]"
                aria-label="Fermer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="mb-3 text-xs text-[#1A1A1A]/60">
              Choisissez la fonctionnalité premium à activer pour ce commerce :
            </p>
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => handleActivatePremiumWithFeature('menu')}
                className="flex w-full items-center gap-3 rounded-xl border-2 border-[#EAE5DC] bg-white p-3 text-left transition hover:border-[#0026A3] hover:bg-[#0026A3]/5"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#0026A3]/12 text-[#0026A3]">
                  <Utensils className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-[#1A1A1A]">Menu &amp; Commande</p>
                  <p className="text-xs text-[#1A1A1A]/55">
                    Affiche le menu du commerce et permet la commande en ligne
                  </p>
                </div>
              </button>
              <button
                type="button"
                onClick={() => handleActivatePremiumWithFeature('priceGrid')}
                className="flex w-full items-center gap-3 rounded-xl border-2 border-[#EAE5DC] bg-white p-3 text-left transition hover:border-[#6B4C9A] hover:bg-[#6B4C9A]/5"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#6B4C9A]/12 text-[#6B4C9A]">
                  <Tag className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-[#1A1A1A]">Grille Tarifaire</p>
                  <p className="text-xs text-[#1A1A1A]/55">
                    Publie une grille de prix pour vos services
                  </p>
                </div>
              </button>
              <button
                type="button"
                onClick={() => handleActivatePremiumWithFeature('sponsored')}
                className="flex w-full items-center gap-3 rounded-xl border-2 border-[#EAE5DC] bg-white p-3 text-left transition hover:border-[#F97316] hover:bg-[#F97316]/5"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#F97316]/12 text-[#F97316]">
                  <Megaphone className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-[#1A1A1A]">Annonce sponsorisée</p>
                  <p className="text-xs text-[#1A1A1A]/55">
                    Met en avant une offre promotionnelle temporaire
                  </p>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------- Modal : formulaire sponsoring ---------- */}
      {sponsorBusiness && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setSponsorBusiness(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-[#1A1A1A]" style={SERIF}>
                  Sponsoriser ce commerce
                </h3>
                <p className="text-xs text-[#1A1A1A]/55">
                  {sponsorBusiness.name} · {sponsorBusiness.trade}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSponsorBusiness(null)}
                className="text-[#1A1A1A]/40 hover:text-[#1A1A1A]"
                aria-label="Fermer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#1A1A1A]/60">
                  Texte de l&apos;offre *
                </label>
                <textarea
                  value={sponsorForm.offerText}
                  onChange={(e) => setSponsorForm((f) => ({ ...f, offerText: e.target.value }))}
                  placeholder="ex : -20% sur tous nos plats ce week-end !"
                  maxLength={200}
                  rows={3}
                  className="mt-1 w-full rounded-xl border border-[#EAE5DC] bg-[#FAFAF7] px-3 py-2 text-sm focus:border-[#F97316] focus:outline-none focus:ring-2 focus:ring-[#F97316]/15"
                />
                <p className="mt-1 text-[10px] text-[#1A1A1A]/40">
                  {sponsorForm.offerText.length}/200 caractères
                </p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#1A1A1A]/60">
                  Fin de l&apos;offre (optionnel)
                </label>
                <input
                  type="datetime-local"
                  value={sponsorForm.offerEndsAt}
                  onChange={(e) => setSponsorForm((f) => ({ ...f, offerEndsAt: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-[#EAE5DC] bg-[#FAFAF7] px-3 py-2 text-sm focus:border-[#F97316] focus:outline-none focus:ring-2 focus:ring-[#F97316]/15"
                />
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSponsorBusiness(null)}
                className="border-[#EAE5DC]"
              >
                Annuler
              </Button>
              <Button
                size="sm"
                onClick={handleSaveSponsor}
                disabled={savingSponsor}
                className="gap-1.5 rounded-lg bg-[#F97316] text-white hover:bg-[#EA580C]"
              >
                {savingSponsor ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Megaphone className="h-3.5 w-3.5" />
                )}
                {savingSponsor ? 'Enregistrement…' : 'Activer le sponsoring'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ---------- Modal : aperçu du menu ---------- */}
      {viewMenu && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setViewMenu(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-[#1A1A1A]" style={SERIF}>
                  Menu — {viewMenu.name}
                </h3>
                <p className="text-xs text-[#1A1A1A]/55">{viewMenu.trade}</p>
              </div>
              <button
                type="button"
                onClick={() => setViewMenu(null)}
                className="text-[#1A1A1A]/40 hover:text-[#1A1A1A]"
                aria-label="Fermer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {(viewMenu.menu ?? []).length === 0 ? (
              <p className="py-8 text-center text-xs text-[#1A1A1A]/50">
                Aucun article de menu défini.
              </p>
            ) : (
              <ul className="divide-y divide-[#EAE5DC]/60">
                {(viewMenu.menu ?? []).map((item, idx) => (
                  <li key={item.id ?? idx} className="flex items-start gap-3 py-3">
                    {item.photo ? (
                      <img
                        src={item.photo}
                        alt={`Photo du plat : ${item.name}`}
                        className="h-12 w-12 shrink-0 rounded-lg border border-[#EAE5DC] object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#0026A3]/12 text-[#0026A3]">
                        <Utensils className="h-4 w-4" />
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-[#1A1A1A]">{item.name}</p>
                      {item.description && (
                        <p className="text-xs text-[#1A1A1A]/55">{item.description}</p>
                      )}
                    </div>
                    <span className="shrink-0 text-sm font-bold tabular-nums text-[#059669]">
                      {item.price.toLocaleString('fr-FR')} FCFA
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* ---------- Modal : aperçu de la grille tarifaire ---------- */}
      {viewPriceGrid && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setViewPriceGrid(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-[#1A1A1A]" style={SERIF}>
                  Grille tarifaire — {viewPriceGrid.name}
                </h3>
                <p className="text-xs text-[#1A1A1A]/55">{viewPriceGrid.trade}</p>
              </div>
              <button
                type="button"
                onClick={() => setViewPriceGrid(null)}
                className="text-[#1A1A1A]/40 hover:text-[#1A1A1A]"
                aria-label="Fermer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {(viewPriceGrid.priceGrid ?? []).length === 0 ? (
              <p className="py-8 text-center text-xs text-[#1A1A1A]/50">
                Aucun tarif défini.
              </p>
            ) : (
              <ul className="divide-y divide-[#EAE5DC]/60">
                {(viewPriceGrid.priceGrid ?? []).map((item, idx) => (
                  <li key={item.id ?? idx} className="flex items-center gap-3 py-3">
                    {item.photo ? (
                      <img
                        src={item.photo}
                        alt={`Photo de la prestation : ${item.service}`}
                        className="h-12 w-12 shrink-0 rounded-lg border border-[#EAE5DC] object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#6B4C9A]/12 text-[#6B4C9A]">
                        <Tag className="h-4 w-4" />
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-[#1A1A1A]">
                        {item.service}
                      </p>
                      {item.unit && (
                        <p className="text-xs text-[#1A1A1A]/55">{item.unit}</p>
                      )}
                    </div>
                    <span className="shrink-0 text-sm font-bold tabular-nums text-[#6B4C9A]">
                      {item.price.toLocaleString('fr-FR')} FCFA
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* ---------- Modal : éditeur de menu (commerce premium restaurant) ---------- */}
      {editingMenu && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => !savingMenu && setEditingMenu(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-[#1A1A1A]" style={SERIF}>
                  Éditer le menu — {editingMenu.name}
                </h3>
                <p className="text-xs text-[#1A1A1A]/55">
                  {editingMenu.trade} · {menuItems.length}/10 plats
                </p>
              </div>
              <button
                type="button"
                onClick={() => !savingMenu && setEditingMenu(null)}
                className="text-[#1A1A1A]/40 hover:text-[#1A1A1A]"
                aria-label="Fermer"
                disabled={savingMenu}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="mb-3 text-xs text-[#1A1A1A]/55">
              Ajoutez jusqu&apos;à 10 plats avec nom, prix (FCFA) et photo. Les photos
              sont prises directement depuis l&apos;appareil photo (mobile) ou
              téléversées (desktop), puis redimensionnées à 400 px.
            </p>

            <div className="space-y-3">
              {menuItems.length === 0 && (
                <p className="rounded-xl border border-dashed border-[#EAE5DC] bg-[#FAFAF7] px-4 py-6 text-center text-xs text-[#1A1A1A]/50">
                  Aucun plat. Cliquez sur « Ajouter un plat » pour commencer.
                </p>
              )}
              {menuItems.map((item, idx) => (
                <div
                  key={item.id ?? idx}
                  className="rounded-xl border border-[#EAE5DC] bg-[#FAFAF7] p-3"
                >
                  <div className="flex items-start gap-3">
                    {/* Photo (clic → input file caméra) */}
                    <button
                      type="button"
                      onClick={() => menuFileRefs.current[idx]?.click()}
                      className="group relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-[#EAE5DC] bg-white transition hover:border-[#0026A3] hover:shadow-md"
                      aria-label={`Photo du plat ${idx + 1}`}
                    >
                      {item.photo ? (
                        <img
                          src={item.photo}
                          alt={`Photo du plat : ${item.name || `Plat ${idx + 1}`}`}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span className="flex h-full w-full items-center justify-center text-[#1A1A1A]/40">
                          <Camera className="h-5 w-5" />
                        </span>
                      )}
                      <span className="absolute inset-x-0 bottom-0 bg-black/55 py-0.5 text-center text-[9px] font-medium uppercase tracking-wide text-white opacity-0 transition group-hover:opacity-100">
                        Photo
                      </span>
                    </button>
                    <input
                      ref={(el) => {
                        menuFileRefs.current[idx] = el
                      }}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={(e) => handleMenuItemPhoto(idx, e)}
                      className="hidden"
                    />

                    {/* Champs nom + prix */}
                    <div className="min-w-0 flex-1 space-y-2">
                      <div>
                        <label className="block text-[10px] font-semibold uppercase tracking-wide text-[#1A1A1A]/50">
                          Nom du plat
                        </label>
                        <input
                          type="text"
                          value={item.name}
                          onChange={(e) => updateMenuItem(idx, { name: e.target.value })}
                          placeholder="ex : Thiéboudienne au poisson"
                          maxLength={80}
                          className="mt-0.5 w-full rounded-lg border border-[#EAE5DC] bg-white px-2.5 py-1.5 text-sm focus:border-[#0026A3] focus:outline-none focus:ring-1 focus:ring-[#0026A3]/20"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold uppercase tracking-wide text-[#1A1A1A]/50">
                          Prix (FCFA)
                        </label>
                        <input
                          type="number"
                          inputMode="numeric"
                          min={0}
                          step={100}
                          value={Number.isFinite(item.price) ? item.price : 0}
                          onChange={(e) =>
                            updateMenuItem(idx, {
                              price: Number.parseInt(e.target.value, 10) || 0,
                            })
                          }
                          placeholder="2500"
                          className="mt-0.5 w-full rounded-lg border border-[#EAE5DC] bg-white px-2.5 py-1.5 text-sm tabular-nums focus:border-[#0026A3] focus:outline-none focus:ring-1 focus:ring-[#0026A3]/20"
                        />
                      </div>
                    </div>

                    {/* Bouton supprimer */}
                    <button
                      type="button"
                      onClick={() => removeMenuItem(idx)}
                      disabled={savingMenu}
                      className="shrink-0 rounded-lg p-1.5 text-[#DC2626] transition hover:bg-[#DC2626]/8 disabled:opacity-40"
                      aria-label={`Supprimer le plat ${idx + 1}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={addMenuItem}
                disabled={savingMenu || menuItems.length >= 10}
                className="border-[#0026A3]/30 text-[#0026A3] hover:bg-[#0026A3]/5"
              >
                <Plus className="mr-1 h-3.5 w-3.5" /> Ajouter un plat
              </Button>
              <span className="ml-auto text-[10px] text-[#1A1A1A]/40">
                {menuItems.length}/10
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setEditingMenu(null)}
                disabled={savingMenu}
                className="border-[#EAE5DC]"
              >
                Annuler
              </Button>
              <Button
                size="sm"
                onClick={handleSaveMenu}
                disabled={savingMenu}
                className="gap-1.5 rounded-lg bg-[#0026A3] text-white hover:bg-[#1E40AF]"
              >
                {savingMenu ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Utensils className="h-3.5 w-3.5" />
                )}
                {savingMenu ? 'Enregistrement…' : 'Enregistrer le menu'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ---------- Modal : éditeur de grille tarifaire (commerce premium artisan) ---------- */}
      {editingPriceGrid && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => !savingPriceGrid && setEditingPriceGrid(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-[#1A1A1A]" style={SERIF}>
                  Éditer la grille tarifaire — {editingPriceGrid.name}
                </h3>
                <p className="text-xs text-[#1A1A1A]/55">
                  {editingPriceGrid.trade} · {priceItems.length}/10 prestations
                </p>
              </div>
              <button
                type="button"
                onClick={() => !savingPriceGrid && setEditingPriceGrid(null)}
                className="text-[#1A1A1A]/40 hover:text-[#1A1A1A]"
                aria-label="Fermer"
                disabled={savingPriceGrid}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="mb-3 text-xs text-[#1A1A1A]/55">
              Ajoutez jusqu&apos;à 10 prestations avec service, prix (FCFA), unité
              (forfait, à l&apos;heure, m²…) et photo. Les photos sont prises
              depuis l&apos;appareil photo et redimensionnées à 400 px.
            </p>

            <div className="space-y-3">
              {priceItems.length === 0 && (
                <p className="rounded-xl border border-dashed border-[#EAE5DC] bg-[#FAFAF7] px-4 py-6 text-center text-xs text-[#1A1A1A]/50">
                  Aucune prestation. Cliquez sur « Ajouter une prestation » pour commencer.
                </p>
              )}
              {priceItems.map((item, idx) => (
                <div
                  key={item.id ?? idx}
                  className="rounded-xl border border-[#EAE5DC] bg-[#FAFAF7] p-3"
                >
                  <div className="flex items-start gap-3">
                    {/* Photo (clic → input file caméra) */}
                    <button
                      type="button"
                      onClick={() => priceFileRefs.current[idx]?.click()}
                      className="group relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-[#EAE5DC] bg-white transition hover:border-[#6B4C9A] hover:shadow-md"
                      aria-label={`Photo de la prestation ${idx + 1}`}
                    >
                      {item.photo ? (
                        <img
                          src={item.photo}
                          alt={`Photo de la prestation : ${item.service || `Prestation ${idx + 1}`}`}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span className="flex h-full w-full items-center justify-center text-[#1A1A1A]/40">
                          <Camera className="h-5 w-5" />
                        </span>
                      )}
                      <span className="absolute inset-x-0 bottom-0 bg-black/55 py-0.5 text-center text-[9px] font-medium uppercase tracking-wide text-white opacity-0 transition group-hover:opacity-100">
                        Photo
                      </span>
                    </button>
                    <input
                      ref={(el) => {
                        priceFileRefs.current[idx] = el
                      }}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={(e) => handlePriceItemPhoto(idx, e)}
                      className="hidden"
                    />

                    {/* Champs service + prix + unité */}
                    <div className="min-w-0 flex-1 space-y-2">
                      <div>
                        <label className="block text-[10px] font-semibold uppercase tracking-wide text-[#1A1A1A]/50">
                          Prestation
                        </label>
                        <input
                          type="text"
                          value={item.service}
                          onChange={(e) => updatePriceItem(idx, { service: e.target.value })}
                          placeholder="ex : Réparation fuite robinet"
                          maxLength={80}
                          className="mt-0.5 w-full rounded-lg border border-[#EAE5DC] bg-white px-2.5 py-1.5 text-sm focus:border-[#6B4C9A] focus:outline-none focus:ring-1 focus:ring-[#6B4C9A]/20"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[10px] font-semibold uppercase tracking-wide text-[#1A1A1A]/50">
                            Prix (FCFA)
                          </label>
                          <input
                            type="number"
                            inputMode="numeric"
                            min={0}
                            step={500}
                            value={Number.isFinite(item.price) ? item.price : 0}
                            onChange={(e) =>
                              updatePriceItem(idx, {
                                price: Number.parseInt(e.target.value, 10) || 0,
                              })
                            }
                            placeholder="15000"
                            className="mt-0.5 w-full rounded-lg border border-[#EAE5DC] bg-white px-2.5 py-1.5 text-sm tabular-nums focus:border-[#6B4C9A] focus:outline-none focus:ring-1 focus:ring-[#6B4C9A]/20"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-semibold uppercase tracking-wide text-[#1A1A1A]/50">
                            Unité
                          </label>
                          <input
                            type="text"
                            value={item.unit ?? ''}
                            onChange={(e) => updatePriceItem(idx, { unit: e.target.value })}
                            placeholder="forfait, à l'heure, m²…"
                            maxLength={20}
                            className="mt-0.5 w-full rounded-lg border border-[#EAE5DC] bg-white px-2.5 py-1.5 text-sm focus:border-[#6B4C9A] focus:outline-none focus:ring-1 focus:ring-[#6B4C9A]/20"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Bouton supprimer */}
                    <button
                      type="button"
                      onClick={() => removePriceItem(idx)}
                      disabled={savingPriceGrid}
                      className="shrink-0 rounded-lg p-1.5 text-[#DC2626] transition hover:bg-[#DC2626]/8 disabled:opacity-40"
                      aria-label={`Supprimer la prestation ${idx + 1}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={addPriceItem}
                disabled={savingPriceGrid || priceItems.length >= 10}
                className="border-[#6B4C9A]/30 text-[#6B4C9A] hover:bg-[#6B4C9A]/5"
              >
                <Plus className="mr-1 h-3.5 w-3.5" /> Ajouter une prestation
              </Button>
              <span className="ml-auto text-[10px] text-[#1A1A1A]/40">
                {priceItems.length}/10
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setEditingPriceGrid(null)}
                disabled={savingPriceGrid}
                className="border-[#EAE5DC]"
              >
                Annuler
              </Button>
              <Button
                size="sm"
                onClick={handleSavePriceGrid}
                disabled={savingPriceGrid}
                className="gap-1.5 rounded-lg bg-[#6B4C9A] text-white hover:bg-[#583e82]"
              >
                {savingPriceGrid ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Tag className="h-3.5 w-3.5" />
                )}
                {savingPriceGrid ? 'Enregistrement…' : 'Enregistrer la grille'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ---------- Modal : configuration de la bannière commerce ---------- */}
      {bannerBusiness && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => !savingBanner && setBannerBusiness(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-[#1A1A1A]" style={SERIF}>
                  Configurer la bannière
                </h3>
                <p className="text-xs text-[#1A1A1A]/55">
                  {bannerBusiness.name} · {bannerBusiness.trade}
                </p>
              </div>
              <button
                type="button"
                onClick={() => !savingBanner && setBannerBusiness(null)}
                className="text-[#1A1A1A]/40 hover:text-[#1A1A1A]"
                aria-label="Fermer"
                disabled={savingBanner}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="mb-3 text-xs text-[#1A1A1A]/60">
              La bannière s&apos;affiche en haut de la fiche commerce/restaurant
              (vue citoyenne). Texte court et percutant conseillé.
            </p>
            <div className="space-y-4">
              {/* Texte de la bannière */}
              <div>
                <label className="block text-xs font-semibold text-[#1A1A1A]/60">
                  Texte de la bannière
                </label>
                <textarea
                  value={bannerForm.offerText}
                  onChange={(e) =>
                    setBannerForm((f) => ({ ...f, offerText: e.target.value }))
                  }
                  placeholder="ex : -15% sur tous nos plats ce midi !"
                  maxLength={200}
                  rows={3}
                  disabled={savingBanner}
                  className="mt-1 w-full rounded-xl border border-[#EAE5DC] bg-[#FAFAF7] px-3 py-2 text-sm focus:border-[#F97316] focus:outline-none focus:ring-2 focus:ring-[#F97316]/15 disabled:opacity-60"
                />
                <p className="mt-1 text-[10px] text-[#1A1A1A]/40">
                  {bannerForm.offerText.length}/200 caractères · stocké comme offre
                  promo (offerText)
                </p>
              </div>
              {/* Toggle bannière active */}
              <div className="rounded-xl border border-[#EAE5DC] bg-[#FAFAF7] p-3">
                <label className="flex cursor-pointer items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[#1A1A1A]">
                      Bannière visible
                    </p>
                    <p className="text-[11px] text-[#1A1A1A]/55">
                      Active = affichée en haut de la fiche. Inactif = masquée
                      (mais le texte est conservé).
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={bannerForm.active}
                    onClick={() =>
                      setBannerForm((f) => ({ ...f, active: !f.active }))
                    }
                    disabled={savingBanner}
                    className={cn(
                      'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition disabled:opacity-60',
                      bannerForm.active ? 'bg-[#F97316]' : 'bg-[#1A1A1A]/20',
                    )}
                    aria-label="Activer ou désactiver la bannière"
                  >
                    <span
                      className={cn(
                        'inline-block h-4 w-4 transform rounded-full bg-white shadow transition',
                        bannerForm.active ? 'translate-x-6' : 'translate-x-1',
                      )}
                    />
                  </button>
                </label>
              </div>
              {/* Aperçu live */}
              {bannerForm.active && bannerForm.offerText.trim().length > 0 && (
                <div className="rounded-xl border-l-4 border-[#F97316] bg-gradient-to-r from-[#F97316]/8 to-transparent px-3 py-2">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-[#F97316]">
                    Aperçu bannière
                  </p>
                  <p className="mt-0.5 text-sm font-semibold text-[#1A1A1A]">
                    {bannerForm.offerText}
                  </p>
                </div>
              )}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setBannerBusiness(null)}
                disabled={savingBanner}
                className="border-[#EAE5DC]"
              >
                Annuler
              </Button>
              <Button
                size="sm"
                onClick={handleSaveBanner}
                disabled={savingBanner}
                className="gap-1.5 rounded-lg bg-[#F97316] text-white hover:bg-[#EA580C]"
              >
                {savingBanner ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Megaphone className="h-3.5 w-3.5" />
                )}
                {savingBanner
                  ? 'Enregistrement…'
                  : bannerForm.active
                    ? 'Activer la bannière'
                    : 'Désactiver la bannière'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------
// BusinessCard — carte shared pour pending + approved
// ---------------------------------------------------------------

function BusinessCard({
  business: b,
  mode,
  onApprove,
  onReject,
  onTogglePremium,
  onOpenSponsor,
  onDeactivateSponsor,
  onOpenBanner,
  onViewMenu,
  onViewPriceGrid,
  onEditMenu,
  onEditPriceGrid,
  onSuspend,
  onBlock,
  onUnblock,
  onDelete,
}: {
  business: CityBusiness
  mode: 'pending' | 'approved'
  onApprove?: () => void
  onReject?: () => void
  onTogglePremium?: () => void
  onOpenSponsor?: () => void
  onDeactivateSponsor?: () => void
  onOpenBanner?: () => void
  onViewMenu?: () => void
  onViewPriceGrid?: () => void
  onEditMenu?: () => void
  onEditPriceGrid?: () => void
  onSuspend?: () => void
  onBlock?: () => void
  onUnblock?: () => void
  onDelete?: () => void
}) {
  const [pending, setPending] = useState(false)
  const [photoOpen, setPhotoOpen] = useState(false)

  const handleAction = (fn: (() => void) | undefined) => {
    if (!fn || pending) return
    setPending(true)
    fn()
    setTimeout(() => setPending(false), 400)
  }

  // Détermine si la carte doit afficher le bouton d'édition du menu (restaurant
  // premium) ou de la grille tarifaire (artisan premium non-restaurant).
  const isRestaurant = (b.category ?? '').toLowerCase() === 'restaurant'
  const canEditMenu = mode === 'approved' && b.isPremium && isRestaurant
  const canEditPriceGrid = mode === 'approved' && b.isPremium && !isRestaurant

  return (
    <article
      className={cn(
        'overflow-hidden rounded-2xl border bg-white shadow-sm transition-shadow hover:shadow-md',
        mode === 'pending' ? 'border-[#F97316]/30' : 'border-[#EAE5DC]',
      )}
      style={{ borderTop: mode === 'pending' ? '3px solid #F97316' : '3px solid #059669' }}
    >
      <div className="p-4">
        {/* Header : photo + nom + métier */}
        <div className="mb-3 flex items-start gap-3">
          {b.photoUrl ? (
            <button
              type="button"
              onClick={() => setPhotoOpen(true)}
              className="group relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-[#EAE5DC] transition hover:border-[#FFD700] hover:shadow-md"
              aria-label={`Agrandir la photo de ${b.name}`}
              title="Cliquez pour agrandir"
            >
              <img
                src={b.photoUrl}
                alt={`Photo de ${b.name}`}
                className="h-full w-full object-cover"
                loading="lazy"
              />
            </button>
          ) : (
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-[#FFD700]/15 text-xl font-bold text-[#B8964F]">
              {b.name.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-[#1A1A1A]">{b.name}</p>
            <p className="truncate text-xs text-[#1A1A1A]/60">{b.trade}</p>
            {b.category && (
              <Badge className="mt-1 bg-[#EAE5DC] text-[10px] text-[#1A1A1A]/70">
                {b.category}
              </Badge>
            )}
          </div>
        </div>

        {/* Infos : téléphone, quartier, adresse */}
        <div className="space-y-1.5 border-t border-[#EAE5DC] pt-3 text-xs">
          {b.phone && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-[#1A1A1A]/50">Téléphone</span>
              <a
                href={`tel:${b.phone.replace(/\s/g, '')}`}
                className="inline-flex items-center gap-1 font-medium text-[#059669] hover:underline"
              >
                <Phone className="h-3 w-3" />
                {b.phone}
              </a>
            </div>
          )}
          {b.district && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-[#1A1A1A]/50">Quartier</span>
              <span className="flex items-center gap-1 font-medium text-[#1A1A1A]">
                <MapPin className="h-3 w-3" />
                {b.district}
              </span>
            </div>
          )}
          {b.address && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-[#1A1A1A]/50">Adresse</span>
              <span className="truncate font-medium text-[#1A1A1A]">{b.address}</span>
            </div>
          )}
          <div className="flex items-center justify-between gap-2">
            <span className="text-[#1A1A1A]/50">Soumis</span>
            <span className="font-medium text-[#1A1A1A]">{timeAgo(b.createdAt)}</span>
          </div>
        </div>

        {/* Badges premium / sponsorisé (mode approved uniquement) */}
        {mode === 'approved' && (b.isPremium || b.isSponsored || b.active === false) && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {b.active === false && (
              <Badge className="bg-[#DC2626]/12 text-[10px] text-[#DC2626]">
                <X className="mr-0.5 h-2.5 w-2.5" /> Bloqué
              </Badge>
            )}
            {b.isPremium && (
              <Badge className="bg-[#FFD700]/15 text-[10px] text-[#B8964F]">
                <Star className="mr-0.5 h-2.5 w-2.5 fill-[#FFD700]" /> Premium
              </Badge>
            )}
            {b.isSponsored && (
              <Badge className="bg-[#F97316]/12 text-[10px] text-[#F97316]">
                <Megaphone className="mr-0.5 h-2.5 w-2.5" /> Sponsorisé
              </Badge>
            )}
            {b.offerText && b.isSponsored && (
              <span className="ml-auto line-clamp-1 text-[10px] italic text-[#F97316]">
                « {b.offerText} »
              </span>
            )}
          </div>
        )}

        {/* Boutons d'action selon mode */}
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[#EAE5DC] pt-3">
          {mode === 'pending' && (
            <>
              <Button
                size="sm"
                onClick={() => handleAction(onApprove)}
                disabled={pending}
                className="gap-1.5 rounded-lg bg-[#059669] text-white hover:bg-[#047857]"
              >
                {pending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Check className="h-3.5 w-3.5" />
                )}
                Approuver
              </Button>
              <Button
                size="sm"
                onClick={() => handleAction(onReject)}
                disabled={pending}
                className="gap-1.5 rounded-lg bg-[#DC2626] text-white hover:bg-[#B91C1C]"
              >
                <X className="h-3.5 w-3.5" />
                Rejeter
              </Button>
            </>
          )}
          {mode === 'approved' && (
            <>
              <Button
                size="sm"
                onClick={() => handleAction(onTogglePremium)}
                className={cn(
                  'gap-1.5 rounded-lg',
                  b.isPremium
                    ? 'bg-[#FFD700]/15 text-[#B8964F] hover:bg-[#FFD700]/25'
                    : 'bg-[#FFD700] text-[#1A1A1A] hover:bg-[#B8964F]',
                )}
              >
                <Star className={cn('h-3.5 w-3.5', b.isPremium && 'fill-[#FFD700]')} />
                {b.isPremium ? 'Désactiver Premium' : 'Activer Premium'}
              </Button>
              {/* Bannière : ouvre le formulaire dédié (texte + toggle actif).
                  Stocké via offerText + isSponsored côté API. */}
              <Button
                size="sm"
                onClick={() => handleAction(onOpenBanner)}
                className={cn(
                  'gap-1.5 rounded-lg',
                  b.isSponsored
                    ? 'bg-[#F97316]/15 text-[#F97316] hover:bg-[#F97316]/25'
                    : 'bg-[#F97316] text-white hover:bg-[#EA580C]',
                )}
                aria-label={`Configurer la bannière de ${b.name}`}
                title="Configurer la bannière promo"
              >
                <Megaphone className="h-3.5 w-3.5" />
                {b.isSponsored ? 'Bannière ON' : 'Bannière'}
              </Button>
              {b.isSponsored ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleAction(onDeactivateSponsor)}
                  className="border-[#F97316]/30 text-[#F97316] hover:bg-[#F97316]/5"
                >
                  Arrêter sponsoring
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleAction(onOpenSponsor)}
                  className="border-[#F97316]/30 text-[#F97316] hover:bg-[#F97316]/5"
                >
                  <Megaphone className="mr-1 h-3.5 w-3.5" /> Sponsoriser
                </Button>
              )}
              {(b.menu ?? []).length > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={onViewMenu}
                  className="border-[#0026A3]/30 text-[#0026A3] hover:bg-[#0026A3]/5"
                >
                  <Utensils className="mr-1 h-3.5 w-3.5" /> Menu ({(b.menu ?? []).length})
                </Button>
              )}
              {(b.priceGrid ?? []).length > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={onViewPriceGrid}
                  className="border-[#6B4C9A]/30 text-[#6B4C9A] hover:bg-[#6B4C9A]/5"
                >
                  <Tag className="mr-1 h-3.5 w-3.5" /> Tarifs ({(b.priceGrid ?? []).length})
                </Button>
              )}
              {/* Bouton d'édition (commerce premium) : menu pour les
                  restaurants, grille tarifaire pour les autres catégories. */}
              {canEditMenu && (
                <Button
                  size="sm"
                  onClick={() => handleAction(onEditMenu)}
                  className="gap-1.5 rounded-lg bg-[#0026A3] text-white hover:bg-[#1E40AF]"
                  aria-label={`Éditer le menu de ${b.name}`}
                >
                  <Utensils className="h-3.5 w-3.5" />
                  {(b.menu ?? []).length > 0 ? 'Éditer le menu' : 'Créer le menu'}
                </Button>
              )}
              {canEditPriceGrid && (
                <Button
                  size="sm"
                  onClick={() => handleAction(onEditPriceGrid)}
                  className="gap-1.5 rounded-lg bg-[#6B4C9A] text-white hover:bg-[#583e82]"
                  aria-label={`Éditer la grille tarifaire de ${b.name}`}
                >
                  <Tag className="h-3.5 w-3.5" />
                  {(b.priceGrid ?? []).length > 0 ? 'Éditer la grille' : 'Créer la grille'}
                </Button>
              )}

              {/* --- Modération : Suspendre / Bloquer / Supprimer ---
                  Trois actions admin distinctes :
                  • Suspendre (orange) → masque le commerce côté citoyen (status=rejected)
                  • Bloquer (rouge outline) → bloque toute activité (active=false)
                  • Supprimer (rouge plein) → DELETE définitif
                  Le bouton « Bloquer » devient « Débloquer » quand active=false. */}
              <Button
                size="sm"
                onClick={() => handleAction(onSuspend)}
                disabled={pending}
                className="gap-1.5 rounded-lg bg-[#F97316] text-white hover:bg-[#EA580C]"
                aria-label={`Suspendre ${b.name}`}
                title="Masquer ce commerce côté citoyen (statut rejected)"
              >
                <Clock className="h-3.5 w-3.5" />
                Suspendre
              </Button>
              {b.active === false ? (
                <Button
                  size="sm"
                  onClick={() => handleAction(onUnblock)}
                  disabled={pending}
                  className="gap-1.5 rounded-lg border-[#059669]/40 text-[#059669] hover:bg-[#059669]/10"
                  aria-label={`Débloquer ${b.name}`}
                  title="Réactiver l'activité du commerce"
                >
                  <Check className="h-3.5 w-3.5" />
                  Débloquer
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={() => handleAction(onBlock)}
                  disabled={pending}
                  variant="outline"
                  className="gap-1.5 rounded-lg border-[#DC2626]/40 text-[#DC2626] hover:bg-[#DC2626]/5"
                  aria-label={`Bloquer ${b.name}`}
                  title="Bloquer toute activité (appels, messages, commandes)"
                >
                  <X className="h-3.5 w-3.5" />
                  Bloquer
                </Button>
              )}
              <Button
                size="sm"
                onClick={() => handleAction(onDelete)}
                disabled={pending}
                className="gap-1.5 rounded-lg bg-[#DC2626] text-white hover:bg-[#B91C1C]"
                aria-label={`Supprimer définitivement ${b.name}`}
                title="Suppression définitive (irréversible)"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Supprimer
              </Button>
            </>
          )}
          <span className="ml-auto text-[10px] text-[#1A1A1A]/40">
            ID {b.id.slice(-6)}
          </span>
        </div>
      </div>

      {photoOpen && b.photoUrl && (
        <PhotoLightbox
          src={b.photoUrl}
          caption={`Photo — ${b.name}`}
          onClose={() => setPhotoOpen(false)}
        />
      )}
    </article>
  )
}

// ============================================================
// TaxReportsView — Signalements fiscaux citoyens (avec analyse IA)
// ------------------------------------------------------------
// Fetch GET /api/city/tax-reports
// Pour chaque signalement :
//   - photo thumbnail (cliquable → lightbox)
//   - aiAnalysis (JSON parsé) → depositType badge, vehiclePlate,
//     description IA, indicateur de confiance
//   - badges de statut (reported → verified → tax_collected → rewarded)
//   - infos récompense (montant, méthode)
//   - boutons d'action selon statut :
//        reported      → "Valider" (PATCH status=verified)
//        verified      → "Encaisser" (PATCH status=tax_collected)
//        tax_collected → "Récompenser" (PATCH status=rewarded)
// ============================================================

function parseAiAnalysis(raw: string | null): TaxReportAiAnalysis | null {
  if (!raw || typeof raw !== 'string') return null
  try {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object') {
      return {
        depositType: typeof parsed.depositType === 'string' ? parsed.depositType : undefined,
        hasVehicle: typeof parsed.hasVehicle === 'boolean' ? parsed.hasVehicle : undefined,
        vehiclePlate:
          typeof parsed.vehiclePlate === 'string' ? parsed.vehiclePlate : null,
        description:
          typeof parsed.description === 'string' ? parsed.description : null,
        confidence:
          typeof parsed.confidence === 'number' ? parsed.confidence : undefined,
      }
    }
  } catch {
    /* JSON mal formé */
  }
  return null
}

/** Couleur du badge selon le depositType détecté par l'IA. */
function depositTypeColor(type: string | undefined): { bg: string; color: string; label: string } {
  if (!type) return { bg: 'bg-[#EAE5DC]', color: '#1A1A1A', label: 'Inconnu' }
  const t = type.toLowerCase()
  if (t.includes('dump') || t.includes('décharge') || t.includes('decharge')) {
    return { bg: 'bg-[#F97316]/12 text-[#F97316]', color: COLOR_ORANGE, label: 'Dump sauvage' }
  }
  if (t.includes('vehicle') || t.includes('véhicule') || t.includes('vehicule') || t.includes('camion')) {
    return { bg: 'bg-[#DC2626]/12 text-[#DC2626]', color: COLOR_RED, label: 'Véhicule' }
  }
  if (t.includes('container') || t.includes('conteneur')) {
    return { bg: 'bg-[#6B4C9A]/12 text-[#6B4C9A]', color: COLOR_PURPLE, label: 'Conteneur' }
  }
  if (t.includes('construction') || t.includes('chantier')) {
    return { bg: 'bg-[#B8964F]/12 text-[#B8964F]', color: '#B8964F', label: 'Chantier' }
  }
  return { bg: 'bg-[#EAE5DC]', color: '#1A1A1A', label: type }
}

function taxReportStatusInfo(status: string): { label: string; bg: string; color: string } {
  switch (status) {
    case 'reported':
      return { label: 'Signalé', bg: 'bg-[#F97316]/12 text-[#F97316]', color: COLOR_ORANGE }
    case 'verified':
      return { label: 'Vérifié', bg: 'bg-[#0026A3]/12 text-[#0026A3]', color: COLOR_BLUE }
    case 'tax_collected':
      return { label: 'Taxe encaissée', bg: 'bg-[#059669]/12 text-[#059669]', color: COLOR_GREEN }
    case 'rewarded':
      return { label: 'Récompensé', bg: 'bg-[#FFD700]/15 text-[#B8964F]', color: COLOR_GOLD }
    default:
      return { label: status, bg: 'bg-[#EAE5DC] text-[#1A1A1A]', color: COLOR_ANTHRACITE }
  }
}

function rewardMethodLabel(method: string | null): string {
  if (!method) return '—'
  switch (method) {
    case 'wave':
      return 'Wave'
    case 'orange_money':
      return 'Orange Money'
    case 'internet_pass':
      return 'Pass Internet'
    case 'points':
      return 'Points fidélité'
    default:
      return method
  }
}

function TaxReportsView() {
  const { toast } = useToast()
  const SERIF = { fontFamily: 'Georgia, "Playfair Display", serif' } as const

  const [reports, setReports] = useState<CityTaxReport[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  // Pour le dialogue de récompense
  const [rewardTarget, setRewardTarget] = useState<CityTaxReport | null>(null)
  const [rewardForm, setRewardForm] = useState({ rewardMethod: 'wave', citizenPhone: '' })
  const [savingReward, setSavingReward] = useState(false)

  const fetchReports = useCallback(async () => {
    try {
      const res = await fetch('/api/city/tax-reports', { cache: 'no-store' })
      const json = await res.json()
      if (json?.ok && Array.isArray(json.data?.reports)) {
        setReports(json.data.reports)
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchReports()
  }, [fetchReports])

  const patchReport = useCallback(
    async (id: string, patch: Record<string, unknown>, successMsg: string) => {
      try {
        const res = await fetch(`/api/city/tax-reports/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch),
        })
        const json = await res.json()
        if (json?.ok) {
          toast({ title: successMsg })
          await fetchReports()
        } else {
          toast({
            title: 'Erreur',
            description: json?.error ?? 'Mise à jour impossible',
            variant: 'destructive',
          })
        }
      } catch {
        toast({ title: 'Erreur réseau', variant: 'destructive' })
      }
    },
    [fetchReports, toast],
  )

  const filtered = useMemo(() => {
    return reports.filter((r) => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false
      if (search.trim()) {
        const q = search.trim().toLowerCase()
        const ai = parseAiAnalysis(r.aiAnalysis)
        const hay = `${r.vehiclePlate ?? ''} ${r.description ?? ''} ${r.plate?.plateNumber ?? ''} ${r.plate?.label ?? ''} ${r.plate?.district ?? ''} ${ai?.vehiclePlate ?? ''} ${ai?.description ?? ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [reports, statusFilter, search])

  const counts = useMemo(
    () => ({
      all: reports.length,
      reported: reports.filter((r) => r.status === 'reported').length,
      verified: reports.filter((r) => r.status === 'verified').length,
      tax_collected: reports.filter((r) => r.status === 'tax_collected').length,
      rewarded: reports.filter((r) => r.status === 'rewarded').length,
    }),
    [reports],
  )

  // Total des taxes encaissées et récompenses versées
  const totals = useMemo(
    () => ({
      taxes: reports.reduce((s, r) => s + (r.taxAmount ?? 0), 0),
      rewards: reports.reduce((s, r) => s + (r.rewardAmount ?? 0), 0),
    }),
    [reports],
  )

  const handleValidate = (r: CityTaxReport) =>
    patchReport(r.id, { status: 'verified' }, `Signalement vérifié — ${r.id.slice(-6)}`)

  const handleCollect = (r: CityTaxReport) =>
    patchReport(
      r.id,
      { status: 'tax_collected', taxAmount: 25000 },
      `Taxe encaissée — 25 000 FCFA`,
    )

  const openRewardDialog = (r: CityTaxReport) => {
    setRewardTarget(r)
    setRewardForm({
      rewardMethod: r.rewardMethod ?? 'wave',
      citizenPhone: r.citizenPhone ?? '',
    })
  }

  const handleSaveReward = async () => {
    if (!rewardTarget) return
    if (rewardForm.citizenPhone.trim().length < 6) {
      toast({
        title: 'Téléphone requis',
        description: 'Le numéro du citoyen est obligatoire pour la récompense.',
        variant: 'destructive',
      })
      return
    }
    setSavingReward(true)
    await patchReport(
      rewardTarget.id,
      {
        status: 'rewarded',
        rewardMethod: rewardForm.rewardMethod,
        citizenPhone: rewardForm.citizenPhone.trim(),
      },
      `Récompense envoyée au citoyen`,
    )
    setSavingReward(false)
    setRewardTarget(null)
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-[#0026A3]" style={SERIF}>
            Rapports fiscaux citoyens
          </h2>
          <p className="text-xs text-[#1A1A1A]/55">
            {counts.all} signalements · {totals.taxes.toLocaleString('fr-FR')} FCFA encaissés · {totals.rewards.toLocaleString('fr-FR')} FCFA récompensés
          </p>
        </div>
        <Badge className="bg-[#6B4C9A]/12 text-[#6B4C9A]">
          <FileBarChart className="mr-1 h-3 w-3" /> {counts.all} rapports
        </Badge>
      </div>

      {/* Filtres statut */}
      <div className="flex flex-wrap gap-2 text-xs">
        {[
          { key: 'all', label: 'Tous', value: counts.all, color: 'bg-[#EAE5DC] text-[#1A1A1A]' },
          { key: 'reported', label: 'Signalés', value: counts.reported, color: 'bg-[#F97316]/12 text-[#F97316]' },
          { key: 'verified', label: 'Vérifiés', value: counts.verified, color: 'bg-[#0026A3]/12 text-[#0026A3]' },
          { key: 'tax_collected', label: 'Encaissés', value: counts.tax_collected, color: 'bg-[#059669]/12 text-[#059669]' },
          { key: 'rewarded', label: 'Récompensés', value: counts.rewarded, color: 'bg-[#FFD700]/15 text-[#B8964F]' },
        ].map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => setStatusFilter(s.key)}
            className={cn(
              'rounded-lg px-3 py-1.5 font-medium transition',
              s.color,
              statusFilter === s.key && 'ring-2 ring-[#FFD700]',
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
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher par plaque, véhicule, description, quartier…"
          className="w-full rounded-xl border border-[#EAE5DC] bg-white py-2.5 pl-10 pr-4 text-sm text-[#1A1A1A] placeholder:text-[#1A1A1A]/40 focus:border-[#FFD700] focus:outline-none focus:ring-2 focus:ring-[#FFD700]/20"
        />
      </div>

      {/* Liste */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-[#FFD700]" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#EAE5DC] bg-white p-12 text-center">
          <FileBarChart className="mx-auto mb-3 h-8 w-8 text-[#1A1A1A]/20" />
          <p className="text-sm font-medium text-[#1A1A1A]/60">
            Aucun rapport fiscal pour le moment
          </p>
          <p className="mt-1 text-xs text-[#1A1A1A]/40">
            Les signalements citoyens de fraude fiscale apparaîtront ici.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((r) => (
            <TaxReportCard
              key={r.id}
              report={r}
              onValidate={() => handleValidate(r)}
              onCollect={() => handleCollect(r)}
              onReward={() => openRewardDialog(r)}
            />
          ))}
        </div>
      )}

      {/* ---------- Modal : formulaire récompense ---------- */}
      {rewardTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setRewardTarget(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-[#1A1A1A]" style={SERIF}>
                  Récompenser le citoyen
                </h3>
                <p className="text-xs text-[#1A1A1A]/55">
                  Signalement #{rewardTarget.id.slice(-6)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setRewardTarget(null)}
                className="text-[#1A1A1A]/40 hover:text-[#1A1A1A]"
                aria-label="Fermer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mb-4 rounded-xl bg-[#FFD700]/8 p-3">
              <p className="text-xs font-medium text-[#B8964F]">
                Montant de la récompense (calculé automatiquement) :
              </p>
              <p className="text-xl font-bold tabular-nums text-[#FFD700]" style={SERIF}>
                {(rewardTarget.vehiclePlate && rewardTarget.vehiclePlate.trim().length > 0
                  ? 1000
                  : 500
                ).toLocaleString('fr-FR')}{' '}
                FCFA
              </p>
              <p className="mt-1 text-[10px] text-[#1A1A1A]/55">
                {rewardTarget.vehiclePlate
                  ? '1000 FCFA — véhicule identifié par plaque'
                  : '500 FCFA — dump sauvage (sans plaque)'}
              </p>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-[#1A1A1A]/60">
                  Méthode de récompense
                </label>
                <select
                  value={rewardForm.rewardMethod}
                  onChange={(e) => setRewardForm((f) => ({ ...f, rewardMethod: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-[#EAE5DC] bg-[#FAFAF7] px-3 py-2 text-sm focus:border-[#FFD700] focus:outline-none focus:ring-2 focus:ring-[#FFD700]/15"
                >
                  <option value="wave">Wave</option>
                  <option value="orange_money">Orange Money</option>
                  <option value="internet_pass">Pass Internet</option>
                  <option value="points">Points fidélité</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#1A1A1A]/60">
                  Téléphone citoyen *
                </label>
                <input
                  type="tel"
                  value={rewardForm.citizenPhone}
                  onChange={(e) => setRewardForm((f) => ({ ...f, citizenPhone: e.target.value }))}
                  placeholder="+221 77 000 00 00"
                  className="mt-1 w-full rounded-xl border border-[#EAE5DC] bg-[#FAFAF7] px-3 py-2 text-sm focus:border-[#FFD700] focus:outline-none focus:ring-2 focus:ring-[#FFD700]/15"
                />
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setRewardTarget(null)}
                className="border-[#EAE5DC]"
              >
                Annuler
              </Button>
              <Button
                size="sm"
                onClick={handleSaveReward}
                disabled={savingReward}
                className="gap-1.5 rounded-lg bg-[#FFD700] text-[#1A1A1A] hover:bg-[#B8964F]"
              >
                {savingReward ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Star className="h-3.5 w-3.5" />
                )}
                {savingReward ? 'Envoi…' : 'Envoyer la récompense'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------
// TaxReportCard — carte individuelle d'un signalement fiscal
// ---------------------------------------------------------------

function TaxReportCard({
  report: r,
  onValidate,
  onCollect,
  onReward,
}: {
  report: CityTaxReport
  onValidate: () => void
  onCollect: () => void
  onReward: () => void
}) {
  const [pending, setPending] = useState(false)
  const [photoOpen, setPhotoOpen] = useState(false)
  const status = taxReportStatusInfo(r.status)
  const ai = parseAiAnalysis(r.aiAnalysis)
  const deposit = depositTypeColor(ai?.depositType)

  const handleAction = (fn: () => void) => {
    if (pending) return
    setPending(true)
    fn()
    setTimeout(() => setPending(false), 400)
  }

  return (
    <article
      className="overflow-hidden rounded-2xl border border-[#EAE5DC] bg-white shadow-sm transition-shadow hover:shadow-md"
      style={{ borderTop: `3px solid ${status.color}` }}
    >
      <div className="p-4">
        {/* Header : photo + statut */}
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            {r.photoUrl ? (
              <button
                type="button"
                onClick={() => setPhotoOpen(true)}
                className="group relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-[#EAE5DC] transition hover:border-[#FFD700] hover:shadow-md"
                aria-label="Agrandir la photo du signalement"
                title="Cliquez pour agrandir"
              >
                <img
                  src={r.photoUrl}
                  alt="Photo du signalement fiscal"
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              </button>
            ) : (
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-[#6B4C9A]/12 text-[#6B4C9A]">
                <FileBarChart className="h-6 w-6" />
              </div>
            )}
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-[#1A1A1A]">
                Signalement #{r.id.slice(-6)}
              </p>
              <p className="text-[10px] uppercase tracking-wider text-[#1A1A1A]/45">
                {formatDateTime(r.createdAt)}
              </p>
              {r.plate && (
                <p className="mt-0.5 truncate text-[11px] text-[#1A1A1A]/55">
                  <MapPin className="mr-0.5 inline h-3 w-3" />
                  {r.plate.plateNumber}
                  {r.plate.district ? ` · ${r.plate.district}` : ''}
                </p>
              )}
            </div>
          </div>
          <Badge className={cn('text-[10px] font-semibold', status.bg)}>
            {status.label}
          </Badge>
        </div>

        {/* Description citoyenne (si fournie) */}
        {r.description && (
          <p className="mb-3 line-clamp-2 rounded-lg bg-[#FAFAF7] px-3 py-2 text-xs leading-relaxed text-[#1A1A1A]/75">
            « {r.description} »
          </p>
        )}

        {/* Bloc analyse IA */}
        {ai && (
          <div className="mb-3 rounded-xl border border-[#6B4C9A]/20 bg-[#6B4C9A]/5 p-3">
            <div className="mb-2 flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-[#6B4C9A]" />
              <p className="text-[10px] font-bold uppercase tracking-wider text-[#6B4C9A]">
                Analyse IA
              </p>
              {typeof ai.confidence === 'number' && (
                <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-[#6B4C9A]">
                  Confiance : {Math.round(ai.confidence * 100)}%
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {/* Deposit type badge */}
              <Badge className={cn('text-[10px]', deposit.bg)}>{deposit.label}</Badge>
              {/* Vehicle plate (si détecté) */}
              {(ai.vehiclePlate || r.vehiclePlate) && (
                <Badge className="bg-[#DC2626]/12 text-[10px] font-mono text-[#DC2626]">
                  🚛 {ai.vehiclePlate ?? r.vehiclePlate}
                </Badge>
              )}
              {ai.hasVehicle === false && !ai.vehiclePlate && !r.vehiclePlate && (
                <Badge className="bg-[#EAE5DC] text-[10px] text-[#1A1A1A]/60">
                  Pas de véhicule
                </Badge>
              )}
            </div>
            {ai.description && (
              <p className="mt-2 line-clamp-3 text-xs italic text-[#1A1A1A]/65">
                « {ai.description} »
              </p>
            )}
            {/* Indicateur visuel de confiance (barre) */}
            {typeof ai.confidence === 'number' && (
              <div className="mt-2 flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#EAE5DC]">
                  <div
                    className="h-full rounded-full bg-[#6B4C9A]"
                    style={{ width: `${Math.max(5, Math.round(ai.confidence * 100))}%` }}
                  />
                </div>
                <span className="text-[10px] font-bold tabular-nums text-[#6B4C9A]">
                  {Math.round(ai.confidence * 100)}%
                </span>
              </div>
            )}
          </div>
        )}

        {/* Infos GPS / plaque / véhicule */}
        <div className="space-y-1.5 border-t border-[#EAE5DC] pt-3 text-xs">
          {r.vehiclePlate && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-[#1A1A1A]/50">Véhicule signalé</span>
              <span className="font-mono font-bold text-[#DC2626]">{r.vehiclePlate}</span>
            </div>
          )}
          {r.plate && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-[#1A1A1A]/50">Plaque QR</span>
              <span className="truncate font-medium text-[#1A1A1A]">
                {r.plate.plateNumber}
              </span>
            </div>
          )}
          {r.citizenPhone && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-[#1A1A1A]/50">Citoyen</span>
              <a
                href={`tel:${r.citizenPhone.replace(/\s/g, '')}`}
                className="inline-flex items-center gap-1 font-medium text-[#059669] hover:underline"
              >
                <Phone className="h-3 w-3" />
                {r.citizenPhone}
              </a>
            </div>
          )}
          {r.agentName && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-[#1A1A1A]/50">Agent</span>
              <span className="font-medium text-[#1A1A1A]">{r.agentName}</span>
            </div>
          )}
        </div>

        {/* Infos taxes / récompense (si déjà encaissé/récompensé) */}
        {(r.taxAmount > 0 || r.rewardAmount > 0) && (
          <div className="mt-3 grid grid-cols-2 gap-2 border-t border-[#EAE5DC] pt-3">
            {r.taxAmount > 0 && (
              <div className="rounded-lg bg-[#059669]/8 p-2">
                <p className="text-[9px] font-semibold uppercase tracking-wide text-[#059669]">
                  Taxe encaissée
                </p>
                <p className="text-sm font-bold tabular-nums text-[#059669]">
                  {r.taxAmount.toLocaleString('fr-FR')} FCFA
                </p>
              </div>
            )}
            {r.rewardAmount > 0 && (
              <div className="rounded-lg bg-[#FFD700]/8 p-2">
                <p className="text-[9px] font-semibold uppercase tracking-wide text-[#B8964F]">
                  Récompense ({rewardMethodLabel(r.rewardMethod)})
                </p>
                <p className="text-sm font-bold tabular-nums text-[#B8964F]">
                  {r.rewardAmount.toLocaleString('fr-FR')} FCFA
                </p>
              </div>
            )}
          </div>
        )}

        {/* Boutons d'action selon le statut */}
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[#EAE5DC] pt-3">
          {r.status === 'reported' && (
            <Button
              size="sm"
              onClick={() => handleAction(onValidate)}
              disabled={pending}
              className="gap-1.5 rounded-lg bg-[#0026A3] text-white hover:bg-[#1E40AF]"
            >
              {pending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Check className="h-3.5 w-3.5" />
              )}
              Valider
            </Button>
          )}
          {r.status === 'verified' && (
            <Button
              size="sm"
              onClick={() => handleAction(onCollect)}
              disabled={pending}
              className="gap-1.5 rounded-lg bg-[#059669] text-white hover:bg-[#047857]"
            >
              {pending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Wallet className="h-3.5 w-3.5" />
              )}
              Encaisser
            </Button>
          )}
          {r.status === 'tax_collected' && (
            <Button
              size="sm"
              onClick={() => handleAction(onReward)}
              disabled={pending}
              className="gap-1.5 rounded-lg bg-[#FFD700] text-[#1A1A1A] hover:bg-[#B8964F]"
            >
              {pending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Star className="h-3.5 w-3.5" />
              )}
              Récompenser
            </Button>
          )}
          {r.status === 'rewarded' && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#FFD700]/12 px-3 py-1 text-[11px] font-bold text-[#B8964F]">
              <Check className="h-3.5 w-3.5" />
              Récompense envoyée
              {r.rewardedAt && (
                <span className="font-normal text-[#B8964F]/70">
                  · {timeAgo(r.rewardedAt)}
                </span>
              )}
            </span>
          )}
        </div>
      </div>

      {photoOpen && r.photoUrl && (
        <PhotoLightbox
          src={r.photoUrl}
          caption={`Signalement #${r.id.slice(-6)}`}
          onClose={() => setPhotoOpen(false)}
        />
      )}
    </article>
  )
}

// ---------------------------------------------------------------
// MairieDynamicView — Services + horaires + annonces (éditable, localStorage)
// ---------------------------------------------------------------
// Les services municipaux, les horaires d'ouverture et les annonces sont
// persistés en localStorage (clés `city_mairie_services`,
// `city_mairie_hours`, `city_mairie_announcements`). Au premier montage,
// si rien n'est stocké, on initialise avec les valeurs par défaut (mock).
// Chaque section a un bouton « Ajouter » et chaque ligne est éditable /
// supprimable. Les horaires sont éditables champ par champ.
// ---------------------------------------------------------------

type MairieService = {
  id: string
  name: string
  phone: string
  desc: string
  icon: string
}

type MairieHours = {
  day: string
  hours: string
  open: boolean
}

type MairieAnnouncement = {
  id: string
  title: string
  date: string
  time: string
  emoji: string
}

const DEFAULT_MAIRIE_SERVICES: MairieService[] = [
  { id: 'svc-1', name: 'État civil', phone: '+221338230000', desc: 'Naissances, mariages, décès', icon: '📄' },
  { id: 'svc-2', name: 'Permis de construire', phone: '+221338230001', desc: 'Autorisations urbanisme', icon: '🏗️' },
  { id: 'svc-3', name: 'Impôts et taxes', phone: '+221338230002', desc: 'Taxes locales, foncier', icon: '💰' },
  { id: 'svc-4', name: "Carte d'identité", phone: '+221338230003', desc: 'Renouvellement CNI', icon: '🪪' },
]

const DEFAULT_MAIRIE_HOURS: MairieHours[] = [
  { day: 'Lundi', hours: '8h00 - 16h00', open: true },
  { day: 'Mardi', hours: '8h00 - 16h00', open: true },
  { day: 'Mercredi', hours: '8h00 - 16h00', open: true },
  { day: 'Jeudi', hours: '8h00 - 16h00', open: true },
  { day: 'Vendredi', hours: '8h00 - 16h00', open: true },
  { day: 'Samedi', hours: '8h00 - 12h00', open: true },
  { day: 'Dimanche', hours: 'Fermé', open: false },
]

const DEFAULT_MAIRIE_ANNOUNCEMENTS: MairieAnnouncement[] = [
  { id: 'ann-1', title: 'Collecte des déchets — Plateau & Médina', date: "Aujourd'hui", time: 'Avant 7h', emoji: '🗑️' },
  { id: 'ann-2', title: "Coupure d'eau programmée — Yoff", date: 'Demain', time: '9h - 14h', emoji: '💧' },
  { id: 'ann-3', title: 'Réunion publique — Grand Dakar', date: '15 déc.', time: '16h', emoji: '👥' },
  { id: 'ann-4', title: "Marché de Noël — Place de l'Indépendance", date: '18-23 déc.', time: '10h - 20h', emoji: '🎄' },
]

const EMOJI_CHOICES = ['📄', '🏗️', '💰', '🪪', '🗑️', '💧', '👥', '🎄', '⚡', '🚓', '🏛️', '📋', '📢', '🚧', '🌳']

function genId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

function MairieDynamicView() {
  const { toast } = useToast()
  const [now, setNow] = useState<Date | null>(null)

  // --- États localStorage-backed ---
  const [services, setServices] = useState<MairieService[]>(DEFAULT_MAIRIE_SERVICES)
  const [hours, setHours] = useState<MairieHours[]>(DEFAULT_MAIRIE_HOURS)
  const [announcements, setAnnouncements] = useState<MairieAnnouncement[]>(DEFAULT_MAIRIE_ANNOUNCEMENTS)
  const [hydrated, setHydrated] = useState(false)

  // --- Formulaire d'ajout de service ---
  const [editingServiceId, setEditingServiceId] = useState<string | null>(null)
  const [serviceForm, setServiceForm] = useState({ name: '', phone: '', desc: '', icon: '📄' })
  const [showServiceForm, setShowServiceForm] = useState(false)

  // --- Formulaire d'ajout d'annonce ---
  const [announcementForm, setAnnouncementForm] = useState({ title: '', date: '', time: '', emoji: '📢' })
  const [showAnnouncementForm, setShowAnnouncementForm] = useState(false)

  // --- Hydratation depuis localStorage ---
  useEffect(() => {
    try {
      const s = localStorage.getItem('city_mairie_services')
      if (s) setServices(JSON.parse(s))
      const h = localStorage.getItem('city_mairie_hours')
      if (h) setHours(JSON.parse(h))
      const a = localStorage.getItem('city_mairie_announcements')
      if (a) setAnnouncements(JSON.parse(a))
    } catch {
      /* ignore */
    } finally {
      setHydrated(true)
    }
  }, [])

  // --- Horloge live ---
  useEffect(() => {
    if (!hydrated) return
    const t = setTimeout(() => setNow(new Date()), 0)
    const i = setInterval(() => setNow(new Date()), 30000)
    return () => {
      clearTimeout(t)
      clearInterval(i)
    }
  }, [hydrated])

  // --- Persistance localStorage ---
  const persistServices = useCallback((next: MairieService[]) => {
    setServices(next)
    try {
      localStorage.setItem('city_mairie_services', JSON.stringify(next))
    } catch {
      /* ignore */
    }
  }, [])

  const persistHours = useCallback((next: MairieHours[]) => {
    setHours(next)
    try {
      localStorage.setItem('city_mairie_hours', JSON.stringify(next))
    } catch {
      /* ignore */
    }
  }, [])

  const persistAnnouncements = useCallback((next: MairieAnnouncement[]) => {
    setAnnouncements(next)
    try {
      localStorage.setItem('city_mairie_announcements', JSON.stringify(next))
    } catch {
      /* ignore */
    }
  }, [])

  // --- Ouverture calculée d'après les horaires stockés ---
  const isOpen = useMemo(() => {
    if (!now) return false
    const jsDay = now.getDay() // 0=dim, 1=lun, ..., 6=sam
    // Index dans notre tableau (Lundi=0)
    const idx = jsDay === 0 ? 6 : jsDay - 1
    const row = hours[idx]
    if (!row || !row.open) return false
    if (row.hours.toLowerCase() === 'fermé') return false
    // Extraction HH:MM des horaires "8h00 - 16h00"
    const m = row.hours.match(/(\d{1,2})h?(\d{0,2}).*?(\d{1,2})h?(\d{0,2})/i)
    if (!m) return false
    const startH = parseInt(m[1])
    const startM = m[2] ? parseInt(m[2]) : 0
    const endH = parseInt(m[3])
    const endM = m[4] ? parseInt(m[4]) : 0
    const curMin = now.getHours() * 60 + now.getMinutes()
    return curMin >= startH * 60 + startM && curMin < endH * 60 + endM
  }, [now, hours])

  // --- Handlers services ---
  const openAddService = () => {
    setEditingServiceId(null)
    setServiceForm({ name: '', phone: '', desc: '', icon: '📄' })
    setShowServiceForm(true)
  }

  const openEditService = (svc: MairieService) => {
    setEditingServiceId(svc.id)
    setServiceForm({ name: svc.name, phone: svc.phone, desc: svc.desc, icon: svc.icon })
    setShowServiceForm(true)
  }

  const saveService = () => {
    if (serviceForm.name.trim().length < 2) {
      toast({ title: 'Nom du service requis', variant: 'destructive' })
      return
    }
    if (editingServiceId) {
      const next = services.map((s) =>
        s.id === editingServiceId
          ? {
              ...s,
              name: serviceForm.name.trim(),
              phone: serviceForm.phone.trim(),
              desc: serviceForm.desc.trim(),
              icon: serviceForm.icon,
            }
          : s,
      )
      persistServices(next)
      toast({ title: 'Service mis à jour', description: serviceForm.name.trim() })
    } else {
      const next: MairieService = {
        id: genId('svc'),
        name: serviceForm.name.trim(),
        phone: serviceForm.phone.trim(),
        desc: serviceForm.desc.trim(),
        icon: serviceForm.icon,
      }
      persistServices([...services, next])
      toast({ title: 'Service ajouté', description: next.name })
    }
    setShowServiceForm(false)
  }

  const deleteService = (id: string) => {
    const svc = services.find((s) => s.id === id)
    persistServices(services.filter((s) => s.id !== id))
    toast({ title: 'Service supprimé', description: svc?.name ?? '' })
  }

  // --- Handlers hours ---
  const updateHour = (idx: number, field: keyof MairieHours, value: string | boolean) => {
    const next = hours.map((h, i) => (i === idx ? { ...h, [field]: value } : h))
    persistHours(next)
  }

  // --- Handlers annonces ---
  const addAnnouncement = () => {
    if (announcementForm.title.trim().length < 3) {
      toast({ title: 'Titre requis', variant: 'destructive' })
      return
    }
    const next: MairieAnnouncement = {
      id: genId('ann'),
      title: announcementForm.title.trim(),
      date: announcementForm.date.trim() || 'À définir',
      time: announcementForm.time.trim() || '—',
      emoji: announcementForm.emoji,
    }
    persistAnnouncements([next, ...announcements])
    toast({ title: 'Annonce ajoutée', description: next.title })
    setAnnouncementForm({ title: '', date: '', time: '', emoji: '📢' })
    setShowAnnouncementForm(false)
  }

  const deleteAnnouncement = (id: string) => {
    const ann = announcements.find((a) => a.id === id)
    persistAnnouncements(announcements.filter((a) => a.id !== id))
    toast({ title: 'Annonce supprimée', description: ann?.title ?? '' })
  }

  const SERIF = { fontFamily: 'Georgia, "Playfair Display", serif' } as const

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-[#0026A3]" style={SERIF}>
          Mairie dynamique
        </h2>
        <p className="text-xs text-[#1A1A1A]/55">
          Services municipaux · horaires · annonces — éditable et persisté localement
        </p>
      </div>

      {/* Statut d'ouverture */}
      <div
        className={cn(
          'flex items-center justify-between rounded-2xl border p-5 shadow-sm',
          isOpen
            ? 'border-[#059669]/30 bg-[#059669]/5'
            : 'border-[#DC2626]/30 bg-[#DC2626]/5',
        )}
      >
        <div className="flex items-center gap-3">
          <div
            className={cn(
              'flex h-12 w-12 items-center justify-center rounded-full',
              isOpen ? 'bg-[#059669]/15' : 'bg-[#DC2626]/15',
            )}
          >
            {isOpen ? (
              <Check className="h-6 w-6 text-[#059669]" />
            ) : (
              <X className="h-6 w-6 text-[#DC2626]" />
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
            État calculé d&apos;après les horaires
          </p>
          <p className="text-sm font-semibold text-[#1A1A1A]">
            {isOpen ? 'Actuellement ouvert' : 'Actuellement fermé'}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Horaires éditables */}
        <section className="overflow-hidden rounded-2xl border border-[#EAE5DC] bg-white shadow-sm">
          <div className="flex items-center gap-2 border-b border-[#EAE5DC] border-l-4 border-l-[#FFD700] bg-[#0026A3]/5 px-4 py-3">
            <Clock className="h-4 w-4 text-[#1A1A1A]" />
            <h3 className="text-sm font-bold text-[#0026A3]" style={SERIF}>
              Horaires d&apos;ouverture
            </h3>
            <Badge variant="outline" className="ml-auto border-[#EAE5DC] text-[10px] text-[#1A1A1A]/60">
              éditable
            </Badge>
          </div>
          <div className="divide-y divide-[#EAE5DC]/60">
            {hours.map((row, idx) => (
              <div key={`${row.day}-${idx}`} className="flex items-center gap-2 px-4 py-2.5">
                <span className="w-20 shrink-0 text-sm font-medium text-[#1A1A1A]">
                  {row.day}
                </span>
                <input
                  type="text"
                  value={row.hours}
                  onChange={(e) => updateHour(idx, 'hours', e.target.value)}
                  placeholder="8h00 - 16h00 ou Fermé"
                  className="flex-1 rounded-lg border border-transparent bg-transparent px-2 py-1 text-sm tabular-nums text-[#1A1A1A] hover:border-[#EAE5DC] focus:border-[#FFD700] focus:bg-[#FAFAF7] focus:outline-none focus:ring-1 focus:ring-[#FFD700]/30"
                />
                <button
                  type="button"
                  onClick={() => updateHour(idx, 'open', !row.open)}
                  className={cn(
                    'inline-flex h-6 w-6 items-center justify-center rounded-full transition',
                    row.open
                      ? 'bg-[#059669]/15 text-[#059669]'
                      : 'bg-[#DC2626]/15 text-[#DC2626]',
                  )}
                  aria-label={row.open ? 'Marquer comme fermé' : 'Marquer comme ouvert'}
                  title={row.open ? 'Ouvert (cliquer pour fermer)' : 'Fermé (cliquer pour ouvrir)'}
                >
                  {row.open ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* Services éditables */}
        <section className="overflow-hidden rounded-2xl border border-[#EAE5DC] bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-[#EAE5DC] border-l-4 border-l-[#FFD700] bg-[#0026A3]/5 px-4 py-3">
            <div className="flex items-center gap-2">
              <Landmark className="h-4 w-4 text-[#1A1A1A]" />
              <h3 className="text-sm font-bold text-[#0026A3]" style={SERIF}>
                Services municipaux
              </h3>
            </div>
            <Button
              size="sm"
              onClick={openAddService}
              className="gap-1.5 rounded-lg bg-[#0026A3] text-white hover:bg-[#1E40AF]"
            >
              <Plus className="h-3.5 w-3.5" /> Ajouter un service
            </Button>
          </div>

          {/* Formulaire d'ajout/édition */}
          {showServiceForm && (
            <div className="border-b border-[#EAE5DC] bg-[#FAFAF7] px-4 py-3">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <input
                  type="text"
                  value={serviceForm.name}
                  onChange={(e) => setServiceForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Nom du service *"
                  className="rounded-lg border border-[#EAE5DC] bg-white px-3 py-2 text-sm focus:border-[#FFD700] focus:outline-none"
                />
                <input
                  type="tel"
                  value={serviceForm.phone}
                  onChange={(e) => setServiceForm((f) => ({ ...f, phone: e.target.value }))}
                  placeholder="Téléphone (+221 …)"
                  className="rounded-lg border border-[#EAE5DC] bg-white px-3 py-2 text-sm focus:border-[#FFD700] focus:outline-none"
                />
                <input
                  type="text"
                  value={serviceForm.desc}
                  onChange={(e) => setServiceForm((f) => ({ ...f, desc: e.target.value }))}
                  placeholder="Description courte"
                  className="rounded-lg border border-[#EAE5DC] bg-white px-3 py-2 text-sm focus:border-[#FFD700] focus:outline-none sm:col-span-2"
                />
                <div className="flex flex-wrap gap-1 sm:col-span-2">
                  {EMOJI_CHOICES.map((em) => (
                    <button
                      key={em}
                      type="button"
                      onClick={() => setServiceForm((f) => ({ ...f, icon: em }))}
                      className={cn(
                        'flex h-8 w-8 items-center justify-center rounded-lg text-lg transition',
                        serviceForm.icon === em
                          ? 'bg-[#FFD700]/20 ring-2 ring-[#FFD700]'
                          : 'bg-white hover:bg-[#FAFAF7]',
                      )}
                    >
                      {em}
                    </button>
                  ))}
                </div>
              </div>
              <div className="mt-3 flex justify-end gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowServiceForm(false)}
                  className="border-[#EAE5DC]"
                >
                  Annuler
                </Button>
                <Button
                  size="sm"
                  onClick={saveService}
                  className="bg-[#059669] text-white hover:bg-[#047857]"
                >
                  {editingServiceId ? 'Mettre à jour' : 'Ajouter'}
                </Button>
              </div>
            </div>
          )}

          <div className="divide-y divide-[#EAE5DC]/60">
            {services.length === 0 && (
              <p className="px-4 py-6 text-center text-xs text-[#1A1A1A]/40">
                Aucun service. Cliquez sur « Ajouter un service ».
              </p>
            )}
            {services.map((svc) => (
              <div key={svc.id} className="group flex items-center gap-3 px-4 py-3">
                <span className="text-2xl" aria-hidden>
                  {svc.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-[#1A1A1A]">{svc.name}</p>
                  <p className="truncate text-xs text-[#1A1A1A]/55">{svc.desc}</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <a
                    href={`tel:${svc.phone.replace(/\s/g, '')}`}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#059669]/12 text-[#059669] transition hover:bg-[#059669] hover:text-white"
                    aria-label={`Appeler ${svc.name}`}
                  >
                    <Phone className="h-4 w-4" />
                  </a>
                  <button
                    type="button"
                    onClick={() => openEditService(svc)}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#FFD700]/12 text-[#B8964F] transition hover:bg-[#FFD700] hover:text-white"
                    aria-label={`Modifier ${svc.name}`}
                    title="Modifier"
                  >
                    <Settings className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteService(svc.id)}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#DC2626]/10 text-[#DC2626] transition hover:bg-[#DC2626] hover:text-white"
                    aria-label={`Supprimer ${svc.name}`}
                    title="Supprimer"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Annonces éditables */}
      <section className="overflow-hidden rounded-2xl border border-[#EAE5DC] bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-[#EAE5DC] border-l-4 border-l-[#FFD700] bg-[#0026A3]/5 px-4 py-3">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-[#FFD700]" />
            <h3 className="text-sm font-bold text-[#0026A3]" style={SERIF}>
              Annonces récentes
            </h3>
          </div>
          <Button
            size="sm"
            onClick={() => setShowAnnouncementForm((v) => !v)}
            className="gap-1.5 rounded-lg bg-[#6B4C9A] text-white hover:bg-[#5a3d82]"
          >
            {showAnnouncementForm ? (
              <>
                <X className="h-3.5 w-3.5" /> Annuler
              </>
            ) : (
              <>
                <Plus className="h-3.5 w-3.5" /> Ajouter une annonce
              </>
            )}
          </Button>
        </div>

        {showAnnouncementForm && (
          <div className="border-b border-[#EAE5DC] bg-[#FAFAF7] px-4 py-3">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <input
                type="text"
                value={announcementForm.title}
                onChange={(e) =>
                  setAnnouncementForm((f) => ({ ...f, title: e.target.value }))
                }
                placeholder="Titre de l'annonce *"
                className="rounded-lg border border-[#EAE5DC] bg-white px-3 py-2 text-sm focus:border-[#6B4C9A] focus:outline-none sm:col-span-2"
              />
              <input
                type="text"
                value={announcementForm.date}
                onChange={(e) =>
                  setAnnouncementForm((f) => ({ ...f, date: e.target.value }))
                }
                placeholder="Date (ex : Aujourd'hui, Demain, 15 déc.)"
                className="rounded-lg border border-[#EAE5DC] bg-white px-3 py-2 text-sm focus:border-[#6B4C9A] focus:outline-none"
              />
              <input
                type="text"
                value={announcementForm.time}
                onChange={(e) =>
                  setAnnouncementForm((f) => ({ ...f, time: e.target.value }))
                }
                placeholder="Horaire (ex : 9h - 14h)"
                className="rounded-lg border border-[#EAE5DC] bg-white px-3 py-2 text-sm focus:border-[#6B4C9A] focus:outline-none"
              />
              <div className="flex flex-wrap gap-1 sm:col-span-2">
                {['🗑️', '💧', '👥', '🎄', '⚡', '🚓', '🏛️', '📢', '🚧', '🌳'].map((em) => (
                  <button
                    key={em}
                    type="button"
                    onClick={() => setAnnouncementForm((f) => ({ ...f, emoji: em }))}
                    className={cn(
                      'flex h-8 w-8 items-center justify-center rounded-lg text-lg transition',
                      announcementForm.emoji === em
                        ? 'bg-[#6B4C9A]/15 ring-2 ring-[#6B4C9A]'
                        : 'bg-white hover:bg-[#FAFAF7]',
                    )}
                  >
                    {em}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-3 flex justify-end">
              <Button
                size="sm"
                onClick={addAnnouncement}
                className="bg-[#6B4C9A] text-white hover:bg-[#5a3d82]"
              >
                <Plus className="mr-1 h-3.5 w-3.5" /> Ajouter
              </Button>
            </div>
          </div>
        )}

        <div className="divide-y divide-[#EAE5DC]/60">
          {announcements.length === 0 && (
            <p className="px-4 py-6 text-center text-xs text-[#1A1A1A]/40">
              Aucune annonce. Cliquez sur « Ajouter une annonce ».
            </p>
          )}
          {announcements.map((a) => (
            <div key={a.id} className="group flex items-center gap-3 px-4 py-3">
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
              <button
                type="button"
                onClick={() => deleteAnnouncement(a.id)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#DC2626]/10 text-[#DC2626] transition hover:bg-[#DC2626] hover:text-white"
                aria-label="Supprimer l'annonce"
                title="Supprimer"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
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

const RATE_PER_CONTACT = 5000 // FCFA par mise en relation générée

function RevenueView({
  artisans,
  incidents,
}: {
  artisans: CityArtisan[]
  incidents: CityIncident[]
}) {
  const SERIF = { fontFamily: 'Georgia, "Playfair Display", serif' } as const

  const totalRevenue = useMemo(
    () => artisans.reduce((s, a) => s + a.contactCount * RATE_PER_CONTACT, 0),
    [artisans],
  )

  const displayTotal = totalRevenue
  const mairieShare = Math.round(displayTotal * 0.3)
  const premiumCount = artisans.filter((a) => a.premium).length

  const topArtisans = useMemo(() => {
    return [...artisans]
      .map((a) => ({ ...a, revenue: a.contactCount * RATE_PER_CONTACT }))
      .sort((x, y) => y.revenue - x.revenue)
      .slice(0, 8)
  }, [artisans])

  const maxRevenue = topArtisans[0]?.revenue ?? 1

  // --- Tendance mensuelle réelle : incidents par mois (6 derniers mois) ---
  const monthlyTrend = useMemo(() => {
    const now = new Date()
    const months: { month: string; count: number }[] = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const label = d.toLocaleDateString('fr-FR', { month: 'short' })
      months.push({ month: label, count: 0 })
    }
    const baseYear = now.getFullYear()
    const baseMonth = now.getMonth()
    for (const inc of incidents) {
      const created = new Date(inc.createdAt)
      const diffMonths =
        (baseYear - created.getFullYear()) * 12 +
        (baseMonth - created.getMonth())
      if (diffMonths >= 0 && diffMonths < 6) {
        months[5 - diffMonths].count += 1
      }
    }
    return months
  }, [incidents])
  const maxTrend = Math.max(1, ...monthlyTrend.map((m) => m.count))
  const hasTrendData = monthlyTrend.some((m) => m.count > 0)

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-[#0026A3]" style={SERIF}>
          Revenus artisans
        </h2>
        <p className="text-xs text-[#1A1A1A]/55">
          Monétisation · part mairie · top contributeurs
        </p>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {/* Total */}
        <div className="overflow-hidden rounded-2xl bg-gradient-to-br from-[#1A1A1A] to-[#2C2C2C] p-5 text-white shadow-sm">
          <div className="mb-2 flex items-center gap-2">
            <Wallet className="h-4 w-4 text-[#FFD700]" />
            <p className="text-[11px] font-semibold uppercase tracking-wider text-white/55">
              Revenus totaux
            </p>
          </div>
          <p className="text-3xl font-bold tabular-nums text-[#FFD700]" style={SERIF}>
            {formatFCFA(displayTotal)}
            <span className="ml-1 text-sm font-medium text-white/60">FCFA</span>
          </p>
          <p className="mt-2 text-[10px] text-white/45">Cumul artisans via Aminata</p>
        </div>

        {/* Part mairie */}
        <div className="overflow-hidden rounded-2xl border border-[#FFD700]/30 bg-[#FFD700]/5 p-5 shadow-sm">
          <div className="mb-2 flex items-center gap-2">
            <Building2 className="h-4 w-4 text-[#B8964F]" />
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[#B8964F]">
              Part mairie (30%)
            </p>
          </div>
          <p className="text-3xl font-bold tabular-nums text-[#B8964F]" style={SERIF}>
            {formatFCFA(mairieShare)}
            <span className="ml-1 text-sm font-medium text-[#B8964F]/70">FCFA</span>
          </p>
          <p className="mt-2 text-[10px] text-[#1A1A1A]/50">
            Commission sur chaque mise en relation
          </p>
        </div>

        {/* Premium */}
        <div className="overflow-hidden rounded-2xl border border-[#EAE5DC] bg-white p-5 shadow-sm">
          <div className="mb-2 flex items-center gap-2">
            <Star className="h-4 w-4 text-[#FFD700]" />
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

      {/* Tendance mensuelle — incidents réels par mois (6 derniers mois) */}
      <section className="overflow-hidden rounded-2xl border border-[#EAE5DC] bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-[#059669]" />
            <h3 className="text-sm font-bold text-[#0026A3]" style={SERIF}>
              Tendance mensuelle
            </h3>
          </div>
          <span className="text-[10px] font-medium text-[#1A1A1A]/50">
            incidents par mois
          </span>
        </div>
        {hasTrendData ? (
          <div className="flex h-40 items-end justify-between gap-3 sm:gap-4">
            {monthlyTrend.map((m, i) => {
              const h = (m.count / maxTrend) * 100
              const isLast = i === monthlyTrend.length - 1
              return (
                <div key={m.month} className="flex flex-1 flex-col items-center gap-2">
                  <span className="text-[10px] font-bold tabular-nums text-[#1A1A1A]/70">
                    {m.count}
                  </span>
                  <div className="flex w-full flex-1 items-end">
                    <div
                      className={cn(
                        'w-full rounded-t-md transition-all',
                        isLast ? 'bg-[#FFD700]' : 'bg-[#059669]/70',
                      )}
                      style={{ height: `${h}%` }}
                    />
                  </div>
                  <span className="text-[10px] font-medium text-[#1A1A1A]/55">{m.month}</span>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="flex h-40 items-center justify-center">
            <p className="text-sm font-medium text-[#1A1A1A]/55">
              Données insuffisantes
            </p>
          </div>
        )}
      </section>

      {/* Top artisans */}
      <section className="overflow-hidden rounded-2xl border border-[#EAE5DC] bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-[#EAE5DC] border-l-4 border-l-[#FFD700] bg-[#0026A3]/5 px-4 py-3">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-[#FFD700]" />
            <h3 className="text-sm font-bold text-[#0026A3]" style={SERIF}>
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
                      ? 'bg-[#FFD700] text-[#1A1A1A]'
                      : i === 1
                        ? 'bg-[#EAE5DC] text-[#1A1A1A]'
                        : i === 2
                          ? 'bg-[#D4A574]/30 text-[#B8964F]'
                          : 'bg-[#FAFAF7] text-[#1A1A1A]/50',
                  )}
                >
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-semibold text-[#1A1A1A]">{a.name}</p>
                    {a.premium && <Star className="h-3 w-3 fill-[#FFD700] text-[#FFD700]" />}
                  </div>
                  <p className="truncate text-xs text-[#1A1A1A]/55">
                    {a.trade}
                    {a.district ? ` · ${a.district}` : ''}
                  </p>
                </div>
                <div className="hidden h-2 w-24 overflow-hidden rounded-full bg-[#F2EEE5] sm:block">
                  <div
                    className="h-full rounded-full bg-[#059669]"
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
// PlatesMapView — Carte des plaques avec QR code premium + édition
// ---------------------------------------------------------------
// Pour chaque plaque on affiche :
//   - un aperçu QR code 100x100 (issu de composeQrPremium si disponible,
//     sinon qrServerUrl brut). Clic = ouverture lightbox grand format.
//   - les infos propriétaire (label, district, address, GPS)
//   - un bouton « Modifier » qui ouvre un formulaire inline pour éditer
//     label / district / address / lat / lng. Sauvegarde via PATCH
//     /api/city/plates/{id} puis onRefresh().
// ---------------------------------------------------------------

function PlatesMapView({
  plates,
  incidents,
  composedQrs,
  cityLogoUrl,
  onRefresh,
  onNavigate,
}: {
  plates: CityPlate[]
  incidents: CityIncident[]
  composedQrs: Record<string, string>
  cityLogoUrl: string | null
  onRefresh?: () => Promise<void>
  onNavigate?: (id: string) => void
}) {
  const { toast } = useToast()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  // --- QR code lightbox (image agrandie) ---
  const [zoomQr, setZoomQr] = useState<{ url: string; plate: CityPlate } | null>(null)

  // --- Édition d'une plaque ---
  const [editingPlate, setEditingPlate] = useState<CityPlate | null>(null)
  const [editForm, setEditForm] = useState({
    label: '',
    district: '',
    address: '',
    lat: '',
    lng: '',
  })
  const [savingPlate, setSavingPlate] = useState(false)

  const openEdit = (p: CityPlate) => {
    setEditingPlate(p)
    setEditForm({
      label: p.label === 'Plaque non assignée' ? '' : p.label,
      district: p.district ?? '',
      address: p.address ?? '',
      lat: p.lat != null ? String(p.lat) : '',
      lng: p.lng != null ? String(p.lng) : '',
    })
  }

  const handleSavePlate = async () => {
    if (!editingPlate) return
    setSavingPlate(true)
    try {
      const body: Record<string, unknown> = {
        label: editForm.label.trim() || 'Plaque non assignée',
        district: editForm.district.trim() || null,
        address: editForm.address.trim() || null,
      }
      if (editForm.lat && editForm.lng) {
        const la = parseFloat(editForm.lat)
        const ln = parseFloat(editForm.lng)
        if (!isNaN(la) && !isNaN(ln)) {
          body.lat = la
          body.lng = ln
        }
      }
      const res = await fetch(`/api/city/plates/${editingPlate.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (json?.ok) {
        toast({
          title: 'Plaque mise à jour',
          description: `${editingPlate.plateNumber} → ${editForm.label || 'non assignée'}`,
        })
        setEditingPlate(null)
        if (onRefresh) await onRefresh()
      } else {
        toast({
          title: 'Erreur',
          description: json?.error ?? 'Mise à jour impossible',
          variant: 'destructive',
        })
      }
    } catch {
      toast({ title: 'Erreur réseau', variant: 'destructive' })
    } finally {
      setSavingPlate(false)
    }
  }

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
          <h2 className="text-xl font-bold text-[#0026A3]" style={SERIF}>
            Carte des plaques
          </h2>
          <p className="text-xs text-[#1A1A1A]/55">
            {stats.total} plaques · {stats.totalScans} scans cumulés · {stats.active} actives
          </p>
        </div>
        <div className="flex items-center gap-2">
          {onNavigate && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onNavigate('plates-mgmt')}
              className="border-[#EAE5DC] text-[#1A1A1A] hover:border-[#FFD700]"
            >
              <QrCode className="h-4 w-4" /> Gérer les plaques
            </Button>
          )}
          <Badge className="bg-[#FFD700]/15 text-[#B8964F]">
            <MapPin className="mr-1 h-3 w-3" /> {stats.total} localisations
          </Badge>
        </div>
      </div>

      {/* Filtres statut */}
      <div className="flex flex-wrap gap-2 text-xs">
        {[
          { key: 'all', label: 'Tous', value: stats.total, color: 'bg-[#EAE5DC] text-[#1A1A1A]' },
          { key: 'active', label: 'Actives', value: stats.active, color: 'bg-[#059669]/12 text-[#059669]' },
          { key: 'maintenance', label: 'Maintenance', value: stats.maintenance, color: 'bg-[#F97316]/12 text-[#F97316]' },
          { key: 'offline', label: 'Hors ligne', value: stats.offline, color: 'bg-[#DC2626]/12 text-[#DC2626]' },
        ].map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => setStatusFilter(s.key)}
            className={cn(
              'rounded-lg px-3 py-1.5 font-medium transition',
              s.color,
              statusFilter === s.key && 'ring-2 ring-[#FFD700]',
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
          className="w-full rounded-xl border border-[#EAE5DC] bg-white py-2.5 pl-10 pr-4 text-sm text-[#1A1A1A] placeholder:text-[#1A1A1A]/40 focus:border-[#FFD700] focus:outline-none focus:ring-2 focus:ring-[#FFD700]/20"
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
            // URL QR code : premium si disponible, sinon fallback brut
            const origin = typeof window !== 'undefined' ? window.location.origin : 'https://feedback.qrbags.com'
            const qrFallback = qrServerUrl(`${origin}/?cityPlate=${p.qrToken}`, 200)
            const qrImg = composedQrs[p.id] ?? qrFallback
            return (
              <article
                key={p.id}
                className="overflow-hidden rounded-2xl border border-[#EAE5DC] bg-white shadow-sm transition-shadow hover:shadow-md"
                style={{ borderTop: `3px solid ${statusColor}` }}
              >
                <div className="p-4">
                  {/* En-tête : QR + numéro + libellé */}
                  <div className="mb-3 flex items-start justify-between gap-3">
                    {/* QR code 100x100 cliquable */}
                    <button
                      type="button"
                      onClick={() => setZoomQr({ url: qrImg, plate: p })}
                      className="group relative h-[100px] w-[100px] shrink-0 overflow-hidden rounded-xl border border-[#EAE5DC] bg-white p-1 transition hover:border-[#FFD700] hover:shadow-md"
                      aria-label={`Agrandir le QR code de la plaque ${p.plateNumber}`}
                      title="Cliquez pour agrandir"
                    >
                      <img
                        src={qrImg}
                        alt={`QR code plaque ${p.plateNumber}`}
                        className="h-full w-full rounded-lg object-contain"
                        loading="lazy"
                      />
                      <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-1 py-0.5 text-center text-[8px] font-semibold uppercase tracking-wide text-white opacity-0 transition group-hover:opacity-100">
                        Agrandir
                      </span>
                    </button>

                    <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
                      <div className="flex w-full items-center justify-between gap-2">
                        <p className="truncate text-sm font-bold text-[#1A1A1A]">
                          {p.plateNumber}
                        </p>
                        {emergencyCount > 0 && (
                          <Badge className="animate-pulse bg-[#DC2626] text-[10px] text-white">
                            <AlertTriangle className="mr-0.5 h-2.5 w-2.5" /> {emergencyCount}
                          </Badge>
                        )}
                      </div>
                      <p className="line-clamp-2 text-xs text-[#1A1A1A]/70">{p.label}</p>
                      <div className="mt-auto flex items-center gap-1.5">
                        <Badge
                          className={cn(
                            'text-[9px]',
                            p.status === 'active'
                              ? 'bg-[#059669]/12 text-[#059669]'
                              : p.status === 'maintenance'
                                ? 'bg-[#F97316]/12 text-[#F97316]'
                                : p.status === 'offline'
                                  ? 'bg-[#DC2626]/12 text-[#DC2626]'
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
                  </div>

                  {/* Infos localisation */}
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

                  {/* Footer : scans + bouton Modifier */}
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
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openEdit(p)}
                      className="border-[#FFD700]/40 text-[#1A1A1A] hover:bg-[#FFD700]/8"
                    >
                      Modifier
                    </Button>
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

      {/* ---------- Lightbox QR code agrandi ---------- */}
      {zoomQr && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          onClick={() => setZoomQr(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="relative w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setZoomQr(null)}
              className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#FAFAF7] text-[#1A1A1A] hover:bg-[#EAE5DC]"
              aria-label="Fermer"
            >
              <X className="h-4 w-4" />
            </button>
            <h3 className="mb-1 text-center text-lg font-bold text-[#1A1A1A]" style={SERIF}>
              {zoomQr.plate.plateNumber}
            </h3>
            <p className="mb-3 text-center text-xs text-[#1A1A1A]/55">
              {zoomQr.plate.label}
            </p>
            <div className="flex justify-center">
              <img
                src={zoomQr.url}
                alt={`QR code agrandi de la plaque ${zoomQr.plate.plateNumber}`}
                className="max-h-[60vh] w-auto rounded-xl shadow-md"
              />
            </div>
            <p className="mt-3 text-center text-[10px] text-[#1A1A1A]/50">
              Scannez ce QR code pour accéder aux services citoyens.
            </p>
          </div>
        </div>
      )}

      {/* ---------- Formulaire d'édition de plaque ---------- */}
      {editingPlate && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setEditingPlate(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-[#1A1A1A]" style={SERIF}>
                Plaque {editingPlate.plateNumber}
              </h3>
              <button
                onClick={() => setEditingPlate(null)}
                className="text-[#1A1A1A]/40 hover:text-[#1A1A1A]"
                aria-label="Fermer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Aperçu QR */}
            <div className="mb-4 flex justify-center">
              <img
                src={composedQrs[editingPlate.id] ?? qrServerUrl(`https://feedback.qrbags.com/?cityPlate=${editingPlate.qrToken}`, 200)}
                alt="QR premium"
                className="h-32 w-auto rounded-xl shadow-md"
              />
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[#1A1A1A]/70 mb-1.5">
                  Nom du lieu
                </label>
                <input
                  type="text"
                  value={editForm.label}
                  onChange={(e) => setEditForm((f) => ({ ...f, label: e.target.value }))}
                  placeholder="ex: Marché Sandaga, Rue Félix Faure…"
                  className="w-full rounded-xl border border-[#EAE5DC] bg-[#FAFAF7] px-4 py-2.5 text-sm focus:border-[#FFD700] focus:outline-none focus:ring-2 focus:ring-[#FFD700]/15"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#1A1A1A]/70 mb-1.5">
                  Quartier
                </label>
                <input
                  type="text"
                  value={editForm.district}
                  onChange={(e) => setEditForm((f) => ({ ...f, district: e.target.value }))}
                  placeholder="ex: Plateau, Médina, Grand Dakar…"
                  className="w-full rounded-xl border border-[#EAE5DC] bg-[#FAFAF7] px-4 py-2.5 text-sm focus:border-[#FFD700] focus:outline-none focus:ring-2 focus:ring-[#FFD700]/15"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#1A1A1A]/70 mb-1.5">
                  Adresse (optionnel)
                </label>
                <input
                  type="text"
                  value={editForm.address}
                  onChange={(e) => setEditForm((f) => ({ ...f, address: e.target.value }))}
                  placeholder="ex: Avenue Léopold Sédar Senghor"
                  className="w-full rounded-xl border border-[#EAE5DC] bg-[#FAFAF7] px-4 py-2.5 text-sm focus:border-[#FFD700] focus:outline-none focus:ring-2 focus:ring-[#FFD700]/15"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#1A1A1A]/70 mb-2">
                  Géolocalisation (GPS)
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={editForm.lat}
                    onChange={(e) => setEditForm((f) => ({ ...f, lat: e.target.value }))}
                    placeholder="Latitude"
                    className="flex-1 rounded-xl border border-[#EAE5DC] bg-[#FAFAF7] px-3 py-2.5 text-sm focus:border-[#FFD700] focus:outline-none focus:ring-2 focus:ring-[#FFD700]/15"
                  />
                  <input
                    type="text"
                    value={editForm.lng}
                    onChange={(e) => setEditForm((f) => ({ ...f, lng: e.target.value }))}
                    placeholder="Longitude"
                    className="flex-1 rounded-xl border border-[#EAE5DC] bg-[#FAFAF7] px-3 py-2.5 text-sm focus:border-[#FFD700] focus:outline-none focus:ring-2 focus:ring-[#FFD700]/15"
                  />
                </div>
                <p className="mt-1.5 text-xs text-[#1A1A1A]/50">
                  La géolocalisation active automatiquement la plaque (statut → "active").
                </p>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <Button variant="outline" onClick={() => setEditingPlate(null)}>
                Annuler
              </Button>
              <Button
                onClick={handleSavePlate}
                disabled={savingPlate}
                className="bg-[#059669] text-white hover:bg-[#047857]"
              >
                {savingPlate ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Check className="mr-2 h-4 w-4" />
                )}
                {savingPlate ? 'Sauvegarde…' : 'Sauvegarder'}
              </Button>
            </div>
          </div>
        </div>
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
          <h2 className="text-xl font-bold text-[#0026A3]" style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}>
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
          <h3 className="mb-4 text-sm font-bold text-[#0026A3]">Créer une annonce</h3>
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
                      <button onClick={() => removeHour(h)} className="text-[#6B4C9A]/60 hover:text-[#DC2626]">
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
                  className="gap-1.5 rounded-lg border-[#DC2626]/30 text-[#DC2626] hover:bg-[#DC2626]/5"
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

// ============================================================
// TransportView — Lignes de transport (bus / taxi / train)
// ============================================================
// Persistance localStorage (clé `city_transports`). Chaque entrée a :
//   - id, line (nom/numéro de ligne), destination, schedule, type
// On peut ajouter / supprimer des lignes via un formulaire inline.
// Types : bus | taxi | train
// ---------------------------------------------------------------

type Transport = {
  id: string
  line: string
  destination: string
  schedule: string
  type: 'bus' | 'taxi' | 'train'
}

const DEFAULT_TRANSPORTS: Transport[] = [
  { id: 'tr-1', line: 'Bus 25', destination: 'Plateau → Pikine', schedule: 'Toutes les 15 min · 6h - 22h', type: 'bus' },
  { id: 'tr-2', line: 'Bus 18', destination: 'Médina → Yoff', schedule: 'Toutes les 20 min · 5h30 - 21h', type: 'bus' },
  { id: 'tr-3', line: 'TER Dakar-AIBD', destination: 'Gare Dakar → AIBD', schedule: 'Départs : 6h, 12h, 18h', type: 'train' },
  { id: 'tr-4', line: 'Taxi collectif Médina', destination: 'Médina → Plateau', schedule: 'Continu · 6h - 23h', type: 'taxi' },
]

function TransportView() {
  const { toast } = useToast()
  const [transports, setTransports] = useState<Transport[]>(DEFAULT_TRANSPORTS)
  const [hydrated, setHydrated] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    line: '',
    destination: '',
    schedule: '',
    type: 'bus' as Transport['type'],
  })

  // --- Hydratation localStorage ---
  useEffect(() => {
    try {
      const saved = localStorage.getItem('city_transports')
      if (saved) {
        const parsed = JSON.parse(saved) as Transport[]
        if (Array.isArray(parsed)) setTransports(parsed)
      }
    } catch {
      /* ignore */
    } finally {
      setHydrated(true)
    }
  }, [])

  const persist = useCallback((next: Transport[]) => {
    setTransports(next)
    try {
      localStorage.setItem('city_transports', JSON.stringify(next))
    } catch {
      /* ignore */
    }
  }, [])

  const handleAdd = () => {
    if (form.line.trim().length < 2) {
      toast({ title: 'Nom de ligne requis', variant: 'destructive' })
      return
    }
    if (form.destination.trim().length < 2) {
      toast({ title: 'Destination requise', variant: 'destructive' })
      return
    }
    const next: Transport = {
      id: `tr-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      line: form.line.trim(),
      destination: form.destination.trim(),
      schedule: form.schedule.trim() || 'Horaire non précisé',
      type: form.type,
    }
    persist([next, ...transports])
    toast({
      title: 'Transport ajouté',
      description: `${next.line} → ${next.destination}`,
    })
    setForm({ line: '', destination: '', schedule: '', type: 'bus' })
    setShowForm(false)
  }

  const handleDelete = (id: string) => {
    const tr = transports.find((t) => t.id === id)
    persist(transports.filter((t) => t.id !== id))
    toast({ title: 'Transport supprimé', description: tr?.line ?? '' })
  }

  const typeColor = (t: Transport['type']) =>
    t === 'bus'
      ? { bg: 'bg-[#0026A3]/12 text-[#0026A3]', color: COLOR_BLUE, emoji: '🚌' }
      : t === 'train'
        ? { bg: 'bg-[#6B4C9A]/12 text-[#6B4C9A]', color: COLOR_PURPLE, emoji: '🚆' }
        : { bg: 'bg-[#FFD700]/15 text-[#B8964F]', color: COLOR_GOLD, emoji: '🚕' }

  const SERIF = { fontFamily: 'Georgia, "Playfair Display", serif' } as const

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-[#0026A3]" style={SERIF}>
            Transports urbains
          </h2>
          <p className="text-xs text-[#1A1A1A]/55">
            {transports.length} lignes · bus · train · taxi — données locales
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => setShowForm((v) => !v)}
          className="gap-1.5 rounded-lg bg-[#0026A3] text-white hover:bg-[#1E40AF]"
        >
          {showForm ? (
            <>
              <X className="h-4 w-4" /> Annuler
            </>
          ) : (
            <>
              <Plus className="h-4 w-4" /> Ajouter transport
            </>
          )}
        </Button>
      </div>

      {/* Formulaire d'ajout */}
      {showForm && (
        <div className="rounded-2xl border-2 border-[#0026A3]/20 bg-white p-5 shadow-sm">
          <h3 className="mb-4 flex items-center gap-2 text-sm font-bold text-[#0026A3]">
            <Bus className="h-4 w-4 text-[#0026A3]" /> Ajouter une ligne de transport
          </h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs font-semibold text-[#1A1A1A]/60">Ligne *</label>
              <input
                type="text"
                value={form.line}
                onChange={(e) => setForm((f) => ({ ...f, line: e.target.value }))}
                placeholder="ex : Bus 25, TER Dakar-AIBD, Taxi collectif Médina"
                className="mt-1 w-full rounded-xl border border-[#EAE5DC] bg-[#FAFAF7] px-3 py-2 text-sm focus:border-[#0026A3] focus:outline-none focus:ring-2 focus:ring-[#0026A3]/15"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-[#1A1A1A]/60">Destination *</label>
              <input
                type="text"
                value={form.destination}
                onChange={(e) => setForm((f) => ({ ...f, destination: e.target.value }))}
                placeholder="ex : Plateau → Pikine"
                className="mt-1 w-full rounded-xl border border-[#EAE5DC] bg-[#FAFAF7] px-3 py-2 text-sm focus:border-[#0026A3] focus:outline-none focus:ring-2 focus:ring-[#0026A3]/15"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-semibold text-[#1A1A1A]/60">Horaire</label>
              <input
                type="text"
                value={form.schedule}
                onChange={(e) => setForm((f) => ({ ...f, schedule: e.target.value }))}
                placeholder="ex : Toutes les 15 min · 6h - 22h"
                className="mt-1 w-full rounded-xl border border-[#EAE5DC] bg-[#FAFAF7] px-3 py-2 text-sm focus:border-[#0026A3] focus:outline-none focus:ring-2 focus:ring-[#0026A3]/15"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-semibold text-[#1A1A1A]/60">Type</label>
              <div className="mt-1 flex gap-2">
                {(['bus', 'train', 'taxi'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, type: t }))}
                    className={cn(
                      'flex-1 rounded-xl border-2 px-3 py-2 text-sm font-medium capitalize transition',
                      form.type === t
                        ? 'border-[#0026A3] bg-[#0026A3]/8 text-[#0026A3]'
                        : 'border-[#EAE5DC] bg-white text-[#1A1A1A]/60 hover:border-[#0026A3]/40',
                    )}
                  >
                    {t === 'bus' ? '🚌 Bus' : t === 'train' ? '🚆 Train' : '🚕 Taxi'}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowForm(false)}
              className="border-[#EAE5DC]"
            >
              Annuler
            </Button>
            <Button
              size="sm"
              onClick={handleAdd}
              className="gap-1.5 rounded-lg bg-[#0026A3] text-white hover:bg-[#1E40AF]"
            >
              <Plus className="h-4 w-4" /> Ajouter
            </Button>
          </div>
        </div>
      )}

      {/* Liste des transports */}
      {transports.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#EAE5DC] bg-white p-12 text-center">
          <Bus className="mx-auto mb-3 h-8 w-8 text-[#1A1A1A]/20" />
          <p className="text-sm font-medium text-[#1A1A1A]/60">Aucune ligne de transport</p>
          <p className="mt-1 text-xs text-[#1A1A1A]/40">
            Cliquez sur « Ajouter transport » pour créer une ligne.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {transports.map((t) => {
            const meta = typeColor(t.type)
            return (
              <article
                key={t.id}
                className="overflow-hidden rounded-2xl border border-[#EAE5DC] bg-white shadow-sm transition-shadow hover:shadow-md"
                style={{ borderTop: `3px solid ${meta.color}` }}
              >
                <div className="p-4">
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span className="text-2xl" aria-hidden>
                        {meta.emoji}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-[#1A1A1A]">
                          {t.line}
                        </p>
                        <p className="truncate text-xs text-[#1A1A1A]/55">
                          {t.destination}
                        </p>
                      </div>
                    </div>
                    <Badge className={cn('text-[10px] capitalize', meta.bg)}>
                      {t.type}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 border-t border-[#EAE5DC] pt-3 text-xs">
                    <Clock className="h-3 w-3 shrink-0 text-[#1A1A1A]/40" />
                    <span className="text-[#1A1A1A]/70">{t.schedule}</span>
                  </div>
                  <div className="mt-3 flex justify-end">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDelete(t.id)}
                      className="gap-1.5 rounded-lg text-[#DC2626] hover:bg-[#DC2626]/8"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Supprimer
                    </Button>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ============================================================
// TeamsView — Équipes terrain (chefs de quartier, agents, techniciens)
// ============================================================
// Persistance localStorage (clé `city_teams`). Chaque membre a :
//   - id, name, role, phone, district, status (active | off_duty)
//   - pin : code PIN 4 chiffres aléatoire (généré à la création).
//     Le PIN est embarqué dans l'URL du QR PWA staff
//     (?cityStaff=Name&pin=4827) ; le PWA staff lit ce PIN depuis
//     l'URL pour valider le login sans hardcoded `1968`.
// On peut ajouter / supprimer des membres. Bouton « Appeler » (tel:).
// ---------------------------------------------------------------

type TeamMember = {
  id: string
  name: string
  role: string
  phone: string
  district: string
  status: 'active' | 'off_duty'
  pin: string // Code PIN 4 chiffres (aléatoire, propre à chaque agent)
}

/** Génère un code PIN à 4 chiffres aléatoire (1000–9999). */
function generatePin(): string {
  return String(Math.floor(1000 + Math.random() * 9000))
}

const TEAM_ROLES = ['Chef de quartier', 'Agent', 'Technicien', 'Coordinateur', 'Inspecteur'] as const

const DEFAULT_TEAMS: TeamMember[] = [
  { id: 'tm-1', name: 'Cheikh Ndiaye', role: 'Chef de quartier', phone: '+221770200001', district: 'Plateau', status: 'active', pin: '4827' },
  { id: 'tm-2', name: 'Awa Diop', role: 'Agent', phone: '+221770200002', district: 'Médina', status: 'active', pin: '1593' },
  { id: 'tm-3', name: 'Modou Fall', role: 'Technicien', phone: '+221770200003', district: 'Grand Dakar', status: 'off_duty', pin: '7240' },
  { id: 'tm-4', name: 'Fatou Sow', role: 'Coordinateur', phone: '+221770200004', district: 'Parcelles', status: 'active', pin: '8615' },
]

function TeamsView() {
  const { toast } = useToast()
  const [teams, setTeams] = useState<TeamMember[]>(DEFAULT_TEAMS)
  const [hydrated, setHydrated] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    name: '',
    role: 'Agent' as TeamMember['role'] | string,
    phone: '',
    district: '',
    status: 'active' as TeamMember['status'],
  })

  // --- QR PWA modal : membre pour lequel on affiche le QR grand format ---
  // L'URL du PWA staff est https://feedback.qrbags.com/?cityStaff=<name>
  // (le routeur du PWA restaure la session via ce tag).
  const [qrModalMember, setQrModalMember] = useState<TeamMember | null>(null)

  // --- Hydratation localStorage ---
  // Au passage, on retro-attribue un PIN aux anciens membres qui n'en
  // ont pas (données créées avant l'ajout du champ `pin`).
  useEffect(() => {
    try {
      const saved = localStorage.getItem('city_teams')
      if (saved) {
        const parsed = JSON.parse(saved) as TeamMember[]
        if (Array.isArray(parsed)) {
          let mutated = false
          const withPins = parsed.map((t) => {
            if (!t.pin || !/^\d{4}$/.test(t.pin)) {
              mutated = true
              return { ...t, pin: generatePin() }
            }
            return t
          })
          setTeams(withPins)
          // Si on a ajouté des PINs, on persiste la mise à jour.
          if (mutated) {
            localStorage.setItem('city_teams', JSON.stringify(withPins))
          }
        }
      }
    } catch {
      /* ignore */
    } finally {
      setHydrated(true)
    }
  }, [])

  const persist = useCallback((next: TeamMember[]) => {
    setTeams(next)
    try {
      localStorage.setItem('city_teams', JSON.stringify(next))
    } catch {
      /* ignore */
    }
  }, [])

  const handleAdd = () => {
    if (form.name.trim().length < 2) {
      toast({ title: 'Nom requis', variant: 'destructive' })
      return
    }
    if (form.phone.trim().length < 6) {
      toast({ title: 'Téléphone invalide', variant: 'destructive' })
      return
    }
    const next: TeamMember = {
      id: `tm-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: form.name.trim(),
      role: form.role.trim(),
      phone: form.phone.trim(),
      district: form.district.trim() || 'Non assigné',
      status: form.status,
      pin: generatePin(),
    }
    persist([next, ...teams])
    toast({
      title: 'Membre ajouté',
      description: `${next.name} (${next.role}) — PIN staff : ${next.pin}`,
    })
    setForm({
      name: '',
      role: 'Agent',
      phone: '',
      district: '',
      status: 'active',
    })
    setShowForm(false)
  }

  const handleDelete = (id: string) => {
    const tm = teams.find((t) => t.id === id)
    persist(teams.filter((t) => t.id !== id))
    toast({ title: 'Membre supprimé', description: tm?.name ?? '' })
  }

  const toggleStatus = (id: string) => {
    const next = teams.map((t) =>
      t.id === id
        ? {
            ...t,
            status: (t.status === 'active' ? 'off_duty' : 'active') as TeamMember['status'],
          }
        : t,
    )
    persist(next)
  }

  const roleEmoji = (role: string) => {
    const r = role.toLowerCase()
    if (r.includes('chef')) return '👮'
    if (r.includes('technicien')) return '🔧'
    if (r.includes('coordinateur')) return '📋'
    if (r.includes('inspecteur')) return '🔍'
    return '🧑‍💼'
  }

  const stats = useMemo(
    () => ({
      total: teams.length,
      active: teams.filter((t) => t.status === 'active').length,
      offDuty: teams.filter((t) => t.status === 'off_duty').length,
    }),
    [teams],
  )

  const SERIF = { fontFamily: 'Georgia, "Playfair Display", serif' } as const

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-[#0026A3]" style={SERIF}>
            Équipes terrain
          </h2>
          <p className="text-xs text-[#1A1A1A]/55">
            {stats.total} membres · {stats.active} en service · {stats.offDuty} en repos
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => setShowForm((v) => !v)}
          className="gap-1.5 rounded-lg bg-[#059669] text-white hover:bg-[#047857]"
        >
          {showForm ? (
            <>
              <X className="h-4 w-4" /> Annuler
            </>
          ) : (
            <>
              <Plus className="h-4 w-4" /> Ajouter un membre
            </>
          )}
        </Button>
      </div>

      {/* Formulaire d'ajout */}
      {showForm && (
        <div className="rounded-2xl border-2 border-[#059669]/20 bg-white p-5 shadow-sm">
          <h3 className="mb-4 flex items-center gap-2 text-sm font-bold text-[#0026A3]">
            <Users2 className="h-4 w-4 text-[#059669]" /> Ajouter un membre d&apos;équipe
          </h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs font-semibold text-[#1A1A1A]/60">Nom complet *</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="ex : Cheikh Ndiaye"
                className="mt-1 w-full rounded-xl border border-[#EAE5DC] bg-[#FAFAF7] px-3 py-2 text-sm focus:border-[#059669] focus:outline-none focus:ring-2 focus:ring-[#059669]/15"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-[#1A1A1A]/60">Rôle</label>
              <select
                value={form.role}
                onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                className="mt-1 w-full rounded-xl border border-[#EAE5DC] bg-[#FAFAF7] px-3 py-2 text-sm focus:border-[#059669] focus:outline-none focus:ring-2 focus:ring-[#059669]/15"
              >
                {TEAM_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-[#1A1A1A]/60">Téléphone *</label>
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                placeholder="+221 77 000 00 00"
                className="mt-1 w-full rounded-xl border border-[#EAE5DC] bg-[#FAFAF7] px-3 py-2 text-sm focus:border-[#059669] focus:outline-none focus:ring-2 focus:ring-[#059669]/15"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-[#1A1A1A]/60">Quartier</label>
              <input
                type="text"
                value={form.district}
                onChange={(e) => setForm((f) => ({ ...f, district: e.target.value }))}
                placeholder="ex : Plateau"
                className="mt-1 w-full rounded-xl border border-[#EAE5DC] bg-[#FAFAF7] px-3 py-2 text-sm focus:border-[#059669] focus:outline-none focus:ring-2 focus:ring-[#059669]/15"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-semibold text-[#1A1A1A]/60">Statut</label>
              <div className="mt-1 flex gap-2">
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, status: 'active' }))}
                  className={cn(
                    'flex-1 rounded-xl border-2 px-3 py-2 text-sm font-medium transition',
                    form.status === 'active'
                      ? 'border-[#059669] bg-[#059669]/8 text-[#059669]'
                      : 'border-[#EAE5DC] bg-white text-[#1A1A1A]/60 hover:border-[#059669]/40',
                  )}
                >
                  ● En service
                </button>
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, status: 'off_duty' }))}
                  className={cn(
                    'flex-1 rounded-xl border-2 px-3 py-2 text-sm font-medium transition',
                    form.status === 'off_duty'
                      ? 'border-[#1A1A1A] bg-[#1A1A1A]/8 text-[#1A1A1A]'
                      : 'border-[#EAE5DC] bg-white text-[#1A1A1A]/60 hover:border-[#1A1A1A]/40',
                  )}
                >
                  ○ En repos
                </button>
              </div>
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowForm(false)}
              className="border-[#EAE5DC]"
            >
              Annuler
            </Button>
            <Button
              size="sm"
              onClick={handleAdd}
              className="gap-1.5 rounded-lg bg-[#059669] text-white hover:bg-[#047857]"
            >
              <Plus className="h-4 w-4" /> Ajouter
            </Button>
          </div>
        </div>
      )}

      {/* Liste des membres */}
      {teams.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#EAE5DC] bg-white p-12 text-center">
          <Users2 className="mx-auto mb-3 h-8 w-8 text-[#1A1A1A]/20" />
          <p className="text-sm font-medium text-[#1A1A1A]/60">Aucun membre d&apos;équipe</p>
          <p className="mt-1 text-xs text-[#1A1A1A]/40">
            Cliquez sur « Ajouter un membre » pour commencer.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-[#EAE5DC] bg-white shadow-sm">
          <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
            {teams.map((tm) => {
              const staffUrl = `https://feedback.qrbags.com/?cityStaff=${encodeURIComponent(tm.name)}&pin=${tm.pin}`
              const staffQrUrl = qrServerUrl(staffUrl, 200)
              return (
              <article
                key={tm.id}
                className={cn(
                  'overflow-hidden rounded-xl border bg-white p-4 transition-shadow hover:shadow-md',
                  tm.status === 'active'
                    ? 'border-[#059669]/30'
                    : 'border-[#EAE5DC]',
                )}
              >
                <div className="mb-3 flex items-start gap-3">
                  <div
                    className={cn(
                      'flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-base font-bold',
                      tm.status === 'active'
                        ? 'bg-[#059669]/15 text-[#059669]'
                        : 'bg-[#1A1A1A]/8 text-[#1A1A1A]/60',
                    )}
                  >
                    {tm.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-[#1A1A1A]">
                      {tm.name}
                    </p>
                    <p className="truncate text-xs text-[#1A1A1A]/60">
                      {roleEmoji(tm.role)} {tm.role}
                    </p>
                    <p className="mt-0.5 truncate text-[11px] text-[#1A1A1A]/45">
                      <MapPin className="mr-0.5 inline h-3 w-3" />
                      {tm.district}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleStatus(tm.id)}
                    className={cn(
                      'inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-[10px] font-bold transition',
                      tm.status === 'active'
                        ? 'bg-[#059669]/12 text-[#059669]'
                        : 'bg-[#1A1A1A]/8 text-[#1A1A1A]/55',
                    )}
                    title="Basculer le statut"
                  >
                    <span
                      className={cn(
                        'h-1.5 w-1.5 rounded-full',
                        tm.status === 'active' ? 'bg-[#059669]' : 'bg-[#1A1A1A]/40',
                      )}
                    />
                    {tm.status === 'active' ? 'En service' : 'Repos'}
                  </button>
                </div>

                {/* QR PWA : miniature cliquable → agrandit dans le modal */}
                <button
                  type="button"
                  onClick={() => setQrModalMember(tm)}
                  className="group mb-3 flex w-full items-center gap-3 rounded-lg border border-[#EAE5DC] bg-[#FAFAF7] p-2 text-left transition hover:border-[#0026A3] hover:bg-[#0026A3]/3"
                  aria-label={`Afficher le QR PWA de ${tm.name}`}
                  title="Cliquez pour agrandir le QR PWA"
                >
                  <img
                    src={staffQrUrl}
                    alt={`QR PWA — ${tm.name}`}
                    className="h-20 w-20 shrink-0 rounded-md bg-white p-1"
                    loading="lazy"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1 text-xs font-bold text-[#0026A3]">
                      <QrCode className="h-3.5 w-3.5" /> PWA Staff
                    </p>
                    <p className="mt-0.5 truncate text-[11px] text-[#1A1A1A]/55">
                      Flashez pour ouvrir l&apos;app staff de {tm.name.split(' ')[0]}
                    </p>
                    <span className="mt-1 inline-flex items-center gap-1 text-[10px] font-medium text-[#0026A3]/70 group-hover:underline">
                      Agrandir →
                    </span>
                  </div>
                </button>

                <div className="flex items-center gap-2 border-t border-[#EAE5DC] pt-3">
                  <a
                    href={`tel:${tm.phone.replace(/\s/g, '')}`}
                    className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-[#059669]/12 px-3 py-2 text-xs font-semibold text-[#059669] transition hover:bg-[#059669] hover:text-white"
                    aria-label={`Appeler ${tm.name}`}
                  >
                    <Phone className="h-3.5 w-3.5" /> Appeler
                  </a>
                  <button
                    type="button"
                    onClick={() => setQrModalMember(tm)}
                    className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-[#0026A3]/12 px-3 py-2 text-xs font-semibold text-[#0026A3] transition hover:bg-[#0026A3] hover:text-white"
                    aria-label={`QR PWA de ${tm.name}`}
                    title="Afficher le QR PWA"
                  >
                    <QrCode className="h-3.5 w-3.5" /> QR PWA
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(tm.id)}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-[#DC2626]/10 text-[#DC2626] transition hover:bg-[#DC2626] hover:text-white"
                    aria-label={`Supprimer ${tm.name}`}
                    title="Supprimer"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </article>
              )
            })}
          </div>
        </div>
      )}

      {/* ---------- Modal : QR PWA agrandi (200x200) + PIN ---------- */}
      {qrModalMember && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setQrModalMember(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-[#1A1A1A]" style={SERIF}>
                  QR PWA Staff
                </h3>
                <p className="text-xs text-[#1A1A1A]/55">
                  {qrModalMember.name} · {qrModalMember.role}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setQrModalMember(null)}
                className="text-[#1A1A1A]/40 hover:text-[#1A1A1A]"
                aria-label="Fermer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex flex-col items-center gap-3">
              <a
                href={qrServerUrl(
                  `https://feedback.qrbags.com/?cityStaff=${encodeURIComponent(qrModalMember.name)}&pin=${qrModalMember.pin}`,
                  400,
                )}
                target="_blank"
                rel="noopener noreferrer"
                className="block transition hover:scale-[1.02]"
                aria-label={`Ouvrir le QR PWA de ${qrModalMember.name} en grand`}
                title="Cliquez pour agrandir"
              >
                <img
                  src={qrServerUrl(
                    `https://feedback.qrbags.com/?cityStaff=${encodeURIComponent(qrModalMember.name)}&pin=${qrModalMember.pin}`,
                    200,
                  )}
                  alt={`QR PWA — ${qrModalMember.name}`}
                  className="h-[200px] w-[200px] rounded-lg border border-[#EAE5DC] bg-white p-2"
                />
              </a>
              <p className="text-center text-[11px] text-[#1A1A1A]/55">
                Flashez ce QR pour ouvrir l&apos;app staff de{' '}
                <strong className="text-[#1A1A1A]">{qrModalMember.name}</strong> sur
                n&apos;importe quel mobile.
              </p>

              {/* ---- Code PIN mis en avant (communiqué à l'agent) ---- */}
              <div className="flex w-full flex-col items-center gap-1 rounded-xl border-2 border-[#FFD700] bg-gradient-to-br from-[#FFD700]/15 to-[#FFD700]/5 px-4 py-3">
                <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-[#a88a48]">
                  <Key className="h-3 w-3" /> Code PIN Staff
                </span>
                <span
                  className="text-4xl font-black tracking-[0.35em] text-[#1A1A1A]"
                  style={SERIF}
                  aria-label={`Code PIN ${qrModalMember.pin}`}
                >
                  {qrModalMember.pin}
                </span>
                <span className="text-[10px] text-[#1A1A1A]/55">
                  À communiquer à l&apos;agent pour le login PWA
                </span>
              </div>

              <div className="flex w-full items-center gap-2 rounded-lg bg-[#0026A3]/5 p-2">
                <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-[#0026A3]/70">
                  Lien PWA
                </span>
                <code className="min-w-0 flex-1 truncate text-[11px] text-[#1A1A1A]/70">
                  https://feedback.qrbags.com/?cityStaff=
                  {encodeURIComponent(qrModalMember.name)}&amp;pin={qrModalMember.pin}
                </code>
              </div>
              <a
                href={qrServerUrl(
                  `https://feedback.qrbags.com/?cityStaff=${encodeURIComponent(qrModalMember.name)}&pin=${qrModalMember.pin}`,
                  600,
                )}
                download={`qr-pwa-${qrModalMember.name
                  .toLowerCase()
                  .replace(/\s+/g, '-')}.png`}
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#0026A3] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#1E40AF]"
              >
                <Download className="h-4 w-4" /> Télécharger
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================================
// TarifsView — la mairie définit les prix des options premium
// ============================================================

type PricingTier = {
  label: string
  price: number
  currency: string
  period: string
  description: string
  photoUrl?: string | null
}

type PricingTiers = {
  menu: PricingTier
  priceGrid: PricingTier
  sponsored: PricingTier
}

function TarifsView() {
  const { toast } = useToast()
  const [tiers, setTiers] = useState<PricingTiers | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const fetchTiers = useCallback(async () => {
    try {
      const res = await fetch('/api/city/pricing', { cache: 'no-store' })
      const json = await res.json()
      if (json?.ok && json.data?.tiers) {
        setTiers(json.data.tiers)
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchTiers()
  }, [fetchTiers])

  const handleSave = async () => {
    if (!tiers) return
    setSaving(true)
    try {
      const res = await fetch('/api/city/pricing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tiers),
      })
      const json = await res.json()
      if (json?.ok) {
        toast({ title: 'Tarifs enregistrés', description: 'Les prix premium sont mis à jour.' })
      } else {
        toast({ title: 'Erreur', description: json?.error || 'Enregistrement impossible.' })
      }
    } catch {
      toast({ title: 'Erreur réseau' })
    } finally {
      setSaving(false)
    }
  }

  const updateTier = (key: keyof PricingTiers, field: keyof PricingTier, value: string | number) => {
    setTiers((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        [key]: { ...prev[key], [field]: value },
      }
    })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="size-6 animate-spin text-[#FFD700]" />
      </div>
    )
  }

  if (!tiers) {
    return <p className="text-sm text-[#1A1A1A]/60">Erreur de chargement des tarifs.</p>
  }

  const tierCards: { key: keyof PricingTiers; icon: typeof Tag; color: string; target: string }[] = [
    { key: 'menu', icon: Utensils, color: '#0026A3', target: 'Restaurants' },
    { key: 'priceGrid', icon: Wrench, color: '#00A651', target: 'Artisans' },
    { key: 'sponsored', icon: Sparkles, color: '#FFD700', target: 'Tous commerces' },
  ]

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-[#0026A3]" style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}>
            Tarifs Premium
          </h2>
          <p className="text-sm text-[#1A1A1A]/60">
            Définissez les prix des options premium. Les commerçants les voient à l'inscription.
          </p>
        </div>
        <Button
          onClick={handleSave}
          disabled={saving}
          className="gap-2 rounded-xl bg-[#FFD700] text-white hover:bg-[#a88a48]"
        >
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </Button>
      </div>

      {/* Version gratuite info */}
      <div className="rounded-2xl border-2 border-[#00A651]/20 bg-[#00A651]/5 p-4">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-[#00A651]">
            <Check className="size-5 text-white" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-[#00A651]">Version Standard — GRATUITE</h3>
            <p className="text-xs text-[#1A1A1A]/60">
              Fiche de base : nom, catégorie, téléphone, adresse, horaires, description, photo. Visible par tous les citoyens après validation.
            </p>
          </div>
        </div>
      </div>

      {/* 3 cartes de tarifs premium */}
      <div className="grid gap-4 lg:grid-cols-3">
        {tierCards.map(({ key, icon: Icon, color, target }) => {
          const tier = tiers[key]
          return (
            <div
              key={key}
              className="rounded-2xl border-2 border-[#EAE5DC] bg-white p-5 shadow-sm"
            >
              {/* Header avec icône */}
              <div className="mb-4 flex items-center gap-3">
                <div
                  className="flex size-10 items-center justify-center rounded-xl text-white"
                  style={{ backgroundColor: color }}
                >
                  <Icon className="size-5" />
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide" style={{ color }}>
                    {target}
                  </p>
                  <h3 className="text-sm font-bold text-[#1A1A1A]">{tier.label}</h3>
                </div>
              </div>

              {/* Prix */}
              <div className="mb-3">
                <label className="text-xs font-semibold text-[#1A1A1A]/60">Prix</label>
                <div className="mt-1 flex items-center gap-2">
                  <input
                    type="number"
                    value={tier.price}
                    onChange={(e) => updateTier(key, 'price', parseInt(e.target.value) || 0)}
                    className="w-full rounded-xl border-2 border-[#EAE5DC] px-3 py-2 text-lg font-bold text-[#1A1A1A] focus:border-[#FFD700] focus:outline-none"
                  />
                  <span className="text-sm font-bold text-[#1A1A1A]/60">FCFA</span>
                </div>
              </div>

              {/* Période */}
              <div className="mb-3">
                <label className="text-xs font-semibold text-[#1A1A1A]/60">Par</label>
                <select
                  value={tier.period}
                  onChange={(e) => updateTier(key, 'period', e.target.value)}
                  className="mt-1 w-full rounded-xl border-2 border-[#EAE5DC] px-3 py-2 text-sm focus:border-[#FFD700] focus:outline-none"
                >
                  <option value="mois">Mois</option>
                  <option value="semaine">Semaine</option>
                  <option value="jour">Jour</option>
                  <option value="an">An</option>
                  <option value="once">Once (paiement unique)</option>
                </select>
              </div>

              {/* Label */}
              <div className="mb-3">
                <label className="text-xs font-semibold text-[#1A1A1A]/60">Nom de l'option</label>
                <input
                  type="text"
                  value={tier.label}
                  onChange={(e) => updateTier(key, 'label', e.target.value)}
                  maxLength={60}
                  className="mt-1 w-full rounded-xl border-2 border-[#EAE5DC] px-3 py-2 text-sm focus:border-[#FFD700] focus:outline-none"
                />
              </div>

              {/* Description */}
              <div className="mb-3">
                <label className="text-xs font-semibold text-[#1A1A1A]/60">Description</label>
                <textarea
                  value={tier.description}
                  onChange={(e) => updateTier(key, 'description', e.target.value)}
                  maxLength={200}
                  rows={2}
                  className="mt-1 w-full rounded-xl border-2 border-[#EAE5DC] px-3 py-2 text-xs focus:border-[#FFD700] focus:outline-none"
                />
              </div>

              {/* Photo exemple */}
              <div>
                <label className="text-xs font-semibold text-[#1A1A1A]/60">Photo d'exemple (optionnel)</label>
                {tier.photoUrl ? (
                  <div className="mt-1 space-y-1">
                    <img src={tier.photoUrl} alt="Exemple" className="h-24 w-full rounded-xl object-cover" />
                    <button
                      onClick={() => updateTier(key, 'photoUrl', '')}
                      className="text-xs font-medium text-[#DC2626] hover:underline"
                    >
                      Supprimer la photo
                    </button>
                  </div>
                ) : (
                  <div className="mt-1 flex h-20 items-center justify-center rounded-xl border-2 border-dashed border-[#EAE5DC] text-[#1A1A1A]/30">
                    <Camera className="size-6" />
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Info paiement */}
      <div className="rounded-2xl bg-[#1A1A1A] p-4 text-white">
        <div className="flex items-center gap-3">
          <Wallet className="size-5 text-[#FFD700]" />
          <div>
            <h3 className="text-sm font-bold text-[#FFD700]">Paiement en mairie</h3>
            <p className="text-xs text-white/70">
              Les commerçants qui choisissent la version Premium doivent se rendre à la mairie pour payer (espèces, Wave, Orange Money). La mairie active ensuite l'option Premium manuellement dans l'onglet Commerces.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================================================
// <QrCodeConfigView /> — Personnalisation du QR code citoyen
// ------------------------------------------------------------
// La mairie personnalise le titre, sous-titre et la liste des
// services municipaux affichés sur la page QR code du citoyen.
// GET /api/city/qr-config → { qrTitle, qrSubtitle, mairieServices }
// POST /api/city/qr-config → sauvegarde la configuration.
// ============================================================

type MairieService = { label: string; phone: string }

function QrCodeConfigView() {
  const { toast } = useToast()
  const [qrTitle, setQrTitle] = useState('')
  const [qrSubtitle, setQrSubtitle] = useState('')
  const [aminataName, setAminataName] = useState('Aminata')
  const [mairieServices, setMairieServices] = useState<MairieService[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // --- Chargement initial de la configuration ---
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch('/api/city/qr-config', { cache: 'no-store' })
      .then((r) => r.json())
      .then((res: { ok?: boolean; data?: { qrTitle: string; qrSubtitle: string; aminataName?: string; mairieServices: MairieService[] } }) => {
        if (cancelled) return
        if (res?.ok && res.data) {
          setQrTitle(res.data.qrTitle ?? '')
          setQrSubtitle(res.data.qrSubtitle ?? '')
          setAminataName(res.data.aminataName ?? 'Aminata')
          setMairieServices(Array.isArray(res.data.mairieServices) ? res.data.mairieServices : [])
        }
      })
      .catch(() => {
        if (cancelled) return
        toast({
          title: 'Erreur',
          description: 'Impossible de charger la configuration QR.',
          variant: 'destructive',
        })
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [toast])

  const addService = useCallback(() => {
    setMairieServices((prev) => {
      if (prev.length >= 20) {
        toast({
          title: 'Limite atteinte',
          description: 'Vous ne pouvez pas ajouter plus de 20 services.',
          variant: 'destructive',
        })
        return prev
      }
      return [...prev, { label: '', phone: '' }]
    })
  }, [toast])

  const updateService = useCallback((index: number, field: keyof MairieService, value: string) => {
    setMairieServices((prev) =>
      prev.map((s, i) => (i === index ? { ...s, [field]: value } : s)),
    )
  }, [])

  const removeService = useCallback((index: number) => {
    setMairieServices((prev) => prev.filter((_, i) => i !== index))
  }, [])

  const handleSave = useCallback(async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/city/qr-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ qrTitle, qrSubtitle, aminataName, mairieServices }),
      })
      if (!res.ok) throw new Error('HTTP error')
      const json = await res.json()
      if (json?.ok) {
        toast({
          title: 'Enregistré',
          description: 'Configuration QR enregistrée',
        })
      } else {
        throw new Error('API error')
      }
    } catch {
      toast({
        title: 'Erreur',
        description: "Erreur lors de l'enregistrement",
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }, [qrTitle, qrSubtitle, aminataName, mairieServices, toast])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="size-6 animate-spin text-[#FFD700]" />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2
            className="text-xl font-bold text-[#0026A3]"
            style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}
          >
            QR Code citoyen
          </h2>
          <p className="text-sm text-[#1A1A1A]/60">
            Personnalisez le message d'accueil et les services municipaux affichés sur la page QR du citoyen.
          </p>
        </div>
        <Button
          onClick={handleSave}
          disabled={saving}
          className="gap-2 rounded-xl bg-[#0026A3] text-white hover:bg-[#FFD700] hover:text-[#1A1A1A]"
        >
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </Button>
      </div>

      {/* Aperçu en-tête QR */}
      <div className="rounded-2xl bg-[#0026A3] p-5 text-white">
        <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[#FFD700]">
          <QrCode className="size-4" />
          Aperçu de l'en-tête QR
        </div>
        <p className="mb-1 text-xs font-bold uppercase tracking-[0.2em] text-white/70">
          {(aminataName || 'Aminata').toUpperCase()} · VOTRE QUARTIER
        </p>
        <h3 className="text-lg font-bold">{qrTitle || 'Bonjour, je suis Aminata.'}</h3>
        <p className="mt-1 text-sm text-white/80">
          {qrSubtitle || 'Je suis là pour vous aider dans votre quartier.'}
        </p>
      </div>

      {/* Carte : Titre + Sous-titre */}
      <div className="rounded-2xl border border-[#0026A3]/15 bg-white p-5 shadow-sm">
        <h3
          className="mb-4 text-base font-bold text-[#0026A3]"
          style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}
        >
          Message d'accueil
        </h3>

        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[#1A1A1A]">
              Titre du QR code
            </label>
            <Input
              value={qrTitle}
              maxLength={200}
              onChange={(e) => setQrTitle(e.target.value)}
              placeholder="Bonjour, je suis Aminata."
              className="border-[#0026A3]/20 focus:border-[#0026A3] focus-visible:ring-[#0026A3]/30"
            />
            <p className="mt-1 text-xs text-[#1A1A1A]/50">
              {qrTitle.length}/200 — salutation principale affichée en en-tête.
            </p>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-[#1A1A1A]">
              Sous-titre
            </label>
            <Input
              value={qrSubtitle}
              maxLength={300}
              onChange={(e) => setQrSubtitle(e.target.value)}
              placeholder="Je suis là pour vous aider dans votre quartier."
              className="border-[#0026A3]/20 focus:border-[#0026A3] focus-visible:ring-[#0026A3]/30"
            />
            <p className="mt-1 text-xs text-[#1A1A1A]/50">
              {qrSubtitle.length}/300 — phrase affichée sous le titre.
            </p>
          </div>
        </div>
      </div>

      {/* Carte : Assistante vocale (nom personnalisable) */}
      <div className="rounded-2xl border border-[#0026A3]/15 bg-white p-5 shadow-sm">
        <h3
          className="mb-1 text-base font-bold text-[#0026A3]"
          style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}
        >
          Assistante vocale
        </h3>
        <p className="mb-4 text-xs text-[#1A1A1A]/60">
          Nom prononcé et affiché par l'assistante vocale du QR code (en-tête
          « AMINATA », message de bienvenue et confirmations vocales).
        </p>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-[#1A1A1A]">
            Nom de l&apos;assistante vocale
          </label>
          <Input
            value={aminataName}
            maxLength={30}
            onChange={(e) => setAminataName(e.target.value)}
            placeholder="Aminata, Marianne, Marie, Amina…"
            className="border-[#0026A3]/20 focus:border-[#0026A3] focus-visible:ring-[#0026A3]/30"
          />
          <p className="mt-1 text-xs text-[#1A1A1A]/50">
            {aminataName.length}/30 — par défaut « Aminata ». Sera mis en
            majuscules dans l&apos;en-tête et prononcé dans les messages vocaux.
          </p>
        </div>
      </div>

      {/* Carte : Services municipaux */}
      <div className="rounded-2xl border border-[#0026A3]/15 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3
              className="text-base font-bold text-[#0026A3]"
              style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}
            >
              Services municipaux
            </h3>
            <p className="text-xs text-[#1A1A1A]/60">
              {mairieServices.length}/20 services — affichés sur la page QR du citoyen.
            </p>
          </div>
          <Button
            onClick={addService}
            disabled={mairieServices.length >= 20}
            className="gap-2 rounded-xl bg-[#0026A3] text-white hover:bg-[#1E40AF]"
          >
            <Plus className="size-4" />
            Ajouter un service
          </Button>
        </div>

        {mairieServices.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[#0026A3]/25 bg-[#0026A3]/5 p-6 text-center">
            <p className="text-sm text-[#1A1A1A]/60">
              Aucun service configuré. Cliquez sur « Ajouter un service » pour commencer.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {mairieServices.map((service, index) => (
              <div
                key={index}
                className="rounded-xl border border-[#0026A3]/10 bg-white p-3 shadow-sm"
              >
                <div className="flex items-center gap-3">
                  <div className="grid flex-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-[#1A1A1A]/70">
                        Libellé
                      </label>
                      <Input
                        value={service.label}
                        onChange={(e) => updateService(index, 'label', e.target.value)}
                        placeholder="Ex : État civil"
                        className="border-[#0026A3]/20 focus:border-[#0026A3] focus-visible:ring-[#0026A3]/30"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-[#1A1A1A]/70">
                        Téléphone
                      </label>
                      <Input
                        value={service.phone}
                        onChange={(e) => updateService(index, 'phone', e.target.value)}
                        placeholder="Ex : +221 33 800 00 00"
                        className="border-[#0026A3]/20 focus:border-[#0026A3] focus-visible:ring-[#0026A3]/30"
                      />
                    </div>
                  </div>
                  <Button
                    onClick={() => removeService(index)}
                    size="sm"
                    variant="outline"
                    className="shrink-0 gap-1.5 rounded-lg border-[#dc2626]/30 text-[#dc2626] hover:bg-[#dc2626]/10 hover:text-[#dc2626]"
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

      {/* Bouton Enregistrer (en bas, pour la commodité) */}
      <div className="flex justify-end">
        <Button
          onClick={handleSave}
          disabled={saving}
          className="gap-2 rounded-xl bg-[#0026A3] px-6 text-white hover:bg-[#FFD700] hover:text-[#1A1A1A]"
        >
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </Button>
      </div>
    </div>
  )
}

// ============================================================
// <AppointmentsView /> — Rendez-vous citoyens
// ------------------------------------------------------------
// Affiche les demandes de RDV déposées via la PWA citoyenne.
// Flux : pending → confirmed → completed (ou cancelled à tout moment).
// PATCH /api/city/appointments/[id] avec { status } pour changer d'état.
// ============================================================

type CityAppointment = {
  id: string
  reference: string
  name: string
  phone: string
  email: string | null
  motif: string
  status: 'pending' | 'confirmed' | 'cancelled' | 'completed'
  assignedTo: string | null
  preferredDate: string | null
  plate: {
    id: string
    plateNumber: string
    label: string
  } | null
  createdAt: string
}

const APPOINTMENT_STATUS_META: Record<
  CityAppointment['status'],
  { label: string; color: string }
> = {
  pending: { label: 'En attente', color: COLOR_ORANGE },
  confirmed: { label: 'Confirmé', color: COLOR_GREEN },
  cancelled: { label: 'Annulé', color: COLOR_RED },
  completed: { label: 'Terminé', color: COLOR_BLUE },
}

function AppointmentsView() {
  const { toast } = useToast()
  const [appointments, setAppointments] = useState<CityAppointment[]>([])
  const [loading, setLoading] = useState(true)
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  // --- Assignation RDV : un buffer d'email saisi par carte (id RDV -> email).
  //     Permet à la mairie d'assigner un RDV à un membre du secretariat
  //     puis de notifier ce dernier par email (PATCH { assignedTo }).
  const [assignEmails, setAssignEmails] = useState<Record<string, string>>({})
  const [assigningId, setAssigningId] = useState<string | null>(null)

  const fetchAppointments = useCallback(async () => {
    try {
      const res = await fetch('/api/city/appointments', { cache: 'no-store' })
      const json = await res.json()
      if (json?.ok && Array.isArray(json.data?.appointments)) {
        const list = json.data.appointments as CityAppointment[]
        // Trier par date de création décroissante (plus récent en premier)
        list.sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        )
        setAppointments(list)
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAppointments()
  }, [fetchAppointments])

  const updateStatus = useCallback(
    async (id: string, status: CityAppointment['status']) => {
      setUpdatingId(id)
      try {
        const res = await fetch(`/api/city/appointments/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status }),
        })
        const json = await res.json()
        if (json?.ok) {
          // Mise à jour optimiste côté UI
          setAppointments((prev) =>
            prev.map((a) => (a.id === id ? { ...a, status } : a))
          )
          toast({
            title: 'Statut mis à jour',
            description: `RDV marqué « ${APPOINTMENT_STATUS_META[status].label} ».`,
          })
        } else {
          toast({
            title: 'Erreur',
            description: json?.error || 'Mise à jour impossible.',
          })
        }
      } catch {
        toast({
          title: 'Erreur réseau',
          description: 'Vérifiez votre connexion.',
        })
      } finally {
        setUpdatingId(null)
      }
    },
    [toast]
  )

  // --- Assigner un RDV à un email (membre du secretariat / maire) ---
  // PATCH /api/city/appointments/[id] avec { assignedTo: email }.
  // L'email de notification est délégué à l'API existante ; on se contente
  // ici de persister l'assignation et d'afficher un toast de confirmation.
  // Une fois assigné, le RDV n'est plus « pending » du point de vue de
  // l'assignation (mais son statut workflow reste inchangé).
  const assignRdv = useCallback(
    async (id: string, email: string) => {
      const trimmed = email.trim()
      // Validation basique : au moins un @ et un point après l'@.
      if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
        toast({
          title: 'Email invalide',
          description: 'Saisissez une adresse email valide (ex: marie@mairie.sn).',
          variant: 'destructive',
        })
        return
      }
      setAssigningId(id)
      try {
        const res = await fetch(`/api/city/appointments/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ assignedTo: trimmed }),
        })
        const json = await res.json()
        if (json?.ok) {
          setAppointments((prev) =>
            prev.map((a) => (a.id === id ? { ...a, assignedTo: trimmed } : a))
          )
          // Nettoyage du buffer de saisie pour cette carte
          setAssignEmails((prev) => {
            const next = { ...prev }
            delete next[id]
            return next
          })
          // Envoie l'email de notification avec tous les détails du RDV
          try {
            await fetch(`/api/city/appointments/${id}/notify`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email: trimmed }),
            })
          } catch { /* non bloquant */ }
          toast({
            title: `RDV assigné à ${trimmed}`,
            description: 'Email envoyé avec le motif, le nom et les coordonnées du demandeur.',
          })
        } else {
          toast({
            title: 'Erreur',
            description: json?.error || 'Assignation impossible.',
            variant: 'destructive',
          })
        }
      } catch {
        toast({
          title: 'Erreur réseau',
          description: 'Vérifiez votre connexion.',
          variant: 'destructive',
        })
      } finally {
        setAssigningId(null)
      }
    },
    [toast]
  )

  // --- Statistiques rapides ---
  const stats = useMemo(() => {
    const total = appointments.length
    const pending = appointments.filter((a) => a.status === 'pending').length
    const confirmed = appointments.filter((a) => a.status === 'confirmed').length
    const completed = appointments.filter((a) => a.status === 'completed').length
    return { total, pending, confirmed, completed }
  }, [appointments])

  const formatDate = (iso: string | null): string => {
    if (!iso) return ''
    const d = new Date(iso)
    if (isNaN(d.getTime())) return ''
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(
      d.getHours()
    )}:${pad(d.getMinutes())}`
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2
            className="text-xl font-bold text-[#0026A3]"
            style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}
          >
            Rendez-vous
          </h2>
          <p className="text-sm text-[#1A1A1A]/60">
            Demandes de rendez-vous déposées par les citoyens via les QR codes.
            Confirmez, annulez ou clôturez chaque demande.
          </p>
        </div>
        <Button
          onClick={fetchAppointments}
          variant="outline"
          className="gap-2 rounded-xl"
        >
          <RefreshCw className="size-4" />
          Actualiser
        </Button>
      </div>

      {/* Stats summary */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border-2 border-[#d5d3d4] bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 text-[#1A1A1A]/50">
            <Calendar className="size-4" />
            <span className="text-[10px] font-bold uppercase tracking-wider">
              Total RDVs
            </span>
          </div>
          <p className="mt-2 text-2xl font-bold text-[#1A1A1A]">{stats.total}</p>
        </div>
        <div className="rounded-2xl border-2 border-[#d5d3d4] bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 text-[#1A1A1A]/50">
            <Clock className="size-4" />
            <span className="text-[10px] font-bold uppercase tracking-wider">
              En attente
            </span>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <span className="text-2xl font-bold text-[#1A1A1A]">
              {stats.pending}
            </span>
            <Badge
              className="rounded-full px-2 text-[10px] font-bold"
              style={{
                background: `${COLOR_ORANGE}15`,
                color: COLOR_ORANGE,
              }}
            >
              pending
            </Badge>
          </div>
        </div>
        <div className="rounded-2xl border-2 border-[#d5d3d4] bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 text-[#1A1A1A]/50">
            <Check className="size-4" />
            <span className="text-[10px] font-bold uppercase tracking-wider">
              Confirmés
            </span>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <span className="text-2xl font-bold text-[#1A1A1A]">
              {stats.confirmed}
            </span>
            <Badge
              className="rounded-full px-2 text-[10px] font-bold"
              style={{
                background: `${COLOR_GREEN}15`,
                color: COLOR_GREEN,
              }}
            >
              confirmed
            </Badge>
          </div>
        </div>
        <div className="rounded-2xl border-2 border-[#d5d3d4] bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 text-[#1A1A1A]/50">
            <Check className="size-4" />
            <span className="text-[10px] font-bold uppercase tracking-wider">
              Terminés
            </span>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <span className="text-2xl font-bold text-[#1A1A1A]">
              {stats.completed}
            </span>
            <Badge
              className="rounded-full px-2 text-[10px] font-bold"
              style={{
                background: `${COLOR_BLUE}15`,
                color: COLOR_BLUE,
              }}
            >
              completed
            </Badge>
          </div>
        </div>
      </div>

      {/* Liste */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="size-6 animate-spin text-[#FFD700]" />
        </div>
      ) : appointments.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-[#d5d3d4] p-12 text-center">
          <Calendar className="mx-auto size-10 text-[#1A1A1A]/20" />
          <p className="mt-3 text-sm font-medium text-[#1A1A1A]/50">
            Aucun rendez-vous pour le moment. Les demandes citoyennes
            apparaîtront ici.
          </p>
        </div>
      ) : (
        <div className="max-h-[calc(100vh-22rem)] space-y-3 overflow-y-auto pr-1">
          {appointments.map((a) => {
            const meta = APPOINTMENT_STATUS_META[a.status]
            const busy = updatingId === a.id
            const busyAssign = assigningId === a.id
            // Valeur courante de l'input d'assignation pour cette carte :
            // on privilégie le buffer de saisie (l'utilisateur tape), sinon
            // l'email déjà persisté en base (si assigné précédemment).
            const assignValue = assignEmails[a.id] ?? a.assignedTo ?? ''
            const canAssign = a.status === 'pending' || a.status === 'confirmed'
            return (
              <div
                key={a.id}
                className="rounded-2xl border-2 border-[#d5d3d4] bg-white p-4 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  {/* Colonne gauche : infos RDV */}
                  <div className="min-w-0 flex-1 space-y-2">
                    {/* Ligne 1 : référence + statut */}
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className="rounded-md px-2 py-0.5 text-xs font-bold"
                        style={{
                          background: `${COLOR_GOLD}15`,
                          color: COLOR_GOLD,
                        }}
                      >
                        {a.reference}
                      </span>
                      <Badge
                        className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase"
                        style={{ background: `${meta.color}15`, color: meta.color }}
                      >
                        {meta.label}
                      </Badge>
                      {/* Badge « Assigné à » — affiché dès qu'un email est
                          persisté sur le RDV (indépendamment du statut). */}
                      {a.assignedTo && (
                        <Badge
                          className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                          style={{ background: `${COLOR_BLUE}15`, color: COLOR_BLUE }}
                        >
                          <Key className="mr-0.5 size-2.5" />
                          Assigné à {a.assignedTo}
                        </Badge>
                      )}
                    </div>

                    {/* Ligne 2 : nom + téléphone */}
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                      <span className="font-semibold text-[#1A1A1A]">
                        {a.name}
                      </span>
                      <span className="flex items-center gap-1 text-[#1A1A1A]/60">
                        <Phone className="size-3.5" />
                        {a.phone}
                      </span>
                    </div>

                    {/* Ligne 3 : motif */}
                    <p className="text-sm text-[#1A1A1A]/75">
                      <span className="font-semibold text-[#1A1A1A]">Motif : </span>
                      {a.motif}
                    </p>

                    {/* Ligne 4 : date souhaitée + plaque */}
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#1A1A1A]/50">
                      {a.preferredDate && (
                        <span className="flex items-center gap-1">
                          <Calendar className="size-3.5" />
                          Souhaité : {formatDate(a.preferredDate)}
                        </span>
                      )}
                      {a.plate && (
                        <span className="flex items-center gap-1">
                          <MapPin className="size-3.5" />
                          {a.plate.plateNumber}
                          {a.plate.label ? ` · ${a.plate.label}` : ''}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <Clock className="size-3.5" />
                        Créé {timeAgo(a.createdAt)}
                      </span>
                    </div>
                  </div>

                  {/* Colonne droite : actions */}
                  <div className="flex flex-wrap items-center gap-2">
                    {a.status === 'pending' && (
                      <Button
                        size="sm"
                        onClick={() => updateStatus(a.id, 'confirmed')}
                        disabled={busy}
                        className="gap-1.5 rounded-lg bg-[#00A651] text-white hover:bg-[#008f47]"
                      >
                        {busy ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <Check className="size-3.5" />
                        )}
                        Confirmer
                      </Button>
                    )}
                    {(a.status === 'pending' || a.status === 'confirmed') && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => updateStatus(a.id, 'cancelled')}
                        disabled={busy}
                        className="gap-1.5 rounded-lg border-[#DC2626]/40 text-[#DC2626] hover:bg-[#DC2626]/5"
                      >
                        <X className="size-3.5" />
                        Annuler
                      </Button>
                    )}
                    {a.status === 'confirmed' && (
                      <Button
                        size="sm"
                        onClick={() => updateStatus(a.id, 'completed')}
                        disabled={busy}
                        className="gap-1.5 rounded-lg bg-[#0026A3] text-white hover:bg-[#1E40AF]"
                      >
                        {busy ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <Check className="size-3.5" />
                        )}
                        Terminer
                      </Button>
                    )}
                  </div>
                </div>

                {/* --- Ligne d'assignation (RDV pending/confirmed uniquement) ---
                    Champ texte « Assigner à » + bouton « Assigner » qui
                    PATCH { assignedTo } sur /api/city/appointments/[id].
                    Pré-rempli avec l'email déjà assigné le cas échéant. */}
                {canAssign && (
                  <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[#d5d3d4] pt-3">
                    <label
                      htmlFor={`assign-${a.id}`}
                      className="text-xs font-semibold uppercase tracking-wider text-[#1A1A1A]/55"
                    >
                      Assigner à
                    </label>
                    <Input
                      id={`assign-${a.id}`}
                      type="email"
                      value={assignValue}
                      onChange={(e) =>
                        setAssignEmails((prev) => ({
                          ...prev,
                          [a.id]: e.target.value,
                        }))
                      }
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          assignRdv(a.id, assignValue)
                        }
                      }}
                      placeholder="marie@mairie.sn"
                      disabled={busyAssign}
                      className="h-9 min-w-[220px] flex-1 border-[#0026A3]/20 text-sm focus:border-[#0026A3] focus-visible:ring-[#0026A3]/30"
                    />
                    <Button
                      size="sm"
                      onClick={() => assignRdv(a.id, assignValue)}
                      disabled={busyAssign || !assignValue.trim()}
                      className="gap-1.5 rounded-lg bg-[#0026A3] text-white hover:bg-[#1E40AF]"
                    >
                      {busyAssign ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Key className="size-3.5" />
                      )}
                      Assigner
                    </Button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
