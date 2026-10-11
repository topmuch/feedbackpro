"use client"

// ============================================================
// FeedbackPro - Dashboard Superadmin
// Stats globales plateforme · Gestion des commerçants
// Module commandes de supports physiques (workflow + PDF)
// ============================================================

import { useCallback, useEffect, useState } from "react"
import {
  Euro,
  Store,
  MessageSquare,
  Package,
  Printer,
  FileDown,
  Search,
  RefreshCw,
  Loader2,
  TrendingUp,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { StatCard, formatDate } from "@/components/feedbackpro/shared"
import { AppHeader } from "@/components/feedbackpro/shared"
import { useToast } from "@/hooks/use-toast"
import {
  PLANS,
  SUPPORTS,
  STATUT_COMMANDE_LABEL,
  STATUT_COMMANDE_ORDRE,
  PlanId,
  TypeSupportId,
} from "@/lib/constants"
import { generateCommandePdf } from "@/lib/pdf"

type ProLigne = {
  id: string
  nomCommerce: string
  categorie: string
  ville: string
  email: string
  plan: string
  onboardingDone: boolean
  createdAt: string
  qrToken: string
  nbRetours: number
  nbCommandes: number
  mrr: number
}

type CommandeLigne = {
  id: string
  typeSupport: string
  quantite: number
  prixEuros: number
  adresseLivraison: string
  statut: string
  createdAt: string
  pro: { id: string; nomCommerce: string; ville: string; email: string; qrToken: string }
}

type AdminOverview = {
  kpis: {
    nbPros: number
    prosParPlan: { STARTER: number; PRO: number; ENTERPRISE: number }
    mrr: number
    revenusSupports: number
    totalRetours: number
    retours30j: number
    noteMoyennePlateforme: number
    commandesCount: number
    commandesATraiter: number
    alertes30j: number
  }
  derniersPros: { id: string; nomCommerce: string; ville: string; plan: string; email: string; createdAt: string }[]
}

export function AdminDashboard() {
  const [onglet, setOnglet] = useState<"pros" | "commandes" | "globale">("pros")
  const [overview, setOverview] = useState<AdminOverview | null>(null)
  const { toast } = useToast()

  async function loadOverview() {
    try {
      const res = await fetch("/api/admin/overview", { cache: "no-store" })
      const json = await res.json()
      if (json.ok) setOverview(json.data)
    } catch {
      toast({ title: "Erreur", description: "Impossible de charger les stats globales", variant: "destructive" })
    }
  }

  // Chargement différé (hors du corps de l'effet pour éviter les cascades de rendus)
  useEffect(() => {
    const t = setTimeout(loadOverview, 0)
    return () => clearTimeout(t)
  }, [])

  const k = overview?.kpis

  return (
    <div className="min-h-screen flex flex-col">
      <AppHeader subtitle="Administration FeedbackPro" />

      {/* ---------- Onglets ---------- */}
      <nav className="sticky top-14 sm:top-16 z-30 border-b bg-background/95 backdrop-blur" aria-label="Sections admin">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="flex gap-1 overflow-x-auto no-scrollbar py-2" role="tablist">
            {(
              [
                { id: "pros", label: "Commerçants" },
                { id: "commandes", label: `Commandes${k?.commandesATraiter ? ` (${k.commandesATraiter})` : ""}` },
                { id: "globale", label: "Vue globale" },
              ] as const
            ).map((o) => (
              <button
                key={o.id}
                type="button"
                role="tab"
                aria-selected={onglet === o.id}
                onClick={() => setOnglet(o.id)}
                className={`flex shrink-0 items-center gap-1.5 rounded-lg px-4 h-9 text-sm font-medium transition-colors ${
                  onglet === o.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      </nav>

      {/* ---------- Contenu ---------- */}
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 sm:px-6 py-5 sm:py-7 space-y-6">
        {/* KPIs communs */}
        {!k ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-xl" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <StatCard icon={Euro} label="MRR abonnements" value={`${k.mrr} €`} hint={`${k.revenusSupports} € de supports vendus`} hintTone="up" />
            <StatCard icon={Store} label="Commerçants actifs" value={k.nbPros} hint={`${k.prosParPlan.PRO + k.prosParPlan.ENTERPRISE} payants`} />
            <StatCard icon={MessageSquare} label="Retours (30 jours)" value={k.retours30j} hint={`${k.totalRetours} au total`} />
            <StatCard icon={Package} label="Commandes à traiter" value={k.commandesATraiter} hint={`${k.commandesCount} commandes au total`} hintTone={k.commandesATraiter > 0 ? "down" : "up"} />
          </div>
        )}

        {onglet === "pros" && <ProsTab />}
        {onglet === "commandes" && <CommandesTab />}
        {onglet === "globale" && overview && <GlobaleTab overview={overview} />}
      </main>
    </div>
  )
}

// ============================================================
// Sous-onglet Commerçants
// ============================================================

function ProsTab() {
  const [pros, setPros] = useState<ProLigne[]>([])
  const [villes, setVilles] = useState<string[]>([])
  const [q, setQ] = useState("")
  const [fPlan, setFPlan] = useState("all")
  const [fVille, setFVille] = useState("all")
  const [loading, setLoading] = useState(true)
  const { toast } = useToast()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (fPlan !== "all") params.set("plan", fPlan)
      if (fVille !== "all") params.set("ville", fVille)
      if (q.trim()) params.set("q", q.trim())
      const res = await fetch(`/api/admin/pros?${params}`, { cache: "no-store" })
      const json = await res.json()
      if (json.ok) {
        setPros(json.data.pros)
        setVilles(json.data.villes)
      }
    } catch {
      toast({ title: "Erreur", description: "Impossible de charger les commerçants", variant: "destructive" })
    } finally {
      setLoading(false)
    }
     
  }, [fPlan, fVille, q])

  useEffect(() => {
    const t = setTimeout(load, 300)
    return () => clearTimeout(t)
  }, [load])

  async function changerPlan(proId: string, plan: string) {
    const res = await fetch("/api/admin/pros", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ proId, plan }),
    })
    const json = await res.json()
    if (json.ok) {
      setPros((prev) => prev.map((p) => (p.id === proId ? { ...p, plan, mrr: PLANS[plan as PlanId]?.price ?? 0 } : p)))
      toast({ title: "Plan mis à jour" })
    } else {
      toast({ title: "Erreur", description: json.error, variant: "destructive" })
    }
  }

  return (
    <div className="space-y-4">
      {/* Filtres */}
      <Card>
        <CardContent className="p-4 flex flex-col sm:flex-row gap-2.5">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input placeholder="Rechercher (commerce, email)…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-8 h-10" aria-label="Rechercher un commerçant" />
          </div>
          <Select value={fPlan} onValueChange={setFPlan}>
            <SelectTrigger className="h-10 sm:w-44" aria-label="Filtrer par plan">
              <SelectValue placeholder="Plan" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les plans</SelectItem>
              <SelectItem value="STARTER">Starter</SelectItem>
              <SelectItem value="PRO">Pro</SelectItem>
              <SelectItem value="ENTERPRISE">Enterprise</SelectItem>
            </SelectContent>
          </Select>
          <Select value={fVille} onValueChange={setFVille}>
            <SelectTrigger className="h-10 sm:w-44" aria-label="Filtrer par ville">
              <SelectValue placeholder="Ville" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes les villes</SelectItem>
              {villes.map((v) => (
                <SelectItem key={v} value={v}>
                  {v}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" className="h-10 w-10 shrink-0" onClick={load} aria-label="Rafraîchir">
            <RefreshCw className="h-4 w-4" aria-hidden />
          </Button>
        </CardContent>
      </Card>

      {/* Table (desktop) / cartes (mobile) */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      ) : pros.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">Aucun commerçant trouvé.</CardContent>
        </Card>
      ) : (
        <div className="space-y-2.5 max-h-[60vh] overflow-y-auto custom-scrollbar pr-0.5">
          {pros.map((p) => (
            <Card key={p.id}>
              <CardContent className="p-4 flex flex-col lg:flex-row lg:items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium truncate">{p.nomCommerce}</p>
                    <Badge variant="outline" className="text-stone-600">
                      {p.categorie}
                    </Badge>
                    {!p.onboardingDone && (
                      <Badge variant="destructive" className="text-[10px]">
                        Onboarding incomplet
                      </Badge>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground truncate">
                    {p.email} · {p.ville || "—"} · inscrit le {formatDate(p.createdAt)}
                  </p>
                </div>
                <div className="flex items-center gap-3 lg:gap-5 flex-wrap">
                  <div className="text-center">
                    <p className="text-sm font-semibold">{p.nbRetours}</p>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">retours</p>
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-semibold">{p.mrr} €</p>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">MRR</p>
                  </div>
                  <Select value={p.plan} onValueChange={(v) => changerPlan(p.id, v)}>
                    <SelectTrigger className="h-9 w-36" aria-label={`Changer le plan de ${p.nomCommerce}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="STARTER">Starter</SelectItem>
                      <SelectItem value="PRO">Pro</SelectItem>
                      <SelectItem value="ENTERPRISE">Enterprise</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

// ============================================================
// Sous-onglet Commandes (workflow d'impression)
// ============================================================

function CommandesTab() {
  const [commandes, setCommandes] = useState<CommandeLigne[]>([])
  const [stats, setStats] = useState<{ total: number; aImprimer: number; chiffreAffaires: number } | null>(null)
  const [fStatut, setFStatut] = useState("all")
  const [loading, setLoading] = useState(true)
  const [majEnCours, setMajEnCours] = useState<string | null>(null)
  const { toast } = useToast()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = fStatut !== "all" ? `?statut=${fStatut}` : ""
      const res = await fetch(`/api/admin/commandes${params}`, { cache: "no-store" })
      const json = await res.json()
      if (json.ok) {
        setCommandes(json.data.commandes)
        setStats(json.data.stats)
      }
    } catch {
      toast({ title: "Erreur", description: "Impossible de charger les commandes", variant: "destructive" })
    } finally {
      setLoading(false)
    }
     
  }, [fStatut])

  useEffect(() => {
    load()
  }, [load])

  async function changerStatut(id: string, statut: string) {
    setMajEnCours(id)
    try {
      const res = await fetch("/api/admin/commandes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, statut }),
      })
      const json = await res.json()
      if (json.ok) {
        setCommandes((prev) => prev.map((c) => (c.id === id ? { ...c, statut } : c)))
        toast({ title: `Statut : ${STATUT_COMMANDE_LABEL[statut]}` })
      } else {
        toast({ title: "Erreur", description: json.error, variant: "destructive" })
      }
    } finally {
      setMajEnCours(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Select value={fStatut} onValueChange={setFStatut}>
          <SelectTrigger className="h-10 w-44" aria-label="Filtrer par statut">
            <SelectValue placeholder="Statut" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les statuts</SelectItem>
            {STATUT_COMMANDE_ORDRE.map((s) => (
              <SelectItem key={s} value={s}>
                {STATUT_COMMANDE_LABEL[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {stats && (
          <p className="text-sm text-muted-foreground">
            {stats.total} commandes · {stats.chiffreAffaires} € de CA supports
          </p>
        )}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      ) : commandes.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">Aucune commande pour ce filtre.</CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {commandes.map((c) => {
            const idx = STATUT_COMMANDE_ORDRE.indexOf(c.statut)
            const suivant = idx < STATUT_COMMANDE_ORDRE.length - 1 ? STATUT_COMMANDE_ORDRE[idx + 1] : null
            return (
              <Card key={c.id}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium">
                        {SUPPORTS[c.typeSupport as TypeSupportId]?.emoji} {SUPPORTS[c.typeSupport as TypeSupportId]?.label}
                        <span className="ml-2 text-sm font-normal text-muted-foreground">#{c.id.slice(-8).toUpperCase()}</span>
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {c.pro.nomCommerce} ({c.pro.ville}) · {c.pro.email}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">📍 {c.adresseLivraison}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Commandé le {formatDate(c.createdAt)} · {c.prixEuros} €
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className={
                        c.statut === "LIVRE"
                          ? "text-green-700 border-green-300"
                          : c.statut === "A_IMPRIMER"
                            ? "text-rose-700 border-rose-300"
                            : "text-amber-700 border-amber-300"
                      }
                    >
                      {STATUT_COMMANDE_LABEL[c.statut]}
                    </Badge>
                  </div>

                  {/* Workflow + actions */}
                  <div className="flex flex-wrap items-center gap-2">
                    {c.statut === "A_IMPRIMER" && (
                      <Button variant="outline" size="sm" className="h-9" onClick={() => generateCommandePdf(c, c.pro)}>
                        <Printer className="mr-1.5 h-4 w-4" aria-hidden />
                        Générer PDF d&apos;impression
                      </Button>
                    )}
                    {suivant && (
                      <Button size="sm" className="h-9" onClick={() => changerStatut(c.id, suivant)} disabled={majEnCours === c.id}>
                        {majEnCours === c.id ? (
                          <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden />
                        ) : (
                          <TrendingUp className="mr-1.5 h-4 w-4" aria-hidden />
                        )}
                        Marquer « {STATUT_COMMANDE_LABEL[suivant]} »
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" className="h-9" onClick={() => generateCommandePdf(c, c.pro)}>
                      <FileDown className="mr-1.5 h-4 w-4" aria-hidden />
                      Bon PDF
                    </Button>
                    {c.statut !== "A_IMPRIMER" && fStatut === "all" && (
                      <Select value={c.statut} onValueChange={(v) => changerStatut(c.id, v)}>
                        <SelectTrigger className="h-9 w-40 text-xs" aria-label="Changer le statut">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {STATUT_COMMANDE_ORDRE.map((s) => (
                            <SelectItem key={s} value={s}>
                              {STATUT_COMMANDE_LABEL[s]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ============================================================
// Sous-onglet Vue globale
// ============================================================

function GlobaleTab({ overview }: { overview: AdminOverview }) {
  const k = overview.kpis
  const planData = [
    { plan: "Starter", count: k.prosParPlan.STARTER, fill: "#64748b" },
    { plan: "Pro", count: k.prosParPlan.PRO, fill: "#2563eb" },
    { plan: "Enterprise", count: k.prosParPlan.ENTERPRISE, fill: "#1e3a8a" },
  ]

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base sm:text-lg">Répartition par plan</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3.5 pt-2">
            {planData.map((p) => {
              const pct = k.nbPros ? Math.round((p.count / k.nbPros) * 100) : 0
              return (
                <div key={p.plan}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="font-medium">{p.plan}</span>
                    <span className="text-muted-foreground">
                      {p.count} ({pct}%)
                    </span>
                  </div>
                  <div className="h-2.5 rounded-full bg-muted overflow-hidden" role="presentation">
                    <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: p.fill }} />
                  </div>
                </div>
              )
            })}
          </div>
          <div className="mt-6 grid grid-cols-2 gap-3 text-center">
            <div className="rounded-xl bg-muted p-3">
              <p className="text-2xl font-bold">{k.mrr} €</p>
              <p className="text-xs text-muted-foreground">MRR abonnements</p>
            </div>
            <div className="rounded-xl bg-muted p-3">
              <p className="text-2xl font-bold">{k.revenusSupports} €</p>
              <p className="text-xs text-muted-foreground">CA supports physiques</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base sm:text-lg">Santé de la plateforme</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between rounded-xl border p-3.5">
            <span className="text-sm">Note moyenne plateforme</span>
            <span className="font-semibold">{k.noteMoyennePlateforme} ★</span>
          </div>
          <div className="flex items-center justify-between rounded-xl border p-3.5">
            <span className="text-sm">Retours collectés (total)</span>
            <span className="font-semibold">{k.totalRetours}</span>
          </div>
          <div className="flex items-center justify-between rounded-xl border p-3.5">
            <span className="text-sm">Alertes générées (30j)</span>
            <span className="font-semibold">{k.alertes30j}</span>
          </div>
          <div>
            <p className="mb-2 mt-4 text-sm font-medium">Derniers commerçants inscrits</p>
            <div className="space-y-2 max-h-56 overflow-y-auto custom-scrollbar">
              {overview.derniersPros.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{p.nomCommerce}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {p.ville || "—"} · {p.email}
                    </p>
                  </div>
                  <Badge variant="secondary" className="shrink-0">
                    {PLANS[p.plan as PlanId]?.name ?? p.plan}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
