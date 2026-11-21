"use client"

// ============================================================
// FeedVoice - CTA « Explorer la démo » de la page /demo
// ------------------------------------------------------------
// Client component (interactif) séparé du server component
// src/app/demo/page.tsx : au clic, POST /api/demo/login prépare
// le tenant démo, pose la session (cookie httpOnly fp_session,
// même mécanique que /api/auth/login) puis redirige vers /
// où la SPA racine boote sur la session démo → dashboard Pro.
//
// Design Hyer Aviation strict : carte carrée hairline (0px
// radius), pill 1000px, AUCUNE box-shadow, encre #000d10 + note
// chaude Clay Ember #bc7155, ash #8e8e95, Pebble #d5d3d4.
// Touch target ≥ 44px (bouton h-14 = 56px).
// ============================================================

import { useState } from "react"
import { ArrowRight, Loader2, Play } from "lucide-react"

export function DemoExplorerCTA() {
  const [chargement, setChargement] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  async function explorerDemo() {
    if (chargement) return
    setChargement(true)
    setErreur(null)
    try {
      const res = await fetch("/api/demo/login", { method: "POST" })
      const json = (await res.json().catch(() => null)) as
        | { ok: boolean; redirect?: string; error?: string }
        | null
      if (!res.ok || !json?.ok) {
        setErreur(
          json?.error ||
            "Impossible de préparer la démonstration. Réessayez dans quelques secondes."
        )
        setChargement(false)
        return
      }
      // Session posée côté serveur (cookie httpOnly) : navigation complète
      // pour que la SPA racine reboote avec la session → dashboard Pro.
      window.location.href = json.redirect || "/"
    } catch {
      setErreur("Connexion impossible. Vérifiez votre réseau puis réessayez.")
      setChargement(false)
    }
  }

  return (
    <section
      aria-label="Essayer la démonstration FeedVoice"
      className="mx-auto max-w-5xl px-4 pb-2 sm:px-6 lg:px-8"
    >
      <div className="border border-[#d5d3d4] bg-white p-6 sm:p-10">
        <div className="grid grid-cols-1 items-center gap-8 lg:grid-cols-[1fr_auto] lg:gap-12">
          {/* Colonne texte */}
          <div>
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-[#8e8e95]">
              <span className="inline-block h-2 w-2 rounded-full bg-[#bc7155]" aria-hidden />
              Démonstration interactive
            </p>
            <h2
              className="mt-3 text-3xl font-bold tracking-[-0.02em] text-[#000d10] sm:text-4xl"
              style={{ letterSpacing: "-0.02em" }}
            >
              Essayez FeedVoice maintenant
              <span className="text-[#bc7155]">.</span>
            </h2>
            <p className="mt-3 max-w-xl text-[17px] leading-relaxed text-[#8e8e95]">
              Un compte de démonstration pré-rempli&nbsp;: retours réels, Coach IA, rapports.
              Aucune inscription.
            </p>
          </div>

          {/* Colonne action */}
          <div className="flex flex-col items-start gap-3 lg:items-center">
            <button
              type="button"
              onClick={explorerDemo}
              disabled={chargement}
              aria-busy={chargement}
              className="inline-flex h-14 min-w-[220px] items-center justify-center gap-2.5 rounded-full bg-[#000d10] px-8 text-[17px] font-bold text-white transition-colors hover:bg-[#1c2a2e] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {chargement ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                  Préparation de la démo…
                </>
              ) : (
                <>
                  <Play className="h-5 w-5 fill-current" aria-hidden />
                  Explorer la démo
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </>
              )}
            </button>
            <p className="text-xs text-[#8e8e95]">
              Aucune inscription · Données fictives · Déconnexion en 1 clic
            </p>

            {/* Message d'erreur inline (état) */}
            {erreur && (
              <p
                role="alert"
                aria-live="polite"
                className="max-w-sm border border-[#d5d3d4] bg-[#faf6f3] px-4 py-3 text-sm leading-relaxed text-[#bc7155]"
              >
                {erreur}
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
