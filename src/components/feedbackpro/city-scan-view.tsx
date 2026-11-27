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
  GraduationCap,
  Luggage,
  Minus,
  ShoppingBag,
  Utensils,
  Moon,
  Sun,
  ChefHat,
  Flame,
  CheckCircle2,
  HeartPulse,
  Stethoscope,
  Briefcase,
  Tag,
  Package,
  Gift,
  ArrowRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
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

// ============================================================
// PWA — détection plateforme pour les instructions d'installation
// ------------------------------------------------------------
// iOS Safari ne déclenche JAMAIS beforeinstallprompt : il faut guider
// le citoyen vers Partager → « Sur l'écran d'accueil ». Android/Chrome
// déclenche l'événement, mais on garde un fallback manuel (menu ⋮ →
// Installer) au cas où l'événement n'arrive pas (app déjà installée,
// navigateur non compatible…). On détecte aussi le mode standalone
// (déjà installé) pour masquer le bouton.
// ============================================================
function detectInstallPlatform(): 'ios' | 'android' | 'desktop' {
  if (typeof navigator === 'undefined') return 'desktop'
  const ua = navigator.userAgent.toLowerCase()
  if (/iphone|ipad|ipod/.test(ua)) return 'ios'
  if (/android/.test(ua)) return 'android'
  return 'desktop'
}

function isRunningStandalone(): boolean {
  if (typeof window === 'undefined') return false
  // iOS Safari : window.navigator.standalone (déprécié mais fiable sur iOS)
  // Standards : display-mode standalone
  return (
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  )
}

/** Style de titre serif (Georgia / Playfair Display) appliqué aux titres. */
const TITLE_FONT: React.CSSProperties = {
  fontFamily: 'Georgia, "Playfair Display", serif',
}

// ============================================================
// Palette "Aminata · Annonces · Santé · Écoles" (refonte 2024)
// ------------------------------------------------------------
// Tokens partagés par QuartierAdsView, SanteView, SchoolsView.
//   --jaune     : #FFD700   --jaune-dark : #F59E0B
//   --bleu      : #1E3A8A   --bleu-clair : #3B82F6
//   --rouge     : #DC2626   --vert       : #059669
//   --vert-clair: #10B981   --violet     : #6B4C9A
//   --orange    : #F97316   --blanc      : #FFFBEB
// ============================================================

const AMINATA_TOKENS = {
  jaune: '#FFD700',
  jauneDark: '#F59E0B',
  bleu: '#1E3A8A',
  bleuClair: '#3B82F6',
  rouge: '#DC2626',
  vert: '#059669',
  vertClair: '#10B981',
  violet: '#6B4C9A',
  orange: '#F97316',
  blanc: '#FFFBEB',
  texte: '#1F2937',
  gris: '#6B7280',
  grisClair: '#E5E7EB',
} as const

/** Famille Playfair Display (titres) — chargée par <link> dans les vues. */
const PLAYFAIR_FONT: React.CSSProperties = {
  fontFamily: '"Playfair Display", Georgia, serif',
}

/** Famille Inter — chargée par <link> dans les vues. */
const INTER_FONT: React.CSSProperties = {
  fontFamily: '"Inter", system-ui, sans-serif',
}

/** Lien Google Fonts Inter + Playfair Display — hoisté vers <head> par Next. */
const AMINATA_FONT_LINK = (
  <link
    rel="stylesheet"
    href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;0,700;1,400&family=Inter:wght@300;400;500;600;700;800&display=swap"
  />
)

/** Petites keyframes partagées (cascade + pulse). */
const AMINATA_KEYFRAMES_STYLE = (
  <style>{`
    @keyframes aminata-slide-up {
      from { opacity: 0; transform: translateY(18px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    @keyframes aminata-fade-in {
      from { opacity: 0; transform: translateX(16px); }
      to   { opacity: 1; transform: translateX(0); }
    }
    @keyframes aminata-pulse-dot {
      0%, 100% { opacity: 1; transform: scale(1); }
      50%      { opacity: 0.45; transform: scale(0.85); }
    }
    .aminata-card-enter {
      opacity: 0;
      transform: translateY(18px);
      animation: aminata-slide-up 0.55s cubic-bezier(0.4, 0, 0.2, 1) forwards;
    }
    .aminata-screen-enter {
      animation: aminata-fade-in 0.4s ease;
    }
    .aminata-pulse {
      animation: aminata-pulse-dot 2s infinite;
    }
    /* Scrollbar discrète pour les filtres horizontaux */
    .aminata-filters-scroll::-webkit-scrollbar { display: none; }
    .aminata-filters-scroll { scrollbar-width: none; -ms-overflow-style: none; }
  `}</style>
)

/** Cartouche d'en-tête de module (header coloré + icône blanche). */
function AminataModuleHeader({
  gradient,
  icon,
  title,
  subtitle,
  badge,
}: {
  gradient: string
  icon: React.ReactNode
  title: string
  subtitle?: string | null
  badge?: React.ReactNode
}) {
  return (
    <div
      className="relative flex items-center gap-3 overflow-hidden rounded-2xl p-4 shadow-md"
      style={{
        background: gradient,
        boxShadow: '0 8px 28px rgba(0,0,0,0.18)',
      }}
    >
      {/* Pastille décorative */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-10 -top-12 size-36 rounded-full"
        style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.18) 0%, transparent 70%)' }}
      />
      {/* Tuile icône blanche */}
      <div
        className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-white"
        style={{ boxShadow: '0 6px 16px rgba(0,0,0,0.14)' }}
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <h2
          className="truncate text-base font-bold leading-tight text-white"
          style={PLAYFAIR_FONT}
        >
          {title}
        </h2>
        {subtitle ? (
          <p className="mt-0.5 truncate text-[11px] font-medium text-white/85">
            {subtitle}
          </p>
        ) : null}
        {badge ? <div className="mt-1.5">{badge}</div> : null}
      </div>
    </div>
  )
}

/** Bannière descriptive (texte long) placée sous le header. */
function AminataBanner({
  gradient,
  eyebrow,
  text,
}: {
  gradient: string
  eyebrow: string
  text: string
}) {
  return (
    <div
      className="relative overflow-hidden rounded-2xl p-4 text-white"
      style={{ background: gradient }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -right-12 -top-16 size-44 rounded-full"
        style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.18) 0%, transparent 70%)' }}
      />
      <p className="relative text-[10px] font-bold uppercase tracking-[0.12em] opacity-95">
        {eyebrow}
      </p>
      <p className="relative mt-1 text-[13px] leading-relaxed opacity-95">
        {text}
      </p>
    </div>
  )
}

/** Bouton primaire large (action principale : Déposer une annonce…). */
function AminataPrimaryButton({
  gradient,
  icon,
  label,
  onClick,
}: {
  gradient: string
  icon: React.ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-4 text-sm font-bold uppercase tracking-wide text-white transition-all hover:-translate-y-0.5 active:scale-[0.98]"
      style={{
        background: gradient,
        boxShadow: '0 10px 25px rgba(0,0,0,0.18)',
        fontFamily: '"Inter", system-ui, sans-serif',
      }}
    >
      {icon}
      <span style={PLAYFAIR_FONT} className="text-[15px]">
        {label}
      </span>
    </button>
  )
}

/** Chip de filtre rond, actif/inactif. */
function AminataFilterChip({
  label,
  active,
  color,
  onClick,
}: {
  label: string
  active: boolean
  color: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'shrink-0 rounded-full px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-wide transition-all',
        active
          ? 'text-white'
          : 'bg-white text-[#1F2937]/70 ring-1 ring-[#E5E7EB] hover:ring-[#9CA3AF]',
      )}
      style={
        active
          ? {
              backgroundColor: color,
              boxShadow: `0 6px 14px ${color}55`,
            }
          : undefined
      }
    >
      {label}
    </button>
  )
}

// ============================================================
// Configuration des 5 modules (banner d'accueil Aminata)
// ============================================================

type ModuleId = 'urgence' | 'signalement' | 'orientation' | 'artisans' | 'mairie' | 'tax_fraud' | 'itineraire' | 'annonces' | 'sante' | 'quartier_ads' | 'ecoles'

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
    id: 'tax_fraud',
    emoji: '📡',
    title: 'PROTÉGEZ MON QUARTIER',
    desc: 'Camion · Conteneur · Chantier',
    sub: 'ANTI-FRAUDE IA · Récompense',
    color: '#8B0000',
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
    id: 'artisans',
    emoji: '🔨',
    title: 'ARTISANS & COMMERCES',
    desc: 'Plombier · Électricien · Boutiques',
    sub: 'Triés par distance',
    color: COLORS.green,
  },
  {
    id: 'sante',
    emoji: '⚕️',
    title: 'SANTÉ',
    desc: 'Pharmacies · Cliniques · Médecins',
    sub: 'URGENCES & SOINS',
    color: COLORS.green,
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
    id: 'quartier_ads',
    emoji: '🧳',
    title: 'ANNONCES DU QUARTIER',
    desc: 'Ventes · Dons · Services',
    sub: 'ENTRE PARTICULIERS',
    color: COLORS.green,
  },
  {
    id: 'ecoles',
    emoji: '🎓',
    title: 'ÉCOLES & COURS',
    desc: 'Établissements · Soutien · Formation',
    sub: 'AUTOUR DE VOUS',
    color: COLORS.blue,
  },
]

// ============================================================
// Thèmes visuels pour la page citoyenne QR
// ------------------------------------------------------------
// signaletique = style actuel (couleurs pleines, Arial, fond blanc)
// modern       = style alternatif (dégradés, Inter, fond crème,
//                tuiles d'icônes semi-transparentes)
// Sélectionné par la mairie via GET /api/city/qr-theme
// ============================================================

type QrTheme = 'signaletique' | 'modern'

type ThemeModuleStyle = { bg: string; textColor: string; iconBg: string }

type ThemeConfig = {
  pageBg: string
  headerBg: string
  headerRadius: string
  cardRadius: string
  fontFamily: string
  iconTileBg: string
  iconTileRadius: string
  liveBarBg: string
  liveBarText: string
  modules: Record<ModuleId, ThemeModuleStyle>
}

const THEMES: Record<QrTheme, ThemeConfig> = {
  signaletique: {
    pageBg: '#FFFFFF',
    headerBg: '#0026A3',
    headerRadius: '32px',
    cardRadius: '16px',
    fontFamily: 'Arial, Helvetica, sans-serif',
    iconTileBg: '#FFFFFF',
    iconTileRadius: '12px',
    liveBarBg: '#1A1A1A',
    liveBarText: '#FFD700',
    modules: {
      urgence:      { bg: '#E30613', textColor: '#FFFFFF', iconBg: '#FFFFFF' },
      signalement:  { bg: '#FFD700', textColor: '#1A1A1A', iconBg: '#FFFFFF' },
      orientation:  { bg: '#FFD700', textColor: '#1A1A1A', iconBg: '#FFFFFF' },
      artisans:     { bg: '#FFD700', textColor: '#1A1A1A', iconBg: '#FFFFFF' },
      mairie:       { bg: '#0026A3', textColor: '#FFFFFF', iconBg: '#FFFFFF' },
      tax_fraud:    { bg: '#FFD700', textColor: '#1A1A1A', iconBg: '#FFFFFF' },
      itineraire:   { bg: '#FFD700', textColor: '#1A1A1A', iconBg: '#FFFFFF' },
      annonces:     { bg: '#FFD700', textColor: '#1A1A1A', iconBg: '#FFFFFF' },
      sante:        { bg: '#FFD700', textColor: '#1A1A1A', iconBg: '#FFFFFF' },
      quartier_ads: { bg: '#FFD700', textColor: '#1A1A1A', iconBg: '#FFFFFF' },
      ecoles:       { bg: '#FFD700', textColor: '#1A1A1A', iconBg: '#FFFFFF' },
    },
  },
  modern: {
    pageBg: '#FFFBEB',
    headerBg: 'linear-gradient(135deg, #1E3A8A 0%, #1E40AF 100%)',
    headerRadius: '24px',
    cardRadius: '18px',
    fontFamily: "'Inter', sans-serif",
    iconTileBg: 'rgba(255,255,255,0.2)',
    iconTileRadius: '14px',
    liveBarBg: 'linear-gradient(135deg, #1E3A8A 0%, #1E40AF 100%)',
    liveBarText: '#FFD700',
    modules: {
      urgence:      { bg: 'linear-gradient(135deg, #DC2626 0%, #991B1B 100%)', textColor: '#FFFFFF', iconBg: 'rgba(255,255,255,0.2)' },
      signalement:  { bg: 'linear-gradient(135deg, #FFD700 0%, #F59E0B 100%)', textColor: '#1F2937', iconBg: 'rgba(0,0,0,0.1)' },
      orientation:  { bg: 'linear-gradient(135deg, #3B82F6 0%, #1E40AF 100%)', textColor: '#FFFFFF', iconBg: 'rgba(255,255,255,0.2)' },
      artisans:     { bg: 'linear-gradient(135deg, #10B981 0%, #059669 100%)', textColor: '#FFFFFF', iconBg: 'rgba(255,255,255,0.2)' },
      mairie:       { bg: 'linear-gradient(135deg, #1E3A8A 0%, #1E40AF 100%)', textColor: '#FFFFFF', iconBg: 'rgba(255,255,255,0.2)' },
      tax_fraud:    { bg: 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)', textColor: '#FFFFFF', iconBg: 'rgba(255,255,255,0.2)' },
      itineraire:   { bg: 'linear-gradient(135deg, #3B82F6 0%, #1E40AF 100%)', textColor: '#FFFFFF', iconBg: 'rgba(255,255,255,0.2)' },
      annonces:     { bg: 'linear-gradient(135deg, #FFD700 0%, #F59E0B 100%)', textColor: '#1F2937', iconBg: 'rgba(0,0,0,0.1)' },
      sante:        { bg: 'linear-gradient(135deg, #10B981 0%, #059669 100%)', textColor: '#FFFFFF', iconBg: 'rgba(255,255,255,0.2)' },
      quartier_ads: { bg: 'linear-gradient(135deg, #F97316 0%, #EA580C 100%)', textColor: '#FFFFFF', iconBg: 'rgba(255,255,255,0.2)' },
      ecoles:       { bg: 'linear-gradient(135deg, #6B4C9A 0%, #4A3570 100%)', textColor: '#FFFFFF', iconBg: 'rgba(255,255,255,0.2)' },
    },
  },
}

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
  tint: string // couleur unie (hex) servant de teinte de fond + accent
}

const CATEGORIES: ReadonlyArray<CategoryConfig> = [
  { id: 'voirie', emoji: '🛣️', label: 'Voirie', hint: 'Nid-de-poule, trou, chaussée', service: 'Mairie', tint: '#3B82F6' },
  { id: 'éclairage', emoji: '💡', label: 'Éclairage', hint: 'Lampadaire en panne', service: 'Senelec', Icon: Lightbulb, tint: '#F59E0B' },
  { id: 'eau', emoji: '💧', label: 'Eau', hint: 'Fuite, coupure, débordement', service: 'ONAS', Icon: Droplet, tint: '#06B6D4' },
  { id: 'propreté', emoji: '🗑️', label: 'Propreté', hint: 'Déchets, tags, dépôt sauvage', service: 'Mairie', Icon: Trash2, tint: '#10B981' },
  { id: 'sécurité', emoji: '🔒', label: 'Sécurité', hint: 'Incivilité, trouble, agression', service: 'Police', Icon: Lock, tint: '#EF4444' },
  { id: 'transport', emoji: '🚌', label: 'Transport', hint: 'Arrêt, bus, gare routière', service: 'Mairie', tint: '#8B5CF6' },
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
 * Retourne l'incident créé (avec assignedTo calculé serveur) + les URLs
 * WhatsApp de notification (agent + confirmation citoyen si téléphone
 * trouvé), ou une erreur.
 */
async function postIncident(payload: {
  qrToken: string
  type: string
  category?: string
  description?: string
  gpsLat?: number
  gpsLng?: number
  citizenPhone?: string
}): Promise<
  | {
      ok: true
      incident: CityIncident
      whatsapp?: {
        agent: { phone: string | null; message: string; url: string }
        citizen: { phone: string; message: string; url: string } | null
      }
    }
  | { ok: false; error: string }
> {
  try {
    const res = await fetch('/api/city/incidents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const json = (await res.json().catch(() => null)) as {
      ok: boolean
      data?: {
        incident?: CityIncident
        whatsapp?: {
          agent: { phone: string | null; message: string; url: string }
          citizen: { phone: string; message: string; url: string } | null
        }
      }
      error?: string
    } | null
    if (json?.ok && json.data?.incident) {
      return {
        ok: true,
        incident: json.data.incident,
        whatsapp: json.data.whatsapp,
      }
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
  { id: 'Téléphonie',  label: 'Téléphonie',   color: '#0026A3' },
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

  // --- Thème visuel de la page citoyenne (signaletique | modern) ---
  // Récupéré une fois au montage depuis /api/city/qr-theme.
  // Par défaut 'signaletique' (style actuel) tant que l'API n'a pas répondu.
  const [qrTheme, setQrTheme] = useState<QrTheme>('signaletique')
  useEffect(() => {
    fetch('/api/city/qr-theme', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d: { ok?: boolean; data?: { theme?: QrTheme } }) => {
        if (d?.ok && d.data?.theme) setQrTheme(d.data.theme)
      })
      .catch(() => {})
  }, [])

  // --- Configuration personnalisable du QR citoyen ---
  // Titre / sous-titre d'accueil et services municipaux, configurables
  // par la mairie via /api/city/qr-config. Récupéré une fois au montage.
  // Tant que l'API n'a pas répondu, qrConfig reste null → les vues utilisent
  // leurs valeurs codées en dur (isNight greeting, MAIRIE_SERVICES…).
  const [qrConfig, setQrConfig] = useState<{
    qrTitle: string
    qrSubtitle: string
    mairieServices: Array<{ label: string; phone: string }>
  } | null>(null)
  useEffect(() => {
    fetch('/api/city/qr-config', { cache: 'no-store' })
      .then((r) => r.json())
      .then(
        (d: {
          ok?: boolean
          data?: {
            qrTitle?: string
            qrSubtitle?: string
            mairieServices?: Array<{ label: string; phone: string }>
          }
        }) => {
          if (d?.ok && d.data) {
            setQrConfig({
              qrTitle: d.data.qrTitle ?? '',
              qrSubtitle: d.data.qrSubtitle ?? '',
              mairieServices: Array.isArray(d.data.mairieServices)
                ? d.data.mairieServices
                : [],
            })
          }
        },
      )
      .catch(() => {})
  }, [])

  // --- Logo de la mairie (affiché sur la page d'entrée + page principale) ---
  const [welcomeLogo, setWelcomeLogo] = useState<string | null>(null)
  useEffect(() => {
    fetch('/api/city/logo')
      .then((r) => r.json())
      .then((d: { ok?: boolean; data?: { logoUrl?: string | null } }) => {
        if (d?.ok && d.data?.logoUrl) setWelcomeLogo(d.data.logoUrl)
      })
      .catch(() => {})
  }, [])

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
        // Téléphone citoyen (si le citoyen s'est inscrit via la modale
        // d'inscription légère) : permet au serveur de générer un message
        // WhatsApp de confirmation à destination du citoyen.
        citizenPhone: citizenPhone ?? undefined,
      })

      setSubmitting(false)

      if (!result.ok) {
        toast({
          title: 'Envoi impossible',
          description: result.error,
        })
        return
      }

      // WhatsApp — si le serveur a généré un lien de confirmation citoyen
      // (citizenPhone fourni OU extrait de la description), on l'ouvre dans
      // un nouvel onglet pour que le citoyen reçoive sa référence. V1 : le
      // clic reste manuel côté citoyen (zéro coût API WhatsApp Cloud).
      if (result.whatsapp?.citizen?.url && typeof window !== 'undefined') {
        window.open(result.whatsapp.citizen.url, '_blank', 'noopener,noreferrer')
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
    [plate, gpsConsent, citizenPhone, toast],
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
  //     NOTE — la voix (parler) est déclenchée côté <BusinessCard> dans le geste
  //     utilisateur (iOS Safari exige que speechSynthesis.speak() soit appelé
  //     synchronement dans le handler de clic). On ne parle PAS ici pour éviter
  //     une double synthèse entre le bouton Appeler et le bouton WhatsApp.
  // ---------------------------------------------------------------
  const handleContactBusiness = useCallback(
    (business: CityBusiness) => {
      // VOIX — avant toute opération (geste utilisateur iOS).
      // Le message précis (Appeler vs WhatsApp) est prononcé côté <BusinessCard>.
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

  // Lien Google Fonts Inter — injecté uniquement si le thème 'modern'
  // est actif. Next.js hoiste automatiquement ce <link> vers le <head>.
  const interFontLinkEl = qrTheme === 'modern' ? (
    <link
      href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap"
      rel="stylesheet"
    />
  ) : null

  // ---------------------------------------------------------------
  // 6.1. Phase loading
  // ---------------------------------------------------------------
  if (phase === 'loading') {
    return (
      <div className={rootClass} style={rootStyle}>
        {interFontLinkEl}
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

    const tcWelcome = THEMES[qrTheme]
    return (
      <div className={rootClass} style={rootStyle}>
        {interFontLinkEl}
        {/* Fond bleu signalétique (harmonisé avec header page principale) */}
        <div
          className="flex min-h-screen flex-col items-center justify-center px-6 text-center"
          style={{ background: tcWelcome.headerBg }}
        >
          {/* Carte d'accueil — tuile blanche arrondie (style signalétique) */}
          <div
            className="relative z-10 w-full max-w-sm rounded-3xl bg-white p-8 shadow-2xl"
            style={{ borderRadius: '28px' }}
          >
            {/* Avatar — logo de la mairie (ou emoji fallback) */}
            <div className="relative mx-auto mb-5">
              <div
                className="flex h-32 w-32 items-center justify-center rounded-2xl shadow-lg mx-auto overflow-hidden"
                style={{
                  background: welcomeLogo ? '#FFFFFF' : '#FFD700',
                  borderRadius: '20px',
                }}
              >
                {welcomeLogo ? (
                  <img src={welcomeLogo} alt="Logo mairie" className="h-28 w-28 rounded-xl object-cover" />
                ) : (
                  <span className="text-6xl">👋</span>
                )}
              </div>
              {/* Anneau pulsant jaune */}
              <div
                className="absolute inset-0 rounded-2xl mx-auto"
                style={{
                  border: '3px solid rgba(255,221,0,0.5)',
                  borderRadius: '22px',
                  animation: 'pulse 2s infinite',
                  width: '128px',
                  height: '128px',
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
            <p className="mb-6 text-sm font-bold uppercase tracking-wider text-[#0026A3]">
              Votre guide citoyenne
            </p>

            {/* Carte lieu — tuile bleue signalétique */}
            <div
              className="mb-6 flex items-center gap-3 rounded-2xl p-4"
              style={{ background: tcWelcome.headerBg, borderRadius: tcWelcome.cardRadius }}
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
                background: '#FFD700',
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
        {interFontLinkEl}
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
        {interFontLinkEl}
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
        {interFontLinkEl}
        <SubViewShell
          plate={plate}
          module={MODULES.find((m) => m.id === activeModule)!}
          onBack={backToMain}
          theme={qrTheme}
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
            <MairieView currentHour={currentHour} plate={plate} qrConfig={qrConfig} />
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
          {activeModule === 'quartier_ads' && <QuartierAdsView plate={plate} />}
          {activeModule === 'ecoles' && <SchoolsView plate={plate} />}
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
        {interFontLinkEl}
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
      {interFontLinkEl}
      <MainView plate={plate} onOpenModule={openModule} onExit={onExit} currentHour={currentHour} theme={qrTheme} qrConfig={qrConfig} />
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
  theme,
  qrConfig,
}: {
  plate: CityPlate
  onOpenModule: (id: ModuleId) => void
  onExit?: () => void
  currentHour: number
  theme: QrTheme
  qrConfig?: {
    qrTitle: string
    qrSubtitle: string
    mairieServices: Array<{ label: string; phone: string }>
  } | null
}) {
  const isNight = currentHour >= 22 || currentHour < 6

  // "Plus de services" — les 4 premiers modules sont toujours visibles,
  // les autres sont regroupés sous un bouton dépliable pour éviter
  // de surcharger la page d'accueil.
  const [showMoreServices, setShowMoreServices] = useState(false)

  // Logo de la mairie — fetch depuis l'API (stocké en base par le dashboard)
  const [mairieLogo, setMairieLogo] = useState<string | null>(null)
  useEffect(() => {
    fetch('/api/city/logo')
      .then((r) => r.json())
      .then((d) => {
        if (d?.ok && d.data?.logoUrl) setMairieLogo(d.data.logoUrl)
      })
      .catch(() => {})
  }, [])

  // --- PWA : "Aminata dans ma poche" ---
  // On capture l'événement `beforeinstallprompt` (Chrome/Edge Android) pour
  // pouvoir déclencher l'installation au clic. iOS Safari ne déclenche jamais
  // cet événement : on garde alors le bouton visible et on ouvre une MODALE
  // d'instructions manuelles (Partager → Sur l'écran d'accueil sur iOS,
  // menu ⋮ → Installer l'application sur Android). On masque aussi le bouton
  // quand la PWA est déjà lancée en mode standalone (installée).
  const { toast } = useToast()
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null)
  const [showInstallModal, setShowInstallModal] = useState(false)
  const installPlatform = useMemo(() => detectInstallPlatform(), [])
  const alreadyInstalled = useMemo(() => isRunningStandalone(), [])
  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e)
    }
    // L'événement appinstalled permet de recharger proprement vers la
    // PWA standalone (Chrome le déclenche après installation réussie).
    const installed = () => {
      setDeferredPrompt(null)
      toast({
        title: 'Aminata installée',
        description: 'L’application est maintenant sur votre écran d’accueil.',
      })
    }
    window.addEventListener('beforeinstallprompt', handler)
    window.addEventListener('appinstalled', installed)
    return () => {
      window.removeEventListener('beforeinstallprompt', handler)
      window.removeEventListener('appinstalled', installed)
    }
  }, [toast])

  // Configuration du thème visuel (signaletique = par défaut, modern = alternatif)
  // tc.modules[mod.id] fournit bg / textColor / iconBg par module.
  const tc = THEMES[theme]

  return (
    <div
      className="mx-auto min-h-screen max-w-md p-3"
      style={{ backgroundColor: tc.pageBg, fontFamily: tc.fontFamily }}
    >
      {/* === HEADER — panneau bleu signalétique arrondi === */}
      <header
        className="relative overflow-hidden px-5 pb-6 pt-5 shadow-xl"
        style={{ background: tc.headerBg, borderRadius: tc.headerRadius }}
      >
        {/* Top bar: logo */}
        <div className="flex items-center gap-3">
          {/* Tuile blanche avec logo mairie (ou emoji fallback) */}
          <div className="flex h-16 w-16 items-center justify-center bg-white" style={{ borderRadius: '14px' }}>
            {mairieLogo ? (
              <img src={mairieLogo} alt="Logo mairie" className="h-14 w-14 rounded-lg object-cover" />
            ) : (
              <span className="text-2xl">👋</span>
            )}
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
          {qrConfig?.qrTitle ?? (isNight ? 'Bonsoir, je suis Aminata.' : 'Bonjour, je suis Aminata.')}
        </h1>
        <p className="mt-1 text-sm text-white/80">
          {isNight ? '🌙 Service nuit actif.' : (qrConfig?.qrSubtitle ?? 'Je suis là pour vous aider dans votre quartier.')}
        </p>

        {/* Location — tuile blanche signalétique arrondie */}
        <div className="mt-4 flex items-center gap-3 bg-white px-4 py-3" style={{ borderRadius: '16px' }}>
          <div className="flex h-10 w-10 items-center justify-center bg-[#0026A3]" style={{ borderRadius: '10px' }}>
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

      {/* === PWA — "Aminata dans ma poche" (EN DESSOUS du header) === */}
      {!alreadyInstalled && (
        <button
          type="button"
          onClick={() => {
            if (deferredPrompt) {
              deferredPrompt.prompt()
              deferredPrompt.userChoice.then(
                (choice: { outcome: string }) => {
                  setDeferredPrompt(null)
                  if (choice?.outcome === 'accepted') {
                    toast({
                      title: 'Aminata installée',
                      description: 'L\'application est sur votre écran d\'accueil.',
                    })
                  }
                },
              )
            } else {
              setShowInstallModal(true)
            }
          }}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#0026A3] py-3.5 text-sm font-bold text-white shadow-lg transition-all hover:-translate-y-0.5 hover:shadow-xl active:scale-[0.98]"
          style={{ borderRadius: tc.cardRadius }}
          aria-label="Installer Aminata sur mon téléphone"
        >
          📱 Aminata dans ma poche — Installer l'application
        </button>
      )}

      <Dialog open={showInstallModal} onOpenChange={setShowInstallModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Installer Aminata sur mon téléphone</DialogTitle>
            <DialogDescription>
              Aminata fonctionne comme une application native, même hors
              connexion. Suivez les étapes selon votre téléphone.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 text-sm">
            {installPlatform === 'ios' && (
              <ol className="list-decimal space-y-2 pl-5 text-foreground">
                <li>
                  Appuyez sur le bouton <strong>Partager</strong>{' '}
                  <span aria-hidden="true">⎋</span> dans la barre du bas de
                  Safari.
                </li>
                <li>
                  Sélectionnez <strong>« Sur l'écran d'accueil »</strong>.
                </li>
                <li>
                  Appuyez sur <strong>Ajouter</strong> en haut à droite.
                </li>
              </ol>
            )}

            {installPlatform === 'android' && (
              <ol className="list-decimal space-y-2 pl-5 text-foreground">
                <li>
                  Appuyez sur le menu <strong>(⋮)</strong> en haut à droite
                  de Chrome.
                </li>
                <li>
                  Sélectionnez <strong>« Installer l'application »</strong>.
                </li>
                <li>Confirmez en appuyant sur <strong>Installer</strong>.</li>
              </ol>
            )}

            {installPlatform === 'desktop' && (
              <ol className="list-decimal space-y-2 pl-5 text-foreground">
                <li>
                  Cliquez sur l'icône <strong>Installer</strong>{' '}
                  <span aria-hidden="true">⊕</span> dans la barre d'adresse
                  de Chrome/Edge.
                </li>
                <li>Confirmez l'installation.</li>
              </ol>
            )}

            <p className="rounded-md bg-muted p-3 text-xs text-muted-foreground">
              Astuce : une fois installée, Aminata s'ouvre en plein écran,
              comme une application, et reste disponible même sans réseau.
            </p>
          </div>

          <DialogFooter>
            <Button
              type="button"
              onClick={() => setShowInstallModal(false)}
            >
              J'ai compris
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* === LIVE BAR === */}
      <div
        className="mt-3 flex items-center justify-between px-5 py-2 text-[11px] font-bold uppercase tracking-wider"
        style={{ background: tc.liveBarBg, color: tc.liveBarText, borderRadius: '12px' }}
      >
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-[#FFD700]" style={{ animation: 'pulse 1.5s infinite' }} />
          <span>EN DIRECT</span>
        </div>
        <span className="text-white/60">👥 1 247 CIT. CONNECTÉS</span>
      </div>

      {/* === PANNEAUX SIGNALÉTIQUES === */}
      <main className="mt-3 flex flex-col gap-3">
        {(showMoreServices ? MODULES : MODULES.slice(0, 4)).map((mod) => {
          // Couleurs du module depuis la config du thème
          const modStyle = tc.modules[mod.id]
          const isInverted = modStyle.textColor === '#FFFFFF'
          const bgColor = modStyle.bg
          const textColor = modStyle.textColor
          const tileBg = tc.iconTileBg
          const tileIconColor = isInverted ? '#1A1A1A' : '#1A1A1A'
          const arrowBg = isInverted ? '#FFFFFF' : '#FFFFFF'
          const arrowColor = '#1A1A1A'

          // Visual emphasis on the tax_fraud card : stronger shadow + red ring
          const isTaxFraud = mod.id === 'tax_fraud'

          return (
            <button
              key={mod.id}
              onClick={() => onOpenModule(mod.id)}
              className={cn(
                'group relative flex items-center gap-4 rounded-2xl p-4 shadow-lg transition-all hover:-translate-y-1 hover:shadow-2xl active:scale-[0.98]',
                isTaxFraud && 'ring-2 ring-[#E30613]/60 ring-offset-2',
              )}
              style={{
                background: bgColor,
                borderRadius: tc.cardRadius,
                color: textColor,
                ...(isTaxFraud
                  ? { boxShadow: '0 10px 25px rgba(227,6,19,0.25), 0 0 0 2px rgba(227,6,19,0.15)' }
                  : {}),
              }}
            >
              {/* Tuile icône blanche (gauche) */}
              <div
                className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl text-3xl transition-transform group-hover:scale-110"
                style={{
                  background: tileBg,
                  borderRadius: tc.iconTileRadius,
                }}
              >
                {mod.emoji}
              </div>

              {/* Texte central */}
              <div className="min-w-0 flex-1 text-left">
                <h2
                  className="text-base font-bold uppercase leading-tight tracking-wide"
                  style={{ color: textColor, fontFamily: tc.fontFamily }}
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
                  style={{ color: isInverted ? tc.liveBarText : '#0026A3' }}
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
                  className="absolute right-4 top-4 rounded-md bg-[#FFD700] px-2 py-0.5 text-[10px] font-bold uppercase text-[#1A1A1A]"
                >
                  SOS
                </span>
              )}
              {/* Badge ANTI-FRAUDE IA (tax_fraud) — emphase visuelle */}
              {mod.id === 'tax_fraud' && (
                <span
                  className="absolute -top-2.5 left-4 inline-flex items-center gap-1 rounded-full bg-[#E30613] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white shadow-md"
                  style={{ animation: 'sosPulse 2.5s infinite' }}
                >
                  <Sparkles className="size-2.5" />
                  ANTI-FRAUDE IA
                </span>
              )}
            </button>
          )
        })}

        {/* === BOUTON "PLUS DE SERVICES" === */}
        <button
          onClick={() => setShowMoreServices((v) => !v)}
          className="group flex items-center justify-center gap-3 rounded-2xl border-2 border-dashed py-4 text-center transition-all hover:-translate-y-0.5"
          style={{
            borderColor: showMoreServices ? '#E30613' : '#0026A3',
            borderRadius: tc.cardRadius,
            color: showMoreServices ? '#E30613' : '#0026A3',
            fontFamily: tc.fontFamily,
            background: showMoreServices ? 'rgba(227,6,19,0.03)' : 'rgba(27,42,140,0.03)',
          }}
        >
          <span className="text-sm font-bold uppercase tracking-wide">
            {showMoreServices ? 'Voir moins' : 'Plus de services'}
          </span>
          <svg
            className="transition-transform group-hover:scale-110"
            width="20" height="20" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
            style={{ transform: showMoreServices ? 'rotate(180deg)' : 'none' }}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
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
  theme,
  children,
}: {
  plate: CityPlate
  module: ModuleConfig
  onBack: () => void
  theme: QrTheme
  children: React.ReactNode
}) {
  // Configuration du thème visuel — les en-têtes de sous-vue utilisent
  // les mêmes couleurs (pleines ou dégradés) que les cartes de la page
  // principale, pour une cohérence visuelle totale.
  const tc = THEMES[theme]
  const modStyle = tc.modules[mod.id]
  const headerBg = modStyle.bg
  const headerText = modStyle.textColor
  const isInverted = headerText === '#FFFFFF'

  return (
    <div
      className="mx-auto flex min-h-screen max-w-md flex-col"
      style={{ backgroundColor: tc.pageBg, fontFamily: tc.fontFamily }}
    >
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
            className="flex h-14 w-14 items-center justify-center rounded-xl text-3xl"
            style={{ background: tc.iconTileBg, borderRadius: tc.iconTileRadius }}
          >
            {mod.emoji}
          </div>
          <div>
            <h1
              className="text-lg font-bold uppercase leading-tight tracking-wide"
              style={{ color: headerText, fontFamily: tc.fontFamily }}
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
          <Hand className="size-5 text-[#FFD700]" />
          <h3 className="text-sm font-bold text-white" style={TITLE_FONT}>
            SOS silencieux
          </h3>
        </div>
        <p className="mb-3 text-xs leading-relaxed text-white/75">
          Maintenez <strong className="text-[#FFD700]">3 secondes</strong> pour
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
                stroke="#FFD700"
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
            <p className="flex items-center gap-1.5 text-xs font-semibold text-[#FFD700]">
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
            <p className="text-xs font-semibold text-[#FFD700]">
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
        <div className="grid grid-cols-2 gap-4">
          {CATEGORIES.map((cat) => {
            const active = category === cat.id
            const Icon = cat.Icon
            return (
              <button
                key={cat.id}
                onClick={() => setCategory(cat.id)}
                className={cn(
                  'relative flex min-h-32 flex-col items-center rounded-2xl p-4 text-center shadow-sm transition-all',
                  active
                    ? 'ring-2 ring-[#FF6B00] ring-offset-2'
                    : 'hover:shadow-md hover:-translate-y-0.5',
                )}
                style={{
                  // Teinte de fond légère par catégorie (~8% opacité) +
                  // bordure gauche colorée quand inactif, orange quand actif.
                  backgroundColor: `${cat.tint}14`,
                  borderLeft: active ? '4px solid #FF6B00' : `4px solid ${cat.tint}`,
                }}
              >
                {Icon && (
                  <Icon
                    className="absolute right-2 top-2 size-4"
                    style={{ color: cat.tint }}
                  />
                )}
                <span className="text-4xl" aria-hidden>
                  {cat.emoji}
                </span>
                <p className="mt-2 text-sm font-bold text-[#1A1A1A]" style={TITLE_FONT}>
                  {cat.label}
                </p>
                <p className="mt-1 text-[11px] leading-tight text-[#1A1A1A]/55">{cat.hint}</p>
                <p
                  className="mt-2 text-[11px] font-semibold"
                  style={{ color: cat.tint }}
                >
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
// 3b. RestaurantOrderView — expérience de commande premium
//     Convertit un commerce "Restaurant" premium en carte de menu
//     immersive : hero, onglets catégories sticky, cartes plats avec
//     photo / prix / badges, tiroir panier, notes par plat, suivi de
//     commande, et envoi WhatsApp automatique au restaurateur.
// ============================================================

/** Palette Le Teranga — cream / brique / gold / charcoal / sage / terracotta. */
const RO_COLORS = {
  cream: '#FAF6F0',
  creamDark: '#F0E9DE',
  brique: '#9A3412',
  briqueDark: '#7C2D12',
  gold: '#C9A961',
  goldLight: '#E5D4A8',
  charcoal: '#1F2937',
  sage: '#2D8B6F',
  terracotta: '#C4785A',
} as const

const RO_TITLE_FONT: React.CSSProperties = {
  fontFamily: '"Playfair Display", Georgia, serif',
}

/** Plat enrichi pour le rendu — dérivé du menu brut du commerce. */
type RoMenuItem = {
  id: string
  cat: 'Entrées' | 'Plats' | 'Desserts' | 'Boissons'
  name: string
  desc: string
  price: number
  badge: 'pop' | 'veg' | 'chef' | null
  allerg: string
  photoUrl?: string | null
}

/** Ligne panier persistée en localStorage. */
type RoCartLine = {
  id: string
  name: string
  price: number
  photoUrl?: string | null
  qty: number
  note?: string
}

const RO_CATS = ['Tout', 'Entrées', 'Plats', 'Desserts', 'Boissons'] as const
const RO_SERVICE_RATE = 0.1 // service 10 % (sur la commande)

/**
 * Parse le menu brut (string JSON ou array) en une liste typée
 * RoMenuItem. Catégorisation, badges et allergènes sont déduits
 * heuristiquement depuis le nom du plat quand l'API ne les fournit pas.
 */
function parseRestaurantMenu(
  raw: CityBusiness['menu'],
): RoMenuItem[] {
  if (!raw) return []
  let arr: unknown = raw
  if (typeof raw === 'string') {
    try {
      arr = JSON.parse(raw)
    } catch {
      return []
    }
  }
  if (!Array.isArray(arr)) return []

  const lower = (s: string) => s.toLowerCase()
  return arr
    .filter((it): it is Record<string, unknown> => typeof it === 'object' && it !== null && 'name' in it)
    .map((it, idx): RoMenuItem => {
      const name = String(it.name ?? '')
      const n = lower(name)
      // Prix — accepte number, "2500", "2500 FCFA", "2 500 FCFA"
      let price = 0
      const rawPrice = it.price
      if (typeof rawPrice === 'number') {
        price = rawPrice
      } else if (typeof rawPrice === 'string') {
        const m = rawPrice.replace(/[^\d]/g, '')
        if (m) price = parseInt(m, 10)
      }
      // Catégorie heuristique
      let cat: RoMenuItem['cat'] = 'Plats'
      if (/(jus|bissap|gingembre|eau|boisson|soda|café|cafe|thé|the|bière|bierre|vin)/.test(n)) cat = 'Boissons'
      else if (/(salade|accras|beignet|soupe|entrée|entree|starter|tapas|brick|pastel)/.test(n)) cat = 'Entrées'
      else if (/(dessert|lakh|ananas|fruit|glace|gateau|gâteau|banana|banane|sucré|sucre|yaourt|caramel|nougat)/.test(n)) cat = 'Desserts'
      // Badge heuristique
      let badge: RoMenuItem['badge'] = null
      if (/(salade|papaye|végé|vege|vegetarien|végétarien|lentille|jus|bissap|gingembre)/.test(n)) badge = 'veg'
      else if (/(chef|signature|spécial|special|royal|teranga)/.test(n)) badge = 'chef'
      else if (idx === 0 || (idx === 1 && n.includes('thieb'))) badge = 'pop'
      // Allergènes heuristiques
      const allergs: string[] = []
      if (/(poisson|morue|thiof|crevette|crevette|sardine|merou)/.test(n)) allergs.push('Poisson')
      if (/(arachide|mafe|mafé|domoda|cacahuète|cacahuete|ngatha|arachide)/.test(n)) allergs.push('Arachide')
      if (/(accras|beignet|gateau|gâteau|lakh|pain|farine|blé|ble)/.test(n)) allergs.push('Gluten')
      if (/(lakh|lait|yaourt|creme|crème|fromage)/.test(n)) allergs.push('Lait')
      const allerg = allergs.length ? allergs.join(', ') : '—'
      // Description auto-courte
      const desc = it.desc
        ? String(it.desc).slice(0, 120)
        : cat === 'Boissons'
          ? 'Boisson fraîche maison, servie bien fraîche.'
          : cat === 'Desserts'
            ? 'Douceur de fin de repas, faite maison.'
            : cat === 'Entrées'
              ? 'Entrée légère pour ouvrir l\'appétit.'
              : 'Plat signature préparé minute par notre chef.'
      return {
        id: `item-${idx}-${name.replace(/\s+/g, '-').toLowerCase().slice(0, 24)}`,
        cat,
        name,
        desc,
        price,
        badge,
        allerg,
        photoUrl: (it.photoUrl as string | null | undefined) ?? null,
      }
    })
}

function RestaurantOrderView({
  business,
  plate,
  onClose,
}: {
  business: CityBusiness
  plate: CityPlate
  onClose: () => void
}) {
  // --- Menu dérivé (stable) ---
  const menu = useMemo(() => parseRestaurantMenu(business.menu), [business.menu])
  const menuById = useMemo(() => {
    const m: Record<string, RoMenuItem> = {}
    for (const it of menu) m[it.id] = it
    return m
  }, [menu])

  // --- État persistant ---
  const lsKey = `cart_${business.name}`
  const [cart, setCart] = useState<RoCartLine[]>([])
  const [cartOpen, setCartOpen] = useState(false)
  const [orderMode, setOrderMode] = useState<'livrer' | 'recuperer'>('recuperer')
  const [darkMode, setDarkMode] = useState(false)
  const [activeCat, setActiveCat] = useState<string>('Tout')
  const [orderRef, setOrderRef] = useState<string | null>(null)
  const [orderStep, setOrderStep] = useState<0 | 1 | 2 | 3>(0)
  const [noteTarget, setNoteTarget] = useState<RoCartLine | null>(null)
  const [noteDraft, setNoteDraft] = useState('')
  const [cartBump, setCartBump] = useState(false)
  const [flyItems, setFlyItems] = useState<
    Array<{ id: string; src: string; fromX: number; fromY: number; toX: number; toY: number }>
  >([])
  const cartFabRef = useRef<HTMLDivElement>(null)
  const trackingTimers = useRef<Array<ReturnType<typeof setTimeout>>>([])

  // --- Hydratation localStorage ---
  useEffect(() => {
    try {
      const raw = localStorage.getItem(lsKey)
      if (raw) {
        const p = JSON.parse(raw)
        if (p && Array.isArray(p.cart)) setCart(p.cart)
        if (p && (p.orderMode === 'livrer' || p.orderMode === 'recuperer')) setOrderMode(p.orderMode)
      }
      const t = localStorage.getItem(`${lsKey}_theme`)
      if (t === 'dark') setDarkMode(true)
    } catch {
      /* ignore */
    }
  }, [lsKey])

  // --- Persistance localStorage ---
  useEffect(() => {
    try {
      localStorage.setItem(lsKey, JSON.stringify({ cart, orderMode }))
    } catch {
      /* ignore */
    }
  }, [cart, orderMode, lsKey])

  useEffect(() => {
    try {
      localStorage.setItem(`${lsKey}_theme`, darkMode ? 'dark' : 'light')
    } catch {
      /* ignore */
    }
  }, [darkMode, lsKey])

  // --- Cleanup des timers de tracking au démontage ---
  useEffect(() => {
    return () => {
      trackingTimers.current.forEach(clearTimeout)
      trackingTimers.current = []
    }
  }, [])

  // --- Totaux ---
  const totals = useMemo(() => {
    const count = cart.reduce((s, l) => s + l.qty, 0)
    const sub = cart.reduce((s, l) => s + l.price * l.qty, 0)
    const service = Math.round(sub * RO_SERVICE_RATE)
    return { count, sub, service, total: sub + service }
  }, [cart])

  // --- Sections affichées selon l'onglet actif ---
  const visibleCats = useMemo(() => {
    if (activeCat === 'Tout') return ['Entrées', 'Plats', 'Desserts', 'Boissons'] as const
    return [activeCat as 'Entrées' | 'Plats' | 'Desserts' | 'Boissons']
  }, [activeCat])

  const fmt = (n: number) => `${n.toLocaleString('fr-FR')} FCFA`

  // --- Couleurs dépendant du thème ---
  const themeVars = darkMode
    ? { cream: '#0F0F0F', creamDark: '#1A1A1A', charcoal: '#F5F5F0' }
    : { cream: RO_COLORS.cream, creamDark: RO_COLORS.creamDark, charcoal: RO_COLORS.charcoal }

  // --- Helpers panier ---
  const findLine = (id: string) => cart.find((l) => l.id === id)

  const addToCart = (item: RoMenuItem, e: React.MouseEvent) => {
    setCart((prev) => {
      const existing = prev.find((l) => l.id === item.id)
      if (existing) {
        return prev.map((l) => (l.id === item.id ? { ...l, qty: l.qty + 1 } : l))
      }
      return [
        ...prev,
        { id: item.id, name: item.name, price: item.price, photoUrl: item.photoUrl ?? null, qty: 1 },
      ]
    })
    // bump animation
    setCartBump(false)
    requestAnimationFrame(() => setCartBump(true))
    // fly-to-cart animation
    const btn = e.currentTarget as HTMLElement
    const start = btn.getBoundingClientRect()
    const fab = cartFabRef.current
    if (fab && item.photoUrl) {
      const end = fab.getBoundingClientRect()
      const flyId = `fly-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      setFlyItems((prev) => [
        ...prev,
        {
          id: flyId,
          src: item.photoUrl,
          fromX: start.left + start.width / 2 - 20,
          fromY: start.top + start.height / 2 - 20,
          toX: end.left + end.width / 2 - 20,
          toY: end.top + 10,
        },
      ])
      setTimeout(() => {
        setFlyItems((prev) => prev.filter((f) => f.id !== flyId))
      }, 700)
    }
  }

  const changeQty = (id: string, delta: number) => {
    setCart((prev) => {
      const existing = prev.find((l) => l.id === id)
      if (!existing) return prev
      const nextQty = existing.qty + delta
      if (nextQty <= 0) return prev.filter((l) => l.id !== id)
      return prev.map((l) => (l.id === id ? { ...l, qty: nextQty } : l))
    })
  }

  // --- Notes ---
  const openNote = (line: RoCartLine) => {
    setNoteTarget(line)
    setNoteDraft(line.note ?? '')
  }
  const closeNote = () => {
    setNoteTarget(null)
    setNoteDraft('')
  }
  const saveNote = () => {
    if (!noteTarget) return
    const trimmed = noteDraft.trim()
    setCart((prev) =>
      prev.map((l) => (l.id === noteTarget.id ? { ...l, note: trimmed || undefined } : l)),
    )
    closeNote()
  }

  // --- Commande ---
  const buildWhatsAppUrl = (ref: string) => {
    const phone = (business.whatsapp ?? business.phone ?? '').replace(/[^\d]/g, '')
    if (!phone) return null
    const lines: string[] = []
    lines.push(`Bonjour ${business.name}, nouvelle commande ${ref}:`)
    for (const l of cart) {
      const notePart = l.note ? ` (${l.note})` : ''
      lines.push(`- ${l.qty}x ${l.name}${notePart} (${fmt(l.price)}) = ${fmt(l.price * l.qty)}`)
    }
    lines.push(`Sous-total: ${fmt(totals.sub)}`)
    lines.push(`Service (10%): ${fmt(totals.service)}`)
    lines.push(`Total: ${fmt(totals.total)}`)
    lines.push(`Mode: ${orderMode === 'livrer' ? 'Livraison' : 'À récupérer sur place'}`)
    lines.push(`Plaque: ${plate.plateNumber} - ${plate.district ?? plate.label}`)
    return `https://wa.me/${phone}?text=${encodeURIComponent(lines.join('\n'))}`
  }

  const placeOrder = () => {
    if (cart.length === 0) return
    // VOIX — Aminata confirme l'envoi en cuisine DANS le geste utilisateur
    // (clic sur le bouton). iOS Safari et Chrome mobile exigent que
    // speechSynthesis.speak() soit appelé synchronement dans un handler de
    // geste ; on parle donc ICI, avant window.open et les setTimeout.
    try {
      parler('Commande envoyée en cuisine.')
    } catch {
      /* ignore — synthèse vocale indisponible */
    }
    const ref = `CMD-${Math.floor(1000 + Math.random() * 9000)}`
    setOrderRef(ref)
    setOrderStep(1)
    setCartOpen(false)
    // Vider le panier (la commande est partie)
    setCart([])
    // Ouvrir WhatsApp (peut être bloqué — fallback manuel via bouton)
    const url = buildWhatsAppUrl(ref)
    if (url) {
      try {
        window.open(url, '_blank', 'noopener,noreferrer')
      } catch {
        /* ignore — l'utilisateur peut cliquer le bouton manuel */
      }
    }
    // Simulation de suivi (en prod : WebSocket / polling API)
    trackingTimers.current.forEach(clearTimeout)
    trackingTimers.current = []
    trackingTimers.current.push(setTimeout(() => setOrderStep(2), 4000))
    trackingTimers.current.push(setTimeout(() => setOrderStep(3), 9000))
  }

  const closeTracking = () => {
    setOrderRef(null)
    setOrderStep(0)
    trackingTimers.current.forEach(clearTimeout)
    trackingTimers.current = []
  }

  // --- Backgrounds du hero ---
  const heroBg =
    business.photoUrl ||
    'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=800&q=80'

  const plaqueLabel = `Plaque ${plate.plateNumber} · ${plate.district ?? plate.label}`

  // --- Render ---
  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col overflow-y-auto"
      style={{
        backgroundColor: themeVars.cream,
        color: themeVars.charcoal,
        fontFamily: '"Inter", system-ui, sans-serif',
        transition: 'background 0.5s ease, color 0.5s ease',
      }}
    >
      {/* Polices Playfair Display + Inter */}
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500&family=Inter:wght@300;400;500;600;700;800&display=swap"
      />
      {/* Keyframes locales (fly-to-cart + pulse + scaleIn + popIn + bump) */}
      <style>{`
        @keyframes roFlyToCart {
          0%   { left: var(--from-x); top: var(--from-y); transform: scale(1); opacity: 1; }
          100% { left: var(--to-x);  top: var(--to-y);  transform: scale(0.3); opacity: 0; }
        }
        @keyframes roPulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        @keyframes roScaleIn { from{transform:scale(0);opacity:0} to{transform:scale(1);opacity:1} }
        @keyframes roPopIn { from{transform:scale(0.9);opacity:0} to{transform:scale(1);opacity:1} }
        @keyframes roBump { 0%{transform:scale(1)} 50%{transform:scale(1.35)} 100%{transform:scale(1)} }
        .ro-scroll::-webkit-scrollbar { display: none; }
        .ro-scroll { scrollbar-width: none; }
      `}</style>

      {/* ============ HERO ============ */}
      <header
        className="relative overflow-hidden"
        style={{ height: 240, flexShrink: 0 }}
      >
        <img
          src={heroBg}
          alt={business.name}
          className="h-full w-full object-cover"
          style={{ filter: 'brightness(0.7)' }}
        />
        <div
          className="absolute inset-0 flex flex-col justify-between"
          style={{
            background:
              'linear-gradient(180deg, rgba(154,52,18,0.3) 0%, rgba(31,41,55,0.85) 100%)',
            padding: '1.2rem 1.5rem',
          }}
        >
          {/* Top row */}
          <div className="flex items-start justify-between">
            <div
              className="flex items-center gap-2 rounded-2xl px-3 py-2"
              style={{
                background: 'rgba(255,255,255,0.15)',
                backdropFilter: 'blur(15px)',
                border: '1px solid rgba(201,169,97,0.5)',
                color: 'white',
              }}
            >
              <button
                onClick={onClose}
                className="flex h-7 w-7 items-center justify-center rounded-full"
                style={{ background: 'rgba(255,255,255,0.2)' }}
                aria-label="Retour aux commerces"
              >
                <ArrowLeft className="size-4" />
              </button>
              <div>
                <div
                  className="leading-none"
                  style={{ ...RO_TITLE_FONT, fontSize: '1.1rem', fontWeight: 700, color: RO_COLORS.gold }}
                >
                  {plate.plateNumber}
                </div>
                <div
                  className="leading-none"
                  style={{ fontSize: '0.6rem', letterSpacing: '0.15em', textTransform: 'uppercase', opacity: 0.85 }}
                >
                  {plate.district ?? plate.label}
                </div>
              </div>
            </div>

            <button
              onClick={() => setDarkMode((v) => !v)}
              className="flex h-10 w-10 items-center justify-center rounded-full text-white transition-all hover:rotate-12"
              style={{
                background: 'rgba(255,255,255,0.15)',
                backdropFilter: 'blur(15px)',
                border: '1px solid rgba(255,255,255,0.25)',
              }}
              aria-label="Changer de thème"
            >
              {darkMode ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </button>
          </div>

          {/* Bottom row : name + tagline + mode toggle */}
          <div className="text-white">
            <h1
              style={{ ...RO_TITLE_FONT, fontSize: '1.9rem', fontWeight: 700, textShadow: '0 2px 10px rgba(0,0,0,0.3)', marginBottom: '0.2rem' }}
            >
              {business.name}
            </h1>
            <p style={{ fontSize: '0.85rem', fontStyle: 'italic', opacity: 0.9 }}>
              {business.trade || business.description || 'Cuisine locale · préparée minute'}
            </p>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              {/* Mode de remise déplacé vers le tiroir panier (avant « Envoyer en cuisine ») */}

              {/* Statut ouvert */}
              <div
                className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.72rem] font-bold"
                style={{
                  background: 'rgba(45,139,111,0.3)',
                  border: '1px solid rgba(45,139,111,0.5)',
                }}
              >
                <span
                  className="inline-block size-1.5 rounded-full"
                  style={{ background: '#4ADE80', animation: 'roPulse 2s infinite' }}
                />
                Ouvert · Service en cours
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* ============ ONGLETS CATÉGORIES STICKY ============ */}
      <nav
        className="sticky top-0 z-40 flex gap-2 overflow-x-auto px-4 py-3.5"
        style={{
          background: themeVars.cream,
          borderBottom: '1px solid rgba(154,52,18,0.1)',
        }}
      >
        {RO_CATS.map((c) => {
          const active = activeCat === c
          const count =
            c === 'Tout'
              ? menu.length
              : menu.filter((m) => m.cat === c).length
          return (
            <button
              key={c}
              onClick={() => setActiveCat(c)}
              className="shrink-0 rounded-full px-4 py-2 text-xs font-bold transition-all"
              style={{
                background: active ? RO_COLORS.brique : themeVars.creamDark,
                color: active ? 'white' : themeVars.charcoal,
                border: `1.5px solid ${active ? RO_COLORS.brique : 'transparent'}`,
                boxShadow: active ? '0 4px 12px rgba(154,52,18,0.3)' : 'none',
              }}
            >
              {c} <span style={{ opacity: 0.7 }}>{count}</span>
            </button>
          )
        })}
      </nav>

      {/* ============ MENU ============ */}
      <main className="mx-auto w-full max-w-[560px] flex-1 px-4 pb-32 pt-4">
        {menu.length === 0 ? (
          <div className="rounded-2xl p-8 text-center" style={{ background: themeVars.creamDark }}>
            <Utensils className="mx-auto size-10" style={{ opacity: 0.3 }} />
            <p className="mt-3 text-sm font-semibold" style={RO_TITLE_FONT}>
              Menu indisponible
            </p>
            <p className="mt-1 text-xs" style={{ opacity: 0.6 }}>
              Ce restaurant n'a pas encore publié son menu. Contactez-le directement.
            </p>
          </div>
        ) : (
          visibleCats.map((cat) => {
            const dishes = menu.filter((m) => m.cat === cat)
            if (!dishes.length) return null
            return (
              <section key={cat} className="mb-6">
                <div className="mb-3 flex items-baseline gap-2">
                  <h2 style={{ ...RO_TITLE_FONT, fontSize: '1.3rem', fontWeight: 700, color: themeVars.charcoal }}>
                    {cat}
                  </h2>
                  <span className="text-xs font-semibold" style={{ color: RO_COLORS.terracotta }}>
                    {dishes.length} plat{dishes.length > 1 ? 's' : ''}
                  </span>
                </div>
                <div className="space-y-3">
                  {dishes.map((d) => (
                    <DishCard
                      key={d.id}
                      item={d}
                      line={findLine(d.id)}
                      themeVars={themeVars}
                      onAdd={(e) => addToCart(d, e)}
                      onQty={(delta) => changeQty(d.id, delta)}
                    />
                  ))}
                </div>
              </section>
            )
          })
        )}
      </main>

      {/* ============ PANIER FLOTTANT ============ */}
      <div
        ref={cartFabRef}
        onClick={() => setCartOpen(true)}
        className="fixed bottom-4 left-4 right-4 z-50 mx-auto flex max-w-[560px] cursor-pointer items-center justify-between rounded-2xl px-5 py-3.5"
        style={{
          background: darkMode ? RO_COLORS.gold : RO_COLORS.charcoal,
          color: darkMode ? '#0F0F0F' : RO_COLORS.cream,
          boxShadow: '0 15px 40px rgba(31,41,55,0.4)',
          border: '1px solid rgba(201,169,97,0.3)',
          transform: totals.count > 0 ? 'translateY(0)' : 'translateY(140%)',
          transition: 'transform 0.4s cubic-bezier(0.4,0,0.2,1)',
          pointerEvents: totals.count > 0 ? 'auto' : 'none',
        }}
      >
        <div className="flex items-center gap-3">
          <div
            className="relative flex h-11 w-11 items-center justify-center rounded-xl"
            style={{ background: darkMode ? 'rgba(0,0,0,0.15)' : 'rgba(201,169,97,0.2)' }}
          >
            <ShoppingBag className="size-5" />
            <span
              key={cartBump ? 'bump-on' : 'bump-off'}
              className="absolute -right-1.5 -top-1.5 flex h-5 min-w-[22px] items-center justify-center rounded-full px-1 text-[0.7rem] font-extrabold"
              style={{
                background: RO_COLORS.brique,
                color: 'white',
                border: `2px solid ${darkMode ? RO_COLORS.gold : RO_COLORS.charcoal}`,
                animation: cartBump ? 'roBump 0.3s ease' : 'none',
              }}
            >
              {totals.count}
            </span>
          </div>
          <div>
            <div className="text-sm font-bold">Voir le panier</div>
            <div className="text-xs" style={{ opacity: 0.7 }}>
              {totals.count} article{totals.count > 1 ? 's' : ''} ·{' '}
              {orderMode === 'livrer' ? 'À livrer' : 'À récupérer'}
            </div>
          </div>
        </div>
        <div style={{ ...RO_TITLE_FONT, fontSize: '1.3rem', fontWeight: 700, color: darkMode ? '#0F0F0F' : RO_COLORS.gold }}>
          {fmt(totals.total)}
        </div>
      </div>

      {/* ============ BACKDROP PANIER ============ */}
      <div
        onClick={() => setCartOpen(false)}
        className="fixed inset-0 z-[60]"
        style={{
          background: 'rgba(0,0,0,0.5)',
          backdropFilter: 'blur(4px)',
          opacity: cartOpen ? 1 : 0,
          pointerEvents: cartOpen ? 'auto' : 'none',
          transition: 'opacity 0.3s ease',
        }}
      />

      {/* ============ TIROIR PANIER ============ */}
      <div
        className="fixed bottom-0 left-0 right-0 z-[70] mx-auto flex max-h-[85vh] flex-col"
        style={{
          maxWidth: 560,
          background: themeVars.cream,
          borderRadius: '28px 28px 0 0',
          boxShadow: '0 -10px 40px rgba(0,0,0,0.2)',
          transform: cartOpen ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 0.4s cubic-bezier(0.4,0,0.2,1)',
        }}
      >
        <div
          className="mx-auto mt-3.5 mb-1 h-1.5 w-11 rounded"
          style={{ background: 'rgba(154,52,18,0.3)' }}
        />
        <div
          className="flex items-center justify-between px-6 pb-4 pt-2"
          style={{ borderBottom: '1px solid rgba(154,52,18,0.1)' }}
        >
          <h3 style={{ ...RO_TITLE_FONT, fontSize: '1.3rem', fontWeight: 700, color: themeVars.charcoal }}>
            Votre commande
          </h3>
          <button
            onClick={() => setCartOpen(false)}
            className="flex h-9 w-9 items-center justify-center rounded-full transition-all hover:bg-[#9A3412] hover:text-white"
            style={{ background: themeVars.creamDark, color: themeVars.charcoal }}
            aria-label="Fermer le panier"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="ro-scroll flex-1 overflow-y-auto px-6 py-3">
          {totals.count === 0 ? (
            <div className="py-12 text-center" style={{ color: themeVars.charcoal, opacity: 0.5 }}>
              <ShoppingBag className="mx-auto size-14" style={{ opacity: 0.4 }} />
              <p className="mt-3 text-sm">
                Votre panier est vide.
                <br />
                Ajoutez un plat depuis le menu !
              </p>
            </div>
          ) : (
            cart.map((l) => (
              <div
                key={l.id}
                className="flex items-center gap-3.5 border-b py-3"
                style={{ borderBottom: '1px solid rgba(154,52,18,0.08)' }}
              >
                <DishThumb item={menuById[l.id]} photoUrl={l.photoUrl} cat={menuById[l.id]?.cat} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold" style={{ color: themeVars.charcoal }}>
                    {l.name}
                  </div>
                  <div className="text-xs font-semibold" style={{ color: RO_COLORS.brique }}>
                    {fmt(l.price)} / pièce
                  </div>
                  {l.note && (
                    <div className="mt-0.5 text-xs italic" style={{ color: RO_COLORS.sage }}>
                      📝 {l.note}
                    </div>
                  )}
                  <button
                    onClick={() => openNote(l)}
                    className="mt-1 text-xs underline"
                    style={{ color: RO_COLORS.terracotta, background: 'none', border: 'none', padding: 0 }}
                  >
                    {l.note ? 'Modifier la note' : '+ Ajouter une note'}
                  </button>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <div style={{ ...RO_TITLE_FONT, fontWeight: 700, color: themeVars.charcoal }}>
                    {fmt(l.price * l.qty)}
                  </div>
                  <div
                    className="flex items-center gap-2 rounded-full px-1.5 py-1"
                    style={{ background: themeVars.creamDark }}
                  >
                    <button
                      onClick={() => changeQty(l.id, -1)}
                      className="flex h-6 w-6 items-center justify-center rounded-full text-white"
                      style={{ background: RO_COLORS.brique }}
                      aria-label="Retirer un"
                    >
                      <Minus className="size-3" />
                    </button>
                    <span className="min-w-[16px] text-center text-sm font-bold">{l.qty}</span>
                    <button
                      onClick={() => changeQty(l.id, 1)}
                      className="flex h-6 w-6 items-center justify-center rounded-full text-white"
                      style={{ background: RO_COLORS.brique }}
                      aria-label="Ajouter un"
                    >
                      <Plus className="size-3" />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {totals.count > 0 && (
          <div className="px-6 pb-6 pt-3" style={{ borderTop: '1px solid rgba(154,52,18,0.1)' }}>
            <div className="mb-1 flex justify-between text-xs" style={{ color: themeVars.charcoal, opacity: 0.7 }}>
              <span>Sous-total</span>
              <span>{fmt(totals.sub)}</span>
            </div>
            <div className="mb-1 flex justify-between text-xs" style={{ color: themeVars.charcoal, opacity: 0.7 }}>
              <span>Service (10%)</span>
              <span>{fmt(totals.service)}</span>
            </div>
            <div
              className="flex justify-between border-t border-dashed pt-2.5"
              style={{ borderColor: 'rgba(154,52,18,0.2)', marginTop: '0.4rem', fontSize: '1.05rem', fontWeight: 700, color: themeVars.charcoal }}
            >
              <span>Total</span>
              <span style={{ ...RO_TITLE_FONT, color: RO_COLORS.brique, fontSize: '1.3rem' }}>
                {fmt(totals.total)}
              </span>
            </div>

            {/* Mode de remise : À livrer / À récupérer sur place */}
            <div className="mt-3">
              <div
                className="mb-1.5 text-xs font-bold uppercase tracking-wide"
                style={{ color: themeVars.charcoal, opacity: 0.6 }}
              >
                Mode de remise
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setOrderMode('livrer')}
                  className="flex items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-xs font-bold transition-all hover:-translate-y-0.5"
                  style={{
                    background: orderMode === 'livrer' ? RO_COLORS.brique : themeVars.creamDark,
                    color: orderMode === 'livrer' ? 'white' : themeVars.charcoal,
                    border: `1.5px solid ${orderMode === 'livrer' ? RO_COLORS.brique : 'rgba(154,52,18,0.15)'}`,
                    boxShadow: orderMode === 'livrer' ? '0 4px 12px rgba(154,52,18,0.25)' : 'none',
                  }}
                  aria-pressed={orderMode === 'livrer'}
                >
                  <span className="text-base" aria-hidden>🛵</span>
                  À livrer
                </button>
                <button
                  type="button"
                  onClick={() => setOrderMode('recuperer')}
                  className="flex items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-xs font-bold transition-all hover:-translate-y-0.5"
                  style={{
                    background: orderMode === 'recuperer' ? RO_COLORS.brique : themeVars.creamDark,
                    color: orderMode === 'recuperer' ? 'white' : themeVars.charcoal,
                    border: `1.5px solid ${orderMode === 'recuperer' ? RO_COLORS.brique : 'rgba(154,52,18,0.15)'}`,
                    boxShadow: orderMode === 'recuperer' ? '0 4px 12px rgba(154,52,18,0.25)' : 'none',
                  }}
                  aria-pressed={orderMode === 'recuperer'}
                >
                  <span className="text-base" aria-hidden>🍽️</span>
                  À récupérer sur place
                </button>
              </div>
            </div>

            <button
              onClick={placeOrder}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-base font-bold text-white transition-all hover:-translate-y-0.5"
              style={{
                background: 'linear-gradient(135deg, #9A3412 0%, #7C2D12 100%)',
                boxShadow: '0 8px 20px rgba(154,52,18,0.3)',
              }}
            >
              <Send className="size-4" />
              Envoyer en cuisine
            </button>
            <button
              onClick={() => setCart(cart.filter((l) => l.qty > 0))}
              className="mt-1.5 w-full text-center text-xs"
              style={{ color: RO_COLORS.terracotta, background: 'none', border: 'none' }}
            >
              <Trash2 className="mr-1 inline size-3" />
              Vider le panier
            </button>
          </div>
        )}
      </div>

      {/* ============ MODAL NOTE ============ */}
      {noteTarget && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center p-6"
          style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
          onClick={closeNote}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[380px] rounded-3xl p-6"
            style={{
              background: themeVars.cream,
              animation: 'roPopIn 0.3s ease',
            }}
          >
            <h4 style={{ ...RO_TITLE_FONT, fontSize: '1.15rem', marginBottom: '0.3rem', color: themeVars.charcoal }}>
              Une note pour le chef ?
            </h4>
            <p className="mb-3 text-xs" style={{ opacity: 0.6, color: themeVars.charcoal }}>
              {noteTarget.name}
            </p>
            <textarea
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              placeholder="Ex : sans piment, bien cuit, à partager..."
              className="w-full resize-none rounded-xl p-3 text-sm outline-none"
              style={{
                background: themeVars.creamDark,
                border: '1.5px solid rgba(154,52,18,0.2)',
                color: themeVars.charcoal,
                height: 90,
              }}
              autoFocus
            />
            <div className="mt-3 flex gap-2">
              <button
                onClick={closeNote}
                className="flex-1 rounded-xl py-2.5 text-sm font-bold"
                style={{ background: themeVars.creamDark, color: themeVars.charcoal }}
              >
                Annuler
              </button>
              <button
                onClick={saveNote}
                className="flex-1 rounded-xl py-2.5 text-sm font-bold text-white"
                style={{ background: RO_COLORS.brique }}
              >
                Enregistrer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============ ÉCRAN DE SUIVI DE COMMANDE ============ */}
      {orderRef && (
        <div
          className="fixed inset-0 z-[90] flex flex-col items-center justify-center p-6 text-center"
          style={{ background: themeVars.cream }}
        >
          <button
            onClick={onClose}
            className="absolute left-4 top-4 flex h-9 w-9 items-center justify-center rounded-full"
            style={{ background: themeVars.creamDark, color: themeVars.charcoal }}
            aria-label="Fermer"
          >
            <X className="size-5" />
          </button>

          <div
            className="mb-5 flex h-[90px] w-[90px] items-center justify-center rounded-full"
            style={{
              background: 'linear-gradient(135deg, #2D8B6F 0%, #1F6B50 100%)',
              boxShadow: '0 15px 40px rgba(45,139,111,0.4)',
              animation: 'roScaleIn 0.5s cubic-bezier(0.4,0,0.2,1)',
            }}
          >
            <CheckCircle2 className="size-11 text-white" />
          </div>
          <h2 style={{ ...RO_TITLE_FONT, fontSize: '1.7rem', fontWeight: 700, color: themeVars.charcoal }}>
            Commande envoyée !
          </h2>
          <div className="mb-3 mt-1 text-sm font-bold" style={{ color: RO_COLORS.brique }}>
            Réf. {orderRef} · {plaqueLabel}
          </div>
          <p className="mb-5 max-w-[300px] text-sm" style={{ color: themeVars.charcoal, opacity: 0.7, lineHeight: 1.5 }}>
            Le chef a reçu votre commande. Suivez sa préparation en temps réel ci-dessous.
          </p>

          {/* Suivi 3 étapes */}
          <div className="mb-5 flex items-center gap-1.5">
            <TrackStep
              icon={<ChefHat className="size-4" />}
              label="Reçue"
              state={orderStep >= 1 ? (orderStep > 1 ? 'done' : 'active') : 'idle'}
            />
            <TrackLine active={orderStep >= 2} />
            <TrackStep
              icon={<Flame className="size-4" />}
              label="En cuisine"
              state={orderStep >= 2 ? (orderStep > 2 ? 'done' : 'active') : 'idle'}
            />
            <TrackLine active={orderStep >= 3} />
            <TrackStep
              icon={<Check className="size-4" />}
              label="Prête"
              state={orderStep >= 3 ? 'active' : 'idle'}
            />
          </div>

          {/* Message contextuel selon l'étape */}
          <div
            className="mb-5 max-w-[300px] rounded-2xl px-4 py-3 text-xs font-semibold"
            style={{
              background: themeVars.creamDark,
              color: themeVars.charcoal,
            }}
          >
            {orderStep === 1 && '✓ Commande reçue par la cuisine. Le chef prépare ses ingrédients…'}
            {orderStep === 2 && '🔥 Cuisson en cours. Ça sent bon !'}
            {orderStep === 3 &&
              (orderMode === 'livrer'
                ? '✓ Le livreur est en route vers vous !'
                : '✓ Votre commande est prête ! Présentez-vous au comptoir.')}
          </div>

          {/* Bouton manuel WhatsApp (fallback si popup bloqué) */}
          {(() => {
            const url = buildWhatsAppUrl(orderRef)
            if (!url) return null
            return (
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="mb-2 flex w-full max-w-[280px] items-center justify-center gap-2 rounded-full py-2.5 text-sm font-bold text-white"
                style={{ background: '#25D366' }}
              >
                <MessageCircle className="size-4" />
                Renvoyer sur WhatsApp
              </a>
            )
          })()}

          <button
            onClick={closeTracking}
            className="rounded-full px-8 py-2.5 text-sm font-bold"
            style={{ background: themeVars.charcoal, color: themeVars.cream }}
          >
            Retour au menu
          </button>
        </div>
      )}

      {/* ============ ANIMATIONS FLY-TO-CART ============ */}
      {flyItems.map((f) => (
        <img
          key={f.id}
          src={f.src}
          alt=""
          className="pointer-events-none fixed z-[200] size-10 rounded-xl object-cover"
          style={
            {
              left: 0,
              top: 0,
              '--from-x': `${f.fromX}px`,
              '--from-y': `${f.fromY}px`,
              '--to-x': `${f.toX}px`,
              '--to-y': `${f.toY}px`,
              animation: 'roFlyToCart 0.6s cubic-bezier(0.5,-0.3,0.5,1) forwards',
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  )
}

/** Carte d'un plat — image, nom, badges, prix, allergènes, action Ajouter/Quantité. */
function DishCard({
  item,
  line,
  themeVars,
  onAdd,
  onQty,
}: {
  item: RoMenuItem
  line: RoCartLine | undefined
  themeVars: { cream: string; creamDark: string; charcoal: string }
  onAdd: (e: React.MouseEvent) => void
  onQty: (delta: number) => void
}) {
  return (
    <article
      className="flex gap-4 rounded-2xl p-3 transition-all"
      style={{
        background: themeVars.creamDark,
        border: '1.5px solid transparent',
      }}
    >
      <DishThumb item={item} photoUrl={item.photoUrl} cat={item.cat} />
      <div className="flex flex-1 flex-col">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[0.95rem] font-bold leading-tight" style={{ color: themeVars.charcoal }}>
              {item.name}
            </div>
            {item.badge && (
              <span
                className="mt-1 inline-block rounded-md px-2 py-0.5 text-[0.58rem] font-bold uppercase"
                style={{
                  letterSpacing: '0.05em',
                  background:
                    item.badge === 'pop'
                      ? 'rgba(201,169,97,0.2)'
                      : item.badge === 'veg'
                        ? 'rgba(45,139,111,0.15)'
                        : 'rgba(154,52,18,0.12)',
                  color:
                    item.badge === 'veg' ? RO_COLORS.sage : RO_COLORS.brique,
                }}
              >
                {item.badge === 'pop' ? '★ Populaire' : item.badge === 'veg' ? '🌿 Végé' : "👨‍🍳 Signature"}
              </span>
            )}
          </div>
          <div
            className="whitespace-nowrap"
            style={{ ...RO_TITLE_FONT, fontSize: '1rem', fontWeight: 700, color: RO_COLORS.brique }}
          >
            {item.price > 0 ? `${item.price.toLocaleString('fr-FR')} FCFA` : '—'}
          </div>
        </div>
        <p className="mt-1 mb-2 text-[0.75rem] leading-snug" style={{ color: themeVars.charcoal, opacity: 0.6 }}>
          {item.desc}
        </p>
        <div className="mt-auto flex items-center justify-between">
          <span className="text-[0.65rem]" style={{ color: themeVars.charcoal, opacity: 0.45 }}>
            {item.allerg !== '—' ? `⚠ ${item.allerg}` : 'Sans allergène'}
          </span>
          {line ? (
            <div
              className="flex items-center gap-2 rounded-full px-1.5 py-1"
              style={{ background: RO_COLORS.brique }}
            >
              <button
                onClick={() => onQty(-1)}
                className="flex h-6 w-6 items-center justify-center rounded-full text-white transition-all hover:bg-white/30"
                aria-label="Retirer un"
              >
                <Minus className="size-3" />
              </button>
              <span className="min-w-[16px] text-center text-sm font-bold text-white">{line.qty}</span>
              <button
                onClick={() => onQty(1)}
                className="flex h-6 w-6 items-center justify-center rounded-full text-white transition-all hover:bg-white/30"
                aria-label="Ajouter un"
              >
                <Plus className="size-3" />
              </button>
            </div>
          ) : (
            <button
              onClick={onAdd}
              className="flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-bold text-white transition-all hover:scale-105 active:scale-95"
              style={{ background: RO_COLORS.brique }}
            >
              <Plus className="size-3" />
              Ajouter
            </button>
          )}
        </div>
      </div>
    </article>
  )
}

/** Vignette photo d'un plat — avec fallback coloré selon la catégorie. */
function DishThumb({
  item,
  photoUrl,
  cat: catProp,
}: {
  item?: RoMenuItem
  photoUrl?: string | null
  cat?: RoMenuItem['cat']
}) {
  const cat = item?.cat ?? catProp
  const palette: Record<RoMenuItem['cat'], { bg: string; emoji: string }> = {
    Entrées: { bg: '#2D8B6F', emoji: '🥗' },
    Plats: { bg: '#9A3412', emoji: '🍲' },
    Desserts: { bg: '#C4785A', emoji: '🍰' },
    Boissons: { bg: '#C9A961', emoji: '🥤' },
  }
  const meta = palette[cat ?? 'Plats']
  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt={item?.name ?? ''}
        className="size-[92px] shrink-0 rounded-2xl object-cover sm:size-[110px]"
        loading="lazy"
      />
    )
  }
  return (
    <div
      className="flex size-[92px] shrink-0 items-center justify-center rounded-2xl text-3xl sm:size-[110px]"
      style={{ background: `linear-gradient(135deg, ${meta.bg} 0%, ${meta.bg}AA 100%)` }}
      aria-hidden
    >
      {meta.emoji}
    </div>
  )
}

/** Étape du suivi de commande (Reçue / En cuisine / Prête). */
function TrackStep({
  icon,
  label,
  state,
}: {
  icon: React.ReactNode
  label: string
  state: 'idle' | 'active' | 'done'
}) {
  const bg =
    state === 'done'
      ? RO_COLORS.brique
      : state === 'active'
        ? RO_COLORS.sage
        : '#F0E9DE'
  const color = state === 'idle' ? '#9A3412' : 'white'
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div
        className="flex size-9 items-center justify-center rounded-full transition-all"
        style={{
          background: bg,
          color,
          transform: state === 'active' ? 'scale(1.1)' : 'scale(1)',
        }}
      >
        {icon}
      </div>
      <span
        className="text-[0.6rem] font-semibold uppercase"
        style={{ letterSpacing: '0.05em', opacity: 0.6, color: '#1F2937' }}
      >
        {label}
      </span>
    </div>
  )
}

/** Ligne entre deux étapes du suivi (s'allume quand l'étape précédente est atteinte). */
function TrackLine({ active }: { active: boolean }) {
  return (
    <div
      className="mt-[-12px] h-0.5 w-6"
      style={{ background: active ? RO_COLORS.sage : '#F0E9DE' }}
    />
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
  // Commerce sélectionné pour ouvrir l'expérience de commande premium.
  // Quand non-null ET commerce restaurant premium avec menu, on remplace
  // la liste par <RestaurantOrderView /> (overlay plein écran).
  const [selectedRestaurant, setSelectedRestaurant] = useState<CityBusiness | null>(null)

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

  // Expérience de commande premium — remplace la liste des commerces
  // quand un restaurant premium avec menu est sélectionné.
  if (
    selectedRestaurant &&
    selectedRestaurant.isPremium &&
    selectedRestaurant.category?.toLowerCase() === 'restaurant' &&
    selectedRestaurant.menu
  ) {
    return (
      <RestaurantOrderView
        business={selectedRestaurant}
        plate={plate}
        onClose={() => setSelectedRestaurant(null)}
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
            onOpenMenu={(biz) => setSelectedRestaurant(biz)}
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
  const productFileInputRef = useRef<HTMLInputElement>(null)

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

  // --- Produits (Premium uniquement) : jusqu'à 10 produits ---
  // Chaque produit : nom, prix (FCFA), photo optionnelle.
  const [products, setProducts] = useState<
    Array<{ name: string; price: string; photoUrl: string | null }>
  >([])
  // Index du produit en cours de capture photo (pour le file input partagé).
  const [editingProductIdx, setEditingProductIdx] = useState<number | null>(null)
  // Dossier number renvoyé par l'API après inscription Premium.
  const [dossierNumber, setDossierNumber] = useState<string | null>(null)

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

  // Capture photo d'un produit — resize 400px max, JPEG 0.7 quality.
  // Le file input est partagé : on utilise editingProductIdx pour savoir
  // quel produit reçoit la photo capturée.
  const handleProductPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const targetIdx = editingProductIdx
    // On reset editingProductIdx immédiatement (avant l'async) pour éviter
    // une race condition si l'utilisateur clique sur un autre produit.
    setEditingProductIdx(null)
    if (targetIdx === null) return
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        const maxDim = 400
        const ratio = Math.min(maxDim / img.width, maxDim / img.height, 1)
        canvas.width = Math.round(img.width * ratio)
        canvas.height = Math.round(img.height * ratio)
        const ctx = canvas.getContext('2d')
        if (ctx) {
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
          const dataUrl = canvas.toDataURL('image/jpeg', 0.7)
          setProducts((prev) =>
            prev.map((p, i) => (i === targetIdx ? { ...p, photoUrl: dataUrl } : p)),
          )
        }
      }
      img.src = reader.result as string
    }
    reader.readAsDataURL(file)
    // Reset l'input pour permettre de re-capturer la même photo.
    e.target.value = ''
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
    // Premium : WhatsApp obligatoire (pour les confirmations de commande)
    if (plan === 'premium' && whatsapp.trim().length < 6) {
      toast({
        title: 'WhatsApp requis',
        description: 'Indiquez un numéro WhatsApp pour les confirmations de commande.',
      })
      return
    }
    setSubmitting(true)
    try {
      // Construction du body — requestedPlan toujours envoyé.
      // Premium : on joint le menu (JSON.stringify des produits valides)
      // et le whatsapp (déjà dans le body commun).
      const validProducts = products
        .filter((p) => p.name.trim().length > 0 && p.price.trim().length > 0)
        .map((p) => ({
          name: p.name.trim(),
          price: `${p.price.trim()} FCFA`,
          ...(p.photoUrl ? { photoUrl: p.photoUrl } : {}),
        }))
      const body: Record<string, unknown> = {
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
        description: description.trim() || null,
        requestedPlan: plan,
      }
      if (plan === 'premium') {
        body.menu = JSON.stringify(validProducts)
      }
      const res = await fetch('/api/city/businesses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = (await res.json().catch(() => null)) as {
        ok: boolean
        data?: { business?: { dossierNumber?: string | null } }
        error?: string
      } | null
      if (json?.ok) {
        // Premium : l'API renvoie un dossierNumber à présenter à la mairie.
        if (plan === 'premium') {
          setDossierNumber(json.data?.business?.dossierNumber ?? null)
        }
        setSubmitted(true)
        try {
          parler(
            plan === 'premium'
              ? 'Votre demande Premium a été envoyée. Notez votre numéro de dossier.'
              : 'Votre boutique est en ligne. Validation automatique.',
          )
        } catch {
          /* ignore */
        }
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
    const isPremium = plan === 'premium'
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-6 text-center">
        <div
          className="flex size-20 items-center justify-center rounded-full shadow-lg"
          style={{ background: isPremium ? '#C9A961' : '#00A651' }}
        >
          <Check className="size-10 text-white" />
        </div>

        {isPremium ? (
          <>
            <h2 className="mt-5 text-xl font-bold text-[#1A1A1A]" style={TITLE_FONT}>
              Demande Premium envoyée !
            </h2>
            <p className="mt-2 text-sm text-[#1A1A1A]/70">
              Votre fiche « {name.trim()} » et vos produits ont été soumis.
              Activez votre compte Premium en mairie.
            </p>

            {/* === Numéro de dossier — proéminent === */}
            {dossierNumber && (
              <div
                className="mt-5 w-full rounded-2xl border-2 border-[#C9A961]/40 bg-[#C9A961]/10 p-5 shadow-sm"
              >
                <p className="text-xs font-bold uppercase tracking-wider text-[#C9A961]">
                  Votre numéro de dossier
                </p>
                <p
                  className="mt-2 text-3xl font-bold tracking-wider text-[#1A1A1A]"
                  style={TITLE_FONT}
                >
                  {dossierNumber}
                </p>
                <p className="mt-3 text-sm leading-relaxed text-[#1A1A1A]/75">
                  Présentez ce numéro à la mairie pour le paiement et
                  l&apos;activation.
                </p>
              </div>
            )}
          </>
        ) : (
          <>
            <h2 className="mt-5 text-xl font-bold text-[#00A651]" style={TITLE_FONT}>
              Votre boutique est en ligne !
            </h2>
            <p className="mt-2 text-sm font-medium text-[#1A1A1A]/70">
              (validation automatique)
            </p>
            <p className="mt-2 text-sm text-[#1A1A1A]/65">
              Votre fiche « {name.trim()} » est désormais visible par les
              citoyens du quartier.
            </p>
          </>
        )}

        <div className="mt-4 rounded-xl bg-[#00A651]/5 p-3 text-xs text-[#1A1A1A]/60">
          <p>📍 Plaque : #{plate.plateNumber} · {plate.district ?? 'Dakar'}</p>
          <p className="mt-1">🏷️ Catégorie : {CATS.find(c => c.id === category)?.label}</p>
          <p className="mt-1">
            📊 Statut : {isPremium ? 'En attente — paiement en mairie' : 'En ligne (validation automatique)'}
          </p>
        </div>
        <Button
          onClick={onSuccess}
          className="mt-6 w-full rounded-xl py-4 text-white"
          style={{ background: isPremium ? '#C9A961' : '#00A651' }}
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

      {/* === Produits (Premium uniquement) — jusqu'à 10 produits === */}
      {plan === 'premium' && (
        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <label className="text-sm font-bold text-[#1A1A1A]" style={TITLE_FONT}>
              Vos produits
            </label>
            <span className="rounded-full bg-[#C9A961]/15 px-2 py-0.5 text-[10px] font-bold uppercase text-[#C9A961]">
              {products.length}/10
            </span>
          </div>
          <p className="mt-0.5 text-xs text-[#1A1A1A]/50">
            Ajoutez jusqu&apos;à 10 produits avec prix en FCFA. Photo optionnelle.
            Ces produits apparaîtront comme votre menu en ligne.
          </p>

          {/* File input partagé pour les photos de produits */}
          <input
            ref={productFileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleProductPhoto}
            className="hidden"
          />

          {/* Liste des produits */}
          <div className="mt-3 space-y-3">
            {products.map((p, idx) => (
              <div
                key={idx}
                className="rounded-xl border-2 border-[#C9A961]/25 bg-[#C9A961]/5 p-3"
              >
                <div className="flex items-start gap-3">
                  {/* Photo du produit (ou bouton capture) */}
                  {p.photoUrl ? (
                    <div className="relative shrink-0">
                      <img
                        src={p.photoUrl}
                        alt={p.name || `Produit ${idx + 1}`}
                        className="size-16 rounded-lg object-cover"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setProducts((prev) =>
                            prev.map((pp, i) =>
                              i === idx ? { ...pp, photoUrl: null } : pp,
                            ),
                          )
                        }
                        className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full bg-[#E30613] text-white shadow"
                        aria-label="Supprimer la photo"
                      >
                        <X className="size-3" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingProductIdx(idx)
                        productFileInputRef.current?.click()
                      }}
                      className="flex size-16 shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg border-2 border-dashed border-[#C9A961]/40 bg-white text-[#C9A961] transition hover:bg-[#C9A961]/5"
                      aria-label="Prendre une photo du produit"
                    >
                      <Camera className="size-4" />
                      <span className="text-[9px] font-bold uppercase">Photo</span>
                    </button>
                  )}

                  {/* Champs nom + prix */}
                  <div className="min-w-0 flex-1 space-y-2">
                    <input
                      type="text"
                      value={p.name}
                      onChange={(e) =>
                        setProducts((prev) =>
                          prev.map((pp, i) =>
                            i === idx ? { ...pp, name: e.target.value } : pp,
                          ),
                        )
                      }
                      placeholder="Nom du produit"
                      maxLength={60}
                      className="w-full rounded-lg border border-[#d5d3d4] px-3 py-2 text-sm focus:border-[#C9A961] focus:outline-none"
                    />
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        value={p.price}
                        onChange={(e) =>
                          setProducts((prev) =>
                            prev.map((pp, i) =>
                              i === idx ? { ...pp, price: e.target.value } : pp,
                            ),
                          )
                        }
                        placeholder="Prix"
                        min={0}
                        className="w-full rounded-lg border border-[#d5d3d4] px-3 py-2 text-sm focus:border-[#C9A961] focus:outline-none"
                      />
                      <span className="shrink-0 text-xs font-bold text-[#1A1A1A]/50">
                        FCFA
                      </span>
                    </div>
                  </div>

                  {/* Bouton supprimer le produit */}
                  <button
                    type="button"
                    onClick={() =>
                      setProducts((prev) => prev.filter((_, i) => i !== idx))
                    }
                    className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-2 text-xs font-semibold text-[#E30613] transition hover:bg-[#E30613]/5"
                    aria-label="Supprimer ce produit"
                  >
                    <Trash2 className="size-4" />
                    <span className="hidden sm:inline">Supprimer</span>
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Bouton ajouter un produit */}
          {products.length < 10 ? (
            <button
              type="button"
              onClick={() =>
                setProducts((prev) => [...prev, { name: '', price: '', photoUrl: null }])
              }
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[#C9A961]/50 py-3 text-sm font-bold text-[#C9A961] transition hover:bg-[#C9A961]/5"
            >
              <Plus className="size-4" />
              Ajouter un produit
            </button>
          ) : (
            <p className="mt-3 text-center text-xs font-medium text-[#1A1A1A]/50">
              Maximum de 10 produits atteint.
            </p>
          )}
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
          {plan === 'premium' ? (
            <>
              WhatsApp (confirmations de commande) <span className="text-[#C9A961]">*</span>
            </>
          ) : (
            <>WhatsApp (optionnel)</>
          )}
        </label>
        <input
          type="tel"
          value={whatsapp}
          onChange={(e) => setWhatsapp(e.target.value)}
          placeholder={plan === 'premium' ? 'Ex : 221771234567 (requis)' : 'Ex : 221771234567'}
          maxLength={20}
          className={cn(
            'mt-2 w-full rounded-xl border-2 px-3 py-2.5 text-sm focus:outline-none',
            plan === 'premium'
              ? 'border-[#C9A961] focus:border-[#C9A961]'
              : 'border-[#d5d3d4] focus:border-[#00A651]',
          )}
        />
        {plan === 'premium' && (
          <p className="mt-1 text-xs text-[#1A1A1A]/55">
            Vos clients recevront ce numéro pour confirmer leurs commandes
            par WhatsApp.
          </p>
        )}
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
  onOpenMenu,
}: {
  business: CityBusiness
  onContact: (b: CityBusiness) => void
  onOpenMenu?: (b: CityBusiness) => void
}) {
  const color = businessCategoryColor(business.category)

  // Parse le menu (premium restaurants) — l'API peut retourner un array ou une string JSON
  const menuItems = useMemo<Array<{ name: string; price: string | number; photoUrl?: string | null }> | null>(() => {
    if (!business.menu) return null
    try {
      const parsed = typeof business.menu === 'string' ? JSON.parse(business.menu) : business.menu
      if (Array.isArray(parsed)) {
        return parsed
          .filter((it: unknown): it is Record<string, unknown> =>
            typeof it === 'object' && it !== null && 'name' in it,
          )
          .slice(0, 5)
          .map((it) => ({
            name: String(it.name ?? ''),
            price: it.price ?? '',
            photoUrl: (it.photoUrl as string | null | undefined) ?? null,
          }))
      }
    } catch {
      /* ignore */
    }
    return null
  }, [business.menu])

  // Parse la grille tarifaire (premium artisans) — l'API peut retourner un array ou une string JSON
  const priceGridItems = useMemo<Array<{ service: string; price: string | number; unit?: string; photoUrl?: string | null }> | null>(() => {
    if (!business.priceGrid) return null
    try {
      const parsed = typeof business.priceGrid === 'string' ? JSON.parse(business.priceGrid) : business.priceGrid
      if (Array.isArray(parsed)) {
        return parsed
          .filter((it: unknown): it is Record<string, unknown> =>
            typeof it === 'object' && it !== null && ('service' in it || 'name' in it),
          )
          .slice(0, 5)
          .map((it) => ({
            service: String(it.service ?? it.name ?? ''),
            price: it.price ?? '',
            unit: (it.unit as string | undefined) ?? undefined,
            photoUrl: (it.photoUrl as string | null | undefined) ?? null,
          }))
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
    (business.category?.toLowerCase() === 'restaurant') &&
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

      {/* Photo banner — full width, top of card (3x larger than thumbnail) */}
      {business.photoUrl && (
        <img
          src={business.photoUrl}
          alt={business.name}
          className="mb-3 h-32 w-full rounded-xl object-cover"
          loading="lazy"
        />
      )}

      <div className="flex items-start gap-3">
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
          <p className="text-xs font-bold text-[#FF6B00]">🍽️ Menu</p>
          <ul className="mt-1 space-y-1.5">
            {menuItems.map((item, idx) => (
              <li key={idx} className="flex items-center gap-2 text-xs">
                {item.photoUrl && (
                  <img
                    src={item.photoUrl}
                    alt={item.name}
                    className="size-16 shrink-0 rounded-lg object-cover"
                    loading="lazy"
                  />
                )}
                <span className="flex-1 text-[#1A1A1A]/80">{item.name}</span>
                <span className="font-bold text-[#1A1A1A]">{typeof item.price === 'number' ? `${item.price.toLocaleString('fr-FR')} FCFA` : item.price}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Grille tarifaire (premium artisan) */}
      {business.isPremium && priceGridItems && priceGridItems.length > 0 && (
        <div className="mt-2 rounded-xl bg-[#00A651]/5 px-3 py-2">
          <p className="text-xs font-bold text-[#00A651]">🔧 Tarifs</p>
          <ul className="mt-1 space-y-1.5">
            {priceGridItems.map((item, idx) => (
              <li key={idx} className="flex items-center gap-2 text-xs">
                {item.photoUrl && (
                  <img
                    src={item.photoUrl}
                    alt={item.service}
                    className="size-16 shrink-0 rounded-lg object-cover"
                    loading="lazy"
                  />
                )}
                <span className="flex-1 text-[#1A1A1A]/80">{item.service}{item.unit ? ` (${item.unit})` : ''}</span>
                <span className="font-bold text-[#1A1A1A]">{typeof item.price === 'number' ? `${item.price.toLocaleString('fr-FR')} FCFA` : item.price}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Boutons d'action */}
      <div className="mt-3 flex flex-wrap gap-2">
        <a
          href={`tel:${business.phone}`}
          onClick={() => {
            // VOIX — Aminata confirme dans le geste utilisateur (iOS Safari).
            try {
              parler(`Contact lancé avec ${business.name}.`)
            } catch {
              /* ignore — synthèse vocale indisponible */
            }
            onContact(business)
          }}
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
            onClick={() => {
              // VOIX — Aminata confirme l'ouverture de WhatsApp (iOS Safari).
              try {
                parler(`Ouverture de WhatsApp pour ${business.name}.`)
              } catch {
                /* ignore — synthèse vocale indisponible */
              }
              onContact(business)
            }}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#25D366] py-2.5 text-sm font-bold text-white transition hover:bg-[#1da851]"
          >
            <MessageCircle className="size-4" />
            WhatsApp
          </a>
        )}
        {isRestaurantWithMenu && onOpenMenu && (
          <button
            type="button"
            onClick={() => onOpenMenu(business)}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#9A3412] py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-[#7C2D12]"
          >
            <Utensils className="size-4" />
            Commander
          </button>
        )}
        {isRestaurantWithMenu && !onOpenMenu && orderUrl && (
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

function MairieView({
  currentHour,
  plate,
  qrConfig,
}: {
  currentHour: number
  plate: CityPlate
  qrConfig?: {
    qrTitle: string
    qrSubtitle: string
    mairieServices: Array<{ label: string; phone: string }>
  } | null
}) {
  const { toast } = useToast()
  const greeting = getMairieGreeting(currentHour)
  const [selectedMotif, setSelectedMotif] = useState<string | null>(null)

  // --- Formulaire de rendez-vous avec le Maire ---
  const [rdvName, setRdvName] = useState('')
  const [rdvPhone, setRdvPhone] = useState('')
  const [rdvMotif, setRdvMotif] = useState('')
  const [rdvPreferredDate, setRdvPreferredDate] = useState('')
  const [rdvSubmitting, setRdvSubmitting] = useState(false)
  // Référence renvoyée par l'API après création du RDV (ex: "RDV-1544DFF").
  const [rdvReference, setRdvReference] = useState<string | null>(null)

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

  // Soumission du formulaire de RDV → POST /api/city/appointments
  // Référence renvoyée par l'API (ex: "RDV-1544DFF") affichée en confirmation.
  const handleRdvSubmit = async () => {
    if (rdvName.trim().length < 2) {
      toast({ title: 'Nom requis', description: 'Indiquez votre nom et prénom.' })
      return
    }
    if (rdvPhone.trim().length < 6) {
      toast({ title: 'Téléphone requis', description: 'Indiquez un numéro de téléphone.' })
      return
    }
    if (rdvMotif.trim().length < 4) {
      toast({ title: 'Motif requis', description: 'Décrivez le motif de votre rendez-vous.' })
      return
    }
    // VOIX — Aminata confirme la demande DANS le geste utilisateur (clic sur
    // le bouton d'envoi). iOS Safari et Chrome mobile exigent que
    // speechSynthesis.speak() soit appelé synchronement dans un handler de
    // geste ; un appel différé (après await fetch) est ignoré silencieusement.
    try {
      parler('Votre demande de rendez-vous a été envoyée. Vous recevrez une confirmation par téléphone.')
    } catch {
      /* ignore — synthèse vocale indisponible */
    }
    setRdvSubmitting(true)
    try {
      const res = await fetch('/api/city/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: rdvName.trim(),
          phone: rdvPhone.trim(),
          motif: rdvMotif.trim(),
          plateId: plate.id,
          qrToken: plate.qrToken,
          preferredDate: rdvPreferredDate.trim() || null,
        }),
      })
      const json = (await res.json().catch(() => null)) as {
        ok: boolean
        data?: { appointment?: { reference?: string } }
        error?: string
      } | null
      if (json?.ok && json.data?.appointment?.reference) {
        setRdvReference(json.data.appointment.reference)
      } else {
        toast({
          title: 'Envoi impossible',
          description: json?.error || 'Réessayez dans quelques instants.',
        })
      }
    } catch {
      toast({ title: 'Erreur réseau', description: 'Vérifiez votre connexion.' })
    } finally {
      setRdvSubmitting(false)
    }
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
          {(qrConfig?.mairieServices ?? MAIRIE_SERVICES).map((s) => (
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

        {/* --- Confirmation (référence affichée après envoi) --- */}
        {rdvReference ? (
          <div className="mt-4 rounded-xl bg-white p-4 text-[#1A1A1A] shadow-inner">
            <div className="flex items-center gap-2">
              <Check className="size-5 text-[#00A651]" />
              <p className="text-sm font-bold text-[#00A651]" style={TITLE_FONT}>
                Demande envoyée
              </p>
            </div>
            <div className="mt-3 rounded-lg bg-[#6B4C9A]/10 p-3 text-center">
              <p className="text-[10px] font-bold uppercase tracking-wider text-[#6B4C9A]">
                Votre référence
              </p>
              <p
                className="mt-1 text-2xl font-bold tracking-wider text-[#1A1A1A]"
                style={TITLE_FONT}
              >
                {rdvReference}
              </p>
            </div>
            <p className="mt-3 text-center text-sm text-[#1A1A1A]/70">
              Vous recevrez une confirmation par téléphone.
            </p>
            <button
              type="button"
              onClick={() => {
                setRdvReference(null)
                setRdvName('')
                setRdvPhone('')
                setRdvMotif('')
                setRdvPreferredDate('')
              }}
              className="mt-3 w-full rounded-xl border border-[#6B4C9A]/30 py-2.5 text-xs font-bold uppercase tracking-wide text-[#6B4C9A] transition hover:bg-[#6B4C9A]/5"
            >
              Faire une autre demande
            </button>
          </div>
        ) : (
          /* --- Formulaire de demande de RDV --- */
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void handleRdvSubmit()
            }}
            className="mt-4 space-y-3"
          >
            {/* Nom et prénom */}
            <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-white/80">
                Nom et prénom <span className="text-[#FFD700]">*</span>
              </label>
              <input
                type="text"
                value={rdvName}
                onChange={(e) => setRdvName(e.target.value)}
                placeholder="Ex : Aminata Diop"
                maxLength={80}
                required
                className="w-full rounded-xl border-0 bg-white px-3 py-2.5 text-sm text-[#1A1A1A] placeholder:text-[#1A1A1A]/40 focus:outline-none focus:ring-2 focus:ring-[#FFD700]"
              />
            </div>

            {/* Téléphone */}
            <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-white/80">
                Téléphone <span className="text-[#FFD700]">*</span>
              </label>
              <input
                type="tel"
                value={rdvPhone}
                onChange={(e) => setRdvPhone(e.target.value)}
                placeholder="Ex : 77 123 45 67"
                maxLength={20}
                required
                className="w-full rounded-xl border-0 bg-white px-3 py-2.5 text-sm text-[#1A1A1A] placeholder:text-[#1A1A1A]/40 focus:outline-none focus:ring-2 focus:ring-[#FFD700]"
              />
            </div>

            {/* Motif du RDV */}
            <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-white/80">
                Motif du RDV <span className="text-[#FFD700]">*</span>
              </label>
              <textarea
                value={rdvMotif}
                onChange={(e) => setRdvMotif(e.target.value)}
                placeholder="Ex : Demande d'attestation de résidence, rencontre concernant mon quartier…"
                maxLength={500}
                rows={3}
                required
                className="w-full rounded-xl border-0 bg-white px-3 py-2.5 text-sm text-[#1A1A1A] placeholder:text-[#1A1A1A]/40 focus:outline-none focus:ring-2 focus:ring-[#FFD700]"
              />
              <p className="mt-0.5 text-right text-[10px] text-white/50">
                {rdvMotif.length}/500
              </p>
            </div>

            {/* Date souhaitée (optionnel) */}
            <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-white/80">
                Date souhaitée <span className="text-white/40">(optionnel)</span>
              </label>
              <input
                type="text"
                value={rdvPreferredDate}
                onChange={(e) => setRdvPreferredDate(e.target.value)}
                placeholder="Ex : Mardi prochain matin"
                maxLength={100}
                className="w-full rounded-xl border-0 bg-white px-3 py-2.5 text-sm text-[#1A1A1A] placeholder:text-[#1A1A1A]/40 focus:outline-none focus:ring-2 focus:ring-[#FFD700]"
              />
            </div>

            {/* Bouton soumettre */}
            <button
              type="submit"
              disabled={rdvSubmitting}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-bold text-[#6B4C9A] transition hover:bg-white/90 disabled:opacity-60"
            >
              {rdvSubmitting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Send className="size-4" />
              )}
              {rdvSubmitting ? 'Envoi en cours…' : 'Demander le rendez-vous'}
            </button>
          </form>
        )}
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
                onClick={() => {
                  // VOIX — Aminata confirme dans le geste utilisateur (iOS Safari).
                  try {
                    parler('Itinéraire ouvert dans Google Maps.')
                  } catch {
                    /* ignore — synthèse vocale indisponible */
                  }
                }}
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
// 8. SanteView — Pharmacie de garde + pharmacies + centres de santé
//    & cliniques + médecins de la ville
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

/** Médecin — mock data (spécialité + coordonnées + GPS). */
type Doctor = {
  id: string
  name: string
  specialty: string
  phone: string
  hours: string
  address: string
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

// Centres de santé & Cliniques — mock data (3-4 entrées).
const CENTRES_SANTE: ReadonlyArray<Pharmacy> = [
  {
    id: 'c1',
    name: 'Centre de Santé Médina',
    address: 'Avenue Léopold S. Senghor, Médina',
    phone: '+221338601111',
    hours: 'Lun–Dim · 8h–20h (urgences 24h/24)',
    lat: 14.6695,
    lng: -17.4455,
  },
  {
    id: 'c2',
    name: 'Clinique du Plateau',
    address: 'Rue Mohamed V, Plateau',
    phone: '+221338602222',
    hours: 'Lun–Sam · 7h–22h · Urgences 24h/24',
    lat: 14.6720,
    lng: -17.4400,
  },
  {
    id: 'c3',
    name: 'Polyclinique Grand Yoff',
    address: 'Route de l\'Aéroport, Grand Yoff',
    phone: '+221338603333',
    hours: 'Lun–Dim · 24h/24',
    lat: 14.7180,
    lng: -17.4650,
  },
  {
    id: 'c4',
    name: 'Centre Médical Parcelles',
    address: 'Route de la Corniche, Parcelles Assainies',
    phone: '+221338604444',
    hours: 'Lun–Sam · 8h–19h',
    lat: 14.7400,
    lng: -17.4300,
  },
]

// Médecins — mock data (4 médecins avec spécialité).
const MEDECINS: ReadonlyArray<Doctor> = [
  {
    id: 'm1',
    name: 'Dr. Aminata Diop',
    specialty: 'Médecin généraliste',
    phone: '+221771010101',
    hours: 'Lun–Ven · 9h–17h (RDV)',
    address: 'Cabinet Médical Plateau, Rue Mohamed V',
    lat: 14.6715,
    lng: -17.4398,
  },
  {
    id: 'm2',
    name: 'Dr. Mamadou Sow',
    specialty: 'Pédiatre',
    phone: '+221772020202',
    hours: 'Lun–Sam · 8h30–18h (RDV)',
    address: 'Cabinet Pédiatrie Médina, Av. L. S. Senghor',
    lat: 14.6692,
    lng: -17.4452,
  },
  {
    id: 'm3',
    name: 'Dr. Fatou Ndiaye',
    specialty: 'Gynécologue-Obstétricienne',
    phone: '+221773030303',
    hours: 'Mar–Sam · 10h–16h (RDV)',
    address: 'Clinique du Plateau, Rue Mohamed V',
    lat: 14.6722,
    lng: -17.4402,
  },
  {
    id: 'm4',
    name: 'Dr. Cheikh Fall',
    specialty: 'Cardiologue',
    phone: '+221774040404',
    hours: 'Lun–Ven · 14h–18h (RDV)',
    address: 'Polyclinique Grand Yoff, Route de l\'Aéroport',
    lat: 14.7182,
    lng: -17.4652,
  },
]

function SanteView({ plate }: { plate: CityPlate }) {
  // Helper générique — accepte tout objet ayant lat/lng (pharmacie,
  // centre de santé, médecin).
  const buildDirectionsUrl = (place: { lat: number; lng: number }): string => {
    const params = new URLSearchParams({
      api: '1',
      destination: `${place.lat},${place.lng}`,
      travelmode: 'walking',
    })
    if (plate.lat != null && plate.lng != null) {
      params.set('origin', `${plate.lat},${plate.lng}`)
    }
    return `https://www.google.com/maps/dir/?${params.toString()}`
  }

  // Gradient de bordure gauche par section (vert / bleu / violet).
  const gradientVert = `linear-gradient(180deg, ${AMINATA_TOKENS.vertClair} 0%, ${AMINATA_TOKENS.vert} 100%)`
  const gradientBleu = `linear-gradient(180deg, ${AMINATA_TOKENS.bleuClair} 0%, ${AMINATA_TOKENS.bleu} 100%)`
  const gradientViolet = `linear-gradient(180deg, #8B5CB8 0%, ${AMINATA_TOKENS.violet} 100%)`

  const plateSubtitle = plate.district
    ? `Plaque #${plate.plateNumber} · ${plate.district}`
    : `Plaque #${plate.plateNumber}`

  return (
    <div
      className="aminata-screen-enter space-y-5"
      style={{ ...INTER_FONT, backgroundColor: AMINATA_TOKENS.blanc, color: AMINATA_TOKENS.texte }}
    >
      {AMINATA_FONT_LINK}
      {AMINATA_KEYFRAMES_STYLE}

      {/* Header — green emerald gradient + HeartPulse icon tile (white) */}
      <AminataModuleHeader
        gradient={`linear-gradient(135deg, ${AMINATA_TOKENS.vert} 0%, #047857 100%)`}
        icon={<HeartPulse className="size-6" style={{ color: AMINATA_TOKENS.vert }} />}
        title="Santé"
        subtitle={plateSubtitle}
      />

      {/* Bannière descriptive */}
      <AminataBanner
        gradient={`linear-gradient(135deg, ${AMINATA_TOKENS.vertClair} 0%, ${AMINATA_TOKENS.vert} 100%)`}
        eyebrow="Santé · Pharmacies · Cliniques · Médecins"
        text="Pharmacie de garde 24h/24, centres de santé & cliniques, et médecins de la ville. Appelez ou lancez le guidage Google Maps en un geste."
      />

      {/* ============ Section 1 : Pharmacie de garde ============ */}
      <section className="space-y-3">
        <div className="flex items-center gap-2 px-0.5">
          <Pill className="size-5" style={{ color: AMINATA_TOKENS.vert }} />
          <h3
            className="text-base font-bold"
            style={{ ...PLAYFAIR_FONT, color: AMINATA_TOKENS.texte }}
          >
            Pharmacie de garde
          </h3>
        </div>

        {/* Carte « pharmacie de garde » — fond radial vert, badge lune + dot pulsant */}
        <div
          className="relative overflow-hidden rounded-2xl p-4"
          style={{
            background:
              'radial-gradient(circle at top right, rgba(16,185,129,0.18) 0%, rgba(5,150,105,0.06) 60%, transparent 100%), #FFFFFF',
            border: `2px solid ${AMINATA_TOKENS.vertClair}`,
            boxShadow: '0 8px 20px rgba(16,185,129,0.15)',
          }}
        >
          {/* Badge lune 🌙 flottant en haut à droite */}
          <div
            aria-hidden
            className="absolute right-3 top-2 flex items-center gap-1 rounded-full bg-white/95 px-2 py-0.5 text-sm shadow-sm"
            style={{ color: AMINATA_TOKENS.vert }}
          >
            <span>🌙</span>
            <span className="text-[10px] font-bold uppercase tracking-wide">Garde</span>
          </div>

          <p
            className="text-base font-bold"
            style={{ ...PLAYFAIR_FONT, color: AMINATA_TOKENS.vert }}
          >
            {PHARMACIE_GARDE_SANTE.name}
          </p>
          <p className="mt-1 text-[12px]" style={{ color: AMINATA_TOKENS.gris }}>
            {PHARMACIE_GARDE_SANTE.address}
          </p>
          <p
            className="mt-1 flex items-center gap-1.5 text-[11px] font-bold"
            style={{ color: AMINATA_TOKENS.vert }}
          >
            {/* Point vert pulsant */}
            <span
              className="aminata-pulse inline-block size-2 rounded-full"
              style={{ backgroundColor: AMINATA_TOKENS.vert }}
              aria-hidden
            />
            {PHARMACIE_GARDE_SANTE.hours}
          </p>

          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <a
              href={`tel:${PHARMACIE_GARDE_SANTE.phone}`}
              onClick={() => {
                // VOIX — Aminata confirme l'appel pharmacie (geste iOS).
                try {
                  parler('Appel de la pharmacie.')
                } catch {
                  /* ignore — synthèse vocale indisponible */
                }
              }}
              className="flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-bold text-white transition-all hover:-translate-y-0.5"
              style={{
                backgroundColor: AMINATA_TOKENS.vert,
                boxShadow: '0 4px 10px rgba(5,150,105,0.25)',
              }}
            >
              <Phone className="size-4" />
              Appeler
            </a>
            <a
              href={buildDirectionsUrl(PHARMACIE_GARDE_SANTE)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-1.5 rounded-xl bg-white py-2.5 text-sm font-bold transition-all hover:-translate-y-0.5"
              style={{
                color: AMINATA_TOKENS.vert,
                border: `2px solid ${AMINATA_TOKENS.vert}`,
              }}
            >
              <Navigation className="size-4" />
              Y aller
            </a>
          </div>
        </div>
      </section>

      {/* ============ Section 2 : Pharmacies de la ville ============ */}
      <section className="space-y-3">
        <div className="flex items-center gap-2 px-0.5">
          <span className="text-base" aria-hidden>💊</span>
          <h3
            className="text-base font-bold"
            style={{ ...PLAYFAIR_FONT, color: AMINATA_TOKENS.texte }}
          >
            Pharmacies de la ville
          </h3>
        </div>
        <ul className="space-y-2.5">
          {PHARMACIES_VILLE.map((p, idx) => (
            <li
              key={p.id}
              className="aminata-card-enter relative overflow-hidden rounded-2xl bg-white p-3.5 transition-all duration-300 hover:-translate-y-0.5"
              style={{
                borderLeft: `4px solid`,
                borderImageSlice: 1,
                borderImageSource: gradientVert,
                boxShadow: '0 2px 10px rgba(0,0,0,0.05)',
                animationDelay: `${Math.min(idx * 0.07, 0.4)}s`,
              }}
            >
              <div
                aria-hidden
                className="pointer-events-none absolute inset-y-0 left-0 w-1"
                style={{ background: gradientVert }}
              />
              <p
                className="truncate text-[14px] font-bold"
                style={{ ...PLAYFAIR_FONT, color: AMINATA_TOKENS.texte }}
              >
                {p.name}
              </p>
              <p className="mt-0.5 truncate text-[11px]" style={{ color: AMINATA_TOKENS.gris }}>
                {p.address}
              </p>
              <p className="mt-0.5 text-[11px] font-bold" style={{ color: AMINATA_TOKENS.vert }}>
                {p.hours}
              </p>
              <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
                <a
                  href={`tel:${p.phone}`}
                  onClick={() => {
                    // VOIX — Aminata confirme l'appel pharmacie (geste iOS).
                    try {
                      parler('Appel de la pharmacie.')
                    } catch {
                      /* ignore — synthèse vocale indisponible */
                    }
                  }}
                  className="flex items-center justify-center gap-1.5 rounded-lg py-2 text-[12px] font-bold text-white transition-all hover:-translate-y-0.5"
                  style={{
                    backgroundColor: AMINATA_TOKENS.vert,
                    boxShadow: '0 3px 8px rgba(5,150,105,0.22)',
                  }}
                >
                  <Phone className="size-3.5" />
                  Appeler
                </a>
                <a
                  href={buildDirectionsUrl(p)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-1.5 rounded-lg bg-white py-2 text-[12px] font-bold transition-all hover:-translate-y-0.5"
                  style={{
                    color: AMINATA_TOKENS.vert,
                    border: `2px solid ${AMINATA_TOKENS.vert}`,
                  }}
                >
                  <Navigation className="size-3.5" />
                  Y aller
                </a>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* ============ Section 3 : Centres de santé & Cliniques ============ */}
      <section className="space-y-3">
        <div className="flex items-center gap-2 px-0.5">
          <span className="text-base" aria-hidden>🏥</span>
          <h3
            className="text-base font-bold"
            style={{ ...PLAYFAIR_FONT, color: AMINATA_TOKENS.texte }}
          >
            Centres de santé &amp; Cliniques
          </h3>
        </div>
        <ul className="space-y-2.5">
          {CENTRES_SANTE.map((c, idx) => (
            <li
              key={c.id}
              className="aminata-card-enter relative overflow-hidden rounded-2xl bg-white p-3.5 transition-all duration-300 hover:-translate-y-0.5"
              style={{
                borderLeft: `4px solid`,
                borderImageSlice: 1,
                borderImageSource: gradientBleu,
                boxShadow: '0 2px 10px rgba(0,0,0,0.05)',
                animationDelay: `${Math.min(idx * 0.07, 0.4)}s`,
              }}
            >
              <div
                aria-hidden
                className="pointer-events-none absolute inset-y-0 left-0 w-1"
                style={{ background: gradientBleu }}
              />
              <p
                className="truncate text-[14px] font-bold"
                style={{ ...PLAYFAIR_FONT, color: AMINATA_TOKENS.texte }}
              >
                {c.name}
              </p>
              <p className="mt-0.5 truncate text-[11px]" style={{ color: AMINATA_TOKENS.gris }}>
                {c.address}
              </p>
              <p className="mt-0.5 text-[11px] font-bold" style={{ color: AMINATA_TOKENS.bleu }}>
                {c.hours}
              </p>
              <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
                <a
                  href={`tel:${c.phone}`}
                  onClick={() => {
                    // VOIX — Aminata confirme l'appel du centre de santé (geste iOS).
                    try {
                      parler('Appel en cours.')
                    } catch {
                      /* ignore — synthèse vocale indisponible */
                    }
                  }}
                  className="flex items-center justify-center gap-1.5 rounded-lg py-2 text-[12px] font-bold text-white transition-all hover:-translate-y-0.5"
                  style={{
                    backgroundColor: AMINATA_TOKENS.bleuClair,
                    boxShadow: '0 3px 8px rgba(59,130,246,0.22)',
                  }}
                >
                  <Phone className="size-3.5" />
                  Appeler
                </a>
                <a
                  href={buildDirectionsUrl(c)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-1.5 rounded-lg bg-white py-2 text-[12px] font-bold transition-all hover:-translate-y-0.5"
                  style={{
                    color: AMINATA_TOKENS.bleuClair,
                    border: `2px solid ${AMINATA_TOKENS.bleuClair}`,
                  }}
                >
                  <Navigation className="size-3.5" />
                  Y aller
                </a>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* ============ Section 4 : Médecins ============ */}
      <section className="space-y-3">
        <div className="flex items-center gap-2 px-0.5">
          <span className="text-base" aria-hidden>👨‍⚕️</span>
          <h3
            className="text-base font-bold"
            style={{ ...PLAYFAIR_FONT, color: AMINATA_TOKENS.texte }}
          >
            Médecins
          </h3>
        </div>
        <ul className="space-y-2.5">
          {MEDECINS.map((m, idx) => (
            <li
              key={m.id}
              className="aminata-card-enter relative overflow-hidden rounded-2xl bg-white p-3.5 transition-all duration-300 hover:-translate-y-0.5"
              style={{
                borderLeft: `4px solid`,
                borderImageSlice: 1,
                borderImageSource: gradientViolet,
                boxShadow: '0 2px 10px rgba(0,0,0,0.05)',
                animationDelay: `${Math.min(idx * 0.07, 0.4)}s`,
              }}
            >
              <div
                aria-hidden
                className="pointer-events-none absolute inset-y-0 left-0 w-1"
                style={{ background: gradientViolet }}
              />
              <p
                className="truncate text-[14px] font-bold"
                style={{ ...PLAYFAIR_FONT, color: AMINATA_TOKENS.texte }}
              >
                {m.name}
              </p>
              <p className="mt-0.5 text-[11px] font-bold" style={{ color: AMINATA_TOKENS.violet }}>
                {m.specialty}
              </p>
              <p className="mt-0.5 truncate text-[11px]" style={{ color: AMINATA_TOKENS.gris }}>
                {m.address}
              </p>
              <p className="mt-0.5 text-[11px] font-bold" style={{ color: AMINATA_TOKENS.violet }}>
                {m.hours}
              </p>
              <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
                <a
                  href={`tel:${m.phone}`}
                  className="flex items-center justify-center gap-1.5 rounded-lg py-2 text-[12px] font-bold text-white transition-all hover:-translate-y-0.5"
                  style={{
                    backgroundColor: AMINATA_TOKENS.violet,
                    boxShadow: '0 3px 8px rgba(107,76,154,0.25)',
                  }}
                >
                  <Phone className="size-3.5" />
                  Appeler
                </a>
                <a
                  href={buildDirectionsUrl(m)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-1.5 rounded-lg bg-white py-2 text-[12px] font-bold transition-all hover:-translate-y-0.5"
                  style={{
                    color: AMINATA_TOKENS.violet,
                    border: `2px solid ${AMINATA_TOKENS.violet}`,
                  }}
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
// QuartierAdsView — Annonces entre particuliers (ventes · dons · services)
//    Green section header + Luggage icon. Filtres type, cartes avec photo
//    large, prix prominent, boutons Appeler / WhatsApp, temps relatif.
//    Form self-service: type, titre, description, prix, photo, téléphone.
// ============================================================

type QuartierAd = {
  id: string
  type: 'vente' | 'don' | 'service'
  title: string
  description: string | null
  price: string | null // "15000 FCFA", "Gratuit", "À débattre"
  photoUrl: string | null
  phone: string
  whatsapp?: string | null
  district?: string | null
  distance?: number | null
  createdAt: string
  status?: string
}

const QUARTIER_AD_TYPES: ReadonlyArray<{ id: string; label: string; color: string }> = [
  { id: 'all',     label: 'TOUS',    color: AMINATA_TOKENS.jauneDark },
  { id: 'vente',   label: 'VENTE',   color: AMINATA_TOKENS.orange },
  { id: 'don',     label: 'DON',     color: AMINATA_TOKENS.vertClair },
  { id: 'service', label: 'SERVICE', color: AMINATA_TOKENS.bleuClair },
]

/** Bordure gauche dégradée selon le type d'annonce (orange→rouge / vert / bleu). */
function quartierAdBorderGradient(type: string): string {
  if (type === 'vente') {
    return `linear-gradient(180deg, ${AMINATA_TOKENS.orange} 0%, ${AMINATA_TOKENS.rouge} 100%)`
  }
  if (type === 'don') {
    return `linear-gradient(180deg, ${AMINATA_TOKENS.vertClair} 0%, ${AMINATA_TOKENS.vert} 100%)`
  }
  // service
  return `linear-gradient(180deg, ${AMINATA_TOKENS.bleuClair} 0%, ${AMINATA_TOKENS.bleu} 100%)`
}

/** Couleur unie (pour badge / prix) selon le type d'annonce. */
function quartierAdTypeColor(type: string): string {
  if (type === 'vente') return AMINATA_TOKENS.rouge
  if (type === 'don') return AMINATA_TOKENS.vert
  // service
  return AMINATA_TOKENS.bleu
}

function QuartierAdsView({ plate }: { plate: CityPlate }) {
  const { toast } = useToast()
  const [ads, setAds] = useState<QuartierAd[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedType, setSelectedType] = useState<string>('all')
  const [showForm, setShowForm] = useState(false)

  const fetchAds = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (selectedType !== 'all') params.set('type', selectedType)
      if (plate.district) params.set('district', plate.district)
      const res = await fetch(`/api/city/quartier-ads?${params.toString()}`, {
        cache: 'no-store',
      })
      const json = (await res.json().catch(() => null)) as
        | { ok: true; data: { ads?: QuartierAd[] } }
        | { ok: false; error?: string }
        | null
      if (json?.ok && Array.isArray(json.data?.ads)) {
        setAds(json.data.ads)
      } else {
        setAds([])
        if (json && !json.ok) setError(json.error ?? 'Service indisponible')
      }
    } catch {
      setError('Connexion impossible. Vérifiez votre réseau.')
      setAds([])
    } finally {
      setLoading(false)
    }
  }, [selectedType, plate.district])

  useEffect(() => {
    fetchAds()
  }, [fetchAds])

  if (showForm) {
    return (
      <QuartierAdForm
        plate={plate}
        onCancel={() => setShowForm(false)}
        onSuccess={() => {
          setShowForm(false)
          fetchAds()
        }}
      />
    )
  }

  const plateSubtitle = plate.district
    ? `Plaque #${plate.plateNumber} · ${plate.district}`
    : `Plaque #${plate.plateNumber}`

  return (
    <div
      className="aminata-screen-enter space-y-4"
      style={{ ...INTER_FONT, backgroundColor: AMINATA_TOKENS.blanc, color: AMINATA_TOKENS.texte }}
    >
      {AMINATA_FONT_LINK}
      {AMINATA_KEYFRAMES_STYLE}

      {/* Header — yellow gradient + Luggage icon tile (white) */}
      <AminataModuleHeader
        gradient={`linear-gradient(135deg, ${AMINATA_TOKENS.jaune} 0%, ${AMINATA_TOKENS.jauneDark} 100%)`}
        icon={<Luggage className="size-6" style={{ color: AMINATA_TOKENS.jauneDark }} />}
        title="Annonces du Quartier"
        subtitle={plateSubtitle}
      />

      {/* Bannière descriptive */}
      <AminataBanner
        gradient={`linear-gradient(135deg, ${AMINATA_TOKENS.vert} 0%, #047857 100%)`}
        eyebrow="Annonces du Quartier · Entre particuliers"
        text="Ventes, dons et services de vos voisins. Contactez directement par téléphone ou WhatsApp. Déposez votre propre annonce en un geste."
      />

      {/* Bouton Déposer une annonce — green #059669, prominent */}
      <AminataPrimaryButton
        gradient={`linear-gradient(135deg, ${AMINATA_TOKENS.vert} 0%, #047857 100%)`}
        icon={<Plus className="size-5" />}
        label="Déposer une annonce"
        onClick={() => setShowForm(true)}
      />

      {/* Filtres type — chips horizontaux scrollables */}
      <div className="aminata-filters-scroll -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {QUARTIER_AD_TYPES.map((chip) => (
          <AminataFilterChip
            key={chip.id}
            label={chip.label}
            active={selectedType === chip.id}
            color={chip.color}
            onClick={() => setSelectedType(chip.id)}
          />
        ))}
      </div>

      {/* Liste */}
      {loading ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl bg-white py-16 shadow-sm">
          <Loader2 className="size-8 animate-spin" style={{ color: AMINATA_TOKENS.vert }} />
          <p className="text-sm" style={{ color: AMINATA_TOKENS.gris }}>
            Chargement des annonces…
          </p>
        </div>
      ) : error ? (
        <div className="rounded-2xl bg-white p-8 text-center shadow-sm">
          <AlertTriangle className="mx-auto size-10" style={{ color: AMINATA_TOKENS.rouge }} />
          <p className="mt-3 text-sm font-semibold" style={{ ...PLAYFAIR_FONT, color: AMINATA_TOKENS.texte }}>
            {error}
          </p>
          <p className="mt-1 text-xs" style={{ color: AMINATA_TOKENS.gris }}>
            Réessayez dans quelques instants.
          </p>
        </div>
      ) : ads.length === 0 ? (
        // Empty state — friendly message with Luggage icon
        <div className="rounded-2xl bg-white p-8 text-center shadow-sm">
          <div
            className="mx-auto flex size-16 items-center justify-center rounded-2xl"
            style={{ backgroundColor: `${AMINATA_TOKENS.jauneDark}18` }}
          >
            <Luggage className="size-8" style={{ color: AMINATA_TOKENS.jauneDark }} />
          </div>
          <p className="mt-3 text-base font-bold" style={{ ...PLAYFAIR_FONT, color: AMINATA_TOKENS.texte }}>
            Aucune annonce pour le moment.
          </p>
          <p className="mt-1 text-xs" style={{ color: AMINATA_TOKENS.gris }}>
            Soyez le premier à déposer une annonce dans votre quartier.
          </p>
        </div>
      ) : (
        <>
          {/* Header résultats : nombre + badge "Particuliers" */}
          <div className="flex items-center justify-between px-0.5">
            <span
              className="text-[11px] font-extrabold uppercase tracking-[0.12em]"
              style={{ color: AMINATA_TOKENS.texte }}
            >
              {ads.length} annonce{ads.length > 1 ? 's' : ''}
            </span>
            <span
              className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold"
              style={{
                backgroundColor: `${AMINATA_TOKENS.vert}15`,
                color: AMINATA_TOKENS.vert,
              }}
            >
              <Check className="size-3" />
              Particuliers
            </span>
          </div>

          {/* Cartes — cascade animation via animation-delay */}
          {ads.map((ad, idx) => (
            <QuartierAdCard key={ad.id} ad={ad} index={idx} />
          ))}
        </>
      )}
    </div>
  )
}

function QuartierAdCard({ ad, index = 0 }: { ad: QuartierAd; index?: number }) {
  const color = quartierAdTypeColor(ad.type)
  const borderGradient = quartierAdBorderGradient(ad.type)
  const typeLabel =
    ad.type === 'vente' ? 'VENTE' : ad.type === 'don' ? 'DON' : 'SERVICE'

  // Icône associée au type (Tag pour Vente, Gift pour Don, Briefcase pour Service)
  const TypeIcon =
    ad.type === 'vente' ? Tag : ad.type === 'don' ? Gift : Briefcase

  const whatsappUrl = ad.whatsapp
    ? `https://wa.me/${ad.whatsapp.replace(/[^\d]/g, '')}?text=${encodeURIComponent(
        `Bonjour, je suis intéressé(e) par votre annonce: ${ad.title}`,
      )}`
    : null

  // Price display — "Gratuit" for dons, value, or "À débattre" fallback.
  const priceDisplay =
    ad.type === 'don'
      ? 'Gratuit'
      : ad.price && ad.price.trim().length > 0
        ? ad.price
        : 'À débattre'

  // Cascade delay (0 → 0.4s max)
  const cascadeDelay = `${Math.min(index * 0.07, 0.4)}s`

  return (
    <article
      className="aminata-card-enter group relative overflow-hidden rounded-2xl bg-white p-4 transition-all duration-300 hover:-translate-y-0.5"
      style={{
        borderLeft: `4px solid`,
        borderImageSlice: 1,
        borderImageSource: borderGradient,
        boxShadow: '0 2px 10px rgba(0,0,0,0.06)',
        animationDelay: cascadeDelay,
      }}
    >
      {/* Liseré gauche dégradé — fallback navigateurs sans border-image :
          on ajoute aussi un pseudo-élément visuel via inline style sur un div. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 w-1"
        style={{ background: borderGradient }}
      />

      {/* Top : badge type + temps relatif */}
      <div className="mb-2 flex items-center justify-between">
        <span
          className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.08em]"
          style={{ backgroundColor: `${color}15`, color }}
        >
          <TypeIcon className="size-3" />
          {typeLabel}
        </span>
        <span className="text-[10px] font-medium" style={{ color: AMINATA_TOKENS.gris }}>
          {relTime(ad.createdAt)}
        </span>
      </div>

      {/* Photo — large, full-width rounded */}
      {ad.photoUrl && (
        <img
          src={ad.photoUrl}
          alt={ad.title}
          className="mb-3 h-40 w-full rounded-xl object-cover"
          loading="lazy"
        />
      )}

      {/* Title — bold, Playfair Display */}
      <h3
        className="text-base font-bold leading-tight"
        style={{ ...PLAYFAIR_FONT, color: AMINATA_TOKENS.texte }}
      >
        {ad.title}
      </h3>

      {/* Description (truncated 3 lines) */}
      {ad.description && (
        <p
          className="mt-1 line-clamp-3 text-[13px] leading-relaxed"
          style={{ color: AMINATA_TOKENS.gris }}
        >
          {ad.description}
        </p>
      )}

      {/* Price (prominent — pill colored by type) */}
      <div
        className="mt-2 inline-flex items-center rounded-lg px-3 py-1.5 text-[15px] font-extrabold"
        style={{
          backgroundColor: `${color}12`,
          color,
          fontFamily: '"Playfair Display", serif',
        }}
      >
        {priceDisplay}
      </div>

      {/* District / distance info */}
      <div
        className="mt-2 flex flex-wrap items-center gap-3 text-[11px] font-medium"
        style={{ color: AMINATA_TOKENS.gris }}
      >
        {ad.district && (
          <span className="inline-flex items-center gap-1">
            <MapPin className="size-3" />
            {ad.district}
          </span>
        )}
        {ad.distance != null && (
          <span className="inline-flex items-center gap-1">
            <Navigation className="size-3" />
            {Math.round(ad.distance)} m
          </span>
        )}
      </div>

      {/* Boutons d'action — Appeler (dark) + WhatsApp (green #25D366) */}
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <a
          href={`tel:${ad.phone}`}
          className="flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-bold text-white transition-all hover:-translate-y-0.5"
          style={{
            backgroundColor: AMINATA_TOKENS.texte,
            boxShadow: '0 4px 10px rgba(0,0,0,0.18)',
          }}
        >
          <Phone className="size-4" />
          Appeler
        </a>
        {whatsappUrl ? (
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-bold text-white transition-all hover:-translate-y-0.5"
            style={{
              backgroundColor: '#25D366',
              boxShadow: '0 4px 10px rgba(37,211,102,0.25)',
            }}
          >
            <MessageCircle className="size-4" />
            WhatsApp
          </a>
        ) : (
          // Quand pas de WhatsApp : on garde une seule colonne pleine largeur
          // pour Appeler (grille sm:grid-cols-2 → on ajoute un spacer invisible)
          <span aria-hidden className="hidden sm:block" />
        )}
      </div>
    </article>
  )
}

function QuartierAdForm({
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
  const [type, setType] = useState<'vente' | 'don' | 'service'>('vente')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [price, setPrice] = useState('')
  const [phone, setPhone] = useState('')
  const [whatsapp, setWhatsapp] = useState('')
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

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

  const handleSubmit = async () => {
    if (title.trim().length < 3) {
      toast({
        title: 'Titre requis',
        description: "Indiquez un titre d'au moins 3 caractères.",
      })
      return
    }
    if (phone.trim().length < 6) {
      toast({
        title: 'Téléphone requis',
        description: 'Indiquez un numéro de téléphone.',
      })
      return
    }
    // VOIX — Aminata confirme la publication DANS le geste utilisateur
    // (clic sur le bouton d'envoi). iOS Safari et Chrome mobile exigent
    // que speechSynthesis.speak() soit appelé synchronement dans un handler
    // de geste ; un appel différé (après await fetch) est ignoré.
    try {
      parler('Votre annonce a été publiée.')
    } catch {
      /* ignore — synthèse vocale indisponible */
    }
    setSubmitting(true)
    try {
      const body: Record<string, unknown> = {
        type,
        title: title.trim(),
        description: description.trim() || null,
        price: type === 'don' ? 'Gratuit' : price.trim() || 'À débattre',
        photoUrl: photoUrl ?? null,
        phone: phone.trim(),
        whatsapp: whatsapp.trim() || null,
        plateId: plate.id,
        qrToken: plate.qrToken,
        district: plate.district ?? null,
        lat: plate.lat ?? null,
        lng: plate.lng ?? null,
      }
      const res = await fetch('/api/city/quartier-ads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = (await res.json().catch(() => null)) as {
        ok: boolean
        error?: string
      } | null
      if (json?.ok) {
        setSubmitted(true)
      } else {
        toast({
          title: 'Erreur',
          description: json?.error || 'Publication impossible.',
        })
      }
    } catch {
      toast({ title: 'Erreur réseau', description: 'Vérifiez votre connexion.' })
    } finally {
      setSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-6 text-center">
        <div
          className="flex size-20 items-center justify-center rounded-full shadow-lg"
          style={{ background: '#00A651' }}
        >
          <Check className="size-10 text-white" />
        </div>
        <h2 className="mt-5 text-xl font-bold text-[#00A651]" style={TITLE_FONT}>
          Annonce publiée !
        </h2>
        <p className="mt-2 text-sm text-[#1A1A1A]/70">
          Votre annonce « {title.trim()} » est désormais visible par les
          citoyens du quartier.
        </p>
        <Button
          onClick={onSuccess}
          className="mt-6 w-full rounded-xl bg-[#00A651] py-4 text-white hover:bg-[#008a44]"
        >
          Retour aux annonces
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
            Déposer une annonce
          </h2>
          <p className="text-xs text-[#1A1A1A]/55">
            Plaque #{plate.plateNumber} · {plate.district ?? 'Dakar'}
          </p>
        </div>
      </div>

      {/* Type select */}
      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <label
          className="mb-2 block text-sm font-bold text-[#1A1A1A]"
          style={TITLE_FONT}
        >
          Type d&apos;annonce
        </label>
        <div className="grid grid-cols-3 gap-2">
          {(
            [
              { id: 'vente', label: 'Vente', color: AMINATA_TOKENS.rouge },
              { id: 'don', label: 'Don', color: AMINATA_TOKENS.vert },
              { id: 'service', label: 'Service', color: AMINATA_TOKENS.bleu },
            ] as const
          ).map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setType(opt.id)}
              className={cn(
                'rounded-xl border-2 px-3 py-2.5 text-sm font-bold uppercase tracking-wide transition-all',
                type === opt.id ? 'text-white shadow' : 'bg-white text-[#1A1A1A]/70',
              )}
              style={
                type === opt.id
                  ? { backgroundColor: opt.color, borderColor: opt.color }
                  : { borderColor: '#d5d3d4' }
              }
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Title */}
      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <label className="mb-1.5 block text-sm font-bold text-[#1A1A1A]">
          Titre <span className="text-[#E30613]">*</span>
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Ex: Vélo VTT en bon état"
          className="w-full rounded-xl border border-[#EAE5DC] bg-[#FAFAF7] px-4 py-3 text-base focus:border-[#00A651] focus:outline-none focus:ring-2 focus:ring-[#00A651]/20"
        />
      </div>

      {/* Description */}
      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <label className="mb-1.5 block text-sm font-bold text-[#1A1A1A]">
          Description
        </label>
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Décrivez votre annonce (état, dimensions, conditions…)"
          rows={3}
          className="w-full rounded-xl border border-[#EAE5DC] bg-[#FAFAF7] focus:border-[#00A651] focus:outline-none focus:ring-2 focus:ring-[#00A651]/20"
        />
      </div>

      {/* Price (hidden for dons — forced to "Gratuit") */}
      {type !== 'don' && (
        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <label className="mb-1.5 block text-sm font-bold text-[#1A1A1A]">
            Prix
          </label>
          <input
            type="text"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="15000 FCFA · Gratuit · À débattre"
            className="w-full rounded-xl border border-[#EAE5DC] bg-[#FAFAF7] px-4 py-3 text-base focus:border-[#00A651] focus:outline-none focus:ring-2 focus:ring-[#00A651]/20"
          />
          <p className="mt-1 text-xs text-[#1A1A1A]/50">
            Indiquez le prix en FCFA, « Gratuit » ou « À débattre ».
          </p>
        </div>
      )}

      {/* Photo */}
      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <label className="mb-1.5 block text-sm font-bold text-[#1A1A1A]">
          Photo
        </label>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handlePhoto}
          className="hidden"
        />
        {photoUrl ? (
          <div className="relative">
            <img
              src={photoUrl}
              alt="Aperçu"
              className="h-40 w-full rounded-xl object-cover"
            />
            <button
              type="button"
              onClick={() => setPhotoUrl(null)}
              className="absolute right-2 top-2 rounded-full bg-black/60 p-1.5 text-white"
              aria-label="Supprimer la photo"
            >
              <X className="size-4" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[#00A651]/30 bg-[#00A651]/5 px-4 py-6 text-[#00A651] transition hover:bg-[#00A651]/10"
          >
            <Camera className="size-6" />
            <span className="text-sm font-semibold">Prendre une photo</span>
          </button>
        )}
      </div>

      {/* Phone (required) */}
      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <label className="mb-1.5 block text-sm font-bold text-[#1A1A1A]">
          Téléphone <span className="text-[#E30613]">*</span>
        </label>
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+221 77 000 00 00"
          autoComplete="tel"
          className="w-full rounded-xl border border-[#EAE5DC] bg-[#FAFAF7] px-4 py-3 text-base focus:border-[#00A651] focus:outline-none focus:ring-2 focus:ring-[#00A651]/20"
        />
      </div>

      {/* WhatsApp (optional) */}
      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <label className="mb-1.5 block text-sm font-bold text-[#1A1A1A]">
          WhatsApp <span className="text-[#1A1A1A]/40">(optionnel)</span>
        </label>
        <input
          type="tel"
          value={whatsapp}
          onChange={(e) => setWhatsapp(e.target.value)}
          placeholder="+221 77 000 00 00"
          className="w-full rounded-xl border border-[#EAE5DC] bg-[#FAFAF7] px-4 py-3 text-base focus:border-[#00A651] focus:outline-none focus:ring-2 focus:ring-[#00A651]/20"
        />
      </div>

      {/* Submit */}
      <Button
        onClick={handleSubmit}
        disabled={submitting}
        className="w-full rounded-xl bg-[#00A651] py-5 text-base font-bold uppercase tracking-wide text-white hover:bg-[#008a44]"
      >
        {submitting ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            Publication…
          </>
        ) : (
          <>
            <Send className="size-4" />
            Publier l&apos;annonce
          </>
        )}
      </Button>
    </div>
  )
}

// ============================================================
// SchoolsView — Écoles & cours (établissements · soutien · formation)
//    Blue section header + GraduationCap icon. Filtres type (crèche, primaire,
//    collège, lycée, institut, formation, répétiteur). Cartes avec photo,
//    niveaux, horaires, prix cours, badges premium/vérifié, boutons Appeler /
//    WhatsApp / Y aller. Form self-service pour référencer une école.
// ============================================================

type School = {
  id: string
  name: string
  type: string // creche | primaire | college | lycee | institut | formation | repetiteur
  levels: string | null
  phone: string
  whatsapp?: string | null
  address: string | null
  hours: string | null
  description: string | null
  photoUrl: string | null
  lat?: number | null
  lng?: number | null
  price?: string | null
  district?: string | null
  distance?: number | null
  verified?: boolean
  isPremium?: boolean
}

const SCHOOL_TYPES: ReadonlyArray<{ id: string; label: string; color: string }> = [
  { id: 'all',        label: 'TOUS',         color: AMINATA_TOKENS.bleu },
  { id: 'primaire',   label: 'PRIMAIRE',     color: AMINATA_TOKENS.vert },
  { id: 'college',    label: 'COLLÈGE',      color: AMINATA_TOKENS.bleuClair },
  { id: 'lycee',      label: 'LYCÉE',        color: AMINATA_TOKENS.violet },
  { id: 'institut',   label: 'INSTITUT',     color: AMINATA_TOKENS.rouge },
  { id: 'formation',  label: 'FORMATION',    color: AMINATA_TOKENS.jauneDark },
  { id: 'repetiteur', label: 'RÉPÉTITEUR',   color: AMINATA_TOKENS.vertClair },
  { id: 'creche',     label: 'CRÈCHE',       color: AMINATA_TOKENS.orange },
]

/** Couleur unie associée au type d'établissement. */
function schoolTypeColor(type: string): string {
  const found = SCHOOL_TYPES.find((t) => t.id === type)
  return found ? found.color : AMINATA_TOKENS.bleu
}

/** Dégradé vertical (clair→foncé) pour la bordure gauche, selon le type. */
function schoolTypeBorderGradient(type: string): string {
  const color = schoolTypeColor(type)
  // Variante foncée pour le bas du dégradé — on dérive une teinte plus sombre
  // via une seconde couleur fixe par type pour garder un contraste net.
  const dark: Record<string, string> = {
    primaire: '#047857',
    college: AMINATA_TOKENS.bleu,
    lycee: '#4A2D6E',
    institut: '#8B0000',
    formation: AMINATA_TOKENS.jauneDark,
    repetiteur: AMINATA_TOKENS.vert,
    creche: AMINATA_TOKENS.rouge,
  }
  const end = dark[type] ?? color
  return `linear-gradient(180deg, ${color} 0%, ${end} 100%)`
}

function schoolTypeLabel(type: string): string {
  const found = SCHOOL_TYPES.find((t) => t.id === type)
  return found ? found.label.toUpperCase() : type.toUpperCase()
}

function SchoolsView({ plate }: { plate: CityPlate }) {
  const { toast } = useToast()
  const [schools, setSchools] = useState<School[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedType, setSelectedType] = useState<string>('all')
  const [showForm, setShowForm] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    ;(async () => {
      try {
        const params = new URLSearchParams()
        if (selectedType !== 'all') params.set('type', selectedType)
        if (plate.district) params.set('district', plate.district)
        const res = await fetch(`/api/city/schools?${params.toString()}`, {
          cache: 'no-store',
        })
        const json = (await res.json().catch(() => null)) as
          | { ok: true; data: { schools?: School[] } }
          | { ok: false; error?: string }
          | null
        if (cancelled) return
        if (json?.ok && Array.isArray(json.data?.schools)) {
          setSchools(json.data.schools)
        } else {
          setSchools([])
          if (json && !json.ok) setError(json.error ?? 'Service indisponible')
        }
      } catch {
        if (cancelled) return
        setError('Connexion impossible. Vérifiez votre réseau.')
        setSchools([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [selectedType, plate.district])

  if (showForm) {
    return (
      <SchoolRegistrationForm
        plate={plate}
        onCancel={() => setShowForm(false)}
        onSuccess={() => {
          setShowForm(false)
        }}
      />
    )
  }

  const plateSubtitle = plate.district
    ? `Plaque #${plate.plateNumber} · ${plate.district}`
    : `Plaque #${plate.plateNumber}`

  return (
    <div
      className="aminata-screen-enter space-y-4"
      style={{ ...INTER_FONT, backgroundColor: AMINATA_TOKENS.blanc, color: AMINATA_TOKENS.texte }}
    >
      {AMINATA_FONT_LINK}
      {AMINATA_KEYFRAMES_STYLE}

      {/* Header — blue gradient + GraduationCap icon tile (white) */}
      <AminataModuleHeader
        gradient={`linear-gradient(135deg, ${AMINATA_TOKENS.bleu} 0%, #1E40AF 100%)`}
        icon={<GraduationCap className="size-6" style={{ color: AMINATA_TOKENS.bleu }} />}
        title="Écoles & Cours"
        subtitle={plateSubtitle}
      />

      {/* Bannière descriptive */}
      <AminataBanner
        gradient={`linear-gradient(135deg, ${AMINATA_TOKENS.bleu} 0%, #1E40AF 100%)`}
        eyebrow="Écoles & Cours · Autour de vous"
        text="Crèches, primaires, collèges, lycées, instituts, centres de formation et répétiteurs. Appelez ou lancez le guidage en un geste."
      />

      {/* Bouton Référencer une école — blue premium #1E3A8A, shadow */}
      <AminataPrimaryButton
        gradient={`linear-gradient(135deg, ${AMINATA_TOKENS.bleu} 0%, #1E40AF 100%)`}
        icon={<Plus className="size-5" />}
        label="Référencer une école"
        onClick={() => setShowForm(true)}
      />

      {/* Filtres type — chips horizontaux scrollables, couleur par type */}
      <div className="aminata-filters-scroll -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {SCHOOL_TYPES.map((chip) => (
          <AminataFilterChip
            key={chip.id}
            label={chip.label}
            active={selectedType === chip.id}
            color={chip.color}
            onClick={() => setSelectedType(chip.id)}
          />
        ))}
      </div>

      {/* Liste */}
      {loading ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl bg-white py-16 shadow-sm">
          <Loader2 className="size-8 animate-spin" style={{ color: AMINATA_TOKENS.bleu }} />
          <p className="text-sm" style={{ color: AMINATA_TOKENS.gris }}>
            Chargement des écoles…
          </p>
        </div>
      ) : error ? (
        <div className="rounded-2xl bg-white p-8 text-center shadow-sm">
          <AlertTriangle className="mx-auto size-10" style={{ color: AMINATA_TOKENS.rouge }} />
          <p className="mt-3 text-sm font-semibold" style={{ ...PLAYFAIR_FONT, color: AMINATA_TOKENS.texte }}>
            {error}
          </p>
          <p className="mt-1 text-xs" style={{ color: AMINATA_TOKENS.gris }}>
            Réessayez dans quelques instants.
          </p>
        </div>
      ) : schools.length === 0 ? (
        // Empty state — friendly message with GraduationCap icon
        <div className="rounded-2xl bg-white p-8 text-center shadow-sm">
          <div
            className="mx-auto flex size-16 items-center justify-center rounded-2xl"
            style={{ backgroundColor: `${AMINATA_TOKENS.bleu}18` }}
          >
            <GraduationCap className="size-8" style={{ color: AMINATA_TOKENS.bleu }} />
          </div>
          <p className="mt-3 text-base font-bold" style={{ ...PLAYFAIR_FONT, color: AMINATA_TOKENS.texte }}>
            Aucun établissement pour ce filtre.
          </p>
          <p className="mt-1 text-xs" style={{ color: AMINATA_TOKENS.gris }}>
            Référencez une école ou un cours dans votre quartier.
          </p>
        </div>
      ) : (
        <>
          {/* Header résultats : nombre + badge "Écoles" */}
          <div className="flex items-center justify-between px-0.5">
            <span
              className="text-[11px] font-extrabold uppercase tracking-[0.12em]"
              style={{ color: AMINATA_TOKENS.texte }}
            >
              {schools.length} établissement{schools.length > 1 ? 's' : ''}
            </span>
            <span
              className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold"
              style={{
                backgroundColor: `${AMINATA_TOKENS.bleu}15`,
                color: AMINATA_TOKENS.bleu,
              }}
            >
              <GraduationCap className="size-3" />
              Écoles
            </span>
          </div>

          {/* Cartes — cascade animation */}
          {schools.map((s, idx) => (
            <SchoolCard key={s.id} school={s} plate={plate} index={idx} />
          ))}
        </>
      )}
    </div>
  )
}

function SchoolCard({
  school,
  plate,
  index = 0,
}: {
  school: School
  plate: CityPlate
  index?: number
}) {
  const color = schoolTypeColor(school.type)
  const borderGradient = schoolTypeBorderGradient(school.type)

  const directionsUrl =
    school.lat != null && school.lng != null
      ? `https://www.google.com/maps/dir/?api=1&destination=${school.lat},${school.lng}&travelmode=walking`
      : null

  const whatsappUrl = school.whatsapp
    ? `https://wa.me/${school.whatsapp.replace(/[^\d]/g, '')}?text=${encodeURIComponent(
        `Bonjour, je vous contacte au sujet de ${school.name}.`,
      )}`
    : null

  return (
    <article
      className="aminata-card-enter group relative overflow-hidden rounded-2xl bg-white p-4 transition-all duration-300 hover:-translate-y-0.5"
      style={{
        borderLeft: `4px solid`,
        borderImageSlice: 1,
        borderImageSource: borderGradient,
        boxShadow: '0 2px 10px rgba(0,0,0,0.06)',
        animationDelay: `${Math.min(index * 0.07, 0.4)}s`,
      }}
    >
      {/* Liseré gauche dégradé (fallback visuel pour les navigateurs sans border-image) */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 w-1"
        style={{ background: borderGradient }}
      />

      {/* Premium (gold) / Verified (blue checkmark) badges */}
      {(school.isPremium || school.verified) && (
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          {school.verified && (
            <span
              className="inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-bold"
              style={{
                backgroundColor: `${AMINATA_TOKENS.bleuClair}18`,
                color: AMINATA_TOKENS.bleu,
              }}
            >
              <BadgeCheck className="size-3" />
              Vérifié
            </span>
          )}
          {school.isPremium && (
            <span
              className="inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-bold"
              style={{
                backgroundColor: `${AMINATA_TOKENS.jauneDark}18`,
                color: AMINATA_TOKENS.jauneDark,
              }}
            >
              <Star className="size-3" style={{ fill: AMINATA_TOKENS.jauneDark }} />
              Premium
            </span>
          )}
        </div>
      )}

      {/* Photo — prominent, full-width rounded */}
      {school.photoUrl && (
        <img
          src={school.photoUrl}
          alt={school.name}
          className="mb-3 h-40 w-full rounded-xl object-cover"
          loading="lazy"
        />
      )}

      {/* Name + type badge */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3
          className="text-base font-bold leading-tight"
          style={{ ...PLAYFAIR_FONT, color: AMINATA_TOKENS.texte }}
        >
          {school.name}
        </h3>
        <span
          className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.08em]"
          style={{ backgroundColor: `${color}18`, color }}
        >
          {schoolTypeLabel(school.type)}
        </span>
      </div>

      {/* Levels */}
      {school.levels && (
        <p className="mt-1 text-[13px] font-semibold" style={{ color: AMINATA_TOKENS.texte }}>
          {school.levels}
        </p>
      )}

      {/* Hours + Address — compact meta row */}
      {(school.hours || school.address) && (
        <div
          className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] font-medium"
          style={{ color: AMINATA_TOKENS.gris }}
        >
          {school.hours && (
            <span className="inline-flex items-center gap-1">
              <Clock className="size-3" />
              {school.hours}
            </span>
          )}
          {school.address && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-3" />
              {school.address}
            </span>
          )}
        </div>
      )}

      {/* Description (truncated 2 lines) */}
      {school.description && (
        <p
          className="mt-2 line-clamp-2 text-[12px] leading-relaxed"
          style={{ color: AMINATA_TOKENS.gris }}
        >
          {school.description}
        </p>
      )}

      {/* Course price (for repetiteur / formation) */}
      {school.price && (
        <div
          className="mt-2 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[14px] font-extrabold"
          style={{
            backgroundColor: `${color}12`,
            color,
            fontFamily: '"Playfair Display", serif',
          }}
        >
          {school.price}
        </div>
      )}

      {/* Distance */}
      {school.distance != null && (
        <p
          className="mt-2 inline-flex items-center gap-1 text-[11px]"
          style={{ color: AMINATA_TOKENS.gris }}
        >
          <Navigation className="size-3" />
          {Math.round(school.distance)} m
        </p>
      )}

      {/* Boutons d'action — 3 colonnes : Appeler (bleu) / WhatsApp (vert) / Y aller (blanc bordé) */}
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <a
          href={`tel:${school.phone}`}
          className="flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-[13px] font-bold text-white transition-all hover:-translate-y-0.5"
          style={{
            backgroundColor: AMINATA_TOKENS.bleuClair,
            boxShadow: '0 4px 10px rgba(59,130,246,0.25)',
          }}
        >
          <Phone className="size-4" />
          Appeler
        </a>
        {whatsappUrl ? (
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-[13px] font-bold text-white transition-all hover:-translate-y-0.5"
            style={{
              backgroundColor: '#25D366',
              boxShadow: '0 4px 10px rgba(37,211,102,0.25)',
            }}
          >
            <MessageCircle className="size-4" />
            WhatsApp
          </a>
        ) : (
          <span aria-hidden className="hidden sm:block" />
        )}
        {directionsUrl ? (
          <a
            href={directionsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-1.5 rounded-xl bg-white py-2.5 text-[13px] font-bold transition-all hover:-translate-y-0.5"
            style={{
              color: AMINATA_TOKENS.bleu,
              border: `2px solid ${AMINATA_TOKENS.bleu}`,
            }}
          >
            <Navigation className="size-4" />
            Y aller
          </a>
        ) : (
          <span aria-hidden className="hidden sm:block" />
        )}
      </div>

      {/* For école-type plates: link to Check-in école */}
      {plate.plateType === 'ecole' && (
        <div
          className="mt-3 rounded-xl px-3 py-2 text-center"
          style={{ backgroundColor: `${AMINATA_TOKENS.bleu}08` }}
        >
          <p className="text-xs" style={{ color: AMINATA_TOKENS.bleu }}>
            <DoorOpen className="mr-1 inline size-3" />
            Pointage école disponible sur cette plaque
          </p>
        </div>
      )}
    </article>
  )
}

function SchoolRegistrationForm({
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
  const [name, setName] = useState('')
  const [type, setType] = useState<string>('primaire')
  const [levels, setLevels] = useState('')
  const [phone, setPhone] = useState('')
  const [whatsapp, setWhatsapp] = useState('')
  const [address, setAddress] = useState(plate.address ?? '')
  const [hours, setHours] = useState('')
  const [description, setDescription] = useState('')
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

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

  const handleSubmit = async () => {
    if (name.trim().length < 2) {
      toast({
        title: 'Nom requis',
        description: "Indiquez le nom de l'établissement.",
      })
      return
    }
    if (phone.trim().length < 6) {
      toast({
        title: 'Téléphone requis',
        description: 'Indiquez un numéro de téléphone.',
      })
      return
    }
    // VOIX — Aminata confirme la soumission DANS le geste utilisateur
    // (clic sur le bouton d'envoi). iOS Safari et Chrome mobile exigent
    // que speechSynthesis.speak() soit appelé synchronement dans un handler
    // de geste ; un appel différé (après await fetch) est ignoré.
    try {
      parler('Établissement soumis. Validation sous 48 heures.')
    } catch {
      /* ignore — synthèse vocale indisponible */
    }
    setSubmitting(true)
    try {
      const body: Record<string, unknown> = {
        name: name.trim(),
        type,
        levels: levels.trim() || null,
        phone: phone.trim(),
        whatsapp: whatsapp.trim() || null,
        address: address.trim() || null,
        hours: hours.trim() || null,
        description: description.trim() || null,
        photoUrl: photoUrl ?? null,
        district: plate.district ?? null,
        lat: plate.lat ?? null,
        lng: plate.lng ?? null,
        plateId: plate.id,
        qrToken: plate.qrToken,
      }
      const res = await fetch('/api/city/schools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = (await res.json().catch(() => null)) as {
        ok: boolean
        error?: string
      } | null
      if (json?.ok) {
        setSubmitted(true)
      } else {
        toast({
          title: 'Erreur',
          description: json?.error || 'Soumission impossible.',
        })
      }
    } catch {
      toast({ title: 'Erreur réseau', description: 'Vérifiez votre connexion.' })
    } finally {
      setSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-6 text-center">
        <div
          className="flex size-20 items-center justify-center rounded-full shadow-lg"
          style={{ background: '#0066CC' }}
        >
          <Check className="size-10 text-white" />
        </div>
        <h2 className="mt-5 text-xl font-bold text-[#0066CC]" style={TITLE_FONT}>
          Établissement soumis !
        </h2>
        <p className="mt-2 text-sm text-[#1A1A1A]/70">
          Votre fiche « {name.trim()} » sera visible après validation de la mairie.
        </p>
        <p className="mt-1 text-xs font-semibold text-[#1A1A1A]/55">
          Validation sous 48h.
        </p>
        <Button
          onClick={onSuccess}
          className="mt-6 w-full rounded-xl bg-[#0066CC] py-4 text-white hover:bg-[#0055aa]"
        >
          Retour à la liste
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
            Référencer une école
          </h2>
          <p className="text-xs text-[#1A1A1A]/55">
            Plaque #{plate.plateNumber} · {plate.district ?? 'Dakar'}
          </p>
        </div>
      </div>

      {/* Name */}
      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <label className="mb-1.5 block text-sm font-bold text-[#1A1A1A]">
          Nom de l&apos;établissement <span className="text-[#E30613]">*</span>
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ex: École Élémentaire Dakar"
          className="w-full rounded-xl border border-[#EAE5DC] bg-[#FAFAF7] px-4 py-3 text-base focus:border-[#0066CC] focus:outline-none focus:ring-2 focus:ring-[#0066CC]/20"
        />
      </div>

      {/* Type select */}
      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <label
          className="mb-2 block text-sm font-bold text-[#1A1A1A]"
          style={TITLE_FONT}
        >
          Type d&apos;établissement
        </label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {SCHOOL_TYPES.filter((t) => t.id !== 'all').map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setType(opt.id)}
              className={cn(
                'rounded-xl border-2 px-2 py-2 text-xs font-bold uppercase tracking-wide transition-all',
                type === opt.id ? 'text-white shadow' : 'bg-white text-[#1A1A1A]/70',
              )}
              style={
                type === opt.id
                  ? { backgroundColor: opt.color, borderColor: opt.color }
                  : { borderColor: '#d5d3d4' }
              }
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Levels */}
      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <label className="mb-1.5 block text-sm font-bold text-[#1A1A1A]">
          Niveaux
        </label>
        <input
          type="text"
          value={levels}
          onChange={(e) => setLevels(e.target.value)}
          placeholder="Ex: Maternelle à CM2"
          className="w-full rounded-xl border border-[#EAE5DC] bg-[#FAFAF7] px-4 py-3 text-base focus:border-[#0066CC] focus:outline-none focus:ring-2 focus:ring-[#0066CC]/20"
        />
      </div>

      {/* Phone */}
      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <label className="mb-1.5 block text-sm font-bold text-[#1A1A1A]">
          Téléphone <span className="text-[#E30613]">*</span>
        </label>
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+221 33 800 00 00"
          autoComplete="tel"
          className="w-full rounded-xl border border-[#EAE5DC] bg-[#FAFAF7] px-4 py-3 text-base focus:border-[#0066CC] focus:outline-none focus:ring-2 focus:ring-[#0066CC]/20"
        />
      </div>

      {/* WhatsApp */}
      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <label className="mb-1.5 block text-sm font-bold text-[#1A1A1A]">
          WhatsApp <span className="text-[#1A1A1A]/40">(optionnel)</span>
        </label>
        <input
          type="tel"
          value={whatsapp}
          onChange={(e) => setWhatsapp(e.target.value)}
          placeholder="+221 77 000 00 00"
          className="w-full rounded-xl border border-[#EAE5DC] bg-[#FAFAF7] px-4 py-3 text-base focus:border-[#0066CC] focus:outline-none focus:ring-2 focus:ring-[#0066CC]/20"
        />
      </div>

      {/* Address */}
      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <label className="mb-1.5 block text-sm font-bold text-[#1A1A1A]">
          Adresse
        </label>
        <input
          type="text"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="Rue, quartier, ville"
          className="w-full rounded-xl border border-[#EAE5DC] bg-[#FAFAF7] px-4 py-3 text-base focus:border-[#0066CC] focus:outline-none focus:ring-2 focus:ring-[#0066CC]/20"
        />
      </div>

      {/* Hours */}
      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <label className="mb-1.5 block text-sm font-bold text-[#1A1A1A]">
          Horaires
        </label>
        <input
          type="text"
          value={hours}
          onChange={(e) => setHours(e.target.value)}
          placeholder="Ex: Lun–Ven · 8h–17h"
          className="w-full rounded-xl border border-[#EAE5DC] bg-[#FAFAF7] px-4 py-3 text-base focus:border-[#0066CC] focus:outline-none focus:ring-2 focus:ring-[#0066CC]/20"
        />
      </div>

      {/* Description */}
      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <label className="mb-1.5 block text-sm font-bold text-[#1A1A1A]">
          Description
        </label>
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Présentation, spécialités, pédagogie…"
          rows={3}
          className="w-full rounded-xl border border-[#EAE5DC] bg-[#FAFAF7] focus:border-[#0066CC] focus:outline-none focus:ring-2 focus:ring-[#0066CC]/20"
        />
      </div>

      {/* Photo */}
      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <label className="mb-1.5 block text-sm font-bold text-[#1A1A1A]">
          Photo
        </label>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handlePhoto}
          className="hidden"
        />
        {photoUrl ? (
          <div className="relative">
            <img
              src={photoUrl}
              alt="Aperçu"
              className="h-40 w-full rounded-xl object-cover"
            />
            <button
              type="button"
              onClick={() => setPhotoUrl(null)}
              className="absolute right-2 top-2 rounded-full bg-black/60 p-1.5 text-white"
              aria-label="Supprimer la photo"
            >
              <X className="size-4" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[#0066CC]/30 bg-[#0066CC]/5 px-4 py-6 text-[#0066CC] transition hover:bg-[#0066CC]/10"
          >
            <Camera className="size-6" />
            <span className="text-sm font-semibold">Prendre une photo</span>
          </button>
        )}
      </div>

      {/* Submit */}
      <Button
        onClick={handleSubmit}
        disabled={submitting}
        className="w-full rounded-xl bg-[#0066CC] py-5 text-base font-bold uppercase tracking-wide text-white hover:bg-[#0055aa]"
      >
        {submitting ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            Soumission…
          </>
        ) : (
          <>
            <Send className="size-4" />
            Soumettre l&apos;établissement
          </>
        )}
      </Button>

      <p className="text-center text-xs text-[#1A1A1A]/50">
        Validation sous 48h par la mairie.
      </p>
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
        style={{ borderTop: '6px solid #0026A3' }}
      >
        {/* Header */}
        <div className="mb-5 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className="flex h-12 w-12 items-center justify-center rounded-xl text-2xl"
              style={{ background: '#FFD700' }}
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
              className="w-full rounded-xl border border-[#EAE5DC] bg-[#FAFAF7] px-4 py-3 text-base focus:border-[#0026A3] focus:outline-none focus:ring-2 focus:ring-[#0026A3]/20"
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
              className="w-full rounded-xl border border-[#EAE5DC] bg-[#FAFAF7] px-4 py-3 text-base focus:border-[#0026A3] focus:outline-none focus:ring-2 focus:ring-[#0026A3]/20"
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
                className="w-full rounded-xl border border-[#EAE5DC] bg-[#FAFAF7] px-4 py-3 text-base focus:border-[#0026A3] focus:outline-none focus:ring-2 focus:ring-[#0026A3]/20"
              />
              <p className="mt-1 text-xs text-[#1A1A1A]/50">
                Un SMS sera envoyé à votre parent à chaque pointage.
              </p>
            </div>
          )}

          {/* Note privacy */}
          <div className="rounded-xl bg-[#0026A3]/5 px-3 py-2.5">
            <p className="text-xs leading-relaxed text-[#1A1A1A]/65">
              <Shield className="mr-1 inline size-3 text-[#0026A3]" />
              Vos données restent confidentielles et ne sont partagées qu&apos;avec
              les services municipaux pour votre sécurité.
            </p>
          </div>

          {/* Submit */}
          <Button
            type="submit"
            disabled={!phoneValid || submitting || localSubmitting}
            className="w-full rounded-xl bg-[#0026A3] py-5 text-base font-bold uppercase tracking-wide text-white hover:bg-[#1E40AF]"
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
          ? `Aminata confirme votre arrivée à l'école ${plate.label}. Pointage enregistré. Le parent sera notifié à la prochaine synchronisation.`
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
        style={{ background: '#0026A3', borderRadius: '0 0 24px 24px' }}
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
            className="flex h-10 w-10 items-center justify-center bg-[#0026A3]"
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
            className="rounded-2xl border border-[#FFD700]/40 bg-[#FFD700]/10 p-4"
          >
            <div className="mb-2 flex items-center gap-2">
              <LogIn className="size-4 text-[#0026A3]" />
              <p className="text-sm font-bold text-[#1A1A1A]">Identifiez-vous</p>
            </div>
            <p className="text-xs text-[#1A1A1A]/65">
              Votre numéro de téléphone suffit pour pointer. Une seule
              inscription pour tous les pointages de l&apos;année.
            </p>
            <Button
              onClick={() => void onEnsureCitizen('school')}
              className="mt-3 w-full rounded-xl bg-[#0026A3] py-3 text-sm font-bold text-white hover:bg-[#1E40AF]"
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
          className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl border border-[#1A1A1A]/10 py-3 text-sm font-semibold text-[#0026A3] transition hover:bg-[#F5F5F5]"
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
            Pointage enregistré. Le parent sera notifié à la prochaine synchronisation.
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
