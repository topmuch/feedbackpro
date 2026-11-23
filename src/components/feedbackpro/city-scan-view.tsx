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

import { useEffect, useState, useCallback } from 'react'
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
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'
import { parler } from '@/lib/staff-tts'

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

type ModuleId = 'urgence' | 'signalement' | 'orientation' | 'artisans' | 'mairie' | 'tax_fraud'

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
    emoji: '🆘',
    title: 'URGENCE & SÉCURITÉ',
    desc: 'Police · Pompiers · SAMU',
    sub: 'GPS sur consentement',
    color: COLORS.red,
  },
  {
    id: 'signalement',
    emoji: '🟠',
    title: 'SIGNALER UN INCIDENT',
    desc: 'Voirie · Éclairage · Eau · Propreté · Sécurité',
    sub: 'Routage automatique',
    color: COLORS.orange,
  },
  {
    id: 'orientation',
    emoji: '🔵',
    title: 'ORIENTATION & MOBILITÉ',
    desc: 'Transports · Position · Pharmacie de garde',
    sub: 'Aminata vous guide',
    color: COLORS.blue,
  },
  {
    id: 'artisans',
    emoji: '🛠️',
    title: 'ARTISANS DU QUARTIER',
    desc: 'Plombier · Électricien · Menuisier vérifiés',
    sub: 'Annuaire municipal',
    color: COLORS.green,
  },
  {
    id: 'mairie',
    emoji: '🏛️',
    title: 'MAIRIE DYNAMIQUE',
    desc: 'Horaires · Services · Annonces municipales',
    sub: "Selon l'heure du jour",
    color: COLORS.purple,
  },
  {
    id: 'tax_fraud',
    emoji: '🚨',
    title: 'RADAR TAXES & DÉPÔTS',
    desc: 'Camion · Conteneur · Chantier non déclaré',
    sub: 'Photo + GPS + récompense',
    color: '#8B0000',
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

  // --- Artisans (chargés à la demande) ---
  const [artisans, setArtisans] = useState<CityArtisan[]>([])
  const [artisansLoading, setArtisansLoading] = useState(false)
  const [artisansLoaded, setArtisansLoaded] = useState(false)

  // --- Orientation : position partagée ---
  const [sharedPos, setSharedPos] = useState<{ lat: number; lng: number } | null>(null)
  const [posCopied, setPosCopied] = useState(false)

  // --- Horloge mairie dynamique ---
  const currentHour = useCurrentHour()

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
  // ---------------------------------------------------------------
  useEffect(() => {
    if (activeModule !== 'artisans' || artisansLoaded) return
    let cancelled = false
    setArtisansLoading(true)
    ;(async () => {
      try {
        const params = new URLSearchParams()
        if (plate?.district) params.set('district', plate.district)
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
  }, [activeModule, artisansLoaded, plate?.district])

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
  // 6. Navigation entre vues
  // ---------------------------------------------------------------
  const openModule = (id: ModuleId) => {
    setActiveModule(id)
    setPhase('sub')
  }
  const backToMain = () => {
    setActiveModule(null)
    setConfirmation(null)
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
  // ---------------------------------------------------------------
  if (phase === 'welcome' && plate) {
    const welcomeText = `Bonjour, je suis Aminata, votre guide. Vous êtes à ${plate.label}${
      plate.district ? `, quartier ${plate.district}` : ''
    }. Cliquez sur les rubriques ci-dessous pour accéder aux services.`

    const handleActivateVoice = () => {
      // L'utilisateur a cliqué → le navigateur autorise maintenant le TTS
      try {
        parler(welcomeText)
      } catch { /* ignore */ }
      setPhase('main')
    }

    const handleSkipVoice = () => {
      setPhase('main')
    }

    return (
      <div className={rootClass} style={rootStyle}>
        <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center"
          style={{
            background: `linear-gradient(135deg, ${COLORS.purple} 0%, ${COLORS.blue} 100%)`,
          }}
        >
          {/* Avatar Aminata */}
          <div className="relative mb-6">
            <div
              className="flex size-24 items-center justify-center rounded-full text-5xl shadow-lg"
              style={{ backgroundColor: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(10px)' }}
            >
              🎙️
            </div>
            {/* Pulsation */}
            <div
              className="absolute inset-0 rounded-full"
              style={{
                border: '3px solid rgba(255,255,255,0.3)',
                animation: 'pulse 2s infinite',
              }}
            />
          </div>

          {/* Titre */}
          <h1
            className="mb-3 text-2xl font-bold text-white"
            style={TITLE_FONT}
          >
            Bonjour, je suis Aminata
          </h1>
          <p className="mb-2 text-sm text-white/85">
            Votre guide citoyenne pour
          </p>
          <p
            className="mb-6 text-lg font-bold text-white"
            style={TITLE_FONT}
          >
            {plate.label}
          </p>
          {plate.district && (
            <p className="mb-8 text-sm text-white/70">
              Quartier {plate.district} · Dakar
            </p>
          )}

          {/* Bouton principal — débloque la voix */}
          <button
            type="button"
            onClick={handleActivateVoice}
            className="mb-3 flex items-center gap-3 rounded-2xl bg-white px-8 py-4 text-base font-bold shadow-xl transition-all hover:scale-105 active:scale-95"
            style={{ color: COLORS.purple }}
          >
            <span className="text-2xl">🔊</span>
            <span>Activer la voix d'Aminata</span>
          </button>

          {/* Lien passer (sans voix) */}
          <button
            type="button"
            onClick={handleSkipVoice}
            className="text-sm text-white/60 underline transition hover:text-white/90"
          >
            Continuer sans la voix
          </button>

          {/* Note */}
          <p className="mt-8 max-w-xs text-xs text-white/50">
            Cliquez sur le bouton pour entendre Aminata vous accueillir. Activez le son de votre téléphone.
          </p>
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
              artisans={artisans}
              loading={artisansLoading}
              district={plate.district}
              onContact={handleContactArtisan}
            />
          )}
          {activeModule === 'mairie' && (
            <MairieView currentHour={currentHour} />
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
        </SubViewShell>
      </div>
    )
  }

  // ---------------------------------------------------------------
  // 6.5. Phase main (banner Aminata + 5 cartes module)
  // ---------------------------------------------------------------
  return (
    <div className={rootClass} style={rootStyle}>
      <MainView plate={plate} onOpenModule={openModule} onExit={onExit} />
    </div>
  )
}

// ============================================================
// MainView — banner d'accueil Aminata + 5 cartes module
// ============================================================

function MainView({
  plate,
  onOpenModule,
  onExit,
}: {
  plate: CityPlate
  onOpenModule: (id: ModuleId) => void
  onExit?: () => void
}) {
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col">
      {/* --- Banner Aminata --- */}
      <header
        className="rounded-b-3xl px-6 pb-7 pt-8 text-white shadow-lg"
        style={{
          background: `linear-gradient(135deg, ${COLORS.purple} 0%, ${COLORS.blue} 100%)`,
        }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl" aria-hidden>
              🏙️
            </span>
            <span
              className="text-xs font-bold uppercase tracking-[0.18em] text-white/80"
              style={TITLE_FONT}
            >
              Aminata · Votre quartier
            </span>
          </div>
          {onExit && (
            <button
              onClick={onExit}
              className="rounded-full bg-white/15 px-3 py-1 text-xs font-semibold text-white transition hover:bg-white/25"
            >
              Quitter
            </button>
          )}
        </div>

        <h1
          className="mt-5 text-2xl leading-tight font-bold text-white"
          style={TITLE_FONT}
        >
          Bonjour, je suis Aminata.
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-white/85">
          Je suis là pour vous aider dans votre quartier. Choisissez un module
          ci-dessous.
        </p>

        {/* Plaque info */}
        <div className="mt-5 rounded-2xl bg-white/15 px-4 py-3 backdrop-blur-sm">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <span className="text-base" aria-hidden>
              📍
            </span>
            <span style={TITLE_FONT}>Plaque {plate.plateNumber}</span>
            <span className="text-white/70">·</span>
            <span className="text-white/90">{plate.label}</span>
          </div>
          {plate.district && (
            <p className="mt-1 pl-6 text-xs text-white/70">
              {plate.district} · Dakar
            </p>
          )}
        </div>
      </header>

      {/* --- 5 cartes module --- */}
      <main className="flex-1 space-y-3 px-4 py-6">
        {MODULES.map((mod) => (
          <button
            key={mod.id}
            onClick={() => onOpenModule(mod.id)}
            className="group w-full rounded-2xl bg-white p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
            style={{
              borderLeft: `5px solid ${mod.color}`,
              // @ts-expect-error -- focus ring color via CSS var
              '--tw-ring-color': mod.color,
            }}
          >
            <div className="flex items-start gap-4">
              <span
                className="flex size-12 shrink-0 items-center justify-center rounded-xl text-2xl"
                style={{ backgroundColor: `${mod.color}18` }}
                aria-hidden
              >
                {mod.emoji}
              </span>
              <div className="flex-1">
                <h2
                  className="text-base font-bold leading-tight text-[#1A1A1A]"
                  style={TITLE_FONT}
                >
                  {mod.title}
                </h2>
                <p className="mt-1 text-sm text-[#1A1A1A]/65">{mod.desc}</p>
                <p className="mt-1 text-xs font-medium" style={{ color: mod.color }}>
                  {mod.sub}
                </p>
              </div>
              <ArrowLeft
                className="size-5 rotate-180 text-[#1A1A1A]/30 transition-transform group-hover:translate-x-1"
                aria-hidden
              />
            </div>
          </button>
        ))}
      </main>

      {/* --- Footer Aminata --- */}
      <footer className="px-4 pb-6 pt-2 text-center">
        <p
          className="text-sm font-medium text-[#1A1A1A]/50"
          style={TITLE_FONT}
        >
          ✨ Aminata — votre quartier connecté
        </p>
      </footer>
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
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col">
      {/* Header coloré par module */}
      <header
        className="rounded-b-3xl px-5 pb-5 pt-6 text-white shadow-lg"
        style={{ backgroundColor: mod.color }}
      >
        <button
          onClick={onBack}
          className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/30"
        >
          <ArrowLeft className="size-3.5" />
          Retour
        </button>
        <div className="flex items-center gap-3">
          <span className="text-3xl" aria-hidden>
            {mod.emoji}
          </span>
          <div>
            <h1
              className="text-xl leading-tight font-bold text-white"
              style={TITLE_FONT}
            >
              {mod.title}
            </h1>
            <p className="mt-0.5 text-xs text-white/80">
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
// ============================================================

function UrgenceView({
  gpsConsent,
  setGpsConsent,
  gpsLoading,
  submitting,
  onSubmit,
}: {
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
  const EMERGENCIES = [
    { emoji: '📞', label: 'POLICE', num: '17', tel: 'tel:17', color: '#E30613' },
    { emoji: '🚒', label: 'POMPIERS', num: '180', tel: 'tel:180', color: '#FF6B00' },
    { emoji: '🚑', label: 'SAMU', num: '1515', tel: 'tel:1515', color: '#0066CC' },
  ]

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

      {/* Signaler une agression (silencieux) */}
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

      {/* Pharmacie de garde */}
      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center gap-2">
          <Pill className="size-5 text-[#00A651]" />
          <h2 className="text-sm font-bold text-[#1A1A1A]" style={TITLE_FONT}>
            💊 Pharmacie de garde
          </h2>
        </div>
        <div className="rounded-xl bg-[#00A651]/5 p-3">
          <p className="text-base font-bold text-[#1A1A1A]" style={TITLE_FONT}>
            {PHARMACIE_GARDE.name}
          </p>
          <p className="mt-1 text-xs text-[#1A1A1A]/60">{PHARMACIE_GARDE.address}</p>
          <p className="mt-0.5 text-xs text-[#00A651]">{PHARMACIE_GARDE.hours}</p>
          <a
            href={`tel:${PHARMACIE_GARDE.phone}`}
            className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-[#00A651] px-4 py-2 text-xs font-bold text-white"
          >
            <Phone className="size-3.5" />
            Appeler
          </a>
        </div>
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
// 4. ArtisansView (vert) — annuaire des artisans vérifiés
// ============================================================

function ArtisansView({
  artisans,
  loading,
  district,
  onContact,
}: {
  artisans: CityArtisan[]
  loading: boolean
  district: string | null
  onContact: (a: CityArtisan) => void
}) {
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16">
        <Loader2 className="size-8 animate-spin text-[#00A651]" />
        <p className="text-sm text-[#1A1A1A]/55">
          Chargement des artisans du quartier…
        </p>
      </div>
    )
  }

  if (artisans.length === 0) {
    return (
      <div className="rounded-2xl bg-white p-8 text-center shadow-sm">
        <Wrench className="mx-auto size-10 text-[#1A1A1A]/30" />
        <p className="mt-3 text-sm font-semibold text-[#1A1A1A]" style={TITLE_FONT}>
          Aucun artisan vérifié
        </p>
        <p className="mt-1 text-xs text-[#1A1A1A]/55">
          {district
            ? `Pour le quartier « ${district} ». Essayez un autre quartier.`
            : 'Aucun artisan vérifié disponible pour le moment.'}
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold uppercase tracking-wide text-[#1A1A1A]/60">
          {artisans.length} artisan{artisans.length > 1 ? 's' : ''} vérifié
          {artisans.length > 1 ? 's' : ''}
        </h2>
        <Badge className="bg-[#00A651]/10 text-[#00A651]">
          <Check className="size-3" />
          Mairie
        </Badge>
      </div>

      {artisans.map((a) => (
        <article
          key={a.id}
          className="rounded-2xl bg-white p-4 shadow-sm"
          style={{ borderLeft: '4px solid #00A651' }}
        >
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-[#1A1A1A]" style={TITLE_FONT}>
                  {a.name}
                </h3>
                {a.premium && (
                  <Badge className="bg-[#C9A961]/15 text-[#C9A961]">
                    <Star className="size-3 fill-[#C9A961]" />
                    Premium
                  </Badge>
                )}
              </div>
              <p className="mt-0.5 text-sm text-[#1A1A1A]/65">{a.trade}</p>
              {a.district && (
                <p className="mt-0.5 text-xs text-[#1A1A1A]/45">
                  📍 {a.district}
                </p>
              )}
              <div className="mt-2 flex items-center gap-3 text-xs">
                <span className="inline-flex items-center gap-1 font-semibold text-[#C9A961]">
                  <Star className="size-3 fill-[#C9A961]" />
                  {a.rating.toFixed(1)}
                  <span className="font-normal text-[#1A1A1A]/40">
                    ({a.reviewCount})
                  </span>
                </span>
                <span className="text-[#1A1A1A]/40">
                  {a.contactCount} contacts
                </span>
              </div>
            </div>
          </div>

          <div className="mt-3 flex gap-2">
            <a
              href={`tel:${a.phone}`}
              onClick={() => onContact(a)}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#00A651] py-2.5 text-sm font-bold text-white transition hover:bg-[#008a44]"
            >
              <Phone className="size-4" />
              Appeler
            </a>
            <button
              onClick={() => onContact(a)}
              className="flex items-center justify-center gap-1.5 rounded-xl border border-[#00A651]/30 px-4 py-2.5 text-sm font-semibold text-[#00A651] transition hover:bg-[#00A651]/5"
            >
              Contacter
            </button>
          </div>
        </article>
      ))}
    </div>
  )
}

// ============================================================
// 5. MairieView (violet) — contenu dynamique selon l'heure
// ============================================================

function MairieView({ currentHour }: { currentHour: number }) {
  const greeting = getMairieGreeting(currentHour)

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

function ConfirmationView({
  confirmation,
  plateNumber,
  onBack,
}: {
  confirmation: Confirmation
  plateNumber: string
  onBack: () => void
}) {
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
// Export par défaut
// ============================================================

export default CityScanView
