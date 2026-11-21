export const dynamic = "force-dynamic"

// ============================================================
// FeedVoice - Page Cas d'usage (App Router)
// ------------------------------------------------------------
// Route réelle : GET /cas-usage
// Contenu : 5 tabs secteurs (Hôtellerie, Restauration, Retail,
// Santé, Administrations) avec 4 points clés chacun + CTA final.
// ============================================================

import type { Metadata } from "next"
import { MarketingLayout, MarketingCTA } from "@/components/feedbackpro/marketing-shell"
import { UseCasesTabs } from "@/components/feedbackpro/use-cases-tabs"

export const metadata: Metadata = {
  title: "Cas d'usage FeedVoice par secteur — Hôtellerie, Restauration, Retail, Santé",
  description:
    "Tags contextuels et zones pré-configurées pour chaque métier : hôtellerie, restauration, retail, santé, administrations. Déployez FeedVoice en quelques minutes.",
  alternates: { canonical: "/cas-usage" },
}

export default function CasUsagePage() {
  return (
    <MarketingLayout activePath="/cas-usage">
      {/* ---------- Hero ---------- */}
      <section className="bg-gradient-to-b from-[#0f0f1c]/5 to-white py-14 sm:py-20">
        <div className="mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
          <span className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-medium text-[#0f0f1c] shadow-sm">
            Cas d&apos;usage
          </span>
          <h1
            className="mt-4 text-4xl font-extrabold tracking-tight text-gray-900 sm:text-5xl"
            style={{ letterSpacing: "-0.03em" }}
          >
            Pensé pour <span className="bg-gradient-to-br from-[#0f0f1c] to-[#0f0f1c] bg-clip-text text-transparent">votre secteur</span>
          </h1>
          <p className="mt-4 text-lg text-gray-600">
            Tags contextuels et zones pré-configurées pour chaque métier. Déployez en quelques
            minutes.
          </p>
        </div>
      </section>

      {/* ---------- Tabs secteurs ---------- */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
        <UseCasesTabs />
      </section>

      <MarketingCTA
        titre="Votre secteur n'est pas dans la liste ?"
        sousTitre="FeedVoice s'adapte à tout commerce avec un point de contact physique client. Contactez-nous pour un déploiement sur-mesure."
        bouton="Demander une démo"
      />
    </MarketingLayout>
  )
}
