// ============================================================
// FeedbackPro - Page légale : Politique de confidentialité (RGPD)
// Route réelle : GET /confidentialite (Session 6 §4)
// ============================================================

import type { Metadata } from "next"
import { LegalLayout, SectionLegale } from "@/components/feedbackpro/legal-layout"

export const metadata: Metadata = {
  title: "Politique de confidentialité — FeedbackPro",
  description:
    "Politique de confidentialité RGPD de FeedbackPro : données collectées, finalités, durées de conservation, sous-traitants et exercice de vos droits.",
}

export default function ConfidentialitePage() {
  return (
    <LegalLayout
      titre="Politique de confidentialité"
      description="FeedbackPro traite des données personnelles dans le respect du Règlement Général sur la Protection des Données (RGPD - UE 2016/679). Cette page détaille, en toute transparence, ce que nous collectons et pourquoi."
      dateMiseAJour="1er février 2026"
      pageActive="/confidentialite"
    >
      <SectionLegale titre="1. Responsable de traitement">
        <p>
          Le responsable de traitement est FeedbackPro (voir nos{" "}
          <a className="text-primary underline underline-offset-2" href="/mentions-legales">mentions légales</a>).
          Pour toute question relative aux données personnelles :{" "}
          <a className="text-primary underline underline-offset-2" href="mailto:privacy@feedbackpro.fr">privacy@feedbackpro.fr</a>.
        </p>
      </SectionLegale>

      <SectionLegale titre="2. Données collectées">
        <p><strong>Côté commerçant (compte) :</strong></p>
        <ul className="list-disc space-y-1 pl-5">
          <li>adresse email et mot de passe (haché avec bcrypt, jamais en clair) ;</li>
          <li>nom du commerce, catégorie, adresse, ville ;</li>
          <li>numéro WhatsApp/SMS (facultatif, pour les alertes de réclamation) ;</li>
          <li>logo et lien Google (facultatifs) ;</li>
          <li>commandes de supports physiques (adresse de livraison).</li>
        </ul>
        <p><strong>Côté client final (retour de scan) :</strong></p>
        <ul className="list-disc space-y-1 pl-5">
          <li>note de 1 à 5 étoiles et tags de satisfaction ;</li>
          <li>commentaire et éventuel nom d&apos;un employé (saisie libre, facultative) ;</li>
          <li>
            <strong>adresse IP</strong>, utilisée uniquement pour déduire une{" "}
            <strong>ville approximative</strong> (via ipapi.co). L&apos;IP elle-même n&apos;est
            pas stockée : seul le nom de la ville peut être conservé, sans identification possible.
          </li>
        </ul>
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900">
          Nous ne collectons aucune donnée dite « sensible » (santé, opinions politiques,
          orientations…), aucune donnée bancaire (le paiement est délégué à Stripe, qui ne nous
          transmet aucun numéro de carte) et nous ne revendons aucune donnée.
        </p>
      </SectionLegale>

      <SectionLegale titre="3. Finalités et bases légales">
        <ul className="list-disc space-y-1 pl-5">
          <li>Fournir le service (dashboard, QR codes, statistiques) — <em>exécution du contrat</em> ;</li>
          <li>Facturation et gestion des abonnements — <em>exécution du contrat</em> ;</li>
          <li>
            Alertes de réclamation (SMS/email en cas de note ≤ 2★) — <em>exécution du contrat</em>,
            activables/désactivables par le commerçant ;
          </li>
          <li>Récapitulatif hebdomadaire par email — <em>intérêt légitime</em>, désinscription sur demande ;</li>
          <li>Sécurité de la plateforme (sessions en base, journalisation) — <em>intérêt légitime</em>.</li>
        </ul>
      </SectionLegale>

      <SectionLegale titre="4. Durées de conservation">
        <ul className="list-disc space-y-1 pl-5">
          <li>Compte commerçant : durée de la relation contractuelle, puis 12 mois maximum ;</li>
          <li>Retours clients : 24 mois glissants, puis anonymisation/suppression ;</li>
          <li>Sessions : 30 jours après la dernière connexion (cookie `fp_session`) ;</li>
          <li>Documents de facturation : 10 ans (obligation légale comptable).</li>
        </ul>
      </SectionLegale>

      <SectionLegale titre="5. Sous-traitants et transferts">
        <ul className="list-disc space-y-1 pl-5">
          <li><strong>Vercel Inc.</strong> — hébergement de la plateforme (États-Unis, clauses contractuelles types) ;</li>
          <li><strong>Stripe</strong> — paiements des abonnements (PCI-DSS, aucun numéro de carte ne nous est transmis) ;</li>
          <li><strong>Resend</strong> — envoi des emails transactionnels (bienvenue, confirmations, récap hebdo) ;</li>
          <li><strong>Twilio</strong> — envoi des SMS d&apos;alerte (si le commerçant les active) ;</li>
          <li><strong>ipapi.co</strong> — géolocalisation approximative par IP (ville uniquement, sans stockage de l&apos;IP).</li>
        </ul>
      </SectionLegale>

      <SectionLegale titre="6. Vos droits (RGPD)">
        <p>
          Conformément aux articles 15 à 21 du RGPD, vous disposez des droits suivants :
          <strong> accès</strong>, <strong>rectification</strong>, <strong>effacement</strong>{" "}
          (droit à l&apos;oubli), <strong>portabilité</strong>, <strong>opposition</strong> et{" "}
          <strong>limitation du traitement</strong>.
        </p>
        <p><strong>Comment les exercer :</strong></p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Droit de suppression immédiat</strong> : le commerçant peut supprimer son
            compte seul, depuis <em>Paramètres → Zone dangereuse → Supprimer mon compte</em>.
            Toutes ses données (compte, retours, commandes) sont effacées sans délai.
          </li>
          <li>
            Client final : pour demander la suppression d&apos;un commentaire, contactez le
            commerce concerné ou écrivez à{" "}
            <a className="text-primary underline underline-offset-2" href="mailto:privacy@feedbackpro.fr">privacy@feedbackpro.fr</a>.
          </li>
          <li>
            Pour toute autre demande, écrivez-nous : une réponse est apportée sous 30 jours.
            Vous pouvez également saisir la{" "}
            <a className="text-primary underline underline-offset-2" href="https://www.cnil.fr" target="_blank" rel="noopener noreferrer">CNIL</a>.
          </li>
        </ul>
      </SectionLegale>

      <SectionLegale titre="7. Cookies">
        <p>
          La Plateforme n&apos;utilise qu&apos;un cookie strictement nécessaire : le cookie de
          session <code className="rounded bg-muted px-1 py-0.5 text-xs">fp_session</code>. Le
          détail complet est décrit sur notre{" "}
          <a className="text-primary underline underline-offset-2" href="/cookies">page Cookies</a>.
        </p>
      </SectionLegale>

      <SectionLegale titre="8. Sécurité">
        <p>
          Mots de passe hachés (bcrypt), sessions révocables stockées en base, cookies
          <code className="ml-1 rounded bg-muted px-1 py-0.5 text-xs">httpOnly</code>,
          communications chiffrées (HTTPS), accès aux données limité au strict nécessaire
          (principe de minimisation).
        </p>
      </SectionLegale>
    </LegalLayout>
  )
}
