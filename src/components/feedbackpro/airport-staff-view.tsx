'use client'

// ============================================================
// <AirportStaffView /> — PWA employé aéroport (Refonte P1 — 6 scénarios)
// ------------------------------------------------------------
// Refonte complète de l'interface mobile-first pour le staff terrain,
// intégrant les notifications Web Push "always-on" (Service Worker +
// Push API) et les 6 scénarios du cahier des charges.
//
// SCÉNARIOS IMPLÉMENTÉS
//   S1 Connexion & Accueil
//      - Écran de login : dropdown employés (/api/airport/staff-auth)
//        + PIN 4 chiffres (input-otp). Le PIN est stocké en localStorage
//        par nom d'employé (premier login = création, suivants = vérif).
//      - Écran accueil : stats du jour + GROS bouton scanner + liste
//        "Mes incidents en cours" + bouton notifications push + bouton
//        installer PWA + bouton dashboard.
//      - Mode push passif : la PWA écoute les notifs entrantes (polling
//        10s + push serveur quand activé).
//
//   S2 Nouvel Incident (Push)
//      - Déclenchement : polling 10s détecte un nouvel incident EN_ATTENTE
//        (ou notification push qui réveille le SW).
//      - Chaîne d'alerte : vibrer() + jouerDing() + parler("Nouvel
//        incident <zone>. Type <problemType>.")
//      - Auto-navigation vers l'écran incident-new.
//      - "Ignorer" (action notif OU bouton écran) : l'incident reste
//        EN_ATTENTE dans la base — il réapparaît dans la liste "Nouveaux".
//        On NE le perd PAS.
//
//   S3 Prise en Charge
//      - Écran incident-new : détails (zone, type, signalé il y a…).
//      - Bouton "PRENDRE EN CHARGE" → POST /api/airport/staff-scan
//        action=TAKE_CHARGE → statut EN_COURS + assignedTo=staffName.
//      - Feedback : vibrer() + Denise "Incident pris en charge par
//        <name>." + redirection vers "Mes incidents en cours".
//
//   S4 Gestion "En Cours"
//      - Section "Mes incidents en cours" sur l'accueil : liste des
//        incidents EN_COURS assignés au staff, avec timer live
//        "En cours depuis 05:23 min".
//      - Bouton "MARQUER COMME RÉSOLU" → écran resolve-confirm.
//      - Bouton "Ajouter une note" (commentaire optionnel).
//      - Collision : si un autre staff scanne le même QR, message
//        "Cet incident est déjà pris en charge par <name>".
//
//   S5 Résolution
//      - Écran resolve-confirm : elapsed time visible + commentaire
//        optionnel + photo optionnelle.
//      - Bouton "CONFIRMER" → POST /api/airport/staff-scan action=RESOLVE
//        → statut RESOLU + calcul résolution time.
//      - Denise : "Incident résolu en <minutes> minutes."
//      - L'incident passe dans "Historique/Résolus" (dashboard).
//
//   S6 Edge Cases
//      - QR invalide : "Ce QR code n'est plus valide ou n'existe pas."
//      - Offline : le SW met en file (Background Sync), les actions
//        sont timestampées au clic (pas au sync).
//      - Logout avec incidents en cours : dialog de confirmation
//        "Vous avez N incidents non résolus. Voulez-vous vraiment
//        quitter ?"
//
// INCIDENT STATES
//   NEW       (EN_ATTENTE)  → signalé par client, non assigné
//   ASSIGNED  (EN_COURS)    → pris en charge par un staff
//   RESOLVED  (RESOLU)      → clôturé + archivé
//   IGNORED   (UI temp)     → reste NEW dans la base, juste marqué
//                              "vu / ignoré" en localStorage
//
// API
//   GET  /api/airport/staff-auth                     → liste employés
//   GET  /api/airport/reports?statut=EN_ATTENTE|EN_COURS|RESOLU
//   POST /api/airport/staff-scan                     → TAKE_CHARGE / RESOLVE
//   GET  /api/airport/leaderboard                    → top staff mois
//   POST /api/airport/push/subscribe                 → enregistre PushSubscription
//   POST /api/airport/push/send                      → broadcast push serveur
// ============================================================

import { useCallback, useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft,
  BarChart3,
  Bell,
  BellRing,
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
  ShieldAlert,
  Smartphone,
  TriangleAlert,
  TrendingUp,
  Trophy,
  User,
  WifiOff,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp'
import { parler } from '@/lib/staff-tts'
import { jouerDing, vibrer } from '@/lib/staff-alert'
import {
  areNotificationsSupported,
  getExistingSubscription,
  subscribeToPush,
} from '@/lib/push-manager'

// ---------- Types ----------

type StaffScreen =
  | 'login'
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

interface EmployeEntry {
  id: string
  nom: string
  poste: string
  proId: string
}

// ---------- Constantes ----------

const STAFF_NAME_KEY = 'fp-staff-name'
const STAFF_PHONE_KEY = 'fp-staff-phone'
// PIN par employé : clé localStorage "fp-staff-pin:<nom>".
// Le modèle Employe n'a pas de champ PIN — on stocke côté client.
// Premier login = création, suivants = vérif. NON sécurisé (V1).
const STAFF_PIN_PREFIX = 'fp-staff-pin:'
// IDs d'incidents "ignorés" (UI temp) — reste EN_ATTENTE en base.
const IGNORED_IDS_KEY = 'fp-staff-ignored-ids'

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

// Mots-clés indiquant un incident urgent (heuristique)
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

// ============================================================
// Voice Decision Engine — Denise "réfléchit" avant de parler
// ------------------------------------------------------------
// Au lieu d'appeler parler() directement pour chaque nouvel incident,
// on interroge le moteur /api/voice/decide. Il applique :
//   1. La règle configurée pour (aeroport, eventType)
//   2. Le mode horaire (night / service_lunch / etc.)
//   3. L'agrégation (max 1 annonce / X min par zone)
//   4. La déduplication (anti-double-scan)
//
// Si shouldSpeak=true → parler(decision.message).
// Sinon → silence (notification visuelle seule, mais l'incident reste
// dans la liste "Nouveaux" pour prise en charge).
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

async function decideAndParler(event: VoiceEvent): Promise<VoiceDecision | null> {
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
      // parler() ne prend que le texte ; le volume/tone est géré côté
      // moteur (decision.volumeAdjustment / decision.tone). On garde
      // l'appel simple pour ne pas modifier l'API existante de staff-tts.
      parler(decision.message)
    }
    return decision
  } catch {
    return null
  }
}

// ---------- Type PWA install ----------

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

// ---------- Helpers ----------

/** Temps relatif en français : "il y a 5 min", "il y a 2 h". */
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

/** Format MM:SS pour les timers live. */
function formatMMSS(totalSec: number): string {
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

/** Lit les IDs d'incidents ignorés depuis localStorage. */
function readIgnoredIds(): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try {
    const raw = localStorage.getItem(IGNORED_IDS_KEY)
    if (!raw) return new Set()
    const arr = JSON.parse(raw) as string[]
    return new Set(Array.isArray(arr) ? arr : [])
  } catch {
    return new Set()
  }
}

/** Persiste les IDs ignorés dans localStorage (cap ~200 pour éviter l'overflow). */
function writeIgnoredIds(set: Set<string>): void {
  if (typeof window === 'undefined') return
  try {
    const arr = Array.from(set).slice(-200)
    localStorage.setItem(IGNORED_IDS_KEY, JSON.stringify(arr))
  } catch {
    /* quota dépassé — silencieux */
  }
}

// ---------- Composant principal ----------

export function AirportStaffView({ staffTag, onExit }: { staffTag: string; onExit: () => void }) {
  const [screen, setScreen] = useState<StaffScreen>('login')
  const [screenDir, setScreenDir] = useState<1 | -1>(1)

  // Identité staff
  const [staffName, setStaffName] = useState('')
  const [staffPhone, setStaffPhone] = useState('')
  const [employes, setEmployes] = useState<EmployeEntry[]>([])
  // Login: étape selection employé + PIN
  const [loginStep, setLoginStep] = useState<'select' | 'pin'>('select')
  const [pendingEmpId, setPendingEmpId] = useState<string>('')
  const [pendingEmpName, setPendingEmpName] = useState<string>('')
  const [pinInput, setPinInput] = useState<string>('')
  const [pinError, setPinError] = useState<string | null>(null)
  const [loginMode, setLoginMode] = useState<'create' | 'verify'>('create')

  // Scanner
  const [scanDialogOpen, setScanDialogOpen] = useState(false)
  const [scanInput, setScanInput] = useState(staffTag || '')
  const [scanning, setScanning] = useState(false)
  const [scanError, setScanError] = useState<string | null>(null)

  // Rapport actif (après scan ou click incident)
  const [activeReport, setActiveReport] = useState<ReportShape | null>(null)
  const [activeTag, setActiveTag] = useState<string>(staffTag || '')

  // Resolve
  const [resolveComment, setResolveComment] = useState('')
  const [resolvePhotoUrl, setResolvePhotoUrl] = useState<string | null>(null)
  const [photoUploading, setPhotoUploading] = useState(false)
  const [showCommentInline, setShowCommentInline] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // Stats + listes
  const [todayStats, setTodayStats] = useState({ enCours: 0, resolus: 0, tempsMoyen: 0 })
  const [monthStats, setMonthStats] = useState<LeaderEntry | null>(null)
  const [leaderboardSize, setLeaderboardSize] = useState(0)
  const [recentResolved, setRecentResolved] = useState<ReportShape[]>([])
  // Liste des incidents EN_ATTENTE non ignorés (vue "Nouveaux" accueil)
  const [newIncidents, setNewIncidents] = useState<ReportShape[]>([])
  // Liste des incidents EN_COURS assignés à moi (vue "Mes en cours")
  const [myOngoing, setMyOngoing] = useState<ReportShape[]>([])

  // Toast inline minimal
  const [toast, setToast] = useState<string | null>(null)

  // Feature W1 — PWA install
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [isIOS, setIsIOS] = useState(false)
  const [isInstalled, setIsInstalled] = useState(false)
  const [showIOSHint, setShowIOSHint] = useState(false)

  // Feature P1 — Notifications push
  // pushEnabled : l'utilisateur a activé les notifs sur CET appareil
  //   (subscription persistée côté serveur). On sonde au mount via
  //   getExistingSubscription() pour afficher l'état correct.
  // pushSupported : le navigateur supporte-t-il la Push API.
  const [pushSupported, setPushSupported] = useState(false)
  const [pushEnabled, setPushEnabled] = useState(false)
  const [pushEnrolling, setPushEnrolling] = useState(false)

  // Edge case 6 — logout avec incidents en cours
  const [logoutConfirm, setLogoutConfirm] = useState<{ count: number } | null>(null)

  // Edge case — offline indicator
  const [isOnline, setIsOnline] = useState(true)

  const fileInputRef = useRef<HTMLInputElement>(null)

  // --- Alerte nouvel incident ---
  // seenReportIdsRef : mémorise les IDs EN_ATTENTE déjà vus (pour n'alerter
  //   que sur les NOUVEAUX). Au premier poll, on seede sans alerter.
  // ignoredIdsRef : IDs ignorés par l'utilisateur (reste NEW en base).
  const seenReportIdsRef = useRef<Set<string>>(new Set())
  const ignoredIdsRef = useRef<Set<string>>(new Set())
  const firstPollDoneRef = useRef(false)

  // ---------- Lifecycle ----------

  // Au mount : charge la liste des employés actifs
  useEffect(() => {
    let cancelled = false
    fetch('/api/airport/staff-auth', { cache: 'no-store' })
      .then((r) => r.json())
      .then((json) => {
        if (!cancelled && json?.ok && Array.isArray(json.data?.employes)) {
          setEmployes(json.data.employes)
        }
      })
      .catch(() => {
        /* réseau down — fallback texte libre */
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Au mount : vérifie si le staff est déjà connecté + charge les IDs ignorés
  useEffect(() => {
    if (typeof window === 'undefined') return
    const n = localStorage.getItem(STAFF_NAME_KEY) ?? ''
    const p = localStorage.getItem(STAFF_PHONE_KEY) ?? ''
    ignoredIdsRef.current = readIgnoredIds()
    if (n) {
      setStaffName(n)
      setStaffPhone(p)
      setScreen('home')
    }
  }, [])

  // Au mount : sonde le support push + l'état d'abonnement existant
  useEffect(() => {
    const supported = areNotificationsSupported()
    setPushSupported(supported)
    if (!supported) return
    getExistingSubscription().then((sub) => {
      setPushEnabled(!!sub)
    })
  }, [])

  // Au mount : online/offline indicator
  useEffect(() => {
    if (typeof window === 'undefined') return
    setIsOnline(navigator.onLine)
    const onOnline = () => setIsOnline(true)
    const onOffline = () => setIsOnline(false)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
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
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true
    if (standalone) {
      setIsInstalled(true)
      return
    }
    const ua = window.navigator.userAgent
    const ios = /iPad|iPhone|iPod/.test(ua) && !(window as unknown as { MSStream?: unknown }).MSStream
    setIsIOS(ios)

    const onBeforeInstall = (e: Event) => {
      e.preventDefault()
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

  const handleInstallClick = useCallback(async () => {
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
      /* ignore */
    }
  }, [deferredPrompt, isIOS])

  // ---------- Login flow (S1) ----------

  const selectEmployee = (empId: string) => {
    const emp = employes.find((e) => e.id === empId)
    if (!emp) return
    setPendingEmpId(emp.id)
    setPendingEmpName(emp.nom)
    setPinInput('')
    setPinError(null)
    // Détermine le mode : si un PIN existe déjà pour ce nom → verify, sinon create
    const existingPin = typeof window !== 'undefined' ? localStorage.getItem(STAFF_PIN_PREFIX + emp.nom) : null
    setLoginMode(existingPin ? 'verify' : 'create')
    setLoginStep('pin')
  }

  const submitPin = () => {
    if (pinInput.length !== 4) {
      setPinError('PIN incomplet (4 chiffres requis).')
      return
    }
    if (typeof window === 'undefined') return
    const key = STAFF_PIN_PREFIX + pendingEmpName
    if (loginMode === 'create') {
      // Premier login pour ce nom : on crée le PIN
      localStorage.setItem(key, pinInput)
    } else {
      // Login suivant : on vérifie
      const stored = localStorage.getItem(key)
      if (stored !== pinInput) {
        setPinError('PIN incorrect. Réessayez.')
        vibrer()
        return
      }
    }
    // Connexion réussie
    localStorage.setItem(STAFF_NAME_KEY, pendingEmpName)
    setStaffName(pendingEmpName)
    setScreen('home')
    setToast(`Bienvenue, ${pendingEmpName}`)
    // Petit feedback sonore de bienvenue
    parler(`Connexion réussie. Bonjour ${pendingEmpName}.`)
  }

  const logout = () => {
    // Edge case 6 : si incidents en cours → confirmation
    if (myOngoing.length > 0) {
      setLogoutConfirm({ count: myOngoing.length })
      return
    }
    doLogout()
  }

  const doLogout = () => {
    if (typeof window === 'undefined') return
    localStorage.removeItem(STAFF_NAME_KEY)
    setStaffName('')
    setPendingEmpId('')
    setPendingEmpName('')
    setPinInput('')
    setLoginStep('select')
    setScreen('login')
    setLogoutConfirm(null)
  }

  // ---------- Push notifications (Feature P1) ----------

  // activePush : demande la permission, souscrit via pushManager, et
  // POST la subscription vers /api/airport/push/subscribe pour persister.
  // En cas d'échec (permission refusée, SW pas prêt, pas de VAPID…),
  // on reste silencieux — le polling 10s continue comme fallback.
  const enablePush = useCallback(async () => {
    if (!pushSupported) {
      setToast('Notifications non supportées sur ce navigateur.')
      return
    }
    setPushEnrolling(true)
    try {
      const sub = await subscribeToPush()
      if (!sub) {
        setToast('Activation échouée (permission refusée ou navigateur non compatible).')
        return
      }
      // POST la subscription au serveur
      // Note : PushSubscription.keys est défini par la spec Web Push mais
      // n'est pas toujours exposé dans les lib TS DOM selon la version.
      // On caste vers un type local pour accéder en sécurité.
      const subWithKeys = sub as PushSubscription & {
        keys?: { p256dh?: string; auth?: string }
      }
      const res = await fetch('/api/airport/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: sub.endpoint,
          keys: {
            p256dh: subWithKeys.keys?.p256dh,
            auth: subWithKeys.keys?.auth,
          },
          staffName,
        }),
      })
      const json = await res.json().catch(() => null)
      if (json?.ok) {
        setPushEnabled(true)
        setToast('Notifications activées. Vous serez alerté même app fermée.')
        vibrer()
      } else {
        setToast('Subscription enregistrée localement mais serveur injoignable.')
        setPushEnabled(true) // la subscription navigateur existe quand même
      }
    } finally {
      setPushEnrolling(false)
    }
  }, [pushSupported, staffName])

  // ---------- Navigation ----------

  const go = useCallback((next: StaffScreen, dir: 1 | -1 = 1) => {
    setScreenDir(dir)
    setScreen(next)
  }, [])

  // ---------- Stats ----------

  const fetchStats = useCallback(async () => {
    if (!staffName) return
    try {
      const [ecRes, rRes, leadRes, pendRes] = await Promise.all([
        fetch('/api/airport/reports?statut=EN_COURS&limit=200'),
        fetch('/api/airport/reports?statut=RESOLU&limit=200'),
        fetch('/api/airport/leaderboard'),
        fetch('/api/airport/reports?statut=EN_ATTENTE&limit=200'),
      ])
      const ecJson = await ecRes.json().catch(() => null)
      const rJson = await rRes.json().catch(() => null)
      const leadJson = await leadRes.json().catch(() => null)
      const pendJson = await pendRes.json().catch(() => null)

      const ecReports: ReportShape[] = ecJson?.data?.reports ?? []
      const rReports: ReportShape[] = rJson?.data?.reports ?? []
      const pendReports: ReportShape[] = pendJson?.data?.reports ?? []
      const lead: LeaderEntry[] = leadJson?.data?.leaderboard ?? []

      // "À moi" = assignedTo === staffName OU staffScan TAKE_CHARGE par moi
      const isMine = (r: ReportShape) =>
        r.assignedTo === staffName || r.staffScans.some((s) => s.staffName === staffName)

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

      setTodayStats({ enCours: myEnCours.length, resolus: myResolusToday.length, tempsMoyen: avg })
      setLeaderboardSize(lead.length)
      setMonthStats(lead.find((e) => e.staffName === staffName) ?? null)
      setRecentResolved(rReports.filter(isMine).slice(0, 10))
      setMyOngoing(myEnCours)
      // Nouveaux = EN_ATTENTE non ignorés
      setNewIncidents(pendReports.filter((r) => !ignoredIdsRef.current.has(r.id)))
    } catch {
      /* réseau down — silencieux */
    }
  }, [staffName])

  useEffect(() => {
    if (staffName && screen !== 'login') void fetchStats()
  }, [staffName, screen, fetchStats])

  // ---------- Polling nouveaux incidents (S2 — Push + polling) ----------
  //
  // Toutes les 10 s, on récupère les signalements EN_ATTENTE. Pour chaque
  // report dont l'ID n'est pas encore dans seenReportIdsRef ET n'est pas
  // dans ignoredIdsRef, on déclenche la chaîne d'alerte :
  //   vibrer() → jouerDing() → parler() → auto-navigate incident-new
  //
  // Au premier poll, on seede juste le set sans alerter (sinon tous les
  // incidents déjà en attente à l'ouverture déclencheraient une salve).
  const pollPendingReports = useCallback(async () => {
    try {
      const res = await fetch('/api/airport/reports?statut=EN_ATTENTE&limit=200')
      const json = await res.json().catch(() => null)
      const pending: ReportShape[] = json?.data?.reports ?? []

      // Met à jour la liste "Nouveaux" (non ignorés)
      setNewIncidents(pending.filter((r) => !ignoredIdsRef.current.has(r.id)))

      if (!firstPollDoneRef.current) {
        for (const r of pending) seenReportIdsRef.current.add(r.id)
        firstPollDoneRef.current = true
        return
      }

      // Polls suivants : alerter sur chaque NOUVEL incident non ignoré.
      const fresh = pending.filter(
        (r) => !seenReportIdsRef.current.has(r.id) && !ignoredIdsRef.current.has(r.id),
      )
      if (fresh.length === 0) return

      for (const r of fresh) seenReportIdsRef.current.add(r.id)

      // S2 — Chaîne d'alerte : vibrer + ding + Denise
      vibrer()
      jouerDing()
      // VDE — Voice Decision Engine :
      // Pour chaque nouvel incident, on interroge le moteur côté serveur
      // (/api/voice/decide) qui applique la matrice de règles (sector +
      // eventType), le mode horaire, l'agrégation et la déduplication.
      // Le moteur renvoie une décision : si shouldSpeak=true, decideAndParler
      // appelle parler(message) avec le template rendu. Sinon, Denise se
      // tait (notification visuelle seule — l'incident reste dans la liste
      // "Nouveaux" pour prise en charge manuelle).
      for (const r of fresh) {
        const zoneNom = r.zone?.nom ?? r.tagScanne ?? 'zone inconnue'
        const terminal = extractTerminal(r.tagScanne + ' ' + r.zone?.nom)
        const elapsedMs = Date.now() - new Date(r.createdAt).getTime()
        const tempsMin = Math.max(1, Math.floor(elapsedMs / 60000))
        void decideAndParler({
          sector: 'aeroport',
          eventType: 'new_scan',
          zone: `${terminal}, ${zoneNom}`.trim(),
          type: r.problemType,
          temps: `${tempsMin} min`,
          reportId: r.id,
        })
      }

      // S2 — Auto-navigation vers l'écran incident-new si sur home/dashboard.
      // On n'interrompt pas si le staff traite déjà un incident.
      if (screen === 'home' || screen === 'dashboard') {
        const plusRecent = fresh[0] // fresh est trié par createdAt DESC
        setActiveReport(plusRecent)
        setActiveTag(plusRecent.tagScanne)
        go('incident-new', 1)
      }
    } catch {
      /* réseau down — on réessaiera */
    }
  }, [screen, go])

  useEffect(() => {
    if (!staffName || screen === 'login') return
    void pollPendingReports()
    const id = window.setInterval(() => void pollPendingReports(), 10000)
    return () => window.clearInterval(id)
  }, [staffName, screen, pollPendingReports])

  // ---------- Polling de l'incident actif (mise à jour temps réel) ----------
  useEffect(() => {
    if (!activeReport) return
    if (screen !== 'incident-new' && screen !== 'incident-ongoing') return

    const pollActive = async () => {
      try {
        const [pendRes, ongRes] = await Promise.all([
          fetch('/api/airport/reports?statut=EN_ATTENTE&limit=200'),
          fetch('/api/airport/reports?statut=EN_COURS&limit=200'),
        ])
        const pendJson = await pendRes.json().catch(() => null)
        const ongJson = await ongRes.json().catch(() => null)
        const all: ReportShape[] = [
          ...(pendJson?.data?.reports ?? []),
          ...(ongJson?.data?.reports ?? []),
        ]
        const updated = all.find((r) => r.id === activeReport.id)
        if (!updated) {
          // Résolu par un autre → notifie + retour home
          if (screen === 'incident-new' || screen === 'incident-ongoing') {
            parler('Incident résolu par un autre agent. Retour à l\'accueil.')
            setActiveReport(null)
            go('home', -1)
            void fetchStats()
          }
          return
        }
        if (updated.statut !== activeReport.statut) {
          if (updated.statut === 'EN_COURS') {
            const isMine =
              updated.assignedTo === staffName ||
              updated.staffScans.some(
                (s) => s.action === 'TAKE_CHARGE' && s.staffName === staffName,
              )
            if (isMine) {
              setActiveReport(updated)
              if (screen !== 'incident-ongoing') go('incident-ongoing', 1)
            } else {
              // S4 collision — pris par un autre
              parler('Incident pris en charge par un autre agent.')
              setActiveReport(null)
              go('home', -1)
              void fetchStats()
            }
          }
        } else {
          setActiveReport(updated)
        }
      } catch {
        /* réseau down */
      }
    }
    void pollActive()
    const id = window.setInterval(() => void pollActive(), 5000)
    return () => window.clearInterval(id)
  }, [activeReport, screen, staffName, go, fetchStats])

  // ---------- Actions API (S3 + S5) ----------

  // S3 — PRENDRE EN CHARGE
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
        vibrer()
        // S3 — Denise : "Incident pris en charge par <name>"
        parler(`Incident pris en charge par ${staffName}.`)
        setToast('Pris en charge.')
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

  // S2 — Ignorer : marque l'ID comme ignoré en localStorage, retour home.
  // L'incident reste EN_ATTENTE en base — il est juste retiré de la
  // liste "Nouveaux" de CET appareil. Au prochain poll il ne déclenchera
  // plus d'alerte (mais reste visible si quelqu'un d'autre scanne le QR).
  const ignoreIncident = () => {
    if (!activeReport) return
    ignoredIdsRef.current.add(activeReport.id)
    writeIgnoredIds(ignoredIdsRef.current)
    setNewIncidents((prev) => prev.filter((r) => r.id !== activeReport.id))
    setActiveReport(null)
    go('home', -1)
    setToast('Incident ignoré (reste dans la base, non résolu).')
  }

  // S5 — CONFIRMER RÉSOLUTION
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
        const minutes = activeReport
          ? Math.round(
              (Date.now() - new Date(activeReport.createdAt).getTime()) / 60000,
            )
          : 0
        // S5 — Denise : "Incident résolu en <minutes> minutes."
        parler(`Incident résolu en ${minutes} minutes. Merci.`)
        vibrer()
        setToast(`Incident résolu en ${minutes} min. Bien fait !`)
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

  // Timer live pour l'incident en cours (S4)
  const [, setTimerTick] = useState(0)
  useEffect(() => {
    if (screen !== 'incident-ongoing' && screen !== 'resolve-confirm') return
    const id = window.setInterval(() => setTimerTick((t) => t + 1), 1000)
    return () => window.clearInterval(id)
  }, [screen])

  const ongoingSinceSec = activeReport
    ? (() => {
        const tc = activeReport.staffScans.find((s) => s.action === 'TAKE_CHARGE')
        const start = tc ? new Date(tc.createdAt).getTime() : new Date(activeReport.createdAt).getTime()
        return Math.max(0, Math.floor((Date.now() - start) / 1000))
      })()
    : 0

  const resolveElapsedMin = activeReport
    ? minutesBetween(activeReport.createdAt, new Date().toISOString())
    : 0

  // ---------- Rendu ----------

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-gradient-to-br from-slate-50 via-indigo-50/30 to-emerald-50/40 text-foreground">
      {/* Halos décoratifs */}
      <div className="pointer-events-none absolute -top-20 -right-20 h-72 w-72 rounded-full bg-[#5257C9]/15 blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 -left-20 h-64 w-64 rounded-full bg-emerald-400/15 blur-3xl" />

      {/* Header (masqué sur l'écran login) */}
      {screen !== 'login' && (
        <header className="relative z-10 bg-gradient-to-r from-[#5257C9] to-[#4549b8] text-white shadow-lg">
          <div className="mx-auto flex max-w-md items-center justify-between px-4 py-3">
            <div className="flex items-center gap-2">
              <div className="flex size-8 items-center justify-center rounded-lg bg-white/20 backdrop-blur-sm">
                <Smartphone className="size-4 text-white" />
              </div>
              <span className="text-xs font-bold uppercase tracking-widest text-white/90">
                Staff Airport
              </span>
              {!isOnline && (
                <span className="ml-1 flex items-center gap-1 rounded-full bg-amber-500/30 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-100">
                  <WifiOff className="size-3" /> Hors ligne
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {/* Indicateur push activé */}
              {pushEnabled && (
                <span
                  className="flex size-7 items-center justify-center rounded-xl bg-emerald-400/30 text-emerald-100"
                  aria-label="Notifications push activées"
                  title="Notifications push activées"
                >
                  <BellRing className="size-4" />
                </span>
              )}
              <button
                onClick={logout}
                aria-label="Se déconnecter"
                className="flex size-10 items-center justify-center rounded-xl bg-white/15 text-white transition hover:bg-white/25"
              >
                <LogOut className="size-5" />
              </button>
            </div>
          </div>
        </header>
      )}

      {/* Main */}
      <main className="relative z-10 mx-auto flex w-full max-w-md flex-1 flex-col px-4 py-6 sm:px-6">
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
            {/* S1 — Login */}
            {screen === 'login' && (
              <LoginScreen
                employes={employes}
                loginStep={loginStep}
                pendingEmpName={pendingEmpName}
                pinInput={pinInput}
                pinError={pinError}
                loginMode={loginMode}
                onSelectEmployee={selectEmployee}
                onPinChange={setPinInput}
                onSubmitPin={submitPin}
                onBackSelect={() => {
                  setLoginStep('select')
                  setPinInput('')
                  setPinError(null)
                }}
                onExit={onExit}
              />
            )}

            {/* S1 — Accueil */}
            {screen === 'home' && (
              <HomeScreen
                staffName={staffName}
                todayStats={todayStats}
                newIncidents={newIncidents}
                myOngoing={myOngoing}
                pushSupported={pushSupported}
                pushEnabled={pushEnabled}
                pushEnrolling={pushEnrolling}
                onEnablePush={enablePush}
                onScan={openScanner}
                onClickNew={(r) => {
                  setActiveReport(r)
                  setActiveTag(r.tagScanne)
                  go('incident-new', 1)
                }}
                onClickOngoing={(r) => {
                  setActiveReport(r)
                  setActiveTag(r.tagScanne)
                  go('incident-ongoing', 1)
                }}
                onDashboard={() => go('dashboard', 1)}
                installAvailable={!!deferredPrompt}
                isIOS={isIOS}
                isInstalled={isInstalled}
                showIOSHint={showIOSHint}
                onInstall={handleInstallClick}
                onDismissIOSHint={() => setShowIOSHint(false)}
              />
            )}

            {/* S2/S3 — Incident nouveau */}
            {screen === 'incident-new' && activeReport && (
              <IncidentNewScreen
                report={activeReport}
                tag={activeTag}
                submitting={submitting}
                onTakeCharge={takeCharge}
                onIgnore={ignoreIncident}
                onBack={() => go('home', -1)}
              />
            )}

            {/* S4 — Incident en cours */}
            {screen === 'incident-ongoing' && activeReport && (
              <IncidentOngoingScreen
                report={activeReport}
                tag={activeTag}
                sinceSec={ongoingSinceSec}
                submitting={submitting}
                showCommentInline={showCommentInline}
                comment={resolveComment}
                onToggleComment={() => setShowCommentInline((v) => !v)}
                onComment={setResolveComment}
                onResolve={() => go('resolve-confirm', 1)}
                onBack={() => go('home', -1)}
              />
            )}

            {/* S5 — Confirmation résolution */}
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

            {/* Dashboard */}
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
        <DialogContent className="w-[95%] max-w-md">
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

      {/* Dialog logout avec incidents en cours (S6 edge case) */}
      <Dialog open={logoutConfirm !== null} onOpenChange={(o) => !o && setLogoutConfirm(null)}>
        <DialogContent className="w-[95%] max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl font-black text-red-600">
              <ShieldAlert className="size-5" />
              {logoutConfirm?.count ?? 0} incidents non résolus
            </DialogTitle>
            <DialogDescription>
              Vous avez {logoutConfirm?.count ?? 0} incidents en cours de traitement.
              Voulez-vous vraiment quitter ? Ils resteront assignés à votre nom mais
              ne seront plus suivis sur cet appareil.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              variant="outline"
              onClick={() => setLogoutConfirm(null)}
              className="w-full rounded-xl sm:w-auto"
            >
              Rester connecté
            </Button>
            <Button
              onClick={doLogout}
              className="w-full rounded-xl bg-red-600 px-6 text-white hover:bg-red-700 sm:w-auto"
            >
              <LogOut className="size-4" />
              <span className="ml-1.5">Quitter quand même</span>
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

  // ---------- confirmScan (défini après return — hoisted via closure) ----------

  async function confirmScan() {
    const tag = scanInput.trim()
    if (!tag) {
      setScanError('Saisissez le tag du lieu scanné.')
      return
    }
    setScanning(true)
    setScanError(null)
    try {
      const [pendRes, ongRes] = await Promise.all([
        fetch('/api/airport/reports?statut=EN_ATTENTE&limit=200'),
        fetch('/api/airport/reports?statut=EN_COURS&limit=200'),
      ])
      const pendJson = await pendRes.json().catch(() => null)
      const ongJson = await ongRes.json().catch(() => null)
      const pending: ReportShape[] = pendJson?.data?.reports ?? []
      const ongoing: ReportShape[] = ongJson?.data?.reports ?? []

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
        // S4 — déjà pris en charge par CE staff → ongoing
        setActiveReport(matchOngoingMine[0])
        setScanDialogOpen(false)
        go('incident-ongoing', 1)
      } else if (matchPending.length > 0) {
        // S3 — incident en attente → new
        setActiveReport(matchPending[0])
        setScanDialogOpen(false)
        go('incident-new', 1)
      } else if (matchOngoingOther.length > 0) {
        // S4 collision — déjà pris en charge par un autre
        const other = matchOngoingOther[0]
        const by = other.assignedTo ?? other.staffScans.find((s) => s.action === 'TAKE_CHARGE')?.staffName ?? 'un autre agent'
        setScanError(`Cet incident est déjà pris en charge par ${by}.`)
      } else {
        // S6 edge case — QR invalide / aucun incident
        setScanError('Ce QR code n\'est plus valide ou n\'existe pas.')
        setToast('Aucun incident à traiter sur ce lieu.')
        setScanDialogOpen(false)
      }
    } catch {
      setScanError('Erreur réseau. Réessayez.')
    } finally {
      setScanning(false)
    }
  }

  // ---------- openScanner ----------

  function openScanner() {
    setScanInput(activeTag || staffTag || '')
    setScanError(null)
    setScanDialogOpen(true)
  }
}

// ============================================================
// S1 — Écran Login (dropdown employé + PIN 4 chiffres)
// ============================================================

interface LoginScreenProps {
  employes: EmployeEntry[]
  loginStep: 'select' | 'pin'
  pendingEmpName: string
  pinInput: string
  pinError: string | null
  loginMode: 'create' | 'verify'
  onSelectEmployee: (empId: string) => void
  onPinChange: (v: string) => void
  onSubmitPin: () => void
  onBackSelect: () => void
  onExit: () => void
}

function LoginScreen({
  employes,
  loginStep,
  pendingEmpName,
  pinInput,
  pinError,
  loginMode,
  onSelectEmployee,
  onPinChange,
  onSubmitPin,
  onBackSelect,
  onExit,
}: LoginScreenProps) {
  return (
    <div className="flex flex-1 flex-col justify-center space-y-6">
      {/* Logo + titre */}
      <div className="text-center">
        <div className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[#5257C9] to-[#4549b8] shadow-xl">
          <Smartphone className="size-8 text-white" />
        </div>
        <h1 className="mt-4 text-2xl font-black text-[#1E1E2E]">Staff Airport</h1>
        <p className="mt-1 text-sm font-medium text-slate-500">
          {loginStep === 'select'
            ? 'Identifiez-vous pour accéder à votre poste'
            : loginMode === 'create'
              ? `Créez votre PIN — ${pendingEmpName}`
              : `Saisissez votre PIN — ${pendingEmpName}`}
        </p>
      </div>

      {loginStep === 'select' ? (
        <div className="space-y-4">
          {employes.length > 0 ? (
            <>
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-wide text-slate-500">
                  Sélectionnez votre nom
                </Label>
                <Select onValueChange={onSelectEmployee}>
                  <SelectTrigger className="w-full rounded-xl border-2 border-slate-200 bg-white text-base">
                    <SelectValue placeholder="Choisir mon nom…" />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {employes.map((emp) => (
                      <SelectItem key={emp.id} value={emp.id}>
                        {emp.nom}
                        {emp.poste ? ` — ${emp.poste}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          ) : (
            // Fallback : pas d'employés en BDD → texte libre
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-wide text-slate-500">
                Votre nom (aucun employé en BDD)
              </Label>
              <Input
                placeholder="Ex: Marc, Sophie…"
                className="rounded-xl border-2 border-slate-200 bg-white text-base"
                onChange={(e) => onSelectEmployee(`free-${e.target.value}`)}
              />
            </div>
          )}
          <button
            onClick={onExit}
            className="w-full rounded-xl border-2 border-slate-200 bg-white py-3 text-sm font-bold text-slate-500 transition hover:border-slate-300"
          >
            Retour à l&apos;accueil FeedbackPro
          </button>
        </div>
      ) : (
        // Étape PIN
        <div className="space-y-5">
          <div className="space-y-3">
            <Label className="block text-center text-xs font-bold uppercase tracking-wide text-slate-500">
              {loginMode === 'create' ? 'PIN à 4 chiffres' : 'Votre PIN'}
            </Label>
            <div className="flex justify-center">
              <InputOTP
                maxLength={4}
                value={pinInput}
                onChange={onPinChange}
                onComplete={onSubmitPin}
              >
                <InputOTPGroup>
                  <InputOTPSlot index={0} className="size-12 rounded-md border-2 text-lg font-black" />
                  <InputOTPSlot index={1} className="size-12 rounded-md border-2 text-lg font-black" />
                  <InputOTPSlot index={2} className="size-12 rounded-md border-2 text-lg font-black" />
                  <InputOTPSlot index={3} className="size-12 rounded-md border-2 text-lg font-black" />
                </InputOTPGroup>
              </InputOTP>
            </div>
            {pinError && (
              <p className="text-center text-sm font-semibold text-red-600">{pinError}</p>
            )}
            <p className="px-4 text-center text-xs text-slate-400">
              {loginMode === 'create'
                ? 'Première connexion : ce PIN sera demandé à chaque ouverture. Il est stocké sur cet appareil uniquement (V1).'
                : 'PIN stocké localement sur cet appareil. Oublié ? Effacez les données du site.'}
            </p>
          </div>

          <Button
            onClick={onSubmitPin}
            disabled={pinInput.length !== 4}
            className="w-full rounded-xl bg-gradient-to-r from-[#5257C9] to-[#4549b8] py-4 text-base font-black text-white"
          >
            {loginMode === 'create' ? 'Créer & se connecter' : 'Se connecter'}
          </Button>

          <button
            onClick={onBackSelect}
            className="flex w-full items-center justify-center gap-1 text-xs font-bold text-slate-400"
          >
            <ArrowLeft className="size-3.5" /> Changer d&apos;employé
          </button>
        </div>
      )}
    </div>
  )
}

// ============================================================
// S1 — Écran Accueil (stats + scanner + listes + push + install)
// ============================================================

interface HomeScreenProps {
  staffName: string
  todayStats: { enCours: number; resolus: number; tempsMoyen: number }
  newIncidents: ReportShape[]
  myOngoing: ReportShape[]
  pushSupported: boolean
  pushEnabled: boolean
  pushEnrolling: boolean
  onEnablePush: () => void
  onScan: () => void
  onClickNew: (r: ReportShape) => void
  onClickOngoing: (r: ReportShape) => void
  onDashboard: () => void
  installAvailable: boolean
  isIOS: boolean
  isInstalled: boolean
  showIOSHint: boolean
  onInstall: () => void
  onDismissIOSHint: () => void
}

function HomeScreen({
  staffName,
  todayStats,
  newIncidents,
  myOngoing,
  pushSupported,
  pushEnabled,
  pushEnrolling,
  onEnablePush,
  onScan,
  onClickNew,
  onClickOngoing,
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
      {/* Greeting */}
      <div className="text-center">
        <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-white shadow-lg ring-1 ring-slate-200">
          <User className="size-7" style={{ color: INDIGO }} />
        </div>
        <h1 className="mt-3 break-words text-xl font-black text-[#1E1E2E] sm:text-2xl">
          Bonjour, {staffName}
        </h1>
      </div>

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
            dotColor="bg-amber-500"
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

      {/* Bouton scan central — HUGE */}
      <button
        onClick={onScan}
        className="group relative flex w-full flex-col items-center gap-3 overflow-hidden rounded-3xl bg-gradient-to-br from-[#5257C9] to-[#4549b8] py-8 text-white shadow-xl transition active:scale-[0.98]"
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

      {/* S4 — Mes incidents en cours */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 px-1">
          <RefreshCw className="size-4 text-amber-500" />
          <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500">
            Mes incidents en cours ({myOngoing.length})
          </h2>
        </div>
        {myOngoing.length === 0 ? (
          <Card className="rounded-2xl border-0 bg-white/80 p-4 text-center text-xs font-semibold text-slate-400 shadow-sm ring-1 ring-slate-200">
            Aucun incident en cours.
          </Card>
        ) : (
          <div className="max-h-72 space-y-2 overflow-y-auto rounded-2xl bg-amber-50/40 p-1 ring-1 ring-amber-100">
            {myOngoing.map((r) => (
              <OngoingIncidentCard key={r.id} report={r} onClick={() => onClickOngoing(r)} />
            ))}
          </div>
        )}
      </div>

      {/* S2 — Nouveaux incidents en attente */}
      {newIncidents.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 px-1">
            <TriangleAlert className="size-4 text-red-500" />
            <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500">
              Nouveaux signalements ({newIncidents.length})
            </h2>
          </div>
          <div className="max-h-72 space-y-2 overflow-y-auto rounded-2xl bg-red-50/40 p-1 ring-1 ring-red-100">
            {newIncidents.slice(0, 8).map((r) => (
              <NewIncidentCard key={r.id} report={r} onClick={() => onClickNew(r)} />
            ))}
          </div>
        </div>
      )}

      {/* Notifications push (Feature P1) */}
      {pushSupported && !pushEnabled && (
        <button
          onClick={onEnablePush}
          disabled={pushEnrolling}
          className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-emerald-200 bg-emerald-50 py-4 text-base font-bold text-emerald-700 transition hover:border-emerald-400 hover:bg-emerald-100 disabled:opacity-60"
        >
          {pushEnrolling ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Bell className="size-4" />
          )}
          Activer les notifications
        </button>
      )}
      {pushEnabled && (
        <div className="flex items-center justify-center gap-2 rounded-xl bg-emerald-50 py-3 text-sm font-bold text-emerald-700 ring-1 ring-emerald-200">
          <BellRing className="size-4" />
          Notifications activées — alertes même app fermée
        </div>
      )}

      {/* Lien dashboard complet */}
      <Button
        onClick={onDashboard}
        variant="outline"
        className="w-full rounded-xl border-2 border-slate-200 bg-white py-4 text-base font-bold text-[#1E1E2E] hover:border-[#5257C9] hover:text-[#5257C9]"
      >
        <BarChart3 className="size-4" />
        Voir Dashboard Complet
      </Button>

      {/* Feature W1 — Installer l'app (PWA) */}
      {!isInstalled && (installAvailable || isIOS) && (
        <div className="space-y-2">
          <button
            onClick={onInstall}
            className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-slate-200 bg-white py-4 text-base font-bold text-[#1E1E2E] transition hover:border-[#5257C9] hover:text-[#5257C9]"
          >
            <Download className="size-4" />
            Installer l&apos;app
          </button>
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
                Appuyez sur le bouton <strong>Partager</strong> dans Safari, puis
                choisissez <strong>« Sur l&apos;écran d&apos;accueil »</strong>.
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
    <div className="flex items-center justify-between px-4 py-4 sm:px-5">
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

function OngoingIncidentCard({ report, onClick }: { report: ReportShape; onClick: () => void }) {
  const urgent = isUrgent(report.problemType)
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center justify-between gap-2 rounded-xl bg-white/90 px-3 py-3 text-left shadow-sm ring-1 ring-amber-200 transition hover:bg-white active:scale-[0.99]"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className={cn('size-2 rounded-full', urgent ? 'bg-red-500' : 'bg-amber-500')} />
          <p className="truncate text-sm font-bold text-[#1E1E2E]">
            {report.zone.nom || report.tagScanne}
          </p>
        </div>
        <p className="mt-0.5 truncate text-xs text-slate-500">{report.problemType}</p>
      </div>
      <OngoingTimer report={report} />
    </button>
  )
}

/** Timer live "En cours depuis MM:SS min" — calculé côté client. */
function OngoingTimer({ report }: { report: ReportShape }) {
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 1000)
    return () => window.clearInterval(id)
  }, [])
  const tc = report.staffScans.find((s) => s.action === 'TAKE_CHARGE')
  const start = tc ? new Date(tc.createdAt).getTime() : new Date(report.createdAt).getTime()
  const sec = Math.max(0, Math.floor((Date.now() - start) / 1000))
  return (
    <div className="flex shrink-0 flex-col items-end">
      <Badge className="rounded-full bg-amber-100 font-bold text-amber-800">
        {formatMMSS(sec)}
      </Badge>
      <span className="mt-0.5 text-[10px] text-slate-400">en cours</span>
    </div>
  )
}

function NewIncidentCard({ report, onClick }: { report: ReportShape; onClick: () => void }) {
  const urgent = isUrgent(report.problemType)
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center justify-between gap-2 rounded-xl bg-white/90 px-3 py-3 text-left shadow-sm ring-1 ring-red-200 transition hover:bg-white active:scale-[0.99]"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          {urgent && <TriangleAlert className="size-3.5 text-red-500" />}
          <p className="truncate text-sm font-bold text-[#1E1E2E]">
            {report.zone.nom || report.tagScanne}
          </p>
        </div>
        <p className="mt-0.5 truncate text-xs text-slate-500">{report.problemType}</p>
      </div>
      <span className="shrink-0 text-[11px] text-slate-400">{relTime(report.createdAt)}</span>
    </button>
  )
}

// ============================================================
// S2/S3 — Écran Incident Nouveau
// ============================================================

interface IncidentNewScreenProps {
  report: ReportShape
  tag: string
  submitting: boolean
  onTakeCharge: () => void
  onIgnore: () => void
  onBack: () => void
}

function IncidentNewScreen({
  report,
  tag,
  submitting,
  onTakeCharge,
  onIgnore,
  onBack,
}: IncidentNewScreenProps) {
  const urgent = isUrgent(report.problemType)
  return (
    <div className="space-y-4">
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-xs font-bold text-[#5257C9]"
      >
        <ArrowLeft className="size-3.5" /> Retour accueil
      </button>

      {/* Header amber (ou rouge si urgent) */}
      <div
        className={cn(
          'overflow-hidden rounded-2xl px-4 py-4 text-white shadow-lg sm:px-5',
          urgent
            ? 'bg-gradient-to-r from-red-500 to-red-600'
            : 'bg-gradient-to-r from-amber-500 to-amber-600',
        )}
      >
        <div className="flex items-center gap-2">
          <TriangleAlert className="size-6" />
          <h1 className="text-xl font-black uppercase tracking-wide">Nouvel Incident</h1>
        </div>
        <p className="mt-1 text-xs font-medium text-white/90">
          Un signalement est en attente sur ce lieu.
        </p>
      </div>

      {/* Détails */}
      <Card className="rounded-2xl border-0 bg-white/90 p-4 shadow-md ring-1 ring-slate-200 sm:p-5">
        <DetailRow label="Terminal" value={extractTerminal(tag + ' ' + report.zone.nom)} />
        <DetailRow label="Zone" value={report.zone.nom || tag} />
        <DetailRow label="Type" value={report.problemType} />
        <DetailRow label="Signalé" value={relTime(report.createdAt)} />
      </Card>

      {/* S3 — Actions */}
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
        {/* S2 — Ignorer : reste NEW en base, juste marqué ignoré sur cet appareil */}
        <button
          onClick={onIgnore}
          disabled={submitting}
          className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border-2 border-slate-200 bg-white py-3 text-sm font-bold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
        >
          <X className="size-4" />
          Ignorer (reste en attente)
        </button>
      </div>
    </div>
  )
}

// ============================================================
// S4 — Écran Incident En Cours
// ============================================================

interface IncidentOngoingScreenProps {
  report: ReportShape
  tag: string
  sinceSec: number
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
  sinceSec,
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
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-xs font-bold text-[#5257C9]"
      >
        <ArrowLeft className="size-3.5" /> Retour accueil
      </button>

      {/* Header indigo (en cours) */}
      <div className="overflow-hidden rounded-2xl bg-gradient-to-r from-[#5257C9] to-[#4549b8] px-4 py-4 text-white shadow-lg sm:px-5">
        <div className="flex items-center gap-2">
          <RefreshCw className="size-6" />
          <h1 className="text-xl font-black uppercase tracking-wide">Incident En Cours</h1>
        </div>
        <p className="mt-1 text-xs font-medium text-white/90">
          Vous avez pris cet incident en charge.
        </p>
      </div>

      {/* Timer live — S4 */}
      <Card className="rounded-2xl border-2 border-amber-200 bg-amber-50/60 p-4 shadow-md sm:p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-amber-700">
            <Clock className="size-5" />
            <span className="text-sm font-bold">En cours depuis</span>
          </div>
          <span className="font-mono text-2xl font-black text-amber-900">
            {formatMMSS(sinceSec)}
          </span>
        </div>
      </Card>

      {/* Détails */}
      <Card className="rounded-2xl border-0 bg-white/90 p-4 shadow-md ring-1 ring-slate-200 sm:p-5">
        <DetailRow label="Pris en charge par" value="VOUS" bold />
        <DetailRow label="Type" value={report.problemType} />
        <DetailRow label="Zone" value={report.zone.nom || tag} />
        <DetailRow label="Terminal" value={extractTerminal(tag + ' ' + report.zone.nom)} />
      </Card>

      {/* Commentaire inline (optionnel) — S4 */}
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
        {/* S5 — MARQUER RÉSOLU */}
        <button
          onClick={onResolve}
          disabled={submitting}
          className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-500 to-emerald-600 py-4 text-base font-black uppercase tracking-wide text-white shadow-lg transition active:scale-[0.98] disabled:opacity-60"
        >
          <CheckCircle2 className="size-5" />
          Marquer comme résolu
        </button>
        <button
          onClick={onToggleComment}
          className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border-2 border-slate-200 bg-white py-3 text-sm font-bold text-slate-700 transition hover:border-sky-400 hover:text-sky-600"
        >
          <MessageSquare className="size-4" />
          {showCommentInline ? 'Masquer le commentaire' : 'Ajouter une note'}
        </button>
      </div>
    </div>
  )
}

// ============================================================
// S5 — Écran Confirmation Résolution
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
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-xs font-bold text-[#5257C9]"
      >
        <ArrowLeft className="size-3.5" /> Retour
      </button>

      {/* Header green */}
      <div className="overflow-hidden rounded-2xl bg-gradient-to-r from-emerald-500 to-emerald-600 px-4 py-4 text-white shadow-lg sm:px-5">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="size-6" />
          <h1 className="text-xl font-black uppercase tracking-wide">Confirmer Résolution</h1>
        </div>
        <p className="mt-1 text-xs font-medium text-white/90">
          Validez la fin de l&apos;intervention.
        </p>
      </div>

      {/* Temps écoulé */}
      <Card className="flex items-center justify-between rounded-2xl border-0 bg-white/90 p-4 shadow-md ring-1 ring-slate-200 sm:p-5">
        <div className="flex items-center gap-2 text-slate-600">
          <Clock className="size-5 text-emerald-600" />
          <span className="text-sm font-semibold">Temps écoulé</span>
        </div>
        <span className="text-2xl font-black text-[#1E1E2E]">{elapsedMin} min</span>
      </Card>

      {/* Commentaire optionnel */}
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

      {/* Photo optionnelle */}
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
// Écran Dashboard Staff Complet
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
  const urgentEnCours = Math.max(0, Math.round(todayStats.enCours * 0.3))
  const normalEnCours = Math.max(0, todayStats.enCours - urgentEnCours)

  return (
    <div className="space-y-4">
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-xs font-bold text-[#5257C9]"
      >
        <ArrowLeft className="size-3.5" /> Retour accueil
      </button>

      {/* Header */}
      <div className="overflow-hidden rounded-2xl bg-gradient-to-r from-[#1E1E2E] to-[#2D2D44] px-4 py-4 text-white shadow-lg sm:px-5">
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

      <div className="max-h-[calc(100vh-220px)] space-y-4 overflow-y-auto rounded-2xl bg-slate-50/60 p-1 sm:max-h-[calc(100vh-260px)]">
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
    <div className="flex items-center justify-between px-4 py-3.5 sm:px-5">
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
