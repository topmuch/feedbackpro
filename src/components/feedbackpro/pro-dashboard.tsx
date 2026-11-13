"use client"

// ============================================================
// FeedbackPro - Dashboard Commerçant — coquille à 11 onglets (Session 4)
// Navigation principale : Coach IA (accueil) · Zones · Retours · Équipe
// · Statistiques · QR Codes · Paramètres
// Groupe « Gestion » (secondaire) : Rapports IA · Récompenses · Actions
// · Facturation
// Sidebar fixe desktop (lg+) · drawer mobile (Sheet) · header sticky
// Les URLs /dashboard/* sont REWRITTÉES par next.config vers /?tab=<slug> :
// le slug est résolu côté client via window.location (SPA route unique).
// ============================================================

import { useEffect, useState } from "react"
import {
  Bot,
  LayoutDashboard,
  Inbox,
  Users,
  MapPin,
  QrCode,
  BarChart3,
  ClipboardCheck,
  CreditCard,
  Settings,
  Gift,
  FileText,
  Menu,
  LogOut,
  AlertTriangle,
  ShoppingBag,
  Building2,
  Check,
  ChevronDown,
  Loader2,
  Sunrise,
  Monitor,
  Plane,
  MessageCircle,
  Trophy,
  ShieldCheck,
  Lock,
  BookOpen,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { useAppStore } from "@/store/app-store"
import { useToast } from "@/hooks/use-toast"
import { PLANS, type PlanId } from "@/lib/constants"
import { NotificationsBell } from "@/components/feedbackpro/notifications-bell"
import { ThemeToggle } from "@/components/theme-toggle"
import { LanguageSelector } from "@/components/feedbackpro/language-selector"
import { configSecteur } from "@/lib/secteurs"
import { OverviewTab } from "@/components/feedbackpro/overview-tab"
import { CoachIaTab } from "@/components/feedbackpro/coach-ia-tab"
import { AuditMatinTab } from "@/components/feedbackpro/audit-matin-tab"
import { RapportsTab } from "@/components/feedbackpro/rapports-tab"
import { RetoursTab } from "@/components/feedbackpro/retours-tab"
import { TeamTab } from "@/components/feedbackpro/team-tab"
import { ZonesTab } from "@/components/feedbackpro/zones-tab"
import { QrcodeTab } from "@/components/feedbackpro/qrcode-tab"
import { StatsTab } from "@/components/feedbackpro/stats-tab"
import { ActionsTab } from "@/components/feedbackpro/actions-tab"
import { BillingTab } from "@/components/feedbackpro/billing-tab"
import { CommanderTab } from "@/components/feedbackpro/commander-tab"
import { RecompensesTab } from "@/components/feedbackpro/recompenses-tab"
import { SettingsTab } from "@/components/feedbackpro/settings-tab"
import { OnboardingBanner } from "@/components/feedbackpro/onboarding-banner"
import AirportZonesTab from "@/components/feedbackpro/airport-zones-tab"
import AirportReportsTab from "@/components/feedbackpro/airport-reports-tab"
import AirportBotTab from "@/components/feedbackpro/airport-bot-tab"
import { AirportWallboardTab } from "@/components/feedbackpro/airport-wallboard-tab"
import { AirportLeaderboardTab } from "@/components/feedbackpro/airport-leaderboard-tab"
import { AirportBlackboxTab } from "@/components/feedbackpro/airport-blackbox-tab"
import { AirportStaffQrTab } from "@/components/feedbackpro/airport-staffqr-tab"
import { AirportFlightGatesTab } from "@/components/feedbackpro/airport-flightgates-tab"
import { AirportModeEmploiTab } from "@/components/feedbackpro/airport-mode-emploi-tab"

type Onglet =
  | "dashboard"
  | "coach"
  | "audit-matin"
  | "zones"
  | "retours"
  | "team"
  | "stats"
  | "qrcode"
  | "settings"
  | "rapports"
  | "recompenses"
  | "actions"
  | "billing"
  | "commander"
  // Task 2-4 — onglets spécifiques au secteur Aéroport
  // (visibles uniquement si session.pro.typeEtablissement === "Aéroport")
  | "airport-wallboard"
  | "airport-zones"
  | "airport-reports"
  | "airport-bot"
  | "airport-leaderboard"
  | "airport-blackbox"
  | "airport-staff-qr"
  | "airport-vols"
  | "airport-mode-emploi"

/** Slug URL → onglet interne (ex. /dashboard/qr-codes → "qrcode") */
const SLUG_TO_TAB: Record<string, Onglet> = {
  dashboard: "dashboard",
  "tableau-de-bord": "dashboard",
  coach: "coach",
  overview: "coach", // slug legacy (ancienne « Vue d'ensemble ») → Coach IA
  "audit-matin": "audit-matin", // Feature 2 — Auto-Audit du matin
  audit: "audit-matin", // alias court
  retours: "retours",
  equipe: "team",
  team: "team",
  zones: "zones",
  "qr-codes": "qrcode", // slug canonique Session 3 (pluriel)
  "qr-code": "qrcode", // alias legacy (singulier, QR déjà imprimés/bookmarks)
  rapports: "rapports", // Session 4 : historique complet des rapports IA
  recompenses: "recompenses",
  commander: "commander", // Session 6 : supports physiques
  stats: "stats",
  actions: "actions",
  billing: "billing",
  parametres: "settings",
  settings: "settings", // alias anglophone du slug canonique « parametres »
  // Task 2-4 — slugs aéroport
  "aeroport-wallboard": "airport-wallboard",
  "aeroport-zones": "airport-zones",
  "aeroport-signalements": "airport-reports",
  "aeroport-bot": "airport-bot",
  "aeroport-classement": "airport-leaderboard",
  "aeroport-blackbox": "airport-blackbox",
  "aeroport-qr-staff": "airport-staff-qr",
  "aeroport-vols": "airport-vols",
  "aeroport-mode-emploi": "airport-mode-emploi",
}

/** Onglet interne → slug URL (ex. "qrcode" → /dashboard/qr-codes) */
const TAB_TO_SLUG: Record<Onglet, string> = {
  dashboard: "tableau-de-bord",
  coach: "coach",
  "audit-matin": "audit-matin",
  retours: "retours",
  team: "equipe",
  zones: "zones",
  qrcode: "qr-codes",
  rapports: "rapports",
  recompenses: "recompenses",
  commander: "commander",
  stats: "stats",
  actions: "actions",
  billing: "billing",
  settings: "parametres",
  // Task 2-4 — slugs aéroport
  "airport-wallboard": "aeroport-wallboard",
  "airport-zones": "aeroport-zones",
  "airport-reports": "aeroport-signalements",
  "airport-bot": "aeroport-bot",
  "airport-leaderboard": "aeroport-classement",
  "airport-blackbox": "aeroport-blackbox",
  "airport-staff-qr": "aeroport-qr-staff",
  "airport-vols": "aeroport-vols",
  "airport-mode-emploi": "aeroport-mode-emploi",
}

// ---------- Navigation (Session 4) : 7 onglets principaux + groupe « Gestion » ----------

type EntreeNav = { id: Onglet; labelKey: string; icon: React.ComponentType<{ className?: string }>; badge?: number }

/** Onglets principaux — l'ordre ci-dessous est la spec Session 4 */
const ONGLETS_PRINCIPAUX: EntreeNav[] = [
  { id: "dashboard", labelKey: "nav.dashboard", icon: LayoutDashboard },
  { id: "coach", labelKey: "nav.coach", icon: Bot },
  // Feature 2 — Auto-Audit du matin (juste après Coach IA, comme un rituel quotidien)
  { id: "audit-matin", labelKey: "nav.auditMatin", icon: Sunrise },
  { id: "zones", labelKey: "nav.zones", icon: MapPin },
  { id: "retours", labelKey: "nav.retours", icon: Inbox },
  { id: "team", labelKey: "nav.team", icon: Users },
  { id: "stats", labelKey: "nav.stats", icon: BarChart3 },
  { id: "qrcode", labelKey: "nav.qrcode", icon: QrCode },
  { id: "settings", labelKey: "nav.settings", icon: Settings },
]

/** Onglets secondaires, après le séparateur « Gestion » */
const ONGLETS_GESTION: EntreeNav[] = [
  { id: "commander", labelKey: "nav.commander", icon: ShoppingBag },
  { id: "rapports", labelKey: "nav.rapports", icon: FileText },
  { id: "recompenses", labelKey: "nav.recompenses", icon: Gift },
  { id: "actions", labelKey: "nav.actions", icon: ClipboardCheck },
  { id: "billing", labelKey: "nav.billing", icon: CreditCard },
]

/**
 * Task 2-4 — Onglets spécifiques au secteur Aéroport.
 * Affichés dans une section « ✈️ Aéroport » dédiée, uniquement si
 * `session.pro.typeEtablissement === "Aéroport"`. L'accent emerald
 * reste la signature visuelle aéroport (bouton Wallboard, accents Zones).
 */
const ONGLETS_AEROPORT: EntreeNav[] = [
  { id: "airport-wallboard", labelKey: "nav.airportWallboard", icon: Monitor },
  { id: "airport-zones", labelKey: "nav.airportZones", icon: Plane },
  { id: "airport-reports", labelKey: "nav.airportReports", icon: Inbox },
  { id: "airport-leaderboard", labelKey: "nav.airportLeaderboard", icon: Trophy },
  { id: "airport-blackbox", labelKey: "nav.airportBlackBox", icon: Lock },
  { id: "airport-staff-qr", labelKey: "nav.airportStaffQr", icon: QrCode },
  { id: "airport-vols", labelKey: "nav.airportVols", icon: ShieldCheck },
  { id: "airport-mode-emploi", labelKey: "nav.airportModeEmploi", icon: BookOpen },
  { id: "airport-bot", labelKey: "nav.airportBot", icon: MessageCircle },
]

/** Liste plate (squelettes de chargement uniquement) */
const ONGLETS: EntreeNav[] = [...ONGLETS_PRINCIPAUX, ...ONGLETS_GESTION]

/**
 * Lit un champ du ProData en tolérant les évolutions de schéma
 * (le store passe de nomCommerce → nomEtablissement en Session 1).
 */
function champPro(pro: unknown, cles: string[], defaut = ""): string {
  if (!pro || typeof pro !== "object") return defaut
  for (const cle of cles) {
    const valeur = (pro as Record<string, unknown>)[cle]
    if (typeof valeur === "string" && valeur) return valeur
  }
  return defaut
}

/** Lit l'onglet courant depuis l'URL visible (/dashboard/<slug> ou /?tab=<slug>) */
function ongletDepuisUrl(): Onglet {
  if (typeof window === "undefined") return "dashboard"
  try {
    const match = window.location.pathname.match(/^\/dashboard(?:\/([a-z-]+))?\/?$/)
    const slug = match?.[1] ?? new URLSearchParams(window.location.search).get("tab")
    if (slug && slug in SLUG_TO_TAB) return SLUG_TO_TAB[slug]
    return "dashboard"
  } catch {
    return "dashboard"
  }
}

export function ProDashboard() {
  const t = (key: string) => { const map: Record<string, string> = {"nav.dashboard": "Tableau de bord", "nav.coach": "Coach IA", "nav.auditMatin": "Audit Matin", "nav.zones": "Zones", "nav.retours": "Retours", "nav.team": "Equipe", "nav.stats": "Statistiques", "nav.qrcode": "QR Codes", "nav.settings": "Parametres", "nav.commander": "Commander", "nav.rapports": "Rapports IA", "nav.recompenses": "Recompenses", "nav.actions": "Actions", "nav.billing": "Facturation", "nav.airportWallboard": "Wallboard", "nav.airportZones": "Zones aéroport", "nav.airportReports": "Signalements", "nav.airportLeaderboard": "Classement", "nav.airportBot": "Bot WhatsApp", "nav.airportBlackBox": "Black Box", "nav.airportStaffQr": "QR Staff", "nav.airportVols": "Vols & Portes", "nav.airportModeEmploi": "Mode d'Emploi", "nav.aeroport": "Aéroport", "nav.gestion": "Gestion", "common.ouvrirMenu": "Ouvrir le menu", "common.navigationDashboard": "Navigation du dashboard", "common.deconnexion": "Deconnexion", "common.tableauBordFeedback": "Tableau de bord FeedbackPro", "common.promesseCoach": "Votre Coach analyse chaque jour vos zones de contact pour vous donner 3 priorites concretes."}; return map[key] || key }
  const [onglet, setOnglet] = useState<Onglet>(() => ongletDepuisUrl())
  const [menuOuvert, setMenuOuvert] = useState(false)
  /** Zone présélectionnée dans l'onglet QR (arrivée depuis l'onglet Zones) */
  const [zonePourQr, setZonePourQr] = useState<string | null>(null)
  const session = useAppStore((s) => s.session)
  const logout = useAppStore((s) => s.logout)

  const pro = session?.pro
  const nomEtablissement = champPro(pro, ["nomEtablissement", "nomCommerce"], "Tableau de bord")
  const planKey = (champPro(pro, ["plan"], "STARTER") || "STARTER") as PlanId
  const planName = PLANS[planKey]?.name ?? "Starter"
  // Task M4 — secteur du Pro (emoji + nom) pour le badge dans le header.
  // Le typeEtablissement est lu défensivement (champ pivot stable depuis S1).
  const typeEtablissement = champPro(pro, ["typeEtablissement"], "")
  const secteurCfg = typeEtablissement ? configSecteur(typeEtablissement) : null
  /** Compte suspendu : le guard API renvoie déjà 403, on affiche la bannière */
  const suspendu = (pro as Record<string, unknown> | undefined)?.suspendu === true

  // D7 : multi-établissements — liste des établissements du groupe (parent +
  // enfants). Le sélecteur ne s'affiche que si des enfants existent.
  const [etablissements, setEtablissements] = useState<
    { id: string; nomEtablissement: string; courant: boolean }[]
  >([])
  // Task 5 — switch en cours (désactive le sélecteur pendant la requête)
  const [switchEnCours, setSwitchEnCours] = useState<string | null>(null)
  const { toast: toastFeedback } = useToast()

  // Badge retours non lus sur la sidebar
  const [retoursNonLus, setRetoursNonLus] = useState(0)
  // Badge signalements aéroport en attente (pour onglets Wallboard + Signalements)
  const [airportEnAttente, setAirportEnAttente] = useState(0)
  useEffect(() => {
    if (!session) return
    let cancelled = false
    async function fetchNonLus() {
      try {
        const res = await fetch("/api/pro/retours?statut=NEW&limit=1", { cache: "no-store" })
        const json = await res.json()
        if (!cancelled && json.ok) {
          setRetoursNonLus(json.data?.total ?? 0)
        }
      } catch {
        /* silencieux */
      }
    }
    fetchNonLus()
    // Poll toutes les 30s pour les nouveaux retours
    const interval = setInterval(fetchNonLus, 30000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [session])

  // Fetch signalements aéroport EN_ATTENTE pour le badge (uniquement secteur Aéroport)
  useEffect(() => {
    if (!session || typeEtablissement !== "Aéroport") return
    let cancelled = false
    async function fetchAirportReports() {
      try {
        const res = await fetch("/api/airport/reports?statut=EN_ATTENTE&limit=1", { cache: "no-store" })
        const json = await res.json()
        if (!cancelled && json.ok) {
          setAirportEnAttente(json.data?.count ?? 0)
        }
      } catch {
        /* silencieux */
      }
    }
    fetchAirportReports()
    // Poll toutes les 15s (plus fréquent que retours car ops = temps réel)
    const interval = setInterval(fetchAirportReports, 15000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [session, typeEtablissement])
  useEffect(() => {
    if (!session) return
    let annule = false
    fetch("/api/pro/etablissements", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (annule || !j?.ok) return
        const d = j.data
        const liste: { id: string; nomEtablissement: string; courant: boolean }[] = []
        if (d.parent) liste.push({ id: d.parent.id, nomEtablissement: d.parent.nomEtablissement, courant: d.parent.id === d.courant?.id })
        for (const e of d.enfants ?? []) {
          liste.push({ id: e.id, nomEtablissement: e.nomEtablissement, courant: e.id === d.courant?.id })
        }
        setEtablissements(liste)
      })
      .catch(() => {
        /* silencieux : le sélecteur reste masqué */
      })
    return () => {
      annule = true
    }
  }, [session])

  // Task 5 — Switch d'établissement : POST /api/pro/switch-etablissement
  // puis recharge la page pour rafraîchir la session (store + cookie).
  async function switcherEtablissement(cibleId: string) {
    if (switchEnCours || !cibleId) return
    setSwitchEnCours(cibleId)
    try {
      const res = await fetch("/api/pro/switch-etablissement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cibleId }),
      })
      const json = await res.json()
      if (json.ok) {
        // La nouvelle session est posée via cookie ; on recharge pour
        // rafraîchir le store Zustand et les données serveur.
        window.location.reload()
      } else {
        toastFeedback({ title: "Erreur", description: json.error || "Switch impossible", variant: "destructive" })
        setSwitchEnCours(null)
      }
    } catch {
      toastFeedback({ title: "Erreur réseau", variant: "destructive" })
      setSwitchEnCours(null)
    }
  }

  // Boutons précédent / suivant du navigateur : resynchronise l'onglet
  useEffect(() => {
    function onPopState() {
      setOnglet(ongletDepuisUrl())
    }
    window.addEventListener("popstate", onPopState)
    return () => window.removeEventListener("popstate", onPopState)
  }, [])

  /** Change d'onglet et met à jour l'URL visible (/dashboard/<slug>) */
  function naviguer(o: Onglet, garderZone = false) {
    setOnglet(o)
    // Navigation directe vers les QR : on repart du défaut (première zone)
    if (o === "qrcode" && !garderZone) setZonePourQr(null)
    try {
      window.history.pushState({}, "", o === "coach" ? "/dashboard" : "/dashboard/" + TAB_TO_SLUG[o])
    } catch {
      /* ignore */
    }
  }

  /** L'onglet Zones demande à voir le QR d'une zone précise */
  function ouvrirQr(zoneId: string) {
    setZonePourQr(zoneId)
    naviguer("qrcode", true)
  }

  // ---------- Coquille squelette pendant le chargement de la session ----------
  if (!session) {
    return (
      <div className="relative flex min-h-screen flex-col bg-background lg:pl-72 lg:pr-3">
        {/* Pastilles décoratives floues (vert + indigo) derrière tout */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
          <div className="absolute -left-32 -top-24 h-[28rem] w-[28rem] rounded-full bg-emerald-500/15 blur-3xl" />
          <div className="absolute -right-24 -top-16 h-[24rem] w-[24rem] rounded-full bg-primary/10 blur-3xl" />
        </div>
        <aside className="fixed inset-y-4 left-4 z-40 hidden max-h-[calc(100vh-2rem)] w-64 flex-col rounded-3xl bg-sidebar text-sidebar-foreground shadow-[0_10px_30px_rgba(0,0,0,0.06)] lg:flex">
          <div className="flex shrink-0 items-center gap-2.5 px-5 py-5">
            <Skeleton className="h-10 w-10 rounded-xl bg-sidebar-foreground/20" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3.5 w-24 bg-sidebar-foreground/20" />
              <Skeleton className="h-2.5 w-16 bg-sidebar-foreground/20" />
            </div>
          </div>
          <div className="flex-1 min-h-0 space-y-2 overflow-y-auto px-3 py-2 [scrollbar-width:thin] [scrollbar-color:rgba(125,125,125,0.25)_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-sidebar-foreground/25 [&::-webkit-scrollbar-thumb:hover]:bg-sidebar-foreground/40 [&::-webkit-scrollbar-track]:bg-transparent">
            {ONGLETS.map((o) => (
              <Skeleton key={o.id} className="mx-0 h-10 rounded-xl bg-sidebar-foreground/15" />
            ))}
          </div>
        </aside>
        <header className="sticky top-4 z-30 mx-3 mt-4 lg:mx-0">
          <div className="flex h-14 items-center justify-between gap-3 rounded-2xl bg-card px-4 shadow-[0_10px_30px_rgba(0,0,0,0.06)] sm:h-16 sm:px-5">
            <Skeleton className="h-8 w-8 rounded-lg lg:hidden" />
            <Skeleton className="h-5 w-40" />
            <div className="flex-1" />
            <Skeleton className="h-6 w-16 rounded-full" />
            <Skeleton className="h-9 w-9 rounded-lg" />
          </div>
        </header>
        <main className="w-full flex-1 space-y-4 px-4 py-5 sm:px-6 lg:px-8">
          <Skeleton className="h-10 w-72" />
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-3xl" />
            ))}
          </div>
          <Skeleton className="h-64 rounded-3xl" />
        </main>
      </div>
    )
  }

  return (
    <div className={cn(
      "relative flex min-h-screen flex-col bg-background lg:pl-72",
      onglet !== "airport-wallboard" && "lg:pr-3"
    )}>
      {/* ---------- Pastilles décoratives floues (vert + indigo) ---------- */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="absolute -left-32 -top-24 h-[28rem] w-[28rem] rounded-full bg-emerald-500/15 blur-3xl" />
        <div className="absolute -right-24 -top-16 h-[24rem] w-[24rem] rounded-full bg-primary/10 blur-3xl" />
      </div>
      {/* ---------- Sidebar détachée (desktop lg+) ----------
          max-h-[calc(100vh-2rem)] : contraint la sidebar dans le viewport
          (hauteur = 100vh - 2rem, identique à inset-y-4). Le <nav> interne
          a flex-1 + overflow-y-auto + min-h-0 pour scroller verticalement
          quand les 22 entrées (9 principales + 8 aéroport + 5 gestion)
          débordent — typiquement sur écran 11" (1366×768) où 22×44px ≈ 968px
          > 768px viewport. Le header (logo) et le footer (promesse) restent
          visibles grâce à shrink-0 / mt-auto. */}
      <aside className="fixed inset-y-4 left-4 z-40 hidden max-h-[calc(100vh-2rem)] w-64 flex-col rounded-3xl bg-sidebar text-sidebar-foreground shadow-[0_10px_30px_rgba(0,0,0,0.06)] lg:flex">
        <ContenuSidebar ongletActif={onglet} onNaviguer={naviguer} retoursNonLus={retoursNonLus} estAeroport={typeEtablissement === "Aéroport"} airportEnAttente={airportEnAttente} />
      </aside>

      {/* ---------- Top bar discrète (card blanc arrondie) ---------- */}
      <header className="sticky top-4 z-30 mx-3 mt-4 lg:mx-0">
        <div className="flex h-14 items-center justify-between gap-3 rounded-2xl bg-card px-4 shadow-[0_10px_30px_rgba(0,0,0,0.06)] sm:h-16 sm:px-5">
          {/* Gauche : burger (mobile) + nom de l'établissement + secteur */}
          <div className="flex min-w-0 items-center gap-2.5">
            <Sheet open={menuOuvert} onOpenChange={setMenuOuvert}>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-foreground hover:bg-muted lg:hidden"
                  aria-label={t("common.ouvrirMenu")}
                  aria-expanded={menuOuvert}
                >
                  <Menu className="h-5 w-5" aria-hidden />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 border-0 bg-sidebar p-0 text-sidebar-foreground" aria-describedby={undefined}>
                <SheetTitle className="sr-only">{t("common.navigationDashboard")}</SheetTitle>
                <ContenuSidebar
                  ongletActif={onglet}
                  onNaviguer={(o) => {
                    naviguer(o)
                    setMenuOuvert(false)
                  }}
                  retoursNonLus={retoursNonLus}
                  estAeroport={typeEtablissement === "Aéroport"}
                  airportEnAttente={airportEnAttente}
                />
              </SheetContent>
            </Sheet>
            {/* D7 : sélecteur d'établissement (multi-sites) — affiché uniquement
                si le groupe compte plusieurs établissements. Task 5 : au clic
                sur un enfant, on appelle POST /api/pro/switch-etablissement
                puis on recharge la page (nouvelle session + cookie). */}
            {etablissements.length > 1 ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    className="h-9 w-[180px] justify-between gap-2 border-0 bg-muted px-3 text-xs font-semibold hover:bg-muted sm:w-[240px]"
                    disabled={!!switchEnCours}
                    aria-label="Sélectionner un établissement"
                  >
                    <span className="flex min-w-0 items-center gap-1.5">
                      <Building2 className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                      <span className="truncate">
                        {etablissements.find((e) => e.courant)?.nomEtablissement ?? etablissements[0]?.nomEtablissement}
                      </span>
                    </span>
                    {switchEnCours ? (
                      <Loader2 className="size-3.5 shrink-0 animate-spin" aria-hidden />
                    ) : (
                      <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-[240px]">
                  <DropdownMenuLabel className="text-xs text-muted-foreground">
                    Mes établissements
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {etablissements.map((e) => (
                    <DropdownMenuItem
                      key={e.id}
                      onClick={() => !e.courant && switcherEtablissement(e.id)}
                      disabled={e.courant || switchEnCours === e.id}
                      className="flex items-center justify-between gap-2 text-sm"
                    >
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span aria-hidden>{e.courant ? "📍" : "🏢"}</span>
                        <span className="truncate">{e.nomEtablissement}</span>
                      </span>
                      {e.courant && <Check className="size-3.5 shrink-0 text-primary" aria-hidden />}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <div className="min-w-0">
                <p className="truncate font-semibold text-foreground">{nomEtablissement}</p>
                <p className="hidden truncate text-xs text-muted-foreground sm:block">{t("common.tableauBordFeedback")}</p>
              </div>
            )}
            {/* Task M4 — Badge Secteur : emoji + nom du secteur (masqué sur
                petit mobile pour préserver l'espace du nom d'établissement). */}
            {secteurCfg && (
              <Badge
                variant="outline"
                className="hidden shrink-0 text-xs font-medium sm:inline-flex"
                title={secteurCfg.description}
              >
                <span aria-hidden className="mr-1">{secteurCfg.emoji}</span>
                {typeEtablissement}
              </Badge>
            )}
          </div>

          {/* Droite : badge plan + notifications + déconnexion (icône + tooltip) */}
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <Badge variant="secondary" className="hidden sm:inline-flex">{planName}</Badge>
            <LanguageSelector tone="light" />
            <NotificationsBell tone="light" />
            <ThemeToggle />
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => logout()}
                    aria-label={t("common.deconnexion")}
                  >
                    <LogOut className="h-4.5 w-4.5" aria-hidden />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t("common.deconnexion")}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
      </header>

      {/* ---------- Bannière compte suspendu ---------- */}
      {suspendu && (
        <div className="mx-3 mt-3 rounded-2xl border border-destructive/30 bg-destructive/10 lg:mx-0" role="alert">
          <div className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-destructive sm:px-6">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
            <p>
              <span className="font-semibold">Compte suspendu.</span> Vos pages clients restent visibles mais
              les données sont figées — contactez le support pour réactiver votre abonnement.
            </p>
          </div>
        </div>
      )}

      {/* ---------- Bannière d'onboarding "First Week" (Task 1) ----------
          Masquée sur l'onglet wallboard pour que l'iframe remplisse toute
          la page. ---------- */}
      {!suspendu && onglet !== "airport-wallboard" && <OnboardingBanner />}

      {/* ---------- Contenu ---------- */}
      {/* Quand l'onglet wallboard est actif, on passe en mode "plein écran" :
          pas de max-width, pas de padding, flex-1 min-h-0 pour que l'iframe
          remplisse toute la zone restante sous le header. */}
      <main
        className={cn(
          onglet === "airport-wallboard"
            ? "flex min-h-0 flex-1 flex-col"
            : "w-full flex-1 px-4 py-5 sm:px-6 sm:py-7 lg:px-8"
        )}
      >
        {onglet === "dashboard" && <OverviewTab />}
        {onglet === "coach" && <CoachIaTab onOuvrirRapports={() => naviguer("rapports")} />}
        {onglet === "audit-matin" && <AuditMatinTab />}
        {onglet === "rapports" && <RapportsTab />}
        {onglet === "retours" && <RetoursTab onOuvrirCoachIA={() => naviguer("coach")} />}
        {onglet === "team" && <TeamTab />}
        {onglet === "zones" && <ZonesTab onOpenQr={ouvrirQr} />}
        {onglet === "qrcode" && <QrcodeTab zoneInitiale={zonePourQr ?? undefined} />}
        {onglet === "recompenses" && <RecompensesTab />}
        {onglet === "stats" && <StatsTab />}
        {onglet === "actions" && <ActionsTab />}
        {onglet === "commander" && <CommanderTab />}
        {onglet === "billing" && <BillingTab />}
        {onglet === "settings" && <SettingsTab />}
        {/* Task 2-4 — onglets aéroport (secteur « Aéroport » uniquement). */}
        {onglet === "airport-wallboard" && <AirportWallboardTab />}
        {onglet === "airport-zones" && <AirportZonesTab />}
        {onglet === "airport-reports" && <AirportReportsTab />}
        {onglet === "airport-leaderboard" && <AirportLeaderboardTab />}
        {onglet === "airport-blackbox" && <AirportBlackboxTab />}
        {onglet === "airport-staff-qr" && <AirportStaffQrTab />}
        {onglet === "airport-vols" && <AirportFlightGatesTab />}
        {onglet === "airport-mode-emploi" && <AirportModeEmploiTab />}
        {onglet === "airport-bot" && <AirportBotTab />}
      </main>
    </div>
  )
}

// ---------- Bouton d'onglet (partagé : principaux + groupe Gestion) ----------

function BoutonOnglet({
  entree,
  actif,
  onNaviguer,
}: {
  entree: EntreeNav
  actif: boolean
  onNaviguer: (o: Onglet) => void
}) {
  const t = (key: string) => { const map: Record<string, string> = {"nav.dashboard": "Tableau de bord", "nav.coach": "Coach IA", "nav.auditMatin": "Audit Matin", "nav.zones": "Zones", "nav.retours": "Retours", "nav.team": "Equipe", "nav.stats": "Statistiques", "nav.qrcode": "QR Codes", "nav.settings": "Parametres", "nav.commander": "Commander", "nav.rapports": "Rapports IA", "nav.recompenses": "Recompenses", "nav.actions": "Actions", "nav.billing": "Facturation", "nav.airportWallboard": "Wallboard", "nav.airportZones": "Zones aéroport", "nav.airportReports": "Signalements", "nav.airportLeaderboard": "Classement", "nav.airportBot": "Bot WhatsApp", "nav.airportBlackBox": "Black Box", "nav.airportStaffQr": "QR Staff", "nav.airportVols": "Vols & Portes", "nav.airportModeEmploi": "Mode d'Emploi", "nav.aeroport": "Aéroport", "nav.gestion": "Gestion", "common.ouvrirMenu": "Ouvrir le menu", "common.navigationDashboard": "Navigation du dashboard", "common.deconnexion": "Deconnexion", "common.tableauBordFeedback": "Tableau de bord FeedbackPro", "common.promesseCoach": "Votre Coach analyse chaque jour vos zones de contact pour vous donner 3 priorites concretes."}; return map[key] || key }
  const Icon = entree.icon
  return (
    <button
      type="button"
      onClick={() => onNaviguer(entree.id)}
      aria-current={actif ? "page" : undefined}
      className={cn(
        "relative mx-3 flex h-11 shrink-0 items-center gap-3 rounded-2xl px-3.5 text-[11px] font-semibold uppercase tracking-wide transition-colors",
        actif
          ? "-mr-2 bg-background text-foreground shadow-[0_6px_18px_rgba(0,0,0,0.08)]"
          : "text-sidebar-foreground/80 hover:bg-sidebar-foreground/10 hover:text-sidebar-foreground"
      )}
    >
      <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden />
      <span className="truncate">{t(entree.labelKey)}</span>
      {entree.badge && entree.badge > 0 ? (
        <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white shadow-sm">
          {entree.badge > 99 ? "99+" : entree.badge}
        </span>
      ) : null}
    </button>
  )
}

// ---------- Contenu de la sidebar (partagé : desktop fixe + drawer mobile) ----------

function ContenuSidebar({
  ongletActif,
  onNaviguer,
  retoursNonLus = 0,
  estAeroport = false,
  airportEnAttente = 0,
}: {
  ongletActif: Onglet
  onNaviguer: (o: Onglet) => void
  retoursNonLus?: number
  estAeroport?: boolean
  airportEnAttente?: number
}) {
  const t = (key: string) => { const map: Record<string, string> = {"nav.dashboard": "Tableau de bord", "nav.coach": "Coach IA", "nav.auditMatin": "Audit Matin", "nav.zones": "Zones", "nav.retours": "Retours", "nav.team": "Equipe", "nav.stats": "Statistiques", "nav.qrcode": "QR Codes", "nav.settings": "Parametres", "nav.commander": "Commander", "nav.rapports": "Rapports IA", "nav.recompenses": "Recompenses", "nav.actions": "Actions", "nav.billing": "Facturation", "nav.airportWallboard": "Wallboard", "nav.airportZones": "Zones aéroport", "nav.airportReports": "Signalements", "nav.airportLeaderboard": "Classement", "nav.airportBot": "Bot WhatsApp", "nav.airportBlackBox": "Black Box", "nav.airportStaffQr": "QR Staff", "nav.airportVols": "Vols & Portes", "nav.airportModeEmploi": "Mode d'Emploi", "nav.aeroport": "Aéroport", "nav.gestion": "Gestion", "common.ouvrirMenu": "Ouvrir le menu", "common.navigationDashboard": "Navigation du dashboard", "common.deconnexion": "Deconnexion", "common.tableauBordFeedback": "Tableau de bord FeedbackPro", "common.promesseCoach": "Votre Coach analyse chaque jour vos zones de contact pour vous donner 3 priorites concretes."}; return map[key] || key }
  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Logo — shrink-0 pour rester visible en haut quand le nav scroll */}
      <div className="flex shrink-0 items-center gap-2.5 px-5 py-5">
        <img
          src="/logo-feedbackpro-transparent.png"
          alt="FeedbackPro"
          className="h-10 w-auto brightness-0 invert"
        />
        <span className="text-xs text-sidebar-foreground/70">Coach qualité continu</span>
      </div>

      {/* Navigation verticale : principaux, séparateur « Gestion », secondaires.
          flex-1 + min-h-0 + overflow-y-auto : scroll interne quand les 22
          entrées débordent (desktop 11" ou drawer mobile). Le header (logo)
          et le footer (promesse) restent fixes grâce à shrink-0 / mt-auto.
          Scrollbar fine et discrète (sidebar-foreground à 25% d'opacité). */}
      <nav aria-label={t("common.navigationDashboard")} className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto py-2 [scrollbar-width:thin] [scrollbar-color:rgba(125,125,125,0.25)_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-sidebar-foreground/25 [&::-webkit-scrollbar-thumb:hover]:bg-sidebar-foreground/40 [&::-webkit-scrollbar-track]:bg-transparent">
        {ONGLETS_PRINCIPAUX.map((o) => (
          <BoutonOnglet key={o.id} entree={{ ...o, badge: o.id === "retours" ? retoursNonLus : undefined }} actif={ongletActif === o.id} onNaviguer={onNaviguer} />
        ))}

        {/* Task 2-4 — Section « ✈️ Aéroport » — TOUJOURS visible (dashboard complet).
            Placée APRÈS les onglets principaux et AVANT le séparateur « Gestion »
            pour rester près des onglets opérationnels (Zones, Retours). */}
        <>
          <p
            className="px-6 pt-4 pb-1 text-[11px] font-semibold uppercase tracking-wider text-[#E8B54D]"
            role="presentation"
          >
            ✈️ {t("nav.aeroport")}
          </p>
          {ONGLETS_AEROPORT.map((o) => (
            <BoutonOnglet
              key={o.id}
              entree={{
                ...o,
                badge: o.id === "airport-reports" || o.id === "airport-wallboard"
                  ? (airportEnAttente > 0 ? airportEnAttente : undefined)
                  : undefined,
              }}
              actif={ongletActif === o.id}
              onNaviguer={onNaviguer}
            />
          ))}
        </>

        {/* Séparateur visuel : label « Gestion » en majuscules */}
        <p
          className="px-6 pt-4 pb-1 text-[11px] font-medium uppercase tracking-wider text-sidebar-foreground/50"
          role="presentation"
        >
          {t("nav.gestion")}
        </p>

        {ONGLETS_GESTION.map((o) => (
          <BoutonOnglet key={o.id} entree={o} actif={ongletActif === o.id} onNaviguer={onNaviguer} />
        ))}
      </nav>

      {/* Bas de sidebar : rappel de la promesse produit — shrink-0 pour
          rester ancré en bas quand le nav scroll au-dessus. */}
      <div className="mt-auto shrink-0 border-t border-sidebar-border p-4">
        <p className="text-[11px] leading-relaxed text-sidebar-foreground/60">
          {t("common.promesseCoach")}
        </p>
      </div>
    </div>
  )
}
