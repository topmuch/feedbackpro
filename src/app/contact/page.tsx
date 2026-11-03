// ============================================================
// FeedbackPro - Page Contact (App Router)
// ------------------------------------------------------------
// Route réelle : GET /contact
// Affiche : titre, coordonnées, carte Google Maps + itinéraire,
// formulaire de contact (POST /api/contact → toast).
// ============================================================

import type { Metadata } from "next"
import Link from "next/link"
import { Mail, MapPin, Phone, ArrowRight, ExternalLink } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { MarketingLayout } from "@/components/feedbackpro/marketing-shell"
import { ContactForm } from "@/components/feedbackpro/contact-form"

export const metadata: Metadata = {
  title: "Contactez FeedbackPro",
  description:
    "Une question sur FeedbackPro ? Contactez notre équipe à Dakar, Sénégal. Adresse : Sicap Foire, Dakar. Téléphone : +221 77 382 18 22. Email : contact@gofeedbackpro.com.",
  alternates: { canonical: "/contact" },
}

const COORDONNEES = [
  {
    icone: MapPin,
    titre: "Adresse",
    lignes: ["Sicap Foire", "Dakar, Sénégal"],
    action: {
      href: "https://www.google.com/maps/dir/?api=1&destination=Sicap+Foire+Dakar+Sénégal",
      label: "Voir l'itinéraire",
    },
  },
  {
    icone: Phone,
    titre: "Téléphone",
    lignes: ["+221 77 382 18 22"],
    action: {
      href: "tel:+221773821822",
      label: "Appeler",
    },
  },
  {
    icone: Mail,
    titre: "Email",
    lignes: ["contact@gofeedbackpro.com"],
    action: {
      href: "mailto:contact@gofeedbackpro.com",
      label: "Écrire",
    },
  },
] as const

export default function ContactPage() {
  return (
    <MarketingLayout activePath="/contact">
      {/* ---------- Hero ---------- */}
      <section className="bg-gradient-to-b from-[#002e85]/5 to-white py-14 sm:py-20">
        <div className="mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
          <span className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-medium text-[#002e85] shadow-sm">
            Contact
          </span>
          <h1
            className="mt-4 text-4xl font-extrabold tracking-tight text-gray-900 sm:text-5xl"
            style={{ letterSpacing: "-0.03em" }}
          >
            Contactez <span className="bg-gradient-to-br from-[#002e85] to-[#0047c7] bg-clip-text text-transparent">FeedbackPro</span>
          </h1>
          <p className="mt-4 text-lg text-gray-600">
            Une question, une démo, un partenariat ? Notre équipe vous répond sous 72 heures ouvrées.
          </p>
        </div>
      </section>

      {/* ---------- Coordonnées (3 cards) ---------- */}
      <section className="mx-auto -mt-6 max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
          {COORDONNEES.map((c) => {
            const Icone = c.icone
            return (
              <Card
                key={c.titre}
                className="rounded-3xl border border-gray-200 shadow-sm transition-shadow hover:shadow-md"
              >
                <CardHeader className="pb-2">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#002e85] to-[#0047c7] text-white shadow-sm">
                    <Icone className="h-6 w-6" />
                  </div>
                  <CardTitle className="mt-3 text-base font-semibold text-gray-900">{c.titre}</CardTitle>
                </CardHeader>
                <CardContent className="pt-1">
                  {c.lignes.map((l, i) => (
                    <p key={i} className="text-sm text-gray-700">{l}</p>
                  ))}
                  <a
                    href={c.action.href}
                    target={c.action.href.startsWith("http") ? "_blank" : undefined}
                    rel={c.action.href.startsWith("http") ? "noopener noreferrer" : undefined}
                    className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-[#002e85] hover:underline"
                  >
                    {c.action.label}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </a>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </section>

      {/* ---------- Carte + Formulaire ---------- */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 lg:gap-12">
          {/* Colonne gauche : Carte Google Maps */}
          <div className="space-y-5">
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
                Nous rendre visite
              </h2>
              <p className="mt-2 text-sm text-gray-600">
                Notre bureau est situé à Sicap Foire, Dakar. Cliquez sur la carte pour ouvrir
                l&apos;itinéraire dans Google Maps.
              </p>
            </div>

            <div className="overflow-hidden rounded-3xl border border-gray-200 shadow-sm">
              <iframe
                title="Localisation FeedbackPro — Sicap Foire, Dakar"
                src="https://www.google.com/maps?q=Sicap+Foire+Dakar+Sénégal&output=embed"
                className="h-80 w-full sm:h-96"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                allowFullScreen
              />
            </div>

            <a
              href="https://www.google.com/maps/dir/?api=1&destination=Sicap+Foire+Dakar+Sénégal"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-900 shadow-sm transition-colors hover:bg-gray-50"
            >
              <MapPin className="h-4 w-4 text-[#002e85]" />
              Voir l&apos;itinéraire sur Google Maps
              <ExternalLink className="h-3.5 w-3.5 text-gray-400" />
            </a>

            {/* Encart horaires */}
            <Card className="rounded-3xl border border-gray-200 bg-gray-50/50 shadow-none">
              <CardContent className="p-5">
                <h3 className="text-sm font-semibold text-gray-900">Horaires</h3>
                <ul className="mt-2 space-y-1 text-sm text-gray-600">
                  <li className="flex justify-between"><span>Lundi — Vendredi</span><span className="font-medium text-gray-900">9h — 18h</span></li>
                  <li className="flex justify-between"><span>Samedi</span><span className="font-medium text-gray-900">9h — 13h</span></li>
                  <li className="flex justify-between"><span>Dimanche</span><span className="text-gray-500">Fermé</span></li>
                </ul>
              </CardContent>
            </Card>
          </div>

          {/* Colonne droite : Formulaire */}
          <div>
            <Card className="rounded-3xl border border-gray-200 shadow-sm">
              <CardHeader>
                <CardTitle className="text-xl font-bold text-gray-900">Envoyez-nous un message</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Réponse garantie sous 72 heures ouvrées. Tous les champs sont obligatoires.
                </p>
              </CardHeader>
              <CardContent>
                <ContactForm />
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* ---------- CTA secondaire ---------- */}
      <section className="border-t border-gray-100 bg-gray-50/50 py-14">
        <div className="mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold tracking-tight text-gray-900">
            Préférez-vous tester le produit ?
          </h2>
          <p className="mt-3 text-sm text-gray-600">
            Démarrez un essai gratuit de 14 jours, sans carte bancaire. Vous recevrez votre premier
            rapport d&apos;audit dès demain matin.
          </p>
          <Link
            href="/?auth=register"
            className="mt-5 inline-flex h-12 items-center gap-2 rounded-md bg-gradient-to-br from-[#002e85] to-[#0047c7] px-6 text-base font-semibold text-white shadow-sm hover:opacity-90"
          >
            Essayer gratuitement
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
    </MarketingLayout>
  )
}
