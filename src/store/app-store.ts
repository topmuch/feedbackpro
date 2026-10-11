"use client"

// ============================================================
// FeedbackPro - Store global (Zustand)
// Gère : la vue courante (SPA), la session, le mode auth, le token de scan
// ============================================================

import { create } from "zustand"

export type View = "loading" | "landing" | "auth" | "onboarding" | "dashboard" | "admin" | "scan"

export type ProData = {
  id: string
  nomCommerce: string
  categorie: string
  adresse: string
  ville: string
  whatsapp: string | null
  googleUrl: string | null
  messageWhatsapp: string | null
  logoUrl: string | null
  qrToken: string
  plan: string
  onboardingDone: boolean
  createdAt: string
}

export type SessionData = {
  user: { id: string; email: string; role: string }
  pro: ProData | null
}

type AppState = {
  view: View
  authMode: "login" | "signup"
  scanToken: string | null
  session: SessionData | null
  booted: boolean

  setAuthMode: (mode: "login" | "signup") => void
  setView: (v: View) => void
  openScan: (token: string) => void
  closeScan: () => void
  setSession: (s: SessionData | null) => void
  refreshSession: () => Promise<void>
  logout: () => Promise<void>
  updatePro: (pro: ProData) => void
}

/** Détermine la vue à partir de la session (et du scan actif) */
function deriveView(scanToken: string | null, session: SessionData | null): View {
  if (scanToken) return "scan"
  if (!session) return "landing"
  if (session.user.role === "SUPERADMIN") return "admin"
  if (session.pro && !session.pro.onboardingDone) return "onboarding"
  return "dashboard"
}

/**
 * Extrait le token de scan de l'URL courante.
 * Deux formes supportées :
 *  - /r/<qrToken> : URL courte imprimée sur les QR codes (rewritée par next.config)
 *  - /?scan=<qrToken> : forme historique
 */
export function tokenDepuisUrl(): string | null {
  try {
    const match = window.location.pathname.match(/^\/r\/([A-Za-z0-9_-]+)\/?$/)
    if (match) return match[1]
    return new URLSearchParams(window.location.search).get("scan")
  } catch {
    return null
  }
}

export const useAppStore = create<AppState>((set, get) => ({
  view: "loading",
  authMode: "login",
  scanToken: null,
  session: null,
  booted: false,

  setAuthMode: (mode) => set({ authMode: mode, view: "auth" }),
  setView: (v) => set({ view: v }),

  // Ouvre le flux de scan (depuis un QR scanné : /r/<token> ou ?scan=<token>)
  openScan: (token) => {
    set({ scanToken: token, view: "scan" })
    try {
      // Conserve la forme courte /r/<token> si c'est ainsi que le client est arrivé
      if (/^\/r\//.test(window.location.pathname)) {
        window.history.replaceState({}, "", `/r/${token}`)
      } else {
        const url = new URL(window.location.href)
        url.searchParams.set("scan", token)
        window.history.pushState({}, "", url.toString())
      }
    } catch {
      /* ignore */
    }
  },

  closeScan: () => {
    set({ scanToken: null })
    try {
      if (/^\/r\//.test(window.location.pathname)) {
        // Sortie du scan : on quitte l'URL courte du QR
        window.history.replaceState({}, "", "/")
      } else {
        const url = new URL(window.location.href)
        url.searchParams.delete("scan")
        window.history.replaceState({}, "", url.toString())
      }
    } catch {
      /* ignore */
    }
    set({ view: deriveView(null, get().session) })
  },

  setSession: (s) => {
    set({ session: s, view: deriveView(get().scanToken, s), booted: true })
  },

  // Charge la session courante depuis le serveur
  refreshSession: async () => {
    try {
      const res = await fetch("/api/auth/me", { cache: "no-store" })
      const json = await res.json()
      set({ session: json?.ok ? json.data : null })
    } catch {
      set({ session: null })
    }
    set({ booted: true, view: deriveView(get().scanToken, get().session) })
  },

  logout: async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" })
    } catch {
      /* ignore */
    }
    set({ session: null, view: "landing" })
  },

  updatePro: (pro) => {
    const s = get().session
    if (!s) return
    const session = { ...s, pro }
    set({ session, view: deriveView(get().scanToken, session) })
  },
}))
