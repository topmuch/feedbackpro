// ============================================================
// FeedbackPro - Page Témoignages (App Router)
// ------------------------------------------------------------
// Route réelle : GET /temoignages
// Contenu : 3 témoignages clients + stats clés + CTA final.
// ============================================================

import type { Metadata } from "next"
import { Quote, Star, Users } from "lucide-react"
import { MarketingLayout, MarketingCTA } from "@/components/feedbackpro/marketing-shell"
import { TESTIMONIALS } from "@/lib/landing-data"

export const metadata: Metadata = {
  title: "Témoignages clients FeedbackPro — Bistrot, Hôtel, Boutique",
  description:
    "127+ établissements utilisent FeedbackPro au quotidien. Découvrez les témoignages de Sophie (Bistrot Marais), Karim (Hôtel Royal Lyon) et Émilie (Maison Vert).",
  alternates: { canonical: "/temoignages" },
}

function Etoiles({ note }: { note: number }) {
  return (
    <div className="flex items-center gap-0.5" aria-label={`${note} sur 5`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={`h-4 w-4 ${i < note ? "fill-amber-400 text-amber-400" : "fill-gray-200 text-gray-300"}`}
          aria-hidden
        />
      ))}
    </div>
  )
}

export default function TemoignagesPage() {
  return (
    <MarketingLayout activePath="/temoignages">
      {/* ---------- Hero ---------- */}
      <section className="bg-gradient-to-b from-[#002e85]/5 to-white py-14 sm:py-20">
        <div className="mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
          <span className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-medium text-amber-600 shadow-sm">
            Témoignages
          </span>
          <h1
            className="mt-4 text-4xl font-extrabold tracking-tight text-gray-900 sm:text-5xl"
            style={{ letterSpacing: "-0.03em" }}
          >
            Ils ont <span className="bg-gradient-to-br from-[#002e85] to-[#0047c7] bg-clip-text text-transparent">transformé leur qualité</span>
          </h1>
          <p className="mt-4 text-lg text-gray-600">
            127+ établissements utilisent FeedbackPro au quotidien. Voici ce qu&apos;ils en disent.
          </p>
        </div>
      </section>

      {/* ---------- Bandeau stats ---------- */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            { valeur: "127+", label: "établissements conquis" },
            { valeur: "4,9/5", label: "satisfaction moyenne" },
            { valeur: "3 sem.", label: "ROI moyen constaté" },
            { valeur: "-73 %", label: "avis négatifs Google" },
          ].map((s) => (
            <div key={s.label} className="rounded-3xl border border-gray-200 bg-white p-5 text-center shadow-sm">
              <p className="text-3xl font-extrabold text-[#002e85]">{s.valeur}</p>
              <p className="mt-1 text-xs text-gray-600">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ---------- 3 témoignages ---------- */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {TESTIMONIALS.map((t) => (
            <article
              key={t.nom}
              className="flex h-full flex-col rounded-3xl border border-gray-200 bg-white p-6 shadow-sm transition-shadow hover:border-[#0047c7] hover:shadow-xl"
            >
              <div className="flex items-center justify-between">
                <Etoiles note={t.note} />
                <Quote className="h-6 w-6 text-[#002e85]/30" aria-hidden />
              </div>
              <blockquote className="mt-4 flex-1">
                <p className="text-sm italic leading-relaxed text-gray-700">
                  « {t.citation} »
                </p>
              </blockquote>
              <div className="mt-5 flex items-center gap-3 border-t border-gray-200 pt-4">
                <span
                  className={`flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br ${t.couleur} text-sm font-bold text-white`}
                >
                  {t.initiales}
                </span>
                <div>
                  <p className="text-sm font-semibold text-gray-900">{t.nom}</p>
                  <p className="text-xs text-gray-600">
                    {t.poste} — {t.etablissement}
                  </p>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* ---------- Encart rejoindre ---------- */}
      <section className="border-t border-gray-200 bg-gray-50">
        <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center gap-4 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#002e85] to-[#0047c7] text-white">
              <Users className="h-6 w-6" />
            </span>
            <h2 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
              Et vous, quand commencez-vous ?
            </h2>
            <p className="max-w-xl text-sm text-gray-600">
              Rejoignez les 127+ établissements qui pilotent leur qualité en temps réel. Premier
              rapport dès demain matin.
            </p>
          </div>
        </div>
      </section>

      <MarketingCTA />
    </MarketingLayout>
  )
}
