"use client"

// ============================================================
// FeedVoice - i18n du dashboard Pro (Task 1-c)
// ------------------------------------------------------------
// i18n RÉELLE côté client pour le dashboard Pro (shell + onglets).
// Trois langues : fr (défaut), en, es.
//
// Pourquoi ce module alors que `src/lib/i18n.ts` existe ?
//   · src/lib/i18n.ts gère la langue du questionnaire CLIENT de la
//     page de scan (fr/en/ar) — un périmètre et un jeu de langues
//     différents, sans hook ni dictionnaire dashboard.
//   · next-intl est branché côté serveur (src/i18n/request.ts) mais
//     aucun NextIntlClientProvider n'est monté dans le layout racine ;
//     le dashboard Pro étant une SPA client, un provider serveur
//     n'y apporterait pas de changement de langue instantané.
// Ce module fournit donc un dictionnaire typé + un hook React
// autonomes, alimentés par les MÊMES fichiers de messages que
// next-intl (src/messages/{fr,en,es}.json) — un seul lieu de vérité.
//
// Persistance : cookie `fp_locale` (lu en priorité — il est partagé
// avec l'infra next-intl serveur et avec le LanguageSelector hérité
// des autres dashboards) puis miroir localStorage (clé `fp_locale`),
// défaut "fr". Le changement de langue est instantané (store zustand,
// aucun rechargement de page).
//
// API : `const { t, locale, setLocale } = useDashboardI18n()`
//   · t("overview.titre")                  -> chaîne traduite
//   · t("retours.sousTitre", { n: 3, s: "s" }) -> interpolation {var}
//     (convention {s} = suffixe pluriel calculé par l'appelant)
//   · Clés typées (autocomplétion) : CheminsDe<typeof messages.fr.dashboard.pro>
//   · Fallback : locale courante -> fr -> chemin de clé brut.
// ============================================================

import { useEffect, useMemo } from "react"
import { create } from "zustand"
import frMessages from "@/messages/fr.json"
import enMessages from "@/messages/en.json"
import esMessages from "@/messages/es.json"
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  estLocale,
  type Locale,
} from "@/i18n/config"

// ---------- Dictionnaire typé ----------

/** Messages complets d'une locale (structure décrite par fr.json). */
type MessagesApp = typeof frMessages

/** Sous-arbre dashboard Pro du dictionnaire français (source de vérité des clés). */
type DictionnairePro = MessagesApp["dashboard"]["pro"]

/** Chemins de clés typés : "nav.overview", "overview.sousTitre", etc. */
export type CleDashboard = CheminsDe<DictionnairePro>

/** Union récursive de tous les chemins de clés string d'un objet JSON. */
type CheminsDe<T> = T extends string
  ? never
  : {
      [K in keyof T & string]: T[K] extends string ? K : `${K}.${CheminsDe<T[K]>}`
    }[keyof T & string]

// Assertion : les 3 fichiers de messages partagent la même structure
// (les littéraux diffèrent par langue, d'où `as` plutôt qu'une annotation
// stricte qui rejetterait les valeurs traduites).
const MESSAGES = {
  fr: frMessages,
  en: enMessages,
  es: esMessages,
} as Record<Locale, MessagesApp>

/** Extrait le sous-arbre `dashboard.pro` d'un objet messages. */
function extrairePro(m: unknown): Record<string, unknown> {
  const racine = (m as { dashboard?: { pro?: Record<string, unknown> } }).dashboard
  return racine?.pro ?? {}
}

/** Résout un chemin pointé ("a.b.c") et renvoie la chaîne, sinon undefined. */
function lireChaine(dict: Record<string, unknown>, chemin: string): string | undefined {
  let noeud: unknown = dict
  for (const segment of chemin.split(".")) {
    if (noeud && typeof noeud === "object" && segment in (noeud as Record<string, unknown>)) {
      noeud = (noeud as Record<string, unknown>)[segment]
    } else {
      return undefined
    }
  }
  return typeof noeud === "string" ? noeud : undefined
}

/** Remplace les jetons {var} par les variables fournies (les inconnues sont laissées intactes). */
function interpoler(motif: string, vars?: Record<string, string | number>): string {
  if (!vars) return motif
  return motif.replace(/\{(\w+)\}/g, (occurrence, cle: string) =>
    Object.prototype.hasOwnProperty.call(vars, cle) ? String(vars[cle]) : occurrence
  )
}

/** Fonction de traduction : clé typée (+ variables optionnelles) -> chaîne. */
export type Traducteur = (cle: CleDashboard, vars?: Record<string, string | number>) => string

/** Construit un traducteur pour une locale, avec repli sur le français. */
function creerTraducteur(locale: Locale): Traducteur {
  const dictLocale = extrairePro(MESSAGES[locale])
  const dictFr = extrairePro(MESSAGES.fr)
  return (cle, vars) => {
    const brut = lireChaine(dictLocale, cle) ?? lireChaine(dictFr, cle) ?? cle
    return interpoler(brut, vars)
  }
}

// ---------- Persistance (cookie fp_locale + miroir localStorage) ----------

/** Clé localStorage : identique au nom du cookie pour un même concept. */
export const CLE_LOCALE_DASHBOARD = "fp_locale"

/**
 * Lit la langue persistée. Priorité : cookie `fp_locale` (partagé avec
 * l'infra next-intl serveur et le LanguageSelector hérité) puis
 * localStorage, sinon défaut "fr". Sûr SSR (retourne le défaut).
 */
export function lireLocaleDashboard(): Locale {
  if (typeof document !== "undefined") {
    try {
      const match = document.cookie
        .split("; ")
        .find((c) => c.startsWith(`${LOCALE_COOKIE}=`))
      const v = match?.split("=")?.[1]
      if (estLocale(v)) return v
    } catch {
      /* cookie indisponible */
    }
  }
  if (typeof window !== "undefined") {
    try {
      const v = window.localStorage.getItem(CLE_LOCALE_DASHBOARD)
      if (estLocale(v)) return v
    } catch {
      /* localStorage indisponible (navigation privée…) */
    }
  }
  return DEFAULT_LOCALE
}

/** Persiste la langue : miroir localStorage + cookie `fp_locale` (1 an). */
export function memoriserLocaleDashboard(l: Locale): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(CLE_LOCALE_DASHBOARD, l)
  } catch {
    /* ignore */
  }
  try {
    document.cookie = `${LOCALE_COOKIE}=${l}; path=/; max-age=${365 * 24 * 3600}; SameSite=Lax`
  } catch {
    /* ignore */
  }
}

// ---------- Store zustand (changement de langue instantané) ----------

type EtatLocale = {
  locale: Locale
  /** true après la première lecture du stockage côté client. */
  hydrate: boolean
  setLocale: (l: Locale) => void
}

const useLocaleStore = create<EtatLocale>((set) => ({
  locale: DEFAULT_LOCALE,
  hydrate: false,
  setLocale: (l) => {
    memoriserLocaleDashboard(l)
    set({ locale: l })
  },
}))

/** Lecture unique du stockage au premier rendu client (pattern hydration-safe). */
function hydraterLocale() {
  if (useLocaleStore.getState().hydrate) return
  useLocaleStore.setState({ locale: lireLocaleDashboard(), hydrate: true })
}

/**
 * Hook i18n du dashboard Pro — l'API à utiliser dans les composants :
 *
 *   const { t, locale, setLocale } = useDashboardI18n()
 *   t("overview.titre")
 *   t("retours.sousTitre", { n: total, s: total > 1 ? "s" : "" })
 *
 * Aucun provider requis (store zustand global) : le même hook peut être
 * appelé dans le shell, dans chaque onglet et dans chaque sous-composant ;
 * tous se re-rendent instantanément quand la langue change.
 */
export function useDashboardI18n(): {
  t: Traducteur
  locale: Locale
  setLocale: (l: Locale) => void
} {
  const locale = useLocaleStore((s) => s.locale)
  const setLocale = useLocaleStore((s) => s.setLocale)

  // Hydration : le premier rendu (SSR + premier pass client) affiche le
  // défaut "fr" pour éviter tout mismatch, puis la langue persistée est
  // appliquée juste après le mount (une frame au plus).
  useEffect(() => {
    hydraterLocale()
  }, [])

  const t = useMemo(() => creerTraducteur(locale), [locale])
  return { t, locale, setLocale }
}
