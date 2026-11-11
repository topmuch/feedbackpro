// ============================================================
// FeedbackPro — WhatsApp Ops Bot pour aéroport
// ------------------------------------------------------------
// Parseur de commandes entrantes WhatsApp envoyées par les équipes
// opérationnelles aéroport. Le webhook Twilio (/api/airport/whatsapp-webhook)
// reçoit les messages, extrait le numéro de l'expéditeur et appelle
// `handleAirportBotMessage` qui renvoie le texte de réponse.
//
// Sécurité : seuls les numéros présents dans AirportOpsContact avec
// `actif=true` reçoivent une réponse. Les autres reçoivent un message
// d'erreur "non autorisé".
//
// Formatage WhatsApp : *bold*, _italic_, ```code```. Réponses concises
// (≤ ~500 chars) avec emojis pour la lisibilité sur mobile.
// ============================================================

import { db } from '@/lib/db'
import { AIRPORT_ZONES, getZoneParCode } from '@/lib/airport-config'

export type BotResponse = {
  reply: string
  /** Indique que la commande a déclenché une action qui devrait alerter un humain (audit, escalade). */
  shouldAlert?: boolean
}

// ----------------------------------------------------------------
// Helpers de formatage
// ----------------------------------------------------------------

const STATUT_EMOJI: Record<string, string> = {
  EN_ATTENTE: '🟡',
  EN_COURS: '🔵',
  RESOLU: '🟢',
}

const STATUT_LABEL: Record<string, string> = {
  EN_ATTENTE: 'En attente',
  EN_COURS: 'En cours',
  RESOLU: 'Résolu',
}

function formatStatut(s: string): string {
  return `${STATUT_EMOJI[s] ?? '⚪'} ${STATUT_LABEL[s] ?? s}`
}

function formatDateFr(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function shortId(id: string): string {
  return id.length > 8 ? id.slice(-8) : id
}

function truncate(s: string, max = 80): string {
  if (s.length <= max) return s
  return s.slice(0, max - 1) + '…'
}

// ----------------------------------------------------------------
// Autorisation : numéro dans la liste blanche ops active
// ----------------------------------------------------------------

async function checkAuthorization(phone: string): Promise<boolean> {
  const contact = await db.airportOpsContact.findUnique({ where: { phone } })
  return !!contact && contact.actif === true
}

// ----------------------------------------------------------------
// Commandes
// ----------------------------------------------------------------

const HELP_TEXT = `*🤖 Bot Ops Aéroport*

Commandes disponibles :
• _/aide_ — cette aide
• _/priorites_ — top 3 zones à traiter (24h)
• _/zone <code>_ — état d'une zone (ex: /zone bagages)
• _/signalement <id>_ — détail d'un signalement
• _/encours <id>_ — prendre en charge un signalement (passe EN_COURS)
• _/resoudre <id>_ — marquer un signalement résolu
• _/stats_ — statistiques 24h
• _/liste_ — 5 signalements en attente

Codes zones : ${AIRPORT_ZONES.map((z) => z.code).join(', ')}`

async function cmdPriorites(): Promise<BotResponse> {
  const since = new Date(Date.now() - 24 * 3600 * 1000)
  // Comptage par zone des signalements EN_ATTENTE créés dans les 24h
  const reports = await db.airportReport.findMany({
    where: { statut: 'EN_ATTENTE', createdAt: { gte: since } },
    select: { zoneId: true, zone: { select: { code: true, nom: true, emoji: true } } },
  })

  if (reports.length === 0) {
    return { reply: '✅ Aucun signalement en attente dans les 24h. Bon travail !' }
  }

  const counts = new Map<string, { count: number; code: string; nom: string; emoji: string }>()
  for (const r of reports) {
    const key = r.zoneId
    const existing = counts.get(key)
    if (existing) {
      existing.count += 1
    } else {
      counts.set(key, {
        count: 1,
        code: r.zone.code,
        nom: r.zone.nom,
        emoji: r.zone.emoji,
      })
    }
  }

  const top = [...counts.values()].sort((a, b) => b.count - a.count).slice(0, 3)
  const lignes = ['*🔴 Top 3 zones à traiter (24h)*', '']
  top.forEach((z, i) => {
    lignes.push(`${i + 1}. ${z.emoji} ${z.nom} — *${z.count}* en attente`)
    lignes.push(`   → /zone ${z.code}`)
  })
  return { reply: lignes.join('\n') }
}

async function cmdZone(code: string): Promise<BotResponse> {
  const config = getZoneParCode(code)
  if (!config) {
    return {
      reply: `⚠️ Code zone inconnu : *${code}*

Codes valides : ${AIRPORT_ZONES.map((z) => z.code).join(', ')}`,
    }
  }
  const zone = await db.airportZone.findUnique({ where: { code } })
  if (!zone) {
    return { reply: `⚠️ Zone *${code}* non initialisée en base.` }
  }

  // Comptages par statut (24h)
  const since = new Date(Date.now() - 24 * 3600 * 1000)
  const [enAttente, enCours, resolu, recents] = await Promise.all([
    db.airportReport.count({ where: { zoneId: zone.id, statut: 'EN_ATTENTE' } }),
    db.airportReport.count({ where: { zoneId: zone.id, statut: 'EN_COURS' } }),
    db.airportReport.count({ where: { zoneId: zone.id, statut: 'RESOLU', createdAt: { gte: since } } }),
    db.airportReport.findMany({
      where: { zoneId: zone.id },
      orderBy: { createdAt: 'desc' },
      take: 3,
      include: { zone: { select: { code: true, nom: true, emoji: true } } },
    }),
  ])

  const lignes = [
    `${config.emoji} *${config.nom}*`,
    '',
    `*Bilan :* 🟡 ${enAttente} · 🔵 ${enCours} · 🟢 ${resolu} (24h)`,
    '',
    '*3 derniers signalements :*',
  ]
  if (recents.length === 0) {
    lignes.push('_(aucun)_')
  } else {
    for (const r of recents) {
      lignes.push(
        `• ${formatStatut(r.statut)} ${shortId(r.id)} — ${truncate(r.problemType, 50)}`,
      )
      lignes.push(`  ${formatDateFr(r.createdAt)} · /signalement ${shortId(r.id)}`)
    }
  }
  return { reply: lignes.join('\n') }
}

async function findReportByIdOrShort(idOrShort: string) {
  const trimmed = idOrShort.trim()
  // Tentative 1 : ID complet
  const direct = await db.airportReport.findUnique({
    where: { id: trimmed },
    include: { zone: { select: { code: true, nom: true, emoji: true } } },
  })
  if (direct) return direct
  // Tentative 2 : short id (suffixe de 8 chars)
  if (trimmed.length >= 4) {
    const matches = await db.airportReport.findMany({
      where: { id: { endsWith: trimmed } },
      take: 5,
      include: { zone: { select: { code: true, nom: true, emoji: true } } },
    })
    if (matches.length === 1) return matches[0]
    if (matches.length > 1) {
      return { ambiguous: true, count: matches.length, ids: matches.map((m) => m.id) }
    }
  }
  return null
}

async function cmdSignalement(idOrShort: string): Promise<BotResponse> {
  const report = await findReportByIdOrShort(idOrShort)
  if (!report) {
    return { reply: `⚠️ Signalement introuvable : *${idOrShort}*

Astuce : tapez /liste pour voir les ID récents.` }
  }
  if ('ambiguous' in report) {
    const lignes = [
      `⚠️ ${report.count} signalements correspondent à *${idOrShort}*. Soyez plus précis :`,
      '',
      ...report.ids.slice(0, 5).map((id) => `• /signalement ${id}`),
    ]
    return { reply: lignes.join('\n') }
  }
  const r = report
  const lignes = [
    `📋 *Signalement ${shortId(r.id)}*`,
    '',
    `*Zone :* ${r.zone.emoji} ${r.zone.nom} (${r.zone.code})`,
    `*Statut :* ${formatStatut(r.statut)}`,
    `*Problème :* ${r.problemType}`,
    `*Emplacement :* ${r.tagScanne}`,
    `*Créé :* ${formatDateFr(r.createdAt)}`,
  ]
  if (r.resolvedAt) {
    lignes.push(`*Résolu :* ${formatDateFr(r.resolvedAt)}`)
  }
  if (r.routedTeam) {
    lignes.push(`*Équipe :* ${r.routedTeam}`)
  }
  if (r.photoCategory) {
    lignes.push(`*Catégorie photo :* ${r.photoCategory}`)
  }
  if (r.flightNumber) {
    lignes.push(`*Vol :* ${r.flightNumber}`)
  }
  if (r.commentaire) {
    lignes.push(`*Précision :* _${truncate(r.commentaire, 200)}_`)
  }
  if (r.statut !== 'RESOLU') {
    lignes.push('', `→ /resoudre ${shortId(r.id)}`)
  }
  return { reply: lignes.join('\n') }
}

async function cmdResoudre(idOrShort: string, phone: string): Promise<BotResponse> {
  const report = await findReportByIdOrShort(idOrShort)
  if (!report) {
    return {
      reply: `⚠️ Signalement introuvable : *${idOrShort}*

Astuce : tapez /liste pour voir les ID récents.`,
    }
  }
  if ('ambiguous' in report) {
    return {
      reply: `⚠️ Plusieurs signalements correspondent à *${idOrShort}*. Précisez l'ID complet.`,
    }
  }
  if (report.statut === 'RESOLU') {
    return {
      reply: `ℹ️ Signalement ${shortId(report.id)} déjà résolu (le ${formatDateFr(report.resolvedAt ?? report.updatedAt)}).`,
    }
  }
  const now = new Date()
  await db.airportReport.update({
    where: { id: report.id },
    data: { statut: 'RESOLU', resolvedAt: now },
  })
  console.log(
    `[airport-bot] /resoudre ${report.id} par ${phone} — zone ${report.zone.code}`,
  )
  const notifVoyageur =
    report.whatsappOptin && report.whatsappPhone
      ? `\n\n📬 Notification voyageur programmée au ${report.whatsappPhone}.`
      : ''
  return {
    reply: `✅ *Résolu !*

Signalement ${shortId(report.id)}
${report.zone.emoji} ${report.zone.nom}
${report.problemType}
Résolu à ${formatDateFr(now)}${notifVoyageur}`,
    shouldAlert: true,
  }
}

// ----------------------------------------------------------------
// /encours <id> — marquer un signalement comme EN_COURS
// Délègue la mise à jour à POST /api/airport/ops/take-charge.
// ----------------------------------------------------------------

/**
 * Construit l'URL absolue d'une route API interne.
 * Le bot tourne dans le même process Next.js (port 3000),
 * on utilise donc http://localhost:3000 par défaut. La variable
 * NEXT_PUBLIC_APP_URL peut surcharger cela en production.
 */
function internalApiUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  return `${base}${path.startsWith('/') ? path : `/${path}`}`
}

async function cmdEnCours(idOrShort: string, phone: string): Promise<BotResponse> {
  const report = await findReportByIdOrShort(idOrShort)
  if (!report) {
    return {
      reply: `⚠️ Signalement introuvable : *${idOrShort}*

Astuce : tapez /liste pour voir les ID récents.`,
    }
  }
  if ('ambiguous' in report) {
    return {
      reply: `⚠️ Plusieurs signalements correspondent à *${idOrShort}*. Précisez l'ID complet.`,
    }
  }
  if (report.statut === 'RESOLU') {
    return {
      reply: `ℹ️ Signalement ${shortId(report.id)} déjà résolu (le ${formatDateFr(report.resolvedAt ?? report.updatedAt)}). Impossible de repasser en cours.`,
    }
  }
  if (report.statut === 'EN_COURS') {
    return {
      reply: `ℹ️ Signalement ${shortId(report.id)} déjà en cours de traitement.`,
    }
  }

  // Appel interne à POST /api/airport/ops/take-charge
  let apiOk = false
  let apiError = ''
  try {
    const res = await fetch(internalApiUrl('/api/airport/ops/take-charge'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reportId: report.id, phone }),
      cache: 'no-store',
    })
    const json = (await res.json()) as { ok?: boolean; error?: string }
    apiOk = Boolean(json?.ok)
    if (!apiOk) {
      apiError = typeof json?.error === 'string' ? json.error : `HTTP ${res.status}`
    }
  } catch (err) {
    apiError = err instanceof Error ? err.message : 'Erreur réseau'
  }

  if (!apiOk) {
    console.warn(
      `[airport-bot] /encours ${report.id} — échec API take-charge: ${apiError}`,
    )
    return {
      reply: `⚠️ Impossible de prendre en charge le signalement ${shortId(report.id)} (${apiError || 'erreur inconnue'}). Réessayez.`,
    }
  }

  console.log(
    `[airport-bot] /encours ${report.id} par ${phone} — zone ${report.zone.code}`,
  )
  return {
    reply: `🔵 *Pris en charge*

Signalement ${shortId(report.id)}
${report.zone.emoji} ${report.zone.nom}
${report.problemType}
Statut : EN COURS

→ /resoudre ${shortId(report.id)} quand c'est terminé`,
  }
}

async function cmdStats(): Promise<BotResponse> {
  const since = new Date(Date.now() - 24 * 3600 * 1000)
  const [total, enAttente, enCours, resolus] = await Promise.all([
    db.airportReport.count({ where: { createdAt: { gte: since } } }),
    db.airportReport.count({ where: { statut: 'EN_ATTENTE' } }),
    db.airportReport.count({ where: { statut: 'EN_COURS' } }),
    db.airportReport.count({ where: { statut: 'RESOLU', resolvedAt: { gte: since } } }),
  ])
  // Temps moyen de résolution (sur les résolus 24h)
  const resolusWithDates = await db.airportReport.findMany({
    where: { statut: 'RESOLU', resolvedAt: { gte: since }, createdAt: { gte: since } },
    select: { createdAt: true, resolvedAt: true },
  })
  let avgMin: number | null = null
  if (resolusWithDates.length > 0) {
    const totalMs = resolusWithDates.reduce((sum, r) => {
      const created = r.createdAt.getTime()
      const resolved = r.resolvedAt?.getTime() ?? created
      // Garde-fou : en cas de résolution avant création (données de test ou
      // migration), on borne à 0 pour éviter un temps moyen négatif.
      return sum + Math.max(0, resolved - created)
    }, 0)
    avgMin = Math.round(totalMs / resolusWithDates.length / 60000)
  }
  const lignes = [
    '*📊 Stats 24h*',
    '',
    `📝 Total signalements : *${total}*`,
    `🟡 En attente : *${enAttente}*`,
    `🔵 En cours : *${enCours}*`,
    `🟢 Résolus (24h) : *${resolus}*`,
  ]
  if (avgMin !== null) {
    lignes.push(`⏱️ Temps moyen résolution : *${avgMin} min*`)
  } else {
    lignes.push('⏱️ Temps moyen : _n/a_')
  }
  return { reply: lignes.join('\n') }
}

async function cmdListe(): Promise<BotResponse> {
  const recents = await db.airportReport.findMany({
    where: { statut: 'EN_ATTENTE' },
    orderBy: { createdAt: 'desc' },
    take: 5,
    include: { zone: { select: { code: true, nom: true, emoji: true } } },
  })
  if (recents.length === 0) {
    return { reply: '✅ Aucun signalement en attente. File propre !' }
  }
  const lignes = ['*📋 5 signalements en attente*', '']
  for (const r of recents) {
    lignes.push(`${r.zone.emoji} ${shortId(r.id)} — ${truncate(r.problemType, 45)}`)
    lignes.push(`  ${formatDateFr(r.createdAt)} · /signalement ${shortId(r.id)}`)
  }
  return { reply: lignes.join('\n') }
}

// ----------------------------------------------------------------
// Point d'entrée principal : parse + dispatch
// ----------------------------------------------------------------

export async function handleAirportBotMessage(
  fromPhone: string,
  body: string,
): Promise<BotResponse> {
  try {
    // 1. Autorisation : whitelist ops active
    const authorized = await checkAuthorization(fromPhone)
    if (!authorized) {
      return {
        reply:
          '⛔ Numéro non autorisé. Contactez l\'administrateur de l\'aéroport pour être ajouté à la liste ops.',
      }
    }

    const text = (body ?? '').trim()
    if (!text) {
      return { reply: 'Message vide. Tapez */aide* pour voir les commandes.' }
    }

    // 2. Parsing commande
    const lower = text.toLowerCase()
    const parts = text.split(/\s+/)
    const cmd = parts[0]?.toLowerCase() ?? ''

    // /aide | /help
    if (cmd === '/aide' || cmd === '/help' || lower === 'aide' || lower === 'help') {
      return { reply: HELP_TEXT }
    }

    // /priorites
    if (cmd === '/priorites' || cmd === '/priorités' || lower === '/priorites' || lower === '/priorités') {
      return await cmdPriorites()
    }

    // /zone <code>
    if (cmd === '/zone') {
      const code = parts[1] ?? ''
      if (!code) {
        return { reply: `⚠️ Usage : /zone <code>

Codes : ${AIRPORT_ZONES.map((z) => z.code).join(', ')}` }
      }
      return await cmdZone(code.toLowerCase())
    }

    // /signalement <id>
    if (cmd === '/signalement') {
      const id = parts.slice(1).join(' ').trim()
      if (!id) return { reply: '⚠️ Usage : /signalement <id>' }
      return await cmdSignalement(id)
    }

    // /resoudre <id>
    if (cmd === '/resoudre' || cmd === '/résoudre') {
      const id = parts.slice(1).join(' ').trim()
      if (!id) return { reply: '⚠️ Usage : /resoudre <id>' }
      return await cmdResoudre(id, fromPhone)
    }

    // /encours <id> — prendre en charge (statut → EN_COURS)
    if (cmd === '/encours' || cmd === '/encour' || cmd === '/en_cours') {
      const id = parts.slice(1).join(' ').trim()
      if (!id) {
        return { reply: '⚠️ Usage : /encours <id>\n\nAstuce : tapez /liste pour voir les ID récents.' }
      }
      return await cmdEnCours(id, fromPhone)
    }

    // /stats
    if (cmd === '/stats' || lower === '/stats') {
      return await cmdStats()
    }

    // /liste
    if (cmd === '/liste' || lower === '/liste') {
      return await cmdListe()
    }

    // Commande non reconnue
    return {
      reply: 'Commande non reconnue. Tapez */aide* pour voir les commandes.',
    }
  } catch (err) {
    console.error('[airport-bot] Erreur traitement message :', err)
    return {
      reply: '⚠️ Erreur temporaire, réessayez. Si le problème persiste, contactez l\'administrateur.',
    }
  }
}
