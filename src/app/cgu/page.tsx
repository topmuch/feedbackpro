// ============================================================
// FeedbackPro - Page légale : Conditions Générales d'Utilisation
// Route réelle : GET /cgu (Session 6 §4)
// ============================================================

import type { Metadata } from "next"
import { LegalLayout, SectionLegale } from "@/components/feedbackpro/legal-layout"

export const metadata: Metadata = {
  title: "Conditions Générales d'Utilisation — FeedbackPro",
  description:
    "Conditions générales d'utilisation de la plateforme FeedbackPro : compte, abonnements, engagements, supports physiques et résiliation.",
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
          FeedbackPro est une plateforme SaaS qui permet aux commerces de collecter des retours
          clients via des QR codes : le client scanne, note son expérience de 1 à 5 étoiles, et
          selon la note il est orienté vers un canal de réclamation privé (WhatsApp / SMS) ou vers
          un avis public (Google). FeedbackPro fournit également des outils d&apos;analyse
          (statistiques, leaderboard, alertes) aux commerçants abonnés.
        </p>
      </SectionLegale>

      <SectionLegale titre="2. Accès et compte">
        <p>
          L&apos;inscription est réservée aux commerçants majeurs disposant de la capacité
          juridique de contracter. Un compte par commerce est créé avec une adresse email valide ;
          le titulaire est responsable de la confidentialité de son mot de passe et de
          l&apos;exactitude des informations qu&apos;il fournit.
        </p>
        <p>
          Les clients finaux qui scannent un QR code utilisent la Plateforme sans compte : aucune
          donnée d&apos;identification n&apos;est exigée pour laisser un retour (voir notre{" "}
          <a className="text-primary underline underline-offset-2" href="/confidentialite">Politique de confidentialité</a>).
        </p>
      </SectionLegale>

      <SectionLegale titre="3. Abonnements et tarifs">
        <p>
          Trois formules sont proposées, à jour sur la page de facturation du dashboard :
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li><strong>Starter</strong> — gratuit, 1 boutique, 20 retours/mois ;</li>
          <li><strong>Pro</strong> — 19 € HT/mois, retours illimités, équipe et statistiques avancées ;</li>
          <li><strong>Enterprise</strong> — 79 € HT/mois, multi-boutiques et rapports consolidés.</li>
        </ul>
        <p>
          Les abonnements payants sont facturés mensuellement via notre prestataire de paiement
          <strong> Stripe</strong>. Sans clés Stripe configurées, l&apos;environnement de
          démonstration simule le paiement : aucun montant n&apos;est alors réellement débité.
          Le changement de plan est effectif immédiatement ; il n&apos;y a pas de frais de
          résiliation.
        </p>
      </SectionLegale>

      <SectionLegale titre="4. Engagements du commerçant">
        <p>
          Le commerçant s&apos;engage notamment à :
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

      <SectionLegale titre="5. Supports physiques">
        <p>
          Le commerçant peut commander des supports imprimés (autocollants, chevalets, affiches)
          directement depuis la Plateforme. Les commandes sont préparées par FeedbackPro et
          expédiées à l&apos;adresse indiquée sous 3 à 5 jours ouvrés. Le droit de rétractation
          de 14 jours s&apos;applique ; il est toutefois exclu pour les biens confectionnés
          selon les spécifications du commerçant, conformément à l&apos;article L221-28 du Code
          de la consommation.
        </p>
      </SectionLegale>

      <SectionLegale titre="6. Responsabilité et disponibilité">
        <p>
          FeedbackPro met la Plateforme à disposition avec diligence, sans garantie de
          disponibilité ininterrompue (maintenance, force majeure). La responsabilité de
          FeedbackPro ne saurait être engagée pour les contenus saisis par les clients finaux ni
          pour les décisions commerciales prises sur la base des statistiques fournies.
        </p>
      </SectionLegale>

      <SectionLegale titre="7. Résiliation">
        <p>
          Le commerçant peut supprimer son compte à tout moment depuis la rubrique « Paramètres »
          de son dashboard ; les données associées sont alors effacées conformément à notre{" "}
          <a className="text-primary underline underline-offset-2" href="/confidentialite">Politique de confidentialité</a>.
          FeedbackPro peut résilier en cas de manquement grave, après notification et sans
          réponse sous 15 jours.
        </p>
      </SectionLegale>

      <SectionLegale titre="8. Droit applicable">
        <p>
          Les présentes CGU sont soumises au droit français. En cas de litige, une solution
          amiable sera recherchée ; à défaut, les tribunaux français seront compétents.
        </p>
      </SectionLegale>
    </LegalLayout>
  )
}
