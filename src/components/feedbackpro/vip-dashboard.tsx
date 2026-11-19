'use client'

// ============================================================
// VIP-REFONTE — <VIPDashboard /> — Salon VIP "Luxe Lumineux"
// ------------------------------------------------------------
// Refonte premium du dashboard Salon VIP.
// Palette "Luxe Lumineux" (clair et élégant) :
//   - Background   #FAFAF7 (warm off-white)
//   - Cards        #FFFFFF (pure white)
//   - Accent       #C9A961 (champagne gold)
//   - Accent 2     #8B6F47 (bronze)
//   - Text         #2C2C2C (anthracite gray)
//   - Success      #4A7C59 (sage green)
//   - Alert        #C97B63 (terracotta)
//   - VIP badge    #6B4C9A (amethyst purple)
//
// Architecture : Sidebar fixe (260px) + 11 onglets.
//   A. Vue d'ensemble      — KPI + alertes douces
//   B. Signalements        — table incidents + actions
//   C. Buffet & Bar        — checklist + timer MM:SS
//   D. Douches Smart       — grille cabines + QR
//   E. Récompenses Premium — cartes luxe + historique
//   F. Clients VIP         — table + form (Gold/Platinum/Diamond)
//   G. Équipe / Staff      — table + form + perf
//   H. QR Codes            — 6 zones + QR staff
//   I. Rapports            — KPI + bar chart CSS
//   J. Voix Denise         — matrice + horaire + historique + test + signalements
//   K. Paramètres          — général / Denise / buffet / douches / rewards
//
// Mode Discrétion : TOUTES les notifications sont visuelles (aucun son).
// Polling : /api/vip/incidents, /api/vip/showers, /api/vip/buffet toutes
// les 30 secondes. Les onglets F-J utilisent un état local seedé (mock)
// en attendant leurs APIs dédiées.
// ============================================================

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Wine,
  LayoutDashboard,
  Bell,
  ConciergeBell,
  ShowerHead,
  Gift,
  Users,
  UserCog,
  Plane,
  QrCode,
  BarChart3,
  Settings,
  LogOut,
  Menu,
  Plus,
  Search,
  RefreshCw,
  Loader2,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Download,
  Printer,
  Phone,
  Crown,
  Diamond,
  Sparkles,
  Armchair,
  Cigarette,
  Bath,
  Eye,
  ArrowUp,
  ArrowDown,
  Save,
  Volume2,
  VolumeX,
  ShieldCheck,
  CircleDot,
  Map,
  Utensils,
  Plug,
  Star,
  Trash2,
  MapPin,
  LayoutGrid,
  Coffee,
  Timer,
  X,
  UserPlus,
  Monitor,
} from 'lucide-react'
import { useAppStore } from '@/store/app-store'
import { getZonesByTenant } from '@/lib/airport-config'
import { cn } from '@/lib/utils'
import { VipClientsTab } from '@/components/feedbackpro/vip-clients-tab'
import { VipSettingsTab } from '@/components/feedbackpro/vip-settings-tab'
import { VipReportsTab } from '@/components/feedbackpro/vip-reports-tab'
import { VipGuestAlertBanner } from '@/components/feedbackpro/vip-guest-alert'
import type { VipLoungeConfig } from '@/lib/vip-clients'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Slider } from '@/components/ui/slider'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { useToast } from '@/hooks/use-toast'

// ============================================================
// Types
// ============================================================

type VipIncident = {
  id: string
  zone: { code: string; nom: string; emoji: string } | null
  problemType: string
  commentaire: string | null
  statut: 'EN_ATTENTE' | 'EN_COURS' | 'RESOLU'
  createdAt: string
}

type ShowerStatus = 'free' | 'occupied' | 'cleaning' | 'maintenance'

type Shower = {
  id: string
  showerNumber: number
  status: 'free' | 'occupied' | 'cleaning'
  occupiedSince: string | null
  updatedAt: string
}

type BuffetItem = {
  id: string
  item: string
  fillLevel: number
  lastCheck: string
  nextCheck: string
  status: 'ok' | 'warning' | 'critical'
}

type VipClient = {
  id: string
  name: string
  photoUrl: string | null
  airline: string
  level: 'Gold' | 'Platinum' | 'Diamond'
  lastVisit: string
  notes: string
}

type StaffMember = {
  id: string
  name: string
  role: StaffRole
  photoUrl: string | null
  phone: string
  present: boolean
  incidentsResolved: number
  satisfactionScore: number
}

// ---- Phase 1 — VipTable & VipTableRequest (from /api/vip/tables & /requests)
type VipTableStatus = 'free' | 'occupied' | 'problem' | 'reserved'

type VipTableRequestData = {
  id: string
  type: string  // refreshment, menu, shower, charger, concierge, problem, rating, cleanup
  status: string  // pending, in_progress, done
  message: string | null
  createdAt: string
  staffName: string | null
}

type VipTableData = {
  id: string
  tableNumber: string
  zone: string  // main, buffet, relaxation, meeting
  seats: number
  status: VipTableStatus
  qrToken: string
  clientName: string | null
  clientVipLevel: string | null  // gold, platinum, diamond
  arrivedAt: string | null
  activeRequests: number
  requests: VipTableRequestData[]
  createdAt: string
  updatedAt: string
}

type VipRequestWithTable = VipTableRequestData & {
  tableId: string
  table: {
    id: string
    tableNumber: string
    zone: string
    clientName: string | null
    clientVipLevel: string | null
  }
}

type StaffRole = 'Manager' | "Maître d'Hôtel" | 'Réceptionniste' | 'Étage' | 'Chef/Barman'

type RewardGiven = {
  id: string
  rewardId: string
  rewardLabel: string
  clientName: string
  staffName: string
  givenAt: string
  cost: number
}

type VipTab =
  | 'overview'
  | 'plan'
  | 'incidents'
  | 'buffet'
  | 'showers'
  | 'rewards'
  | 'clients'
  | 'staff'
  | 'qr'
  | 'reports'
  | 'wallboard'
  | 'settings'

type VipSettings = {
  salonName: string
  capacity: number
  openingHours: string
  salonAddress: string
  salonLogoUrl: string | null
  deniseVoiceEnabled: boolean
  deniseMaxVolume: number
  deniseTone: 'doux' | 'neutre' | 'chaleureux'
  deniseLanguages: string[]
  deniseWelcomeMessage: string
  vipAlertsEnabled: boolean
  vipAlertsRecipient: string
  vipAlertsDelaySec: number
  buffetInterval: 15 | 30 | 45 | 60
  buffetLowThreshold: number
  showersCount: number
  showerMaxTime: number
  showerCleaningTime: number
  showerDeepCleanThreshold: number
  rewardsBudgetMonthly: number
  rewardsValidation: 'auto' | 'manager'
  notifPushEnabled: boolean
  notifEmailEnabled: boolean
  notifSmsEnabled: boolean
  notifWhatsappEnabled: boolean
  notifDndStart: string
  notifDndEnd: string
  integrationFlightsApi: boolean
  integrationVipImport: boolean
}

// ============================================================
// Constantes — palette + seeds locaux
// ============================================================

const VIP_ZONES = getZonesByTenant('vip_lounge')

const LUXE_REWARDS: Array<{
  id: string
  label: string
  description: string
  cost: number
  Icon: typeof Wine
}> = [
  { id: 'champagne', label: 'Coupe de Champagne', description: 'Cuvée prestige servie à table', cost: 28, Icon: Wine },
  { id: 'massage', label: 'Upgrade Fauteuil Massage', description: 'Séance 15 min en salle de relaxation', cost: 45, Icon: Armchair },
  { id: 'cigar', label: 'Cigar Premium', description: 'Cohiba ou Davidoff, fumoir privé', cost: 65, Icon: Cigarette },
  { id: 'spa', label: 'Accès Spa 30 min', description: 'Privatisation du spa VIP', cost: 80, Icon: Bath },
]

const SEED_CLIENTS: VipClient[] = [
  {
    id: 'c1',
    name: 'Alexandre Laurent',
    photoUrl: 'https://i.pravatar.cc/96?img=12',
    airline: 'Air France',
    level: 'Platinum',
    lastVisit: '2025-01-12',
    notes: 'Préfère table côté fenêtre. Allergie crustacés.',
  },
  {
    id: 'c2',
    name: 'Sophie Marchand',
    photoUrl: 'https://i.pravatar.cc/96?img=47',
    airline: 'Lufthansa',
    level: 'Diamond',
    lastVisit: '2025-01-15',
    notes: 'Habituelle douche N°2. Boit espresso double.',
  },
  {
    id: 'c3',
    name: 'Karim Benali',
    photoUrl: 'https://i.pravatar.cc/96?img=33',
    airline: 'Emirates',
    level: 'Gold',
    lastVisit: '2025-01-10',
    notes: 'Demande salle de réunion privée fréquente.',
  },
  {
    id: 'c4',
    name: 'Yuki Tanaka',
    photoUrl: 'https://i.pravatar.cc/96?img=23',
    airline: 'Japan Airlines',
    level: 'Platinum',
    lastVisit: '2025-01-14',
    notes: 'Régime végétarien. Apprecie thé Matcha.',
  },
  {
    id: 'c5',
    name: 'Élise Dubois',
    photoUrl: 'https://i.pravatar.cc/96?img=44',
    airline: 'British Airways',
    level: 'Gold',
    lastVisit: '2025-01-09',
    notes: 'Aime champagne rosé. Voyage mensuel.',
  },
  {
    id: 'c6',
    name: 'Marcus Chen',
    photoUrl: 'https://i.pravatar.cc/96?img=15',
    airline: 'Singapore Airlines',
    level: 'Diamond',
    lastVisit: '2025-01-16',
    notes: 'Cigar premium après déjeuner. Client exigeant.',
  },
]

const SEED_STAFF: StaffMember[] = [
  {
    id: 's1',
    name: 'Camille Rousseau',
    role: 'Manager',
    photoUrl: 'https://i.pravatar.cc/96?img=48',
    phone: '+33 6 12 34 56 78',
    present: true,
    incidentsResolved: 18,
    satisfactionScore: 4.8,
  },
  {
    id: 's2',
    name: 'Olivier Petit',
    role: "Maître d'Hôtel",
    photoUrl: 'https://i.pravatar.cc/96?img=11',
    phone: '+33 6 23 45 67 89',
    present: true,
    incidentsResolved: 24,
    satisfactionScore: 4.6,
  },
  {
    id: 's3',
    name: 'Nadia Cherif',
    role: 'Réceptionniste',
    photoUrl: 'https://i.pravatar.cc/96?img=32',
    phone: '+33 6 34 56 78 90',
    present: true,
    incidentsResolved: 12,
    satisfactionScore: 4.9,
  },
  {
    id: 's4',
    name: 'Thomas Lefèvre',
    role: 'Étage',
    photoUrl: 'https://i.pravatar.cc/96?img=13',
    phone: '+33 6 45 67 89 01',
    present: false,
    incidentsResolved: 9,
    satisfactionScore: 4.4,
  },
  {
    id: 's5',
    name: 'Élise Garnier',
    role: 'Chef/Barman',
    photoUrl: 'https://i.pravatar.cc/96?img=45',
    phone: '+33 6 56 78 90 12',
    present: true,
    incidentsResolved: 15,
    satisfactionScore: 4.7,
  },
]

const QR_SERVER = 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data='
const FALLBACK_URL = 'https://feedback.qrbags.com'

/**
 * Renvoie l'URL absolue de l'app (origine) au moment de l'appel.
 * - Côté client : window.location.origin (ex: https://feedback.qrbags.com)
 * - Côté serveur (SSR) : fallback hardcoded vers le domaine de prod
 *
 * IMPORTANT : on utilise une FONCTION (pas une constante module-level) car
 * une constante est évaluée une seule fois au chargement du module. En SSR,
 * window est undefined → la constante valait le fallback ; en hydration client,
 * elle valait window.location.origin. Selon le contexte (cache, navigation
 * SPA, preview IP), cela pouvait produire un QR code sans nom de domaine
 * (URL relative). La fonction garantit toujours une URL absolue.
 */
function appUrl(): string {
  if (typeof window !== 'undefined' && window.location && window.location.origin) {
    return window.location.origin
  }
  return FALLBACK_URL
}

const BUFFET_ITEM_LABELS: Record<string, string> = {
  buffet_fill: 'Buffet (Saumon, Fruits, Mignardises)',
  drinks_level: 'Champagne & Boissons',
  cleanliness: 'Propreté du buffet',
}

const SHOWER_STATUS_LABEL: Record<ShowerStatus, string> = {
  free: 'Libre',
  occupied: 'Occupée',
  cleaning: 'Nettoyage',
  maintenance: 'Maintenance',
}

const SHOWER_STATUS_STYLE: Record<ShowerStatus, { bg: string; ring: string; dot: string; label: string }> = {
  free: { bg: 'bg-[#4A7C59]/8', ring: 'ring-[#4A7C59]/30', dot: 'bg-[#4A7C59]', label: 'text-[#4A7C59]' },
  occupied: { bg: 'bg-[#6B4C9A]/8', ring: 'ring-[#6B4C9A]/30', dot: 'bg-[#6B4C9A]', label: 'text-[#6B4C9A]' },
  cleaning: { bg: 'bg-[#C97B63]/8', ring: 'ring-[#C97B63]/30', dot: 'bg-[#C97B63]', label: 'text-[#C97B63]' },
  maintenance: { bg: 'bg-[#8B6F47]/8', ring: 'ring-[#8B6F47]/30', dot: 'bg-[#8B6F47]', label: 'text-[#8B6F47]' },
}

const INCIDENT_STATUS_LABEL: Record<VipIncident['statut'], string> = {
  EN_ATTENTE: 'Nouveau',
  EN_COURS: 'En cours',
  RESOLU: 'Résolu',
}

const INCIDENT_STATUS_STYLE: Record<VipIncident['statut'], string> = {
  EN_ATTENTE: 'bg-[#C97B63]/12 text-[#C97B63] border-[#C97B63]/25',
  EN_COURS: 'bg-[#C9A961]/15 text-[#8B6F47] border-[#C9A961]/35',
  RESOLU: 'bg-[#4A7C59]/12 text-[#4A7C59] border-[#4A7C59]/25',
}

const CLIENT_LEVEL_STYLE: Record<VipClient['level'], { label: string; bg: string; text: string; Icon: typeof Crown }> = {
  Gold: { label: 'Gold', bg: 'bg-[#C9A961]/15', text: 'text-[#8B6F47]', Icon: Crown },
  Platinum: { label: 'Platinum', bg: 'bg-[#6B4C9A]/12', text: 'text-[#6B4C9A]', Icon: Sparkles },
  Diamond: { label: 'Diamond', bg: 'bg-[#4A7C59]/12', text: 'text-[#4A7C59]', Icon: Diamond },
}

const STAFF_ROLE_ICON: Record<StaffRole, typeof UserCog> = {
  Manager: ShieldCheck,
  "Maître d'Hôtel": ConciergeBell,
  Réceptionniste: ConciergeBell,
  Étage: Armchair,
  'Chef/Barman': Wine,
}

// ---- Phase 1 — Table status styling (Plan Interactif 2D) ----
const TABLE_STATUS_STYLE: Record<VipTableStatus, {
  dot: string
  ring: string
  bg: string
  text: string
  label: string
  border: string
}> = {
  free: {
    dot: 'bg-[#4A7C59]',
    ring: 'ring-[#4A7C59]/30',
    bg: 'bg-[#4A7C59]/6',
    text: 'text-[#4A7C59]',
    label: 'Libre',
    border: 'border-[#4A7C59]/25',
  },
  occupied: {
    dot: 'bg-[#6B4C9A]',
    ring: 'ring-[#6B4C9A]/30',
    bg: 'bg-[#6B4C9A]/6',
    text: 'text-[#6B4C9A]',
    label: 'Occupée',
    border: 'border-[#6B4C9A]/25',
  },
  problem: {
    dot: 'bg-[#C97B63]',
    ring: 'ring-[#C97B63]/30',
    bg: 'bg-[#C97B63]/6',
    text: 'text-[#C97B63]',
    label: 'Problème',
    border: 'border-[#C97B63]/25',
  },
  reserved: {
    dot: 'bg-[#C9A961]',
    ring: 'ring-[#C9A961]/30',
    bg: 'bg-[#C9A961]/6',
    text: 'text-[#8B6F47]',
    label: 'Réservée',
    border: 'border-[#C9A961]/30',
  },
}

// ---- Phase 1 — Table zones (Plan du Salon) ----
const TABLE_ZONE_META: Record<string, { label: string; emoji: string; accent: string }> = {
  main: { label: 'Espace Principal', emoji: '🍽️', accent: '#C9A961' },
  buffet: { label: 'Buffet & Bar', emoji: '🥂', accent: '#8B6F47' },
  relaxation: { label: 'Espace Détente', emoji: '🧘', accent: '#4A7C59' },
  meeting: { label: 'Salles de Réunion', emoji: '💼', accent: '#6B4C9A' },
}

// ---- Phase 1 — Request type metadata ----
const REQUEST_TYPE_META: Record<string, { label: string; Icon: typeof Wine; tone: 'gold' | 'bronze' | 'sage' | 'terracotta' | 'amethyst' }> = {
  refreshment: { label: 'Rafraîchissement', Icon: Wine, tone: 'gold' },
  menu: { label: 'Menu du jour', Icon: Utensils, tone: 'bronze' },
  shower: { label: 'Réservation douche', Icon: ShowerHead, tone: 'sage' },
  charger: { label: 'Chargeur', Icon: Plug, tone: 'bronze' },
  concierge: { label: 'Appeler concierge', Icon: ConciergeBell, tone: 'amethyst' },
  problem: { label: 'Signaler un problème', Icon: AlertTriangle, tone: 'terracotta' },
  rating: { label: 'Noter l\'expérience', Icon: Star, tone: 'gold' },
  cleanup: { label: 'Nettoyage table', Icon: Trash2, tone: 'sage' },
}

const REQUEST_STATUS_META: Record<string, { label: string; style: string }> = {
  pending: { label: 'En attente', style: 'bg-[#C97B63]/12 text-[#C97B63] border-[#C97B63]/25' },
  in_progress: { label: 'En cours', style: 'bg-[#C9A961]/15 text-[#8B6F47] border-[#C9A961]/35' },
  done: { label: 'Terminé', style: 'bg-[#4A7C59]/12 text-[#4A7C59] border-[#4A7C59]/25' },
}

const NAV_ITEMS: Array<{ id: VipTab; label: string; Icon: typeof LayoutDashboard }> = [
  { id: 'overview', label: "Vue d'ensemble", Icon: LayoutDashboard },
  { id: 'plan', label: 'Plan du Salon', Icon: Map },
  { id: 'incidents', label: 'Signalements', Icon: Bell },
  { id: 'buffet', label: 'Buffet & Bar', Icon: Wine },
  { id: 'showers', label: 'Douches Smart', Icon: ShowerHead },
  { id: 'rewards', label: 'Récompenses Premium', Icon: Gift },
  { id: 'clients', label: 'Clients VIP', Icon: Users },
  { id: 'staff', label: 'Équipe / Staff', Icon: UserCog },
  { id: 'qr', label: 'QR Codes', Icon: QrCode },
  { id: 'reports', label: 'Rapports', Icon: BarChart3 },
  { id: 'wallboard', label: 'Wallboard', Icon: Monitor },
  { id: 'settings', label: 'Paramètres', Icon: Settings },
]

const DEFAULT_SETTINGS: VipSettings = {
  salonName: 'Salon VIP — Lounge Premium',
  capacity: 60,
  openingHours: '05:00 – 23:00',
  salonAddress: '',
  salonLogoUrl: null,
  deniseVoiceEnabled: false,
  deniseMaxVolume: 20,
  deniseTone: 'doux',
  deniseLanguages: ['fr'],
  deniseWelcomeMessage: 'Bienvenue au salon VIP. Notre équipe est à votre service.',
  vipAlertsEnabled: true,
  vipAlertsRecipient: 'Maître d\'Hôtel',
  vipAlertsDelaySec: 0,
  buffetInterval: 30,
  buffetLowThreshold: 30,
  showersCount: 4,
  showerMaxTime: 20,
  showerCleaningTime: 10,
  showerDeepCleanThreshold: 10,
  rewardsBudgetMonthly: 2500,
  rewardsValidation: 'manager',
  notifPushEnabled: true,
  notifEmailEnabled: false,
  notifSmsEnabled: false,
  notifWhatsappEnabled: true,
  notifDndStart: '23:00',
  notifDndEnd: '05:00',
  integrationFlightsApi: true,
  integrationVipImport: false,
}

// ============================================================
// Helpers
// ============================================================

/** Horloge live HH:MM:SS (évite l'hydration mismatch en partant de null).
 *  L'initialisation est différée via setTimeout(0) pour ne pas appeler
 *  setState de manière synchrone dans l'effet (rule set-state-in-effect). */
function useClock(): string {
  const [now, setNow] = useState<Date | null>(null)
  useEffect(() => {
    const init = setTimeout(() => setNow(new Date()), 0)
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => {
      clearTimeout(init)
      clearInterval(t)
    }
  }, [])
  if (!now) return '--:--'
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

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return '—'
  }
}

function formatTimeShort(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return '—'
  }
}

function minutesDepuis(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
}

/** Durée écoulée depuis une date ISO, formatée "1h 23min" ou "12min" ou "—". */
function formatDurationHm(iso: string | null): string {
  if (!iso) return '—'
  const minutes = Math.max(0, minutesDepuis(iso))
  if (minutes < 1) return '0min'
  if (minutes < 60) return `${minutes}min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (m === 0) return `${h}h`
  return `${h}h ${String(m).padStart(2, '0')}min`
}

/** Compte à rebours MM:SS jusqu'à nextCheck (iso). Retourne "--:--" si dépassé. */
function countdownMmSs(nextIso: string): string {
  const remaining = Math.floor((new Date(nextIso).getTime() - Date.now()) / 1000)
  if (remaining <= 0) return '00:00'
  const m = Math.floor(remaining / 60)
  const s = remaining % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('')
}

/** Flag VIP déterministe (dérivé d'un hash de l'id) — 1/3 des incidents sont "VIP". */
function hashIsVip(id: string): boolean {
  let h = 0
  for (let i = 0; i < id.length; i++) {
    h = (h * 31 + id.charCodeAt(i)) >>> 0
  }
  return h % 3 === 0
}

function qrImageUrl(dataUrl: string): string {
  return `${QR_SERVER}${encodeURIComponent(dataUrl)}`
}

/**
 * URL absolue pour un QR code de zone aéroport.
 * Toujours préfixée par le domaine — jamais d'URL relative.
 */
function qrUrlForZone(zoneCode: string, tag: string): string {
  return `${appUrl()}/?airport=${tag}`
}

/**
 * URL absolue pour un QR code staff.
 * Toujours préfixée par le domaine — jamais d'URL relative.
 */
function qrUrlForStaff(staffId: string): string {
  return `${appUrl()}/?staff=${staffId}`
}

// ============================================================
// Composants UI génériques luxe
// ============================================================

/** Titre de section avec filet doré. */
function SectionTitle({
  title,
  subtitle,
  Icon,
  action,
}: {
  title: string
  subtitle?: string
  Icon?: typeof LayoutDashboard
  action?: React.ReactNode
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="flex items-center gap-3">
        {Icon && (
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#C9A961]/12 text-[#8B6F47]">
            <Icon className="h-5 w-5" aria-hidden />
          </span>
        )}
        <div>
          <h2
            className="text-2xl font-semibold text-[#2C2C2C]"
            style={{ fontFamily: 'Georgia, "Playfair Display", serif' }}
          >
            {title}
          </h2>
          {subtitle && <p className="text-sm text-[#8B6F47]">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  )
}

/** Carte KPI luxe — fond blanc, accent doré, valeur grande serif. */
function KPICard({
  label,
  value,
  unit,
  Icon,
  tone = 'gold',
  hint,
}: {
  label: string
  value: string | number
  unit?: string
  Icon: typeof LayoutDashboard
  tone?: 'gold' | 'bronze' | 'sage' | 'terracotta' | 'amethyst'
  hint?: string
}) {
  const toneStyles: Record<typeof tone, { iconBg: string; iconText: string; accent: string }> = {
    gold: { iconBg: 'bg-[#C9A961]/15', iconText: 'text-[#C9A961]', accent: 'text-[#8B6F47]' },
    bronze: { iconBg: 'bg-[#8B6F47]/15', iconText: 'text-[#8B6F47]', accent: 'text-[#8B6F47]' },
    sage: { iconBg: 'bg-[#4A7C59]/15', iconText: 'text-[#4A7C59]', accent: 'text-[#4A7C59]' },
    terracotta: { iconBg: 'bg-[#C97B63]/15', iconText: 'text-[#C97B63]', accent: 'text-[#C97B63]' },
    amethyst: { iconBg: 'bg-[#6B4C9A]/15', iconText: 'text-[#6B4C9A]', accent: 'text-[#6B4C9A]' },
  }
  const s = toneStyles[tone]
  return (
    <Card className="gap-0 border border-[#EAE5DC] bg-white p-5 shadow-[0_4px_20px_rgba(201,169,97,0.06)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium uppercase tracking-wider text-[#8B6F47]">{label}</p>
          <div className="mt-2 flex items-baseline gap-1">
            <span
              className="text-3xl font-semibold leading-none text-[#2C2C2C]"
              style={{ fontFamily: 'Georgia, "Playfair Display", serif' }}
            >
              {value}
            </span>
            {unit && <span className="text-sm font-medium text-[#8B6F47]">{unit}</span>}
          </div>
          {hint && <p className="mt-2 text-xs text-[#8B6F47]/80">{hint}</p>}
        </div>
        <span className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl', s.iconBg, s.iconText)}>
          <Icon className="h-5 w-5" aria-hidden />
        </span>
      </div>
    </Card>
  )
}

/** Badge VIP amethyst. */
function VipBadge({ className }: { className?: string }) {
  return (
    <Badge
      className={cn(
        'border-[#6B4C9A]/30 bg-[#6B4C9A]/12 text-[#6B4C9A] font-semibold',
        className,
      )}
    >
      <Crown className="h-3 w-3" aria-hidden /> VIP
    </Badge>
  )
}

// ============================================================
// Phase 1 — Sous-composants partagés (Plan du Salon & Vue d'ensemble)
// ============================================================

/** Étoiles de satisfaction (0..5, supporte demi-étoiles visuels). */
function VipStarRating({ value, size = 14 }: { value: number; size?: number }) {
  const v = Math.max(0, Math.min(5, value))
  const full = Math.floor(v)
  const hasHalf = v - full >= 0.5
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${v.toFixed(1)} sur 5`}>
      {Array.from({ length: 5 }).map((_, i) => {
        const isFull = i < full
        const isHalf = i === full && hasHalf
        return (
          <Star
            key={i}
            style={{ width: size, height: size }}
            className={cn(
              isFull
                ? 'fill-[#C9A961] text-[#C9A961]'
                : isHalf
                  ? 'fill-[#C9A961]/50 text-[#C9A961]'
                  : 'fill-transparent text-[#EAE5DC]',
            )}
            aria-hidden
          />
        )
      })}
    </span>
  )
}

/** Carte d'une table pour le plan 2D (vue d'ensemble + plan du salon). */
function TableCard({
  table,
  onClick,
  compact = false,
}: {
  table: VipTableData
  onClick?: () => void
  compact?: boolean
}) {
  const st = TABLE_STATUS_STYLE[table.status] ?? TABLE_STATUS_STYLE.free
  const zone = TABLE_ZONE_META[table.zone] ?? TABLE_ZONE_META.main
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group relative flex w-full flex-col items-start gap-1.5 rounded-2xl border bg-white p-3.5 text-left shadow-[0_4px_20px_rgba(201,169,97,0.06)] transition-all hover:shadow-[0_6px_28px_rgba(201,169,97,0.12)] hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C9A961]/40',
        st.border,
        compact ? 'min-h-[100px]' : 'min-h-[120px]',
      )}
      aria-label={`Table ${table.tableNumber} — ${st.label}`}
    >
      {/* Bandeau de couleur zone (left accent) */}
      <span
        className="absolute inset-y-0 left-0 w-1 rounded-l-2xl"
        style={{ backgroundColor: zone.accent }}
        aria-hidden
      />
      <div className="flex w-full items-start justify-between gap-2 pl-1.5">
        <div className="min-w-0">
          <p className="text-[10px] font-medium uppercase tracking-wider text-[#8B6F47]">
            {zone.emoji} {zone.label.split(' ')[0]}
          </p>
          <p
            className="mt-0.5 text-xl font-semibold leading-none text-[#2C2C2C]"
            style={{ fontFamily: 'Georgia, "Playfair Display", serif' }}
          >
            {table.tableNumber}
          </p>
        </div>
        <span className={cn('flex h-7 w-7 items-center justify-center rounded-full', st.bg)}>
          <span className={cn('h-2.5 w-2.5 rounded-full', st.dot)} />
        </span>
      </div>

      {/* Client + demandes */}
      <div className="mt-1 w-full pl-1.5">
        {table.clientName ? (
          <p className="truncate text-sm font-medium text-[#2C2C2C]">{table.clientName}</p>
        ) : (
          <p className="truncate text-sm text-[#8B6F47]/70">—</p>
        )}
        <div className="mt-1 flex items-center gap-2 text-[11px] text-[#8B6F47]">
          <span className="inline-flex items-center gap-1">
            <Armchair className="h-3 w-3" aria-hidden /> {table.seats}
          </span>
          {table.activeRequests > 0 && (
            <span className={cn('inline-flex items-center gap-1 font-medium', st.text)}>
              <Bell className="h-3 w-3" aria-hidden /> {table.activeRequests}
            </span>
          )}
          {table.clientVipLevel && (
            <Badge
              variant="outline"
              className={cn(
                'h-4 px-1.5 text-[10px] font-semibold capitalize',
                table.clientVipLevel === 'diamond'
                  ? 'border-[#4A7C59]/30 bg-[#4A7C59]/10 text-[#4A7C59]'
                  : table.clientVipLevel === 'platinum'
                    ? 'border-[#6B4C9A]/30 bg-[#6B4C9A]/10 text-[#6B4C9A]'
                    : 'border-[#C9A961]/30 bg-[#C9A961]/12 text-[#8B6F47]',
              )}
            >
              {table.clientVipLevel}
            </Badge>
          )}
        </div>
      </div>
    </button>
  )
}

/** Panneau de détail d'une table (Sheet latéral). Boutons d'action staff. */
function TableDetailSheet({
  table,
  open,
  onOpenChange,
  onPatchTable,
}: {
  table: VipTableData | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onPatchTable: (
    id: string,
    patch: {
      status?: VipTableStatus
      clientName?: string | null
      clientVipLevel?: string | null
    },
  ) => Promise<void>
}) {
  const { toast } = useToast()
  const [assignDialogOpen, setAssignDialogOpen] = useState(false)
  const [assignName, setAssignName] = useState('')
  const [assignLevel, setAssignLevel] = useState<string>('gold')
  const [busy, setBusy] = useState(false)

  // Reset du formulaire d'assignation quand on ouvre le dialog
  useEffect(() => {
    if (assignDialogOpen && table) {
      setAssignName(table.clientName ?? '')
      setAssignLevel(table.clientVipLevel ?? 'gold')
    }
  }, [assignDialogOpen, table])

  if (!table) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full sm:max-w-md border-0 p-0" aria-describedby={undefined}>
          <SheetTitle className="sr-only">Détail de la table</SheetTitle>
          <div className="p-6 text-sm text-[#8B6F47]">Aucune table sélectionnée.</div>
        </SheetContent>
      </Sheet>
    )
  }

  const st = TABLE_STATUS_STYLE[table.status]
  const zone = TABLE_ZONE_META[table.zone] ?? TABLE_ZONE_META.main

  const act = async (
    label: string,
    patch: { status?: VipTableStatus; clientName?: string | null; clientVipLevel?: string | null },
    okMsg: string,
  ) => {
    setBusy(true)
    try {
      await onPatchTable(table.id, patch)
      toast({ title: label, description: okMsg })
    } catch {
      toast({ title: 'Erreur', description: 'Mise à jour impossible.', variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }

  const submitAssign = async () => {
    const name = assignName.trim()
    if (!name) {
      toast({ title: 'Nom requis', description: 'Saisissez le nom du client.', variant: 'destructive' })
      return
    }
    setBusy(true)
    try {
      await onPatchTable(table.id, {
        status: 'occupied',
        clientName: name,
        clientVipLevel: assignLevel,
      })
      toast({
        title: 'Client assigné',
        description: `${name} est à la table ${table.tableNumber}.`,
      })
      setAssignDialogOpen(false)
    } catch {
      toast({ title: 'Erreur', description: 'Assignation impossible.', variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto border-0 p-0 sm:max-w-md" aria-describedby={undefined}>
        <SheetTitle className="sr-only">Détail de la table {table.tableNumber}</SheetTitle>
        {/* En-tête coloré */}
        <div
          className="relative px-6 pb-5 pt-6"
          style={{ background: `linear-gradient(135deg, ${zone.accent}18, ${zone.accent}06)` }}
        >
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-white/80 text-[#8B6F47] hover:bg-white"
            aria-label="Fermer"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
          <div className="flex items-center gap-2">
            <span
              className="flex h-10 w-10 items-center justify-center rounded-xl text-white"
              style={{ backgroundColor: zone.accent }}
            >
              <LayoutGrid className="h-5 w-5" aria-hidden />
            </span>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wider text-[#8B6F47]">
                {zone.emoji} {zone.label}
              </p>
              <p
                className="text-2xl font-semibold text-[#2C2C2C]"
                style={{ fontFamily: 'Georgia, "Playfair Display", serif' }}
              >
                Table {table.tableNumber}
              </p>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <Badge variant="outline" className={cn('border font-semibold', st.bg, st.text, st.border)}>
              <span className={cn('mr-1 h-1.5 w-1.5 rounded-full', st.dot)} /> {st.label}
            </Badge>
            <Badge variant="outline" className="border-[#EAE5DC] bg-[#FAFAF7] text-[#8B6F47]">
              <Armchair className="mr-1 h-3 w-3" aria-hidden /> {table.seats} places
            </Badge>
          </div>
        </div>

        <div className="space-y-5 px-6 py-5">
          {/* Client + durée */}
          <section>
            <h3 className="text-xs font-medium uppercase tracking-wider text-[#8B6F47]">Client</h3>
            {table.clientName ? (
              <div className="mt-2 rounded-2xl border border-[#EAE5DC] bg-[#FAFAF7] p-4">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-[#C9A961] to-[#8B6F47] text-xs font-semibold text-white">
                    {initials(table.clientName) || '?'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-[#2C2C2C]">{table.clientName}</p>
                    {table.clientVipLevel && (
                      <Badge
                        variant="outline"
                        className={cn(
                          'mt-0.5 h-4 px-1.5 text-[10px] font-semibold capitalize',
                          table.clientVipLevel === 'diamond'
                            ? 'border-[#4A7C59]/30 bg-[#4A7C59]/10 text-[#4A7C59]'
                            : table.clientVipLevel === 'platinum'
                              ? 'border-[#6B4C9A]/30 bg-[#6B4C9A]/10 text-[#6B4C9A]'
                              : 'border-[#C9A961]/30 bg-[#C9A961]/12 text-[#8B6F47]',
                        )}
                      >
                        {table.clientVipLevel}
                      </Badge>
                    )}
                  </div>
                </div>
                {table.arrivedAt && (
                  <div className="mt-3 flex items-center gap-2 text-xs text-[#8B6F47]">
                    <Clock className="h-3.5 w-3.5" aria-hidden />
                    <span>Arrivée : <span className="font-semibold text-[#2C2C2C]">{formatTimeShort(table.arrivedAt)}</span></span>
                    <span className="text-[#8B6F47]/60">·</span>
                    <span>Durée : <span className="font-semibold text-[#2C2C2C]">{formatDurationHm(table.arrivedAt)}</span></span>
                  </div>
                )}
              </div>
            ) : (
              <div className="mt-2 rounded-2xl border border-dashed border-[#EAE5DC] bg-[#FAFAF7] p-4 text-center">
                <Users className="mx-auto h-6 w-6 text-[#8B6F47]/50" aria-hidden />
                <p className="mt-1.5 text-sm text-[#8B6F47]">Aucun client assigné</p>
              </div>
            )}
          </section>

          {/* Demandes actives */}
          <section>
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-medium uppercase tracking-wider text-[#8B6F47]">Demandes à la table</h3>
              {table.activeRequests > 0 && (
                <Badge variant="outline" className="border-[#C9A961]/30 bg-[#C9A961]/12 text-[#8B6F47]">
                  {table.activeRequests} active{table.activeRequests > 1 ? 's' : ''}
                </Badge>
              )}
            </div>
            {table.requests.length === 0 ? (
              <div className="mt-2 rounded-2xl border border-dashed border-[#EAE5DC] bg-[#FAFAF7] p-4 text-center">
                <CheckCircle2 className="mx-auto h-6 w-6 text-[#4A7C59]" aria-hidden />
                <p className="mt-1.5 text-sm text-[#8B6F47]">Aucune demande en cours</p>
              </div>
            ) : (
              <ul className="mt-2 max-h-56 space-y-2 overflow-y-auto pr-1">
                {table.requests.map((r) => {
                  const meta = REQUEST_TYPE_META[r.type] ?? {
                    label: r.type,
                    Icon: ConciergeBell,
                  }
                  const statusMeta = REQUEST_STATUS_META[r.status] ?? REQUEST_STATUS_META.pending
                  const RIcon = meta.Icon
                  return (
                    <li key={r.id} className="rounded-xl border border-[#EAE5DC] bg-white p-3">
                      <div className="flex items-start gap-2.5">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#C9A961]/10 text-[#8B6F47]">
                          <RIcon className="h-4 w-4" aria-hidden />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <p className="truncate text-sm font-medium text-[#2C2C2C]">{meta.label}</p>
                            <Badge variant="outline" className={cn('h-5 px-1.5 text-[10px] font-medium', statusMeta.style)}>
                              {statusMeta.label}
                            </Badge>
                          </div>
                          {r.message && (
                            <p className="mt-0.5 truncate text-xs text-[#8B6F47]">« {r.message} »</p>
                          )}
                          <p className="mt-1 text-[11px] text-[#8B6F47]/80">
                            {formatTimeShort(r.createdAt)} · il y a {minutesDepuis(r.createdAt)} min
                          </p>
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>

          {/* QR code */}
          <section>
            <h3 className="text-xs font-medium uppercase tracking-wider text-[#8B6F47]">QR Code de la table</h3>
            <div className="mt-2 flex items-center gap-4 rounded-2xl border border-[#EAE5DC] bg-[#FAFAF7] p-4">
              <img
                src={qrImageUrl(`${appUrl()}/?vipTable=${table.qrToken}`)}
                alt={`QR code table ${table.tableNumber}`}
                width={96}
                height={96}
                className="h-24 w-24 rounded-lg bg-white"
              />
              <div className="min-w-0">
                <p className="text-xs text-[#8B6F47]">Token</p>
                <p className="truncate font-mono text-xs text-[#2C2C2C]">{table.qrToken}</p>
                <p className="mt-2 text-[11px] text-[#8B6F47]/80">
                  Le client scanne ce QR pour appeler le service depuis sa table.
                </p>
              </div>
            </div>
          </section>

          {/* Actions staff */}
          <section className="space-y-2 border-t border-[#EAE5DC] pt-4">
            <h3 className="text-xs font-medium uppercase tracking-wider text-[#8B6F47]">Actions staff</h3>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={busy || table.status === 'free'}
                onClick={() => act('Table libérée', { status: 'free', clientName: null, clientVipLevel: null }, `Table ${table.tableNumber} prête pour le prochain client.`)}
                className="border-[#4A7C59]/40 bg-[#4A7C59]/8 text-[#4A7C59] hover:bg-[#4A7C59]/15"
              >
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> Libérer
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => act('Problème signalé', { status: table.status === 'problem' ? 'occupied' : 'problem' }, `Table ${table.tableNumber} ${table.status === 'problem' ? 'rétablie' : 'marquée problème'}.`)}
                className={cn(
                  'border-[#C97B63]/40 text-[#C97B63] hover:bg-[#C97B63]/15',
                  table.status === 'problem' ? 'bg-[#C97B63]/12' : 'bg-[#C97B63]/8',
                )}
              >
                <AlertTriangle className="h-3.5 w-3.5" aria-hidden /> {table.status === 'problem' ? 'Rétablir' : 'Marquer problème'}
              </Button>
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => setAssignDialogOpen(true)}
              className="w-full border-[#C9A961]/40 bg-[#C9A961]/8 text-[#8B6F47] hover:bg-[#C9A961]/15"
            >
              <UserPlus className="h-3.5 w-3.5" aria-hidden /> Assigner client
            </Button>
          </section>
        </div>
      </SheetContent>

      {/* Dialog assignation client */}
      <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Assigner un client — Table {table.tableNumber}</DialogTitle>
            <DialogDescription>
              Saisissez le nom du client et son niveau VIP. La table passera en statut « Occupée ».
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="client-name" className="text-xs font-medium uppercase tracking-wider text-[#8B6F47]">
                Nom du client
              </Label>
              <Input
                id="client-name"
                value={assignName}
                onChange={(e) => setAssignName(e.target.value)}
                placeholder="ex. Alexandre Laurent"
                className="border-[#EAE5DC] bg-[#FAFAF7]"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="client-level" className="text-xs font-medium uppercase tracking-wider text-[#8B6F47]">
                Niveau VIP
              </Label>
              <Select value={assignLevel} onValueChange={setAssignLevel}>
                <SelectTrigger id="client-level" className="border-[#EAE5DC] bg-[#FAFAF7]">
                  <SelectValue placeholder="Sélectionner un niveau" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="gold">Gold</SelectItem>
                  <SelectItem value="platinum">Platinum</SelectItem>
                  <SelectItem value="diamond">Diamond</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAssignDialogOpen(false)} disabled={busy}>
              Annuler
            </Button>
            <Button
              onClick={submitAssign}
              disabled={busy || !assignName.trim()}
              className="bg-[#C9A961] text-white hover:bg-[#C9A961]/90"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <UserPlus className="h-4 w-4" aria-hidden />}
              Assigner
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Sheet>
  )
}

// ============================================================
// Sidebar — desktop fixe + drawer mobile (même contenu)
// ============================================================

function VIPSidebarContent({
  activeTab,
  onNavigate,
  salonName,
  userEmail,
  userRole,
  onLogout,
  modulesEnabled,
}: {
  activeTab: VipTab
  onNavigate: (t: VipTab) => void
  salonName: string
  userEmail: string
  userRole: string
  onLogout: () => void
  modulesEnabled?: Partial<VipLoungeConfig['modulesEnabled']> | null
}) {
  // Modules optionnels désactivés → onglets masqués (Paramètres → Modules optionnels)
  const TAB_MODULE_KEY: Partial<Record<VipTab, keyof VipLoungeConfig['modulesEnabled']>> = {
    showers: 'smartShower',
    rewards: 'flashRewards',
  }
  const navFiltre = modulesEnabled
    ? NAV_ITEMS.filter((n) => {
        const key = TAB_MODULE_KEY[n.id]
        return !key || modulesEnabled[key] !== false
      })
    : NAV_ITEMS
  const roleLabel =
    userRole === 'SUPERADMIN'
      ? 'Super Admin'
      : userRole === 'PRO'
        ? 'Manager Salon'
        : userRole || 'Opérateur'

  return (
    <div className="flex h-full flex-col bg-white">
      {/* En-tête : salon + mode discrétion */}
      <div className="shrink-0 border-b border-[#EAE5DC] px-5 py-5">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-[#C9A961] to-[#8B6F47] text-white shadow-[0_4px_14px_rgba(201,169,97,0.25)]">
            <Wine className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <h1
              className="truncate text-base font-semibold text-[#2C2C2C]"
              style={{ fontFamily: 'Georgia, "Playfair Display", serif' }}
            >
              {salonName}
            </h1>
            <div className="mt-1 flex items-center gap-1.5">
              <span className="inline-flex h-1.5 w-1.5 rounded-full bg-[#4A7C59]" />
              <span className="text-[11px] font-medium uppercase tracking-wider text-[#8B6F47]">
                Mode Discrétion · Actif
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation — scrollable */}
      <nav
        aria-label="Navigation VIP"
        className="vip-sidebar-nav flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-3 py-4"
      >
        {navFiltre.map((item) => {
          const Icon = item.Icon
          const actif = activeTab === item.id
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigate(item.id)}
              aria-current={actif ? 'page' : undefined}
              className={cn(
                'flex h-11 shrink-0 items-center gap-3 rounded-xl px-3.5 text-sm font-medium transition-all',
                actif
                  ? 'bg-[#C9A961]/12 text-[#8B6F47] shadow-[inset_0_0_0_1px_rgba(201,169,97,0.25)]'
                  : 'text-[#2C2C2C]/70 hover:bg-[#FAFAF7] hover:text-[#2C2C2C]',
              )}
            >
              <Icon
                className={cn('h-[18px] w-[18px] shrink-0', actif ? 'text-[#C9A961]' : 'text-[#8B6F47]/70')}
                aria-hidden
              />
              <span className="truncate">{item.label}</span>
              {actif && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-[#C9A961]" />}
            </button>
          )
        })}
      </nav>

      {/* Bas : utilisateur + déconnexion */}
      <div className="shrink-0 border-t border-[#EAE5DC] p-3">
        <div className="rounded-xl bg-[#FAFAF7] px-3.5 py-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-[#C9A961] to-[#8B6F47] text-xs font-semibold text-white">
              {initials(userEmail) || '—'}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-[#2C2C2C]">{userEmail || 'Invité'}</p>
              <p className="truncate text-[11px] uppercase tracking-wider text-[#8B6F47]">{roleLabel}</p>
            </div>
          </div>
        </div>
        <Button
          variant="ghost"
          className="mt-2 w-full justify-start gap-2.5 rounded-xl text-[#2C2C2C]/80 hover:bg-[#FAFAF7] hover:text-[#C97B63]"
          onClick={onLogout}
        >
          <LogOut className="h-4 w-4" aria-hidden />
          Déconnexion
        </Button>
      </div>
    </div>
  )
}

// ============================================================
// Tab A — Vue d'ensemble
// ============================================================

function OverviewTab({
  incidents,
  showers,
  buffet,
  tables,
  clientsCount,
  rewardsGivenToday,
  loading,
  onPatchTable,
}: {
  incidents: VipIncident[]
  showers: Shower[]
  buffet: BuffetItem[]
  tables: VipTableData[]
  clientsCount: number
  rewardsGivenToday: number
  loading: boolean
  onPatchTable: (
    id: string,
    patch: {
      status?: VipTableStatus
      clientName?: string | null
      clientVipLevel?: string | null
    },
  ) => Promise<void>
}) {
  const clock = useClock()
  const [today, setToday] = useState<Date | null>(null)
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null)
  useEffect(() => {
    setToday(new Date())
  }, [])

  const openIncidents = incidents.filter((i) => i.statut !== 'RESOLU')
  const freeShowers = showers.filter((s) => s.status === 'free').length
  const avgBuffet =
    buffet.length > 0
      ? Math.round(buffet.reduce((sum, b) => sum + b.fillLevel, 0) / buffet.length)
      : 0

  // ---- KPI Phase 1 ----
  // Capacité : clients présents / capacité salon (25). Le % d'occupation.
  const CAPACITE_SALON = 25
  const capacitePct = Math.min(100, Math.round((clientsCount / CAPACITE_SALON) * 100))

  // Séjour moyen : moyenne des durées des tables occupées
  const occupiedTables = tables.filter((t) => t.status === 'occupied' && t.arrivedAt)
  const avgStayMin =
    occupiedTables.length > 0
      ? Math.round(
          occupiedTables.reduce((sum, t) => sum + minutesDepuis(t.arrivedAt!), 0) /
            occupiedTables.length,
        )
      : 83 // fallback mock "1h 23min"
  const avgStayH = Math.floor(avgStayMin / 60)
  const avgStayM = avgStayMin % 60
  const avgStayLabel =
    avgStayH > 0 ? `${avgStayH}h ${String(avgStayM).padStart(2, '0')}min` : `${avgStayM}min`

  // Signalements actifs : incidents ouverts + demandes pending/in_progress
  const activeTableRequests = tables.reduce((s, t) => s + t.activeRequests, 0)
  const totalSignalementsActifs = openIncidents.length + activeTableRequests

  // Satisfaction : mock 4.8/5 (depuis derniers retours clients)
  const satisfaction = 4.8

  // Alertes douces (visuelles uniquement)
  const buffetAlerts = buffet.filter((b) => new Date(b.nextCheck).getTime() < Date.now())
  const showerCleaning = showers.filter((s) => s.status === 'cleaning')
  const vipIncidents = incidents.filter((i) => hashIsVip(i.id) && i.statut !== 'RESOLU')
  const lowBuffetItems = buffet.filter((b) => b.fillLevel < 30)

  type AlertTone = 'terracotta' | 'bronze' | 'amethyst' | 'gold'
  const alerts: Array<{ id: string; Icon: typeof AlertTriangle; tone: AlertTone; label: string; detail: string }> = []
  for (const b of buffetAlerts) {
    alerts.push({
      id: `buffet-${b.id}`,
      Icon: Clock,
      tone: 'terracotta',
      label: 'Vérification buffet requise',
      detail: `${BUFFET_ITEM_LABELS[b.item] ?? b.item} — dernière vérification il y a ${minutesDepuis(b.lastCheck)} min`,
    })
  }
  for (const b of lowBuffetItems) {
    alerts.push({
      id: `low-${b.id}`,
      Icon: AlertTriangle,
      tone: 'terracotta',
      label: 'Niveau buffet bas',
      detail: `${BUFFET_ITEM_LABELS[b.item] ?? b.item} — ${b.fillLevel}% restant`,
    })
  }
  for (const s of showerCleaning) {
    alerts.push({
      id: `shower-${s.id}`,
      Icon: ShowerHead,
      tone: 'bronze',
      label: `Douche N°${s.showerNumber} en nettoyage`,
      detail: 'Libérer la cabine dès que possible',
    })
  }
  for (const i of vipIncidents.slice(0, 2)) {
    alerts.push({
      id: `vip-${i.id}`,
      Icon: Crown,
      tone: 'amethyst',
      label: 'Client VIP a signalé un problème',
      detail: `${i.zone?.nom ?? 'Salon'} — ${i.problemType}`,
    })
  }
  // Tables en problème
  for (const t of tables.filter((t) => t.status === 'problem').slice(0, 3)) {
    alerts.push({
      id: `problem-${t.id}`,
      Icon: AlertTriangle,
      tone: 'terracotta',
      label: `Table ${t.tableNumber} en problème`,
      detail: t.clientName ? `Client : ${t.clientName}` : 'Aucun client assigné',
    })
  }
  // Demandes à la table en attente
  if (activeTableRequests > 0) {
    alerts.push({
      id: 'table-requests',
      Icon: ConciergeBell,
      tone: 'gold',
      label: `${activeTableRequests} demande${activeTableRequests > 1 ? 's' : ''} à la table en attente`,
      detail: 'Onglet Signalements pour prendre en charge',
    })
  }

  const selectedTable = selectedTableId
    ? tables.find((t) => t.id === selectedTableId) ?? null
    : null

  // Group tables by zone for the 2D plan
  const tablesByZone = useMemo(() => {
    const groups: Record<string, VipTableData[]> = { main: [], buffet: [], relaxation: [], meeting: [] }
    for (const t of tables) {
      if (!groups[t.zone]) groups[t.zone] = []
      groups[t.zone].push(t)
    }
    return groups
  }, [tables])

  return (
    <div className="space-y-6">
      {/* Bandeau d'accueil */}
      <Card className="overflow-hidden border border-[#EAE5DC] bg-white p-6 shadow-[0_4px_20px_rgba(201,169,97,0.06)]">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-[#8B6F47]">
              {today ? formatDateLong(today) : '—'}
            </p>
            <h2
              className="mt-1 text-3xl font-semibold text-[#2C2C2C]"
              style={{ fontFamily: 'Georgia, "Playfair Display", serif' }}
            >
              Bonjour et bienvenue
            </h2>
            <p className="mt-1 text-sm text-[#8B6F47]">
              Salon en service · {clientsCount} clients présents · satisfaction jour {satisfaction.toFixed(1)}/5
            </p>
          </div>
          <div className="flex items-center gap-3 rounded-2xl bg-[#FAFAF7] px-5 py-3">
            <Clock className="h-5 w-5 text-[#C9A961]" aria-hidden />
            <span
              className="text-2xl font-semibold tabular-nums text-[#2C2C2C]"
              style={{ fontFamily: 'Georgia, "Playfair Display", serif' }}
            >
              {clock}
            </span>
          </div>
        </div>
      </Card>

      {/* KPI row — 6 cartes Phase 1 */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        {loading ? (
          Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-[120px] rounded-2xl" />)
        ) : (
          <>
            <Card className="gap-0 border border-[#EAE5DC] bg-white p-5 shadow-[0_4px_20px_rgba(201,169,97,0.06)]">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium uppercase tracking-wider text-[#8B6F47]">Capacité</p>
                  <div className="mt-2 flex items-baseline gap-1">
                    <span
                      className="text-2xl font-semibold leading-none text-[#2C2C2C]"
                      style={{ fontFamily: 'Georgia, "Playfair Display", serif' }}
                    >
                      {clientsCount}
                    </span>
                    <span className="text-sm font-medium text-[#8B6F47]">/ {CAPACITE_SALON}</span>
                    <span className="ml-1 text-xs text-[#8B6F47]">({capacitePct}%)</span>
                  </div>
                </div>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#6B4C9A]/15 text-[#6B4C9A]">
                  <Users className="h-4 w-4" aria-hidden />
                </span>
              </div>
              <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-[#FAFAF7]">
                <div
                  className="h-full rounded-full bg-[#C9A961]"
                  style={{ width: `${capacitePct}%` }}
                />
              </div>
            </Card>

            <KPICard label="Séjour moyen" value={avgStayLabel} Icon={Timer} tone="bronze" hint={`${occupiedTables.length} table${occupiedTables.length > 1 ? 's' : ''} occupée${occupiedTables.length > 1 ? 's' : ''}`} />
            <Card className="gap-0 border border-[#EAE5DC] bg-white p-5 shadow-[0_4px_20px_rgba(201,169,97,0.06)]">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium uppercase tracking-wider text-[#8B6F47]">Satisfaction</p>
                  <div className="mt-2 flex items-baseline gap-1">
                    <span
                      className="text-2xl font-semibold leading-none text-[#2C2C2C]"
                      style={{ fontFamily: 'Georgia, "Playfair Display", serif' }}
                    >
                      {satisfaction.toFixed(1)}
                    </span>
                    <span className="text-sm font-medium text-[#8B6F47]">/5</span>
                  </div>
                  <div className="mt-1.5">
                    <VipStarRating value={satisfaction} size={12} />
                  </div>
                </div>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#4A7C59]/15 text-[#4A7C59]">
                  <Star className="h-4 w-4" aria-hidden />
                </span>
              </div>
            </Card>
            <KPICard label="Signalements actifs" value={totalSignalementsActifs} Icon={Bell} tone="terracotta" hint={`${openIncidents.length} incidents · ${activeTableRequests} à la table`} />
            <KPICard label="Récompenses offertes" value={rewardsGivenToday} Icon={Gift} tone="gold" hint="Aujourd'hui" />
            <KPICard label="Douches libres" value={`${freeShowers}/${showers.length || 0}`} Icon={ShowerHead} tone="sage" hint="Cabines disponibles" />
          </>
        )}
      </div>

      {/* Plan Interactif 2D du Salon */}
      <Card className="border border-[#EAE5DC] bg-white p-6 shadow-[0_4px_20px_rgba(201,169,97,0.06)]">
        <CardHeader className="px-0">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-lg text-[#2C2C2C]" style={{ fontFamily: 'Georgia, "Playfair Display", serif' }}>
                Plan Interactif 2D du Salon
              </CardTitle>
              <CardDescription className="text-[#8B6F47]">
                {tables.length} tables · cliquez sur une table pour le détail et les actions staff.
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {(['free', 'occupied', 'problem', 'reserved'] as VipTableStatus[]).map((s) => {
                const st = TABLE_STATUS_STYLE[s]
                const count = tables.filter((t) => t.status === s).length
                return (
                  <div key={s} className="flex items-center gap-1.5 rounded-lg bg-[#FAFAF7] px-2.5 py-1.5">
                    <span className={cn('h-2 w-2 rounded-full', st.dot)} />
                    <span className="text-[11px] font-medium text-[#8B6F47]">{st.label}</span>
                    <span className="text-xs font-semibold text-[#2C2C2C]">{count}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-0">
          {loading ? (
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
              {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-[120px] rounded-2xl" />)}
            </div>
          ) : tables.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 rounded-2xl bg-[#FAFAF7] py-10 text-center">
              <LayoutGrid className="h-8 w-8 text-[#8B6F47]/50" aria-hidden />
              <p className="text-sm font-medium text-[#2C2C2C]">Aucune table</p>
              <p className="text-xs text-[#8B6F47]">Les tables apparaîtront ici une fois la base initialisée.</p>
            </div>
          ) : (
            <div className="space-y-5">
              {Object.entries(tablesByZone).map(([zoneKey, zoneTables]) => {
                if (zoneTables.length === 0) return null
                const zone = TABLE_ZONE_META[zoneKey] ?? TABLE_ZONE_META.main
                return (
                  <div key={zoneKey}>
                    <div className="mb-2 flex items-center gap-2">
                      <MapPin className="h-3.5 w-3.5" style={{ color: zone.accent }} aria-hidden />
                      <h3
                        className="text-sm font-semibold text-[#2C2C2C]"
                        style={{ fontFamily: 'Georgia, "Playfair Display", serif' }}
                      >
                        {zone.emoji} {zone.label}
                      </h3>
                      <span className="text-[11px] text-[#8B6F47]">· {zoneTables.length} tables</span>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
                      {zoneTables.map((t) => (
                        <TableCard
                          key={t.id}
                          table={t}
                          compact
                          onClick={() => setSelectedTableId(t.id)}
                        />
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Alertes douces */}
      <Card className="border border-[#EAE5DC] bg-white p-6 shadow-[0_4px_20px_rgba(201,169,97,0.06)]">
        <CardHeader className="px-0">
          <CardTitle className="text-lg text-[#2C2C2C]" style={{ fontFamily: 'Georgia, "Playfair Display", serif' }}>
            Alertes Douces
          </CardTitle>
          <CardDescription className="text-[#8B6F47]">
            Notifications visuelles uniquement — mode discrétion actif, aucun son.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          {alerts.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 rounded-2xl bg-[#FAFAF7] py-10 text-center">
              <CheckCircle2 className="h-8 w-8 text-[#4A7C59]" aria-hidden />
              <p className="text-sm font-medium text-[#2C2C2C]">Aucune alerte en cours</p>
              <p className="text-xs text-[#8B6F47]">Tout est sous contrôle. Belle journée.</p>
            </div>
          ) : (
            <ul className="space-y-2.5">
              {alerts.map((a) => {
                const toneMap: Record<AlertTone, string> = {
                  terracotta: 'bg-[#C97B63]/8 border-[#C97B63]/25 text-[#C97B63]',
                  bronze: 'bg-[#8B6F47]/8 border-[#8B6F47]/25 text-[#8B6F47]',
                  amethyst: 'bg-[#6B4C9A]/8 border-[#6B4C9A]/25 text-[#6B4C9A]',
                  gold: 'bg-[#C9A961]/10 border-[#C9A961]/30 text-[#8B6F47]',
                }
                return (
                  <li
                    key={a.id}
                    className={cn('flex items-start gap-3 rounded-xl border px-4 py-3', toneMap[a.tone])}
                  >
                    <a.Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-[#2C2C2C]">{a.label}</p>
                      <p className="text-xs text-[#2C2C2C]/70">{a.detail}</p>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <TableDetailSheet
        table={selectedTable}
        open={selectedTable !== null}
        onOpenChange={(o) => {
          if (!o) setSelectedTableId(null)
        }}
        onPatchTable={onPatchTable}
      />
    </div>
  )
}

// ============================================================
// Tab B-bis — Plan du Salon (vue plein écran)
// ============================================================

function FloorPlanTab({
  tables,
  loading,
  onPatchTable,
  onRefresh,
}: {
  tables: VipTableData[]
  loading: boolean
  onPatchTable: (
    id: string,
    patch: {
      status?: VipTableStatus
      clientName?: string | null
      clientVipLevel?: string | null
    },
  ) => Promise<void>
  onRefresh?: () => void
}) {
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null)
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [newTableNumber, setNewTableNumber] = useState('')
  const [newZone, setNewZone] = useState('main')
  const [newSeats, setNewSeats] = useState(4)
  const [adding, setAdding] = useState(false)

  const filtered = useMemo(() => {
    if (filterStatus === 'all') return tables
    return tables.filter((t) => t.status === filterStatus)
  }, [tables, filterStatus])

  const grouped = useMemo(() => {
    const groups: Record<string, VipTableData[]> = { main: [], buffet: [], relaxation: [], meeting: [] }
    for (const t of filtered) {
      if (!groups[t.zone]) groups[t.zone] = []
      groups[t.zone].push(t)
    }
    return groups
  }, [filtered])

  const selectedTable = selectedTableId ? tables.find((t) => t.id === selectedTableId) ?? null : null

  async function ajouterTable() {
    setAdding(true)
    try {
      await fetch('/api/vip/tables', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tableNumber: newTableNumber || `T-${String(tables.length + 1).padStart(2, '0')}`,
          zone: newZone,
          seats: newSeats,
        }),
      })
      setShowAddDialog(false)
      setNewTableNumber('')
      setNewZone('main')
      setNewSeats(4)
      onRefresh?.()
    } catch {
      /* ignore */
    }
    setAdding(false)
  }

  return (
    <div className="space-y-5">
      <SectionTitle
        title="Plan du Salon"
        subtitle="Vue interactive du salon — tables organisées par zone"
        Icon={Map}
        action={
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              className="gap-1.5 bg-[#C9A961] text-white hover:bg-[#B8975A]"
              onClick={() => setShowAddDialog(true)}
            >
              <Plus className="h-4 w-4" />
              Ajouter une table
            </Button>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[150px] border-[#EAE5DC] bg-white text-sm">
                <SelectValue placeholder="Filtrer" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes les tables</SelectItem>
                <SelectItem value="free">Libres</SelectItem>
                <SelectItem value="occupied">Occupées</SelectItem>
                <SelectItem value="problem">Problème</SelectItem>
                <SelectItem value="reserved">Réservées</SelectItem>
              </SelectContent>
            </Select>
          </div>
        }
      />

      {/* Légende */}
      <Card className="border border-[#EAE5DC] bg-white p-4 shadow-[0_4px_20px_rgba(201,169,97,0.06)]">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs font-medium uppercase tracking-wider text-[#8B6F47]">Légende</span>
          {(['free', 'occupied', 'problem', 'reserved'] as VipTableStatus[]).map((s) => {
            const st = TABLE_STATUS_STYLE[s]
            return (
              <div key={s} className="flex items-center gap-1.5">
                <span className={cn('h-2.5 w-2.5 rounded-full', st.dot)} />
                <span className="text-xs text-[#8B6F47]">{st.label}</span>
              </div>
            )
          })}
          <span className="mx-1 h-4 w-px bg-[#EAE5DC]" />
          {Object.entries(TABLE_ZONE_META).map(([k, z]) => (
            <div key={k} className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: z.accent }} />
              <span className="text-xs text-[#8B6F47]">{z.label}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* Zones */}
      {loading ? (
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {Array.from({ length: 12 }).map((_, i) => <Skeleton key={i} className="h-[130px] rounded-2xl" />)}
        </div>
      ) : tables.length === 0 ? (
        <Card className="border border-[#EAE5DC] bg-white p-10 text-center shadow-[0_4px_20px_rgba(201,169,97,0.06)]">
          <LayoutGrid className="mx-auto h-10 w-10 text-[#8B6F47]/40" aria-hidden />
          <p className="mt-3 text-sm font-medium text-[#2C2C2C]">Aucune table en base</p>
          <p className="mt-1 text-xs text-[#8B6F47]">La base de tables s'initialise automatiquement au premier appel API.</p>
        </Card>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([zoneKey, zoneTables]) => {
            if (zoneTables.length === 0) return null
            const zone = TABLE_ZONE_META[zoneKey] ?? TABLE_ZONE_META.main
            return (
              <Card
                key={zoneKey}
                className="overflow-hidden border border-[#EAE5DC] bg-white shadow-[0_4px_20px_rgba(201,169,97,0.06)]"
              >
                <div
                  className="flex items-center justify-between px-5 py-3"
                  style={{ background: `linear-gradient(135deg, ${zone.accent}18, ${zone.accent}06)` }}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-white"
                      style={{ backgroundColor: zone.accent }}
                    >
                      <MapPin className="h-4 w-4" aria-hidden />
                    </span>
                    <div>
                      <h3
                        className="text-base font-semibold text-[#2C2C2C]"
                        style={{ fontFamily: 'Georgia, "Playfair Display", serif' }}
                      >
                        {zone.emoji} {zone.label}
                      </h3>
                      <p className="text-[11px] text-[#8B6F47]">
                        {zoneTables.length} table{zoneTables.length > 1 ? 's' : ''} · {zoneTables.filter((t) => t.status === 'occupied').length} occupée{zoneTables.filter((t) => t.status === 'occupied').length > 1 ? 's' : ''}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="grid gap-3 p-5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
                  {zoneTables.map((t) => (
                    <TableCard
                      key={t.id}
                      table={t}
                      onClick={() => setSelectedTableId(t.id)}
                    />
                  ))}
                </div>
              </Card>
            )
          })}
        </div>
      )}

      <TableDetailSheet
        table={selectedTable}
        open={selectedTable !== null}
        onOpenChange={(o) => {
          if (!o) setSelectedTableId(null)
        }}
        onPatchTable={onPatchTable}
      />

      {/* Dialog Ajouter une table */}
      {showAddDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowAddDialog(false)}>
          <Card className="w-full max-w-md border border-[#EAE5DC] bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-4 font-serif text-xl font-bold text-[#2C2C2C]">Ajouter une table</h3>
            <div className="space-y-4">
              <div>
                <Label className="text-sm font-medium text-[#8B6F47]">Numéro de table</Label>
                <Input placeholder={`T-${String(tables.length + 1).padStart(2, '0')}`} value={newTableNumber} onChange={(e) => setNewTableNumber(e.target.value)} className="mt-1 border-[#EAE5DC] bg-white" />
              </div>
              <div>
                <Label className="text-sm font-medium text-[#8B6F47]">Zone</Label>
                <Select value={newZone} onValueChange={setNewZone}>
                  <SelectTrigger className="mt-1 border-[#EAE5DC] bg-white"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="main">Main</SelectItem>
                    <SelectItem value="buffet">Buffet</SelectItem>
                    <SelectItem value="relaxation">Relaxation</SelectItem>
                    <SelectItem value="meeting">Meeting</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-sm font-medium text-[#8B6F47]">Places</Label>
                <Input type="number" min={1} max={12} value={newSeats} onChange={(e) => setNewSeats(parseInt(e.target.value) || 4)} className="mt-1 border-[#EAE5DC] bg-white" />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={() => setShowAddDialog(false)}>Annuler</Button>
                <Button size="sm" className="bg-[#C9A961] text-white hover:bg-[#B8975A]" disabled={adding} onClick={ajouterTable}>
                  {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Créer la table
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}

// ============================================================
// Tab B — Signalements
// ============================================================

function IncidentsTab({
  incidents,
  loading,
  onPatchStatus,
  tableRequests,
  requestsLoading,
  onPatchRequest,
}: {
  incidents: VipIncident[]
  loading: boolean
  onPatchStatus: (id: string, statut: VipIncident['statut']) => Promise<void>
  tableRequests: VipRequestWithTable[]
  requestsLoading: boolean
  onPatchRequest: (
    id: string,
    patch: { status?: 'pending' | 'in_progress' | 'done'; staffName?: string | null },
  ) => Promise<void>
}) {
  const { toast } = useToast()
  const [filterZone, setFilterZone] = useState<string>('all')
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [filterVip, setFilterVip] = useState<'all' | 'vip'>('all')
  const [search, setSearch] = useState('')
  // Phase 1 — filtre par type de demande à la table
  const [filterRequestType, setFilterRequestType] = useState<string>('all')

  const filtered = useMemo(() => {
    return incidents.filter((i) => {
      if (filterZone !== 'all' && i.zone?.code !== filterZone) return false
      if (filterStatus !== 'all' && i.statut !== filterStatus) return false
      if (filterVip === 'vip' && !hashIsVip(i.id)) return false
      if (search.trim()) {
        const q = search.trim().toLowerCase()
        const hay = `${i.problemType} ${i.commentaire ?? ''} ${i.zone?.nom ?? ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [incidents, filterZone, filterStatus, filterVip, search])

  const act = async (id: string, statut: VipIncident['statut'], label: string) => {
    try {
      await onPatchStatus(id, statut)
      toast({ title: label, description: 'Le statut du signalement a été mis à jour.' })
    } catch {
      toast({ title: 'Erreur', description: 'Impossible de mettre à jour le signalement.', variant: 'destructive' })
    }
  }

  return (
    <div className="space-y-5">
      <SectionTitle
        title="Signalements"
        subtitle="Suivi en temps réel des incidents signalés par les clients VIP"
        Icon={Bell}
      />

      {/* Filtres */}
      <Card className="border border-[#EAE5DC] bg-white p-4 shadow-[0_4px_20px_rgba(201,169,97,0.06)]">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[180px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8B6F47]/60" aria-hidden />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher (problème, commentaire…)"
              className="border-[#EAE5DC] bg-[#FAFAF7] pl-9 text-sm"
            />
          </div>
          <Select value={filterZone} onValueChange={setFilterZone}>
            <SelectTrigger className="w-[170px] border-[#EAE5DC] bg-[#FAFAF7] text-sm">
              <SelectValue placeholder="Zone" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes les zones</SelectItem>
              {VIP_ZONES.map((z) => (
                <SelectItem key={z.code} value={z.code}>{z.nom}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-[150px] border-[#EAE5DC] bg-[#FAFAF7] text-sm">
              <SelectValue placeholder="Statut" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous statuts</SelectItem>
              <SelectItem value="EN_ATTENTE">Nouveau</SelectItem>
              <SelectItem value="EN_COURS">En cours</SelectItem>
              <SelectItem value="RESOLU">Résolu</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant={filterVip === 'vip' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilterVip((v) => (v === 'vip' ? 'all' : 'vip'))}
            className={cn(
              'gap-1.5 border-[#EAE5DC]',
              filterVip === 'vip'
                ? 'border-transparent bg-[#6B4C9A] text-white hover:bg-[#6B4C9A]/90'
                : 'bg-[#FAFAF7] text-[#8B6F47] hover:bg-[#C9A961]/10',
            )}
          >
            <Crown className="h-4 w-4" aria-hidden /> VIP seulement
          </Button>
        </div>
      </Card>

      {/* Table */}
      <Card className="border border-[#EAE5DC] bg-white shadow-[0_4px_20px_rgba(201,169,97,0.06)]">
        {loading ? (
          <div className="space-y-2 p-6">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-xl" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
            <CheckCircle2 className="h-8 w-8 text-[#4A7C59]" aria-hidden />
            <p className="text-sm font-medium text-[#2C2C2C]">Aucun signalement</p>
            <p className="text-xs text-[#8B6F47]">Aucun incident ne correspond à vos filtres.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-[#EAE5DC] hover:bg-transparent">
                <TableHead className="text-[#8B6F47]">Zone</TableHead>
                <TableHead className="text-[#8B6F47]">Problème</TableHead>
                <TableHead className="text-[#8B6F47]">Statut</TableHead>
                <TableHead className="text-[#8B6F47]">Heure</TableHead>
                <TableHead className="text-right text-[#8B6F47]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((i) => {
                const isVip = hashIsVip(i.id)
                return (
                  <TableRow key={i.id} className="border-[#EAE5DC]">
                    <TableCell className="font-medium text-[#2C2C2C]">
                      <div className="flex items-center gap-2">
                        <span className="text-lg" aria-hidden>{i.zone?.emoji ?? '📍'}</span>
                        <span>{i.zone?.nom ?? 'Salon'}</span>
                        {isVip && <VipBadge />}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="text-sm text-[#2C2C2C]">{i.problemType}</p>
                        {i.commentaire && (
                          <p className="mt-0.5 max-w-[260px] truncate text-xs text-[#8B6F47]">
                            « {i.commentaire} »
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn('border font-medium', INCIDENT_STATUS_STYLE[i.statut])}>
                        {INCIDENT_STATUS_LABEL[i.statut]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-[#8B6F47]">
                      <div>{formatTimeShort(i.createdAt)}</div>
                      <div className="text-[11px] text-[#8B6F47]/70">il y a {minutesDepuis(i.createdAt)} min</div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {i.statut === 'EN_ATTENTE' && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 border-[#C9A961]/40 bg-[#C9A961]/8 text-[#8B6F47] hover:bg-[#C9A961]/15"
                            onClick={() => act(i.id, 'EN_COURS', 'Pris en charge')}
                          >
                            <ArrowDown className="h-3.5 w-3.5" aria-hidden /> Prendre en charge
                          </Button>
                        )}
                        {i.statut !== 'RESOLU' && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 border-[#4A7C59]/40 bg-[#4A7C59]/8 text-[#4A7C59] hover:bg-[#4A7C59]/15"
                            onClick={() => act(i.id, 'RESOLU', 'Résolu')}
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> Résoudre
                          </Button>
                        )}
                        {i.statut !== 'RESOLU' && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 border-[#C97B63]/40 bg-[#C97B63]/8 text-[#C97B63] hover:bg-[#C97B63]/15"
                            onClick={() => toast({ title: 'Escalade déclenchée', description: 'Le manager a été notifié (visuel).' })}
                          >
                            <ArrowUp className="h-3.5 w-3.5" aria-hidden /> Escalader
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </Card>

      {/* ---------- Phase 1 — Demandes à la table ---------- */}
      <Card className="border border-[#EAE5DC] bg-white p-6 shadow-[0_4px_20px_rgba(201,169,97,0.06)]">
        <CardHeader className="px-0">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg text-[#2C2C2C]" style={{ fontFamily: 'Georgia, "Playfair Display", serif' }}>
                <ConciergeBell className="h-5 w-5 text-[#C9A961]" aria-hidden /> Demandes à la table
              </CardTitle>
              <CardDescription className="text-[#8B6F47]">
                Demandes envoyées par les clients depuis le QR code de leur table.
              </CardDescription>
            </div>
            <Select value={filterRequestType} onValueChange={setFilterRequestType}>
              <SelectTrigger className="w-[200px] border-[#EAE5DC] bg-[#FAFAF7] text-sm">
                <SelectValue placeholder="Type de demande" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les types</SelectItem>
                {Object.entries(REQUEST_TYPE_META).map(([k, m]) => (
                  <SelectItem key={k} value={k}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="px-0">
          {requestsLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
            </div>
          ) : tableRequests.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 rounded-2xl bg-[#FAFAF7] py-10 text-center">
              <CheckCircle2 className="h-8 w-8 text-[#4A7C59]" aria-hidden />
              <p className="text-sm font-medium text-[#2C2C2C]">Aucune demande à la table</p>
              <p className="text-xs text-[#8B6F47]">Les demandes envoyées par les clients depuis leur QR table apparaîtront ici.</p>
            </div>
          ) : (
            <ul className="max-h-[480px] space-y-2.5 overflow-y-auto pr-1">
              {tableRequests
                .filter((r) => filterRequestType === 'all' || r.type === filterRequestType)
                .map((r) => {
                  const meta = REQUEST_TYPE_META[r.type] ?? { label: r.type, Icon: ConciergeBell }
                  const statusMeta = REQUEST_STATUS_META[r.status] ?? REQUEST_STATUS_META.pending
                  const RIcon = meta.Icon
                  return (
                    <li
                      key={r.id}
                      className="flex flex-wrap items-center gap-3 rounded-xl border border-[#EAE5DC] bg-[#FAFAF7] px-4 py-3"
                    >
                      {/* Type icon */}
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#C9A961]/12 text-[#8B6F47]">
                        <RIcon className="h-5 w-5" aria-hidden />
                      </span>

                      {/* Table + type + message */}
                      <div className="min-w-[200px] flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline" className="border-[#EAE5DC] bg-white font-mono text-xs font-semibold text-[#2C2C2C]">
                            {r.table.tableNumber}
                          </Badge>
                          <p className="text-sm font-semibold text-[#2C2C2C]">{meta.label}</p>
                          <Badge variant="outline" className={cn('h-5 px-1.5 text-[10px] font-medium', statusMeta.style)}>
                            {statusMeta.label}
                          </Badge>
                        </div>
                        {r.message && (
                          <p className="mt-0.5 truncate text-xs text-[#8B6F47]">« {r.message} »</p>
                        )}
                        {r.table.clientName && (
                          <p className="mt-0.5 text-[11px] text-[#8B6F47]/80">
                            Client : <span className="font-medium text-[#2C2C2C]">{r.table.clientName}</span>
                            {r.table.clientVipLevel && (
                              <span className="ml-1 text-[#6B4C9A]">· {r.table.clientVipLevel}</span>
                            )}
                          </p>
                        )}
                      </div>

                      {/* Heure */}
                      <div className="shrink-0 text-right text-xs text-[#8B6F47]">
                        <div>{formatTimeShort(r.createdAt)}</div>
                        <div className="text-[11px] text-[#8B6F47]/70">il y a {minutesDepuis(r.createdAt)} min</div>
                      </div>

                      {/* Actions */}
                      <div className="flex shrink-0 items-center gap-1.5">
                        {r.status === 'pending' && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 border-[#C9A961]/40 bg-[#C9A961]/8 text-[#8B6F47] hover:bg-[#C9A961]/15"
                            onClick={async () => {
                              try {
                                await onPatchRequest(r.id, { status: 'in_progress' })
                                toast({ title: 'Pris en charge', description: `Demande de ${r.table.tableNumber} — ${meta.label}` })
                              } catch {
                                toast({ title: 'Erreur', description: 'Mise à jour impossible.', variant: 'destructive' })
                              }
                            }}
                          >
                            <ArrowDown className="h-3.5 w-3.5" aria-hidden /> Prendre en charge
                          </Button>
                        )}
                        {r.status !== 'done' && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 border-[#4A7C59]/40 bg-[#4A7C59]/8 text-[#4A7C59] hover:bg-[#4A7C59]/15"
                            onClick={async () => {
                              try {
                                await onPatchRequest(r.id, { status: 'done' })
                                toast({ title: 'Terminé', description: `Demande de ${r.table.tableNumber} clôturée.` })
                              } catch {
                                toast({ title: 'Erreur', description: 'Mise à jour impossible.', variant: 'destructive' })
                              }
                            }}
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> Terminer
                          </Button>
                        )}
                        {r.status === 'done' && (
                          <span className="text-xs text-[#4A7C59]">Clôturée</span>
                        )}
                      </div>
                    </li>
                  )
                })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ============================================================
// Tab C — Buffet & Bar
// ============================================================

function BuffetTab({
  buffet,
  loading,
  onPatchFill,
}: {
  buffet: BuffetItem[]
  loading: boolean
  onPatchFill: (id: string, fillLevel: number) => Promise<void>
}) {
  const { toast } = useToast()
  const clock = useClock()
  // Historique local (mock) — ajouté à chaque PATCH réussi
  const [history, setHistory] = useState<Array<{ id: string; who: string; when: string; item: string; level: number }>>([
    { id: 'h1', who: 'Élise Garnier', when: new Date(Date.now() - 60 * 60 * 1000).toISOString(), item: 'Buffet (Saumon, Fruits, Mignardises)', level: 85 },
    { id: 'h2', who: 'Olivier Petit', when: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), item: 'Champagne & Boissons', level: 70 },
    { id: 'h3', who: 'Élise Garnier', when: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(), item: 'Propreté du buffet', level: 95 },
  ])

  // Prochaine vérification = item avec nextCheck le plus proche
  const nextCheck = buffet
    .map((b) => b.nextCheck)
    .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())[0]
  const countdown = nextCheck ? countdownMmSs(nextCheck) : '--:--'

  const onSliderCommit = async (id: string, level: number, label: string) => {
    try {
      await onPatchFill(id, level)
      setHistory((h) => [
        { id: `h-${Date.now()}`, who: 'Vous', when: new Date().toISOString(), item: label, level },
        ...h,
      ])
      toast({ title: 'Niveau mis à jour', description: `${label} — ${level}%` })
    } catch {
      toast({ title: 'Erreur', description: 'Mise à jour impossible.', variant: 'destructive' })
    }
  }

  return (
    <div className="space-y-5">
      <SectionTitle
        title="Buffet & Bar"
        subtitle="Checklist luxe — Champagne, Saumon, Fruits & Mignardises"
        Icon={Wine}
        action={
          <div className="flex items-center gap-2 rounded-xl border border-[#EAE5DC] bg-white px-4 py-2.5 shadow-[0_4px_20px_rgba(201,169,97,0.06)]">
            <Clock className="h-4 w-4 text-[#C9A961]" aria-hidden />
            <span className="text-xs font-medium uppercase tracking-wider text-[#8B6F47]">Prochaine vérification</span>
            <span
              className="text-lg font-semibold tabular-nums text-[#2C2C2C]"
              style={{ fontFamily: 'Georgia, "Playfair Display", serif' }}
            >
              {loading ? '--:--' : countdown}
            </span>
          </div>
        }
      />

      {/* Items */}
      <div className="grid gap-4 md:grid-cols-3">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-[220px] rounded-2xl" />)
        ) : (
          buffet.map((b) => {
            const label = BUFFET_ITEM_LABELS[b.item] ?? b.item
            const low = b.fillLevel < 30
            const fillStyle = b.fillLevel < 30 ? 'bg-[#C97B63]' : b.fillLevel < 60 ? 'bg-[#C9A961]' : 'bg-[#4A7C59]'
            return (
              <Card key={b.id} className="border border-[#EAE5DC] bg-white p-5 shadow-[0_4px_20px_rgba(201,169,97,0.06)]">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-[#2C2C2C]">{label}</h3>
                    <p className="mt-0.5 text-xs text-[#8B6F47]">Dernière vérif. {formatTimeShort(b.lastCheck)}</p>
                  </div>
                  {low && (
                    <Badge className="border-[#C97B63]/30 bg-[#C97B63]/12 text-[#C97B63]">
                      <AlertTriangle className="h-3 w-3" aria-hidden /> Bas
                    </Badge>
                  )}
                </div>

                <div className="mt-4 flex items-baseline gap-1">
                  <span
                    className="text-4xl font-semibold text-[#2C2C2C]"
                    style={{ fontFamily: 'Georgia, "Playfair Display", serif' }}
                  >
                    {b.fillLevel}
                  </span>
                  <span className="text-sm font-medium text-[#8B6F47]">%</span>
                </div>

                {/* Barre visuelle */}
                <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-[#FAFAF7]">
                  <div className={cn('h-full rounded-full transition-all', fillStyle)} style={{ width: `${b.fillLevel}%` }} />
                </div>

                {/* Slider */}
                <div className="mt-5">
                  <Label className="text-[11px] font-medium uppercase tracking-wider text-[#8B6F47]">
                    Ajuster le niveau
                  </Label>
                  <Slider
                    className="mt-2"
                    defaultValue={[b.fillLevel]}
                    value={[b.fillLevel]}
                    min={0}
                    max={100}
                    step={5}
                    onValueCommit={(v) => onSliderCommit(b.id, v[0] ?? b.fillLevel, label)}
                  />
                  <div className="mt-1 flex justify-between text-[10px] text-[#8B6F47]/60">
                    <span>0%</span>
                    <span>50%</span>
                    <span>100%</span>
                  </div>
                </div>

                <p className="mt-3 text-[11px] text-[#8B6F47]">
                  Prochaine vérif. dans <span className="font-semibold tabular-nums text-[#2C2C2C]">{countdownMmSs(b.nextCheck)}</span>
                </p>
              </Card>
            )
          })
        )}
      </div>

      {/* Historique */}
      <Card className="border border-[#EAE5DC] bg-white p-6 shadow-[0_4px_20px_rgba(201,169,97,0.06)]">
        <CardHeader className="px-0">
          <CardTitle className="text-lg text-[#2C2C2C]" style={{ fontFamily: 'Georgia, "Playfair Display", serif' }}>
            Historique des vérifications
          </CardTitle>
          <CardDescription className="text-[#8B6F47]">Derniers contrôles effectués par l'équipe</CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          <ul className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
            {history.map((h) => (
              <li key={h.id} className="flex items-center gap-3 rounded-xl bg-[#FAFAF7] px-4 py-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#C9A961]/15 text-xs font-semibold text-[#8B6F47]">
                  {initials(h.who)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-[#2C2C2C]">{h.who}</p>
                  <p className="truncate text-xs text-[#8B6F47]">{h.item}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold text-[#2C2C2C]">{h.level}%</p>
                  <p className="text-[11px] text-[#8B6F47]">{formatTimeShort(h.when)}</p>
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}

// ============================================================
// Tab D — Douches Smart
// ============================================================

function ShowersTab({
  showers,
  loading,
  onPatchStatus,
}: {
  showers: Shower[]
  loading: boolean
  onPatchStatus: (id: string, status: 'free' | 'occupied' | 'cleaning') => Promise<void>
}) {
  const { toast } = useToast()
  // Maintenance locale (overlay non persisté — démo VIP)
  const [maintenanceSet, setMaintenanceSet] = useState<Set<string>>(new Set())
  // Compteur d'usage local — incrémenté à chaque libération/nettoyage déclenché
  // depuis cette UI (actions "Libérer" / "Nettoyer"). La valeur initiale est
  // déterministe par cabine (mock démo). Pas de setState dans un effect.
  const [usageCount, setUsageCount] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {}
    for (const s of showers) {
      init[s.id] = (s.showerNumber * 3) % 7 + 2
    }
    return init
  })
  const [qrShower, setQrShower] = useState<Shower | null>(null)

  // Incrémente le compteur d'usage d'une cabine quand le staff libère/nettoie
  // depuis cette UI (transition occupé → libre/cleaning déclenchée par action).
  const incrementUsage = useCallback((id: string) => {
    setUsageCount((prev) => ({ ...prev, [id]: (prev[id] ?? 0) + 1 }))
  }, [])

  const effectiveStatus = (s: Shower): ShowerStatus => {
    if (maintenanceSet.has(s.id)) return 'maintenance'
    return s.status
  }

  const toggleMaintenance = (s: Shower) => {
    setMaintenanceSet((prev) => {
      const next = new Set(prev)
      if (next.has(s.id)) next.delete(s.id)
      else next.add(s.id)
      return next
    })
  }

  const act = async (s: Shower, next: 'free' | 'occupied' | 'cleaning', label: string) => {
    try {
      // Sortir de maintenance si on force un statut réel
      setMaintenanceSet((prev) => {
        const n = new Set(prev)
        n.delete(s.id)
        return n
      })
      // Si on libère ou lance le nettoyage d'une cabine occupée → on compte une
      // utilisation de plus (le client vient de terminer sa douche).
      if (s.status === 'occupied' && (next === 'free' || next === 'cleaning')) {
        incrementUsage(s.id)
      }
      await onPatchStatus(s.id, next)
      toast({ title: label, description: `Douche N°${s.showerNumber}` })
    } catch {
      toast({ title: 'Erreur', description: 'Mise à jour impossible.', variant: 'destructive' })
    }
  }

  return (
    <div className="space-y-5">
      <SectionTitle
        title="Douches Smart"
        subtitle="Cabines privées — statut temps réel & QR réservation"
        Icon={ShowerHead}
        action={
          <div className="hidden gap-3 sm:flex">
            {(['free', 'occupied', 'cleaning', 'maintenance'] as ShowerStatus[]).map((st) => {
              const count = showers.filter((s) => effectiveStatus(s) === st).length
              const style = SHOWER_STATUS_STYLE[st]
              return (
                <div key={st} className="flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 shadow-[0_2px_8px_rgba(201,169,97,0.06)]">
                  <span className={cn('h-2 w-2 rounded-full', style.dot)} />
                  <span className="text-xs font-medium text-[#8B6F47]">{SHOWER_STATUS_LABEL[st]}</span>
                  <span className="text-sm font-semibold text-[#2C2C2C]">{count}</span>
                </div>
              )
            })}
          </div>
        }
      />

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[220px] rounded-2xl" />)}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {showers.map((s) => {
            const st = effectiveStatus(s)
            const style = SHOWER_STATUS_STYLE[st]
            const needsCleaning =
              s.status === 'occupied' && s.occupiedSince && minutesDepuis(s.occupiedSince) > 20
            return (
              <Card
                key={s.id}
                className={cn('border border-[#EAE5DC] bg-white p-5 shadow-[0_4px_20px_rgba(201,169,97,0.06)] ring-1 ring-transparent', style.ring)}
              >
                {/* En-tête cabine */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-wider text-[#8B6F47]">Cabine</p>
                    <p
                      className="text-3xl font-semibold text-[#2C2C2C]"
                      style={{ fontFamily: 'Georgia, "Playfair Display", serif' }}
                    >
                      N°{s.showerNumber}
                    </p>
                  </div>
                  <div className={cn('flex h-12 w-12 items-center justify-center rounded-xl', style.bg)}>
                    <span className={cn('h-3 w-3 rounded-full', style.dot)} />
                  </div>
                </div>

                {/* Statut */}
                <div className="mt-4">
                  <Badge variant="outline" className={cn('border font-semibold', style.bg, style.label)}>
                    {SHOWER_STATUS_LABEL[st]}
                  </Badge>
                </div>

                {/* Infos usage */}
                <div className="mt-4 space-y-1.5 text-xs text-[#8B6F47]">
                  <p>Utilisations aujourd'hui : <span className="font-semibold text-[#2C2C2C]">{usageCount[s.id] ?? 0}</span></p>
                  {s.occupiedSince && (
                    <p>Depuis : <span className="font-semibold text-[#2C2C2C]">{minutesDepuis(s.occupiedSince)} min</span></p>
                  )}
                  {needsCleaning && (
                    <p className="flex items-center gap-1 text-[#C97B63]">
                      <AlertTriangle className="h-3 w-3" aria-hidden /> Nettoyage requis
                    </p>
                  )}
                </div>

                {/* Actions */}
                <div className="mt-4 flex flex-wrap gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 border-[#C9A961]/40 bg-[#C9A961]/8 text-[#8B6F47] hover:bg-[#C9A961]/15"
                    onClick={() => setQrShower(s)}
                  >
                    <QrCode className="h-3.5 w-3.5" aria-hidden /> Voir QR
                  </Button>
                  {st !== 'free' && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 border-[#4A7C59]/40 bg-[#4A7C59]/8 text-[#4A7C59] hover:bg-[#4A7C59]/15"
                      onClick={() => act(s, 'free', 'Douche libérée')}
                    >
                      Libérer
                    </Button>
                  )}
                  {st !== 'occupied' && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 border-[#6B4C9A]/40 bg-[#6B4C9A]/8 text-[#6B4C9A] hover:bg-[#6B4C9A]/15"
                      onClick={() => act(s, 'occupied', 'Douche occupée')}
                    >
                      Occuper
                    </Button>
                  )}
                  {st !== 'cleaning' && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 border-[#C97B63]/40 bg-[#C97B63]/8 text-[#C97B63] hover:bg-[#C97B63]/15"
                      onClick={() => act(s, 'cleaning', 'Nettoyage en cours')}
                    >
                      Nettoyer
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 text-[#8B6F47] hover:bg-[#FAFAF7]"
                    onClick={() => toggleMaintenance(s)}
                  >
                    {st === 'maintenance' ? 'Sortir maintenance' : 'Maintenance'}
                  </Button>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {/* Dialog QR douche */}
      <Dialog open={qrShower !== null} onOpenChange={(o) => !o && setQrShower(null)}>
        <DialogContent className="border-[#EAE5DC] bg-white p-6">
          <DialogHeader>
            <DialogTitle className="text-xl text-[#2C2C2C]" style={{ fontFamily: 'Georgia, "Playfair Display", serif' }}>
              QR Réservation — Douche N°{qrShower?.showerNumber}
            </DialogTitle>
            <DialogDescription className="text-[#8B6F47]">
              Le client scanne ce QR pour réserver la cabine en toute discrétion.
            </DialogDescription>
          </DialogHeader>
          {qrShower && (
            <div className="flex flex-col items-center gap-4 py-2">
              <img
                src={qrImageUrl(qrUrlForZone('vip_showers', `vip_showers_${qrShower.showerNumber}`))}
                alt={`QR réservation douche N°${qrShower.showerNumber}`}
                className="h-48 w-48 rounded-xl border border-[#EAE5DC]"
              />
              <a
                href={qrImageUrl(qrUrlForZone('vip_showers', `vip_showers_${qrShower.showerNumber}`))}
                download={`qr-douche-${qrShower.showerNumber}.png`}
                className="inline-flex items-center gap-2 rounded-xl bg-[#C9A961]/12 px-4 py-2 text-sm font-medium text-[#8B6F47] hover:bg-[#C9A961]/20"
              >
                <Download className="h-4 w-4" aria-hidden /> Télécharger PNG
              </a>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ============================================================
// Tab E — Récompenses Premium
// ============================================================

function RewardsTab({ staffName }: { staffName: string }) {
  const { toast } = useToast()
  const [given, setGiven] = useState<RewardGiven[]>([
    {
      id: 'r1',
      rewardId: 'champagne',
      rewardLabel: 'Coupe de Champagne',
      clientName: 'Sophie Marchand',
      staffName: 'Olivier Petit',
      givenAt: new Date(Date.now() - 35 * 60 * 1000).toISOString(),
      cost: 28,
    },
    {
      id: 'r2',
      rewardId: 'massage',
      rewardLabel: 'Upgrade Fauteuil Massage',
      clientName: 'Marcus Chen',
      staffName: 'Camille Rousseau',
      givenAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      cost: 45,
    },
  ])
  // Sélection du client pour qui offrir (mock dropdown)
  const [selectedClient, setSelectedClient] = useState<string>(SEED_CLIENTS[0]?.name ?? '')

  const totalCostToday = given.reduce((s, r) => s + r.cost, 0)

  const offer = (reward: typeof LUXE_REWARDS[number]) => {
    const newReward: RewardGiven = {
      id: `r-${Date.now()}`,
      rewardId: reward.id,
      rewardLabel: reward.label,
      clientName: selectedClient,
      staffName,
      givenAt: new Date().toISOString(),
      cost: reward.cost,
    }
    setGiven((g) => [newReward, ...g])
    toast({
      title: 'Récompense offerte',
      description: `${reward.label} offerte à ${selectedClient}.`,
    })
  }

  return (
    <div className="space-y-5">
      <SectionTitle
        title="Récompenses Premium"
        subtitle="Offres luxe réservées aux clients VIP — Champagne, Massage, Cigar, Spa"
        Icon={Gift}
        action={
          <div className="rounded-xl border border-[#EAE5DC] bg-white px-4 py-2.5 shadow-[0_4px_20px_rgba(201,169,97,0.06)]">
            <p className="text-[11px] font-medium uppercase tracking-wider text-[#8B6F47]">Coût du jour</p>
            <p className="text-xl font-semibold text-[#2C2C2C]" style={{ fontFamily: 'Georgia, "Playfair Display", serif' }}>
              {totalCostToday} €
            </p>
          </div>
        }
      />

      {/* Sélection client */}
      <Card className="border border-[#EAE5DC] bg-white p-4 shadow-[0_4px_20px_rgba(201,169,97,0.06)]">
        <div className="flex flex-wrap items-center gap-3">
          <Label className="text-sm font-medium text-[#2C2C2C]">Offrir au client :</Label>
          <Select value={selectedClient} onValueChange={setSelectedClient}>
            <SelectTrigger className="w-[240px] border-[#EAE5DC] bg-[#FAFAF7] text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SEED_CLIENTS.map((c) => (
                <SelectItem key={c.id} value={c.name}>
                  {c.name} · {c.level}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Card>

      {/* Grille de rewards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {LUXE_REWARDS.map((r) => {
          const Icon = r.Icon
          return (
            <Card key={r.id} className="flex flex-col border border-[#EAE5DC] bg-white p-5 shadow-[0_4px_20px_rgba(201,169,97,0.06)]">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#C9A961]/15 to-[#8B6F47]/10 text-[#8B6F47]">
                <Icon className="h-7 w-7" aria-hidden />
              </div>
              <h3 className="mt-4 text-base font-semibold text-[#2C2C2C]" style={{ fontFamily: 'Georgia, "Playfair Display", serif' }}>
                {r.label}
              </h3>
              <p className="mt-1 flex-1 text-xs text-[#8B6F47]">{r.description}</p>
              <div className="mt-4 flex items-center justify-between">
                <span className="text-sm font-semibold text-[#C9A961]">{r.cost} €</span>
                <Button
                  size="sm"
                  className="h-8 gap-1.5 bg-gradient-to-br from-[#C9A961] to-[#8B6F47] text-white hover:opacity-90"
                  onClick={() => offer(r)}
                >
                  <Gift className="h-3.5 w-3.5" aria-hidden /> Offrir
                </Button>
              </div>
            </Card>
          )
        })}
      </div>

      {/* Historique */}
      <Card className="border border-[#EAE5DC] bg-white p-6 shadow-[0_4px_20px_rgba(201,169,97,0.06)]">
        <CardHeader className="px-0">
          <CardTitle className="text-lg text-[#2C2C2C]" style={{ fontFamily: 'Georgia, "Playfair Display", serif' }}>
            Offertes aujourd'hui
          </CardTitle>
          <CardDescription className="text-[#8B6F47]">{given.length} récompense(s) — {totalCostToday} €</CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          <ul className="space-y-2">
            {given.map((r) => (
              <li key={r.id} className="flex items-center gap-3 rounded-xl bg-[#FAFAF7] px-4 py-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#C9A961]/15 text-[#8B6F47]">
                  <Gift className="h-4 w-4" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-[#2C2C2C]">{r.rewardLabel}</p>
                  <p className="truncate text-xs text-[#8B6F47]">à {r.clientName} · par {r.staffName}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold text-[#C9A961]">{r.cost} €</p>
                  <p className="text-[11px] text-[#8B6F47]">{formatTimeShort(r.givenAt)}</p>
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}

// ============================================================
// Tab F — Clients VIP
// ============================================================

function ClientsTab() {
  return <VipClientsTab />
}

// ============================================================
// Tab G — Équipe / Staff
// ============================================================

function StaffTab() {
  const { toast } = useToast()
  const [staff, setStaff] = useState<StaffMember[]>(SEED_STAFF)
  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState<{ name: string; role: StaffRole; phone: string; photoUrl: string }>({
    name: '',
    role: 'Réceptionniste',
    phone: '',
    photoUrl: '',
  })

  const present = staff.filter((s) => s.present).length

  const addStaff = () => {
    if (!form.name.trim() || !form.phone.trim()) {
      toast({ title: 'Champs requis', description: 'Nom et téléphone sont obligatoires.', variant: 'destructive' })
      return
    }
    const newStaff: StaffMember = {
      id: `s-${Date.now()}`,
      name: form.name.trim(),
      role: form.role,
      phone: form.phone.trim(),
      photoUrl: form.photoUrl.trim() || null,
      present: true,
      incidentsResolved: 0,
      satisfactionScore: 5,
    }
    setStaff((s) => [newStaff, ...s])
    setForm({ name: '', role: 'Réceptionniste', phone: '', photoUrl: '' })
    setFormOpen(false)
    toast({ title: 'Staff ajouté', description: `${newStaff.name} · ${newStaff.role}` })
  }

  const togglePresent = (s: StaffMember) => {
    setStaff((list) => list.map((m) => (m.id === s.id ? { ...m, present: !m.present } : m)))
  }

  return (
    <div className="space-y-5">
      <SectionTitle
        title="Équipe / Staff"
        subtitle={`${present} présent(s) sur ${staff.length} · performance en temps réel`}
        Icon={UserCog}
        action={
          <Button
            className="gap-2 bg-gradient-to-br from-[#C9A961] to-[#8B6F47] text-white hover:opacity-90"
            onClick={() => setFormOpen(true)}
          >
            <Plus className="h-4 w-4" aria-hidden /> Ajouter staff
          </Button>
        }
      />

      <Card className="border border-[#EAE5DC] bg-white shadow-[0_4px_20px_rgba(201,169,97,0.06)]">
        <Table>
          <TableHeader>
            <TableRow className="border-[#EAE5DC] hover:bg-transparent">
              <TableHead className="text-[#8B6F47]">Staff</TableHead>
              <TableHead className="text-[#8B6F47]">Rôle</TableHead>
              <TableHead className="text-[#8B6F47]">Téléphone</TableHead>
              <TableHead className="text-[#8B6F47]">Statut</TableHead>
              <TableHead className="text-[#8B6F47]">Incidents résolus</TableHead>
              <TableHead className="text-[#8B6F47]">Satisfaction</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {staff.map((s) => {
              const RoleIcon = STAFF_ROLE_ICON[s.role]
              return (
                <TableRow key={s.id} className="border-[#EAE5DC]">
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="h-9 w-9 ring-1 ring-[#EAE5DC]">
                        {s.photoUrl && <AvatarImage src={s.photoUrl} alt={s.name} />}
                        <AvatarFallback className="bg-[#8B6F47]/15 text-xs font-semibold text-[#8B6F47]">
                          {initials(s.name)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="font-medium text-[#2C2C2C]">{s.name}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2 text-sm text-[#2C2C2C]">
                      <RoleIcon className="h-4 w-4 text-[#C9A961]" aria-hidden />
                      {s.role}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-[#8B6F47]">
                    <a href={`tel:${s.phone.replace(/\s/g, '')}`} className="inline-flex items-center gap-1.5 hover:text-[#C9A961]">
                      <Phone className="h-3.5 w-3.5" aria-hidden /> {s.phone}
                    </a>
                  </TableCell>
                  <TableCell>
                    <button
                      type="button"
                      onClick={() => togglePresent(s)}
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors',
                        s.present
                          ? 'border-[#4A7C59]/25 bg-[#4A7C59]/12 text-[#4A7C59]'
                          : 'border-[#8B6F47]/25 bg-[#FAFAF7] text-[#8B6F47]',
                      )}
                    >
                      <CircleDot className="h-3 w-3" aria-hidden /> {s.present ? 'Présent' : 'Absent'}
                    </button>
                  </TableCell>
                  <TableCell className="text-sm font-semibold text-[#2C2C2C]">{s.incidentsResolved}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-semibold text-[#C9A961]">{s.satisfactionScore.toFixed(1)}</span>
                      <span className="text-xs text-[#8B6F47]">/5</span>
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </Card>

      {/* Dialog ajout staff */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="border-[#EAE5DC] bg-white p-6">
          <DialogHeader>
            <DialogTitle className="text-xl text-[#2C2C2C]" style={{ fontFamily: 'Georgia, "Playfair Display", serif' }}>
              Nouveau membre du staff
            </DialogTitle>
            <DialogDescription className="text-[#8B6F47]">Ajoutez un employé à l'équipe du salon.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="s-name" className="text-[#8B6F47]">Nom complet *</Label>
                <Input
                  id="s-name"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="ex. Nadia Cherif"
                  className="mt-1.5 border-[#EAE5DC] bg-[#FAFAF7]"
                />
              </div>
              <div>
                <Label htmlFor="s-role" className="text-[#8B6F47]">Rôle</Label>
                <Select value={form.role} onValueChange={(v) => setForm((f) => ({ ...f, role: v as StaffRole }))}>
                  <SelectTrigger id="s-role" className="mt-1.5 border-[#EAE5DC] bg-[#FAFAF7]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Manager">Manager</SelectItem>
                    <SelectItem value="Maître d'Hôtel">Maître d'Hôtel</SelectItem>
                    <SelectItem value="Réceptionniste">Réceptionniste</SelectItem>
                    <SelectItem value="Étage">Étage</SelectItem>
                    <SelectItem value="Chef/Barman">Chef/Barman</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="s-phone" className="text-[#8B6F47]">Téléphone *</Label>
                <Input
                  id="s-phone"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  placeholder="+33 6 12 34 56 78"
                  className="mt-1.5 border-[#EAE5DC] bg-[#FAFAF7]"
                />
              </div>
              <div>
                <Label htmlFor="s-photo" className="text-[#8B6F47]">Photo (URL)</Label>
                <Input
                  id="s-photo"
                  value={form.photoUrl}
                  onChange={(e) => setForm((f) => ({ ...f, photoUrl: e.target.value }))}
                  placeholder="https://…"
                  className="mt-1.5 border-[#EAE5DC] bg-[#FAFAF7]"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)} className="border-[#EAE5DC] bg-[#FAFAF7] text-[#8B6F47]">
              Annuler
            </Button>
            <Button onClick={addStaff} className="gap-2 bg-gradient-to-br from-[#C9A961] to-[#8B6F47] text-white hover:opacity-90">
              <Plus className="h-4 w-4" aria-hidden /> Ajouter
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ============================================================
// Tab H — QR Codes
// ============================================================

function QRTab() {
  // Scans mockés (déterministes pour stabilité d'affichage)
  const scansForZone = (code: string) => {
    const h = code.split('').reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 0)
    return (h % 40) + 8
  }
  const scansForStaff = (id: string) => {
    const h = id.split('').reduce((a, c) => (a * 17 + c.charCodeAt(0)) >>> 0, 0)
    return (h % 12) + 1
  }

  const downloadQr = (url: string, filename: string) => {
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  const printQr = (url: string, label: string) => {
    const w = window.open('', '_blank', 'width=420,height=560')
    if (!w) return
    w.document.write(`
      <html><head><title>QR — ${label}</title></head>
      <body style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;margin:0;font-family:Georgia,serif;">
        <h2 style="color:#8B6F47;">${label}</h2>
        <img src="${url}" alt="QR" style="width:280px;height:280px;border:1px solid #EAE5DC;border-radius:12px;" />
        <p style="color:#8B6F47;font-size:12px;margin-top:16px;">Salon VIP — Lounge Premium</p>
      </body></html>
    `)
    w.document.close()
    w.focus()
    setTimeout(() => w.print(), 250)
  }

  return (
    <div className="space-y-5">
      <SectionTitle
        title="QR Codes"
        subtitle="Génération et impression — une QR par zone VIP et par membre du staff"
        Icon={QrCode}
      />

      {/* Section zones */}
      <div>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-[#8B6F47]">Zones VIP (6)</h3>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {VIP_ZONES.map((z) => {
            const url = qrUrlForZone(z.code, z.tags[0] ?? z.code)
            const img = qrImageUrl(url)
            const scans = scansForZone(z.code)
            return (
              <Card key={z.code} className="border border-[#EAE5DC] bg-white p-5 shadow-[0_4px_20px_rgba(201,169,97,0.06)]">
                <div className="flex items-start gap-3">
                  <span className="text-2xl" aria-hidden>{z.emoji}</span>
                  <div className="min-w-0 flex-1">
                    <h4 className="truncate text-sm font-semibold text-[#2C2C2C]">{z.nom}</h4>
                    <p className="truncate text-xs text-[#8B6F47]">{z.tags[0] ?? z.code}</p>
                  </div>
                </div>
                <div className="mt-4 flex justify-center">
                  <img src={img} alt={`QR ${z.nom}`} className="h-40 w-40 rounded-xl border border-[#EAE5DC]" />
                </div>
                <div className="mt-3 flex items-center justify-between text-xs">
                  <span className="text-[#8B6F47]">Scans aujourd'hui</span>
                  <span className="font-semibold text-[#C9A961]">{scans}</span>
                </div>
                <div className="mt-3 flex gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 flex-1 border-[#C9A961]/40 bg-[#C9A961]/8 text-[#8B6F47] hover:bg-[#C9A961]/15"
                    onClick={() => downloadQr(img, `qr-${z.code}.png`)}
                  >
                    <Download className="h-3.5 w-3.5" aria-hidden /> PNG
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 flex-1 border-[#8B6F47]/40 bg-[#8B6F47]/8 text-[#8B6F47] hover:bg-[#8B6F47]/15"
                    onClick={() => printQr(img, z.nom)}
                  >
                    <Printer className="h-3.5 w-3.5" aria-hidden /> Imprimer
                  </Button>
                </div>
              </Card>
            )
          })}
        </div>
      </div>

      {/* Section staff */}
      <div>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-[#8B6F47]">QR Staff</h3>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SEED_STAFF.map((s) => {
            const url = qrUrlForStaff(s.id)
            const img = qrImageUrl(url)
            const scans = scansForStaff(s.id)
            return (
              <Card key={s.id} className="border border-[#EAE5DC] bg-white p-5 shadow-[0_4px_20px_rgba(201,169,97,0.06)]">
                <div className="flex items-start gap-3">
                  <Avatar className="h-9 w-9 ring-1 ring-[#EAE5DC]">
                    {s.photoUrl && <AvatarImage src={s.photoUrl} alt={s.name} />}
                    <AvatarFallback className="bg-[#8B6F47]/15 text-xs font-semibold text-[#8B6F47]">
                      {initials(s.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <h4 className="truncate text-sm font-semibold text-[#2C2C2C]">{s.name}</h4>
                    <p className="truncate text-xs text-[#8B6F47]">{s.role}</p>
                  </div>
                </div>
                <div className="mt-4 flex justify-center">
                  <img src={img} alt={`QR ${s.name}`} className="h-32 w-32 rounded-xl border border-[#EAE5DC]" />
                </div>
                <div className="mt-3 flex items-center justify-between text-xs">
                  <span className="text-[#8B6F47]">Scans aujourd'hui</span>
                  <span className="font-semibold text-[#C9A961]">{scans}</span>
                </div>
                <div className="mt-3 flex gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 flex-1 border-[#C9A961]/40 bg-[#C9A961]/8 text-[#8B6F47] hover:bg-[#C9A961]/15"
                    onClick={() => downloadQr(img, `qr-staff-${s.id}.png`)}
                  >
                    <Download className="h-3.5 w-3.5" aria-hidden /> PNG
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 flex-1 border-[#8B6F47]/40 bg-[#8B6F47]/8 text-[#8B6F47] hover:bg-[#8B6F47]/15"
                    onClick={() => printQr(img, `Staff — ${s.name}`)}
                  >
                    <Printer className="h-3.5 w-3.5" aria-hidden /> Imprimer
                  </Button>
                </div>
              </Card>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ============================================================
// Tab I — Rapports
// ============================================================

function ReportsTab() {
  return <VipReportsTab />
}

// ============================================================
// Tab J — Paramètres
// ============================================================

function SettingsTab() {
  return <VipSettingsTab />
}

// ============================================================
// Composant principal — VIPDashboard
// ============================================================

export default function VIPDashboard() {
  const session = useAppStore((s) => s.session)
  const logout = useAppStore((s) => s.logout)

  const [tab, setTab] = useState<VipTab>('overview')
  const [drawerOuvert, setDrawerOuvert] = useState(false)
  const [incidents, setIncidents] = useState<VipIncident[]>([])
  const [showers, setShowers] = useState<Shower[]>([])
  const [buffet, setBuffet] = useState<BuffetItem[]>([])
  const [tables, setTables] = useState<VipTableData[]>([])
  const [tableRequests, setTableRequests] = useState<VipRequestWithTable[]>([])
  const [loading, setLoading] = useState(true)
  const [requestsLoading, setRequestsLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [rewardsGivenToday, setRewardsGivenToday] = useState(2)
  const [clientsCount] = useState(18)
  // Configuration du tenant (modules optionnels, réglages lounge) — appliquée < 5s
  const [loungeConfig, setLoungeConfig] = useState<VipLoungeConfig | null>(null)

  const loungeName = session?.pro?.nomEtablissement ?? 'Salon VIP'
  const userEmail = session?.user?.email ?? '—'
  const userRole = session?.user?.role ?? 'PRO'
  // Nom du staff pour attribuer les récompenses
  const staffName = session?.user?.email
    ? session.user.email.split('@')[0].split('.').map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(' ')
    : 'Manager'

  const refreshData = useCallback(async () => {
    try {
      const [incRes, shRes, bfRes, tblRes, reqRes] = await Promise.all([
        fetch('/api/vip/incidents', { cache: 'no-store' }),
        fetch('/api/vip/showers', { cache: 'no-store' }),
        fetch('/api/vip/buffet', { cache: 'no-store' }),
        fetch('/api/vip/tables', { cache: 'no-store' }),
        fetch('/api/vip/requests', { cache: 'no-store' }),
      ])
      const incJson = await incRes.json().catch(() => null)
      const shJson = await shRes.json().catch(() => null)
      const bfJson = await bfRes.json().catch(() => null)
      const tblJson = await tblRes.json().catch(() => null)
      const reqJson = await reqRes.json().catch(() => null)
      if (incJson?.ok) setIncidents(incJson.data ?? [])
      if (shJson?.ok) setShowers(shJson.data ?? [])
      if (bfJson?.ok) setBuffet(bfJson.data ?? [])
      if (tblJson?.ok) setTables(tblJson.data ?? [])
      // Requests : on garde uniquement les demandes actives (pending + in_progress)
      // pour le tableau de bord. Les done sont masqués côté UI.
      if (reqJson?.ok) {
        const all: VipRequestWithTable[] = reqJson.data ?? []
        setTableRequests(all.filter((r: VipRequestWithTable) => r.status !== 'done'))
      }
    } catch {
      /* ignore — on garde l'état précédent */
    } finally {
      setLoading(false)
      setRequestsLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    refreshData()
    // Polling toutes les 30s — mode discrétion (visuel uniquement)
    const interval = setInterval(refreshData, 30000)
    return () => clearInterval(interval)
  }, [refreshData])

  // Config tenant lounge : chargement initial + refetch quand on revient
  // sur les onglets (application des paramètres en < 5s)
  useEffect(() => {
    let cancelled = false
    const chargerConfig = async () => {
      try {
        const res = await fetch('/api/vip/settings', { cache: 'no-store' })
        const json = await res.json().catch(() => null)
        if (!cancelled && json?.ok) setLoungeConfig(json.data.config)
      } catch {
        /* silencieux — défauts serveur */
      }
    }
    chargerConfig()
    const interval = setInterval(chargerConfig, 20000)
    const onFocusTab = () => chargerConfig()
    window.addEventListener('focus', onFocusTab)
    return () => {
      cancelled = true
      clearInterval(interval)
      window.removeEventListener('focus', onFocusTab)
    }
  }, [])

  // Récompenses : on initialise à 2 (mock) — elles s'incrémentent via le tab Rewards
  // via un callback. Pour rester simple, on calcule depuis le storage local.
  useEffect(() => {
    try {
      const raw = localStorage.getItem('vip_rewards_today')
      if (raw) {
        const parsed: RewardGiven[] = JSON.parse(raw)
        const today = new Date().toDateString()
        setRewardsGivenToday(parsed.filter((r) => new Date(r.givenAt).toDateString() === today).length)
      }
    } catch {
      /* ignore */
    }
  }, [tab])

  const patchIncidentStatus = useCallback(
    async (id: string, statut: VipIncident['statut']) => {
      const res = await fetch('/api/vip/incidents', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, statut }),
      })
      if (!res.ok) throw new Error('patch incident failed')
      setIncidents((list) => list.map((i) => (i.id === id ? { ...i, statut } : i)))
    },
    [],
  )

  const patchShowerStatus = useCallback(
    async (id: string, status: 'free' | 'occupied' | 'cleaning') => {
      const res = await fetch('/api/vip/showers', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      })
      if (!res.ok) throw new Error('patch shower failed')
      setShowers((list) =>
        list.map((s) =>
          s.id === id
            ? {
                ...s,
                status,
                occupiedSince: status === 'occupied' ? new Date().toISOString() : null,
              }
            : s,
        ),
      )
    },
    [],
  )

  const patchBuffetFill = useCallback(async (id: string, fillLevel: number) => {
    const res = await fetch('/api/vip/buffet', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, fillLevel }),
    })
    if (!res.ok) throw new Error('patch buffet failed')
    const json = await res.json().catch(() => null)
    const newFill = json?.data?.fillLevel ?? fillLevel
    const newNext = new Date(Date.now() + 30 * 60_000).toISOString()
    setBuffet((list) =>
      list.map((b) =>
        b.id === id
          ? {
              ...b,
              fillLevel: newFill,
              lastCheck: new Date().toISOString(),
              nextCheck: newNext,
              status:
                newFill <= 20 ? 'critical' : newFill <= 50 ? 'warning' : 'ok',
            }
          : b,
      ),
    )
  }, [])

  // Phase 1 — PATCH VipTable (status, clientName, clientVipLevel)
  const patchTable = useCallback(
    async (
      id: string,
      patch: {
        status?: VipTableStatus
        clientName?: string | null
        clientVipLevel?: string | null
      },
    ) => {
      const res = await fetch(`/api/vip/tables/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      if (!res.ok) throw new Error('patch table failed')
      const json = await res.json().catch(() => null)
      const updated = json?.data
      setTables((list) =>
        list.map((t) => {
          if (t.id !== id) return t
          if (!updated) {
            // Fallback optimistic — on applique localement
            const next: VipTableData = { ...t, ...patch } as VipTableData
            if (patch.status === 'free') {
              next.clientName = null
              next.clientVipLevel = null
              next.arrivedAt = null
              next.activeRequests = 0
              next.requests = []
            } else if (patch.status === 'occupied' && !t.arrivedAt) {
              next.arrivedAt = new Date().toISOString()
            }
            return next
          }
          // Si la table a été libérée, on vide aussi ses demandes actives
          const nextTable: VipTableData = {
            ...t,
            status: (updated.status as VipTableStatus) ?? t.status,
            clientName: updated.clientName ?? null,
            clientVipLevel: updated.clientVipLevel ?? null,
            arrivedAt: updated.arrivedAt ?? null,
            activeRequests: updated.activeRequests ?? t.activeRequests,
            requests: updated.status === 'free' ? [] : t.requests,
          }
          return nextTable
        }),
      )
    },
    [],
  )

  // Phase 1 — PATCH VipTableRequest (status, staffName)
  const patchRequest = useCallback(
    async (
      id: string,
      patch: { status?: 'pending' | 'in_progress' | 'done'; staffName?: string | null },
    ) => {
      const res = await fetch(`/api/vip/requests/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      if (!res.ok) throw new Error('patch request failed')
      const json = await res.json().catch(() => null)
      const updated = json?.data
      // Côté demandes : on retire les done de la liste active
      setTableRequests((list) =>
        list
          .map((r) =>
            r.id === id
              ? {
                  ...r,
                  status: updated?.status ?? patch.status ?? r.status,
                  staffName: updated?.staffName ?? patch.staffName ?? r.staffName,
                }
              : r,
          )
          .filter((r) => r.status !== 'done'),
      )
      // Côté tables : on met à jour les demandes actives + la liste embarquée
      setTables((list) =>
        list.map((t) => {
          const req = t.requests.find((r) => r.id === id)
          if (!req) return t
          const updatedReq = {
            ...req,
            status: updated?.status ?? patch.status ?? req.status,
            staffName: updated?.staffName ?? patch.staffName ?? req.staffName,
          }
          const nextRequests = patch.status === 'done'
            ? t.requests.filter((r) => r.id !== id)
            : t.requests.map((r) => (r.id === id ? updatedReq : r))
          return {
            ...t,
            requests: nextRequests,
            activeRequests: nextRequests.filter((r) => r.status !== 'done').length,
          }
        }),
      )
    },
    [],
  )

  const naviguer = (t: VipTab) => {
    setTab(t)
    setDrawerOuvert(false)
  }

  const manualRefresh = () => {
    setRefreshing(true)
    refreshData()
  }

  const TAB_MODULE_KEY_ROOT: Partial<Record<VipTab, keyof VipLoungeConfig['modulesEnabled']>> = {
    showers: 'smartShower',
    rewards: 'flashRewards',
  }
  useEffect(() => {
    const key = TAB_MODULE_KEY_ROOT[tab]
    if (key && loungeConfig && loungeConfig.modulesEnabled[key] === false) setTab('overview')
  }, [tab, loungeConfig])
  const currentNav = NAV_ITEMS.find((n) => n.id === tab)
  const titreOnglet = currentNav?.label ?? 'Vue d\'ensemble'

  return (
    <div className="relative flex min-h-screen flex-col bg-[#FAFAF7] lg:pl-[260px]">
      {/* Filet doré décoratif sur le côté droit de la sidebar */}
      <div className="pointer-events-none fixed inset-y-0 left-[260px] z-30 hidden w-px bg-gradient-to-b from-[#C9A961]/30 via-[#EAE5DC] to-[#C9A961]/30 lg:block" aria-hidden />

      {/* ---------- Sidebar desktop (fixe, 260px) ---------- */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[260px] border-r border-[#EAE5DC] bg-white lg:block">
        <VIPSidebarContent
          activeTab={tab}
          onNavigate={naviguer}
          salonName={loungeName}
          userEmail={userEmail}
          userRole={userRole}
          onLogout={logout}
          modulesEnabled={loungeConfig?.modulesEnabled ?? null}
        />
      </aside>

      {/* ---------- Header (sticky) ---------- */}
      <header className="sticky top-0 z-20 border-b border-[#EAE5DC] bg-[#FAFAF7]/95 backdrop-blur-sm">
        <div className="flex h-16 items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            {/* Menu mobile — ouvre le drawer */}
            <Sheet open={drawerOuvert} onOpenChange={setDrawerOuvert}>
              <SheetContent side="left" className="w-[260px] border-0 p-0" aria-describedby={undefined}>
                <SheetTitle className="sr-only">Navigation VIP</SheetTitle>
                <VIPSidebarContent
                  activeTab={tab}
                  onNavigate={naviguer}
                  salonName={loungeName}
                  userEmail={userEmail}
                  userRole={userRole}
                  onLogout={logout}
                  modulesEnabled={loungeConfig?.modulesEnabled ?? null}
                />
              </SheetContent>
            </Sheet>
            <Button
              variant="ghost"
              size="icon"
              className="text-[#8B6F47] hover:bg-[#C9A961]/10 lg:hidden"
              onClick={() => setDrawerOuvert(true)}
              aria-label="Ouvrir le menu"
            >
              <Menu className="h-5 w-5" aria-hidden />
            </Button>
            <div className="min-w-0">
              <h2
                className="truncate text-lg font-semibold text-[#2C2C2C]"
                style={{ fontFamily: 'Georgia, "Playfair Display", serif' }}
              >
                {titreOnglet}
              </h2>
              <p className="hidden truncate text-xs text-[#8B6F47] sm:block">
                Salon VIP · Mode Discrétion
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Badge variant="outline" className="hidden border-[#4A7C59]/30 bg-[#4A7C59]/8 text-[#4A7C59] sm:inline-flex">
              <span className="mr-1 h-1.5 w-1.5 rounded-full bg-[#4A7C59]" /> En service
            </Badge>
            <Button
              variant="outline"
              size="sm"
              onClick={manualRefresh}
              disabled={refreshing}
              className="gap-1.5 border-[#EAE5DC] bg-white text-[#8B6F47] hover:bg-[#C9A961]/10"
            >
              {refreshing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" aria-hidden />
              )}
              <span className="hidden sm:inline">Actualiser</span>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => logout()}
              className="text-[#8B6F47] hover:bg-[#C97B63]/10 hover:text-[#C97B63] lg:hidden"
              aria-label="Déconnexion"
            >
              <LogOut className="h-5 w-5" aria-hidden />
            </Button>
          </div>
        </div>
      </header>

      {/* ---------- Contenu ---------- */}
      <main className="w-full flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <div className="mx-auto max-w-7xl">
          {/* Alerte Maître d'Hôtel — détection VIP, 100% visuelle (mode discrétion) */}
          <VipGuestAlertBanner />
          {tab === 'overview' && (
            <OverviewTab
              incidents={incidents}
              showers={showers}
              buffet={buffet}
              tables={tables}
              clientsCount={clientsCount}
              rewardsGivenToday={rewardsGivenToday}
              loading={loading}
              onPatchTable={patchTable}
            />
          )}
          {tab === 'plan' && (
            <FloorPlanTab tables={tables} loading={loading} onPatchTable={patchTable} onRefresh={refreshData} />
          )}
          {tab === 'incidents' && (
            <IncidentsTab
              incidents={incidents}
              loading={loading}
              onPatchStatus={patchIncidentStatus}
              tableRequests={tableRequests}
              requestsLoading={requestsLoading}
              onPatchRequest={patchRequest}
            />
          )}
          {tab === 'buffet' && (
            <BuffetTab buffet={buffet} loading={loading} onPatchFill={patchBuffetFill} />
          )}
          {tab === 'showers' && (loungeConfig?.modulesEnabled.smartShower ?? true) && (
            <ShowersTab showers={showers} loading={loading} onPatchStatus={patchShowerStatus} />
          )}
          {tab === 'rewards' && (loungeConfig?.modulesEnabled.flashRewards ?? true) && <RewardsTab staffName={staffName} />}
          {tab === 'clients' && <ClientsTab />}
          {tab === 'staff' && <StaffTab />}
          {tab === 'qr' && <QRTab />}
          {tab === 'reports' && <ReportsTab />}
          {tab === 'wallboard' && (
            <div className="relative h-[calc(100vh-200px)] min-h-[500px] w-full overflow-hidden rounded-2xl border border-[#EAE5DC] shadow-[0_4px_20px_rgba(201,169,97,0.06)]">
              <iframe
                src="/vip-wallboard"
                className="absolute inset-0 h-full w-full border-0"
                title="Wallboard Salon VIP"
              />
            </div>
          )}
          {tab === 'settings' && <SettingsTab />}
        </div>
      </main>
    </div>
  )
}
