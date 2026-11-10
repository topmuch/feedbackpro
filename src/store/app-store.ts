"use client"

// ============================================================
// FeedbackPro - Store global (Zustand)
// Gère : la vue courante (SPA), la session, le mode auth, le token de scan
// Pivot Session 1 : chaque client réel devient un Client Mystère,
// le Pro gère des ZONES et reçoit des rapports du Coach IA.
// ============================================================

import { create } from "zustand"

export type View = "loading" | "landing" | "auth" | "dashboard" | "admin" | "scan" | "airport"

/** Établissement (Pro) tel que renvoyé par /api/auth/me et les routes de session */
export type ProData = {
  id: string
  nomEtablissement: string
  typeEtablissement: string
  adresse: string
  ville: string
  whatsapp: string | null
  email: string
  logoUrl: string | null
  plan: string
  /** Fréquence des rapports du Coach IA : "quotidien" | "hebdomadaire" */
  frequenceRapport: string
  /** Micro-récompense affichée au client après son retour */
  recompense: string | null
  /** Récompenses structurées (Session 3) : toggle, type et code promo */
  recompenseActive?: boolean
  recompenseType?: string
  recompenseCode?: string
  /** Limite d'utilisation affichée au client (ex: "1 par client / jour") — audit UX */
  recompenseLimite?: string | null
  messageWhatsapp: string | null
  onboardingDone: boolean
  suspendu: boolean
  /** Alertes SMS activées pour les réclamations (note ≤ 2★) */
  smsAlertes: boolean
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
  /** Tag URL aéroport scanné (ex: "tapis_bagages_1") */
  airportTag: string | null
  session: SessionData | null
  booted: boolean
  /** Pré-remplissage du formulaire de connexion (comptes de démo) */
  prefillLogin: { email: string; password: string } | null

  setAuthMode: (mode: "login" | "signup") => void
  /** Bascule sur la vue Connexion avec identifiants pré-remplis (démo) */
  demoLogin: (kind: "pro" | "admin") => void
  setView: (v: View) => void
  openScan: (token: string) => void
  closeScan: () => void
  /** Ouvre la PWA aéroport avec un tag URL scanné (/aeroport/<tag> ou ?airport=<tag>) */
  openAirport: (tag: string) => void
  closeAirport: () => void
  setSession: (s: SessionData | null) => void
  refreshSession: () => Promise<void>
  logout: () => Promise<void>
  updatePro: (pro: ProData) => void
}

/** Détermine la vue à partir de la session (et du scan / airport actif) */
function deriveView(scanToken: string | null, airportTag: string | null, session: SessionData | null): View {
  if (scanToken) return "scan"
  if (airportTag) return "airport"
  if (!session) return "landing"
  if (session.user.role === "SUPERADMIN") return "admin"
  // Inscription et connexion aboutissent directement au dashboard
  // (la zone « Accueil » est créée automatiquement à l'inscription).
  return "dashboard"
}

/**
 * Extrait le token de scan de l'URL courante.
 * Deux formes supportées :
 *  - /r/<qrToken> : URL courte imprimée sur les QR codes (rewritée par next.config)
 *  - /?scan=<qrToken> : forme historique
 */
export function tokenDepuisUrl(): string | null {
  if (typeof window === "undefined") return null
  try {
    const match = window.location.pathname.match(/^\/r\/([A-Za-z0-9_-]+)\/?$/)
    if (match) return match[1]
    return new URLSearchParams(window.location.search).get("scan")
  } catch {
    return null
  }
}

/**
 * Extrait le tag aéroport de l'URL courante.
 * Deux formes supportées :
 *  - /aeroport/<tag> : URL courte imprimée sur les QR codes aéroport
 *    (rewritée par next.config → /?airport=<tag>)
 *  - /?airport=<tag> : forme explicite
 */
export function airportTagDepuisUrl(): string | null {
  if (typeof window === "undefined") return null
  try {
    const match = window.location.pathname.match(/^\/aeroport\/([A-Za-z0-9_-]+)\/?$/)
    if (match) return match[1]
    return new URLSearchParams(window.location.search).get("airport")
  } catch {
    return null
  }
}

export const useAppStore = create<AppState>((set, get) => ({
  view: "loading",
  authMode: "login",
  scanToken: null,
  airportTag: null,
  session: null,
  booted: false,
  prefillLogin: null,

  setAuthMode: (mode) => set({ authMode: mode, view: "auth" }),

  // Comptes de démonstration : bascule sur Connexion + pré-remplit le formulaire
  demoLogin: (kind) =>
    set({
      authMode: "login",
      view: "auth",
      prefillLogin:
        kind === "pro"
          ? { email: "demo@pizzeria.fr", password: "demo1234" }
          : { email: "admin@feedbackpro.fr", password: "admin123" },
    }),
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
    set({ view: deriveView(null, get().airportTag, get().session) })
  },

  // Ouvre la PWA aéroport (depuis /aeroport/<tag> ou ?airport=<tag>)
  openAirport: (tag) => {
    set({ airportTag: tag, view: "airport" })
    try {
      if (/^\/aeroport\//.test(window.location.pathname)) {
        window.history.replaceState({}, "", `/aeroport/${tag}`)
      } else {
        const url = new URL(window.location.href)
        url.searchParams.set("airport", tag)
        window.history.pushState({}, "", url.toString())
      }
    } catch {
      /* ignore */
    }
  },

  closeAirport: () => {
    set({ airportTag: null })
    try {
      if (/^\/aeroport\//.test(window.location.pathname)) {
        window.history.replaceState({}, "", "/")
      } else {
        const url = new URL(window.location.href)
        url.searchParams.delete("airport")
        window.history.replaceState({}, "", url.toString())
      }
    } catch {
      /* ignore */
    }
    set({ view: deriveView(get().scanToken, null, get().session) })
  },

  setSession: (s) => {
    set({ session: s, view: deriveView(get().scanToken, get().airportTag, s), booted: true })
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
    set({ booted: true, view: deriveView(get().scanToken, get().airportTag, get().session) })
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
    set({ session, view: deriveView(get().scanToken, get().airportTag, session) })
  },
}))
