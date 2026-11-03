// ============================================================
// FeedbackPro - Page Tarifs (App Router)
// ------------------------------------------------------------
// Route réelle : GET /tarifs
// Contenu : 3 plans (Starter, Pro, Enterprise) + toggle
// mensuel/annuel (-20 %) + CTA final.
// ============================================================

import type { Metadata } from "next"
import Link from "next/link"
import { MarketingLayout, MarketingCTA } from "@/components/feedbackpro/marketing-shell"
import { PricingToggle, type Plan } from "@/components/feedbackpro/pricing-toggle"
import { PRICING } from "@/lib/landing-data"

export const metadata: Metadata = {
  title: "Tarifs FeedbackPro — Starter 29 €, Pro 99 €, Enterprise 249 €",
  description:
    "Sans engagement. Annulation en 1 clic. 14 jours d'essai gratuit, sans carte bancaire. 3 plans : Starter 29 €, Pro 99 € (recommandé), Enterprise 249 €.",
  alternates: { canonical: "/tarifs" },
}

const plans = PRICING as Plan[]

export default function TarifsPage() {
  return (
    <MarketingLayout activePath="/tarifs">
      {/* ---------- Hero ---------- */}
      <section className="bg-gradient-to-b from-[#002e85]/5 to-white py-14 sm:py-20">
        <div className="mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
          <span className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-medium text-[#002e85] shadow-sm">
            Tarifs
          </span>
          <h1
            className="mt-4 text-4xl font-extrabold tracking-tight text-gray-900 sm:text-5xl"
            style={{ letterSpacing: "-0.03em" }}
          >
            Un prix adapté à <span className="bg-gradient-to-br from-[#002e85] to-[#0047c7] bg-clip-text text-transparent">chaque établissement</span>
          </h1>
          <p className="mt-4 text-lg text-gray-600">
            Sans engagement. Annulation en 1 clic. 14 jours d&apos;essai gratuit, sans carte bancaire.
          </p>
        </div>
      </section>

      {/* ---------- Plans ---------- */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
        <PricingToggle plans={plans} />

        <p className="mt-8 text-center text-sm text-gray-600">
          Besoin d&apos;une solution sur-mesure pour un grand groupe ?{" "}
          <Link href="/contact" className="font-medium text-[#002e85] underline-offset-4 hover:underline">
            Parlons-en →
          </Link>
        </p>
      </section>

      {/* ---------- Garanties ---------- */}
      <section className="border-t border-gray-200 bg-gray-50">
        <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
            {[
              { titre: "14 jours d'essai", texte: "Toutes les fonctionnalités, sans carte bancaire." },
              { titre: "Sans engagement", texte: "Annulation en 1 clic depuis votre espace, prorata calculé automatiquement." },
              { titre: "Support inclus", texte: "Réponse sous 72 h, onboarding personnalisé sur le plan Enterprise." },
            ].map((g) => (
              <div key={g.titre} className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
                <h3 className="text-base font-semibold text-gray-900">✓ {g.titre}</h3>
                <p className="mt-2 text-sm text-gray-600">{g.texte}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <MarketingCTA />
    </MarketingLayout>
  )
}
