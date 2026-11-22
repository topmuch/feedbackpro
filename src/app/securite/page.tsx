export const dynamic = "force-dynamic"

// ============================================================
// FeedVoice - Page Sécurité & Conformité (App Router)
// ------------------------------------------------------------
// Route réelle : GET /securite
// Objectif : répondre à la question de confiance « où vont mes
// données et que faites-vous pour les protéger ? » — un contenu
// marketing/réassurance factuel, aligné sur ce que le produit fait
// RÉELLEMENT (rate limiting, backups, sessions httpOnly, RGPD).
// Sections : principes · sécurité technique (faits vérifiables) ·
// RGPD · sous-traitants IA · CTA.
// ============================================================

import type { Metadata } from "next"
import {
  Database,
  FileCheck2,
  Fingerprint,
  KeyRound,
  Lock,
  ServerCog,
  ShieldCheck,
  Trash2,
} from "lucide-react"
import { MarketingLayout, MarketingCTA } from "@/components/feedbackpro/marketing-shell"

export const metadata: Metadata = {
  title: "Sécurité & conformité — FeedVoice",
  description:
    "Comment FeedVoice protège vos données et celles de vos clients : sessions chiffrées, rate limiting, sauvegardes quotidiennes, RGPD, exports et droit à l'effacement.",
  alternates: { canonical: "/securite" },
}

const PRINCIPES: { icone: typeof Lock; titre: string; texte: string }[] = [
  {
    icone: Lock,
    titre: "Minimisation",
    texte:
      "Nous collectons le strict nécessaire : une note, des tags contextuels et, si le client l'accepte, un commentaire libre. Aucun compte client requis, aucune donnée bancaire, aucun tracking publicitaire.",
  },
  {
    icone: KeyRound,
    titre: "Accès restreint",
    texte:
      "Vos données d'établissement ne sont accessibles qu'à votre compte et aux employés que vous créez. Les sessions reposent sur un cookie httpOnly — inaccessible au JavaScript des pages visitées.",
  },
  {
    icone: ShieldCheck,
    titre: "Défense active",
    texte:
      "Tous nos endpoints publics (scan, retours, loterie, upload, authentifications) sont protégés par un limiteur de débit par IP : les rafales automatisées et le brute-force sont bloqués automatiquement.",
  },
  {
    icone: Database,
    titre: "Sauvegardes quotidiennes",
    texte:
      "La base est sauvegardée chaque nuit par snapshot consistant (VACUUM INTO SQLite) avec une rotation de 7 jours : une journée entière de données reste toujours récupérable.",
  },
]

const TECHNIQUE: { icone: typeof ServerCog; titre: string; texte: string }[] = [
  {
    icone: Fingerprint,
    titre: "Mots de passe & PIN jamais en clair",
    texte:
      "Les mots de passe des comptes Pro et les PIN du personnel sont stockés uniquement sous forme de hachage SHA-256. Personne — y compris notre équipe — ne peut les relire.",
  },
  {
    icone: ServerCog,
    titre: "Comptes staff verrouillés",
    texte:
      "Après 5 tentatives de PIN échouées, le compte employé se verrouille 5 minutes. Un verrouillage complémentaire par IP limite l'énumération de numéros.",
  },
  {
    icone: FileCheck2,
    titre: "Journal d'audit",
    texte:
      "Les actions sensibles du personnel VIP (connexions, demandes clients) sont tracées horodatées et consultables par le manager.",
  },
  {
    icone: ShieldCheck,
    titre: "Sonde de santé",
    texte:
      "Un endpoint de supervision (/api/health) vérifie en continu que le service et la base répondent — la disponibilité est surveillée, pas supposée.",
  },
]

const RGPD: { icone: typeof Trash2; titre: string; texte: string }[] = [
  {
    icone: Trash2,
    titre: "Droit à l'effacement",
    texte:
      "Un établissement peut demander la suppression complète de ses données à tout moment : l'outil d'effacement RGPD intégré purge retours, employés et configurations sans délai.",
  },
  {
    icone: FileCheck2,
    titre: "Portabilité",
    texte:
      "Export CSV de l'intégralité des retours en un clic : vos données vous appartiennent et repartent avec vous si vous partez.",
  },
]

export default function SecuritePage() {
  return (
    <MarketingLayout activePath="/securite">
      {/* ---------- Hero ---------- */}
      <section className="border-b border-gray-100 bg-gradient-to-b from-[#1A1A1A]/5 to-white py-14 sm:py-20">
        <div className="mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
          <span className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-medium text-[#1A1A1A] shadow-sm">
            <ShieldCheck className="h-3.5 w-3.5" />
            Sécurité &amp; conformité
          </span>
          <h1
            className="mt-4 text-4xl font-extrabold tracking-tight text-gray-900 sm:text-5xl"
            style={{ letterSpacing: "-0.03em" }}
          >
            Vos données méritent la même exigence que votre{" "}
            <span className="bg-gradient-to-br from-[#C9A961] to-[#a05f45] bg-clip-text text-transparent">
              service
            </span>
            .
          </h1>
          <p className="mt-4 text-lg text-gray-600">
            Voici, sans jargon ni promesse creuse, ce que FeedVoice met en place chaque jour pour
            protéger vos données et celles de vos clients.
          </p>
        </div>
      </section>

      {/* ---------- 4 principes ---------- */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2
            className="text-3xl font-extrabold tracking-tight text-gray-900 sm:text-4xl"
            style={{ letterSpacing: "-0.03em" }}
          >
            Nos 4 principes de protection
          </h2>
        </div>
        <div className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-2">
          {PRINCIPES.map((p) => {
            const Icone = p.icone
            return (
              <div key={p.titre} className="rounded-none border border-gray-200 bg-white p-6 shadow-sm">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#faf1ec] text-[#a05f45]">
                  <Icone className="h-5 w-5" aria-hidden />
                </span>
                <h3 className="mt-3 text-base font-semibold text-gray-900">{p.titre}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-gray-600">{p.texte}</p>
              </div>
            )
          })}
        </div>
      </section>

      {/* ---------- Sécurité technique ---------- */}
      <section className="border-y border-gray-200 bg-gray-50">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
          <div className="mx-auto max-w-2xl text-center">
            <h2
              className="text-3xl font-extrabold tracking-tight text-gray-900 sm:text-4xl"
              style={{ letterSpacing: "-0.03em" }}
            >
              Sécurité technique, en détails
            </h2>
            <p className="mt-3 text-base text-gray-600">
              Ce qui tourne réellement en production — vérifiable, pas déclaratif.
            </p>
          </div>
          <div className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {TECHNIQUE.map((t) => {
              const Icone = t.icone
              return (
                <div key={t.titre} className="relative rounded-none border border-gray-200 bg-white p-6 shadow-sm">
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-[#1A1A1A] to-[#1c2a2e] text-white">
                    <Icone className="h-5 w-5" aria-hidden />
                  </span>
                  <h3 className="mt-3 text-base font-semibold text-gray-900">{t.titre}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-gray-600">{t.texte}</p>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* ---------- RGPD ---------- */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h2
            className="text-3xl font-extrabold tracking-tight text-gray-900 sm:text-4xl"
            style={{ letterSpacing: "-0.03em" }}
          >
            RGPD, simplement
          </h2>
        </div>
        <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-2">
          {RGPD.map((r) => {
            const Icone = r.icone
            return (
              <div key={r.titre} className="rounded-none border border-gray-200 bg-white p-6 shadow-sm">
                <Icone className="h-8 w-8 text-[#1A1A1A]" aria-hidden />
                <h3 className="mt-3 text-base font-bold text-gray-900">{r.titre}</h3>
                <p className="mt-2 text-sm leading-relaxed text-gray-600">{r.texte}</p>
              </div>
            )
          })}
        </div>
        <p className="mx-auto mt-8 max-w-3xl text-center text-sm leading-relaxed text-gray-500">
          Les analyses IA (Coach IA, traduction universelle, transcription vocale) sont réalisées via
          notre infrastructure de modèle : vos retours ne sont ni utilisés pour entraîner des modèles
          publics, ni revendus. Pour toute question, une seule adresse :{" "}
          <a className="font-medium text-[#a05f45] underline underline-offset-2" href="/contact">
            notre formulaire de contact
          </a>
          .
        </p>
      </section>

      <MarketingCTA
        titre="Prêt à essayer en toute confiance"
        sousTitre="Créez votre compte, testez avec des données fictives via la démo sandbox, et gardez la main sur vos données à tout moment."
        bouton="Explorer la démo sécurisée"
      />
    </MarketingLayout>
  )
}
