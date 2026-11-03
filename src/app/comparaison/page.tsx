// ============================================================
// FeedbackPro - Page Comparatif (App Router)
// ------------------------------------------------------------
// Route réelle : GET /comparaison
// Contenu : Tableau "Traditionnel vs FeedbackPro" (6 critères)
// + CTA final.
// ============================================================

import type { Metadata } from "next"
import { Check, X } from "lucide-react"
import { MarketingLayout, MarketingCTA } from "@/components/feedbackpro/marketing-shell"
import { COMPARISON_ROWS } from "@/lib/landing-data"

export const metadata: Metadata = {
  title: "Comparatif Client Mystère traditionnel vs FeedbackPro",
  description:
    "Traditionnel vs FeedbackPro : 10× moins cher, 30× plus rapide, 100× plus actionnable. Tableau complet sur 6 critères (prix, fréquence, couverture, réactivité, actionnable, ROI).",
  alternates: { canonical: "/comparaison" },
}

export default function ComparaisonPage() {
  return (
    <MarketingLayout activePath="/comparaison">
      {/* ---------- Hero ---------- */}
      <section className="bg-gradient-to-b from-[#002e85]/5 to-white py-14 sm:py-20">
        <div className="mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
          <span className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-medium text-[#002e85] shadow-sm">
            Comparatif
          </span>
          <h1
            className="mt-4 text-4xl font-extrabold tracking-tight text-gray-900 sm:text-5xl"
            style={{ letterSpacing: "-0.03em" }}
          >
            Traditionnel <span className="text-gray-400">vs</span>{" "}
            <span className="bg-gradient-to-br from-[#002e85] to-[#0047c7] bg-clip-text text-transparent">FeedbackPro</span>
          </h1>
          <p className="mt-4 text-lg text-gray-600">
            Même objectif (mesurer votre qualité), mais 10× moins cher, 30× plus rapide et 100×
            plus actionnable.
          </p>
        </div>
      </section>

      {/* ---------- Tableau comparatif ---------- */}
      <section className="mx-auto max-w-5xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
        <div className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm">
          {/* En-tête tableau */}
          <div className="grid grid-cols-3 border-b border-gray-200">
            <div className="px-4 py-5 text-xs font-semibold uppercase tracking-widest text-gray-500 sm:px-6">
              Critère
            </div>
            <div className="px-4 py-5 text-sm font-semibold text-gray-700 sm:px-6">
              Client Mystère <span className="hidden sm:inline">traditionnel</span>
            </div>
            <div className="relative border-l border-[#002e85]/30 bg-[#002e85]/10 px-4 py-5 text-sm font-semibold text-gray-900 sm:px-6">
              <span className="flex flex-wrap items-center gap-2">
                <span className="bg-gradient-to-br from-[#002e85] to-[#0047c7] bg-clip-text text-transparent">
                  FeedbackPro
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                  ✅ 10× moins cher
                </span>
              </span>
            </div>
          </div>

          {/* Lignes */}
          {COMPARISON_ROWS.map((row, i) => (
            <div
              key={row.critere}
              className={`grid grid-cols-3 items-center ${i % 2 === 1 ? "bg-gray-50/60" : ""}`}
            >
              <div className="px-4 py-4 text-sm font-medium text-gray-900 sm:px-6">
                {row.critere}
              </div>
              <div className="flex items-center gap-2 px-4 py-4 text-sm text-gray-600 sm:px-6">
                <X className="h-4 w-4 shrink-0 text-rose-500" aria-hidden />
                <span>{row.traditionnel}</span>
              </div>
              <div className="flex items-center gap-2 border-l border-[#002e85]/30 bg-[#002e85]/5 px-4 py-4 text-sm font-medium sm:px-6">
                <Check className="h-4 w-4 shrink-0 text-emerald-500" aria-hidden />
                <span className="text-gray-900">{row.feedbackpro}</span>
              </div>
            </div>
          ))}
        </div>

        {/* ---------- Bloc ROI ---------- */}
        <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-3">
          <div className="rounded-3xl border border-gray-200 bg-white p-6 text-center shadow-sm">
            <p className="text-4xl font-extrabold text-[#002e85]">10×</p>
            <p className="mt-2 text-sm text-gray-600">moins cher qu&apos;un audit classique</p>
          </div>
          <div className="rounded-3xl border border-gray-200 bg-white p-6 text-center shadow-sm">
            <p className="text-4xl font-extrabold text-[#002e85]">30×</p>
            <p className="mt-2 text-sm text-gray-600">plus rapide (rapport le lendemain matin)</p>
          </div>
          <div className="rounded-3xl border border-gray-200 bg-white p-6 text-center shadow-sm">
            <p className="text-4xl font-extrabold text-[#002e85]">100×</p>
            <p className="mt-2 text-sm text-gray-600">plus actionnable (3 priorités/jour par IA)</p>
          </div>
        </div>
      </section>

      <MarketingCTA />
    </MarketingLayout>
  )
}
