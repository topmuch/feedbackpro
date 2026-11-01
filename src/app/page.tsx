"use client"

// ============================================================
// FeedbackPro - Application monopage (SPA)
// Routage par état : Landing · Auth · Scan · Dashboards
// Le paramètre d'URL ?scan=<token> correspond au QR code scanné
// ============================================================

import { useEffect } from "react"
import { Loader2 } from "lucide-react"
import { useAppStore, tokenDepuisUrl } from "@/store/app-store"
import { LandingView } from "@/components/feedbackpro/landing-view"
import { AuthView } from "@/components/feedbackpro/auth-view"
import { ScanView } from "@/components/feedbackpro/scan-view"
import { ProDashboard } from "@/components/feedbackpro/pro-dashboard"
import { AdminDashboard } from "@/components/feedbackpro/admin-dashboard"
import { AppFooter } from "@/components/feedbackpro/shared"

export default function Home() {
  const view = useAppStore((s) => s.view)
  const scanToken = useAppStore((s) => s.scanToken)
  const session = useAppStore((s) => s.session)
  const booted = useAppStore((s) => s.booted)
  const refreshSession = useAppStore((s) => s.refreshSession)
  const openScan = useAppStore((s) => s.openScan)
  const setAuthMode = useAppStore((s) => s.setAuthMode)
  const setView = useAppStore((s) => s.setView)

  // D6 : enregistrement du Service Worker (PWA installable) — best effort,
  // silencieux en cas d'échec (navigateurs sans SW / mode privé).
  useEffect(() => {
    if (typeof window === "undefined") return
    if (!("serviceWorker" in navigator)) return
    // En production seulement : en dev, le SW peut cacher les changements.
    // On l'active tout de même pour pouvoir tester l'installabilité.
    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* silencieux : la PWA reste utilisable sans SW */
      })
    }
    if (document.readyState === "complete") register()
    else window.addEventListener("load", register, { once: true })
  }, [])

  // Démarrage : détecte le QR scanné (/r/<token> via rewrite, ou ?scan=<token>)
  // puis charge la session. Gère aussi /login et /register (rewrités vers /) :
  // avec les rewrites, l'URL navigateur conserve le PATHNAME → on le lit
  // en priorité, les query params ?auth= restent en secours.
  useEffect(() => {
    const token = tokenDepuisUrl()
    if (token) openScan(token)
    refreshSession().then(() => {
      try {
        const chemin = window.location.pathname
        const params = new URLSearchParams(window.location.search)
        const auth = chemin === "/login" ? "login" : chemin === "/register" ? "register" : params.get("auth")
        if ((auth === "login" || auth === "register") && !useAppStore.getState().session) {
          setAuthMode(auth === "login" ? "login" : "signup")
        }
      } catch {
        /* ignore */
      }
    })
  }, [openScan, refreshSession, setAuthMode])

  // Bouton retour navigateur : resynchronise le token de scan
  useEffect(() => {
    function onPop() {
      const token = tokenDepuisUrl()
      if (token && token !== scanToken) openScan(token)
    }
    window.addEventListener("popstate", onPop)
    return () => window.removeEventListener("popstate", onPop)
  }, [openScan, scanToken])

  // ---------- Écran de chargement initial ----------
  if (!booted || view === "loading") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background" aria-busy="true" aria-label="Chargement">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden />
          <p className="text-sm text-muted-foreground">Chargement de FeedbackPro…</p>
        </div>
      </main>
    )
  }

  // ---------- Flux de scan client final (mobile, sans footer) ----------
  if (view === "scan" && scanToken) {
    return (
      <main className="min-h-screen bg-stone-100">
        <ScanView token={scanToken} onExit={() => useAppStore.getState().closeScan()} />
      </main>
    )
  }

  // ---------- Navigation ----------
  const nav = {
    login: () => setAuthMode("login"),
    signup: () => setAuthMode("signup"),
    landing: () => setView("landing"),
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <main className="flex-1 flex flex-col">
        {view === "landing" && <LandingView onLogin={nav.login} onSignup={nav.signup} />}
        {view === "auth" && <AuthView />}
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
          La landing possède son propre footer complet (liens légaux). */}
      {view !== "scan" && view !== "landing" && <AppFooter />}
    </div>
  )
}
