"use client"

// ============================================================
// FeedbackPro - Dashboard Commerçant — coquille à 9 onglets (Session 1)
// Coach IA (accueil) · Retours · Équipe · Zones · QR Codes · Statistiques
// · Actions · Facturation · Paramètres
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
  Menu,
  LogOut,
  AlertTriangle,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { useAppStore } from "@/store/app-store"
import { PLANS, type PlanId } from "@/lib/constants"
import { CoachIaTab } from "@/components/feedbackpro/coach-ia-tab"
import { RetoursTab } from "@/components/feedbackpro/retours-tab"
import { TeamTab } from "@/components/feedbackpro/team-tab"
import { ZonesTab } from "@/components/feedbackpro/zones-tab"
import { QrcodeTab } from "@/components/feedbackpro/qrcode-tab"
import { StatsTab } from "@/components/feedbackpro/stats-tab"
import { ActionsTab } from "@/components/feedbackpro/actions-tab"
import { BillingTab } from "@/components/feedbackpro/billing-tab"
import { RecompensesTab } from "@/components/feedbackpro/recompenses-tab"
import { SettingsTab } from "@/components/feedbackpro/settings-tab"

type Onglet =
  | "coach"
  | "retours"
  | "team"
  | "zones"
  | "qrcode"
  | "recompenses"
  | "stats"
  | "actions"
  | "billing"
  | "settings"

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
  recompenses: "recompenses",
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
  recompenses: "recompenses",
  stats: "stats",
  actions: "actions",
  billing: "billing",
  settings: "parametres",
}

const ONGLETS: { id: Onglet; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "coach", label: "Coach IA", icon: Bot },
  { id: "retours", label: "Retours", icon: Inbox },
  { id: "team", label: "Équipe", icon: Users },
  { id: "zones", label: "Zones", icon: MapPin },
  { id: "qrcode", label: "QR Codes", icon: QrCode },
  { id: "recompenses", label: "Récompenses", icon: Gift },
  { id: "stats", label: "Statistiques", icon: BarChart3 },
  { id: "actions", label: "Actions", icon: ClipboardCheck },
  { id: "billing", label: "Facturation", icon: CreditCard },
  { id: "settings", label: "Paramètres", icon: Settings },
]

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
  /** Compte suspendu : le guard API renvoie déjà 403, on affiche la bannière */
  const suspendu = (pro as Record<string, unknown> | undefined)?.suspendu === true

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
      <div className="flex min-h-screen flex-col lg:pl-64">
        <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r bg-background lg:flex">
          <div className="flex items-center gap-2.5 px-4 py-5">
            <Skeleton className="h-10 w-10 rounded-xl" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3.5 w-24" />
              <Skeleton className="h-2.5 w-16" />
            </div>
          </div>
          <div className="space-y-2 px-3 py-2">
            {ONGLETS.map((o) => (
              <Skeleton key={o.id} className="mx-0 h-10 rounded-lg" />
            ))}
          </div>
        </aside>
        <header className="sticky top-0 z-30 h-14 border-b bg-background/95 sm:h-16">
          <div className="mx-auto flex h-full w-full max-w-7xl items-center gap-3 px-4 sm:px-6 lg:px-8">
            <Skeleton className="h-8 w-8 lg:hidden" />
            <Skeleton className="h-5 w-40" />
            <div className="flex-1" />
            <Skeleton className="h-6 w-16 rounded-full" />
            <Skeleton className="h-9 w-9 rounded-lg" />
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 space-y-4 px-4 py-6 sm:px-6 lg:px-8">
          <Skeleton className="h-10 w-72" />
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-64 rounded-xl" />
        </main>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col lg:pl-64">
      {/* ---------- Sidebar fixe desktop (lg+) ---------- */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r bg-background lg:flex">
        <ContenuSidebar ongletActif={onglet} onNaviguer={naviguer} />
      </aside>

      {/* ---------- Header sticky ---------- */}
      <header className="sticky top-0 z-30 h-14 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:h-16">
        <div className="mx-auto flex h-full w-full max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
          {/* Gauche : burger (mobile) + logo compact + nom de l'établissement */}
          <div className="flex min-w-0 items-center gap-2">
            <Sheet open={menuOuvert} onOpenChange={setMenuOuvert}>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="lg:hidden"
                  aria-label="Ouvrir le menu"
                  aria-expanded={menuOuvert}
                >
                  <Menu className="h-5 w-5" aria-hidden />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 p-0" aria-describedby={undefined}>
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
            <div
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground lg:hidden"
              aria-hidden
            >
              <Bot className="h-4 w-4" />
            </div>
            <p className="truncate font-semibold">{nomEtablissement}</p>
          </div>

          {/* Droite : badge plan + déconnexion (icône + tooltip) */}
          <div className="flex shrink-0 items-center gap-2">
            <Badge variant="secondary">{planName}</Badge>
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => logout()}
                    className="text-muted-foreground hover:text-destructive"
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
        <div className="border-b border-destructive/30 bg-destructive/10" role="alert">
          <div className="mx-auto flex w-full max-w-7xl items-center gap-2.5 px-4 py-2.5 text-sm text-destructive sm:px-6 lg:px-8">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
            <p>
              <span className="font-semibold">Compte suspendu.</span> Vos pages clients restent visibles mais
              les données sont figées — contactez le support pour réactiver votre abonnement.
            </p>
          </div>
        </div>
      )}

      {/* ---------- Contenu ---------- */}
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-5 sm:px-6 sm:py-7 lg:px-8">
        {onglet === "coach" && <CoachIaTab />}
        {onglet === "retours" && <RetoursTab />}
        {onglet === "team" && <TeamTab />}
        {onglet === "zones" && <ZonesTab onOpenQr={ouvrirQr} />}
        {onglet === "qrcode" && <QrcodeTab zoneInitiale={zonePourQr ?? undefined} />}
        {onglet === "recompenses" && <RecompensesTab />}
        {onglet === "stats" && <StatsTab />}
        {onglet === "actions" && <ActionsTab />}
        {onglet === "billing" && <BillingTab />}
        {onglet === "settings" && <SettingsTab />}
      </main>
    </div>
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
      <div className="flex items-center gap-2.5 px-4 py-4 sm:py-5">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm"
          aria-hidden
        >
          <QrCode className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="truncate font-bold leading-tight">FeedbackPro</p>
          <p className="text-xs text-muted-foreground">Coach qualité continu</p>
        </div>
      </div>

      {/* Navigation verticale */}
      <nav aria-label="Navigation du dashboard" className="flex flex-col gap-1 overflow-y-auto py-2 custom-scrollbar">
        {ONGLETS.map((o) => {
          const Icon = o.icon
          const actif = ongletActif === o.id
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => onNaviguer(o.id)}
              aria-current={actif ? "page" : undefined}
              className={cn(
                "relative mx-3 flex h-10 shrink-0 items-center gap-3 rounded-lg px-3 text-sm transition-colors",
                actif
                  ? "bg-primary/10 font-medium text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              {actif && (
                <span
                  className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-primary"
                  aria-hidden
                />
              )}
              <Icon className="h-4 w-4 shrink-0" aria-hidden />
              <span className="truncate">{o.label}</span>
            </button>
          )
        })}
      </nav>

      {/* Bas de sidebar : rappel de la promesse produit */}
      <div className="mt-auto border-t p-4">
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Votre Coach analyse chaque jour vos zones de contact pour vous donner 3 priorités concrètes.
        </p>
      </div>
    </div>
  )
}
