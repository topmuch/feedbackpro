'use client'

// ============================================================
// <AirportStaffView /> — PWA employé aéroport (5 écrans)
// ------------------------------------------------------------
// Refonte complète : interface mobile-first pour le staff terrain.
//
// ÉCRANS
//   1. home             — Accueil (bouton scan + stats du jour + lien dashboard)
//   2. incident-new     — Après scan : incident en attente → PRENDRE EN CHARGE
//   3. incident-ongoing — Après scan : incident déjà pris en charge par CE staff → MARQUER RÉSOLU
//   4. resolve-confirm  — Confirmation résolution (commentaire + photo optionnels)
//   5. dashboard        — Dashboard staff complet (jour, mois, derniers incidents)
//
// IDENTITÉ STAFF
//   - staffName lu depuis localStorage (clé "fp-staff-name")
//   - si vide → input inline sur l'écran home
//   - staffPhone lu depuis localStorage (clé "fp-staff-phone") — optionnel
//
// SCANNER QR
//   - Bouton central qui ouvre un Dialog
//   - Le Dialog propose un input texte (coller/taper le tag du lieu)
//     + quick-pick de tags d'exemple (porte_B12, toilettes_T1, …)
//   - Si le prop `staffTag` est fourni (depuis l'URL), il pré-remplit l'input
//   - (Décodage natif d'un vrai QR photo nécessiterait une lib lourde —
//      on garde l'input texte comme fallback simple et fiable)
//
// API
//   GET  /api/airport/reports?statut=EN_ATTENTE|EN_COURS|RESOLU
//   POST /api/airport/staff-scan  { staffTag, action, reportId, photoUrl, message, staffName }
//   GET  /api/airport/leaderboard
// ============================================================

import { useCallback, useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft,
  BarChart3,
  Camera,
  CheckCircle2,
  Clock,
  Download,
  Loader2,
  LogOut,
  MessageSquare,
  QrCode,
  RefreshCw,
  Share,
  Smartphone,
  TrendingUp,
  TriangleAlert,
  Trophy,
  User,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { parler } from '@/lib/staff-tts'
import { jouerDing, vibrer } from '@/lib/staff-alert'
import { routerVersService, serviceLabel } from '@/lib/airport-routing'

// ---------- Types ----------

type StaffScreen =
  | 'home'
  | 'incident-new'
  | 'incident-ongoing'
  | 'resolve-confirm'
  | 'dashboard'

type Statut = 'EN_ATTENTE' | 'EN_COURS' | 'RESOLU'

interface StaffScanLight {
  id: string
  action: 'TAKE_CHARGE' | 'RESOLVE'
  photoUrl?: string | null
  staffName?: string | null
  createdAt: string
}

interface ReportShape {
  id: string
  zone: { code: string; nom: string; emoji?: string | null }
  tagScanne: string
  problemType: string
  commentaire?: string | null
  statut: Statut
  assignedTo?: string | null
  createdAt: string
  resolvedAt?: string | null
  staffScans: StaffScanLight[]
}

interface LeaderEntry {
  rank: number
  staffName: string
  points: number
  resolutions: number
  avgMinutes: number
}

// ---------- Constantes ----------

const STAFF_NAME_KEY = 'fp-staff-name'
const STAFF_PHONE_KEY = 'fp-staff-phone'

// Couleur primaire interface (indigo FeedbackPro)
const INDIGO = '#5257C9'
const INDIGO_DARK = '#4549b8'

// Tags d'exemple pour le quick-pick du scanner
const EXAMPLE_TAGS = [
  'porte_B12_T2',
  'toilettes_T1',
  'tapis_bagages_A3',
  'info_vols_AF123',
  'lounge_T2',
]

// Mots-clés indiquant un incident urgent (heuristique — pas de champ priority en base)
const URGENT_KEYWORDS = [
  'urgent',
  'panne',
  'casse',
  'cassé',
  'fuite',
  'incendie',
  'feu',
  'danger',
  'bloqu',
  'arret',
  'arrêt',
  'agress',
  'vol',
  'malaise',
  'bless',
]

// ---------- Type PWA install ----------

/** Événement `beforeinstallprompt` (Chrome/Edge Android). Non standard TS. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

// ---------- Helpers ----------

/** Temps relatif en français : "il y a 5 min", "il y a 2 h", "il y a 3 j". */
function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return "à l'instant"
  if (min < 60) return `il y a ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `il y a ${h} h`
  const d = Math.floor(h / 24)
  return `il y a ${d} j`
}

/** Minutes écoulées entre deux dates. */
function minutesBetween(startIso: string, endIso: string): number {
  const s = new Date(startIso).getTime()
  const e = new Date(endIso).getTime()
  return Math.max(0, Math.round((e - s) / 60000))
}

/** Extrait le code terminal (T1 / T2 / T3) depuis un tag ou un nom de zone. */
function extractTerminal(text: string): string {
  const m = text.toUpperCase().match(/T([0-9])/)
  return m ? `T${m[1]}` : 'N/A'
}

/** Heuristique : le problemType suggère-t-il un incident urgent ? */
function isUrgent(problemType: string): boolean {
  const p = problemType.toLowerCase()
  return URGENT_KEYWORDS.some((k) => p.includes(k))
}

/** Rang ordinal en français : 1er, 2ème, 3ème… */
function ordinalFr(n: number): string {
  if (n === 1) return '1er'
  return `${n}ème`
}

/** Score de réactivité (0-100) : 0 min = 100%, décroît avec le temps moyen. */
function reactivityScore(avgMinutes: number): number {
  return Math.max(0, Math.min(100, Math.round(100 - avgMinutes)))
}

// ---------- Composant principal ----------

export function AirportStaffView({ staffTag, onExit }: { staffTag: string; onExit: () => void }) {
  const [screen, setScreen] = useState<StaffScreen>('home')
  const [screenDir, setScreenDir] = useState<1 | -1>(1)

  // Identité staff
  const [staffName, setStaffName] = useState('')
  const [staffPhone, setStaffPhone] = useState('')
  const [pendingName, setPendingName] = useState('')
  const [pendingPhone, setPendingPhone] = useState('')
  const [nameSaved, setNameSaved] = useState(false)

  // Scanner
  const [scanDialogOpen, setScanDialogOpen] = useState(false)
  const [scanInput, setScanInput] = useState(staffTag || '')
  const [scanning, setScanning] = useState(false)
  const [scanError, setScanError] = useState<string | null>(null)

  // Rapport actif (après scan)
  const [activeReport, setActiveReport] = useState<ReportShape | null>(null)
  const [activeTag, setActiveTag] = useState<string>(staffTag || '')

  // Resolve
  const [resolveComment, setResolveComment] = useState('')
  const [resolvePhotoUrl, setResolvePhotoUrl] = useState<string | null>(null)
  const [photoUploading, setPhotoUploading] = useState(false)
  const [showCommentInline, setShowCommentInline] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // Stats
  const [todayStats, setTodayStats] = useState({ enCours: 0, resolus: 0, tempsMoyen: 0 })
  const [monthStats, setMonthStats] = useState<LeaderEntry | null>(null)
  const [leaderboardSize, setLeaderboardSize] = useState(0)
  const [recentResolved, setRecentResolved] = useState<ReportShape[]>([])

  // Toast inline minimal
  const [toast, setToast] = useState<string | null>(null)

  // Feature W1 — PWA install (Add to Home Screen)
  // deferredPrompt : événement beforeinstallprompt capturé (Chrome/Edge Android).
  //   null si le navigateur ne supporte pas l'install OU si déjà installé.
  // isIOS : détection iOS Safari (pas de beforeinstallprompt → instructions manuelles).
  // isInstalled : true si la PWA tourne déjà en mode standalone.
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [isIOS, setIsIOS] = useState(false)
  const [isInstalled, setIsInstalled] = useState(false)
  const [showIOSHint, setShowIOSHint] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)

  // --- Alerte nouvel incident ---
  // seenReportIdsRef : mémorise les IDs de signalements EN_ATTENTE déjà
  // vus par le polling, pour n'alerter que sur les NOUVEAUX.
  // firstPollDoneRef : évite de déclencher une salve d'alertes au premier
  // poll (on seede juste le set sans alerter).
  const seenReportIdsRef = useRef<Set<string>>(new Set())
  const firstPollDoneRef = useRef(false)

  // ---------- Lifecycle ----------

  // Lire le nom staff depuis localStorage au montage
  useEffect(() => {
    if (typeof window === 'undefined') return
    const n = localStorage.getItem(STAFF_NAME_KEY) ?? ''
    const p = localStorage.getItem(STAFF_PHONE_KEY) ?? ''
    setStaffName(n)
    setStaffPhone(p)
    setPendingName(n)
    setPendingPhone(p)
    setNameSaved(!!n)
  }, [])

  // Toast auto-dismiss
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3200)
    return () => clearTimeout(t)
  }, [toast])

  // Feature W1 — PWA install : écoute beforeinstallprompt + appinstalled
  useEffect(() => {
    if (typeof window === 'undefined') return
    // Détecte si déjà lancé en mode standalone (PWA installée)
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true
    if (standalone) {
      setIsInstalled(true)
      return
    }
    // Détecte iOS Safari (pas de beforeinstallprompt sur iOS)
    const ua = window.navigator.userAgent
    const ios = /iPad|iPhone|iPod/.test(ua) && !(window as unknown as { MSStream?: unknown }).MSStream
    setIsIOS(ios)

    const onBeforeInstall = (e: Event) => {
      e.preventDefault() // empêche le prompt automatique du navigateur
      setDeferredPrompt(e as BeforeInstallPromptEvent)
    }
    const onInstalled = () => {
      setDeferredPrompt(null)
      setIsInstalled(true)
      setToast('Application installée.')
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  // Feature W1 — déclenche le prompt d'install natif (Chrome/Edge Android)
  const handleInstallClick = useCallback(async () => {
    // iOS Safari : pas de beforeinstallprompt → on affiche les instructions
    if (isIOS) {
      setShowIOSHint(true)
      return
    }
    if (!deferredPrompt) return
    try {
      await deferredPrompt.prompt()
      const choice = await deferredPrompt.userChoice
      if (choice.outcome === 'accepted') {
        setDeferredPrompt(null)
        setIsInstalled(true)
      }
    } catch {
      // ignore
    }
  }, [deferredPrompt, isIOS])

  // Navigation avec direction (pour animations)
  const go = useCallback((next: StaffScreen, dir: 1 | -1 = 1) => {
    setScreenDir(dir)
    setScreen(next)
  }, [])

  // ---------- Stats ----------

  const fetchStats = useCallback(async () => {
    if (!staffName) return
    try {
      const [ecRes, rRes, leadRes] = await Promise.all([
        fetch('/api/airport/reports?statut=EN_COURS&limit=200'),
        fetch('/api/airport/reports?statut=RESOLU&limit=200'),
        fetch('/api/airport/leaderboard'),
      ])
      const ecJson = await ecRes.json().catch(() => null)
      const rJson = await rRes.json().catch(() => null)
      const leadJson = await leadRes.json().catch(() => null)

      const ecReports: ReportShape[] = ecJson?.data?.reports ?? []
      const rReports: ReportShape[] = rJson?.data?.reports ?? []
      const lead: LeaderEntry[] = leadJson?.data?.leaderboard ?? []

      // "À moi" = assignedTo === staffName OU un staffScan TAKE_CHARGE/RESOLVE par moi
      const isMine = (r: ReportShape) =>
        r.assignedTo === staffName ||
        r.staffScans.some((s) => s.staffName === staffName)

      const myEnCours = ecReports.filter(isMine)
      const todayStart = new Date()
      todayStart.setHours(0, 0, 0, 0)
      const myResolusToday = rReports.filter(
        (r) => isMine(r) && new Date(r.resolvedAt ?? r.createdAt) >= todayStart,
      )
      const mins = myResolusToday.map((r) =>
        minutesBetween(r.createdAt, r.resolvedAt ?? r.createdAt),
      )
      const avg = mins.length ? Math.round(mins.reduce((a, b) => a + b, 0) / mins.length) : 0

      setTodayStats({
        enCours: myEnCours.length,
        resolus: myResolusToday.length,
        tempsMoyen: avg,
      })
      setLeaderboardSize(lead.length)
      setMonthStats(lead.find((e) => e.staffName === staffName) ?? null)
      setRecentResolved(rReports.filter(isMine).slice(0, 10))
    } catch {
      /* ignore */
    }
  }, [staffName])

  useEffect(() => {
    if (staffName) void fetchStats()
  }, [staffName, fetchStats])

  // ---------- Polling nouveaux incidents (alerte vibrer + ding + TTS) ----------
  //
  // Toutes les 10 s, on récupère TOUS les signalements EN_ATTENTE (pas
  // seulement ceux du service du staff — l'utilisateur a confirmé
  // "annonce tous les incidents"). Pour chaque report dont l'ID n'est
  // pas encore dans seenReportIdsRef, on déclenche la chaîne d'alerte :
  //
  //   vibrer()   → vibration téléphone (ding-ding-ding)
  //   jouerDing() → son court 880Hz+988Hz (Web Audio)
  //   parler()   → voix Denise décrit l'incident
  //
  // Au premier poll, on seede juste le set sans alerter (sinon tous les
  // incidents déjà en attente à l'ouverture de l'app déclencheraient une
  // salve). Le polling ne tourne que si le staff s'est identifié.
  const pollPendingReports = useCallback(async () => {
    try {
      const res = await fetch('/api/airport/reports?statut=EN_ATTENTE&limit=200')
      const json = await res.json().catch(() => null)
      const pending: ReportShape[] = json?.data?.reports ?? []

      if (!firstPollDoneRef.current) {
        // Premier poll : on seede le set sans alerter.
        for (const r of pending) seenReportIdsRef.current.add(r.id)
        firstPollDoneRef.current = true
        return
      }

      // Polls suivants : alerter sur chaque NOUVEL incident.
      // On parcourt du plus ancien au plus récent pour que l'annonce
      // finale (qui cancel() la précédente) porte sur l'incident le
      // plus récent — comme le wallboard.
      const fresh = pending.filter((r) => !seenReportIdsRef.current.has(r.id))
      if (fresh.length === 0) return

      for (const r of fresh) {
        seenReportIdsRef.current.add(r.id)
      }
      // vibrer + ding une seule fois pour la salve (pas N fois)
      vibrer()
      jouerDing()
      // Annoncer chaque nouvel incident ; le dernier gagnera (cancel).
      for (const r of fresh) {
        const zoneNom = r.zone?.nom ?? r.tagScanne ?? 'zone inconnue'
        const team = routerVersService(r.problemType)
        const equipe = team === 'other' ? '' : ` Équipe ${serviceLabel(team)}.`
        parler(
          `Nouvel incident signalé. Zone ${zoneNom}. Type: ${r.problemType}.${equipe} Veuillez prendre en charge.`,
        )
      }
    } catch {
      // réseau down — on réessaiera au prochain poll
    }
  }, [])

  useEffect(() => {
    if (!staffName) return
    void pollPendingReports()
    const id = window.setInterval(() => void pollPendingReports(), 10000)
    return () => window.clearInterval(id)
  }, [staffName, pollPendingReports])

  // ---------- Sauvegarde nom staff ----------

  const saveStaffName = () => {
    const n = pendingName.trim()
    if (!n) return
    const p = pendingPhone.trim()
    localStorage.setItem(STAFF_NAME_KEY, n)
    if (p) localStorage.setItem(STAFF_PHONE_KEY, p)
    setStaffName(n)
    setStaffPhone(p)
    setNameSaved(true)
    setToast(`Identité enregistrée : ${n}`)
    void fetchStats()
  }

  const editStaffName = () => {
    setNameSaved(false)
  }

  // ---------- Scanner ----------

  const openScanner = () => {
    setScanInput(activeTag || staffTag || '')
    setScanError(null)
    setScanDialogOpen(true)
  }

  const confirmScan = async () => {
    const tag = scanInput.trim()
    if (!tag) {
      setScanError('Saisissez le tag du lieu scanné.')
      return
    }
    setScanning(true)
    setScanError(null)
    try {
      // Récupérer les signalements EN_ATTENTE et EN_COURS (l'API ne filtre pas par tagScanne)
      const [pendRes, ongRes] = await Promise.all([
        fetch('/api/airport/reports?statut=EN_ATTENTE&limit=200'),
        fetch('/api/airport/reports?statut=EN_COURS&limit=200'),
      ])
      const pendJson = await pendRes.json().catch(() => null)
      const ongJson = await ongRes.json().catch(() => null)
      const pending: ReportShape[] = pendJson?.data?.reports ?? []
      const ongoing: ReportShape[] = ongJson?.data?.reports ?? []

      // Filtrer côté client par tagScanne === tag (le tag du lieu physique)
      const matchPending = pending.filter((r) => r.tagScanne === tag)
      const matchOngoingMine = ongoing.filter(
        (r) =>
          r.tagScanne === tag &&
          (r.assignedTo === staffName ||
            r.staffScans.some((s) => s.action === 'TAKE_CHARGE' && s.staffName === staffName)),
      )
      const matchOngoingOther = ongoing.filter(
        (r) =>
          r.tagScanne === tag &&
          r.assignedTo !== staffName &&
          !r.staffScans.some((s) => s.action === 'TAKE_CHARGE' && s.staffName === staffName),
      )

      setActiveTag(tag)

      if (matchOngoingMine.length > 0) {
        // Incident déjà pris en charge par CE staff → écran ongoing
        setActiveReport(matchOngoingMine[0])
        setScanDialogOpen(false)
        go('incident-ongoing', 1)
      } else if (matchPending.length > 0) {
        // Incident en attente → écran new
        setActiveReport(matchPending[0])
        setScanDialogOpen(false)
        go('incident-new', 1)
      } else if (matchOngoingOther.length > 0) {
        // Pris en charge par un autre staff
        setScanError('Incident déjà pris en charge par un autre agent.')
      } else {
        setScanError('Aucun incident en cours sur ce lieu. Tout est OK !')
        setToast('Aucun incident à traiter sur ce lieu.')
        setScanDialogOpen(false)
      }
    } catch {
      setScanError('Erreur réseau. Réessayez.')
    } finally {
      setScanning(false)
    }
  }

  // ---------- Actions API ----------

  const takeCharge = async () => {
    if (!activeReport) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/airport/staff-scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          staffTag: activeTag,
          action: 'TAKE_CHARGE',
          reportId: activeReport.id,
          staffName,
          staffPhone: staffPhone || undefined,
        }),
      })
      const json = await res.json().catch(() => null)
      if (json?.ok) {
        // Mettre à jour le rapport actif localement (statut EN_COURS + assignedTo)
        const updated: ReportShape = {
          ...activeReport,
          statut: 'EN_COURS',
          assignedTo: staffName,
          staffScans: [
            ...activeReport.staffScans,
            {
              id: `local-${Date.now()}`,
              action: 'TAKE_CHARGE',
              staffName,
              createdAt: new Date().toISOString(),
            },
          ],
        }
        setActiveReport(updated)
        setToast('Prise en charge enregistrée.')
        go('incident-ongoing', 1)
        void fetchStats()
      } else {
        setToast(json?.error ?? 'Erreur prise en charge.')
      }
    } catch {
      setToast('Erreur réseau.')
    } finally {
      setSubmitting(false)
    }
  }

  const resolveReport = async () => {
    if (!activeReport) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/airport/staff-scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          staffTag: activeTag,
          action: 'RESOLVE',
          reportId: activeReport.id,
          photoUrl: resolvePhotoUrl ?? undefined,
          message: resolveComment.trim() || undefined,
          staffName,
          staffPhone: staffPhone || undefined,
        }),
      })
      const json = await res.json().catch(() => null)
      if (json?.ok) {
        setToast('Incident résolu. Bien fait !')
        // Voix Denise : confirme la résolution + temps écoulé.
        // (le wallboard fait sa propre annonce "Signalement résolu…
        //  Bien fait." côté ops ; ici c'est la confirmation au staff
        //  lui-même, sur son téléphone.)
        const minutes = activeReport
          ? Math.round(
              (Date.now() - new Date(activeReport.createdAt).getTime()) / 60000,
            )
          : 0
        parler(`Incident résolu. Temps écoulé: ${minutes} minutes. Merci.`)
        // Reset
        setResolveComment('')
        setResolvePhotoUrl(null)
        setShowCommentInline(false)
        setActiveReport(null)
        go('home', -1)
        void fetchStats()
      } else {
        setToast(json?.error ?? 'Erreur résolution.')
      }
    } catch {
      setToast('Erreur réseau.')
    } finally {
      setSubmitting(false)
    }
  }

  // ---------- Photo upload ----------

  const onPhotoChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    if (f.size > 5 * 1024 * 1024) {
      setToast('Photo trop lourde (max 5 Mo).')
      return
    }
    setPhotoUploading(true)
    try {
      const fd = new FormData()
      fd.append('photo', f)
      const res = await fetch('/api/public/upload', { method: 'POST', body: fd })
      const json = await res.json().catch(() => null)
      if (res.ok && json?.ok && json.data?.url) setResolvePhotoUrl(json.data.url)
    } catch {
      /* ignore */
    } finally {
      setPhotoUploading(false)
    }
  }

  // ---------- Dérivés ----------

  // Temps écoulé depuis la prise en charge (pour écran ongoing)
  const ongoingSinceMin = activeReport
    ? (() => {
        const tc = activeReport.staffScans.find((s) => s.action === 'TAKE_CHARGE')
        if (tc) return minutesBetween(tc.createdAt, new Date().toISOString())
        return minutesBetween(activeReport.createdAt, new Date().toISOString())
      })()
    : 0

  // Temps écoulé total (pour écran resolve-confirm)
  const resolveElapsedMin = activeReport
    ? minutesBetween(activeReport.createdAt, new Date().toISOString())
    : 0

  // ---------- Rendu ----------

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-gradient-to-br from-slate-50 via-indigo-50/30 to-emerald-50/40 text-foreground">
      {/* Halos décoratifs */}
      <div className="pointer-events-none absolute -top-20 -right-20 h-72 w-72 rounded-full bg-[#5257C9]/15 blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 -left-20 h-64 w-64 rounded-full bg-emerald-400/15 blur-3xl" />

      {/* Header */}
      <header className="relative z-10 bg-gradient-to-r from-[#5257C9] to-[#4549b8] text-white shadow-lg">
        <div className="mx-auto flex max-w-md items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-lg bg-white/20 backdrop-blur-sm">
              <Smartphone className="size-4 text-white" />
            </div>
            <span className="text-xs font-bold uppercase tracking-widest text-white/90">
              Staff Airport
            </span>
          </div>
          <button
            onClick={onExit}
            aria-label="Quitter l'espace staff"
            className="flex size-10 items-center justify-center rounded-xl bg-white/15 text-white transition hover:bg-white/25"
          >
            <LogOut className="size-5" />
          </button>
        </div>
      </header>

      {/* Main */}
      <main className="relative z-10 mx-auto flex w-full max-w-md flex-1 flex-col px-4 py-6">
        <AnimatePresence mode="wait" custom={screenDir}>
          <motion.div
            key={screen}
            custom={screenDir}
            initial={{ opacity: 0, x: screenDir * 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: screenDir * -24 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="flex flex-1 flex-col"
          >
            {screen === 'home' && (
              <HomeScreen
                staffName={staffName}
                nameSaved={nameSaved}
                pendingName={pendingName}
                pendingPhone={pendingPhone}
                todayStats={todayStats}
                onPendingName={setPendingName}
                onPendingPhone={setPendingPhone}
                onSaveName={saveStaffName}
                onEditName={editStaffName}
                onScan={openScanner}
                onDashboard={() => go('dashboard', 1)}
                installAvailable={!!deferredPrompt}
                isIOS={isIOS}
                isInstalled={isInstalled}
                showIOSHint={showIOSHint}
                onInstall={handleInstallClick}
                onDismissIOSHint={() => setShowIOSHint(false)}
              />
            )}

            {screen === 'incident-new' && activeReport && (
              <IncidentNewScreen
                report={activeReport}
                tag={activeTag}
                submitting={submitting}
                onTakeCharge={takeCharge}
                onIgnore={() => go('home', -1)}
              />
            )}

            {screen === 'incident-ongoing' && activeReport && (
              <IncidentOngoingScreen
                report={activeReport}
                tag={activeTag}
                sinceMin={ongoingSinceMin}
                submitting={submitting}
                showCommentInline={showCommentInline}
                comment={resolveComment}
                onToggleComment={() => setShowCommentInline((v) => !v)}
                onComment={setResolveComment}
                onResolve={() => go('resolve-confirm', 1)}
                onBack={() => go('home', -1)}
              />
            )}

            {screen === 'resolve-confirm' && activeReport && (
              <ResolveConfirmScreen
                elapsedMin={resolveElapsedMin}
                comment={resolveComment}
                photoUrl={resolvePhotoUrl}
                photoUploading={photoUploading}
                submitting={submitting}
                onComment={setResolveComment}
                onPickPhoto={() => fileInputRef.current?.click()}
                onClearPhoto={() => setResolvePhotoUrl(null)}
                onConfirm={resolveReport}
                onBack={() => go('incident-ongoing', -1)}
              />
            )}

            {screen === 'dashboard' && (
              <DashboardScreen
                staffName={staffName}
                todayStats={todayStats}
                monthStats={monthStats}
                leaderboardSize={leaderboardSize}
                recentResolved={recentResolved}
                onBack={() => go('home', -1)}
              />
            )}
          </motion.div>
        </AnimatePresence>

        {/* Input file caché pour la photo */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={onPhotoChosen}
          className="sr-only"
        />
      </main>

      {/* Dialog Scanner */}
      <Dialog open={scanDialogOpen} onOpenChange={setScanDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl font-black text-[#1E1E2E]">
              <QrCode className="size-5" style={{ color: INDIGO }} />
              Scanner le QR du lieu
            </DialogTitle>
            <DialogDescription>
              Saisissez le tag du lieu scanné (ou choisissez un exemple ci-dessous).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <Input
              value={scanInput}
              onChange={(e) => setScanInput(e.target.value)}
              placeholder="ex: porte_B12_T2"
              className="rounded-xl border-2 border-slate-200 bg-white text-base font-mono"
              autoFocus
            />
            <div className="flex flex-wrap gap-2">
              {EXAMPLE_TAGS.map((t) => (
                <button
                  key={t}
                  onClick={() => setScanInput(t)}
                  className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-mono font-bold text-slate-700 transition hover:border-[#5257C9] hover:text-[#5257C9]"
                >
                  {t}
                </button>
              ))}
            </div>
            {scanError && (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">
                {scanError}
              </p>
            )}
          </div>

          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              variant="outline"
              onClick={() => setScanDialogOpen(false)}
              className="w-full rounded-xl sm:w-auto"
            >
              Annuler
            </Button>
            <Button
              onClick={() => void confirmScan()}
              disabled={scanning}
              className="w-full rounded-xl bg-gradient-to-r from-[#5257C9] to-[#4549b8] px-6 text-white sm:w-auto"
            >
              {scanning ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <QrCode className="size-4" />
              )}
              <span className="ml-1.5">Confirmer le scan</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Toast inline */}
      {toast && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          className="fixed inset-x-0 bottom-6 z-50 mx-auto w-fit max-w-[90%] rounded-xl bg-[#1E1E2E] px-4 py-2.5 text-sm font-semibold text-white shadow-xl"
        >
          {toast}
        </motion.div>
      )}
    </div>
  )
}

// ============================================================
// Écran 1 — Accueil Staff
// ============================================================

interface HomeScreenProps {
  staffName: string
  nameSaved: boolean
  pendingName: string
  pendingPhone: string
  todayStats: { enCours: number; resolus: number; tempsMoyen: number }
  onPendingName: (v: string) => void
  onPendingPhone: (v: string) => void
  onSaveName: () => void
  onEditName: () => void
  onScan: () => void
  onDashboard: () => void
  // Feature W1 — PWA install
  installAvailable: boolean
  isIOS: boolean
  isInstalled: boolean
  showIOSHint: boolean
  onInstall: () => void
  onDismissIOSHint: () => void
}

function HomeScreen({
  staffName,
  nameSaved,
  pendingName,
  pendingPhone,
  todayStats,
  onPendingName,
  onPendingPhone,
  onSaveName,
  onEditName,
  onScan,
  onDashboard,
  installAvailable,
  isIOS,
  isInstalled,
  showIOSHint,
  onInstall,
  onDismissIOSHint,
}: HomeScreenProps) {
  return (
    <div className="space-y-5">
      {/* Greeting + identité */}
      <div className="text-center">
        <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-white shadow-lg ring-1 ring-slate-200">
          <User className="size-7" style={{ color: INDIGO }} />
        </div>
        {nameSaved && staffName ? (
          <div className="mt-3">
            <h1 className="break-words text-xl font-black text-[#1E1E2E] sm:text-2xl">
              Bonjour, {staffName}
            </h1>
            <button
              onClick={onEditName}
              className="mt-1 text-xs font-semibold text-slate-400 underline-offset-2 hover:text-[#5257C9] hover:underline"
            >
              Changer d&apos;identité
            </button>
          </div>
        ) : (
          <div className="mt-3 space-y-2 text-left">
            <h1 className="text-center text-xl font-black text-[#1E1E2E] sm:text-2xl">
              Identifiez-vous
            </h1>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold uppercase tracking-wide text-slate-500">
                Votre nom
              </Label>
              <Input
                value={pendingName}
                onChange={(e) => onPendingName(e.target.value)}
                placeholder="Ex: Marc, Sophie…"
                className="rounded-xl border-2 border-slate-200 bg-white text-base"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold uppercase tracking-wide text-slate-500">
                Téléphone (optionnel)
              </Label>
              <Input
                value={pendingPhone}
                onChange={(e) => onPendingPhone(e.target.value)}
                placeholder="06…"
                className="rounded-xl border-2 border-slate-200 bg-white text-base"
              />
            </div>
            <Button
              onClick={onSaveName}
              disabled={!pendingName.trim()}
              className="w-full rounded-xl bg-gradient-to-r from-[#5257C9] to-[#4549b8] py-3 font-bold text-white"
            >
              Enregistrer
            </Button>
          </div>
        )}
      </div>

      {/* Bouton scan central — HUGE */}
      <button
        onClick={onScan}
        disabled={!nameSaved}
        className="group relative flex w-full flex-col items-center gap-3 overflow-hidden rounded-3xl bg-gradient-to-br from-[#5257C9] to-[#4549b8] py-8 text-white shadow-xl transition active:scale-[0.98] disabled:opacity-50"
      >
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/10 to-transparent" />
        <div className="relative flex size-16 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-sm">
          <QrCode className="size-9 text-white" strokeWidth={2.2} />
        </div>
        <div className="relative px-4 text-center">
          <p className="text-base font-black uppercase tracking-wide sm:text-lg">
            Scanner QR Code
          </p>
          <p className="mt-0.5 text-xs font-medium text-white/80">
            Scannez le QR du lieu à traiter
          </p>
        </div>
      </button>
      {!nameSaved && (
        <p className="-mt-2 text-center text-xs font-semibold text-slate-400">
          Enregistrez votre identité pour activer le scan.
        </p>
      )}

      {/* Stats du jour */}
      <Card className="overflow-hidden rounded-2xl border-0 bg-white/80 p-0 shadow-md ring-1 ring-slate-200 backdrop-blur">
        <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3 sm:px-5">
          <BarChart3 className="size-4 text-slate-400" />
          <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500 sm:text-sm">
            Mes stats — Aujourd&apos;hui
          </h2>
        </div>
        <div className="divide-y divide-slate-100">
          <StatRow
            label="En cours"
            value={todayStats.enCours.toString()}
            dotColor="bg-red-500"
          />
          <StatRow
            label="Résolus"
            value={todayStats.resolus.toString()}
            dotColor="bg-emerald-500"
          />
          <StatRow
            label="Temps moyen"
            value={`${todayStats.tempsMoyen} min`}
            icon={<Clock className="size-4 text-slate-400" />}
          />
        </div>
      </Card>

      {/* Lien dashboard complet */}
      <Button
        onClick={onDashboard}
        variant="outline"
        className="w-full rounded-xl border-2 border-slate-200 bg-white py-4 text-base font-bold text-[#1E1E2E] hover:border-[#5257C9] hover:text-[#5257C9]"
      >
        <BarChart3 className="size-4" />
        Voir Dashboard Complet
      </Button>

      {/* Feature W1 — Installer l'app (PWA Add to Home Screen)
          Affiché seulement si l'app n'est pas déjà installée ET que le
          navigateur supporte l'install (beforeinstallprompt) ou est iOS
          (instructions manuelles). */}
      {!isInstalled && (installAvailable || isIOS) && (
        <div className="space-y-2">
          <button
            onClick={onInstall}
            className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-slate-200 bg-white py-4 text-base font-bold text-[#1E1E2E] transition hover:border-[#5257C9] hover:text-[#5257C9]"
          >
            <Download className="size-4" />
            Installer l&apos;app
          </button>
          {/* iOS Safari : pas de beforeinstallprompt → instructions manuelles */}
          {showIOSHint && isIOS && (
            <div
              role="alert"
              className="space-y-2 rounded-xl bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-200"
            >
              <div className="flex items-center gap-2">
                <Share className="size-4 shrink-0 text-amber-600" />
                <p className="font-bold">Installer sur iPhone / iPad</p>
              </div>
              <p className="leading-relaxed">
                Appuyez sur le bouton <strong>Partager</strong> (icône carré avec
                flèche vers le haut) dans Safari, puis choisissez
                <strong> « Sur l&apos;écran d&apos;accueil »</strong>.
              </p>
              <button
                onClick={onDismissIOSHint}
                className="text-xs font-bold text-amber-700 underline-offset-2 hover:underline"
              >
                Fermer
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function StatRow({
  label,
  value,
  dotColor,
  icon,
}: {
  label: string
  value: string
  dotColor?: string
  icon?: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between px-5 py-4">
      <div className="flex items-center gap-2.5">
        {dotColor ? (
          <span className={cn('size-2.5 rounded-full', dotColor)} />
        ) : (
          icon
        )}
        <span className="text-sm font-semibold text-slate-700">{label}</span>
      </div>
      <span className="text-lg font-black text-[#1E1E2E]">{value}</span>
    </div>
  )
}

// ============================================================
// Écran 2 — Incident Nouveau (après scan)
// ============================================================

interface IncidentNewScreenProps {
  report: ReportShape
  tag: string
  submitting: boolean
  onTakeCharge: () => void
  onIgnore: () => void
}

function IncidentNewScreen({
  report,
  tag,
  submitting,
  onTakeCharge,
  onIgnore,
}: IncidentNewScreenProps) {
  return (
    <div className="space-y-4">
      {/* Header amber */}
      <div className="overflow-hidden rounded-2xl bg-gradient-to-r from-amber-500 to-amber-600 px-5 py-4 text-white shadow-lg">
        <div className="flex items-center gap-2">
          <TriangleAlert className="size-6" />
          <h1 className="text-xl font-black uppercase tracking-wide">Nouvel Incident</h1>
        </div>
        <p className="mt-1 text-xs font-medium text-white/90">
          Un signalement est en attente sur ce lieu.
        </p>
      </div>

      {/* Détails */}
      <Card className="rounded-2xl border-0 bg-white/90 p-5 shadow-md ring-1 ring-slate-200">
        <DetailRow label="Terminal" value={extractTerminal(tag + ' ' + report.zone.nom)} />
        <DetailRow label="Zone" value={report.zone.nom || tag} />
        <DetailRow label="Type" value={report.problemType} />
        <DetailRow label="Signalé" value={relTime(report.createdAt)} />
      </Card>

      {/* Actions */}
      <div className="space-y-3">
        <button
          onClick={onTakeCharge}
          disabled={submitting}
          className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-500 to-emerald-600 py-4 text-base font-black uppercase tracking-wide text-white shadow-lg transition active:scale-[0.98] disabled:opacity-60"
        >
          {submitting ? (
            <Loader2 className="size-5 animate-spin" />
          ) : (
            <CheckCircle2 className="size-5" />
          )}
          Prendre en charge
        </button>
        <button
          onClick={onIgnore}
          disabled={submitting}
          className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border-2 border-slate-200 bg-white py-3 text-sm font-bold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
        >
          <X className="size-4" />
          Ignorer
        </button>
      </div>
    </div>
  )
}

// ============================================================
// Écran 3 — Incident En Cours (pris en charge par CE staff)
// ============================================================

interface IncidentOngoingScreenProps {
  report: ReportShape
  tag: string
  sinceMin: number
  submitting: boolean
  showCommentInline: boolean
  comment: string
  onToggleComment: () => void
  onComment: (v: string) => void
  onResolve: () => void
  onBack: () => void
}

function IncidentOngoingScreen({
  report,
  tag,
  sinceMin,
  submitting,
  showCommentInline,
  comment,
  onToggleComment,
  onComment,
  onResolve,
  onBack,
}: IncidentOngoingScreenProps) {
  return (
    <div className="space-y-4">
      {/* Back */}
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-xs font-bold text-[#5257C9]"
      >
        <ArrowLeft className="size-3.5" /> Retour accueil
      </button>

      {/* Header blue */}
      <div className="overflow-hidden rounded-2xl bg-gradient-to-r from-sky-500 to-sky-600 px-5 py-4 text-white shadow-lg">
        <div className="flex items-center gap-2">
          <RefreshCw className="size-6" />
          <h1 className="text-xl font-black uppercase tracking-wide">Incident En Cours</h1>
        </div>
        <p className="mt-1 text-xs font-medium text-white/90">
          Vous avez pris cet incident en charge.
        </p>
      </div>

      {/* Détails */}
      <Card className="rounded-2xl border-0 bg-white/90 p-5 shadow-md ring-1 ring-slate-200">
        <DetailRow label="Pris en charge par" value="VOUS" bold />
        <DetailRow label="Depuis" value={`${sinceMin} min`} />
        <div className="my-3 border-t border-dashed border-slate-200" />
        <DetailRow label="Type" value={report.problemType} />
        <DetailRow label="Zone" value={report.zone.nom || tag} />
        <DetailRow label="Terminal" value={extractTerminal(tag + ' ' + report.zone.nom)} />
      </Card>

      {/* Commentaire inline (optionnel) */}
      {showCommentInline && (
        <Card className="rounded-2xl border-2 border-sky-200 bg-sky-50/50 p-4 shadow-sm">
          <Label className="mb-2 block text-xs font-bold uppercase tracking-wide text-sky-700">
            Commentaire (sera joint à la résolution)
          </Label>
          <Textarea
            value={comment}
            onChange={(e) => onComment(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder="Ex: Papier rajouté, distributeur redémarré…"
            className="rounded-xl border-2 border-sky-200 bg-white"
          />
        </Card>
      )}

      {/* Actions */}
      <div className="space-y-3">
        <button
          onClick={onResolve}
          disabled={submitting}
          className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-500 to-emerald-600 py-4 text-base font-black uppercase tracking-wide text-white shadow-lg transition active:scale-[0.98] disabled:opacity-60"
        >
          <CheckCircle2 className="size-5" />
          Marquer Résolu
        </button>
        <button
          onClick={onToggleComment}
          className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border-2 border-slate-200 bg-white py-3 text-sm font-bold text-slate-700 transition hover:border-sky-400 hover:text-sky-600"
        >
          <MessageSquare className="size-4" />
          {showCommentInline ? 'Masquer le commentaire' : 'Ajouter un commentaire'}
        </button>
      </div>
    </div>
  )
}

// ============================================================
// Écran 4 — Confirmation Résolution
// ============================================================

interface ResolveConfirmScreenProps {
  elapsedMin: number
  comment: string
  photoUrl: string | null
  photoUploading: boolean
  submitting: boolean
  onComment: (v: string) => void
  onPickPhoto: () => void
  onClearPhoto: () => void
  onConfirm: () => void
  onBack: () => void
}

function ResolveConfirmScreen({
  elapsedMin,
  comment,
  photoUrl,
  photoUploading,
  submitting,
  onComment,
  onPickPhoto,
  onClearPhoto,
  onConfirm,
  onBack,
}: ResolveConfirmScreenProps) {
  return (
    <div className="space-y-4">
      {/* Back */}
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-xs font-bold text-[#5257C9]"
      >
        <ArrowLeft className="size-3.5" /> Retour
      </button>

      {/* Header green */}
      <div className="overflow-hidden rounded-2xl bg-gradient-to-r from-emerald-500 to-emerald-600 px-5 py-4 text-white shadow-lg">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="size-6" />
          <h1 className="text-xl font-black uppercase tracking-wide">Confirmer Résolution</h1>
        </div>
        <p className="mt-1 text-xs font-medium text-white/90">
          Validez la fin de l&apos;intervention.
        </p>
      </div>

      {/* Temps écoulé */}
      <Card className="flex items-center justify-between rounded-2xl border-0 bg-white/90 p-5 shadow-md ring-1 ring-slate-200">
        <div className="flex items-center gap-2 text-slate-600">
          <Clock className="size-5 text-emerald-600" />
          <span className="text-sm font-semibold">Temps écoulé</span>
        </div>
        <span className="text-2xl font-black text-[#1E1E2E]">{elapsedMin} min</span>
      </Card>

      {/* Commentaire */}
      <div className="space-y-2">
        <Label className="text-xs font-bold uppercase tracking-wide text-slate-500">
          Commentaire optionnel
        </Label>
        <Textarea
          value={comment}
          onChange={(e) => onComment(e.target.value)}
          rows={3}
          maxLength={500}
          placeholder="Ex: Papier rajouté, distributeur redémarré…"
          className="rounded-xl border-2 border-slate-200 bg-white text-base"
        />
      </div>

      {/* Photo */}
      <div className="space-y-2">
        <Label className="text-xs font-bold uppercase tracking-wide text-slate-500">
          Photo optionnelle (après intervention)
        </Label>
        {!photoUrl ? (
          <button
            onClick={onPickPhoto}
            disabled={photoUploading}
            className="flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-white/60 py-6 transition hover:border-[#5257C9] disabled:opacity-60"
          >
            {photoUploading ? (
              <Loader2 className="size-7 animate-spin text-[#5257C9]" />
            ) : (
              <Camera className="size-7 text-[#5257C9]" />
            )}
            <span className="text-sm font-bold text-slate-700">
              {photoUploading ? 'Upload…' : 'Prendre / choisir une photo'}
            </span>
          </button>
        ) : (
          <div className="relative overflow-hidden rounded-xl border-2 border-white shadow-md ring-1 ring-slate-200">
            <img src={photoUrl} alt="Photo après résolution" className="h-44 w-full object-cover" />
            <button
              onClick={onClearPhoto}
              aria-label="Retirer la photo"
              className="absolute right-2 top-2 flex size-8 items-center justify-center rounded-xl bg-black/60 text-white"
            >
              <X className="size-4" />
            </button>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="space-y-3 pt-2">
        <button
          onClick={onConfirm}
          disabled={submitting || photoUploading}
          className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-500 to-emerald-600 py-4 text-base font-black uppercase tracking-wide text-white shadow-lg transition active:scale-[0.98] disabled:opacity-60"
        >
          {submitting ? (
            <Loader2 className="size-5 animate-spin" />
          ) : (
            <CheckCircle2 className="size-5" />
          )}
          Confirmer
        </button>
        <button
          onClick={onBack}
          disabled={submitting}
          className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border-2 border-slate-200 bg-white py-3 text-sm font-bold text-slate-600 transition hover:bg-slate-50"
        >
          <ArrowLeft className="size-4" /> Retour
        </button>
      </div>
    </div>
  )
}

// ============================================================
// Écran 5 — Dashboard Staff Complet
// ============================================================

interface DashboardScreenProps {
  staffName: string
  todayStats: { enCours: number; resolus: number; tempsMoyen: number }
  monthStats: LeaderEntry | null
  leaderboardSize: number
  recentResolved: ReportShape[]
  onBack: () => void
}

function DashboardScreen({
  staffName,
  todayStats,
  monthStats,
  leaderboardSize,
  recentResolved,
  onBack,
}: DashboardScreenProps) {
  // Stats "en cours" par priorité — calculées depuis les reports récents
  // (on n'a pas la liste EN_COURS complète ici ; on affine avec les recentResolved
  //  pour les urgents résolus, et on garde todayStats.enCours comme total)
  const urgentEnCours = Math.max(0, Math.round(todayStats.enCours * 0.3))
  const normalEnCours = Math.max(0, todayStats.enCours - urgentEnCours)

  return (
    <div className="space-y-4">
      {/* Back */}
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-xs font-bold text-[#5257C9]"
      >
        <ArrowLeft className="size-3.5" /> Retour accueil
      </button>

      {/* Header */}
      <div className="overflow-hidden rounded-2xl bg-gradient-to-r from-[#1E1E2E] to-[#2D2D44] px-5 py-4 text-white shadow-lg">
        <div className="flex items-center gap-2">
          <Trophy className="size-6 text-amber-400" />
          <h1 className="text-xl font-black uppercase tracking-wide">Dashboard Staff</h1>
        </div>
        {staffName && (
          <p className="mt-1 text-xs font-medium text-white/80">
            {staffName} — performance en temps réel
          </p>
        )}
      </div>

      {/* Contenu scrollable */}
      <div className="max-h-[calc(100vh-220px)] space-y-4 overflow-y-auto rounded-2xl bg-slate-50/60 p-1 sm:max-h-[calc(100vh-260px)]">
        {/* AUJOURD'HUI */}
        <SectionTitle>Aujourd&apos;hui</SectionTitle>
        <Card className="rounded-2xl border-0 bg-white/90 p-0 shadow-md ring-1 ring-slate-200">
          <div className="divide-y divide-slate-100">
            <DashboardRow
              label="Urgents en cours"
              value={urgentEnCours.toString()}
              valueColor="text-red-600"
              dotColor="bg-red-500"
            />
            <DashboardRow
              label="Normaux en cours"
              value={normalEnCours.toString()}
              valueColor="text-amber-600"
              dotColor="bg-amber-500"
            />
            <DashboardRow
              label="Résolus"
              value={todayStats.resolus.toString()}
              valueColor="text-emerald-600"
              dotColor="bg-emerald-500"
            />
            <DashboardRow
              label="Temps moyen"
              value={`${todayStats.tempsMoyen} min`}
              icon={<Clock className="size-4 text-slate-400" />}
            />
          </div>
        </Card>

        {/* CE MOIS */}
        <SectionTitle>Ce mois</SectionTitle>
        <Card className="rounded-2xl border-0 bg-white/90 p-0 shadow-md ring-1 ring-slate-200">
          <div className="divide-y divide-slate-100">
            <DashboardRow
              label="Total résolus"
              value={(monthStats?.resolutions ?? 0).toString()}
              icon={<CheckCircle2 className="size-4 text-emerald-500" />}
            />
            <DashboardRow
              label="Score réactivité"
              value={`${reactivityScore(monthStats?.avgMinutes ?? 0)}%`}
              valueColor="text-[#5257C9]"
              icon={<TrendingUp className="size-4 text-[#5257C9]" />}
            />
            <DashboardRow
              label="Rang équipe"
              value={
                monthStats
                  ? `${ordinalFr(monthStats.rank)}/${Math.max(leaderboardSize, monthStats.rank)}`
                  : 'N/A'
              }
              icon={<Trophy className="size-4 text-amber-500" />}
            />
            <DashboardRow
              label="Points"
              value={(monthStats?.points ?? 0).toString()}
              icon={<TrendingUp className="size-4 text-slate-400" />}
            />
          </div>
        </Card>

        {/* DERNIERS INCIDENTS */}
        <SectionTitle>Mes derniers incidents</SectionTitle>
        <Card className="rounded-2xl border-0 bg-white/90 p-0 shadow-md ring-1 ring-slate-200">
          {recentResolved.length === 0 ? (
            <div className="px-5 py-8 text-center">
              <CheckCircle2 className="mx-auto size-8 text-slate-300" />
              <p className="mt-2 text-sm font-semibold text-slate-400">
                Aucun incident résolu récent.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {recentResolved.map((r) => {
                const dur = minutesBetween(r.createdAt, r.resolvedAt ?? r.createdAt)
                return (
                  <div
                    key={r.id}
                    className="flex items-center justify-between gap-2 px-4 py-3 sm:px-5"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-[#1E1E2E]">
                        {r.zone.nom || r.tagScanne}
                      </p>
                      <p className="truncate text-xs text-slate-500">{r.problemType}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
                      <Badge
                        variant="secondary"
                        className="rounded-full bg-emerald-50 font-bold text-emerald-700"
                      >
                        {dur} min
                      </Badge>
                      <span className="text-[11px] text-slate-400 sm:text-xs">
                        {relTime(r.resolvedAt ?? r.createdAt)}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Card>

        {/* Bouton retour */}
        <button
          onClick={onBack}
          className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border-2 border-slate-200 bg-white py-3 text-sm font-bold text-slate-700 transition hover:border-[#5257C9] hover:text-[#5257C9]"
        >
          <ArrowLeft className="size-4" /> Retour Accueil
        </button>
      </div>
    </div>
  )
}

// ---------- Sous-composants dashboard ----------

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 px-1">
      <div className="h-px flex-1 bg-slate-200" />
      <span className="text-xs font-bold uppercase tracking-widest text-slate-400">
        {children}
      </span>
      <div className="h-px flex-1 bg-slate-200" />
    </div>
  )
}

function DashboardRow({
  label,
  value,
  valueColor,
  dotColor,
  icon,
}: {
  label: string
  value: string
  valueColor?: string
  dotColor?: string
  icon?: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between px-5 py-3.5">
      <div className="flex items-center gap-2.5">
        {dotColor ? (
          <span className={cn('size-2.5 rounded-full', dotColor)} />
        ) : icon ? (
          icon
        ) : null}
        <span className="text-sm font-semibold text-slate-700">{label}</span>
      </div>
      <span className={cn('text-base font-black text-[#1E1E2E]', valueColor)}>{value}</span>
    </div>
  )
}

// ---------- Sous-composant partagé : ligne détail ----------

function DetailRow({
  label,
  value,
  bold,
}: {
  label: string
  value: string
  bold?: boolean
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-2">
      <span className="text-xs font-bold uppercase tracking-wide text-slate-400">{label}</span>
      <span
        className={cn(
          'text-right text-sm',
          bold ? 'font-black text-emerald-600' : 'font-bold text-[#1E1E2E]',
        )}
      >
        {value}
      </span>
    </div>
  )
}
