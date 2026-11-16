"use client"

// ============================================================
// Flash Rewards — Cartes à gratter post-signalement
// ------------------------------------------------------------
// Composant admin SuperAdmin pour piloter les campagnes Flash
// Rewards (cartes à gratter voyageurs). 4 sous-sections internes
// via Tabs :
//
//   A. Créer une campagne     — formulaire complet de création
//   B. Codes générés          — table polling 15s, filtre campagne
//   C. Statistiques           — cartes KPI + barres CSS (7 derniers
//                               jours) par campagne
//   D. Conversion annonceurs  — table groupée par annonceur
//
// Palette aéroport : navy #003399 + gold #FCD116 (distincte du
// reste de l'app).
//
// Backend companion : /api/airport/flash-rewards/* (5+ routes).
// ============================================================

import { useCallback, useEffect, useState } from "react"
import {
  Gift,
  Plus,
  Save,
  Eye,
  RefreshCw,
  Loader2,
  Sparkles,
  Ticket,
  Users,
  BarChart3,
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  ImagePlus,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useToast } from "@/hooks/use-toast"
import { AIRPORT_ZONES } from "@/lib/airport-config"
import { formatDate } from "@/components/feedbackpro/shared"
import { cn } from "@/lib/utils"

// ---------- Palette aéroport ----------
const NAVY = "#003399"
const GOLD = "#FCD116"

// ---------- Types (mirror des réponses API) ----------

type Advertiser = {
  id: string
  companyName: string
}

type FlashRewardCampaign = {
  id: string
  advertiserId: string
  advertiserName: string | null
  title: string
  rewardType: string // percentage | fixed_amount | free_article | gift
  rewardValue: string
  description: string
  imageUrl: string | null
  eligibleZones: string[]
  triggerIncidentTypes: string[]
  maxPerDay: number
  maxTotal: number
  codeValidityHours: number
  activeFrom: string
  activeTo: string
  pricePerCodeFcfa: number
  status: string
  startDate: string
  endDate: string | null
  createdAt: string
  updatedAt: string
}

type FlashRewardCode = {
  id: string
  code: string
  campaignId: string
  campaignTitle: string | null
  status: string // unused | scratched | used | expired
  reportId: string | null
  zoneCode: string | null
  clientIp: string | null
  createdAt: string
  expiresAt: string
  scratchedAt: string | null
  usedAt: string | null
}

type CampaignStat = {
  campaign: {
    id: string
    title: string
    advertiserId: string
    advertiserName: string | null
    rewardType: string
    rewardValue: string
    pricePerCodeFcfa: number
    status: string
    startDate: string
    endDate: string | null
    createdAt: string
  }
  totalCodes: number
  codesByStatus: Record<string, number>
  totalViews: number
  totalScratches: number
  totalUsed: number
  revenueFcfa: number
  conversionRate: number
}

// ---------- Form state ----------

type RewardTypeKey = "percentage" | "fixed_amount" | "free_article" | "gift"

const REWARD_TYPE_LABELS: Record<RewardTypeKey, string> = {
  percentage: "Pourcentage (%)",
  fixed_amount: "Montant fixe (FCFA)",
  free_article: "Article offert",
  gift: "Cadeau / Lot",
}

const EMPTY_FORM = {
  advertiserId: "",
  title: "",
  rewardType: "percentage" as RewardTypeKey,
  rewardValue: "",
  description: "",
  imageUrl: "" as string | null,
  eligibleZones: [] as string[],
  triggerIncidentTypes: [] as string[],
  maxPerDay: "50",
  maxTotal: "500",
  codeValidityHours: "24",
  activeFrom: "08:00",
  activeTo: "22:00",
  pricePerCodeFcfa: "500",
  status: "active",
  endDate: "",
}

const REWARD_UNIT_LABELS: Record<RewardTypeKey, string> = {
  percentage: "%",
  fixed_amount: "FCFA",
  free_article: "article",
  gift: "lot",
}

// ---------- Composant principal ----------

export function AdminFlashRewardsTab() {
  return (
    <div className="space-y-4">
      {/* En-tête */}
      <Card className="overflow-hidden border-0 shadow-md" style={{ background: `linear-gradient(135deg, ${NAVY} 0%, ${NAVY}DD 100%)` }}>
        <CardContent className="flex items-center justify-between gap-4 p-5 text-white">
          <div className="flex items-center gap-3">
            <div
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
              style={{ backgroundColor: GOLD, color: NAVY }}
            >
              <Gift className="h-6 w-6" aria-hidden />
            </div>
            <div>
              <h2 className="text-lg font-black leading-tight">Flash Rewards</h2>
              <p className="text-xs text-white/80">Cartes à gratter post-signalement</p>
            </div>
          </div>
          <Badge
            className="border-0 font-semibold"
            style={{ backgroundColor: GOLD, color: NAVY }}
          >
            Module AdTech
          </Badge>
        </CardContent>
      </Card>

      <Tabs defaultValue="create" className="w-full">
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4">
          <TabsTrigger value="create" className="gap-1.5">
            <Plus className="h-4 w-4" aria-hidden />
            <span className="hidden sm:inline">Créer</span>
          </TabsTrigger>
          <TabsTrigger value="codes" className="gap-1.5">
            <Ticket className="h-4 w-4" aria-hidden />
            <span className="hidden sm:inline">Codes</span>
          </TabsTrigger>
          <TabsTrigger value="stats" className="gap-1.5">
            <BarChart3 className="h-4 w-4" aria-hidden />
            <span className="hidden sm:inline">Stats</span>
          </TabsTrigger>
          <TabsTrigger value="conv" className="gap-1.5">
            <Users className="h-4 w-4" aria-hidden />
            <span className="hidden sm:inline">Conversion</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="create" className="mt-4">
          <CreateCampaignSection />
        </TabsContent>
        <TabsContent value="codes" className="mt-4">
          <CodesGeneratedSection />
        </TabsContent>
        <TabsContent value="stats" className="mt-4">
          <StatsSection />
        </TabsContent>
        <TabsContent value="conv" className="mt-4">
          <ConversionAdvertiserSection />
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ============================================================
// Section A — Créer une campagne
// ============================================================

function CreateCampaignSection() {
  const { toast } = useToast()
  const [advertisers, setAdvertisers] = useState<Advertiser[]>([])
  const [loadingAdv, setLoadingAdv] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [showPreview, setShowPreview] = useState(false)

  // Charge les annonceurs existants (depuis la régie pub)
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch("/api/admin/ads/advertisers", { cache: "no-store" })
        const json = (await res.json()) as {
          ok: boolean
          data?: { advertisers: Advertiser[] }
        }
        if (!cancelled && json.ok && json.data) {
          setAdvertisers(json.data.advertisers)
        }
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setLoadingAdv(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const toggleZone = useCallback((code: string) => {
    setForm((f) => ({
      ...f,
      eligibleZones: f.eligibleZones.includes(code)
        ? f.eligibleZones.filter((z) => z !== code)
        : [...f.eligibleZones, code],
    }))
  }, [])

  const toggleIncident = useCallback((incident: string) => {
    setForm((f) => ({
      ...f,
      triggerIncidentTypes: f.triggerIncidentTypes.includes(incident)
        ? f.triggerIncidentTypes.filter((z) => z !== incident)
        : [...f.triggerIncidentTypes, incident],
    }))
  }, [])

  // Upload visuel (POST /api/public/upload, multipart "photo")
  const onImageChoisie = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const fichier = e.target.files?.[0]
      e.target.value = ""
      if (!fichier) return
      if (fichier.size > 5 * 1024 * 1024) {
        toast({ title: "Image trop volumineuse", description: "5 Mo maximum", variant: "destructive" })
        return
      }
      if (!fichier.type.startsWith("image/")) {
        toast({ title: "Format non supporté", description: "PNG, JPEG, WebP", variant: "destructive" })
        return
      }
      setUploading(true)
      try {
        const fd = new FormData()
        fd.append("photo", fichier)
        const res = await fetch("/api/public/upload", { method: "POST", body: fd })
        const json = (await res.json().catch(() => null)) as {
          ok: boolean
          data?: { url: string }
        } | null
        if (!res.ok || !json?.ok || !json.data) {
          throw new Error("Upload impossible")
        }
        setForm((f) => ({ ...f, imageUrl: json.data!.url }))
      } catch (err) {
        toast({
          title: "Échec upload",
          description: err instanceof Error ? err.message : "Erreur inconnue",
          variant: "destructive",
        })
      } finally {
        setUploading(false)
      }
    },
    [toast],
  )

  const submit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      if (!form.advertiserId) {
        toast({ title: "Annonceur requis", variant: "destructive" })
        return
      }
      if (!form.title.trim()) {
        toast({ title: "Titre requis", variant: "destructive" })
        return
      }
      if (!form.rewardValue.trim()) {
        toast({ title: "Valeur de récompense requise", variant: "destructive" })
        return
      }
      setSaving(true)
      try {
        const res = await fetch("/api/airport/flash-rewards", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            advertiserId: form.advertiserId,
            title: form.title.trim(),
            rewardType: form.rewardType,
            rewardValue: form.rewardValue.trim(),
            description: form.description.trim(),
            imageUrl: form.imageUrl,
            eligibleZones: form.eligibleZones,
            triggerIncidentTypes: form.triggerIncidentTypes,
            maxPerDay: parseInt(form.maxPerDay, 10) || 50,
            maxTotal: parseInt(form.maxTotal, 10) || 500,
            codeValidityHours: parseInt(form.codeValidityHours, 10) || 24,
            activeFrom: form.activeFrom,
            activeTo: form.activeTo,
            pricePerCodeFcfa: parseInt(form.pricePerCodeFcfa, 10) || 0,
            status: form.status,
            // endDate: si l'utilisateur choisit une date, on la met à FIN de
            // journée (23:59:59) pour éviter que la campagne expire à minuit
            // (un date input "2026-11-16" → Date("2026-11-16") = 00:00:00 = passé).
            endDate: form.endDate ? `${form.endDate}T23:59:59.999Z` : null,
          }),
        })
        const json = (await res.json()) as { ok: boolean; error?: string }
        if (!res.ok || !json.ok) {
          throw new Error(json.error || "Création impossible")
        }
        toast({
          title: "Campagne créée ✓",
          description: "La carte à gratter est active pour les voyageurs.",
        })
        setForm({ ...EMPTY_FORM })
      } catch (err) {
        toast({
          title: "Échec création",
          description: err instanceof Error ? err.message : "Erreur inconnue",
          variant: "destructive",
        })
      } finally {
        setSaving(false)
      }
    },
    [form, toast],
  )

  return (
    <Card className="border-slate-200 shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Plus className="h-5 w-5" style={{ color: NAVY }} aria-hidden />
          Créer une campagne Flash Reward
        </CardTitle>
        <CardDescription>
          Le voyageur signale un incident → une carte à gratter s&apos;affiche → il gratte et reçoit un code
          unique. L&apos;annonceur paie uniquement les codes <strong>utilisés</strong>.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-6">
          {/* Annonceur + Titre */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="fr-advertiser">Annonceur *</Label>
              {loadingAdv ? (
                <div className="flex h-10 items-center gap-2 rounded-md border border-slate-200 px-3 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Chargement…
                </div>
              ) : (
                <Select
                  value={form.advertiserId}
                  onValueChange={(v) => setForm((f) => ({ ...f, advertiserId: v }))}
                >
                  <SelectTrigger id="fr-advertiser">
                    <SelectValue placeholder="Sélectionner un annonceur" />
                  </SelectTrigger>
                  <SelectContent>
                    {advertisers.length === 0 ? (
                      <div className="px-2 py-1.5 text-xs text-slate-500">
                        Aucun annonceur. Créez-en un dans « Régie Pub ».
                      </div>
                    ) : (
                      advertisers.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.companyName}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fr-title">Titre du cadeau *</Label>
              <Input
                id="fr-title"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                maxLength={200}
                required
                placeholder="Ex: Un café offert pour tout achat de 2000 FCFA"
              />
            </div>
          </div>

          {/* Type de récompense + Valeur */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Type de récompense *</Label>
              <RadioGroup
                value={form.rewardType}
                onValueChange={(v) => setForm((f) => ({ ...f, rewardType: v as RewardTypeKey }))}
                className="grid grid-cols-2 gap-2"
              >
                {(Object.keys(REWARD_TYPE_LABELS) as RewardTypeKey[]).map((k) => (
                  <label
                    key={k}
                    className={cn(
                      "flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-xs font-medium transition-colors",
                      form.rewardType === k
                        ? "border-transparent text-white"
                        : "border-slate-200 text-slate-700 hover:bg-slate-50",
                    )}
                    style={form.rewardType === k ? { backgroundColor: NAVY } : undefined}
                  >
                    <RadioGroupItem value={k} className="sr-only" />
                    <span>{REWARD_TYPE_LABELS[k]}</span>
                  </label>
                ))}
              </RadioGroup>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fr-value">Valeur *</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="fr-value"
                  value={form.rewardValue}
                  onChange={(e) => setForm((f) => ({ ...f, rewardValue: e.target.value }))}
                  required
                  placeholder={form.rewardType === "percentage" ? "15" : "2000"}
                />
                <span
                  className="shrink-0 rounded-md px-3 py-2 text-sm font-bold"
                  style={{ backgroundColor: GOLD, color: NAVY }}
                >
                  {REWARD_UNIT_LABELS[form.rewardType]}
                </span>
              </div>
            </div>
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="fr-desc">Description (affichée sur la carte)</Label>
            <Textarea
              id="fr-desc"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              maxLength={1000}
              rows={3}
              placeholder="Ex: Valable aujourd'hui uniquement. Présentez ce code en caisse."
            />
          </div>

          {/* Visuel */}
          <div className="space-y-1.5">
            <Label>Visuel (1200×800 recommandé)</Label>
            <div className="flex flex-wrap items-center gap-3">
              <label
                htmlFor="fr-image"
                className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                {uploading ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <ImagePlus className="h-4 w-4" aria-hidden />
                )}
                {form.imageUrl ? "Changer l'image" : "Téléverser une image"}
              </label>
              <input
                id="fr-image"
                type="file"
                accept="image/*"
                onChange={onImageChoisie}
                className="sr-only"
              />
              {form.imageUrl && (
                <div className="relative h-20 w-32 overflow-hidden rounded-md border border-slate-200">
                  <img
                    src={form.imageUrl}
                    alt="Aperçu visuel"
                    className="h-full w-full object-cover"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Zones éligibles */}
          <div className="space-y-2">
            <Label>Zones éligibles (vide = toutes les zones)</Label>
            <div className="grid grid-cols-2 gap-2 rounded-md border border-slate-200 p-3 sm:grid-cols-3 md:grid-cols-4 max-h-72 overflow-y-auto">
              {AIRPORT_ZONES.map((z) => (
                <label
                  key={z.code}
                  className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-xs hover:bg-slate-50"
                >
                  <Checkbox
                    checked={form.eligibleZones.includes(z.code)}
                    onCheckedChange={() => toggleZone(z.code)}
                  />
                  <span className="truncate">
                    {z.emoji} {z.nom}
                  </span>
                </label>
              ))}
            </div>
            <p className="text-xs text-slate-500">
              {form.eligibleZones.length} zone(s) sélectionnée(s)
            </p>
          </div>

          {/* Types d'incidents déclencheurs */}
          <div className="space-y-2">
            <Label>Types d&apos;incidents déclencheurs (vide = tous)</Label>
            <div className="grid grid-cols-1 gap-2 rounded-md border border-slate-200 p-3 sm:grid-cols-2 max-h-72 overflow-y-auto">
              {/* On déduplique les incidents sur tous les zones */}
              {Array.from(
                new Set(AIRPORT_ZONES.flatMap((z) => z.problemes)),
              )
                .sort()
                .map((incident) => (
                  <label
                    key={incident}
                    className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-xs hover:bg-slate-50"
                  >
                    <Checkbox
                      checked={form.triggerIncidentTypes.includes(incident)}
                      onCheckedChange={() => toggleIncident(incident)}
                    />
                    <span className="truncate">{incident}</span>
                  </label>
                ))}
            </div>
            <p className="text-xs text-slate-500">
              {form.triggerIncidentTypes.length} type(s) sélectionné(s)
            </p>
          </div>

          {/* Limites */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="fr-maxday">Max codes / jour</Label>
              <Input
                id="fr-maxday"
                type="number"
                min={1}
                value={form.maxPerDay}
                onChange={(e) => setForm((f) => ({ ...f, maxPerDay: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fr-maxtotal">Max codes total</Label>
              <Input
                id="fr-maxtotal"
                type="number"
                min={1}
                value={form.maxTotal}
                onChange={(e) => setForm((f) => ({ ...f, maxTotal: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fr-validity">Validité code (heures)</Label>
              <Input
                id="fr-validity"
                type="number"
                min={1}
                value={form.codeValidityHours}
                onChange={(e) => setForm((f) => ({ ...f, codeValidityHours: e.target.value }))}
              />
            </div>
          </div>

          {/* Horaires + Prix + Dates */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="space-y-1.5">
              <Label htmlFor="fr-from">Heure début</Label>
              <Input
                id="fr-from"
                type="time"
                value={form.activeFrom}
                onChange={(e) => setForm((f) => ({ ...f, activeFrom: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fr-to">Heure fin</Label>
              <Input
                id="fr-to"
                type="time"
                value={form.activeTo}
                onChange={(e) => setForm((f) => ({ ...f, activeTo: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fr-price">Prix / code (FCFA)</Label>
              <Input
                id="fr-price"
                type="number"
                min={0}
                value={form.pricePerCodeFcfa}
                onChange={(e) => setForm((f) => ({ ...f, pricePerCodeFcfa: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fr-enddate">Date fin (option)</Label>
              <Input
                id="fr-enddate"
                type="date"
                value={form.endDate}
                onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap gap-2 pt-2">
            <Button
              type="submit"
              disabled={saving}
              className="gap-1.5"
              style={{ backgroundColor: NAVY }}
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Save className="h-4 w-4" aria-hidden />
              )}
              Enregistrer
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowPreview(true)}
              className="gap-1.5"
            >
              <Eye className="h-4 w-4" aria-hidden />
              Aperçu carte
            </Button>
          </div>
        </form>
      </CardContent>

      {/* Dialog aperçu carte */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5" style={{ color: GOLD }} aria-hidden />
              Aperçu de la carte
            </DialogTitle>
            <DialogDescription>
              Ce que verra le voyageur après avoir gratté.
            </DialogDescription>
          </DialogHeader>
          <div
            className="relative overflow-hidden rounded-2xl"
            style={{
              background: form.imageUrl
                ? `linear-gradient(135deg, ${NAVY}EE 0%, ${NAVY}99 100%)`
                : `linear-gradient(135deg, ${NAVY} 0%, ${NAVY}CC 100%)`,
            }}
          >
            {form.imageUrl && (
              <img
                src={form.imageUrl}
                alt=""
                className="absolute inset-0 h-full w-full object-cover opacity-60"
              />
            )}
            <div className="relative flex flex-col items-center gap-3 p-6 text-center text-white">
              <span
                className="rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider"
                style={{ backgroundColor: GOLD, color: NAVY }}
              >
                Flash Reward
              </span>
              <h3 className="text-xl font-black leading-tight">{form.title || "Titre du cadeau"}</h3>
              <div className="text-5xl font-black" style={{ color: GOLD }}>
                {form.rewardValue ? `-${form.rewardValue}` : "--"}
                <span className="ml-1 text-xl">
                  {REWARD_UNIT_LABELS[form.rewardType]}
                </span>
              </div>
              {form.description && (
                <p className="text-sm text-white/90">{form.description}</p>
              )}
              <div className="mt-2 rounded-lg bg-white/15 px-4 py-2 font-mono text-lg font-bold tracking-wider">
                FBK-XXXX-2026
              </div>
              <p className="text-xs text-white/70">
                Valable {form.codeValidityHours || "24"}h
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPreview(false)}>
              Fermer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}

// ============================================================
// Section B — Codes générés (polling 15s)
// ============================================================

const STATUS_BADGE: Record<string, { label: string; className: string; bg: string; color: string }> = {
  unused: { label: "Non gratté", className: "", bg: "#94a3b8", color: "#fff" },
  scratched: { label: "Gratté", className: "", bg: GOLD, color: NAVY },
  used: { label: "Utilisé", className: "", bg: "#10b981", color: "#fff" },
  expired: { label: "Expiré", className: "", bg: "#ef4444", color: "#fff" },
}

function CodesGeneratedSection() {
  const [codes, setCodes] = useState<FlashRewardCode[]>([])
  const [campaigns, setCampaigns] = useState<FlashRewardCampaign[]>([])
  const [filterCampaign, setFilterCampaign] = useState<string>("all")
  const [loading, setLoading] = useState(true)
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())

  const load = useCallback(async () => {
    try {
      const url =
        filterCampaign !== "all"
          ? `/api/airport/flash-rewards/codes?campaignId=${encodeURIComponent(filterCampaign)}&limit=100`
          : "/api/airport/flash-rewards/codes?limit=100"
      const [codesRes, campsRes] = await Promise.all([
        fetch(url, { cache: "no-store" }),
        fetch("/api/airport/flash-rewards", { cache: "no-store" }),
      ])
      const codesJson = (await codesRes.json()) as {
        ok: boolean
        data?: { codes: FlashRewardCode[] }
      }
      const campsJson = (await campsRes.json()) as {
        ok: boolean
        data?: { campaigns: FlashRewardCampaign[] }
      }
      if (codesJson.ok && codesJson.data) setCodes(codesJson.data.codes)
      if (campsJson.ok && campsJson.data) setCampaigns(campsJson.data.campaigns)
      setLastRefresh(new Date())
    } catch {
      /* ignore */
    } finally {
      setLoading(false)
    }
  }, [filterCampaign])

  useEffect(() => {
    void load()
    // Polling 15s
    const id = setInterval(() => void load(), 15000)
    return () => clearInterval(id)
  }, [load])

  return (
    <Card className="border-slate-200 shadow-sm">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Ticket className="h-5 w-5" style={{ color: NAVY }} aria-hidden />
              Codes générés
            </CardTitle>
            <CardDescription>
              Polling 15s · {codes.length} code(s) · Dernier refresh : {formatDate(lastRefresh)}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Select value={filterCampaign} onValueChange={setFilterCampaign}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Toutes les campagnes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes les campagnes</SelectItem>
                {campaigns.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="icon" variant="outline" onClick={() => void load()} disabled={loading}>
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} aria-hidden />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading && codes.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" aria-hidden />
          </div>
        ) : codes.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
            <Ticket className="h-10 w-10 text-slate-300" aria-hidden />
            <p className="text-sm text-slate-500">Aucun code généré pour le moment.</p>
          </div>
        ) : (
          <div className="max-h-[28rem] overflow-y-auto rounded-md border border-slate-200">
            <Table>
              <TableHeader className="sticky top-0 bg-slate-50">
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Campagne</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Zone</TableHead>
                  <TableHead>Créé</TableHead>
                  <TableHead>Expire</TableHead>
                  <TableHead>Gratté</TableHead>
                  <TableHead>Utilisé</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {codes.map((c) => {
                  const sb = STATUS_BADGE[c.status] ?? STATUS_BADGE.unused
                  return (
                    <TableRow key={c.id}>
                      <TableCell className="font-mono text-xs font-bold">{c.code}</TableCell>
                      <TableCell className="max-w-[180px] truncate text-xs">
                        {c.campaignTitle ?? "—"}
                      </TableCell>
                      <TableCell>
                        <span
                          className="inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                          style={{ backgroundColor: sb.bg, color: sb.color }}
                        >
                          {sb.label}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs">{c.zoneCode ?? "—"}</TableCell>
                      <TableCell className="text-xs">{formatDate(c.createdAt)}</TableCell>
                      <TableCell className="text-xs">{formatDate(c.expiresAt)}</TableCell>
                      <TableCell className="text-xs">
                        {c.scratchedAt ? formatDate(c.scratchedAt) : "—"}
                      </TableCell>
                      <TableCell className="text-xs">
                        {c.usedAt ? formatDate(c.usedAt) : "—"}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ============================================================
// Section C — Statistiques par campagne
// ============================================================

function StatsSection() {
  const [stats, setStats] = useState<CampaignStat[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/airport/flash-rewards/stats", { cache: "no-store" })
      const json = (await res.json()) as {
        ok: boolean
        data?: { campaigns: CampaignStat[] }
      }
      if (json.ok && json.data) setStats(json.data.campaigns)
    } catch {
      /* ignore */
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" aria-hidden />
      </div>
    )
  }

  if (stats.length === 0) {
    return (
      <Card className="border-slate-200 shadow-sm">
        <CardContent className="flex flex-col items-center justify-center gap-2 py-12 text-center">
          <BarChart3 className="h-10 w-10 text-slate-300" aria-hidden />
          <p className="text-sm text-slate-500">Aucune statistique disponible.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {/* KPIs globaux */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <GlobalStat
          label="Revenus totaux"
          value={`${stats.reduce((a, s) => a + s.revenueFcfa, 0)} FCFA`}
          icon={TrendingUp}
        />
        <GlobalStat
          label="Codes utilisés"
          value={stats.reduce((a, s) => a + s.totalUsed, 0).toString()}
          icon={CheckCircle2}
        />
        <GlobalStat
          label="Grattements"
          value={stats.reduce((a, s) => a + s.totalScratches, 0).toString()}
          icon={Sparkles}
        />
        <GlobalStat
          label="Total codes"
          value={stats.reduce((a, s) => a + s.totalCodes, 0).toString()}
          icon={Ticket}
        />
      </div>

      {/* Carte par campagne */}
      {stats.map((s) => (
        <CampaignStatCard key={s.campaign.id} stat={s} />
      ))}
    </div>
  )
}

function GlobalStat({
  label,
  value,
  icon: Icon,
}: {
  label: string
  value: string
  icon: React.ComponentType<{ className?: string }>
}) {
  return (
    <Card className="border-slate-200 shadow-sm" style={{ borderTop: `3px solid ${NAVY}` }}>
      <CardContent className="flex items-center gap-3 p-4">
        <div
          className="flex h-9 w-9 items-center justify-center rounded-lg"
          style={{ backgroundColor: `${GOLD}33`, color: NAVY }}
        >
          <Icon className="h-5 w-5" aria-hidden />
        </div>
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500">{label}</p>
          <p className="text-lg font-black text-slate-900">{value}</p>
        </div>
      </CardContent>
    </Card>
  )
}

function CampaignStatCard({ stat }: { stat: CampaignStat }) {
  // Barres CSS pour les 7 derniers jours — on synthétise à partir de
  // codesByStatus car l'API stats n'expose pas encore de série temporelle.
  // On affiche donc une répartition par statut en barres horizontales.
  const total = stat.totalCodes || 1
  const bars = [
    { label: "Non grattés", value: stat.codesByStatus.unused ?? 0, color: "#94a3b8" },
    { label: "Grattés", value: stat.codesByStatus.scratched ?? 0, color: GOLD },
    { label: "Utilisés", value: stat.codesByStatus.used ?? 0, color: "#10b981" },
    { label: "Expirés", value: stat.codesByStatus.expired ?? 0, color: "#ef4444" },
  ]
  const max = Math.max(...bars.map((b) => b.value), 1)

  return (
    <Card className="border-slate-200 shadow-sm">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">{stat.campaign.title}</CardTitle>
            <CardDescription className="text-xs">
              {stat.campaign.advertiserName ?? "Annonceur inconnu"} ·{" "}
              {stat.campaign.rewardType} ({stat.campaign.rewardValue})
            </CardDescription>
          </div>
          <Badge
            variant="outline"
            className="font-semibold"
            style={{
              color: stat.campaign.status === "active" ? "#10b981" : "#94a3b8",
            }}
          >
            {stat.campaign.status}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <Stat label="Vues" value={stat.totalViews} />
          <Stat label="Grattements" value={stat.totalScratches} />
          <Stat label="Codes utilisés" value={stat.totalUsed} />
          <Stat
            label="Conversion"
            value={`${stat.conversionRate}%`}
            hint={stat.conversionRate > 0}
          />
          <Stat
            label="Revenus"
            value={`${stat.revenueFcfa.toLocaleString("fr-FR")} F`}
          />
        </div>

        {/* Barres CSS — répartition par statut */}
        <div className="mt-4 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Répartition des codes
          </p>
          {bars.map((b) => (
            <div key={b.label} className="flex items-center gap-2">
              <span className="w-24 shrink-0 text-xs text-slate-600">{b.label}</span>
              <div className="relative h-5 flex-1 overflow-hidden rounded-md bg-slate-100">
                <div
                  className="absolute inset-y-0 left-0 rounded-md transition-all"
                  style={{
                    width: `${(b.value / max) * 100}%`,
                    backgroundColor: b.color,
                    color: b.color === GOLD ? NAVY : "#fff",
                  }}
                />
                <span
                  className="relative z-10 flex h-full items-center px-2 text-[10px] font-bold"
                  style={{ color: b.color === GOLD ? NAVY : "#fff" }}
                >
                  {b.value}
                </span>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-3 flex items-center gap-3 text-xs text-slate-500">
          <span className="flex items-center gap-1">
            <TrendingUp className="h-3 w-3" aria-hidden />
            CTR classique ads ~2-3% · Flash Rewards ~{(stat.totalScratches > 0
              ? (stat.totalUsed / stat.totalScratches) * 100
              : 0
            ).toFixed(1)}% conversion gratté → utilisé
          </span>
        </div>
      </CardContent>
    </Card>
  )
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string
  value: string | number
  hint?: boolean
}) {
  return (
    <div className="rounded-md border border-slate-200 p-2.5">
      <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">{label}</p>
      <p
        className="text-base font-black"
        style={{ color: hint ? "#10b981" : NAVY }}
      >
        {value}
      </p>
    </div>
  )
}

// ============================================================
// Section D — Conversion par annonceur
// ============================================================

type AdvertiserAgg = {
  advertiserId: string
  advertiserName: string
  campaignCount: number
  totalCodes: number
  usedCodes: number
  revenueFcfa: number
  avgConversionRate: number
}

function ConversionAdvertiserSection() {
  const [rows, setRows] = useState<AdvertiserAgg[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch("/api/airport/flash-rewards/stats", { cache: "no-store" })
        const json = (await res.json()) as {
          ok: boolean
          data?: { campaigns: CampaignStat[] }
        }
        if (!cancelled && json.ok && json.data) {
          const byAdv = new Map<string, AdvertiserAgg>()
          for (const s of json.data.campaigns) {
            const key = s.campaign.advertiserId
            const existing = byAdv.get(key) ?? {
              advertiserId: key,
              advertiserName: s.campaign.advertiserName ?? "—",
              campaignCount: 0,
              totalCodes: 0,
              usedCodes: 0,
              revenueFcfa: 0,
              avgConversionRate: 0,
            }
            existing.campaignCount++
            existing.totalCodes += s.totalCodes
            existing.usedCodes += s.totalUsed
            existing.revenueFcfa += s.revenueFcfa
            // Moyenne pondérée simple des taux de conversion
            existing.avgConversionRate =
              (existing.avgConversionRate * (existing.campaignCount - 1) +
                s.conversionRate) /
              existing.campaignCount
            byAdv.set(key, existing)
          }
          setRows(
            Array.from(byAdv.values()).sort((a, b) => b.revenueFcfa - a.revenueFcfa),
          )
        }
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <Card className="border-slate-200 shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" style={{ color: NAVY }} aria-hidden />
          Conversion par annonceur
        </CardTitle>
        <CardDescription>
          Performances agrégées par annonceur — classement par revenus décroissants.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" aria-hidden />
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
            <AlertTriangle className="h-10 w-10 text-slate-300" aria-hidden />
            <p className="text-sm text-slate-500">Aucune donnée à afficher.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-md border border-slate-200">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead>Annonceur</TableHead>
                  <TableHead className="text-center">Campagnes</TableHead>
                  <TableHead className="text-center">Codes émis</TableHead>
                  <TableHead className="text-center">Codes utilisés</TableHead>
                  <TableHead className="text-center">Conv. moy.</TableHead>
                  <TableHead className="text-right">Revenus</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.advertiserId}>
                    <TableCell className="font-medium">{r.advertiserName}</TableCell>
                    <TableCell className="text-center">{r.campaignCount}</TableCell>
                    <TableCell className="text-center">{r.totalCodes}</TableCell>
                    <TableCell className="text-center">
                      <span className="font-bold text-emerald-600">{r.usedCodes}</span>
                    </TableCell>
                    <TableCell className="text-center">
                      <span
                        className="rounded-full px-2 py-0.5 text-xs font-bold"
                        style={{
                          backgroundColor: r.avgConversionRate > 10 ? `${GOLD}33` : "#f1f5f9",
                          color: r.avgConversionRate > 10 ? NAVY : "#475569",
                        }}
                      >
                        {r.avgConversionRate.toFixed(1)}%
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-mono font-bold" style={{ color: NAVY }}>
                      {r.revenueFcfa.toLocaleString("fr-FR")} F
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
