// ============================================================
// FeedbackPro - Gabarit commun des pages légales (Session 6 §4)
// Composant serveur : aucun état, aucun "use client" requis.
// Utilisé par /mentions-legales, /cgu, /confidentialite, /cookies.
// ============================================================

import Link from "next/link"
import { ArrowLeft, QrCode } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"

export const PAGES_LEGALES = [
  { href: "/mentions-legales", label: "Mentions légales" },
  { href: "/cgu", label: "CGU" },
  { href: "/confidentialite", label: "Confidentialité" },
  { href: "/cookies", label: "Cookies" },
  { href: "/rgpd", label: "RGPD par secteur" },
]

/** Bloc de titre d'une section légale */
export function SectionLegale({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold tracking-tight">{titre}</h2>
      <div className="space-y-2 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </section>
  )
}

/** Layout commun : en-tête avec retour, contenu en Card, pied de liens légaux */
export function LegalLayout({
  titre,
  description,
  dateMiseAJour,
  pageActive,
  children,
}: {
  titre: string
  description: string
  dateMiseAJour: string
  pageActive: string
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      {/* En-tête : logo + lien retour */}
      <header className="sticky top-0 z-30 border-b bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
        <div className="mx-auto flex h-14 w-full max-w-3xl items-center justify-between px-4 sm:h-16 sm:px-6">
          <Link
            href="/"
            className="flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            aria-label="Retour à l'accueil FeedbackPro"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Retour
          </Link>
          <Link href="/" className="flex items-center gap-2" aria-label="FeedbackPro — Accueil">
            <span
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground"
              aria-hidden
            >
              <QrCode className="h-4 w-4" />
            </span>
            <span className="font-bold">FeedbackPro</span>
          </Link>
        </div>
      </header>

      {/* Contenu */}
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6 sm:py-12">
        <p className="text-xs font-medium uppercase tracking-wider text-primary">Informations légales</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">{titre}</h1>
        <p className="mt-2 text-sm text-muted-foreground sm:text-base">{description}</p>
        <p className="mt-1 text-xs text-muted-foreground">Dernière mise à jour : {dateMiseAJour}</p>

        <Card className="mt-8">
          <CardContent className="flex flex-col gap-7 p-5 sm:p-8">{children}</CardContent>
        </Card>
      </main>

      {/* Pied : liens vers les autres pages légales */}
      <footer className="mt-auto border-t bg-muted/30">
        <div className="mx-auto flex max-w-3xl flex-col items-center gap-3 px-4 py-6 text-xs text-muted-foreground sm:flex-row sm:justify-between sm:px-6">
          <p>© {new Date().getFullYear()} FeedbackPro — Tous droits réservés.</p>
          <nav aria-label="Pages légales" className="flex flex-wrap items-center justify-center gap-3 sm:gap-4">
            {PAGES_LEGALES.map((p) => (
              <Link
                key={p.href}
                href={p.href}
                aria-current={p.href === pageActive ? "page" : undefined}
                className={
                  p.href === pageActive
                    ? "font-medium text-primary"
                    : "transition-colors hover:text-primary"
                }
              >
                {p.label}
              </Link>
            ))}
          </nav>
        </div>
      </footer>
    </div>
  )
}
