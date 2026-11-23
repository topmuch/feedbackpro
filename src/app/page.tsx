"use client"

// Force dynamic rendering — empêche Next.js de mettre en cache la page
// NOTE: revalidate et fetchCache ne sont PAS valides sur les Client Components
export const dynamic = 'force-dynamic'

// ============================================================
// FeedVoice - Application monopage (SPA)
// Routage par état : Landing · Auth · Scan · Dashboards
// Le paramètre d'URL ?scan=<token> correspond au QR code scanné
// ============================================================

import React, { useEffect } from "react"
import { Loader2 } from "lucide-react"
import { useAppStore, tokenDepuisUrl, airportTagDepuisUrl, vipQrDepuisUrl } from "@/store/app-store"
import type { View } from "@/store/app-store"
import { LandingView } from "@/components/feedbackpro/landing-view"
import { AuthView, AuthViewAdmin, TenantSelectionStep } from "@/components/feedbackpro/auth-view"
import { ScanView } from "@/components/feedbackpro/scan-view"
import { AirportScanView } from "@/components/feedbackpro/airport-scan-view"
import { AirportStaffView } from "@/components/feedbackpro/airport-staff-view"
import { ProDashboard } from "@/components/feedbackpro/pro-dashboard"
import { AdminDashboard } from "@/components/feedbackpro/admin-dashboard"
import AirlineDashboard from "@/components/feedbackpro/airline-dashboard"
import VIPDashboard from "@/components/feedbackpro/vip-dashboard"
import CityDashboard from "@/components/feedbackpro/city-dashboard"
import { VipTableScan } from "@/components/feedbackpro/vip-table-scan"
import { VipStaffView } from "@/components/feedbackpro/vip-staff-view"
import { AppFooter } from "@/components/feedbackpro/shared"

/**
 * Vues qui doivent afficher le pied de page global (AppFooter).
 * Les vues plein écran (scan, airport, airline, vip, onboarding-tenant)
 * et la landing (footer dédié) en sont exclues. Cette liste explicite
 * évite les comparaisons `view !== "..."` qui cassent le narrowing TS
 * quand la View union s'enrichit de nouveaux types (airport-ops, etc.).
 */
const FOOTER_VIEWS: ReadonlySet<View> = new Set<View>([
  "auth",
  "dashboard",
  "admin",
  "airport-ops",
])


class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false, error: "" }
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message }
  }
  render() {
    if (this.state.hasError) {
      return (
        <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
          <h1 className="text-xl font-bold text-red-600">Erreur de chargement</h1>
          <p className="text-sm text-muted-foreground max-w-md text-center">{this.state.error}</p>
          <button onClick={() => window.location.reload()} className="rounded-lg bg-primary px-4 py-2 text-white">
            Recharger
          </button>
        </main>
      )
    }
    return this.props.children
  }
}

export default function Home() {
  const view = useAppStore((s) => s.view)
  const scanToken = useAppStore((s) => s.scanToken)
  const airportTag = useAppStore((s) => s.airportTag)
  const session = useAppStore((s) => s.session)
  const booted = useAppStore((s) => s.booted)
  const refreshSession = useAppStore((s) => s.refreshSession)
  const openScan = useAppStore((s) => s.openScan)
  const openAirport = useAppStore((s) => s.openAirport)
  const openStaff = useAppStore((s) => s.openStaff)
  const openVipTable = useAppStore((s) => s.openVipTable)
  // QR_ROUTING — ouvre Nathalie en mode GLOBAL (QR d'entrée, sans table)
  const openVipGlobal = useAppStore((s) => s.openVipGlobal)
  const openVipStaff = useAppStore((s) => s.openVipStaff)
  const setAuthMode = useAppStore((s) => s.setAuthMode)
  const setView = useAppStore((s) => s.setView)

  // D6 : enregistrement du Service Worker (PWA installable) — best effort,
  // silencieux en cas d'échec (navigateurs sans SW / mode privé).
  // Anti-stale après déploiement : reg.update() immédiat + auto-reload UNE
  // fois au controllerchange (garde-fou sessionStorage) — sinon le visiteur
  // régulier reste des heures sur l'ancien SW et voit l'ancienne page.
  // Task M3 : au boot ET sur l'event 'online', on rejoue aussi les retours
  // offline stockés dans IndexedDB (au cas où Background Sync ne l'ait pas fait).
  // Observabilité : installe le reporter d'erreurs navigateur (ring buffer
  // superadmin via /api/log-error).
  useEffect(() => {
    if (typeof window === "undefined") return

    // Reporter d'erreurs (indépendant du SW — même sans PWA).
    import("@/lib/client-error-reporter")
      .then(({ installerReporterErreurs }) => installerReporterErreurs())
      .catch(() => undefined)

    if (!("serviceWorker" in navigator)) return
    const register = () => {
      navigator.serviceWorker
        .register("/sw.js")
        .then((reg) => {
          // Re-télécharge immédiatement /sw.js (sinon le navigateur ne
          // re-vérifie que périodiquement, ≤ 24 h entre les visites).
          try {
            reg.update().catch(() => undefined)
          } catch {
            /* update non supporté : best-effort */
          }
          // Auto-reload une seule fois par session quand un nouveau SW
          // prend le contrôle de la page (après un déploiement).
          const CLE_RELOAD = "fp-sw-reloaded"
          let dejaRecharge = false
          try {
            dejaRecharge = sessionStorage.getItem(CLE_RELOAD) === "1"
          } catch {
            /* sessionStorage indisponible : on reste prudent */
          }
          if (!dejaRecharge) {
            navigator.serviceWorker.addEventListener("controllerchange", () => {
              try {
                sessionStorage.setItem(CLE_RELOAD, "1")
              } catch {
                /* cas marginal : on recharge quand même */
              }
              window.location.reload()
            })
          }
        })
        .catch(() => {
          /* silencieux : la PWA reste utilisable sans SW */
        })
    }
    if (document.readyState === "complete") register()
    else window.addEventListener("load", register, { once: true })

    // Task M3 — Rejoue les retours offline au boot + sur l'événement 'online'
    let annule = false
    import("@/lib/offline-sync")
      .then(({ rejouerRetoursOfflineLocal }) => {
        if (annule) return
        rejouerRetoursOfflineLocal().catch(() => undefined)
        const onOnline = () => rejouerRetoursOfflineLocal().catch(() => undefined)
        window.addEventListener("online", onOnline)
        // Cleanup : pas parfait (l'event listener reste si l'import résout
        // après le unmount), mais acceptable pour un effet de boot.
      })
      .catch(() => undefined)
    return () => {
      annule = true
    }
  }, [])

  // Démarrage : détecte le QR scanné (/r/<token> via rewrite, ou ?scan=<token>)
  // puis charge la session. Gère aussi /login et /register (rewrités vers /) :
  // avec les rewrites, l'URL navigateur conserve le PATHNAME → on le lit
  // en priorité, les query params ?auth= restent en secours.
  useEffect(() => {
    const token = tokenDepuisUrl()
    if (token) openScan(token)
    const airportTagInit = airportTagDepuisUrl()
    if (airportTagInit) openAirport(airportTagInit)
    // QR Staff Only : ?staff=<tag>
    const staffTag = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("staff") : null
    if (staffTag) openStaff(staffTag)
    // QR_ROUTING — Nathalie : DEUX comportements selon le QR scanné.
    //   - ?qr_type=CLIENT_GLOBAL            → QR d'ENTRÉE (chevalet) :
    //     Nathalie s'ouvre SANS table assignée (current_zone = null).
    //   - ?qr_type=CLIENT_ZONE&zone_id=<tok> → QR de TABLE contextuel.
    //   - ?vipTable=<tok>                    → forme historique conservée.
    const vipQr = vipQrDepuisUrl()
    if (vipQr.qrType === "CLIENT_GLOBAL") openVipGlobal()
    else if (vipQr.token) openVipTable(vipQr.token)
    // VIP Staff PWA : ?vipStaff=<tag>
    const vipStaffTag = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("vipStaff") : null
    if (vipStaffTag) openVipStaff(vipStaffTag)
    refreshSession().then(() => {
      try {
        const chemin = window.location.pathname
        const params = new URLSearchParams(window.location.search)
        const auth = chemin === "/login" ? "login" : chemin === "/register" ? "register" : params.get("auth")
        if ((auth === "login" || auth === "register") && !useAppStore.getState().session) {
          setAuthMode(auth === "login" ? "login" : "signup")
        }
        // LOGIN-2 — Page de connexion SuperAdmin dédiée (/admin-login) :
        //   - non connecté          → vue auth-admin (formulaire noir/or)
        //   - connecté SUPERADMIN   → deriveView route déjà vers "admin"
        //   - connecté non-admin    → deriveView route vers son dashboard
        if (chemin === "/admin-login" && !useAppStore.getState().session) {
          setView("auth-admin")
        }
      } catch {
        /* ignore */
      }
    })
  }, [openScan, openAirport, openStaff, openVipTable, openVipGlobal, openVipStaff, refreshSession, setAuthMode])

  // Bouton retour navigateur : resynchronise le token de scan ou le tag aéroport/staff
  useEffect(() => {
    function onPop() {
      const token = tokenDepuisUrl()
      if (token && token !== scanToken) openScan(token)
      const atag = airportTagDepuisUrl()
      if (atag && atag !== airportTag) openAirport(atag)
      const stag = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("staff") : null
      if (stag) openStaff(stag)
      // QR_ROUTING — resynchronisation Nathalie (global ou table) au retour navigateur
      const vqr = vipQrDepuisUrl()
      if (vqr.qrType === "CLIENT_GLOBAL") openVipGlobal()
      else if (vqr.token) openVipTable(vqr.token)
      const vsstag = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("vipStaff") : null
      if (vsstag) openVipStaff(vsstag)
    }
    window.addEventListener("popstate", onPop)
    return () => window.removeEventListener("popstate", onPop)
  }, [openScan, openAirport, openStaff, openVipTable, openVipGlobal, openVipStaff, scanToken, airportTag])

  // ---------- Écran de chargement initial ----------
  if (!booted || view === "loading") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background" aria-busy="true" aria-label="Chargement">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden />
          <p className="text-sm text-muted-foreground">Chargement de FeedVoice…</p>
        </div>
      </main>
    )
  }

  // ---------- Flux de scan client final (mobile, sans footer) ----------
  if (view === "scan" && scanToken) {
    return (
      <main className="min-h-screen bg-background">
        <ScanView token={scanToken} onExit={() => useAppStore.getState().closeScan()} />
      </main>
    )
  }

  // ---------- PWA Aéroport (voyageur, sans footer, plein écran) ----------
  if (view === "airport" && airportTag) {
    return (
      <main className="min-h-screen bg-background">
        <AirportScanView tag={airportTag} onExit={() => useAppStore.getState().closeAirport()} />
      </main>
    )
  }

  // ---------- PWA Staff Only (employé, sans footer) ----------
  if (view === "airport-staff") {
    const staffTag = useAppStore.getState().staffTag ?? (typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("staff") ?? "staff" : "staff")
    return (
      <main className="min-h-screen bg-background">
        <AirportStaffView staffTag={staffTag} onExit={() => useAppStore.getState().closeStaff()} />
      </main>
    )
  }

  // ---------- TENANT-3 — Étape onboarding tenant (après inscription) ----------
  if (view === "onboarding-tenant") {
    return (
      <main className="min-h-screen bg-background">
        <TenantSelectionStep />
      </main>
    )
  }

  // ---------- TENANT-3 — Dashboards par type de tenant ----------
  if (view === "airline") {
    return (
      <main className="min-h-screen bg-background">
        <AirlineDashboard />
      </main>
    )
  }
  if (view === "vip") {
    return (
      <main className="min-h-screen bg-background">
        <VIPDashboard />
      </main>
    )
  }
  if (view === "city") {
    return (
      <main className="min-h-screen bg-background">
        <CityDashboard />
      </main>
    )
  }

  // ---------- QR_ROUTING — Vue Nathalie (client salon VIP) ----------
  // DEUX comportements distincts selon le QR scanné :
  //   1. CLIENT_GLOBAL (QR d'entrée sur le chevalet) : qrToken = null →
  //      Nathalie s'ouvre SANS table (écran d'accueil global).
  //   2. CLIENT_ZONE (QR de table) : qrToken = <token> → Nathalie
  //      s'ouvre AVEC la table assignée (comportement historique).
  if (view === "vip-table") {
    const mode = useAppStore.getState().vipQrType
    const tok = useAppStore.getState().vipTableToken
    if (mode === "CLIENT_GLOBAL") {
      return (
        <main className="min-h-screen bg-background">
          <VipTableScan
            qrToken={null}
            qrType="CLIENT_GLOBAL"
            onExit={() => useAppStore.getState().closeVipTable()}
          />
        </main>
      )
    }
    if (tok) {
      return (
        <main className="min-h-screen bg-background">
          <VipTableScan
            qrToken={tok}
            qrType="CLIENT_ZONE"
            onExit={() => useAppStore.getState().closeVipTable()}
          />
        </main>
      )
    }
  }

  // ---------- VIP Staff PWA (?vipStaff=<tag>) ----------
  if (view === "vip-staff") {
    const stag = useAppStore.getState().vipStaffTag ?? "login"
    return (
      <main className="min-h-screen bg-background">
        <VipStaffView staffTag={stag} onExit={() => useAppStore.getState().closeVipStaff()} />
      </main>
    )
  }

  // ---------- Navigation ----------
  // LOGIN-2 — Les CTAs de connexion pointent vers les pages dédiées :
  //   - login/signup → /login (établissements, crème/or)
  //   - l'espace SuperAdmin a son propre chemin /admin-login (noir/or),
  //     accessible via un lien dédié sur la page de connexion établissements.
  const nav = {
    login: () => {
      try {
        if (typeof window !== "undefined" && window.location.pathname !== "/login") {
          window.history.replaceState({}, "", "/login")
        }
      } catch {
        /* ignore */
      }
      setAuthMode("login")
    },
    signup: () => {
      try {
        if (typeof window !== "undefined" && window.location.pathname !== "/login") {
          window.history.replaceState({}, "", "/login")
        }
      } catch {
        /* ignore */
      }
      setAuthMode("signup")
    },
    landing: () => {
      try {
        if (typeof window !== "undefined" && window.location.pathname === "/login") {
          window.history.replaceState({}, "", "/")
        }
      } catch {
        /* ignore */
      }
      setView("landing")
    },
  }

  return (
    <ErrorBoundary>
    <div className="flex min-h-screen flex-col bg-background">
      <main className="flex-1 flex flex-col">
        {view === "landing" && <LandingView onLogin={nav.login} onSignup={nav.signup} />}
        {view === "auth" && <AuthView />}
        {view === "auth-admin" && <AuthViewAdmin />}
        {view === "dashboard" &&
          (session?.user.role === "PRO" ? (
            <ProDashboard />
          ) : session?.user.role === "SUPERADMIN" ? (
            <AdminDashboard />
          ) : (
            <LandingView onLogin={nav.login} onSignup={nav.signup} />
          ))}
        {view === "admin" && (session?.user.role === "SUPERADMIN" ? <AdminDashboard /> : <LandingView onLogin={nav.login} onSignup={nav.signup} />)}
      </main>
      {/* Le pied de page global reste collé en bas (mt-auto) sur auth/dashboard.
          La landing possède son propre footer complet (liens légaux).
          On affiche AppFooter uniquement sur les vues "avec chrome" :
          auth, dashboard, admin et airport-ops (vue opérations). Les vues
          full-screen (scan, airport, airline, vip, onboarding-tenant) et
          la landing (footer dédié) ne reçoivent pas AppFooter. */}
      {FOOTER_VIEWS.has(view) && <AppFooter />}
    </div>
    </ErrorBoundary>
  )
}
