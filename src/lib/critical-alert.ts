// ============================================================
// Task O1 — Centre Opérationnel : envoi d'email d'alerte critique
// ------------------------------------------------------------
// Quand un service tombe à "critical" lors d'un health check, cette
// fonction est appelée pour alerter le superadmin par email avec un
// diagnostic structuré :
//   - Service affecté
//   - Heure de détection
//   - Sévérité CRITIQUE
//   - Diagnostic automatique (type erreur, impact, dernier succès,
//     nombre de tentatives)
//   - Actions recommandées (liens vers le dashboard admin)
//   - Statut système global (calculé à l'instant T)
//
// Dépendances :
//   - db (SystemHealthLog + NotificationSetting + User SUPERADMIN)
//   - sendEmail() depuis @/lib/email (Resend API ou mode démo)
//
// Robustesse : aucune exception n'est propagée — un échec d'envoi
// est loggé mais ne casse pas le flux de health check.
// ============================================================

import { db } from "@/lib/db"
import { sendEmail } from "@/lib/email"

// ---------- Helpers robustesse ----------
// Accès optionnels à db.notificationSetting — le modèle a été ajouté
// par un autre agent (Task N1). On utilise un cast any pour rester
// résilient même si la base n'a pas encore été poussée.

type NotificationSettingRow = {
  id: string
  canal: string
  active: boolean
  config: string
}

async function getEmailNotificationSetting(): Promise<NotificationSettingRow | null> {
  try {
    const row = await (db as any).notificationSetting.findUnique({
      where: { canal: "email" },
    })
    return (row ?? null) as NotificationSettingRow | null
  } catch {
    // Modèle absent de la base ou de la Prisma client (cas dégradé).
    return null
  }
}

async function resolveAdminEmail(): Promise<string | null> {
  // 1. ADMIN_EMAIL env var (priorité la plus haute)
  const fromEnv = process.env.ADMIN_EMAIL?.trim()
  if (fromEnv) return fromEnv

  // 2. Premier user SUPERADMIN en base
  try {
    const admin = await db.user.findFirst({
      where: { role: "SUPERADMIN" },
      select: { email: true },
      orderBy: { createdAt: "asc" },
    })
    return admin?.email ?? null
  } catch {
    return null
  }
}

/** Dernier "ok" connu pour un service — aide au diagnostic. */
async function lastOkDetectedAt(serviceName: string): Promise<string | null> {
  try {
    const last = await db.systemHealthLog.findFirst({
      where: { serviceName, status: "ok" },
      orderBy: { detectedAt: "desc" },
      select: { detectedAt: true },
    })
    if (!last) return null
    return last.detectedAt.toISOString()
  } catch {
    return null
  }
}

/** Compte les alertes (warning + critical) non résolues pour un service. */
async function countUnresolvedAlerts(serviceName: string): Promise<number> {
  try {
    const count = await db.systemHealthLog.count({
      where: {
        serviceName,
        status: { in: ["warning", "critical"] },
        resolvedAt: null,
      },
    })
    return count
  } catch {
    return 0
  }
}

/** Statut global actuel du système (pour inclure dans l'email). */
async function computeGlobalStatus(): Promise<{
  ok: number
  warning: number
  critical: number
  status: "ok" | "warning" | "critical"
}> {
  try {
    // Dernière entrée par service (le plus récent)
    const services = [
      "db_primary",
      "mtarget_sms",
      "whatsapp_api",
      "smtp_email",
      "push_pwa",
      "denise_tts",
      "service_worker",
    ]
    const latestByService: Record<string, string> = {}
    for (const svc of services) {
      const last = await db.systemHealthLog.findFirst({
        where: { serviceName: svc },
        orderBy: { detectedAt: "desc" },
        select: { status: true },
      })
      if (last) latestByService[svc] = last.status
    }
    const statuses = Object.values(latestByService)
    const ok = statuses.filter((s) => s === "ok").length
    const warning = statuses.filter((s) => s === "warning").length
    const critical = statuses.filter((s) => s === "critical").length
    const status: "ok" | "warning" | "critical" =
      critical > 0 ? "critical" : warning > 0 ? "warning" : "ok"
    return { ok, warning, critical, status }
  } catch {
    return { ok: 0, warning: 0, critical: 0, status: "critical" }
  }
}

/** Marque une ligne SystemHealthLog comme "alert email envoyé". */
async function markAlertSent(logId: string): Promise<void> {
  try {
    await db.systemHealthLog.update({
      where: { id: logId },
      data: { alertSent: true },
    })
  } catch {
    /* non bloquant */
  }
}

// ---------- Construction de l'email ----------

const ROUGE_CRITIQUE = "#dc2626"
const GRIS_FONCE = "#1c1917"
const GRIS_MOYEN = "#44403c"
const GRIS_CLAIR = "#78716c"

function escapeHtml(v: string): string {
  return String(v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

function baseUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || "https://feedbackpro.fr").replace(/\/$/, "")
}

const SERVICE_LABELS: Record<string, string> = {
  db_primary: "Base de données primaire (SQLite)",
  mtarget_sms: "Passerelle SMS Mtarget",
  whatsapp_api: "API WhatsApp Business",
  smtp_email: "SMTP / Resend Email",
  push_pwa: "Notifications Push PWA (Web Push)",
  denise_tts: "Synthèse vocale Denise TTS",
  service_worker: "Service Worker PWA (/sw.js)",
}

const SERVICE_IMPACTS: Record<string, string> = {
  db_primary:
    "CRITIQUE — Toutes les opérations de lecture/écriture sont impactées. Les utilisateurs peuvent voir des erreurs 500 sur l'ensemble de la plateforme.",
  mtarget_sms:
    "HAUTE — Les notifications SMS aux managers et staff ne sont plus envoyées. Les alertes temps réel (incidents aéroport) sont silencieuses.",
  whatsapp_api:
    "HAUTE — Les messages WhatsApp d'affectation d'incidents ne partent plus. Le staff n'est plus notifié des nouveaux signalements.",
  smtp_email:
    "MOYENNE — Les emails transactionnels (bienvenue, rapports IA, suivi rattrapage) sont retardés. Aucune alerte email ne part non plus.",
  push_pwa:
    "MOYENNE — Les notifications push \u00ABalways-on\u00BB vers les appareils staff ne sont plus délivrées. Le staff doit rouvrir la PWA manuellement.",
  denise_tts:
    "BASSE — La synthèse vocale côté client (PWA staff) est désactivée. Aucun impact sur les notifications écrites.",
  service_worker:
    "MOYENNE — La PWA staff ne peut plus fonctionner hors-ligne. Les alertes en cache ne sont plus synchronisées.",
}

const SERVICE_ACTIONS: Record<string, { label: string; href: string }[]> = {
  db_primary: [
    { label: "Voir les logs Prisma", href: `${baseUrl()}/superadmin/operations` },
    { label: "Redémarrer le serveur", href: `${baseUrl()}/superadmin/parametres` },
  ],
  mtarget_sms: [
    { label: "Configurer Mtarget", href: `${baseUrl()}/superadmin/modules` },
    { label: "Tester l'envoi SMS", href: `${baseUrl()}/superadmin/operations` },
  ],
  whatsapp_api: [
    { label: "Configurer WhatsApp", href: `${baseUrl()}/superadmin/modules` },
    { label: "Tester l'envoi WhatsApp", href: `${baseUrl()}/superadmin/operations` },
  ],
  smtp_email: [
    { label: "Configurer Resend", href: `${baseUrl()}/superadmin/email` },
    { label: "Envoyer un email test", href: `${baseUrl()}/superadmin/email` },
  ],
  push_pwa: [
    { label: "Voir les abonnements push", href: `${baseUrl()}/superadmin/operations` },
    { label: "Forcer la synchronisation", href: `${baseUrl()}/superadmin/operations` },
  ],
  denise_tts: [
    { label: "Centre Opérationnel", href: `${baseUrl()}/superadmin/operations` },
  ],
  service_worker: [
    { label: "Forcer la synchronisation", href: `${baseUrl()}/superadmin/operations` },
    { label: "Voir /sw.js", href: `${baseUrl()}/sw.js` },
  ],
}

function bouton(label: string, href: string): string {
  return `<a href="${href}" style="display:inline-block;background-color:${ROUGE_CRITIQUE};color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:10px 22px;border-radius:8px;margin-top:8px;">${escapeHtml(
    label
  )}</a>`
}

function buildCriticalAlertHtml(params: {
  serviceName: string
  errorMessage: string
  lastSuccess: string | null
  attempts: number
  impact: string
  globalStatus: { ok: number; warning: number; critical: number; status: string }
  detectedAt: Date
}): string {
  const {
    serviceName,
    errorMessage,
    lastSuccess,
    attempts,
    impact,
    globalStatus,
    detectedAt,
  } = params

  const serviceLabel = SERVICE_LABELS[serviceName] ?? serviceName
  const actions = SERVICE_ACTIONS[serviceName] ?? [
    { label: "Centre Opérationnel", href: `${baseUrl()}/superadmin/operations` },
  ]
  const defaultImpact = SERVICE_IMPACTS[serviceName] ?? "À évaluer par l'équipe d'astreinte."
  const impactTxt = impact?.trim() ? impact : defaultImpact

  const detectedTxt = detectedAt.toLocaleString("fr-FR", {
    dateStyle: "full",
    timeStyle: "medium",
  })
  const lastSuccessTxt = lastSuccess
    ? new Date(lastSuccess).toLocaleString("fr-FR", {
        dateStyle: "short",
        timeStyle: "short",
      })
    : "Aucun succès récent enregistré"

  const globalBadge =
    globalStatus.status === "critical"
      ? "CRITIQUE"
      : globalStatus.status === "warning"
        ? "DÉGRADÉ"
        : "OPÉRATIONNEL"
  const globalColor =
    globalStatus.status === "critical"
      ? ROUGE_CRITIQUE
      : globalStatus.status === "warning"
        ? "#d97706"
        : "#16a34a"

  const actionsHtml = actions
    .map((a) => bouton(a.label, a.href))
    .join('<br style="line-height:0;display:block;margin:8px 0;" />')

  const corps = `
    <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:${ROUGE_CRITIQUE};">🚨 Alerte Critique — ${escapeHtml(serviceLabel)}</h1>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:${GRIS_FONCE};">
      Le Centre Opérationnel FeedbackPro a détecté une défaillance critique sur
      l'un des services surveillés. Cette alerte est envoyée automatiquement.
    </p>

    <!-- Cartouche diagnostic -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#fef2f2;border:1px solid #fecaca;border-radius:10px;margin:0 0 20px;">
      <tr><td style="padding:20px 24px;">
        <p style="margin:0 0 12px;font-size:14px;color:#991b1b;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;">Diagnostic automatique</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding:6px 0;font-size:14px;color:${GRIS_MOYEN};width:35%;vertical-align:top;"><strong>Service affecté</strong></td>
            <td style="padding:6px 0;font-size:14px;color:${GRIS_FONCE};vertical-align:top;">${escapeHtml(serviceLabel)}<br /><span style="font-family:monospace;font-size:12px;color:${GRIS_CLAIR};">serviceName="${escapeHtml(serviceName)}"</span></td>
          </tr>
          <tr>
            <td style="padding:6px 0;font-size:14px;color:${GRIS_MOYEN};vertical-align:top;"><strong>Heure de détection</strong></td>
            <td style="padding:6px 0;font-size:14px;color:${GRIS_FONCE};vertical-align:top;">${escapeHtml(detectedTxt)}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;font-size:14px;color:${GRIS_MOYEN};vertical-align:top;"><strong>Sévérité</strong></td>
            <td style="padding:6px 0;font-size:14px;vertical-align:top;"><span style="display:inline-block;background-color:${ROUGE_CRITIQUE};color:#ffffff;font-weight:700;font-size:12px;padding:3px 10px;border-radius:4px;letter-spacing:0.5px;">CRITIQUE</span></td>
          </tr>
          <tr>
            <td style="padding:6px 0;font-size:14px;color:${GRIS_MOYEN};vertical-align:top;"><strong>Type d'erreur</strong></td>
            <td style="padding:6px 0;font-size:13px;color:${GRIS_FONCE};font-family:monospace;vertical-align:top;background-color:#ffffff;border-radius:4px;padding:8px 10px;border:1px solid #e7e5e4;">${escapeHtml(errorMessage || "Erreur non spécifiée")}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;font-size:14px;color:${GRIS_MOYEN};vertical-align:top;"><strong>Impact métier</strong></td>
            <td style="padding:6px 0;font-size:14px;color:${GRIS_FONCE};vertical-align:top;">${escapeHtml(impactTxt)}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;font-size:14px;color:${GRIS_MOYEN};vertical-align:top;"><strong>Dernier succès</strong></td>
            <td style="padding:6px 0;font-size:14px;color:${GRIS_FONCE};vertical-align:top;">${escapeHtml(lastSuccessTxt)}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;font-size:14px;color:${GRIS_MOYEN};vertical-align:top;"><strong>Tentatives</strong></td>
            <td style="padding:6px 0;font-size:14px;color:${GRIS_FONCE};vertical-align:top;">${attempts} alerte(s) non résolue(s) sur ce service</td>
          </tr>
        </table>
      </td></tr>
    </table>

    <!-- Statut global -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f5f4;border-radius:10px;margin:0 0 20px;">
      <tr><td style="padding:16px 24px;">
        <p style="margin:0 0 8px;font-size:13px;color:${GRIS_CLAIR};font-weight:700;letter-spacing:0.5px;text-transform:uppercase;">Statut système global</p>
        <p style="margin:0;font-size:18px;font-weight:700;color:${globalColor};">${globalBadge}</p>
        <p style="margin:4px 0 0;font-size:13px;color:${GRIS_MOYEN};">
          ${globalStatus.ok} OK · ${globalStatus.warning} WARNING · ${globalStatus.critical} CRITICAL
        </p>
      </td></tr>
    </table>

    <!-- Actions recommandées -->
    <h2 style="margin:0 0 12px;font-size:16px;color:${GRIS_FONCE};">Actions recommandées</h2>
    <p style="margin:0 0 12px;font-size:14px;line-height:1.7;color:${GRIS_MOYEN};">
      Les actions ci-dessous ouvrent les sections correspondantes du dashboard superadmin :
    </p>
    ${actionsHtml}

    <p style="margin:24px 0 0;font-size:12px;color:${GRIS_CLAIR};line-height:1.6;">
      Cet email a été envoyé automatiquement par le Centre Opérationnel FeedbackPro.
      Vous recevez cette alerte car le service <strong>${escapeHtml(serviceName)}</strong> est passé
      au statut <strong>CRITIQUE</strong>. Aucune action de votre part n'est requise pour réceptionner
      ce message — il vous suffit de diagnostiquer et résoudre l'incident.
    </p>`

  // Enveloppe commune (bleu remplacé par rouge pour les alertes critiques)
  return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>Alerte Critique — ${escapeHtml(serviceName)}</title></head>
<body style="margin:0;padding:0;background-color:#f5f5f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${GRIS_FONCE};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f5f4;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
        <tr><td style="background-color:${ROUGE_CRITIQUE};padding:20px 32px;">
          <p style="margin:0;font-size:18px;font-weight:700;color:#ffffff;">⚠ FeedbackPro — Centre Opérationnel</p>
          <p style="margin:4px 0 0;font-size:12px;color:#fee2e2;">Alerte automatique de défaillance service</p>
        </td></tr>
        <tr><td style="padding:28px 32px;">${corps}</td></tr>
        <tr><td style="background-color:#fafaf9;padding:16px 32px;border-top:1px solid #e7e5e4;">
          <p style="margin:0;font-size:11px;color:${GRIS_CLAIR};line-height:1.6;">
            © ${new Date().getFullYear()} FeedbackPro — Centre Opérationnel NOC.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

// ---------- API publique ----------

export type CriticalAlertContext = {
  lastSuccess?: string
  attempts?: number
  impact?: string
}

/**
 * Envoie un email d'alerte critique au superadmin pour le service donné.
 *
 * Étapes :
 *   1. Vérifie que le canal email est actif (NotificationSetting.canal = "email").
 *      Si inactif ou non configuré → on n'envoie pas (mais on logge).
 *   2. Construit le HTML de l'email avec le diagnostic structuré.
 *   3. Récupère l'email admin (env ADMIN_EMAIL ou premier user SUPERADMIN).
 *   4. Envoie via sendEmail() (Resend ou mode démo).
 *   5. Marque la ligne SystemHealthLog correspondante (alertSent = true).
 *
 * Aucune exception n'est propagée — un échec est loggé mais ne casse
 * pas le flux de health check qui l'a appelée.
 *
 * @param logId Optionnel — ID de la ligne SystemHealthLog à marquer alertSent=true
 */
export async function sendCriticalAlert(
  serviceName: string,
  errorMessage: string,
  context: CriticalAlertContext,
  logId?: string
): Promise<void> {
  try {
    // 1. Canal email actif ?
    const emailSetting = await getEmailNotificationSetting()
    if (!emailSetting || !emailSetting.active) {
      console.warn(
        `[critical-alert] Canal email inactif — alerte pour ${serviceName} non envoyée par email.`
      )
      // On marque quand même la ligne comme "traitée" pour éviter les retries infinis
      if (logId) await markAlertSent(logId)
      return
    }

    // 2. Diagnostic enrichi
    const [lastSuccess, attempts, globalStatus] = await Promise.all([
      lastOkDetectedAt(serviceName),
      countUnresolvedAlerts(serviceName),
      computeGlobalStatus(),
    ])

    // 3. Destinataire
    const adminEmail = await resolveAdminEmail()
    if (!adminEmail) {
      console.warn(
        "[critical-alert] Aucun email admin trouvé (ADMIN_EMAIL vide + aucun SUPERADMIN en base)"
      )
      if (logId) await markAlertSent(logId)
      return
    }

    // 4. Construction + envoi
    const detectedAt = new Date()
    const html = buildCriticalAlertHtml({
      serviceName,
      errorMessage,
      lastSuccess,
      attempts: attempts || context.attempts || 0,
      impact: context.impact ?? "",
      globalStatus,
      detectedAt,
    })
    const sujet = `[CRITIQUE] ${serviceName} — ${SERVICE_LABELS[serviceName] ?? "Service"} défaillant`

    const sent = await sendEmail(adminEmail, sujet, html)
    if (sent) {
      console.log(`[critical-alert] Email envoyé à ${adminEmail} pour ${serviceName}`)
      if (logId) await markAlertSent(logId)
    } else {
      console.error(`[critical-alert] Échec sendEmail pour ${serviceName} (${adminEmail})`)
    }
  } catch (e) {
    console.error("[critical-alert] Erreur inattendue (non bloquante)", e)
  }
}
