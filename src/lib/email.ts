// ============================================================
// FeedbackPro - Envoi d'emails transactionnels via Resend (S6 §3)
// ------------------------------------------------------------
// Utilise l'API REST Resend via fetch (pas de SDK).
//
// Variables d'environnement (optionnelles) :
//   RESEND_API_KEY - Clé API Resend (re_...)
//   EMAIL_FROM     - Expéditeur (ex: "FeedbackPro <bonjour@feedbackpro.fr>")
//
// MODE DÉMO : sans RESEND_API_KEY, l'email est simulé (log serveur)
// et la fonction renvoie true — jamais d'exception qui casse le flux.
//
// Les templates sont en HTML inline-CSS (compatibilité maximale avec
// les clients de messagerie), responsive et aux couleurs FeedbackPro.
// ============================================================

// ---------- Envoi brut ----------

export async function sendEmail(to: string, sujet: string, html: string): Promise<boolean> {
  try {
    const apiKey = process.env.RESEND_API_KEY

    // ---------- Mode démo : clé absente ----------
    if (!apiKey || !to) {
      console.log(`📧 Email simulé (mode démo) → ${to || "destinataire inconnu"} : ${sujet}`)
      return true
    }

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM || "FeedbackPro <onboarding@resend.dev>",
        to: [to],
        subject: sujet,
        html,
      }),
      signal: AbortSignal.timeout(8000),
    })

    if (!res.ok) {
      const detail = await res.text().catch(() => "")
      console.error(`Erreur Resend (${res.status}) : ${detail.slice(0, 300)}`)
      return false
    }

    return true
  } catch (e) {
    // Un échec d'envoi ne doit jamais casser le flux principal (inscription, commande, cron…)
    console.error("Erreur sendEmail (non bloquante)", e)
    return false
  }
}

// ---------- Gabarit commun (inline-CSS responsive) ----------

const BLEU = "#2563EB"

/** Structure commune : conteneur 600px, en-tête bleu, pied de page légal */
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
          <p style="margin:4px 0 0;font-size:13px;color:#dbeafe;">Transformez chaque visite client en croissance</p>
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

/** URL publique de l'app (liens dans les emails) */
function baseUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || "https://feedbackpro.fr").replace(/\/$/, "")
}

/** Bouton d'action commun */
function bouton(label: string, href: string): string {
  return `<a href="${href}" style="display:inline-block;background-color:${BLEU};color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 28px;border-radius:8px;margin-top:8px;">${label}</a>`
}

// ---------- Templates transactionnels ----------

/** Email de bienvenue envoyé après l'inscription d'un commerçant */
export function emailBienvenue(nomCommerce: string): string {
  const corps = `
    <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:#1c1917;">Bienvenue sur FeedbackPro 🎉</h1>
    <p style="margin:0 0 12px;font-size:15px;line-height:1.7;color:#44403c;">
      Bonjour <strong>${escapeHtml(nomCommerce)}</strong>,
    </p>
    <p style="margin:0 0 12px;font-size:15px;line-height:1.7;color:#44403c;">
      Votre compte est créé ! Vous rejoignez des centaines de commerces qui interceptent leurs
      réclamations avant qu'elles ne deviennent des avis Google négatifs.
    </p>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.7;color:#44403c;">
      Prochaine étape : terminez la configuration de votre boutique (2 minutes) pour générer
      votre QR code et recevoir vos premiers retours clients.
    </p>
    ${bouton("Configurer ma boutique", `${baseUrl()}/dashboard`)}
    <p style="margin:20px 0 0;font-size:13px;line-height:1.7;color:#78716c;">
      À très vite,<br />L'équipe FeedbackPro
    </p>`
  return enveloppe("Bienvenue sur FeedbackPro", corps)
}

/** Email de confirmation d'une commande de supports physiques */
export function emailConfirmationCommande(
  nomCommerce: string,
  typeSupport: string,
  prix: number,
  adresse: string
): string {
  const corps = `
    <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:#1c1917;">Commande confirmée ✅</h1>
    <p style="margin:0 0 12px;font-size:15px;line-height:1.7;color:#44403c;">
      Bonjour <strong>${escapeHtml(nomCommerce)}</strong>,
    </p>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#44403c;">
      Nous avons bien reçu votre commande de supports physiques :
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f5f4;border-radius:8px;margin:0 0 16px;">
      <tr><td style="padding:16px 20px;">
        <p style="margin:0 0 6px;font-size:15px;color:#1c1917;"><strong>Article :</strong> ${escapeHtml(typeSupport)}</p>
        <p style="margin:0 0 6px;font-size:15px;color:#1c1917;"><strong>Prix :</strong> ${prix} €</p>
        <p style="margin:0;font-size:15px;color:#1c1917;"><strong>Livraison :</strong> ${escapeHtml(adresse)}</p>
      </td></tr>
    </table>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.7;color:#44403c;">
      Votre commande est en cours de préparation (impression puis expédition sous 3 à 5 jours ouvrés).
      Vous pourrez suivre son statut depuis votre dashboard.
    </p>
    ${bouton("Suivre ma commande", `${baseUrl()}/dashboard/qr-code`)}
    <p style="margin:20px 0 0;font-size:13px;line-height:1.7;color:#78716c;">
      Merci de votre confiance,<br />L'équipe FeedbackPro
    </p>`
  return enveloppe("Confirmation de commande FeedbackPro", corps)
}

/** Alerte email envoyée au commerçant quand un client laisse une note ≤ 2 (fallback si SMS désactivé) */
export function emailAlerteRetour(
  nomCommerce: string,
  note: number,
  tags: string,
  dashboardUrl: string
): string {
  const corps = `
    <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:#dc2626;">🚨 Alerte réclamation client</h1>
    <p style="margin:0 0 12px;font-size:15px;line-height:1.7;color:#44403c;">
      Bonjour <strong>${escapeHtml(nomCommerce)}</strong>,
    </p>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#44403c;">
      Un client vient de laisser un retour <strong style="color:#dc2626;">${note}/5</strong>
      ${tags ? `avec les motifs suivants : <strong>${escapeHtml(tags)}</strong>` : "sans préciser de motif"}.
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#fef2f2;border:1px solid #fecaca;border-radius:8px;margin:0 0 16px;">
      <tr><td style="padding:16px 20px;">
        <p style="margin:0;font-size:14px;line-height:1.7;color:#991b1b;">
          ⏱️ Chaque minute compte : une réponse rapide permet de résoudre le problème
          <strong>avant</strong> que le client n'aille poster un avis public négatif.
        </p>
      </td></tr>
    </table>
    ${bouton("Voir le retour et répondre", dashboardUrl)}
    <p style="margin:20px 0 0;font-size:13px;line-height:1.7;color:#78716c;">
      Vous recevez cet email car les alertes SMS ne sont pas activées sur votre compte.
      Activez-les dans Paramètres pour être alerté en temps réel sur votre mobile.
    </p>`
  return enveloppe(`Alerte réclamation ${note}/5 — ${nomCommerce}`, corps)
}

/** Statistiques agrégées pour le récap hebdomadaire */
export type RecapStats = {
  /** Nombre total de retours sur la période */
  total: number
  /** Note moyenne (1 décimale) */
  noteMoyenne: number
  /** Nombre d'alertes (notes ≤ 2) */
  alertes: number
}

/** Récapitulatif hebdomadaire envoyé chaque lundi matin (cron) */
export function emailRecapHebdo(nomCommerce: string, stats: RecapStats): string {
  const noteAffichee = stats.noteMoyenne.toFixed(1).replace(".", ",")
  const message = stats.total === 0
    ? "Aucun retour collecté cette semaine. Pensez à rendre votre QR code plus visible en caisse ou en salle !"
    : `Cette semaine, votre boutique a reçu <strong>${stats.total} retour(s)</strong> client(s) avec une note moyenne de <strong>${noteAffichee}/5</strong> et <strong>${stats.alertes} alerte(s)</strong> à traiter.`
  const corps = `
    <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:#1c1917;">📊 Votre récap de la semaine</h1>
    <p style="margin:0 0 12px;font-size:15px;line-height:1.7;color:#44403c;">
      Bonjour <strong>${escapeHtml(nomCommerce)}</strong>,
    </p>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#44403c;">${message}</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
      <tr>
        <td align="center" style="padding:0 4px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#eff6ff;border-radius:8px;">
            <tr><td align="center" style="padding:16px 8px;">
              <p style="margin:0;font-size:24px;font-weight:700;color:${BLEU};">${stats.total}</p>
              <p style="margin:4px 0 0;font-size:12px;color:#64748b;">Retours</p>
            </td></tr>
          </table>
        </td>
        <td align="center" style="padding:0 4px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#eff6ff;border-radius:8px;">
            <tr><td align="center" style="padding:16px 8px;">
              <p style="margin:0;font-size:24px;font-weight:700;color:${BLEU};">${noteAffichee}</p>
              <p style="margin:4px 0 0;font-size:12px;color:#64748b;">Note moyenne /5</p>
            </td></tr>
          </table>
        </td>
        <td align="center" style="padding:0 4px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#eff6ff;border-radius:8px;">
            <tr><td align="center" style="padding:16px 8px;">
              <p style="margin:0;font-size:24px;font-weight:700;color:${stats.alertes > 0 ? "#dc2626" : BLEU};">${stats.alertes}</p>
              <p style="margin:4px 0 0;font-size:12px;color:#64748b;">Alertes ≤ 2★</p>
            </td></tr>
          </table>
        </td>
      </tr>
    </table>
    ${bouton("Ouvrir mon dashboard", `${baseUrl()}/dashboard`)}
    <p style="margin:20px 0 0;font-size:13px;line-height:1.7;color:#78716c;">
      Vous recevez cet email chaque lundi matin. Bonne semaine !<br />L'équipe FeedbackPro
    </p>`
  return enveloppe("Récap hebdomadaire FeedbackPro", corps)
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
