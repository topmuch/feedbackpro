// ============================================================
// FeedbackPro - Page Fonctionnalités (App Router)
// ------------------------------------------------------------
// Route réelle : GET /fonctionnalites
// Contenu : Bento grid (6 fonctionnalités) + section 7 problèmes
// résolus + CTA final.
// ============================================================

import type { Metadata } from "next"
import { TrendingUp } from "lucide-react"
import { MarketingLayout, MarketingCTA } from "@/components/feedbackpro/marketing-shell"
import { FEATURES, PROBLEM_CARDS } from "@/lib/landing-data"

export const metadata: Metadata = {
  title: "Fonctionnalités FeedbackPro — Coach IA, QR Zones, Alertes temps réel",
  description:
    "Découvrez les 6 modules FeedbackPro : Coach IA quotidien, QR Zones intelligentes, Leaderboard équipe, Alertes WhatsApp temps réel, Statistiques avancées et Supports physiques livrés.",
  alternates: { canonical: "/fonctionnalites" },
}

export default function FonctionnalitesPage() {
  return (
    <MarketingLayout activePath="/fonctionnalites">
      {/* ---------- Hero ---------- */}
      <section className="bg-gradient-to-b from-[#002e85]/5 to-white py-14 sm:py-20">
        <div className="mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
          <span className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-medium text-[#002e85] shadow-sm">
            Fonctionnalités
          </span>
          <h1
            className="mt-4 text-4xl font-extrabold tracking-tight text-gray-900 sm:text-5xl"
            style={{ letterSpacing: "-0.03em" }}
          >
            Tout pour piloter votre qualité,{" "}
            <span className="bg-gradient-to-br from-[#002e85] to-[#0047c7] bg-clip-text text-transparent">sans effort</span>
          </h1>
          <p className="mt-4 text-lg text-gray-600">
            6 modules qui couvrent l&apos;ensemble du cycle : collecte, analyse, alerte, pilotage,
            formation, déploiement terrain.
          </p>
        </div>
      </section>

      {/* ---------- Bento grid ---------- */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-6 lg:auto-rows-[minmax(0,1fr)]">
          {FEATURES.map((f) => {
            const Icone = f.icone
            return (
              <article
                key={f.titre}
                className={`group flex h-full flex-col rounded-3xl border border-gray-200 bg-white p-6 shadow-sm transition-all hover:-translate-y-1 hover:border-[#002e85]/30 hover:shadow-xl sm:p-7 ${
                  f.grand ? "lg:col-span-4 lg:row-span-2" : "lg:col-span-2"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#002e85] to-[#0047c7] text-white shadow-[0_0_20px_rgba(0,46,133,0.4)]">
                    <Icone className="h-6 w-6" />
                  </span>
                  <span className="text-2xl opacity-70 transition-transform duration-300 group-hover:scale-110">
                    {f.emoji}
                  </span>
                </div>
                <h3 className="mt-5 text-lg font-semibold text-gray-900">{f.titre}</h3>
                <p className="mt-2 text-sm leading-relaxed text-gray-600">{f.texte}</p>

                {/* Mini-illustration dans la grande card */}
                {f.grand && (
                  <div className="mt-auto pt-6">
                    <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                      <div className="flex items-center justify-between text-xs text-gray-500">
                        <span>Évolution du score — 14 jours</span>
                        <span className="flex items-center gap-1 font-medium text-emerald-600">
                          <TrendingUp className="h-3.5 w-3.5" /> +18 %
                        </span>
                      </div>
                      <div className="mt-3 flex h-20 items-end gap-1.5">
                        {[
                          45, 52, 48, 60, 58, 68, 72, 65, 78, 82, 79, 85, 88, 91,
                        ].map((h, idx) => (
                          <div
                            key={idx}
                            className="flex-1 rounded-t bg-gradient-to-br from-[#002e85] to-[#0047c7]"
                            style={{ height: `${h}%`, opacity: 0.4 + (idx / 14) * 0.6 }}
                            aria-hidden
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </article>
            )
          })}
        </div>
      </section>

      {/* ---------- 7 problèmes résolus ---------- */}
      <section className="border-y border-gray-200 bg-gray-50">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
          <div className="mx-auto max-w-2xl text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-medium text-rose-600 shadow-sm">
              Vous reconnaissez-vous ?
            </span>
            <h2
              className="mt-4 text-3xl font-extrabold tracking-tight text-gray-900 sm:text-4xl"
              style={{ letterSpacing: "-0.03em" }}
            >
              Les 7 problèmes qu&apos;FeedbackPro résout
            </h2>
            <p className="mt-3 text-base text-gray-600">
              Sans retour client en temps réel, vous pilotez à l&apos;aveugle. Voici ce que vivent
              chaque jour les commerces sans FeedbackPro.
            </p>
          </div>

          <div className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {PROBLEM_CARDS.map((c) => (
              <article
                key={c.titre}
                className="group h-full rounded-3xl border border-gray-200 bg-white p-6 shadow-sm transition-all hover:border-rose-300 hover:shadow-xl"
              >
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-50 text-3xl shadow-inner">
                  {c.emoji}
                </div>
                <h3 className="mt-5 text-lg font-semibold text-gray-900">{c.titre}</h3>
                <p className="mt-3 text-sm leading-relaxed text-gray-600">{c.texte}</p>
              </article>
            ))}
            {/* 7e card : billet "la solution" pour combler la grille 3×3 */}
            <article className="flex h-full flex-col justify-center rounded-3xl border-2 border-[#002e85] bg-gradient-to-br from-[#002e85] to-[#0047c7] p-6 text-white shadow-lg">
              <p className="text-3xl">✨</p>
              <h3 className="mt-3 text-lg font-bold">La solution ?</h3>
              <p className="mt-2 text-sm leading-relaxed text-white/90">
                Un QR code, une IA, un rapport chaque matin. FeedbackPro transforme ces 7 frustrations
                en 3 priorités actionnables.
              </p>
              <a
                href="/?auth=register"
                className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-white underline-offset-2 hover:underline"
              >
                Essayer gratuitement →
              </a>
            </article>
          </div>
        </div>
      </section>

      <MarketingCTA />
    </MarketingLayout>
  )
}
