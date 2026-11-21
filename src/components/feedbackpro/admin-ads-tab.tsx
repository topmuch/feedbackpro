"use client"

// ============================================================
// Task AD1 — Régie Publicitaire (AdTech platform)
// ------------------------------------------------------------
// Composant premium SuperAdmin pour piloter la régie publicitaire
// aéroport (leaderboard 916x90). 5 sous-sections internes via Tabs :
//
//   A. Tableau de bord  — KPIs (revenus, remplissage, impressions, CTR)
//   B. Campagnes        — liste + CRUD (dialog création/édition)
//   C. Annonceurs       — liste + création + suppression
//   D. Zones            — éligibles (vert) vs interdites (rouge, lock)
//   E. Statistiques     — table + barres CSS par zone
//
// Triple verrou #3 (FRONTEND) — dans le Select "Zone" du dialog de
// création/édition de campagne, les zones interdites (isAdEligible:
// false, ex: urg_sos) sont affichées en rouge barré, désactivées,
// avec un tooltip "Zone protégée — interdiction absolue".
//
// Backend companion : /api/admin/ads/* (6 routes).
// ============================================================

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  Megaphone,
  BarChart3,
  Calendar,
  MapPin,
  Ban,
  Lock,
  Plus,
  Trash2,
  Edit,
  DollarSign,
  Eye,
  MousePointerClick,
  TrendingUp,
  Loader2,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useToast } from "@/hooks/use-toast"
import { formatDate } from "@/components/feedbackpro/shared"
import { cn } from "@/lib/utils"

// ---------- Types partagés (mirror des réponses API) ----------

type Advertiser = {
  id: string
  companyName: string
  contactName: string | null
  contactPhone: string | null
  contactEmail: string | null
  billingAddress: string | null
  logoUrl: string | null
  createdAt: string
  campaignCount: number
}

type Campaign = {
  id: string
  advertiserId: string
  advertiserName: string
  title: string
  imageUrl: string | null
  landingUrl: string | null
  zoneCode: string
  priority: number
  startDate: string
  endDate: string | null
  dailyBudgetViews: number | null
  status: string
  priceMonthlyFcfa: number | null
  createdAt: string
  updatedAt: string
  impressions: number
  clicks: number
}

type ZoneSummary = {
  code: string
  nom: string
  emoji: string
  description: string | null
  isAdEligible: boolean
  impressions: number
  clicks: number
  uniqueVisitors: number
  ctr: number
  revenue: number
  fillRate: number
  activeCampaigns: number
  totalCampaigns: number
  forbiddenReason: string | null
}

// Ligne de statistique par zone renvoyée par /api/admin/ads/stats.
// Même contenu que ZoneSummary mais avec des noms de champs différents
// (zoneCode/zoneNom) côté API stats — on garde les deux types séparés
// pour coller exactement aux deux réponses API distinctes.
type ZoneStatRow = {
  zoneCode: string
  zoneNom: string
  emoji: string
  isAdEligible: boolean
  impressions: number
  clicks: number
  uniqueVisitors: number
  ctr: number
  revenue: number
  fillRate: number
  activeCampaigns: number
}

type StatsData = {
  revenueThisMonth: number
  fillRateGlobal: number
  totalImpressions: number
  totalClicks: number
  totalUniqueVisitors: number
  ctrAvg: number
  topZone: { zoneCode: string; zoneNom: string; impressions: number } | null
  zones: ZoneStatRow[]
  activeCampaignsCount: number
  totalCampaignsCount: number
  eligibleZonesCount: number
  filledZonesCount: number
}

// ---------- Helpers format ----------

function formatFcfa(n: number): string {
  return new Intl.NumberFormat("fr-FR").format(n) + " FCFA"
}

function formatPct(p: number): string {
  return (p * 100).toFixed(1) + "%"
}

function formatNumber(n: number): string {
  return new Intl.NumberFormat("fr-FR").format(n)
}

const STATUS_LABEL: Record<string, string> = {
  draft: "Brouillon",
  active: "Active",
  paused: "En pause",
  completed: "Terminée",
}

const STATUS_TONE: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  active: "bg-[#f3ddd2] text-[#8a4f3b]",
  paused: "bg-[#f3ddd2] text-[#8a4f3b]",
  completed: "bg-slate-200 text-slate-700",
}

// ============================================================
// Composant principal — AdminAdsTab
// ============================================================

export function AdminAdsTab() {
  return (
    <div className="space-y-5 max-w-7xl">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Megaphone className="h-6 w-6 text-primary" aria-hidden />
            Régie Publicitaire
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Plateforme AdTech aéroport — leaderboard 916×90. Triple verrou FeedbackPro : jamais de
            publicité sur les zones d&apos;urgence (SOS).
          </p>
        </div>
      </div>

      {/* Sous-sections internes */}
      <Tabs defaultValue="dashboard" className="w-full">
        <TabsList className="w-fit flex-wrap h-auto">
          <TabsTrigger value="dashboard" className="gap-1.5">
            <BarChart3 className="h-4 w-4" aria-hidden />
            Tableau de bord
          </TabsTrigger>
          <TabsTrigger value="campaigns" className="gap-1.5">
            <Megaphone className="h-4 w-4" aria-hidden />
            Campagnes
          </TabsTrigger>
          <TabsTrigger value="advertisers" className="gap-1.5">
            <DollarSign className="h-4 w-4" aria-hidden />
            Annonceurs
          </TabsTrigger>
          <TabsTrigger value="zones" className="gap-1.5">
            <MapPin className="h-4 w-4" aria-hidden />
            Zones
          </TabsTrigger>
          <TabsTrigger value="stats" className="gap-1.5">
            <TrendingUp className="h-4 w-4" aria-hidden />
            Statistiques
          </TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="mt-4">
          <DashboardSection />
        </TabsContent>
        <TabsContent value="campaigns" className="mt-4">
          <CampaignsSection />
        </TabsContent>
        <TabsContent value="advertisers" className="mt-4">
          <AdvertisersSection />
        </TabsContent>
        <TabsContent value="zones" className="mt-4">
          <ZonesSection />
        </TabsContent>
        <TabsContent value="stats" className="mt-4">
          <StatsSection />
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ============================================================
// Section A — Tableau de bord
// ============================================================

function DashboardSection() {
  const { toast } = useToast()
  const [stats, setStats] = useState<StatsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/ads/stats", { cache: "no-store" })
      const json = (await res.json()) as { ok: boolean; data?: StatsData; error?: string }
      if (json.ok && json.data) {
        setStats(json.data)
      } else {
        toast({ title: "Erreur", description: json.error ?? "Stats indisponibles", variant: "destructive" })
      }
    } catch {
      toast({ title: "Erreur", description: "Stats indisponibles", variant: "destructive" })
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [toast])

  useEffect(() => {
    load()
  }, [load])

  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
    )
  }

  if (!stats) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Aucune donnée disponible pour le moment.
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-5">
      {/* Barre actions */}
      <div className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setRefreshing(true)
            void load()
          }}
          disabled={refreshing}
        >
          {refreshing ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <RefreshCw className="mr-1.5 h-4 w-4" aria-hidden />
          )}
          Rafraîchir
        </Button>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icon={DollarSign}
          label="Revenus ce mois"
          value={formatFcfa(stats.revenueThisMonth)}
          hint={`${stats.activeCampaignsCount} campagne(s) active(s)`}
          tone="emerald"
        />
        <KpiCard
          icon={MapPin}
          label="Taux de remplissage global"
          value={formatPct(stats.fillRateGlobal)}
          hint={`${stats.filledZonesCount}/${stats.eligibleZonesCount} zones occupées`}
          tone="sky"
        />
        <KpiCard
          icon={Eye}
          label="Impressions totales"
          value={formatNumber(stats.totalImpressions)}
          hint={`${formatNumber(stats.totalUniqueVisitors)} visiteurs uniques`}
          tone="violet"
        />
        <KpiCard
          icon={MousePointerClick}
          label="CTR moyen"
          value={formatPct(stats.ctrAvg)}
          hint={`${formatNumber(stats.totalClicks)} clics au total`}
          tone="amber"
        />
      </div>

      {/* Top zone card + counts */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-4 w-4 text-primary" aria-hidden />
              Top zone
            </CardTitle>
            <CardDescription>Zone avec le plus d&apos;impressions sur la période</CardDescription>
          </CardHeader>
          <CardContent>
            {stats.topZone ? (
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-2xl">
                  <MapPin className="h-7 w-7 text-primary" aria-hidden />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="truncate text-lg font-semibold">{stats.topZone.zoneNom}</p>
                  <p className="text-xs text-muted-foreground">
                    Code : <code className="font-mono">{stats.topZone.zoneCode}</code> ·{" "}
                    {formatNumber(stats.topZone.impressions)} impressions
                  </p>
                </div>
                <Badge className="bg-[#f3ddd2] text-[#8a4f3b]">Top</Badge>
              </div>
            ) : (
              <div className="flex items-center gap-3 py-4 text-sm text-muted-foreground">
                <AlertTriangle className="h-5 w-5 text-[#bc7155]" aria-hidden />
                Aucune impression enregistrée pour le moment. Créez une campagne active pour
                commencer à collecter des statistiques.
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Synthèse</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <SynthesisRow label="Campagnes actives" value={formatNumber(stats.activeCampaignsCount)} />
            <SynthesisRow label="Campagnes totales" value={formatNumber(stats.totalCampaignsCount)} />
            <SynthesisRow label="Zones éligibles" value={formatNumber(stats.eligibleZonesCount)} />
            <SynthesisRow label="Zones occupées" value={formatNumber(stats.filledZonesCount)} />
            <SynthesisRow label="Visiteurs uniques" value={formatNumber(stats.totalUniqueVisitors)} />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function KpiCard({
  icon: Icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
  hint?: string
  tone: "emerald" | "sky" | "violet" | "amber"
}) {
  const toneClass = {
    emerald: "bg-[#bc7155]/10 text-[#a05f45]",
    sky: "bg-[#4b4d5e]/10 text-[#3c3e4c]",
    violet: "bg-[#bc7155]/10 text-[#a05f45]",
    amber: "bg-[#bc7155]/10 text-[#a05f45]",
  }[tone]
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {label}
            </p>
            <p className="mt-1.5 text-xl font-bold tracking-tight">{value}</p>
            {hint && <p className="mt-1 truncate text-xs text-muted-foreground">{hint}</p>}
          </div>
          <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", toneClass)}>
            <Icon className="h-5 w-5" aria-hidden />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function SynthesisRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-border/60 py-1 last:border-0 last:pb-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </div>
  )
}

// ============================================================
// Section B — Campagnes (CRUD complet)
// ============================================================

const EMPTY_CAMPAIGN_FORM: CampaignForm = {
  advertiserId: "",
  title: "",
  imageUrl: "",
  landingUrl: "",
  zoneCode: "",
  priority: 1,
  startDate: "",
  endDate: "",
  dailyBudgetViews: "",
  priceMonthlyFcfa: "",
  status: "draft",
}

type CampaignForm = {
  advertiserId: string
  title: string
  imageUrl: string
  landingUrl: string
  zoneCode: string
  priority: number
  startDate: string
  endDate: string
  dailyBudgetViews: string
  priceMonthlyFcfa: string
  status: string
}

function CampaignsSection() {
  const { toast } = useToast()
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [advertisers, setAdvertisers] = useState<Advertiser[]>([])
  const [zones, setZones] = useState<ZoneSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showDialog, setShowDialog] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<CampaignForm>(EMPTY_CAMPAIGN_FORM)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [campRes, advRes, zoneRes] = await Promise.all([
        fetch("/api/admin/ads/campaigns", { cache: "no-store" }),
        fetch("/api/admin/ads/advertisers", { cache: "no-store" }),
        fetch("/api/admin/ads/zones", { cache: "no-store" }),
      ])
      const [campJson, advJson, zoneJson] = await Promise.all([
        campRes.json() as Promise<{ ok: boolean; data?: { campaigns: Campaign[] }; error?: string }>,
        advRes.json() as Promise<{ ok: boolean; data?: { advertisers: Advertiser[] }; error?: string }>,
        zoneRes.json() as Promise<{ ok: boolean; data?: { zones: ZoneSummary[] }; error?: string }>,
      ])
      if (campJson.ok && campJson.data) setCampaigns(campJson.data.campaigns)
      if (advJson.ok && advJson.data) setAdvertisers(advJson.data.advertisers)
      if (zoneJson.ok && zoneJson.data) setZones(zoneJson.data.zones)
    } catch {
      toast({ title: "Erreur", description: "Chargement impossible", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    void load()
  }, [load])

  function openCreate() {
    setForm(EMPTY_CAMPAIGN_FORM)
    setEditingId(null)
    setShowDialog(true)
  }

  function openEdit(c: Campaign) {
    setForm({
      advertiserId: c.advertiserId,
      title: c.title,
      imageUrl: c.imageUrl ?? "",
      landingUrl: c.landingUrl ?? "",
      zoneCode: c.zoneCode,
      priority: c.priority,
      startDate: c.startDate.slice(0, 10),
      endDate: c.endDate ? c.endDate.slice(0, 10) : "",
      dailyBudgetViews: c.dailyBudgetViews != null ? String(c.dailyBudgetViews) : "",
      priceMonthlyFcfa: c.priceMonthlyFcfa != null ? String(c.priceMonthlyFcfa) : "",
      status: c.status,
    })
    setEditingId(c.id)
    setShowDialog(true)
  }

  async function submitCampaign(e: React.FormEvent) {
    e.preventDefault()
    if (saving) return
    if (!form.advertiserId) {
      toast({ title: "Annonceur requis", variant: "destructive" })
      return
    }
    if (!form.title.trim()) {
      toast({ title: "Titre requis", variant: "destructive" })
      return
    }
    if (!form.zoneCode) {
      toast({ title: "Zone cible requise", variant: "destructive" })
      return
    }
    if (!form.startDate) {
      toast({ title: "Date de début requise", variant: "destructive" })
      return
    }
    // Triple verrou #3 (frontend) — double-check local avant envoi.
    // Le backend a aussi son verrou (#2) — cette vérification est un
    // garde-fou UX pour éviter un aller-retour réseau inutile.
    const zoneCfg = zones.find((z) => z.code === form.zoneCode)
    if (zoneCfg && !zoneCfg.isAdEligible) {
      toast({
        title: "Zone interdite",
        description: `Zone ${zoneCfg.nom} protégée — interdiction absolue de publicité.`,
        variant: "destructive",
      })
      return
    }

    const payload: Record<string, unknown> = {
      advertiserId: form.advertiserId,
      title: form.title.trim(),
      imageUrl: form.imageUrl.trim() || null,
      landingUrl: form.landingUrl.trim() || null,
      zoneCode: form.zoneCode,
      priority: form.priority,
      startDate: new Date(form.startDate).toISOString(),
      endDate: form.endDate ? new Date(form.endDate).toISOString() : null,
      dailyBudgetViews: form.dailyBudgetViews ? Number(form.dailyBudgetViews) : null,
      priceMonthlyFcfa: form.priceMonthlyFcfa ? Number(form.priceMonthlyFcfa) : null,
      status: form.status,
    }

    setSaving(true)
    try {
      const isEdit = !!editingId
      const url = isEdit
        ? `/api/admin/ads/campaigns/${encodeURIComponent(editingId!)}`
        : "/api/admin/ads/campaigns"
      const method = isEdit ? "PATCH" : "POST"
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const json = (await res.json()) as { ok: boolean; error?: string }
      if (json.ok) {
        toast({
          title: isEdit ? "Campagne mise à jour ✓" : "Campagne créée ✓",
          description: isEdit ? undefined : "Triple verrou validé — zone autorisée.",
        })
        setShowDialog(false)
        setEditingId(null)
        await load()
      } else {
        // Verrou #2 (backend) peut renvoyer 403 ici
        toast({
          title: res.status === 403 ? "Zone interdite (verrou backend)" : "Erreur",
          description: json.error ?? "Opération impossible",
          variant: "destructive",
        })
      }
    } catch {
      toast({ title: "Erreur", description: "Réseau — réessayer", variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  async function confirmDelete() {
    if (!deleteId || deleting) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/admin/ads/campaigns/${encodeURIComponent(deleteId)}`, {
        method: "DELETE",
      })
      const json = (await res.json()) as { ok: boolean }
      if (json.ok) {
        toast({ title: "Campagne supprimée ✓" })
        setCampaigns((prev) => prev.filter((c) => c.id !== deleteId))
        setDeleteId(null)
      } else {
        toast({ title: "Erreur", description: "Suppression impossible", variant: "destructive" })
      }
    } catch {
      toast({ title: "Erreur", variant: "destructive" })
    } finally {
      setDeleting(false)
    }
  }

  // Group zones : éligibles d'abord (pour le Select), interdites à la fin
  const zonesForSelect = useMemo(
    () => [...zones].sort((a, b) => Number(a.isAdEligible) - Number(b.isAdEligible)),
    [zones],
  )

  return (
    <div className="space-y-4">
      {/* Barre actions */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Campagnes publicitaires</h2>
          <p className="text-xs text-muted-foreground">
            {campaigns.length} campagne(s) · {campaigns.filter((c) => c.status === "active").length}{" "}
            active(s)
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={cn("mr-1.5 h-4 w-4", loading && "animate-spin")} aria-hidden />
            Rafraîchir
          </Button>
          <Button size="sm" onClick={openCreate} disabled={advertisers.length === 0}>
            <Plus className="mr-1.5 h-4 w-4" aria-hidden />
            Nouvelle campagne
          </Button>
        </div>
      </div>

      {advertisers.length === 0 && (
        <Card className="border-[#e7c1ae] bg-[#faf1ec]">
          <CardContent className="flex items-center gap-3 py-3 text-sm text-[#6f3f30]">
            <AlertTriangle className="h-5 w-5 shrink-0" aria-hidden />
            <span>
              Aucun annonceur enregistré. Créez d&apos;abord un annonceur dans l&apos;onglet
              « Annonceurs » avant de pouvoir créer une campagne.
            </span>
          </CardContent>
        </Card>
      )}

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : campaigns.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
              <Megaphone className="h-10 w-10 text-muted-foreground/40" aria-hidden />
              <p className="text-sm text-muted-foreground">Aucune campagne pour le moment.</p>
              {advertisers.length > 0 && (
                <Button size="sm" onClick={openCreate} className="mt-2">
                  <Plus className="mr-1.5 h-4 w-4" aria-hidden />
                  Créer la première campagne
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Titre</TableHead>
                    <TableHead>Annonceur</TableHead>
                    <TableHead>Zone</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead className="text-right">Prix / mois</TableHead>
                    <TableHead>Dates</TableHead>
                    <TableHead className="text-right">Impr.</TableHead>
                    <TableHead className="text-right">CTR</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {campaigns.map((c) => {
                    const zone = zones.find((z) => z.code === c.zoneCode)
                    const ctr = c.impressions > 0 ? c.clicks / c.impressions : 0
                    return (
                      <TableRow key={c.id}>
                        <TableCell className="max-w-[220px] font-medium">
                          <div className="truncate">{c.title}</div>
                          {c.imageUrl && (
                            <div className="mt-1 h-7 w-24 overflow-hidden rounded bg-muted">
                              <img
                                src={c.imageUrl}
                                alt=""
                                className="h-full w-full object-cover"
                                loading="lazy"
                              />
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">{c.advertiserName}</TableCell>
                        <TableCell>
                          <span className="inline-flex items-center gap-1 text-sm">
                            <span aria-hidden>{zone?.emoji ?? "📍"}</span>
                            <span className="truncate">{zone?.nom ?? c.zoneCode}</span>
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge className={cn("text-xs", STATUS_TONE[c.status] ?? STATUS_TONE.draft)}>
                            {STATUS_LABEL[c.status] ?? c.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right text-sm tabular-nums">
                          {c.priceMonthlyFcfa != null ? formatFcfa(c.priceMonthlyFcfa) : "—"}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" aria-hidden />
                            <span>{formatDate(c.startDate)}</span>
                          </div>
                          {c.endDate && <div className="mt-0.5">→ {formatDate(c.endDate)}</div>}
                        </TableCell>
                        <TableCell className="text-right text-sm tabular-nums">
                          {formatNumber(c.impressions)}
                        </TableCell>
                        <TableCell className="text-right text-sm tabular-nums">
                          {formatPct(ctr)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="inline-flex gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openEdit(c)}
                              aria-label="Modifier"
                            >
                              <Edit className="h-4 w-4" aria-hidden />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setDeleteId(c.id)}
                              aria-label="Supprimer"
                              className="text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                            >
                              <Trash2 className="h-4 w-4" aria-hidden />
                            </Button>
                          </div>
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

      {/* Dialog création / édition */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Megaphone className="h-5 w-5 text-primary" aria-hidden />
              {editingId ? "Modifier la campagne" : "Nouvelle campagne"}
            </DialogTitle>
            <DialogDescription>
              Leaderboard 916×90. Les zones d&apos;urgence (SOS) sont interdites — triple verrou
              FeedbackPro.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={submitCampaign} className="space-y-4">
            {/* Ligne 1 : Annonceur + Titre */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="c-advertiser">Annonceur *</Label>
                <Select
                  value={form.advertiserId}
                  onValueChange={(v) => setForm((f) => ({ ...f, advertiserId: v }))}
                >
                  <SelectTrigger id="c-advertiser">
                    <SelectValue placeholder="Sélectionner un annonceur" />
                  </SelectTrigger>
                  <SelectContent>
                    {advertisers.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.companyName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="c-title">Titre *</Label>
                <Input
                  id="c-title"
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  maxLength={200}
                  required
                  placeholder="Ex: -20% sur le Wi-Fi Premium"
                />
              </div>
            </div>

            {/* Ligne 2 : Zone (TRIPLE VERROU #3) + Priority */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="c-zone">Zone cible *</Label>
                <Select
                  value={form.zoneCode}
                  onValueChange={(v) => {
                    // Verrou #3 — empêche de sélectionner une zone interdite
                    // (les SelectItem disabled le bloquent déjà au clic, mais
                    // on sécurise aussi ici au cas où).
                    const z = zones.find((zz) => zz.code === v)
                    if (z && !z.isAdEligible) {
                      toast({
                        title: "Zone protégée",
                        description: "Interdiction absolue — sélection impossible.",
                        variant: "destructive",
                      })
                      return
                    }
                    setForm((f) => ({ ...f, zoneCode: v }))
                  }}
                >
                  <SelectTrigger id="c-zone">
                    <SelectValue placeholder="Sélectionner une zone" />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {zonesForSelect.map((z) => {
                      const isForbidden = !z.isAdEligible
                      if (isForbidden) {
                        // TRIPLE VERROU #3 (frontend) : zone interdite affichée
                        // en rouge barré, désactivée, avec tooltip explicatif.
                        return (
                          <Tooltip key={z.code}>
                            <TooltipTrigger asChild>
                              <div
                                className="relative flex w-full cursor-not-allowed items-center gap-2 rounded-sm px-2 py-1.5 text-sm opacity-70"
                                aria-disabled="true"
                              >
                                <Lock className="h-3.5 w-3.5 text-rose-500" aria-hidden />
                                <span className="flex-1 truncate text-rose-600 line-through">
                                  {z.emoji} {z.nom}
                                </span>
                                <Ban className="h-3.5 w-3.5 text-rose-500" aria-hidden />
                              </div>
                            </TooltipTrigger>
                            <TooltipContent side="right" className="max-w-xs">
                              Zone protégée — interdiction absolue
                            </TooltipContent>
                          </Tooltip>
                        )
                      }
                      return (
                        <SelectItem key={z.code} value={z.code}>
                          <span className="inline-flex items-center gap-1.5">
                            <span aria-hidden>{z.emoji}</span>
                            <span>{z.nom}</span>
                          </span>
                        </SelectItem>
                      )
                    })}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Les zones <Lock className="inline h-3 w-3" aria-hidden /> interdites sont
                  verrouillées (sécurité publique).
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="c-priority">Priorité (1-10)</Label>
                <Select
                  value={String(form.priority)}
                  onValueChange={(v) => setForm((f) => ({ ...f, priority: Number(v) }))}
                >
                  <SelectTrigger id="c-priority">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        Priorité {n}
                        {n === 10 && " (max)"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Ligne 3 : Image URL + Landing URL */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="c-image">Image URL (916×90)</Label>
                <Input
                  id="c-image"
                  value={form.imageUrl}
                  onChange={(e) => setForm((f) => ({ ...f, imageUrl: e.target.value }))}
                  placeholder="/uploads/ad.jpg ou https://…"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="c-landing">Landing URL</Label>
                <Input
                  id="c-landing"
                  value={form.landingUrl}
                  onChange={(e) => setForm((f) => ({ ...f, landingUrl: e.target.value }))}
                  placeholder="https://annonceur.com/promo"
                />
              </div>
            </div>

            {/* Ligne 4 : Dates */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="c-start">Date de début *</Label>
                <Input
                  id="c-start"
                  type="date"
                  value={form.startDate}
                  onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="c-end">Date de fin (optionnel)</Label>
                <Input
                  id="c-end"
                  type="date"
                  value={form.endDate}
                  onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
                />
              </div>
            </div>

            {/* Ligne 5 : Budget + Prix + Statut */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="c-budget">Budget vues / jour</Label>
                <Input
                  id="c-budget"
                  type="number"
                  min={0}
                  value={form.dailyBudgetViews}
                  onChange={(e) => setForm((f) => ({ ...f, dailyBudgetViews: e.target.value }))}
                  placeholder="Ex: 5000"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="c-price">Prix mensuel (FCFA)</Label>
                <Input
                  id="c-price"
                  type="number"
                  min={0}
                  value={form.priceMonthlyFcfa}
                  onChange={(e) => setForm((f) => ({ ...f, priceMonthlyFcfa: e.target.value }))}
                  placeholder="Ex: 150000"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="c-status">Statut</Label>
                <Select
                  value={form.status}
                  onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}
                >
                  <SelectTrigger id="c-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Brouillon</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="paused">En pause</SelectItem>
                    <SelectItem value="completed">Terminée</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowDialog(false)}>
                Annuler
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden />
                ) : editingId ? (
                  <CheckCircle2 className="mr-1.5 h-4 w-4" aria-hidden />
                ) : (
                  <Plus className="mr-1.5 h-4 w-4" aria-hidden />
                )}
                {editingId ? "Enregistrer" : "Créer la campagne"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog suppression */}
      <Dialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-rose-600" aria-hidden />
              Supprimer la campagne ?
            </DialogTitle>
            <DialogDescription>
              Cette action est définitive. La campagne et toutes ses statistiques seront supprimées.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>
              Annuler
            </Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={deleting}>
              {deleting ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Trash2 className="mr-1.5 h-4 w-4" aria-hidden />
              )}
              Supprimer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ============================================================
// Section C — Annonceurs
// ============================================================

type AdvertiserForm = {
  companyName: string
  contactName: string
  contactPhone: string
  contactEmail: string
  billingAddress: string
  logoUrl: string
}

const EMPTY_ADV_FORM: AdvertiserForm = {
  companyName: "",
  contactName: "",
  contactPhone: "",
  contactEmail: "",
  billingAddress: "",
  logoUrl: "",
}

function AdvertisersSection() {
  const { toast } = useToast()
  const [advertisers, setAdvertisers] = useState<Advertiser[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showDialog, setShowDialog] = useState(false)
  const [form, setForm] = useState<AdvertiserForm>(EMPTY_ADV_FORM)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/admin/ads/advertisers", { cache: "no-store" })
      const json = (await res.json()) as {
        ok: boolean
        data?: { advertisers: Advertiser[] }
        error?: string
      }
      if (json.ok && json.data) setAdvertisers(json.data.advertisers)
    } catch {
      toast({ title: "Erreur", description: "Chargement impossible", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    void load()
  }, [load])

  async function submitAdvertiser(e: React.FormEvent) {
    e.preventDefault()
    if (saving) return
    if (!form.companyName.trim()) {
      toast({ title: "Nom de l'entreprise requis", variant: "destructive" })
      return
    }
    setSaving(true)
    try {
      const res = await fetch("/api/admin/ads/advertisers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: form.companyName.trim(),
          contactName: form.contactName.trim() || null,
          contactPhone: form.contactPhone.trim() || null,
          contactEmail: form.contactEmail.trim() || null,
          billingAddress: form.billingAddress.trim() || null,
          logoUrl: form.logoUrl.trim() || null,
        }),
      })
      const json = (await res.json()) as { ok: boolean; error?: string }
      if (json.ok) {
        toast({ title: "Annonceur créé ✓" })
        setForm(EMPTY_ADV_FORM)
        setShowDialog(false)
        await load()
      } else {
        toast({ title: "Erreur", description: json.error ?? "Création impossible", variant: "destructive" })
      }
    } catch {
      toast({ title: "Erreur", description: "Réseau — réessayer", variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  async function confirmDelete() {
    if (!deleteId || deleting) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/admin/ads/advertisers/${encodeURIComponent(deleteId)}`, {
        method: "DELETE",
      })
      const json = (await res.json()) as { ok: boolean }
      if (json.ok) {
        toast({ title: "Annonceur supprimé ✓" })
        setAdvertisers((prev) => prev.filter((a) => a.id !== deleteId))
        setDeleteId(null)
      } else {
        toast({ title: "Erreur", description: "Suppression impossible", variant: "destructive" })
      }
    } catch {
      toast({ title: "Erreur", variant: "destructive" })
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Annonceurs</h2>
          <p className="text-xs text-muted-foreground">
            {advertisers.length} annonceur(s) enregistré(s)
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={cn("mr-1.5 h-4 w-4", loading && "animate-spin")} aria-hidden />
            Rafraîchir
          </Button>
          <Button size="sm" onClick={() => { setForm(EMPTY_ADV_FORM); setShowDialog(true) }}>
            <Plus className="mr-1.5 h-4 w-4" aria-hidden />
            Nouvel annonceur
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : advertisers.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
              <DollarSign className="h-10 w-10 text-muted-foreground/40" aria-hidden />
              <p className="text-sm text-muted-foreground">Aucun annonceur enregistré.</p>
              <Button size="sm" onClick={() => { setForm(EMPTY_ADV_FORM); setShowDialog(true) }} className="mt-2">
                <Plus className="mr-1.5 h-4 w-4" aria-hidden />
                Créer le premier annonceur
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Entreprise</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Téléphone</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead className="text-right">Campagnes</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {advertisers.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          {a.logoUrl ? (
                            <img
                              src={a.logoUrl}
                              alt=""
                              className="h-7 w-7 rounded object-cover"
                              loading="lazy"
                            />
                          ) : (
                            <div className="flex h-7 w-7 items-center justify-center rounded bg-muted text-xs font-bold">
                              {a.companyName.slice(0, 2).toUpperCase()}
                            </div>
                          )}
                          <span className="truncate">{a.companyName}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{a.contactName ?? "—"}</TableCell>
                      <TableCell className="text-sm">{a.contactPhone ?? "—"}</TableCell>
                      <TableCell className="text-sm">{a.contactEmail ?? "—"}</TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        {a.campaignCount}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeleteId(a.id)}
                          aria-label="Supprimer"
                          className="text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog création annonceur */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-primary" aria-hidden />
              Nouvel annonceur
            </DialogTitle>
            <DialogDescription>Renseignez les coordonnées de l&apos;entreprise.</DialogDescription>
          </DialogHeader>
          <form onSubmit={submitAdvertiser} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="a-company">Nom de l&apos;entreprise *</Label>
              <Input
                id="a-company"
                value={form.companyName}
                onChange={(e) => setForm((f) => ({ ...f, companyName: e.target.value }))}
                required
                maxLength={200}
                placeholder="Ex: Aéro Resto SARL"
              />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="a-contact">Contact</Label>
                <Input
                  id="a-contact"
                  value={form.contactName}
                  onChange={(e) => setForm((f) => ({ ...f, contactName: e.target.value }))}
                  maxLength={120}
                  placeholder="Nom du contact"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="a-phone">Téléphone</Label>
                <Input
                  id="a-phone"
                  value={form.contactPhone}
                  onChange={(e) => setForm((f) => ({ ...f, contactPhone: e.target.value }))}
                  maxLength={40}
                  placeholder="+225 …"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="a-email">Email</Label>
              <Input
                id="a-email"
                type="email"
                value={form.contactEmail}
                onChange={(e) => setForm((f) => ({ ...f, contactEmail: e.target.value }))}
                maxLength={200}
                placeholder="contact@entreprise.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="a-addr">Adresse de facturation</Label>
              <Input
                id="a-addr"
                value={form.billingAddress}
                onChange={(e) => setForm((f) => ({ ...f, billingAddress: e.target.value }))}
                maxLength={500}
                placeholder="Rue, code postal, ville"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="a-logo">Logo URL</Label>
              <Input
                id="a-logo"
                value={form.logoUrl}
                onChange={(e) => setForm((f) => ({ ...f, logoUrl: e.target.value }))}
                maxLength={2048}
                placeholder="/uploads/logo.png ou https://…"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowDialog(false)}>
                Annuler
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Plus className="mr-1.5 h-4 w-4" aria-hidden />
                )}
                Créer l&apos;annonceur
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog suppression annonceur */}
      <Dialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-rose-600" aria-hidden />
              Supprimer l&apos;annonceur ?
            </DialogTitle>
            <DialogDescription>
              Tous les campagnes associées seront supprimées (cascade). Action définitive.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>
              Annuler
            </Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={deleting}>
              {deleting ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Trash2 className="mr-1.5 h-4 w-4" aria-hidden />
              )}
              Supprimer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ============================================================
// Section D — Zones Autorisées / Interdites
// ============================================================

function ZonesSection() {
  const { toast } = useToast()
  const [zones, setZones] = useState<ZoneSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/ads/zones", { cache: "no-store" })
      const json = (await res.json()) as {
        ok: boolean
        data?: { zones: ZoneSummary[] }
        error?: string
      }
      if (json.ok && json.data) setZones(json.data.zones)
    } catch {
      toast({ title: "Erreur", description: "Chargement impossible", variant: "destructive" })
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [toast])

  useEffect(() => {
    void load()
  }, [load])

  const eligible = zones.filter((z) => z.isAdEligible)
  const forbidden = zones.filter((z) => !z.isAdEligible)

  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Skeleton className="h-96 rounded-xl" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={() => { setRefreshing(true); void load() }}
          disabled={refreshing}
        >
          <RefreshCw className={cn("mr-1.5 h-4 w-4", refreshing && "animate-spin")} aria-hidden />
          Rafraîchir
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Colonnes gauche : Zones autorisées */}
        <Card className="border-[#e7c1ae]">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base text-[#8a4f3b]">
              <CheckCircle2 className="h-5 w-5" aria-hidden />
              Zones Autorisées
              <Badge className="bg-[#f3ddd2] text-[#8a4f3b]">{eligible.length}</Badge>
            </CardTitle>
            <CardDescription>
              Zones éligibles à la publicité — remplissage par zone
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="max-h-96 overflow-y-auto p-3">
              {eligible.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">Aucune zone éligible.</p>
              ) : (
                <ul className="space-y-1.5">
                  {eligible.map((z) => (
                    <li
                      key={z.code}
                      className="flex items-center gap-3 rounded-lg border border-[#f3ddd2] bg-[#faf1ec]/40 px-3 py-2"
                    >
                      <span className="text-xl" aria-hidden>{z.emoji}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{z.nom}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatNumber(z.impressions)} impr. · {formatPct(z.ctr)} CTR ·{" "}
                          {formatFcfa(z.revenue)}
                        </p>
                      </div>
                      <Badge
                        className={
                          z.fillRate > 0
                            ? "bg-[#bc7155] text-white"
                            : "bg-[#f3ddd2] text-[#8a4f3b]"
                        }
                      >
                        {z.fillRate > 0 ? "Occupée" : "Libre"}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Colonne droite : Zones interdites */}
        <Card className="border-rose-200">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base text-rose-700">
              <Lock className="h-5 w-5" aria-hidden />
              Zones Interdites
              <Badge className="bg-rose-100 text-rose-700">{forbidden.length}</Badge>
            </CardTitle>
            <CardDescription>
              Zones protégées — interdiction absolue de publicité (sécurité publique)
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="max-h-96 overflow-y-auto p-3">
              {forbidden.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Aucune zone interdite.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {forbidden.map((z) => (
                    <Tooltip key={z.code}>
                      <TooltipTrigger asChild>
                        <li className="flex cursor-help items-center gap-3 rounded-lg border border-rose-200 bg-rose-50/60 px-3 py-2">
                          <span className="text-xl" aria-hidden>{z.emoji}</span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-rose-700 line-through">
                              {z.nom}
                            </p>
                            <p className="text-xs text-rose-600/80">
                              Code : <code className="font-mono">{z.code}</code>
                            </p>
                          </div>
                          <Lock className="h-5 w-5 shrink-0 text-rose-500" aria-hidden />
                        </li>
                      </TooltipTrigger>
                      <TooltipContent side="left" className="max-w-xs">
                        Zone protégée — interdiction absolue de publicité (sécurité publique)
                      </TooltipContent>
                    </Tooltip>
                  ))}
                </ul>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Note pédagogique */}
      <Card className="border-[#e7c1ae] bg-[#faf1ec]">
        <CardContent className="flex items-start gap-3 py-3 text-sm text-[#6f3f30]">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
          <div>
            <p className="font-medium">Triple verrou FeedbackPro</p>
            <p className="mt-1 text-xs">
              Les zones d&apos;urgence (SOS) sont verrouillées à 3 niveaux : (1) flag{" "}
              <code className="font-mono">isAdEligible: false</code> en BDD, (2) check 403 backend
              dans <code className="font-mono">/api/admin/ads/campaigns</code> + log de tentative,
              (3) Select désactivé dans le formulaire frontend. Aucune campagne ne peut cibler ces
              zones, par sécurité publique.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ============================================================
// Section E — Statistiques par zone + barres CSS
// ============================================================

function StatsSection() {
  const { toast } = useToast()
  const [stats, setStats] = useState<StatsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/ads/stats", { cache: "no-store" })
      const json = (await res.json()) as { ok: boolean; data?: StatsData; error?: string }
      if (json.ok && json.data) setStats(json.data)
    } catch {
      toast({ title: "Erreur", description: "Stats indisponibles", variant: "destructive" })
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [toast])

  useEffect(() => {
    void load()
  }, [load])

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (!stats) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Aucune statistique disponible.
        </CardContent>
      </Card>
    )
  }

  // Zones éligibles uniquement (les interdites n'ont pas de stats de pub)
  const eligibleZones = stats.zones.filter((z) => z.isAdEligible)
  const maxImpressions = Math.max(1, ...eligibleZones.map((z) => z.impressions))

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={() => { setRefreshing(true); void load() }}
          disabled={refreshing}
        >
          <RefreshCw className={cn("mr-1.5 h-4 w-4", refreshing && "animate-spin")} aria-hidden />
          Rafraîchir
        </Button>
      </div>

      {/* Table détaillée par zone */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Statistiques par zone éligible</CardTitle>
          <CardDescription>
            Impressions, CTR, taux de remplissage et revenus par zone aéroport.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Zone</TableHead>
                  <TableHead className="text-right">Impressions</TableHead>
                  <TableHead className="text-right">Clics</TableHead>
                  <TableHead className="text-right">CTR</TableHead>
                  <TableHead className="text-right">Remplissage</TableHead>
                  <TableHead className="text-right">Revenus</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {eligibleZones.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                      Aucune zone éligible.
                    </TableCell>
                  </TableRow>
                ) : (
                  eligibleZones.map((z) => (
                    <TableRow key={z.zoneCode}>
                      <TableCell>
                        <span className="inline-flex items-center gap-1.5 text-sm">
                          <span aria-hidden>{z.emoji}</span>
                          <span className="truncate">{z.zoneNom}</span>
                        </span>
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        {formatNumber(z.impressions)}
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        {formatNumber(z.clicks)}
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        {formatPct(z.ctr)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge
                          className={
                            z.fillRate > 0
                              ? "bg-[#f3ddd2] text-[#8a4f3b]"
                              : "bg-muted text-muted-foreground"
                          }
                        >
                          {z.fillRate > 0 ? "Occupée" : "Libre"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        {formatFcfa(z.revenue)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Barres CSS — impressions par zone */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <BarChart3 className="h-4 w-4 text-primary" aria-hidden />
            Impressions par zone
          </CardTitle>
          <CardDescription>Top zones par volume d&apos;impressions</CardDescription>
        </CardHeader>
        <CardContent>
          {eligibleZones.filter((z) => z.impressions > 0).length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Aucune impression enregistrée pour le moment.
            </p>
          ) : (
            <ul className="space-y-2">
              {eligibleZones
                .filter((z) => z.impressions > 0)
                .slice(0, 12)
                .map((z) => {
                  const widthPct = (z.impressions / maxImpressions) * 100
                  return (
                    <li key={z.zoneCode} className="flex items-center gap-3">
                      <span className="w-44 shrink-0 truncate text-xs" title={z.zoneNom}>
                        <span aria-hidden>{z.emoji}</span> {z.zoneNom}
                      </span>
                      <div className="relative h-6 flex-1 overflow-hidden rounded-md bg-muted">
                        <div
                          className="absolute inset-y-0 left-0 rounded-md bg-primary/80 transition-all"
                          style={{ width: `${widthPct}%` }}
                          aria-hidden
                        />
                        <span className="absolute inset-y-0 left-2 flex items-center text-[11px] font-medium tabular-nums text-primary-foreground/90 mix-blend-difference">
                          {formatNumber(z.impressions)}
                        </span>
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
