// ============================================================
// FeedbackPro - Configuration next-intl pour RSC / API routes
// ------------------------------------------------------------
// next-intl 4.x expose `getRequestConfig` qui charge dynamiquement
// les messages JSON de la locale demandée. La locale est résolue
// depuis le cookie `fp_locale` (défaut : fr) — pas de routage par
// segment /fr/.../ puisque le projet est une SPA monopage.
//
// Appelé côté serveur uniquement (RSC, API, middleware). Le client
// reçoit la locale via NextIntlClientProvider dans le layout.
// ============================================================

import { getRequestConfig } from "next-intl/server"
import { cookies } from "next/headers"
import { DEFAULT_LOCALE, LOCALE_COOKIE, estLocale, type Locale } from "./config"

/** Lit la locale depuis le cookie `fp_locale` (côté serveur). */
async function lireLocaleCookie(): Promise<Locale> {
  try {
    const store = await cookies()
    const v = store.get(LOCALE_COOKIE)?.value
    return estLocale(v) ? v : DEFAULT_LOCALE
  } catch {
    // cookies() peut lever en dehors d'un contexte requête (build statique)
    return DEFAULT_LOCALE
  }
}

export default getRequestConfig(async () => {
  const locale = await lireLocaleCookie()
  // Import dynamique des messages JSON — Next.js les bundle correctement
  // et le code-splitting par locale reste possible.
  const messages = (await import(`../messages/${locale}.json`)).default
  return {
    locale,
    messages,
  }
})
