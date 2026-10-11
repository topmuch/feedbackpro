// ============================================================
// FeedbackPro - Page légale : Conditions Générales d'Utilisation
// Route réelle : GET /cgu (Session 6 §4)
// ============================================================

import type { Metadata } from "next"
import { LegalLayout, SectionLegale } from "@/components/feedbackpro/legal-layout"

export const metadata: Metadata = {
  title: "Conditions Générales d'Utilisation — FeedbackPro",
  description:
    "Conditions générales d'utilisation de la plateforme FeedbackPro : compte, abonnements, rapports du Coach IA, engagements, supports physiques et résiliation.",
}

export default function CguPage() {
  return (
    <LegalLayout
      titre="Conditions Générales d'Utilisation"
      description="Les présentes CGU encadrent l'accès et l'utilisation de la plateforme FeedbackPro par les commerçants abonnés et leurs clients finaux."
      dateMiseAJour="1er février 2026"
      pageActive="/cgu"
    >
      <SectionLegale titre="1. Objet">
        <p>
          FeedbackPro est une plateforme SaaS de <strong>Coach IA d'Audit Qualité Continu</strong> : chaque
          client réel de l'établissement devient un « Client Mystère ». Il scanne le QR code d'une
          <strong> zone</strong> (Accueil, Salle, Toilettes…), laisse une note de 1 à 5, des tags et un
          commentaire. Le Coach IA de FeedbackPro analyse ces retours et génère un rapport d'audit
          quotidien ou hebdomadaire avec les 3 priorités du jour, des recommandations et des prédictions.
        </p>
      </SectionLegale>

      <SectionLegale titre="2. Accès et compte">
        <p>
          L&apos;inscription est réservée aux établissements (restaurants, hôtels, salons,
          boutiques…) représentés par une personne majeure disposant de la capacité
          juridique de contracter. Un compte par établissement est créé avec une adresse email valide ;
          le titulaire est responsable de la confidentialité de son mot de passe et de
          l&apos;exactitude des informations qu&apos;il fournit.
        </p>
        <p>
          Les Clients Mystères qui scannent un QR code utilisent la Plateforme sans compte : aucune
          donnée d&apos;identification n&apos;est exigée pour laisser un retour (voir notre{" "}
          <a className="text-primary underline underline-offset-2" href="/confidentialite">Politique de confidentialité</a>).
        </p>
      </SectionLegale>

      <SectionLegale titre="3. Abonnements et tarifs">
        <p>
          Trois formules sont proposées, à jour sur la page de facturation du dashboard :
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li><strong>Starter</strong> — 29 € HT/mois, jusqu'à 3 zones de contact, 50 retours/mois, rapport IA hebdomadaire ;</li>
          <li><strong>Pro</strong> — 99 € HT/mois, zones et retours illimités, rapport IA quotidien (Coach), priorités du jour, leaderboard et statistiques avancées ;</li>
          <li><strong>Enterprise</strong> — 249 € HT/mois, multi-établissements illimités, rapports consolidés et support prioritaire.</li>
        </ul>
        <p>
          Les abonnements payants sont facturés mensuellement via notre prestataire de paiement
          <strong> Stripe</strong>. Sans clés Stripe configurées, l&apos;environnement de
          démonstration simule le paiement : aucun montant n&apos;est alors réellement débité.
          Le changement de plan est effectif immédiatement ; il n&apos;y a pas de frais de
          résiliation.
        </p>
      </SectionLegale>

      <SectionLegale titre="4. Engagements de l'établissement">
        <p>
          L'établissement abonné s&apos;engage notamment à :
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>utiliser la Plateforme conformément à sa destination et au droit applicable ;</li>
          <li>ne pas collecter ni saisir de données sensibles dans les commentaires de retours ;</li>
          <li>respecter les droits de ses propres clients (RGPD) lorsqu&apos;il traite leurs retours ;</li>
          <li>ne pas tenter de contourner les limites de son plan ni d&apos;accéder aux comptes d&apos;autres commerces.</li>
        </ul>
        <p>
          En cas de manquement, FeedbackPro peut suspendre le compte après notification par email,
          notamment en cas d&apos;usage frauduleux ou de non-paiement.
        </p>
      </SectionLegale>

      <SectionLegale titre="5. Rapports du Coach IA">
        <p>
          Les rapports d&apos;audit (score global, priorités, recommandations, prédictions) sont
          générés automatiquement par un modèle d&apos;intelligence artificielle à partir des retours
          collectés. Il s&apos;agit d&apos;une aide à la décision : ils ne constituent ni un avis
          juridique, ni une évaluation du personnel opposable à un tiers. L&apos;établissement reste
          seul responsable des décisions managériales prises sur la base de ces rapports.
        </p>
      </SectionLegale>

      <SectionLegale titre="6. Supports physiques">
        <p>
          L'établissement peut commander des supports imprimés (autocollants, chevalets, affiches par
          zone) directement depuis la Plateforme. Les commandes sont préparées par FeedbackPro et
          expédiées à l&apos;adresse indiquée sous 3 à 5 jours ouvrés. Le droit de rétractation
          de 14 jours s&apos;applique ; il est toutefois exclu pour les biens confectionnés
          selon les spécifications de l&apos;établissement, conformément à l&apos;article L221-28 du Code
          de la consommation.
        </p>
      </SectionLegale>

      <SectionLegale titre="7. Responsabilité et disponibilité">
        <p>
          FeedbackPro met la Plateforme à disposition avec diligence, sans garantie de
          disponibilité ininterrompue (maintenance, force majeure). La responsabilité de
          FeedbackPro ne saurait être engagée pour les contenus saisis par les clients finaux ni
          pour les décisions commerciales prises sur la base des statistiques fournies.
        </p>
      </SectionLegale>

      <SectionLegale titre="8. Résiliation">
        <p>
          L'établissement peut supprimer son compte à tout moment depuis la rubrique « Paramètres »
          de son dashboard ; les données associées sont alors effacées conformément à notre{" "}
          <a className="text-primary underline underline-offset-2" href="/confidentialite">Politique de confidentialité</a>.
          FeedbackPro peut résilier en cas de manquement grave, après notification et sans
          réponse sous 15 jours.
        </p>
      </SectionLegale>

      <SectionLegale titre="9. Droit applicable">
        <p>
          Les présentes CGU sont soumises au droit français. En cas de litige, une solution
          amiable sera recherchée ; à défaut, les tribunaux français seront compétents.
        </p>
      </SectionLegale>
    </LegalLayout>
  )
}
