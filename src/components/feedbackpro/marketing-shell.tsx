// ============================================================
// FeedbackPro - Coquille marketing partagée (Header + Footer)
// ------------------------------------------------------------
// Composants serveur (pas de "use client") utilisés sur toutes les
// pages App Router marketing : /contact, /a-propos, /fonctionnalites,
// /cas-usage, /tarifs, /comparaison, /temoignages, /faq, /demo.
//
// Le bouton « Se connecter » / « Essayer gratuitement » pointe vers
// /?auth=login et /?auth=register : la SPA racine (src/app/page.tsx)
// détecte ce paramètre et bascule en mode auth (login/register) via
// le store Zustand (setAuthMode). Cela permet de garder la logique
// SPA intacte sans dupliquer l'écran d'authentification.
// ============================================================

import Link from "next/link"
import { ArrowRight, ChevronRight, Menu, ShieldCheck } from "lucide-react"
import type { Metadata } from "next"

// ---------- Liens de navigation (vrais pages App Router) ----------

export const NAV_LINKS: { href: string; label: string }[] = [
  { href: "/fonctionnalites", label: "Fonctionnalités" },
  { href: "/cas-usage", label: "Cas d'usage" },
  { href: "/tarifs", label: "Tarifs" },
  { href: "/comparaison", label: "Comparatif" },
  { href: "/temoignages", label: "Témoignages" },
  { href: "/faq", label: "FAQ" },
  { href: "/a-propos", label: "À propos" },
  { href: "/contact", label: "Contact" },
]

// ---------- Helpers pour les métadonnées de page ----------

export function pageMetadata(titre: string, description: string): Metadata {
  return {
    title: titre,
    description,
    alternates: { canonical: undefined },
  }
}

// ---------- Header marketing (logo + nav + CTA) ----------

export function MarketingHeader({ activePath }: { activePath?: string }) {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-gray-200 bg-white/85 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="flex items-center gap-2 font-bold text-gray-900"
          aria-label="Accueil FeedbackPro"
        >
          <img src="/logo-feedbackpro.png" alt="FeedbackPro" className="h-11 w-auto" />
        </Link>

        {/* Liens desktop */}
        <nav className="hidden items-center gap-0.5 lg:flex" aria-label="Navigation principale">
          {NAV_LINKS.map((lien) => {
            const actif = activePath === lien.href
            return (
              <Link
                key={lien.href}
                href={lien.href}
                aria-current={actif ? "page" : undefined}
                className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  actif
                    ? "bg-gray-100 text-[#1E1E2E]"
                    : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                }`}
              >
                {lien.label}
              </Link>
            )
          })}
        </nav>

        {/* CTA desktop */}
        <div className="hidden items-center gap-2 lg:flex">
          <Link
            href="/?auth=login"
            className="rounded-md px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900"
          >
            Se connecter
          </Link>
          <Link
            href="/?auth=register"
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-gradient-to-br from-[#5257C9] to-[#0047c7] px-4 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90"
          >
            Essayer gratuitement
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        {/* Burger mobile : menu simplifié (les liens principaux) */}
        <details className="relative lg:hidden">
          <summary
            className="flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-md text-gray-900 hover:bg-gray-100"
            aria-label="Ouvrir le menu"
          >
            <Menu className="h-5 w-5" />
          </summary>
          <div className="absolute right-0 top-12 w-64 overflow-hidden rounded-2xl border border-gray-200 bg-white p-2 shadow-xl">
            {NAV_LINKS.map((lien) => (
              <Link
                key={lien.href}
                href={lien.href}
                className="flex items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 hover:text-gray-900"
              >
                {lien.label}
                <ChevronRight className="h-4 w-4 text-gray-400" />
              </Link>
            ))}
            <div className="mt-2 flex flex-col gap-2 border-t border-gray-100 pt-2">
              <Link
                href="/?auth=login"
                className="rounded-lg border border-gray-300 px-3 py-2 text-center text-sm font-medium text-gray-900 hover:bg-gray-50"
              >
                Se connecter
              </Link>
              <Link
                href="/?auth=register"
                className="rounded-lg bg-gradient-to-br from-[#5257C9] to-[#0047c7] px-3 py-2 text-center text-sm font-semibold text-white"
              >
                Essayer gratuitement
              </Link>
            </div>
          </div>
        </details>
      </div>
    </header>
  )
}

// ---------- Footer marketing (4 colonnes + légal) ----------

export function MarketingFooter() {
  const annee = new Date().getFullYear()
  return (
    <footer className="border-t border-gray-800 bg-gray-900 text-white">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          {/* Colonne 1 : FeedbackPro */}
          <div className="col-span-2 md:col-span-1">
            <Link
              href="/"
              className="flex items-center gap-2 font-bold"
              aria-label="Accueil FeedbackPro"
            >
              <img
                src="/logo-feedbackpro-transparent.png"
                alt="FeedbackPro"
                className="h-10 w-auto brightness-0 invert"
              />
            </Link>
            <p className="mt-3 max-w-xs text-sm text-gray-400">
              Le Client Mystère 2.0 : chaque client devient auditeur qualité, chaque matin devient
              plan d&apos;action.
            </p>
            <Link
              href="/?auth=login"
              className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-[#5b8def] hover:underline"
            >
              Se connecter
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          {/* Colonne 2 : Produit */}
          <nav aria-label="Produit">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-500">
              Produit
            </h3>
            <ul className="mt-4 space-y-2.5">
              <li>
                <Link href="/fonctionnalites" className="text-sm text-gray-400 transition-colors hover:text-white">
                  Fonctionnalités
                </Link>
              </li>
              <li>
                <Link href="/cas-usage" className="text-sm text-gray-400 transition-colors hover:text-white">
                  Cas d&apos;usage
                </Link>
              </li>
              <li>
                <Link href="/tarifs" className="text-sm text-gray-400 transition-colors hover:text-white">
                  Tarifs
                </Link>
              </li>
              <li>
                <Link href="/comparaison" className="text-sm text-gray-400 transition-colors hover:text-white">
                  Comparatif
                </Link>
              </li>
            </ul>
          </nav>

          {/* Colonne 3 : Ressources */}
          <nav aria-label="Ressources">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-500">
              Ressources
            </h3>
            <ul className="mt-4 space-y-2.5">
              <li>
                <Link href="/faq" className="text-sm text-gray-400 transition-colors hover:text-white">
                  FAQ
                </Link>
              </li>
              <li>
                <Link href="/temoignages" className="text-sm text-gray-400 transition-colors hover:text-white">
                  Témoignages
                </Link>
              </li>
              <li>
                <Link href="/a-propos" className="text-sm text-gray-400 transition-colors hover:text-white">
                  À propos
                </Link>
              </li>
              <li>
                <Link href="/contact" className="text-sm text-gray-400 transition-colors hover:text-white">
                  Contact
                </Link>
              </li>
            </ul>
          </nav>

          {/* Colonne 4 : Légal */}
          <nav aria-label="Légal">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-500">
              Légal
            </h3>
            <ul className="mt-4 space-y-2.5">
              <li>
                <Link href="/mentions-legales" className="text-sm text-gray-400 transition-colors hover:text-white">
                  Mentions légales
                </Link>
              </li>
              <li>
                <Link href="/cgu" className="text-sm text-gray-400 transition-colors hover:text-white">
                  Conditions générales
                </Link>
              </li>
              <li>
                <Link href="/confidentialite" className="text-sm text-gray-400 transition-colors hover:text-white">
                  Confidentialité
                </Link>
              </li>
              <li>
                <Link href="/cookies" className="text-sm text-gray-400 transition-colors hover:text-white">
                  Cookies
                </Link>
              </li>
            </ul>
          </nav>
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-3 border-t border-gray-800 pt-6 sm:flex-row">
          <p className="text-xs text-gray-500">
            © {annee} FeedbackPro. Fait avec ❤️ en France.
          </p>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
            Hébergement européen · Conforme RGPD
          </div>
        </div>
      </div>
    </footer>
  )
}

// ---------- CTA final réutilisable ----------

export function MarketingCTA({
  titre = "Prêt à transformer votre qualité ?",
  sousTitre = "Rejoignez les 127+ établissements qui pilotent leur qualité en temps réel. Premier rapport dès demain matin.",
  bouton = "Commencer gratuitement",
}: {
  titre?: string
  sousTitre?: string
  bouton?: string
}) {
  return (
    <section className="px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
      <div className="relative mx-auto max-w-6xl overflow-hidden rounded-3xl border border-[#5257C9]/30 bg-gradient-to-br from-[#5257C9] to-[#0047c7] px-6 py-14 text-center shadow-2xl shadow-[#5257C9]/30 sm:px-12 sm:py-18">
        <div className="relative">
          <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl lg:text-5xl">
            {titre}
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-base text-white/90 sm:text-lg">{sousTitre}</p>
          <div className="mt-8 flex flex-col items-center gap-4">
            <Link
              href="/?auth=register"
              className="inline-flex h-12 items-center gap-2 rounded-md border-0 bg-white px-8 text-base font-semibold text-[#5257C9] shadow-lg hover:bg-gray-50"
            >
              {bouton}
              <ArrowRight className="h-4 w-4" />
            </Link>
            <div className="flex flex-col items-center gap-2 text-sm text-white/90 sm:flex-row sm:gap-6">
              <span>✓ 14 jours d&apos;essai</span>
              <span>✓ Sans CB</span>
              <span>✓ Annulation en 1 clic</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

// ---------- Coquille complète : Header + main + Footer ----------

export function MarketingLayout({
  children,
  activePath,
}: {
  children: React.ReactNode
  activePath?: string
}) {
  return (
    <div className="flex min-h-screen flex-col bg-white text-gray-900">
      <MarketingHeader activePath={activePath} />
      <main className="flex-1">{children}</main>
      <MarketingFooter />
    </div>
  )
}
