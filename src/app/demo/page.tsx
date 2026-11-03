// ============================================================
// FeedbackPro - Page Démo (App Router)
// ------------------------------------------------------------
// Route réelle : GET /demo
// Contenu : Vidéo placeholder (mockup rapport) + récap des 4
// étapes + CTA inscription.
// ============================================================

import type { Metadata } from "next"
import { ArrowRight, BellRing, Bot, BarChart3, Play, QrCode, ScanLine, TrendingUp, Trophy } from "lucide-react"
import { MarketingLayout, MarketingCTA } from "@/components/feedbackpro/marketing-shell"

export const metadata: Metadata = {
  title: "Démo FeedbackPro — Voir le Coach IA en action",
  description:
    "Découvrez en 2 minutes comment FeedbackPro transforme vos clients en auditeurs qualité : scan QR, note, tags, IA, et rapport quotidien avec 3 priorités actionnables.",
  alternates: { canonical: "/demo" },
}

const ETAPES = [
  { icone: QrCode, titre: "QR Code par zone", texte: "Un QR par point de contact client." },
  { icone: ScanLine, titre: "Scan en 10 s", texte: "Note + tags, sans inscription." },
  { icone: Bot, titre: "IA analyse tout", texte: "Coach IA détecte les patterns." },
  { icone: BarChart3, titre: "Rapport quotidien", texte: "3 priorités chaque matin." },
]

export default function DemoPage() {
  return (
    <MarketingLayout activePath="/demo">
      {/* ---------- Hero ---------- */}
      <section className="bg-gradient-to-b from-[#002e85]/5 to-white py-14 sm:py-20">
        <div className="mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
          <span className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-medium text-[#002e85] shadow-sm">
            <Play className="h-3.5 w-3.5" />
            Démo produit
          </span>
          <h1
            className="mt-4 text-4xl font-extrabold tracking-tight text-gray-900 sm:text-5xl"
            style={{ letterSpacing: "-0.03em" }}
          >
            Voir le <span className="bg-gradient-to-br from-[#002e85] to-[#0047c7] bg-clip-text text-transparent">Coach IA</span> en action
          </h1>
          <p className="mt-4 text-lg text-gray-600">
            2 minutes pour comprendre comment FeedbackPro transforme chaque client en auditeur
            qualité — et chaque matin en plan d&apos;action concret.
          </p>
        </div>
      </section>

      {/* ---------- Vidéo placeholder ---------- */}
      <section className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="relative overflow-hidden rounded-3xl border border-gray-200 bg-gradient-to-br from-[#002e85] to-[#0047c7] p-8 shadow-2xl shadow-[#002e85]/30 sm:p-12">
          {/* Décoration : cercles translucides */}
          <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10" aria-hidden />
          <div className="pointer-events-none absolute -bottom-12 -left-8 h-32 w-32 rounded-full bg-white/10" aria-hidden />

          <div className="relative">
            {/* Mockup "vidéo" : on simule un lecteur avec bouton play central */}
            <div className="relative overflow-hidden rounded-2xl border border-white/20 bg-white/10 p-4 backdrop-blur">
              {/* Bandeau "lecteur" */}
              <div className="flex items-center justify-between text-xs text-white/80">
                <span className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                  Démo FeedbackPro · 2 min 14
                </span>
                <span>HD</span>
              </div>

              {/* Zone "vidéo" : mockup rapport du jour */}
              <div className="mt-3 rounded-2xl bg-white p-5 text-gray-900 shadow-lg">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <BarChart3 className="h-4 w-4 text-[#002e85]" />
                    Rapport du jour
                  </div>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-600">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    Live
                  </span>
                </div>

                <div className="mt-5 rounded-2xl bg-gradient-to-br from-[#002e85] to-[#0047c7] p-5 text-white shadow-lg">
                  <p className="text-xs uppercase tracking-widest opacity-80">Score qualité global</p>
                  <div className="mt-1 flex items-end gap-2">
                    <span className="text-5xl font-extrabold leading-none">82</span>
                    <span className="mb-1 text-lg opacity-80">/100</span>
                  </div>
                  <div className="mt-3 flex items-center gap-1.5 text-xs">
                    <TrendingUp className="h-3.5 w-3.5" /> +6 points vs hier
                  </div>
                </div>

                <div className="mt-5">
                  <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">
                    Priorités du jour
                  </p>
                  <ul className="mt-3 space-y-2">
                    <li className="flex items-start gap-3 rounded-xl bg-gray-50 p-3">
                      <span className="text-lg leading-none">⏳</span>
                      <div>
                        <p className="text-sm font-medium">Attente salle &gt; 12 min</p>
                        <p className="text-xs text-gray-600">Pic 12h-13h — renforcer 1 serveur</p>
                      </div>
                    </li>
                    <li className="flex items-start gap-3 rounded-xl bg-gray-50 p-3">
                      <span className="text-lg leading-none">💬</span>
                      <div>
                        <p className="text-sm font-medium">Personnel distrait en bar</p>
                        <p className="text-xs text-gray-600">3 signalements — brief équipe</p>
                      </div>
                    </li>
                  </ul>
                </div>
              </div>

              {/* Bouton play central par-dessus la mockup (signal "c'est une vidéo") */}
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white/90 text-[#002e85] shadow-xl">
                  <Play className="h-7 w-7 fill-current" />
                </span>
              </div>
            </div>

            {/* Bouton "lancer la démo" */}
            <div className="mt-6 flex flex-col items-center gap-2 text-center sm:flex-row sm:justify-center sm:gap-4">
              <a
                href="/?auth=register"
                className="inline-flex h-12 items-center gap-2 rounded-md bg-white px-6 text-base font-semibold text-[#002e85] shadow-lg hover:bg-gray-50"
              >
                <Play className="h-4 w-4 fill-current" />
                Lancer ma démo (essai 14 j)
              </a>
              <p className="text-xs text-white/80">Sans carte bancaire · Setup en 10 minutes</p>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- 4 étapes ---------- */}
      <section className="border-y border-gray-200 bg-gray-50">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
          <div className="mx-auto max-w-2xl text-center">
            <h2
              className="text-3xl font-extrabold tracking-tight text-gray-900 sm:text-4xl"
              style={{ letterSpacing: "-0.03em" }}
            >
              Comment ça marche
            </h2>
            <p className="mt-3 text-base text-gray-600">
              4 étapes, du QR code scanné au rapport matinal.
            </p>
          </div>
          <div className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {ETAPES.map((e, i) => {
              const Icone = e.icone
              return (
                <div key={e.titre} className="relative rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-[#002e85] to-[#0047c7] text-white shadow-sm">
                      <Icone className="h-5 w-5" />
                    </span>
                    <span className="text-4xl font-extrabold leading-none text-gray-200">{i + 1}</span>
                  </div>
                  <h3 className="mt-3 text-base font-semibold text-gray-900">{e.titre}</h3>
                  <p className="mt-1 text-sm text-gray-600">{e.texte}</p>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* ---------- Points forts ---------- */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
            <Bot className="h-8 w-8 text-[#002e85]" />
            <h3 className="mt-3 text-base font-bold text-gray-900">Coach IA actionnable</h3>
            <p className="mt-2 text-sm text-gray-600">
              Pas un simple dashboard : 3 priorités concrètes chaque matin, classées par impact.
            </p>
          </div>
          <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
            <BellRing className="h-8 w-8 text-[#002e85]" />
            <h3 className="mt-3 text-base font-bold text-gray-900">Alertes WhatsApp temps réel</h3>
            <p className="mt-2 text-sm text-gray-600">
              Un client signale un problème ? Vous êtes alerté avant qu&apos;il quitte l&apos;établissement.
            </p>
          </div>
          <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
            <Trophy className="h-8 w-8 text-[#002e85]" />
            <h3 className="mt-3 text-base font-bold text-gray-900">Leaderboard & formation</h3>
            <p className="mt-2 text-sm text-gray-600">
              Valorisez vos meilleurs employés, identifiez les besoins de formation objectivement.
            </p>
          </div>
        </div>
      </section>

      <MarketingCTA
        titre="Démarrez votre démo en 10 minutes"
        sousTitre="Créez votre compte, ajoutez vos zones, recevez votre premier rapport dès demain matin. Sans carte bancaire."
        bouton="Commencer gratuitement"
      />
    </MarketingLayout>
  )
}
