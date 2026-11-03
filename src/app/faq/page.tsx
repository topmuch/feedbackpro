// ============================================================
// FeedbackPro - Page FAQ (App Router)
// ------------------------------------------------------------
// Route réelle : GET /faq
// Contenu : 8 questions fréquentes (accordion client) + CTA.
// ============================================================

import type { Metadata } from "next"
import { MarketingLayout, MarketingCTA } from "@/components/feedbackpro/marketing-shell"
import { FaqAccordion } from "@/components/feedbackpro/faq-accordion"
import { FAQ_ITEMS } from "@/lib/landing-data"

export const metadata: Metadata = {
  title: "FAQ FeedbackPro — Questions fréquentes sur le Coach IA d'audit qualité",
  description:
    "Comment fonctionne FeedbackPro ? Le client doit-il télécharger une app ? Combien de temps pour être opérationnel ? Toutes les réponses aux 8 questions les plus fréquentes.",
  alternates: { canonical: "/faq" },
}

export default function FaqPage() {
  return (
    <MarketingLayout activePath="/faq">
      {/* ---------- Hero ---------- */}
      <section className="bg-gradient-to-b from-[#002e85]/5 to-white py-14 sm:py-20">
        <div className="mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
          <span className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-medium text-[#002e85] shadow-sm">
            FAQ
          </span>
          <h1
            className="mt-4 text-4xl font-extrabold tracking-tight text-gray-900 sm:text-5xl"
            style={{ letterSpacing: "-0.03em" }}
          >
            Questions <span className="bg-gradient-to-br from-[#002e85] to-[#0047c7] bg-clip-text text-transparent">fréquentes</span>
          </h1>
          <p className="mt-4 text-lg text-gray-600">
            Tout ce que vous devez savoir avant de vous lancer.
          </p>
        </div>
      </section>

      {/* ---------- Accordion ---------- */}
      <section className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
        <FaqAccordion items={FAQ_ITEMS} />

        {/* ---------- Contact support ---------- */}
        <div className="mt-10 rounded-3xl border border-gray-200 bg-gray-50 p-6 text-center sm:p-8">
          <h2 className="text-lg font-semibold text-gray-900">
            Vous ne trouvez pas votre réponse ?
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            Notre équipe vous répond sous 72 heures ouvrées.
          </p>
          <a
            href="/contact"
            className="mt-4 inline-flex h-10 items-center gap-1.5 rounded-md bg-gradient-to-br from-[#002e85] to-[#0047c7] px-4 text-sm font-semibold text-white shadow-sm hover:opacity-90"
          >
            Contactez-nous
          </a>
        </div>
      </section>

      <MarketingCTA />
    </MarketingLayout>
  )
}
