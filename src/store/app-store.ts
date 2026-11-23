"use client"

// ============================================================
// FeedVoice - Store global (Zustand)
// Gère : la vue courante (SPA), la session, le mode auth, le token de scan
// Pivot Session 1 : chaque client réel devient un Client Mystère,
// le Pro gère des ZONES et reçoit des rapports du Coach IA.
// ============================================================

import { create } from "zustand"

export type View = "loading" | "landing" | "auth" | "auth-admin" | "dashboard" | "admin" | "scan" | "airport" | "airport-staff" | "airport-ops" | "airline" | "vip" | "vip-table" | "vip-staff" | "city" | "onboarding-tenant"

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
  user: { id: string; email: string; role: string; tenantType?: string }
  pro: ProData | null
}

type AppState = {
  view: View
  authMode: "login" | "signup"
  scanToken: string | null
  /** Tag URL aéroport scanné (ex: "tapis_bagages_1") */
  airportTag: string | null
  /** Tag URL staff scanné (ex: "staff_nettoyage_T2") — QR Staff Only */
  staffTag: string | null
  /** Token QR d'une table VIP scannée par un client (?vipTable=<token>) */
  vipTableToken: string | null
  /**
   * QR_ROUTING — Type de QR scanné pour la vue Nathalie :
   *  - 'CLIENT_GLOBAL' → QR d'ENTRÉE (chevalet) : AUCUNE table assignée,
   *    écran d'accueil global + sélection de zone à la demande.
   *  - 'CLIENT_ZONE'   → QR de table contextuel : table assignée
   *    (comportement historique conservé).
   *  - null → aucune vue VIP active.
   */
  vipQrType: 'CLIENT_GLOBAL' | 'CLIENT_ZONE' | null
  /** Tag staff VIP scanné (?vipStaff=<tag>) — pour le PWA staff salon VIP */
  vipStaffTag: string | null
  session: SessionData | null
  booted: boolean
  /** Pré-remplissage du formulaire de connexion (comptes de démo) */
  prefillLogin: { email: string; password: string } | null
  /**
   * TENANT-3 — Flag "vient de s'inscrire" : true après une inscription
   * réussie pour déclencher l'étape de sélection du type d'établissement.
   * Remis à false après choix du tenant ou login classique.
   */
  justRegistered: boolean

  setAuthMode: (mode: "login" | "signup") => void
  /** Bascule sur la vue Connexion avec identifiants pré-remplis (démo) */
  demoLogin: (kind: "pro" | "admin") => void
  setView: (v: View) => void
  openScan: (token: string) => void
  closeScan: () => void
  /** Ouvre la PWA aéroport avec un tag URL scanné (/aeroport/<tag> ou ?airport=<tag>) */
  openAirport: (tag: string) => void
  closeAirport: () => void
  /** Ouvre la PWA Staff Only (QR employé scanné : ?staff=<tag>) */
  openStaff: (tag: string) => void
  closeStaff: () => void
  /** Ouvre la vue client VIP Table (scan QR table : ?vipTable=<token> ou ?qr_type=CLIENT_ZONE&zone_id=<token>) */
  openVipTable: (token: string) => void
  /** QR_ROUTING — Ouvre Nathalie en mode GLOBAL (QR d'entrée : ?qr_type=CLIENT_GLOBAL) sans table */
  openVipGlobal: () => void
  closeVipTable: () => void
  /** Ouvre le PWA Staff VIP (?vipStaff=<tag>) */
  openVipStaff: (tag: string) => void
  closeVipStaff: () => void
  setSession: (s: SessionData | null) => void
  refreshSession: () => Promise<void>
  logout: () => Promise<void>
  updatePro: (pro: ProData) => void
  /** TENANT-3 — Bascule le flag justRegistered */
  setJustRegistered: (v: boolean) => void
}

/**
 * Détermine la vue à partir de la session (et du scan / airport / staff actif).
 * TENANT-3 — Routage multi-tenant : si l'utilisateur vient de s'inscrire
 * (`justRegistered`) et n'a pas encore choisi son type d'établissement,
 * on affiche l'étape d'onboarding tenant. Sinon, on route vers le dashboard
 * correspondant au tenantType :
 *   - airport    → "dashboard" (ProDashboard, qui expose les onglets aéroport)
 *   - airline    → "airline"
 *   - vip_lounge → "vip"
 *   - classic    → "dashboard"
 *
 * IMPORTANT — Ordre des checks :
 *   1. scanToken / airportTag / staffTag (PWA plein écran prioritaires)
 *   2. !session → landing
 *   3. justRegistered → "onboarding-tenant" (AVANT le rôle SUPERADMIN, pour
 *      qu'un superadmin puisse tester la sélection de tenant depuis son
 *      dashboard via le bouton "Changer de tenant" qui pose justRegistered=true)
 *   4. SUPERADMIN → "admin"
 *   5. tenantType → dashboard / airline / vip
 *
 * Tous les types de tenant sont pris en charge :
 *   - airport, classic   → "dashboard" (ProDashboard + onglets aéroport)
 *   - airline             → "airline"
 *   - vip_lounge          → "vip"
 *   - valeur inconnue     → "dashboard" (fallback sûr, évite un écran blanc)
 */
function deriveView(scanToken: string | null, airportTag: string | null, staffTag: string | null, vipTableToken: string | null, vipStaffTag: string | null, session: SessionData | null, justRegistered: boolean, vipQrType: 'CLIENT_GLOBAL' | 'CLIENT_ZONE' | null = null): View {
  if (scanToken) return "scan"
  if (airportTag) return "airport"
  if (staffTag) return "airport-staff"
  // QR_ROUTING — vue Nathalie : soit un token de table (CLIENT_ZONE),
  // soit le mode GLOBAL du QR d'entrée (aucun token, vipQrType seul).
  if (vipTableToken || vipQrType === 'CLIENT_GLOBAL') return "vip-table"
  if (vipStaffTag) return "vip-staff"
  // TENANT-3 — Vérifie localStorage EN PREMIER (avant !session) car
  // refreshSession/boot peuvent écraser justRegistered. Le flag
  // localStorage persiste entre les re-renders.
  const lsFlag = typeof window !== "undefined" && localStorage.getItem("fp_just_registered") === "1"
  if (justRegistered || lsFlag) {
    // Si pas de session, on laisse passer (le tenant selection
    // appellera refreshSession après le choix)
    if (session) return "onboarding-tenant"
  }
  if (!session) return "landing"
  if (session.user.role === "SUPERADMIN") return "admin"
  const tenant = (session.user.tenantType ?? 'classic').toLowerCase()
  if (tenant === 'airline') return 'airline'
  if (tenant === 'vip_lounge' || tenant === 'vip') return 'vip'
  if (tenant === 'city') return 'city'
  return 'dashboard'
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

/**
 * QR_ROUTING — Parse les paramètres d'URL du QR scanné pour Nathalie.
 *
 * DEUX FORMES SUPPORTÉES :
 *  1. QR d'ENTRÉE (chevalet d'accueil, global) :
 *       ?qr_type=CLIENT_GLOBAL
 *     → { qrType: 'CLIENT_GLOBAL', token: null } — AUCUNE table.
 *  2. QR de TABLE (contextuel, historique conservé) :
 *       ?qr_type=CLIENT_ZONE&zone_id=<token>   (nouvelle forme)
 *       ?vipTable=<token>                      (forme historique)
 *     → { qrType: 'CLIENT_ZONE', token: '<token>' }
 *
 * Retourne { qrType: null, token: null } si aucun QR VIP détecté.
 */
export function vipQrDepuisUrl(): {
  qrType: 'CLIENT_GLOBAL' | 'CLIENT_ZONE' | null
  token: string | null
} {
  if (typeof window === "undefined") return { qrType: null, token: null }
  try {
    const params = new URLSearchParams(window.location.search)
    const qrType = params.get("qr_type")
    if (qrType === "CLIENT_GLOBAL") {
      // QR d'entrée — Nathalie s'ouvre SANS table assignée
      return { qrType: 'CLIENT_GLOBAL', token: null }
    }
    if (qrType === "CLIENT_ZONE") {
      // QR de table (nouvelle forme) — zone_id = token de la table
      const token = params.get("zone_id") ?? params.get("vipTable")
      if (token) return { qrType: 'CLIENT_ZONE', token }
    }
    // Forme historique (?vipTable=<token>) — reste fonctionnelle
    const legacy = params.get("vipTable")
    if (legacy) return { qrType: 'CLIENT_ZONE', token: legacy }
    return { qrType: null, token: null }
  } catch {
    return { qrType: null, token: null }
  }
}

export const useAppStore = create<AppState>((set, get) => ({
  view: "loading",
  authMode: "login",
  scanToken: null,
  airportTag: null,
  staffTag: null,
  vipTableToken: null,
  vipQrType: null,
  vipStaffTag: null,
  session: null,
  booted: false,
  prefillLogin: null,
  justRegistered: false,

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
    set({ view: deriveView(null, get().airportTag, get().staffTag, get().vipTableToken, get().vipStaffTag, get().session, get().justRegistered, get().vipQrType) })
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
    set({ view: deriveView(get().scanToken, null, get().staffTag, get().vipTableToken, get().vipStaffTag, get().session, get().justRegistered, get().vipQrType) })
  },

  // Ouvre la PWA Staff Only (QR employé scanné : ?staff=<tag>)
  openStaff: (tag) => {
    set({ staffTag: tag, view: "airport-staff" })
    try {
      const url = new URL(window.location.href)
      url.searchParams.set("staff", tag)
      window.history.pushState({}, "", url.toString())
    } catch {
      /* ignore */
    }
  },

  closeStaff: () => {
    set({ staffTag: null })
    try {
      const url = new URL(window.location.href)
      url.searchParams.delete("staff")
      window.history.replaceState({}, "", url.toString())
    } catch {
      /* ignore */
    }
    // Après déconnexion staff → afficher la page de connexion (pas la landing)
    set({ view: "auth", authMode: "login" })
  },

  // Ouvre la vue client VIP Table (scan QR de table : CLIENT_ZONE)
  openVipTable: (token) => {
    set({ vipTableToken: token, vipQrType: 'CLIENT_ZONE', view: "vip-table" })
    try {
      const url = new URL(window.location.href)
      // QR_ROUTING — si le client est arrivé via la nouvelle forme
      // ?qr_type=CLIENT_ZONE&zone_id=<token>, on PRÉSERVE l'URL d'origine
      // (le token est déjà dedans) ; sinon on pose la forme historique.
      if (!url.searchParams.has("qr_type")) {
        url.searchParams.set("vipTable", token)
        window.history.pushState({}, "", url.toString())
      }
    } catch {
      /* ignore */
    }
  },

  // QR_ROUTING — Ouvre Nathalie en mode GLOBAL (QR d'entrée sur le
  // chevalet d'accueil) : AUCUNE table assignée, current_zone = null.
  openVipGlobal: () => {
    set({ vipTableToken: null, vipQrType: 'CLIENT_GLOBAL', view: "vip-table" })
    try {
      const url = new URL(window.location.href)
      url.searchParams.set("qr_type", "CLIENT_GLOBAL")
      window.history.replaceState({}, "", url.toString())
    } catch {
      /* ignore */
    }
  },

  closeVipTable: () => {
    set({ vipTableToken: null, vipQrType: null })
    try {
      const url = new URL(window.location.href)
      // Nettoie les DEUX formes d'URL (historique + nouvelle)
      url.searchParams.delete("vipTable")
      url.searchParams.delete("qr_type")
      url.searchParams.delete("zone_id")
      window.history.replaceState({}, "", url.toString())
    } catch {
      /* ignore */
    }
    // Après fermeture du scan VIP Table → retour sur la landing
    set({ view: deriveView(get().scanToken, get().airportTag, get().staffTag, null, get().vipStaffTag, get().session, get().justRegistered, null) })
  },

  // Ouvre le PWA Staff VIP (?vipStaff=<tag>)
  openVipStaff: (tag) => {
    set({ vipStaffTag: tag, view: "vip-staff" })
    try {
      const url = new URL(window.location.href)
      url.searchParams.set("vipStaff", tag)
      window.history.pushState({}, "", url.toString())
    } catch {
      /* ignore */
    }
  },

  closeVipStaff: () => {
    set({ vipStaffTag: null })
    try {
      const url = new URL(window.location.href)
      url.searchParams.delete("vipStaff")
      window.history.replaceState({}, "", url.toString())
    } catch {
      /* ignore */
    }
    set({ view: deriveView(get().scanToken, get().airportTag, get().staffTag, get().vipTableToken, null, get().session, get().justRegistered, get().vipQrType) })
  },

  setSession: (s) => {
    set({ session: s, view: deriveView(get().scanToken, get().airportTag, get().staffTag, get().vipTableToken, get().vipStaffTag, s, get().justRegistered, get().vipQrType), booted: true })
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
    set({ booted: true, view: deriveView(get().scanToken, get().airportTag, get().staffTag, get().vipTableToken, get().vipStaffTag, get().session, get().justRegistered, get().vipQrType) })
  },

  logout: async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" })
    } catch {
      /* ignore */
    }
    // Nettoie l'URL : retire /dashboard/<tab> ou tout autre path
    // pour revenir à la racine / (page de connexion)
    try {
      if (typeof window !== "undefined") {
        window.history.replaceState({}, "", "/")
      }
    } catch {
      /* ignore */
    }
    // Affiche la page de connexion (pas la landing)
    set({ session: null, view: "auth", authMode: "login", justRegistered: false })
  },

  updatePro: (pro) => {
    const s = get().session
    if (!s) return
    const session = { ...s, pro }
    set({ session, view: deriveView(get().scanToken, get().airportTag, get().staffTag, get().vipTableToken, get().vipStaffTag, session, get().justRegistered, get().vipQrType) })
  },

  setJustRegistered: (v) => set({ justRegistered: v }),
}))
