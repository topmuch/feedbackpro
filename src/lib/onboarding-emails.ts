// ============================================================
// FeedbackPro - Emails d'onboarding "First Week" (Task 1)
// ------------------------------------------------------------
// 3 templates déclenchés par le cron ou par les actions du Pro :
//   • Jour 0 — Bienvenue + rappel des 4 étapes pour démarrer
//   • Jour 3 — Vos QR codes sont prêts ? Comment les placer
//   • Jour 7 — Votre premier rapport Coach IA est disponible
//
// S'appuie sur src/lib/email.ts (sendEmail + enveloppe commune).
// Chaque fonction renvoie { sujet, html } — l'appelant fait
// `sendEmail(pro.email, sujet, html)`.
// ============================================================

import { emailRapportIA, type RapportIAEmail } from "@/lib/email"

/** URL publique de l'app (liens dans les emails) */
function baseUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || "https://feedbackpro.fr").replace(/\/$/, "")
}

/** Échappe les caractères HTML (les données proviennent des utilisateurs) */
function escapeHtml(v: string): string {
  return String(v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

const BLEU = "#2563EB"

/** Bouton d'action commun */
function bouton(label: string, href: string): string {
  return `<a href="${href}" style="display:inline-block;background-color:${BLEU};color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 28px;border-radius:8px;margin-top:8px;">${label}</a>`
}

// ---------- Jour 0 : Bienvenue + 4 étapes ----------

export function emailOnboardingJour0(nomEtablissement: string): { sujet: string; html: string } {
  const sujet = "Bienvenue sur FeedbackPro 🎉 — vos 4 étapes pour démarrer"
  const etapes = [
    {
      n: 1,
      titre: "Créez vos zones de contact",
      desc:
        "Identifiez les points de contact où vos clients laissent une impression (Accueil, Salle, Toilettes…). Une zone = un QR code dédié.",
      cta: { label: "Créer mes zones", href: `${baseUrl()}/dashboard/zones` },
    },
    {
      n: 2,
      titre: "Téléchargez vos QR codes",
      desc:
        "Exportez chaque QR code en PDF prêt à imprimer. Affichettes, stickers, chevalets : choisissez le support adapté à chaque zone.",
      cta: { label: "Télécharger mes QR codes", href: `${baseUrl()}/dashboard/qr-codes` },
    },
    {
      n: 3,
      titre: "Présentez le concept à votre équipe",
      desc:
        "Vos collaborateurs sont les premiers acteurs de la qualité. Expliquez le dispositif et comment les mentions clients valorisent leur travail.",
      cta: { label: "Configurer mon équipe", href: `${baseUrl()}/dashboard/equipe` },
    },
    {
      n: 4,
      titre: "Attendez vos premiers retours",
      desc:
        "Soyez patient : les premiers retours arrivent en 24 à 72 h. Dès 5 retours, votre Coach IA génère un premier audit qualité.",
      cta: { label: "Voir mon tableau de bord", href: `${baseUrl()}/dashboard` },
    },
  ]

  const listeHtml = etapes
    .map(
      (e) => `
      <tr>
        <td style="padding:14px 0;border-bottom:1px solid #e7e5e4;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="width:40px;vertical-align:top;">
                <span style="display:inline-block;width:28px;height:28px;line-height:28px;text-align:center;background-color:${BLEU};color:#ffffff;border-radius:50%;font-weight:700;font-size:14px;">${e.n}</span>
              </td>
              <td style="vertical-align:top;padding-left:8px;">
                <p style="margin:0 0 4px;font-size:15px;font-weight:600;color:#1c1917;">${escapeHtml(e.titre)}</p>
                <p style="margin:0 0 8px;font-size:13px;line-height:1.6;color:#44403c;">${escapeHtml(e.desc)}</p>
                <a href="${e.cta.href}" style="color:${BLEU};font-size:13px;font-weight:600;text-decoration:underline;">${escapeHtml(e.cta.label)} →</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>`
    )
    .join("")

  const corps = `
    <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:#1c1917;">Bienvenue sur FeedbackPro 🎉</h1>
    <p style="margin:0 0 12px;font-size:15px;line-height:1.7;color:#44403c;">
      Bonjour <strong>${escapeHtml(nomEtablissement)}</strong>,
    </p>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.7;color:#44403c;">
      Vos clients réels deviennent vos meilleurs <strong>Clients Mystères</strong>. Pour tirer le
      maximum de FeedbackPro dès cette première semaine, voici vos <strong>4 étapes</strong> :
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${listeHtml}</table>
    <p style="margin:24px 0 12px;font-size:15px;line-height:1.7;color:#44403c;">
      💡 Astuce : plus vos QR codes sont visibles, plus vous recevez de retours. Visez 3 à 5 zones
      couvertes pour un premier audit représentatif.
    </p>
    ${bouton("Ouvrir mon dashboard", `${baseUrl()}/dashboard`)}
    <p style="margin:20px 0 0;font-size:13px;line-height:1.7;color:#78716c;">
      À très vite,<br />L'équipe FeedbackPro
    </p>`

  // Réutilise l'enveloppe commune via un import indirect pour éviter la
  // duplication : on appelle emailRapportIA avec un contenu minimal et on
  // récupère son enveloppe — non, plus simple : on reconstruit l'enveloppe.
  return { sujet, html: enveloppe(sujet, corps) }
}

// ---------- Jour 3 : Vos QR codes sont prêts ? ----------

export function emailOnboardingJour3(nomEtablissement: string): { sujet: string; html: string } {
  const sujet = "Vos QR codes sont prêts ? Voici comment les placer 📌"
  const corps = `
    <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:#1c1917;">Vos QR codes sont prêts ? 📌</h1>
    <p style="margin:0 0 12px;font-size:15px;line-height:1.7;color:#44403c;">
      Bonjour <strong>${escapeHtml(nomEtablissement)}</strong>,
    </p>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#44403c;">
      3 jours après votre inscription, c'est le moment de vérifier que vos QR codes sont bien en
      place. Le bon positionnement multiplie le taux de retours par 3.
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#eff6ff;border-radius:8px;margin:0 0 16px;">
      <tr><td style="padding:16px 20px;">
        <p style="margin:0 0 8px;font-size:14px;font-weight:600;color:#1e3a8a;">📍 Où placer vos QR codes ?</p>
        <ul style="margin:0;padding-left:20px;font-size:13px;line-height:1.7;color:#44403c;">
          <li><strong>Accueil / Caisse</strong> — visible dès l'arrivée, à hauteur des yeux</li>
          <li><strong>Table / Salle</strong> — sur chaque table ou chevalet à proximité</li>
          <li><strong>Toilettes</strong> — sortie, à la hauteur du poignet</li>
          <li><strong>Cabine d'essayage / Salle d'attente</strong> — moment de contemplation</li>
        </ul>
      </td></tr>
    </table>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#44403c;">
      Vous n'avez pas encore téléchargé vos QR codes ? C'est par ici 👇
    </p>
    ${bouton("Télécharger mes QR codes", `${baseUrl()}/dashboard/qr-codes`)}
    <p style="margin:20px 0 0;font-size:13px;line-height:1.7;color:#78716c;">
      Besoin d'aide ? Répondez à cet email.<br />L'équipe FeedbackPro
    </p>`
  return { sujet, html: enveloppe(sujet, corps) }
}

// ---------- Jour 7 : Votre premier rapport Coach IA est disponible ----------

export function emailOnboardingJour7(
  nomEtablissement: string,
  rapport?: RapportIAEmail
): { sujet: string; html: string } {
  // Si un rapport IA est disponible, on utilise le template existant
  // (emailRapportIA) qui est plus riche et déjà testé.
  if (rapport) {
    return emailRapportIA({ nomEtablissement }, rapport)
  }

  const sujet = "Votre premier rapport Coach IA est disponible 🤖"
  const corps = `
    <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:#1c1917;">Votre premier rapport Coach IA est disponible 🤖</h1>
    <p style="margin:0 0 12px;font-size:15px;line-height:1.7;color:#44403c;">
      Bonjour <strong>${escapeHtml(nomEtablissement)}</strong>,
    </p>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#44403c;">
      Une semaine d'utilisation, bravo ! Votre Coach IA a commencé à analyser les premiers retours
      de vos clients mystères. Il vous donne chaque jour <strong>3 priorités concrètes</strong> pour
      améliorer votre service.
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#eff6ff;border-radius:8px;margin:0 0 16px;">
      <tr><td style="padding:16px 20px;">
        <p style="margin:0;font-size:14px;line-height:1.7;color:#1e3a8a;">
          ⭐ Le Coach IA croise les notes, les tags et les commentaires de vos clients pour
          identifier les axes d'amélioration prioritaires. Plus vous avez de retours, plus l'audit
          est précis.
        </p>
      </td></tr>
    </table>
    ${bouton("Consulter mon rapport", `${baseUrl()}/dashboard/coach`)}
    <p style="margin:20px 0 0;font-size:13px;line-height:1.7;color:#78716c;">
      Bonne lecture,<br />L'équipe FeedbackPro
    </p>`
  return { sujet, html: enveloppe(sujet, corps) }
}

// ---------- Enveloppe commune (réplique de src/lib/email.ts : enveloppe) ----------

function enveloppe(titre: string, corps: string): string {
  return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>${titre}</title></head>
<body style="margin:0;padding:0;background-color:#f5f5f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1c1917;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f5f4;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
        <!-- En-tête -->
        <tr><td style="background-color:${BLEU};padding:24px 32px;">
          <p style="margin:0;font-size:20px;font-weight:700;color:#ffffff;">FeedbackPro</p>
          <p style="margin:4px 0 0;font-size:13px;color:#dbeafe;">Le Coach IA d'Audit Qualité Continu</p>
        </td></tr>
        <!-- Corps -->
        <tr><td style="padding:32px;">${corps}</td></tr>
        <!-- Pied -->
        <tr><td style="background-color:#fafaf9;padding:20px 32px;border-top:1px solid #e7e5e4;">
          <p style="margin:0;font-size:12px;color:#78716c;line-height:1.6;">
            © ${new Date().getFullYear()} FeedbackPro — Tous droits réservés.<br />
            <a href="${baseUrl()}/mentions-legales" style="color:#78716c;">Mentions légales</a> ·
            <a href="${baseUrl()}/cgu" style="color:#78716c;">CGU</a> ·
            <a href="${baseUrl()}/confidentialite" style="color:#78716c;">Confidentialité</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}
