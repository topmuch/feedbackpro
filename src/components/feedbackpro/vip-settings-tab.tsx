'use client'

// ============================================================
// VipSettingsTab — Paramètres du tenant lounge (module fondamental)
// ------------------------------------------------------------
// 8 sections : Général · Denise Discrétion · Alertes VIP ·
// Checklist Buffet · Douches · Récompenses · Notifications ·
// Intégrations + toggles des modules optionnels.
//
// Contraintes livraison :
// - Volume Denise PLAFONNÉ À 30% (slider bloqué + clamp serveur)
// - DND nocturne configuré (respecté par Denise et les alertes)
// - Application < 5s : sauvegarde PUT puis refetch immédiat
// Stockage : VipTenantConfig.config + deniseSettings (JSON-like,
// pas de migration DB à chaque option).
// ============================================================

import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react'
import {
  Settings as SettingsIcon,
  Building2,
  Volume2,
  BellRing,
  UtensilsCrossed,
  ShowerHead,
  Gift,
  Bell,
  Plug,
  Puzzle,
  Loader2,
  Save,
  Info,
  Moon,
  ShieldCheck,
  Upload,
  Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { invalidateSalonLogoCache } from '@/components/feedbackpro/nathalie-qr-plaque'

const SERIF = { fontFamily: 'Georgia, "Playfair Display", serif' } as const
const VOLUME_MAX = 30 // PLAFOND DUR — aligné avec le clamp serveur

// ------------------------------------------------------------
// Upload du logo du salon — redimensionnement client (canvas)
// → data URL PNG/JPEG compacte, stockée dans config.general.logo
// (validée par validerConfig : data:image/* ≤ 200k caractères).
// ------------------------------------------------------------
const LOGO_TAILLE_MAX_PX = 512
const LOGO_DATA_URL_MAX = 180_000 // marge sous le plafond serveur (200k)

async function redimensionnerLogo(file: File): Promise<string> {
  const dataUrlBrut = await new Promise<string>((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve(String(fr.result))
    fr.onerror = () => reject(new Error('Lecture du fichier impossible'))
    fr.readAsDataURL(file)
  })
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Image invalide'))
    image.src = dataUrlBrut
  })
  // Garde le ratio, plus grand côté = 512px
  const ratio = Math.min(1, LOGO_TAILLE_MAX_PX / Math.max(img.width || 1, img.height || 1))
  const w = Math.max(1, Math.round((img.width || LOGO_TAILLE_MAX_PX) * ratio))
  const h = Math.max(1, Math.round((img.height || LOGO_TAILLE_MAX_PX) * ratio))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas indisponible')
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, 0, 0, w, h)
  // PNG (transparence préservée) pour png/webp/svg, sinon JPEG
  const garderAlpha = /png|webp|svg/i.test(file.type)
  const quality = 0.85
  let out = garderAlpha
    ? canvas.toDataURL('image/png')
    : canvas.toDataURL('image/jpeg', quality)
  // Compression dégradée si la data URL dépasse la marge serveur
  if (out.length > LOGO_DATA_URL_MAX) out = canvas.toDataURL('image/jpeg', 0.7)
  if (out.length > LOGO_DATA_URL_MAX) out = canvas.toDataURL('image/jpeg', 0.5)
  if (out.length > LOGO_DATA_URL_MAX) {
    canvas.width = Math.round(w * 0.75)
    canvas.height = Math.round(h * 0.75)
    canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height)
    out = canvas.toDataURL('image/jpeg', 0.5)
  }
  if (out.length > LOGO_DATA_URL_MAX) throw new Error('Logo trop volumineux après compression')
  return out
}

interface LoungeConfig {
  general: { nom: string; logo: string | null; adresse: string; horaires: string; capaciteMax: number; wifiNom: string; wifiMotDePasse: string }
  alertesVip: { enabled: boolean; destinataire: string; delaiSecondes: number }
  buffet: { intervalleMinutes: number; seuilBas: number; items: string[] }
  douches: { nombre: number; tempsUtilisationMinutes: number; tempsNettoyageMinutes: number; nettoyageProfondJour: string }
  recompenses: { budgetMaxFcfa: number; validationManager: boolean; catalogue: string[] }
  notifications: {
    canaux: { push: boolean; email: boolean; sms: boolean; whatsapp: boolean }
    dndDebut: string
    dndFin: string
    destinataires: { vip: string; incident: string; lostfound: string }
  }
  integrations: {
    apiVols: { enabled: boolean; url: string; readOnly: boolean }
    importVip: { enabled: boolean; dernierImport: string | null }
  }
  modulesEnabled: {
    smartShower: boolean
    upselling: boolean
    pretExpress: boolean
    debarrassage: boolean
    briefingVocal: boolean
    lostFound: boolean
    flashRewards: boolean
  }
}

interface DeniseSettings {
  alertesVocales: boolean
  volume: number
  tonDoux: boolean
  langues: string[]
  messageBienvenue: string
  dndRespect: boolean
}

const MODULES_OPTIONNELS: { key: keyof LoungeConfig['modulesEnabled']; label: string; desc: string }[] = [
  { key: 'smartShower', label: 'Smart Shower', desc: 'File d’attente douches (Nathalie + QRStaff)' },
  { key: 'upselling', label: 'Upselling', desc: 'Offres et commandes clients (Nathalie)' },
  { key: 'pretExpress', label: 'Prêt Express', desc: 'Prêt d’objets (Nathalie + QRStaff)' },
  { key: 'debarrassage', label: 'Débarrassage', desc: 'Turnover table avec API vols (Session + QRStaff)' },
  { key: 'briefingVocal', label: 'Briefing Vocal', desc: 'Briefing Denise au take-charge (Denise + API vols)' },
  { key: 'lostFound', label: 'Lost & Found', desc: 'Objets trouvés (Session + QRStaff + Push)' },
  { key: 'flashRewards', label: 'Flash Rewards', desc: 'Récompenses premium 1 clic (Nathalie + QRStaff)' },
]

function Section({
  titre,
  icone: Icon,
  children,
}: {
  titre: string
  icone: typeof Building2
  children: React.ReactNode
}) {
  return (
    <Card className="border border-[#EAE5DC] bg-white p-5 shadow-[0_4px_20px_rgba(201,169,97,0.06)]">
      <h3 className="flex items-center gap-2 text-base font-semibold text-[#2C2C2C]" style={SERIF}>
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#C9A961]/12 text-[#8B6F47]">
          <Icon className="h-4 w-4" aria-hidden />
        </span>
        {titre}
      </h3>
      <div className="mt-4 space-y-4">{children}</div>
    </Card>
  )
}

export function VipSettingsTab() {
  const { toast } = useToast()
  const [config, setConfig] = useState<LoungeConfig | null>(null)
  const [denise, setDenise] = useState<DeniseSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [volumeFlash, setVolumeFlash] = useState(false)
  const [logoBusy, setLogoBusy] = useState(false)
  const logoFileRef = useRef<HTMLInputElement>(null)

  /** Upload du logo du salon → redimensionnement client → config.general.logo.
   *  Préviewe immédiatement ; appliqué en base au prochain « Enregistrer tout ». */
  const onLogoFile = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      e.target.value = '' // permet de re-téléverser le même fichier
      if (!file) return
      if (!file.type.startsWith('image/')) {
        toast({ title: 'Format non supporté', description: 'Choisissez une image (PNG, JPG, WebP, SVG).', variant: 'destructive' })
        return
      }
      if (file.size > 4_000_000) {
        toast({ title: 'Image trop lourde', description: 'Maximum 4 Mo.', variant: 'destructive' })
        return
      }
      setLogoBusy(true)
      try {
        const dataUrl = await redimensionnerLogo(file)
        setConfig((c) => (c ? { ...c, general: { ...c.general, logo: dataUrl } } : c))
        invalidateSalonLogoCache()
        toast({ title: 'Logo chargé', description: 'Cliquez « Enregistrer tout » pour l’appliquer au salon.' })
      } catch {
        toast({ title: 'Erreur', description: 'Impossible de traiter ce logo.', variant: 'destructive' })
      } finally {
        setLogoBusy(false)
      }
    },
    [toast],
  )

  const charger = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/vip/settings', { cache: 'no-store' })
      const json = await res.json().catch(() => null)
      if (json?.ok) {
        setConfig(json.data.config)
        setDenise(json.data.deniseSettings)
      } else {
        throw new Error(json?.error ?? 'Erreur')
      }
    } catch {
      toast({ title: 'Erreur', description: 'Impossible de charger les paramètres.', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    charger()
  }, [charger])

  const patchConfig = (section: keyof LoungeConfig, patch: object) => {
    setConfig((c) => (c ? { ...c, [section]: { ...c[section], ...patch } } : c))
  }

  const enregistrer = async () => {
    if (!config || !denise) return
    try {
      setSaving(true)
      const res = await fetch('/api/vip/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config, deniseSettings: denise }),
      })
      const json = await res.json().catch(() => null)
      if (json?.ok) {
        // Application < 5s : on prend la version serveur (clamp inclus)
        setConfig(json.data.config)
        setDenise(json.data.deniseSettings)
        toast({
          title: 'Paramètres enregistrés',
          description: 'Appliqués immédiatement à tout le salon.',
        })
      } else {
        toast({ title: 'Erreur', description: json?.error ?? 'Enregistrement impossible.', variant: 'destructive' })
      }
    } catch {
      toast({ title: 'Erreur réseau', description: 'Enregistrement impossible.', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  // Le slider ne peut PAS dépasser 30% (bloqué côté client aussi)
  const surChangementVolume = (v: number[]) => {
    const brut = v[0] ?? denise?.volume ?? 0
    if (brut > VOLUME_MAX) {
      setVolumeFlash(true)
      setTimeout(() => setVolumeFlash(false), 1600)
      setDenise((d) => (d ? { ...d, volume: VOLUME_MAX } : d))
    } else {
      setDenise((d) => (d ? { ...d, volume: brut } : d))
    }
  }

  if (loading || !config || !denise) {
    return (
      <div className="flex items-center justify-center py-16 text-[#8B6F47]">
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
        <span className="ml-2 text-sm">Chargement des paramètres…</span>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* En-tête */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-[#2C2C2C]" style={SERIF}>
            Paramètres du salon
          </h2>
          <p className="mt-1 text-sm text-[#8B6F47]">
            Toute la configuration du tenant lounge — appliquée en moins de 5 secondes.
          </p>
        </div>
        <Button
          className="gap-2 bg-gradient-to-br from-[#C9A961] to-[#8B6F47] text-white hover:opacity-90"
          onClick={enregistrer}
          disabled={saving}
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />}
          {saving ? 'Enregistrement…' : 'Enregistrer tout'}
        </Button>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* ---------- Général ---------- */}
        <Section titre="Général" icone={Building2}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="st-nom" className="text-[#8B6F47]">Nom du salon</Label>
              <Input id="st-nom" value={config.general.nom} onChange={(e) => patchConfig('general', { nom: e.target.value })} className="mt-1.5 border-[#EAE5DC] bg-[#FAFAF7]" />
            </div>
            <div>
              <Label htmlFor="st-logo-file" className="text-[#8B6F47]">Logo du salon</Label>
              <div className="mt-1.5 flex items-center gap-3">
                {config.general.logo ? (
                  <img
                    src={config.general.logo}
                    alt="Logo du salon"
                    className="h-14 w-14 shrink-0 rounded-xl border border-[#EAE5DC] bg-[#FBF7EC] object-contain p-1.5 shadow-[0_2px_10px_rgba(201,169,97,0.15)]"
                  />
                ) : (
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-dashed border-[#C9A961]/50 bg-[#FAFAF7] text-[#C9A961]" aria-hidden>
                    <Upload className="h-5 w-5" />
                  </div>
                )}
                <div className="min-w-0 flex-1 space-y-1.5">
                  <Input
                    ref={logoFileRef}
                    id="st-logo-file"
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    className="hidden"
                    onChange={onLogoFile}
                  />
                  <div className="flex flex-wrap gap-1.5">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={logoBusy}
                      className="h-8 border-[#C9A961]/40 bg-[#C9A961]/8 text-[#8B6F47] hover:bg-[#C9A961]/15"
                      onClick={() => logoFileRef.current?.click()}
                    >
                      {logoBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Upload className="h-3.5 w-3.5" aria-hidden />}
                      Téléverser
                    </Button>
                    {config.general.logo && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 text-[#C97B63] hover:bg-[#C97B63]/10"
                        onClick={() => patchConfig('general', { logo: null })}
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden /> Retirer
                      </Button>
                    )}
                  </div>
                  <Input
                    value={config.general.logo && !config.general.logo.startsWith('data:') ? config.general.logo : ''}
                    onChange={(e) => patchConfig('general', { logo: e.target.value || null })}
                    placeholder="…ou collez une URL https"
                    className="border-[#EAE5DC] bg-[#FAFAF7] text-xs"
                  />
                </div>
              </div>
              <p className="mt-1.5 text-[11px] leading-relaxed text-[#8B6F47]/70">
                PNG, JPG, WebP ou SVG — redimensionné automatiquement (512px max).
                Affiché dans le scanner et gravé au centre des plaques QR du salon.
              </p>
            </div>
          </div>
          <div>
            <Label htmlFor="st-adresse" className="text-[#8B6F47]">Adresse</Label>
            <Input id="st-adresse" value={config.general.adresse} onChange={(e) => patchConfig('general', { adresse: e.target.value })} className="mt-1.5 border-[#EAE5DC] bg-[#FAFAF7]" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="st-horaires" className="text-[#8B6F47]">Horaires d’ouverture</Label>
              <Input id="st-horaires" value={config.general.horaires} onChange={(e) => patchConfig('general', { horaires: e.target.value })} className="mt-1.5 border-[#EAE5DC] bg-[#FAFAF7]" />
            </div>
            <div>
              <Label htmlFor="st-cap" className="text-[#8B6F47]">Capacité max (personnes)</Label>
              <Input id="st-cap" type="number" min={1} value={config.general.capaciteMax} onChange={(e) => patchConfig('general', { capaciteMax: parseInt(e.target.value, 10) || 1 })} className="mt-1.5 border-[#EAE5DC] bg-[#FAFAF7]" />
            </div>
          </div>
          {/* Wi-Fi du salon — carte « Copier en 1 clic » à l'accueil Nathalie.
              Vide → la carte est masquée côté client. */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="st-wifi-nom" className="text-[#8B6F47]">Wi-Fi — nom du réseau (SSID)</Label>
              <Input id="st-wifi-nom" value={config.general.wifiNom} onChange={(e) => patchConfig('general', { wifiNom: e.target.value })} placeholder="Ex : SalonVIP-Guest" className="mt-1.5 border-[#EAE5DC] bg-[#FAFAF7]" />
            </div>
            <div>
              <Label htmlFor="st-wifi-mdp" className="text-[#8B6F47]">Wi-Fi — mot de passe</Label>
              <Input id="st-wifi-mdp" value={config.general.wifiMotDePasse} onChange={(e) => patchConfig('general', { wifiMotDePasse: e.target.value })} placeholder="Laisser vide si réseau libre" className="mt-1.5 border-[#EAE5DC] bg-[#FAFAF7]" />
            </div>
          </div>
          <p className="text-[11px] leading-relaxed text-[#8B6F47]/70">
            Le Wi-Fi s’affiche à l’accueil des clients (Écran d’entrée Nathalie) avec un bouton
            « Copier en 1 clic ». Il est AUSSI encodé dans le <span className="font-semibold">QR Wi-Fi</span>
            (onglet QR Codes) : le client scanne → connexion automatique au réseau, et le mot de passe
            est imprimé sous le QR. Laisser vide pour ne rien afficher.
          </p>
        </Section>

        {/* ---------- Denise Discrétion ---------- */}
        <Section titre="Denise Discrétion" icone={Volume2}>
          <div className="flex items-center justify-between">
            <Label className="text-[#8B6F47]">Alertes vocales</Label>
            <Switch checked={denise.alertesVocales} onCheckedChange={(v) => setDenise((d) => (d ? { ...d, alertesVocales: v } : d))} />
          </div>
          <div className={cn('rounded-xl border p-4 transition-colors', volumeFlash ? 'border-[#C97B63]/50 bg-[#C97B63]/10' : 'border-[#EAE5DC] bg-[#FAFAF7]')}>
            <div className="flex items-center justify-between">
              <Label className="text-[#8B6F47]">Volume maximum</Label>
              <span className={cn('text-sm font-bold', volumeFlash ? 'text-[#C97B63]' : 'text-[#8B6F47]')}>
                {denise.volume}%
              </span>
            </div>
            <Slider
              value={[denise.volume]}
              min={0}
              max={VOLUME_MAX}
              step={1}
              onValueChange={surChangementVolume}
              className="mt-3"
              aria-label="Volume Denise (plafonné à 30%)"
            />
            <p className="mt-2 flex items-center gap-1.5 text-[11px] text-[#8B6F47]">
              <Info className="h-3 w-3 shrink-0" aria-hidden />
              Mode discrétion : volume plafonné à {VOLUME_MAX}% — impossible de monter plus (bloqué côté client et serveur).
            </p>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-[#8B6F47]">Ton doux</Label>
              <p className="text-[11px] text-[#8B6F47]">Voix apaisée, jamais intrusive</p>
            </div>
            <Switch checked={denise.tonDoux} onCheckedChange={(v) => setDenise((d) => (d ? { ...d, tonDoux: v } : d))} />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label className="flex items-center gap-1.5 text-[#8B6F47]">
                <Moon className="h-3.5 w-3.5" aria-hidden /> Respect du DND nocturne
              </Label>
              <p className="text-[11px] text-[#8B6F47]">Denise se tait pendant les horaires DND (ci-dessous)</p>
            </div>
            <Switch checked={denise.dndRespect} onCheckedChange={(v) => setDenise((d) => (d ? { ...d, dndRespect: v } : d))} />
          </div>
          <div>
            <Label htmlFor="st-dl" className="text-[#8B6F47]">Langues (codes séparés par virgules)</Label>
            <Input
              id="st-dl"
              value={denise.langues.join(', ')}
              onChange={(e) => setDenise((d) => (d ? { ...d, langues: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) } : d))}
              placeholder="fr, en"
              className="mt-1.5 border-[#EAE5DC] bg-[#FAFAF7]"
            />
          </div>
          <div>
            <Label htmlFor="st-msg" className="text-[#8B6F47]">Message de bienvenue</Label>
            <Input id="st-msg" value={denise.messageBienvenue} onChange={(e) => setDenise((d) => (d ? { ...d, messageBienvenue: e.target.value } : d))} className="mt-1.5 border-[#EAE5DC] bg-[#FAFAF7]" />
          </div>
        </Section>

        {/* ---------- Alertes VIP ---------- */}
        <Section titre="Alertes VIP" icone={BellRing}>
          <div className="flex items-center justify-between">
            <Label className="text-[#8B6F47]">Alertes de détection VIP</Label>
            <Switch checked={config.alertesVip.enabled} onCheckedChange={(v) => patchConfig('alertesVip', { enabled: v })} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label className="text-[#8B6F47]">Destinataire</Label>
              <Select value={config.alertesVip.destinataire} onValueChange={(v) => patchConfig('alertesVip', { destinataire: v })}>
                <SelectTrigger className="mt-1.5 border-[#EAE5DC] bg-[#FAFAF7]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="maitre_dhotel">Maître d’Hôtel</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                  <SelectItem value="reception">Réception</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="st-delai" className="text-[#8B6F47]">Délai de relance (secondes)</Label>
              <Input id="st-delai" type="number" min={0} max={600} value={config.alertesVip.delaiSecondes} onChange={(e) => patchConfig('alertesVip', { delaiSecondes: parseInt(e.target.value, 10) || 0 })} className="mt-1.5 border-[#EAE5DC] bg-[#FAFAF7]" />
            </div>
          </div>
          <p className="text-[11px] text-[#8B6F47]">
            Alerte 100% visuelle (bandeau or, nom + photo) — jamais de son fort, conformément au mode discrétion.
          </p>
        </Section>

        {/* ---------- Checklist Buffet ---------- */}
        <Section titre="Checklist Buffet" icone={UtensilsCrossed}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="st-bi" className="text-[#8B6F47]">Intervalle de contrôle (min)</Label>
              <Input id="st-bi" type="number" min={5} max={180} value={config.buffet.intervalleMinutes} onChange={(e) => patchConfig('buffet', { intervalleMinutes: parseInt(e.target.value, 10) || 30 })} className="mt-1.5 border-[#EAE5DC] bg-[#FAFAF7]" />
            </div>
            <div>
              <Label htmlFor="st-bs" className="text-[#8B6F47]">Seuil bas (%)</Label>
              <Input id="st-bs" type="number" min={0} max={100} value={config.buffet.seuilBas} onChange={(e) => patchConfig('buffet', { seuilBas: parseInt(e.target.value, 10) || 0 })} className="mt-1.5 border-[#EAE5DC] bg-[#FAFAF7]" />
            </div>
          </div>
          <div>
            <Label className="text-[#8B6F47]">Items surveillés</Label>
            <div className="mt-2 flex flex-wrap gap-2">
              {['buffet_fill', 'drinks_level', 'cleanliness', 'dressing', 'vaisselle'].map((item) => {
                const checked = config.buffet.items.includes(item)
                return (
                  <label key={item} className={cn('flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-xs', checked ? 'border-[#C9A961]/50 bg-[#C9A961]/10 text-[#8B6F47]' : 'border-[#EAE5DC] bg-white text-[#8B6F47]/60')}>
                    <Checkbox checked={checked} onCheckedChange={(v) => patchConfig('buffet', { items: v ? [...config.buffet.items, item] : config.buffet.items.filter((i) => i !== item) })} className="h-3.5 w-3.5" />
                    {item}
                  </label>
                )
              })}
            </div>
          </div>
        </Section>

        {/* ---------- Douches ---------- */}
        <Section titre="Douches" icone={ShowerHead}>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <Label htmlFor="st-dn" className="text-[#8B6F47]">Nombre</Label>
              <Input id="st-dn" type="number" min={0} max={20} value={config.douches.nombre} onChange={(e) => patchConfig('douches', { nombre: parseInt(e.target.value, 10) || 0 })} className="mt-1.5 border-[#EAE5DC] bg-[#FAFAF7]" />
            </div>
            <div>
              <Label htmlFor="st-du" className="text-[#8B6F47]">Temps utilisation (min)</Label>
              <Input id="st-du" type="number" min={5} max={120} value={config.douches.tempsUtilisationMinutes} onChange={(e) => patchConfig('douches', { tempsUtilisationMinutes: parseInt(e.target.value, 10) || 30 })} className="mt-1.5 border-[#EAE5DC] bg-[#FAFAF7]" />
            </div>
            <div>
              <Label htmlFor="st-dc" className="text-[#8B6F47]">Temps nettoyage (min)</Label>
              <Input id="st-dc" type="number" min={5} max={120} value={config.douches.tempsNettoyageMinutes} onChange={(e) => patchConfig('douches', { tempsNettoyageMinutes: parseInt(e.target.value, 10) || 15 })} className="mt-1.5 border-[#EAE5DC] bg-[#FAFAF7]" />
            </div>
          </div>
          <div>
            <Label className="text-[#8B6F47]">Jour de nettoyage profond</Label>
            <Select value={config.douches.nettoyageProfondJour} onValueChange={(v) => patchConfig('douches', { nettoyageProfondJour: v })}>
              <SelectTrigger className="mt-1.5 border-[#EAE5DC] bg-[#FAFAF7]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'].map((j) => (
                  <SelectItem key={j} value={j} className="capitalize">{j}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </Section>

        {/* ---------- Récompenses ---------- */}
        <Section titre="Récompenses" icone={Gift}>
          <div>
            <Label htmlFor="st-bud" className="text-[#8B6F47]">Budget maximum (FCFA / mois)</Label>
            <Input id="st-bud" type="number" min={0} value={config.recompenses.budgetMaxFcfa} onChange={(e) => patchConfig('recompenses', { budgetMaxFcfa: parseInt(e.target.value, 10) || 0 })} className="mt-1.5 border-[#EAE5DC] bg-[#FAFAF7]" />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-[#8B6F47]">Validation manager requise</Label>
            <Switch checked={config.recompenses.validationManager} onCheckedChange={(v) => patchConfig('recompenses', { validationManager: v })} />
          </div>
          <div>
            <Label htmlFor="st-cat" className="text-[#8B6F47]">Catalogue (items séparés par virgules)</Label>
            <Input
              id="st-cat"
              value={config.recompenses.catalogue.join(', ')}
              onChange={(e) => patchConfig('recompenses', { catalogue: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
              className="mt-1.5 border-[#EAE5DC] bg-[#FAFAF7]"
            />
          </div>
        </Section>

        {/* ---------- Notifications ---------- */}
        <Section titre="Notifications" icone={Bell}>
          <div>
            <Label className="text-[#8B6F47]">Canaux actifs</Label>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {([['push', 'Push'], ['email', 'Email'], ['sms', 'SMS'], ['whatsapp', 'WhatsApp']] as const).map(([k, lbl]) => (
                <label key={k} className={cn('flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm', config.notifications.canaux[k] ? 'border-[#C9A961]/50 bg-[#C9A961]/8 text-[#2C2C2C]' : 'border-[#EAE5DC] bg-white text-[#8B6F47]/60')}>
                  <Checkbox checked={config.notifications.canaux[k]} onCheckedChange={(v) => patchConfig('notifications', { canaux: { ...config.notifications.canaux, [k]: Boolean(v) } })} />
                  {lbl}
                </label>
              ))}
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="st-dnd1" className="flex items-center gap-1 text-[#8B6F47]"><Moon className="h-3.5 w-3.5" aria-hidden /> DND début</Label>
              <Input id="st-dnd1" type="time" value={config.notifications.dndDebut} onChange={(e) => patchConfig('notifications', { dndDebut: e.target.value || '22:00' })} className="mt-1.5 border-[#EAE5DC] bg-[#FAFAF7]" />
            </div>
            <div>
              <Label htmlFor="st-dnd2" className="text-[#8B6F47]">DND fin</Label>
              <Input id="st-dnd2" type="time" value={config.notifications.dndFin} onChange={(e) => patchConfig('notifications', { dndFin: e.target.value || '07:00' })} className="mt-1.5 border-[#EAE5DC] bg-[#FAFAF7]" />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {([['vip', 'Alertes VIP'], ['incident', 'Incidents'], ['lostfound', 'Lost & Found']] as const).map(([k, lbl]) => (
              <div key={k}>
                <Label className="text-[#8B6F47]">{lbl}</Label>
                <Select value={config.notifications.destinataires[k]} onValueChange={(v) => patchConfig('notifications', { destinataires: { ...config.notifications.destinataires, [k]: v } })}>
                  <SelectTrigger className="mt-1.5 border-[#EAE5DC] bg-[#FAFAF7]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="maitre_dhotel">Maître d’Hôtel</SelectItem>
                    <SelectItem value="manager">Manager</SelectItem>
                    <SelectItem value="reception">Réception</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
        </Section>

        {/* ---------- Intégrations ---------- */}
        <Section titre="Intégrations" icone={Plug}>
          <div className="rounded-lg border border-[#EAE5DC] bg-[#FAFAF7] p-3">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-[#8B6F47]">API vols (read-only)</Label>
                <Badge variant="outline" className="ml-2 border-[#4A7C59]/30 bg-[#4A7C59]/8 text-[10px] text-[#4A7C59]">lecture seule garantie</Badge>
              </div>
              <Switch checked={config.integrations.apiVols.enabled} onCheckedChange={(v) => patchConfig('integrations', { apiVols: { ...config.integrations.apiVols, enabled: v } })} />
            </div>
            {config.integrations.apiVols.enabled && (
              <Input
                value={config.integrations.apiVols.url}
                onChange={(e) => patchConfig('integrations', { apiVols: { ...config.integrations.apiVols, url: e.target.value } })}
                placeholder="https://api.vols/…"
                className="mt-2 border-[#EAE5DC] bg-white"
              />
            )}
          </div>
          <div className="flex items-center justify-between rounded-lg border border-[#EAE5DC] bg-[#FAFAF7] p-3">
            <div>
              <Label className="text-[#8B6F47]">Import VIP partenaires</Label>
              {config.integrations.importVip.dernierImport && (
                <p className="text-[11px] text-[#8B6F47]">
                  Dernier import : {new Date(config.integrations.importVip.dernierImport).toLocaleDateString('fr-FR')}
                </p>
              )}
            </div>
            <Switch checked={config.integrations.importVip.enabled} onCheckedChange={(v) => patchConfig('integrations', { importVip: { ...config.integrations.importVip, enabled: v } })} />
          </div>
        </Section>

        {/* ---------- Modules optionnels ---------- */}
        <Section titre="Modules optionnels" icone={Puzzle}>
          <p className="-mt-1 text-[11px] text-[#8B6F47]">
            Les modules fondamentaux (QR Maître, Nathalie, Session, Dashboard, Clients VIP, Paramètres, Rapports) sont toujours actifs.
          </p>
          <div className="space-y-2.5">
            {MODULES_OPTIONNELS.map((m) => (
              <div key={m.key} className="flex items-center justify-between rounded-lg border border-[#EAE5DC] bg-[#FAFAF7] px-3 py-2.5">
                <div className="min-w-0">
                  <Label className="text-[#2C2C2C]">{m.label}</Label>
                  <p className="truncate text-[11px] text-[#8B6F47]">{m.desc}</p>
                </div>
                <Switch
                  checked={config.modulesEnabled[m.key]}
                  onCheckedChange={(v) => patchConfig('modulesEnabled', { [m.key]: v })}
                  aria-label={`Activer ${m.label}`}
                />
              </div>
            ))}
          </div>
        </Section>
      </div>

      {/* ---------- Journal d'audit ---------- */}
      <AuditTrailCard />

      {/* Bouton de sauvegarde flottant bas (mobile-friendly) */}
      <div className="sticky bottom-4 z-10 flex justify-center">
        <Button
          className="gap-2 bg-gradient-to-br from-[#C9A961] to-[#8B6F47] text-white shadow-[0_6px_20px_rgba(201,169,97,0.4)] hover:opacity-90"
          onClick={enregistrer}
          disabled={saving}
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />}
          {saving ? 'Enregistrement…' : 'Enregistrer les paramètres'}
        </Button>
      </div>
    </div>
  )
}

// ============================================================
// Journal d'audit — traçabilité des actions (checklist livraison)
// ============================================================
function AuditTrailCard() {
  const [entries, setEntries] = useState<
    { id: string; actor: string; action: string; cible: string | null; detail: string | null; createdAt: string }[]
  >([])
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    fetch('/api/vip/audit?take=20', { cache: 'no-store' })
      .then((r) => r.json())
      .then((json) => {
        if (json?.ok) setEntries(json.data ?? [])
      })
      .catch(() => {})
  }, [open])

  const ACTION_LABEL: Record<string, string> = {
    VIP_DETECTE: 'VIP détecté',
    ALERTE_PRISE: 'Alerte prise en charge',
    ALERTE_TRAITEE: 'Alerte traitée',
    PURGE_RGPD: 'Purge RGPD',
    IMPORT_CSV: 'Import CSV',
    CLIENT_CREE: 'Client créé',
    CLIENT_MODIFIE: 'Client modifié',
    NOTE_AJOUTEE: 'Note concierge',
    SETTINGS_MODIFIEES: 'Paramètres modifiés',
    RAPPORT_MENSUEL: 'Rapport mensuel',
  }

  return (
    <Card className="border border-[#EAE5DC] bg-white p-5 shadow-[0_4px_20px_rgba(201,169,97,0.06)]">
      <button
        className="flex w-full items-center justify-between"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <h3 className="flex items-center gap-2 text-base font-semibold text-[#2C2C2C]" style={SERIF}>
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#8B6F47]/12 text-[#8B6F47]">
            <ShieldCheck className="h-4 w-4" aria-hidden />
          </span>
          Journal d’audit des actions
        </h3>
        <span className="text-xs text-[#8B6F47]">{open ? 'Replier' : 'Déplier'}</span>
      </button>
      {open && (
        <div className="mt-3 max-h-72 space-y-1.5 overflow-y-auto">
          {entries.length === 0 && (
            <p className="rounded-lg border border-dashed border-[#EAE5DC] bg-[#FAFAF7] px-3 py-4 text-xs text-[#8B6F47]">
              Aucune action tracée pour l’instant.
            </p>
          )}
          {entries.map((e) => (
            <div key={e.id} className="flex items-start justify-between gap-3 rounded-lg border border-[#EAE5DC] bg-[#FAFAF7] px-3 py-2">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-[#2C2C2C]">
                  {ACTION_LABEL[e.action] ?? e.action}
                  {e.cible ? <span className="font-normal text-[#8B6F47]"> — {e.cible}</span> : null}
                </p>
                {e.detail && <p className="mt-0.5 truncate text-[11px] text-[#8B6F47]">{e.detail}</p>}
              </div>
              <div className="shrink-0 text-right">
                <p className="text-[10px] text-[#8B6F47]">
                  {new Date(e.createdAt).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </p>
                <p className="text-[10px] font-medium text-[#8B6F47]">{e.actor}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}
