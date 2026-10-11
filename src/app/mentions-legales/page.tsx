// ============================================================
// FeedbackPro - Page légale : Mentions légales (Session 6 §4)
// Route réelle : GET /mentions-legales
// ============================================================

import type { Metadata } from "next"
import { LegalLayout, SectionLegale } from "@/components/feedbackpro/legal-layout"

export const metadata: Metadata = {
  title: "Mentions légales — FeedbackPro",
  description:
    "Mentions légales de la plateforme FeedbackPro : éditeur, hébergement, propriété intellectuelle et contact.",
}

export default function MentionsLegalesPage() {
  return (
    <LegalLayout
      titre="Mentions légales"
      description="Informations relatives à l'éditeur de la plateforme FeedbackPro, à son hébergeur et à ses droits de propriété intellectuelle."
      dateMiseAJour="1er février 2026"
      pageActive="/mentions-legales"
    >
      <SectionLegale titre="1. Éditeur de la plateforme">
        <p>
          La plateforme <strong>FeedbackPro</strong> (ci-après « la Plateforme ») est éditée par
          FeedbackPro, société par actions simplifiée en cours d&apos;immatriculation au RCS de Paris,
          dont le siège social est situé à Paris, France.
        </p>
        <p>
          Directeur de la publication : le Président de FeedbackPro.<br />
          Contact : <a className="text-primary underline underline-offset-2" href="mailto:contact@feedbackpro.fr">contact@feedbackpro.fr</a>
        </p>
        <p>
          Numéro de TVA intracommunautaire : à communiquer lors de l&apos;immatriculation.
          FeedbackPro est entièrement financée par les abonnements de ses utilisateurs (aucune
          revente de données, aucune publicité).
        </p>
      </SectionLegale>

      <SectionLegale titre="2. Hébergement">
        <p>
          La Plateforme est hébergée par :
        </p>
        <p className="pl-4">
          <strong>Vercel Inc.</strong><br />
          440 N Barranca Ave #4133<br />
          Covina, CA 91723 — États-Unis<br />
          <a className="text-primary underline underline-offset-2" href="https://vercel.com" target="_blank" rel="noopener noreferrer">https://vercel.com</a>
        </p>
        <p>
          L&apos;hébergement peut faire l&apos;objet de transferts de données hors de l&apos;Union
          européenne ; ceux-ci sont encadrés par les clauses contractuelles types de la Commission
          européenne (voir notre Politique de confidentialité).
        </p>
      </SectionLegale>

      <SectionLegale titre="3. Propriété intellectuelle">
        <p>
          L&apos;ensemble des éléments constituant la Plateforme (structure, textes, graphismes,
          logo, code source, marque FeedbackPro) est la propriété exclusive de FeedbackPro ou de
          ses partenaires, et est protégé par le Code de la propriété intellectuelle.
        </p>
        <p>
          Toute reproduction, représentation ou exploitation, totale ou partielle, sans
          autorisation écrite préalable est interdite et constituerait une contrefaçon.
        </p>
      </SectionLegale>

      <SectionLegale titre="4. Données personnelles">
        <p>
          Les traitements de données personnelles réalisés via la Plateforme sont décrits dans
          notre <a className="text-primary underline underline-offset-2" href="/confidentialite">Politique de confidentialité</a>.
          L&apos;utilisation de la Plateforme est soumise à nos{" "}
          <a className="text-primary underline underline-offset-2" href="/cgu">Conditions générales d&apos;utilisation</a>.
        </p>
      </SectionLegale>

      <SectionLegale titre="5. Signalement">
        <p>
          Pour signaler un contenu ou un dysfonctionnement, écrivez à{" "}
          <a className="text-primary underline underline-offset-2" href="mailto:contact@feedbackpro.fr">contact@feedbackpro.fr</a>.
          Nous nous engageons à répondre sous 72 heures ouvrées.
        </p>
      </SectionLegale>
    </LegalLayout>
  )
}
