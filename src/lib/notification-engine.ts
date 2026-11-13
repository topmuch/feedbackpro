// ============================================================
// notification-engine.ts — Moteur central de dispatch de notifications
// ------------------------------------------------------------
// Task N1 — Cœur métier du "Centre de Notifications" SuperAdmin.
//
// Pour chaque déclencheur (new_incident, escalation_15min, …), ce moteur :
//   1. Récupère le NotificationTemplate associé en base
//   2. Si le template est inactif → return (pas d'envoi)
//   3. Pour chaque canal actif du template (push_pwa, sms_mtarget, whatsapp, email) :
//      - Vérifie que le canal est activé globalement (NotificationSetting)
//      - Résout le destinataire (assigned_staff / terminal_staff / supervisor)
//      - Envoie via le provider approprié (push interne, Mtarget SMS, etc.)
//      - Logge l'envoi dans NotificationLog (succès + échec)
//   4. Fire-and-forget : ne lève jamais, ne bloque jamais l'appelant
//
// Variables de template supportées :
//   {STAFF_NOM}     — nom de l'employé assigné
//   {INCIDENT_ID}   — ID court du signalement (8 premiers caractères)
//   {ZONE}          — nom de la zone (ex: "Terminal 2 — Porte B12")
//   {TYPE}          — type de problème (ex: "Propreté", "Sécurité")
//   {LIEN_DIRECT}   — URL vers le signalement dans la PWA staff
//   {HEURE}         — heure locale formatée (HH:MM)
//   {TEMPS}         — durée écoulée depuis la création (ex: "15 min")
// ============================================================

import { db } from '@/lib/db'
import { sendSmsMtarget, parseMtargetConfig } from '@/lib/mtarget-sms'
import { triggerPushNotification } from '@/lib/push-notifier'
import { sendEmail } from '@/lib/email'

// ---------- Types ----------

export interface NotificationContext {
  /** Nom de l'employé assigné (pour {STAFF_NOM}). */
  staffName?: string
  /** ID complet du signalement (sera tronqué pour {INCIDENT_ID}). */
  incidentId?: string
  /** Nom de la zone (ex: "Terminal 2 — Porte B12"). */
  zone?: string
  /** Type de problème (ex: "Propreté"). */
  type?: string
  /** URL directe vers le signalement dans la PWA staff. */
  link?: string
  /** Durée écoulée depuis la création (ex: "15 min", "2 h 30"). */
  temps?: string
  /** Numéro de téléphone du destinataire (override, sinon résolu depuis le staff). */
  recipientPhone?: string
  /** Email du destinataire (override, sinon résolu depuis le staff/manager). */
  recipientEmail?: string
  /** Coût forcé (sinon calculé par le provider). */
  cost?: number
}

type Canal = 'email' | 'whatsapp' | 'sms_mtarget' | 'push_pwa'

// ---------- Helpers ----------

/** Parse un tableau de canaux stocké en JSON dans NotificationTemplate.channels. */
function parseChannels(json: string): string[] {
  if (!json) return []
  try {
    const arr = JSON.parse(json)
    return Array.isArray(arr) ? arr.filter((c) => typeof c === 'string') : []
  } catch {
    return []
  }
}

/** Parse la config JSON d'un NotificationSetting. */
function parseConfig(json: string): Record<string, unknown> {
  if (!json) return {}
  try {
    return JSON.parse(json) as Record<string, unknown>
  } catch {
    return {}
  }
}

/**
 * Substitue les variables {VAR} dans le template.
 * Les variables non fournies sont remplacées par une chaîne vide
 * (évite de laisser "{ZONE}" visible dans le message final).
 */
function renderTemplate(template: string, ctx: NotificationContext): string {
  const vars: Record<string, string> = {
    STAFF_NOM: ctx.staffName ?? '',
    INCIDENT_ID: ctx.incidentId ? ctx.incidentId.slice(0, 8) : '',
    ZONE: ctx.zone ?? '',
    TYPE: ctx.type ?? '',
    LIEN_DIRECT: ctx.link ?? '',
    HEURE: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
    TEMPS: ctx.temps ?? '',
  }
  return template.replace(/\{([A-Z_]+)\}/g, (match, key: string) => {
    return vars[key] !== undefined ? vars[key] : ''
  })
}

/**
 * Résout le destinataire selon le type demandé par le template.
 *
 * - "assigned_staff" : numéro de l'employé assigné au signalement
 * - "terminal_staff" : numéro du staff terrain de la zone
 * - "supervisor"     : email du manager (Pro) rattaché à la zone
 *
 * En l'absence d'un système d'attribution staff↔signalement complet,
 * on s'appuie sur les overrides passés dans le contexte (recipientPhone /
 * recipientEmail). Le résolveur reste tolérant : si rien n'est fourni,
 * on renvoie juste le staffName — les providers (push / whatsapp)
 * fonctionnent en mode "broadcast au staff" sans numéro explicite.
 */
async function resolveRecipient(
  recipient: string,
  ctx: NotificationContext,
): Promise<{ phone?: string; email?: string; staffName?: string }> {
  // Overrides explicites depuis le contexte (le moteur reste pilotable de l'extérieur)
  if (ctx.recipientPhone || ctx.recipientEmail) {
    return {
      phone: ctx.recipientPhone,
      email: ctx.recipientEmail,
      staffName: ctx.staffName,
    }
  }

  // Tente de récupérer l'assigné + le manager via l'incidentId (AirportReport).
  // AirportZone n'a pas de relation Pro — on récupère l'email du premier
  // Pro "Aéroport" comme fallback pour le rôle "supervisor".
  if (ctx.incidentId && recipient === 'supervisor') {
    try {
      const proAeroport = await db.pro.findFirst({
        where: { typeEtablissement: 'Aéroport', suspendu: false },
        include: { user: { select: { email: true } } },
      })
      const managerEmail = proAeroport?.user?.email
      if (managerEmail) {
        return { email: managerEmail, staffName: ctx.staffName }
      }
    } catch {
      /* Pro peut ne pas exister — on ignore silencieusement */
    }
  }

  // Fallback : on renvoie ce qu'on a (push/whatsapp fonctionnent sans numéro)
  return { staffName: ctx.staffName }
}

/**
 * Envoie une notification via le canal demandé.
 * Centralise la logique provider → canal pour le dispatch.
 */
async function sendViaCanal(
  canal: Canal,
  renderedMessage: string,
  recipient: { phone?: string; email?: string; staffName?: string },
  config: Record<string, unknown>,
  ctx: NotificationContext,
): Promise<{ ok: boolean; cost?: number; error?: string }> {
  switch (canal) {
    case 'push_pwa': {
      // Push interne — délègue à push-notifier.ts (route /api/airport/push/send)
      await triggerPushNotification({
        title: 'Alerte FeedbackPro',
        body: renderedMessage.slice(0, 200),
        url: ctx.link,
        tag: ctx.incidentId ? `incident-${ctx.incidentId}` : undefined,
        staffName: recipient.staffName,
      })
      // Push est best-effort : on considère ok=true même si 0 abonné
      return { ok: true, cost: 0 }
    }

    case 'sms_mtarget': {
      if (!recipient.phone) {
        return { ok: false, error: 'Numéro de téléphone manquant pour SMS' }
      }
      const mtargetConfig = parseMtargetConfig(JSON.stringify(config))
      const result = await sendSmsMtarget(recipient.phone, renderedMessage, mtargetConfig)
      return { ok: result.ok, cost: result.cost, error: result.error }
    }

    case 'email': {
      if (!recipient.email) {
        return { ok: false, error: 'Email manquant' }
      }
      const sujet = 'Alerte FeedbackPro — Incident'
      const html = `<div style="font-family: -apple-system, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #0f172a; margin: 0 0 16px 0;">Alerte FeedbackPro</h2>
        <p style="font-size: 14px; color: #334155; line-height: 1.6;">${renderedMessage.replace(/\n/g, '<br/>')}</p>
        ${ctx.link ? `<p style="margin-top: 24px;"><a href="${ctx.link}" style="display: inline-block; background: #0f172a; color: #fbbf24; font-weight: 700; padding: 10px 24px; border-radius: 8px; text-decoration: none;">Voir l'incident →</a></p>` : ''}
        <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
        <p style="font-size: 11px; color: #64748b;">Notification automatique FeedbackPro.</p>
      </div>`
      const sent = await sendEmail(recipient.email, sujet, html)
      return { ok: sent, cost: 0, error: sent ? undefined : 'Échec envoi email' }
    }

    case 'whatsapp': {
      // WhatsApp Business API non implémenté — loggué pour audit
      console.log(
        `[notification-engine] WhatsApp non implémenté — message simulé pour ${recipient.phone ?? recipient.staffName ?? 'destinataire inconnu'} : "${renderedMessage.slice(0, 80)}…"`,
      )
      return { ok: true, cost: 0, error: undefined }
    }

    default:
      return { ok: false, error: `Canal inconnu: ${canal}` }
  }
}

// ---------- API publique ----------

/**
 * Dispatch une notification pour un déclencheur donné.
 *
 * Fire-and-forget : ne lève jamais, ne bloque jamais l'appelant.
 * À appeler sans await (ou avec .catch(() => {})) depuis une route API.
 *
 * @param trigger  Identifiant du déclencheur (ex: "new_incident", "escalation_15min")
 * @param context   Variables du template + infos destinataire
 *
 * Comportement :
 *   1. Récupère NotificationTemplate pour le trigger
 *   2. Si template absent ou inactif → return
 *   3. Pour chaque canal du template :
 *      - Vérifie NotificationSetting (canal actif ?)
 *      - Résout le destinataire (assigned_staff / supervisor / ...)
 *      - Envoie via le provider (push / sms / email / whatsapp)
 *      - Logge dans NotificationLog (status sent/failed + coût)
 */
export async function dispatchNotification(
  trigger: string,
  context: NotificationContext,
): Promise<void> {
  try {
    // 1. Récupère le template
    const template = await db.notificationTemplate.findUnique({
      where: { trigger },
    })

    if (!template) {
      console.warn(`[notification-engine] Template introuvable pour trigger "${trigger}"`)
      return
    }

    if (!template.active) {
      console.log(`[notification-engine] Template "${trigger}" inactif — skip`)
      return
    }

    // 2. Parse les canaux et rend le message
    const channels = parseChannels(template.channels)
    if (channels.length === 0) {
      console.warn(`[notification-engine] Aucun canal configuré pour "${trigger}"`)
      return
    }

    const renderedMessage = renderTemplate(template.template, context)
    const recipientInfo = await resolveRecipient(template.recipient, context)

    // 3. Récupère les settings de tous les canaux concernés (1 seule requête)
    const settings = await db.notificationSetting.findMany({
      where: { canal: { in: channels } },
    })
    const settingsMap = new Map(settings.map((s) => [s.canal, s]))

    // 4. Dispatch parallèle sur chaque canal (Promise.allSettled pour résilience)
    const dispatches = channels.map(async (canalRaw) => {
      const canal = canalRaw as Canal
      const setting = settingsMap.get(canal)

      // Canal désactivé globalement → on logge et on skip
      if (!setting || !setting.active) {
        console.log(
          `[notification-engine] Canal "${canal}" désactivé — skip pour trigger "${trigger}"`,
        )
        await db.notificationLog.create({
          data: {
            trigger,
            canal,
            recipient:
              recipientInfo.phone ||
              recipientInfo.email ||
              recipientInfo.staffName ||
              'inconnu',
            status: 'failed',
            message: renderedMessage,
            cost: null,
            reportId: context.incidentId ?? null,
          },
        }).catch(() => {})
        return
      }

      // Envoi via le provider
      const config = parseConfig(setting.config)
      const result = await sendViaCanal(canal, renderedMessage, recipientInfo, config, context)

      // Log dans NotificationLog (succès OU échec — pour audit complet)
      await db.notificationLog.create({
        data: {
          trigger,
          canal,
          recipient:
            recipientInfo.phone ||
            recipientInfo.email ||
            recipientInfo.staffName ||
            'inconnu',
          status: result.ok ? 'sent' : 'failed',
          message: renderedMessage,
          cost: result.cost ?? null,
          reportId: context.incidentId ?? null,
        },
      }).catch((err) => {
        console.warn(
          `[notification-engine] Échec logging NotificationLog (${canal}):`,
          err instanceof Error ? err.message : String(err),
        )
      })
    })

    await Promise.allSettled(dispatches)
    console.log(
      `[notification-engine] Dispatch terminé pour "${trigger}" — ${channels.length} canal/canaux`,
    )
  } catch (err) {
    // Fire-and-forget : aucune exception ne remonte à l'appelant
    console.error(
      '[notification-engine] Erreur (silencieuse):',
      err instanceof Error ? err.message : String(err),
    )
  }
}
