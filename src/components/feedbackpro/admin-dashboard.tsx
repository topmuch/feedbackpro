"use client"

// ============================================================
// FeedbackPro - Dashboard Superadmin (pivot Zones, Coach IA)
// Onglets : Vue d'ensemble · Commerçants · Commandes · Revenus · Paramètres
// URLs synchronisées : /superadmin/<slug> (rewritées vers /?admin=1&tabAdmin=…)
// Contrats : GET /api/admin/overview, /api/admin/pros (POST actions),
// /api/admin/commandes (PATCH), /api/admin/revenus, /api/admin/settings
// ============================================================

import { useCallback, useEffect, useRef, useState } from "react"

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
  MailOpen,
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
  Users,
  KeyRound,
  Download,
  Send,
  Shield,
  Activity,
  ClipboardList,
  Save,
  Palette,
  Puzzle,
  ExternalLink,
  Megaphone,
  ImagePlus,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Skeleton } from "@/components/ui/skeleton"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
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
import { NotificationsBell } from "@/components/feedbackpro/notifications-bell"
import { ThemeToggle } from "@/components/theme-toggle"
import { LanguageSelector } from "@/components/feedbackpro/language-selector"
import { exportToCsv } from "@/lib/export-csv"
import { cn } from "@/lib/utils"
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

type OngletAdmin =
  | "globale"
  | "commercants"
  | "utilisateurs"
  | "commandes"
  | "revenus"
  | "messages"
  | "parametres"
  | "email"
  | "secteurs"
  | "retention"
  | "modules"
  | "publicites"

const ONGLETS: { id: OngletAdmin; labelKey: string; icone: React.ComponentType<{ className?: string }> }[] = [
  { id: "globale", labelKey: "nav.overview", icone: LayoutDashboard },
  { id: "commercants", labelKey: "nav.commercants", icone: Store },
  { id: "utilisateurs", labelKey: "nav.utilisateurs", icone: Users },
  { id: "commandes", labelKey: "nav.commandes", icone: Package },
  { id: "revenus", labelKey: "nav.revenus", icone: Wallet },
  { id: "retention", labelKey: "nav.retention", icone: Activity },
  { id: "secteurs", labelKey: "nav.secteurs", icone: ClipboardList },
  { id: "modules", labelKey: "nav.modules", icone: Puzzle },
  { id: "messages", labelKey: "nav.messages", icone: Mail },
  { id: "email", labelKey: "nav.email", icone: Send },
  { id: "parametres", labelKey: "nav.parametres", icone: Settings },
  { id: "publicites", labelKey: "nav.publicites", icone: Megaphone },
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
  if (typeof window === "undefined") return "globale"
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
  // Module abonnement_multi_sites : revenu KPI dédié (somme des prix de
  // plan des Pros avec proId non-null). Affiché seulement si le module est actif.
  revenuMultiSites?: number
  modulesActifs?: string[]
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
  abonnementDebut: string | null
  abonnementFin: string | null
  zones: number
  retours: number
  employes: number
  // Task 4 — White-label : infos de personnalisation marque blanche
  whiteLabel?: boolean
  brandName?: string | null
  brandColor?: string | null
  brandLogoUrl?: string | null
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
  // Task 2 — Référencement SEO (éditable depuis l'onglet Paramètres)
  metaTitle: string
  metaDescription: string
  metaKeywords: string
  ogTitle: string
  ogDescription: string
}

// Couleurs des graphiques (palette bleu FeedbackPro)
const COULEURS_PLANS: Record<string, string> = {
  STARTER: "#94a3b8",
  PRO: "#0047c7",
  ENTERPRISE: "#5257C9",
  FRANCHISE: "#d97706", // ambre — distinct des autres plans
}
const COULEURS_SUPPORTS = ["#5257C9", "#0047c7", "#1e3a8a"]

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
  const t = (key: string) => { const map: Record<string, string> = {"nav.overview": "Vue d'ensemble", "nav.commercants": "Commercants", "nav.utilisateurs": "Utilisateurs", "nav.commandes": "Commandes", "nav.revenus": "Revenus", "nav.retention": "Retention", "nav.secteurs": "Config. secteurs", "nav.modules": "Modules", "nav.messages": "Messages", "nav.email": "Email", "nav.parametres": "Parametres", "nav.publicites": "Publicités", "nav.superadmin": "Superadmin", "nav.gestion": "Gestion", "common.navigationAdmin": "Sections administration", "common.ouvrirMenu": "Ouvrir le menu", "common.deconnexion": "Deconnexion", "common.connecteSuperadmin": "Connecte en superadmin", "dashboard.titreAdmin": "Administration FeedbackPro"}; return map[key] || key }
  const [onglet, setOnglet] = useState<OngletAdmin>(() => ongletDepuisUrl())
  const [overview, setOverview] = useState<OverviewApi | null>(null)
  const [menuOuvert, setMenuOuvert] = useState(false)
  // Task 3c — compteur de messages non lus affiché en badge sur la sidebar
  const [messagesNonLus, setMessagesNonLus] = useState(0)
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

  // Task 3c — charge le compteur de messages non lus (rafraîchi quand on
  // bascule sur l'onglet Messages pour réagir aux "marquer comme lu").
  async function loadMessagesNonLus() {
    try {
      const res = await fetch("/api/admin/messages", { cache: "no-store" })
      const json = await res.json()
      if (json.ok) setMessagesNonLus(json.data.nonLus ?? 0)
    } catch {
      /* silencieux : le badge reste à 0 */
    }
  }

  // Chargement différé (hors du corps de l'effet pour éviter les cascades de rendus)
  useEffect(() => {
    const t = setTimeout(() => {
      loadOverview()
      loadMessagesNonLus()
    }, 0)
    return () => clearTimeout(t)
  }, [])

  // À chaque entrée dans l'onglet Messages : on rafraîchit le compteur
  // (l'onglet lui-même recharge sa liste, mais le badge doit aussi se mettre à jour).
  // setTimeout(0) pour éviter un setState synchrone dans l'effet (lint react-hooks).
  useEffect(() => {
    if (onglet !== "messages") return
    const t = setTimeout(() => {
      loadMessagesNonLus()
    }, 0)
    return () => clearTimeout(t)
  }, [onglet])

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
  const titreOnglet = ongletCourant ? t(ongletCourant.labelKey) : t("nav.overview")
  const emailAdmin = session?.user?.email ?? ""

  return (
    <div className="relative flex min-h-screen flex-col bg-[#E9E9EF] lg:pl-72 lg:pr-3">
      {/* ---------- Pastilles décoratives floues (vert + indigo) ---------- */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="absolute -left-32 -top-24 h-[28rem] w-[28rem] rounded-full bg-[#4CC96B]/15 blur-3xl" />
        <div className="absolute -right-24 -top-16 h-[24rem] w-[24rem] rounded-full bg-[#5257C9]/10 blur-3xl" />
      </div>
      {/* ---------- Sidebar détachée (desktop lg+) ---------- */}
      <aside className="fixed inset-y-4 left-4 z-40 hidden w-64 flex-col rounded-3xl bg-[#5257C9] text-white shadow-[0_10px_30px_rgba(0,0,0,0.06)] lg:flex">
        <ContenuSidebarAdmin
          ongletActif={onglet}
          onNaviguer={naviguer}
          emailAdmin={emailAdmin}
          onLogout={logout}
          messagesNonLus={messagesNonLus}
        />
      </aside>

      {/* ---------- Top bar discrète (card blanc arrondie) ---------- */}
      <header className="sticky top-4 z-30 mx-3 mt-4 lg:mx-0">
        <div className="flex h-14 items-center justify-between gap-3 rounded-2xl bg-card px-4 shadow-[0_10px_30px_rgba(0,0,0,0.06)] sm:h-16 sm:px-5">
          <div className="flex min-w-0 items-center gap-2.5">
            <Sheet open={menuOuvert} onOpenChange={setMenuOuvert}>
              <SheetContent side="left" className="w-72 border-0 bg-[#5257C9] p-0 text-white" aria-describedby={undefined}>
                <SheetTitle className="sr-only">{t("common.navigationAdmin")}</SheetTitle>
                <ContenuSidebarAdmin
                  ongletActif={onglet}
                  onNaviguer={naviguer}
                  emailAdmin={emailAdmin}
                  onLogout={logout}
                  messagesNonLus={messagesNonLus}
                />
              </SheetContent>
            </Sheet>
            <Button
              variant="ghost"
              size="icon"
              className="text-foreground hover:bg-muted lg:hidden"
              onClick={() => setMenuOuvert(true)}
              aria-label={t("common.ouvrirMenu")}
            >
              <Menu className="h-5 w-5" aria-hidden />
            </Button>
            <div className="min-w-0">
              <p className="truncate font-semibold text-[#1E1E2E]">{titreOnglet}</p>
              <p className="hidden truncate text-xs text-[#9A9AAE] sm:block">{t("dashboard.titreAdmin")}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <Badge variant="secondary" className="hidden sm:inline-flex">{t("nav.superadmin")}</Badge>
            <LanguageSelector tone="light" />
            <NotificationsBell tone="light" />
            <ThemeToggle />
            <span className="hidden text-sm text-[#9A9AAE] md:block max-w-48 truncate">{emailAdmin}</span>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => logout()}
              aria-label={t("common.deconnexion")}
            >
              <LogOut className="h-4.5 w-4.5" aria-hidden />
            </Button>
          </div>
        </div>
      </header>

      {/* ---------- Contenu ---------- */}
      <main className="w-full flex-1 px-4 sm:px-6 lg:px-8 py-5 sm:py-7 space-y-6">
        {onglet === "globale" && <GlobaleTab overview={overview} />}
        {onglet === "commercants" && <ProsTab onModifie={loadOverview} />}
        {onglet === "utilisateurs" && <UtilisateursTab />}
        {onglet === "commandes" && <CommandesTab onModifie={loadOverview} />}
        {onglet === "revenus" && <RevenusTab />}
        {onglet === "retention" && <RetentionTab />}
        {onglet === "secteurs" && <SecteursTab />}
        {onglet === "modules" && <ModulesTab />}
        {onglet === "messages" && <MessagesTab onApresAction={loadMessagesNonLus} />}
        {onglet === "email" && <EmailTab />}
        {onglet === "parametres" && <ParametresTab />}
        {onglet === "publicites" && <PublicitesTab />}
      </main>
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
  messagesNonLus = 0,
}: {
  ongletActif: OngletAdmin
  onNaviguer: (o: OngletAdmin) => void
  emailAdmin: string
  onLogout: () => void
  messagesNonLus?: number
}) {
  const t = (key: string) => { const map: Record<string, string> = {"nav.overview": "Vue d'ensemble", "nav.commercants": "Commercants", "nav.utilisateurs": "Utilisateurs", "nav.commandes": "Commandes", "nav.revenus": "Revenus", "nav.retention": "Retention", "nav.secteurs": "Config. secteurs", "nav.modules": "Modules", "nav.messages": "Messages", "nav.email": "Email", "nav.parametres": "Parametres", "nav.publicites": "Publicités", "nav.superadmin": "Superadmin", "nav.gestion": "Gestion", "common.navigationAdmin": "Sections administration", "common.ouvrirMenu": "Ouvrir le menu", "common.deconnexion": "Deconnexion", "common.connecteSuperadmin": "Connecte en superadmin", "dashboard.titreAdmin": "Administration FeedbackPro"}; return map[key] || key }
  return (
    <div className="flex h-full flex-col">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 py-5">
        <img
          src="/logo-feedbackpro-transparent.png"
          alt="FeedbackPro"
          className="h-10 w-auto brightness-0 invert"
        />
        <span className="text-xs text-white/70">Administration</span>
      </div>

      {/* Navigation verticale */}
      <nav aria-label={t("common.navigationAdmin")} className="flex flex-col gap-1 px-3 py-2">
        {ONGLETS.map((o) => {
          const Icone = o.icone
          const actif = ongletActif === o.id
          // Task 3c — badge compteur de messages non lus sur l'onglet Messages
          const badge =
            o.id === "messages" && messagesNonLus > 0 ? (
              <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 text-[10px] font-bold text-white">
                {messagesNonLus > 9 ? "9+" : messagesNonLus}
              </span>
            ) : null
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => onNaviguer(o.id)}
              aria-current={actif ? "page" : undefined}
              className={`flex h-11 shrink-0 items-center gap-3 rounded-2xl px-3.5 text-[11px] font-semibold uppercase tracking-wide transition-colors ${
                actif
                  ? "-mr-2 bg-white text-[#1E1E2E] shadow-[0_6px_18px_rgba(0,0,0,0.08)]"
                  : "text-white/80 hover:bg-white/10 hover:text-white"
              }`}
            >
              <Icone className="h-[18px] w-[18px] shrink-0" aria-hidden />
              <span className="truncate">{t(o.labelKey)}</span>
              {badge}
            </button>
          )
        })}
      </nav>

      {/* Bas de sidebar : email + déconnexion */}
      <div className="mt-auto border-t border-white/10 p-3">
        <div className="rounded-2xl px-3 py-2 text-xs text-white/70">
          <p className="truncate">{emailAdmin || "—"}</p>
          <p className="mt-0.5 text-white/50">{t("common.connecteSuperadmin")}</p>
        </div>
        <Button
          variant="ghost"
          className="mt-1 w-full justify-start gap-2 rounded-2xl text-white/90 hover:bg-white/10 hover:text-white"
          onClick={onLogout}
        >
          <LogOut className="h-4 w-4" aria-hidden />
          {t("common.deconnexion")}
        </Button>
      </div>
    </div>
  )
}

// ============================================================
// Sous-onglet Vue d'ensemble (4 KPI + croissance + top 10 + plans)
// ============================================================

// ---------- KPI multicolore (carte avec gradient de fond) ----------

function ColoredKpi({
  icon: Icon,
  label,
  value,
  hint,
  gradient,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string | number
  hint?: string
  gradient: string
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-3xl bg-gradient-to-br ${gradient} p-6 text-white shadow-md`}
    >
      {/* Décoration : cercle translucide en arrière-plan */}
      <div
        className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-white/10"
        aria-hidden
      />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-white/85 truncate">{label}</p>
          <p className="text-2xl sm:text-3xl font-bold tracking-tight mt-1.5">{value}</p>
          {hint && <p className="text-xs text-white/80 mt-2">{hint}</p>}
        </div>
        <div className="shrink-0 rounded-2xl bg-white/20 p-2.5" aria-hidden>
          <Icon className="h-5 w-5 text-white" />
        </div>
      </div>
    </div>
  )
}

function GlobaleTab({ overview }: { overview: OverviewApi | null }) {
  if (!overview) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-3xl" />
          ))}
        </div>
        <Skeleton className="h-72 rounded-3xl" />
        <Skeleton className="h-72 rounded-3xl" />
      </div>
    )
  }

  const totalPros = overview.totalPros ?? 0
  const prosActifs = overview.prosActifs ?? 0
  const mrr = overview.mrr ?? 0
  const commandesEnCours = overview.commandesEnCours ?? 0
  // Module abonnement_multi_sites : KPI revenu multi-sites (affiché
  // seulement si le module est actif côté superadmin).
  const moduleMultiSitesActif = Array.isArray(overview.modulesActifs) ? overview.modulesActifs.includes("abonnement_multi_sites") : false
  const revenuMultiSites = overview.revenuMultiSites ?? 0

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
      {/* ---------- 4 KPI multicolores ---------- */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <ColoredKpi
          icon={Store}
          label="Pros total"
          value={totalPros}
          hint={`${prosActifs} actifs`}
          gradient="from-blue-500 to-blue-700"
        />
        <ColoredKpi
          icon={CheckCircle2}
          label="Pros actifs"
          value={prosActifs}
          hint="Comptes non suspendus"
          gradient="from-emerald-500 to-emerald-700"
        />
        <ColoredKpi
          icon={Euro}
          label="MRR abonnements"
          value={`${mrr} €`}
          hint="29/99/249/199 € par plan"
          gradient="from-amber-500 to-orange-600"
        />
        <ColoredKpi
          icon={Package}
          label="Commandes en cours"
          value={commandesEnCours}
          hint={commandesEnCours > 0 ? "À imprimer ou expédier" : "Tout est traité"}
          gradient="from-violet-500 to-purple-700"
        />
      </div>

      {/* ---------- Module abonnement_multi_sites : KPI Revenu multi-sites ----------
          Affiché seulement si le module est activé. Compte la somme des
          prix de plan des Pros avec proId non-null (établissements enfants
          d'un groupe multi-sites). */}
      {moduleMultiSitesActif && (
        <Card className="border-amber-300 bg-amber-50/40 shadow-sm dark:border-amber-800/40 dark:bg-amber-950/10">
          <CardContent className="flex items-center gap-4 p-5 sm:p-6">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-sm">
              <Building2 className="h-6 w-6" aria-hidden />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-300">
                Revenu multi-sites · module Franchise
              </p>
              <p className="mt-0.5 text-2xl font-bold tracking-tight text-amber-900 dark:text-amber-200 sm:text-3xl">
                {revenuMultiSites} €
                <span className="ms-1 text-sm font-normal text-amber-700/80 dark:text-amber-300/70">/mois</span>
              </p>
              <p className="mt-1 text-xs text-amber-800/80 dark:text-amber-300/70">
                Somme des prix de plan des Pros rattachés à un groupe multi-établissements (proId non-null).
              </p>
            </div>
          </CardContent>
        </Card>
      )}

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
                    <stop offset="0%" stopColor="#5257C9" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#5257C9" stopOpacity={0.02} />
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
                <Area type="monotone" dataKey="nouveaux" stroke="#5257C9" strokeWidth={2.5} fill="url(#gradPros)" />
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
                  <Bar dataKey="retours" fill="#5257C9" radius={[0, 6, 6, 0]} barSize={18} />
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
  // Task 4 — White-label : dialog de personnalisation marque blanche
  const [dialogWl, setDialogWl] = useState<ProLigne | null>(null)
  const [wlForm, setWlForm] = useState({
    whiteLabel: false,
    brandName: "",
    brandColor: "#5257C9",
    brandLogoUrl: "",
  })
  const [envoiWl, setEnvoiWl] = useState(false)
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

  // Réinitialisation du mot de passe d'un commerçant (POST /api/admin/pros
  // action=resetPassword) → renvoie un mdp temporaire qui est :
  //   - envoyé par email au commerçant (mode démo = log serveur),
  //   - affiché dans un toast au superadmin pour qu'il puisse le communiquer.
  async function executerResetMdp(pro: ProLigne) {
    if (actionEnCours === pro.id) return
    setActionEnCours(pro.id)
    try {
      const res = await fetch("/api/admin/pros", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "resetPassword", id: pro.id }),
      })
      const json = await res.json()
      if (json.ok && json.data?.passwordTemporaire) {
        toast({
          title: "Mot de passe réinitialisé ✓",
          description: `Mdp temporaire de « ${pro.nomEtablissement} » : ${json.data.passwordTemporaire}`,
        })
      } else {
        toast({ title: "Erreur", description: json.error || "Réinitialisation impossible", variant: "destructive" })
      }
    } catch {
      toast({ title: "Erreur", description: "Réinitialisation impossible pour le moment", variant: "destructive" })
    } finally {
      setActionEnCours(null)
    }
  }

  // Filtre par statut appliqué côté client (q et plan sont filtrés côté serveur)
  const visibles = pros.filter((p) =>
    fStatut === "all" ? true : fStatut === "suspendus" ? p.suspendu : !p.suspendu
  )

  // ---------- Task 4 — White-label : ouverture du dialog ----------
  function ouvrirWhiteLabel(pro: ProLigne) {
    setDialogWl(pro)
    setWlForm({
      whiteLabel: pro.whiteLabel ?? false,
      brandName: pro.brandName ?? "",
      brandColor: pro.brandColor || "#5257C9",
      brandLogoUrl: pro.brandLogoUrl ?? "",
    })
  }

  async function sauvegarderWhiteLabel(e: React.FormEvent) {
    e.preventDefault()
    if (!dialogWl || envoiWl) return
    setEnvoiWl(true)
    try {
      const res = await fetch("/api/admin/pros", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "whiteLabel",
          id: dialogWl.id,
          whiteLabel: wlForm.whiteLabel,
          brandName: wlForm.brandName || null,
          brandColor: wlForm.brandColor || null,
          brandLogoUrl: wlForm.brandLogoUrl || null,
        }),
      })
      const json = await res.json()
      if (json.ok) {
        // Met à jour la ligne dans la liste
        setPros((prev) =>
          prev.map((p) =>
            p.id === dialogWl.id
              ? {
                  ...p,
                  whiteLabel: json.data.whiteLabel,
                  brandName: json.data.brandName,
                  brandColor: json.data.brandColor,
                  brandLogoUrl: json.data.brandLogoUrl,
                }
              : p
          )
        )
        toast({
          title: wlForm.whiteLabel ? "Mode White-label activé ✓" : "Mode White-label désactivé ✓",
          description: `Personnalisation marque blanche de « ${dialogWl.nomEtablissement} » mise à jour.`,
        })
        setDialogWl(null)
      } else {
        toast({ title: "Erreur", description: json.error || "Échec de la mise à jour", variant: "destructive" })
      }
    } catch {
      toast({ title: "Erreur", description: "Mise à jour impossible pour le moment", variant: "destructive" })
    } finally {
      setEnvoiWl(false)
    }
  }

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
              variant="outline"
              size="sm"
              className="h-10 shrink-0 gap-1.5"
              onClick={() =>
                exportToCsv(
                  `commercants-${new Date().toISOString().slice(0, 10)}`,
                  visibles.map((p) => ({
                    Etablissement: p.nomEtablissement,
                    Email: p.email,
                    Type: p.typeEtablissement,
                    Ville: p.ville,
                    Plan: nomPlan(p.plan),
                    Statut: p.suspendu ? "Suspendu" : "Actif",
                    Zones: p.zones,
                    Retours: p.retours,
                    Employes: p.employes,
                    AbonnementDebut: p.abonnementDebut ? formatDate(p.abonnementDebut) : "",
                    AbonnementFin: p.abonnementFin ? formatDate(p.abonnementFin) : "",
                    InscritLe: formatDate(p.createdAt),
                  }))
                )
              }
              disabled={visibles.length === 0}
              aria-label="Exporter en CSV"
            >
              <Download className="h-4 w-4" aria-hidden />
              <span className="hidden sm:inline">Exporter CSV</span>
              <span className="sm:hidden">CSV</span>
            </Button>
            <Button
              className="h-10 shrink-0 gap-1.5 bg-primary hover:bg-primary/90"
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
            <Skeleton key={i} className="h-16 rounded-3xl" />
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
              <Table className="min-w-[1240px]">
                <TableHeader>
                  <TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableHead className="pl-4">Établissement</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Ville</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead className="text-center">Zones</TableHead>
                    <TableHead className="text-center">Retours</TableHead>
                    <TableHead>Début abo.</TableHead>
                    <TableHead>Fin abo.</TableHead>
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
                        <Badge variant="outline" className="max-w-32 truncate text-stone-600 dark:text-stone-300">
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

                      {/* Date début abonnement */}
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {p.abonnementDebut ? formatDate(p.abonnementDebut) : "—"}
                      </TableCell>

                      {/* Date fin abonnement (+ alerte si dépassé) */}
                      <TableCell className="whitespace-nowrap text-xs">
                        {p.abonnementFin ? (
                          new Date(p.abonnementFin) < new Date() ? (
                            <Badge variant="outline" className="text-rose-700 border-rose-300 dark:text-rose-300 dark:border-rose-800">
                              Expiré
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">{formatDate(p.abonnementFin)}</span>
                          )
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>

                      {/* Statut actif / suspendu */}
                      <TableCell>
                        {p.suspendu ? (
                          <Badge variant="outline" className="text-rose-700 border-rose-300 dark:text-rose-300 dark:border-rose-800">
                            Suspendu
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-green-700 border-green-300 dark:text-green-300 dark:border-green-800">
                            Actif
                          </Badge>
                        )}
                      </TableCell>

                      {/* Actions : plan (Select → changerPlan), détails, reset mdp, suspendre/réactiver, supprimer */}
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
                          {/* Task 4 — Mode White-label : ouvre le dialog de personnalisation marque blanche */}
                          <Button
                            variant="ghost"
                            size="icon"
                            className={`h-8 w-8 ${
                              p.whiteLabel
                                ? "bg-violet-100 text-violet-700 hover:bg-violet-200 dark:bg-violet-950/40 dark:text-violet-300"
                                : "text-violet-700 hover:bg-violet-50 dark:text-violet-300 dark:hover:bg-violet-900/40"
                            }`}
                            aria-label={`Mode White-label de ${p.nomEtablissement}`}
                            title={p.whiteLabel ? "White-label activé" : "Mode White-label"}
                            onClick={() => ouvrirWhiteLabel(p)}
                          >
                            <Palette className="h-4 w-4" aria-hidden />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-blue-700 hover:bg-blue-50 dark:text-blue-300 dark:hover:bg-blue-900/40"
                            aria-label={`Réinitialiser le mot de passe de ${p.nomEtablissement}`}
                            disabled={actionEnCours === p.id}
                            onClick={() => executerResetMdp(p)}
                          >
                            {actionEnCours === p.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                            ) : (
                              <KeyRound className="h-4 w-4" aria-hidden />
                            )}
                          </Button>
                          {p.suspendu ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-green-700 hover:bg-green-50 dark:text-green-300 dark:hover:bg-green-900/40"
                              aria-label={`Réactiver ${p.nomEtablissement}`}
                              onClick={() => setConfirmation({ action: "reactiver", pro: p })}
                            >
                              <RotateCcw className="h-4 w-4" aria-hidden />
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-amber-700 hover:bg-amber-50 dark:text-amber-300 dark:hover:bg-amber-900/40"
                              aria-label={`Suspendre ${p.nomEtablissement}`}
                              onClick={() => setConfirmation({ action: "suspendre", pro: p })}
                            >
                              <Ban className="h-4 w-4" aria-hidden />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:text-rose-400 dark:hover:bg-rose-900/40 dark:hover:text-rose-300"
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
                    <Badge variant="outline" className="shrink-0 text-rose-700 border-rose-300 dark:text-rose-300 dark:border-rose-800">
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
              <Button type="submit" className="bg-primary hover:bg-primary/90" disabled={envoiAjout}>
                {envoiAjout && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden />}
                Créer le compte
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ---------- Task 4 — Dialog : Mode White-label ---------- */}
      <Dialog open={!!dialogWl} onOpenChange={(o) => !o && setDialogWl(null)}>
        <DialogContent className="sm:max-w-lg">
          {dialogWl && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Palette className="h-5 w-5 text-violet-600" aria-hidden />
                  Mode White-label — {dialogWl.nomEtablissement}
                </DialogTitle>
                <DialogDescription>
                  Personnalisez l&apos;apparence de la page de scan pour cet établissement (agence).
                  Si le mode est activé, le nom, la couleur et le logo remplacent ceux de FeedbackPro.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={sauvegarderWhiteLabel} className="space-y-4">
                {/* Toggle principal */}
                <div className="flex items-center justify-between gap-4 rounded-xl border p-3.5">
                  <div className="min-w-0">
                    <Label htmlFor="wl-toggle" className="cursor-pointer">
                      Activer le mode White-label
                    </Label>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Remplace « FeedbackPro » par votre marque sur la page de scan client.
                    </p>
                  </div>
                  <Switch
                    id="wl-toggle"
                    checked={wlForm.whiteLabel}
                    onCheckedChange={(v) => setWlForm({ ...wlForm, whiteLabel: v })}
                    aria-label="Activer le mode White-label"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="wl-name">Nom de la marque</Label>
                    <Input
                      id="wl-name"
                      value={wlForm.brandName}
                      onChange={(e) => setWlForm({ ...wlForm, brandName: e.target.value })}
                      placeholder="FeedbackPro"
                      maxLength={80}
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Affiché dans le pied de page (sinon « FeedbackPro »).
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="wl-color">Couleur primaire</Label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={wlForm.brandColor}
                        onChange={(e) => setWlForm({ ...wlForm, brandColor: e.target.value })}
                        className="h-10 w-12 shrink-0 cursor-pointer rounded-md border"
                        aria-label="Sélecteur de couleur"
                      />
                      <Input
                        id="wl-color"
                        value={wlForm.brandColor}
                        onChange={(e) => setWlForm({ ...wlForm, brandColor: e.target.value })}
                        maxLength={20}
                        className="font-mono text-sm"
                      />
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Remplace #002e85 partout sur la page de scan.
                    </p>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="wl-logo">URL du logo de marque</Label>
                  <Input
                    id="wl-logo"
                    type="url"
                    value={wlForm.brandLogoUrl}
                    onChange={(e) => setWlForm({ ...wlForm, brandLogoUrl: e.target.value })}
                    placeholder="https://…/logo.png"
                    maxLength={500}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Remplace le logo FeedbackPro dans le pied de page. Laissez vide pour conserver le texte.
                  </p>
                  {/* Aperçu live */}
                  {wlForm.brandLogoUrl && (
                    <div className="flex items-center gap-2 rounded-lg border bg-muted/30 p-2.5">
                      <img
                        src={wlForm.brandLogoUrl}
                        alt="Aperçu logo"
                        className="h-8 w-auto"
                        onError={(e) => {
                          ;(e.currentTarget as HTMLImageElement).style.display = "none"
                        }}
                      />
                      <span className="text-xs text-muted-foreground">Aperçu du logo</span>
                    </div>
                  )}
                </div>

                <DialogFooter className="gap-2 sm:gap-0 pt-2">
                  <Button type="button" variant="outline" onClick={() => setDialogWl(null)} disabled={envoiWl}>
                    Annuler
                  </Button>
                  <Button type="submit" disabled={envoiWl}>
                    {envoiWl && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden />}
                    <Save className="mr-1.5 h-4 w-4" aria-hidden />
                    Enregistrer
                  </Button>
                </DialogFooter>
              </form>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ============================================================
// Sous-onglet Utilisateurs (tous les comptes User)
// Lister · suspendre/réactiver · changer rôle · supprimer · reset mdp
// ============================================================

type UserLigne = {
  id: string
  email: string
  role: string // SUPERADMIN | PRO
  suspendu: boolean
  createdAt: string
  derniereConnexion: string | null
  pro: { id: string; nomEtablissement: string } | null
}

function UtilisateursTab() {
  const [users, setUsers] = useState<UserLigne[]>([])
  const [q, setQ] = useState("")
  const [fRole, setFRole] = useState<"all" | "PRO" | "SUPERADMIN">("all")
  const [fStatut, setFStatut] = useState<"all" | "actifs" | "suspendus">("all")
  const [loading, setLoading] = useState(true)
  const [actionEnCours, setActionEnCours] = useState<string | null>(null)
  const [confirmSuppression, setConfirmSuppression] = useState<UserLigne | null>(null)
  const { toast } = useToast()

  // ---------- Dialog "Ajouter un utilisateur" ----------
  const [dialogAjout, setDialogAjout] = useState(false)
  const [formAjout, setFormAjout] = useState({
    email: "",
    password: "",
    role: "PRO" as "PRO" | "SUPERADMIN",
    nomEtablissement: "",
    typeEtablissement: "Restaurant",
    ville: "",
    adresse: "",
  })
  const [erreurAjout, setErreurAjout] = useState<string | null>(null)
  const [ajoutEnCours, setAjoutEnCours] = useState(false)

  function reinitialiserFormAjout() {
    setFormAjout({
      email: "",
      password: "",
      role: "PRO",
      nomEtablissement: "",
      typeEtablissement: "Restaurant",
      ville: "",
      adresse: "",
    })
    setErreurAjout(null)
  }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (fRole !== "all") params.set("role", fRole)
      if (fStatut !== "all") params.set("statut", fStatut)
      if (q.trim()) params.set("q", q.trim())
      const res = await fetch(`/api/admin/users?${params}`, { cache: "no-store" })
      const json = await res.json()
      if (json.ok) {
        setUsers(json.data.users)
      }
    } catch {
      toast({ title: "Erreur", description: "Impossible de charger les utilisateurs", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }, [fRole, fStatut, q, toast])

  useEffect(() => {
    const t = setTimeout(load, 300)
    return () => clearTimeout(t)
  }, [load])

  async function executerAction(action: "suspendre" | "reactiver" | "changerRole" | "supprimer" | "resetPassword", user: UserLigne, role?: string) {
    setActionEnCours(user.id)
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, id: user.id, ...(role ? { role } : {}) }),
      })
      const json = await res.json()
      if (json.ok) {
        if (action === "supprimer") {
          setUsers((prev) => prev.filter((u) => u.id !== user.id))
          toast({ title: "Utilisateur supprimé", description: user.email })
        } else if (action === "changerRole") {
          setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, role: role ?? u.role } : u)))
          toast({ title: `Rôle mis à jour : ${role}` })
        } else if (action === "suspendre" || action === "reactiver") {
          setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, suspendu: action === "suspendre" } : u)))
          toast({
            title: action === "suspendre" ? "Utilisateur suspendu" : "Utilisateur réactivé",
            description: user.email,
          })
        } else if (action === "resetPassword") {
          toast({
            title: "Mot de passe réinitialisé ✓",
            description: `Mdp temporaire de ${user.email} : ${json.data?.passwordTemporaire ?? "—"}`,
          })
        }
        setConfirmSuppression(null)
      } else {
        toast({ title: "Erreur", description: json.error || "Action impossible", variant: "destructive" })
      }
    } catch {
      toast({ title: "Erreur", description: "Action impossible pour le moment", variant: "destructive" })
    } finally {
      setActionEnCours(null)
    }
  }

  // ---------- Création d'un utilisateur (action: "creer") ----------
  async function creerUtilisateur(e: React.FormEvent) {
    e.preventDefault()
    setErreurAjout(null)
    setAjoutEnCours(true)
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "creer", ...formAjout }),
      })
      const json = await res.json()
      if (json.ok) {
        toast({
          title: "Utilisateur créé ✓",
          description: `${formAjout.email} (${formAjout.role})`,
        })
        setDialogAjout(false)
        reinitialiserFormAjout()
        await load()
      } else {
        setErreurAjout(json.error || "Création impossible")
      }
    } catch {
      setErreurAjout("Impossible de contacter le serveur")
    } finally {
      setAjoutEnCours(false)
    }
  }

  const visibles = users

  return (
    <div className="space-y-4">
      {/* ---------- Recherche + filtres + export ---------- */}
      <Card>
        <CardContent className="p-4 flex flex-col lg:flex-row gap-2.5">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              placeholder="Rechercher (email, établissement)…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="pl-8 h-10"
              aria-label="Rechercher un utilisateur"
            />
          </div>
          <div className="flex flex-col sm:flex-row gap-2.5">
            <Select value={fRole} onValueChange={(v) => setFRole(v as typeof fRole)}>
              <SelectTrigger className="h-10 sm:w-44" aria-label="Filtrer par rôle">
                <SelectValue placeholder="Rôle" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les rôles</SelectItem>
                <SelectItem value="PRO">PRO</SelectItem>
                <SelectItem value="SUPERADMIN">Superadmin</SelectItem>
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
              size="sm"
              className="h-10 shrink-0 gap-1.5"
              onClick={() => {
                reinitialiserFormAjout()
                setDialogAjout(true)
              }}
              aria-label="Ajouter un utilisateur"
            >
              <Plus className="h-4 w-4" aria-hidden />
              <span className="hidden sm:inline">Ajouter un utilisateur</span>
              <span className="sm:hidden">Ajouter</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-10 shrink-0 gap-1.5"
              onClick={() =>
                exportToCsv(
                  `utilisateurs-${new Date().toISOString().slice(0, 10)}`,
                  visibles.map((u) => ({
                    Email: u.email,
                    Role: u.role,
                    Etablissement: u.pro?.nomEtablissement ?? "",
                    Statut: u.suspendu ? "Suspendu" : "Actif",
                    InscritLe: formatDate(u.createdAt),
                    DerniereConnexion: u.derniereConnexion ? formatDate(u.derniereConnexion) : "Jamais",
                  }))
                )
              }
              disabled={visibles.length === 0}
              aria-label="Exporter en CSV"
            >
              <Download className="h-4 w-4" aria-hidden />
              <span className="hidden sm:inline">Exporter CSV</span>
              <span className="sm:hidden">CSV</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ---------- Tableau des utilisateurs ---------- */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-3xl" />
          ))}
        </div>
      ) : visibles.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">Aucun utilisateur trouvé.</CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden py-0">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table className="min-w-[920px]">
                <TableHeader>
                  <TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableHead className="pl-4">Email</TableHead>
                    <TableHead>Rôle</TableHead>
                    <TableHead>Établissement</TableHead>
                    <TableHead>Inscrit le</TableHead>
                    <TableHead>Dernière connexion</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead className="pr-4 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibles.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell className="pl-4 max-w-56 truncate font-medium">{u.email}</TableCell>
                      <TableCell>
                        {u.role === "SUPERADMIN" ? (
                          <Badge variant="outline" className="text-blue-700 border-blue-300 dark:text-blue-300 dark:border-blue-800">
                            <Shield className="mr-1 h-3 w-3" aria-hidden />
                            Superadmin
                          </Badge>
                        ) : (
                          <Badge variant="secondary">PRO</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {u.pro?.nomEtablissement ?? "—"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {formatDate(u.createdAt)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {u.derniereConnexion ? formatDate(u.derniereConnexion) : "Jamais"}
                      </TableCell>
                      <TableCell>
                        {u.suspendu ? (
                          <Badge variant="outline" className="text-rose-700 border-rose-300 dark:text-rose-300 dark:border-rose-800">
                            Suspendu
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-green-700 border-green-300 dark:text-green-300 dark:border-green-800">
                            Actif
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="pr-4" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Changer le rôle (PRO ↔ SUPERADMIN) */}
                          <Select
                            value={u.role}
                            onValueChange={(v) => executerAction("changerRole", u, v)}
                          >
                            <SelectTrigger
                              className="h-8 w-[120px] text-xs"
                              aria-label={`Changer le rôle de ${u.email}`}
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="PRO">PRO</SelectItem>
                              <SelectItem value="SUPERADMIN">Superadmin</SelectItem>
                            </SelectContent>
                          </Select>
                          {/* Reset mot de passe */}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-blue-700 hover:bg-blue-50 dark:text-blue-300 dark:hover:bg-blue-900/40"
                            aria-label={`Réinitialiser le mot de passe de ${u.email}`}
                            disabled={actionEnCours === u.id}
                            onClick={() => executerAction("resetPassword", u)}
                          >
                            {actionEnCours === u.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                            ) : (
                              <KeyRound className="h-4 w-4" aria-hidden />
                            )}
                          </Button>
                          {/* Suspendre / Réactiver */}
                          {u.suspendu ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-green-700 hover:bg-green-50 dark:text-green-300 dark:hover:bg-green-900/40"
                              aria-label={`Réactiver ${u.email}`}
                              disabled={actionEnCours === u.id}
                              onClick={() => executerAction("reactiver", u)}
                            >
                              <RotateCcw className="h-4 w-4" aria-hidden />
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-amber-700 hover:bg-amber-50 dark:text-amber-300 dark:hover:bg-amber-900/40"
                              aria-label={`Suspendre ${u.email}`}
                              disabled={actionEnCours === u.id}
                              onClick={() => executerAction("suspendre", u)}
                            >
                              <Ban className="h-4 w-4" aria-hidden />
                            </Button>
                          )}
                          {/* Supprimer */}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:text-rose-400 dark:hover:bg-rose-900/40 dark:hover:text-rose-300"
                            aria-label={`Supprimer ${u.email}`}
                            disabled={actionEnCours === u.id}
                            onClick={() => setConfirmSuppression(u)}
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

      {/* ---------- AlertDialog : confirmation suppression ---------- */}
      <AlertDialog open={!!confirmSuppression} onOpenChange={(o) => !o && setConfirmSuppression(null)}>
        <AlertDialogContent>
          {confirmSuppression && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>Supprimer définitivement cet utilisateur ?</AlertDialogTitle>
                <AlertDialogDescription>
                  Cette action est irréversible : le compte <strong>{confirmSuppression.email}</strong>
                  {confirmSuppression.pro ? ` et l'établissement « ${confirmSuppression.pro.nomEtablissement} »` : ""}
                  {" "}seront supprimés définitivement (avec toutes les données associées).
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={actionEnCours === confirmSuppression.id}>Annuler</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-rose-600 hover:bg-rose-700 text-white"
                  disabled={actionEnCours === confirmSuppression.id}
                  onClick={(e) => {
                    e.preventDefault()
                    executerAction("supprimer", confirmSuppression)
                  }}
                >
                  {actionEnCours === confirmSuppression.id && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden />}
                  Supprimer définitivement
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>

      {/* ---------- Dialog : Ajouter un utilisateur ---------- */}
      <Dialog
        open={dialogAjout}
        onOpenChange={(o) => {
          setDialogAjout(o)
          if (!o) reinitialiserFormAjout()
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5 text-primary" aria-hidden />
              Ajouter un utilisateur
            </DialogTitle>
            <DialogDescription>
              Crée un compte manuellement. Aucune session n&apos;est attachée : vous restez connecté·e en tant que superadmin.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={creerUtilisateur} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="ajout-email">Email</Label>
                <Input
                  id="ajout-email"
                  type="email"
                  autoComplete="off"
                  required
                  value={formAjout.email}
                  onChange={(e) => setFormAjout((f) => ({ ...f, email: e.target.value }))}
                  placeholder="nouveau@etablissement.fr"
                  className="h-10"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ajout-password">Mot de passe</Label>
                <Input
                  id="ajout-password"
                  type="text"
                  autoComplete="off"
                  required
                  minLength={6}
                  value={formAjout.password}
                  onChange={(e) => setFormAjout((f) => ({ ...f, password: e.target.value }))}
                  placeholder="6 caractères minimum"
                  className="h-10"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ajout-role">Rôle</Label>
                <Select
                  value={formAjout.role}
                  onValueChange={(v) => setFormAjout((f) => ({ ...f, role: v as "PRO" | "SUPERADMIN" }))}
                >
                  <SelectTrigger id="ajout-role" className="h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PRO">PRO (commerçant)</SelectItem>
                    <SelectItem value="SUPERADMIN">Superadmin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Champs établissement (uniquement si rôle PRO) */}
            {formAjout.role === "PRO" && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-lg border bg-muted/30 p-3">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="ajout-nom">Nom de l&apos;établissement</Label>
                  <Input
                    id="ajout-nom"
                    required
                    value={formAjout.nomEtablissement}
                    onChange={(e) => setFormAjout((f) => ({ ...f, nomEtablissement: e.target.value }))}
                    placeholder="Ex : Le Petit Bistrot"
                    className="h-10"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ajout-type">Type d&apos;établissement</Label>
                  <Select
                    value={formAjout.typeEtablissement}
                    onValueChange={(v) => { if (v) setFormAjout((f) => ({ ...f, typeEtablissement: v })) }}
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
                  <Label htmlFor="ajout-ville">Ville</Label>
                  <Input
                    id="ajout-ville"
                    required
                    value={formAjout.ville}
                    onChange={(e) => setFormAjout((f) => ({ ...f, ville: e.target.value }))}
                    placeholder="Ex : Lyon"
                    className="h-10"
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="ajout-adresse">Adresse</Label>
                  <Input
                    id="ajout-adresse"
                    required
                    value={formAjout.adresse}
                    onChange={(e) => setFormAjout((f) => ({ ...f, adresse: e.target.value }))}
                    placeholder="Ex : 12 rue de la République"
                    className="h-10"
                  />
                </div>
              </div>
            )}

            {erreurAjout && (
              <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950/60 dark:text-rose-300" role="alert">
                {erreurAjout}
              </p>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                disabled={ajoutEnCours}
                onClick={() => setDialogAjout(false)}
              >
                Annuler
              </Button>
              <Button type="submit" disabled={ajoutEnCours}>
                {ajoutEnCours && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden />}
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
// Sous-onglet Email & API (clés Resend / Twilio / Stripe / cron)
// ============================================================

type SettingsMap = Record<string, string>

function EmailTab() {
  const [valeurs, setValeurs] = useState<SettingsMap | null>(null)
  const [masques, setMasques] = useState<Record<string, boolean>>({})
  const [chargement, setChargement] = useState(true)
  const [enregistrement, setEnregistrement] = useState(false)
  const [envoiTest, setEnvoiTest] = useState(false)
  const { toast } = useToast()

  // Champs gérés par ce formulaire (avancés)
  const CHAMPS: { key: string; label: string; placeholder: string; type?: "password" | "text" }[] = [
    { key: "RESEND_API_KEY", label: "Clé API Resend", placeholder: "re_…", type: "password" },
    { key: "EMAIL_FROM", label: "Expéditeur (EMAIL_FROM)", placeholder: "FeedbackPro <bonjour@feedbackpro.fr>" },
    { key: "TWILIO_SID", label: "Twilio Account SID", placeholder: "AC…" },
    { key: "TWILIO_TOKEN", label: "Twilio Auth Token", placeholder: "••••••••", type: "password" },
    { key: "TWILIO_PHONE", label: "Téléphone Twilio", placeholder: "+33…" },
    { key: "STRIPE_SECRET_KEY", label: "Stripe Secret Key", placeholder: "sk_live_…", type: "password" },
    { key: "STRIPE_WEBHOOK_SECRET", label: "Stripe Webhook Secret", placeholder: "whsec_…", type: "password" },
    { key: "STRIPE_PRICE_STARTER", label: "Stripe Price ID — Starter (29€)", placeholder: "price_…" },
    { key: "STRIPE_PRICE_PRO", label: "Stripe Price ID — Pro (99€)", placeholder: "price_…" },
    { key: "STRIPE_PRICE_ENTERPRISE", label: "Stripe Price ID — Enterprise (249€)", placeholder: "price_…" },
    { key: "CRON_SECRET", label: "Secret cron (Vercel)", placeholder: "••••••••", type: "password" },
  ]

  useEffect(() => {
    let annule = false
    fetch("/api/admin/settings", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (annule) return
        if (j.ok) {
          const liste: { key: string; value: string; masque?: boolean }[] = j.data.settings
          const map: SettingsMap = {}
          const m: Record<string, boolean> = {}
          for (const s of liste) {
            map[s.key] = s.value
            m[s.key] = !!s.masque
          }
          setValeurs(map)
          setMasques(m)
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
  }, [toast])

  async function enregistrer(e: React.FormEvent) {
    e.preventDefault()
    if (!valeurs || enregistrement) return
    setEnregistrement(true)
    try {
      const body: Record<string, string> = {}
      for (const c of CHAMPS) {
        const v = (valeurs[c.key] ?? "").trim()
        // Ne pas envoyer les valeurs masquées non modifiées (contenant ••••)
        if (v && !v.includes("••••")) {
          body[c.key] = v
        } else if (v === "") {
          body[c.key] = "" // autorise la suppression d'une valeur
        }
      }
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (json.ok) {
        // Met à jour l'état local avec les valeurs masquées renvoyées par l'API
        const liste: { key: string; value: string; masque?: boolean }[] = json.data.settings
        const map: SettingsMap = { ...valeurs }
        const m: Record<string, boolean> = { ...masques }
        for (const s of liste) {
          map[s.key] = s.value
          m[s.key] = !!s.masque
        }
        setValeurs(map)
        setMasques(m)
        toast({ title: "Réglages enregistrés ✓" })
      } else {
        toast({ title: "Erreur", description: json.error, variant: "destructive" })
      }
    } catch {
      toast({ title: "Erreur", description: "Enregistrement impossible", variant: "destructive" })
    } finally {
      setEnregistrement(false)
    }
  }

  async function testerEmail() {
    if (envoiTest) return
    setEnvoiTest(true)
    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "testEmail" }),
      })
      const json = await res.json()
      if (json.ok) {
        toast({
          title: "Email test envoyé ✓",
          description: `Vers ${json.data.destinataire} (vérifiez aussi les logs serveur en mode démo).`,
        })
      } else {
        toast({ title: "Échec de l'envoi", description: json.error, variant: "destructive" })
      }
    } catch {
      toast({ title: "Erreur", description: "Test impossible pour le moment", variant: "destructive" })
    } finally {
      setEnvoiTest(false)
    }
  }

  if (chargement || !valeurs) {
    return (
      <div className="space-y-4 max-w-3xl">
        <Skeleton className="h-44 rounded-3xl" />
        <Skeleton className="h-64 rounded-3xl" />
      </div>
    )
  }

  return (
    <form onSubmit={enregistrer} className="space-y-4 max-w-3xl">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base sm:text-lg flex items-center gap-2">
            <Mail className="h-4 w-4 text-blue-600" aria-hidden />
            Email transactionnel (Resend)
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Sans clé API Resend, l&apos;app fonctionne en mode démo (emails simulés = logs serveur).
            Renseignez votre clé pour envoyer de vrais emails.
          </p>
        </CardHeader>
        <CardContent className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label htmlFor="set-resend-key">Clé API Resend</Label>
            <Input
              id="set-resend-key"
              type="password"
              placeholder="re_…"
              value={valeurs.RESEND_API_KEY ?? ""}
              onChange={(e) => setValeurs({ ...valeurs, RESEND_API_KEY: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              {masques.RESEND_API_KEY && valeurs.RESEND_API_KEY
                ? "Clé déjà enregistrée (saisissez une nouvelle valeur pour la remplacer)."
                : "Disponible sur votre compte Resend → API Keys."}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="set-email-from">Expéditeur (EMAIL_FROM)</Label>
            <Input
              id="set-email-from"
              placeholder="FeedbackPro <bonjour@feedbackpro.fr>"
              value={valeurs.EMAIL_FROM ?? ""}
              onChange={(e) => setValeurs({ ...valeurs, EMAIL_FROM: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">Doit être un domaine vérifié dans Resend.</p>
          </div>
          <Button type="button" variant="outline" onClick={testerEmail} disabled={envoiTest} className="gap-1.5">
            {envoiTest ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
            Tester l&apos;envoi email
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base sm:text-lg">SMS WhatsApp (Twilio)</CardTitle>
          <p className="text-sm text-muted-foreground">Pour les alertes temps réel (notes ≤ 2)</p>
        </CardHeader>
        <CardContent className="space-y-4 pt-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="set-twilio-sid">Twilio Account SID</Label>
              <Input
                id="set-twilio-sid"
                placeholder="AC…"
                value={valeurs.TWILIO_SID ?? ""}
                onChange={(e) => setValeurs({ ...valeurs, TWILIO_SID: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="set-twilio-token">Twilio Auth Token</Label>
              <Input
                id="set-twilio-token"
                type="password"
                placeholder="••••••••"
                value={valeurs.TWILIO_TOKEN ?? ""}
                onChange={(e) => setValeurs({ ...valeurs, TWILIO_TOKEN: e.target.value })}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="set-twilio-phone">Téléphone Twilio</Label>
            <Input
              id="set-twilio-phone"
              placeholder="+33…"
              value={valeurs.TWILIO_PHONE ?? ""}
              onChange={(e) => setValeurs({ ...valeurs, TWILIO_PHONE: e.target.value })}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base sm:text-lg">Paiement (Stripe)</CardTitle>
          <p className="text-sm text-muted-foreground">Clés API + price IDs par plan</p>
        </CardHeader>
        <CardContent className="space-y-4 pt-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="set-stripe-secret">Stripe Secret Key</Label>
              <Input
                id="set-stripe-secret"
                type="password"
                placeholder="sk_live_…"
                value={valeurs.STRIPE_SECRET_KEY ?? ""}
                onChange={(e) => setValeurs({ ...valeurs, STRIPE_SECRET_KEY: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="set-stripe-webhook">Stripe Webhook Secret</Label>
              <Input
                id="set-stripe-webhook"
                type="password"
                placeholder="whsec_…"
                value={valeurs.STRIPE_WEBHOOK_SECRET ?? ""}
                onChange={(e) => setValeurs({ ...valeurs, STRIPE_WEBHOOK_SECRET: e.target.value })}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="set-stripe-starter">Price ID — Starter</Label>
              <Input
                id="set-stripe-starter"
                placeholder="price_…"
                value={valeurs.STRIPE_PRICE_STARTER ?? ""}
                onChange={(e) => setValeurs({ ...valeurs, STRIPE_PRICE_STARTER: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="set-stripe-pro">Price ID — Pro</Label>
              <Input
                id="set-stripe-pro"
                placeholder="price_…"
                value={valeurs.STRIPE_PRICE_PRO ?? ""}
                onChange={(e) => setValeurs({ ...valeurs, STRIPE_PRICE_PRO: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="set-stripe-ent">Price ID — Enterprise</Label>
              <Input
                id="set-stripe-ent"
                placeholder="price_…"
                value={valeurs.STRIPE_PRICE_ENTERPRISE ?? ""}
                onChange={(e) => setValeurs({ ...valeurs, STRIPE_PRICE_ENTERPRISE: e.target.value })}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base sm:text-lg">Sécurité cron</CardTitle>
          <p className="text-sm text-muted-foreground">Secret partagé pour appeler les endpoints /api/cron/*</p>
        </CardHeader>
        <CardContent className="space-y-2 pt-2">
          <div className="space-y-1.5">
            <Label htmlFor="set-cron-secret">CRON_SECRET</Label>
            <Input
              id="set-cron-secret"
              type="password"
              placeholder="••••••••"
              value={valeurs.CRON_SECRET ?? ""}
              onChange={(e) => setValeurs({ ...valeurs, CRON_SECRET: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              Les routes cron vérifient l&apos;en-tête <code>authorization: Bearer &lt;CRON_SECRET&gt;</code>.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" disabled={enregistrement}>
          {enregistrement && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden />}
          Enregistrer les réglages
        </Button>
      </div>
    </form>
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
        <div className="flex flex-wrap items-center gap-2">
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
          <Button
            variant="outline"
            size="sm"
            className="h-10 gap-1.5"
            onClick={() =>
              exportToCsv(
                `commandes-${new Date().toISOString().slice(0, 10)}`,
                commandes.map((c) => ({
                  Reference: c.id.slice(-8).toUpperCase(),
                  Commerce: c.pro?.nomEtablissement ?? c.pro?.nomCommerce ?? "",
                  Email: c.pro?.email ?? "",
                  Support: SUPPORTS[c.typeSupport as TypeSupportId]?.label ?? c.typeSupport,
                  Quantite: c.quantite,
                  PrixEuros: c.prixEuros,
                  AdresseLivraison: c.adresseLivraison,
                  Statut: STATUT_COMMANDE_LABEL[c.statut] ?? c.statut,
                  NumeroSuivi: c.numeroSuivi ?? "",
                  CommandeLe: formatDate(c.createdAt),
                }))
              )
            }
            disabled={commandes.length === 0}
            aria-label="Exporter en CSV"
          >
            <Download className="h-4 w-4" aria-hidden />
            Exporter CSV
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          {commandes.length} commande{commandes.length > 1 ? "s" : ""}
        </p>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-3xl" />
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
                          <Badge variant="outline" className="text-emerald-700 border-emerald-300 font-normal gap-1 dark:text-emerald-300 dark:border-emerald-800">
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
                          ? "text-green-700 border-green-300 dark:text-green-300 dark:border-green-800"
                          : c.statut === "A_IMPRIMER"
                            ? "text-rose-700 border-rose-300 dark:text-rose-300 dark:border-rose-800"
                            : "text-amber-700 border-amber-300 dark:text-amber-300 dark:border-amber-800"
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
            <Skeleton key={i} className="h-28 rounded-3xl" />
          ))}
        </div>
        <Skeleton className="h-72 rounded-3xl" />
        <Skeleton className="h-72 rounded-3xl" />
      </div>
    )
  }

  const camembert = (Object.keys(SUPPORTS) as TypeSupportId[])
    .map((t) => ({ nom: SUPPORTS[t].label, ca: data.caSupportsParType[t] ?? 0 }))
    .filter((d) => d.ca > 0)

  return (
    <div className="space-y-6">
      {/* ---------- Bandeau : titre + export CSV ---------- */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Revenus</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            CA abonnements (MRR) et supports physiques.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-10 gap-1.5"
          onClick={() => {
            const lignes: Record<string, unknown>[] = []
            // KPIs globaux
            lignes.push({ Indicateur: "CA abonnements mensuel (€)", Valeur: data.caAbonnementsMensuel })
            lignes.push({ Indicateur: "CA supports total (€)", Valeur: data.caSupportsTotal })
            for (const t of Object.keys(SUPPORTS) as TypeSupportId[]) {
              lignes.push({
                Indicateur: `CA ${SUPPORTS[t].label} (€)`,
                Valeur: data.caSupportsParType[t] ?? 0,
              })
            }
            // Évolution mensuelle (une ligne par mois)
            for (const m of data.evolutionMensuelle ?? []) {
              lignes.push({
                Indicateur: `${m.mois} — Abonnements (€)`,
                Valeur: m.abonnements ?? 0,
              })
              lignes.push({
                Indicateur: `${m.mois} — Supports (€)`,
                Valeur: m.supports ?? 0,
              })
            }
            exportToCsv(`revenus-${new Date().toISOString().slice(0, 10)}`, lignes)
          }}
          aria-label="Exporter en CSV"
        >
          <Download className="h-4 w-4" aria-hidden />
          Exporter CSV
        </Button>
      </div>

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
                <Bar dataKey="abonnements" name="Abonnements (MRR)" fill="#5257C9" radius={[4, 4, 0, 0]} />
                <Bar dataKey="supports" name="Supports" fill="#0047c7" radius={[4, 4, 0, 0]} />
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
            // Task 2 — champs SEO (vides par défaut = fallback metadata layout)
            metaTitle: map.metaTitle ?? "",
            metaDescription: map.metaDescription ?? "",
            metaKeywords: map.metaKeywords ?? "",
            ogTitle: map.ogTitle ?? "",
            ogDescription: map.ogDescription ?? "",
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
          // Task 2 — champs SEO
          metaTitle: valeurs.metaTitle.trim(),
          metaDescription: valeurs.metaDescription.trim(),
          metaKeywords: valeurs.metaKeywords.trim(),
          ogTitle: valeurs.ogTitle.trim(),
          ogDescription: valeurs.ogDescription.trim(),
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
        <Skeleton className="h-44 rounded-3xl" />
        <Skeleton className="h-64 rounded-3xl" />
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

      {/* Task 2 — Référencement SEO (titre, description, mots-clés, Open Graph) */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base sm:text-lg">Référencement SEO</CardTitle>
          <p className="text-sm text-muted-foreground">
            Métadonnées affichées dans les résultats Google et sur les réseaux sociaux (Open Graph).
            Laissez vide pour conserver les valeurs par défaut.
          </p>
        </CardHeader>
        <CardContent className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="set-meta-title">Titre SEO</Label>
              <span className="text-[11px] text-muted-foreground">{valeurs.metaTitle.length}/60</span>
            </div>
            <Input
              id="set-meta-title"
              value={valeurs.metaTitle}
              onChange={(e) => setValeurs({ ...valeurs, metaTitle: e.target.value })}
              maxLength={60}
              placeholder="FeedbackPro — Le Coach IA d'Audit Qualité Continu"
            />
            <p className="text-xs text-muted-foreground">Recommandé : 50 à 60 caractères.</p>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="set-meta-desc">Description SEO</Label>
              <span className="text-[11px] text-muted-foreground">{valeurs.metaDescription.length}/160</span>
            </div>
            <Textarea
              id="set-meta-desc"
              rows={3}
              value={valeurs.metaDescription}
              onChange={(e) => setValeurs({ ...valeurs, metaDescription: e.target.value })}
              maxLength={160}
              placeholder="FeedbackPro transforme chaque client en auditeur qualité…"
            />
            <p className="text-xs text-muted-foreground">Recommandé : 150 à 160 caractères.</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="set-meta-kw">Mots-clés SEO</Label>
            <Input
              id="set-meta-kw"
              value={valeurs.metaKeywords}
              onChange={(e) => setValeurs({ ...valeurs, metaKeywords: e.target.value })}
              maxLength={300}
              placeholder="audit qualité, client mystère, QR code feedback, restaurant"
            />
            <p className="text-xs text-muted-foreground">Séparés par des virgules (300 caractères max).</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="set-og-title">Titre Open Graph (Facebook / LinkedIn)</Label>
            <Input
              id="set-og-title"
              value={valeurs.ogTitle}
              onChange={(e) => setValeurs({ ...valeurs, ogTitle: e.target.value })}
              maxLength={80}
              placeholder="FeedbackPro — Le Coach IA d'Audit Qualité Continu"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="set-og-desc">Description Open Graph</Label>
            <Textarea
              id="set-og-desc"
              rows={2}
              value={valeurs.ogDescription}
              onChange={(e) => setValeurs({ ...valeurs, ogDescription: e.target.value })}
              maxLength={200}
              placeholder="Chaque client réel devient un Client Mystère : scan QR, note, tags, et un rapport IA quotidien."
            />
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

// ============================================================
// Feature 1 — Carte « Publicités Aéroport » (model AirportAd)
// ------------------------------------------------------------
// Section intégrée au sous-onglet Paramètres (pas de tab dédié).
// Permet au superadmin de :
//   - voir la liste des pubs (titre, active, impressions, clicks)
//   - créer une nouvelle pub (titre, sous-titre, image, lien, CTA)
//   - toggle active/inactive (PATCH /api/airport/ads/[id])
//   - supprimer une pub (DELETE /api/airport/ads/[id])
//
// APIs :
//   GET    /api/airport/ads           → liste complète avec stats
//   POST   /api/airport/ads           → création
//   PATCH  /api/airport/ads/[id]      → toggle active
//   DELETE /api/airport/ads/[id]      → suppression
// ============================================================

type AirportAdLigne = {
  id: string
  title: string
  subtitle: string | null
  imageUrl: string | null
  linkUrl: string | null
  ctaText: string
  active: boolean
  clicks: number
  impressions: number
  createdAt: string
  updatedAt: string
}

function AirportAdsCard() {
  const { toast } = useToast()
  const [ads, setAds] = useState<AirportAdLigne[]>([])
  const [chargement, setChargement] = useState(true)
  const [actionId, setActionId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [showForm, setShowForm] = useState(false)

  // Champs du formulaire de création
  const [fTitle, setFTitle] = useState("")
  const [FSubtitle, setFSubtitle] = useState("")
  const [fImageUrl, setFImageUrl] = useState("")
  const [fLinkUrl, setFLinkUrl] = useState("")
  const [fCtaText, setFCtaText] = useState("En savoir plus")

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/airport/ads?all=true", { cache: "no-store" })
      const json = (await res.json()) as { ok: boolean; data?: { ads: AirportAdLigne[] }; error?: string }
      if (json.ok && json.data) {
        setAds(json.data.ads)
      } else {
        toast({ title: "Erreur", description: json.error ?? "Chargement impossible", variant: "destructive" })
      }
    } catch {
      toast({ title: "Erreur", description: "Chargement impossible", variant: "destructive" })
    } finally {
      setChargement(false)
    }
  }, [toast])

  useEffect(() => {
    load()
  }, [load])

  async function creerAd(e: React.FormEvent) {
    e.preventDefault()
    if (creating) return
    const titre = fTitle.trim()
    if (!titre) {
      toast({ title: "Titre requis", variant: "destructive" })
      return
    }
    setCreating(true)
    try {
      const res = await fetch("/api/airport/ads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: titre,
          subtitle: FSubtitle.trim() || null,
          imageUrl: fImageUrl.trim() || null,
          linkUrl: fLinkUrl.trim() || null,
          ctaText: fCtaText.trim() || "En savoir plus",
          active: true,
        }),
      })
      const json = (await res.json()) as { ok: boolean; error?: string }
      if (json.ok) {
        toast({ title: "Publicité créée ✓" })
        setFTitle("")
        setFSubtitle("")
        setFImageUrl("")
        setFLinkUrl("")
        setFCtaText("En savoir plus")
        setShowForm(false)
        await load()
      } else {
        toast({ title: "Erreur", description: json.error ?? "Création impossible", variant: "destructive" })
      }
    } catch {
      toast({ title: "Erreur", description: "Création impossible", variant: "destructive" })
    } finally {
      setCreating(false)
    }
  }

  async function toggleActive(ad: AirportAdLigne) {
    setActionId(ad.id)
    try {
      const res = await fetch(`/api/airport/ads/${encodeURIComponent(ad.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !ad.active }),
      })
      const json = (await res.json()) as { ok: boolean; error?: string }
      if (json.ok) {
        setAds((prev) => prev.map((a) => (a.id === ad.id ? { ...a, active: !ad.active } : a)))
        toast({ title: ad.active ? "Publicité désactivée" : "Publicité activée ✓" })
      } else {
        toast({ title: "Erreur", description: json.error ?? "Action impossible", variant: "destructive" })
      }
    } catch {
      toast({ title: "Erreur", description: "Action impossible", variant: "destructive" })
    } finally {
      setActionId(null)
    }
  }

  async function supprimer(ad: AirportAdLigne) {
    if (!window.confirm(`Supprimer la publicité « ${ad.title} » ?`)) return
    setActionId(ad.id)
    try {
      const res = await fetch(`/api/airport/ads/${encodeURIComponent(ad.id)}`, {
        method: "DELETE",
      })
      const json = (await res.json()) as { ok: boolean; error?: string }
      if (json.ok) {
        setAds((prev) => prev.filter((a) => a.id !== ad.id))
        toast({ title: "Publicité supprimée ✓" })
      } else {
        toast({ title: "Erreur", description: json.error ?? "Suppression impossible", variant: "destructive" })
      }
    } catch {
      toast({ title: "Erreur", description: "Suppression impossible", variant: "destructive" })
    } finally {
      setActionId(null)
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base sm:text-lg">Publicités Aéroport</CardTitle>
            <p className="text-sm text-muted-foreground">
              Affichées en plein écran sur l&apos;écran de confirmation de la PWA voyageur, juste avant la sortie.
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            onClick={() => setShowForm((v) => !v)}
            className="shrink-0"
          >
            <Plus className="mr-1 h-4 w-4" aria-hidden />
            {showForm ? "Annuler" : "Nouvelle pub"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-2">
        {showForm && (
          <form onSubmit={creerAd} className="mb-4 space-y-3 rounded-xl border border-border bg-muted/30 p-4">
            <div className="space-y-1.5">
              <Label htmlFor="ad-title">Titre *</Label>
              <Input
                id="ad-title"
                value={fTitle}
                onChange={(e) => setFTitle(e.target.value)}
                maxLength={120}
                required
                placeholder="Ex: -20% sur le Wi-Fi Premium"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ad-subtitle">Sous-titre</Label>
              <Input
                id="ad-subtitle"
                value={FSubtitle}
                onChange={(e) => setFSubtitle(e.target.value)}
                maxLength={200}
                placeholder="Ex: Profitez du code AERO20 à la boutique T2"
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="ad-image">URL Image</Label>
                <Input
                  id="ad-image"
                  type="url"
                  value={fImageUrl}
                  onChange={(e) => setFImageUrl(e.target.value)}
                  placeholder="https://…/promo.jpg"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ad-link">URL Lien CTA</Label>
                <Input
                  id="ad-link"
                  type="url"
                  value={fLinkUrl}
                  onChange={(e) => setFLinkUrl(e.target.value)}
                  placeholder="https://…"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ad-cta">Texte du bouton CTA</Label>
              <Input
                id="ad-cta"
                value={fCtaText}
                onChange={(e) => setFCtaText(e.target.value)}
                maxLength={40}
                placeholder="En savoir plus"
              />
            </div>
            <div className="flex justify-end">
              <Button type="submit" disabled={creating} size="sm">
                {creating && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden />}
                Créer la publicité
              </Button>
            </div>
          </form>
        )}

        {chargement ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Chargement…
          </div>
        ) : ads.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center text-muted-foreground">
            <span className="text-2xl" aria-hidden>
              📺
            </span>
            <p className="text-sm">Aucune publicité pour le moment.</p>
            <p className="text-xs text-muted-foreground/70">
              Cliquez sur « Nouvelle pub » pour créer votre première publicité aéroport.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {ads.map((ad) => (
              <li key={ad.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {ad.imageUrl && (
                      <img
                        src={ad.imageUrl}
                        alt=""
                        className="h-10 w-10 rounded-md border border-border object-cover"
                        loading="lazy"
                      />
                    )}
                    <span className="truncate text-sm font-semibold text-foreground">{ad.title}</span>
                    <Badge
                      variant="outline"
                      className={cn(
                        "shrink-0 text-[10px]",
                        ad.active
                          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600"
                          : "border-muted-foreground/30 bg-muted/40 text-muted-foreground",
                      )}
                    >
                      {ad.active ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                  {ad.subtitle && (
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">{ad.subtitle}</p>
                  )}
                  <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground/80">
                    <span>👁 {ad.impressions} impressions</span>
                    <span>👆 {ad.clicks} clics</span>
                    {ad.linkUrl && (
                      <a
                        href={ad.linkUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-0.5 text-primary underline-offset-2 hover:underline"
                      >
                        Lien <ExternalLink className="h-3 w-3" aria-hidden />
                      </a>
                    )}
                    <span className="font-mono text-muted-foreground/60">#{ad.id.slice(-8)}</span>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <div className="flex items-center gap-1.5">
                    <Switch
                      checked={ad.active}
                      onCheckedChange={() => void toggleActive(ad)}
                      disabled={actionId === ad.id}
                      aria-label={ad.active ? "Désactiver" : "Activer"}
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => void supprimer(ad)}
                      disabled={actionId === ad.id}
                      className="h-8 border-rose-500/30 text-rose-600 hover:bg-rose-500/10 hover:text-rose-700"
                    >
                      {actionId === ad.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" aria-hidden />
                      )}
                      <span className="ml-1 hidden sm:inline">Supprimer</span>
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

// ============================================================
// Onglet dédié « Publicités » (model AirportAd)
// ------------------------------------------------------------
// Onglet complet du dashboard admin pour gérer les publicités
// affichées sur l'écran de confirmation de la PWA aéroport.
//
// Features :
//   - Liste des pubs avec preview image (format 9:16 téléphone)
//   - Création avec upload d'image (POST /api/public/upload) OU URL
//   - Toggle active/inactive
//   - Suppression
//   - Stats impressions/clics
//   - Preview téléphone 9:16 en direct pendant la création
// ============================================================

function PublicitesTab() {
  const { toast } = useToast()
  const [ads, setAds] = useState<AirportAdLigne[]>([])
  const [chargement, setChargement] = useState(true)
  const [actionId, setActionId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [showForm, setShowForm] = useState(false)

  // Champs du formulaire de création
  const [fTitle, setFTitle] = useState("")
  const [FSubtitle, setFSubtitle] = useState("")
  const [fImageUrl, setFImageUrl] = useState("")
  const [fLinkUrl, setFLinkUrl] = useState("")
  const [fCtaText, setFCtaText] = useState("En savoir plus")
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/airport/ads?all=true", { cache: "no-store" })
      const json = (await res.json()) as { ok: boolean; data?: { ads: AirportAdLigne[] }; error?: string }
      if (json.ok && json.data) {
        setAds(json.data.ads ?? [])
      }
    } catch {
      /* silencieux */
    } finally {
      setChargement(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // Upload d'image (format téléphone 9:16) via /api/public/upload
  async function onImageChoisie(e: React.ChangeEvent<HTMLInputElement>) {
    const fichier = e.target.files?.[0]
    e.target.value = ""
    if (!fichier) return
    if (fichier.size > 5 * 1024 * 1024) {
      toast({ title: "Image trop volumineuse", description: "5 Mo maximum", variant: "destructive" })
      return
    }
    if (!fichier.type.startsWith("image/")) {
      toast({ title: "Format non supporté", description: "PNG, JPEG ou WebP", variant: "destructive" })
      return
    }
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append("photo", fichier)
      const res = await fetch("/api/public/upload", { method: "POST", body: fd })
      const json = await res.json().catch(() => null)
      if (res.ok && json?.ok && json.data?.url) {
        setFImageUrl(json.data.url)
        toast({ title: "Image uploadée ✓" })
      } else {
        throw new Error(json?.error ?? "Upload impossible")
      }
    } catch (err) {
      toast({ title: "Upload impossible", description: err instanceof Error ? err.message : "Erreur", variant: "destructive" })
    } finally {
      setUploading(false)
    }
  }

  async function creerAd(e: React.FormEvent) {
    e.preventDefault()
    if (creating) return
    const titre = fTitle.trim()
    if (!titre) {
      toast({ title: "Titre requis", variant: "destructive" })
      return
    }
    setCreating(true)
    try {
      const res = await fetch("/api/airport/ads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: titre,
          subtitle: FSubtitle.trim() || null,
          imageUrl: fImageUrl.trim() || null,
          linkUrl: fLinkUrl.trim() || null,
          ctaText: fCtaText.trim() || "En savoir plus",
          active: true,
        }),
      })
      const json = (await res.json()) as { ok: boolean; error?: string }
      if (json.ok) {
        toast({ title: "Publicité créée ✓" })
        setFTitle("")
        setFSubtitle("")
        setFImageUrl("")
        setFLinkUrl("")
        setFCtaText("En savoir plus")
        setShowForm(false)
        await load()
      } else {
        toast({ title: "Erreur", description: json.error ?? "Création impossible", variant: "destructive" })
      }
    } catch {
      toast({ title: "Erreur", description: "Création impossible", variant: "destructive" })
    } finally {
      setCreating(false)
    }
  }

  async function toggleActive(ad: AirportAdLigne) {
    setActionId(ad.id)
    try {
      const res = await fetch(`/api/airport/ads/${encodeURIComponent(ad.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !ad.active }),
      })
      const json = (await res.json()) as { ok: boolean; error?: string }
      if (json.ok) {
        setAds((prev) => prev.map((a) => (a.id === ad.id ? { ...a, active: !ad.active } : a)))
        toast({ title: ad.active ? "Publicité désactivée" : "Publicité activée ✓" })
      }
    } catch {
      toast({ title: "Erreur", variant: "destructive" })
    } finally {
      setActionId(null)
    }
  }

  async function supprimer(ad: AirportAdLigne) {
    if (!window.confirm(`Supprimer la publicité « ${ad.title} » ?`)) return
    setActionId(ad.id)
    try {
      const res = await fetch(`/api/airport/ads/${encodeURIComponent(ad.id)}`, { method: "DELETE" })
      const json = (await res.json()) as { ok: boolean }
      if (json.ok) {
        setAds((prev) => prev.filter((a) => a.id !== ad.id))
        toast({ title: "Publicité supprimée ✓" })
      }
    } catch {
      toast({ title: "Erreur", variant: "destructive" })
    } finally {
      setActionId(null)
    }
  }

  return (
    <div className="space-y-5 max-w-4xl">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Publicités Aéroport</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Affichées en plein écran sur l'écran de confirmation de la PWA voyageur, juste avant la sortie.
          </p>
        </div>
        <Button onClick={() => setShowForm((v) => !v)} className="shrink-0">
          <Plus className="mr-1.5 h-4 w-4" aria-hidden />
          {showForm ? "Annuler" : "Nouvelle publicité"}
        </Button>
      </div>

      {/* Formulaire de création avec preview téléphone 9:16 */}
      {showForm && (
        <Card className="overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Créer une publicité</CardTitle>
            <p className="text-sm text-muted-foreground">L'image sera affichée au format téléphone (9:16 vertical).</p>
          </CardHeader>
          <CardContent>
            <form onSubmit={creerAd} className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_auto]">
              {/* Champs à gauche */}
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="ad-title">Titre *</Label>
                  <Input id="ad-title" value={fTitle} onChange={(e) => setFTitle(e.target.value)} maxLength={120} required placeholder="Ex: -20% sur le Wi-Fi Premium" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ad-subtitle">Sous-titre</Label>
                  <Input id="ad-subtitle" value={FSubtitle} onChange={(e) => setFSubtitle(e.target.value)} maxLength={200} placeholder="Ex: Code AERO20 à la boutique T2" />
                </div>

                {/* Upload image OU URL */}
                <div className="space-y-2">
                  <Label>Image (format téléphone 9:16)</Label>
                  <input ref={fileInputRef} type="file" accept="image/*" onChange={onImageChoisie} className="sr-only" />
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                      {uploading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden /> : <ImagePlus className="mr-1.5 h-4 w-4" aria-hidden />}
                      {uploading ? "Upload…" : "Télécharger une image"}
                    </Button>
                  </div>
                  {fImageUrl && (
                    <div className="flex items-center gap-2">
                      <Input value={fImageUrl} onChange={(e) => setFImageUrl(e.target.value)} placeholder="URL ou chemin de l'image" className="text-xs" />
                      <Button type="button" size="sm" variant="ghost" onClick={() => setFImageUrl("")} className="shrink-0 text-muted-foreground">
                        <Trash2 className="h-3.5 w-3.5" aria-hidden />
                      </Button>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="ad-link">URL Lien CTA</Label>
                    <Input id="ad-link" type="url" value={fLinkUrl} onChange={(e) => setFLinkUrl(e.target.value)} placeholder="https://…" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="ad-cta">Texte du bouton</Label>
                    <Input id="ad-cta" value={fCtaText} onChange={(e) => setFCtaText(e.target.value)} maxLength={40} placeholder="En savoir plus" />
                  </div>
                </div>

                <Button type="submit" disabled={creating}>
                  {creating && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden />}
                  Créer la publicité
                </Button>
              </div>

              {/* Preview téléphone 9:16 à droite */}
              <div className="flex flex-col items-center gap-2">
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Aperçu</span>
                {/* Mockup téléphone 9:16 */}
                <div className="relative h-[360px] w-[202px] overflow-hidden rounded-[1.75rem] border-[3px] border-slate-800 bg-slate-900 shadow-xl">
                  {/* Notch */}
                  <div className="absolute left-1/2 top-0 z-10 h-5 w-20 -translate-x-1/2 rounded-b-xl bg-slate-800" />
                  {/* Écran */}
                  <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-gradient-to-br from-violet-600 via-purple-600 to-fuchsia-600 p-4 pt-8 text-center">
                    {fImageUrl ? (
                      <img src={fImageUrl} alt="Preview" className="absolute inset-0 h-full w-full object-cover" />
                    ) : (
                      <div className="flex flex-1 items-center justify-center">
                        <ImagePlus className="size-10 text-white/30" aria-hidden />
                      </div>
                    )}
                    {/* Overlay texte en bas */}
                    <div className="absolute inset-x-0 bottom-0 space-y-2 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-4 pt-12">
                      {fTitle && <p className="text-sm font-black text-white">{fTitle}</p>}
                      {FSubtitle && <p className="text-[10px] text-white/80">{FSubtitle}</p>}
                      {fCtaText && (
                        <div className="inline-block rounded-lg bg-white px-3 py-1.5 text-[10px] font-bold text-slate-900">
                          {fCtaText}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <span className="text-[10px] text-muted-foreground">Format 9:16 (202×360px)</span>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Liste des pubs */}
      {chargement ? (
        <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Chargement…
        </div>
      ) : ads.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <Megaphone className="size-12 text-muted-foreground/40" aria-hidden />
            <div>
              <p className="text-sm font-medium text-muted-foreground">Aucune publicité pour le moment</p>
              <p className="mt-1 text-xs text-muted-foreground/70">
                Cliquez sur « Nouvelle publicité » pour créer votre première pub aéroport.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {ads.map((ad) => (
            <Card key={ad.id} className="overflow-hidden">
              {/* Preview image 9:16 */}
              <div className="relative aspect-[9/16] max-h-[280px] overflow-hidden bg-slate-100 dark:bg-slate-800">
                {ad.imageUrl ? (
                  <img src={ad.imageUrl} alt={ad.title} className="h-full w-full object-cover" loading="lazy" />
                ) : (
                  <div className="flex h-full items-center justify-center">
                    <Megaphone className="size-10 text-muted-foreground/30" aria-hidden />
                  </div>
                )}
                {/* Badge active/inactive */}
                <div className="absolute top-2 right-2">
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[10px]",
                      ad.active
                        ? "border-emerald-500/30 bg-emerald-500/90 text-white"
                        : "border-muted-foreground/30 bg-black/60 text-white/70",
                    )}
                  >
                    {ad.active ? "● Active" : "○ Inactive"}
                  </Badge>
                </div>
                {/* Overlay titre */}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent p-3 pt-8">
                  <p className="text-sm font-bold text-white line-clamp-2">{ad.title}</p>
                  {ad.subtitle && <p className="mt-0.5 text-[10px] text-white/70 line-clamp-1">{ad.subtitle}</p>}
                </div>
              </div>
              {/* Stats + actions */}
              <CardContent className="space-y-3 p-3">
                <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                  <span>👁 {ad.impressions}</span>
                  <span>👆 {ad.clicks}</span>
                  {ad.linkUrl && (
                    <a href={ad.linkUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-primary underline-offset-2 hover:underline">
                      Lien <ExternalLink className="h-3 w-3" aria-hidden />
                    </a>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <Switch checked={ad.active} onCheckedChange={() => void toggleActive(ad)} disabled={actionId === ad.id} aria-label={ad.active ? "Désactiver" : "Activer"} />
                  <Button type="button" size="sm" variant="outline" onClick={() => void supprimer(ad)} disabled={actionId === ad.id} className="h-8 border-rose-500/30 text-rose-600 hover:bg-rose-500/10">
                    {actionId === ad.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Trash2 className="h-3.5 w-3.5" aria-hidden />}
                  </Button>
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
// Task 3c — Sous-onglet Messages (model Message)
// ------------------------------------------------------------
// Liste des messages reçus via POST /api/contact (formulaire
// public de /contact). Boutons : « Marquer comme lu » et
// « Supprimer ». Compteur de non-lus remonté à la sidebar.
// ============================================================

type MessageLigne = {
  id: string
  nom: string
  email: string
  sujet: string
  message: string
  lu: boolean
  createdAt: string
}

function MessagesTab({ onApresAction }: { onApresAction: () => void }) {
  const [messages, setMessages] = useState<MessageLigne[]>([])
  const [chargement, setChargement] = useState(true)
  const [selection, setSelection] = useState<string | null>(null)
  const [actionEnCours, setActionEnCours] = useState<string | null>(null)
  const { toast } = useToast()

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/messages", { cache: "no-store" })
      const json = await res.json()
      if (json.ok) {
        setMessages(json.data.messages ?? [])
      }
    } catch {
      toast({ title: "Erreur", description: "Impossible de charger les messages", variant: "destructive" })
    } finally {
      setChargement(false)
    }
  }, [toast])

  useEffect(() => {
    load()
  }, [load])

  async function marquerLu(id: string) {
    setActionEnCours(id)
    try {
      const res = await fetch("/api/admin/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "marquerLu", id }),
      })
      const json = await res.json()
      if (json.ok) {
        setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, lu: true } : m)))
        onApresAction()
      } else {
        toast({ title: "Erreur", description: json.error ?? "Action impossible", variant: "destructive" })
      }
    } catch {
      toast({ title: "Erreur", description: "Action impossible", variant: "destructive" })
    } finally {
      setActionEnCours(null)
    }
  }

  async function supprimer(id: string) {
    setActionEnCours(id)
    try {
      const res = await fetch("/api/admin/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "supprimer", id }),
      })
      const json = await res.json()
      if (json.ok) {
        setMessages((prev) => prev.filter((m) => m.id !== id))
        if (selection === id) setSelection(null)
        onApresAction()
        toast({ title: "Message supprimé ✓" })
      } else {
        toast({ title: "Erreur", description: json.error ?? "Suppression impossible", variant: "destructive" })
      }
    } catch {
      toast({ title: "Erreur", description: "Suppression impossible", variant: "destructive" })
    } finally {
      setActionEnCours(null)
    }
  }

  const messageSelectionne = messages.find((m) => m.id === selection) ?? null
  const nonLus = messages.filter((m) => !m.lu).length

  if (chargement) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-20 rounded-3xl" />
        <Skeleton className="h-96 rounded-3xl" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* ---------- KPI : total / non lus ---------- */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Card className="rounded-3xl border-none shadow-sm">
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground">Total messages</p>
            <p className="mt-1 text-2xl font-bold">{messages.length}</p>
          </CardContent>
        </Card>
        <Card className="rounded-3xl border-none shadow-sm">
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground">Non lus</p>
            <p className="mt-1 text-2xl font-bold text-rose-600">{nonLus}</p>
          </CardContent>
        </Card>
        <Card className="col-span-2 rounded-3xl border-none shadow-sm sm:col-span-1">
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground">Lus</p>
            <p className="mt-1 text-2xl font-bold text-emerald-600">{messages.length - nonLus}</p>
          </CardContent>
        </Card>
      </div>

      {messages.length === 0 ? (
        <Card className="rounded-3xl">
          <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted" aria-hidden>
              <Mail className="h-6 w-6 text-muted-foreground" />
            </span>
            <p className="text-sm font-medium">Aucun message pour le moment</p>
            <p className="max-w-md text-xs text-muted-foreground">
              Les messages envoyés depuis le formulaire de contact public
              (<a href="/contact" className="text-primary underline">/contact</a>) apparaîtront ici.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
          {/* ---------- Liste des messages (lg:col-span-2) ---------- */}
          <Card className="rounded-3xl lg:col-span-2">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Boîte de réception</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ul className="max-h-[28rem] divide-y divide-border overflow-y-auto custom-scrollbar">
                {messages.map((m) => {
                  const actif = selection === m.id
                  return (
                    <li key={m.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelection(m.id)
                          if (!m.lu) marquerLu(m.id)
                        }}
                        aria-current={actif ? "true" : undefined}
                        className={`flex w-full flex-col gap-1 px-4 py-3 text-left transition-colors ${
                          actif ? "bg-primary/5" : "hover:bg-muted/60"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className={`truncate text-sm ${m.lu ? "font-medium" : "font-bold"}`}>
                            {m.nom}
                          </span>
                          {!m.lu && (
                            <span className="h-2 w-2 shrink-0 rounded-full bg-rose-500" aria-label="Non lu" />
                          )}
                        </div>
                        <span className="truncate text-xs text-muted-foreground">{m.sujet}</span>
                        <span className="text-[11px] text-muted-foreground">
                          {new Date(m.createdAt).toLocaleString("fr-FR", {
                            day: "2-digit",
                            month: "2-digit",
                            year: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </CardContent>
          </Card>

          {/* ---------- Détail du message sélectionné (lg:col-span-3) ---------- */}
          <Card className="rounded-3xl lg:col-span-3">
            {messageSelectionne ? (
              <>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <CardTitle className="text-base break-words">{messageSelectionne.sujet}</CardTitle>
                      <p className="mt-1 text-xs text-muted-foreground">
                        De <span className="font-medium text-foreground">{messageSelectionne.nom}</span>{" "}
                        &lt;{messageSelectionne.email}&gt;
                      </p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {new Date(messageSelectionne.createdAt).toLocaleString("fr-FR", {
                          dateStyle: "long",
                          timeStyle: "short",
                        })}
                      </p>
                    </div>
                    <Badge variant={messageSelectionne.lu ? "secondary" : "default"}>
                      {messageSelectionne.lu ? "Lu" : "Non lu"}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="rounded-2xl bg-muted/40 p-4">
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                      {messageSelectionne.message}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {!messageSelectionne.lu && (
                      <Button
                        size="sm"
                        onClick={() => marquerLu(messageSelectionne.id)}
                        disabled={actionEnCours === messageSelectionne.id}
                      >
                        {actionEnCours === messageSelectionne.id ? (
                          <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden />
                        ) : (
                          <MailOpen className="mr-1.5 h-4 w-4" aria-hidden />
                        )}
                        Marquer comme lu
                      </Button>
                    )}
                    <a
                      href={`mailto:${messageSelectionne.email}?subject=Re: ${encodeURIComponent(
                        messageSelectionne.sujet
                      )}`}
                      className="inline-flex h-9 items-center gap-1.5 rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-accent"
                    >
                      <Mail className="h-4 w-4" aria-hidden />
                      Répondre par email
                    </a>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => supprimer(messageSelectionne.id)}
                      disabled={actionEnCours === messageSelectionne.id}
                      className="ml-auto"
                    >
                      <Trash2 className="mr-1.5 h-4 w-4" aria-hidden />
                      Supprimer
                    </Button>
                  </div>
                </CardContent>
              </>
            ) : (
              <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted" aria-hidden>
                  <MailOpen className="h-6 w-6 text-muted-foreground" />
                </span>
                <p className="text-sm font-medium">Sélectionnez un message</p>
                <p className="max-w-md text-xs text-muted-foreground">
                  Cliquez sur un message dans la liste pour afficher son contenu complet.
                </p>
              </CardContent>
            )}
          </Card>
        </div>
      )}
    </div>
  )
}

// ============================================================
// Task 2 — Onglet "Configuration secteurs" (éditeur de questionnaire)
// ------------------------------------------------------------
// Le superadmin peut éditer le questionnaire adaptatif (3 scénarios
// CRISE/MITIGE/SUCCES) pour chaque SecteurConfig stocké en BDD.
//
// L'éditeur est volontairement simple (textarea JSON) pour commencer :
// un sélecteur de secteur → JSON éditable → bouton Enregistrer.
// Une preview (nombre de scénarios, nombre de questions, source)
// aide à vérifier que la config est valide avant sauvegarde.
//
// Contrats API :
//   GET /api/admin/secteurs → { secteurs: [...] }
//   PUT /api/admin/secteurs { secteurId, questionnaireConfig } → { ok }
// ============================================================

type SecteurQuestionnaireApi = {
  id: string
  nom: string
  emoji: string
  description: string
  macroSecteur: string | null
  questionnaire: unknown
  source: "bdd" | "fallback"
  questionCount: number
  scenarioCount: number
}

function SecteursTab() {
  const [secteurs, setSecteurs] = useState<SecteurQuestionnaireApi[]>([])
  const [secteurId, setSecteurId] = useState<string>("")
  const [json, setJson] = useState<string>("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const { toast } = useToast()

  const secteurSelectionne = secteurs.find((s) => s.id === secteurId) ?? null

  async function load() {
    setLoading(true)
    try {
      const res = await fetch("/api/admin/secteurs", { cache: "no-store" })
      const j = await res.json()
      if (j.ok) {
        setSecteurs(j.data.secteurs as SecteurQuestionnaireApi[])
        if (!secteurId && j.data.secteurs.length > 0) {
          setSecteurId(j.data.secteurs[0].id)
        }
      } else {
        toast({ title: "Erreur", description: j.error || "Chargement impossible", variant: "destructive" })
      }
    } catch {
      toast({ title: "Erreur", description: "Chargement impossible", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  // Chargement initial
  useEffect(() => {
    load()
  }, [])

  // Quand le secteur sélectionné change, on recharge son JSON
  useEffect(() => {
    if (!secteurSelectionne) {
      setJson("")
      return
    }
    // On sérialise le questionnaire avec indentation pour l'édition
    try {
      const obj = secteurSelectionne.questionnaire
      if (obj) {
        setJson(JSON.stringify(obj, null, 2))
      } else {
        setJson("")
      }
      setErreur(null)
    } catch {
      setJson("")
    }
  }, [secteurId])

  // Validation en temps réel du JSON édité
  function validerJson(texte: string): { valide: boolean; erreur?: string; scenarioCount?: number; questionCount?: number } {
    if (!texte.trim()) {
      return { valide: false, erreur: "JSON vide" }
    }
    try {
      const parsed = JSON.parse(texte) as unknown
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return { valide: false, erreur: "Doit être un objet { secteur, scenarios: [] }" }
      }
      const obj = parsed as { scenarios?: unknown }
      if (!Array.isArray(obj.scenarios)) {
        return { valide: false, erreur: "Champ 'scenarios' manquant ou pas un tableau" }
      }
      let qCount = 0
      for (const s of obj.scenarios as Array<Record<string, unknown>>) {
        if (!s || typeof s.scenario !== "string" || !Array.isArray(s.questions) || s.questions.length === 0) {
          return { valide: false, erreur: "Chaque scénario doit avoir 'scenario' (string) et 'questions' (tableau non vide)" }
        }
        qCount += (s.questions as unknown[]).length
      }
      return { valide: true, scenarioCount: obj.scenarios.length, questionCount: qCount }
    } catch (e) {
      return { valide: false, erreur: e instanceof Error ? e.message : "JSON invalide" }
    }
  }

  const validation = validerJson(json)

  async function enregistrer() {
    if (!secteurId) return
    if (!validation.valide) {
      setErreur(validation.erreur ?? "JSON invalide")
      return
    }
    setSaving(true)
    setErreur(null)
    try {
      const res = await fetch("/api/admin/secteurs", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secteurId, questionnaireConfig: json }),
      })
      const j = await res.json()
      if (j.ok) {
        toast({
          title: "Configuration enregistrée ✓",
          description: `Le questionnaire de « ${secteurSelectionne?.nom} » a été mis à jour.`,
        })
        await load()
      } else {
        setErreur(j.error || "Échec de l'enregistrement")
        toast({ title: "Erreur", description: j.error || "Échec de l'enregistrement", variant: "destructive" })
      }
    } catch {
      setErreur("Échec de l'enregistrement")
      toast({ title: "Erreur", description: "Échec de l'enregistrement", variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  async function reinitialiser() {
    if (!secteurSelectionne) return
    if (!confirm(`Réinitialiser le questionnaire de « ${secteurSelectionne.nom} » à la valeur par défaut (config hardcoded) ?`)) {
      return
    }
    // Pour réinitialiser, on met un JSON vide → le fallback hardcoded sera utilisé
    setSaving(true)
    try {
      const res = await fetch("/api/admin/secteurs", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secteurId, questionnaireConfig: {} }),
      })
      const j = await res.json()
      if (j.ok) {
        toast({ title: "Configuration réinitialisée", description: "Le fallback hardcoded sera utilisé." })
        await load()
      } else {
        toast({ title: "Erreur", description: j.error || "Échec", variant: "destructive" })
      }
    } catch {
      toast({ title: "Erreur", description: "Échec", variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-5">
      {/* En-tête */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold sm:text-xl">
            <ClipboardList className="h-5 w-5 text-primary" aria-hidden />
            Configuration des questionnaires par secteur
          </h2>
          <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
            Éditez le questionnaire adaptatif (scénarios CRISE / MITIGE / SUCCES) affiché aux clients lors du scan QR.
            Les modifications sont appliquées immédiatement à tous les Pros du secteur.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-1.5">
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} aria-hidden />
          Rafraîchir
        </Button>
      </div>

      {loading ? (
        <Card>
          <CardContent className="flex items-center gap-3 py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden />
            <span className="text-sm text-muted-foreground">Chargement des secteurs…</span>
          </CardContent>
        </Card>
      ) : secteurs.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-sm text-muted-foreground">Aucun secteur configuré. Lancez le seed des secteurs.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Sélecteur de secteur */}
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-base">1. Sélectionnez un secteur</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                {secteurs.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSecteurId(s.id)}
                    className={cn(
                      "flex flex-col items-start gap-1 rounded-2xl border p-3 text-left transition-colors",
                      s.id === secteurId
                        ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                        : "border-border hover:bg-muted/50"
                    )}
                  >
                    <span className="text-xl" aria-hidden>{s.emoji || "🏪"}</span>
                    <span className="text-sm font-medium leading-tight">{s.nom}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {s.scenarioCount} scén. · {s.questionCount} quest.
                    </span>
                    {s.source === "fallback" && (
                      <Badge variant="outline" className="mt-1 h-4 px-1 text-[9px] font-normal text-amber-700">
                        défaut
                      </Badge>
                    )}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Éditeur JSON */}
          {secteurSelectionne && (
            <Card>
              <CardHeader className="pb-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <span aria-hidden>{secteurSelectionne.emoji || "🏪"}</span>
                      2. Éditez le questionnaire — {secteurSelectionne.nom}
                    </CardTitle>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Macro-secteur : {secteurSelectionne.macroSecteur ?? "générique"} · Source actuelle :{" "}
                      <Badge
                        variant="outline"
                        className={cn(
                          "ml-1 h-4 px-1.5 text-[10px] font-normal",
                          secteurSelectionne.source === "bdd"
                            ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                            : "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
                        )}
                      >
                        {secteurSelectionne.source === "bdd" ? "BDD (édité)" : "Fallback hardcoded"}
                      </Badge>
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={reinitialiser}
                      disabled={saving}
                      className="gap-1.5"
                    >
                      <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                      Réinitialiser
                    </Button>
                    <Button
                      size="sm"
                      onClick={enregistrer}
                      disabled={saving || !validation.valide}
                      className="gap-1.5"
                    >
                      {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Save className="h-3.5 w-3.5" aria-hidden />}
                      Enregistrer
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Statut de validation */}
                <div
                  className={cn(
                    "flex items-center gap-2 rounded-xl border p-2.5 text-xs",
                    validation.valide
                      ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                      : "border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300"
                  )}
                >
                  {validation.valide ? (
                    <>
                      <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                      <span>
                        JSON valide — {validation.scenarioCount} scénario(s) · {validation.questionCount} question(s)
                      </span>
                    </>
                  ) : (
                    <>
                      <Ban className="h-3.5 w-3.5" aria-hidden />
                      <span>JSON invalide : {validation.erreur}</span>
                    </>
                  )}
                </div>

                {/* Textarea JSON */}
                <Textarea
                  value={json}
                  onChange={(e) => {
                    setJson(e.target.value)
                    setErreur(null)
                  }}
                  className="min-h-[480px] font-mono text-xs leading-relaxed"
                  placeholder='{ "secteur": "RESTAURATION", "scenarios": [...] }'
                  spellCheck={false}
                  aria-label="Éditeur JSON du questionnaire"
                />
                {erreur && (
                  <p className="text-xs text-rose-600 dark:text-rose-400">{erreur}</p>
                )}
                <p className="text-[11px] text-muted-foreground">
                  Format attendu : <code className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">{`{ secteur: string, scenarios: [{ scenario: "CRISE"|"MITIGE"|"SUCCES", noteMin, noteMax, questions: [...], tempsEstime }] }`}</code>
                  . En cas d'erreur ou de champ vide, le fallback hardcoded (src/lib/questionnaire-config.ts) est utilisé.
                </p>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  )
}

// ============================================================
// Task 3 — Onglet "Rétention" (dashboard superadmin)
// ------------------------------------------------------------
// Métriques de rétention des Pros :
//   - Clients actifs par mois (AreaChart) : Pros avec ≥1 retour dans le mois
//   - Nouveaux clients par mois (AreaChart) : Pros créés dans le mois
//   - Taux de churn (%) : Pros suspendus OU sans retour depuis 30j / total
//   - LTV estimée (€) : moyenne prix plan × durée moyenne abonnement
//   - Répartition par plan (PieChart)
//
// Contrat API : GET /api/admin/retention
// ============================================================

type RetentionData = {
  clientsActifsParMois: { mois: string; cle: string; count: number }[]
  nouveauxClientsParMois: { mois: string; cle: string; count: number }[]
  tauxChurn: number
  prosInactifs: number
  prosActifs: number
  prosSuspendus: number
  ltvEstime: number
  dureeMoyenneAbonnementMois: number
  prixPlanMoyen: number
  repartitionPlans: { plan: string; count: number; pct: number }[]
  resume: {
    totalPros: number
    prosActifs: number
    prosInactifs: number
    prosSuspendus: number
  }
  periode: { debut: string; fin: string; nbMois: number }
}

const COULEURS_REPARTITION = ["#5257C9", "#0047c7", "#94a3b8", "#1e3a8a", "#64748b"]

function RetentionTab() {
  const [data, setData] = useState<RetentionData | null>(null)
  const [loading, setLoading] = useState(true)
  const { toast } = useToast()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/admin/retention", { cache: "no-store" })
      const j = await res.json()
      if (j.ok) {
        setData(j.data as RetentionData)
      } else {
        toast({ title: "Erreur", description: j.error || "Chargement impossible", variant: "destructive" })
      }
    } catch {
      toast({ title: "Erreur", description: "Chargement impossible", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    load()
  }, [load])

  if (loading) {
    return (
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden />
          <span className="text-sm text-muted-foreground">Chargement des métriques de rétention…</span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-80 rounded-2xl" />
      </div>
    )
  }

  if (!data) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-sm text-muted-foreground">Impossible de charger les données de rétention.</p>
          <Button variant="outline" size="sm" onClick={load} className="mt-3 gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" aria-hidden />
            Réessayer
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-5">
      {/* En-tête */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold sm:text-xl">
            <Activity className="h-5 w-5 text-primary" aria-hidden />
            Rétention & Fidélisation
          </h2>
          <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
            Suivez l'engagement des commerçants : clients actifs, churn, LTV estimée et répartition par plan.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} className="gap-1.5">
          <RefreshCw className="h-4 w-4" aria-hidden />
          Rafraîchir
        </Button>
      </div>

      {/* KPI cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground">Clients actifs (30j)</p>
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                <CheckCircle2 className="h-4 w-4" aria-hidden />
              </span>
            </div>
            <p className="mt-2 text-2xl font-bold tabular-nums">{data.prosActifs}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              sur {data.resume.totalPros} Pros ({data.resume.totalPros > 0 ? Math.round((data.prosActifs / data.resume.totalPros) * 100) : 0}%)
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground">Taux de churn</p>
              <span
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-xl",
                  data.tauxChurn >= 50
                    ? "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300"
                    : data.tauxChurn >= 25
                      ? "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
                      : "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                )}
              >
                <TrendingUp className="h-4 w-4" aria-hidden />
              </span>
            </div>
            <p className="mt-2 text-2xl font-bold tabular-nums">{data.tauxChurn}%</p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {data.prosInactifs} inactifs ({data.prosSuspendus} suspendus)
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground">LTV estimée</p>
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Euro className="h-4 w-4" aria-hidden />
              </span>
            </div>
            <p className="mt-2 text-2xl font-bold tabular-nums">{data.ltvEstime} €</p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {data.prixPlanMoyen} €/mois × {data.dureeMoyenneAbonnementMois || "6"} mois
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground">Total Pros</p>
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
                <Users className="h-4 w-4" aria-hidden />
              </span>
            </div>
            <p className="mt-2 text-2xl font-bold tabular-nums">{data.resume.totalPros}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {data.repartitionPlans.length} plan(s) actifs
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Graphiques : Clients actifs + Nouveaux clients */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="h-4 w-4 text-primary" aria-hidden />
              Clients actifs par mois
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Pros ayant eu au moins 1 retour dans le mois (12 derniers mois)
            </p>
          </CardHeader>
          <CardContent>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.clientsActifsParMois} margin={{ top: 5, right: 10, bottom: 0, left: -20 }}>
                  <defs>
                    <linearGradient id="gradActifs" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0047c7" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#0047c7" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} className="dark:stroke-slate-700" />
                  <XAxis dataKey="mois" tick={{ fontSize: 11 }} stroke="#9ca3af" />
                  <YAxis tick={{ fontSize: 11 }} stroke="#9ca3af" allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      borderRadius: 12,
                      border: "1px solid #e5e7eb",
                      fontSize: 12,
                    }}
                    formatter={(v: number) => [`${v} client(s)`, "Actifs"]}
                  />
                  <Area
                    type="monotone"
                    dataKey="count"
                    stroke="#0047c7"
                    strokeWidth={2}
                    fill="url(#gradActifs)"
                    name="Actifs"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Plus className="h-4 w-4 text-emerald-600" aria-hidden />
              Nouveaux clients par mois
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Pros créés dans le mois (12 derniers mois)
            </p>
          </CardHeader>
          <CardContent>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.nouveauxClientsParMois} margin={{ top: 5, right: 10, bottom: 0, left: -20 }}>
                  <defs>
                    <linearGradient id="gradNouveaux" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} className="dark:stroke-slate-700" />
                  <XAxis dataKey="mois" tick={{ fontSize: 11 }} stroke="#9ca3af" />
                  <YAxis tick={{ fontSize: 11 }} stroke="#9ca3af" allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      borderRadius: 12,
                      border: "1px solid #e5e7eb",
                      fontSize: 12,
                    }}
                    formatter={(v: number) => [`${v} nouveau(x)`, "Nouveaux"]}
                  />
                  <Area
                    type="monotone"
                    dataKey="count"
                    stroke="#10b981"
                    strokeWidth={2}
                    fill="url(#gradNouveaux)"
                    name="Nouveaux"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Répartition par plan (PieChart) + tableau détaillé */}
      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Package className="h-4 w-4 text-primary" aria-hidden />
              Répartition par plan
            </CardTitle>
            <p className="text-xs text-muted-foreground">Distribution des Pros par formule d'abonnement</p>
          </CardHeader>
          <CardContent>
            {data.repartitionPlans.length === 0 ? (
              <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
                Aucun Pro inscrit
              </div>
            ) : (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={data.repartitionPlans}
                      dataKey="count"
                      nameKey="plan"
                      cx="50%"
                      cy="50%"
                      innerRadius={45}
                      outerRadius={85}
                      paddingAngle={2}
                    >
                      {data.repartitionPlans.map((entry, idx) => (
                        <Cell
                          key={`cell-${entry.plan}`}
                          fill={COULEURS_REPARTITION[idx % COULEURS_REPARTITION.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        borderRadius: 12,
                        border: "1px solid #e5e7eb",
                        fontSize: 12,
                      }}
                      formatter={(v: number, _n: string, props: { payload?: { plan?: string; pct?: number } }) => [
                        `${v} Pro(s) (${props?.payload?.pct ?? 0}%)`,
                        props?.payload?.plan ?? "Plan",
                      ]}
                    />
                    <Legend
                      verticalAlign="bottom"
                      iconType="circle"
                      wrapperStyle={{ fontSize: 11 }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Détail par plan</CardTitle>
            <p className="text-xs text-muted-foreground">Répartition détaillée des Pros par formule</p>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Plan</TableHead>
                  <TableHead className="text-right text-xs">Pros</TableHead>
                  <TableHead className="text-right text-xs">Part</TableHead>
                  <TableHead className="text-right text-xs">Revenu mensuel</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.repartitionPlans.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                      Aucun Pro inscrit
                    </TableCell>
                  </TableRow>
                ) : (
                  data.repartitionPlans.map((r, idx) => {
                    const prix = PLANS[r.plan as PlanId]?.price ?? 0
                    const revenu = prix * r.count
                    return (
                      <TableRow key={r.plan}>
                        <TableCell className="text-sm font-medium">
                          <span className="flex items-center gap-2">
                            <span
                              className="h-3 w-3 rounded-full"
                              style={{ backgroundColor: COULEURS_REPARTITION[idx % COULEURS_REPARTITION.length] }}
                              aria-hidden
                            />
                            {nomPlan(r.plan)}
                          </span>
                        </TableCell>
                        <TableCell className="text-right text-sm tabular-nums">{r.count}</TableCell>
                        <TableCell className="text-right text-sm tabular-nums">{r.pct}%</TableCell>
                        <TableCell className="text-right text-sm tabular-nums font-medium">{revenu} €</TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Note méthodologique */}
      <Card>
        <CardContent className="p-4 sm:p-5">
          <p className="text-xs text-muted-foreground">
            <strong className="text-foreground">Méthodologie :</strong> un Pro est considéré <em>actif</em> s'il a reçu au moins
            1 retour dans les 30 derniers jours. Le <em>taux de churn</em> = (Pros suspendus + Pros sans retour depuis 30j) / total
            Pros. La <em>LTV estimée</em> = prix plan moyen × durée moyenne d'abonnement (ou 6 mois par défaut si pas d'historique).
            Données calculées sur les {data.periode.nbMois} derniers mois.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

// ============================================================
// Sous-onglet Modules (système de modules activables)
// ============================================================

type ModuleLigne = {
  id: string
  key: string
  nom: string
  description: string
  actif: boolean
  config: Record<string, unknown>
  updatedAt: string
}

/** Couleurs / emojis distinctifs par module (repère visuel rapide) */
const MODULE_STYLES: Record<
  string,
  { emoji: string; gradient: string }
> = {
  alertes_temps_reel: { emoji: "🚨", gradient: "from-rose-500 to-rose-700" },
  voice_to_text: { emoji: "🎤", gradient: "from-violet-500 to-purple-700" },
  abonnement_multi_sites: { emoji: "🏢", gradient: "from-amber-500 to-orange-600" },
  loterie: { emoji: "🎰", gradient: "from-pink-500 to-rose-600" },
  smart_qr: { emoji: "🕒", gradient: "from-cyan-500 to-blue-700" },
  double_shield: { emoji: "🛡️", gradient: "from-emerald-500 to-emerald-700" },
  webhooks_sortants: { emoji: "🔔", gradient: "from-slate-500 to-slate-700" },
}

function ModulesTab() {
  const [modules, setModules] = useState<ModuleLigne[]>([])
  const [loading, setLoading] = useState(true)
  const [majEnCours, setMajEnCours] = useState<string | null>(null)
  // Édition de la config (JSON éditable) — un module à la fois
  const [editKey, setEditKey] = useState<string | null>(null)
  const [editConfig, setEditConfig] = useState("")
  const [editErreur, setEditErreur] = useState<string | null>(null)
  const { toast } = useToast()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/admin/modules", { cache: "no-store" })
      const json = await res.json()
      if (json.ok) setModules(json.data.modules as ModuleLigne[])
      else toast({ title: "Erreur", description: json.error, variant: "destructive" })
    } catch {
      toast({ title: "Erreur réseau", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    load()
  }, [load])

  async function toggleActif(m: ModuleLigne) {
    setMajEnCours(m.key)
    try {
      const res = await fetch("/api/admin/modules", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: m.key, actif: !m.actif }),
      })
      const json = await res.json()
      if (json.ok) {
        toast({
          title: `${m.nom} ${!m.actif ? "activé" : "désactivé"} ${!m.actif ? "✓" : ""}`,
        })
        await load()
      } else {
        toast({ title: "Erreur", description: json.error, variant: "destructive" })
      }
    } catch {
      toast({ title: "Erreur réseau", variant: "destructive" })
    } finally {
      setMajEnCours(null)
    }
  }

  function ouvrirEdition(m: ModuleLigne) {
    setEditKey(m.key)
    setEditConfig(JSON.stringify(m.config, null, 2))
    setEditErreur(null)
  }

  async function sauverConfig(m: ModuleLigne) {
    let parsed: unknown
    try {
      parsed = JSON.parse(editConfig)
    } catch {
      setEditErreur("JSON invalide — vérifiez la syntaxe (accolades, virgules…)")
      return
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      setEditErreur("La config doit être un objet JSON (pas un tableau ou une valeur simple)")
      return
    }
    setMajEnCours(m.key)
    try {
      const res = await fetch("/api/admin/modules", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: m.key, config: parsed }),
      })
      const json = await res.json()
      if (json.ok) {
        toast({ title: `Config de ${m.nom} sauvegardée ✓` })
        setEditKey(null)
        setEditErreur(null)
        await load()
      } else {
        setEditErreur(json.error || "Erreur serveur")
      }
    } catch {
      setEditErreur("Erreur réseau")
    } finally {
      setMajEnCours(null)
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 rounded-2xl" />
        <div className="grid gap-4 md:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-44 rounded-2xl" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Modules activables</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Activez ou désactivez les fonctionnalités optionnelles de la plateforme.
          La configuration (JSON) est éditable pour les modules qui acceptent des paramètres.
        </p>
      </div>

      {modules.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Aucun module trouvé. Exécutez <code className="rounded bg-muted px-1.5 py-0.5">bun prisma/seed-modules.ts</code> pour
            installer les 7 modules par défaut.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {modules.map((m) => {
            const style = MODULE_STYLES[m.key] ?? { emoji: "🧩", gradient: "from-slate-500 to-slate-700" }
            const enEdition = editKey === m.key
            return (
              <Card
                key={m.id}
                className={cn(
                  "overflow-hidden shadow-sm transition-shadow hover:shadow-md",
                  m.actif && "ring-1 ring-emerald-500/40"
                )}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <div
                        className={cn(
                          "flex size-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-xl text-white shadow-sm",
                          style.gradient
                        )}
                        aria-hidden
                      >
                        {style.emoji}
                      </div>
                      <div className="min-w-0">
                        <CardTitle className="truncate text-base">{m.nom}</CardTitle>
                        <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                          {m.key}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge
                        variant={m.actif ? "default" : "secondary"}
                        className={
                          m.actif
                            ? "border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-50 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-300"
                            : ""
                        }
                      >
                        {m.actif ? "Actif" : "Inactif"}
                      </Badge>
                      <Switch
                        checked={m.actif}
                        onCheckedChange={() => toggleActif(m)}
                        disabled={majEnCours === m.key}
                        aria-label={`Activer/désactiver le module ${m.nom}`}
                      />
                    </div>
                  </div>
                  <CardDescription className="pt-2 text-xs leading-relaxed">
                    {m.description}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* Aperçu de la config */}
                  {!enEdition && (
                    <div className="rounded-xl bg-muted/40 p-3">
                      <div className="mb-1 flex items-center justify-between">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          Configuration
                        </p>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => ouvrirEdition(m)}
                        >
                          <Save className="mr-1 h-3 w-3" aria-hidden />
                          Éditer
                        </Button>
                      </div>
                      <pre className="max-h-32 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] text-foreground/80 fp-scan-scroll">
                        {JSON.stringify(m.config, null, 2) || "{}"}
                      </pre>
                    </div>
                  )}

                  {/* Édition JSON inline */}
                  {enEdition && (
                    <div className="space-y-2 rounded-xl border border-primary/40 bg-primary/5 p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">
                        Édition de la config (JSON)
                      </p>
                      <Textarea
                        value={editConfig}
                        onChange={(e) => setEditConfig(e.target.value)}
                        rows={6}
                        className="font-mono text-xs"
                        spellCheck={false}
                        aria-label={`Config JSON du module ${m.nom}`}
                      />
                      {editErreur && (
                        <p className="text-xs text-rose-600 dark:text-rose-400" role="alert">
                          {editErreur}
                        </p>
                      )}
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8"
                          onClick={() => {
                            setEditKey(null)
                            setEditErreur(null)
                          }}
                          disabled={majEnCours === m.key}
                        >
                          Annuler
                        </Button>
                        <Button
                          size="sm"
                          className="h-8"
                          onClick={() => sauverConfig(m)}
                          disabled={majEnCours === m.key}
                        >
                          {majEnCours === m.key ? (
                            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden />
                          ) : (
                            <Save className="mr-1 h-3.5 w-3.5" aria-hidden />
                          )}
                          Sauver
                        </Button>
                      </div>
                    </div>
                  )}

                  <p className="text-[10px] text-muted-foreground">
                    Dernière modif. {formatDate(m.updatedAt)}
                  </p>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <div className="rounded-xl border bg-muted/30 p-4 text-xs text-muted-foreground">
        <strong className="text-foreground">Astuce :</strong> les modules sont lus
        par les endpoints publics (scan, retour) via <code className="rounded bg-muted px-1 py-0.5">src/lib/modules.ts</code> avec
        un cache mémoire de 30 s. Une modification ici est répercutée immédiatement
        (le cache est invalidé à chaque sauvegarde).
      </div>
    </div>
  )
}
