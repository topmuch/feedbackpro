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
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { useAppStore } from "@/store/app-store"
import { PLANS, type PlanId } from "@/lib/constants"
import { NotificationsBell } from "@/components/feedbackpro/notifications-bell"
import { ThemeToggle } from "@/components/theme-toggle"
import { LanguageSelector } from "@/components/feedbackpro/language-selector"
import { configSecteur } from "@/lib/secteurs"
import { CoachIaTab } from "@/components/feedbackpro/coach-ia-tab"
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

type Onglet =
  | "coach"
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

/** Slug URL → onglet interne (ex. /dashboard/qr-codes → "qrcode") */
const SLUG_TO_TAB: Record<string, Onglet> = {
  coach: "coach",
  overview: "coach", // slug legacy (ancienne « Vue d'ensemble ») → Coach IA
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
}

/** Onglet interne → slug URL (ex. "qrcode" → /dashboard/qr-codes) */
const TAB_TO_SLUG: Record<Onglet, string> = {
  coach: "coach",
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
}

// ---------- Navigation (Session 4) : 7 onglets principaux + groupe « Gestion » ----------

type EntreeNav = { id: Onglet; label: string; icon: React.ComponentType<{ className?: string }> }

/** Onglets principaux — l'ordre ci-dessous est la spec Session 4 */
const ONGLETS_PRINCIPAUX: EntreeNav[] = [
  { id: "coach", label: "Coach IA", icon: Bot },
  { id: "zones", label: "Zones", icon: MapPin },
  { id: "retours", label: "Retours", icon: Inbox },
  { id: "team", label: "Équipe", icon: Users },
  { id: "stats", label: "Statistiques", icon: BarChart3 },
  { id: "qrcode", label: "QR Codes", icon: QrCode },
  { id: "settings", label: "Paramètres", icon: Settings },
]

/** Onglets secondaires, après le séparateur « Gestion » */
const ONGLETS_GESTION: EntreeNav[] = [
  { id: "commander", label: "Commander", icon: ShoppingBag },
  { id: "rapports", label: "Rapports IA", icon: FileText },
  { id: "recompenses", label: "Récompenses", icon: Gift },
  { id: "actions", label: "Actions", icon: ClipboardCheck },
  { id: "billing", label: "Facturation", icon: CreditCard },
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
  try {
    const match = window.location.pathname.match(/^\/dashboard(?:\/([a-z-]+))?\/?$/)
    const slug = match?.[1] ?? new URLSearchParams(window.location.search).get("tab")
    if (slug && slug in SLUG_TO_TAB) return SLUG_TO_TAB[slug]
    return "coach"
  } catch {
    return "coach"
  }
}

export function ProDashboard() {
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
      <div className="flex min-h-screen flex-col bg-muted/30 lg:pl-80 lg:pr-3">
        <aside className="fixed inset-y-3 left-3 z-40 hidden w-72 flex-col rounded-3xl bg-[#002e85] text-white shadow-xl lg:flex">
          <div className="flex items-center gap-2.5 px-5 py-5">
            <Skeleton className="h-10 w-10 rounded-xl bg-white/20" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3.5 w-24 bg-white/20" />
              <Skeleton className="h-2.5 w-16 bg-white/20" />
            </div>
          </div>
          <div className="space-y-2 px-3 py-2">
            {ONGLETS.map((o) => (
              <Skeleton key={o.id} className="mx-0 h-10 rounded-xl bg-white/15" />
            ))}
          </div>
        </aside>
        <header className="sticky top-3 z-30 mx-3 mt-3 lg:mx-0">
          <div className="flex h-14 items-center justify-between gap-3 rounded-3xl bg-card px-4 shadow-sm sm:h-16 sm:px-5">
            <Skeleton className="h-8 w-8 rounded-lg lg:hidden" />
            <Skeleton className="h-5 w-40" />
            <div className="flex-1" />
            <Skeleton className="h-6 w-16 rounded-full" />
            <Skeleton className="h-9 w-9 rounded-lg" />
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 space-y-4 px-3 py-5 sm:px-5 lg:px-6">
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
    <div className="flex min-h-screen flex-col bg-muted/30 lg:pl-80 lg:pr-3">
      {/* ---------- Sidebar détachée (desktop lg+) ---------- */}
      <aside className="fixed inset-y-3 left-3 z-40 hidden w-72 flex-col rounded-3xl bg-[#002e85] text-white shadow-xl lg:flex">
        <ContenuSidebar ongletActif={onglet} onNaviguer={naviguer} />
      </aside>

      {/* ---------- Top bar discrète (card blanc arrondie) ---------- */}
      <header className="sticky top-3 z-30 mx-3 mt-3 lg:mx-0">
        <div className="flex h-14 items-center justify-between gap-3 rounded-3xl bg-card px-4 shadow-sm sm:h-16 sm:px-5">
          {/* Gauche : burger (mobile) + nom de l'établissement + secteur */}
          <div className="flex min-w-0 items-center gap-2.5">
            <Sheet open={menuOuvert} onOpenChange={setMenuOuvert}>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-foreground hover:bg-muted lg:hidden"
                  aria-label="Ouvrir le menu"
                  aria-expanded={menuOuvert}
                >
                  <Menu className="h-5 w-5" aria-hidden />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 border-0 bg-[#002e85] p-0 text-white" aria-describedby={undefined}>
                <SheetTitle className="sr-only">Navigation du dashboard</SheetTitle>
                <ContenuSidebar
                  ongletActif={onglet}
                  onNaviguer={(o) => {
                    naviguer(o)
                    setMenuOuvert(false)
                  }}
                />
              </SheetContent>
            </Sheet>
            {/* D7 : sélecteur d'établissement (multi-sites) — affiché uniquement
                si le groupe compte plusieurs établissements. Le switch complet
                nécessite une session dédiée ; le sélecteur liste donc les
                établissements et indique l'actif ( coche ). */}
            {etablissements.length > 1 ? (
              <Select value={etablissements.find((e) => e.courant)?.id ?? etablissements[0]?.id} disabled>
                <SelectTrigger
                  className="h-9 w-[180px] border-0 bg-muted text-xs font-semibold hover:bg-muted sm:w-[220px]"
                  aria-label="Sélectionner un établissement"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {etablissements.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.courant ? "📍 " : "🏢 "}
                      {e.nomEtablissement}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <div className="min-w-0">
                <p className="truncate font-semibold text-foreground">{nomEtablissement}</p>
                <p className="hidden truncate text-xs text-muted-foreground sm:block">Tableau de bord FeedbackPro</p>
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
                    aria-label="Se déconnecter"
                  >
                    <LogOut className="h-4.5 w-4.5" aria-hidden />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Se déconnecter</TooltipContent>
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

      {/* ---------- Contenu ---------- */}
      <main className="mx-auto w-full max-w-7xl flex-1 px-3 py-5 sm:px-5 sm:py-7 lg:px-6">
        {onglet === "coach" && <CoachIaTab onOuvrirRapports={() => naviguer("rapports")} />}
        {onglet === "rapports" && <RapportsTab />}
        {onglet === "retours" && <RetoursTab />}
        {onglet === "team" && <TeamTab />}
        {onglet === "zones" && <ZonesTab onOpenQr={ouvrirQr} />}
        {onglet === "qrcode" && <QrcodeTab zoneInitiale={zonePourQr ?? undefined} />}
        {onglet === "recompenses" && <RecompensesTab />}
        {onglet === "stats" && <StatsTab />}
        {onglet === "actions" && <ActionsTab />}
        {onglet === "commander" && <CommanderTab />}
        {onglet === "billing" && <BillingTab />}
        {onglet === "settings" && <SettingsTab />}
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
  const Icon = entree.icon
  return (
    <button
      type="button"
      onClick={() => onNaviguer(entree.id)}
      aria-current={actif ? "page" : undefined}
      className={cn(
        "relative mx-3 flex h-11 shrink-0 items-center gap-3 rounded-2xl px-3.5 text-sm transition-colors",
        actif
          ? "bg-white/15 font-semibold text-white"
          : "text-white/80 hover:bg-white/10 hover:text-white"
      )}
    >
      <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden />
      <span className="truncate">{entree.label}</span>
    </button>
  )
}

// ---------- Contenu de la sidebar (partagé : desktop fixe + drawer mobile) ----------

function ContenuSidebar({
  ongletActif,
  onNaviguer,
}: {
  ongletActif: Onglet
  onNaviguer: (o: Onglet) => void
}) {
  return (
    <div className="flex h-full flex-col">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 py-5">
        <img
          src="/logo-feedbackpro-transparent.png"
          alt="FeedbackPro"
          className="h-10 w-auto brightness-0 invert"
        />
        <span className="text-xs text-white/70">Coach qualité continu</span>
      </div>

      {/* Navigation verticale : principaux, séparateur « Gestion », secondaires */}
      <nav aria-label="Navigation du dashboard" className="flex flex-col gap-1 overflow-y-auto py-2 custom-scrollbar">
        {ONGLETS_PRINCIPAUX.map((o) => (
          <BoutonOnglet key={o.id} entree={o} actif={ongletActif === o.id} onNaviguer={onNaviguer} />
        ))}

        {/* Séparateur visuel : label « Gestion » en majuscules */}
        <p
          className="px-6 pt-4 pb-1 text-[11px] font-medium uppercase tracking-wider text-white/50"
          role="presentation"
        >
          Gestion
        </p>

        {ONGLETS_GESTION.map((o) => (
          <BoutonOnglet key={o.id} entree={o} actif={ongletActif === o.id} onNaviguer={onNaviguer} />
        ))}
      </nav>

      {/* Bas de sidebar : rappel de la promesse produit */}
      <div className="mt-auto border-t border-white/10 p-4">
        <p className="text-[11px] leading-relaxed text-white/60">
          Votre Coach analyse chaque jour vos zones de contact pour vous donner 3 priorités concrètes.
        </p>
      </div>
    </div>
  )
}
