"use client"

// ============================================================
// FeedbackPro - Dashboard Superadmin (pivot Zones, Coach IA)
// Onglets : Vue d'ensemble · Commerçants · Commandes · Revenus · Paramètres
// URLs synchronisées : /superadmin/<slug> (rewritées vers /?admin=1&tabAdmin=…)
// Contrats : GET /api/admin/overview, /api/admin/pros (POST actions),
// /api/admin/commandes (PATCH), /api/admin/revenus, /api/admin/settings
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
  CheckCircle2,
  MapPin,
  Plus,
  Menu,
  LogOut,
  QrCode,
  Building2,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"
import { StatCard, formatDate } from "@/components/feedbackpro/shared"
import { useAppStore } from "@/store/app-store"
import { useToast } from "@/hooks/use-toast"
import {
  PLANS,
  SUPPORTS,
  STATUT_COMMANDE_LABEL,
  STATUT_COMMANDE_ORDRE,
  TYPES_ETABLISSEMENT,
  PlanId,
  TypeSupportId,
} from "@/lib/constants"
import { generateCommandePdf, generateLabelsPdf } from "@/lib/pdf"
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

type OngletAdmin = "globale" | "commercants" | "commandes" | "revenus" | "parametres"

const ONGLETS: { id: OngletAdmin; label: string; icone: React.ComponentType<{ className?: string }> }[] = [
  { id: "globale", label: "Vue d'ensemble", icone: LayoutDashboard },
  { id: "commercants", label: "Commerçants", icone: Store },
  { id: "commandes", label: "Commandes", icone: Package },
  { id: "revenus", label: "Revenus", icone: Wallet },
  { id: "parametres", label: "Paramètres", icone: Settings },
]

// Alias de slugs historiques (rétrocompatibilité des anciennes URLs)
const ALIAS_SLUGS: Record<string, OngletAdmin> = { pros: "commercants" }

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
    if (t) {
      if (EST_ONGLET(t)) return t
      if (ALIAS_SLUGS[t]) return ALIAS_SLUGS[t]
    }
    const m = window.location.pathname.match(/^\/superadmin\/([a-z-]+)\/?$/)
    if (m) {
      if (EST_ONGLET(m[1])) return m[1]
      if (ALIAS_SLUGS[m[1]]) return ALIAS_SLUGS[m[1]]
    }
  } catch {
    /* ignore */
  }
  return "globale"
}

// ---------- Types (contrats API pivot Zones) ----------

/** GET /api/admin/overview → { totalPros, prosActifs, mrr, commandesEnCours, croissance30j, repartitionPlans, top10Pros } */
type OverviewApi = {
  totalPros?: number
  prosActifs?: number
  mrr?: number
  commandesEnCours?: number
  croissance30j?: { jour?: string; date?: string; nouveaux?: number; total?: number; count?: number }[]
  repartitionPlans?: Record<string, number> | { plan?: string; count?: number }[]
  top10Pros?: { nomEtablissement?: string; nomCommerce?: string; retours?: number }[]
}

/** GET /api/admin/pros → { pros: [{ ...pro, zones, retours, employes (counts) }] } */
type ProLigne = {
  id: string
  nomEtablissement: string
  typeEtablissement: string
  ville: string
  email: string
  plan: string
  suspendu: boolean
  onboardingDone: boolean
  createdAt: string
  zones: number
  retours: number
  employes: number
}

/** GET /api/admin/commandes → { commandes: [...] } */
type CommandeLigne = {
  id: string
  typeSupport: string
  quantite: number
  prixEuros: number
  adresseLivraison: string
  statut: string
  numeroSuivi: string | null
  zoneId?: string | null
  createdAt: string
  // Champs tolérants aux deux nomenclatures (pivot en cours côté API)
  pro?: {
    nomEtablissement?: string
    nomCommerce?: string
    ville?: string
    email?: string
    qrToken?: string
  }
  zone?: { nom?: string; qrToken?: string }
}

/** GET /api/admin/revenus */
type RevenusData = {
  caAbonnementsMensuel: number
  caSupportsTotal: number
  caSupportsParType: Partial<Record<TypeSupportId, number>>
  evolutionMensuelle: { mois: string; abonnements: number; supports: number }[]
}

type SettingsForm = {
  nomPlateforme: string
  urlPublique: string
  emailSupport: string
  seuilAlerte: string
}

// Couleurs des graphiques (palette bleu FeedbackPro)
const COULEURS_PLANS: Record<string, string> = {
  STARTER: "#64748b",
  PRO: "#2563eb",
  ENTERPRISE: "#1e3a8a",
}
const COULEURS_SUPPORTS = ["#2563eb", "#f59e0b", "#0891b2"]

/** Libellé d'un plan depuis son id (STARTER → Starter) */
function nomPlan(plan: string | undefined): string {
  return PLANS[(plan ?? "") as PlanId]?.name ?? plan ?? "—"
}

/** Garde-fou : renvoie toujours un tableau (l'API peut être en cours de migration) */
function enArray<T>(v: T[] | null | undefined): T[] {
  return Array.isArray(v) ? v : []
}

// ============================================================
// Composant racine
// ============================================================

export function AdminDashboard() {
  const [onglet, setOnglet] = useState<OngletAdmin>(() => ongletDepuisUrl())
  const [overview, setOverview] = useState<OverviewApi | null>(null)
  const [menuOuvert, setMenuOuvert] = useState(false)
  const session = useAppStore((s) => s.session)
  const logout = useAppStore((s) => s.logout)
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
    setMenuOuvert(false)
    try {
      window.history.pushState({}, "", `/superadmin/${o}`)
    } catch {
      /* ignore */
    }
  }

  const ongletCourant = ONGLETS.find((o) => o.id === onglet)
  const titreOnglet = ongletCourant?.label ?? "Administration"
  const emailAdmin = session?.user?.email ?? ""

  return (
    <div className="min-h-screen bg-stone-100">
      {/* ---------- Sidebar fixe desktop (lg+) ---------- */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-72 flex-col bg-blue-600 text-white lg:flex">
        <ContenuSidebarAdmin ongletActif={onglet} onNaviguer={naviguer} emailAdmin={emailAdmin} onLogout={logout} />
      </aside>

      {/* ---------- Colonne principale (décalée à droite de la sidebar) ---------- */}
      <div className="flex min-h-screen flex-col lg:pl-72">
        {/* ---------- Header bleu (continuité visuelle avec la sidebar) ---------- */}
        <header className="sticky top-0 z-30 h-14 bg-blue-600 text-white sm:h-16">
          <div className="flex h-full w-full items-center justify-between gap-3 px-4 sm:px-6">
            <div className="flex min-w-0 items-center gap-2">
              <Sheet open={menuOuvert} onOpenChange={setMenuOuvert}>
                <SheetContent side="left" className="w-72 border-0 bg-blue-600 p-0 text-white" aria-describedby={undefined}>
                  <SheetTitle className="sr-only">Navigation administration</SheetTitle>
                  <ContenuSidebarAdmin
                    ongletActif={onglet}
                    onNaviguer={naviguer}
                    emailAdmin={emailAdmin}
                    onLogout={logout}
                  />
                </SheetContent>
              </Sheet>
              <Button
                variant="ghost"
                size="icon"
                className="text-white hover:bg-white/15 hover:text-white lg:hidden"
                onClick={() => setMenuOuvert(true)}
                aria-label="Ouvrir le menu"
              >
                <Menu className="h-5 w-5" aria-hidden />
              </Button>
              <p className="truncate font-semibold">{titreOnglet}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2 sm:gap-3">
              <Badge variant="secondary" className="border-0 bg-white/15 text-white">Superadmin</Badge>
              <span className="hidden text-sm text-white/90 md:block max-w-48 truncate">{emailAdmin}</span>
              <Button
                variant="ghost"
                size="icon"
                className="text-white hover:bg-white/15 hover:text-white"
                onClick={() => logout()}
                aria-label="Se déconnecter"
              >
                <LogOut className="h-4.5 w-4.5" aria-hidden />
              </Button>
            </div>
          </div>
        </header>

        {/* ---------- Contenu ---------- */}
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 sm:px-6 py-5 sm:py-7 space-y-6">
          {onglet === "globale" && <GlobaleTab overview={overview} />}
          {onglet === "commercants" && <ProsTab onModifie={loadOverview} />}
          {onglet === "commandes" && <CommandesTab onModifie={loadOverview} />}
          {onglet === "revenus" && <RevenusTab />}
          {onglet === "parametres" && <ParametresTab />}
        </main>
      </div>
    </div>
  )
}

// ============================================================
// Sidebar admin (desktop fixe + drawer mobile)
// ============================================================

function ContenuSidebarAdmin({
  ongletActif,
  onNaviguer,
  emailAdmin,
  onLogout,
}: {
  ongletActif: OngletAdmin
  onNaviguer: (o: OngletAdmin) => void
  emailAdmin: string
  onLogout: () => void
}) {
  return (
    <div className="flex h-full flex-col">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 py-5">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15 text-white"
          aria-hidden
        >
          <QrCode className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="truncate font-bold leading-tight text-white">FeedbackPro</p>
          <p className="text-xs text-white/80">Administration</p>
        </div>
      </div>

      {/* Navigation verticale */}
      <nav aria-label="Sections administration" className="flex flex-col gap-1 px-3 py-2">
        {ONGLETS.map((o) => {
          const Icone = o.icone
          const actif = ongletActif === o.id
          const badge = o.id === "commandes" ? "" : ""
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => onNaviguer(o.id)}
              aria-current={actif ? "page" : undefined}
              className={`relative flex h-11 shrink-0 items-center gap-3 rounded-lg px-3 text-sm transition-colors ${
                actif
                  ? "bg-white/15 font-semibold text-white"
                  : "text-white/85 hover:bg-white/10 hover:text-white"
              }`}
            >
              {actif && (
                <span
                  className="absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-full bg-white"
                  aria-hidden
                />
              )}
              <Icone className="h-5 w-5 shrink-0" aria-hidden />
              <span className="truncate">{o.label}</span>
              {badge}
            </button>
          )
        })}
      </nav>

      {/* Bas de sidebar : email + déconnexion */}
      <div className="mt-auto border-t border-white/15 p-3">
        <div className="rounded-lg px-3 py-2 text-xs text-white/80">
          <p className="truncate">{emailAdmin || "—"}</p>
          <p className="mt-0.5 text-white/60">Connecté en superadmin</p>
        </div>
        <Button
          variant="ghost"
          className="mt-1 w-full justify-start gap-2 text-white/90 hover:bg-white/10 hover:text-white"
          onClick={onLogout}
        >
          <LogOut className="h-4 w-4" aria-hidden />
          Se déconnecter
        </Button>
      </div>
    </div>
  )
}

// ============================================================
// Sous-onglet Vue d'ensemble (4 KPI + croissance + top 10 + plans)
// ============================================================

function GlobaleTab({ overview }: { overview: OverviewApi | null }) {
  if (!overview) {
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

  const totalPros = overview.totalPros ?? 0
  const prosActifs = overview.prosActifs ?? 0
  const mrr = overview.mrr ?? 0
  const commandesEnCours = overview.commandesEnCours ?? 0

  // Croissance des inscriptions (30 derniers jours) — champs tolérants
  const croissance = enArray(overview.croissance30j).map((p) => ({
    jour: p.jour ?? p.date ?? "",
    nouveaux: p.nouveaux ?? p.total ?? p.count ?? 0,
  }))

  // Top 10 des Pros par nombre de retours : [{ nomEtablissement, retours }]
  const top10 = enArray(overview.top10Pros).map((p) => ({
    nom: p.nomEtablissement ?? p.nomCommerce ?? "—",
    retours: p.retours ?? 0,
  }))

  // Répartition par plan : objet { STARTER: n, ... } ou tableau [{ plan, count }]
  const repartition: { plan: string; count: number; fill: string }[] = Array.isArray(overview.repartitionPlans)
    ? overview.repartitionPlans.map((r) => ({
        plan: nomPlan(r.plan),
        count: r.count ?? 0,
        fill: COULEURS_PLANS[r.plan ?? ""] ?? "#94a3b8",
      }))
    : Object.entries(overview.repartitionPlans ?? {}).map(([plan, count]) => ({
        plan: nomPlan(plan),
        count: Number(count) || 0,
        fill: COULEURS_PLANS[plan] ?? "#94a3b8",
      }))

  return (
    <div className="space-y-6">
      {/* ---------- 4 KPI ---------- */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard icon={Store} label="Pros total" value={totalPros} hint={`${prosActifs} actifs`} />
        <StatCard icon={CheckCircle2} label="Pros actifs" value={prosActifs} hint="Comptes non suspendus" hintTone="up" />
        <StatCard icon={Euro} label="MRR abonnements" value={`${mrr} €`} hint="Calculé sur les plans actifs (29/99/249 €)" hintTone="up" />
        <StatCard
          icon={Package}
          label="Commandes en cours"
          value={commandesEnCours}
          hint={commandesEnCours > 0 ? "À imprimer ou expédier" : "Tout est traité"}
          hintTone={commandesEnCours > 0 ? "down" : "up"}
        />
      </div>

      {/* ---------- Croissance des inscriptions (30 derniers jours) ---------- */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base sm:text-lg">Croissance des inscriptions (30 derniers jours)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={croissance} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
                <defs>
                  <linearGradient id="gradPros" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2563EB" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#2563EB" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="jour" tick={{ fontSize: 10 }} interval={4} stroke="#64748b" />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="#64748b" />
                <Tooltip
                  formatter={(v) => [`${v} nouveau(x)`, "Pros inscrits"]}
                  labelStyle={{ color: "#1c1917", fontWeight: 600 }}
                  contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 13 }}
                />
                <Area type="monotone" dataKey="nouveaux" stroke="#2563EB" strokeWidth={2.5} fill="url(#gradPros)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* ---------- Top 10 des Pros par nombre de retours ---------- */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base sm:text-lg">Top 10 des établissements par nombre de retours</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64 w-full">
            {top10.length === 0 ? (
              <p className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Aucun retour collecté pour le moment
              </p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={top10} layout="vertical" margin={{ top: 4, right: 24, bottom: 0, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} stroke="#64748b" />
                  <YAxis type="category" dataKey="nom" width={150} tick={{ fontSize: 11 }} stroke="#64748b" />
                  <Tooltip
                    formatter={(v) => [`${v} retours`, "Total"]}
                    labelStyle={{ color: "#1c1917", fontWeight: 600 }}
                    contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 13 }}
                  />
                  <Bar dataKey="retours" fill="#2563EB" radius={[0, 6, 6, 0]} barSize={18} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ---------- Répartition par plan (camembert) ---------- */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base sm:text-lg">Répartition par plan</CardTitle>
          <p className="text-sm text-muted-foreground">Starter 29 € · Pro 99 € · Enterprise 249 €</p>
        </CardHeader>
        <CardContent className="h-72">
          {repartition.every((r) => r.count === 0) ? (
            <p className="flex h-full items-center justify-center text-sm text-muted-foreground">Aucun commerçant inscrit</p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={repartition.filter((r) => r.count > 0)} dataKey="count" nameKey="plan" innerRadius={55} outerRadius={90} paddingAngle={3}>
                  {repartition.filter((r) => r.count > 0).map((r, i) => (
                    <Cell key={i} fill={r.fill} />
                  ))}
                </Pie>
                <Tooltip formatter={(v) => [`${v} commerçant(s)`, ""]} labelStyle={{ color: "#1c1917" }} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 13 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ============================================================
// Sous-onglet Commerçants (tableau + recherche/filtres + actions)
// ============================================================

type ActionPros = "suspendre" | "reactiver" | "supprimer"

const CONFIRM_META: Record<
  ActionPros,
  { titre: string; description: (p: ProLigne) => string; bouton: string; classe: string }
> = {
  suspendre: {
    titre: "Suspendre ce commerçant ?",
    description: (p) =>
      `« ${p.nomEtablissement} » perdra immédiatement l'accès à son dashboard et à ses API jusqu'à réactivation. Ses données sont conservées.`,
    bouton: "Suspendre le compte",
    classe: "bg-amber-600 hover:bg-amber-700 text-white",
  },
  reactiver: {
    titre: "Réactiver ce commerçant ?",
    description: (p) => `« ${p.nomEtablissement} » retrouvera immédiatement l'accès à son dashboard et à ses données.`,
    bouton: "Réactiver le compte",
    classe: "",
  },
  supprimer: {
    titre: "Supprimer définitivement ce commerçant ?",
    description: (p) =>
      `Cette action est irréversible : le compte, les ${p.zones} zone(s), les ${p.retours} retour(s), les commandes et les QR codes de « ${p.nomEtablissement} » seront supprimés définitivement.`,
    bouton: "Supprimer définitivement",
    classe: "bg-rose-600 hover:bg-rose-700 text-white",
  },
}

function ProsTab({ onModifie }: { onModifie: () => void }) {
  const [pros, setPros] = useState<ProLigne[]>([])
  const [q, setQ] = useState("")
  const [fPlan, setFPlan] = useState("all")
  const [fStatut, setFStatut] = useState<"all" | "actifs" | "suspendus">("all")
  const [loading, setLoading] = useState(true)
  const [detail, setDetail] = useState<ProLigne | null>(null)
  const [confirmation, setConfirmation] = useState<{ action: ActionPros; pro: ProLigne } | null>(null)
  const [actionEnCours, setActionEnCours] = useState<string | null>(null)
  // État du formulaire d'ajout d'un commerçant
  const [dialogAjout, setDialogAjout] = useState(false)
  const [envoiAjout, setEnvoiAjout] = useState(false)
  const [formAjout, setFormAjout] = useState<{
    nomEtablissement: string
    email: string
    password: string
    typeEtablissement: string
    ville: string
    adresse: string
    plan: PlanId
  }>({
    nomEtablissement: "",
    email: "",
    password: "",
    typeEtablissement: TYPES_ETABLISSEMENT[0],
    ville: "",
    adresse: "",
    plan: "STARTER",
  })
  const { toast } = useToast()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (fPlan !== "all") params.set("plan", fPlan)
      if (q.trim()) params.set("q", q.trim())
      const res = await fetch(`/api/admin/pros?${params}`, { cache: "no-store" })
      const json = await res.json()
      if (json.ok) {
        // Normalisation défensive : zones / retours / employes sont des compteurs
        setPros(
          enArray<Record<string, unknown>>(json.data.pros).map((p) => ({
            ...(p as unknown as ProLigne),
            nomEtablissement: (p.nomEtablissement as string) ?? (p.nomCommerce as string) ?? "",
            zones: Number(p.zones ?? 0),
            retours: Number(p.retours ?? 0),
            employes: Number(p.employes ?? 0),
          }))
        )
      }
    } catch {
      toast({ title: "Erreur", description: "Impossible de charger les commerçants", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }, [fPlan, q, toast])

  useEffect(() => {
    const t = setTimeout(load, 300)
    return () => clearTimeout(t)
  }, [load])

  /** Soumission du formulaire d'ajout : appelle /api/auth/register puis, si le
   *  plan choisi n'est pas STARTER, change le plan via /api/admin/pros. */
  async function soumettreAjout(e: React.FormEvent) {
    e.preventDefault()
    if (envoiAjout) return

    // Validation côté client (champs requis, email valide, mot de passe ≥ 6)
    const email = formAjout.email.trim().toLowerCase()
    const password = formAjout.password
    const nomEtablissement = formAjout.nomEtablissement.trim()
    const ville = formAjout.ville.trim()
    const adresse = formAjout.adresse.trim()
    if (!nomEtablissement || nomEtablissement.length < 2) {
      toast({ title: "Nom d'établissement invalide", description: "Au moins 2 caractères", variant: "destructive" })
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast({ title: "Email invalide", description: "Renseignez une adresse email valide", variant: "destructive" })
      return
    }
    if (password.length < 6) {
      toast({ title: "Mot de passe trop court", description: "6 caractères minimum", variant: "destructive" })
      return
    }
    if (!ville || ville.length < 2) {
      toast({ title: "Ville requise", variant: "destructive" })
      return
    }
    if (adresse.length < 5) {
      toast({ title: "Adresse requise", description: "Au moins 5 caractères", variant: "destructive" })
      return
    }

    setEnvoiAjout(true)
    try {
      // 1) Inscription via l'API existante — crée le compte Pro + la zone « Accueil ».
      //    Garde-fou serveur : un superadmin déjà authentifié garde sa session
      //    (le cookie n'est pas écrasé).
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          nomEtablissement,
          typeEtablissement: formAjout.typeEtablissement,
          ville,
          adresse,
          whatsapp: "",
        }),
      })
      const json = await res.json()
      if (!json.ok) {
        toast({ title: "Erreur", description: json.error || "Inscription impossible", variant: "destructive" })
        return
      }
      const nouveauProId: string | undefined = json.data?.pro?.id

      // 2) Si le plan choisi n'est pas STARTER (défault à l'inscription),
      //    on applique le plan via l'API admin existante.
      if (formAjout.plan !== "STARTER" && nouveauProId) {
        try {
          await fetch("/api/admin/pros", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "changerPlan", id: nouveauProId, plan: formAjout.plan }),
          })
        } catch {
          /* non bloquant : le compte est créé, le plan sera ajustable */
        }
      }

      toast({
        title: "Commerçant ajouté ✓",
        description: `« ${nomEtablissement} » a été créé (plan ${nomPlan(formAjout.plan)}).`,
      })
      // Réinitialise le formulaire et ferme la modale
      setFormAjout({
        nomEtablissement: "",
        email: "",
        password: "",
        typeEtablissement: TYPES_ETABLISSEMENT[0],
        ville: "",
        adresse: "",
        plan: "STARTER",
      })
      setDialogAjout(false)
      // Recharge la liste et les stats globales
      load()
      onModifie()
    } catch {
      toast({ title: "Erreur", description: "Impossible de créer le commerçant pour le moment", variant: "destructive" })
    } finally {
      setEnvoiAjout(false)
    }
  }

  // POST /api/admin/pros { action, id, plan? } — actions superadmin
  async function executerAction(action: ActionPros | "changerPlan", pro: ProLigne, plan?: string) {
    setActionEnCours(pro.id)
    try {
      const res = await fetch("/api/admin/pros", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, id: pro.id, ...(plan ? { plan } : {}) }),
      })
      const json = await res.json()
      if (json.ok) {
        if (action === "supprimer") {
          setPros((prev) => prev.filter((p) => p.id !== pro.id))
          toast({ title: "Commerçant supprimé", description: `${pro.nomEtablissement} a été supprimé définitivement.` })
        } else if (action === "changerPlan") {
          setPros((prev) => prev.map((p) => (p.id === pro.id ? { ...p, plan: plan ?? p.plan } : p)))
          toast({ title: `Plan mis à jour : ${nomPlan(plan)}` })
        } else {
          setPros((prev) => prev.map((p) => (p.id === pro.id ? { ...p, suspendu: action === "suspendre" } : p)))
          toast({
            title: action === "suspendre" ? "Commerçant suspendu" : "Commerçant réactivé",
            description:
              action === "suspendre"
                ? `${pro.nomEtablissement} n'a plus accès à son dashboard.`
                : `${pro.nomEtablissement} a de nouveau accès à son dashboard.`,
          })
        }
        setConfirmation(null)
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

  // Filtre par statut appliqué côté client (q et plan sont filtrés côté serveur)
  const visibles = pros.filter((p) =>
    fStatut === "all" ? true : fStatut === "suspendus" ? p.suspendu : !p.suspendu
  )

  return (
    <div className="space-y-4">
      {/* ---------- Recherche + filtres + ajout ---------- */}
      <Card>
        <CardContent className="p-4 flex flex-col lg:flex-row gap-2.5">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              placeholder="Rechercher (établissement, email)…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="pl-8 h-10"
              aria-label="Rechercher un commerçant"
            />
          </div>
          <div className="flex flex-col sm:flex-row gap-2.5">
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
            <Button variant="outline" size="icon" className="h-10 w-10 shrink-0" onClick={load} aria-label="Rafraîchir">
              <RefreshCw className="h-4 w-4" aria-hidden />
            </Button>
            <Button
              className="h-10 shrink-0 gap-1.5 bg-blue-600 hover:bg-blue-700"
              onClick={() => setDialogAjout(true)}
            >
              <Plus className="h-4 w-4" aria-hidden />
              <span className="hidden sm:inline">Ajouter un commerçant</span>
              <span className="sm:hidden">Ajouter</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ---------- Tableau des commerçants ---------- */}
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
        <Card className="overflow-hidden py-0">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table className="min-w-[980px]">
                <TableHeader>
                  <TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableHead className="pl-4">Établissement</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Ville</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead className="text-center">Zones</TableHead>
                    <TableHead className="text-center">Retours</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead className="pr-4 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibles.map((p) => (
                    <TableRow key={p.id}>
                      {/* Établissement (nom + email) */}
                      <TableCell className="pl-4 max-w-56">
                        <p className="flex items-center gap-1.5 font-medium truncate">
                          {p.nomEtablissement}
                          {!p.onboardingDone && (
                            <Badge variant="destructive" className="h-4 px-1 text-[9px] shrink-0">
                              Onboarding incomplet
                            </Badge>
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">{p.email}</p>
                      </TableCell>

                      {/* Type */}
                      <TableCell>
                        <Badge variant="outline" className="max-w-32 truncate text-stone-600">
                          <span className="truncate">{p.typeEtablissement || "—"}</span>
                        </Badge>
                      </TableCell>

                      {/* Ville */}
                      <TableCell className="text-sm text-muted-foreground">{p.ville || "—"}</TableCell>

                      {/* Plan (badge) */}
                      <TableCell>
                        <Badge variant="secondary">{nomPlan(p.plan)}</Badge>
                      </TableCell>

                      {/* Compteurs */}
                      <TableCell className="text-center text-sm font-medium">{p.zones}</TableCell>
                      <TableCell className="text-center text-sm font-medium">{p.retours}</TableCell>

                      {/* Statut actif / suspendu */}
                      <TableCell>
                        {p.suspendu ? (
                          <Badge variant="outline" className="text-rose-700 border-rose-300">
                            Suspendu
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-green-700 border-green-300">
                            Actif
                          </Badge>
                        )}
                      </TableCell>

                      {/* Actions : plan (Select → changerPlan), détails, suspendre/réactiver, supprimer */}
                      <TableCell className="pr-4" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1.5">
                          <Select value={p.plan} onValueChange={(v) => executerAction("changerPlan", p, v)}>
                            <SelectTrigger
                              className="h-8 w-[104px] text-xs"
                              aria-label={`Changer le plan de ${p.nomEtablissement}`}
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="STARTER">Starter</SelectItem>
                              <SelectItem value="PRO">Pro</SelectItem>
                              <SelectItem value="ENTERPRISE">Enterprise</SelectItem>
                            </SelectContent>
                          </Select>
                          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Voir les détails" onClick={() => setDetail(p)}>
                            <Eye className="h-4 w-4" aria-hidden />
                          </Button>
                          {p.suspendu ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-green-700 hover:bg-green-50"
                              aria-label={`Réactiver ${p.nomEtablissement}`}
                              onClick={() => setConfirmation({ action: "reactiver", pro: p })}
                            >
                              <RotateCcw className="h-4 w-4" aria-hidden />
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-amber-700 hover:bg-amber-50"
                              aria-label={`Suspendre ${p.nomEtablissement}`}
                              onClick={() => setConfirmation({ action: "suspendre", pro: p })}
                            >
                              <Ban className="h-4 w-4" aria-hidden />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                            aria-label={`Supprimer ${p.nomEtablissement}`}
                            onClick={() => setConfirmation({ action: "supprimer", pro: p })}
                          >
                            <Trash2 className="h-4 w-4" aria-hidden />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ---------- Dialog : fiche détaillée du commerçant ---------- */}
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="sm:max-w-lg">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 pr-6">
                  <span className="truncate">{detail.nomEtablissement}</span>
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
                  ["Type d'établissement", detail.typeEtablissement || "—"],
                  ["Ville", detail.ville || "—"],
                  ["Plan", nomPlan(detail.plan)],
                  ["Zones de contact", String(detail.zones)],
                  ["Retours reçus", String(detail.retours)],
                  ["Employés", String(detail.employes)],
                  ["Inscrit le", formatDate(detail.createdAt)],
                ].map(([label, valeur]) => (
                  <div key={label} className="flex items-start justify-between gap-4 rounded-lg border px-3 py-2">
                    <span className="text-muted-foreground shrink-0">{label}</span>
                    <span className="font-medium text-right break-all">{valeur}</span>
                  </div>
                ))}
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
                <AlertDialogDescription>
                  {CONFIRM_META[confirmation.action].description(confirmation.pro)}
                </AlertDialogDescription>
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

      {/* ---------- Dialog : Ajouter un commerçant ---------- */}
      <Dialog open={dialogAjout} onOpenChange={(o) => !o && setDialogAjout(false)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-blue-600" aria-hidden />
              Ajouter un commerçant
            </DialogTitle>
            <DialogDescription>
              Crée un compte Pro prêt à l&apos;emploi (zone « Accueil » incluse). Le commerçant pourra se connecter
              immédiatement avec l&apos;email et le mot de passe ci-dessous.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={soumettreAjout} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="ajout-nom">Nom de l&apos;établissement *</Label>
              <Input
                id="ajout-nom"
                value={formAjout.nomEtablissement}
                onChange={(e) => setFormAjout({ ...formAjout, nomEtablissement: e.target.value })}
                maxLength={80}
                placeholder="Ex : Pizzeria Da Mario"
                required
                autoFocus
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="ajout-email">Email *</Label>
                <Input
                  id="ajout-email"
                  type="email"
                  value={formAjout.email}
                  onChange={(e) => setFormAjout({ ...formAjout, email: e.target.value })}
                  maxLength={120}
                  placeholder="ex@etablissement.fr"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ajout-password">Mot de passe *</Label>
                <Input
                  id="ajout-password"
                  type="text"
                  value={formAjout.password}
                  onChange={(e) => setFormAjout({ ...formAjout, password: e.target.value })}
                  maxLength={72}
                  placeholder="6 caractères minimum"
                  required
                  minLength={6}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="ajout-type">Type d&apos;établissement *</Label>
                <Select
                  value={formAjout.typeEtablissement}
                  onValueChange={(v) => v && setFormAjout({ ...formAjout, typeEtablissement: v })}
                >
                  <SelectTrigger id="ajout-type" className="h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TYPES_ETABLISSEMENT.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ajout-ville">Ville *</Label>
                <Input
                  id="ajout-ville"
                  value={formAjout.ville}
                  onChange={(e) => setFormAjout({ ...formAjout, ville: e.target.value })}
                  maxLength={80}
                  placeholder="Ex : Lyon"
                  required
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ajout-adresse">Adresse *</Label>
              <Input
                id="ajout-adresse"
                value={formAjout.adresse}
                onChange={(e) => setFormAjout({ ...formAjout, adresse: e.target.value })}
                maxLength={200}
                placeholder="Ex : 12 rue de la République"
                required
                minLength={5}
              />
              <p className="text-xs text-muted-foreground">Adresse physique de l&apos;établissement (visible par le commerçant).</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ajout-plan">Plan d&apos;abonnement *</Label>
              <Select
                value={formAjout.plan}
                onValueChange={(v) => v && setFormAjout({ ...formAjout, plan: v as PlanId })}
              >
                <SelectTrigger id="ajout-plan" className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="STARTER">Starter — 29 €/mois</SelectItem>
                  <SelectItem value="PRO">Pro — 99 €/mois</SelectItem>
                  <SelectItem value="ENTERPRISE">Enterprise — 249 €/mois</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Le compte est créé en STARTER puis basculé immédiatement sur le plan choisi.
              </p>
            </div>
            <DialogFooter className="gap-2 sm:gap-0 pt-2">
              <Button type="button" variant="outline" onClick={() => setDialogAjout(false)} disabled={envoiAjout}>
                Annuler
              </Button>
              <Button type="submit" className="bg-blue-600 hover:bg-blue-700" disabled={envoiAjout}>
                {envoiAjout && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden />}
                Créer le compte
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ============================================================
// Sous-onglet Commandes (workflow d'impression + PDF + expédition)
// PDF : STICKERS_50 → planche d'étiquettes · chevalet/affiche → bon d'impression
// ============================================================

function CommandesTab({ onModifie }: { onModifie: () => void }) {
  const [commandes, setCommandes] = useState<CommandeLigne[]>([])
  const [fStatut, setFStatut] = useState("all")
  const [loading, setLoading] = useState(true)
  const [majEnCours, setMajEnCours] = useState<string | null>(null)
  const [expedition, setExpedition] = useState<CommandeLigne | null>(null)
  const [numeroSuivi, setNumeroSuivi] = useState("")
  const { toast } = useToast()

  /** Nom du commerçant (tolérant aux deux nomenclatures pendant le pivot) */
  function nomPro(c: CommandeLigne): string {
    return c.pro?.nomEtablissement ?? c.pro?.nomCommerce ?? "—"
  }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = fStatut !== "all" ? `?statut=${fStatut}` : ""
      const res = await fetch(`/api/admin/commandes${params}`, { cache: "no-store" })
      const json = await res.json()
      if (json.ok) {
        setCommandes(enArray(json.data.commandes))
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

  // PATCH /api/admin/commandes { id, statut, numeroSuivi? }
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

  /** Passage au statut EXPEDIE : ouvre le dialog du numéro de suivi (obligatoire) */
  function surChangementStatut(c: CommandeLigne, statut: string) {
    if (statut === "EXPEDIE" && c.statut !== "EXPEDIE") {
      setNumeroSuivi(c.numeroSuivi ?? "")
      setExpedition(c)
    } else {
      changerStatut(c.id, statut)
    }
  }

  /**
   * Génère le PDF de la commande :
   *  - STICKERS_50 → planche d'étiquettes 5x5 cm (generateLabelsPdf)
   *  - CHEVALET_ACRYLIQUE / AFFICHE_A4 → bon d'impression (generateCommandePdf)
   * Le QR de scan est imprimé quand un token est disponible (pro ou zone).
   */
  async function telechargerPdf(c: CommandeLigne) {
    const nomPro = c.pro?.nomEtablissement ?? c.pro?.nomCommerce ?? ""
    const token = c.pro?.qrToken || c.zone?.qrToken || ""
    try {
      const url = `${window.location.origin}${token ? `/r/${token}` : "/"}`
      const qrDataUrl = await QRCode.toDataURL(url, {
        width: 600,
        margin: 1,
        errorCorrectionLevel: "H",
        color: { dark: "#0f172a", light: "#ffffff" },
      })
      if (c.typeSupport === "STICKERS_50") {
        // Planche d'étiquettes 5x5 cm (20 autocollants)
        generateLabelsPdf(qrDataUrl, nomPro)
      } else {
        // Bon d'impression — objet `pro` compatible avec les deux signatures de src/lib/pdf.ts
        const proPdf = {
          nomEtablissement: nomPro,
          nomCommerce: nomPro,
          ville: c.pro?.ville ?? "",
          email: c.pro?.email ?? "",
        } as unknown as Parameters<typeof generateCommandePdf>[1]
        generateCommandePdf(c, proPdf, qrDataUrl)
      }
      toast({ title: "PDF généré ✓" })
    } catch {
      toast({ title: "Erreur", description: "Génération du PDF impossible", variant: "destructive" })
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
        <p className="text-sm text-muted-foreground">
          {commandes.length} commande{commandes.length > 1 ? "s" : ""}
        </p>
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
                        {nomPro(c)} · {c.pro?.email}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground flex items-center gap-1">
                        <MapPin className="h-3 w-3 shrink-0" aria-hidden /> {c.adresseLivraison}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Commandé le {formatDate(c.createdAt)} · {c.prixEuros} €{c.quantite > 1 ? ` · ${c.quantite} unités` : ""}
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

      {/* ---------- Dialog : expédition + numéro de suivi (obligatoire) ---------- */}
      <Dialog open={!!expedition} onOpenChange={(o) => !o && setExpedition(null)}>
        <DialogContent className="sm:max-w-md">
          {expedition && (
            <>
              <DialogHeader>
                <DialogTitle>Marquer la commande comme expédiée</DialogTitle>
                <DialogDescription>
                  {SUPPORTS[expedition.typeSupport as TypeSupportId]?.label} pour {nomPro(expedition)}. Renseignez le
                  numéro de suivi du transporteur — il sera visible par le commerçant.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                <Label htmlFor="numero-suivi">Numéro de suivi *</Label>
                <Input
                  id="numero-suivi"
                  placeholder="Ex. 6A12345678901"
                  value={numeroSuivi}
                  onChange={(e) => setNumeroSuivi(e.target.value)}
                  maxLength={100}
                  required
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setExpedition(null)}>
                  Annuler
                </Button>
                <Button onClick={confirmerExpedition} disabled={majEnCours === expedition.id || !numeroSuivi.trim()}>
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
        if (j.ok) {
          // Normalisation défensive des champs du contrat
          setData({
            caAbonnementsMensuel: j.data.caAbonnementsMensuel ?? j.data.caAbonnements ?? 0,
            caSupportsTotal: j.data.caSupportsTotal ?? 0,
            caSupportsParType: j.data.caSupportsParType ?? {},
            evolutionMensuelle: j.data.evolutionMensuelle ?? [],
          })
        } else {
          toast({ title: "Erreur", description: "Impossible de charger les revenus", variant: "destructive" })
        }
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
          hint="MRR des plans actifs (29/99/249 €)"
          hintTone="up"
        />
        <StatCard
          icon={Package}
          label="CA supports physiques"
          value={`${data.caSupportsTotal} €`}
          hint="Total des commandes"
        />
        {(Object.keys(SUPPORTS) as TypeSupportId[]).map((t) => (
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
                <Bar dataKey="abonnements" name="Abonnements (MRR)" fill="#2563eb" radius={[4, 4, 0, 0]} />
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
