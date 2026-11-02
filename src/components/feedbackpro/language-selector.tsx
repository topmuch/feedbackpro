"use client"

// ============================================================
// FeedbackPro - Sélecteur de langue (Task M2)
// ------------------------------------------------------------
// 3 drapeaux FR / EN / ES au clic : set le cookie `fp_locale` puis
// recharge la page pour que le serveur renvoie la nouvelle locale
// (NextIntlClientProvider re-monte avec les messages MAJ).
//
// Tone "dark" : sur fond bleu (header des dashboards).
// Tone "light" : sur fond clair (header public, page de scan).
// ============================================================

import { useState } from "react"
import { Check, Globe } from "lucide-react"
import { cn } from "@/lib/utils"
import { LOCALES, LOCALE_LABELS, LOCALE_COOKIE, type Locale } from "@/i18n/config"

type Tone = "dark" | "light"

export function LanguageSelector({
  tone = "light",
  className,
}: {
  tone?: Tone
  className?: string
}) {
  const [ouvert, setOuvert] = useState(false)

  function choisir(l: Locale) {
    setOuvert(false)
    // 1 an d'expiration, path=/ pour qu'il soit envoyé à toutes les routes
    document.cookie = `${LOCALE_COOKIE}=${l}; path=/; max-age=${365 * 24 * 3600}; SameSite=Lax`
    // Recharge pour appliquer la nouvelle locale côté serveur (messages + <html lang>)
    window.location.reload()
  }

  // Locale courante : on lit le cookie côté client (sinon défaut fr)
  function lireLocaleCourante(): Locale {
    try {
      const match = document.cookie
        .split("; ")
        .find((c) => c.startsWith(`${LOCALE_COOKIE}=`))
      const v = match?.split("=")?.[1]
      if (v === "fr" || v === "en" || v === "es") return v
    } catch {
      /* ignore */
    }
    return "fr"
  }

  const courant = lireLocaleCourante()
  const courantInfo = LOCALE_LABELS[courant]

  return (
    <div className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOuvert((o) => !o)}
        aria-label="Changer de langue"
        aria-expanded={ouvert}
        className={cn(
          "inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs font-medium transition-colors",
          tone === "dark"
            ? "bg-white/15 text-white hover:bg-white/20"
            : "border border-border/80 bg-background/80 text-muted-foreground hover:bg-muted"
        )}
      >
        <Globe className="h-3.5 w-3.5" aria-hidden />
        <span aria-hidden className="text-sm leading-none">{courantInfo.flag}</span>
      </button>
      {ouvert && (
        <>
          {/* Clique hors du menu pour fermer */}
          <div className="fixed inset-0 z-0" aria-hidden onClick={() => setOuvert(false)} />
          <div className="absolute right-0 z-20 mt-1 w-40 overflow-hidden rounded-xl border border-border bg-popover py-1 shadow-lg">
            {LOCALES.map((l) => {
              const info = LOCALE_LABELS[l]
              const actif = l === courant
              return (
                <button
                  key={l}
                  type="button"
                  onClick={() => choisir(l)}
                  className={cn(
                    "flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors",
                    actif
                      ? "bg-primary/5 font-semibold text-primary"
                      : "text-foreground/80 hover:bg-muted"
                  )}
                >
                  <span aria-hidden className="text-base leading-none">{info.flag}</span>
                  <span>{info.label}</span>
                  {actif && <Check className="ms-auto h-3.5 w-3.5" aria-hidden />}
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
