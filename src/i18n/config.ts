// ============================================================
// FeedbackPro - Configuration i18n (Task M2)
// ------------------------------------------------------------
// next-intl pour l'interface (dashboard + auth + scan).
// L'ancien module src/lib/i18n.ts (FR/EN/AR pour la page scan client)
// reste inchangé : il gère la langue du questionnaire CLIENT qui peut
// différer de la langue du commerçant.
//
// Locale par défaut : fr (français — langue principale du produit).
// Locales supportées : fr, en, es (l'arabe reste géré par l'ancien
// module pour la page scan).
//
// La locale est persistée dans un cookie `fp_locale` (1 an) et lue
// côté serveur par src/i18n/request.ts pour RSC et API routes.
// ============================================================

export const LOCALES = ["fr", "en", "es"] as const
export type Locale = (typeof LOCALES)[number]

export const DEFAULT_LOCALE: Locale = "fr"

/** Nom du cookie qui persiste la langue choisie par l'utilisateur. */
export const LOCALE_COOKIE = "fp_locale"

/** Libellés affichés dans le sélecteur de langue. */
export const LOCALE_LABELS: Record<Locale, { label: string; flag: string }> = {
  fr: { label: "Français", flag: "🇫🇷" },
  en: { label: "English", flag: "🇬🇧" },
  es: { label: "Español", flag: "🇪🇸" },
}

/** Vérifie qu'une chaîne est une locale supportée. */
export function estLocale(v: unknown): v is Locale {
  return typeof v === "string" && (LOCALES as readonly string[]).includes(v)
}
