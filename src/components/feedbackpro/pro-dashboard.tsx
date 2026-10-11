"use client"

// ============================================================
// FeedbackPro - Dashboard Commerçant (layout avec sidebar)
// Session 4 §1 : sidebar fixe desktop (lg+) · header sticky · drawer mobile (Sheet)
// Les URLs /dashboard/* sont REWRITTÉES par next.config vers /?tab=<slug> :
// le slug est résolu côté client via window.location.pathname (SPA route unique).
// ============================================================

import { useEffect, useState } from "react"
import {
  LayoutDashboard,
  MessageSquareText,
  QrCode,
  Trophy,
  BarChart3,
  Settings,
  Menu,
  LogOut,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet"
import { cn } from "@/lib/utils"
import { useAppStore } from "@/store/app-store"
import { PLANS, type PlanId } from "@/lib/constants"
import { OverviewTab } from "@/components/feedbackpro/overview-tab"
import { RetoursTab } from "@/components/feedbackpro/retours-tab"
import { QrcodeTab } from "@/components/feedbackpro/qrcode-tab"
import { TeamTab } from "@/components/feedbackpro/team-tab"
import { StatsTab } from "@/components/feedbackpro/stats-tab"
import { SettingsTab } from "@/components/feedbackpro/settings-tab"

type Onglet = "overview" | "retours" | "qrcode" | "team" | "stats" | "settings"

/** Slug URL → onglet interne (ex. /dashboard/qr-code → "qrcode") */
const SLUG_TO_TAB: Record<string, Onglet> = {
  overview: "overview",
  retours: "retours",
  "qr-code": "qrcode",
  equipe: "team",
  stats: "stats",
  parametres: "settings",
}

/** Onglet interne → slug URL (ex. "qrcode" → /dashboard/qr-code) */
const TAB_TO_SLUG: Record<Onglet, string> = {
  overview: "overview",
  retours: "retours",
  qrcode: "qr-code",
  team: "equipe",
  stats: "stats",
  settings: "parametres",
}

const ONGLETS: { id: Onglet; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "overview", label: "Vue d'ensemble", icon: LayoutDashboard },
  { id: "retours", label: "Retours clients", icon: MessageSquareText },
  { id: "qrcode", label: "Mon QR Code", icon: QrCode },
  { id: "team", label: "Équipe", icon: Trophy },
  { id: "stats", label: "Statistiques", icon: BarChart3 },
  { id: "settings", label: "Paramètres", icon: Settings },
]

/** Lit l'onglet courant depuis l'URL visible (ex. pathname "/" → overview) */
function ongletDepuisUrl(): Onglet {
  try {
    const match = window.location.pathname.match(/^\/dashboard(?:\/([a-z-]+))?\/?$/)
    const slug = match?.[1]
    if (slug && slug in SLUG_TO_TAB) return SLUG_TO_TAB[slug]
    return "overview"
  } catch {
    return "overview"
  }
}

export function ProDashboard() {
  const [onglet, setOnglet] = useState<Onglet>(() => ongletDepuisUrl())
  const [menuOuvert, setMenuOuvert] = useState(false)
  const session = useAppStore((s) => s.session)
  const logout = useAppStore((s) => s.logout)

  const nomCommerce = session?.pro?.nomCommerce
  const plan = (session?.pro?.plan || "STARTER") as PlanId
  const planName = PLANS[plan] ? PLANS[plan].name : "Starter"

  // Boutons précédent / suivant du navigateur : resynchronise l'onglet
  useEffect(() => {
    function onPopState() {
      setOnglet(ongletDepuisUrl())
    }
    window.addEventListener("popstate", onPopState)
    return () => window.removeEventListener("popstate", onPopState)
  }, [])

  /** Change d'onglet et met à jour l'URL visible (/dashboard/<slug>) */
  function naviguer(o: Onglet) {
    setOnglet(o)
    try {
      window.history.pushState({}, "", o === "overview" ? "/dashboard" : "/dashboard/" + TAB_TO_SLUG[o])
    } catch {
      /* ignore */
    }
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
          {/* Gauche : burger (mobile) + logo compact + nom du commerce */}
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
              <QrCode className="h-4 w-4" />
            </div>
            <p className="truncate font-semibold">{nomCommerce || "Tableau de bord"}</p>
          </div>

          {/* Droite : badge plan, email, déconnexion */}
          <div className="flex shrink-0 items-center gap-2">
            <Badge variant="secondary" className="hidden md:inline-flex">
              {planName}
            </Badge>
            <span className="hidden max-w-48 truncate text-sm text-muted-foreground md:block">
              {session?.user?.email}
            </span>
            <Button variant="ghost" size="sm" onClick={() => logout()} aria-label="Se déconnecter">
              <LogOut className="h-4 w-4 sm:mr-1.5" aria-hidden />
              <span className="hidden sm:inline">Déconnexion</span>
            </Button>
          </div>
        </div>
      </header>

      {/* ---------- Contenu ---------- */}
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-5 sm:px-6 sm:py-7 lg:px-8">
        {onglet === "overview" && <OverviewTab />}
        {onglet === "retours" && <RetoursTab />}
        {onglet === "qrcode" && <QrcodeTab />}
        {onglet === "team" && <TeamTab />}
        {onglet === "stats" && <StatsTab />}
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
  const plan = useAppStore((s) => s.session?.pro?.plan || "STARTER")
  const planKey = plan as PlanId
  const planName = PLANS[planKey] ? PLANS[planKey].name : "Starter"

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
          <p className="text-xs text-muted-foreground">Espace commerçant</p>
        </div>
      </div>

      {/* Navigation verticale */}
      <nav aria-label="Navigation du dashboard" className="flex flex-col gap-1 py-2">
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

      {/* Bas de sidebar : plan + déconnexion */}
      <div className="mt-auto border-t p-4">
        <Badge variant="secondary" className="mb-2 w-full justify-center">
          {planName}
        </Badge>
        <Button
          variant="ghost"
          onClick={() => useAppStore.getState().logout()}
          className="w-full justify-start text-destructive hover:bg-destructive/10 hover:text-destructive"
          aria-label="Se déconnecter"
        >
          <LogOut className="h-4 w-4" aria-hidden />
          Déconnexion
        </Button>
      </div>
    </div>
  )
}
