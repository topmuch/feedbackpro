// ============================================================
// FeedbackPro - Webhooks sortants (Slack / Discord) (Task 6)
// ------------------------------------------------------------
// envoyerWebhook(url, type, donnees) :
//   - url    : URL webhook (Slack ou Discord)
//   - type   : "slack" | "discord" — adapte le payload au format attendu
//   - donnees : { eventType, titre, message, fields, color, url? }
//
// Événements déclencheurs (cf. POST /api/retour + cron rapports) :
//   - "retour_negatif"  : nouveau retour ≤ 2★ (alerte prioritaire, rouge)
//   - "retour_nouveau"  : nouveau retour tout court (vert)
//   - "rapport_ia"      : rapport IA disponible (bleu)
//
// Sécurité :
//   - Timeout 5 s (le webhook ne doit jamais bloquer le flux principal)
//   - Strictement non bloquant : un échec est loggué et ignoré
//   - Aucune donnée personnelle sensible (RGPD) : seule la note, le tag et
//     un lien vers le dashboard sont transmis.
// ============================================================

import { tagLabel } from "@/lib/constants"
import { getModuleActif, MODULE_KEYS } from "@/lib/modules"

export type WebhookType = "slack" | "discord"

export type WebhookEvent =
  | "retour_negatif"
  | "retour_nouveau"
  | "rapport_ia"

export type WebhookDonnees = {
  eventType: WebhookEvent
  /** Titre court (ex : "🚨 Nouveau retour négatif") */
  titre: string
  /** Message principal (ex : "Note 1/5 sur la zone « Accueil »") */
  message: string
  /** Champs structurés (paires clé/valeur) affichés sous le message */
  fields?: { key: string; value: string }[]
  /** Couleur de la bande gauche (hex sans #, ex : "dc2626" pour rouge) */
  color?: string
  /** Lien optionnel vers le dashboard FeedbackPro */
  url?: string
  /** Nom de l'établissement (contexte) */
  nomEtablissement?: string
}

/** Couleurs par défaut selon l'événement (hex sans # pour Discord, hex complet pour Slack) */
const COULEURS: Record<WebhookEvent, string> = {
  retour_negatif: "dc2626", // rouge
  retour_nouveau: "16a34a", // vert
  rapport_ia: "2563eb", // bleu
}

/** Construit le payload Slack (text + blocks) */
function payloadSlack(d: WebhookDonnees): Record<string, unknown> {
  const color = d.color || COULEURS[d.eventType]
  const fields = (d.fields ?? []).map((f) => ({
    type: "mrkdwn",
    text: `*${f.key}*\n${f.value}`,
  }))
  const blocks: unknown[] = [
    {
      type: "header",
      text: { type: "plain_text", text: d.titre },
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: d.message },
    },
  ]
  if (fields.length > 0) {
    blocks.push({
      type: "section",
      fields,
    })
  }
  if (d.nomEtablissement || d.url) {
    const contextItems: unknown[] = []
    if (d.nomEtablissement) {
      contextItems.push({ type: "mrkdwn", text: `🏢 ${d.nomEtablissement}` })
    }
    if (d.url) {
      contextItems.push({ type: "mrkdwn", text: `<${d.url}|Voir le dashboard →>` })
    }
    blocks.push({ type: "context", elements: contextItems })
  }
  // Attachement coloré (bande de couleur à gauche)
  return {
    text: d.titre,
    attachments: [
      {
        color: `#${color}`,
        blocks,
      },
    ],
  }
}

/** Construit le payload Discord (embeds) */
function payloadDiscord(d: WebhookDonnees): Record<string, unknown> {
  const color = parseInt(d.color || COULEURS[d.eventType], 16)
  const fields = (d.fields ?? []).map((f) => ({
    name: f.key,
    value: f.value,
    inline: false,
  }))
  const embed: Record<string, unknown> = {
    title: d.titre,
    description: d.message,
    color,
    timestamp: new Date().toISOString(),
    fields: fields.length > 0 ? fields : undefined,
  }
  if (d.url) {
    embed.url = d.url
  }
  if (d.nomEtablissement) {
    embed.footer = { text: `🏢 ${d.nomEtablissement}` }
  }
  return {
    username: "FeedbackPro",
    embeds: [embed],
  }
}

/**
 * Envoie un webhook (Slack ou Discord) — strictement non bloquant.
 *
 * @param url  URL du webhook
 * @param type "slack" | "discord"
 * @param d    Données de l'événement
 * @returns true si envoyé avec succès, false sinon (jamais d'exception)
 */
export async function envoyerWebhook(
  url: string,
  type: WebhookType,
  d: WebhookDonnees
): Promise<boolean> {
  if (!url) return false
  try {
    const payload = type === "slack" ? payloadSlack(d) : payloadDiscord(d)
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) {
      const detail = await res.text().catch(() => "")
      console.warn(
        `[Webhook ${type}] Échec ${res.status} : ${detail.slice(0, 200)}`
      )
      return false
    }
    return true
  } catch (e) {
    console.warn(`[Webhook ${type}] Erreur non bloquante`, e)
    return false
  }
}

/**
 * Helper de haut niveau : envoie un webhook à toutes les URLs configurées
 * d'un Pro (Slack + Discord) pour un événement donné.
 *
 * Module "webhooks_sortants" : si le module est DÉSACTIVÉ, cette fonction
 * devient un no-op (aucun envoi, log d'info). Le toggle est géré côté
 * superadmin (onglet Modules) et le cache mémoire de src/lib/modules.ts
 * garantit une réactivité < 30 s.
 *
 * @param pro Pro cible (doit contenir webhookSlackUrl, webhookDiscordUrl,
 *            nomEtablissement)
 * @param d   Données de l'événement (sans nomEtablissement, ajouté automatiquement)
 */
export async function notifierWebhooksPro(
  pro: {
    webhookSlackUrl?: string | null
    webhookDiscordUrl?: string | null
    nomEtablissement: string
  },
  d: Omit<WebhookDonnees, "nomEtablissement">
): Promise<void> {
  // Module webhooks_sortants désactivé → no-op
  const moduleActif = await getModuleActif(MODULE_KEYS.WEBHOOKS_SORTANTS)
  if (!moduleActif) {
    console.log("[Webhooks] Module webhooks_sortants désactivé — envoi ignoré")
    return
  }
  const donnees: WebhookDonnees = {
    ...d,
    nomEtablissement: pro.nomEtablissement,
  }
  const tasks: Promise<boolean>[] = []
  if (pro.webhookSlackUrl) tasks.push(envoyerWebhook(pro.webhookSlackUrl, "slack", donnees))
  if (pro.webhookDiscordUrl) tasks.push(envoyerWebhook(pro.webhookDiscordUrl, "discord", donnees))
  // Parallèle, on n'attend pas réellement le résultat côté appelant
  await Promise.allSettled(tasks)
}

/**
 * Construit les données standardisées d'un événement "nouveau retour"
 * (utilisé par POST /api/retour).
 */
export function donneesNouveauRetour(params: {
  negatif: boolean
  note: number
  zoneNom: string
  tags: string[]
  commentaire?: string | null
  employeNom?: string | null
}): WebhookDonnees {
  const { negatif, note, zoneNom, tags, commentaire, employeNom } = params
  const fields: { key: string; value: string }[] = [
    { key: "Note", value: `${note}/5 ${"⭐".repeat(note)}` },
    { key: "Zone", value: zoneNom },
  ]
  if (tags.length > 0) {
    fields.push({ key: "Tags", value: tags.map((t) => `\`${t}\``).join(" ") })
  }
  if (employeNom) {
    fields.push({ key: "Employé mentionné", value: employeNom })
  }
  if (commentaire) {
    fields.push({ key: "Commentaire", value: commentaire.slice(0, 280) })
  }
  return {
    eventType: negatif ? "retour_negatif" : "retour_nouveau",
    titre: negatif ? "🚨 Nouveau retour négatif" : "💬 Nouveau retour client",
    message: `Note ${note}/5 laissée sur la zone « ${zoneNom } »`,
    fields,
    url: process.env.NEXT_PUBLIC_APP_URL
      ? `${process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/dashboard/retours`
      : undefined,
  }
}

/**
 * Construit les données d'un événement "rapport IA disponible"
 * (utilisé par le cron quotidien / hebdomadaire).
 */
export function donneesRapportIA(params: {
  type: string
  scoreGlobal: number
  periodeDebut: Date | string
  periodeFin: Date | string
}): WebhookDonnees {
  const { type, scoreGlobal, periodeDebut, periodeFin } = params
  const periodeTxt = `${new Date(periodeDebut).toLocaleDateString("fr-FR")} → ${new Date(periodeFin).toLocaleDateString("fr-FR")}`
  return {
    eventType: "rapport_ia",
    titre: "🤖 Nouveau rapport Coach IA disponible",
    message: `Rapport ${type} — score qualité ${scoreGlobal}/100`,
    fields: [
      { key: "Période", value: periodeTxt },
      { key: "Score", value: `${scoreGlobal}/100` },
    ],
    url: process.env.NEXT_PUBLIC_APP_URL
      ? `${process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/dashboard/coach`
      : undefined,
  }
}

// Réexporte tagLabel pour faciliter l'usage depuis les API routes
export { tagLabel }
