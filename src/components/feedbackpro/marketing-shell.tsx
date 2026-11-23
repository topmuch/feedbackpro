// ============================================================
// FeedVoice - Coquille marketing partagée (Header + Footer)
// ------------------------------------------------------------
// Design « Hyer Aviation » (Refero) : monochrome Deep Ink + UNE
// note chaude Clay Ember, pills 1000px, cartes 0px radius,
// AUCUNE ombre, oscillation blanc ↔ bandes sombres.
//
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
import { ArrowRight, ChevronRight, Menu } from "lucide-react"
import type { Metadata } from "next"
import { BrandMark } from "@/components/feedbackpro/brand-mark"

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

// ---------- Wordmark texte (signature Hyer, ® exposant) ----------

export function HyerWordmark({ className = "", tone = "ink" }: { className?: string; tone?: "ink" | "white" }) {
  // Délègue au composant marque unique (asset officiel harmonisé)
  return <BrandMark tone={tone} className={className} />
}

// ---------- Header marketing (logo + nav + CTA) ----------

export function MarketingHeader({ activePath }: { activePath?: string }) {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-[#d5d3d4] bg-white/90 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="flex items-center"
          aria-label="Accueil FeedVoice"
        >
          <HyerWordmark className="h-6" />
        </Link>

        {/* Liens desktop */}
        <nav className="hidden items-center gap-1 lg:flex" aria-label="Navigation principale">
          {NAV_LINKS.map((lien) => {
            const actif = activePath === lien.href
            return (
              <Link
                key={lien.href}
                href={lien.href}
                aria-current={actif ? "page" : undefined}
                className={`rounded-full border px-4 py-1.5 text-[15px] transition-colors ${
                  actif
                    ? "border-[#000d10] bg-white text-[#000d10] font-semibold"
                    : "border-transparent text-[#8e8e95] hover:border-[#000d10] hover:text-[#000d10]"
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
            className="rounded-full border border-transparent px-4 py-2 text-[15px] text-[#8e8e95] transition-colors hover:border-[#000d10] hover:text-[#000d10]"
          >
            Se connecter
          </Link>
          <Link
            href="/?auth=register"
            className="inline-flex items-center gap-1.5 rounded-full bg-[#000d10] px-5 py-2.5 text-[15px] font-bold text-white transition-colors hover:bg-[#0f0f1c]"
          >
            Essayer gratuitement
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>

        {/* Burger mobile : menu simplifié (les liens principaux) */}
        <details className="relative lg:hidden">
          <summary
            className="flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-full border border-[#d5d3d4] text-[#000d10]"
            aria-label="Ouvrir le menu"
          >
            <Menu className="h-5 w-5" aria-hidden />
          </summary>
          <div className="absolute right-0 top-12 w-64 overflow-hidden rounded-none border border-[#d5d3d4] bg-white p-2">
            {NAV_LINKS.map((lien) => (
              <Link
                key={lien.href}
                href={lien.href}
                className={`flex items-center justify-between px-3 py-2.5 text-[15px] transition-colors ${
                  activePath === lien.href
                    ? "bg-white font-semibold text-[#000d10]"
                    : "text-[#8e8e95] hover:text-[#000d10]"
                }`}
              >
                {lien.label}
                <ChevronRight className="h-4 w-4 text-[#d5d3d4]" aria-hidden />
              </Link>
            ))}
            <div className="mt-2 flex flex-col gap-2 border-t border-[#d5d3d4] pt-2">
              <Link
                href="/?auth=login"
                className="rounded-full border border-[#000d10] px-3 py-2 text-center text-[15px] font-medium text-[#000d10]"
              >
                Se connecter
              </Link>
              <Link
                href="/?auth=register"
                className="rounded-full bg-[#000d10] px-3 py-2 text-center text-[15px] font-bold text-white"
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

// ---------- Footer marketing (bande terminale Deep Ink) ----------

export function MarketingFooter() {
  const annee = new Date().getFullYear()
  return (
    <footer className="bg-[#000d10] text-white">
      <div className="mx-auto max-w-[1200px] px-4 py-14 sm:px-6 lg:px-8">
        <HyerWordmark tone="white" className="h-10 sm:h-14" />
        <div className="mt-10 grid grid-cols-2 gap-8 md:grid-cols-4">
          {/* Colonne 1 : Manifeste */}
          <div className="col-span-2 md:col-span-1">
            <p className="text-[15px] leading-relaxed text-[#8e8e95]">
              Le Client Mystère 2.0&nbsp;: chaque client devient auditeur qualité, chaque matin devient
              plan d&apos;action.
            </p>
            <Link
              href="/?auth=login"
              className="mt-4 inline-flex items-center gap-1 text-[15px] font-semibold text-[#bc7155] hover:text-white"
            >
              Se connecter
              <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          </div>

          {/* Colonne 2 : Produit */}
          <nav aria-label="Produit">
            <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-[#8e8e95]">
              Produit
            </h3>
            <ul className="mt-4 space-y-2.5">
              <li>
                <Link href="/fonctionnalites" className="text-[15px] text-[#a9adb6] transition-colors hover:text-white">
                  Fonctionnalités
                </Link>
              </li>
              <li>
                <Link href="/cas-usage" className="text-[15px] text-[#a9adb6] transition-colors hover:text-white">
                  Cas d&apos;usage
                </Link>
              </li>
              <li>
                <Link href="/tarifs" className="text-[15px] text-[#a9adb6] transition-colors hover:text-white">
                  Tarifs
                </Link>
              </li>
              <li>
                <Link href="/comparaison" className="text-[15px] text-[#a9adb6] transition-colors hover:text-white">
                  Comparatif
                </Link>
              </li>
            </ul>
          </nav>

          {/* Colonne 3 : Ressources */}
          <nav aria-label="Ressources">
            <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-[#8e8e95]">
              Ressources
            </h3>
            <ul className="mt-4 space-y-2.5">
              <li>
                <Link href="/faq" className="text-[15px] text-[#a9adb6] transition-colors hover:text-white">
                  FAQ
                </Link>
              </li>
              <li>
                <Link href="/temoignages" className="text-[15px] text-[#a9adb6] transition-colors hover:text-white">
                  Témoignages
                </Link>
              </li>
              <li>
                <Link href="/a-propos" className="text-[15px] text-[#a9adb6] transition-colors hover:text-white">
                  À propos
                </Link>
              </li>
              <li>
                <Link href="/contact" className="text-[15px] text-[#a9adb6] transition-colors hover:text-white">
                  Contact
                </Link>
              </li>
            </ul>
          </nav>

          {/* Colonne 4 : Légal */}
          <nav aria-label="Légal">
            <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-[#8e8e95]">
              Légal
            </h3>
            <ul className="mt-4 space-y-2.5">
              <li>
                <Link href="/mentions-legales" className="text-[15px] text-[#a9adb6] transition-colors hover:text-white">
                  Mentions légales
                </Link>
              </li>
              <li>
                <Link href="/cgu" className="text-[15px] text-[#a9adb6] transition-colors hover:text-white">
                  Conditions générales
                </Link>
              </li>
              <li>
                <Link href="/confidentialite" className="text-[15px] text-[#a9adb6] transition-colors hover:text-white">
                  Confidentialité
                </Link>
              </li>
              <li>
                <Link href="/cookies" className="text-[15px] text-[#a9adb6] transition-colors hover:text-white">
                  Cookies
                </Link>
              </li>
            </ul>
          </nav>
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-3 border-t border-white/10 pt-6 sm:flex-row">
          <p className="text-xs text-[#8e8e95]">
            © {annee} FeedVoice. Fait avec ❤️ en France.
          </p>
          <div className="flex items-center gap-2 text-xs text-[#8e8e95]">
            <span className="h-2 w-2 rounded-full bg-[#bc7155]" aria-hidden />
            Hébergement européen · Conforme RGPD
          </div>
        </div>
      </div>
    </footer>
  )
}

// ---------- CTA final réutilisable (bande Hull, carte carrée) ----------

export function MarketingCTA({
  titre = "Prêt à transformer votre qualité ?",
  sousTitre = "Rejoignez les 127+ établissements qui pilotent leur qualité en temps réel. Premier rapport dès demain matin.",
  bouton = "Commencer gratuitement",
}: {
  titre?: string
  sousTitre?: string
  bouton?: string
}) {
  // Signature Hyer : le titre se termine par un point Clay Ember.
  const titreAvecPoint = /[.?!]$/.test(titre.trim()) ? titre : `${titre}.`
  return (
    <section className="px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
      <div className="mx-auto max-w-[1200px] bg-[#0f0f1c] px-6 py-14 text-center sm:px-12 sm:py-20">
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#8e8e95]">
          Un moteur, tous vos terrains
        </p>
        <h2 className="mx-auto mt-4 max-w-3xl text-3xl font-bold tracking-[-0.02em] text-white sm:text-4xl lg:text-5xl">
          {titreAvecPoint.replace(/\.$/, "")}
          <span className="text-[#bc7155]">.</span>
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-[17px] leading-relaxed text-[#a9adb6]">{sousTitre}</p>
        <div className="mt-8 flex flex-col items-center gap-4">
          <Link
            href="/?auth=register"
            className="inline-flex items-center gap-2 rounded-full bg-white px-8 py-3.5 text-[17px] font-bold text-[#000d10] transition-colors hover:bg-[#f2f1ef]"
          >
            {bouton}
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
          <div className="flex flex-col items-center gap-2 text-[15px] text-[#a9adb6] sm:flex-row sm:gap-6">
            <span>14 jours d&apos;essai</span>
            <span aria-hidden>·</span>
            <span>Sans CB</span>
            <span aria-hidden>·</span>
            <span>Annulation en 1 clic</span>
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
    <div className="flex min-h-screen flex-col bg-white text-[#000d10]">
      <MarketingHeader activePath={activePath} />
      <main className="flex-1">{children}</main>
      <MarketingFooter />
    </div>
  )
}
