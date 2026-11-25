'use client'

// ============================================================
// <CityScanView /> — Aminata · PWA citoyenne Ville Connectée
// ------------------------------------------------------------
// Le citoyen a scanné une plaque QR posée dans l'espace public
// (place, marché, gare…). Aminata, l'assistante municipale, l'accueille
// et lui propose 5 modules colorés :
//
//   🆘 Urgence & Sécurité     (rouge  #E30613) — Police / Pompiers / SAMU
//   🟠 Signaler un incident    (orange #FF6B00) — Voirie, éclairage, eau…
//   🔵 Orientation & Mobilité  (bleu   #0066CC) — Transports, pharmacie de garde
//   🛠️ Artisans du quartier   (vert   #00A651) — Plombier, électricien vérifiés
//   🏛️ Mairie dynamique       (violet #6B4C9A) — Horaires, services, annonces
//
// Machine à états :
//   loading → error | main → sub(module) → confirmation → main
//
// Contrat API (enveloppe { ok, data } | { ok: false, error }) :
//   GET  /api/city/plates     → { plates: CityPlate[] }
//        (on cherche la plaque dont qrToken === props.qrToken)
//   GET  /api/city/artisans   → { artisans: CityArtisan[] }
//   POST /api/city/incidents  → 201 { incident: CityIncident }
//        body { qrToken, type, category?, description?, gpsLat?, gpsLng? }
//        → auto-routage serveur : emergency→Police, éclairage→Senelec,
//          eau→ONAS, voirie/propreté/transport→Mairie, sécurité→Police
//
// RÈGLE GPS — la position n'est JAMAIS envoyée automatiquement.
//   Le citoyen doit cocher explicitement la case de consentement pour
//   que lat/lng soient joints au POST incident. Aucune exception,
//   même pour le module Urgence (le SAMU reçoit l'appel vocal, le
//   GPS n'est transmis qu'avec consentement explicite).
// ============================================================

import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import {
  Loader2,
  ArrowLeft,
  Phone,
  MapPin,
  Check,
  AlertTriangle,
  Send,
  Star,
  Building2,
  Bus,
  Pill,
  Navigation,
  Wrench,
  Trash2,
  Droplet,
  Lightbulb,
  Lock,
  Shield,
  Camera,
  MessageCircle,
  Calendar,
  Clock,
  User,
  Map,
  Route,
  Volume2,
  Hand,
  Mic,
  X,
  BadgeCheck,
  Sparkles,
  DoorOpen,
  LogIn,
  Plus,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'
import { parler } from '@/lib/staff-tts'
import { composeQrPremium, qrServerUrl } from '@/lib/qr-premium'

// ============================================================
// Types (contrat API — formes sérialisées par /api/city/*)
// ============================================================

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
  plateType: string // standard | ecole | gare | mairie
}

type CityIncident = {
  id: string
  qrToken: string | null
  type: string // emergency | report | orientation | artisan | mairie
  category: string | null
  description: string | null
  gpsLat: number | null
  gpsLng: number | null
  status: string // pending | assigned | in_progress | resolved
  assignedTo: string | null // Police | Senelec | ONAS | Mairie
  createdAt: string
}

type CityArtisan = {
  id: string
  name: string
  trade: string
  phone: string
  district: string | null
  premium: boolean
  rating: number
  reviewCount: number
  contactCount: number
  distance?: number | null // distance en mètres depuis la plaque (Haversine)
}

// --- Nouveaux types (Task 3) : commerce étendu, citoyen, check-in, SOS ---

/** Commerce / artisan étendu — remplace progressivement CityArtisan. */
type CityBusiness = {
  id: string
  name: string
  trade: string
  category: string // Artisan | Commerce | Restaurant | Coiffure | Mécanicien | Téléphonie | Nettoyage
  phone: string
  whatsapp?: string | null
  district?: string | null
  photoUrl?: string | null
  hours?: string | null
  description?: string | null
  distance?: number | null // distance en mètres depuis la plaque (Haversine)
  rating?: number
  reviewCount?: number
  contactCount?: number
  verified?: boolean
  isPremium?: boolean
  isSponsored?: boolean
  sponsoredOffer?: string | null
  /** JSON string : [{ name, price }] — pour les restaurants premium. */
  menu?: string | null
  /** JSON string : [{ service, price }] — pour les artisans premium. */
  priceGrid?: string | null
}

/** Citoyen — inscription légère (téléphone) pour école / SOS. */
type CityCitizen = {
  id: string
  phone: string
  name?: string | null
  schoolName?: string | null
  parentPhone?: string | null
  createdAt?: string
}

/** Check-in école — arrivée / sortie / souci. */
type CityCheckin = {
  id: string
  plateId: string
  citizenPhone: string
  status: 'arrived' | 'left' | 'sos'
  createdAt: string
}

/** SOS silencieux — photo + audio + GPS (optionnels). */
type CitySos = {
  id: string
  plateId?: string | null
  qrToken?: string | null
  photoDataUrl?: string | null
  audioDataUrl?: string | null
  gpsLat?: number | null
  gpsLng?: number | null
  citizenPhone?: string | null
  status?: string
  createdAt: string
}

// ============================================================
// Palette & typographie
// ============================================================

const COLORS = {
  red: '#E30613',
  orange: '#FF6B00',
  blue: '#0066CC',
  green: '#00A651',
  purple: '#6B4C9A',
  gold: '#C9A961',
  bg: '#FAFAF7',
} as const

/** Style de titre serif (Georgia / Playfair Display) appliqué aux titres. */
const TITLE_FONT: React.CSSProperties = {
  fontFamily: 'Georgia, "Playfair Display", serif',
}

// ============================================================
// Configuration des 5 modules (banner d'accueil Aminata)
// ============================================================

type ModuleId = 'urgence' | 'signalement' | 'orientation' | 'artisans' | 'mairie' | 'tax_fraud' | 'itineraire' | 'annonces' | 'sante'

type ModuleConfig = {
  id: ModuleId
  emoji: string
  title: string
  desc: string
  sub: string
  color: string
}

const MODULES: ReadonlyArray<ModuleConfig> = [
  {
    id: 'urgence',
    emoji: '🚨',
    title: 'URGENCE & SÉCURITÉ',
    desc: 'Police · Pompiers · SAMU',
    sub: 'GPS sur consentement',
    color: COLORS.red,
  },
  {
    id: 'signalement',
    emoji: '📢',
    title: 'SIGNALER UN INCIDENT',
    desc: 'Voirie · Éclairage · Eau · Propreté',
    sub: 'Routage automatique',
    color: COLORS.orange,
  },
  {
    id: 'orientation',
    emoji: '🧭',
    title: 'ORIENTATION & MOBILITÉ',
    desc: 'Transports · Pharmacie de garde',
    sub: 'Aminata vous guide',
    color: COLORS.blue,
  },
  {
    id: 'artisans',
    emoji: '🔨',
    title: 'ARTISANS DU QUARTIER',
    desc: 'Plombier · Électricien vérifiés',
    sub: 'Triés par distance',
    color: COLORS.green,
  },
  {
    id: 'mairie',
    emoji: '🏛️',
    title: 'MAIRIE DYNAMIQUE',
    desc: 'Horaires · Services · Annonces',
    sub: "Selon l'heure du jour",
    color: COLORS.purple,
  },
  {
    id: 'tax_fraud',
    emoji: '📡',
    title: 'RADAR TAXES & DÉPÔTS',
    desc: 'Camion · Conteneur · Chantier',
    sub: 'Photo + récompense',
    color: '#8B0000',
  },
  {
    id: 'itineraire',
    emoji: '🗺️',
    title: 'ITINÉRAIRE',
    desc: 'Se rendre à un lieu',
    sub: 'GUIDAGE GOOGLE MAPS',
    color: COLORS.blue,
  },
  {
    id: 'annonces',
    emoji: '📣',
    title: 'ANNONCES MUNICIPALES',
    desc: 'Messages de la mairie',
    sub: 'INFO MUNICIPALE',
    color: COLORS.orange,
  },
  {
    id: 'sante',
    emoji: '⚕️',
    title: 'SANTÉ',
    desc: 'Pharmacies & gardes',
    sub: 'URGENCES PHARMACEUTIQUES',
    color: COLORS.green,
  },
]

// ============================================================
// Catégories de signalement (module orange)
// ============================================================

type CategoryConfig = {
  id: string
  emoji: string
  label: string
  hint: string
  service: string // service notifié (affiché en confirmation)
  Icon?: React.ComponentType<{ className?: string }> // icône lucide d'accent
}

const CATEGORIES: ReadonlyArray<CategoryConfig> = [
  { id: 'voirie', emoji: '🛣️', label: 'Voirie', hint: 'Nid-de-poule, trou, chaussée', service: 'Mairie' },
  { id: 'éclairage', emoji: '💡', label: 'Éclairage', hint: 'Lampadaire en panne', service: 'Senelec', Icon: Lightbulb },
  { id: 'eau', emoji: '💧', label: 'Eau', hint: 'Fuite, coupure, débordement', service: 'ONAS', Icon: Droplet },
  { id: 'propreté', emoji: '🗑️', label: 'Propreté', hint: 'Déchets, tags, dépôt sauvage', service: 'Mairie', Icon: Trash2 },
  { id: 'sécurité', emoji: '🔒', label: 'Sécurité', hint: 'Incivilité, trouble, agression', service: 'Police', Icon: Lock },
  { id: 'transport', emoji: '🚌', label: 'Transport', hint: 'Arrêt, bus, gare routière', service: 'Mairie' },
]

// ============================================================
// Données mockées (orientation & mairie)
// ============================================================

const PHARMACIE_GARDE = {
  name: 'Pharmacie de Garde Plateau',
  address: 'Rue Mohamed V, Dakar',
  phone: '+221338210000',
  hours: 'Ouverte 24h/24 — 7j/7',
}

const TRANSPORTS_NEARBY = [
  { line: 'Bus 23', destination: 'Plateau → Médina', next: 'Dans 6 min' },
  { line: 'Bus 15', destination: 'Plateau → Parcelles', next: 'Dans 12 min' },
  { line: 'Bus 10', destination: 'Plateau → Grand Dakar', next: 'Dans 18 min' },
  { line: 'Taxi-Commune', destination: "Station Place de l'Indépendance", next: 'Disponible' },
]

// Chefs de Quartier — routage automatique par district de la plaque scannée.
// Le citoyen n'a pas à chercher dans une liste : on affiche UNIQUEMENT
// le chef correspondant à sa zone. Fallback générique si district inconnu.
const CHEFS_QUARTIER: Record<string, { name: string; role: string; phone: string; whatsapp: string; hours: string }> = {
  Plateau:   { name: 'M. Amadou Diallo',    role: 'Chef de Quartier', phone: '+221770000001', whatsapp: '221770000001', hours: 'Lun–Ven · 9h–16h' },
  Médina:    { name: 'Mme Fatou Ndiaye',    role: 'Chef de Quartier', phone: '+221770000002', whatsapp: '221770000002', hours: 'Lun–Ven · 9h–16h' },
  Sandaga:   { name: 'M. Ousmane Fall',     role: 'Chef de Quartier', phone: '+221770000003', whatsapp: '221770000003', hours: 'Lun–Ven · 9h–16h' },
  Parcelles: { name: 'Mme Aïssatou Sow',    role: 'Déléguée de zone', phone: '+221770000004', whatsapp: '221770000004', hours: 'Lun–Ven · 8h30–15h30' },
  'Grand Dakar': { name: 'M. Cheikh Mbacké',    role: 'Chef de Quartier', phone: '+221770000005', whatsapp: '221770000005', hours: 'Lun–Ven · 9h–16h' },
}
const CHEF_QUARTIER_DEFAUT = {
  name: 'Secrétariat de la Mairie',
  role: 'Standard municipal',
  phone: '+221338000000',
  whatsapp: '221338000000',
  hours: 'Lun–Ven · 8h–16h',
}

// 3 motifs rapides avant d'ouvrir l'appel ou WhatsApp.
// Le message WhatsApp est pré-rempli avec la zone + le motif.
const MOTIFS_CHEF_QUARTIER = [
  { id: 'demarche',    emoji: '📋', label: 'Démarche / attestation',  desc: 'Voisinage, résidence, documents à préparer, jours de réception' },
  { id: 'mediation',   emoji: '🤝', label: 'Médiation / voisinage',    desc: 'Bruit, occupation d\'espace, malentendu local, rue' },
  { id: 'information', emoji: 'ℹ️', label: 'Info / urgence locale',  desc: 'Décès, cérémonie, événement communautaire, repère quartier' },
] as const

const MAIRIE_SERVICES = [
  { label: 'État civil', phone: '+221338000000' },
  { label: 'Permis de construire', phone: '+221338000001' },
  { label: 'Impôts et taxes', phone: '+221338000002' },
  { label: "Carte d'identité", phone: '+221338000003' },
]

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

/** Formate une date ISO en horaire FR lisible (HH:MM). */
function formatHeure(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return '--:--'
  }
}

/**
 * Capture la position GPS du citoyen. Résout null si la géolocalisation
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
 * Envoie un incident citoyen à /api/city/incidents.
 * Retourne l'incident créé (avec assignedTo calculé serveur) ou une erreur.
 */
async function postIncident(payload: {
  qrToken: string
  type: string
  category?: string
  description?: string
  gpsLat?: number
  gpsLng?: number
}): Promise<{ ok: true; incident: CityIncident } | { ok: false; error: string }> {
  try {
    const res = await fetch('/api/city/incidents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const json = (await res.json().catch(() => null)) as {
      ok: boolean
      data?: { incident?: CityIncident }
      error?: string
    } | null
    if (json?.ok && json.data?.incident) {
      return { ok: true, incident: json.data.incident }
    }
    return { ok: false, error: json?.error ?? 'Erreur inconnue' }
  } catch {
    return { ok: false, error: 'Erreur réseau. Réessayez.' }
  }
}

/**
 * Détermine le message de bienverture dynamique de la mairie selon l'heure.
 * 05:00-12:00 → "Bonjour !"
 * 12:00-17:00 → "Bon après-midi !"
 * 17:00-23:00 → "Bonsoir ! Mairie fermée…"
 * 23:00-05:00 → "Mode nuit activé…"
 */
function getMairieGreeting(hour: number): {
  title: string
  detail: string
  isOpen: boolean
  tone: 'day' | 'evening' | 'night'
} {
  if (hour >= 5 && hour < 12)
    return {
      title: 'Bonjour !',
      detail: 'La mairie est ouverte de 08h à 16h.',
      isOpen: true,
      tone: 'day',
    }
  if (hour >= 12 && hour < 17)
    return {
      title: 'Bon après-midi !',
      detail: 'Services municipaux disponibles.',
      isOpen: true,
      tone: 'day',
    }
  if (hour >= 17 && hour < 23)
    return {
      title: 'Bonsoir !',
      detail: 'Mairie fermée. Urgences : appelez le 33 800 00 00.',
      isOpen: false,
      tone: 'evening',
    }
  return {
    title: 'Mode nuit activé.',
    detail: 'Pharmacie de garde : Pharmacie Plateau.',
    isOpen: false,
    tone: 'night',
  }
}

/** Heure actuelle (0-23) — hooké à un state pour le re-render. */
function useCurrentHour(): number {
  const [hour, setHour] = useState<number>(() => new Date().getHours())
  useEffect(() => {
    const tick = () => setHour(new Date().getHours())
    const t = setInterval(tick, 60_000)
    return () => clearInterval(t)
  }, [])
  return hour
}

// ============================================================
// Helpers SOS silencieux — capture discrète photo + audio
// ============================================================

/**
 * Capture discrète d'une photo via getUserMedia (caméra frontale).
 * Retourne un dataURL JPEG, ou null si la permission est refusée /
 * l'API est indisponible. Aucun flash, aucun son.
 */
async function captureDiscreetPhoto(): Promise<string | null> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    return null
  }
  let stream: MediaStream | null = null
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user' },
      audio: false,
    })
    const video = document.createElement('video')
    video.srcObject = stream
    video.muted = true
    video.playsInline = true
    document.body.appendChild(video)
    video.style.position = 'fixed'
    video.style.width = '1px'
    video.style.height = '1px'
    video.style.opacity = '0'
    video.style.pointerEvents = 'none'
    video.style.top = '-10px'
    video.style.left = '-10px'
    await video.play()
    // Petit délai pour laisser la première frame se dessiner
    await new Promise((r) => setTimeout(r, 500))
    const w = video.videoWidth || 480
    const h = video.videoHeight || 640
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(video, 0, 0, w, h)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.6)
    return dataUrl
  } catch {
    // Permission refusée ou API indisponible — on renvoie null
    return null
  } finally {
    if (stream) {
      stream.getTracks().forEach((t) => t.stop())
    }
    // Nettoyage du <video> temporaire
    document.querySelectorAll('video').forEach((v) => {
      if (v.style.position === 'fixed' && v.style.width === '1px') {
        v.remove()
      }
    })
  }
}

/**
 * Enregistre `seconds` secondes d'audio ambiant via MediaRecorder.
 * Retourne un dataURL (audio/webm ou audio/mp4), ou null si
 * l'API est indisponible / permission refusée.
 */
async function captureAudioDataUrl(seconds = 5): Promise<string | null> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    return null
  }
  if (typeof MediaRecorder === 'undefined') {
    return null
  }
  let stream: MediaStream | null = null
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const recorder = new MediaRecorder(stream)
    const chunks: BlobPart[] = []
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data)
    }
    const stopped = new Promise<string | null>((resolve) => {
      recorder.onstop = () => {
        try {
          const blob = new Blob(chunks, {
            type: recorder.mimeType || 'audio/webm',
          })
          const reader = new FileReader()
          reader.onload = () => resolve(reader.result as string)
          reader.onerror = () => resolve(null)
          reader.readAsDataURL(blob)
        } catch {
          resolve(null)
        }
      }
    })
    recorder.start()
    setTimeout(() => {
      try {
        if (recorder.state !== 'inactive') recorder.stop()
      } catch {
        /* ignore */
      }
    }, seconds * 1000)
    return await stopped
  } catch {
    return null
  } finally {
    if (stream) {
      stream.getTracks().forEach((t) => t.stop())
    }
  }
}

/**
 * Envoie un SOS silencieux à /api/city/sos avec photo + audio + GPS.
 * Tolérant : si la photo ou l'audio échouent, on envoie quand même
 * le SOS sans ces champs.
 */
async function postSosSilencieux(payload: {
  plateId?: string
  qrToken?: string
  photoDataUrl?: string | null
  audioDataUrl?: string | null
  gpsLat?: number | null
  gpsLng?: number | null
  citizenPhone?: string | null
}): Promise<{ ok: true; sos: CitySos } | { ok: false; error: string }> {
  try {
    const res = await fetch('/api/city/sos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const json = (await res.json().catch(() => null)) as {
      ok: boolean
      data?: { sos?: CitySos }
      error?: string
    } | null
    if (json?.ok && json.data?.sos) {
      return { ok: true, sos: json.data.sos }
    }
    return { ok: false, error: json?.error ?? 'Erreur inconnue' }
  } catch {
    return { ok: false, error: 'Erreur réseau. Réessayez.' }
  }
}

/**
 * Envoie un check-in école à /api/city/checkins.
 */
async function postCheckin(payload: {
  plateId: string
  citizenPhone: string
  status: 'arrived' | 'left' | 'sos'
}): Promise<{ ok: true; checkin: CityCheckin } | { ok: false; error: string }> {
  try {
    const res = await fetch('/api/city/checkins', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const json = (await res.json().catch(() => null)) as {
      ok: boolean
      data?: { checkin?: CityCheckin }
      error?: string
    } | null
    if (json?.ok && json.data?.checkin) {
      return { ok: true, checkin: json.data.checkin }
    }
    return { ok: false, error: json?.error ?? 'Erreur inconnue' }
  } catch {
    return { ok: false, error: 'Erreur réseau. Réessayez.' }
  }
}

/**
 * Inscrit un citoyen (téléphone + champs optionnels) à /api/city/citizens.
 */
async function postCitizen(payload: {
  phone: string
  name?: string
  schoolName?: string
  parentPhone?: string
}): Promise<{ ok: true; citizen: CityCitizen } | { ok: false; error: string }> {
  try {
    const res = await fetch('/api/city/citizens', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const json = (await res.json().catch(() => null)) as {
      ok: boolean
      data?: { citizen?: CityCitizen }
      error?: string
    } | null
    if (json?.ok && json.data?.citizen) {
      return { ok: true, citizen: json.data.citizen }
    }
    return { ok: false, error: json?.error ?? 'Erreur inconnue' }
  } catch {
    return { ok: false, error: 'Erreur réseau. Réessayez.' }
  }
}

// ============================================================
// Catégories de commerce (module Artisans étendu)
// ============================================================

const BUSINESS_CATEGORIES: ReadonlyArray<{ id: string; label: string; color: string }> = [
  { id: 'all',         label: 'Tous',         color: '#00A651' },
  { id: 'Artisan',     label: 'Artisan',      color: '#00A651' },
  { id: 'Commerce',    label: 'Commerce',     color: '#0066CC' },
  { id: 'Restaurant',  label: 'Restaurant',   color: '#FF6B00' },
  { id: 'Coiffure',    label: 'Coiffure',     color: '#6B4C9A' },
  { id: 'Mécanicien',  label: 'Mécanicien',   color: '#8B0000' },
  { id: 'Téléphonie',  label: 'Téléphonie',   color: '#1B2A8C' },
  { id: 'Nettoyage',   label: 'Nettoyage',    color: '#008B8B' },
]

function businessCategoryColor(category: string): string {
  return (
    BUSINESS_CATEGORIES.find((c) => c.id === category)?.color ?? '#00A651'
  )
}

// ============================================================
// Composant principal
// ============================================================

type Phase = 'loading' | 'welcome' | 'error' | 'main' | 'sub' | 'confirmation'

type Confirmation = {
  emoji: string
  title: string
  service: string
  gpsSent: boolean
  timestamp: string
}

export function CityScanView({
  qrToken,
  onExit,
}: {
  qrToken: string
  onExit?: () => void
}) {
  const { toast } = useToast()

  // --- Phase & navigation ---
  const [phase, setPhase] = useState<Phase>('loading')
  const [activeModule, setActiveModule] = useState<ModuleId | null>(null)
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null)

  // --- Données plaque ---
  const [plate, setPlate] = useState<CityPlate | null>(null)
  const [plateError, setPlateError] = useState<string | null>(null)

  // --- États partagés des sous-vues (reset au changement de module) ---
  const [gpsConsent, setGpsConsent] = useState(false)
  const [gpsLoading, setGpsLoading] = useState(false)
  const [category, setCategory] = useState<string | null>(null)
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // --- Artisans / Businesses étendus (chargés à la demande) ---
  const [artisans, setArtisans] = useState<CityArtisan[]>([])
  const [artisansLoading, setArtisansLoading] = useState(false)
  const [artisansLoaded, setArtisansLoaded] = useState(false)
  // Nouveau : liste étendue des commerces (module Artisans refactorisé)
  const [businesses, setBusinesses] = useState<CityBusiness[]>([])
  const [businessesLoading, setBusinessesLoading] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState<string>('all')

  // --- Citoyen (inscription légère pour école / SOS) ---
  const [citizenPhone, setCitizenPhone] = useState<string | null>(null)
  const [citizenName, setCitizenName] = useState<string | null>(null)
  const [showCitizenModal, setShowCitizenModal] = useState(false)
  const [citizenModalMode, setCitizenModalMode] = useState<'general' | 'school'>('general')
  const [citizenSubmitting, setCitizenSubmitting] = useState(false)
  // Resolver suspendu — permet à ensureCitizen() d'attendre la saisie.
  const citizenModalResolverRef = useRef<((phone: string | null) => void) | null>(null)

  // --- School checkin (vue école) : bascule vers le menu complet ---
  const [forceFullMenu, setForceFullMenu] = useState(false)

  // --- Orientation : position partagée ---
  const [sharedPos, setSharedPos] = useState<{ lat: number; lng: number } | null>(null)
  const [posCopied, setPosCopied] = useState(false)

  // --- Horloge mairie dynamique ---
  const currentHour = useCurrentHour()

  // --- QR premium côté citoyen ---
  const [premiumQrUrl, setPremiumQrUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!plate) return
    const compose = async () => {
      const origin = typeof window !== 'undefined' ? window.location.origin : 'https://feedback.qrbags.com'
      const qrUrl = qrServerUrl(`${origin}/?cityPlate=${plate.qrToken}`, 300)
      try {
        // Logo depuis localStorage (configuré par la mairie)
        let logoUrl: string | null = null
        try { logoUrl = localStorage.getItem('city_logo_url') } catch { /* ignore */ }
        const composed = await composeQrPremium(qrUrl, logoUrl, plate.plateNumber, 'Dakar')
        setPremiumQrUrl(composed)
      } catch {
        setPremiumQrUrl(qrUrl)
      }
    }
    compose()
  }, [plate])

  // ---------------------------------------------------------------
  // 1. Chargement initial : résolution de la plaque par qrToken
  // ---------------------------------------------------------------
  useEffect(() => {
    let cancelled = false
    setPhase('loading')
    setPlateError(null)

    ;(async () => {
      try {
        const res = await fetch('/api/city/plates', { cache: 'no-store' })
        const json = (await res.json().catch(() => null)) as {
          ok: boolean
          data?: { plates?: CityPlate[] }
          error?: string
        } | null
        if (cancelled) return
        if (!json?.ok || !Array.isArray(json.data?.plates)) {
          setPlateError(json?.error ?? 'Service indisponible')
          setPhase('error')
          return
        }
        const found = json.data.plates.find(
          (p) => p.qrToken === qrToken && p.status === 'active',
        )
        if (!found) {
          setPlateError('Ce QR code est introuvable')
          setPhase('error')
          return
        }
        setPlate(found)
        setPhase('welcome')
      } catch {
        if (cancelled) return
        setPlateError('Connexion impossible. Vérifiez votre réseau.')
        setPhase('error')
      }
    })()

    return () => {
      cancelled = true
    }
  }, [qrToken])

  // ---------------------------------------------------------------
  // 2. Reset des sous-vues au changement de module
  // ---------------------------------------------------------------
  useEffect(() => {
    setGpsConsent(false)
    setGpsLoading(false)
    setCategory(null)
    setDescription('')
    setSubmitting(false)
    setSharedPos(null)
    setPosCopied(false)
  }, [activeModule])

  // ---------------------------------------------------------------
  // 3. Chargement paresseux des artisans (module 🛠️)
  //    Utilise Haversine : si la plaque a un GPS, on filtre à ≤500m
  // ---------------------------------------------------------------
  useEffect(() => {
    if (activeModule !== 'artisans' || artisansLoaded) return
    let cancelled = false
    setArtisansLoading(true)
    ;(async () => {
      try {
        const params = new URLSearchParams()
        // Si la plaque a un GPS, on active le filtre Haversine (pas de filtre district)
        if (plate?.lat != null && plate?.lng != null) {
          params.set('lat', String(plate.lat))
          params.set('lng', String(plate.lng))
          params.set('radius', '500')
        } else if (plate?.district) {
          // Pas de GPS → fallback sur le filtre district
          params.set('district', plate.district)
        }
        const res = await fetch(`/api/city/artisans?${params.toString()}`, {
          cache: 'no-store',
        })
        const json = (await res.json().catch(() => null)) as
          | { ok: true; data: { artisans: CityArtisan[] } }
          | null
        if (cancelled) return
        if (json?.ok && Array.isArray(json.data?.artisans)) {
          setArtisans(json.data.artisans)
          setArtisansLoaded(true)
        }
      } catch {
        /* réseau down — liste vide */
      } finally {
        if (!cancelled) setArtisansLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [activeModule, artisansLoaded, plate?.district, plate?.lat, plate?.lng])

  // ---------------------------------------------------------------
  // 3b. Chargement paresseux des commerces étendus (module 🛠️)
  //     GET /api/city/businesses?lat&lng&radius=500&category=...
  //     Refetch à chaque changement de catégorie sélectionnée.
  // ---------------------------------------------------------------
  useEffect(() => {
    if (activeModule !== 'artisans') return
    let cancelled = false
    setBusinessesLoading(true)
    ;(async () => {
      try {
        const params = new URLSearchParams()
        if (plate?.lat != null && plate?.lng != null) {
          params.set('lat', String(plate.lat))
          params.set('lng', String(plate.lng))
          params.set('radius', '500')
        } else if (plate?.district) {
          params.set('district', plate.district)
        }
        if (selectedCategory !== 'all') {
          params.set('category', selectedCategory)
        }
        const res = await fetch(`/api/city/businesses?${params.toString()}`, {
          cache: 'no-store',
        })
        const json = (await res.json().catch(() => null)) as
          | { ok: true; data: { businesses?: CityBusiness[] } }
          | { ok: false; error?: string }
          | null
        if (cancelled) return
        if (json?.ok && Array.isArray(json.data?.businesses)) {
          setBusinesses(json.data.businesses)
        } else {
          setBusinesses([])
        }
      } catch {
        if (!cancelled) setBusinesses([])
      } finally {
        if (!cancelled) setBusinessesLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [activeModule, plate?.lat, plate?.lng, plate?.district, selectedCategory])

  // ---------------------------------------------------------------
  // 3c. ensureCitizen — promesse qui ouvre le modal d'inscription
  //     et résoud le téléphone saisi. Si le citoyen est déjà inscrit,
  //     résoud immédiatement sans ouvrir le modal.
  // ---------------------------------------------------------------
  const ensureCitizen = useCallback(
    async (mode: 'general' | 'school' = 'general'): Promise<string | null> => {
      if (citizenPhone) return citizenPhone
      setCitizenModalMode(mode)
      return new Promise<string | null>((resolve) => {
        citizenModalResolverRef.current = resolve
        setShowCitizenModal(true)
      })
    },
    [citizenPhone],
  )

  const handleCitizenSubmit = useCallback(
    async (data: {
      phone: string
      name?: string
      schoolName?: string
      parentPhone?: string
    }) => {
      setCitizenSubmitting(true)
      const result = await postCitizen(data)
      setCitizenSubmitting(false)
      if (result.ok) {
        setCitizenPhone(result.citizen.phone)
        if (result.citizen.name) setCitizenName(result.citizen.name)
        setShowCitizenModal(false)
        citizenModalResolverRef.current?.(result.citizen.phone)
        citizenModalResolverRef.current = null
        toast({
          title: 'Inscription réussie',
          description: `Bienvenue${result.citizen.name ? `, ${result.citizen.name}` : ''}.`,
        })
        return true
      }
      toast({
        title: 'Inscription impossible',
        description: result.error,
      })
      return false
    },
    [toast],
  )

  const handleCitizenCancel = useCallback(() => {
    setShowCitizenModal(false)
    citizenModalResolverRef.current?.(null)
    citizenModalResolverRef.current = null
  }, [])

  // ---------------------------------------------------------------
  // 4. Gestionnaire d'envoi d'incident (centralisé)
  // ---------------------------------------------------------------
  const handleSubmitIncident = useCallback(
    async (payload: {
      type: string
      category?: string
      description?: string
      requireGps?: boolean
      confirmation: Confirmation
    }) => {
      if (!plate) return
      // VOIX — Aminata confirme la demande DANS le geste utilisateur
      // (clic sur le bouton d'envoi). iOS Safari et Chrome mobile
      // exigent que speechSynthesis.speak() soit appelé synchronement
      // dans un handler de geste ; un appel différé (après await fetch)
      // est ignoré silencieusement. On parle donc ICI, avant tout await,
      // avec le message construit depuis la payload (titre + service).
      // Le détail GPS éventuel reste visible à l'écran de confirmation.
      try {
        parler(buildAminataConfirmation(payload.confirmation))
      } catch {
        /* ignore — synthèse vocale indisponible */
      }
      setSubmitting(true)

      // GPS : on ne capture QUE si le citoyen a coché le consentement.
      // Règle absolue — jamais d'envoi GPS sans checkbox.
      let gpsLat: number | undefined
      let gpsLng: number | undefined
      if (gpsConsent) {
        setGpsLoading(true)
        const pos = await captureGps()
        setGpsLoading(false)
        if (pos) {
          gpsLat = pos.lat
          gpsLng = pos.lng
        } else {
          toast({
            title: 'Position indisponible',
            description:
              "La géolocalisation a échoué. Votre demande est envoyée sans GPS.",
          })
        }
      }

      const result = await postIncident({
        qrToken: plate.qrToken,
        type: payload.type,
        category: payload.category,
        description: payload.description,
        gpsLat,
        gpsLng,
      })

      setSubmitting(false)

      if (!result.ok) {
        toast({
          title: 'Envoi impossible',
          description: result.error,
        })
        return
      }

      // Confirmation : on enrichit avec le service réellement notifié
      // (renvoyé par le serveur — Police / Senelec / ONAS / Mairie).
      const serviceNotified =
        result.incident.assignedTo ?? payload.confirmation.service
      setConfirmation({
        ...payload.confirmation,
        service: gpsLat
          ? `${serviceNotified} alerté · GPS transmis`
          : `${serviceNotified} notifié`,
        gpsSent: !!gpsLat,
        timestamp: result.incident.createdAt,
      })
      setPhase('confirmation')
    },
    [plate, gpsConsent, toast],
  )

  // ---------------------------------------------------------------
  // 5. Contact artisan (mock — incrémentation locale + fire-and-forget)
  // ---------------------------------------------------------------
  const handleContactArtisan = useCallback(
    (artisan: CityArtisan) => {
      // Incrément optimiste local (feedback immédiat)
      setArtisans((prev) =>
        prev.map((a) =>
          a.id === artisan.id ? { ...a, contactCount: a.contactCount + 1 } : a,
        ),
      )
      // Fire-and-forget : POST vers un endpoint de contact (mock pour l'instant).
      // L'endpoint n'existe pas encore côté serveur — on tolère l'échec.
      fetch(`/api/city/artisans/${artisan.id}/contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ qrToken: plate?.qrToken }),
      }).catch(() => undefined)
      toast({
        title: `Appel lancé à ${artisan.name}`,
        description: `${artisan.trade} · ${artisan.phone}`,
      })
    },
    [plate?.qrToken, toast],
  )

  // ---------------------------------------------------------------
  // 5b. Contact commerce étendu (ArtisansView refactorisé)
  //     Incrément optimiste + fire-and-forget vers /api/city/businesses/:id/contact
  // ---------------------------------------------------------------
  const handleContactBusiness = useCallback(
    (business: CityBusiness) => {
      setBusinesses((prev) =>
        prev.map((b) =>
          b.id === business.id
            ? { ...b, contactCount: (b.contactCount ?? 0) + 1 }
            : b,
        ),
      )
      fetch(`/api/city/businesses/${business.id}/contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ qrToken: plate?.qrToken }),
      }).catch(() => undefined)
      toast({
        title: `Contact lancé à ${business.name}`,
        description: `${business.trade} · ${business.phone}`,
      })
    },
    [plate?.qrToken, toast],
  )

  // ---------------------------------------------------------------
  // 6. Navigation entre vues
  // ---------------------------------------------------------------
  const openModule = (id: ModuleId) => {
    setActiveModule(id)
    setPhase('sub')
  }
  const backToMain = () => {
    setActiveModule(null)
    setConfirmation(null)
    // Si on revient d'une sous-vue ouverte depuis SchoolCheckinView,
    // on conserve forceFullMenu=true pour rester sur le menu complet.
    setPhase('main')
  }
  const openFullMenu = () => {
    setForceFullMenu(true)
    setPhase('main')
  }

  // ============================================================
  // Rendu
  // ============================================================

  // --- Conteneur racine : fond clair #FAFAF7 ---
  const rootClass =
    'relative min-h-screen w-full text-[#1A1A1A] antialiased'
  const rootStyle: React.CSSProperties = {
    backgroundColor: COLORS.bg,
  }

  // ---------------------------------------------------------------
  // 6.1. Phase loading
  // ---------------------------------------------------------------
  if (phase === 'loading') {
    return (
      <div className={rootClass} style={rootStyle}>
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
          <Loader2 className="size-10 animate-spin text-[#0066CC]" />
          <p
            className="text-lg font-medium text-[#1A1A1A]/80"
            style={TITLE_FONT}
          >
            Connexion à votre quartier…
          </p>
          <p className="text-sm text-[#1A1A1A]/50">
            Aminata identifie votre plaque QR
          </p>
        </div>
      </div>
    )
  }

  // ---------------------------------------------------------------
  // 6.1b. Phase welcome — page d'entrée (débloque la voix navigateur)
  // Style signalétique aéroport — harmonisé avec la page principale
  // ---------------------------------------------------------------
  if (phase === 'welcome' && plate) {
    const welcomeText = `Bonjour, je suis Aminata, votre guide. Vous êtes à ${plate.label}${
      plate.district ? `, quartier ${plate.district}` : ''
    }. Cliquez sur les rubriques ci-dessous pour accéder aux services.`

    const handleEnter = () => {
      try {
        parler(welcomeText)
      } catch { /* ignore */ }
      setPhase('main')
    }

    return (
      <div className={rootClass} style={rootStyle}>
        {/* Fond bleu signalétique (harmonisé avec header page principale) */}
        <div
          className="flex min-h-screen flex-col items-center justify-center px-6 text-center"
          style={{ background: '#1B2A8C' }}
        >
          {/* Carte d'accueil — tuile blanche arrondie (style signalétique) */}
          <div
            className="relative z-10 w-full max-w-sm rounded-3xl bg-white p-8 shadow-2xl"
            style={{ borderRadius: '28px' }}
          >
            {/* Avatar Aminata — tuile bleue avec icône */}
            <div className="relative mx-auto mb-5">
              <div
                className="flex h-20 w-20 items-center justify-center rounded-2xl text-4xl shadow-lg mx-auto"
                style={{
                  background: '#FFDD00',
                  borderRadius: '18px',
                }}
              >
                👋
              </div>
              {/* Anneau pulsant jaune */}
              <div
                className="absolute inset-0 rounded-2xl mx-auto"
                style={{
                  border: '3px solid rgba(255,221,0,0.5)',
                  borderRadius: '22px',
                  animation: 'pulse 2s infinite',
                  width: '80px',
                  height: '80px',
                  margin: '0 auto',
                }}
              />
            </div>

            {/* Titre principal */}
            <h1
              className="mb-2 text-2xl font-bold text-[#1A1A1A]"
              style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}
            >
              Bonjour, je suis Aminata
            </h1>

            {/* Sous-titre */}
            <p className="mb-6 text-sm font-bold uppercase tracking-wider text-[#1B2A8C]">
              Votre guide citoyenne
            </p>

            {/* Carte lieu — tuile bleue signalétique */}
            <div
              className="mb-6 flex items-center gap-3 rounded-2xl p-4"
              style={{ background: '#1B2A8C', borderRadius: '16px' }}
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white">
                <span className="text-xl">📍</span>
              </div>
              <div className="min-w-0 flex-1 text-left">
                <p className="truncate text-sm font-bold text-white">{plate.label}</p>
                {plate.district && (
                  <p className="truncate text-xs text-white/70">
                    {plate.district} · Dakar
                  </p>
                )}
              </div>
            </div>

            {/* Bouton principal — panneau jaune signalétique */}
            <button
              type="button"
              onClick={handleEnter}
              className="flex w-full items-center justify-center gap-3 rounded-2xl px-8 py-5 text-base font-bold uppercase tracking-wide shadow-lg transition-all hover:-translate-y-1 hover:shadow-2xl active:scale-[0.98]"
              style={{
                background: '#FFDD00',
                color: '#1A1A1A',
                borderRadius: '16px',
                fontFamily: 'Arial, Helvetica, sans-serif',
              }}
            >
              <span className="text-2xl">▶</span>
              <span>Accéder aux services</span>
            </button>

            {/* Note */}
            <div
              className="mt-5 flex items-center gap-2 rounded-xl px-4 py-3"
              style={{ background: '#F5F5F5' }}
            >
              <span className="text-lg">📱</span>
              <p className="text-left text-xs text-[#1A1A1A]/60">
                Activez le son de votre téléphone pour entendre Aminata vous accueillir.
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ---------------------------------------------------------------
  // 6.2. Phase error
  // ---------------------------------------------------------------
  if (phase === 'error') {
    return (
      <div className={rootClass} style={rootStyle}>
        <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 text-center">
          <div
            className="flex size-20 items-center justify-center rounded-full bg-[#E30613]/10"
            aria-hidden
          >
            <AlertTriangle className="size-10 text-[#E30613]" />
          </div>
          <div className="space-y-1">
            <h1 className="text-2xl font-bold text-[#1A1A1A]" style={TITLE_FONT}>
              {plateError ?? 'Ce QR code est introuvable'}
            </h1>
            <p className="text-sm text-[#1A1A1A]/60">
              Cette plaque n&apos;est peut-être pas encore installée ou a été
              désactivée par la mairie.
            </p>
          </div>
          <Button
            onClick={onExit}
            variant="outline"
            className="rounded-full border-[#1A1A1A]/20 bg-white px-6"
          >
            <ArrowLeft className="size-4" />
            Retour
          </Button>
        </div>
      </div>
    )
  }

  // ---------------------------------------------------------------
  // 6.3. Phase confirmation (shared)
  // ---------------------------------------------------------------
  if (phase === 'confirmation' && confirmation && plate) {
    return (
      <div className={rootClass} style={rootStyle}>
        <ConfirmationView
          confirmation={confirmation}
          plateNumber={plate.plateNumber}
          onBack={backToMain}
        />
      </div>
    )
  }

  // --- À partir d'ici, plate est forcément défini ---
  if (!plate) {
    return null
  }

  // ---------------------------------------------------------------
  // 6.4. Phase sub (sous-vue module)
  // ---------------------------------------------------------------
  if (phase === 'sub' && activeModule) {
    return (
      <div className={rootClass} style={rootStyle}>
        <SubViewShell
          plate={plate}
          module={MODULES.find((m) => m.id === activeModule)!}
          onBack={backToMain}
        >
          {activeModule === 'urgence' && (
            <UrgenceView
              plate={plate}
              citizenPhone={citizenPhone}
              onEnsureCitizen={ensureCitizen}
              gpsConsent={gpsConsent}
              setGpsConsent={setGpsConsent}
              gpsLoading={gpsLoading}
              submitting={submitting}
              onSubmit={handleSubmitIncident}
            />
          )}
          {activeModule === 'signalement' && (
            <SignalementView
              category={category}
              setCategory={setCategory}
              description={description}
              setDescription={setDescription}
              gpsConsent={gpsConsent}
              setGpsConsent={setGpsConsent}
              gpsLoading={gpsLoading}
              submitting={submitting}
              onSubmit={handleSubmitIncident}
            />
          )}
          {activeModule === 'orientation' && (
            <OrientationView
              sharedPos={sharedPos}
              setSharedPos={setSharedPos}
              posCopied={posCopied}
              setPosCopied={setPosCopied}
              submitting={submitting}
              onSubmit={handleSubmitIncident}
            />
          )}
          {activeModule === 'artisans' && (
            <ArtisansView
              businesses={businesses}
              loading={businessesLoading}
              district={plate.district}
              selectedCategory={selectedCategory}
              onSelectCategory={setSelectedCategory}
              onContact={handleContactBusiness}
              plate={plate}
            />
          )}
          {activeModule === 'mairie' && (
            <MairieView currentHour={currentHour} plate={plate} />
          )}
          {activeModule === 'tax_fraud' && (
            <TaxFraudView
              plate={plate}
              gpsConsent={gpsConsent}
              setGpsConsent={setGpsConsent}
              gpsLoading={gpsLoading}
              setGpsLoading={setGpsLoading}
              submitting={submitting}
              setSubmitting={setSubmitting}
              onSubmitSuccess={(data) => {
                setConfirmation({
                  emoji: '🚨',
                  title: 'Signalement envoyé',
                  service: data.reward ? `Récompense: ${data.reward.amount} FCFA` : 'Agent de recouvrement notifié',
                  gpsSent: !!data.gpsLat,
                  timestamp: new Date().toLocaleTimeString('fr-FR'),
                })
                setPhase('confirmation')
              }}
            />
          )}
          {activeModule === 'itineraire' && <ItineraireView plate={plate} />}
          {activeModule === 'annonces' && <AnnoncesView plate={plate} />}
          {activeModule === 'sante' && <SanteView plate={plate} />}
        </SubViewShell>

        {/* Overlay d'inscription citoyenne (SOS silencieux / école) */}
        {showCitizenModal && (
          <CitizenRegistrationModal
            open={showCitizenModal}
            mode={citizenModalMode}
            plateLabel={plate.label}
            submitting={citizenSubmitting}
            onSubmit={handleCitizenSubmit}
            onClose={handleCitizenCancel}
          />
        )}
      </div>
    )
  }

  // ---------------------------------------------------------------
  // 6.5. Phase main — Signalétique aéroport (panneaux jaunes/bleus)
  //      OU SchoolCheckinView si la plaque est de type 'ecole'
  //      et que le citoyen n'a pas demandé le menu complet.
  // ---------------------------------------------------------------
  const isSchoolPlate = plate.plateType === 'ecole'
  if (isSchoolPlate && !forceFullMenu) {
    return (
      <div className={rootClass} style={rootStyle}>
        <SchoolCheckinView
          plate={plate}
          citizenPhone={citizenPhone}
          citizenName={citizenName}
          currentHour={currentHour}
          onEnsureCitizen={(mode) => ensureCitizen(mode)}
          onOpenFullMenu={openFullMenu}
        />
        {showCitizenModal && (
          <CitizenRegistrationModal
            open={showCitizenModal}
            mode={citizenModalMode}
            plateLabel={plate.label}
            submitting={citizenSubmitting}
            onSubmit={handleCitizenSubmit}
            onClose={handleCitizenCancel}
          />
        )}
      </div>
    )
  }
  return (
    <div className={rootClass} style={rootStyle}>
      <MainView plate={plate} onOpenModule={openModule} onExit={onExit} currentHour={currentHour} />
      {showCitizenModal && (
        <CitizenRegistrationModal
          open={showCitizenModal}
          mode={citizenModalMode}
          plateLabel={plate.label}
          submitting={citizenSubmitting}
          onSubmit={handleCitizenSubmit}
          onClose={handleCitizenCancel}
        />
      )}
    </div>
  )
}

// ============================================================
// MainView — Signalétique aéroport style wayfinding
// ============================================================

function MainView({
  plate,
  onOpenModule,
  onExit,
  currentHour,
}: {
  plate: CityPlate
  onOpenModule: (id: ModuleId) => void
  onExit?: () => void
  currentHour: number
}) {
  const isNight = currentHour >= 22 || currentHour < 6

  // Config signalétique: jaune = standard, bleu = inversé (mairie),
  // rouge = URGENCE (repérage instantané par enfant ou personne en stress)
  const SIGNAGE_STYLE: Record<ModuleId, { bg: string; inverted: boolean }> = {
    urgence: { bg: '#E30613', inverted: true },       // Rouge franc (urgence)
    signalement: { bg: '#FFDD00', inverted: false },  // Jaune
    orientation: { bg: '#FFDD00', inverted: false },  // Jaune
    artisans: { bg: '#FFDD00', inverted: false },     // Jaune
    mairie: { bg: '#1B2A8C', inverted: true },        // Bleu (inversé)
    tax_fraud: { bg: '#FFDD00', inverted: false },    // Jaune
    itineraire: { bg: '#FFDD00', inverted: false },   // Jaune
    annonces: { bg: '#FFDD00', inverted: false },     // Jaune
    sante: { bg: '#FFDD00', inverted: false },        // Jaune
  }

  return (
    <div className="mx-auto min-h-screen max-w-md bg-white p-3">
      {/* === HEADER — panneau bleu signalétique arrondi === */}
      <header
        className="relative overflow-hidden px-5 pb-6 pt-5 shadow-xl"
        style={{ background: '#1B2A8C', borderRadius: '24px' }}
      >
        {/* Top bar: logo */}
        <div className="flex items-center gap-3">
          {/* Tuile blanche avec icône */}
          <div className="flex h-12 w-12 items-center justify-center bg-white" style={{ borderRadius: '14px' }}>
            <span className="text-2xl">👋</span>
          </div>
          <div>
            <p className="text-sm font-bold uppercase tracking-wider text-white">
              AMINATA
            </p>
            <p className="text-[10px] uppercase tracking-[0.2em] text-white/60">
              Votre Quartier
            </p>
          </div>
        </div>

        {/* Greeting */}
        <h1 className="mt-5 text-2xl font-bold leading-tight text-white">
          {isNight ? 'Bonsoir, je suis Aminata.' : 'Bonjour, je suis Aminata.'}
        </h1>
        <p className="mt-1 text-sm text-white/80">
          {isNight ? '🌙 Service nuit actif.' : 'Je suis là pour vous aider dans votre quartier.'}
        </p>

        {/* Location — tuile blanche signalétique arrondie */}
        <div className="mt-4 flex items-center gap-3 bg-white px-4 py-3" style={{ borderRadius: '16px' }}>
          <div className="flex h-10 w-10 items-center justify-center bg-[#1B2A8C]" style={{ borderRadius: '10px' }}>
            <span className="text-xl">📍</span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-[#1A1A1A]">{plate.label}</p>
            <p className="truncate text-xs text-[#1A1A1A]/60">
              {plate.district ? `${plate.district} · ` : ''}Dakar · #{plate.plateNumber}
            </p>
          </div>
        </div>
      </header>

      {/* === LIVE BAR === */}
      <div
        className="mt-3 flex items-center justify-between px-5 py-2 text-[11px] font-bold uppercase tracking-wider"
        style={{ background: '#1A1A1A', color: '#FFDD00', borderRadius: '12px' }}
      >
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-[#FFDD00]" style={{ animation: 'pulse 1.5s infinite' }} />
          <span>EN DIRECT</span>
        </div>
        <span className="text-white/60">👥 1 247 CIT. CONNECTÉS</span>
      </div>

      {/* === PANNEAUX SIGNALÉTIQUES === */}
      <main className="mt-3 flex flex-col gap-3">
        {MODULES.map((mod) => {
          const style = SIGNAGE_STYLE[mod.id]
          const isInverted = style.inverted
          const bgColor = style.bg
          const textColor = isInverted ? '#FFFFFF' : '#1A1A1A'
          const tileBg = '#FFFFFF'
          const tileIconColor = isInverted ? '#1A1A1A' : '#1A1A1A'
          const arrowBg = isInverted ? '#FFFFFF' : '#FFFFFF'
          const arrowColor = '#1A1A1A'

          return (
            <button
              key={mod.id}
              onClick={() => onOpenModule(mod.id)}
              className="group flex items-center gap-4 rounded-2xl p-4 shadow-lg transition-all hover:-translate-y-1 hover:shadow-2xl active:scale-[0.98]"
              style={{
                background: bgColor,
                borderRadius: '16px',
              }}
            >
              {/* Tuile icône blanche (gauche) */}
              <div
                className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl text-3xl transition-transform group-hover:scale-110"
                style={{
                  background: tileBg,
                  borderRadius: '12px',
                }}
              >
                {mod.emoji}
              </div>

              {/* Texte central */}
              <div className="min-w-0 flex-1 text-left">
                <h2
                  className="text-base font-bold uppercase leading-tight tracking-wide"
                  style={{ color: textColor, fontFamily: 'Arial, Helvetica, sans-serif' }}
                >
                  {mod.title}
                </h2>
                <p
                  className="mt-0.5 text-xs leading-snug"
                  style={{ color: isInverted ? 'rgba(255,255,255,0.7)' : 'rgba(26,26,26,0.6)' }}
                >
                  {mod.desc}
                </p>
                <p
                  className="mt-1 text-[10px] font-bold uppercase tracking-wider"
                  style={{ color: isInverted ? '#FFDD00' : '#1B2A8C' }}
                >
                  {mod.sub}
                </p>
              </div>

              {/* Cercle flèche blanche (droite) */}
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-transform group-hover:translate-x-1"
                style={{
                  background: arrowBg,
                }}
              >
                <svg
                  width="20" height="20" viewBox="0 0 24 24" fill="none"
                  stroke={arrowColor} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
                >
                  <line x1="5" y1="12" x2="19" y2="12" />
                  <polyline points="12 5 19 12 12 19" />
                </svg>
              </div>

              {/* Badge spécial (urgence SOS) */}
              {mod.id === 'urgence' && (
                <span
                  className="absolute right-4 top-4 rounded-md bg-[#FFDD00] px-2 py-0.5 text-[10px] font-bold uppercase text-[#1A1A1A]"
                >
                  SOS
                </span>
              )}
            </button>
          )
        })}
      </main>

      {/* === SOS FLOATING === */}
      <button
        onClick={() => onOpenModule('urgence')}
        className="fixed bottom-6 right-6 z-50 flex h-16 w-16 items-center justify-center rounded-full font-bold text-white shadow-2xl transition-transform hover:scale-110"
        style={{
          background: '#E30613',
          border: '4px solid white',
          animation: 'sosPulse 2s infinite',
        }}
        aria-label="SOS Urgence"
      >
        <span className="text-sm">SOS</span>
      </button>

      {/* === FOOTER === */}
      <footer className="px-4 pb-24 pt-5 text-center">
        <p className="text-xs font-bold uppercase tracking-wider text-[#1A1A1A]/40">
          ✨ AMINATA — VOTRE QUARTIER CONNECTÉ
        </p>
      </footer>

      <style>{`
        @keyframes sosPulse {
          0%, 100% { box-shadow: 0 15px 40px rgba(227,6,19,0.5); transform: scale(1); }
          50% { box-shadow: 0 15px 50px rgba(227,6,19,0.8); transform: scale(1.05); }
        }
      `}</style>
    </div>
  )
}

// ============================================================
// SubViewShell — coquille commune aux 5 sous-vues
// ============================================================

function SubViewShell({
  plate,
  module: mod,
  onBack,
  children,
}: {
  plate: CityPlate
  module: ModuleConfig
  onBack: () => void
  children: React.ReactNode
}) {
  // Style signalétique: bleu pour urgence/mairie, jaune pour les autres
  const isInverted = mod.id === 'urgence' || mod.id === 'mairie'
  const headerBg = isInverted ? '#1B2A8C' : '#FFDD00'
  const headerText = isInverted ? '#FFFFFF' : '#1A1A1A'

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col bg-white">
      {/* Header signalétique — harmonisé avec page principale */}
      <header
        className="px-5 pb-5 pt-5 shadow-lg"
        style={{ background: headerBg }}
      >
        {/* Bouton retour — tuile blanche signalétique */}
        <button
          onClick={onBack}
          className="mb-4 flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-xs font-bold uppercase tracking-wider transition hover:bg-white/90"
          style={{ color: '#1A1A1A' }}
        >
          <span>←</span>
          <span>Retour</span>
        </button>

        <div className="flex items-center gap-3">
          {/* Tuile icône blanche */}
          <div
            className="flex h-14 w-14 items-center justify-center rounded-xl bg-white text-3xl"
            style={{ borderRadius: '12px' }}
          >
            {mod.emoji}
          </div>
          <div>
            <h1
              className="text-lg font-bold uppercase leading-tight tracking-wide"
              style={{ color: headerText, fontFamily: 'Arial, Helvetica, sans-serif' }}
            >
              {mod.title}
            </h1>
            <p
              className="mt-0.5 text-xs font-medium"
              style={{ color: isInverted ? 'rgba(255,255,255,0.7)' : 'rgba(26,26,26,0.6)' }}
            >
              Plaque {plate.plateNumber} · {plate.district ?? 'Dakar'}
            </p>
          </div>
        </div>
      </header>

      {/* Contenu */}
      <main className="flex-1 px-4 py-6">{children}</main>
    </div>
  )
}

// ============================================================
// 1. UrgenceView (rouge) — Police / Pompiers / SAMU + agression
//    + SOS silencieux (appui long 3 s) avec photo + audio
// ============================================================

/** Durée d'appui long requise pour déclencher le SOS silencieux. */
const SOS_HOLD_MS = 3000

function UrgenceView({
  plate,
  citizenPhone,
  onEnsureCitizen,
  gpsConsent,
  setGpsConsent,
  gpsLoading,
  submitting,
  onSubmit,
}: {
  plate: CityPlate
  citizenPhone: string | null
  onEnsureCitizen: (mode?: 'general' | 'school') => Promise<string | null>
  gpsConsent: boolean
  setGpsConsent: (v: boolean) => void
  gpsLoading: boolean
  submitting: boolean
  onSubmit: (payload: {
    type: string
    category?: string
    description?: string
    requireGps?: boolean
    confirmation: Confirmation
  }) => void
}) {
  const { toast } = useToast()
  const EMERGENCIES = [
    { emoji: '📞', label: 'POLICE', num: '17', tel: 'tel:17', color: '#E30613' },
    { emoji: '🚒', label: 'POMPIERS', num: '180', tel: 'tel:180', color: '#FF6B00' },
    { emoji: '🚑', label: 'SAMU', num: '1515', tel: 'tel:1515', color: '#0066CC' },
  ]

  // --- SOS silencieux : état local ---
  const longPressTimerRef = useRef<number | null>(null)
  const progressTimerRef = useRef<number | null>(null)
  const [sosHolding, setSosHolding] = useState(false)
  const [sosProgress, setSosProgress] = useState(0) // 0..100
  const [sosSending, setSosSending] = useState(false)
  const [sosSent, setSosSent] = useState(false)

  // Cleanup à la fermeture du composant.
  useEffect(() => {
    return () => {
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current)
      if (progressTimerRef.current) clearInterval(progressTimerRef.current)
    }
  }, [])

  /**
   * Déclenche effectivement le SOS silencieux : capture photo + audio,
   * récupère le GPS, identifie le citoyen si besoin, puis POST /api/city/sos.
   * Tolérant : si la photo / audio / GPS échouent, on envoie quand même.
   */
  const triggerSosSilencieux = async () => {
    // Reset UI d'appui
    setSosHolding(false)
    setSosProgress(0)
    if (progressTimerRef.current) {
      clearInterval(progressTimerRef.current)
      progressTimerRef.current = null
    }
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }

    setSosSending(true)

    // 1. Capture discrète photo + audio + GPS en parallèle (tolérant).
    const [photo, audio, pos] = await Promise.all([
      captureDiscreetPhoto(),
      captureAudioDataUrl(5),
      captureGps(),
    ])

    if (!photo && !audio) {
      // On prévient mais on continue d'envoyer le SOS sans média.
      toast({
        title: 'SOS silencieux',
        description:
          "Caméra/micro refusés. Envoi du SOS sans photo ni audio.",
      })
    }

    // 2. Identifier le citoyen (phone) — non bloquant si annulé.
    let phone: string | null = citizenPhone
    if (!phone) {
      try {
        phone = await onEnsureCitizen('general')
      } catch {
        phone = null
      }
    }

    // 3. POST /api/city/sos
    const result = await postSosSilencieux({
      plateId: plate.id,
      qrToken: plate.qrToken,
      photoDataUrl: photo,
      audioDataUrl: audio,
      gpsLat: pos?.lat,
      gpsLng: pos?.lng,
      citizenPhone: phone,
    })

    setSosSending(false)

    if (result.ok) {
      setSosSent(true)
      // Voix discrète — message court, sans alarme sonore.
      try {
        parler('S O S envoyé. Les secours sont alertés.')
      } catch {
        /* ignore */
      }
      toast({
        title: 'SOS silencieux envoyé',
        description: 'Les secours ont été alertés discrètement.',
      })
    } else {
      toast({
        title: 'SOS partiellement envoyé',
        description: result.error,
      })
    }
  }

  /** Lance le minuteur d'appui long + le timer de progression. */
  const startLongPress = () => {
    if (sosSending || sosSent) return
    setSosHolding(true)
    setSosProgress(0)
    const startTime = Date.now()
    progressTimerRef.current = window.setInterval(() => {
      const elapsed = Date.now() - startTime
      const pct = Math.min(100, (elapsed / SOS_HOLD_MS) * 100)
      setSosProgress(pct)
    }, 50) as unknown as number
    longPressTimerRef.current = window.setTimeout(() => {
      // Déclenchement effectif après 3 s d'appui continu.
      void triggerSosSilencieux()
    }, SOS_HOLD_MS) as unknown as number
  }

  /** Annule l'appui long (le doigt quitte le bouton avant 3 s). */
  const cancelLongPress = () => {
    setSosHolding(false)
    setSosProgress(0)
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
    if (progressTimerRef.current) {
      clearInterval(progressTimerRef.current)
      progressTimerRef.current = null
    }
  }

  // Rayon du cercle de progression (calculé pour le SVG).
  const radius = 28
  const circumference = 2 * Math.PI * radius
  const dashOffset = circumference * (1 - sosProgress / 100)

  return (
    <div className="space-y-5">
      {/* 3 gros boutons d'appel */}
      <div className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wide text-[#1A1A1A]/60">
          Appels d&apos;urgence
        </h2>
        {EMERGENCIES.map((e) => (
          <a
            key={e.label}
            href={e.tel}
            className="flex items-center gap-4 rounded-2xl bg-white p-4 shadow-sm transition hover:shadow-md"
            style={{ borderLeft: `5px solid ${e.color}` }}
          >
            <span className="text-3xl" aria-hidden>
              {e.emoji}
            </span>
            <div className="flex-1">
              <p className="text-lg font-bold text-[#1A1A1A]" style={TITLE_FONT}>
                {e.label}
              </p>
              <p className="text-sm text-[#1A1A1A]/60">Appel direct · gratuit</p>
            </div>
            <span
              className="rounded-full px-4 py-2 text-lg font-bold text-white"
              style={{ backgroundColor: e.color }}
            >
              {e.num}
            </span>
          </a>
        ))}
      </div>

      {/* Consentement GPS */}
      <label className="flex cursor-pointer items-start gap-3 rounded-2xl bg-white p-4 shadow-sm">
        <input
          type="checkbox"
          checked={gpsConsent}
          onChange={(e) => setGpsConsent(e.target.checked)}
          className="mt-1 size-5 accent-[#E30613]"
        />
        <span className="text-sm text-[#1A1A1A]/80">
          <strong className="font-semibold">
            J&apos;autorise l&apos;envoi de ma position GPS aux secours.
          </strong>
          <br />
          <span className="text-xs text-[#1A1A1A]/50">
            Optionnel. Sans consentement, seul l&apos;appel vocal est transmis.
          </span>
        </span>
      </label>

      {/* === SOS SILENCIEUX — appui long 3 s === */}
      <div className="rounded-2xl bg-[#1A1A1A] p-4 text-white shadow-lg">
        <div className="mb-3 flex items-center gap-2">
          <Hand className="size-5 text-[#FFDD00]" />
          <h3 className="text-sm font-bold text-white" style={TITLE_FONT}>
            SOS silencieux
          </h3>
        </div>
        <p className="mb-3 text-xs leading-relaxed text-white/75">
          Maintenez <strong className="text-[#FFDD00]">3 secondes</strong> pour
          envoyer un SOS silencieux avec photo et audio aux secours. Aucun son
          n&apos;est émis — votre sécurité n&apos;est pas compromise.
        </p>

        {/* Bouton long-press avec cercle de progression SVG */}
        <div className="flex flex-col items-center gap-3">
          <button
            type="button"
            onPointerDown={startLongPress}
            onPointerUp={cancelLongPress}
            onPointerLeave={cancelLongPress}
            onPointerCancel={cancelLongPress}
            disabled={sosSending || sosSent}
            className="relative flex h-20 w-20 touch-none select-none items-center justify-center rounded-full bg-[#E30613] shadow-xl transition-transform active:scale-95 disabled:opacity-60"
            aria-label="Maintenir 3 secondes pour envoyer un SOS silencieux"
          >
            {/* Cercle de progression */}
            <svg
              className="absolute inset-0 -rotate-90"
              width="80"
              height="80"
              viewBox="0 0 80 80"
            >
              <circle
                cx="40"
                cy="40"
                r={radius}
                fill="none"
                stroke="rgba(255,255,255,0.15)"
                strokeWidth="4"
              />
              <circle
                cx="40"
                cy="40"
                r={radius}
                fill="none"
                stroke="#FFDD00"
                strokeWidth="4"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={dashOffset}
                style={{ transition: sosHolding ? 'none' : 'stroke-dashoffset 0.2s' }}
              />
            </svg>
            {sosSending ? (
              <Loader2 className="size-7 animate-spin text-white" />
            ) : sosSent ? (
              <Check className="size-8 text-white" />
            ) : (
              <span className="text-2xl">🤫</span>
            )}
          </button>

          {/* Texte sous le bouton */}
          {sosSending ? (
            <p className="flex items-center gap-1.5 text-xs font-semibold text-[#FFDD00]">
              <Camera className="size-3" />
              <Mic className="size-3" />
              Capture discrète en cours…
            </p>
          ) : sosSent ? (
            <p className="inline-flex items-center gap-1.5 rounded-full bg-[#00A651]/20 px-3 py-1 text-xs font-bold text-[#00A651]">
              <Check className="size-3" />
              SOS envoyé
            </p>
          ) : sosHolding ? (
            <p className="text-xs font-semibold text-[#FFDD00]">
              Maintenez… {Math.round(sosProgress)}%
            </p>
          ) : (
            <p className="text-xs text-white/60">
              Appui long requis (3 s)
            </p>
          )}
        </div>

        {/* Icônes discrètes : photo + audio */}
        <div className="mt-3 flex items-center justify-center gap-4 text-[10px] uppercase tracking-wider text-white/40">
          <span className="inline-flex items-center gap-1">
            <Camera className="size-3" /> Photo
          </span>
          <span className="inline-flex items-center gap-1">
            <Mic className="size-3" /> Audio 5 s
          </span>
          <span className="inline-flex items-center gap-1">
            <MapPin className="size-3" /> GPS
          </span>
        </div>
      </div>

      {/* Signaler une agression (silencieux) — version courte via /api/city/incidents */}
      <div className="rounded-2xl bg-[#E30613]/5 p-4">
        <div className="mb-3 flex items-center gap-2">
          <Shield className="size-5 text-[#E30613]" />
          <h3 className="text-sm font-bold text-[#E30613]" style={TITLE_FONT}>
            Signaler une agression
          </h3>
        </div>
        <p className="mb-3 text-xs text-[#1A1A1A]/60">
          Envoie un signalement silencieux à la Police avec votre plaque. Aucun
          appel n&apos;est passé — votre sécurité n&apos;est pas compromise.
        </p>
        <Button
          onClick={() =>
            onSubmit({
              type: 'emergency',
              category: 'sécurité',
              description: 'Agression signalée',
              confirmation: {
                emoji: '🆘',
                title: 'Urgence envoyée',
                service: 'Police alertée',
                gpsSent: false,
                timestamp: new Date().toISOString(),
              },
            })
          }
          disabled={submitting || gpsLoading}
          className="w-full rounded-xl bg-[#E30613] text-white hover:bg-[#c50511]"
        >
          {submitting ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <AlertTriangle className="size-4" />
          )}
          Signaler une agression
        </Button>
      </div>

      {gpsLoading && (
        <p className="flex items-center justify-center gap-2 text-xs text-[#1A1A1A]/50">
          <Loader2 className="size-3 animate-spin" />
          Acquisition du signal GPS…
        </p>
      )}
    </div>
  )
}

// ============================================================
// 2. SignalementView (orange) — 6 catégories + description + GPS
// ============================================================

function SignalementView({
  category,
  setCategory,
  description,
  setDescription,
  gpsConsent,
  setGpsConsent,
  gpsLoading,
  submitting,
  onSubmit,
}: {
  category: string | null
  setCategory: (v: string | null) => void
  description: string
  setDescription: (v: string) => void
  gpsConsent: boolean
  setGpsConsent: (v: boolean) => void
  gpsLoading: boolean
  submitting: boolean
  onSubmit: (payload: {
    type: string
    category?: string
    description?: string
    confirmation: Confirmation
  }) => void
}) {
  const selected = CATEGORIES.find((c) => c.id === category) ?? null

  const handleSubmit = () => {
    if (!selected) {
      return
    }
    onSubmit({
      type: 'report',
      category: selected.id,
      description: description.trim() || undefined,
      confirmation: {
        emoji: '🟠',
        title: 'Signalement transmis',
        service: `${selected.service} notifié`,
        gpsSent: false,
        timestamp: new Date().toISOString(),
      },
    })
  }

  return (
    <div className="space-y-5">
      {/* Sélection catégorie */}
      <div className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wide text-[#1A1A1A]/60">
          Type d&apos;incident
        </h2>
        <div className="grid grid-cols-2 gap-3">
          {CATEGORIES.map((cat) => {
            const active = category === cat.id
            const Icon = cat.Icon
            return (
              <button
                key={cat.id}
                onClick={() => setCategory(cat.id)}
                className={cn(
                  'relative rounded-2xl bg-white p-4 text-left shadow-sm transition-all',
                  active
                    ? 'ring-2 ring-[#FF6B00] ring-offset-2'
                    : 'hover:shadow-md',
                )}
                style={active ? { borderLeft: '4px solid #FF6B00' } : undefined}
              >
                {Icon && (
                  <Icon className="absolute right-3 top-3 size-3.5 text-[#1A1A1A]/25" />
                )}
                <span className="text-2xl" aria-hidden>
                  {cat.emoji}
                </span>
                <p className="mt-2 text-sm font-bold text-[#1A1A1A]" style={TITLE_FONT}>
                  {cat.label}
                </p>
                <p className="mt-0.5 text-xs text-[#1A1A1A]/55">{cat.hint}</p>
                <p className="mt-1.5 text-xs font-semibold text-[#FF6B00]">
                  → {cat.service}
                </p>
              </button>
            )
          })}
        </div>
      </div>

      {/* Description */}
      <div className="space-y-2">
        <h2 className="text-sm font-bold uppercase tracking-wide text-[#1A1A1A]/60">
          Description (optionnel)
        </h2>
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Décrivez le problème en quelques mots…"
          maxLength={500}
          className="min-h-24 rounded-xl bg-white"
        />
        <p className="text-right text-xs text-[#1A1A1A]/40">
          {description.length}/500
        </p>
      </div>

      {/* GPS optionnel */}
      <label className="flex cursor-pointer items-start gap-3 rounded-2xl bg-white p-4 shadow-sm">
        <input
          type="checkbox"
          checked={gpsConsent}
          onChange={(e) => setGpsConsent(e.target.checked)}
          className="mt-1 size-5 accent-[#FF6B00]"
        />
        <span className="text-sm text-[#1A1A1A]/80">
          <strong className="font-semibold">
            Joindre ma position GPS
          </strong>
          <br />
          <span className="text-xs text-[#1A1A1A]/50">
            Aide l&apos;équipe à localiser précisément l&apos;incident.
          </span>
        </span>
      </label>

      {/* Bouton envoyer */}
      <Button
        onClick={handleSubmit}
        disabled={!selected || submitting || gpsLoading}
        className="w-full rounded-xl bg-[#FF6B00] py-6 text-base text-white hover:bg-[#e55f00]"
      >
        {submitting ? (
          <Loader2 className="size-5 animate-spin" />
        ) : (
          <Send className="size-5" />
        )}
        {submitting ? 'Envoi en cours…' : 'ENVOYER LE SIGNALEMENT'}
      </Button>

      {selected && (
        <p className="text-center text-xs text-[#1A1A1A]/50">
          {selected.emoji} {selected.label} → routage automatique vers{' '}
          <strong className="font-semibold text-[#FF6B00]">
            {selected.service}
          </strong>
        </p>
      )}

      {gpsLoading && (
        <p className="flex items-center justify-center gap-2 text-xs text-[#1A1A1A]/50">
          <Loader2 className="size-3 animate-spin" />
          Acquisition GPS…
        </p>
      )}
    </div>
  )
}

// ============================================================
// 3. OrientationView (bleu) — transports, pharmacie, position
// ============================================================

function OrientationView({
  sharedPos,
  setSharedPos,
  posCopied,
  setPosCopied,
  submitting,
  onSubmit,
}: {
  sharedPos: { lat: number; lng: number } | null
  setSharedPos: (v: { lat: number; lng: number } | null) => void
  posCopied: boolean
  setPosCopied: (v: boolean) => void
  submitting: boolean
  onSubmit: (payload: {
    type: string
    confirmation: Confirmation
  }) => void
}) {
  const [locating, setLocating] = useState(false)

  const handleSharePos = async () => {
    setLocating(true)
    const pos = await captureGps()
    setLocating(false)
    if (pos) {
      setSharedPos(pos)
      // Tente de copier dans le presse-papier
      try {
        await navigator.clipboard.writeText(
          `${pos.lat.toFixed(6)}, ${pos.lng.toFixed(6)}`,
        )
        setPosCopied(true)
        setTimeout(() => setPosCopied(false), 2500)
      } catch {
        /* presse-papier indisponible */
      }
    }
  }

  return (
    <div className="space-y-5">
      {/* Transports */}
      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center gap-2">
          <Bus className="size-5 text-[#0066CC]" />
          <h2 className="text-sm font-bold text-[#1A1A1A]" style={TITLE_FONT}>
            🚌 Transports à proximité
          </h2>
        </div>
        <ul className="space-y-2">
          {TRANSPORTS_NEARBY.map((t) => (
            <li
              key={t.line}
              className="flex items-center justify-between rounded-xl bg-[#0066CC]/5 px-3 py-2"
            >
              <div>
                <p className="text-sm font-semibold text-[#1A1A1A]">{t.line}</p>
                <p className="text-xs text-[#1A1A1A]/55">{t.destination}</p>
              </div>
              <Badge className="bg-[#0066CC]/10 text-[#0066CC]">{t.next}</Badge>
            </li>
          ))}
        </ul>
      </section>

      {/* Partager ma position */}
      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center gap-2">
          <MapPin className="size-5 text-[#0066CC]" />
          <h2 className="text-sm font-bold text-[#1A1A1A]" style={TITLE_FONT}>
            📍 Partager ma position
          </h2>
        </div>
        <Button
          onClick={handleSharePos}
          disabled={locating}
          variant="outline"
          className="w-full rounded-xl border-[#0066CC]/30 py-5 text-[#0066CC]"
        >
          {locating ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Navigation className="size-4" />
          )}
          {locating ? 'Localisation…' : 'Obtenir mes coordonnées'}
        </Button>
        {sharedPos && (
          <div className="mt-3 rounded-xl bg-[#0066CC]/5 p-3">
            <p className="text-xs text-[#1A1A1A]/55">Vos coordonnées</p>
            <p className="mt-1 font-mono text-sm font-bold text-[#1A1A1A]">
              {sharedPos.lat.toFixed(6)}, {sharedPos.lng.toFixed(6)}
            </p>
            {posCopied && (
              <p className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-[#00A651]">
                <Check className="size-3" />
                Position copiée dans le presse-papier
              </p>
            )}
          </div>
        )}
      </section>

      {/* Demander une orientation */}
      <Button
        onClick={() =>
          onSubmit({
            type: 'orientation',
            confirmation: {
              emoji: '🔵',
              title: 'Demande envoyée',
              service: 'Aminata vous recontacte',
              gpsSent: false,
              timestamp: new Date().toISOString(),
            },
          })
        }
        disabled={submitting}
        className="w-full rounded-xl bg-[#0066CC] py-5 text-base text-white hover:bg-[#0055aa]"
      >
        {submitting ? (
          <Loader2 className="size-5 animate-spin" />
        ) : (
          <Send className="size-5" />
        )}
        Demander une orientation
      </Button>
    </div>
  )
}

// ============================================================
// 4. ArtisansView (vert) — annuaire étendu des commerces du quartier
//    Catégories, WhatsApp, cartes détaillées, premium (menu/tarifs),
//    sponsorisé, vérifié. Tri : sponsorisés en premier puis distance.
// ============================================================

function ArtisansView({
  businesses,
  loading,
  district,
  selectedCategory,
  onSelectCategory,
  onContact,
  plate,
}: {
  businesses: CityBusiness[]
  loading: boolean
  district: string | null
  selectedCategory: string
  onSelectCategory: (cat: string) => void
  onContact: (b: CityBusiness) => void
  plate: CityPlate
}) {
  const [showRegForm, setShowRegForm] = useState(false)

  // Tri : sponsorisés en premier, puis par distance croissante.
  const sorted = useMemo(() => {
    return [...businesses].sort((a, b) => {
      if (a.isSponsored && !b.isSponsored) return -1
      if (!a.isSponsored && b.isSponsored) return 1
      const da = a.distance ?? Number.MAX_SAFE_INTEGER
      const db = b.distance ?? Number.MAX_SAFE_INTEGER
      return da - db
    })
  }, [businesses])

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16">
        <Loader2 className="size-8 animate-spin text-[#00A651]" />
        <p className="text-sm text-[#1A1A1A]/55">
          Chargement des commerces du quartier…
        </p>
      </div>
    )
  }

  // Si le formulaire d'inscription est ouvert, on l'affiche à la place de la liste
  if (showRegForm) {
    return (
      <BusinessRegistrationForm
        plate={plate}
        onCancel={() => setShowRegForm(false)}
        onSuccess={() => setShowRegForm(false)}
      />
    )
  }

  return (
    <div className="space-y-4">
      {/* Bouton Inscrire ma boutique — self-service */}
      <button
        onClick={() => setShowRegForm(true)}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#00A651] p-4 text-white shadow-lg transition-all hover:-translate-y-0.5 hover:shadow-xl active:scale-[0.98]"
        style={{ borderRadius: '16px' }}
      >
        <Plus className="size-5" />
        <span className="text-sm font-bold uppercase tracking-wide" style={TITLE_FONT}>
          Inscrire ma boutique
        </span>
      </button>

      {/* Filtres catégories — chips horizontaux scrollables */}
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {BUSINESS_CATEGORIES.map((chip) => {
          const active = selectedCategory === chip.id
          const color = chip.color
          return (
            <button
              key={chip.id}
              onClick={() => onSelectCategory(chip.id)}
              className={cn(
                'shrink-0 rounded-full px-3 py-1.5 text-xs font-bold uppercase tracking-wide transition',
                active
                  ? 'text-white shadow'
                  : 'bg-white text-[#1A1A1A]/70 ring-1 ring-[#1A1A1A]/10 hover:ring-[#1A1A1A]/25',
              )}
              style={active ? { backgroundColor: color } : undefined}
            >
              {chip.label}
            </button>
          )
        })}
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold uppercase tracking-wide text-[#1A1A1A]/60">
          {sorted.length} commerce{sorted.length > 1 ? 's' : ''} à moins de 500m
        </h2>
        <Badge className="bg-[#00A651]/10 text-[#00A651]">
          <Check className="size-3" />
          Proches
        </Badge>
      </div>

      {sorted.length === 0 ? (
        <div className="rounded-2xl bg-white p-8 text-center shadow-sm">
          <Wrench className="mx-auto size-10 text-[#1A1A1A]/30" />
          <p className="mt-3 text-sm font-semibold text-[#1A1A1A]" style={TITLE_FONT}>
            Aucun commerce trouvé
          </p>
          <p className="mt-1 text-xs text-[#1A1A1A]/55">
            {district
              ? `Pour le quartier « ${district} ». Essayez une autre catégorie.`
              : 'Essayez une autre catégorie ou élargissez votre recherche.'}
          </p>
        </div>
      ) : (
        sorted.map((b) => (
          <BusinessCard
            key={b.id}
            business={b}
            onContact={onContact}
          />
        ))
      )}
    </div>
  )
}

// ============================================================
// BusinessRegistrationForm — formulaire self-service pour les artisans
// L'artisan remplit sa fiche (nom, catégorie, contact, photo, horaires,
// description) depuis le QR code de sa plaque. La fiche est soumise avec
// status=pending → la mairie la valide dans le dashboard.
// GPS auto-rempli depuis les coordonnées de la plaque.
// ============================================================

function BusinessRegistrationForm({
  plate,
  onCancel,
  onSuccess,
}: {
  plate: CityPlate
  onCancel: () => void
  onSuccess: () => void
}) {
  const { toast } = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Champs du formulaire
  const [name, setName] = useState('')
  const [category, setCategory] = useState('artisan')
  const [trade, setTrade] = useState('')
  const [phone, setPhone] = useState('')
  const [whatsapp, setWhatsapp] = useState('')
  const [address, setAddress] = useState(plate.address ?? '')
  const [hours, setHours] = useState('')
  const [description, setDescription] = useState('')
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [plan, setPlan] = useState<'standard' | 'premium'>('standard')
  const [pricing, setPricing] = useState<{
    menu: { label: string; price: number; period: string; description: string }
    priceGrid: { label: string; price: number; period: string; description: string }
    sponsored: { label: string; price: number; period: string; description: string }
  } | null>(null)

  // Fetch les tarifs premium définis par la mairie
  useEffect(() => {
    fetch('/api/city/pricing')
      .then((r) => r.json())
      .then((d) => {
        if (d?.ok && d.data?.tiers) setPricing(d.data.tiers)
      })
      .catch(() => {})
  }, [])

  // Catégories disponibles (doit correspondre à BUSINESS_CATEGORIES)
  const CATS = [
    { id: 'artisan', label: 'Artisan (plombier, électricien…)' },
    { id: 'commerce', label: 'Commerce (boutique, alimentation…)' },
    { id: 'restaurant', label: 'Restaurant / Restauration' },
    { id: 'coiffure', label: 'Coiffure / Beauté' },
    { id: 'mecanicien', label: 'Mécanicien / Auto' },
    { id: 'telephonie', label: 'Téléphonie / Électronique' },
    { id: 'nettoyage', label: 'Nettoyage / Pressing' },
  ]

  // Capture photo — resize 800px max, JPEG 0.7 quality (même pattern que TaxFraudView)
  const handlePhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        const maxDim = 800
        const ratio = Math.min(maxDim / img.width, maxDim / img.height, 1)
        canvas.width = Math.round(img.width * ratio)
        canvas.height = Math.round(img.height * ratio)
        const ctx = canvas.getContext('2d')
        if (ctx) {
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
          setPhotoUrl(canvas.toDataURL('image/jpeg', 0.7))
        }
      }
      img.src = reader.result as string
    }
    reader.readAsDataURL(file)
  }

  // Soumission → POST /api/city/businesses
  const handleSubmit = async () => {
    if (name.trim().length < 2) {
      toast({ title: 'Nom requis', description: 'Indiquez le nom de votre boutique.' })
      return
    }
    if (trade.trim().length < 2) {
      toast({ title: 'Activité requise', description: 'Indiquez votre activité (ex: Plombier).' })
      return
    }
    if (phone.trim().length < 6) {
      toast({ title: 'Téléphone requis', description: 'Indiquez un numéro de téléphone.' })
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/city/businesses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          category,
          trade: trade.trim(),
          phone: phone.trim(),
          whatsapp: whatsapp.trim() || null,
          district: plate.district ?? null,
          address: address.trim() || null,
          lat: plate.lat ?? null,
          lng: plate.lng ?? null,
          photoUrl: photoUrl ?? null,
          hours: hours.trim() || null,
          description: plan === 'premium'
            ? `${description.trim() ? description.trim() + ' — ' : ''}[Plan demandé: Premium — Paiement à la mairie]`
            : (description.trim() || null),
        }),
      })
      const json = await res.json()
      if (json?.ok) {
        setSubmitted(true)
        try { parler('Votre demande a été envoyée. La mairie validera votre fiche.') } catch {}
      } else {
        toast({ title: 'Erreur', description: json?.error || 'Inscription impossible.' })
      }
    } catch {
      toast({ title: 'Erreur réseau', description: 'Vérifiez votre connexion.' })
    } finally {
      setSubmitting(false)
    }
  }

  // Écran de confirmation après soumission
  if (submitted) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-6 text-center">
        <div className="flex size-20 items-center justify-center rounded-full bg-[#00A651] shadow-lg">
          <Check className="size-10 text-white" />
        </div>
        <h2 className="mt-5 text-xl font-bold text-[#1A1A1A]" style={TITLE_FONT}>
          Demande envoyée !
        </h2>
        <p className="mt-2 text-sm text-[#1A1A1A]/70">
          Votre fiche « {name.trim()} » a été soumise à la mairie.
          Elle apparaîtra dans l&apos;annuaire après validation
          (généralement sous 48h).
        </p>
        <div className="mt-4 rounded-xl bg-[#00A651]/5 p-3 text-xs text-[#1A1A1A]/60">
          <p>📍 Plaque : #{plate.plateNumber} · {plate.district ?? 'Dakar'}</p>
          <p className="mt-1">🏷️ Catégorie : {CATS.find(c => c.id === category)?.label}</p>
          <p className="mt-1">📊 Statut : En attente de validation</p>
        </div>
        <Button
          onClick={onSuccess}
          className="mt-6 w-full rounded-xl bg-[#00A651] py-4 text-white hover:bg-[#009444]"
        >
          Retour à l&apos;annuaire
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header avec retour */}
      <div className="flex items-center gap-3">
        <button
          onClick={onCancel}
          className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white text-[#1A1A1A] shadow-sm"
        >
          <ArrowLeft className="size-5" />
        </button>
        <div>
          <h2 className="text-lg font-bold text-[#1A1A1A]" style={TITLE_FONT}>
            Inscrire ma boutique
          </h2>
          <p className="text-xs text-[#1A1A1A]/55">
            Plaque #{plate.plateNumber} · {plate.district ?? 'Dakar'}
          </p>
        </div>
      </div>

      {/* === Sélecteur de version : Standard (gratuit) ou Premium (payant) === */}
      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <label className="text-sm font-bold text-[#1A1A1A]" style={TITLE_FONT}>
          Choisissez votre formule
        </label>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {/* Standard */}
          <button
            type="button"
            onClick={() => setPlan('standard')}
            className={cn(
              'rounded-xl border-2 p-4 text-left transition-all',
              plan === 'standard'
                ? 'border-[#00A651] bg-[#00A651]/5 ring-2 ring-[#00A651]/20'
                : 'border-[#d5d3d4] bg-white',
            )}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-[#00A651]">Standard</span>
              <span className="rounded-full bg-[#00A651] px-2 py-0.5 text-[10px] font-bold uppercase text-white">
                Gratuit
              </span>
            </div>
            <p className="mt-2 text-xs text-[#1A1A1A]/60">
              Fiche de base : nom, catégorie, téléphone, adresse, horaires, description, photo. Visible par tous les citoyens après validation de la mairie.
            </p>
          </button>

          {/* Premium */}
          <button
            type="button"
            onClick={() => setPlan('premium')}
            className={cn(
              'rounded-xl border-2 p-4 text-left transition-all',
              plan === 'premium'
                ? 'border-[#C9A961] bg-[#C9A961]/5 ring-2 ring-[#C9A961]/20'
                : 'border-[#d5d3d4] bg-white',
            )}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-[#C9A961]">Premium</span>
              <span className="rounded-full bg-[#C9A961] px-2 py-0.5 text-[10px] font-bold uppercase text-white">
                Payant
              </span>
            </div>
            <p className="mt-2 text-xs text-[#1A1A1A]/60">
              Tout ce qui est Standard + Menu & Commande WhatsApp, Grille Tarifaire, Annonce sponsorisée. Paiement à la mairie.
            </p>
          </button>
        </div>
      </div>

      {/* === Détail des tarifs Premium (si Premium sélectionné) === */}
      {plan === 'premium' && pricing && (
        <div className="space-y-3">
          <div className="rounded-2xl bg-[#C9A961]/5 p-4">
            <h3 className="text-sm font-bold text-[#C9A961]" style={TITLE_FONT}>
              Options Premium — Tarifs
            </h3>
            <div className="mt-3 space-y-2">
              {/* Menu */}
              <div className="flex items-center justify-between rounded-xl bg-white p-3 shadow-sm">
                <div>
                  <p className="text-sm font-bold text-[#1A1A1A]">{pricing.menu.label}</p>
                  <p className="text-xs text-[#1A1A1A]/55">{pricing.menu.description}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-lg font-bold text-[#C9A961]">{pricing.menu.price.toLocaleString('fr-FR')}</p>
                  <p className="text-[10px] text-[#1A1A1A]/50">FCFA / {pricing.menu.period}</p>
                </div>
              </div>
              {/* Grille tarifaire */}
              <div className="flex items-center justify-between rounded-xl bg-white p-3 shadow-sm">
                <div>
                  <p className="text-sm font-bold text-[#1A1A1A]">{pricing.priceGrid.label}</p>
                  <p className="text-xs text-[#1A1A1A]/55">{pricing.priceGrid.description}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-lg font-bold text-[#C9A961]">{pricing.priceGrid.price.toLocaleString('fr-FR')}</p>
                  <p className="text-[10px] text-[#1A1A1A]/50">FCFA / {pricing.priceGrid.period}</p>
                </div>
              </div>
              {/* Sponsorisé */}
              <div className="flex items-center justify-between rounded-xl bg-white p-3 shadow-sm">
                <div>
                  <p className="text-sm font-bold text-[#1A1A1A]">{pricing.sponsored.label}</p>
                  <p className="text-xs text-[#1A1A1A]/55">{pricing.sponsored.description}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-lg font-bold text-[#C9A961]">{pricing.sponsored.price.toLocaleString('fr-FR')}</p>
                  <p className="text-[10px] text-[#1A1A1A]/50">FCFA / {pricing.sponsored.period}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Bouton Paiement en mairie */}
          <div className="rounded-2xl bg-[#1A1A1A] p-4 text-center text-white">
            <p className="text-sm font-bold text-[#FFD700]" style={TITLE_FONT}>
              Paiement en mairie
            </p>
            <p className="mt-1 text-xs text-white/70">
              Pour activer le Premium, rendez-vous à la mairie de Dakar avec votre paiement
              (espèces, Wave, Orange Money). La mairie activera vos options Premium après réception du paiement.
            </p>
            <div className="mt-3 flex items-center justify-center gap-2 rounded-xl bg-white/10 px-4 py-2">
              <MapPin className="size-4 text-[#FFD700]" />
              <span className="text-xs font-semibold text-white">Mairie de Dakar — Plateau</span>
            </div>
          </div>
        </div>
      )}

      {/* Photo de la vitrine */}
      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <label className="text-sm font-bold text-[#1A1A1A]" style={TITLE_FONT}>
          Photo de la vitrine / atelier
        </label>
        <p className="mt-0.5 text-xs text-[#1A1A1A]/50">Optionnel — rend votre fiche plus attractive</p>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handlePhoto}
          className="hidden"
        />
        {photoUrl ? (
          <div className="mt-3 space-y-2">
            <img
              src={photoUrl}
              alt="Vitrine"
              className="h-40 w-full rounded-xl object-cover"
            />
            <button
              onClick={() => setPhotoUrl(null)}
              className="text-xs font-medium text-[#E30613] hover:underline"
            >
              Supprimer la photo
            </button>
          </div>
        ) : (
          <button
            onClick={() => fileInputRef.current?.click()}
            className="mt-3 flex h-32 w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[#00A651]/30 bg-[#00A651]/5 text-[#00A651]"
          >
            <Camera className="size-8" />
            <span className="text-xs font-bold uppercase tracking-wide">Prendre une photo</span>
          </button>
        )}
      </div>

      {/* Nom de la boutique */}
      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <label className="text-sm font-bold text-[#1A1A1A]" style={TITLE_FONT}>
          Nom de la boutique *
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ex : Boutique Téranga, Plomberie Diop…"
          maxLength={80}
          className="mt-2 w-full rounded-xl border-2 border-[#d5d3d4] px-3 py-2.5 text-sm focus:border-[#00A651] focus:outline-none"
        />
      </div>

      {/* Catégorie + Activité */}
      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <label className="text-sm font-bold text-[#1A1A1A]" style={TITLE_FONT}>
          Catégorie *
        </label>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="mt-2 w-full rounded-xl border-2 border-[#d5d3d4] px-3 py-2.5 text-sm focus:border-[#00A651] focus:outline-none"
        >
          {CATS.map((c) => (
            <option key={c.id} value={c.id}>{c.label}</option>
          ))}
        </select>
        <label className="mt-3 block text-sm font-bold text-[#1A1A1A]" style={TITLE_FONT}>
          Activité / Spécialité *
        </label>
        <input
          type="text"
          value={trade}
          onChange={(e) => setTrade(e.target.value)}
          placeholder="Ex : Plombier, Coiffeur, Restaurant sénégalais…"
          maxLength={60}
          className="mt-2 w-full rounded-xl border-2 border-[#d5d3d4] px-3 py-2.5 text-sm focus:border-[#00A651] focus:outline-none"
        />
      </div>

      {/* Téléphone + WhatsApp */}
      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <label className="text-sm font-bold text-[#1A1A1A]" style={TITLE_FONT}>
          Téléphone *
        </label>
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="Ex : 77 123 45 67"
          maxLength={20}
          className="mt-2 w-full rounded-xl border-2 border-[#d5d3d4] px-3 py-2.5 text-sm focus:border-[#00A651] focus:outline-none"
        />
        <label className="mt-3 block text-sm font-bold text-[#1A1A1A]" style={TITLE_FONT}>
          WhatsApp (optionnel)
        </label>
        <input
          type="tel"
          value={whatsapp}
          onChange={(e) => setWhatsapp(e.target.value)}
          placeholder="Ex : 221771234567"
          maxLength={20}
          className="mt-2 w-full rounded-xl border-2 border-[#d5d3d4] px-3 py-2.5 text-sm focus:border-[#00A651] focus:outline-none"
        />
      </div>

      {/* Adresse + Horaires */}
      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <label className="text-sm font-bold text-[#1A1A1A]" style={TITLE_FONT}>
          Adresse
        </label>
        <input
          type="text"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="Ex : Rue Mohamed V, Dakar"
          maxLength={200}
          className="mt-2 w-full rounded-xl border-2 border-[#d5d3d4] px-3 py-2.5 text-sm focus:border-[#00A651] focus:outline-none"
        />
        <label className="mt-3 block text-sm font-bold text-[#1A1A1A]" style={TITLE_FONT}>
          Horaires d&apos;ouverture
        </label>
        <input
          type="text"
          value={hours}
          onChange={(e) => setHours(e.target.value)}
          placeholder="Ex : Lun-Ven 8h-18h, Sam 8h-12h"
          maxLength={100}
          className="mt-2 w-full rounded-xl border-2 border-[#d5d3d4] px-3 py-2.5 text-sm focus:border-[#00A651] focus:outline-none"
        />
      </div>

      {/* Description */}
      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <label className="text-sm font-bold text-[#1A1A1A]" style={TITLE_FONT}>
          Description
        </label>
        <p className="mt-0.5 text-xs text-[#1A1A1A]/50">
          Décrivez vos services, produits ou spécialités
        </p>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Ex : Plombier-chauffagiste depuis 15 ans. Dépannage urgent, installation sanitaire, chauffe-eau…"
          maxLength={500}
          rows={3}
          className="mt-2 w-full rounded-xl border-2 border-[#d5d3d4] px-3 py-2.5 text-sm focus:border-[#00A651] focus:outline-none"
        />
        <p className="mt-1 text-right text-[10px] text-[#1A1A1A]/40">
          {description.length}/500
        </p>
      </div>

      {/* Info GPS auto */}
      <div className="rounded-xl bg-[#00A651]/5 p-3 text-xs text-[#1A1A1A]/60">
        <p className="flex items-center gap-1.5">
          <MapPin className="size-3" />
          Position GPS automatiquement liée à la plaque #{plate.plateNumber}
          {plate.lat != null && plate.lng != null && ' (précise)'}
        </p>
      </div>

      {/* Bouton soumettre */}
      <Button
        onClick={handleSubmit}
        disabled={submitting}
        className="w-full rounded-2xl bg-[#00A651] py-4 text-base font-bold text-white hover:bg-[#009444] disabled:opacity-50"
      >
        {submitting ? (
          <Loader2 className="size-5 animate-spin" />
        ) : (
          <Send className="size-5" />
        )}
        {submitting ? 'Envoi en cours…' : 'Envoyer ma demande'}
      </Button>

      <p className="text-center text-xs text-[#1A1A1A]/40">
        Votre fiche sera visible après validation de la mairie (sous 48h).
      </p>
    </div>
  )
}

// ============================================================
// BusinessCard — carte individuelle d'un commerce
// ============================================================

function BusinessCard({
  business,
  onContact,
}: {
  business: CityBusiness
  onContact: (b: CityBusiness) => void
}) {
  const color = businessCategoryColor(business.category)

  // Parse le menu JSON (premium restaurants) — [{name, price}]
  const menuItems = useMemo<Array<{ name: string; price: string }> | null>(() => {
    if (!business.menu) return null
    try {
      const parsed = JSON.parse(business.menu)
      if (Array.isArray(parsed)) {
        return parsed
          .filter((it: unknown): it is { name: string; price: string } =>
            typeof it === 'object' && it !== null && 'name' in it && 'price' in it,
          )
          .slice(0, 3)
      }
    } catch {
      /* ignore */
    }
    return null
  }, [business.menu])

  // Parse la grille tarifaire (premium artisans) — [{service, price}]
  const priceGridItems = useMemo<Array<{ service: string; price: string }> | null>(() => {
    if (!business.priceGrid) return null
    try {
      const parsed = JSON.parse(business.priceGrid)
      if (Array.isArray(parsed)) {
        return parsed
          .filter((it: unknown): it is { service: string; price: string } =>
            typeof it === 'object' && it !== null && 'service' in it && 'price' in it,
          )
          .slice(0, 3)
      }
    } catch {
      /* ignore */
    }
    return null
  }, [business.priceGrid])

  /** Construit une URL WhatsApp pré-remplie pour commander. */
  const buildWhatsAppOrderUrl = (): string | null => {
    if (!business.whatsapp) return null
    let msg = `Bonjour ${business.name}, je souhaite commander : `
    if (menuItems && menuItems.length > 0) {
      msg += menuItems.map((m) => `${m.name} (${m.price})`).join(', ')
    } else {
      msg += '(précisez votre commande)'
    }
    return `https://wa.me/${business.whatsapp.replace(/[^\d]/g, '')}?text=${encodeURIComponent(msg)}`
  }

  const orderUrl = buildWhatsAppOrderUrl()
  const isRestaurantWithMenu =
    business.isPremium &&
    business.category === 'Restaurant' &&
    !!menuItems &&
    menuItems.length > 0

  return (
    <article
      className="relative rounded-2xl bg-white p-4 shadow-sm"
      style={{ borderLeft: `4px solid ${color}` }}
    >
      {/* Badge Sponsorisé (or) */}
      {business.isSponsored && (
        <span className="absolute -top-2 right-3 inline-flex items-center gap-1 rounded-full bg-[#C9A961] px-2 py-0.5 text-[10px] font-bold uppercase text-white shadow">
          <Sparkles className="size-2.5" />
          Sponsorisé
        </span>
      )}

      <div className="flex items-start gap-3">
        {/* Photo thumbnail */}
        {business.photoUrl && (
          <img
            src={business.photoUrl}
            alt={business.name}
            className="size-16 shrink-0 rounded-xl object-cover"
            loading="lazy"
          />
        )}

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <h3 className="text-base font-bold text-[#1A1A1A]" style={TITLE_FONT}>
              {business.name}
            </h3>
            {business.verified && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-[#0066CC]/10 px-1.5 py-0.5 text-[10px] font-bold text-[#0066CC]">
                <BadgeCheck className="size-3" />
                Vérifié
              </span>
            )}
            {business.isPremium && (
              <Badge className="bg-[#C9A961]/15 text-[#C9A961]">
                <Star className="size-3 fill-[#C9A961]" />
                Premium
              </Badge>
            )}
          </div>
          <p className="mt-0.5 text-sm text-[#1A1A1A]/65">{business.trade}</p>

          {/* Badge catégorie coloré */}
          <span
            className="mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
            style={{ backgroundColor: `${color}20`, color }}
          >
            {business.category}
          </span>

          {/* Métadonnées : distance + heures */}
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-[#1A1A1A]/55">
            {business.distance != null && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-3" />
                {Math.round(business.distance)} m
              </span>
            )}
            {business.hours && (
              <span className="inline-flex items-center gap-1">
                <Clock className="size-3" />
                {business.hours}
              </span>
            )}
            {typeof business.rating === 'number' && business.rating > 0 && (
              <span className="inline-flex items-center gap-1 font-semibold text-[#C9A961]">
                <Star className="size-3 fill-[#C9A961]" />
                {business.rating.toFixed(1)}
                {typeof business.reviewCount === 'number' && (
                  <span className="font-normal text-[#1A1A1A]/40">
                    ({business.reviewCount})
                  </span>
                )}
              </span>
            )}
          </div>

          {/* Description tronquée */}
          {business.description && (
            <p className="mt-2 line-clamp-2 text-xs text-[#1A1A1A]/65">
              {business.description}
            </p>
          )}
        </div>
      </div>

      {/* Offre sponsorisée */}
      {business.isSponsored && business.sponsoredOffer && (
        <div className="mt-3 rounded-xl bg-[#C9A961]/10 px-3 py-2">
          <p className="text-xs font-bold text-[#C9A961]">Offre sponsorisée</p>
          <p className="text-xs text-[#1A1A1A]/70">{business.sponsoredOffer}</p>
        </div>
      )}

      {/* Menu (premium restaurant) */}
      {business.isPremium && menuItems && menuItems.length > 0 && (
        <div className="mt-3 rounded-xl bg-[#FF6B00]/5 px-3 py-2">
          <p className="text-xs font-bold text-[#FF6B00]">Menu</p>
          <ul className="mt-1 space-y-1">
            {menuItems.map((item, idx) => (
              <li key={idx} className="flex items-center justify-between text-xs">
                <span className="text-[#1A1A1A]/80">{item.name}</span>
                <span className="font-bold text-[#1A1A1A]">{item.price}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Grille tarifaire (premium artisan) */}
      {business.isPremium && priceGridItems && priceGridItems.length > 0 && (
        <div className="mt-2 rounded-xl bg-[#00A651]/5 px-3 py-2">
          <p className="text-xs font-bold text-[#00A651]">Tarifs</p>
          <ul className="mt-1 space-y-1">
            {priceGridItems.map((item, idx) => (
              <li key={idx} className="flex items-center justify-between text-xs">
                <span className="text-[#1A1A1A]/80">{item.service}</span>
                <span className="font-bold text-[#1A1A1A]">{item.price}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Boutons d'action */}
      <div className="mt-3 flex flex-wrap gap-2">
        <a
          href={`tel:${business.phone}`}
          onClick={() => onContact(business)}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#00A651] py-2.5 text-sm font-bold text-white transition hover:bg-[#008a44]"
        >
          <Phone className="size-4" />
          Appeler
        </a>
        {business.whatsapp && (
          <a
            href={`https://wa.me/${business.whatsapp.replace(/[^\d]/g, '')}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => onContact(business)}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#25D366] py-2.5 text-sm font-bold text-white transition hover:bg-[#1da851]"
          >
            <MessageCircle className="size-4" />
            WhatsApp
          </a>
        )}
        {isRestaurantWithMenu && orderUrl && (
          <a
            href={orderUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => onContact(business)}
            className="flex items-center justify-center gap-1.5 rounded-xl border border-[#FF6B00]/40 px-4 py-2.5 text-sm font-bold text-[#FF6B00] transition hover:bg-[#FF6B00]/5"
          >
            <Send className="size-4" />
            Commander
          </a>
        )}
      </div>
    </article>
  )
}

// ============================================================
// 5. MairieView (violet) — contenu dynamique selon l'heure
// ============================================================

function MairieView({ currentHour, plate }: { currentHour: number; plate: CityPlate }) {
  const greeting = getMairieGreeting(currentHour)
  const [selectedMotif, setSelectedMotif] = useState<string | null>(null)

  // Routage automatique : on affiche UNIQUEMENT le chef de quartier
  // correspondant au district de la plaque scannée. Pas de liste de 20 noms.
  const chef = (plate.district && CHEFS_QUARTIER[plate.district]) || CHEF_QUARTIER_DEFAUT
  const zoneLabel = plate.district
    ? `${plate.district} / Plaque #${plate.plateNumber}`
    : `Plaque #${plate.plateNumber}`

  // Construit le message WhatsApp pré-rempli selon le motif choisi.
  const buildWhatsAppUrl = (motifLabel: string, motifDesc: string) => {
    const msg = `Bonjour, je vous contacte depuis la zone ${zoneLabel} concernant : ${motifLabel}. ${motifDesc}`
    return `https://wa.me/${chef.whatsapp}?text=${encodeURIComponent(msg)}`
  }

  return (
    <div className="space-y-5">
      {/* Message dynamique */}
      <section
        className="rounded-2xl p-5 text-white shadow-sm"
        style={{
          background: `linear-gradient(135deg, ${COLORS.purple} 0%, #5a3d82 100%)`,
        }}
      >
        <div className="mb-2 flex items-center gap-2">
          <Building2 className="size-5 text-white/80" />
          <span className="text-xs font-bold uppercase tracking-wide text-white/70">
            Mairie de Dakar
          </span>
        </div>
        <h2 className="text-xl font-bold text-white" style={TITLE_FONT}>
          {greeting.title}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-white/85">
          {greeting.detail}
        </p>
        <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold">
          <span
            className={cn(
              'size-2 rounded-full',
              greeting.isOpen ? 'bg-[#00A651]' : 'bg-[#E30613]',
            )}
          />
          {greeting.isOpen ? 'Mairie ouverte' : 'Mairie fermée'}
        </div>
      </section>

      {/* Services municipaux */}
      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-bold text-[#1A1A1A]" style={TITLE_FONT}>
          Services municipaux
        </h2>
        <ul className="space-y-2">
          {MAIRIE_SERVICES.map((s) => (
            <li
              key={s.label}
              className="flex items-center justify-between rounded-xl bg-[#6B4C9A]/5 px-3 py-2.5"
            >
              <span className="text-sm font-medium text-[#1A1A1A]">{s.label}</span>
              <a
                href={`tel:${s.phone}`}
                className="inline-flex items-center gap-1.5 rounded-full bg-[#6B4C9A] px-3 py-1.5 text-xs font-bold text-white transition hover:bg-[#5a3d82]"
              >
                <Phone className="size-3" />
                Appeler
              </a>
            </li>
          ))}
        </ul>
      </section>

      {/* === Contacter le Chef de Quartier — routage automatique === */}
      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center gap-2">
          <User className="size-4 text-[#6B4C9A]" />
          <h2 className="text-sm font-bold text-[#1A1A1A]" style={TITLE_FONT}>
            Contacter le Chef de Quartier
          </h2>
        </div>

        {/* Carte du chef — automatiquement routé selon la plaque */}
        <div className="mb-4 rounded-xl border-2 border-[#6B4C9A]/15 bg-[#6B4C9A]/5 p-3">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-bold text-[#1A1A1A]">{chef.name}</p>
              <p className="text-xs text-[#6B4C9A]">{chef.role}</p>
              <p className="mt-1 flex items-center gap-1 text-xs text-[#1A1A1A]/50">
                <MapPin className="size-3" />
                Zone : {zoneLabel}
              </p>
              <p className="mt-0.5 flex items-center gap-1 text-xs text-[#1A1A1A]/50">
                <Clock className="size-3" />
                {chef.hours}
              </p>
            </div>
            <a
              href={`tel:${chef.phone}`}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[#6B4C9A] px-3 py-1.5 text-xs font-bold text-white transition hover:bg-[#5a3d82]"
            >
              <Phone className="size-3" />
              Appel
            </a>
          </div>
        </div>

        {/* 3 motifs rapides — avant d'ouvrir WhatsApp */}
        <p className="mb-2 text-xs font-semibold text-[#1A1A1A]/60">
          Sélectionnez un motif pour envoyer un message WhatsApp pré-rempli :
        </p>
        <div className="space-y-2">
          {MOTIFS_CHEF_QUARTIER.map((motif) => {
            const isSelected = selectedMotif === motif.id
            return (
              <a
                key={motif.id}
                href={buildWhatsAppUrl(motif.label, motif.desc)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setSelectedMotif(motif.id)}
                className={cn(
                  'flex items-center gap-3 rounded-xl border-2 p-3 transition-all hover:scale-[1.02]',
                  isSelected
                    ? 'border-[#25D366] bg-[#25D366]/5'
                    : 'border-[#d5d3d4] bg-white hover:border-[#25D366]/40',
                )}
              >
                <span className="text-2xl" aria-hidden>{motif.emoji}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-[#1A1A1A]">{motif.label}</p>
                  <p className="text-xs leading-snug text-[#1A1A1A]/55">{motif.desc}</p>
                </div>
                <MessageCircle className="size-5 shrink-0 text-[#25D366]" />
              </a>
            )
          })}
        </div>
      </section>

      {/* === Rendez-vous avec le Maire === */}
      <section className="rounded-2xl bg-gradient-to-br from-[#6B4C9A] to-[#5a3d82] p-4 text-white shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-white/15">
            <Calendar className="size-6 text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-bold text-white" style={TITLE_FONT}>
              Rendez-vous avec le Maire
            </h2>
            <p className="mt-0.5 text-xs text-white/75">
              Demandez un créneau auprès du secrétariat du Maire.
            </p>
          </div>
        </div>
        <a
          href={`tel:${chef.phone}`}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-bold text-[#6B4C9A] transition hover:bg-white/90"
        >
          <Phone className="size-4" />
          Demander un créneau
        </a>
      </section>

      {/* Annonces municipales (mock) */}
      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-bold text-[#1A1A1A]" style={TITLE_FONT}>
          📢 Annonces municipales
        </h2>
        <div className="space-y-2">
          <div className="rounded-xl bg-[#FF6B00]/5 p-3">
            <p className="text-xs font-semibold text-[#FF6B00]">
              Collecte des déchets
            </p>
            <p className="mt-1 text-xs text-[#1A1A1A]/65">
              Ramassage exceptionnel mardi soir. Sortez vos bacs avant 19h.
            </p>
          </div>
          <div className="rounded-xl bg-[#0066CC]/5 p-3">
            <p className="text-xs font-semibold text-[#0066CC]">
              Marché de quartier
            </p>
            <p className="mt-1 text-xs text-[#1A1A1A]/65">
              Samedi 8h–14h · Place de l&apos;Indépendance. Artisans locaux.
            </p>
          </div>
        </div>
      </section>
    </div>
  )
}

// ============================================================
// ConfirmationView (shared) — après toute action
// ============================================================

// Construit la phrase vocale qu'Aminata prononce pour confirmer
// l'envoi d'une demande. Le message s'adapte au module (urgence,
// signalement, radar taxes) et au service notifié (Police, Senelec,
// ONAS, Mairie…), ainsi qu'à la transmission GPS.
function buildAminataConfirmation(c: Confirmation): string {
  // Cas Radar Taxes — récompense citoyenne
  if (c.service && c.service.toLowerCase().includes('récompense')) {
    return `Signalement envoyé avec succès. ${c.service}. Merci pour votre contribution citoyenne.`
  }
  // Cas standard — on annonce le titre + le service notifié
  const base = c.title || 'Votre demande a bien été envoyée.'
  if (c.service) {
    // Le champ service contient parfois un séparateur "·" (ex: "Police alerté · GPS transmis")
    // — on le remplace par une virgule pour une lecture plus naturelle.
    const servicePhrase = c.service.replace(/\s*·\s*/g, ', ')
    return `${base}. ${servicePhrase}.`
  }
  return `${base}.`
}

function ConfirmationView({
  confirmation,
  plateNumber,
  onBack,
}: {
  confirmation: Confirmation
  plateNumber: string
  onBack: () => void
}) {
  // NOTE — La voix de confirmation est désormais déclenchée DANS le
  // geste utilisateur (clic sur le bouton d'envoi), voir
  // handleSubmitIncident et TaxFraudView.handleSubmit. On ne parle
  // PAS ici car cet effet s'exécute après un await fetch() — hors
  // geste utilisateur — ce que iOS Safari et Chrome mobile ignorent
  // silencieusement. Le message détaillé (avec GPS éventuel) reste
  // affiché à l'écran.
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 py-10 text-center">
      {/* Emoji géant */}
      <div
        className="flex size-28 items-center justify-center rounded-full bg-white shadow-lg"
        aria-hidden
      >
        <span className="text-5xl">{confirmation.emoji}</span>
      </div>

      {/* Titre */}
      <h1
        className="mt-6 text-2xl font-bold text-[#1A1A1A]"
        style={TITLE_FONT}
      >
        {confirmation.title}
      </h1>

      {/* Service notifié */}
      <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 shadow-sm">
        <Check className="size-4 text-[#00A651]" />
        <span className="text-sm font-semibold text-[#1A1A1A]">
          {confirmation.service}
        </span>
      </div>

      {confirmation.gpsSent && (
        <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-[#0066CC]">
          <MapPin className="size-3.5" />
          Position GPS transmise aux secours
        </p>
      )}

      {/* Métadonnées */}
      <div className="mt-6 w-full rounded-2xl bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between text-xs">
          <span className="text-[#1A1A1A]/50">Plaque</span>
          <span className="font-mono font-bold text-[#1A1A1A]">{plateNumber}</span>
        </div>
        <div className="mt-2 flex items-center justify-between text-xs">
          <span className="text-[#1A1A1A]/50">Heure</span>
          <span className="font-mono font-bold text-[#1A1A1A]">
            {formatHeure(confirmation.timestamp)} ·{' '}
            {relTime(confirmation.timestamp)}
          </span>
        </div>
      </div>

      {/* Bouton retour */}
      <Button
        onClick={onBack}
        className="mt-8 w-full rounded-xl bg-[#1A1A1A] py-5 text-base text-white hover:bg-[#333]"
      >
        <ArrowLeft className="size-4" />
        Faire une autre demande
      </Button>
    </div>
  )
}

// ============================================================
// TaxFraudView — Module 🚨 Radar Taxes & Dépôts
// ============================================================

function TaxFraudView({
  plate,
  gpsConsent,
  setGpsConsent,
  gpsLoading,
  setGpsLoading,
  submitting,
  setSubmitting,
  onSubmitSuccess,
}: {
  plate: CityPlate
  gpsConsent: boolean
  setGpsConsent: (v: boolean) => void
  gpsLoading: boolean
  setGpsLoading: (v: boolean) => void
  submitting: boolean
  setSubmitting: (v: boolean) => void
  onSubmitSuccess: (data: { gpsLat?: number; gpsLng?: number; reward?: { amount: number } }) => void
}) {
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null)
  const [vehiclePlate, setVehiclePlate] = useState('')
  const [description, setDescription] = useState('')
  const [citizenPhone, setCitizenPhone] = useState('')
  const [gpsLat, setGpsLat] = useState<number | null>(null)
  const [gpsLng, setGpsLng] = useState<number | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handlePhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      // Resize image to max 800px to keep dataURL manageable
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        const maxDim = 800
        const ratio = Math.min(maxDim / img.width, maxDim / img.height, 1)
        canvas.width = Math.round(img.width * ratio)
        canvas.height = Math.round(img.height * ratio)
        const ctx = canvas.getContext('2d')
        if (ctx) {
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
          setPhotoDataUrl(canvas.toDataURL('image/jpeg', 0.7))
        }
      }
      img.src = reader.result as string
    }
    reader.readAsDataURL(file)
  }

  const handleCaptureGps = () => {
    setGpsLoading(true)
    if (!navigator.geolocation) {
      setGpsLoading(false)
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGpsLat(pos.coords.latitude)
        setGpsLng(pos.coords.longitude)
        setGpsConsent(true)
        setGpsLoading(false)
      },
      () => setGpsLoading(false),
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }

  const handleSubmit = async () => {
    if (!photoDataUrl) return
    // VOIX — Aminata confirme DANS le geste utilisateur (avant await).
    // Voir handleSubmitIncident pour le rationale mobile (iOS/Chrome).
    try {
      parler('Signalement envoyé. Agent de recouvrement notifié.')
    } catch {
      /* ignore */
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/city/tax-reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          qrToken: plate.qrToken,
          photoUrl: photoDataUrl,
          vehiclePlate: vehiclePlate.trim() || null,
          description: description.trim() || null,
          gpsLat: gpsConsent ? gpsLat : null,
          gpsLng: gpsConsent ? gpsLng : null,
          citizenPhone: citizenPhone.trim() || null,
        }),
      })
      const json = await res.json()
      if (json?.ok) {
        onSubmitSuccess({
          gpsLat: gpsConsent ? gpsLat ?? undefined : undefined,
          gpsLng: gpsConsent ? gpsLng ?? undefined : undefined,
        })
      }
    } catch {
      // ignore
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-[#1A1A1A]/70">
        Photographiez le camion, conteneur ou chantier non déclaré. Avec la plaque d'immatriculation visible si possible.
      </p>

      {/* Photo capture */}
      <div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handlePhoto}
          className="hidden"
        />
        {photoDataUrl ? (
          <div className="relative rounded-2xl overflow-hidden">
            <img src={photoDataUrl} alt="Signalement" className="w-full rounded-2xl" />
            <button
              onClick={() => setPhotoDataUrl(null)}
              className="absolute top-2 right-2 rounded-full bg-black/60 px-3 py-1.5 text-xs font-medium text-white"
            >
              Changer
            </button>
          </div>
        ) : (
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex w-full flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-[#8B0000]/30 bg-[#8B0000]/5 py-12 transition hover:border-[#8B0000]/60 hover:bg-[#8B0000]/8"
          >
            <Camera className="size-10 text-[#8B0000]/50" />
            <span className="text-sm font-bold text-[#8B0000]">📷 Prendre une photo</span>
            <span className="text-xs text-[#1A1A1A]/50">Camion, conteneur, dépôt sauvage…</span>
          </button>
        )}
      </div>

      {/* Plaque véhicule (optionnel) */}
      <div>
        <label className="block text-sm font-medium text-[#1A1A1A]/70 mb-1.5">
          Plaque d'immatriculation du véhicule (optionnel)
        </label>
        <input
          type="text"
          value={vehiclePlate}
          onChange={(e) => setVehiclePlate(e.target.value.toUpperCase())}
          placeholder="ex: DK-2024-AB"
          className="w-full rounded-xl border border-[#EAE5DC] bg-[#FAFAF7] px-4 py-2.5 text-sm uppercase focus:border-[#8B0000] focus:outline-none"
        />
        <p className="mt-1 text-xs text-[#1A1A1A]/50">+500 FCFA de récompense si la plaque est fournie</p>
      </div>

      {/* Description */}
      <div>
        <label className="block text-sm font-medium text-[#1A1A1A]/70 mb-1.5">Description (optionnel)</label>
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="ex: Camion de gravats déchargé sur le trottoir depuis 2h…"
          rows={2}
          className="border-[#EAE5DC] bg-[#FAFAF7]"
        />
      </div>

      {/* GPS */}
      <div className="rounded-xl bg-[#FAFAF7] p-3">
        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={gpsConsent}
            onChange={(e) => {
              if (e.target.checked) {
                handleCaptureGps()
              } else {
                setGpsConsent(false)
                setGpsLat(null)
                setGpsLng(null)
              }
            }}
            className="size-5 accent-[#8B0000]"
          />
          <span className="text-sm font-medium text-[#1A1A1A]">
            {gpsLoading ? 'Localisation en cours…' : gpsConsent ? `GPS capté: ${gpsLat?.toFixed(4)}, ${gpsLng?.toFixed(4)}` : 'Partager ma position GPS'}
          </span>
        </label>
        <p className="mt-1 pl-8 text-xs text-[#1A1A1A]/50">Le GPS est envoyé à l'agent de recouvrement pour intervention rapide.</p>
      </div>

      {/* Téléphone (pour récompense) */}
      <div>
        <label className="block text-sm font-medium text-[#1A1A1A]/70 mb-1.5">
          Votre numéro (pour la récompense)
        </label>
        <input
          type="tel"
          value={citizenPhone}
          onChange={(e) => setCitizenPhone(e.target.value)}
          placeholder="+221 77 000 00 00"
          className="w-full rounded-xl border border-[#EAE5DC] bg-[#FAFAF7] px-4 py-2.5 text-sm focus:border-[#8B0000] focus:outline-none"
        />
        <p className="mt-1 text-xs text-[#1A1A1A]/50">Récompense envoyée via Wave / Orange Money si la taxe est recouvrée.</p>
      </div>

      {/* Récompense info */}
      <div className="rounded-xl bg-[#4A7C59]/8 border border-[#4A7C59]/20 px-4 py-3">
        <p className="text-sm font-bold text-[#4A7C59]">💰 Récompense citoyenne</p>
        <p className="mt-1 text-xs text-[#1A1A1A]/60">
          500 FCFA (signalement simple) ou 1000 FCFA (avec plaque véhicule). Crédit téléphonique envoyé dès que l'agent municipal encaisse la taxe.
        </p>
      </div>

      {/* Submit */}
      <Button
        onClick={handleSubmit}
        disabled={!photoDataUrl || submitting}
        className="w-full rounded-xl bg-[#8B0000] py-5 text-base text-white hover:bg-[#6B0000] disabled:opacity-50"
      >
        {submitting ? <Loader2 className="size-5 animate-spin" /> : <Send className="size-5" />}
        {submitting ? 'Envoi en cours…' : '🚨 ENVOYER L\'ALERTE'}
      </Button>
      {!photoDataUrl && (
        <p className="text-center text-xs text-[#1A1A1A]/40">Prenez une photo pour activer l'envoi</p>
      )}
    </div>
  )
}

// ============================================================
// 6. ItineraireView — Guidage Google Maps vers destinations clés
// ============================================================

type Destination = {
  id: string
  emoji: string
  name: string
  category: string
  lat: number
  lng: number
}

const ITINERAIRE_DESTINATIONS: ReadonlyArray<Destination> = [
  { id: 'senelec',    emoji: '⚡', name: 'Senelec',            category: 'Service public',     lat: 14.6700, lng: -17.4400 },
  { id: 'mairie',     emoji: '🏛️', name: 'Mairie de Dakar',    category: 'Administration',     lat: 14.6680, lng: -17.4390 },
  { id: 'ecole',      emoji: '🏫', name: 'École Ousmane Diop', category: 'Éducation',          lat: 14.6720, lng: -17.4380 },
  { id: 'pharmacie',  emoji: '💊', name: 'Pharmacie Plateau',  category: 'Santé',              lat: 14.6710, lng: -17.4395 },
  { id: 'marche',     emoji: '🛒', name: 'Marché Sandaga',     category: 'Commerce',           lat: 14.6655, lng: -17.4366 },
  { id: 'gare',       emoji: '🚌', name: 'Gare Routière',      category: 'Transport',          lat: 14.6690, lng: -17.4410 },
]

function ItineraireView({ plate }: { plate: CityPlate }) {
  const { toast } = useToast()
  const [locating, setLocating] = useState(false)
  const [myPos, setMyPos] = useState<{ lat: number; lng: number } | null>(
    plate.lat != null && plate.lng != null ? { lat: plate.lat, lng: plate.lng } : null,
  )

  /** Construit l'URL Google Maps directions vers une destination. */
  const buildDirectionsUrl = (dest: Destination): string => {
    const params = new URLSearchParams({
      api: '1',
      destination: `${dest.lat},${dest.lng}`,
      travelmode: 'walking',
    })
    // Origine : position captée via "Je suis ici", sinon GPS de la plaque.
    if (myPos) {
      params.set('origin', `${myPos.lat},${myPos.lng}`)
    }
    return `https://www.google.com/maps/dir/?${params.toString()}`
  }

  /** Capture la position GPS du citoyen et ouvre Google Maps. */
  const handleJeSuisIci = async () => {
    setLocating(true)
    const pos = await captureGps()
    setLocating(false)
    if (!pos) {
      toast({
        title: 'Position indisponible',
        description:
          "La géolocalisation a échoué. Autorisez l'accès à votre position.",
      })
      return
    }
    setMyPos(pos)
    toast({
      title: 'Vous êtes ici',
      description: `${pos.lat.toFixed(5)}, ${pos.lng.toFixed(5)}`,
    })
    // Optionnel : ouvrir Google Maps avec la position de l'utilisateur.
    window.open(
      `https://www.google.com/maps?q=${pos.lat},${pos.lng}`,
      '_blank',
      'noopener,noreferrer',
    )
  }

  return (
    <div className="space-y-5">
      {/* En-tête —titre + icône Map */}
      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <div className="mb-2 flex items-center gap-2">
          <Map className="size-5 text-[#0066CC]" />
          <h2 className="text-sm font-bold text-[#1A1A1A]" style={TITLE_FONT}>
            Itinéraire
          </h2>
        </div>
        <p className="text-xs text-[#1A1A1A]/60">
          Sélectionnez une destination ci-dessous pour lancer le guidage Google
          Maps. À pied par défaut.
        </p>
      </section>

      {/* Je suis ici */}
      <section
        className="rounded-2xl p-4 text-white shadow-sm"
        style={{
          background: `linear-gradient(135deg, ${COLORS.blue} 0%, #004a99 100%)`,
        }}
      >
        <div className="mb-3 flex items-center gap-2">
          <Navigation className="size-5 text-white/80" />
          <h2 className="text-sm font-bold uppercase tracking-wide text-white/90">
            Ma position
          </h2>
        </div>
        <Button
          onClick={handleJeSuisIci}
          disabled={locating}
          className="w-full rounded-xl bg-white py-5 text-base text-[#0066CC] hover:bg-white/90"
        >
          {locating ? (
            <Loader2 className="size-5 animate-spin" />
          ) : (
            <MapPin className="size-5" />
          )}
          {locating ? 'Localisation…' : 'Je suis ici'}
        </Button>
        {myPos && (
          <div className="mt-3 rounded-xl bg-white/15 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-white/70">
              Point de départ
            </p>
            <p className="mt-1 font-mono text-sm font-bold text-white">
              {myPos.lat.toFixed(5)}, {myPos.lng.toFixed(5)}
            </p>
            {plate.lat != null && plate.lng != null &&
              myPos.lat === plate.lat &&
              myPos.lng === plate.lng && (
                <p className="mt-1 text-xs text-white/70">
                  Position de la plaque #{plate.plateNumber}
                </p>
              )}
          </div>
        )}
      </section>

      {/* Liste des destinations */}
      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center gap-2">
          <Route className="size-5 text-[#0066CC]" />
          <h2 className="text-sm font-bold text-[#1A1A1A]" style={TITLE_FONT}>
            Destinations fréquentes
          </h2>
        </div>
        <ul className="space-y-2">
          {ITINERAIRE_DESTINATIONS.map((d) => (
            <li
              key={d.id}
              className="flex items-center gap-3 rounded-xl bg-[#0066CC]/5 p-3"
            >
              <span className="text-2xl" aria-hidden>
                {d.emoji}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-[#1A1A1A]">
                  {d.name}
                </p>
                <p className="truncate text-xs text-[#1A1A1A]/55">
                  {d.category}
                </p>
              </div>
              <a
                href={buildDirectionsUrl(d)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[#0066CC] px-4 py-2 text-xs font-bold text-white transition hover:bg-[#0055aa]"
              >
                <Navigation className="size-3.5" />
                Y aller
              </a>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

// ============================================================
// 7. AnnoncesView — Annonces municipales (avec TTS)
// ============================================================

type Announcement = {
  id: string
  title: string
  message: string
  priority: 'urgent' | 'info' | 'normal'
  targetDistrict: string | null
  status: 'active' | 'scheduled' | 'archived'
  broadcastHours: string | null
  audioText?: string | null
}

function AnnoncesView({ plate }: { plate: CityPlate }) {
  const { toast } = useToast()
  const [annonces, setAnnonces] = useState<Announcement[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Empêche la double lecture automatique de la première annonce en StrictMode.
  const autoSpokenRef = useRef(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    ;(async () => {
      try {
        const res = await fetch('/api/city/announcements', {
          cache: 'no-store',
        })
        const json = (await res.json().catch(() => null)) as
          | { ok: true; data: { announcements?: Announcement[] } }
          | { ok: false; error?: string }
          | null
        if (cancelled) return
        if (!json?.ok || !Array.isArray(json.data?.announcements)) {
          setError(json?.error ?? 'Service indisponible')
          setAnnonces([])
          return
        }
        // Filtre : status active/scheduled + ciblage district (null = tous).
        const filtered = json.data.announcements.filter((a) => {
          const statusOk = a.status === 'active' || a.status === 'scheduled'
          const districtOk =
            a.targetDistrict == null ||
            a.targetDistrict === '' ||
            a.targetDistrict === plate.district
          return statusOk && districtOk
        })
        setAnnonces(filtered)
        // Lecture automatique de la première annonce après le fetch.
        // (On évite la double exécution en StrictMode via un ref.)
        if (filtered.length > 0 && !autoSpokenRef.current) {
          autoSpokenRef.current = true
          try {
            parler(
              filtered[0].audioText || filtered[0].message,
            )
          } catch {
            /* synthèse vocale indisponible */
          }
        }
      } catch {
        if (cancelled) return
        setError('Connexion impossible. Vérifiez votre réseau.')
        setAnnonces([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [plate.district])

  const handleEcouter = (a: Announcement) => {
    try {
      parler(a.audioText || a.message)
    } catch {
      /* ignore */
    }
    toast({
      title: 'Lecture en cours',
      description: a.title,
    })
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16">
        <Loader2 className="size-8 animate-spin text-[#FF6B00]" />
        <p className="text-sm text-[#1A1A1A]/55">
          Chargement des annonces municipales…
        </p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-2xl bg-white p-8 text-center shadow-sm">
        <AlertTriangle className="mx-auto size-10 text-[#E30613]" />
        <p className="mt-3 text-sm font-semibold text-[#1A1A1A]" style={TITLE_FONT}>
          {error}
        </p>
        <p className="mt-1 text-xs text-[#1A1A1A]/55">
          Réessayez dans quelques instants.
        </p>
      </div>
    )
  }

  if (annonces.length === 0) {
    return (
      <div className="rounded-2xl bg-white p-8 text-center shadow-sm">
        <span className="text-4xl" aria-hidden>
          📣
        </span>
        <p className="mt-3 text-sm font-semibold text-[#1A1A1A]" style={TITLE_FONT}>
          Aucune annonce municipale pour le moment.
        </p>
        <p className="mt-1 text-xs text-[#1A1A1A]/55">
          Les messages de la mairie apparaîtront ici.
        </p>
      </div>
    )
  }

  const priorityConfig: Record<
    Announcement['priority'],
    { label: string; bg: string; text: string }
  > = {
    urgent: { label: 'URGENT', bg: '#E30613', text: '#FFFFFF' },
    info:   { label: 'INFO',    bg: '#0066CC', text: '#FFFFFF' },
    normal: { label: 'NORMAL',  bg: '#6B4C9A', text: '#FFFFFF' },
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold uppercase tracking-wide text-[#1A1A1A]/60">
          {annonces.length} annonce{annonces.length > 1 ? 's' : ''} municipale{annonces.length > 1 ? 's' : ''}
        </h2>
        <Badge className="bg-[#FF6B00]/10 text-[#FF6B00]">
          <Check className="size-3" />
          Info mairie
        </Badge>
      </div>

      {annonces.map((a) => {
        const p = priorityConfig[a.priority]
        return (
          <article
            key={a.id}
            className="rounded-2xl bg-white p-4 shadow-sm"
            style={{ borderLeft: `4px solid ${p.bg}` }}
          >
            {/* Badge priorité */}
            <div className="mb-2 flex items-center gap-2">
              <span
                className="rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                style={{ backgroundColor: p.bg, color: p.text }}
              >
                {p.label}
              </span>
              {a.targetDistrict && (
                <span className="text-[10px] font-semibold uppercase tracking-wide text-[#1A1A1A]/45">
                  {a.targetDistrict}
                </span>
              )}
            </div>

            {/* Titre */}
            <h3 className="text-base font-bold text-[#1A1A1A]" style={TITLE_FONT}>
              {a.title}
            </h3>

            {/* Message */}
            <p className="mt-1.5 text-sm leading-relaxed text-[#1A1A1A]/75">
              {a.message}
            </p>

            {/* Heures de diffusion */}
            {a.broadcastHours && (
              <p className="mt-2 inline-flex items-center gap-1 text-xs text-[#1A1A1A]/55">
                <Clock className="size-3" />
                Diffusion : {a.broadcastHours}
              </p>
            )}

            {/* Bouton écouter */}
            <button
              onClick={() => handleEcouter(a)}
              className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl bg-[#FF6B00] py-2.5 text-sm font-bold text-white transition hover:bg-[#e55f00]"
            >
              <Volume2 className="size-4" />
              Écouter
            </button>
          </article>
        )
      })}
    </div>
  )
}

// ============================================================
// 8. SanteView — Pharmacie de garde + pharmacies de la ville
// ============================================================

type Pharmacy = {
  id: string
  name: string
  address: string
  phone: string
  hours: string
  lat: number
  lng: number
}

const PHARMACIE_GARDE_SANTE: Pharmacy = {
  id: 'garde',
  name: 'Pharmacie de Garde Plateau',
  address: 'Rue Mohamed V, Dakar',
  phone: '+221338210000',
  hours: 'Ouverte 24h/24 — 7j/7',
  lat: 14.6710,
  lng: -17.4395,
}

const PHARMACIES_VILLE: ReadonlyArray<Pharmacy> = [
  {
    id: 'p1',
    name: 'Pharmacie de la Médina',
    address: 'Avenue Léopold S. Senghor, Médina',
    phone: '+221338211111',
    hours: 'Lun–Sam · 8h–22h',
    lat: 14.6690,
    lng: -17.4450,
  },
  {
    id: 'p2',
    name: 'Pharmacie du Sandaga',
    address: 'Marché Sandaga, Dakar',
    phone: '+221338212222',
    hours: 'Lun–Sam · 8h–21h',
    lat: 14.6655,
    lng: -17.4366,
  },
  {
    id: 'p3',
    name: 'Pharmacie Independence',
    address: 'Place de l\'Indépendance, Dakar',
    phone: '+221338213333',
    hours: 'Lun–Dim · 8h–23h',
    lat: 14.6680,
    lng: -17.4390,
  },
  {
    id: 'p4',
    name: 'Pharmacie Grand Dakar',
    address: 'Boulevard du Général de Gaulle',
    phone: '+221338214444',
    hours: 'Lun–Sam · 8h–22h',
    lat: 14.7100,
    lng: -17.4600,
  },
]

function SanteView({ plate }: { plate: CityPlate }) {
  const buildDirectionsUrl = (p: Pharmacy): string => {
    const params = new URLSearchParams({
      api: '1',
      destination: `${p.lat},${p.lng}`,
      travelmode: 'walking',
    })
    if (plate.lat != null && plate.lng != null) {
      params.set('origin', `${plate.lat},${plate.lng}`)
    }
    return `https://www.google.com/maps/dir/?${params.toString()}`
  }

  return (
    <div className="space-y-5">
      {/* En-tête de section */}
      <section
        className="rounded-2xl p-4 text-white shadow-sm"
        style={{
          background: `linear-gradient(135deg, ${COLORS.green} 0%, #007a3c 100%)`,
        }}
      >
        <div className="mb-2 flex items-center gap-2">
          <Pill className="size-5 text-white/80" />
          <h2 className="text-sm font-bold uppercase tracking-wide text-white/90">
            Santé · Pharmacies
          </h2>
        </div>
        <p className="text-xs leading-relaxed text-white/85">
          Pharmacie de garde 24h/24 et annuaire des pharmacies de la ville.
          Appelez ou lancez le guidage Google Maps en un geste.
        </p>
      </section>

      {/* Section 1 : Pharmacie de garde */}
      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center gap-2">
          <Pill className="size-5 text-[#00A651]" />
          <h2 className="text-sm font-bold text-[#1A1A1A]" style={TITLE_FONT}>
            Pharmacie de garde
          </h2>
        </div>
        <div className="rounded-xl bg-[#00A651]/5 p-3">
          <p className="text-base font-bold text-[#1A1A1A]" style={TITLE_FONT}>
            {PHARMACIE_GARDE_SANTE.name}
          </p>
          <p className="mt-1 text-xs text-[#1A1A1A]/60">
            {PHARMACIE_GARDE_SANTE.address}
          </p>
          <p className="mt-0.5 text-xs font-semibold text-[#00A651]">
            {PHARMACIE_GARDE_SANTE.hours}
          </p>
          <div className="mt-3 flex gap-2">
            <a
              href={`tel:${PHARMACIE_GARDE_SANTE.phone}`}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#00A651] py-2.5 text-sm font-bold text-white transition hover:bg-[#008a44]"
            >
              <Phone className="size-4" />
              Appeler
            </a>
            <a
              href={buildDirectionsUrl(PHARMACIE_GARDE_SANTE)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-[#00A651]/30 py-2.5 text-sm font-semibold text-[#00A651] transition hover:bg-[#00A651]/5"
            >
              <Navigation className="size-4" />
              Y aller
            </a>
          </div>
        </div>
      </section>

      {/* Section 2 : Pharmacies de la ville */}
      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center gap-2">
          <MapPin className="size-5 text-[#00A651]" />
          <h2 className="text-sm font-bold text-[#1A1A1A]" style={TITLE_FONT}>
            Pharmacies de la ville
          </h2>
        </div>
        <ul className="space-y-3">
          {PHARMACIES_VILLE.map((p) => (
            <li
              key={p.id}
              className="rounded-xl bg-[#00A651]/5 p-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-[#1A1A1A]">
                    {p.name}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-[#1A1A1A]/55">
                    {p.address}
                  </p>
                  <p className="mt-0.5 text-xs text-[#00A651]">{p.hours}</p>
                </div>
              </div>
              <div className="mt-2 flex gap-2">
                <a
                  href={`tel:${p.phone}`}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-[#00A651] py-2 text-xs font-bold text-white transition hover:bg-[#008a44]"
                >
                  <Phone className="size-3.5" />
                  Contacter
                </a>
                <a
                  href={buildDirectionsUrl(p)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-[#00A651]/30 py-2 text-xs font-semibold text-[#00A651] transition hover:bg-[#00A651]/5"
                >
                  <Navigation className="size-3.5" />
                  Y aller
                </a>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

// ============================================================
// 9. CitizenRegistrationModal — inscription légère (téléphone)
//    Réutilisable pour SchoolCheckinView (mode 'school') et SOS
//    silencieux (mode 'general'). POST /api/city/citizens.
// ============================================================

function CitizenRegistrationModal({
  open,
  mode,
  plateLabel,
  submitting,
  onSubmit,
  onClose,
}: {
  open: boolean
  mode: 'general' | 'school'
  plateLabel?: string | null
  submitting: boolean
  onSubmit: (data: {
    phone: string
    name?: string
    schoolName?: string
    parentPhone?: string
  }) => Promise<boolean> | void
  onClose: () => void
}) {
  const [phone, setPhone] = useState('')
  const [name, setName] = useState('')
  const [parentPhone, setParentPhone] = useState('')
  const [localSubmitting, setLocalSubmitting] = useState(false)
  const isSchool = mode === 'school'

  // Reset des champs quand le modal se ferme
  useEffect(() => {
    if (!open) {
      setPhone('')
      setName('')
      setParentPhone('')
      setLocalSubmitting(false)
    }
  }, [open])

  if (!open) return null

  const phoneClean = phone.replace(/[^\d+]/g, '')
  const phoneValid = phoneClean.length >= 8

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!phoneValid || submitting || localSubmitting) return
    setLocalSubmitting(true)
    const data: {
      phone: string
      name?: string
      schoolName?: string
      parentPhone?: string
    } = { phone: phoneClean }
    if (name.trim()) data.name = name.trim()
    if (isSchool) {
      if (plateLabel) data.schoolName = plateLabel
      if (parentPhone.trim()) data.parentPhone = parentPhone.trim()
    }
    try {
      await onSubmit(data)
    } finally {
      setLocalSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Inscription citoyenne"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-3xl bg-white p-6 shadow-2xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
        style={{ borderTop: '6px solid #1B2A8C' }}
      >
        {/* Header */}
        <div className="mb-5 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className="flex h-12 w-12 items-center justify-center rounded-xl text-2xl"
              style={{ background: '#FFDD00' }}
            >
              {isSchool ? '🏫' : '🪪'}
            </div>
            <div>
              <h2 className="text-lg font-bold text-[#1A1A1A]" style={TITLE_FONT}>
                {isSchool ? 'Pointage école' : 'Identification rapide'}
              </h2>
              <p className="text-xs text-[#1A1A1A]/55">
                Votre numéro suffit — aucune appli à installer.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="rounded-full p-1 text-[#1A1A1A]/40 transition hover:bg-[#F5F5F5] hover:text-[#1A1A1A]"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Téléphone (required) */}
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-[#1A1A1A]">
              Téléphone <span className="text-[#E30613]">*</span>
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+221 77 000 00 00"
              autoComplete="tel"
              required
              className="w-full rounded-xl border border-[#EAE5DC] bg-[#FAFAF7] px-4 py-3 text-base focus:border-[#1B2A8C] focus:outline-none focus:ring-2 focus:ring-[#1B2A8C]/20"
            />
            <p className="mt-1 text-xs text-[#1A1A1A]/50">
              Nous vous identifierons par ce numéro pour vos prochaines visites.
            </p>
          </div>

          {/* Nom (optional) */}
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-[#1A1A1A]">
              Nom <span className="text-[#1A1A1A]/40">(optionnel)</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Aminata Diop"
              autoComplete="name"
              className="w-full rounded-xl border border-[#EAE5DC] bg-[#FAFAF7] px-4 py-3 text-base focus:border-[#1B2A8C] focus:outline-none focus:ring-2 focus:ring-[#1B2A8C]/20"
            />
          </div>

          {/* Mode école : téléphone du parent */}
          {isSchool && (
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-[#1A1A1A]">
                Téléphone du parent / tuteur{' '}
                <span className="text-[#1A1A1A]/40">(optionnel)</span>
              </label>
              <input
                type="tel"
                value={parentPhone}
                onChange={(e) => setParentPhone(e.target.value)}
                placeholder="+221 77 123 45 67"
                autoComplete="tel"
                className="w-full rounded-xl border border-[#EAE5DC] bg-[#FAFAF7] px-4 py-3 text-base focus:border-[#1B2A8C] focus:outline-none focus:ring-2 focus:ring-[#1B2A8C]/20"
              />
              <p className="mt-1 text-xs text-[#1A1A1A]/50">
                Un SMS sera envoyé à votre parent à chaque pointage.
              </p>
            </div>
          )}

          {/* Note privacy */}
          <div className="rounded-xl bg-[#1B2A8C]/5 px-3 py-2.5">
            <p className="text-xs leading-relaxed text-[#1A1A1A]/65">
              <Shield className="mr-1 inline size-3 text-[#1B2A8C]" />
              Vos données restent confidentielles et ne sont partagées qu&apos;avec
              les services municipaux pour votre sécurité.
            </p>
          </div>

          {/* Submit */}
          <Button
            type="submit"
            disabled={!phoneValid || submitting || localSubmitting}
            className="w-full rounded-xl bg-[#1B2A8C] py-5 text-base font-bold uppercase tracking-wide text-white hover:bg-[#142066]"
          >
            {submitting || localSubmitting ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Inscription…
              </>
            ) : (
              <>
                <LogIn className="size-4" />
                Continuer
              </>
            )}
          </Button>
        </form>
      </div>
    </div>
  )
}

// ============================================================
// 10. SchoolCheckinView — vue pointage pour plaques de type 'ecole'
//     Affiche 3 gros boutons (arrivé / parti / souci) + confirmation
//     vocale Aminata + notification parent mockée. Lien "Menu complet"
//     pour basculer vers la MainView standard.
// ============================================================

type SchoolCheckinPhase = 'actions' | 'confirm'

function SchoolCheckinView({
  plate,
  citizenPhone,
  citizenName,
  currentHour,
  onEnsureCitizen,
  onOpenFullMenu,
}: {
  plate: CityPlate
  citizenPhone: string | null
  citizenName: string | null
  currentHour: number
  onEnsureCitizen: (mode?: 'general' | 'school') => Promise<string | null>
  onOpenFullMenu: () => void
}) {
  const { toast } = useToast()
  const [localPhase, setLocalPhase] = useState<SchoolCheckinPhase>('actions')
  const [submitting, setSubmitting] = useState(false)
  const [lastCheckin, setLastCheckin] = useState<{
    status: 'arrived' | 'left' | 'sos'
    time: string
    parentNotified: boolean
  } | null>(null)

  const isNight = currentHour >= 22 || currentHour < 6

  /** Effectue un check-in école (POST /api/city/checkins). */
  const handleCheckin = async (status: 'arrived' | 'left' | 'sos') => {
    // 1. Identifier le citoyen si nécessaire (mode 'school').
    let phone: string | null = citizenPhone
    if (!phone) {
      try {
        phone = await onEnsureCitizen('school')
      } catch {
        phone = null
      }
    }
    if (!phone) {
      // L'utilisateur a annulé l'identification — on abandonne.
      return
    }

    // 2. VOIX — Aminata confirme DANS le geste utilisateur (avant await).
    // iOS Safari et Chrome mobile exigent un appel synchrone au speak().
    try {
      const msg =
        status === 'arrived'
          ? `Aminata confirme votre arrivée à l'école ${plate.label}. Notification envoyée à votre parent.`
          : status === 'left'
            ? `Aminata confirme votre départ de l'école ${plate.label}. Bon retour à la maison.`
            : `Aminata a transmis votre signalement à l'école ${plate.label}. Un responsable va vous contacter.`
      parler(msg)
    } catch {
      /* ignore */
    }

    setSubmitting(true)
    const result = await postCheckin({
      plateId: plate.id,
      citizenPhone: phone,
      status,
    })
    setSubmitting(false)

    if (result.ok) {
      setLastCheckin({
        status,
        time: result.checkin.createdAt,
        // Mock : on suppose que la notification parent part à chaque fois.
        parentNotified: true,
      })
      setLocalPhase('confirm')
    } else {
      toast({
        title: 'Pointage impossible',
        description: result.error,
      })
    }
  }

  // --- Phase confirmation ---
  if (localPhase === 'confirm' && lastCheckin) {
    return (
      <SchoolCheckinConfirmation
        plate={plate}
        status={lastCheckin.status}
        time={lastCheckin.time}
        parentNotified={lastCheckin.parentNotified}
        citizenName={citizenName}
        onContinue={() => setLocalPhase('actions')}
        onOpenFullMenu={onOpenFullMenu}
      />
    )
  }

  // --- Phase actions ---
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col bg-white">
      {/* Header signalétique bleu */}
      <header
        className="px-5 pb-6 pt-5 shadow-xl"
        style={{ background: '#1B2A8C', borderRadius: '0 0 24px 24px' }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="flex h-12 w-12 items-center justify-center bg-white"
              style={{ borderRadius: '14px' }}
            >
              <span className="text-2xl">🏫</span>
            </div>
            <div>
              <p className="text-sm font-bold uppercase tracking-wider text-white">
                Pointage école
              </p>
              <p className="text-[10px] uppercase tracking-[0.2em] text-white/60">
                Ville Connectée
              </p>
            </div>
          </div>
          <button
            onClick={onOpenFullMenu}
            className="rounded-xl bg-white/10 px-3 py-2 text-xs font-bold uppercase tracking-wide text-white transition hover:bg-white/20"
          >
            Menu complet
          </button>
        </div>

        {/* Carte école */}
        <div
          className="mt-5 flex items-center gap-3 bg-white px-4 py-3"
          style={{ borderRadius: '16px' }}
        >
          <div
            className="flex h-10 w-10 items-center justify-center bg-[#1B2A8C]"
            style={{ borderRadius: '10px' }}
          >
            <span className="text-xl">📍</span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-[#1A1A1A]">{plate.label}</p>
            <p className="truncate text-xs text-[#1A1A1A]/60">
              {plate.district ? `${plate.district} · ` : ''}Dakar · #{plate.plateNumber}
            </p>
          </div>
        </div>

        <h1 className="mt-4 text-xl font-bold leading-tight text-white">
          {isNight ? 'Bonsoir.' : 'Bonjour.'}
        </h1>
        <p className="mt-1 text-sm text-white/80">
          {citizenPhone
            ? `Connecté${citizenName ? ` · ${citizenName}` : ''}. Pointez votre présence ci-dessous.`
            : 'Identifiez-vous une fois pour pointer votre présence.'}
        </p>
      </header>

      {/* Contenu */}
      <main className="flex-1 space-y-4 px-4 py-6">
        {/* Bannière identification si pas encore inscrit */}
        {!citizenPhone && (
          <div
            className="rounded-2xl border border-[#FFDD00]/40 bg-[#FFDD00]/10 p-4"
          >
            <div className="mb-2 flex items-center gap-2">
              <LogIn className="size-4 text-[#1B2A8C]" />
              <p className="text-sm font-bold text-[#1A1A1A]">Identifiez-vous</p>
            </div>
            <p className="text-xs text-[#1A1A1A]/65">
              Votre numéro de téléphone suffit pour pointer. Une seule
              inscription pour tous les pointages de l&apos;année.
            </p>
            <Button
              onClick={() => void onEnsureCitizen('school')}
              className="mt-3 w-full rounded-xl bg-[#1B2A8C] py-3 text-sm font-bold text-white hover:bg-[#142066]"
            >
              <LogIn className="size-4" />
              S&apos;identifier
            </Button>
          </div>
        )}

        <h2 className="text-sm font-bold uppercase tracking-wide text-[#1A1A1A]/60">
          Que faites-vous ?
        </h2>

        {/* Bouton 1 — Arrivée (vert) */}
        <button
          onClick={() => void handleCheckin('arrived')}
          disabled={submitting || !citizenPhone}
          className="flex w-full items-center gap-4 rounded-2xl p-5 text-left shadow-lg transition-all hover:-translate-y-0.5 hover:shadow-xl active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          style={{ background: '#00A651', color: '#FFFFFF' }}
        >
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-white/15">
            <Check className="size-8" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-lg font-bold" style={TITLE_FONT}>
              Je suis bien arrivé
            </p>
            <p className="text-xs text-white/80">Pointage d&apos;arrivée · parent notifié</p>
          </div>
          <span className="text-2xl">✅</span>
        </button>

        {/* Bouton 2 — Départ (bleu) */}
        <button
          onClick={() => void handleCheckin('left')}
          disabled={submitting || !citizenPhone}
          className="flex w-full items-center gap-4 rounded-2xl p-5 text-left shadow-lg transition-all hover:-translate-y-0.5 hover:shadow-xl active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          style={{ background: '#0066CC', color: '#FFFFFF' }}
        >
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-white/15">
            <DoorOpen className="size-8" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-lg font-bold" style={TITLE_FONT}>
              Je quitte l&apos;école
            </p>
            <p className="text-xs text-white/80">Pointage de sortie · parent notifié</p>
          </div>
          <span className="text-2xl">🚪</span>
        </button>

        {/* Bouton 3 — Souci (rouge) */}
        <button
          onClick={() => void handleCheckin('sos')}
          disabled={submitting || !citizenPhone}
          className="flex w-full items-center gap-4 rounded-2xl p-5 text-left shadow-lg transition-all hover:-translate-y-0.5 hover:shadow-xl active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          style={{ background: '#E30613', color: '#FFFFFF' }}
        >
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-white/15">
            <AlertTriangle className="size-8" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-lg font-bold" style={TITLE_FONT}>
              J&apos;ai un souci
            </p>
            <p className="text-xs text-white/80">Signaler un problème · école alertée</p>
          </div>
          <span className="text-2xl">⚠️</span>
        </button>

        {submitting && (
          <p className="flex items-center justify-center gap-2 text-xs text-[#1A1A1A]/55">
            <Loader2 className="size-3 animate-spin" />
            Envoi du pointage…
          </p>
        )}

        {/* Lien menu complet */}
        <button
          onClick={onOpenFullMenu}
          className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl border border-[#1A1A1A]/10 py-3 text-sm font-semibold text-[#1B2A8C] transition hover:bg-[#F5F5F5]"
        >
          Menu complet des services
          <ArrowLeft className="size-3 rotate-180" />
        </button>
      </main>

      {/* Footer */}
      <footer className="px-4 pb-6 pt-2 text-center">
        <p className="text-xs font-bold uppercase tracking-wider text-[#1A1A1A]/40">
          ✨ AMINATA — VOTRE ÉCOLE CONNECTÉE
        </p>
      </footer>
    </div>
  )
}

// ============================================================
// SchoolCheckinConfirmation — écran de confirmation après pointage
// ============================================================

function SchoolCheckinConfirmation({
  plate,
  status,
  time,
  parentNotified,
  citizenName,
  onContinue,
  onOpenFullMenu,
}: {
  plate: CityPlate
  status: 'arrived' | 'left' | 'sos'
  time: string
  parentNotified: boolean
  citizenName?: string | null
  onContinue: () => void
  onOpenFullMenu: () => void
}) {
  const config = {
    arrived: {
      emoji: '✅',
      title: 'Arrivée confirmée',
      color: '#00A651',
      bg: '#00A651',
    },
    left: {
      emoji: '🚪',
      title: 'Départ confirmé',
      color: '#0066CC',
      bg: '#0066CC',
    },
    sos: {
      emoji: '⚠️',
      title: 'Signalement envoyé',
      color: '#E30613',
      bg: '#E30613',
    },
  }[status]

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 py-10 text-center">
      {/* Cercle de confirmation */}
      <div
        className="flex size-28 items-center justify-center rounded-full shadow-lg"
        style={{ background: config.bg }}
        aria-hidden
      >
        <span className="text-5xl">{config.emoji}</span>
      </div>

      {/* Titre */}
      <h1 className="mt-6 text-2xl font-bold text-[#1A1A1A]" style={TITLE_FONT}>
        {config.title}
      </h1>

      {/* Aminata confirme… */}
      <p className="mt-2 text-sm text-[#1A1A1A]/65">
        Aminata confirme {citizenName ? `à ${citizenName}` : 'votre action'} à{' '}
        <strong className="font-semibold text-[#1A1A1A]">{plate.label}</strong>.
      </p>

      {/* Notification parent */}
      {parentNotified && (
        <div
          className="mt-4 inline-flex items-center gap-2 rounded-full px-4 py-2 shadow-sm"
          style={{ background: `${config.bg}15`, color: config.color }}
        >
          <Check className="size-4" />
          <span className="text-sm font-semibold">
            Notification envoyée à votre parent
          </span>
        </div>
      )}

      {/* Métadonnées */}
      <div className="mt-6 w-full rounded-2xl bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between text-xs">
          <span className="text-[#1A1A1A]/50">École</span>
          <span className="font-mono font-bold text-[#1A1A1A]">
            {plate.label}
          </span>
        </div>
        <div className="mt-2 flex items-center justify-between text-xs">
          <span className="text-[#1A1A1A]/50">Heure</span>
          <span className="font-mono font-bold text-[#1A1A1A]">
            {formatHeure(time)} · {relTime(time)}
          </span>
        </div>
        <div className="mt-2 flex items-center justify-between text-xs">
          <span className="text-[#1A1A1A]/50">Plaque</span>
          <span className="font-mono font-bold text-[#1A1A1A]">#{plate.plateNumber}</span>
        </div>
      </div>

      {/* Boutons */}
      <div className="mt-8 w-full space-y-2">
        <Button
          onClick={onContinue}
          className="w-full rounded-xl py-5 text-base text-white"
          style={{ background: config.bg }}
        >
          <Check className="size-4" />
          Faire un autre pointage
        </Button>
        <Button
          onClick={onOpenFullMenu}
          variant="outline"
          className="w-full rounded-xl border-[#1A1A1A]/20 py-3 text-sm"
        >
          Menu complet des services
          <ArrowLeft className="size-3 rotate-180" />
        </Button>
      </div>
    </div>
  )
}

// ============================================================
// Export par défaut
// ============================================================

export default CityScanView
