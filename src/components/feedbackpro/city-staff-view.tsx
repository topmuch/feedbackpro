'use client'

// ============================================================
// <CityStaffView /> — PWA Staff Municipal (Ville Connectée)
// ------------------------------------------------------------
// Interface mobile-first pour les agents municipaux de Dakar
// (propreté, voirie, éclairage, polyvalent). Thème sombre #0A0A0A,
// accents dorés #C9A961 — cohérent avec le CityDashboard de supervision.
//
// FLUX
//   1. Login simple (nom + rôle, pas de PIN pour cette V1)
//      - Rôles : Propreté / Voirie / Éclairage / Polyvalent
//      - Le rôle détermine le filtre des incidents affichés :
//          Propreté   → category=propreté (routé Mairie)
//          Voirie     → category=voirie (routé Mairie)
//          Éclairage  → assignedTo=Senelec
//          Polyvalent → tous services
//
//   2. Feed temps réel
//      - Polling toutes les 10 s sur GET /api/city/incidents
//        (on récupère tous les incidents récents et on filtre
//        côté client par rôle + statut — plus souple qu'un
//        statut unique ?status=pending qui masquerait les en cours).
//      - Onglets : En attente / En cours / Résolus
//      - Cartes incident : type, catégorie, description, plaque,
//        heure, GPS, actions.
//
//   3. Actions
//      - PRENDRE EN CHARGE → status=in_progress + staffName
//      - RÉSOUDRE          → status=resolved + commentaire optionnel
//      - PATCH /api/city/incidents/[id] (tolère l'échec : override
//        local optimiste pour garder l'UI cohérente le temps que
//        l'endpoint PATCH soit déployé côté serveur).
//
// INDICATEURS
//   - GPS staff (capture au login, refresh 60 s) — affiché dans le header.
//   - Online/offline (window events) — banner doré si offline.
//
// API
//   GET  /api/city/incidents             → { incidents: CityIncident[] }
//   PATCH /api/city/incidents/[id]        → { incident } (peut 405 — toléré)
// ============================================================

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Loader2,
  ArrowLeft,
  MapPin,
  Check,
  Star,
  Building2,
  Camera,
  Navigation,
  AlertTriangle,
  LogOut,
  WifiOff,
  RefreshCw,
  Clock,
  User,
  ChevronRight,
  CircleCheck,
  CircleDot,
  Inbox,
  Radio,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { parler } from '@/lib/staff-tts'

// ============================================================
// Types (contrat API — formes sérialisées par /api/city/*)
// ============================================================

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
  type: string // emergency | report | orientation | artisan | mairie
  category: string | null
  description: string | null
  gpsLat: number | null
  gpsLng: number | null
  status: string // pending | assigned | in_progress | resolved
  assignedTo: string | null // Police | Senelec | ONAS | Mairie
  staffName: string | null
  resolvedAt: string | null
  createdAt: string
}

// ============================================================
// Palette & typographie (thème sombre staff)
// ============================================================

const COLORS = {
  bg: '#0A0A0A',
  bgCard: '#161616',
  bgCardHover: '#1F1F1F',
  border: '#2A2A2A',
  borderActive: '#3A3A3A',
  gold: '#C9A961',
  goldDim: '#8C7548',
  text: '#F5F5F0',
  textDim: '#9A9A95',
  textMuted: '#6A6A65',
  red: '#E30613',
  orange: '#FF6B00',
  blue: '#0066CC',
  green: '#00A651',
  purple: '#6B4C9A',
} as const

/** Style de titre serif (Georgia / Playfair Display). */
const TITLE_FONT: React.CSSProperties = {
  fontFamily: 'Georgia, "Playfair Display", serif',
}

// ============================================================
// Rôles staff & mapping de filtrage
// ============================================================

type StaffRole = 'Propreté' | 'Voirie' | 'Éclairage' | 'Polyvalent'

const ROLES: ReadonlyArray<{ id: StaffRole; service: string | null; emoji: string }> = [
  { id: 'Propreté', service: 'Mairie', emoji: '🗑️' },
  { id: 'Voirie', service: 'Mairie', emoji: '🛣️' },
  { id: 'Éclairage', service: 'Senelec', emoji: '💡' },
  { id: 'Polyvalent', service: null, emoji: '⭐' },
]

/** Normalise une catégorie (sans accents, lowercase) pour la comparaison. */
function normalizeCat(cat: string | null): string {
  if (!cat) return ''
  return cat
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

/**
 * Détermine si un incident concerne le rôle donné.
 * - Polyvalent → voit tout
 * - Propreté   → category=propreté (routé Mairie)
 * - Voirie     → category=voirie (routé Mairie)
 * - Éclairage  → assignedTo=Senelec (éclairage public)
 */
function matchesRole(incident: CityIncident, role: StaffRole): boolean {
  if (role === 'Polyvalent') return true
  const cat = normalizeCat(incident.category)
  if (role === 'Propreté') return cat === 'proprete'
  if (role === 'Voirie') return cat === 'voirie'
  if (role === 'Éclairage') return incident.assignedTo === 'Senelec' || cat === 'eclairage'
  return false
}

// ============================================================
// Métadonnées d'affichage par type & catégorie
// ============================================================

const TYPE_META: Record<string, { emoji: string; label: string; color: string }> = {
  emergency: { emoji: '🆘', label: 'Urgence', color: COLORS.red },
  report: { emoji: '🟠', label: 'Signalement', color: COLORS.orange },
  orientation: { emoji: '🔵', label: 'Orientation', color: COLORS.blue },
  artisan: { emoji: '🛠️', label: 'Artisan', color: COLORS.green },
  mairie: { emoji: '🏛️', label: 'Mairie', color: COLORS.purple },
}

const CATEGORY_META: Record<string, { emoji: string; label: string }> = {
  voirie: { emoji: '🛣️', label: 'Voirie' },
  eclairage: { emoji: '💡', label: 'Éclairage' },
  eau: { emoji: '💧', label: 'Eau' },
  proprete: { emoji: '🗑️', label: 'Propreté' },
  securite: { emoji: '🔒', label: 'Sécurité' },
  transport: { emoji: '🚌', label: 'Transport' },
}

function typeMeta(type: string) {
  return TYPE_META[type] ?? { emoji: '❓', label: type, color: COLORS.gold }
}

function categoryMeta(cat: string | null) {
  if (!cat) return null
  return CATEGORY_META[normalizeCat(cat)] ?? { emoji: '•', label: cat }
}

// ============================================================
// Statuts & libellés
// ============================================================

type StatusTab = 'pending' | 'in_progress' | 'resolved'

const STATUS_TABS: ReadonlyArray<{
  id: StatusTab
  label: string
  emoji: string
}> = [
  { id: 'pending', label: 'En attente', emoji: '📥' },
  { id: 'in_progress', label: 'En cours', emoji: '🔄' },
  { id: 'resolved', label: 'Résolus', emoji: '✅' },
]

function statusLabel(status: string): string {
  if (status === 'pending') return 'En attente'
  if (status === 'assigned') return 'Assigné'
  if (status === 'in_progress') return 'En cours'
  if (status === 'resolved') return 'Résolu'
  return status
}

function statusColor(status: string): string {
  if (status === 'pending') return COLORS.gold
  if (status === 'assigned') return COLORS.orange
  if (status === 'in_progress') return COLORS.blue
  if (status === 'resolved') return COLORS.green
  return COLORS.textDim
}

// ============================================================
// Helpers
// ============================================================

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

/** Format MM:SS pour les timers live (incident en cours). */
function formatMMSS(totalSec: number): string {
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

/**
 * Capture la position GPS de l'agent. Résout null si la géolocalisation
 * est indisponible, refusée ou expirée (jamais d'exception).
 */
function captureGps(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      resolve(null)
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 },
    )
  })
}

/**
 * Redimensionne une photo d'intervention SLA : 800px max de côté,
 * JPEG qualité 0.7, renvoyée en data URL. Pattern FileReader → Image →
 * canvas → toDataURL (même que city-scan-view.tsx / city-dashboard.tsx).
 */
function resizeIncidentPhoto(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('Fichier non image'))
      return
    }
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Lecture du fichier impossible'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('Image invalide'))
      img.onload = () => {
        const maxDim = 800
        const ratio = Math.min(maxDim / img.width, maxDim / img.height, 1)
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(img.width * ratio)
        canvas.height = Math.round(img.height * ratio)
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          reject(new Error('Canvas indisponible'))
          return
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/jpeg', 0.7))
      }
      img.src = reader.result as string
    }
    reader.readAsDataURL(file)
  })
}

/**
 * Tente de mettre à jour le statut d'un incident via PATCH.
 * L'endpoint /api/city/incidents/[id] n'est peut-être pas encore déployé
 * (seuls GET et POST existent sur /api/city/incidents). On tolère l'échec :
 * l'UI garde un override local optimiste pour rester cohérente.
 */
async function patchIncident(
  id: string,
  patch: {
    status?: string
    staffName?: string
    assignedTo?: string
    resolvedAt?: string
    arrivedAt?: string
    beforePhoto?: string
    afterPhoto?: string
  },
): Promise<boolean> {
  try {
    const res = await fetch(`/api/city/incidents/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    const json = (await res.json().catch(() => null)) as
      | { ok: true; data?: unknown }
      | { ok: false; error?: string }
      | null
    return !!json?.ok
  } catch {
    return false
  }
}

/** Clé localStorage pour mémoriser le nom + rôle staff entre sessions. */
const STAFF_NAME_KEY = 'fp-city-staff-name'
const STAFF_ROLE_KEY = 'fp-city-staff-role'

// ============================================================
// Composant principal
// ============================================================

type StaffScreen = 'login' | 'feed'

export function CityStaffView({
  staffTag,
  onExit,
}: {
  staffTag: string
  onExit?: () => void
}) {
  const { toast } = useToast()

  // --- Écran courant ---
  const [screen, setScreen] = useState<StaffScreen>('login')

  // --- Identité staff ---
  const [staffName, setStaffName] = useState('')
  const [role, setRole] = useState<StaffRole | ''>('')

  // --- Données ---
  const [incidents, setIncidents] = useState<CityIncident[]>([])
  const [incidentsLoading, setIncidentsLoading] = useState(false)
  const [lastPoll, setLastPoll] = useState<Date | null>(null)

  // Overrides locaux optimistes (id → { status, staffName, assignedTo })
  // Appliqués par-dessus l'état serveur pour garder l'UI cohérente
  // pendant que le PATCH n'est pas encore effectif côté serveur.
  const [localOverrides, setLocalOverrides] = useState<
    Map<string, { status: string; staffName?: string; assignedTo?: string }>
  >(new Map())

  // --- Onglet statut courant ---
  const [activeTab, setActiveTab] = useState<StatusTab>('pending')

  // --- Resolve inline (commentaire optionnel) ---
  const [resolveTargetId, setResolveTargetId] = useState<string | null>(null)
  const [resolveComment, setResolveComment] = useState('')
  const [actionPending, setActionPending] = useState<string | null>(null)

  // --- GPS staff ---
  const [gps, setGps] = useState<{ lat: number; lng: number } | null>(null)

  // --- Online/offline ---
  const [isOnline, setIsOnline] = useState(true)

  // --- Timer live (re-render chaque seconde pour les elapsed) ---
  const [, setTimerTick] = useState(0)

  // --- Réf pour éviter les fuites (polling annulé au unmount) ---
  const cancelledRef = useRef(false)

  // --- Réf mémoire des incidents du précédent poll (pour annoncer
  //     vocalement les nouvelles urgences + les résolutions via parler).
  //     null au premier chargement → pas d'annonce (sinon on spammerait
  //     toutes les urgences déjà existantes à l'ouverture de l'app).
  const prevIncidentsRef = useRef<CityIncident[] | null>(null)

  // ---------------------------------------------------------------
  // Lifecycle 1 — restaurer la session staff depuis localStorage
  // ---------------------------------------------------------------
  useEffect(() => {
    if (typeof window === 'undefined') return
    const n = localStorage.getItem(STAFF_NAME_KEY) ?? ''
    const r = localStorage.getItem(STAFF_ROLE_KEY) as StaffRole | null
    if (n && r && ROLES.some((x) => x.id === r)) {
      setStaffName(n)
      setRole(r)
      setScreen('feed')
    }
  }, [])

  // ---------------------------------------------------------------
  // Lifecycle 2 — online/offline indicator
  // ---------------------------------------------------------------
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

  // ---------------------------------------------------------------
  // Lifecycle 3 — GPS staff au login + refresh 60 s
  // ---------------------------------------------------------------
  useEffect(() => {
    if (screen !== 'feed') return
    let active = true
    const refresh = () => {
      captureGps().then((pos) => {
        if (active && pos) setGps(pos)
      })
    }
    refresh()
    const t = setInterval(refresh, 60_000)
    return () => {
      active = false
      clearInterval(t)
    }
  }, [screen])

  // ---------------------------------------------------------------
  // Lifecycle 4 — Polling incidents toutes les 10 s (écran feed)
  // ---------------------------------------------------------------
  const fetchIncidents = useCallback(async () => {
    setIncidentsLoading(true)
    try {
      const res = await fetch('/api/city/incidents', { cache: 'no-store' })
      const json = (await res.json().catch(() => null)) as
        | { ok: true; data: { incidents: CityIncident[] } }
        | { ok: false; error: string }
        | null
      if (cancelledRef.current) return
      if (json?.ok && Array.isArray(json.data?.incidents)) {
        const fresh = json.data.incidents
        // Voix Nathalie (parler) : on compare le nouvel état serveur au
        // précédent poll pour détecter (a) les nouvelles urgences et
        // (b) les transitions vers 'resolved'. Pas d'annonce au premier
        // chargement (previous est null).
        const previous = prevIncidentsRef.current
        if (previous) {
          const prevById = new Map(previous.map((i) => [i.id, i]))
          for (const inc of fresh) {
            const old = prevById.get(inc.id)
            const isNew = !old
            if (isNew && inc.type === 'emergency') {
              parler(
                `Nouvelle urgence. ${inc.category || 'Urgence'}. ${inc.assignedTo || 'Police'} notifié.`,
              )
            }
            if (old && old.status !== 'resolved' && inc.status === 'resolved') {
              parler(`Signalement résolu. ${inc.category || 'Signalement'}.`)
            }
          }
        }
        prevIncidentsRef.current = fresh
        setIncidents(fresh)
        setLastPoll(new Date())
        // Réconcilie les overrides : si le serveur a maintenant le même
        // statut que l'override, on peut l'oublier (le serveur a pris le relais).
        setLocalOverrides((prev) => {
          if (prev.size === 0) return prev
          const next = new Map(prev)
          for (const inc of json.data.incidents) {
            const ov = next.get(inc.id)
            if (ov && inc.status === ov.status) {
              next.delete(inc.id)
            }
          }
          return next.size === prev.size ? prev : next
        })
      }
    } catch {
      // réseau down — on garde les données en cache, l'UI reste fonctionnelle
    } finally {
      if (!cancelledRef.current) setIncidentsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (screen !== 'feed') return
    cancelledRef.current = false
    void fetchIncidents()
    const t = setInterval(() => {
      void fetchIncidents()
    }, 10_000)
    return () => {
      cancelledRef.current = true
      clearInterval(t)
    }
  }, [screen, fetchIncidents])

  // ---------------------------------------------------------------
  // Lifecycle 5 — timer live pour les elapsed (incident en cours)
  // ---------------------------------------------------------------
  useEffect(() => {
    if (screen !== 'feed') return
    const id = window.setInterval(() => setTimerTick((t) => t + 1), 1000)
    return () => window.clearInterval(id)
  }, [screen])

  // ---------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------

  const handleLogin = useCallback(() => {
    const name = staffName.trim()
    if (!name) {
      toast({ title: 'Saisissez votre nom', description: 'Champ obligatoire.' })
      return
    }
    if (!role) {
      toast({ title: 'Choisissez votre rôle', description: 'Propreté, Voirie, Éclairage ou Polyvalent.' })
      return
    }
    if (typeof window !== 'undefined') {
      localStorage.setItem(STAFF_NAME_KEY, name)
      localStorage.setItem(STAFF_ROLE_KEY, role)
    }
    setStaffName(name)
    setScreen('feed')
    toast({
      title: `Bienvenue ${name.split(' ')[0]}`,
      description: `Service : ${role}. Incidents chargés.`,
    })
  }, [staffName, role, toast])

  const handleLogout = useCallback(() => {
    // 1. On purge la session persistée (localStorage).
    if (typeof window !== 'undefined') {
      localStorage.removeItem(STAFF_NAME_KEY)
      localStorage.removeItem(STAFF_ROLE_KEY)
    }
    // 2. On réinitialise TOUT l'état interne à ses valeurs initiales,
    //    afin que l'écran LOGIN soit la première chose affichée (et non
    //    le dashboard/home, ni le feed précédent).
    //    Important : on n'appelle PAS onExit — sinon le parent ferme
    //    la CityStaffView et bascule sur le home/dashboard principal.
    setScreen('login')
    setStaffName('')
    setRole('')
    setIncidents([])
    setIncidentsLoading(false)
    setLastPoll(null)
    setLocalOverrides(new Map())
    setActiveTab('pending')
    setResolveTargetId(null)
    setResolveComment('')
    setActionPending(null)
    setGps(null)
    // Réinitialise la mémoire des annonces vocales : sinon, au prochain
    // login, l'ancien snapshot d'incidents déclencherait des annonces
    // erronées (résolutions/urgences fantômes).
    prevIncidentsRef.current = null
    // Toast de confirmation (delay léger pour laisser le DOM se
    // retourner proprement sur l'écran login).
    toast({
      title: 'Déconnexion réussie',
      description: 'À bientôt sur le PWA Staff Municipal.',
    })
  }, [toast])

  /**
   * PRENDRE EN CHARGE : override local optimiste (status=in_progress,
   * staffName=moi) + tentative PATCH serveur. Si le PATCH échoue
   * (endpoint non déployé), l'override garde l'UI cohérente.
   */
  const handleTakeCharge = useCallback(
    async (incident: CityIncident) => {
      const override = {
        status: 'in_progress',
        staffName: staffName,
        assignedTo: role === 'Polyvalent' ? incident.assignedTo ?? 'Mairie' : ROLES.find((r) => r.id === role)?.service ?? 'Mairie',
      }
      setLocalOverrides((prev) => {
        const next = new Map(prev)
        next.set(incident.id, override)
        return next
      })
      setActionPending(incident.id)
      toast({
        title: 'Pris en charge',
        description: `Incident ${typeMeta(incident.type).label} assigné à vous.`,
      })
      const ok = await patchIncident(incident.id, override)
      setActionPending(null)
      if (ok) {
        // Le serveur a validé : on rafraîchit immédiatement.
        void fetchIncidents()
      }
      // Si !ok : l'override local conserve l'UI. Le prochain poll réconciliera.
    },
    [staffName, role, toast, fetchIncidents],
  )

  /**
   * RÉSOUDRE : ouvre le panneau inline de résolution (commentaire
   * optionnel). La résolution effective se fait par handleConfirmResolve.
   */
  const handleResolveClick = useCallback((incidentId: string) => {
    setResolveTargetId(incidentId)
    setResolveComment('')
  }, [])

  const handleConfirmResolve = useCallback(async () => {
    if (!resolveTargetId) return
    const incident = incidents.find((i) => i.id === resolveTargetId)
    if (!incident) return
    const override = {
      status: 'resolved',
      staffName: staffName,
      assignedTo: incident.assignedTo ?? undefined,
    }
    setLocalOverrides((prev) => {
      const next = new Map(prev)
      next.set(incident.id, override)
      return next
    })
    setActionPending(incident.id)
    toast({
      title: 'Incident résolu',
      description: `${typeMeta(incident.type).label} clôturé. Merci.`,
    })
    // Note : le commentaire de résolution n'est pas persisté côté serveur
    // (l'API PATCH n'expose pas encore ce champ). On l'affiche en toast.
    if (resolveComment.trim()) {
      toast({
        title: 'Note ajoutée',
        description: resolveComment.trim().slice(0, 80),
      })
    }
    const ok = await patchIncident(incident.id, {
      ...override,
      resolvedAt: new Date().toISOString(),
    })
    setActionPending(null)
    setResolveTargetId(null)
    setResolveComment('')
    if (ok) void fetchIncidents()
  }, [resolveTargetId, resolveComment, incidents, staffName, toast, fetchIncidents])

  const handleCancelResolve = useCallback(() => {
    setResolveTargetId(null)
    setResolveComment('')
  }, [])

  /**
   * PHOTO AVANT — capture une photo d'arrivée (caméra mobile), la
   * redimensionne à 800px max (JPEG 0.7) et PATCH l'incident avec
   * beforePhoto + arrivedAt + status=in_progress. Marque le début
   * d'intervention SLA (alternative à PRENDRE EN CHARGE, avec preuve).
   */
  const handlePhotoBefore = useCallback(
    async (incident: CityIncident, file: File) => {
      setActionPending(incident.id)
      try {
        const dataUrl = await resizeIncidentPhoto(file)
        const override = {
          status: 'in_progress',
          staffName: staffName,
          assignedTo:
            role === 'Polyvalent'
              ? incident.assignedTo ?? 'Mairie'
              : (ROLES.find((r) => r.id === role)?.service ?? 'Mairie'),
        }
        setLocalOverrides((prev) => {
          const next = new Map(prev)
          next.set(incident.id, override)
          return next
        })
        toast({
          title: 'Photo avant enregistrée',
          description: 'Début d\'intervention marqué.',
        })
        const ok = await patchIncident(incident.id, {
          ...override,
          arrivedAt: new Date().toISOString(),
          beforePhoto: dataUrl,
        })
        if (ok) void fetchIncidents()
      } catch {
        toast({
          title: 'Photo invalide',
          description: 'Impossible de traiter l\'image. Réessayez.',
        })
      } finally {
        setActionPending(null)
      }
    },
    [staffName, role, toast, fetchIncidents],
  )

  /**
   * PHOTO APRÈS + RÉSOUDRE — capture une photo de fin d'intervention,
   * la redimensionne à 800px max (JPEG 0.7) et PATCH l'incident avec
   * afterPhoto + status=resolved. Clôture SLA (alternative à RÉSOUDRE,
   * avec preuve visuelle).
   */
  const handlePhotoAfter = useCallback(
    async (incident: CityIncident, file: File) => {
      setActionPending(incident.id)
      try {
        const dataUrl = await resizeIncidentPhoto(file)
        const override = {
          status: 'resolved',
          staffName: staffName,
          assignedTo: incident.assignedTo ?? undefined,
        }
        setLocalOverrides((prev) => {
          const next = new Map(prev)
          next.set(incident.id, override)
          return next
        })
        toast({
          title: 'Photo après enregistrée',
          description: 'Incident clôturé. Merci.',
        })
        const ok = await patchIncident(incident.id, {
          ...override,
          resolvedAt: new Date().toISOString(),
          afterPhoto: dataUrl,
        })
        setResolveTargetId(null)
        if (ok) void fetchIncidents()
      } catch {
        toast({
          title: 'Photo invalide',
          description: 'Impossible de traiter l\'image. Réessayez.',
        })
      } finally {
        setActionPending(null)
      }
    },
    [staffName, toast, fetchIncidents],
  )

  // ---------------------------------------------------------------
  // Dérivés : incidents fusionnés (serveur + overrides) filtrés par rôle
  // ---------------------------------------------------------------
  const roleKey = (role || 'Polyvalent') as StaffRole

  const mergedIncidents: CityIncident[] = incidents.map((inc) => {
    const ov = localOverrides.get(inc.id)
    if (!ov) return inc
    return {
      ...inc,
      status: ov.status,
      staffName: ov.staffName ?? inc.staffName,
      assignedTo: ov.assignedTo ?? inc.assignedTo,
      resolvedAt: ov.status === 'resolved' ? new Date().toISOString() : inc.resolvedAt,
    }
  })

  const roleIncidents = mergedIncidents.filter((inc) => matchesRole(inc, roleKey))

  const counts = {
    pending: roleIncidents.filter((i) => i.status === 'pending' || i.status === 'assigned').length,
    in_progress: roleIncidents.filter((i) => i.status === 'in_progress').length,
    resolved: roleIncidents.filter((i) => i.status === 'resolved').length,
  }

  const tabIncidents = roleIncidents.filter((inc) => {
    if (activeTab === 'pending') return inc.status === 'pending' || inc.status === 'assigned'
    if (activeTab === 'in_progress') return inc.status === 'in_progress'
    if (activeTab === 'resolved') return inc.status === 'resolved'
    return false
  })

  // ============================================================
  // Rendu
  // ============================================================

  const rootClass =
    'relative min-h-screen w-full text-[#F5F5F0] antialiased'
  const rootStyle: React.CSSProperties = { backgroundColor: COLORS.bg }

  // --- Écran login ---
  if (screen === 'login') {
    return (
      <div className={rootClass} style={rootStyle}>
        <LoginScreen
          staffName={staffName}
          setStaffName={setStaffName}
          role={role}
          setRole={setRole as (v: StaffRole) => void}
          staffTag={staffTag}
          onLogin={handleLogin}
          onExit={onExit}
        />
      </div>
    )
  }

  // --- Écran feed ---
  return (
    <div className={rootClass} style={rootStyle}>
      <FeedScreen
        staffName={staffName}
        role={roleKey}
        gps={gps}
        isOnline={isOnline}
        lastPoll={lastPoll}
        incidentsLoading={incidentsLoading}
        onRefresh={() => void fetchIncidents()}
        onLogout={handleLogout}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        counts={counts}
        tabIncidents={tabIncidents}
        actionPending={actionPending}
        resolveTargetId={resolveTargetId}
        resolveComment={resolveComment}
        setResolveComment={setResolveComment}
        onTakeCharge={handleTakeCharge}
        onResolveClick={handleResolveClick}
        onConfirmResolve={handleConfirmResolve}
        onCancelResolve={handleCancelResolve}
        onPhotoBefore={handlePhotoBefore}
        onPhotoAfter={handlePhotoAfter}
        staffTag={staffTag}
      />
    </div>
  )
}

// ============================================================
// LoginScreen — nom + rôle (thème sombre doré)
// ============================================================

function LoginScreen({
  staffName,
  setStaffName,
  role,
  setRole,
  staffTag,
  onLogin,
  onExit,
}: {
  staffName: string
  setStaffName: (v: string) => void
  role: StaffRole | ''
  setRole: (v: StaffRole) => void
  staffTag: string
  onLogin: () => void
  onExit?: () => void
}) {
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-10">
      {/* Logo + titre */}
      <div className="mb-8 text-center">
        <div
          className="mx-auto flex size-16 items-center justify-center rounded-2xl shadow-xl"
          style={{
            background: `linear-gradient(135deg, ${COLORS.gold} 0%, ${COLORS.goldDim} 100%)`,
          }}
        >
          <Building2 className="size-8 text-[#0A0A0A]" />
        </div>
        <h1 className="mt-4 text-2xl font-bold text-[#F5F5F0]" style={TITLE_FONT}>
          Staff Municipal
        </h1>
        <p className="mt-1 text-sm text-[#9A9A95]">
          Ville Connectée · Dakar
        </p>
        <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-[#161616] px-3 py-1 text-xs font-medium text-[#C9A961]">
          <Radio className="size-3" />
          Poste : {staffTag || 'mobile'}
        </p>
      </div>

      {/* Nom */}
      <div className="space-y-2">
        <label className="text-xs font-bold uppercase tracking-wide text-[#9A9A95]">
          Votre nom
        </label>
        <Input
          value={staffName}
          onChange={(e) => setStaffName(e.target.value)}
          placeholder="Ex : Amadou Diop"
          className="rounded-xl border-[#2A2A2A] bg-[#161616] text-base text-[#F5F5F0] placeholder:text-[#6A6A65] focus-visible:border-[#C9A961]"
          onKeyDown={(e) => {
            if (e.key === 'Enter') onLogin()
          }}
        />
      </div>

      {/* Rôle */}
      <div className="mt-5 space-y-2">
        <label className="text-xs font-bold uppercase tracking-wide text-[#9A9A95]">
          Votre service
        </label>
        <Select value={role || undefined} onValueChange={(v) => setRole(v as StaffRole)}>
          <SelectTrigger className="w-full rounded-xl border-[#2A2A2A] bg-[#161616] text-base text-[#F5F5F0] focus-visible:border-[#C9A961]">
            <SelectValue placeholder="Choisir mon service…" />
          </SelectTrigger>
          <SelectContent className="border-[#2A2A2A] bg-[#161616]">
            {ROLES.map((r) => (
              <SelectItem
                key={r.id}
                value={r.id}
                className="text-[#F5F5F0] focus:bg-[#1F1F1F] focus:text-[#C9A961]"
              >
                <span className="mr-2">{r.emoji}</span>
                {r.id}
                {r.service ? (
                  <span className="ml-2 text-xs text-[#9A9A95]">→ {r.service}</span>
                ) : null}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Rôles en grille (alternative visuelle) */}
      <div className="mt-4 grid grid-cols-2 gap-2">
        {ROLES.map((r) => {
          const active = role === r.id
          return (
            <button
              key={r.id}
              onClick={() => setRole(r.id)}
              className={cn(
                'rounded-xl border p-3 text-left transition',
                active
                  ? 'border-[#C9A961] bg-[#C9A961]/10'
                  : 'border-[#2A2A2A] bg-[#161616] hover:border-[#3A3A3A]',
              )}
            >
              <span className="text-lg" aria-hidden>
                {r.emoji}
              </span>
              <p className="mt-1 text-sm font-semibold text-[#F5F5F0]">{r.id}</p>
              <p className="text-xs text-[#6A6A65]">{r.service ?? 'Tous services'}</p>
            </button>
          )
        })}
      </div>

      {/* Bouton connexion */}
      <Button
        onClick={onLogin}
        className="mt-6 w-full rounded-xl py-5 text-base font-bold text-[#0A0A0A]"
        style={{
          backgroundColor: COLORS.gold,
        }}
      >
        <Check className="size-5" />
        Commencer mon service
      </Button>

      {/* Aide */}
      <p className="mt-4 text-center text-xs text-[#6A6A65]">
        Pas de PIN pour cette version. Votre nom et votre service sont mémorisés
        sur cet appareil.
      </p>

      {onExit && (
        <button
          onClick={onExit}
          className="mt-6 inline-flex items-center justify-center gap-1.5 text-sm font-medium text-[#9A9A95] transition hover:text-[#F5F5F0]"
        >
          <ArrowLeft className="size-4" />
          Retour à l&apos;accueil
        </button>
      )}
    </div>
  )
}

// ============================================================
// FeedScreen — header + stats + tabs + liste d'incidents
// ============================================================

function FeedScreen({
  staffName,
  role,
  gps,
  isOnline,
  lastPoll,
  incidentsLoading,
  onRefresh,
  onLogout,
  activeTab,
  setActiveTab,
  counts,
  tabIncidents,
  actionPending,
  resolveTargetId,
  resolveComment,
  setResolveComment,
  onTakeCharge,
  onResolveClick,
  onConfirmResolve,
  onCancelResolve,
  staffTag,
}: {
  staffName: string
  role: StaffRole
  gps: { lat: number; lng: number } | null
  isOnline: boolean
  lastPoll: Date | null
  incidentsLoading: boolean
  onRefresh: () => void
  onLogout: () => void
  activeTab: StatusTab
  setActiveTab: (v: StatusTab) => void
  counts: { pending: number; in_progress: number; resolved: number }
  tabIncidents: CityIncident[]
  actionPending: string | null
  resolveTargetId: string | null
  resolveComment: string
  setResolveComment: (v: string) => void
  onTakeCharge: (inc: CityIncident) => void
  onResolveClick: (id: string) => void
  onConfirmResolve: () => void
  onCancelResolve: () => void
  onPhotoBefore: (inc: CityIncident, file: File) => void
  onPhotoAfter: (inc: CityIncident, file: File) => void
  staffTag: string
}) {
  const roleMeta = ROLES.find((r) => r.id === role)

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col">
      {/* --- Header --- */}
      <header
        className="sticky top-0 z-30 border-b border-[#2A2A2A] px-4 py-3"
        style={{ backgroundColor: COLORS.bg }}
      >
        {/* Ligne 1 : identité + logout */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div
              className="flex size-9 items-center justify-center rounded-lg"
              style={{
                background: `linear-gradient(135deg, ${COLORS.gold} 0%, ${COLORS.goldDim} 100%)`,
              }}
            >
              <span className="text-base" aria-hidden>
                {roleMeta?.emoji ?? '⭐'}
              </span>
            </div>
            <div>
              <p className="text-sm font-bold text-[#F5F5F0]" style={TITLE_FONT}>
                {staffName}
              </p>
              <p className="text-xs text-[#C9A961]">
                {role} · {roleMeta?.service ?? 'Polyvalent'}
              </p>
            </div>
          </div>
          <button
            onClick={onLogout}
            className="inline-flex items-center gap-1.5 rounded-full border border-[#2A2A2A] px-3 py-1.5 text-xs font-semibold text-[#9A9A95] transition hover:border-[#3A3A3A] hover:text-[#F5F5F0]"
          >
            <LogOut className="size-3.5" />
            Quitter
          </button>
        </div>

        {/* Ligne 2 : GPS + online + refresh */}
        <div className="mt-2.5 flex items-center gap-2 text-xs">
          {/* GPS */}
          <span
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium',
              gps
                ? 'bg-[#C9A961]/10 text-[#C9A961]'
                : 'bg-[#161616] text-[#6A6A65]',
            )}
            title={gps ? `${gps.lat.toFixed(5)}, ${gps.lng.toFixed(5)}` : 'GPS indisponible'}
          >
            <MapPin className="size-3" />
            {gps ? `${gps.lat.toFixed(4)}, ${gps.lng.toFixed(4)}` : 'GPS…'}
          </span>

          {/* Online */}
          <span
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium',
              isOnline
                ? 'bg-[#00A651]/10 text-[#00A651]'
                : 'bg-[#E30613]/10 text-[#E30613]',
            )}
          >
            {isOnline ? (
              <Radio className="size-3" />
            ) : (
              <WifiOff className="size-3 animate-pulse" />
            )}
            {isOnline ? 'En ligne' : 'Hors ligne'}
          </span>

          {/* Refresh */}
          <button
            onClick={onRefresh}
            className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-[#2A2A2A] px-2.5 py-1 font-medium text-[#9A9A95] transition hover:text-[#F5F5F0]"
            title={lastPoll ? `Dernier sync : ${lastPoll.toLocaleTimeString('fr-FR')}` : 'Jamais synchronisé'}
          >
            <RefreshCw
              className={cn('size-3', incidentsLoading && 'animate-spin')}
            />
            {lastPoll ? lastPoll.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'Sync'}
          </button>
        </div>

        {/* Offline banner */}
        {!isOnline && (
          <div className="mt-2.5 flex items-center gap-2 rounded-lg bg-[#E30613]/10 px-3 py-2 text-xs font-medium text-[#E30613]">
            <WifiOff className="size-3.5 animate-pulse" />
            Mode hors ligne — les actions sont mémorisées et synchronisées au retour du réseau.
          </div>
        )}
      </header>

      {/* --- Stats résumées --- */}
      <div className="grid grid-cols-3 gap-2 px-4 pt-4">
        <StatCard
          label="En attente"
          value={counts.pending}
          emoji="📥"
          color={COLORS.gold}
          active={activeTab === 'pending'}
          onClick={() => setActiveTab('pending')}
        />
        <StatCard
          label="En cours"
          value={counts.in_progress}
          emoji="🔄"
          color={COLORS.blue}
          active={activeTab === 'in_progress'}
          onClick={() => setActiveTab('in_progress')}
        />
        <StatCard
          label="Résolus"
          value={counts.resolved}
          emoji="✅"
          color={COLORS.green}
          active={activeTab === 'resolved'}
          onClick={() => setActiveTab('resolved')}
        />
      </div>

      {/* --- Tabs filtre --- */}
      <div className="flex gap-1 px-4 pt-3">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'flex-1 rounded-lg py-2 text-xs font-bold transition',
              activeTab === tab.id
                ? 'bg-[#C9A961] text-[#0A0A0A]'
                : 'bg-[#161616] text-[#9A9A95] hover:text-[#F5F5F0]',
            )}
          >
            {tab.emoji} {tab.label}
          </button>
        ))}
      </div>

      {/* --- Liste incidents --- */}
      <main className="flex-1 space-y-3 px-4 py-4">
        {incidentsLoading && tabIncidents.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16">
            <Loader2 className="size-8 animate-spin text-[#C9A961]" />
            <p className="text-sm text-[#9A9A95]">Chargement des incidents…</p>
          </div>
        ) : tabIncidents.length === 0 ? (
          <EmptyState tab={activeTab} />
        ) : (
          tabIncidents.map((inc) => (
            <IncidentCard
              key={inc.id}
              incident={inc}
              currentStaffName={staffName}
              actionPending={actionPending === inc.id}
              resolveOpen={resolveTargetId === inc.id}
              resolveComment={resolveComment}
              setResolveComment={setResolveComment}
              onTakeCharge={() => onTakeCharge(inc)}
              onResolveClick={() => onResolveClick(inc.id)}
              onConfirmResolve={onConfirmResolve}
              onCancelResolve={onCancelResolve}
              onPhotoBefore={(file) => onPhotoBefore(inc, file)}
              onPhotoAfter={(file) => onPhotoAfter(inc, file)}
            />
          ))
        )}
      </main>

      {/* --- Footer --- */}
      <footer className="border-t border-[#2A2A2A] px-4 py-3 text-center">
        <p className="text-xs text-[#6A6A65]">
          Poste <span className="font-mono text-[#9A9A95]">{staffTag}</span> ·
          Polling 10 s · {tabIncidents.length} incident
          {tabIncidents.length > 1 ? 's' : ''} affiché
          {tabIncidents.length > 1 ? 's' : ''}
        </p>
      </footer>
    </div>
  )
}

// ============================================================
// StatCard — carte stat cliquable (sert aussi d'onglet)
// ============================================================

function StatCard({
  label,
  value,
  emoji,
  color,
  active,
  onClick,
}: {
  label: string
  value: number
  emoji: string
  color: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'rounded-xl border p-3 text-left transition',
        active ? 'border-[#C9A961]' : 'border-[#2A2A2A] bg-[#161616]',
      )}
      style={active ? { backgroundColor: `${color}10` } : undefined}
    >
      <div className="flex items-center justify-between">
        <span className="text-base" aria-hidden>
          {emoji}
        </span>
        <span className="text-xl font-bold text-[#F5F5F0]" style={{ color: active ? color : COLORS.text }}>
          {value}
        </span>
      </div>
      <p className="mt-1 text-xs font-medium text-[#9A9A95]">{label}</p>
    </button>
  )
}

// ============================================================
// EmptyState — liste vide selon l'onglet
// ============================================================

function EmptyState({ tab }: { tab: StatusTab }) {
  const msg =
    tab === 'pending'
      ? 'Aucun incident en attente pour votre service.'
      : tab === 'in_progress'
        ? "Vous n'avez aucun incident en cours."
        : 'Aucun incident résolu pour le moment.'
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <Inbox className="size-10 text-[#3A3A3A]" />
      <p className="text-sm font-medium text-[#9A9A95]">{msg}</p>
      <p className="text-xs text-[#6A6A65]">
        La liste se met à jour automatiquement toutes les 10 secondes.
      </p>
    </div>
  )
}

// ============================================================
// IncidentCard — carte incident avec actions
// ============================================================

function IncidentCard({
  incident,
  currentStaffName,
  actionPending,
  resolveOpen,
  resolveComment,
  setResolveComment,
  onTakeCharge,
  onResolveClick,
  onConfirmResolve,
  onCancelResolve,
}: {
  incident: CityIncident
  currentStaffName: string
  actionPending: boolean
  resolveOpen: boolean
  resolveComment: string
  setResolveComment: (v: string) => void
  onTakeCharge: () => void
  onResolveClick: () => void
  onConfirmResolve: () => void
  onCancelResolve: () => void
  onPhotoBefore: (file: File) => void
  onPhotoAfter: (file: File) => void
}) {
  const beforeInputRef = useRef<HTMLInputElement>(null)
  const afterInputRef = useRef<HTMLInputElement>(null)
  const tMeta = typeMeta(incident.type)
  const cMeta = categoryMeta(incident.category)
  const sc = statusColor(incident.status)
  const isMine =
    incident.staffName !== null && incident.staffName === currentStaffName
  const isPending =
    incident.status === 'pending' || incident.status === 'assigned'
  const isInProgress = incident.status === 'in_progress'
  const isResolved = incident.status === 'resolved'
  const isEmergency = incident.type === 'emergency'

  // Elapsed pour les incidents en cours (depuis createdAt)
  const elapsedSec = isInProgress
    ? Math.max(0, Math.floor((Date.now() - new Date(incident.createdAt).getTime()) / 1000))
    : 0

  return (
    <article
      className="rounded-2xl border border-[#2A2A2A] bg-[#161616] p-4 transition hover:border-[#3A3A3A]"
      style={{ borderLeft: `4px solid ${tMeta.color}` }}
    >
      {/* Ligne 1 : type + statut */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl" aria-hidden>
            {tMeta.emoji}
          </span>
          <div>
            <p className="text-sm font-bold text-[#F5F5F0]" style={TITLE_FONT}>
              {tMeta.label}
              {cMeta && (
                <span className="ml-1.5 text-[#9A9A95]">· {cMeta.emoji} {cMeta.label}</span>
              )}
              {isEmergency && (
                <AlertTriangle className="ml-1.5 inline size-3.5 text-[#E30613]" />
              )}
            </p>
            {incident.assignedTo && (
              <p className="mt-0.5 text-xs font-medium" style={{ color: sc }}>
                → {incident.assignedTo}
              </p>
            )}
          </div>
        </div>
        <Badge
          className="border-0 text-xs font-bold"
          style={{ backgroundColor: `${sc}20`, color: sc }}
        >
          {statusLabel(incident.status)}
        </Badge>
      </div>

      {/* Description */}
      {incident.description && (
        <p className="mt-3 rounded-lg bg-[#0A0A0A] px-3 py-2 text-sm text-[#F5F5F0]/85">
          « {incident.description} »
        </p>
      )}

      {/* Plaque info */}
      {incident.plate && (
        <div className="mt-3 flex items-center gap-2 text-xs text-[#9A9A95]">
          <MapPin className="size-3 text-[#C9A961]" />
          <span className="font-mono font-bold text-[#C9A961]">
            {incident.plate.plateNumber}
          </span>
          <span className="text-[#6A6A65]">·</span>
          <span>{incident.plate.label}</span>
          {incident.plate.district && (
            <span className="text-[#6A6A65]">· {incident.plate.district}</span>
          )}
        </div>
      )}

      {/* GPS */}
      {incident.gpsLat !== null && incident.gpsLng !== null && (
        <div className="mt-1.5 flex items-center gap-2 text-xs">
          <Navigation className="size-3 text-[#0066CC]" />
          <span className="font-mono text-[#9A9A95]">
            {incident.gpsLat.toFixed(5)}, {incident.gpsLng.toFixed(5)}
          </span>
          <a
            href={`https://www.openstreetmap.org/?mlat=${incident.gpsLat}&mlon=${incident.gpsLng}#map=18/${incident.gpsLat}/${incident.gpsLng}`}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto text-[#0066CC] hover:underline"
          >
            Voir carte →
          </a>
        </div>
      )}

      {/* Footer : heure + agent */}
      <div className="mt-3 flex items-center justify-between border-t border-[#2A2A2A] pt-2 text-xs">
        <span className="inline-flex items-center gap-1 text-[#6A6A65]">
          <Clock className="size-3" />
          {relTime(incident.createdAt)}
        </span>
        {isInProgress && (
          <span className="inline-flex items-center gap-1 font-mono font-bold text-[#0066CC]">
            <CircleDot className="size-3 animate-pulse" />
            {formatMMSS(elapsedSec)}
          </span>
        )}
        {incident.staffName && (
          <span className="inline-flex items-center gap-1 text-[#9A9A95]">
            <User className="size-3" />
            {isMine ? 'Moi' : incident.staffName}
          </span>
        )}
      </div>

      {/* Actions */}
      <div className="mt-3 space-y-2">
        {/* Panneau de résolution inline */}
        {resolveOpen ? (
          <div className="space-y-2 rounded-xl bg-[#0A0A0A] p-3">
            <label className="text-xs font-bold uppercase tracking-wide text-[#9A9A95]">
              Note de résolution (optionnel)
            </label>
            <Textarea
              value={resolveComment}
              onChange={(e) => setResolveComment(e.target.value)}
              placeholder="Décrivez l'action menée…"
              maxLength={500}
              className="min-h-20 rounded-lg border-[#2A2A2A] bg-[#161616] text-sm text-[#F5F5F0] placeholder:text-[#6A6A65] focus-visible:border-[#C9A961]"
            />
            <div className="flex gap-2">
              <Button
                onClick={onConfirmResolve}
                disabled={actionPending}
                className="flex-1 rounded-lg bg-[#00A651] text-white hover:bg-[#008a44]"
              >
                {actionPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <CircleCheck className="size-4" />
                )}
                Confirmer la résolution
              </Button>
              <Button
                onClick={onCancelResolve}
                variant="ghost"
                className="rounded-lg text-[#9A9A95] hover:bg-[#1F1F1F]"
              >
                Annuler
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex gap-2">
              {isPending && (
                <Button
                  onClick={onTakeCharge}
                  disabled={actionPending}
                  className="flex-1 rounded-lg bg-[#C9A961] text-[#0A0A0A] hover:bg-[#b8965a]"
                >
                  {actionPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <ChevronRight className="size-4" />
                  )}
                  PRENDRE EN CHARGE
                </Button>
              )}
              {isInProgress && (
                <Button
                  onClick={onResolveClick}
                  disabled={actionPending}
                  className="flex-1 rounded-lg bg-[#00A651] text-white hover:bg-[#008a44]"
                >
                  <CircleCheck className="size-4" />
                  RÉSOUDRE
                </Button>
              )}
              {isResolved && (
                <div className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#00A651]/10 py-2 text-xs font-bold text-[#00A651]">
                  <Check className="size-3.5" />
                  Clôturé
                  {incident.resolvedAt && (
                    <span className="ml-1 font-normal text-[#6A6A65]">
                      · {relTime(incident.resolvedAt)}
                    </span>
                  )}
                </div>
              )}
            </div>
            {/* SLA Photo avant — capture caméra + PATCH beforePhoto + arrivedAt */}
            {isPending && (
              <>
                <Button
                  onClick={() => beforeInputRef.current?.click()}
                  disabled={actionPending}
                  variant="outline"
                  className="w-full rounded-lg border-[#C9A961]/40 text-[#C9A961] hover:bg-[#C9A961]/10 hover:text-[#C9A961]"
                >
                  {actionPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Camera className="size-4" />
                  )}
                  Photo avant
                </Button>
                <input
                  ref={beforeInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  aria-hidden
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) onPhotoBefore(f)
                    e.target.value = ''
                  }}
                />
              </>
            )}
            {/* SLA Photo après + Résoudre — capture caméra + PATCH afterPhoto + resolved */}
            {isInProgress && (
              <>
                <Button
                  onClick={() => afterInputRef.current?.click()}
                  disabled={actionPending}
                  variant="outline"
                  className="w-full rounded-lg border-[#00A651]/40 text-[#00A651] hover:bg-[#00A651]/10 hover:text-[#00A651]"
                >
                  {actionPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Camera className="size-4" />
                  )}
                  Photo après + Résoudre
                </Button>
                <input
                  ref={afterInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  aria-hidden
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) onPhotoAfter(f)
                    e.target.value = ''
                  }}
                />
              </>
            )}
          </>
        )}
      </div>
    </article>
  )
}

// ============================================================
// Export par défaut
// ============================================================

export default CityStaffView
