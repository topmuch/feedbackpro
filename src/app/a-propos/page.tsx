// ============================================================
// FeedbackPro - Page À propos (App Router)
// ------------------------------------------------------------
// Route réelle : GET /a-propos
// Sections : mission · comment ça marche (4 étapes) · pourquoi
// FeedbackPro (3 avantages) · l'équipe (3 cards) · nos valeurs
// (Qualité, Innovation, Proximité client) · CTA contact.
// ============================================================

import type { Metadata } from "next"
import Link from "next/link"
import {
  ArrowRight,
  BarChart3,
  Bot,
  Heart,
  MapPin,
  QrCode,
  ScanLine,
  Sparkles,
  Target,
  TrendingUp,
  Trophy,
  Users,
  Zap,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { MarketingLayout, MarketingCTA } from "@/components/feedbackpro/marketing-shell"

export const metadata: Metadata = {
  title: "À propos de FeedbackPro",
  description:
    "FeedbackPro transforme chaque client en auditeur qualité grâce à l'IA. Découvrez notre mission, notre équipe, nos valeurs et comment fonctionne notre Coach IA d'audit qualité continu.",
  alternates: { canonical: "/a-propos" },
}

const ETAPES: { num: number; icone: typeof QrCode; titre: string; texte: string }[] = [
  {
    num: 1,
    icone: QrCode,
    titre: "QR Code par zone",
    texte: "Un QR code dédié à chaque point de contact (accueil, salle, terrasse, toilettes…). Le client le scanne en 2 secondes.",
  },
  {
    num: 2,
    icone: ScanLine,
    titre: "Scan client en 10 s",
    texte: "Le client note de 1 à 5 étoiles et choisit des tags en un clic. Aucune inscription, aucune app à installer.",
  },
  {
    num: 3,
    icone: Bot,
    titre: "L'IA analyse tout",
    texte: "Notre Coach IA consolide les retours, détecte les patterns et identifie les priorités du jour automatiquement.",
  },
  {
    num: 4,
    icone: BarChart3,
    titre: "Rapport quotidien",
    texte: "Chaque matin, vous recevez un rapport d'audit avec votre score global et vos 3 priorités actionnables.",
  },
]

const AVANTAGES: { icone: typeof Zap; titre: string; texte: string }[] = [
  {
    icone: TrendingUp,
    titre: "10× moins cher",
    texte: "29 € / mois contre 500 à 1 500 € par visite client mystère traditionnelle. Le coût d'un audit qualité divisé par 10, sans rogner sur la profondeur.",
  },
  {
    icone: Zap,
    titre: "Temps réel",
    texte: "Alerte WhatsApp instantanée dès qu'un client signale un problème. Vous pouvez corriger avant qu'il ne quitte votre établissement.",
  },
  {
    icone: Bot,
    titre: "IA actionnable",
    texte: "Pas un simple dashboard : l'IA lit vos retours et vous donne chaque matin 3 priorités concrètes, priorisées par impact.",
  },
]

const EQUIPE: { initiales: string; nom: string; poste: string; bio: string; couleur: string }[] = [
  {
    initiales: "AM",
    nom: "Awa Mbaye",
    poste: "Co-fondatrice & CEO",
    bio: "10 ans dans la restauration et l'hôtellerie à Dakar. Awa a vu trop de clients silencieux partir sans rien dire. Elle a fondé FeedbackPro pour leur donner une voix.",
    couleur: "from-[#002e85] to-[#0047c7]",
  },
  {
    initiales: "MD",
    nom: "Moussa Diallo",
    poste: "Co-fondateur & CTO",
    bio: "Ingénieur IA formé à Paris. Moussa conçoit le moteur du Coach IA : analyse sémantique, détection de patterns et génération de priorités actionnables.",
    couleur: "from-emerald-500 to-teal-500",
  },
  {
    initiales: "FN",
    nom: "Fatou Ndiaye",
    poste: "Head of Customer Success",
    bio: "Ancienne gérante de salon, Fatou accompagne chaque nouveau commerçant dans le déploiement de FeedbackPro. Sa mission : ROI en moins de 30 jours.",
    couleur: "from-amber-500 to-orange-500",
  },
]

const VALEURS: { icone: typeof Heart; titre: string; texte: string }[] = [
  {
    icone: Trophy,
    titre: "Qualité",
    texte: "Nous ne livrons jamais un produit qui n'aurait pas été testé sur le terrain. Chaque feature est validée par des commerçants réels avant d'arriver chez vous.",
  },
  {
    icone: Sparkles,
    titre: "Innovation",
    texte: "L'IA est au cœur de tout ce que nous faisons. Mais jamais pour elle-même : toujours pour vous faire gagner du temps et de la clarté.",
  },
  {
    icone: Heart,
    titre: "Proximité client",
    texte: "Basés à Dakar, à 5 minutes de nos premiers utilisateurs. On répond en moins de 72 h, on itère avec vous, on vient sur place quand il le faut.",
  },
]

export default function AProposPage() {
  return (
    <MarketingLayout activePath="/a-propos">
      {/* ---------- Hero ---------- */}
      <section className="bg-gradient-to-b from-[#002e85]/5 to-white py-14 sm:py-20">
        <div className="mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
          <span className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-medium text-[#002e85] shadow-sm">
            <Sparkles className="h-3.5 w-3.5" />
            Notre histoire
          </span>
          <h1
            className="mt-4 text-4xl font-extrabold tracking-tight text-gray-900 sm:text-5xl"
            style={{ letterSpacing: "-0.03em" }}
          >
            À propos de <span className="bg-gradient-to-br from-[#002e85] to-[#0047c7] bg-clip-text text-transparent">FeedbackPro</span>
          </h1>
          <p className="mt-4 text-lg text-gray-600">
            Né à Dakar d&apos;une frustration simple : trop de commerces pilotent à l&apos;instinct, sans
            jamais entendre les clients qui partent sans rien dire. FeedbackPro leur donne une voix.
          </p>
        </div>
      </section>

      {/* ---------- Mission ---------- */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
        <Card className="overflow-hidden rounded-3xl border border-gray-200 shadow-sm">
          <div className="grid grid-cols-1 lg:grid-cols-5">
            <div className="relative bg-gradient-to-br from-[#002e85] to-[#0047c7] p-8 text-white sm:p-12 lg:col-span-2">
              <Target className="h-10 w-10 opacity-80" aria-hidden />
              <p className="mt-6 text-xs uppercase tracking-[0.3em] text-white/70">Notre mission</p>
              <p className="mt-3 text-2xl font-bold leading-snug sm:text-3xl">
                Transformer chaque client en auditeur qualité grâce à l&apos;IA.
              </p>
            </div>
            <div className="p-8 sm:p-12 lg:col-span-3">
              <p className="text-base leading-relaxed text-gray-700">
                Trop de commerçants découvrent leurs problèmes sur Google, des semaines après qu&apos;un
                client mécontent soit parti. C&apos;est trop tard, c&apos;est public, c&apos;est
                destructeur.
              </p>
              <p className="mt-4 text-base leading-relaxed text-gray-700">
                Notre conviction : <strong>chaque client est un client mystère potentiel</strong>. Si on
                lui donne un canal simple, anonyme et immédiat pour s&apos;exprimer — un QR code, 10
                secondes, 5 étoiles et 2 tags — on obtient 100× plus de retours qu&apos;une enquête
                classique.
              </p>
              <p className="mt-4 text-base leading-relaxed text-gray-700">
                Reste à transformer ce flux en action. C&apos;est le rôle du <strong>Coach IA</strong> :
                analyser chaque matin les retours de la veille, identifier les patterns, et vous
                livrer <strong>3 priorités concrètes</strong> pour la journée. Pas un dashboard
                complexe. Un plan d&apos;action.
              </p>
            </div>
          </div>
        </Card>
      </section>

      {/* ---------- Comment ça marche (4 étapes) ---------- */}
      <section className="border-y border-gray-200 bg-gray-50">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
          <div className="mx-auto max-w-2xl text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-medium text-[#002e85] shadow-sm">
              Comment ça marche
            </span>
            <h2
              className="mt-4 text-3xl font-extrabold tracking-tight text-gray-900 sm:text-4xl"
              style={{ letterSpacing: "-0.03em" }}
            >
              4 étapes, du QR au rapport
            </h2>
            <p className="mt-3 text-base text-gray-600">
              De l&apos;instant où le client scanne à celui où vous ouvrez votre rapport matinal.
            </p>
          </div>
          <div className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {ETAPES.map((e) => {
              const Icone = e.icone
              return (
                <Card key={e.num} className="relative overflow-hidden rounded-3xl border border-gray-200 shadow-sm">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-[#002e85] to-[#0047c7] text-white shadow-sm">
                        <Icone className="h-5 w-5" />
                      </span>
                      <span className="text-4xl font-extrabold leading-none text-gray-200">{e.num}</span>
                    </div>
                    <CardTitle className="mt-3 text-base font-semibold text-gray-900">{e.titre}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm leading-relaxed text-gray-600">{e.texte}</p>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>
      </section>

      {/* ---------- Pourquoi FeedbackPro (3 avantages) ---------- */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
        <div className="mx-auto max-w-2xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-medium text-[#002e85] shadow-sm">
            Pourquoi FeedbackPro
          </span>
          <h2
            className="mt-4 text-3xl font-extrabold tracking-tight text-gray-900 sm:text-4xl"
            style={{ letterSpacing: "-0.03em" }}
          >
            3 avantages qui changent tout
          </h2>
        </div>
        <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-3">
          {AVANTAGES.map((a) => {
            const Icone = a.icone
            return (
              <Card key={a.titre} className="h-full rounded-3xl border border-gray-200 shadow-sm transition-shadow hover:shadow-md">
                <CardHeader>
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#002e85] to-[#0047c7] text-white shadow-sm">
                    <Icone className="h-6 w-6" />
                  </span>
                  <CardTitle className="mt-3 text-lg font-bold text-gray-900">{a.titre}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm leading-relaxed text-gray-600">{a.texte}</p>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </section>

      {/* ---------- L'équipe ---------- */}
      <section className="border-y border-gray-200 bg-gray-50">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
          <div className="mx-auto max-w-2xl text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-medium text-[#002e85] shadow-sm">
              <Users className="h-3.5 w-3.5" />
              L&apos;équipe
            </span>
            <h2
              className="mt-4 text-3xl font-extrabold tracking-tight text-gray-900 sm:text-4xl"
              style={{ letterSpacing: "-0.03em" }}
            >
              Les visages derrière FeedbackPro
            </h2>
            <p className="mt-3 text-base text-gray-600">
              Une équipe pluridisciplinaire, basée à Dakar, obsédée par votre qualité.
            </p>
          </div>
          <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-3">
            {EQUIPE.map((m) => (
              <Card key={m.nom} className="h-full rounded-3xl border border-gray-200 bg-white shadow-sm transition-shadow hover:shadow-md">
                <CardContent className="p-6">
                  <div className="flex items-center gap-4">
                    <span
                      className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${m.couleur} text-lg font-bold text-white shadow-sm`}
                      aria-hidden
                    >
                      {m.initiales}
                    </span>
                    <div className="min-w-0">
                      <p className="text-base font-bold text-gray-900">{m.nom}</p>
                      <p className="text-sm text-[#002e85]">{m.poste}</p>
                    </div>
                  </div>
                  <p className="mt-4 text-sm leading-relaxed text-gray-600">{m.bio}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- Nos valeurs ---------- */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
        <div className="mx-auto max-w-2xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-medium text-[#002e85] shadow-sm">
            Nos valeurs
          </span>
          <h2
            className="mt-4 text-3xl font-extrabold tracking-tight text-gray-900 sm:text-4xl"
            style={{ letterSpacing: "-0.03em" }}
          >
            Ce qui nous guide au quotidien
          </h2>
        </div>
        <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-3">
          {VALEURS.map((v) => {
            const Icone = v.icone
            return (
              <Card key={v.titre} className="h-full rounded-3xl border border-gray-200 shadow-sm">
                <CardContent className="p-6">
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#002e85]/10 text-[#002e85]">
                    <Icone className="h-6 w-6" />
                  </span>
                  <h3 className="mt-4 text-lg font-bold text-gray-900">{v.titre}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-gray-600">{v.texte}</p>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </section>

      {/* ---------- CTA Contact ---------- */}
      <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6 lg:px-8">
        <Card className="rounded-3xl border border-gray-200 bg-white p-8 text-center shadow-sm sm:p-12">
          <MapPin className="mx-auto h-10 w-10 text-[#002e85]" aria-hidden />
          <h2 className="mt-4 text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
            Une question ? Parlons-en.
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm text-gray-600">
            Que vous soyez commerçant, partenaire ou simplement curieux, notre équipe vous répond sous
            72 heures.
          </p>
          <Link
            href="/contact"
            className="mt-6 inline-flex h-12 items-center gap-2 rounded-md bg-gradient-to-br from-[#002e85] to-[#0047c7] px-6 text-base font-semibold text-white shadow-sm hover:opacity-90"
          >
            Nous contacter
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Card>
      </section>

      {/* ---------- CTA final ---------- */}
      <MarketingCTA
        titre="Prêt à transformer votre qualité ?"
        sousTitre="Rejoignez les 127+ établissements qui pilotent leur qualité en temps réel. Premier rapport dès demain matin."
      />
    </MarketingLayout>
  )
}
