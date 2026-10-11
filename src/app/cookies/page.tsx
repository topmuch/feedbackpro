// ============================================================
// FeedbackPro - Page légale : Politique cookies (Session 6 §4)
// Route réelle : GET /cookies
// ============================================================

import type { Metadata } from "next"
import { LegalLayout, SectionLegale } from "@/components/feedbackpro/legal-layout"

export const metadata: Metadata = {
  title: "Politique cookies — FeedbackPro",
  description:
    "Politique cookies de FeedbackPro : uniquement des cookies essentiels (session), aucun traceur publicitaire ni mesure d'audience tierce.",
}

export default function CookiesPage() {
  return (
    <LegalLayout
      titre="Politique cookies"
      description="FeedbackPro privilégie une approche minimaliste : un seul cookie, strictement nécessaire, aucun traceur publicitaire ni bandeau de consentement requis."
      dateMiseAJour="1er février 2026"
      pageActive="/cookies"
    >
      <SectionLegale titre="1. Qu'est-ce qu'un cookie ?">
        <p>
          Un cookie est un petit fichier déposé sur votre terminal par votre navigateur lors de la
          visite d&apos;un site. Il permet notamment de conserver des informations techniques
          (comme un identifiant de session).
        </p>
      </SectionLegale>

      <SectionLegale titre="2. Cookies utilisés">
        <p>
          FeedbackPro dépose <strong>un seul cookie</strong>, strictement nécessaire au
          fonctionnement du service :
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-140 border-collapse text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-2 pr-4 font-medium">Nom</th>
                <th className="py-2 pr-4 font-medium">Rôle</th>
                <th className="py-2 pr-4 font-medium">Durée</th>
                <th className="py-2 font-medium">Base légale</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b last:border-0">
                <td className="py-2 pr-4">
                  <code className="rounded bg-muted px-1 py-0.5 text-xs">fp_session</code>
                </td>
                <td className="py-2 pr-4">
                  Authentification du commerçant : contient uniquement un identifiant aléatoire
                  de session (httpOnly, inaccessible en JavaScript).
                </td>
                <td className="py-2 pr-4">30 jours</td>
                <td className="py-2">Intérêt légitime (sécurité)</td>
              </tr>
            </tbody>
          </table>
        </div>
      </SectionLegale>

      <SectionLegale titre="3. Ce que nous n'utilisons PAS">
        <ul className="list-disc space-y-1 pl-5">
          <li>aucun cookie publicitaire ni de retargeting (aucun pixel Facebook/Google Ads) ;</li>
          <li>aucun cookie de mesure d&apos;audience tierce (pas de Google Analytics) ;</li>
          <li>aucun cookie de partage vers les réseaux sociaux.</li>
        </ul>
        <p>
          Conformément à l&apos;article 82 de la loi Informatique et Libertés, les cookies
          strictement nécessaires ne requièrent <strong>aucun consentement préalable</strong> :
          c&apos;est pourquoi aucun bandeau de consentement n&apos;est affiché.
        </p>
      </SectionLegale>

      <SectionLegale titre="4. Gérer les cookies via votre navigateur">
        <p>
          Vous pouvez à tout moment configurer votre navigateur pour refuser ou supprimer les
          cookies. Attention : supprimer le cookie <code className="rounded bg-muted px-1 py-0.5 text-xs">fp_session</code>{" "}
          vous déconnectera simplement de votre dashboard, sans perte de données.
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <a className="text-primary underline underline-offset-2" href="https://support.mozilla.org/fr/kb/activer-desactiver-cookies" target="_blank" rel="noopener noreferrer">Firefox</a>
          </li>
          <li>
            <a className="text-primary underline underline-offset-2" href="https://support.google.com/chrome/answer/95647?hl=fr" target="_blank" rel="noopener noreferrer">Chrome</a>
          </li>
          <li>
            <a className="text-primary underline underline-offset-2" href="https://support.apple.com/fr-fr/guide/safari/sfri11471/mac" target="_blank" rel="noopener noreferrer">Safari</a>
          </li>
        </ul>
      </SectionLegale>

      <SectionLegale titre="5. Stockage local (localStorage)">
        <p>
          Pour la fluidité de l&apos;interface (état de session côté navigateur), l&apos;application
          utilise le <em>localStorage</em> du navigateur, qui ne stocke que des informations déjà
          visibles (nom du commerce, plan) — jamais de mot de passe ni de donnée sensible. Vous
          pouvez le vider via les réglages de votre navigateur.
        </p>
      </SectionLegale>

      <SectionLegale titre="6. Questions">
        <p>
          Une question sur cette politique ? Écrivez à{" "}
          <a className="text-primary underline underline-offset-2" href="mailto:privacy@feedbackpro.fr">privacy@feedbackpro.fr</a>.
        </p>
      </SectionLegale>
    </LegalLayout>
  )
}
