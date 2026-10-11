"use client"

// ============================================================
// FeedbackPro - Dashboard Superadmin (Session 5)
// Onglets : Vue d'ensemble · Commerçants · Commandes · Revenus · Paramètres
// URLs synchronisées : /superadmin/<slug> (rewritées vers /?admin=1&tabAdmin=…)
// ============================================================

import { useCallback, useEffect, useState } from "react"
import QRCode from "qrcode"
import {
  LayoutDashboard,
  Store,
  Package,
  Wallet,
  Settings,
  Euro,
  MessageSquare,
  Search,
  RefreshCw,
  Loader2,
  Eye,
  Ban,
  RotateCcw,
  Trash2,
  Mail,
  Truck,
  Printer,
  TrendingUp,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
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
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  AreaChart,
  Area,
  CartesianGrid,
} from "recharts"

// ---------- Onglets & synchronisation d'URL ----------

type OngletAdmin = "globale" | "pros" | "commandes" | "revenus" | "parametres"

const ONGLETS: { id: OngletAdmin; label: string; icone: React.ComponentType<{ className?: string }> }[] = [
  { id: "globale", label: "Vue d'ensemble", icone: LayoutDashboard },
  { id: "pros", label: "Commerçants", icone: Store },
  { id: "commandes", label: "Commandes", icone: Package },
  { id: "revenus", label: "Revenus", icone: Wallet },
  { id: "parametres", label: "Paramètres", icone: Settings },
]

const EST_ONGLET = (v: string): v is OngletAdmin => ONGLETS.some((o) => o.id === v)

/**
 * Résout l'onglet actif depuis l'URL :
 *  - /superadmin/<slug> (rewrite serveur → ?admin=1&tabAdmin=<slug>)
 *  - /?tabAdmin=<slug> (forme brute)
 * Défaut : Vue d'ensemble.
 */
function ongletDepuisUrl(): OngletAdmin {
  try {
    const params = new URLSearchParams(window.location.search)
    const t = params.get("tabAdmin")
    if (t && EST_ONGLET(t)) return t
    const m = window.location.pathname.match(/^\/superadmin\/([a-z-]+)\/?$/)
    if (m && EST_ONGLET(m[1])) return m[1]
  } catch {
    /* ignore */
  }
  return "globale"
}

// ---------- Types ----------

type ProLigne = {
  id: string
  nomCommerce: string
  categorie: string
  ville: string
  email: string
  plan: string
  suspendu: boolean
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
  numeroSuivi: string | null
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
  /** Session 5 : croissance du nombre de Pros (nouveaux/jour, 30 derniers jours) */
  croissancePros: { jour: string; nouveaux: number }[]
  /** Session 5 : Top 10 des Pros par nombre de retours */
  topPros: { nomCommerce: string; boutique: string; retours: number }[]
}

type RevenusData = {
  caAbonnementsMensuel: number
  caSupportsTotal: number
  caSupportsParType: Record<TypeSupportId, number>
  evolutionMensuelle: { mois: string; abonnements: number; supports: number }[]
}

type SettingsForm = {
  nomPlateforme: string
  urlPublique: string
  emailSupport: string
  seuilAlerte: string
}

// Couleurs des graphiques (palette émeraude / ambre / rose — pas de bleu ajouté)
const COULEURS_SUPPORTS = ["#10b981", "#f59e0b", "#f43f5e"]

// ============================================================
// Composant racine
// ============================================================

export function AdminDashboard() {
  const [onglet, setOnglet] = useState<OngletAdmin>(() => ongletDepuisUrl())
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

  // Bouton retour navigateur : resynchronise l'onglet actif
  useEffect(() => {
    function onPop() {
      setOnglet(ongletDepuisUrl())
    }
    window.addEventListener("popstate", onPop)
    return () => window.removeEventListener("popstate", onPop)
  }, [])

  /** Change d'onglet et pousse l'URL /superadmin/<slug> dans l'historique */
  function naviguer(o: OngletAdmin) {
    setOnglet(o)
    try {
      window.history.pushState({}, "", `/superadmin/${o}`)
    } catch {
      /* ignore */
    }
  }

  const k = overview?.kpis

  return (
    <div className="min-h-screen flex flex-col">
      <AppHeader subtitle="Administration FeedbackPro" />

      {/* ---------- Onglets ---------- */}
      <nav className="sticky top-14 sm:top-16 z-30 border-b bg-background/95 backdrop-blur" aria-label="Sections admin">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="flex gap-1 overflow-x-auto no-scrollbar py-2" role="tablist">
            {ONGLETS.map((o) => {
              const Icone = o.icone
              const badge =
                o.id === "commandes" && k?.commandesATraiter ? ` (${k.commandesATraiter})` : ""
              return (
                <button
                  key={o.id}
                  type="button"
                  role="tab"
                  aria-selected={onglet === o.id}
                  onClick={() => naviguer(o.id)}
                  className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3.5 h-9 text-sm font-medium transition-colors ${
                    onglet === o.id
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  <Icone className="h-4 w-4" aria-hidden />
                  {o.label}
                  {badge}
                </button>
              )
            })}
          </div>
        </div>
      </nav>

      {/* ---------- Contenu ---------- */}
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 sm:px-6 py-5 sm:py-7 space-y-6">
        {onglet === "globale" && <GlobaleTab overview={overview} />}
        {onglet === "pros" && <ProsTab onModifie={loadOverview} />}
        {onglet === "commandes" && <CommandesTab onModifie={loadOverview} />}
        {onglet === "revenus" && <RevenusTab />}
        {onglet === "parametres" && <ParametresTab />}
      </main>
    </div>
  )
}

// ============================================================
// Sous-onglet Vue d'ensemble (KPIs + santé plateforme)
// ============================================================

function GlobaleTab({ overview }: { overview: AdminOverview | null }) {
  if (!overview) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-72 rounded-xl" />
      </div>
    )
  }

  const k = overview.kpis
  return (
    <div className="space-y-6">
      {/* KPIs plateforme */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard icon={Euro} label="MRR abonnements" value={`${k.mrr} €`} hint={`${k.revenusSupports} € de supports vendus`} hintTone="up" />
        <StatCard icon={Store} label="Commerçants actifs" value={k.nbPros} hint={`${k.prosParPlan.PRO + k.prosParPlan.ENTERPRISE} payants`} />
        <StatCard icon={MessageSquare} label="Retours (30 jours)" value={k.retours30j} hint={`${k.totalRetours} au total`} />
        <StatCard
          icon={Package}
          label="Commandes à traiter"
          value={k.commandesATraiter}
          hint={`${k.commandesCount} commandes au total`}
          hintTone={k.commandesATraiter > 0 ? "down" : "up"}
        />
      </div>
      <VueGlobaleContenu overview={overview} />
    </div>
  )
}

function VueGlobaleContenu({ overview }: { overview: AdminOverview }) {
  const k = overview.kpis
  const planData = [
    { plan: "Starter", count: k.prosParPlan.STARTER, fill: "#64748b" },
    { plan: "Pro", count: k.prosParPlan.PRO, fill: "#10b981" },
    { plan: "Enterprise", count: k.prosParPlan.ENTERPRISE, fill: "#065f46" },
  ]

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* ---------- Session 5 : croissance du nombre de Pros (30 derniers jours) ---------- */}
      <Card className="lg:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-base sm:text-lg">Croissance du nombre de Pros (30 derniers jours)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={overview.croissancePros} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
                <defs>
                  <linearGradient id="gradPros" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2563EB" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#2563EB" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e7e5e4" />
                <XAxis dataKey="jour" tick={{ fontSize: 10 }} interval={4} stroke="#78716c" />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="#78716c" />
                <Tooltip
                  formatter={(v) => [`${v} nouveau(x)`, "Pros inscrits"]}
                  labelStyle={{ color: "#1c1917", fontWeight: 600 }}
                  contentStyle={{ borderRadius: 12, border: "1px solid #e7e5e4", fontSize: 13 }}
                />
                <Area type="monotone" dataKey="nouveaux" stroke="#2563EB" strokeWidth={2.5} fill="url(#gradPros)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* ---------- Session 5 : Top 10 des Pros par nombre de retours ---------- */}
      <Card className="lg:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-base sm:text-lg">Top 10 des Pros par nombre de retours</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={overview.topPros} layout="vertical" margin={{ top: 4, right: 24, bottom: 0, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e7e5e4" />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} stroke="#78716c" />
                <YAxis type="category" dataKey="nomCommerce" width={150} tick={{ fontSize: 11 }} stroke="#78716c" />
                <Tooltip
                  formatter={(v) => [`${v} retours`, "Total"]}
                  labelStyle={{ color: "#1c1917", fontWeight: 600 }}
                  contentStyle={{ borderRadius: 12, border: "1px solid #e7e5e4", fontSize: 13 }}
                />
                <Bar dataKey="retours" fill="#2563EB" radius={[0, 6, 6, 0]} barSize={18} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

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

// ============================================================
// Sous-onglet Commerçants
// ============================================================

type ActionPros = "suspendre" | "reactiver" | "supprimer"

const CONFIRM_META: Record<
  ActionPros,
  { titre: string; description: (p: ProLigne) => string; bouton: string; classe: string }
> = {
  suspendre: {
    titre: "Suspendre ce commerçant ?",
    description: (p) =>
      `« ${p.nomCommerce} » perdra immédiatement l'accès à son dashboard et à ses API jusqu'à réactivation. Ses données sont conservées.`,
    bouton: "Suspendre le compte",
    classe: "bg-amber-600 hover:bg-amber-700 text-white",
  },
  reactiver: {
    titre: "Réactiver ce commerçant ?",
    description: (p) => `« ${p.nomCommerce} » retrouvera immédiatement l'accès à son dashboard et à ses données.`,
    bouton: "Réactiver le compte",
    classe: "",
  },
  supprimer: {
    titre: "Supprimer définitivement ce commerçant ?",
    description: (p) =>
      `Cette action est irréversible : le compte, la boutique, les ${p.nbRetours} retour(s), les commandes et les QR codes de « ${p.nomCommerce} » seront supprimés définitivement.`,
    bouton: "Supprimer définitivement",
    classe: "bg-rose-600 hover:bg-rose-700 text-white",
  },
}

function ProsTab({ onModifie }: { onModifie: () => void }) {
  const [pros, setPros] = useState<ProLigne[]>([])
  const [villes, setVilles] = useState<string[]>([])
  const [q, setQ] = useState("")
  const [fPlan, setFPlan] = useState("all")
  const [fVille, setFVille] = useState("all")
  const [fStatut, setFStatut] = useState<"all" | "actifs" | "suspendus">("all")
  const [loading, setLoading] = useState(true)
  const [detail, setDetail] = useState<ProLigne | null>(null)
  const [confirmation, setConfirmation] = useState<{ action: ActionPros; pro: ProLigne } | null>(null)
  const [actionEnCours, setActionEnCours] = useState<string | null>(null)
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
  }, [fPlan, fVille, q, toast])

  useEffect(() => {
    const t = setTimeout(load, 300)
    return () => clearTimeout(t)
  }, [load])

  async function changerPlan(proId: string, plan: string) {
    const res = await fetch("/api/admin/pros", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ proId, action: "changerPlan", plan }),
    })
    const json = await res.json()
    if (json.ok) {
      setPros((prev) => prev.map((p) => (p.id === proId ? { ...p, plan, mrr: PLANS[plan as PlanId]?.price ?? 0 } : p)))
      toast({ title: "Plan mis à jour" })
      onModifie()
    } else {
      toast({ title: "Erreur", description: json.error, variant: "destructive" })
    }
  }

  async function executerAction(action: ActionPros, pro: ProLigne) {
    setActionEnCours(pro.id)
    try {
      const res = await fetch("/api/admin/pros", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proId: pro.id, action }),
      })
      const json = await res.json()
      if (json.ok) {
        if (action === "supprimer") {
          setPros((prev) => prev.filter((p) => p.id !== pro.id))
          toast({ title: "Commerçant supprimé", description: `${pro.nomCommerce} a été supprimé définitivement.` })
        } else {
          setPros((prev) => prev.map((p) => (p.id === pro.id ? { ...p, suspendu: action === "suspendre" } : p)))
          toast({
            title: action === "suspendre" ? "Commerçant suspendu" : "Commerçant réactivé",
            description: action === "suspendre" ? `${pro.nomCommerce} n'a plus accès à son dashboard.` : `${pro.nomCommerce} a de nouveau accès à son dashboard.`,
          })
        }
        setConfirmation(null)
        setDetail(null)
        onModifie()
      } else {
        toast({ title: "Erreur", description: json.error, variant: "destructive" })
      }
    } catch {
      toast({ title: "Erreur", description: "Action impossible pour le moment", variant: "destructive" })
    } finally {
      setActionEnCours(null)
    }
  }

  // Filtre par statut appliqué côté client (la liste serveur est déjà filtrée plan/ville/recherche)
  const visibles = pros.filter((p) =>
    fStatut === "all" ? true : fStatut === "suspendus" ? p.suspendu : !p.suspendu
  )

  return (
    <div className="space-y-4">
      {/* Filtres */}
      <Card>
        <CardContent className="p-4 flex flex-col lg:flex-row gap-2.5">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input placeholder="Rechercher (commerce, email)…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-8 h-10" aria-label="Rechercher un commerçant" />
          </div>
          <div className="flex flex-col sm:flex-row gap-2.5">
            <Select value={fStatut} onValueChange={(v) => setFStatut(v as typeof fStatut)}>
              <SelectTrigger className="h-10 sm:w-36" aria-label="Filtrer par statut">
                <SelectValue placeholder="Statut" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les statuts</SelectItem>
                <SelectItem value="actifs">Actifs</SelectItem>
                <SelectItem value="suspendus">Suspendus</SelectItem>
              </SelectContent>
            </Select>
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
          </div>
        </CardContent>
      </Card>

      {/* Table (desktop) / cartes (mobile) */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      ) : visibles.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">Aucun commerçant trouvé.</CardContent>
        </Card>
      ) : (
        <div className="space-y-2.5 max-h-[60vh] overflow-y-auto custom-scrollbar pr-0.5">
          {visibles.map((p) => (
            <Card key={p.id}>
              <CardContent className="p-4 flex flex-col xl:flex-row xl:items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium truncate">{p.nomCommerce}</p>
                    <Badge variant="outline" className="text-stone-600">
                      {p.categorie}
                    </Badge>
                    {p.suspendu && (
                      <Badge variant="outline" className="text-rose-700 border-rose-300">
                        Suspendu
                      </Badge>
                    )}
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
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Button variant="ghost" size="sm" className="h-9" onClick={() => setDetail(p)}>
                      <Eye className="mr-1.5 h-4 w-4" aria-hidden />
                      Détails
                    </Button>
                    {p.suspendu ? (
                      <Button variant="outline" size="sm" className="h-9" onClick={() => setConfirmation({ action: "reactiver", pro: p })}>
                        <RotateCcw className="mr-1.5 h-4 w-4" aria-hidden />
                        Réactiver
                      </Button>
                    ) : (
                      <Button variant="outline" size="sm" className="h-9 text-amber-700 border-amber-300 hover:bg-amber-50" onClick={() => setConfirmation({ action: "suspendre", pro: p })}>
                        <Ban className="mr-1.5 h-4 w-4" aria-hidden />
                        Suspendre
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" className="h-9 text-rose-600 hover:text-rose-700 hover:bg-rose-50" onClick={() => setConfirmation({ action: "supprimer", pro: p })}>
                      <Trash2 className="mr-1.5 h-4 w-4" aria-hidden />
                      Supprimer
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ---------- Dialog : fiche détaillée du commerçant ---------- */}
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="sm:max-w-lg">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 pr-6">
                  <span className="truncate">{detail.nomCommerce}</span>
                  {detail.suspendu && (
                    <Badge variant="outline" className="shrink-0 text-rose-700 border-rose-300">
                      Suspendu
                    </Badge>
                  )}
                </DialogTitle>
                <DialogDescription>Fiche détaillée du commerçant</DialogDescription>
              </DialogHeader>
              <div className="space-y-2.5 text-sm">
                {[
                  ["Email", detail.email],
                  ["Ville", detail.ville || "—"],
                  ["Catégorie", detail.categorie],
                  ["Plan", PLANS[detail.plan as PlanId]?.name ?? detail.plan],
                  ["Retours reçus", String(detail.nbRetours)],
                  ["Commandes", String(detail.nbCommandes)],
                  ["Inscrit le", formatDate(detail.createdAt)],
                ].map(([label, valeur]) => (
                  <div key={label} className="flex items-start justify-between gap-4 rounded-lg border px-3 py-2">
                    <span className="text-muted-foreground shrink-0">{label}</span>
                    <span className="font-medium text-right break-all">{valeur}</span>
                  </div>
                ))}
                <div className="flex items-start justify-between gap-4 rounded-lg border px-3 py-2">
                  <span className="text-muted-foreground shrink-0">QR code</span>
                  <a
                    href={`/r/${detail.qrToken}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-xs text-primary hover:underline break-all"
                  >
                    {detail.qrToken} — page de scan ↗
                  </a>
                </div>
              </div>
              <DialogFooter className="gap-2 sm:gap-0">
                <Button asChild>
                  <a href={`mailto:${detail.email}?subject=${encodeURIComponent("Votre compte FeedbackPro")}`}>
                    <Mail className="mr-1.5 h-4 w-4" aria-hidden />
                    Envoyer un message
                  </a>
                </Button>
                <Button variant="outline" onClick={() => setDetail(null)}>
                  Fermer
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ---------- AlertDialog : confirmation suspendre / réactiver / supprimer ---------- */}
      <AlertDialog open={!!confirmation} onOpenChange={(o) => !o && setConfirmation(null)}>
        <AlertDialogContent>
          {confirmation && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>{CONFIRM_META[confirmation.action].titre}</AlertDialogTitle>
                <AlertDialogDescription>{CONFIRM_META[confirmation.action].description(confirmation.pro)}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={actionEnCours === confirmation.pro.id}>Annuler</AlertDialogCancel>
                <AlertDialogAction
                  className={CONFIRM_META[confirmation.action].classe}
                  disabled={actionEnCours === confirmation.pro.id}
                  onClick={(e) => {
                    e.preventDefault() // laisse le dialog ouvert jusqu'à la fin de l'action
                    executerAction(confirmation.action, confirmation.pro)
                  }}
                >
                  {actionEnCours === confirmation.pro.id && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden />}
                  {CONFIRM_META[confirmation.action].bouton}
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ============================================================
// Sous-onglet Commandes (workflow d'impression + PDF + expédition)
// ============================================================

function CommandesTab({ onModifie }: { onModifie: () => void }) {
  const [commandes, setCommandes] = useState<CommandeLigne[]>([])
  const [stats, setStats] = useState<{ total: number; aImprimer: number; chiffreAffaires: number } | null>(null)
  const [fStatut, setFStatut] = useState("all")
  const [loading, setLoading] = useState(true)
  const [majEnCours, setMajEnCours] = useState<string | null>(null)
  const [expedition, setExpedition] = useState<CommandeLigne | null>(null)
  const [numeroSuivi, setNumeroSuivi] = useState("")
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
  }, [fStatut, toast])

  useEffect(() => {
    load()
  }, [load])

  async function changerStatut(id: string, statut: string, suivi?: string) {
    setMajEnCours(id)
    try {
      const res = await fetch("/api/admin/commandes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, statut, ...(statut === "EXPEDIE" ? { numeroSuivi: suivi } : {}) }),
      })
      const json = await res.json()
      if (json.ok) {
        setCommandes((prev) =>
          prev.map((c) => (c.id === id ? { ...c, statut, numeroSuivi: json.data.numeroSuivi ?? c.numeroSuivi } : c))
        )
        toast({ title: `Statut : ${STATUT_COMMANDE_LABEL[statut]}` })
        onModifie()
      } else {
        toast({ title: "Erreur", description: json.error, variant: "destructive" })
      }
    } catch {
      toast({ title: "Erreur", description: "Mise à jour impossible", variant: "destructive" })
    } finally {
      setMajEnCours(null)
    }
  }

  /** Passage au statut EXPEDIE : ouvre le dialog du numéro de suivi (optionnel) */
  function surChangementStatut(c: CommandeLigne, statut: string) {
    if (statut === "EXPEDIE" && c.statut !== "EXPEDIE") {
      setNumeroSuivi(c.numeroSuivi ?? "")
      setExpedition(c)
    } else {
      changerStatut(c.id, statut)
    }
  }

  /** Génère le bon d'impression PDF avec le QR de scan du commerce (généré côté client) */
  async function telechargerPdf(c: CommandeLigne) {
    try {
      const url = `${window.location.origin}/r/${c.pro.qrToken}`
      const qrDataUrl = await QRCode.toDataURL(url, {
        width: 600,
        margin: 1,
        errorCorrectionLevel: "H",
        color: { dark: "#0f172a", light: "#ffffff" },
      })
      generateCommandePdf(c, c.pro, qrDataUrl)
    } catch {
      // QR indisponible : le bon est généré sans
      generateCommandePdf(c, c.pro)
    }
  }

  function confirmerExpedition() {
    if (!expedition) return
    const c = expedition
    setExpedition(null)
    changerStatut(c.id, "EXPEDIE", numeroSuivi.trim() || undefined)
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
        <div className="space-y-3 max-h-[70vh] overflow-y-auto custom-scrollbar pr-0.5">
          {commandes.map((c) => {
            const idx = STATUT_COMMANDE_ORDRE.indexOf(c.statut)
            const suivant = idx < STATUT_COMMANDE_ORDRE.length - 1 ? STATUT_COMMANDE_ORDRE[idx + 1] : null
            return (
              <Card key={c.id}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium flex items-center gap-2 flex-wrap">
                        <span>
                          {SUPPORTS[c.typeSupport as TypeSupportId]?.emoji} {SUPPORTS[c.typeSupport as TypeSupportId]?.label}
                        </span>
                        <span className="text-sm font-normal text-muted-foreground">#{c.id.slice(-8).toUpperCase()}</span>
                        {c.numeroSuivi && (
                          <Badge variant="outline" className="text-emerald-700 border-emerald-300 font-normal gap-1">
                            <Truck className="h-3 w-3" aria-hidden />
                            Suivi : {c.numeroSuivi}
                          </Badge>
                        )}
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
                    <Button variant="outline" size="sm" className="h-9" onClick={() => telechargerPdf(c)}>
                      <Printer className="mr-1.5 h-4 w-4" aria-hidden />
                      Générer le PDF
                    </Button>
                    {suivant && (
                      <Button size="sm" className="h-9" onClick={() => surChangementStatut(c, suivant)} disabled={majEnCours === c.id}>
                        {majEnCours === c.id ? (
                          <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden />
                        ) : (
                          <TrendingUp className="mr-1.5 h-4 w-4" aria-hidden />
                        )}
                        Marquer « {STATUT_COMMANDE_LABEL[suivant]} »
                      </Button>
                    )}
                    <Select value={c.statut} onValueChange={(v) => surChangementStatut(c, v)}>
                      <SelectTrigger
                        className="h-9 w-40 text-xs"
                        aria-label={`Changer le statut de la commande ${c.id.slice(-8).toUpperCase()}`}
                      >
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
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* ---------- Dialog : expédition + numéro de suivi (optionnel) ---------- */}
      <Dialog open={!!expedition} onOpenChange={(o) => !o && setExpedition(null)}>
        <DialogContent className="sm:max-w-md">
          {expedition && (
            <>
              <DialogHeader>
                <DialogTitle>Marquer la commande comme expédiée</DialogTitle>
                <DialogDescription>
                  {SUPPORTS[expedition.typeSupport as TypeSupportId]?.label} pour {expedition.pro.nomCommerce}. Vous
                  pouvez renseigner le numéro de suivi du transporteur (optionnel) — il sera visible par le commerçant.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                <Label htmlFor="numero-suivi">Numéro de suivi</Label>
                <Input
                  id="numero-suivi"
                  placeholder="Ex. 6A12345678901"
                  value={numeroSuivi}
                  onChange={(e) => setNumeroSuivi(e.target.value)}
                  maxLength={100}
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setExpedition(null)}>
                  Annuler
                </Button>
                <Button onClick={confirmerExpedition} disabled={majEnCours === expedition.id}>
                  {majEnCours === expedition.id && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden />}
                  Confirmer l&apos;expédition
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ============================================================
// Sous-onglet Revenus (CA abonnements + supports, graphiques)
// ============================================================

function RevenusTab() {
  const [data, setData] = useState<RevenusData | null>(null)
  const [loading, setLoading] = useState(true)
  const { toast } = useToast()

  useEffect(() => {
    let annule = false
    fetch("/api/admin/revenus", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (annule) return
        if (j.ok) setData(j.data)
        else toast({ title: "Erreur", description: "Impossible de charger les revenus", variant: "destructive" })
      })
      .catch(() => {
        if (!annule) toast({ title: "Erreur", description: "Impossible de charger les revenus", variant: "destructive" })
      })
      .finally(() => {
        if (!annule) setLoading(false)
      })
    return () => {
      annule = true
    }
  }, [])

  if (loading || !data) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-72 rounded-xl" />
        <Skeleton className="h-72 rounded-xl" />
      </div>
    )
  }

  const camembert = (Object.keys(SUPPORTS) as TypeSupportId[])
    .map((t) => ({ nom: SUPPORTS[t].label, ca: data.caSupportsParType[t] ?? 0 }))
    .filter((d) => d.ca > 0)

  return (
    <div className="space-y-6">
      {/* ---------- KPIs revenus ---------- */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          icon={Euro}
          label="CA abonnements (mensuel)"
          value={`${data.caAbonnementsMensuel} €`}
          hint="MRR des plans actifs"
          hintTone="up"
        />
        <StatCard
          icon={Package}
          label="CA supports physiques"
          value={`${data.caSupportsTotal} €`}
          hint="Total des commandes"
        />
        {(Object.keys(SUPPORTS) as TypeSupportId[]).map((t, i) => (
          <StatCard
            key={t}
            icon={Wallet}
            label={SUPPORTS[t].label}
            value={`${data.caSupportsParType[t] ?? 0} €`}
            hint={SUPPORTS[t].price ? `${SUPPORTS[t].price} € / unité` : undefined}
          />
        ))}
      </div>

      {/* ---------- Répartition CA par type de support ---------- */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base sm:text-lg">Répartition du CA supports</CardTitle>
            <p className="text-sm text-muted-foreground">Par type de support physique vendu</p>
          </CardHeader>
          <CardContent className="h-72">
            {camembert.length === 0 ? (
              <p className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Aucune commande de support pour le moment
              </p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={camembert} dataKey="ca" nameKey="nom" innerRadius={55} outerRadius={90} paddingAngle={3}>
                    {camembert.map((_, i) => (
                      <Cell key={i} fill={COULEURS_SUPPORTS[i % COULEURS_SUPPORTS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => [`${v} €`, "CA"]} labelStyle={{ color: "#1c1917" }} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 13 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* ---------- Évolution mensuelle (12 mois) ---------- */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base sm:text-lg">Évolution sur 12 mois</CardTitle>
            <p className="text-sm text-muted-foreground">Abonnements (MRR estimé) et supports, en euros</p>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.evolutionMensuelle} margin={{ top: 5, right: 0, left: -15, bottom: 0 }}>
                <XAxis dataKey="mois" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} interval={0} angle={-40} textAnchor="end" height={48} />
                <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip formatter={(v, nom) => [`${v} €`, String(nom)]} labelStyle={{ color: "#1c1917" }} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 13 }} />
                <Bar dataKey="abonnements" name="Abonnements (MRR)" fill="#10b981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="supports" name="Supports" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

// ============================================================
// Sous-onglet Paramètres (réglages plateforme, model Setting)
// ============================================================

function ParametresTab() {
  const [valeurs, setValeurs] = useState<SettingsForm | null>(null)
  const [chargement, setChargement] = useState(true)
  const [enregistrement, setEnregistrement] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    let annule = false
    fetch("/api/admin/settings", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (annule) return
        if (j.ok) {
          const liste: { key: string; value: string }[] = j.data.settings
          const map = Object.fromEntries(liste.map((s) => [s.key, s.value]))
          setValeurs({
            nomPlateforme: map.nomPlateforme ?? "FeedbackPro",
            urlPublique: map.urlPublique ?? "",
            emailSupport: map.emailSupport ?? "",
            seuilAlerte: map.seuilAlerte ?? "2",
          })
        } else {
          toast({ title: "Erreur", description: "Impossible de charger les réglages", variant: "destructive" })
        }
      })
      .catch(() => {
        if (!annule) toast({ title: "Erreur", description: "Impossible de charger les réglages", variant: "destructive" })
      })
      .finally(() => {
        if (!annule) setChargement(false)
      })
    return () => {
      annule = true
    }
  }, [])

  async function enregistrer(e: React.FormEvent) {
    e.preventDefault()
    if (!valeurs || enregistrement) return
    // Validation URL côté client (le serveur revalide via Zod)
    if (valeurs.urlPublique.trim() !== "") {
      try {
        new URL(valeurs.urlPublique.trim())
      } catch {
        toast({ title: "URL publique invalide", description: "Renseignez une URL complète (https://…)", variant: "destructive" })
        return
      }
    }
    setEnregistrement(true)
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nomPlateforme: valeurs.nomPlateforme.trim(),
          urlPublique: valeurs.urlPublique.trim(),
          emailSupport: valeurs.emailSupport.trim(),
          seuilAlerte: Number(valeurs.seuilAlerte),
        }),
      })
      const json = await res.json()
      if (json.ok) {
        toast({ title: "Paramètres enregistrés ✓" })
      } else {
        toast({ title: "Erreur", description: json.error, variant: "destructive" })
      }
    } catch {
      toast({ title: "Erreur", description: "Enregistrement impossible pour le moment", variant: "destructive" })
    } finally {
      setEnregistrement(false)
    }
  }

  if (chargement || !valeurs) {
    return (
      <div className="space-y-4 max-w-2xl">
        <Skeleton className="h-44 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    )
  }

  return (
    <form onSubmit={enregistrer} className="space-y-4 max-w-2xl">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base sm:text-lg">Général</CardTitle>
          <p className="text-sm text-muted-foreground">Identité de la plateforme affichée aux commerçants</p>
        </CardHeader>
        <CardContent className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label htmlFor="set-nom">Nom de la plateforme</Label>
            <Input
              id="set-nom"
              value={valeurs.nomPlateforme}
              onChange={(e) => setValeurs({ ...valeurs, nomPlateforme: e.target.value })}
              maxLength={80}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="set-url">URL publique</Label>
            <Input
              id="set-url"
              type="url"
              placeholder="https://feedbackpro.fr"
              value={valeurs.urlPublique}
              onChange={(e) => setValeurs({ ...valeurs, urlPublique: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">Laissez vide si non applicable.</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base sm:text-lg">Support & alertes</CardTitle>
          <p className="text-sm text-muted-foreground">Contact affiché aux commerçants et sensibilité des alertes</p>
        </CardHeader>
        <CardContent className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label htmlFor="set-email">Email de support</Label>
            <Input
              id="set-email"
              type="email"
              value={valeurs.emailSupport}
              onChange={(e) => setValeurs({ ...valeurs, emailSupport: e.target.value })}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="set-seuil">Seuil d&apos;alerte (note minimum déclenchant une alerte)</Label>
            <Select
              value={valeurs.seuilAlerte}
              onValueChange={(v) => {
                // Garde-fou Radix : ignore les changements parasites vers ""
                if (v) setValeurs({ ...valeurs, seuilAlerte: v })
              }}
            >
              <SelectTrigger id="set-seuil" className="h-10" aria-label="Seuil d'alerte">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[1, 2, 3, 4, 5].map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n} étoile{n > 1 ? "s" : ""} ou moins
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Un retour client dont la note est inférieure ou égale à ce seuil génère une alerte pour le commerçant.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" disabled={enregistrement}>
          {enregistrement && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden />}
          Enregistrer les paramètres
        </Button>
      </div>
    </form>
  )
}
